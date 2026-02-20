import os
import sys
import tempfile
import unittest
import uuid
from pathlib import Path

from fastapi import HTTPException

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

import main


class ChoreRangeEndpointTests(unittest.TestCase):
    def setUp(self):
        self._tmpdir = tempfile.TemporaryDirectory()
        self._original_database = main.DATABASE
        main.DATABASE = os.path.join(self._tmpdir.name, "test_chores.db")
        main.init_db()

    def tearDown(self):
        main.DATABASE = self._original_database
        self._tmpdir.cleanup()

    def test_for_range_returns_leaf_tasks_with_parent_name(self):
        parent_id = str(uuid.uuid4())
        subtask_id = str(uuid.uuid4())

        with main.get_db() as conn:
            cursor = conn.cursor()
            cursor.execute(
                """
                INSERT INTO chores (id, name, schedule_type, schedule_json, time_of_day, minutes, parent_id, global_order, is_active, tags_json)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (parent_id, "Parent Daily", "daily", "{}", "AM", 20, None, 0, 1, None),
            )
            cursor.execute(
                """
                INSERT INTO chores (id, name, schedule_type, schedule_json, time_of_day, minutes, parent_id, global_order, is_active, tags_json)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (subtask_id, "Child Subtask", "daily", "{}", "PM", 5, parent_id, 0, 1, None),
            )
            conn.commit()

        result = main.get_chores_for_range("2026-02-11", "2026-02-11")
        chores = result["chores_by_date"]["2026-02-11"]
        ids = {c["id"] for c in chores}

        self.assertNotIn(parent_id, ids)
        self.assertIn(subtask_id, ids)

        subtask = next(c for c in chores if c["id"] == subtask_id)
        self.assertEqual(subtask.get("parent_name"), "Parent Daily")

    def test_for_range_rejects_end_before_start(self):
        with self.assertRaises(HTTPException) as ctx:
            main.get_chores_for_range("2026-02-12", "2026-02-11")
        self.assertEqual(ctx.exception.status_code, 400)


if __name__ == "__main__":
    unittest.main()
