import Database from 'better-sqlite3';

export function createDb(config) {
  const db = new Database(config.databasePath);
  db.pragma('foreign_keys = ON');
  return db;
}
