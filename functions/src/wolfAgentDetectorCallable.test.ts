import { beforeEach, expect, it, vi } from 'vitest';
import type { CallableRequest } from 'firebase-functions/v2/https';

type Fields = Record<string, unknown>;

const random = vi.hoisted(() => ({ randomInt: vi.fn(() => 1) }));
const mock = vi.hoisted(() => {
  const documents = new Map<string, Fields>();
  const snapshot = (path: string) => {
    const fields = documents.get(path);
    return {
      exists: fields !== undefined,
      id: path.split('/').at(-1) ?? '',
      ref: { path },
      get: (field: string) => fields?.[field],
      data: () => fields,
    };
  };
  const ref = (path: string) => ({ path, id: path.split('/').at(-1) ?? '' });
  const get = vi.fn(async (target: { path: string }) => snapshot(target.path));
  const set = vi.fn((target: { path: string }, value: Fields) => documents.set(target.path, { ...value }));
  const runTransaction = vi.fn(async (callback: (tx: unknown) => unknown) => callback({ get, set }));
  return { documents, get, set, runTransaction, db: { doc: ref, runTransaction } };
});

vi.mock('node:crypto', () => random);
vi.mock('firebase-admin/firestore', () => ({
  getFirestore: () => mock.db,
  FieldValue: { serverTimestamp: () => 'server-time' },
  Timestamp: class MockTimestamp { toDate() { return new Date('2999-01-01T00:00:00Z'); } },
}));
vi.mock('firebase-functions/v2/https', () => ({
  HttpsError: class HttpsError extends Error { constructor(readonly code: string, message: string) { super(message); } },
  onCall: (handler: (request: unknown) => unknown) => ({ run: handler }),
}));

import { runWolfAgentDetectorTest } from './index';

const payload = {
  sessionId: 's1', requestId: 'detector-1', expectedCycle: 1, expectedRevision: 0, targetUid: 'u2',
};
function request(data: Record<string, unknown> = payload, uid = 'u1') {
  return { data, auth: { uid } } as CallableRequest<Record<string, unknown>>;
}
function put(path: string, fields: Fields): void { mock.documents.set(path, { ...fields }); }

beforeEach(() => {
  mock.documents.clear(); mock.get.mockClear(); mock.set.mockClear(); mock.runTransaction.mockClear();
  random.randomInt.mockReset(); random.randomInt.mockReturnValue(1);
  put('sessions/s1', {
    phase: 'active', currentTurn: 1, activeVesselIds: ['shepherd'],
    turnPhase: {
      turn: 1, teamPhaseEndsAt: '2999-01-01T00:00:00Z', openAirspaceEndsAt: '2999-01-01T01:00:00Z',
      airspace: { state: 'restricted', tickerActive: true, pressAccess: false },
    },
    shuttleControl: { endeavour: { ownerRoleId: 'shepherd-scientist', holderUid: 'u1' } },
  });
  put('sessions/s1/players/u1', {
    role: 'player', connected: true, displayName: 'Scientist', assignedRoleId: 'shepherd-scientist',
    activeConsoleRoleId: 'shepherd-scientist', fleetGroupId: 'fleet-1',
  });
  put('sessions/s1/players/u2', { role: 'player', connected: true, displayName: 'Target' });
  put('sessions/s1/fleetGroups/fleet-1', { id: 'fleet-1', vesselIds: ['shepherd'], memberUids: ['u1', 'u2'] });
  put('sessions/s1/serverState/endeavourResearch', { 'wolf-agent-detector': 4 });
  put('sessions/s1/secrets/loyalty-u2', {
    visibleToUids: ['u2'], payload: { type: 'loyalty', kind: 'wolf-agent', suspicion: 0 },
  });
});

it('persists private reports separately from server-only truth and accuracy evidence', async () => {
  random.randomInt.mockReturnValue(4);
  const result = await runWolfAgentDetectorTest.run(request());
  expect(result).toEqual({
    status: 'committed', type: 'wolf-agent-detector-test', sessionId: 's1', requestId: 'detector-1',
    cycle: 1, revision: 1, investigatorUid: 'u1', targetUid: 'u2', targetDisplayName: 'Target', reportedWolf: true,
  });
  expect(result).not.toHaveProperty('actualWolf');
  expect(result).not.toHaveProperty('accuracyRoll');
  expect(mock.documents.get('sessions/s1/wolfAgentDetectorReports/u1')).toMatchObject({
    visibleToUids: ['u1'], reportedWolf: true,
  });
  expect(mock.documents.get('sessions/s1/wolfAgentDetectorReports/u1')).not.toHaveProperty('actualWolf');
  expect(mock.documents.get('sessions/s1/wolfAgentDetectorAudits/detector-1')).toMatchObject({
    targetLoyaltyKind: 'wolf-agent', actualWolf: true, reportedWolf: true, accurate: true, accuracyRoll: 4,
  });
  expect(mock.documents.get('sessions/s1/wolfAgentDetectorStates/u1')).toEqual({ cycle: 1, revision: 1, testsUsed: 1 });
});

it('returns an exact replay without consuming another die or detector allowance', async () => {
  const first = await runWolfAgentDetectorTest.run(request());
  const replay = await runWolfAgentDetectorTest.run(request());
  expect(replay).toEqual(first);
  expect(random.randomInt).toHaveBeenCalledOnce();
  expect(mock.documents.get('sessions/s1/wolfAgentDetectorStates/u1')).toEqual({ cycle: 1, revision: 1, testsUsed: 1 });
});

it('limits the role to three tests per cycle and rejects client-supplied truth', async () => {
  put('sessions/s1/wolfAgentDetectorStates/u1', { cycle: 1, revision: 3, testsUsed: 3 });
  await expect(runWolfAgentDetectorTest.run(request({ ...payload, expectedRevision: 3, requestId: 'fourth' })))
    .rejects.toMatchObject({ code: 'failed-precondition' });
  await expect(runWolfAgentDetectorTest.run(request({ ...payload, requestId: 'forged', actualWolf: false })))
    .rejects.toMatchObject({ code: 'invalid-argument' });
  expect(random.randomInt).not.toHaveBeenCalled();
});

it('requires a live active Scientist and the Endeavour holder', async () => {
  put('sessions/s1/players/u1', {
    role: 'player', connected: true, displayName: 'Scientist', assignedRoleId: 'shepherd-scientist',
    activeConsoleRoleId: 'shepherd-scientist', replacementRoleId: 'shepherd-scientist',
    replacementStatus: 'active', fleetGroupId: 'fleet-1',
  });
  await expect(runWolfAgentDetectorTest.run(request())).rejects.toMatchObject({ code: 'permission-denied' });
  expect(random.randomInt).not.toHaveBeenCalled();
});
