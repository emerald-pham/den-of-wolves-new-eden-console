import { act, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import type { PressLogEntry } from '@/lib/pressLogState';
import { useSessionStore } from '@/store/useSessionStore';
import PressEventLog from './PressEventLog';

const subscribePressLog = vi.fn();
vi.mock('@/lib/pressLogService', () => ({
  subscribePressLog: (...args: unknown[]) => subscribePressLog(...args),
}));

beforeEach(() => {
  subscribePressLog.mockReset().mockReturnValue(vi.fn());
  useSessionStore.getState().reset();
  useSessionStore.getState().setIdentity({
    id: 's1', name: 'Table', joinCode: '4821', phase: 'active', ownerUid: 'gm1',
    currentTurn: 3,
  }, {
    uid: 'press1', sessionId: 's1', displayName: 'Press Officer', role: 'player',
    seatId: null, activeConsoleRoleId: 'press-officer', joinedAt: '',
  });
  useSessionStore.getState().setConnection('live');
  useSessionStore.getState().setSessionSnapshotFreshness('server');
});

it('shows survivor changes, Commissar purges and presidential copy on the Press desk', async () => {
  let deliver: ((entries: readonly PressLogEntry[]) => void) | undefined;
  subscribePressLog.mockImplementation((_sessionId: string, onEntries: typeof deliver) => {
    deliver = onEntries;
    return vi.fn();
  });
  render(<PressEventLog />);

  await waitFor(() => expect(subscribePressLog).toHaveBeenCalledWith(
    's1', expect.any(Function), expect.any(Function),
  ));
  const entries: readonly PressLogEntry[] = [
    { id: 'one', type: 'survivor-change', sourceId: 'damage:r1', cause: 'ship-damage',
      vesselId: 'aegis', cycle: 3, recordedAt: '2026-09-27T21:00:00.000Z',
      fromPopulation: 2_500, toPopulation: 2_000 },
    { id: 'two', type: 'commissar-purge', sourceId: 'purge:r2', shipId: 'icebreaker',
      cycle: 3, recordedAt: '2026-09-27T21:01:00.000Z', survivorsRemoved: 500,
      populationBefore: 2_000, populationAfter: 1_500, unrestBefore: 4, unrestAfter: 3 },
    { id: 'three', type: 'president-action', sourceId: 'president:r3', actionKind: 'address',
      text: 'The fleet will hold course.', cycle: 3, recordedAt: '2026-09-27T21:02:00.000Z' },
  ];
  act(() => deliver?.(entries));

  const log = screen.getByRole('region', { name: 'SNN Press log' });
  expect(log).toHaveTextContent('AEGIS');
  expect(log).toHaveTextContent('2,500');
  expect(log).toHaveTextContent('2,000');
  expect(log).toHaveTextContent('Commissar');
  expect(log).toHaveTextContent('500 survivors');
  expect(log).toHaveTextContent('The fleet will hold course.');
});

it('does not subscribe or show the restricted log outside the Press Officer role', () => {
  const me = useSessionStore.getState().me;
  if (!me) throw new Error('Expected the test player.');
  useSessionStore.getState().setMe({ ...me, activeConsoleRoleId: null });
  render(<PressEventLog />);

  expect(screen.queryByRole('region', { name: 'SNN Press log' })).not.toBeInTheDocument();
  expect(subscribePressLog).not.toHaveBeenCalled();
});

it('clears loaded Press copy as soon as the active role changes', async () => {
  let deliver: ((entries: readonly PressLogEntry[]) => void) | undefined;
  const unsubscribe = vi.fn();
  subscribePressLog.mockImplementation((_sessionId: string, onEntries: typeof deliver) => {
    deliver = onEntries;
    return unsubscribe;
  });
  const { rerender } = render(<PressEventLog />);
  await waitFor(() => expect(subscribePressLog).toHaveBeenCalled());
  act(() => deliver?.([{
    id: 'president', type: 'president-action', sourceId: 'president:r4', actionKind: 'address',
    text: 'A restricted Press item.', cycle: 3, recordedAt: '2026-09-27T21:00:00.000Z',
  }]));
  expect(screen.getByText('A restricted Press item.')).toBeVisible();

  const me = useSessionStore.getState().me;
  if (!me) throw new Error('Expected the test player.');
  act(() => useSessionStore.getState().setMe({ ...me, activeConsoleRoleId: null }));
  rerender(<PressEventLog />);

  expect(screen.queryByText('A restricted Press item.')).not.toBeInTheDocument();
  expect(unsubscribe).toHaveBeenCalledOnce();
});
