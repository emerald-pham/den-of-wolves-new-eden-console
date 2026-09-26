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
const staleReply = (overrides: Record<string, unknown> = {}) => ({
  data: {
    status: 'stale', sessionId: 's1', requestId: command.requestId,
    actorUid: 'captain', actorRoleId: 'gorgoneion-captain', smallShipId: 'gorgoneion',
    hostShipId: 'aegis', systemId: 'reactor',
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

it('accepts only a stale reply bound to this actor, role, target, host, cycle, and both revisions', async () => {
  mocks.call.mockResolvedValue(staleReply());
  await expect(repairWithGorgoneionDrones(command)).resolves.toEqual({
    status: 'stale', hostShipId: 'aegis', systemId: 'reactor',
    cycle: 3, repairCycle: 2, repairRevision: 1,
  });

  for (const mismatch of [
    { requestId: 'another-request' },
    { actorUid: 'another-actor' },
    { actorRoleId: 'warrior-captain' },
    { smallShipId: 'warrior' },
    { hostShipId: 'icebreaker' },
    { systemId: 'storage' },
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
    await expect(repairWithGorgoneionDrones(command)).rejects.toThrow(/malformed/i);
  }
});

it('rejects a stale reply after the Gorgoneion Captain role is lost while pending', async () => {
  let resolve!: (value: ReturnType<typeof staleReply>) => void;
  mocks.call.mockReturnValue(new Promise((complete) => { resolve = complete; }));
  const pending = repairWithGorgoneionDrones(command);
  const current = useSessionStore.getState();
  useSessionStore.getState().setIdentity(current.session!, { ...current.me!, replacementRoleId: null });
  resolve(staleReply());
  await expect(pending).rejects.toThrow(/authority changed while the request was pending/i);
});

it('rejects a stale reply after the Gorgoneion player identity changes while pending', async () => {
  let resolve!: (value: ReturnType<typeof staleReply>) => void;
  mocks.call.mockReturnValue(new Promise((complete) => { resolve = complete; }));
  const pending = repairWithGorgoneionDrones(command);
  const current = useSessionStore.getState();
  useSessionStore.getState().setIdentity(current.session!, { ...current.me!, uid: 'another-captain' });
  resolve(staleReply());
  await expect(pending).rejects.toThrow(/authority changed while the request was pending/i);
});

it('rejects malformed commands and cache-backed session authority before calling the backend', async () => {
  await expect(repairWithGorgoneionDrones({ ...command, expectedDockingRevision: -1 }))
    .rejects.toThrow(/invalid/i);
  useSessionStore.getState().setSessionSnapshotFreshness('cache');
  await expect(repairWithGorgoneionDrones(command)).rejects.toThrow(/live session state/i);
  expect(mocks.call).not.toHaveBeenCalled();
});
