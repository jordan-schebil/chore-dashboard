-- ============================================================================
-- Chore Dashboard SQLite Schema
-- ============================================================================
-- Designed to replace the browser localStorage with a proper relational DB.
-- Key design decisions:
--   1. Single 'chores' table with frequency as a column (vs. separate tables)
--      Pros: Simpler queries, easier API, matches how the frontend groups data
--   2. Nullable scheduling columns - only populated based on frequency type
--   3. Completion stored as date + chore_id pairs (normalized)
-- ============================================================================

-- Enable foreign keys (SQLite has them disabled by default)
PRAGMA foreign_keys = ON;

-- ============================================================================
-- LOOKUP TABLES
-- ============================================================================

-- Frequency types with display metadata
CREATE TABLE frequencies (
    id          TEXT PRIMARY KEY,  -- 'daily', 'weekly', etc.
    label       TEXT NOT NULL,     -- 'Daily', 'Weekly', etc.
    sort_order  INTEGER NOT NULL   -- For consistent ordering in UI
);

INSERT INTO frequencies (id, label, sort_order) VALUES
    ('daily', 'Daily', 1),
    ('weekly', 'Weekly', 2),
    ('monthly', 'Monthly', 3),
    ('quarterly', 'Quarterly', 4),
    ('adhoc', 'Ad Hoc', 5);

-- Time of day options
CREATE TABLE time_of_day (
    id    TEXT PRIMARY KEY,  -- 'AM', 'PM'
    label TEXT NOT NULL
);

INSERT INTO time_of_day (id, label) VALUES
    ('AM', 'Morning'),
    ('PM', 'Evening');

-- ============================================================================
-- MAIN TABLES
-- ============================================================================

-- Chores table - all frequencies in one table
-- Nullable columns depend on frequency type:
--   daily:     no scheduling columns needed
--   weekly:    day_of_week
--   monthly:   week_of_month, day_of_week
--   quarterly: month_of_quarter, week_of_month, day_of_week
--   adhoc:     scheduled_date
CREATE TABLE chores (
    id                TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    name              TEXT NOT NULL,
    frequency         TEXT NOT NULL REFERENCES frequencies(id),
    time_of_day       TEXT NOT NULL DEFAULT 'AM' REFERENCES time_of_day(id),
    minutes           INTEGER NOT NULL DEFAULT 10 CHECK (minutes > 0),
    
    -- Scheduling fields (nullable based on frequency)
    day_of_week       INTEGER CHECK (day_of_week BETWEEN 0 AND 6),  -- 0=Sun, 6=Sat
    week_of_month     INTEGER CHECK (week_of_month BETWEEN 1 AND 4),
    month_of_quarter  INTEGER CHECK (month_of_quarter BETWEEN 1 AND 3),
    scheduled_date    TEXT,  -- ISO date 'YYYY-MM-DD' for adhoc chores
    
    -- Metadata
    created_at        TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at        TEXT NOT NULL DEFAULT (datetime('now')),
    is_active         INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1))
);

-- Completed tasks - tracks when a chore was completed on a specific date
-- Uses composite PK since a chore can only be completed once per day
CREATE TABLE completed_tasks (
    chore_id       TEXT NOT NULL REFERENCES chores(id) ON DELETE CASCADE,
    completed_date TEXT NOT NULL,  -- ISO date 'YYYY-MM-DD'
    completed_at   TEXT NOT NULL DEFAULT (datetime('now')),
    
    PRIMARY KEY (chore_id, completed_date)
);

-- ============================================================================
-- INDEXES
-- ============================================================================

-- Chores by frequency (for listing pages)
CREATE INDEX idx_chores_frequency ON chores(frequency) WHERE is_active = 1;

-- Chores by scheduling criteria (for date-based lookups)
CREATE INDEX idx_chores_daily ON chores(frequency) 
    WHERE frequency = 'daily' AND is_active = 1;

CREATE INDEX idx_chores_weekly ON chores(frequency, day_of_week) 
    WHERE frequency = 'weekly' AND is_active = 1;

CREATE INDEX idx_chores_monthly ON chores(frequency, week_of_month, day_of_week) 
    WHERE frequency = 'monthly' AND is_active = 1;

CREATE INDEX idx_chores_quarterly ON chores(frequency, month_of_quarter, week_of_month, day_of_week) 
    WHERE frequency = 'quarterly' AND is_active = 1;

CREATE INDEX idx_chores_adhoc ON chores(scheduled_date) 
    WHERE frequency = 'adhoc' AND is_active = 1;

-- Completed tasks by date (for daily views)
CREATE INDEX idx_completed_by_date ON completed_tasks(completed_date);

-- ============================================================================
-- VIEWS (useful for reporting - familiar territory for you!)
-- ============================================================================

-- Active chores with frequency labels
CREATE VIEW v_chores AS
SELECT 
    c.id,
    c.name,
    c.frequency,
    f.label AS frequency_label,
    c.time_of_day,
    c.minutes,
    c.day_of_week,
    c.week_of_month,
    c.month_of_quarter,
    c.scheduled_date,
    c.created_at,
    c.updated_at
FROM chores c
JOIN frequencies f ON c.frequency = f.id
WHERE c.is_active = 1
ORDER BY f.sort_order, c.time_of_day, c.name;

-- Completion summary by date (great for calendar heatmap)
CREATE VIEW v_daily_summary AS
SELECT 
    ct.completed_date,
    COUNT(*) AS completed_count,
    SUM(c.minutes) AS completed_minutes
FROM completed_tasks ct
JOIN chores c ON ct.chore_id = c.id
GROUP BY ct.completed_date;

-- Chore completion rates (analytics!)
CREATE VIEW v_chore_stats AS
SELECT 
    c.id,
    c.name,
    c.frequency,
    c.minutes,
    COUNT(ct.completed_date) AS times_completed,
    MAX(ct.completed_date) AS last_completed
FROM chores c
LEFT JOIN completed_tasks ct ON c.id = ct.chore_id
WHERE c.is_active = 1
GROUP BY c.id;

-- ============================================================================
-- TRIGGERS
-- ============================================================================

-- Auto-update the updated_at timestamp
CREATE TRIGGER trg_chores_updated_at
AFTER UPDATE ON chores
FOR EACH ROW
BEGIN
    UPDATE chores SET updated_at = datetime('now') WHERE id = NEW.id;
END;

-- ============================================================================
-- SEED DATA (matches your current default chores)
-- ============================================================================

-- Daily chores
INSERT INTO chores (name, frequency, time_of_day, minutes) VALUES
    ('Make bed', 'daily', 'AM', 3),
    ('Scoop litter boxes', 'daily', 'AM', 5),
    ('Wipe bathroom sink and counter', 'daily', 'AM', 3),
    ('Vacuum all floors', 'daily', 'AM', 20),
    ('Dishes / load dishwasher', 'daily', 'PM', 10),
    ('Wipe kitchen counters', 'daily', 'PM', 5),
    ('Take out trash when full', 'daily', 'PM', 5),
    ('Pick up clutter / return items to place', 'daily', 'PM', 10);

-- Weekly chores
INSERT INTO chores (name, frequency, time_of_day, minutes, day_of_week) VALUES
    ('Mop hard floors', 'weekly', 'AM', 20, 1),
    ('Clean toilets', 'weekly', 'AM', 10, 2),
    ('Clean showers/tubs', 'weekly', 'AM', 15, 2),
    ('Dust surfaces', 'weekly', 'AM', 15, 3),
    ('Clean mirrors', 'weekly', 'AM', 10, 3),
    ('Wipe down kitchen appliances', 'weekly', 'PM', 10, 4),
    ('Brush dog and cats', 'weekly', 'PM', 20, 4),
    ('Empty all small trash cans', 'weekly', 'AM', 10, 5),
    ('Change bed linens', 'weekly', 'AM', 15, 6),
    ('Laundry (wash, dry, fold, put away)', 'weekly', 'AM', 45, 6),
    ('Wash food and water bowls', 'weekly', 'PM', 10, 0);

-- Monthly chores
INSERT INTO chores (name, frequency, time_of_day, minutes, week_of_month, day_of_week) VALUES
    ('Vacuum upholstery and mattresses', 'monthly', 'AM', 25, 1, 6),
    ('Wash throw blankets and pillows', 'monthly', 'AM', 20, 1, 6),
    ('Clean Keurig and toaster oven', 'monthly', 'PM', 15, 1, 6),
    ('Clean inside microwave and oven', 'monthly', 'AM', 20, 2, 6),
    ('Deep clean litter boxes', 'monthly', 'AM', 20, 2, 6),
    ('Clean out fridge', 'monthly', 'PM', 25, 2, 6),
    ('Wipe cabinet fronts', 'monthly', 'AM', 20, 3, 6),
    ('Dust blinds and ceiling fans', 'monthly', 'AM', 25, 3, 6),
    ('Clean window sills and baseboards', 'monthly', 'AM', 30, 4, 6),
    ('Clean cat trees and scratching posts', 'monthly', 'PM', 20, 4, 6);

-- Quarterly chores
INSERT INTO chores (name, frequency, time_of_day, minutes, month_of_quarter, week_of_month, day_of_week) VALUES
    ('Deep clean carpets', 'quarterly', 'AM', 60, 1, 1, 6),
    ('Flip or rotate mattress', 'quarterly', 'AM', 10, 1, 1, 6),
    ('Deep clean furniture for embedded pet hair', 'quarterly', 'PM', 45, 1, 1, 6),
    ('Change furnace filter', 'quarterly', 'PM', 10, 1, 1, 6),
    ('Wash windows inside and out', 'quarterly', 'AM', 60, 2, 1, 6),
    ('Clean dryer vent', 'quarterly', 'AM', 20, 2, 1, 6),
    ('Organize closets', 'quarterly', 'PM', 60, 2, 1, 6),
    ('Clean behind and under large furniture', 'quarterly', 'AM', 45, 3, 1, 6),
    ('Clean garage or storage areas', 'quarterly', 'AM', 90, 3, 1, 6),
    ('Vacuum basement', 'quarterly', 'PM', 30, 3, 1, 6);

-- Ad-hoc chores
INSERT INTO chores (name, frequency, time_of_day, minutes, scheduled_date) VALUES
    ('Fix leaky faucet in bathroom', 'adhoc', 'AM', 45, '2026-02-15'),
    ('Organize garage sale items', 'adhoc', 'PM', 120, '2026-02-08');
