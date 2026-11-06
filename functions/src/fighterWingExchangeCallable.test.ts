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

import { exchangeAegisFighterWings } from './index';

function request(data: Record<string, unknown>, uid = 'u1') {
  return { data, auth: { uid } } as CallableRequest<Record<string, unknown>>;
}

const base = {
  sessionId: 's1', requestId: 'exchange-1', sourceWingId: 'fighter-wing-alpha', amount: 2,
  expectedAlphaRevision: 2, expectedBravoRevision: 5,
};

function snapshot(fields: Record<string, unknown>, id = 'u1') {
  return { exists: true, id, get: (key: string) => fields[key] };
}

function teamPhase(overrides: Record<string, unknown> = {}) {
  return {
    turn: 2,
    teamPhaseEndsAt: new Date(Date.now() + 5 * 60_000).toISOString(),
    openAirspaceEndsAt: new Date(Date.now() + 20 * 60_000).toISOString(),
    airspace: { state: 'restricted', tickerActive: true, pressAccess: false },
    ...overrides,
  };
}

/** Persist the last receipt write so the next run sees it, as Firestore would. */
function keepLastReceipt() {
  const [path, receipt] = mock.set.mock.calls.at(-1) as [string, Record<string, unknown>];
  mock.receipts[path] = receipt;
  mock.update.mockReset();
  mock.set.mockReset();
}

beforeEach(() => {
  mock.role = 'player';
  mock.activeRole = 'wing-commander';
  mock.owner = 'u1';
  mock.connected = true;
  mock.players = [];
  mock.session = {
    activeVesselIds: ['aegis'], activeRoleIds: ['admiral', 'wing-commander'], phase: 'active', currentTurn: 2,
    turnPhase: teamPhase(),
    shipUpgrades: { aegis: [] },
    shipDamage: { aegis: { damagedSystemIds: [], destroyed: false } },
    fighterWingCounts: {
      'fighter-wing-alpha': { count: 4, revision: 2 },
      'fighter-wing-bravo': { count: 1, revision: 5 },
    },
    vesselActionRevisions: { aegis: 7 },
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
      return snapshot({ role: mock.role, connected: mock.connected, activeConsoleRoleId: mock.activeRole },
        path.split('/').at(-1));
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

it('moves fighters between wings once, bumping both wing revisions and keeping the result in a private receipt', async () => {
  const result = await exchangeAegisFighterWings.run(request(base));
  expect(result).toEqual({
    status: 'committed', sessionId: 's1', requestId: 'exchange-1',
    sourceWingId: 'fighter-wing-alpha', targetWingId: 'fighter-wing-bravo', amount: 2, capacity: 4, turn: 2,
    counts: {
      'fighter-wing-alpha': { count: 2, revision: 3 },
      'fighter-wing-bravo': { count: 3, revision: 6 },
    },
  });
  expect(mock.update).toHaveBeenCalledTimes(1);
  expect(mock.update).toHaveBeenCalledWith('sessions/s1', {
    'fighterWingCounts.fighter-wing-alpha': { count: 2, revision: 3 },
    'fighterWingCounts.fighter-wing-bravo': { count: 3, revision: 6 },
    updatedAt: 'server-time',
  });
  // The only other write is the server-only command receipt: no public event or audit fan-out.
  expect(mock.set).toHaveBeenCalledTimes(1);
  expect(mock.set).toHaveBeenCalledWith('sessions/s1/commandReceipts/exchange-1', expect.objectContaining({
    result, fingerprint: expect.objectContaining({ actorUid: 'u1', action: 'fighter-wing-exchange' }),
  }));
});

it('moves fighters from Bravo into Alpha', async () => {
  mock.session.fighterWingCounts = {
    'fighter-wing-alpha': { count: 1, revision: 2 },
    'fighter-wing-bravo': { count: 3, revision: 5 },
  };
  await expect(exchangeAegisFighterWings.run(request({ ...base, sourceWingId: 'fighter-wing-bravo', amount: 3 })))
    .resolves.toMatchObject({
      status: 'committed', sourceWingId: 'fighter-wing-bravo', targetWingId: 'fighter-wing-alpha',
      counts: {
        'fighter-wing-alpha': { count: 4, revision: 3 },
        'fighter-wing-bravo': { count: 0, revision: 6 },
      },
    });
});

it('replays a retried request exactly instead of moving fighters a second time', async () => {
  const first = await exchangeAegisFighterWings.run(request(base));
  keepLastReceipt();
  // Firestore now holds the committed counts; the retry carries the original expectations.
  mock.session.fighterWingCounts = first.counts;
  await expect(exchangeAegisFighterWings.run(request(base))).resolves.toEqual(first);
  expect(mock.update).not.toHaveBeenCalled();
  expect(mock.set).not.toHaveBeenCalled();
});

it('rejects a reused request id bound to a different exchange', async () => {
  await exchangeAegisFighterWings.run(request(base));
  keepLastReceipt();
  await expect(exchangeAegisFighterWings.run(request({ ...base, amount: 1 })))
    .rejects.toMatchObject({ code: 'failed-precondition' });
  expect(mock.update).not.toHaveBeenCalled();
});

it('returns a stale result without moving fighters when either wing changed, and only one of two racing exchanges commits', async () => {
  await expect(exchangeAegisFighterWings.run(request({ ...base, expectedBravoRevision: 4 }))).resolves.toMatchObject({
    status: 'stale',
    counts: {
      'fighter-wing-alpha': { count: 4, revision: 2 },
      'fighter-wing-bravo': { count: 1, revision: 5 },
    },
  });
  expect(mock.update).not.toHaveBeenCalled();

  const first = await exchangeAegisFighterWings.run(request({ ...base, requestId: 'race-a' }));
  mock.session.fighterWingCounts = first.counts;
  mock.update.mockReset();
  await expect(exchangeAegisFighterWings.run(request({ ...base, requestId: 'race-b', amount: 1 })))
    .resolves.toMatchObject({ status: 'stale' });
  expect(mock.update).not.toHaveBeenCalled();
});

it('rejects other consoles, disconnected Wing Commanders and another player replaying the request', async () => {
  for (const [index, activeRole] of ['admiral', 'quellon-explorer'].entries()) {
    mock.activeRole = activeRole;
    await expect(exchangeAegisFighterWings.run(request({ ...base, requestId: `exchange-role-${index}` })))
      .rejects.toMatchObject({ code: 'permission-denied' });
  }
  mock.activeRole = 'wing-commander';
  mock.connected = false;
  await expect(exchangeAegisFighterWings.run(request({ ...base, requestId: 'exchange-offline' })))
    .rejects.toMatchObject({ code: 'permission-denied' });
  expect(mock.update).not.toHaveBeenCalled();
  expect(mock.set).not.toHaveBeenCalled();

  mock.connected = true;
  await exchangeAegisFighterWings.run(request(base));
  keepLastReceipt();
  await expect(exchangeAegisFighterWings.run(request(base, 'u2'))).rejects.toMatchObject({ code: 'permission-denied' });
  expect(mock.update).not.toHaveBeenCalled();
});

it('permits a live GM instance holding AEGIS write access', async () => {
  mock.role = 'gm';
  mock.activeRole = undefined;
  await expect(exchangeAegisFighterWings.run(request({ ...base, instanceId: 'gm-1' })))
    .resolves.toMatchObject({ status: 'committed' });
  mock.update.mockReset();
  await expect(exchangeAegisFighterWings.run(request({ ...base, requestId: 'gm-no-instance' })))
    .rejects.toMatchObject({ code: 'permission-denied' });
  expect(mock.update).not.toHaveBeenCalled();
});

it('is available only during the running Team Phase of the current cycle', async () => {
  const closed = [
    teamPhase({ airspace: { state: 'lifted', tickerActive: true, pressAccess: true } }),
    teamPhase({ timerPause: { window: 'restricted', remainingMs: 60_000, pausedAt: new Date().toISOString() } }),
    teamPhase({ turn: 1 }),
  ];
  for (const [index, turnPhase] of closed.entries()) {
    mock.session.turnPhase = turnPhase;
    await expect(exchangeAegisFighterWings.run(request({ ...base, requestId: `exchange-closed-${index}` })))
      .rejects.toMatchObject({ code: 'failed-precondition' });
  }
  mock.session.turnPhase = teamPhase();
  mock.session.phase = 'debrief';
  await expect(exchangeAegisFighterWings.run(request({ ...base, requestId: 'exchange-debrief' })))
    .rejects.toMatchObject({ code: 'failed-precondition' });
  expect(mock.update).not.toHaveBeenCalled();
  expect(mock.set).not.toHaveBeenCalled();
});

it('keeps the destination wing within its 4-fighter capacity and the source within its fighters', async () => {
  await expect(exchangeAegisFighterWings.run(request({ ...base, requestId: 'over-cap', amount: 4 })))
    .rejects.toMatchObject({ code: 'failed-precondition' });
  mock.session.fighterWingCounts = {
    'fighter-wing-alpha': { count: 1, revision: 2 },
    'fighter-wing-bravo': { count: 0, revision: 5 },
  };
  await expect(exchangeAegisFighterWings.run(request({ ...base, requestId: 'over-source', amount: 2 })))
    .rejects.toMatchObject({ code: 'failed-precondition' });
  mock.session.fighterWingCounts = { 'fighter-wing-alpha': { count: 1, revision: 2 } };
  await expect(exchangeAegisFighterWings.run(request({ ...base, requestId: 'missing', amount: 1 })))
    .rejects.toMatchObject({ code: 'failed-precondition' });
  expect(mock.update).not.toHaveBeenCalled();
});

it('allows six fighters in a wing once the Construction Bay is upgraded', async () => {
  mock.session.shipUpgrades = { aegis: ['construction-bay'] };
  mock.session.fighterWingCounts = {
    'fighter-wing-alpha': { count: 2, revision: 2 },
    'fighter-wing-bravo': { count: 4, revision: 5 },
  };
  await expect(exchangeAegisFighterWings.run(request(base))).resolves.toMatchObject({
    status: 'committed', capacity: 6,
    counts: { 'fighter-wing-alpha': { count: 0 }, 'fighter-wing-bravo': { count: 6 } },
  });
  mock.update.mockReset();
  mock.session.fighterWingCounts = {
    'fighter-wing-alpha': { count: 2, revision: 2 },
    'fighter-wing-bravo': { count: 5, revision: 5 },
  };
  await expect(exchangeAegisFighterWings.run(request({ ...base, requestId: 'over-upgraded' })))
    .rejects.toMatchObject({ code: 'failed-precondition' });
  expect(mock.update).not.toHaveBeenCalled();
});

it('rejects malformed requests before reading the session', async () => {
  const malformed = [
    { ...base, amount: 0 },
    { ...base, amount: 7 },
    { ...base, amount: 1.5 },
    { ...base, sourceWingId: 'pdf-escort-wing' },
    { ...base, expectedAlphaRevision: -1 },
    { ...base, expectedBravoRevision: undefined },
    { ...base, extra: true },
  ];
  for (const data of malformed) {
    await expect(exchangeAegisFighterWings.run(request(data))).rejects.toMatchObject({ code: 'invalid-argument' });
  }
  await expect(exchangeAegisFighterWings.run({ data: base } as CallableRequest<Record<string, unknown>>))
    .rejects.toMatchObject({ code: 'unauthenticated' });
  expect(mock.get).not.toHaveBeenCalled();
});
