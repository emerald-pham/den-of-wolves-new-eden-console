import { beforeEach, expect, it, vi } from 'vitest';
import { useSessionStore } from '@/store/useSessionStore';

const mocks = vi.hoisted(() => ({ call: vi.fn(), callable: vi.fn() }));
vi.mock('firebase/functions', () => ({ httpsCallable: mocks.callable }));
vi.mock('./firebase', () => ({ functions: () => 'functions' }));

import {
  HighwallMiningUncertainError,
  retryHighwallMiningExactly,
  runHighwallMining,
} from './highwallMiningService';

beforeEach(() => {
  mocks.call.mockReset(); mocks.callable.mockReset(); mocks.callable.mockReturnValue(mocks.call);
  useSessionStore.getState().reset();
  useSessionStore.getState().setIdentity({
    id: 's1', name: 'Fleet', joinCode: '1234', phase: 'active', ownerUid: 'owner',
    createdAt: '', updatedAt: '', currentTurn: 2,
    activeRoleIds: ['icebreaker-miner'], activeVesselIds: ['icebreaker'],
    shuttleControl: { highwall: {
      shuttleId: 'highwall', ownerRoleId: 'icebreaker-miner', ownerUid: 'owner',
      holderUid: 'holder', revision: 4,
    } },
    shuttleDockings: [{ shuttleId: 'highwall', shipId: 'icebreaker', dockedAt: 'SESSION START' }],
    playerDiscovery: {
      groupId: 'fleet-1', fleetGroupVesselIds: ['icebreaker'], revision: 0, knownCoordinates: [],
      knownSystems: {}, pursuitDistance: 0, navigationLogs: [],
    },
  }, {
    uid: 'holder', sessionId: 's1', displayName: 'Miner', role: 'player', seatId: null,
    assignedRoleId: 'icebreaker-miner', activeConsoleRoleId: 'icebreaker-miner',
    fleetGroupId: 'fleet-1', joinedAt: '',
  });
  useSessionStore.getState().setConnection('live');
  useSessionStore.getState().setSessionSnapshotFreshness('server');
});

function setHandedOffEngineer(options: { readonly groupId?: string; readonly vesselIds?: readonly string[];
  readonly holderUid?: string } = {}): void {
  const current = useSessionStore.getState();
  current.setIdentity({
    ...current.session!,
    activeRoleIds: [...(current.session!.activeRoleIds ?? []), 'icebreaker-engineer'],
    ...(options.holderUid ? {
      shuttleControl: { highwall: { ...current.session!.shuttleControl!.highwall!, holderUid: options.holderUid } },
    } : {}),
    ...(options.groupId ? {
      playerDiscovery: {
        ...current.session!.playerDiscovery!, groupId: options.groupId,
        fleetGroupVesselIds: options.vesselIds ?? ['icebreaker'],
      },
    } : {}),
  }, {
    ...current.me!, assignedRoleId: 'icebreaker-engineer', activeConsoleRoleId: 'icebreaker-engineer',
    ...(options.groupId ? { fleetGroupId: options.groupId } : {}),
  });
}

it('sends the selected operation with observed state, custody, and cycle revisions', async () => {
  mocks.call.mockImplementation((payload: Record<string, unknown>) => Promise.resolve({ data: {
    status: 'committed', sessionId: payload.sessionId, requestId: payload.requestId,
    cycle: 2, revision: 3,
    operation: { requestId: payload.requestId, resource: 'ore', rolls: [2, 5, 3], amount: 10 },
    cargo: { ore: 13, materials: 2 },
  } }));
  await expect(runHighwallMining('ore', 2, 4, 2)).resolves.toMatchObject({
    operation: { amount: 10 }, cargo: { ore: 13 },
  });
  expect(mocks.callable).toHaveBeenCalledWith('functions', 'runHighwallMining');
  expect(mocks.call).toHaveBeenCalledWith({
    sessionId: 's1', requestId: expect.any(String), resource: 'ore',
    expectedRevision: 2, expectedControlRevision: 4, expectedCycle: 2,
  });
});

it('allows a same-group legal-dock Engineer holding Highwall to mine', async () => {
  setHandedOffEngineer();
  mocks.call.mockImplementation((payload: Record<string, unknown>) => Promise.resolve({ data: {
    status: 'committed', sessionId: payload.sessionId, requestId: payload.requestId,
    cycle: 2, revision: 3,
    operation: { requestId: payload.requestId, resource: 'ore', rolls: [2, 5, 3], amount: 10 },
    cargo: { ore: 13, materials: 2 },
  } }));

  await expect(runHighwallMining('ore', 2, 4, 2)).resolves.toMatchObject({ status: 'committed' });
  expect(mocks.callable).toHaveBeenCalledWith('functions', 'runHighwallMining');
});

it('keeps a handed-off Engineer from mining across a fleet-group boundary', async () => {
  setHandedOffEngineer({ groupId: 'fleet-2', vesselIds: ['quellon'] });
  await expect(runHighwallMining('ore', 2, 4, 2)).rejects.toThrow(/fleet group/i);
  expect(mocks.callable).not.toHaveBeenCalled();
});

it('keeps a handed-off Engineer from mining after Highwall control moves', async () => {
  setHandedOffEngineer({ holderUid: 'other' });
  await expect(runHighwallMining('ore', 2, 4, 2)).rejects.toThrow(/current Highwall holder/i);
  expect(mocks.callable).not.toHaveBeenCalled();
});

it('rejects a malformed callable result', async () => {
  mocks.call.mockImplementation((payload: Record<string, unknown>) => Promise.resolve({ data: {
    status: 'committed', sessionId: payload.sessionId, requestId: payload.requestId,
    cycle: 2, revision: 3,
    operation: { requestId: payload.requestId, resource: 'ore', rolls: [6], amount: 6 },
    cargo: { ore: 9, materials: 2 },
  } }));
  await expect(runHighwallMining('ore', 2, 4, 2)).rejects.toThrow(/invalid result/i);
});

it('rejects cache-backed authority before contacting the callable', async () => {
  useSessionStore.getState().setSessionSnapshotFreshness('cache');
  await expect(runHighwallMining('materials', 0, 4, 2)).rejects.toThrow(/live session state/i);
  expect(mocks.callable).not.toHaveBeenCalled();
});

it('accepts only an exact minimal stale envelope bound to this request', async () => {
  mocks.call.mockImplementation((payload: Record<string, unknown>) => Promise.resolve({ data: {
    status: 'stale', sessionId: payload.sessionId, requestId: payload.requestId,
    resource: payload.resource, expectedRevision: payload.expectedRevision, currentRevision: 3,
    expectedControlRevision: payload.expectedControlRevision, currentControlRevision: 5,
    expectedCycle: payload.expectedCycle, currentCycle: 2, hostShipId: 'icebreaker',
  } }));
  await expect(runHighwallMining('ore', 2, 4, 2)).resolves.toMatchObject({
    status: 'stale', resource: 'ore', expectedRevision: 2, currentRevision: 3,
    expectedControlRevision: 4, currentControlRevision: 5, currentCycle: 2,
  });

  mocks.call.mockImplementationOnce((payload: Record<string, unknown>) => Promise.resolve({ data: {
    status: 'stale', sessionId: payload.sessionId, requestId: payload.requestId,
    resource: payload.resource, expectedRevision: payload.expectedRevision, currentRevision: 3,
    expectedControlRevision: payload.expectedControlRevision, currentControlRevision: 5,
    expectedCycle: payload.expectedCycle, currentCycle: 2, hostShipId: 'icebreaker',
    operations: [],
  } }));
  await expect(runHighwallMining('ore', 2, 4, 2)).rejects.toThrow(/invalid stale result/i);
});

it('retries an uncertain request exactly after cycle and control revisions advance', async () => {
  mocks.call.mockRejectedValueOnce({ code: 'functions/unavailable' });
  const error = await runHighwallMining('ore', 2, 4, 2).catch((cause) => cause);
  expect(error).toBeInstanceOf(HighwallMiningUncertainError);
  if (!(error instanceof HighwallMiningUncertainError)) throw error;
  const originalPayload = mocks.call.mock.calls[0]![0];
  expect(error.retry.command).toMatchObject({
    sessionId: 's1', resource: 'ore', expectedRevision: 2,
    expectedControlRevision: 4, expectedCycle: 2,
  });

  const current = useSessionStore.getState();
  useSessionStore.getState().setIdentity({
    ...current.session!, currentTurn: 3,
    shuttleControl: { highwall: { ...current.session!.shuttleControl!.highwall!, revision: 5 } },
    highwallMining: { cycle: 3, revision: 3, operations: [] },
  }, current.me!);
  mocks.call.mockImplementationOnce((payload: Record<string, unknown>) => Promise.resolve({ data: {
    status: 'replayed', sessionId: payload.sessionId, requestId: payload.requestId,
    cycle: 2, revision: 3,
    operation: { requestId: payload.requestId, resource: 'ore', rolls: [2, 5, 3], amount: 10 },
    cargo: { ore: 13, materials: 2 },
  } }));

  await expect(retryHighwallMiningExactly(error.retry)).resolves.toMatchObject({ status: 'replayed' });
  expect(mocks.call.mock.calls[1]![0]).toEqual(originalPayload);
});
