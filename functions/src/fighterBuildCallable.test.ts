import { beforeEach, expect, it, vi } from 'vitest';
import type { CallableRequest } from 'firebase-functions/v2/https';

const mock = vi.hoisted(() => ({
  get: vi.fn(), update: vi.fn(), set: vi.fn(), role: 'player', activeRole: 'wing-commander' as string | undefined,
  owner: 'u1', connected: true,
  players: [] as Array<Record<string, unknown>>,
  session: {} as Record<string, unknown>,
  receipts: {} as Record<string, Record<string, unknown>>,
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
  mock.get.mockReset();
  mock.update.mockReset();
  mock.set.mockReset();
  mock.get.mockImplementation(async (path: string) => {
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
