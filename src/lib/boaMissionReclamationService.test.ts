import { beforeEach, expect, it, vi } from 'vitest';
import { useSessionStore } from '@/store/useSessionStore';
import type { GameSession } from '@/types/game';

const mocks = vi.hoisted(() => ({ call: vi.fn(), callable: vi.fn() }));
vi.mock('firebase/functions', () => ({ httpsCallable: mocks.callable }));
vi.mock('./firebase', () => ({ functions: () => 'functions' }));

import {
  chooseBoaMissionReclamationOpportunity,
  readBoaMissionReclamationWorkspace,
} from './boaMissionReclamationService';

const command = {
  requestId: 'boa-choice-1', missionOpportunityId: 'arrival-fleet-1-A-5143', taskOpportunityId: 'L-1',
  expectedControlRevision: 2, expectedChoiceRevision: 0, expectedCycle: 5,
};
const workspace = {
  status: 'available', sessionId: 's1', actorUid: 'holder', groupId: 'fleet-1', hostShipId: 'aegis',
  controlRevision: 2, cycle: 5,
  opportunities: [{
    missionOpportunityId: 'arrival-fleet-1-A-5143', groupId: 'fleet-1', chart: 'A', coordinate: '5143',
    siteCode: 'L', siteName: 'Asterion', sourceCycle: 5, choiceRevision: 0,
    taskOpportunities: [{ id: 'L-1', description: 'Recover the survey crew.', difficulty: 15, criticalThreshold: 25 }],
  }],
  lapsedChoices: [],
};

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
    ...useSessionStore.getState().session!, currentTurn: 5, expansion: 'capybara', capybaraEnabled: true,
    activeRoleIds: ['capybara-captain', 'capybara-recycler'], activeVesselIds: ['capybara', 'aegis'],
    shuttleDockings: [{ shuttleId: 'boa', shipId: 'aegis', dockedAt: 'now' }],
    shuttleControl: { boa: { shuttleId: 'boa', ownerRoleId: 'capybara-recycler',
      ownerUid: 'holder', holderUid: 'holder', revision: 2 } },
  } as GameSession);
  useSessionStore.getState().setConnection('live');
  useSessionStore.getState().setSessionSnapshotFreshness('server');
});

it('reads the workspace through the named callable and binds it to the current Boa station', async () => {
  mocks.call.mockResolvedValue({ data: workspace });
  await expect(readBoaMissionReclamationWorkspace('s1')).resolves.toMatchObject({
    hostShipId: 'aegis', controlRevision: 2, cycle: 5,
    opportunities: [{ missionOpportunityId: 'arrival-fleet-1-A-5143', taskOpportunities: [{ id: 'L-1' }] }],
  });
  expect(mocks.callable).toHaveBeenCalledWith('functions', 'readBoaMissionReclamationWorkspace');
  expect(mocks.call).toHaveBeenCalledWith({ sessionId: 's1' });
});

it('rejects a workspace reply for another Boa station', async () => {
  mocks.call.mockResolvedValue({ data: { ...workspace, hostShipId: 'capybara' } });
  await expect(readBoaMissionReclamationWorkspace('s1')).rejects.toThrow(/changed/);
});

it('sends the exact pre-deal choice and accepts only the matching committed or replayed receipt', async () => {
  const reply = { status: 'replayed', sessionId: 's1', requestId: command.requestId,
    missionOpportunityId: command.missionOpportunityId, taskOpportunityId: 'L-1', choiceRevision: 1 };
  mocks.call.mockResolvedValueOnce({ data: reply });
  await expect(chooseBoaMissionReclamationOpportunity(command)).resolves.toEqual(reply);
  expect(mocks.callable).toHaveBeenCalledWith('functions', 'chooseBoaMissionReclamationOpportunity');
  expect(mocks.call).toHaveBeenCalledWith({ sessionId: 's1', ...command });

  mocks.call.mockResolvedValueOnce({ data: { ...reply, taskOpportunityId: 'L-2' } });
  await expect(chooseBoaMissionReclamationOpportunity(command)).rejects.toThrow(/did not match/);
});

it('does not call the server when this browser no longer holds the Boa', async () => {
  const session = useSessionStore.getState().session!;
  useSessionStore.getState().setSession({ ...session, shuttleControl: { boa: {
    shuttleId: 'boa', ownerRoleId: 'capybara-recycler', ownerUid: 'holder', holderUid: 'someone-else', revision: 3,
  } } } as GameSession);
  await expect(chooseBoaMissionReclamationOpportunity(command)).rejects.toThrow(/Boa Recycler station/);
  expect(mocks.call).not.toHaveBeenCalled();
});

it('carries the Recycler’s lapsed choice and rejects an unknown lapse reason', async () => {
  const lapsed = { missionOpportunityId: 'arrival-fleet-1-A-6837', siteName: 'Derelict', coordinate: '6837',
    taskOpportunityId: 'D-1', reason: 'recycler-not-on-mission' };
  mocks.call.mockResolvedValueOnce({ data: { ...workspace, lapsedChoices: [lapsed] } });
  await expect(readBoaMissionReclamationWorkspace('s1')).resolves.toMatchObject({ lapsedChoices: [lapsed] });
  mocks.call.mockResolvedValueOnce({ data: { ...workspace, lapsedChoices: [{ ...lapsed, reason: 'invented' }] } });
  await expect(readBoaMissionReclamationWorkspace('s1')).rejects.toThrow(/lapsed/);
});
