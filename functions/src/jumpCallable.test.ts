import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { CallableRequest } from 'firebase-functions/v2/https';
import * as jumpCallables from './index';
import { jumpFuelCost, jumpLengthBetween } from './jumpDrive';
import { populationChange } from './shipPopulation';
import { emptySmallShipState } from './smallShip';

const mock = vi.hoisted(() => ({
  get: vi.fn(),
  update: vi.fn(),
  set: vi.fn(),
  role: 'gm',
  owner: 'u1',
  connected: true,
  currentTurn: 1,
  phase: 'active',
  gameOutcome: undefined as Record<string, unknown> | undefined,
  chartId: 'A',
  chartLocked: true,
  coordinate: '0000',
  navigationRevision: 0,
  navigationLogs: {} as Record<string, unknown>,
  fuel: 4,
  dioneFuel: 8,
  icebreakerFuel: 20,
  icebreakerOre: 0,
  charges: ['jump-drive'] as string[],
  dioneCharges: ['jump-drive'] as string[],
  icebreakerCharges: ['jump-drive'] as string[],
  grantedShipId: 'aegis',
  activeRoleIds: [] as string[],
  activeVesselIds: ['aegis', 'dione', 'icebreaker', 'shepherd', 'quellon', 'refinery-124'] as string[],
  activeConsoleRoleId: undefined as string | undefined,
  jumpStates: {} as Record<string, unknown>,
  systemHistory: {} as Record<string, unknown>,
  scoutedCoordinatesByShip: {} as Record<string, string[]>,
  missionExploredCoordinatesByUid: {} as Record<string, string[]>,
  pursuitGroups: { 'fleet-1': 2 } as Record<string, number>,
  fleetGroups: [{
    id: 'fleet-1',
    vesselIds: ['aegis', 'dione', 'icebreaker', 'shepherd', 'quellon', 'refinery-124'],
    memberUids: ['u1'],
  }] as Array<{ id: string; vesselIds: string[]; memberUids: string[] }>,
  players: [{ id: 'u1', fields: { role: 'gm', connected: true, fleetGroupId: 'fleet-1' } }] as Array<{
    id: string; fields: Record<string, unknown>;
  }>,
  upgrades: {} as Record<string, unknown>,
  damage: {} as Record<string, unknown>,
  survivors: {} as Record<string, number>,
  unrest: {} as Record<string, number>,
  mutinies: {} as Record<string, unknown>,
  wolfAttackState: undefined as Record<string, unknown> | undefined,
  arrivalPressureState: undefined as Record<string, unknown> | undefined,
  missionCraftCommitments: {} as Record<string, unknown>,
  smallShipStates: {} as Record<string, unknown>,
  missionOpportunityRecord: undefined as Record<string, unknown> | undefined,
  missionOpportunityRecordPath: undefined as string | undefined,
  commandReceiptRecord: undefined as Record<string, unknown> | undefined,
  singlePlayerDemo: undefined as Record<string, unknown> | undefined,
  jumpFailures: {} as Record<string, Record<string, unknown>>,
  pursuitEmergencyWindow: undefined as Record<string, unknown> | undefined,
  transactionRetries: 0,
  randomInt: vi.fn(() => 6),
  randomUUID: vi.fn(() => 'jump-event'),
}));

vi.mock('node:crypto', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:crypto')>();
  return { ...actual, randomInt: mock.randomInt, randomUUID: mock.randomUUID };
});
vi.mock('firebase-admin/app', () => ({ initializeApp: vi.fn() }));
vi.mock('firebase-admin/firestore', () => ({
  getFirestore: () => ({
    doc: (path: string) => path.includes('/playerDiscoveries/')
      ? { path, id: path.split('/').at(-1)! } : path,
    collection: (path: string) => {
      if (!path.endsWith('/jumpFailures')) return path;
      const query = { path, where: () => query, limit: () => query };
      return query;
    },
    runTransaction: async (callback: (tx: unknown) => unknown) => {
      let result: unknown;
      const attempts = mock.transactionRetries + 1;
      for (let attempt = 0; attempt < attempts; attempt += 1) {
        const writes: Array<[string, Record<string, unknown>]> = [];
        const sets: Array<[string, Record<string, unknown>]> = [];
        result = await callback({
          get: mock.get,
          set: (ref: string | { path: string }, fields: Record<string, unknown>) => sets.push([typeof ref === 'string' ? ref : ref.path, fields]),
          update: (path: string, fields: Record<string, unknown>) => writes.push([path, fields]),
        });
        if (attempt === attempts - 1) {
          for (const [path, fields] of writes) mock.update(path, fields);
          for (const [path, fields] of sets) mock.set(path, fields);
        }
      }
      return result;
    },
  }),
  FieldValue: { serverTimestamp: () => 'server-time', delete: () => 'delete-field' },
  Timestamp: { now: () => ({ toMillis: () => Date.now() }) },
}));

import {
  adjudicateFailedJump, advanceTurn, jumpShip, listUnresolvedJumpFailures, moveShipToLocation,
} from './index';

function request(data: Record<string, unknown>, uid = 'u1') {
  return { data: data.requestId === undefined ? { ...data, requestId: 'test-jump' } : data, auth: { uid } } as CallableRequest<Record<string, unknown>>;
}

const data = {
  sessionId: 's1',
  instanceId: 'bridge',
  shipId: 'aegis',
};

beforeEach(() => {
  mock.role = 'gm';
  mock.owner = 'u1';
  mock.connected = true;
  mock.currentTurn = 1;
  mock.phase = 'active';
  mock.gameOutcome = undefined;
  mock.chartId = 'A';
  mock.chartLocked = true;
  mock.coordinate = '0000';
  mock.navigationRevision = 0;
  mock.navigationLogs = {};
  mock.fuel = 4;
  mock.dioneFuel = 8;
  mock.icebreakerFuel = 20;
  mock.icebreakerOre = 0;
  mock.charges = ['jump-drive'];
  mock.dioneCharges = ['jump-drive'];
  mock.icebreakerCharges = ['jump-drive'];
  mock.grantedShipId = 'aegis';
  mock.activeRoleIds = [];
  mock.activeVesselIds = ['aegis', 'dione', 'icebreaker', 'shepherd', 'quellon', 'refinery-124'];
  mock.activeConsoleRoleId = undefined;
  mock.jumpStates = {};
  mock.systemHistory = {};
  mock.scoutedCoordinatesByShip = {};
  mock.missionExploredCoordinatesByUid = {};
  mock.pursuitGroups = { 'fleet-1': 2 };
  mock.fleetGroups = [{
    id: 'fleet-1',
    vesselIds: ['aegis', 'dione', 'icebreaker', 'shepherd', 'quellon', 'refinery-124'],
    memberUids: ['u1'],
  }];
  mock.players = [{ id: 'u1', fields: { role: 'gm', connected: true, fleetGroupId: 'fleet-1' } }];
  mock.upgrades = {};
  mock.damage = {};
  mock.survivors = {};
  mock.unrest = {};
  mock.mutinies = {};
  mock.wolfAttackState = undefined;
  mock.arrivalPressureState = undefined;
  mock.missionCraftCommitments = {};
  mock.smallShipStates = {};
  mock.missionOpportunityRecord = undefined;
  mock.missionOpportunityRecordPath = undefined;
  mock.commandReceiptRecord = undefined;
  mock.singlePlayerDemo = undefined;
  mock.jumpFailures = {};
  mock.pursuitEmergencyWindow = undefined;
  mock.transactionRetries = 0;
  mock.randomInt.mockReset();
  mock.randomInt.mockReturnValue(6);
  mock.randomUUID.mockReset();
  mock.randomUUID.mockReturnValue('jump-event');
  mock.update.mockReset();
  mock.set.mockReset();
  mock.get.mockImplementation(async (rawRef: unknown) => {
    const path = typeof rawRef === 'string'
      ? rawRef
      : typeof rawRef === 'object' && rawRef !== null && 'path' in rawRef
        ? String((rawRef as { path: unknown }).path)
        : '';
    if (path === 'sessions/s1/jumpFailures') return {
      docs: Object.entries(mock.jumpFailures).map(([id, failure]) => ({
        exists: true, id, data: () => failure, get: (key: string) => failure[key],
      })),
    };
    if (path.startsWith('sessions/s1/jumpFailures/')) {
      const failure = mock.jumpFailures[path.split('/').at(-1) ?? ''];
      return {
        exists: failure !== undefined,
        id: path.split('/').at(-1),
        ref: { path },
        data: () => failure,
        get: (key: string) => failure?.[key],
      };
    }
    if (path.includes('/commandReceipts/')) return {
      exists: mock.commandReceiptRecord !== undefined,
      get: (key: string) => mock.commandReceiptRecord?.[key],
    };
    if (path.startsWith('sessionStartRequests/') ||
        /\/(setupMutationRequests|gmResponsibilityRequests|seatMutationRequests|loyaltyAssignmentRequests)\//.test(path) ||
        /\/events\/(setup-confirm-|gm-responsibility-|start-|seat-claim-|seat-release-|press-availability-)/.test(path) ||
        /\/events\/[^/]+$/.test(path)) {
      return { exists: false, id: path.split('/').at(-1), ref: { path }, data: () => undefined, get: () => undefined };
    }
    if (path === 'sessions/s1/wolfAttackState/current') {
      const fields = mock.wolfAttackState;
      return {
        exists: fields !== undefined,
        data: fields === undefined ? undefined : () => fields,
        get: (key: string) => fields?.[key],
      };
    }
    if (path === 'sessions/s1/serverState/wolfArrivalPressure/groups/fleet-1') {
      const fields = mock.arrivalPressureState;
      return {
        exists: fields !== undefined,
        data: fields === undefined ? undefined : () => fields,
        get: (key: string) => fields?.[key],
      };
    }
    if (path.startsWith('sessions/s1/missionOpportunities/')) {
      const record = mock.missionOpportunityRecordPath === undefined ||
        mock.missionOpportunityRecordPath === path
        ? mock.missionOpportunityRecord
        : undefined;
      return {
        exists: record !== undefined,
        data: () => record,
        get: (key: string) => record?.[key],
      };
    }
    if (path === 'sessions/s1/fleetGroups') {
      return { docs: mock.fleetGroups.map((group) => ({
        exists: true, id: group.id, ref: { path: `${path}/${group.id}` },
        data: () => group, get: (key: string) => group[key as keyof typeof group],
      })) };
    }
    if (path === 'sessions/s1/players') {
      return { docs: mock.players.map((entry) => ({
        exists: true, id: entry.id, ref: { path: `${path}/${entry.id}` },
        data: () => entry.fields, get: (key: string) => entry.fields[key],
      })) };
    }
    if (path === 'sessions/s1/gmInstances') {
      return { docs: [{ id: 'bridge' }] };
    }
    const protectedPursuitWindow = mock.pursuitEmergencyWindow;
    const memberPursuitWindow = protectedPursuitWindow &&
      Object.hasOwn(protectedPursuitWindow, 'navigationRevision') &&
      Object.hasOwn(protectedPursuitWindow, 'groupIds')
      ? {
        type: protectedPursuitWindow.type,
        status: protectedPursuitWindow.status,
        cycle: protectedPursuitWindow.cycle,
        openedAt: protectedPursuitWindow.openedAt,
      }
      : protectedPursuitWindow;
    const fields: Record<string, unknown> = path.includes('/players/')
      ? {
        role: mock.role, connected: mock.connected, activeConsoleRoleId: mock.activeConsoleRoleId,
        fleetGroupId: 'fleet-1',
      }
      : path.includes('/private/shipConsoleWriteGrant')
        ? {
          type: 'gm-ship-console-write-grant', sessionId: 's1', instanceId: 'bridge', uid: mock.owner,
          shipId: mock.grantedShipId, grantedAt: new Date(),
        }
      : path.includes('/gmInstances/')
        ? { uid: mock.owner, connected: mock.connected, lastSeenAt: new Date() }
        : {
          phase: mock.phase,
          ...(mock.singlePlayerDemo ? { singlePlayerDemo: mock.singlePlayerDemo } : {}),
          ...(mock.gameOutcome ? { gameOutcome: mock.gameOutcome } : {}),
          ...(memberPursuitWindow ? { pursuitEmergencyWindow: memberPursuitWindow } : {}),
          missionCraftCommitments: mock.missionCraftCommitments,
          smallShipStates: mock.smallShipStates,
          activeRoleIds: mock.activeRoleIds,
          activeVesselIds: mock.activeVesselIds,
          currentTurn: mock.currentTurn,
          turnPhase: {
            turn: mock.currentTurn,
            teamPhaseEndsAt: '2026-09-06T12:05:00.000Z',
            openAirspaceEndsAt: '2026-09-06T12:20:00.000Z',
            airspace: { state: 'lifted', tickerActive: true, pressAccess: false },
          },
          chartId: mock.chartId,
          chartSelectionLocked: mock.chartLocked,
          capybaraEnabled: true,
          dioneEnabled: true,
          shipGalacticCoordinates: {
            aegis: mock.coordinate,
            dione: '0000',
            icebreaker: '0000',
            capybara: '0000',
            shepherd: '0000',
            quellon: '0000',
            'refinery-124': '0000',
          },
          shipNavigationLogs: {
            aegis: [], dione: [], icebreaker: [], capybara: [], shepherd: [], quellon: [], 'refinery-124': [],
            ...mock.navigationLogs,
          },
          shipUnrest: mock.unrest,
          shipMutinies: mock.mutinies,
          shipResources: {
            aegis: { ore: 0, fuel: mock.fuel, food: 8, water: 6, materials: 1, securityTeams: 9 },
            dione: { ore: 0, fuel: mock.dioneFuel, food: 8, water: 6, materials: 1, securityTeams: 9 },
            icebreaker: { ore: mock.icebreakerOre, fuel: mock.icebreakerFuel, food: 11, water: 9, materials: 3, securityTeams: 2 },
          },
          shipSurvivors: mock.survivors,
          shipDamage: mock.damage,
          shipUpgrades: mock.upgrades,
          shipJumpStates: mock.jumpStates,
          systemHistory: mock.systemHistory,
          scoutedCoordinatesByShip: mock.scoutedCoordinatesByShip,
          pursuitGroups: mock.pursuitGroups,
          maintenanceCycles: {
            aegis: { turn: mock.currentTurn, charges: mock.charges, results: {} },
            dione: { turn: mock.currentTurn, charges: mock.dioneCharges, results: {} },
            icebreaker: { turn: mock.currentTurn, charges: mock.icebreakerCharges, results: {} },
          },
    };
    if (path === 'sessions/s1/serverState/navigation') {
      const protectedFields = {
        ...fields,
        ...(protectedPursuitWindow ? { pursuitEmergencyWindow: protectedPursuitWindow } : {}),
        revision: mock.navigationRevision,
        missionExploredCoordinatesByUid: mock.missionExploredCoordinatesByUid,
      };
      return {
        exists: true, id: 'navigation', ref: { path },
        data: () => protectedFields,
        get: (key: string) => protectedFields[key],
      };
    }
    const pathId = path.split('/').at(-1) ?? '';
    return {
      exists: true,
      id: pathId,
      ref: { path },
      data: () => fields,
      get: (key: string) => fields[key],
    };
  });
});

afterEach(() => {
  vi.useRealTimers();
});

it('rejects malformed coordinates before reading or changing any authoritative state', async () => {
  mock.get.mockClear();
  for (const destination of [undefined, null, 5143, '', '513', '51430', '51a3', '51 3', '５１４３']) {
    await expect(jumpShip.run(request({ ...data, destination }))).rejects.toMatchObject({
      code: 'invalid-argument',
    });
  }
  expect(mock.get).not.toHaveBeenCalled();
  expect(mock.update).not.toHaveBeenCalled();
  expect(mock.randomInt).not.toHaveBeenCalled();
  expect(mock.randomUUID).not.toHaveBeenCalled();
});

it('denies Demo jumps before replay or stale handling and leaves all state unchanged', async () => {
  const replayRequest = {
    ...data,
    requestId: 'demo-jump-replay',
    destination: '5143',
  };
  const committed = await jumpShip.run(request(replayRequest));
  expect(committed).toMatchObject({ status: 'jumped', destination: '5143' });
  const receipt = mock.set.mock.calls.find(([path]) =>
    path === 'sessions/s1/commandReceipts/demo-jump-replay')?.[1];
  expect(receipt).toBeDefined();

  mock.singlePlayerDemo = { status: 'active', finalCycle: 1 };
  mock.commandReceiptRecord = receipt as Record<string, unknown>;
  mock.update.mockClear();
  mock.set.mockClear();
  mock.randomInt.mockClear();
  mock.randomUUID.mockClear();

  await expect(jumpShip.run(request(replayRequest))).rejects.toMatchObject({
    code: 'failed-precondition',
    message: expect.stringMatching(/jumps are unavailable in demo mode/i),
  });
  expect(mock.update).not.toHaveBeenCalled();
  expect(mock.set).not.toHaveBeenCalled();
  expect(mock.randomInt).not.toHaveBeenCalled();
  expect(mock.randomUUID).not.toHaveBeenCalled();

  mock.commandReceiptRecord = undefined;
  mock.update.mockClear();
  mock.set.mockClear();
  await expect(jumpShip.run(request({
    ...data,
    requestId: 'demo-jump-stale',
    destination: '5143',
    expectedRevision: 99,
  }))).rejects.toMatchObject({
    code: 'failed-precondition',
    message: expect.stringMatching(/jumps are unavailable in demo mode/i),
  });
  expect(mock.update).not.toHaveBeenCalled();
  expect(mock.set).not.toHaveBeenCalled();
});

it('denies direct map relocation in Demo without changing location or navigation records', async () => {
  mock.singlePlayerDemo = { status: 'active', finalCycle: 1 };

  await expect(moveShipToLocation.run(request({
    ...data,
    requestId: 'demo-map-relocation',
    destination: '5143',
  }))).rejects.toMatchObject({
    code: 'failed-precondition',
    message: expect.stringMatching(/jumps are unavailable in demo mode/i),
  });
  expect(mock.update).not.toHaveBeenCalled();
  expect(mock.set).not.toHaveBeenCalled();
});

it('returns an explicit Cycle 1 Demo completion without advancing the session', async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-09-06T12:10:00.000Z'));
  mock.currentTurn = 1;
  mock.activeVesselIds = ['aegis', 'shepherd'];
  mock.activeRoleIds = ['admiral', 'shepherd-captain'];
  mock.pursuitGroups = { 'fleet-1': 2, 'fleet-2': 1 };
  mock.fleetGroups = [
    { id: 'fleet-1', vesselIds: ['aegis'], memberUids: ['u1'] },
    { id: 'fleet-2', vesselIds: ['shepherd'], memberUids: ['u2'] },
  ];
  mock.players = [
    { id: 'u1', fields: { role: 'gm', connected: true, fleetGroupId: 'fleet-1' } },
    { id: 'u2', fields: { role: 'player', connected: true, fleetGroupId: 'fleet-2' } },
  ];
  mock.singlePlayerDemo = { status: 'active', finalCycle: 1 };
  const requestData = {
    sessionId: 's1',
    instanceId: 'bridge',
    requestId: 'demo-cycle-one-complete',
    expectedTurn: 1,
    overridePhaseTimer: true,
  };

  const result = await advanceTurn.run(request(requestData));

  expect(result).toMatchObject({
    status: 'complete',
    mode: 'demo',
    currentTurn: 1,
    finalCycle: 1,
    title: 'Demo complete',
  });
  const sessionUpdate = mock.update.mock.calls.find(([path]) => path === 'sessions/s1')?.[1];
  expect(sessionUpdate).toMatchObject({
    singlePlayerDemo: expect.objectContaining({ status: 'complete', finalCycle: 1 }),
  });
  expect(sessionUpdate).not.toHaveProperty('currentTurn');
  expect(mock.set.mock.calls.some(([path]) => String(path).includes('/events/turn-advanced-'))).toBe(false);

  mock.singlePlayerDemo = { status: 'complete', finalCycle: 1 };
  mock.commandReceiptRecord = mock.set.mock.calls.find(([path]) =>
    path === 'sessions/s1/commandReceipts/demo-cycle-one-complete')?.[1];
  mock.update.mockClear();
  mock.set.mockClear();
  await expect(advanceTurn.run(request(requestData))).resolves.toEqual(result);
  expect(mock.update).not.toHaveBeenCalled();
  expect(mock.set).not.toHaveBeenCalled();

  mock.commandReceiptRecord = undefined;
  await expect(advanceTurn.run(request({
    ...requestData,
    requestId: 'demo-cycle-one-complete-retry',
  }))).resolves.toMatchObject({ status: 'complete', currentTurn: 1 });
  expect(mock.update).not.toHaveBeenCalled();
  expect(mock.set).toHaveBeenCalledWith(
    'sessions/s1/commandReceipts/demo-cycle-one-complete-retry',
    expect.objectContaining({ result: expect.objectContaining({ status: 'complete', mode: 'demo' }) }),
  );
  expect(mock.set.mock.calls.some(([path]) => String(path).includes('/events/turn-advanced-'))).toBe(false);
});

it.each([
  ['declared', { status: 'declared', airspaceLocked: true, parkingReleaseCondition: 'normal-movement-reopened' }],
  ['legacy', { status: 'declared', airspaceLocked: true }],
  ['malformed', { status: 7, airspaceLocked: 'unknown' }],
])('blocks jump and movement from a lifted phase with %s Wolf attack state', async (_label, attackState) => {
  mock.wolfAttackState = attackState;

  await expect(jumpShip.run(request({
    ...data, requestId: `blocked-jump-${_label}`, destination: '5143',
  }))).rejects.toMatchObject({
    code: 'failed-precondition',
    message: expect.stringMatching(/awaits facilitator resolution.*movement remains blocked/i),
  });
  await expect(moveShipToLocation.run(request({
    ...data, requestId: `blocked-move-${_label}`, destination: '5143',
  }))).rejects.toMatchObject({
    code: 'failed-precondition',
    message: expect.stringMatching(/awaits facilitator resolution.*movement remains blocked/i),
  });
  expect(mock.update).not.toHaveBeenCalled();
  expect(mock.set).not.toHaveBeenCalled();
});

it('denies destroyed ships before movement or jump can change navigation state', async () => {
  mock.damage = { aegis: { damagedSystemIds: ['reactor'], destroyed: true } };

  await expect(jumpShip.run(request({
    ...data, requestId: 'destroyed-jump', destination: '5143',
  }))).rejects.toMatchObject({
    code: 'failed-precondition',
    message: expect.stringMatching(/destroyed ships cannot move or jump/i),
  });
  expect(mock.update).not.toHaveBeenCalled();
  expect(mock.randomInt).not.toHaveBeenCalled();

  await expect(moveShipToLocation.run(request({
    ...data, requestId: 'destroyed-move', destination: '5143',
  }))).rejects.toMatchObject({
    code: 'failed-precondition',
    message: expect.stringMatching(/destroyed ships cannot move or jump/i),
  });
  expect(mock.update).not.toHaveBeenCalled();
});

it('adjusts protected pursuit from the server chart depth through facilitator movement and ship jumps', async () => {
  await expect(moveShipToLocation.run(request({
    ...data, requestId: 'pursuit-move', destination: '5143',
  }))).resolves.toMatchObject({ destination: '5143' });
  expect(mock.set).toHaveBeenCalledWith(
    'sessions/s1/serverState/navigation',
    expect.objectContaining({ pursuitGroups: { 'fleet-1': 1 } }),
  );
  expect(mock.update).toHaveBeenCalledWith('sessions/s1', expect.objectContaining({
    pursuitGroups: 'delete-field',
  }));

  mock.coordinate = '0000';
  mock.set.mockClear();
  mock.update.mockClear();
  await expect(jumpShip.run(request({
    ...data, requestId: 'pursuit-jump', destination: '5143',
  }))).resolves.toMatchObject({ status: 'jumped', destination: '5143' });
  expect(mock.set).toHaveBeenCalledWith(
    'sessions/s1/serverState/navigation',
    expect.objectContaining({ pursuitGroups: { 'fleet-1': 1 } }),
  );
  expect(mock.update).toHaveBeenCalledWith('sessions/s1', expect.objectContaining({
    pursuitGroups: 'delete-field',
  }));
});

it.each(['move', 'jump'] as const)('keeps immutable mission reward knowledge after %s and does not grant it to another UID', async transition => {
  mock.missionExploredCoordinatesByUid = { u1: ['6798'], parkedParticipant: ['1413'] };
  mock.fleetGroups[0]!.memberUids = ['u1', 'u2'];
  mock.players = [
    { id: 'u1', fields: { role: 'player', connected: true, fleetGroupId: 'fleet-1', assignedRoleId: 'admiral' } },
    { id: 'u2', fields: { role: 'player', connected: true, fleetGroupId: 'fleet-1', assignedRoleId: 'dione-captain' } },
  ];
  const reply = transition === 'move'
    ? moveShipToLocation.run(request({ ...data, destination: '5143' }))
    : jumpShip.run(request({ ...data, destination: '5143' }));
  await expect(reply).resolves.toMatchObject({ destination: '5143' });
  expect(mock.set.mock.calls.find(([path]) => path === 'sessions/s1/serverState/navigation')?.[1])
    .toMatchObject({ missionExploredCoordinatesByUid: mock.missionExploredCoordinatesByUid });
  const owner = mock.set.mock.calls.find(([path]) => path === 'sessions/s1/playerDiscoveries/u1')?.[1];
  const other = mock.set.mock.calls.find(([path]) => path === 'sessions/s1/playerDiscoveries/u2')?.[1];
  expect(owner?.knownCoordinates).toContain('6798');
  expect(other?.knownCoordinates).not.toContain('6798');
  expect(JSON.stringify(other)).not.toContain('parkedParticipant');
});

it.each(['move', 'jump'] as const)(
  'preserves the receiving ship scout reveal after %s without serializing it to another ship',
  async (transition) => {
    // This is the persisted navigation state immediately after the server has
    // resolved a scout request for Aegis.
    mock.scoutedCoordinatesByShip = { aegis: ['6798'] };
    mock.fleetGroups = [{
      id: 'fleet-1',
      vesselIds: ['aegis', 'dione', 'icebreaker', 'shepherd', 'quellon', 'refinery-124'],
      memberUids: ['u1', 'u2'],
    }];
    mock.players = [
      { id: 'u1', fields: { role: 'player', connected: true, fleetGroupId: 'fleet-1', assignedRoleId: 'admiral' } },
      { id: 'u2', fields: { role: 'player', connected: true, fleetGroupId: 'fleet-1', assignedRoleId: 'dione-captain' } },
    ];

    const transitionCall = transition === 'move'
      ? moveShipToLocation.run(request({ ...data, requestId: 'scout-then-move', destination: '5143' }))
      : jumpShip.run(request({ ...data, requestId: 'scout-then-jump', destination: '5143' }));
    await expect(transitionCall).resolves.toMatchObject({ destination: '5143' });

    const navigationWrite = mock.set.mock.calls.find(([path]) =>
      path === 'sessions/s1/serverState/navigation')?.[1];
    expect(navigationWrite?.scoutedCoordinatesByShip).toEqual({ aegis: ['6798'] });

    const aegisProjection = mock.set.mock.calls.find(([path]) =>
      path === 'sessions/s1/playerDiscoveries/u1')?.[1];
    expect(aegisProjection).toMatchObject({
      shipId: 'aegis',
      knownCoordinates: expect.arrayContaining(['6798']),
    });

    const dioneProjection = mock.set.mock.calls.find(([path]) =>
      path === 'sessions/s1/playerDiscoveries/u2')?.[1];
    expect(dioneProjection).toMatchObject({ shipId: 'dione' });
    expect(dioneProjection?.knownCoordinates).not.toContain('6798');
    expect(JSON.stringify(dioneProjection)).not.toContain('6798');
  },
);

it('persists a candidate arrival while keeping it out of another ship projection', async () => {
  mock.fleetGroups = [{
    id: 'fleet-1', vesselIds: ['aegis', 'dione', 'icebreaker', 'shepherd', 'refinery-124'],
    memberUids: ['u1', 'u2'],
  }, {
    id: 'fleet-2', vesselIds: ['quellon'], memberUids: ['u3'],
  }];
  mock.pursuitGroups = { 'fleet-1': 2, 'fleet-2': 4 };
  mock.players = [
    { id: 'u1', fields: { role: 'gm', connected: true, fleetGroupId: 'fleet-1', assignedRoleId: 'admiral' } },
    { id: 'u2', fields: { role: 'player', connected: true, fleetGroupId: 'fleet-1', assignedRoleId: 'dione-captain' } },
    { id: 'u3', fields: { role: 'player', connected: true, fleetGroupId: 'fleet-2', assignedRoleId: 'quellon-captain' } },
  ];
  mock.transactionRetries = 1;
  await expect(moveShipToLocation.run(request({
    ...data, requestId: 'candidate-arrival', destination: '6798',
  }))).resolves.toMatchObject({ destination: '6798' });

  expect(mock.set).toHaveBeenCalledWith(
    'sessions/s1/serverState/navigation',
    expect.objectContaining({
      systemHistory: expect.objectContaining({
        aegis: expect.objectContaining({
          '6798': expect.objectContaining({
            candidateDiscovery: expect.objectContaining({
              code: 'N', title: 'Ancient Jump Ring', source: 'arrival',
            }),
          }),
        }),
      }),
    }),
  );
  expect(mock.set).toHaveBeenCalledWith(
    'sessions/s1/playerDiscoveries/u2',
    expect.objectContaining({
      groupId: 'fleet-1',
      candidateReveals: [{ code: 'N', title: 'Ancient Jump Ring' }],
    }),
  );
  expect(mock.set).toHaveBeenCalledWith(
    'sessions/s1/playerDiscoveries/u1',
    expect.not.objectContaining({ candidateReveals: expect.anything() }),
  );
  expect(mock.set).toHaveBeenCalledWith(
    'sessions/s1/playerDiscoveries/u3',
    expect.objectContaining({ groupId: 'fleet-2', candidateReveals: [] }),
  );
  const candidateProjection = mock.set.mock.calls.find(([path]) =>
    path === 'sessions/s1/playerDiscoveries/u2')?.[1];
  expect(candidateProjection?.candidateReveals).toEqual([
    { code: 'N', title: 'Ancient Jump Ring' },
  ]);
  expect(Object.keys(candidateProjection?.candidateReveals?.[0] ?? {}).sort()).toEqual(['code', 'title']);
  expect(JSON.stringify(candidateProjection?.candidateReveals)).not.toMatch(/organiser|summary|bonus|6798/);

  const receipt = mock.set.mock.calls.find(([path]) => path.includes('/commandReceipts/'))?.[1];
  expect(receipt).toBeDefined();
  mock.commandReceiptRecord = { fingerprint: receipt?.fingerprint, result: receipt?.result };
  mock.set.mockClear();
  mock.update.mockClear();
  await moveShipToLocation.run(request({ ...data, requestId: 'candidate-arrival', destination: '6798' }));
  expect(mock.set).not.toHaveBeenCalled();
  expect(mock.update).not.toHaveBeenCalled();
});

it.each([
  ['unlocked chart', 'unlocked-chart', 'A', false],
  ['missing chart', 'missing-chart', undefined, true],
  ['invalid chart', 'invalid-chart', 'D', true],
])('rejects candidate arrival with %s before any write', async (_label, requestId, chartId, chartLocked) => {
  mock.chartId = chartId as string;
  mock.chartLocked = chartLocked;
  await expect(moveShipToLocation.run(request({
    ...data, requestId: `candidate-${requestId}`, destination: '6798',
  }))).rejects.toMatchObject({
    code: 'failed-precondition',
    message: expect.stringMatching(/locked organiser chart is unavailable/i),
  });
  await expect(jumpShip.run(request({
    ...data, requestId: `candidate-jump-${requestId}`, destination: '6798',
  }))).rejects.toMatchObject({
    code: 'failed-precondition',
    message: expect.stringMatching(/locked organiser chart is unavailable/i),
  });
  expect(mock.update).not.toHaveBeenCalled();
  expect(mock.set).not.toHaveBeenCalled();
});

it('creates one group-scoped mission opportunity on first arrival and exposes its stable identity', async () => {
  await expect(moveShipToLocation.run(request({
    ...data, requestId: 'mission-first-arrival', destination: '1413',
  }))).resolves.toMatchObject({
    destination: '1413',
    missionOpportunityId: 'arrival-fleet-1-A-1413',
  });

  expect(mock.set).toHaveBeenCalledWith(
    'sessions/s1/missionOpportunities/arrival-fleet-1-A-1413',
    expect.objectContaining({
      type: 'mission-opportunity', status: 'available', sessionId: 's1',
      id: 'arrival-fleet-1-A-1413', groupId: 'fleet-1', chart: 'A',
      coordinate: '1413', siteCode: 'A', sourceShipId: 'aegis',
      sourceTransitionId: 'navigation-mission-first-arrival', sourceCycle: 1,
    }),
  );
});

it('commits one mission, attack, and discovery when Firestore retries an arrival transaction', async () => {
  mock.transactionRetries = 1;

  const command = { ...data, requestId: 'retry-arrival-effects', destination: '5143' };
  const result = await moveShipToLocation.run(request(command));
  expect(result).toMatchObject({
    destination: '5143',
    missionOpportunityId: 'arrival-fleet-1-A-5143',
  });

  expect(mock.set.mock.calls.filter(([path]) =>
    path === 'sessions/s1/missionOpportunities/arrival-fleet-1-A-5143')).toHaveLength(1);
  expect(mock.set.mock.calls.filter(([path]) =>
    path === 'sessions/s1/wolfAttackPressure/arrival-navigation-retry-arrival-effects'))
    .toHaveLength(1);
  expect(mock.set.mock.calls.filter(([path]) =>
    path === 'sessions/s1/serverState/wolfArrivalPressure/groups/fleet-1')).toHaveLength(1);
  expect(mock.set.mock.calls.filter(([path]) =>
    path === 'sessions/s1/serverState/navigation')).toHaveLength(1);

  expect(mock.set).toHaveBeenCalledWith(
    'sessions/s1/serverState/navigation',
    expect.objectContaining({
      shipNavigationLogs: expect.objectContaining({
        aegis: [expect.objectContaining({
          id: 'navigation-retry-arrival-effects-0',
          destination: '5143',
        })],
      }),
      systemHistory: {
        aegis: {
          '5143': expect.objectContaining({
            discovery: {
              id: 'navigation-retry-arrival-effects-0',
              occurredAt: expect.any(String),
            },
            attempts: [],
            hazards: [],
            rewards: [],
            clearedThreats: [],
            candidateProgress: [],
          }),
        },
      },
    }),
  );

  mock.commandReceiptRecord = {
    fingerprint: {
      action: 'move-ship', sessionId: 's1', requestId: 'retry-arrival-effects', actorUid: 'u1',
      instanceId: 'bridge', expectedRevision: null,
      payload: { shipId: 'aegis', destination: '5143' },
    },
    result,
  };
  mock.set.mockClear();
  mock.update.mockClear();
  await expect(moveShipToLocation.run(request(command))).resolves.toEqual(result);
  expect(mock.set).not.toHaveBeenCalled();
  expect(mock.update).not.toHaveBeenCalled();
});

it('creates the same first-arrival opportunity through an authoritative ship jump', async () => {
  await expect(jumpShip.run(request({
    ...data, requestId: 'mission-jump-arrival', destination: '1413',
  }))).resolves.toMatchObject({
    status: 'jumped',
    destination: '1413',
    missionOpportunityId: 'arrival-fleet-1-A-1413',
  });

  expect(mock.set).toHaveBeenCalledWith(
    'sessions/s1/missionOpportunities/arrival-fleet-1-A-1413',
    expect.objectContaining({
      type: 'mission-opportunity', status: 'available', sessionId: 's1',
      id: 'arrival-fleet-1-A-1413', groupId: 'fleet-1', chart: 'A',
      coordinate: '1413', siteCode: 'A', sourceShipId: 'aegis',
      sourceTransitionId: 'jump-mission-jump-arrival', sourceCycle: 1,
    }),
  );
});

it('does not create another opportunity for a system already reached by the group', async () => {
  mock.systemHistory = {
    dione: {
      '1413': {
        coordinate: '1413',
        discovery: { id: 'navigation-prior-0', occurredAt: '2026-09-21T00:00:00.000Z' },
        attempts: [], hazards: [], rewards: [], clearedThreats: [], candidateProgress: [],
      },
    },
  };

  await expect(moveShipToLocation.run(request({
    ...data, requestId: 'mission-repeat-arrival', destination: '1413',
  }))).resolves.not.toHaveProperty('missionOpportunityId');
  expect(mock.set.mock.calls.some(([path]) =>
    String(path).startsWith('sessions/s1/missionOpportunities/'))).toBe(false);
});

it('creates an Unstable Star opportunity again in a later cycle without duplicating that cycle', async () => {
  mock.currentTurn = 2;
  mock.systemHistory = {
    dione: {
      '8378': {
        coordinate: '8378',
        discovery: { id: 'navigation-prior-star', occurredAt: '2026-09-21T00:00:00.000Z' },
        attempts: [], hazards: [], rewards: [], clearedThreats: [], candidateProgress: [],
      },
    },
  };

  await expect(moveShipToLocation.run(request({
    ...data, requestId: 'unstable-star-cycle-2', destination: '8378',
  }))).resolves.toMatchObject({
    missionOpportunityId: 'arrival-fleet-1-A-8378-cycle-2',
  });
  expect(mock.set).toHaveBeenCalledWith(
    'sessions/s1/missionOpportunities/arrival-fleet-1-A-8378-cycle-2',
    expect.objectContaining({ siteCode: 'J', sourceCycle: 2 }),
  );

  mock.set.mockClear();
  mock.update.mockClear();
  mock.missionOpportunityRecord = {
    type: 'mission-opportunity', status: 'available', sessionId: 's1',
    id: 'arrival-fleet-1-A-8378-cycle-2', groupId: 'fleet-1', chart: 'A',
    coordinate: '8378', siteCode: 'J', sourceShipId: 'dione',
    sourceTransitionId: 'navigation-first-star-arrival', sourceCycle: 2,
  };
  mock.missionOpportunityRecordPath =
    'sessions/s1/missionOpportunities/arrival-fleet-1-A-8378-cycle-2';
  await expect(moveShipToLocation.run(request({
    ...data, requestId: 'unstable-star-cycle-2-retry', destination: '8378',
  }))).resolves.not.toHaveProperty('missionOpportunityId');
  expect(mock.set.mock.calls.some(([path]) =>
    String(path).startsWith('sessions/s1/missionOpportunities/'))).toBe(false);
});

it('does not duplicate a legacy Unstable Star opportunity during its deployment cycle', async () => {
  mock.currentTurn = 2;
  mock.systemHistory = {
    dione: {
      '8378': {
        coordinate: '8378',
        discovery: { id: 'navigation-prior-star', occurredAt: '2026-09-21T00:00:00.000Z' },
        attempts: [], hazards: [], rewards: [], clearedThreats: [], candidateProgress: [],
      },
    },
  };
  mock.missionOpportunityRecord = {
    type: 'mission-opportunity', status: 'available', sessionId: 's1',
    id: 'arrival-fleet-1-A-8378', groupId: 'fleet-1', chart: 'A',
    coordinate: '8378', siteCode: 'J', sourceShipId: 'dione',
    sourceTransitionId: 'navigation-pre-upgrade-arrival', sourceCycle: 2,
  };
  mock.missionOpportunityRecordPath =
    'sessions/s1/missionOpportunities/arrival-fleet-1-A-8378';

  await expect(moveShipToLocation.run(request({
    ...data, requestId: 'unstable-star-upgrade-cycle-retry', destination: '8378',
  }))).resolves.not.toHaveProperty('missionOpportunityId');
  expect(mock.set.mock.calls.some(([path]) =>
    String(path).startsWith('sessions/s1/missionOpportunities/'))).toBe(false);
});

it('allows a new-cycle Unstable Star opportunity after a valid older legacy record', async () => {
  mock.currentTurn = 3;
  mock.systemHistory = {
    dione: {
      '8378': {
        coordinate: '8378',
        discovery: { id: 'navigation-prior-star', occurredAt: '2026-09-21T00:00:00.000Z' },
        attempts: [], hazards: [], rewards: [], clearedThreats: [], candidateProgress: [],
      },
    },
  };
  mock.missionOpportunityRecord = {
    type: 'mission-opportunity', status: 'available', sessionId: 's1',
    id: 'arrival-fleet-1-A-8378', groupId: 'fleet-1', chart: 'A',
    coordinate: '8378', siteCode: 'J', sourceShipId: 'dione',
    sourceTransitionId: 'navigation-pre-upgrade-arrival', sourceCycle: 2,
  };
  mock.missionOpportunityRecordPath =
    'sessions/s1/missionOpportunities/arrival-fleet-1-A-8378';

  await expect(moveShipToLocation.run(request({
    ...data, requestId: 'unstable-star-after-upgrade', destination: '8378',
  }))).resolves.toMatchObject({
    missionOpportunityId: 'arrival-fleet-1-A-8378-cycle-3',
  });
  expect(mock.set).toHaveBeenCalledWith(
    'sessions/s1/missionOpportunities/arrival-fleet-1-A-8378-cycle-3',
    expect.objectContaining({ siteCode: 'J', sourceCycle: 3 }),
  );
});

it('fails closed before movement writes when a legacy Unstable Star opportunity is malformed', async () => {
  mock.currentTurn = 2;
  mock.missionOpportunityRecord = {
    type: 'mission-opportunity', status: 'available', sessionId: 's1',
    id: 'arrival-fleet-1-A-8378', groupId: 'fleet-1', chart: 'A',
    coordinate: '8378', siteCode: 'J', sourceShipId: 'dione',
    sourceTransitionId: 'forged-transition', sourceCycle: 2,
  };
  mock.missionOpportunityRecordPath =
    'sessions/s1/missionOpportunities/arrival-fleet-1-A-8378';

  await expect(moveShipToLocation.run(request({
    ...data, requestId: 'unstable-star-malformed-legacy', destination: '8378',
  }))).rejects.toMatchObject({
    code: 'failed-precondition', details: { commandError: 'malformed-input' },
  });
  expect(mock.set).not.toHaveBeenCalled();
  expect(mock.update).not.toHaveBeenCalled();
});

it('creates one cycle-scoped Wolf Supply Outpost opportunity without exposing secret difficulty', async () => {
  mock.currentTurn = 2;
  mock.systemHistory = {
    dione: {
      '6943': {
        coordinate: '6943',
        discovery: { id: 'navigation-prior-outpost', occurredAt: '2026-09-21T00:00:00.000Z' },
        attempts: [], hazards: [], rewards: [], clearedThreats: [], candidateProgress: [],
      },
    },
  };

  const reply = await moveShipToLocation.run(request({
    ...data, requestId: 'wolf-outpost-cycle-2', destination: '6943',
  }));
  expect(reply).toMatchObject({
    missionOpportunityId: 'arrival-fleet-1-A-6943-cycle-2',
  });
  expect(JSON.stringify(reply)).not.toMatch(/difficulty|secret|multiplier/i);
  expect(mock.set).toHaveBeenCalledWith(
    'sessions/s1/missionOpportunities/arrival-fleet-1-A-6943-cycle-2',
    expect.objectContaining({
      siteCode: 'K', sourceCycle: 2,
      id: 'arrival-fleet-1-A-6943-cycle-2',
    }),
  );
});

it('does not duplicate a legacy Wolf Supply Outpost opportunity during its deployment cycle', async () => {
  mock.currentTurn = 2;
  mock.systemHistory = {
    dione: {
      '6943': {
        coordinate: '6943',
        discovery: { id: 'navigation-prior-outpost', occurredAt: '2026-09-21T00:00:00.000Z' },
        attempts: [], hazards: [], rewards: [], clearedThreats: [], candidateProgress: [],
      },
    },
  };
  mock.missionOpportunityRecord = {
    type: 'mission-opportunity', status: 'available', sessionId: 's1',
    id: 'arrival-fleet-1-A-6943', groupId: 'fleet-1', chart: 'A',
    coordinate: '6943', siteCode: 'K', sourceShipId: 'dione',
    sourceTransitionId: 'navigation-pre-upgrade-outpost', sourceCycle: 2,
  };
  mock.missionOpportunityRecordPath =
    'sessions/s1/missionOpportunities/arrival-fleet-1-A-6943';

  await expect(moveShipToLocation.run(request({
    ...data, requestId: 'wolf-outpost-upgrade-cycle-retry', destination: '6943',
  }))).resolves.not.toHaveProperty('missionOpportunityId');
  expect(mock.set.mock.calls.some(([path]) =>
    String(path).startsWith('sessions/s1/missionOpportunities/'))).toBe(false);
});

it('does not reopen a previously created opportunity when legacy history is incomplete', async () => {
  mock.missionOpportunityRecord = {
    type: 'mission-opportunity', status: 'available', sessionId: 's1',
    id: 'arrival-fleet-1-A-1413', groupId: 'fleet-1', chart: 'A',
    coordinate: '1413', siteCode: 'A', sourceShipId: 'dione',
    sourceTransitionId: 'navigation-original-arrival', sourceCycle: 0,
    createdAt: 'server-time',
  };

  await expect(moveShipToLocation.run(request({
    ...data, requestId: 'mission-existing-opportunity', destination: '1413',
  }))).resolves.not.toHaveProperty('missionOpportunityId');
  expect(mock.set.mock.calls.some(([path]) =>
    String(path).startsWith('sessions/s1/missionOpportunities/'))).toBe(false);
});

it('fails closed without navigation writes when a stored opportunity is malformed', async () => {
  mock.missionOpportunityRecord = {
    type: 'mission-opportunity', status: 'available', sessionId: 's1',
    id: 'arrival-fleet-1-A-1413', groupId: 'fleet-2', chart: 'A',
    coordinate: '1413', siteCode: 'A', sourceShipId: 'dione',
    sourceTransitionId: 'navigation-corrupt-arrival', sourceCycle: 0,
  };

  await expect(moveShipToLocation.run(request({
    ...data, requestId: 'mission-malformed-opportunity', destination: '1413',
  }))).rejects.toMatchObject({
    code: 'failed-precondition', details: { commandError: 'malformed-input' },
  });
  expect(mock.set).not.toHaveBeenCalled();
  expect(mock.update).not.toHaveBeenCalled();
});

it('fails closed without writes for forged non-empty opportunity source metadata', async () => {
  const baseOpportunity = {
    type: 'mission-opportunity', status: 'available', sessionId: 's1',
    id: 'arrival-fleet-1-A-1413', groupId: 'fleet-1', chart: 'A',
    coordinate: '1413', siteCode: 'A', sourceShipId: 'dione',
    sourceTransitionId: 'jump-original-arrival', sourceCycle: 0,
  };
  for (const [requestId, sourcePatch] of [
    ['mission-forged-source-ship', { sourceShipId: 'forged-ship' }],
    ['mission-forged-transition', { sourceTransitionId: 'anything' }],
  ] as const) {
    mock.missionOpportunityRecord = { ...baseOpportunity, ...sourcePatch };
    await expect(moveShipToLocation.run(request({
      ...data, requestId, destination: '1413',
    }))).rejects.toMatchObject({
      code: 'failed-precondition', details: { commandError: 'malformed-input' },
    });
  }
  expect(mock.set).not.toHaveBeenCalled();
  expect(mock.update).not.toHaveBeenCalled();
});

it('does not create away-mission opportunities at New Eden candidates', async () => {
  await expect(moveShipToLocation.run(request({
    ...data, requestId: 'candidate-arrival', destination: '6798',
  }))).resolves.not.toHaveProperty('missionOpportunityId');
  expect(mock.set.mock.calls.some(([path]) =>
    String(path).startsWith('sessions/s1/missionOpportunities/'))).toBe(false);
});

it('atomically schedules group-local L arrival pressure with the printed attack minimums', async () => {
  await expect(jumpShip.run(request({
    ...data, requestId: 'wolf-base-entry', destination: '5143',
  }))).resolves.toMatchObject({ status: 'jumped', destination: '5143' });

  expect(mock.set).toHaveBeenCalledWith(
    'sessions/s1/serverState/wolfArrivalPressure/groups/fleet-1',
    expect.objectContaining({
      type: 'wolf-base-arrival-pressure-state', groupId: 'fleet-1', chart: 'A', revision: 1,
      entries: [expect.objectContaining({
        status: 'operational', chart: 'A', coordinate: '5143', siteCode: 'L',
        sourceShipId: 'aegis', sourceTransitionId: 'jump-wolf-base-entry',
        minimumBattleStations: 1, minimumOtherShipDamage: 20,
        missionAccess: 'blockedWhileWolfBaseOperational',
      })],
    }),
  );
  expect(mock.set).toHaveBeenCalledWith(
    'sessions/s1/wolfAttackPressure/arrival-jump-wolf-base-entry',
    expect.objectContaining({
      type: 'wolf-base-arrival-pressure-schedule', status: 'scheduled',
      groupId: 'fleet-1', chart: 'A', coordinate: '5143', siteCode: 'L',
      arrivalTiming: 'immediate', minimumBattleStations: 1,
      minimumOtherShipDamage: 20,
    }),
  );
});

it('fails closed before navigation writes when stored L/M pressure is malformed', async () => {
  mock.arrivalPressureState = {
    type: 'wolf-base-arrival-pressure-state', groupId: 'fleet-1', revision: 1,
    entries: [{ coordinate: '5143', status: 'operational' }],
  };
  await expect(jumpShip.run(request({
    ...data, requestId: 'malformed-arrival-pressure', destination: '5143',
  }))).rejects.toMatchObject({
    code: 'failed-precondition', details: { commandError: 'malformed-input' },
  });
  expect(mock.set).not.toHaveBeenCalled();
  expect(mock.update).not.toHaveBeenCalled();
});

it('changes only the moving ship fleet group and uses the full printed destination depth', async () => {
  mock.pursuitGroups = { 'fleet-1': 8, 'fleet-2': 9 };
  mock.fleetGroups = [
    { id: 'fleet-1', vesselIds: ['aegis'], memberUids: ['u1'] },
    {
      id: 'fleet-2',
      vesselIds: ['dione', 'icebreaker', 'shepherd', 'quellon', 'refinery-124'],
      memberUids: ['u2'],
    },
  ];
  mock.players = [
    { id: 'u1', fields: { role: 'gm', connected: true, fleetGroupId: 'fleet-1' } },
    { id: 'u2', fields: { role: 'player', connected: true, fleetGroupId: 'fleet-2' } },
  ];

  await expect(moveShipToLocation.run(request({
    ...data, requestId: 'deep-pursuit-move', destination: '8378',
  }))).resolves.toMatchObject({ destination: '8378' });
  expect(mock.set).toHaveBeenCalledWith(
    'sessions/s1/serverState/navigation',
    expect.objectContaining({ pursuitGroups: { 'fleet-1': 2, 'fleet-2': 9 } }),
  );
});

it('uses the locked chart to preserve pursuit at the Level 5 Planet destination', async () => {
  mock.chartId = 'B';
  mock.pursuitGroups = { 'fleet-1': 8 };

  await expect(moveShipToLocation.run(request({
    ...data, requestId: 'level-five-planet', destination: '2580',
  }))).resolves.toMatchObject({ destination: '2580' });
  expect(mock.set).toHaveBeenCalledWith(
    'sessions/s1/serverState/navigation',
    expect.objectContaining({ pursuitGroups: { 'fleet-1': 8 } }),
  );
});

it('fails closed without writes when successful movement has malformed fleet-group authority', async () => {
  mock.fleetGroups = [{
    id: 'fleet-1',
    vesselIds: ['dione', 'icebreaker', 'shepherd', 'quellon', 'refinery-124'],
    memberUids: ['u1'],
  }];

  await expect(moveShipToLocation.run(request({
    ...data, requestId: 'malformed-pursuit-move', destination: '5143',
  }))).rejects.toMatchObject({
    code: 'failed-precondition',
    details: { commandError: 'malformed-input' },
  });
  expect(mock.set).not.toHaveBeenCalled();
  expect(mock.update).not.toHaveBeenCalled();
});

it('fails closed without writes when the raw pursuit map contains invalid authority', async () => {
  mock.pursuitGroups = { 'fleet-1': 2, intruder: 3 };

  await expect(jumpShip.run(request({
    ...data, requestId: 'malformed-pursuit-map', destination: '5143',
  }))).rejects.toMatchObject({
    code: 'failed-precondition',
    details: { commandError: 'malformed-input' },
  });
  expect(mock.set).not.toHaveBeenCalled();
  expect(mock.update).not.toHaveBeenCalled();
});

it('rejects an unprinted locked coordinate with a server-owned one-hour integrity lockout', async () => {
  await expect(jumpShip.run(request({ ...data, destination: '0101' }))).resolves.toMatchObject({
    status: 'integrity-lockout',
    shipId: 'aegis',
    origin: '0000',
    destination: '0101',
    state: { integrityLockedUntil: expect.any(String) },
  });

  expect(mock.update).toHaveBeenCalledWith('sessions/s1', expect.objectContaining({
    'shipJumpStates.aegis': expect.objectContaining({
      integrityLockedUntil: expect.any(String), lastFailureRequestId: 'test-jump',
    }),
    'vesselActionRevisions.aegis': 1,
    updatedAt: 'server-time',
  }));
  expect(mock.update.mock.calls[0]?.[1]).not.toHaveProperty('shipGalacticCoordinates.aegis');
  expect(mock.update.mock.calls[0]?.[1]).not.toHaveProperty('shipResources.aegis.fuel');
  expect(mock.update.mock.calls[0]?.[1]).not.toHaveProperty('maintenanceCycles.aegis');
  expect(mock.update.mock.calls[0]?.[1]).not.toHaveProperty('shipJumpTransitions.aegis');
  expect(mock.randomInt).not.toHaveBeenCalled();
});

it('validates reachability from stored position even when the client supplies a different origin', async () => {
  for (const [origin, destination] of [['5143', '0101'], ['0101', '5143'], ['5143', '5143']]) {
    mock.coordinate = origin!;
    mock.update.mockClear();
    await expect(jumpShip.run(request({ ...data, destination, origin: '0000' }))).resolves.toMatchObject({
      status: 'integrity-lockout', origin, destination,
    });
    const fields = mock.update.mock.calls[0]?.[1];
    expect(fields).toHaveProperty('shipJumpStates.aegis');
    for (const field of ['shipGalacticCoordinates.aegis', 'shipResources.aegis.fuel', 'maintenanceCycles.aegis', 'shipJumpTransitions.aegis']) {
      expect(fields).not.toHaveProperty(field);
    }
    expect(mock.update).toHaveBeenCalledTimes(1);
  }
  expect(mock.randomInt).not.toHaveBeenCalled();

  mock.coordinate = '5143';
  mock.update.mockClear();
  await expect(jumpShip.run(request({ ...data, destination: '0000', origin: '0101' }))).resolves.toMatchObject({
    status: 'jumped', origin: '5143', destination: '0000',
  });
  expect(mock.update).toHaveBeenCalledWith('sessions/s1', expect.objectContaining({
    'shipResources.aegis.fuel': expect.any(Number),
    shipGalacticCoordinates: 'delete-field',
    shipNavigationLogs: 'delete-field',
    pursuitGroups: 'delete-field',
  }));
  expect(mock.set).toHaveBeenCalledWith('sessions/s1/serverState/navigation', expect.objectContaining({
    shipGalacticCoordinates: expect.objectContaining({ aegis: '0000' }),
  }));
});

it('uses the active GM instance and atomically moves, burns fuel, consumes charge, and publishes the transition', async () => {
  mock.transactionRetries = 1;
  mock.upgrades = { aegis: ['jump-drive'] };
  mock.damage = { aegis: { damagedSystemIds: ['jump-drive'], destroyed: false } };
  mock.randomInt.mockReset();
  mock.randomInt.mockReturnValueOnce(4).mockReturnValueOnce(1);

  await expect(jumpShip.run(request({ ...data, destination: '5143' }))).resolves.toMatchObject({
    status: 'jumped',
    shipId: 'aegis',
    origin: '0000',
    destination: '5143',
    length: 'short',
    fuelCost: 1,
    remainingFuel: 3,
    transition: expect.objectContaining({ id: 'jump-test-jump', destination: '5143' }),
    actorUid: 'u1', actorRoleId: null, vesselId: 'aegis', turn: 1, phase: 'active',
    revision: 1, idempotencyKey: 'test-jump', auditId: 'jump-ship-test-jump',
  });

  expect(mock.randomInt).toHaveBeenCalledTimes(1);
  expect(mock.randomInt).toHaveBeenCalledWith(1, 7);
  expect(mock.update).toHaveBeenCalledTimes(1);
  expect(mock.update).toHaveBeenCalledWith('sessions/s1', expect.objectContaining({
    'shipResources.aegis.fuel': 3,
    'maintenanceCycles.aegis': expect.objectContaining({ charges: [] }),
    'shipJumpStates.aegis': { lastJumpTurn: 1 },
    'shipJumpTransitions.aegis': expect.objectContaining({ id: 'jump-test-jump' }),
    shipGalacticCoordinates: 'delete-field',
    shipNavigationLogs: 'delete-field',
    pursuitGroups: 'delete-field',
  }));
  expect(mock.set).toHaveBeenCalledWith('sessions/s1/serverState/navigation', expect.objectContaining({
    shipGalacticCoordinates: expect.objectContaining({ aegis: '5143' }),
    shipNavigationLogs: expect.objectContaining({
      aegis: expect.arrayContaining([expect.objectContaining({
        id: 'jump-test-jump-0', type: 'self-jump', origin: '0000', destination: '5143',
      })]),
    }),
    systemHistory: {
      aegis: {
        '5143': expect.objectContaining({
          coordinate: '5143',
          discovery: { id: 'jump-test-jump-0', occurredAt: expect.any(String) },
          attempts: [], hazards: [], rewards: [], clearedThreats: [], candidateProgress: [],
        }),
      },
    },
  }));

  mock.systemHistory = {
    aegis: {
      '1413': {
        coordinate: '1413',
        attempts: [{ id: 'attempt-before-jump', occurredAt: '2026-09-13T00:00:00.000Z' }],
        hazards: [], rewards: [], clearedThreats: [], candidateProgress: [],
      },
    },
  };

  mock.transactionRetries = 0;
  mock.coordinate = '0000';
  mock.fuel = 4;
  mock.charges = ['jump-drive'];
  mock.jumpStates = {};
  mock.upgrades = {};
  mock.damage = {};
  mock.randomInt.mockReset();
  mock.randomInt.mockReturnValue(6);
  mock.update.mockReset();
  mock.set.mockReset();

  await expect(jumpShip.run(request({ ...data, destination: '5143' }))).resolves.toMatchObject({
    status: 'jumped',
    shipId: 'aegis',
    origin: '0000',
    destination: '5143',
    length: 'short',
    fuelCost: 2,
    remainingFuel: 2,
  });

  expect(mock.randomInt).not.toHaveBeenCalled();
  expect(mock.update).toHaveBeenCalledTimes(1);
  expect(mock.update).toHaveBeenCalledWith('sessions/s1', expect.objectContaining({
    'shipResources.aegis.fuel': 2,
    'maintenanceCycles.aegis': expect.objectContaining({ charges: [] }),
    'shipJumpStates.aegis': { lastJumpTurn: 1 },
    'shipJumpTransitions.aegis': expect.objectContaining({ id: 'jump-test-jump' }),
    shipGalacticCoordinates: 'delete-field',
    shipNavigationLogs: 'delete-field',
    pursuitGroups: 'delete-field',
  }));
  expect(mock.set).toHaveBeenCalledWith('sessions/s1/serverState/navigation', expect.objectContaining({
    shipGalacticCoordinates: expect.objectContaining({ aegis: '5143' }),
    shipNavigationLogs: expect.objectContaining({
      aegis: expect.arrayContaining([expect.objectContaining({
        id: 'jump-test-jump-0',
        type: 'self-jump',
        origin: '0000',
        destination: '5143',
        navigationalError: false,
      })]),
    }),
    systemHistory: expect.objectContaining({
      aegis: expect.objectContaining({
        '1413': expect.objectContaining({
          attempts: [expect.objectContaining({ id: 'attempt-before-jump' })],
        }),
        '5143': expect.objectContaining({
          discovery: expect.objectContaining({ id: 'jump-test-jump-0' }),
        }),
      }),
    }),
  }));
});

it('returns the exact Jump Drive receipt after an uncertain transport retry without a second jump', async () => {
  const command = {
    ...data,
    requestId: '30400000-0000-4000-8000-000000000001',
    expectedRevision: 0,
    destination: '5143',
  };
  const committed = await jumpShip.run(request(command));
  expect(committed).toMatchObject({ status: 'jumped', destination: '5143', fuelCost: 2 });
  const receipt = mock.set.mock.calls.find(([path]) =>
    path === `sessions/s1/commandReceipts/${command.requestId}`)?.[1];
  expect(receipt).toBeDefined();
  mock.commandReceiptRecord = { fingerprint: receipt?.fingerprint, result: receipt?.result };
  mock.set.mockClear();
  mock.update.mockClear();
  mock.randomInt.mockClear();

  await expect(jumpShip.run(request(command))).resolves.toEqual(committed);

  expect(mock.set).not.toHaveBeenCalled();
  expect(mock.update).not.toHaveBeenCalled();
  expect(mock.randomInt).not.toHaveBeenCalled();
});

it('rejects Coordination jumps while the server phase is Team', async () => {
  let includePhaseClock = true;
  mock.get.mockImplementation(async (path: string) => {
    if (path === 'sessions/s1/wolfAttackState/current') {
      return { exists: false, data: () => undefined, get: () => undefined };
    }
    if (path.includes('/commandReceipts/')) return { exists: false, get: () => undefined };
    const fields: Record<string, unknown> = path.includes('/players/')
      ? { role: mock.role, connected: mock.connected, activeConsoleRoleId: undefined }
      : path.includes('/private/shipConsoleWriteGrant')
        ? {
          type: 'gm-ship-console-write-grant', sessionId: 's1', instanceId: 'bridge', uid: mock.owner,
          shipId: 'aegis', grantedAt: new Date(),
        }
      : path.includes('/gmInstances/')
        ? { uid: mock.owner, connected: mock.connected, lastSeenAt: new Date() }
        : {
          phase: 'active',
          currentTurn: mock.currentTurn,
          ...(includePhaseClock ? { turnPhase: {
            turn: 1,
            airspace: { state: 'restricted', tickerActive: true, pressAccess: false },
          } } : {}),
          capybaraEnabled: true,
          dioneEnabled: true,
          shipGalacticCoordinates: { aegis: mock.coordinate },
          shipResources: { aegis: { ore: 0, fuel: mock.fuel, food: 8, water: 6, materials: 1, securityTeams: 9 } },
          shipDamage: mock.damage,
          shipUpgrades: mock.upgrades,
          shipJumpStates: mock.jumpStates,
          maintenanceCycles: { aegis: { turn: mock.currentTurn, charges: mock.charges, results: {} } },
        };
    return { exists: true, get: (key: string) => fields[key] };
  });

  await expect(jumpShip.run(request({ ...data, destination: '5143' }))).rejects.toMatchObject({
    code: 'failed-precondition',
    message: expect.stringMatching(/coordination phase/i),
  });
  await expect(moveShipToLocation.run(request({
    ...data, requestId: 'restricted-movement', destination: '5143',
  }))).rejects.toMatchObject({
    code: 'failed-precondition',
    message: expect.stringMatching(/coordination phase/i),
  });
  expect(mock.update).not.toHaveBeenCalled();
  expect(mock.randomInt).not.toHaveBeenCalled();

  includePhaseClock = false;
  await expect(jumpShip.run(request({
    ...data, requestId: 'missing-clock-jump', destination: '5143',
  }))).rejects.toMatchObject({
    code: 'failed-precondition',
    message: expect.stringMatching(/no current server phase/i),
  });
  await expect(moveShipToLocation.run(request({
    ...data, requestId: 'missing-clock-movement', destination: '5143',
  }))).rejects.toMatchObject({
    code: 'failed-precondition',
    message: expect.stringMatching(/no current server phase/i),
  });
  expect(mock.update).not.toHaveBeenCalled();
  expect(mock.set).not.toHaveBeenCalled();
  expect(mock.randomInt).not.toHaveBeenCalled();
});

it('honours an existing integrity lock without changing authoritative state', async () => {
  mock.jumpStates = {
    aegis: { integrityLockedUntil: new Date(Date.now() + 3_600_000).toISOString() },
  };

  await expect(jumpShip.run(request({ ...data, destination: '5143' }))).resolves.toMatchObject({
    status: 'integrity-locked',
    shipId: 'aegis',
  });
  expect(mock.update).not.toHaveBeenCalled();
  expect(mock.randomInt).not.toHaveBeenCalled();

  mock.jumpStates = {};
  mock.damage = { aegis: { damagedSystemIds: ['jump-drive'], destroyed: false } };
  mock.randomInt.mockReturnValue(1);
  await expect(jumpShip.run(request({ ...data, destination: '5143' }))).resolves.toMatchObject({
    status: 'drive-failure',
    shipId: 'aegis',
    failureRequestId: 'test-jump',
  });
  expect(mock.update).toHaveBeenCalledWith('sessions/s1', expect.objectContaining({
    'shipJumpStates.aegis': expect.objectContaining({ lastFailureRequestId: 'test-jump' }),
  }));
  expect(mock.randomInt).toHaveBeenCalledTimes(1);

  mock.damage = {};
  mock.jumpStates = { aegis: { lastJumpTurn: 1 } };
  mock.randomInt.mockClear();
  await expect(jumpShip.run(request({ ...data, destination: '5143' }))).rejects.toMatchObject({
    code: 'failed-precondition',
    message: expect.stringMatching(/already jumped/i),
  });
  expect(mock.update).toHaveBeenCalledTimes(1);
  expect(mock.randomInt).not.toHaveBeenCalled();
});

it.each([
  ['lastJumpTurn', { lastJumpTurn: '1' }],
  ['integrityLockedUntil', { integrityLockedUntil: 'not-a-timestamp' }],
  ['emergencyJumpUsed', { emergencyJumpUsed: 'true' }],
  ['lastFailureRequestId', { lastFailureRequestId: 17 }],
])('fails closed when stored Jump Drive %s is malformed', async (_field, state) => {
  mock.jumpStates = { aegis: state };

  await expect(jumpShip.run(request({ ...data, destination: '5143' }))).rejects.toMatchObject({
    code: 'failed-precondition',
    details: expect.objectContaining({ commandError: 'malformed-input' }),
  });
  expect(mock.update).not.toHaveBeenCalled();
  expect(mock.set).not.toHaveBeenCalled();
  expect(mock.randomInt).not.toHaveBeenCalled();
});

it.each([
  ['the Jump Drive map', 'malformed-map' as unknown as Record<string, unknown>],
  ['the AEGIS Jump Drive state', { aegis: null }],
])('fails closed when %s is present but malformed', async (_label, state) => {
  mock.jumpStates = state;

  await expect(jumpShip.run(request({ ...data, destination: '5143' }))).rejects.toMatchObject({
    code: 'failed-precondition',
    details: expect.objectContaining({ commandError: 'malformed-input' }),
  });
  expect(mock.update).not.toHaveBeenCalled();
  expect(mock.set).not.toHaveBeenCalled();
  expect(mock.randomInt).not.toHaveBeenCalled();
});

it('retains the current adjudicable failure when a later jump is not charged', async () => {
  mock.charges = [];
  mock.jumpStates = { aegis: { lastFailureRequestId: 'fuel-failure' } };
  mock.jumpFailures = {
    'fuel-failure': {
      type: 'ship-jump-failure', status: 'unresolved', adjudicable: true,
      requestId: 'fuel-failure', shipId: 'aegis', origin: '0000', destination: '9997',
      failureStatus: 'fuel-shortage', failureRevision: 0, currentTurn: 1, fuelAtFailure: 4,
    },
  };

  await expect(jumpShip.run(request({
    ...data, requestId: 'later-not-charged', destination: '5143',
  }))).resolves.toMatchObject({ status: 'not-charged' });

  expect(mock.update).toHaveBeenCalledWith('sessions/s1', expect.objectContaining({
    'shipJumpStates.aegis': { lastFailureRequestId: 'fuel-failure' },
  }));
  expect(mock.update).not.toHaveBeenCalledWith('sessions/s1/jumpFailures/fuel-failure', expect.anything());
});

it('records an under-fuel attempt without spending resources so an exact GM adjudication can follow', async () => {
  mock.fuel = 1;
  mock.update.mockClear();
  mock.set.mockClear();

  await expect(jumpShip.run(request({
    ...data, requestId: 'under-fuel-attempt', destination: '9997',
  }))).resolves.toMatchObject({
    status: 'fuel-shortage', shipId: 'aegis', origin: '0000', destination: '9997',
    availableFuel: 1, requiredFuel: 3, revision: 0, idempotencyKey: 'under-fuel-attempt',
  });

  expect(mock.update).toHaveBeenCalledTimes(1);
  expect(mock.set).toHaveBeenCalledWith(
    'sessions/s1/jumpFailures/under-fuel-attempt',
    expect.objectContaining({
      status: 'unresolved', shipId: 'aegis', origin: '0000', destination: '9997',
      failureStatus: 'fuel-shortage', failureRevision: 0, fuelAtFailure: 1,
    }),
  );
  expect(mock.set).toHaveBeenCalledWith(
    'sessions/s1/events/ship-jump-under-fuel-attempt',
    expect.objectContaining({ type: 'ship-jump', outcome: 'fuel-shortage', shipId: 'aegis' }),
  );
  expect(mock.randomInt).not.toHaveBeenCalled();
});

it('accepts a pursuit-10 emergency jump without a charge or fuel and damages the drive plus half the remaining consoles', async () => {
  mock.charges = [];
  mock.fuel = 0;
  mock.pursuitGroups = { 'fleet-1': 10 };
  mock.pursuitEmergencyWindow = {
    type: 'pursuit-emergency-window', status: 'offered', cycle: 1,
    navigationRevision: 0, groupIds: ['fleet-1'], openedAt: '2026-09-06T12:10:07.000Z',
  };
  mock.update.mockClear();
  mock.set.mockClear();

  await expect(jumpShip.run(request({
    ...data, requestId: 'emergency-at-pursuit-ten', destination: '5143', emergency: true,
  }))).resolves.toMatchObject({
    status: 'jumped', emergency: true, shipId: 'aegis',
    origin: '0000', destination: '5143', fuelSpent: 0, remainingFuel: 0,
    state: { lastJumpTurn: 1, emergencyJumpUsed: true },
    damage: { destroyed: false, damagedSystemIds: expect.arrayContaining(['jump-drive']) },
  });

  expect(mock.update).toHaveBeenCalledWith('sessions/s1', expect.objectContaining({
    'shipResources.aegis.fuel': 0,
    'shipJumpStates.aegis': expect.objectContaining({ lastJumpTurn: 1, emergencyJumpUsed: true }),
    'maintenanceCycles.aegis': expect.objectContaining({ charges: [] }),
    shipGalacticCoordinates: 'delete-field',
  }));
  expect(mock.set).toHaveBeenCalledWith(
    'sessions/s1/events/ship-jump-emergency-at-pursuit-ten',
    expect.objectContaining({ type: 'ship-jump', outcome: 'emergency', shipId: 'aegis' }),
  );
});

it('applies a charged intact Icebreaker Ram Scoop to a successful emergency FTL jump', async () => {
  mock.grantedShipId = 'icebreaker';
  mock.icebreakerFuel = 4;
  mock.icebreakerCharges = ['ram-scoop'];
  mock.pursuitGroups = { 'fleet-1': 10 };
  mock.pursuitEmergencyWindow = {
    type: 'pursuit-emergency-window', status: 'offered', cycle: 1,
    navigationRevision: 0, groupIds: ['fleet-1'], openedAt: '2026-09-06T12:10:07.000Z',
  };
  mock.update.mockClear();
  mock.set.mockClear();

  const reply = await jumpShip.run(request({
    ...data, shipId: 'icebreaker', requestId: 'icebreaker-emergency-ram-scoop',
    destination: '5143', emergency: true,
  }));

  expect(reply).toMatchObject({
    status: 'jumped', emergency: true, length: 'short',
    ramScoopOreGain: 10, remainingOre: 10,
  });
  expect(mock.update).toHaveBeenCalledWith('sessions/s1', expect.objectContaining({
    'shipResources.icebreaker.fuel': 0,
    'shipResources.icebreaker.ore': 10,
  }));
  expect(mock.set).toHaveBeenCalledWith(
    'sessions/s1/events/ship-jump-icebreaker-emergency-ram-scoop',
    expect.objectContaining({
      type: 'ship-jump', outcome: 'emergency', shipId: 'icebreaker',
      length: 'short', fuelSpent: 4, ramScoopOreGain: 10,
    }),
  );
});

it('keeps an emergency jump subject to the ship one-jump-per-cycle guard', async () => {
  mock.charges = [];
  mock.fuel = 0;
  mock.pursuitGroups = { 'fleet-1': 10 };
  mock.pursuitEmergencyWindow = {
    type: 'pursuit-emergency-window', status: 'offered', cycle: 1,
    navigationRevision: 0, groupIds: ['fleet-1'], openedAt: '2026-09-06T12:10:07.000Z',
  };
  mock.jumpStates = { aegis: { lastJumpTurn: 1 } };

  await expect(jumpShip.run(request({
    ...data, requestId: 'second-jump-same-cycle', destination: '5143', emergency: true,
  }))).rejects.toMatchObject({
    code: 'failed-precondition',
    message: expect.stringMatching(/already jumped this cycle/i),
  });
  expect(mock.update).not.toHaveBeenCalled();
  expect(mock.randomInt).not.toHaveBeenCalled();
});

it('requires the active facilitator offer before a pursuit-10 emergency jump', async () => {
  mock.charges = [];
  mock.fuel = 0;
  mock.pursuitGroups = { 'fleet-1': 10 };

  await expect(jumpShip.run(request({
    ...data, requestId: 'emergency-before-facilitator-offer', destination: '5143', emergency: true,
  }))).rejects.toMatchObject({
    code: 'failed-precondition', message: expect.stringMatching(/facilitator.*offer/i),
  });
  expect(mock.update).not.toHaveBeenCalled();
  expect(mock.set).not.toHaveBeenCalled();
  expect(mock.randomInt).not.toHaveBeenCalled();
});

it('requires an exact failure id before offering a failure-based emergency jump', async () => {
  mock.jumpStates = { aegis: { lastFailureRequestId: 'current-failure' } };
  mock.jumpFailures = {
    'current-failure': {
      type: 'ship-jump-failure', status: 'unresolved', adjudicable: true,
      requestId: 'current-failure', shipId: 'aegis', origin: '0000', destination: '9997',
      failureStatus: 'fuel-shortage', failureRevision: 0, currentTurn: 1, fuelAtFailure: 4,
    },
  };

  await expect(jumpShip.run(request({
    ...data, requestId: 'failure-emergency-no-id', destination: '5143', emergency: true,
  }))).rejects.toMatchObject({ code: 'failed-precondition' });
  expect(mock.update).not.toHaveBeenCalled();
  expect(mock.set).not.toHaveBeenCalled();
});

it.each([
  ['wrong record type', { type: 'other-record' }],
  ['mismatched document request id', { requestId: 'different-failure' }],
  ['unknown failure status', { failureStatus: 'forged' }],
])('rejects a failure-based emergency with %s', async (_label, override) => {
  mock.jumpStates = { aegis: { lastFailureRequestId: 'current-failure' } };
  mock.jumpFailures = {
    'current-failure': {
      type: 'ship-jump-failure', status: 'unresolved', adjudicable: true,
      requestId: 'current-failure', shipId: 'aegis', origin: '0000', destination: '9997',
      failureStatus: 'fuel-shortage', failureRevision: 0, currentTurn: 1, fuelAtFailure: 4,
      ...override,
    },
  };

  await expect(jumpShip.run(request({
    ...data, requestId: 'failure-emergency-exact-id', destination: '5143', emergency: true,
    failureRequestId: 'current-failure',
  }))).rejects.toMatchObject({ code: 'failed-precondition' });
  expect(mock.update).not.toHaveBeenCalled();
  expect(mock.set).not.toHaveBeenCalled();
});

it('uses the new ship self-arrival when an older observer event follows it in the log', async () => {
  mock.grantedShipId = 'dione';
  mock.navigationLogs = {
    dione: [{
      id: 'older-observer-arrival', shipId: 'dione', type: 'ship-jump-away',
      origin: '0000', destination: '5143', subjectShipId: 'aegis', subjectShipName: 'AEGIS',
      occurredAt: '2026-09-20T12:00:00.000Z', stardate: '2026.263.120000',
    }],
  };

  await expect(jumpShip.run(request({
    ...data, shipId: 'dione', requestId: 'dione-retry-after-observer', destination: '5143',
  }))).resolves.toMatchObject({
    status: 'jumped', shipId: 'dione', origin: '0000', destination: '5143', revision: 1,
  });
  expect(mock.set).toHaveBeenCalledWith('sessions/s1/serverState/navigation', expect.objectContaining({
    systemHistory: expect.objectContaining({
      dione: expect.objectContaining({
        '5143': expect.objectContaining({
          discovery: { id: 'jump-dione-retry-after-observer-0', occurredAt: expect.any(String) },
        }),
      }),
    }),
  }));
});

it.each(['ordinary', 'emergency', 'adjudication'] as const)(
  'increments shared navigation revision from its stored value for %s moves', async (kind) => {
    mock.navigationRevision = 41;
    if (kind === 'emergency') {
      mock.pursuitGroups = { 'fleet-1': 10 };
      mock.pursuitEmergencyWindow = {
        type: 'pursuit-emergency-window', status: 'offered', cycle: 1,
        navigationRevision: 41, groupIds: ['fleet-1'], openedAt: '2026-09-06T12:10:07.000Z',
      };
    }
    if (kind === 'adjudication') {
      mock.jumpStates = { aegis: { lastFailureRequestId: 'revision-failure' } };
      mock.jumpFailures = {
        'revision-failure': {
          type: 'ship-jump-failure', status: 'unresolved', adjudicable: true,
          requestId: 'revision-failure', shipId: 'aegis', origin: '0000', destination: '9997',
          failureStatus: 'fuel-shortage', failureRevision: 0, currentTurn: 1, fuelAtFailure: 4,
        },
      };
    }

    const reply = kind === 'adjudication'
      ? await adjudicateFailedJump.run(request({
        sessionId: 's1', instanceId: 'bridge', requestId: `revision-${kind}`,
        expectedRevision: 0, failureRequestId: 'revision-failure', destination: '5143',
      }))
      : await jumpShip.run(request({
        ...data, requestId: `revision-${kind}`, destination: '5143',
        ...(kind === 'emergency' ? { emergency: true } : {}),
      }));

    expect(reply).toMatchObject({ status: 'jumped', revision: 1 });
    expect(mock.set).toHaveBeenCalledWith('sessions/s1/serverState/navigation', expect.objectContaining({
      revision: 42,
    }));
    expect(mock.set).toHaveBeenCalledWith('sessions/s1/gmDiscovery/current', expect.objectContaining({
      revision: 42,
    }));
  },
);

it('spends all failure-bound fuel when the facilitator selects a cheaper under-fueled route', async () => {
  const longDestination = Array.from({ length: 10_000 }, (_, value) => String(value).padStart(4, '0'))
    .find((coordinate) => jumpLengthBetween('0000', coordinate) === 'long');
  expect(longDestination).toBeDefined();
  const requiredFuel = jumpFuelCost('aegis', 'long', false);
  mock.fuel = requiredFuel - 2;
  mock.jumpStates = { aegis: { lastFailureRequestId: 'long-route-failure' } };
  mock.jumpFailures = {
    'long-route-failure': {
      type: 'ship-jump-failure', status: 'unresolved', adjudicable: true,
      requestId: 'long-route-failure', shipId: 'aegis', origin: '0000', destination: longDestination,
      failureStatus: 'fuel-shortage', failureRevision: 0, currentTurn: 1,
      fuelAtFailure: mock.fuel, requiredFuel,
    },
  };

  await expect(adjudicateFailedJump.run(request({
    sessionId: 's1', instanceId: 'bridge', requestId: 'cheaper-route-adjudication',
    expectedRevision: 0, failureRequestId: 'long-route-failure', destination: '5143',
  }))).resolves.toMatchObject({
    status: 'jumped', destination: '5143', fuelSpent: mock.fuel, remainingFuel: 0,
  });
  expect(mock.update).toHaveBeenCalledWith('sessions/s1', expect.objectContaining({
    'shipResources.aegis.fuel': 0,
  }));
});

it('rejects emergency and GM adjudication records whose document identity does not match the requested failure', async () => {
  const failureId = 'identity-failure';
  const failure = {
    type: 'ship-jump-failure', status: 'unresolved', adjudicable: true,
    requestId: failureId, shipId: 'aegis', origin: '0000', destination: '9997',
    failureStatus: 'fuel-shortage', failureRevision: 0, currentTurn: 1, fuelAtFailure: 4,
  };
  mock.jumpStates = { aegis: { lastFailureRequestId: failureId } };
  mock.jumpFailures = { [failureId]: failure };
  const originalGet = mock.get.getMockImplementation();
  expect(originalGet).toBeDefined();
  mock.get.mockImplementation(async (rawRef: unknown) => {
    const snapshot = await originalGet!(rawRef);
    const path = typeof rawRef === 'string' ? rawRef :
      typeof rawRef === 'object' && rawRef !== null && 'path' in rawRef
        ? String((rawRef as { path: unknown }).path) : '';
    return path === `sessions/s1/jumpFailures/${failureId}`
      ? { ...snapshot, id: 'different-id', ref: { path: 'sessions/s1/jumpFailures/different-id' } }
      : snapshot;
  });

  await expect(jumpShip.run(request({
    ...data, requestId: 'emergency-wrong-path', destination: '5143', emergency: true,
    failureRequestId: failureId,
  }))).rejects.toMatchObject({ code: 'failed-precondition' });
  expect(mock.update).not.toHaveBeenCalled();
  expect(mock.set).not.toHaveBeenCalled();
});

it('rejects facilitator adjudication when the failure record request id differs from its document path', async () => {
  mock.jumpStates = { aegis: { lastFailureRequestId: 'identity-failure' } };
  mock.jumpFailures = {
    'identity-failure': {
      type: 'ship-jump-failure', status: 'unresolved', adjudicable: true,
      requestId: 'some-other-failure', shipId: 'aegis', origin: '0000', destination: '9997',
      failureStatus: 'fuel-shortage', failureRevision: 0, currentTurn: 1, fuelAtFailure: 4,
    },
  };

  await expect(adjudicateFailedJump.run(request({
    sessionId: 's1', instanceId: 'bridge', requestId: 'bad-record-identity',
    expectedRevision: 0, failureRequestId: 'identity-failure', destination: '5143',
  }))).rejects.toMatchObject({ code: 'failed-precondition' });
  expect(mock.update).not.toHaveBeenCalled();
  expect(mock.set).not.toHaveBeenCalled();
  expect(mock.randomInt).not.toHaveBeenCalled();
});

it('does not double-count a Jump Drive that was already damaged before an emergency jump', async () => {
  mock.fuel = 2;
  mock.pursuitGroups = { 'fleet-1': 10 };
  mock.pursuitEmergencyWindow = {
    type: 'pursuit-emergency-window', status: 'offered', cycle: 1,
    navigationRevision: 0, groupIds: ['fleet-1'], openedAt: '2026-09-06T12:10:07.000Z',
  };
  mock.damage = { aegis: { damagedSystemIds: ['jump-drive'], destroyed: false } };
  mock.survivors = { aegis: 2_500 };

  const reply = await jumpShip.run(request({
    ...data, requestId: 'emergency-pre-damaged-drive', destination: '5143', emergency: true,
  }));
  expect(reply).toMatchObject({ status: 'jumped', emergency: true });
  const damageUpdate = mock.update.mock.calls.find(([path]) => path === 'sessions/s1')?.[1];
  const damagedSystems = (reply as { damageDraws: Array<{ systemId: string }> }).damageDraws
    .map((draw) => draw.systemId);
  const expectedPopulation = damagedSystems.reduce((population) =>
    populationChange('aegis', population, -1, false).amount, 2_500);
  expect(damageUpdate).toMatchObject({ 'shipSurvivors.aegis': expectedPopulation });
  expect(mock.set.mock.calls.some(([path]) => String(path).endsWith('/emergency-emergency-pre-damaged-drive-jump-drive')))
    .toBe(false);
});

it('records jump-damage mutiny atomically and still replays the exact receipt after the ship becomes unusable', async () => {
  mock.role = 'player';
  mock.activeRoleIds = ['admiral'];
  mock.activeConsoleRoleId = 'admiral';
  mock.players = [{ id: 'u1', fields: {
    role: 'player', connected: true, fleetGroupId: 'fleet-1', activeConsoleRoleId: 'admiral',
  } }];
  mock.pursuitGroups = { 'fleet-1': 10 };
  mock.pursuitEmergencyWindow = {
    type: 'pursuit-emergency-window', status: 'offered', cycle: 1,
    navigationRevision: 0, groupIds: ['fleet-1'], openedAt: '2026-09-06T12:10:07.000Z',
  };
  mock.unrest = { aegis: 6 };
  mock.survivors = { aegis: 750 };
  const command = {
    ...data, requestId: 'jump-causes-mutiny', destination: '5143', emergency: true,
  };

  const reply = await jumpShip.run(request(command));
  const sessionUpdate = mock.update.mock.calls.find(([path]) => path === 'sessions/s1')?.[1];
  expect(sessionUpdate).toHaveProperty('shipMutinies.aegis', expect.objectContaining({
    status: 'active', triggerUnrest: 8,
  }));

  const receipt = mock.set.mock.calls.find(([path]) => String(path).includes('/commandReceipts/'))?.[1];
  expect(receipt).toBeDefined();
  mock.commandReceiptRecord = receipt;
  mock.unrest = { aegis: 8 };
  mock.mutinies = { aegis: (sessionUpdate as Record<string, unknown>)['shipMutinies.aegis'] };
  mock.update.mockClear();
  mock.set.mockClear();

  await expect(jumpShip.run(request(command))).resolves.toEqual(reply);
  expect(mock.update).not.toHaveBeenCalled();
  expect(mock.set).not.toHaveBeenCalled();
});

it('opens a nonterminal GM decision window when cycle advancement reaches pursuit 10', async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-09-06T12:10:07.000Z'));
  mock.currentTurn = 2;
  mock.navigationRevision = 8;
  mock.activeVesselIds = ['aegis', 'shepherd'];
  mock.activeRoleIds = ['admiral', 'shepherd-captain'];
  mock.pursuitGroups = { 'fleet-1': 8, 'fleet-2': 4 };
  mock.fleetGroups = [
    { id: 'fleet-1', vesselIds: ['aegis'], memberUids: ['u1'] },
    { id: 'fleet-2', vesselIds: ['shepherd'], memberUids: ['u2'] },
  ];
  mock.players = [
    { id: 'u1', fields: { role: 'gm', connected: true, fleetGroupId: 'fleet-1' } },
    { id: 'u2', fields: { role: 'player', connected: true, fleetGroupId: 'fleet-2' } },
  ];

  const result = await advanceTurn.run(request({
    sessionId: 's1', instanceId: 'bridge', requestId: 'pursuit-ten-window', expectedTurn: 2,
    overridePhaseTimer: true,
  }));

  expect(result).toMatchObject({
    currentTurn: 3,
    pursuitEmergencyWindow: {
      type: 'pursuit-emergency-window',
      status: 'awaiting-gm-decision',
      cycle: 3,
    },
  });
  expect(result).not.toHaveProperty('phase', 'failure');
  expect(result).not.toHaveProperty('gameOutcome');
  expect(result.pursuitEmergencyWindow).not.toHaveProperty('navigationRevision');
  expect(result.pursuitEmergencyWindow).not.toHaveProperty('groupIds');
  expect(mock.update).toHaveBeenCalledWith('sessions/s1', expect.objectContaining({
    currentTurn: 3,
    phase: 'active',
    pursuitEmergencyWindow: expect.objectContaining({ status: 'awaiting-gm-decision' }),
  }));
  expect(mock.update.mock.calls.find(([path]) => path === 'sessions/s1')?.[1])
    .not.toHaveProperty('gameOutcome');
});

it('requires a current GM offer or decline, and exactly replays both pursuit-window decisions', async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-09-06T12:10:07.000Z'));
  mock.currentTurn = 3;
  mock.navigationRevision = 9;
  mock.pursuitGroups = { 'fleet-1': 10 };
  mock.activeRoleIds = [
    'admiral', 'dione-captain', 'icebreaker-captain',
    'shepherd-captain', 'quellon-captain', 'refinery-124-captain',
  ];
  mock.pursuitEmergencyWindow = {
    type: 'pursuit-emergency-window', status: 'awaiting-gm-decision',
    cycle: 3, navigationRevision: 9, groupIds: ['fleet-1'], openedAt: '2026-09-28T12:20:07.000Z',
  };

  const offerRequest = {
    sessionId: 's1', instanceId: 'bridge', requestId: 'offer-pursuit-emergency', expectedTurn: 3,
    overridePhaseTimer: true, pursuitEmergencyDecision: 'offer', expectedPursuitNavigationRevision: 9,
  };
  const offer = await advanceTurn.run(request(offerRequest));
  expect(offer).toMatchObject({
    currentTurn: 3,
    pursuitEmergencyWindow: { status: 'offered', cycle: 3 },
  });
  expect(offer.pursuitEmergencyWindow).not.toHaveProperty('navigationRevision');
  expect(offer.pursuitEmergencyWindow).not.toHaveProperty('groupIds');
  const offerReceipt = mock.set.mock.calls.find(([path]) => String(path).endsWith('/commandReceipts/offer-pursuit-emergency'))?.[1];
  expect(offerReceipt).toMatchObject({ result: offer });
  mock.commandReceiptRecord = offerReceipt;
  mock.update.mockClear();
  mock.set.mockClear();
  await expect(advanceTurn.run(request(offerRequest))).resolves.toEqual(offer);
  expect(mock.update).not.toHaveBeenCalled();
  expect(mock.set).not.toHaveBeenCalled();

  mock.commandReceiptRecord = undefined;
  const declineRequest = {
    sessionId: 's1', instanceId: 'bridge', requestId: 'decline-pursuit-emergency', expectedTurn: 3,
    overridePhaseTimer: true, pursuitEmergencyDecision: 'decline', expectedPursuitNavigationRevision: 9,
  };
  const decline = await advanceTurn.run(request(declineRequest));
  expect(decline).toMatchObject({
    currentTurn: 3,
    phase: 'failure',
    gameOutcome: { type: 'game-outcome', result: 'failure', cause: 'pursuit-limit', cycle: 3, navigationRevision: 9 },
  });
  expect(mock.update).toHaveBeenCalledWith('sessions/s1', expect.objectContaining({
    phase: 'failure', gameOutcome: decline.gameOutcome, pursuitEmergencyWindow: 'delete-field',
  }));
  const declineReceipt = mock.set.mock.calls.find(([path]) => String(path).endsWith('/commandReceipts/decline-pursuit-emergency'))?.[1];
  expect(declineReceipt).toMatchObject({ result: decline });
  mock.commandReceiptRecord = declineReceipt;
  mock.phase = 'failure';
  mock.update.mockClear();
  mock.set.mockClear();
  await expect(advanceTurn.run(request(declineRequest))).resolves.toEqual(decline);
  expect(mock.update).not.toHaveBeenCalled();
  expect(mock.set).not.toHaveBeenCalled();
});

it('rejects stale and non-GM pursuit-window choices without changing the window', async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-09-06T12:10:07.000Z'));
  mock.currentTurn = 3;
  mock.navigationRevision = 9;
  mock.activeRoleIds = [
    'admiral', 'dione-captain', 'icebreaker-captain',
    'shepherd-captain', 'quellon-captain', 'refinery-124-captain',
  ];
  mock.pursuitEmergencyWindow = {
    type: 'pursuit-emergency-window', status: 'awaiting-gm-decision',
    cycle: 3, navigationRevision: 9, groupIds: ['fleet-1'], openedAt: '2026-09-28T12:20:07.000Z',
  };
  await expect(advanceTurn.run(request({
    sessionId: 's1', instanceId: 'bridge', requestId: 'stale-window-offer', expectedTurn: 3,
    overridePhaseTimer: true,
    pursuitEmergencyDecision: 'offer', expectedPursuitNavigationRevision: 8,
  }))).rejects.toMatchObject({
    code: 'failed-precondition', details: { commandError: 'stale-revision' },
  });
  expect(mock.update).not.toHaveBeenCalled();
  expect(mock.set).not.toHaveBeenCalled();

  mock.role = 'player';
  mock.players = [{ id: 'u1', fields: {
    role: 'player', connected: true, fleetGroupId: 'fleet-1', activeConsoleRoleId: 'admiral',
  } }];
  await expect(advanceTurn.run(request({
    sessionId: 's1', instanceId: 'bridge', requestId: 'player-window-offer', expectedTurn: 3,
    overridePhaseTimer: true,
    pursuitEmergencyDecision: 'offer', expectedPursuitNavigationRevision: 9,
  }))).rejects.toMatchObject({ code: 'permission-denied' });
  expect(mock.update).not.toHaveBeenCalled();
  expect(mock.set).not.toHaveBeenCalled();
});

it('does not strand pursuit 10 when every active vessel has already spent its emergency jump', async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-09-06T12:10:07.000Z'));
  mock.currentTurn = 2;
  mock.navigationRevision = 8;
  mock.activeVesselIds = ['aegis', 'shepherd'];
  mock.activeRoleIds = ['admiral', 'shepherd-captain'];
  mock.pursuitGroups = { 'fleet-1': 8, 'fleet-2': 4 };
  mock.fleetGroups = [
    { id: 'fleet-1', vesselIds: ['aegis'], memberUids: ['u1'] },
    { id: 'fleet-2', vesselIds: ['shepherd'], memberUids: ['u2'] },
  ];
  mock.players = [
    { id: 'u1', fields: { role: 'gm', connected: true, fleetGroupId: 'fleet-1' } },
    { id: 'u2', fields: { role: 'player', connected: true, fleetGroupId: 'fleet-2' } },
  ];
  mock.jumpStates = Object.fromEntries(
    ['aegis', 'shepherd']
      .map((shipId) => [shipId, { emergencyJumpUsed: true }]),
  );

  const result = await advanceTurn.run(request({
    sessionId: 's1', instanceId: 'bridge', requestId: 'no-emergency-vessels', expectedTurn: 2,
    overridePhaseTimer: true,
  }));

  expect(result).toMatchObject({
    currentTurn: 3,
    phase: 'failure',
    gameOutcome: { cause: 'pursuit-limit', cycle: 3, navigationRevision: 9 },
  });
  expect(result).not.toHaveProperty('pursuitEmergencyWindow');
});

it('blocks stale ordinary jump requests while the GM is deciding about pursuit emergency', async () => {
  mock.pursuitEmergencyWindow = {
    type: 'pursuit-emergency-window', status: 'awaiting-gm-decision',
    cycle: 1, navigationRevision: 0, groupIds: ['fleet-1'], openedAt: '2026-09-28T12:20:07.000Z',
  };
  await expect(jumpShip.run(request({
    ...data, requestId: 'ordinary-jump-during-pursuit-decision', destination: '5143',
  }))).rejects.toMatchObject({ code: 'failed-precondition' });
  expect(mock.update).not.toHaveBeenCalled();
  expect(mock.set).not.toHaveBeenCalled();
  expect(mock.randomInt).not.toHaveBeenCalled();
});

it('exposes only active-GM jump-failure adjudication and read callables', () => {
  const exports = jumpCallables as unknown as Record<string, unknown>;
  expect(exports.adjudicateFailedJump).toBeTypeOf('function');
  expect(exports.listUnresolvedJumpFailures).toBeTypeOf('function');
});

it('lists only the current, unresolved, adjudicable failure through facilitator authority', async () => {
  mock.jumpStates = { aegis: { lastFailureRequestId: 'current-failure' } };
  mock.jumpFailures = {
    'current-failure': {
      type: 'ship-jump-failure', status: 'unresolved', adjudicable: true,
      requestId: 'current-failure', shipId: 'aegis', origin: '0000', destination: '9997',
      failureStatus: 'fuel-shortage', failureRevision: 0, currentTurn: 1, fuelAtFailure: 4,
      requiredFuel: 3,
    },
    'superseded-failure': {
      type: 'ship-jump-failure', status: 'unresolved', adjudicable: true,
      requestId: 'superseded-failure', shipId: 'aegis', origin: '0000', destination: '5143',
      failureStatus: 'drive-failure', failureRevision: 0, currentTurn: 1, fuelAtFailure: 4,
      failureRoll: 2, failureThreshold: 3,
    },
    'denied-attempt': {
      type: 'ship-jump-failure', status: 'unresolved', adjudicable: false,
      requestId: 'denied-attempt', shipId: 'aegis', origin: '0000', destination: '5143',
      failureStatus: 'not-charged', failureRevision: 0, currentTurn: 1, fuelAtFailure: 4,
    },
  };

  await expect(listUnresolvedJumpFailures.run(request({
    sessionId: 's1', instanceId: 'bridge',
  }))).resolves.toEqual({ failures: [{
    requestId: 'current-failure', shipId: 'aegis', origin: '0000', destination: '9997',
    failureStatus: 'fuel-shortage', failureRevision: 0, currentTurn: 1, fuelAtFailure: 4,
    requiredFuel: 3,
  }] });
  const readPaths = mock.get.mock.calls.map(([rawRef]) => typeof rawRef === 'string'
    ? rawRef
    : typeof rawRef === 'object' && rawRef !== null && 'path' in rawRef
      ? String((rawRef as { path: unknown }).path)
      : '');
  expect(readPaths).toContain('sessions/s1/jumpFailures/current-failure');
  expect(readPaths).not.toContain('sessions/s1/jumpFailures');
});

it('completes an exact under-fueled failure with available fuel and a full server d6 of common damage', async () => {
  mock.fuel = 1;
  mock.jumpStates = { aegis: { lastFailureRequestId: 'underfunded-failure' } };
  mock.jumpFailures = {
    'underfunded-failure': {
      type: 'ship-jump-failure', status: 'unresolved', adjudicable: true,
      requestId: 'underfunded-failure', shipId: 'aegis', origin: '0000', destination: '9997',
      failureStatus: 'fuel-shortage', failureRevision: 0, currentTurn: 1, fuelAtFailure: 1,
      requiredFuel: 3,
    },
  };
  mock.randomInt.mockReturnValue(6);

  await expect(adjudicateFailedJump.run(request({
    sessionId: 's1', instanceId: 'bridge', requestId: 'complete-underfunded',
    expectedRevision: 0, failureRequestId: 'underfunded-failure', destination: '9997',
  }))).resolves.toMatchObject({
    status: 'jumped', shipId: 'aegis', origin: '0000', destination: '9997',
    fuelSpent: 1, remainingFuel: 0, failureRoll: 6,
    damageDraws: expect.arrayContaining([expect.objectContaining({ systemId: expect.any(String) })]),
    state: { lastJumpTurn: 1 },
  });
  const receipt = mock.set.mock.calls.find(([path]) => String(path).includes('/commandReceipts/'))?.[1];
  expect(receipt).toBeDefined();
  expect(mock.update).toHaveBeenCalledWith('sessions/s1', expect.objectContaining({
    'shipResources.aegis.fuel': 0,
    'shipJumpStates.aegis': expect.objectContaining({ lastJumpTurn: 1 }),
    'shipSurvivors.aegis': expect.any(Number),
  }));
  expect(mock.update).toHaveBeenCalledWith(
    'sessions/s1/jumpFailures/underfunded-failure',
    expect.objectContaining({ status: 'resolved', resolution: 'full-d6-damage-facilitator-jump' }),
  );
  expect(mock.set).toHaveBeenCalledWith(
    'sessions/s1/events/ship-jump-complete-underfunded',
    expect.objectContaining({
      type: 'ship-jump', outcome: 'facilitator-adjudication', failureRoll: 6,
      fuelSpent: 1, damageCount: 6,
    }),
  );
});

it('records the printed population value where a multi-card adjudication first crossed its alert threshold', async () => {
  mock.dioneFuel = 1;
  mock.survivors = { dione: 100_000 };
  mock.jumpStates = { dione: { lastFailureRequestId: 'dione-failure' } };
  mock.jumpFailures = {
    'dione-failure': {
      type: 'ship-jump-failure', status: 'unresolved', adjudicable: true,
      requestId: 'dione-failure', shipId: 'dione', origin: '0000', destination: '5143',
      failureStatus: 'fuel-shortage', failureRevision: 0, currentTurn: 1, fuelAtFailure: 1,
      requiredFuel: 8,
    },
  };

  await expect(adjudicateFailedJump.run(request({
    sessionId: 's1', instanceId: 'bridge', requestId: 'dione-adjudication',
    expectedRevision: 0, failureRequestId: 'dione-failure', destination: '5143',
  }))).resolves.toMatchObject({ status: 'jumped', failureRoll: 6, damageDraws: expect.any(Array) });

  expect(mock.update).toHaveBeenCalledWith('sessions/s1', expect.objectContaining({
    'shipSurvivors.dione': 74_000,
    populationAlerts: expect.objectContaining({
      dione: expect.objectContaining({ population: 90_000, targetGmInstanceIds: ['bridge'] }),
    }),
  }));
});

it('chooses a blind-jump destination from the authoritative current node and binds the result to its receipt', async () => {
  mock.coordinate = '0000';
  mock.randomInt.mockReturnValue(1);
  const command = { ...data, requestId: 'blind-adjacent', blind: true };

  const first = await jumpShip.run(request(command));

  expect(first).toMatchObject({ status: 'jumped', origin: '0000', destination: '1413', fuelCost: 2 });
  expect(first).not.toHaveProperty('neighborCandidates');
  expect(first).not.toHaveProperty('chart');
  expect(mock.randomInt).toHaveBeenCalledWith(0, 2);
  expect(mock.update).toHaveBeenCalledWith('sessions/s1', expect.objectContaining({
    'shipResources.aegis.fuel': 2,
  }));
  const receiptWrite = mock.set.mock.calls.find(([path]) => String(path).includes('/commandReceipts/'));
  expect(receiptWrite).toBeDefined();
  mock.commandReceiptRecord = receiptWrite?.[1] as Record<string, unknown>;

  mock.randomInt.mockClear();
  mock.update.mockClear();
  mock.set.mockClear();
  await expect(jumpShip.run(request(command))).resolves.toEqual(first);
  expect(mock.randomInt).not.toHaveBeenCalled();
  expect(mock.update).not.toHaveBeenCalled();
  expect(mock.set).not.toHaveBeenCalled();
});

it('reuses the same blind destination when Firestore retries the transaction callback', async () => {
  mock.transactionRetries = 1;
  mock.randomInt.mockReset().mockReturnValueOnce(0).mockReturnValueOnce(1);

  const reply = await jumpShip.run(request({ ...data, requestId: 'blind-transaction-retry', blind: true }));

  expect(reply).toMatchObject({ status: 'jumped', origin: '0000', destination: '5143' });
  expect(mock.randomInt).toHaveBeenCalledTimes(1);
  expect(mock.randomInt).toHaveBeenCalledWith(0, 2);
});

it('rejects a blind jump when the authoritative current node is absent from the locked graph without mutation', async () => {
  mock.coordinate = '7777';

  await expect(jumpShip.run(request({ ...data, requestId: 'blind-no-node', blind: true })))
    .rejects.toMatchObject({ code: 'failed-precondition' });

  expect(mock.randomInt).not.toHaveBeenCalled();
  expect(mock.update).not.toHaveBeenCalled();
  expect(mock.set).not.toHaveBeenCalled();
});

it('does not draw a blind destination before the ordinary jump charge requirement passes', async () => {
  mock.charges = [];

  await expect(jumpShip.run(request({ ...data, requestId: 'blind-uncharged', blind: true })))
    .resolves.toMatchObject({ status: 'not-charged', origin: '0000' });

  expect(mock.randomInt).not.toHaveBeenCalled();
  expect(mock.update).not.toHaveBeenCalledWith('sessions/s1', expect.objectContaining({
    'shipResources.aegis.fuel': expect.any(Number),
  }));
});

it('keeps the server-selected blind destination out of a failed fuel-shortage reply', async () => {
  mock.fuel = 1;
  mock.randomInt.mockReturnValue(1);

  const reply = await jumpShip.run(request({ ...data, requestId: 'blind-fuel-shortage', blind: true }));

  expect(reply).toMatchObject({ status: 'fuel-shortage', origin: '0000' });
  expect(reply).not.toHaveProperty('destination');
  expect(mock.set).toHaveBeenCalledWith('sessions/s1/jumpFailures/blind-fuel-shortage',
    expect.objectContaining({ destination: '1413', failureStatus: 'fuel-shortage' }));
});

it.each([
  ['short', '5143', 10],
  ['medium', '9997', 15],
  ['long', '6931', 20],
] as const)('awards the charged Icebreaker Ram Scoop output after a %s jump', async (length, destination, ore) => {
  mock.icebreakerCharges = ['jump-drive', 'ram-scoop'];
  mock.grantedShipId = 'icebreaker';

  await expect(jumpShip.run(request({
    sessionId: 's1', instanceId: 'bridge', shipId: 'icebreaker',
    requestId: `ram-scoop-${length}`, destination,
  }))).resolves.toMatchObject({ status: 'jumped', length, ramScoopOreGain: ore, remainingOre: ore });

  expect(mock.update).toHaveBeenCalledWith('sessions/s1', expect.objectContaining({
    'shipResources.icebreaker.ore': ore,
  }));
  expect(mock.update).toHaveBeenCalledWith('sessions/s1', expect.objectContaining({
    'shipResources.icebreaker.fuel': expect.any(Number),
  }));
});

it('adds the server-owned Ram Scoop upgrade bonus to the successful jump award', async () => {
  mock.icebreakerCharges = ['jump-drive', 'ram-scoop'];
  mock.upgrades = { icebreaker: ['ram-scoop'] };
  mock.grantedShipId = 'icebreaker';

  await jumpShip.run(request({
    sessionId: 's1', instanceId: 'bridge', shipId: 'icebreaker',
    requestId: 'ram-scoop-upgraded', destination: '5143',
  })).then((reply) => expect(reply).toMatchObject({ ramScoopOreGain: 15, remainingOre: 15 }));

  expect(mock.update).toHaveBeenCalledWith('sessions/s1', expect.objectContaining({
    'shipResources.icebreaker.ore': 15,
  }));
});

it.each([
  ['uncharged', ['jump-drive'], {}],
  ['damaged', ['jump-drive', 'ram-scoop'], { icebreaker: { damagedSystemIds: ['ram-scoop'], destroyed: false } }],
] as const)('does not award Ram Scoop ore when the console is %s', async (_label, charges, damage) => {
  mock.icebreakerCharges = [...charges];
  mock.damage = damage;
  mock.grantedShipId = 'icebreaker';

  await expect(jumpShip.run(request({
    sessionId: 's1', instanceId: 'bridge', shipId: 'icebreaker',
    requestId: `ram-scoop-denied-${_label}`, destination: '5143',
  }))).resolves.toMatchObject({ status: 'jumped' });

  expect(mock.update).not.toHaveBeenCalledWith('sessions/s1', expect.objectContaining({
    'shipResources.icebreaker.ore': expect.any(Number),
  }));
});

it('rejects facilitator adjudication after fuel changes and performs no jump or damage work', async () => {
  mock.fuel = 2;
  mock.jumpStates = { aegis: { lastFailureRequestId: 'changed-failure' } };
  mock.jumpFailures = {
    'changed-failure': {
      type: 'ship-jump-failure', status: 'unresolved', adjudicable: true,
      requestId: 'changed-failure', shipId: 'aegis', origin: '0000', destination: '9997',
      failureStatus: 'fuel-shortage', failureRevision: 0, currentTurn: 1, fuelAtFailure: 1,
      requiredFuel: 3,
    },
  };

  await expect(adjudicateFailedJump.run(request({
    sessionId: 's1', instanceId: 'bridge', requestId: 'stale-underfuel',
    expectedRevision: 0, failureRequestId: 'changed-failure', destination: '9997',
  }))).resolves.toMatchObject({ status: 'stale', shipId: 'aegis', currentRevision: 0 });
  expect(mock.update).not.toHaveBeenCalled();
  expect(mock.randomInt).not.toHaveBeenCalled();
});

it('denies jump-failure adjudication to a player before drawing damage', async () => {
  mock.role = 'player';
  await expect(adjudicateFailedJump.run(request({
    sessionId: 's1', instanceId: 'bridge', requestId: 'unauthorized-adjudication',
    expectedRevision: 0, failureRequestId: 'missing-failure', destination: '5143',
  }))).rejects.toMatchObject({ code: 'permission-denied' });
  expect(mock.update).not.toHaveBeenCalled();
  expect(mock.randomInt).not.toHaveBeenCalled();
});

it('denies a player operating a different ship even with a valid printed destination', async () => {
  mock.role = 'player';
  mock.get.mockImplementation(async (path: string) => {
    if (path === 'sessions/s1/wolfAttackState/current') {
      return { exists: false, data: () => undefined, get: () => undefined };
    }
    if (path.includes('/players/')) {
      return { exists: true, get: (key: string) => ({ role: 'player', connected: true, activeConsoleRoleId: 'dione-captain' } as Record<string, unknown>)[key] };
    }
    return { exists: true, get: (key: string) => key === 'activeRoleIds' ? undefined : undefined };
  });

  await expect(jumpShip.run(request({ ...data, destination: '5143' }))).rejects.toMatchObject({
    code: 'permission-denied',
  });
  expect(mock.update).not.toHaveBeenCalled();
  expect(mock.randomInt).not.toHaveBeenCalled();
});

for (const craftId of ['warrior', 'capybara-small'] as const) {
  it(`blocks a core host from carrying mission-bound ${craftId} through a jump`, async () => {
    mock.smallShipStates = { [craftId]: emptySmallShipState(craftId, 'aegis') };
    mock.missionCraftCommitments = { [craftId]: { missionId: 'mission-1', sourceCycle: 1 } };
    await expect(jumpShip.run(request({ ...data, destination: '1413' }))).rejects.toThrow(/committed.*away mission/i);
    expect(mock.update).not.toHaveBeenCalled();
    expect(mock.set).not.toHaveBeenCalled();
    expect(mock.randomInt).not.toHaveBeenCalled();
  });
}
