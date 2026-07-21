import asyncio
import unittest
import warnings
from types import SimpleNamespace
from unittest.mock import patch

from fastapi import HTTPException


def _load_main():
    import douyin

    with warnings.catch_warnings(), patch.object(douyin.DouyinParser, "_init_guest_cookie"):
        warnings.simplefilter("ignore", DeprecationWarning)
        warnings.simplefilter("ignore", RuntimeWarning)
        import main
    return main


class AuthApiLimitsTest(unittest.TestCase):
    def test_send_code_returns_429_before_delivery(self):
        main = _load_main()
        request = SimpleNamespace(client=SimpleNamespace(host="203.0.113.5"))
        payload = main.SendEmailCodeRequest(email="new@example.com", purpose="register")

        with patch("main.is_rate_limited", return_value=True, create=True), patch(
            "main.issue_email_code"
        ) as issue:
            with self.assertRaises(HTTPException) as caught:
                asyncio.run(main.send_auth_email_code(payload, request))

        self.assertEqual(caught.exception.status_code, 429)
        issue.assert_not_called()

    def test_successful_login_does_not_record_a_failure(self):
        main = _load_main()
        request = SimpleNamespace(client=SimpleNamespace(host="203.0.113.5"))
        payload = main.LoginRequest(login="member@example.com", password="password-8")

        with patch("main.is_rate_limited", return_value=False, create=True), patch(
            "main.authenticate_user", return_value={"id": "member", "username": "member"}
        ), patch("main.record_rate_limit_event", create=True) as record:
            response = asyncio.run(main.login(payload, request))

        self.assertTrue(response["success"])
        record.assert_not_called()


if __name__ == "__main__":
    unittest.main()
