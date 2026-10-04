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
  const set = vi.fn((target: { path: string }, fields: Fields) => { documents.set(target.path, { ...fields }); });
  const update = vi.fn((target: { path: string }, fields: Fields) => {
    documents.set(target.path, { ...(documents.get(target.path) ?? {}), ...fields });
  });
  const runTransaction = vi.fn(async (callback: (tx: unknown) => unknown) =>
    callback({ get, set, update, delete: (target: { path: string }) => documents.delete(target.path) }));
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
vi.mock('firebase-functions/v2/scheduler', () => ({ onSchedule: (_schedule: string, handler: (event: unknown) => unknown) => ({ run: handler }) }));

import { recordApproachingVesselResponse } from './index';

const baseData = {
  sessionId: 's1', instanceId: 'gm-1', requestId: 'response-1', expectedCrisisRevision: 3,
  expectedResponseRevision: 0, crisisId: 'vessel-1',
  vesselReality: 'real', responseChoices: ['prepare-medical-and-wait'],
  coordinationActions: ['medical'], responseInstructions: 'Medical team prepares to receive the ship.',
  rationale: 'The distress report is credible.',
};
function request(data: Record<string, unknown> = baseData, uid = 'u1') {
  return { data, auth: { uid } } as CallableRequest<Record<string, unknown>>;
}
function put(path: string, fields: Fields): void { mock.documents.set(path, { ...fields }); }
function provision(state: string = 'debated'): void {
  put('sessions/s1', { phase: 'active', currentTurn: 2 });
  put('sessions/s1/players/u1', { uid: 'u1', role: 'gm', connected: true });
  put('sessions/s1/gmInstances/gm-1', { uid: 'u1', connected: true, lastSeenAt: new Date() });
  put('sessions/s1/crisisState/current', { type: 'crisis-state', sessionId: 's1', crisisId: 'vessel-1',
    crisisKind: 'approaching-vessel', state, revision: 3, title: 'Approaching Vessel', details: 'GM-only notes.' });
  put('sessions/s1/crisisReports/current', { sessionId: 's1', crisisId: 'vessel-1', state: 'debated', revision: 3,
    crisisKind: 'approaching-vessel', title: 'Approaching Vessel', body: 'Public report.' });
}
beforeEach(() => {
  mock.documents.clear(); mock.get.mockClear(); mock.set.mockClear(); mock.update.mockClear(); provision();
});

it('commits a real adjudication and bounded response while publishing instructions without hidden truth or rationale', async () => {
  await expect(recordApproachingVesselResponse.run(request())).resolves.toMatchObject({
    status: 'committed', sessionId: 's1', crisisId: 'vessel-1', crisisRevision: 3, revision: 1,
    vesselReality: 'real', responseChoices: ['prepare-medical-and-wait'],
  });
  expect(mock.documents.get('sessions/s1/approachingVesselResponses/current')).toMatchObject({
    type: 'approaching-vessel-response', vesselReality: 'real', rationale: baseData.rationale,
    crisisRevision: 3, responseChoices: baseData.responseChoices,
  });
  expect(mock.documents.get('sessions/s1/crisisReports/current')).toMatchObject({
    approachingVesselResponse: { responseChoices: baseData.responseChoices,
      responseInstructions: baseData.responseInstructions },
  });
  const publicDoc = mock.documents.get('sessions/s1/crisisReports/current')!;
  expect(JSON.stringify(publicDoc)).not.toContain('vesselReality');
  expect(JSON.stringify(publicDoc)).not.toContain('rationale');
  expect(mock.documents.get('sessions/s1/approachingVesselResponses/audit-response-1')).toMatchObject({
    action: 'record', requestId: 'response-1', vesselReality: 'real',
  });
});

it('replays exactly once and rejects a changed or unauthorized response', async () => {
  await recordApproachingVesselResponse.run(request());
  mock.set.mockClear(); mock.update.mockClear();
  await expect(recordApproachingVesselResponse.run(request())).resolves.toMatchObject({ status: 'replayed', revision: 1 });
  expect(mock.set).not.toHaveBeenCalled(); expect(mock.update).not.toHaveBeenCalled();
  await expect(recordApproachingVesselResponse.run(request({ ...baseData, requestId: 'other', vesselReality: 'maybe' })))
    .rejects.toMatchObject({ code: 'invalid-argument' });
  await expect(recordApproachingVesselResponse.run(request({ ...baseData, requestId: 'wrong-actor' }, 'u2')))
    .rejects.toMatchObject({ code: 'permission-denied' });
  await expect(recordApproachingVesselResponse.run(request({ ...baseData, requestId: 'stale', expectedRevision: 2 })))
    .rejects.toMatchObject({ code: 'failed-precondition' });
  provision('resolved');
  await expect(recordApproachingVesselResponse.run(request({ ...baseData, requestId: 'resolved', expectedRevision: 3 })))
    .rejects.toMatchObject({ code: 'failed-precondition' });
});

it('records a trap as a private facilitator adjudication without admitting Voyage 33-0', async () => {
  await expect(recordApproachingVesselResponse.run(request({ ...baseData, vesselReality: 'trap', requestId: 'trap' })))
    .resolves.toMatchObject({ status: 'committed', vesselReality: 'trap' });
  expect(mock.documents.get('sessions/s1/approachingVesselResponses/current')).toMatchObject({ vesselReality: 'trap' });
  expect(mock.documents.get('sessions/s1')).not.toHaveProperty('voyage33Admission');
});
