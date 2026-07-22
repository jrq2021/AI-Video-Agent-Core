import asyncio
import tempfile
import unittest
import warnings
from pathlib import Path
from unittest.mock import patch

from fastapi import HTTPException

import auth
import membership


def load_main():
    import douyin

    with warnings.catch_warnings(), patch.object(douyin.DouyinParser, "_init_guest_cookie"):
        warnings.simplefilter("ignore", DeprecationWarning)
        warnings.simplefilter("ignore", RuntimeWarning)
        import main
    return main


class AdminApiTest(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.original_users_db = auth.DB_PATH
        self.original_membership_db = membership.DB_PATH
        auth.DB_PATH = Path(self.temp_dir.name) / "users.db"
        membership.DB_PATH = Path(self.temp_dir.name) / "membership.db"
        auth.init_db()
        membership.init_membership_db()
        self.owner = auth.create_user("owner", "owner@example.com", "password-8")
        self.member = auth.create_user("member", "member@example.com", "password-8")
        self.main = load_main()

    def tearDown(self):
        auth.DB_PATH = self.original_users_db
        membership.DB_PATH = self.original_membership_db
        self.temp_dir.cleanup()

    def test_batch_coupon_endpoint_returns_codes_and_audit_event(self):
        payload = self.main.AdminCouponBatchRequest(
            plan="pro",
            order_type="weekly",
            count=2,
            expires_days=30,
            note="xianyu",
            max_redemptions=1,
        )

        result = asyncio.run(self.main.admin_create_coupons(payload, user=self.owner))

        self.assertEqual(len(result["coupons"]), 2)
        self.assertTrue(all(code.startswith("JD-") for code in result["coupons"]))
        with auth._get_db() as conn:
            action = conn.execute(
                "SELECT action FROM admin_audit_logs ORDER BY id DESC LIMIT 1"
            ).fetchone()[0]
        self.assertEqual(action, "coupon.batch.create")

    def test_coupon_export_is_csv_attachment(self):
        membership.create_membership_coupon("pro", "monthly", code="JD-CSV-TEST")

        response = asyncio.run(self.main.admin_export_coupons(status="active", user=self.owner))

        self.assertEqual(response.media_type, "text/csv")
        self.assertIn("attachment", response.headers["content-disposition"])
        self.assertIn("JD-CSV-TEST", response.body.decode("utf-8"))

    def test_coupon_export_includes_more_than_one_list_page(self):
        payload = self.main.AdminCouponBatchRequest(
            plan="pro", order_type="weekly", count=100, expires_days=0, max_redemptions=1
        )
        asyncio.run(self.main.admin_create_coupons(payload, user=self.owner))
        membership.create_membership_coupon("pro", "monthly", code="JD-EXTRA-001")

        response = asyncio.run(self.main.admin_export_coupons(status="active", user=self.owner))

        self.assertEqual(len(response.body.decode("utf-8").splitlines()), 102)

    def test_admin_cannot_change_own_status_or_membership(self):
        with self.assertRaises(HTTPException) as status_error:
            asyncio.run(
                self.main.admin_update_user_status(
                    self.owner["id"], self.main.AdminUserStatusRequest(status="disabled"), user=self.owner
                )
            )
        with self.assertRaises(HTTPException) as membership_error:
            asyncio.run(
                self.main.admin_update_user_membership(
                    self.owner["id"], self.main.AdminMembershipRequest(plan="free"), user=self.owner
                )
            )
        self.assertEqual(status_error.exception.status_code, 400)
        self.assertEqual(membership_error.exception.status_code, 400)


if __name__ == "__main__":
    unittest.main()
