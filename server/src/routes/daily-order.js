import { getDailyOrderForDate } from '../data/chores.js';
import { logAuditEvent } from '../db/audit-log.js';
import { validateDateOr400 } from '../lib/dates.js';
import { httpError } from '../lib/http-error.js';
import { getMissingChoreIds } from '../lib/order.js';
import { validateOrderPayload } from '../lib/validators.js';
import { runTransaction } from './route-helpers.js';

export function registerDailyOrderRoutes(app) {
  app.get('/daily-order/:dateStr', (req, res) => {
    const { dateStr } = req.params;
    validateDateOr400(dateStr);
    const db = req.app.get('db');
    return res.json({ date: dateStr, order: getDailyOrderForDate(db, dateStr) });
  });

  app.put('/daily-order/:dateStr', (req, res) => {
    const { dateStr } = req.params;
    validateDateOr400(dateStr);
    const { order } = validateOrderPayload(req.body);
    const db = req.app.get('db');

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

        const beforeOrder = getDailyOrderForDate(db, dateStr);

        db.prepare(`DELETE FROM daily_order WHERE date = ?`).run(dateStr);
        const insert = db.prepare(`INSERT INTO daily_order (date, chore_id, order_index) VALUES (?, ?, ?)`);
        for (const [index, choreId] of order.entries()) {
          insert.run(dateStr, choreId, index);
        }

        logAuditEvent(db, {
          action: 'reorder',
          entityType: 'daily_order',
          entityId: dateStr,
          before: { order: beforeOrder },
          after: { order }
        });

        return { date: dateStr, updated: order.length };
      })
    );
  });
}
