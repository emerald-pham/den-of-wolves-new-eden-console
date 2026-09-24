import { beforeEach, expect, it, vi } from 'vitest';
import type { CallableRequest } from 'firebase-functions/v2/https';
import { recommendedRoleIds } from './roleConfiguration';

type Fields = Record<string, unknown>;

const cryptoMock = vi.hoisted(() => ({
  randomInt: vi.fn((minimumOrMaximum: number, maximum?: number) =>
    maximum === undefined ? 0 : minimumOrMaximum),
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
  const runTransaction = vi.fn(async (callback: (tx: unknown) => unknown) =>
    callback({ get, set, update, delete: vi.fn() }));
  return { documents, get, set, update, runTransaction,
    db: { doc: ref, collection: ref, runTransaction } };
});

vi.mock('firebase-admin/app', () => ({ initializeApp: vi.fn() }));
vi.mock('node:crypto', () => cryptoMock);
vi.mock('firebase-admin/firestore', () => ({
  getFirestore: () => mock.db,
  FieldValue: { serverTimestamp: () => 'server-time', delete: () => 'deleted' },
  Timestamp: class MockTimestamp {
    constructor(private readonly value: Date) {}
    toDate() { return this.value; }
    toMillis() { return this.value.getTime(); }
    static now() { return new MockTimestamp(new Date(Date.now())); }
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

import {
  acknowledgeWolfHackingAlert,
  resolveWolfConsoleSabotage,
  startWolfConsoleVisit,
} from './index';

function put(path: string, fields: Fields): void { mock.documents.set(path, { ...fields }); }

function request(data: Record<string, unknown>, uid = 'gm-uid') {
  return { data, auth: { uid } } as CallableRequest<Record<string, unknown>>;
}

function provision(): void {
  put('sessions/s1', {
    phase: 'active', currentTurn: 2, activeRoleIds: [...recommendedRoleIds(18)],
    activeVesselIds: ['aegis', 'dione'],
    shipDamage: { dione: { damagedSystemIds: ['storage'], destroyed: false } },
  });
  put('sessions/s1/players/gm-uid', {
    uid: 'gm-uid', role: 'gm', connected: true,
  });
  put('sessions/s1/gmInstances/gm-1', {
    uid: 'gm-uid', connected: true,
    lastSeenAt: { toDate: () => new Date(Date.now()), toMillis: () => Date.now() },
  });
  put('sessions/s1/players/wolf-uid', {
    uid: 'wolf-uid', role: 'player', connected: true,
    assignedRoleId: 'dione-engineer', activeConsoleRoleId: 'dione-engineer',
    replacementRoleId: null, escapeState: null,
  });
  put('sessions/s1/secrets/loyalty-wolf-uid', {
    visibleToUids: ['wolf-uid'],
    payload: { type: 'loyalty', kind: 'wolf-agent', suspicion: 1 },
  });
  put('sessions/s1/secrets/wolf-assignment', {
    visibleToUids: ['gm-uid'],
    payload: { type: 'wolf-assignment', roleIds: ['dione-engineer'] },
  });
  put('sessions/s1/loyaltyCensus/current', {
    type: 'loyalty-census', revision: 4,
    entries: [{ uid: 'wolf-uid', kind: 'wolf-agent', suspicion: 1 }],
  });
}

beforeEach(() => {
  vi.restoreAllMocks();
  mock.documents.clear();
  mock.get.mockClear(); mock.set.mockClear(); mock.update.mockClear();
  mock.runTransaction.mockClear(); cryptoMock.randomInt.mockClear();
  provision();
});

it('starts a private server-timed console visit for a verified Wolf and active ship', async () => {
  vi.spyOn(Date, 'now').mockReturnValue(1_000_000);
  const result = await startWolfConsoleVisit.run(request({
    sessionId: 's1', instanceId: 'gm-1', requestId: 'visit-1', expectedCycle: 2,
    targetUid: 'wolf-uid', targetShipId: 'dione',
  }));
  expect(result).toMatchObject({
    status: 'observing', type: 'wolf-console-visit', visitId: 'visit-1', cycle: 2,
    actorUid: 'wolf-uid', coverRoleId: 'dione-engineer', targetShipId: 'dione',
    startedAt: '1970-01-01T00:16:40.000Z',
    eligibleAt: '1970-01-01T00:16:50.000Z',
    expiresAt: '1970-01-01T00:17:40.000Z',
  });
  expect(mock.documents.get('sessions/s1/wolfConsoleVisits/visit-1')).toMatchObject({
    status: 'observing', startedAtMillis: 1_000_000,
    facilitatorUid: 'gm-uid', facilitatorInstanceId: 'gm-1',
  });
});

it('resolves chosen console damage with four suspicion after ten seconds', async () => {
  vi.spyOn(Date, 'now').mockReturnValue(1_000_000);
  await startWolfConsoleVisit.run(request({
    sessionId: 's1', instanceId: 'gm-1', requestId: 'visit-1', expectedCycle: 2,
    targetUid: 'wolf-uid', targetShipId: 'dione',
  }));
  vi.mocked(Date.now).mockReturnValue(1_010_000);
  const result = await resolveWolfConsoleSabotage.run(request({
    sessionId: 's1', instanceId: 'gm-1', requestId: 'resolve-1', visitId: 'visit-1',
    expectedCycle: 2, mode: 'chosen', chosenSystemId: 'reactor',
  }));
  expect(result).toMatchObject({
    status: 'committed', type: 'wolf-console-sabotage', actorUid: 'wolf-uid',
    targetShipId: 'dione', targetSystemId: 'reactor', mode: 'chosen', suspicion: 5,
  });
  expect(mock.documents.get('sessions/s1')).toMatchObject({
    'shipDamage.dione': { damagedSystemIds: ['storage', 'reactor'], destroyed: false },
  });
  expect(mock.documents.get('sessions/s1/wolfActionState/wolf-uid')).toMatchObject({
    action: 'sabotage-console', cycle: 2, revision: 1, targetSystemId: 'reactor',
  });
  expect(mock.documents.get('sessions/s1/wolfActionReceipts/current')).toMatchObject({
    action: 'sabotage-console', targetShipId: 'dione', targetSystemId: 'reactor',
    mode: 'chosen', oldSuspicion: 1, suspicionIncrement: 4, newSuspicion: 5,
  });
  expect(mock.documents.get('sessions/s1/wolfSuspicionHistory/resolve-1')).toMatchObject({
    action: 'sabotage-console', source: 'wolf-console-sabotage', increment: 4,
  });
  expect(mock.documents.get('sessions/s1/wolfHackingAlerts/resolve-1')).toMatchObject({
    type: 'wolf-hacking-alert', state: 'pending', alertId: 'resolve-1',
    sessionId: 's1', requestId: 'resolve-1', action: 'sabotage-console',
    cycle: 2, actorUid: 'wolf-uid', actorRoleId: 'dione-engineer',
    targetShipId: 'dione', targetSystemId: 'reactor',
    clueInstruction: expect.any(String), revision: 1,
  });
  expect(mock.documents.get('sessions/s1/wolfConsoleVisits/visit-1')).toMatchObject({
    status: 'resolved', resolveRequestId: 'resolve-1', targetSystemId: 'reactor',
  });
});

it('selects a random remaining console on the server and adds two suspicion', async () => {
  vi.spyOn(Date, 'now').mockReturnValue(1_500_000);
  await startWolfConsoleVisit.run(request({
    sessionId: 's1', instanceId: 'gm-1', requestId: 'visit-random', expectedCycle: 2,
    targetUid: 'wolf-uid', targetShipId: 'dione',
  }));
  vi.mocked(Date.now).mockReturnValue(1_510_000);
  cryptoMock.randomInt.mockImplementation((minimumOrMaximum: number, maximum?: number) =>
    maximum === undefined ? 1 : minimumOrMaximum);
  const result = await resolveWolfConsoleSabotage.run(request({
    sessionId: 's1', instanceId: 'gm-1', requestId: 'resolve-random',
    visitId: 'visit-random', expectedCycle: 2, mode: 'random',
  }));
  expect(result).toMatchObject({
    status: 'committed', mode: 'random', targetSystemId: 'shuttle-bay', suspicion: 3,
  });
  expect(cryptoMock.randomInt).toHaveBeenNthCalledWith(1, 7);
  expect(cryptoMock.randomInt).toHaveBeenNthCalledWith(2, 1, 7);
  expect(mock.documents.get('sessions/s1/wolfActionReceipts/current')).toMatchObject({
    mode: 'random', targetSystemId: 'shuttle-bay', suspicionIncrement: 2,
  });
});

it('denies resolution before ten seconds without damage, suspicion, or action consumption', async () => {
  vi.spyOn(Date, 'now').mockReturnValue(2_000_000);
  await startWolfConsoleVisit.run(request({
    sessionId: 's1', instanceId: 'gm-1', requestId: 'visit-early', expectedCycle: 2,
    targetUid: 'wolf-uid', targetShipId: 'dione',
  }));
  vi.mocked(Date.now).mockReturnValue(2_009_999);
  await expect(resolveWolfConsoleSabotage.run(request({
    sessionId: 's1', instanceId: 'gm-1', requestId: 'resolve-early', visitId: 'visit-early',
    expectedCycle: 2, mode: 'random',
  }))).rejects.toMatchObject({ code: 'failed-precondition' });
  expect(mock.documents.has('sessions/s1/wolfActionState/wolf-uid')).toBe(false);
  expect(mock.documents.get('sessions/s1/secrets/loyalty-wolf-uid')).toMatchObject({
    payload: { suspicion: 1 },
  });
  expect(Object.keys(mock.documents.get('sessions/s1') ?? {})).not.toContain('shipDamage.dione');
});

it('denies resolution after sixty seconds without consuming the action', async () => {
  vi.spyOn(Date, 'now').mockReturnValue(2_500_000);
  await startWolfConsoleVisit.run(request({
    sessionId: 's1', instanceId: 'gm-1', requestId: 'visit-expired', expectedCycle: 2,
    targetUid: 'wolf-uid', targetShipId: 'dione',
  }));
  vi.mocked(Date.now).mockReturnValue(2_560_001);
  await expect(resolveWolfConsoleSabotage.run(request({
    sessionId: 's1', instanceId: 'gm-1', requestId: 'resolve-expired',
    visitId: 'visit-expired', expectedCycle: 2, mode: 'random',
  }))).rejects.toMatchObject({ code: 'failed-precondition' });
  expect(mock.documents.has('sessions/s1/wolfActionState/wolf-uid')).toBe(false);
  expect(mock.documents.get('sessions/s1/secrets/loyalty-wolf-uid')).toMatchObject({
    payload: { suspicion: 1 },
  });
  expect(mock.documents.get('sessions/s1')).toMatchObject({
    shipDamage: { dione: { damagedSystemIds: ['storage'], destroyed: false } },
  });
});

it('replays an exact resolution without a second draw or suspicion change', async () => {
  vi.spyOn(Date, 'now').mockReturnValue(3_000_000);
  await startWolfConsoleVisit.run(request({
    sessionId: 's1', instanceId: 'gm-1', requestId: 'visit-replay', expectedCycle: 2,
    targetUid: 'wolf-uid', targetShipId: 'dione',
  }));
  vi.mocked(Date.now).mockReturnValue(3_010_000);
  const data = {
    sessionId: 's1', instanceId: 'gm-1', requestId: 'resolve-replay',
    visitId: 'visit-replay', expectedCycle: 2, mode: 'random',
  };
  const first = await resolveWolfConsoleSabotage.run(request(data));
  cryptoMock.randomInt.mockClear(); mock.set.mockClear(); mock.update.mockClear();
  await expect(resolveWolfConsoleSabotage.run(request(data))).resolves.toEqual(first);
  expect(cryptoMock.randomInt).not.toHaveBeenCalled();
  expect([...mock.documents.keys()].filter((path) => path === 'sessions/s1/wolfHackingAlerts/resolve-replay'))
    .toHaveLength(1);
  expect(mock.set).not.toHaveBeenCalled();
  expect(mock.update).not.toHaveBeenCalled();
});

it('fails closed when suspicion history occupies a new console sabotage request without its receipt', async () => {
  vi.spyOn(Date, 'now').mockReturnValue(3_500_000);
  await startWolfConsoleVisit.run(request({
    sessionId: 's1', instanceId: 'gm-1', requestId: 'visit-orphan-history', expectedCycle: 2,
    targetUid: 'wolf-uid', targetShipId: 'dione',
  }));
  vi.mocked(Date.now).mockReturnValue(3_510_000);
  const requestId = 'resolve-orphan-history';
  const historyPath = `sessions/s1/wolfSuspicionHistory/${requestId}`;
  const orphanHistory = {
    type: 'wolf-suspicion-history', status: 'committed', sessionId: 's1', requestId,
  };
  mock.documents.set(historyPath, orphanHistory);
  await expect(resolveWolfConsoleSabotage.run(request({
    sessionId: 's1', instanceId: 'gm-1', requestId, visitId: 'visit-orphan-history',
    expectedCycle: 2, mode: 'random',
  }))).rejects.toMatchObject({ code: 'failed-precondition' });
  expect(mock.documents.get(historyPath)).toEqual(orphanHistory);
  expect(mock.documents.has(`sessions/s1/wolfHackingAlerts/${requestId}`)).toBe(false);
  expect(mock.documents.get('sessions/s1/wolfConsoleVisits/visit-orphan-history'))
    .toMatchObject({ status: 'observing' });
});

it('requires the facilitator to handle the exact clue before publishing one actor-free notice', async () => {
  vi.spyOn(Date, 'now').mockReturnValue(4_000_000);
  await startWolfConsoleVisit.run(request({
    sessionId: 's1', instanceId: 'gm-1', requestId: 'visit-ack', expectedCycle: 2,
    targetUid: 'wolf-uid', targetShipId: 'dione',
  }));
  vi.mocked(Date.now).mockReturnValue(4_010_000);
  const sabotageData = {
    sessionId: 's1', instanceId: 'gm-1', requestId: 'resolve-ack', visitId: 'visit-ack',
    expectedCycle: 2, mode: 'chosen', chosenSystemId: 'reactor',
  };
  const committed = await resolveWolfConsoleSabotage.run(request(sabotageData));
  const pendingAlertTemplate = mock.documents.get('sessions/s1/wolfHackingAlerts/resolve-ack')!;
  const historyTemplate = mock.documents.get('sessions/s1/wolfSuspicionHistory/resolve-ack')!;
  const data = {
    sessionId: 's1', instanceId: 'gm-1', requestId: 'ack-1',
    alertId: 'resolve-ack', expectedRevision: 1,
  };
  const first = await acknowledgeWolfHackingAlert.run(request(data));
  expect(first).toMatchObject({
    status: 'acknowledged', type: 'wolf-hacking-alert-acknowledgement',
    sessionId: 's1', requestId: 'ack-1', alertId: 'resolve-ack',
    noticeId: 'notice-000000000001', noticeSequence: 1, revision: 2,
  });
  expect(mock.documents.get('sessions/s1/wolfHackingAlerts/resolve-ack')).toMatchObject({
    state: 'acknowledged', revision: 2, acknowledgedBy: 'gm-uid',
    clueInstructionHandled: true, clueInstructionHandledBy: 'gm-uid',
    overlayNoticeId: 'notice-000000000001', overlayNoticeSequence: 1,
  });
  expect(mock.documents.get('sessions/s1/playerHackingNotices/notice-000000000001')).toEqual({
    type: 'wolf-hacking-overlay-notice', sessionId: 's1', sequence: 1, createdAt: 'server-time',
  });
  expect(mock.documents.get('sessions/s1/playerHackingNoticeFeeds/current')).toEqual({
    type: 'wolf-hacking-notice-feed', sessionId: 's1', noticeCount: 1,
  });
  mock.set.mockClear(); mock.update.mockClear();
  await expect(acknowledgeWolfHackingAlert.run(request(data))).resolves.toEqual(first);
  expect(mock.set).not.toHaveBeenCalled();
  expect(mock.update).not.toHaveBeenCalled();

  const secondAlertId = 'resolve-ack-2';
  const secondAuditId = `wolf-console-sabotage-${secondAlertId}`;
  mock.documents.set(`sessions/s1/wolfHackingAlerts/${secondAlertId}`, {
    ...pendingAlertTemplate, alertId: secondAlertId, requestId: secondAlertId, auditId: secondAuditId,
  });
  mock.documents.set(`sessions/s1/wolfSuspicionHistory/${secondAlertId}`, {
    ...historyTemplate, requestId: secondAlertId, auditId: secondAuditId,
  });
  const second = await acknowledgeWolfHackingAlert.run(request({
    sessionId: 's1', instanceId: 'gm-1', requestId: 'ack-2',
    alertId: secondAlertId, expectedRevision: 1,
  }));
  expect(second).toMatchObject({
    status: 'acknowledged', alertId: secondAlertId,
    noticeId: 'notice-000000000002', noticeSequence: 2,
  });
  expect(mock.documents.get('sessions/s1/playerHackingNoticeFeeds/current'))
    .toMatchObject({ noticeCount: 2 });
  expect(mock.documents.get('sessions/s1/playerHackingNotices/notice-000000000002'))
    .toMatchObject({ sequence: 2, type: 'wolf-hacking-overlay-notice' });
  await expect(acknowledgeWolfHackingAlert.run(request(data))).resolves.toEqual(first);
  expect(mock.documents.get('sessions/s1/playerHackingNoticeFeeds/current'))
    .toMatchObject({ noticeCount: 2 });
  await expect(resolveWolfConsoleSabotage.run(request(sabotageData))).resolves.toEqual(committed);
  mock.documents.delete('sessions/s1/playerHackingNotices/notice-000000000001');
  await expect(acknowledgeWolfHackingAlert.run(request(data))).rejects.toMatchObject({
    code: 'failed-precondition',
  });
});

it('fails closed when the public notice counter is mixed or its next notice already exists', async () => {
  vi.spyOn(Date, 'now').mockReturnValue(5_000_000);
  await startWolfConsoleVisit.run(request({
    sessionId: 's1', instanceId: 'gm-1', requestId: 'visit-feed-corrupt', expectedCycle: 2,
    targetUid: 'wolf-uid', targetShipId: 'dione',
  }));
  vi.mocked(Date.now).mockReturnValue(5_010_000);
  await resolveWolfConsoleSabotage.run(request({
    sessionId: 's1', instanceId: 'gm-1', requestId: 'resolve-feed-corrupt',
    visitId: 'visit-feed-corrupt', expectedCycle: 2, mode: 'chosen', chosenSystemId: 'reactor',
  }));
  const feedPath = 'sessions/s1/playerHackingNoticeFeeds/current';
  const alertPath = 'sessions/s1/wolfHackingAlerts/resolve-feed-corrupt';
  mock.documents.set(feedPath, {
    type: 'wolf-hacking-notice-feed', sessionId: 's1', noticeCount: 0, actorUid: 'wolf-uid',
  });
  await expect(acknowledgeWolfHackingAlert.run(request({
    sessionId: 's1', instanceId: 'gm-1', requestId: 'ack-feed-corrupt',
    alertId: 'resolve-feed-corrupt', expectedRevision: 1,
  }))).rejects.toMatchObject({ code: 'failed-precondition' });
  expect(mock.documents.get(alertPath)).toMatchObject({ state: 'pending', revision: 1 });
  expect(mock.documents.has('sessions/s1/commandReceipts/ack-feed-corrupt')).toBe(false);

  mock.documents.set(feedPath, {
    type: 'wolf-hacking-notice-feed', sessionId: 's1', noticeCount: 0,
  });
  mock.documents.set('sessions/s1/playerHackingNotices/notice-000000000001', {
    type: 'wolf-hacking-overlay-notice', sessionId: 's1', sequence: 1, createdAt: 'server-time',
  });
  await expect(acknowledgeWolfHackingAlert.run(request({
    sessionId: 's1', instanceId: 'gm-1', requestId: 'ack-notice-orphan',
    alertId: 'resolve-feed-corrupt', expectedRevision: 1,
  }))).rejects.toMatchObject({ code: 'failed-precondition' });
  expect(mock.documents.get(alertPath)).toMatchObject({ state: 'pending', revision: 1 });
  expect(mock.documents.has('sessions/s1/commandReceipts/ack-notice-orphan')).toBe(false);
});

it('fails closed when a pending alert no longer matches its immutable clue history', async () => {
  vi.spyOn(Date, 'now').mockReturnValue(5_000_000);
  await startWolfConsoleVisit.run(request({
    sessionId: 's1', instanceId: 'gm-1', requestId: 'visit-corrupt', expectedCycle: 2,
    targetUid: 'wolf-uid', targetShipId: 'dione',
  }));
  vi.mocked(Date.now).mockReturnValue(5_010_000);
  await resolveWolfConsoleSabotage.run(request({
    sessionId: 's1', instanceId: 'gm-1', requestId: 'resolve-corrupt', visitId: 'visit-corrupt',
    expectedCycle: 2, mode: 'chosen', chosenSystemId: 'reactor',
  }));
  mock.documents.set('sessions/s1/wolfSuspicionHistory/resolve-corrupt', {
    ...mock.documents.get('sessions/s1/wolfSuspicionHistory/resolve-corrupt'), disclosure: 'changed',
  });
  await expect(acknowledgeWolfHackingAlert.run(request({
    sessionId: 's1', instanceId: 'gm-1', requestId: 'ack-corrupt',
    alertId: 'resolve-corrupt', expectedRevision: 1,
  }))).rejects.toMatchObject({ code: 'failed-precondition' });
  expect(mock.documents.has('sessions/s1/playerHackingNotices/notice-000000000001')).toBe(false);
  expect(mock.documents.get('sessions/s1/wolfHackingAlerts/resolve-corrupt')).toMatchObject({
    state: 'pending', revision: 1,
  });
});
