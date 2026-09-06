import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { CallableRequest } from 'firebase-functions/v2/https';

const mock = vi.hoisted(() => ({
  get: vi.fn(), update: vi.fn(), set: vi.fn(), role: 'gm', owner: 'u1', connected: true,
  damage: {} as Record<string, unknown>, currentTurn: 1, maintenanceCycles: {} as Record<string, unknown>, retry: false,
  shipSurvivors: {} as Record<string, number>, capybaraEnabled: true, dioneEnabled: true,
  turnPhase: undefined as unknown, pressDispatch: undefined as unknown,
  activeConsoleRoleId: undefined as string | undefined,
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

import { advanceTurn, beginOpenAirspacePhase, runMaintenance, unlockPressAirspace } from './index';

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
  mock.shipSurvivors = {};
  mock.capybaraEnabled = true;
  mock.dioneEnabled = true;
  mock.turnPhase = undefined;
  mock.pressDispatch = undefined;
  mock.activeConsoleRoleId = undefined;
  mock.retry = false;
  mock.randomInt.mockReset();
  mock.randomInt.mockReturnValue(3_100_000_000);
  mock.randomUUID.mockReset();
  mock.randomUUID.mockReturnValue('damage-event');
  mock.update.mockReset();
  mock.set.mockReset();
  mock.get.mockImplementation(async (path: string) => {
    const fields: Record<string, unknown> = path.includes('/players/')
      ? {
          role: mock.role, connected: mock.connected,
          activeConsoleRoleId: mock.activeConsoleRoleId,
        }
      : path.includes('/gmInstances/')
        ? { uid: mock.owner }
        : {
          shipDamage: mock.damage,
          currentTurn: mock.currentTurn,
          maintenanceCycles: mock.maintenanceCycles,
          shipSurvivors: mock.shipSurvivors,
          capybaraEnabled: mock.capybaraEnabled,
          dioneEnabled: mock.dioneEnabled,
          turnPhase: mock.turnPhase,
          pressDispatch: mock.pressDispatch,
        };
    return { exists: true, get: (key: string) => fields[key] };
  });
});
afterEach(() => vi.useRealTimers());
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

it('starts Turn 1 with a ten-minute team phase and later turns with the shorter real-time schedule', async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-09-06T12:00:00.000Z'));
  mock.currentTurn = 0;
  mock.capybaraEnabled = false;
  mock.shipSurvivors = {
    aegis: 1_000,
    dione: 90_000,
    icebreaker: 30_000,
    capybara: 20_000,
    shepherd: 20_000,
    quellon: 10_000,
    'refinery-124': 5_000,
  };
  await expect(advanceTurn.run(request({
    sessionId: 's1', instanceId: 'bridge', expectedTurn: 0,
  }))).resolves.toEqual({
    currentTurn: 1,
    turnStartAnnouncement: { turn: 1, survivorPopulation: 156_000 },
    turnPhase: {
      turn: 1,
      teamPhaseEndsAt: '2026-09-06T12:10:00.000Z',
      openAirspaceEndsAt: '2026-09-06T12:30:00.000Z',
      airspace: { state: 'restricted', tickerActive: true, pressAccess: false },
    },
  });
  expect(mock.update).toHaveBeenCalledWith('sessions/s1', expect.objectContaining({
    currentTurn: 1,
    turnStartAnnouncement: { turn: 1, survivorPopulation: 156_000 },
    turnPhase: {
      turn: 1,
      teamPhaseEndsAt: '2026-09-06T12:10:00.000Z',
      openAirspaceEndsAt: '2026-09-06T12:30:00.000Z',
      airspace: { state: 'restricted', tickerActive: true, pressAccess: false },
    },
  }));

  mock.currentTurn = 1;
  mock.turnPhase = {
    turn: 1,
    teamPhaseEndsAt: '2026-09-06T12:10:00.000Z',
    openAirspaceEndsAt: '2026-09-06T12:30:00.000Z',
    airspace: { state: 'restricted', tickerActive: true, pressAccess: false },
  };
  mock.update.mockClear();
  await expect(advanceTurn.run(request({
    sessionId: 's1', instanceId: 'bridge', expectedTurn: 1,
  }))).rejects.toMatchObject({ code: 'failed-precondition', message: expect.stringMatching(/timer/i) });
  expect(mock.update).not.toHaveBeenCalled();

  await expect(advanceTurn.run(request({
    sessionId: 's1', instanceId: 'bridge', expectedTurn: 1, overridePhaseTimer: true,
  }))).resolves.toEqual({
    currentTurn: 2,
    turnStartAnnouncement: { turn: 2, survivorPopulation: 156_000 },
    turnPhase: {
      turn: 2,
      teamPhaseEndsAt: '2026-09-06T12:05:00.000Z',
      openAirspaceEndsAt: '2026-09-06T12:20:00.000Z',
      airspace: { state: 'restricted', tickerActive: true, pressAccess: false },
    },
  });
  expect(mock.update).toHaveBeenCalledWith('sessions/s1', expect.objectContaining({
    currentTurn: 2,
    turnStartAnnouncement: { turn: 2, survivorPopulation: 156_000 },
    turnPhase: expect.objectContaining({ turn: 2 }),
  }));

  await expect(advanceTurn.run(request({
    sessionId: 's1', instanceId: 'bridge', expectedTurn: 0,
  }))).rejects.toMatchObject({ code: 'failed-precondition' });
});

it('turns the ticker into an open-airspace bulletin after the team timer expires', async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-09-06T12:05:00.000Z'));
  mock.currentTurn = 2;
  mock.turnPhase = {
    turn: 2,
    teamPhaseEndsAt: '2026-09-06T12:05:00.000Z',
    openAirspaceEndsAt: '2026-09-06T12:20:00.000Z',
    airspace: { state: 'restricted', tickerActive: false, pressAccess: true },
  };
  mock.pressDispatch = { dispatches: [{ id: 'earlier', text: 'SNN // Earlier copy' }], revision: 1 };

  await expect(beginOpenAirspacePhase.run(request({
    sessionId: 's1', expectedTurn: 2,
  }))).resolves.toEqual({
    turnPhase: {
      turn: 2,
      teamPhaseEndsAt: '2026-09-06T12:05:00.000Z',
      openAirspaceEndsAt: '2026-09-06T12:20:00.000Z',
      airspace: { state: 'lifted', tickerActive: true, pressAccess: true },
    },
  });
  expect(mock.update).toHaveBeenCalledWith('sessions/s1', expect.objectContaining({
    turnPhase: expect.objectContaining({
      airspace: { state: 'lifted', tickerActive: true, pressAccess: true },
    }),
  }));
});

it('requires AEGIS authority for the Press exception and heals a stale restriction into coordination', async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-09-06T12:00:00.000Z'));
  mock.role = 'player';
  mock.activeConsoleRoleId = 'admiral';
  mock.turnPhase = {
    turn: 1,
    teamPhaseEndsAt: '2026-09-06T12:10:00.000Z',
    openAirspaceEndsAt: '2026-09-06T12:30:00.000Z',
    airspace: { state: 'restricted', tickerActive: true, pressAccess: false },
  };

  await expect(unlockPressAirspace.run(request({ sessionId: 's1' }))).resolves.toEqual({
    turnPhase: {
      turn: 1,
      teamPhaseEndsAt: '2026-09-06T12:10:00.000Z',
      openAirspaceEndsAt: '2026-09-06T12:30:00.000Z',
      airspace: { state: 'restricted', tickerActive: true, pressAccess: true },
    },
  });

  mock.update.mockClear();
  mock.activeConsoleRoleId = 'dione-captain';
  await expect(unlockPressAirspace.run(request({ sessionId: 's1' }))).rejects
    .toMatchObject({ code: 'permission-denied' });
  expect(mock.update).not.toHaveBeenCalled();

  mock.activeConsoleRoleId = 'admiral';
  vi.setSystemTime(new Date('2026-09-06T12:10:00.000Z'));
  await expect(unlockPressAirspace.run(request({ sessionId: 's1' }))).resolves.toEqual({
    turnPhase: {
      turn: 1,
      teamPhaseEndsAt: '2026-09-06T12:10:00.000Z',
      openAirspaceEndsAt: '2026-09-06T12:30:00.000Z',
      airspace: { state: 'lifted', tickerActive: true, pressAccess: false },
    },
  });
  expect(mock.update).toHaveBeenCalledWith('sessions/s1', expect.objectContaining({
    turnPhase: expect.objectContaining({
      airspace: { state: 'lifted', tickerActive: true, pressAccess: false },
    }),
  }));
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
