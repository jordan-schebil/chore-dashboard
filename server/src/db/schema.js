import { seedDefaultChores } from './seed-default-chores.js';
import { migrateLegacyChoresToScheduleSchema } from './migrate-legacy-chores.js';

function createChoresTable(db) {
  db.prepare(`
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
  `).run();
}

function getChoresColumns(db) {
  return db.prepare(`PRAGMA table_info(chores)`).all().map((row) => row.name);
}

function ensureChoresSchema(db) {
  const columns = getChoresColumns(db);

  if (columns.length === 0) {
    createChoresTable(db);
    return;
  }

  if (!columns.includes('schedule_type')) {
    migrateLegacyChoresToScheduleSchema(db);
    return;
  }

  const addColumnIfMissing = (name, sql) => {
    if (!columns.includes(name)) {
      db.prepare(sql).run();
    }
  };

  addColumnIfMissing('parent_id', `ALTER TABLE chores ADD COLUMN parent_id TEXT DEFAULT NULL`);
  addColumnIfMissing('global_order', `ALTER TABLE chores ADD COLUMN global_order INTEGER DEFAULT 0`);
  addColumnIfMissing('is_active', `ALTER TABLE chores ADD COLUMN is_active INTEGER DEFAULT 1`);
  addColumnIfMissing('tags_json', `ALTER TABLE chores ADD COLUMN tags_json TEXT`);
}

function ensureSupportingTables(db) {
  db.prepare(`
    CREATE TABLE IF NOT EXISTS completions (
      chore_id TEXT NOT NULL,
      completed_date TEXT NOT NULL,
      PRIMARY KEY (chore_id, completed_date),
      FOREIGN KEY (chore_id) REFERENCES chores(id) ON DELETE CASCADE
    )
  `).run();

  db.prepare(`
    CREATE TABLE IF NOT EXISTS daily_order (
      date TEXT NOT NULL,
      chore_id TEXT NOT NULL,
      order_index INTEGER NOT NULL,
      PRIMARY KEY (date, chore_id),
      FOREIGN KEY (chore_id) REFERENCES chores(id) ON DELETE CASCADE
    )
  `).run();

  db.prepare(`
    CREATE TABLE IF NOT EXISTS rooms (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE
    )
  `).run();

  db.prepare(`
    CREATE TABLE IF NOT EXISTS chore_rooms (
      chore_id TEXT NOT NULL,
      room_id TEXT NOT NULL,
      PRIMARY KEY (chore_id, room_id),
      FOREIGN KEY (chore_id) REFERENCES chores(id) ON DELETE CASCADE,
      FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE
    )
  `).run();

  db.prepare(`
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
  `).run();
}

function ensureIndexes(db) {
  const statements = [
    `CREATE INDEX IF NOT EXISTS idx_completions_date ON completions(completed_date)`,
    `CREATE INDEX IF NOT EXISTS idx_chores_schedule_type ON chores(schedule_type)`,
    `CREATE INDEX IF NOT EXISTS idx_chores_parent_id ON chores(parent_id)`,
    `CREATE INDEX IF NOT EXISTS idx_chores_global_order ON chores(global_order)`,
    `CREATE INDEX IF NOT EXISTS idx_daily_order_date ON daily_order(date)`,
    `CREATE INDEX IF NOT EXISTS idx_chore_rooms_chore_id ON chore_rooms(chore_id)`,
    `CREATE INDEX IF NOT EXISTS idx_chore_rooms_room_id ON chore_rooms(room_id)`,
    `CREATE INDEX IF NOT EXISTS idx_audit_log_created_at ON audit_log(created_at)`,
    `CREATE INDEX IF NOT EXISTS idx_audit_log_entity ON audit_log(entity_type, entity_id)`
  ];

  for (const sql of statements) {
    db.prepare(sql).run();
  }
}

function maybeSeedDefaults(db, { seedDefaults }) {
  const count = db.prepare(`SELECT COUNT(*) AS count FROM chores`).get().count;
  if (count !== 0 || !seedDefaults) {
    return { seeded: false, reason: count !== 0 ? 'not-empty' : 'disabled' };
  }

  const seeded = seedDefaultChores(db);
  return { seeded, reason: seeded ? 'seeded' : 'stubbed' };
}

export function initDbSchema(db, options = {}) {
  const settings = { seedDefaults: false, ...options };

  const run = db.transaction(() => {
    ensureChoresSchema(db);
    ensureSupportingTables(db);
    ensureIndexes(db);
    return maybeSeedDefaults(db, settings);
  });

  return run();
}
