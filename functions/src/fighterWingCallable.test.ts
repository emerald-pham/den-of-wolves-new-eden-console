import { beforeEach, expect, it, vi } from 'vitest';
import type { CallableRequest } from 'firebase-functions/v2/https';

const mock = vi.hoisted(() => ({
  get: vi.fn(), update: vi.fn(), set: vi.fn(), role: 'gm', owner: 'u1', connected: true,
  transactionCalls: 0,
  session: {
    activeVesselIds: ['aegis'],
    phase: 'active',
    shipUpgrades: { aegis: [] },
    fighterWingCounts: {
      'fighter-wing-alpha': { count: 4, revision: 0 },
      'fighter-wing-bravo': { count: 4, revision: 0 },
    },
  } as Record<string, unknown>,
  receipts: {} as Record<string, Record<string, unknown>>,
  audits: {} as Record<string, Record<string, unknown>>,
}));

vi.mock('firebase-admin/app', () => ({ initializeApp: vi.fn() }));
vi.mock('firebase-admin/firestore', () => ({
  getFirestore: () => ({
    doc: (path: string) => path,
    collection: (path: string) => path,
    runTransaction: async (callback: (tx: unknown) => unknown) => {
      mock.transactionCalls += 1;
      return callback({ get: mock.get, update: mock.update, set: mock.set });
    },
  }),
  FieldValue: { serverTimestamp: () => 'server-time' },
  Timestamp: { now: () => ({ toMillis: () => Date.now() }) },
}));

import { setFighterWingCount } from './index';

function request(data: Record<string, unknown>, uid = 'u1') {
  return { data, auth: { uid } } as CallableRequest<Record<string, unknown>>;
}

const base = {
  sessionId: 's1', instanceId: 'gm1', requestId: 'wing-1',
  wingId: 'fighter-wing-alpha', count: 3, expectedRevision: 0,
};

function snapshot(fields: Record<string, unknown>) {
  return { exists: true, get: (key: string) => fields[key], data: () => fields };
}

beforeEach(() => {
  mock.role = 'gm';
  mock.owner = 'u1';
  mock.connected = true;
  mock.session = {
    activeVesselIds: ['aegis'],
    phase: 'active',
    shipUpgrades: { aegis: [] },
    fighterWingCounts: {
      'fighter-wing-alpha': { count: 4, revision: 0 },
      'fighter-wing-bravo': { count: 4, revision: 0 },
    },
  };
  mock.receipts = {};
  mock.audits = {};
  mock.transactionCalls = 0;
  mock.get.mockReset();
  mock.update.mockReset();
  mock.set.mockReset();
  mock.set.mockImplementation((path: string, fields: Record<string, unknown>) => {
    if (path.includes('/actionAudits/')) mock.audits[path] = { ...fields };
    if (path.includes('/fighterWingCountRequests/')) mock.receipts[path] = { ...fields };
  });
  mock.get.mockImplementation(async (path: string) => {
    if (path.includes('/actionAudits/')) {
      const fields = mock.audits[path];
      return fields ? snapshot(fields) : { exists: false, get: () => undefined, data: () => undefined };
    }
    if (path.includes('/fighterWingCountRequests/')) {
      const fields = mock.receipts[path];
      return fields ? snapshot(fields) : { exists: false, get: () => undefined, data: () => undefined };
    }
    if (path.includes('/players/')) {
      return snapshot({ role: mock.role, connected: mock.connected });
    }
    if (path.includes('/gmInstances/')) {
      return snapshot({ uid: mock.owner, connected: mock.connected, lastSeenAt: new Date() });
    }
    return snapshot(mock.session);
  });
});

it('commits a GM correction with a new per-wing revision and private receipt', async () => {
  await expect(setFighterWingCount.run(request(base))).resolves.toMatchObject({
    status: 'committed', sessionId: 's1', requestId: 'wing-1',
    wingId: 'fighter-wing-alpha', count: 3, revision: 1, capacity: 4,
    actorUid: 'u1', actorRoleId: null, vesselId: 'aegis', turn: 1,
    phase: 'active', idempotencyKey: 'wing-1', auditId: 'fighter-count-wing-1',
  });
  expect(mock.update).toHaveBeenCalledWith('sessions/s1', expect.objectContaining({
    'fighterWingCounts.fighter-wing-alpha': { count: 3, revision: 1 },
  }));
  expect(mock.set).toHaveBeenCalledWith(
    'sessions/s1/fighterWingCountRequests/wing-1',
    expect.objectContaining({ reply: expect.objectContaining({ status: 'committed' }) }),
  );
  const auditPath = 'sessions/s1/actionAudits/wing-1';
  expect(mock.audits[auditPath]).toMatchObject({
    schemaVersion: 1, sessionId: 's1', actorUid: 'u1', actorRoleId: null,
    action: 'fighter-wing-count', phase: 'active', requestId: 'wing-1', revision: 1,
    outcome: 'committed', resolutionSource: 'facilitator',
    redactionPolicy: 'action-audit-metadata-only-v1', createdAt: 'server-time',
  });
  expect(Object.keys(mock.audits[auditPath]).sort()).toEqual([
    'action', 'actorRoleId', 'actorUid', 'createdAt', 'outcome', 'phase',
    'redactionPolicy', 'requestId', 'resolutionSource', 'revision',
    'schemaVersion', 'sessionId',
  ].sort());
  expect(mock.audits[auditPath]).not.toHaveProperty('wingId');
  expect(mock.audits[auditPath]).not.toHaveProperty('count');
  expect(mock.audits[auditPath]).not.toHaveProperty('capacity');
  expect(mock.audits[auditPath]).not.toHaveProperty('instanceId');
  expect(mock.transactionCalls).toBe(1);
  expect(mock.set.mock.calls.map(([path]) => path).sort()).toEqual([
    auditPath, 'sessions/s1/fighterWingCountRequests/wing-1',
  ].sort());
});

it('rejects a non-GM even when the request names a valid GM instance', async () => {
  mock.role = 'player';
  await expect(setFighterWingCount.run(request(base))).rejects.toMatchObject({ code: 'permission-denied' });
  expect(mock.update).not.toHaveBeenCalled();
});

it('returns stale without mutating when another correction advanced the revision', async () => {
  await expect(setFighterWingCount.run({
    ...request(base), data: { ...base, expectedRevision: 1, count: 2 },
  })).resolves.toMatchObject({ status: 'stale', currentRevision: 0, count: 4, capacity: 4 });
  expect(mock.update).not.toHaveBeenCalled();
  expect(mock.set).toHaveBeenCalledWith(
    'sessions/s1/fighterWingCountRequests/wing-1',
    expect.objectContaining({ reply: expect.objectContaining({ status: 'stale' }) }),
  );
  expect(mock.audits).toEqual({});

  mock.set.mockClear();
  await expect(setFighterWingCount.run({
    ...request(base), data: { ...base, expectedRevision: 1, count: 2 },
  })).resolves.toMatchObject({ status: 'stale', currentRevision: 0 });
  expect(mock.set).not.toHaveBeenCalled();
  expect(mock.audits).toEqual({});

  mock.audits['sessions/s1/actionAudits/wing-1'] = { action: 'fighter-wing-count' };
  await expect(setFighterWingCount.run({
    ...request(base), data: { ...base, expectedRevision: 1, count: 2 },
  })).rejects.toMatchObject({ code: 'failed-precondition' });
  expect(mock.update).not.toHaveBeenCalled();
  expect(mock.set).not.toHaveBeenCalled();
});

it('replays the same request id without applying the correction twice', async () => {
  await setFighterWingCount.run(request(base));
  const receiptPath = 'sessions/s1/fighterWingCountRequests/wing-1';
  expect(mock.receipts[receiptPath]?.reply).toMatchObject({ status: 'committed' });
  mock.session.phase = 'failure';
  mock.session.fighterWingCounts = {
    'fighter-wing-alpha': { count: 5, revision: 7 },
    'fighter-wing-bravo': { count: 4, revision: 0 },
  };
  mock.update.mockReset();
  mock.set.mockReset();
  await expect(setFighterWingCount.run(request(base))).resolves.toMatchObject({
    status: 'replayed', count: 3, revision: 1, phase: 'active',
  });
  expect(mock.update).not.toHaveBeenCalled();
  expect(mock.set).not.toHaveBeenCalled();
  expect(mock.audits['sessions/s1/actionAudits/wing-1']).toMatchObject({
    phase: 'active', revision: 1,
  });
});

it('backfills a missing audit from the bound committed receipt and its original per-wing revision', async () => {
  await setFighterWingCount.run(request(base));
  const auditPath = 'sessions/s1/actionAudits/wing-1';
  delete mock.audits[auditPath];
  mock.session.phase = 'briefing';
  mock.session.fighterWingCounts = {
    'fighter-wing-alpha': { count: 5, revision: 9 },
    'fighter-wing-bravo': { count: 4, revision: 0 },
  };
  mock.update.mockReset();
  mock.set.mockClear();

  await expect(setFighterWingCount.run(request(base))).resolves.toMatchObject({
    status: 'replayed', count: 3, revision: 1, phase: 'active',
  });

  expect(mock.update).not.toHaveBeenCalled();
  expect(mock.set).toHaveBeenCalledTimes(1);
  expect(mock.set).toHaveBeenCalledWith(auditPath, expect.objectContaining({
    action: 'fighter-wing-count', phase: 'active', requestId: 'wing-1', revision: 1,
    resolutionSource: 'facilitator', redactionPolicy: 'action-audit-metadata-only-v1',
  }));
  expect(mock.audits[auditPath]).not.toHaveProperty('wingId');
  expect(mock.audits[auditPath]).not.toHaveProperty('count');
});

it('does not audit a no-mutation replay when the requested count already matches at a newer revision', async () => {
  mock.session.fighterWingCounts = {
    'fighter-wing-alpha': { count: 3, revision: 1 },
    'fighter-wing-bravo': { count: 4, revision: 0 },
  };
  await expect(setFighterWingCount.run(request(base))).resolves.toMatchObject({
    status: 'replayed', count: 3, revision: 1,
  });
  expect(mock.update).not.toHaveBeenCalled();
  expect(mock.audits).toEqual({});

  mock.set.mockReset();
  await expect(setFighterWingCount.run(request(base))).resolves.toMatchObject({
    status: 'replayed', count: 3, revision: 1,
  });
  expect(mock.set).not.toHaveBeenCalled();
  expect(mock.audits).toEqual({});

  mock.audits['sessions/s1/actionAudits/wing-1'] = { action: 'fighter-wing-count' };
  await expect(setFighterWingCount.run(request(base))).rejects.toMatchObject({
    code: 'failed-precondition',
  });
  expect(mock.update).not.toHaveBeenCalled();
  expect(mock.set).not.toHaveBeenCalled();
});

it('fails closed when a standardized audit exists without its bound private receipt', async () => {
  const auditPath = 'sessions/s1/actionAudits/wing-1';
  mock.audits[auditPath] = { action: 'fighter-wing-count' };

  await expect(setFighterWingCount.run(request(base))).rejects.toMatchObject({
    code: 'failed-precondition',
  });
  expect(mock.update).not.toHaveBeenCalled();
  expect(mock.set).not.toHaveBeenCalled();
  expect(mock.receipts).toEqual({});
});

it.each([
  ['foreign actor', 'u2', 3, 'permission-denied'],
  ['different request payload', 'u1', 2, 'failed-precondition'],
] as const)('fails closed on a %s bound receipt', async (_label, actorUid, count, code) => {
  mock.receipts['sessions/s1/fighterWingCountRequests/wing-1'] = {
    fingerprint: {
      sessionId: 's1', instanceId: 'gm1', requestId: 'wing-1',
      wingId: 'fighter-wing-alpha', count, expectedRevision: 0, actorUid,
    },
  };

  await expect(setFighterWingCount.run(request(base))).rejects.toMatchObject({ code });
  expect(mock.update).not.toHaveBeenCalled();
  expect(mock.set).not.toHaveBeenCalled();
  expect(mock.audits).toEqual({});
});

it('fails closed when a committed receipt has a mismatched standardized audit', async () => {
  await setFighterWingCount.run(request(base));
  mock.audits['sessions/s1/actionAudits/wing-1'].revision = 4;
  mock.update.mockReset();
  mock.set.mockReset();

  await expect(setFighterWingCount.run(request(base))).rejects.toMatchObject({
    code: 'failed-precondition',
  });
  expect(mock.update).not.toHaveBeenCalled();
  expect(mock.set).not.toHaveBeenCalled();
});

it('fails closed when a bound receipt has an envelope for a different vessel', async () => {
  await setFighterWingCount.run(request(base));
  const receipt = mock.receipts['sessions/s1/fighterWingCountRequests/wing-1'];
  receipt.reply = { ...(receipt.reply as Record<string, unknown>), vesselId: 'warrior' };
  mock.update.mockReset();
  mock.set.mockReset();

  await expect(setFighterWingCount.run(request(base))).rejects.toMatchObject({
    code: 'failed-precondition',
  });
  expect(mock.update).not.toHaveBeenCalled();
  expect(mock.set).not.toHaveBeenCalled();
});

it.each([
  ['wing', { wingId: 'fighter-wing-bravo' }],
  ['count', { count: 2 }],
  ['committed revision', { revision: 7 }],
] as const)('fails closed when a receipt reply has a mismatched %s before audit backfill', async (_label, change) => {
  await setFighterWingCount.run(request(base));
  const auditPath = 'sessions/s1/actionAudits/wing-1';
  delete mock.audits[auditPath];
  const receipt = mock.receipts['sessions/s1/fighterWingCountRequests/wing-1'];
  receipt.reply = { ...(receipt.reply as Record<string, unknown>), ...change };
  mock.update.mockReset();
  mock.set.mockClear();

  await expect(setFighterWingCount.run(request(base))).rejects.toMatchObject({
    code: 'failed-precondition',
  });
  expect(mock.update).not.toHaveBeenCalled();
  expect(mock.set).not.toHaveBeenCalled();
  expect(mock.audits).toEqual({});
});

it('enforces effective capacity from the authoritative Construction Bay upgrade', async () => {
  await expect(setFighterWingCount.run(request({ ...base, count: 5 })))
    .rejects.toMatchObject({ code: 'failed-precondition' });
  mock.session.shipUpgrades = { aegis: ['construction-bay'] };
  await expect(setFighterWingCount.run(request({ ...base, requestId: 'wing-2', count: 5 })))
    .resolves.toMatchObject({ status: 'committed', count: 5, capacity: 6 });
});
