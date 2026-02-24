import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHarness } from './helpers/api-contract-harness.js';

const ISO_DATE = '2026-02-11';
const harness = createHarness();
const { expectOk, chorePayload } = harness;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const expectedSnapshots = JSON.parse(
  readFileSync(path.join(__dirname, 'fixtures', 'expected', 'baseline-fixture-snapshots.json'), 'utf8')
);

function toAlias(prefix, name) {
  return `${prefix}_${name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')}`;
}

function replaceKnownIds(value, aliasById) {
  if (typeof value === 'string') {
    return aliasById.get(value) ?? value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => replaceKnownIds(item, aliasById));
  }
  if (!value || typeof value !== 'object') {
    return value;
  }
  const out = {};
  for (const [key, v] of Object.entries(value)) {
    out[key] = replaceKnownIds(v, aliasById);
  }
  return out;
}

function sortByName(list) {
  return [...list].sort((a, b) => a.name.localeCompare(b.name));
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

describe('Fixture-backed response snapshots', () => {
  it('matches normalized baseline fixture responses', async () => {
    const roomKitchen = await expectOk('POST', '/rooms', { name: 'Fixture Kitchen' });
    const roomOffice = await expectOk('POST', '/rooms', { name: 'Fixture Office' });

    const parent = await expectOk(
      'POST',
      '/chores',
      chorePayload('Fixture Parent', {
        schedule_type: 'one_time',
        schedule: { date: ISO_DATE },
        time_of_day: 'AM',
        minutes: 20,
        room_ids: [roomKitchen.id]
      })
    );

    const child = await expectOk(
      'POST',
      '/chores',
      chorePayload('Fixture Child', {
        parent_id: parent.id,
        time_of_day: 'PM',
        minutes: 5
      })
    );

    const solo = await expectOk(
      'POST',
      '/chores',
      chorePayload('Fixture Solo', {
        schedule_type: 'daily',
        schedule: {},
        time_of_day: 'AM',
        minutes: 15,
        global_order: 1,
        tags: ['baseline'],
        room_ids: [roomOffice.id]
      })
    );

    await expectOk('PUT', `/daily-order/${ISO_DATE}`, { order: [solo.id, child.id] });
    await expectOk('POST', '/completions/toggle', { chore_id: solo.id, date: ISO_DATE });

    const rooms = await expectOk('GET', '/rooms');
    const parentAfterChild = await expectOk('GET', `/chores/${parent.id}`);
    const subtasks = await expectOk('GET', `/chores/${parent.id}/subtasks`);
    const allWithSubtasks = await expectOk('GET', '/chores-with-subtasks');
    const forDate = await expectOk('GET', `/chores/for-date/${ISO_DATE}`);
    const forRange = await expectOk('GET', `/chores/for-range/${ISO_DATE}/${ISO_DATE}`);
    const dailyOrder = await expectOk('GET', `/daily-order/${ISO_DATE}`);
    const completionsForDate = await expectOk('GET', `/completions/${ISO_DATE}`);
    const completionsRange = await expectOk('GET', `/completions?start=${ISO_DATE}&end=${ISO_DATE}`);

    const aliasById = new Map([
      [roomKitchen.id, toAlias('room', roomKitchen.name)],
      [roomOffice.id, toAlias('room', roomOffice.name)],
      [parent.id, toAlias('chore', parent.name)],
      [child.id, toAlias('chore', child.name)],
      [solo.id, toAlias('chore', solo.name)]
    ]);

    const fixtureChoresForDate = sortByName(
      forDate.chores.filter((chore) => chore.name.startsWith('Fixture '))
    );

    const fixtureChoresForRange = sortByName(
      (forRange.chores_by_date?.[ISO_DATE] ?? []).filter((chore) => chore.name.startsWith('Fixture '))
    );

    const fixtureTopLevel = sortByName(
      allWithSubtasks.filter((chore) => chore.name.startsWith('Fixture '))
    );

    const actual = {
      created: {
        rooms: sortByName(rooms.filter((room) => room.name.startsWith('Fixture '))),
        chores: {
          parent,
          child,
          solo
        }
      },
      reads: {
        parent_after_child: parentAfterChild,
        subtasks,
        chores_with_subtasks_fixture: fixtureTopLevel,
        chores_for_date_fixture: {
          date: forDate.date,
          chores: fixtureChoresForDate
        },
        chores_for_range_fixture: {
          start: forRange.start,
          end: forRange.end,
          chores_by_date: {
            [ISO_DATE]: fixtureChoresForRange
          }
        },
        daily_order: dailyOrder,
        completions_for_date: completionsForDate,
        completions_range: completionsRange
      }
    };

    const normalized = replaceKnownIds(actual, aliasById);
    expect(normalized).toEqual(expectedSnapshots);
  });
});
