import { beforeEach, expect, it, vi } from 'vitest';
import { useSessionStore } from '@/store/useSessionStore';
import { sessionSnapshotAuthorityFor } from './sessionSnapshotAuthority';
import { createCandidateAttempt, executeCandidateAttempt, readCandidateWorkspace, recoverCandidateAttempt } from './candidateService';

const transport = vi.hoisted(() => ({ call: vi.fn() }));
vi.mock('firebase/functions', () => ({ httpsCallable: () => transport.call }));
vi.mock('./firebase', () => ({ functions: () => ({}) }));
const gmInstance = { id: 'original-gm-instance', uid: 'actor', sessionId: 's1', name: 'GM',
  deviceLabel: 'test', claimedAt: '2026-10-05T10:00:00.000Z' };
const publicPath = {
  code: 'O', coordinate: '0408', title: 'Deep Nebula', blockers: [], nextActor: 'Each ship chooses its long jump.',
  materials: 0, materialsRequired: 10, researchCount: 0, researchRequired: 5,
  shuttleCommitted: false, repaired: false, liberated: false, chargeCapacity: 0, requiredCapacity: 18,
  reactorShipIds: [], activated: false, sabotaged: false, completed: false, canSabotage: false,
  researchChoices: [], engineeringShuttles: [],
  ships: [{ shipId: 'aegis', result: 'awaiting-choice', fuelCost: 6, reactorCapacity: 0, canAct: true, blocker: '' }],
};
const workspace = { type: 'candidate-workspace', sessionId: 's1', groupId: 'fleet-1', cycle: 6,
  revision: 1, paths: [publicPath] };
const privateReply = { ...workspace, privateCalculations: [{ requestId: 'audit-1', code: 'O', result: 'lost',
  calculation: { privateScoutBonus: 3 } }] };
function mutateMe(patch: Record<string, unknown>) {
  useSessionStore.setState(state => ({ me: { ...state.me!, ...patch } as never }));
}
beforeEach(() => {
  vi.clearAllMocks(); localStorage.clear();
  useSessionStore.setState({ session: { id: 's1', currentTurn: 6, phase: 'active' } as never,
    me: { uid: 'actor', role: 'gm', sessionId: 's1', fleetGroupId: 'fleet-1' } as never,
    gmInstance, connection: 'live', sessionSnapshotFreshness: 'server' });
});
it('rejects a delayed private GM workspace after same-UID same-group demotion', async () => {
  transport.call.mockImplementation(async () => {
    mutateMe({ role: 'player' }); useSessionStore.setState({ gmInstance: null });
    return { data: privateReply };
  });
  await expect(readCandidateWorkspace('fleet-1')).rejects.toThrow(/authority|audience|identity|GM|changed/i);
});
it.each([
  ['instance', { id: 'replacement-gm-instance' }],
  ['claim', { claimedAt: '2026-10-05T10:01:00.000Z' }],
  ['owner', { uid: 'other-gm' }],
  ['session', { sessionId: 'other-session' }],
])('rejects a delayed private workspace after its original GM %s changes', async (_kind, patch) => {
  transport.call.mockImplementation(async () => {
    useSessionStore.setState({ gmInstance: { ...gmInstance, ...patch } }); return { data: privateReply };
  });
  await expect(readCandidateWorkspace('fleet-1')).rejects.toThrow(/authority|audience|identity|GM|changed/i);
});
it.each([
  ['role', { role: 'press' }], ['membership', { sessionId: 'other-session' }], ['UID', { uid: 'other-actor' }],
])('rejects a delayed private workspace after the actor %s changes', async (_kind, patch) => {
  transport.call.mockImplementation(async () => { mutateMe(patch); return { data: privateReply }; });
  await expect(readCandidateWorkspace('fleet-1')).rejects.toThrow(/authority|audience|identity|GM|changed/i);
});
it.each([
  ['connection', { connection: 'offline' }], ['snapshot', { sessionSnapshotFreshness: 'cache' }],
])('rejects a delayed workspace after live %s authority is lost', async (_kind, patch) => {
  transport.call.mockImplementation(async () => { useSessionStore.setState(patch as never); return { data: privateReply }; });
  await expect(readCandidateWorkspace('fleet-1')).rejects.toThrow(/authority|audience|live|Reconnect|changed/i);
});
it('rejects a workspace sampled before a newer accepted session authority', async () => {
  transport.call.mockImplementation(async () => {
    const authority = sessionSnapshotAuthorityFor('s1', 'actor');
    authority.authorityVersion = (authority.authorityVersion ?? 0) + 1;
    return { data: privateReply };
  });
  await expect(readCandidateWorkspace('fleet-1')).rejects.toThrow(/authority|audience|live|refresh|changed/i);
});
it.each([
  ['promotion', { role: 'gm' }], ['group', { fleetGroupId: 'fleet-2' }],
  ['assigned role', { assignedRoleId: 'shepherd-captain' }], ['console', { activeConsoleRoleId: 'shepherd-captain' }],
])('rejects a delayed player workspace after %s changes', async (_kind, patch) => {
  mutateMe({ role: 'player', assignedRoleId: 'shepherd-scientist', activeConsoleRoleId: 'shepherd-scientist' });
  transport.call.mockImplementation(async () => { mutateMe(patch); return { data: workspace }; });
  await expect(readCandidateWorkspace('fleet-1')).rejects.toThrow(/authority|audience|identity|changed/i);
});
it('projects only operational player fields even when a response accidentally contains private extras', async () => {
  mutateMe({ role: 'player' }); useSessionStore.setState({ gmInstance: null });
  const cacheBefore = { ...localStorage };
  transport.call.mockResolvedValue({ data: { ...privateReply, privateSourceId: 'private-source',
    paths: [{ ...publicPath, canSabotage: true, privateScoutBonus: 3,
      researchChoices: [{ id: 'reactor', name: 'Reactor', privateNotes: 'private-track' }],
      engineeringShuttles: [{ id: 'philia', available: true, privateNotes: 'private-craft' }],
      ships: [{ ...publicPath.ships[0], privateRollTotal: 8 }] }] } });
  const actual = await readCandidateWorkspace('fleet-1');
  expect(actual).not.toHaveProperty('privateCalculations');
  expect(JSON.stringify(actual)).not.toMatch(/privateScoutBonus|privateRollTotal|privateSourceId|privateNotes/);
  expect(actual.paths[0]?.canSabotage).toBe(false);
  expect(actual.paths[0]?.ships).toEqual(publicPath.ships);
  expect(transport.call).toHaveBeenCalledWith({ sessionId: 's1', expectedGroupId: 'fleet-1' });
  expect({ ...localStorage }).toEqual(cacheBefore);
});
it('preserves the private workspace only for the same live GM claim', async () => {
  transport.call.mockResolvedValue({ data: privateReply });
  await expect(readCandidateWorkspace('fleet-1')).resolves.toEqual(privateReply);
  expect(transport.call).toHaveBeenCalledWith({ sessionId: 's1', expectedGroupId: 'fleet-1', instanceId: gmInstance.id });
});
it('keeps the exact original GM mutation pending after same-UID demotion', async () => {
  const attempt = createCandidateAttempt({ expectedRevision: 0, expectedGroupId: 'fleet-1', code: 'N',
    coordinate: '6798', action: 'contribute-materials', shipId: 'aegis', amount: 1 });
  transport.call.mockImplementation(async () => {
    mutateMe({ role: 'player' }); useSessionStore.setState({ gmInstance: null });
    return { data: { type: 'candidate-action-result', status: 'committed', sessionId: 's1',
      requestId: attempt.requestId, revision: 1, code: 'N', action: 'contribute-materials', summary: 'One material committed.' } };
  });
  await expect(executeCandidateAttempt(attempt)).rejects.toThrow(/authority|audience|identity|changed/i);
  mutateMe({ role: 'gm' }); useSessionStore.setState({ gmInstance });
  expect(recoverCandidateAttempt('fleet-1')).toEqual(attempt);
});
it('returns the original player result after its settled console is released without changing actor audience', async () => {
  mutateMe({ role: 'player', assignedRoleId: 'executive-officer', activeConsoleRoleId: 'executive-officer' });
  useSessionStore.setState({ gmInstance: null });
  const attempt = createCandidateAttempt({ expectedRevision: 0, expectedGroupId: 'fleet-1', code: 'O',
    coordinate: '0408', action: 'nebula-jump', shipId: 'aegis' });
  const result = { type: 'candidate-action-result', status: 'committed', sessionId: 's1', requestId: attempt.requestId,
    revision: 1, code: 'O', action: 'nebula-jump', summary: 'Original paid loss.', outcome: 'lost', fuelSpent: 6, remainingFuel: 4 };
  transport.call.mockImplementation(async () => {
    mutateMe({ activeConsoleRoleId: undefined, candidateDisposition: { code: 'O', outcome: 'lost', cycle: 6 } });
    return { data: result };
  });
  await expect(executeCandidateAttempt(attempt)).resolves.toEqual(result);
  expect(recoverCandidateAttempt('fleet-1')).toBeUndefined();
});
