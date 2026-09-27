import { beforeEach, expect, it, vi } from 'vitest';
import { useSessionStore } from '@/store/useSessionStore';

const mocks = vi.hoisted(() => ({ call: vi.fn(), callable: vi.fn() }));
vi.mock('firebase/functions', () => ({ httpsCallable: mocks.callable }));
vi.mock('./firebase', () => ({ functions: () => 'functions' }));

import { rechargeHostConsoleFromShuttle } from './serviceShuttleRechargeService';

const command = {
  requestId: 'recharge-test-1', shuttleId: 'wobbly', consoleId: 'fuel-refinery',
  expectedControlRevision: 2, expectedMaintenanceRevision: 7, expectedCycle: 3,
  expectedHostShipId: 'refinery-124', productionOreAmount: 4,
} as const;

function staleReply(overrides: Record<string, unknown> = {}) {
  return {
    status: 'stale', sessionId: 's1', requestId: command.requestId, actorUid: 'holder',
    shuttleId: command.shuttleId, expectedHostShipId: command.expectedHostShipId,
    hostShipId: command.expectedHostShipId, consoleId: command.consoleId,
    expectedControlRevision: command.expectedControlRevision, currentControlRevision: 3,
    expectedMaintenanceRevision: command.expectedMaintenanceRevision, currentMaintenanceRevision: 8,
    expectedCycle: command.expectedCycle, currentCycle: 3,
    productionScrap: null, productionOreAmount: 4,
    ...overrides,
  };
}

beforeEach(() => {
  mocks.call.mockReset();
  mocks.callable.mockReset();
  mocks.callable.mockReturnValue(mocks.call);
  useSessionStore.getState().reset();
  useSessionStore.getState().setIdentity({
    id: 's1', name: 'Fleet', joinCode: '1234', phase: 'active', ownerUid: 'owner',
    createdAt: '', updatedAt: '',
  }, {
    uid: 'holder', sessionId: 's1', displayName: 'Holder', role: 'player', seatId: null,
    assignedRoleId: 'refinery-engineer', activeConsoleRoleId: 'refinery-engineer', joinedAt: '',
    fleetGroupId: 'fleet-1',
  });
  useSessionStore.getState().setSession({
    id: 's1', name: 'Fleet', joinCode: '1234', phase: 'active', ownerUid: 'owner',
    currentTurn: 3, activeRoleIds: ['refinery-engineer'], activeVesselIds: ['refinery-124'],
    turnPhase: {
      turn: 3, teamPhaseEndsAt: '2099-09-21T12:00:00.000Z',
      openAirspaceEndsAt: '2099-09-21T12:15:00.000Z',
      airspace: { state: 'lifted', tickerActive: true, pressAccess: true },
    },
    shuttleDockings: [{ shuttleId: 'wobbly', shipId: 'refinery-124', dockedAt: 'now' }],
    shuttleControl: { wobbly: {
      shuttleId: 'wobbly', ownerRoleId: 'refinery-engineer', ownerUid: 'owner',
      holderUid: 'holder', revision: 2,
    } },
    shuttleFuelled: { wobbly: true },
    maintenanceCycles: { 'refinery-124': {
      step: 0, revision: 7, turn: 3, results: { '7': 'Maintenance cycle complete.' },
      charges: [], refuelled: ['wobbly'], completedAt: '2099-09-21T12:00:00.000Z',
    } },
    serviceShuttleRecharges: {},
  } as never);
  useSessionStore.getState().setConnection('live');
  useSessionStore.getState().setSessionSnapshotFreshness('server');
});

it('sends host and immediate production choices and validates the committed result', async () => {
  mocks.call.mockResolvedValue({ data: {
    status: 'committed', sessionId: 's1', requestId: command.requestId,
    shuttleId: command.shuttleId, hostShipId: command.expectedHostShipId,
    consoleId: command.consoleId, cycle: 3, maintenanceRevision: 9,
    rechargeRevision: 1, immediate: true,
    message: 'Fuel Refinery: spent 4 ore, generated 4 fuel.',
  } });

  await expect(rechargeHostConsoleFromShuttle(command)).resolves.toMatchObject({
    status: 'committed', immediate: true,
    message: 'Fuel Refinery: spent 4 ore, generated 4 fuel.',
  });
  expect(mocks.callable).toHaveBeenCalledWith('functions', 'rechargeHostConsoleFromShuttle');
  expect(mocks.call).toHaveBeenCalledWith({
    sessionId: 's1', ...command,
  });
});

it('returns only a fully command- and actor-bound stale envelope', async () => {
  mocks.call.mockResolvedValue({ data: staleReply() });
  await expect(rechargeHostConsoleFromShuttle(command)).resolves.toMatchObject({
    status: 'stale', currentControlRevision: 3, currentMaintenanceRevision: 8,
    currentCycle: 3, hostShipId: 'refinery-124', consoleId: 'fuel-refinery',
  });
});

it.each([
  ['request', { requestId: 'other-request' }],
  ['actor', { actorUid: 'another-player' }],
  ['session', { sessionId: 's2' }],
  ['host', { hostShipId: 'quellon' }],
  ['target', { consoleId: 'hydroponics' }],
  ['expected control CAS', { expectedControlRevision: 1 }],
  ['expected maintenance CAS', { expectedMaintenanceRevision: 6 }],
  ['expected cycle', { expectedCycle: 2 }],
  ['production choice', { productionOreAmount: 5 }],
  ['non-advancing CAS', { currentControlRevision: 2, currentMaintenanceRevision: 7 }],
] as const)('rejects stale envelopes with a mismatched %s binding', async (_label, overrides) => {
  mocks.call.mockResolvedValue({ data: staleReply(overrides) });
  await expect(rechargeHostConsoleFromShuttle(command)).rejects.toThrow(/stale response was malformed or mismatched/i);
});

it('rejects a delayed result after the local actor changes', async () => {
  let resolve!: (value: unknown) => void;
  mocks.call.mockReturnValue(new Promise((done) => { resolve = done; }));
  const pending = rechargeHostConsoleFromShuttle(command);
  useSessionStore.getState().setMe({
    ...useSessionStore.getState().me!, uid: 'next-holder',
  });
  resolve({ data: staleReply() });
  await expect(pending).rejects.toThrow(/authority changed while the request was pending/i);
});

it('rejects cache-backed authority before contacting the callable', async () => {
  useSessionStore.getState().setSessionSnapshotFreshness('cache');
  await expect(rechargeHostConsoleFromShuttle(command)).rejects.toThrow(/reconnect until the live session state returns/i);
  expect(mocks.callable).not.toHaveBeenCalled();
});
