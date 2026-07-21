import sqlite3
import tempfile
import unittest
from contextlib import closing
from pathlib import Path

from parse_history import ParseHistoryStore


class ParseHistoryCreatorArtifactsTest(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.db_path = Path(self.temp_dir.name) / "history.db"

    def tearDown(self):
        self.temp_dir.cleanup()

    def test_creator_artifacts_round_trip(self):
        store = ParseHistoryStore(self.db_path)
        store.init_db()

        saved = store.upsert(
            "user-1",
            {"record_key": "record-1", "title": "Video"},
            {
                "translated_segments": [
                    {"start": 0, "end": 2, "text": "你好", "translation": "Hello"}
                ],
                "translation_language": "en",
                "creator_pack": {"angle": "学习", "titles": ["标题一"]},
            },
        )

        self.assertEqual(saved["translation_language"], "en")
        self.assertEqual(saved["translated_segments"][0]["translation"], "Hello")
        self.assertEqual(saved["creator_pack"]["titles"], ["标题一"])

    def test_existing_history_schema_gets_empty_creator_artifacts(self):
        with closing(sqlite3.connect(self.db_path)) as conn, conn:
            conn.execute(
                """CREATE TABLE parse_history (
                    user_id TEXT NOT NULL,
                    record_key TEXT NOT NULL,
                    video_json TEXT NOT NULL DEFAULT '{}',
                    subtitles TEXT NOT NULL DEFAULT '',
                    segments_json TEXT NOT NULL DEFAULT '[]',
                    language TEXT NOT NULL DEFAULT '',
                    subtitle_type TEXT NOT NULL DEFAULT '',
                    summary_text TEXT NOT NULL DEFAULT '',
                    mindmap_text TEXT NOT NULL DEFAULT '',
                    created_at INTEGER NOT NULL,
                    updated_at INTEGER NOT NULL,
                    PRIMARY KEY (user_id, record_key)
                )"""
            )
            conn.execute(
                """INSERT INTO parse_history
                   (user_id, record_key, created_at, updated_at)
                   VALUES ('user-1', 'legacy-1', 1, 1)"""
            )

        store = ParseHistoryStore(self.db_path)
        store.init_db()
        record = store.get_record("user-1", "legacy-1")

        self.assertEqual(record["translated_segments"], [])
        self.assertEqual(record["translation_language"], "")
        self.assertEqual(record["creator_pack"], {})


if __name__ == "__main__":
    unittest.main()
