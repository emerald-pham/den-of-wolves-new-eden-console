import { beforeEach, expect, it, vi } from 'vitest';
import type { CallableRequest } from 'firebase-functions/v2/https';

type Fields = Record<string, unknown>;
const mock = vi.hoisted(() => {
  const documents = new Map<string, Fields>();
  const snapshot = (path: string) => {
    const fields = documents.get(path);
    return { exists: fields !== undefined, id: path.split('/').at(-1) ?? '', ref: { path },
      get: (field: string) => fields?.[field], data: () => fields };
  };
  const ref = (path: string) => ({ path, id: path.split('/').at(-1) ?? '' });
  const get = vi.fn(async (target: { path: string }) => snapshot(target.path));
  const set = vi.fn((target: { path: string }, fields: Fields) => documents.set(target.path, { ...fields }));
  const update = vi.fn((target: { path: string }, fields: Fields) => documents.set(target.path, {
    ...(documents.get(target.path) ?? {}), ...fields,
  }));
  const runTransaction = vi.fn(async (callback: (tx: unknown) => unknown) => callback({ get, set, update }));
  return { documents, get, set, update, runTransaction, db: { doc: ref, runTransaction } };
});

vi.mock('firebase-admin/app', () => ({ initializeApp: vi.fn() }));
vi.mock('firebase-admin/firestore', () => ({
  getFirestore: () => mock.db,
  FieldValue: { serverTimestamp: () => 'server-time' },
  Timestamp: { now: () => ({ toMillis: () => Date.now() }) },
}));
vi.mock('firebase-functions/v2', () => ({ setGlobalOptions: vi.fn() }));
vi.mock('firebase-functions/v2/https', () => ({
  HttpsError: class HttpsError extends Error { constructor(readonly code: string, message: string) { super(message); } },
  onCall: (handler: (request: unknown) => unknown) => ({ run: handler }),
}));
vi.mock('firebase-functions/v2/scheduler', () => ({
  onSchedule: (_schedule: string, handler: (event: unknown) => unknown) => ({ run: handler }),
}));

import { resolveArrestCaseDisposition } from './index';

const baseData = {
  sessionId: 's1', instanceId: 'gm-1', requestId: 'disposition-1',
  expectedCycle: 4, expectedRevision: 1, expectedSetupRevision: 2,
  targetUid: 'u2', disposition: 'executed',
};
function request(data: Record<string, unknown> = baseData, uid = 'u1') {
  return { data, auth: { uid } } as CallableRequest<Record<string, unknown>>;
}
function put(path: string, fields: Fields): void { mock.documents.set(path, { ...fields }); }
function provision(currentTurn = 4): void {
  const teamPhaseEndsAt = '2099-09-23T12:00:00.000Z';
  put('sessions/s1', { phase: 'active', currentTurn, setupRevision: 2, turnPhase: {
    turn: currentTurn, teamPhaseEndsAt, openAirspaceEndsAt: '2099-09-23T12:15:00.000Z',
    airspace: { state: 'restricted', tickerActive: true, pressAccess: false },
  } });
  put('sessions/s1/players/u1', { uid: 'u1', role: 'gm', connected: true });
  put('sessions/s1/players/u2', { uid: 'u2', role: 'player', connected: true, assignedRoleId: 'admiral' });
  put('sessions/s1/gmInstances/gm-1', { uid: 'u1', connected: true, lastSeenAt: new Date() });
  put('sessions/s1/arrestCases/u2', { type: 'arrest-case', sessionId: 's1', targetUid: 'u2',
    status: 'pending-resolution', outcome: 'arrested', turn: 3, deadlineCycle: 4,
    revision: 1, requiredPlayers: 5, presentPlayers: 5 });
}

beforeEach(() => {
  mock.documents.clear(); mock.get.mockClear(); mock.set.mockClear(); mock.update.mockClear();
  mock.runTransaction.mockReset();
  mock.runTransaction.mockImplementation(async (callback: (tx: unknown) => unknown) =>
    callback({ get: mock.get, set: mock.set, update: mock.update }));
  provision();
});

it('records a facilitator execution during the next Team Phase and opens arrested replacement eligibility', async () => {
  const result = await resolveArrestCaseDisposition.run(request());
  expect(result).toMatchObject({ status: 'committed', type: 'arrest-case-disposition',
    targetUid: 'u2', disposition: 'executed', deadlineCycle: 4, deadlineMet: true, revision: 2,
    setupRevision: 3 });
  expect(mock.documents.get('sessions/s1/arrestCases/u2')).toMatchObject({
    status: 'executed', outcome: 'arrested', revision: 2, deadlineCycle: 4,
  });
  expect(mock.documents.get('sessions/s1/replacementEligibility/u2')).toMatchObject({
    eligible: true, reason: 'arrested', revision: 1, requestId: 'disposition-1',
  });
  expect(mock.documents.get('sessions/s1/commandReceipts/disposition-1')?.result).toEqual(result);
});

it('allows release during the deadline Team Phase without creating replacement eligibility', async () => {
  const result = await resolveArrestCaseDisposition.run(request({ ...baseData, requestId: 'release-1', disposition: 'released' }));
  expect(result).toMatchObject({ disposition: 'released', deadlineMet: true });
  expect(mock.documents.get('sessions/s1/arrestCases/u2')).toMatchObject({ status: 'released' });
  expect(mock.documents.has('sessions/s1/replacementEligibility/u2')).toBe(false);
});

it('rejects early resolution and permits only a reasoned facilitator resolution after the deadline', async () => {
  await expect(resolveArrestCaseDisposition.run(request({ ...baseData, expectedCycle: 3 })))
    .rejects.toMatchObject({ code: 'failed-precondition' });
  expect(mock.documents.get('sessions/s1/arrestCases/u2')?.status).toBe('pending-resolution');

  mock.documents.clear();
  provision(5);
  await expect(resolveArrestCaseDisposition.run(request({ ...baseData, requestId: 'late-release',
    expectedCycle: 5, disposition: 'released' }))).rejects.toMatchObject({ code: 'failed-precondition' });
  const late = await resolveArrestCaseDisposition.run(request({ ...baseData, requestId: 'late-ruling',
    expectedCycle: 5, disposition: 'facilitator-resolution', ruling: 'The table agrees on a final ruling.' }));
  expect(late).toMatchObject({ disposition: 'facilitator-resolution', deadlineMet: false, turn: 5 });
  expect(mock.documents.get('sessions/s1/arrestCases/u2')).toMatchObject({ status: 'facilitator-resolution' });
});

it('replays exactly and rejects wrong facilitator or stale case revision', async () => {
  const first = await resolveArrestCaseDisposition.run(request({ ...baseData, disposition: 'released' }));
  mock.set.mockClear(); mock.update.mockClear();
  await expect(resolveArrestCaseDisposition.run(request({ ...baseData, disposition: 'released' }))).resolves.toEqual(first);
  expect(mock.set).not.toHaveBeenCalled();
  expect(mock.update).not.toHaveBeenCalled();
  await expect(resolveArrestCaseDisposition.run(request({ ...baseData, requestId: 'other', expectedRevision: 9 }, 'u8')))
    .rejects.toMatchObject({ code: 'permission-denied' });
});
