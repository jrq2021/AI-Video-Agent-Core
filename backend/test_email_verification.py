import asyncio
import tempfile
import unittest
import warnings
from pathlib import Path
from unittest.mock import patch

import auth
import email_verification
from fastapi import HTTPException


def _load_main():
    import douyin

    with warnings.catch_warnings(), patch.object(douyin.DouyinParser, "_init_guest_cookie"):
        warnings.simplefilter("ignore", DeprecationWarning)
        warnings.simplefilter("ignore", RuntimeWarning)
        import main
    return main


class EmailVerificationTest(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.original_db_path = auth.DB_PATH
        auth.DB_PATH = Path(self.temp_dir.name) / "users.db"
        auth.init_db()
        email_verification.init_email_verification_db()

    def tearDown(self):
        auth.DB_PATH = self.original_db_path
        self.temp_dir.cleanup()

    def test_short_reset_password_does_not_consume_email_code(self):
        email = "reset@example.com"
        code = "123456"
        auth.create_user("reset-user", email, "password-8")
        email_verification.issue_email_code(
            email,
            "reset_password",
            code=code,
            deliver=False,
        )

        with self.assertRaises(ValueError):
            email_verification.reset_password_with_email_code(email, code, "short")

        self.assertTrue(
            email_verification.require_email_code(email, "reset_password", code)
        )

    def test_short_registration_password_does_not_consume_email_code(self):
        email = "register@example.com"
        code = "654321"
        email_verification.issue_email_code(
            email,
            "register",
            code=code,
            deliver=False,
        )
        main = _load_main()
        request = main.RegisterRequest(
            username="register-user",
            email=email,
            password="short",
            code=code,
        )

        with self.assertRaises(HTTPException):
            asyncio.run(main.register(request))

        self.assertTrue(email_verification.require_email_code(email, "register", code))

    def test_failed_delivery_does_not_start_email_cooldown(self):
        email = "retry@example.com"

        with patch.object(
            email_verification,
            "_send_email_code",
            side_effect=RuntimeError("smtp unavailable"),
        ):
            with self.assertRaisesRegex(RuntimeError, "smtp unavailable"):
                email_verification.issue_email_code(email, "register")

        retry = email_verification.issue_email_code(
            email,
            "register",
            code="123456",
            deliver=False,
        )

        self.assertEqual(retry["email"], email)


if __name__ == "__main__":
    unittest.main()
