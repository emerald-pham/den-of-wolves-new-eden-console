import { describe, expect, it } from 'vitest';
import { createSameTableTradeCallables } from './sameTableTradeCallable';

const SESSION_ID = 'session-1';
const OFFER_ID = '6be84b81-8765-4a7c-b341-61b96ff31907';
const ATTESTATION_ID = 'aa2d85f8-81cd-4a86-9090-d1dc812a1f07';
const OTHER_ATTESTATION_ID = 'f983a197-6488-4df6-aab7-3fedc9a882c1';
const BASELINE = {
  ore: 10,
  fuel: 8,
  food: 4,
  water: 2,
  materials: 6,
  securityTeams: 3,
} as const;
const RECIPIENT_BASELINE = {
  ore: 1,
  fuel: 1,
  food: 2,
  water: 5,
  materials: 6,
  securityTeams: 7,
} as const;
const QUANTITIES = { ore: 3, fuel: 2 } as const;

type Data = Record<string, unknown>;
type Ref = { path: string };
type Snapshot = {
  exists: boolean;
  id: string;
  ref: Ref;
  get(key: string): unknown;
  data(): Data | undefined;
};
type QuerySnapshot = { docs: Snapshot[] };

function snapshot(path: string, data?: Data): Snapshot {
  return {
    exists: data !== undefined,
    id: path.split('/').at(-1) ?? '',
    ref: { path },
    get: (key) => data?.[key],
    data: () => data,
  };
}

class FakeStore {
  readonly records = new Map<string, Data>();
  readonly committedWrites: Array<{ kind: 'set' | 'create' | 'update'; path: string; data: Data }> = [];
  transactionCount = 0;

  doc(path: string): Ref { return { path }; }
  collection(path: string): Ref { return { path }; }

  async runTransaction<T>(work: (tx: {
    get(ref: Ref): Promise<Snapshot | QuerySnapshot>;
    set(ref: Ref, data: Data, options?: { merge?: boolean }): void;
    create(ref: Ref, data: Data): void;
    update(ref: Ref, data: Data): void;
  }) => Promise<T>): Promise<T> {
    this.transactionCount += 1;
    let hasWritten = false;
    const staged: Array<{ kind: 'set' | 'create' | 'update'; path: string; data: Data; merge?: boolean }> = [];
    const result = await work({
      get: async (ref) => {
        if (hasWritten) throw new Error(`transaction read after write: ${ref.path}`);
        if (!ref.path.includes('/players/') && ref.path.endsWith('/players')) {
          const prefix = `${ref.path}/`;
          return {
            docs: [...this.records.entries()]
              .filter(([path]) => path.startsWith(prefix))
              .map(([path, data]) => snapshot(path, data)),
          };
        }
        return snapshot(ref.path, this.records.get(ref.path));
      },
      set: (ref, data, options) => {
        hasWritten = true;
        staged.push({ kind: 'set', path: ref.path, data: structuredClone(data), merge: options?.merge });
      },
      create: (ref, data) => {
        hasWritten = true;
        if (this.records.has(ref.path) || staged.some((entry) => entry.path === ref.path)) {
          throw new Error(`document already exists: ${ref.path}`);
        }
        staged.push({ kind: 'create', path: ref.path, data: structuredClone(data) });
      },
      update: (ref, data) => {
        hasWritten = true;
        staged.push({ kind: 'update', path: ref.path, data: structuredClone(data) });
      },
    });

    for (const write of staged) {
      const existing = this.records.get(write.path);
      if (write.kind === 'create' && existing) throw new Error(`document already exists: ${write.path}`);
      if (write.kind === 'update' && !existing) throw new Error(`document does not exist: ${write.path}`);
      this.records.set(write.path, write.merge && existing
        ? { ...existing, ...write.data }
        : { ...(write.kind === 'update' ? existing : {}), ...write.data });
      this.committedWrites.push({ kind: write.kind, path: write.path, data: write.data });
    }
    return result;
  }
}

function player(uid: string, roleId: string, role = 'player'): Data {
  return {
    uid,
    role,
    connected: true,
    assignedRoleId: roleId,
    fleetGroupId: 'fleet-1',
  };
}

function paths() {
  const session = `sessions/${SESSION_ID}`;
  return {
    session,
    players: `${session}/players`,
    state: `${session}/sameTableTradeState/current`,
    senderInventory: `${session}/playerHeldResourceInventories/sender`,
    recipientInventory: `${session}/playerHeldResourceInventories/recipient`,
    offer: `${session}/sameTableTradeOffers/${OFFER_ID}`,
    receipt: `${session}/sameTableTradeReceipts/${OFFER_ID}`,
  };
}

function inventory(balances: Data): Data {
  return {
    sessionId: SESSION_ID,
    type: 'player-held-resource-inventory',
    playerUid: 'sender',
    balances,
    revision: 4,
    baseline: {
      attestationId: ATTESTATION_ID,
      attestedByUid: 'facilitator',
      balances: BASELINE,
      revision: 4,
      attestedAt: 'server-time',
    },
    updatedAt: 'server-time',
  };
}

function seededStore(options: { revision?: number; sameTable?: boolean; accepted?: boolean } = {}): FakeStore {
  const store = new FakeStore();
  const path = paths();
  store.records.set(path.session, { id: SESSION_ID, phase: 'active' });
  store.records.set(`${path.players}/sender`, player('sender', 'icebreaker-miner'));
  store.records.set(`${path.players}/recipient`, player('recipient', options.sameTable === false ? 'dione-engineer' : 'icebreaker-engineer'));
  store.records.set(`${path.players}/facilitator`, player('facilitator', '', 'gm'));
  store.records.set(path.state, {
    type: 'same-table-trade-state', sessionId: SESSION_ID, revision: options.revision ?? 4,
  });
  store.records.set(path.senderInventory, inventory(BASELINE));
  store.records.set(path.recipientInventory, {
    sessionId: SESSION_ID,
    type: 'player-held-resource-inventory',
    playerUid: 'recipient',
    balances: RECIPIENT_BASELINE,
    revision: 4,
    baseline: {
      attestationId: OTHER_ATTESTATION_ID,
      attestedByUid: 'facilitator',
      balances: RECIPIENT_BASELINE,
      revision: 4,
      attestedAt: 'server-time',
    },
    updatedAt: 'server-time',
  });
  if (options.accepted) {
    const offer = {
      id: OFFER_ID,
      fromUid: 'sender',
      toUid: 'recipient',
      tableId: 'icebreaker',
      revision: 4,
      quantities: QUANTITIES,
    };
    store.records.set(path.offer, {
      type: 'same-table-trade-offer',
      sessionId: SESSION_ID,
      ...offer,
      fleetGroupId: 'fleet-1',
      status: 'accepted',
      createdAt: 'server-time',
      acceptedByUid: 'recipient',
      acceptedAt: 'server-time',
    });
    store.records.set(path.senderInventory, inventory({ ...BASELINE, ore: 7, fuel: 6 }));
    store.records.set(path.recipientInventory, {
      sessionId: SESSION_ID,
      type: 'player-held-resource-inventory',
      playerUid: 'recipient',
      balances: { ...RECIPIENT_BASELINE, ore: 4, fuel: 3 },
      revision: 5,
      baseline: {
        attestationId: OTHER_ATTESTATION_ID,
        attestedByUid: 'facilitator',
        balances: RECIPIENT_BASELINE,
        revision: 4,
        attestedAt: 'server-time',
      },
      updatedAt: 'server-time',
    });
    store.records.set(path.receipt, {
      type: 'same-table-trade-receipt',
      sessionId: SESSION_ID,
      receiptId: OFFER_ID,
      offerId: OFFER_ID,
      fromUid: 'sender',
      toUid: 'recipient',
      tableId: 'icebreaker',
      revision: 4,
      quantities: { ore: 3, fuel: 2, food: 0, water: 0, materials: 0, securityTeams: 0 },
    });
  }
  return store;
}

function dependencies(store: FakeStore) {
  return {
    db: store,
    requireUid: (auth: { uid?: string } | undefined) => {
      if (!auth?.uid) throw Object.assign(new Error('Sign in first.'), { code: 'unauthenticated' });
      return auth.uid;
    },
    requireFacilitatorInstance: async (_tx: unknown, sessionId: string, uid: string, instanceId: string) => {
      if (uid !== 'facilitator' || instanceId !== 'gm-instance' || sessionId !== SESSION_ID) {
        throw Object.assign(new Error('An active facilitator instance is required.'), { code: 'permission-denied' });
      }
      return { session: snapshot(paths().session, store.records.get(paths().session)), player: snapshot('facilitator', store.records.get(`${paths().players}/facilitator`)) };
    },
    requireNonterminalSessionPhase: (phase: unknown) => {
      if (['closed', 'retained-empty', 'debrief', 'success', 'failure'].includes(String(phase))) {
        throw Object.assign(new Error('Gameplay actions are unavailable after the session ends.'), {
          code: 'failed-precondition',
        });
      }
    },
    isActivePlayer: (record: Snapshot) => record.exists && record.get('connected') === true && !record.get('kickedAt'),
    shipForRole: (roleId: unknown) => typeof roleId === 'string' && roleId.includes('-')
      ? roleId.split('-')[0]
      : undefined,
    serverTimestamp: () => 'server-time',
  };
}

const auth = (uid: string) => ({ auth: { uid } });
const attestationRequest = (overrides: Data = {}) => ({
  ...auth('facilitator'),
  data: {
    sessionId: SESSION_ID,
    targetUid: 'sender',
    balances: BASELINE,
    attestationId: ATTESTATION_ID,
    instanceId: 'gm-instance',
    ...overrides,
  },
});
const createRequest = (overrides: Data = {}) => ({
  ...auth('sender'),
  data: {
    sessionId: SESSION_ID,
    offerId: OFFER_ID,
    recipientUid: 'recipient',
    quantities: QUANTITIES,
    fromUid: 'client-forgery',
    tableId: 'client-table',
    fleetGroupId: 'client-fleet',
    revision: 900,
    ...overrides,
  },
});
const acceptRequest = (uid = 'recipient', overrides: Data = {}) => ({
  ...auth(uid),
  data: { sessionId: SESSION_ID, offerId: OFFER_ID, ...overrides },
});

describe('same-table trade authoritative callables', () => {
  it('rejects a new facilitator inventory baseline in a terminal session without writing', async () => {
    const store = new FakeStore();
    const path = paths();
    store.records.set(path.session, { id: SESSION_ID, phase: 'failure' });
    store.records.set(`${path.players}/sender`, player('sender', 'icebreaker-miner'));
    store.records.set(`${path.players}/facilitator`, player('facilitator', '', 'gm'));
    store.records.set(path.state, { type: 'same-table-trade-state', sessionId: SESSION_ID, revision: 0 });
    const callables = createSameTableTradeCallables(dependencies(store));

    await expect(callables.attestPlayerHeldTokenBaseline(attestationRequest()))
      .rejects.toMatchObject({ code: 'failed-precondition' });
    expect(store.records.has(path.senderInventory)).toBe(false);
    expect(store.committedWrites).toHaveLength(0);
  });

  it('rejects a new same-table offer in a terminal session without writing', async () => {
    const store = seededStore();
    store.records.get(paths().session)!.phase = 'failure';
    const callables = createSameTableTradeCallables(dependencies(store));

    await expect(callables.createSameTableTradeOffer(createRequest()))
      .rejects.toMatchObject({ code: 'failed-precondition' });
    expect(store.records.has(paths().offer)).toBe(false);
    expect(store.committedWrites).toHaveLength(0);
  });

  it('rejects recipient acceptance in a terminal session without changing either inventory', async () => {
    const store = seededStore();
    const callables = createSameTableTradeCallables(dependencies(store));
    await callables.createSameTableTradeOffer(createRequest());
    store.committedWrites.length = 0;
    const beforeSender = structuredClone(store.records.get(paths().senderInventory));
    const beforeRecipient = structuredClone(store.records.get(paths().recipientInventory));
    store.records.get(paths().session)!.phase = 'failure';

    await expect(callables.acceptSameTableTradeOffer(acceptRequest()))
      .rejects.toMatchObject({ code: 'failed-precondition' });
    expect(store.records.get(paths().senderInventory)).toEqual(beforeSender);
    expect(store.records.get(paths().recipientInventory)).toEqual(beforeRecipient);
    expect(store.records.get(paths().offer)).toMatchObject({ status: 'pending' });
    expect(store.records.has(paths().receipt)).toBe(false);
    expect(store.committedWrites).toHaveLength(0);
  });

  it('attests a baseline once and returns the original result for an exact replay', async () => {
    const store = new FakeStore();
    const path = paths();
    store.records.set(path.session, { id: SESSION_ID });
    store.records.set(`${path.players}/sender`, player('sender', 'icebreaker-miner'));
    store.records.set(`${path.players}/facilitator`, player('facilitator', '', 'gm'));
    store.records.set(path.state, { type: 'same-table-trade-state', sessionId: SESSION_ID, revision: 0 });
    const callables = createSameTableTradeCallables(dependencies(store));

    const first = await callables.attestPlayerHeldTokenBaseline(attestationRequest());
    const writeCount = store.committedWrites.length;
    const replay = await callables.attestPlayerHeldTokenBaseline(attestationRequest());

    expect(first).toMatchObject({
      status: 'attested', sessionId: SESSION_ID, targetUid: 'sender',
      attestationId: ATTESTATION_ID, revision: 0,
    });
    expect(replay).toEqual({ ...first, status: 'replayed' });
    expect(store.committedWrites).toHaveLength(writeCount);
    expect(store.records.get(`${path.session}/playerHeldResourceInventories/sender`)).toMatchObject({
      sessionId: SESSION_ID,
      type: 'player-held-resource-inventory',
      balances: BASELINE,
      baseline: { attestationId: ATTESTATION_ID, attestedByUid: 'facilitator', balances: BASELINE },
    });
    await expect(callables.attestPlayerHeldTokenBaseline(attestationRequest({ balances: { ...BASELINE, ore: 11 } })))
      .rejects.toMatchObject({ code: 'failed-precondition' });
    await expect(callables.attestPlayerHeldTokenBaseline(attestationRequest({ attestationId: OTHER_ATTESTATION_ID })))
      .rejects.toMatchObject({ code: 'failed-precondition' });
  });

  it('rejects unauthenticated calls and prevents a different actor from creating a sender offer', async () => {
    const store = seededStore();
    store.records.set(paths().offer, {
      type: 'same-table-trade-offer', sessionId: SESSION_ID, id: OFFER_ID,
      fromUid: 'sender', toUid: 'recipient', tableId: 'icebreaker', fleetGroupId: 'fleet-1',
      revision: 4, quantities: { ore: 3, fuel: 2, food: 0, water: 0, materials: 0, securityTeams: 0 },
      status: 'pending',
    });
    const callables = createSameTableTradeCallables(dependencies(store));

    await expect(callables.createSameTableTradeOffer({
      data: createRequest().data,
    })).rejects.toMatchObject({ code: 'unauthenticated' });
    await expect(callables.acceptSameTableTradeOffer(acceptRequest('sender')))
      .rejects.toMatchObject({ code: 'permission-denied' });
    await expect(callables.attestPlayerHeldTokenBaseline({
      ...attestationRequest(),
      auth: { uid: 'sender' },
    })).rejects.toMatchObject({ code: 'permission-denied' });
    expect(store.committedWrites).toHaveLength(0);

    const acceptedStore = seededStore({ accepted: true });
    const acceptedCallables = createSameTableTradeCallables(dependencies(acceptedStore));
    await expect(acceptedCallables.acceptSameTableTradeOffer(acceptRequest('sender')))
      .rejects.toMatchObject({ code: 'permission-denied' });
    expect(acceptedStore.committedWrites).toHaveLength(0);
  });

  it('creates an offer once, returns matching request-ID retries, and rejects collisions', async () => {
    const store = seededStore();
    const callables = createSameTableTradeCallables(dependencies(store));

    const first = await callables.createSameTableTradeOffer(createRequest());
    const writeCount = store.committedWrites.length;
    const replay = await callables.createSameTableTradeOffer(createRequest());
    expect(first).toMatchObject({
      status: 'created', sessionId: SESSION_ID,
      offer: {
        id: OFFER_ID, fromUid: 'sender', toUid: 'recipient', tableId: 'icebreaker',
        fleetGroupId: 'fleet-1', revision: 4, status: 'pending',
      },
    });
    expect(replay).toEqual({ ...first, status: 'replayed' });
    expect(store.committedWrites).toHaveLength(writeCount);
    await expect(callables.createSameTableTradeOffer(createRequest({ quantities: { ore: 2 } })))
      .rejects.toMatchObject({ code: 'failed-precondition' });
    expect(store.committedWrites).toHaveLength(writeCount);
  });

  it('uses the active replacement role vessel instead of the historical printed ship', async () => {
    const store = seededStore();
    const sender = player('sender', 'aegis-admiral');
    sender.replacementRoleId = 'commissar';
    sender.replacementStatus = null;
    store.records.set(`${paths().players}/sender`, sender);
    const callables = createSameTableTradeCallables(dependencies(store));

    const result = await callables.createSameTableTradeOffer(createRequest());

    expect(result).toMatchObject({
      status: 'created',
      offer: { fromUid: 'sender', toUid: 'recipient', tableId: 'icebreaker' },
    });
  });

  it('does not use a historical printed ship while a player awaits reassignment', async () => {
    const store = seededStore();
    const sender = player('sender', 'icebreaker-miner');
    sender.replacementRoleId = 'vip-host';
    sender.replacementStatus = 'awaiting-re-role';
    store.records.set(`${paths().players}/sender`, sender);
    const before = structuredClone([...store.records.entries()]);
    const callables = createSameTableTradeCallables(dependencies(store));

    await expect(callables.createSameTableTradeOffer(createRequest()))
      .rejects.toMatchObject({ code: 'failed-precondition' });
    expect(store.committedWrites).toHaveLength(0);
    expect([...store.records.entries()]).toEqual(before);
  });

  it('rejects offer creation when current server roster tables differ', async () => {
    const store = seededStore();
    store.records.set(`${paths().players}/recipient`, player('recipient', 'dione-engineer'));
    const callables = createSameTableTradeCallables(dependencies(store));
    const before = structuredClone([...store.records.entries()]);

    await expect(callables.createSameTableTradeOffer(createRequest()))
      .rejects.toMatchObject({ code: 'failed-precondition' });
    expect(store.committedWrites).toHaveLength(0);
    expect([...store.records.entries()]).toEqual(before);
  });

  it('fails closed when either participant has no attested private inventory', async () => {
    const store = seededStore();
    store.records.delete(paths().recipientInventory);
    const callables = createSameTableTradeCallables(dependencies(store));

    await expect(callables.createSameTableTradeOffer(createRequest()))
      .rejects.toMatchObject({ code: 'failed-precondition' });
    expect(store.committedWrites).toHaveLength(0);
  });

  it('fails closed if the global revision trails an existing private inventory revision', async () => {
    const store = seededStore({ revision: 3 });
    const callables = createSameTableTradeCallables(dependencies(store));

    await expect(callables.createSameTableTradeOffer(createRequest()))
      .rejects.toMatchObject({ code: 'failed-precondition' });
    expect(store.committedWrites).toHaveLength(0);
  });

  it('commits one bilateral transfer, advances global revision, and creates its stable receipt', async () => {
    const store = seededStore();
    const callables = createSameTableTradeCallables(dependencies(store));
    await callables.createSameTableTradeOffer(createRequest());

    const result = await callables.acceptSameTableTradeOffer(acceptRequest());
    const path = paths();

    expect(result).toMatchObject({
      status: 'committed', sessionId: SESSION_ID, offerId: OFFER_ID, revision: 5,
      receipt: { receiptId: OFFER_ID, revision: 4 },
      inventory: {
        playerUid: 'recipient', revision: 5,
        balances: { ...RECIPIENT_BASELINE, ore: 4, fuel: 3 },
      },
    });
    expect(result).not.toHaveProperty('sourceInventory');
    expect(result).not.toHaveProperty('recipientInventory');
    expect(store.records.get(path.senderInventory)?.balances).toEqual({ ...BASELINE, ore: 7, fuel: 6 });
    expect(store.records.get(path.recipientInventory)?.balances).toEqual({ ...RECIPIENT_BASELINE, ore: 4, fuel: 3 });
    expect(store.records.get(path.state)?.revision).toBe(5);
    expect(store.records.get(path.offer)).toMatchObject({ status: 'accepted', acceptedByUid: 'recipient' });
    expect(store.records.get(path.receipt)).toMatchObject({
      type: 'same-table-trade-receipt', sessionId: SESSION_ID, ...result.receipt,
    });
  });

  it.each(['stale revision', 'wrong current table', 'changed fleet group'])('rejects %s before any write', async (caseName) => {
    const store = seededStore();
    const callables = createSameTableTradeCallables(dependencies(store));
    await callables.createSameTableTradeOffer(createRequest());
    if (caseName === 'stale revision') {
      store.records.set(paths().state, {
        type: 'same-table-trade-state', sessionId: SESSION_ID, revision: 5,
      });
    } else {
      const recipient = player('recipient', caseName === 'wrong current table' ? 'dione-engineer' : 'icebreaker-engineer');
      if (caseName === 'changed fleet group') recipient.fleetGroupId = 'fleet-2';
      store.records.set(`${paths().players}/recipient`, recipient);
    }
    const before = structuredClone([...store.records.entries()]);
    store.committedWrites.length = 0;

    await expect(callables.acceptSameTableTradeOffer(acceptRequest()))
      .rejects.toMatchObject({ code: 'failed-precondition' });
    expect(store.committedWrites).toHaveLength(0);
    expect([...store.records.entries()]).toEqual(before);
  });

  it.each(['overdraw', 'recipient overflow'])('rejects %s without changing balances or receipt', async (failureCase) => {
    const store = seededStore();
    const path = paths();
    const callables = createSameTableTradeCallables(dependencies(store));
    await callables.createSameTableTradeOffer(createRequest());
    if (failureCase === 'overdraw') {
      store.records.set(path.senderInventory, inventory({ ...BASELINE, ore: 2 }));
    } else {
      store.records.set(path.recipientInventory, {
        ...store.records.get(path.recipientInventory),
        balances: { ...RECIPIENT_BASELINE, ore: Number.MAX_SAFE_INTEGER },
      });
    }
    const before = structuredClone([...store.records.entries()]);
    store.committedWrites.length = 0;

    await expect(callables.acceptSameTableTradeOffer(acceptRequest()))
      .rejects.toMatchObject({ code: 'failed-precondition' });
    expect(store.committedWrites).toHaveLength(0);
    expect([...store.records.entries()]).toEqual(before);
  });

  it('rejects malformed quantities without creating an offer or changing the revision', async () => {
    const store = seededStore();
    const callables = createSameTableTradeCallables(dependencies(store));
    const before = structuredClone([...store.records.entries()]);

    await expect(callables.createSameTableTradeOffer(createRequest({ quantities: { ore: 1, scrap: 2 } })))
      .rejects.toMatchObject({ code: 'invalid-argument' });
    expect(store.committedWrites).toHaveLength(0);
    expect([...store.records.entries()]).toEqual(before);
  });

  it('returns the exact accept receipt and current balances on retry after location and revision change', async () => {
    const store = seededStore();
    const callables = createSameTableTradeCallables(dependencies(store));
    await callables.createSameTableTradeOffer(createRequest());
    const committed = await callables.acceptSameTableTradeOffer(acceptRequest());
    const path = paths();
    store.records.set(path.state, { type: 'same-table-trade-state', sessionId: SESSION_ID, revision: 99 });
    store.records.set(`${path.players}/sender`, { ...player('sender', 'dione-engineer'), connected: false });
    store.records.set(`${path.players}/recipient`, player('recipient', 'dione-engineer'));
    const sourceBeforeReplay = structuredClone(store.records.get(path.senderInventory)?.balances);
    const recipientBeforeReplay = structuredClone(store.records.get(path.recipientInventory)?.balances);
    const recipientRevisionBeforeReplay = store.records.get(path.recipientInventory)?.revision;
    store.committedWrites.length = 0;

    const replay = await callables.acceptSameTableTradeOffer(acceptRequest());

    expect(replay).toMatchObject({
      status: 'replayed', sessionId: SESSION_ID, offerId: OFFER_ID,
      revision: 99, receipt: committed.receipt,
      inventory: {
        playerUid: 'recipient', revision: recipientRevisionBeforeReplay,
        balances: recipientBeforeReplay,
      },
    });
    expect(replay).not.toHaveProperty('sourceInventory');
    expect(replay).not.toHaveProperty('recipientInventory');
    expect(store.records.get(path.senderInventory)?.balances).toEqual(sourceBeforeReplay);
    expect(store.records.get(path.recipientInventory)?.balances).toEqual(recipientBeforeReplay);
    expect(store.records.get(path.state)?.revision).toBe(99);
    expect(store.committedWrites).toHaveLength(0);
  });

  it('uses the database transaction boundary for every read before writing', async () => {
    const store = seededStore();
    const callables = createSameTableTradeCallables(dependencies(store));
    await callables.createSameTableTradeOffer(createRequest());
    await callables.acceptSameTableTradeOffer(acceptRequest());

    expect(store.transactionCount).toBe(2);
    expect(store.committedWrites.map(({ path }) => path)).toContain(paths().receipt);
  });
});
