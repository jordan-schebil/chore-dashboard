import os
import sys
import tempfile
import unittest
import uuid
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

import main


class ResetEndpointTests(unittest.TestCase):
    def setUp(self):
        self._tmpdir = tempfile.TemporaryDirectory()
        self._original_database = main.DATABASE
        main.DATABASE = os.path.join(self._tmpdir.name, "test_chores.db")
        main.init_db()

    def tearDown(self):
        main.DATABASE = self._original_database
        self._tmpdir.cleanup()

    def test_reset_reseeds_defaults_and_clears_related_data(self):
        custom_chore_id = str(uuid.uuid4())
        room_id = str(uuid.uuid4())

        with main.get_db() as conn:
            cursor = conn.cursor()

            cursor.execute(
                """
                INSERT INTO chores (id, name, schedule_type, schedule_json, time_of_day, minutes, parent_id, global_order, is_active, tags_json)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (custom_chore_id, "Temporary test chore", "daily", "{}", "AM", 5, None, 999, 1, None),
            )

            cursor.execute("INSERT INTO rooms (id, name) VALUES (?, ?)", (room_id, "Test Room"))
            cursor.execute("INSERT INTO chore_rooms (chore_id, room_id) VALUES (?, ?)", (custom_chore_id, room_id))
            cursor.execute(
                "INSERT INTO completions (chore_id, completed_date) VALUES (?, ?)",
                (custom_chore_id, "2026-02-11"),
            )
            cursor.execute(
                "INSERT INTO daily_order (date, chore_id, order_index) VALUES (?, ?, ?)",
                ("2026-02-11", custom_chore_id, 0),
            )
            conn.commit()

        result = main.reset_to_defaults()
        self.assertEqual(result, {"status": "ok", "reset": True})

        with main.get_db() as conn:
            cursor = conn.cursor()

            cursor.execute("SELECT COUNT(*) FROM rooms")
            self.assertEqual(cursor.fetchone()[0], 0)

            cursor.execute("SELECT COUNT(*) FROM completions")
            self.assertEqual(cursor.fetchone()[0], 0)

            cursor.execute("SELECT COUNT(*) FROM daily_order")
            self.assertEqual(cursor.fetchone()[0], 0)

            cursor.execute("SELECT COUNT(*) FROM chore_rooms")
            self.assertEqual(cursor.fetchone()[0], 0)

            cursor.execute("SELECT COUNT(*) FROM chores WHERE id = ?", (custom_chore_id,))
            self.assertEqual(cursor.fetchone()[0], 0)

            cursor.execute("SELECT COUNT(*) FROM chores")
            total_chores = cursor.fetchone()[0]
            self.assertGreater(total_chores, 0)

            cursor.execute("SELECT COUNT(*) FROM chores WHERE name = 'Make bed'")
            self.assertEqual(cursor.fetchone()[0], 1)


if __name__ == "__main__":
    unittest.main()
