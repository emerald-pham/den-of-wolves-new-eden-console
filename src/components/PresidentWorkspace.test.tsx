import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, it, vi } from 'vitest';
import PresidentWorkspace from './PresidentWorkspace';
import { useSessionStore } from '@/store/useSessionStore';

const record = vi.fn();
vi.mock('@/lib/presidentWorkspaceService', () => ({ recordPresidentAction: (...args: unknown[]) => record(...args) }));

beforeEach(() => {
  record.mockReset().mockResolvedValue(undefined);
  useSessionStore.getState().reset();
  useSessionStore.getState().setIdentity({
    id: 's1', name: 'Session', joinCode: '123456', phase: 'active', ownerUid: 'u1',
    createdAt: '', updatedAt: '', currentTurn: 2,
    presidentWorkspace: { revision: 1, entries: [{ id: 'one', kind: 'crisis',
      text: 'Accept the negotiated settlement.', cycle: 2, recordedAt: '2026-09-21T21:00:00.000Z' }] },
  }, { uid: 'u1', sessionId: 's1', displayName: 'President', role: 'player', seatId: null,
    activeConsoleRoleId: 'dione-president', joinedAt: '' });
  useSessionStore.getState().setConnection('live');
  useSessionStore.getState().setSessionSnapshotFreshness('server');
});

it('records each selected action family while history waits for server projection', async () => {
  const user = userEvent.setup();
  render(<PresidentWorkspace writable />);
  await user.selectOptions(screen.getByLabelText('Action family'), 'visit');
  await user.type(screen.getByLabelText('Decision record'), 'Visit Shepherd during Team Time.');
  await user.click(screen.getByRole('button', { name: 'Record presidential visit' }));
  expect(record).toHaveBeenCalledWith('visit', 'Visit Shepherd during Team Time.');
  expect(screen.getByText('Presidential visit recorded.')).toBeVisible();
  expect(screen.getByRole('list', { name: 'President action history' })).toHaveTextContent('Crisis decision // Cycle 2');
});

it('requires role write authority and a fresh live session', () => {
  act(() => useSessionStore.getState().setSessionSnapshotFreshness('cache'));
  render(<PresidentWorkspace writable={false} />);
  expect(screen.getByLabelText('Action family')).toBeDisabled();
  expect(screen.getByText(/active President authority and live connection required/i)).toBeVisible();
});
