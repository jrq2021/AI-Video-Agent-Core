import unittest

from runtime_config import ConfigurationError, load_runtime_settings


class RuntimeConfigTest(unittest.TestCase):
    def test_development_defaults_are_local_and_ephemeral(self):
        settings = load_runtime_settings({"APP_ENV": "development"})

        self.assertIn("http://127.0.0.1:5174", settings.cors_allow_origins)
        self.assertTrue(settings.jwt_secret)
        self.assertTrue(settings.email_code_secret)

    def test_production_requires_all_security_values(self):
        with self.assertRaisesRegex(ConfigurationError, "JWT_SECRET.*SMTP_FROM"):
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


if __name__ == "__main__":
    unittest.main()
