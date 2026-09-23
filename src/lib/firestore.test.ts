import { expect, it, vi } from 'vitest';
import { recommendedRoleIds } from '@/data/rolePresets';
import { activeFleetShipIds } from '@/data/roles';
import { useSessionStore } from '@/store/useSessionStore';
import type { GameSession, SessionEvent } from '@/types/game';
import { projectShipState } from './shipStateProjection';
import { MAINTENANCE_EVENT_ACTIONS as CLIENT_MAINTENANCE_EVENT_ACTIONS, MAINTENANCE_EVENT_RESULT_STEPS as CLIENT_MAINTENANCE_EVENT_RESULT_STEPS } from './maintenanceEvent';
import { MAINTENANCE_EVENT_ACTIONS as SERVER_MAINTENANCE_EVENT_ACTIONS, MAINTENANCE_EVENT_RESULT_STEPS as SERVER_MAINTENANCE_EVENT_RESULT_STEPS } from '../../functions/src/maintenanceEvent';

vi.mock('firebase/firestore', () => ({
  collection: vi.fn(),
  connectFirestoreEmulator: vi.fn(),
  doc: vi.fn(),
  getFirestore: vi.fn(),
  onSnapshot: vi.fn(),
  orderBy: vi.fn(),
  limit: vi.fn(),
  query: vi.fn(),
  where: vi.fn(),
}));
vi.mock('firebase/functions', () => ({ httpsCallable: vi.fn() }));
vi.mock('./firebase', () => ({ app: vi.fn(), functions: vi.fn() }));
vi.mock('./firebaseConfig', () => ({
  emulatorPorts: { firestore: 8080 },
  useEmulators: false,
}));

const {
  acceptCallableSessionAuthority,
  sessionFrom,
  sessionSnapshotAuthorityFor,
  subscribeGmInstances,
  subscribeConnectedPlayers,
  subscribeShuttleDeparture,
  subscribeIntelligenceInvestigation,
  subscribeDamageDraws,
  subscribeLoyaltyCensus,
  subscribeGmWolfActionReceipt,
  subscribeGmWolfSuspicionHistory,
  subscribeGmWolfClueDisclosure,
  subscribeGmWolfCultIntelligence,
  subscribeGmWolfAttackPreparation,
  subscribeGmWolfAttackState,
  subscribeGmWolfAttackWindow,
  subscribeGmWolfAssignment,
  subscribeGmFacilitatorRuleCall,
  subscribeGmZealotryResponse,
  subscribeGmCivilUnrestResolution,
  subscribeSessionEvents,
  subscribeSessionState,
} = await import('./firestore');
const { onSnapshot, where } = await import('firebase/firestore');
const { httpsCallable } = await import('firebase/functions');

function mockGmInstanceProjection(instances: readonly Record<string, unknown>[]) {
  vi.mocked(httpsCallable).mockReturnValue((() => Promise.resolve({ data: { instances } })) as never);
}

function sessionData(playerCount: number) {
  return {
    name: 'Table one',
    joinCode: `${4000 + playerCount}`,
    phase: 'lobby',
    currentTurn: 0,
    playerCount,
    activeRoleIds: recommendedRoleIds(playerCount),
    ownerUid: 'u1',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

it('hydrates only canonical shuttle-control entries from the member session projection', () => {
  const session = sessionFrom('s1', {
    ...sessionData(8),
    shuttleControl: {
      starlight: {
        shuttleId: 'starlight', ownerRoleId: 'wing-commander', ownerUid: 'owner',
        holderUid: 'holder', revision: 2,
      },
      endeavour: {
        shuttleId: 'endeavour', ownerRoleId: 'shepherd-captain', ownerUid: 'owner',
        holderUid: 'holder', revision: 0, forged: true,
      },
      unknown: {
        shuttleId: 'unknown', ownerRoleId: 'admiral', ownerUid: 'owner',
        holderUid: 'holder', revision: 0,
      },
    },
  });
  expect(session.shuttleControl).toEqual({
    starlight: {
      shuttleId: 'starlight', ownerRoleId: 'wing-commander', ownerUid: 'owner',
      holderUid: 'holder', revision: 2,
    },
  });
});

it('hydrates only a safe Boa recycling cycle ledger', () => {
  expect(sessionFrom('boa-recycling', {
    ...sessionData(20), boaRecycling: { cycle: 3, revision: 4, exchangesThisCycle: 2 },
  }).boaRecycling).toEqual({ cycle: 3, revision: 4, exchangesThisCycle: 2 });
  expect(sessionFrom('legacy-boa-recycling', sessionData(20)).boaRecycling)
    .toEqual({ cycle: 0, revision: 0, exchangesThisCycle: 0 });
  expect(sessionFrom('malformed-boa-recycling', {
    ...sessionData(20), boaRecycling: { cycle: 3, revision: 4, exchangesThisCycle: 3 },
  }).boaRecycling).toBeNull();
  expect(sessionFrom('malformed-boa-cargo', {
    ...sessionData(20), shuttleCargo: { boa: { food: 1 } },
  }).boaRecycling).toBeNull();
  expect(sessionFrom('unsafe-boa-cargo', {
    ...sessionData(20), shuttleCargo: { boa: { scrap: -1 } },
  }).boaRecycling).toBeNull();
});

it('hydrates only canonical per-shuttle evacuation accounting', () => {
  const session = sessionFrom('s1', {
    ...sessionData(8),
    shuttleEvacuations: {
      hummingbird: { cycle: 3, moved: 2_000, revision: 4 },
      starlight: { cycle: 3, moved: 5_001, revision: 1 },
      endeavour: { cycle: 3, moved: 1_000, revision: 1, forged: true },
      unknown: { cycle: 3, moved: 1_000, revision: 1 },
    },
  });
  expect(session.shuttleEvacuations).toEqual({
    hummingbird: { cycle: 3, moved: 2_000, revision: 4 },
  });
});

it('hydrates only canonical service-shuttle recharge accounting', () => {
  const session = sessionFrom('s1', {
    ...sessionData(8),
    serviceShuttleRecharges: {
      condor: { cycle: 3, hostShipId: 'quellon', consoleId: 'hydroponics', revision: 2 },
      wobbly: { cycle: 3, hostShipId: 'unknown', consoleId: 'reactor', revision: 1 },
      'black-sheep': {
        cycle: 3, hostShipId: 'shepherd', consoleId: 'sensors', revision: 1, forged: true,
      },
      starlight: { cycle: 3, hostShipId: 'aegis', consoleId: 'sensors', revision: 1 },
    },
  });
  expect(session.serviceShuttleRecharges).toEqual({
    condor: { cycle: 3, hostShipId: 'quellon', consoleId: 'hydroponics', revision: 2 },
  });
});

it('hydrates only internally consistent Highwall mining results', () => {
  const valid = sessionFrom('highwall', {
    ...sessionData(8),
    highwallMining: {
      cycle: 2, revision: 2,
      operations: [
        { requestId: 'one', resource: 'materials', rolls: [4], amount: 4 },
        { requestId: 'two', resource: 'ore', rolls: [2, 3, 5], amount: 10 },
      ],
    },
  });
  expect(valid.highwallMining).toMatchObject({ cycle: 2, revision: 2 });
  expect(sessionFrom('bad-highwall', {
    ...sessionData(8),
    highwallMining: {
      cycle: 2, revision: 1,
      operations: [{ requestId: 'one', resource: 'ore', rolls: [2, 3, 5], amount: 11 }],
    },
  }).highwallMining).toBeUndefined();
  expect(sessionFrom('duplicate-highwall', {
    ...sessionData(8),
    highwallMining: {
      cycle: 2, revision: 2,
      operations: [
        { requestId: 'same', resource: 'materials', rolls: [2], amount: 2 },
        { requestId: 'same', resource: 'materials', rolls: [3], amount: 3 },
      ],
    },
  }).highwallMining).toBeUndefined();
});

it('hydrates only a canonical private fleet-group vessel tuple', () => {
  const callbacks: Array<(snapshot: ReturnType<typeof sessionSnapshot>) => void> = [];
  vi.mocked(onSnapshot).mockImplementation((...args: unknown[]) => {
    callbacks.push(args[1] as (snapshot: ReturnType<typeof sessionSnapshot>) => void);
    return vi.fn();
  });
  const onPlayerDiscovery = vi.fn();
  subscribeSessionState('s1', 'u1', {
    onSession: vi.fn(), onPlayer: vi.fn(), onKicked: vi.fn(), onSeats: vi.fn(), onError: vi.fn(),
    onPlayerDiscovery,
  });
  callbacks[2]?.({
    metadata: { fromCache: false }, exists: () => true,
    data: () => ({
      groupId: 'fleet-1', shipId: 'quellon', fleetGroupVesselIds: ['quellon', 'capybara'],
      currentCoordinate: '0000', knownCoordinates: ['0000'],
      knownSystems: { 'system-01': '0000' }, pursuitDistance: 0, navigationLogs: [], revision: 1,
    }),
  } as never);
  expect(onPlayerDiscovery).toHaveBeenCalledWith(expect.objectContaining({
    groupId: 'fleet-1', fleetGroupVesselIds: ['quellon', 'capybara'],
  }));
});

it('hydrates retained shuttle custody without resurrecting its destroyed-host docking', () => {
  const session = sessionFrom('retained-shuttle', {
    ...sessionData(20),
    activeVesselIds: ['aegis', 'dione', 'icebreaker', 'shepherd', 'quellon', 'refinery-124'],
    shuttleDockings: [
      { shuttleId: 'starlight', shipId: 'aegis', dockedAt: 'SESSION START' },
    ],
    retainedShuttles: {
      'snn-press-shuttle': {
        status: 'retained', shuttleId: 'snn-press-shuttle', ownerRoleId: 'press-officer',
        holderUid: 'press', destroyedHostShipId: 'dione', controlRevision: 1,
        retainedAt: '2026-09-21T09:30:00.000Z',
      },
      forged: {
        status: 'retained', shuttleId: 'forged', ownerRoleId: 'press-officer',
        holderUid: 'press', destroyedHostShipId: 'dione', controlRevision: 1,
        retainedAt: '2026-09-21T09:30:00.000Z',
      },
    },
  });
  expect(session.retainedShuttles).toEqual({
    'snn-press-shuttle': {
      status: 'retained', shuttleId: 'snn-press-shuttle', ownerRoleId: 'press-officer',
      holderUid: 'press', destroyedHostShipId: 'dione', controlRevision: 1,
      retainedAt: '2026-09-21T09:30:00.000Z',
    },
  });
  expect(session.shuttleDockings?.some((docking) =>
    docking.shuttleId === 'snn-press-shuttle')).toBe(false);
});

it('hydrates only canonical quarantine docking state with communications allowed', () => {
  const session = sessionFrom('quarantine', {
    ...sessionData(8),
    quarantineDocking: {
      type: 'quarantine-docking', status: 'active', crisisId: 'outbreak-1',
      crisisRevision: 2, revision: 3, affectedShipIds: ['aegis'], communications: 'allowed',
      acceptedByShip: {
        aegis: {
          shipId: 'aegis', shuttleId: 'starlight', cycle: 2,
          requestId: 'dock-1', acceptedAt: '2026-09-21T12:00:00.000Z',
        },
      },
    },
  });
  expect(session.quarantineDocking).toMatchObject({
    status: 'active', communications: 'allowed',
    acceptedByShip: { aegis: { shuttleId: 'starlight', cycle: 2 } },
  });
  expect(sessionFrom('bad-quarantine', {
    ...sessionData(8),
    quarantineDocking: {
      type: 'quarantine-docking', status: 'active', crisisId: 'outbreak-1',
      crisisRevision: 2, revision: 3, affectedShipIds: ['aegis'],
      acceptedByShip: {}, communications: 'blocked',
    },
  }).quarantineDocking).toBeUndefined();
});

it('hydrates only a canonical group-audienced shuttle departure document', () => {
  const valid = {
    status: 'requested', requestId: 'departure-1', shuttleId: 'starlight',
    holderUid: 'holder', fleetGroupId: 'fleet-1', originShipId: 'aegis',
    destinationShipId: 'icebreaker', cycle: 2, controlRevision: 4,
    requestedAt: '2026-01-01T00:10:00.000Z',
  } as const;
  const callbacks: Array<(snapshot: unknown) => void> = [];
  vi.mocked(onSnapshot).mockImplementation(((_reference: unknown, _options: unknown, callback: unknown) => {
    callbacks.push(callback as (snapshot: unknown) => void);
    return vi.fn();
  }) as never);
  const onDeparture = vi.fn();
  subscribeShuttleDeparture('s1', 'starlight', onDeparture);
  callbacks[0]?.({
    metadata: { fromCache: false }, exists: () => true, data: () => valid,
  });
  callbacks[0]?.({
    metadata: { fromCache: false }, exists: () => true,
    data: () => ({ ...valid, unexpected: true }),
  });

  expect(onDeparture.mock.calls).toEqual([[valid], [null]]);
});

it('hydrates a canonical group-private shuttle transit document', () => {
  const valid = {
    status: 'in-transit', requestId: 'departure-1', transitRequestId: 'transit-1',
    shuttleId: 'starlight', holderUid: 'holder', fleetGroupId: 'fleet-1',
    originShipId: 'aegis', destinationShipId: 'icebreaker', cycle: 2, controlRevision: 4,
    requestedAt: '2026-01-01T00:10:00.000Z', revision: 1,
    originDepartedAt: '2026-01-01T00:10:01.000Z',
    routeLegs: [{ fromShipId: 'aegis', toShipId: 'icebreaker',
      originPosition: { x: 0, y: 0, z: 0 }, destinationPosition: { x: 0.26, y: -0.12, z: 0.28 },
      departedAt: '2026-01-01T00:10:01.000Z', arrivesAt: '2026-01-01T00:11:01.000Z' }],
    originPosition: { x: 0, y: 0, z: 0 }, currentPosition: { x: 0, y: 0, z: 0 },
    destinationPosition: { x: 0.26, y: -0.12, z: 0.28 },
    velocity: { x: 0.26 / 60, y: -0.12 / 60, z: 0.28 / 60 },
    departedAt: '2026-01-01T00:10:01.000Z', arrivesAt: '2026-01-01T00:11:01.000Z',
  } as const;
  const publicValid = Object.fromEntries(Object.entries(valid).filter(([key]) =>
    !['originShipId', 'originDepartedAt', 'routeLegs', 'originPosition'].includes(key)));
  const callbacks: Array<(snapshot: unknown) => void> = [];
  vi.mocked(onSnapshot).mockImplementation(((_reference: unknown, _options: unknown, callback: unknown) => {
    callbacks.push(callback as (snapshot: unknown) => void);
    return vi.fn();
  }) as never);
  const onDeparture = vi.fn();
  subscribeShuttleDeparture('s1', 'starlight', onDeparture);
  callbacks[0]?.({ metadata: { fromCache: false }, exists: () => true, data: () => publicValid });
  expect(onDeparture).toHaveBeenCalledWith(publicValid);
  callbacks[0]?.({ metadata: { fromCache: false }, exists: () => true, data: () => valid });
  expect(onDeparture).toHaveBeenLastCalledWith(null);
});

it('hydrates a server-retargeted current leg without exposing immutable history', () => {
  const valid = {
    status: 'in-transit', requestId: 'departure-1', transitRequestId: 'transit-1',
    shuttleId: 'starlight', holderUid: 'holder', fleetGroupId: 'fleet-1',
    originShipId: 'aegis', destinationShipId: 'dione', cycle: 2, controlRevision: 4,
    requestedAt: '2026-01-01T00:10:00.000Z', revision: 2,
    originDepartedAt: '2026-01-01T00:10:01.000Z',
    routeLegs: [
      { fromShipId: 'aegis', toShipId: 'icebreaker',
        originPosition: { x: 0, y: 0, z: 0 }, destinationPosition: { x: 0.26, y: -0.12, z: 0.28 },
        departedAt: '2026-01-01T00:10:01.000Z', arrivesAt: '2026-01-01T00:11:01.000Z' },
      { fromShipId: 'icebreaker', toShipId: 'dione',
        originPosition: { x: 0.13, y: -0.06, z: 0.14 }, destinationPosition: { x: -0.32, y: 0.18, z: 0.22 },
        departedAt: '2026-01-01T00:10:31.000Z', arrivesAt: '2026-01-01T00:11:31.000Z' },
    ],
    originPosition: { x: 0, y: 0, z: 0 }, currentPosition: { x: 0.13, y: -0.06, z: 0.14 },
    destinationPosition: { x: -0.32, y: 0.18, z: 0.22 },
    velocity: { x: -0.0075, y: 0.004, z: 0.0013333333333333333 },
    departedAt: '2026-01-01T00:10:31.000Z', arrivesAt: '2026-01-01T00:11:31.000Z',
  } as const;
  const publicValid = Object.fromEntries(Object.entries(valid).filter(([key]) =>
    !['originShipId', 'originDepartedAt', 'routeLegs', 'originPosition'].includes(key)));
  const callbacks: Array<(snapshot: unknown) => void> = [];
  vi.mocked(onSnapshot).mockImplementation(((_reference: unknown, _options: unknown, callback: unknown) => {
    callbacks.push(callback as (snapshot: unknown) => void);
    return vi.fn();
  }) as never);
  const onDeparture = vi.fn();
  subscribeShuttleDeparture('s1', 'starlight', onDeparture);
  callbacks[0]?.({ metadata: { fromCache: false }, exists: () => true, data: () => publicValid });
  expect(onDeparture).toHaveBeenCalledWith(publicValid);
  callbacks[0]?.({ metadata: { fromCache: false }, exists: () => true, data: () => ({
    ...publicValid,
    currentPosition: { x: 0.9, y: 0.9, z: 0.9 },
    velocity: { x: (-0.32 - 0.9) / 60, y: (0.18 - 0.9) / 60, z: (0.22 - 0.9) / 60 },
  }) });
  expect(onDeparture).toHaveBeenLastCalledWith(expect.objectContaining({
    currentPosition: { x: 0.9, y: 0.9, z: 0.9 },
  }));
  callbacks[0]?.({ metadata: { fromCache: false }, exists: () => true, data: () => ({
    ...publicValid,
    requestedAt: '2026-01-01T00:10:01.001Z',
  }) });
  expect(onDeparture).toHaveBeenLastCalledWith(expect.objectContaining({
    requestedAt: '2026-01-01T00:10:01.001Z',
  }));
  callbacks[0]?.({ metadata: { fromCache: false }, exists: () => true, data: () => ({
    ...publicValid,
    routeLegs: valid.routeLegs,
  }) });
  expect(onDeparture).toHaveBeenLastCalledWith(null);
});

it.each([
  [8, 'aegis'],
  [11, 'aegis'],
  [12, 'dione'],
  [18, 'dione'],
  [19, 'dione'],
  [20, 'dione'],
] as const)('hydrates the persisted %i-player SNN host from Firestore data', (playerCount, shipId) => {
  const session = sessionFrom(`s-${playerCount}`, sessionData(playerCount));

  expect(session.shuttleDockings).toEqual(expect.arrayContaining([
    expect.objectContaining({ shuttleId: 'snn-press-shuttle', shipId }),
  ]));
});

it('projects Press occupancy as a public boolean without exposing its holder', () => {
  const session = sessionFrom('press-occupancy', {
    ...sessionData(8),
    pressEnabled: true,
    pressHolderUid: 'private-holder-uid',
  });

  expect(session.pressClaimed).toBe(true);
  expect(session).not.toHaveProperty('pressHolderUid');
});

it('hydrates only a valid privacy-safe pursuit failure outcome', () => {
  const outcome = {
    type: 'game-outcome' as const,
    result: 'failure' as const,
    cause: 'pursuit-limit' as const,
    cycle: 3,
    navigationRevision: 9,
    occurredAt: '2026-09-06T12:20:07.000Z',
  };
  expect(sessionFrom('pursuit-failure', {
    ...sessionData(8), phase: 'failure', currentTurn: 3, gameOutcome: outcome,
  }).gameOutcome).toEqual(outcome);
  expect(sessionFrom('malformed-pursuit-failure', {
    ...sessionData(8), phase: 'failure', currentTurn: 3,
    gameOutcome: { ...outcome, groupId: 'private-group', navigationRevision: '9' },
  }).gameOutcome).toBeUndefined();
});

it('hydrates a privacy-safe total fleet loss without hiding retained craft state', () => {
  const outcome = {
    type: 'game-outcome' as const,
    result: 'failure' as const,
    cause: 'total-fleet-loss' as const,
    cycle: 0,
    occurredAt: '2026-09-20T14:30:00.000Z',
  };
  const session = sessionFrom('total-fleet-loss', {
    ...sessionData(8), phase: 'failure', currentTurn: 0, gameOutcome: outcome,
    shuttleCargo: { starlight: { food: 2 } },
    smallShipStates: { gorgoneion: { id: 'gorgoneion', hostShipId: 'aegis', dockingRevision: 2, population: 1_000, unrest: 1, cycle: { step: 1, revision: 3, results: { '1': 'Rations applied.' }, charges: [], turn: 1 } } },
  });
  expect(session.gameOutcome).toEqual(outcome);
  expect(session.shuttleCargo).toEqual({ starlight: { food: 2 } });
  expect(session.smallShipStates?.gorgoneion).toMatchObject({
    id: 'gorgoneion', hostShipId: 'aegis', dockingRevision: 2, population: 1_000,
  });
  expect(sessionFrom('malformed-total-fleet-loss', {
    ...sessionData(8), phase: 'failure', currentTurn: 0,
    gameOutcome: { ...outcome, destroyedShipIds: ['aegis'] },
  }).gameOutcome).toBeUndefined();
});

it('hydrates only an internally consistent privacy-safe survivor outcome', () => {
  const outcome = {
    type: 'survivor-outcome' as const,
    cycle: 6,
    occurredAt: '2026-09-20T18:00:00.000Z',
    fleetShipPopulation: 27_000,
    survivingShipPopulation: 2_000,
    evacuatedPopulation: 16_000,
    escapePodCapacity: 16_000,
    lostPopulation: 9_000,
    smallVesselPopulation: 900,
    admittedVesselPopulation: 39_995,
    finalSurvivors: 58_895,
    survivingShipIds: ['aegis'],
    lostOrDestroyedShipIds: ['dione'],
  };
  expect(sessionFrom('survivor-outcome', {
    ...sessionData(8), phase: 'failure', survivorOutcome: outcome,
  }).survivorOutcome).toEqual(outcome);
  expect(sessionFrom('malformed-survivor-outcome', {
    ...sessionData(8), phase: 'failure',
    survivorOutcome: { ...outcome, finalSurvivors: 999_999, privatePlayerUids: ['secret'] },
  }).survivorOutcome).toBeUndefined();
  expect(sessionFrom('contradictory-pod-outcome', {
    ...sessionData(8), phase: 'failure',
    survivorOutcome: {
      ...outcome,
      fleetShipPopulation: 2_000,
      survivingShipPopulation: 2_000,
      evacuatedPopulation: 0,
      escapePodCapacity: 3_100,
      lostPopulation: 0,
      smallVesselPopulation: 0,
      admittedVesselPopulation: 0,
      finalSurvivors: 2_000,
      survivingShipIds: ['aegis'],
      lostOrDestroyedShipIds: [],
    },
  }).survivorOutcome).toBeUndefined();
});

it('keeps typed entity IDs stable at the session snapshot boundary', () => {
  const session = sessionFrom('typed-session', {
    ...sessionData(8),
    activeVesselIds: ['aegis', 'icebreaker'],
    shipNavigationLogs: {
      aegis: [{
        id: 'jump-1', shipId: 'aegis', type: 'self-jump', origin: '0000', destination: '0001',
        occurredAt: 'TURN 1', stardate: '2026.001.0000',
      }],
    },
    shuttleDockings: [{ shuttleId: 'starlight', shipId: 'aegis', dockedAt: 'TURN 1' }],
    shuttleVisitLog: [{
      id: 'visit-1', shuttleId: 'starlight', shipId: 'aegis', action: 'docked', occurredAt: 'TURN 1',
    }],
  });

  expect(session.id).toBe('typed-session');
  expect(session.activeRoleIds?.[0]).toBe('admiral');
  expect(session.activeVesselIds).toEqual(['aegis', 'icebreaker']);
  expect(session.shipNavigationLogs).toBeUndefined();
  expect(session.shuttleDockings?.[0]).toMatchObject({ shuttleId: 'starlight', shipId: 'aegis' });
  expect(session.shuttleVisitLog?.[0]).toMatchObject({ id: 'visit-1', shuttleId: 'starlight', shipId: 'aegis' });
});

it('hydrates only valid optional small-ship state and keeps host linkage explicit', () => {
  const session = sessionFrom('small-ship-state-session', {
    ...sessionData(8),
    activeVesselIds: ['aegis'],
    smallShipStates: {
      gorgoneion: {
        id: 'gorgoneion', hostShipId: 'aegis', dockingRevision: 2,
        population: 1_000, unrest: 1,
        cycle: {
          step: 1, revision: 3, results: { '1': 'Rations applied.' }, charges: [],
          turn: 1, rationBonus: 6, startedAt: '2026-01-01T00:00:00.000Z',
        },
      },
      warrior: {
        id: 'warrior', hostShipId: 'aegis', dockingRevision: 1,
        population: 'spoofed', unrest: 0,
        cycle: { step: 0, revision: 0, results: {}, charges: [] },
      },
    },
  });
  expect(session.smallShipStates?.gorgoneion).toMatchObject({
    id: 'gorgoneion', hostShipId: 'aegis', dockingRevision: 2,
    population: 1_000, cycle: { step: 1, revision: 3, turn: 1 },
  });
  expect(session.smallShipStates?.warrior).toBeUndefined();
});

it('hydrates admitted Voyage 33-0 as a public vessel identity without widening the core roster', () => {
  const session = sessionFrom('voyage-admission-session', {
    ...sessionData(8),
    activeVesselIds: ['aegis'],
    admittedVesselIds: ['voyage-33-0', 'unsupported-vessel', 'voyage-33-0'],
    voyage33Admission: {
      type: 'voyage-admission', sessionId: 'voyage-admission-session', id: 'voyage-33-0', status: 'admitted',
      crisisId: 'approach-1', crisisRevision: 3, population: 40_000, unrest: 0, hostShipId: null,
      commitments: { requiresHostDocking: true, hostProvidesResources: true, maintenanceSteps: [1, 2, 3, 4], maxConsoleCharges: 1 },
    },
    voyage33Maintenance: {
      id: 'voyage-33-0', hostShipId: 'aegis', dockingRevision: 1, population: 40_000, unrest: 0,
      cycle: { step: 4, revision: 4, results: { '1': 'funded' }, charges: ['voyage-reactor'], turn: 1 },
    },
  });
  expect(session.admittedVesselIds).toEqual(['voyage-33-0']);
  expect(session.voyage33Admission).toMatchObject({ id: 'voyage-33-0', population: 40_000, hostShipId: null });
  expect(session.voyage33Maintenance).toMatchObject({ id: 'voyage-33-0', hostShipId: 'aegis', population: 40_000, cycle: { step: 4, charges: ['voyage-reactor'] } });
  expect(session.activeVesselIds).toEqual(['aegis']);

  const malformed = sessionFrom('malformed-voyage-admission-session', {
    ...sessionData(8),
    admittedVesselIds: ['voyage-33-0'],
    voyage33Admission: {
      type: 'voyage-admission', sessionId: 'malformed-voyage-admission-session', id: 'voyage-33-0', status: 'admitted',
      crisisId: 'approach-1', crisisRevision: 3, population: 39_000, unrest: 0, hostShipId: null,
      commitments: { requiresHostDocking: true, hostProvidesResources: true, maintenanceSteps: [1, 2, 3, 4], maxConsoleCharges: 1 },
    },
  });
  expect(malformed.voyage33Admission).toBeUndefined();
  expect(malformed.admittedVesselIds).toEqual([]);
});

it('hydrates the complete turn entity only when its server fields are valid', () => {
  const session = sessionFrom('turn-state-session', {
    ...sessionData(8),
    currentTurn: 2,
    turnLimit: 7,
    turnPhase: {
      turn: 2,
      teamPhaseEndsAt: '2026-01-01T00:05:00.000Z',
      openAirspaceEndsAt: '2026-01-01T00:20:00.000Z',
      airspace: { state: 'lifted', tickerActive: true, pressAccess: false },
    },
    turnState: {
      currentTurn: 2,
      maxTurn: 7,
      phase: 'coordination',
      phaseRevision: 4,
      startedAt: '2026-01-01T00:05:00.000Z',
      endsAt: '2026-01-01T00:20:00.000Z',
    },
  });
  expect(session.turnState).toEqual({
    currentTurn: 2,
    maxTurn: 7,
    phase: 'coordination',
    phaseRevision: 4,
    startedAt: '2026-01-01T00:05:00.000Z',
    endsAt: '2026-01-01T00:20:00.000Z',
  });
  expect(sessionFrom('malformed-turn-state-session', {
    ...sessionData(8),
    currentTurn: 2,
    turnLimit: 7,
    turnPhase: {
      turn: 2,
      teamPhaseEndsAt: '2026-01-01T00:05:00.000Z',
      openAirspaceEndsAt: '2026-01-01T00:20:00.000Z',
      airspace: { state: 'lifted', tickerActive: true, pressAccess: false },
    },
    turnState: { currentTurn: 1, maxTurn: 7, phase: 'team' },
  }).turnState).toBeUndefined();
  expect(sessionFrom('mismatched-turn-state-session', {
    ...sessionData(8),
    currentTurn: 2,
    turnLimit: 7,
    turnPhase: {
      turn: 2,
      teamPhaseEndsAt: '2026-01-01T00:05:00.000Z',
      openAirspaceEndsAt: '2026-01-01T00:20:00.000Z',
      airspace: { state: 'lifted', tickerActive: true, pressAccess: false },
    },
    turnState: {
      currentTurn: 2,
      maxTurn: 8,
      phase: 'coordination',
      phaseRevision: 2,
      startedAt: '2026-01-01T00:05:00.000Z',
      endsAt: '2026-01-01T00:20:00.000Z',
    },
  }).turnState).toBeUndefined();
});

it('removes hidden state nested in public and crew projections while preserving operations', () => {
  const session = sessionFrom('redaction-session', {
    ...sessionData(8),
    activeVesselIds: ['aegis'],
    confettiUsedShipIds: ['aegis', { candidateBonus: 4 }],
    shuttleDockings: [{
      shuttleId: 'starlight', shipId: 'aegis', dockedAt: 'SESSION START', facilitatorNote: 'hidden',
    }, {
      shuttleId: 'wolfAssignment', shipId: 'aegis', dockedAt: 'SESSION START',
    }, {
      shuttleId: 'starlight', shipId: 'wolfAssignment', dockedAt: 'SESSION START',
    }],
    shuttleVisitLog: [{
      id: 'starlight-initial-aegis-docking', shuttleId: 'starlight', shipId: 'aegis',
      action: 'docked', occurredAt: 'SESSION START', deckOrder: ['5d'],
    }, {
      id: 'secret-visit', shuttleId: 'wolfAssignment', shipId: 'aegis',
      action: 'docked', occurredAt: 'SESSION START', wolfAssignment: 'hidden',
    }, {
      id: 'secret-host', shuttleId: 'starlight', shipId: 'wolfAssignment',
      action: 'docked', occurredAt: 'SESSION START',
    }],
    pursuitGroups: { fleet: 2, 'fleet-2': 4, candidateBonus: 4, overflowing: 11 },
    fleetRedAlert: { active: true, revision: 2, candidateBonus: 3 },
    shipGalacticCoordinates: { aegis: '0011', facilitatorNote: 'hidden adjudication' },
    maintenanceCycles: {
      aegis: {
        step: 2,
        revision: 4,
        results: { '1': 'Storage intact.' },
        charges: ['jump-drive'],
        refuelled: [],
        facilitatorNotes: 'keep this private',
      },
    },
    shuttleCargo: {
      starlight: { food: 3, privateCard: 'hidden-card', candidateBonus: 4 },
    },
    shipDamage: {
      aegis: { damagedSystemIds: ['storage'], destroyed: false, deckOrder: ['5d'] },
    },
    shipUpgrades: {
      aegis: ['storage', { candidateBonus: 2 }],
    },
    shipSurvivors: { aegis: 2_000, notes: 4 },
    unrestAlerts: {
      aegis: {
        shipId: 'aegis', shipName: 'AEGIS', targetGmInstanceIds: ['bridge'],
        createdAt: 'TURN 1', facilitatorNote: 'hidden',
      },
    },
    populationAlerts: {
      aegis: {
        shipId: 'aegis', shipName: 'AEGIS', targetGmInstanceIds: ['bridge'],
        population: 1, createdAt: 'TURN 1', loyalty: 'hidden',
      },
    },
    facilitatorNotes: { aegis: 'hidden adjudication' },
  });

  expect(session.maintenanceCycles?.aegis).toMatchObject({
    step: 2,
    revision: 4,
    results: { '1': 'Storage intact.' },
  });
  expect(session.shuttleCargo?.starlight).toEqual({ food: 3 });
  expect(session.shipDamage?.aegis).toEqual({ damagedSystemIds: ['storage'], destroyed: false });
  expect(session.shipUpgrades?.aegis).toEqual(['storage']);
  expect(session.shipGalacticCoordinates).toBeUndefined();
  expect(session.pursuitGroups).toBeUndefined();
  expect(session.confettiUsedShipIds).toEqual(['aegis']);
  expect(session.shuttleDockings).toEqual(expect.arrayContaining([
    expect.objectContaining({ shuttleId: 'starlight', shipId: 'aegis', dockedAt: 'SESSION START' }),
  ]));
  expect(session.shuttleDockings).not.toEqual(expect.arrayContaining([
    expect.objectContaining({ shuttleId: 'wolfAssignment' }),
    expect.objectContaining({ shipId: 'wolfAssignment' }),
  ]));
  expect(session.shuttleVisitLog).toEqual(expect.arrayContaining([
    expect.objectContaining({ id: 'starlight-initial-aegis-docking', shuttleId: 'starlight' }),
  ]));
  expect(session.shuttleVisitLog).not.toEqual(expect.arrayContaining([
    expect.objectContaining({ shuttleId: 'wolfAssignment' }),
    expect.objectContaining({ shipId: 'wolfAssignment' }),
  ]));
  expect(session.unrestAlerts?.aegis).toEqual({
    shipId: 'aegis', shipName: 'AEGIS', targetGmInstanceIds: ['bridge'], createdAt: 'TURN 1',
  });
  expect(session.populationAlerts?.aegis).toEqual({
    shipId: 'aegis', shipName: 'AEGIS', targetGmInstanceIds: ['bridge'], population: 1, createdAt: 'TURN 1',
  });
  expect(session).not.toHaveProperty('facilitatorNotes');

  const crewProjection = projectShipState(session, 'aegis');
  expect(crewProjection).toMatchObject({
    shipId: 'aegis',
    galacticCoordinate: '0000',
    maintenanceCycle: { step: 2, revision: 4 },
    damage: { damagedSystemIds: ['storage'], destroyed: false },
  });
  expect(crewProjection).not.toHaveProperty('facilitatorNotes');
});

it('hydrates only bounded Blacksmith repair history', () => {
  expect(sessionFrom('blacksmith-history', {
    ...sessionData(8),
    blacksmithRepairs: {
      cycle: 3, revision: 2,
      hosts: [
        { shipId: 'icebreaker', systemIds: ['reactor', 'storage'] },
        { shipId: 'dione', systemIds: ['jump-drive'] },
      ],
    },
  }).blacksmithRepairs).toEqual({
    cycle: 3, revision: 2,
    hosts: [
      { shipId: 'icebreaker', systemIds: ['reactor', 'storage'] },
      { shipId: 'dione', systemIds: ['jump-drive'] },
    ],
  });
  expect(sessionFrom('bad-blacksmith-history', {
    ...sessionData(8),
    blacksmithRepairs: {
      cycle: 3, revision: 2,
      hosts: [{ shipId: 'icebreaker', systemIds: ['reactor', 'reactor'] }],
    },
  }).blacksmithRepairs).toBeUndefined();
});

it('hydrates only bounded Macaw repair history', () => {
  expect(sessionFrom('macaw-history', {
    ...sessionData(8),
    macawRepairs: {
      cycle: 3, revision: 2,
      hosts: [
        { shipId: 'capybara', systemIds: ['reactor', 'storage'] },
        { shipId: 'aegis', systemIds: ['jump-drive', 'fighter-bay-alpha'] },
      ],
    },
  }).macawRepairs).toEqual({
    cycle: 3, revision: 2,
    hosts: [
      { shipId: 'capybara', systemIds: ['reactor', 'storage'] },
      { shipId: 'aegis', systemIds: ['jump-drive', 'fighter-bay-alpha'] },
    ],
  });
  expect(sessionFrom('bad-macaw-history', {
    ...sessionData(8),
    macawRepairs: {
      cycle: 3, revision: 2,
      hosts: [{ shipId: 'capybara', systemIds: ['reactor', 'reactor'] }],
    },
  }).macawRepairs).toBeUndefined();
  expect(sessionFrom('bad-macaw-console-history', {
    ...sessionData(8),
    macawRepairs: {
      cycle: 3, revision: 2,
      hosts: [{ shipId: 'aegis', systemIds: ['not-a-console'] }],
    },
  }).macawRepairs).toBeUndefined();
});

it('hydrates only canonical Chacau damage-deck history', () => {
  expect(sessionFrom('chacau-history', {
    ...sessionData(8),
    chacauRepairs: {
      cycle: 3, revision: 2,
      hosts: [{ shipId: 'aegis', systemIds: ['fighter-bay-alpha'] }],
    },
  }).chacauRepairs).toEqual({
    cycle: 3, revision: 2,
    hosts: [{ shipId: 'aegis', systemIds: ['fighter-bay-alpha'] }],
  });
  expect(sessionFrom('bad-chacau-console-history', {
    ...sessionData(8),
    chacauRepairs: {
      cycle: 3, revision: 2,
      hosts: [{ shipId: 'aegis', systemIds: ['not-a-damage-card'] }],
    },
  }).chacauRepairs).toBeUndefined();
});

it('hydrates only canonical Ally damage-deck history', () => {
  expect(sessionFrom('ally-history', {
    ...sessionData(8),
    allyRepairs: {
      cycle: 3, revision: 2,
      hosts: [{ shipId: 'shepherd', systemIds: ['reactor', 'storage'] }],
    },
  }).allyRepairs).toEqual({
    cycle: 3, revision: 2,
    hosts: [{ shipId: 'shepherd', systemIds: ['reactor', 'storage'] }],
  });
  expect(sessionFrom('ally-aegis-history', {
    ...sessionData(8),
    allyRepairs: {
      cycle: 3, revision: 2,
      hosts: [{ shipId: 'aegis', systemIds: ['fighter-bay-alpha'] }],
    },
  }).allyRepairs).toBeUndefined();
  expect(sessionFrom('ally-unknown-console-history', {
    ...sessionData(8),
    allyRepairs: {
      cycle: 3, revision: 2,
      hosts: [{ shipId: 'icebreaker', systemIds: ['not-a-damage-card'] }],
    },
  }).allyRepairs).toBeUndefined();
});

it('does not carry malformed IDs from an untrusted session snapshot', () => {
  const session = sessionFrom('safe-session', {
    ...sessionData(8),
    activeRoleIds: ['admiral', 'roles/admiral'],
    activeVesselIds: ['aegis', 'vessels/aegis'],
    ownerUid: 'players/gm1',
    shipNavigationLogs: {
      aegis: [{
        id: 'jump-1', shipId: 'aegis', type: 'self-jump', origin: '0000', destination: '0001',
        occurredAt: 'TURN 1', stardate: '2026.001.0000',
      }, {
        id: 'events/jump-2', shipId: 'vessels/aegis', type: 'self-jump', origin: '0001', destination: '0002',
        occurredAt: 'TURN 2', stardate: '2026.002.0000',
      }],
    },
    unrestAlerts: {
      aegis: { shipId: 'ships/aegis', shipName: 'AEGIS', targetGmInstanceIds: [], createdAt: 'TURN 1' },
    },
    populationAlerts: {
      aegis: { shipId: 'ships/aegis', shipName: 'AEGIS', targetGmInstanceIds: [], population: 1, createdAt: 'TURN 1' },
    },
    shuttleDockings: [{ shuttleId: 'shuttles/starlight', shipId: 'aegis', dockedAt: 'TURN 1' }],
    shuttleVisitLog: [{
      id: 'events/visit-1', shuttleId: 'starlight', shipId: 'aegis', action: 'docked', occurredAt: 'TURN 1',
    }],
  });

  expect(session.activeRoleIds).toEqual([]);
  expect(session.activeVesselIds).toEqual([]);
  expect(session.ownerUid).toBeUndefined();
  expect(session.shipNavigationLogs).toBeUndefined();
  expect(session.unrestAlerts).toEqual({});
  expect(session.populationAlerts).toEqual({});
  expect(session.shuttleDockings).not.toEqual(expect.arrayContaining([
    expect.objectContaining({ shuttleId: 'shuttles/starlight' }),
  ]));
  expect(session.shuttleVisitLog).not.toEqual(expect.arrayContaining([
    expect.objectContaining({ id: 'events/visit-1' }),
  ]));
});

it('fails closed for malformed canonical vessels while preserving absent legacy fallback', () => {
  const malformedOnly = sessionFrom('malformed-vessels-only', {
    ...sessionData(20),
    activeVesselIds: ['vessels/aegis'],
  });
  const mixedMalformed = sessionFrom('mixed-malformed-vessels', {
    ...sessionData(20),
    activeVesselIds: ['aegis', 'vessels/capybara'],
  });
  const nonArray = sessionFrom('non-array-vessels', {
    ...sessionData(20),
    activeVesselIds: { capybara: true },
  });
  const legacyAbsent = sessionFrom('legacy-absent-vessels', sessionData(20));

  expect(malformedOnly.activeVesselIds).toEqual([]);
  expect(mixedMalformed.activeVesselIds).toEqual([]);
  expect(nonArray.activeVesselIds).toEqual([]);
  expect(legacyAbsent.activeVesselIds).toBeUndefined();
  expect(activeFleetShipIds(malformedOnly.activeRoleIds, malformedOnly.activeVesselIds)).toEqual([]);
  expect(activeFleetShipIds(mixedMalformed.activeRoleIds, mixedMalformed.activeVesselIds)).toEqual([]);
  expect(activeFleetShipIds(nonArray.activeRoleIds, nonArray.activeVesselIds)).toEqual([]);
  expect(activeFleetShipIds(legacyAbsent.activeRoleIds, legacyAbsent.activeVesselIds))
    .toContain('capybara');
});

it('adds missing legacy SNN state without replacing stored docking or visit history', () => {
  const oldDocking = {
    shuttleId: 'starlight', shipId: 'aegis', dockedAt: 'SESSION START',
  };
  const oldVisit = {
    id: 'starlight-initial-aegis-docking', shuttleId: 'starlight', shipId: 'aegis',
    action: 'docked', occurredAt: 'SESSION START',
  };
  const session = sessionFrom('legacy-11', {
    ...sessionData(11),
    shuttleDockings: [oldDocking],
    shuttleVisitLog: [oldVisit],
  });

  expect(session.shuttleDockings).toEqual(expect.arrayContaining([
    oldDocking,
    expect.objectContaining({ shuttleId: 'snn-press-shuttle', shipId: 'aegis' }),
  ]));
  expect(session.shuttleVisitLog).toEqual(expect.arrayContaining([
    oldVisit,
    expect.objectContaining({ shuttleId: 'snn-press-shuttle', shipId: 'aegis' }),
  ]));
});

it('preserves a valid nondefault SNN docking and visit history', () => {
  const storedDocking = {
    shuttleId: 'snn-press-shuttle', shipId: 'aegis', dockedAt: 'TURN 3',
  };
  const storedVisit = {
    id: 'snn-visit-3', shuttleId: 'snn-press-shuttle', shipId: 'aegis',
    action: 'docked', occurredAt: 'TURN 3',
  };
  const session = sessionFrom('legacy-visit', {
    ...sessionData(20),
    shuttleDockings: [storedDocking],
    shuttleVisitLog: [storedVisit],
  });

  expect(session.shuttleDockings).toEqual([storedDocking]);
  expect(session.shuttleVisitLog).toEqual([storedVisit]);
});

it('hydrates the canonical setup tuple and derived vessels for reconnect consumers', () => {
  const session = sessionFrom('canonical-setup', {
    ...sessionData(8),
    chartId: 'B',
    expansion: 'base',
    turnLimit: 7,
    dioneEnabled: true,
    capybaraEnabled: false,
    setupRevision: 3,
    setup: {
      playerCount: 8,
      chartId: 'B',
      expansion: 'base',
      turnLimit: 7,
      dioneEnabled: true,
      capybaraEnabled: false,
      activeRoleIds: sessionData(8).activeRoleIds,
      activeVesselIds: ['aegis', 'icebreaker', 'shepherd', 'quellon', 'refinery-124'],
    },
    activeVesselIds: ['aegis', 'icebreaker', 'shepherd', 'quellon', 'refinery-124'],
  }) as GameSession & {
    setup: { playerCount: number; chartId: string; expansion: string; turnLimit: number };
    activeVesselIds: readonly string[];
  };

  expect(session.setup).toMatchObject({
    playerCount: 8,
    chartId: 'B',
    expansion: 'base',
    turnLimit: 7,
  });
  expect(session.activeVesselIds).toEqual([
    'aegis', 'icebreaker', 'shepherd', 'quellon', 'refinery-124',
  ]);
});

it('projects normalized dual-lane GM responsibilities from the server projection', async () => {
  const onInstances = vi.fn();
  mockGmInstanceProjection([{
    id: 'bridge', sessionId: 's1', uid: 'gm1', name: 'Bridge', deviceLabel: 'Chrome',
    responsibilities: ['main', 'assistant'], responsibility: 'main',
    claimedAt: '2026-09-08T19:00:00.000Z',
  }]);
  vi.mocked(onSnapshot).mockImplementation(((_query: unknown, callback: unknown) => {
    (callback as (snapshot: unknown) => void)({
      docs: [{
        id: 'bridge',
        data: () => ({
          uid: 'gm1', name: 'Bridge', deviceLabel: 'Chrome',
          responsibilities: ['main', 'assistant'], responsibility: 'main',
          claimedAt: '2026-09-08T19:00:00.000Z',
        }),
      }],
    });
    return vi.fn();
  }) as never);

  const stop = subscribeGmInstances('s1', onInstances, vi.fn());
  await vi.waitFor(() => expect(onInstances).toHaveBeenCalled());

  expect(onInstances).toHaveBeenCalledWith([
    expect.objectContaining({
      id: 'bridge',
      responsibility: 'main',
      responsibilities: ['main', 'assistant'],
    }),
  ]);
  stop();
});

it('projects a sole legacy GM responsibility into both canonical lanes from the server projection', async () => {
  const onInstances = vi.fn();
  mockGmInstanceProjection([{
    id: 'bridge', sessionId: 's1', uid: 'gm1', name: 'Bridge', deviceLabel: 'Chrome',
    responsibilities: ['main', 'assistant'], responsibility: 'assistant',
    claimedAt: '2026-09-08T19:00:00.000Z',
  }]);
  vi.mocked(onSnapshot).mockImplementation(((_query: unknown, callback: unknown) => {
    (callback as (snapshot: unknown) => void)({
      docs: [{
        id: 'bridge',
        data: () => ({
          uid: 'gm1', name: 'Bridge', deviceLabel: 'Chrome',
          responsibility: 'assistant', claimedAt: '2026-09-08T19:00:00.000Z',
        }),
      }],
    });
    return vi.fn();
  }) as never);

  const stop = subscribeGmInstances('s1', onInstances, vi.fn());
  await vi.waitFor(() => expect(onInstances).toHaveBeenCalled());

  expect(onInstances).toHaveBeenCalledWith([
    expect.objectContaining({
      id: 'bridge',
      responsibility: 'assistant',
      responsibilities: ['main', 'assistant'],
    }),
  ]);
  stop();
});

it('parses and monotonically subscribes to the facilitator current rule call', () => {
  const onCall = vi.fn();
  vi.mocked(onSnapshot).mockImplementation(((_reference: unknown, callback: unknown) => {
    (callback as (snapshot: unknown) => void)({
      exists: () => true,
      data: () => ({
        type: 'facilitator-rule-call', sessionId: 's1', callId: 'call-1', revision: 2,
        ambiguity: 'Question', source: 'Reference', decision: 'Decision',
        audience: 'selected-player', recipientUid: 'u2', actorUid: 'gm1',
        createdAt: '2026-09-13T00:00:00.000Z', label: 'FACILITATOR RULE CALL',
      }),
      metadata: { fromCache: false },
    });
    (callback as (snapshot: unknown) => void)({
      exists: () => true,
      data: () => ({
        type: 'facilitator-rule-call', sessionId: 's1', callId: 'call-old', revision: 1,
        ambiguity: 'Old', source: 'Old', decision: 'Old',
        audience: 'gm-only', actorUid: 'gm1',
        createdAt: '2026-09-13T00:00:00.000Z', label: 'FACILITATOR RULE CALL',
      }),
      metadata: { fromCache: false },
    });
    return vi.fn();
  }) as never);

  const stop = subscribeGmFacilitatorRuleCall('s1', onCall);
  expect(onCall).toHaveBeenCalledTimes(1);
  expect(onCall).toHaveBeenCalledWith(expect.objectContaining({ callId: 'call-1', revision: 2 }));
  stop();
});

it('preserves valid facilitator timestamps and does not invent missing rule-call time', () => {
  const { callbacks } = captureSessionListener();
  const onCall = vi.fn();
  subscribeGmFacilitatorRuleCall('s1', onCall);
  const base = {
    type: 'facilitator-rule-call', sessionId: 's1', ambiguity: 'Question', source: 'Reference',
    decision: 'Decision', audience: 'gm-only', actorUid: 'gm1', label: 'FACILITATOR RULE CALL',
  };
  callbacks[0]?.({ exists: () => true, data: () => ({ ...base, callId: 'call-valid', revision: 1, createdAt: timestamp(1767225600, 0) }) });
  expect(onCall).toHaveBeenLastCalledWith(expect.objectContaining({
    callId: 'call-valid', createdAt: '2026-01-01T00:00:00.000Z',
  }));
  callbacks[0]?.({ exists: () => true, data: () => ({ ...base, callId: 'call-missing', revision: 2 }) });
  expect(onCall.mock.lastCall?.[0]).not.toHaveProperty('createdAt');
  callbacks[0]?.({ exists: () => true, data: () => ({ ...base, callId: 'call-invalid', revision: 3, createdAt: '2026-02-30T00:00:00.000Z' }) });
  expect(onCall.mock.lastCall?.[0]).not.toHaveProperty('createdAt');
  callbacks[0]?.({ exists: () => true, data: () => ({
    ...base, callId: 'call-malformed', revision: 4, createdAt: { toDate: () => { throw new Error('malformed timestamp'); } },
  }) });
  expect(onCall.mock.lastCall?.[0]).not.toHaveProperty('createdAt');
  callbacks[0]?.({ exists: () => true, data: () => ({
    ...base, callId: 'call-forged', revision: 5,
    createdAt: { toDate: () => ({ getTime: () => 0, toISOString: () => ({ forged: true }) }) },
  }) });
  expect(onCall.mock.lastCall?.[0]).not.toHaveProperty('createdAt');
});

it('drops malformed GM identities without throwing or leaving a stale projection', async () => {
  const { callbacks } = captureSessionListener();
  const onInstances = vi.fn();
  const onError = vi.fn();
  mockGmInstanceProjection([{
    id: 'good', sessionId: 's1', uid: 'gm2', name: 'Good', deviceLabel: 'Chrome',
    claimedAt: '2026-09-08T19:00:00.000Z',
  }]);
  const stop = subscribeGmInstances('s1', onInstances, onError);

  expect(() => callbacks[0]?.({
    metadata: { fromCache: false },
    docs: [{
      id: 'bad',
      data: () => ({ uid: 'players/gm1', name: 'Bad', deviceLabel: 'Chrome' }),
    }, {
      id: 'good',
      data: () => ({ uid: 'gm2', name: 'Good', deviceLabel: 'Chrome' }),
    }],
  })).not.toThrow();

  expect(onError).not.toHaveBeenCalled();
  await vi.waitFor(() => expect(onInstances).toHaveBeenCalled());
  expect(onInstances).toHaveBeenCalledWith([expect.objectContaining({ id: 'good', uid: 'gm2' })]);
  stop();
});

it('never publishes raw stale claims from the realtime collection', async () => {
  const { callbacks } = captureSessionListener();
  const onInstances = vi.fn();
  mockGmInstanceProjection([{
    id: 'live', sessionId: 's1', uid: 'gm1', name: 'Live', deviceLabel: 'Chrome',
    claimedAt: '2026-09-08T19:00:00.000Z',
  }]);
  const stop = subscribeGmInstances('s1', onInstances, vi.fn());

  callbacks[0]?.({
    metadata: { fromCache: false },
    docs: [{
      id: 'stale',
      data: () => ({ uid: 'gm2', connected: false, name: 'Stale', deviceLabel: 'Old tablet' }),
    }],
  });

  await vi.waitFor(() => expect(onInstances).toHaveBeenCalled());
  expect(onInstances).toHaveBeenLastCalledWith([
    expect.objectContaining({ id: 'live', uid: 'gm1' }),
  ]);
  expect(onInstances).not.toHaveBeenCalledWith([
    expect.objectContaining({ id: 'stale', uid: 'gm2' }),
  ]);
  stop();
});

it('hydrates stable seat role ids without treating Press as a core seat', () => {
  const onSeats = vi.fn();
  let snapshotNumber = 0;
  vi.mocked(onSnapshot).mockImplementation(((_reference: unknown, callback: unknown) => {
    snapshotNumber += 1;
    if (snapshotNumber === 3) {
      (callback as (snapshot: unknown) => void)({
        docs: [{
          id: 'admiral',
          data: () => ({
            roleId: 'admiral', label: 'AEGIS // Admiral', factionId: 'aegis',
            status: 'open', holderUid: null, claimedAt: null,
          }),
        }, {
          id: 'press-officer',
          data: () => ({
            roleId: 'press-officer', label: 'SNN // Press Officer', factionId: 'press',
            status: 'open', holderUid: null, claimedAt: null,
          }),
        }],
      });
    } else {
      (callback as (snapshot: unknown) => void)({
        exists: () => true,
        id: 's1',
        data: () => ({}),
        get: () => undefined,
      });
    }
    return vi.fn();
  }) as never);

  subscribeSessionState('s1', 'u1', {
    onSession: vi.fn(), onPlayer: vi.fn(), onKicked: vi.fn(), onSeats, onError: vi.fn(),
  });

  expect(onSeats).toHaveBeenCalledWith(expect.arrayContaining([
    expect.objectContaining({ id: 'admiral', label: 'AEGIS // Admiral', roleId: 'admiral' }),
  ]));
  expect(onSeats.mock.calls[0]?.[0]).not.toEqual(expect.arrayContaining([
    expect.objectContaining({ id: 'press-officer' }),
  ]));
});

it('hydrates only the current player loyalty and a GM-visible setup receipt after reconnect', () => {
  const onPrivateLoyalty = vi.fn();
  const onSetupReceipt = vi.fn();
  let listener = 0;
  vi.mocked(onSnapshot).mockImplementation(((_reference: unknown, callback: unknown) => {
    listener += 1;
    if (listener === 3) {
      (callback as (snapshot: unknown) => void)({ docs: [] });
    } else if (listener === 4) {
      (callback as (snapshot: unknown) => void)({
        exists: () => true,
        get: (field: string) => field === 'payload'
          ? { type: 'loyalty', kind: 'fleet-loyalist', suspicion: 5 }
          : undefined,
      });
    } else if (listener === 5) {
      (callback as (snapshot: unknown) => void)({
        docs: [{
          get: (field: string) => field === 'payload'
            ? {
              type: 'setup-receipt', source: 'routine-start', playerCount: 8,
              mode: 'base', rosterIds: ['admiral'], pressEligibility: {}, excludedGmCount: 1,
              wolfCount: 1, wolfRule: 'one-wolf-at-8-13', selectedWolfRoleIds: ['admiral'],
              eligibleRoleIds: ['admiral'], orderedModifiers: [], resultCount: 8,
              loyaltySource: 'automatic-default', request: {}, expectedSetupRevision: 0,
              committedSetupRevision: 1, actorUid: 'u1', serverTime: '2026-09-09T00:00:00.000Z',
              event: 'game-started',
            } : undefined,
        }],
      });
    } else {
      (callback as (snapshot: unknown) => void)({
        exists: () => true,
        id: 's1',
        data: () => ({}),
        get: () => undefined,
      });
    }
    return vi.fn();
  }) as never);

  subscribeSessionState('s1', 'u1', {
    onSession: vi.fn(), onPlayer: vi.fn(), onKicked: vi.fn(), onSeats: vi.fn(),
    onPrivateLoyalty, onSetupReceipt, onError: vi.fn(),
  });

  expect(onPrivateLoyalty).toHaveBeenCalledWith({ kind: 'fleet-loyalist', suspicion: 5 });
  expect(onSetupReceipt).toHaveBeenCalledWith(expect.objectContaining({
    source: 'routine-start', committedSetupRevision: 1,
  }));
});

it('hydrates the server-owned Android proof disclosure marker only for the current player', () => {
  const { callbacks } = captureSessionListener();
  const onPrivateLoyalty = vi.fn();
  subscribeSessionState('s1', 'u1', {
    onSession: vi.fn(), onPlayer: vi.fn(), onKicked: vi.fn(), onSeats: vi.fn(),
    onPrivateLoyalty, onError: vi.fn(),
  });

  callbacks[3]?.({
    metadata: { fromCache: false },
    exists: () => true,
    get: () => ({ type: 'loyalty', kind: 'android', suspicion: null, proofRevealed: true }),
  });

  expect(onPrivateLoyalty).toHaveBeenLastCalledWith({
    kind: 'android', suspicion: null, proofRevealed: true,
  });
});

it.each(['permission-denied', 'not-found'] as const)(
  'hydrates only the current Wolf Cult intelligence projection and clears it on terminal access loss (%s)',
  (code) => {
    const { callbacks, errors } = captureSessionListener();
    const onWolfCultIntelligence = vi.fn();
    subscribeSessionState('s1', 'u1', {
      onSession: vi.fn(), onPlayer: vi.fn(), onKicked: vi.fn(), onSeats: vi.fn(),
      onPrivateLoyalty: vi.fn(), onWolfCultIntelligence, onError: vi.fn(),
    });

    callbacks[4]?.({
      metadata: { fromCache: false },
      exists: () => true,
      data: () => ({
        type: 'wolf-cult-intelligence', sessionId: 's1', recipientUid: 'u1',
        visibleToUids: ['u1'], revision: 2,
        fortressCoordinate: '4454', suppliesCoordinate: '1964',
        agentUid: 'u3', codeWord: 'NIGHTFALL', label: 'WOLF INTEL',
      }),
    });
    expect(onWolfCultIntelligence).toHaveBeenLastCalledWith(expect.objectContaining({
      recipientUid: 'u1', fortressCoordinate: '4454', codeWord: 'NIGHTFALL',
    }));

    callbacks[4]?.({
      metadata: { fromCache: false },
      exists: () => true,
      data: () => ({
        type: 'wolf-cult-intelligence', sessionId: 's1', recipientUid: 'u1',
        visibleToUids: ['u1'], revision: 1,
        fortressCoordinate: '0000', suppliesCoordinate: '5143',
        agentUid: 'u3', codeWord: 'STALE', label: 'WOLF INTEL',
      }),
    });
    expect(onWolfCultIntelligence).toHaveBeenLastCalledWith(expect.objectContaining({
      revision: 2, codeWord: 'NIGHTFALL',
    }));

    errors[4]?.({ code });
    expect(onWolfCultIntelligence).toHaveBeenLastCalledWith(null);
    callbacks[4]?.({
      metadata: { fromCache: false }, exists: () => true,
      data: () => ({
        type: 'wolf-cult-intelligence', sessionId: 'other-session', recipientUid: 'u1',
        visibleToUids: ['u1'], revision: 2,
        fortressCoordinate: '4454', suppliesCoordinate: '1964',
        agentUid: 'u3', codeWord: 'STALE', label: 'WOLF INTEL',
      }),
    });
    expect(onWolfCultIntelligence).toHaveBeenLastCalledWith(null);
  },
);

it('rebinds a same-UID Wolf Cult listener after entitlement arrives and resets its revision floor', () => {
  const { callbacks, errors } = captureSessionListener();
  const onPrivateLoyalty = vi.fn();
  const onWolfCultIntelligence = vi.fn();
  subscribeSessionState('s1', 'u1', {
    onSession: vi.fn(), onPlayer: vi.fn(), onKicked: vi.fn(), onSeats: vi.fn(),
    onPrivateLoyalty, onWolfCultIntelligence, onError: vi.fn(),
  });

  // The initial listener is denied while the player is not yet a Cult holder.
  errors[4]?.({ code: 'permission-denied' });
  expect(onWolfCultIntelligence).toHaveBeenLastCalledWith(null);

  callbacks[3]?.({
    metadata: { fromCache: false },
    exists: () => true,
    get: () => ({ type: 'loyalty', kind: 'wolf-cult', suspicion: 6 }),
  });
  const rebound = callbacks[5];
  rebound?.({
    metadata: { fromCache: false },
    exists: () => true,
    data: () => ({
      type: 'wolf-cult-intelligence', sessionId: 's1', recipientUid: 'u1',
      visibleToUids: ['u1'], revision: 1,
      fortressCoordinate: '4454', suppliesCoordinate: '1964',
      agentUid: 'u3', codeWord: 'NIGHTFALL', label: 'WOLF INTEL',
    }),
  });
  expect(onWolfCultIntelligence).toHaveBeenLastCalledWith(expect.objectContaining({ revision: 1 }));

  callbacks[3]?.({
    metadata: { fromCache: false },
    exists: () => true,
    get: () => ({ type: 'loyalty', kind: 'fleet-loyalist', suspicion: 5 }),
  });
  expect(onWolfCultIntelligence).toHaveBeenLastCalledWith(null);
  rebound?.({
    metadata: { fromCache: false },
    exists: () => true,
    data: () => ({
      type: 'wolf-cult-intelligence', sessionId: 's1', recipientUid: 'u1',
      visibleToUids: ['u1'], revision: 1,
      fortressCoordinate: '4454', suppliesCoordinate: '1964',
      agentUid: 'u3', codeWord: 'STALE', label: 'WOLF INTEL',
    }),
  });
  expect(onWolfCultIntelligence).toHaveBeenLastCalledWith(null);
});

it('rebinds a same-UID Arbour listener after entitlement arrives and keeps former calls cleared', () => {
  const { callbacks, errors } = captureSessionListener();
  const onPrivateLoyalty = vi.fn();
  const onArbourVision = vi.fn();
  subscribeSessionState('s1', 'u1', {
    onSession: vi.fn(), onPlayer: vi.fn(), onKicked: vi.fn(), onSeats: vi.fn(),
    onPrivateLoyalty, onArbourVision, onError: vi.fn(),
  });

  errors[4]?.({ code: 'not-found' });
  callbacks[3]?.({
    metadata: { fromCache: false },
    exists: () => true,
    get: () => ({ type: 'loyalty', kind: 'universal-arbour', suspicion: 10 }),
  });
  callbacks[5]?.({
    metadata: { fromCache: false },
    exists: () => true,
    data: () => ({
      type: 'arbour-vision', sessionId: 's1', recipientUid: 'u1',
      visibleToUids: ['u1'], revision: 1, kind: 'location',
      text: 'The fleet can find safety at the blue system.', label: 'FACILITATOR CALL',
    }),
  });
  expect(onArbourVision).toHaveBeenLastCalledWith(expect.objectContaining({ revision: 1 }));

  callbacks[3]?.({
    metadata: { fromCache: false },
    exists: () => true,
    get: () => ({ type: 'loyalty', kind: 'fleet-loyalist', suspicion: 5 }),
  });
  expect(onArbourVision).toHaveBeenLastCalledWith(null);
});

it('rebinds a denied same-UID secret listener after the player projection changes', () => {
  const { callbacks, errors } = captureSessionListener();
  const onPrivateLoyalty = vi.fn();
  const onWolfCultIntelligence = vi.fn();
  subscribeSessionState('s1', 'u1', {
    onSession: vi.fn(), onPlayer: vi.fn(), onKicked: vi.fn(), onSeats: vi.fn(),
    onPrivateLoyalty, onWolfCultIntelligence, onError: vi.fn(),
  });

  errors[3]?.({ code: 'permission-denied' });
  expect(onPrivateLoyalty).toHaveBeenLastCalledWith(null);
  expect(onWolfCultIntelligence).toHaveBeenLastCalledWith(null);

  // The server's same-UID player update is the rebind point. The newly
  // attached secret listener can then receive the card and attach the
  // projection listener that had previously terminated.
  callbacks[1]?.({
    metadata: { fromCache: false },
    exists: () => true,
    get: (field: string) => field === 'connected' ? true : undefined,
    data: () => ({ role: 'player', assignedRoleId: 'admiral' }),
  });
  callbacks[5]?.({
    metadata: { fromCache: false },
    exists: () => true,
    get: () => ({ type: 'loyalty', kind: 'wolf-cult', suspicion: 6 }),
  });
  callbacks[6]?.({
    metadata: { fromCache: false },
    exists: () => true,
    data: () => ({
      type: 'wolf-cult-intelligence', sessionId: 's1', recipientUid: 'u1',
      visibleToUids: ['u1'], revision: 1,
      fortressCoordinate: '4454', suppliesCoordinate: '1964',
      agentUid: 'u3', codeWord: 'NIGHTFALL', label: 'WOLF INTEL',
    }),
  });
  expect(onPrivateLoyalty).toHaveBeenLastCalledWith({ kind: 'wolf-cult', suspicion: 6 });
  expect(onWolfCultIntelligence).toHaveBeenLastCalledWith(expect.objectContaining({ revision: 1 }));
});

it('rebinds the denied same-UID Arbour secret path and hydrates a fresh call', () => {
  const { callbacks, errors } = captureSessionListener();
  const onPrivateLoyalty = vi.fn();
  const onArbourVision = vi.fn();
  subscribeSessionState('s1', 'u1', {
    onSession: vi.fn(), onPlayer: vi.fn(), onKicked: vi.fn(), onSeats: vi.fn(),
    onPrivateLoyalty, onArbourVision, onError: vi.fn(),
  });

  errors[3]?.({ code: 'not-found' });
  callbacks[1]?.({
    metadata: { fromCache: false },
    exists: () => true,
    get: (field: string) => field === 'connected' ? true : undefined,
    data: () => ({ role: 'player', assignedRoleId: 'admiral' }),
  });
  callbacks[5]?.({
    metadata: { fromCache: false },
    exists: () => true,
    get: () => ({ type: 'loyalty', kind: 'universal-arbour', suspicion: 10 }),
  });
  callbacks[6]?.({
    metadata: { fromCache: false },
    exists: () => true,
    data: () => ({
      type: 'arbour-vision', sessionId: 's1', recipientUid: 'u1',
      visibleToUids: ['u1'], revision: 1, kind: 'danger',
      text: 'The outer relay is unsafe.', label: 'FACILITATOR CALL',
    }),
  });
  expect(onPrivateLoyalty).toHaveBeenLastCalledWith({ kind: 'universal-arbour', suspicion: 10 });
  expect(onArbourVision).toHaveBeenLastCalledWith(expect.objectContaining({ revision: 1 }));
});

it('drops Android proof markers from other or malformed loyalty records', () => {
  const { callbacks } = captureSessionListener();
  const onPrivateLoyalty = vi.fn();
  subscribeSessionState('s1', 'u1', {
    onSession: vi.fn(), onPlayer: vi.fn(), onKicked: vi.fn(), onSeats: vi.fn(),
    onPrivateLoyalty, onError: vi.fn(),
  });

  callbacks[3]?.({
    metadata: { fromCache: false },
    exists: () => true,
    get: () => ({ type: 'loyalty', kind: 'fleet-loyalist', suspicion: 5, proofRevealed: true }),
  });
  expect(onPrivateLoyalty).toHaveBeenLastCalledWith({ kind: 'fleet-loyalist', suspicion: 5 });

  callbacks[3]?.({
    metadata: { fromCache: false },
    exists: () => true,
    get: () => ({ type: 'loyalty', kind: 'android', suspicion: null, proofRevealed: false }),
  });
  expect(onPrivateLoyalty).toHaveBeenLastCalledWith(null);

  callbacks[3]?.({
    metadata: { fromCache: false },
    exists: () => true,
    get: () => ({ type: 'loyalty', kind: 'android', suspicion: null, proofRevealed: 'true' }),
  });
  expect(onPrivateLoyalty).toHaveBeenLastCalledWith(null);
  for (const payload of [
    { type: 'secret', kind: 'android', suspicion: null, proofRevealed: true },
    { kind: 'android', suspicion: null, proofRevealed: true },
    { type: 'loyalty', kind: 'android', suspicion: 5, proofRevealed: true },
    { type: 'loyalty', kind: 'android', suspicion: null, partnerUid: 'u2', proofRevealed: true },
  ]) {
    callbacks[3]?.({ metadata: { fromCache: false }, exists: () => true, get: () => payload });
    expect(onPrivateLoyalty).toHaveBeenLastCalledWith(null);
  }

});

it('hydrates only the current UID role brief and clears it when the assignment is invalidated', () => {
  const { callbacks } = captureSessionListener();
  const onPlayer = vi.fn();
  const onRoleBrief = vi.fn();
  const unsubscribe = subscribeSessionState('s1', 'u1', {
    onSession: vi.fn(), onPlayer, onKicked: vi.fn(), onSeats: vi.fn(),
    onRoleBrief, onError: vi.fn(),
  });

  callbacks[1]?.({
    exists: () => true,
    get: (field: string) => field === 'connected' ? true : undefined,
    data: () => ({ role: 'player', assignedRoleId: 'admiral' }),
  });
  callbacks[3]?.({
    metadata: { fromCache: false },
    exists: () => true,
    data: () => ({
      type: 'role-brief', sessionId: 's1', assignmentUid: 'u1', roleId: 'admiral',
      roleName: 'Admiral', vesselName: 'AEGIS', text: 'Coordinate the fleet.',
      commonRules: 'Keep this private.', ownedCraftIds: ['fighter-wing-alpha'], setupRevision: 2,
      voyage33Motivation: 'Support Voyage 33-0 privately.',
    }),
  });
  expect(onRoleBrief).toHaveBeenCalledWith(expect.objectContaining({
    assignmentUid: 'u1', roleId: 'admiral', ownedCraftIds: ['fighter-wing-alpha'], setupRevision: 2,
    voyage33Motivation: 'Support Voyage 33-0 privately.',
  }));

  callbacks[3]?.({
    metadata: { fromCache: false },
    exists: () => true,
    data: () => ({
      type: 'role-brief', sessionId: 's1', assignmentUid: 'u2', roleId: 'admiral',
      roleName: 'Admiral', vesselName: 'AEGIS', text: 'Foreign.',
      commonRules: 'Keep this private.', setupRevision: 2,
    }),
  });
  expect(onRoleBrief).toHaveBeenLastCalledWith(null);

  unsubscribe();
  expect(onRoleBrief).toHaveBeenLastCalledWith(null);
});

it('hydrates a reciprocal Friend role without exposing the partner UID to unrelated projections', () => {
  const { callbacks } = captureSessionListener();
  const onPrivateLoyalty = vi.fn();
  subscribeSessionState('s1', 'u1', {
    onSession: vi.fn(), onPlayer: vi.fn(), onKicked: vi.fn(), onSeats: vi.fn(),
    onPrivateLoyalty, onError: vi.fn(),
  });

  callbacks[3]?.({
    exists: () => true,
    get: () => ({
      type: 'loyalty', kind: 'friend', suspicion: 0,
      partnerUid: 'u2', partnerRoleId: 'admiral',
    }),
  });

  expect(onPrivateLoyalty).toHaveBeenCalledWith({
    kind: 'friend', suspicion: 0, partnerUid: 'u2', partnerRoleId: 'admiral',
  });
});

it('keeps legacy Friend cards incomplete without exposing a UID and rejects malformed tuples', () => {
  const { callbacks } = captureSessionListener();
  const onPrivateLoyalty = vi.fn();
  subscribeSessionState('s1', 'u1', {
    onSession: vi.fn(), onPlayer: vi.fn(), onKicked: vi.fn(), onSeats: vi.fn(),
    onPrivateLoyalty, onError: vi.fn(),
  });

  callbacks[3]?.({
    exists: () => true,
    get: () => ({ type: 'loyalty', kind: 'friend', suspicion: 0, partnerUid: 'u2' }),
  });
  expect(onPrivateLoyalty).toHaveBeenLastCalledWith({
    kind: 'friend', suspicion: 0, partnerUid: 'u2',
  });

  for (const payload of [
    { kind: 'friend', suspicion: 0, partnerUid: 'u2', partnerRoleId: 'admiral' },
    { type: 'loyalty', kind: 'friend', suspicion: 1, partnerUid: 'u2', partnerRoleId: 'admiral' },
    { type: 'loyalty', kind: 'friend', suspicion: 0, partnerUid: 'u1', partnerRoleId: 'admiral' },
    { type: 'loyalty', kind: 'friend', suspicion: 0, partnerUid: 'u2', partnerRoleId: 'unknown-role' },
  ]) {
    callbacks[3]?.({ exists: () => true, get: () => payload });
    expect(onPrivateLoyalty).toHaveBeenLastCalledWith(null);
  }
});

it.each(['permission-denied', 'not-found'])('clears a private Friend card on terminal secret access loss (%s)', (code) => {
  const { callbacks, errors } = captureSessionListener();
  const onPrivateLoyalty = vi.fn();
  const onError = vi.fn();
  subscribeSessionState('s1', 'u1', {
    onSession: vi.fn(), onPlayer: vi.fn(), onSeats: vi.fn(), onKicked: vi.fn(),
    onPrivateLoyalty, onError,
  });

  callbacks[3]?.({
    exists: () => true,
    get: () => ({ type: 'loyalty', kind: 'friend', suspicion: 0, partnerUid: 'u2', partnerRoleId: 'admiral' }),
  });
  errors[3]?.({ code });

  expect(onPrivateLoyalty).toHaveBeenLastCalledWith(null);
  expect(onError).not.toHaveBeenCalled();
});

it('hydrates the known facilitator census only from server authority and allowlists its fields', () => {
  const { callbacks } = captureSessionListener();
  const onLoyaltyCensus = vi.fn();
  subscribeLoyaltyCensus('s1', onLoyaltyCensus);

  callbacks[0]?.({
    metadata: { fromCache: true },
    exists: () => true,
    data: () => ({
      type: 'loyalty-census', revision: 7,
      entries: [{ uid: 'u2', kind: 'wolf-agent', suspicion: 10, notes: 'secret' }],
    }),
  });
  expect(onLoyaltyCensus).not.toHaveBeenCalled();

  callbacks[0]?.({
    metadata: { fromCache: false },
    exists: () => true,
    data: () => ({
      type: 'loyalty-census', revision: 7,
      entries: [{ uid: 'u2', kind: 'wolf-agent', suspicion: 10, notes: 'secret' }],
    }),
  });
  expect(onLoyaltyCensus).toHaveBeenCalledWith({
    revision: 7,
    entries: [{ uid: 'u2', kind: 'wolf-agent', suspicion: 10 }],
  });

  callbacks[0]?.({
    metadata: { fromCache: false },
    exists: () => true,
    data: () => ({ type: 'loyalty-census', revision: 8, entries: [{ uid: 'players/u2', kind: 'wolf-agent', suspicion: 10 }] }),
  });
  expect(onLoyaltyCensus).toHaveBeenLastCalledWith(null);
});

it('hydrates only canonical facilitator Wolf clue disclosures', () => {
  const { callbacks } = captureSessionListener();
  const onDisclosure = vi.fn();
  subscribeGmWolfClueDisclosure('s1', onDisclosure);

  callbacks[0]?.({
    metadata: { fromCache: false },
    exists: () => true,
    data: () => ({
      type: 'wolf-clue-disclosure', revision: 5, actorUid: 'u2',
      action: 'sabotage-supplies', cycle: 3, requestId: 'wolf-supply-1',
      oldSuspicion: 8, increment: 2, newSuspicion: 10,
      roll: 6, total: 16, clueTier: 'wolf-activity-hint',
      facilitatorInstruction: 'Point out the wolf activity, and give a hint.',
      hiddenExtra: 'discard me',
    }),
  });
  expect(onDisclosure).toHaveBeenCalledWith({
    revision: 5, actorUid: 'u2', action: 'sabotage-supplies', cycle: 3,
    requestId: 'wolf-supply-1', oldSuspicion: 8, increment: 2,
    newSuspicion: 10, roll: 6, total: 16,
    clueTier: 'wolf-activity-hint',
    facilitatorInstruction: 'Point out the wolf activity, and give a hint.',
  });

  callbacks[0]?.({
    metadata: { fromCache: false },
    exists: () => true,
    data: () => ({
      type: 'wolf-clue-disclosure', revision: 6, actorUid: 'u2',
      action: 'sabotage-supplies', cycle: 3, requestId: 'wolf-supply-2',
      oldSuspicion: 10, increment: 2, newSuspicion: 12,
      roll: 7, total: 19, clueTier: 'wolf-activity-hint',
      facilitatorInstruction: 'Point out the wolf activity, and give a hint.',
    }),
  });
  expect(onDisclosure).toHaveBeenLastCalledWith(null);
});

it('hydrates only canonical complete facilitator Wolf action receipts', () => {
  const { callbacks } = captureSessionListener();
  const onReceipt = vi.fn();
  subscribeGmWolfActionReceipt('s1', onReceipt);

  callbacks[0]?.({
    metadata: { fromCache: false },
    exists: () => true,
    data: () => ({
      type: 'wolf-action-receipt', status: 'committed', action: 'sabotage-supplies',
      projectionRevision: 5, sessionId: 's1', requestId: 'wolf-supply-1', cycle: 3, revision: 1,
      actorUid: 'u2', actorRoleId: 'dione-engineer', vesselId: 'philia',
      phase: 'active', idempotencyKey: 'wolf-supply-1',
      auditId: 'wolf-supply-sabotage-wolf-supply-1',
      resourceId: 'food', destroyedAmount: 2, remainingAmount: 3,
      oldSuspicion: 8, suspicionIncrement: 2, newSuspicion: 10,
      roll: 6, total: 16, clueTier: 'wolf-activity-hint',
      facilitatorInstruction: 'Point out the wolf activity, and give a hint.',
      hiddenExtra: 'discard me',
    }),
  });
  expect(onReceipt).toHaveBeenLastCalledWith(expect.objectContaining({
    type: 'wolf-action-receipt', actorUid: 'u2', vesselId: 'philia',
    destroyedAmount: 2, newSuspicion: 10, roll: 6, total: 16,
  }));
  expect(onReceipt.mock.calls.at(-1)?.[0]).not.toHaveProperty('hiddenExtra');

  callbacks[0]?.({
    metadata: { fromCache: false },
    exists: () => true,
    data: () => ({
      type: 'wolf-action-receipt', status: 'committed', action: 'sabotage-console',
      projectionRevision: 6, sessionId: 's1', requestId: 'wolf-console-1', cycle: 3, revision: 2,
      actorUid: 'u2', actorRoleId: 'dione-engineer', phase: 'active',
      idempotencyKey: 'wolf-console-1', auditId: 'wolf-console-sabotage-wolf-console-1',
      visitId: 'visit-1', targetShipId: 'aegis', targetSystemId: 'command-and-control',
      targetSystemName: 'Command and Control', mode: 'chosen',
      oldSuspicion: 10, suspicionIncrement: 4, newSuspicion: 14,
      roll: 1, total: 15, clueTier: 'wolf-activity',
      facilitatorInstruction: 'Point out the wolf activity to someone.',
    }),
  });
  expect(onReceipt).toHaveBeenLastCalledWith(expect.objectContaining({
    action: 'sabotage-console', visitId: 'visit-1', targetShipId: 'aegis',
    targetSystemId: 'command-and-control', targetSystemName: 'Command and Control',
    mode: 'chosen', suspicionIncrement: 4,
  }));

  callbacks[0]?.({
    metadata: { fromCache: false },
    exists: () => true,
    data: () => ({
      type: 'wolf-action-receipt', status: 'committed', action: 'sabotage-console',
      projectionRevision: 6, sessionId: 's1', requestId: 'wolf-console-armour', cycle: 3, revision: 2,
      actorUid: 'u2', actorRoleId: 'dione-engineer', phase: 'active',
      idempotencyKey: 'wolf-console-armour', auditId: 'wolf-console-sabotage-wolf-console-armour',
      visitId: 'visit-armour', targetShipId: 'aegis', targetSystemId: 'armoured-hull-i',
      targetSystemName: 'Armoured Hull I', mode: 'random',
      oldSuspicion: 10, suspicionIncrement: 2, newSuspicion: 12,
      roll: 1, total: 13, clueTier: 'wolf-activity',
      facilitatorInstruction: 'Point out the wolf activity to someone.',
    }),
  });
  expect(onReceipt).toHaveBeenLastCalledWith(null);

  callbacks[0]?.({
    metadata: { fromCache: false },
    exists: () => true,
    data: () => ({
      type: 'wolf-action-receipt', status: 'committed', action: 'provide-intel',
      projectionRevision: 6, sessionId: 's1', requestId: 'wolf-intel-1', cycle: 4, revision: 2,
      actorUid: 'u2', actorRoleId: 'dione-engineer', phase: 'active',
      idempotencyKey: 'wolf-intel-1', auditId: 'wolf-intelligence-wolf-intel-1',
      message: 'Relay quiet.', oldSuspicion: 8, suspicionIncrement: 3, newSuspicion: 11,
      roll: 1, total: 12, clueTier: 'wolf-activity',
      facilitatorInstruction: 'Point out the wolf activity to someone.',
    }),
  });
  expect(onReceipt).toHaveBeenLastCalledWith(expect.objectContaining({
    action: 'provide-intel', message: 'Relay quiet.', suspicionIncrement: 3,
    newSuspicion: 11, auditId: 'wolf-intelligence-wolf-intel-1',
  }));
  expect(onReceipt.mock.calls.at(-1)?.[0]).not.toHaveProperty('resourceId');

  callbacks[0]?.({
    metadata: { fromCache: false },
    exists: () => true,
    data: () => ({
      type: 'wolf-action-receipt', status: 'committed', action: 'homing-beacon',
      projectionRevision: 6, sessionId: 's1', requestId: 'wolf-beacon-1', cycle: 4, revision: 3,
      actorUid: 'u2', actorRoleId: 'dione-engineer', phase: 'active',
      idempotencyKey: 'wolf-beacon-1', auditId: 'wolf-homing-beacon-wolf-beacon-1',
      groupId: 'fleet-1', coordinate: '5143', dueCycle: 5,
      arrivalTiming: 'after-cycle-start', oldSuspicion: 11, suspicionIncrement: 5,
      newSuspicion: 16, roll: 1, total: 17, clueTier: 'wolf-activity-hint',
      facilitatorInstruction: 'Point out the wolf activity, and give a hint.',
    }),
  });
  expect(onReceipt).toHaveBeenLastCalledWith(expect.objectContaining({
    action: 'homing-beacon', groupId: 'fleet-1', coordinate: '5143',
    dueCycle: 5, arrivalTiming: 'after-cycle-start', suspicionIncrement: 5,
  }));
  expect(onReceipt.mock.calls.at(-1)?.[0]).not.toHaveProperty('message');

  callbacks[0]?.({
    metadata: { fromCache: false },
    exists: () => true,
    data: () => ({
      type: 'wolf-action-receipt', status: 'committed', action: 'homing-beacon',
      projectionRevision: 6, sessionId: 's1', requestId: 'wolf-beacon-unprinted', cycle: 4, revision: 4,
      actorUid: 'u2', actorRoleId: 'dione-engineer', phase: 'active',
      idempotencyKey: 'wolf-beacon-unprinted',
      auditId: 'wolf-homing-beacon-wolf-beacon-unprinted',
      groupId: 'fleet-1', coordinate: '1111', dueCycle: 5,
      arrivalTiming: 'after-cycle-start', oldSuspicion: 16, suspicionIncrement: 5,
      newSuspicion: 21, roll: 1, total: 22, clueTier: 'strong-hint',
      facilitatorInstruction: 'Give someone a strong hint.',
    }),
  });
  expect(onReceipt).toHaveBeenLastCalledWith(null);

  callbacks[0]?.({
    metadata: { fromCache: false },
    exists: () => true,
    data: () => ({
      type: 'wolf-action-receipt', status: 'committed', action: 'homing-beacon',
      projectionRevision: 6, sessionId: 's1', requestId: 'wolf-beacon-early', cycle: 4, revision: 4,
      actorUid: 'u2', actorRoleId: 'dione-engineer', phase: 'active',
      idempotencyKey: 'wolf-beacon-early', auditId: 'wolf-homing-beacon-wolf-beacon-early',
      groupId: 'fleet-1', coordinate: '5143', dueCycle: 5,
      arrivalTiming: 'at-cycle-start', oldSuspicion: 16, suspicionIncrement: 5,
      newSuspicion: 21, roll: 1, total: 22, clueTier: 'strong-hint',
      facilitatorInstruction: 'Give someone a strong hint.',
    }),
  });
  expect(onReceipt).toHaveBeenLastCalledWith(null);

  callbacks[0]?.({
    metadata: { fromCache: false },
    exists: () => true,
    data: () => ({
      type: 'wolf-action-receipt', status: 'committed', action: 'sabotage-supplies',
      projectionRevision: 6, sessionId: 's1', requestId: 'wolf-supply-tampered', cycle: 4, revision: 1,
      actorUid: 'u3', actorRoleId: 'admiral', vesselId: 'philia',
      phase: 'active', idempotencyKey: 'wolf-supply-tampered',
      auditId: 'wolf-supply-sabotage-wolf-supply-tampered',
      resourceId: 'food', destroyedAmount: 1, remainingAmount: 2,
      oldSuspicion: 0, suspicionIncrement: 2, newSuspicion: 2,
      roll: 1, total: 3, clueTier: 'none', facilitatorInstruction: 'Nothing.',
    }),
  });
  expect(onReceipt).toHaveBeenLastCalledWith(null);

  callbacks[0]?.({
    metadata: { fromCache: false },
    exists: () => true,
    data: () => ({
      type: 'wolf-action-receipt', status: 'committed', action: 'sabotage-supplies',
      projectionRevision: 6, sessionId: 's1', requestId: 'wolf-supply-2', cycle: 4, revision: 1,
      actorUid: 'u3', actorRoleId: 'dione-engineer', vesselId: 'philia',
      phase: 'active', idempotencyKey: 'wolf-supply-2',
      auditId: 'wolf-supply-sabotage-wolf-supply-2',
      resourceId: 'food', destroyedAmount: 1, remainingAmount: 2,
      oldSuspicion: 0, suspicionIncrement: 2, newSuspicion: 2,
      roll: 1, total: 3, clueTier: 'none', facilitatorInstruction: 'Nothing.',
    }),
  });
  expect(onReceipt).toHaveBeenLastCalledWith(expect.objectContaining({
    projectionRevision: 6, revision: 1, actorUid: 'u3',
  }));

  callbacks[0]?.({
    metadata: { fromCache: false },
    exists: () => true,
    data: () => ({
      type: 'wolf-action-receipt', status: 'committed', action: 'sabotage-supplies',
      projectionRevision: 7, sessionId: 's1', requestId: 'wolf-supply-3', cycle: 4, revision: 2,
      actorUid: 'u3', actorRoleId: 'dione-engineer', vesselId: 'philia',
      phase: 'active', idempotencyKey: 'wolf-supply-3',
      auditId: 'wolf-supply-sabotage-wolf-supply-3',
      resourceId: 'food', destroyedAmount: 1, remainingAmount: 1,
      oldSuspicion: 2, suspicionIncrement: 2, newSuspicion: 4,
      roll: 7, total: 11, clueTier: 'natural-change',
      facilitatorInstruction: 'Point the change out to someone, framed as natural or accidental.',
    }),
  });
  expect(onReceipt).toHaveBeenLastCalledWith(null);
});

it('hydrates only canonical durable Wolf suspicion history from server snapshots', () => {
  const { callbacks, unsubscribeSpies } = captureSessionListener();
  const onHistory = vi.fn();
  const stop = subscribeGmWolfSuspicionHistory('s1', onHistory);
  const valid = {
    type: 'wolf-suspicion-history', status: 'committed',
    action: 'sabotage-supplies', source: 'wolf-supply-sabotage',
    sessionId: 's1', requestId: 'wolf-supply-1', cycle: 3,
    actorUid: 'u2', actorRoleId: 'dione-engineer',
    oldSuspicion: 8, increment: 2, newSuspicion: 10,
    roll: 6, total: 16, clueTier: 'wolf-activity-hint',
    disclosure: 'Point out the wolf activity, and give a hint.',
    auditId: 'wolf-supply-sabotage-wolf-supply-1',
    createdAt: '2026-09-20T20:00:00.000Z', hiddenExtra: 'discard me',
  };
  const longRequestId = `wolf-supply-${'x'.repeat(100)}`;
  const intelligence = {
    ...valid,
    action: 'provide-intel', source: 'wolf-intelligence', requestId: 'wolf-intel-1',
    oldSuspicion: 8, increment: 3, newSuspicion: 11, roll: 1, total: 12,
    clueTier: 'wolf-activity', disclosure: 'Point out the wolf activity to someone.',
    auditId: 'wolf-intelligence-wolf-intel-1',
  };
  const beacon = {
    ...valid,
    action: 'homing-beacon', source: 'wolf-homing-beacon', requestId: 'wolf-beacon-1',
    oldSuspicion: 11, increment: 5, newSuspicion: 16, roll: 1, total: 17,
    clueTier: 'wolf-activity-hint',
    disclosure: 'Point out the wolf activity, and give a hint.',
    auditId: 'wolf-homing-beacon-wolf-beacon-1',
  };
  const consoleSabotage = {
    ...valid,
    action: 'sabotage-console', source: 'wolf-console-sabotage', requestId: 'wolf-console-1',
    visitId: 'visit-1', targetShipId: 'dione', targetSystemId: 'reactor',
    targetSystemName: 'Reactor', mode: 'random', oldSuspicion: 1, increment: 2,
    newSuspicion: 3, roll: 1, total: 4, clueTier: 'none', disclosure: 'Nothing.',
    auditId: 'wolf-console-sabotage-wolf-console-1',
  };
  callbacks[0]?.({
    metadata: { fromCache: true },
    docs: [{ data: () => valid }],
  });
  expect(onHistory).not.toHaveBeenCalled();
  callbacks[0]?.({
    metadata: { fromCache: false },
    docs: [{ data: () => consoleSabotage }],
  });
  expect(onHistory).toHaveBeenLastCalledWith([expect.objectContaining({
    action: 'sabotage-console', source: 'wolf-console-sabotage',
    targetShipId: 'dione', targetSystemId: 'reactor', mode: 'random', increment: 2,
  })]);
  callbacks[0]?.({
    metadata: { fromCache: false },
    docs: [
      { data: () => valid },
      { data: () => ({ ...valid, requestId: 'tampered', total: 17 }) },
      { data: () => ({
        ...valid,
        requestId: longRequestId,
        auditId: `wolf-supply-sabotage-${longRequestId}`,
      }) },
      { data: () => intelligence },
      { data: () => beacon },
    ],
  });
  expect(onHistory).toHaveBeenLastCalledWith([
    expect.objectContaining({ requestId: 'wolf-supply-1', oldSuspicion: 8, newSuspicion: 10 }),
    expect.objectContaining({ requestId: longRequestId }),
    expect.objectContaining({
      requestId: 'wolf-intel-1', source: 'wolf-intelligence', increment: 3, newSuspicion: 11,
    }),
    expect.objectContaining({
      requestId: 'wolf-beacon-1', source: 'wolf-homing-beacon', increment: 5,
      newSuspicion: 16,
    }),
  ]);
  expect(onHistory.mock.calls.at(-1)?.[0]?.[0]).not.toHaveProperty('hiddenExtra');
  stop();
  expect(unsubscribeSpies[0]).toHaveBeenCalledOnce();
  expect(onHistory).toHaveBeenLastCalledWith([]);
});

it('hydrates only a valid private Zealotry response and never exposes census identities', () => {
  const { callbacks } = captureSessionListener();
  const onResponse = vi.fn();
  const unsubscribe = subscribeGmZealotryResponse('s1', onResponse);

  callbacks[0]?.({
    metadata: { fromCache: false },
    exists: () => true,
    data: () => ({
      type: 'zealotry-response', sessionId: 's1', crisisId: 'zealotry-1',
      crisisRevision: 3, state: 'debated', revision: 2,
      actions: ['pressure', 'investigate'],
      customResponse: 'Keep the response informal.',
      rationale: 'Private context.', loyaltyCensusRevision: 9,
      actorUid: 'u1', updatedAt: timestamp(1767225600, 0), censusEntries: [{ uid: 'u2', kind: 'wolf-agent', suspicion: 10 }],
    }),
  });
  expect(onResponse).toHaveBeenCalledWith(expect.objectContaining({
    sessionId: 's1', crisisId: 'zealotry-1', crisisRevision: 3,
    revision: 2, actions: ['pressure', 'investigate'], loyaltyCensusRevision: 9,
  }));
  expect(onResponse.mock.lastCall?.[0]).toHaveProperty('updatedAt', '2026-01-01T00:00:00.000Z');
  expect(onResponse.mock.lastCall?.[0]).not.toHaveProperty('censusEntries');

  callbacks[0]?.({
    metadata: { fromCache: false }, exists: () => true,
    data: () => ({
      type: 'zealotry-response', sessionId: 's1', crisisId: 'zealotry-1',
      crisisRevision: 3, state: 'debated', revision: 3,
      actions: ['leave'], rationale: 'Valid replacement projection.', loyaltyCensusRevision: 9, updatedAt: 'not-a-timestamp',
    }),
  });
  expect(onResponse.mock.lastCall?.[0]).not.toHaveProperty('updatedAt');
  unsubscribe();
  expect(onResponse).toHaveBeenLastCalledWith(null);
});

it('resets the Zealotry response revision gate when a crisis projection is deleted', () => {
  const { callbacks } = captureSessionListener();
  const onResponse = vi.fn();
  subscribeGmZealotryResponse('s1', onResponse);

  callbacks[0]?.({
    metadata: { fromCache: false }, exists: () => true,
    data: () => ({
      type: 'zealotry-response', sessionId: 's1', crisisId: 'zealotry-a',
      crisisRevision: 3, state: 'debated', revision: 2,
      actions: ['pressure'], rationale: 'Crisis A.', loyaltyCensusRevision: null,
    }),
  });
  callbacks[0]?.({ metadata: { fromCache: false }, exists: () => false });
  callbacks[0]?.({
    metadata: { fromCache: false }, exists: () => true,
    data: () => ({
      type: 'zealotry-response', sessionId: 's1', crisisId: 'zealotry-b',
      crisisRevision: 1, state: 'debated', revision: 1,
      actions: ['investigate'], rationale: 'Crisis B.', loyaltyCensusRevision: null,
    }),
  });

  expect(onResponse).toHaveBeenNthCalledWith(1, expect.objectContaining({
    crisisId: 'zealotry-a', revision: 2,
  }));
  expect(onResponse).toHaveBeenNthCalledWith(2, null);
  expect(onResponse).toHaveBeenNthCalledWith(3, expect.objectContaining({
    crisisId: 'zealotry-b', revision: 1,
  }));
});

it('resets the Civil Unrest resolution revision gate when the current crisis is deleted', () => {
  const { callbacks } = captureSessionListener();
  const onResolution = vi.fn();
  subscribeGmCivilUnrestResolution('s1', onResolution);
  const base = {
    type: 'civil-unrest-resolution', sessionId: 's1', state: 'debated', crisisRevision: 3,
    revision: 2, presidentResponse: 'Facilitator-recorded response', consequence: 'No automatic change.',
    rationale: 'Private rationale.', recordedBy: 'facilitator',
    grievanceRevisions: [
      { shipId: 'dione', revision: null }, { shipId: 'icebreaker', revision: 1 },
      { shipId: 'shepherd', revision: null }, { shipId: 'quellon', revision: null }, { shipId: 'refinery-124', revision: null },
    ],
    updatedAt: timestamp(1767225600, 0),
  };
  callbacks[0]?.({ metadata: { fromCache: false }, exists: () => true, data: () => ({ ...base, crisisId: 'unrest-a' }) });
  callbacks[0]?.({ metadata: { fromCache: false }, exists: () => false });
  callbacks[0]?.({ metadata: { fromCache: false }, exists: () => true, data: () => ({ ...base, crisisId: 'unrest-b', crisisRevision: 1, revision: 1, updatedAt: 'not-a-timestamp' }) });
  expect(onResolution).toHaveBeenNthCalledWith(1, expect.objectContaining({ crisisId: 'unrest-a', revision: 2 }));
  expect(onResolution.mock.calls[0]?.[0]).toHaveProperty('updatedAt', '2026-01-01T00:00:00.000Z');
  expect(onResolution).toHaveBeenNthCalledWith(2, null);
  expect(onResolution).toHaveBeenNthCalledWith(3, expect.objectContaining({ crisisId: 'unrest-b', revision: 1 }));
  expect(onResolution.mock.calls[2]?.[0]).not.toHaveProperty('updatedAt');
});

it('does not let a delayed older census revision overwrite the newer server projection', () => {
  const { callbacks } = captureSessionListener();
  const onCensus = vi.fn();
  subscribeLoyaltyCensus('s1', onCensus);

  callbacks[0]?.({
    metadata: { fromCache: false },
    exists: () => true,
    data: () => ({
      type: 'loyalty-census', revision: 8,
      entries: [{ uid: 'u2', kind: 'wolf-agent', suspicion: 20 }],
    }),
  });
  callbacks[0]?.({
    metadata: { fromCache: false },
    exists: () => true,
    data: () => ({
      type: 'loyalty-census', revision: 7,
      entries: [{ uid: 'u3', kind: 'fleet-loyalist', suspicion: 1 }],
    }),
  });

  expect(onCensus).toHaveBeenCalledTimes(1);
  expect(onCensus).toHaveBeenLastCalledWith({
    revision: 8,
    entries: [{ uid: 'u2', kind: 'wolf-agent', suspicion: 20 }],
  });
});

it('keeps the GM Wolf Cult intelligence projection monotonic and clears terminal access loss', () => {
  const { callbacks, errors } = captureSessionListener();
  const onIntelligence = vi.fn();
  const unsubscribe = subscribeGmWolfCultIntelligence('s1', onIntelligence);

  callbacks[0]?.({
    metadata: { fromCache: false }, exists: () => true,
    data: () => ({
      type: 'wolf-cult-intelligences', sessionId: 's1', recipientUid: 'u2',
      visibleToUids: ['gm1'], revision: 2,
      fortressCoordinate: '4454', suppliesCoordinate: '1964',
      agentUid: 'u3', codeWord: 'NIGHTFALL', label: 'WOLF INTEL',
    }),
  });
  callbacks[0]?.({
    metadata: { fromCache: false }, exists: () => true,
    data: () => ({
      type: 'wolf-cult-intelligences', sessionId: 's1', recipientUid: 'u2',
      visibleToUids: ['gm1'], revision: 1,
      fortressCoordinate: '0000', suppliesCoordinate: '5143',
      agentUid: 'u3', codeWord: 'OLD', label: 'WOLF INTEL',
    }),
  });
  expect(onIntelligence).toHaveBeenCalledTimes(1);
  expect(onIntelligence).toHaveBeenLastCalledWith(expect.objectContaining({ revision: 2 }));
  errors[0]?.({ code: 'permission-denied' });
  expect(onIntelligence).toHaveBeenLastCalledWith(null);

  unsubscribe();
  expect(onIntelligence).toHaveBeenLastCalledWith(null);
});

it('hydrates only a canonical private Intelligence Agent investigation', () => {
  const { callbacks, errors } = captureSessionListener();
  const onInvestigation = vi.fn();
  const onError = vi.fn();
  const unsubscribe = subscribeIntelligenceInvestigation(
    's1', 'u1', onInvestigation, onError,
  );

  callbacks[0]?.({
    exists: () => true,
    data: () => ({
      type: 'intelligence-investigation', sessionId: 's1', requestId: 'investigate-1',
      cycle: 3, revision: 2, investigatorUid: 'u1', targetUid: 'u2',
      targetDisplayName: 'Target', reportedWolf: true, suspicion: 8, visibleToUids: ['u1'],
    }),
  });
  expect(onInvestigation).toHaveBeenLastCalledWith({
    type: 'intelligence-investigation', sessionId: 's1', requestId: 'investigate-1',
    cycle: 3, revision: 2, investigatorUid: 'u1', targetUid: 'u2',
    targetDisplayName: 'Target', reportedWolf: true, suspicion: 8,
  });

  callbacks[0]?.({
    exists: () => true,
    data: () => ({
      type: 'intelligence-investigation', sessionId: 's1', requestId: 'malformed-suspicion',
      cycle: 3, revision: 3, investigatorUid: 'u1', targetUid: 'u2',
      targetDisplayName: 'Target', reportedWolf: true, suspicion: 9, visibleToUids: ['u1'],
    }),
  });
  expect(onInvestigation).toHaveBeenLastCalledWith(null);

  callbacks[0]?.({
    exists: () => true,
    data: () => ({
      type: 'intelligence-investigation', sessionId: 's1', requestId: 'forged',
      cycle: 3, revision: 3, investigatorUid: 'u1', targetUid: 'u2',
      targetDisplayName: 'Target', reportedWolf: true, visibleToUids: ['u3'],
      actualWolf: true,
    }),
  });
  expect(onInvestigation).toHaveBeenLastCalledWith(null);

  errors[0]?.({ code: 'permission-denied' });
  expect(onInvestigation).toHaveBeenLastCalledWith(null);
  expect(onError).not.toHaveBeenCalled();
  unsubscribe();
});

it('hydrates the facilitator-only Wolf timing marker and rejects malformed state', () => {
  const { callbacks } = captureSessionListener();
  const onWindow = vi.fn();
  const unsubscribe = subscribeGmWolfAttackWindow('s1', onWindow);

  callbacks[0]?.({
    metadata: { fromCache: true },
    exists: () => true,
    data: () => ({ status: 'due', turn: 1, revision: 1 }),
  });
  expect(onWindow).not.toHaveBeenCalled();

  callbacks[0]?.({
    metadata: { fromCache: false },
    exists: () => true,
    data: () => ({ status: 'deferred', turn: 2, revision: 2, privateNote: 'omit' }),
  });
  expect(onWindow).toHaveBeenCalledWith({ status: 'deferred', turn: 2, revision: 2 });

  callbacks[0]?.({
    metadata: { fromCache: false },
    exists: () => true,
    data: () => ({ status: 'unknown', turn: 2, revision: 3 }),
  });
  expect(onWindow).toHaveBeenLastCalledWith(null);
  unsubscribe();
  expect(onWindow).toHaveBeenLastCalledWith(null);
});

it('hydrates the facilitator-only Wolf preparation and keeps revisions monotonic', () => {
  const { callbacks } = captureSessionListener();
  const onPreparation = vi.fn();
  const unsubscribe = subscribeGmWolfAttackPreparation('s1', onPreparation);

  callbacks[0]?.({
    metadata: { fromCache: true },
    exists: () => true,
    data: () => ({ revision: 1, turn: 1, shipIds: ['wolf-fighter-wing'], targetMode: 'manual',
      targetAssignments: [{ cardIndex: 0, targetShipId: 'aegis' }], modifiers: [], notes: 'private' }),
  });
  expect(onPreparation).not.toHaveBeenCalled();
  callbacks[0]?.({
    metadata: { fromCache: false },
    exists: () => true,
    data: () => ({ revision: 2, turn: 1, shipIds: ['wolf-fighter-wing'], targetMode: 'pre-rolled',
      targetAssignments: [{ cardIndex: 0, targetShipId: 'aegis' }], modifiers: ['aegis-command-and-control'], notes: 'private' }),
  });
  callbacks[0]?.({
    metadata: { fromCache: false },
    exists: () => true,
    data: () => ({ revision: 1, turn: 1, shipIds: ['wolf-fighter-wing'], targetMode: 'manual',
      targetAssignments: [], modifiers: [], notes: 'stale' }),
  });

  expect(onPreparation).toHaveBeenCalledTimes(1);
  expect(onPreparation).toHaveBeenLastCalledWith(expect.objectContaining({ revision: 2, targetMode: 'pre-rolled' }));
  unsubscribe();
  expect(onPreparation).toHaveBeenLastCalledWith(null);
});

it('hydrates only the safe GM declaration summary and keeps its revision monotonic', () => {
  const { callbacks } = captureSessionListener();
  const onState = vi.fn();
  const unsubscribe = subscribeGmWolfAttackState('s1', onState);

  callbacks[0]?.({
    metadata: { fromCache: true },
    exists: () => true,
    data: () => ({ status: 'declared', turn: 1, revision: 1, preparationRevision: 2,
      currentStep: 'targeting', deadlineAt: '2026-09-12T23:00:00.000Z', airspaceLocked: true,
      parkedCraftIds: ['starlight'], calculationReceipt: { hidden: true }, preparation: { notes: 'hidden' } }),
  });
  expect(onState).not.toHaveBeenCalled();
  callbacks[0]?.({
    metadata: { fromCache: false },
    exists: () => true,
    data: () => ({ status: 'declared', turn: 1, revision: 2, preparationRevision: 2,
      currentStep: 'targeting', deadlineAt: '2026-09-12T23:00:00.000Z', airspaceLocked: true,
      parkedCraftIds: ['starlight'], calculationReceipt: { hidden: true }, preparation: { notes: 'hidden' } }),
  });
  callbacks[0]?.({
    metadata: { fromCache: false },
    exists: () => true,
    data: () => ({ status: 'declared', turn: 1, revision: 1, preparationRevision: 2,
      currentStep: 'targeting', deadlineAt: '2026-09-12T23:00:00.000Z', airspaceLocked: true,
      parkedCraftIds: ['starlight'] }),
  });

  expect(onState).toHaveBeenCalledTimes(1);
  expect(onState).toHaveBeenLastCalledWith({
    status: 'declared', turn: 1, revision: 2, preparationRevision: 2,
    currentStep: 'targeting', deadlineAt: '2026-09-12T23:00:00.000Z',
    airspaceLocked: true, parkedCraftIds: ['starlight'], launchedCraftIds: [],
  });
  unsubscribe();
  expect(onState).toHaveBeenLastCalledWith(null);
});

it('does not let a delayed older Wolf timing revision overwrite the newer server marker', () => {
  const { callbacks } = captureSessionListener();
  const onWindow = vi.fn();
  subscribeGmWolfAttackWindow('s1', onWindow);

  callbacks[0]?.({
    metadata: { fromCache: false },
    exists: () => true,
    data: () => ({ status: 'deferred', turn: 2, revision: 2 }),
  });
  callbacks[0]?.({
    metadata: { fromCache: false },
    exists: () => true,
    data: () => ({ status: 'due', turn: 1, revision: 1 }),
  });

  expect(onWindow).toHaveBeenCalledTimes(1);
  expect(onWindow).toHaveBeenLastCalledWith({ status: 'deferred', turn: 2, revision: 2 });
});

it('allows equal revision updates, clears deletion, and resets ordering only on a new subscription', () => {
  const first = captureSessionListener();
  const onWindow = vi.fn();
  const unsubscribe = subscribeGmWolfAttackWindow('s1', onWindow);

  first.callbacks[0]?.({
    metadata: { fromCache: false },
    exists: () => true,
    data: () => ({ status: 'due', turn: 1, revision: 2 }),
  });
  first.callbacks[0]?.({
    metadata: { fromCache: false },
    exists: () => true,
    data: () => ({ status: 'resolved', turn: 1, revision: 2 }),
  });
  first.callbacks[0]?.({ exists: () => false });
  first.callbacks[0]?.({
    metadata: { fromCache: false },
    exists: () => true,
    data: () => ({ status: 'due', turn: 1, revision: 1 }),
  });
  first.callbacks[0]?.({
    metadata: { fromCache: false },
    exists: () => true,
    data: () => ({ status: 'deferred', turn: 2, revision: 3 }),
  });
  unsubscribe();

  const second = captureSessionListener();
  subscribeGmWolfAttackWindow('s1', onWindow);
  second.callbacks[0]?.({
    metadata: { fromCache: false },
    exists: () => true,
    data: () => ({ status: 'due', turn: 1, revision: 1 }),
  });

  expect(onWindow.mock.calls).toEqual([
    [{ status: 'due', turn: 1, revision: 2 }],
    [{ status: 'resolved', turn: 1, revision: 2 }],
    [null],
    [{ status: 'deferred', turn: 2, revision: 3 }],
    [null],
    [{ status: 'due', turn: 1, revision: 1 }],
  ]);
});

it('clears a revisioned projection on listener errors without reopening an older revision', () => {
  const callbacks: Array<(snapshot: unknown) => void> = [];
  const errors: Array<(error: unknown) => void> = [];
  vi.mocked(onSnapshot).mockImplementation(((_reference: unknown, callback: unknown, error: unknown) => {
    callbacks.push(callback as (snapshot: unknown) => void);
    errors.push(error as (error: unknown) => void);
    return vi.fn();
  }) as never);
  const onCensus = vi.fn();
  subscribeLoyaltyCensus('s1', onCensus);

  callbacks[0]?.({
    metadata: { fromCache: false },
    exists: () => true,
    data: () => ({ type: 'loyalty-census', revision: 4, entries: [] }),
  });
  errors[0]?.(new Error('permission denied during demotion'));
  callbacks[0]?.({
    metadata: { fromCache: false },
    exists: () => true,
    data: () => ({ type: 'loyalty-census', revision: 3, entries: [] }),
  });

  expect(onCensus.mock.calls).toEqual([[{ revision: 4, entries: [] }], [null]]);
});

it('hydrates only the typed facilitator Wolf assignment and clears after teardown', () => {
  const { callbacks } = captureSessionListener();
  const onAssignment = vi.fn();
  const unsubscribe = subscribeGmWolfAssignment('s1', onAssignment);

  callbacks[0]?.({
    metadata: { fromCache: true },
    exists: () => true,
    get: () => ({ type: 'wolf-assignment', roleIds: ['admiral'] }),
  });
  expect(onAssignment).not.toHaveBeenCalled();

  callbacks[0]?.({
    metadata: { fromCache: false },
    exists: () => true,
    get: () => ({ type: 'wolf-assignment', roleIds: ['admiral', 'wing-commander'], privateBrief: 'omit' }),
  });
  expect(onAssignment).toHaveBeenCalledWith({ roleIds: ['admiral', 'wing-commander'] });

  callbacks[0]?.({
    metadata: { fromCache: false },
    exists: () => true,
    get: () => ({ type: 'wolf-assignment', roleIds: ['roles/admiral'] }),
  });
  expect(onAssignment).toHaveBeenLastCalledWith(null);
  unsubscribe();
  expect(onAssignment).toHaveBeenLastCalledWith(null);
});

it('drops malformed player identities from private loyalty and setup receipt projections', () => {
  const { callbacks } = captureSessionListener();
  const onPrivateLoyalty = vi.fn();
  const onSetupReceipt = vi.fn();
  subscribeSessionState('s1', 'u1', {
    onSession: vi.fn(), onPlayer: vi.fn(), onKicked: vi.fn(), onSeats: vi.fn(),
    onPrivateLoyalty, onSetupReceipt, onError: vi.fn(),
  });

  callbacks[3]?.({
    exists: () => true,
    get: () => ({ kind: 'fleet-loyalist', suspicion: 5, partnerUid: 'players/u2' }),
  });
  callbacks[4]?.({
    docs: [{
      get: () => ({
        source: 'routine-start', playerCount: 8, mode: 'base', rosterIds: ['admiral'],
        pressEligibility: {}, excludedGmCount: 1, wolfCount: 1, wolfRule: 'one-wolf-at-8-13',
        selectedWolfRoleIds: ['admiral'], eligibleRoleIds: ['admiral'], orderedModifiers: [],
        resultCount: 8, loyaltySource: 'automatic-default', request: {}, expectedSetupRevision: 0,
        committedSetupRevision: 1, actorUid: 'players/u1', serverTime: 'now', event: 'game-started',
      }),
    }],
  });

  expect(onPrivateLoyalty).toHaveBeenCalledWith(null);
  expect(onSetupReceipt).toHaveBeenCalledWith(null);
});

it('parses only audience-safe maintenance result fields from member events', () => {
  const onEvents = vi.fn();
  vi.mocked(onSnapshot).mockImplementation(((_reference: unknown, callback: unknown) => {
    (callback as (snapshot: unknown) => void)({
      docs: [{
        id: 'maintenance-rations-1',
        data: () => ({
          type: 'maintenance', action: 'rations', shipId: 'aegis', shipName: 'AEGIS',
          results: { '2': 'Spent 3 food and 2 water. Ration bonus +9.', hidden: 'deck order' },
          privateNotes: 'facilitator-only note', fingerprint: 'private fingerprint',
          serverRolls: [6, 6], maintenanceRequest: { reply: { result: 'private state' } },
        }),
      }, {
        id: 'maintenance-invalid-1',
        data: () => ({ type: 'maintenance', action: 'unknown', shipId: 'aegis', shipName: 'AEGIS', results: {} }),
      }, {
        id: 'maintenance-legacy-begin',
        data: () => ({ type: 'maintenance', action: 'begin', shipId: 'aegis', shipName: 'AEGIS' }),
      }, {
        id: 'maintenance-legacy-end',
        data: () => ({ type: 'maintenance', action: 'end', shipId: 'aegis', shipName: 'AEGIS' }),
      }, {
        id: 'maintenance-malformed-results',
        data: () => ({ type: 'maintenance', action: 'end', shipId: 'aegis', shipName: 'AEGIS', results: [] }),
      }, {
        id: 'android-proof-1',
        data: () => ({ type: 'android-proof-disclosed', actorUid: 'android-player', requestId: 'android-proof-1', privateCard: 'android' }),
      }, {
        id: 'android-proof-malformed',
        data: () => ({ type: 'android-proof-disclosed', actorUid: 'events/foreign' }),
      }],
    });
    return vi.fn();
  }) as never);

  subscribeSessionEvents('s1', onEvents, vi.fn());

  expect(onEvents).toHaveBeenCalledWith([{
    id: 'maintenance-rations-1', sessionId: 's1', type: 'maintenance',
    shipId: 'aegis', shipName: 'AEGIS', action: 'rations',
    results: { '2': 'Spent 3 food and 2 water. Ration bonus +9.' },
    createdAt: expect.any(String),
  }, {
    id: 'maintenance-legacy-begin', sessionId: 's1', type: 'maintenance',
    shipId: 'aegis', shipName: 'AEGIS', action: 'begin', results: {},
    createdAt: expect.any(String),
  }, {
    id: 'maintenance-legacy-end', sessionId: 's1', type: 'maintenance',
    shipId: 'aegis', shipName: 'AEGIS', action: 'end', results: {},
    createdAt: expect.any(String),
  }, {
    id: 'android-proof-1', sessionId: 's1', type: 'android-proof-disclosed', actorUid: 'android-player',
    createdAt: expect.any(String),
  }]);
  expect(CLIENT_MAINTENANCE_EVENT_ACTIONS).toEqual(SERVER_MAINTENANCE_EVENT_ACTIONS);
  expect(CLIENT_MAINTENANCE_EVENT_RESULT_STEPS).toEqual(SERVER_MAINTENANCE_EVENT_RESULT_STEPS);
  const serialized = JSON.stringify(onEvents.mock.calls[0]?.[0]);
  expect(serialized).not.toContain('facilitator-only note');
  expect(serialized).not.toContain('private fingerprint');
  expect(serialized).not.toContain('deck order');
  expect(serialized).not.toContain('private state');
});

it('reconstructs the visible event snapshot once from server document IDs after reconnect', () => {
  const { callbacks } = captureSessionListener();
  const onEvents = vi.fn((events: readonly SessionEvent[]) => {
    void events;
  });
  subscribeSessionEvents('s1', onEvents, vi.fn());

  const eventDoc = (id: string, message: string, payloadId: string) => ({
    id,
    data: () => ({
      id: payloadId,
      type: 'fullscreen-alert',
      sourceRoleName: 'Admiral',
      message,
      createdAt: '2026-09-12T00:00:00.000Z',
    }),
  });
  const serverSnapshot = (docs: readonly unknown[]) => ({
    metadata: { fromCache: false },
    docs,
  });

  callbacks[0]?.(serverSnapshot([
    eventDoc('turn-advanced-1', 'Initial alert', 'payload-event-1'),
    eventDoc('turn-advanced-2', 'Overlapping alert', 'payload-event-2'),
  ]));
  callbacks[0]?.(serverSnapshot([
    eventDoc('turn-advanced-2', 'Overlapping alert', 'spoofed-payload-id'),
    eventDoc('turn-advanced-3', 'Reconnected alert', 'payload-event-3'),
  ]));

  expect(onEvents).toHaveBeenCalledTimes(2);
  expect(onEvents.mock.calls[0]?.[0].map((event) => event.id)).toEqual([
    'turn-advanced-1', 'turn-advanced-2',
  ]);
  expect(onEvents.mock.calls[1]?.[0].map((event) => event.id)).toEqual([
    'turn-advanced-2', 'turn-advanced-3',
  ]);
  expect(onEvents.mock.calls[1]?.[0]).toHaveLength(2);
  expect(onEvents.mock.calls[1]?.[0][0]).toMatchObject({
    id: 'turn-advanced-2',
    message: 'Overlapping alert',
  });
  expect(onEvents.mock.calls[1]?.[0].map((event) => event.id)).not.toContain('payload-event-2');
});

it('hydrates legacy seat labels and factions from the canonical role catalog', () => {
  const onSeats = vi.fn();
  let snapshotNumber = 0;
  vi.mocked(onSnapshot).mockImplementation(((_reference: unknown, callback: unknown) => {
    snapshotNumber += 1;
    if (snapshotNumber === 3) {
      (callback as (snapshot: unknown) => void)({
        docs: [{
          id: 'admiral',
          data: () => ({ roleId: 'admiral', status: 'open', holderUid: null, claimedAt: null }),
        }],
      });
    } else {
      (callback as (snapshot: unknown) => void)({
        exists: () => true,
        id: 's1',
        data: () => ({}),
        get: () => undefined,
      });
    }
    return vi.fn();
  }) as never);

  subscribeSessionState('s1', 'u1', {
    onSession: vi.fn(), onPlayer: vi.fn(), onKicked: vi.fn(), onSeats, onError: vi.fn(),
  });

  expect(onSeats).toHaveBeenCalledWith([
    expect.objectContaining({
      id: 'admiral', roleId: 'admiral', label: 'AEGIS // Admiral', factionId: 'aegis',
    }),
  ]);
});

type SessionSnapshot = {
  readonly exists: () => boolean;
  readonly id: string;
  readonly data: () => Record<string, unknown>;
  readonly metadata?: { readonly fromCache?: boolean };
};

function timestamp(seconds: number, nanoseconds: number) {
  return {
    seconds,
    nanoseconds,
    toMillis: () => seconds * 1_000 + Math.floor(nanoseconds / 1_000_000),
    toDate: () => new Date(seconds * 1_000 + Math.floor(nanoseconds / 1_000_000)),
  };
}

function liveTurnData(
  currentTurn: number,
  state: 'restricted' | 'lifted',
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    ...sessionData(8),
    phase: 'active',
    currentTurn,
    turnPhase: {
      turn: currentTurn,
      teamPhaseEndsAt: '2026-09-10T12:05:00.000Z',
      openAirspaceEndsAt: '2026-09-10T12:20:00.000Z',
      airspace: { state, tickerActive: true, pressAccess: false },
    },
    ...overrides,
  };
}

function sessionSnapshot(
  data: Record<string, unknown>,
  fromCache?: boolean,
): SessionSnapshot {
  return {
    exists: () => true,
    id: 's1',
    data: () => data,
    ...(fromCache === undefined ? {} : { metadata: { fromCache } }),
  };
}

function captureSessionListener() {
  const callbacks: Array<(snapshot: unknown) => void> = [];
  const errors: Array<(error: unknown) => void> = [];
  const unsubscribeSpies: Array<ReturnType<typeof vi.fn>> = [];
  vi.mocked(onSnapshot).mockImplementation(((_reference: unknown, callback: unknown, error: unknown) => {
    callbacks.push(callback as (snapshot: unknown) => void);
    errors.push((error as ((error: unknown) => void) | undefined) ?? (() => undefined));
    const unsubscribe = vi.fn();
    unsubscribeSpies.push(unsubscribe);
    return unsubscribe;
  }) as never);
  return { callbacks, errors, unsubscribeSpies };
}

it('suppresses delayed older lifecycle snapshots at the session listener boundary', () => {
  const { callbacks } = captureSessionListener();
  const onSession = vi.fn();
  subscribeSessionState('s1', 'u1', {
    onSession, onPlayer: vi.fn(), onKicked: vi.fn(), onSeats: vi.fn(), onError: vi.fn(),
  });

  callbacks[0]?.(sessionSnapshot(liveTurnData(2, 'restricted')));
  callbacks[0]?.(sessionSnapshot(liveTurnData(1, 'lifted', {
    updatedAt: '2026-01-01T00:00:01.000Z',
  })));

  expect(onSession).toHaveBeenCalledTimes(1);
  expect(onSession.mock.lastCall?.[0]).toMatchObject({ currentTurn: 2 });
});

it.each(['captain', 'commissar'] as const)(
  'keeps the %s authority listener alive while its eligible document is absent and later changes',
  (role) => {
    const { callbacks } = captureSessionListener();
    const onAuthority = vi.fn();
    subscribeSessionState('s1', 'u1', {
      onSession: vi.fn(), onPlayer: vi.fn(), onKicked: vi.fn(), onSeats: vi.fn(), onError: vi.fn(),
      onCommissarPurgeAuthority: onAuthority,
    });
    const authorityPath = callbacks[3];
    authorityPath?.({ exists: () => false, metadata: { fromCache: false } });
    authorityPath?.({
      exists: () => true,
      metadata: { fromCache: false },
      data: () => role === 'captain'
        ? {
          type: 'commissar-purge-authority', sessionId: 's1', role,
          captainRoleId: 'icebreaker-captain', shipId: 'icebreaker', revision: 1,
          consented: false, usedThisTurn: false,
        }
        : { type: 'commissar-purge-authority', sessionId: 's1', role, revision: 1, consents: {}, ledger: {} },
    });
    authorityPath?.({
      exists: () => true,
      metadata: { fromCache: false },
      data: () => role === 'captain'
        ? {
          type: 'commissar-purge-authority', sessionId: 's1', role,
          captainRoleId: 'icebreaker-captain', shipId: 'icebreaker', revision: 2,
          consented: true, consentTurn: 1, consentVesselRevision: 0, usedThisTurn: false,
        }
        : {
          type: 'commissar-purge-authority', sessionId: 's1', role, revision: 2,
          consents: { icebreaker: { turn: 1, captainRoleId: 'icebreaker-captain', vesselRevision: 0 } },
          ledger: {},
        },
    });
    expect(onAuthority).toHaveBeenNthCalledWith(1, null);
    expect(onAuthority).toHaveBeenNthCalledWith(2, expect.objectContaining({ role, revision: 1 }));
    expect(onAuthority).toHaveBeenNthCalledWith(3, expect.objectContaining({ role, revision: 2 }));
  },
);

it('rejects a delayed older server snapshot in the same lifecycle window', () => {
  const { callbacks } = captureSessionListener();
  const onSession = vi.fn();
  subscribeSessionState('s1', 'u1', {
    onSession, onPlayer: vi.fn(), onKicked: vi.fn(), onSeats: vi.fn(), onError: vi.fn(),
  });

  callbacks[0]?.(sessionSnapshot(liveTurnData(2, 'lifted', {
    updatedAt: timestamp(1_789_077_000, 900_400_000),
    setupRevision: 8,
    chartSelectionLocked: true,
    activeRoleIds: ['admiral'],
    shipResources: { aegis: { ore: 9, fuel: 4, food: 3, water: 2, materials: 1, securityTeams: 0 } },
  })));
  callbacks[0]?.(sessionSnapshot(liveTurnData(2, 'lifted', {
    updatedAt: timestamp(1_789_076_999, 900_400_000),
    setupRevision: 7,
    chartSelectionLocked: false,
    activeRoleIds: ['wing-commander'],
    shipResources: { aegis: { ore: 1, fuel: 0, food: 0, water: 0, materials: 0, securityTeams: 0 } },
  })));

  expect(onSession).toHaveBeenCalledTimes(1);
  expect(onSession.mock.lastCall?.[0]).toMatchObject({
    setupRevision: 8,
    chartSelectionLocked: true,
    activeRoleIds: ['admiral'],
    shipResources: { aegis: expect.objectContaining({ ore: 9 }) },
  });
});

it('preserves nanosecond precision when same-millisecond callbacks arrive out of order', () => {
  const { callbacks } = captureSessionListener();
  const onSession = vi.fn();
  subscribeSessionState('s1', 'u1', {
    onSession, onPlayer: vi.fn(), onKicked: vi.fn(), onSeats: vi.fn(), onError: vi.fn(),
  });

  callbacks[0]?.(sessionSnapshot(
    liveTurnData(2, 'lifted', {
      updatedAt: timestamp(1_789_077_000, 900_100_000),
      shipResources: { aegis: { ore: 1 } },
    }),
    false,
  ));
  callbacks[0]?.(sessionSnapshot(
    liveTurnData(2, 'lifted', {
      updatedAt: timestamp(1_789_077_000, 900_400_000),
      shipResources: { aegis: { ore: 9 } },
    }),
    false,
  ));
  callbacks[0]?.(sessionSnapshot(
    liveTurnData(2, 'lifted', {
      updatedAt: timestamp(1_789_077_000, 900_200_000),
      shipResources: { aegis: { ore: 2 } },
    }),
    false,
  ));

  expect(onSession).toHaveBeenCalledTimes(2);
  expect(onSession.mock.lastCall?.[0]).toMatchObject({
    shipResources: { aegis: expect.objectContaining({ ore: 9 }) },
  });
});

it('rejects an equal trusted server cursor instead of replaying its callback', () => {
  const { callbacks } = captureSessionListener();
  const onSession = vi.fn();
  const cursor = timestamp(1_789_077_000, 900_400_000);
  subscribeSessionState('s1', 'u1', {
    onSession, onPlayer: vi.fn(), onKicked: vi.fn(), onSeats: vi.fn(), onError: vi.fn(),
  });

  callbacks[0]?.(sessionSnapshot(
    liveTurnData(2, 'lifted', {
      updatedAt: cursor,
      shipResources: { aegis: { ore: 9 } },
    }), false,
  ));
  callbacks[0]?.(sessionSnapshot(
    liveTurnData(2, 'lifted', {
      updatedAt: cursor,
      shipResources: { aegis: { ore: 1 } },
    }), false,
  ));

  expect(onSession).toHaveBeenCalledTimes(1);
  expect(onSession.mock.lastCall?.[0]).toMatchObject({
    shipResources: { aegis: expect.objectContaining({ ore: 9 }) },
  });
});

it('keeps only the first legacy hydration and accepts a later trusted cursor upgrade', () => {
  const { callbacks } = captureSessionListener();
  const onSession = vi.fn();
  subscribeSessionState('s1', 'u1', {
    onSession, onPlayer: vi.fn(), onKicked: vi.fn(), onSeats: vi.fn(), onError: vi.fn(),
  });

  const legacy = liveTurnData(2, 'restricted');
  delete legacy.updatedAt;
  callbacks[0]?.(sessionSnapshot(legacy));
  const repeatedLegacy = liveTurnData(2, 'restricted', { setupRevision: 3 });
  delete repeatedLegacy.updatedAt;
  callbacks[0]?.(sessionSnapshot(repeatedLegacy));
  callbacks[0]?.(sessionSnapshot(liveTurnData(2, 'restricted', {
    updatedAt: '2026-09-10T12:10:00.000Z', setupRevision: 8,
  })));
  const unversioned = liveTurnData(2, 'restricted', { setupRevision: 7 });
  delete unversioned.updatedAt;
  callbacks[0]?.(sessionSnapshot(unversioned));

  expect(onSession).toHaveBeenCalledTimes(2);
  expect(onSession.mock.lastCall?.[0]).toMatchObject({ setupRevision: 8 });
});

it('does not let a delayed cache snapshot overwrite an accepted callable reply', () => {
  const sessionId = 'callable-race';
  const uid = 'callable-player';
  const callableSession = sessionFrom(sessionId, liveTurnData(2, 'lifted', {
    name: 'Fresh callable table',
    updatedAt: '2026-09-10T12:10:00.000Z',
  }));
  expect(acceptCallableSessionAuthority(callableSession, uid)).toBe(true);

  const { callbacks } = captureSessionListener();
  let displayedSession = callableSession;
  const onSession = vi.fn();
  subscribeSessionState(sessionId, uid, {
    sessionSnapshotAuthority: sessionSnapshotAuthorityFor(sessionId, uid),
    onSession: (next) => {
      displayedSession = next;
      onSession(next);
    },
    onPlayer: vi.fn(), onKicked: vi.fn(), onSeats: vi.fn(), onError: vi.fn(),
  });

  callbacks[0]?.(sessionSnapshot(liveTurnData(1, 'restricted', {
    name: 'Delayed cached table',
    updatedAt: timestamp(1_789_076_999, 900_000_000),
  }), true));

  expect(onSession).not.toHaveBeenCalled();
  expect(displayedSession.name).toBe('Fresh callable table');
});

it('renders an initial cached session while marking it stale until server authority arrives', () => {
  const { callbacks } = captureSessionListener();
  const onSession = vi.fn();
  const onFreshness = vi.fn();
  subscribeSessionState('s1', 'u1', {
    onSession, onPlayer: vi.fn(), onKicked: vi.fn(), onSeats: vi.fn(), onError: vi.fn(),
    onSessionFreshness: onFreshness,
  });

  callbacks[0]?.(sessionSnapshot(liveTurnData(1, 'restricted', { shipResources: { aegis: { ore: 2 } } }), true));
  callbacks[0]?.(sessionSnapshot(liveTurnData(1, 'restricted', { shipResources: { aegis: { ore: 3 } } }), false));

  expect(onSession).toHaveBeenCalledTimes(2);
  expect(onSession.mock.calls[0]?.[0]).toMatchObject({ shipResources: { aegis: { ore: 2 } } });
  expect(onSession.mock.lastCall?.[0]).toMatchObject({ shipResources: { aegis: { ore: 3 } } });
  expect(onFreshness.mock.calls).toEqual([[false], [true]]);
});

it('does not let a late cached callback overwrite accepted server authority', () => {
  const { callbacks } = captureSessionListener();
  const onSession = vi.fn();
  const onFreshness = vi.fn();
  subscribeSessionState('s1', 'u1', {
    onSession, onPlayer: vi.fn(), onKicked: vi.fn(), onSeats: vi.fn(), onError: vi.fn(),
    onSessionFreshness: onFreshness,
  });

  callbacks[0]?.(sessionSnapshot(liveTurnData(2, 'lifted', { shipResources: { aegis: { ore: 3 } } }), false));
  callbacks[0]?.(sessionSnapshot(liveTurnData(2, 'lifted', { shipResources: { aegis: { ore: 1 } } }), true));

  expect(onSession).toHaveBeenCalledTimes(1);
  expect(onSession.mock.lastCall?.[0]).toMatchObject({ shipResources: { aegis: { ore: 3 } } });
  expect(onFreshness.mock.calls).toEqual([[true]]);
});

it('does not hydrate the organiser map from cache or a callback after read authority is denied', () => {
  const { callbacks, errors } = captureSessionListener();
  const onGmDiscovery = vi.fn();
  subscribeSessionState('s1', 'u1', {
    onSession: vi.fn(), onPlayer: vi.fn(), onKicked: vi.fn(), onSeats: vi.fn(), onError: vi.fn(),
    onGmDiscovery,
  });
  const snapshot = (fromCache: boolean) => ({
    metadata: { fromCache }, exists: () => true,
    data: () => ({ knownSystems: { 'system-17': '8378' } }),
  });
  callbacks[2]?.(snapshot(true));
  expect(onGmDiscovery).not.toHaveBeenCalled();
  callbacks[2]?.(snapshot(false));
  expect(onGmDiscovery).toHaveBeenCalledWith(expect.objectContaining({
    organiserSystems: { 'system-17': '8378' },
  }));
  errors[2]?.({ code: 'permission-denied' });
  expect(onGmDiscovery).toHaveBeenLastCalledWith(null);
  onGmDiscovery.mockClear();
  callbacks[2]?.(snapshot(false));
  expect(onGmDiscovery).not.toHaveBeenCalled();
});

it('does not let reconnect cache replace an authoritative own-ship discovery or GM navigation projection', () => {
  const { callbacks } = captureSessionListener();
  const onSession = vi.fn();
  const onPlayerDiscovery = vi.fn();
  const onGmDiscovery = vi.fn();
  subscribeSessionState('s1', 'u1', {
    onSession,
    onPlayerDiscovery,
    onGmDiscovery,
    onPlayer: vi.fn(), onKicked: vi.fn(), onSeats: vi.fn(), onError: vi.fn(),
    sessionSnapshotAuthority: sessionSnapshotAuthorityFor('s1', 'u1'),
  });

  callbacks[0]?.(sessionSnapshot(liveTurnData(2, 'lifted', {
    pursuitGroups: { 'fleet-1': 2, 'fleet-2': 7 },
  }), false));
  callbacks[2]?.({
    metadata: { fromCache: false },
    exists: () => true,
    data: () => ({
      groupId: 'fleet-1', shipId: 'aegis', currentCoordinate: '5143',
      knownCoordinates: ['0000', '5143'], knownSystems: { 'system-01': '0000', 'system-02': '5143' },
      pursuitDistance: 1, pursuitValue: 2, navigationLogs: [], revision: 2,
      systemHistory: {
        '5143': {
          coordinate: '5143',
          candidateDiscovery: {
            id: 'arrival-candidate', occurredAt: '2026-09-13T00:00:00.000Z',
            code: 'N', title: 'Ancient Jump Ring', source: 'arrival',
          },
          attempts: [{ id: 'attempt-1', occurredAt: '2026-09-13T00:00:00.000Z' }],
          hazards: [], rewards: [], clearedThreats: [], candidateProgress: [],
        },
        '6798': {
          coordinate: '6798',
          candidateDiscovery: {
            id: 'forged-candidate', occurredAt: '2026-09-13T00:00:00.000Z',
            code: 'N', title: 'Ancient Jump Ring', source: 'arrival', chartId: 'A',
          },
          attempts: [], hazards: [], rewards: [], clearedThreats: [], candidateProgress: [],
        },
        '4888': {
          coordinate: '4888',
          candidateDiscovery: {
            id: 'bad-time', occurredAt: 'not-a-time',
            code: 'P', title: 'Ancient Space Station', source: 'scout',
          },
          attempts: [], hazards: [], rewards: [], clearedThreats: [], candidateProgress: [],
        },
      },
    }),
  });
  callbacks[3]?.({
    metadata: { fromCache: false },
    exists: () => true,
    data: () => ({
      shipGalacticCoordinates: { aegis: '5143' }, shipNavigationLogs: { aegis: [] },
      knownSystems: { 'system-01': '0000', 'system-02': '5143' }, revision: 2,
      pursuitGroups: { 'fleet-1': 2, 'fleet-2': 7 },
      shipFleetGroupIds: { aegis: 'fleet-1', dione: 'fleet-2' },
      candidatePlanCheckpoint: { cycle: 6, planExists: true, checkedAt: '2026-09-22T12:00:00.000Z' },
      systemHistory: {
        aegis: {
          '5143': {
            coordinate: '5143', attempts: [{ id: 'attempt-1', occurredAt: '2026-09-13T00:00:00.000Z' }],
            candidateDiscovery: {
              id: 'arrival-candidate', occurredAt: '2026-09-13T00:00:00.000Z',
              code: 'N', title: 'Ancient Jump Ring', source: 'arrival',
            },
            hazards: [], rewards: [], clearedThreats: [], candidateProgress: [],
          },
        },
        dione: {
          '8378': {
            coordinate: '8378', attempts: [{ id: 'attempt-2', occurredAt: '2026-09-13T00:00:00.000Z' }],
            hazards: [], rewards: [], clearedThreats: [], candidateProgress: [],
          },
        },
      },
    }),
  });

  callbacks[2]?.({
    metadata: { fromCache: true },
    exists: () => true,
    data: () => ({
      groupId: 'fleet-1', shipId: 'aegis', currentCoordinate: '8378',
      knownCoordinates: ['0000', '8378'], knownSystems: { 'system-01': '0000', 'system-17': '8378' },
      pursuitDistance: 6, navigationLogs: [], revision: 1,
      systemHistory: {
        '8378': {
          coordinate: '8378', attempts: [{ id: 'stale-attempt', occurredAt: '2026-09-13T00:00:00.000Z' }],
          hazards: [], rewards: [], clearedThreats: [], candidateProgress: [],
        },
      },
    }),
  });
  callbacks[3]?.({
    metadata: { fromCache: true },
    exists: () => true,
    data: () => ({
      shipGalacticCoordinates: { aegis: '8378' }, shipNavigationLogs: { aegis: [] },
      knownSystems: { 'system-01': '0000', 'system-17': '8378' }, revision: 1,
      candidatePlanCheckpoint: { cycle: 6, planExists: true, checkedAt: '2026-09-22T12:00:00.000Z' },
      systemHistory: {
        aegis: {
          '8378': {
            coordinate: '8378', attempts: [{ id: 'stale-attempt', occurredAt: '2026-09-13T00:00:00.000Z' }],
            hazards: [], rewards: [], clearedThreats: [], candidateProgress: [],
          },
        },
      },
    }),
  });

  expect(onSession).toHaveBeenCalledTimes(1);
  expect(onSession.mock.lastCall?.[0]).not.toHaveProperty('pursuitGroups');
  expect(onPlayerDiscovery).toHaveBeenCalledTimes(1);
  expect(onPlayerDiscovery).toHaveBeenLastCalledWith(expect.objectContaining({
    currentCoordinate: '5143', knownCoordinates: ['0000', '5143'], pursuitValue: 2,
  }));
  expect(onPlayerDiscovery.mock.lastCall?.[0]).not.toHaveProperty('pursuitGroups');
  const ownProjection = onPlayerDiscovery.mock.lastCall?.[0] as { systemHistory?: Record<string, { attempts: readonly { id: string }[]; candidateDiscovery?: { code: string } }> };
  expect(ownProjection.systemHistory?.['5143']?.attempts[0]?.id).toBe('attempt-1');
  expect(ownProjection.systemHistory?.['5143']?.candidateDiscovery?.code).toBe('N');
  expect(ownProjection.systemHistory).not.toHaveProperty('6798');
  expect(ownProjection.systemHistory).not.toHaveProperty('4888');
  expect(onGmDiscovery).toHaveBeenCalledTimes(1);
  expect(onGmDiscovery.mock.lastCall?.[0]).toMatchObject({
    shipGalacticCoordinates: expect.objectContaining({ aegis: '5143' }),
    pursuitGroups: { 'fleet-1': 2, 'fleet-2': 7 },
    shipFleetGroupIds: { aegis: 'fleet-1', dione: 'fleet-2' },
    candidatePlanCheckpoint: { cycle: 6, planExists: true },
  });
  const gmProjection = onGmDiscovery.mock.lastCall?.[0] as { organiserSystemHistory?: Record<string, Record<string, { attempts: readonly { id: string }[]; candidateDiscovery?: { code: string } }>> };
  expect(gmProjection.organiserSystemHistory?.aegis?.['5143']?.attempts[0]?.id).toBe('attempt-1');
  expect(gmProjection.organiserSystemHistory?.aegis?.['5143']?.candidateDiscovery?.code).toBe('N');
  expect(gmProjection.organiserSystemHistory?.dione?.['8378']?.attempts[0]?.id).toBe('attempt-2');
});

it('clears the GM navigation projection when its protected listener loses permission', () => {
  const { errors } = captureSessionListener();
  const onGmDiscovery = vi.fn();
  subscribeSessionState('s1', 'u1', {
    onSession: vi.fn(), onGmDiscovery, onPlayer: vi.fn(), onKicked: vi.fn(), onSeats: vi.fn(), onError: vi.fn(),
  });

  errors[2]?.({ code: 'permission-denied' });

  expect(onGmDiscovery).toHaveBeenCalledWith(null);
});

it('does not let cached identity projections overwrite accepted server authority', () => {
  const { callbacks } = captureSessionListener();
  const onPlayer = vi.fn();
  const onKicked = vi.fn();
  const onSeats = vi.fn();
  const onPrivateLoyalty = vi.fn();
  const onSetupReceipt = vi.fn();
  const onError = vi.fn();
  subscribeSessionState('projection-race', 'projection-player', {
    onSession: vi.fn(),
    onPlayer,
    onKicked,
    onSeats,
    onPrivateLoyalty,
    onSetupReceipt,
    onError,
    sessionSnapshotAuthority: sessionSnapshotAuthorityFor('projection-race', 'projection-player'),
  });

  callbacks[0]?.(sessionSnapshot({
    ...liveTurnData(2, 'lifted'),
    updatedAt: '2026-09-11T12:00:00.000Z',
  }, false));
  callbacks[1]?.({
    metadata: { fromCache: true },
    exists: () => true,
    get: (field: string) => field === 'connected' ? true : undefined,
    data: () => ({ role: 'gm' }),
  });
  callbacks[2]?.({ metadata: { fromCache: true }, docs: [] });
  callbacks[3]?.({
    metadata: { fromCache: true },
    exists: () => true,
    get: () => ({ kind: 'fleet-loyalist', suspicion: 5 }),
  });
  callbacks[4]?.({ metadata: { fromCache: true }, docs: [] });

  expect(onPlayer).not.toHaveBeenCalled();
  expect(onKicked).not.toHaveBeenCalled();
  expect(onSeats).not.toHaveBeenCalled();
  expect(onPrivateLoyalty).not.toHaveBeenCalled();
  expect(onSetupReceipt).not.toHaveBeenCalled();
  expect(onError).not.toHaveBeenCalled();
});

it('drops delayed cached secondary query snapshots after a server snapshot', async () => {
  useSessionStore.setState({
    me: {
      uid: 'secondary-player', sessionId: 'secondary-race', displayName: 'Player',
      role: 'player', seatId: null, fleetGroupId: 'fleet-1', joinedAt: '',
    },
    gmInstance: null,
  });
  const callbacks: Array<(snapshot: unknown) => void> = [];
  vi.mocked(onSnapshot).mockImplementation(((_reference: unknown, callback: unknown) => {
    callbacks.push(callback as (snapshot: unknown) => void);
    return vi.fn();
  }) as never);
  const onInstances = vi.fn();
  const onPlayers = vi.fn();
  const onEvents = vi.fn();
  const onDraws = vi.fn();
  mockGmInstanceProjection([]);
  const stopInstances = subscribeGmInstances('secondary-race', onInstances, vi.fn());
  subscribeConnectedPlayers('secondary-race', onPlayers);
  subscribeSessionEvents('secondary-race', onEvents);
  const stopDraws = subscribeDamageDraws('secondary-race', onDraws);

  callbacks.forEach((callback) => {
    callback({ metadata: { fromCache: false }, docs: [] });
    callback({ metadata: { fromCache: true }, docs: [] });
  });

  await vi.waitFor(() => expect(onInstances).toHaveBeenCalled());

  expect(onInstances).toHaveBeenCalledTimes(1);
  expect(onPlayers).toHaveBeenCalledTimes(2);
  expect(onEvents).toHaveBeenCalledTimes(1);
  expect(onDraws).toHaveBeenCalledTimes(1);
  stopDraws();
  stopInstances();
  useSessionStore.getState().reset();
});

it('shares accepted session authority with secondary queries before their first server callback', () => {
  const sessionId = 'secondary-authority';
  const uid = 'secondary-player';
  expect(acceptCallableSessionAuthority(sessionFrom(sessionId, liveTurnData(1, 'restricted', {
    updatedAt: '2026-09-11T12:00:00.000Z',
  })), uid)).toBe(true);
  useSessionStore.setState({
    me: {
      uid, sessionId, displayName: 'Player', role: 'player', seatId: null, joinedAt: '',
    },
  });

  const callbacks: Array<(snapshot: unknown) => void> = [];
  vi.mocked(onSnapshot).mockImplementation(((_reference: unknown, callback: unknown) => {
    callbacks.push(callback as (snapshot: unknown) => void);
    return vi.fn();
  }) as never);
  const onPlayers = vi.fn();
  subscribeConnectedPlayers(sessionId, onPlayers, vi.fn());
  callbacks[0]?.({ metadata: { fromCache: true }, docs: [] });

  expect(onPlayers).toHaveBeenCalledWith([]);
  useSessionStore.getState().reset();
});

it('queries a member roster by its server-owned group and clears stale data on revocation', () => {
  useSessionStore.setState({
    me: {
      uid: 'grouped-player', sessionId: 'grouped-session', displayName: 'Player',
      role: 'player', seatId: null, fleetGroupId: 'fleet-2', joinedAt: '',
    },
    // A stale local GM instance must not widen a demoted player's query.
    gmInstance: {
      id: 'stale-gm', sessionId: 'grouped-session', uid: 'grouped-player', name: 'Old GM',
      deviceLabel: 'old device', claimedAt: '',
    },
  });
  let onSnapshotCallback: ((snapshot: unknown) => void) | undefined;
  let onSnapshotError: (() => void) | undefined;
  vi.mocked(onSnapshot).mockImplementation(((_reference: unknown, callback: unknown, error?: unknown) => {
    onSnapshotCallback = callback as (snapshot: unknown) => void;
    onSnapshotError = error as (() => void) | undefined;
    return vi.fn();
  }) as never);

  const onPlayers = vi.fn();
  const onError = vi.fn();
  const stopPlayers = subscribeConnectedPlayers('grouped-session', onPlayers, onError);

  expect(vi.mocked(where)).toHaveBeenCalledWith('connected', '==', true);
  expect(vi.mocked(where)).toHaveBeenCalledWith('fleetGroupId', '==', 'fleet-2');
  onSnapshotCallback?.({
    metadata: { fromCache: false },
    docs: [{ id: 'grouped-player', data: () => ({
      role: 'player', connected: true, connectionGeneration: 4,
    }) }],
  });
  expect(onPlayers).toHaveBeenLastCalledWith([
    expect.objectContaining({ uid: 'grouped-player', connectionGeneration: 4 }),
  ]);

  onSnapshotError?.();
  expect(onPlayers).toHaveBeenLastCalledWith([]);
  expect(onError).toHaveBeenCalledTimes(1);
  stopPlayers();
  useSessionStore.getState().reset();
});

it('suppresses an earlier airspace phase within the same turn but keeps newer data in the current window', () => {
  const { callbacks } = captureSessionListener();
  const onSession = vi.fn();
  subscribeSessionState('s1', 'u1', {
    onSession, onPlayer: vi.fn(), onKicked: vi.fn(), onSeats: vi.fn(), onError: vi.fn(),
  });

  callbacks[0]?.(sessionSnapshot(liveTurnData(1, 'lifted', {
    updatedAt: '2026-01-01T00:00:01.000Z',
    shipResources: { aegis: { ore: 2 } },
  })));
  callbacks[0]?.(sessionSnapshot(liveTurnData(1, 'restricted', {
    updatedAt: '2026-01-01T00:00:02.000Z',
  })));
  callbacks[0]?.(sessionSnapshot(liveTurnData(1, 'lifted', {
    updatedAt: '2026-01-01T00:00:03.000Z',
    shipResources: { aegis: { ore: 3 } },
  })));

  expect(onSession).toHaveBeenCalledTimes(2);
  expect(onSession.mock.lastCall?.[0]).toMatchObject({
    currentTurn: 1,
    shipResources: { aegis: { ore: 3 } },
  });
});

it('delivers equal lifecycle snapshots when only current-window data changes', () => {
  const { callbacks } = captureSessionListener();
  const onSession = vi.fn();
  subscribeSessionState('s1', 'u1', {
    onSession, onPlayer: vi.fn(), onKicked: vi.fn(), onSeats: vi.fn(), onError: vi.fn(),
  });

  callbacks[0]?.(sessionSnapshot(liveTurnData(1, 'lifted', {
    updatedAt: '2026-01-01T00:00:01.000Z',
    shipResources: { aegis: { ore: 2 } },
  })));
  callbacks[0]?.(sessionSnapshot(liveTurnData(1, 'lifted', {
    updatedAt: '2026-01-01T00:00:02.000Z',
    shipResources: { aegis: { ore: 3 } },
  })));

  expect(onSession).toHaveBeenCalledTimes(2);
  expect(onSession.mock.lastCall?.[0]).toMatchObject({
    currentTurn: 1,
    phase: 'active',
    shipResources: { aegis: { ore: 3 } },
  });
});

it('allows the authoritative phase reset for a legitimate next turn', () => {
  const { callbacks } = captureSessionListener();
  const onSession = vi.fn();
  subscribeSessionState('s1', 'u1', {
    onSession, onPlayer: vi.fn(), onKicked: vi.fn(), onSeats: vi.fn(), onError: vi.fn(),
  });

  callbacks[0]?.(sessionSnapshot(liveTurnData(1, 'lifted', {
    updatedAt: '2026-01-01T00:00:01.000Z',
  })));
  callbacks[0]?.(sessionSnapshot(liveTurnData(2, 'restricted', {
    updatedAt: '2026-01-01T00:00:02.000Z',
  })));

  expect(onSession).toHaveBeenCalledTimes(2);
  expect(onSession.mock.lastCall?.[0]).toMatchObject({ currentTurn: 2 });
  expect(onSession.mock.lastCall?.[0]).toMatchObject({
    turnPhase: { turn: 2, airspace: { state: 'restricted' } },
  });
});

it.each(['success', 'failure', 'debrief', 'closed'] as const)(
  'does not regress a %s session to an actionable phase',
  (terminalPhase) => {
    const { callbacks } = captureSessionListener();
    const onSession = vi.fn();
    subscribeSessionState('s1', 'u1', {
      onSession, onPlayer: vi.fn(), onKicked: vi.fn(), onSeats: vi.fn(), onError: vi.fn(),
    });

    callbacks[0]?.(sessionSnapshot({ ...sessionData(8), phase: terminalPhase, currentTurn: 2 }));
    callbacks[0]?.(sessionSnapshot(liveTurnData(2, 'restricted', {
      updatedAt: '2026-01-01T00:00:01.000Z',
    })));

    expect(onSession).toHaveBeenCalledTimes(1);
    expect(onSession.mock.lastCall?.[0]).toMatchObject({ phase: terminalPhase });
  },
);

it.each([
  ['closed', 'debrief'],
  ['debrief', 'success'],
  ['success', 'failure'],
] as const)('does not regress terminal lifecycle ordering across turns: %s@2 -> %s@3',
  (acceptedPhase, delayedPhase) => {
    const { callbacks } = captureSessionListener();
    const onSession = vi.fn();
    subscribeSessionState('s1', 'u1', {
      onSession, onPlayer: vi.fn(), onKicked: vi.fn(), onSeats: vi.fn(), onError: vi.fn(),
    });

    callbacks[0]?.(sessionSnapshot({ ...sessionData(8), phase: acceptedPhase, currentTurn: 2 }));
    callbacks[0]?.(sessionSnapshot({
      ...sessionData(8),
      phase: delayedPhase,
      currentTurn: 3,
      updatedAt: '2026-01-01T00:00:01.000Z',
    }));

    expect(onSession).toHaveBeenCalledTimes(1);
    expect(onSession.mock.lastCall?.[0]).toMatchObject({
      phase: acceptedPhase,
      currentTurn: 2,
    });
  });

it('preserves server authority and lifecycle ordering across listener re-subscription', () => {
  const sessionSnapshotAuthority = {
    hasServerSessionAuthority: false,
  };
  const first = captureSessionListener();
  const onSession = vi.fn();
  const onFreshness = vi.fn();
  const handlers = {
    onSession,
    onSessionFreshness: onFreshness,
    onPlayer: vi.fn(),
    onKicked: vi.fn(),
    onSeats: vi.fn(),
    onError: vi.fn(),
    sessionSnapshotAuthority,
  };
  const unsubscribe = subscribeSessionState('s1', 'u1', {
    ...handlers,
  });
  first.callbacks[0]?.(sessionSnapshot(liveTurnData(2, 'lifted'), false));
  unsubscribe();

  const second = captureSessionListener();
  subscribeSessionState('s1', 'u1', {
    ...handlers,
  });
  second.callbacks[0]?.(sessionSnapshot(liveTurnData(1, 'restricted'), true));

  expect(onSession).toHaveBeenCalledTimes(1);
  expect(onSession.mock.lastCall?.[0]).toMatchObject({ currentTurn: 2 });
  expect(onFreshness.mock.calls).toEqual([[true]]);
  expect(first.unsubscribeSpies.every((unsubscribeSpy) => unsubscribeSpy.mock.calls.length === 1)).toBe(true);
});

it('ignores every delayed projection callback after unsubscribe', () => {
  const { callbacks } = captureSessionListener();
  const onPlayer = vi.fn();
  const onSeats = vi.fn();
  const onPrivateLoyalty = vi.fn();
  const onSetupReceipt = vi.fn();
  const onError = vi.fn();
  const unsubscribe = subscribeSessionState('s1', 'u1', {
    onSession: vi.fn(),
    onPlayer,
    onKicked: vi.fn(),
    onSeats,
    onPrivateLoyalty,
    onSetupReceipt,
    onError,
  });

  unsubscribe();
  callbacks[1]?.({ exists: () => false });
  callbacks[2]?.({ docs: [] });
  callbacks[3]?.({ exists: () => false });
  callbacks[4]?.({ docs: [] });

  expect(onPlayer).not.toHaveBeenCalled();
  expect(onSeats).not.toHaveBeenCalled();
  expect(onPrivateLoyalty).toHaveBeenLastCalledWith(null);
  expect(onSetupReceipt).toHaveBeenLastCalledWith(null);
  expect(onError).not.toHaveBeenCalled();
});

it('does not let an old listener cleanup erase a replacement private projection', () => {
  const first = captureSessionListener();
  const firstPrivateLoyalty = vi.fn();
  const firstRoleBrief = vi.fn();
  const firstSetupReceipt = vi.fn();
  const firstUnsubscribe = subscribeSessionState('s1', 'u1', {
    onSession: vi.fn(), onPlayer: vi.fn(), onKicked: vi.fn(), onSeats: vi.fn(),
    onPrivateLoyalty: firstPrivateLoyalty, onRoleBrief: firstRoleBrief,
    onSetupReceipt: firstSetupReceipt, onError: vi.fn(),
  });
  first.callbacks[3]?.({
    metadata: { fromCache: false },
    exists: () => true,
    get: () => ({ type: 'loyalty', kind: 'fleet-loyalist', suspicion: 5 }),
  });

  const second = captureSessionListener();
  const secondPrivateLoyalty = vi.fn();
  const secondRoleBrief = vi.fn();
  const secondSetupReceipt = vi.fn();
  const secondUnsubscribe = subscribeSessionState('s2', 'u2', {
    onSession: vi.fn(), onPlayer: vi.fn(), onKicked: vi.fn(), onSeats: vi.fn(),
    onPrivateLoyalty: secondPrivateLoyalty, onRoleBrief: secondRoleBrief,
    onSetupReceipt: secondSetupReceipt, onError: vi.fn(),
  });
  second.callbacks[3]?.({
    metadata: { fromCache: false },
    exists: () => true,
    get: () => ({ type: 'loyalty', kind: 'wolf-agent', suspicion: 0 }),
  });

  firstUnsubscribe();
  expect(secondPrivateLoyalty).toHaveBeenLastCalledWith({ kind: 'wolf-agent', suspicion: 0 });
  expect(secondRoleBrief).not.toHaveBeenCalled();
  expect(secondSetupReceipt).not.toHaveBeenCalled();
  first.callbacks[3]?.({ exists: () => false });
  expect(secondPrivateLoyalty).toHaveBeenLastCalledWith({ kind: 'wolf-agent', suspicion: 0 });

  secondUnsubscribe();
  expect(secondPrivateLoyalty).toHaveBeenLastCalledWith(null);
  expect(secondRoleBrief).toHaveBeenLastCalledWith(null);
  expect(secondSetupReceipt).toHaveBeenLastCalledWith(null);
});

it('keeps malformed and legacy lifecycle fields safe without throwing or inventing authority', () => {
  const { callbacks } = captureSessionListener();
  const onSession = vi.fn();
  subscribeSessionState('s1', 'u1', {
    onSession, onPlayer: vi.fn(), onKicked: vi.fn(), onSeats: vi.fn(), onError: vi.fn(),
  });

  expect(() => {
    callbacks[0]?.(sessionSnapshot({ ...sessionData(8), phase: 'legacy-phase', currentTurn: 'old' }));
    callbacks[0]?.(sessionSnapshot(liveTurnData(1, 'restricted', {
      updatedAt: '2026-01-01T00:00:01.000Z',
    })));
  }).not.toThrow();
  expect(onSession).toHaveBeenCalledTimes(2);
});

it('recovers a failed GM manifest listener and callable without reload, then cancels late work on stop', async () => {
  vi.useFakeTimers();
  const snapshots: Array<(snapshot: unknown) => void> = [];
  const failures: Array<(error: unknown) => void> = [];
  const stops: Array<ReturnType<typeof vi.fn>> = [];
  vi.mocked(onSnapshot).mockImplementation(((_query: unknown, next: (snapshot: unknown) => void, error: (error: unknown) => void) => {
    snapshots.push(next);
    failures.push(error);
    const stop = vi.fn();
    stops.push(stop);
    return stop;
  }) as never);
  const read = vi.fn()
    .mockRejectedValueOnce({ code: 'functions/unavailable' })
    .mockResolvedValue({ data: { instances: [{ id: 'current-gm' }] } });
  vi.mocked(httpsCallable).mockReturnValue(read as never);
  const onInstances = vi.fn();
  const onError = vi.fn();
  const stop = subscribeGmInstances('s1', onInstances, onError);
  try {
    snapshots[0]?.({ metadata: { fromCache: false } });
    await vi.advanceTimersByTimeAsync(0);
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onInstances).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1_000);
    expect(onInstances).toHaveBeenLastCalledWith([{ id: 'current-gm' }]);

    failures[0]?.({ code: 'unavailable' });
    expect(stops[0]).toHaveBeenCalled();
    window.dispatchEvent(new Event('online'));
    await vi.advanceTimersByTimeAsync(0);
    expect(snapshots).toHaveLength(2);
    const reads = read.mock.calls.length;
    snapshots[0]?.({ metadata: { fromCache: false } });
    await vi.advanceTimersByTimeAsync(0);
    expect(read).toHaveBeenCalledTimes(reads);

    let resolveLate: ((value: unknown) => void) | undefined;
    read.mockImplementationOnce(() => new Promise((resolve) => { resolveLate = resolve; }));
    snapshots[1]?.({ metadata: { fromCache: false } });
    const published = onInstances.mock.calls.length;
    stop();
    resolveLate?.({ data: { instances: [{ id: 'late-gm' }] } });
    window.dispatchEvent(new Event('online'));
    window.dispatchEvent(new Event('focus'));
    await vi.advanceTimersByTimeAsync(60_000);
    expect(onInstances).toHaveBeenCalledTimes(published);
    expect(stops[1]).toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  } finally {
    stop();
    vi.useRealTimers();
  }
});

it.each(['permission-denied', 'not-found'])('does not retry a denied GM manifest or publish its late response (%s)', async (code) => {
  vi.useFakeTimers();
  let publish: ((snapshot: unknown) => void) | undefined;
  let fail: ((error: unknown) => void) | undefined;
  const stopListener = vi.fn();
  vi.mocked(onSnapshot).mockImplementation(((_query: unknown, next: (snapshot: unknown) => void, error: (error: unknown) => void) => {
    publish = next;
    fail = error;
    return stopListener;
  }) as never);
  let resolveRead: ((value: unknown) => void) | undefined;
  const read = vi.fn(() => new Promise((resolve) => { resolveRead = resolve; }));
  vi.mocked(httpsCallable).mockReturnValue(read as never);
  const onInstances = vi.fn();
  const onError = vi.fn();
  const stop = subscribeGmInstances('s1', onInstances, onError);
  try {
    publish?.({ metadata: { fromCache: false } });
    fail?.({ code });
    resolveRead?.({ data: { instances: [{ id: 'revoked-gm' }] } });
    window.dispatchEvent(new Event('online'));
    await vi.advanceTimersByTimeAsync(60_000);
    expect(onError).toHaveBeenCalledOnce();
    expect(read).toHaveBeenCalledOnce();
    expect(onInstances).not.toHaveBeenCalled();
    expect(stopListener).toHaveBeenCalled();
  } finally {
    stop();
    vi.useRealTimers();
  }
});

it('retains private crisis configuration on reconnect and rejects malformed kinds', async () => {
  const { subscribeGmCrisisState } = await import('./firestore');
  let publish: ((snapshot: unknown) => void) | undefined;
  vi.mocked(onSnapshot).mockImplementation(((_reference: unknown, callback: unknown) => {
    publish = callback as (snapshot: unknown) => void;
    return vi.fn();
  }) as never);
  const onState = vi.fn();
  const stop = subscribeGmCrisisState('s1', onState);
  const record = { sessionId: 's1', crisisId: 'crisis-1', state: 'draft', revision: 1,
    title: 'Election', details: 'Private notes', crisisKind: 'presidential-election',
    configurationOverride: 'Facilitator adaptation.' };
  publish?.({ metadata: { fromCache: false }, exists: () => true, data: () => record });
  expect(onState).toHaveBeenLastCalledWith(record);
  publish?.({ metadata: { fromCache: false }, exists: () => true,
    data: () => ({ ...record, crisisKind: 'unknown' }) });
  expect(onState).toHaveBeenLastCalledWith(null);
  stop();
});

it('reads only valid server crisis reports and drops hidden fields, cached drafts and late callbacks', async () => {
  const { subscribeCrisisReport } = await import('./firestore');
  let publish!: (snapshot: unknown) => void;
  let fail!: () => void;
  vi.mocked(onSnapshot).mockImplementationOnce(((_ref: unknown, _options: unknown, next: typeof publish, error: typeof fail) => {
    publish = next; fail = error; return vi.fn();
  }) as never);
  const received = vi.fn();
  const error = vi.fn();
  const stop = subscribeCrisisReport('s1', received, error);
  const raw = { sessionId: 's1', crisisId: 'vessel', state: 'delivered', revision: 2, title: 'Report', body: 'Public scouting facts', details: 'Secret trap', configurationOverride: 'Private adaptation' };
  const snapshot = (data: object, fromCache = false) => ({ exists: () => true, data: () => data, metadata: { fromCache } });
  publish(snapshot(raw, true));
  expect(received).not.toHaveBeenCalled();
  publish(snapshot(raw));
  expect(received).toHaveBeenLastCalledWith({ sessionId: 's1', crisisId: 'vessel', state: 'delivered', revision: 2, title: 'Report', body: 'Public scouting facts' });
  for (const invalid of [{ ...raw, state: 'draft' }, { ...raw, sessionId: 's2' }, { ...raw, body: 'x'.repeat(4001) }]) {
    publish(snapshot(invalid)); expect(received).toHaveBeenLastCalledWith(null);
  }
  fail(); expect(error).toHaveBeenCalledOnce();
  stop(); received.mockClear(); publish(snapshot(raw)); fail();
  expect(received).not.toHaveBeenCalled(); expect(error).toHaveBeenCalledOnce();
});


it('restores valid outbreak details and rejects malformed private projections', async () => {
  const { subscribeGmCrisisState } = await import('./firestore');
  let publish!: (snapshot: unknown) => void;
  vi.mocked(onSnapshot).mockImplementation(((_reference: unknown, callback: unknown) => {
    publish = callback as typeof publish;
    return vi.fn();
  }) as never);
  const onState = vi.fn();
  const stop = subscribeGmCrisisState('s1', onState);
  const diseaseOutbreak = { affectedShipIds: ['aegis'], workRestrictions: 'Limited work.', escalationRisk: 'Further spread.' };
  const record = { sessionId: 's1', crisisId: 'outbreak', state: 'draft', revision: 1,
    title: 'Outbreak', details: 'Private', crisisKind: 'disease-outbreak', configurationOverride: '', diseaseOutbreak };
  const emit = (value: unknown) => publish({ metadata: { fromCache: false }, exists: () => true, data: () => ({ ...record, diseaseOutbreak: value }) });
  emit(diseaseOutbreak);
  expect(onState).toHaveBeenLastCalledWith(record);
  for (const value of [null, { ...diseaseOutbreak, workRestrictions: ' ' }, { ...diseaseOutbreak, affectedShipIds: ['aegis', 'aegis'] }]) {
    emit(value);
    expect(onState).toHaveBeenLastCalledWith(null);
  }
  stop();
});
