import { beforeEach, expect, it, vi } from 'vitest';
import type { CallableRequest } from 'firebase-functions/v2/https';

type Fields = Record<string, unknown>;

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
  const get = vi.fn(async (target: { path: string }) => {
    if (target.path.endsWith('/players') || target.path.endsWith('/gmInstances')) {
      const prefix = `${target.path}/`;
      return {
        docs: [...documents.entries()]
          .filter(([path]) => path.startsWith(prefix) && !path.slice(prefix.length).includes('/'))
          .map(([path]) => snapshot(path)),
      };
    }
    return snapshot(target.path);
  });
  const set = vi.fn((target: { path: string }, fields: Fields) => {
    documents.set(target.path, { ...fields });
  });
  const update = vi.fn((target: { path: string }, fields: Fields) => {
    const current = { ...(documents.get(target.path) ?? {}) };
    for (const [key, value] of Object.entries(fields)) {
      const segments = key.split('.');
      if (segments.length === 1) {
        current[key] = value;
        continue;
      }
      let cursor = current;
      for (const segment of segments.slice(0, -1)) {
        cursor[segment] = typeof cursor[segment] === 'object' && cursor[segment] !== null
          ? { ...(cursor[segment] as Fields) } : {};
        cursor = cursor[segment] as Fields;
      }
      cursor[segments.at(-1)!] = value;
    }
    documents.set(target.path, current);
  });
  const runTransaction = vi.fn(async (callback: (tx: unknown) => unknown) =>
    callback({ get, update, set }));
  return { documents, get, set, update, runTransaction, db: { doc: ref, collection: ref, runTransaction } };
});

vi.mock('firebase-admin/app', () => ({ initializeApp: vi.fn() }));
vi.mock('firebase-admin/firestore', () => ({
  getFirestore: () => mock.db,
  FieldValue: { serverTimestamp: () => 'server-time' },
  Timestamp: { now: () => ({ toDate: () => new Date() }) },
}));
vi.mock('firebase-functions/v2', () => ({ setGlobalOptions: vi.fn() }));
vi.mock('firebase-functions/v2/https', () => ({
  HttpsError: class HttpsError extends Error {
    constructor(readonly code: string, message: string) { super(message); }
  },
  onCall: (handler: (request: unknown) => unknown) => ({ run: handler }),
}));
vi.mock('firebase-functions/v2/scheduler', () => ({
  onSchedule: (_schedule: string, handler: (event: unknown) => unknown) => ({ run: handler }),
}));

import { applyCommissarPurge, consentCommissarPurge, getCommissarPurgeAuthority } from './index';

const sessionId = 's1';
const captainUid = 'captain';
const commissarUid = 'commissar';

function request(data: Record<string, unknown>, uid = commissarUid) {
  return { data, auth: { uid } } as CallableRequest<Record<string, unknown>>;
}

function put(path: string, fields: Fields): void {
  mock.documents.set(path, { ...fields });
}

function resetFixture(): void {
  mock.documents.clear();
  mock.get.mockClear();
  mock.set.mockClear();
  mock.update.mockClear();
  mock.runTransaction.mockClear();
  put(`sessions/${sessionId}`, {
    phase: 'active', currentTurn: 1,
    activeRoleIds: ['icebreaker-captain'], activeVesselIds: ['icebreaker'],
    turnPhase: { airspace: { state: 'restricted' } },
    shipSurvivors: { icebreaker: 40000 }, shipUnrest: { icebreaker: 2 },
    vesselActionRevisions: { icebreaker: 0 },
    populationAlerts: {}, unrestAlerts: {},
  });
  put(`sessions/${sessionId}/commissarPurgeState/current`, {
    type: 'commissar-purge-state', consents: {}, ledger: {},
  });
  put(`sessions/${sessionId}/players/${captainUid}`, {
    uid: captainUid, role: 'player', connected: true,
    assignedRoleId: 'icebreaker-captain', activeConsoleRoleId: 'icebreaker-captain',
    replacementRoleId: null,
  });
  put(`sessions/${sessionId}/players/${commissarUid}`, {
    uid: commissarUid, role: 'player', connected: true,
    assignedRoleId: 'icebreaker-captain', activeConsoleRoleId: null,
    replacementRoleId: 'commissar',
  });
}

const consentRequest = {
  sessionId, shipId: 'icebreaker', requestId: 'consent-1', expectedRevision: 0,
};
const purgeRequest = {
  sessionId, shipId: 'icebreaker', requestId: 'purge-1', expectedRevision: 0,
};

beforeEach(resetFixture);

it('refreshes only the caller private view for the current captain or Commissar', async () => {
  await expect(getCommissarPurgeAuthority.run(request({ sessionId }, captainUid)))
    .resolves.toMatchObject({ role: 'captain', captainRoleId: 'icebreaker-captain', consented: false });
  await expect(getCommissarPurgeAuthority.run(request({ sessionId }, commissarUid)))
    .resolves.toMatchObject({ role: 'commissar', consents: {}, ledger: {} });
  put(`sessions/${sessionId}/players/observer`, {
    uid: 'observer', role: 'player', connected: true,
    assignedRoleId: 'icebreaker-miner', activeConsoleRoleId: 'icebreaker-miner', replacementRoleId: null,
  });
  await expect(getCommissarPurgeAuthority.run(request({ sessionId }, 'observer')))
    .rejects.toMatchObject({ code: 'permission-denied' });
});

it('requires current captain consent, applies one printed population step and one unrest point atomically', async () => {
  await expect(consentCommissarPurge.run(request(consentRequest, captainUid))).resolves.toMatchObject({
    status: 'committed', consented: true, shipId: 'icebreaker', captainRoleId: 'icebreaker-captain',
  });
  expect(mock.documents.get(`sessions/${sessionId}`)?.commissarPurgeConsents).toBeUndefined();
  expect(mock.documents.get(`sessions/${sessionId}/commissarPurgeState/current`)).toMatchObject({
    consents: {
      icebreaker: { turn: 1, captainUid, captainRoleId: 'icebreaker-captain', vesselRevision: 0 },
    },
  });
  expect(mock.documents.get(`sessions/${sessionId}/commissarPurgeAuthority/${captainUid}`)).toMatchObject({
    role: 'captain', captainRoleId: 'icebreaker-captain', shipId: 'icebreaker', consented: true,
  });
  expect(mock.documents.get(`sessions/${sessionId}/commissarPurgeAuthority/${commissarUid}`)).toMatchObject({
    role: 'commissar', consents: {
      icebreaker: { turn: 1, captainRoleId: 'icebreaker-captain', vesselRevision: 0 },
    },
  });
  expect(mock.documents.get(`sessions/${sessionId}/commissarPurgeAuthority/${commissarUid}`))
    .not.toHaveProperty('captainUid');

  await expect(applyCommissarPurge.run(request(purgeRequest))).resolves.toMatchObject({
    status: 'committed', shipId: 'icebreaker', survivorsRemoved: 3000,
    population: 37000, unrest: 1, unrestReduced: 1, revision: 1,
  });
  expect(mock.documents.get(`sessions/${sessionId}`)).toMatchObject({
    shipSurvivors: { icebreaker: 37000 }, shipUnrest: { icebreaker: 1 },
    vesselActionRevisions: { icebreaker: 1 },
  });
  expect(mock.documents.get(`sessions/${sessionId}/commissarPurgeState/current`)).toMatchObject({
    ledger: { icebreaker: { turn: 1, revision: 1 } }, consents: {},
  });
  expect([...mock.documents.keys()].some((path) => path.includes('/damageDraws/'))).toBe(false);
});

it('replays an exact purge request without another mutation and rejects a second same-turn purge', async () => {
  await consentCommissarPurge.run(request(consentRequest, captainUid));
  await applyCommissarPurge.run(request(purgeRequest));
  const writes = mock.set.mock.calls.length + mock.update.mock.calls.length;
  await expect(applyCommissarPurge.run(request(purgeRequest))).resolves.toMatchObject({
    status: 'committed', revision: 1,
  });
  expect(mock.set.mock.calls.length + mock.update.mock.calls.length).toBe(writes);
  await expect(applyCommissarPurge.run(request({
    ...purgeRequest, requestId: 'purge-2', expectedRevision: 1,
  }))).rejects.toMatchObject({ code: 'already-exists' });
  await expect(consentCommissarPurge.run(request({
    ...consentRequest, requestId: 'consent-after', expectedRevision: 1,
  }, captainUid))).rejects.toMatchObject({ code: 'already-exists' });
});

it('denies wrong actors, stale consent, missing consent, and wrong phase without counter writes', async () => {
  await expect(consentCommissarPurge.run(request(consentRequest))).rejects.toMatchObject({ code: 'permission-denied' });
  put(`sessions/${sessionId}/players/old-role`, {
    uid: 'old-role', role: 'player', connected: true,
    assignedRoleId: 'icebreaker-captain', activeConsoleRoleId: 'icebreaker-captain',
    replacementRoleId: 'commissar',
  });
  await expect(consentCommissarPurge.run(request(consentRequest, 'old-role')))
    .rejects.toMatchObject({ code: 'permission-denied' });
  await expect(consentCommissarPurge.run(request({ ...consentRequest, requestId: 'stale', expectedRevision: 4 }, captainUid)))
    .resolves.toMatchObject({ status: 'stale', currentRevision: 0 });
  await expect(applyCommissarPurge.run(request({ ...purgeRequest, requestId: 'missing-consent' })))
    .rejects.toMatchObject({ code: 'failed-precondition' });
  mock.documents.get(`sessions/${sessionId}`)!.phase = 'closed';
  await expect(consentCommissarPurge.run(request({ ...consentRequest, requestId: 'closed-session' }, captainUid)))
    .rejects.toMatchObject({ code: 'failed-precondition' });
  expect(mock.documents.get(`sessions/${sessionId}`)?.shipSurvivors).toEqual({ icebreaker: 40000 });
  expect(mock.documents.get(`sessions/${sessionId}`)?.shipUnrest).toEqual({ icebreaker: 2 });
  expect(mock.update).not.toHaveBeenCalled();
});

it('does not let a replacement captain inherit a prior captain UID consent', async () => {
  await consentCommissarPurge.run(request(consentRequest, captainUid));
  mock.documents.delete(`sessions/${sessionId}/players/${captainUid}`);
  put(`sessions/${sessionId}/players/new-captain`, {
    uid: 'new-captain', role: 'player', connected: true,
    assignedRoleId: 'icebreaker-captain', activeConsoleRoleId: 'icebreaker-captain',
    replacementRoleId: null,
  });
  await expect(applyCommissarPurge.run(request({ ...purgeRequest, requestId: 'handover' })))
    .rejects.toMatchObject({ code: 'failed-precondition' });
  expect(mock.documents.get(`sessions/${sessionId}`)?.shipSurvivors).toEqual({ icebreaker: 40000 });
  expect(mock.documents.get(`sessions/${sessionId}`)?.shipUnrest).toEqual({ icebreaker: 2 });
});

it('fails closed when either printed counter cannot accept the purge', async () => {
  await consentCommissarPurge.run(request(consentRequest, captainUid));
  mock.documents.get(`sessions/${sessionId}`)!.shipSurvivors = { icebreaker: 0 };
  const before = { ...mock.documents.get(`sessions/${sessionId}`) };
  await expect(applyCommissarPurge.run(request({ ...purgeRequest, requestId: 'endpoint' })))
    .rejects.toMatchObject({ code: 'failed-precondition' });
  expect(mock.documents.get(`sessions/${sessionId}`)).toEqual(before);
  mock.documents.get(`sessions/${sessionId}`)!.shipSurvivors = { icebreaker: 40000 };
  mock.documents.get(`sessions/${sessionId}`)!.shipUnrest = { icebreaker: 0 };
  await expect(applyCommissarPurge.run(request({ ...purgeRequest, requestId: 'zero-unrest' })))
    .rejects.toMatchObject({ code: 'failed-precondition' });
  expect(mock.documents.get(`sessions/${sessionId}`)?.shipSurvivors).toEqual({ icebreaker: 40000 });
});
