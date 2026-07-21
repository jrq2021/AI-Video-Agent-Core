import gc
import tempfile
import unittest
import warnings
from pathlib import Path

import auth


class AuthDatabaseConnectionTest(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.original_db_path = auth.DB_PATH
        auth.DB_PATH = Path(self.temp_dir.name) / "users.db"

    def tearDown(self):
        auth.DB_PATH = self.original_db_path
        self.temp_dir.cleanup()

    def test_database_context_manager_closes_connection(self):
        with warnings.catch_warnings(record=True) as caught:
            warnings.simplefilter("always", ResourceWarning)
            with auth._get_db() as conn:
                conn.execute("CREATE TABLE IF NOT EXISTS smoke_test (id INTEGER PRIMARY KEY)")
            del conn
            gc.collect()

        resource_warnings = [
            warning for warning in caught if issubclass(warning.category, ResourceWarning)
        ]
        self.assertEqual(resource_warnings, [])


if __name__ == "__main__":
    unittest.main()
