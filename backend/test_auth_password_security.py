import tempfile
import unittest
from pathlib import Path

import auth


class PasswordSecurityTest(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.original_db_path = auth.DB_PATH
        auth.DB_PATH = Path(self.temp_dir.name) / "users.db"
        auth.init_db()

    def tearDown(self):
        auth.DB_PATH = self.original_db_path
        self.temp_dir.cleanup()

    def test_new_account_uses_pbkdf2(self):
        user = auth.create_user("secure-user", "secure@example.com", "password-8")

        with auth._get_db() as conn:
            stored = conn.execute(
                "SELECT password_hash FROM users WHERE id=?", (user["id"],)
            ).fetchone()["password_hash"]

        self.assertTrue(stored.startswith("pbkdf2_sha256$600000$"))

    def test_legacy_hash_upgrades_after_correct_login(self):
        legacy = auth._hash_legacy_password("legacy-pass")
        with auth._get_db() as conn:
            conn.execute(
                "INSERT INTO users (id, username, email, password_hash, created_at) VALUES (?,?,?,?,?)",
                ("legacy", "legacy-user", "legacy@example.com", legacy, 1),
            )

        self.assertIsNotNone(auth.authenticate_user("legacy@example.com", "legacy-pass"))

        with auth._get_db() as conn:
            stored = conn.execute(
                "SELECT password_hash FROM users WHERE id='legacy'"
            ).fetchone()["password_hash"]

        self.assertTrue(stored.startswith("pbkdf2_sha256$"))

    def test_new_password_requires_eight_characters(self):
        with self.assertRaisesRegex(ValueError, "至少 8 位"):
            auth.create_user("short-user", "short@example.com", "short")


if __name__ == "__main__":
    unittest.main()
