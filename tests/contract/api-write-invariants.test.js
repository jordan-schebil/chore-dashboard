import { createHarness } from './helpers/api-contract-harness.js';

const harness = createHarness();
const { expectOk, requestJson, chorePayload } = harness;

function payloadWithOmissions(name, overrides = {}, omittedKeys = []) {
  const payload = chorePayload(name, overrides);
  for (const key of omittedKeys) {
    delete payload[key];
  }
  return payload;
}

function expectSameIds(actual, expected) {
  expect([...actual].sort()).toEqual([...expected].sort());
}

beforeAll(async () => {
  await harness.start();
});

afterAll(async () => {
  await harness.stop();
});

beforeEach(async () => {
  await expectOk('POST', '/reset');
});

describe('write-side invariants (Express backend)', () => {
  it('subtask create/update inherits parent schedule, tags, active flag, and room links', async () => {
    const room = await expectOk('POST', '/rooms', { name: 'Phase4 Inherit Room' });

    const parentSchedule = { days: ['mon', 'thu'], interval: 2, week_parity: 'odd' };
    const parent = await expectOk(
      'POST',
      '/chores',
      chorePayload('Phase4 Parent', {
        schedule_type: 'weekly',
        schedule: parentSchedule,
        time_of_day: 'AM',
        minutes: 30,
        is_active: false,
        tags: ['deep-clean'],
        room_ids: [room.id]
      })
    );

    const childCreated = await expectOk(
      'POST',
      '/chores',
      payloadWithOmissions(
        'Phase4 Child',
        {
          parent_id: parent.id,
          schedule_type: 'daily',
          schedule: { ignored: true },
          time_of_day: 'PM',
          minutes: 5
        },
        ['tags', 'room_ids', 'is_active']
      )
    );

    expect(childCreated.parent_id).toBe(parent.id);
    expect(childCreated.schedule_type).toBe('weekly');
    expect(childCreated.schedule).toEqual(parentSchedule);
    expect(childCreated.time_of_day).toBe('PM');
    expect(childCreated.minutes).toBe(5);
    expect(childCreated.is_active).toBe(false);
    expect(childCreated.tags).toEqual(['deep-clean']);
    expect(childCreated.room_ids).toEqual([room.id]);

    const parentAfterChildCreate = await expectOk('GET', `/chores/${parent.id}`);
    expect(parentAfterChildCreate.time_of_day).toBeNull();
    expect(parentAfterChildCreate.minutes).toBeNull();

    const childUpdated = await expectOk(
      'PUT',
      `/chores/${childCreated.id}`,
      payloadWithOmissions(
        'Phase4 Child Updated',
        {
          parent_id: parent.id,
          schedule_type: 'monthly',
          schedule: { ignored_again: true },
          time_of_day: 'AM',
          minutes: 7
        },
        ['tags', 'room_ids', 'is_active']
      )
    );

    expect(childUpdated.name).toBe('Phase4 Child Updated');
    expect(childUpdated.parent_id).toBe(parent.id);
    expect(childUpdated.schedule_type).toBe('weekly');
    expect(childUpdated.schedule).toEqual(parentSchedule);
    expect(childUpdated.time_of_day).toBe('AM');
    expect(childUpdated.minutes).toBe(7);
    expect(childUpdated.is_active).toBe(false);
    expect(childUpdated.tags).toEqual(['deep-clean']);
    expect(childUpdated.room_ids).toEqual([room.id]);
  });

  it('parent updates cascade schedule, tags, active flag, and room links to subtasks', async () => {
    const roomA = await expectOk('POST', '/rooms', { name: 'Phase4 Cascade Room A' });
    const roomB = await expectOk('POST', '/rooms', { name: 'Phase4 Cascade Room B' });
    const roomC = await expectOk('POST', '/rooms', { name: 'Phase4 Cascade Room C' });

    const parent = await expectOk(
      'POST',
      '/chores',
      chorePayload('Cascade Parent', {
        schedule_type: 'monthly',
        schedule: { day_of_month: 1 },
        time_of_day: 'AM',
        minutes: 20,
        is_active: true,
        tags: ['initial-tag'],
        room_ids: [roomA.id]
      })
    );

    const child = await expectOk(
      'POST',
      '/chores',
      payloadWithOmissions(
        'Cascade Child',
        {
          parent_id: parent.id,
          schedule_type: 'daily',
          schedule: {},
          time_of_day: 'PM',
          minutes: 12
        },
        ['tags', 'room_ids', 'is_active']
      )
    );

    const updateSchedule = { month: 9, interval_months: 6 };
    const parentUpdated = await expectOk(
      'PUT',
      `/chores/${parent.id}`,
      chorePayload('Cascade Parent Updated', {
        schedule_type: 'seasonal',
        schedule: updateSchedule,
        time_of_day: 'PM',
        minutes: 45,
        is_active: false,
        tags: ['updated-tag', 'shared'],
        room_ids: [roomB.id, roomC.id]
      })
    );

    expect(parentUpdated.schedule_type).toBe('seasonal');
    expect(parentUpdated.schedule).toEqual(updateSchedule);
    expect(parentUpdated.is_active).toBe(false);
    expect(parentUpdated.tags).toEqual(['updated-tag', 'shared']);
    expectSameIds(parentUpdated.room_ids, [roomB.id, roomC.id]);

    const childAfterCascade = await expectOk('GET', `/chores/${child.id}`);
    expect(childAfterCascade.parent_id).toBe(parent.id);
    expect(childAfterCascade.schedule_type).toBe('seasonal');
    expect(childAfterCascade.schedule).toEqual(updateSchedule);
    expect(childAfterCascade.is_active).toBe(false);
    expect(childAfterCascade.tags).toEqual(['updated-tag', 'shared']);
    expectSameIds(childAfterCascade.room_ids, [roomB.id, roomC.id]);

    // Parent cascades shared scheduling metadata and room links, but child-specific time/minutes stay intact.
    expect(childAfterCascade.time_of_day).toBe('PM');
    expect(childAfterCascade.minutes).toBe(12);

    const subtasks = await expectOk('GET', `/chores/${parent.id}/subtasks`);
    const cascadedChild = subtasks.subtasks.find((item) => item.id === child.id);
    expect(cascadedChild).toBeDefined();
    expect(cascadedChild.schedule_type).toBe('seasonal');
    expect(cascadedChild.schedule).toEqual(updateSchedule);

    const unknownParentUpdate = await requestJson(
      'PUT',
      `/chores/${parent.id}`,
      chorePayload('Broken Parent Link', {
        parent_id: 'missing-parent-id'
      })
    );
    expect(unknownParentUpdate.status).toBe(400);
    expect(unknownParentUpdate.data?.detail).toBe('Parent chore not found');
  });
});
