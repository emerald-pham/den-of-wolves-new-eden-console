import { beforeEach, expect, it, vi } from 'vitest';
import { useSessionStore } from '@/store/useSessionStore';

const mocks = vi.hoisted(() => ({ call: vi.fn(), callable: vi.fn() }));
vi.mock('firebase/functions', () => ({ httpsCallable: mocks.callable }));
vi.mock('./firebase', () => ({ functions: () => 'functions' }));

import { repairWithWarriorDrones } from './warriorRepairDronesService';

const command = {
  requestId: 'warrior-repair-1', expectedCycle: 3, expectedRepairRevision: 0,
  expectedDockingRevision: 2, expectedHostShipId: 'icebreaker', systemIds: ['storage', 'reactor'],
};
const reply = (status: 'committed' | 'replayed' = 'committed') => ({
  data: {
    status, sessionId: 's1', requestId: command.requestId, smallShipId: 'warrior',
    hostShipId: 'icebreaker', systemIds: ['storage', 'reactor'], materialsSpent: 6,
    materialsRemaining: 3, cycle: 3, repairRevision: 1,
  },
});
const staleReply = (overrides: Record<string, unknown> = {}) => ({
  data: {
    status: 'stale', sessionId: 's1', requestId: command.requestId,
    actorUid: 'captain', actorRoleId: 'warrior-captain', smallShipId: 'warrior',
    hostShipId: 'icebreaker', systemIds: ['storage', 'reactor'],
    expectedCycle: 3, cycle: 3, expectedRepairRevision: 0, repairRevision: 1,
    expectedDockingRevision: 2, dockingRevision: 2, repairCycle: 2,
    ...overrides,
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
    assignedRoleId: 'doctor', replacementRoleId: 'warrior-captain',
    activeConsoleRoleId: null, joinedAt: '',
  });
  useSessionStore.getState().setConnection('live');
  useSessionStore.getState().setSessionSnapshotFreshness('server');
});

it('sends the exact one or two-console revision-bound command and validates the committed result', async () => {
  mocks.call.mockResolvedValue(reply());
  await expect(repairWithWarriorDrones(command)).resolves.toEqual({
    status: 'committed', hostShipId: 'icebreaker', systemIds: ['storage', 'reactor'],
    materialsSpent: 6, materialsRemaining: 3, cycle: 3, repairRevision: 1,
  });
  expect(mocks.callable).toHaveBeenCalledWith('functions', 'repairWarriorWithDrones');
  expect(mocks.call).toHaveBeenCalledWith({ sessionId: 's1', ...command });
});

it('accepts exact replays and rejects a response bound to another repair', async () => {
  mocks.call.mockResolvedValue(reply('replayed'));
  await expect(repairWithWarriorDrones(command)).resolves.toMatchObject({ status: 'replayed' });
  mocks.call.mockResolvedValue({ data: { ...reply().data, systemIds: ['reactor', 'storage'] } });
  await expect(repairWithWarriorDrones(command)).rejects.toThrow(/malformed/i);
});

it('accepts only a stale reply bound to this actor, role, targets, host, cycle, and both revisions', async () => {
  mocks.call.mockResolvedValue(staleReply());
  await expect(repairWithWarriorDrones(command)).resolves.toEqual({
    status: 'stale', hostShipId: 'icebreaker', systemIds: ['storage', 'reactor'],
    cycle: 3, repairCycle: 2, repairRevision: 1,
  });

  for (const mismatch of [
    { requestId: 'another-request' },
    { actorUid: 'another-actor' },
    { actorRoleId: 'gorgoneion-captain' },
    { smallShipId: 'gorgoneion' },
    { hostShipId: 'aegis' },
    { systemIds: ['reactor', 'storage'] },
    { expectedCycle: 2 },
    { cycle: 2 },
    { expectedRepairRevision: 1 },
    { repairRevision: 0 },
    { expectedDockingRevision: 1 },
    { dockingRevision: 1 },
    { repairCycle: 4 },
    { repairCycle: 0 },
    { extraAuthority: 'mixed' },
  ]) {
    mocks.call.mockResolvedValue(staleReply(mismatch));
    await expect(repairWithWarriorDrones(command)).rejects.toThrow(/malformed/i);
  }
});

it('rejects a stale reply after the Warrior Captain role is lost while pending', async () => {
  let resolve!: (value: ReturnType<typeof staleReply>) => void;
  mocks.call.mockReturnValue(new Promise((complete) => { resolve = complete; }));
  const pending = repairWithWarriorDrones(command);
  const current = useSessionStore.getState();
  useSessionStore.getState().setIdentity(current.session!, { ...current.me!, replacementRoleId: null });
  resolve(staleReply());
  await expect(pending).rejects.toThrow(/authority changed while the request was pending/i);
});

it('rejects a stale reply after the Warrior player identity changes while pending', async () => {
  let resolve!: (value: ReturnType<typeof staleReply>) => void;
  mocks.call.mockReturnValue(new Promise((complete) => { resolve = complete; }));
  const pending = repairWithWarriorDrones(command);
  const current = useSessionStore.getState();
  useSessionStore.getState().setIdentity(current.session!, { ...current.me!, uid: 'another-captain' });
  resolve(staleReply());
  await expect(pending).rejects.toThrow(/authority changed while the request was pending/i);
});

it('rejects malformed commands and cache-backed session authority before calling the backend', async () => {
  await expect(repairWithWarriorDrones({ ...command, systemIds: ['reactor', 'reactor'] }))
    .rejects.toThrow(/invalid/i);
  useSessionStore.getState().setSessionSnapshotFreshness('cache');
  await expect(repairWithWarriorDrones(command)).rejects.toThrow(/live session state/i);
  expect(mocks.call).not.toHaveBeenCalled();
});
