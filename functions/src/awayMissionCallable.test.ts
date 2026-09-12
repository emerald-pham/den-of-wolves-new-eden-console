import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CallableRequest } from 'firebase-functions/v2/https';
import { Timestamp } from 'firebase-admin/firestore';

const mock = vi.hoisted(() => ({
  get: vi.fn(),
  set: vi.fn(),
  update: vi.fn(),
  marker: undefined as Record<string, unknown> | undefined,
  orphanEvent: false,
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

import { dealPrivateInitialCards } from './index';
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
    if (ref.path.includes('/serverState/awayMissions/instances/')) return snapshot({}, ref.path, false);
    return snapshot({}, ref.path, false);
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
});
