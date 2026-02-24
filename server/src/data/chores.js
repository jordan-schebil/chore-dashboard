export function parseJsonField(raw) {
  if (!raw) {
    return null;
  }
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function getRoomIdsMap(db) {
  const rows = db.prepare(`SELECT chore_id, room_id FROM chore_rooms`).all();
  const mapping = {};

  for (const row of rows) {
    if (!mapping[row.chore_id]) {
      mapping[row.chore_id] = [];
    }
    mapping[row.chore_id].push(row.room_id);
  }

  return mapping;
}

export function rowToChore(row, roomIdsMap = null) {
  const schedule = parseJsonField(row.schedule_json);
  const parsedTags = parseJsonField(row.tags_json);
  const roomIds = roomIdsMap ? roomIdsMap[row.id] || [] : [];

  return {
    id: row.id,
    name: row.name,
    schedule_type: row.schedule_type,
    schedule,
    time_of_day: Object.prototype.hasOwnProperty.call(row, 'time_of_day') ? row.time_of_day : null,
    minutes: Object.prototype.hasOwnProperty.call(row, 'minutes') ? row.minutes : null,
    parent_id: Object.prototype.hasOwnProperty.call(row, 'parent_id') ? row.parent_id : null,
    global_order: Object.prototype.hasOwnProperty.call(row, 'global_order') ? row.global_order ?? 0 : 0,
    is_active: Object.prototype.hasOwnProperty.call(row, 'is_active') ? Boolean(row.is_active) : true,
    tags: Array.isArray(parsedTags) ? parsedTags : [],
    room_ids: roomIds
  };
}

export function getAllChoresFlat(db) {
  const rows = db.prepare(`SELECT * FROM chores`).all();
  const roomIdsMap = getRoomIdsMap(db);
  return rows.map((row) => rowToChore(row, roomIdsMap));
}

export function getChoreById(db, choreId) {
  const row = db.prepare(`SELECT * FROM chores WHERE id = ?`).get(choreId);
  if (!row) {
    return null;
  }
  const roomIdsMap = getRoomIdsMap(db);
  return rowToChore(row, roomIdsMap);
}

export function getChoreSnapshot(db, choreId) {
  return getChoreById(db, choreId);
}

export function getChoresSorted(db) {
  const rows = db.prepare(`SELECT * FROM chores ORDER BY schedule_type, name`).all();
  const roomIdsMap = getRoomIdsMap(db);
  return rows.map((row) => rowToChore(row, roomIdsMap));
}

export function getSubtasksForChore(db, choreId) {
  const rows = db
    .prepare(`SELECT * FROM chores WHERE parent_id = ? ORDER BY time_of_day, name`)
    .all(choreId);
  const roomIdsMap = getRoomIdsMap(db);
  return rows.map((row) => rowToChore(row, roomIdsMap));
}

export function getRoomsSorted(db) {
  return db.prepare(`SELECT id, name FROM rooms ORDER BY name`).all();
}

export function getRoomSnapshot(db, roomId) {
  const row = db.prepare(`SELECT id, name FROM rooms WHERE id = ?`).get(roomId);
  if (!row) {
    return null;
  }
  return { id: row.id, name: row.name };
}

export function getRoomIdsForChore(db, choreId) {
  return db
    .prepare(`SELECT room_id FROM chore_rooms WHERE chore_id = ?`)
    .all(choreId)
    .map((row) => row.room_id);
}

export function setChoreRooms(db, choreId, roomIds) {
  db.prepare(`DELETE FROM chore_rooms WHERE chore_id = ?`).run(choreId);

  if (!Array.isArray(roomIds) || roomIds.length === 0) {
    return;
  }

  const insert = db.prepare(`INSERT INTO chore_rooms (chore_id, room_id) VALUES (?, ?)`);
  for (const roomId of roomIds) {
    insert.run(choreId, roomId);
  }
}

export function getDailyOrderForDate(db, dateStr) {
  const rows = db
    .prepare(
      `
      SELECT chore_id FROM daily_order
      WHERE date = ?
      ORDER BY order_index
    `
    )
    .all(dateStr);
  return rows.map((row) => row.chore_id);
}

export function getCompletionsForDate(db, dateStr) {
  const rows = db.prepare(`SELECT chore_id FROM completions WHERE completed_date = ?`).all(dateStr);
  return rows.map((row) => row.chore_id);
}

export function getCompletionsRange(db, start, end) {
  const rows = db
    .prepare(
      `
      SELECT completed_date, chore_id FROM completions
      WHERE completed_date BETWEEN ? AND ?
      ORDER BY completed_date
    `
    )
    .all(start, end);

  const result = {};
  for (const row of rows) {
    if (!result[row.completed_date]) {
      result[row.completed_date] = [];
    }
    result[row.completed_date].push(row.chore_id);
  }
  return result;
}
