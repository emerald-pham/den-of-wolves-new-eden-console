import { beforeEach, expect, it, vi } from 'vitest';
import { useSessionStore } from '@/store/useSessionStore';

const mocks = vi.hoisted(() => ({ call: vi.fn(), callable: vi.fn() }));
vi.mock('firebase/functions', () => ({ httpsCallable: mocks.callable }));
vi.mock('./firebase', () => ({ functions: () => 'functions' }));

import { recycleWithBoa } from './boaRecyclingService';

const command = {
  requestId: 'boa-recycling-1', recipeId: 'food' as const,
  expectedControlRevision: 2, expectedRecyclingRevision: 4,
  expectedCycle: 5, expectedHostShipId: 'aegis',
};
const response = (status: 'committed' | 'replayed' = 'committed') => ({
  data: {
    status, sessionId: 's1', requestId: command.requestId, shuttleId: 'boa',
    hostShipId: 'aegis', recipeId: 'food', resourceId: 'food', resourceCost: 6,
    hostResourceRemaining: 2, scrapRemaining: 7, cycle: 5,
    recyclingRevision: 5, exchangesThisCycle: 2,
  },
});
const staleResponse = (patch: Record<string, unknown> = {}) => ({
  data: {
    status: 'stale', sessionId: 's1', requestId: command.requestId, shuttleId: 'boa',
    recipeId: command.recipeId, expectedHostShipId: command.expectedHostShipId,
    expectedControlRevision: command.expectedControlRevision, currentControlRevision: 3,
    expectedRecyclingRevision: command.expectedRecyclingRevision, currentRecyclingRevision: 5,
    expectedCycle: command.expectedCycle, currentCycle: command.expectedCycle,
    ...patch,
  },
});

function updateSession(patch: Record<string, unknown>): void {
  const current = useSessionStore.getState().session!;
  useSessionStore.getState().setSession({ ...current, ...patch });
}

beforeEach(() => {
  mocks.call.mockReset(); mocks.callable.mockReset(); mocks.callable.mockReturnValue(mocks.call);
  useSessionStore.getState().reset();
  useSessionStore.getState().setIdentity({
    id: 's1', name: 'Fleet', joinCode: '1234', phase: 'active', ownerUid: 'owner', createdAt: '', updatedAt: '',
  }, {
    uid: 'holder', sessionId: 's1', displayName: 'Holder', role: 'player', seatId: null,
    assignedRoleId: 'capybara-recycler', activeConsoleRoleId: 'capybara-recycler',
    fleetGroupId: 'fleet-1', joinedAt: '',
  });
  useSessionStore.getState().setSession({
    ...useSessionStore.getState().session!, currentTurn: 5,
    activeRoleIds: ['capybara-captain', 'capybara-recycler'], activeVesselIds: ['capybara', 'aegis'],
    turnPhase: { turn: 5, teamPhaseEndsAt: '2099-09-23T12:00:00.000Z',
      openAirspaceEndsAt: '2099-09-23T12:15:00.000Z', airspace: { state: 'lifted', tickerActive: true, pressAccess: true } },
    shuttleDockings: [{ shuttleId: 'boa', shipId: 'aegis', dockedAt: 'now' }],
    shuttleControl: { boa: { shuttleId: 'boa', ownerRoleId: 'capybara-recycler',
      ownerUid: 'holder', holderUid: 'holder', revision: 2 } },
    shuttleFuelled: { boa: true },
    boaRecycling: { cycle: 5, revision: 4, exchangesThisCycle: 1 },
    shuttleCargo: { boa: { scrap: 7 } },
    shipResources: { aegis: { ore: 6, fuel: 6, food: 8, water: 7, materials: 3, securityTeams: 9 } },
  });
  useSessionStore.getState().setConnection('live');
  useSessionStore.getState().setSessionSnapshotFreshness('server');
});

it('sends the expected docked-host command and validates its exact reply', async () => {
  mocks.call.mockResolvedValue(response());
  await expect(recycleWithBoa(command)).resolves.toEqual({
    status: 'committed', hostShipId: 'aegis', recipeId: 'food', resourceId: 'food',
    resourceCost: 6, hostResourceRemaining: 2, scrapRemaining: 7,
    cycle: 5, recyclingRevision: 5, exchangesThisCycle: 2,
  });
  expect(mocks.callable).toHaveBeenCalledWith('functions', 'recycleWithBoa');
  expect(mocks.call).toHaveBeenCalledWith({
    sessionId: 's1', ...command,
  });
});

it('accepts an exact replay and rejects malformed or cache-backed calls', async () => {
  mocks.call.mockResolvedValue(response('replayed'));
  await expect(recycleWithBoa(command)).resolves.toMatchObject({ status: 'replayed' });
  mocks.call.mockResolvedValue({ data: { ...response().data, requestId: 'different' } });
  await expect(recycleWithBoa(command)).rejects.toThrow(/malformed/i);
  await expect(recycleWithBoa({ ...command, recipeId: 'securityTeams' as never })).rejects.toThrow(/invalid/i);
  useSessionStore.getState().setSessionSnapshotFreshness('cache');
  await expect(recycleWithBoa(command)).rejects.toThrow(/live session state/i);
  expect(mocks.call).toHaveBeenCalledTimes(2);
});

it('accepts only the minimal request-bound stale revision envelope', async () => {
  mocks.call.mockResolvedValue(staleResponse());
  await expect(recycleWithBoa(command)).resolves.toEqual(staleResponse().data);
  expect(mocks.callable).toHaveBeenCalledWith('functions', 'recycleWithBoa');
  expect(mocks.call).toHaveBeenCalledWith({ sessionId: 's1', ...command });
  expect(Object.keys(staleResponse().data).sort()).toEqual([
    'currentControlRevision', 'currentCycle', 'currentRecyclingRevision',
    'expectedControlRevision', 'expectedCycle', 'expectedHostShipId',
    'expectedRecyclingRevision', 'recipeId', 'requestId', 'sessionId', 'shuttleId', 'status',
  ].sort());
});

it.each([
  ['wrong request', { requestId: 'other' }],
  ['wrong recipe', { recipeId: 'water' }],
  ['wrong host', { expectedHostShipId: 'capybara' }],
  ['wrong expected control revision', { expectedControlRevision: 1 }],
  ['wrong expected ledger revision', { expectedRecyclingRevision: 3 }],
  ['older cycle', { currentCycle: 4 }],
  ['future revision', { currentControlRevision: 1 }],
  ['extra private field', { holderUid: 'holder' }],
])('rejects stale recovery with %s', async (_label, patch) => {
  mocks.call.mockResolvedValue(staleResponse(patch));
  await expect(recycleWithBoa(command)).rejects.toThrow(/malformed|authority/i);
});

it.each([
  ['role loss', () => useSessionStore.getState().setMe({
    ...useSessionStore.getState().me!, assignedRoleId: 'capybara-captain', activeConsoleRoleId: 'capybara-captain',
  })],
  ['holder change', () => updateSession({ shuttleControl: { boa: {
    shuttleId: 'boa', ownerRoleId: 'capybara-recycler', ownerUid: 'holder', holderUid: 'other', revision: 3,
  } } })],
  ['fleet group change', () => useSessionStore.getState().setMe({
    ...useSessionStore.getState().me!, fleetGroupId: 'fleet-2',
  })],
  ['host change', () => updateSession({ shuttleDockings: [{ shuttleId: 'boa', shipId: 'capybara', dockedAt: 'later' }] })],
  ['docking loss', () => updateSession({ shuttleDockings: [] })],
])('rejects a delayed stale response after %s', async (_label, changeAuthority) => {
  let resolve!: (value: ReturnType<typeof staleResponse>) => void;
  mocks.call.mockReturnValueOnce(new Promise((done) => { resolve = done; }));
  const pending = recycleWithBoa(command);
  await Promise.resolve();
  changeAuthority();
  resolve(staleResponse());
  await expect(pending).rejects.toThrow(/authority|current|reconnect/i);
});
