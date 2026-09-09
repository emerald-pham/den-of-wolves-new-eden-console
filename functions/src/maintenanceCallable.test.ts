import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { CallableRequest } from 'firebase-functions/v2/https';

const mock = vi.hoisted(() => ({
  get: vi.fn(), update: vi.fn(), set: vi.fn(), role: 'gm', owner: 'u1', connected: true,
  gmInstanceOwners: {} as Record<string, string>,
  damage: {} as Record<string, unknown>, currentTurn: 1, maintenanceCycles: {} as Record<string, unknown>, retry: false,
  shuttleFuelled: {} as Record<string, boolean>,
  shipSurvivors: {} as Record<string, number>, capybaraEnabled: true, dioneEnabled: true,
  fleetSurvivorPopulationAdjustment: 0,
  turnStartAnnouncement: undefined as unknown,
  turnPhase: undefined as unknown, pressDispatch: undefined as unknown,
  race: undefined as {
    attempts: number;
    ready: Promise<void>;
    release: () => void;
    version: number;
    barrier?: boolean;
    readBarrier?: boolean;
    readAttempts?: number;
    readReady?: Promise<void>;
    readRelease?: () => void;
    maintenance?: {
      session: Record<string, unknown>;
      receipts: Record<string, Record<string, unknown>>;
      rollbackReceipts?: Record<string, Record<string, unknown>>;
      undo: Record<string, Record<string, unknown>>;
      events: Record<string, Record<string, unknown>>;
      damageDraws: Record<string, Record<string, unknown>>;
    };
  } | undefined,
  pressEnabled: true,
  activeConsoleRoleId: undefined as string | undefined,
  activeRoleIds: undefined as readonly string[] | undefined,
  randomInt: vi.fn(() => 3_100_000_000), randomUUID: vi.fn(() => 'damage-event'),
}));
vi.mock('node:crypto', () => ({ randomInt: mock.randomInt, randomUUID: mock.randomUUID }));
vi.mock('firebase-admin/app', () => ({ initializeApp: vi.fn() }));
vi.mock('firebase-admin/firestore', () => ({
  getFirestore: () => ({
    doc: (path: string) => path,
    collection: (path: string) => path,
    runTransaction: async (callback: (tx: unknown) => unknown) => {
      if (mock.race) {
        const race = mock.race;
        if (race.maintenance) {
          for (let attempt = 0; attempt < 3; attempt += 1) {
            const baseVersion = race.version;
            const state = race.maintenance;
            const snapshot = structuredClone(state.session);
            const readSnapshot = (key: string): unknown => key.split('.').reduce<unknown>((value, part) =>
              value && typeof value === 'object' ? (value as Record<string, unknown>)[part] : undefined, snapshot);
            const updates: Array<readonly [string, Record<string, unknown>]> = [];
            const sets: Array<readonly [string, Record<string, unknown>]> = [];
            const document = (path: string) => {
              if (path.includes('/maintenanceRequests/')) {
                const fields = state.receipts[path];
                return { exists: fields !== undefined, get: (key: string) => fields?.[key] };
              }
              if (path.includes('/maintenanceRollbackRequests/')) {
                const fields = state.rollbackReceipts?.[path];
                return { exists: fields !== undefined, get: (key: string) => fields?.[key] };
              }
              if (path.includes('/maintenanceUndo/')) {
                const fields = state.undo[path] ?? { entries: [] };
                return { exists: true, get: (key: string) => fields[key] };
              }
              if (path.includes('/players/')) {
                return { exists: true, get: (key: string) => ({
                  role: mock.role, connected: mock.connected,
                  activeConsoleRoleId: mock.activeConsoleRoleId,
                } as Record<string, unknown>)[key] };
              }
              if (path.includes('/gmInstances/')) {
                return { exists: true, get: (key: string) => key === 'uid' ? mock.owner : undefined };
              }
              if (path.endsWith('/gmInstances')) return { exists: true, docs: [] };
              return { exists: true, get: (key: string) => readSnapshot(key) };
            };
            const tx = {
              get: async (path: string) => {
                const value = document(path);
                if (race.readBarrier && path === 'sessions/s1' && race.readReady && race.readRelease) {
                  race.readAttempts = (race.readAttempts ?? 0) + 1;
                  if (race.readAttempts === 1) await race.readReady;
                  else if (race.readAttempts === 2) race.readRelease();
                }
                return value;
              },
              update: (path: string, fields: Record<string, unknown>) => updates.push([path, fields]),
              set: (path: string, fields: Record<string, unknown>) => sets.push([path, fields]),
            };
            const result = await callback(tx);
            const writes = updates.length > 0 || sets.length > 0;
            if (writes) {
              race.attempts += 1;
              if (race.barrier && race.attempts === 1) await race.ready;
              else if (race.barrier && race.attempts === 2) race.release();
            }
            if (race.version !== baseVersion) continue;
            const assign = (path: string, key: string, value: unknown) => {
              if (path !== 'sessions/s1') return;
              const parts = key.split('.');
              if (parts.length === 1) state.session[key] = value;
              else {
                const root = parts[0]!;
                const child = parts.slice(1).join('.');
                const current = typeof state.session[root] === 'object' && state.session[root] !== null
                  ? structuredClone(state.session[root]) as Record<string, unknown>
                  : {};
                current[child] = value;
                state.session[root] = current;
              }
            };
            for (const [path, fields] of updates) {
              mock.update(path, fields);
              for (const [key, value] of Object.entries(fields)) assign(path, key, value);
            }
            for (const [path, fields] of sets) {
              mock.set(path, fields);
              if (path.includes('/maintenanceRequests/')) state.receipts[path] = fields;
              else if (path.includes('/maintenanceRollbackRequests/')) (state.rollbackReceipts ??= {})[path] = fields;
              else if (path.includes('/maintenanceUndo/')) state.undo[path] = fields;
              else if (path.includes('/damageDraws/')) state.damageDraws[path] = fields;
              else if (path.includes('/events/')) state.events[path] = fields;
            }
            if (updates.length > 0 || sets.length > 0) race.version += 1;
            return result;
          }
          throw new Error('Mock transaction exceeded optimistic retry limit.');
        }
        for (let attempt = 0; attempt < 3; attempt += 1) {
          const baseVersion = race.version;
          const snapshot = {
            currentTurn: mock.currentTurn,
            turnPhase: mock.turnPhase,
            turnStartAnnouncement: mock.turnStartAnnouncement,
            maintenanceCycles: mock.maintenanceCycles,
            shuttleFuelled: mock.shuttleFuelled,
            shipSurvivors: mock.shipSurvivors,
            fleetSurvivorPopulationAdjustment: mock.fleetSurvivorPopulationAdjustment,
            capybaraEnabled: mock.capybaraEnabled,
            dioneEnabled: mock.dioneEnabled,
          };
          const updates: Array<readonly [string, Record<string, unknown>]> = [];
          const sets: Array<readonly [string, Record<string, unknown>]> = [];
          const tx = {
            get: async (path: string) => {
              const fields: Record<string, unknown> = path.includes('/players/')
                ? { role: mock.role, connected: mock.connected, activeConsoleRoleId: mock.activeConsoleRoleId }
                : path.includes('/gmInstances/')
                  ? { uid: mock.gmInstanceOwners[path.split('/').at(-1) ?? ''] ?? mock.owner }
                : {
                    phase: 'active',
                    ...snapshot,
                  };
              return { exists: true, get: (key: string) => fields[key] };
            },
            update: (path: string, fields: Record<string, unknown>) => updates.push([path, fields]),
            set: (path: string, fields: Record<string, unknown>) => sets.push([path, fields]),
          };
          const result = await callback(tx);
          race.attempts += 1;
          if (race.attempts === 1) await race.ready;
          else if (race.attempts === 2) race.release();
          if (race.version !== baseVersion) continue;
          for (const [path, fields] of updates) {
            mock.update(path, fields);
            if (path === 'sessions/s1') {
              if ('currentTurn' in fields) mock.currentTurn = fields.currentTurn as number;
              if ('turnPhase' in fields) mock.turnPhase = fields.turnPhase;
              if ('turnStartAnnouncement' in fields) mock.turnStartAnnouncement = fields.turnStartAnnouncement;
              if ('maintenanceCycles' in fields) mock.maintenanceCycles = fields.maintenanceCycles as Record<string, unknown>;
              if ('shuttleFuelled' in fields) mock.shuttleFuelled = fields.shuttleFuelled as Record<string, boolean>;
              if ('fleetSurvivorPopulationAdjustment' in fields) {
                mock.fleetSurvivorPopulationAdjustment = fields.fleetSurvivorPopulationAdjustment as number;
              }
            }
          }
          for (const [path, fields] of sets) mock.set(path, fields);
          race.version += 1;
          return result;
        }
        throw new Error('Mock transaction exceeded optimistic retry limit.');
      }
      const tx = { get: mock.get, update: mock.update, set: mock.set };
      if (mock.retry) await callback(tx);
      return callback(tx);
    },
  }),
  FieldValue: { delete: () => 'delete-field', serverTimestamp: () => 'server-time' },
  Timestamp: { now: () => ({ toMillis: () => Date.now() }) },
}));

import {
  advanceTurn,
  beginOpenAirspacePhase,
  extendAirspaceWindow,
  setEmergencyTimerPaused,
  runMaintenance,
  setShipConsoleLock,
  setActiveRoleEnabled,
  setActiveRoleConfiguration,
  setCapybaraEnabled,
  setDioneEnabled,
  unlockPressAirspace,
} from './index';
import { recommendedRoleIds } from './roleConfiguration';

function request(data: Record<string, unknown>, uid: string | null = 'u1') {
  return { data, auth: uid === null ? undefined : { uid } } as CallableRequest<{
    sessionId: string; shipId: string; requestId: string; instanceId: string; action: string; expectedRevision: number;
  }>;
}

beforeEach(() => {
  mock.role = 'gm';
  mock.owner = 'u1';
  mock.gmInstanceOwners = {};
  mock.connected = true;
  mock.damage = {};
  mock.currentTurn = 1;
  mock.maintenanceCycles = {};
  mock.shuttleFuelled = {};
  mock.shipSurvivors = {};
  mock.capybaraEnabled = true;
  mock.dioneEnabled = true;
  mock.fleetSurvivorPopulationAdjustment = 0;
  mock.turnStartAnnouncement = undefined;
  mock.turnPhase = undefined;
  mock.race = undefined;
  mock.pressDispatch = undefined;
  mock.pressEnabled = true;
  mock.activeConsoleRoleId = undefined;
  mock.activeRoleIds = undefined;
  mock.retry = false;
  mock.randomInt.mockReset();
  mock.randomInt.mockReturnValue(3_100_000_000);
  mock.randomUUID.mockReset();
  mock.randomUUID.mockReturnValue('damage-event');
  mock.update.mockReset();
  mock.set.mockReset();
  mock.get.mockImplementation(async (path: string) => {
    if (path.includes('/maintenanceRequests/')) {
      return { exists: false, get: () => undefined };
    }
    if (path.includes('/maintenanceRollbackRequests/')) {
      return { exists: false, get: () => undefined };
    }
    if (path.includes('/maintenanceUndo/')) {
      return { exists: true, get: (key: string) => key === 'entries' ? [] : undefined };
    }
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
          shuttleFuelled: mock.shuttleFuelled,
          shipSurvivors: mock.shipSurvivors,
          fleetSurvivorPopulationAdjustment: mock.fleetSurvivorPopulationAdjustment,
          turnStartAnnouncement: mock.turnStartAnnouncement,
          capybaraEnabled: mock.capybaraEnabled,
          dioneEnabled: mock.dioneEnabled,
          turnPhase: mock.turnPhase,
          pressDispatch: mock.pressDispatch,
          pressEnabled: mock.pressEnabled,
          activeRoleIds: mock.activeRoleIds,
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

const data = { sessionId: 's1', shipId: 'aegis', requestId: 'maintenance-base', instanceId: 'bridge', action: 'begin', expectedRevision: 0 };


it('begins maintenance atomically with a server-owned revision', async () => {
  await expect(runMaintenance.run(request(data))).resolves.toMatchObject({ step: 1, revision: 1 });
  expect(mock.update).toHaveBeenCalledWith('sessions/s1', expect.objectContaining({
    'maintenanceCycles.aegis': expect.objectContaining({ step: 1, revision: 1 }),
  }));
});

it('commits maintenance resources, charges, fuel, and damage once across duplicate and stale CAS requests', async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-09-09T16:10:00.000Z'));
  mock.randomInt.mockImplementation((_min: number, max?: number) => max === 7 ? 1 : 0);
  const maintenance = {
    session: {
      phase: 'active', currentTurn: 1, maintenanceCycles: {},
      shipResources: { aegis: { ore: 0, fuel: 4, food: 8, water: 6, materials: 1, securityTeams: 9 } },
      shipDamage: { aegis: { damagedSystemIds: [], destroyed: false } },
      shipUnrest: { aegis: 0 }, shipSurvivors: { aegis: 2_500 },
      shuttleDockings: [{ shipId: 'aegis', shuttleId: 'starlight' }],
      shuttleCargo: { starlight: { ore: 2 } }, shuttleFuelled: { starlight: false },
      unrestAlerts: {}, populationAlerts: {}, capybaraEnabled: true, dioneEnabled: true,
    } as Record<string, unknown>,
    receipts: {}, undo: {}, events: {}, damageDraws: {},
  };
  let release!: () => void;
  const ready = new Promise<void>((resolve) => { release = resolve; });
  mock.race = { attempts: 0, ready, release, version: 0, barrier: true, maintenance };

  const duplicate = await Promise.all([
    runMaintenance.run(request({ ...data, requestId: 'maintenance-duplicate' })),
    runMaintenance.run(request({ ...data, requestId: 'maintenance-duplicate' })),
  ]);
  expect(duplicate.map((reply) => (reply as Record<string, unknown>).status).sort())
    .toEqual(['committed', 'replayed']);
  expect(mock.update).toHaveBeenCalledTimes(1);
  expect(Object.keys(maintenance.events)).toHaveLength(1);

  mock.race.barrier = false;
  const step = (action: string, expectedRevision: number, choices: Record<string, unknown> = {}) =>
    runMaintenance.run(request({
      ...data, action, expectedRevision, requestId: `maintenance-${action}`, ...choices,
    }));
  await step('storage', 1);
  await step('rations', 2, { foodLevel: 1, waterLevel: 1 });
  await step('unrest', 3);

  let riotRelease!: () => void;
  const riotReady = new Promise<void>((resolve) => { riotRelease = resolve; });
  mock.race.barrier = true;
  mock.race.attempts = 0;
  mock.race.ready = riotReady;
  mock.race.release = riotRelease;
  const randomCallsBeforeRiot = mock.randomInt.mock.calls.length;
  mock.update.mockClear();
  mock.set.mockClear();
  const riot = await Promise.all([
    runMaintenance.run(request({ ...data, action: 'riot', expectedRevision: 4, requestId: 'riot-a' })),
    runMaintenance.run(request({ ...data, action: 'riot', expectedRevision: 4, requestId: 'riot-b' })),
  ]);
  const committed = riot.find((reply) => (reply as Record<string, unknown>).status === 'committed') as Record<string, unknown>;
  const stale = riot.find((reply) => (reply as Record<string, unknown>).status === 'stale') as Record<string, unknown>;
  expect(committed).toMatchObject({ action: 'riot', expectedRevision: 4, committedRevision: 5 });
  expect(stale).toMatchObject({ status: 'stale', expectedRevision: 4, currentRevision: 5 });
  expect(mock.update).toHaveBeenCalledTimes(1);
  expect(mock.randomInt.mock.calls.length - randomCallsBeforeRiot).toBe(6);
  expect(Object.keys(maintenance.damageDraws)).toHaveLength(1);
  expect(Object.keys(maintenance.events).filter((path) => path.includes('/events/maintenance-riot-')))
    .toHaveLength(1);

  const staleReceiptPath = `sessions/s1/maintenanceRequests/${stale.requestId}`;
  expect(maintenance.receipts[staleReceiptPath]).toMatchObject({
    actorUid: 'u1', sessionId: 's1', shipId: 'aegis', action: 'riot',
    expectedRevision: 4, currentRevision: 5, reply: stale,
  });
  const staleRandomCalls = mock.randomInt.mock.calls.length;
  mock.update.mockClear();
  mock.set.mockClear();
  await expect(runMaintenance.run(request({
    ...data, action: 'riot', expectedRevision: 4, requestId: stale.requestId,
  }))).resolves.toEqual(stale);
  expect(mock.randomInt.mock.calls.length).toBe(staleRandomCalls);
  expect(mock.update).not.toHaveBeenCalled();
  expect(mock.set).not.toHaveBeenCalled();
  await expect(runMaintenance.run(request({
    ...data, action: 'begin', expectedRevision: 4, requestId: stale.requestId,
  }))).rejects.toMatchObject({ code: 'failed-precondition' });
  await expect(runMaintenance.run(request({
    ...data, action: 'riot', expectedRevision: 5, requestId: stale.requestId,
  }))).rejects.toMatchObject({ code: 'failed-precondition' });
  mock.owner = 'u2';
  await expect(runMaintenance.run(request({
    ...data, action: 'riot', expectedRevision: 4, requestId: stale.requestId,
  }, 'u2'))).rejects.toMatchObject({ code: 'failed-precondition' });
  mock.owner = 'u1';

  const randomCallsAfterCommit = mock.randomInt.mock.calls.length;
  mock.update.mockClear();
  mock.set.mockClear();
  maintenance.session.phase = 'closed';
  maintenance.session.unrestAlerts = { aegis: { shipId: 'aegis', shipName: 'AEGIS', targetGmInstanceIds: ['bridge'], createdAt: '2026-09-09T16:10:00.000Z' } };
  vi.setSystemTime(new Date('2026-09-09T16:20:00.000Z'));
  const replay = await step('riot', 4, { requestId: committed.requestId });
  expect(replay).toMatchObject({ status: 'replayed', requestId: committed.requestId, cycle: committed.cycle });
  expect((replay as Record<string, unknown>).serverTime).toBe('2026-09-09T16:10:00.000Z');
  expect(mock.randomInt.mock.calls.length).toBe(randomCallsAfterCommit);
  expect(mock.update).not.toHaveBeenCalled();
  expect(mock.set).not.toHaveBeenCalled();
  maintenance.session.phase = 'active';
  maintenance.session.unrestAlerts = {};

  await step('reactor', 5, { consoles: ['jump-drive'] });
  await step('bays', 6, { refuels: { 'shuttle-bay-zeta': 'starlight' } });
  await step('end', 7);

  const session = maintenance.session;
  expect((session.shipResources as Record<string, Record<string, number>>).aegis)
    .toMatchObject({ food: 5, water: 4, fuel: 3 });
  expect(session.maintenanceCycles).toMatchObject({
    aegis: expect.objectContaining({ step: 0, revision: 8, charges: ['jump-drive'], refuelled: ['starlight'] }),
  });
  expect(session.shuttleFuelled).toEqual({ starlight: true });
  expect(session.shipDamage).toEqual({
    aegis: { damagedSystemIds: ['fighter-bay-alpha'], destroyed: false },
  });
  expect(Object.keys(maintenance.receipts)).toHaveLength(9);
  const riotReceipt = maintenance.receipts[`sessions/s1/maintenanceRequests/${committed.requestId}`]!;
  const riotEvent = maintenance.events[`sessions/s1/events/maintenance-${committed.requestId}`]!;
  expect(riotReceipt).toMatchObject({
    actorUid: 'u1', sessionId: 's1', shipId: 'aegis', action: 'riot',
    expectedRevision: 4, committedRevision: 5, serverTime: '2026-09-09T16:10:00.000Z',
  });
  expect(riotReceipt.serverEntropy).toBe(0);
  expect(riotReceipt.serverRolls).toEqual([1, 1]);
  expect(riotEvent).toMatchObject({
    requestId: committed.requestId,
    serverTime: riotReceipt.serverTime,
    type: 'maintenance',
    action: 'riot',
    results: { '4': expect.stringContaining('Riot') },
  });
  expect(riotEvent).not.toHaveProperty('reply');
  expect(riotEvent).not.toHaveProperty('fingerprint');
  expect(riotEvent).not.toHaveProperty('serverEntropy');
  expect(riotEvent).not.toHaveProperty('serverRolls');
});

it('rejects Team maintenance while the server phase is Coordination', async () => {
  mock.turnPhase = {
    turn: 1,
    airspace: { state: 'lifted', tickerActive: false, pressAccess: false },
  };
  await expect(runMaintenance.run(request(data))).rejects.toMatchObject({
    code: 'failed-precondition',
    message: expect.stringMatching(/team phase/i),
  });
  expect(mock.update).not.toHaveBeenCalled();
});
it('denies unauthenticated, disconnected, unassigned players and foreign GM instances', async () => {
  await expect(runMaintenance.run(request(data, null))).rejects.toMatchObject({ code: 'unauthenticated' });
  mock.connected = false;
  await expect(runMaintenance.run(request(data))).rejects.toMatchObject({ code: 'permission-denied' });
  mock.connected = true; mock.role = 'player';
  await expect(runMaintenance.run(request(data))).rejects.toMatchObject({ code: 'permission-denied' });
  mock.role = 'gm'; mock.owner = 'someone-else';
  await expect(runMaintenance.run(request(data))).rejects.toMatchObject({ code: 'permission-denied' });
  expect(mock.update).not.toHaveBeenCalled();
});
it('rejects invalid steps and client-supplied dice', async () => {
  await expect(runMaintenance.run(request({ ...data, requestId: undefined }))).rejects.toMatchObject({ code: 'invalid-argument' });
  await expect(runMaintenance.run(request({ ...data, requestId: 'maintenance/invalid' }))).rejects.toMatchObject({ code: 'invalid-argument' });
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
  mock.activeRoleIds = recommendedRoleIds(14);
  mock.get.mockImplementation(async (path: string) => path.includes('/maintenanceRequests/')
    ? { exists: false, get: () => undefined } : ({
    exists: true,
    get: (key: string) => path.includes('/players/')
      ? ({ connected: true, role: 'player', activeConsoleRoleId: 'joint-engineering-quellon-refinery' } as Record<string, unknown>)[key]
      : ({ activeRoleIds: mock.activeRoleIds } as Record<string, unknown>)[key],
  }));
  await expect(runMaintenance.run(request({ ...data, shipId: 'quellon' }))).resolves.toMatchObject({ step: 1 });
  await expect(runMaintenance.run(request({ ...data, shipId: 'shepherd' }))).rejects.toMatchObject({ code: 'permission-denied' });
});

it('accepts the paired Joint Engineering console identity for its maintenance workspace', async () => {
  mock.activeRoleIds = recommendedRoleIds(14);
  mock.get.mockImplementation(async (path: string) => path.includes('/maintenanceRequests/')
    ? { exists: false, get: () => undefined } : ({
    exists: true,
    get: (key: string) => path.includes('/players/')
      ? ({ connected: true, role: 'player', activeConsoleRoleId: 'joint-engineering-quellon-refinery' } as Record<string, unknown>)[key]
      : ({ activeRoleIds: mock.activeRoleIds } as Record<string, unknown>)[key],
  }));

  await expect(runMaintenance.run(request({
    ...data,
    shipId: 'quellon',
    consoleRoleId: 'joint-engineering-quellon-refinery',
  }))).resolves.toMatchObject({ step: 1 });
  await expect(runMaintenance.run(request({
    ...data,
    shipId: 'shepherd',
    consoleRoleId: 'joint-engineering-quellon-refinery',
  }))).rejects.toMatchObject({ code: 'invalid-argument' });
});

it('revokes maintenance when the assigned ship role is removed from the live roster', async () => {
  mock.role = 'player';
  mock.activeConsoleRoleId = 'dione-engineer';
  mock.activeRoleIds = ['dione-captain'];

  await expect(runMaintenance.run(request({
    ...data,
    shipId: 'dione',
    consoleRoleId: 'dione-engineer',
  }))).rejects.toMatchObject({ code: 'permission-denied' });
  expect(mock.update).not.toHaveBeenCalled();
});

it('does not let a GM add a Union role alongside the engineers it replaces', async () => {
  await expect(setActiveRoleEnabled.run(request({
    sessionId: 's1',
    instanceId: 'bridge',
    roleId: 'joint-engineering-quellon-refinery',
    enabled: true,
  }))).rejects.toMatchObject({ code: 'failed-precondition' });
  expect(mock.update).not.toHaveBeenCalled();
});

it('retires the partial role configuration callable and preserves invalid-combination denial', async () => {
  const validRoleIds = recommendedRoleIds(14);
  await expect(setActiveRoleConfiguration.run(request({
    sessionId: 's1',
    instanceId: 'bridge',
    activeRoleIds: validRoleIds,
  }))).rejects.toMatchObject({
    code: 'failed-precondition', message: expect.stringMatching(/confirmSetup/i),
  });
  expect(mock.update).not.toHaveBeenCalled();

  await expect(setActiveRoleConfiguration.run(request({
    sessionId: 's1',
    instanceId: 'bridge',
    activeRoleIds: [
      'admiral',
      'joint-engineering-quellon-refinery',
      'quellon-engineer',
    ],
  }))).rejects.toMatchObject({ code: 'failed-precondition' });
  expect(mock.update).not.toHaveBeenCalled();
});

it('retires every legacy setup mutator behind the complete confirmSetup transaction', async () => {
  const commands = [
    () => setActiveRoleEnabled.run(request({
      sessionId: 's1', instanceId: 'bridge', roleId: 'admiral', enabled: false,
    })),
    () => setActiveRoleConfiguration.run(request({
      sessionId: 's1', instanceId: 'bridge', activeRoleIds: recommendedRoleIds(14),
    })),
    () => import('./index').then(({ applyRolePreset }) => applyRolePreset.run(request({
      sessionId: 's1', instanceId: 'bridge', playerCount: 14,
    }))),
    () => setCapybaraEnabled.run(request({
      sessionId: 's1', instanceId: 'bridge', capybaraEnabled: false,
    })),
    () => setDioneEnabled.run(request({
      sessionId: 's1', instanceId: 'bridge', dioneEnabled: false,
    })),
  ];

  for (const command of commands) {
    await expect(command()).rejects.toMatchObject({
      code: 'failed-precondition', message: expect.stringMatching(/confirmSetup/i),
    });
  }
  expect(mock.update).not.toHaveBeenCalled();
});

it('rejects illegal phase transitions and advances only valid numbered turns with the configured schedule', async () => {
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
  mock.update.mockClear();
  mock.set.mockClear();
  await expect(advanceTurn.run(request({
    sessionId: 's1', instanceId: 'bridge', expectedTurn: 0,
  }))).rejects.toMatchObject({
    code: 'failed-precondition',
    message: expect.stringMatching(/turn 0|setup/i),
  });
  expect(mock.update).not.toHaveBeenCalled();
  expect(mock.set).not.toHaveBeenCalled();

  mock.currentTurn = 1;
  mock.update.mockClear();
  mock.set.mockClear();
  await expect(advanceTurn.run(request({
    sessionId: 's1', instanceId: 'bridge', expectedTurn: 1, overridePhaseTimer: true,
  }))).rejects.toMatchObject({
    code: 'failed-precondition',
    message: expect.stringMatching(/valid current server phase/i),
  });
  expect(mock.update).not.toHaveBeenCalled();
  expect(mock.set).not.toHaveBeenCalled();

  mock.turnPhase = { turn: 1, teamPhaseEndsAt: 'not-a-timestamp', openAirspaceEndsAt: 'not-a-timestamp' };
  mock.update.mockClear();
  mock.set.mockClear();
  await expect(advanceTurn.run(request({
    sessionId: 's1', instanceId: 'bridge', expectedTurn: 1, overridePhaseTimer: true,
  }))).rejects.toMatchObject({
    code: 'failed-precondition',
    message: expect.stringMatching(/valid current server phase/i),
  });
  expect(mock.update).not.toHaveBeenCalled();
  expect(mock.set).not.toHaveBeenCalled();

  mock.turnPhase = {
    turn: 2,
    teamPhaseEndsAt: '2026-09-06T11:55:00.000Z',
    openAirspaceEndsAt: '2026-09-06T11:59:00.000Z',
    airspace: { state: 'restricted', tickerActive: true, pressAccess: false },
  };
  mock.update.mockClear();
  mock.set.mockClear();
  await expect(advanceTurn.run(request({
    sessionId: 's1', instanceId: 'bridge', expectedTurn: 1, overridePhaseTimer: true,
  }))).rejects.toMatchObject({
    code: 'failed-precondition',
    message: expect.stringMatching(/valid current server phase/i),
  });
  expect(mock.update).not.toHaveBeenCalled();
  expect(mock.set).not.toHaveBeenCalled();

  mock.fleetSurvivorPopulationAdjustment = 41;
  mock.turnPhase = {
    turn: 1,
    teamPhaseEndsAt: '2026-09-06T12:10:00.000Z',
    openAirspaceEndsAt: '2026-09-06T12:30:00.000Z',
    airspace: { state: 'restricted', tickerActive: true, pressAccess: false },
  };
  mock.update.mockClear();
  await expect(advanceTurn.run(request({
    sessionId: 's1', instanceId: 'bridge', expectedTurn: 1,
  }))).rejects.toMatchObject({
    code: 'failed-precondition',
    message: expect.stringMatching(/phase|timer/i),
  });
  expect(mock.update).not.toHaveBeenCalled();

  mock.turnPhase = {
    turn: 1,
    teamPhaseEndsAt: '2026-09-06T11:55:00.000Z',
    openAirspaceEndsAt: '2026-09-06T11:59:00.000Z',
    airspace: { state: 'restricted', tickerActive: true, pressAccess: false },
  };
  mock.update.mockClear();
  mock.set.mockClear();
  await expect(advanceTurn.run(request({
    sessionId: 's1', instanceId: 'bridge', expectedTurn: 1,
  }))).rejects.toMatchObject({
    code: 'failed-precondition',
    message: expect.stringMatching(/coordination|phase/i),
  });
  expect(mock.update).not.toHaveBeenCalled();
  expect(mock.set).not.toHaveBeenCalled();

  await expect(advanceTurn.run(request({
    sessionId: 's1', instanceId: 'bridge', expectedTurn: 1, overridePhaseTimer: true,
  }))).resolves.toEqual({
    currentTurn: 2,
    turnStartAnnouncement: { turn: 2, survivorPopulation: 156_041 },
    maintenanceCycles: {},
    shuttleFuelled: {},
    turnPhase: {
      turn: 2,
      teamPhaseEndsAt: '2026-09-06T12:05:00.000Z',
      openAirspaceEndsAt: '2026-09-06T12:20:00.000Z',
      airspace: { state: 'restricted', tickerActive: true, pressAccess: false },
    },
  });
  expect(mock.update).toHaveBeenCalledWith('sessions/s1', expect.objectContaining({
    currentTurn: 2,
    turnStartAnnouncement: { turn: 2, survivorPopulation: 156_041 },
    fleetSurvivorPopulationAdjustment: 40,
    turnPhase: expect.objectContaining({ turn: 2 }),
  }));
  expect(mock.set).toHaveBeenCalledWith(
    'sessions/s1/events/turn-advanced-1',
    expect.objectContaining({ reason: 'override', revision: 2 }),
  );

  mock.currentTurn = 2;
  mock.fleetSurvivorPopulationAdjustment = 41;
  mock.maintenanceCycles = {
    aegis: {
      step: 0,
      revision: 8,
      turn: 2,
      results: { '7': 'Maintenance cycle complete.' },
      charges: ['jump-drive'],
      refuelled: ['starlight'],
    },
  };
  mock.shuttleFuelled = { starlight: true };
  mock.turnPhase = {
    turn: 2,
    teamPhaseEndsAt: '2026-09-06T11:55:00.000Z',
    openAirspaceEndsAt: '2026-09-06T11:59:00.000Z',
    airspace: { state: 'lifted', tickerActive: true, pressAccess: false },
  };
  mock.update.mockClear();
  mock.set.mockClear();
  await expect(advanceTurn.run(request({
    sessionId: 's1', instanceId: 'bridge', expectedTurn: 2,
  }))).resolves.toEqual({
    currentTurn: 3,
    turnStartAnnouncement: { turn: 3, survivorPopulation: 156_041 },
    maintenanceCycles: {
      aegis: expect.objectContaining({ charges: [], refuelled: [] }),
    },
    shuttleFuelled: { starlight: false },
    turnPhase: {
      turn: 3,
      teamPhaseEndsAt: '2026-09-06T12:05:00.000Z',
      openAirspaceEndsAt: '2026-09-06T12:20:00.000Z',
      airspace: { state: 'restricted', tickerActive: true, pressAccess: false },
    },
  });
  expect(mock.update).toHaveBeenCalledTimes(1);
  expect(mock.set).toHaveBeenCalledTimes(1);
  expect(mock.set).toHaveBeenCalledWith(
    'sessions/s1/events/turn-advanced-2',
    expect.objectContaining({
      reason: 'expiry',
      fromTurn: 2,
      toTurn: 3,
      revision: 4,
    }),
  );

  mock.update.mockClear();
  mock.set.mockClear();
  await expect(advanceTurn.run(request({
    sessionId: 's1', instanceId: 'bridge', expectedTurn: 0,
  }))).rejects.toMatchObject({ code: 'failed-precondition' });
  expect(mock.update).not.toHaveBeenCalled();
  expect(mock.set).not.toHaveBeenCalled();
});

it('expires charged consoles and shuttle fuel when a numbered turn hands off', async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-09-06T12:20:00.000Z'));
  mock.currentTurn = 2;
  mock.maintenanceCycles = {
    aegis: {
      step: 0,
      revision: 8,
      turn: 2,
      results: { '7': 'Maintenance cycle complete.' },
      charges: ['jump-drive', 'fighter-bay-alpha'],
      refuelled: ['starlight'],
      completedAt: '2026-09-06T12:10:00.000Z',
    },
  };
  mock.shuttleFuelled = { starlight: true, pallas: false };
  mock.turnPhase = {
    turn: 2,
    teamPhaseEndsAt: '2026-09-06T12:05:00.000Z',
    openAirspaceEndsAt: '2026-09-06T12:20:00.000Z',
    airspace: { state: 'lifted', tickerActive: true, pressAccess: false },
  };

  await expect(advanceTurn.run(request({
    sessionId: 's1', instanceId: 'bridge', expectedTurn: 2,
  }))).resolves.toMatchObject({ currentTurn: 3 });

  expect(mock.update).toHaveBeenCalledWith('sessions/s1', expect.objectContaining({
    maintenanceCycles: {
      aegis: expect.objectContaining({
        step: 0,
        revision: 8,
        charges: [],
        refuelled: [],
      }),
    },
    shuttleFuelled: { starlight: false, pallas: false },
  }));
  const patch = mock.update.mock.calls.at(-1)?.[1] as Record<string, unknown>;
  expect(patch).not.toHaveProperty('shuttleDockings');
  expect(patch).not.toHaveProperty('shuttleCargo');
  expect(patch).not.toHaveProperty('shipResources');
});

it('keeps the authoritative fleet total non-negative when a numbered turn begins at zero', async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-09-06T12:20:00.000Z'));
  mock.currentTurn = 1;
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
  mock.fleetSurvivorPopulationAdjustment = -156_000;
  mock.turnPhase = {
    turn: 1,
    teamPhaseEndsAt: '2026-09-06T12:05:00.000Z',
    openAirspaceEndsAt: '2026-09-06T12:20:00.000Z',
    airspace: { state: 'lifted', tickerActive: true, pressAccess: false },
  };

  await expect(advanceTurn.run(request({
    sessionId: 's1', instanceId: 'bridge', expectedTurn: 1,
  }))).resolves.toMatchObject({
    currentTurn: 2,
    turnStartAnnouncement: { turn: 2, survivorPopulation: 42 },
  });
  expect(mock.update).toHaveBeenCalledWith('sessions/s1', expect.objectContaining({
    fleetSurvivorPopulationAdjustment: -155_959,
  }));
});

it('skips the numbered-turn fullscreen transmission when requested', async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-09-06T12:00:00.000Z'));
  mock.currentTurn = 1;
  mock.turnStartAnnouncement = { turn: 1, survivorPopulation: 156_042 };
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
  mock.turnPhase = {
    turn: 1,
    teamPhaseEndsAt: '2026-09-06T11:55:00.000Z',
    openAirspaceEndsAt: '2026-09-06T11:59:00.000Z',
    airspace: { state: 'lifted', tickerActive: true, pressAccess: false },
  };

  await expect(advanceTurn.run(request({
    sessionId: 's1', instanceId: 'bridge', expectedTurn: 1,
    skipTurnStartAnnouncement: true,
  }))).resolves.toEqual({
    currentTurn: 2,
    maintenanceCycles: {},
    shuttleFuelled: {},
    turnPhase: {
      turn: 2,
      teamPhaseEndsAt: '2026-09-06T12:05:00.000Z',
      openAirspaceEndsAt: '2026-09-06T12:20:00.000Z',
      airspace: { state: 'restricted', tickerActive: true, pressAccess: false },
    },
  });
  expect(mock.update).toHaveBeenCalledWith('sessions/s1', expect.objectContaining({
    currentTurn: 2,
    turnStartAnnouncement: 'delete-field',
  }));
});

it('turns the ticker into an open-airspace bulletin after the team timer expires', async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-09-06T12:04:59.999Z'));
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
  }))).rejects.toMatchObject({
    code: 'failed-precondition',
    message: expect.stringMatching(/timer is still active/i),
  });
  expect(mock.update).not.toHaveBeenCalled();
  expect(mock.set).not.toHaveBeenCalled();

  vi.setSystemTime(new Date('2026-09-06T12:05:00.000Z'));
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
  const expected = {
    turn: 2,
    teamPhaseEndsAt: '2026-09-06T12:05:00.000Z',
    openAirspaceEndsAt: '2026-09-06T12:20:00.000Z',
    airspace: { state: 'lifted', tickerActive: true, pressAccess: true },
  };
  mock.turnPhase = expected;
  expect(mock.update).toHaveBeenCalledWith('sessions/s1', expect.objectContaining({
    turnPhase: expect.objectContaining({
      airspace: { state: 'lifted', tickerActive: true, pressAccess: true },
    }),
  }));
  expect(mock.set).toHaveBeenCalledWith(
    'sessions/s1/events/airspace-opened-2',
    expect.objectContaining({
      type: 'airspace-opened',
      sessionId: 's1',
      actorUid: 'system',
      actorRoleId: null,
      turn: 2,
      phase: 'active',
      requestId: 'airspace-opened-2',
      revision: 3,
      serverTime: '2026-09-06T12:05:00.000Z',
      visibility: 'member',
      transition: 'restricted-to-lifted',
      createdAt: 'server-time',
    }),
  );

  mock.update.mockClear();
  mock.set.mockClear();
  await expect(beginOpenAirspacePhase.run(request({
    sessionId: 's1', expectedTurn: 2,
  }))).resolves.toEqual({ turnPhase: expected });
  expect(mock.update).not.toHaveBeenCalled();
  expect(mock.set).not.toHaveBeenCalled();

  mock.currentTurn = 3;
  await expect(beginOpenAirspacePhase.run(request({
    sessionId: 's1', expectedTurn: 2,
  }))).rejects.toMatchObject({
    code: 'failed-precondition',
    message: expect.stringMatching(/turn changed/i),
  });
  expect(mock.update).not.toHaveBeenCalled();
  expect(mock.set).not.toHaveBeenCalled();

  mock.currentTurn = 2;
  await expect(runMaintenance.run(request(data))).rejects.toMatchObject({
    code: 'failed-precondition',
    message: expect.stringMatching(/team phase/i),
  });
  expect(mock.update).not.toHaveBeenCalled();
  expect(mock.set).not.toHaveBeenCalled();
});

it('serializes simultaneous airspace expiry observers into one transition event', async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-09-06T12:05:07.000Z'));
  mock.role = 'player';
  mock.activeConsoleRoleId = 'admiral';
  mock.currentTurn = 1;
  mock.turnPhase = {
    turn: 1,
    teamPhaseEndsAt: '2026-09-06T12:05:00.000Z',
    openAirspaceEndsAt: '2026-09-06T12:20:00.000Z',
    airspace: { state: 'restricted', tickerActive: true, pressAccess: false },
  };
  let release!: () => void;
  const ready = new Promise<void>((resolve) => { release = resolve; });
  mock.race = { attempts: 0, ready, release, version: 0 };

  const [first, second] = await Promise.all([
    beginOpenAirspacePhase.run(request({ sessionId: 's1', expectedTurn: 1 }, 'u1')),
    unlockPressAirspace.run(request({ sessionId: 's1' }, 'u2')),
  ]);

  const expected = {
    turn: 1,
    teamPhaseEndsAt: '2026-09-06T12:05:00.000Z',
    openAirspaceEndsAt: '2026-09-06T12:20:00.000Z',
    airspace: { state: 'lifted', tickerActive: true, pressAccess: false },
  };
  expect(first).toEqual({ turnPhase: expected });
  expect(second).toEqual({ turnPhase: expected });
  expect(mock.update).toHaveBeenCalledTimes(1);
  expect(mock.set).toHaveBeenCalledTimes(1);
  expect(mock.set).toHaveBeenCalledWith(
    'sessions/s1/events/airspace-opened-1',
    expect.objectContaining({
      type: 'airspace-opened',
      sessionId: 's1',
      actorUid: 'system',
      actorRoleId: null,
      turn: 1,
      phase: 'active',
      requestId: 'airspace-opened-1',
      revision: 1,
      serverTime: '2026-09-06T12:05:07.000Z',
      visibility: 'member',
      transition: 'restricted-to-lifted',
      createdAt: 'server-time',
    }),
  );

  mock.update.mockClear();
  mock.set.mockClear();
  await expect(beginOpenAirspacePhase.run(request({ sessionId: 's1', expectedTurn: 1 }, 'u3')))
    .resolves.toEqual({ turnPhase: expected });
  expect(mock.update).not.toHaveBeenCalled();
  expect(mock.set).not.toHaveBeenCalled();

  vi.setSystemTime(new Date('2026-09-06T12:20:07.000Z'));
  mock.role = 'gm';
  mock.activeConsoleRoleId = undefined;
  mock.currentTurn = 1;
  mock.turnPhase = {
    turn: 1,
    teamPhaseEndsAt: '2026-09-06T12:05:00.000Z',
    openAirspaceEndsAt: '2026-09-06T12:20:00.000Z',
    airspace: { state: 'lifted', tickerActive: true, pressAccess: false },
  };
  mock.maintenanceCycles = {
    aegis: {
      step: 0,
      revision: 3,
      turn: 1,
      results: { '7': 'Maintenance cycle complete.' },
      charges: ['jump-drive'],
      refuelled: ['starlight'],
    },
  };
  mock.shuttleFuelled = { starlight: true, pallas: false };
  mock.gmInstanceOwners = { 'bridge-a': 'u1', 'bridge-b': 'u2' };
  mock.update.mockClear();
  mock.set.mockClear();
  let advanceRelease!: () => void;
  const advanceReady = new Promise<void>((resolve) => { advanceRelease = resolve; });
  mock.race = { attempts: 0, ready: advanceReady, release: advanceRelease, version: 0 };

  const advanceOutcomes = await Promise.allSettled([
    advanceTurn.run(request({ sessionId: 's1', instanceId: 'bridge-a', expectedTurn: 1 }, 'u1')),
    advanceTurn.run(request({ sessionId: 's1', instanceId: 'bridge-b', expectedTurn: 1 }, 'u2')),
  ]);
  const fulfilled = advanceOutcomes.filter(
    (outcome): outcome is PromiseFulfilledResult<unknown> => outcome.status === 'fulfilled',
  );
  const rejected = advanceOutcomes.filter(
    (outcome): outcome is PromiseRejectedResult => outcome.status === 'rejected',
  );
  const winningUid = advanceOutcomes[0]?.status === 'fulfilled' ? 'u1' : 'u2';
  expect(fulfilled).toHaveLength(1);
  expect(rejected).toHaveLength(1);
  expect(fulfilled[0]?.value).toMatchObject({
    currentTurn: 2,
    turnPhase: {
      turn: 2,
      teamPhaseEndsAt: '2026-09-06T12:25:07.000Z',
      openAirspaceEndsAt: '2026-09-06T12:40:07.000Z',
      airspace: { state: 'restricted', tickerActive: true, pressAccess: false },
    },
  });
  expect(rejected[0]?.reason).toMatchObject({
    code: 'failed-precondition',
    message: expect.stringMatching(/turn changed/i),
  });
  expect(mock.currentTurn).toBe(2);
  expect(mock.update).toHaveBeenCalledTimes(1);
  expect(mock.set).toHaveBeenCalledTimes(1);
  expect(mock.maintenanceCycles).toEqual({
    aegis: expect.objectContaining({ charges: [], refuelled: [] }),
  });
  expect(mock.shuttleFuelled).toEqual({ starlight: false, pallas: false });
  expect(mock.set).toHaveBeenCalledWith(
    'sessions/s1/events/turn-advanced-1',
    expect.objectContaining({
      sessionId: 's1',
      actorUid: winningUid,
      actorRoleId: null,
      turn: 1,
      phase: 'active',
      type: 'turn-advanced',
      requestId: 'turn-advanced-1',
      revision: 2,
      serverTime: '2026-09-06T12:20:07.000Z',
      visibility: 'member',
      transition: 'coordination-to-next-turn',
      fromTurn: 1,
      toTurn: 2,
      reason: 'expiry',
      createdAt: 'server-time',
    }),
  );

  mock.race = undefined;
  mock.update.mockClear();
  mock.set.mockClear();
  await expect(advanceTurn.run(request({
    sessionId: 's1', instanceId: 'bridge-a', expectedTurn: 1,
  }))).rejects.toMatchObject({ code: 'failed-precondition' });
  expect(mock.update).not.toHaveBeenCalled();
  expect(mock.set).not.toHaveBeenCalled();

  mock.turnPhase = {
    turn: 2,
    teamPhaseEndsAt: '2026-09-06T12:20:00.000Z',
    openAirspaceEndsAt: '2026-09-06T12:35:00.000Z',
    airspace: { state: 'restricted', tickerActive: true, pressAccess: false },
  };
  mock.update.mockClear();
  mock.set.mockClear();
  await expect(beginOpenAirspacePhase.run(request({ sessionId: 's1', expectedTurn: 2 })))
    .resolves.toMatchObject({ turnPhase: { turn: 2, airspace: { state: 'lifted' } } });
  expect(mock.set).toHaveBeenCalledWith(
    'sessions/s1/events/airspace-opened-2',
    expect.objectContaining({
      type: 'airspace-opened',
      requestId: 'airspace-opened-2',
      revision: 3,
      serverTime: '2026-09-06T12:20:07.000Z',
    }),
  );
});

it('lets the active GM add five minutes to a live restricted window', async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-09-06T12:00:00.000Z'));
  mock.currentTurn = 2;
  mock.turnPhase = {
    turn: 2,
    teamPhaseEndsAt: '2026-09-06T12:05:00.000Z',
    openAirspaceEndsAt: '2026-09-06T12:20:00.000Z',
    airspace: { state: 'restricted', tickerActive: true, pressAccess: false },
  };

  await expect(extendAirspaceWindow.run(request({
    sessionId: 's1', instanceId: 'bridge', expectedTurn: 2, window: 'restricted',
  }))).resolves.toEqual({
    turnPhase: {
      turn: 2,
      teamPhaseEndsAt: '2026-09-06T12:10:00.000Z',
      openAirspaceEndsAt: '2026-09-06T12:25:00.000Z',
      airspace: { state: 'restricted', tickerActive: true, pressAccess: false },
    },
  });
  expect(mock.update).toHaveBeenCalledWith('sessions/s1', expect.objectContaining({
    turnPhase: {
      turn: 2,
      teamPhaseEndsAt: '2026-09-06T12:10:00.000Z',
      openAirspaceEndsAt: '2026-09-06T12:25:00.000Z',
      airspace: { state: 'restricted', tickerActive: true, pressAccess: false },
    },
  }));
});

it('lets the active GM add five minutes to a live open window', async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-09-06T12:10:00.000Z'));
  mock.currentTurn = 2;
  mock.turnPhase = {
    turn: 2,
    teamPhaseEndsAt: '2026-09-06T12:05:00.000Z',
    openAirspaceEndsAt: '2026-09-06T12:20:00.000Z',
    airspace: { state: 'lifted', tickerActive: true, pressAccess: false },
  };

  await expect(extendAirspaceWindow.run(request({
    sessionId: 's1', instanceId: 'bridge', expectedTurn: 2, window: 'open',
  }))).resolves.toEqual({
    turnPhase: {
      turn: 2,
      teamPhaseEndsAt: '2026-09-06T12:05:00.000Z',
      openAirspaceEndsAt: '2026-09-06T12:25:00.000Z',
      airspace: { state: 'lifted', tickerActive: true, pressAccess: false },
    },
  });
});

it('rejects stale, inactive-window, and non-GM airspace extensions without writing', async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-09-06T12:00:00.000Z'));
  mock.currentTurn = 2;
  mock.turnPhase = {
    turn: 2,
    teamPhaseEndsAt: '2026-09-06T12:05:00.000Z',
    openAirspaceEndsAt: '2026-09-06T12:20:00.000Z',
    airspace: { state: 'restricted', tickerActive: true, pressAccess: false },
  };

  mock.role = 'player';
  await expect(extendAirspaceWindow.run(request({
    sessionId: 's1', instanceId: 'bridge', expectedTurn: 2, window: 'restricted',
  }))).rejects.toMatchObject({ code: 'permission-denied' });
  mock.role = 'gm';

  await expect(extendAirspaceWindow.run(request({
    sessionId: 's1', instanceId: 'bridge', expectedTurn: 1, window: 'restricted',
  }))).rejects.toMatchObject({ code: 'failed-precondition' });
  await expect(extendAirspaceWindow.run(request({
    sessionId: 's1', instanceId: 'bridge', expectedTurn: 2, window: 'open',
  }))).rejects.toMatchObject({ code: 'failed-precondition' });
  expect(mock.update).not.toHaveBeenCalled();
});

it('lets only the active GM pause and resume a live turn clock with an audit event', async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-09-06T12:02:00.000Z'));
  mock.currentTurn = 2;
  mock.turnPhase = {
    turn: 2,
    teamPhaseEndsAt: '2026-09-06T12:05:00.000Z',
    openAirspaceEndsAt: '2026-09-06T12:20:00.000Z',
    airspace: { state: 'restricted', tickerActive: true, pressAccess: false },
  };
  mock.randomUUID.mockReturnValue('pause-event');

  await expect(setEmergencyTimerPaused.run(request({
    sessionId: 's1', instanceId: 'bridge', expectedTurn: 2, paused: true,
  }))).resolves.toEqual({
    turnPhase: {
      ...mock.turnPhase,
      timerPause: {
        window: 'restricted', remainingMs: 180_000,
        pausedAt: '2026-09-06T12:02:00.000Z',
      },
    },
  });
  expect(mock.update).toHaveBeenCalledWith('sessions/s1', expect.objectContaining({
    turnPhase: expect.objectContaining({
      timerPause: {
        window: 'restricted', remainingMs: 180_000,
        pausedAt: '2026-09-06T12:02:00.000Z',
      },
    }),
  }));
  expect(mock.set).toHaveBeenCalledWith('sessions/s1/events/pause-event', expect.objectContaining({
    type: 'timer-pause', action: 'paused', turn: 2, window: 'restricted',
    actorName: 'GM', createdAt: 'server-time',
  }));

  mock.turnPhase = {
    ...mock.turnPhase!,
    timerPause: {
      window: 'restricted', remainingMs: 180_000,
      pausedAt: '2026-09-06T12:02:00.000Z',
    },
  };
  mock.update.mockClear();
  mock.set.mockClear();
  await expect(setEmergencyTimerPaused.run(request({
    sessionId: 's1', instanceId: 'bridge', expectedTurn: 2, paused: true,
  }))).resolves.toEqual({ turnPhase: mock.turnPhase });
  expect(mock.update).not.toHaveBeenCalled();
  expect(mock.set).not.toHaveBeenCalled();

  vi.setSystemTime(new Date('2026-09-06T12:04:00.000Z'));
  await expect(setEmergencyTimerPaused.run(request({
    sessionId: 's1', instanceId: 'bridge', expectedTurn: 2, paused: false,
  }))).resolves.toEqual({
    turnPhase: {
      turn: 2,
      teamPhaseEndsAt: '2026-09-06T12:07:00.000Z',
      openAirspaceEndsAt: '2026-09-06T12:22:00.000Z',
      airspace: { state: 'restricted', tickerActive: true, pressAccess: false },
    },
  });
  expect(mock.set).toHaveBeenCalledWith('sessions/s1/events/pause-event', expect.objectContaining({
    type: 'timer-pause', action: 'resumed', turn: 2, window: 'restricted',
  }));
});

it('denies stale, expired, Turn 0, and non-GM emergency timer requests without writing', async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-09-06T12:02:00.000Z'));
  mock.currentTurn = 2;
  mock.turnPhase = {
    turn: 2,
    teamPhaseEndsAt: '2026-09-06T12:05:00.000Z',
    openAirspaceEndsAt: '2026-09-06T12:20:00.000Z',
    airspace: { state: 'restricted', tickerActive: true, pressAccess: false },
  };

  mock.role = 'player';
  await expect(setEmergencyTimerPaused.run(request({
    sessionId: 's1', instanceId: 'bridge', expectedTurn: 2, paused: true,
  }))).rejects.toMatchObject({ code: 'permission-denied' });
  mock.role = 'gm';
  await expect(setEmergencyTimerPaused.run(request({
    sessionId: 's1', instanceId: 'bridge', expectedTurn: 1, paused: true,
  }))).rejects.toMatchObject({ code: 'failed-precondition' });
  mock.currentTurn = 0;
  mock.turnPhase = undefined;
  await expect(setEmergencyTimerPaused.run(request({
    sessionId: 's1', instanceId: 'bridge', expectedTurn: 0, paused: true,
  }))).rejects.toMatchObject({ code: 'invalid-argument' });
  mock.currentTurn = 2;
  mock.turnPhase = {
    turn: 2,
    teamPhaseEndsAt: '2026-09-06T12:05:00.000Z',
    openAirspaceEndsAt: '2026-09-06T12:20:00.000Z',
    airspace: { state: 'restricted', tickerActive: true, pressAccess: false },
  };
  vi.setSystemTime(new Date('2026-09-06T12:21:00.000Z'));
  await expect(setEmergencyTimerPaused.run(request({
    sessionId: 's1', instanceId: 'bridge', expectedTurn: 2, paused: true,
  }))).rejects.toMatchObject({ code: 'failed-precondition' });
  expect(mock.update).not.toHaveBeenCalled();
  expect(mock.set).not.toHaveBeenCalled();
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
  expect(mock.set).not.toHaveBeenCalled();

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

it('denies Press airspace unlock while Press is disabled without writing', async () => {
  mock.role = 'player';
  mock.activeConsoleRoleId = 'admiral';
  mock.pressEnabled = false;
  mock.turnPhase = {
    turn: 1,
    teamPhaseEndsAt: '2026-09-06T12:10:00.000Z',
    openAirspaceEndsAt: '2026-09-06T12:30:00.000Z',
    airspace: { state: 'restricted', tickerActive: true, pressAccess: false },
  };

  await expect(unlockPressAirspace.run(request({ sessionId: 's1' }))).rejects.toMatchObject({
    code: 'failed-precondition',
    message: expect.stringMatching(/press.*disabled/i),
  });
  expect(mock.update).not.toHaveBeenCalled();
  expect(mock.set).not.toHaveBeenCalled();
});

it('holds the player ICN travel lock at Turn 0', async () => {
  mock.role = 'player';
  mock.activeConsoleRoleId = 'admiral';
  mock.currentTurn = 0;

  await expect(setShipConsoleLock.run(request({
    sessionId: 's1', shipId: 'aegis', locked: true,
  }))).rejects.toMatchObject({
    code: 'failed-precondition',
    message: expect.stringMatching(/turn 1/i),
  });
  expect(mock.update).not.toHaveBeenCalled();
});

it('holds every maintenance cycle at Turn 0, including the GM path', async () => {
  mock.currentTurn = 0;

  await expect(runMaintenance.run(request(data))).rejects.toMatchObject({
    code: 'failed-precondition',
    message: expect.stringMatching(/turn 1/i),
  });
  expect(mock.update).not.toHaveBeenCalled();
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
    if (path.includes('/maintenanceRequests/')) return { exists: false, get: () => undefined };
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
    await expect(rollbackMaintenance.run(request({ sessionId: 's1', shipId: 'aegis', instanceId: 'bridge', requestId: `rollback-denied-${role}`, expectedRevision: 1 }))).rejects.toMatchObject({ code: 'permission-denied' });
  }
  expect(mock.update).not.toHaveBeenCalled();
});
it('lets a GM roll back the latest maintenance step with a new revision', async () => {
  const { rollbackMaintenance } = await import('./index');
  const previous = mock.get.getMockImplementation()!;
  mock.maintenanceCycles = { aegis: { step: 2, revision: 2 } };
  mock.get.mockImplementation(async (path: string) => {
    if (path.includes('/maintenanceRollbackRequests/')) return { exists: false, get: () => undefined };
    if (path.includes('/maintenanceUndo/')) return { exists: true, get: (key: string) => ({ turn: 1, entries: [{ fields: [{ field: 'maintenanceCycles.aegis', before: { step: 1, revision: 1 }, after: { step: 2, revision: 2 }, existed: true }] }] } as Record<string, unknown>)[key] };
    if (path === 'sessions/s1') return { exists: true, get: (key: string) => ({ currentTurn: 1, 'maintenanceCycles.aegis': { step: 2, revision: 2 } } as Record<string, unknown>)[key] };
    return previous(path);
  });
  await expect(rollbackMaintenance.run(request({ sessionId: 's1', shipId: 'aegis', instanceId: 'bridge', requestId: 'rollback-simple', expectedRevision: 2 }))).resolves.toMatchObject({ revision: 3 });
  expect(mock.update).toHaveBeenCalledWith('sessions/s1', expect.objectContaining({ 'maintenanceCycles.aegis': { step: 1, revision: 3 } }));
});
it('records and rolls back successive steps while restoring spent supplies', async () => {
  const { rollbackMaintenance } = await import('./index');
  mock.randomInt.mockImplementation((_min: number, max?: number) => max === 7 ? 1 : 0);
  const records: Record<string, Record<string, unknown>> = {
    'sessions/s1': { currentTurn: 1, turnPhase: { turn: 1, teamPhaseEndsAt: '2026-09-09T16:20:00.000Z', openAirspaceEndsAt: '2026-09-09T16:40:00.000Z', airspace: { state: 'restricted', tickerActive: true, pressAccess: false } }, maintenanceCycles: { aegis: { step: 0, revision: 0, results: {}, charges: [], refuelled: [] } }, shipResources: { aegis: { food: 20, water: 20, fuel: 3, materials: 0, ore: 0 } }, shipDamage: { aegis: { damagedSystemIds: ['storage'], destroyed: false } }, shipSurvivors: { aegis: 2000 }, shipUnrest: { aegis: 1 }, shuttleCargo: {}, shuttleFuelled: {}, unrestAlerts: {}, populationAlerts: {} },
    'sessions/s1/players/u1': { connected: true, role: 'gm' },
    'sessions/s1/gmInstances/bridge': { uid: 'u1' },
    'sessions/s1/events/pre-existing': { type: 'historical-maintenance', revision: 0 },
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
  await runMaintenance.run(request({ ...data, requestId: 'rollback-begin' }));
  await runMaintenance.run(request({ ...data, action: 'storage', expectedRevision: 1, requestId: 'rollback-storage' }));
  expect(read(records['sessions/s1'], 'shipResources.aegis.food')).toBe(10);
  await runMaintenance.run(request({ ...data, action: 'rations', expectedRevision: 2, requestId: 'rollback-rations', foodLevel: 1, waterLevel: 1 }));
  expect(read(records['sessions/s1'], 'shipResources.aegis.food')).toBe(7);
  await runMaintenance.run(request({ ...data, action: 'unrest', expectedRevision: 3, requestId: 'rollback-unrest' }));
  await runMaintenance.run(request({ ...data, action: 'riot', expectedRevision: 4, requestId: 'rollback-riot' }));
  const damageAfterRiot = structuredClone(read(records['sessions/s1'], 'shipDamage.aegis'));
  const survivorsAfterRiot = read(records['sessions/s1'], 'shipSurvivors.aegis');
  const riotEvent = structuredClone(records['sessions/s1/events/maintenance-rollback-riot']);
  const preExistingEvent = structuredClone(records['sessions/s1/events/pre-existing']);
  expect(damageAfterRiot).toMatchObject({ damagedSystemIds: ['storage', 'fighter-bay-alpha'], destroyed: false });
  expect(riotEvent).toBeDefined();
  records['sessions/s1'].turnPhase = { turn: 1, teamPhaseEndsAt: '2026-09-09T16:00:00.000Z', openAirspaceEndsAt: '2026-09-09T16:40:00.000Z', airspace: { state: 'lifted', tickerActive: true, pressAccess: false } };
  mock.update.mockClear();
  mock.set.mockClear();
  await expect(rollbackMaintenance.run(request({ sessionId: 's1', shipId: 'aegis', instanceId: 'bridge', requestId: 'rollback-coordination', expectedRevision: 5 })))
    .rejects.toMatchObject({ code: 'failed-precondition', message: expect.stringMatching(/team phase/i) });
  expect(mock.update).not.toHaveBeenCalled();
  expect(mock.set).not.toHaveBeenCalled();
  records['sessions/s1'].turnPhase = { turn: 1, teamPhaseEndsAt: '2026-09-09T16:20:00.000Z', openAirspaceEndsAt: '2026-09-09T16:40:00.000Z', airspace: { state: 'restricted', tickerActive: true, pressAccess: false } };

  const undoPath = 'sessions/s1/maintenanceUndo/aegis';
  const rollbackRaceMaintenance = {
    session: records['sessions/s1'],
    receipts: {},
    rollbackReceipts: {},
    undo: { [undoPath]: records[undoPath] ?? { turn: 1, entries: [] } },
    events: Object.fromEntries(Object.entries(records).filter(([path]) => path.includes('/events/'))),
    damageDraws: {},
  };
  const undoBeforeRace = structuredClone(rollbackRaceMaintenance.undo[undoPath]);
  const eventCountBeforeRace = Object.keys(rollbackRaceMaintenance.events).length;
  let rollbackRaceRelease!: () => void;
  const rollbackRaceReady = new Promise<void>((resolve) => { rollbackRaceRelease = resolve; });
  let rollbackReadRelease!: () => void;
  const rollbackReadReady = new Promise<void>((resolve) => { rollbackReadRelease = resolve; });
  mock.race = {
    attempts: 0,
    ready: rollbackRaceReady,
    release: rollbackRaceRelease,
    version: 0,
    barrier: true,
    readBarrier: true,
    readAttempts: 0,
    readReady: rollbackReadReady,
    readRelease: rollbackReadRelease,
    maintenance: rollbackRaceMaintenance,
  };
  const rollbackRaceReplies = await Promise.all([
    rollbackMaintenance.run(request({ sessionId: 's1', shipId: 'aegis', instanceId: 'bridge', requestId: 'rollback-race-a', expectedRevision: 5 })),
    rollbackMaintenance.run(request({ sessionId: 's1', shipId: 'aegis', instanceId: 'bridge', requestId: 'rollback-race-b', expectedRevision: 5 })),
  ]);
  mock.race.barrier = false;
  mock.race.readBarrier = false;
  expect(mock.race.readAttempts).toBeGreaterThanOrEqual(2);
  const committedRollbacks = rollbackRaceReplies.filter(reply => (reply as Record<string, unknown>).status === 'committed') as Array<Record<string, unknown>>;
  const staleRollbacks = rollbackRaceReplies.filter(reply => (reply as Record<string, unknown>).status === 'stale') as Array<Record<string, unknown>>;
  expect(committedRollbacks).toHaveLength(1);
  expect(staleRollbacks).toHaveLength(1);
  const firstRollback = committedRollbacks[0]!;
  const staleRaceRollback = staleRollbacks[0]!;
  expect(firstRollback).toMatchObject({ status: 'committed', revision: 6, expectedRevision: 5 });
  expect(staleRaceRollback).toMatchObject({ status: 'stale', expectedRevision: 5, currentRevision: 6 });
  expect(mock.update).toHaveBeenCalledTimes(1);
  expect(mock.update).toHaveBeenCalledWith('sessions/s1', expect.objectContaining({
    'maintenanceCycles.aegis': expect.objectContaining({ revision: 6 }),
  }));
  const raceSetPaths = mock.set.mock.calls.map(([path]) => String(path));
  expect(raceSetPaths.filter(path => path.includes('/maintenanceUndo/'))).toHaveLength(1);
  expect(raceSetPaths.filter(path => path.includes('/maintenanceRollbackRequests/'))).toHaveLength(2);
  expect(raceSetPaths.filter(path => path.includes('/events/'))).toHaveLength(1);
  expect(Object.keys(rollbackRaceMaintenance.events)).toHaveLength(eventCountBeforeRace + 1);
  const undoEntriesBeforeRace = Array.isArray(undoBeforeRace.entries) ? undoBeforeRace.entries.length : 0;
  expect((rollbackRaceMaintenance.undo[undoPath].entries as unknown[])).toHaveLength(undoEntriesBeforeRace - 1);
  expect(records['sessions/s1']).toMatchObject({
    shipDamage: { aegis: damageAfterRiot },
    shipSurvivors: { aegis: survivorsAfterRiot },
    maintenanceCycles: { aegis: expect.objectContaining({ revision: 6 }) },
  });
  expect(read(records['sessions/s1'], 'shipDamage.aegis')).toEqual(damageAfterRiot);
  expect(read(records['sessions/s1'], 'shipSurvivors.aegis')).toBe(survivorsAfterRiot);
  expect(records['sessions/s1/events/maintenance-rollback-riot']).toEqual(riotEvent);
  expect(records['sessions/s1/events/pre-existing']).toEqual(preExistingEvent);
  const committedEventId = String(firstRollback.eventId);
  expect(committedEventId).toMatch(/^maintenance-rollback-rollback-race-[ab]$/);
  expect(rollbackRaceMaintenance.events[`sessions/s1/events/${committedEventId}`]).toMatchObject({
    type: 'maintenance-rollback', requestId: firstRollback.requestId, revision: 6,
  });
  const stateAfterRollback = structuredClone(records['sessions/s1']);
  const eventCountAfterRollback = Object.keys(records).filter(path => path.includes('/events/')).length;
  const staleRaceRequestId = String(staleRaceRollback.requestId);
  const staleRaceReceiptPath = `sessions/s1/maintenanceRollbackRequests/${staleRaceRequestId}`;
  expect(rollbackRaceMaintenance.rollbackReceipts[staleRaceReceiptPath]).toMatchObject({ reply: staleRaceRollback });
  mock.update.mockClear();
  mock.set.mockClear();
  await expect(rollbackMaintenance.run(request({ sessionId: 's1', shipId: 'aegis', instanceId: 'bridge', requestId: staleRaceRequestId, expectedRevision: 5 })))
    .resolves.toEqual(staleRaceRollback);
  expect(records['sessions/s1']).toEqual(stateAfterRollback);
  expect(Object.keys(records).filter(path => path.includes('/events/'))).toHaveLength(eventCountAfterRollback);
  expect(mock.update).not.toHaveBeenCalled();
  expect(mock.set).not.toHaveBeenCalled();
  mock.update.mockClear();
  mock.set.mockClear();
  await expect(rollbackMaintenance.run(request({ sessionId: 's1', shipId: 'aegis', instanceId: 'bridge', requestId: staleRaceRequestId, expectedRevision: 4 })))
    .rejects.toMatchObject({ code: 'failed-precondition' });
  expect(records['sessions/s1']).toEqual(stateAfterRollback);
  expect(mock.update).not.toHaveBeenCalled();
  expect(mock.set).not.toHaveBeenCalled();
  records['sessions/s1/players/u2'] = { connected: true, role: 'gm' };
  records['sessions/s1/gmInstances/bridge'] = { uid: 'u2' };
  mock.owner = 'u2';
  mock.update.mockClear();
  mock.set.mockClear();
  await expect(rollbackMaintenance.run(request({ sessionId: 's1', shipId: 'aegis', instanceId: 'bridge', requestId: staleRaceRequestId, expectedRevision: 5 }, 'u2')))
    .rejects.toMatchObject({ code: 'failed-precondition' });
  expect(records['sessions/s1']).toEqual(stateAfterRollback);
  expect(mock.update).not.toHaveBeenCalled();
  expect(mock.set).not.toHaveBeenCalled();
  mock.owner = 'u1';
  delete records['sessions/s1/players/u2'];
  records['sessions/s1/gmInstances/bridge'] = { uid: 'u1' };
  mock.update.mockClear();
  mock.set.mockClear();
  const staleRollback = await rollbackMaintenance.run(request({ sessionId: 's1', shipId: 'aegis', instanceId: 'bridge', requestId: 'rollback-stale', expectedRevision: 5 }));
  expect(staleRollback).toMatchObject({ status: 'stale', requestId: 'rollback-stale', expectedRevision: 5, currentRevision: 6 });
  expect(records['sessions/s1']).toEqual(stateAfterRollback);
  expect(Object.keys(records).filter(path => path.includes('/events/'))).toHaveLength(eventCountAfterRollback);
  expect(mock.update).not.toHaveBeenCalled();
  expect(mock.set).toHaveBeenCalledTimes(1);
  expect(records['sessions/s1/maintenanceRollbackRequests/rollback-stale']).toMatchObject({ reply: staleRollback });
  mock.set.mockClear();
  await expect(rollbackMaintenance.run(request({ sessionId: 's1', shipId: 'aegis', instanceId: 'bridge', requestId: 'rollback-stale', expectedRevision: 5 })))
    .resolves.toEqual(staleRollback);
  expect(mock.update).not.toHaveBeenCalled();
  expect(mock.set).not.toHaveBeenCalled();
  mock.update.mockClear();
  mock.set.mockClear();
  for (const expectedRevision of [6, 7, 8]) {
    await rollbackMaintenance.run(request({ sessionId: 's1', shipId: 'aegis', instanceId: 'bridge', requestId: `rollback-follow-up-${expectedRevision}`, expectedRevision }));
  }
  expect(read(records['sessions/s1'], 'shipResources.aegis.food')).toBe(20);
  expect(read(records['sessions/s1'], 'maintenanceCycles.aegis')).toMatchObject({ step: 1, revision: 9 });
});
