import { beforeEach, expect, it, vi } from 'vitest';
import type { CallableRequest } from 'firebase-functions/v2/https';
import { emptySmallShipState } from './smallShip';

type Fields = Record<string, unknown>;

const mock = vi.hoisted(() => {
  const documents = new Map<string, Fields>();
  const ref = (path: string) => ({ path });
  const collection = (path: string) => ({ path, collection: true });
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
  const get = vi.fn(async (target: { path: string; collection?: boolean }) => {
    if (target.collection) {
      const prefix = `${target.path}/`;
      const docs = [...documents.keys()]
        .filter((path) => path.startsWith(prefix) && !path.slice(prefix.length).includes('/'))
        .map(snapshot);
      return { docs, size: docs.length };
    }
    return snapshot(target.path);
  });
  const writePath = (target: { path: string }, fields: Fields) => {
    const current = { ...(documents.get(target.path) ?? {}) };
    for (const [dottedPath, value] of Object.entries(fields)) {
      const path = dottedPath.split('.');
      let cursor = current;
      for (const part of path.slice(0, -1)) {
        const nested = cursor[part];
        cursor[part] = typeof nested === 'object' && nested !== null && !Array.isArray(nested)
          ? { ...(nested as Fields) } : {};
        cursor = cursor[part] as Fields;
      }
      cursor[path.at(-1)!] = value;
    }
    documents.set(target.path, current);
  };
  const update = vi.fn(writePath);
  const set = vi.fn((target: { path: string }, fields: Fields) => {
    documents.set(target.path, { ...fields });
  });
  const db = {
    doc: ref,
    collection,
    runTransaction: vi.fn(async (callback: (tx: unknown) => unknown) =>
      callback({ get, update, set })),
  };
  return { documents, get, update, set, db };
});

vi.mock('firebase-admin/app', () => ({ initializeApp: vi.fn() }));
vi.mock('firebase-admin/firestore', () => ({
  getFirestore: () => mock.db,
  FieldValue: { serverTimestamp: () => 'server-time' },
  Timestamp: class MockTimestamp {
    constructor(private readonly value: Date) {}
    static now() { return new MockTimestamp(new Date()); }
    toDate() { return this.value; }
  },
}));
vi.mock('firebase-functions/v2/https', () => ({
  HttpsError: class HttpsError extends Error {
    constructor(readonly code: string, message: string) { super(message); }
  },
  onCall: (_options: unknown, handler: (request: unknown) => unknown) => ({ run: handler }),
}));

import { transferBaseCapybaraCargo } from './baseCapybaraCargoTransferCallable';

const command = {
  sessionId: 's1', requestId: 'cargo-1', expectedCycle: 4, expectedRevision: 0,
  expectedHostShipId: 'aegis', expectedDockingRevision: 2,
  resourceId: 'materials', direction: 'load', amount: 1,
};
const request = (data: Fields, uid = 'captain') =>
  ({ data, auth: { uid } }) as CallableRequest<Fields>;
const put = (path: string, fields: Fields) => mock.documents.set(path, { ...fields });

function session(): Fields {
  return {
    phase: 'active', currentTurn: 4,
    turnPhase: { turn: 4, airspace: { state: 'lifted' } },
    expansion: 'base', capybaraEnabled: true,
    activeVesselIds: ['aegis', 'capybara-small'],
    smallShipStates: {
      'capybara-small': {
        ...emptySmallShipState('capybara-small', 'aegis'), dockingRevision: 2,
      },
    },
    shipResources: {
      aegis: { ore: 7, fuel: 6, food: 5, water: 4, materials: 3, securityTeams: 2 },
    },
  };
}

beforeEach(() => {
  mock.documents.clear();
  mock.get.mockClear();
  mock.update.mockClear();
  mock.set.mockClear();
  mock.db.runTransaction.mockClear();
  put('sessions/s1', session());
  put('sessions/s1/players/captain', {
    sessionId: 's1', role: 'player', connected: true,
    replacementRoleId: 'capybara-small-captain', activeConsoleRoleId: null,
  });
  put('sessions/s1/players/other', {
    sessionId: 's1', role: 'player', connected: true,
    replacementRoleId: null, activeConsoleRoleId: null,
  });
});

it('moves one legal cargo type atomically between the docked host and base Capybara', async () => {
  await expect(transferBaseCapybaraCargo.run(request(command))).resolves.toEqual({
    status: 'committed', sessionId: 's1', requestId: 'cargo-1', cycle: 4,
    hostShipId: 'aegis', resourceId: 'materials', direction: 'load', amount: 1,
    cargoRevision: 1,
  });

  expect(mock.documents.get('sessions/s1')).toMatchObject({
    baseCapybaraCargo: {
      revision: 1,
      inventory: { securityTeams: 0, ore: 0, fuel: 0, food: 0, water: 0, materials: 1 },
    },
    shipResources: { aegis: { materials: 2 } },
  });
  expect(mock.update).toHaveBeenCalledTimes(1);
  expect(mock.set).toHaveBeenCalledTimes(1);
  expect(mock.set).toHaveBeenCalledWith(
    { path: 'sessions/s1/commandReceipts/cargo-1' }, expect.objectContaining({
      fingerprint: expect.objectContaining({ action: 'transfer-base-capybara-cargo', actorUid: 'captain' }),
      result: expect.objectContaining({ status: 'committed', cargoRevision: 1 }),
    }),
  );
  expect([...mock.documents.keys()].some((path) => path.includes('/events/'))).toBe(false);
});

it('unloads only held cargo to the current host and replays without a second write', async () => {
  const seededSession = mock.documents.get('sessions/s1')!;
  seededSession.baseCapybaraCargo = {
    revision: 8,
    inventory: { securityTeams: 0, ore: 0, fuel: 0, food: 0, water: 0, materials: 3 },
  };
  const unload = { ...command, requestId: 'cargo-unload', expectedRevision: 8, direction: 'unload', amount: 2 };
  const committed = await transferBaseCapybaraCargo.run(request(unload)) as Fields;
  expect(committed).toMatchObject({ status: 'committed', cargoRevision: 9, hostShipId: 'aegis' });
  expect(mock.documents.get('sessions/s1')).toMatchObject({
    baseCapybaraCargo: { revision: 9, inventory: { materials: 1 } },
    shipResources: { aegis: { materials: 5 } },
  });

  const writes = mock.update.mock.calls.length + mock.set.mock.calls.length;
  const currentSession = mock.documents.get('sessions/s1')!;
  currentSession.phase = 'debrief';
  currentSession.turnPhase = undefined;
  currentSession.smallShipStates = {};
  await expect(transferBaseCapybaraCargo.run(request(unload))).resolves.toMatchObject({ status: 'replayed' });
  expect(mock.update.mock.calls.length + mock.set.mock.calls.length).toBe(writes);
});

it.each([
  ['non-player', { role: 'gm' }],
  ['disconnected player', { connected: false }],
  ['historical Captain', { replacementRoleId: 'gorgoneion-captain' }],
  ['conflicting active console', { activeConsoleRoleId: 'admiral' }],
] as const)('denies a %s before any ledger write', async (_label, patch) => {
  Object.assign(mock.documents.get('sessions/s1/players/captain')!, patch);
  await expect(transferBaseCapybaraCargo.run(request(command))).rejects.toMatchObject({
    code: 'permission-denied',
  });
  expect(mock.update).not.toHaveBeenCalled();
  expect(mock.set).not.toHaveBeenCalled();
});

it('fails closed if duplicate replacement-role custody exists', async () => {
  put('sessions/s1/players/second-captain', {
    sessionId: 's1', role: 'player', connected: true,
    replacementRoleId: 'capybara-small-captain', activeConsoleRoleId: null,
  });
  await expect(transferBaseCapybaraCargo.run(request(command))).rejects.toMatchObject({
    code: 'failed-precondition',
  });
  expect(mock.update).not.toHaveBeenCalled();
  expect(mock.set).not.toHaveBeenCalled();
});

it.each([
  ['inactive session', (stored: Fields) => { stored.phase = 'debrief'; }],
  ['wrong mode', (stored: Fields) => { stored.expansion = 'capybara'; }],
  ['disabled base Capybara', (stored: Fields) => { stored.capybaraEnabled = false; }],
  ['unknown mode', (stored: Fields) => { delete stored.expansion; }],
  ['Team phase', (stored: Fields) => { stored.turnPhase = { turn: 4, airspace: { state: 'restricted' } }; }],
  ['unknown phase', (stored: Fields) => { delete stored.turnPhase; }],
  ['stale cycle', (stored: Fields) => { stored.currentTurn = 5; }],
  ['old request cycle', (stored: Fields) => {
    stored.currentTurn = 5;
    stored.turnPhase = { turn: 5, airspace: { state: 'lifted' } };
  }],
  ['inactive host vessel', (stored: Fields) => { stored.activeVesselIds = ['dione', 'capybara-small']; }],
  ['mixed expansion ship', (stored: Fields) => { stored.activeVesselIds = ['aegis', 'capybara-small', 'capybara']; }],
  ['malformed active-vessel list', (stored: Fields) => { stored.activeVesselIds = ['aegis', 'rogue']; }],
  ['undocked small ship', (stored: Fields) => {
    stored.smallShipStates = { 'capybara-small': emptySmallShipState('capybara-small') };
  }],
  ['stale dock expectation', (stored: Fields) => {
    (stored.smallShipStates as Fields)['capybara-small'] = {
      ...(stored.smallShipStates as Fields)['capybara-small'] as Fields,
      dockingRevision: 3,
    };
  }],
  ['missing host inventory', (stored: Fields) => { stored.shipResources = {}; }],
  ['malformed host inventory', (stored: Fields) => {
    (stored.shipResources as Fields).aegis = { ore: 7, fuel: 6, food: 5, water: 4, materials: 3, securityTeams: 2, scrap: 0 };
  }],
] as const)('rejects %s before mutation', async (_label, change) => {
  change(mock.documents.get('sessions/s1')!);
  await expect(transferBaseCapybaraCargo.run(request(command))).rejects.toMatchObject({
    code: 'failed-precondition',
  });
  expect(mock.update).not.toHaveBeenCalled();
  expect(mock.set).not.toHaveBeenCalled();
});

it('rejects stale revisions and overdraw without persisting a partial ledger', async () => {
  await expect(transferBaseCapybaraCargo.run(request({ ...command, requestId: 'stale', expectedRevision: 1 })))
    .rejects.toMatchObject({ code: 'failed-precondition' });
  await expect(transferBaseCapybaraCargo.run(request({ ...command, requestId: 'overdraw', amount: 4 })))
    .rejects.toMatchObject({ code: 'failed-precondition' });
  expect(mock.update).not.toHaveBeenCalled();
  expect(mock.set).not.toHaveBeenCalled();
});

it('rejects cross-actor and payload collisions without exposing a result', async () => {
  await transferBaseCapybaraCargo.run(request(command));
  const changed = { ...command, direction: 'unload', amount: 1 };
  await expect(transferBaseCapybaraCargo.run(request(changed))).rejects.toMatchObject({
    code: 'failed-precondition',
  });
  await expect(transferBaseCapybaraCargo.run(request(command, 'other'))).rejects.toMatchObject({
    code: 'permission-denied',
  });
  const writes = mock.update.mock.calls.length + mock.set.mock.calls.length;
  expect(writes).toBe(2);
});

it('fails closed on an existing malformed shared command receipt', async () => {
  put('sessions/s1/commandReceipts/cargo-1', { fingerprint: 'malformed', result: { secret: true } });
  await expect(transferBaseCapybaraCargo.run(request(command))).rejects.toMatchObject({
    code: 'failed-precondition',
  });
  expect(mock.update).not.toHaveBeenCalled();
  expect(mock.set).not.toHaveBeenCalled();
});

it('fails closed when a matching receipt contains a result for a different transfer', async () => {
  await transferBaseCapybaraCargo.run(request(command));
  const receipt = mock.documents.get('sessions/s1/commandReceipts/cargo-1')!;
  (receipt.result as Fields).amount = 2;
  const writes = mock.update.mock.calls.length + mock.set.mock.calls.length;
  await expect(transferBaseCapybaraCargo.run(request(command))).rejects.toMatchObject({
    code: 'failed-precondition',
  });
  expect(mock.update.mock.calls.length + mock.set.mock.calls.length).toBe(writes);
});

it.each([
  ['unknown resource', { resourceId: 'scrap' }],
  ['fractional amount', { amount: 1.5 }],
  ['zero amount', { amount: 0 }],
  ['invalid direction', { direction: 'sideways' }],
  ['invalid docking revision', { expectedDockingRevision: -1 }],
] as const)('rejects %s before starting a transaction', async (_label, patch) => {
  await expect(transferBaseCapybaraCargo.run(request({ ...command, ...patch }))).rejects.toMatchObject({
    code: 'invalid-argument',
  });
  expect(mock.db.runTransaction).not.toHaveBeenCalled();
});
