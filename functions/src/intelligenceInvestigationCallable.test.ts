import { beforeEach, expect, it, vi } from 'vitest';
import type { CallableRequest } from 'firebase-functions/v2/https';

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
  const set = vi.fn((target: { path: string }, fields: Fields) =>
    documents.set(target.path, { ...fields }));
  const update = vi.fn((target: { path: string }, fields: Fields) =>
    documents.set(target.path, { ...(documents.get(target.path) ?? {}), ...fields }));
  const del = vi.fn();
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

import { investigateAsIntelligenceAgent } from './index';

const data = {
  sessionId: 's1', requestId: 'investigate-1', expectedCycle: 2, targetUid: 'u3',
};

function request(payload: Record<string, unknown> = data, uid = 'u2') {
  return { data: payload, auth: { uid } } as CallableRequest<Record<string, unknown>>;
}
function put(path: string, fields: Fields): void { mock.documents.set(path, { ...fields }); }
function loyalty(uid: string, kind: string, suspicion: number | null): void {
  put(`sessions/s1/secrets/loyalty-${uid}`, {
    visibleToUids: [uid], payload: { type: 'loyalty', kind, suspicion },
  });
}

beforeEach(() => {
  mock.documents.clear();
  mock.get.mockClear(); mock.set.mockClear(); mock.update.mockClear(); mock.delete.mockClear();
  mock.runTransaction.mockReset();
  mock.runTransaction.mockImplementation(async (callback: (tx: unknown) => unknown) =>
    callback({ get: mock.get, set: mock.set, update: mock.update, delete: mock.delete }));
  cryptoMock.randomInt.mockReset(); cryptoMock.randomInt.mockReturnValue(1);
  put('sessions/s1', { phase: 'active', currentTurn: 2 });
  put('sessions/s1/players/u2', {
    role: 'player', connected: true, displayName: 'Investigator',
    fleetGroupId: 'fleet-1',
  });
  put('sessions/s1/players/u3', {
    role: 'player', connected: true, displayName: 'Target',
    fleetGroupId: 'fleet-1',
  });
  loyalty('u2', 'intelligence-agent', 6);
  loyalty('u3', 'wolf-agent', 0);
  put('sessions/s1/loyaltyCensus/current', {
    type: 'loyalty-census', revision: 4,
    entries: [
      { uid: 'u2', kind: 'intelligence-agent', suspicion: 6 },
      { uid: 'u3', kind: 'wolf-agent', suspicion: 0 },
    ],
  });
});

it('returns an accurate private Wolf result without exposing truth or the roll', async () => {
  cryptoMock.randomInt.mockReturnValue(4);

  await expect(investigateAsIntelligenceAgent.run(request())).resolves.toEqual({
    status: 'committed', type: 'intelligence-investigation', sessionId: 's1',
    requestId: 'investigate-1', cycle: 2, revision: 1,
    investigatorUid: 'u2', targetUid: 'u3', targetDisplayName: 'Target',
    reportedWolf: true, suspicion: 8,
  });

  const projection = mock.documents.get('sessions/s1/intelligenceInvestigations/u2');
  expect(projection).toMatchObject({
    type: 'intelligence-investigation', visibleToUids: ['u2'], reportedWolf: true,
  });
  expect(projection).not.toHaveProperty('actualWolf');
  expect(projection).not.toHaveProperty('accuracyRoll');
  expect(mock.documents.get('sessions/s1/intelligenceInvestigationAudits/investigate-1'))
    .toMatchObject({
      actualWolf: true, reportedWolf: true, accurate: true, accuracyRoll: 4,
      oldSuspicion: 6, suspicionIncrement: 2, newSuspicion: 8,
    });
  expect(mock.update).toHaveBeenCalledWith(
    expect.objectContaining({ path: 'sessions/s1/secrets/loyalty-u2' }),
    { payload: { type: 'loyalty', kind: 'intelligence-agent', suspicion: 8 } },
  );
  expect(mock.documents.get('sessions/s1/loyaltyCensus/current')).toMatchObject({
    revision: 5,
    entries: expect.arrayContaining([
      { uid: 'u2', kind: 'intelligence-agent', suspicion: 8 },
    ]),
  });
  expect([...mock.documents.keys()]).not.toContain('sessions/s1/wolfClueDisclosure/current');
  expect([...mock.documents.keys()].some((path) => path.includes('/wolfSuspicionHistory/'))).toBe(false);
  expect(cryptoMock.randomInt).toHaveBeenCalledWith(1, 6);
  expect(cryptoMock.randomInt).toHaveBeenCalledOnce();
});

it('inverts the private answer on the fifth accuracy outcome', async () => {
  loyalty('u3', 'fleet-loyalist', 5);
  cryptoMock.randomInt.mockReturnValue(5);

  await expect(investigateAsIntelligenceAgent.run(request())).resolves.toMatchObject({
    reportedWolf: true,
  });
  expect(mock.documents.get('sessions/s1/intelligenceInvestigationAudits/investigate-1'))
    .toMatchObject({ actualWolf: false, reportedWolf: true, accurate: false, accuracyRoll: 5 });
});

it('treats Wolf Cult as Wolf aligned for the private report', async () => {
  loyalty('u3', 'wolf-cult', 15);
  await expect(investigateAsIntelligenceAgent.run(request())).resolves.toMatchObject({
    reportedWolf: true,
  });
});

it('allows only one committed investigation in a cycle', async () => {
  await investigateAsIntelligenceAgent.run(request());
  put('sessions/s1/players/u4', {
    role: 'player', connected: true, displayName: 'Other target', fleetGroupId: 'fleet-1',
  });
  loyalty('u4', 'fleet-loyalist', 0);
  mock.set.mockClear(); mock.update.mockClear(); cryptoMock.randomInt.mockClear();

  await expect(investigateAsIntelligenceAgent.run(request({
    ...data, requestId: 'investigate-2', targetUid: 'u4',
  }))).rejects.toMatchObject({ code: 'failed-precondition' });
  expect(mock.set).not.toHaveBeenCalled();
  expect(mock.update).not.toHaveBeenCalled();
  expect(cryptoMock.randomInt).not.toHaveBeenCalled();
});

it('adds exactly two suspicion again on a later-cycle investigation', async () => {
  await investigateAsIntelligenceAgent.run(request());
  put('sessions/s1', { phase: 'active', currentTurn: 3 });
  put('sessions/s1/players/u4', {
    role: 'player', connected: true, displayName: 'Later target', fleetGroupId: 'fleet-1',
  });
  loyalty('u4', 'fleet-loyalist', 0);

  await expect(investigateAsIntelligenceAgent.run(request({
    ...data, requestId: 'investigate-2', expectedCycle: 3, targetUid: 'u4',
  }))).resolves.toMatchObject({ cycle: 3, revision: 2, suspicion: 10 });
  expect(mock.documents.get('sessions/s1/secrets/loyalty-u2')).toMatchObject({
    payload: { type: 'loyalty', kind: 'intelligence-agent', suspicion: 10 },
  });
  expect(mock.documents.get('sessions/s1/loyaltyCensus/current')).toMatchObject({
    revision: 6,
    entries: expect.arrayContaining([
      { uid: 'u2', kind: 'intelligence-agent', suspicion: 10 },
    ]),
  });
});

it('replays the exact request without another roll or write', async () => {
  const first = await investigateAsIntelligenceAgent.run(request());
  put('sessions/s1', { phase: 'debrief', currentTurn: 3 });
  put('sessions/s1/players/u3', {
    role: 'player', connected: false, displayName: 'Target', fleetGroupId: 'fleet-2',
  });
  loyalty('u3', 'fleet-loyalist', 5);
  mock.set.mockClear(); mock.update.mockClear(); cryptoMock.randomInt.mockClear();

  await expect(investigateAsIntelligenceAgent.run(request())).resolves.toEqual(first);
  expect(mock.set).not.toHaveBeenCalled();
  expect(mock.update).not.toHaveBeenCalled();
  expect(cryptoMock.randomInt).not.toHaveBeenCalled();
});

it('replays a pre-suspicion receipt without retroactively applying the increment', async () => {
  const legacyResult = {
    status: 'committed', type: 'intelligence-investigation', sessionId: 's1',
    requestId: 'investigate-1', cycle: 2, revision: 1, investigatorUid: 'u2',
    targetUid: 'u3', targetDisplayName: 'Target', reportedWolf: true,
  };
  put('sessions/s1/commandReceipts/investigate-1', {
    fingerprint: {
      action: 'intelligence-investigation', sessionId: 's1', requestId: 'investigate-1',
      actorUid: 'u2', instanceId: null, expectedRevision: 2, payload: { targetUid: 'u3' },
    },
    result: legacyResult,
  });
  put('sessions/s1', { phase: 'debrief', currentTurn: 3 });

  await expect(investigateAsIntelligenceAgent.run(request())).resolves.toEqual(legacyResult);
  expect(mock.set).not.toHaveBeenCalled();
  expect(mock.update).not.toHaveBeenCalled();
  expect(cryptoMock.randomInt).not.toHaveBeenCalled();
});

it('denies non-agents, self targets, and a foreign receipt actor', async () => {
  loyalty('u2', 'fleet-loyalist', 5);
  await expect(investigateAsIntelligenceAgent.run(request())).rejects.toMatchObject({
    code: 'permission-denied',
  });

  loyalty('u2', 'intelligence-agent', 6);
  await expect(investigateAsIntelligenceAgent.run(request({ ...data, targetUid: 'u2' })))
    .rejects.toMatchObject({ code: 'invalid-argument' });

  await investigateAsIntelligenceAgent.run(request());
  put('sessions/s1/players/u4', {
    role: 'player', connected: true, displayName: 'Other agent', fleetGroupId: 'fleet-1',
  });
  loyalty('u4', 'intelligence-agent', 6);
  await expect(investigateAsIntelligenceAgent.run(request(data, 'u4')))
    .rejects.toMatchObject({ code: 'permission-denied' });
});

it('rejects disconnected and cross-group targets', async () => {
  put('sessions/s1/players/u3', {
    role: 'player', connected: false, displayName: 'Target', fleetGroupId: 'fleet-1',
  });
  await expect(investigateAsIntelligenceAgent.run(request())).rejects.toMatchObject({
    code: 'failed-precondition',
  });

  put('sessions/s1/players/u3', {
    role: 'player', connected: true, displayName: 'Target', fleetGroupId: 'fleet-2',
  });
  await expect(investigateAsIntelligenceAgent.run(request())).rejects.toMatchObject({
    code: 'failed-precondition',
  });
  expect(cryptoMock.randomInt).not.toHaveBeenCalled();
});

it('rejects a malformed unrelated census entry without writing or drawing', async () => {
  put('sessions/s1/loyaltyCensus/current', {
    type: 'loyalty-census', revision: 4,
    entries: [
      { uid: 'u2', kind: 'intelligence-agent', suspicion: 6 },
      { uid: 'u3', kind: 'fleet-loyalist', suspicion: 7 },
    ],
  });

  await expect(investigateAsIntelligenceAgent.run(request())).rejects.toMatchObject({
    code: 'failed-precondition',
  });
  expect(mock.set).not.toHaveBeenCalled();
  expect(mock.update).not.toHaveBeenCalled();
  expect(cryptoMock.randomInt).not.toHaveBeenCalled();
});

it('rejects a client-supplied answer or loyalty claim before reading state', async () => {
  await expect(investigateAsIntelligenceAgent.run(request({
    ...data, reportedWolf: true,
  }))).rejects.toMatchObject({ code: 'invalid-argument' });
  await expect(investigateAsIntelligenceAgent.run(request({
    ...data, loyalty: 'wolf-agent',
  }))).rejects.toMatchObject({ code: 'invalid-argument' });
  expect(mock.runTransaction).not.toHaveBeenCalled();
  expect(cryptoMock.randomInt).not.toHaveBeenCalled();
});

it('reuses one accuracy roll across transaction retries', async () => {
  const reports: boolean[] = [];
  mock.runTransaction.mockImplementationOnce(async (callback) => {
    let result: unknown;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const set = vi.fn((target: { path: string }, fields: Fields) => {
        if (target.path === 'sessions/s1/intelligenceInvestigations/u2') {
          reports.push(fields.reportedWolf as boolean);
        }
      });
      result = await callback({ get: mock.get, set, update: vi.fn(), delete: vi.fn() });
    }
    return result;
  });
  cryptoMock.randomInt.mockReturnValueOnce(5).mockReturnValueOnce(1);

  await investigateAsIntelligenceAgent.run(request());

  expect(reports).toEqual([false, false]);
  expect(cryptoMock.randomInt).toHaveBeenCalledOnce();
});
