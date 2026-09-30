import { describe, expect, it } from 'vitest';
import { HttpsError } from 'firebase-functions/v2/https';
import { emptySmallShipState } from './smallShip';
import { missionDeck, missionDeckStateFromCards } from './missionDeck';
import { createGorgoneionMissionSupportCallables } from './gorgoneionMissionSupportCallable';

type Fields = Record<string, unknown>;
type DocumentRef = Readonly<{ kind: 'document'; path: string }>;
type CollectionRef = Readonly<{ kind: 'collection'; path: string }>;
type Ref = DocumentRef | CollectionRef;
type Snapshot = Readonly<{
  exists: boolean;
  id: string;
  get(field: string): unknown;
  data(): Fields | undefined;
}>;
type QuerySnapshot = Readonly<{ docs: readonly Snapshot[] }>;
type Transaction = {
  get(ref: Ref): Promise<Snapshot | QuerySnapshot>;
  update(ref: DocumentRef, value: Fields): void;
  create(ref: DocumentRef, value: Fields): void;
};
type Write = Readonly<{ kind: 'create' | 'update'; path: string; data: Fields }>;

const SESSION_ID = 'session-1';
const CAPTAIN_UID = 'captain';
const DECK_PATH = `sessions/${SESSION_ID}/serverState/missionDeck`;
const PLAYER_PATH = `sessions/${SESSION_ID}/players/${CAPTAIN_UID}`;
const cards = missionDeck();
const initialDeck = missionDeckStateFromCards(cards);
const originalTopFive = initialDeck.order.slice(0, 5);
const untouchedTail = initialDeck.order.slice(5);

class MemoryDatabase {
  readonly records = new Map<string, Fields>();
  readonly readsByTransaction: string[][] = [];
  readonly writesByTransaction: Write[][] = [];

  doc(path: string): DocumentRef {
    return { kind: 'document', path };
  }

  collection(path: string): CollectionRef {
    return { kind: 'collection', path };
  }

  async runTransaction<T>(work: (transaction: unknown) => Promise<T>): Promise<T> {
    const reads: string[] = [];
    const staged: Write[] = [];
    const transaction: Transaction = {
      get: async (ref) => {
        reads.push(ref.path);
        if (ref.kind === 'collection') {
          const prefix = `${ref.path}/`;
          const docs = [...this.records.entries()]
            .filter(([path]) => path.startsWith(prefix) && !path.slice(prefix.length).includes('/'))
            .map(([path, data]) => makeSnapshot(path, data));
          return { docs };
        }
        const value = this.records.get(ref.path);
        return makeSnapshot(ref.path, value);
      },
      update: (ref, value) => staged.push({ kind: 'update', path: ref.path, data: structuredClone(value) }),
      create: (ref, value) => staged.push({ kind: 'create', path: ref.path, data: structuredClone(value) }),
    };

    const result = await work(transaction);
    if (staged.some((write) => write.kind === 'create' && this.records.has(write.path))) {
      throw new Error('Document already exists.');
    }
    const next = new Map([...this.records.entries()].map(([path, value]) => [path, structuredClone(value)]));
    for (const write of staged) {
      if (write.kind === 'create') {
        next.set(write.path, structuredClone(write.data));
      } else {
        next.set(write.path, { ...(next.get(write.path) ?? {}), ...structuredClone(write.data) });
      }
    }
    this.records.clear();
    next.forEach((value, path) => this.records.set(path, value));
    this.readsByTransaction.push(reads);
    this.writesByTransaction.push(staged);
    return result;
  }
}

function makeSnapshot(path: string, value: Fields | undefined): Snapshot {
  const copy = value === undefined ? undefined : structuredClone(value);
  return {
    exists: copy !== undefined,
    id: path.split('/').at(-1) ?? '',
    get: (field) => copy?.[field],
    data: () => copy === undefined ? undefined : structuredClone(copy),
  };
}

function seededDatabase(): MemoryDatabase {
  const db = new MemoryDatabase();
  db.records.set(`sessions/${SESSION_ID}`, {
    phase: 'active',
    activeVesselIds: ['aegis', 'dione'],
    expansion: 'base',
    capybaraEnabled: true,
    smallShipStates: {
      gorgoneion: {
        ...emptySmallShipState('gorgoneion', 'aegis'),
        dockingRevision: 3,
      },
    },
  });
  db.records.set(DECK_PATH, { ...initialDeck, dealtCount: 0 });
  db.records.set(PLAYER_PATH, {
    role: 'player',
    connected: true,
    kickedAt: null,
    assignedRoleId: 'admiral',
    replacementRoleId: 'gorgoneion-captain',
    replacementStatus: null,
    activeConsoleRoleId: null,
    seatId: null,
  });
  return db;
}

function dependencies(db: MemoryDatabase) {
  return createGorgoneionMissionSupportCallables({
    db,
    commandMarkers: {
      read: (transaction: unknown, sessionId: string, requestId: string) =>
        (transaction as Transaction).get(db.doc(`sessions/${sessionId}/commandReceipts/${requestId}`)),
      create: (transaction: unknown, fingerprint: unknown, result: unknown) => {
        (transaction as Transaction).create(
          db.doc(`sessions/${SESSION_ID}/commandReceipts/${(fingerprint as { requestId: string }).requestId}`),
          { fingerprint, result, createdAt: 'server-time' },
        );
      },
    },
    isActivePlayer: (player: Snapshot) => player.exists && player.get('role') === 'player' &&
      player.get('connected') === true && player.get('kickedAt') == null,
    serverTimestamp: () => 'server-time',
  });
}

function request(uid: string, data: unknown) {
  return { auth: { uid }, data };
}

async function availableProjection(db: MemoryDatabase, uid = CAPTAIN_UID) {
  return dependencies(db).getGorgoneionMissionSupportProjection(
    request(uid, { sessionId: SESSION_ID }),
  );
}

function applyCommand(
  projection: Awaited<ReturnType<typeof availableProjection>>,
  overrides: Partial<Fields> = {},
): Fields {
  return {
    sessionId: projection.sessionId,
    actorUid: projection.actorUid,
    hostShipId: projection.hostShipId,
    dockingRevision: projection.dockingRevision,
    dealtCount: projection.dealtCount,
    cardIds: projection.cardIds,
    requestId: 'support-1',
    topCardIds: [projection.cardIds[0], projection.cardIds[2], projection.cardIds[4]],
    bottomCardIds: [projection.cardIds[1], projection.cardIds[3]],
    ...overrides,
  };
}

async function apply(db: MemoryDatabase, uid: string, data: unknown) {
  return dependencies(db).applyGorgoneionMissionSupport(request(uid, data));
}

describe('Gorgoneion mission-support callable', () => {
  it('returns only the current Captain’s inspected top five and docking projection', async () => {
    const db = seededDatabase();
    const reply = await availableProjection(db);

    expect(reply).toEqual({
      status: 'available',
      sessionId: SESSION_ID,
      actorUid: CAPTAIN_UID,
      hostShipId: 'aegis',
      dockingRevision: 3,
      dealtCount: 0,
      cardIds: originalTopFive,
    });
    expect(Object.keys(reply).sort()).toEqual([
      'actorUid', 'cardIds', 'dealtCount', 'dockingRevision', 'hostShipId', 'sessionId', 'status',
    ]);
    expect(reply.cardIds).toHaveLength(5);
    expect(reply).not.toHaveProperty('order');
  });

  it.each([
    ['historical Captain', { replacementRoleId: null }],
    ['pending replacement', { replacementStatus: 'awaiting-re-role' }],
    ['disconnected Captain', { connected: false }],
    ['non-player actor', { role: 'observer' }],
    ['Captain with a core seat', { seatId: 'admiral' }],
    ['Captain with an active console role', { activeConsoleRoleId: 'admiral' }],
  ] as const)('denies a %s without disclosing the projection', async (_label, playerPatch) => {
    const db = seededDatabase();
    Object.assign(db.records.get(PLAYER_PATH)!, playerPatch);

    await expect(availableProjection(db)).rejects.toMatchObject({ code: 'permission-denied' });
    expect(db.writesByTransaction.flat()).toEqual([]);
  });

  it('denies a caller who is not the current Captain even when the session is admitted', async () => {
    const db = seededDatabase();

    await expect(availableProjection(db, 'outsider')).rejects.toMatchObject({ code: 'permission-denied' });
    expect(JSON.stringify(db.writesByTransaction)).not.toContain(originalTopFive[0]);
  });

  it('fails closed outside active gameplay', async () => {
    const db = seededDatabase();
    db.records.get(`sessions/${SESSION_ID}`)!.phase = 'debrief';

    await expect(availableProjection(db)).rejects.toMatchObject({ code: 'failed-precondition' });
    expect(db.writesByTransaction.flat()).toEqual([]);
  });

  it.each([
    ['missing deck', (db: MemoryDatabase) => { db.records.delete(DECK_PATH); }],
    ['malformed deck order', (db: MemoryDatabase) => {
      db.records.get(DECK_PATH)!.order = [...initialDeck.order.slice(0, -1), initialDeck.order[0]];
    }],
    ['dealt deck', (db: MemoryDatabase) => { db.records.get(DECK_PATH)!.dealtCount = 1; }],
    ['malformed deck cursor', (db: MemoryDatabase) => { db.records.get(DECK_PATH)!.dealtCount = -1; }],
  ] as const)('fails closed for a %s', async (_label, damageDeck) => {
    const db = seededDatabase();
    damageDeck(db);

    await expect(availableProjection(db)).rejects.toMatchObject({ code: 'failed-precondition' });
    expect(db.writesByTransaction.flat()).toEqual([]);
  });

  it.each([
    ['missing docking record', (session: Fields) => { session.smallShipStates = {}; }],
    ['host outside the active core fleet', (session: Fields) => {
      session.activeVesselIds = ['dione'];
    }],
    ['malformed active core fleet', (session: Fields) => { session.activeVesselIds = ['gorgoneion']; }],
  ] as const)('fails closed for %s', async (_label, damageSession) => {
    const db = seededDatabase();
    damageSession(db.records.get(`sessions/${SESSION_ID}`)!);

    await expect(availableProjection(db)).rejects.toMatchObject({ code: 'failed-precondition' });
    expect(db.writesByTransaction.flat()).toEqual([]);
  });

  it.each([
    ['changed host', { hostShipId: 'dione' }],
    ['stale docking revision', { dockingRevision: 2 }],
  ] as const)('rejects an apply command with a %s projection', async (_label, projectionPatch) => {
    const db = seededDatabase();
    const projection = await availableProjection(db);
    const command = applyCommand(projection, projectionPatch);

    await expect(apply(db, CAPTAIN_UID, command)).rejects.toMatchObject({ code: 'failed-precondition' });
    expect(db.writesByTransaction.flat()).toEqual([]);
  });

  it('rejects an inspected top five that changed after projection', async () => {
    const db = seededDatabase();
    const projection = await availableProjection(db);
    const order = [...initialDeck.order];
    [order[0], order[5]] = [order[5]!, order[0]!];
    db.records.get(DECK_PATH)!.order = order;

    await expect(apply(db, CAPTAIN_UID, applyCommand(projection))).rejects.toMatchObject({
      code: 'failed-precondition',
    });
    expect(db.writesByTransaction.flat()).toEqual([]);
  });

  it('applies one exact partition, preserves destination order and deck tail, and writes one atomic receipt', async () => {
    const db = seededDatabase();
    const projection = await availableProjection(db);
    const command = applyCommand(projection);

    const reply = await apply(db, CAPTAIN_UID, command);
    expect(reply).toEqual({
      status: 'committed', sessionId: SESSION_ID, requestId: 'support-1', cardCount: 5,
    });
    expect(Object.keys(reply).sort()).toEqual(['cardCount', 'requestId', 'sessionId', 'status']);
    expect(reply).not.toHaveProperty('order');
    expect(reply).not.toHaveProperty('cardIds');

    const deck = db.records.get(DECK_PATH)!;
    expect(deck.order).toEqual([
      originalTopFive[0], originalTopFive[2], originalTopFive[4],
      ...untouchedTail,
      originalTopFive[1], originalTopFive[3],
    ]);
    expect(deck.dealtCount).toBe(0);
    expect(deck.gorgoneionMissionSupport).toMatchObject({
      action: 'gorgoneion-mission-support',
      requestId: 'support-1',
      actorUid: CAPTAIN_UID,
      hostShipId: 'aegis',
      dockingRevision: 3,
      inspectedCardIds: originalTopFive,
      topCardIds: [originalTopFive[0], originalTopFive[2], originalTopFive[4]],
      bottomCardIds: [originalTopFive[1], originalTopFive[3]],
    });
    expect(db.records.get(`sessions/${SESSION_ID}`)!.activeVesselIds).toEqual(['aegis', 'dione']);
    expect(db.records.get(`sessions/${SESSION_ID}`)!.activeVesselIds).not.toContain('gorgoneion');

    expect(db.readsByTransaction.at(-1)).toContain(DECK_PATH);
    expect(db.writesByTransaction.at(-1)).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'update', path: DECK_PATH }),
      expect.objectContaining({ kind: 'create', path: `sessions/${SESSION_ID}/commandReceipts/support-1` }),
    ]));
    expect(db.writesByTransaction.at(-1)).toHaveLength(2);
    expect(db.records.get(`sessions/${SESSION_ID}/commandReceipts/support-1`)).toMatchObject({
      fingerprint: { action: 'gorgoneion-mission-support', actorUid: CAPTAIN_UID },
      result: { status: 'committed', sessionId: SESSION_ID, requestId: 'support-1', cardCount: 5 },
    });
  });

  it.each([
    ['missing card', { topCardIds: [originalTopFive[0], originalTopFive[2]], bottomCardIds: [originalTopFive[1], originalTopFive[3]] }],
    ['duplicate card', { topCardIds: [originalTopFive[0], originalTopFive[0], originalTopFive[2]], bottomCardIds: [originalTopFive[1], originalTopFive[3]] }],
    ['card outside inspected five', { topCardIds: [untouchedTail[0]], bottomCardIds: [originalTopFive[0], originalTopFive[1], originalTopFive[2], originalTopFive[3]] }],
  ] as const)('rejects a partition with a %s', async (_label, partition) => {
    const db = seededDatabase();
    const projection = await availableProjection(db);

    await expect(apply(db, CAPTAIN_UID, applyCommand(projection, partition))).rejects.toMatchObject({
      code: 'invalid-argument',
    });
    expect(db.records.get(DECK_PATH)!.order).toEqual(initialDeck.order);
    expect(db.writesByTransaction.flat()).toEqual([]);
  });

  it('rejects a changed command with the same request id as a collision', async () => {
    const db = seededDatabase();
    const projection = await availableProjection(db);
    const command = applyCommand(projection);
    await apply(db, CAPTAIN_UID, command);

    await expect(apply(db, CAPTAIN_UID, {
      ...command,
      topCardIds: [originalTopFive[0], originalTopFive[1], originalTopFive[2]],
      bottomCardIds: [originalTopFive[3], originalTopFive[4]],
    })).rejects.toMatchObject({ code: 'failed-precondition' });
    expect(db.writesByTransaction.flat()).toHaveLength(2);
  });

  it('replays the exact command without a second deck or receipt write', async () => {
    const db = seededDatabase();
    const projection = await availableProjection(db);
    const command = applyCommand(projection);
    await expect(apply(db, CAPTAIN_UID, command)).resolves.toMatchObject({ status: 'committed' });
    const priorWrites = db.writesByTransaction.flat().length;

    await expect(apply(db, CAPTAIN_UID, command)).resolves.toEqual({
      status: 'replayed', sessionId: SESSION_ID, requestId: 'support-1', cardCount: 5,
    });
    expect(db.writesByTransaction.flat()).toHaveLength(priorWrites);
  });

  it('denies cross-actor replay and denies a second support action', async () => {
    const db = seededDatabase();
    const projection = await availableProjection(db);
    const command = applyCommand(projection);
    await apply(db, CAPTAIN_UID, command);

    db.records.get(PLAYER_PATH)!.replacementRoleId = null;
    db.records.set(`sessions/${SESSION_ID}/players/next-captain`, {
      role: 'player', connected: true, kickedAt: null,
      replacementRoleId: 'gorgoneion-captain', replacementStatus: null,
      activeConsoleRoleId: null, seatId: null,
    });
    await expect(apply(db, 'next-captain', {
      ...command,
      actorUid: 'next-captain',
    })).rejects.toMatchObject({ code: 'permission-denied' });

    const nextProjection = {
      ...projection,
      actorUid: 'next-captain',
      cardIds: db.records.get(DECK_PATH)!.order.slice(0, 5),
    };
    await expect(apply(db, 'next-captain', applyCommand(nextProjection, { requestId: 'support-2' })))
      .rejects.toMatchObject({ code: 'failed-precondition' });
    expect(db.writesByTransaction.flat()).toHaveLength(2);
  });

  it('fails closed when the deal cursor advances after projection and before apply', async () => {
    const db = seededDatabase();
    const projection = await availableProjection(db);
    db.records.get(DECK_PATH)!.dealtCount = 2;

    await expect(apply(db, CAPTAIN_UID, applyCommand(projection))).rejects.toMatchObject({
      code: 'failed-precondition',
    });
    expect(db.writesByTransaction.flat()).toEqual([]);
  });
});
