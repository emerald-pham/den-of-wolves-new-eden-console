import { beforeEach, expect, it, vi } from 'vitest';
import type { CallableRequest } from 'firebase-functions/v2/https';

type Fields = Record<string, unknown>;

const mock = vi.hoisted(() => {
  const documents = new Map<string, Fields>();
  const ref = (path: string, collection = false) => ({ path, id: path.split('/').at(-1) ?? '', collection });
  const snapshot = (target: { path: string; id: string; collection?: boolean }) => {
    if (target.collection) {
      const prefix = `${target.path}/`;
      const docs = [...documents.keys()].flatMap((path) => {
        const remainder = path.startsWith(prefix) ? path.slice(prefix.length) : '';
        if (!remainder || remainder.includes('/')) return [];
        return [snapshot(ref(path))];
      });
      return { exists: true, id: target.id, docs, size: docs.length };
    }
    const fields = documents.get(target.path);
    return {
      exists: fields !== undefined,
      id: target.id,
      ref: ref(target.path),
      data: () => fields,
      get: (field: string) => field.split('.').reduce<unknown>((value, part) =>
        typeof value === 'object' && value !== null ? (value as Fields)[part] : undefined, fields),
    };
  };
  const get = vi.fn(async (target: { path: string; id: string; collection?: boolean }) => snapshot(target));
  const set = vi.fn((target: { path: string }, fields: Fields) => documents.set(target.path, { ...fields }));
  const update = vi.fn((target: { path: string }, fields: Fields) => {
    const current = { ...(documents.get(target.path) ?? {}) };
    for (const [fieldPath, value] of Object.entries(fields)) {
      const path = fieldPath.split('.');
      let cursor = current;
      for (const part of path.slice(0, -1)) {
        cursor[part] = { ...((cursor[part] as Fields | undefined) ?? {}) };
        cursor = cursor[part] as Fields;
      }
      cursor[path.at(-1)!] = value;
    }
    documents.set(target.path, current);
  });
  const db = {
    doc: (path: string) => ref(path),
    collection: (path: string) => ref(path, true),
    runTransaction: (callback: (transaction: unknown) => unknown) => callback({ get, set, update }),
  };
  return { documents, get, set, update, db };
});

vi.mock('firebase-admin/app', () => ({ initializeApp: vi.fn() }));
vi.mock('firebase-admin/firestore', () => ({
  getFirestore: () => mock.db,
  FieldValue: { serverTimestamp: () => 'server-time' },
  Timestamp: class MockTimestamp {
    static now() { return new MockTimestamp(new Date()); }
    constructor(private readonly value: Date) {}
    toDate() { return this.value; }
    toMillis() { return this.value.getTime(); }
  },
}));
vi.mock('firebase-functions/v2/https', () => ({
  HttpsError: class HttpsError extends Error {
    constructor(readonly code: string, message: string) { super(message); }
  },
  onCall: (first: unknown, second?: (request: unknown) => unknown) => ({
    run: typeof first === 'function' ? first : second,
  }),
}));

import { assignReplacementRole, repairGorgoneionWithDrones, setSmallShipDocking } from './index';

function request(data: Fields, uid: string) {
  return { data, auth: { uid } } as CallableRequest<Fields>;
}

function put(path: string, fields: Fields) {
  mock.documents.set(path, { ...fields });
}

beforeEach(() => {
  mock.documents.clear();
  mock.get.mockClear(); mock.set.mockClear(); mock.update.mockClear();
  put('sessions/s1', {
    phase: 'active', currentTurn: 3, setupRevision: 4, configurationLocked: true,
    expansion: 'base', capybaraEnabled: true,
    activeRoleIds: ['admiral'], activeVesselIds: ['aegis'],
    turnPhase: {
      turn: 3,
      teamPhaseEndsAt: '2099-09-21T12:00:00.000Z',
      openAirspaceEndsAt: '2099-09-21T12:15:00.000Z',
      airspace: { state: 'lifted', tickerActive: true, pressAccess: true },
    },
    smallShipStates: {},
    shipResources: {
      aegis: { ore: 0, fuel: 4, food: 8, water: 6, materials: 5, securityTeams: 9 },
    },
    shipDamage: { aegis: { damagedSystemIds: ['reactor', 'storage'], destroyed: false } },
  });
  put('sessions/s1/players/gm-1', { role: 'gm', connected: true });
  put('sessions/s1/players/player-1', {
    role: 'player', connected: true, assignedRoleId: 'admiral', activeConsoleRoleId: 'admiral',
    replacementRoleId: null, seatId: null,
  });
  put('sessions/s1/gmInstances/bridge', { uid: 'gm-1', connected: true, lastSeenAt: new Date() });
  put('sessions/s1/replacementEligibility/player-1', { eligible: true, reason: 'dead', revision: 1 });
});

it('composes GM docking, Captain replacement assignment, and the authorized Repair Drones action', async () => {
  await expect(setSmallShipDocking.run(request({
    sessionId: 's1', smallShipId: 'gorgoneion', hostShipId: 'aegis', docked: true,
    instanceId: 'bridge', requestId: 'dock-gorgoneion', expectedRevision: 0,
  }, 'gm-1'))).resolves.toMatchObject({
    status: 'committed', smallShipId: 'gorgoneion', hostShipId: 'aegis', committedRevision: 1,
  });
  expect(mock.documents.get('sessions/s1')?.activeVesselIds).toEqual(['aegis']);
  expect(mock.documents.get('sessions/s1')?.smallShipStates).toMatchObject({
    gorgoneion: { id: 'gorgoneion', hostShipId: 'aegis', dockingRevision: 1 },
  });

  await expect(assignReplacementRole.run(request({
    sessionId: 's1', instanceId: 'bridge', requestId: 'assign-gorgoneion-captain',
    targetUid: 'player-1', replacementRoleId: 'gorgoneion-captain',
    expectedRevision: 1, expectedSetupRevision: 4,
  }, 'gm-1'))).resolves.toMatchObject({
    status: 'committed', replacementRoleId: 'gorgoneion-captain',
  });
  expect(mock.documents.get('sessions/s1/players/player-1')).toMatchObject({
    replacementRoleId: 'gorgoneion-captain', activeConsoleRoleId: null, seatId: null,
  });
  expect(mock.documents.get('sessions/s1')?.activeVesselIds).toEqual(['aegis']);

  // This is the server-authored completed maintenance state consumed by the
  // action. The maintenance producer and charge transition have focused tests.
  const gorgoneion = mock.documents.get('sessions/s1')?.smallShipStates as Fields;
  const currentState = gorgoneion.gorgoneion as Fields;
  gorgoneion.gorgoneion = {
    ...currentState,
    cycle: {
      step: 0, revision: 6,
      results: { '1': 'rations', '2': 'unrest', '3': 'riot', '4': 'reactor' },
      charges: ['repair-drones'], turn: 3, rationBonus: 0,
      chargingSkipped: false, startedAt: '2026-09-24T01:00:00.000Z',
      completedAt: '2026-09-24T01:05:00.000Z',
    },
  };
  const command = {
    sessionId: 's1', requestId: 'repair-after-admission', expectedCycle: 3,
    expectedRepairRevision: 0, expectedDockingRevision: 1,
    expectedHostShipId: 'aegis', systemId: 'reactor',
  };
  await expect(repairGorgoneionWithDrones.run(request(command, 'player-1'))).resolves.toMatchObject({
    status: 'committed', hostShipId: 'aegis', systemId: 'reactor',
    materialsSpent: 3, materialsRemaining: 2, repairRevision: 1,
  });
  expect(mock.documents.get('sessions/s1')?.activeVesselIds).toEqual(['aegis']);
  expect(mock.documents.get('sessions/s1')?.shipResources).toMatchObject({ aegis: { materials: 2 } });
  expect(mock.documents.get('sessions/s1')?.shipDamage).toMatchObject({
    aegis: { damagedSystemIds: ['storage'], destroyed: false },
  });

  const writes = mock.set.mock.calls.length + mock.update.mock.calls.length;
  await expect(repairGorgoneionWithDrones.run(request(command, 'player-1'))).resolves.toMatchObject({
    status: 'replayed', materialsRemaining: 2, repairRevision: 1,
  });
  expect(mock.set.mock.calls.length + mock.update.mock.calls.length).toBe(writes);
});
