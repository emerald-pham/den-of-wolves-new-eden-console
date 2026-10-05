import { act, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import App from './App';
import { useSessionStore } from '@/store/useSessionStore';
import type { GameSession, GmInstance, Player, WolfAttackMemberView } from '@/types/game';
import { SESSION_WAIVER_STORAGE_KEY } from '@/lib/sessionWaiver';
import { MOTION_SAFETY_STORAGE_KEY } from '@/lib/motionSafety';
import { stripPersistedNavigationProjection } from '@/lib/navigationPrivacy';

vi.mock('@/lib/sessionService', () => ({
  getWolfAmnestyView: vi.fn(async () => ({ type: 'wolf-amnesty-view',
    sessionId: useSessionStore.getState().session?.id ?? 's1', offer: null })),
  getWolfBoardingDefenceChoice: vi.fn(async () => null),
  getWolfBoardingSpecialChoice: vi.fn(async () => ({
    type: 'wolf-boarding-special-choice-unavailable', sessionId: 's1', reason: 'no-special-choice',
  })),
  getWolfRangeActionChoice: vi.fn(async () => null),
  getWolfForceFieldChoice: vi.fn(async () => null),
  commitWolfBoardingDefenceChoice: vi.fn(),
  commitWolfBoardingSpecialChoice: vi.fn(async () => ({
    status: 'committed', type: 'wolf-boarding-special-choice', sessionId: 's1', requestId: 'fixture-choice',
    turn: 1, revision: 1, currentStep: 'boarding', choiceKind: 'commander',
  })),
  commitWolfRangeActionChoice: vi.fn(),
  commitWolfForceFieldChoice: vi.fn(),
  getAegisEnrichedWarheadChoice: vi.fn(async () => ({
    type: 'aegis-enriched-warhead-view', sessionId: 's1', attackId: 'fixture-attack',
    turn: 1, revision: 0, choiceStatus: 'unavailable', eligible: false, oreCost: 5,
  })),
  commitAegisEnrichedWarheadChoice: vi.fn(async () => ({
    type: 'aegis-enriched-warhead-result', status: 'committed', sessionId: 's1',
    requestId: 'fixture-choice', turn: 1, revision: 1,
    view: { type: 'aegis-enriched-warhead-view', sessionId: 's1', attackId: 'fixture-attack',
      turn: 1, revision: 1, choiceStatus: 'passed', eligible: false, oreCost: 5 },
  })),
  CONNECT_RETRY_INTERVAL_MS: 2_000,
  connectAutomatically: vi.fn().mockResolvedValue(undefined),
  beginOpenAirspacePhase: vi.fn().mockResolvedValue(undefined),
  acknowledgeWolfHackingAlert: vi.fn(),
  createSession: vi.fn(),
  disconnectFromSession: vi.fn(),
  joinSession: vi.fn(),
  kickGmInstance: vi.fn(),
  loginGmAccess: vi.fn(),
  listGmInstances: vi.fn().mockResolvedValue([]),
  logoutGmAccess: vi.fn(),
  popShipConfetti: vi.fn(),
  reconcileGmAuthority: vi.fn().mockResolvedValue(undefined),
  readClosedSessionHistory: vi.fn().mockResolvedValue(false),
  refreshPresence: vi.fn().mockResolvedValue(undefined),
  refreshCommissarPurgeAuthority: vi.fn().mockResolvedValue(null),
  requireStationReselectionForCurrentSession: vi.fn(),
  releaseConsoleRole: vi.fn().mockResolvedValue(undefined),
  releaseGmInstance: vi.fn(),
  selectConsoleRole: vi.fn().mockResolvedValue(undefined),
  setGmControlsLocked: vi.fn(),
  triggerDradisContact: vi.fn(),
}));

vi.mock('@/lib/firestore', () => ({
  subscribeCrisisReport: vi.fn(() => vi.fn()),
  sessionSnapshotAuthorityFor: vi.fn(() => ({ hasServerSessionAuthority: false })),
  subscribeConnectedPlayers: vi.fn(() => vi.fn()),
  subscribeSessionState: vi.fn(() => vi.fn()),
  subscribeWolfAttackMemberView: vi.fn((_sessionId: string, onView: (view: WolfAttackMemberView | null) => void) => {
    onView(null);
    return vi.fn();
  }),
  subscribeLoyaltyCensus: vi.fn(() => vi.fn()),
  subscribeGmWolfHackingAlerts: vi.fn(() => vi.fn()),
  subscribePlayerHackingNotices: vi.fn(() => vi.fn()),
  subscribeGmInstances: vi.fn((
    _sessionId: string,
    onInstances: (instances: readonly GmInstance[]) => void,
  ) => {
    onInstances([]);
    return vi.fn();
  }),
  subscribeShipConfetti: vi.fn(() => vi.fn()),
  subscribeSessionEvents: vi.fn((_sessionId: string, onEvents: (events: never[]) => void) => {
    onEvents([]);
    return vi.fn();
  }),
  subscribeDamageDraws: vi.fn((_sessionId: string, onDraws: (draws: never[]) => void) => {
    onDraws([]);
    return vi.fn();
  }),
  subscribeVipCards: vi.fn(() => vi.fn()),
}));

vi.mock('@/lib/versionUpgrade', () => ({
  startVersionUpgradeMonitor: vi.fn(() => vi.fn()),
}));

const { subscribeSessionState } = await import('@/lib/firestore');
const listeners: Array<Parameters<typeof subscribeSessionState>[2]> = [];
const session: GameSession = { id: 's1', name: 'Native', joinCode: 'ABCD', phase: 'active', currentTurn: 1,
  createdAt: '2026-10-05T12:00:00.000Z', updatedAt: '2026-10-05T12:01:00.000Z' };
const member: Player = { uid: 'u1', sessionId: 's1', displayName: 'Native', role: 'player', connected: true,
  fleetGroupId: 'fleet-1', connectionGeneration: 4, assignedRoleId: 'dione-captain', activeConsoleRoleId: 'dione-captain',
  replacementRoleId: null, replacementStatus: null, seatId: 'dione-captain', joinedAt: '2026-10-05T12:00:00.000Z' };
const authority = (change = {}) => ({ sessionId: 's1', actorUid: 'u1', groupId: 'fleet-1', role: 'player',
  connectionGeneration: 4, assignedRoleId: 'dione-captain', activeConsoleRoleId: 'dione-captain',
  replacementRoleId: null, replacementStatus: null, shipId: 'shepherd', ...change });
const discovery = (change = {}) => ({ groupId: 'fleet-1', shipId: 'shepherd', fleetGroupVesselIds: ['dione', 'shepherd', 'icebreaker'],
  currentCoordinate: '1413', knownCoordinates: ['0000', '1413'], knownSystems: {}, pursuitDistance: 1,
  navigationLogs: [], revision: 2, ...change });
const currentSession = (witness: unknown = authority()) => ({ ...session,
  memberSessionScope: { groupId: 'fleet-1', vesselIds: ['dione', 'shepherd', 'icebreaker', 'quellon', 'refinery-124'], craftIds: [] },
  currentActorBerthAuthority: witness } as GameSession);
let unmount: (() => void) | undefined;

beforeEach(() => {
  useSessionStore.getState().reset(); localStorage.clear(); window.location.hash = '#/'; listeners.length = 0;
  localStorage.setItem(MOTION_SAFETY_STORAGE_KEY, JSON.stringify({ acknowledgedAt: Date.now(), choice: 'reduce' }));
  localStorage.setItem(SESSION_WAIVER_STORAGE_KEY, String(Date.now()));
  vi.mocked(subscribeSessionState).mockReset().mockImplementation((_sid, _uid, handlers) => {
    listeners.push(handlers); return vi.fn();
  });
});
afterEach(() => { unmount?.(); unmount = undefined; });
async function begin(actor = member, witness: unknown = authority()) {
  useSessionStore.getState().setIdentity(currentSession(witness), actor);
  useSessionStore.getState().setConnection('live');
  useSessionStore.getState().setSessionSnapshotFreshness('server');
  unmount = render(<App />).unmount;
  await waitFor(() => expect(listeners).toHaveLength(1));
  act(() => listeners[0]!.onPlayerFreshness?.(true));
  return listeners[0]!;
}
function expectWithdrawn() {
  const current = useSessionStore.getState().session;
  expect(current?.playerDiscovery).toBeUndefined();
  expect(current?.shipGalacticCoordinates).toBeUndefined();
  expect(current?.shipNavigationLogs).toBeUndefined();
}

it.each([
  { roleId: 'joint-engineering-shepherd-icebreaker', replacementRoleId: null, shipId: 'icebreaker' },
  { roleId: 'joint-engineering-quellon-refinery', replacementRoleId: null, shipId: 'refinery-124' },
  { roleId: 'dione-captain', replacementRoleId: 'comms-officer', shipId: 'shepherd' },
  { roleId: 'dione-captain', replacementRoleId: 'warrior-captain', shipId: 'icebreaker' },
])('delivers only the independently current protected berth for $roleId / $replacementRoleId', async ({ roleId, replacementRoleId, shipId }) => {
  const actor: Player = { ...member, assignedRoleId: roleId, replacementRoleId,
    activeConsoleRoleId: replacementRoleId ? null : roleId, seatId: replacementRoleId ? null : roleId };
  const witness = authority({ assignedRoleId: roleId, activeConsoleRoleId: actor.activeConsoleRoleId, replacementRoleId, shipId });
  const callbacks = await begin(actor, witness);
  const own = discovery({ shipId, fleetGroupVesselIds: [shipId] });
  act(() => callbacks.onPlayerDiscovery?.(own));
  expect(useSessionStore.getState().session?.playerDiscovery).toEqual(own);
  expect(useSessionStore.getState().session?.shipGalacticCoordinates).toEqual({ [shipId]: '1413' });
  expect(useSessionStore.getState().session?.shipNavigationLogs).toEqual({ [shipId]: [] });
});

it.each([
  ['foreign UID', { actorUid: 'other' }], ['wrong session', { sessionId: 's2' }],
  ['wrong group', { groupId: 'fleet-2' }], ['wrong generation', { connectionGeneration: 3 }],
  ['wrong player role', { role: 'gm' }], ['wrong assigned role', { assignedRoleId: 'admiral' }],
  ['wrong current console', { activeConsoleRoleId: null }], ['wrong replacement role', { replacementRoleId: 'doctor' }],
  ['suspended replacement', { replacementStatus: 'awaiting-re-role' }], ['wrong berth', { shipId: 'icebreaker' }],
] as const)('a present %s witness cannot fall back to the historical static ship', async (_name, change) => {
  const callbacks = await begin(member, authority({ shipId: 'dione', ...change }));
  act(() => callbacks.onPlayerDiscovery?.(discovery({ shipId: 'dione' })));
  expectWithdrawn();
});

it.each([null, {}, { ...authority({ shipId: 'dione' }), privateMap: { other: 'aegis' } }])
  ('a present invalid witness %j cannot fall back to legacy navigation', async witness => {
    const callbacks = await begin(member, witness);
    act(() => callbacks.onPlayerDiscovery?.(discovery({ shipId: 'dione' })));
    expectWithdrawn();
  });

it.each(['member', 'session'] as const)('holds a matching current berth until independent %s authority is fresh', async source => {
  const callbacks = await begin();
  act(() => {
    if (source === 'member') callbacks.onPlayerFreshness?.(false);
    else callbacks.onSessionFreshness?.(false);
    callbacks.onSession(currentSession());
    callbacks.onPlayerDiscovery?.(discovery());
  });
  expectWithdrawn();
  if (source === 'session') {
    act(() => callbacks.onSessionFreshness?.(true));
    expectWithdrawn();
  }
  // Session loss retires the existing independent player freshness too. A
  // renewed header alone must not reinstate that player's private audience.
  act(() => callbacks.onPlayerFreshness?.(true));
  expect(useSessionStore.getState().session?.playerDiscovery?.shipId).toBe('shepherd');
});

it.each(['console', 'generation', 'replacement', 'group'] as const)('withdraws accepted navigation when the current actor %s changes', async dimension => {
  const callbacks = await begin();
  act(() => callbacks.onPlayerDiscovery?.(discovery()));
  expect(useSessionStore.getState().session?.playerDiscovery?.shipId).toBe('shepherd');
  const change = { console: { activeConsoleRoleId: null }, generation: { connectionGeneration: 5 },
    replacement: { replacementRoleId: 'doctor' }, group: { fleetGroupId: 'fleet-2' } }[dimension];
  act(() => callbacks.onPlayer({ ...member, ...change }));
  expectWithdrawn();
  act(() => callbacks.onPlayerDiscovery?.(discovery()));
  expectWithdrawn();
});

it('clears old host navigation on a new current member berth and waits for matching protected history', async () => {
  const callbacks = await begin();
  act(() => callbacks.onPlayerDiscovery?.(discovery()));
  expect(useSessionStore.getState().session?.playerDiscovery?.shipId).toBe('shepherd');
  act(() => callbacks.onSession(currentSession(authority({ shipId: 'icebreaker' }))));
  expectWithdrawn();
  act(() => callbacks.onPlayerDiscovery?.(discovery({ shipId: 'icebreaker', revision: 3 })));
  expect(useSessionStore.getState().session?.playerDiscovery?.shipId).toBe('icebreaker');
});

it('cache downgrade retires the witness and old discovery until a new current read and protected callback', async () => {
  const callbacks = await begin();
  act(() => callbacks.onPlayerDiscovery?.(discovery()));
  expect(useSessionStore.getState().session?.playerDiscovery?.shipId).toBe('shepherd');
  act(() => useSessionStore.getState().setSessionSnapshotFreshness('cache'));
  expectWithdrawn();
  expect(useSessionStore.getState().session).toHaveProperty('currentActorBerthAuthority', null);
  act(() => {
    useSessionStore.getState().setSessionSnapshotFreshness('server');
    callbacks.onPlayerFreshness?.(true);
    callbacks.onPlayerDiscovery?.(discovery());
  });
  expectWithdrawn();
  act(() => {
    callbacks.onSession(currentSession()); callbacks.onSessionFreshness?.(true);
    callbacks.onPlayerDiscovery?.(discovery());
  });
  expect(useSessionStore.getState().session?.playerDiscovery?.shipId).toBe('shepherd');
});

it('does not preserve the own actor witness across persistence or a forged persisted session', async () => {
  const callbacks = await begin(); act(() => callbacks.onPlayerDiscovery?.(discovery()));
  const current = useSessionStore.getState().session!;
  expect(stripPersistedNavigationProjection(current)).not.toHaveProperty('currentActorBerthAuthority');
  const options = useSessionStore.persist.getOptions();
  expect(options.partialize?.(useSessionStore.getState()).session).not.toHaveProperty('currentActorBerthAuthority');
  const restored = options.merge?.({ session: current, me: member }, useSessionStore.getState());
  expect(restored?.session).not.toHaveProperty('currentActorBerthAuthority');
  expect(restored?.session?.playerDiscovery).toBeUndefined();
});

it.each(['closed', 'logout', 'kicked'] as const)('retires private current berth on %s and rejects a late private callback', async ending => {
  const callbacks = await begin(); act(() => callbacks.onPlayerDiscovery?.(discovery()));
  expect(useSessionStore.getState().session?.playerDiscovery?.shipId).toBe('shepherd');
  act(() => {
    if (ending === 'closed') callbacks.onSession({ ...currentSession(), phase: 'closed' });
    else if (ending === 'kicked') callbacks.onKicked();
    else useSessionStore.getState().disconnect();
  });
  expectWithdrawn();
  expect(useSessionStore.getState().session ?? {}).not.toHaveProperty('currentActorBerthAuthority');
  act(() => callbacks.onPlayerDiscovery?.(discovery()));
  expectWithdrawn();
});

it.each([
  ['foreign discovery group', { groupId: 'fleet-2' }],
  ['berth absent from discovery audience', { fleetGroupVesselIds: ['dione'] }],
  ['missing current vessel audience', { fleetGroupVesselIds: undefined }],
])('rejects %s despite a matching callable witness', async (_name, change) => {
  const callbacks = await begin();
  act(() => callbacks.onPlayerDiscovery?.(discovery(change)));
  expectWithdrawn();
});

it.each([
  { connected: false },
  { replacementStatus: 'awaiting-re-role' as const, activeConsoleRoleId: null },
])('a matching private tuple cannot restore an inactive or suspended player: %j', async change => {
  const actor = { ...member, ...change };
  const callbacks = await begin(actor, authority(change));
  act(() => callbacks.onPlayerDiscovery?.(discovery()));
  expectWithdrawn();
});

it('keeps accepted own navigation across a fresh same-authority player heartbeat', async () => {
  const callbacks = await begin();
  act(() => callbacks.onPlayerDiscovery?.(discovery()));
  expect(useSessionStore.getState().session?.playerDiscovery?.shipId).toBe('shepherd');
  act(() => { callbacks.onPlayer({ ...member, lastSeenAt: '2026-10-05T12:02:00.000Z' }); callbacks.onPlayerFreshness?.(true); });
  expect(useSessionStore.getState().session?.playerDiscovery?.shipId).toBe('shepherd');
});

it.each([
  { groupId: 'fleet-2', vesselIds: ['shepherd'], craftIds: [] },
  { groupId: 'fleet-1', vesselIds: ['dione'], craftIds: [] },
])('requires the independent current member session scope: %j', async memberSessionScope => {
  const callbacks = await begin();
  act(() => { callbacks.onSession({ ...currentSession(), memberSessionScope }); callbacks.onPlayerDiscovery?.(discovery()); });
  expectWithdrawn();
});
