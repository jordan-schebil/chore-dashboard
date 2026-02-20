import React, { useState, useMemo, useReducer, useEffect, useCallback, memo } from 'react';
import { DndContext, DragOverlay, PointerSensor, closestCenter, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import * as api from './api';
import { ConfirmDialog, ToastStack } from './components/FeedbackUI';
import { useFeedback } from './hooks/useFeedback';
import { useCalendarDerivedData } from './hooks/useCalendarDerivedData';

const generateId = () => crypto.randomUUID();

const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const dayNamesFull = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const formatTime = (m) => m < 60 ? `${m}m` : m % 60 > 0 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${Math.floor(m / 60)}h`;
const ordinal = (n) => {
  const v = n % 100;
  const suffix = (v >= 11 && v <= 13) ? 'th' : (['th', 'st', 'nd', 'rd'][v % 10] || 'th');
  return `${n}${suffix}`;
};
const getDateKey = (d) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
const getDateString = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const getSundayWeekNumber = (d) => {
  const yearStart = new Date(d.getFullYear(), 0, 1);
  const weekStart = new Date(yearStart);
  weekStart.setDate(yearStart.getDate() - yearStart.getDay()); // Sunday-based week
  return Math.floor((d - weekStart) / (7 * 24 * 60 * 60 * 1000)) + 1;
};

const scheduleSummary = (scheduleType, schedule) => {
  if (scheduleType === 'daily') return 'Every day';
  if (scheduleType === 'one_time') {
    return schedule?.date ? new Date(schedule.date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }) : 'One-time';
  }
  if (scheduleType === 'weekly') {
    const days = (schedule?.days_of_week || []).map(d => dayNamesFull[d]).join(', ') || 'No days';
    const interval = schedule?.interval || 1;
    return interval > 1 ? `${days} (Every other week)` : days;
  }
  if (scheduleType === 'monthly') {
    const interval = schedule?.interval || 1;
    const prefix = interval > 1 ? 'Every other month: ' : '';
    if (schedule?.mode === 'date') return `${prefix}${ordinal(schedule?.day_of_month ?? 1)}`;
    return `${prefix}Week ${schedule?.week_of_month}, ${dayNamesFull[schedule?.day_of_week]}`;
  }
  if (scheduleType === 'seasonal') {
    const intervalMonths = schedule?.interval_months || 12;
    const cadence = intervalMonths === 3 ? 'Quarterly' : intervalMonths === 6 ? 'Semi-annual' : 'Annual';
    const monthLabel = schedule?.month ? monthNames[schedule.month - 1] : 'Month';
    if (schedule?.mode === 'date') return `${cadence} - ${monthLabel} ${ordinal(schedule?.day_of_month ?? 1)}`;
    return `${cadence} - ${monthLabel} W${schedule?.week_of_month}, ${dayNamesFull[schedule?.day_of_week]}`;
  }
  return 'Schedule';
};
const getCategoryColor = (c) => ({ daily: 'bg-emerald-400', weekly: 'bg-blue-400', monthly: 'bg-purple-400', seasonal: 'bg-orange-400', one_time: 'bg-red-400' }[c] || 'bg-gray-400');
const getCategoryColorHex = (c) => ({ daily: '#34d399', weekly: '#60a5fa', monthly: '#c084fc', seasonal: '#fb923c', one_time: '#f87171' }[c] || '#9ca3af');
const getCategoryColorBorder = (c) => ({ daily: 'border-emerald-400', weekly: 'border-blue-400', monthly: 'border-purple-400', seasonal: 'border-orange-400', one_time: 'border-red-400' }[c] || 'border-gray-400');
const getCategoryColorText = (c) => ({ daily: 'text-emerald-600', weekly: 'text-blue-600', monthly: 'text-purple-600', seasonal: 'text-orange-600', one_time: 'text-red-600' }[c] || 'text-gray-600');
const getCategoryColorBg = (c) => ({ daily: 'bg-emerald-50', weekly: 'bg-blue-50', monthly: 'bg-purple-50', seasonal: 'bg-orange-50', one_time: 'bg-red-50' }[c] || 'bg-gray-50');
const getCategoryLabel = (c) => ({ daily: 'Daily', weekly: 'Weekly', monthly: 'Monthly', seasonal: 'Seasonal', one_time: 'One-Time' }[c] || c);
const ALL_FREQUENCIES = ['daily', 'weekly', 'monthly', 'seasonal', 'one_time'];

// Transform API chore (snake_case) to frontend format (camelCase)
const apiToFrontend = (apiChore) => ({
  id: apiChore.id,
  name: apiChore.name,
  scheduleType: apiChore.schedule_type,
  schedule: apiChore.schedule || {},
  time: apiChore.time_of_day,
  minutes: apiChore.minutes,
  parentId: apiChore.parent_id,
  parentName: apiChore.parent_name,  // Included in for-date response for sub-tasks
  subtasks: apiChore.subtasks?.map(apiToFrontend) || [],
  hasSubtasks: apiChore.has_subtasks || false,
  totalMinutes: apiChore.total_minutes || apiChore.minutes || 0,
  globalOrder: apiChore.global_order ?? 0,
  isActive: apiChore.is_active !== false,
  roomIds: Array.isArray(apiChore.room_ids) ? apiChore.room_ids : [],
});

// Transform frontend chore (camelCase) to API format (snake_case)
const frontendToApi = (chore) => ({
  name: chore.name,
  schedule_type: chore.scheduleType,
  schedule: chore.schedule ?? null,
  time_of_day: chore.time ?? null,
  minutes: chore.minutes ?? null,
  parent_id: chore.parentId ?? null,
  global_order: chore.globalOrder ?? 0,
  is_active: chore.isActive ?? true,
  room_ids: chore.roomIds ?? [],
});

// Group flat array of chores by frequency
const groupChoresByFrequency = (chores) => {
  const grouped = { daily: [], weekly: [], monthly: [], seasonal: [], one_time: [] };
  chores.forEach(c => {
    const freq = c.schedule_type;
    if (grouped[freq]) grouped[freq].push(apiToFrontend(c));
  });
  return grouped;
};


// Initial data - no timestamps (they weren't meaningful for default chores)
const withDefaults = (list) => list.map(c => ({ isActive: true, roomIds: [], ...c }));
const createInitialChores = () => ({
  daily: withDefaults([
    { id: generateId(), name: 'Make bed', scheduleType: 'daily', schedule: {}, time: 'AM', minutes: 3 },
    { id: generateId(), name: 'Scoop litter boxes', scheduleType: 'daily', schedule: {}, time: 'AM', minutes: 5 },
    { id: generateId(), name: 'Wipe bathroom sink and counter', scheduleType: 'daily', schedule: {}, time: 'AM', minutes: 3 },
    { id: generateId(), name: 'Vacuum all floors', scheduleType: 'daily', schedule: {}, time: 'AM', minutes: 20 },
    { id: generateId(), name: 'Dishes / load dishwasher', scheduleType: 'daily', schedule: {}, time: 'PM', minutes: 10 },
    { id: generateId(), name: 'Wipe kitchen counters', scheduleType: 'daily', schedule: {}, time: 'PM', minutes: 5 },
    { id: generateId(), name: 'Take out trash when full', scheduleType: 'daily', schedule: {}, time: 'PM', minutes: 5 },
    { id: generateId(), name: 'Pick up clutter / return items to place', scheduleType: 'daily', schedule: {}, time: 'PM', minutes: 10 }
  ]),
  weekly: withDefaults([
    { id: generateId(), name: 'Mop hard floors', scheduleType: 'weekly', schedule: { days_of_week: [1], interval: 1 }, time: 'AM', minutes: 20 },
    { id: generateId(), name: 'Clean toilets', scheduleType: 'weekly', schedule: { days_of_week: [2], interval: 1 }, time: 'AM', minutes: 10 },
    { id: generateId(), name: 'Clean showers/tubs', scheduleType: 'weekly', schedule: { days_of_week: [2], interval: 1 }, time: 'AM', minutes: 15 },
    { id: generateId(), name: 'Dust surfaces', scheduleType: 'weekly', schedule: { days_of_week: [3], interval: 1 }, time: 'AM', minutes: 15 },
    { id: generateId(), name: 'Clean mirrors', scheduleType: 'weekly', schedule: { days_of_week: [3], interval: 1 }, time: 'AM', minutes: 10 },
    { id: generateId(), name: 'Wipe down kitchen appliances', scheduleType: 'weekly', schedule: { days_of_week: [4], interval: 1 }, time: 'PM', minutes: 10 },
    { id: generateId(), name: 'Brush dog and cats', scheduleType: 'weekly', schedule: { days_of_week: [4], interval: 1 }, time: 'PM', minutes: 20 },
    { id: generateId(), name: 'Empty all small trash cans', scheduleType: 'weekly', schedule: { days_of_week: [5], interval: 1 }, time: 'AM', minutes: 10 },
    { id: generateId(), name: 'Change bed linens', scheduleType: 'weekly', schedule: { days_of_week: [6], interval: 1 }, time: 'AM', minutes: 15 },
    { id: generateId(), name: 'Laundry (wash, dry, fold, put away)', scheduleType: 'weekly', schedule: { days_of_week: [6], interval: 1 }, time: 'AM', minutes: 45 },
    { id: generateId(), name: 'Wash food and water bowls', scheduleType: 'weekly', schedule: { days_of_week: [0], interval: 1 }, time: 'PM', minutes: 10 }
  ]),
  monthly: withDefaults([
    { id: generateId(), name: 'Vacuum upholstery and mattresses', scheduleType: 'monthly', schedule: { mode: 'nth_weekday', week_of_month: 1, day_of_week: 6, interval: 1 }, time: 'AM', minutes: 25 },
    { id: generateId(), name: 'Wash throw blankets and pillows', scheduleType: 'monthly', schedule: { mode: 'nth_weekday', week_of_month: 1, day_of_week: 6, interval: 1 }, time: 'AM', minutes: 20 },
    { id: generateId(), name: 'Clean Keurig and toaster oven', scheduleType: 'monthly', schedule: { mode: 'nth_weekday', week_of_month: 1, day_of_week: 6, interval: 1 }, time: 'PM', minutes: 15 },
    { id: generateId(), name: 'Clean inside microwave and oven', scheduleType: 'monthly', schedule: { mode: 'nth_weekday', week_of_month: 2, day_of_week: 6, interval: 1 }, time: 'AM', minutes: 20 },
    { id: generateId(), name: 'Deep clean litter boxes', scheduleType: 'monthly', schedule: { mode: 'nth_weekday', week_of_month: 2, day_of_week: 6, interval: 1 }, time: 'AM', minutes: 20 },
    { id: generateId(), name: 'Clean out fridge', scheduleType: 'monthly', schedule: { mode: 'nth_weekday', week_of_month: 2, day_of_week: 6, interval: 1 }, time: 'PM', minutes: 25 },
    { id: generateId(), name: 'Wipe cabinet fronts', scheduleType: 'monthly', schedule: { mode: 'nth_weekday', week_of_month: 3, day_of_week: 6, interval: 1 }, time: 'AM', minutes: 20 },
    { id: generateId(), name: 'Dust blinds and ceiling fans', scheduleType: 'monthly', schedule: { mode: 'nth_weekday', week_of_month: 3, day_of_week: 6, interval: 1 }, time: 'AM', minutes: 25 },
    { id: generateId(), name: 'Clean window sills and baseboards', scheduleType: 'monthly', schedule: { mode: 'nth_weekday', week_of_month: 4, day_of_week: 6, interval: 1 }, time: 'AM', minutes: 30 },
    { id: generateId(), name: 'Clean cat trees and scratching posts', scheduleType: 'monthly', schedule: { mode: 'nth_weekday', week_of_month: 4, day_of_week: 6, interval: 1 }, time: 'PM', minutes: 20 }
  ]),
  seasonal: withDefaults([
    { id: generateId(), name: 'Deep clean carpets', scheduleType: 'seasonal', schedule: { month: 1, mode: 'nth_weekday', week_of_month: 1, day_of_week: 6, interval_months: 3 }, time: 'AM', minutes: 60 },
    { id: generateId(), name: 'Flip or rotate mattress', scheduleType: 'seasonal', schedule: { month: 1, mode: 'nth_weekday', week_of_month: 1, day_of_week: 6, interval_months: 3 }, time: 'AM', minutes: 10 },
    { id: generateId(), name: 'Deep clean furniture for embedded pet hair', scheduleType: 'seasonal', schedule: { month: 1, mode: 'nth_weekday', week_of_month: 1, day_of_week: 6, interval_months: 3 }, time: 'PM', minutes: 45 }
  ]),
  one_time: []
});

const choreReducer = (state, action) => {
  switch (action.type) {
    case 'ADD_CHORE': {
      const { chore, scheduleType } = action.payload;
      return { ...state, [scheduleType]: [...state[scheduleType], { ...chore, id: generateId() }] };
    }
    case 'UPDATE_CHORE': {
      const { chore, oldScheduleType, newScheduleType } = action.payload;
      const withoutOld = { ...state, [oldScheduleType]: state[oldScheduleType].filter(c => c.id !== chore.id) };
      return { ...withoutOld, [newScheduleType]: [...withoutOld[newScheduleType], chore] };
    }
    case 'DELETE_CHORE': {
      const { id, scheduleType } = action.payload;
      return { ...state, [scheduleType]: state[scheduleType].filter(c => c.id !== id) };
    }
    case 'LOAD_DATA': return action.payload;
    default: return state;
  }
};

// External memoized components to prevent recreation on each render
const HighlightedText = memo(({ text, query }) => {
  if (!query.trim()) return <>{text}</>;
  return <>{text.split(new RegExp(`(${query})`, 'gi')).map((p, i) =>
    p.toLowerCase() === query.toLowerCase() ? <mark key={i} className="bg-yellow-200 rounded px-0.5">{p}</mark> : p
  )}</>;
});

const ChoreMenu = memo(({ onEdit }) => {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button onClick={() => setOpen(!open)} className="p-1 text-gray-400 hover:text-gray-600 rounded focus:outline-none focus:ring-2 focus:ring-blue-500">
        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="5" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="12" cy="19" r="2" /></svg>
      </button>
      {open && <>
        <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
        <div className="absolute right-0 top-full mt-1 bg-white rounded-lg shadow-lg border py-1 z-20 min-w-32">
          <button onClick={() => { setOpen(false); onEdit(); }} className="w-full px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
            Edit
          </button>
        </div>
      </>}
    </div>
  );
});

const ChoreItem = memo(({ chore, completed, onToggle, onEdit, showDragHandle = false, itemRef = null, itemStyle = null, dragHandleProps = {}, isDragging = false }) => (
  <li ref={itemRef} style={itemStyle} className={`text-sm flex items-center gap-2 p-2 rounded-lg transition-all relative ${completed ? 'bg-gray-50 text-gray-400' : 'hover:bg-gray-50 text-gray-700'} ${isDragging ? 'opacity-50' : ''}`}>
    {showDragHandle && (
      <span className="text-gray-500 cursor-grab select-none bg-white/90 border border-gray-200 rounded p-0.5 shadow-sm hover:border-gray-300 hover:text-gray-700" {...dragHandleProps}>
        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
          <path d="M7 4a1 1 0 112 0 1 1 0 01-2 0zm4 0a1 1 0 112 0 1 1 0 01-2 0zM7 10a1 1 0 112 0 1 1 0 01-2 0zm4 0a1 1 0 112 0 1 1 0 01-2 0zM7 16a1 1 0 112 0 1 1 0 01-2 0zm4 0a1 1 0 112 0 1 1 0 01-2 0z" />
        </svg>
      </span>
    )}
    <button onClick={() => onToggle(chore.id)} aria-pressed={completed} className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-emerald-500 ${completed ? 'bg-emerald-500 border-emerald-500' : 'border-gray-300 hover:border-gray-400'}`}>
      {completed && <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
    </button>
    <span className={`w-2 h-2 rounded-full flex-shrink-0 ${getCategoryColor(chore.category)}`} />
    <span onClick={() => onToggle(chore.id)} className={`flex-grow cursor-pointer ${completed ? 'line-through' : ''}`}>
      {chore.parentName ? <><span className="text-gray-400">{chore.parentName}{' -> '}</span>{chore.name}</> : chore.name}
    </span>
    <span className={`text-xs px-2 py-0.5 rounded-full ${completed ? 'bg-gray-100 text-gray-400' : 'bg-gray-100 text-gray-500'}`}>{chore.minutes}m</span>
    <ChoreMenu onEdit={() => onEdit(chore)} />
  </li>
));

const DaySortableItem = memo(({ chore, bucket, completed, onToggle, onEdit }) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: chore.id,
    data: { bucket }
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition
  };
  return (
    <ChoreItem
      chore={chore}
      completed={completed}
      onToggle={onToggle}
      onEdit={onEdit}
      showDragHandle
      itemRef={setNodeRef}
      itemStyle={style}
      dragHandleProps={{ ...attributes, ...listeners }}
      isDragging={isDragging}
    />
  );
});



const ManageChoreItem = memo(({ chore, frequency, searchQuery, onEdit, onDelete, roomMap }) => {

  const [expanded, setExpanded] = useState(false);
  const hasSubtasks = chore.hasSubtasks || (chore.subtasks && chore.subtasks.length > 0);

  const desc = scheduleSummary(chore.scheduleType || frequency, chore.schedule || {});

  // For parent chores, show total minutes from subtasks
    const displayMinutes = hasSubtasks ? chore.totalMinutes : chore.minutes;
    const roomNames = (chore.roomIds || []).map(id => roomMap[id]).filter(Boolean);

  return (
    <div className="rounded-lg border border-gray-200 hover:border-gray-300 overflow-hidden">
      <div className={`flex items-center gap-3 p-3 bg-white ${hasSubtasks ? 'cursor-pointer' : ''}`} onClick={hasSubtasks ? () => setExpanded(!expanded) : undefined}>
        {hasSubtasks && (
          <button className="p-0.5 text-gray-400 hover:text-gray-600 focus:outline-none">
            <svg className={`w-4 h-4 transition-transform ${expanded ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        )}
        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${getCategoryColor(frequency)}`} />
        <div className="flex-grow min-w-0">
            <div className="font-medium text-gray-800 truncate flex items-center gap-2">
              <HighlightedText text={chore.name} query={searchQuery} />
              {hasSubtasks && <span className="text-xs text-gray-400 font-normal">({chore.subtasks?.length || 0} sub-tasks)</span>}
              {!chore.isActive && <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">Inactive</span>}
            </div>
            <div className="text-xs text-gray-500 flex items-center gap-2 flex-wrap">
              {!hasSubtasks && chore.time && <><span>{chore.time}</span><span>-</span></>}
              <span>{displayMinutes}m</span>
              {desc && <><span>-</span><span>{desc}</span></>}
              {roomNames.length ? <><span>-</span><span>Rooms: {roomNames.join(', ')}</span></> : null}
            </div>
        </div>
        <button onClick={(e) => { e.stopPropagation(); onEdit(chore); }} className="p-1.5 text-gray-400 hover:text-blue-500 hover:bg-blue-50 rounded focus:outline-none focus:ring-2 focus:ring-blue-500">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
        </button>
        <button onClick={(e) => { e.stopPropagation(); onDelete(chore.id); }} className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded focus:outline-none focus:ring-2 focus:ring-red-500">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
        </button>
      </div>
      {/* Sub-tasks accordion panel - display only, edit via parent's EditModal */}
      {hasSubtasks && expanded && (
        <div className="bg-gray-50 border-t border-gray-200 pl-8 pr-3 py-2 space-y-2">
          {chore.subtasks?.map(subtask => (
            <div key={subtask.id} className="flex items-center gap-3 p-2 bg-white rounded border border-gray-100">
              <span className="w-1.5 h-1.5 rounded-full bg-gray-300 flex-shrink-0" />
              <div className="flex-grow min-w-0">
                <div className="text-sm text-gray-700 truncate">{subtask.name}</div>
                <div className="text-xs text-gray-400">{subtask.time} - {subtask.minutes}m</div>
              </div>
            </div>
          ))}
        </div>
      )}


    </div>
  );
});


const FrequencySection = memo(({ title, list, frequency, color, total, searchQuery, timeOfDayFilter, frequencyFilter, onAdd, onEdit, onDelete, roomMap }) => {
  if (!list.length && (searchQuery || frequencyFilter !== 'all' || timeOfDayFilter !== 'all')) return null;
  return (
    <div className="mb-6">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className={`w-3 h-3 rounded-full ${color}`} />
          <h3 className="font-semibold text-gray-800">{title}</h3>
          <span className="text-sm text-gray-500">{(searchQuery || timeOfDayFilter !== 'all') ? `${list.length} of ${total}` : `(${list.length})`}</span>
        </div>
        {!searchQuery && frequencyFilter === 'all' && timeOfDayFilter === 'all' && (
          <button onClick={() => onAdd(frequency)} className="text-sm text-blue-500 hover:text-blue-600 flex items-center gap-1">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>Add
          </button>
        )}
      </div>
      <div className="space-y-2">
          {list.map(c => <ManageChoreItem key={c.id} chore={c} frequency={frequency} searchQuery={searchQuery} onEdit={(ch) => onEdit({ ...ch, scheduleType: frequency })} onDelete={(id) => onDelete(id, frequency)} roomMap={roomMap} />)}
        {!list.length && !searchQuery && frequencyFilter === 'all' && timeOfDayFilter === 'all' && <div className="text-sm text-gray-400 italic p-3 bg-gray-50 rounded-lg">No chores</div>}
      </div>
    </div>
  );
});

const CalendarTooltip = memo(({ date, breakdown, viewMode }) => {
  if (!date) return null;
  const cats = ['daily', 'weekly', 'monthly', 'seasonal', 'one_time'];
  if (!cats.some(c => breakdown[c]?.count > 0)) return null;
  return (
    <div className="absolute z-30 bg-gray-900 text-white text-xs rounded-lg p-3 shadow-xl -translate-x-1/2 left-1/2 bottom-full mb-2 min-w-40">
      <div className="font-medium mb-2">{date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</div>
      <div className="space-y-1">{cats.map(c => !breakdown[c]?.count ? null : (
        <div key={c} className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-1.5"><span className={`w-2 h-2 rounded-full ${getCategoryColor(c)}`} /><span>{getCategoryLabel(c)}</span></div>
          <span className="text-gray-300">{viewMode === 'count' ? breakdown[c].count : formatTime(breakdown[c].minutes)}</span>
        </div>
      ))}</div>

      <div className="absolute left-1/2 -translate-x-1/2 top-full w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-gray-900" />
    </div>
  );
});

// Treemap components for "By Chore" calendar view
const HorizontalTreemap = memo(({ breakdown, viewMode }) => {
  const items = ALL_FREQUENCIES
    .filter(freq => breakdown[freq].count > 0)
    .map(freq => ({ freq, value: viewMode === 'count' ? breakdown[freq].count : breakdown[freq].minutes }));
  const total = items.reduce((sum, item) => sum + item.value, 0);
  if (total === 0) return <div className="w-full h-full bg-gray-100 rounded" />;
  return (
    <div className="w-full h-full flex flex-col rounded overflow-hidden">
      {items.map(item => (
        <div key={item.freq} style={{ height: `${(item.value / total) * 100}%`, backgroundColor: getCategoryColorHex(item.freq) }} className="w-full min-h-[2px]" />
      ))}
    </div>
  );
});

const VerticalTreemap = memo(({ breakdown, viewMode }) => {
  const items = ALL_FREQUENCIES
    .filter(freq => breakdown[freq].count > 0)
    .map(freq => ({ freq, value: viewMode === 'count' ? breakdown[freq].count : breakdown[freq].minutes }));
  const total = items.reduce((sum, item) => sum + item.value, 0);
  if (total === 0) return <div className="w-full h-full bg-gray-100 rounded" />;
  return (
    <div className="w-full h-full flex flex-row rounded overflow-hidden">
      {items.map(item => (
        <div key={item.freq} style={{ width: `${(item.value / total) * 100}%`, backgroundColor: getCategoryColorHex(item.freq) }} className="h-full min-w-[2px]" />
      ))}
    </div>
  );
});

const FrequencyFilterBar = memo(({ visibleFrequencies, onToggle }) => {
  const baseClasses = "px-2.5 py-1 rounded-full text-xs font-medium border-2 transition-all cursor-pointer flex items-center gap-1.5 focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-blue-500";

  return (
    <div className="flex items-center gap-2 mb-4">
      <span className="text-sm text-gray-500 mr-1">Show:</span>
      {ALL_FREQUENCIES.map(freq => {
        const enabled = visibleFrequencies[freq];
        const enabledClasses = `${getCategoryColorBg(freq)} ${getCategoryColorBorder(freq)} ${getCategoryColorText(freq)}`;
        const disabledClasses = "bg-gray-100 border-gray-200 text-gray-400";

        return (
          <button
            key={freq}
            onClick={() => onToggle(freq)}
            className={`${baseClasses} ${enabled ? enabledClasses : disabledClasses}`}
            title={enabled ? `Hide ${getCategoryLabel(freq).toLowerCase()} chores` : `Show ${getCategoryLabel(freq).toLowerCase()} chores`}
          >
            <span className={`w-2 h-2 rounded-full ${enabled ? getCategoryColor(freq) : 'bg-gray-300'}`} />
            <span>{getCategoryLabel(freq)}</span>
          </button>
        );
      })}
    </div>
  );
});

const SaveIndicator = memo(({ status }) => (
  <span className={`text-xs flex items-center gap-1 ${status === 'saved' ? 'text-green-600' : status === 'saving' ? 'text-amber-600' : 'text-red-600'}`}>
    {status === 'saved' && 'Saved'}{status === 'saving' && 'Saving...'}{status === 'error' && 'Error'}
  </span>
));

const EditModal = memo(({ chore, rooms, onClose, onSave, onAddSubtask, onUpdateSubtask, onDeleteSubtask, onError, onRequestConfirm }) => {
  const today = new Date();
  const reportError = onError || ((message) => console.warn(message));
  const [name, setName] = useState(chore.name);
  const [time, setTime] = useState(chore.time || 'AM');
  const [minutes, setMinutes] = useState(chore.minutes || 10);
  const [scheduleType, setScheduleType] = useState(chore.scheduleType || 'daily');
  const [isActive, setIsActive] = useState(chore.isActive ?? true);
  const [roomIds, setRoomIds] = useState(chore.roomIds || []);

  const [weeklyDays, setWeeklyDays] = useState(chore.scheduleType === 'weekly' ? (chore.schedule?.days_of_week || []) : [today.getDay()]);
  const [weeklyInterval, setWeeklyInterval] = useState(chore.scheduleType === 'weekly' ? (chore.schedule?.interval || 1) : 1);
  const [weeklyParity, setWeeklyParity] = useState(chore.scheduleType === 'weekly' ? (chore.schedule?.week_parity ?? (getSundayWeekNumber(today) % 2)) : (getSundayWeekNumber(today) % 2));

  const [monthlyMode, setMonthlyMode] = useState(chore.scheduleType === 'monthly' ? (chore.schedule?.mode || 'nth_weekday') : 'nth_weekday');
  const [monthlyInterval, setMonthlyInterval] = useState(chore.scheduleType === 'monthly' ? (chore.schedule?.interval || 1) : 1);
  const [monthlyWeek, setMonthlyWeek] = useState(chore.scheduleType === 'monthly' ? (chore.schedule?.week_of_month || 1) : 1);
  const [monthlyDay, setMonthlyDay] = useState(chore.scheduleType === 'monthly' ? (chore.schedule?.day_of_week ?? 6) : 6);
  const [monthlyDate, setMonthlyDate] = useState(chore.scheduleType === 'monthly' ? (chore.schedule?.day_of_month || 1) : 1);

  const [seasonalMonth, setSeasonalMonth] = useState(chore.scheduleType === 'seasonal' ? (chore.schedule?.month || (today.getMonth() + 1)) : (today.getMonth() + 1));
  const [seasonalInterval, setSeasonalInterval] = useState(chore.scheduleType === 'seasonal' ? (chore.schedule?.interval_months || 3) : 3);
  const [seasonalMode, setSeasonalMode] = useState(chore.scheduleType === 'seasonal' ? (chore.schedule?.mode || 'nth_weekday') : 'nth_weekday');
  const [seasonalWeek, setSeasonalWeek] = useState(chore.scheduleType === 'seasonal' ? (chore.schedule?.week_of_month || 1) : 1);
  const [seasonalDay, setSeasonalDay] = useState(chore.scheduleType === 'seasonal' ? (chore.schedule?.day_of_week ?? 6) : 6);
  const [seasonalDate, setSeasonalDate] = useState(chore.scheduleType === 'seasonal' ? (chore.schedule?.day_of_month || 1) : 1);

  const [oneTimeDate, setOneTimeDate] = useState(chore.scheduleType === 'one_time' ? (chore.schedule?.date || '') : '');

  // Sub-task management state
  const [subtasks, setSubtasks] = useState(chore.subtasks || []);
  const [hasExistingSubtasks, setHasExistingSubtasks] = useState((chore.subtasks || []).length > 0 || chore.hasSubtasks);
  const [showAddSubtask, setShowAddSubtask] = useState(false);
  const [newSubtaskName, setNewSubtaskName] = useState('');
  const [newSubtaskTime, setNewSubtaskTime] = useState('AM');
  const [newSubtaskMinutes, setNewSubtaskMinutes] = useState(10);
  const [showParentTimeHint, setShowParentTimeHint] = useState(false);
  const [editingSubtaskId, setEditingSubtaskId] = useState(null);
  const [editSubtaskName, setEditSubtaskName] = useState('');
  const [editSubtaskTime, setEditSubtaskTime] = useState('AM');
  const [editSubtaskMinutes, setEditSubtaskMinutes] = useState(10);

  const hasSubtasks = subtasks.length > 0;
  const isParentChore = hasExistingSubtasks;

  const enableSubtasks = () => {
    setHasExistingSubtasks(true);
    setShowAddSubtask(true);
    setShowParentTimeHint(false);
  };

  const toggleWeeklyDay = (d) => {
    setWeeklyDays(prev => prev.includes(d) ? prev.filter(x => x !== d) : [...prev, d].sort((a, b) => a - b));
  };

  const toggleRoom = (roomId) => {
    setRoomIds(prev => prev.includes(roomId) ? prev.filter(id => id !== roomId) : [...prev, roomId]);
  };

  const buildSchedule = () => {
    if (scheduleType === 'daily') return {};
    if (scheduleType === 'one_time') return { date: oneTimeDate };
    if (scheduleType === 'weekly') {
      const schedule = { days_of_week: weeklyDays, interval: weeklyInterval };
      if (weeklyInterval > 1) {
        schedule.week_parity = weeklyParity;
      }
      return schedule;
    }
    if (scheduleType === 'monthly') {
      const schedule = { mode: monthlyMode, interval: monthlyInterval };
      if (monthlyMode === 'date') schedule.day_of_month = monthlyDate;
      else { schedule.week_of_month = monthlyWeek; schedule.day_of_week = monthlyDay; }
      if (monthlyInterval > 1) {
        const existing = chore.scheduleType === 'monthly' ? chore.schedule?.month_parity : null;
        schedule.month_parity = existing ?? ((today.getMonth() + 1) % 2);
      }
      return schedule;
    }
    if (scheduleType === 'seasonal') {
      const schedule = { month: seasonalMonth, interval_months: seasonalInterval, mode: seasonalMode };
      if (seasonalMode === 'date') schedule.day_of_month = seasonalDate;
      else { schedule.week_of_month = seasonalWeek; schedule.day_of_week = seasonalDay; }
      return schedule;
    }
    return {};
  };

  const valid = name.trim()
    && (scheduleType !== 'weekly' || weeklyDays.length > 0)
    && (scheduleType !== 'monthly' || (monthlyMode === 'date' ? monthlyDate : (monthlyWeek && monthlyDay !== null)))
    && (scheduleType !== 'seasonal' || (seasonalMode === 'date' ? seasonalDate : (seasonalWeek && seasonalDay !== null)))
    && (scheduleType !== 'one_time' || oneTimeDate);

  const handleSave = () => {
    if (!valid) return;
    const updatedChore = {
      ...chore,
      name,
      time: isParentChore ? null : time,
      minutes: isParentChore ? null : parseInt(minutes) || 5,
      scheduleType,
      schedule: buildSchedule(),
      subtasks,
      isActive,
      roomIds
    };
    onSave(updatedChore, chore.scheduleType, scheduleType);
    onClose();
  };

  const handleAddSubtask = async () => {
    if (!newSubtaskName.trim()) return;
      const newSubtask = {
        id: crypto.randomUUID(),
        name: newSubtaskName.trim(),
        time: newSubtaskTime,
        minutes: parseInt(newSubtaskMinutes) || 5,
        parentId: chore.id,
        scheduleType,
        schedule: buildSchedule(),
        roomIds
      };

    try {
      const created = await onAddSubtask(chore.id, newSubtask);
      setSubtasks(prev => [...prev, created]);
      setHasExistingSubtasks(true);
      setShowParentTimeHint(false);
      setNewSubtaskName('');
      setNewSubtaskMinutes(10);
      setShowAddSubtask(false);
    } catch (e) {
      reportError('Failed to add subtask');
    }
  };

  const startEditSubtask = (subtask) => {
    setEditingSubtaskId(subtask.id);
    setEditSubtaskName(subtask.name);
    setEditSubtaskTime(subtask.time || 'AM');
    setEditSubtaskMinutes(subtask.minutes || 5);
  };

  const handleUpdateSubtask = async (subtaskId) => {
    if (!editSubtaskName.trim()) return;
      const updatedSubtask = {
        id: subtaskId,
        name: editSubtaskName.trim(),
        time: editSubtaskTime,
        minutes: parseInt(editSubtaskMinutes) || 5,
        parentId: chore.id,
        scheduleType,
        schedule: buildSchedule(),
        roomIds
      };
    try {
      const saved = await onUpdateSubtask(subtaskId, updatedSubtask);
      setSubtasks(prev => prev.map(s => s.id === subtaskId ? saved : s));
      setEditingSubtaskId(null);
    } catch (e) {
      reportError('Failed to update subtask');
    }
  };

  const cancelEditSubtask = () => {
    setEditingSubtaskId(null);
  };

  const handleDeleteSubtask = async (subtaskId) => {
    const doDelete = async () => {
      try {
        await onDeleteSubtask(subtaskId);
        setSubtasks(prev => {
          const next = prev.filter(s => s.id !== subtaskId);
          if (next.length === 0) {
            setHasExistingSubtasks(false);
            setShowParentTimeHint(true);
          }
          return next;
        });
      } catch (e) {
        reportError('Failed to delete subtask');
      }
    };

    if (onRequestConfirm) {
      onRequestConfirm('Delete this sub-task?', doDelete, { confirmLabel: 'Delete', tone: 'danger' });
      return;
    }
    doDelete();
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-800">Edit Chore</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg></button>
        </div>
          <div className="space-y-4">
            <div><label className="block text-sm font-medium text-gray-700 mb-1">Name</label><input type="text" value={name} onChange={e => setName(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500" /></div>
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium text-gray-700">Active</label>
              <label className="inline-flex items-center gap-2 text-sm text-gray-600">
                <input type="checkbox" checked={isActive} onChange={e => setIsActive(e.target.checked)} />
                {isActive ? 'Active' : 'Inactive'}
              </label>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Rooms</label>
              {!rooms?.length && <div className="text-xs text-gray-500">No rooms yet. Add rooms in Manage.</div>}
              {!!rooms?.length && (
                <div className="grid grid-cols-2 gap-2">
                  {rooms.map(r => (
                    <label key={r.id} className="flex items-center gap-2 text-sm text-gray-700">
                      <input type="checkbox" checked={roomIds.includes(r.id)} onChange={() => toggleRoom(r.id)} />
                      {r.name}
                    </label>
                  ))}
                </div>
              )}
            </div>
          {!isParentChore && (
            <div className="space-y-2">
              {showParentTimeHint && (
                <div className="text-xs text-blue-600 bg-blue-50 border border-blue-100 rounded-lg p-2">
                  No sub-tasks remain. Set Time and Minutes for the parent chore so it shows up on the Calendar.
                </div>
              )}
              <div className="grid grid-cols-2 gap-4">
                <div><label className="block text-sm font-medium text-gray-700 mb-1">Time</label><select value={time} onChange={e => setTime(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"><option value="AM">AM</option><option value="PM">PM</option></select></div>
                <div><label className="block text-sm font-medium text-gray-700 mb-1">Minutes</label><input type="number" value={minutes} onChange={e => setMinutes(e.target.value)} min="1" className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500" /></div>
              </div>
            </div>
          )}
          <div><label className="block text-sm font-medium text-gray-700 mb-1">Schedule Type</label><select value={scheduleType} onChange={e => setScheduleType(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"><option value="daily">Daily</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option><option value="seasonal">Seasonal</option><option value="one_time">One-Time</option></select></div>
          {scheduleType === 'weekly' && (
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700">Days of Week</label>
              <div className="grid grid-cols-2 gap-2">
                {dayNamesFull.map((d, i) => (
                  <label key={i} className="flex items-center gap-2 text-sm text-gray-700">
                    <input type="checkbox" checked={weeklyDays.includes(i)} onChange={() => toggleWeeklyDay(i)} />
                    {d}
                  </label>
                ))}
              </div>
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Interval</label><select value={weeklyInterval} onChange={e => setWeeklyInterval(+e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"><option value={1}>Every week</option><option value={2}>Every other week</option></select></div>
              {weeklyInterval > 1 && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Start Week</label>
                  <select value={weeklyParity} onChange={e => setWeeklyParity(+e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500">
                    <option value={0}>Even</option>
                    <option value={1}>Odd</option>
                  </select>
                  <div className="text-xs text-gray-500 mt-1">Current week: {getSundayWeekNumber(today) % 2 === 0 ? 'Even' : 'Odd'}</div>
                </div>
              )}
            </div>
          )}
          {scheduleType === 'monthly' && (
            <div className="space-y-2">
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Interval</label><select value={monthlyInterval} onChange={e => setMonthlyInterval(+e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"><option value={1}>Every month</option><option value={2}>Every other month</option></select></div>
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Mode</label><select value={monthlyMode} onChange={e => setMonthlyMode(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"><option value="nth_weekday">Nth weekday</option><option value="date">Date of month</option></select></div>
              {monthlyMode === 'nth_weekday' ? (
                <div className="grid grid-cols-2 gap-4">
                  <div><label className="block text-sm font-medium text-gray-700 mb-1">Week</label><select value={monthlyWeek} onChange={e => setMonthlyWeek(+e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500">{[1, 2, 3, 4].map(w => <option key={w} value={w}>Week {w}</option>)}</select></div>
                  <div><label className="block text-sm font-medium text-gray-700 mb-1">Day</label><select value={monthlyDay} onChange={e => setMonthlyDay(+e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500">{dayNamesFull.map((d, i) => <option key={i} value={i}>{d}</option>)}</select></div>
                </div>
              ) : (
                <div><label className="block text-sm font-medium text-gray-700 mb-1">Day of Month</label><input type="number" min="1" max="31" value={monthlyDate} onChange={e => setMonthlyDate(+e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500" /></div>
              )}
            </div>
          )}
          {scheduleType === 'seasonal' && (
            <div className="space-y-2">
              <div className="grid grid-cols-2 gap-4">
                <div><label className="block text-sm font-medium text-gray-700 mb-1">Month</label><select value={seasonalMonth} onChange={e => setSeasonalMonth(+e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500">{monthNames.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}</select></div>
                <div><label className="block text-sm font-medium text-gray-700 mb-1">Cadence</label><select value={seasonalInterval} onChange={e => setSeasonalInterval(+e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"><option value={3}>Quarterly</option><option value={6}>Semi-annual</option><option value={12}>Annual</option></select></div>
              </div>
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Mode</label><select value={seasonalMode} onChange={e => setSeasonalMode(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"><option value="nth_weekday">Nth weekday</option><option value="date">Date of month</option></select></div>
              {seasonalMode === 'nth_weekday' ? (
                <div className="grid grid-cols-2 gap-4">
                  <div><label className="block text-sm font-medium text-gray-700 mb-1">Week</label><select value={seasonalWeek} onChange={e => setSeasonalWeek(+e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500">{[1, 2, 3, 4].map(w => <option key={w} value={w}>Week {w}</option>)}</select></div>
                  <div><label className="block text-sm font-medium text-gray-700 mb-1">Day</label><select value={seasonalDay} onChange={e => setSeasonalDay(+e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500">{dayNamesFull.map((d, i) => <option key={i} value={i}>{d}</option>)}</select></div>
                </div>
              ) : (
                <div><label className="block text-sm font-medium text-gray-700 mb-1">Day of Month</label><input type="number" min="1" max="31" value={seasonalDate} onChange={e => setSeasonalDate(+e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500" /></div>
              )}
            </div>
          )}
          {scheduleType === 'one_time' && (
            <div><label className="block text-sm font-medium text-gray-700 mb-1">Date *</label><input type="date" value={oneTimeDate} onChange={e => setOneTimeDate(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500" />{!oneTimeDate && <p className="text-xs text-red-500 mt-1">Required</p>}</div>
          )}
        </div>
        {isParentChore && (
          <div className="mt-6 border-t pt-4">
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-sm font-semibold text-gray-700">Sub-tasks</h4>
              <button onClick={() => setShowAddSubtask(!showAddSubtask)} className="text-sm text-blue-500 hover:text-blue-600">{showAddSubtask ? 'Cancel' : 'Add Sub-task'}</button>
            </div>
            <div className="space-y-2">
              {subtasks.map(st => (
                <div key={st.id} className="flex items-center justify-between gap-2 p-2 border border-gray-200 rounded-lg">
                  {editingSubtaskId === st.id ? (
                    <div className="flex-1 space-y-2">
                      <div><label className="block text-xs font-medium text-gray-600 mb-1">Name</label><input type="text" value={editSubtaskName} onChange={e => setEditSubtaskName(e.target.value)} className="w-full px-2 py-1 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500" /></div>
                      <div className="grid grid-cols-2 gap-2">
                        <div><label className="block text-xs font-medium text-gray-600 mb-1">Time</label><select value={editSubtaskTime} onChange={e => setEditSubtaskTime(e.target.value)} className="w-full px-2 py-1 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"><option value="AM">AM</option><option value="PM">PM</option></select></div>
                        <div><label className="block text-xs font-medium text-gray-600 mb-1">Minutes</label><input type="number" value={editSubtaskMinutes} onChange={e => setEditSubtaskMinutes(e.target.value)} className="w-full px-2 py-1 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500" /></div>
                      </div>
                      <div className="flex gap-2">
                        <button onClick={() => handleUpdateSubtask(st.id)} className="px-3 py-1 text-xs bg-blue-500 text-white rounded-lg hover:bg-blue-600">Save</button>
                        <button onClick={cancelEditSubtask} className="px-3 py-1 text-xs border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50">Cancel</button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="min-w-0">
                        <div className="text-sm text-gray-800 truncate">{st.name}</div>
                        <div className="text-xs text-gray-500">{st.time} - {st.minutes}m</div>
                      </div>
                      <div className="flex items-center gap-1">
                        <button onClick={() => startEditSubtask(st)} className="p-1 text-gray-400 hover:text-blue-500"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 4h2a2 2 0 012 2v2m-6 12h10a2 2 0 002-2V9a2 2 0 00-.586-1.414l-3-3A2 2 0 0016 4H9a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg></button>
                        <button onClick={() => handleDeleteSubtask(st.id)} className="p-1 text-gray-400 hover:text-red-500"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg></button>
                      </div>
                    </>
                  )}
                </div>
              ))}
              {!subtasks.length && <div className="text-xs text-gray-400 italic">No sub-tasks yet</div>}
            </div>
            {showAddSubtask && (
              <div className="mt-4 space-y-3">
                <div><label className="block text-xs font-medium text-gray-600 mb-1">Name</label><input type="text" value={newSubtaskName} onChange={e => setNewSubtaskName(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500" /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div><label className="block text-xs font-medium text-gray-600 mb-1">Time</label><select value={newSubtaskTime} onChange={e => setNewSubtaskTime(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"><option value="AM">AM</option><option value="PM">PM</option></select></div>
                  <div><label className="block text-xs font-medium text-gray-600 mb-1">Minutes</label><input type="number" value={newSubtaskMinutes} onChange={e => setNewSubtaskMinutes(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500" /></div>
                </div>
                <button onClick={handleAddSubtask} className="w-full px-3 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600">Add Sub-task</button>
              </div>
            )}
          </div>
        )}
        {!isParentChore && (
          <div className="mt-6 border-t pt-4">
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-sm font-semibold text-gray-700">Sub-tasks (optional)</h4>
              <button onClick={enableSubtasks} className="text-sm text-blue-500 hover:text-blue-600">Enable Sub-tasks</button>
            </div>
            <div className="text-xs text-gray-500">
              Use sub-tasks when you want separate AM/PM time and minutes per step. This will hide the parent’s Time/Minutes and schedule sub-tasks instead.
            </div>
          </div>
        )}
        <div className="flex gap-3 mt-6">
          <button onClick={onClose} className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50">Cancel</button>
          <button onClick={handleSave} disabled={!valid} className="flex-1 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50">Save</button>
        </div>
      </div>
    </div>
  );
});

const AddModal = memo(({ defaultFrequency, rooms, onClose, onAdd }) => {
  const today = new Date();
  const [name, setName] = useState('');
  const [time, setTime] = useState('AM');
  const [minutes, setMinutes] = useState(10);
  const [scheduleType, setScheduleType] = useState(defaultFrequency);
  const [isActive, setIsActive] = useState(true);
  const [roomIds, setRoomIds] = useState([]);

  const [weeklyDays, setWeeklyDays] = useState([today.getDay()]);
  const [weeklyInterval, setWeeklyInterval] = useState(1);
  const [weeklyParity, setWeeklyParity] = useState(getSundayWeekNumber(today) % 2);

  const [monthlyMode, setMonthlyMode] = useState('nth_weekday');
  const [monthlyInterval, setMonthlyInterval] = useState(1);
  const [monthlyWeek, setMonthlyWeek] = useState(1);
  const [monthlyDay, setMonthlyDay] = useState(6);
  const [monthlyDate, setMonthlyDate] = useState(1);

  const [seasonalMonth, setSeasonalMonth] = useState(today.getMonth() + 1);
  const [seasonalInterval, setSeasonalInterval] = useState(3);
  const [seasonalMode, setSeasonalMode] = useState('nth_weekday');
  const [seasonalWeek, setSeasonalWeek] = useState(1);
  const [seasonalDay, setSeasonalDay] = useState(6);
  const [seasonalDate, setSeasonalDate] = useState(1);

  const [oneTimeDate, setOneTimeDate] = useState('');

  const toggleWeeklyDay = (d) => {
    setWeeklyDays(prev => prev.includes(d) ? prev.filter(x => x !== d) : [...prev, d].sort((a, b) => a - b));
  };

  const toggleRoom = (roomId) => {
    setRoomIds(prev => prev.includes(roomId) ? prev.filter(id => id !== roomId) : [...prev, roomId]);
  };

  const buildSchedule = () => {
    if (scheduleType === 'daily') return {};
    if (scheduleType === 'one_time') return { date: oneTimeDate };
    if (scheduleType === 'weekly') {
      const schedule = { days_of_week: weeklyDays, interval: weeklyInterval };
      if (weeklyInterval > 1) schedule.week_parity = weeklyParity;
      return schedule;
    }
    if (scheduleType === 'monthly') {
      const schedule = { mode: monthlyMode, interval: monthlyInterval };
      if (monthlyMode === 'date') schedule.day_of_month = monthlyDate;
      else { schedule.week_of_month = monthlyWeek; schedule.day_of_week = monthlyDay; }
      if (monthlyInterval > 1) schedule.month_parity = (today.getMonth() + 1) % 2;
      return schedule;
    }
    if (scheduleType === 'seasonal') {
      const schedule = { month: seasonalMonth, interval_months: seasonalInterval, mode: seasonalMode };
      if (seasonalMode === 'date') schedule.day_of_month = seasonalDate;
      else { schedule.week_of_month = seasonalWeek; schedule.day_of_week = seasonalDay; }
      return schedule;
    }
    return {};
  };

  const valid = name.trim()
    && (scheduleType !== 'weekly' || weeklyDays.length > 0)
    && (scheduleType !== 'monthly' || (monthlyMode === 'date' ? monthlyDate : (monthlyWeek && monthlyDay !== null)))
    && (scheduleType !== 'seasonal' || (seasonalMode === 'date' ? seasonalDate : (seasonalWeek && seasonalDay !== null)))
    && (scheduleType !== 'one_time' || oneTimeDate);

  const handleAdd = () => {
    if (!valid) return;
    onAdd({ name: name.trim(), time, minutes: parseInt(minutes) || 5, scheduleType, schedule: buildSchedule(), isActive, roomIds }, scheduleType);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6 max-h-[90vh] overflow-y-auto">
        <h3 className="text-lg font-semibold text-gray-800 mb-4">Add Chore</h3>
        <div className="space-y-4">
          <div><label className="block text-sm font-medium text-gray-700 mb-1">Name</label><input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="Chore name" className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500" /></div>
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium text-gray-700">Active</label>
            <label className="inline-flex items-center gap-2 text-sm text-gray-600">
              <input type="checkbox" checked={isActive} onChange={e => setIsActive(e.target.checked)} />
              {isActive ? 'Active' : 'Inactive'}
            </label>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Rooms</label>
            {!rooms?.length && <div className="text-xs text-gray-500">No rooms yet. Add rooms in Manage.</div>}
            {!!rooms?.length && (
              <div className="grid grid-cols-2 gap-2">
                {rooms.map(r => (
                  <label key={r.id} className="flex items-center gap-2 text-sm text-gray-700">
                    <input type="checkbox" checked={roomIds.includes(r.id)} onChange={() => toggleRoom(r.id)} />
                    {r.name}
                  </label>
                ))}
              </div>
            )}
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div><label className="block text-sm font-medium text-gray-700 mb-1">Time</label><select value={time} onChange={e => setTime(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"><option value="AM">AM</option><option value="PM">PM</option></select></div>
            <div><label className="block text-sm font-medium text-gray-700 mb-1">Minutes</label><input type="number" value={minutes} onChange={e => setMinutes(e.target.value)} min="1" className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500" /></div>
          </div>
          <div><label className="block text-sm font-medium text-gray-700 mb-1">Schedule Type</label><select value={scheduleType} onChange={e => setScheduleType(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"><option value="daily">Daily</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option><option value="seasonal">Seasonal</option><option value="one_time">One-Time</option></select></div>
          {scheduleType === 'weekly' && (
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700">Days of Week</label>
              <div className="grid grid-cols-2 gap-2">
                {dayNamesFull.map((d, i) => (
                  <label key={i} className="flex items-center gap-2 text-sm text-gray-700">
                    <input type="checkbox" checked={weeklyDays.includes(i)} onChange={() => toggleWeeklyDay(i)} />
                    {d}
                  </label>
                ))}
              </div>
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Interval</label><select value={weeklyInterval} onChange={e => setWeeklyInterval(+e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"><option value={1}>Every week</option><option value={2}>Every other week</option></select></div>
              {weeklyInterval > 1 && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Start Week</label>
                  <select value={weeklyParity} onChange={e => setWeeklyParity(+e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500">
                    <option value={0}>Even</option>
                    <option value={1}>Odd</option>
                  </select>
                  <div className="text-xs text-gray-500 mt-1">Current week: {getSundayWeekNumber(today) % 2 === 0 ? 'Even' : 'Odd'}</div>
                </div>
              )}
            </div>
          )}
          {scheduleType === 'monthly' && (
            <div className="space-y-2">
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Interval</label><select value={monthlyInterval} onChange={e => setMonthlyInterval(+e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"><option value={1}>Every month</option><option value={2}>Every other month</option></select></div>
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Mode</label><select value={monthlyMode} onChange={e => setMonthlyMode(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"><option value="nth_weekday">Nth weekday</option><option value="date">Date of month</option></select></div>
              {monthlyMode === 'nth_weekday' ? (
                <div className="grid grid-cols-2 gap-4">
                  <div><label className="block text-sm font-medium text-gray-700 mb-1">Week</label><select value={monthlyWeek} onChange={e => setMonthlyWeek(+e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500">{[1, 2, 3, 4].map(w => <option key={w} value={w}>Week {w}</option>)}</select></div>
                  <div><label className="block text-sm font-medium text-gray-700 mb-1">Day</label><select value={monthlyDay} onChange={e => setMonthlyDay(+e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500">{dayNamesFull.map((d, i) => <option key={i} value={i}>{d}</option>)}</select></div>
                </div>
              ) : (
                <div><label className="block text-sm font-medium text-gray-700 mb-1">Day of Month</label><input type="number" min="1" max="31" value={monthlyDate} onChange={e => setMonthlyDate(+e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500" /></div>
              )}
            </div>
          )}
          {scheduleType === 'seasonal' && (
            <div className="space-y-2">
              <div className="grid grid-cols-2 gap-4">
                <div><label className="block text-sm font-medium text-gray-700 mb-1">Month</label><select value={seasonalMonth} onChange={e => setSeasonalMonth(+e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500">{monthNames.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}</select></div>
                <div><label className="block text-sm font-medium text-gray-700 mb-1">Cadence</label><select value={seasonalInterval} onChange={e => setSeasonalInterval(+e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"><option value={3}>Quarterly</option><option value={6}>Semi-annual</option><option value={12}>Annual</option></select></div>
              </div>
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Mode</label><select value={seasonalMode} onChange={e => setSeasonalMode(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"><option value="nth_weekday">Nth weekday</option><option value="date">Date of month</option></select></div>
              {seasonalMode === 'nth_weekday' ? (
                <div className="grid grid-cols-2 gap-4">
                  <div><label className="block text-sm font-medium text-gray-700 mb-1">Week</label><select value={seasonalWeek} onChange={e => setSeasonalWeek(+e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500">{[1, 2, 3, 4].map(w => <option key={w} value={w}>Week {w}</option>)}</select></div>
                  <div><label className="block text-sm font-medium text-gray-700 mb-1">Day</label><select value={seasonalDay} onChange={e => setSeasonalDay(+e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500">{dayNamesFull.map((d, i) => <option key={i} value={i}>{d}</option>)}</select></div>
                </div>
              ) : (
                <div><label className="block text-sm font-medium text-gray-700 mb-1">Day of Month</label><input type="number" min="1" max="31" value={seasonalDate} onChange={e => setSeasonalDate(+e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500" /></div>
              )}
            </div>
          )}
          {scheduleType === 'one_time' && (
            <div><label className="block text-sm font-medium text-gray-700 mb-1">Date *</label><input type="date" value={oneTimeDate} onChange={e => setOneTimeDate(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500" />{!oneTimeDate && <p className="text-xs text-red-500 mt-1">Required</p>}</div>
          )}
        </div>
        <div className="flex gap-3 mt-6"><button onClick={onClose} className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50">Cancel</button><button onClick={handleAdd} disabled={!valid} className="flex-1 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50">Add</button></div>
      </div>
    </div>
  );
});


// Main component
export default function ChoreDashboard() {
  const [chores, dispatch] = useReducer(choreReducer, null, createInitialChores);
  const [rooms, setRooms] = useState([]);
  const [completedTasks, setCompletedTasks] = useState({});
  const [isLoading, setIsLoading] = useState(true);
  const [saveStatus, setSaveStatus] = useState('saved');
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [viewMode, setViewMode] = useState('time');
  const [calendarView, setCalendarView] = useState('summary'); // 'summary' | 'bychore'
  const [treemapOrientation, setTreemapOrientation] = useState('horizontal'); // 'horizontal' | 'vertical'
  const [activeTab, setActiveTab] = useState('calendar');
  const [searchQuery, setSearchQuery] = useState('');
  const [hoveredDate, setHoveredDate] = useState(null);
  const [frequencyFilter, setFrequencyFilter] = useState('all');
  const [timeOfDayFilter, setTimeOfDayFilter] = useState('all');
  const [visibleFrequencies, setVisibleFrequencies] = useState({
    daily: true, weekly: true, monthly: true, seasonal: true, one_time: true
  });
  const [sortBy, setSortBy] = useState('name');
  const [sortDirection, setSortDirection] = useState('asc');
  const [editingChore, setEditingChore] = useState(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [addToFrequency, setAddToFrequency] = useState('daily');
  const [dailyOrder, setDailyOrder] = useState({});
  const [calendarChoresByDate, setCalendarChoresByDate] = useState({});
  const [orderMode, setOrderMode] = useState(false);
  const [globalOrderIds, setGlobalOrderIds] = useState([]);
  const [draggedOrderId, setDraggedOrderId] = useState(null);
  const [activeDayId, setActiveDayId] = useState(null);
  const [activeDayBucket, setActiveDayBucket] = useState(null);
  const [newRoomName, setNewRoomName] = useState('');
  const [editingRoomId, setEditingRoomId] = useState(null);
  const [editingRoomName, setEditingRoomName] = useState('');
  const {
    toasts,
    dismissToast,
    showError,
    confirmDialog,
    confirmPending,
    requestConfirm,
    cancelConfirm,
    acceptConfirm,
  } = useFeedback();

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

    const roomMap = useMemo(() => (
      rooms.reduce((acc, r) => { acc[r.id] = r.name; return acc; }, {})
    ), [rooms]);

    // Load chores from API on mount
    useEffect(() => {
      const loadData = async () => {
        try {
          const [choresData, roomsData] = await Promise.all([
            api.fetchChoresWithSubtasks(),
            api.fetchRooms()
          ]);
          const grouped = groupChoresByFrequency(choresData);
          dispatch({ type: 'LOAD_DATA', payload: grouped });
          setRooms(roomsData || []);
        } catch (e) {
          console.warn('Failed to load chores from API:', e);
          // Keep defaults on error
        }
        setIsLoading(false);
      };
      loadData();
    }, []);


  // Load completions for current month
  useEffect(() => {
    const loadCompletions = async () => {
      const start = getDateString(new Date(year, month, 1));
      const end = getDateString(new Date(year, month + 1, 0));
      try {
        const completionsData = await api.fetchCompletionsRange(start, end);
        // Convert API format { "2026-02-04": ["id1", "id2"] } to frontend format { "2026-1-4": { id1: true, id2: true } }
        const converted = {};
        Object.entries(completionsData).forEach(([dateStr, ids]) => {
          const d = new Date(dateStr + 'T00:00:00');
          const dk = getDateKey(d);
          converted[dk] = {};
          ids.forEach(id => { converted[dk][id] = true; });
        });
        setCompletedTasks(prev => ({ ...prev, ...converted }));
      } catch (e) {
        console.warn('Failed to load completions from API:', e);
      }
    };
    if (!isLoading) loadCompletions();
  }, [year, month, isLoading]);


  useEffect(() => {
    const loadDailyOrder = async () => {
      const dateStr = getDateString(selectedDate);
      const dk = getDateKey(selectedDate);
      try {
        const daily = await api.fetchDailyOrder(dateStr);
        setDailyOrder(prev => ({ ...prev, [dk]: daily.order || [] }));
      } catch (e) {
        console.warn('Failed to load daily order:', e);
      }
    };
    if (!isLoading) loadDailyOrder();
  }, [selectedDate, isLoading]);

  useEffect(() => {
    const loadCalendarChores = async () => {
      const start = getDateString(new Date(year, month, 1));
      const end = getDateString(new Date(year, month + 1, 0));
      try {
        const data = await api.fetchChoresForRange(start, end);
        const mapped = {};
        Object.entries(data.chores_by_date || {}).forEach(([dateStr, choresForDate]) => {
          mapped[dateStr] = (choresForDate || []).map((apiChore) => {
            const chore = apiToFrontend(apiChore);
            const category = apiChore.schedule_type || chore.scheduleType;
            return { ...chore, category };
          });
        });
        setCalendarChoresByDate(mapped);
      } catch (e) {
        console.warn('Failed to load chores for calendar range:', e);
        setCalendarChoresByDate({});
      }
    };
    if (!isLoading) loadCalendarChores();
  }, [year, month, chores, isLoading]);

  const expandLeafChores = useCallback((list) => (
    list.flatMap(chore => {
      if (chore.isActive === false) return [];
      if (chore.subtasks && chore.subtasks.length) {
        return chore.subtasks
          .filter(st => st.isActive !== false)
          .map(st => ({
            ...st,
            scheduleType: chore.scheduleType,
            schedule: chore.schedule,
            parentId: chore.id,
            parentName: chore.name
          }));
      }
      return [{ ...chore }];
    })
  ), []);

  const {
    calendarDays,
    dynamicThresholds,
    selectedDateInfo,
    getDateData,
    getCompletedData,
    getHeatColor,
    isTaskCompleted,
  } = useCalendarDerivedData({
    year,
    month,
    selectedDate,
    calendarChoresByDate,
    visibleFrequencies,
    dailyOrder,
    completedTasks,
    viewMode,
  });

  // Filtered chores for Manage tab (MEMOIZED - was running every render before)
  const filteredChores = useMemo(() => {
    const filterAndSort = (list) => {
      let f = list;
      if (searchQuery.trim()) f = f.filter(c => c.name.toLowerCase().includes(searchQuery.toLowerCase()));
      if (timeOfDayFilter !== 'all') f = f.filter(c => c.time === timeOfDayFilter);
      return [...f].sort((a, b) => {
        let cmp = 0;
        if (sortBy === 'name') cmp = a.name.localeCompare(b.name);
        else if (sortBy === 'time') cmp = a.minutes - b.minutes;
        else if (sortBy === 'ampm') cmp = a.time.localeCompare(b.time);
        return sortDirection === 'asc' ? cmp : -cmp;
      });
    };
    const shouldShow = (freq) => frequencyFilter === 'all' || frequencyFilter === freq;
    return {
      daily: shouldShow('daily') ? filterAndSort(chores.daily) : [],
      weekly: shouldShow('weekly') ? filterAndSort(chores.weekly) : [],
      monthly: shouldShow('monthly') ? filterAndSort(chores.monthly) : [],
      seasonal: shouldShow('seasonal') ? filterAndSort(chores.seasonal) : [],
      one_time: shouldShow('one_time') ? filterAndSort(chores.one_time) : []
    };
  }, [chores, searchQuery, timeOfDayFilter, frequencyFilter, sortBy, sortDirection]);

  const totalFiltered = filteredChores.daily.length + filteredChores.weekly.length + filteredChores.monthly.length + filteredChores.seasonal.length + filteredChores.one_time.length;
  const totalChores = chores.daily.length + chores.weekly.length + chores.monthly.length + chores.seasonal.length + chores.one_time.length;

  const leafChores = useMemo(() => {
    const all = [];
    ALL_FREQUENCIES.forEach(freq => {
      all.push(...expandLeafChores(chores[freq] || []));
    });
    return all;
  }, [chores, expandLeafChores]);

  const leafChoreMap = useMemo(() => {
    const map = {};
    leafChores.forEach(c => { map[c.id] = c; });
    return map;
  }, [leafChores]);

  const defaultGlobalOrderIds = useMemo(() => (
    [...leafChores]
      .sort((a, b) => {
        const ga = a.globalOrder ?? 0;
        const gb = b.globalOrder ?? 0;
        if (ga !== gb) return ga - gb;
        return a.name.localeCompare(b.name);
      })
      .map(c => c.id)
  ), [leafChores]);

  useEffect(() => {
    if (orderMode) {
      setGlobalOrderIds(defaultGlobalOrderIds);
    }
  }, [orderMode, defaultGlobalOrderIds]);


  const toggleTask = useCallback(async (choreId) => {
    const dk = getDateKey(selectedDate);
    const dateStr = getDateString(selectedDate);
    // Optimistically update UI
    setCompletedTasks(p => ({ ...p, [dk]: { ...p[dk], [choreId]: !p[dk]?.[choreId] } }));
    // Persist to API
    try {
      await api.toggleCompletion(choreId, dateStr);
    } catch (e) {
      console.warn('Failed to toggle completion:', e);
      // Revert on error
      setCompletedTasks(p => ({ ...p, [dk]: { ...p[dk], [choreId]: !p[dk]?.[choreId] } }));
    }
  }, [selectedDate]);
  const activeDayChore = useMemo(() => {
    if (!activeDayId) return null;
    const all = [...selectedDateInfo.am.chores, ...selectedDateInfo.pm.chores];
    return all.find(c => c.id === activeDayId) || null;
  }, [activeDayId, selectedDateInfo]);

  const refreshChores = useCallback(async () => {
    const choresData = await api.fetchChoresWithSubtasks();
    const grouped = groupChoresByFrequency(choresData);
    dispatch({ type: 'LOAD_DATA', payload: grouped });
  }, []);

  const refreshRooms = useCallback(async () => {
    const roomsData = await api.fetchRooms();
    setRooms(roomsData || []);
  }, []);

  const handleAddRoom = useCallback(async () => {
    const name = newRoomName.trim();
    if (!name) return;
    try {
      const created = await api.createRoom({ name });
      setRooms(prev => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)));
      setNewRoomName('');
    } catch (e) {
      console.warn('Failed to create room:', e);
      showError('Failed to create room');
    }
  }, [newRoomName, showError]);

  const handleDeleteRoom = useCallback((roomId) => {
    requestConfirm(
      'Delete this room? It will be removed from all chores.',
      async () => {
        try {
          await api.deleteRoom(roomId);
          await refreshRooms();
          await refreshChores();
        } catch (e) {
          console.warn('Failed to delete room:', e);
          showError('Failed to delete room');
        }
      },
      { confirmLabel: 'Delete', tone: 'danger' }
    );
  }, [refreshRooms, refreshChores, requestConfirm, showError]);

  const handleStartEditRoom = useCallback((room) => {
    setEditingRoomId(room.id);
    setEditingRoomName(room.name);
  }, []);

  const handleCancelEditRoom = useCallback(() => {
    setEditingRoomId(null);
    setEditingRoomName('');
  }, []);

  const handleSaveRoom = useCallback(async () => {
    const name = editingRoomName.trim();
    if (!editingRoomId || !name) return;
    try {
      await api.updateRoom(editingRoomId, { name });
      await refreshRooms();
      handleCancelEditRoom();
    } catch (e) {
      console.warn('Failed to update room:', e);
      showError('Failed to update room');
    }
  }, [editingRoomId, editingRoomName, refreshRooms, handleCancelEditRoom, showError]);

  const saveGlobalOrder = useCallback(async (ids) => {
    setSaveStatus('saving');
    try {
      await api.updateGlobalOrder(ids);
      await refreshChores();
      setSaveStatus('saved');
    } catch (e) {
      console.warn('Failed to update global order:', e);
      setSaveStatus('error');
    }
  }, [refreshChores]);

  const saveDailyOrder = useCallback(async (date, ids) => {
    const dateStr = getDateString(date);
    const dk = getDateKey(date);
    const previous = dailyOrder[dk] || [];
    setDailyOrder(prev => ({ ...prev, [dk]: ids }));
    try {
      await api.setDailyOrder(dateStr, ids);
    } catch (e) {
      console.warn('Failed to update daily order:', e);
      setDailyOrder(prev => ({ ...prev, [dk]: previous }));
    }
  }, [dailyOrder]);

  const addChore = useCallback(async (chore, scheduleType) => {
    setSaveStatus('saving');
    try {
      const apiChore = frontendToApi({ ...chore, scheduleType });
      const created = await api.createChore(apiChore);
      const frontendChore = apiToFrontend(created);
      dispatch({ type: 'ADD_CHORE', payload: { chore: frontendChore, scheduleType } });
      setSaveStatus('saved');
    } catch (e) {
      console.warn('Failed to create chore:', e);
      setSaveStatus('error');
    }
  }, []);

  const updateChore = useCallback(async (chore, oldType, newType) => {
    setSaveStatus('saving');
    try {
      const apiChore = frontendToApi({ ...chore, scheduleType: newType });
      await api.updateChore(chore.id, apiChore);

      // Save succeeded - try to refresh data to get updated sub-task structure
      try {
        await refreshChores();
      } catch (refreshError) {
        console.warn('Data refresh failed, but save succeeded:', refreshError);
        // Fallback: manually update the local state
        dispatch({ type: 'UPDATE_CHORE', payload: { chore: { ...chore, scheduleType: newType }, oldScheduleType: oldType, newScheduleType: newType } });
      }
      setSaveStatus('saved');
    } catch (e) {
      console.warn('Failed to update chore:', e);
      setSaveStatus('error');
    }
  }, []);



  const deleteChore = useCallback(async (id, scheduleType) => {
    setSaveStatus('saving');
    try {
      await api.deleteChore(id);
      dispatch({ type: 'DELETE_CHORE', payload: { id, scheduleType } });
      setSaveStatus('saved');
    } catch (e) {
      console.warn('Failed to delete chore:', e);
      setSaveStatus('error');
    }
  }, []);

  // Sub-task handlers for EditModal
  const addSubtask = useCallback(async (parentId, subtask) => {
    try {
      const apiSubtask = frontendToApi(subtask);
      const created = await api.createChore(apiSubtask);
      try {
        await refreshChores();
      } catch (refreshError) {
        console.warn('Failed to refresh chores after adding subtask:', refreshError);
      }
      return apiToFrontend(created);
    } catch (e) {
      console.warn('Failed to create subtask:', e);
      throw e;
    }
  }, [refreshChores]);

  const deleteSubtask = useCallback(async (subtaskId) => {
    try {
      await api.deleteChore(subtaskId);
      try {
        await refreshChores();
      } catch (refreshError) {
        console.warn('Failed to refresh chores after deleting subtask:', refreshError);
      }
    } catch (e) {
      console.warn('Failed to delete subtask:', e);
      throw e;
    }
  }, [refreshChores]);

  const updateSubtask = useCallback(async (subtaskId, subtask) => {
    try {
      const apiSubtask = frontendToApi(subtask);
      const updated = await api.updateChore(subtaskId, apiSubtask);
      try {
        await refreshChores();
      } catch (refreshError) {
        console.warn('Failed to refresh chores after updating subtask:', refreshError);
      }
      return apiToFrontend(updated);
    } catch (e) {
      console.warn('Failed to update subtask:', e);
      throw e;
    }
  }, [refreshChores]);

  const toggleFrequencyVisibility = useCallback((freq) => {
    setVisibleFrequencies(prev => ({ ...prev, [freq]: !prev[freq] }));
  }, []);

  // Reset removed for now to avoid confusion

  const handleGlobalDragStart = useCallback((id, e) => {
    if (e?.dataTransfer) {
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', id);
    }
    setDraggedOrderId(id);
  }, []);

  const handleGlobalDrop = useCallback((targetId) => {
    if (!draggedOrderId || draggedOrderId === targetId) return;
    const ids = [...globalOrderIds];
    const from = ids.indexOf(draggedOrderId);
    const to = ids.indexOf(targetId);
    if (from === -1 || to === -1) return;
    ids.splice(from, 1);
    ids.splice(to, 0, draggedOrderId);
    setGlobalOrderIds(ids);
    saveGlobalOrder(ids);
    setDraggedOrderId(null);
  }, [draggedOrderId, globalOrderIds, saveGlobalOrder]);

  const handleGlobalDropEnd = useCallback(() => {
    if (!draggedOrderId) return;
    const ids = [...globalOrderIds.filter(id => id !== draggedOrderId), draggedOrderId];
    setGlobalOrderIds(ids);
    saveGlobalOrder(ids);
    setDraggedOrderId(null);
  }, [draggedOrderId, globalOrderIds, saveGlobalOrder]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } })
  );
  const handleDayDragStart = useCallback((event) => {
    setActiveDayId(event.active?.id ?? null);
    setActiveDayBucket(event.active?.data?.current?.bucket ?? null);
  }, []);

  const handleDayDragCancel = useCallback(() => {
    setActiveDayId(null);
    setActiveDayBucket(null);
  }, []);

  const handleDayDragEnd = useCallback((event) => {
    const { active, over } = event;
    setActiveDayId(null);
    setActiveDayBucket(null);
    if (!active || !over) return;
    const activeBucket = active.data?.current?.bucket;
    const overBucket = over.data?.current?.bucket;
    if (!activeBucket || activeBucket !== overBucket) return;
    const amIds = selectedDateInfo.am.chores.map(c => c.id);
    const pmIds = selectedDateInfo.pm.chores.map(c => c.id);
    const list = activeBucket === 'AM' ? [...amIds] : [...pmIds];
    const activeIndex = list.indexOf(active.id);
    if (activeIndex === -1) return;
    const overIndex = list.indexOf(over.id);
    if (overIndex === -1 || overIndex === activeIndex) return;
    const nextList = arrayMove(list, activeIndex, overIndex);
    const merged = activeBucket === 'AM' ? [...nextList, ...pmIds] : [...amIds, ...nextList];
    saveDailyOrder(selectedDate, merged);
  }, [selectedDateInfo, saveDailyOrder, selectedDate]);


  const handleEditFromCalendar = useCallback((chore) => {
    if (chore.parentId) {
      const parent = Object.values(chores).flat().find(c => c.id === chore.parentId);
      if (parent) {
        setEditingChore(parent);
        setActiveTab('manage');
        return;
      }
    }
    setEditingChore({ ...chore, scheduleType: chore.category });
    setActiveTab('manage');
  }, [chores]);
  const openAddModal = useCallback((frequency) => { setAddToFrequency(frequency); setShowAddModal(true); }, []);

  const navMonth = (d) => setCurrentDate(new Date(year, month + d, 1));
  const isToday = (d) => d && new Date().toDateString() === d.toDateString();
  const isSelected = (d) => d && selectedDate.toDateString() === d.toDateString();

  const legendLabels = viewMode === 'count'
    ? { light: `<=${Math.round(dynamicThresholds.count.light)}`, medium: `<=${Math.round(dynamicThresholds.count.medium)}`, heavy: `<=${Math.round(dynamicThresholds.count.heavy)}` }
    : { light: `<=${formatTime(Math.round(dynamicThresholds.time.light))}`, medium: `<=${formatTime(Math.round(dynamicThresholds.time.medium))}`, heavy: `<=${formatTime(Math.round(dynamicThresholds.time.heavy))}` };

  if (isLoading) return <div className="min-h-screen bg-gray-50 flex items-center justify-center"><div className="text-center"><div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" /><p className="text-gray-600">Loading...</p></div></div>;

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-6xl mx-auto">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-6">
          <div><h1 className="text-3xl font-bold text-gray-800 mb-2">Chore Dashboard</h1><p className="text-gray-600">{activeTab === 'calendar' ? 'Click any day to see tasks' : 'Manage your chores'}</p></div>
          <div className="mt-4 sm:mt-0 flex items-center gap-2">
            <div className="flex items-center bg-white rounded-lg p-1 shadow-sm">
              <button onClick={() => setActiveTab('calendar')} className={`px-3 py-1.5 rounded-md text-sm font-medium flex items-center gap-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500 ${activeTab === 'calendar' ? 'bg-blue-500 text-white' : 'text-gray-500 hover:text-gray-700'}`}><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>Calendar</button>
              <button onClick={() => setActiveTab('manage')} className={`px-3 py-1.5 rounded-md text-sm font-medium flex items-center gap-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500 ${activeTab === 'manage' ? 'bg-blue-500 text-white' : 'text-gray-500 hover:text-gray-700'}`}><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>Manage</button>
            </div>
            {activeTab === 'calendar' && <>
              <div className="flex items-center bg-white rounded-lg p-1 shadow-sm">
                <button onClick={() => setCalendarView('summary')} className={`px-3 py-1.5 rounded-md text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500 ${calendarView === 'summary' ? 'bg-blue-500 text-white' : 'text-gray-500 hover:text-gray-700'}`}>Summary</button>
                <button onClick={() => setCalendarView('bychore')} className={`px-3 py-1.5 rounded-md text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500 ${calendarView === 'bychore' ? 'bg-blue-500 text-white' : 'text-gray-500 hover:text-gray-700'}`}>By Chore</button>
              </div>
              <div className="flex items-center bg-white rounded-lg p-1 shadow-sm">
                <button onClick={() => setViewMode('time')} className={`px-3 py-1.5 rounded-md text-sm font-medium flex items-center gap-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500 ${viewMode === 'time' ? 'bg-blue-500 text-white' : 'text-gray-500 hover:text-gray-700'}`}><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>Time</button>
                <button onClick={() => setViewMode('count')} className={`px-3 py-1.5 rounded-md text-sm font-medium flex items-center gap-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500 ${viewMode === 'count' ? 'bg-blue-500 text-white' : 'text-gray-500 hover:text-gray-700'}`}><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" /></svg>Count</button>
              </div>
              {calendarView === 'bychore' && (
                <div className="flex items-center bg-white rounded-lg p-1 shadow-sm">
                  <button onClick={() => setTreemapOrientation('horizontal')} className={`px-3 py-1.5 rounded-md text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500 ${treemapOrientation === 'horizontal' ? 'bg-blue-500 text-white' : 'text-gray-500 hover:text-gray-700'}`} title="Horizontal bars - compare same day across weeks">Horiz</button>
                  <button onClick={() => setTreemapOrientation('vertical')} className={`px-3 py-1.5 rounded-md text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500 ${treemapOrientation === 'vertical' ? 'bg-blue-500 text-white' : 'text-gray-500 hover:text-gray-700'}`} title="Vertical bars - compare days within a week">Vert</button>
                </div>
              )}
            </>}
          </div>
        </div>

        {activeTab === 'calendar' && <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 bg-white rounded-xl shadow-sm p-6">
            <FrequencyFilterBar visibleFrequencies={visibleFrequencies} onToggle={toggleFrequencyVisibility} />
            <div className="flex items-center justify-between mb-6">
              <button onClick={() => navMonth(-1)} className="p-2 hover:bg-gray-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg></button>
              <h2 className="text-xl font-semibold text-gray-800">{monthNames[month]} {year}</h2>
              <button onClick={() => navMonth(1)} className="p-2 hover:bg-gray-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg></button>
            </div>
            <div className="grid grid-cols-7 gap-2 mb-2">{dayNames.map(d => <div key={d} className="text-center text-sm font-medium text-gray-500 py-2">{d}</div>)}</div>
            <div className="grid grid-cols-7 gap-2">{calendarDays.map((date, i) => {
              if (!date) return <div key={i} className="aspect-square" />;
              const dd = getDateData(date), cd = getCompletedData(date);
              return (
                <div key={i} className="aspect-square relative">
                  <button onClick={() => setSelectedDate(date)} onMouseEnter={() => setHoveredDate(date)} onMouseLeave={() => setHoveredDate(null)} className={`w-full h-full rounded-lg overflow-hidden transition-all focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${isSelected(date) ? 'ring-2 ring-blue-500 ring-offset-2' : ''} ${isToday(date) ? 'font-bold' : ''} hover:scale-105 hover:shadow-md ${calendarView === 'summary' ? getHeatColor(date) : ''}`}>
                    {calendarView === 'summary' ? (
                      <div className="w-full h-full flex flex-col items-center justify-center">
                        <span className="text-lg">{date.getDate()}</span>
                        <span className="text-xs opacity-75">{viewMode === 'time' ? formatTime(dd.totalMinutes) : `${cd.count}/${dd.count}`}</span>
                        {cd.count === dd.count && dd.count > 0 && <span className="absolute top-1 right-1 text-xs">OK</span>}
                      </div>
                    ) : (
                      <div className="w-full h-full relative">
                        {treemapOrientation === 'horizontal'
                          ? <HorizontalTreemap breakdown={dd.breakdown} viewMode={viewMode} />
                          : <VerticalTreemap breakdown={dd.breakdown} viewMode={viewMode} />
                        }
                        <span className="absolute top-1 left-1 text-xs font-medium text-gray-700 bg-white/80 rounded px-1 leading-tight">{date.getDate()}</span>
                        {cd.count === dd.count && dd.count > 0 && <span className="absolute top-1 right-1 text-xs bg-white/80 rounded px-0.5">OK</span>}
                      </div>
                    )}
                  </button>
                  {hoveredDate?.getTime() === date.getTime() && <CalendarTooltip date={date} breakdown={dd.breakdown} viewMode={viewMode} />}
                </div>
              );
            })}</div>
            <div className="flex items-center justify-center gap-3 mt-6 pt-4 border-t flex-wrap">
              {calendarView === 'summary' ? (<>
                <span className="text-sm text-gray-500">Status:</span>
                <div className="flex items-center gap-1"><div className="w-6 h-6 rounded bg-emerald-300" /><span className="text-xs text-gray-500">Done</span></div>
                <div className="flex items-center gap-1" title={legendLabels.light}><div className="w-6 h-6 rounded bg-emerald-100" /><span className="text-xs text-gray-500">Light</span></div>
                <div className="flex items-center gap-1" title={legendLabels.medium}><div className="w-6 h-6 rounded bg-amber-100" /><span className="text-xs text-gray-500">Medium</span></div>
                <div className="flex items-center gap-1" title={legendLabels.heavy}><div className="w-6 h-6 rounded bg-orange-200" /><span className="text-xs text-gray-500">Heavy</span></div>
                <div className="flex items-center gap-1"><div className="w-6 h-6 rounded bg-red-200" /><span className="text-xs text-gray-500">Peak</span></div>
              </>) : (<>
                <span className="text-sm text-gray-500">Categories:</span>
                {ALL_FREQUENCIES.map(freq => (
                  <div key={freq} className="flex items-center gap-1">
                    <div className="w-4 h-4 rounded" style={{ backgroundColor: getCategoryColorHex(freq) }} />
                    <span className="text-xs text-gray-600">{getCategoryLabel(freq)}</span>
                  </div>
                ))}
              </>)}
            </div>
          </div>
          <div className="bg-white rounded-xl shadow-sm p-6">
            <div className="flex items-center justify-between mb-1">
              <h3 className="text-lg font-semibold text-gray-800">{selectedDate.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}</h3>
              <button
                onClick={() => {
                  requestConfirm(
                    'Reset this day to the global order?',
                    () => saveDailyOrder(selectedDate, []),
                    { confirmLabel: 'Reset', tone: 'danger' }
                  );
                }}
                className="text-xs text-gray-500 hover:text-gray-700 border border-gray-300 rounded px-2 py-1"
              >
                Reset Order
              </button>
            </div>
            <div className="mb-2"><div className="flex justify-between text-sm text-gray-500 mb-1"><span>{selectedDateInfo.completedData.count} of {selectedDateInfo.dateData.count} complete</span><span>{selectedDateInfo.progressPct}%</span></div><div className="h-2 bg-gray-200 rounded-full overflow-hidden"><div className="h-full bg-emerald-500 transition-all" style={{ width: `${selectedDateInfo.progressPct}%` }} /></div></div>
            <div className="mb-4 p-3 bg-gray-50 rounded-lg"><div className="grid grid-cols-3 gap-2 text-center">{viewMode === 'time' ? <><div><div className="text-lg font-semibold text-gray-800">{formatTime(selectedDateInfo.dateData.totalMinutes)}</div><div className="text-xs text-gray-500">Total</div></div><div><div className="text-lg font-semibold text-emerald-600">{formatTime(selectedDateInfo.completedData.minutes)}</div><div className="text-xs text-gray-500">Done</div></div><div><div className="text-lg font-semibold text-amber-600">{formatTime(selectedDateInfo.dateData.totalMinutes - selectedDateInfo.completedData.minutes)}</div><div className="text-xs text-gray-500">Left</div></div></> : <><div><div className="text-lg font-semibold text-gray-800">{selectedDateInfo.dateData.count}</div><div className="text-xs text-gray-500">Total</div></div><div><div className="text-lg font-semibold text-emerald-600">{selectedDateInfo.completedData.count}</div><div className="text-xs text-gray-500">Done</div></div><div><div className="text-lg font-semibold text-amber-600">{selectedDateInfo.dateData.count - selectedDateInfo.completedData.count}</div><div className="text-xs text-gray-500">Left</div></div></>}</div></div>
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragStart={handleDayDragStart}
              onDragCancel={handleDayDragCancel}
              onDragEnd={handleDayDragEnd}
            >
              <div className="space-y-4 max-h-[420px] overflow-y-auto">
                <div>
                  <h4 className="text-xs font-semibold text-amber-600 uppercase tracking-wide mb-2 flex items-center justify-between"><span className="flex items-center gap-2"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" /></svg>Morning</span><span className="text-gray-400 font-normal">{viewMode === 'time' ? `${formatTime(selectedDateInfo.am.completedMinutes)} / ${formatTime(selectedDateInfo.am.totalMinutes)}` : `${selectedDateInfo.am.completedCount} / ${selectedDateInfo.am.chores.length}`}</span></h4>
                  <SortableContext items={selectedDateInfo.am.chores.map(c => c.id)} strategy={verticalListSortingStrategy}>
                    <ul className="space-y-1">
                      {selectedDateInfo.am.chores.map(c => (
                        <DaySortableItem
                          key={c.id}
                          chore={c}
                          bucket="AM"
                          completed={isTaskCompleted(c.id)}
                          onToggle={toggleTask}
                          onEdit={handleEditFromCalendar}
                        />
                      ))}
                      {!selectedDateInfo.am.chores.length && <li className="text-sm text-gray-400 italic p-2">No morning tasks</li>}
                    </ul>
                  </SortableContext>
                </div>
                <div>
                  <h4 className="text-xs font-semibold text-indigo-600 uppercase tracking-wide mb-2 flex items-center justify-between"><span className="flex items-center gap-2"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" /></svg>Evening</span><span className="text-gray-400 font-normal">{viewMode === 'time' ? `${formatTime(selectedDateInfo.pm.completedMinutes)} / ${formatTime(selectedDateInfo.pm.totalMinutes)}` : `${selectedDateInfo.pm.completedCount} / ${selectedDateInfo.pm.chores.length}`}</span></h4>
                  <SortableContext items={selectedDateInfo.pm.chores.map(c => c.id)} strategy={verticalListSortingStrategy}>
                    <ul className="space-y-1">
                      {selectedDateInfo.pm.chores.map(c => (
                        <DaySortableItem
                          key={c.id}
                          chore={c}
                          bucket="PM"
                          completed={isTaskCompleted(c.id)}
                          onToggle={toggleTask}
                          onEdit={handleEditFromCalendar}
                        />
                      ))}
                      {!selectedDateInfo.pm.chores.length && <li className="text-sm text-gray-400 italic p-2">No evening tasks</li>}
                    </ul>
                  </SortableContext>
                </div>
                <div className="pt-4 border-t"><h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Categories</h4><div className="flex flex-wrap gap-3 text-xs">{['daily', 'weekly', 'monthly', 'seasonal', 'one_time'].map(c => <span key={c} className="flex items-center gap-1"><span className={`w-2 h-2 rounded-full ${getCategoryColor(c)}`} />{getCategoryLabel(c)}</span>)}</div></div>
              </div>
              <DragOverlay>
                {activeDayChore ? (
                  <div className="bg-white rounded-lg shadow-lg pointer-events-none">
                    <ChoreItem
                      chore={activeDayChore}
                      completed={isTaskCompleted(activeDayChore.id)}
                      onToggle={toggleTask}
                      onEdit={handleEditFromCalendar}
                      showDragHandle
                    />
                  </div>
                ) : null}
              </DragOverlay>
            </DndContext>
          </div>
        </div>}

        {activeTab === 'manage' && <div className="space-y-6">
          <div className="bg-white rounded-xl shadow-sm p-6">
            <div className="flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-semibold text-gray-800">Rooms</h2>
              </div>
              <div className="flex flex-col sm:flex-row gap-2">
                <input type="text" value={newRoomName} onChange={e => setNewRoomName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') handleAddRoom(); }} placeholder="Add a room (e.g., Kitchen)" className="w-full sm:w-72 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500" />
                <button onClick={handleAddRoom} disabled={!newRoomName.trim()} className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed">Add Room</button>
              </div>
              {!newRoomName.trim() && <div className="text-xs text-gray-500">Type a room name to enable Add.</div>}
              <div className="flex flex-wrap gap-2">
                {!rooms.length && <div className="text-sm text-gray-500">No rooms yet.</div>}
                {rooms.map(r => (
                  <div key={r.id} className="flex items-center gap-2 px-3 py-1.5 bg-gray-100 rounded-full text-sm text-gray-700">
                    {editingRoomId === r.id ? (
                      <>
                        <input
                          type="text"
                          value={editingRoomName}
                          onChange={e => setEditingRoomName(e.target.value)}
                          className="px-2 py-1 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                        />
                        <button onClick={handleSaveRoom} className="text-blue-600 hover:text-blue-700">Save</button>
                        <button onClick={handleCancelEditRoom} className="text-gray-500 hover:text-gray-700">Cancel</button>
                      </>
                    ) : (
                      <>
                        <span>{r.name}</span>
                        <button onClick={() => handleStartEditRoom(r)} className="text-gray-400 hover:text-blue-500">Edit</button>
                        <button onClick={() => handleDeleteRoom(r.id)} className="text-gray-400 hover:text-red-500">x</button>
                      </>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm p-6">
          <div className="flex flex-col gap-4 mb-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <h2 className="text-xl font-semibold text-gray-800">All Chores</h2>
              <div className="flex items-center gap-3">
                {!orderMode && (
                  <div className="relative flex-grow sm:flex-grow-0">
                    <svg className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                    <input type="text" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="Search..." className="w-full sm:w-64 pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500" />
                    {searchQuery && <button onClick={() => setSearchQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg></button>}
                  </div>
                )}
                <button onClick={() => setOrderMode(p => !p)} className={`px-3 py-2 rounded-lg border text-sm font-medium whitespace-nowrap ${orderMode ? 'border-blue-500 text-blue-600 bg-blue-50' : 'border-gray-300 text-gray-600 hover:bg-gray-50'}`}>
                  {orderMode ? 'Done Ordering' : 'Reorder'}
                </button>
                {!orderMode && (
                  <button onClick={() => openAddModal('daily')} className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 flex items-center gap-2 whitespace-nowrap focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>Add</button>
                )}
              </div>
            </div>
            {!orderMode && (
              <div className="flex flex-wrap items-center gap-3 pt-3 border-t">
              <div className="flex items-center gap-2"><label className="text-sm text-gray-500">Type:</label><select value={frequencyFilter} onChange={e => setFrequencyFilter(e.target.value)} className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"><option value="all">All</option><option value="daily">Daily</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option><option value="seasonal">Seasonal</option><option value="one_time">One-Time</option></select></div>
              <div className="flex items-center gap-2"><label className="text-sm text-gray-500">Time:</label><select value={timeOfDayFilter} onChange={e => setTimeOfDayFilter(e.target.value)} className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"><option value="all">All</option><option value="AM">AM</option><option value="PM">PM</option></select></div>
              <div className="flex items-center gap-2 ml-auto"><label className="text-sm text-gray-500">Sort:</label><select value={sortBy} onChange={e => setSortBy(e.target.value)} className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"><option value="name">Name</option><option value="time">Duration</option><option value="ampm">AM/PM</option></select><button onClick={() => setSortDirection(p => p === 'asc' ? 'desc' : 'asc')} className="p-1.5 border border-gray-300 rounded-lg hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500">{sortDirection === 'asc' ? <svg className="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4h13M3 8h9m-9 4h6m4 0l4-4m0 0l4 4m-4-4v12" /></svg> : <svg className="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4h13M3 8h9m-9 4h9m5-4v12m0 0l-4-4m4 4l4-4" /></svg>}</button></div>
            </div>
            )}
            <div className="flex flex-wrap items-center gap-2 pt-3 border-t">
              <div className="ml-auto"><SaveIndicator status={saveStatus} /></div>
            </div>
          </div>
          {orderMode ? (
            <div className="space-y-3">
              <div className="text-sm text-gray-600 bg-blue-50 border border-blue-100 rounded-lg p-3">
                Drag chores to set your global default order. This order is used for new days in the Calendar. Day-specific changes happen in the Calendar view only.
              </div>
              <ul className="space-y-2" onDragOver={(e) => e.preventDefault()} onDrop={handleGlobalDropEnd}>
                {globalOrderIds.map(id => {
                  const chore = leafChoreMap[id];
                  if (!chore) return null;
                  return (
                    <li
                      key={id}
                      draggable
                      onDragStart={(e) => handleGlobalDragStart(id, e)}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={() => handleGlobalDrop(id)}
                      className="flex items-center gap-3 p-3 bg-white border border-gray-200 rounded-lg hover:border-gray-300"
                    >
                      <span className="text-gray-300 cursor-grab select-none">
                        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                          <path d="M7 4a1 1 0 112 0 1 1 0 01-2 0zm4 0a1 1 0 112 0 1 1 0 01-2 0zM7 10a1 1 0 112 0 1 1 0 01-2 0zm4 0a1 1 0 112 0 1 1 0 01-2 0zM7 16a1 1 0 112 0 1 1 0 01-2 0zm4 0a1 1 0 112 0 1 1 0 01-2 0z" />
                        </svg>
                      </span>
                      <span className={`w-2 h-2 rounded-full flex-shrink-0 ${getCategoryColor(chore.scheduleType)}`} />
                      <div className="flex-grow min-w-0">
                        <div className="text-sm text-gray-800 truncate">
                          {chore.parentName ? <><span className="text-gray-400">{chore.parentName}{' -> '}</span>{chore.name}</> : chore.name}
                        </div>
                        <div className="text-xs text-gray-400">
                          {getCategoryLabel(chore.scheduleType)} · {chore.time || 'No time'} · {chore.minutes ?? 0}m
                        </div>
                      </div>
                    </li>
                  );
                })}
                {!globalOrderIds.length && <li className="text-sm text-gray-400 italic p-3 bg-gray-50 rounded-lg">No chores to order yet</li>}
              </ul>
            </div>
          ) : (
            <>
              {(searchQuery || frequencyFilter !== 'all' || timeOfDayFilter !== 'all') && <div className="mb-4 text-sm text-gray-500">Showing {totalFiltered} of {totalChores} <button onClick={() => { setSearchQuery(''); setFrequencyFilter('all'); setTimeOfDayFilter('all'); }} className="ml-2 text-blue-500 hover:text-blue-600">Clear</button></div>}
              {totalFiltered === 0 && (searchQuery || frequencyFilter !== 'all' || timeOfDayFilter !== 'all') && <div className="text-center py-12"><svg className="w-16 h-16 mx-auto text-gray-300 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg><h3 className="text-lg font-medium text-gray-600 mb-1">No chores found</h3><p className="text-gray-400">Try adjusting filters</p></div>}
              <FrequencySection title="Daily" list={filteredChores.daily} frequency="daily" color="bg-emerald-400" total={chores.daily.length} searchQuery={searchQuery} timeOfDayFilter={timeOfDayFilter} frequencyFilter={frequencyFilter} onAdd={openAddModal} onEdit={setEditingChore} onDelete={deleteChore} roomMap={roomMap} />
              <FrequencySection title="Weekly" list={filteredChores.weekly} frequency="weekly" color="bg-blue-400" total={chores.weekly.length} searchQuery={searchQuery} timeOfDayFilter={timeOfDayFilter} frequencyFilter={frequencyFilter} onAdd={openAddModal} onEdit={setEditingChore} onDelete={deleteChore} roomMap={roomMap} />
              <FrequencySection title="Monthly" list={filteredChores.monthly} frequency="monthly" color="bg-purple-400" total={chores.monthly.length} searchQuery={searchQuery} timeOfDayFilter={timeOfDayFilter} frequencyFilter={frequencyFilter} onAdd={openAddModal} onEdit={setEditingChore} onDelete={deleteChore} roomMap={roomMap} />
              <FrequencySection title="Seasonal" list={filteredChores.seasonal} frequency="seasonal" color="bg-orange-400" total={chores.seasonal.length} searchQuery={searchQuery} timeOfDayFilter={timeOfDayFilter} frequencyFilter={frequencyFilter} onAdd={openAddModal} onEdit={setEditingChore} onDelete={deleteChore} roomMap={roomMap} />
              <FrequencySection title="One-Time" list={filteredChores.one_time} frequency="one_time" color="bg-red-400" total={chores.one_time.length} searchQuery={searchQuery} timeOfDayFilter={timeOfDayFilter} frequencyFilter={frequencyFilter} onAdd={openAddModal} onEdit={setEditingChore} onDelete={deleteChore} roomMap={roomMap} />
            </>
          )}
        </div></div>}
      </div>
      {editingChore && (
        <EditModal
          chore={editingChore}
          rooms={rooms}
          onClose={() => setEditingChore(null)}
          onSave={updateChore}
          onAddSubtask={addSubtask}
          onUpdateSubtask={updateSubtask}
          onDeleteSubtask={deleteSubtask}
          onError={showError}
          onRequestConfirm={requestConfirm}
        />
      )}
      {showAddModal && <AddModal defaultFrequency={addToFrequency} rooms={rooms} onClose={() => setShowAddModal(false)} onAdd={addChore} />}
      <ConfirmDialog dialog={confirmDialog} pending={confirmPending} onCancel={cancelConfirm} onConfirm={acceptConfirm} />
      <ToastStack toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}
