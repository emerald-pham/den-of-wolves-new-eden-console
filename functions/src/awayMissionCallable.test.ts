import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CallableRequest } from 'firebase-functions/v2/https';
import { Timestamp } from 'firebase-admin/firestore';

const mock = vi.hoisted(() => ({
  get: vi.fn(),
  set: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
  marker: undefined as Record<string, unknown> | undefined,
  orphanEvent: false,
  discardMission: undefined as Record<string, unknown> | undefined,
  discardMissionId: 'mission-1',
  discardHand: undefined as Record<string, unknown> | undefined,
  discardPointer: undefined as Record<string, unknown> | undefined,
  pointerDocuments: {} as Record<string, Record<string, unknown>>,
  discardMarker: undefined as Record<string, unknown> | undefined,
  readyMarker: undefined as Record<string, unknown> | undefined,
  discardEvent: false,
  gorgoneionCaptain: false,
  arrivalPressureState: undefined as Record<string, unknown> | undefined,
  missionOpportunities: {} as Record<string, Record<string, unknown>>,
  missionStartSnapshots: {} as Record<string, Record<string, unknown>>,
  supportViews: [] as Array<{ id: string; fields: Record<string, unknown> }>,
  shuttleDockings: [] as Array<{ shuttleId: string; shipId: string; dockedAt: string }>,
  shuttleMovements: {} as Record<string, Record<string, unknown>>,
  pdfEscortWingState: undefined as Record<string, unknown> | undefined,
  navigationState: {} as Record<string, unknown>,
  fleetGroups: [] as Array<{ id: string; fields: Record<string, unknown> }>,
}));

vi.mock('firebase-admin/app', () => ({ initializeApp: vi.fn() }));
vi.mock('firebase-admin/firestore', () => ({
  Timestamp: class MockTimestamp {
    constructor(private readonly date: Date) {}
    static fromDate(value: Date) { return new MockTimestamp(value); }
    toDate() { return this.date; }
  },
  getFirestore: () => ({
    doc: (path: string) => ({ path, id: path.split('/').at(-1) }),
    collection: (path: string) => ({ path }),
    runTransaction: async (callback: (tx: unknown) => unknown) => callback({
      get: mock.get,
      set: mock.set,
      create: mock.create,
      update: mock.update,
      delete: mock.delete,
    }),
  }),
  FieldValue: { serverTimestamp: () => 'server-time', delete: () => 'delete-field' },
}));
vi.mock('node:crypto', () => ({ randomInt: vi.fn(() => 0), randomUUID: vi.fn(() => 'uuid') }));

import {
  applyGorgoneionMissionSupport,
  dealPrivateInitialCards,
  discardPrivateMissionCard,
  getGorgoneionMissionSupportProjection,
  openPrivateMissionDiscards,
} from './index';
import { roleOwnedCraftManifestForSetup } from './craftOwnership';
import { missionDeck, missionDeckStateFromCards } from './missionDeck';
import { recommendedRoleIds } from './roleConfiguration';
import { activeVesselIdsForRoles } from './gameSetup';
import { initialPdfEscortWingState } from './pdfEscortWingState';
import { emptySmallShipState } from './smallShip';

const activeRoleIds = [...recommendedRoleIds(8)];
const activeVesselIds = [...activeVesselIdsForRoles(activeRoleIds)];
const teamPhaseEndsAt = '2099-09-28T12:00:00.000Z';
const openAirspaceEndsAt = '2099-09-28T12:15:00.000Z';
const sessionFields = {
  phase: 'active',
  currentTurn: 2,
  setupRevision: 1,
  playerCount: 8,
  chartId: 'A',
  chartSelectionLocked: true,
  expansion: 'base',
  turnLimit: 6,
  dioneEnabled: false,
  capybaraEnabled: false,
  universalArbourEnabled: false,
  wolfCultEnabled: false,
  activeRoleIds,
  activeVesselIds,
  turnPhase: {
    turn: 2,
    teamPhaseEndsAt,
    openAirspaceEndsAt,
    airspace: { state: 'lifted', tickerActive: true, pressAccess: true },
  },
  turnState: {
    currentTurn: 2,
    maxTurn: 6,
    phase: 'coordination',
    phaseRevision: 3,
    startedAt: teamPhaseEndsAt,
    endsAt: openAirspaceEndsAt,
  },
};
const players = [
  { id: 'gm1', fields: { connected: true, role: 'gm', assignedRoleId: null, fleetGroupId: 'fleet-1' } },
  { id: 'alice', fields: { connected: true, role: 'player', assignedRoleId: 'wing-commander', fleetGroupId: 'fleet-1' } },
  { id: 'bob', fields: { connected: true, role: 'player', assignedRoleId: 'icebreaker-miner', fleetGroupId: 'fleet-1' } },
  { id: 'admiral', fields: { connected: true, role: 'player', assignedRoleId: 'admiral', fleetGroupId: 'fleet-1' } },
  { id: 'colonel', fields: { connected: true, role: 'player', assignedRoleId: 'refinery-124-pdf-colonel', fleetGroupId: 'fleet-1' } },
];
const deck = missionDeckStateFromCards(missionDeck());
const manifest = roleOwnedCraftManifestForSetup(activeRoleIds, 'none');
const defaultOpportunity = {
  type: 'mission-opportunity',
  status: 'available',
  sessionId: 's1',
  id: 'arrival-fleet-1-A-5143',
  groupId: 'fleet-1',
  chart: 'A',
  coordinate: '5143',
  siteCode: 'L',
  sourceShipId: 'aegis',
  sourceTransitionId: 'jump-entry-1',
  sourceCycle: 2,
};

function snapshot(fields: Record<string, unknown>, path: string, exists = true) {
  return {
    exists,
    id: path.split('/').at(-1),
    ref: { path },
    data: () => fields,
    get: (field: string) => fields[field],
  };
}

function request(data: Record<string, unknown>, uid = 'gm1') {
  return { data, auth: { uid } } as CallableRequest<Record<string, unknown>>;
}

beforeEach(() => {
  mock.get.mockReset();
  mock.set.mockReset();
  mock.set.mockImplementation((ref: { path: string }, value: Record<string, unknown>) => {
    if (!ref.path.includes('/awayMissionHandPointers/')) return;
    const handId = ref.path.split('/').at(-1)!;
    mock.pointerDocuments[handId] = value;
  });
  mock.create.mockReset();
  mock.update.mockReset();
  mock.delete.mockReset();
  mock.update.mockImplementation((ref: { path: string }, patch: Record<string, unknown>) => {
    if (!ref.path.includes('/awayMissionHandPointers/')) return;
    const handId = ref.path.split('/').at(-1)!;
    mock.pointerDocuments[handId] = { ...(mock.pointerDocuments[handId] ?? {}), ...patch };
  });
  sessionFields.currentTurn = 2;
  (sessionFields.turnPhase as Record<string, unknown>).turn = 2;
  (sessionFields.turnState as Record<string, unknown>).currentTurn = 2;
  (sessionFields.turnState as Record<string, unknown>).phaseRevision = 3;
  mock.marker = undefined;
  mock.orphanEvent = false;
  mock.discardMission = undefined;
  mock.discardMissionId = 'mission-1';
  mock.discardHand = undefined;
  mock.discardPointer = undefined;
  mock.pointerDocuments = {};
  mock.discardMarker = undefined;
  mock.readyMarker = undefined;
  mock.discardEvent = false;
  mock.gorgoneionCaptain = false;
  mock.arrivalPressureState = undefined;
  mock.missionOpportunities = { [defaultOpportunity.id]: { ...defaultOpportunity } };
  mock.missionStartSnapshots = {};
  mock.supportViews = [];
  mock.shuttleDockings = [
    { shuttleId: 'starlight', shipId: 'aegis', dockedAt: 'now' },
    { shuttleId: 'highwall', shipId: 'icebreaker', dockedAt: 'now' },
  ];
  mock.shuttleMovements = {};
  mock.pdfEscortWingState = undefined;
  mock.navigationState = {
    revision: 4,
    shipGalacticCoordinates: Object.fromEntries(activeVesselIds.map((vesselId) => [vesselId, '5143'])),
  };
  for (const player of players) {
    player.fields.connected = true;
    player.fields.fleetGroupId = 'fleet-1';
    if (player.id === 'alice') player.fields.assignedRoleId = 'wing-commander';
    if (player.id === 'bob') player.fields.assignedRoleId = 'icebreaker-miner';
  }
  mock.fleetGroups = [{
    id: 'fleet-1',
    fields: { id: 'fleet-1', vesselIds: activeVesselIds, memberUids: players.map(({ id }) => id) },
  }];
  mock.get.mockImplementation(async (ref: { path: string }) => {
    if (ref.path === 'sessions/s1') return snapshot({
      ...sessionFields,
      ...(mock.gorgoneionCaptain ? {
        smallShipStates: {
          gorgoneion: { ...emptySmallShipState('gorgoneion', 'aegis'), dockingRevision: 1 },
        },
      } : {}),
      shuttleDockings: mock.shuttleDockings,
      shuttleControl: {
        starlight: {
          shuttleId: 'starlight', ownerRoleId: 'wing-commander',
          ownerUid: 'alice', holderUid: 'alice', revision: 0,
        },
        highwall: {
          shuttleId: 'highwall', ownerRoleId: 'icebreaker-miner',
          ownerUid: 'bob', holderUid: 'bob', revision: 0,
        },
      },
      retainedShuttles: {},
    }, ref.path);
    if (ref.path === 'sessions/s1/players') {
      return { exists: true, docs: players.map(({ id, fields }) => snapshot(fields, `sessions/s1/players/${id}`)) };
    }
    if (ref.path === 'sessions/s1/gorgoneionMissionSupportViews') {
      return {
        exists: true,
        docs: mock.supportViews.map(({ id, fields }) =>
          snapshot(fields, `sessions/s1/gorgoneionMissionSupportViews/${id}`)),
      };
    }
    if (ref.path === 'sessions/s1/fleetGroups') {
      return {
        exists: true,
        docs: mock.fleetGroups.map(({ id, fields }) => snapshot(
          fields,
          `sessions/s1/fleetGroups/${id}`,
        )),
      };
    }
    const player = players.find(({ id }) => ref.path === `sessions/s1/players/${id}`);
    if (player) return snapshot(player.fields, ref.path);
    if (ref.path === 'sessions/s1/gmInstances/bridge') {
      const now = new Date();
      return snapshot({ uid: 'gm1', connected: true, claimedAt: Timestamp.fromDate(now), lastSeenAt: Timestamp.fromDate(now) }, ref.path);
    }
    if (ref.path === 'sessions/s1/craftOwnership/manifest') return snapshot(manifest, ref.path);
    if (ref.path === 'sessions/s1/serverState/missionDeck') return snapshot(deck, ref.path);
    if (ref.path === 'sessions/s1/serverState/navigation') return snapshot(mock.navigationState, ref.path);
    if (ref.path === 'sessions/s1/serverState/pdfEscortWing') {
      return snapshot(mock.pdfEscortWingState ?? {}, ref.path, mock.pdfEscortWingState !== undefined);
    }
    if (ref.path.startsWith('sessions/s1/shuttleDepartures/')) {
      const shuttleId = ref.path.split('/').at(-1)!;
      const movement = mock.shuttleMovements[shuttleId];
      return snapshot(movement ?? {}, ref.path, movement !== undefined);
    }
    if (ref.path.startsWith('sessions/s1/missionOpportunities/')) {
      const opportunityId = ref.path.split('/').at(-1)!;
      const opportunity = mock.missionOpportunities[opportunityId];
      return snapshot(opportunity ?? {}, ref.path, opportunity !== undefined);
    }
    if (ref.path.startsWith('sessions/s1/missionStartSnapshots/')) {
      const opportunityId = ref.path.split('/').at(-1)!;
      const start = mock.missionStartSnapshots[opportunityId];
      return snapshot(start ?? {}, ref.path, start !== undefined);
    }
    if (ref.path === 'sessions/s1/serverState/wolfArrivalPressure/groups/fleet-1') {
      return snapshot(
        mock.arrivalPressureState ?? {},
        ref.path,
        mock.arrivalPressureState !== undefined,
      );
    }
    if (ref.path === 'sessions/s1/commandReceipts/deal-1' && mock.marker) return snapshot(mock.marker, ref.path);
    if (ref.path === 'sessions/s1/events/mission-cards-dealt-deal-1' && mock.orphanEvent) {
      return snapshot({ type: 'mission-cards-dealt' }, ref.path);
    }
    if (ref.path === 'sessions/s1/commandReceipts/discard-1' && mock.discardMarker) {
      return snapshot(mock.discardMarker, ref.path);
    }
    if (ref.path === 'sessions/s1/commandReceipts/ready-1' && mock.readyMarker) {
      return snapshot(mock.readyMarker, ref.path);
    }
    if (ref.path === 'sessions/s1/events/mission-card-discarded-discard-1' && mock.discardEvent) {
      return snapshot({ type: 'mission-card-discarded' }, ref.path);
    }
    if (ref.path === `sessions/s1/serverState/awayMissions/instances/${mock.discardMissionId}` && mock.discardMission) {
      return snapshot(mock.discardMission, ref.path);
    }
    if (ref.path === 'sessions/s1/awayMissionHands/m9_mission-1u5_alice' && mock.discardHand) {
      return snapshot(mock.discardHand, ref.path);
    }
    if (ref.path === 'sessions/s1/awayMissionHandPointers/m9_mission-1u5_alice' && mock.discardPointer) {
      return snapshot(mock.discardPointer, ref.path);
    }
    if (ref.path.startsWith('sessions/s1/awayMissionHandPointers/')) {
      const handId = ref.path.split('/').at(-1)!;
      const pointer = mock.pointerDocuments[handId];
      return snapshot(pointer ?? {}, ref.path, pointer !== undefined);
    }
    if (ref.path.includes('/serverState/awayMissions/instances/')) return snapshot({}, ref.path, false);
    return snapshot({}, ref.path, false);
  });
});

describe('Gorgoneion mission-support callable exports', () => {
  it('exposes the private projection and atomic apply endpoints with shared receipts', async () => {
    mock.gorgoneionCaptain = true;
    const captain = players.find(({ id }) => id === 'bob')!;
    Object.assign(captain.fields, {
      replacementRoleId: 'gorgoneion-captain', replacementStatus: null,
      activeConsoleRoleId: null, seatId: null,
    });

    const projection = await getGorgoneionMissionSupportProjection.run(request({ sessionId: 's1' }, 'bob'));
    expect(projection).toMatchObject({
      status: 'available', sessionId: 's1', actorUid: 'bob', hostShipId: 'aegis',
      dockingRevision: 1, dealtCount: 0,
    });
    expect(projection.cardIds).toHaveLength(5);
    expect(mock.set).toHaveBeenCalledWith(
      expect.objectContaining({ path: 'sessions/s1/gorgoneionMissionSupportViews/bob' }),
      expect.objectContaining({ actorUid: 'bob', cardIds: projection.cardIds }),
    );

    const reply = await applyGorgoneionMissionSupport.run(request({
      sessionId: 's1', requestId: 'support-export', actorUid: 'bob',
      hostShipId: projection.hostShipId, dockingRevision: projection.dockingRevision,
      dealtCount: 0, cardIds: projection.cardIds,
      topCardIds: [projection.cardIds[0], projection.cardIds[2], projection.cardIds[4]],
      bottomCardIds: [projection.cardIds[1], projection.cardIds[3]],
    }, 'bob'));
    expect(reply).toEqual({
      status: 'committed', sessionId: 's1', requestId: 'support-export', cardCount: 5,
    });
    expect(mock.create).toHaveBeenCalledWith(
      expect.objectContaining({ path: 'sessions/s1/commandReceipts/support-export' }),
      expect.objectContaining({
        fingerprint: expect.objectContaining({ action: 'gorgoneion-mission-support', actorUid: 'bob' }),
        result: reply,
      }),
    );
  });
});

describe('discardPrivateMissionCard', () => {
  const command = {
    sessionId: 's1', requestId: 'discard-1', expectedSetupRevision: 1,
    missionId: 'mission-1', cardId: 'A♥',
  };

  beforeEach(() => {
    mock.discardMission = {
      schemaVersion: 1,
      missionId: 'mission-1',
      participantSnapshots: [{ uid: 'alice', roleId: 'wing-commander' }],
      handIds: ['m9_mission-1u5_alice'],
      phase: 'discarding',
      discardedParticipantUids: [],
      discardedCardIds: [],
      revision: 0,
    };
    mock.discardHand = {
      type: 'away-mission-hand', sessionId: 's1', handId: 'm9_mission-1u5_alice',
      missionId: 'mission-1', participantUid: 'alice', cardId: 'A♥', rank: 'A', suit: 'hearts', value: 10,
    };
    mock.discardPointer = {
      type: 'away-mission-hand-pointer', sessionId: 's1', participantUid: 'alice',
      missionId: 'mission-1', handId: 'm9_mission-1u5_alice', phase: 'discarding',
      revision: 1, discarded: false,
    };
  });

  it('consumes exactly one owned card without returning card identity or content', async () => {
    await expect(discardPrivateMissionCard.run(request(command, 'alice'))).resolves.toEqual({
      status: 'committed', sessionId: 's1', requestId: 'discard-1',
      missionId: 'mission-1', expectedSetupRevision: 1,
    });
    expect(mock.update).toHaveBeenCalledWith(
      expect.objectContaining({ path: 'sessions/s1/awayMissionHands/m9_mission-1u5_alice' }),
      expect.objectContaining({ discarded: true, discardedAt: 'server-time' }),
    );
    expect(mock.update).toHaveBeenCalledWith(
      expect.objectContaining({ path: 'sessions/s1/serverState/awayMissions/instances/mission-1' }),
      expect.objectContaining({
        discardedParticipantUids: ['alice'], discardedCardIds: ['A♥'], revision: 1,
      }),
    );
    const eventWrite = mock.set.mock.calls.find(([ref]) => ref.path === 'sessions/s1/events/mission-card-discarded-discard-1');
    expect(eventWrite?.[1]).not.toHaveProperty('cardId');
    expect(eventWrite?.[1]).not.toHaveProperty('participantUid');
    expect(mock.get).toHaveBeenCalledWith(
      expect.objectContaining({ path: 'sessions/s1/awayMissionHandPointers/m9_mission-1u5_alice' }),
    );
  });

  it('replays the same request without consuming a second card', async () => {
    const first = await discardPrivateMissionCard.run(request(command, 'alice'));
    const markerWrite = mock.set.mock.calls.find(([ref]) => ref.path === 'sessions/s1/commandReceipts/discard-1');
    mock.discardMarker = markerWrite?.[1];
    mock.set.mockClear();
    mock.update.mockClear();
    await expect(discardPrivateMissionCard.run(request(command, 'alice'))).resolves.toMatchObject({ status: 'replayed' });
    expect(mock.set).not.toHaveBeenCalled();
    expect(mock.update).not.toHaveBeenCalled();
    expect(first).toMatchObject({ status: 'committed' });
  });

  it('rejects a non-participant before private state can be changed', async () => {
    await expect(discardPrivateMissionCard.run(request(command, 'bob'))).rejects.toMatchObject({ code: 'permission-denied' });
    expect(mock.set).not.toHaveBeenCalled();
    expect(mock.update).not.toHaveBeenCalled();
  });

  it('returns a stale result without consuming a card after the setup revision changes', async () => {
    const staleCommand = { ...command, expectedSetupRevision: 0 };
    await expect(discardPrivateMissionCard.run(request(staleCommand, 'alice'))).resolves.toEqual({
      status: 'stale', sessionId: 's1', requestId: 'discard-1', missionId: 'mission-1',
      expectedSetupRevision: 0, currentSetupRevision: 1,
    });
    expect(mock.update).not.toHaveBeenCalled();
    const markerWrite = mock.set.mock.calls.find(([ref]) => ref.path === 'sessions/s1/commandReceipts/discard-1');
    expect(markerWrite?.[1]).not.toHaveProperty('cardId');
  });

  it('keeps the mission in discarding until every recorded participant has discarded', async () => {
    mock.discardMission = {
      ...mock.discardMission,
      participantSnapshots: [
        { uid: 'alice', roleId: 'wing-commander' },
        { uid: 'bob', roleId: 'icebreaker-miner' },
      ],
      handIds: ['m9_mission-1u5_alice', 'm9_mission-1u3_bob'],
    };
    await expect(discardPrivateMissionCard.run(request(command, 'alice'))).resolves.toMatchObject({ status: 'committed' });
    expect(mock.update).toHaveBeenCalledWith(
      expect.objectContaining({ path: 'sessions/s1/serverState/awayMissions/instances/mission-1' }),
      expect.objectContaining({ phase: 'discarding', discardedParticipantUids: ['alice'] }),
    );
  });

  it('rejects a previously discarded card and an assignment-ready mission', async () => {
    mock.discardHand = { ...mock.discardHand, discarded: true };
    await expect(discardPrivateMissionCard.run(request(command, 'alice'))).rejects.toMatchObject({ code: 'failed-precondition' });
    expect(mock.update).not.toHaveBeenCalled();

    mock.discardHand = { ...mock.discardHand, discarded: undefined };
    mock.discardMission = { ...mock.discardMission, phase: 'assignment-ready' };
    await expect(discardPrivateMissionCard.run({ ...request(command, 'alice'), data: command })).rejects.toMatchObject({ code: 'failed-precondition' });
    expect(mock.update).not.toHaveBeenCalled();
  });
});

describe('openPrivateMissionDiscards', () => {
  it('requires the explicit awaiting-card-selection phase and updates private pointers', async () => {
    mock.discardMission = {
      schemaVersion: 1,
      missionId: 'mission-1',
      phase: 'awaiting-card-selection',
      revision: 0,
      participantSnapshots: [
        { uid: 'alice', roleId: 'wing-commander' },
        { uid: 'bob', roleId: 'icebreaker-miner' },
      ],
      handIds: ['m9_mission-1u5_alice', 'm9_mission-1u3_bob'],
      groupId: 'fleet-1', chart: 'A', coordinate: '5143', siteCode: 'L', sourceCycle: 2,
      missionLeaderUid: 'alice', missionLeaderRoleId: 'wing-commander',
    };
    mock.pointerDocuments = {
      'm9_mission-1u5_alice': {
        type: 'away-mission-hand-pointer', sessionId: 's1', participantUid: 'alice',
        missionId: 'mission-1', handId: 'm9_mission-1u5_alice',
        groupId: 'fleet-1', chart: 'A', coordinate: '5143', siteCode: 'L', sourceCycle: 2,
        participantCount: 2, missionLeaderUid: 'alice', missionLeaderRoleId: 'wing-commander',
      },
      'm9_mission-1u3_bob': {
        type: 'away-mission-hand-pointer', sessionId: 's1', participantUid: 'bob',
        missionId: 'mission-1', handId: 'm9_mission-1u3_bob',
        groupId: 'fleet-1', chart: 'A', coordinate: '5143', siteCode: 'L', sourceCycle: 2,
        participantCount: 2, missionLeaderUid: 'alice', missionLeaderRoleId: 'wing-commander',
      },
    };
    await expect(openPrivateMissionDiscards.run(request({
      sessionId: 's1', instanceId: 'bridge', requestId: 'ready-1',
      expectedSetupRevision: 1, missionId: 'mission-1',
    }))).resolves.toEqual({
      status: 'committed', sessionId: 's1', requestId: 'ready-1', missionId: 'mission-1',
      participantCount: 2, expectedSetupRevision: 1,
    });
    expect(mock.update).toHaveBeenCalledWith(
      expect.objectContaining({ path: 'sessions/s1/serverState/awayMissions/instances/mission-1' }),
      expect.objectContaining({ phase: 'discarding', revision: 1 }),
    );
    expect(mock.update.mock.calls.filter(([ref]) => ref.path.includes('/awayMissionHandPointers/'))).toHaveLength(2);
    expect(mock.update.mock.calls.map(([ref]) => ref.path)).toEqual(expect.arrayContaining([
      'sessions/s1/awayMissionHandPointers/m9_mission-1u5_alice',
      'sessions/s1/awayMissionHandPointers/m9_mission-1u3_bob',
    ]));
    expect(mock.pointerDocuments['m9_mission-1u5_alice']).toMatchObject({
      phase: 'discarding', revision: 1, discarded: false,
      groupId: 'fleet-1', chart: 'A', coordinate: '5143', siteCode: 'L', sourceCycle: 2,
      participantCount: 2, missionLeaderUid: 'alice', missionLeaderRoleId: 'wing-commander',
    });
    expect(mock.pointerDocuments['m9_mission-1u3_bob']).toMatchObject({
      phase: 'discarding', revision: 1, discarded: false,
      groupId: 'fleet-1', chart: 'A', coordinate: '5143', siteCode: 'L', sourceCycle: 2,
      participantCount: 2, missionLeaderUid: 'alice', missionLeaderRoleId: 'wing-commander',
    });
  });

  it('fails closed when a legacy mission has no explicit selection phase', async () => {
    mock.discardMission = {
      schemaVersion: 1,
      missionId: 'mission-1',
      participantSnapshots: [{ uid: 'alice', roleId: 'wing-commander' }],
      handIds: ['m9_mission-1u5_alice'],
    };
    await expect(openPrivateMissionDiscards.run(request({
      sessionId: 's1', instanceId: 'bridge', requestId: 'ready-legacy',
      expectedSetupRevision: 1, missionId: 'mission-1',
    }))).rejects.toMatchObject({ code: 'failed-precondition' });
    expect(mock.update).not.toHaveBeenCalled();
  });

  it('replays a stale readiness receipt with its zero participant count', async () => {
    mock.discardMission = {
      schemaVersion: 1,
      missionId: 'mission-1',
      phase: 'awaiting-card-selection',
      revision: 0,
      participantSnapshots: [{ uid: 'alice', roleId: 'wing-commander' }],
      handIds: ['m9_mission-1u5_alice'],
    };
    const command = {
      sessionId: 's1', instanceId: 'bridge', requestId: 'ready-1',
      expectedSetupRevision: 0, missionId: 'mission-1',
    };
    await expect(openPrivateMissionDiscards.run(request(command))).resolves.toMatchObject({
      status: 'stale', participantCount: 0, currentSetupRevision: 1,
    });
    const markerWrite = mock.set.mock.calls.find(([ref]) => ref.path === 'sessions/s1/commandReceipts/ready-1');
    mock.readyMarker = markerWrite?.[1];
    mock.set.mockClear();
    mock.update.mockClear();
    await expect(openPrivateMissionDiscards.run(request(command))).resolves.toMatchObject({
      status: 'replayed', participantCount: 0, currentSetupRevision: 1,
    });
    expect(mock.set).not.toHaveBeenCalled();
    expect(mock.update).not.toHaveBeenCalled();
  });
});

describe('dealPrivateInitialCards', () => {
  const command = {
    sessionId: 's1', instanceId: 'bridge', requestId: 'deal-1',
    expectedSetupRevision: 1, expectedPhaseRevision: 3, expectedCycle: 2,
    opportunityId: defaultOpportunity.id, groupId: 'fleet-1', chart: 'A',
    coordinate: '5143', sourceCycle: 2, missionLeaderUid: 'alice',
    participantUids: ['alice', 'bob'],
  };

  it('rejects a team-selected Mission Leader who is outside the source-bound participant roster', async () => {
    await expect(dealPrivateInitialCards.run(request({
      ...command,
      opportunityId: 'arrival-fleet-1-A-5143',
      groupId: 'fleet-1',
      chart: 'A',
      coordinate: '5143',
      sourceCycle: 2,
      expectedPhaseRevision: 3,
      expectedCycle: 2,
      participantUids: ['alice'],
      missionLeaderUid: 'bob',
    }))).rejects.toBeDefined();
    expect(mock.set).not.toHaveBeenCalled();
    expect(mock.update).not.toHaveBeenCalled();
  });

  it('deals one card per selected eligible participant and never includes cards in the reply', async () => {
    mock.pdfEscortWingState = {
      ...initialPdfEscortWingState(), revision: 1, attackId: 'attack-1', attackCycle: 1,
      fighters: 0, launched: true, losses: 4,
    };
    await expect(dealPrivateInitialCards.run(request(command))).resolves.toEqual({
      status: 'committed', sessionId: 's1', requestId: 'deal-1',
      opportunityId: defaultOpportunity.id, snapshotId: defaultOpportunity.id,
      missionId: `mission-${defaultOpportunity.id}`, groupId: 'fleet-1',
      coordinate: '5143', sourceCycle: 2, participantCount: 2,
      missionLeaderUid: 'alice', expectedSetupRevision: 1,
      expectedPhaseRevision: 3, expectedCycle: 2,
    });
    const handWrites = mock.set.mock.calls.filter(([ref]) => ref.path.includes('/awayMissionHands/'));
    expect(handWrites).toHaveLength(2);
    expect(handWrites.map(([, value]) => value.cardId)).toEqual(['A♥', '4♥']);
    expect(mock.set.mock.calls.some(([ref, value]) =>
      ref.path === `sessions/s1/serverState/awayMissions/instances/mission-${defaultOpportunity.id}` &&
      value.phase === 'awaiting-card-selection' && value.revision === 0 &&
      Array.isArray(value.discardedParticipantUids) && value.discardedParticipantUids.length === 0,
    )).toBe(true);
    expect(mock.set.mock.calls.filter(([ref]) => ref.path.includes('/awayMissionHandPointers/'))).toHaveLength(2);
    expect(mock.set.mock.calls.some(([ref, value]) =>
      ref.path === 'sessions/s1/events/mission-cards-dealt-deal-1' &&
      Object.prototype.hasOwnProperty.call(value, 'cardId'))).toBe(false);
    const startWrite = mock.create.mock.calls.find(([ref]) =>
      ref.path === `sessions/s1/missionStartSnapshots/${defaultOpportunity.id}`);
    expect(startWrite?.[1]).toMatchObject({
      type: 'away-mission-start-snapshot', sessionId: 's1',
      opportunityId: defaultOpportunity.id, missionId: `mission-${defaultOpportunity.id}`,
      groupId: 'fleet-1', chart: 'A', coordinate: '5143', sourceCycle: 2,
      missionLeader: { uid: 'alice', roleId: 'wing-commander' },
      source: { assumptionId: 'PC04-A1', ruleId: 'new-location-mission-with-team-selected-leader' },
      inputs: {
        expectedSetupRevision: 1, expectedPhaseRevision: 3, expectedCycle: 2,
        availableCarrierCraftIds: ['starlight', 'highwall'],
        missionLeaderUid: 'alice',
        participantSnapshots: expect.arrayContaining([
          { uid: 'alice', roleId: 'wing-commander' },
          { uid: 'bob', roleId: 'icebreaker-miner' },
        ]),
      },
      modifiers: [], outcome: 'started',
      stateDelta: { missionSnapshotCreated: true, participantHandCount: 2, participantPointerCount: 2 },
      revisions: { setup: 1, phase: { cycle: 2, phase: 'coordination', revision: 3 } },
      replay: { status: 'committed', requestId: 'deal-1' },
      recovery: { duplicateStart: expect.any(String) },
    });
    expect(startWrite?.[1].inputs).not.toHaveProperty('participantSnapshots.0.craftIds');
    expect(startWrite?.[1].inputs?.participantSnapshots).toEqual([
      { uid: 'alice', roleId: 'wing-commander' },
      { uid: 'bob', roleId: 'icebreaker-miner' },
    ]);
    const missionWrite = mock.set.mock.calls.find(([ref]) =>
      ref.path === `sessions/s1/serverState/awayMissions/instances/mission-${defaultOpportunity.id}`);
    expect(missionWrite?.[1]).toMatchObject({
      availableCarrierCraftIds: ['starlight', 'highwall'],
      participantSnapshots: [
        { uid: 'alice', roleId: 'wing-commander' },
        { uid: 'bob', roleId: 'icebreaker-miner' },
      ],
    });
    expect(mock.update).toHaveBeenCalledWith(
      expect.objectContaining({ path: 'sessions/s1/serverState/missionDeck' }),
      expect.objectContaining({ dealtCount: 2 }),
    );
  });

  it('clears private Gorgoneion projections in the same committed card-deal transaction', async () => {
    mock.supportViews = [
      { id: 'captain-a', fields: { cardIds: ['A♥', '4♥', '5♥', '6♥', '7♥'] } },
      { id: 'captain-b', fields: { cardIds: ['8♥', '9♥', '10♥', 'J♥', 'Q♥'] } },
    ];

    await dealPrivateInitialCards.run(request(command));

    expect(mock.delete).toHaveBeenCalledTimes(2);
    expect(mock.delete).toHaveBeenCalledWith(expect.objectContaining({
      path: 'sessions/s1/gorgoneionMissionSupportViews/captain-a',
    }));
    expect(mock.delete).toHaveBeenCalledWith(expect.objectContaining({
      path: 'sessions/s1/gorgoneionMissionSupportViews/captain-b',
    }));
  });

  it('keeps the exact start group and leader projection through opening private discards', async () => {
    mock.pdfEscortWingState = {
      ...initialPdfEscortWingState(), revision: 1, attackId: 'attack-1', attackCycle: 1,
      fighters: 0, launched: true, losses: 4,
    };
    const missionId = `mission-${defaultOpportunity.id}`;
    await dealPrivateInitialCards.run(request(command));
    const missionWrite = mock.set.mock.calls.find(([ref]) =>
      ref.path === `sessions/s1/serverState/awayMissions/instances/${missionId}`);
    expect(missionWrite).toBeDefined();
    mock.discardMission = missionWrite?.[1];
    mock.discardMissionId = missionId;
    mock.update.mockClear();

    await expect(openPrivateMissionDiscards.run(request({
      sessionId: 's1', instanceId: 'bridge', requestId: 'ready-after-start',
      expectedSetupRevision: 1, missionId,
    }))).resolves.toMatchObject({ status: 'committed', missionId, participantCount: 2 });

    const pointerUpdates = mock.update.mock.calls.filter(([ref]) => ref.path.includes('/awayMissionHandPointers/'));
    expect(pointerUpdates).toHaveLength(2);
    expect(Object.values(mock.pointerDocuments)).toHaveLength(2);
    for (const pointer of Object.values(mock.pointerDocuments)) {
      expect(pointer).toMatchObject({
        groupId: 'fleet-1', chart: 'A', coordinate: '5143', siteCode: 'L', sourceCycle: 2,
        participantCount: 2, missionLeaderUid: 'alice', missionLeaderRoleId: 'wing-commander',
        phase: 'discarding', revision: 1,
      });
    }
  });

  it('replays the same request without writing a second hand', async () => {
    const first = await dealPrivateInitialCards.run(request(command));
    const markerWrite = mock.set.mock.calls.find(([ref]) => ref.path === 'sessions/s1/commandReceipts/deal-1');
    mock.marker = markerWrite?.[1];
    const startWrite = mock.create.mock.calls.find(([ref]) =>
      ref.path === `sessions/s1/missionStartSnapshots/${defaultOpportunity.id}`);
    mock.missionStartSnapshots[defaultOpportunity.id] = startWrite?.[1] as Record<string, unknown>;
    mock.set.mockClear();
    mock.create.mockClear();
    mock.update.mockClear();
    await expect(dealPrivateInitialCards.run(request(command))).resolves.toMatchObject({ status: 'replayed' });
    expect(mock.set).not.toHaveBeenCalled();
    expect(mock.create).not.toHaveBeenCalled();
    expect(mock.update).not.toHaveBeenCalled();
    expect(first).toMatchObject({ status: 'committed' });
  });

  it('blocks the group while an L/M base is operational without consuming cards', async () => {
    mock.arrivalPressureState = {
      type: 'wolf-base-arrival-pressure-state', groupId: 'fleet-1', chart: 'A', revision: 1,
      entries: [{
        type: 'wolf-base-arrival-pressure', status: 'operational',
        groupId: 'fleet-1', chart: 'A', coordinate: '5143', siteCode: 'L',
        sourceShipId: 'aegis', sourceTransitionId: 'jump-entry-1', cycle: 2, revision: 1,
        attackStatus: 'scheduled', arrivalTiming: 'immediate',
        minimumBattleStations: 1, minimumOtherShipDamage: 20,
        missionAccess: 'blockedWhileWolfBaseOperational',
        recurringUntil: ['baseDestroyed', 'jumpAway'],
      }],
    };
    await expect(dealPrivateInitialCards.run(request(command))).rejects.toMatchObject({
      code: 'failed-precondition',
      message: expect.stringMatching(/blocked while the Wolf base is operational/i),
    });
    expect(mock.set).not.toHaveBeenCalled();
    expect(mock.update).not.toHaveBeenCalled();
  });

  it.each(['stale-pointer', 'missing-group', 'non-member', 'disconnected'] as const)(
    'rejects %s fleet-group authority without consuming mission cards',
    async (scenario) => {
      if (scenario === 'stale-pointer') players[1]!.fields.fleetGroupId = 'fleet-2';
      if (scenario === 'missing-group') mock.fleetGroups = [];
      if (scenario === 'non-member') {
        mock.fleetGroups[0]!.fields.memberUids = ['gm1', 'bob'];
      }
      if (scenario === 'disconnected') players[1]!.fields.connected = false;
      await expect(dealPrivateInitialCards.run(request(command))).rejects.toMatchObject({
        code: 'failed-precondition',
      });
      expect(mock.set).not.toHaveBeenCalled();
      expect(mock.create).not.toHaveBeenCalled();
      expect(mock.update).not.toHaveBeenCalled();
    },
  );

  it('rejects pressure whose L/M code does not match the locked chart coordinate', async () => {
    mock.arrivalPressureState = {
      type: 'wolf-base-arrival-pressure-state', groupId: 'fleet-1', chart: 'A', revision: 1,
      entries: [{
        type: 'wolf-base-arrival-pressure', status: 'operational',
        groupId: 'fleet-1', chart: 'A', coordinate: '9997', siteCode: 'L',
        sourceShipId: 'aegis', sourceTransitionId: 'jump-forged', cycle: 2, revision: 1,
        attackStatus: 'scheduled', arrivalTiming: 'immediate',
        minimumBattleStations: 1, minimumOtherShipDamage: 20,
        missionAccess: 'blockedWhileWolfBaseOperational',
        recurringUntil: ['baseDestroyed', 'jumpAway'],
      }],
    };
    await expect(dealPrivateInitialCards.run(request(command))).rejects.toMatchObject({
      code: 'failed-precondition', details: { commandError: 'malformed-input' },
    });
    expect(mock.set).not.toHaveBeenCalled();
    expect(mock.create).not.toHaveBeenCalled();
    expect(mock.update).not.toHaveBeenCalled();
  });

  it('rejects an opportunity whose source cycle does not match the selected arrival', async () => {
    await expect(dealPrivateInitialCards.run(request({ ...command, sourceCycle: 1 })))
      .rejects.toMatchObject({ code: 'failed-precondition' });
    expect(mock.set).not.toHaveBeenCalled();
    expect(mock.create).not.toHaveBeenCalled();
    expect(mock.update).not.toHaveBeenCalled();
  });

  it('rejects a missing arrival opportunity and a roster without current carriage', async () => {
    mock.missionOpportunities = {};
    await expect(dealPrivateInitialCards.run(request(command)))
      .rejects.toMatchObject({ code: 'failed-precondition' });
    expect(mock.set).not.toHaveBeenCalled();
    expect(mock.create).not.toHaveBeenCalled();
    expect(mock.update).not.toHaveBeenCalled();

    mock.missionOpportunities = { [defaultOpportunity.id]: { ...defaultOpportunity } };
    mock.shuttleDockings = [];
    mock.pdfEscortWingState = {
      ...initialPdfEscortWingState(), revision: 1, attackId: 'attack-1', attackCycle: 1,
      fighters: 0, launched: true, losses: 4,
    };
    await expect(dealPrivateInitialCards.run(request({
      ...command, participantUids: ['admiral'], missionLeaderUid: 'admiral',
    }))).rejects.toMatchObject({ code: 'failed-precondition' });
    expect(mock.set).not.toHaveBeenCalled();
    expect(mock.create).not.toHaveBeenCalled();
    expect(mock.update).not.toHaveBeenCalled();
  });

  it('allows a connected same-group teammate to join as Mission Leader when a current shuttle carries the roster', async () => {
    mock.pdfEscortWingState = {
      ...initialPdfEscortWingState(), revision: 1, attackId: 'attack-1', attackCycle: 1,
      fighters: 0, launched: true, losses: 4,
    };
    await expect(dealPrivateInitialCards.run(request({
      ...command,
      participantUids: ['alice', 'admiral'],
      missionLeaderUid: 'admiral',
    }))).resolves.toMatchObject({
      status: 'committed', participantCount: 2, missionLeaderUid: 'admiral',
    });
    const startWrite = mock.create.mock.calls.find(([ref]) =>
      ref.path === `sessions/s1/missionStartSnapshots/${defaultOpportunity.id}`);
    expect(startWrite?.[1]).toMatchObject({
      inputs: {
        availableCarrierCraftIds: ['starlight', 'highwall'],
        participantSnapshots: expect.arrayContaining([
          { uid: 'admiral', roleId: 'admiral' },
        ]),
        missionLeaderUid: 'admiral',
      },
    });
  });

  it.each([
    ['no current eligible docking', () => { mock.shuttleDockings = []; }],
    ['a pending shuttle transit', () => {
      mock.shuttleDockings = [{ shuttleId: 'starlight', shipId: 'aegis', dockedAt: 'now' }];
      mock.shuttleMovements.starlight = { status: 'in-transit', shuttleId: 'starlight' };
    }],
    ['an eligible craft parked outside the opportunity group', () => {
      mock.shuttleDockings = [{ shuttleId: 'starlight', shipId: 'dione', dockedAt: 'now' }];
      const group = mock.fleetGroups[0]!;
      const fleetOneVessels = (group.fields.vesselIds as string[]).filter((shipId) => shipId !== 'dione');
      const fleetOneMembers = (group.fields.memberUids as string[]).filter((uid) => uid !== 'admiral');
      group.fields.vesselIds = fleetOneVessels;
      group.fields.memberUids = fleetOneMembers;
      players.find(({ id }) => id === 'admiral')!.fields.fleetGroupId = 'fleet-2';
      mock.fleetGroups.push({
        id: 'fleet-2', fields: { id: 'fleet-2', vesselIds: ['dione'], memberUids: ['admiral'] },
      });
    }],
    ['an eligible host away from the source coordinate', () => {
      mock.shuttleDockings = [{ shuttleId: 'starlight', shipId: 'aegis', dockedAt: 'now' }];
      mock.navigationState.shipGalacticCoordinates = Object.fromEntries(
        activeVesselIds.map((vesselId) => [vesselId, vesselId === 'aegis' ? '9997' : '5143']),
      );
    }],
  ] as const)('rejects a mission when it has %s', async (_label, arrange) => {
    mock.pdfEscortWingState = {
      ...initialPdfEscortWingState(), revision: 1, attackId: 'attack-1', attackCycle: 1,
      fighters: 0, launched: true, losses: 4,
    };
    arrange();
    await expect(dealPrivateInitialCards.run(request(command))).rejects.toMatchObject({
      code: 'failed-precondition',
    });
    expect(mock.set).not.toHaveBeenCalled();
    expect(mock.create).not.toHaveBeenCalled();
    expect(mock.update).not.toHaveBeenCalled();
  });

  it('rejects a depleted PDF Wing as the only available carrier', async () => {
    mock.shuttleDockings = [];
    mock.pdfEscortWingState = {
      ...initialPdfEscortWingState(), revision: 1, attackId: 'attack-1', attackCycle: 1,
      fighters: 0, launched: true, losses: 4,
    };
    await expect(dealPrivateInitialCards.run(request({
      ...command, participantUids: ['colonel'], missionLeaderUid: 'colonel',
    }))).rejects.toMatchObject({ code: 'failed-precondition' });
    expect(mock.create).not.toHaveBeenCalled();
    expect(mock.update).not.toHaveBeenCalled();
  });

  it('uses a live PDF Escort Wing at its printed group location as a carrier for a team-chosen roster', async () => {
    mock.shuttleDockings = [];
    mock.pdfEscortWingState = initialPdfEscortWingState();
    await expect(dealPrivateInitialCards.run(request({
      ...command,
      participantUids: ['admiral', 'colonel'],
      missionLeaderUid: 'admiral',
    }))).resolves.toMatchObject({ status: 'committed', participantCount: 2, missionLeaderUid: 'admiral' });
    const startWrite = mock.create.mock.calls.find(([ref]) =>
      ref.path === `sessions/s1/missionStartSnapshots/${defaultOpportunity.id}`);
    expect(startWrite?.[1]).toMatchObject({
      inputs: {
        availableCarrierCraftIds: ['pdf-escort-fighter-wing'],
        participantSnapshots: expect.arrayContaining([
          { uid: 'admiral', roleId: 'admiral' },
          { uid: 'colonel', roleId: 'refinery-124-pdf-colonel' },
        ]),
      },
    });
  });

  it('does not treat a surviving PDF Escort Wing outside the opportunity group as current carriage', async () => {
    mock.shuttleDockings = [];
    mock.pdfEscortWingState = initialPdfEscortWingState();
    const group = mock.fleetGroups[0]!;
    group.fields.vesselIds = (group.fields.vesselIds as string[]).filter((shipId) => shipId !== 'refinery-124');
    group.fields.memberUids = (group.fields.memberUids as string[]).filter((uid) => uid !== 'colonel');
    players.find(({ id }) => id === 'colonel')!.fields.fleetGroupId = 'fleet-2';
    mock.fleetGroups.push({
      id: 'fleet-2', fields: { id: 'fleet-2', vesselIds: ['refinery-124'], memberUids: ['colonel'] },
    });
    await expect(dealPrivateInitialCards.run(request({
      ...command, participantUids: ['admiral'], missionLeaderUid: 'admiral',
    }))).rejects.toMatchObject({ code: 'failed-precondition' });
    expect(mock.create).not.toHaveBeenCalled();
    expect(mock.update).not.toHaveBeenCalled();
  });

  it('does not let an earlier J/K cycle opportunity start after a later leave-and-return opportunity exists', async () => {
    const prior = {
      ...defaultOpportunity,
      id: 'arrival-fleet-1-A-8378-cycle-2', coordinate: '8378', siteCode: 'J',
      sourceShipId: 'aegis', sourceTransitionId: 'jump-entry-2', sourceCycle: 2,
    };
    const current = {
      ...prior,
      id: 'arrival-fleet-1-A-8378-cycle-3', sourceTransitionId: 'jump-entry-3', sourceCycle: 3,
    };
    mock.missionOpportunities = { [prior.id]: prior, [current.id]: current };
    mock.navigationState.shipGalacticCoordinates = Object.fromEntries(
      activeVesselIds.map((vesselId) => [vesselId, '8378']),
    );
    sessionFields.currentTurn = 3;
    (sessionFields.turnPhase as Record<string, unknown>).turn = 3;
    (sessionFields.turnState as Record<string, unknown>).currentTurn = 3;
    (sessionFields.turnState as Record<string, unknown>).phaseRevision = 4;
    await expect(dealPrivateInitialCards.run(request({
      ...command,
      opportunityId: prior.id, coordinate: '8378', sourceCycle: 2,
      expectedCycle: 3, expectedPhaseRevision: 4,
    }))).rejects.toMatchObject({ code: 'failed-precondition' });
    expect(mock.set).not.toHaveBeenCalled();
    expect(mock.create).not.toHaveBeenCalled();
    expect(mock.update).not.toHaveBeenCalled();
  });

  it('returns a stale revision receipt without starting a mission or dealing cards', async () => {
    await expect(dealPrivateInitialCards.run(request({ ...command, expectedPhaseRevision: 2 })))
      .resolves.toMatchObject({
        status: 'stale', expectedPhaseRevision: 2, currentPhaseRevision: 3,
      });
    expect(mock.create).not.toHaveBeenCalled();
    expect(mock.update).not.toHaveBeenCalled();
    expect(mock.set.mock.calls.map(([ref]) => ref.path)).toEqual(['sessions/s1/commandReceipts/deal-1']);
  });

  it('does not overwrite an opportunity that already has an immutable start snapshot', async () => {
    mock.missionStartSnapshots[defaultOpportunity.id] = { type: 'away-mission-start-snapshot' };
    await expect(dealPrivateInitialCards.run(request({ ...command, requestId: 'duplicate-start' })))
      .rejects.toMatchObject({ code: 'failed-precondition' });
    expect(mock.create).not.toHaveBeenCalled();
    expect(mock.set).not.toHaveBeenCalled();
    expect(mock.update).not.toHaveBeenCalled();
  });

  it('allows the group after its recorded Wolf base was left', async () => {
    mock.arrivalPressureState = {
      type: 'wolf-base-arrival-pressure-state', groupId: 'fleet-1', chart: 'A', revision: 2,
      entries: [{
        type: 'wolf-base-arrival-pressure', status: 'departed', endedBy: 'jumpAway',
        groupId: 'fleet-1', chart: 'A', coordinate: '5143', siteCode: 'L',
        sourceShipId: 'aegis', sourceTransitionId: 'jump-entry-1', cycle: 2, revision: 2,
        attackStatus: 'scheduled', arrivalTiming: 'immediate',
        minimumBattleStations: 1, minimumOtherShipDamage: 20,
        missionAccess: 'blockedWhileWolfBaseOperational',
        recurringUntil: ['baseDestroyed', 'jumpAway'],
      }],
    };
    await expect(dealPrivateInitialCards.run(request(command))).resolves.toMatchObject({
      status: 'committed', participantCount: 2,
    });
  });

  it('rejects a non-facilitator before private state can be read or written', async () => {
    await expect(dealPrivateInitialCards.run(request(command, 'alice'))).rejects.toMatchObject({ code: 'permission-denied' });
    expect(mock.set).not.toHaveBeenCalled();
    expect(mock.create).not.toHaveBeenCalled();
  });

  it('rejects an orphaned public event without writing a hand or advancing the deck', async () => {
    mock.orphanEvent = true;
    await expect(dealPrivateInitialCards.run(request(command))).rejects.toMatchObject({ code: 'failed-precondition' });
    expect(mock.set).not.toHaveBeenCalled();
    expect(mock.create).not.toHaveBeenCalled();
    expect(mock.update).not.toHaveBeenCalled();
  });

  it('keeps overlapping missions for the same participant on distinct pointers', async () => {
    const first = {
      ...command, requestId: 'deal-m1', participantUids: ['alice'],
    };
    const second = {
      ...command, requestId: 'deal-m2', opportunityId: 'arrival-fleet-1-A-8378-cycle-2',
      coordinate: '8378', sourceCycle: 2, participantUids: ['alice'],
    };
    mock.missionOpportunities[second.opportunityId] = {
      type: 'mission-opportunity', status: 'available', sessionId: 's1',
      id: second.opportunityId, groupId: 'fleet-1', chart: 'A', coordinate: '8378',
      siteCode: 'J', sourceShipId: 'aegis', sourceTransitionId: 'jump-entry-2', sourceCycle: 2,
    };
    await expect(dealPrivateInitialCards.run(request(first))).resolves.toMatchObject({
      missionId: `mission-${first.opportunityId}`,
    });
    mock.navigationState.shipGalacticCoordinates = Object.fromEntries(
      activeVesselIds.map((vesselId) => [vesselId, '8378']),
    );
    await expect(dealPrivateInitialCards.run(request(second))).resolves.toMatchObject({
      missionId: `mission-${second.opportunityId}`,
    });
    const pointerPaths = mock.set.mock.calls
      .filter(([ref]) => ref.path.includes('/awayMissionHandPointers/'))
      .map(([ref]) => ref.path);
    expect(pointerPaths).toEqual(expect.arrayContaining([
      `sessions/s1/awayMissionHandPointers/m${`mission-${first.opportunityId}`.length}_mission-${first.opportunityId}u5_alice`,
      `sessions/s1/awayMissionHandPointers/m${`mission-${second.opportunityId}`.length}_mission-${second.opportunityId}u5_alice`,
    ]));
    expect(new Set(pointerPaths).size).toBe(2);
  });
});
