import { beforeEach, expect, it, vi } from 'vitest';
import { useSessionStore } from '@/store/useSessionStore';

const mocks = vi.hoisted(() => ({ call: vi.fn(), callable: vi.fn() }));
vi.mock('firebase/functions', () => ({ httpsCallable: mocks.callable }));
vi.mock('./firebase', () => ({ functions: () => 'functions' }));

import {
  advanceEndeavourResearchTrack,
  readEndeavourResearchWorkspace,
  type EndeavourResearchWorkspace,
} from './endeavourResearchService';

const workspace: EndeavourResearchWorkspace = {
  status: 'ready', sessionId: 's1', cycle: 3, researchRevision: 0,
  cadence: { cycle: 3, revision: 0, choices: [] },
  progress: { reactor: 1 },
  tracks: [{
    trackId: 'reactor', name: 'Reactor', crossedBoxes: 1,
    totalBoxes: 5, currentMaterialCost: 7, complete: false,
  }],
  shepherdOre: 10,
  fieldUpgradeState: { upgradeRevision: 0, targetsUsedThisCycle: 0 },
};

beforeEach(() => {
  mocks.call.mockReset();
  mocks.callable.mockReset();
  mocks.callable.mockReturnValue(mocks.call);
  useSessionStore.getState().reset();
  useSessionStore.getState().setIdentity({
    id: 's1', name: 'Fleet', joinCode: '1234', phase: 'active', ownerUid: 'owner',
    currentTurn: 3, activeRoleIds: ['shepherd-scientist'],
    shuttleControl: { endeavour: {
      shuttleId: 'endeavour', ownerRoleId: 'shepherd-scientist', ownerUid: 'scientist',
      holderUid: 'scientist', revision: 4,
    } },
    createdAt: '', updatedAt: '',
  }, {
    uid: 'scientist', sessionId: 's1', displayName: 'Scientist', role: 'player', seatId: null,
    assignedRoleId: 'shepherd-scientist', activeConsoleRoleId: 'shepherd-scientist', joinedAt: '',
  });
  useSessionStore.getState().setConnection('live');
  useSessionStore.getState().setSessionSnapshotFreshness('server');
});

it('reads and validates the private research workspace through the named callable', async () => {
  mocks.call.mockResolvedValueOnce({ data: workspace });
  await expect(readEndeavourResearchWorkspace()).resolves.toEqual(workspace);
  expect(mocks.callable).toHaveBeenCalledWith('functions', 'readEndeavourResearchWorkspace');
  expect(mocks.call).toHaveBeenCalledWith({ sessionId: 's1' });
});

it('sends only the selected track, funding, and observed revision/cycle/control CAS', async () => {
  await advanceEndeavourResearchTrack({ workspace, trackId: 'reactor', funding: 'shepherd-ore' });
  expect(mocks.callable).toHaveBeenCalledWith('functions', 'advanceEndeavourResearchTrack');
  expect(mocks.call).toHaveBeenCalledWith({
    sessionId: 's1', requestId: expect.any(String), expectedControlRevision: 4,
    expectedResearchRevision: 0, expectedCycle: 3, trackId: 'reactor', funding: 'shepherd-ore',
  });
});

it('does not request or retain private research from a cached session or a different role', async () => {
  useSessionStore.getState().setSessionSnapshotFreshness('cache');
  await expect(readEndeavourResearchWorkspace()).rejects.toThrow(/live session state/i);
  expect(mocks.callable).not.toHaveBeenCalled();

  useSessionStore.getState().setSessionSnapshotFreshness('server');
  useSessionStore.getState().setMe({
    ...useSessionStore.getState().me!, activeConsoleRoleId: 'shepherd-engineer',
  });
  await expect(readEndeavourResearchWorkspace()).rejects.toThrow(/current Shepherd Scientist/i);
  expect(mocks.callable).not.toHaveBeenCalled();
});

it('drops a delayed private reply after the active console role changes', async () => {
  let resolve!: (result: { data: EndeavourResearchWorkspace }) => void;
  mocks.call.mockReturnValueOnce(new Promise((done) => { resolve = done; }));
  const pending = readEndeavourResearchWorkspace();
  useSessionStore.getState().setMe({
    ...useSessionStore.getState().me!, activeConsoleRoleId: 'shepherd-engineer',
  });
  resolve({ data: workspace });
  await expect(pending).rejects.toThrow(/authority changed/i);
});

it('fails closed on malformed server projections', async () => {
  for (const data of [
    { ...workspace, tracks: [{ ...workspace.tracks[0]!, privateCost: 99 }] },
    { ...workspace, tracks: [{ ...workspace.tracks[0]!, totalBoxes: '5' }] },
    { ...workspace, fieldUpgradeState: { upgradeRevision: -1, targetsUsedThisCycle: 0 } },
  ]) {
    mocks.call.mockResolvedValueOnce({ data });
    await expect(readEndeavourResearchWorkspace()).rejects.toThrow(/invalid Endeavour research data/i);
  }
});
