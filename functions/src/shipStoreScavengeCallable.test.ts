import { beforeEach, expect, it, vi } from 'vitest';
import type { CallableRequest } from 'firebase-functions/v2/https';

const mock = vi.hoisted(() => ({
  session: {} as Record<string, unknown>,
  player: {} as Record<string, unknown>,
  instance: {} as Record<string, unknown>,
  groups: [] as Array<{ id: string; vesselIds: string[]; memberUids: string[] }>,
  stored: new Map<string, Record<string, unknown>>(),
  updates: [] as Array<readonly [string, Record<string, unknown>]>,
}));

function snapshot(path: string, fields?: Record<string, unknown>) {
  return {
    exists: fields !== undefined,
    id: path.split('/').at(-1),
    data: () => fields,
    get: (key: string) => fields?.[key],
  };
}

vi.mock('firebase-admin/app', () => ({ initializeApp: vi.fn() }));
vi.mock('firebase-admin/firestore', () => ({
  getFirestore: () => ({
    doc: (path: string) => ({ path, id: path.split('/').at(-1) }),
    collection: (path: string) => ({ path, collection: true }),
    runTransaction: (callback: (tx: unknown) => unknown) => callback({
      get: async (ref: { path: string; collection?: boolean }) => {
        if (ref.collection && ref.path === 'sessions/s1/fleetGroups') {
          return { docs: mock.groups.map((group) => snapshot(`${ref.path}/${group.id}`, group)) };
        }
        if (ref.path === 'sessions/s1') return snapshot(ref.path, mock.session);
        if (ref.path === 'sessions/s1/players/u1') return snapshot(ref.path, mock.player);
        if (ref.path === 'sessions/s1/gmInstances/gm1') return snapshot(ref.path, mock.instance);
        return snapshot(ref.path, mock.stored.get(ref.path));
      },
      update: (ref: { path: string }, fields: Record<string, unknown>) => {
        mock.updates.push([ref.path, fields]);
      },
      set: (ref: { path: string }, fields: Record<string, unknown>) => {
        mock.stored.set(ref.path, fields);
      },
    }),
  }),
  FieldValue: { serverTimestamp: () => 'server-time' },
  Timestamp: { now: () => ({ toMillis: () => Date.now() }) },
}));

import { scavengeDestroyedShipStores } from './index';

function request(overrides: Record<string, unknown> = {}, uid = 'u1') {
  return {
    auth: { uid },
    data: {
      sessionId: 's1', instanceId: 'gm1', requestId: 'scavenge-1',
      sourceShipId: 'aegis', expectedRevision: 4,
      allocations: {
        dione: { ore: 2, fuel: 3, food: 4, water: 1, materials: 2, securityTeams: 1 },
      },
      ...overrides,
    },
  } as CallableRequest<Record<string, unknown>>;
}

beforeEach(() => {
  mock.session = {
    phase: 'active', currentTurn: 3, activeVesselIds: ['aegis', 'dione'],
    vesselActionRevisions: { aegis: 4, dione: 7 },
    shipDamage: {
      aegis: { damagedSystemIds: [], destroyed: true },
      dione: { damagedSystemIds: [], destroyed: false },
    },
    shipResources: {
      aegis: { ore: 2, fuel: 3, food: 4, water: 1, materials: 2, securityTeams: 1 },
      dione: { ore: 0, fuel: 1, food: 2, water: 3, materials: 0, securityTeams: 2 },
    },
  };
  mock.player = { role: 'gm', connected: true, activeConsoleRoleId: 'facilitator' };
  mock.instance = { uid: 'u1', connected: true, lastSeenAt: new Date() };
  mock.groups = [{ id: 'fleet-1', vesselIds: ['aegis', 'dione'], memberUids: ['u1'] }];
  mock.stored.clear();
  mock.updates.length = 0;
});

it('atomically zeros the destroyed ledger, credits legal recipients, and writes authority plus audit', async () => {
  await expect(scavengeDestroyedShipStores.run(request())).resolves.toMatchObject({
    status: 'committed', sourceShipId: 'aegis',
    revisions: { aegis: 5, dione: 8 },
    inventories: {
      aegis: { ore: 0, fuel: 0, food: 0, water: 0, materials: 0, securityTeams: 0 },
      dione: { ore: 2, fuel: 4, food: 6, water: 4, materials: 2, securityTeams: 3 },
    },
    idempotencyKey: 'scavenge-1', actorUid: 'u1', vesselId: 'aegis',
  });
  expect(mock.updates).toEqual([['sessions/s1', expect.objectContaining({
    'shipResources.aegis': {
      ore: 0, fuel: 0, food: 0, water: 0, materials: 0, securityTeams: 0,
    },
    'shipResources.dione': {
      ore: 2, fuel: 4, food: 6, water: 4, materials: 2, securityTeams: 3,
    },
    'vesselActionRevisions.aegis': 5,
    'vesselActionRevisions.dione': 8,
  })]]);
  expect(mock.stored.get('sessions/s1/shipStoreScavenges/aegis')).toMatchObject({
    type: 'destroyed-ship-store-scavenge', sourceShipId: 'aegis', actorUid: 'u1',
  });
  expect(mock.stored.get('sessions/s1/shipStoreScavenges/aegis/audit/scavenge-1'))
    .toMatchObject({ requestId: 'scavenge-1' });
  const actionAudit = mock.stored.get('sessions/s1/actionAudits/scavenge-1');
  expect(actionAudit).toMatchObject({
    schemaVersion: 1, sessionId: 's1', actorUid: 'u1', actorRoleId: 'facilitator',
    action: 'ship-store-scavenge', phase: 'active', requestId: 'scavenge-1',
    revision: 5, outcome: 'committed', resolutionSource: 'facilitator',
    redactionPolicy: 'action-audit-metadata-only-v1', createdAt: 'server-time',
  });
  expect(Object.keys(actionAudit ?? {}).sort()).toEqual([
    'action', 'actorRoleId', 'actorUid', 'createdAt', 'outcome', 'phase',
    'redactionPolicy', 'requestId', 'resolutionSource', 'revision',
    'schemaVersion', 'sessionId',
  ].sort());
  expect(actionAudit).not.toHaveProperty('allocations');
  expect(actionAudit).not.toHaveProperty('transfers');
  expect(actionAudit).not.toHaveProperty('inventories');
});

it('replays the same request without a second ledger mutation and rejects a later allocation', async () => {
  const first = await scavengeDestroyedShipStores.run(request());
  const updateCount = mock.updates.length;
  await expect(scavengeDestroyedShipStores.run(request())).resolves.toEqual(first);
  expect(mock.updates).toHaveLength(updateCount);
  expect(mock.stored.get('sessions/s1/actionAudits/scavenge-1')).toMatchObject({
    action: 'ship-store-scavenge', requestId: 'scavenge-1', revision: 5,
  });
  await expect(scavengeDestroyedShipStores.run(request({
    allocations: {
      dione: { ore: 2, fuel: 3, food: 4, water: 1, materials: 1, securityTeams: 1 },
      aegis: { materials: 1 },
    },
  }))).rejects.toMatchObject({ code: 'failed-precondition' });
  await expect(scavengeDestroyedShipStores.run(request({ requestId: 'scavenge-2' })))
    .rejects.toMatchObject({ code: 'already-exists' });
  expect(mock.updates).toHaveLength(updateCount);
});

it('fails closed when the standardized audit path belongs to another producer', async () => {
  mock.stored.set('sessions/s1/actionAudits/audit-collision', {
    schemaVersion: 1, sessionId: 's1', actorUid: 'u1', actorRoleId: null,
    action: 'ship-counter-batch', phase: 'active', requestId: 'audit-collision',
    revision: 1, outcome: 'committed', resolutionSource: 'facilitator',
    redactionPolicy: 'action-audit-metadata-only-v1', createdAt: 'server-time',
  });

  await expect(scavengeDestroyedShipStores.run(request({ requestId: 'audit-collision' })))
    .rejects.toMatchObject({ code: 'failed-precondition' });
  expect(mock.updates).toHaveLength(0);
  expect(mock.stored.get('sessions/s1/actionAudits/audit-collision')?.action)
    .toBe('ship-counter-batch');
});

it('returns a replayable stale result before changing any balance', async () => {
  const payload = { expectedRevision: 3, requestId: 'stale-scavenge' };
  const first = await scavengeDestroyedShipStores.run(request(payload));
  expect(first).toMatchObject({ status: 'stale', currentRevision: 4 });
  expect(mock.stored.has('sessions/s1/actionAudits/stale-scavenge')).toBe(false);
  await expect(scavengeDestroyedShipStores.run(request(payload))).resolves.toEqual(first);
  expect(mock.updates).toHaveLength(0);
});

it('rejects unauthorized, cross-group, and living-source requests without writes', async () => {
  mock.player.role = 'player';
  await expect(scavengeDestroyedShipStores.run(request())).rejects.toMatchObject({ code: 'permission-denied' });
  mock.player.role = 'gm';
  mock.groups = [
    { id: 'fleet-1', vesselIds: ['aegis'], memberUids: ['u1'] },
    { id: 'fleet-2', vesselIds: ['dione'], memberUids: [] },
  ];
  await expect(scavengeDestroyedShipStores.run(request())).rejects.toMatchObject({
    code: 'failed-precondition', message: expect.stringMatching(/fleet-group/i),
  });
  mock.groups = [{ id: 'fleet-1', vesselIds: ['aegis', 'dione'], memberUids: ['u1'] }];
  mock.session.shipDamage = {
    aegis: { damagedSystemIds: [], destroyed: false },
    dione: { damagedSystemIds: [], destroyed: false },
  };
  await expect(scavengeDestroyedShipStores.run(request())).rejects.toMatchObject({
    code: 'failed-precondition', message: expect.stringMatching(/destroyed/i),
  });
  expect(mock.updates).toHaveLength(0);
});

it('rejects malformed stored ledgers and revision overflow without writes', async () => {
  mock.session.shipResources = {
    ...(mock.session.shipResources as Record<string, unknown>),
    aegis: { ore: -1, fuel: 3, food: 4, water: 1, materials: 2, securityTeams: 1 },
  };
  await expect(scavengeDestroyedShipStores.run(request())).rejects.toMatchObject({
    code: 'failed-precondition', message: expect.stringMatching(/ledger.*malformed/i),
  });
  mock.session.shipResources = {
    aegis: { ore: 2, fuel: 3, food: 4, water: 1, materials: 2, securityTeams: 1 },
    dione: { ore: 0, fuel: 1, food: 2, water: 3, materials: 0, securityTeams: 2 },
  };
  mock.session.vesselActionRevisions = { aegis: 4, dione: Number.MAX_SAFE_INTEGER };
  await expect(scavengeDestroyedShipStores.run(request())).rejects.toMatchObject({
    code: 'failed-precondition', message: expect.stringMatching(/safe ledger limit/i),
  });
  expect(mock.updates).toHaveLength(0);
});
