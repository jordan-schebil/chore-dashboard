import { createHarness } from './helpers/api-contract-harness.js';

const ISO_DATE = '2026-02-11';

const harness = createHarness();
const { requestJson, expectOk, chorePayload } = harness;

beforeAll(async () => {
  await harness.start();
});

afterAll(async () => {
  await harness.stop();
});

beforeEach(async () => {
  await expectOk('POST', '/reset');
});

describe('HTTP contract parity: baseline', () => {
  it('GET / returns health payload', async () => {
    const result = await requestJson('GET', '/');
    expect(result.status).toBe(200);
    expect(result.data).toEqual({
      message: 'Chore Dashboard API',
      status: 'running'
    });
  });

  it('rooms endpoints preserve CRUD and duplicate-name behavior', async () => {
    const initial = await expectOk('GET', '/rooms');
    expect(Array.isArray(initial)).toBe(true);
    expect(initial).toHaveLength(0);

    const created = await expectOk('POST', '/rooms', { name: 'Laundry' });
    expect(created).toMatchObject({ name: 'Laundry' });
    expect(typeof created.id).toBe('string');

    const duplicate = await requestJson('POST', '/rooms', { name: 'Laundry' });
    expect(duplicate.status).toBe(400);
    expect(duplicate.data?.detail).toBe('Room name already exists');

    const updated = await expectOk('PUT', `/rooms/${created.id}`, { name: 'Laundry Room' });
    expect(updated).toEqual({ id: created.id, name: 'Laundry Room' });

    const missingUpdate = await requestJson('PUT', '/rooms/missing-room-id', { name: 'X' });
    expect(missingUpdate.status).toBe(404);
    expect(missingUpdate.data?.detail).toBe('Room not found');

    const deleted = await expectOk('DELETE', `/rooms/${created.id}`);
    expect(deleted).toEqual({ deleted: created.id });

    const missingDelete = await requestJson('DELETE', `/rooms/${created.id}`);
    expect(missingDelete.status).toBe(404);
    expect(missingDelete.data?.detail).toBe('Room not found');
  });

  it('chores endpoints preserve CRUD and parent validation behavior', async () => {
    const allChores = await expectOk('GET', '/chores');
    expect(Array.isArray(allChores)).toBe(true);
    expect(allChores.length).toBeGreaterThan(0);
    expect(allChores[0]).toHaveProperty('id');
    expect(allChores[0]).toHaveProperty('schedule_type');

    const created = await expectOk('POST', '/chores', chorePayload('Contract Chore'));
    expect(created).toMatchObject({
      id: expect.any(String),
      name: 'Contract Chore',
      schedule_type: 'daily',
      schedule: {},
      time_of_day: 'AM',
      minutes: 10,
      parent_id: null,
      global_order: 0,
      is_active: true,
      tags: [],
      room_ids: []
    });

    const fetched = await expectOk('GET', `/chores/${created.id}`);
    expect(fetched.id).toBe(created.id);

    const updated = await expectOk(
      'PUT',
      `/chores/${created.id}`,
      chorePayload('Contract Chore Updated', {
        time_of_day: 'PM',
        minutes: 12,
        global_order: 2,
        tags: ['priority']
      })
    );
    expect(updated).toMatchObject({
      id: created.id,
      name: 'Contract Chore Updated',
      global_order: 2,
      tags: ['priority']
    });

    const missingParent = await requestJson(
      'POST',
      '/chores',
      chorePayload('Orphan Child', { parent_id: 'missing-parent-id' })
    );
    expect(missingParent.status).toBe(400);
    expect(missingParent.data?.detail).toBe('Parent chore not found');

    const deleted = await expectOk('DELETE', `/chores/${created.id}`);
    expect(deleted).toEqual({ deleted: created.id });

    const missingGet = await requestJson('GET', `/chores/${created.id}`);
    expect(missingGet.status).toBe(404);
    expect(missingGet.data?.detail).toBe('Chore not found');
  });

  it('global-order endpoint preserves validation and success behavior', async () => {
    const chores = await expectOk('GET', '/chores');
    const order = chores.slice(0, 3).map((chore) => chore.id);

    const updated = await expectOk('PUT', '/chores/global-order', { order });
    expect(updated).toEqual({ updated: order.length });

    const unknown = await requestJson('PUT', '/chores/global-order', {
      order: ['unknown-chore-id']
    });
    expect(unknown.status).toBe(400);
    expect(unknown.data?.detail?.message).toBe('Unknown chore IDs in order');
    expect(unknown.data?.detail?.ids).toEqual(['unknown-chore-id']);

    const duplicate = await requestJson('PUT', '/chores/global-order', {
      order: [order[0], order[0]]
    });
    expect(duplicate.status).toBe(422);
  });

  it('daily-order endpoints preserve get/set and validation behavior', async () => {
    const chores = await expectOk('GET', '/chores');
    const order = chores.slice(0, 2).map((chore) => chore.id);

    const before = await expectOk('GET', `/daily-order/${ISO_DATE}`);
    expect(before).toEqual({ date: ISO_DATE, order: [] });

    const setResult = await expectOk('PUT', `/daily-order/${ISO_DATE}`, { order });
    expect(setResult).toEqual({ date: ISO_DATE, updated: order.length });

    const after = await expectOk('GET', `/daily-order/${ISO_DATE}`);
    expect(after).toEqual({ date: ISO_DATE, order });

    const invalidDate = await requestJson('GET', '/daily-order/2026-02-99');
    expect(invalidDate.status).toBe(400);
    expect(invalidDate.data?.detail).toBe('Invalid date format. Use YYYY-MM-DD');

    const unknown = await requestJson('PUT', `/daily-order/${ISO_DATE}`, {
      order: ['unknown-chore-id']
    });
    expect(unknown.status).toBe(400);
    expect(unknown.data?.detail?.message).toBe('Unknown chore IDs in order');
    expect(unknown.data?.detail?.ids).toEqual(['unknown-chore-id']);

    const duplicate = await requestJson('PUT', `/daily-order/${ISO_DATE}`, {
      order: [order[0], order[0]]
    });
    expect(duplicate.status).toBe(422);
  });

  it('subtask and nested chore endpoints preserve leaf/subtask semantics', async () => {
    const parent = await expectOk('POST', '/chores', chorePayload('Parent Chore'));
    const child = await expectOk(
      'POST',
      '/chores',
      chorePayload('Child Chore', {
        parent_id: parent.id,
        time_of_day: 'PM',
        minutes: 5
      })
    );

    const subtasks = await expectOk('GET', `/chores/${parent.id}/subtasks`);
    expect(subtasks.parent_id).toBe(parent.id);
    expect(Array.isArray(subtasks.subtasks)).toBe(true);
    expect(subtasks.subtasks.some((item) => item.id === child.id)).toBe(true);

    const nested = await expectOk('GET', '/chores-with-subtasks');
    const nestedParent = nested.find((item) => item.id === parent.id);
    expect(nestedParent).toBeDefined();
    expect(nestedParent.has_subtasks).toBe(true);
    expect(Array.isArray(nestedParent.subtasks)).toBe(true);
    expect(nestedParent.subtasks.some((item) => item.id === child.id)).toBe(true);
  });

  it('for-date and for-range preserve filtering and date validation behavior', async () => {
    const parent = await expectOk(
      'POST',
      '/chores',
      chorePayload('Leaf Parent', {
        schedule_type: 'one_time',
        schedule: { date: ISO_DATE }
      })
    );
    const child = await expectOk(
      'POST',
      '/chores',
      chorePayload('Leaf Child', {
        parent_id: parent.id,
        time_of_day: 'PM',
        minutes: 5
      })
    );

    const forDate = await expectOk('GET', `/chores/for-date/${ISO_DATE}`);
    const ids = new Set(forDate.chores.map((chore) => chore.id));
    expect(ids.has(parent.id)).toBe(false);
    expect(ids.has(child.id)).toBe(true);
    const childInResponse = forDate.chores.find((chore) => chore.id === child.id);
    expect(childInResponse.parent_name).toBe('Leaf Parent');

    const forRange = await expectOk('GET', `/chores/for-range/${ISO_DATE}/${ISO_DATE}`);
    expect(forRange.start).toBe(ISO_DATE);
    expect(forRange.end).toBe(ISO_DATE);
    expect(Array.isArray(forRange.chores_by_date[ISO_DATE])).toBe(true);

    const invalidDate = await requestJson('GET', '/chores/for-date/2026-99-01');
    expect(invalidDate.status).toBe(400);
    expect(invalidDate.data?.detail).toBe('Invalid date format. Use YYYY-MM-DD');

    const invalidRange = await requestJson('GET', '/chores/for-range/2026-02-12/2026-02-11');
    expect(invalidRange.status).toBe(400);
    expect(invalidRange.data?.detail).toBe('end must be on or after start');
  });

  it('completions endpoints preserve toggle flow and error behavior', async () => {
    const created = await expectOk('POST', '/chores', chorePayload('Toggle Chore'));

    const initial = await expectOk('GET', `/completions/${ISO_DATE}`);
    expect(initial).toEqual({ date: ISO_DATE, completed: [] });

    const toggledOn = await expectOk('POST', '/completions/toggle', {
      chore_id: created.id,
      date: ISO_DATE
    });
    expect(toggledOn).toEqual({
      chore_id: created.id,
      date: ISO_DATE,
      completed: true
    });

    const rangeAfterOn = await expectOk('GET', `/completions?start=${ISO_DATE}&end=${ISO_DATE}`);
    expect(rangeAfterOn[ISO_DATE]).toContain(created.id);

    const toggledOff = await expectOk('POST', '/completions/toggle', {
      chore_id: created.id,
      date: ISO_DATE
    });
    expect(toggledOff).toEqual({
      chore_id: created.id,
      date: ISO_DATE,
      completed: false
    });

    const unknown = await requestJson('POST', '/completions/toggle', {
      chore_id: 'unknown-chore-id',
      date: ISO_DATE
    });
    expect(unknown.status).toBe(404);
    expect(unknown.data?.detail).toBe('Chore not found');

    const invalidDate = await requestJson('POST', '/completions/toggle', {
      chore_id: created.id,
      date: '02/11/2026'
    });
    expect(invalidDate.status).toBe(422);
  });

  it('reset endpoint preserves success payload and reset side effects', async () => {
    await expectOk('POST', '/rooms', { name: 'Reset Room' });
    const createdChore = await expectOk('POST', '/chores', chorePayload('Resettable Chore'));

    await expectOk('POST', '/completions/toggle', {
      chore_id: createdChore.id,
      date: ISO_DATE
    });
    await expectOk('PUT', `/daily-order/${ISO_DATE}`, { order: [createdChore.id] });

    const reset = await expectOk('POST', '/reset');
    expect(reset).toEqual({ status: 'ok', reset: true });

    const roomsAfter = await expectOk('GET', '/rooms');
    expect(roomsAfter).toEqual([]);

    const completionsAfter = await expectOk('GET', `/completions/${ISO_DATE}`);
    expect(completionsAfter).toEqual({ date: ISO_DATE, completed: [] });

    const dailyAfter = await expectOk('GET', `/daily-order/${ISO_DATE}`);
    expect(dailyAfter).toEqual({ date: ISO_DATE, order: [] });
    const choresAfter = await expectOk('GET', '/chores');
    expect(choresAfter.some((chore) => chore.id === createdChore.id)).toBe(false);
  });
});
