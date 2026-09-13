import { beforeEach, expect, it, vi } from 'vitest';
import type { CallableRequest } from 'firebase-functions/v2/https';

type Fields = Record<string, unknown>;
const SHIPS = ['dione', 'icebreaker', 'shepherd', 'quellon', 'refinery-124'] as const;

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
  const runTransaction = vi.fn(async (callback: (tx: unknown) => unknown) =>
    callback({ get, set, update: set, delete: (target: { path: string }) => documents.delete(target.path) }));
  return { documents, get, set, db: { doc: ref, runTransaction } };
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

import { recordCivilUnrestResolution, transitionCrisis } from './index';

const baseData = {
  sessionId: 's1', instanceId: 'gm-1', requestId: 'resolution-1', expectedRevision: 3,
  crisisId: 'unrest-1', presidentResponse: 'The facilitator records a measured response on behalf of the President.',
  consequence: 'The teams continue their current duties while the facilitator tracks the grievance.',
  rationale: 'Keep this response private until the later publication decision.',
};
function request(data: Record<string, unknown> = baseData, uid = 'u1') {
  return { data, auth: { uid } } as CallableRequest<Record<string, unknown>>;
}
function put(path: string, fields: Fields): void { mock.documents.set(path, { ...fields }); }
function provision(): void {
  put('sessions/s1', { phase: 'active', currentTurn: 2 });
  put('sessions/s1/players/u1', { uid: 'u1', role: 'gm', connected: true });
  put('sessions/s1/gmInstances/gm-1', { uid: 'u1', connected: true, lastSeenAt: new Date() });
  put('sessions/s1/crisisState/current', {
    type: 'crisis-state', sessionId: 's1', crisisId: 'unrest-1', crisisKind: 'civil-unrest',
    state: 'debated', revision: 3, title: 'Civil Unrest', details: 'Teams have submitted grievances.',
  });
  put('sessions/s1/civilUnrestGrievances/dione', {
    type: 'civil-unrest-grievance', sessionId: 's1', crisisId: 'unrest-1', shipId: 'dione',
    visibility: 'public', text: 'The Dione team requests a review.', revision: 2, crisisRevision: 3,
  });
  put('sessions/s1/civilUnrestGrievances/shepherd', {
    type: 'civil-unrest-grievance', sessionId: 's1', crisisId: 'unrest-1', shipId: 'shepherd',
    visibility: 'private', text: 'A private team grievance.', revision: 1, crisisRevision: 3,
  });
}

beforeEach(() => { mock.documents.clear(); mock.get.mockClear(); mock.set.mockClear(); provision(); });

it('records a private resolution with every current grievance revision and no public/event projection', async () => {
  await expect(recordCivilUnrestResolution.run(request())).resolves.toEqual({
    status: 'committed', sessionId: 's1', crisisId: 'unrest-1', crisisRevision: 3, revision: 1,
    presidentResponse: baseData.presidentResponse, consequence: baseData.consequence, rationale: baseData.rationale,
    grievanceRevisions: [
      { shipId: 'dione', revision: 2 }, { shipId: 'icebreaker', revision: null },
      { shipId: 'shepherd', revision: 1 }, { shipId: 'quellon', revision: null }, { shipId: 'refinery-124', revision: null },
    ], recordedBy: 'facilitator', actorUid: 'u1', instanceId: 'gm-1', label: 'CIVIL UNREST RESOLUTION',
  });
  expect(mock.documents.get('sessions/s1/civilUnrestResolutions/current')).toMatchObject({
    type: 'civil-unrest-resolution', state: 'debated', recordedBy: 'facilitator', revision: 1, actorUid: 'u1',
  });
  expect((mock.documents.get('sessions/s1/civilUnrestResolutions/current')?.grievanceRevisions as unknown[])[0]).toEqual({ shipId: 'dione', revision: 2 });
  expect((mock.documents.get('sessions/s1/civilUnrestResolutions/current')?.grievanceRevisions as unknown[])[1]).toEqual({ shipId: 'icebreaker', revision: null });
  expect(mock.documents.get('sessions/s1/civilUnrestResolutions/history-resolution-1')).toBeDefined();
  expect(mock.documents.get('sessions/s1/civilUnrestResolutions/audit-resolution-1')).toMatchObject({
    action: 'record', requestId: 'resolution-1', recordedBy: 'facilitator',
  });
  expect([...mock.documents.keys()].some((path) => path.includes('/civilUnrestPublic/') || path.includes('/events/'))).toBe(false);
});

it('replays the exact request and binds changed payloads, actors, instances, crisis and malformed grievances', async () => {
  await recordCivilUnrestResolution.run(request());
  mock.set.mockClear();
  await expect(recordCivilUnrestResolution.run(request())).resolves.toMatchObject({ status: 'committed', revision: 1 });
  expect(mock.set).not.toHaveBeenCalled();
  await expect(recordCivilUnrestResolution.run(request({ ...baseData, consequence: 'changed' }))).rejects.toMatchObject({ code: 'failed-precondition' });
  await expect(recordCivilUnrestResolution.run(request({ ...baseData, requestId: 'actor' }, 'u2'))).rejects.toMatchObject({ code: 'permission-denied' });
  await expect(recordCivilUnrestResolution.run(request({ ...baseData, requestId: 'instance', instanceId: 'gm-2' }))).rejects.toMatchObject({ code: 'permission-denied' });
  await expect(recordCivilUnrestResolution.run(request({ ...baseData, requestId: 'stale', expectedRevision: 2 }))).rejects.toMatchObject({ code: 'failed-precondition' });
  put('sessions/s1/civilUnrestGrievances/dione', { type: 'wrong', sessionId: 's1' });
  await expect(recordCivilUnrestResolution.run(request({ ...baseData, requestId: 'malformed' }))).rejects.toMatchObject({ code: 'failed-precondition' });
});

it('fails closed outside the current debated Civil Unrest crisis and does not apply automatic effects', async () => {
  put('sessions/s1/crisisState/current', { type: 'crisis-state', sessionId: 's1', crisisId: 'unrest-1', crisisKind: 'civil-unrest', state: 'resolved', revision: 4 });
  await expect(recordCivilUnrestResolution.run(request({ ...baseData, expectedRevision: 4 }))).rejects.toMatchObject({ code: 'failed-precondition' });
  expect([...mock.documents.keys()].some((path) => path.includes('events/'))).toBe(false);
  expect(SHIPS).toHaveLength(5);
});

it('accepts grievances submitted during delivery after the crisis advances to debate', async () => {
  const lifecycle = {
    ...baseData, title: 'Civil Unrest', details: 'Teams have submitted grievances.', crisisKind: 'civil-unrest',
  };
  put('sessions/s1/crisisState/current', {
    type: 'crisis-state', sessionId: 's1', crisisId: 'unrest-1', crisisKind: 'civil-unrest',
    state: 'draft', revision: 3, title: lifecycle.title, details: lifecycle.details,
  });
  await transitionCrisis.run(request({ ...lifecycle, requestId: 'delivery', expectedRevision: 3, state: 'delivered' }));
  put('sessions/s1/civilUnrestGrievances/dione', {
    type: 'civil-unrest-grievance', sessionId: 's1', crisisId: 'unrest-1', shipId: 'dione',
    visibility: 'public', text: 'The Dione team requests a review.', revision: 3, crisisRevision: 4,
  });
  await transitionCrisis.run(request({ ...lifecycle, requestId: 'debated', expectedRevision: 4, state: 'debated' }));
  await expect(recordCivilUnrestResolution.run(request({
    ...baseData, requestId: 'resolution-after-delivery-grievance', expectedRevision: 5,
  }))).resolves.toMatchObject({
    status: 'committed', crisisRevision: 5,
    grievanceRevisions: expect.arrayContaining([{ shipId: 'dione', revision: 3 }]),
  });
});

it('supersedes a same-crisis resolution after an escalated loop while preserving prior history', async () => {
  put('sessions/s1/civilUnrestResolutions/current', {
    type: 'civil-unrest-resolution', sessionId: 's1', crisisId: 'unrest-1', crisisRevision: 3,
    state: 'debated', revision: 1, presidentResponse: 'Earlier response', consequence: 'Earlier consequence',
    rationale: 'Earlier rationale', recordedBy: 'facilitator', actorUid: 'u1', instanceId: 'gm-1',
    grievanceRevisions: SHIPS.map((shipId) => ({ shipId, revision: null })),
  });
  const lifecycle = {
    ...baseData, title: 'Civil Unrest', details: 'Teams have submitted grievances.', crisisKind: 'civil-unrest',
  };
  await transitionCrisis.run(request({ ...lifecycle, requestId: 'escalated', expectedRevision: 3, state: 'escalated' }));
  await transitionCrisis.run(request({ ...lifecycle, requestId: 'debated-again', expectedRevision: 4, state: 'debated' }));
  await expect(recordCivilUnrestResolution.run(request({
    ...baseData, requestId: 'resolution-after-escalation', expectedRevision: 5,
    presidentResponse: 'Revised response', consequence: 'Revised consequence', rationale: 'Revised rationale',
  }))).resolves.toMatchObject({ status: 'committed', crisisRevision: 5, revision: 2 });
  expect(mock.documents.get('sessions/s1/civilUnrestResolutions/current')).toMatchObject({
    crisisRevision: 5, revision: 2, presidentResponse: 'Revised response',
  });
  expect(mock.documents.get('sessions/s1/civilUnrestResolutions/history-resolution-after-escalation')).toBeDefined();
});
