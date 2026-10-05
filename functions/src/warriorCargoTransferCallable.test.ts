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
  const create = vi.fn((target: { path: string }, fields: Fields) => {
    if (documents.has(target.path)) throw new Error('Audit already exists.');
    documents.set(target.path, { ...fields });
  });
  const update = vi.fn(writePath);
  const set = vi.fn((target: { path: string }, fields: Fields) => {
    documents.set(target.path, { ...fields });
  });
  const db = {
    doc: ref,
    collection,
    runTransaction: vi.fn(async (callback: (tx: unknown) => unknown) =>
      callback({ get, update, set, create })),
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

import * as cargoCallables from './baseCapybaraCargoTransferCallable';
const transfer = () => (cargoCallables as unknown as Record<string, {run(request: unknown): Promise<unknown>}>).transferWarriorCargo;

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
    turnPhase: {
      turn: 4,
      teamPhaseEndsAt: '2099-09-24T12:00:00.000Z',
      openAirspaceEndsAt: '2099-09-24T12:15:00.000Z',
      airspace: { state: 'lifted', tickerActive: true, pressAccess: true },
    },
    expansion: 'none', capybaraEnabled: false,
    activeVesselIds: ['aegis'],
    smallShipStates: {
      'warrior': {
        ...emptySmallShipState('warrior', 'aegis'), dockingRevision: 2,
      },
    },
    shipResources: {
      aegis: { ore: 7, fuel: 6, food: 5, water: 4, materials: 3, securityTeams: 2 },
    },
    shipDamage: { aegis: { damagedSystemIds: [], destroyed: false } },
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
    replacementRoleId: 'warrior-captain', activeConsoleRoleId: null, seatId: null,
  });
  put('sessions/s1/players/other', {
    sessionId: 's1', role: 'player', connected: true,
    replacementRoleId: null, activeConsoleRoleId: null,
  });
});


it('moves Warrior cargo atomically with its current host and independent ledger, then recovers the exact receipt', async () => {
  mock.documents.get('sessions/s1')!.baseCapybaraCargo = { unrelated: 'preserved' };
  expect(transfer()).toBeDefined();
  const committed = await transfer().run(request(command));
  expect(committed).toMatchObject({ status: 'committed', cargoRevision: 1 });
  expect(mock.documents.get('sessions/s1')).toMatchObject({
    warriorCargo: { revision: 1, inventory: { materials: 1 } },
    shipResources: { aegis: { materials: 2 } },
    baseCapybaraCargo: { unrelated: 'preserved' },
  });
  const writes = mock.update.mock.calls.length + mock.set.mock.calls.length;
  await expect(transfer().run(request(command))).resolves.toMatchObject({ status: 'replayed' });
  expect(mock.update.mock.calls.length + mock.set.mock.calls.length).toBe(writes);
  await expect(transfer().run(request({ ...command, amount: 2 }))).rejects.toMatchObject({ code: 'failed-precondition' });
  mock.documents.get('sessions/s1/players/captain')!.replacementRoleId = 'vulcan-captain';
  await expect(transfer().run(request(command))).rejects.toMatchObject({ code: 'permission-denied' });
  expect(mock.update.mock.calls.length + mock.set.mock.calls.length).toBe(writes);
});

it('offers request-bound stale cargo recovery without a receipt or ledger write', async () => {
  mock.documents.get('sessions/s1')!.warriorCargo = {
    revision: 2, inventory: { securityTeams: 0, ore: 0, fuel: 0, food: 0, water: 0, materials: 1 },
  };
  expect(transfer()).toBeDefined();
  await expect(transfer().run(request(command))).resolves.toMatchObject({
    status: 'stale', requestId: command.requestId, currentCargoRevision: 2, currentHostShipId: 'aegis',
  });
  expect(mock.update).not.toHaveBeenCalled();
  expect(mock.set).not.toHaveBeenCalled();
});

it.each([
  ['Team', (s: Fields) => { (s.turnPhase as Fields).airspace = { state: 'restricted', tickerActive: true, pressAccess: false }; }],
  ['changed dock', (s: Fields) => { ((s.smallShipStates as Fields).warrior as Fields).dockingRevision = 3; }],
  ['malformed cargo', (s: Fields) => { s.warriorCargo = { revision: 0, inventory: {} }; }],
  ['destroyed host', (s: Fields) => { (s.shipDamage as Fields).aegis = { damagedSystemIds: [], destroyed: true }; }],
  ['mutiny', (s: Fields) => { Object.assign((s.smallShipStates as Fields).warrior as Fields, { unrest: 8, mutiny: { status: 'active', revision: 1, triggerUnrest: 8, triggeredAt: 'now' } }); }],
  ['settled craft', (s: Fields) => { s.candidateVesselOutcomes = { warrior: {code: 'O', groupId: 'fleet-1', shipId: 'warrior', sourceId: 'o1', cycle: 4, outcome: 'settled'} }; }],
])('rejects %s with zero writes', async (_label, change) => {
  expect(transfer()).toBeDefined();
  change(mock.documents.get('sessions/s1')!);
  await expect(transfer().run(request(command))).rejects.toMatchObject({ code: 'failed-precondition' });
  expect(mock.update).not.toHaveBeenCalled();
  expect(mock.set).not.toHaveBeenCalled();
});

it('rejects foreign and ambiguous current ownership even for a saved receipt', async () => {
  expect(transfer()).toBeDefined();
  await expect(transfer().run(request(command, 'other'))).rejects.toMatchObject({ code: 'permission-denied' });
  Object.assign(mock.documents.get('sessions/s1/players/other')!, { replacementRoleId: 'warrior-captain' });
  await expect(transfer().run(request(command))).rejects.toMatchObject({ code: 'failed-precondition' });
  expect(mock.update).not.toHaveBeenCalled();
});

it('accepts manual Coordination without an expired wall-clock bypass in ordinary timed games', async () => {
  expect(transfer()).toBeDefined();
  const phase = mock.documents.get('sessions/s1')!.turnPhase as Fields;
  phase.teamPhaseEndsAt = '2020-01-01T00:00:00.000Z';
  phase.openAirspaceEndsAt = '2020-01-01T00:01:00.000Z';
  await expect(transfer().run(request(command))).rejects.toMatchObject({ code: 'failed-precondition' });
  phase.progression = 'manual';
  await expect(transfer().run(request(command))).resolves.toMatchObject({ status: 'committed' });
});

it('accepts ordinary source-authorized resolved mutiny state and preserves its recovery history', async () => {
  expect(transfer()).toBeDefined();
  const s=mock.documents.get('sessions/s1')!;
  const state=(s.smallShipStates as Fields).warrior as Fields;
  state.unrest=5;
  state.mutiny={status:'resolved',revision:1,triggerUnrest:8,triggeredAt:'earlier',reduction:3,recoveryRequestId:'r1',recoveredAt:'now'};
  const before=structuredClone(s.smallShipStates);
  await expect(transfer().run(request(command))).resolves.toMatchObject({status:'committed'});
  expect(mock.documents.get('sessions/s1')!.smallShipStates).toEqual(before);
});
it('rejects client-supplied outcomes and foreign craft fields before transaction writes', async () => {
  expect(transfer()).toBeDefined();
  for(const patch of [{smallShipId:'capybara-small'},{rolls:[6]},{actorUid:'captain'}]) {
    await expect(transfer().run(request({...command,...patch}))).rejects.toMatchObject({code:'invalid-argument'});
  }
  expect(mock.update).not.toHaveBeenCalled();
  expect(mock.set).not.toHaveBeenCalled();
});
