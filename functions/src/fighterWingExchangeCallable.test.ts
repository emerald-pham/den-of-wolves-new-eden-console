import { beforeEach, expect, it, vi } from 'vitest';
import type { CallableRequest } from 'firebase-functions/v2/https';

type Fields = Record<string, unknown>;

const mock = vi.hoisted(() => {
  const documents = new Map<string, Fields>();
  const ref = (path: string) => ({ path, id: path.split('/').at(-1) ?? '' });
  const snapshot = (path: string) => {
    const fields = documents.get(path);
    return {
      exists: fields !== undefined,
      id: path.split('/').at(-1) ?? '',
      ref: ref(path),
      get: (field: string) => fields?.[field],
      data: () => fields,
    };
  };
  let tail = Promise.resolve();
  const update = vi.fn((target: { path: string }, fields: Fields) => {
    const current = { ...(documents.get(target.path) ?? {}) };
    for (const [path, value] of Object.entries(fields)) {
      const parts = path.split('.');
      if (parts.length === 1) current[path] = value;
      else {
        let cursor = current;
        for (const part of parts.slice(0, -1)) {
          cursor[part] = typeof cursor[part] === 'object' && cursor[part] !== null
            ? { ...cursor[part] as Fields } : {};
          cursor = cursor[part] as Fields;
        }
        cursor[parts.at(-1)!] = value;
      }
    }
    documents.set(target.path, current);
  });
  const create = vi.fn((target: { path: string }, fields: Fields) => {
    if (documents.has(target.path)) throw new Error('document already exists');
    documents.set(target.path, { ...fields });
  });
  const runTransaction = vi.fn(async (callback: (tx: unknown) => unknown) => {
    let release!: () => void;
    const previous = tail;
    tail = new Promise<void>((resolve) => { release = resolve; });
    await previous;
    const updates: Array<readonly [{ path: string }, Fields]> = [];
    const creates: Array<readonly [{ path: string }, Fields]> = [];
    const tx = {
      get: async (target: { path: string }) => snapshot(target.path),
      update: (target: { path: string }, fields: Fields) => updates.push([target, fields]),
      create: (target: { path: string }, fields: Fields) => creates.push([target, fields]),
    };
    try {
      const result = await callback(tx);
      for (const [target, fields] of updates) update(target, fields);
      for (const [target, fields] of creates) create(target, fields);
      return result;
    } finally {
      release();
    }
  });
  return {
    documents, update, create, runTransaction, reset() { tail = Promise.resolve(); },
    db: { doc: ref, runTransaction },
  };
});

vi.mock('firebase-admin/firestore', () => ({
  getFirestore: () => mock.db,
  FieldValue: { serverTimestamp: () => 'server-time' },
  Timestamp: class MockTimestamp {
    constructor(private readonly value: Date) {}
    toDate() { return this.value; }
  },
}));
vi.mock('firebase-functions/v2/https', () => ({
  HttpsError: class HttpsError extends Error {
    constructor(readonly code: string, message: string, readonly details?: unknown) { super(message); }
  },
  onCall: (optionsOrHandler: unknown, maybeHandler?: (request: unknown) => unknown) => ({ run: maybeHandler ?? optionsOrHandler }),
}));

import { exchangeAegisFighterWings } from './fighterWingExchangeCallable';

const command = {
  sessionId: 's1', requestId: 'exchange-1', sourceWingId: 'fighter-wing-alpha', amount: 1,
  expectedTurn: 2, expectedAlphaRevision: 4, expectedBravoRevision: 7,
};

function request(data: Fields = command, uid = 'wing') {
  return { data, auth: { uid } } as CallableRequest<Fields>;
}

function put(path: string, fields: Fields): void {
  mock.documents.set(path, structuredClone(fields));
}

function currentCounts() {
  return mock.documents.get('sessions/s1')!.fighterWingCounts as Record<string, { count: number; revision: number }>;
}

beforeEach(() => {
  mock.documents.clear();
  mock.update.mockClear();
  mock.create.mockClear();
  mock.runTransaction.mockClear();
  mock.reset();
  const now = Date.now();
  put('sessions/s1', {
    phase: 'active', currentTurn: 2, playerCount: 10,
    activeRoleIds: ['wing-commander'], activeVesselIds: ['aegis'],
    turnPhase: {
      turn: 2,
      teamPhaseEndsAt: new Date(now + 60_000).toISOString(),
      openAirspaceEndsAt: new Date(now + 120_000).toISOString(),
      airspace: { state: 'restricted', tickerActive: true, pressAccess: false },
    },
    shipUpgrades: { aegis: [] },
    fighterWingCounts: {
      'fighter-wing-alpha': { count: 3, revision: 4 },
      'fighter-wing-bravo': { count: 2, revision: 7 },
    },
  });
  put('sessions/s1/players/wing', {
    role: 'player', connected: true, assignedRoleId: 'wing-commander', seatId: 'wing-commander',
    activeConsoleRoleId: 'wing-commander', fleetGroupId: 'fleet-1',
  });
});

it('commits both counts atomically, conserves survivors, and exact replay adds no fighter', async () => {
  const result = await exchangeAegisFighterWings.run(request());
  expect(result).toMatchObject({
    status: 'committed', sourceWingId: 'fighter-wing-alpha', amount: 1, turn: 2, capacity: 4,
    counts: {
      'fighter-wing-alpha': { count: 2, revision: 5 },
      'fighter-wing-bravo': { count: 3, revision: 8 },
    },
  });
  expect(currentCounts()['fighter-wing-alpha']!.count + currentCounts()['fighter-wing-bravo']!.count).toBe(5);
  const writes = mock.update.mock.calls.length + mock.create.mock.calls.length;
  await expect(exchangeAegisFighterWings.run(request())).resolves.toMatchObject({ status: 'replayed' });
  expect(mock.update.mock.calls.length + mock.create.mock.calls.length).toBe(writes);
  expect(currentCounts()).toMatchObject({
    'fighter-wing-alpha': { count: 2, revision: 5 },
    'fighter-wing-bravo': { count: 3, revision: 8 },
  });
});

it('denies a wrong role, wrong phase, stale pair, and foreign or colliding receipt without changing counts', async () => {
  const session = mock.documents.get('sessions/s1')!;
  const actor = mock.documents.get('sessions/s1/players/wing')!;
  actor.activeConsoleRoleId = 'admiral';
  await expect(exchangeAegisFighterWings.run(request())).rejects.toMatchObject({ code: 'permission-denied' });
  actor.activeConsoleRoleId = 'wing-commander';
  session.turnPhase = { ...(session.turnPhase as Fields), airspace: { state: 'lifted', tickerActive: true, pressAccess: false } };
  await expect(exchangeAegisFighterWings.run(request({ ...command, requestId: 'wrong-phase' })))
    .rejects.toMatchObject({ code: 'failed-precondition' });
  session.turnPhase = {
    turn: 2, teamPhaseEndsAt: new Date(Date.now() + 60_000).toISOString(),
    openAirspaceEndsAt: new Date(Date.now() + 120_000).toISOString(),
    airspace: { state: 'restricted', tickerActive: true, pressAccess: false },
  };
  await expect(exchangeAegisFighterWings.run(request({ ...command, requestId: 'stale', expectedAlphaRevision: 3 })))
    .rejects.toMatchObject({ code: 'failed-precondition' });
  await exchangeAegisFighterWings.run(request());
  await expect(exchangeAegisFighterWings.run(request(command, 'intruder')))
    .rejects.toMatchObject({ code: 'permission-denied' });
  await expect(exchangeAegisFighterWings.run(request({ ...command, amount: 2 })))
    .rejects.toMatchObject({ code: 'failed-precondition' });
  expect(currentCounts()).toMatchObject({
    'fighter-wing-alpha': { count: 2, revision: 5 },
    'fighter-wing-bravo': { count: 3, revision: 8 },
  });
});

it('enforces standard and upgraded capacity while allowing only surviving source fighters', async () => {
  const session = mock.documents.get('sessions/s1')!;
  session.fighterWingCounts = {
    'fighter-wing-alpha': { count: 1, revision: 4 },
    'fighter-wing-bravo': { count: 4, revision: 7 },
  };
  await expect(exchangeAegisFighterWings.run(request())).rejects.toMatchObject({ code: 'failed-precondition' });
  session.shipUpgrades = { aegis: ['construction-bay'] };
  session.fighterWingCounts = {
    'fighter-wing-alpha': { count: 1, revision: 4 },
    'fighter-wing-bravo': { count: 5, revision: 7 },
  };
  await expect(exchangeAegisFighterWings.run(request())).resolves.toMatchObject({
    capacity: 6,
    counts: {
      'fighter-wing-alpha': { count: 0, revision: 5 },
      'fighter-wing-bravo': { count: 6, revision: 8 },
    },
  });
  await expect(exchangeAegisFighterWings.run(request({ ...command, requestId: 'empty-source', expectedAlphaRevision: 5, expectedBravoRevision: 8 })))
    .rejects.toMatchObject({ code: 'failed-precondition' });
});

it('allows only one concurrent exchange from the same displayed pair of revisions', async () => {
  const results = await Promise.allSettled([
    exchangeAegisFighterWings.run(request()),
    exchangeAegisFighterWings.run(request({ ...command, requestId: 'exchange-race-2' })),
  ]);
  expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
  expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
  expect(currentCounts()['fighter-wing-alpha']!.count + currentCounts()['fighter-wing-bravo']!.count).toBe(5);
  expect(currentCounts()['fighter-wing-alpha']!.revision).toBe(5);
  expect(currentCounts()['fighter-wing-bravo']!.revision).toBe(8);
});
