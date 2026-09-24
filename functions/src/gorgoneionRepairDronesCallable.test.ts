import { beforeEach, expect, it, vi } from 'vitest';
import type { CallableRequest } from 'firebase-functions/v2/https';
import type { ShipResourceInventory } from './resources';
import { advanceSmallShipMaintenance, emptySmallShipState, type SmallShipMaintenanceInput } from './smallShip';

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
  const get = vi.fn(async (target: { path: string }) => snapshot(target.path));
  const set = vi.fn((target: { path: string }, fields: Fields) => documents.set(target.path, { ...fields }));
  const update = vi.fn((target: { path: string }, fields: Fields) => {
    const current = { ...(documents.get(target.path) ?? {}) };
    for (const [path, value] of Object.entries(fields)) {
      const parts = path.split('.');
      if (parts.length === 1) current[path] = value;
      else {
        let cursor = current;
        for (let index = 0; index < parts.length - 1; index += 1) {
          const key = parts[index]!;
          cursor[key] = { ...((cursor[key] as Fields | undefined) ?? {}) };
          cursor = cursor[key] as Fields;
        }
        cursor[parts.at(-1)!] = value;
      }
    }
    documents.set(target.path, current);
  });
  const runTransaction = vi.fn(async (callback: (tx: unknown) => unknown) => callback({ get, set, update }));
  return { documents, get, set, update, db: { doc: ref, runTransaction } };
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
    constructor(readonly code: string, message: string) { super(message); }
  },
  onCall: (optionsOrHandler: unknown, maybeHandler?: (request: unknown) => unknown) => ({
    run: maybeHandler ?? optionsOrHandler,
  }),
}));

import { repairGorgoneionWithDrones } from './gorgoneionRepairDronesCallable';

const command = {
  sessionId: 's1', requestId: 'repair-drones-1', expectedCycle: 3,
  expectedRepairRevision: 0, expectedDockingRevision: 2,
  expectedHostShipId: 'aegis', systemId: 'reactor',
};
const request = (data: Fields, uid = 'captain') => ({ data, auth: { uid } }) as CallableRequest<Fields>;
const put = (path: string, fields: Fields) => mock.documents.set(path, { ...fields });
const maintenanceCycle = () => ({
  step: 5, revision: 5,
  results: { '1': 'rations', '2': 'unrest', '3': 'riot', '4': 'reactor' },
  charges: ['repair-drones'], turn: 3, rationBonus: 0,
  chargingSkipped: false, startedAt: '2026-09-22T08:00:00.000Z',
});
const gorgoneionState = () => ({
  id: 'gorgoneion', hostShipId: 'aegis', dockingRevision: 2,
  population: 1_000, unrest: 0, cycle: maintenanceCycle(),
});
const resetFixture = () => {
  mock.documents.clear();
  mock.get.mockClear(); mock.set.mockClear(); mock.update.mockClear(); mock.db.runTransaction.mockClear();
  put('sessions/s1', {
    phase: 'active', currentTurn: 3,
    // The extra-ship Captain is a current replacement role, not a casting seat.
    // This user's historical assignedRoleId remains unrelated to that entitlement.
    activeRoleIds: ['warrior-captain'], activeVesselIds: ['aegis', 'gorgoneion'],
    turnPhase: {
      turn: 3, teamPhaseEndsAt: '2099-09-21T12:00:00.000Z',
      openAirspaceEndsAt: '2099-09-21T12:15:00.000Z',
      airspace: { state: 'lifted', tickerActive: true, pressAccess: true },
    },
    smallShipStates: { gorgoneion: gorgoneionState() },
    shipResources: {
      aegis: { ore: 0, fuel: 4, food: 8, water: 6, materials: 5, securityTeams: 9 },
    },
    shipDamage: { aegis: { damagedSystemIds: ['reactor', 'storage'], destroyed: false } },
  });
  put('sessions/s1/players/captain', {
    role: 'player', connected: true, assignedRoleId: 'warrior-captain',
    seatId: null, activeConsoleRoleId: null, replacementRoleId: 'gorgoneion-captain',
  });
};

beforeEach(resetFixture);

it('atomically spends exactly three current docked-host materials, repairs one console, and publishes only the safe outcome', async () => {
  await expect(repairGorgoneionWithDrones.run(request(command))).resolves.toEqual({
    status: 'committed', sessionId: 's1', requestId: 'repair-drones-1',
    smallShipId: 'gorgoneion', hostShipId: 'aegis', systemId: 'reactor',
    materialsSpent: 3, materialsRemaining: 2, cycle: 3, repairRevision: 1,
  });
  expect(mock.documents.get('sessions/s1')).toMatchObject({
    shipDamage: { aegis: { damagedSystemIds: ['storage'], destroyed: false } },
    shipResources: { aegis: { materials: 2 } },
    gorgoneionRepairDrones: { cycle: 3, revision: 1, hostShipId: 'aegis', systemId: 'reactor' },
  });
  expect(mock.documents.get('sessions/s1/events/gorgoneion-repair-drones-repair-drones-1')).toEqual({
    sessionId: 's1', turn: 3, phase: 'active', type: 'gorgoneion-repair-drones',
    requestId: 'repair-drones-1', revision: 1, serverTime: expect.any(String),
    visibility: 'member', createdAt: 'server-time', smallShipId: 'gorgoneion',
    hostShipId: 'aegis', systemId: 'reactor', materialsSpent: 3,
  });
  const event = mock.documents.get('sessions/s1/events/gorgoneion-repair-drones-repair-drones-1')!;
  expect(event).not.toHaveProperty('actorUid');
  expect(event).not.toHaveProperty('actorRoleId');
  expect(event).not.toHaveProperty('holderUid');
  expect(mock.documents.get('sessions/s1/commandReceipts/repair-drones-1')?.fingerprint)
    .toMatchObject({ action: 'gorgoneion-repair-drones', actorUid: 'captain' });
  expect(mock.documents.get('sessions/s1/commandReceipts/repair-drones-1')?.result)
    .not.toHaveProperty('actorUid');
});

it('commits after the real Gorgoneion Team cycle ends before current Coordination', async () => {
  const session = mock.documents.get('sessions/s1')!;
  let state = { ...emptySmallShipState('gorgoneion', 'aegis'), dockingRevision: 2 };
  let hostResources = { ...((session.shipResources as Record<string, ShipResourceInventory>).aegis!) };
  let stepIndex = 0;
  const progress = (action: string, options: Partial<SmallShipMaintenanceInput> = {}) => {
    const result = advanceSmallShipMaintenance({
      state, action, expectedRevision: state.cycle.revision, currentTurn: 3,
      hostResources, rolls: [], now: `2026-09-22T08:00:0${stepIndex++}.000Z`, ...options,
    });
    state = result.state;
    hostResources = result.hostResources;
  };

  progress('begin');
  progress('rations', { foodLevel: 0, waterLevel: 0 });
  progress('unrest', { rolls: [6, 6] });
  progress('riot', { rolls: [6] });
  progress('reactor', { consoles: ['repair-drones'] });
  progress('end');
  expect(state.cycle).toMatchObject({ step: 0, turn: 3, charges: ['repair-drones'] });
  session.smallShipStates = { gorgoneion: state };
  session.shipResources = { aegis: hostResources };

  await expect(repairGorgoneionWithDrones.run(request(command))).resolves.toMatchObject({
    status: 'committed', hostShipId: 'aegis', systemId: 'reactor',
    materialsSpent: 3, cycle: 3, repairRevision: 1,
  });
  expect(mock.documents.get('sessions/s1')).toMatchObject({
    shipDamage: { aegis: { damagedSystemIds: ['storage'], destroyed: false } },
    shipResources: { aegis: { materials: 2 } },
    gorgoneionRepairDrones: { cycle: 3, revision: 1 },
  });
});

it('replays a completed request after Coordination closes without spending or repairing twice', async () => {
  await repairGorgoneionWithDrones.run(request(command));
  const writes = mock.set.mock.calls.length + mock.update.mock.calls.length;
  const session = mock.documents.get('sessions/s1')!;
  session.phase = 'debrief';
  await expect(repairGorgoneionWithDrones.run(request(command))).resolves.toMatchObject({
    status: 'replayed', materialsRemaining: 2, repairRevision: 1,
  });
  expect(mock.set.mock.calls.length + mock.update.mock.calls.length).toBe(writes);
});

it('rejects altered replay payloads and a second repair in the same cycle before mutation', async () => {
  await repairGorgoneionWithDrones.run(request(command));
  const writes = mock.set.mock.calls.length + mock.update.mock.calls.length;
  await expect(repairGorgoneionWithDrones.run(request({ ...command, systemId: 'storage' })))
    .rejects.toMatchObject({ code: 'failed-precondition' });
  await expect(repairGorgoneionWithDrones.run(request({
    ...command, requestId: 'repair-drones-2', expectedRepairRevision: 1, systemId: 'storage',
  }))).rejects.toMatchObject({ code: 'failed-precondition' });
  expect(mock.set.mock.calls.length + mock.update.mock.calls.length).toBe(writes);
});

it.each([
  ['historical Gorgoneion role without replacement entitlement', {
    player: { assignedRoleId: 'gorgoneion-captain', replacementRoleId: null },
  }],
  ['wrong active replacement role', { player: { replacementRoleId: 'commissar' } }],
  ['replacement with an active console role', { player: { activeConsoleRoleId: 'gorgoneion-captain' } }],
  ['replacement retaining a core seat', { player: { seatId: 'warrior-captain' } }],
  ['disconnected Captain', { player: { connected: false } }],
] as const)('denies %s without mutation', async (_label, change) => {
  if ('session' in change) Object.assign(mock.documents.get('sessions/s1')!, change.session);
  if ('player' in change) Object.assign(mock.documents.get('sessions/s1/players/captain')!, change.player);
  await expect(repairGorgoneionWithDrones.run(request(command)))
    .rejects.toMatchObject({ code: 'permission-denied' });
  expect(mock.set).not.toHaveBeenCalled();
  expect(mock.update).not.toHaveBeenCalled();
});

it.each([
  ['extra client fields', { ...command, materials: 99 }],
  ['stale docking revision', { ...command, expectedDockingRevision: 1 }],
  ['stale cycle', { ...command, expectedCycle: 2 }],
])('rejects %s without mutation', async (_label, data) => {
  await expect(repairGorgoneionWithDrones.run(request(data)))
    .rejects.toMatchObject({ code: _label === 'extra client fields' ? 'invalid-argument' : 'failed-precondition' });
  expect(mock.set).not.toHaveBeenCalled();
  expect(mock.update).not.toHaveBeenCalled();
});

it('rejects non-Coordination, expired, and paused cycles before mutation', async () => {
  const session = mock.documents.get('sessions/s1')!;
  session.turnPhase = { ...session.turnPhase as Fields, airspace: { state: 'restricted', tickerActive: false, pressAccess: false } };
  await expect(repairGorgoneionWithDrones.run(request(command))).rejects.toMatchObject({ code: 'failed-precondition' });
  session.turnPhase = {
    ...session.turnPhase as Fields,
    openAirspaceEndsAt: '2000-01-01T00:00:00.000Z',
    airspace: { state: 'lifted', tickerActive: true, pressAccess: true },
  };
  await expect(repairGorgoneionWithDrones.run(request({ ...command, requestId: 'expired' })))
    .rejects.toMatchObject({ code: 'failed-precondition' });
  session.turnPhase = {
    ...session.turnPhase as Fields,
    openAirspaceEndsAt: '2099-09-21T12:15:00.000Z',
    timerPause: { window: 'open', remainingMs: 1_000, pausedAt: '2026-09-22T08:00:00.000Z' },
  };
  await expect(repairGorgoneionWithDrones.run(request({ ...command, requestId: 'paused' })))
    .rejects.toMatchObject({ code: 'failed-precondition' });
  expect(mock.set).not.toHaveBeenCalled();
  expect(mock.update).not.toHaveBeenCalled();
});

it('uses current canonical host resources and damage rather than client-selected or projected values', async () => {
  const session = mock.documents.get('sessions/s1')!;
  session.smallShipStates = { gorgoneion: { ...gorgoneionState(), hostShipId: 'icebreaker' } };
  session.activeVesselIds = ['aegis', 'icebreaker', 'gorgoneion'];
  session.shipResources = {
    aegis: { ore: 0, fuel: 4, food: 8, water: 6, materials: 99, securityTeams: 9 },
    icebreaker: { ore: 0, fuel: 4, food: 11, water: 9, materials: 2, securityTeams: 2 },
  };
  session.shipDamage = { icebreaker: { damagedSystemIds: ['reactor'], destroyed: false } };
  await expect(repairGorgoneionWithDrones.run(request({
    ...command, expectedHostShipId: 'icebreaker', systemId: 'reactor',
  }))).rejects.toMatchObject({ code: 'failed-precondition' });
  expect(mock.documents.get('sessions/s1')).toMatchObject({
    shipResources: { aegis: { materials: 99 }, icebreaker: { materials: 2 } },
    shipDamage: { icebreaker: { damagedSystemIds: ['reactor'] } },
  });
  expect(mock.set).not.toHaveBeenCalled();
  expect(mock.update).not.toHaveBeenCalled();
});

it('rejects command-id collisions with another action and unbound historical events', async () => {
  put('sessions/s1/commandReceipts/repair-drones-1', {
    fingerprint: {
      action: 'some-other-action', sessionId: 's1', requestId: 'repair-drones-1',
      actorUid: 'captain', instanceId: null, expectedRevision: 0, payload: {},
    }, result: {},
  });
  await expect(repairGorgoneionWithDrones.run(request(command))).rejects.toMatchObject({ code: 'failed-precondition' });
  mock.documents.delete('sessions/s1/commandReceipts/repair-drones-1');
  put('sessions/s1/events/gorgoneion-repair-drones-repair-drones-1', { old: true });
  await expect(repairGorgoneionWithDrones.run(request(command))).rejects.toMatchObject({ code: 'failed-precondition' });
  expect(mock.update).not.toHaveBeenCalled();
});
