import os
import sys
import tempfile
import unittest
import uuid
from pathlib import Path

from fastapi import HTTPException
from pydantic import ValidationError

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

import main


class WriteValidationTests(unittest.TestCase):
    def setUp(self):
        self._tmpdir = tempfile.TemporaryDirectory()
        self._original_database = main.DATABASE
        main.DATABASE = os.path.join(self._tmpdir.name, "test_chores.db")
        main.init_db()

    def tearDown(self):
        main.DATABASE = self._original_database
        self._tmpdir.cleanup()

    def test_order_update_rejects_duplicate_ids(self):
        with self.assertRaises(ValidationError):
            main.OrderUpdate(order=["abc", "abc"])

    def test_completion_toggle_rejects_invalid_date_format(self):
        with self.assertRaises(ValidationError):
            main.CompletionToggle(chore_id="abc", date="02/11/2026")

    def test_global_order_rejects_unknown_chore_ids(self):
        payload = main.OrderUpdate(order=[str(uuid.uuid4())])
        with self.assertRaises(HTTPException) as ctx:
            main.update_global_order(payload)
        self.assertEqual(ctx.exception.status_code, 400)

    def test_daily_order_rejects_invalid_path_date(self):
        payload = main.OrderUpdate(order=[])
        with self.assertRaises(HTTPException) as ctx:
            main.set_daily_order("2026/02/11", payload)
        self.assertEqual(ctx.exception.status_code, 400)

    def test_daily_order_rejects_unknown_chore_ids(self):
        payload = main.OrderUpdate(order=[str(uuid.uuid4())])
        with self.assertRaises(HTTPException) as ctx:
            main.set_daily_order("2026-02-11", payload)
        self.assertEqual(ctx.exception.status_code, 400)

    def test_toggle_completion_returns_404_for_unknown_chore(self):
        payload = main.CompletionToggle(chore_id=str(uuid.uuid4()), date="2026-02-11")
        with self.assertRaises(HTTPException) as ctx:
            main.toggle_completion(payload)
        self.assertEqual(ctx.exception.status_code, 404)


if __name__ == "__main__":
    unittest.main()
