import { beforeEach, expect, it, vi } from 'vitest';
import { useSessionStore } from '@/store/useSessionStore';
import type { GameSession } from '@/types/game';

const mocks = vi.hoisted(() => ({ call: vi.fn(), callable: vi.fn() }));
vi.mock('firebase/functions', () => ({ httpsCallable: mocks.callable }));
vi.mock('./firebase', () => ({ functions: () => 'functions' }));

import { repairConsolesFromMacaw } from './macawRepairService';

const command = {
  requestId: 'macaw-repair-1', systemIds: ['storage', 'reactor'],
  expectedControlRevision: 2, expectedRepairRevision: 2,
  expectedCycle: 4, expectedHostShipId: 'capybara',
};
const response = (status: 'committed' | 'replayed' = 'committed') => ({
  data: {
    status, sessionId: 's1', requestId: command.requestId, shuttleId: 'macaw',
    hostShipId: 'capybara', systemIds: ['reactor', 'storage'],
    scrapRemaining: 1, cycle: 4, repairRevision: 3,
  },
});
const staleResponse = () => ({ data: {
  status: 'stale', sessionId: 's1', requestId: command.requestId, shuttleId: 'macaw',
  expectedHostShipId: 'capybara', systemIds: ['reactor', 'storage'],
  expectedControlRevision: 2, currentControlRevision: 3,
  expectedRepairRevision: 2, currentRepairRevision: 3,
  expectedCycle: 4, currentCycle: 4,
} });

beforeEach(() => {
  mocks.call.mockReset(); mocks.callable.mockReset(); mocks.callable.mockReturnValue(mocks.call);
  useSessionStore.getState().reset();
  useSessionStore.getState().setIdentity({
    id: 's1', name: 'Fleet', joinCode: '1234', phase: 'active', ownerUid: 'owner', createdAt: '', updatedAt: '',
  }, {
    uid: 'holder', sessionId: 's1', displayName: 'Holder', role: 'player', seatId: null,
    assignedRoleId: 'capybara-captain', activeConsoleRoleId: 'capybara-captain', fleetGroupId: 'fleet-1', joinedAt: '',
  });
  useSessionStore.getState().setSession({
    ...useSessionStore.getState().session!, currentTurn: 4,
    activeRoleIds: ['capybara-captain'], activeVesselIds: ['capybara'],
    turnPhase: { turn: 4, teamPhaseEndsAt: '2099-09-22T11:45:00.000Z',
      openAirspaceEndsAt: '2099-09-22T12:15:00.000Z',
      airspace: { state: 'lifted', tickerActive: true, pressAccess: true } },
    shuttleControl: { macaw: {
      shuttleId: 'macaw', ownerRoleId: 'capybara-captain', ownerUid: 'owner', holderUid: 'holder', revision: 2,
    } },
    shuttleDockings: [{ shuttleId: 'macaw', shipId: 'capybara', dockedAt: 'now' }],
    macawRepairs: { cycle: 4, revision: 2, hosts: [{ shipId: 'capybara', systemIds: ['jump-drive'] }] },
  });
  useSessionStore.getState().setConnection('live');
  useSessionStore.getState().setSessionSnapshotFreshness('server');
});

it('sends the stable request and validates the exact Macaw reply', async () => {
  mocks.call.mockResolvedValue(response());
  await expect(repairConsolesFromMacaw(command)).resolves.toEqual({
    status: 'committed', hostShipId: 'capybara', systemIds: ['reactor', 'storage'],
    scrapRemaining: 1, cycle: 4, repairRevision: 3,
  });
  expect(mocks.callable).toHaveBeenCalledWith('functions', 'repairConsolesFromMacaw');
  expect(mocks.call).toHaveBeenCalledWith({
    sessionId: 's1', requestId: command.requestId, systemIds: command.systemIds,
    expectedControlRevision: 2, expectedRepairRevision: 2,
    expectedCycle: 4, expectedHostShipId: 'capybara',
  });
});

it('accepts replay and rejects malformed or cache-backed calls', async () => {
  mocks.call.mockResolvedValue(response('replayed'));
  await expect(repairConsolesFromMacaw(command)).resolves.toMatchObject({ status: 'replayed' });
  mocks.call.mockResolvedValue({ data: { ...response().data, requestId: 'different' } });
  await expect(repairConsolesFromMacaw(command)).rejects.toThrow(/malformed/i);
  await expect(repairConsolesFromMacaw({ ...command, systemIds: ['reactor', 'reactor'] }))
    .rejects.toThrow(/invalid/i);
  useSessionStore.getState().setSessionSnapshotFreshness('cache');
  await expect(repairConsolesFromMacaw(command)).rejects.toThrow(/live session state/i);
  expect(mocks.call).toHaveBeenCalledTimes(2);
});

it('accepts only a minimal stale envelope while current Capybara Captain authority remains live', async () => {
  mocks.call.mockResolvedValue(staleResponse());
  await expect(repairConsolesFromMacaw(command)).resolves.toMatchObject({
    status: 'stale', sessionId: 's1', requestId: command.requestId,
    currentControlRevision: 3, currentRepairRevision: 3, currentCycle: 4,
  });
  mocks.call.mockResolvedValue({ data: { ...staleResponse().data, holderUid: 'holder' } });
  await expect(repairConsolesFromMacaw(command)).rejects.toThrow(/malformed/i);
});

it('fails closed when the current docking producer is malformed', async () => {
  useSessionStore.getState().setSession({
    ...useSessionStore.getState().session!,
    shuttleDockings: 'unknown' as unknown as NonNullable<GameSession['shuttleDockings']>,
  });
  await expect(repairConsolesFromMacaw(command)).rejects.toThrow(/current Macaw holder|fleet group|dock/i);
  expect(mocks.callable).not.toHaveBeenCalled();
});

it.each([
  ['another request id', { requestId: 'different' }],
  ['another host', { expectedHostShipId: 'aegis' }],
  ['another selected console', { systemIds: ['reactor'] }],
  ['a stale control revision', { currentControlRevision: 1 }],
  ['a stale repair revision', { currentRepairRevision: 1 }],
  ['no newer state', { currentCycle: 4, currentControlRevision: 2, currentRepairRevision: 2 }],
])('rejects a stale response bound to %s', async (_label, patch) => {
  mocks.call.mockResolvedValue({ data: { ...staleResponse().data, ...patch } });
  await expect(repairConsolesFromMacaw(command)).rejects.toThrow(/malformed/i);
});

it.each([
  ['role', () => useSessionStore.getState().setIdentity(useSessionStore.getState().session!, {
    uid: 'holder', sessionId: 's1', displayName: 'Holder', role: 'player', seatId: null,
    assignedRoleId: 'capybara-recycler', activeConsoleRoleId: 'capybara-recycler', fleetGroupId: 'fleet-1', joinedAt: '',
  })],
  ['holder', () => useSessionStore.getState().setSession({
    ...useSessionStore.getState().session!, shuttleControl: { macaw: {
      shuttleId: 'macaw', ownerRoleId: 'capybara-captain', ownerUid: 'owner', holderUid: 'other', revision: 3,
    } },
  })],
  ['fleet group', () => useSessionStore.getState().setIdentity(useSessionStore.getState().session!, {
    uid: 'holder', sessionId: 's1', displayName: 'Holder', role: 'player', seatId: null,
    assignedRoleId: 'capybara-captain', activeConsoleRoleId: 'capybara-captain', fleetGroupId: 'fleet-2', joinedAt: '',
  })],
  ['host', () => useSessionStore.getState().setSession({
    ...useSessionStore.getState().session!, shuttleDockings: [{ shuttleId: 'macaw', shipId: 'aegis', dockedAt: 'now' }],
  })],
  ['docking', () => useSessionStore.getState().setSession({
    ...useSessionStore.getState().session!, shuttleDockings: [
      { shuttleId: 'macaw', shipId: 'capybara', dockedAt: 'now' },
      { shuttleId: 'macaw', shipId: 'aegis', dockedAt: 'later' },
    ],
  })],
  ['Coordination phase', () => useSessionStore.getState().setSession({
    ...useSessionStore.getState().session!,
    turnPhase: { ...useSessionStore.getState().session!.turnPhase!,
      airspace: { state: 'restricted', tickerActive: true, pressAccess: true } },
  })],
])('rejects a stale reply if the current %s changes while it is pending', async (_label, change) => {
  let complete!: (value: ReturnType<typeof staleResponse>) => void;
  mocks.call.mockReturnValue(new Promise((resolve) => { complete = resolve; }));
  const pending = repairConsolesFromMacaw(command);
  change();
  complete(staleResponse());
  await expect(pending).rejects.toThrow(/authority|coordination/i);
});
