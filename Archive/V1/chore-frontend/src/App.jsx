import React, { useState, useMemo, useEffect, useCallback, memo } from 'react';

// =============================================================================
// API SERVICE (inlined)
// =============================================================================

const API_BASE = 'http://localhost:8000';

async function apiRequest(endpoint, options = {}) {
  const url = `${API_BASE}${endpoint}`;
  const config = { headers: { 'Content-Type': 'application/json', ...options.headers }, ...options };
  try {
    const response = await fetch(url, config);
    if (response.status === 204) return null;
    const data = await response.json();
    if (!response.ok) { const error = new Error(data.detail || 'API request failed'); error.status = response.status; throw error; }
    return data;
  } catch (error) {
    if (error.status) throw error;
    throw new Error(`Network error: ${error.message}`);
  }
}

const formatDateISO = (date) => typeof date === 'string' ? date : date.toISOString().split('T')[0];

const api = {
  chores: {
    list: (filters = {}) => {
      const params = new URLSearchParams();
      if (filters.frequency) params.append('frequency', filters.frequency);
      if (filters.time_of_day) params.append('time_of_day', filters.time_of_day);
      if (filters.search) params.append('search', filters.search);
      const query = params.toString();
      return apiRequest(`/chores${query ? `?${query}` : ''}`);
    },
    create: (chore) => apiRequest('/chores', {
      method: 'POST', body: JSON.stringify({
        name: chore.name, frequency: chore.frequency, time_of_day: chore.time || chore.time_of_day || 'AM',
        minutes: chore.minutes || 10, day_of_week: chore.dayOfWeek ?? chore.day_of_week,
        week_of_month: chore.weekOfMonth ?? chore.week_of_month, month_of_quarter: chore.monthOfQuarter ?? chore.month_of_quarter,
        scheduled_date: chore.scheduledDate || chore.scheduled_date,
      })
    }),
    update: (id, updates) => {
      const payload = {};
      if (updates.name !== undefined) payload.name = updates.name;
      if (updates.frequency !== undefined) payload.frequency = updates.frequency;
      if (updates.time !== undefined) payload.time_of_day = updates.time;
      if (updates.minutes !== undefined) payload.minutes = updates.minutes;
      if (updates.dayOfWeek !== undefined) payload.day_of_week = updates.dayOfWeek;
      if (updates.weekOfMonth !== undefined) payload.week_of_month = updates.weekOfMonth;
      if (updates.monthOfQuarter !== undefined) payload.month_of_quarter = updates.monthOfQuarter;
      if (updates.scheduledDate !== undefined) payload.scheduled_date = updates.scheduledDate;
      return apiRequest(`/chores/${id}`, { method: 'PUT', body: JSON.stringify(payload) });
    },
    delete: (id) => apiRequest(`/chores/${id}`, { method: 'DELETE' }),
    getForDate: (date) => apiRequest(`/chores/date/${formatDateISO(date)}`),
  },
  calendar: {
    getMonthSummary: (year, month) => apiRequest(`/calendar/month/${year}/${month}`),
  },
  completions: {
    toggle: (choreId, date) => apiRequest('/completions/toggle', { method: 'POST', body: JSON.stringify({ chore_id: choreId, completed_date: formatDateISO(date) }) }),
  },
  data: {
    export: () => apiRequest('/export'),
    import: (data) => apiRequest('/import', { method: 'POST', body: JSON.stringify(data) }),
    reset: () => apiRequest('/reset', { method: 'POST' }),
  },
};

// =============================================================================
// CONSTANTS & HELPERS
// =============================================================================

const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const dayNamesFull = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const formatTime = (m) => m < 60 ? `${m}m` : m % 60 > 0 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${Math.floor(m / 60)}h`;
const getCategoryColor = (c) => ({ daily: 'bg-emerald-400', weekly: 'bg-blue-400', monthly: 'bg-purple-400', quarterly: 'bg-orange-400', adhoc: 'bg-red-400' }[c] || 'bg-gray-400');
const getCategoryLabel = (c) => ({ daily: 'Daily', weekly: 'Weekly', monthly: 'Monthly', quarterly: 'Quarterly', adhoc: 'Ad Hoc' }[c] || c);

const transformChore = (c) => ({
  id: c.id, name: c.name, frequency: c.frequency, time: c.time_of_day, minutes: c.minutes,
  dayOfWeek: c.day_of_week, weekOfMonth: c.week_of_month, monthOfQuarter: c.month_of_quarter,
  scheduledDate: c.scheduled_date, category: c.frequency, isCompleted: c.is_completed,
});

// =============================================================================
// SUB-COMPONENTS
// =============================================================================

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
      <button onClick={() => setOpen(!open)} className="p-1 text-gray-400 hover:text-gray-600 rounded">
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

const ChoreItem = memo(({ chore, onToggle, onEdit }) => {
  const completed = chore.isCompleted;
  return (
    <li className={`text-sm flex items-center gap-2 p-2 rounded-lg transition-all ${completed ? 'bg-gray-50 text-gray-400' : 'hover:bg-gray-50 text-gray-700'}`}>
      <button onClick={() => onToggle(chore.id)} className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 ${completed ? 'bg-emerald-500 border-emerald-500' : 'border-gray-300 hover:border-gray-400'}`}>
        {completed && <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
      </button>
      <span className={`w-2 h-2 rounded-full flex-shrink-0 ${getCategoryColor(chore.category)}`} />
      <span onClick={() => onToggle(chore.id)} className={`flex-grow cursor-pointer ${completed ? 'line-through' : ''}`}>{chore.name}</span>
      <span className={`text-xs px-2 py-0.5 rounded-full ${completed ? 'bg-gray-100 text-gray-400' : 'bg-gray-100 text-gray-500'}`}>{chore.minutes}m</span>
      <ChoreMenu onEdit={() => onEdit(chore)} />
    </li>
  );
});

const ManageChoreItem = memo(({ chore, searchQuery, onEdit, onDelete }) => {
  const desc = chore.frequency === 'weekly' ? dayNamesFull[chore.dayOfWeek]
    : chore.frequency === 'monthly' ? `Week ${chore.weekOfMonth}, ${dayNamesFull[chore.dayOfWeek]}`
      : chore.frequency === 'quarterly' ? `M${chore.monthOfQuarter}, W${chore.weekOfMonth}, ${dayNamesFull[chore.dayOfWeek]}`
        : chore.frequency === 'adhoc' && chore.scheduledDate ? new Date(chore.scheduledDate + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
          : null;
  return (
    <div className="flex items-center gap-3 p-3 bg-white rounded-lg border border-gray-200 hover:border-gray-300">
      <span className={`w-2 h-2 rounded-full flex-shrink-0 ${getCategoryColor(chore.frequency)}`} />
      <div className="flex-grow min-w-0">
        <div className="font-medium text-gray-800 truncate"><HighlightedText text={chore.name} query={searchQuery} /></div>
        <div className="text-xs text-gray-500 flex items-center gap-2 flex-wrap">
          <span>{chore.time}</span><span>•</span><span>{chore.minutes}m</span>
          {desc && <><span>•</span><span>{desc}</span></>}
        </div>
      </div>
      <button onClick={() => onEdit(chore)} className="p-1.5 text-gray-400 hover:text-blue-500 hover:bg-blue-50 rounded">
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
      </button>
      <button onClick={() => onDelete(chore.id)} className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded">
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
      </button>
    </div>
  );
});

const FrequencySection = memo(({ title, list, color, total, searchQuery, timeOfDayFilter, frequencyFilter, onAdd, onEdit, onDelete }) => {
  const frequency = title.toLowerCase().replace(' ', '');
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
          <button onClick={() => onAdd(frequency === 'ad hoc' ? 'adhoc' : frequency)} className="text-sm text-blue-500 hover:text-blue-600 flex items-center gap-1">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>Add
          </button>
        )}
      </div>
      <div className="space-y-2">
        {list.map(c => <ManageChoreItem key={c.id} chore={c} searchQuery={searchQuery} onEdit={onEdit} onDelete={onDelete} />)}
        {!list.length && !searchQuery && frequencyFilter === 'all' && timeOfDayFilter === 'all' && <div className="text-sm text-gray-400 italic p-3 bg-gray-50 rounded-lg">No chores</div>}
      </div>
    </div>
  );
});

const SaveIndicator = memo(({ status }) => (
  <span className={`text-xs flex items-center gap-1 ${status === 'saved' ? 'text-green-600' : status === 'saving' ? 'text-amber-600' : status === 'error' ? 'text-red-600' : 'text-gray-400'}`}>
    {status === 'saved' && '✓ Saved'}{status === 'saving' && '⟳ Saving...'}{status === 'error' && '✕ Error'}
  </span>
));

const EditModal = memo(({ chore, onClose, onSave, isSaving }) => {
  const [name, setName] = useState(chore.name);
  const [time, setTime] = useState(chore.time);
  const [minutes, setMinutes] = useState(chore.minutes);
  const [frequency, setFrequency] = useState(chore.frequency);
  const [dayOfWeek, setDayOfWeek] = useState(chore.dayOfWeek ?? 6);
  const [weekOfMonth, setWeekOfMonth] = useState(chore.weekOfMonth ?? 1);
  const [monthOfQuarter, setMonthOfQuarter] = useState(chore.monthOfQuarter ?? 1);
  const [scheduledDate, setScheduledDate] = useState(chore.scheduledDate || '');
  const valid = name.trim() && (frequency !== 'adhoc' || scheduledDate);

  const handleSave = () => {
    if (!valid || isSaving) return;
    onSave({ ...chore, name: name.trim(), time, minutes: parseInt(minutes) || 5, frequency, dayOfWeek, weekOfMonth, monthOfQuarter, scheduledDate }, chore.frequency, frequency);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6 max-h-[90vh] overflow-y-auto">
        <h3 className="text-lg font-semibold text-gray-800 mb-4">Edit Chore</h3>
        <div className="space-y-4">
          <div><label className="block text-sm font-medium text-gray-700 mb-1">Name</label><input type="text" value={name} onChange={e => setName(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg" /></div>
          <div className="grid grid-cols-2 gap-4">
            <div><label className="block text-sm font-medium text-gray-700 mb-1">Time</label><select value={time} onChange={e => setTime(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg">{['AM', 'PM'].map(t => <option key={t} value={t}>{t}</option>)}</select></div>
            <div><label className="block text-sm font-medium text-gray-700 mb-1">Minutes</label><input type="number" value={minutes} onChange={e => setMinutes(e.target.value)} min="1" className="w-full px-3 py-2 border border-gray-300 rounded-lg" /></div>
          </div>
          <div><label className="block text-sm font-medium text-gray-700 mb-1">Frequency</label><select value={frequency} onChange={e => setFrequency(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg">{['daily', 'weekly', 'monthly', 'quarterly', 'adhoc'].map(f => <option key={f} value={f}>{getCategoryLabel(f)}</option>)}</select></div>
          {frequency === 'weekly' && <div><label className="block text-sm font-medium text-gray-700 mb-1">Day</label><select value={dayOfWeek} onChange={e => setDayOfWeek(+e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg">{dayNamesFull.map((d, i) => <option key={i} value={i}>{d}</option>)}</select></div>}
          {frequency === 'monthly' && <><div><label className="block text-sm font-medium text-gray-700 mb-1">Week</label><select value={weekOfMonth} onChange={e => setWeekOfMonth(+e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg">{[1, 2, 3, 4].map(w => <option key={w} value={w}>Week {w}</option>)}</select></div><div><label className="block text-sm font-medium text-gray-700 mb-1">Day</label><select value={dayOfWeek} onChange={e => setDayOfWeek(+e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg">{dayNamesFull.map((d, i) => <option key={i} value={i}>{d}</option>)}</select></div></>}
          {frequency === 'quarterly' && <><div><label className="block text-sm font-medium text-gray-700 mb-1">Month of Quarter</label><select value={monthOfQuarter} onChange={e => setMonthOfQuarter(+e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg">{[1, 2, 3].map(m => <option key={m} value={m}>{['1st', '2nd', '3rd'][m - 1]}</option>)}</select></div><div><label className="block text-sm font-medium text-gray-700 mb-1">Week</label><select value={weekOfMonth} onChange={e => setWeekOfMonth(+e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg">{[1, 2, 3, 4].map(w => <option key={w} value={w}>Week {w}</option>)}</select></div><div><label className="block text-sm font-medium text-gray-700 mb-1">Day</label><select value={dayOfWeek} onChange={e => setDayOfWeek(+e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg">{dayNamesFull.map((d, i) => <option key={i} value={i}>{d}</option>)}</select></div></>}
          {frequency === 'adhoc' && <div><label className="block text-sm font-medium text-gray-700 mb-1">Date *</label><input type="date" value={scheduledDate} onChange={e => setScheduledDate(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg" />{!scheduledDate && <p className="text-xs text-red-500 mt-1">Required</p>}</div>}
        </div>
        <div className="flex gap-3 mt-6"><button onClick={onClose} disabled={isSaving} className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 disabled:opacity-50">Cancel</button><button onClick={handleSave} disabled={!valid || isSaving} className="flex-1 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50">{isSaving ? 'Saving...' : 'Save'}</button></div>
      </div>
    </div>
  );
});

const AddModal = memo(({ defaultFrequency, onClose, onAdd, isSaving }) => {
  const [name, setName] = useState('');
  const [time, setTime] = useState('AM');
  const [minutes, setMinutes] = useState(10);
  const [frequency, setFrequency] = useState(defaultFrequency);
  const [dayOfWeek, setDayOfWeek] = useState(6);
  const [weekOfMonth, setWeekOfMonth] = useState(1);
  const [monthOfQuarter, setMonthOfQuarter] = useState(1);
  const [scheduledDate, setScheduledDate] = useState('');
  const valid = name.trim() && (frequency !== 'adhoc' || scheduledDate);

  const handleAdd = () => { if (!valid || isSaving) return; onAdd({ name: name.trim(), time, minutes: parseInt(minutes) || 5, frequency, dayOfWeek, weekOfMonth, monthOfQuarter, scheduledDate }); };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6 max-h-[90vh] overflow-y-auto">
        <h3 className="text-lg font-semibold text-gray-800 mb-4">Add Chore</h3>
        <div className="space-y-4">
          <div><label className="block text-sm font-medium text-gray-700 mb-1">Name</label><input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="Chore name" className="w-full px-3 py-2 border border-gray-300 rounded-lg" /></div>
          <div className="grid grid-cols-2 gap-4">
            <div><label className="block text-sm font-medium text-gray-700 mb-1">Time</label><select value={time} onChange={e => setTime(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg">{['AM', 'PM'].map(t => <option key={t} value={t}>{t}</option>)}</select></div>
            <div><label className="block text-sm font-medium text-gray-700 mb-1">Minutes</label><input type="number" value={minutes} onChange={e => setMinutes(e.target.value)} min="1" className="w-full px-3 py-2 border border-gray-300 rounded-lg" /></div>
          </div>
          <div><label className="block text-sm font-medium text-gray-700 mb-1">Frequency</label><select value={frequency} onChange={e => setFrequency(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg">{['daily', 'weekly', 'monthly', 'quarterly', 'adhoc'].map(f => <option key={f} value={f}>{getCategoryLabel(f)}</option>)}</select></div>
          {frequency === 'weekly' && <div><label className="block text-sm font-medium text-gray-700 mb-1">Day</label><select value={dayOfWeek} onChange={e => setDayOfWeek(+e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg">{dayNamesFull.map((d, i) => <option key={i} value={i}>{d}</option>)}</select></div>}
          {frequency === 'monthly' && <><div><label className="block text-sm font-medium text-gray-700 mb-1">Week</label><select value={weekOfMonth} onChange={e => setWeekOfMonth(+e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg">{[1, 2, 3, 4].map(w => <option key={w} value={w}>Week {w}</option>)}</select></div><div><label className="block text-sm font-medium text-gray-700 mb-1">Day</label><select value={dayOfWeek} onChange={e => setDayOfWeek(+e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg">{dayNamesFull.map((d, i) => <option key={i} value={i}>{d}</option>)}</select></div></>}
          {frequency === 'quarterly' && <><div><label className="block text-sm font-medium text-gray-700 mb-1">Month of Quarter</label><select value={monthOfQuarter} onChange={e => setMonthOfQuarter(+e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg">{[1, 2, 3].map(m => <option key={m} value={m}>{['1st', '2nd', '3rd'][m - 1]}</option>)}</select></div><div><label className="block text-sm font-medium text-gray-700 mb-1">Week</label><select value={weekOfMonth} onChange={e => setWeekOfMonth(+e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg">{[1, 2, 3, 4].map(w => <option key={w} value={w}>Week {w}</option>)}</select></div><div><label className="block text-sm font-medium text-gray-700 mb-1">Day</label><select value={dayOfWeek} onChange={e => setDayOfWeek(+e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg">{dayNamesFull.map((d, i) => <option key={i} value={i}>{d}</option>)}</select></div></>}
          {frequency === 'adhoc' && <div><label className="block text-sm font-medium text-gray-700 mb-1">Date *</label><input type="date" value={scheduledDate} onChange={e => setScheduledDate(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg" />{!scheduledDate && <p className="text-xs text-red-500 mt-1">Required</p>}</div>}
        </div>
        <div className="flex gap-3 mt-6"><button onClick={onClose} disabled={isSaving} className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 disabled:opacity-50">Cancel</button><button onClick={handleAdd} disabled={!valid || isSaving} className="flex-1 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50">{isSaving ? 'Adding...' : 'Add'}</button></div>
      </div>
    </div>
  );
});

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export default function ChoreDashboard() {
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [saveStatus, setSaveStatus] = useState('idle');
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [viewMode, setViewMode] = useState('time');
  const [selectedDateData, setSelectedDateData] = useState(null);
  const [monthSummary, setMonthSummary] = useState({});
  const [allChores, setAllChores] = useState([]);
  const [activeTab, setActiveTab] = useState('calendar');
  const [searchQuery, setSearchQuery] = useState('');
  const [frequencyFilter, setFrequencyFilter] = useState('all');
  const [timeOfDayFilter, setTimeOfDayFilter] = useState('all');
  const [sortBy, setSortBy] = useState('name');
  const [sortDirection, setSortDirection] = useState('asc');
  const [editingChore, setEditingChore] = useState(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [addToFrequency, setAddToFrequency] = useState('daily');
  const [isSaving, setIsSaving] = useState(false);

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  // Data fetching
  const fetchSelectedDateData = useCallback(async (date) => {
    try {
      const data = await api.chores.getForDate(date);
      const transformedChores = data.chores.map(transformChore);
      setSelectedDateData({
        chores: transformedChores, summary: data.summary,
        byTime: { AM: transformedChores.filter(c => c.time === 'AM'), PM: transformedChores.filter(c => c.time === 'PM') }
      });
    } catch (err) { console.error('Failed to fetch date data:', err); setError(err.message); }
  }, []);

  const fetchMonthSummary = useCallback(async (year, month) => {
    try { const data = await api.calendar.getMonthSummary(year, month + 1); setMonthSummary(data); }
    catch (err) { console.error('Failed to fetch month summary:', err); }
  }, []);

  const fetchAllChores = useCallback(async () => {
    try { const data = await api.chores.list(); setAllChores(data.map(c => ({ ...transformChore(c), time: c.time_of_day }))); }
    catch (err) { console.error('Failed to fetch chores:', err); setError(err.message); }
  }, []);

  useEffect(() => {
    const load = async () => {
      setIsLoading(true); setError(null);
      try { await Promise.all([fetchSelectedDateData(selectedDate), fetchMonthSummary(year, month), fetchAllChores()]); }
      catch (err) { setError(err.message); }
      setIsLoading(false);
    };
    load();
  }, []);

  useEffect(() => { if (!isLoading) fetchSelectedDateData(selectedDate); }, [selectedDate]);
  useEffect(() => { if (!isLoading) fetchMonthSummary(year, month); }, [year, month]);
  useEffect(() => { if (activeTab === 'manage' && !isLoading) fetchAllChores(); }, [activeTab]);

  // Actions
  const toggleTask = useCallback(async (choreId) => {
    setSelectedDateData(prev => {
      if (!prev) return prev;
      const updated = prev.chores.map(c => c.id === choreId ? { ...c, isCompleted: !c.isCompleted } : c);
      const completedCount = updated.filter(c => c.isCompleted).length;
      const completedMinutes = updated.filter(c => c.isCompleted).reduce((s, c) => s + c.minutes, 0);
      return {
        ...prev, chores: updated, byTime: { AM: updated.filter(c => c.time === 'AM'), PM: updated.filter(c => c.time === 'PM') },
        summary: { ...prev.summary, completed_count: completedCount, completed_minutes: completedMinutes, remaining_count: prev.summary.total_count - completedCount, remaining_minutes: prev.summary.total_minutes - completedMinutes, progress_percent: prev.summary.total_count > 0 ? Math.round((completedCount / prev.summary.total_count) * 100) : 0 }
      };
    });
    try { await api.completions.toggle(choreId, formatDateISO(selectedDate)); fetchMonthSummary(year, month); }
    catch (err) { console.error('Failed to toggle:', err); fetchSelectedDateData(selectedDate); }
  }, [selectedDate, year, month]);

  const addChore = useCallback(async (choreData) => {
    setIsSaving(true); setSaveStatus('saving');
    try { await api.chores.create(choreData); setSaveStatus('saved'); setShowAddModal(false); await Promise.all([fetchAllChores(), fetchSelectedDateData(selectedDate), fetchMonthSummary(year, month)]); }
    catch (err) { console.error('Failed to add:', err); setSaveStatus('error'); alert(`Failed: ${err.message}`); }
    setIsSaving(false);
  }, [selectedDate, year, month]);

  const updateChore = useCallback(async (chore) => {
    setIsSaving(true); setSaveStatus('saving');
    try { await api.chores.update(chore.id, chore); setSaveStatus('saved'); setEditingChore(null); await Promise.all([fetchAllChores(), fetchSelectedDateData(selectedDate), fetchMonthSummary(year, month)]); }
    catch (err) { console.error('Failed to update:', err); setSaveStatus('error'); alert(`Failed: ${err.message}`); }
    setIsSaving(false);
  }, [selectedDate, year, month]);

  const deleteChore = useCallback(async (id) => {
    if (!confirm('Delete this chore?')) return;
    setSaveStatus('saving');
    try { await api.chores.delete(id); setSaveStatus('saved'); await Promise.all([fetchAllChores(), fetchSelectedDateData(selectedDate), fetchMonthSummary(year, month)]); }
    catch (err) { console.error('Failed to delete:', err); setSaveStatus('error'); alert(`Failed: ${err.message}`); }
  }, [selectedDate, year, month]);

  const exportData = useCallback(async () => {
    try { const data = await api.data.export(); const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `chore-export-${new Date().toISOString().split('T')[0]}.json`; a.click(); }
    catch (err) { alert(`Failed: ${err.message}`); }
  }, []);

  const importData = useCallback(async (e) => {
    const file = e.target.files?.[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => { try { await api.data.import(JSON.parse(ev.target?.result)); alert('Imported!'); await Promise.all([fetchAllChores(), fetchSelectedDateData(selectedDate), fetchMonthSummary(year, month)]); } catch (err) { alert(`Failed: ${err.message}`); } };
    reader.readAsText(file); e.target.value = '';
  }, [selectedDate, year, month]);

  const clearAllData = useCallback(async () => {
    if (!confirm('Reset all data?')) return;
    try { await api.data.reset(); alert('Reset!'); await Promise.all([fetchAllChores(), fetchSelectedDateData(selectedDate), fetchMonthSummary(year, month)]); }
    catch (err) { alert(`Failed: ${err.message}`); }
  }, [selectedDate, year, month]);

  // Computed values
  const filteredChores = useMemo(() => {
    const filterAndSort = (list) => {
      let f = list;
      if (searchQuery.trim()) f = f.filter(c => c.name.toLowerCase().includes(searchQuery.toLowerCase()));
      if (timeOfDayFilter !== 'all') f = f.filter(c => c.time === timeOfDayFilter);
      return [...f].sort((a, b) => { let cmp = sortBy === 'name' ? a.name.localeCompare(b.name) : sortBy === 'time' ? a.minutes - b.minutes : a.time.localeCompare(b.time); return sortDirection === 'asc' ? cmp : -cmp; });
    };
    const byFreq = { daily: [], weekly: [], monthly: [], quarterly: [], adhoc: [] };
    allChores.forEach(c => { if (byFreq[c.frequency]) byFreq[c.frequency].push(c); });
    const show = (f) => frequencyFilter === 'all' || frequencyFilter === f;
    return { daily: show('daily') ? filterAndSort(byFreq.daily) : [], weekly: show('weekly') ? filterAndSort(byFreq.weekly) : [], monthly: show('monthly') ? filterAndSort(byFreq.monthly) : [], quarterly: show('quarterly') ? filterAndSort(byFreq.quarterly) : [], adhoc: show('adhoc') ? filterAndSort(byFreq.adhoc) : [] };
  }, [allChores, searchQuery, timeOfDayFilter, frequencyFilter, sortBy, sortDirection]);

  const choreCounts = useMemo(() => { const c = { daily: 0, weekly: 0, monthly: 0, quarterly: 0, adhoc: 0 }; allChores.forEach(ch => { if (c[ch.frequency] !== undefined) c[ch.frequency]++; }); return c; }, [allChores]);
  const totalFiltered = Object.values(filteredChores).reduce((s, l) => s + l.length, 0);
  const calendarDays = useMemo(() => { const first = new Date(year, month, 1); const days = Array(first.getDay()).fill(null); for (let i = 1; i <= new Date(year, month + 1, 0).getDate(); i++) days.push(new Date(year, month, i)); return days; }, [year, month]);

  const dynamicThresholds = useMemo(() => {
    const sums = Object.values(monthSummary);
    if (!sums.length) return { count: { light: 5, medium: 10, heavy: 15 }, time: { light: 30, medium: 60, heavy: 90 } };
    const counts = sums.map(s => s.total_count - (s.completed_count || 0)).filter(c => c > 0);
    const mins = sums.map(s => s.total_minutes - (s.completed_minutes || 0)).filter(m => m > 0);
    if (!counts.length) return { count: { light: 5, medium: 10, heavy: 15 }, time: { light: 30, medium: 60, heavy: 90 } };
    const [minC, maxC, minM, maxM] = [Math.min(...counts), Math.max(...counts), Math.min(...mins), Math.max(...mins)];
    return { count: { light: minC + (maxC - minC) * 0.25, medium: minC + (maxC - minC) * 0.5, heavy: minC + (maxC - minC) * 0.75 }, time: { light: minM + (maxM - minM) * 0.25, medium: minM + (maxM - minM) * 0.5, heavy: minM + (maxM - minM) * 0.75 } };
  }, [monthSummary]);

  const selectedDateInfo = useMemo(() => {
    if (!selectedDateData) return { chores: [], summary: { total_count: 0, completed_count: 0, total_minutes: 0, completed_minutes: 0, remaining_count: 0, remaining_minutes: 0, progress_percent: 0 }, byTime: { AM: [], PM: [] }, progressPct: 0, am: { chores: [], completedCount: 0, completedMinutes: 0, totalMinutes: 0 }, pm: { chores: [], completedCount: 0, completedMinutes: 0, totalMinutes: 0 } };
    const { chores, summary, byTime } = selectedDateData;
    const [amDone, pmDone] = [byTime.AM.filter(c => c.isCompleted), byTime.PM.filter(c => c.isCompleted)];
    return { chores, summary, byTime, progressPct: summary.progress_percent || 0, am: { chores: byTime.AM, completedCount: amDone.length, completedMinutes: amDone.reduce((s, c) => s + c.minutes, 0), totalMinutes: byTime.AM.reduce((s, c) => s + c.minutes, 0) }, pm: { chores: byTime.PM, completedCount: pmDone.length, completedMinutes: pmDone.reduce((s, c) => s + c.minutes, 0), totalMinutes: byTime.PM.reduce((s, c) => s + c.minutes, 0) } };
  }, [selectedDateData]);

  const getHeatColor = useCallback((date) => {
    const s = monthSummary[formatDateISO(date)];
    if (!s) return 'bg-gray-100 text-gray-600';
    if (s.completed_count === s.total_count && s.total_count > 0) return 'bg-emerald-300 text-emerald-900';
    const rem = viewMode === 'count' ? s.total_count - s.completed_count : s.total_minutes - s.completed_minutes;
    const { light, medium, heavy } = dynamicThresholds[viewMode === 'count' ? 'count' : 'time'];
    return rem <= light ? 'bg-emerald-100 text-emerald-800' : rem <= medium ? 'bg-amber-100 text-amber-800' : rem <= heavy ? 'bg-orange-200 text-orange-800' : 'bg-red-200 text-red-800';
  }, [monthSummary, viewMode, dynamicThresholds]);

  const getDateSummary = useCallback((d) => monthSummary[formatDateISO(d)] || { total_count: 0, completed_count: 0, total_minutes: 0, completed_minutes: 0 }, [monthSummary]);
  const navMonth = (d) => setCurrentDate(new Date(year, month + d, 1));
  const isToday = (d) => d && new Date().toDateString() === d.toDateString();
  const isSelected = (d) => d && selectedDate.toDateString() === d.toDateString();

  if (isLoading) return <div className="min-h-screen bg-gray-50 flex items-center justify-center"><div className="text-center"><div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" /><p className="text-gray-600">Loading...</p></div></div>;

  if (error && !selectedDateData && !allChores.length) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="text-center max-w-md p-6">
        <div className="text-red-500 text-5xl mb-4">⚠</div>
        <h2 className="text-xl font-semibold text-gray-800 mb-2">Connection Error</h2>
        <p className="text-gray-600 mb-4">{error}</p>
        <p className="text-sm text-gray-500 mb-4">Make sure the API is running at http://localhost:8000</p>
        <button onClick={() => window.location.reload()} className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600">Retry</button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-6">
      <div className="max-w-6xl mx-auto">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-6">
          <div><h1 className="text-2xl md:text-3xl font-bold text-gray-800 mb-1">Chore Dashboard</h1><p className="text-gray-600 text-sm">{activeTab === 'calendar' ? 'Click any day to see tasks' : 'Manage your chores'}</p></div>
          <div className="mt-4 sm:mt-0 flex items-center gap-2 flex-wrap">
            <div className="flex items-center bg-white rounded-lg p-1 shadow-sm">
              <button onClick={() => setActiveTab('calendar')} className={`px-3 py-1.5 rounded-md text-sm font-medium flex items-center gap-1.5 ${activeTab === 'calendar' ? 'bg-blue-500 text-white' : 'text-gray-500 hover:text-gray-700'}`}><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>Calendar</button>
              <button onClick={() => setActiveTab('manage')} className={`px-3 py-1.5 rounded-md text-sm font-medium flex items-center gap-1.5 ${activeTab === 'manage' ? 'bg-blue-500 text-white' : 'text-gray-500 hover:text-gray-700'}`}><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>Manage</button>
            </div>
            {activeTab === 'calendar' && <div className="flex items-center bg-white rounded-lg p-1 shadow-sm">
              <button onClick={() => setViewMode('time')} className={`px-3 py-1.5 rounded-md text-sm font-medium ${viewMode === 'time' ? 'bg-blue-500 text-white' : 'text-gray-500 hover:text-gray-700'}`}>Time</button>
              <button onClick={() => setViewMode('count')} className={`px-3 py-1.5 rounded-md text-sm font-medium ${viewMode === 'count' ? 'bg-blue-500 text-white' : 'text-gray-500 hover:text-gray-700'}`}>Count</button>
            </div>}
          </div>
        </div>

        {activeTab === 'calendar' && <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 bg-white rounded-xl shadow-sm p-4 md:p-6">
            <div className="flex items-center justify-between mb-6">
              <button onClick={() => navMonth(-1)} className="p-2 hover:bg-gray-100 rounded-lg"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg></button>
              <h2 className="text-lg md:text-xl font-semibold text-gray-800">{monthNames[month]} {year}</h2>
              <button onClick={() => navMonth(1)} className="p-2 hover:bg-gray-100 rounded-lg"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg></button>
            </div>
            <div className="grid grid-cols-7 gap-1 md:gap-2 mb-2">{dayNames.map(d => <div key={d} className="text-center text-xs md:text-sm font-medium text-gray-500 py-2">{d}</div>)}</div>
            <div className="grid grid-cols-7 gap-1 md:gap-2">{calendarDays.map((date, i) => {
              if (!date) return <div key={i} className="aspect-square" />;
              const s = getDateSummary(date);
              return (
                <div key={i} className="aspect-square">
                  <button onClick={() => setSelectedDate(date)} className={`w-full h-full rounded-lg flex flex-col items-center justify-center transition-all ${getHeatColor(date)} ${isSelected(date) ? 'ring-2 ring-blue-500 ring-offset-1' : ''} ${isToday(date) ? 'font-bold' : ''} hover:scale-105 hover:shadow-md`}>
                    <span className="text-sm md:text-lg">{date.getDate()}</span>
                    <span className="text-xs opacity-75 hidden sm:block">{viewMode === 'time' ? formatTime(s.total_minutes || 0) : `${s.completed_count || 0}/${s.total_count || 0}`}</span>
                  </button>
                </div>
              );
            })}</div>
            <div className="flex items-center justify-center gap-2 md:gap-3 mt-6 pt-4 border-t flex-wrap">
              <span className="text-xs md:text-sm text-gray-500">Status:</span>
              {[['bg-emerald-300', 'Done'], ['bg-emerald-100', 'Light'], ['bg-amber-100', 'Medium'], ['bg-orange-200', 'Heavy'], ['bg-red-200', 'Peak']].map(([c, l]) => <div key={l} className="flex items-center gap-1"><div className={`w-4 h-4 md:w-6 md:h-6 rounded ${c}`} /><span className="text-xs text-gray-500">{l}</span></div>)}
            </div>
          </div>
          <div className="bg-white rounded-xl shadow-sm p-4 md:p-6">
            <h3 className="text-lg font-semibold text-gray-800 mb-1">{selectedDate.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}</h3>
            <div className="mb-2"><div className="flex justify-between text-sm text-gray-500 mb-1"><span>{selectedDateInfo.summary.completed_count || 0} of {selectedDateInfo.summary.total_count || 0} complete</span><span>{selectedDateInfo.progressPct}%</span></div><div className="h-2 bg-gray-200 rounded-full overflow-hidden"><div className="h-full bg-emerald-500 transition-all" style={{ width: `${selectedDateInfo.progressPct}%` }} /></div></div>
            <div className="mb-4 p-3 bg-gray-50 rounded-lg"><div className="grid grid-cols-3 gap-2 text-center">{viewMode === 'time' ? <><div><div className="text-lg font-semibold text-gray-800">{formatTime(selectedDateInfo.summary.total_minutes || 0)}</div><div className="text-xs text-gray-500">Total</div></div><div><div className="text-lg font-semibold text-emerald-600">{formatTime(selectedDateInfo.summary.completed_minutes || 0)}</div><div className="text-xs text-gray-500">Done</div></div><div><div className="text-lg font-semibold text-amber-600">{formatTime(selectedDateInfo.summary.remaining_minutes || 0)}</div><div className="text-xs text-gray-500">Left</div></div></> : <><div><div className="text-lg font-semibold text-gray-800">{selectedDateInfo.summary.total_count || 0}</div><div className="text-xs text-gray-500">Total</div></div><div><div className="text-lg font-semibold text-emerald-600">{selectedDateInfo.summary.completed_count || 0}</div><div className="text-xs text-gray-500">Done</div></div><div><div className="text-lg font-semibold text-amber-600">{selectedDateInfo.summary.remaining_count || 0}</div><div className="text-xs text-gray-500">Left</div></div></>}</div></div>
            <div className="space-y-4 max-h-[400px] overflow-y-auto">
              <div>
                <h4 className="text-xs font-semibold text-amber-600 uppercase tracking-wide mb-2 flex items-center justify-between"><span>☀ Morning</span><span className="text-gray-400 font-normal">{selectedDateInfo.am.completedCount}/{selectedDateInfo.am.chores.length}</span></h4>
                <ul className="space-y-1">{selectedDateInfo.am.chores.map(c => <ChoreItem key={c.id} chore={c} onToggle={toggleTask} onEdit={() => { setEditingChore(c); setActiveTab('manage'); }} />)}{!selectedDateInfo.am.chores.length && <li className="text-sm text-gray-400 italic p-2">No morning tasks</li>}</ul>
              </div>
              <div>
                <h4 className="text-xs font-semibold text-indigo-600 uppercase tracking-wide mb-2 flex items-center justify-between"><span>🌙 Evening</span><span className="text-gray-400 font-normal">{selectedDateInfo.pm.completedCount}/{selectedDateInfo.pm.chores.length}</span></h4>
                <ul className="space-y-1">{selectedDateInfo.pm.chores.map(c => <ChoreItem key={c.id} chore={c} onToggle={toggleTask} onEdit={() => { setEditingChore(c); setActiveTab('manage'); }} />)}{!selectedDateInfo.pm.chores.length && <li className="text-sm text-gray-400 italic p-2">No evening tasks</li>}</ul>
              </div>
              <div className="pt-4 border-t"><h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Categories</h4><div className="flex flex-wrap gap-3 text-xs">{['daily', 'weekly', 'monthly', 'quarterly', 'adhoc'].map(c => <span key={c} className="flex items-center gap-1"><span className={`w-2 h-2 rounded-full ${getCategoryColor(c)}`} />{getCategoryLabel(c)}</span>)}</div></div>
            </div>
          </div>
        </div>}

        {activeTab === 'manage' && <div className="bg-white rounded-xl shadow-sm p-4 md:p-6">
          <div className="flex flex-col gap-4 mb-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <h2 className="text-xl font-semibold text-gray-800">All Chores</h2>
              <div className="flex items-center gap-3">
                <div className="relative flex-grow sm:flex-grow-0"><input type="text" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="Search..." className="w-full sm:w-64 pl-3 pr-4 py-2 border border-gray-300 rounded-lg text-sm" /></div>
                <button onClick={() => { setAddToFrequency('daily'); setShowAddModal(true); }} className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 flex items-center gap-2 whitespace-nowrap text-sm"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>Add</button>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-3 pt-3 border-t">
              <div className="flex items-center gap-2"><label className="text-sm text-gray-500">Type:</label><select value={frequencyFilter} onChange={e => setFrequencyFilter(e.target.value)} className="px-2 py-1 border border-gray-300 rounded text-sm"><option value="all">All</option>{['daily', 'weekly', 'monthly', 'quarterly', 'adhoc'].map(f => <option key={f} value={f}>{getCategoryLabel(f)}</option>)}</select></div>
              <div className="flex items-center gap-2"><label className="text-sm text-gray-500">Time:</label><select value={timeOfDayFilter} onChange={e => setTimeOfDayFilter(e.target.value)} className="px-2 py-1 border border-gray-300 rounded text-sm"><option value="all">All</option><option value="AM">AM</option><option value="PM">PM</option></select></div>
              <div className="flex items-center gap-2 ml-auto"><label className="text-sm text-gray-500">Sort:</label><select value={sortBy} onChange={e => setSortBy(e.target.value)} className="px-2 py-1 border border-gray-300 rounded text-sm"><option value="name">Name</option><option value="time">Duration</option><option value="ampm">AM/PM</option></select></div>
            </div>
            <div className="flex flex-wrap items-center gap-2 pt-3 border-t">
              <span className="text-sm text-gray-500">Data:</span>
              <button onClick={exportData} className="px-3 py-1.5 text-sm border border-gray-300 rounded hover:bg-gray-50">Export</button>
              <label className="px-3 py-1.5 text-sm border border-gray-300 rounded hover:bg-gray-50 cursor-pointer">Import<input type="file" accept=".json" onChange={importData} className="sr-only" /></label>
              <button onClick={clearAllData} className="px-3 py-1.5 text-sm border border-red-300 text-red-600 rounded hover:bg-red-50">Reset</button>
              <div className="ml-auto"><SaveIndicator status={saveStatus} /></div>
            </div>
          </div>
          {(searchQuery || frequencyFilter !== 'all' || timeOfDayFilter !== 'all') && <div className="mb-4 text-sm text-gray-500">Showing {totalFiltered} of {allChores.length} <button onClick={() => { setSearchQuery(''); setFrequencyFilter('all'); setTimeOfDayFilter('all'); }} className="ml-2 text-blue-500 hover:text-blue-600">Clear</button></div>}
          <FrequencySection title="Daily" list={filteredChores.daily} color="bg-emerald-400" total={choreCounts.daily} searchQuery={searchQuery} timeOfDayFilter={timeOfDayFilter} frequencyFilter={frequencyFilter} onAdd={(f) => { setAddToFrequency(f); setShowAddModal(true); }} onEdit={setEditingChore} onDelete={deleteChore} />
          <FrequencySection title="Weekly" list={filteredChores.weekly} color="bg-blue-400" total={choreCounts.weekly} searchQuery={searchQuery} timeOfDayFilter={timeOfDayFilter} frequencyFilter={frequencyFilter} onAdd={(f) => { setAddToFrequency(f); setShowAddModal(true); }} onEdit={setEditingChore} onDelete={deleteChore} />
          <FrequencySection title="Monthly" list={filteredChores.monthly} color="bg-purple-400" total={choreCounts.monthly} searchQuery={searchQuery} timeOfDayFilter={timeOfDayFilter} frequencyFilter={frequencyFilter} onAdd={(f) => { setAddToFrequency(f); setShowAddModal(true); }} onEdit={setEditingChore} onDelete={deleteChore} />
          <FrequencySection title="Quarterly" list={filteredChores.quarterly} color="bg-orange-400" total={choreCounts.quarterly} searchQuery={searchQuery} timeOfDayFilter={timeOfDayFilter} frequencyFilter={frequencyFilter} onAdd={(f) => { setAddToFrequency(f); setShowAddModal(true); }} onEdit={setEditingChore} onDelete={deleteChore} />
          <FrequencySection title="Ad Hoc" list={filteredChores.adhoc} color="bg-red-400" total={choreCounts.adhoc} searchQuery={searchQuery} timeOfDayFilter={timeOfDayFilter} frequencyFilter={frequencyFilter} onAdd={(f) => { setAddToFrequency(f); setShowAddModal(true); }} onEdit={setEditingChore} onDelete={deleteChore} />
        </div>}
      </div>
      {editingChore && <EditModal chore={editingChore} onClose={() => setEditingChore(null)} onSave={updateChore} isSaving={isSaving} />}
      {showAddModal && <AddModal defaultFrequency={addToFrequency} onClose={() => setShowAddModal(false)} onAdd={addChore} isSaving={isSaving} />}
    </div>
  );
}
