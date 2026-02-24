import { randomUUID } from 'node:crypto';
import { logAuditEvent } from '../db/audit-log.js';
import { getRoomsSorted, getRoomSnapshot } from '../data/chores.js';
import { httpError } from '../lib/http-error.js';
import { validateRoomPayload } from '../lib/validators.js';
import { isSqliteConstraintError, requireFound, runTransaction } from './route-helpers.js';

export function registerRoomRoutes(app) {
  app.get('/rooms', (req, res) => {
    const db = req.app.get('db');
    return res.json(getRoomsSorted(db));
  });

  app.post('/rooms', (req, res) => {
    const db = req.app.get('db');
    const room = validateRoomPayload(req.body);
    const roomId = randomUUID();

    try {
      return res.json(
        runTransaction(db, () => {
          db.prepare(`INSERT INTO rooms (id, name) VALUES (?, ?)`).run(roomId, room.name);
          const roomSnapshot = { id: roomId, name: room.name };
          logAuditEvent(db, {
            action: 'create',
            entityType: 'room',
          entityId: roomId,
            after: roomSnapshot
          });
          return roomSnapshot;
        })
      );
    } catch (error) {
      if (isSqliteConstraintError(error)) {
        throw httpError(400, 'Room name already exists', 'room_name_already_exists');
      }
      throw error;
    }
  });

  app.put('/rooms/:roomId', (req, res) => {
    const db = req.app.get('db');
    const { roomId } = req.params;
    const room = validateRoomPayload(req.body);
    return res.json(
      runTransaction(db, () => {
        const beforeSnapshot = requireFound(getRoomSnapshot(db, roomId), {
          detail: 'Room not found',
          code: 'room_not_found'
        });

        let result;
        try {
          result = db.prepare(`UPDATE rooms SET name = ? WHERE id = ?`).run(room.name, roomId);
        } catch (error) {
          if (isSqliteConstraintError(error)) {
            throw httpError(400, 'Room name already exists', 'room_name_already_exists');
          }
          throw error;
        }

        if (result.changes === 0) {
          throw httpError(404, 'Room not found', 'room_not_found');
        }

        const afterSnapshot = getRoomSnapshot(db, roomId);
        logAuditEvent(db, {
          action: 'update',
          entityType: 'room',
          entityId: roomId,
          before: beforeSnapshot,
          after: afterSnapshot
        });

        return { id: roomId, name: room.name };
      })
    );
  });

  app.delete('/rooms/:roomId', (req, res) => {
    const db = req.app.get('db');
    const { roomId } = req.params;

    return res.json(
      runTransaction(db, () => {
        const beforeSnapshot = requireFound(getRoomSnapshot(db, roomId), {
          detail: 'Room not found',
          code: 'room_not_found'
        });

        const roomLinks =
          db.prepare(`SELECT COUNT(*) AS c FROM chore_rooms WHERE room_id = ?`).get(roomId).c ?? 0;
        db.prepare(`DELETE FROM chore_rooms WHERE room_id = ?`).run(roomId);
        const result = db.prepare(`DELETE FROM rooms WHERE id = ?`).run(roomId);

        if (result.changes === 0) {
          throw httpError(404, 'Room not found', 'room_not_found');
        }

        logAuditEvent(db, {
          action: 'delete',
          entityType: 'room',
          entityId: roomId,
          before: beforeSnapshot,
          metadata: { chore_links_removed: roomLinks }
        });

        return { deleted: roomId };
      })
    );
  });
}
