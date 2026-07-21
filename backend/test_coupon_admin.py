import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import membership


class CouponAdminCliTest(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.original_db_path = membership.DB_PATH
        membership.DB_PATH = Path(self.temp_dir.name) / "membership.db"
        membership.init_membership_db()

    def tearDown(self):
        membership.DB_PATH = self.original_db_path
        self.temp_dir.cleanup()

    def test_create_outputs_requested_single_use_codes(self):
        from coupon_admin import run_cli

        with patch(
            "sys.argv",
            ["coupon_admin.py", "create", "--plan", "pro", "--type", "weekly", "--count", "2"],
        ):
            lines = run_cli()

        self.assertEqual(len(lines), 2)
        self.assertTrue(all(line.startswith("JD-") for line in lines))

    def test_revoke_marks_an_unredeemed_coupon_inactive(self):
        from coupon_admin import run_cli

        code = membership.create_membership_coupon("pro", order_type="monthly")
        with patch("sys.argv", ["coupon_admin.py", "revoke", code]):
            lines = run_cli()

        self.assertEqual(lines, [f"{code} revoked"])
        with membership._get_db() as conn:
            status = conn.execute("SELECT status FROM coupon_codes WHERE code=?", (code,)).fetchone()["status"]
        self.assertEqual(status, "revoked")


if __name__ == "__main__":
    unittest.main()
