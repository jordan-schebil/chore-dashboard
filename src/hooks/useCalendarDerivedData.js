import { useCallback, useMemo } from 'react';

const EMPTY_BREAKDOWN = {
  daily: { count: 0, minutes: 0 },
  weekly: { count: 0, minutes: 0 },
  monthly: { count: 0, minutes: 0 },
  seasonal: { count: 0, minutes: 0 },
  one_time: { count: 0, minutes: 0 },
};

const EMPTY_DATE_DATA = {
  chores: { daily: [], weekly: [], monthly: [], seasonal: [], one_time: [] },
  allChores: [],
  byTime: { AM: [], PM: [] },
  count: 0,
  totalMinutes: 0,
  breakdown: EMPTY_BREAKDOWN,
};

const EMPTY_COMPLETED = { count: 0, minutes: 0 };

const getDateKey = (d) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
const getDateString = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const buildOrderMap = (ids) => {
  const map = {};
  ids.forEach((id, idx) => { map[id] = idx; });
  return map;
};

export function useCalendarDerivedData({
  year,
  month,
  selectedDate,
  calendarChoresByDate,
  visibleFrequencies,
  dailyOrder,
  completedTasks,
  viewMode,
}) {
  const getChoresForDate = useCallback((date) => {
    const result = { daily: [], weekly: [], monthly: [], seasonal: [], one_time: [] };
    const choresForDate = calendarChoresByDate[getDateString(date)] || [];
    choresForDate.forEach((chore) => {
      const category = chore.category || chore.scheduleType;
      if (!result[category] || !visibleFrequencies[category]) return;
      result[category].push(chore);
    });
    return result;
  }, [calendarChoresByDate, visibleFrequencies]);

  const monthChoresCache = useMemo(() => {
    const cache = new Map();
    for (let i = 1; i <= new Date(year, month + 1, 0).getDate(); i++) {
      const date = new Date(year, month, i);
      const dk = getDateKey(date);
      const dc = getChoresForDate(date);
      const all = [...dc.daily, ...dc.weekly, ...dc.monthly, ...dc.seasonal, ...dc.one_time];
      cache.set(dk, {
        chores: dc,
        allChores: all,
        byTime: { AM: all.filter(c => c.time === 'AM'), PM: all.filter(c => c.time === 'PM') },
        count: all.length,
        totalMinutes: all.reduce((s, c) => s + c.minutes, 0),
        breakdown: {
          daily: { count: dc.daily.length, minutes: dc.daily.reduce((s, c) => s + c.minutes, 0) },
          weekly: { count: dc.weekly.length, minutes: dc.weekly.reduce((s, c) => s + c.minutes, 0) },
          monthly: { count: dc.monthly.length, minutes: dc.monthly.reduce((s, c) => s + c.minutes, 0) },
          seasonal: { count: dc.seasonal.length, minutes: dc.seasonal.reduce((s, c) => s + c.minutes, 0) },
          one_time: { count: dc.one_time.length, minutes: dc.one_time.reduce((s, c) => s + c.minutes, 0) },
        },
      });
    }
    return cache;
  }, [year, month, getChoresForDate]);

  const getDateData = useCallback((date) => monthChoresCache.get(getDateKey(date)) || EMPTY_DATE_DATA, [monthChoresCache]);

  const getSortedChoresForDate = useCallback((date) => {
    const dd = getDateData(date);
    const dk = getDateKey(date);
    const dailyIds = dailyOrder[dk] || [];
    const dailyMap = dailyIds.length ? buildOrderMap(dailyIds) : null;
    const sortedAll = [...dd.allChores].sort((a, b) => {
      const da = dailyMap ? dailyMap[a.id] : undefined;
      const db = dailyMap ? dailyMap[b.id] : undefined;
      if (da != null || db != null) return (da ?? 1e9) - (db ?? 1e9);
      const ga = a.globalOrder ?? 0;
      const gb = b.globalOrder ?? 0;
      if (ga !== gb) return ga - gb;
      return a.name.localeCompare(b.name);
    });
    return {
      dateData: dd,
      all: sortedAll,
      byTime: { AM: sortedAll.filter(c => c.time === 'AM'), PM: sortedAll.filter(c => c.time === 'PM') },
    };
  }, [dailyOrder, getDateData]);

  const completionCounts = useMemo(() => {
    const counts = new Map();
    for (let i = 1; i <= new Date(year, month + 1, 0).getDate(); i++) {
      const date = new Date(year, month, i);
      const dk = getDateKey(date);
      const comp = completedTasks[dk] || {};
      const dd = getDateData(date);
      const completedCount = dd.allChores.filter(c => comp[c.id]).length;
      const completedMinutes = dd.allChores.filter(c => comp[c.id]).reduce((s, c) => s + c.minutes, 0);
      counts.set(dk, { count: completedCount, minutes: completedMinutes });
    }
    return counts;
  }, [completedTasks, year, month, getDateData]);

  const getCompletedData = useCallback((date) => completionCounts.get(getDateKey(date)) || EMPTY_COMPLETED, [completionCounts]);

  const dynamicThresholds = useMemo(() => {
    const vals = Array.from(monthChoresCache.values());
    const counts = vals.map(v => v.count).filter(c => c > 0);
    const mins = vals.map(v => v.totalMinutes).filter(m => m > 0);
    if (!counts.length) return { count: { light: 0, medium: 0, heavy: 0 }, time: { light: 0, medium: 0, heavy: 0 } };
    const minC = Math.min(...counts);
    const maxC = Math.max(...counts);
    const minM = Math.min(...mins);
    const maxM = Math.max(...mins);
    return {
      count: { light: minC + (maxC - minC) * 0.25, medium: minC + (maxC - minC) * 0.5, heavy: minC + (maxC - minC) * 0.75 },
      time: { light: minM + (maxM - minM) * 0.25, medium: minM + (maxM - minM) * 0.5, heavy: minM + (maxM - minM) * 0.75 },
    };
  }, [monthChoresCache]);

  const calendarDays = useMemo(() => {
    const first = new Date(year, month, 1);
    const days = Array(first.getDay()).fill(null);
    for (let i = 1; i <= new Date(year, month + 1, 0).getDate(); i++) {
      days.push(new Date(year, month, i));
    }
    return days;
  }, [year, month]);

  const selectedDateInfo = useMemo(() => {
    const dd = getDateData(selectedDate);
    const cd = getCompletedData(selectedDate);
    const ordered = getSortedChoresForDate(selectedDate);
    const completed = completedTasks[getDateKey(selectedDate)] || {};
    const amCompleted = ordered.byTime.AM.filter(c => completed[c.id]);
    const pmCompleted = ordered.byTime.PM.filter(c => completed[c.id]);
    return {
      dateData: dd,
      completedData: cd,
      completedMap: completed,
      progressPct: dd.count > 0 ? Math.round((cd.count / dd.count) * 100) : 0,
      am: {
        chores: ordered.byTime.AM,
        completedCount: amCompleted.length,
        completedMinutes: amCompleted.reduce((s, c) => s + c.minutes, 0),
        totalMinutes: ordered.byTime.AM.reduce((s, c) => s + c.minutes, 0),
      },
      pm: {
        chores: ordered.byTime.PM,
        completedCount: pmCompleted.length,
        completedMinutes: pmCompleted.reduce((s, c) => s + c.minutes, 0),
        totalMinutes: ordered.byTime.PM.reduce((s, c) => s + c.minutes, 0),
      },
    };
  }, [selectedDate, getDateData, getCompletedData, completedTasks, getSortedChoresForDate]);

  const isTaskCompleted = useCallback((choreId) => selectedDateInfo.completedMap[choreId] || false, [selectedDateInfo.completedMap]);

  const getHeatColor = useCallback((date) => {
    const dd = getDateData(date);
    const cd = getCompletedData(date);
    if (cd.count === dd.count && dd.count > 0) return 'bg-emerald-300 text-emerald-900';
    const rem = viewMode === 'count' ? dd.count - cd.count : dd.totalMinutes - cd.minutes;
    const { light, medium, heavy } = dynamicThresholds[viewMode === 'count' ? 'count' : 'time'];
    if (rem <= light) return 'bg-emerald-100 text-emerald-800';
    if (rem <= medium) return 'bg-amber-100 text-amber-800';
    if (rem <= heavy) return 'bg-orange-200 text-orange-800';
    return 'bg-red-200 text-red-800';
  }, [getDateData, getCompletedData, viewMode, dynamicThresholds]);

  return {
    calendarDays,
    dynamicThresholds,
    selectedDateInfo,
    getDateData,
    getCompletedData,
    getHeatColor,
    isTaskCompleted,
  };
}
