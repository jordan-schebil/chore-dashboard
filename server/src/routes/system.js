import { collectCoreCounts, logAuditEvent } from '../db/audit-log.js';
import { seedDefaultChores } from '../db/seed-default-chores.js';
import { runTransaction } from './route-helpers.js';

export function registerSystemRoutes(app) {
  app.post('/reset', (req, res) => {
    void req;
    const db = req.app.get('db');

    return res.json(
      runTransaction(db, () => {
        const beforeCounts = collectCoreCounts(db);

        // Deleting chores cascades to completions/daily_order/chore_rooms.
        db.prepare(`DELETE FROM chores`).run();
        db.prepare(`DELETE FROM rooms`).run();

        seedDefaultChores(db);
        const afterCounts = collectCoreCounts(db);

        logAuditEvent(db, {
          action: 'reset',
          entityType: 'system',
          entityId: 'default_seed',
          before: beforeCounts,
          after: afterCounts
        });

        return { status: 'ok', reset: true };
      })
    );
  });
}
