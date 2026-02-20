import React, { useState, useMemo, useReducer, useEffect, useCallback, memo } from 'react';

const generateId = () => crypto.randomUUID();
const STORAGE_KEY_CHORES = 'chore-dashboard-chores';
const STORAGE_KEY_COMPLETED = 'chore-dashboard-completed';

const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const dayNamesFull = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const formatTime = (m) => m < 60 ? `${m}m` : m % 60 > 0 ? `${Math.floor(m/60)}h ${m%60}m` : `${Math.floor(m/60)}h`;
const getDateKey = (d) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
const getDateString = (d) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
const getCategoryColor = (c) => ({ daily: 'bg-emerald-400', weekly: 'bg-blue-400', monthly: 'bg-purple-400', quarterly: 'bg-orange-400', adhoc: 'bg-red-400' }[c] || 'bg-gray-400');
const getCategoryColorBorder = (c) => ({ daily: 'border-emerald-400', weekly: 'border-blue-400', monthly: 'border-purple-400', quarterly: 'border-orange-400', adhoc: 'border-red-400' }[c] || 'border-gray-400');
const getCategoryColorText = (c) => ({ daily: 'text-emerald-600', weekly: 'text-blue-600', monthly: 'text-purple-600', quarterly: 'text-orange-600', adhoc: 'text-red-600' }[c] || 'text-gray-600');
const getCategoryColorBg = (c) => ({ daily: 'bg-emerald-50', weekly: 'bg-blue-50', monthly: 'bg-purple-50', quarterly: 'bg-orange-50', adhoc: 'bg-red-50' }[c] || 'bg-gray-50');
const getCategoryLabel = (c) => ({ daily: 'Daily', weekly: 'Weekly', monthly: 'Monthly', quarterly: 'Quarterly', adhoc: 'Ad Hoc' }[c] || c);

const ALL_FREQUENCIES = ['daily', 'weekly', 'monthly', 'quarterly', 'adhoc'];

// Initial data
const createInitialChores = () => ({
  daily: [
    { id: generateId(), name: 'Make bed', time: 'AM', minutes: 3 },
    { id: generateId(), name: 'Scoop litter boxes', time: 'AM', minutes: 5 },
    { id: generateId(), name: 'Wipe bathroom sink and counter', time: 'AM', minutes: 3 },
    { id: generateId(), name: 'Vacuum all floors', time: 'AM', minutes: 20 },
    { id: generateId(), name: 'Dishes / load dishwasher', time: 'PM', minutes: 10 },
    { id: generateId(), name: 'Wipe kitchen counters', time: 'PM', minutes: 5 },
    { id: generateId(), name: 'Take out trash when full', time: 'PM', minutes: 5 },
    { id: generateId(), name: 'Pick up clutter / return items to place', time: 'PM', minutes: 10 }
  ],
  weekly: [
    { id: generateId(), name: 'Mop hard floors', dayOfWeek: 1, time: 'AM', minutes: 20 },
    { id: generateId(), name: 'Clean toilets', dayOfWeek: 2, time: 'AM', minutes: 10 },
    { id: generateId(), name: 'Clean showers/tubs', dayOfWeek: 2, time: 'AM', minutes: 15 },
    { id: generateId(), name: 'Dust surfaces', dayOfWeek: 3, time: 'AM', minutes: 15 },
    { id: generateId(), name: 'Clean mirrors', dayOfWeek: 3, time: 'AM', minutes: 10 },
    { id: generateId(), name: 'Wipe down kitchen appliances', dayOfWeek: 4, time: 'PM', minutes: 10 },
    { id: generateId(), name: 'Brush dog and cats', dayOfWeek: 4, time: 'PM', minutes: 20 },
    { id: generateId(), name: 'Empty all small trash cans', dayOfWeek: 5, time: 'AM', minutes: 10 },
    { id: generateId(), name: 'Change bed linens', dayOfWeek: 6, time: 'AM', minutes: 15 },
    { id: generateId(), name: 'Laundry (wash, dry, fold, put away)', dayOfWeek: 6, time: 'AM', minutes: 45 },
    { id: generateId(), name: 'Wash food and water bowls', dayOfWeek: 0, time: 'PM', minutes: 10 }
  ],
  monthly: [
    { id: generateId(), name: 'Vacuum upholstery and mattresses', weekOfMonth: 1, dayOfWeek: 6, time: 'AM', minutes: 25 },
    { id: generateId(), name: 'Wash throw blankets and pillows', weekOfMonth: 1, dayOfWeek: 6, time: 'AM', minutes: 20 },
    { id: generateId(), name: 'Clean Keurig and toaster oven', weekOfMonth: 1, dayOfWeek: 6, time: 'PM', minutes: 15 },
    { id: generateId(), name: 'Clean inside microwave and oven', weekOfMonth: 2, dayOfWeek: 6, time: 'AM', minutes: 20 },
    { id: generateId(), name: 'Deep clean litter boxes', weekOfMonth: 2, dayOfWeek: 6, time: 'AM', minutes: 20 },
    { id: generateId(), name: 'Clean out fridge', weekOfMonth: 2, dayOfWeek: 6, time: 'PM', minutes: 25 },
    { id: generateId(), name: 'Wipe cabinet fronts', weekOfMonth: 3, dayOfWeek: 6, time: 'AM', minutes: 20 },
    { id: generateId(), name: 'Dust blinds and ceiling fans', weekOfMonth: 3, dayOfWeek: 6, time: 'AM', minutes: 25 },
    { id: generateId(), name: 'Clean window sills and baseboards', weekOfMonth: 4, dayOfWeek: 6, time: 'AM', minutes: 30 },
    { id: generateId(), name: 'Clean cat trees and scratching posts', weekOfMonth: 4, dayOfWeek: 6, time: 'PM', minutes: 20 }
  ],
  quarterly: [
    { id: generateId(), name: 'Deep clean carpets', monthOfQuarter: 1, weekOfMonth: 1, dayOfWeek: 6, time: 'AM', minutes: 60 },
    { id: generateId(), name: 'Flip or rotate mattress', monthOfQuarter: 1, weekOfMonth: 1, dayOfWeek: 6, time: 'AM', minutes: 10 },
    { id: generateId(), name: 'Deep clean furniture for embedded pet hair', monthOfQuarter: 1, weekOfMonth: 1, dayOfWeek: 6, time: 'PM', minutes: 45 },
    { id: generateId(), name: 'Change furnace filter', monthOfQuarter: 1, weekOfMonth: 1, dayOfWeek: 6, time: 'PM', minutes: 10 },
    { id: generateId(), name: 'Wash windows inside and out', monthOfQuarter: 2, weekOfMonth: 1, dayOfWeek: 6, time: 'AM', minutes: 60 },
    { id: generateId(), name: 'Clean dryer vent', monthOfQuarter: 2, weekOfMonth: 1, dayOfWeek: 6, time: 'AM', minutes: 20 },
    { id: generateId(), name: 'Organize closets', monthOfQuarter: 2, weekOfMonth: 1, dayOfWeek: 6, time: 'PM', minutes: 60 },
    { id: generateId(), name: 'Clean behind and under large furniture', monthOfQuarter: 3, weekOfMonth: 1, dayOfWeek: 6, time: 'AM', minutes: 45 },
    { id: generateId(), name: 'Clean garage or storage areas', monthOfQuarter: 3, weekOfMonth: 1, dayOfWeek: 6, time: 'AM', minutes: 90 },
    { id: generateId(), name: 'Vacuum basement', monthOfQuarter: 3, weekOfMonth: 1, dayOfWeek: 6, time: 'PM', minutes: 30 }
  ],
  adhoc: [
    { id: generateId(), name: 'Fix leaky faucet in bathroom', scheduledDate: '2026-02-15', time: 'AM', minutes: 45 },
    { id: generateId(), name: 'Organize garage sale items', scheduledDate: '2026-02-08', time: 'PM', minutes: 120 }
  ]
});

const choreReducer = (state, action) => {
  switch (action.type) {
    case 'ADD_CHORE': {
      const { chore, frequency } = action.payload;
      return { ...state, [frequency]: [...state[frequency], { ...chore, id: generateId() }] };
    }
    case 'UPDATE_CHORE': {
      const { chore, oldFrequency, newFrequency } = action.payload;
      const withoutOld = { ...state, [oldFrequency]: state[oldFrequency].filter(c => c.id !== chore.id) };
      return { ...withoutOld, [newFrequency]: [...withoutOld[newFrequency], chore] };
    }
    case 'DELETE_CHORE': {
      const { id, frequency } = action.payload;
      return { ...state, [frequency]: state[frequency].filter(c => c.id !== id) };
    }
    case 'LOAD_DATA': return action.payload;
    default: return state;
  }
};

// Memoized components
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
        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="5" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="19" r="2"/></svg>
      </button>
      {open && <>
        <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
        <div className="absolute right-0 top-full mt-1 bg-white rounded-lg shadow-lg border py-1 z-20 min-w-32">
          <button onClick={() => { setOpen(false); onEdit(); }} className="w-full px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"/></svg>
            Edit
          </button>
        </div>
      </>}
    </div>
  );
});

const ChoreItem = memo(({ chore, completed, onToggle, onEdit }) => (
  <li className={`text-sm flex items-center gap-2 p-2 rounded-lg transition-all ${completed ? 'bg-gray-50 text-gray-400' : 'hover:bg-gray-50 text-gray-700'}`}>
    <button onClick={() => onToggle(chore.id)} aria-pressed={completed} className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-emerald-500 ${completed ? 'bg-emerald-500 border-emerald-500' : 'border-gray-300 hover:border-gray-400'}`}>
      {completed && <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
    </button>
    <span className={`w-2 h-2 rounded-full flex-shrink-0 ${getCategoryColor(chore.category)}`} />
    <span onClick={() => onToggle(chore.id)} className={`flex-grow cursor-pointer ${completed ? 'line-through' : ''}`}>{chore.name}</span>
    <span className={`text-xs px-2 py-0.5 rounded-full ${completed ? 'bg-gray-100 text-gray-400' : 'bg-gray-100 text-gray-500'}`}>{chore.minutes}m</span>
    <ChoreMenu onEdit={() => onEdit(chore)} />
  </li>
));

const ManageChoreItem = memo(({ chore, frequency, searchQuery, onEdit, onDelete }) => {
  const desc = frequency === 'weekly' ? dayNamesFull[chore.dayOfWeek] 
    : frequency === 'monthly' ? `Week ${chore.weekOfMonth}, ${dayNamesFull[chore.dayOfWeek]}` 
    : frequency === 'quarterly' ? `M${chore.monthOfQuarter}, W${chore.weekOfMonth}, ${dayNamesFull[chore.dayOfWeek]}` 
    : frequency === 'adhoc' ? new Date(chore.scheduledDate + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }) 
    : null;
  return (
    <div className="flex items-center gap-3 p-3 bg-white rounded-lg border border-gray-200 hover:border-gray-300">
      <span className={`w-2 h-2 rounded-full flex-shrink-0 ${getCategoryColor(frequency)}`} />
      <div className="flex-grow min-w-0">
        <div className="font-medium text-gray-800 truncate"><HighlightedText text={chore.name} query={searchQuery} /></div>
        <div className="text-xs text-gray-500 flex items-center gap-2 flex-wrap">
          <span>{chore.time}</span><span>•</span><span>{chore.minutes}m</span>
          {desc && <><span>•</span><span>{desc}</span></>}
        </div>
      </div>
      <button onClick={() => onEdit(chore)} className="p-1.5 text-gray-400 hover:text-blue-500 hover:bg-blue-50 rounded focus:outline-none focus:ring-2 focus:ring-blue-500">
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"/></svg>
      </button>
      <button onClick={() => onDelete(chore.id)} className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded focus:outline-none focus:ring-2 focus:ring-red-500">
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
      </button>
    </div>
  );
});

const FrequencySection = memo(({ title, list, frequency, color, total, searchQuery, timeOfDayFilter, frequencyFilter, onAdd, onEdit, onDelete }) => {
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
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4"/></svg>Add
          </button>
        )}
      </div>
      <div className="space-y-2">
        {list.map(c => <ManageChoreItem key={c.id} chore={c} frequency={frequency} searchQuery={searchQuery} onEdit={(ch) => onEdit({ ...ch, frequency })} onDelete={(id) => onDelete(id, frequency)} />)}
        {!list.length && !searchQuery && frequencyFilter === 'all' && timeOfDayFilter === 'all' && <div className="text-sm text-gray-400 italic p-3 bg-gray-50 rounded-lg">No chores</div>}
      </div>
    </div>
  );
});

const CalendarTooltip = memo(({ date, breakdown, viewMode, enabledFrequencies }) => {
  if (!date) return null;
  const cats = ALL_FREQUENCIES.filter(f => enabledFrequencies.has(f));
  if (!cats.some(c => breakdown[c].count > 0)) return null;
  return (
    <div className="absolute z-30 bg-gray-900 text-white text-xs rounded-lg p-3 shadow-xl -translate-x-1/2 left-1/2 bottom-full mb-2 min-w-40">
      <div className="font-medium mb-2">{date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</div>
      <div className="space-y-1">{cats.map(c => breakdown[c].count === 0 ? null : (
        <div key={c} className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-1.5"><span className={`w-2 h-2 rounded-full ${getCategoryColor(c)}`} /><span>{getCategoryLabel(c)}</span></div>
          <span className="text-gray-300">{viewMode === 'count' ? breakdown[c].count : formatTime(breakdown[c].minutes)}</span>
        </div>
      ))}</div>
      <div className="absolute left-1/2 -translate-x-1/2 top-full w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-gray-900" />
    </div>
  );
});

const SaveIndicator = memo(({ status }) => (
  <span className={`text-xs flex items-center gap-1 ${status === 'saved' ? 'text-green-600' : status === 'saving' ? 'text-amber-600' : 'text-red-600'}`}>
    {status === 'saved' && '✓ Saved'}{status === 'saving' && '⟳ Saving...'}{status === 'error' && '✕ Error'}
  </span>
));

// Calendar frequency filter chip component
const FrequencyFilterChip = memo(({ frequency, enabled, count, onToggle }) => {
  const baseClasses = "px-2.5 py-1 rounded-full text-xs font-medium border-2 transition-all cursor-pointer flex items-center gap-1.5";
  const enabledClasses = `${getCategoryColorBg(frequency)} ${getCategoryColorBorder(frequency)} ${getCategoryColorText(frequency)}`;
  const disabledClasses = "bg-gray-100 border-gray-200 text-gray-400";
  
  return (
    <button
      onClick={() => onToggle(frequency)}
      className={`${baseClasses} ${enabled ? enabledClasses : disabledClasses}`}
      title={enabled ? `Hide ${getCategoryLabel(frequency).toLowerCase()} chores` : `Show ${getCategoryLabel(frequency).toLowerCase()} chores`}
    >
      <span className={`w-2 h-2 rounded-full ${enabled ? getCategoryColor(frequency) : 'bg-gray-300'}`} />
      <span>{getCategoryLabel(frequency)}</span>
      {count > 0 && <span className={`${enabled ? 'opacity-70' : 'opacity-50'}`}>({count})</span>}
    </button>
  );
});

const EditModal = memo(({ chore, onClose, onSave }) => {
  const [name, setName] = useState(chore.name);
  const [time, setTime] = useState(chore.time);
  const [minutes, setMinutes] = useState(chore.minutes);
  const [frequency, setFrequency] = useState(chore.frequency);
  const [dayOfWeek, setDayOfWeek] = useState(chore.dayOfWeek ?? 6);
  const [weekOfMonth, setWeekOfMonth] = useState(chore.weekOfMonth ?? 1);
  const [monthOfQuarter, setMonthOfQuarter] = useState(chore.monthOfQuarter ?? 1);
  const [scheduledDate, setScheduledDate] = useState(chore.scheduledDate || '');
  const valid = name.trim() && (frequency !== 'adhoc' || scheduledDate);
  const handleSave = () => { if (!valid) return; onSave({ ...chore, name, time, minutes: parseInt(minutes) || 5, dayOfWeek, weekOfMonth, monthOfQuarter, scheduledDate }, chore.frequency, frequency); onClose(); };
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6 max-h-[90vh] overflow-y-auto">
        <h3 className="text-lg font-semibold text-gray-800 mb-4">Edit Chore</h3>
        <div className="space-y-4">
          <div><label className="block text-sm font-medium text-gray-700 mb-1">Name</label><input type="text" value={name} onChange={e => setName(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"/></div>
          <div className="grid grid-cols-2 gap-4">
            <div><label className="block text-sm font-medium text-gray-700 mb-1">Time</label><select value={time} onChange={e => setTime(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"><option value="AM">AM</option><option value="PM">PM</option></select></div>
            <div><label className="block text-sm font-medium text-gray-700 mb-1">Minutes</label><input type="number" value={minutes} onChange={e => setMinutes(e.target.value)} min="1" className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"/></div>
          </div>
          <div><label className="block text-sm font-medium text-gray-700 mb-1">Frequency</label><select value={frequency} onChange={e => setFrequency(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"><option value="daily">Daily</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option><option value="quarterly">Quarterly</option><option value="adhoc">Ad Hoc</option></select></div>
          {frequency === 'weekly' && <div><label className="block text-sm font-medium text-gray-700 mb-1">Day</label><select value={dayOfWeek} onChange={e => setDayOfWeek(+e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500">{dayNamesFull.map((d,i) => <option key={i} value={i}>{d}</option>)}</select></div>}
          {frequency === 'monthly' && <><div><label className="block text-sm font-medium text-gray-700 mb-1">Week</label><select value={weekOfMonth} onChange={e => setWeekOfMonth(+e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500">{[1,2,3,4].map(w => <option key={w} value={w}>Week {w}</option>)}</select></div><div><label className="block text-sm font-medium text-gray-700 mb-1">Day</label><select value={dayOfWeek} onChange={e => setDayOfWeek(+e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500">{dayNamesFull.map((d,i) => <option key={i} value={i}>{d}</option>)}</select></div></>}
          {frequency === 'quarterly' && <><div><label className="block text-sm font-medium text-gray-700 mb-1">Month of Quarter</label><select value={monthOfQuarter} onChange={e => setMonthOfQuarter(+e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"><option value={1}>1st</option><option value={2}>2nd</option><option value={3}>3rd</option></select></div><div><label className="block text-sm font-medium text-gray-700 mb-1">Week</label><select value={weekOfMonth} onChange={e => setWeekOfMonth(+e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500">{[1,2,3,4].map(w => <option key={w} value={w}>Week {w}</option>)}</select></div><div><label className="block text-sm font-medium text-gray-700 mb-1">Day</label><select value={dayOfWeek} onChange={e => setDayOfWeek(+e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500">{dayNamesFull.map((d,i) => <option key={i} value={i}>{d}</option>)}</select></div></>}
          {frequency === 'adhoc' && <div><label className="block text-sm font-medium text-gray-700 mb-1">Date *</label><input type="date" value={scheduledDate} onChange={e => setScheduledDate(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"/>{!scheduledDate && <p className="text-xs text-red-500 mt-1">Required</p>}</div>}
        </div>
        <div className="flex gap-3 mt-6"><button onClick={onClose} className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50">Cancel</button><button onClick={handleSave} disabled={!valid} className="flex-1 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50">Save</button></div>
      </div>
    </div>
  );
});

const AddModal = memo(({ defaultFrequency, onClose, onAdd }) => {
  const [name, setName] = useState('');
  const [time, setTime] = useState('AM');
  const [minutes, setMinutes] = useState(10);
  const [frequency, setFrequency] = useState(defaultFrequency);
  const [dayOfWeek, setDayOfWeek] = useState(6);
  const [weekOfMonth, setWeekOfMonth] = useState(1);
  const [monthOfQuarter, setMonthOfQuarter] = useState(1);
  const [scheduledDate, setScheduledDate] = useState('');
  const valid = name.trim() && (frequency !== 'adhoc' || scheduledDate);
  const handleAdd = () => { if (!valid) return; onAdd({ name: name.trim(), time, minutes: parseInt(minutes) || 5, dayOfWeek, weekOfMonth, monthOfQuarter, scheduledDate }, frequency); onClose(); };
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6 max-h-[90vh] overflow-y-auto">
        <h3 className="text-lg font-semibold text-gray-800 mb-4">Add Chore</h3>
        <div className="space-y-4">
          <div><label className="block text-sm font-medium text-gray-700 mb-1">Name</label><input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="Chore name" className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"/></div>
          <div className="grid grid-cols-2 gap-4">
            <div><label className="block text-sm font-medium text-gray-700 mb-1">Time</label><select value={time} onChange={e => setTime(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"><option value="AM">AM</option><option value="PM">PM</option></select></div>
            <div><label className="block text-sm font-medium text-gray-700 mb-1">Minutes</label><input type="number" value={minutes} onChange={e => setMinutes(e.target.value)} min="1" className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"/></div>
          </div>
          <div><label className="block text-sm font-medium text-gray-700 mb-1">Frequency</label><select value={frequency} onChange={e => setFrequency(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"><option value="daily">Daily</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option><option value="quarterly">Quarterly</option><option value="adhoc">Ad Hoc</option></select></div>
          {frequency === 'weekly' && <div><label className="block text-sm font-medium text-gray-700 mb-1">Day</label><select value={dayOfWeek} onChange={e => setDayOfWeek(+e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500">{dayNamesFull.map((d,i) => <option key={i} value={i}>{d}</option>)}</select></div>}
          {frequency === 'monthly' && <><div><label className="block text-sm font-medium text-gray-700 mb-1">Week</label><select value={weekOfMonth} onChange={e => setWeekOfMonth(+e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500">{[1,2,3,4].map(w => <option key={w} value={w}>Week {w}</option>)}</select></div><div><label className="block text-sm font-medium text-gray-700 mb-1">Day</label><select value={dayOfWeek} onChange={e => setDayOfWeek(+e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500">{dayNamesFull.map((d,i) => <option key={i} value={i}>{d}</option>)}</select></div></>}
          {frequency === 'quarterly' && <><div><label className="block text-sm font-medium text-gray-700 mb-1">Month of Quarter</label><select value={monthOfQuarter} onChange={e => setMonthOfQuarter(+e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"><option value={1}>1st</option><option value={2}>2nd</option><option value={3}>3rd</option></select></div><div><label className="block text-sm font-medium text-gray-700 mb-1">Week</label><select value={weekOfMonth} onChange={e => setWeekOfMonth(+e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500">{[1,2,3,4].map(w => <option key={w} value={w}>Week {w}</option>)}</select></div><div><label className="block text-sm font-medium text-gray-700 mb-1">Day</label><select value={dayOfWeek} onChange={e => setDayOfWeek(+e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500">{dayNamesFull.map((d,i) => <option key={i} value={i}>{d}</option>)}</select></div></>}
          {frequency === 'adhoc' && <div><label className="block text-sm font-medium text-gray-700 mb-1">Date *</label><input type="date" value={scheduledDate} onChange={e => setScheduledDate(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"/>{!scheduledDate && <p className="text-xs text-red-500 mt-1">Required</p>}</div>}
        </div>
        <div className="flex gap-3 mt-6"><button onClick={onClose} className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50">Cancel</button><button onClick={handleAdd} disabled={!valid} className="flex-1 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50">Add</button></div>
      </div>
    </div>
  );
});

// Main component
export default function ChoreDashboard() {
  const [chores, dispatch] = useReducer(choreReducer, null, createInitialChores);
  const [completedTasks, setCompletedTasks] = useState({});
  const [isLoading, setIsLoading] = useState(true);
  const [saveStatus, setSaveStatus] = useState('saved');
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [viewMode, setViewMode] = useState('time');
  const [activeTab, setActiveTab] = useState('calendar');
  const [searchQuery, setSearchQuery] = useState('');
  const [hoveredDate, setHoveredDate] = useState(null);
  const [frequencyFilter, setFrequencyFilter] = useState('all');
  const [timeOfDayFilter, setTimeOfDayFilter] = useState('all');
  const [sortBy, setSortBy] = useState('name');
  const [sortDirection, setSortDirection] = useState('asc');
  const [editingChore, setEditingChore] = useState(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [addToFrequency, setAddToFrequency] = useState('daily');
  
  // Calendar frequency filter - Set of enabled frequencies
  const [calendarFrequencies, setCalendarFrequencies] = useState(() => new Set(ALL_FREQUENCIES));
  
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  // Toggle a frequency in the calendar filter
  const toggleCalendarFrequency = useCallback((freq) => {
    setCalendarFrequencies(prev => {
      const next = new Set(prev);
      if (next.has(freq)) {
        // Don't allow disabling all frequencies
        if (next.size > 1) {
          next.delete(freq);
        }
      } else {
        next.add(freq);
      }
      return next;
    });
  }, []);

  // Reset to show all frequencies
  const resetCalendarFrequencies = useCallback(() => {
    setCalendarFrequencies(new Set(ALL_FREQUENCIES));
  }, []);

  // Check if filter is active (not showing all)
  const isCalendarFilterActive = calendarFrequencies.size < ALL_FREQUENCIES.length;

  // Load from storage
  useEffect(() => {
    const loadData = async () => {
      if (!window.storage) { setIsLoading(false); return; }
      try {
        const [choresRes, completedRes] = await Promise.all([
          window.storage.get(STORAGE_KEY_CHORES).catch(() => null),
          window.storage.get(STORAGE_KEY_COMPLETED).catch(() => null)
        ]);
        if (choresRes?.value) {
          const p = JSON.parse(choresRes.value);
          if (p.daily && p.weekly && p.monthly && p.quarterly && p.adhoc) dispatch({ type: 'LOAD_DATA', payload: p });
        }
        if (completedRes?.value) setCompletedTasks(JSON.parse(completedRes.value));
      } catch (e) { console.warn('Load failed:', e); }
      setIsLoading(false);
    };
    loadData();
  }, []);

  // Save chores (debounced)
  useEffect(() => {
    if (isLoading || !window.storage) return;
    setSaveStatus('saving');
    const t = setTimeout(async () => {
      try { await window.storage.set(STORAGE_KEY_CHORES, JSON.stringify(chores)); setSaveStatus('saved'); }
      catch (e) { console.warn('Save chores failed:', e); setSaveStatus('error'); }
    }, 500);
    return () => clearTimeout(t);
  }, [chores, isLoading]);

  // Save completed (debounced)
  useEffect(() => {
    if (isLoading || !window.storage) return;
    const t = setTimeout(async () => {
      try { await window.storage.set(STORAGE_KEY_COMPLETED, JSON.stringify(completedTasks)); }
      catch (e) { console.warn('Save completed failed:', e); }
    }, 500);
    return () => clearTimeout(t);
  }, [completedTasks, isLoading]);

  // Get all chores for a date (unfiltered)
  const getAllChoresForDate = useCallback((date) => {
    const dow = date.getDay(), wom = Math.ceil(date.getDate() / 7), moq = (date.getMonth() % 3) + 1, ds = getDateString(date);
    return {
      daily: chores.daily.map(c => ({ ...c, category: 'daily' })),
      weekly: chores.weekly.filter(c => c.dayOfWeek === dow).map(c => ({ ...c, category: 'weekly' })),
      monthly: chores.monthly.filter(c => c.weekOfMonth === wom && c.dayOfWeek === dow).map(c => ({ ...c, category: 'monthly' })),
      quarterly: chores.quarterly.filter(c => c.monthOfQuarter === moq && c.weekOfMonth === wom && c.dayOfWeek === dow).map(c => ({ ...c, category: 'quarterly' })),
      adhoc: chores.adhoc.filter(c => c.scheduledDate === ds).map(c => ({ ...c, category: 'adhoc' }))
    };
  }, [chores]);

  // Pre-compute month data (MEMOIZED) - respects calendar frequency filter
  const monthChoresCache = useMemo(() => {
    const cache = new Map();
    for (let i = 1; i <= new Date(year, month + 1, 0).getDate(); i++) {
      const date = new Date(year, month, i), dk = getDateKey(date), dc = getAllChoresForDate(date);
      
      // Full data (unfiltered)
      const allUnfiltered = [...dc.daily, ...dc.weekly, ...dc.monthly, ...dc.quarterly, ...dc.adhoc];
      
      // Filtered data
      const filteredChores = {
        daily: calendarFrequencies.has('daily') ? dc.daily : [],
        weekly: calendarFrequencies.has('weekly') ? dc.weekly : [],
        monthly: calendarFrequencies.has('monthly') ? dc.monthly : [],
        quarterly: calendarFrequencies.has('quarterly') ? dc.quarterly : [],
        adhoc: calendarFrequencies.has('adhoc') ? dc.adhoc : []
      };
      const allFiltered = [...filteredChores.daily, ...filteredChores.weekly, ...filteredChores.monthly, ...filteredChores.quarterly, ...filteredChores.adhoc];
      
      cache.set(dk, {
        chores: filteredChores, 
        allChores: allFiltered,
        byTime: { AM: allFiltered.filter(c => c.time === 'AM'), PM: allFiltered.filter(c => c.time === 'PM') },
        count: allFiltered.length, 
        totalMinutes: allFiltered.reduce((s, c) => s + c.minutes, 0),
        allChoresUnfiltered: allUnfiltered,
        countUnfiltered: allUnfiltered.length,
        totalMinutesUnfiltered: allUnfiltered.reduce((s, c) => s + c.minutes, 0),
        breakdown: {
          daily: { count: dc.daily.length, minutes: dc.daily.reduce((s,c) => s+c.minutes, 0) },
          weekly: { count: dc.weekly.length, minutes: dc.weekly.reduce((s,c) => s+c.minutes, 0) },
          monthly: { count: dc.monthly.length, minutes: dc.monthly.reduce((s,c) => s+c.minutes, 0) },
          quarterly: { count: dc.quarterly.length, minutes: dc.quarterly.reduce((s,c) => s+c.minutes, 0) },
          adhoc: { count: dc.adhoc.length, minutes: dc.adhoc.reduce((s,c) => s+c.minutes, 0) }
        }
      });
    }
    return cache;
  }, [chores, year, month, getAllChoresForDate, calendarFrequencies]);

  const getDateData = useCallback((date) => monthChoresCache.get(getDateKey(date)) || { 
    chores: {daily:[],weekly:[],monthly:[],quarterly:[],adhoc:[]}, 
    allChores: [], byTime: {AM:[],PM:[]}, count: 0, totalMinutes: 0,
    allChoresUnfiltered: [], countUnfiltered: 0, totalMinutesUnfiltered: 0,
    breakdown: {daily:{count:0,minutes:0},weekly:{count:0,minutes:0},monthly:{count:0,minutes:0},quarterly:{count:0,minutes:0},adhoc:{count:0,minutes:0}} 
  }, [monthChoresCache]);

  // Pre-compute completion counts (MEMOIZED)
  const completionCounts = useMemo(() => {
    const counts = new Map();
    for (let i = 1; i <= new Date(year, month + 1, 0).getDate(); i++) {
      const date = new Date(year, month, i), dk = getDateKey(date), comp = completedTasks[dk] || {}, dd = getDateData(date);
      const completedCount = dd.allChores.filter(c => comp[c.id]).length;
      const completedMinutes = dd.allChores.filter(c => comp[c.id]).reduce((s,c) => s+c.minutes, 0);
      const completedCountUnfiltered = dd.allChoresUnfiltered.filter(c => comp[c.id]).length;
      counts.set(dk, { 
        count: completedCount, minutes: completedMinutes,
        countUnfiltered: completedCountUnfiltered,
        isFullyComplete: completedCountUnfiltered === dd.countUnfiltered && dd.countUnfiltered > 0
      });
    }
    return counts;
  }, [completedTasks, year, month, getDateData]);

  const getCompletedData = useCallback((date) => completionCounts.get(getDateKey(date)) || { count: 0, minutes: 0, countUnfiltered: 0, isFullyComplete: false }, [completionCounts]);

  // Compute total chores per frequency for the current month
  const monthlyFrequencyCounts = useMemo(() => {
    const counts = { daily: 0, weekly: 0, monthly: 0, quarterly: 0, adhoc: 0 };
    for (let i = 1; i <= new Date(year, month + 1, 0).getDate(); i++) {
      const date = new Date(year, month, i), dk = getDateKey(date);
      const dd = monthChoresCache.get(dk);
      if (dd) {
        counts.daily += dd.breakdown.daily.count;
        counts.weekly += dd.breakdown.weekly.count;
        counts.monthly += dd.breakdown.monthly.count;
        counts.quarterly += dd.breakdown.quarterly.count;
        counts.adhoc += dd.breakdown.adhoc.count;
      }
    }
    return counts;
  }, [monthChoresCache, year, month]);

  // Filtered chores for Manage tab (MEMOIZED)
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
      quarterly: shouldShow('quarterly') ? filterAndSort(chores.quarterly) : [],
      adhoc: shouldShow('adhoc') ? filterAndSort(chores.adhoc) : []
    };
  }, [chores, searchQuery, timeOfDayFilter, frequencyFilter, sortBy, sortDirection]);

  const totalFiltered = filteredChores.daily.length + filteredChores.weekly.length + filteredChores.monthly.length + filteredChores.quarterly.length + filteredChores.adhoc.length;
  const totalChores = chores.daily.length + chores.weekly.length + chores.monthly.length + chores.quarterly.length + chores.adhoc.length;

  // Dynamic thresholds (MEMOIZED)
  const dynamicThresholds = useMemo(() => {
    const vals = Array.from(monthChoresCache.values());
    const counts = vals.map(v => v.count).filter(c => c > 0), mins = vals.map(v => v.totalMinutes).filter(m => m > 0);
    if (!counts.length) return { count: { light: 0, medium: 0, heavy: 0 }, time: { light: 0, medium: 0, heavy: 0 } };
    const minC = Math.min(...counts), maxC = Math.max(...counts), minM = Math.min(...mins), maxM = Math.max(...mins);
    return {
      count: { light: minC + (maxC-minC)*0.25, medium: minC + (maxC-minC)*0.5, heavy: minC + (maxC-minC)*0.75 },
      time: { light: minM + (maxM-minM)*0.25, medium: minM + (maxM-minM)*0.5, heavy: minM + (maxM-minM)*0.75 }
    };
  }, [monthChoresCache]);

  // Calendar days (MEMOIZED)
  const calendarDays = useMemo(() => {
    const first = new Date(year, month, 1), days = Array(first.getDay()).fill(null);
    for (let i = 1; i <= new Date(year, month + 1, 0).getDate(); i++) days.push(new Date(year, month, i));
    return days;
  }, [year, month]);

  // Selected date info (MEMOIZED)
  const selectedDateInfo = useMemo(() => {
    const dd = getDateData(selectedDate);
    const cd = getCompletedData(selectedDate);
    const completed = completedTasks[getDateKey(selectedDate)] || {};
    const amCompleted = dd.byTime.AM.filter(c => completed[c.id]);
    const pmCompleted = dd.byTime.PM.filter(c => completed[c.id]);
    // Calculate progress based on viewMode (time or count)
    const progressPct = viewMode === 'time'
      ? (dd.totalMinutes > 0 ? Math.round((cd.minutes / dd.totalMinutes) * 100) : 0)
      : (dd.count > 0 ? Math.round((cd.count / dd.count) * 100) : 0);
    return {
      dateData: dd, completedData: cd, completedMap: completed,
      progressPct,
      am: { chores: dd.byTime.AM, completedCount: amCompleted.length, completedMinutes: amCompleted.reduce((s,c) => s+c.minutes, 0), totalMinutes: dd.byTime.AM.reduce((s,c) => s+c.minutes, 0) },
      pm: { chores: dd.byTime.PM, completedCount: pmCompleted.length, completedMinutes: pmCompleted.reduce((s,c) => s+c.minutes, 0), totalMinutes: dd.byTime.PM.reduce((s,c) => s+c.minutes, 0) }
    };
  }, [selectedDate, getDateData, getCompletedData, completedTasks, viewMode]);

  const toggleTask = useCallback((choreId) => { const dk = getDateKey(selectedDate); setCompletedTasks(p => ({ ...p, [dk]: { ...p[dk], [choreId]: !p[dk]?.[choreId] } })); }, [selectedDate]);
  const isTaskCompleted = useCallback((choreId) => selectedDateInfo.completedMap[choreId] || false, [selectedDateInfo.completedMap]);

  const getHeatColor = useCallback((date) => {
    const dd = getDateData(date), cd = getCompletedData(date);
    if (cd.isFullyComplete) return 'bg-emerald-300 text-emerald-900';
    if (dd.count === 0) return 'bg-gray-100 text-gray-400';
    const rem = viewMode === 'count' ? dd.count - cd.count : dd.totalMinutes - cd.minutes;
    const { light, medium, heavy } = dynamicThresholds[viewMode === 'count' ? 'count' : 'time'];
    if (rem <= light) return 'bg-emerald-100 text-emerald-800';
    if (rem <= medium) return 'bg-amber-100 text-amber-800';
    if (rem <= heavy) return 'bg-orange-200 text-orange-800';
    return 'bg-red-200 text-red-800';
  }, [getDateData, getCompletedData, viewMode, dynamicThresholds]);

  const addChore = useCallback((chore, frequency) => dispatch({ type: 'ADD_CHORE', payload: { chore, frequency } }), []);
  const updateChore = useCallback((chore, oldFreq, newFreq) => dispatch({ type: 'UPDATE_CHORE', payload: { chore, oldFrequency: oldFreq, newFrequency: newFreq } }), []);
  const deleteChore = useCallback((id, frequency) => dispatch({ type: 'DELETE_CHORE', payload: { id, frequency } }), []);

  const exportData = useCallback(() => {
    const blob = new Blob([JSON.stringify({ chores, completedTasks, exportedAt: Date.now() }, null, 2)], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = `chore-export-${new Date().toISOString().split('T')[0]}.json`; a.click();
  }, [chores, completedTasks]);

  const importData = useCallback((e) => {
    const file = e.target.files?.[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const d = JSON.parse(ev.target?.result);
        if (d.chores) dispatch({ type: 'LOAD_DATA', payload: d.chores });
        if (d.completedTasks) setCompletedTasks(d.completedTasks);
        alert('Imported!');
      } catch { alert('Invalid file'); }
    };
    reader.readAsText(file); e.target.value = '';
  }, []);

  const clearAllData = useCallback(async () => {
    if (!confirm('Clear all data?')) return;
    dispatch({ type: 'LOAD_DATA', payload: createInitialChores() });
    setCompletedTasks({});
    if (window.storage) { try { await window.storage.delete(STORAGE_KEY_CHORES); await window.storage.delete(STORAGE_KEY_COMPLETED); } catch {} }
  }, []);

  const handleEditFromCalendar = useCallback((chore) => { setEditingChore({ ...chore, frequency: chore.category }); setActiveTab('manage'); }, []);
  const openAddModal = useCallback((frequency) => { setAddToFrequency(frequency); setShowAddModal(true); }, []);

  const navMonth = (d) => setCurrentDate(new Date(year, month + d, 1));
  const isToday = (d) => d && new Date().toDateString() === d.toDateString();
  const isSelected = (d) => d && selectedDate.toDateString() === d.toDateString();

  const legendLabels = viewMode === 'count' 
    ? { light: `≤${Math.round(dynamicThresholds.count.light)}`, medium: `≤${Math.round(dynamicThresholds.count.medium)}`, heavy: `≤${Math.round(dynamicThresholds.count.heavy)}` }
    : { light: `≤${formatTime(Math.round(dynamicThresholds.time.light))}`, medium: `≤${formatTime(Math.round(dynamicThresholds.time.medium))}`, heavy: `≤${formatTime(Math.round(dynamicThresholds.time.heavy))}` };

  if (isLoading) return <div className="min-h-screen bg-gray-50 flex items-center justify-center"><div className="text-center"><div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" /><p className="text-gray-600">Loading...</p></div></div>;

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-6xl mx-auto">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-6">
          <div><h1 className="text-3xl font-bold text-gray-800 mb-2">Chore Dashboard</h1><p className="text-gray-600">{activeTab === 'calendar' ? 'Click any day to see tasks' : 'Manage your chores'}</p></div>
          <div className="mt-4 sm:mt-0 flex items-center gap-2">
            <div className="flex items-center bg-white rounded-lg p-1 shadow-sm">
              <button onClick={() => setActiveTab('calendar')} className={`px-3 py-1.5 rounded-md text-sm font-medium flex items-center gap-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500 ${activeTab === 'calendar' ? 'bg-blue-500 text-white' : 'text-gray-500 hover:text-gray-700'}`}><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>Calendar</button>
              <button onClick={() => setActiveTab('manage')} className={`px-3 py-1.5 rounded-md text-sm font-medium flex items-center gap-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500 ${activeTab === 'manage' ? 'bg-blue-500 text-white' : 'text-gray-500 hover:text-gray-700'}`}><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/></svg>Manage</button>
            </div>
            {activeTab === 'calendar' && <div className="flex items-center bg-white rounded-lg p-1 shadow-sm">
              <button onClick={() => setViewMode('time')} className={`px-3 py-1.5 rounded-md text-sm font-medium flex items-center gap-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500 ${viewMode === 'time' ? 'bg-blue-500 text-white' : 'text-gray-500 hover:text-gray-700'}`}><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>Time</button>
              <button onClick={() => setViewMode('count')} className={`px-3 py-1.5 rounded-md text-sm font-medium flex items-center gap-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500 ${viewMode === 'count' ? 'bg-blue-500 text-white' : 'text-gray-500 hover:text-gray-700'}`}><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"/></svg>Count</button>
            </div>}
          </div>
        </div>

        {activeTab === 'calendar' && <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 bg-white rounded-xl shadow-sm p-6">
            <div className="flex items-center justify-between mb-4">
              <button onClick={() => navMonth(-1)} className="p-2 hover:bg-gray-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7"/></svg></button>
              <h2 className="text-xl font-semibold text-gray-800">{monthNames[month]} {year}</h2>
              <button onClick={() => navMonth(1)} className="p-2 hover:bg-gray-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7"/></svg></button>
            </div>
            
            {/* Calendar Frequency Filter */}
            <div className="flex flex-wrap items-center gap-2 mb-4 pb-4 border-b">
              <span className="text-sm text-gray-500 mr-1">Show:</span>
              {ALL_FREQUENCIES.map(freq => (
                <FrequencyFilterChip
                  key={freq}
                  frequency={freq}
                  enabled={calendarFrequencies.has(freq)}
                  count={monthlyFrequencyCounts[freq]}
                  onToggle={toggleCalendarFrequency}
                />
              ))}
              {isCalendarFilterActive && (
                <button onClick={resetCalendarFrequencies} className="ml-2 text-xs text-blue-500 hover:text-blue-600 underline">
                  Show all
                </button>
              )}
            </div>
            
            <div className="grid grid-cols-7 gap-2 mb-2">{dayNames.map(d => <div key={d} className="text-center text-sm font-medium text-gray-500 py-2">{d}</div>)}</div>
            <div className="grid grid-cols-7 gap-2">{calendarDays.map((date, i) => {
              if (!date) return <div key={i} className="aspect-square" />;
              const dd = getDateData(date), cd = getCompletedData(date);
              return (
                <div key={i} className="aspect-square relative">
                  <button onClick={() => setSelectedDate(date)} onMouseEnter={() => setHoveredDate(date)} onMouseLeave={() => setHoveredDate(null)} className={`w-full h-full rounded-lg flex flex-col items-center justify-center transition-all focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${getHeatColor(date)} ${isSelected(date) ? 'ring-2 ring-blue-500 ring-offset-2' : ''} ${isToday(date) ? 'font-bold' : ''} hover:scale-105 hover:shadow-md`}>
                    <span className="text-lg">{date.getDate()}</span>
                    <span className="text-xs opacity-75">{dd.count === 0 ? '—' : viewMode === 'time' ? formatTime(dd.totalMinutes) : `${cd.count}/${dd.count}`}</span>
                    {cd.isFullyComplete && <span className="absolute top-1 right-1 text-xs">✓</span>}
                  </button>
                  {hoveredDate?.getTime() === date.getTime() && <CalendarTooltip date={date} breakdown={dd.breakdown} viewMode={viewMode} enabledFrequencies={calendarFrequencies} />}
                </div>
              );
            })}</div>
            <div className="flex items-center justify-center gap-3 mt-6 pt-4 border-t flex-wrap">
              <span className="text-sm text-gray-500">Status:</span>
              <div className="flex items-center gap-1"><div className="w-6 h-6 rounded bg-emerald-300"/><span className="text-xs text-gray-500">Done</span></div>
              <div className="flex items-center gap-1" title={legendLabels.light}><div className="w-6 h-6 rounded bg-emerald-100"/><span className="text-xs text-gray-500">Light</span></div>
              <div className="flex items-center gap-1" title={legendLabels.medium}><div className="w-6 h-6 rounded bg-amber-100"/><span className="text-xs text-gray-500">Medium</span></div>
              <div className="flex items-center gap-1" title={legendLabels.heavy}><div className="w-6 h-6 rounded bg-orange-200"/><span className="text-xs text-gray-500">Heavy</span></div>
              <div className="flex items-center gap-1"><div className="w-6 h-6 rounded bg-red-200"/><span className="text-xs text-gray-500">Peak</span></div>
              {isCalendarFilterActive && <div className="flex items-center gap-1 ml-2 pl-2 border-l"><div className="w-6 h-6 rounded bg-gray-100"/><span className="text-xs text-gray-500">No tasks (filtered)</span></div>}
            </div>
          </div>
          <div className="bg-white rounded-xl shadow-sm p-6">
            <h3 className="text-lg font-semibold text-gray-800 mb-1">{selectedDate.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}</h3>
            {isCalendarFilterActive && selectedDateInfo.dateData.count === 0 && selectedDateInfo.dateData.countUnfiltered > 0 && (
              <p className="text-xs text-amber-600 mb-2">{selectedDateInfo.dateData.countUnfiltered} chore{selectedDateInfo.dateData.countUnfiltered !== 1 ? 's' : ''} hidden by filter</p>
            )}
            <div className="mb-2"><div className="flex justify-between text-sm text-gray-500 mb-1"><span>{selectedDateInfo.completedData.count} of {selectedDateInfo.dateData.count} complete</span><span>{selectedDateInfo.progressPct}%</span></div><div className="h-2 bg-gray-200 rounded-full overflow-hidden"><div className="h-full bg-emerald-500 transition-all" style={{ width: `${selectedDateInfo.progressPct}%` }}/></div></div>
            <div className="mb-4 p-3 bg-gray-50 rounded-lg"><div className="grid grid-cols-3 gap-2 text-center">{viewMode === 'time' ? <><div><div className="text-lg font-semibold text-gray-800">{formatTime(selectedDateInfo.dateData.totalMinutes)}</div><div className="text-xs text-gray-500">Total</div></div><div><div className="text-lg font-semibold text-emerald-600">{formatTime(selectedDateInfo.completedData.minutes)}</div><div className="text-xs text-gray-500">Done</div></div><div><div className="text-lg font-semibold text-amber-600">{formatTime(selectedDateInfo.dateData.totalMinutes - selectedDateInfo.completedData.minutes)}</div><div className="text-xs text-gray-500">Left</div></div></> : <><div><div className="text-lg font-semibold text-gray-800">{selectedDateInfo.dateData.count}</div><div className="text-xs text-gray-500">Total</div></div><div><div className="text-lg font-semibold text-emerald-600">{selectedDateInfo.completedData.count}</div><div className="text-xs text-gray-500">Done</div></div><div><div className="text-lg font-semibold text-amber-600">{selectedDateInfo.dateData.count - selectedDateInfo.completedData.count}</div><div className="text-xs text-gray-500">Left</div></div></>}</div></div>
            <div className="space-y-4 max-h-[420px] overflow-y-auto">
              {selectedDateInfo.dateData.count === 0 ? (
                <div className="text-center py-8 text-gray-400">
                  <svg className="w-12 h-12 mx-auto mb-2 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/></svg>
                  <p className="text-sm">{isCalendarFilterActive ? 'No tasks match current filter' : 'No tasks scheduled'}</p>
                </div>
              ) : (
                <>
                  <div>
                    <h4 className="text-xs font-semibold text-amber-600 uppercase tracking-wide mb-2 flex items-center justify-between"><span className="flex items-center gap-2"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z"/></svg>Morning</span><span className="text-gray-400 font-normal">{viewMode === 'time' ? `${formatTime(selectedDateInfo.am.completedMinutes)} / ${formatTime(selectedDateInfo.am.totalMinutes)}` : `${selectedDateInfo.am.completedCount} / ${selectedDateInfo.am.chores.length}`}</span></h4>
                    <ul className="space-y-1">{selectedDateInfo.am.chores.map(c => <ChoreItem key={c.id} chore={c} completed={isTaskCompleted(c.id)} onToggle={toggleTask} onEdit={handleEditFromCalendar} />)}{!selectedDateInfo.am.chores.length && <li className="text-sm text-gray-400 italic p-2">No morning tasks</li>}</ul>
                  </div>
                  <div>
                    <h4 className="text-xs font-semibold text-indigo-600 uppercase tracking-wide mb-2 flex items-center justify-between"><span className="flex items-center gap-2"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"/></svg>Evening</span><span className="text-gray-400 font-normal">{viewMode === 'time' ? `${formatTime(selectedDateInfo.pm.completedMinutes)} / ${formatTime(selectedDateInfo.pm.totalMinutes)}` : `${selectedDateInfo.pm.completedCount} / ${selectedDateInfo.pm.chores.length}`}</span></h4>
                    <ul className="space-y-1">{selectedDateInfo.pm.chores.map(c => <ChoreItem key={c.id} chore={c} completed={isTaskCompleted(c.id)} onToggle={toggleTask} onEdit={handleEditFromCalendar} />)}{!selectedDateInfo.pm.chores.length && <li className="text-sm text-gray-400 italic p-2">No evening tasks</li>}</ul>
                  </div>
                </>
              )}
              <div className="pt-4 border-t"><h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Categories</h4><div className="flex flex-wrap gap-3 text-xs">{ALL_FREQUENCIES.map(c => <span key={c} className={`flex items-center gap-1 ${!calendarFrequencies.has(c) ? 'opacity-40' : ''}`}><span className={`w-2 h-2 rounded-full ${getCategoryColor(c)}`}/>{getCategoryLabel(c)}</span>)}</div></div>
            </div>
          </div>
        </div>}

        {activeTab === 'manage' && <div className="bg-white rounded-xl shadow-sm p-6">
          <div className="flex flex-col gap-4 mb-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <h2 className="text-xl font-semibold text-gray-800">All Chores</h2>
              <div className="flex items-center gap-3">
                <div className="relative flex-grow sm:flex-grow-0"><svg className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg><input type="text" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="Search..." className="w-full sm:w-64 pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"/>{searchQuery && <button onClick={() => setSearchQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/></svg></button>}</div>
                <button onClick={() => openAddModal('daily')} className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 flex items-center gap-2 whitespace-nowrap focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4"/></svg>Add</button>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-3 pt-3 border-t">
              <div className="flex items-center gap-2"><label className="text-sm text-gray-500">Type:</label><select value={frequencyFilter} onChange={e => setFrequencyFilter(e.target.value)} className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"><option value="all">All</option><option value="daily">Daily</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option><option value="quarterly">Quarterly</option><option value="adhoc">Ad Hoc</option></select></div>
              <div className="flex items-center gap-2"><label className="text-sm text-gray-500">Time:</label><select value={timeOfDayFilter} onChange={e => setTimeOfDayFilter(e.target.value)} className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"><option value="all">All</option><option value="AM">AM</option><option value="PM">PM</option></select></div>
              <div className="flex items-center gap-2 ml-auto"><label className="text-sm text-gray-500">Sort:</label><select value={sortBy} onChange={e => setSortBy(e.target.value)} className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"><option value="name">Name</option><option value="time">Duration</option><option value="ampm">AM/PM</option></select><button onClick={() => setSortDirection(p => p === 'asc' ? 'desc' : 'asc')} className="p-1.5 border border-gray-300 rounded-lg hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500">{sortDirection === 'asc' ? <svg className="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4h13M3 8h9m-9 4h6m4 0l4-4m0 0l4 4m-4-4v12"/></svg> : <svg className="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4h13M3 8h9m-9 4h9m5-4v12m0 0l-4-4m4 4l4-4"/></svg>}</button></div>
            </div>
            <div className="flex flex-wrap items-center gap-2 pt-3 border-t">
              <span className="text-sm text-gray-500">Data:</span>
              <button onClick={exportData} className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 flex items-center gap-1.5"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg>Export</button>
              <label className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 flex items-center gap-1.5 cursor-pointer"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"/></svg>Import<input type="file" accept=".json" onChange={importData} className="sr-only"/></label>
              <button onClick={clearAllData} className="px-3 py-1.5 text-sm border border-red-300 text-red-600 rounded-lg hover:bg-red-50 flex items-center gap-1.5"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>Reset</button>
              <div className="ml-auto"><SaveIndicator status={saveStatus} /></div>
            </div>
          </div>
          {(searchQuery || frequencyFilter !== 'all' || timeOfDayFilter !== 'all') && <div className="mb-4 text-sm text-gray-500">Showing {totalFiltered} of {totalChores} <button onClick={() => { setSearchQuery(''); setFrequencyFilter('all'); setTimeOfDayFilter('all'); }} className="ml-2 text-blue-500 hover:text-blue-600">Clear</button></div>}
          {totalFiltered === 0 && (searchQuery || frequencyFilter !== 'all' || timeOfDayFilter !== 'all') && <div className="text-center py-12"><svg className="w-16 h-16 mx-auto text-gray-300 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg><h3 className="text-lg font-medium text-gray-600 mb-1">No chores found</h3><p className="text-gray-400">Try adjusting filters</p></div>}
          <FrequencySection title="Daily" list={filteredChores.daily} frequency="daily" color="bg-emerald-400" total={chores.daily.length} searchQuery={searchQuery} timeOfDayFilter={timeOfDayFilter} frequencyFilter={frequencyFilter} onAdd={openAddModal} onEdit={setEditingChore} onDelete={deleteChore} />
          <FrequencySection title="Weekly" list={filteredChores.weekly} frequency="weekly" color="bg-blue-400" total={chores.weekly.length} searchQuery={searchQuery} timeOfDayFilter={timeOfDayFilter} frequencyFilter={frequencyFilter} onAdd={openAddModal} onEdit={setEditingChore} onDelete={deleteChore} />
          <FrequencySection title="Monthly" list={filteredChores.monthly} frequency="monthly" color="bg-purple-400" total={chores.monthly.length} searchQuery={searchQuery} timeOfDayFilter={timeOfDayFilter} frequencyFilter={frequencyFilter} onAdd={openAddModal} onEdit={setEditingChore} onDelete={deleteChore} />
          <FrequencySection title="Quarterly" list={filteredChores.quarterly} frequency="quarterly" color="bg-orange-400" total={chores.quarterly.length} searchQuery={searchQuery} timeOfDayFilter={timeOfDayFilter} frequencyFilter={frequencyFilter} onAdd={openAddModal} onEdit={setEditingChore} onDelete={deleteChore} />
          <FrequencySection title="Ad Hoc" list={filteredChores.adhoc} frequency="adhoc" color="bg-red-400" total={chores.adhoc.length} searchQuery={searchQuery} timeOfDayFilter={timeOfDayFilter} frequencyFilter={frequencyFilter} onAdd={openAddModal} onEdit={setEditingChore} onDelete={deleteChore} />
        </div>}
      </div>
      {editingChore && <EditModal chore={editingChore} onClose={() => setEditingChore(null)} onSave={updateChore} />}
      {showAddModal && <AddModal defaultFrequency={addToFrequency} onClose={() => setShowAddModal(false)} onAdd={addChore} />}
    </div>
  );
}
