import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { useSessionStore } from '@/store/useSessionStore';
import AppHeader from './AppHeader';

vi.mock('@/lib/sessionService', () => ({
  getSessionPresence: vi.fn(),
  releaseGmInstance: vi.fn(),
  disconnectFromSession: vi.fn(),
}));
const { getSessionPresence, releaseGmInstance } =
  await import('@/lib/sessionService');

beforeEach(() => {
  useSessionStore.getState().reset();
  useSessionStore.getState().setSession({
    id: 's1', name: 'Table one', joinCode: '4821', phase: 'lobby', ownerUid: 'u1',
    createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
  });
});

afterEach(() => vi.restoreAllMocks());

it('shows the last-player warning inside settings', async () => {
  const user = userEvent.setup();
  vi.mocked(getSessionPresence).mockResolvedValue({ connectedPlayers: 1 });
  render(<MemoryRouter><AppHeader /></MemoryRouter>);

  await user.click(screen.getByRole('button', { name: /settings/i }));

  expect(await screen.findByText(/you.re the last player to leave the server/i))
    .toHaveTextContent('After seven days of inactivity, this session will be deleted.');
  expect(screen.getByText(/build 0\.1\.18/i)).toBeInTheDocument();
});

it('focuses the dialog, closes it with Escape, and restores settings focus', async () => {
  const user = userEvent.setup();
  vi.mocked(getSessionPresence).mockResolvedValue({ connectedPlayers: 2 });
  render(<MemoryRouter><AppHeader /></MemoryRouter>);

  const settings = screen.getByRole('button', { name: /settings/i });
  await user.click(settings);
  expect(screen.getByRole('button', { name: /close settings/i })).toHaveFocus();

  await user.keyboard('{Escape}');

  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(settings).toHaveFocus();
});

it('releases this browser GM role from settings', async () => {
  const user = userEvent.setup();
  useSessionStore.getState().setGmInstance({
    id: 'local-1', sessionId: 's1', uid: 'u1', name: 'Bridge laptop',
    deviceLabel: 'macOS / Chrome', claimedAt: '2026-01-01T00:00:00.000Z',
  });
  vi.mocked(releaseGmInstance).mockImplementation(async () => {
    useSessionStore.getState().setGmInstance(null);
    return 'applied';
  });
  render(<MemoryRouter><AppHeader /></MemoryRouter>);

  await user.click(screen.getByRole('button', { name: /settings/i }));
  await user.click(screen.getByRole('button', { name: /release gm role/i }));

  expect(releaseGmInstance).toHaveBeenCalledOnce();
  expect(useSessionStore.getState().gmInstance).toBeNull();
});
