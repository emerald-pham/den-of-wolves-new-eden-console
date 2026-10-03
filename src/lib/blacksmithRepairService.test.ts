import { beforeEach, expect, it, vi } from 'vitest';
import { useSessionStore } from '@/store/useSessionStore';

const mocks = vi.hoisted(() => ({ call: vi.fn(), callable: vi.fn() }));
vi.mock('firebase/functions', () => ({ httpsCallable: mocks.callable }));
vi.mock('./firebase', () => ({ functions: () => 'functions' }));

import { repairConsolesFromBlacksmith } from './blacksmithRepairService';

const command = {
  requestId: 'blacksmith-repair-1', systemIds: ['storage', 'reactor'],
  expectedControlRevision: 2, expectedRepairRevision: 2,
  expectedCycle: 4, expectedHostShipId: 'icebreaker',
};
const response = (status: 'committed' | 'replayed' = 'committed') => ({ data: {
  status, sessionId: 's1', requestId: command.requestId, shuttleId: 'blacksmith',
  hostShipId: 'icebreaker', systemIds: ['reactor', 'storage'],
  materialsRemaining: 4, cycle: 4, repairRevision: 3,
} });
const staleResponse = (patch: Record<string, unknown> = {}) => ({ data: {
  status: 'stale', sessionId: 's1', requestId: command.requestId, shuttleId: 'blacksmith',
  expectedHostShipId: 'icebreaker', systemIds: ['reactor', 'storage'],
  expectedControlRevision: 2, currentControlRevision: 3,
  expectedRepairRevision: 2, currentRepairRevision: 3,
  expectedCycle: 4, currentCycle: 4,
  ...patch,
} });

beforeEach(() => {
  mocks.call.mockReset(); mocks.callable.mockReset(); mocks.callable.mockReturnValue(mocks.call);
  useSessionStore.getState().reset();
  useSessionStore.getState().setIdentity({
    id: 's1', name: 'Fleet', joinCode: '1234', phase: 'active', ownerUid: 'owner',
    createdAt: '', updatedAt: '',
  }, {
    uid: 'holder', sessionId: 's1', displayName: 'Holder', role: 'player', seatId: null,
    assignedRoleId: 'icebreaker-engineer', activeConsoleRoleId: 'icebreaker-engineer',
    fleetGroupId: 'fleet-1', joinedAt: '',
  });
  useSessionStore.getState().setSession({
    ...useSessionStore.getState().session!, phase: 'active', currentTurn: 4,
    activeRoleIds: ['icebreaker-engineer'], activeVesselIds: ['icebreaker'],
    turnPhase: {
      turn: 4, teamPhaseEndsAt: '2099-09-22T11:45:00.000Z',
      openAirspaceEndsAt: '2099-09-22T12:15:00.000Z',
      airspace: { state: 'lifted', tickerActive: true, pressAccess: true },
    },
    shuttleControl: { blacksmith: {
      shuttleId: 'blacksmith', ownerRoleId: 'icebreaker-engineer', ownerUid: 'owner',
      holderUid: 'holder', revision: 2,
    } },
    shuttleDockings: [{ shuttleId: 'blacksmith', shipId: 'icebreaker', dockedAt: 'now' }],
    blacksmithRepairs: { cycle: 4, revision: 2, hosts: [{ shipId: 'aegis', systemIds: ['reactor'] }] },
    playerDiscovery: { groupId: 'fleet-1', fleetGroupVesselIds: ['icebreaker'] },
  } as never);
  useSessionStore.getState().setConnection('live');
  useSessionStore.getState().setSessionSnapshotFreshness('server');
});

it('sends a caller-stable request id and validates the exact committed reply', async () => {
  mocks.call.mockResolvedValue(response());
  await expect(repairConsolesFromBlacksmith(command)).resolves.toEqual({
    status: 'committed', hostShipId: 'icebreaker', systemIds: ['reactor', 'storage'],
    materialsRemaining: 4, cycle: 4, repairRevision: 3,
  });
  expect(mocks.callable).toHaveBeenCalledWith('functions', 'repairConsolesFromBlacksmith');
  expect(mocks.call).toHaveBeenCalledWith({
    sessionId: 's1', requestId: command.requestId, systemIds: ['storage', 'reactor'],
    expectedControlRevision: 2, expectedRepairRevision: 2, expectedCycle: 4,
    expectedHostShipId: 'icebreaker',
  });
});

it('accepts exact replay and rejects a response bound to another request', async () => {
  mocks.call.mockResolvedValue(response('replayed'));
  await expect(repairConsolesFromBlacksmith(command)).resolves.toMatchObject({ status: 'replayed' });
  mocks.call.mockResolvedValue({ data: { ...response().data, requestId: 'different-request' } });
  await expect(repairConsolesFromBlacksmith(command)).rejects.toThrow(/malformed/i);
});

it('preserves current repair revision when earlier foreign host details are withheld', async () => {
  const store = useSessionStore.getState();
  store.setSession({ ...store.session!, blacksmithRepairs: { cycle: 4, revision: 2, hosts: [], totalHostsUsed: 1 } } as never);
  mocks.call.mockResolvedValue(response('replayed'));
  await expect(repairConsolesFromBlacksmith(command)).resolves.toMatchObject({ status: 'replayed', repairRevision: 3 });
  expect(mocks.call).toHaveBeenCalledTimes(1);
});

it('allows a current fleet-group handoff holder and preserves their assigned role binding', async () => {
  const state = useSessionStore.getState();
  state.setMe({ ...state.me!, assignedRoleId: 'icebreaker-captain', activeConsoleRoleId: 'icebreaker-captain' });
  mocks.call.mockResolvedValue(staleResponse());
  await expect(repairConsolesFromBlacksmith(command)).resolves.toMatchObject({ status: 'stale' });
  expect(mocks.call).toHaveBeenCalledTimes(1);
});

it('accepts a minimal stale envelope bound to the exact request, host, selection, and CAS', async () => {
  mocks.call.mockResolvedValue(staleResponse());
  await expect(repairConsolesFromBlacksmith(command)).resolves.toEqual(staleResponse().data);
  expect(mocks.call).toHaveBeenCalledWith({
    sessionId: 's1', requestId: command.requestId, systemIds: ['storage', 'reactor'],
    expectedControlRevision: 2, expectedRepairRevision: 2,
    expectedCycle: 4, expectedHostShipId: 'icebreaker',
  });
});

it.each([
  ['session', { sessionId: 'other-session' }],
  ['request', { requestId: 'another-request' }],
  ['shuttle', { shuttleId: 'ally' }],
  ['host', { expectedHostShipId: 'aegis' }],
  ['selection', { systemIds: ['reactor'] }],
  ['expected control CAS', { expectedControlRevision: 1 }],
  ['expected repair CAS', { expectedRepairRevision: 1 }],
  ['expected cycle', { expectedCycle: 3 }],
  ['future control revision', { currentControlRevision: 1 }],
  ['future repair revision', { currentRepairRevision: 1 }],
  ['future cycle', { currentCycle: 3 }],
  ['no conflict', { currentControlRevision: 2, currentRepairRevision: 2, currentCycle: 4 }],
  ['private extra data', { holderUid: 'holder' }],
])('rejects a stale envelope with mismatched %s binding', async (_label, patch) => {
  mocks.call.mockResolvedValue(staleResponse(patch));
  await expect(repairConsolesFromBlacksmith(command)).rejects.toThrow(/malformed|mismatched/i);
});

it.each([
  ['session', (session: Record<string, unknown>) => {
    session.id = 'another-session';
  }],
  ['actor', (_session: Record<string, unknown>, me: Record<string, unknown>) => {
    me.uid = 'another-player';
  }],
  ['role', (_session: Record<string, unknown>, me: Record<string, unknown>) => {
    me.assignedRoleId = 'icebreaker-captain'; me.activeConsoleRoleId = 'icebreaker-captain';
  }],
  ['unknown active role', (session: Record<string, unknown>) => {
    session.activeRoleIds = ['icebreaker-engineer', 'unknown-role'];
  }],
  ['holder', (session: Record<string, unknown>) => {
    session.shuttleControl = { blacksmith: {
      shuttleId: 'blacksmith', ownerRoleId: 'icebreaker-engineer', ownerUid: 'owner', holderUid: 'other', revision: 3,
    } };
  }],
  ['fleet group', (_session: Record<string, unknown>, me: Record<string, unknown>) => {
    me.fleetGroupId = 'fleet-2';
  }],
  ['host', (session: Record<string, unknown>) => {
    session.shuttleDockings = [{ shuttleId: 'blacksmith', shipId: 'aegis', dockedAt: 'now' }];
  }],
  ['Coordination phase', (session: Record<string, unknown>) => {
    session.turnPhase = { ...(session.turnPhase as Record<string, unknown>),
      airspace: { state: 'restricted', tickerActive: true, pressAccess: false } };
  }],
  ['future-cycle repair ledger', (session: Record<string, unknown>) => {
    session.blacksmithRepairs = {
      cycle: 5, revision: 3, hosts: [{ shipId: 'aegis', systemIds: ['reactor'] }],
    };
  }],
])('rejects stale replies after %s authority changes while pending', async (_label, change) => {
  let resolve!: (value: ReturnType<typeof staleResponse>) => void;
  mocks.call.mockReturnValueOnce(new Promise((complete) => { resolve = complete; }));
  const pending = repairConsolesFromBlacksmith(command);
  const state = useSessionStore.getState();
  const session = { ...(state.session as unknown as Record<string, unknown>) };
  const me = { ...(state.me as unknown as Record<string, unknown>) };
  change(session, me);
  useSessionStore.getState().setMe(me as never);
  useSessionStore.getState().setSession(session as never);
  resolve(staleResponse());
  await expect(pending).rejects.toThrow(/authority|Coordination/i);
});

it('rejects malformed commands and cache-backed authority before calling the backend', async () => {
  await expect(repairConsolesFromBlacksmith({ ...command, systemIds: ['reactor', 'reactor'] }))
    .rejects.toThrow(/invalid/i);
  useSessionStore.getState().setSessionSnapshotFreshness('cache');
  await expect(repairConsolesFromBlacksmith(command)).rejects.toThrow(/live session state/i);
  expect(mocks.call).not.toHaveBeenCalled();
});
