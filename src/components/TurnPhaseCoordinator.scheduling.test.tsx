import { act, render } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import TurnPhaseCoordinator from './TurnPhaseCoordinator';
import { useSessionStore } from '@/store/useSessionStore';
import type { GameSession, WolfAttackMemberView } from '@/types/game';

// Mount the real coordinator and publish through the real Store. Only the
// callable promise, attack feed and wall clock are inert controlled ports.
const transport = vi.hoisted(() => ({
  begin: vi.fn(),
  receive: undefined as undefined | ((view: WolfAttackMemberView | null) => void),
}));
vi.mock('@/lib/sessionService', () => ({ beginOpenAirspacePhase: transport.begin }));
vi.mock('@/lib/firestore', () => ({ subscribeWolfAttackMemberView: vi.fn((_id, receive) => {
  transport.receive = receive;
  receive(null);
  return vi.fn();
}) }));

function heldCall() {
  let resolve!: (value: void) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function publishSession(patch: Partial<GameSession> = {}) {
  const store = useSessionStore.getState();
  const session = store.session!;
  // An accepted member publication replaces both objects without changing the
  // phase clock. This is a consumer fixture, not an Auth/Firestore acceptance.
  store.setSession({ ...session, ...patch, turnPhase: patch.turnPhase ?? {
    ...session.turnPhase!, airspace: { ...session.turnPhase!.airspace },
  } });
}

async function tick(ms = 0) {
  await act(async () => { await vi.advanceTimersByTimeAsync(ms); });
}

async function change(update: () => void) {
  await act(async () => { update(); await Promise.resolve(); });
}

async function mount() {
  const mounted = render(<TurnPhaseCoordinator />);
  await act(async () => { await Promise.resolve(); });
  return mounted;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-09-06T12:00:00.000Z'));
  transport.begin.mockReset().mockResolvedValue(undefined);
  transport.receive = undefined;
  const store = useSessionStore.getState();
  store.reset();
  store.setIdentity({
    id: 's1', name: 'Table one', joinCode: '4821', phase: 'active', ownerUid: 'u1',
    createdAt: '2026-09-06T12:00:00.000Z', updatedAt: '2026-09-06T12:00:00.000Z',
    currentTurn: 2, turnPhase: {
      turn: 2, teamPhaseEndsAt: '2026-09-06T12:00:01.000Z',
      openAirspaceEndsAt: '2026-09-06T12:20:00.000Z',
      airspace: { state: 'restricted', tickerActive: true, pressAccess: false },
    },
  }, { uid: 'u1', sessionId: 's1', displayName: 'Player', role: 'player', seatId: null,
    joinedAt: '2026-09-06T12:00:00.000Z' });
  store.setConnection('live');
});

afterEach(() => vi.useRealTimers());

it('does not overlap or restart a successful handoff on harmless accepted member publications', async () => {
  const held = heldCall();
  transport.begin.mockReturnValueOnce(held.promise);
  await mount();
  await tick(1_000);
  expect(transport.begin).toHaveBeenCalledTimes(1);
  for (let index = 0; index < 3; index += 1) {
    await change(() => publishSession({ name: `Table publication ${index}` }));
    await tick();
    expect(transport.begin).toHaveBeenCalledTimes(1);
  }
  await change(() => held.resolve());
  await change(() => publishSession({ name: 'Publication after successful reply' }));
  await tick(10_000);
  expect(transport.begin).toHaveBeenCalledTimes(1);
});

it('keeps the five-second failed-call retry despite fresh publications and holds only one retry in flight', async () => {
  const first = heldCall(), retry = heldCall();
  transport.begin.mockReturnValueOnce(first.promise).mockReturnValueOnce(retry.promise);
  await mount();
  await tick(1_000);
  await change(() => first.reject(new Error('Controlled callable lock timeout.')));
  await change(() => publishSession({ name: 'Fresh publication during retry backoff' }));
  await tick(4_999);
  expect(transport.begin).toHaveBeenCalledTimes(1);
  await tick(1);
  expect(transport.begin).toHaveBeenCalledTimes(2);
  await change(() => publishSession({ name: 'Fresh publication during pending retry' }));
  await tick(5_000);
  expect(transport.begin).toHaveBeenCalledTimes(2);
  await change(() => retry.resolve());
});

it.each(['actor', 'session', 'cycle'] as const)(
  'retires the old retry and schedules the legitimate new %s only after the pending call settles', async scope => {
    const old = heldCall();
    const calls: Array<{ sessionId: string; actorUid: string; cycle: number }> = [];
    transport.begin.mockImplementation((cycle: number) => {
      const current = useSessionStore.getState();
      calls.push({ sessionId: current.session!.id, actorUid: current.me!.uid, cycle });
      return calls.length === 1 ? old.promise : Promise.resolve();
    });
    await mount();
    await tick(1_000);
    await change(() => {
      const current = useSessionStore.getState();
      if (scope === 'actor') current.setMe({ ...current.me!, uid: 'u2' });
      if (scope === 'session') {
        current.setIdentity({ ...current.session!, id: 's2' }, { ...current.me!, sessionId: 's2' });
      }
      if (scope === 'cycle') publishSession({ currentTurn: 3,
        turnPhase: { ...current.session!.turnPhase!, turn: 3 } });
    });
    await tick();
    expect(transport.begin).toHaveBeenCalledTimes(1);
    await change(() => old.reject(new Error('Obsolete scope call failed.')));
    await tick();
    expect(calls).toEqual([
      { sessionId: 's1', actorUid: 'u1', cycle: 2 },
      { sessionId: scope === 'session' ? 's2' : 's1', actorUid: scope === 'actor' ? 'u2' : 'u1',
        cycle: scope === 'cycle' ? 3 : 2 },
    ]);
    await tick(10_000);
    expect(transport.begin).toHaveBeenCalledTimes(2);
  },
);

const declaredAttack: WolfAttackMemberView = {
  type: 'wolf-attack-member-view', schemaVersion: 1, sessionId: 's1', attackId: 'attack-1',
  turn: 2, revision: 1, status: 'declared', phase: 'active', currentStep: 'targeting', range: null,
  deadlineAt: '2026-09-06T12:05:00.000Z', serverTime: '2026-09-06T12:00:00.000Z',
  visibility: 'members', redaction: ['composition', 'unresolved-dice', 'facilitator-notes', 'intervention-state'],
  results: [],
};

type Gate = 'connection' | 'pause' | 'manual' | 'attack';
function gate(kind: Gate, blocked: boolean) {
  const current = useSessionStore.getState();
  if (kind === 'connection') current.setConnection(blocked ? 'offline' : 'live');
  else if (kind === 'attack') transport.receive!(blocked ? declaredAttack : null);
  else {
    const phase = { ...current.session!.turnPhase! };
    if (kind === 'pause') {
      if (blocked) phase.timerPause = { window: 'restricted', remainingMs: 0,
        pausedAt: '2026-09-06T12:00:01.000Z' };
      else delete phase.timerPause;
    } else if (blocked) phase.progression = 'manual';
    else delete phase.progression;
    publishSession({ turnPhase: phase });
  }
}

it.each(['connection', 'pause', 'manual', 'attack'] as const)(
  'cancels retries behind the %s gate and resumes without overlapping a held call', async kind => {
    const first = heldCall(), resumed = heldCall();
    transport.begin.mockReturnValueOnce(first.promise).mockReturnValueOnce(resumed.promise);
    await mount();
    await tick(1_000);
    await change(() => gate(kind, true));
    await change(() => first.reject(new Error('Call failed while scheduling was inhibited.')));
    await tick(10_000);
    expect(transport.begin).toHaveBeenCalledTimes(1);
    await change(() => gate(kind, false));
    await tick();
    expect(transport.begin).toHaveBeenCalledTimes(2);
    await change(() => gate(kind, true));
    await change(() => gate(kind, false));
    await tick();
    expect(transport.begin).toHaveBeenCalledTimes(2);
    await change(() => resumed.reject(new Error('Current resumed call failed.')));
    await tick(4_999);
    expect(transport.begin).toHaveBeenCalledTimes(2);
    await tick(1);
    expect(transport.begin).toHaveBeenCalledTimes(3);
  },
);

it('cancels owned scheduling when the current actor disappears and resumes for a renewed actor', async () => {
  const held = heldCall();
  transport.begin.mockReturnValueOnce(held.promise);
  await mount();
  await tick(1_000);
  const member = useSessionStore.getState().me!;
  await change(() => useSessionStore.getState().setMe(null));
  await tick();
  expect(transport.begin).toHaveBeenCalledTimes(1);
  await change(() => held.reject(new Error('Actorless old request failed.')));
  await tick(10_000);
  expect(transport.begin).toHaveBeenCalledTimes(1);
  await change(() => useSessionStore.getState().setMe({ ...member, uid: 'u2' }));
  await tick();
  expect(transport.begin).toHaveBeenCalledTimes(2);
});

it('reschedules a legitimate changed Team deadline without firing the retired timer', async () => {
  await mount();
  await tick(500);
  await change(() => publishSession({ turnPhase: { ...useSessionStore.getState().session!.turnPhase!,
    teamPhaseEndsAt: '2026-09-06T12:00:03.000Z' } }));
  await tick(2_499);
  expect(transport.begin).not.toHaveBeenCalled();
  await tick(1);
  expect(transport.begin).toHaveBeenCalledExactlyOnceWith(2);
});

it('never retries a held failed call after the coordinator unmounts', async () => {
  const held = heldCall();
  transport.begin.mockReturnValueOnce(held.promise);
  const mounted = await mount();
  await tick(1_000);
  mounted.unmount();
  await change(() => held.reject(new Error('Unmounted request failed.')));
  await tick(20_000);
  expect(transport.begin).toHaveBeenCalledExactlyOnceWith(2);
});
