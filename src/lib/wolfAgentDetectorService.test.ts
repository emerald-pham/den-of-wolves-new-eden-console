import { beforeEach, expect, it, vi } from 'vitest';
import { useSessionStore } from '@/store/useSessionStore';

const mocks = vi.hoisted(() => ({ call: vi.fn(), callable: vi.fn() }));
vi.mock('firebase/functions', () => ({ httpsCallable: mocks.callable }));
vi.mock('./firebase', () => ({ functions: () => 'functions' }));

import { runWolfAgentDetectorTest } from './wolfAgentDetectorService';

beforeEach(() => {
  mocks.call.mockReset();
  mocks.callable.mockReset();
  mocks.callable.mockReturnValue(mocks.call);
  useSessionStore.getState().reset();
  useSessionStore.getState().setIdentity({
    id: 's1', name: 'Fleet', joinCode: '1234', phase: 'active', ownerUid: 'owner', currentTurn: 3,
    activeRoleIds: ['shepherd-scientist'], activeVesselIds: ['shepherd'],
    turnPhase: { turn: 3, teamPhaseEndsAt: '2099-09-23T12:00:00.000Z',
      openAirspaceEndsAt: '2099-09-23T12:15:00.000Z', airspace: { state: 'restricted', tickerActive: true, pressAccess: false } },
    shuttleControl: { endeavour: { shuttleId: 'endeavour', ownerRoleId: 'shepherd-scientist',
      ownerUid: 'scientist', holderUid: 'scientist', revision: 4 } },
    createdAt: '', updatedAt: '',
  }, {
    uid: 'scientist', sessionId: 's1', displayName: 'Scientist', role: 'player', seatId: null,
    assignedRoleId: 'shepherd-scientist', activeConsoleRoleId: 'shepherd-scientist', joinedAt: '',
  });
  useSessionStore.getState().setConnection('live');
  useSessionStore.getState().setSessionSnapshotFreshness('server');
});

it('submits only a current cycle/revision target and accepts the sanitized investigator report', async () => {
  mocks.call.mockImplementation(async (payload) => ({ data: {
    status: 'committed', type: 'wolf-agent-detector-test', sessionId: 's1',
    requestId: payload.requestId, cycle: 3, revision: 5, investigatorUid: 'scientist',
    targetUid: 'target', targetDisplayName: 'Target', reportedWolf: true,
  } }));
  await expect(runWolfAgentDetectorTest('target', 4)).resolves.toMatchObject({
    targetUid: 'target', investigatorUid: 'scientist', cycle: 3, revision: 5, reportedWolf: true,
  });
  expect(mocks.callable).toHaveBeenCalledWith('functions', 'runWolfAgentDetectorTest');
  expect(mocks.call).toHaveBeenCalledWith(expect.objectContaining({
    sessionId: 's1', expectedCycle: 3, expectedRevision: 4, targetUid: 'target',
  }));
  expect(mocks.call.mock.calls[0][0]).not.toHaveProperty('actualWolf');
});

it('refuses to submit without the current Scientist and Endeavour authority', async () => {
  useSessionStore.getState().setIdentity({
    id: 's1', name: 'Fleet', joinCode: '1234', phase: 'active', ownerUid: 'owner', currentTurn: 3,
    activeRoleIds: ['shepherd-scientist'], createdAt: '', updatedAt: '',
  }, {
    uid: 'other', sessionId: 's1', displayName: 'Other', role: 'player', seatId: null,
    assignedRoleId: 'other-role', activeConsoleRoleId: 'other-role', joinedAt: '',
  });
  await expect(runWolfAgentDetectorTest('target', 4)).rejects.toThrow(/current Shepherd Scientist/i);
  expect(mocks.call).not.toHaveBeenCalled();
});
