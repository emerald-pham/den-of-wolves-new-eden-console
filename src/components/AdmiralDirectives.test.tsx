import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, it, vi } from 'vitest';
import AdmiralDirectiveWorkspace, { FleetDirectives } from './AdmiralDirectives';
import { useSessionStore } from '@/store/useSessionStore';

const publish = vi.fn();
vi.mock('@/lib/admiralDirectiveService', () => ({
  publishAdmiralDirective: (...args: unknown[]) => publish(...args),
}));

beforeEach(() => {
  publish.mockReset().mockResolvedValue(undefined);
  useSessionStore.getState().reset();
  useSessionStore.getState().setIdentity({
    id: 's1', name: 'Session', joinCode: '123456', phase: 'active', ownerUid: 'u1',
    createdAt: '', updatedAt: '', currentTurn: 2,
    admiralDirectives: {
      revision: 2,
      entries: [
        { id: 'one', kind: 'fleet-policy', text: 'Preserve civilian fuel reserves.', cycle: 1, publishedAt: '2026-09-21T12:00:00.000Z' },
        { id: 'two', kind: 'defence-coordination', text: 'Hold fighters at short range.', cycle: 2, publishedAt: '2026-09-21T12:01:00.000Z' },
      ],
    },
  }, {
    uid: 'u1', sessionId: 's1', displayName: 'Admiral', role: 'player',
    seatId: null, activeConsoleRoleId: 'admiral', joinedAt: '',
  });
  useSessionStore.getState().setConnection('live');
  useSessionStore.getState().setSessionSnapshotFreshness('server');
});

it('publishes only the selected permitted directive category and waits for the server projection', async () => {
  const user = userEvent.setup();
  render(<AdmiralDirectiveWorkspace />);

  await user.type(screen.getByLabelText('Fleet policy'), 'Conserve jump fuel.');
  await user.click(screen.getByRole('button', { name: 'Publish fleet policy' }));
  expect(publish).toHaveBeenCalledWith('fleet-policy', 'Conserve jump fuel.');
  expect(screen.getByRole('status', { name: '' })).toBeInTheDocument();
  expect(screen.getByText('Fleet policy published.')).toBeVisible();
  expect(screen.getAllByRole('listitem')).toHaveLength(2);
});

it('keeps publication disabled without fresh live authority', () => {
  act(() => useSessionStore.getState().setSessionSnapshotFreshness('cache'));
  render(<AdmiralDirectiveWorkspace />);
  expect(screen.getByLabelText('Fleet policy')).toBeDisabled();
  expect(screen.getByText(/publication unavailable.*reconnect/i)).toBeVisible();
});

it('shows published directives to every session surface without exposing a command', async () => {
  const user = userEvent.setup();
  render(<FleetDirectives />);
  await user.click(screen.getByText('Fleet directives'));
  const board = screen.getByRole('region', { name: 'Current fleet directives' });
  expect(board).toHaveTextContent('Defence coordination // Cycle 2');
  expect(board).toHaveTextContent('Hold fighters at short range.');
  expect(board).toHaveTextContent('Fleet policy // Cycle 1');
  expect(board).not.toHaveTextContent(/publish/i);
});
