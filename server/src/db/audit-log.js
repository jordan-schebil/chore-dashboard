function jsonOrNull(data) {
  if (data === undefined || data === null) {
    return null;
  }
  return JSON.stringify(data);
}

export function logAuditEvent(
  db,
  { action, entityType, entityId = null, before = null, after = null, metadata = null }
) {
  db.prepare(`
    INSERT INTO audit_log (created_at, action, entity_type, entity_id, before_json, after_json, metadata_json)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    new Date().toISOString(),
    action,
    entityType,
    entityId,
    jsonOrNull(before),
    jsonOrNull(after),
    jsonOrNull(metadata)
  );
}

export function collectCoreCounts(db) {
  const counts = {};
  for (const table of ['chores', 'rooms', 'completions', 'daily_order', 'chore_rooms']) {
    counts[table] = db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get().count;
  }
  return counts;
}
