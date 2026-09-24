import { beforeEach, expect, it, vi } from 'vitest';
import { useSessionStore } from '@/store/useSessionStore';

const mocks = vi.hoisted(() => ({ call: vi.fn(), callable: vi.fn() }));
vi.mock('firebase/functions', () => ({ httpsCallable: mocks.callable }));
vi.mock('./firebase', () => ({ functions: () => 'functions' }));

import { repairWithGorgoneionDrones } from './gorgoneionRepairDronesService';

const command = {
  requestId: 'gorg-repair-1', expectedCycle: 3, expectedRepairRevision: 0,
  expectedDockingRevision: 2, expectedHostShipId: 'aegis', systemId: 'reactor',
};
const reply = (status: 'committed' | 'replayed' = 'committed') => ({
  data: {
    status, sessionId: 's1', requestId: command.requestId, smallShipId: 'gorgoneion',
    hostShipId: 'aegis', systemId: 'reactor', materialsSpent: 3,
    materialsRemaining: 2, cycle: 3, repairRevision: 1,
  },
});

beforeEach(() => {
  mocks.call.mockReset(); mocks.callable.mockReset(); mocks.callable.mockReturnValue(mocks.call);
  useSessionStore.getState().reset();
  useSessionStore.getState().setIdentity({
    id: 's1', name: 'Fleet', joinCode: '1234', phase: 'active', ownerUid: 'owner',
    createdAt: '', updatedAt: '',
  }, {
    uid: 'captain', sessionId: 's1', displayName: 'Captain', role: 'player', seatId: null,
    assignedRoleId: 'warrior-captain', replacementRoleId: 'gorgoneion-captain',
    activeConsoleRoleId: null, joinedAt: '',
  });
  useSessionStore.getState().setConnection('live');
  useSessionStore.getState().setSessionSnapshotFreshness('server');
});

it('sends current revision-bound host/dock authority and validates the committed result', async () => {
  mocks.call.mockResolvedValue(reply());
  await expect(repairWithGorgoneionDrones(command)).resolves.toEqual({
    status: 'committed', hostShipId: 'aegis', systemId: 'reactor',
    materialsSpent: 3, materialsRemaining: 2, cycle: 3, repairRevision: 1,
  });
  expect(mocks.callable).toHaveBeenCalledWith('functions', 'repairGorgoneionWithDrones');
  expect(mocks.call).toHaveBeenCalledWith({ sessionId: 's1', ...command });
});

it('accepts exact replays and rejects a response bound to another repair', async () => {
  mocks.call.mockResolvedValue(reply('replayed'));
  await expect(repairWithGorgoneionDrones(command)).resolves.toMatchObject({ status: 'replayed' });
  mocks.call.mockResolvedValue({ data: { ...reply().data, materialsSpent: 2 } });
  await expect(repairWithGorgoneionDrones(command)).rejects.toThrow(/malformed/i);
});

it('rejects malformed commands and cache-backed session authority before calling the backend', async () => {
  await expect(repairWithGorgoneionDrones({ ...command, expectedDockingRevision: -1 }))
    .rejects.toThrow(/invalid/i);
  useSessionStore.getState().setSessionSnapshotFreshness('cache');
  await expect(repairWithGorgoneionDrones(command)).rejects.toThrow(/live session state/i);
  expect(mocks.call).not.toHaveBeenCalled();
});
