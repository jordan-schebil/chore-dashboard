import Database from 'better-sqlite3';
import { createHarness } from './helpers/api-contract-harness.js';

const ISO_DATE = '2026-02-14';
const CAN_INSPECT_DB = !process.env.CONTRACT_API_BASE || Boolean(process.env.CONTRACT_DB_PATH);

const harness = createHarness();
const { expectOk, requestJson, chorePayload } = harness;

function openAuditDb() {
  const dbPath = harness.getDbPath();
  if (!dbPath) {
    throw new Error('No contract DB path available. Set CONTRACT_DB_PATH when using CONTRACT_API_BASE.');
  }
  return new Database(dbPath, { readonly: true });
}

function parseJson(raw) {
  if (!raw) return null;
  return JSON.parse(raw);
}

function getAuditRows(db, where = '', params = []) {
  const sql = `
    SELECT id, created_at, action, entity_type, entity_id, before_json, after_json, metadata_json
    FROM audit_log
    ${where}
    ORDER BY id
  `;
  return db.prepare(sql).all(...params).map((row) => ({
    ...row,
    before: parseJson(row.before_json),
    after: parseJson(row.after_json),
    metadata: parseJson(row.metadata_json)
  }));
}

function getAuditCount(db) {
  return db.prepare(`SELECT COUNT(*) AS count FROM audit_log`).get().count;
}

describe.runIf(CAN_INSPECT_DB)('reset + audit log write semantics (Express backend)', () => {
  beforeAll(async () => {
    await harness.start();
  });

  afterAll(async () => {
    await harness.stop();
  });

  beforeEach(async () => {
    await expectOk('POST', '/reset');
  });

  it('reset clears core data, reseeds chores, and writes reset audit counts', async () => {
    const room = await expectOk('POST', '/rooms', { name: 'Reset Audit Room' });
    const createdChore = await expectOk(
      'POST',
      '/chores',
      chorePayload('Reset Audit Chore', { room_ids: [room.id] })
    );

    await expectOk('POST', '/completions/toggle', {
      chore_id: createdChore.id,
      date: ISO_DATE
    });
    await expectOk('PUT', `/daily-order/${ISO_DATE}`, { order: [createdChore.id] });

    const dbBefore = openAuditDb();
    const auditCountBeforeReset = getAuditCount(dbBefore);
    dbBefore.close();

    const resetResult = await expectOk('POST', '/reset');
    expect(resetResult).toEqual({ status: 'ok', reset: true });

    const roomsAfter = await expectOk('GET', '/rooms');
    expect(roomsAfter).toEqual([]);

    const choreAfter = await requestJson('GET', `/chores/${createdChore.id}`);
    expect(choreAfter.status).toBe(404);
    expect(choreAfter.data?.detail).toBe('Chore not found');

    const completionsAfter = await expectOk('GET', `/completions/${ISO_DATE}`);
    expect(completionsAfter).toEqual({ date: ISO_DATE, completed: [] });

    const dailyOrderAfter = await expectOk('GET', `/daily-order/${ISO_DATE}`);
    expect(dailyOrderAfter).toEqual({ date: ISO_DATE, order: [] });

    const seededChores = await expectOk('GET', '/chores');
    expect(seededChores.length).toBeGreaterThan(0);

    const db = openAuditDb();
    const auditCountAfterReset = getAuditCount(db);
    expect(auditCountAfterReset).toBeGreaterThan(auditCountBeforeReset);

    const latestResetRow = db
      .prepare(
        `
        SELECT id, action, entity_type, entity_id, before_json, after_json, metadata_json
        FROM audit_log
        WHERE action = 'reset' AND entity_type = 'system'
        ORDER BY id DESC
        LIMIT 1
      `
      )
      .get();

    expect(latestResetRow).toBeTruthy();
    expect(latestResetRow.entity_id).toBe('default_seed');

    const beforeCounts = parseJson(latestResetRow.before_json);
    const afterCounts = parseJson(latestResetRow.after_json);
    expect(beforeCounts.rooms).toBe(1);
    expect(beforeCounts.completions).toBe(1);
    expect(beforeCounts.daily_order).toBe(1);
    expect(beforeCounts.chore_rooms).toBe(1);
    expect(beforeCounts.chores).toBe(afterCounts.chores + 1);

    expect(afterCounts.rooms).toBe(0);
    expect(afterCounts.completions).toBe(0);
    expect(afterCounts.daily_order).toBe(0);
    expect(afterCounts.chore_rooms).toBe(0);
    expect(afterCounts.chores).toBeGreaterThan(0);

    db.close();
  });

  it('mutating endpoints write expected audit rows with before/after/metadata payloads', async () => {
    const dbStart = openAuditDb();
    const baselineAuditId = dbStart.prepare(`SELECT COALESCE(MAX(id), 0) AS id FROM audit_log`).get().id;
    dbStart.close();

    const room = await expectOk('POST', '/rooms', { name: 'Audit Room A' });
    await expectOk('PUT', `/rooms/${room.id}`, { name: 'Audit Room B' });

    const createdChore = await expectOk(
      'POST',
      '/chores',
      chorePayload('Audit Chore A', {
        room_ids: [room.id],
        tags: ['tag-a']
      })
    );

    await expectOk(
      'PUT',
      `/chores/${createdChore.id}`,
      chorePayload('Audit Chore B', {
        room_ids: [room.id],
        tags: ['tag-b'],
        minutes: 15
      })
    );

    const chores = await expectOk('GET', '/chores');
    const reorderIds = chores.slice(0, 3).map((chore) => chore.id);
    await expectOk('PUT', '/chores/global-order', { order: reorderIds });

    await expectOk('PUT', `/daily-order/${ISO_DATE}`, { order: [createdChore.id] });

    await expectOk('POST', '/completions/toggle', {
      chore_id: createdChore.id,
      date: ISO_DATE
    });
    await expectOk('POST', '/completions/toggle', {
      chore_id: createdChore.id,
      date: ISO_DATE
    });

    await expectOk('DELETE', `/chores/${createdChore.id}`);
    await expectOk('DELETE', `/rooms/${room.id}`);

    const db = openAuditDb();
    const rows = getAuditRows(db, 'WHERE id > ?', [baselineAuditId]);

    const findRow = (predicate) => rows.find(predicate);
    const filterRows = (predicate) => rows.filter(predicate);

    const roomCreate = findRow(
      (row) => row.action === 'create' && row.entity_type === 'room' && row.entity_id === room.id
    );
    expect(roomCreate?.before).toBeNull();
    expect(roomCreate?.after).toEqual({ id: room.id, name: 'Audit Room A' });

    const roomUpdate = findRow(
      (row) => row.action === 'update' && row.entity_type === 'room' && row.entity_id === room.id
    );
    expect(roomUpdate?.before).toEqual({ id: room.id, name: 'Audit Room A' });
    expect(roomUpdate?.after).toEqual({ id: room.id, name: 'Audit Room B' });

    const roomDelete = findRow(
      (row) => row.action === 'delete' && row.entity_type === 'room' && row.entity_id === room.id
    );
    expect(roomDelete?.before).toEqual({ id: room.id, name: 'Audit Room B' });
    expect(roomDelete?.after).toBeNull();
    expect(roomDelete?.metadata).toEqual({ chore_links_removed: 0 });

    const choreCreate = findRow(
      (row) => row.action === 'create' && row.entity_type === 'chore' && row.entity_id === createdChore.id
    );
    expect(choreCreate?.before).toBeNull();
    expect(choreCreate?.after?.id).toBe(createdChore.id);
    expect(choreCreate?.after?.name).toBe('Audit Chore A');
    expect(choreCreate?.metadata).toEqual({ parent_id: null });

    const choreUpdate = findRow(
      (row) => row.action === 'update' && row.entity_type === 'chore' && row.entity_id === createdChore.id
    );
    expect(choreUpdate?.before?.name).toBe('Audit Chore A');
    expect(choreUpdate?.after?.name).toBe('Audit Chore B');
    expect(choreUpdate?.before?.tags).toEqual(['tag-a']);
    expect(choreUpdate?.after?.tags).toEqual(['tag-b']);

    const globalReorder = findRow(
      (row) =>
        row.action === 'reorder' && row.entity_type === 'global_order' && row.entity_id === 'global'
    );
    expect(globalReorder?.before?.order).toHaveLength(reorderIds.length);
    expect(globalReorder?.after?.order).toHaveLength(reorderIds.length);
    expect(globalReorder?.metadata).toEqual({ count: reorderIds.length });

    const dailyReorder = findRow(
      (row) => row.action === 'reorder' && row.entity_type === 'daily_order' && row.entity_id === ISO_DATE
    );
    expect(dailyReorder?.before).toEqual({ order: [] });
    expect(dailyReorder?.after).toEqual({ order: [createdChore.id] });
    expect(dailyReorder?.metadata).toBeNull();

    const completionToggles = filterRows(
      (row) => row.action === 'toggle' && row.entity_type === 'completion' && row.entity_id === createdChore.id
    );
    expect(completionToggles).toHaveLength(2);
    expect(completionToggles[0].before).toEqual({ completed: false });
    expect(completionToggles[0].after).toEqual({ completed: true });
    expect(completionToggles[0].metadata).toEqual({ date: ISO_DATE });
    expect(completionToggles[1].before).toEqual({ completed: true });
    expect(completionToggles[1].after).toEqual({ completed: false });
    expect(completionToggles[1].metadata).toEqual({ date: ISO_DATE });

    const choreDelete = findRow(
      (row) => row.action === 'delete' && row.entity_type === 'chore' && row.entity_id === createdChore.id
    );
    expect(choreDelete?.before?.id).toBe(createdChore.id);
    expect(choreDelete?.before?.name).toBe('Audit Chore B');
    expect(choreDelete?.after).toBeNull();
    expect(choreDelete?.metadata).toEqual({ deleted_subtask_ids: [] });

    db.close();
  });
});
