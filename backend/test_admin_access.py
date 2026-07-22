import tempfile
import unittest
import json
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

from fastapi import HTTPException

import auth


def bearer_request(token: str) -> SimpleNamespace:
    return SimpleNamespace(headers={"Authorization": f"Bearer {token}"})


class AdminAccessTest(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.original_db_path = auth.DB_PATH
        auth.DB_PATH = Path(self.temp_dir.name) / "users.db"
        auth.init_db()
        self.owner = auth.create_user("owner", "owner@example.com", "password-8")
        self.member = auth.create_user("member", "member@example.com", "password-8")

    def tearDown(self):
        auth.DB_PATH = self.original_db_path
        self.temp_dir.cleanup()

    def test_non_whitelisted_user_is_rejected(self):
        token = auth.create_token(self.member["id"])
        current_settings = auth.get_runtime_settings()
        settings = SimpleNamespace(
            admin_emails=("owner@example.com",),
            jwt_secret=current_settings.jwt_secret,
        )

        with patch("auth.get_runtime_settings", return_value=settings), self.assertRaisesRegex(
            HTTPException, "管理员权限"
        ) as caught:
            auth.get_current_admin(bearer_request(token))

        self.assertEqual(caught.exception.status_code, 403)

    def test_disabled_user_cannot_use_existing_token_or_log_in(self):
        token = auth.create_token(self.member["id"])
        auth.set_user_account_status(self.member["id"], "disabled", self.owner["id"])

        with self.assertRaisesRegex(HTTPException, "账号已禁用") as caught:
            auth.get_current_user(bearer_request(token))

        self.assertEqual(caught.exception.status_code, 403)
        self.assertIsNone(auth.authenticate_user("member@example.com", "password-8"))

    def test_admin_cannot_change_own_account_status(self):
        with self.assertRaisesRegex(ValueError, "不能操作自己的账号"):
            auth.set_user_account_status(self.owner["id"], "disabled", self.owner["id"])

    def test_status_change_writes_before_and_after_audit_record(self):
        auth.set_user_account_status(self.member["id"], "disabled", self.owner["id"])

        with auth._get_db() as conn:
            row = conn.execute(
                """
                SELECT actor_id, action, target_type, target_id, before_json, after_json
                FROM admin_audit_logs
                """
            ).fetchone()

        self.assertEqual(row["actor_id"], self.owner["id"])
        self.assertEqual(row["action"], "user.status.update")
        self.assertEqual(row["target_type"], "user")
        self.assertEqual(row["target_id"], self.member["id"])
        self.assertEqual(json.loads(row["before_json"])["account_status"], "active")
        self.assertEqual(json.loads(row["after_json"])["account_status"], "disabled")

    def test_init_db_removes_audit_records_older_than_ninety_days(self):
        with auth._get_db() as conn:
            conn.execute(
                """
                INSERT INTO admin_audit_logs
                    (actor_id, action, target_type, target_id, before_json, after_json, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                ("owner", "old.action", "user", "member", "{}", "{}", 0),
            )

        auth.init_db()

        with auth._get_db() as conn:
            count = conn.execute("SELECT COUNT(*) FROM admin_audit_logs").fetchone()[0]

        self.assertEqual(count, 0)


if __name__ == "__main__":
    unittest.main()
