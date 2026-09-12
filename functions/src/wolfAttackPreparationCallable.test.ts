import { beforeEach, expect, it, vi } from 'vitest';
import type { CallableRequest } from 'firebase-functions/v2/https';

type Fields = Record<string, unknown>;

const mock = vi.hoisted(() => {
  const documents = new Map<string, Fields>();
  const writes = { update: vi.fn(), set: vi.fn() };
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
  const update = vi.fn((target: { path: string }, fields: Fields) => {
    documents.set(target.path, { ...(documents.get(target.path) ?? {}), ...fields });
  });
  const set = vi.fn((target: { path: string }, fields: Fields) => {
    documents.set(target.path, { ...fields });
  });
  const runTransaction = vi.fn(async (callback: (tx: unknown) => unknown) =>
    callback({ get, update, set }));
  return { documents, get, ...writes, update, set, runTransaction, db: { doc: ref, runTransaction } };
});

vi.mock('firebase-admin/app', () => ({ initializeApp: vi.fn() }));
vi.mock('firebase-admin/firestore', () => ({
  getFirestore: () => mock.db,
  FieldValue: { serverTimestamp: () => 'server-time' },
  Timestamp: { now: () => ({ toMillis: () => Date.now() }) },
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

import { stageWolfAttackPreparation } from './index';

const firstTurnCards = [
  ...Array<string>(10).fill('wolf-fighter-wing'),
  ...Array<string>(5).fill('wolf-assault-transport'),
];
const baseData = {
  sessionId: 's1',
  instanceId: 'gm-1',
  requestId: 'wolf-prep-1',
  expectedRevision: 0,
  turn: 1,
  shipIds: firstTurnCards,
  targetMode: 'pre-rolled' as const,
  targetAssignments: [{ cardIndex: 0, targetShipId: 'aegis' }],
  modifiers: ['aegis-command-and-control'] as const,
  notes: 'Keep the first target private until declaration.',
};

function request(data: Record<string, unknown> = baseData, uid = 'u1') {
  return { data, auth: { uid } } as CallableRequest<Record<string, unknown>>;
}

function put(path: string, fields: Fields): void {
  mock.documents.set(path, { ...fields });
}

function session(fields: Fields = {}): void {
  put('sessions/s1', {
    phase: 'active',
    currentTurn: 1,
    activeVesselIds: ['aegis', 'dione', 'icebreaker', 'shepherd', 'quellon', 'refinery-124'],
    ...fields,
  });
}

function gm(uid = 'u1', instanceId = 'gm-1', fields: Fields = {}): void {
  put(`sessions/s1/players/${uid}`, { uid, role: 'gm', connected: true, ...fields });
  put(`sessions/s1/gmInstances/${instanceId}`, { uid, connected: true, lastSeenAt: new Date(), ...fields });
}

beforeEach(() => {
  mock.documents.clear();
  mock.get.mockClear();
  mock.update.mockClear();
  mock.set.mockClear();
  session();
  gm();
});

it('writes a private validated draft and no player event', async () => {
  await expect(stageWolfAttackPreparation.run(request())).resolves.toEqual(expect.objectContaining({
    turn: 1,
    revision: 1,
    shipIds: firstTurnCards,
    targetMode: 'pre-rolled',
    targetAssignments: [{ cardIndex: 0, targetShipId: 'aegis' }],
    modifiers: ['aegis-command-and-control'],
  }));
  expect(mock.documents.get('sessions/s1/wolfAttackPreparation/current')).toMatchObject({
    turn: 1, revision: 1, updatedAt: 'server-time',
  });
  expect(mock.documents.get('sessions/s1/wolfAttackPreparation/current/audit/wolf-prep-1')).toMatchObject({
    type: 'wolf-attack-preparation', turn: 1, revision: 1, actorUid: 'u1',
  });
  expect([...mock.documents.keys()].some((path) => path.includes('/events/'))).toBe(false);
});

it('replays an exact request without rewriting the private projection', async () => {
  await stageWolfAttackPreparation.run(request());
  mock.update.mockClear();
  mock.set.mockClear();
  await expect(stageWolfAttackPreparation.run(request())).resolves.toEqual(expect.objectContaining({ revision: 1 }));
  expect(mock.update).not.toHaveBeenCalled();
  expect(mock.set).not.toHaveBeenCalled();
});

it('rejects stale CAS, inactive targets, and invalid composition', async () => {
  await stageWolfAttackPreparation.run(request());
  await expect(stageWolfAttackPreparation.run(request({ ...baseData, requestId: 'stale', expectedRevision: 0 })))
    .rejects.toMatchObject({ code: 'failed-precondition' });
  await expect(stageWolfAttackPreparation.run(request({
    ...baseData, requestId: 'inactive-target', targetAssignments: [{ cardIndex: 0, targetShipId: 'capybara' }],
  }))).rejects.toMatchObject({ code: 'failed-precondition' });
  await expect(stageWolfAttackPreparation.run(request({
    ...baseData, requestId: 'bad-roster', shipIds: [...firstTurnCards.slice(1), 'wolf-destroyer'],
  }))).rejects.toMatchObject({ code: 'failed-precondition' });
});

it('replaces a prior-turn projection under CAS and replays the Turn 2 request', async () => {
  await stageWolfAttackPreparation.run(request());
  session({ currentTurn: 2 });
  const turnTwoData = {
    ...baseData,
    requestId: 'wolf-prep-turn-2',
    expectedRevision: 1,
    turn: 2,
    shipIds: ['wolf-battlestation', 'wolf-battlestation', 'wolf-cruiser'],
  };

  await expect(stageWolfAttackPreparation.run(request(turnTwoData))).resolves.toEqual(expect.objectContaining({
    turn: 2,
    revision: 2,
    shipIds: turnTwoData.shipIds,
  }));
  expect(mock.documents.get('sessions/s1/wolfAttackPreparation/current')).toMatchObject({ turn: 2, revision: 2 });

  mock.update.mockClear();
  mock.set.mockClear();
  await expect(stageWolfAttackPreparation.run(request(turnTwoData))).resolves.toEqual(expect.objectContaining({
    turn: 2,
    revision: 2,
  }));
  expect(mock.update).not.toHaveBeenCalled();
  expect(mock.set).not.toHaveBeenCalled();
});

it('rejects a future projection and missing or malformed persisted active-vessel tuples', async () => {
  await stageWolfAttackPreparation.run(request());
  session({ currentTurn: 2 });
  await stageWolfAttackPreparation.run(request({
    ...baseData,
    requestId: 'wolf-prep-turn-2',
    expectedRevision: 1,
    turn: 2,
    shipIds: ['wolf-battlestation', 'wolf-battlestation', 'wolf-cruiser'],
  }));
  session({ currentTurn: 1 });
  await expect(stageWolfAttackPreparation.run(request({ ...baseData, requestId: 'future-projection', expectedRevision: 2 })))
    .rejects.toMatchObject({ code: 'failed-precondition' });

  mock.documents.delete('sessions/s1/wolfAttackPreparation/current');
  session({ currentTurn: 1, activeVesselIds: undefined });
  await expect(stageWolfAttackPreparation.run(request({ ...baseData, requestId: 'missing-tuple' })))
    .rejects.toMatchObject({ code: 'failed-precondition' });
  session({ activeVesselIds: ['aegis', 'aegis'] });
  await expect(stageWolfAttackPreparation.run(request({ ...baseData, requestId: 'duplicate-tuple' })))
    .rejects.toMatchObject({ code: 'failed-precondition' });
  session({ activeVesselIds: ['aegis', 'not-a-vessel'] });
  await expect(stageWolfAttackPreparation.run(request({ ...baseData, requestId: 'malformed-tuple' })))
    .rejects.toMatchObject({ code: 'failed-precondition' });
});

it('requires an active GM, active phase, and current turn', async () => {
  put('sessions/s1/players/u1', { uid: 'u1', role: 'player', connected: true });
  await expect(stageWolfAttackPreparation.run(request())).rejects.toMatchObject({ code: 'permission-denied' });
  gm();
  session({ phase: 'lobby' });
  await expect(stageWolfAttackPreparation.run(request({ ...baseData, requestId: 'lobby' })))
    .rejects.toMatchObject({ code: 'failed-precondition' });
  session({ phase: 'active', currentTurn: 2 });
  await expect(stageWolfAttackPreparation.run(request({ ...baseData, requestId: 'stale-turn' })))
    .rejects.toMatchObject({ code: 'failed-precondition' });
});
