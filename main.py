"""
Chore Dashboard API - Simplified FastAPI Backend
Single flat chores table with schedule_type + schedule JSON, plus completions table
"""

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, field_validator
from typing import Optional, List, Any
import sqlite3
import os
from contextlib import contextmanager
from datetime import date, datetime, timedelta, timezone
import uuid
import json

DEFAULT_ALLOWED_ORIGINS = ["http://localhost:5173", "http://localhost:3000"]


def parse_allowed_origins(raw: Optional[str]) -> List[str]:
    if not raw:
        return DEFAULT_ALLOWED_ORIGINS
    origins = [origin.strip() for origin in raw.split(",") if origin.strip()]
    return origins or DEFAULT_ALLOWED_ORIGINS


DATABASE = os.getenv("DATABASE_PATH", "chores.db")
ALLOWED_ORIGINS = parse_allowed_origins(os.getenv("ALLOWED_ORIGINS"))
ALLOW_CREDENTIALS = "*" not in ALLOWED_ORIGINS

app = FastAPI(title="Chore Dashboard API")

# CORS for React dev server
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=ALLOW_CREDENTIALS,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- Pydantic Models ---

class ChoreBase(BaseModel):
    name: str
    schedule_type: str  # daily, weekly, monthly, seasonal, one_time, interval_days (legacy)
    schedule: Optional[dict] = None  # schedule details per type
    time_of_day: Optional[str] = None  # AM, PM - optional for parent chores with sub-tasks
    minutes: Optional[int] = None  # optional - calculated from sub-tasks for parents
    parent_id: Optional[str] = None  # Parent chore ID for sub-tasks
    global_order: Optional[int] = 0  # Global order for leaf chores
    is_active: Optional[bool] = True
    tags: Optional[List[str]] = None
    room_ids: Optional[List[str]] = None

class ChoreCreate(ChoreBase):
    pass

class ChoreUpdate(ChoreBase):
    pass

class Chore(ChoreBase):
    id: str

class RoomBase(BaseModel):
    name: str

class RoomCreate(RoomBase):
    pass

class RoomUpdate(RoomBase):
    pass

class Room(RoomBase):
    id: str

class CompletionToggle(BaseModel):
    chore_id: str
    date: str  # YYYY-MM-DD

    @field_validator("chore_id")
    @classmethod
    def validate_chore_id(cls, value: str) -> str:
        chore_id = value.strip()
        if not chore_id:
            raise ValueError("chore_id is required")
        return chore_id

    @field_validator("date")
    @classmethod
    def validate_date(cls, value: str) -> str:
        try:
            date.fromisoformat(value)
        except ValueError as exc:
            raise ValueError("date must be in YYYY-MM-DD format") from exc
        return value

class OrderUpdate(BaseModel):
    order: List[str]

    @field_validator("order")
    @classmethod
    def validate_order(cls, value: List[str]) -> List[str]:
        normalized = []
        seen = set()
        for chore_id in value:
            cleaned = chore_id.strip()
            if not cleaned:
                raise ValueError("order cannot contain empty chore IDs")
            if cleaned in seen:
                raise ValueError("order cannot contain duplicate chore IDs")
            seen.add(cleaned)
            normalized.append(cleaned)
        return normalized


# --- Database Setup ---

@contextmanager
def get_db():
    conn = sqlite3.connect(DATABASE)
    # SQLite does not enforce foreign keys unless enabled per connection.
    conn.execute("PRAGMA foreign_keys = ON")
    conn.row_factory = sqlite3.Row
    try:
        yield conn
    finally:
        conn.close()

def init_db():
    with get_db() as conn:
        cursor = conn.cursor()

        # Check current schema
        cursor.execute("PRAGMA table_info(chores)")
        columns = [col[1] for col in cursor.fetchall()]

        if not columns:
            create_chores_table(conn)
        elif 'schedule_type' not in columns:
            migrate_to_schedule_schema(conn, columns)
        else:
            if 'parent_id' not in columns:
                cursor.execute("ALTER TABLE chores ADD COLUMN parent_id TEXT DEFAULT NULL")
                conn.commit()
            if 'global_order' not in columns:
                cursor.execute("ALTER TABLE chores ADD COLUMN global_order INTEGER DEFAULT 0")
                conn.commit()
            if 'is_active' not in columns:
                cursor.execute("ALTER TABLE chores ADD COLUMN is_active INTEGER DEFAULT 1")
                conn.commit()
            if 'tags_json' not in columns:
                cursor.execute("ALTER TABLE chores ADD COLUMN tags_json TEXT")
                conn.commit()

        # Completions table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS completions (
                chore_id TEXT NOT NULL,
                completed_date TEXT NOT NULL,
                PRIMARY KEY (chore_id, completed_date),
                FOREIGN KEY (chore_id) REFERENCES chores(id) ON DELETE CASCADE
            )
        """)
        
        # Indexes
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_completions_date ON completions(completed_date)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_chores_schedule_type ON chores(schedule_type)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_chores_parent_id ON chores(parent_id)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_chores_global_order ON chores(global_order)")

        # Daily order overrides
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS daily_order (
                date TEXT NOT NULL,
                chore_id TEXT NOT NULL,
                order_index INTEGER NOT NULL,
                PRIMARY KEY (date, chore_id),
                FOREIGN KEY (chore_id) REFERENCES chores(id) ON DELETE CASCADE
            )
        """)
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_daily_order_date ON daily_order(date)")
        conn.commit()

        # Rooms + join table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS rooms (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL UNIQUE
            )
        """)
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS chore_rooms (
                chore_id TEXT NOT NULL,
                room_id TEXT NOT NULL,
                PRIMARY KEY (chore_id, room_id),
                FOREIGN KEY (chore_id) REFERENCES chores(id) ON DELETE CASCADE,
                FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE
            )
        """)
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_chore_rooms_chore_id ON chore_rooms(chore_id)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_chore_rooms_room_id ON chore_rooms(room_id)")

        # Audit log
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS audit_log (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                created_at TEXT NOT NULL,
                action TEXT NOT NULL,
                entity_type TEXT NOT NULL,
                entity_id TEXT,
                before_json TEXT,
                after_json TEXT,
                metadata_json TEXT
            )
        """)
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_audit_log_created_at ON audit_log(created_at)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_audit_log_entity ON audit_log(entity_type, entity_id)")
        conn.commit()
        
        # Seed default chores if table is empty
        cursor.execute("SELECT COUNT(*) FROM chores")
        if cursor.fetchone()[0] == 0:
            seed_default_chores(conn)

def create_chores_table(conn):
    cursor = conn.cursor()
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS chores (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            schedule_type TEXT NOT NULL CHECK(schedule_type IN ('daily', 'weekly', 'monthly', 'seasonal', 'one_time', 'interval_days')),
            schedule_json TEXT,
            time_of_day TEXT CHECK(time_of_day IN ('AM', 'PM', NULL)),
            minutes INTEGER,
            parent_id TEXT DEFAULT NULL,
            global_order INTEGER DEFAULT 0,
            is_active INTEGER DEFAULT 1,
            tags_json TEXT,
            FOREIGN KEY (parent_id) REFERENCES chores(id) ON DELETE CASCADE
        )
    """)
    conn.commit()

def sunday_week_number(d: date) -> int:
    """Week number with Sunday as first day, week 1 contains Jan 1."""
    year_start = date(d.year, 1, 1)
    start_dow = (year_start.weekday() + 1) % 7  # Sunday=0
    week_start = year_start - timedelta(days=start_dow)
    return ((d - week_start).days // 7) + 1

def week_parity_for_date(d: date) -> int:
    return sunday_week_number(d) % 2

def month_parity_for_date(d: date) -> int:
    return d.month % 2

def migrate_to_schedule_schema(conn, columns):
    cursor = conn.cursor()
    cursor.execute("""
        CREATE TABLE chores_new (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            schedule_type TEXT NOT NULL CHECK(schedule_type IN ('daily', 'weekly', 'monthly', 'seasonal', 'one_time', 'interval_days')),
            schedule_json TEXT,
            time_of_day TEXT CHECK(time_of_day IN ('AM', 'PM', NULL)),
            minutes INTEGER,
            parent_id TEXT DEFAULT NULL,
            global_order INTEGER DEFAULT 0,
            is_active INTEGER DEFAULT 1,
            tags_json TEXT,
            FOREIGN KEY (parent_id) REFERENCES chores(id) ON DELETE CASCADE
        )
    """)

    cursor.execute("SELECT * FROM chores")
    rows = cursor.fetchall()
    today = date.today()

    def col(row, name):
        return row[name] if name in row.keys() else None

    for row in rows:
        freq = col(row, "frequency")
        schedule_type = "daily"
        schedule = None

        if freq == "daily":
            schedule_type = "daily"
            schedule = {}
        elif freq == "weekly":
            schedule_type = "weekly"
            dow = col(row, "day_of_week")
            schedule = {"days_of_week": [dow] if dow is not None else [], "interval": 1}
        elif freq == "monthly":
            schedule_type = "monthly"
            schedule = {
                "mode": "nth_weekday",
                "week_of_month": col(row, "week_of_month"),
                "day_of_week": col(row, "day_of_week"),
                "interval": 1
            }
        elif freq == "quarterly":
            schedule_type = "seasonal"
            schedule = {
                "month": col(row, "month_of_quarter"),
                "mode": "nth_weekday",
                "week_of_month": col(row, "week_of_month"),
                "day_of_week": col(row, "day_of_week"),
                "interval_months": 3
            }
        elif freq == "custom":
            raw = col(row, "custom_schedule")
            custom = None
            if raw:
                try:
                    custom = json.loads(raw)
                except:
                    custom = None

            if custom and custom.get("type") == "one_time":
                schedule_type = "one_time"
                schedule = {"date": custom.get("date")}
            elif custom and custom.get("type") == "multi_weekly":
                schedule_type = "weekly"
                interval = custom.get("interval", 1)
                schedule = {"days_of_week": custom.get("days_of_week", []), "interval": interval}
                if interval > 1:
                    start_date = custom.get("start_date")
                    if start_date:
                        try:
                            parity_date = date.fromisoformat(start_date)
                            schedule["week_parity"] = week_parity_for_date(parity_date)
                        except:
                            schedule["week_parity"] = week_parity_for_date(today)
                    else:
                        schedule["week_parity"] = week_parity_for_date(today)
            elif custom and custom.get("type") == "interval_days":
                schedule_type = "interval_days"
                schedule = {
                    "interval": custom.get("interval", 1),
                    "start_date": custom.get("start_date")
                }
            elif custom and custom.get("type") == "monthly_date":
                schedule_type = "monthly"
                interval = custom.get("interval", 1)
                schedule = {
                    "mode": "date",
                    "day_of_month": custom.get("day_of_month", 1),
                    "interval": interval
                }
                if interval > 1:
                    start_date = custom.get("start_date")
                    if start_date:
                        try:
                            parity_date = date.fromisoformat(start_date)
                            schedule["month_parity"] = month_parity_for_date(parity_date)
                        except:
                            schedule["month_parity"] = month_parity_for_date(today)
                    else:
                        schedule["month_parity"] = month_parity_for_date(today)
            elif custom and custom.get("type") == "seasonal":
                schedule_type = "seasonal"
                schedule = {
                    "month": custom.get("month"),
                    "mode": "nth_weekday",
                    "week_of_month": custom.get("week_of_month"),
                    "day_of_week": custom.get("day_of_week"),
                    "interval_months": 12
                }
            else:
                schedule_type = "daily"
                schedule = {}

        cursor.execute("""
            INSERT INTO chores_new (id, name, schedule_type, schedule_json, time_of_day, minutes, parent_id, global_order, is_active, tags_json)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            row["id"],
            row["name"],
            schedule_type,
            json.dumps(schedule) if schedule is not None else None,
            col(row, "time_of_day"),
            col(row, "minutes"),
            col(row, "parent_id"),
            0,
            1,
            None
        ))

    cursor.execute("DROP TABLE chores")
    cursor.execute("ALTER TABLE chores_new RENAME TO chores")
    conn.commit()

def seed_default_chores(conn):
    """Seed the database with default chores"""
    cursor = conn.cursor()
    
    default_chores = [
        # Daily
        (str(uuid.uuid4()), 'Make bed', 'daily', json.dumps({}), 'AM', 3, None),
        (str(uuid.uuid4()), 'Scoop litter boxes', 'daily', json.dumps({}), 'AM', 5, None),
        (str(uuid.uuid4()), 'Wipe bathroom sink and counter', 'daily', json.dumps({}), 'AM', 3, None),
        (str(uuid.uuid4()), 'Vacuum all floors', 'daily', json.dumps({}), 'AM', 20, None),
        (str(uuid.uuid4()), 'Dishes / load dishwasher', 'daily', json.dumps({}), 'PM', 10, None),
        (str(uuid.uuid4()), 'Wipe kitchen counters', 'daily', json.dumps({}), 'PM', 5, None),
        (str(uuid.uuid4()), 'Take out trash when full', 'daily', json.dumps({}), 'PM', 5, None),
        (str(uuid.uuid4()), 'Pick up clutter / return items to place', 'daily', json.dumps({}), 'PM', 10, None),
        
        # Weekly
        (str(uuid.uuid4()), 'Mop hard floors', 'weekly', json.dumps({"days_of_week": [1], "interval": 1}), 'AM', 20, None),
        (str(uuid.uuid4()), 'Clean toilets', 'weekly', json.dumps({"days_of_week": [2], "interval": 1}), 'AM', 10, None),
        (str(uuid.uuid4()), 'Clean showers/tubs', 'weekly', json.dumps({"days_of_week": [2], "interval": 1}), 'AM', 15, None),
        (str(uuid.uuid4()), 'Dust surfaces', 'weekly', json.dumps({"days_of_week": [3], "interval": 1}), 'AM', 15, None),
        (str(uuid.uuid4()), 'Clean mirrors', 'weekly', json.dumps({"days_of_week": [3], "interval": 1}), 'AM', 10, None),
        (str(uuid.uuid4()), 'Wipe down kitchen appliances', 'weekly', json.dumps({"days_of_week": [4], "interval": 1}), 'PM', 10, None),
        (str(uuid.uuid4()), 'Brush dog and cats', 'weekly', json.dumps({"days_of_week": [4], "interval": 1}), 'PM', 20, None),
        (str(uuid.uuid4()), 'Empty all small trash cans', 'weekly', json.dumps({"days_of_week": [5], "interval": 1}), 'AM', 10, None),
        (str(uuid.uuid4()), 'Change bed linens', 'weekly', json.dumps({"days_of_week": [6], "interval": 1}), 'AM', 15, None),
        (str(uuid.uuid4()), 'Laundry (wash, dry, fold, put away)', 'weekly', json.dumps({"days_of_week": [6], "interval": 1}), 'AM', 45, None),
        (str(uuid.uuid4()), 'Wash food and water bowls', 'weekly', json.dumps({"days_of_week": [0], "interval": 1}), 'PM', 10, None),
        
        # Monthly
        (str(uuid.uuid4()), 'Vacuum upholstery and mattresses', 'monthly', json.dumps({"mode": "nth_weekday", "week_of_month": 1, "day_of_week": 6, "interval": 1}), 'AM', 25, None),
        (str(uuid.uuid4()), 'Wash throw blankets and pillows', 'monthly', json.dumps({"mode": "nth_weekday", "week_of_month": 1, "day_of_week": 6, "interval": 1}), 'AM', 20, None),
        (str(uuid.uuid4()), 'Clean Keurig and toaster oven', 'monthly', json.dumps({"mode": "nth_weekday", "week_of_month": 1, "day_of_week": 6, "interval": 1}), 'PM', 15, None),
        (str(uuid.uuid4()), 'Clean inside microwave and oven', 'monthly', json.dumps({"mode": "nth_weekday", "week_of_month": 2, "day_of_week": 6, "interval": 1}), 'AM', 20, None),
        (str(uuid.uuid4()), 'Deep clean litter boxes', 'monthly', json.dumps({"mode": "nth_weekday", "week_of_month": 2, "day_of_week": 6, "interval": 1}), 'AM', 20, None),
        (str(uuid.uuid4()), 'Clean out fridge', 'monthly', json.dumps({"mode": "nth_weekday", "week_of_month": 2, "day_of_week": 6, "interval": 1}), 'PM', 25, None),
        (str(uuid.uuid4()), 'Wipe cabinet fronts', 'monthly', json.dumps({"mode": "nth_weekday", "week_of_month": 3, "day_of_week": 6, "interval": 1}), 'AM', 20, None),
        (str(uuid.uuid4()), 'Dust blinds and ceiling fans', 'monthly', json.dumps({"mode": "nth_weekday", "week_of_month": 3, "day_of_week": 6, "interval": 1}), 'AM', 25, None),
        (str(uuid.uuid4()), 'Clean window sills and baseboards', 'monthly', json.dumps({"mode": "nth_weekday", "week_of_month": 4, "day_of_week": 6, "interval": 1}), 'AM', 30, None),
        (str(uuid.uuid4()), 'Clean cat trees and scratching posts', 'monthly', json.dumps({"mode": "nth_weekday", "week_of_month": 4, "day_of_week": 6, "interval": 1}), 'PM', 20, None),
        
        # Seasonal (quarterly cadence via month+interval)
        (str(uuid.uuid4()), 'Deep clean carpets', 'seasonal', json.dumps({"month": 1, "mode": "nth_weekday", "week_of_month": 1, "day_of_week": 6, "interval_months": 3}), 'AM', 60, None),
        (str(uuid.uuid4()), 'Flip or rotate mattress', 'seasonal', json.dumps({"month": 1, "mode": "nth_weekday", "week_of_month": 1, "day_of_week": 6, "interval_months": 3}), 'AM', 10, None),
        (str(uuid.uuid4()), 'Deep clean furniture for embedded pet hair', 'seasonal', json.dumps({"month": 1, "mode": "nth_weekday", "week_of_month": 1, "day_of_week": 6, "interval_months": 3}), 'PM', 45, None),
        (str(uuid.uuid4()), 'Change furnace filter', 'seasonal', json.dumps({"month": 1, "mode": "nth_weekday", "week_of_month": 1, "day_of_week": 6, "interval_months": 3}), 'PM', 10, None),
        (str(uuid.uuid4()), 'Wash windows inside and out', 'seasonal', json.dumps({"month": 2, "mode": "nth_weekday", "week_of_month": 1, "day_of_week": 6, "interval_months": 3}), 'AM', 60, None),
        (str(uuid.uuid4()), 'Clean dryer vent', 'seasonal', json.dumps({"month": 2, "mode": "nth_weekday", "week_of_month": 1, "day_of_week": 6, "interval_months": 3}), 'AM', 20, None),
        (str(uuid.uuid4()), 'Organize closets', 'seasonal', json.dumps({"month": 2, "mode": "nth_weekday", "week_of_month": 1, "day_of_week": 6, "interval_months": 3}), 'PM', 60, None),
        (str(uuid.uuid4()), 'Clean behind and under large furniture', 'seasonal', json.dumps({"month": 3, "mode": "nth_weekday", "week_of_month": 1, "day_of_week": 6, "interval_months": 3}), 'AM', 45, None),
        (str(uuid.uuid4()), 'Clean garage or storage areas', 'seasonal', json.dumps({"month": 3, "mode": "nth_weekday", "week_of_month": 1, "day_of_week": 6, "interval_months": 3}), 'AM', 90, None),
        (str(uuid.uuid4()), 'Vacuum basement', 'seasonal', json.dumps({"month": 3, "mode": "nth_weekday", "week_of_month": 1, "day_of_week": 6, "interval_months": 3}), 'PM', 30, None),
        
        # One-time + examples
        (str(uuid.uuid4()), 'Fix leaky faucet in bathroom', 'one_time', json.dumps({"date": "2026-02-15"}), 'AM', 45, None),
        (str(uuid.uuid4()), 'Water plants', 'weekly', json.dumps({"days_of_week": [2, 4], "interval": 1}), 'AM', 10, None),
        (str(uuid.uuid4()), 'Deep clean coffee maker', 'weekly', json.dumps({"days_of_week": [6], "interval": 2, "week_parity": 0}), 'AM', 30, None),
        (str(uuid.uuid4()), 'Check smoke detectors', 'seasonal', json.dumps({"month": 3, "mode": "nth_weekday", "week_of_month": 1, "day_of_week": 6, "interval_months": 12}), 'AM', 15, None),
    ]
    
    cursor.executemany("""
        INSERT INTO chores (id, name, schedule_type, schedule_json, time_of_day, minutes, parent_id)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    """, default_chores)
    conn.commit()


# --- Schedule Matching ---

def matches_schedule(schedule_type: str, schedule: dict, check_date: date) -> bool:
    """Check if a date matches a schedule"""
    if schedule_type == "daily":
        return True

    if schedule_type == "one_time":
        return schedule.get("date") == check_date.isoformat()

    if schedule_type == "weekly":
        days = schedule.get("days_of_week", [])
        interval = schedule.get("interval", 1)
        js_dow = (check_date.weekday() + 1) % 7  # Sunday=0
        if js_dow not in days:
            return False
        if interval > 1:
            parity = schedule.get("week_parity")
            if parity is None:
                return True
            return (sunday_week_number(check_date) % 2) == parity
        return True

    if schedule_type == "monthly":
        mode = schedule.get("mode", "nth_weekday")
        interval = schedule.get("interval", 1)
        if interval > 1:
            parity = schedule.get("month_parity")
            if parity is not None and (check_date.month % 2) != parity:
                return False

        if mode == "date":
            return check_date.day == schedule.get("day_of_month")

        # nth weekday
        week_of_month = (check_date.day - 1) // 7 + 1
        js_dow = (check_date.weekday() + 1) % 7
        return week_of_month == schedule.get("week_of_month") and js_dow == schedule.get("day_of_week")

    if schedule_type == "seasonal":
        target_month = schedule.get("month")
        interval_months = schedule.get("interval_months", 12)
        if target_month is None:
            return False
        if (check_date.month - target_month) % interval_months != 0:
            return False

        mode = schedule.get("mode", "nth_weekday")
        if mode == "date":
            return check_date.day == schedule.get("day_of_month")

        week_of_month = (check_date.day - 1) // 7 + 1
        js_dow = (check_date.weekday() + 1) % 7
        return week_of_month == schedule.get("week_of_month") and js_dow == schedule.get("day_of_week")

    if schedule_type == "interval_days":
        interval = schedule.get("interval", 1)
        start_date_str = schedule.get("start_date")
        if start_date_str:
            start_date = date.fromisoformat(start_date_str)
            days_diff = (check_date - start_date).days
            return days_diff >= 0 and days_diff % interval == 0
        return False

    return False


# --- Helper Functions ---

def row_to_chore(row, room_ids_map=None) -> dict:
    schedule = None
    if row["schedule_json"]:
        try:
            schedule = json.loads(row["schedule_json"])
        except:
            pass
    tags = None
    if "tags_json" in row.keys() and row["tags_json"]:
        try:
            tags = json.loads(row["tags_json"])
        except:
            tags = None
    room_ids = []
    if room_ids_map is not None:
        room_ids = room_ids_map.get(row["id"], [])
    
    return {
        "id": row["id"],
        "name": row["name"],
        "schedule_type": row["schedule_type"],
        "schedule": schedule,
        "time_of_day": row["time_of_day"],
        "minutes": row["minutes"],
        "parent_id": row["parent_id"] if "parent_id" in row.keys() else None,
        "global_order": row["global_order"] if "global_order" in row.keys() else 0,
        "is_active": bool(row["is_active"]) if "is_active" in row.keys() else True,
        "tags": tags or [],
        "room_ids": room_ids,
    }

def get_room_ids_map(conn) -> dict:
    cursor = conn.cursor()
    cursor.execute("SELECT chore_id, room_id FROM chore_rooms")
    mapping = {}
    for row in cursor.fetchall():
        mapping.setdefault(row["chore_id"], []).append(row["room_id"])
    return mapping

def set_chore_rooms(conn, chore_id: str, room_ids: List[str]):
    cursor = conn.cursor()
    cursor.execute("DELETE FROM chore_rooms WHERE chore_id = ?", (chore_id,))
    if room_ids:
        cursor.executemany(
            "INSERT INTO chore_rooms (chore_id, room_id) VALUES (?, ?)",
            [(chore_id, room_id) for room_id in room_ids]
        )

def validate_date_or_400(value: str, field_name: str = "date") -> str:
    try:
        date.fromisoformat(value)
    except ValueError:
        raise HTTPException(status_code=400, detail=f"Invalid {field_name} format. Use YYYY-MM-DD")
    return value

def get_missing_chore_ids(conn, chore_ids: List[str]) -> List[str]:
    if not chore_ids:
        return []
    cursor = conn.cursor()
    placeholders = ",".join("?" for _ in chore_ids)
    cursor.execute(f"SELECT id FROM chores WHERE id IN ({placeholders})", chore_ids)
    existing_ids = {row["id"] for row in cursor.fetchall()}
    return [chore_id for chore_id in chore_ids if chore_id not in existing_ids]

def json_or_none(data: Any) -> Optional[str]:
    if data is None:
        return None
    return json.dumps(data)

def log_audit_event(
    conn,
    action: str,
    entity_type: str,
    entity_id: Optional[str] = None,
    before: Optional[Any] = None,
    after: Optional[Any] = None,
    metadata: Optional[Any] = None,
):
    cursor = conn.cursor()
    cursor.execute("""
        INSERT INTO audit_log (created_at, action, entity_type, entity_id, before_json, after_json, metadata_json)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    """, (
        datetime.now(timezone.utc).isoformat(),
        action,
        entity_type,
        entity_id,
        json_or_none(before),
        json_or_none(after),
        json_or_none(metadata),
    ))

def get_room_snapshot(conn, room_id: str) -> Optional[dict]:
    cursor = conn.cursor()
    cursor.execute("SELECT id, name FROM rooms WHERE id = ?", (room_id,))
    row = cursor.fetchone()
    if not row:
        return None
    return {"id": row["id"], "name": row["name"]}

def get_chore_snapshot(conn, chore_id: str) -> Optional[dict]:
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM chores WHERE id = ?", (chore_id,))
    row = cursor.fetchone()
    if not row:
        return None
    room_ids_map = get_room_ids_map(conn)
    return row_to_chore(row, room_ids_map)

def collect_core_counts(conn) -> dict:
    cursor = conn.cursor()
    counts = {}
    for table in ("chores", "rooms", "completions", "daily_order", "chore_rooms"):
        cursor.execute(f"SELECT COUNT(*) AS c FROM {table}")
        counts[table] = cursor.fetchone()["c"]
    return counts


# --- API Routes ---

@app.on_event("startup")
def startup():
    init_db()

@app.get("/")
def root():
    return {"message": "Chore Dashboard API", "status": "running"}

# --- Rooms CRUD ---

@app.get("/rooms", response_model=List[Room])
def get_rooms():
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM rooms ORDER BY name")
        return [{"id": row["id"], "name": row["name"]} for row in cursor.fetchall()]

@app.post("/rooms", response_model=Room)
def create_room(room: RoomCreate):
    room_id = str(uuid.uuid4())
    with get_db() as conn:
        cursor = conn.cursor()
        try:
            cursor.execute("INSERT INTO rooms (id, name) VALUES (?, ?)", (room_id, room.name))
            room_snapshot = {"id": room_id, "name": room.name}
            log_audit_event(conn, action="create", entity_type="room", entity_id=room_id, after=room_snapshot)
            conn.commit()
        except sqlite3.IntegrityError:
            raise HTTPException(status_code=400, detail="Room name already exists")
    return {"id": room_id, "name": room.name}

@app.put("/rooms/{room_id}", response_model=Room)
def update_room(room_id: str, room: RoomUpdate):
    with get_db() as conn:
        before_snapshot = get_room_snapshot(conn, room_id)
        if not before_snapshot:
            raise HTTPException(status_code=404, detail="Room not found")
        cursor = conn.cursor()
        try:
            cursor.execute("UPDATE rooms SET name=? WHERE id=?", (room.name, room_id))
        except sqlite3.IntegrityError:
            raise HTTPException(status_code=400, detail="Room name already exists")
        if cursor.rowcount == 0:
            raise HTTPException(status_code=404, detail="Room not found")
        after_snapshot = get_room_snapshot(conn, room_id)
        log_audit_event(conn, action="update", entity_type="room", entity_id=room_id, before=before_snapshot, after=after_snapshot)
        conn.commit()
    return {"id": room_id, "name": room.name}

@app.delete("/rooms/{room_id}")
def delete_room(room_id: str):
    with get_db() as conn:
        before_snapshot = get_room_snapshot(conn, room_id)
        if not before_snapshot:
            raise HTTPException(status_code=404, detail="Room not found")
        cursor = conn.cursor()
        cursor.execute("SELECT COUNT(*) AS c FROM chore_rooms WHERE room_id = ?", (room_id,))
        room_links = cursor.fetchone()["c"]
        cursor.execute("DELETE FROM chore_rooms WHERE room_id = ?", (room_id,))
        cursor.execute("DELETE FROM rooms WHERE id = ?", (room_id,))
        if cursor.rowcount == 0:
            raise HTTPException(status_code=404, detail="Room not found")
        log_audit_event(
            conn,
            action="delete",
            entity_type="room",
            entity_id=room_id,
            before=before_snapshot,
            metadata={"chore_links_removed": room_links},
        )
        conn.commit()
    return {"deleted": room_id}

# --- Chores CRUD ---

@app.get("/chores", response_model=List[Chore])
def get_all_chores():
    """Get all chores"""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM chores ORDER BY schedule_type, name")
        rows = cursor.fetchall()
        room_ids_map = get_room_ids_map(conn)
        return [row_to_chore(row, room_ids_map) for row in rows]

@app.get("/chores/{chore_id}", response_model=Chore)
def get_chore(chore_id: str):
    """Get a single chore by ID"""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM chores WHERE id = ?", (chore_id,))
        row = cursor.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Chore not found")
        room_ids_map = get_room_ids_map(conn)
        return row_to_chore(row, room_ids_map)

@app.post("/chores", response_model=Chore)
def create_chore(chore: ChoreCreate):
    """Create a new chore"""
    chore_id = str(uuid.uuid4())
    schedule_json = json.dumps(chore.schedule) if chore.schedule else None
    schedule_type = chore.schedule_type
    tags_json = json.dumps(chore.tags) if chore.tags else None
    is_active = 1 if (chore.is_active is None or chore.is_active) else 0
    room_ids = chore.room_ids or []
    
    with get_db() as conn:
        cursor = conn.cursor()
        if chore.parent_id:
            # Sub-tasks must inherit parent schedule
            cursor.execute("SELECT schedule_type, schedule_json, is_active, tags_json FROM chores WHERE id = ?", (chore.parent_id,))
            parent = cursor.fetchone()
            if not parent:
                raise HTTPException(status_code=400, detail="Parent chore not found")
            schedule_type = parent["schedule_type"]
            schedule_json = parent["schedule_json"]
            if tags_json is None and "tags_json" in parent.keys():
                tags_json = parent["tags_json"]
            if chore.is_active is None and "is_active" in parent.keys():
                is_active = parent["is_active"]
            if not room_ids:
                cursor.execute("SELECT room_id FROM chore_rooms WHERE chore_id = ?", (chore.parent_id,))
                room_ids = [r["room_id"] for r in cursor.fetchall()]
        cursor.execute("""
            INSERT INTO chores (id, name, schedule_type, schedule_json, time_of_day, minutes, parent_id, global_order, is_active, tags_json)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (chore_id, chore.name, schedule_type, schedule_json, chore.time_of_day, chore.minutes, chore.parent_id, chore.global_order or 0, is_active, tags_json))
        set_chore_rooms(conn, chore_id, room_ids)
        if chore.parent_id:
            # Parent chores with sub-tasks should not keep time/minutes
            cursor.execute("UPDATE chores SET time_of_day = NULL, minutes = NULL WHERE id = ?", (chore.parent_id,))
        created_snapshot = get_chore_snapshot(conn, chore_id)
        log_audit_event(
            conn,
            action="create",
            entity_type="chore",
            entity_id=chore_id,
            after=created_snapshot,
            metadata={"parent_id": chore.parent_id},
        )
        conn.commit()
    
    return {**chore.model_dump(), "id": chore_id, "schedule_type": schedule_type, "schedule": json.loads(schedule_json) if schedule_json else None, "tags": json.loads(tags_json) if tags_json else [], "is_active": bool(is_active), "room_ids": room_ids}

@app.put("/chores/{chore_id}", response_model=Chore)
def update_chore(chore_id: str, chore: ChoreUpdate):
    """Update an existing chore"""
    schedule_json = json.dumps(chore.schedule) if chore.schedule else None
    tags_json = json.dumps(chore.tags) if chore.tags else None
    is_active = 1 if (chore.is_active is None or chore.is_active) else 0
    room_ids = chore.room_ids or []
    
    with get_db() as conn:
        cursor = conn.cursor()
        before_snapshot = get_chore_snapshot(conn, chore_id)
        if not before_snapshot:
            raise HTTPException(status_code=404, detail="Chore not found")

        # If this is a sub-task, force schedule to match parent
        if chore.parent_id:
            cursor.execute("SELECT schedule_type, schedule_json, is_active, tags_json FROM chores WHERE id = ?", (chore.parent_id,))
            parent = cursor.fetchone()
            if not parent:
                raise HTTPException(status_code=400, detail="Parent chore not found")
            schedule_json = parent["schedule_json"]
            chore.schedule_type = parent["schedule_type"]
            chore.schedule = json.loads(schedule_json) if schedule_json else None
            if tags_json is None and "tags_json" in parent.keys():
                tags_json = parent["tags_json"]
            if chore.is_active is None and "is_active" in parent.keys():
                is_active = parent["is_active"]
            if not room_ids:
                cursor.execute("SELECT room_id FROM chore_rooms WHERE chore_id = ?", (chore.parent_id,))
                room_ids = [r["room_id"] for r in cursor.fetchall()]

        cursor.execute("""
            UPDATE chores SET name=?, schedule_type=?, schedule_json=?, time_of_day=?, minutes=?, parent_id=?, global_order=?, is_active=?, tags_json=?
            WHERE id=?
        """, (chore.name, chore.schedule_type, schedule_json, chore.time_of_day, chore.minutes, chore.parent_id, chore.global_order or 0, is_active, tags_json, chore_id))
        set_chore_rooms(conn, chore_id, room_ids)
        # If this is a parent chore, cascade schedule updates to all sub-tasks
        if not chore.parent_id:
            cursor.execute("""
                UPDATE chores SET schedule_type=?, schedule_json=?, is_active=?, tags_json=?
                WHERE parent_id=?
            """, (chore.schedule_type, schedule_json, is_active, tags_json, chore_id))
            cursor.execute("SELECT id FROM chores WHERE parent_id = ?", (chore_id,))
            for row in cursor.fetchall():
                set_chore_rooms(conn, row["id"], room_ids)
        after_snapshot = get_chore_snapshot(conn, chore_id)
        log_audit_event(
            conn,
            action="update",
            entity_type="chore",
            entity_id=chore_id,
            before=before_snapshot,
            after=after_snapshot,
        )
        conn.commit()
    
    return {**chore.model_dump(), "id": chore_id}

@app.delete("/chores/{chore_id}")
def delete_chore(chore_id: str):
    """Delete a chore and its sub-tasks"""
    with get_db() as conn:
        before_snapshot = get_chore_snapshot(conn, chore_id)
        if not before_snapshot:
            raise HTTPException(status_code=404, detail="Chore not found")
        cursor = conn.cursor()
        cursor.execute("SELECT id FROM chores WHERE parent_id = ?", (chore_id,))
        subtask_ids = [row["id"] for row in cursor.fetchall()]
        # With foreign keys enabled, this cascades to sub-tasks and related rows.
        cursor.execute("DELETE FROM chores WHERE id = ?", (chore_id,))
        if cursor.rowcount == 0:
            raise HTTPException(status_code=404, detail="Chore not found")
        log_audit_event(
            conn,
            action="delete",
            entity_type="chore",
            entity_id=chore_id,
            before=before_snapshot,
            metadata={"deleted_subtask_ids": subtask_ids},
        )
        conn.commit()
    return {"deleted": chore_id}


@app.put("/chores/global-order")
def update_global_order(update: OrderUpdate):
    """Update global order for chores (list of chore IDs in order)"""
    with get_db() as conn:
        missing_ids = get_missing_chore_ids(conn, update.order)
        if missing_ids:
            raise HTTPException(status_code=400, detail={"message": "Unknown chore IDs in order", "ids": missing_ids})
        before_order = []
        if update.order:
            cursor = conn.cursor()
            placeholders = ",".join("?" for _ in update.order)
            cursor.execute(f"SELECT id, global_order FROM chores WHERE id IN ({placeholders})", update.order)
            existing = {row["id"]: row["global_order"] for row in cursor.fetchall()}
            before_order = [{"id": chore_id, "global_order": existing.get(chore_id)} for chore_id in update.order]
        cursor = conn.cursor()
        for idx, chore_id in enumerate(update.order):
            cursor.execute("UPDATE chores SET global_order=? WHERE id=?", (idx, chore_id))
        after_order = [{"id": chore_id, "global_order": idx} for idx, chore_id in enumerate(update.order)]
        log_audit_event(
            conn,
            action="reorder",
            entity_type="global_order",
            entity_id="global",
            before={"order": before_order},
            after={"order": after_order},
            metadata={"count": len(update.order)},
        )
        conn.commit()
    return {"updated": len(update.order)}


@app.get("/daily-order/{date_str}")
def get_daily_order(date_str: str):
    """Get daily order overrides for a specific date"""
    validate_date_or_400(date_str)
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT chore_id FROM daily_order
            WHERE date = ?
            ORDER BY order_index
        """, (date_str,))
        return {"date": date_str, "order": [row["chore_id"] for row in cursor.fetchall()]}


@app.put("/daily-order/{date_str}")
def set_daily_order(date_str: str, update: OrderUpdate):
    """Replace daily order overrides for a specific date"""
    validate_date_or_400(date_str)
    with get_db() as conn:
        missing_ids = get_missing_chore_ids(conn, update.order)
        if missing_ids:
            raise HTTPException(status_code=400, detail={"message": "Unknown chore IDs in order", "ids": missing_ids})
        cursor = conn.cursor()
        cursor.execute("""
            SELECT chore_id FROM daily_order
            WHERE date = ?
            ORDER BY order_index
        """, (date_str,))
        before_order = [row["chore_id"] for row in cursor.fetchall()]
        cursor.execute("DELETE FROM daily_order WHERE date = ?", (date_str,))
        for idx, chore_id in enumerate(update.order):
            cursor.execute(
                "INSERT INTO daily_order (date, chore_id, order_index) VALUES (?, ?, ?)",
                (date_str, chore_id, idx)
            )
        log_audit_event(
            conn,
            action="reorder",
            entity_type="daily_order",
            entity_id=date_str,
            before={"order": before_order},
            after={"order": update.order},
        )
        conn.commit()
    return {"date": date_str, "updated": len(update.order)}


# --- Sub-tasks Endpoints ---

@app.get("/chores/{chore_id}/subtasks")
def get_subtasks(chore_id: str):
    """Get all sub-tasks for a chore"""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM chores WHERE parent_id = ? ORDER BY time_of_day, name", (chore_id,))
        rows = cursor.fetchall()
        room_ids_map = get_room_ids_map(conn)
        subtasks = [row_to_chore(row, room_ids_map) for row in rows]
    return {"parent_id": chore_id, "subtasks": subtasks}


@app.get("/chores-with-subtasks")
def get_all_chores_with_subtasks():
    """Get all chores with their sub-tasks nested"""
    with get_db() as conn:
        cursor = conn.cursor()
        # Get all chores
        cursor.execute("SELECT * FROM chores ORDER BY schedule_type, name")
        rows = cursor.fetchall()
        room_ids_map = get_room_ids_map(conn)
        all_chores = [row_to_chore(row, room_ids_map) for row in rows]
    
    # Build parent -> subtasks map
    subtasks_map = {}
    parents_with_subtasks = set()
    for chore in all_chores:
        if chore["parent_id"]:
            parents_with_subtasks.add(chore["parent_id"])
            if chore["parent_id"] not in subtasks_map:
                subtasks_map[chore["parent_id"]] = []
            subtasks_map[chore["parent_id"]].append(chore)
    
    # Build result: top-level chores with nested subtasks
    result = []
    for chore in all_chores:
        if not chore["parent_id"]:  # Top-level chore
            chore_copy = {**chore}
            chore_copy["subtasks"] = subtasks_map.get(chore["id"], [])
            chore_copy["has_subtasks"] = chore["id"] in parents_with_subtasks
            # Calculate total minutes from subtasks if parent has subtasks
            if chore_copy["has_subtasks"]:
                chore_copy["total_minutes"] = sum(s["minutes"] or 0 for s in chore_copy["subtasks"])
            else:
                chore_copy["total_minutes"] = chore["minutes"] or 0
            result.append(chore_copy)
    
    return result


def get_all_chores_flat(conn) -> List[dict]:
    """Load all chores as a flat list with decoded JSON fields."""
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM chores")
    rows = cursor.fetchall()
    room_ids_map = get_room_ids_map(conn)
    return [row_to_chore(row, room_ids_map) for row in rows]


def get_matching_leaf_chores_for_date(all_chores: List[dict], check_date: date) -> List[dict]:
    """
    Return chores for a date at leaf level:
    - include standalone chores
    - include sub-tasks when their parent matches the date
    - exclude parent chores that have sub-tasks
    """
    parents_with_subtasks = set(c["parent_id"] for c in all_chores if c["parent_id"])
    chores_by_id = {c["id"]: c for c in all_chores}
    parent_matches_cache = {}

    def matches_date(chore: dict) -> bool:
        if not chore.get("is_active", True):
            return False
        return matches_schedule(chore["schedule_type"], chore.get("schedule") or {}, check_date)

    matching = []
    for chore in all_chores:
        if not chore.get("is_active", True):
            continue
        # Skip parent chores that have sub-tasks (we include leaf subtasks instead).
        if chore["id"] in parents_with_subtasks:
            continue

        parent_id = chore.get("parent_id")
        if parent_id:
            parent = chores_by_id.get(parent_id)
            if not parent:
                continue
            if parent_id not in parent_matches_cache:
                parent_matches_cache[parent_id] = matches_date(parent)
            if parent_matches_cache[parent_id]:
                matching.append({**chore, "parent_name": parent["name"]})
            continue

        if matches_date(chore):
            matching.append(chore)

    return matching


@app.get("/chores/for-date/{date_str}")
def get_chores_for_date(date_str: str):
    """Get all chores that apply to a specific date (leaf-level only: sub-tasks + standalone chores)"""
    try:
        check_date = date.fromisoformat(date_str)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid date format. Use YYYY-MM-DD")
    
    with get_db() as conn:
        all_chores = get_all_chores_flat(conn)
    
    matching = get_matching_leaf_chores_for_date(all_chores, check_date)
    return {"date": date_str, "chores": matching}


@app.get("/chores/for-range/{start}/{end}")
def get_chores_for_range(start: str, end: str):
    """Get matching chores for each date in an inclusive date range."""
    try:
        start_date = date.fromisoformat(start)
        end_date = date.fromisoformat(end)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid date format. Use YYYY-MM-DD")

    if end_date < start_date:
        raise HTTPException(status_code=400, detail="end must be on or after start")

    with get_db() as conn:
        all_chores = get_all_chores_flat(conn)

    chores_by_date = {}
    current = start_date
    while current <= end_date:
        key = current.isoformat()
        chores_by_date[key] = get_matching_leaf_chores_for_date(all_chores, current)
        current += timedelta(days=1)

    return {"start": start, "end": end, "chores_by_date": chores_by_date}



# --- Completions ---

@app.get("/completions/{date_str}")
def get_completions_for_date(date_str: str):
    """Get all completed chore IDs for a specific date"""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT chore_id FROM completions WHERE completed_date = ?", (date_str,))
        return {"date": date_str, "completed": [row["chore_id"] for row in cursor.fetchall()]}

@app.get("/completions")
def get_completions_range(start: str, end: str):
    """Get completions for a date range (for calendar view)"""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT completed_date, chore_id FROM completions 
            WHERE completed_date BETWEEN ? AND ?
            ORDER BY completed_date
        """, (start, end))
        
        # Group by date
        result = {}
        for row in cursor.fetchall():
            d = row["completed_date"]
            if d not in result:
                result[d] = []
            result[d].append(row["chore_id"])
        return result

@app.post("/completions/toggle")
def toggle_completion(data: CompletionToggle):
    """Toggle a completion - if exists, delete; if not, create"""
    with get_db() as conn:
        cursor = conn.cursor()

        cursor.execute("SELECT 1 FROM chores WHERE id = ?", (data.chore_id,))
        if not cursor.fetchone():
            raise HTTPException(status_code=404, detail="Chore not found")
        
        # Check if completion exists
        cursor.execute(
            "SELECT 1 FROM completions WHERE chore_id = ? AND completed_date = ?",
            (data.chore_id, data.date)
        )
        exists = cursor.fetchone()
        
        if exists:
            cursor.execute(
                "DELETE FROM completions WHERE chore_id = ? AND completed_date = ?",
                (data.chore_id, data.date)
            )
            log_audit_event(
                conn,
                action="toggle",
                entity_type="completion",
                entity_id=data.chore_id,
                before={"completed": True},
                after={"completed": False},
                metadata={"date": data.date},
            )
            conn.commit()
            return {"chore_id": data.chore_id, "date": data.date, "completed": False}
        else:
            try:
                cursor.execute(
                    "INSERT INTO completions (chore_id, completed_date) VALUES (?, ?)",
                    (data.chore_id, data.date)
                )
            except sqlite3.IntegrityError:
                raise HTTPException(status_code=400, detail="Invalid completion payload")
            log_audit_event(
                conn,
                action="toggle",
                entity_type="completion",
                entity_id=data.chore_id,
                before={"completed": False},
                after={"completed": True},
                metadata={"date": data.date},
            )
            conn.commit()
            return {"chore_id": data.chore_id, "date": data.date, "completed": True}


# --- Reset ---

@app.post("/reset")
def reset_to_defaults():
    """Reset app data to default seeded chores."""
    with get_db() as conn:
        cursor = conn.cursor()
        before_counts = collect_core_counts(conn)

        # Deleting chores cascades to completions/daily_order/chore_rooms.
        cursor.execute("DELETE FROM chores")
        cursor.execute("DELETE FROM rooms")
        conn.commit()

        seed_default_chores(conn)
        after_counts = collect_core_counts(conn)
        log_audit_event(
            conn,
            action="reset",
            entity_type="system",
            entity_id="default_seed",
            before=before_counts,
            after=after_counts,
        )
        conn.commit()

    return {"status": "ok", "reset": True}


# --- Utility ---


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
