import { beforeEach, expect, it, vi } from 'vitest';
import { useSessionStore } from '@/store/useSessionStore';

const mocks = vi.hoisted(() => ({ call: vi.fn(), callable: vi.fn() }));
vi.mock('firebase/functions', () => ({ httpsCallable: mocks.callable }));
vi.mock('./firebase', () => ({ functions: () => 'functions' }));

import { repairConsolesFromChacau } from './chacauRepairService';

const command = {
  requestId: 'chacau-repair-1', systemIds: ['storage', 'reactor'],
  expectedControlRevision: 2, expectedRepairRevision: 2,
  expectedCycle: 4, expectedHostShipId: 'refinery-124',
};
const response = (status: 'committed' | 'replayed' = 'committed') => ({
  data: {
    status, sessionId: 's1', requestId: command.requestId, shuttleId: 'chacau',
    hostShipId: 'refinery-124', systemIds: ['reactor', 'storage'],
    materialsRemaining: 4, cycle: 4, repairRevision: 3,
  },
});

beforeEach(() => {
  mocks.call.mockReset(); mocks.callable.mockReset(); mocks.callable.mockReturnValue(mocks.call);
  useSessionStore.getState().reset();
  useSessionStore.getState().setIdentity({
    id: 's1', name: 'Fleet', joinCode: '1234', phase: 'active', ownerUid: 'owner',
    createdAt: '', updatedAt: '',
  }, {
    uid: 'holder', sessionId: 's1', displayName: 'Holder', role: 'player', seatId: null,
    assignedRoleId: 'refinery-124-engineer', activeConsoleRoleId: 'refinery-124-engineer',
    fleetGroupId: 'fleet-1', connected: true, joinedAt: '',
  });
  useSessionStore.getState().setSession({
    ...useSessionStore.getState().session!,
    currentTurn: 4, activeRoleIds: ['refinery-124-engineer'],
    activeVesselIds: ['refinery-124', 'dione'],
    turnPhase: {
      turn: 4, teamPhaseEndsAt: '2099-09-22T12:00:00.000Z',
      openAirspaceEndsAt: '2099-09-22T12:15:00.000Z',
      airspace: { state: 'lifted', tickerActive: true, pressAccess: true },
    },
    shuttleControl: { chacau: {
      shuttleId: 'chacau', ownerRoleId: 'refinery-124-engineer', ownerUid: 'owner',
      holderUid: 'holder', revision: 2,
    } },
    shuttleDockings: [{ shuttleId: 'chacau', shipId: 'refinery-124', dockedAt: 'now' }],
    chacauRepairs: {
      cycle: 4, revision: 2,
      hosts: [{ shipId: 'refinery-124', systemIds: ['jump-drive'] }],
    },
    playerDiscovery: {
      groupId: 'fleet-1', fleetGroupVesselIds: ['refinery-124', 'dione'],
      knownCoordinates: ['0000'], knownSystems: { 'system-01': '0000' },
      pursuitDistance: 0, navigationLogs: [], revision: 1,
    },
  } as never);
  useSessionStore.getState().setConnection('live');
  useSessionStore.getState().setSessionSnapshotFreshness('server');
});

it('sends the Chacau command and validates its exact committed reply', async () => {
  mocks.call.mockResolvedValue(response());
  await expect(repairConsolesFromChacau(command)).resolves.toEqual({
    status: 'committed', hostShipId: 'refinery-124', systemIds: ['reactor', 'storage'],
    materialsRemaining: 4, cycle: 4, repairRevision: 3,
  });
  expect(mocks.callable).toHaveBeenCalledWith('functions', 'repairConsolesFromChacau');
  expect(mocks.call).toHaveBeenCalledWith({
    sessionId: 's1', requestId: 'chacau-repair-1', systemIds: ['storage', 'reactor'],
    expectedControlRevision: 2, expectedRepairRevision: 2,
    expectedCycle: 4, expectedHostShipId: 'refinery-124',
  });
});

it('accepts the exact replay response and rejects replies for another request or craft', async () => {
  mocks.call.mockResolvedValue(response('replayed'));
  await expect(repairConsolesFromChacau(command)).resolves.toMatchObject({ status: 'replayed' });
  mocks.call.mockResolvedValue({ data: { ...response().data, requestId: 'different-request' } });
  await expect(repairConsolesFromChacau(command)).rejects.toThrow(/malformed/i);
  mocks.call.mockResolvedValue({ data: { ...response().data, shuttleId: 'philia' } });
  await expect(repairConsolesFromChacau(command)).rejects.toThrow(/malformed/i);
});

it('rejects malformed commands and cache-backed authority before calling the backend', async () => {
  await expect(repairConsolesFromChacau({ ...command, systemIds: ['reactor', 'reactor'] }))
    .rejects.toThrow(/invalid/i);
  useSessionStore.getState().setSessionSnapshotFreshness('cache');
  await expect(repairConsolesFromChacau(command)).rejects.toThrow(/live session state/i);
  expect(mocks.call).not.toHaveBeenCalled();
});


const staleResponse = () => ({ data: {
  status: 'stale', sessionId: 's1', requestId: command.requestId, shuttleId: 'chacau',
  expectedHostShipId: 'refinery-124', systemIds: ['reactor', 'storage'],
  expectedControlRevision: 2, currentControlRevision: 3,
  expectedRepairRevision: 2, currentRepairRevision: 3,
  expectedCycle: 4, currentCycle: 4,
} });

it('accepts only a minimal stale envelope bound to this Chacau request and selection', async () => {
  mocks.call.mockResolvedValue(staleResponse());
  await expect(repairConsolesFromChacau(command)).resolves.toMatchObject({
    status: 'stale', sessionId: 's1', requestId: command.requestId, shuttleId: 'chacau',
    currentControlRevision: 3, currentRepairRevision: 3, currentCycle: 4,
  });
  mocks.call.mockResolvedValue({ data: { ...staleResponse().data, holderUid: 'holder' } });
  await expect(repairConsolesFromChacau(command)).rejects.toThrow(/stale response was malformed/i);
  mocks.call.mockResolvedValue({ data: { ...staleResponse().data, systemIds: ['jump-drive'] } });
  await expect(repairConsolesFromChacau(command)).rejects.toThrow(/stale response was malformed/i);
  mocks.call.mockResolvedValue({ data: {
    ...staleResponse().data, currentControlRevision: 2, currentRepairRevision: 2,
  } });
  await expect(repairConsolesFromChacau(command)).rejects.toThrow(/stale response was malformed/i);
});

it.each(['actor', 'session', 'assigned role', 'active console role', 'holder', 'fleet group', 'host', 'unique dock', 'Coordination'] as const)(
  'rejects a stale response after current %s authority changes while awaiting it',
  async changed => {
    let resolveResponse!: (value: unknown) => void;
    mocks.call.mockImplementation(() => new Promise(resolve => { resolveResponse = resolve; }));
    const pending = repairConsolesFromChacau(command);
    const state = useSessionStore.getState();
    if (changed === 'actor') {
      state.setIdentity({ ...state.session!, id: 's2' }, { ...state.me!, uid: 'another-player', sessionId: 's2' });
    } else if (changed === 'session') {
      state.setIdentity({ ...state.session!, id: 's2' }, { ...state.me!, sessionId: 's2' });
    } else if (changed === 'assigned role') {
      state.setMe({ ...state.me!, assignedRoleId: 'dione-engineer' });
    } else if (changed === 'active console role') {
      state.setMe({ ...state.me!, activeConsoleRoleId: 'dione-engineer' });
    } else if (changed === 'holder') {
      state.setSession({
        ...state.session!,
        shuttleControl: { ...state.session!.shuttleControl, chacau: {
          ...state.session!.shuttleControl!.chacau!, holderUid: 'another-player',
        } },
      } as never);
    } else if (changed === 'fleet group') {
      state.setIdentity(state.session!, { ...state.me!, fleetGroupId: 'fleet-2' });
    } else if (changed === 'host') {
      state.setSession({
        ...state.session!,
        shuttleDockings: [{ shuttleId: 'chacau', shipId: 'dione', dockedAt: 'now' }],
      } as never);
    } else if (changed === 'unique dock') {
      state.setSession({
        ...state.session!,
        shuttleDockings: [
          ...state.session!.shuttleDockings!,
          { shuttleId: 'chacau', shipId: 'dione', dockedAt: 'later' },
        ],
      } as never);
    } else {
      state.setSession({
        ...state.session!,
        turnPhase: { ...state.session!.turnPhase!, openAirspaceEndsAt: '2000-01-01T00:00:00.000Z' },
      } as never);
    }
    resolveResponse(staleResponse());
    await expect(pending).rejects.toThrow(/authority or Coordination changed/i);
  },
);
