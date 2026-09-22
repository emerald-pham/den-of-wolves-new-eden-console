import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { CallableRequest } from 'firebase-functions/v2/https';

const mock = vi.hoisted(() => ({
  get: vi.fn(), update: vi.fn(), set: vi.fn(), delete: vi.fn(), role: 'gm', owner: 'u1', connected: true,
  grantShip: 'aegis',
  gmInstanceOwners: {} as Record<string, string>,
  damage: {} as Record<string, unknown>, currentTurn: 1, maintenanceCycles: {} as Record<string, unknown>, retry: false,
  shuttleFuelled: {} as Record<string, boolean>,
  shipSurvivors: {} as Record<string, number>, shipUpgrades: {} as Record<string, unknown>,
  capybaraEnabled: true, dioneEnabled: true,
  fleetSurvivorPopulationAdjustment: 0,
  turnStartAnnouncement: undefined as unknown,
  turnPhase: undefined as unknown, turnState: undefined as unknown, phase: 'active' as string,
  smallShipStates: {} as Record<string, unknown>,
  turnLimit: 6 as 6 | 7 | 8, pressDispatch: undefined as unknown,
  fleetTicker: undefined as unknown,
  wolfAttackState: undefined as Record<string, unknown> | undefined,
  navigation: undefined as Record<string, unknown> | undefined,
  chartId: 'A' as 'A' | 'B' | 'C' | string,
  chartSelectionLocked: true,
  legacyPursuitGroups: undefined as unknown,
  fleetGroups: [] as Array<{ id: string; vesselIds: string[]; memberUids: string[] }>,
  discoveryPlayers: [] as Array<{ id: string; fields: Record<string, unknown> }>,
  activeVesselIds: undefined as readonly string[] | undefined,
  shuttleDockings: undefined as readonly unknown[] | undefined,
  commandReceipts: {} as Record<string, Record<string, unknown>>,
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
  activeConsoleRoleId: undefined as string | null | undefined,
  replacementRoleId: undefined as string | undefined,
  escapeState: undefined as unknown,
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
            const snapshot = structuredClone({
              ...state.session,
              chartId: state.session.chartId ?? mock.chartId,
              chartSelectionLocked: state.session.chartSelectionLocked ?? mock.chartSelectionLocked,
              activeVesselIds: state.session.activeVesselIds ?? mock.activeVesselIds,
              turnPhase: state.session.turnPhase ?? mock.turnPhase,
            });
            const readSnapshot = (key: string): unknown => key.split('.').reduce<unknown>((value, part) =>
              value && typeof value === 'object' ? (value as Record<string, unknown>)[part] : undefined, snapshot);
            const updates: Array<readonly [string, Record<string, unknown>]> = [];
            const sets: Array<readonly [string, Record<string, unknown>]> = [];
            const deletes: string[] = [];
            const document = (path: string) => {
              if (path.includes('/private/shipConsoleWriteGrant')) {
                const instanceId = path.split('/').at(-3) ?? '';
                const fields = {
                  type: 'gm-ship-console-write-grant', sessionId: 's1', instanceId,
                  uid: mock.gmInstanceOwners[instanceId] ?? mock.owner,
                  shipId: mock.grantShip, grantedAt: new Date().toISOString(),
                } as Record<string, unknown>;
                return { exists: true, get: (key: string) => fields[key] };
              }
              if (path.includes('/commandReceipts/')) {
                const fields = mock.commandReceipts[path];
                return { exists: fields !== undefined, get: (key: string) => fields?.[key] };
              }
              if (path === 'sessions/s1/serverState/navigation') {
                const fields = mock.navigation;
                return {
                  exists: fields !== undefined,
                  data: fields === undefined ? undefined : () => fields,
                  get: (key: string) => fields?.[key],
                };
              }
              if (path.includes('/setupMutationRequests/') ||
                  path.includes('/gmResponsibilityRequests/') ||
                  path.includes('/seatMutationRequests/') ||
                  path.includes('/loyaltyAssignmentRequests/') ||
                  path.includes('sessionStartRequests/') ||
                  path.includes('/events/setup-confirm-') ||
                  path.includes('/events/gm-responsibility-') ||
                  path.includes('/events/start-') ||
                  path.includes('/events/seat-claim-') ||
                  path.includes('/events/seat-release-') ||
                  path.includes('/events/press-availability-') ||
                  path.includes('/events/advance-test-')) {
                return { exists: false, get: () => undefined };
              }
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
              if (path === 'sessions/s1/players') {
                return {
                  exists: true,
                  docs: mock.discoveryPlayers.map(({ id, fields }) => ({
                    id,
                    ref: `sessions/s1/players/${id}`,
                    exists: true,
                    data: () => fields,
                    get: (key: string) => fields[key],
                  })),
                };
              }
              if (path === 'sessions/s1/fleetGroups') {
                return {
                  exists: true,
                  docs: mock.fleetGroups.map((fields) => ({
                    id: fields.id,
                    exists: true,
                    data: () => fields,
                    get: (key: string) => fields[key as keyof typeof fields],
                  })),
                };
              }
              if (path.includes('/players/')) {
                return { exists: true, get: (key: string) => ({
                  role: mock.role, connected: mock.connected,
                  replacementRoleId: mock.replacementRoleId, escapeState: mock.escapeState,
                  activeConsoleRoleId: mock.activeConsoleRoleId,
                } as Record<string, unknown>)[key] };
              }
              if (path.includes('/gmInstances/')) {
                const fields = {
                  uid: mock.owner,
                  connected: true,
                  claimedAt: { toMillis: () => Date.now() },
                  lastSeenAt: { toMillis: () => Date.now() },
                  shipConsoleWriteGrant: { shipId: mock.grantShip, grantedAt: new Date().toISOString() },
                } as Record<string, unknown>;
                return { exists: true, get: (key: string) => fields[key] };
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
              delete: (path: string) => deletes.push(path),
            };
            const result = await callback(tx);
            const writes = updates.length > 0 || sets.length > 0 || deletes.length > 0;
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
            for (const path of deletes) mock.delete(path);
            if (writes) race.version += 1;
            return result;
          }
          throw new Error('Mock transaction exceeded optimistic retry limit.');
        }
        for (let attempt = 0; attempt < 3; attempt += 1) {
          const baseVersion = race.version;
          const snapshot = {
            phase: mock.phase,
            currentTurn: mock.currentTurn,
            turnLimit: mock.turnLimit,
            turnPhase: mock.turnPhase,
            turnState: mock.turnState,
            turnStartAnnouncement: mock.turnStartAnnouncement,
            fleetTicker: mock.fleetTicker,
            maintenanceCycles: mock.maintenanceCycles,
            shuttleFuelled: mock.shuttleFuelled,
            shipSurvivors: mock.shipSurvivors,
            shipUpgrades: mock.shipUpgrades,
            fleetSurvivorPopulationAdjustment: mock.fleetSurvivorPopulationAdjustment,
            capybaraEnabled: mock.capybaraEnabled,
            dioneEnabled: mock.dioneEnabled,
            smallShipStates: mock.smallShipStates,
            activeRoleIds: mock.activeRoleIds,
            activeVesselIds: mock.activeVesselIds,
            shuttleDockings: mock.shuttleDockings,
            pursuitGroups: mock.legacyPursuitGroups,
          };
          const updates: Array<readonly [string, Record<string, unknown>]> = [];
          const sets: Array<readonly [string, Record<string, unknown>]> = [];
          const deletes: string[] = [];
          const tx = {
            get: async (path: string) => {
              if (path.includes('/commandReceipts/')) {
                const fields = mock.commandReceipts[path];
                return { exists: fields !== undefined, get: (key: string) => fields?.[key] };
              }
              if (path === 'sessions/s1/serverState/navigation') {
                const fields = mock.navigation;
                return {
                  exists: fields !== undefined,
                  data: fields === undefined ? undefined : () => fields,
                  get: (key: string) => fields?.[key],
                };
              }
              if (path === 'sessions/s1/fleetGroups') {
                return {
                  docs: mock.fleetGroups.map((fields) => ({
                    id: fields.id,
                    exists: true,
                    data: () => fields,
                    get: (key: string) => fields[key as keyof typeof fields],
                  })),
                };
              }
              if (path === 'sessions/s1/players') {
                return {
                  docs: mock.discoveryPlayers.map(({ id, fields }) => ({
                    id,
                    exists: true,
                    data: () => fields,
                    get: (key: string) => fields[key],
                  })),
                };
              }
              if (path.includes('/setupMutationRequests/') ||
                  path.includes('/gmResponsibilityRequests/') ||
                  path.includes('/seatMutationRequests/') ||
                  path.includes('/loyaltyAssignmentRequests/') ||
                  path.includes('sessionStartRequests/') ||
                  path.includes('/events/setup-confirm-') ||
                  path.includes('/events/gm-responsibility-') ||
                  path.includes('/events/start-') ||
                  path.includes('/events/seat-claim-') ||
                  path.includes('/events/seat-release-') ||
                  path.includes('/events/press-availability-') ||
                  path.includes('/events/advance-test-')) {
                return { exists: false, get: () => undefined };
              }
              if (path === 'sessions/s1/wolfAttackState/current') {
                const fields = mock.wolfAttackState;
                return {
                  exists: fields !== undefined,
                  data: fields === undefined ? undefined : () => fields,
                  get: (key: string) => fields?.[key],
                };
              }
              const fields: Record<string, unknown> = path.includes('/players/')
                ? {
                    role: mock.role, connected: mock.connected,
                    replacementRoleId: mock.replacementRoleId, escapeState: mock.escapeState,
                    activeConsoleRoleId: mock.activeConsoleRoleId,
                  }
                : path.includes('/private/shipConsoleWriteGrant')
                  ? {
                      type: 'gm-ship-console-write-grant', sessionId: 's1',
                      instanceId: path.split('/').at(-3) ?? '',
                      uid: mock.gmInstanceOwners[path.split('/').at(-3) ?? ''] ?? mock.owner,
                      shipId: mock.grantShip, grantedAt: new Date().toISOString(),
                    }
                : path.includes('/gmInstances/')
                  ? {
                      uid: mock.gmInstanceOwners[path.split('/').at(-1) ?? ''] ?? mock.owner,
                      connected: true,
                      claimedAt: { toMillis: () => Date.now() },
                      lastSeenAt: { toMillis: () => Date.now() },
                      shipConsoleWriteGrant: { shipId: mock.grantShip, grantedAt: new Date().toISOString() },
                    }
                : {
                    ...snapshot,
                  };
              return { exists: true, get: (key: string) => fields[key] };
            },
            update: (path: string, fields: Record<string, unknown>) => updates.push([path, fields]),
            set: (path: string, fields: Record<string, unknown>) => sets.push([path, fields]),
            delete: (path: string) => deletes.push(path),
          };
          const result = await callback(tx);
          race.attempts += 1;
          if (race.attempts === 1) await race.ready;
          else if (race.attempts === 2) race.release();
          if (race.version !== baseVersion) continue;
          for (const [path, fields] of updates) {
            mock.update(path, fields);
            if (path === 'sessions/s1') {
              if ('phase' in fields) mock.phase = fields.phase as string;
              if ('currentTurn' in fields) mock.currentTurn = fields.currentTurn as number;
              if ('turnPhase' in fields) mock.turnPhase = fields.turnPhase;
              if ('turnState' in fields) mock.turnState = fields.turnState;
              if ('turnStartAnnouncement' in fields) mock.turnStartAnnouncement = fields.turnStartAnnouncement;
              if ('fleetTicker' in fields) mock.fleetTicker = fields.fleetTicker;
              if ('maintenanceCycles' in fields) mock.maintenanceCycles = fields.maintenanceCycles as Record<string, unknown>;
              if ('shuttleFuelled' in fields) mock.shuttleFuelled = fields.shuttleFuelled as Record<string, boolean>;
              if ('fleetSurvivorPopulationAdjustment' in fields) {
                mock.fleetSurvivorPopulationAdjustment = fields.fleetSurvivorPopulationAdjustment as number;
              }
            }
          }
          for (const [path, fields] of sets) {
            mock.set(path, fields);
            if (path.includes('/commandReceipts/')) mock.commandReceipts[path] = fields;
          }
          for (const path of deletes) mock.delete(path);
          race.version += 1;
          return result;
        }
        throw new Error('Mock transaction exceeded optimistic retry limit.');
      }
      const tx = { get: mock.get, update: mock.update, set: mock.set, delete: mock.delete };
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
import { initialShuttleDockingsForRoles } from './shuttlecraft';
import { emptySmallShipState } from './smallShip';

let advanceRequestSequence = 0;

function request(data: Record<string, unknown>, uid: string | null = 'u1') {
  const payload = data.expectedTurn !== undefined && data.requestId === undefined
    ? { ...data, requestId: `advance-test-${++advanceRequestSequence}` }
    : data;
  return { data: payload, auth: uid === null ? undefined : { uid } } as CallableRequest<{
    sessionId: string; shipId: string; requestId: string; instanceId: string; action: string; expectedRevision: number;
  }>;
}

beforeEach(() => {
  advanceRequestSequence = 0;
  mock.role = 'gm';
  mock.owner = 'u1';
  mock.grantShip = 'aegis';
  mock.gmInstanceOwners = {};
  mock.connected = true;
  mock.damage = {};
  mock.currentTurn = 1;
  mock.maintenanceCycles = {};
  mock.shuttleFuelled = {};
  mock.shipSurvivors = {};
  mock.shipUpgrades = {};
  mock.capybaraEnabled = true;
  mock.dioneEnabled = true;
  mock.smallShipStates = {};
  mock.fleetSurvivorPopulationAdjustment = 0;
  mock.turnStartAnnouncement = undefined;
  mock.fleetTicker = undefined;
  mock.wolfAttackState = undefined;
  mock.navigation = undefined;
  mock.chartId = 'A';
  mock.chartSelectionLocked = true;
  mock.legacyPursuitGroups = undefined;
  mock.fleetGroups = [];
  mock.discoveryPlayers = [];
  mock.activeVesselIds = undefined;
  mock.navigation = {
    shipGalacticCoordinates: Object.fromEntries(
      ['aegis', 'dione', 'icebreaker', 'shepherd', 'quellon', 'refinery-124', 'capybara']
        .map((shipId) => [shipId, '0000']),
    ),
    shipNavigationLogs: {},
  };
  mock.shuttleDockings = undefined;
  mock.turnPhase = {
    turn: 1,
    airspace: { state: 'restricted', tickerActive: true, pressAccess: false },
  };
  mock.turnState = undefined;
  mock.turnLimit = 6;
  mock.race = undefined;
  mock.pressDispatch = undefined;
  mock.pressEnabled = true;
  mock.activeConsoleRoleId = undefined;
  mock.replacementRoleId = undefined;
  mock.escapeState = undefined;
  mock.activeRoleIds = undefined;
  mock.phase = 'active';
  mock.commandReceipts = {};
  mock.retry = false;
  mock.randomInt.mockReset();
  mock.randomInt.mockReturnValue(3_100_000_000);
  mock.randomUUID.mockReset();
  mock.randomUUID.mockReturnValue('damage-event');
  mock.update.mockReset();
  mock.set.mockReset();
  mock.delete.mockReset();
  mock.set.mockImplementation((path: string, fields: Record<string, unknown>) => {
    if (path.includes('/commandReceipts/')) mock.commandReceipts[path] = fields;
  });
  mock.get.mockImplementation(async (path: string) => {
    if (path.includes('/commandReceipts/')) {
      const fields = mock.commandReceipts[path];
      return { exists: fields !== undefined, get: (key: string) => fields?.[key] };
    }
    if (path.includes('/setupMutationRequests/') ||
        path.includes('/gmResponsibilityRequests/') ||
        path.includes('/seatMutationRequests/') ||
        path.includes('/loyaltyAssignmentRequests/') ||
        path.includes('sessionStartRequests/') ||
        path.includes('/events/setup-confirm-') ||
        path.includes('/events/gm-responsibility-') ||
        path.includes('/events/start-') ||
        path.includes('/events/seat-claim-') ||
        path.includes('/events/seat-release-') ||
        path.includes('/events/press-availability-') ||
        path.includes('/events/advance-test-')) {
      return { exists: false, get: () => undefined };
    }
    if (path.includes('/maintenanceRequests/')) {
      return { exists: false, get: () => undefined };
    }
    if (path.includes('/maintenanceRollbackRequests/')) {
      return { exists: false, get: () => undefined };
    }
    if (path.includes('/maintenanceUndo/')) {
      return { exists: true, get: (key: string) => key === 'entries' ? [] : undefined };
    }
    if (path.includes('/private/shipConsoleWriteGrant')) {
      const instanceId = path.split('/').at(-3) ?? '';
      const fields = {
        type: 'gm-ship-console-write-grant', sessionId: 's1', instanceId,
        uid: mock.gmInstanceOwners[instanceId] ?? mock.owner,
        shipId: mock.grantShip, grantedAt: new Date().toISOString(),
      } as Record<string, unknown>;
      return { exists: true, get: (key: string) => fields[key] };
    }
    if (path === 'sessions/s1/serverState/navigation') {
      const fields = mock.navigation;
      return {
        exists: fields !== undefined,
        data: fields === undefined ? undefined : () => fields,
        get: (key: string) => fields?.[key],
      };
    }
    if (path === 'sessions/s1/wolfAttackState/current') {
      const fields = mock.wolfAttackState;
      return {
        exists: fields !== undefined,
        data: fields === undefined ? undefined : () => fields,
        get: (key: string) => fields?.[key],
      };
    }
    if (path === 'sessions/s1/fleetGroups') {
      return {
        docs: mock.fleetGroups.map((fields) => ({
          id: fields.id,
          exists: true,
          data: () => fields,
          get: (key: string) => fields[key as keyof typeof fields],
        })),
      };
    }
    if (path === 'sessions/s1/players') {
      return {
        docs: mock.discoveryPlayers.map(({ id, fields }) => ({
          id,
          exists: true,
          data: () => fields,
          get: (key: string) => fields[key],
        })),
      };
    }
    const fields: Record<string, unknown> = path.includes('/players/')
      ? {
          role: mock.role, connected: mock.connected,
          replacementRoleId: mock.replacementRoleId, escapeState: mock.escapeState,
          activeConsoleRoleId: mock.activeConsoleRoleId,
        }
      : path.includes('/gmInstances/')
        ? {
            uid: mock.owner,
            connected: true,
            claimedAt: { toMillis: () => Date.now() },
            lastSeenAt: { toMillis: () => Date.now() },
                      shipConsoleWriteGrant: { shipId: mock.grantShip, grantedAt: new Date().toISOString() },
          }
        : {
          phase: mock.phase,
          shipDamage: mock.damage,
          currentTurn: mock.currentTurn,
          turnLimit: mock.turnLimit,
          maintenanceCycles: mock.maintenanceCycles,
          shuttleFuelled: mock.shuttleFuelled,
          shipSurvivors: mock.shipSurvivors,
          shipUpgrades: mock.shipUpgrades,
          fleetSurvivorPopulationAdjustment: mock.fleetSurvivorPopulationAdjustment,
          turnStartAnnouncement: mock.turnStartAnnouncement,
          capybaraEnabled: mock.capybaraEnabled,
          dioneEnabled: mock.dioneEnabled,
          turnPhase: mock.turnPhase,
          turnState: mock.turnState,
          smallShipStates: mock.smallShipStates,
          pressDispatch: mock.pressDispatch,
          fleetTicker: mock.fleetTicker,
          pressEnabled: mock.pressEnabled,
          activeRoleIds: mock.activeRoleIds,
          activeVesselIds: mock.activeVesselIds,
          chartId: mock.chartId,
          chartSelectionLocked: mock.chartSelectionLocked,
          shuttleDockings: mock.shuttleDockings,
          pursuitGroups: mock.legacyPursuitGroups,
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
    .rejects.toMatchObject({ code: 'failed-precondition', message: expect.stringMatching(/once per cycle/i) });
  expect(mock.update).not.toHaveBeenCalled();
});

const data = { sessionId: 's1', shipId: 'aegis', requestId: 'maintenance-base', instanceId: 'bridge', action: 'begin', expectedRevision: 0 };

function setEnvironmentalHistoryAuthority() {
  mock.activeVesselIds = ['aegis'];
  mock.fleetGroups = [{ id: 'fleet-1', vesselIds: ['aegis'], memberUids: ['u1'] }];
  mock.discoveryPlayers = [{
    id: 'u1',
    fields: {
      connected: true, role: 'player', fleetGroupId: 'fleet-1',
      assignedRoleId: 'admiral', activeConsoleRoleId: 'admiral',
    },
  }];
}

function environmentalNavigation(
  coordinate: string,
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    shipGalacticCoordinates: { aegis: coordinate },
    shipNavigationLogs: { aegis: [] },
    pursuitGroups: { 'fleet-1': 0 },
    revision: 0,
    ...overrides,
  };
}

it('rejects oversized canonical maintenance collections before authority preflight', async () => {
  mock.get.mockClear();
  mock.update.mockClear();
  mock.set.mockClear();

  await expect(runMaintenance.run(request({
    ...data,
    requestId: 'maintenance-too-many-bays',
    action: 'bays',
    refuels: { one: 'starlight', two: 'pallas', three: 'macaw' },
  }))).rejects.toMatchObject({ code: 'invalid-argument' });
  await expect(runMaintenance.run(request({
    ...data,
    requestId: 'maintenance-long-console',
    action: 'reactor',
    consoles: ['a'.repeat(129)],
  }))).rejects.toMatchObject({ code: 'invalid-argument' });
  await expect(runMaintenance.run(request({
    ...data,
    requestId: 'maintenance-long-refuel-key',
    action: 'bays',
    refuels: { ['a'.repeat(129)]: 'starlight' },
  }))).rejects.toMatchObject({ code: 'invalid-argument' });
  await expect(runMaintenance.run(request({
    ...data,
    requestId: 'maintenance-too-many-consoles',
    action: 'reactor',
    consoles: Array.from({ length: 7 }, (_, index) => `console-${index}`),
  }))).rejects.toMatchObject({ code: 'invalid-argument' });

  expect(mock.get).not.toHaveBeenCalled();
  expect(mock.update).not.toHaveBeenCalled();
  expect(mock.set).not.toHaveBeenCalled();
});

it('accepts the maintenance form’s explicit do-not-refuel sentinel', async () => {
  const maintenance = {
    session: {
      phase: 'active', currentTurn: 1, activeVesselIds: ['aegis'],
      maintenanceCycles: { aegis: { step: 6, revision: 0, results: {}, charges: [], refuelled: [] } },
      shipResources: { aegis: { ore: 0, fuel: 4, food: 8, water: 6, materials: 1, securityTeams: 2 } },
      shipDamage: { aegis: { damagedSystemIds: [], destroyed: false } },
      shipUnrest: { aegis: 0 }, shipSurvivors: { aegis: 2_500 },
      shuttleDockings: [], shuttleCargo: {}, shuttleFuelled: {},
      unrestAlerts: {}, populationAlerts: {}, capybaraEnabled: true, dioneEnabled: true,
    } as Record<string, unknown>,
    receipts: {}, undo: {}, events: {}, damageDraws: {},
  };
  mock.race = { attempts: 0, ready: Promise.resolve(), release: () => undefined, version: 0, maintenance };

  await expect(runMaintenance.run(request({
    ...data, action: 'bays', expectedRevision: 0, requestId: 'maintenance-do-not-refuel',
    refuels: { 'shuttle-bay-zeta': '' },
  }))).resolves.toMatchObject({
    status: 'committed', action: 'bays', committedRevision: 1,
    cycle: { step: 7, refuelled: [], results: { '6': expect.stringMatching(/No shuttles refuelled/) } },
  });
});

it('does not carry Scrap from a shuttle outside the enabled Capybara ledgers', async () => {
  const maintenance = {
    session: {
      phase: 'active', currentTurn: 1, activeRoleIds: [...recommendedRoleIds(18)],
      maintenanceCycles: {
        aegis: { step: 1, revision: 1, results: {}, charges: [], refuelled: [] },
      },
      shipResources: { aegis: { ore: 0, fuel: 4, food: 8, water: 6, materials: 1, securityTeams: 2 } },
      shipDamage: { aegis: { damagedSystemIds: ['storage'], destroyed: false } },
      shipUnrest: { aegis: 0 }, shipSurvivors: { aegis: 2_500 },
      shuttleDockings: [{ shipId: 'aegis', shuttleId: 'starlight' }],
      shuttleCargo: { starlight: { food: 5, scrap: 9 } }, shuttleFuelled: { starlight: false },
      unrestAlerts: {}, populationAlerts: {}, capybaraEnabled: true, dioneEnabled: true,
    } as Record<string, unknown>,
    receipts: {}, undo: {}, events: {}, damageDraws: {},
  };
  mock.race = { attempts: 0, ready: Promise.resolve(), release: () => undefined, version: 0, maintenance };

  const result = await runMaintenance.run(request({
    ...data, action: 'storage', expectedRevision: 1, requestId: 'aegis-storage-scrap-isolation',
  }));

  expect(result).toMatchObject({
    status: 'committed',
    result: { cargo: { starlight: { food: 3 } } },
  });
  expect((result as { cycle: { results: Record<string, string> } }).cycle.results['1'])
    .not.toContain('Scrap');
  expect(maintenance.session.shuttleCargo).toEqual({ starlight: { food: 3 } });
});


it('begins maintenance atomically with a server-owned revision', async () => {
  await expect(runMaintenance.run(request(data))).resolves.toMatchObject({
    step: 1, revision: 1, actorUid: 'u1', vesselId: 'aegis', turn: 1,
    phase: 'active', idempotencyKey: 'maintenance-base', auditId: 'maintenance-maintenance-base',
  });
  expect(mock.update).toHaveBeenCalledWith('sessions/s1', expect.objectContaining({
    'maintenanceCycles.aegis': expect.objectContaining({ step: 1, revision: 1 }),
  }));
});

it.each([
  ['A', '1096', 3, 'Ion Nebula'],
  ['B', '6964', 4, 'Unstable Star'],
] as const)('applies chart %s environmental damage from protected coordinate %s', async (
  chartId, coordinate, roll, siteName,
) => {
  setEnvironmentalHistoryAuthority();
  mock.chartId = chartId;
  mock.navigation = environmentalNavigation(coordinate);
  mock.randomInt.mockReturnValue(roll);

  const result = await runMaintenance.run(request({
    ...data,
    requestId: `maintenance-${chartId}-${coordinate}`,
  }));

  expect(result).toMatchObject({
    status: 'committed',
    cycle: {
      step: 1,
      damageDrawId: `maintenance-maintenance-${chartId}-${coordinate}`,
      results: { '0': expect.stringMatching(new RegExp(`${siteName}.*rolled ${roll}.*causes damage`)) },
    },
    result: { damage: { damagedSystemIds: [expect.any(String)], destroyed: false } },
  });
  expect(mock.set).toHaveBeenCalledWith(
    `sessions/s1/damageDraws/maintenance-maintenance-${chartId}-${coordinate}`,
    expect.objectContaining({ type: 'ship-damage', shipId: 'aegis' }),
  );
  expect(mock.set).toHaveBeenCalledWith(
    'sessions/s1/serverState/navigation',
    expect.objectContaining({
      systemHistory: {
        aegis: {
          [coordinate]: expect.objectContaining({
            hazards: [{
              id: `maintenance-maintenance-${chartId}-${coordinate}`,
              occurredAt: expect.any(String),
            }],
          }),
        },
      },
      revision: 1,
    }),
  );
  expect(mock.set).toHaveBeenCalledWith(
    'sessions/s1/gmDiscovery/current',
    expect.objectContaining({
      systemHistory: expect.objectContaining({
        aegis: expect.objectContaining({
          [coordinate]: expect.objectContaining({ hazards: [expect.any(Object)] }),
        }),
      }),
    }),
    { merge: true },
  );
});

it('records a below-threshold Ion Nebula check without drawing damage', async () => {
  setEnvironmentalHistoryAuthority();
  mock.navigation = environmentalNavigation('1096');
  mock.randomInt.mockReturnValue(2);

  await expect(runMaintenance.run(request({
    ...data,
    requestId: 'maintenance-ion-safe',
  }))).resolves.toMatchObject({
    cycle: { results: { '0': expect.stringMatching(/Ion Nebula.*rolled 2.*no damage/) } },
    result: { damage: { damagedSystemIds: [], destroyed: false } },
  });
  expect(mock.set).not.toHaveBeenCalledWith(
    'sessions/s1/damageDraws/maintenance-maintenance-ion-safe',
    expect.anything(),
  );
});

it('rejects a maintenance start without protected ship-location authority', async () => {
  mock.navigation = undefined;

  await expect(runMaintenance.run(request({
    ...data,
    requestId: 'maintenance-missing-location',
  }))).rejects.toMatchObject({
    code: 'failed-precondition',
    message: expect.stringMatching(/protected ship-location authority/i),
  });
  expect(mock.update).not.toHaveBeenCalled();
});

it.each([
  ['duplicate active fleet roster', () => {
    mock.activeVesselIds = ['aegis', 'aegis'];
  }],
  ['rogue active fleet vessel', () => {
    mock.activeVesselIds = ['aegis', 'rogue'];
  }],
  ['malformed navigation log', () => {
    mock.navigation = environmentalNavigation('1096', {
      shipNavigationLogs: { aegis: [{ id: 'bad-log' }] },
    });
  }],
  ['duplicate system-history event', () => {
    const duplicate = { id: 'hazard-1', occurredAt: '2026-09-22T12:00:00.000Z' };
    mock.navigation = environmentalNavigation('1096', {
      systemHistory: {
        aegis: {
          '1096': {
            coordinate: '1096',
            attempts: [],
            hazards: [duplicate, duplicate],
            rewards: [],
            clearedThreats: [],
            candidateProgress: [],
          },
        },
      },
    });
  }],
  ['missing navigation revision', () => {
    mock.navigation = environmentalNavigation('1096');
    delete mock.navigation.revision;
  }],
  ['exhausted navigation revision', () => {
    mock.navigation = environmentalNavigation('1096', {
      revision: Number.MAX_SAFE_INTEGER,
    });
  }],
] as const)('rejects %s without normalizing or writing protected state', async (_label, corrupt) => {
  setEnvironmentalHistoryAuthority();
  mock.navigation = environmentalNavigation('1096');
  corrupt();

  await expect(runMaintenance.run(request({
    ...data,
    requestId: `maintenance-malformed-${_label.replaceAll(' ', '-')}`,
  }))).rejects.toMatchObject({ code: 'failed-precondition' });
  expect(mock.update).not.toHaveBeenCalled();
  expect(mock.set).not.toHaveBeenCalled();
  expect(mock.delete).not.toHaveBeenCalled();
});

it('rejects a protected pursuit map with a stale extra fleet group without writes', async () => {
  setEnvironmentalHistoryAuthority();
  mock.navigation = environmentalNavigation('1096', {
    pursuitGroups: { 'fleet-1': 0, 'fleet-99': 4 },
  });

  await expect(runMaintenance.run(request({
    ...data,
    requestId: 'maintenance-stale-pursuit-group',
  }))).rejects.toMatchObject({ code: 'failed-precondition' });
  expect(mock.update).not.toHaveBeenCalled();
  expect(mock.set).not.toHaveBeenCalled();
  expect(mock.delete).not.toHaveBeenCalled();
});

it('rejects a protected pursuit map missing a current split-fleet group without writes', async () => {
  mock.activeVesselIds = ['aegis', 'dione'];
  mock.fleetGroups = [
    { id: 'fleet-1', vesselIds: ['aegis'], memberUids: ['u1'] },
    { id: 'fleet-2', vesselIds: ['dione'], memberUids: ['u2'] },
  ];
  mock.discoveryPlayers = [
    {
      id: 'u1',
      fields: {
        connected: true, role: 'player', fleetGroupId: 'fleet-1',
        assignedRoleId: 'admiral', activeConsoleRoleId: 'admiral',
      },
    },
    {
      id: 'u2',
      fields: {
        connected: true, role: 'player', fleetGroupId: 'fleet-2',
        assignedRoleId: 'president', activeConsoleRoleId: 'president',
      },
    },
  ];
  mock.navigation = {
    shipGalacticCoordinates: { aegis: '1096', dione: '0000' },
    shipNavigationLogs: { aegis: [], dione: [] },
    pursuitGroups: { 'fleet-1': 0 },
    revision: 0,
  };

  await expect(runMaintenance.run(request({
    ...data,
    requestId: 'maintenance-missing-pursuit-group',
  }))).rejects.toMatchObject({ code: 'failed-precondition' });
  expect(mock.update).not.toHaveBeenCalled();
  expect(mock.set).not.toHaveBeenCalled();
  expect(mock.delete).not.toHaveBeenCalled();
});

it('commits one environmental draw across transaction retry, duplicate request, and replay', async () => {
  setEnvironmentalHistoryAuthority();
  mock.navigation = environmentalNavigation('1096');
  mock.randomInt.mockReturnValue(3);
  const maintenance = {
    session: {
      phase: 'active', currentTurn: 1, activeVesselIds: ['aegis'], activeRoleIds: ['wing-commander'],
      chartId: 'A', chartSelectionLocked: true, maintenanceCycles: {},
      shipResources: { aegis: { ore: 5, fuel: 4, food: 8, water: 6, materials: 1, securityTeams: 9 } },
      shipDamage: { aegis: { damagedSystemIds: [], destroyed: false } },
      shipUnrest: { aegis: 0 }, shipSurvivors: { aegis: 2_500 },
      shuttleDockings: [], shuttleCargo: {}, shuttleFuelled: {},
      unrestAlerts: {}, populationAlerts: {}, capybaraEnabled: true, dioneEnabled: true,
    } as Record<string, unknown>,
    receipts: {}, undo: {}, events: {}, damageDraws: {},
  };
  let release!: () => void;
  const ready = new Promise<void>((resolve) => { release = resolve; });
  mock.race = { attempts: 0, ready, release, version: 0, barrier: true, maintenance };
  const command = { ...data, requestId: 'environmental-retry' };
  const callsBefore = mock.randomInt.mock.calls.length;

  const duplicate = await Promise.all([
    runMaintenance.run(request(command)),
    runMaintenance.run(request(command)),
  ]);

  expect(duplicate.map((reply) => (reply as Record<string, unknown>).status).sort())
    .toEqual(['committed', 'replayed']);
  expect(mock.randomInt.mock.calls.length - callsBefore).toBe(6);
  expect(maintenance.session.shipDamage).toMatchObject({
    aegis: { damagedSystemIds: [expect.any(String)], destroyed: false },
  });
  expect(Object.keys(maintenance.damageDraws)).toEqual([
    'sessions/s1/damageDraws/maintenance-environmental-retry',
  ]);

  const callsAfterCommit = mock.randomInt.mock.calls.length;
  await expect(runMaintenance.run(request(command))).resolves.toMatchObject({ status: 'replayed' });
  expect(mock.randomInt.mock.calls.length).toBe(callsAfterCommit);
  expect(Object.keys(maintenance.damageDraws)).toHaveLength(1);
});

it('creates the stable pod-capacity catastrophe from a riot destruction', async () => {
  const exhaustedAegis = [
    'fighter-bay-alpha', 'fighter-bay-bravo', 'command-and-control',
    'missile-launchers', 'point-defence-lasers', 'armoured-hull-i',
    'armoured-hull-ii', 'storage', 'jump-drive', 'reactor',
    'construction-bay', 'shuttle-bay-zeta', 'shuttle-bay-omega',
  ];
  const maintenance = {
    session: {
      phase: 'active', currentTurn: 1,
      activeVesselIds: ['aegis'],
      activeRoleIds: ['admiral', 'executive-officer', 'wing-commander'],
      maintenanceCycles: { aegis: { step: 4, revision: 4, results: {}, charges: [], refuelled: [] } },
      shipDamage: { aegis: { damagedSystemIds: exhaustedAegis, destroyed: false } },
      shipResources: { aegis: { ore: 0, fuel: 4, food: 8, water: 6, materials: 1, securityTeams: 9 } },
      shipUnrest: { aegis: 10 }, shipSurvivors: { aegis: 2500 },
      shuttleDockings: [
        { shuttleId: 'starlight', shipId: 'aegis', dockedAt: 'SESSION START' },
        { shuttleId: 'pallas', shipId: 'aegis', dockedAt: 'SESSION START' },
      ],
      shuttleControl: {
        starlight: {
          shuttleId: 'starlight', ownerRoleId: 'wing-commander', ownerUid: 'wing',
          holderUid: 'wing', revision: 1,
        },
        pallas: {
          shuttleId: 'pallas', ownerRoleId: 'executive-officer', ownerUid: 'xo',
          holderUid: 'xo', revision: 0,
        },
      },
      retainedShuttles: {}, shuttleCargo: { starlight: { food: 2 } }, shuttleFuelled: { starlight: true },
      smallShipStates: { gorgoneion: { id: 'gorgoneion', hostShipId: 'aegis' } },
      unrestAlerts: {}, populationAlerts: {}, capybaraEnabled: true, dioneEnabled: true,
    } as Record<string, unknown>,
    receipts: {}, undo: {}, events: {}, damageDraws: {},
  };
  mock.race = { attempts: 0, ready: Promise.resolve(), release: () => undefined, version: 0, maintenance };
  mock.discoveryPlayers = [{
    id: 'player-1',
    fields: {
      role: 'player', connected: true, assignedRoleId: 'admiral',
      activeConsoleRoleId: 'admiral', seatId: 'admiral',
    },
  }, {
    id: 'wing',
    fields: {
      role: 'player', connected: false, assignedRoleId: 'wing-commander',
      activeConsoleRoleId: 'wing-commander', seatId: 'wing-commander',
    },
  }, {
    id: 'xo',
    fields: {
      role: 'player', connected: true, assignedRoleId: 'executive-officer',
      activeConsoleRoleId: 'executive-officer', seatId: 'executive-officer',
    },
  }];
  mock.randomInt.mockImplementation((_min: number, max?: number) => max === 7 ? 1 : 0);

  await expect(runMaintenance.run(request({
    ...data, action: 'riot', expectedRevision: 4, requestId: 'riot-destroyed',
  }))).resolves.toMatchObject({
    status: 'committed', action: 'riot', committedRevision: 5,
    cycle: { damageDrawId: 'damage-destroyed-aegis' },
    damageDrawId: 'damage-destroyed-aegis',
  });
  expect(maintenance.session.shipDamage).toEqual({
    aegis: { damagedSystemIds: exhaustedAegis, destroyed: true },
  });
  expect(maintenance.damageDraws['sessions/s1/damageDraws/damage-destroyed-aegis']).toMatchObject({
    type: 'ship-destroyed', shipId: 'aegis', podCapacity: 3100,
  });
  expect(Object.keys(maintenance.damageDraws)).toHaveLength(1);
  expect(maintenance.session.shipSurvivors).toEqual({ aegis: 2500 });
  expect(maintenance.session.shipResources).toEqual({
    aegis: { ore: 0, fuel: 4, food: 8, water: 6, materials: 1, securityTeams: 9 },
  });
  expect(maintenance.session).toMatchObject({
    phase: 'failure',
    gameOutcome: {
      type: 'game-outcome', result: 'failure', cause: 'total-fleet-loss', cycle: 1,
    },
    shipSurvivors: { aegis: 2500 },
    shuttleDockings: [],
    retainedShuttles: {
      starlight: expect.objectContaining({
        status: 'retained', holderUid: 'wing', destroyedHostShipId: 'aegis',
      }),
      pallas: expect.objectContaining({
        status: 'retained', holderUid: 'xo', destroyedHostShipId: 'aegis',
      }),
    },
    shuttleCargo: { starlight: { food: 2 } },
    shuttleFuelled: { starlight: true },
    smallShipStates: { gorgoneion: { id: 'gorgoneion', hostShipId: 'aegis' } },
  });
  expect(mock.update).toHaveBeenCalledWith('sessions/s1/players/player-1', {
    escapeState: {
      status: 'pending', shipId: 'aegis', destructionEventId: 'damage-destroyed-aegis', revision: 5,
    },
    activeConsoleRoleId: null,
  });
  expect(mock.delete.mock.calls.map(([path]) => path).sort()).toEqual([
    'sessions/s1/shuttleDepartures/pallas',
    'sessions/s1/shuttleDepartures/starlight',
  ]);
});

it('resolves Dione production atomically with authoritative resources, charge consumption, replay, and stale CAS', async () => {
  mock.grantShip = 'dione';
  const maintenance = {
    session: {
      phase: 'active', currentTurn: 1,
      maintenanceCycles: {
        dione: { step: 6, revision: 0, results: { '5': 'Reactor powered up.' }, charges: ['hydroponics', 'water-reclamation'], refuelled: [] },
      },
      shipResources: { dione: { ore: 0, fuel: 3, food: 13, water: 14, materials: 0, securityTeams: 2 } },
      shipDamage: { dione: { damagedSystemIds: [], destroyed: false } },
      shipUnrest: { dione: 0 }, shipSurvivors: { dione: 100_000 },
      shuttleDockings: [], shuttleCargo: {}, shuttleFuelled: {},
      unrestAlerts: {}, populationAlerts: {}, capybaraEnabled: true, dioneEnabled: true,
    } as Record<string, unknown>,
    receipts: {}, undo: {}, events: {}, damageDraws: {},
  };
  mock.race = { attempts: 0, ready: Promise.resolve(), release: () => undefined, version: 0, maintenance };

  const production = await runMaintenance.run(request({
    ...data, shipId: 'dione', action: 'production', expectedRevision: 0,
    requestId: 'dione-hydroponics', productionConsoleId: 'hydroponics',
  }));
  expect(production).toMatchObject({
    status: 'committed', action: 'production', committedRevision: 1,
    cycle: { step: 6, charges: ['water-reclamation'], results: { '5': expect.stringContaining('generated 3 food') } },
    result: { resources: { food: 16, water: 13 } },
  });
  expect(maintenance.session.shipResources).toMatchObject({ dione: { food: 16, water: 13 } });
  expect(maintenance.session.maintenanceCycles).toMatchObject({ dione: { step: 6, revision: 1, charges: ['water-reclamation'] } });
  expect(maintenance.events['sessions/s1/events/maintenance-dione-hydroponics']).toMatchObject({
    type: 'maintenance', action: 'production', results: { '5': expect.stringContaining('Hydroponics') },
  });

  const updateCount = mock.update.mock.calls.length;
  await expect(runMaintenance.run(request({
    ...data, shipId: 'dione', action: 'production', expectedRevision: 0,
    requestId: 'dione-hydroponics', productionConsoleId: 'hydroponics',
  }))).resolves.toMatchObject({ status: 'replayed', requestId: 'dione-hydroponics' });
  expect(mock.update.mock.calls.length).toBe(updateCount);

  await expect(runMaintenance.run(request({
    ...data, shipId: 'dione', action: 'production', expectedRevision: 0,
    requestId: 'dione-stale', productionConsoleId: 'water-reclamation',
  }))).resolves.toMatchObject({ status: 'stale', currentRevision: 1 });
  expect(maintenance.session.shipResources).toMatchObject({ dione: { food: 16, water: 13 } });
});

it.each([
  { prompt: '198', shipId: 'icebreaker', consoleId: 'hydroponics', expected: { food: 14, water: 8 } },
  { prompt: '199', shipId: 'icebreaker', consoleId: 'water-reclamation', expected: { water: 11 } },
  { prompt: '200', shipId: 'icebreaker', consoleId: 'mining-drone-control', expected: { materials: 6 } },
  { prompt: '208', shipId: 'shepherd', consoleId: 'water-reclamation', expected: { water: 10 } },
  { prompt: '209', shipId: 'shepherd', consoleId: 'advanced-hydroponics', expected: { food: 22, water: 6 } },
  { prompt: '209', shipId: 'shepherd', consoleId: 'advanced-hydroponics-ii', expected: { food: 22, water: 6 } },
  { prompt: '220', shipId: 'quellon', consoleId: 'hydroponics', expected: { food: 13, water: 7 } },
  { prompt: '221', shipId: 'quellon', consoleId: 'water-production', expected: { water: 20 } },
  { prompt: '221', shipId: 'quellon', consoleId: 'water-production-ii', expected: { water: 20 } },
  { prompt: '228', shipId: 'refinery-124', consoleId: 'hydroponics', expected: { food: 12, water: 3 } },
  { prompt: '229', shipId: 'refinery-124', consoleId: 'water-reclamation', expected: { water: 6 } },
  { prompt: '230', shipId: 'refinery-124', consoleId: 'fuel-refinery', ore: 10, expected: { ore: 2, fuel: 15 } },
] as const)('commits Prompt $prompt $shipId $consoleId through the authoritative callable', async ({
  shipId, consoleId, expected, ...variant
}) => {
  mock.grantShip = shipId;
  mock.maintenanceCycles = {
    [shipId]: { step: 6, revision: 0, results: {}, charges: [consoleId], refuelled: [] },
  };
  const result = await runMaintenance.run(request({
    ...data, shipId, action: 'production', requestId: `production-${shipId}-${consoleId}`,
    productionConsoleId: consoleId,
    ...('ore' in variant ? { productionOreAmount: variant.ore } : {}),
  }));
  expect(result).toMatchObject({
    status: 'committed', committedRevision: 1,
    cycle: { step: 6, charges: [] }, result: { resources: expected },
  });
  expect(mock.update).toHaveBeenCalledWith('sessions/s1', expect.objectContaining({
    [`shipResources.${shipId}`]: expect.objectContaining(expected),
    [`maintenanceCycles.${shipId}`]: expect.objectContaining({ revision: 1, charges: [] }),
  }));
});

it('rejects unbound or malformed Fuel Refinery amounts before authority or state mutation', async () => {
  await expect(runMaintenance.run(request({
    ...data, shipId: 'refinery-124', action: 'production', productionConsoleId: 'fuel-refinery',
  }))).rejects.toMatchObject({ code: 'invalid-argument' });
  await expect(runMaintenance.run(request({
    ...data, action: 'begin', productionOreAmount: 1,
  }))).rejects.toMatchObject({ code: 'invalid-argument' });
  await expect(runMaintenance.run(request({
    ...data, shipId: 'refinery-124', action: 'production', productionConsoleId: 'hydroponics',
    productionOreAmount: 1,
  }))).rejects.toMatchObject({ code: 'invalid-argument' });
  expect(mock.update).not.toHaveBeenCalled();
});

it('binds Fuel Refinery ore to replay identity and rejects non-conserving fuel overflow', async () => {
  mock.grantShip = 'refinery-124';
  const session = (fuel: number) => ({
    phase: 'active', currentTurn: 1, activeVesselIds: ['aegis', 'refinery-124'],
    maintenanceCycles: {
      'refinery-124': { step: 6, revision: 0, results: {}, charges: ['fuel-refinery'], refuelled: [] },
    },
    shipResources: {
      'refinery-124': { ore: 10, fuel, food: 9, water: 4, materials: 0, securityTeams: 6 },
    },
    shipDamage: { 'refinery-124': { damagedSystemIds: [], destroyed: false } },
    shipUnrest: { 'refinery-124': 0 }, shipSurvivors: { 'refinery-124': 20_000 },
    shuttleDockings: [], shuttleCargo: {}, shuttleFuelled: {}, unrestAlerts: {}, populationAlerts: {},
  } as Record<string, unknown>);
  const maintenance = {
    session: session(Number.MAX_SAFE_INTEGER - 5),
    receipts: {}, undo: {}, events: {}, damageDraws: {},
  };
  mock.race = { attempts: 0, ready: Promise.resolve(), release: () => undefined, version: 0, maintenance };
  const command = {
    ...data, shipId: 'refinery-124', action: 'production', requestId: 'refinery-capacity',
    productionConsoleId: 'fuel-refinery', productionOreAmount: 5,
  };
  await expect(runMaintenance.run(request(command))).resolves.toMatchObject({
    status: 'committed', result: { resources: { ore: 5, fuel: Number.MAX_SAFE_INTEGER } },
  });
  await expect(runMaintenance.run(request(command))).resolves.toMatchObject({ status: 'replayed' });
  await expect(runMaintenance.run(request({
    ...command, productionOreAmount: 4,
  }))).rejects.toMatchObject({ code: 'failed-precondition', message: expect.stringMatching(/request id/i) });

  const overflow = {
    session: session(Number.MAX_SAFE_INTEGER - 5),
    receipts: {}, undo: {}, events: {}, damageDraws: {},
  };
  mock.race = { attempts: 0, ready: Promise.resolve(), release: () => undefined, version: 0, maintenance: overflow };
  await expect(runMaintenance.run(request({
    ...command, requestId: 'refinery-overflow', productionOreAmount: 10,
  }))).rejects.toMatchObject({ code: 'failed-precondition', message: expect.stringMatching(/fuel storage capacity/i) });
  expect(overflow.session).toMatchObject({
    shipResources: { 'refinery-124': { ore: 10, fuel: Number.MAX_SAFE_INTEGER - 5 } },
    maintenanceCycles: { 'refinery-124': { revision: 0, charges: ['fuel-refinery'] } },
  });
});

it('resolves Capybara production with optional Scrap exactly once across replay and stale CAS', async () => {
  mock.grantShip = 'capybara';
  const maintenance = {
    session: {
      phase: 'active', currentTurn: 1, activeVesselIds: ['aegis', 'dione', 'capybara'],
      maintenanceCycles: {
        capybara: { step: 6, revision: 0, results: { '5': 'Reactor powered up.' }, charges: ['advanced-hydroponics', 'water-production'], refuelled: [] },
      },
      shipResources: { capybara: { ore: 0, fuel: 3, food: 9, water: 4, materials: 0, securityTeams: 2, scrap: 2 } },
      shipDamage: { capybara: { damagedSystemIds: [], destroyed: false } },
      shipUnrest: { capybara: 0 }, shipSurvivors: { capybara: 20_000 },
      shuttleDockings: [], shuttleCargo: {}, shuttleFuelled: {},
      unrestAlerts: {}, populationAlerts: {}, capybaraEnabled: true, dioneEnabled: true,
    } as Record<string, unknown>,
    receipts: {}, undo: {}, events: {}, damageDraws: {},
  };
  mock.race = { attempts: 0, ready: Promise.resolve(), release: () => undefined, version: 0, maintenance };
  const requestData = {
    ...data, shipId: 'capybara', action: 'production', expectedRevision: 0,
    requestId: 'capybara-hydroponics', productionConsoleId: 'advanced-hydroponics', productionScrap: true,
  };

  const production = await runMaintenance.run(request(requestData));
  expect(production).toMatchObject({
    status: 'committed', action: 'production', committedRevision: 1,
    cycle: { step: 6, charges: ['water-production'], results: { '5': expect.stringContaining('generated 12 food') } },
    result: { resources: { food: 21, water: 2, scrap: 1 } },
  });
  const updateCount = mock.update.mock.calls.length;
  await expect(runMaintenance.run(request(requestData))).resolves.toMatchObject({
    status: 'replayed', requestId: 'capybara-hydroponics',
  });
  expect(mock.update.mock.calls.length).toBe(updateCount);
  await expect(runMaintenance.run(request({
    ...requestData, requestId: 'capybara-stale', productionConsoleId: 'water-production', productionScrap: false,
  }))).resolves.toMatchObject({ status: 'stale', currentRevision: 1 });
  expect(maintenance.session.shipResources).toMatchObject({ capybara: { food: 21, water: 2, scrap: 1 } });
});

it('spends the server-selected Capybara replacement rations at the 15,000 threshold', async () => {
  mock.grantShip = 'capybara';
  const maintenance = {
    session: {
      phase: 'active', currentTurn: 1, activeVesselIds: ['aegis', 'dione', 'capybara'],
      maintenanceCycles: {
        capybara: { step: 2, revision: 0, results: {}, charges: [], refuelled: [] },
      },
      shipResources: { capybara: { ore: 0, fuel: 3, food: 20, water: 20, materials: 0, securityTeams: 2, scrap: 2 } },
      shipDamage: { capybara: { damagedSystemIds: [], destroyed: false } },
      shipUnrest: { capybara: 0 }, shipSurvivors: { capybara: 15_000 },
      shuttleDockings: [], shuttleCargo: {}, shuttleFuelled: {},
      unrestAlerts: {}, populationAlerts: {}, capybaraEnabled: true, dioneEnabled: true,
    } as Record<string, unknown>,
    receipts: {}, undo: {}, events: {}, damageDraws: {},
  };
  mock.race = { attempts: 0, ready: Promise.resolve(), release: () => undefined, version: 0, maintenance };

  await expect(runMaintenance.run(request({
    ...data, shipId: 'capybara', action: 'rations', expectedRevision: 0,
    requestId: 'capybara-replacement-rations', foodLevel: 3, waterLevel: 3,
  }))).resolves.toMatchObject({
    status: 'committed', committedRevision: 1,
    cycle: { step: 3, rationBonus: 18 },
    result: { resources: { food: 10, water: 13 } },
  });
  expect(maintenance.session.shipResources).toMatchObject({ capybara: { food: 10, water: 13 } });
});

it('rejects off-track Capybara population before spending rations or advancing maintenance', async () => {
  mock.grantShip = 'capybara';
  const maintenance = {
    session: {
      phase: 'active', currentTurn: 1, activeVesselIds: ['aegis', 'dione', 'capybara'],
      maintenanceCycles: {
        capybara: { step: 2, revision: 0, results: {}, charges: [], refuelled: [] },
      },
      shipResources: { capybara: { ore: 0, fuel: 3, food: 20, water: 20, materials: 0, securityTeams: 2, scrap: 2 } },
      shipDamage: { capybara: { damagedSystemIds: [], destroyed: false } },
      shipUnrest: { capybara: 0 }, shipSurvivors: { capybara: 14_999 },
      shuttleDockings: [], shuttleCargo: {}, shuttleFuelled: {},
      unrestAlerts: {}, populationAlerts: {}, capybaraEnabled: true, dioneEnabled: true,
    } as Record<string, unknown>,
    receipts: {}, undo: {}, events: {}, damageDraws: {},
  };
  mock.race = { attempts: 0, ready: Promise.resolve(), release: () => undefined, version: 0, maintenance };

  await expect(runMaintenance.run(request({
    ...data, shipId: 'capybara', action: 'rations', expectedRevision: 0,
    requestId: 'capybara-off-track-rations', foodLevel: 3, waterLevel: 3,
  }))).rejects.toMatchObject({
    code: 'failed-precondition', message: expect.stringMatching(/printed track/i),
  });
  expect(maintenance.session).toMatchObject({
    shipResources: { capybara: { food: 20, water: 20 } },
    maintenanceCycles: { capybara: { step: 2, revision: 0 } },
  });
});

it('resolves Capybara Scrap Refinery choices through the callable receipt and CAS boundary', async () => {
  mock.grantShip = 'capybara';
  const maintenance = {
    session: {
      phase: 'active', currentTurn: 1, activeVesselIds: ['aegis', 'dione', 'capybara'],
      maintenanceCycles: {
        capybara: { step: 6, revision: 0, results: { '5': 'Reactor powered up.' }, charges: ['scrap-refinery'], refuelled: [] },
      },
      shipResources: { capybara: { ore: 0, fuel: 3, food: 9, water: 4, materials: 0, securityTeams: 2, scrap: 3 } },
      shipDamage: { capybara: { damagedSystemIds: [], destroyed: false } },
      shipUnrest: { capybara: 0 }, shipSurvivors: { capybara: 20_000 },
      shuttleDockings: [], shuttleCargo: {}, shuttleFuelled: {},
      unrestAlerts: {}, populationAlerts: {}, capybaraEnabled: true, dioneEnabled: true,
    } as Record<string, unknown>,
    receipts: {}, undo: {}, events: {}, damageDraws: {},
  };
  mock.race = { attempts: 0, ready: Promise.resolve(), release: () => undefined, version: 0, maintenance };
  const generateRequest = {
    ...data, shipId: 'capybara', action: 'production', expectedRevision: 0,
    requestId: 'capybara-scrap-generate', productionConsoleId: 'scrap-refinery', productionScrap: false,
  };
  const generated = await runMaintenance.run(request(generateRequest));
  expect(generated).toMatchObject({
    status: 'committed', committedRevision: 1,
    cycle: { step: 6, charges: [], results: { '5': expect.stringContaining('generated 1 Scrap') } },
    result: { resources: { materials: 0, scrap: 4 } },
  });
  const updateCount = mock.update.mock.calls.length;
  await expect(runMaintenance.run(request(generateRequest))).resolves.toMatchObject({
    status: 'replayed', requestId: 'capybara-scrap-generate',
  });
  expect(mock.update.mock.calls.length).toBe(updateCount);
  await expect(runMaintenance.run(request({
    ...generateRequest, requestId: 'capybara-scrap-stale', productionScrap: true,
  }))).resolves.toMatchObject({ status: 'stale', currentRevision: 1 });

  maintenance.session.maintenanceCycles = {
    capybara: { step: 6, revision: 0, results: { '5': 'Reactor powered up.' }, charges: ['scrap-refinery'], refuelled: [] },
  };
  maintenance.session.shipResources = {
    capybara: { ore: 0, fuel: 3, food: 9, water: 4, materials: 0, securityTeams: 2, scrap: 1 },
  };
  mock.race = { attempts: 0, ready: Promise.resolve(), release: () => undefined, version: 0, maintenance };
  const convert = await runMaintenance.run(request({
    ...data, shipId: 'capybara', action: 'production', expectedRevision: 0,
    requestId: 'capybara-scrap-convert', productionConsoleId: 'scrap-refinery', productionScrap: true,
  }));
  expect(convert).toMatchObject({
    status: 'committed', committedRevision: 1,
    cycle: { charges: [], results: { '5': expect.stringContaining('generated 3 materials') } },
    result: { resources: { materials: 3, scrap: 0 } },
  });
});

it('resolves the Capybara single-bay shuttle choice through atomic replay and stale CAS', async () => {
  mock.grantShip = 'capybara';
  const maintenance = {
    session: {
      phase: 'active', currentTurn: 1, activeVesselIds: ['aegis', 'dione', 'capybara'],
      activeRoleIds: ['capybara-captain', 'capybara-recycler'],
      maintenanceCycles: {
        capybara: { step: 6, revision: 0, results: { '5': 'Reactor powered up.' }, charges: [], refuelled: [] },
      },
      shipResources: { capybara: { ore: 0, fuel: 3, food: 9, water: 4, materials: 0, securityTeams: 2, scrap: 3 } },
      shipDamage: { capybara: { damagedSystemIds: [], destroyed: false } },
      shipUnrest: { capybara: 0 }, shipSurvivors: { capybara: 20_000 },
      shuttleDockings: [
        { shipId: 'capybara', shuttleId: 'macaw', dockedAt: 'SESSION START' },
        { shipId: 'capybara', shuttleId: 'boa', dockedAt: 'SESSION START' },
      ],
      shuttleCargo: {}, shuttleFuelled: { macaw: false, boa: false },
      unrestAlerts: {}, populationAlerts: {}, capybaraEnabled: true, dioneEnabled: true,
    } as Record<string, unknown>,
    receipts: {}, undo: {}, events: {}, damageDraws: {},
  };
  mock.race = { attempts: 0, ready: Promise.resolve(), release: () => undefined, version: 0, maintenance };
  const requestData = {
    ...data, shipId: 'capybara', action: 'bays', expectedRevision: 0,
    requestId: 'capybara-bay-macaw', refuels: { 'shuttle-bay': 'macaw' },
  };

  const committed = await runMaintenance.run(request(requestData));
  expect(committed).toMatchObject({
    status: 'committed', action: 'bays', committedRevision: 1,
    cycle: { step: 7, refuelled: ['macaw'] },
    result: { resources: { fuel: 2 }, fuelled: { macaw: true, boa: false } },
  });
  expect(maintenance.session.shuttleFuelled).toEqual({ macaw: true, boa: false });

  const updateCount = mock.update.mock.calls.length;
  await expect(runMaintenance.run(request(requestData))).resolves.toMatchObject({
    status: 'replayed', requestId: 'capybara-bay-macaw',
  });
  expect(mock.update.mock.calls.length).toBe(updateCount);
  await expect(runMaintenance.run(request({
    ...requestData, requestId: 'capybara-bay-stale', expectedRevision: 0,
    refuels: { 'shuttle-bay': 'boa' },
  }))).resolves.toMatchObject({ status: 'stale', currentRevision: 1 });
  expect(maintenance.session.shipResources).toMatchObject({ capybara: { fuel: 2 } });
});

it.each([
  ['dione', 'philia', 'dione-engineer'],
  ['icebreaker', 'blacksmith', 'icebreaker-engineer'],
  ['shepherd', 'black-sheep', 'shepherd-engineer'],
  ['quellon', 'condor', 'quellon-engineer'],
  ['refinery-124', 'chacau', 'refinery-124-engineer'],
] as const)('resolves %s single-bay fuelling from its authoritative docking manifest exactly once', async (
  shipId,
  shuttleId,
  engineerRoleId,
) => {
  mock.grantShip = shipId;
  const maintenance = {
    session: {
      phase: 'active', currentTurn: 1, activeVesselIds: [shipId],
      activeRoleIds: [engineerRoleId],
      maintenanceCycles: {
        [shipId]: { step: 6, revision: 0, results: {}, charges: [], refuelled: [] },
      },
      shipResources: { [shipId]: { ore: 0, fuel: 4, food: 8, water: 6, materials: 1, securityTeams: 2 } },
      shipDamage: { [shipId]: { damagedSystemIds: [], destroyed: false } },
      shipUnrest: { [shipId]: 0 }, shipSurvivors: { [shipId]: 2_500 },
      shuttleDockings: [{ shipId, shuttleId, dockedAt: 'SESSION START' }],
      shuttleCargo: {}, shuttleFuelled: { [shuttleId]: false },
      unrestAlerts: {}, populationAlerts: {}, capybaraEnabled: true, dioneEnabled: true,
    } as Record<string, unknown>,
    receipts: {}, undo: {}, events: {}, damageDraws: {},
  };
  mock.race = { attempts: 0, ready: Promise.resolve(), release: () => undefined, version: 0, maintenance };
  const requestData = {
    ...data, shipId, action: 'bays', expectedRevision: 0,
    requestId: `${shipId}-bay-${shuttleId}`, refuels: { 'shuttle-bay': shuttleId },
  };

  await expect(runMaintenance.run(request(requestData))).resolves.toMatchObject({
    status: 'committed', action: 'bays', committedRevision: 1,
    cycle: { step: 7, refuelled: [shuttleId] },
    result: { resources: { fuel: 3 }, fuelled: { [shuttleId]: true } },
  });
  const updateCount = mock.update.mock.calls.length;
  await expect(runMaintenance.run(request(requestData))).resolves.toMatchObject({
    status: 'replayed', requestId: `${shipId}-bay-${shuttleId}`,
  });
  expect(mock.update.mock.calls.length).toBe(updateCount);

  maintenance.session.maintenanceCycles = {
    [shipId]: { step: 6, revision: 0, results: {}, charges: [], refuelled: [] },
  };
  maintenance.session.shipResources = {
    [shipId]: { ore: 0, fuel: 4, food: 8, water: 6, materials: 1, securityTeams: 2 },
  };
  maintenance.session.shuttleFuelled = { [shuttleId]: false };
  maintenance.session.shuttleDockings = [
    { shipId, shuttleId, dockedAt: 'SESSION START' },
    { shipId, shuttleId, dockedAt: 'SESSION START' },
  ];
  mock.update.mockClear();
  mock.set.mockClear();
  await expect(runMaintenance.run(request({
    ...requestData, requestId: `${shipId}-bay-duplicate-manifest`,
  }))).rejects.toMatchObject({ code: 'failed-precondition', message: expect.stringMatching(/docking manifest/i) });
  expect(mock.update).not.toHaveBeenCalled();
  expect(mock.set).not.toHaveBeenCalled();

  maintenance.session.shuttleDockings = [
    { shipId, shuttleId, dockedAt: 'SESSION START' },
  ];
  maintenance.session.shuttleFuelled = { [shuttleId]: true };
  await expect(runMaintenance.run(request({
    ...requestData, requestId: `${shipId}-bay-already-fuelled`,
  }))).rejects.toMatchObject({ code: 'failed-precondition', message: expect.stringMatching(/once per cycle/i) });
  expect(mock.update).not.toHaveBeenCalled();
  expect(mock.set).not.toHaveBeenCalled();
});

it.each([
  ['advanced-hydroponics', 'food'],
  ['water-production', 'water'],
] as const)('keeps Capybara %s output safe through the callable resource projection', async (productionConsoleId, resource) => {
  mock.grantShip = 'capybara';
  for (const variant of [
    { suffix: 'base', productionScrap: false, upgraded: false },
    { suffix: 'scrap', productionScrap: true, upgraded: false },
    { suffix: 'upgraded-scrap', productionScrap: true, upgraded: true },
  ]) {
    const inventory = {
      ore: 0, fuel: 3, food: resource === 'food' ? Number.MAX_SAFE_INTEGER : 9,
      water: resource === 'water' ? Number.MAX_SAFE_INTEGER : 4,
      materials: 0, securityTeams: 2, scrap: variant.productionScrap ? 2 : 0,
    };
    const maintenance = {
      session: {
        phase: 'active', currentTurn: 1, activeVesselIds: ['aegis', 'dione', 'capybara'],
        maintenanceCycles: {
          capybara: { step: 6, revision: 0, results: {}, charges: [productionConsoleId], refuelled: [] },
        },
        shipResources: { capybara: inventory },
        shipDamage: { capybara: { damagedSystemIds: [], destroyed: false } },
        shipUpgrades: variant.upgraded ? { capybara: [productionConsoleId] } : {},
        shipUnrest: { capybara: 0 }, shipSurvivors: { capybara: 20_000 },
        shuttleDockings: [], shuttleCargo: {}, shuttleFuelled: {},
        unrestAlerts: {}, populationAlerts: {}, capybaraEnabled: true, dioneEnabled: true,
      } as Record<string, unknown>,
      receipts: {}, undo: {}, events: {}, damageDraws: {},
    };
    mock.race = { attempts: 0, ready: Promise.resolve(), release: () => undefined, version: 0, maintenance };
    const result = await runMaintenance.run(request({
      ...data, shipId: 'capybara', action: 'production', expectedRevision: 0,
      requestId: `capybara-boundary-${productionConsoleId}-${variant.suffix}`,
      productionConsoleId, productionScrap: variant.productionScrap,
    }));
    expect(result).toMatchObject({ status: 'committed', result: { resources: { [resource]: Number.MAX_SAFE_INTEGER } } });
    expect(Number.isSafeInteger((maintenance.session.shipResources as Record<string, Record<string, number>>).capybara![resource])).toBe(true);
  }
});

it('denies Capybara production when the console is uncharged or damaged without writing', async () => {
  mock.grantShip = 'capybara';
  const maintenance = {
    session: {
      phase: 'active', currentTurn: 1, activeVesselIds: ['aegis', 'dione', 'capybara'],
      maintenanceCycles: { capybara: { step: 6, revision: 0, results: {}, charges: [], refuelled: [] } },
      shipResources: { capybara: { ore: 0, fuel: 3, food: 9, water: 4, materials: 0, securityTeams: 2, scrap: 1 } },
      shipDamage: { capybara: { damagedSystemIds: [], destroyed: false } },
      shipUnrest: { capybara: 0 }, shipSurvivors: { capybara: 20_000 },
      shuttleDockings: [], shuttleCargo: {}, shuttleFuelled: {},
      unrestAlerts: {}, populationAlerts: {}, capybaraEnabled: true, dioneEnabled: true,
    } as Record<string, unknown>,
    receipts: {}, undo: {}, events: {}, damageDraws: {},
  };
  mock.race = { attempts: 0, ready: Promise.resolve(), release: () => undefined, version: 0, maintenance };
  await expect(runMaintenance.run(request({
    ...data, shipId: 'capybara', action: 'production', requestId: 'capybara-uncharged', productionConsoleId: 'advanced-hydroponics',
  }))).rejects.toMatchObject({ code: 'failed-precondition', message: expect.stringMatching(/not charged/i) });
  expect(mock.update).not.toHaveBeenCalled();

  maintenance.session.maintenanceCycles = {
    capybara: { step: 6, revision: 0, results: {}, charges: ['advanced-hydroponics'], refuelled: [] },
  };
  maintenance.session.shipDamage = { capybara: { damagedSystemIds: ['advanced-hydroponics'], destroyed: false } };
  mock.update.mockClear();
  await expect(runMaintenance.run(request({
    ...data, shipId: 'capybara', action: 'production', requestId: 'capybara-damaged', productionConsoleId: 'advanced-hydroponics',
  }))).rejects.toMatchObject({ code: 'failed-precondition', message: expect.stringMatching(/damaged/i) });
  expect(mock.update).not.toHaveBeenCalled();
});

it('uses the server-owned Dione upgrade and rejects damaged production consoles', async () => {
  mock.grantShip = 'dione';
  mock.maintenanceCycles = {
    dione: { step: 6, revision: 0, results: {}, charges: ['hydroponics'], refuelled: [] },
  };
  mock.shipUpgrades = { dione: ['hydroponics'] };
  const upgraded = await runMaintenance.run(request({
    ...data, shipId: 'dione', action: 'production', productionConsoleId: 'hydroponics',
  }));
  expect(upgraded).toMatchObject({ result: { resources: { food: 18, water: 13 } } });

  mock.maintenanceCycles = {
    dione: { step: 6, revision: 0, results: {}, charges: ['hydroponics'], refuelled: [] },
  };
  mock.damage = { dione: { damagedSystemIds: ['hydroponics'], destroyed: false } };
  mock.update.mockClear();
  await expect(runMaintenance.run(request({
    ...data, shipId: 'dione', action: 'production', requestId: 'dione-damaged', productionConsoleId: 'hydroponics',
  }))).rejects.toMatchObject({ code: 'failed-precondition', message: expect.stringMatching(/damaged/i) });
  expect(mock.update).not.toHaveBeenCalled();
});

it('records a Dione skip choice before allowing the next production console', async () => {
  mock.grantShip = 'dione';
  mock.maintenanceCycles = {
    dione: { step: 6, revision: 0, results: {}, charges: ['hydroponics', 'water-reclamation'], refuelled: [] },
  };
  await expect(runMaintenance.run(request({
    ...data, shipId: 'dione', action: 'production', productionConsoleId: 'water-reclamation', productionMode: 'skip',
    requestId: 'dione-water-skip-first',
  }))).rejects.toMatchObject({ code: 'failed-precondition', message: expect.stringMatching(/Resolve Hydroponics before Water Reclamation/) });
  const skipped = await runMaintenance.run(request({
    ...data, shipId: 'dione', action: 'production', productionConsoleId: 'hydroponics', productionMode: 'skip',
  }));
  expect(skipped).toMatchObject({
    status: 'committed', cycle: { step: 6, revision: 1, charges: ['water-reclamation'], results: { '5': expect.stringContaining('Hydroponics skipped') } },
    result: { resources: { food: 13, water: 14 } },
  });
  mock.maintenanceCycles = {
    dione: { step: 6, revision: 1, results: { '5': 'Hydroponics skipped.' }, charges: ['water-reclamation'], refuelled: [] },
  };
  const next = await runMaintenance.run(request({
    ...data, shipId: 'dione', action: 'production', expectedRevision: 1,
    requestId: 'dione-water-after-skip', productionConsoleId: 'water-reclamation',
  }));
  expect(next).toMatchObject({ status: 'committed', result: { resources: { food: 13, water: 16 } } });
});

it('rejects Dione production when the session has disabled Dione', async () => {
  mock.grantShip = 'dione';
  mock.dioneEnabled = false;
  mock.maintenanceCycles = {
    dione: { step: 6, revision: 0, results: {}, charges: ['hydroponics'], refuelled: [] },
  };
  await expect(runMaintenance.run(request({
    ...data, shipId: 'dione', action: 'production', productionConsoleId: 'hydroponics',
  }))).rejects.toMatchObject({ code: 'failed-precondition', message: expect.stringMatching(/unavailable/i) });
  expect(mock.update).not.toHaveBeenCalled();
});

it('commits maintenance resources, charges, fuel, and damage once across duplicate and stale CAS requests', async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-09-09T16:10:00.000Z'));
  mock.randomInt.mockImplementation((_min: number, max?: number) => max === 7 ? 1 : 0);
  const maintenance = {
    session: {
      phase: 'active', currentTurn: 1, activeVesselIds: ['aegis'],
      activeRoleIds: ['wing-commander'], maintenanceCycles: {},
      shipResources: { aegis: { ore: 5, fuel: 4, food: 8, water: 6, materials: 1, securityTeams: 9 } },
      shipDamage: { aegis: { damagedSystemIds: ['storage'], destroyed: false } },
      shipUnrest: { aegis: 0 }, shipSurvivors: { aegis: 2_500 },
      shuttleDockings: [{ shipId: 'aegis', shuttleId: 'starlight', dockedAt: 'SESSION START' }],
      shuttleCargo: {
        starlight: { ore: 5, food: 4, water: 3, materials: 1, securityTeams: 2 },
        pallas: { food: 5, water: 3 },
      }, shuttleFuelled: { starlight: false, pallas: false },
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
  const storage = await step('storage', 1);
  const expectedStorageResult = 'Storage damaged. Lost: 2 ore, 2 fuel, 4 food, 3 water, 4 securityTeams, 2 ore (starlight), 2 food (starlight), 1 water (starlight), 1 securityTeams (starlight).';
  expect(storage).toMatchObject({
    status: 'committed', action: 'storage',
    cycle: { results: { '1': expectedStorageResult } },
    result: {
      resources: { ore: 3, fuel: 2, food: 4, water: 3, materials: 1, securityTeams: 5 },
      cargo: {
        starlight: { ore: 3, food: 2, water: 2, materials: 1, securityTeams: 1 },
        pallas: { food: 5, water: 3 },
      },
    },
  });
  expect(maintenance.session.shipResources).toEqual({
    aegis: { ore: 3, fuel: 2, food: 4, water: 3, materials: 1, securityTeams: 5 },
  });
  expect(maintenance.session.shuttleCargo).toEqual({
    starlight: { ore: 3, food: 2, water: 2, materials: 1, securityTeams: 1 },
    pallas: { food: 5, water: 3 },
  });
  expect(maintenance.events['sessions/s1/events/maintenance-maintenance-storage']).toMatchObject({
    type: 'maintenance', action: 'storage', results: { '1': expectedStorageResult },
  });
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
  await step('bays', 7, { refuels: {}, requestId: 'maintenance-bays-omega' });
  await step('end', 8);

  const session = maintenance.session;
  expect((session.shipResources as Record<string, Record<string, number>>).aegis)
    .toMatchObject({ food: 1, water: 1, fuel: 1 });
  expect(session.maintenanceCycles).toMatchObject({
    aegis: expect.objectContaining({ step: 0, revision: 9, charges: ['jump-drive'], refuelled: ['starlight'] }),
  });
  expect(session.shuttleFuelled).toEqual({ starlight: true, pallas: false });
  expect(session.shipDamage).toEqual({
    aegis: { damagedSystemIds: ['storage', 'fighter-bay-alpha'], destroyed: false },
  });
  expect(Object.keys(maintenance.receipts)).toHaveLength(10);
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

it('rejects fresh maintenance without an authoritative phase clock before writes', async () => {
  mock.turnPhase = undefined;

  await expect(runMaintenance.run(request({
    ...data, requestId: 'missing-phase-clock',
  }))).rejects.toMatchObject({
    code: 'failed-precondition',
    message: expect.stringMatching(/no current server phase/i),
  });
  expect(mock.update).not.toHaveBeenCalled();
  expect(mock.set).not.toHaveBeenCalled();
});

it('uses only the authoritative completed Reactor upgrade for capacity', async () => {
  const consoles = [
    'fighter-bay-alpha', 'fighter-bay-bravo', 'command-and-control',
    'missile-launchers', 'point-defence-lasers', 'construction-bay',
  ];
  mock.maintenanceCycles = {
    aegis: { step: 5, revision: 0, results: {}, charges: [], refuelled: [] },
  };

  await expect(runMaintenance.run(request({
    ...data, action: 'reactor', requestId: 'reactor-without-upgrade', consoles,
  }))).rejects.toMatchObject({
    code: 'failed-precondition', message: expect.stringMatching(/capacity/i),
  });
  expect(mock.update).not.toHaveBeenCalled();

  mock.shipUpgrades = { aegis: [{ id: 'reactor', status: 'pending' }] };
  await expect(runMaintenance.run(request({
    ...data, action: 'reactor', requestId: 'reactor-pending-upgrade', consoles,
  }))).rejects.toMatchObject({
    code: 'failed-precondition', message: expect.stringMatching(/capacity/i),
  });
  expect(mock.update).not.toHaveBeenCalled();

  mock.shipUpgrades = { aegis: ['reactor'] };
  const upgraded = await runMaintenance.run(request({
    ...data, action: 'reactor', requestId: 'reactor-authoritative-upgrade', consoles,
  }));
  expect(upgraded).toMatchObject({
    status: 'committed',
    cycle: {
      charges: consoles,
      results: { '5': expect.stringContaining('Charged 6/6 consoles.') },
    },
  });
  expect(mock.update).toHaveBeenCalledWith('sessions/s1', expect.objectContaining({
    'maintenanceCycles.aegis': expect.objectContaining({ charges: consoles }),
  }));

  mock.update.mockClear();
  await expect(runMaintenance.run(request({
    ...data,
    action: 'reactor',
    requestId: 'reactor-client-claimed-upgrade',
    consoles,
    upgraded: ['reactor'],
  }))).rejects.toMatchObject({ code: 'invalid-argument' });
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

it('denies a destroyed-ship replacement VIP before the end transition bypass', async () => {
  mock.role = 'player';
  mock.replacementRoleId = 'vip-host';
  mock.escapeState = {
    status: 'pending', shipId: 'dione', destructionEventId: 'damage-destroyed-dione', revision: 1,
  };
  mock.activeConsoleRoleId = null;
  mock.damage = { dione: { damagedSystemIds: [], destroyed: true } };
  mock.maintenanceCycles = {
    dione: { step: 7, revision: 0, turn: 1, results: {}, charges: [], refuelled: [] },
  };

  await expect(runMaintenance.run(request({
    ...data,
    shipId: 'dione',
    action: 'end',
    expectedRevision: 0,
    requestId: 'vip-destroyed-end',
  }))).rejects.toMatchObject({ code: 'failed-precondition' });
  expect(mock.update).not.toHaveBeenCalled();
  expect(mock.set).not.toHaveBeenCalled();
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
    ? { exists: false, get: () => undefined }
    : path === 'sessions/s1/serverState/navigation'
      ? { exists: true, data: () => mock.navigation, get: (key: string) => mock.navigation?.[key] }
      : ({
    exists: true,
    get: (key: string) => path.includes('/players/')
      ? ({ connected: true, role: 'player', activeConsoleRoleId: 'joint-engineering-quellon-refinery' } as Record<string, unknown>)[key]
      : ({ activeRoleIds: mock.activeRoleIds, turnPhase: mock.turnPhase, chartId: 'A', chartSelectionLocked: true } as Record<string, unknown>)[key],
  }));
  await expect(runMaintenance.run(request({ ...data, shipId: 'quellon' }))).resolves.toMatchObject({ step: 1 });
  await expect(runMaintenance.run(request({ ...data, shipId: 'shepherd' }))).rejects.toMatchObject({ code: 'permission-denied' });
});

it('accepts the paired Joint Engineering console identity for its maintenance workspace', async () => {
  mock.activeRoleIds = recommendedRoleIds(14);
  mock.get.mockImplementation(async (path: string) => path.includes('/maintenanceRequests/')
    ? { exists: false, get: () => undefined }
    : path === 'sessions/s1/serverState/navigation'
      ? { exists: true, data: () => mock.navigation, get: (key: string) => mock.navigation?.[key] }
      : ({
    exists: true,
    get: (key: string) => path.includes('/players/')
      ? ({ connected: true, role: 'player', activeConsoleRoleId: 'joint-engineering-quellon-refinery' } as Record<string, unknown>)[key]
      : ({ activeRoleIds: mock.activeRoleIds, turnPhase: mock.turnPhase, chartId: 'A', chartSelectionLocked: true } as Record<string, unknown>)[key],
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
  }))).resolves.toMatchObject({
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
    fleetTicker: expect.objectContaining({
      current: expect.objectContaining({ source: 'automatic', sourceId: 'airspace:2:restricted' }),
    }),
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
  }))).resolves.toMatchObject({
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

it('advances private group pursuit once with the cycle transition and republishes only entitled values', async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-09-06T12:20:07.000Z'));
  mock.currentTurn = 1;
  mock.activeVesselIds = ['dione', 'shepherd'];
  mock.activeRoleIds = ['dione-captain', 'shepherd-captain'];
  mock.turnPhase = {
    turn: 1,
    teamPhaseEndsAt: '2026-09-06T12:05:00.000Z',
    openAirspaceEndsAt: '2026-09-06T12:20:00.000Z',
    airspace: { state: 'lifted', tickerActive: true, pressAccess: false },
  };
  mock.navigation = {
    revision: 3,
    shipGalacticCoordinates: { dione: '5143', shepherd: '1096' },
    shipNavigationLogs: { dione: [], shepherd: [] },
    pursuitGroups: { 'fleet-1': 2, 'fleet-2': 7 },
  };
  mock.fleetGroups = [
    { id: 'fleet-1', vesselIds: ['dione'], memberUids: ['u1'] },
    { id: 'fleet-2', vesselIds: ['shepherd'], memberUids: ['u2'] },
  ];
  mock.discoveryPlayers = [
    { id: 'u1', fields: { fleetGroupId: 'fleet-1', assignedRoleId: 'dione-captain' } },
    { id: 'u2', fields: { fleetGroupId: 'fleet-2', assignedRoleId: 'shepherd-captain' } },
  ];

  await expect(advanceTurn.run(request({
    sessionId: 's1', instanceId: 'bridge', requestId: 'advance-test-pursuit', expectedTurn: 1,
  }))).resolves.toMatchObject({ currentTurn: 2 });

  const navigationWrite = mock.set.mock.calls.find(([path]) =>
    path === 'sessions/s1/serverState/navigation');
  expect(navigationWrite?.[1]).toMatchObject({
    pursuitGroups: { 'fleet-1': 4, 'fleet-2': 7 },
    revision: 4,
  });
  expect(navigationWrite?.[2]).toEqual({
    mergeFields: expect.arrayContaining(['pursuitGroups', 'revision']),
  });
  const gmWrite = mock.set.mock.calls.find(([path]) =>
    path === 'sessions/s1/gmDiscovery/current');
  expect(gmWrite?.[1]).toMatchObject({
    pursuitGroups: { 'fleet-1': 4, 'fleet-2': 7 },
    shipFleetGroupIds: { dione: 'fleet-1', shepherd: 'fleet-2' },
    revision: 4,
  });
  expect(gmWrite?.[2]).toEqual({
    mergeFields: expect.arrayContaining(['pursuitGroups', 'shipFleetGroupIds', 'revision']),
  });
  const firstPlayerWrite = mock.set.mock.calls.find(([path]) =>
    path === 'sessions/s1/playerDiscoveries/u1');
  const secondPlayerWrite = mock.set.mock.calls.find(([path]) =>
    path === 'sessions/s1/playerDiscoveries/u2');
  expect(firstPlayerWrite?.[1]).toMatchObject({ groupId: 'fleet-1', pursuitValue: 4, revision: 4 });
  expect(secondPlayerWrite?.[1]).toMatchObject({ groupId: 'fleet-2', pursuitValue: 7, revision: 4 });
  expect(firstPlayerWrite?.[1]).not.toHaveProperty('pursuitGroups');
  expect(secondPlayerWrite?.[1]).not.toHaveProperty('pursuitGroups');
  expect(mock.update).toHaveBeenCalledWith('sessions/s1', expect.not.objectContaining({
    pursuitGroups: expect.anything(),
  }));
});

it('creates one terminal failure when authoritative pursuit reaches 10 and blocks later gameplay', async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-09-06T12:20:07.000Z'));
  mock.currentTurn = 2;
  mock.activeVesselIds = ['aegis', 'shepherd'];
  mock.activeRoleIds = ['admiral', 'shepherd-captain'];
  mock.turnPhase = {
    turn: 2,
    teamPhaseEndsAt: '2026-09-06T12:05:00.000Z',
    openAirspaceEndsAt: '2026-09-06T12:20:00.000Z',
    airspace: { state: 'lifted', tickerActive: true, pressAccess: false },
  };
  mock.navigation = {
    revision: 8,
    shipGalacticCoordinates: { aegis: '5143', shepherd: '1096' },
    shipNavigationLogs: { aegis: [], shepherd: [] },
    pursuitGroups: { 'fleet-1': 8, 'fleet-2': 4 },
  };
  mock.fleetGroups = [
    { id: 'fleet-1', vesselIds: ['aegis'], memberUids: ['u1'] },
    { id: 'fleet-2', vesselIds: ['shepherd'], memberUids: ['u2'] },
  ];
  mock.discoveryPlayers = [
    { id: 'u1', fields: { fleetGroupId: 'fleet-1', assignedRoleId: 'aegis-captain' } },
    { id: 'u2', fields: { fleetGroupId: 'fleet-2', assignedRoleId: 'shepherd-captain' } },
  ];
  const terminalRequest = {
    sessionId: 's1', instanceId: 'bridge', requestId: 'advance-test-pursuit-failure', expectedTurn: 2,
  };

  const result = await advanceTurn.run(request(terminalRequest));

  expect(result).toEqual({
    currentTurn: 3,
    phase: 'failure',
    gameOutcome: {
      type: 'game-outcome',
      result: 'failure',
      cause: 'pursuit-limit',
      cycle: 3,
      navigationRevision: 9,
      occurredAt: '2026-09-06T12:20:07.000Z',
    },
    maintenanceCycles: {},
    shuttleFuelled: {},
  });
  expect(mock.update).toHaveBeenCalledWith('sessions/s1', expect.objectContaining({
    currentTurn: 3,
    phase: 'failure',
    gameOutcome: result.gameOutcome,
    survivorOutcome: expect.objectContaining({
      type: 'survivor-outcome', cycle: 3,
      fleetShipPopulation: 32_500,
      survivingShipPopulation: 32_500,
      evacuatedPopulation: 0,
      lostPopulation: 0,
      finalSurvivors: 32_500,
      survivingShipIds: ['aegis', 'shepherd'],
      lostOrDestroyedShipIds: [],
    }),
    turnPhase: 'delete-field',
    turnState: 'delete-field',
    turnStartAnnouncement: 'delete-field',
  }));
  expect(mock.set).toHaveBeenCalledWith(
    'sessions/s1/serverState/navigation',
    expect.objectContaining({ pursuitGroups: { 'fleet-1': 10, 'fleet-2': 4 }, revision: 9 }),
    { mergeFields: expect.arrayContaining(['pursuitGroups', 'revision']) },
  );
  expect(mock.set).toHaveBeenCalledWith(
    'sessions/s1/commandReceipts/advance-test-pursuit-failure',
    expect.objectContaining({ result }),
  );
  expect(mock.set.mock.calls.some(([path]) => String(path).includes('/events/'))).toBe(false);

  mock.phase = 'failure';
  mock.update.mockClear();
  mock.set.mockClear();
  await expect(advanceTurn.run(request(terminalRequest))).resolves.toEqual(result);
  expect(mock.update).not.toHaveBeenCalled();
  expect(mock.set).not.toHaveBeenCalled();

  await expect(runMaintenance.run(request({
    ...data,
    requestId: 'maintenance-after-pursuit-failure',
  }))).rejects.toMatchObject({
    code: 'failed-precondition',
    message: expect.stringMatching(/endgame evaluation/i),
  });
  expect(mock.update).not.toHaveBeenCalled();
  expect(mock.set).not.toHaveBeenCalled();
});

it('blocks a cycle transition when stored pursuit authority is malformed', async () => {
  mock.currentTurn = 1;
  mock.activeVesselIds = ['dione'];
  mock.activeRoleIds = ['dione-captain'];
  mock.turnPhase = {
    turn: 1,
    teamPhaseEndsAt: '2026-09-06T11:55:00.000Z',
    openAirspaceEndsAt: '2026-09-06T11:59:00.000Z',
    airspace: { state: 'lifted', tickerActive: true, pressAccess: false },
  };
  mock.navigation = {
    revision: 3,
    shipGalacticCoordinates: { dione: '5143' },
    shipNavigationLogs: { dione: [] },
    pursuitGroups: { 'fleet-1': 2, 'fleet-2': 'broken' },
  };
  mock.fleetGroups = [
    { id: 'fleet-1', vesselIds: ['dione'], memberUids: ['u1'] },
  ];

  await expect(advanceTurn.run(request({
    sessionId: 's1', instanceId: 'bridge', requestId: 'advance-test-malformed-pursuit', expectedTurn: 1,
  }))).rejects.toMatchObject({
    code: 'failed-precondition',
    message: expect.stringMatching(/pursuit authority is malformed/i),
  });
  expect(mock.update).not.toHaveBeenCalled();
  expect(mock.set).not.toHaveBeenCalled();
});

it('migrates legacy member-readable pursuit authority and deletes it atomically', async () => {
  mock.currentTurn = 1;
  mock.activeVesselIds = ['dione'];
  mock.activeRoleIds = ['dione-captain'];
  mock.turnPhase = {
    turn: 1,
    teamPhaseEndsAt: '2026-09-06T11:55:00.000Z',
    openAirspaceEndsAt: '2026-09-06T11:59:00.000Z',
    airspace: { state: 'lifted', tickerActive: true, pressAccess: false },
  };
  mock.legacyPursuitGroups = { fleet: 2 };
  mock.fleetGroups = [
    { id: 'fleet-1', vesselIds: ['dione'], memberUids: ['u1'] },
  ];
  mock.discoveryPlayers = [
    { id: 'u1', fields: { fleetGroupId: 'fleet-1', assignedRoleId: 'dione-captain' } },
  ];

  await expect(advanceTurn.run(request({
    sessionId: 's1', instanceId: 'bridge', requestId: 'advance-test-legacy-pursuit', expectedTurn: 1,
  }))).resolves.toMatchObject({ currentTurn: 2 });

  expect(mock.set).toHaveBeenCalledWith(
    'sessions/s1/serverState/navigation',
    expect.objectContaining({ pursuitGroups: { 'fleet-1': 4 }, revision: 1 }),
    { mergeFields: expect.arrayContaining(['pursuitGroups', 'revision']) },
  );
  expect(mock.set).toHaveBeenCalledWith(
    'sessions/s1/playerDiscoveries/u1',
    expect.objectContaining({ groupId: 'fleet-1', pursuitValue: 4, revision: 1 }),
  );
  expect(mock.update).toHaveBeenCalledWith('sessions/s1', expect.objectContaining({
    pursuitGroups: 'delete-field',
    currentTurn: 2,
  }));
});

it('blocks pursuit advancement when vessel membership or player pointers mismatch group authority', async () => {
  mock.currentTurn = 1;
  mock.activeVesselIds = ['dione', 'shepherd'];
  mock.activeRoleIds = ['dione-captain', 'shepherd-captain'];
  mock.turnPhase = {
    turn: 1,
    teamPhaseEndsAt: '2026-09-06T11:55:00.000Z',
    openAirspaceEndsAt: '2026-09-06T11:59:00.000Z',
    airspace: { state: 'lifted', tickerActive: true, pressAccess: false },
  };
  mock.navigation = {
    revision: 3,
    shipGalacticCoordinates: { dione: '5143', shepherd: '1096' },
    shipNavigationLogs: { dione: [], shepherd: [] },
    pursuitGroups: { 'fleet-1': 2, 'fleet-2': 4 },
  };
  mock.fleetGroups = [
    { id: 'fleet-1', vesselIds: ['dione'], memberUids: ['u1'] },
    { id: 'fleet-2', vesselIds: ['shepherd'], memberUids: ['u2'] },
  ];
  mock.discoveryPlayers = [
    { id: 'u1', fields: { fleetGroupId: 'fleet-2', assignedRoleId: 'dione-captain' } },
    { id: 'u2', fields: { fleetGroupId: 'fleet-1', assignedRoleId: 'shepherd-captain' } },
  ];

  await expect(advanceTurn.run(request({
    sessionId: 's1', instanceId: 'bridge', requestId: 'advance-test-swapped-pursuit', expectedTurn: 1,
  }))).rejects.toMatchObject({
    code: 'failed-precondition',
    message: expect.stringMatching(/incomplete or mismatched/i),
  });
  expect(mock.update).not.toHaveBeenCalled();
  expect(mock.set).not.toHaveBeenCalled();

  mock.fleetGroups = [
    { id: 'fleet-1', vesselIds: ['dione'], memberUids: ['u1'] },
    { id: 'fleet-2', vesselIds: ['dione'], memberUids: ['u2'] },
  ];
  mock.discoveryPlayers = [
    { id: 'u1', fields: { fleetGroupId: 'fleet-1', assignedRoleId: 'dione-captain' } },
    { id: 'u2', fields: { fleetGroupId: 'fleet-2', assignedRoleId: 'shepherd-captain' } },
  ];

  await expect(advanceTurn.run(request({
    sessionId: 's1', instanceId: 'bridge', requestId: 'advance-test-duplicate-vessel', expectedTurn: 1,
  }))).rejects.toMatchObject({
    code: 'failed-precondition',
    message: expect.stringMatching(/vessel authority is malformed/i),
  });
  expect(mock.update).not.toHaveBeenCalled();
  expect(mock.set).not.toHaveBeenCalled();
});

it('blocks a next-Team transition while an admitted small ship is undocked', async () => {
  mock.currentTurn = 1;
  mock.turnPhase = {
    turn: 1,
    teamPhaseEndsAt: '2026-09-06T11:55:00.000Z',
    openAirspaceEndsAt: '2026-09-06T11:59:00.000Z',
    airspace: { state: 'lifted', tickerActive: true, pressAccess: false },
  };
  mock.smallShipStates = { gorgoneion: emptySmallShipState('gorgoneion') };
  await expect(advanceTurn.run(request({
    sessionId: 's1', instanceId: 'bridge', expectedTurn: 1, overridePhaseTimer: true,
  }))).rejects.toMatchObject({
    code: 'failed-precondition', message: expect.stringMatching(/docked.*Team/i),
  });
  expect(mock.update).not.toHaveBeenCalled();
  expect(mock.set).not.toHaveBeenCalled();
});

it.each([
  ['missing', (dockings: readonly unknown[]) => dockings.slice(1)],
  ['duplicated', (dockings: readonly unknown[]) => [...dockings, dockings[0]]],
  ['in transit', (dockings: readonly unknown[]) => [
    { ...(dockings[0] as Record<string, unknown>), inTransit: true }, ...dockings.slice(1),
  ]],
] as const)('blocks a next-Team transition when an enabled shuttle is %s', async (_case, mutate) => {
  mock.currentTurn = 1;
  mock.activeRoleIds = recommendedRoleIds(18);
  const initialDockings = initialShuttleDockingsForRoles(mock.activeRoleIds);
  expect(initialDockings.length).toBeGreaterThan(0);
  mock.shuttleDockings = mutate(initialDockings);
  mock.turnPhase = {
    turn: 1,
    teamPhaseEndsAt: '2026-09-06T11:55:00.000Z',
    openAirspaceEndsAt: '2026-09-06T11:59:00.000Z',
    airspace: { state: 'lifted', tickerActive: true, pressAccess: false },
  };

  await expect(advanceTurn.run(request({
    sessionId: 's1', instanceId: 'bridge', expectedTurn: 1, overridePhaseTimer: true,
  }))).rejects.toMatchObject({
    code: 'failed-precondition', message: expect.stringMatching(/shuttle.*docked.*Team/i),
  });
  expect(mock.update).not.toHaveBeenCalled();
  expect(mock.set).not.toHaveBeenCalled();
});

it('rejects an unknown shuttle host even when a corrupted active-vessel roster names it', async () => {
  mock.currentTurn = 1;
  mock.activeRoleIds = recommendedRoleIds(18);
  mock.activeVesselIds = ['bogus'];
  mock.shuttleDockings = initialShuttleDockingsForRoles(mock.activeRoleIds).map((docking) => ({
    ...docking,
    shipId: 'bogus',
  }));
  mock.turnPhase = {
    turn: 1,
    teamPhaseEndsAt: '2026-09-06T11:55:00.000Z',
    openAirspaceEndsAt: '2026-09-06T11:59:00.000Z',
    airspace: { state: 'lifted', tickerActive: true, pressAccess: false },
  };

  await expect(advanceTurn.run(request({
    sessionId: 's1', instanceId: 'bridge', expectedTurn: 1, overridePhaseTimer: true,
  }))).rejects.toMatchObject({
    code: 'failed-precondition', message: expect.stringMatching(/shuttle.*docked.*Team/i),
  });
  expect(mock.update).not.toHaveBeenCalled();
  expect(mock.set).not.toHaveBeenCalled();
});

it('advances a legacy session whose stored role tuple still includes Press', async () => {
  mock.currentTurn = 1;
  mock.activeRoleIds = [...recommendedRoleIds(18), 'press-officer'];
  mock.turnPhase = {
    turn: 1,
    teamPhaseEndsAt: '2026-09-06T11:55:00.000Z',
    openAirspaceEndsAt: '2026-09-06T11:59:00.000Z',
    airspace: { state: 'lifted', tickerActive: true, pressAccess: false },
  };

  await expect(advanceTurn.run(request({
    sessionId: 's1', instanceId: 'bridge', expectedTurn: 1, overridePhaseTimer: true,
  }))).resolves.toMatchObject({ currentTurn: 2 });
  expect(mock.update).toHaveBeenCalledWith('sessions/s1', expect.objectContaining({ currentTurn: 2 }));
});

it('commits one server-owned Coordination completion announcement with the next-turn state', async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-09-06T12:20:07.000Z'));
  mock.currentTurn = 1;
  mock.fleetSurvivorPopulationAdjustment = 41;
  mock.turnPhase = {
    turn: 1,
    teamPhaseEndsAt: '2026-09-06T11:55:00.000Z',
    openAirspaceEndsAt: '2026-09-06T11:59:00.000Z',
    airspace: { state: 'lifted', tickerActive: true, pressAccess: false },
  };

  const reply = await advanceTurn.run(request({
    sessionId: 's1',
    instanceId: 'bridge',
    expectedTurn: 1,
    // A client-supplied transmission is ignored; the server derives the
    // message from the committed next-turn state.
    turnStartAnnouncement: { turn: 99, survivorPopulation: 1 },
  }));

  expect(reply).toMatchObject({
    currentTurn: 2,
    turnStartAnnouncement: { turn: 2, survivorPopulation: 242_541 },
    turnPhase: { turn: 2 },
  });
  expect(mock.update).toHaveBeenCalledTimes(1);
  expect(mock.update).toHaveBeenCalledWith('sessions/s1', expect.objectContaining({
    currentTurn: 2,
    turnStartAnnouncement: { turn: 2, survivorPopulation: 242_541 },
    turnPhase: expect.objectContaining({ turn: 2 }),
  }));
  expect(mock.set).toHaveBeenCalledTimes(1);
  expect(mock.set).toHaveBeenCalledWith(
    'sessions/s1/events/turn-advanced-1',
    expect.objectContaining({
      type: 'turn-advanced',
      transition: 'coordination-to-next-turn',
      fromTurn: 1,
      toTurn: 2,
      revision: 2,
    }),
  );
});

it('freezes the configured final turn in debrief and replays the terminal receipt', async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-09-06T12:20:00.000Z'));
  mock.currentTurn = 6;
  mock.turnLimit = 6;
  mock.turnStartAnnouncement = { turn: 6, survivorPopulation: 242_500 };
  mock.fleetSurvivorPopulationAdjustment = 999_999;
  mock.turnState = {
    currentTurn: 6,
    maxTurn: 6,
    phase: 'team',
    phaseRevision: 6,
    startedAt: '2026-09-06T12:00:00.000Z',
    endsAt: '2026-09-06T12:05:00.000Z',
  };
  mock.maintenanceCycles = {
    aegis: {
      step: 0,
      revision: 8,
      turn: 6,
      results: { '7': 'Maintenance cycle complete.' },
      charges: ['jump-drive'],
      refuelled: ['starlight'],
    },
  };
  mock.shuttleFuelled = { starlight: true };
  mock.activeVesselIds = ['aegis'];
  mock.activeRoleIds = ['admiral'];
  mock.shuttleDockings = initialShuttleDockingsForRoles(mock.activeRoleIds).map((docking) => ({
    ...docking,
    inTransit: true,
  }));
  mock.legacyPursuitGroups = { fleet: 8 };
  mock.fleetGroups = [
    { id: 'fleet-1', vesselIds: ['aegis'], memberUids: ['u1'] },
  ];
  mock.discoveryPlayers = [
    { id: 'u1', fields: { fleetGroupId: 'fleet-1', assignedRoleId: 'aegis-captain' } },
  ];
  mock.turnPhase = {
    turn: 6,
    teamPhaseEndsAt: '2026-09-06T12:05:00.000Z',
    openAirspaceEndsAt: '2026-09-06T12:20:00.000Z',
    airspace: { state: 'lifted', tickerActive: true, pressAccess: false },
  };

  const terminalRequest = {
    sessionId: 's1',
    instanceId: 'bridge',
    requestId: 'advance-test-final',
    expectedTurn: 6,
  };
  const result = await advanceTurn.run(request(terminalRequest));

  expect(result).toMatchObject({
    currentTurn: 6,
    phase: 'debrief',
    maintenanceCycles: {
      aegis: expect.objectContaining({ charges: [], refuelled: [] }),
    },
    shuttleFuelled: { starlight: false },
  });
  expect(mock.update).toHaveBeenCalledWith('sessions/s1', expect.objectContaining({
    currentTurn: 6,
    phase: 'debrief',
    turnPhase: 'delete-field',
    turnState: 'delete-field',
    turnStartAnnouncement: 'delete-field',
    pursuitGroups: 'delete-field',
    fleetTicker: expect.objectContaining({
      revision: 2,
      current: expect.objectContaining({
        source: 'automatic',
        priority: 100,
        text: expect.stringContaining('CREDITS //'),
        sourceId: 'debrief:1',
      }),
    }),
    survivorOutcome: expect.objectContaining({
      type: 'survivor-outcome', cycle: 6,
      fleetShipPopulation: 2_500,
      survivingShipPopulation: 2_500,
      finalSurvivors: 2_500,
      survivingShipIds: ['aegis'],
      lostOrDestroyedShipIds: [],
    }),
  }));
  expect(mock.set).toHaveBeenCalledWith(
    'sessions/s1/commandReceipts/advance-test-final',
    expect.objectContaining({
      fingerprint: expect.objectContaining({
        action: 'advance-turn',
        expectedRevision: 6,
      }),
      result: expect.objectContaining({ currentTurn: 6, phase: 'debrief' }),
    }),
  );
  expect(mock.set).toHaveBeenCalledWith(
    'sessions/s1/serverState/navigation',
    expect.objectContaining({ pursuitGroups: { 'fleet-1': 8 }, revision: 1 }),
    { mergeFields: expect.arrayContaining(['pursuitGroups', 'revision']) },
  );
  expect(mock.set).toHaveBeenCalledWith(
    'sessions/s1/playerDiscoveries/u1',
    expect.objectContaining({ groupId: 'fleet-1', pursuitValue: 8, revision: 1 }),
  );
  expect(mock.set.mock.calls.some(([path]) => String(path).includes('/events/'))).toBe(false);
  mock.phase = 'debrief';

  mock.update.mockClear();
  mock.set.mockClear();
  await expect(advanceTurn.run(request(terminalRequest))).resolves.toEqual(result);
  expect(mock.update).not.toHaveBeenCalled();
  expect(mock.set).not.toHaveBeenCalled();

  mock.update.mockClear();
  mock.set.mockClear();
  await expect(advanceTurn.run(request({
    ...terminalRequest,
    requestId: 'advance-test-final-retry',
  }))).rejects.toMatchObject({
    code: 'failed-precondition',
    message: expect.stringMatching(/endgame evaluation/i),
  });
  expect(mock.update).not.toHaveBeenCalled();
  expect(mock.set).not.toHaveBeenCalled();
});

it('rejects normal gameplay mutations after final-turn debrief begins', async () => {
  mock.phase = 'debrief';
  mock.currentTurn = 6;
  await expect(runMaintenance.run(request({
    ...data,
    expectedRevision: 0,
  }))).rejects.toMatchObject({
    code: 'failed-precondition',
    message: expect.stringMatching(/endgame evaluation/i),
  });
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
  }))).resolves.toMatchObject({
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
  }))).resolves.toMatchObject({
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
    fleetTicker: expect.objectContaining({
      current: expect.objectContaining({
        source: 'automatic', sourceId: 'airspace:2:lifted', priority: 50, passCount: 1,
      }),
      queued: expect.arrayContaining([
        expect.objectContaining({ source: 'press', sourceId: 'earlier' }),
      ]),
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
    message: expect.stringMatching(/cycle changed/i),
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

  const teamActions = [
    { action: 'begin', expectedRevision: 0 },
    { action: 'storage', expectedRevision: 1 },
    { action: 'rations', expectedRevision: 2, foodLevel: 0, waterLevel: 0 },
    { action: 'unrest', expectedRevision: 3 },
    { action: 'riot', expectedRevision: 4 },
    { action: 'reactor', expectedRevision: 5, consoles: ['jump-drive'] },
    { action: 'bays', expectedRevision: 6, refuels: { 'shuttle-bay-zeta': 'starlight' } },
    { action: 'end', expectedRevision: 7 },
  ] as const;
  for (const action of teamActions) {
    mock.update.mockClear();
    mock.set.mockClear();
    await expect(runMaintenance.run(request({
      ...data,
      ...action,
      requestId: `coordination-maintenance-${action.action}`,
    }))).rejects.toMatchObject({
      code: 'failed-precondition',
      message: expect.stringMatching(/only available during Team Phase/i),
    });
    expect(mock.update).not.toHaveBeenCalled();
    expect(mock.set).not.toHaveBeenCalled();
  }
});

it('does not reopen normal airspace after the coordination window has ended', async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-09-06T12:20:00.001Z'));
  mock.currentTurn = 2;
  mock.turnPhase = {
    turn: 2,
    teamPhaseEndsAt: '2026-09-06T12:05:00.000Z',
    openAirspaceEndsAt: '2026-09-06T12:20:00.000Z',
    airspace: { state: 'restricted', tickerActive: true, pressAccess: false },
  };

  await expect(beginOpenAirspacePhase.run(request({
    sessionId: 's1', expectedTurn: 2,
  }))).rejects.toMatchObject({
    code: 'failed-precondition',
    message: expect.stringMatching(/airspace window has closed/i),
  });
  expect(mock.update).not.toHaveBeenCalled();
  expect(mock.set).not.toHaveBeenCalled();
});

it('keeps an overrunning Wolf attack locked through Team Phase until facilitator resolution', async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-09-06T12:05:00.000Z'));
  mock.currentTurn = 2;
  mock.turnPhase = {
    turn: 2,
    teamPhaseEndsAt: '2026-09-06T12:05:00.000Z',
    openAirspaceEndsAt: '2026-09-06T12:20:00.000Z',
    airspace: { state: 'restricted', tickerActive: true, pressAccess: false },
  };
  mock.wolfAttackState = {
    status: 'declared',
    airspaceLocked: true,
    parkingReleaseCondition: 'normal-movement-reopened',
    parkedShuttleDockings: [
      { shuttleId: 'starlight', shipId: 'dione', dockedAt: 'CYCLE 1 // RELOCATED' },
    ],
  };

  await expect(beginOpenAirspacePhase.run(request({
    sessionId: 's1', expectedTurn: 2,
  }))).rejects.toMatchObject({
    code: 'failed-precondition',
    message: expect.stringMatching(/awaits facilitator resolution.*movement remains blocked/i),
  });
  expect(mock.update).not.toHaveBeenCalled();
  expect(mock.set).not.toHaveBeenCalled();
  expect(mock.wolfAttackState.parkedShuttleDockings).toEqual([
    { shuttleId: 'starlight', shipId: 'dione', dockedAt: 'CYCLE 1 // RELOCATED' },
  ]);

  mock.wolfAttackState = {
    ...mock.wolfAttackState,
    status: 'resolved',
    airspaceLocked: false,
  };
  await expect(beginOpenAirspacePhase.run(request({
    sessionId: 's1', expectedTurn: 2,
  }))).resolves.toMatchObject({
    turnPhase: { airspace: { state: 'lifted' } },
  });
});

it('requires an active session member to synchronize normal airspace', async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-09-06T12:05:00.000Z'));
  mock.currentTurn = 2;
  mock.connected = false;
  mock.turnPhase = {
    turn: 2,
    teamPhaseEndsAt: '2026-09-06T12:05:00.000Z',
    openAirspaceEndsAt: '2026-09-06T12:20:00.000Z',
    airspace: { state: 'restricted', tickerActive: true, pressAccess: false },
  };

  await expect(beginOpenAirspacePhase.run(request({
    sessionId: 's1', expectedTurn: 2,
  }))).rejects.toMatchObject({ code: 'permission-denied' });
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
  expect(first).toMatchObject({ turnPhase: expected });
  expect(second).toMatchObject({ turnPhase: expected });
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
    .resolves.toMatchObject({ turnPhase: expected });
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
  mock.activeVesselIds = ['aegis'];
  mock.activeRoleIds = ['admiral'];
  mock.navigation = {
    revision: 1,
    shipGalacticCoordinates: { aegis: '0000' },
    shipNavigationLogs: { aegis: [] },
    pursuitGroups: { 'fleet-1': 2 },
  };
  mock.fleetGroups = [
    { id: 'fleet-1', vesselIds: ['aegis'], memberUids: ['u1', 'u2'] },
  ];
  mock.discoveryPlayers = [
    { id: 'u1', fields: { fleetGroupId: 'fleet-1', assignedRoleId: 'admiral' } },
    { id: 'u2', fields: { fleetGroupId: 'fleet-1', assignedRoleId: 'vice-admiral' } },
  ];
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
    message: expect.stringMatching(/cycle changed/i),
  });
  expect(mock.currentTurn).toBe(2);
  expect(mock.update).toHaveBeenCalledTimes(1);
  const pursuitWrites = mock.set.mock.calls.filter(([path]) =>
    path === 'sessions/s1/serverState/navigation');
  expect(pursuitWrites).toHaveLength(1);
  expect(pursuitWrites[0]?.[1]).toMatchObject({ pursuitGroups: { 'fleet-1': 4 }, revision: 2 });
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
  }))).resolves.toMatchObject({
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

it('keeps the persisted turn entity aligned with a phase boundary and timer update', async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-09-06T12:05:00.000Z'));
  mock.currentTurn = 2;
  mock.turnLimit = 7;
  mock.turnPhase = {
    turn: 2,
    teamPhaseEndsAt: '2026-09-06T12:05:00.000Z',
    openAirspaceEndsAt: '2026-09-06T12:20:00.000Z',
    airspace: { state: 'restricted', tickerActive: true, pressAccess: false },
  };
  mock.turnState = {
    currentTurn: 2,
    maxTurn: 7,
    phase: 'team',
    phaseRevision: 3,
    startedAt: '2026-09-06T12:00:00.000Z',
    endsAt: '2026-09-06T12:05:00.000Z',
  };

  await expect(beginOpenAirspacePhase.run(request({
    sessionId: 's1', expectedTurn: 2,
  }))).resolves.toMatchObject({
    turnState: {
      currentTurn: 2,
      maxTurn: 7,
      phase: 'coordination',
      phaseRevision: 4,
      startedAt: '2026-09-06T12:05:00.000Z',
      endsAt: '2026-09-06T12:20:00.000Z',
    },
  });
  expect(mock.update).toHaveBeenCalledWith('sessions/s1', expect.objectContaining({
    turnState: expect.objectContaining({ phase: 'coordination', phaseRevision: 4 }),
  }));

  mock.turnPhase = {
    ...mock.turnPhase,
    airspace: { ...mock.turnPhase.airspace, state: 'lifted' as const },
  };
  mock.turnState = {
    ...mock.turnState as Record<string, unknown>,
    phase: 'coordination',
    phaseRevision: 4,
    startedAt: '2026-09-06T12:05:00.000Z',
    endsAt: '2026-09-06T12:20:00.000Z',
  };
  mock.update.mockClear();
  await expect(extendAirspaceWindow.run(request({
    sessionId: 's1', instanceId: 'bridge', expectedTurn: 2, window: 'open',
  }))).resolves.toMatchObject({
    turnState: expect.objectContaining({
      phase: 'coordination', phaseRevision: 4, endsAt: '2026-09-06T12:25:00.000Z',
    }),
  });
  expect(mock.update).toHaveBeenCalledWith('sessions/s1', expect.objectContaining({
    turnState: expect.objectContaining({ phaseRevision: 4, endsAt: '2026-09-06T12:25:00.000Z' }),
  }));
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
    fleetTicker: expect.objectContaining({
      current: expect.objectContaining({ source: 'automatic', sourceId: 'emergency:2:2026-09-06T12:02:00.000Z' }),
    }),
  }));
  expect(mock.set).toHaveBeenCalledWith('sessions/s1/events/pause-event', expect.objectContaining({
    type: 'timer-pause', action: 'paused', turn: 2, window: 'restricted',
    actorName: 'GM', byUid: 'u1', createdAt: 'server-time',
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

it('keeps an unresolved Wolf attack restricted across emergency pause and resume', async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-09-06T12:07:00.000Z'));
  mock.currentTurn = 2;
  mock.turnPhase = {
    turn: 2,
    teamPhaseEndsAt: '2026-09-06T12:05:00.000Z',
    openAirspaceEndsAt: '2026-09-06T12:20:00.000Z',
    airspace: { state: 'restricted', tickerActive: true, pressAccess: false },
  };
  mock.wolfAttackState = {
    status: 'declared', airspaceLocked: true,
    parkingReleaseCondition: 'normal-movement-reopened',
  };
  mock.randomUUID.mockReturnValue('attack-pause-event');

  await expect(setEmergencyTimerPaused.run(request({
    sessionId: 's1', instanceId: 'bridge', expectedTurn: 2, paused: true,
  }))).resolves.toMatchObject({
    turnPhase: {
      airspace: { state: 'restricted' },
      timerPause: { window: 'open', remainingMs: 780_000 },
    },
  });

  mock.turnPhase = mock.update.mock.calls.at(-1)?.[1].turnPhase;
  vi.setSystemTime(new Date('2026-09-06T12:08:00.000Z'));
  const resumed = await setEmergencyTimerPaused.run(request({
    sessionId: 's1', instanceId: 'bridge', expectedTurn: 2, paused: false,
  }));
  expect(resumed).toMatchObject({
    turnPhase: { airspace: { state: 'restricted' } },
  });
  expect(resumed.turnPhase).not.toHaveProperty('timerPause');
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

  await expect(unlockPressAirspace.run(request({ sessionId: 's1' }))).resolves.toMatchObject({
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
  await expect(unlockPressAirspace.run(request({ sessionId: 's1' }))).resolves.toMatchObject({
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

  mock.update.mockClear();
  mock.set.mockClear();
  vi.setSystemTime(new Date('2026-09-06T12:30:00.001Z'));
  await expect(unlockPressAirspace.run(request({ sessionId: 's1' }))).rejects.toMatchObject({
    code: 'failed-precondition',
    message: expect.stringMatching(/airspace window has closed/i),
  });
  expect(mock.update).not.toHaveBeenCalled();
  expect(mock.set).not.toHaveBeenCalled();
});

it('does not let the Press exception lift an unresolved Wolf attack after the Team deadline', async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-09-06T12:10:00.000Z'));
  mock.role = 'player';
  mock.activeConsoleRoleId = 'admiral';
  mock.turnPhase = {
    turn: 1,
    teamPhaseEndsAt: '2026-09-06T12:10:00.000Z',
    openAirspaceEndsAt: '2026-09-06T12:30:00.000Z',
    airspace: { state: 'restricted', tickerActive: true, pressAccess: false },
  };
  mock.wolfAttackState = {
    status: 'declared', airspaceLocked: true,
    parkingReleaseCondition: 'normal-movement-reopened',
  };

  await expect(unlockPressAirspace.run(request({ sessionId: 's1' }))).resolves.toMatchObject({
    turnPhase: { airspace: { state: 'restricted', pressAccess: true } },
  });
  expect(mock.update).toHaveBeenLastCalledWith('sessions/s1', expect.objectContaining({
    turnPhase: expect.objectContaining({ airspace: expect.objectContaining({ state: 'restricted' }) }),
  }));

  mock.turnPhase = {
    ...mock.turnPhase,
    airspace: { state: 'restricted', tickerActive: true, pressAccess: false },
  };
  mock.wolfAttackState = {
    status: 'resolved', airspaceLocked: false,
    parkingReleaseCondition: 'normal-movement-reopened',
  };
  await expect(unlockPressAirspace.run(request({ sessionId: 's1' }))).resolves.toMatchObject({
    turnPhase: { airspace: { state: 'lifted' } },
  });
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

it('allows an entitled player travel-lock action without the obsolete Turn 0 gate', async () => {
  mock.role = 'player';
  mock.activeConsoleRoleId = 'admiral';
  mock.currentTurn = 0;
  await expect(setShipConsoleLock.run(request({
    sessionId: 's1', shipId: 'aegis', locked: true, requestId: 'lock-turn-zero',
  }))).resolves.toMatchObject({ locked: true });
  expect(mock.update).toHaveBeenCalled();
});

it('holds every maintenance cycle at Turn 0, including the GM path', async () => {
  mock.currentTurn = 0;

  await expect(runMaintenance.run(request(data))).rejects.toMatchObject({
    code: 'failed-precondition',
    message: expect.stringMatching(/cycle 1/i),
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
    if (path === 'sessions/s1/serverState/navigation') {
      return { exists: true, data: () => mock.navigation, get: (key: string) => mock.navigation?.[key] };
    }
    const fields: Record<string, unknown> = path.includes('/players/')
      ? { connected: true, role: 'player', activeConsoleRoleId: 'wing-commander' }
      : { turnPhase: mock.turnPhase, chartId: 'A', chartSelectionLocked: true };
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
    if (path === 'sessions/s1') return { exists: true, get: (key: string) => ({ currentTurn: 1, turnPhase: mock.turnPhase, 'maintenanceCycles.aegis': { step: 2, revision: 2 } } as Record<string, unknown>)[key] };
    return previous(path);
  });
  await expect(rollbackMaintenance.run(request({ sessionId: 's1', shipId: 'aegis', instanceId: 'bridge', requestId: 'rollback-simple', expectedRevision: 2 }))).resolves.toMatchObject({ revision: 3 });
  expect(mock.update).toHaveBeenCalledWith('sessions/s1', expect.objectContaining({ 'maintenanceCycles.aegis': { step: 1, revision: 3 } }));
});
it('records and rolls back successive steps while restoring spent supplies', async () => {
  const { rollbackMaintenance } = await import('./index');
  mock.randomInt.mockImplementation((_min: number, max?: number) => max === 7 ? 1 : 0);
  const records: Record<string, Record<string, unknown>> = {
    'sessions/s1': { currentTurn: 1, chartId: 'A', chartSelectionLocked: true, turnPhase: { turn: 1, teamPhaseEndsAt: '2026-09-09T16:20:00.000Z', openAirspaceEndsAt: '2026-09-09T16:40:00.000Z', airspace: { state: 'restricted', tickerActive: true, pressAccess: false } }, maintenanceCycles: { aegis: { step: 0, revision: 0, results: {}, charges: [], refuelled: [] } }, shipResources: { aegis: { food: 20, water: 20, fuel: 3, materials: 0, ore: 0 } }, shipDamage: { aegis: { damagedSystemIds: ['storage'], destroyed: false } }, shipSurvivors: { aegis: 2000 }, shipUnrest: { aegis: 1 }, shuttleCargo: {}, shuttleFuelled: {}, unrestAlerts: {}, populationAlerts: {} },
    'sessions/s1/serverState/navigation': { shipGalacticCoordinates: { aegis: '0000' } },
    'sessions/s1/players/u1': { connected: true, role: 'gm' },
    'sessions/s1/gmInstances/bridge': {
      uid: 'u1', connected: true,
      claimedAt: { toMillis: () => Date.now() }, lastSeenAt: { toMillis: () => Date.now() },
            shipConsoleWriteGrant: { shipId: mock.grantShip, grantedAt: new Date().toISOString() },
    },
    'sessions/s1/gmInstances/bridge/private/shipConsoleWriteGrant': {
      type: 'gm-ship-console-write-grant', sessionId: 's1', instanceId: 'bridge', uid: 'u1',
      shipId: mock.grantShip, grantedAt: new Date().toISOString(),
    },
    'sessions/s1/events/pre-existing': { type: 'historical-maintenance', revision: 0 },
  };
  const read = (record: Record<string, unknown> | undefined, key: string): unknown => key.split('.').reduce<unknown>((value, part) => value && typeof value === 'object' ? (value as Record<string, unknown>)[part] : undefined, record);
  mock.get.mockImplementation(async (path: string) => ({
    exists: Boolean(records[path]),
    ...(path === 'sessions/s1/serverState/navigation' ? { data: () => records[path] } : {}),
    get: (key: string) => read(records[path], key),
  }));
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
  records['sessions/s1/gmInstances/bridge'] = {
    uid: 'u2', connected: true,
    claimedAt: { toMillis: () => Date.now() }, lastSeenAt: { toMillis: () => Date.now() },
    shipConsoleWriteGrant: { shipId: mock.grantShip, grantedAt: new Date().toISOString() },
  };
  records['sessions/s1/gmInstances/bridge/private/shipConsoleWriteGrant'] = {
    type: 'gm-ship-console-write-grant', sessionId: 's1', instanceId: 'bridge', uid: 'u2',
    shipId: mock.grantShip, grantedAt: new Date().toISOString(),
  };
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
  records['sessions/s1/gmInstances/bridge'] = {
    uid: 'u1', connected: true,
    claimedAt: { toMillis: () => Date.now() }, lastSeenAt: { toMillis: () => Date.now() },
    shipConsoleWriteGrant: { shipId: mock.grantShip, grantedAt: new Date().toISOString() },
  };
  records['sessions/s1/gmInstances/bridge/private/shipConsoleWriteGrant'] = {
    type: 'gm-ship-console-write-grant', sessionId: 's1', instanceId: 'bridge', uid: 'u1',
    shipId: mock.grantShip, grantedAt: new Date().toISOString(),
  };
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
