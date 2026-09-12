import { expect, it, vi } from 'vitest';
import { recommendedRoleIds } from '@/data/rolePresets';
import { useSessionStore } from '@/store/useSessionStore';
import type { GameSession } from '@/types/game';
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
vi.mock('./firebase', () => ({ app: vi.fn() }));
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
  subscribeDamageDraws,
  subscribeLoyaltyCensus,
  subscribeGmWolfAttackWindow,
  subscribeSessionEvents,
  subscribeSessionState,
} = await import('./firestore');
const { onSnapshot } = await import('firebase/firestore');

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
  expect(session.shipNavigationLogs?.aegis?.[0]).toMatchObject({ id: 'jump-1', shipId: 'aegis' });
  expect(session.shuttleDockings?.[0]).toMatchObject({ shuttleId: 'starlight', shipId: 'aegis' });
  expect(session.shuttleVisitLog?.[0]).toMatchObject({ id: 'visit-1', shuttleId: 'starlight', shipId: 'aegis' });
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
  expect(session.activeVesselIds).toBeUndefined();
  expect(session.ownerUid).toBeUndefined();
  expect(session.shipNavigationLogs?.aegis).toEqual([
    expect.objectContaining({ id: 'jump-1', shipId: 'aegis' }),
  ]);
  expect(session.unrestAlerts).toEqual({});
  expect(session.populationAlerts).toEqual({});
  expect(session.shuttleDockings).not.toEqual(expect.arrayContaining([
    expect.objectContaining({ shuttleId: 'shuttles/starlight' }),
  ]));
  expect(session.shuttleVisitLog).not.toEqual(expect.arrayContaining([
    expect.objectContaining({ id: 'events/visit-1' }),
  ]));
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

it('projects normalized dual-lane GM responsibilities during hydration', () => {
  const onInstances = vi.fn();
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

  subscribeGmInstances('s1', onInstances, vi.fn());

  expect(onInstances).toHaveBeenCalledWith([
    expect.objectContaining({
      id: 'bridge',
      responsibility: 'main',
      responsibilities: ['main', 'assistant'],
    }),
  ]);
});

it('projects a sole legacy GM responsibility into both canonical lanes on each direct listener update', () => {
  const onInstances = vi.fn();
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

  subscribeGmInstances('s1', onInstances, vi.fn());

  expect(onInstances).toHaveBeenCalledWith([
    expect.objectContaining({
      id: 'bridge',
      responsibility: 'assistant',
      responsibilities: ['main', 'assistant'],
    }),
  ]);
});

it('drops malformed GM identities without throwing or leaving a stale projection', () => {
  const { callbacks } = captureSessionListener();
  const onInstances = vi.fn();
  const onError = vi.fn();
  subscribeGmInstances('s1', onInstances, onError);

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
  expect(onInstances).toHaveBeenCalledWith([expect.objectContaining({ id: 'good', uid: 'gm2' })]);
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
    }),
  });
  expect(onRoleBrief).toHaveBeenCalledWith(expect.objectContaining({
    assignmentUid: 'u1', roleId: 'admiral', ownedCraftIds: ['fighter-wing-alpha'], setupRevision: 2,
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
  }]);
  expect(CLIENT_MAINTENANCE_EVENT_ACTIONS).toEqual(SERVER_MAINTENANCE_EVENT_ACTIONS);
  expect(CLIENT_MAINTENANCE_EVENT_RESULT_STEPS).toEqual(SERVER_MAINTENANCE_EVENT_RESULT_STEPS);
  const serialized = JSON.stringify(onEvents.mock.calls[0]?.[0]);
  expect(serialized).not.toContain('facilitator-only note');
  expect(serialized).not.toContain('private fingerprint');
  expect(serialized).not.toContain('deck order');
  expect(serialized).not.toContain('private state');
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
  const unsubscribeSpies: Array<ReturnType<typeof vi.fn>> = [];
  vi.mocked(onSnapshot).mockImplementation(((_reference: unknown, callback: unknown) => {
    callbacks.push(callback as (snapshot: unknown) => void);
    const unsubscribe = vi.fn();
    unsubscribeSpies.push(unsubscribe);
    return unsubscribe;
  }) as never);
  return { callbacks, unsubscribeSpies };
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

it('rejects a delayed older server snapshot in the same lifecycle window', () => {
  const { callbacks } = captureSessionListener();
  const onSession = vi.fn();
  subscribeSessionState('s1', 'u1', {
    onSession, onPlayer: vi.fn(), onKicked: vi.fn(), onSeats: vi.fn(), onError: vi.fn(),
  });

  callbacks[0]?.(sessionSnapshot(liveTurnData(2, 'lifted', {
    updatedAt: timestamp(1_789_077_000, 900_400_000),
    setupRevision: 8,
    activeRoleIds: ['admiral'],
    shipResources: { aegis: { ore: 9, fuel: 4, food: 3, water: 2, materials: 1, securityTeams: 0 } },
  })));
  callbacks[0]?.(sessionSnapshot(liveTurnData(2, 'lifted', {
    updatedAt: timestamp(1_789_076_999, 900_400_000),
    setupRevision: 7,
    activeRoleIds: ['wing-commander'],
    shipResources: { aegis: { ore: 1, fuel: 0, food: 0, water: 0, materials: 0, securityTeams: 0 } },
  })));

  expect(onSession).toHaveBeenCalledTimes(1);
  expect(onSession.mock.lastCall?.[0]).toMatchObject({
    setupRevision: 8,
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

it('drops delayed cached secondary query snapshots after a server snapshot', () => {
  const callbacks: Array<(snapshot: unknown) => void> = [];
  vi.mocked(onSnapshot).mockImplementation(((_reference: unknown, callback: unknown) => {
    callbacks.push(callback as (snapshot: unknown) => void);
    return vi.fn();
  }) as never);
  const onInstances = vi.fn();
  const onPlayers = vi.fn();
  const onEvents = vi.fn();
  const onDraws = vi.fn();
  subscribeGmInstances('secondary-race', onInstances, vi.fn());
  subscribeConnectedPlayers('secondary-race', onPlayers);
  subscribeSessionEvents('secondary-race', onEvents);
  const stopDraws = subscribeDamageDraws('secondary-race', onDraws);

  callbacks.forEach((callback) => {
    callback({ metadata: { fromCache: false }, docs: [] });
    callback({ metadata: { fromCache: true }, docs: [] });
  });

  expect(onInstances).toHaveBeenCalledTimes(1);
  expect(onPlayers).toHaveBeenCalledTimes(1);
  expect(onEvents).toHaveBeenCalledTimes(1);
  expect(onDraws).toHaveBeenCalledTimes(1);
  stopDraws();
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

  expect(onPlayers).not.toHaveBeenCalled();
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
  expect(onPrivateLoyalty).not.toHaveBeenCalled();
  expect(onSetupReceipt).not.toHaveBeenCalled();
  expect(onError).not.toHaveBeenCalled();
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
