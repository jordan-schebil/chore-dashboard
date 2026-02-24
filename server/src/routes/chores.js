import { randomUUID } from 'node:crypto';
import {
  getAllChoresFlat,
  getChoreById,
  getChoreSnapshot,
  getChoresSorted,
  getRoomIdsForChore,
  getSubtasksForChore,
  setChoreRooms
} from '../data/chores.js';
import { logAuditEvent } from '../db/audit-log.js';
import { addDaysUtc, formatIsoDate, parseIsoDateOr400 } from '../lib/dates.js';
import { httpError } from '../lib/http-error.js';
import { getMissingChoreIds } from '../lib/order.js';
import { jsonStringOrNullForOptionalJson, validateChorePayload, validateOrderPayload } from '../lib/validators.js';
import { buildChoresWithSubtasks, getMatchingLeafChoresForDate } from '../services/schedule.js';
import { requireFound, runTransaction } from './route-helpers.js';

function toDbIsActive(value) {
  return value == null || Boolean(value) ? 1 : 0;
}

function defaultRoomIds(value) {
  return Array.isArray(value) ? value : [];
}

function fetchParentForInheritance(db, parentId) {
  return db
    .prepare(`SELECT schedule_type, schedule_json, is_active, tags_json FROM chores WHERE id = ?`)
    .get(parentId);
}

function applyParentInheritanceIfNeeded(db, chore, fieldState) {
  if (!chore.parent_id) {
    return fieldState;
  }

  const parent = fetchParentForInheritance(db, chore.parent_id);
  if (!parent) {
    throw httpError(400, 'Parent chore not found', 'parent_chore_not_found');
  }

  let { scheduleType, scheduleJson, tagsJson, isActive, roomIds } = fieldState;

  scheduleType = parent.schedule_type;
  scheduleJson = parent.schedule_json;

  if (tagsJson === null && Object.prototype.hasOwnProperty.call(parent, 'tags_json')) {
    tagsJson = parent.tags_json;
  }
  if (chore.is_active == null && Object.prototype.hasOwnProperty.call(parent, 'is_active')) {
    isActive = parent.is_active;
  }
  if (roomIds.length === 0) {
    roomIds = getRoomIdsForChore(db, chore.parent_id);
  }

  return { scheduleType, scheduleJson, tagsJson, isActive, roomIds };
}

export function registerChoreRoutes(app) {
  // Register static routes before parameter routes so /chores/global-order does not match /chores/:choreId.
  app.put('/chores/global-order', (req, res) => {
    const db = req.app.get('db');
    const { order } = validateOrderPayload(req.body);

    return res.json(
      runTransaction(db, () => {
        const missingIds = getMissingChoreIds(db, order);
        if (missingIds.length > 0) {
          throw httpError(
            400,
            { message: 'Unknown chore IDs in order', ids: missingIds },
            'unknown_chore_ids_in_order'
          );
        }

        let beforeOrder = [];
        if (order.length > 0) {
          const placeholders = order.map(() => '?').join(',');
          const rows = db
            .prepare(`SELECT id, global_order FROM chores WHERE id IN (${placeholders})`)
            .all(...order);
          const existing = new Map(rows.map((row) => [row.id, row.global_order]));
          beforeOrder = order.map((choreId) => ({ id: choreId, global_order: existing.get(choreId) }));
        }

        const updateStmt = db.prepare(`UPDATE chores SET global_order = ? WHERE id = ?`);
        for (const [index, choreId] of order.entries()) {
          updateStmt.run(index, choreId);
        }

        const afterOrder = order.map((choreId, index) => ({ id: choreId, global_order: index }));
        logAuditEvent(db, {
          action: 'reorder',
          entityType: 'global_order',
          entityId: 'global',
          before: { order: beforeOrder },
          after: { order: afterOrder },
          metadata: { count: order.length }
        });

        return { updated: order.length };
      })
    );
  });

  app.get('/chores-with-subtasks', (req, res) => {
    const db = req.app.get('db');
    const allChores = getChoresSorted(db);
    return res.json(buildChoresWithSubtasks(allChores));
  });

  app.get('/chores/for-date/:dateStr', (req, res) => {
    const { dateStr } = req.params;
    const checkDate = parseIsoDateOr400(dateStr);
    const db = req.app.get('db');
    const allChores = getAllChoresFlat(db);
    const matching = getMatchingLeafChoresForDate(allChores, checkDate);
    return res.json({ date: dateStr, chores: matching });
  });

  app.get('/chores/for-range/:start/:end', (req, res) => {
    const { start, end } = req.params;
    const startDate = parseIsoDateOr400(start);
    const endDate = parseIsoDateOr400(end);
    if (endDate.getTime() < startDate.getTime()) {
      throw httpError(400, 'end must be on or after start', 'invalid_date_range');
    }

    const db = req.app.get('db');
    const allChores = getAllChoresFlat(db);
    const choresByDate = {};

    for (let current = startDate; current.getTime() <= endDate.getTime(); current = addDaysUtc(current, 1)) {
      const key = formatIsoDate(current);
      choresByDate[key] = getMatchingLeafChoresForDate(allChores, current);
    }

    return res.json({ start, end, chores_by_date: choresByDate });
  });

  app.get('/chores', (req, res) => {
    const db = req.app.get('db');
    return res.json(getChoresSorted(db));
  });

  app.post('/chores', (req, res) => {
    const db = req.app.get('db');
    const chore = validateChorePayload(req.body);
    const choreId = randomUUID();

    let scheduleJson = jsonStringOrNullForOptionalJson(chore.schedule);
    let scheduleType = chore.schedule_type;
    let tagsJson = jsonStringOrNullForOptionalJson(chore.tags);
    let isActive = toDbIsActive(chore.is_active);
    let roomIds = defaultRoomIds(chore.room_ids);

    return res.json(
      runTransaction(db, () => {
        ({ scheduleType, scheduleJson, tagsJson, isActive, roomIds } = applyParentInheritanceIfNeeded(
          db,
          chore,
          { scheduleType, scheduleJson, tagsJson, isActive, roomIds }
        ));

        db.prepare(`
          INSERT INTO chores (id, name, schedule_type, schedule_json, time_of_day, minutes, parent_id, global_order, is_active, tags_json)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          choreId,
          chore.name,
          scheduleType,
          scheduleJson,
          chore.time_of_day,
          chore.minutes,
          chore.parent_id,
          chore.global_order || 0,
          isActive,
          tagsJson
        );

        setChoreRooms(db, choreId, roomIds);

        if (chore.parent_id) {
          db.prepare(`UPDATE chores SET time_of_day = NULL, minutes = NULL WHERE id = ?`).run(chore.parent_id);
        }

        const createdSnapshot = getChoreSnapshot(db, choreId);
        logAuditEvent(db, {
          action: 'create',
          entityType: 'chore',
          entityId: choreId,
          after: createdSnapshot,
          metadata: { parent_id: chore.parent_id }
        });

        return createdSnapshot;
      })
    );
  });

  app.get('/chores/:choreId/subtasks', (req, res) => {
    const { choreId } = req.params;
    const db = req.app.get('db');
    const subtasks = getSubtasksForChore(db, choreId);
    return res.json({ parent_id: choreId, subtasks });
  });

  app.get('/chores/:choreId', (req, res) => {
    const { choreId } = req.params;
    const db = req.app.get('db');
    const chore = requireFound(getChoreById(db, choreId), {
      detail: 'Chore not found',
      code: 'chore_not_found'
    });
    return res.json(chore);
  });

  app.put('/chores/:choreId', (req, res) => {
    const db = req.app.get('db');
    const { choreId } = req.params;
    const chore = validateChorePayload(req.body);

    let scheduleJson = jsonStringOrNullForOptionalJson(chore.schedule);
    let tagsJson = jsonStringOrNullForOptionalJson(chore.tags);
    let isActive = toDbIsActive(chore.is_active);
    let roomIds = defaultRoomIds(chore.room_ids);

    return res.json(
      runTransaction(db, () => {
        const beforeSnapshot = requireFound(getChoreSnapshot(db, choreId), {
          detail: 'Chore not found',
          code: 'chore_not_found'
        });

        let scheduleType = chore.schedule_type;

        ({ scheduleType, scheduleJson, tagsJson, isActive, roomIds } = applyParentInheritanceIfNeeded(
          db,
          chore,
          { scheduleType, scheduleJson, tagsJson, isActive, roomIds }
        ));

        const result = db.prepare(`
          UPDATE chores SET name = ?, schedule_type = ?, schedule_json = ?, time_of_day = ?, minutes = ?, parent_id = ?, global_order = ?, is_active = ?, tags_json = ?
          WHERE id = ?
        `).run(
          chore.name,
          scheduleType,
          scheduleJson,
          chore.time_of_day,
          chore.minutes,
          chore.parent_id,
          chore.global_order || 0,
          isActive,
          tagsJson,
          choreId
        );

        if (result.changes === 0) {
          throw httpError(404, 'Chore not found', 'chore_not_found');
        }

        setChoreRooms(db, choreId, roomIds);

        if (!chore.parent_id) {
          db.prepare(`
            UPDATE chores SET schedule_type = ?, schedule_json = ?, is_active = ?, tags_json = ?
            WHERE parent_id = ?
          `).run(scheduleType, scheduleJson, isActive, tagsJson, choreId);

          const subtaskRows = db.prepare(`SELECT id FROM chores WHERE parent_id = ?`).all(choreId);
          for (const row of subtaskRows) {
            setChoreRooms(db, row.id, roomIds);
          }
        }

        const afterSnapshot = getChoreSnapshot(db, choreId);
        logAuditEvent(db, {
          action: 'update',
          entityType: 'chore',
          entityId: choreId,
          before: beforeSnapshot,
          after: afterSnapshot
        });

        return afterSnapshot;
      })
    );
  });

  app.delete('/chores/:choreId', (req, res) => {
    const db = req.app.get('db');
    const { choreId } = req.params;

    return res.json(
      runTransaction(db, () => {
        const beforeSnapshot = requireFound(getChoreSnapshot(db, choreId), {
          detail: 'Chore not found',
          code: 'chore_not_found'
        });

        const subtaskIds = db
          .prepare(`SELECT id FROM chores WHERE parent_id = ?`)
          .all(choreId)
          .map((row) => row.id);

        const result = db.prepare(`DELETE FROM chores WHERE id = ?`).run(choreId);
        if (result.changes === 0) {
          throw httpError(404, 'Chore not found', 'chore_not_found');
        }

        logAuditEvent(db, {
          action: 'delete',
          entityType: 'chore',
          entityId: choreId,
          before: beforeSnapshot,
          metadata: { deleted_subtask_ids: subtaskIds }
        });

        return { deleted: choreId };
      })
    );
  });
}
