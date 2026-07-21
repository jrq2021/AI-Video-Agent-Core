import asyncio
import tempfile
import unittest
import warnings
from pathlib import Path
from unittest.mock import patch

import membership
from parse_history import ParseHistoryStore


class CreatorApiTest(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.original_membership_db = membership.DB_PATH
        membership.DB_PATH = Path(self.temp_dir.name) / "membership.db"
        membership.init_membership_db()
        membership.set_user_plan("owner", "pro")
        self.history = ParseHistoryStore(Path(self.temp_dir.name) / "history.db")
        self.history.init_db()
        self.history.upsert(
            "owner",
            {"record_key": "record-1", "title": "Creator video"},
            {
                "subtitles": "This is a useful subtitle passage with enough text to generate content.",
                "segments": [{"start": 0, "end": 2, "text": "你好"}],
            },
        )

    def tearDown(self):
        membership.DB_PATH = self.original_membership_db
        self.temp_dir.cleanup()

    def test_translation_uses_record_cache_without_second_credit_charge(self):
        import douyin
        with warnings.catch_warnings(), patch.object(douyin.DouyinParser, "_init_guest_cookie"):
            warnings.simplefilter("ignore", DeprecationWarning)
            import main

        original_history = main.parse_history_store
        main.parse_history_store = self.history
        try:
            with patch(
                "creator_tools._request_json",
                return_value={"translations": [{"index": 0, "translation": "Hello"}]},
            ):
                first = asyncio.run(
                    main.translate_subtitles(
                        main.SubtitleTranslationRequest(record_key="record-1", target_language="en"),
                        {"id": "owner"},
                    )
                )
            second = asyncio.run(
                main.translate_subtitles(
                    main.SubtitleTranslationRequest(record_key="record-1", target_language="en"),
                    {"id": "owner"},
                )
            )
        finally:
            main.parse_history_store = original_history

        self.assertFalse(first["cached"])
        self.assertTrue(second["cached"])
        self.assertEqual(membership.get_user_quota("owner").daily_creator_credits_used, 1)


if __name__ == "__main__":
    unittest.main()
