import tempfile
import unittest
from pathlib import Path

import auth
import auth_rate_limit


class AuthRateLimitTest(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.original_db_path = auth.DB_PATH
        auth.DB_PATH = Path(self.temp_dir.name) / "users.db"
        auth_rate_limit.init_auth_rate_limit_db()

    def tearDown(self):
        auth.DB_PATH = self.original_db_path
        self.temp_dir.cleanup()

    def test_window_blocks_after_maximum_events_then_expires(self):
        for _ in range(10):
            auth_rate_limit.record_rate_limit_event("send_code", "203.0.113.1", 1_000)

        self.assertTrue(
            auth_rate_limit.is_rate_limited("send_code", "203.0.113.1", 10, 900, 1_001)
        )
        self.assertFalse(
            auth_rate_limit.is_rate_limited("send_code", "203.0.113.1", 10, 900, 1_901)
        )


if __name__ == "__main__":
    unittest.main()
