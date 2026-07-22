import tempfile
import time
import unittest
from pathlib import Path

import auth
import membership
import admin_service


class AdminServiceTest(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.original_users_db = auth.DB_PATH
        self.original_membership_db = membership.DB_PATH
        auth.DB_PATH = Path(self.temp_dir.name) / "users.db"
        membership.DB_PATH = Path(self.temp_dir.name) / "membership.db"
        auth.init_db()
        membership.init_membership_db()
        self.owner = auth.create_user("owner", "owner@example.com", "password-8")
        self.free_user = auth.create_user("free", "free@example.com", "password-8")
        self.pro_user = auth.create_user("pro", "pro@example.com", "password-8")
        self.ultra_user = auth.create_user("ultra", "ultra@example.com", "password-8")

    def tearDown(self):
        auth.DB_PATH = self.original_users_db
        membership.DB_PATH = self.original_membership_db
        self.temp_dir.cleanup()

    def test_overview_counts_effective_paid_members_and_coupon_statuses(self):
        membership.set_admin_membership(self.pro_user["id"], "pro", "weekly")
        membership.set_admin_membership(self.ultra_user["id"], "ultra", "lifetime")
        active_code = membership.create_membership_coupon("pro", "monthly")
        used_code = membership.create_membership_coupon("pro", "weekly")
        membership.redeem_membership_coupon(self.free_user["id"], used_code)

        overview = admin_service.get_overview(now=int(time.time()))

        self.assertEqual(overview["metrics"]["total_users"], 4)
        self.assertEqual(overview["metrics"]["paid_users"], 3)
        self.assertEqual(overview["coupon_statuses"]["active"], 1)
        self.assertEqual(overview["coupon_statuses"]["used"], 1)
        self.assertIn(active_code, {item["code"] for item in membership.list_membership_coupons("all", 0, 20)[0]})

    def test_list_users_merges_status_and_membership_then_filters(self):
        membership.set_admin_membership(self.pro_user["id"], "pro", "monthly")
        auth.set_user_account_status(self.free_user["id"], "disabled", self.owner["id"])

        result = admin_service.list_users(
            query="pro@example.com", status="active", plan="pro", page=1, page_size=20
        )

        self.assertEqual(result["total"], 1)
        self.assertEqual(result["items"][0]["id"], self.pro_user["id"])
        self.assertEqual(result["items"][0]["account_status"], "active")
        self.assertEqual(result["items"][0]["plan"], "pro")

    def test_revoke_coupon_keeps_existing_redemption_history(self):
        code = membership.create_membership_coupon("pro", "monthly", max_redemptions=2)
        membership.redeem_membership_coupon(self.free_user["id"], code)

        revoked = membership.revoke_membership_coupon(code)

        self.assertEqual(revoked["status"], "revoked")
        with membership._get_db() as conn:
            history = conn.execute(
                "SELECT code, user_id FROM coupon_redemptions WHERE code=?", (code,)
            ).fetchone()
        self.assertEqual(history["user_id"], self.free_user["id"])

    def test_admin_membership_can_return_user_to_free_plan(self):
        membership.set_admin_membership(self.pro_user["id"], "pro", "yearly")

        quota = membership.set_admin_membership(self.pro_user["id"], "free", "monthly")

        self.assertEqual(quota["plan"], "free")
        self.assertEqual(quota["expires_at"], 0)


if __name__ == "__main__":
    unittest.main()
