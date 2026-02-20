/**
 * API Service Layer for Chore Dashboard
 * Clean separation between API calls and UI logic
 */

const API_BASE = (import.meta.env.VITE_API_BASE ?? 'http://localhost:8000').replace(/\/+$/, '');

// --- Chores API ---

export async function fetchChores() {
  const res = await fetch(`${API_BASE}/chores`);
  if (!res.ok) throw new Error('Failed to fetch chores');
  return res.json();
}

export async function createChore(chore) {
  const res = await fetch(`${API_BASE}/chores`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(chore),
  });
  if (!res.ok) throw new Error('Failed to create chore');
  return res.json();
}

export async function updateChore(id, chore) {
  const res = await fetch(`${API_BASE}/chores/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(chore),
  });
  if (!res.ok) throw new Error('Failed to update chore');
  return res.json();
}

export async function deleteChore(id) {
  const res = await fetch(`${API_BASE}/chores/${id}`, {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error('Failed to delete chore');
  return res.json();
}

export async function updateGlobalOrder(order) {
  const res = await fetch(`${API_BASE}/chores/global-order`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ order }),
  });
  if (!res.ok) throw new Error('Failed to update global order');
  return res.json();
}

// --- Sub-tasks API ---

export async function fetchChoresWithSubtasks() {
  const res = await fetch(`${API_BASE}/chores-with-subtasks`);
  if (!res.ok) throw new Error('Failed to fetch chores with subtasks');
  return res.json();
}

export async function fetchChoresForRange(startDate, endDate) {
  const res = await fetch(`${API_BASE}/chores/for-range/${startDate}/${endDate}`);
  if (!res.ok) throw new Error('Failed to fetch chores for range');
  return res.json();
}

export async function fetchSubtasks(choreId) {
  const res = await fetch(`${API_BASE}/chores/${choreId}/subtasks`);
  if (!res.ok) throw new Error('Failed to fetch subtasks');
  return res.json();
}

export async function createSubtask(parentId, subtask) {
  // Sub-tasks are created as regular chores with parent_id
  return createChore({ ...subtask, parent_id: parentId });
}

// --- Rooms API ---

export async function fetchRooms() {
  const res = await fetch(`${API_BASE}/rooms`);
  if (!res.ok) throw new Error('Failed to fetch rooms');
  return res.json();
}

export async function createRoom(room) {
  const res = await fetch(`${API_BASE}/rooms`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(room),
  });
  if (!res.ok) throw new Error('Failed to create room');
  return res.json();
}

export async function updateRoom(id, room) {
  const res = await fetch(`${API_BASE}/rooms/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(room),
  });
  if (!res.ok) throw new Error('Failed to update room');
  return res.json();
}

export async function deleteRoom(id) {
  const res = await fetch(`${API_BASE}/rooms/${id}`, {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error('Failed to delete room');
  return res.json();
}



// --- Completions API ---

export async function fetchCompletionsForDate(dateStr) {

  const res = await fetch(`${API_BASE}/completions/${dateStr}`);
  if (!res.ok) throw new Error('Failed to fetch completions');
  return res.json();
}

export async function fetchCompletionsRange(startDate, endDate) {
  const res = await fetch(`${API_BASE}/completions?start=${startDate}&end=${endDate}`);
  if (!res.ok) throw new Error('Failed to fetch completions range');
  return res.json();
}

export async function toggleCompletion(choreId, dateStr) {
  const res = await fetch(`${API_BASE}/completions/toggle`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chore_id: choreId, date: dateStr }),
  });
  if (!res.ok) throw new Error('Failed to toggle completion');
  return res.json();
}

// --- Daily Order Overrides ---

export async function fetchDailyOrder(dateStr) {
  const res = await fetch(`${API_BASE}/daily-order/${dateStr}`);
  if (!res.ok) throw new Error('Failed to fetch daily order');
  return res.json();
}

export async function setDailyOrder(dateStr, order) {
  const res = await fetch(`${API_BASE}/daily-order/${dateStr}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ order }),
  });
  if (!res.ok) throw new Error('Failed to update daily order');
  return res.json();
}

// --- Utility ---

export async function resetToDefaults() {
  const res = await fetch(`${API_BASE}/reset`, { method: 'POST' });
  if (!res.ok) throw new Error('Failed to reset');
  return res.json();
}
