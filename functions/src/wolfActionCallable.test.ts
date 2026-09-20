import { beforeEach, expect, it, vi } from 'vitest';
import type { CallableRequest } from 'firebase-functions/v2/https';
import { recommendedRoleIds } from './roleConfiguration';

type Fields = Record<string, unknown>;

const cryptoMock = vi.hoisted(() => ({
  randomInt: vi.fn(() => 1),
  randomUUID: vi.fn(() => 'uuid'),
}));

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
  const set = vi.fn((target: { path: string }, fields: Fields) => documents.set(target.path, { ...fields }));
  const update = vi.fn((target: { path: string }, fields: Fields) =>
    documents.set(target.path, { ...(documents.get(target.path) ?? {}), ...fields }));
  const del = vi.fn((target: { path: string }) => documents.delete(target.path));
  const runTransaction = vi.fn(async (callback: (tx: unknown) => unknown) =>
    callback({ get, set, update, delete: del }));
  return { documents, get, set, update, delete: del, runTransaction,
    db: { doc: ref, collection: ref, runTransaction } };
});

vi.mock('firebase-admin/app', () => ({ initializeApp: vi.fn() }));
vi.mock('node:crypto', () => cryptoMock);
vi.mock('firebase-admin/firestore', () => ({
  getFirestore: () => mock.db,
  FieldValue: { serverTimestamp: () => 'server-time', delete: () => 'deleted' },
  Timestamp: class MockTimestamp {
    private readonly value: Date;
    constructor(value: Date) { this.value = value; }
    toDate() { return this.value; }
    toMillis() { return this.value.getTime(); }
    static now() { return new MockTimestamp(new Date('2026-09-20T19:00:00.000Z')); }
    static fromDate(value: Date) { return new MockTimestamp(value); }
  },
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

import { submitWolfSupplySabotage } from './index';

const baseData = {
  sessionId: 's1', requestId: 'wolf-supply-1', expectedCycle: 2,
  shuttleId: 'philia', resourceId: 'food',
};

function request(data: Record<string, unknown> = baseData, uid = 'u2') {
  return { data, auth: { uid } } as CallableRequest<Record<string, unknown>>;
}
function put(path: string, fields: Fields): void { mock.documents.set(path, { ...fields }); }
function provision(): void {
  put('sessions/s1', {
    phase: 'active', currentTurn: 2, activeRoleIds: [...recommendedRoleIds(18)],
    shuttleCargo: { philia: { food: 5 }, maliades: { water: 4 } },
  });
  put('sessions/s1/players/u2', {
    uid: 'u2', role: 'player', connected: true, assignedRoleId: 'dione-engineer',
    replacementRoleId: null, escapeState: null,
  });
  put('sessions/s1/secrets/loyalty-u2', {
    visibleToUids: ['u2'], payload: { type: 'loyalty', kind: 'wolf-agent', suspicion: 0 },
  });
  put('sessions/s1/secrets/wolf-assignment', {
    visibleToUids: ['gm-1'], payload: { type: 'wolf-assignment', roleIds: ['dione-engineer'] },
  });
  put('sessions/s1/loyaltyCensus/current', {
    type: 'loyalty-census', revision: 4,
    entries: [{ uid: 'u2', kind: 'wolf-agent', suspicion: 0, note: 'Watch closely' }],
  });
}

beforeEach(() => {
  mock.documents.clear(); mock.get.mockClear(); mock.set.mockClear();
  mock.update.mockClear(); mock.delete.mockClear();
  cryptoMock.randomInt.mockReset(); cryptoMock.randomInt.mockReturnValue(1);
  provision();
});

it('atomically resolves supply sabotage, suspicion, and the private cycle commitment', async () => {
  await expect(submitWolfSupplySabotage.run(request())).resolves.toEqual({
    status: 'committed', type: 'wolf-supply-sabotage', sessionId: 's1',
    requestId: 'wolf-supply-1', cycle: 2, revision: 1,
    coverRoleId: 'dione-engineer', shuttleId: 'philia', resourceId: 'food',
    destroyedAmount: 2, remainingAmount: 3, suspicion: 2,
  });
  expect(mock.documents.get('sessions/s1')).toMatchObject({
    shuttleCargo: { philia: { food: 3 }, maliades: { water: 4 } },
  });
  expect(mock.documents.get('sessions/s1/secrets/loyalty-u2')).toMatchObject({
    payload: { type: 'loyalty', kind: 'wolf-agent', suspicion: 2 },
  });
  expect(mock.documents.get('sessions/s1/loyaltyCensus/current')).toEqual({
    type: 'loyalty-census', revision: 5,
    entries: [{ uid: 'u2', kind: 'wolf-agent', suspicion: 2, note: 'Watch closely' }],
  });
  expect(mock.documents.get('sessions/s1/wolfClueDisclosure/current')).toMatchObject({
    type: 'wolf-clue-disclosure', revision: 5, actorUid: 'u2',
    action: 'sabotage-supplies', cycle: 2, requestId: 'wolf-supply-1',
    oldSuspicion: 0, increment: 2, newSuspicion: 2,
    roll: 1, total: 3, clueTier: 'none', facilitatorInstruction: 'Nothing.',
  });
  expect(cryptoMock.randomInt).toHaveBeenCalledOnce();
  expect(cryptoMock.randomInt).toHaveBeenCalledWith(1, 7);
  expect(mock.documents.get('sessions/s1/wolfActionState/u2')).toMatchObject({
    type: 'wolf-action-commitment', actorUid: 'u2', state: 'committed',
    cycle: 2, revision: 1, action: 'sabotage-supplies', coverRoleId: 'dione-engineer',
  });
  expect(mock.documents.get('sessions/s1/wolfActionState/u2/audit/wolf-supply-1'))
    .toMatchObject({ actorUid: 'u2', cycle: 2, action: 'sabotage-supplies' });
  expect([...mock.documents.keys()].some((path) => path.includes('/events/'))).toBe(false);
});

it('reuses one clue roll across Firestore transaction retries', async () => {
  const attemptedClues: Fields[] = [];
  mock.runTransaction.mockImplementationOnce(async (callback) => {
    let result: unknown;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const set = vi.fn((target: { path: string }, fields: Fields) => {
        if (target.path === 'sessions/s1/wolfClueDisclosure/current') attemptedClues.push(fields);
      });
      result = await callback({ get: mock.get, set, update: vi.fn(), delete: vi.fn() });
    }
    return result;
  });
  cryptoMock.randomInt.mockReset();
  cryptoMock.randomInt.mockReturnValueOnce(1).mockReturnValueOnce(6);

  await expect(submitWolfSupplySabotage.run(request())).resolves.toMatchObject({
    status: 'committed', suspicion: 2,
  });

  expect(cryptoMock.randomInt).toHaveBeenCalledOnce();
  expect(attemptedClues).toHaveLength(2);
  expect(attemptedClues.map((clue) => ({ roll: clue.roll, total: clue.total }))).toEqual([
    { roll: 1, total: 3 },
    { roll: 1, total: 3 },
  ]);
});

it('permits a claimed Press Wolf to sabotage the Press shuttle when Press is enabled', async () => {
  put('sessions/s1', {
    ...mock.documents.get('sessions/s1'), pressEnabled: true, pressHolderUid: 'u2',
    shuttleCargo: { 'snn-press-shuttle': { food: 6 } },
  });
  put('sessions/s1/players/u2', {
    uid: 'u2', role: 'player', connected: true, assignedRoleId: null,
    activeConsoleRoleId: 'press-officer', replacementRoleId: null, escapeState: null,
  });
  put('sessions/s1/secrets/wolf-assignment', {
    visibleToUids: ['gm-1'], payload: { type: 'wolf-assignment', roleIds: ['press-officer'] },
  });
  await expect(submitWolfSupplySabotage.run(request({
    ...baseData, shuttleId: 'snn-press-shuttle', resourceId: 'food',
  }))).resolves.toMatchObject({
    coverRoleId: 'press-officer', destroyedAmount: 3, remainingAmount: 3,
  });
});

it('rejects a stale Press claimant when the authoritative holder pointer names another player', async () => {
  put('sessions/s1', {
    ...mock.documents.get('sessions/s1'), pressEnabled: true, pressHolderUid: 'u3',
    shuttleCargo: { 'snn-press-shuttle': { food: 6 } },
  });
  put('sessions/s1/players/u2', {
    uid: 'u2', role: 'player', connected: true, assignedRoleId: null,
    activeConsoleRoleId: 'press-officer', replacementRoleId: null, escapeState: null,
  });
  put('sessions/s1/secrets/wolf-assignment', {
    visibleToUids: ['gm-1'], payload: { type: 'wolf-assignment', roleIds: ['press-officer'] },
  });
  await expect(submitWolfSupplySabotage.run(request({
    ...baseData, shuttleId: 'snn-press-shuttle', resourceId: 'food',
  }))).rejects.toMatchObject({ code: 'permission-denied' });
  expect(mock.documents.has('sessions/s1/wolfActionState/u2')).toBe(false);
  expect(mock.documents.get('sessions/s1')).toMatchObject({
    shuttleCargo: { 'snn-press-shuttle': { food: 6 } },
  });
});

it('replays the exact request without applying cargo or suspicion twice', async () => {
  await submitWolfSupplySabotage.run(request());
  expect(cryptoMock.randomInt).toHaveBeenCalledOnce();
  mock.set.mockClear(); mock.update.mockClear();
  cryptoMock.randomInt.mockClear();
  await expect(submitWolfSupplySabotage.run(request())).resolves.toMatchObject({
    requestId: 'wolf-supply-1', cycle: 2, revision: 1,
  });
  expect(mock.set).not.toHaveBeenCalled();
  expect(mock.update).not.toHaveBeenCalled();
  expect(cryptoMock.randomInt).not.toHaveBeenCalled();
});

it('rejects an ineligible target without consuming the slot, then permits a valid same-cycle action', async () => {
  await expect(submitWolfSupplySabotage.run(request({
    ...baseData, requestId: 'bad-target', shuttleId: 'starlight',
  }))).rejects.toMatchObject({ code: 'failed-precondition' });
  expect(cryptoMock.randomInt).not.toHaveBeenCalled();
  expect(mock.documents.has('sessions/s1/wolfActionState/u2')).toBe(false);
  expect(mock.documents.get('sessions/s1')).toMatchObject({
    shuttleCargo: { philia: { food: 5 }, maliades: { water: 4 } },
  });
  await expect(submitWolfSupplySabotage.run(request())).resolves.toMatchObject({
    cycle: 2, shuttleId: 'philia', resourceId: 'food',
  });
  expect(cryptoMock.randomInt).toHaveBeenCalledOnce();
});

it('rejects a second action in the same cycle and permits one in the next cycle', async () => {
  await submitWolfSupplySabotage.run(request());
  await expect(submitWolfSupplySabotage.run(request({
    ...baseData, requestId: 'wolf-supply-2', shuttleId: 'maliades', resourceId: 'water',
  }))).rejects.toMatchObject({ code: 'failed-precondition' });
  put('sessions/s1', { ...mock.documents.get('sessions/s1'), currentTurn: 3 });
  await expect(submitWolfSupplySabotage.run(request({
    ...baseData, requestId: 'wolf-supply-3', expectedCycle: 3,
    shuttleId: 'maliades', resourceId: 'water',
  }))).resolves.toMatchObject({ cycle: 3, revision: 2, destroyedAmount: 2 });
});

it.each([
  ['fleet loyalist', () => put('sessions/s1/secrets/loyalty-u2', {
    visibleToUids: ['u2'], payload: { type: 'loyalty', kind: 'fleet-loyalist', suspicion: 0 },
  })],
  ['stale cover assignment', () => put('sessions/s1/secrets/wolf-assignment', {
    visibleToUids: ['gm-1'], payload: { type: 'wolf-assignment', roleIds: ['admiral'] },
  })],
  ['replacement role', () => put('sessions/s1/players/u2', {
    uid: 'u2', role: 'player', connected: true, assignedRoleId: 'dione-engineer',
    replacementRoleId: 'wolf-commander', escapeState: null,
  })],
  ['malformed empty replacement', () => put('sessions/s1/players/u2', {
    uid: 'u2', role: 'player', connected: true, assignedRoleId: 'dione-engineer',
    replacementRoleId: '', escapeState: null,
  })],
  ['destroyed-ship escape', () => put('sessions/s1/players/u2', {
    uid: 'u2', role: 'player', connected: true, assignedRoleId: 'dione-engineer',
    replacementRoleId: null, escapeState: { status: 'pending' },
  })],
] as const)('rejects a %s without consuming the cycle slot', async (_label, mutate) => {
  mutate();
  await expect(submitWolfSupplySabotage.run(request())).rejects.toMatchObject({ code: 'permission-denied' });
  expect(mock.documents.has('sessions/s1/wolfActionState/u2')).toBe(false);
});

it('rejects a stale facilitator census without changing cargo, loyalty, or the cycle slot', async () => {
  put('sessions/s1/loyaltyCensus/current', {
    type: 'loyalty-census', revision: 4,
    entries: [{ uid: 'u2', kind: 'wolf-agent', suspicion: 7 }],
  });
  await expect(submitWolfSupplySabotage.run(request())).rejects.toMatchObject({
    code: 'failed-precondition',
  });
  expect(mock.documents.has('sessions/s1/wolfActionState/u2')).toBe(false);
  expect(mock.documents.get('sessions/s1')).toMatchObject({
    shuttleCargo: { philia: { food: 5 }, maliades: { water: 4 } },
  });
  expect(mock.documents.get('sessions/s1/secrets/loyalty-u2')).toMatchObject({
    payload: { suspicion: 0 },
  });
});

it('fails closed instead of overwriting a malformed prior-cycle commitment', async () => {
  put('sessions/s1', { ...mock.documents.get('sessions/s1'), currentTurn: 3 });
  put('sessions/s1/wolfActionState/u2', {
    type: 'wolf-action-commitment', actorUid: 'u2', cycle: 2, revision: 1,
    action: 'sabotage-supplies', coverRoleId: 'dione-engineer',
  });
  await expect(submitWolfSupplySabotage.run(request({
    ...baseData, expectedCycle: 3,
  }))).rejects.toMatchObject({ code: 'failed-precondition' });
  expect(mock.documents.get('sessions/s1/wolfActionState/u2')).not.toHaveProperty('state');
  expect(mock.update).not.toHaveBeenCalled();
});

it('rejects a maximum-safe prior revision before cargo, loyalty, or slot writes', async () => {
  put('sessions/s1', { ...mock.documents.get('sessions/s1'), currentTurn: 3 });
  put('sessions/s1/wolfActionState/u2', {
    type: 'wolf-action-commitment', actorUid: 'u2', cycle: 2,
    revision: Number.MAX_SAFE_INTEGER, action: 'sabotage-supplies',
    coverRoleId: 'dione-engineer', requestId: 'prior', state: 'committed',
  });
  await expect(submitWolfSupplySabotage.run(request({
    ...baseData, expectedCycle: 3,
  }))).rejects.toMatchObject({ code: 'failed-precondition' });
  expect(mock.documents.get('sessions/s1/wolfActionState/u2')).toMatchObject({
    revision: Number.MAX_SAFE_INTEGER,
  });
  expect(mock.update).not.toHaveBeenCalled();
  expect(mock.set).not.toHaveBeenCalled();
});

it('rejects malformed ledgers, stale cycles, unknown resources, and request collisions without mutation', async () => {
  put('sessions/s1', { ...mock.documents.get('sessions/s1'), shuttleCargo: { philia: { food: 2.5 } } });
  await expect(submitWolfSupplySabotage.run(request())).rejects.toMatchObject({ code: 'failed-precondition' });
  provision();
  await expect(submitWolfSupplySabotage.run(request({ ...baseData, expectedCycle: 1 })))
    .rejects.toMatchObject({ code: 'failed-precondition' });
  await expect(submitWolfSupplySabotage.run(request({ ...baseData, resourceId: 'medicine' })))
    .rejects.toMatchObject({ code: 'invalid-argument' });
  await submitWolfSupplySabotage.run(request());
  mock.set.mockClear(); mock.update.mockClear();
  await expect(submitWolfSupplySabotage.run(request({ ...baseData, resourceId: 'water' })))
    .rejects.toMatchObject({ code: 'failed-precondition' });
  expect(mock.set).not.toHaveBeenCalled();
  expect(mock.update).not.toHaveBeenCalled();
});
