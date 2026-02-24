import { getCompletionsForDate, getCompletionsRange } from '../data/chores.js';
import { logAuditEvent } from '../db/audit-log.js';
import { httpError } from '../lib/http-error.js';
import { validateCompletionTogglePayload } from '../lib/validators.js';
import { isSqliteConstraintError, requireFound, runTransaction } from './route-helpers.js';

export function registerCompletionRoutes(app) {
  app.get('/completions/:dateStr', (req, res) => {
    const { dateStr } = req.params;
    const db = req.app.get('db');
    return res.json({ date: dateStr, completed: getCompletionsForDate(db, dateStr) });
  });

  app.get('/completions', (req, res) => {
    const start = typeof req.query.start === 'string' ? req.query.start : null;
    const end = typeof req.query.end === 'string' ? req.query.end : null;
    if (!start || !end) {
      throw httpError(422, 'start and end query params are required', 'completions_range_params_required');
    }
    const db = req.app.get('db');
    return res.json(getCompletionsRange(db, start, end));
  });

  app.post('/completions/toggle', (req, res) => {
    const db = req.app.get('db');
    const payload = validateCompletionTogglePayload(req.body);

    return res.json(
      runTransaction(db, () => {
        requireFound(db.prepare(`SELECT 1 FROM chores WHERE id = ?`).get(payload.chore_id), {
          detail: 'Chore not found',
          code: 'chore_not_found'
        });

        const exists = db
          .prepare(`SELECT 1 FROM completions WHERE chore_id = ? AND completed_date = ?`)
          .get(payload.chore_id, payload.date);

        if (exists) {
          db.prepare(`DELETE FROM completions WHERE chore_id = ? AND completed_date = ?`).run(
            payload.chore_id,
            payload.date
          );
          logAuditEvent(db, {
            action: 'toggle',
            entityType: 'completion',
            entityId: payload.chore_id,
            before: { completed: true },
            after: { completed: false },
            metadata: { date: payload.date }
          });
          return { chore_id: payload.chore_id, date: payload.date, completed: false };
        }

        try {
          db.prepare(`INSERT INTO completions (chore_id, completed_date) VALUES (?, ?)`).run(
            payload.chore_id,
            payload.date
          );
        } catch (error) {
          if (isSqliteConstraintError(error)) {
            throw httpError(400, 'Invalid completion payload', 'invalid_completion_payload');
          }
          throw error;
        }

        logAuditEvent(db, {
          action: 'toggle',
          entityType: 'completion',
          entityId: payload.chore_id,
          before: { completed: false },
          after: { completed: true },
          metadata: { date: payload.date }
        });
        return { chore_id: payload.chore_id, date: payload.date, completed: true };
      })
    );
  });
}
