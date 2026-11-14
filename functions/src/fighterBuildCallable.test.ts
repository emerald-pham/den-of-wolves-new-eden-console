import { beforeEach, expect, it, vi } from 'vitest';
import type { CallableRequest } from 'firebase-functions/v2/https';

const mock = vi.hoisted(() => ({
  get: vi.fn(), update: vi.fn(), set: vi.fn(), role: 'player', activeRole: 'wing-commander' as string | undefined,
  owner: 'u1', connected: true,
  players: [] as Array<Record<string, unknown>>,
  session: {} as Record<string, unknown>,
  receipts: {} as Record<string, Record<string, unknown>>,
  audits: {} as Record<string, Record<string, unknown>>,
  attack: undefined as Record<string, unknown> | undefined,
}));

vi.mock('firebase-admin/app', () => ({ initializeApp: vi.fn() }));
vi.mock('firebase-admin/firestore', () => ({
  getFirestore: () => ({
    doc: (path: string) => path,
    collection: (path: string) => path,
    runTransaction: async (callback: (tx: unknown) => unknown) => callback({
      get: mock.get, update: mock.update, set: mock.set,
    }),
  }),
  FieldValue: { serverTimestamp: () => 'server-time' },
  Timestamp: { now: () => ({ toMillis: () => Date.now() }) },
}));

import { buildFighter } from './index';

function request(data: Record<string, unknown>, uid = 'u1') {
  return { data, auth: { uid } } as CallableRequest<Record<string, unknown>>;
}

const base = {
  sessionId: 's1', requestId: 'build-1', wingId: 'fighter-wing-alpha', expectedRevision: 0,
};

function snapshot(fields: Record<string, unknown>) {
  return { exists: true, id: 'u1', get: (key: string) => fields[key] };
}

function teamCycle() {
  return { turn: 1, step: 5, revision: 3, results: {}, charges: ['construction-bay'], refuelled: [] };
}

beforeEach(() => {
  mock.role = 'player';
  mock.activeRole = 'wing-commander';
  mock.owner = 'u1';
  mock.connected = true;
  mock.players = [];
  mock.session = {
    activeVesselIds: ['aegis'], activeRoleIds: ['admiral', 'wing-commander'], phase: 'active', currentTurn: 1,
    turnPhase: { turn: 1, airspace: { state: 'restricted' } }, maintenanceCycles: { aegis: teamCycle() },
    shipUpgrades: { aegis: [] }, shipResources: { aegis: { ore: 0, fuel: 4, food: 8, water: 6, materials: 2, securityTeams: 9 } },
    shipDamage: { aegis: { damagedSystemIds: [], destroyed: false } },
    fighterWingCounts: { 'fighter-wing-alpha': { count: 3, revision: 0 }, 'fighter-wing-bravo': { count: 4, revision: 0 } },
    vesselActionRevisions: { aegis: 0 },
  };
  mock.receipts = {};
  mock.audits = {};
  mock.attack = undefined;
  mock.get.mockReset();
  mock.update.mockReset();
  mock.set.mockReset();
  mock.set.mockImplementation((path: string, fields: Record<string, unknown>) => {
    if (path.includes('/actionAudits/')) mock.audits[path] = { ...fields };
  });
  mock.get.mockImplementation(async (path: string) => {
    if (path.includes('/actionAudits/')) {
      const fields = mock.audits[path];
      return fields
        ? { exists: true, data: () => fields, get: (key: string) => fields[key] }
        : { exists: false, data: () => undefined, get: () => undefined };
    }
    if (path.includes('/commandReceipts/')) {
      const fields = mock.receipts[path];
      return fields ? snapshot(fields) : { exists: false, get: () => undefined };
    }
    if (path.includes('/players/')) {
      return snapshot({ role: mock.role, connected: mock.connected, activeConsoleRoleId: mock.activeRole });
    }
    if (path.includes('/private/shipConsoleWriteGrant')) {
      return snapshot({
        type: 'gm-ship-console-write-grant', sessionId: 's1', instanceId: 'gm-1', uid: mock.owner,
        shipId: 'aegis', grantedAt: new Date(),
      });
    }
    if (path.includes('/gmInstances/')) {
      return snapshot({ uid: mock.owner, connected: mock.connected, lastSeenAt: new Date() });
    }
    if (path.endsWith('/wolfAttackState/current')) {
      const attack = mock.attack;
      return attack
        ? { exists: true, data: () => attack, get: (key: string) => attack[key] }
        : { exists: false, data: () => undefined, get: () => undefined };
    }
    if (path.endsWith('/players')) return { exists: true, docs: mock.players.map((fields) => snapshot(fields)) };
    return snapshot(mock.session);
  });
});

it('atomically spends one material and adds one fighter with shared vessel CAS', async () => {
  await expect(buildFighter.run(request(base))).resolves.toMatchObject({
    status: 'committed', wingId: 'fighter-wing-alpha', count: 4, fighterWingRevision: 1,
    materials: 1, capacity: 4, revision: 1, vesselId: 'aegis', idempotencyKey: 'build-1',
  });
  expect(mock.update).toHaveBeenCalledWith('sessions/s1', expect.objectContaining({
    'fighterWingCounts.fighter-wing-alpha': { count: 4, revision: 1 },
    'shipResources.aegis.materials': 1,
    'vesselActionRevisions.aegis': 1,
  }));
});

it('rejects a player without the Wing Commander authority', async () => {
  mock.activeRole = 'quellon-explorer';
  await expect(buildFighter.run(request(base))).rejects.toMatchObject({ code: 'permission-denied' });
  expect(mock.update).not.toHaveBeenCalled();
});

it('rejects other consoles and disconnected Wing Commanders but permits a live GM instance', async () => {
  for (const [index, activeRole] of ['admiral', 'executive-officer'].entries()) {
    mock.activeRole = activeRole;
    mock.connected = true;
    mock.players = [{ role: 'player', connected: false, activeConsoleRoleId: 'wing-commander' }];
    await expect(buildFighter.run(request({ ...base, requestId: `build-cover-${index}` })))
      .rejects.toMatchObject({ code: 'permission-denied' });
    expect(mock.update).not.toHaveBeenCalled();
    mock.update.mockReset();
  }

  mock.activeRole = 'wing-commander';
  mock.connected = false;
  await expect(buildFighter.run(request({ ...base, requestId: 'build-disconnected-commander' })))
    .rejects.toMatchObject({ code: 'permission-denied' });
  expect(mock.update).not.toHaveBeenCalled();
  expect(mock.set).not.toHaveBeenCalled();

  mock.role = 'gm';
  mock.activeRole = undefined;
  mock.connected = true;
  mock.players = [];
  await expect(buildFighter.run(request({ ...base, requestId: 'build-gm', instanceId: 'gm-1' })))
    .resolves.toMatchObject({ status: 'committed', count: 4, materials: 1 });
  expect(mock.update).toHaveBeenCalled();
});

it('rejects coordination phase, damage, depleted materials, and capacity', async () => {
  mock.session.turnPhase = { turn: 1, airspace: { state: 'lifted' } };
  await expect(buildFighter.run(request(base))).rejects.toMatchObject({ code: 'failed-precondition' });
  mock.session.turnPhase = { turn: 1, airspace: { state: 'restricted' } };
  mock.session.shipDamage = { aegis: { damagedSystemIds: ['construction-bay'], destroyed: false } };
  await expect(buildFighter.run(request({ ...base, requestId: 'build-damaged' }))).rejects.toMatchObject({ code: 'failed-precondition' });
  mock.session.shipDamage = { aegis: { damagedSystemIds: [], destroyed: true } };
  await expect(buildFighter.run(request({ ...base, requestId: 'build-destroyed' }))).rejects.toMatchObject({ code: 'failed-precondition' });
  mock.session.shipDamage = { aegis: { damagedSystemIds: [], destroyed: false } };
  mock.session.shipResources = { aegis: { materials: 0 } };
  await expect(buildFighter.run(request({ ...base, requestId: 'build-empty' }))).rejects.toMatchObject({ code: 'failed-precondition' });
  mock.session.shipResources = { aegis: { materials: 2 } };
  mock.session.fighterWingCounts = { 'fighter-wing-alpha': { count: 4, revision: 0 } };
  await expect(buildFighter.run(request({ ...base, requestId: 'build-capacity' }))).rejects.toMatchObject({ code: 'failed-precondition' });
});

it('uses the authoritative upgraded capacity and rejects missing strength', async () => {
  mock.session.shipUpgrades = { aegis: ['construction-bay'] };
  mock.session.fighterWingCounts = { 'fighter-wing-alpha': { count: 5, revision: 0 } };
  await expect(buildFighter.run(request({ ...base, requestId: 'build-upgrade' }))).resolves.toMatchObject({
    status: 'committed', count: 6, capacity: 6,
  });
  mock.session.fighterWingCounts = {};
  await expect(buildFighter.run(request({ ...base, requestId: 'build-missing' }))).rejects.toMatchObject({ code: 'failed-precondition' });
});

it('returns a stale result without mutation and replays a committed request', async () => {
  await expect(buildFighter.run(request({ ...base, expectedRevision: 2 }))).resolves.toMatchObject({
    status: 'stale', currentRevision: 0, count: 3, materials: 2,
  });
  expect(mock.update).not.toHaveBeenCalled();
  await buildFighter.run(request(base));
  const receiptPath = 'sessions/s1/commandReceipts/build-1';
  const receipt = mock.set.mock.calls.at(-1)?.[1] as Record<string, unknown>;
  mock.receipts[receiptPath] = receipt;
  mock.update.mockReset();
  mock.set.mockReset();
  await expect(buildFighter.run(request(base))).resolves.toMatchObject({
    status: 'committed', count: 4, fighterWingRevision: 1, materials: 1,
  });
  expect(mock.update).not.toHaveBeenCalled();
  expect(mock.set).not.toHaveBeenCalled();
});

it('is blocked while a Wolf attack holds the fleet, so a launched wing count cannot change mid-attack', async () => {
  const holding = [
    { status: 'declared', airspaceLocked: true, turn: 1, attackId: 'attack-1' },
    { status: 'resolving', airspaceLocked: true, turn: 1, attackId: 'attack-1' },
    { status: 'resolved', airspaceLocked: true, turn: 1, attackId: 'attack-1' },
  ];
  for (const [index, attack] of holding.entries()) {
    mock.attack = attack;
    await expect(buildFighter.run(request({ ...base, requestId: `build-attack-${index}` })))
      .rejects.toMatchObject({ code: 'failed-precondition' });
  }
  expect(mock.update).not.toHaveBeenCalled();
  expect(mock.set).not.toHaveBeenCalled();

  mock.attack = {
    status: 'resolved', airspaceLocked: false, parkingReleaseCondition: 'normal-movement-reopened',
    turn: 1, attackId: 'attack-1',
  };
  await expect(buildFighter.run(request({ ...base, requestId: 'build-after-attack' })))
    .resolves.toMatchObject({ status: 'committed', count: 4 });
});

it('still replays a build committed before the attack was declared', async () => {
  await buildFighter.run(request(base));
  mock.receipts['sessions/s1/commandReceipts/build-1'] = mock.set.mock.calls.at(-1)?.[1] as Record<string, unknown>;
  mock.update.mockReset();
  mock.set.mockReset();
  mock.attack = { status: 'declared', airspaceLocked: true, turn: 1, attackId: 'attack-1' };
  await expect(buildFighter.run(request(base))).resolves.toMatchObject({ status: 'committed', count: 4 });
  expect(mock.update).not.toHaveBeenCalled();
});

const auditPath = 'sessions/s1/actionAudits/build-1';
const receiptPath = 'sessions/s1/commandReceipts/build-1';
function storedReceipt() {
  const call = mock.set.mock.calls.find(([path]) => path === receiptPath);
  return call?.[1] as Record<string, unknown>;
}

it('records one attributable server-rules audit for a player build and never duplicates it on replay', async () => {
  await buildFighter.run(request(base));
  expect(mock.audits[auditPath]).toEqual({
    schemaVersion: 1, sessionId: 's1', actorUid: 'u1', actorRoleId: 'wing-commander',
    action: 'fighter-construction', phase: 'active', requestId: 'build-1', revision: 1,
    outcome: 'committed', resolutionSource: 'server-rules',
    redactionPolicy: 'action-audit-metadata-only-v1', createdAt: 'server-time',
  });
  mock.receipts[receiptPath] = storedReceipt();
  mock.set.mockClear();
  mock.update.mockClear();
  await expect(buildFighter.run(request(base))).resolves.toMatchObject({ status: 'committed', count: 4 });
  expect(mock.set).not.toHaveBeenCalled();
  expect(mock.update).not.toHaveBeenCalled();
});

it('attributes a GM-instance build to the GM without changing the rules source', async () => {
  mock.role = 'gm';
  mock.activeRole = undefined;
  await buildFighter.run(request({ ...base, instanceId: 'gm-1' }));
  expect(mock.audits[auditPath]).toMatchObject({
    actorUid: 'u1', actorRoleId: null, action: 'fighter-construction', revision: 1,
    resolutionSource: 'server-rules',
  });
});

it('writes no audit for a denied actor or a stale build', async () => {
  mock.activeRole = 'quellon-explorer';
  await expect(buildFighter.run(request(base))).rejects.toMatchObject({ code: 'permission-denied' });
  mock.activeRole = 'wing-commander';
  await expect(buildFighter.run(request({ ...base, expectedRevision: 2 }))).resolves.toMatchObject({ status: 'stale' });
  mock.receipts[receiptPath] = storedReceipt();
  await expect(buildFighter.run(request({ ...base, expectedRevision: 2 }))).resolves.toMatchObject({ status: 'stale' });
  expect(mock.audits).toEqual({});
});

it('backfills a missing audit once from a committed receipt that predates standardized audits', async () => {
  await buildFighter.run(request(base));
  mock.receipts[receiptPath] = storedReceipt();
  delete mock.audits[auditPath];
  mock.set.mockClear();
  await expect(buildFighter.run(request(base))).resolves.toMatchObject({ status: 'committed', revision: 1 });
  expect(mock.audits[auditPath]).toMatchObject({ action: 'fighter-construction', revision: 1, phase: 'active' });
  expect(mock.set).toHaveBeenCalledTimes(1);
});

it('fails closed on an orphaned or mismatched fighter-construction audit', async () => {
  mock.audits[auditPath] = { action: 'fighter-construction' };
  await expect(buildFighter.run(request(base))).rejects.toMatchObject({ code: 'failed-precondition' });
  expect(mock.update).not.toHaveBeenCalled();

  mock.audits = {};
  await buildFighter.run(request(base));
  mock.receipts[receiptPath] = storedReceipt();
  mock.audits[auditPath] = { ...mock.audits[auditPath], revision: 7 };
  mock.update.mockClear();
  await expect(buildFighter.run(request(base))).rejects.toMatchObject({ code: 'failed-precondition' });
});

it('keeps the wing choice and committed construction in one facilitator-only receipt for a player or GM build', async () => {
  const detailPath = 'sessions/s1/actionAuditDetails/build-1';
  const committed = await buildFighter.run(request(base));
  expect(mock.set).toHaveBeenCalledWith(detailPath, {
    schemaVersion: 1, sessionId: 's1', actorUid: 'u1', action: 'fighter-construction', requestId: 'build-1',
    revision: 1, resolutionSource: 'server-rules', audience: 'facilitator',
    choice: { shipId: 'aegis', wingId: 'fighter-wing-alpha' },
    result: committed,
    redactionPolicy: 'action-audit-gm-detail-v1', createdAt: 'server-time',
  });
  expect(committed).toMatchObject({ count: 4, materials: 1, capacity: 4 });
  mock.receipts[receiptPath] = storedReceipt();
  mock.set.mockClear();
  await buildFighter.run(request(base));
  expect(mock.set).not.toHaveBeenCalled();

  mock.receipts = {}; mock.audits = {}; mock.set.mockClear();
  mock.role = 'gm'; mock.activeRole = undefined;
  await buildFighter.run(request({ ...base, instanceId: 'gm-1' }));
  expect(mock.set).toHaveBeenCalledWith(detailPath, expect.objectContaining({
    actorUid: 'u1', action: 'fighter-construction', audience: 'facilitator',
  }));
});

it('writes no facilitator construction detail for a denied actor or a stale build', async () => {
  mock.activeRole = 'quellon-explorer';
  await expect(buildFighter.run(request(base))).rejects.toMatchObject({ code: 'permission-denied' });
  mock.activeRole = 'wing-commander';
  await expect(buildFighter.run(request({ ...base, expectedRevision: 2 }))).resolves.toMatchObject({ status: 'stale' });
  expect(mock.set.mock.calls.some(([path]) => String(path).includes('/actionAuditDetails/'))).toBe(false);
});

it('commits one construction, audit and facilitator receipt when two GM consoles compete for one AEGIS revision', async () => {
  // Firestore serializes the competing transactions; the second reads the
  // first's committed vessel revision.
  mock.update.mockImplementation((_path: string, fields: Record<string, unknown>) => {
    for (const [key, value] of Object.entries(fields)) {
      if (key === 'vesselActionRevisions.aegis') mock.session.vesselActionRevisions = { aegis: value };
      if (key === 'fighterWingCounts.fighter-wing-alpha') {
        mock.session.fighterWingCounts = {
          ...(mock.session.fighterWingCounts as Record<string, unknown>), 'fighter-wing-alpha': value,
        };
      }
    }
  });
  mock.role = 'gm'; mock.activeRole = undefined;
  const baseGet = mock.get.getMockImplementation()!;
  mock.get.mockImplementation(async (path: string) => {
    if (path.includes('/private/shipConsoleWriteGrant')) {
      return snapshot({
        type: 'gm-ship-console-write-grant', sessionId: 's1', instanceId: path.split('/').at(-3),
        uid: mock.owner, shipId: 'aegis', grantedAt: new Date(),
      });
    }
    if (path.includes('/players/')) {
      return { ...snapshot({ role: mock.role, connected: mock.connected }), id: path.split('/').at(-1) };
    }
    return baseGet(path);
  });

  const first = await buildFighter.run(request({ ...base, instanceId: 'gm-1', requestId: 'gm-a-build' }));
  mock.owner = 'u2';
  const second = await buildFighter.run(request({ ...base, instanceId: 'gm-2', requestId: 'gm-b-build' }, 'u2'));

  expect(first).toMatchObject({ status: 'committed', count: 4, revision: 1 });
  expect(second).toMatchObject({ status: 'stale', count: 4, currentRevision: 1 });
  expect(mock.update).toHaveBeenCalledTimes(1);
  const written = (segment: string) => mock.set.mock.calls
    .filter(([path]) => String(path).includes(segment)).map(([path]) => path);
  expect(written('/actionAudits/')).toEqual(['sessions/s1/actionAudits/gm-a-build']);
  expect(written('/actionAuditDetails/')).toEqual(['sessions/s1/actionAuditDetails/gm-a-build']);
  expect(mock.audits['sessions/s1/actionAudits/gm-a-build']).toMatchObject({
    actorUid: 'u1', redactionPolicy: 'action-audit-metadata-only-v1',
  });
  expect(mock.audits['sessions/s1/actionAudits/gm-a-build']).not.toHaveProperty('count');
});
