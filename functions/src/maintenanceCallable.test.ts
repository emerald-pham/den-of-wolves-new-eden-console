import { beforeEach, expect, it, vi } from 'vitest';
import type { CallableRequest } from 'firebase-functions/v2/https';

const mock = vi.hoisted(() => ({
  get: vi.fn(), update: vi.fn(), set: vi.fn(), role: 'gm', owner: 'u1', connected: true,
  damage: {} as Record<string, unknown>, currentTurn: 1, maintenanceCycles: {} as Record<string, unknown>, retry: false,
  randomInt: vi.fn(() => 3_100_000_000), randomUUID: vi.fn(() => 'damage-event'),
}));
vi.mock('node:crypto', () => ({ randomInt: mock.randomInt, randomUUID: mock.randomUUID }));
vi.mock('firebase-admin/app', () => ({ initializeApp: vi.fn() }));
vi.mock('firebase-admin/firestore', () => ({
  getFirestore: () => ({
    doc: (path: string) => path,
    collection: (path: string) => path,
    runTransaction: async (callback: (tx: unknown) => unknown) => {
      const tx = { get: mock.get, update: mock.update, set: mock.set };
      if (mock.retry) await callback(tx);
      return callback(tx);
    },
  }),
  FieldValue: { serverTimestamp: () => 'server-time' },
  Timestamp: { now: () => ({ toMillis: () => Date.now() }) },
}));

import { advanceTurn, runMaintenance } from './index';

function request(data: Record<string, unknown>, uid = 'u1') {
  return { data, auth: { uid } } as CallableRequest<{
    sessionId: string; shipId: string; instanceId: string; action: string; expectedRevision: number;
  }>;
}

beforeEach(() => {
  mock.role = 'gm';
  mock.owner = 'u1';
  mock.connected = true;
  mock.damage = {};
  mock.currentTurn = 1;
  mock.maintenanceCycles = {};
  mock.retry = false;
  mock.randomInt.mockReset();
  mock.randomInt.mockReturnValue(3_100_000_000);
  mock.randomUUID.mockReset();
  mock.randomUUID.mockReturnValue('damage-event');
  mock.update.mockReset();
  mock.set.mockReset();
  mock.get.mockImplementation(async (path: string) => {
    const fields: Record<string, unknown> = path.includes('/players/')
      ? { role: mock.role, connected: mock.connected }
      : path.includes('/gmInstances/')
        ? { uid: mock.owner }
        : { shipDamage: mock.damage, currentTurn: mock.currentTurn, maintenanceCycles: mock.maintenanceCycles };
    return { exists: true, get: (key: string) => fields[key] };
  });
});
it('rejects a second maintenance cycle in the same turn', async () => {
  mock.maintenanceCycles = {
    aegis: { step: 0, revision: 8, turn: 1, results: {}, charges: [], refuelled: [] },
  };
  await expect(runMaintenance.run(request({ ...data, expectedRevision: 8 })))
    .rejects.toMatchObject({ code: 'failed-precondition', message: expect.stringMatching(/once per turn/i) });
  expect(mock.update).not.toHaveBeenCalled();
});

const data = { sessionId: 's1', shipId: 'aegis', instanceId: 'bridge', action: 'begin', expectedRevision: 0 };


it('begins maintenance atomically with a server-owned revision', async () => {
  await expect(runMaintenance.run(request(data))).resolves.toMatchObject({ step: 1, revision: 1 });
  expect(mock.update).toHaveBeenCalledWith('sessions/s1', expect.objectContaining({
    'maintenanceCycles.aegis': expect.objectContaining({ step: 1, revision: 1 }),
  }));
});
it('denies unauthenticated, disconnected, unassigned players and foreign GM instances', async () => {
  mock.connected = false;
  await expect(runMaintenance.run(request(data))).rejects.toMatchObject({ code: 'permission-denied' });
  mock.connected = true; mock.role = 'player';
  await expect(runMaintenance.run(request(data))).rejects.toMatchObject({ code: 'permission-denied' });
  mock.role = 'gm'; mock.owner = 'someone-else';
  await expect(runMaintenance.run(request(data))).rejects.toMatchObject({ code: 'permission-denied' });
  expect(mock.update).not.toHaveBeenCalled();
});
it('rejects invalid steps and client-supplied dice', async () => {
  await expect(runMaintenance.run(request({ ...data, action: 'riot' }))).rejects.toMatchObject({ code: 'failed-precondition' });
  await expect(runMaintenance.run(request({ ...data, rolls: [6, 6] }))).rejects.toMatchObject({ code: 'invalid-argument' });
  expect(mock.update).not.toHaveBeenCalled();
});

it('rejects observer authority even if a prior console role remains stored', async () => {
  mock.get.mockImplementation(async () => ({ exists: true, get: (key: string) => ({ connected: true, role: 'observer', activeConsoleRoleId: 'admiral' } as Record<string, unknown>)[key] }));
  await expect(runMaintenance.run(request(data))).rejects.toMatchObject({ code: 'permission-denied' });
  expect(mock.update).not.toHaveBeenCalled();
});
it('allows a ship officer and assigned joint engineer, but denies another ship', async () => {
  mock.get.mockImplementation(async (path: string) => ({ exists: true, get: (key: string) => path.includes('/players/') ? ({ connected: true, role: 'player', activeConsoleRoleId: 'joint-engineering-quellon-refinery' } as Record<string, unknown>)[key] : undefined }));
  await expect(runMaintenance.run(request({ ...data, shipId: 'quellon' }))).resolves.toMatchObject({ step: 1 });
  await expect(runMaintenance.run(request({ ...data, shipId: 'shepherd' }))).rejects.toMatchObject({ code: 'permission-denied' });
});

it('lets an active GM instance advance exactly the displayed turn', async () => {
  await expect(advanceTurn.run(request({
    sessionId: 's1', instanceId: 'bridge', expectedTurn: 1,
  }))).resolves.toEqual({ currentTurn: 2 });
  expect(mock.update).toHaveBeenCalledWith('sessions/s1', expect.objectContaining({ currentTurn: 2 }));

  mock.currentTurn = 2;
  await expect(advanceTurn.run(request({
    sessionId: 's1', instanceId: 'bridge', expectedTurn: 1,
  }))).rejects.toMatchObject({ code: 'failed-precondition' });
});

it('denies turn advancement without an active GM instance', async () => {
  mock.role = 'player';
  await expect(advanceTurn.run(request({
    sessionId: 's1', instanceId: 'bridge', expectedTurn: 1,
  }))).rejects.toMatchObject({ code: 'permission-denied' });
});
it('checks the viewed console against the live crew before maintenance writes', async () => {
  let full = false;
  mock.get.mockImplementation(async (path: string) => {
    const fields: Record<string, unknown> = path.includes('/players/')
      ? { connected: true, role: 'player', activeConsoleRoleId: 'wing-commander' } : {};
    if (path.endsWith('/players')) return { docs: (full ? ['admiral', 'executive-officer', 'wing-commander'] : ['wing-commander']).map(post => ({ exists: true, get: (key: string) => ({ connected: true, role: 'player', activeConsoleRoleId: post } as Record<string, unknown>)[key] })) };
    return { exists: true, get: (key: string) => fields[key] };
  });
  const command = { ...data, consoleRoleId: 'admiral' };
  await expect(runMaintenance.run(request(command))).resolves.toMatchObject({ step: 1 });
  full = true; mock.update.mockClear();
  await expect(runMaintenance.run(request(command))).rejects.toMatchObject({ code: 'permission-denied' });
  expect(mock.update).not.toHaveBeenCalled();
});
it('denies maintenance rollback to players and observers', async () => {
  const { rollbackMaintenance } = await import('./index');
  for (const role of ['player', 'observer']) {
    mock.role = role;
    await expect(rollbackMaintenance.run(request({ sessionId: 's1', shipId: 'aegis', instanceId: 'bridge', expectedRevision: 1 }))).rejects.toMatchObject({ code: 'permission-denied' });
  }
  expect(mock.update).not.toHaveBeenCalled();
});
it('lets a GM roll back the latest maintenance step with a new revision', async () => {
  const { rollbackMaintenance } = await import('./index');
  const previous = mock.get.getMockImplementation()!;
  mock.maintenanceCycles = { aegis: { step: 2, revision: 2 } };
  mock.get.mockImplementation(async (path: string) => {
    if (path.includes('/maintenanceUndo/')) return { exists: true, get: (key: string) => ({ turn: 1, entries: [{ fields: [{ field: 'maintenanceCycles.aegis', before: { step: 1, revision: 1 }, after: { step: 2, revision: 2 }, existed: true }] }] } as Record<string, unknown>)[key] };
    if (path === 'sessions/s1') return { exists: true, get: (key: string) => ({ currentTurn: 1, 'maintenanceCycles.aegis': { step: 2, revision: 2 } } as Record<string, unknown>)[key] };
    return previous(path);
  });
  await expect(rollbackMaintenance.run(request({ sessionId: 's1', shipId: 'aegis', instanceId: 'bridge', expectedRevision: 2 }))).resolves.toMatchObject({ revision: 3 });
  expect(mock.update).toHaveBeenCalledWith('sessions/s1', expect.objectContaining({ 'maintenanceCycles.aegis': { step: 1, revision: 3 } }));
});
it('records and rolls back successive steps while restoring spent supplies', async () => {
  const { rollbackMaintenance } = await import('./index');
  const records: Record<string, Record<string, unknown>> = {
    'sessions/s1': { currentTurn: 1, maintenanceCycles: { aegis: { step: 0, revision: 0, results: {}, charges: [], refuelled: [] } }, shipResources: { aegis: { food: 20, water: 20, fuel: 3, materials: 0, ore: 0 } }, shipDamage: { aegis: { damagedSystemIds: ['storage'], destroyed: false } }, shipSurvivors: { aegis: 2000 }, shipUnrest: { aegis: 0 }, shuttleCargo: {}, shuttleFuelled: {}, unrestAlerts: {}, populationAlerts: {} },
    'sessions/s1/players/u1': { connected: true, role: 'gm' },
    'sessions/s1/gmInstances/bridge': { uid: 'u1' },
  };
  const read = (record: Record<string, unknown> | undefined, key: string): unknown => key.split('.').reduce<unknown>((value, part) => value && typeof value === 'object' ? (value as Record<string, unknown>)[part] : undefined, record);
  mock.get.mockImplementation(async (path: string) => ({ exists: Boolean(records[path]), get: (key: string) => read(records[path], key) }));
  mock.set.mockImplementation((path: string, value: Record<string, unknown>) => {
    if (Array.isArray(value.entries) && value.entries.some(Array.isArray)) throw new Error('Firestore does not support nested arrays.');
    records[path] = structuredClone(value);
  });
  mock.update.mockImplementation((path: string, patch: Record<string, unknown>) => {
    for (const [key, value] of Object.entries(patch)) {
      const parts = key.split('.'); let record = records[path]!;
      for (const part of parts.slice(0, -1)) { record[part] ??= {}; record = record[part] as Record<string, unknown>; }
      record[parts.at(-1)!] = structuredClone(value);
    }
  });
  await runMaintenance.run(request(data));
  await runMaintenance.run(request({ ...data, action: 'storage', expectedRevision: 1 }));
  expect(read(records['sessions/s1'], 'shipResources.aegis.food')).toBe(10);
  await runMaintenance.run(request({ ...data, action: 'rations', expectedRevision: 2, foodLevel: 1, waterLevel: 1 }));
  expect(read(records['sessions/s1'], 'shipResources.aegis.food')).toBe(7);
  for (const expectedRevision of [3, 4]) {
    await rollbackMaintenance.run(request({ sessionId: 's1', shipId: 'aegis', instanceId: 'bridge', expectedRevision }));
  }
  expect(read(records['sessions/s1'], 'shipResources.aegis.food')).toBe(20);
  expect(read(records['sessions/s1'], 'maintenanceCycles.aegis')).toMatchObject({ step: 1, revision: 5 });
});
