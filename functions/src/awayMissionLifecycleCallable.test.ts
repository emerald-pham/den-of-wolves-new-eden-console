import { expect, it } from 'vitest';
import { HttpsError } from 'firebase-functions/v2/https';
import { awayMissionHandId } from './awayMissionCards';
import { missionDeck, missionDeckStateFromCards } from './missionDeck';
import { createAwayMissionLifecycleCallables } from './awayMissionLifecycleCallable';

type Fields = Record<string, unknown>;
type Write = Readonly<{ kind: 'set' | 'create' | 'update'; path: string; data: Fields }>;
type Transaction = {
  get(ref: { readonly path: string }): Promise<{
    readonly exists: boolean;
    readonly id: string;
    get(field: string): unknown;
    data(): Fields | undefined;
  }>;
  set(ref: { readonly path: string }, data: Fields): void;
  create(ref: { readonly path: string }, data: Fields): void;
  update(ref: { readonly path: string }, data: Fields): void;
};

const SESSION_ID = 'session-1';
const OPPORTUNITY_ID = 'arrival-fleet-1-A-1234-cycle-3';
const MISSION_ID = `mission-${OPPORTUNITY_ID}`;
const ALICE_CARD = 'A♥';
const BOB_CARD = '4♥';
const EXTRA_CARD = '10♦';

function pathSet(target: Fields, dottedPath: string, value: unknown): void {
  const parts = dottedPath.split('.');
  let cursor = target;
  for (const part of parts.slice(0, -1)) {
    cursor[part] = { ...((cursor[part] as Fields | undefined) ?? {}) };
    cursor = cursor[part] as Fields;
  }
  cursor[parts[parts.length - 1]!] = structuredClone(value);
}

class FakeStore {
  readonly records = new Map<string, Fields>();
  readonly committedWrites: Write[] = [];
  retryCallbacks = 0;
  loseNextAcknowledgement = false;

  doc(path: string) {
    return { path, id: path.split('/').at(-1) ?? '' };
  }

  async runTransaction<T>(work: (transaction: unknown) => Promise<T>): Promise<T> {
    let result!: T;
    let stagedWrites: Write[] = [];
    const tx: Transaction = {
      get: async (ref) => {
        const value = this.records.get(ref.path);
        return {
          exists: value !== undefined,
          id: ref.path.split('/').at(-1) ?? '',
          get: (field) => value?.[field],
          data: () => value === undefined ? undefined : structuredClone(value),
        };
      },
      set: (ref, data) => stagedWrites.push({ kind: 'set', path: ref.path, data: structuredClone(data) }),
      create: (ref, data) => stagedWrites.push({ kind: 'create', path: ref.path, data: structuredClone(data) }),
      update: (ref, data) => stagedWrites.push({ kind: 'update', path: ref.path, data: structuredClone(data) }),
    };

    const retryCount = this.retryCallbacks;
    this.retryCallbacks = 0;
    for (let attempt = 0; attempt <= retryCount; attempt += 1) {
      stagedWrites = [];
      result = await work(tx);
    }

    const next = new Map([...this.records].map(([path, value]) => [path, structuredClone(value)]));
    for (const write of stagedWrites) {
      if (write.kind === 'create' && next.has(write.path)) throw new Error(`Document already exists: ${write.path}`);
      if (write.kind === 'update') {
        const current = structuredClone(next.get(write.path) ?? {});
        for (const [key, value] of Object.entries(write.data)) pathSet(current, key, value);
        next.set(write.path, current);
      } else {
        next.set(write.path, structuredClone(write.data));
      }
    }
    this.records.clear();
    next.forEach((value, path) => this.records.set(path, value));
    this.committedWrites.push(...stagedWrites);

    if (this.loseNextAcknowledgement) {
      this.loseNextAcknowledgement = false;
      throw new Error('simulated lost acknowledgement after transaction commit');
    }
    return result;
  }
}

function paths(missionId = MISSION_ID) {
  return {
    session: `sessions/${SESSION_ID}`,
    mission: `sessions/${SESSION_ID}/serverState/awayMissions/instances/${missionId}`,
    deck: `sessions/${SESSION_ID}/serverState/missionDeck`,
    start: `sessions/${SESSION_ID}/missionStartSnapshots/${OPPORTUNITY_ID}`,
    aliceHand: `sessions/${SESSION_ID}/awayMissionHands/${awayMissionHandId(missionId, 'alice')}`,
    bobHand: `sessions/${SESSION_ID}/awayMissionHands/${awayMissionHandId(missionId, 'bob')}`,
    alicePointer: `sessions/${SESSION_ID}/awayMissionHandPointers/${awayMissionHandId(missionId, 'alice')}`,
    bobPointer: `sessions/${SESSION_ID}/awayMissionHandPointers/${awayMissionHandId(missionId, 'bob')}`,
    alicePlayer: `sessions/${SESSION_ID}/players/alice`,
    bobPlayer: `sessions/${SESSION_ID}/players/bob`,
    gmPlayer: `sessions/${SESSION_ID}/players/gm`,
    gmInstance: `sessions/${SESSION_ID}/gmInstances/gm-instance`,
  };
}

function seededStore(options: { readonly warrior?: boolean } = {}): FakeStore {
  const store = new FakeStore();
  const p = paths();
  const allCards = missionDeck();
  const firstIds = [ALICE_CARD, BOB_CARD, EXTRA_CARD, 'A♦'];
  const firstCards = firstIds.map((id) => allCards.find((card) => card.id === id)!);
  const firstSet = new Set(firstIds);
  const deckState = missionDeckStateFromCards([
    ...firstCards,
    ...allCards.filter(({ id }) => !firstSet.has(id)),
  ]);
  const participants = [
    { uid: 'alice', roleId: 'wing-commander' },
    { uid: 'bob', roleId: options.warrior ? 'warrior-captain' : 'capybara-small-captain' },
  ];
  const initialCards = [ALICE_CARD, BOB_CARD];
  const mission = {
    schemaVersion: 1,
    phase: 'awaiting-card-selection',
    revision: 0,
    discardedParticipantUids: [],
    discardedCardIds: [],
    missionId: MISSION_ID,
    requestId: 'mission-start-1',
    actorUid: 'gm',
    groupId: 'fleet-1',
    opportunityId: OPPORTUNITY_ID,
    chart: 'A',
    coordinate: '1234',
    siteCode: 'K',
    sourceCycle: 3,
    missionLeaderUid: 'alice',
    missionLeaderRoleId: 'wing-commander',
    participantSnapshots: participants,
    availableCarrierCraftIds: ['starlight'],
    handIds: participants.map(({ uid }) => awayMissionHandId(MISSION_ID, uid)),
    cardIds: initialCards,
    dealtFrom: 0,
    dealtThrough: 2,
  };
  store.records.set(p.session, {
    phase: 'active',
    currentTurn: 3,
    turnPhase: { phase: 'coordination', turn: 3, phaseRevision: 7 },
  });
  store.records.set(p.deck, { ...deckState, dealtCount: 2 });
  store.records.set(p.mission, mission);
  store.records.set(p.start, {
    type: 'away-mission-start-snapshot',
    schemaVersion: 1,
    sessionId: SESSION_ID,
    opportunityId: OPPORTUNITY_ID,
    missionId: MISSION_ID,
    groupId: 'fleet-1',
    chart: 'A',
    coordinate: '1234',
    siteCode: 'K',
    sourceCycle: 3,
    missionLeader: { uid: 'alice', roleId: 'wing-commander' },
    inputs: {
      availableCarrierCraftIds: ['starlight'],
      participantSnapshots: participants,
      missionLeaderUid: 'alice',
    },
  });
  participants.forEach((participant, index) => {
    const handId = awayMissionHandId(MISSION_ID, participant.uid);
    const card = allCards.find(({ id }) => id === initialCards[index])!;
    store.records.set(`sessions/${SESSION_ID}/awayMissionHands/${handId}`, {
      type: 'away-mission-hand',
      sessionId: SESSION_ID,
      handId,
      missionId: MISSION_ID,
      participantUid: participant.uid,
      cardId: card.id,
      rank: card.rank,
      suit: card.suit,
      value: card.value,
    });
    store.records.set(`sessions/${SESSION_ID}/awayMissionHandPointers/${handId}`, {
      type: 'away-mission-hand-pointer',
      sessionId: SESSION_ID,
      participantUid: participant.uid,
      missionId: MISSION_ID,
      handId,
      groupId: 'fleet-1',
      chart: 'A',
      coordinate: '1234',
      siteCode: 'K',
      sourceCycle: 3,
      participantCount: 2,
      missionLeaderUid: 'alice',
      missionLeaderRoleId: 'wing-commander',
      phase: 'awaiting-card-selection',
      revision: 0,
      discarded: false,
    });
    store.records.set(`sessions/${SESSION_ID}/players/${participant.uid}`, {
      role: 'player',
      connected: true,
      assignedRoleId: participant.roleId,
    });
  });
  store.records.set(p.gmPlayer, { role: 'gm', connected: true });
  store.records.set(p.gmInstance, { uid: 'gm', connected: true, active: true });
  return store;
}

function dependencies(store: FakeStore, options: { readonly d6?: number } = {}) {
  let randomCalls = 0;
  let d6Calls = 0;
  const db = store;
  const callables = createAwayMissionLifecycleCallables({
    db,
    serverTimestamp: () => 'server-time',
    isActivePlayer: (player) => player.exists && player.get('role') === 'player' &&
      player.get('connected') === true && player.get('kickedAt') == null,
    requireActiveGm: async (tx: unknown, sessionId: string, actorUid: string, instanceId: string) => {
      const transaction = tx as Transaction;
      const player = await transaction.get(db.doc(`sessions/${sessionId}/players/${actorUid}`));
      const instance = await transaction.get(db.doc(`sessions/${sessionId}/gmInstances/${instanceId}`));
      if (!player.exists || player.get('role') !== 'gm' || player.get('connected') !== true ||
          !instance.exists || instance.get('uid') !== actorUid || instance.get('active') !== true) {
        throw new HttpsError('permission-denied', 'An active facilitator instance is required.');
      }
    },
    deriveParticipantCrafts: async ({ participantSnapshots }) => participantSnapshots.map(({ uid, roleId }) => ({
      participantUid: uid,
      craftIds: roleId === 'wing-commander' ? ['starlight'] :
        roleId === 'warrior-captain' ? ['warrior'] : [],
    })),
    deriveContext: async ({ session }) => {
      const turnPhase = session.get('turnPhase') as Fields | undefined;
      return {
        currentCycle: session.get('currentTurn') as number,
        teamPhase: turnPhase?.phase === 'team',
        legalDropOffShipIds: ['aegis'],
        bonusSources: [],
      };
    },
    randomIndex: (upperBound: number) => {
      randomCalls += 1;
      return upperBound - 1;
    },
    rollD6: () => {
      d6Calls += 1;
      return options.d6 ?? 6;
    },
  });
  return { ...callables, get randomCalls() { return randomCalls; }, get d6Calls() { return d6Calls; } };
}

const commandRequest = (uid: string, data: Fields) => ({ auth: { uid }, data: { sessionId: SESSION_ID, missionId: MISSION_ID, ...data } });

function currentRevision(store: FakeStore): number {
  return store.records.get(paths().mission)?.revision as number;
}

it('bootstraps only from the exact P403 record, atomically projects a participant-safe state, and returns only the caller’s hand', async () => {
  const store = seededStore();
  const { commitAwayMissionLifecycleCommand } = dependencies(store);

  const reply = await commitAwayMissionLifecycleCommand(commandRequest('bob', {
    type: 'requestExtraCards', requestId: 'request-bob-1', expectedRevision: 0, count: 1,
  }));

  expect(reply).toMatchObject({
    status: 'committed',
    sessionId: SESSION_ID,
    missionId: MISSION_ID,
    requestId: 'request-bob-1',
    revision: 1,
    publicState: { missionId: MISSION_ID, phase: 'awaiting-card-selection', requestCounts: [] },
    privateState: { missionId: MISSION_ID, participantUid: 'bob', cards: [{ id: BOB_CARD, value: 4, status: 'remaining' }] },
  });
  expect(JSON.stringify(reply)).not.toContain(ALICE_CARD);
  expect(JSON.stringify(reply.publicState)).not.toMatch(/cardId|value|choices|secretD6Rolls/);
  expect(store.records.get(paths().mission)?.lifecycleRecord).toMatchObject({
    sessionId: SESSION_ID,
    groupId: 'fleet-1',
    revision: 1,
    lifecycle: { requestsByParticipant: [{ participantUid: 'bob', count: 1 }] },
  });
  expect(store.records.get(`sessions/${SESSION_ID}/commandReceipts/request-bob-1`)).toMatchObject({
    fingerprint: {
      action: 'away-mission-lifecycle-command',
      sessionId: SESSION_ID,
      requestId: 'request-bob-1',
      actorUid: 'bob',
      instanceId: null,
      expectedRevision: 0,
    },
    result: { status: 'committed' },
  });
  expect(store.records.get(paths().bobHand)?.lifecyclePrivateState).toMatchObject({ participantUid: 'bob' });
  expect(store.records.get(paths().aliceHand)?.lifecyclePrivateState).toMatchObject({ participantUid: 'alice' });
  expect(store.records.get(paths().bobPointer)?.lifecyclePublicState).toMatchObject({
    missionId: MISSION_ID,
    revision: 1,
    requestCounts: [],
  });
  expect(store.records.get(paths().alicePointer)?.lifecyclePublicState).toMatchObject({
    requestCounts: [{ participantUid: 'bob', count: 1 }],
  });
  expect(JSON.stringify(store.records.get(paths().bobPointer)?.lifecyclePublicState)).not.toContain(ALICE_CARD);
  expect(JSON.stringify(store.records.get(paths().bobPointer)?.lifecyclePublicState)).not.toContain(BOB_CARD);
  expect(store.committedWrites.some(({ path }) => path === paths().mission)).toBe(true);
  expect(store.committedWrites.some(({ path }) => path === paths().bobHand)).toBe(true);
  expect(store.committedWrites.some(({ path }) => path === paths().aliceHand)).toBe(true);
  expect(store.committedWrites.some(({ path }) => path === paths().bobPointer)).toBe(true);
  expect(store.committedWrites.some(({ path }) => path === paths().alicePointer)).toBe(true);
  expect(store.records.get(paths().deck)?.dealtCount).toBe(2);
});

it('binds exact replays to both authenticated actor and unchanged command, and returns revision conflicts without writes', async () => {
  const store = seededStore();
  const { commitAwayMissionLifecycleCommand } = dependencies(store);
  const request = commandRequest('bob', {
    type: 'requestExtraCards', requestId: 'shared-request-id', expectedRevision: 0, count: 1,
  });
  await commitAwayMissionLifecycleCommand(request);
  await expect(commitAwayMissionLifecycleCommand(request)).resolves.toMatchObject({
    status: 'replayed', revision: 1, privateState: { participantUid: 'bob' },
  });
  await expect(commitAwayMissionLifecycleCommand(commandRequest('alice', {
    type: 'requestExtraCards', requestId: 'shared-request-id', expectedRevision: 0, count: 1,
  }))).rejects.toMatchObject({ code: 'permission-denied' });
  await expect(commitAwayMissionLifecycleCommand(commandRequest('bob', {
    type: 'requestExtraCards', requestId: 'shared-request-id', expectedRevision: 1, count: 2,
  }))).rejects.toMatchObject({ code: 'failed-precondition' });
  const staleRequest = commandRequest('bob', {
    type: 'requestExtraCards', requestId: 'stale-request-id', expectedRevision: 0, count: 1,
  });
  await expect(commitAwayMissionLifecycleCommand(staleRequest)).resolves.toMatchObject({
    status: 'stale', expectedRevision: 0, currentRevision: 1,
  });
  expect(store.records.get(`sessions/${SESSION_ID}/commandReceipts/stale-request-id`)).toMatchObject({
    fingerprint: { action: 'away-mission-lifecycle-command', actorUid: 'bob' },
    result: { status: 'stale' },
  });
  const writesAfterStale = store.committedWrites.length;
  await expect(commitAwayMissionLifecycleCommand(staleRequest)).resolves.toMatchObject({
    status: 'stale', expectedRevision: 0, currentRevision: 1,
  });
  await expect(commitAwayMissionLifecycleCommand(commandRequest('bob', {
    type: 'requestExtraCards', requestId: 'stale-request-id', expectedRevision: 1, count: 2,
  }))).rejects.toMatchObject({ code: 'failed-precondition' });
  expect(store.committedWrites).toHaveLength(writesAfterStale);
  expect(currentRevision(store)).toBe(1);
});

it('fails closed when a committed lifecycle record has lost its atomic event receipt', async () => {
  const store = seededStore();
  const { commitAwayMissionLifecycleCommand } = dependencies(store);
  const request = commandRequest('bob', {
    type: 'requestExtraCards', requestId: 'lost-event-receipt', expectedRevision: 0, count: 1,
  });
  await commitAwayMissionLifecycleCommand(request);
  store.records.delete(`sessions/${SESSION_ID}/events/away-mission-lifecycle-lost-event-receipt`);

  await expect(commitAwayMissionLifecycleCommand(request)).rejects.toMatchObject({ code: 'failed-precondition' });
  expect(currentRevision(store)).toBe(1);
  expect(store.committedWrites).toHaveLength(6);
});

it('rejects nonparticipants, nonleaders, and requests without a live GM instance before writing', async () => {
  const store = seededStore();
  store.records.set(`sessions/${SESSION_ID}/players/eve`, { role: 'player', connected: true });
  const { commitAwayMissionLifecycleCommand } = dependencies(store);

  await expect(commitAwayMissionLifecycleCommand(commandRequest('eve', {
    type: 'requestExtraCards', requestId: 'outsider', expectedRevision: 0, count: 1,
  }))).rejects.toMatchObject({ code: 'permission-denied' });
  await expect(commitAwayMissionLifecycleCommand(commandRequest('bob', {
    type: 'distributeExtraCard', requestId: 'not-leader', expectedRevision: 0,
    participantUid: 'bob', opportunityId: 'K-1',
  }))).rejects.toMatchObject({ code: 'permission-denied' });
  await expect(commitAwayMissionLifecycleCommand(commandRequest('bob', {
    type: 'openDiscards', requestId: 'not-gm', instanceId: 'gm-instance', expectedRevision: 0,
  }))).rejects.toMatchObject({ code: 'permission-denied' });
  expect(store.committedWrites).toHaveLength(0);
});

it('executes every lifecycle command, keeps the deck cursor and projections atomic, and safely retries lost acknowledgements', async () => {
  const store = seededStore();
  const callables = dependencies(store);
  const commit = callables.commitAwayMissionLifecycleCommand;
  const send = (uid: string, type: string, fields: Fields = {}) => commit(commandRequest(uid, {
    type, requestId: `${type}-${currentRevision(store)}`, expectedRevision: currentRevision(store), ...fields,
    ...(['openDiscards', 'addFacilitatorCards', 'resolve'].includes(type) ? { instanceId: 'gm-instance' } : {}),
  }));

  await send('bob', 'requestExtraCards', { count: 1 });
  const distributed = await send('alice', 'distributeExtraCard', { participantUid: 'bob', opportunityId: 'K-1' });
  expect(distributed.status).toBe('committed');
  expect(distributed.privateState?.cards.map(({ id }) => id)).toEqual([ALICE_CARD]);
  expect(store.records.get(paths().deck)?.dealtCount).toBe(3);

  await send('gm', 'openDiscards');
  const aliceDiscard = await send('alice', 'discardCard', { cardId: ALICE_CARD });
  expect(aliceDiscard.privateState?.cards).toMatchObject([{ id: ALICE_CARD, status: 'discarded' }]);
  const bobDiscard = await send('bob', 'discardCard', { cardId: EXTRA_CARD });
  expect(bobDiscard.privateState?.cards).toEqual([
    expect.objectContaining({ id: BOB_CARD, status: 'remaining' }),
    expect.objectContaining({ id: EXTRA_CARD, status: 'discarded' }),
  ]);
  await send('alice', 'assignCards', { placements: [] });
  await send('bob', 'assignCards', { placements: [{ cardId: BOB_CARD, opportunityId: 'K-1' }] });

  store.retryCallbacks = 1;
  const facilitatorRequest = commandRequest('gm', {
    type: 'addFacilitatorCards', requestId: 'facilitator-deal', instanceId: 'gm-instance',
    expectedRevision: currentRevision(store),
  });
  const beforeDealWrites = store.committedWrites.length;
  await expect(commit(facilitatorRequest)).resolves.toMatchObject({
    status: 'committed',
    revision: currentRevision(store) + 1,
    publicState: { phase: 'facilitator-cards-added' },
  });
  expect(callables.randomCalls).toBe(1);
  expect(store.records.get(paths().deck)?.dealtCount).toBe(4);
  expect(store.committedWrites.slice(beforeDealWrites).map(({ path }) => path)).toEqual(expect.arrayContaining([
    paths().mission,
    paths().deck,
    paths().aliceHand,
    paths().bobHand,
    paths().alicePointer,
    paths().bobPointer,
  ]));
  const publicProjection = store.records.get(paths().alicePointer)?.lifecyclePublicState;
  expect(JSON.stringify(publicProjection)).not.toMatch(/A♥|4♥|10♦|cardId|cardTotal|bonusBreakdown/);

  store.retryCallbacks = 1;
  store.loseNextAcknowledgement = true;
  const resolveRequest = commandRequest('gm', {
    type: 'resolve', requestId: 'resolve-k', instanceId: 'gm-instance', expectedRevision: currentRevision(store),
  });
  await expect(commit(resolveRequest)).rejects.toThrow('simulated lost acknowledgement');
  const writesAfterResolve = store.committedWrites.length;
  const committedResolution = store.records.get(paths().mission)?.lifecycleRecord as Fields;
  expect(committedResolution).toMatchObject({ status: 'resolved' });
  expect(JSON.stringify(committedResolution)).not.toContain('secretD6Rolls');
  expect(callables.d6Calls).toBe(1);
  for (let retry = 0; retry < 3; retry += 1) {
    await expect(commit(resolveRequest)).resolves.toMatchObject({ status: 'replayed', publicState: {
      status: 'resolved', outcomes: [expect.objectContaining({ opportunityId: 'K-1', difficulty: 30 })],
    } });
  }
  expect(callables.d6Calls).toBe(1);
  expect(store.committedWrites).toHaveLength(writesAfterResolve);
  const writesBeforeWrongLeaderDropoff = store.committedWrites.length;
  await expect(commit(commandRequest('bob', {
    type: 'dropOff', requestId: 'bob-dropoff', expectedRevision: currentRevision(store), shipId: 'aegis',
  }))).rejects.toMatchObject({ code: 'permission-denied' });
  expect(store.committedWrites).toHaveLength(writesBeforeWrongLeaderDropoff);
  await expect(send('alice', 'dropOff', { shipId: 'aegis' })).resolves.toMatchObject({
    status: 'committed', publicState: { status: 'complete', custody: { shipId: 'aegis' } },
  });
});

it('keeps Warrior Reclamator choices and each participant’s cards private from every other command reply', async () => {
  const store = seededStore({ warrior: true });
  const { commitAwayMissionLifecycleCommand } = dependencies(store);
  const send = (uid: string, type: string, fields: Fields = {}) => commitAwayMissionLifecycleCommand(commandRequest(uid, {
    type,
    requestId: `${type}-${currentRevision(store)}-${uid}`,
    expectedRevision: currentRevision(store),
    ...fields,
    ...(['openDiscards'].includes(type) ? { instanceId: 'gm-instance' } : {}),
  }));

  await send('gm', 'openDiscards');
  const salvage = await send('bob', 'reclamatorSalvage', {
    opportunityId: 'K-1', choices: [{ cardId: BOB_CARD, resource: 'food' }],
  });
  expect(salvage.privateState).toMatchObject({
    participantUid: 'bob',
    reclamatorSalvage: { opportunityId: 'K-1', choices: [{ cardId: BOB_CARD, resource: 'food' }] },
  });
  expect(JSON.stringify(salvage.publicState)).not.toMatch(/4♥|choices|food|cardId/);
  expect(JSON.stringify(store.records.get(paths().bobPointer)?.lifecyclePublicState)).not.toMatch(/4♥|choices|food|cardId/);

  const aliceReply = await send('alice', 'discardCard', { cardId: ALICE_CARD });
  expect(aliceReply.privateState?.cards.map(({ id }) => id)).toEqual([ALICE_CARD]);
  expect(JSON.stringify(aliceReply)).not.toMatch(/4♥|choices|food/);
  expect(JSON.stringify(aliceReply)).not.toContain(BOB_CARD);
});

it('derives overrun from the current server phase and rejects forged authority or malformed commands', async () => {
  const store = seededStore();
  const session = store.records.get(paths().session)!;
  session.turnPhase = { phase: 'team', turn: 3, phaseRevision: 8 };
  store.records.set(paths().session, session);
  const { commitAwayMissionLifecycleCommand } = dependencies(store);

  const overrun = await commitAwayMissionLifecycleCommand(commandRequest('bob', {
    type: 'requestExtraCards', requestId: 'team-phase-request', expectedRevision: 0, count: 1,
  }));
  expect(overrun).toMatchObject({ status: 'committed', publicState: { overrun: true } });
  await expect(commitAwayMissionLifecycleCommand(commandRequest('bob', {
    type: 'requestExtraCards', requestId: 'forged-die', expectedRevision: 1, count: 1, secretD6Rolls: { 'K-1': 6 },
  }))).rejects.toMatchObject({ code: 'invalid-argument' });
  expect(currentRevision(store)).toBe(1);
});

it('fails closed when any immutable P403 start, deck, initial hand, or pointer state is missing or inconsistent', async () => {
  const missingCases = [
    (store: FakeStore) => store.records.delete(paths().start),
    (store: FakeStore) => store.records.delete(paths().deck),
    (store: FakeStore) => store.records.delete(paths().aliceHand),
    (store: FakeStore) => store.records.delete(paths().bobPointer),
    (store: FakeStore) => { store.records.get(paths().mission)!.cardIds = [ALICE_CARD, ALICE_CARD]; },
    (store: FakeStore) => { store.records.get(paths().aliceHand)!.cardId = 'A♣'; },
    (store: FakeStore) => { store.records.get(paths().bobPointer)!.groupId = 'other-fleet'; },
  ];

  for (const breakState of missingCases) {
    const store = seededStore();
    breakState(store);
    const { commitAwayMissionLifecycleCommand } = dependencies(store);
    await expect(commitAwayMissionLifecycleCommand(commandRequest('bob', {
      type: 'requestExtraCards', requestId: 'closed-fail', expectedRevision: 0, count: 1,
    }))).rejects.toMatchObject({ code: 'failed-precondition' });
    expect(store.committedWrites).toHaveLength(0);
  }
});
