import { beforeEach, expect, it, vi } from 'vitest';
import type { GameSession, HummingbirdHarvest } from '@/types/game';
import { useSessionStore } from '@/store/useSessionStore';
import { allocateHummingbirdHarvest, rollHummingbirdHarvest } from './hummingbirdHarvestService';

const mocks = vi.hoisted(() => ({ invoke: vi.fn() }));

vi.mock('firebase/functions', () => ({ httpsCallable: vi.fn(() => mocks.invoke) }));
vi.mock('./firebase', () => ({ functions: vi.fn(() => ({})) }));

const timestamp = '2026-09-27T15:00:00.000Z';
const pendingHarvest: HummingbirdHarvest = {
  sessionId: 's1', ownerUid: 'u1', turn: 2, hostShipId: 'quellon', revision: 1,
  status: 'pending', rolls: [2, 5], requestId: 'original-roll', createdAt: timestamp,
};

function withoutTurnPhase(session: GameSession): Omit<GameSession, 'turnPhase'> {
  const copy = { ...session } as Omit<GameSession, 'turnPhase'> & {
    turnPhase?: NonNullable<GameSession['turnPhase']>;
  };
  delete copy.turnPhase;
  return copy;
}

function setLiveExplorer(): void {
  useSessionStore.getState().reset();
  useSessionStore.getState().setIdentity({
    id: 's1', name: 'Table one', joinCode: '4821', phase: 'active', ownerUid: 'gm1',
    currentTurn: 2, activeRoleIds: ['quellon-explorer'], activeVesselIds: ['quellon'],
    shuttleDockings: [{ shuttleId: 'hummingbird', shipId: 'quellon', dockedAt: timestamp }],
    shuttleFuelled: { hummingbird: true },
    turnPhase: {
      turn: 2, teamPhaseEndsAt: timestamp, openAirspaceEndsAt: timestamp,
      airspace: { state: 'lifted', tickerActive: true, pressAccess: false },
    },
    createdAt: timestamp, updatedAt: timestamp,
  } as never, {
    uid: 'u1', sessionId: 's1', displayName: 'Explorer', role: 'player', seatId: null,
    assignedRoleId: 'quellon-explorer', activeConsoleRoleId: 'quellon-explorer',
    joinedAt: timestamp,
  });
  useSessionStore.getState().setConnection('live');
  useSessionStore.getState().setSessionSnapshotFreshness('server');
}

function staleReply(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    status: 'stale', sessionId: 's1', requestId: 'roll-2', harvest: pendingHarvest,
    actorUid: 'u1', actorRoleId: 'quellon-explorer', vesselId: 'hummingbird',
    hostShipId: 'quellon', turn: 2, phase: 'active', revision: 1,
    idempotencyKey: 'roll-2', auditId: 'hummingbird-harvest-roll-2',
    ...overrides,
  };
}

beforeEach(() => {
  setLiveExplorer();
  mocks.invoke.mockReset();
});

it('returns only a request-bound stale reply for the current private Explorer and host', async () => {
  mocks.invoke.mockResolvedValueOnce({ data: staleReply() });

  const result = await rollHummingbirdHarvest(0, 'roll-2');

  expect(result).toMatchObject({ status: 'stale', requestId: 'roll-2', harvest: pendingHarvest });
  expect(mocks.invoke).toHaveBeenCalledWith({ sessionId: 's1', expectedRevision: 0, requestId: 'roll-2' });
});

it.each([
  ['another actor', { actorUid: 'u2' }],
  ['a different role', { actorRoleId: 'aegis-admiral' }],
  ['another Hummingbird host', { hostShipId: 'dione' }],
  ['a different cycle', { turn: 3 }],
  ['a harvest from a different cycle', {
    harvest: { ...pendingHarvest, turn: 1 },
  }],
  ['a mismatched request identity', { idempotencyKey: 'other-request' }],
  ['a revision that is not newer', { revision: 0 }],
  ['another player’s private harvest', { harvest: { ...pendingHarvest, ownerUid: 'u2' } }],
] as const)('fails closed on a stale reply bound to %s', async (_label, override) => {
  mocks.invoke.mockResolvedValueOnce({ data: staleReply(override) });

  await expect(rollHummingbirdHarvest(0, 'roll-2')).rejects.toThrow(/could not be verified/i);
});

it.each([
  ['a missing current phase', undefined],
  ['a phase from an earlier cycle', {
    turn: 1, teamPhaseEndsAt: timestamp, openAirspaceEndsAt: timestamp,
    airspace: { state: 'lifted', tickerActive: true, pressAccess: false },
  }],
] as const)('does not call harvesting when %s', async (_label, turnPhase) => {
  useSessionStore.getState().setSession({
    ...(turnPhase === undefined
      ? withoutTurnPhase(useSessionStore.getState().session!)
      : { ...useSessionStore.getState().session!, turnPhase }),
  });

  expect(() => rollHummingbirdHarvest(0, 'roll-2')).toThrow(/unavailable/i);
  expect(mocks.invoke).not.toHaveBeenCalled();
});

it.each([
  ['Explorer role loss', () => useSessionStore.getState().setMe({
    ...useSessionStore.getState().me!, activeConsoleRoleId: 'quellon-captain',
  })],
  ['replacement', () => useSessionStore.getState().setMe({
    ...useSessionStore.getState().me!, replacementRoleId: 'doctor',
  })],
  ['pending re-role status', () => useSessionStore.getState().setMe({
    ...useSessionStore.getState().me!, replacementStatus: 'awaiting-re-role',
  })],
  ['docking loss', () => useSessionStore.getState().setSession({
    ...useSessionStore.getState().session!, shuttleDockings: [],
  })],
  ['phase loss', () => useSessionStore.getState().setSession({
    ...useSessionStore.getState().session!, turnPhase: {
      turn: 2, teamPhaseEndsAt: timestamp, openAirspaceEndsAt: timestamp,
      airspace: { state: 'restricted', tickerActive: true, pressAccess: false },
    },
  })],
  ['unknown phase', () => useSessionStore.getState().setSession({
    ...withoutTurnPhase(useSessionStore.getState().session!),
  })],
] as const)('discards a delayed private stale reply after %s', async (_label, changeAuthority) => {
  let resolveReply!: (value: { data: Record<string, unknown> }) => void;
  mocks.invoke.mockReturnValueOnce(new Promise(resolve => { resolveReply = resolve; }));
  const pending = rollHummingbirdHarvest(0, 'roll-2');

  changeAuthority();
  resolveReply({ data: staleReply() });

  await expect(pending).resolves.toBeUndefined();
});

it('keeps the exact request id when a caller retries an allocation', async () => {
  const resolvedHarvest: HummingbirdHarvest = {
    ...pendingHarvest, revision: 2, status: 'resolved', foodDieIndex: 1,
    food: 5, water: 2, requestId: 'allocation-1', resolvedAt: timestamp,
  };
  mocks.invoke.mockResolvedValueOnce({ data: {
    status: 'replayed', sessionId: 's1', requestId: 'allocation-1', harvest: resolvedHarvest,
    actorUid: 'u1', actorRoleId: 'quellon-explorer', vesselId: 'hummingbird',
    hostShipId: 'quellon', turn: 2, phase: 'active', revision: 2,
    idempotencyKey: 'allocation-1', auditId: 'hummingbird-harvest-allocation-1',
  } });

  await allocateHummingbirdHarvest(1, 1, 'allocation-1');

  expect(mocks.invoke).toHaveBeenCalledWith({
    sessionId: 's1', expectedRevision: 1, foodDieIndex: 1, requestId: 'allocation-1',
  });
});
