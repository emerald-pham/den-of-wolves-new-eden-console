import { beforeEach, expect, it, vi } from 'vitest';
import { useSessionStore } from '@/store/useSessionStore';
import type { GameSession, Player, WolfCommanderTargetingView } from '@/types/game';

vi.mock('firebase/auth', () => ({
  signInAnonymously: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('firebase/functions', () => ({
  httpsCallable: vi.fn(),
}));

vi.mock('./firebase', () => ({
  auth: () => ({ currentUser: { uid: 'u1' } }),
  functions: vi.fn(() => ({ kind: 'functions' })),
}));

const { httpsCallable } = await import('firebase/functions');
const { acceptCallableSessionAuthority } = await import('./sessionSnapshotAuthority');
const { applyWolfCommanderTargetRerolls, getWolfCommanderTargeting } = await import('./sessionService');

let fixtureNumber = 0;

function fixture(): { session: GameSession; player: Player } {
  fixtureNumber += 1;
  const sessionId = `wolf-service-${fixtureNumber}`;
  return {
    session: {
      id: sessionId,
      name: 'Table one',
      joinCode: '4821',
      phase: 'active',
      ownerUid: 'gm1',
      currentTurn: 1,
      updatedAt: `2026-09-12T21:00:0${fixtureNumber}.000Z`,
      createdAt: '2026-09-12T20:00:00.000Z',
    },
    player: {
      uid: 'u1',
      sessionId,
      displayName: 'Commander',
      role: 'player',
      seatId: null,
      replacementRoleId: 'wolf-commander',
      joinedAt: '2026-09-12T20:00:00.000Z',
    },
  };
}

function currentView(sessionId: string): WolfCommanderTargetingView {
  return {
    type: 'wolf-commander-targeting-view', sessionId, turn: 1, revision: 1,
    currentStep: 'targeting',
    rolls: [{ rosterIndex: 0, shipId: 'wolf-fighter-wing', die: 1, target: 'aegis' }],
    eligibleRerollIndexes: [0], rerolledIndexes: [],
  };
}

function committed(sessionId: string): Record<string, unknown> {
  return {
    status: 'committed', type: 'wolf-commander-target-reroll', sessionId,
    requestId: 'request-1', turn: 1, revision: 2, currentStep: 'targeting',
    rerolledIndexes: [0], view: { ...currentView(sessionId), revision: 2, eligibleRerollIndexes: [], rerolledIndexes: [0] },
  };
}

function setFreshIdentity(): { session: GameSession; player: Player } {
  const values = fixture();
  useSessionStore.getState().setIdentity(values.session, values.player);
  useSessionStore.getState().setConnection('live');
  useSessionStore.getState().setSessionSnapshotFreshness('server');
  expect(acceptCallableSessionAuthority(values.session, values.player.uid)).toBe(true);
  return values;
}

beforeEach(() => {
  useSessionStore.getState().reset();
  vi.mocked(httpsCallable).mockReset();
});

it('rejects a delayed read after the accepted session changes', async () => {
  const { session, player } = setFreshIdentity();
  let finish!: (value: { data: unknown }) => void;
  const call = Object.assign(vi.fn(() => new Promise<{ data: unknown }>((resolve) => { finish = resolve; })), { stream: vi.fn() });
  vi.mocked(httpsCallable).mockReturnValue(call as never);

  const reading = getWolfCommanderTargeting();
  await vi.waitFor(() => expect(call).toHaveBeenCalledWith({ sessionId: session.id }));
  const newer = { ...session, id: `${session.id}-new`, updatedAt: '2026-09-12T21:30:00.000Z' };
  useSessionStore.getState().setIdentity(newer, { ...player, sessionId: newer.id });
  acceptCallableSessionAuthority(newer, player.uid);
  finish({ data: currentView(session.id) });

  await expect(reading).rejects.toThrow(/session or authority changed/i);
});

it('rejects a delayed reroll after Commander authority is removed', async () => {
  const { session, player } = setFreshIdentity();
  let finish!: (value: { data: unknown }) => void;
  const call = Object.assign(vi.fn(() => new Promise<{ data: unknown }>((resolve) => { finish = resolve; })), { stream: vi.fn() });
  vi.mocked(httpsCallable).mockReturnValue(call as never);

  const rerolling = applyWolfCommanderTargetRerolls(1, 1, [0]);
  await vi.waitFor(() => expect(call).toHaveBeenCalledWith(expect.objectContaining({ sessionId: session.id, rosterIndexes: [0] })));
  useSessionStore.getState().setMe({ ...player, replacementRoleId: null });
  finish({ data: committed(session.id) });

  await expect(rerolling).rejects.toThrow(/session or authority changed/i);
});

it('rejects a callable reply bound to another session', async () => {
  setFreshIdentity();
  const call = Object.assign(vi.fn().mockResolvedValue({ data: currentView('another-session') }), { stream: vi.fn() });
  vi.mocked(httpsCallable).mockReturnValue(call as never);

  await expect(getWolfCommanderTargeting()).rejects.toThrow(/another session/i);
});
