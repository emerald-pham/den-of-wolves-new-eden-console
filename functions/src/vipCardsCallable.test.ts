import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CallableRequest } from 'firebase-functions/v2/https';

const mock = vi.hoisted(() => ({
  randomInt: vi.fn(() => 0),
  set: vi.fn(),
  update: vi.fn(),
  documents: new Map<string, Record<string, unknown>>(),
}));

vi.mock('node:crypto', () => ({ randomInt: mock.randomInt, randomUUID: vi.fn(() => 'vip-event') }));
vi.mock('firebase-admin/app', () => ({ initializeApp: vi.fn() }));
vi.mock('firebase-admin/firestore', () => ({
  getFirestore: () => ({
    doc: (path: string) => ({ path, id: path.split('/').at(-1) }),
    collection: (path: string) => ({ path }),
    runTransaction: async (callback: (tx: unknown) => unknown) => callback({
      get: async (ref: { path: string }) => {
        const stored = mock.documents.get(ref.path);
        if (stored) return snapshot(stored, ref.path);
        if (ref.path === 'sessions/s1') return snapshot(sessionFields, ref.path);
        if (ref.path === 'sessions/s1/players/gm1') return snapshot(gmFields, ref.path);
        if (ref.path === 'sessions/s1/players/alice') return snapshot(aliceFields, ref.path);
        if (ref.path === 'sessions/s1/players/bob') return snapshot(bobFields, ref.path);
        if (ref.path === 'sessions/s1/players/vip') return snapshot(vipHostFields, ref.path);
        if (ref.path === 'sessions/s1/players/other') return snapshot(otherReplacementFields, ref.path);
        if (ref.path === 'sessions/s1/gmInstances/bridge') return snapshot(gmInstanceFields, ref.path);
        if (ref.path === 'sessions/s1/gmInstances/bridge/private/shipConsoleWriteGrant') {
          return gmGrantFields ? snapshot(gmGrantFields, ref.path) : snapshot({}, ref.path, false);
        }
        return snapshot({}, ref.path, false);
      },
      set: (ref: { path: string }, value: Record<string, unknown>) => {
        mock.set(ref, value);
        mock.documents.set(ref.path, value);
      },
      update: (ref: { path: string }, value: Record<string, unknown>) => {
        mock.update(ref, value);
        const current = mock.documents.get(ref.path) ?? (ref.path === 'sessions/s1' ? sessionFields : {});
        for (const [key, next] of Object.entries(value)) {
          const parts = key.split('.');
          let target = current;
          for (const part of parts.slice(0, -1)) {
            const child = target[part];
            if (!child || typeof child !== 'object' || Array.isArray(child)) target[part] = {};
            target = target[part] as Record<string, unknown>;
          }
          target[parts.at(-1)!] = next;
        }
        mock.documents.set(ref.path, current);
      },
    }),
  }),
  FieldValue: { serverTimestamp: () => 'server-time' },
  Timestamp: class MockTimestamp {
    static fromDate(value: Date) { return new MockTimestamp(value); }
    constructor(private readonly date = new Date()) {}
    toDate() { return this.date; }
  },
}));

import { drawVipCard, transferVipCard } from './index';

function snapshot(fields: Record<string, unknown>, path: string, exists = true) {
  return {
    exists,
    id: path.split('/').at(-1),
    ref: { path },
    data: () => fields,
    get: (field: string) => fields[field],
  };
}

const sessionFields: Record<string, unknown> = {
  phase: 'active', currentTurn: 1, dioneEnabled: true,
  activeVesselIds: ['aegis', 'dione'],
  maintenanceCycles: {
    dione: { turn: 1, step: 5, revision: 0, charges: ['vip-lounge'], results: {}, refuelled: [] },
  },
  shipDamage: {},
};
const gmFields = { role: 'gm', connected: true, activeConsoleRoleId: undefined };
const aliceFields = { role: 'player', connected: true, activeConsoleRoleId: 'dione-captain' };
const bobFields = { role: 'player', connected: true, activeConsoleRoleId: 'dione-president' };
const vipHostFields = { role: 'player', connected: true, activeConsoleRoleId: null, replacementRoleId: 'vip-host' };
const otherReplacementFields = { role: 'player', connected: true, activeConsoleRoleId: null, replacementRoleId: 'comms-officer' };
const gmInstanceFields = {
  uid: 'gm1', connected: true, claimedAt: new Date(), lastSeenAt: new Date(),
};
let gmGrantFields: Record<string, unknown> | undefined = {
  type: 'gm-ship-console-write-grant', sessionId: 's1', instanceId: 'bridge', uid: 'gm1',
  shipId: 'dione', grantedAt: new Date(),
};

function request(data: Record<string, unknown>, uid = 'gm1') {
  return { data, auth: { uid } } as CallableRequest<Record<string, unknown>>;
}

const drawCommand = {
  sessionId: 's1', shipId: 'dione', requestId: 'draw-1', expectedRevision: 0, instanceId: 'bridge',
};

beforeEach(() => {
  mock.randomInt.mockReset();
  mock.randomInt.mockReturnValue(0);
  mock.set.mockReset();
  mock.update.mockReset();
  mock.documents.clear();
  gmInstanceFields.connected = true;
  sessionFields.phase = 'active';
  sessionFields.currentTurn = 1;
  sessionFields.turnPhase = {
    turn: 1, airspace: { state: 'restricted', tickerActive: true, pressAccess: false },
  };
  sessionFields.shipDamage = {};
  sessionFields.maintenanceCycles = {
    dione: { turn: 1, step: 5, revision: 0, charges: ['vip-lounge'], results: {}, refuelled: [] },
  };
  gmGrantFields = {
    type: 'gm-ship-console-write-grant', sessionId: 's1', instanceId: 'bridge', uid: 'gm1',
    shipId: 'dione', grantedAt: new Date(),
  };
});

describe('drawVipCard', () => {
  it('draws privately after the charge and authority checks, and replays without rerolling', async () => {
    const committed = await drawVipCard.run(request(drawCommand));
    expect(committed).toMatchObject({ status: 'committed', deckRevision: 1 });
    expect(committed).not.toHaveProperty('cardId');
    expect(mock.randomInt).toHaveBeenCalledTimes(1);
    expect(mock.documents.get('sessions/s1/vipHands/gm1')).toMatchObject({
      ownerUid: 'gm1', cards: [{ id: 'party-deck', name: 'Party Deck', status: 'available' }],
    });

    mock.set.mockClear();
    await expect(drawVipCard.run(request(drawCommand))).resolves.toMatchObject({ status: 'replayed' });
    expect(mock.randomInt).toHaveBeenCalledTimes(1);
    expect(mock.set).not.toHaveBeenCalled();
  });

  it.each([
    ['damaged Lounge', { dione: { damagedSystemIds: ['vip-lounge'], destroyed: false } }],
    ['wrong phase', undefined],
  ])('rejects %s before server randomness', async (label, damage) => {
    if (label === 'damaged Lounge') sessionFields.shipDamage = damage;
    else sessionFields.maintenanceCycles = {
      dione: { turn: 1, step: 6, revision: 0, charges: ['vip-lounge'], results: {}, refuelled: [] },
    };
    const requestId = label === 'damaged Lounge' ? 'reject-damaged' : 'reject-phase';
    await expect(drawVipCard.run(request({ ...drawCommand, requestId }))).rejects.toMatchObject({
      code: 'failed-precondition',
    });
    expect(mock.randomInt).not.toHaveBeenCalled();
    expect(mock.set).not.toHaveBeenCalled();
  });

  it('rejects an actor without the active GM lease before private deck access', async () => {
    await expect(drawVipCard.run(request({ ...drawCommand, requestId: 'wrong-actor' }, 'eve'))).rejects.toMatchObject({
      code: 'permission-denied',
    });
    expect(mock.randomInt).not.toHaveBeenCalled();
    expect(mock.set).not.toHaveBeenCalled();
  });

  it('rejects a fresh draw without an authoritative phase clock before randomness or writes', async () => {
    delete sessionFields.turnPhase;

    await expect(drawVipCard.run(request({
      ...drawCommand, requestId: 'missing-phase-clock',
    }))).rejects.toMatchObject({
      code: 'failed-precondition',
      message: expect.stringMatching(/no current server phase/i),
    });
    expect(mock.randomInt).not.toHaveBeenCalled();
    expect(mock.set).not.toHaveBeenCalled();
    expect(mock.update).not.toHaveBeenCalled();
  });

  it('returns stale without drawing when the maintenance revision changed', async () => {
    sessionFields.maintenanceCycles = {
      dione: { turn: 1, step: 5, revision: 4, charges: ['vip-lounge'], results: {}, refuelled: [] },
    };
    await expect(drawVipCard.run(request({ ...drawCommand, requestId: 'stale-draw' }))).resolves.toMatchObject({
      status: 'stale', currentRevision: 4,
    });
    expect(mock.randomInt).not.toHaveBeenCalled();
  });

  it('rejects a depleted deck before server randomness', async () => {
    mock.documents.set('sessions/s1/serverState/vipCards', {
      revision: 9,
      cards: [
        ...['party-deck', 'spa-deck', 'gaming-deck', 'casino-deck', 'theatre-deck', 'restaurant-deck', 'art-deck', 'family-fun-deck', 'theme-park-deck']
          .map(id => ({ id, name: id, ownerUid: 'owner', status: 'available' })),
      ],
    });
    await expect(drawVipCard.run(request({ ...drawCommand, requestId: 'depleted-deck' }, 'alice')))
      .rejects.toMatchObject({ code: 'failed-precondition' });
    expect(mock.randomInt).not.toHaveBeenCalled();
  });

  it('draws uniformly from the remaining cards after partial depletion', async () => {
    mock.randomInt.mockReturnValue(2);
    mock.documents.set('sessions/s1/serverState/vipCards', {
      revision: 6,
      cards: [
        ...['party-deck', 'spa-deck', 'gaming-deck', 'casino-deck', 'theatre-deck', 'restaurant-deck']
          .map((id, index) => ({ id, name: id, ownerUid: `owner-${index}`, status: 'available' })),
        ...['art-deck', 'family-fun-deck', 'theme-park-deck']
          .map(id => ({ id, name: id, ownerUid: null, status: 'available' })),
      ],
    });

    await expect(drawVipCard.run(request({ ...drawCommand, requestId: 'partial-deck' }, 'alice')))
      .resolves.toMatchObject({ status: 'committed', deckRevision: 7 });
    expect(mock.randomInt).toHaveBeenCalledWith(0, 3);
    expect(mock.documents.get('sessions/s1/vipHands/alice')).toMatchObject({
      cards: [{ id: 'theme-park-deck', status: 'available' }],
    });
  });

  it('allows the current replacement VIP Host to draw with no active console role', async () => {
    await expect(drawVipCard.run(request({ ...drawCommand, requestId: 'replacement-vip-host', consoleRoleId: 'vip-host' }, 'vip')))
      .resolves.toMatchObject({ status: 'committed', deckRevision: 1 });
    expect(mock.randomInt).toHaveBeenCalledWith(0, 9);
  });

  it('does not grant Dione VIP authority to another replacement role', async () => {
    await expect(drawVipCard.run(request({ ...drawCommand, requestId: 'other-replacement', consoleRoleId: 'vip-host' }, 'other')))
      .rejects.toMatchObject({ code: 'permission-denied' });
    expect(mock.randomInt).not.toHaveBeenCalled();
  });
});

describe('transferVipCard', () => {
  beforeEach(() => {
    sessionFields.turnPhase = {
      turn: 1, airspace: { state: 'lifted', tickerActive: true, pressAccess: true },
    };
  });

  it('writes both private owner projections and rejects the former owner', async () => {
    mock.documents.set('sessions/s1/serverState/vipCards', {
      revision: 1,
      cards: [
        { id: 'party-deck', name: 'Party Deck', ownerUid: 'alice', status: 'available' },
        ...['spa-deck', 'gaming-deck', 'casino-deck', 'theatre-deck', 'restaurant-deck', 'art-deck', 'family-fun-deck', 'theme-park-deck']
          .map(id => ({ id, name: id, ownerUid: null, status: 'available' })),
      ],
    });
    const command = { sessionId: 's1', requestId: 'transfer-1', cardId: 'party-deck', targetUid: 'bob', expectedRevision: 1 };
    await expect(transferVipCard.run(request(command, 'alice'))).resolves.toMatchObject({
      status: 'committed', targetUid: 'bob', committedRevision: 2,
    });
    expect(mock.documents.get('sessions/s1/vipHands/alice')).toMatchObject({ cards: [] });
    expect(mock.documents.get('sessions/s1/vipHands/bob')).toMatchObject({
      cards: [{ id: 'party-deck', status: 'available' }],
    });

    await expect(transferVipCard.run(request({ ...command, requestId: 'transfer-2', expectedRevision: 2 }, 'alice'))).rejects.toMatchObject({
      code: 'failed-precondition',
    });
  });

  it('rechecks a GM grant before replaying a committed transfer', async () => {
    mock.documents.set('sessions/s1/serverState/vipCards', {
      revision: 1,
      cards: [
        { id: 'party-deck', name: 'Party Deck', ownerUid: 'gm1', status: 'available' },
        ...['spa-deck', 'gaming-deck', 'casino-deck', 'theatre-deck', 'restaurant-deck', 'art-deck', 'family-fun-deck', 'theme-park-deck']
          .map(id => ({ id, name: id, ownerUid: null, status: 'available' })),
      ],
    });
    const command = {
      sessionId: 's1', requestId: 'transfer-gm-replay', cardId: 'party-deck',
      targetUid: 'bob', expectedRevision: 1, instanceId: 'bridge',
    };
    await expect(transferVipCard.run(request(command))).resolves.toMatchObject({
      status: 'committed', targetUid: 'bob', committedRevision: 2,
    });

    gmGrantFields = undefined;
    await expect(transferVipCard.run(request(command))).rejects.toMatchObject({
      code: 'permission-denied',
    });

    gmGrantFields = {
      type: 'gm-ship-console-write-grant', sessionId: 's1', instanceId: 'bridge', uid: 'gm1',
      shipId: 'dione', grantedAt: new Date(),
    };
    gmInstanceFields.connected = false;
    await expect(transferVipCard.run(request(command))).rejects.toMatchObject({
      code: 'permission-denied',
    });
  });

  it('rejects a fresh transfer without an authoritative phase clock before writes', async () => {
    delete sessionFields.turnPhase;
    mock.documents.set('sessions/s1/serverState/vipCards', {
      revision: 1,
      cards: [
        { id: 'party-deck', name: 'Party Deck', ownerUid: 'alice', status: 'available' },
        ...['spa-deck', 'gaming-deck', 'casino-deck', 'theatre-deck', 'restaurant-deck', 'art-deck', 'family-fun-deck', 'theme-park-deck']
          .map(id => ({ id, name: id, ownerUid: null, status: 'available' })),
      ],
    });

    await expect(transferVipCard.run(request({
      sessionId: 's1', requestId: 'missing-phase-clock', cardId: 'party-deck',
      targetUid: 'bob', expectedRevision: 1,
    }, 'alice'))).rejects.toMatchObject({
      code: 'failed-precondition',
      message: expect.stringMatching(/no current server phase/i),
    });
    expect(mock.set).not.toHaveBeenCalled();
    expect(mock.update).not.toHaveBeenCalled();
  });
});
