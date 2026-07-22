import unittest
import warnings
from pathlib import Path
from unittest.mock import patch

from runtime_config import (
    ConfigurationError,
    get_runtime_settings,
    load_runtime_settings,
    validate_runtime_settings,
)


class RuntimeConfigTest(unittest.TestCase):
    def test_development_defaults_are_local_and_ephemeral(self):
        settings = load_runtime_settings({"APP_ENV": "development"})

        self.assertIn("http://127.0.0.1:5174", settings.cors_allow_origins)
        self.assertTrue(settings.jwt_secret)
        self.assertTrue(settings.email_code_secret)

    def test_production_requires_all_security_values(self):
        with self.assertRaisesRegex(ConfigurationError, "JWT_SECRET.*SMTP_FROM.*ADMIN_EMAILS"):
            load_runtime_settings({"APP_ENV": "production"})

    def test_production_parses_origins_and_limits(self):
        settings = load_runtime_settings(
            {
                "APP_ENV": "production",
                "JWT_SECRET": "jwt",
                "EMAIL_CODE_SECRET": "email",
                "CORS_ALLOW_ORIGINS": "https://app.example, https://www.example",
                "SMTP_HOST": "smtp.example",
                "SMTP_FROM": "service@example",
                "ADMIN_EMAILS": "Owner@example.com, second@example.com,owner@example.com",
                "AUTH_RATE_LIMIT_WINDOW_SECONDS": "900",
                "EMAIL_CODE_IP_MAX_REQUESTS": "10",
                "LOGIN_IP_MAX_FAILURES": "10",
            }
        )

        self.assertEqual(
            settings.cors_allow_origins,
            ("https://app.example", "https://www.example"),
        )
        self.assertEqual(settings.rate_limit_window_seconds, 900)
        self.assertEqual(settings.admin_emails, ("owner@example.com", "second@example.com"))

    def test_development_warning_is_emitted_at_validation_not_every_read(self):
        with patch.dict("os.environ", {"APP_ENV": "development"}, clear=True), warnings.catch_warnings(
            record=True
        ) as caught:
            warnings.simplefilter("always")
            get_runtime_settings()
            get_runtime_settings()
            self.assertEqual(caught, [])
            validate_runtime_settings()

        runtime_warnings = [warning for warning in caught if warning.category is RuntimeWarning]
        self.assertEqual(len(runtime_warnings), 1)

    def test_template_and_launcher_document_standard_startup(self):
        template = Path(__file__).with_name(".env.example").read_text(encoding="utf-8")
        for key in (
            "APP_ENV",
            "JWT_SECRET",
            "EMAIL_CODE_SECRET",
            "CORS_ALLOW_ORIGINS",
            "ADMIN_EMAILS",
            "AUTH_RATE_LIMIT_WINDOW_SECONDS",
        ):
            self.assertIn(key, template)

        script = Path(__file__).parent.parent / "scripts" / "start-local.ps1"
        self.assertTrue(script.exists())
        source = script.read_text(encoding="utf-8")
        self.assertIn(".venv\\Scripts\\python.exe", source)
        self.assertIn("BackendPort = 8000", source)
        self.assertIn("FrontendPort = 5173", source)


if __name__ == "__main__":
    unittest.main()
