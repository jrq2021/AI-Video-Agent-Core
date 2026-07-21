"""Durable, single-consumer batch parsing jobs."""

import sqlite3
import time
import uuid
from contextlib import closing
from pathlib import Path
from typing import Any, Callable, Dict, Optional

from membership import check_and_consume_quota, refund_quota_once
from parse_history import ParseHistoryStore, parse_history_store


DEFAULT_DB_PATH = Path(__file__).parent / "data" / "batch_jobs.db"
ACTIVE_STATUSES = ("queued", "running")
TERMINAL_STATUSES = ("completed", "failed")


def _now() -> int:
    return int(time.time())


class BatchJobStore:
    def __init__(self, db_path: Path = DEFAULT_DB_PATH):
        self.db_path = Path(db_path)
        self.db_path.parent.mkdir(parents=True, exist_ok=True)

    def _connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(str(self.db_path))
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA journal_mode=WAL")
        return conn

    def init_db(self) -> None:
        with closing(self._connect()) as conn, conn:
            conn.execute(
                """CREATE TABLE IF NOT EXISTS batch_jobs (
                    id TEXT PRIMARY KEY,
                    user_id TEXT NOT NULL,
                    status TEXT NOT NULL DEFAULT 'queued',
                    total_count INTEGER NOT NULL,
                    completed_count INTEGER NOT NULL DEFAULT 0,
                    failed_count INTEGER NOT NULL DEFAULT 0,
                    created_at INTEGER NOT NULL,
                    updated_at INTEGER NOT NULL
                )"""
            )
            conn.execute(
                """CREATE TABLE IF NOT EXISTS batch_job_items (
                    id TEXT PRIMARY KEY,
                    job_id TEXT NOT NULL,
                    position INTEGER NOT NULL,
                    url TEXT NOT NULL,
                    status TEXT NOT NULL DEFAULT 'queued',
                    title TEXT NOT NULL DEFAULT '',
                    record_key TEXT NOT NULL DEFAULT '',
                    error_message TEXT NOT NULL DEFAULT '',
                    quota_charged INTEGER NOT NULL DEFAULT 0,
                    quota_refunded INTEGER NOT NULL DEFAULT 0,
                    created_at INTEGER NOT NULL,
                    started_at INTEGER NOT NULL DEFAULT 0,
                    finished_at INTEGER NOT NULL DEFAULT 0,
                    UNIQUE(job_id, position)
                )"""
            )
            conn.execute(
                "CREATE INDEX IF NOT EXISTS idx_batch_jobs_user_updated ON batch_jobs (user_id, updated_at DESC)"
            )
            conn.execute(
                "CREATE INDEX IF NOT EXISTS idx_batch_job_items_claim ON batch_job_items (status, created_at, position)"
            )

    @staticmethod
    def _row_to_item(row: sqlite3.Row) -> Dict[str, Any]:
        return {
            "id": row["id"],
            "job_id": row["job_id"],
            "position": row["position"],
            "url": row["url"],
            "status": row["status"],
            "title": row["title"] or "",
            "record_key": row["record_key"] or "",
            "error_message": row["error_message"] or "",
            "quota_charged": bool(row["quota_charged"]),
            "quota_refunded": bool(row["quota_refunded"]),
            "created_at": row["created_at"],
            "started_at": row["started_at"],
            "finished_at": row["finished_at"],
            **({"user_id": row["user_id"]} if "user_id" in row.keys() else {}),
        }

    @staticmethod
    def _row_to_job(row: sqlite3.Row) -> Dict[str, Any]:
        return {
            "id": row["id"],
            "user_id": row["user_id"],
            "status": row["status"],
            "total_count": row["total_count"],
            "completed_count": row["completed_count"],
            "failed_count": row["failed_count"],
            "created_at": row["created_at"],
            "updated_at": row["updated_at"],
        }

    def _build_job(self, conn: sqlite3.Connection, row: sqlite3.Row, include_items: bool = True) -> Dict[str, Any]:
        job = self._row_to_job(row)
        if include_items:
            item_rows = conn.execute(
                "SELECT * FROM batch_job_items WHERE job_id=? ORDER BY position ASC",
                (job["id"],),
            ).fetchall()
            job["items"] = [self._row_to_item(item) for item in item_rows]
        return job

    def create_job(self, user_id: str, urls: list[str], max_items: int) -> Dict[str, Any]:
        normalized_urls = [str(url).strip() for url in urls if str(url).strip()]
        if not normalized_urls:
            raise ValueError("At least one URL is required")
        if len(normalized_urls) > max(0, int(max_items)):
            raise ValueError("Batch size exceeds the membership limit")

        now = _now()
        job_id = uuid.uuid4().hex
        with closing(self._connect()) as conn, conn:
            active = conn.execute(
                "SELECT id FROM batch_jobs WHERE user_id=? AND status IN ('queued', 'running') LIMIT 1",
                (user_id,),
            ).fetchone()
            if active:
                raise ValueError("An active batch job already exists")

            conn.execute(
                """INSERT INTO batch_jobs
                   (id, user_id, status, total_count, completed_count, failed_count, created_at, updated_at)
                   VALUES (?, ?, 'queued', ?, 0, 0, ?, ?)""",
                (job_id, user_id, len(normalized_urls), now, now),
            )
            conn.executemany(
                """INSERT INTO batch_job_items
                   (id, job_id, position, url, status, created_at)
                   VALUES (?, ?, ?, ?, 'queued', ?)""",
                [
                    (uuid.uuid4().hex, job_id, position, url, now)
                    for position, url in enumerate(normalized_urls)
                ],
            )
            row = conn.execute("SELECT * FROM batch_jobs WHERE id=?", (job_id,)).fetchone()
            return self._build_job(conn, row)

    def list_jobs(self, user_id: str) -> list[Dict[str, Any]]:
        with closing(self._connect()) as conn:
            rows = conn.execute(
                "SELECT * FROM batch_jobs WHERE user_id=? ORDER BY updated_at DESC, created_at DESC",
                (user_id,),
            ).fetchall()
            return [self._build_job(conn, row, include_items=False) for row in rows]

    def get_job(self, user_id: str, job_id: str) -> Optional[Dict[str, Any]]:
        with closing(self._connect()) as conn:
            row = conn.execute(
                "SELECT * FROM batch_jobs WHERE id=? AND user_id=?",
                (job_id, user_id),
            ).fetchone()
            return self._build_job(conn, row) if row else None

    def claim_next_item(self) -> Optional[Dict[str, Any]]:
        now = _now()
        with closing(self._connect()) as conn, conn:
            row = conn.execute(
                """SELECT item.*, job.user_id
                   FROM batch_job_items AS item
                   JOIN batch_jobs AS job ON job.id=item.job_id
                   WHERE item.status='queued' AND job.status IN ('queued', 'running')
                   ORDER BY job.created_at ASC, item.position ASC
                   LIMIT 1"""
            ).fetchone()
            if not row:
                return None
            cur = conn.execute(
                """UPDATE batch_job_items
                   SET status='running', started_at=?
                   WHERE id=? AND status='queued'""",
                (now, row["id"]),
            )
            if cur.rowcount != 1:
                return None
            conn.execute(
                "UPDATE batch_jobs SET status='running', updated_at=? WHERE id=?",
                (now, row["job_id"]),
            )
            claimed = dict(row)
            claimed["status"] = "running"
            claimed["started_at"] = now
            return self._row_to_item(claimed)

    def _refresh_job(self, conn: sqlite3.Connection, job_id: str) -> None:
        counts = conn.execute(
            """SELECT
                 SUM(CASE WHEN status='completed' THEN 1 ELSE 0 END) AS completed_count,
                 SUM(CASE WHEN status='failed' THEN 1 ELSE 0 END) AS failed_count,
                 SUM(CASE WHEN status IN ('queued', 'running') THEN 1 ELSE 0 END) AS active_count
               FROM batch_job_items WHERE job_id=?""",
            (job_id,),
        ).fetchone()
        if counts["active_count"]:
            status = "running"
        elif counts["failed_count"]:
            status = "failed"
        else:
            status = "completed"
        conn.execute(
            """UPDATE batch_jobs
               SET status=?, completed_count=?, failed_count=?, updated_at=?
               WHERE id=?""",
            (status, counts["completed_count"] or 0, counts["failed_count"] or 0, _now(), job_id),
        )

    def mark_item_done(self, item_id: str, title: str, record_key: str) -> Dict[str, Any]:
        now = _now()
        with closing(self._connect()) as conn, conn:
            item = conn.execute("SELECT * FROM batch_job_items WHERE id=?", (item_id,)).fetchone()
            if not item:
                raise KeyError("Batch item not found")
            conn.execute(
                """UPDATE batch_job_items
                   SET status='completed', title=?, record_key=?, error_message='', quota_charged=1, finished_at=?
                   WHERE id=? AND status='running'""",
                (title or "", record_key or "", now, item_id),
            )
            self._refresh_job(conn, item["job_id"])
            updated = conn.execute("SELECT * FROM batch_job_items WHERE id=?", (item_id,)).fetchone()
            return self._row_to_item(updated)

    def mark_item_failed(
        self,
        item_id: str,
        error: str,
        quota_charged: bool = False,
        quota_refunded: bool = False,
    ) -> Dict[str, Any]:
        now = _now()
        with closing(self._connect()) as conn, conn:
            item = conn.execute("SELECT * FROM batch_job_items WHERE id=?", (item_id,)).fetchone()
            if not item:
                raise KeyError("Batch item not found")
            conn.execute(
                """UPDATE batch_job_items
                   SET status='failed', error_message=?, quota_charged=?, quota_refunded=?, finished_at=?
                   WHERE id=? AND status='running'""",
                (str(error)[:500], int(quota_charged), int(quota_refunded), now, item_id),
            )
            self._refresh_job(conn, item["job_id"])
            updated = conn.execute("SELECT * FROM batch_job_items WHERE id=?", (item_id,)).fetchone()
            return self._row_to_item(updated)

    def requeue_interrupted_items(self) -> int:
        with closing(self._connect()) as conn, conn:
            rows = conn.execute("SELECT DISTINCT job_id FROM batch_job_items WHERE status='running'").fetchall()
            cur = conn.execute("UPDATE batch_job_items SET status='queued', started_at=0 WHERE status='running'")
            for row in rows:
                conn.execute("UPDATE batch_jobs SET status='queued', updated_at=? WHERE id=?", (_now(), row["job_id"]))
            return cur.rowcount


class BatchProcessor:
    def __init__(self, store: BatchJobStore, history_store: ParseHistoryStore = parse_history_store):
        self.store = store
        self.history_store = history_store

    def process_item(
        self,
        item: Dict[str, Any],
        parse: Optional[Callable[[str], Dict[str, Any]]] = None,
    ) -> Dict[str, Any]:
        quota = check_and_consume_quota(
            item["user_id"],
            "batch_parse",
            video_url=item["url"],
            audit_key=item["id"],
        )
        if not quota.get("allowed"):
            return self.store.mark_item_failed(item["id"], quota.get("reason", "Batch quota unavailable"))

        try:
            if parse is None:
                from summarizer import parse_video
                parse = parse_video
            parsed = parse(item["url"])
            record_key = f"batch-{item['id']}"
            record = self.history_store.upsert(
                item["user_id"],
                {
                    "record_key": record_key,
                    "title": parsed.get("title", ""),
                    "url": item["url"],
                },
                {
                    "subtitles": parsed.get("subtitles", ""),
                    "segments": parsed.get("segments", []),
                    "language": parsed.get("language", ""),
                    "subtitle_type": parsed.get("subtitle_type", ""),
                },
            )
            return self.store.mark_item_done(item["id"], record.get("title", ""), record_key)
        except Exception as exc:
            refunded = refund_quota_once(
                item["user_id"],
                "batch_items",
                item["id"],
                str(exc),
            )
            return self.store.mark_item_failed(item["id"], str(exc), quota_charged=True, quota_refunded=refunded)

    def run_once(self) -> Optional[Dict[str, Any]]:
        item = self.store.claim_next_item()
        return self.process_item(item) if item else None


batch_job_store = BatchJobStore()


def init_batch_jobs_db() -> None:
    batch_job_store.init_db()
    batch_job_store.requeue_interrupted_items()
