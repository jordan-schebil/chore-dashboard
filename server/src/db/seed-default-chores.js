import { randomUUID } from 'node:crypto';

function row(name, scheduleType, schedule, timeOfDay, minutes, parentId = null) {
  return [randomUUID(), name, scheduleType, JSON.stringify(schedule), timeOfDay, minutes, parentId];
}

export function seedDefaultChores(db) {
  const defaultChores = [
    // Daily
    row('Make bed', 'daily', {}, 'AM', 3),
    row('Scoop litter boxes', 'daily', {}, 'AM', 5),
    row('Wipe bathroom sink and counter', 'daily', {}, 'AM', 3),
    row('Vacuum all floors', 'daily', {}, 'AM', 20),
    row('Dishes / load dishwasher', 'daily', {}, 'PM', 10),
    row('Wipe kitchen counters', 'daily', {}, 'PM', 5),
    row('Take out trash when full', 'daily', {}, 'PM', 5),
    row('Pick up clutter / return items to place', 'daily', {}, 'PM', 10),

    // Weekly
    row('Mop hard floors', 'weekly', { days_of_week: [1], interval: 1 }, 'AM', 20),
    row('Clean toilets', 'weekly', { days_of_week: [2], interval: 1 }, 'AM', 10),
    row('Clean showers/tubs', 'weekly', { days_of_week: [2], interval: 1 }, 'AM', 15),
    row('Dust surfaces', 'weekly', { days_of_week: [3], interval: 1 }, 'AM', 15),
    row('Clean mirrors', 'weekly', { days_of_week: [3], interval: 1 }, 'AM', 10),
    row('Wipe down kitchen appliances', 'weekly', { days_of_week: [4], interval: 1 }, 'PM', 10),
    row('Brush dog and cats', 'weekly', { days_of_week: [4], interval: 1 }, 'PM', 20),
    row('Empty all small trash cans', 'weekly', { days_of_week: [5], interval: 1 }, 'AM', 10),
    row('Change bed linens', 'weekly', { days_of_week: [6], interval: 1 }, 'AM', 15),
    row('Laundry (wash, dry, fold, put away)', 'weekly', { days_of_week: [6], interval: 1 }, 'AM', 45),
    row('Wash food and water bowls', 'weekly', { days_of_week: [0], interval: 1 }, 'PM', 10),

    // Monthly
    row(
      'Vacuum upholstery and mattresses',
      'monthly',
      { mode: 'nth_weekday', week_of_month: 1, day_of_week: 6, interval: 1 },
      'AM',
      25
    ),
    row(
      'Wash throw blankets and pillows',
      'monthly',
      { mode: 'nth_weekday', week_of_month: 1, day_of_week: 6, interval: 1 },
      'AM',
      20
    ),
    row(
      'Clean Keurig and toaster oven',
      'monthly',
      { mode: 'nth_weekday', week_of_month: 1, day_of_week: 6, interval: 1 },
      'PM',
      15
    ),
    row(
      'Clean inside microwave and oven',
      'monthly',
      { mode: 'nth_weekday', week_of_month: 2, day_of_week: 6, interval: 1 },
      'AM',
      20
    ),
    row(
      'Deep clean litter boxes',
      'monthly',
      { mode: 'nth_weekday', week_of_month: 2, day_of_week: 6, interval: 1 },
      'AM',
      20
    ),
    row(
      'Clean out fridge',
      'monthly',
      { mode: 'nth_weekday', week_of_month: 2, day_of_week: 6, interval: 1 },
      'PM',
      25
    ),
    row(
      'Wipe cabinet fronts',
      'monthly',
      { mode: 'nth_weekday', week_of_month: 3, day_of_week: 6, interval: 1 },
      'AM',
      20
    ),
    row(
      'Dust blinds and ceiling fans',
      'monthly',
      { mode: 'nth_weekday', week_of_month: 3, day_of_week: 6, interval: 1 },
      'AM',
      25
    ),
    row(
      'Clean window sills and baseboards',
      'monthly',
      { mode: 'nth_weekday', week_of_month: 4, day_of_week: 6, interval: 1 },
      'AM',
      30
    ),
    row(
      'Clean cat trees and scratching posts',
      'monthly',
      { mode: 'nth_weekday', week_of_month: 4, day_of_week: 6, interval: 1 },
      'PM',
      20
    ),

    // Seasonal (quarterly cadence via month+interval)
    row(
      'Deep clean carpets',
      'seasonal',
      { month: 1, mode: 'nth_weekday', week_of_month: 1, day_of_week: 6, interval_months: 3 },
      'AM',
      60
    ),
    row(
      'Flip or rotate mattress',
      'seasonal',
      { month: 1, mode: 'nth_weekday', week_of_month: 1, day_of_week: 6, interval_months: 3 },
      'AM',
      10
    ),
    row(
      'Deep clean furniture for embedded pet hair',
      'seasonal',
      { month: 1, mode: 'nth_weekday', week_of_month: 1, day_of_week: 6, interval_months: 3 },
      'PM',
      45
    ),
    row(
      'Change furnace filter',
      'seasonal',
      { month: 1, mode: 'nth_weekday', week_of_month: 1, day_of_week: 6, interval_months: 3 },
      'PM',
      10
    ),
    row(
      'Wash windows inside and out',
      'seasonal',
      { month: 2, mode: 'nth_weekday', week_of_month: 1, day_of_week: 6, interval_months: 3 },
      'AM',
      60
    ),
    row(
      'Clean dryer vent',
      'seasonal',
      { month: 2, mode: 'nth_weekday', week_of_month: 1, day_of_week: 6, interval_months: 3 },
      'AM',
      20
    ),
    row(
      'Organize closets',
      'seasonal',
      { month: 2, mode: 'nth_weekday', week_of_month: 1, day_of_week: 6, interval_months: 3 },
      'PM',
      60
    ),
    row(
      'Clean behind and under large furniture',
      'seasonal',
      { month: 3, mode: 'nth_weekday', week_of_month: 1, day_of_week: 6, interval_months: 3 },
      'AM',
      45
    ),
    row(
      'Clean garage or storage areas',
      'seasonal',
      { month: 3, mode: 'nth_weekday', week_of_month: 1, day_of_week: 6, interval_months: 3 },
      'AM',
      90
    ),
    row(
      'Vacuum basement',
      'seasonal',
      { month: 3, mode: 'nth_weekday', week_of_month: 1, day_of_week: 6, interval_months: 3 },
      'PM',
      30
    ),

    // One-time + examples
    row('Fix leaky faucet in bathroom', 'one_time', { date: '2026-02-15' }, 'AM', 45),
    row('Water plants', 'weekly', { days_of_week: [2, 4], interval: 1 }, 'AM', 10),
    row('Deep clean coffee maker', 'weekly', { days_of_week: [6], interval: 2, week_parity: 0 }, 'AM', 30),
    row(
      'Check smoke detectors',
      'seasonal',
      { month: 3, mode: 'nth_weekday', week_of_month: 1, day_of_week: 6, interval_months: 12 },
      'AM',
      15
    )
  ];

  const insert = db.prepare(`
    INSERT INTO chores (id, name, schedule_type, schedule_json, time_of_day, minutes, parent_id)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  for (const chore of defaultChores) {
    insert.run(...chore);
  }

  return true;
}
