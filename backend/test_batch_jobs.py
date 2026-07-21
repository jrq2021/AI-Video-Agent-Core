import tempfile
import unittest
import asyncio
import warnings
from pathlib import Path
from unittest.mock import patch

import membership
from parse_history import ParseHistoryStore

class BatchJobStoreTest(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.original_membership_db = membership.DB_PATH
        membership.DB_PATH = Path(self.temp_dir.name) / "membership.db"
        membership.init_membership_db()
        membership.set_user_plan("owner", "pro")

        from batch_jobs import BatchJobStore

        self.store = BatchJobStore(Path(self.temp_dir.name) / "batch_jobs.db")
        self.store.init_db()
        self.history = ParseHistoryStore(Path(self.temp_dir.name) / "history.db")
        self.history.init_db()

    def tearDown(self):
        membership.DB_PATH = self.original_membership_db
        self.temp_dir.cleanup()

    def test_only_owner_can_read_job_and_only_one_active_batch_is_allowed(self):
        job = self.store.create_job("owner", ["https://example.com/a"], 5)

        self.assertIsNone(self.store.get_job("other", job["id"]))
        with self.assertRaises(ValueError):
            self.store.create_job("owner", ["https://example.com/b"], 5)

    def test_failed_charged_item_is_refunded_once(self):
        from batch_jobs import BatchProcessor

        self.store.create_job("owner", ["https://example.com/a"], 5)
        item = self.store.claim_next_item()
        processor = BatchProcessor(self.store, self.history)

        result = processor.process_item(
            item,
            parse=lambda url: (_ for _ in ()).throw(RuntimeError("blocked")),
        )

        self.assertEqual(result["status"], "failed")
        self.assertTrue(result["quota_refunded"])
        self.assertEqual(membership.get_user_quota("owner").daily_batch_items_used, 0)
        saved = self.store.get_job("owner", item["job_id"])
        self.assertEqual(saved["items"][0]["status"], "failed")
        self.assertTrue(saved["items"][0]["quota_refunded"])

    def test_completed_item_records_the_quota_charge_and_history(self):
        from batch_jobs import BatchProcessor

        self.store.create_job("owner", ["https://example.com/a"], 5)
        item = self.store.claim_next_item()
        processor = BatchProcessor(self.store, self.history)

        result = processor.process_item(
            item,
            parse=lambda url: {
                "title": "Parsed video",
                "subtitles": "a useful subtitle segment",
                "segments": [{"start": 0, "end": 2, "text": "hello"}],
                "language": "en",
                "subtitle_type": "manual",
            },
        )

        self.assertEqual(result["status"], "completed")
        self.assertTrue(result["quota_charged"])
        self.assertEqual(membership.get_user_quota("owner").daily_batch_items_used, 1)
        record = self.history.get_record("owner", result["record_key"])
        self.assertEqual(record["title"], "Parsed video")

    def test_batch_api_rejects_free_users_and_hides_other_users_jobs(self):
        import douyin
        with warnings.catch_warnings(), patch.object(douyin.DouyinParser, "_init_guest_cookie"):
            warnings.simplefilter("ignore", DeprecationWarning)
            import main

        original_store = main.batch_job_store
        main.batch_job_store = self.store
        try:
            with self.assertRaises(main.HTTPException) as denied:
                asyncio.run(main.create_batch_job(main.BatchJobRequest(urls=["https://example.com/a"]), {"id": "free"}))
            self.assertEqual(denied.exception.status_code, 403)

            created = asyncio.run(
                main.create_batch_job(main.BatchJobRequest(urls=["https://example.com/a"]), {"id": "owner"})
            )
            hidden = asyncio.run(main.get_batch_job(created["job"]["id"], {"id": "other"}))
            self.assertEqual(hidden["job"], None)
        finally:
            main.batch_job_store = original_store


if __name__ == "__main__":
    unittest.main()
