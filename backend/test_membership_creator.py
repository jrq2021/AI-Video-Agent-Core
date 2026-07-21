import gc
import tempfile
import time
import unittest
from pathlib import Path

import membership


class CreatorMembershipTest(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.original_db_path = membership.DB_PATH
        membership.DB_PATH = Path(self.temp_dir.name) / "membership.db"
        membership.init_membership_db()

    def tearDown(self):
        membership.DB_PATH = self.original_db_path
        gc.collect()
        self.temp_dir.cleanup()

    def test_weekly_coupon_grants_pro_for_seven_days(self):
        code = membership.create_membership_coupon("pro", order_type="weekly")
        result = membership.redeem_membership_coupon("user-week", code)

        self.assertGreater(result["expires_at"], int(time.time()) + 6 * 86400)
        self.assertLess(result["expires_at"], int(time.time()) + 8 * 86400)

    def test_creator_credit_refund_is_idempotent(self):
        membership.set_user_plan("user-pro", "pro")

        first = membership.check_and_consume_quota(
            "user-pro", "creator_pack", audit_key="batch-item-1"
        )

        self.assertTrue(first["allowed"])
        self.assertTrue(
            membership.refund_quota_once(
                "user-pro", "creator_credits", "batch-item-1", "parse failed"
            )
        )
        self.assertFalse(
            membership.refund_quota_once(
                "user-pro", "creator_credits", "batch-item-1", "parse failed"
            )
        )
        quota = membership.get_user_quota("user-pro")
        self.assertEqual(quota.daily_creator_credits_used, 0)


if __name__ == "__main__":
    unittest.main()
