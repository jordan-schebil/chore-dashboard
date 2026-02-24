import { httpError } from './http-error.js';

export function normalizeOrderList(order) {
  if (!Array.isArray(order)) {
    throw httpError(422, { message: 'order must be an array' }, 'order_must_be_array');
  }

  const normalized = [];
  const seen = new Set();

  for (const value of order) {
    const cleaned = String(value ?? '').trim();
    if (!cleaned) {
      throw httpError(
        422,
        { message: 'order cannot contain empty chore IDs' },
        'order_contains_empty_chore_id'
      );
    }
    if (seen.has(cleaned)) {
      throw httpError(
        422,
        { message: 'order cannot contain duplicate chore IDs' },
        'order_contains_duplicate_chore_id'
      );
    }
    seen.add(cleaned);
    normalized.push(cleaned);
  }

  return normalized;
}

export function getMissingChoreIds(db, choreIds) {
  if (!Array.isArray(choreIds) || choreIds.length === 0) {
    return [];
  }

  const placeholders = choreIds.map(() => '?').join(',');
  const rows = db.prepare(`SELECT id FROM chores WHERE id IN (${placeholders})`).all(...choreIds);
  const existingIds = new Set(rows.map((row) => row.id));
  return choreIds.filter((id) => !existingIds.has(id));
}
