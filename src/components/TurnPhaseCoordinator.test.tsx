import { act, render } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import TurnPhaseCoordinator from './TurnPhaseCoordinator';
import { useSessionStore } from '@/store/useSessionStore';

vi.mock('@/lib/sessionService', () => ({ beginOpenAirspacePhase: vi.fn() }));
vi.mock('@/lib/firestore', () => ({ subscribeWolfAttackMemberView: vi.fn((_id, receive) => {
  receive(null);
  return vi.fn();
}) }));
const { beginOpenAirspacePhase } = await import('@/lib/sessionService');

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-09-06T12:00:00.000Z'));
  vi.mocked(beginOpenAirspacePhase).mockReset();
  vi.mocked(beginOpenAirspacePhase).mockResolvedValue(undefined);
  useSessionStore.getState().reset();
  useSessionStore.getState().setIdentity({
    id: 's1', name: 'Table one', joinCode: '4821', phase: 'active', ownerUid: 'u1',
    createdAt: '2026-09-06T12:00:00.000Z', updatedAt: '2026-09-06T12:00:00.000Z',
    currentTurn: 2,
    turnPhase: {
      turn: 2,
      teamPhaseEndsAt: '2026-09-06T12:05:00.000Z',
      openAirspaceEndsAt: '2026-09-06T12:20:00.000Z',
      airspace: { state: 'restricted', tickerActive: true, pressAccess: false },
    },
  }, {
    uid: 'u1', sessionId: 's1', displayName: 'Player', role: 'player', seatId: null,
    joinedAt: '2026-09-06T12:00:00.000Z',
  });
  useSessionStore.getState().setConnection('live');
});

afterEach(() => vi.useRealTimers());

it('asks the server to begin coordination exactly when the team window ends', async () => {
  render(<TurnPhaseCoordinator />);

  await act(async () => { await vi.advanceTimersByTimeAsync(4 * 60_000 + 59_000); });
  expect(beginOpenAirspacePhase).not.toHaveBeenCalled();
  await act(async () => { await vi.advanceTimersByTimeAsync(1_000); });
  expect(beginOpenAirspacePhase).toHaveBeenCalledWith(2);
});

it('keeps one phase-opening request in flight across a same-phase session snapshot', async () => {
  let finish!: () => void;
  const pending = new Promise<void>((resolve) => { finish = resolve; });
  vi.mocked(beginOpenAirspacePhase).mockReturnValue(pending);
  render(<TurnPhaseCoordinator />);

  try {
    await act(async () => { await vi.advanceTimersByTimeAsync(5 * 60_000); });
    expect(beginOpenAirspacePhase).toHaveBeenCalledTimes(1);

    // A still-pending transport alone must not schedule another request.
    await act(async () => { await vi.advanceTimersByTimeAsync(1_000); });
    expect(beginOpenAirspacePhase).toHaveBeenCalledTimes(1);

    const session = useSessionStore.getState().session;
    if (!session) throw new Error('Expected the original session.');
    await act(async () => {
      useSessionStore.getState().setSession({ ...session });
    });
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });

    expect(beginOpenAirspacePhase).toHaveBeenCalledTimes(1);
  } finally {
    await act(async () => { finish(); });
  }
});

it('reconciles an observed same-phase snapshot after a resolved no-apply result', async () => {
  let finish!: () => void;
  vi.mocked(beginOpenAirspacePhase).mockImplementationOnce(() => new Promise<void>((resolve) => { finish = resolve; }));
  render(<TurnPhaseCoordinator />);
  await act(async () => { await vi.advanceTimersByTimeAsync(5 * 60_000); });
  expect(beginOpenAirspacePhase).toHaveBeenCalledTimes(1);

  const session = useSessionStore.getState().session;
  if (!session) throw new Error('Expected the original session.');
  await act(async () => { useSessionStore.getState().setSession({ ...session }); });
  await act(async () => { await vi.advanceTimersByTimeAsync(0); });
  expect(beginOpenAirspacePhase).toHaveBeenCalledTimes(1);

  await act(async () => { finish(); });
  await act(async () => { await vi.advanceTimersByTimeAsync(0); });
  expect(beginOpenAirspacePhase).toHaveBeenCalledTimes(2);

  // A resolved void result is neither completion nor an unconditional cadence.
  await act(async () => { await vi.advanceTimersByTimeAsync(5_000); });
  expect(beginOpenAirspacePhase).toHaveBeenCalledTimes(2);
  await act(async () => { useSessionStore.getState().setSession({ ...session }); });
  await act(async () => { await vi.advanceTimersByTimeAsync(0); });
  expect(beginOpenAirspacePhase).toHaveBeenCalledTimes(3);
});

it('retains the five-second rejection retry after a same-phase observation replaced the effect', async () => {
  let fail!: (error: Error) => void;
  vi.mocked(beginOpenAirspacePhase).mockImplementationOnce(() => new Promise<void>((_resolve, reject) => { fail = reject; }));
  render(<TurnPhaseCoordinator />);
  await act(async () => { await vi.advanceTimersByTimeAsync(5 * 60_000); });
  const session = useSessionStore.getState().session;
  if (!session) throw new Error('Expected the original session.');
  await act(async () => { useSessionStore.getState().setSession({ ...session }); });
  await act(async () => { await vi.advanceTimersByTimeAsync(0); });
  expect(beginOpenAirspacePhase).toHaveBeenCalledTimes(1);

  await act(async () => { fail(new Error('Normal phase request rejected.')); });
  await act(async () => { await vi.advanceTimersByTimeAsync(4_999); });
  expect(beginOpenAirspacePhase).toHaveBeenCalledTimes(1);
  await act(async () => { await vi.advanceTimersByTimeAsync(1); });
  expect(beginOpenAirspacePhase).toHaveBeenCalledTimes(2);
});

it.each(['before cleanup', 'after cleanup before timer'] as const)(
  'retains the rejection delay when a same-phase snapshot arrives %s', async ordering => {
    let fail!: (error: Error) => void;
    vi.mocked(beginOpenAirspacePhase).mockImplementationOnce(() => new Promise<void>((_resolve, reject) => { fail = reject; }));
    render(<TurnPhaseCoordinator />);
    await act(async () => { await vi.advanceTimersByTimeAsync(5 * 60_000); });
    expect(beginOpenAirspacePhase).toHaveBeenCalledTimes(1);
    const session = useSessionStore.getState().session;
    if (!session) throw new Error('Expected the original session.');

    if (ordering === 'before cleanup') {
      await act(async () => {
        useSessionStore.getState().setSession({ ...session });
        fail(new Error('Normal phase request rejected.'));
      });
    } else {
      await act(async () => { useSessionStore.getState().setSession({ ...session }); });
      await act(async () => { fail(new Error('Normal phase request rejected.')); });
    }
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(beginOpenAirspacePhase).toHaveBeenCalledTimes(1);
    await act(async () => { await vi.advanceTimersByTimeAsync(4_999); });
    expect(beginOpenAirspacePhase).toHaveBeenCalledTimes(1);
    await act(async () => { await vi.advanceTimersByTimeAsync(1); });
    expect(beginOpenAirspacePhase).toHaveBeenCalledTimes(2);
  },
);

it('rechecks a current emergency hold when pending work settles before effect cleanup', async () => {
  let finish!: () => void;
  vi.mocked(beginOpenAirspacePhase).mockImplementationOnce(() => new Promise<void>((resolve) => { finish = resolve; }));
  render(<TurnPhaseCoordinator />);
  await act(async () => { await vi.advanceTimersByTimeAsync(5 * 60_000); });
  const session = useSessionStore.getState().session;
  if (!session?.turnPhase) throw new Error('Expected the original phase.');
  await act(async () => { useSessionStore.getState().setSession({ ...session }); });
  await act(async () => { await vi.advanceTimersByTimeAsync(0); });

  await act(async () => {
    useSessionStore.getState().setSession({ ...session, turnPhase: {
      ...session.turnPhase!, timerPause: { window: 'restricted', remainingMs: 1_000, pausedAt: new Date().toISOString() },
    } });
    finish();
  });
  await act(async () => { await vi.advanceTimersByTimeAsync(5_000); });
  expect(beginOpenAirspacePhase).toHaveBeenCalledTimes(1);
});

it.each(['actor', 'session', 'cycle', 'offline', 'lifted'] as const)(
  'does not replay the withdrawn original transition after %s changes', async change => {
    let finish!: () => void;
    const pending = new Promise<void>(resolve => { finish = resolve; });
    const calls: Array<{ sessionId: string | undefined; uid: string | undefined; cycle: number }> = [];
    vi.mocked(beginOpenAirspacePhase).mockImplementation(cycle => {
      const state = useSessionStore.getState();
      calls.push({ sessionId: state.session?.id, uid: state.me?.uid, cycle });
      return calls.length === 1 ? pending : Promise.resolve();
    });
    render(<TurnPhaseCoordinator />);
    await act(async () => { await vi.advanceTimersByTimeAsync(5 * 60_000); });
    const state = useSessionStore.getState();
    if (!state.session?.turnPhase || !state.me) throw new Error('Expected the original phase and actor.');
    const session = state.session;
    await act(async () => { useSessionStore.getState().setSession({ ...session }); });
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });

    await act(async () => {
      if (change === 'actor') useSessionStore.getState().setMe({ ...state.me!, uid: 'u2' });
      if (change === 'session') useSessionStore.getState().setIdentity({ ...session, id: 's2' }, { ...state.me!, sessionId: 's2' });
      if (change === 'cycle') useSessionStore.getState().setSession({ ...session, currentTurn: 3,
        turnPhase: { ...session.turnPhase!, turn: 3, teamPhaseEndsAt: '2026-09-06T12:10:00.000Z' } });
      if (change === 'offline') useSessionStore.getState().setConnection('offline');
      if (change === 'lifted') useSessionStore.getState().setSession({ ...session,
        turnPhase: { ...session.turnPhase!, airspace: { ...session.turnPhase!.airspace, state: 'lifted' } } });
      finish();
    });
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(calls.filter(call => call.sessionId === 's1' && call.uid === 'u1' && call.cycle === 2)).toHaveLength(1);
    if (change === 'cycle') {
      expect(calls).toHaveLength(1);
      await act(async () => { await vi.advanceTimersByTimeAsync(5 * 60_000); });
      expect(calls.at(-1)?.cycle).toBe(3);
    }
    expect(calls).toHaveLength(change === 'offline' || change === 'lifted' ? 1 : 2);
  },
);

it('does not promote airspace while the emergency timer hold is active', async () => {
  const session = useSessionStore.getState().session;
  if (!session) throw new Error('Expected the test session.');
  useSessionStore.getState().setSession({
    ...session,
    turnPhase: {
      ...session.turnPhase!,
      timerPause: {
        window: 'restricted',
        remainingMs: 180_000,
        pausedAt: '2026-09-06T12:02:00.000Z',
      },
    },
  } as never);

  render(<TurnPhaseCoordinator />);

  await act(async () => { await vi.advanceTimersByTimeAsync(30 * 60_000); });
  expect(beginOpenAirspacePhase).not.toHaveBeenCalled();
});
