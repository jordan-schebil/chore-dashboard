import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import { act } from 'react';
import ChoreDashboard from '../ChoreDashboard.jsx';

vi.mock('../api', () => ({
  fetchChoresWithSubtasks: vi.fn(),
  fetchChoresForRange: vi.fn(),
  fetchCompletionsRange: vi.fn(),
  fetchCompletionsForDate: vi.fn(),
  toggleCompletion: vi.fn(),
  createChore: vi.fn(),
  updateChore: vi.fn(),
  deleteChore: vi.fn(),
  fetchChores: vi.fn(),
  resetToDefaults: vi.fn(),
  fetchDailyOrder: vi.fn(),
  setDailyOrder: vi.fn(),
  updateGlobalOrder: vi.fn(),
  fetchRooms: vi.fn()
}));

const api = await import('../api');

const baseChores = [
  {
    id: 'chore-1',
    name: 'Test Chore',
    schedule_type: 'daily',
    schedule: {},
    time_of_day: 'AM',
    minutes: 5,
    parent_id: null
  }
];

describe('ChoreDashboard', () => {
  beforeEach(() => {
    const now = new Date();
    const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    api.fetchChoresWithSubtasks.mockResolvedValue(baseChores);
    api.fetchChoresForRange.mockResolvedValue({
      start: dateStr,
      end: dateStr,
      chores_by_date: {
        [dateStr]: baseChores
      }
    });
    api.fetchRooms.mockResolvedValue([]);
    api.fetchCompletionsRange.mockResolvedValue({});
    api.toggleCompletion.mockResolvedValue({ completed: true });
    api.fetchDailyOrder.mockResolvedValue({ order: [] });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('renders the header and current month', async () => {
    render(<ChoreDashboard />);
    await waitFor(() => expect(api.fetchCompletionsRange).toHaveBeenCalled());
    expect(await screen.findByText('Chore Dashboard')).toBeInTheDocument();
    const now = new Date();
    const monthNames = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'
    ];
    const expected = `${monthNames[now.getMonth()]} ${now.getFullYear()}`;
    expect(await screen.findByText(expected)).toBeInTheDocument();
  });

  it('renders daily chores for the selected date', async () => {
    render(<ChoreDashboard />);
    await waitFor(() => expect(api.fetchCompletionsRange).toHaveBeenCalled());
    expect(await screen.findByText('Test Chore')).toBeInTheDocument();
  });

  it('toggles completion and calls the API', async () => {
    const user = userEvent.setup();
    render(<ChoreDashboard />);
    await waitFor(() => expect(api.fetchCompletionsRange).toHaveBeenCalled());
    const chore = await screen.findByText('Test Chore');
    await act(async () => {
      await user.click(chore);
    });
    const now = new Date();
    const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    await waitFor(() => {
      expect(api.toggleCompletion).toHaveBeenCalledWith('chore-1', dateStr);
    });
  });
});
