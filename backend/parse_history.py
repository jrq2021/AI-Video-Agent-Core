import json
import sqlite3
import time
from contextlib import closing
from pathlib import Path
from typing import Any, Dict, Optional


DEFAULT_DB_PATH = Path(__file__).parent / "data" / "parse_history.db"
DEFAULT_MAX_RECORDS = 50
MAX_SUBTITLE_CHARS = 500_000
MAX_SUMMARY_CHARS = 120_000
MAX_MINDMAP_CHARS = 120_000
MAX_SEGMENTS_BYTES = 1_500_000
MAX_CREATOR_PACK_BYTES = 120_000

ARTIFACT_FIELDS = {
    "subtitles",
    "segments",
    "language",
    "subtitle_type",
    "summary_text",
    "mindmap_text",
    "translated_segments",
    "translation_language",
    "creator_pack",
}


def _now() -> int:
    return time.time_ns()


def _validate_record_key(record_key: str) -> str:
    value = str(record_key or "").strip()
    if not value or len(value) > 160:
        raise ValueError("无效的解析记录标识")
    if any(character not in "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_-" for character in value):
        raise ValueError("解析记录标识包含非法字符")
    return value


def _validate_artifacts(artifacts: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    clean = {
        key: value
        for key, value in (artifacts or {}).items()
        if key in ARTIFACT_FIELDS and value is not None
    }

    text_limits = {
        "subtitles": MAX_SUBTITLE_CHARS,
        "summary_text": MAX_SUMMARY_CHARS,
        "mindmap_text": MAX_MINDMAP_CHARS,
        "language": 64,
        "subtitle_type": 64,
        "translation_language": 64,
    }
    for field, limit in text_limits.items():
        if field in clean:
            clean[field] = str(clean[field])
            if len(clean[field]) > limit:
                raise ValueError(f"{field} 内容过大")

    if "segments" in clean:
        if not isinstance(clean["segments"], list):
            raise ValueError("segments 必须是数组")
        encoded = json.dumps(clean["segments"], ensure_ascii=False)
        if len(encoded.encode("utf-8")) > MAX_SEGMENTS_BYTES:
            raise ValueError("segments 内容过大")

    if "translated_segments" in clean:
        if not isinstance(clean["translated_segments"], list):
            raise ValueError("translated_segments must be a list")
        encoded = json.dumps(clean["translated_segments"], ensure_ascii=False)
        if len(encoded.encode("utf-8")) > MAX_SEGMENTS_BYTES:
            raise ValueError("translated_segments is too large")

    if "creator_pack" in clean:
        if not isinstance(clean["creator_pack"], dict):
            raise ValueError("creator_pack must be an object")
        encoded = json.dumps(clean["creator_pack"], ensure_ascii=False)
        if len(encoded.encode("utf-8")) > MAX_CREATOR_PACK_BYTES:
            raise ValueError("creator_pack is too large")

    return clean


class ParseHistoryStore:
    def __init__(self, db_path: Path = DEFAULT_DB_PATH, max_records: int = DEFAULT_MAX_RECORDS):
        self.db_path = Path(db_path)
        self.max_records = max(1, int(max_records))
        self.db_path.parent.mkdir(parents=True, exist_ok=True)

    def _connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(str(self.db_path))
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA journal_mode=WAL")
        return conn

    @staticmethod
    def _ensure_column(conn: sqlite3.Connection, table: str, name: str, definition: str) -> None:
        columns = {row["name"] for row in conn.execute(f"PRAGMA table_info({table})")}
        if name not in columns:
            conn.execute(f"ALTER TABLE {table} ADD COLUMN {name} {definition}")

    def init_db(self) -> None:
        with closing(self._connect()) as conn, conn:
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS parse_history (
                    user_id TEXT NOT NULL,
                    record_key TEXT NOT NULL,
                    video_json TEXT NOT NULL DEFAULT '{}',
                    subtitles TEXT NOT NULL DEFAULT '',
                    segments_json TEXT NOT NULL DEFAULT '[]',
                    language TEXT NOT NULL DEFAULT '',
                    subtitle_type TEXT NOT NULL DEFAULT '',
                    summary_text TEXT NOT NULL DEFAULT '',
                    mindmap_text TEXT NOT NULL DEFAULT '',
                    translated_segments_json TEXT NOT NULL DEFAULT '[]',
                    translation_language TEXT NOT NULL DEFAULT '',
                    creator_pack_json TEXT NOT NULL DEFAULT '{}',
                    created_at INTEGER NOT NULL,
                    updated_at INTEGER NOT NULL,
                    PRIMARY KEY (user_id, record_key)
                )
                """
            )
            self._ensure_column(conn, "parse_history", "translated_segments_json", "TEXT NOT NULL DEFAULT '[]'")
            self._ensure_column(conn, "parse_history", "translation_language", "TEXT NOT NULL DEFAULT ''")
            self._ensure_column(conn, "parse_history", "creator_pack_json", "TEXT NOT NULL DEFAULT '{}'")
            conn.execute(
                """
                CREATE INDEX IF NOT EXISTS idx_parse_history_user_updated
                ON parse_history (user_id, updated_at DESC)
                """
            )

    def _row_to_record(self, row: sqlite3.Row) -> Dict[str, Any]:
        video = json.loads(row["video_json"] or "{}")
        return {
            **video,
            "record_key": row["record_key"],
            "subtitles": row["subtitles"] or "",
            "segments": json.loads(row["segments_json"] or "[]"),
            "language": row["language"] or "",
            "subtitle_type": row["subtitle_type"] or "",
            "summary_text": row["summary_text"] or "",
            "mindmap_text": row["mindmap_text"] or "",
            "translated_segments": json.loads(row["translated_segments_json"] or "[]"),
            "translation_language": row["translation_language"] or "",
            "creator_pack": json.loads(row["creator_pack_json"] or "{}"),
            "created_at": row["created_at"],
            "updated_at": row["updated_at"],
        }

    def get_record(self, user_id: str, record_key: str) -> Optional[Dict[str, Any]]:
        key = _validate_record_key(record_key)
        with closing(self._connect()) as conn:
            row = conn.execute(
                "SELECT * FROM parse_history WHERE user_id=? AND record_key=?",
                (user_id, key),
            ).fetchone()
        return self._row_to_record(row) if row else None

    def list_records(self, user_id: str) -> list[Dict[str, Any]]:
        with closing(self._connect()) as conn:
            rows = conn.execute(
                """
                SELECT * FROM parse_history
                WHERE user_id=?
                ORDER BY updated_at DESC
                LIMIT ?
                """,
                (user_id, self.max_records),
            ).fetchall()
        return [self._row_to_record(row) for row in rows]

    def upsert(
        self,
        user_id: str,
        video: Dict[str, Any],
        artifacts: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        key = _validate_record_key(video.get("record_key", ""))
        artifact_patch = _validate_artifacts(artifacts)
        now = _now()

        with closing(self._connect()) as conn, conn:
            existing = conn.execute(
                "SELECT * FROM parse_history WHERE user_id=? AND record_key=?",
                (user_id, key),
            ).fetchone()
            existing_video = json.loads(existing["video_json"] or "{}") if existing else {}
            merged_video = {
                **existing_video,
                **{
                    field: value
                    for field, value in video.items()
                    if field != "record_key" and value is not None
                },
            }

            existing_artifacts = (
                {
                    "subtitles": existing["subtitles"],
                    "segments": json.loads(existing["segments_json"] or "[]"),
                    "language": existing["language"],
                    "subtitle_type": existing["subtitle_type"],
                    "summary_text": existing["summary_text"],
                    "mindmap_text": existing["mindmap_text"],
                    "translated_segments": json.loads(existing["translated_segments_json"] or "[]"),
                    "translation_language": existing["translation_language"],
                    "creator_pack": json.loads(existing["creator_pack_json"] or "{}"),
                }
                if existing
                else {}
            )
            merged_artifacts = {**existing_artifacts, **artifact_patch}
            created_at = existing["created_at"] if existing else now

            conn.execute(
                """
                INSERT INTO parse_history (
                    user_id, record_key, video_json, subtitles, segments_json,
                    language, subtitle_type, summary_text, mindmap_text,
                    translated_segments_json, translation_language, creator_pack_json,
                    created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(user_id, record_key) DO UPDATE SET
                    video_json=excluded.video_json,
                    subtitles=excluded.subtitles,
                    segments_json=excluded.segments_json,
                    language=excluded.language,
                    subtitle_type=excluded.subtitle_type,
                    summary_text=excluded.summary_text,
                    mindmap_text=excluded.mindmap_text,
                    translated_segments_json=excluded.translated_segments_json,
                    translation_language=excluded.translation_language,
                    creator_pack_json=excluded.creator_pack_json,
                    updated_at=excluded.updated_at
                """,
                (
                    user_id,
                    key,
                    json.dumps(merged_video, ensure_ascii=False),
                    merged_artifacts.get("subtitles", ""),
                    json.dumps(merged_artifacts.get("segments", []), ensure_ascii=False),
                    merged_artifacts.get("language", ""),
                    merged_artifacts.get("subtitle_type", ""),
                    merged_artifacts.get("summary_text", ""),
                    merged_artifacts.get("mindmap_text", ""),
                    json.dumps(merged_artifacts.get("translated_segments", []), ensure_ascii=False),
                    merged_artifacts.get("translation_language", ""),
                    json.dumps(merged_artifacts.get("creator_pack", {}), ensure_ascii=False),
                    created_at,
                    now,
                ),
            )
            conn.execute(
                """
                DELETE FROM parse_history
                WHERE user_id=? AND record_key NOT IN (
                    SELECT record_key FROM parse_history
                    WHERE user_id=?
                    ORDER BY updated_at DESC
                    LIMIT ?
                )
                """,
                (user_id, user_id, self.max_records),
            )

        record = self.get_record(user_id, key)
        if record is None:
            raise RuntimeError("解析历史保存失败")
        return record

    def update_artifacts(
        self,
        user_id: str,
        record_key: str,
        artifacts: Dict[str, Any],
    ) -> Dict[str, Any]:
        existing = self.get_record(user_id, record_key)
        if not existing:
            raise KeyError("解析历史不存在")
        video = {
            key: value
            for key, value in existing.items()
            if key not in ARTIFACT_FIELDS
            and key not in {"created_at", "updated_at"}
        }
        return self.upsert(user_id, video, artifacts)

    def clear_records(self, user_id: str) -> None:
        with closing(self._connect()) as conn, conn:
            conn.execute("DELETE FROM parse_history WHERE user_id=?", (user_id,))


parse_history_store = ParseHistoryStore()


def init_parse_history_db() -> None:
    parse_history_store.init_db()
