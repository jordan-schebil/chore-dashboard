import React, { useState, useMemo, useEffect, useCallback, memo } from 'react';
import * as api from './api';

// --- Constants & Helpers ---
const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const dayNamesFull = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const formatTime = (m) => m < 60 ? `${m}m` : m % 60 > 0 ? `${Math.floor(m/60)}h ${m%60}m` : `${Math.floor(m/60)}h`;
const getDateString = (d) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
const getCategoryColor = (c) => ({ daily: 'bg-emerald-400', weekly: 'bg-blue-400', monthly: 'bg-purple-400', quarterly: 'bg-orange-400', custom: 'bg-red-400' }[c] || 'bg-gray-400');
const getCategoryLabel = (c) => ({ daily: 'Daily', weekly: 'Weekly', monthly: 'Monthly', quarterly: 'Quarterly', custom: 'Custom' }[c] || c);

const getNextDayOfWeek = (dayOfWeek) => {
  const today = new Date();
  let daysUntil = dayOfWeek - today.getDay();
  if (daysUntil <= 0) daysUntil += 7;
  const next = new Date(today);
  next.setDate(today.getDate() + daysUntil);
  return getDateString(next);
};

const describeCustomSchedule = (schedule) => {
  if (!schedule) return '';
  const { type } = schedule;
  if (type === 'one_time') {
    const d = new Date(schedule.date + 'T00:00:00');
    return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
  }
  if (type === 'multi_weekly') {
    const days = (schedule.days_of_week || []).map(d => dayNames[d]).join(', ');
    const interval = schedule.interval || 1;
    if (interval === 1) return `Weekly on ${days}`;
    if (interval === 2) return `Biweekly on ${days}`;
    return `Every ${interval} weeks on ${days}`;
  }
  if (type === 'interval_days') return `Every ${schedule.interval} days`;
  if (type === 'monthly_date') {
    const day = schedule.day_of_month;
    const interval = schedule.interval || 1;
    const suffix = day === 1 ? 'st' : day === 2 ? 'nd' : day === 3 ? 'rd' : 'th';
    if (interval === 1) return `Monthly on the ${day}${suffix}`;
    if (interval === 2) return `Bimonthly on the ${day}${suffix}`;
    return `Every ${interval} months on the ${day}${suffix}`;
  }
  if (type === 'seasonal') {
    const month = monthNames[schedule.month - 1];
    const week = schedule.week_of_month;
    const day = dayNamesFull[schedule.day_of_week];
    const weekLabel = week === 1 ? '1st' : week === 2 ? '2nd' : week === 3 ? '3rd' : '4th';
    return `${weekLabel} ${day} of ${month}`;
  }
  return 'Custom';
};

const matchesCustomSchedule = (schedule, checkDate) => {
  if (!schedule) return false;
  const { type } = schedule;
  const dow = checkDate.getDay();
  if (type === 'one_time') return schedule.date === getDateString(checkDate);
  if (type === 'multi_weekly') {
    const days = schedule.days_of_week || [];
    if (!days.includes(dow)) return false;
    const interval = schedule.interval || 1;
    if (interval > 1 && schedule.start_date) {
      const start = new Date(schedule.start_date + 'T00:00:00');
      const weeksDiff = Math.floor((checkDate - start) / (7 * 24 * 60 * 60 * 1000));
      if (weeksDiff < 0 || weeksDiff % interval !== 0) return false;
    }
    return true;
  }
  if (type === 'interval_days') {
    if (!schedule.start_date) return false;
    const start = new Date(schedule.start_date + 'T00:00:00');
    const daysDiff = Math.floor((checkDate - start) / (24 * 60 * 60 * 1000));
    return daysDiff >= 0 && daysDiff % schedule.interval === 0;
  }
  if (type === 'monthly_date') {
    if (checkDate.getDate() !== schedule.day_of_month) return false;
    const interval = schedule.interval || 1;
    if (interval > 1 && schedule.start_date) {
      const start = new Date(schedule.start_date + 'T00:00:00');
      const monthsDiff = (checkDate.getFullYear() - start.getFullYear()) * 12 + (checkDate.getMonth() - start.getMonth());
      if (monthsDiff < 0 || monthsDiff % interval !== 0) return false;
    }
    return true;
  }
  if (type === 'seasonal') {
    if (checkDate.getMonth() + 1 !== schedule.month) return false;
    const wom = Math.ceil(checkDate.getDate() / 7);
    if (wom !== schedule.week_of_month) return false;
    if (dow !== schedule.day_of_week) return false;
    return true;
  }
  return false;
};

// --- Sub-Components ---
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
        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="5" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="19" r="2"/></svg>
      </button>
      {open && <>
        <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
        <div className="absolute right-0 top-full mt-1 bg-white rounded-lg shadow-lg border py-1 z-20 min-w-32">
          <button onClick={() => { setOpen(false); onEdit(); }} className="w-full px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"/></svg>Edit
          </button>
        </div>
      </>}
    </div>
  );
});

const ChoreItem = memo(({ chore, completed, onToggle, onEdit }) => (
  <li className={`text-sm flex items-center gap-2 p-2 rounded-lg transition-all ${completed ? 'bg-gray-50 text-gray-400' : 'hover:bg-gray-50 text-gray-700'}`}>
    <button onClick={() => onToggle(chore.id)} className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 ${completed ? 'bg-emerald-500 border-emerald-500' : 'border-gray-300 hover:border-gray-400'}`}>
      {completed && <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
    </button>
    <span className={`w-2 h-2 rounded-full flex-shrink-0 ${getCategoryColor(chore.frequency)}`} />
    <span onClick={() => onToggle(chore.id)} className={`flex-grow cursor-pointer ${completed ? 'line-through' : ''}`}>{chore.name}</span>
    <span className={`text-xs px-2 py-0.5 rounded-full ${completed ? 'bg-gray-100 text-gray-400' : 'bg-gray-100 text-gray-500'}`}>{chore.minutes}m</span>
    <ChoreMenu onEdit={() => onEdit(chore)} />
  </li>
));

const ManageChoreItem = memo(({ chore, searchQuery, onEdit, onDelete }) => {
  const desc = chore.frequency === 'weekly' ? dayNamesFull[chore.day_of_week] 
    : chore.frequency === 'monthly' ? `Week ${chore.week_of_month}, ${dayNamesFull[chore.day_of_week]}` 
    : chore.frequency === 'quarterly' ? `M${chore.month_of_quarter}, W${chore.week_of_month}, ${dayNamesFull[chore.day_of_week]}` 
    : chore.frequency === 'custom' ? describeCustomSchedule(chore.custom_schedule) : null;
  return (
    <div className="flex items-center gap-3 p-3 bg-white rounded-lg border border-gray-200 hover:border-gray-300">
      <span className={`w-2 h-2 rounded-full flex-shrink-0 ${getCategoryColor(chore.frequency)}`} />
      <div className="flex-grow min-w-0">
        <div className="font-medium text-gray-800 truncate"><HighlightedText text={chore.name} query={searchQuery} /></div>
        <div className="text-xs text-gray-500 flex items-center gap-2 flex-wrap">
          <span>{chore.time_of_day}</span><span>•</span><span>{chore.minutes}m</span>
          {desc && <><span>•</span><span>{desc}</span></>}
        </div>
      </div>
      <button onClick={() => onEdit(chore)} className="p-1.5 text-gray-400 hover:text-blue-500 hover:bg-blue-50 rounded">
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"/></svg>
      </button>
      <button onClick={() => onDelete(chore.id)} className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded">
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
        {list.map(c => <ManageChoreItem key={c.id} chore={c} searchQuery={searchQuery} onEdit={onEdit} onDelete={onDelete} />)}
        {!list.length && !searchQuery && frequencyFilter === 'all' && timeOfDayFilter === 'all' && <div className="text-sm text-gray-400 italic p-3 bg-gray-50 rounded-lg">No chores</div>}
      </div>
    </div>
  );
});

const CalendarTooltip = memo(({ date, breakdown, viewMode }) => {
  if (!date) return null;
  const cats = ['daily','weekly','monthly','quarterly','custom'];
  if (!cats.some(c => breakdown[c]?.count > 0)) return null;
  return (
    <div className="absolute z-30 bg-gray-900 text-white text-xs rounded-lg p-3 shadow-xl -translate-x-1/2 left-1/2 bottom-full mb-2 min-w-40">
      <div className="font-medium mb-2">{date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</div>
      <div className="space-y-1">{cats.map(c => !breakdown[c] || breakdown[c].count === 0 ? null : (
        <div key={c} className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-1.5"><span className={`w-2 h-2 rounded-full ${getCategoryColor(c)}`} /><span>{getCategoryLabel(c)}</span></div>
          <span className="text-gray-300">{viewMode === 'count' ? breakdown[c].count : formatTime(breakdown[c].minutes)}</span>
        </div>
      ))}</div>
      <div className="absolute left-1/2 -translate-x-1/2 top-full w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-gray-900" />
    </div>
  );
});

const ConnectionStatus = memo(({ status }) => (
  <span className={`text-xs flex items-center gap-1 ${status === 'connected' ? 'text-green-600' : status === 'loading' ? 'text-amber-600' : 'text-red-600'}`}>
    {status === 'connected' && '● Connected'}{status === 'loading' && '○ Loading...'}{status === 'error' && '● Offline'}
  </span>
));

const CustomScheduleEditor = memo(({ schedule, onChange }) => {
  const scheduleType = schedule?.type || 'one_time';
  const updateSchedule = (updates) => onChange({ ...schedule, ...updates });
  const setType = (type) => {
    if (type === 'one_time') onChange({ type, date: getDateString(new Date()) });
    else if (type === 'multi_weekly') onChange({ type, days_of_week: [6], interval: 1 });
    else if (type === 'interval_days') onChange({ type, interval: 7, start_date: getDateString(new Date()) });
    else if (type === 'monthly_date') onChange({ type, day_of_month: new Date().getDate(), interval: 1 });
    else if (type === 'seasonal') onChange({ type, month: new Date().getMonth() + 1, week_of_month: 1, day_of_week: 6 });
  };
  const toggleDayOfWeek = (day) => {
    const current = schedule?.days_of_week || [];
    const updated = current.includes(day) ? current.filter(d => d !== day) : [...current, day].sort((a, b) => a - b);
    if (updated.length > 0) updateSchedule({ days_of_week: updated, start_date: getNextDayOfWeek(updated[0]) });
  };
  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Schedule Type</label>
        <select value={scheduleType} onChange={e => setType(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500">
          <option value="one_time">One-time (specific date)</option>
          <option value="multi_weekly">Weekly/Biweekly (select days)</option>
          <option value="interval_days">Every X days</option>
          <option value="monthly_date">Monthly/Bimonthly (specific date)</option>
          <option value="seasonal">Seasonal (yearly)</option>
        </select>
      </div>
      {scheduleType === 'one_time' && (
        <div><label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
          <input type="date" value={schedule?.date || ''} onChange={e => updateSchedule({ date: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"/></div>
      )}
      {scheduleType === 'multi_weekly' && (<>
        <div><label className="block text-sm font-medium text-gray-700 mb-2">Days of Week</label>
          <div className="flex flex-wrap gap-2">{dayNames.map((name, i) => (
            <button key={i} type="button" onClick={() => toggleDayOfWeek(i)} className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${(schedule?.days_of_week || []).includes(i) ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>{name}</button>
          ))}</div></div>
        <div><label className="block text-sm font-medium text-gray-700 mb-1">Repeat Every</label>
          <select value={schedule?.interval || 1} onChange={e => updateSchedule({ interval: parseInt(e.target.value) })} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500">
            <option value={1}>Every week</option><option value={2}>Every 2 weeks (biweekly)</option><option value={3}>Every 3 weeks</option><option value={4}>Every 4 weeks</option>
          </select></div>
        {(schedule?.interval || 1) > 1 && (<div><label className="block text-sm font-medium text-gray-700 mb-1">Starting From</label>
          <input type="date" value={schedule?.start_date || ''} onChange={e => updateSchedule({ start_date: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"/>
          <p className="text-xs text-gray-500 mt-1">First occurrence of this schedule</p></div>)}
      </>)}
      {scheduleType === 'interval_days' && (<>
        <div><label className="block text-sm font-medium text-gray-700 mb-1">Every X Days</label>
          <input type="number" min="1" value={schedule?.interval || 7} onChange={e => updateSchedule({ interval: parseInt(e.target.value) || 1 })} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"/></div>
        <div><label className="block text-sm font-medium text-gray-700 mb-1">Starting From</label>
          <input type="date" value={schedule?.start_date || ''} onChange={e => updateSchedule({ start_date: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"/></div>
      </>)}
      {scheduleType === 'monthly_date' && (<>
        <div><label className="block text-sm font-medium text-gray-700 mb-1">Day of Month</label>
          <select value={schedule?.day_of_month || 1} onChange={e => updateSchedule({ day_of_month: parseInt(e.target.value) })} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500">
            {Array.from({ length: 31 }, (_, i) => <option key={i + 1} value={i + 1}>{i + 1}</option>)}
          </select></div>
        <div><label className="block text-sm font-medium text-gray-700 mb-1">Repeat Every</label>
          <select value={schedule?.interval || 1} onChange={e => updateSchedule({ interval: parseInt(e.target.value) })} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500">
            <option value={1}>Every month</option><option value={2}>Every 2 months (bimonthly)</option><option value={3}>Every 3 months (quarterly)</option><option value={6}>Every 6 months</option>
          </select></div>
        {(schedule?.interval || 1) > 1 && (<div><label className="block text-sm font-medium text-gray-700 mb-1">Starting From</label>
          <input type="date" value={schedule?.start_date || ''} onChange={e => updateSchedule({ start_date: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"/></div>)}
      </>)}
      {scheduleType === 'seasonal' && (<>
        <div><label className="block text-sm font-medium text-gray-700 mb-1">Month</label>
          <select value={schedule?.month || 1} onChange={e => updateSchedule({ month: parseInt(e.target.value) })} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500">
            {monthNames.map((name, i) => <option key={i} value={i + 1}>{name}</option>)}
          </select></div>
        <div><label className="block text-sm font-medium text-gray-700 mb-1">Week of Month</label>
          <select value={schedule?.week_of_month || 1} onChange={e => updateSchedule({ week_of_month: parseInt(e.target.value) })} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500">
            <option value={1}>1st week</option><option value={2}>2nd week</option><option value={3}>3rd week</option><option value={4}>4th week</option>
          </select></div>
        <div><label className="block text-sm font-medium text-gray-700 mb-1">Day of Week</label>
          <select value={schedule?.day_of_week ?? 6} onChange={e => updateSchedule({ day_of_week: parseInt(e.target.value) })} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500">
            {dayNamesFull.map((name, i) => <option key={i} value={i}>{name}</option>)}
          </select></div>
      </>)}
      <div className="p-3 bg-blue-50 rounded-lg">
        <div className="text-xs text-blue-600 font-medium mb-1">Schedule Preview</div>
        <div className="text-sm text-blue-800">{describeCustomSchedule(schedule)}</div>
      </div>
    </div>
  );
});

const EditModal = memo(({ chore, onClose, onSave }) => {
  const [name, setName] = useState(chore.name);
  const [time_of_day, setTimeOfDay] = useState(chore.time_of_day);
  const [minutes, setMinutes] = useState(chore.minutes);
  const [frequency, setFrequency] = useState(chore.frequency);
  const [day_of_week, setDayOfWeek] = useState(chore.day_of_week ?? 6);
  const [week_of_month, setWeekOfMonth] = useState(chore.week_of_month ?? 1);
  const [month_of_quarter, setMonthOfQuarter] = useState(chore.month_of_quarter ?? 1);
  const [custom_schedule, setCustomSchedule] = useState(chore.custom_schedule || { type: 'one_time', date: getDateString(new Date()) });
  const valid = name.trim() && (frequency !== 'custom' || custom_schedule);
  const handleSave = () => { 
    if (!valid) return; 
    onSave({ id: chore.id, name: name.trim(), time_of_day, minutes: parseInt(minutes) || 5, frequency,
      day_of_week: ['weekly','monthly','quarterly'].includes(frequency) ? day_of_week : null,
      week_of_month: ['monthly','quarterly'].includes(frequency) ? week_of_month : null,
      month_of_quarter: frequency === 'quarterly' ? month_of_quarter : null,
      custom_schedule: frequency === 'custom' ? custom_schedule : null }); 
    onClose(); 
  };
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6 max-h-[90vh] overflow-y-auto">
        <h3 className="text-lg font-semibold text-gray-800 mb-4">Edit Chore</h3>
        <div className="space-y-4">
          <div><label className="block text-sm font-medium text-gray-700 mb-1">Name</label><input type="text" value={name} onChange={e => setName(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"/></div>
          <div className="grid grid-cols-2 gap-4">
            <div><label className="block text-sm font-medium text-gray-700 mb-1">Time</label><select value={time_of_day} onChange={e => setTimeOfDay(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg"><option value="AM">AM</option><option value="PM">PM</option></select></div>
            <div><label className="block text-sm font-medium text-gray-700 mb-1">Minutes</label><input type="number" value={minutes} onChange={e => setMinutes(e.target.value)} min="1" className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none"/></div>
          </div>
          <div><label className="block text-sm font-medium text-gray-700 mb-1">Frequency</label><select value={frequency} onChange={e => setFrequency(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg"><option value="daily">Daily</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option><option value="quarterly">Quarterly</option><option value="custom">Custom</option></select></div>
          {frequency === 'weekly' && <div><label className="block text-sm font-medium text-gray-700 mb-1">Day</label><select value={day_of_week} onChange={e => setDayOfWeek(+e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg">{dayNamesFull.map((d,i) => <option key={i} value={i}>{d}</option>)}</select></div>}
          {frequency === 'monthly' && <><div><label className="block text-sm font-medium text-gray-700 mb-1">Week</label><select value={week_of_month} onChange={e => setWeekOfMonth(+e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg">{[1,2,3,4].map(w => <option key={w} value={w}>Week {w}</option>)}</select></div><div><label className="block text-sm font-medium text-gray-700 mb-1">Day</label><select value={day_of_week} onChange={e => setDayOfWeek(+e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg">{dayNamesFull.map((d,i) => <option key={i} value={i}>{d}</option>)}</select></div></>}
          {frequency === 'quarterly' && <><div><label className="block text-sm font-medium text-gray-700 mb-1">Month of Quarter</label><select value={month_of_quarter} onChange={e => setMonthOfQuarter(+e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg"><option value={1}>1st</option><option value={2}>2nd</option><option value={3}>3rd</option></select></div><div><label className="block text-sm font-medium text-gray-700 mb-1">Week</label><select value={week_of_month} onChange={e => setWeekOfMonth(+e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg">{[1,2,3,4].map(w => <option key={w} value={w}>Week {w}</option>)}</select></div><div><label className="block text-sm font-medium text-gray-700 mb-1">Day</label><select value={day_of_week} onChange={e => setDayOfWeek(+e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg">{dayNamesFull.map((d,i) => <option key={i} value={i}>{d}</option>)}</select></div></>}
          {frequency === 'custom' && <CustomScheduleEditor schedule={custom_schedule} onChange={setCustomSchedule} />}
        </div>
        <div className="flex gap-3 mt-6"><button onClick={onClose} className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50">Cancel</button><button onClick={handleSave} disabled={!valid} className="flex-1 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50">Save</button></div>
      </div>
    </div>
  );
});

const AddModal = memo(({ defaultFrequency, onClose, onAdd }) => {
  const [name, setName] = useState('');
  const [time_of_day, setTimeOfDay] = useState('AM');
  const [minutes, setMinutes] = useState(10);
  const [frequency, setFrequency] = useState(defaultFrequency);
  const [day_of_week, setDayOfWeek] = useState(6);
  const [week_of_month, setWeekOfMonth] = useState(1);
  const [month_of_quarter, setMonthOfQuarter] = useState(1);
  const [custom_schedule, setCustomSchedule] = useState({ type: 'one_time', date: getDateString(new Date()) });
  const valid = name.trim() && (frequency !== 'custom' || custom_schedule);
  const handleAdd = () => { 
    if (!valid) return; 
    onAdd({ name: name.trim(), time_of_day, minutes: parseInt(minutes) || 5, frequency,
      day_of_week: ['weekly','monthly','quarterly'].includes(frequency) ? day_of_week : null,
      week_of_month: ['monthly','quarterly'].includes(frequency) ? week_of_month : null,
      month_of_quarter: frequency === 'quarterly' ? month_of_quarter : null,
      custom_schedule: frequency === 'custom' ? custom_schedule : null }); 
    onClose(); 
  };
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6 max-h-[90vh] overflow-y-auto">
        <h3 className="text-lg font-semibold text-gray-800 mb-4">Add Chore</h3>
        <div className="space-y-4">
          <div><label className="block text-sm font-medium text-gray-700 mb-1">Name</label><input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="Chore name" className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"/></div>
          <div className="grid grid-cols-2 gap-4">
            <div><label className="block text-sm font-medium text-gray-700 mb-1">Time</label><select value={time_of_day} onChange={e => setTimeOfDay(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg"><option value="AM">AM</option><option value="PM">PM</option></select></div>
            <div><label className="block text-sm font-medium text-gray-700 mb-1">Minutes</label><input type="number" value={minutes} onChange={e => setMinutes(e.target.value)} min="1" className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none"/></div>
          </div>
          <div><label className="block text-sm font-medium text-gray-700 mb-1">Frequency</label><select value={frequency} onChange={e => setFrequency(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg"><option value="daily">Daily</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option><option value="quarterly">Quarterly</option><option value="custom">Custom</option></select></div>
          {frequency === 'weekly' && <div><label className="block text-sm font-medium text-gray-700 mb-1">Day</label><select value={day_of_week} onChange={e => setDayOfWeek(+e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg">{dayNamesFull.map((d,i) => <option key={i} value={i}>{d}</option>)}</select></div>}
          {frequency === 'monthly' && <><div><label className="block text-sm font-medium text-gray-700 mb-1">Week</label><select value={week_of_month} onChange={e => setWeekOfMonth(+e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg">{[1,2,3,4].map(w => <option key={w} value={w}>Week {w}</option>)}</select></div><div><label className="block text-sm font-medium text-gray-700 mb-1">Day</label><select value={day_of_week} onChange={e => setDayOfWeek(+e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg">{dayNamesFull.map((d,i) => <option key={i} value={i}>{d}</option>)}</select></div></>}
          {frequency === 'quarterly' && <><div><label className="block text-sm font-medium text-gray-700 mb-1">Month of Quarter</label><select value={month_of_quarter} onChange={e => setMonthOfQuarter(+e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg"><option value={1}>1st</option><option value={2}>2nd</option><option value={3}>3rd</option></select></div><div><label className="block text-sm font-medium text-gray-700 mb-1">Week</label><select value={week_of_month} onChange={e => setWeekOfMonth(+e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg">{[1,2,3,4].map(w => <option key={w} value={w}>Week {w}</option>)}</select></div><div><label className="block text-sm font-medium text-gray-700 mb-1">Day</label><select value={day_of_week} onChange={e => setDayOfWeek(+e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg">{dayNamesFull.map((d,i) => <option key={i} value={i}>{d}</option>)}</select></div></>}
          {frequency === 'custom' && <CustomScheduleEditor schedule={custom_schedule} onChange={setCustomSchedule} />}
        </div>
        <div className="flex gap-3 mt-6"><button onClick={onClose} className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50">Cancel</button><button onClick={handleAdd} disabled={!valid} className="flex-1 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50">Add</button></div>
      </div>
    </div>
  );
});

// --- Main Component ---
export default function ChoreDashboard() {
  const [chores, setChores] = useState([]);
  const [completions, setCompletions] = useState({});
  const [connectionStatus, setConnectionStatus] = useState('loading');
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
  
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  useEffect(() => {
    const loadData = async () => {
      setConnectionStatus('loading');
      try {
        const choreData = await api.fetchChores();
        setChores(choreData);
        const startDate = getDateString(new Date(year, month, 1));
        const endDate = getDateString(new Date(year, month + 1, 0));
        const completionData = await api.fetchCompletionsRange(startDate, endDate);
        setCompletions(completionData);
        setConnectionStatus('connected');
      } catch (err) {
        console.error('Failed to load data:', err);
        setConnectionStatus('error');
      }
    };
    loadData();
  }, [year, month]);

  const choresByFrequency = useMemo(() => {
    const grouped = { daily: [], weekly: [], monthly: [], quarterly: [], custom: [] };
    chores.forEach(c => grouped[c.frequency]?.push(c));
    return grouped;
  }, [chores]);

  const getChoresForDate = useCallback((date) => {
    const dow = date.getDay();
    const wom = Math.ceil(date.getDate() / 7);
    const moq = (date.getMonth() % 3) + 1;
    return {
      daily: choresByFrequency.daily,
      weekly: choresByFrequency.weekly.filter(c => c.day_of_week === dow),
      monthly: choresByFrequency.monthly.filter(c => c.week_of_month === wom && c.day_of_week === dow),
      quarterly: choresByFrequency.quarterly.filter(c => c.month_of_quarter === moq && c.week_of_month === wom && c.day_of_week === dow),
      custom: choresByFrequency.custom.filter(c => matchesCustomSchedule(c.custom_schedule, date)),
    };
  }, [choresByFrequency]);

  const monthChoresCache = useMemo(() => {
    const cache = new Map();
    for (let i = 1; i <= new Date(year, month + 1, 0).getDate(); i++) {
      const date = new Date(year, month, i);
      const dk = getDateString(date);
      const dc = getChoresForDate(date);
      const all = [...dc.daily, ...dc.weekly, ...dc.monthly, ...dc.quarterly, ...dc.custom];
      cache.set(dk, {
        chores: dc, allChores: all,
        byTime: { AM: all.filter(c => c.time_of_day === 'AM'), PM: all.filter(c => c.time_of_day === 'PM') },
        count: all.length, totalMinutes: all.reduce((s, c) => s + c.minutes, 0),
        breakdown: {
          daily: { count: dc.daily.length, minutes: dc.daily.reduce((s,c) => s+c.minutes, 0) },
          weekly: { count: dc.weekly.length, minutes: dc.weekly.reduce((s,c) => s+c.minutes, 0) },
          monthly: { count: dc.monthly.length, minutes: dc.monthly.reduce((s,c) => s+c.minutes, 0) },
          quarterly: { count: dc.quarterly.length, minutes: dc.quarterly.reduce((s,c) => s+c.minutes, 0) },
          custom: { count: dc.custom.length, minutes: dc.custom.reduce((s,c) => s+c.minutes, 0) }
        }
      });
    }
    return cache;
  }, [chores, year, month, getChoresForDate]);

  const getDateData = useCallback((date) => monthChoresCache.get(getDateString(date)) || { chores: {daily:[],weekly:[],monthly:[],quarterly:[],custom:[]}, allChores: [], byTime: {AM:[],PM:[]}, count: 0, totalMinutes: 0, breakdown: {daily:{count:0,minutes:0},weekly:{count:0,minutes:0},monthly:{count:0,minutes:0},quarterly:{count:0,minutes:0},custom:{count:0,minutes:0}} }, [monthChoresCache]);

  const completionCounts = useMemo(() => {
    const counts = new Map();
    for (let i = 1; i <= new Date(year, month + 1, 0).getDate(); i++) {
      const date = new Date(year, month, i);
      const dk = getDateString(date);
      const comp = completions[dk] || [];
      const dd = getDateData(date);
      counts.set(dk, { count: dd.allChores.filter(c => comp.includes(c.id)).length, minutes: dd.allChores.filter(c => comp.includes(c.id)).reduce((s,c) => s+c.minutes, 0) });
    }
    return counts;
  }, [completions, year, month, getDateData]);

  const getCompletedData = useCallback((date) => completionCounts.get(getDateString(date)) || { count: 0, minutes: 0 }, [completionCounts]);

  const filteredChores = useMemo(() => {
    const filterAndSort = (list) => {
      let f = list;
      if (searchQuery.trim()) f = f.filter(c => c.name.toLowerCase().includes(searchQuery.toLowerCase()));
      if (timeOfDayFilter !== 'all') f = f.filter(c => c.time_of_day === timeOfDayFilter);
      return [...f].sort((a, b) => { let cmp = sortBy === 'name' ? a.name.localeCompare(b.name) : sortBy === 'time' ? a.minutes - b.minutes : a.time_of_day.localeCompare(b.time_of_day); return sortDirection === 'asc' ? cmp : -cmp; });
    };
    const shouldShow = (freq) => frequencyFilter === 'all' || frequencyFilter === freq;
    return { daily: shouldShow('daily') ? filterAndSort(choresByFrequency.daily) : [], weekly: shouldShow('weekly') ? filterAndSort(choresByFrequency.weekly) : [], monthly: shouldShow('monthly') ? filterAndSort(choresByFrequency.monthly) : [], quarterly: shouldShow('quarterly') ? filterAndSort(choresByFrequency.quarterly) : [], custom: shouldShow('custom') ? filterAndSort(choresByFrequency.custom) : [] };
  }, [choresByFrequency, searchQuery, timeOfDayFilter, frequencyFilter, sortBy, sortDirection]);

  const totalFiltered = filteredChores.daily.length + filteredChores.weekly.length + filteredChores.monthly.length + filteredChores.quarterly.length + filteredChores.custom.length;

  const dynamicThresholds = useMemo(() => {
    const vals = Array.from(monthChoresCache.values());
    const counts = vals.map(v => v.count).filter(c => c > 0);
    const mins = vals.map(v => v.totalMinutes).filter(m => m > 0);
    if (!counts.length) return { count: { light: 0, medium: 0, heavy: 0 }, time: { light: 0, medium: 0, heavy: 0 } };
    const minC = Math.min(...counts), maxC = Math.max(...counts), minM = Math.min(...mins), maxM = Math.max(...mins);
    return { count: { light: minC + (maxC-minC)*0.25, medium: minC + (maxC-minC)*0.5, heavy: minC + (maxC-minC)*0.75 }, time: { light: minM + (maxM-minM)*0.25, medium: minM + (maxM-minM)*0.5, heavy: minM + (maxM-minM)*0.75 } };
  }, [monthChoresCache]);

  const calendarDays = useMemo(() => { const first = new Date(year, month, 1); const days = Array(first.getDay()).fill(null); for (let i = 1; i <= new Date(year, month + 1, 0).getDate(); i++) days.push(new Date(year, month, i)); return days; }, [year, month]);

  const selectedDateInfo = useMemo(() => {
    const dd = getDateData(selectedDate), cd = getCompletedData(selectedDate), dk = getDateString(selectedDate), completedIds = completions[dk] || [];
    const amCompleted = dd.byTime.AM.filter(c => completedIds.includes(c.id)), pmCompleted = dd.byTime.PM.filter(c => completedIds.includes(c.id));
    return { dateData: dd, completedData: cd, completedIds, progressPct: dd.count > 0 ? Math.round((cd.count / dd.count) * 100) : 0,
      am: { chores: dd.byTime.AM, completedCount: amCompleted.length, completedMinutes: amCompleted.reduce((s,c) => s+c.minutes, 0), totalMinutes: dd.byTime.AM.reduce((s,c) => s+c.minutes, 0) },
      pm: { chores: dd.byTime.PM, completedCount: pmCompleted.length, completedMinutes: pmCompleted.reduce((s,c) => s+c.minutes, 0), totalMinutes: dd.byTime.PM.reduce((s,c) => s+c.minutes, 0) } };
  }, [selectedDate, getDateData, getCompletedData, completions]);

  const toggleTask = useCallback(async (choreId) => {
    const dk = getDateString(selectedDate), currentCompleted = completions[dk] || [], isCurrentlyCompleted = currentCompleted.includes(choreId);
    setCompletions(prev => ({ ...prev, [dk]: isCurrentlyCompleted ? currentCompleted.filter(id => id !== choreId) : [...currentCompleted, choreId] }));
    try { await api.toggleCompletion(choreId, dk); } catch (err) { console.error('Toggle failed:', err); setCompletions(prev => ({ ...prev, [dk]: currentCompleted })); }
  }, [selectedDate, completions]);

  const isTaskCompleted = useCallback((choreId) => selectedDateInfo.completedIds.includes(choreId), [selectedDateInfo.completedIds]);

  const getHeatColor = useCallback((date) => {
    const dd = getDateData(date), cd = getCompletedData(date);
    if (cd.count === dd.count && dd.count > 0) return 'bg-emerald-300 text-emerald-900';
    const rem = viewMode === 'count' ? dd.count - cd.count : dd.totalMinutes - cd.minutes;
    const { light, medium, heavy } = dynamicThresholds[viewMode === 'count' ? 'count' : 'time'];
    if (rem <= light) return 'bg-emerald-100 text-emerald-800'; if (rem <= medium) return 'bg-amber-100 text-amber-800'; if (rem <= heavy) return 'bg-orange-200 text-orange-800';
    return 'bg-red-200 text-red-800';
  }, [getDateData, getCompletedData, viewMode, dynamicThresholds]);

  const addChore = useCallback(async (choreData) => { const tempId = 'temp-' + Date.now(); setChores(prev => [...prev, { ...choreData, id: tempId }]); try { const newChore = await api.createChore(choreData); setChores(prev => prev.map(c => c.id === tempId ? newChore : c)); } catch (err) { console.error('Add failed:', err); setChores(prev => prev.filter(c => c.id !== tempId)); } }, []);
  const updateChore = useCallback(async (choreData) => { const oldChore = chores.find(c => c.id === choreData.id); setChores(prev => prev.map(c => c.id === choreData.id ? choreData : c)); try { await api.updateChore(choreData.id, choreData); } catch (err) { console.error('Update failed:', err); if (oldChore) setChores(prev => prev.map(c => c.id === choreData.id ? oldChore : c)); } }, [chores]);
  const deleteChore = useCallback(async (id) => { const oldChore = chores.find(c => c.id === id); setChores(prev => prev.filter(c => c.id !== id)); try { await api.deleteChore(id); } catch (err) { console.error('Delete failed:', err); if (oldChore) setChores(prev => [...prev, oldChore]); } }, [chores]);
  const resetData = useCallback(async () => { if (!confirm('Reset all data to defaults?')) return; try { await api.resetToDefaults(); const choreData = await api.fetchChores(); setChores(choreData); setCompletions({}); } catch (err) { console.error('Reset failed:', err); } }, []);

  const handleEditFromCalendar = useCallback((chore) => { setEditingChore(chore); setActiveTab('manage'); }, []);
  const openAddModal = useCallback((frequency) => { setAddToFrequency(frequency); setShowAddModal(true); }, []);
  const navMonth = (d) => setCurrentDate(new Date(year, month + d, 1));
  const isToday = (d) => d && new Date().toDateString() === d.toDateString();
  const isSelected = (d) => d && selectedDate.toDateString() === d.toDateString();
  const legendLabels = viewMode === 'count' ? { light: `≤${Math.round(dynamicThresholds.count.light)}`, medium: `≤${Math.round(dynamicThresholds.count.medium)}`, heavy: `≤${Math.round(dynamicThresholds.count.heavy)}` } : { light: `≤${formatTime(Math.round(dynamicThresholds.time.light))}`, medium: `≤${formatTime(Math.round(dynamicThresholds.time.medium))}`, heavy: `≤${formatTime(Math.round(dynamicThresholds.time.heavy))}` };

  if (connectionStatus === 'loading' && chores.length === 0) return <div className="min-h-screen bg-gray-50 flex items-center justify-center"><div className="text-center"><div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" /><p className="text-gray-600">Loading...</p></div></div>;

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-6xl mx-auto">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-6">
          <div><h1 className="text-3xl font-bold text-gray-800 mb-2">Chore Dashboard</h1><p className="text-gray-600">{activeTab === 'calendar' ? 'Click any day to see tasks' : 'Manage your chores'}</p></div>
          <div className="mt-4 sm:mt-0 flex items-center gap-2">
            <div className="flex items-center bg-white rounded-lg p-1 shadow-sm">
              <button onClick={() => setActiveTab('calendar')} className={`px-3 py-1.5 rounded-md text-sm font-medium flex items-center gap-1.5 ${activeTab === 'calendar' ? 'bg-blue-500 text-white' : 'text-gray-500 hover:text-gray-700'}`}><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>Calendar</button>
              <button onClick={() => setActiveTab('manage')} className={`px-3 py-1.5 rounded-md text-sm font-medium flex items-center gap-1.5 ${activeTab === 'manage' ? 'bg-blue-500 text-white' : 'text-gray-500 hover:text-gray-700'}`}><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/></svg>Manage</button>
            </div>
            {activeTab === 'calendar' && <div className="flex items-center bg-white rounded-lg p-1 shadow-sm">
              <button onClick={() => setViewMode('time')} className={`px-3 py-1.5 rounded-md text-sm font-medium flex items-center gap-1.5 ${viewMode === 'time' ? 'bg-blue-500 text-white' : 'text-gray-500 hover:text-gray-700'}`}><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>Time</button>
              <button onClick={() => setViewMode('count')} className={`px-3 py-1.5 rounded-md text-sm font-medium flex items-center gap-1.5 ${viewMode === 'count' ? 'bg-blue-500 text-white' : 'text-gray-500 hover:text-gray-700'}`}><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"/></svg>Count</button>
            </div>}
          </div>
        </div>

        {activeTab === 'calendar' && <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 bg-white rounded-xl shadow-sm p-6">
            <div className="flex items-center justify-between mb-6">
              <button onClick={() => navMonth(-1)} className="p-2 hover:bg-gray-100 rounded-lg"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7"/></svg></button>
              <h2 className="text-xl font-semibold text-gray-800">{monthNames[month]} {year}</h2>
              <button onClick={() => navMonth(1)} className="p-2 hover:bg-gray-100 rounded-lg"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7"/></svg></button>
            </div>
            <div className="grid grid-cols-7 gap-2 mb-2">{dayNames.map(d => <div key={d} className="text-center text-sm font-medium text-gray-500 py-2">{d}</div>)}</div>
            <div className="grid grid-cols-7 gap-2">{calendarDays.map((date, i) => {
              if (!date) return <div key={i} className="aspect-square" />;
              const dd = getDateData(date), cd = getCompletedData(date);
              return (<div key={i} className="aspect-square relative">
                <button onClick={() => setSelectedDate(date)} onMouseEnter={() => setHoveredDate(date)} onMouseLeave={() => setHoveredDate(null)} className={`w-full h-full rounded-lg flex flex-col items-center justify-center transition-all ${getHeatColor(date)} ${isSelected(date) ? 'ring-2 ring-blue-500 ring-offset-2' : ''} ${isToday(date) ? 'font-bold' : ''} hover:scale-105 hover:shadow-md`}>
                  <span className="text-lg">{date.getDate()}</span>
                  <span className="text-xs opacity-75">{viewMode === 'time' ? formatTime(dd.totalMinutes) : `${cd.count}/${dd.count}`}</span>
                  {cd.count === dd.count && dd.count > 0 && <span className="absolute top-1 right-1 text-xs">✓</span>}
                </button>
                {hoveredDate?.getTime() === date.getTime() && <CalendarTooltip date={date} breakdown={dd.breakdown} viewMode={viewMode} />}
              </div>);
            })}</div>
            <div className="flex items-center justify-center gap-3 mt-6 pt-4 border-t flex-wrap">
              <span className="text-sm text-gray-500">Status:</span>
              <div className="flex items-center gap-1"><div className="w-6 h-6 rounded bg-emerald-300"/><span className="text-xs text-gray-500">Done</span></div>
              <div className="flex items-center gap-1" title={legendLabels.light}><div className="w-6 h-6 rounded bg-emerald-100"/><span className="text-xs text-gray-500">Light</span></div>
              <div className="flex items-center gap-1" title={legendLabels.medium}><div className="w-6 h-6 rounded bg-amber-100"/><span className="text-xs text-gray-500">Medium</span></div>
              <div className="flex items-center gap-1" title={legendLabels.heavy}><div className="w-6 h-6 rounded bg-orange-200"/><span className="text-xs text-gray-500">Heavy</span></div>
              <div className="flex items-center gap-1"><div className="w-6 h-6 rounded bg-red-200"/><span className="text-xs text-gray-500">Peak</span></div>
            </div>
          </div>
          <div className="bg-white rounded-xl shadow-sm p-6">
            <h3 className="text-lg font-semibold text-gray-800 mb-1">{selectedDate.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}</h3>
            <div className="mb-2"><div className="flex justify-between text-sm text-gray-500 mb-1"><span>{selectedDateInfo.completedData.count} of {selectedDateInfo.dateData.count} complete</span><span>{selectedDateInfo.progressPct}%</span></div><div className="h-2 bg-gray-200 rounded-full overflow-hidden"><div className="h-full bg-emerald-500 transition-all" style={{ width: `${selectedDateInfo.progressPct}%` }}/></div></div>
            <div className="mb-4 p-3 bg-gray-50 rounded-lg"><div className="grid grid-cols-3 gap-2 text-center">{viewMode === 'time' ? <><div><div className="text-lg font-semibold text-gray-800">{formatTime(selectedDateInfo.dateData.totalMinutes)}</div><div className="text-xs text-gray-500">Total</div></div><div><div className="text-lg font-semibold text-emerald-600">{formatTime(selectedDateInfo.completedData.minutes)}</div><div className="text-xs text-gray-500">Done</div></div><div><div className="text-lg font-semibold text-amber-600">{formatTime(selectedDateInfo.dateData.totalMinutes - selectedDateInfo.completedData.minutes)}</div><div className="text-xs text-gray-500">Left</div></div></> : <><div><div className="text-lg font-semibold text-gray-800">{selectedDateInfo.dateData.count}</div><div className="text-xs text-gray-500">Total</div></div><div><div className="text-lg font-semibold text-emerald-600">{selectedDateInfo.completedData.count}</div><div className="text-xs text-gray-500">Done</div></div><div><div className="text-lg font-semibold text-amber-600">{selectedDateInfo.dateData.count - selectedDateInfo.completedData.count}</div><div className="text-xs text-gray-500">Left</div></div></>}</div></div>
            <div className="space-y-4 max-h-[420px] overflow-y-auto">
              <div><h4 className="text-xs font-semibold text-amber-600 uppercase tracking-wide mb-2 flex items-center justify-between"><span className="flex items-center gap-2"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z"/></svg>Morning</span><span className="text-gray-400 font-normal">{viewMode === 'time' ? `${formatTime(selectedDateInfo.am.completedMinutes)} / ${formatTime(selectedDateInfo.am.totalMinutes)}` : `${selectedDateInfo.am.completedCount} / ${selectedDateInfo.am.chores.length}`}</span></h4>
                <ul className="space-y-1">{selectedDateInfo.am.chores.map(c => <ChoreItem key={c.id} chore={c} completed={isTaskCompleted(c.id)} onToggle={toggleTask} onEdit={handleEditFromCalendar} />)}{!selectedDateInfo.am.chores.length && <li className="text-sm text-gray-400 italic p-2">No morning tasks</li>}</ul></div>
              <div><h4 className="text-xs font-semibold text-indigo-600 uppercase tracking-wide mb-2 flex items-center justify-between"><span className="flex items-center gap-2"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"/></svg>Evening</span><span className="text-gray-400 font-normal">{viewMode === 'time' ? `${formatTime(selectedDateInfo.pm.completedMinutes)} / ${formatTime(selectedDateInfo.pm.totalMinutes)}` : `${selectedDateInfo.pm.completedCount} / ${selectedDateInfo.pm.chores.length}`}</span></h4>
                <ul className="space-y-1">{selectedDateInfo.pm.chores.map(c => <ChoreItem key={c.id} chore={c} completed={isTaskCompleted(c.id)} onToggle={toggleTask} onEdit={handleEditFromCalendar} />)}{!selectedDateInfo.pm.chores.length && <li className="text-sm text-gray-400 italic p-2">No evening tasks</li>}</ul></div>
              <div className="pt-4 border-t"><h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Categories</h4><div className="flex flex-wrap gap-3 text-xs">{['daily','weekly','monthly','quarterly','custom'].map(c => <span key={c} className="flex items-center gap-1"><span className={`w-2 h-2 rounded-full ${getCategoryColor(c)}`}/>{getCategoryLabel(c)}</span>)}</div></div>
            </div>
          </div>
        </div>}

        {activeTab === 'manage' && <div className="bg-white rounded-xl shadow-sm p-6">
          <div className="flex flex-col gap-4 mb-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <h2 className="text-xl font-semibold text-gray-800">All Chores</h2>
              <div className="flex items-center gap-3">
                <div className="relative flex-grow sm:flex-grow-0"><svg className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg><input type="text" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="Search..." className="w-full sm:w-64 pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"/>{searchQuery && <button onClick={() => setSearchQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/></svg></button>}</div>
                <button onClick={() => openAddModal('daily')} className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 flex items-center gap-2 whitespace-nowrap"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4"/></svg>Add</button>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-3 pt-3 border-t">
              <div className="flex items-center gap-2"><label className="text-sm text-gray-500">Type:</label><select value={frequencyFilter} onChange={e => setFrequencyFilter(e.target.value)} className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm"><option value="all">All</option><option value="daily">Daily</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option><option value="quarterly">Quarterly</option><option value="custom">Custom</option></select></div>
              <div className="flex items-center gap-2"><label className="text-sm text-gray-500">Time:</label><select value={timeOfDayFilter} onChange={e => setTimeOfDayFilter(e.target.value)} className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm"><option value="all">All</option><option value="AM">AM</option><option value="PM">PM</option></select></div>
              <div className="flex items-center gap-2 ml-auto"><label className="text-sm text-gray-500">Sort:</label><select value={sortBy} onChange={e => setSortBy(e.target.value)} className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm"><option value="name">Name</option><option value="time">Duration</option><option value="ampm">AM/PM</option></select><button onClick={() => setSortDirection(p => p === 'asc' ? 'desc' : 'asc')} className="p-1.5 border border-gray-300 rounded-lg hover:bg-gray-50">{sortDirection === 'asc' ? <svg className="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4h13M3 8h9m-9 4h6m4 0l4-4m0 0l4 4m-4-4v12"/></svg> : <svg className="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4h13M3 8h9m-9 4h9m5-4v12m0 0l-4-4m4 4l4-4"/></svg>}</button></div>
            </div>
            <div className="flex flex-wrap items-center gap-2 pt-3 border-t">
              <span className="text-sm text-gray-500">Data:</span>
              <button onClick={resetData} className="px-3 py-1.5 text-sm border border-red-300 text-red-600 rounded-lg hover:bg-red-50 flex items-center gap-1.5"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>Reset</button>
              <div className="ml-auto"><ConnectionStatus status={connectionStatus} /></div>
            </div>
          </div>
          {(searchQuery || frequencyFilter !== 'all' || timeOfDayFilter !== 'all') && <div className="mb-4 text-sm text-gray-500">Showing {totalFiltered} of {chores.length} <button onClick={() => { setSearchQuery(''); setFrequencyFilter('all'); setTimeOfDayFilter('all'); }} className="ml-2 text-blue-500 hover:text-blue-600">Clear</button></div>}
          {totalFiltered === 0 && (searchQuery || frequencyFilter !== 'all' || timeOfDayFilter !== 'all') && <div className="text-center py-12"><svg className="w-16 h-16 mx-auto text-gray-300 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg><h3 className="text-lg font-medium text-gray-600 mb-1">No chores found</h3><p className="text-gray-400">Try adjusting filters</p></div>}
          <FrequencySection title="Daily" list={filteredChores.daily} frequency="daily" color="bg-emerald-400" total={choresByFrequency.daily.length} searchQuery={searchQuery} timeOfDayFilter={timeOfDayFilter} frequencyFilter={frequencyFilter} onAdd={openAddModal} onEdit={setEditingChore} onDelete={deleteChore} />
          <FrequencySection title="Weekly" list={filteredChores.weekly} frequency="weekly" color="bg-blue-400" total={choresByFrequency.weekly.length} searchQuery={searchQuery} timeOfDayFilter={timeOfDayFilter} frequencyFilter={frequencyFilter} onAdd={openAddModal} onEdit={setEditingChore} onDelete={deleteChore} />
          <FrequencySection title="Monthly" list={filteredChores.monthly} frequency="monthly" color="bg-purple-400" total={choresByFrequency.monthly.length} searchQuery={searchQuery} timeOfDayFilter={timeOfDayFilter} frequencyFilter={frequencyFilter} onAdd={openAddModal} onEdit={setEditingChore} onDelete={deleteChore} />
          <FrequencySection title="Quarterly" list={filteredChores.quarterly} frequency="quarterly" color="bg-orange-400" total={choresByFrequency.quarterly.length} searchQuery={searchQuery} timeOfDayFilter={timeOfDayFilter} frequencyFilter={frequencyFilter} onAdd={openAddModal} onEdit={setEditingChore} onDelete={deleteChore} />
          <FrequencySection title="Custom" list={filteredChores.custom} frequency="custom" color="bg-red-400" total={choresByFrequency.custom.length} searchQuery={searchQuery} timeOfDayFilter={timeOfDayFilter} frequencyFilter={frequencyFilter} onAdd={openAddModal} onEdit={setEditingChore} onDelete={deleteChore} />
        </div>}
      </div>
      {editingChore && <EditModal chore={editingChore} onClose={() => setEditingChore(null)} onSave={updateChore} />}
      {showAddModal && <AddModal defaultFrequency={addToFrequency} onClose={() => setShowAddModal(false)} onAdd={addChore} />}
    </div>
  );
}
