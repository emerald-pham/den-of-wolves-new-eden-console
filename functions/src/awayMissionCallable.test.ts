import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CallableRequest } from 'firebase-functions/v2/https';
import { Timestamp } from 'firebase-admin/firestore';

const mock = vi.hoisted(() => ({
  get: vi.fn(),
  set: vi.fn(),
  update: vi.fn(),
  marker: undefined as Record<string, unknown> | undefined,
  orphanEvent: false,
  discardMission: undefined as Record<string, unknown> | undefined,
  discardHand: undefined as Record<string, unknown> | undefined,
  discardPointer: undefined as Record<string, unknown> | undefined,
  discardMarker: undefined as Record<string, unknown> | undefined,
  readyMarker: undefined as Record<string, unknown> | undefined,
  discardEvent: false,
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
      update: mock.update,
      delete: vi.fn(),
    }),
  }),
  FieldValue: { serverTimestamp: () => 'server-time', delete: () => 'delete-field' },
}));
vi.mock('node:crypto', () => ({ randomInt: vi.fn(() => 0), randomUUID: vi.fn(() => 'uuid') }));

import { dealPrivateInitialCards, discardPrivateMissionCard, openPrivateMissionDiscards } from './index';
import { roleOwnedCraftManifestForSetup } from './craftOwnership';
import { missionDeck, missionDeckStateFromCards } from './missionDeck';
import { recommendedRoleIds } from './roleConfiguration';

const activeRoleIds = [...recommendedRoleIds(8)];
const sessionFields = {
  phase: 'active',
  setupRevision: 1,
  playerCount: 8,
  chartId: 'A',
  expansion: 'base',
  turnLimit: 6,
  dioneEnabled: false,
  capybaraEnabled: false,
  universalArbourEnabled: false,
  wolfCultEnabled: false,
  activeRoleIds,
};
const players = [
  { id: 'gm1', fields: { connected: true, role: 'gm', assignedRoleId: null } },
  { id: 'alice', fields: { connected: true, role: 'player', assignedRoleId: 'wing-commander' } },
  { id: 'bob', fields: { connected: true, role: 'player', assignedRoleId: 'icebreaker-miner' } },
];
const deck = missionDeckStateFromCards(missionDeck());
const manifest = roleOwnedCraftManifestForSetup(activeRoleIds, 'none');

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
  mock.update.mockReset();
  mock.marker = undefined;
  mock.orphanEvent = false;
  mock.discardMission = undefined;
  mock.discardHand = undefined;
  mock.discardPointer = undefined;
  mock.discardMarker = undefined;
  mock.readyMarker = undefined;
  mock.discardEvent = false;
  mock.get.mockImplementation(async (ref: { path: string }) => {
    if (ref.path === 'sessions/s1') return snapshot(sessionFields, ref.path);
    if (ref.path === 'sessions/s1/players') {
      return { exists: true, docs: players.map(({ id, fields }) => snapshot(fields, `sessions/s1/players/${id}`)) };
    }
    const player = players.find(({ id }) => ref.path === `sessions/s1/players/${id}`);
    if (player) return snapshot(player.fields, ref.path);
    if (ref.path === 'sessions/s1/gmInstances/bridge') {
      const now = new Date();
      return snapshot({ uid: 'gm1', connected: true, claimedAt: Timestamp.fromDate(now), lastSeenAt: Timestamp.fromDate(now) }, ref.path);
    }
    if (ref.path === 'sessions/s1/craftOwnership/manifest') return snapshot(manifest, ref.path);
    if (ref.path === 'sessions/s1/serverState/missionDeck') return snapshot(deck, ref.path);
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
    if (ref.path === 'sessions/s1/serverState/awayMissions/instances/mission-1' && mock.discardMission) {
      return snapshot(mock.discardMission, ref.path);
    }
    if (ref.path === 'sessions/s1/awayMissionHands/m9_mission-1u5_alice' && mock.discardHand) {
      return snapshot(mock.discardHand, ref.path);
    }
    if (ref.path === 'sessions/s1/awayMissionHandPointers/m9_mission-1u5_alice' && mock.discardPointer) {
      return snapshot(mock.discardPointer, ref.path);
    }
    if (ref.path.includes('/serverState/awayMissions/instances/')) return snapshot({}, ref.path, false);
    return snapshot({}, ref.path, false);
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
      participantSnapshots: [{ uid: 'alice', roleId: 'wing-commander', craftIds: ['starlight'] }],
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
        { uid: 'alice', roleId: 'wing-commander', craftIds: ['starlight'] },
        { uid: 'bob', roleId: 'icebreaker-miner', craftIds: ['highwall'] },
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
        { uid: 'alice', roleId: 'wing-commander', craftIds: ['starlight'] },
        { uid: 'bob', roleId: 'icebreaker-miner', craftIds: ['highwall'] },
      ],
      handIds: ['m9_mission-1u5_alice', 'm9_mission-1u3_bob'],
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
    expect(mock.set.mock.calls.filter(([ref]) => ref.path.includes('/awayMissionHandPointers/'))).toHaveLength(2);
    expect(mock.set.mock.calls.map(([ref]) => ref.path)).toEqual(expect.arrayContaining([
      'sessions/s1/awayMissionHandPointers/m9_mission-1u5_alice',
      'sessions/s1/awayMissionHandPointers/m9_mission-1u3_bob',
    ]));
  });

  it('fails closed when a legacy mission has no explicit selection phase', async () => {
    mock.discardMission = {
      schemaVersion: 1,
      missionId: 'mission-1',
      participantSnapshots: [{ uid: 'alice', roleId: 'wing-commander', craftIds: ['starlight'] }],
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
      participantSnapshots: [{ uid: 'alice', roleId: 'wing-commander', craftIds: ['starlight'] }],
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
    expectedSetupRevision: 1, missionId: 'mission-1', participantUids: ['alice', 'bob'],
  };

  it('deals one card per selected eligible participant and never includes cards in the reply', async () => {
    await expect(dealPrivateInitialCards.run(request(command))).resolves.toEqual({
      status: 'committed', sessionId: 's1', requestId: 'deal-1', missionId: 'mission-1',
      participantCount: 2, expectedSetupRevision: 1,
    });
    const handWrites = mock.set.mock.calls.filter(([ref]) => ref.path.includes('/awayMissionHands/'));
    expect(handWrites).toHaveLength(2);
    expect(handWrites.map(([, value]) => value.cardId)).toEqual(['A♥', '4♥']);
    expect(mock.set.mock.calls.some(([ref, value]) =>
      ref.path === 'sessions/s1/serverState/awayMissions/instances/mission-1' &&
      value.phase === 'awaiting-card-selection' && value.revision === 0 &&
      Array.isArray(value.discardedParticipantUids) && value.discardedParticipantUids.length === 0,
    )).toBe(true);
    expect(mock.set.mock.calls.filter(([ref]) => ref.path.includes('/awayMissionHandPointers/'))).toHaveLength(2);
    expect(mock.set.mock.calls.some(([ref, value]) =>
      ref.path === 'sessions/s1/events/mission-cards-dealt-deal-1' &&
      Object.prototype.hasOwnProperty.call(value, 'cardId'))).toBe(false);
  });

  it('replays the same request without writing a second hand', async () => {
    const first = await dealPrivateInitialCards.run(request(command));
    const markerWrite = mock.set.mock.calls.find(([ref]) => ref.path === 'sessions/s1/commandReceipts/deal-1');
    mock.marker = markerWrite?.[1];
    mock.set.mockClear();
    await expect(dealPrivateInitialCards.run(request(command))).resolves.toMatchObject({ status: 'replayed' });
    expect(mock.set).not.toHaveBeenCalled();
    expect(first).toMatchObject({ status: 'committed' });
  });

  it('rejects a non-facilitator before private state can be read or written', async () => {
    await expect(dealPrivateInitialCards.run(request(command, 'alice'))).rejects.toMatchObject({ code: 'permission-denied' });
    expect(mock.set).not.toHaveBeenCalled();
  });

  it('rejects an orphaned public event without writing a hand or advancing the deck', async () => {
    mock.orphanEvent = true;
    await expect(dealPrivateInitialCards.run(request(command))).rejects.toMatchObject({ code: 'failed-precondition' });
    expect(mock.set).not.toHaveBeenCalled();
    expect(mock.update).not.toHaveBeenCalled();
  });

  it('keeps overlapping missions for the same participant on distinct pointers', async () => {
    const first = {
      ...command, requestId: 'deal-m1', missionId: 'mission-1', participantUids: ['alice'],
    };
    const second = {
      ...command, requestId: 'deal-m2', missionId: 'mission-2', participantUids: ['alice'],
    };
    await expect(dealPrivateInitialCards.run(request(first))).resolves.toMatchObject({ missionId: 'mission-1' });
    await expect(dealPrivateInitialCards.run(request(second))).resolves.toMatchObject({ missionId: 'mission-2' });
    const pointerPaths = mock.set.mock.calls
      .filter(([ref]) => ref.path.includes('/awayMissionHandPointers/'))
      .map(([ref]) => ref.path);
    expect(pointerPaths).toEqual(expect.arrayContaining([
      'sessions/s1/awayMissionHandPointers/m9_mission-1u5_alice',
      'sessions/s1/awayMissionHandPointers/m9_mission-2u5_alice',
    ]));
    expect(new Set(pointerPaths).size).toBe(2);
  });
});
