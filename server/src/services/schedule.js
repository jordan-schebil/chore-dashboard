import { addDaysUtc, diffDaysUtc, formatIsoDate, parseIsoDateStrict } from '../lib/dates.js';

function toUtcDate(value) {
  if (value instanceof Date) {
    return value;
  }
  const parsed = parseIsoDateStrict(value);
  if (!parsed) {
    throw new Error(`Invalid ISO date: ${value}`);
  }
  return parsed;
}

function positiveMod(value, modulus) {
  return ((value % modulus) + modulus) % modulus;
}

export function sundayWeekNumber(checkDateInput) {
  const checkDate = toUtcDate(checkDateInput);
  const yearStart = new Date(Date.UTC(checkDate.getUTCFullYear(), 0, 1));
  const startDow = yearStart.getUTCDay(); // Sunday=0
  const weekStart = addDaysUtc(yearStart, -startDow);
  return Math.floor(diffDaysUtc(checkDate, weekStart) / 7) + 1;
}

export function matchesSchedule(scheduleType, scheduleInput, checkDateInput) {
  const checkDate = toUtcDate(checkDateInput);
  const schedule = scheduleInput ?? {};

  if (scheduleType === 'daily') {
    return true;
  }

  if (scheduleType === 'one_time') {
    return schedule.date === formatIsoDate(checkDate);
  }

  if (scheduleType === 'weekly') {
    const days = Array.isArray(schedule.days_of_week) ? schedule.days_of_week : [];
    const interval = Number(schedule.interval ?? 1);
    const jsDow = checkDate.getUTCDay(); // Sunday=0
    if (!days.includes(jsDow)) {
      return false;
    }
    if (interval > 1) {
      const parity = schedule.week_parity;
      if (parity === undefined || parity === null) {
        return true;
      }
      return sundayWeekNumber(checkDate) % 2 === Number(parity);
    }
    return true;
  }

  if (scheduleType === 'monthly') {
    const mode = schedule.mode ?? 'nth_weekday';
    const interval = Number(schedule.interval ?? 1);
    if (interval > 1) {
      const parity = schedule.month_parity;
      if (parity !== undefined && parity !== null && ((checkDate.getUTCMonth() + 1) % 2) !== Number(parity)) {
        return false;
      }
    }

    if (mode === 'date') {
      return checkDate.getUTCDate() === Number(schedule.day_of_month);
    }

    const weekOfMonth = Math.floor((checkDate.getUTCDate() - 1) / 7) + 1;
    const jsDow = checkDate.getUTCDay();
    return weekOfMonth === Number(schedule.week_of_month) && jsDow === Number(schedule.day_of_week);
  }

  if (scheduleType === 'seasonal') {
    const targetMonth = schedule.month;
    const intervalMonths = Number(schedule.interval_months ?? 12);
    if (targetMonth === undefined || targetMonth === null) {
      return false;
    }

    const currentMonth = checkDate.getUTCMonth() + 1;
    if (positiveMod(currentMonth - Number(targetMonth), intervalMonths) !== 0) {
      return false;
    }

    const mode = schedule.mode ?? 'nth_weekday';
    if (mode === 'date') {
      return checkDate.getUTCDate() === Number(schedule.day_of_month);
    }

    const weekOfMonth = Math.floor((checkDate.getUTCDate() - 1) / 7) + 1;
    const jsDow = checkDate.getUTCDay();
    return weekOfMonth === Number(schedule.week_of_month) && jsDow === Number(schedule.day_of_week);
  }

  if (scheduleType === 'interval_days') {
    const interval = Number(schedule.interval ?? 1);
    const startDate = parseIsoDateStrict(schedule.start_date);
    if (!startDate) {
      return false;
    }
    const daysDiff = diffDaysUtc(checkDate, startDate);
    return daysDiff >= 0 && daysDiff % interval === 0;
  }

  return false;
}

export function buildChoresWithSubtasks(allChores) {
  const subtasksMap = {};
  const parentsWithSubtasks = new Set();

  for (const chore of allChores) {
    if (chore.parent_id) {
      parentsWithSubtasks.add(chore.parent_id);
      if (!subtasksMap[chore.parent_id]) {
        subtasksMap[chore.parent_id] = [];
      }
      subtasksMap[chore.parent_id].push(chore);
    }
  }

  const result = [];
  for (const chore of allChores) {
    if (chore.parent_id) {
      continue;
    }

    const subtasks = subtasksMap[chore.id] ?? [];
    const hasSubtasks = parentsWithSubtasks.has(chore.id);
    result.push({
      ...chore,
      subtasks,
      has_subtasks: hasSubtasks,
      total_minutes: hasSubtasks
        ? subtasks.reduce((sum, subtask) => sum + (subtask.minutes || 0), 0)
        : chore.minutes || 0
    });
  }

  return result;
}

export function getMatchingLeafChoresForDate(allChores, checkDateInput) {
  const checkDate = toUtcDate(checkDateInput);
  const parentsWithSubtasks = new Set(allChores.filter((c) => c.parent_id).map((c) => c.parent_id));
  const choresById = new Map(allChores.map((c) => [c.id, c]));
  const parentMatchesCache = new Map();

  const choreMatchesDate = (chore) => {
    if (chore?.is_active === false) {
      return false;
    }
    return matchesSchedule(chore.schedule_type, chore.schedule || {}, checkDate);
  };

  const matching = [];
  for (const chore of allChores) {
    if (chore.is_active === false) {
      continue;
    }

    if (parentsWithSubtasks.has(chore.id)) {
      continue;
    }

    if (chore.parent_id) {
      const parent = choresById.get(chore.parent_id);
      if (!parent) {
        continue;
      }
      if (!parentMatchesCache.has(chore.parent_id)) {
        parentMatchesCache.set(chore.parent_id, choreMatchesDate(parent));
      }
      if (parentMatchesCache.get(chore.parent_id)) {
        matching.push({ ...chore, parent_name: parent.name });
      }
      continue;
    }

    if (choreMatchesDate(chore)) {
      matching.push(chore);
    }
  }

  return matching;
}
