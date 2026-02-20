import json
import os
import sys
import tempfile
import unittest
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

import main


def parse_json(value):
    return json.loads(value) if value else None


class AuditLogTests(unittest.TestCase):
    def setUp(self):
        self._tmpdir = tempfile.TemporaryDirectory()
        self._original_database = main.DATABASE
        main.DATABASE = os.path.join(self._tmpdir.name, "test_chores.db")
        main.init_db()

    def tearDown(self):
        main.DATABASE = self._original_database
        self._tmpdir.cleanup()

    def _read_logs(self, entity_type=None, entity_id=None):
        with main.get_db() as conn:
            cursor = conn.cursor()
            query = "SELECT * FROM audit_log"
            clauses = []
            params = []
            if entity_type is not None:
                clauses.append("entity_type = ?")
                params.append(entity_type)
            if entity_id is not None:
                clauses.append("entity_id = ?")
                params.append(entity_id)
            if clauses:
                query += " WHERE " + " AND ".join(clauses)
            query += " ORDER BY id"
            cursor.execute(query, params)
            return cursor.fetchall()

    def test_chore_crud_logs_before_and_after(self):
        created = main.create_chore(main.ChoreCreate(
            name="Audit Chore",
            schedule_type="daily",
            schedule={},
            time_of_day="AM",
            minutes=5,
            parent_id=None,
            global_order=0,
            is_active=True,
            tags=[],
            room_ids=[],
        ))
        chore_id = created["id"]

        main.update_chore(chore_id, main.ChoreUpdate(
            name="Audit Chore Updated",
            schedule_type="daily",
            schedule={},
            time_of_day="PM",
            minutes=7,
            parent_id=None,
            global_order=2,
            is_active=True,
            tags=["priority"],
            room_ids=[],
        ))
        main.delete_chore(chore_id)

        logs = self._read_logs(entity_type="chore", entity_id=chore_id)
        self.assertEqual([row["action"] for row in logs], ["create", "update", "delete"])

        create_before = parse_json(logs[0]["before_json"])
        create_after = parse_json(logs[0]["after_json"])
        self.assertIsNone(create_before)
        self.assertEqual(create_after["name"], "Audit Chore")

        update_before = parse_json(logs[1]["before_json"])
        update_after = parse_json(logs[1]["after_json"])
        self.assertEqual(update_before["name"], "Audit Chore")
        self.assertEqual(update_after["name"], "Audit Chore Updated")

        delete_before = parse_json(logs[2]["before_json"])
        delete_after = parse_json(logs[2]["after_json"])
        self.assertEqual(delete_before["name"], "Audit Chore Updated")
        self.assertIsNone(delete_after)

    def test_room_crud_logs(self):
        created = main.create_room(main.RoomCreate(name="Laundry"))
        room_id = created["id"]
        main.update_room(room_id, main.RoomUpdate(name="Laundry Room"))
        main.delete_room(room_id)

        logs = self._read_logs(entity_type="room", entity_id=room_id)
        self.assertEqual([row["action"] for row in logs], ["create", "update", "delete"])

        update_before = parse_json(logs[1]["before_json"])
        update_after = parse_json(logs[1]["after_json"])
        self.assertEqual(update_before["name"], "Laundry")
        self.assertEqual(update_after["name"], "Laundry Room")

    def test_daily_order_and_completion_toggle_logs(self):
        chore_a = main.create_chore(main.ChoreCreate(
            name="Order A",
            schedule_type="daily",
            schedule={},
            time_of_day="AM",
            minutes=5,
            parent_id=None,
            global_order=0,
            is_active=True,
            tags=[],
            room_ids=[],
        ))
        chore_b = main.create_chore(main.ChoreCreate(
            name="Order B",
            schedule_type="daily",
            schedule={},
            time_of_day="PM",
            minutes=5,
            parent_id=None,
            global_order=1,
            is_active=True,
            tags=[],
            room_ids=[],
        ))
        date_str = "2026-02-11"

        main.set_daily_order(date_str, main.OrderUpdate(order=[chore_a["id"], chore_b["id"]]))
        main.set_daily_order(date_str, main.OrderUpdate(order=[chore_b["id"], chore_a["id"]]))

        main.toggle_completion(main.CompletionToggle(chore_id=chore_a["id"], date=date_str))
        main.toggle_completion(main.CompletionToggle(chore_id=chore_a["id"], date=date_str))

        order_logs = self._read_logs(entity_type="daily_order", entity_id=date_str)
        self.assertEqual(len(order_logs), 2)
        first_after = parse_json(order_logs[0]["after_json"])
        second_before = parse_json(order_logs[1]["before_json"])
        self.assertEqual(first_after["order"], [chore_a["id"], chore_b["id"]])
        self.assertEqual(second_before["order"], [chore_a["id"], chore_b["id"]])

        completion_logs = self._read_logs(entity_type="completion", entity_id=chore_a["id"])
        toggle_logs = [row for row in completion_logs if parse_json(row["metadata_json"])["date"] == date_str]
        self.assertEqual(len(toggle_logs), 2)
        self.assertTrue(parse_json(toggle_logs[0]["after_json"])["completed"])
        self.assertFalse(parse_json(toggle_logs[1]["after_json"])["completed"])

    def test_reset_logs_before_and_after_counts(self):
        created = main.create_chore(main.ChoreCreate(
            name="Reset Check",
            schedule_type="daily",
            schedule={},
            time_of_day="AM",
            minutes=5,
            parent_id=None,
            global_order=0,
            is_active=True,
            tags=[],
            room_ids=[],
        ))
        main.toggle_completion(main.CompletionToggle(chore_id=created["id"], date="2026-02-11"))
        main.create_room(main.RoomCreate(name="Temporary"))

        main.reset_to_defaults()

        logs = self._read_logs(entity_type="system", entity_id="default_seed")
        self.assertGreaterEqual(len(logs), 1)
        latest = logs[-1]
        self.assertEqual(latest["action"], "reset")

        before_counts = parse_json(latest["before_json"])
        after_counts = parse_json(latest["after_json"])
        self.assertGreater(before_counts["chores"], 0)
        self.assertGreater(before_counts["rooms"], 0)
        self.assertEqual(after_counts["rooms"], 0)
        self.assertEqual(after_counts["completions"], 0)
        self.assertGreater(after_counts["chores"], 0)


if __name__ == "__main__":
    unittest.main()
