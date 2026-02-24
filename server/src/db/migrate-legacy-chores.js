import { parseIsoDateStrict } from '../lib/dates.js';
import { sundayWeekNumber } from '../services/schedule.js';

function localTodayAsUtcDate() {
  const now = new Date();
  return new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
}

function weekParityForDate(date) {
  return sundayWeekNumber(date) % 2;
}

function monthParityForDate(date) {
  return (date.getUTCMonth() + 1) % 2;
}

function createNewChoresTable(db) {
  db.prepare(`
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
  `).run();
}

function safeParseJson(raw) {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function col(row, name) {
  return Object.prototype.hasOwnProperty.call(row, name) ? row[name] : null;
}

function buildScheduleFromLegacyRow(row, today) {
  const freq = col(row, 'frequency');
  let scheduleType = 'daily';
  let schedule = null;

  if (freq === 'daily') {
    scheduleType = 'daily';
    schedule = {};
  } else if (freq === 'weekly') {
    scheduleType = 'weekly';
    const dow = col(row, 'day_of_week');
    schedule = { days_of_week: dow !== null ? [dow] : [], interval: 1 };
  } else if (freq === 'monthly') {
    scheduleType = 'monthly';
    schedule = {
      mode: 'nth_weekday',
      week_of_month: col(row, 'week_of_month'),
      day_of_week: col(row, 'day_of_week'),
      interval: 1
    };
  } else if (freq === 'quarterly') {
    scheduleType = 'seasonal';
    schedule = {
      month: col(row, 'month_of_quarter'),
      mode: 'nth_weekday',
      week_of_month: col(row, 'week_of_month'),
      day_of_week: col(row, 'day_of_week'),
      interval_months: 3
    };
  } else if (freq === 'custom') {
    const custom = safeParseJson(col(row, 'custom_schedule'));

    if (custom && custom.type === 'one_time') {
      scheduleType = 'one_time';
      schedule = { date: custom.date };
    } else if (custom && custom.type === 'multi_weekly') {
      scheduleType = 'weekly';
      const interval = custom.interval ?? 1;
      schedule = { days_of_week: custom.days_of_week ?? [], interval };
      if (interval > 1) {
        const parityDate = parseIsoDateStrict(custom.start_date) ?? today;
        schedule.week_parity = weekParityForDate(parityDate);
      }
    } else if (custom && custom.type === 'interval_days') {
      scheduleType = 'interval_days';
      schedule = {
        interval: custom.interval ?? 1,
        start_date: custom.start_date
      };
    } else if (custom && custom.type === 'monthly_date') {
      scheduleType = 'monthly';
      const interval = custom.interval ?? 1;
      schedule = {
        mode: 'date',
        day_of_month: custom.day_of_month ?? 1,
        interval
      };
      if (interval > 1) {
        const parityDate = parseIsoDateStrict(custom.start_date) ?? today;
        schedule.month_parity = monthParityForDate(parityDate);
      }
    } else if (custom && custom.type === 'seasonal') {
      scheduleType = 'seasonal';
      schedule = {
        month: custom.month,
        mode: 'nth_weekday',
        week_of_month: custom.week_of_month,
        day_of_week: custom.day_of_week,
        interval_months: 12
      };
    } else {
      scheduleType = 'daily';
      schedule = {};
    }
  }

  return { scheduleType, schedule };
}

export function migrateLegacyChoresToScheduleSchema(db) {
  createNewChoresTable(db);

  const rows = db.prepare(`SELECT * FROM chores`).all();
  const insert = db.prepare(`
    INSERT INTO chores_new (id, name, schedule_type, schedule_json, time_of_day, minutes, parent_id, global_order, is_active, tags_json)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const today = localTodayAsUtcDate();

  for (const row of rows) {
    const { scheduleType, schedule } = buildScheduleFromLegacyRow(row, today);
    insert.run(
      row.id,
      row.name,
      scheduleType,
      schedule !== null ? JSON.stringify(schedule) : null,
      col(row, 'time_of_day'),
      col(row, 'minutes'),
      col(row, 'parent_id'),
      0,
      1,
      null
    );
  }

  db.prepare(`DROP TABLE chores`).run();
  db.prepare(`ALTER TABLE chores_new RENAME TO chores`).run();
}
