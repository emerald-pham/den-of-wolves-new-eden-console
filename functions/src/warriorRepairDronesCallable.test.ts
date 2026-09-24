import { beforeEach, expect, it, vi } from 'vitest';
import type { CallableRequest } from 'firebase-functions/v2/https';
import { activeVesselIdsForRoles } from './gameSetup';
import { recommendedRoleIds } from './roleConfiguration';
import { advanceSmallShipMaintenance, emptySmallShipState } from './smallShip';

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

import {
  parseWarriorRepairDronesCommand,
  repairWarriorWithDrones,
} from './warriorRepairDronesCallable';

const command = {
  sessionId: 's1', requestId: 'warrior-repair-1', expectedCycle: 3,
  expectedRepairRevision: 0, expectedDockingRevision: 2,
  expectedHostShipId: 'icebreaker', systemIds: ['storage', 'reactor'],
};
const request = (data: Fields, uid = 'warrior-captain') => ({ data, auth: { uid } }) as CallableRequest<Fields>;
const put = (path: string, fields: Fields) => mock.documents.set(path, { ...fields });
const maintenanceCycle = () => ({
  step: 5, revision: 5,
  results: { '1': 'rations', '2': 'unrest', '3': 'riot', '4': 'reactor' },
  charges: ['repair-drones'], turn: 3, rationBonus: 0,
  chargingSkipped: false, startedAt: '2026-09-22T08:00:00.000Z',
});
const warriorState = () => ({
  id: 'warrior', hostShipId: 'icebreaker', dockingRevision: 2,
  population: 2_000, unrest: 0, cycle: maintenanceCycle(),
});
const resetFixture = () => {
  mock.documents.clear();
  mock.get.mockClear(); mock.set.mockClear(); mock.update.mockClear(); mock.db.runTransaction.mockClear();
  const activeRoleIds = recommendedRoleIds(8);
  put('sessions/s1', {
    phase: 'active', currentTurn: 3,
    activeRoleIds: [...activeRoleIds], activeVesselIds: activeVesselIdsForRoles(activeRoleIds),
    expansion: 'base', capybaraEnabled: true,
    turnPhase: {
      turn: 3, teamPhaseEndsAt: '2099-09-21T12:00:00.000Z',
      openAirspaceEndsAt: '2099-09-21T12:15:00.000Z',
      airspace: { state: 'lifted', tickerActive: true, pressAccess: true },
    },
    smallShipStates: { warrior: warriorState() },
    shipResources: {
      icebreaker: { ore: 0, fuel: 4, food: 11, water: 9, materials: 9, securityTeams: 2 },
    },
    shipDamage: {
      icebreaker: { damagedSystemIds: ['storage', 'reactor', 'jump-drive'], destroyed: false },
    },
  });
  put('sessions/s1/players/warrior-captain', {
    role: 'player', connected: true, assignedRoleId: 'doctor',
    replacementRoleId: 'warrior-captain', seatId: null, activeConsoleRoleId: null,
  });
};

beforeEach(resetFixture);

it('parses only a one or two-console current-host command with explicit revisions', () => {
  expect(parseWarriorRepairDronesCommand(command)).toEqual(command);
  expect(parseWarriorRepairDronesCommand({ ...command, untrustedMaterials: 99 })).toBeNull();
  expect(parseWarriorRepairDronesCommand({ ...command, systemIds: [] })).toBeNull();
  expect(parseWarriorRepairDronesCommand({ ...command, systemIds: ['storage', 'reactor', 'jump-drive'] })).toBeNull();
  expect(parseWarriorRepairDronesCommand({ ...command, systemIds: ['storage', 'storage'] })).toBeNull();
  expect(parseWarriorRepairDronesCommand({ ...command, expectedRepairRevision: Number.MAX_SAFE_INTEGER })).toBeNull();
});

it('authorizes the current replacement-role holder outside the real core roster and commits one repair', async () => {
  const session = mock.documents.get('sessions/s1')!;
  expect(session.activeRoleIds).toEqual(recommendedRoleIds(8));
  expect(session.activeRoleIds).not.toContain('warrior-captain');
  expect(session.activeVesselIds).toEqual(activeVesselIdsForRoles(recommendedRoleIds(8)));

  await expect(repairWarriorWithDrones.run(request(command))).resolves.toEqual({
    status: 'committed', sessionId: 's1', requestId: 'warrior-repair-1',
    smallShipId: 'warrior', hostShipId: 'icebreaker', systemIds: ['storage', 'reactor'],
    materialsSpent: 6, materialsRemaining: 3, cycle: 3, repairRevision: 1,
  });
  expect(mock.documents.get('sessions/s1')).toMatchObject({
    shipDamage: { icebreaker: { damagedSystemIds: ['jump-drive'], destroyed: false } },
    shipResources: { icebreaker: { materials: 3 } },
    warriorRepairDrones: {
      cycle: 3, revision: 1, hostShipId: 'icebreaker', systemIds: ['storage', 'reactor'],
    },
  });
  const receipt = mock.documents.get('sessions/s1/commandReceipts/warrior-repair-1')!;
  expect(receipt.fingerprint).toMatchObject({
    action: 'warrior-repair-drones', actorUid: 'warrior-captain',
    expectedRevision: 0, payload: { expectedHostShipId: 'icebreaker', systemIds: ['storage', 'reactor'] },
  });
  expect(receipt.actorRoleId).toBe('warrior-captain');
  expect(receipt.result).not.toHaveProperty('actorUid');
  expect(receipt.result).not.toHaveProperty('activeRoleHolderUid');
  expect(mock.documents.get('sessions/s1/events/warrior-repair-drones-warrior-repair-1')).toEqual({
    sessionId: 's1', turn: 3, phase: 'active', type: 'warrior-repair-drones',
    requestId: 'warrior-repair-1', revision: 1, serverTime: expect.any(String),
    visibility: 'member', createdAt: 'server-time', smallShipId: 'warrior',
    hostShipId: 'icebreaker', systemIds: ['storage', 'reactor'], materialsSpent: 6,
  });
  const event = mock.documents.get('sessions/s1/events/warrior-repair-drones-warrior-repair-1')!;
  expect(event).not.toHaveProperty('actorUid');
  expect(event).not.toHaveProperty('actorRoleId');
  expect(event).not.toHaveProperty('fingerprint');
  expect(event).not.toHaveProperty('materialsRemaining');
});

it('authorizes the current Warrior replacement role after GM assignment clears its seat pointers', async () => {
  Object.assign(mock.documents.get('sessions/s1/players/warrior-captain')!, {
    assignedRoleId: 'doctor', replacementRoleId: 'warrior-captain',
    seatId: null, activeConsoleRoleId: null,
  });

  await expect(repairWarriorWithDrones.run(request(command))).resolves.toMatchObject({
    status: 'committed', smallShipId: 'warrior', hostShipId: 'icebreaker',
  });
  expect(mock.documents.get('sessions/s1/commandReceipts/warrior-repair-1'))
    .toHaveProperty('actorRoleId', 'warrior-captain');
});

it('does not grant the Warrior Captain action from a stale assignedRoleId alone', async () => {
  Object.assign(mock.documents.get('sessions/s1/players/warrior-captain')!, {
    assignedRoleId: 'warrior-captain', replacementRoleId: null,
    seatId: null, activeConsoleRoleId: null,
  });

  await expect(repairWarriorWithDrones.run(request(command))).rejects.toMatchObject({
    code: 'permission-denied',
  });
  expect(mock.set).not.toHaveBeenCalled();
  expect(mock.update).not.toHaveBeenCalled();
});

it('rejects an old Warrior assignment after the player receives a different replacement role', async () => {
  Object.assign(mock.documents.get('sessions/s1/players/warrior-captain')!, {
    assignedRoleId: 'warrior-captain', replacementRoleId: 'commissar',
    seatId: null, activeConsoleRoleId: null,
  });

  await expect(repairWarriorWithDrones.run(request(command))).rejects.toMatchObject({
    code: 'permission-denied',
  });
  expect(mock.set).not.toHaveBeenCalled();
  expect(mock.update).not.toHaveBeenCalled();
});

it('rejects a former holder UID when another player owns the current replacement role', async () => {
  put('sessions/s1/players/former-captain', {
    role: 'player', connected: true, assignedRoleId: 'warrior-captain',
    replacementRoleId: null, seatId: null, activeConsoleRoleId: null,
  });

  await expect(repairWarriorWithDrones.run(request(command, 'former-captain')))
    .rejects.toMatchObject({ code: 'permission-denied' });
  expect(mock.set).not.toHaveBeenCalled();
  expect(mock.update).not.toHaveBeenCalled();
});

it('replays the exact successful command after Coordination closes without another write', async () => {
  await repairWarriorWithDrones.run(request(command));
  const writes = mock.set.mock.calls.length + mock.update.mock.calls.length;
  mock.documents.get('sessions/s1')!.phase = 'debrief';
  await expect(repairWarriorWithDrones.run(request(command))).resolves.toMatchObject({
    status: 'replayed', materialsRemaining: 3, repairRevision: 1,
  });
  expect(mock.set.mock.calls.length + mock.update.mock.calls.length).toBe(writes);
});

it('fails closed when a replay receipt has a different actor-role audit', async () => {
  await repairWarriorWithDrones.run(request(command));
  mock.documents.get('sessions/s1/commandReceipts/warrior-repair-1')!.actorRoleId = 'commissar';
  const writes = mock.set.mock.calls.length + mock.update.mock.calls.length;

  await expect(repairWarriorWithDrones.run(request(command))).rejects.toMatchObject({
    code: 'failed-precondition',
  });
  expect(mock.set.mock.calls.length + mock.update.mock.calls.length).toBe(writes);
});

it('rejects altered receipt reuse and a second repair in the same cycle before mutation', async () => {
  await repairWarriorWithDrones.run(request(command));
  const writes = mock.set.mock.calls.length + mock.update.mock.calls.length;
  await expect(repairWarriorWithDrones.run(request({ ...command, systemIds: ['jump-drive'] })))
    .rejects.toMatchObject({ code: 'failed-precondition' });
  await expect(repairWarriorWithDrones.run(request({
    ...command, requestId: 'warrior-repair-2', expectedRepairRevision: 1, systemIds: ['jump-drive'],
  }))).rejects.toMatchObject({ code: 'failed-precondition' });
  expect(mock.set.mock.calls.length + mock.update.mock.calls.length).toBe(writes);
});

it.each([
  ['stale assignedRoleId without a current replacement assignment', {
    player: { assignedRoleId: 'warrior-captain', replacementRoleId: null },
  }],
  ['fabricated core-roster role without replacement custody', {
    session: { activeRoleIds: [...recommendedRoleIds(8), 'warrior-captain'] },
    player: { replacementRoleId: null },
  }],
  ['replaced identity with another current role', {
    player: { assignedRoleId: 'warrior-captain', replacementRoleId: 'commissar' },
  }],
  ['stale seat pointer', { player: { seatId: 'warrior-captain' } }],
  ['stale core-console pointer', { player: { activeConsoleRoleId: 'warrior-captain' } }],
  ['disconnected Captain', { player: { connected: false } }],
] as const)('denies %s without mutation', async (_label, change) => {
  if ('session' in change) Object.assign(mock.documents.get('sessions/s1')!, change.session);
  if ('player' in change) Object.assign(mock.documents.get('sessions/s1/players/warrior-captain')!, change.player);
  await expect(repairWarriorWithDrones.run(request(command))).rejects.toMatchObject({
    code: 'permission-denied',
  });
  expect(mock.set).not.toHaveBeenCalled();
  expect(mock.update).not.toHaveBeenCalled();
});

it.each([
  ['extra client fields', { ...command, materials: 99 }, 'invalid-argument'],
  ['stale cycle', { ...command, expectedCycle: 2 }, 'failed-precondition'],
  ['stale docking revision', { ...command, expectedDockingRevision: 1 }, 'failed-precondition'],
  ['client-selected other host', { ...command, expectedHostShipId: 'aegis' }, 'failed-precondition'],
])('rejects %s without mutation', async (_label, data, code) => {
  await expect(repairWarriorWithDrones.run(request(data))).rejects.toMatchObject({ code });
  expect(mock.set).not.toHaveBeenCalled();
  expect(mock.update).not.toHaveBeenCalled();
});

it('requires current charged completed Warrior maintenance in live Coordination', async () => {
  const session = mock.documents.get('sessions/s1')!;
  const currentState = session.smallShipStates as Fields;
  const warrior = currentState.warrior as Fields;
  session.phase = 'debrief';
  await expect(repairWarriorWithDrones.run(request(command))).rejects.toMatchObject({
    code: 'failed-precondition',
  });
  session.phase = 'active';
  session.turnPhase = { ...(session.turnPhase as Fields), airspace: { state: 'restricted' } };
  await expect(repairWarriorWithDrones.run(request(command))).rejects.toMatchObject({
    code: 'failed-precondition',
  });
  session.turnPhase = {
    ...(session.turnPhase as Fields), airspace: { state: 'lifted' },
    openAirspaceEndsAt: '2000-09-21T12:15:00.000Z',
  };
  await expect(repairWarriorWithDrones.run(request(command))).rejects.toMatchObject({
    code: 'failed-precondition',
  });
  session.turnPhase = {
    ...(session.turnPhase as Fields), airspace: { state: 'lifted' },
    openAirspaceEndsAt: '2099-09-21T12:15:00.000Z',
  };
  warrior.cycle = { ...maintenanceCycle(), turn: 2 };
  await expect(repairWarriorWithDrones.run(request({ ...command, requestId: 'stale-maintenance' })))
    .rejects.toMatchObject({ code: 'failed-precondition' });
  warrior.cycle = { ...maintenanceCycle(), charges: [] };
  await expect(repairWarriorWithDrones.run(request({ ...command, requestId: 'uncharged' })))
    .rejects.toMatchObject({ code: 'failed-precondition' });
  expect(mock.set).not.toHaveBeenCalled();
  expect(mock.update).not.toHaveBeenCalled();
});

it.each([
  ['forged admission marker', { ...warriorState(), admitted: true }],
  ['historical dock state after undocking', { ...warriorState(), hostShipId: null }],
] as const)('denies %s without mutating host state', async (_label, state) => {
  mock.documents.get('sessions/s1')!.smallShipStates = { warrior: state };
  await expect(repairWarriorWithDrones.run(request(command))).rejects.toMatchObject({
    code: 'failed-precondition',
  });
  expect(mock.set).not.toHaveBeenCalled();
  expect(mock.update).not.toHaveBeenCalled();
});

it('keeps the canonical core roster raw and denies Warrior being smuggled into it', async () => {
  const session = mock.documents.get('sessions/s1')!;
  const coreVessels = activeVesselIdsForRoles(recommendedRoleIds(8));
  expect(session.activeVesselIds).toEqual(coreVessels);
  session.activeVesselIds = [...coreVessels, 'warrior'];

  await expect(repairWarriorWithDrones.run(request(command))).rejects.toMatchObject({
    code: 'failed-precondition',
  });
  expect(mock.set).not.toHaveBeenCalled();
  expect(mock.update).not.toHaveBeenCalled();
});

it('accepts an unused Warrior charge after current-cycle Team maintenance ends', async () => {
  const session = mock.documents.get('sessions/s1')!;
  const initial = emptySmallShipState('warrior', 'icebreaker');
  let state = { ...initial, dockingRevision: 2 };
  let hostResources = { ore: 0, fuel: 4, food: 11, water: 9, materials: 9, securityTeams: 2 };
  let step = 0;
  const progress = (action: string, options: Record<string, unknown> = {}) => {
    const result = advanceSmallShipMaintenance({
      state, action, expectedRevision: state.cycle.revision, currentTurn: 3,
      hostResources, rolls: [], now: `2026-09-24T08:00:0${step++}.000Z`,
      ...options,
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
  expect(state.cycle).toMatchObject({
    step: 0, turn: 3, charges: ['repair-drones'], completedAt: expect.any(String),
  });
  session.smallShipStates = { warrior: state };

  await expect(repairWarriorWithDrones.run(request(command))).resolves.toMatchObject({
    status: 'committed', hostShipId: 'icebreaker', systemIds: ['storage', 'reactor'],
    materialsSpent: 6, cycle: 3, repairRevision: 1,
  });
});

it.each([
  ['historical', 2],
  ['next-cycle', 4],
] as const)('rejects a completed %s Warrior charge outside the current cycle', async (_label, cycle) => {
  const warrior = (mock.documents.get('sessions/s1')!.smallShipStates as Fields).warrior as Fields;
  warrior.cycle = {
    ...maintenanceCycle(), step: 0, turn: cycle, completedAt: '2026-09-24T08:00:05.000Z',
  };

  await expect(repairWarriorWithDrones.run(request(command))).rejects.toMatchObject({
    code: 'failed-precondition',
  });
  expect(mock.set).not.toHaveBeenCalled();
  expect(mock.update).not.toHaveBeenCalled();
});

it.each([
  ['destroyed host', { damagedSystemIds: ['storage'], destroyed: true }],
  ['unknown damage console', { damagedSystemIds: ['invented'], destroyed: false }],
  ['duplicate damage console', { damagedSystemIds: ['storage', 'storage'], destroyed: false }],
  ['extra damage field', { damagedSystemIds: ['storage'], destroyed: false, extra: true }],
] as const)('fails closed on %s and preserves server state', async (_label, damage) => {
  mock.documents.get('sessions/s1')!.shipDamage = { icebreaker: damage };
  await expect(repairWarriorWithDrones.run(request(command))).rejects.toMatchObject({
    code: 'failed-precondition',
  });
  expect(mock.set).not.toHaveBeenCalled();
  expect(mock.update).not.toHaveBeenCalled();
});

it.each([
  ['insufficient host materials', { resources: { ...{ ore: 0, fuel: 4, food: 11, water: 9, materials: 5, securityTeams: 2 } } }],
  ['malformed host inventory', { resources: { ore: 0, fuel: 4, food: 11, water: 9, materials: 9.5, securityTeams: 2 } }],
  ['unknown or undamaged selection', { systemIds: ['armour'] }],
] as const)('rejects %s before changing the host', async (_label, change) => {
  const session = mock.documents.get('sessions/s1')!;
  if ('resources' in change) session.shipResources = { icebreaker: change.resources };
  const data = 'systemIds' in change ? { ...command, systemIds: change.systemIds } : command;
  await expect(repairWarriorWithDrones.run(request(data))).rejects.toMatchObject({
    code: 'failed-precondition',
  });
  expect(mock.set).not.toHaveBeenCalled();
  expect(mock.update).not.toHaveBeenCalled();
});

it('rejects stale repair revisions and orphaned legacy event records before mutation', async () => {
  mock.documents.get('sessions/s1')!.warriorRepairDrones = {
    cycle: 2, revision: 1, hostShipId: 'aegis', systemIds: ['storage'],
  };
  await expect(repairWarriorWithDrones.run(request(command))).rejects.toMatchObject({
    code: 'failed-precondition',
  });
  expect(mock.update).not.toHaveBeenCalled();
  mock.documents.get('sessions/s1')!.warriorRepairDrones = undefined;
  put('sessions/s1/events/warrior-repair-drones-warrior-repair-1', { old: true });
  await expect(repairWarriorWithDrones.run(request(command))).rejects.toMatchObject({
    code: 'failed-precondition',
  });
  expect(mock.update).not.toHaveBeenCalled();
});
