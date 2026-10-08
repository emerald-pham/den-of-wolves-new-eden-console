import { expect, it } from 'vitest';
import { HttpsError } from 'firebase-functions/v2/https';
import { awayMissionHandId } from './awayMissionCards';
import { missionDeck, missionDeckStateFromCards } from './missionDeck';
import { nextMissionCraftCommitments } from './missionCraftCommitment';
import { createAwayMissionLifecycleCallables } from './awayMissionLifecycleCallable';
import type { Firestore } from 'firebase-admin/firestore';
import { prepareResolvedMissionConsequences, prepareMissionRewardConsequences, validateMissionRewardChoice,
  requireLiveMissionWolfSource } from './missionConsequences';
import { missionRewardConsoleTargets, planMissionRewardDelivery } from './missionRewardDelivery';
import { organiserSitesForChart } from './starChartLookup';
import { endeavourResearchTrack } from './endeavourResearch';
import { resolveEndeavourResearchChoice } from './endeavourResearchCadence';
import type { AwayMissionLifecycleRecord, AwayMissionPrivateState, AwayMissionPublicState } from './awayMissionLifecycleAdapter';

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

// Retained-parity regressions exercise the callable from its original private deal.
it('accepts Warrior reclamation of a science opportunity and consumes the complete hand privately', async () => {
  const store = seededStore({ warrior: true, siteCode: 'D' });
  const commit = dependencies(store).commitAwayMissionLifecycleCommand;
  await commit(commandRequest('gm', { type: 'openDiscards', instanceId: 'gm-instance', requestId: 'open-any', expectedRevision: 0 }));
  const request = commandRequest('bob', { type: 'reclamatorSalvage', requestId: 'claim-science', expectedRevision: 1,
    opportunityId: 'D-3', choices: [{ cardId: BOB_CARD, resource: 'water' }] });
  store.retryCallbacks = 2;
  const reply = await commit(request);
  expect(reply.status).toBe('committed');
  expect(reply.privateState?.reclamatorSalvage).toEqual({ opportunityId: 'D-3', choices: [{ cardId: BOB_CARD, resource: 'water' }] });
  expect(reply.privateState?.cards).toEqual([{ id: BOB_CARD, value: 4, status: 'discarded', opportunityId: null }]);
  expect(store.records.get(paths().mission)?.lifecycleRecord.reclamatorSalvages).toEqual([
    { participantUid: 'bob', opportunityId: 'D-3', cardIds: [BOB_CARD], choices: [{ cardId: BOB_CARD, resource: 'water' }], resources: { materials: 1, water: 1 } },
  ]);
  expect(JSON.stringify(reply.publicState)).not.toMatch(/4♥|choices|cardIds|canUseReclamator/);
  const writes = store.committedWrites.length;
  expect((await commit(request)).status).toBe('replayed');
  expect(store.committedWrites).toHaveLength(writes);
});

it('durably excludes ordinary assignment to a reclaimed opportunity and keeps the losing hand unchanged', async () => {
  const store = seededStore({ warrior: true, siteCode: 'D' });
  const commit = dependencies(store).commitAwayMissionLifecycleCommand;
  const send = (uid: string, type: string, fields: Fields = {}) => commit(commandRequest(uid, {
    type, requestId: `${type}-${currentRevision(store)}`, expectedRevision: currentRevision(store), ...fields,
    ...(type === 'openDiscards' ? { instanceId: 'gm-instance' } : {}),
  }));
  await send('alice', 'requestExtraCards', { count: 1 });
  await send('alice', 'distributeExtraCard', { participantUid: 'alice', opportunityId: 'D-1' });
  await send('gm', 'openDiscards');
  const claimRevision = currentRevision(store);
  await send('bob', 'reclamatorSalvage', { opportunityId: 'D-1', choices: [{ cardId: BOB_CARD, resource: 'food' }] });
  expect((await commit(commandRequest('bob', { type: 'reclamatorSalvage', requestId: 'competing-claim', expectedRevision: claimRevision,
    opportunityId: 'D-2', choices: [{ cardId: BOB_CARD, resource: 'water' }] }))).status).toBe('stale');
  await send('alice', 'discardCard', { cardId: ALICE_CARD });
  const writes = store.committedWrites.length;
  const hand = structuredClone(store.records.get(paths().aliceHand));
  await expect(send('alice', 'assignCards', { placements: [{ cardId: EXTRA_CARD, opportunityId: 'D-1' }] }))
    .rejects.toMatchObject({ code: 'failed-precondition' });
  expect(store.committedWrites).toHaveLength(writes);
  expect(store.records.get(paths().aliceHand)).toEqual(hand);
  const accepted = await send('alice', 'assignCards', { placements: [{ cardId: EXTRA_CARD, opportunityId: 'D-2' }] });
  expect(accepted.publicState.status).toBe('resolved');
  expect(accepted.publicState.outcomes?.find(({ opportunityId }) => opportunityId === 'D-1')?.contributorCount).toBe(0);
  expect(accepted.publicState.specialRewards).toEqual([{ opportunityId: 'D-1', resources: { materials: 1, food: 1 } }]);
  expect(JSON.stringify(accepted.publicState)).not.toMatch(/10♦|4♥|choices|cardIds/);
});

it('lets the leader grant a blind extra without a request while retaining slot, pool and actor limits', async () => {
  const store = seededStore({ siteCode: 'K' });
  const commit = dependencies(store).commitAwayMissionLifecycleCommand;
  const request = commandRequest('alice', { type: 'distributeExtraCard', requestId: 'unrequested-grant', expectedRevision: 0,
    participantUid: 'bob', opportunityId: 'K-1' });
  store.retryCallbacks = 1;
  const reply = await commit(request);
  expect(reply.status).toBe('committed');
  expect(reply.publicState.requestCounts).toEqual([]);
  expect(reply.privateState?.cards.map(({ id }) => id)).toEqual([ALICE_CARD]);
  expect(store.records.get(paths().bobHand)?.lifecyclePrivateState.cards.map(({ id }: { id: string }) => id)).toEqual([BOB_CARD, EXTRA_CARD]);
  expect(JSON.stringify(reply)).not.toContain(EXTRA_CARD);
  const writes = store.committedWrites.length;
  expect((await commit(request)).status).toBe('replayed');
  expect(store.committedWrites).toHaveLength(writes);
  await expect(commit(commandRequest('alice', { type: 'distributeExtraCard', requestId: 'same-slot', expectedRevision: 1,
    participantUid: 'bob', opportunityId: 'K-1' }))).rejects.toMatchObject({ code: 'failed-precondition' });
  await expect(commit(commandRequest('bob', { type: 'distributeExtraCard', requestId: 'foreign-grant', expectedRevision: 1,
    participantUid: 'alice', opportunityId: 'K-1' }))).rejects.toMatchObject({ code: 'permission-denied' });
  const noStock = seededStore({ siteCode: 'K' });
  noStock.records.set(paths().deck, { ...noStock.records.get(paths().deck)!, dealtCount: 33, resolvedDiscardCardIds: [] });
  await expect(dependencies(noStock).commitAwayMissionLifecycleCommand(request)).rejects.toMatchObject({ code: 'failed-precondition' });
  expect(noStock.committedWrites).toHaveLength(0);
});

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

function seededStore(options: { readonly warrior?: boolean; readonly siteCode?: string } = {}): FakeStore {
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
  const participantCrafts = [
    { participantUid: 'alice', craftIds: ['starlight'] },
    { participantUid: 'bob', craftIds: [options.warrior ? 'warrior' : 'capybara-small'] },
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
    siteCode: options.siteCode ?? 'K',
    sourceCycle: 3,
    missionLeaderUid: 'alice',
    missionLeaderRoleId: 'wing-commander',
    participantSnapshots: participants,
    participantCrafts,
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
    requestId: 'mission-start-1',
    opportunityId: OPPORTUNITY_ID,
    missionId: MISSION_ID,
    groupId: 'fleet-1',
    chart: 'A',
    coordinate: '1234',
    siteCode: options.siteCode ?? 'K',
    sourceCycle: 3,
    missionLeader: { uid: 'alice', roleId: 'wing-commander' },
    stateDelta: { missionDeckDealtCountBefore: 0, missionDeckDealtCountAfter: 2 },
    revisions: { missionDeck: { before: 0, after: 2 } },
    inputs: {
      availableCarrierCraftIds: ['starlight'],
      participantSnapshots: participants,
      participantCrafts,
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
      siteCode: options.siteCode ?? 'K',
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

function dependencies(store: FakeStore, options: { readonly integrateConsequences?: boolean; readonly d6?: number; readonly prepareRewardDelivery?: (context: unknown) => Promise<() => void>; readonly prepareExplorationApplication?: (context: unknown) => Promise<() => void> } = {}) {
  let randomCalls = 0;
  let d6Calls = 0;
  const db = store;
  const callables = createAwayMissionLifecycleCallables({
    db,
    commandMarkers: {
      read: (transaction, sessionId, requestId) =>
        (transaction as Transaction).get(db.doc(`sessions/${sessionId}/commandReceipts/${requestId}`)),
      create: (transaction, fingerprint, result) => {
        (transaction as Transaction).create(
          db.doc(`sessions/${SESSION_ID}/commandReceipts/${fingerprint.requestId}`),
          { fingerprint, result, createdAt: 'server-time' },
        );
      },
    },
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
    deriveParticipantCrafts: async ({ participantSnapshots, participantCrafts }) => participantCrafts ??
      participantSnapshots.map(({ uid, roleId }) => ({
        participantUid: uid,
        craftIds: roleId === 'wing-commander' ? ['starlight'] :
          roleId === 'warrior-captain' ? ['warrior'] : [],
      })),
    prepareCraftCommitments: async ({ transaction, session, nextRecord }) => {
      const commitments = nextMissionCraftCommitments(session.get('missionCraftCommitments'), {
        missionId: nextRecord.lifecycle.missionId, sourceCycle: nextRecord.sourceCycle,
        status: nextRecord.status, participantCrafts: nextRecord.participantCrafts,
      });
      if (!commitments) throw new Error('Invalid mission craft commitment.');
      return () => (transaction as Transaction).update(store.doc(paths().session), { missionCraftCommitments: commitments });
    },
    prepareExplorationApplication: options.prepareExplorationApplication ?? (async () => () => undefined),
    prepareRewardDelivery: options.prepareRewardDelivery ?? (options.integrateConsequences ? async (context) => {
      const consequences = await prepareMissionRewardConsequences(store as unknown as Firestore, context);
      const resources = context.session.get('shipResources') as Fields;
      const delivery = planMissionRewardDelivery({ shipId: context.shipId, inventory: resources[context.shipId], population: 0, minerals: 0,
        rewards: context.nextRecord.rewards ?? [], specialRewards: context.nextRecord.specialRewards ?? [] });
      if (!delivery) throw new Error('Invalid numeric delivery.');
      return () => {
        consequences.commit();
        (context.transaction as Transaction).update(store.doc(paths().session), { ...consequences.sessionPatch, [`shipResources.${context.shipId}`]: delivery.inventory });
        (context.transaction as Transaction).create(store.doc(`sessions/${SESSION_ID}/serverState/missionRewardDeliveries/receipts/${MISSION_ID}`),
          { missionId: MISSION_ID, ...consequences.receiptFields });
      };
    } : async () => () => undefined),
    ...(options.integrateConsequences ? {
      prepareResolvedConsequences: (context: Parameters<typeof prepareResolvedMissionConsequences>[1]) =>
        prepareResolvedMissionConsequences(store as unknown as Firestore, context),
      validateRewardChoice: validateMissionRewardChoice,
    } : {}),
    deriveContext: async ({ session }) => {
      const turnPhase = session.get('turnPhase') as Fields | undefined;
      return {
        currentCycle: session.get('currentTurn') as number,
        teamPhase: turnPhase?.phase === 'team',
        legalDropOffShipIds: options.integrateConsequences ? ['aegis', 'refinery-124'] : ['aegis'],
        ...(options.integrateConsequences ? { currentGroupId: 'fleet-1',
          rewardConsoleTargets: missionRewardConsoleTargets(['aegis', 'refinery-124'], session.get('shipUpgrades'), session.get('shipDamage')) } : {}),
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

function consequenceStore(siteCode: string): FakeStore {
  const store = seededStore({ siteCode });
  const coordinate = Object.entries(organiserSitesForChart('A')).find(([, site]) => site.code === siteCode)![0];
  for (const [path, fields] of store.records) if (fields.coordinate !== undefined) store.records.set(path, { ...fields, coordinate });
  const p = paths();
  const initial = store.records.get(p.session)!;
  const inventory = { ore: 0, fuel: 0, food: 0, water: 0, materials: 0, securityTeams: 0 };
  store.records.set(p.session, { ...initial, chartId: 'A', chartSelectionLocked: true, activeVesselIds: ['aegis', 'refinery-124'],
    shipResources: { aegis: { ...inventory }, 'refinery-124': { ...inventory } }, shipUpgrades: {},
    shipDamage: { 'refinery-124': { damagedSystemIds: ['reactor', 'jump-drive'], destroyed: false } } });
  store.records.set(`sessions/${SESSION_ID}/serverState/navigation`, { revision: 2,
    shipGalacticCoordinates: { aegis: coordinate, 'refinery-124': coordinate }, shipNavigationLogs: {}, pursuitGroups: { 'fleet-1': 2 } });
  const ids = [ALICE_CARD, BOB_CARD, '10♦', 'A♦', '9♥'];
  store.records.set(p.deck, { ...missionDeckStateFromCards([...ids.map(id => missionDeck().find(card => card.id === id)!),
    ...missionDeck().filter(card => !ids.includes(card.id))]), dealtCount: 2 });
  return store;
}

async function resolveConsequences(siteCode: string, opportunityId: string, contributors = 2, d6 = 6) {
  const store = consequenceStore(siteCode);
  const callables = dependencies(store, { integrateConsequences: true, d6 });
  let sequence = 0;
  const send = (uid: string, type: string, fields: Fields = {}) => callables.commitAwayMissionLifecycleCommand(commandRequest(uid, {
    type, requestId: `consequence-${++sequence}`, expectedRevision: currentRevision(store), ...fields,
    ...(uid === 'gm' ? { instanceId: 'gm-instance' } : {}),
  }));
  for (const uid of ['alice', 'bob'].slice(0, contributors)) await send('alice', 'distributeExtraCard', { participantUid: uid, opportunityId });
  await send('gm', 'openDiscards');
  await send('alice', 'discardCard', { cardId: ALICE_CARD });
  await send('bob', 'discardCard', { cardId: BOB_CARD });
  await send('alice', 'assignCards', { placements: contributors > 0 ? [{ cardId: '10♦', opportunityId }] : [] });
  const resolved = await send('bob', 'assignCards', { placements: contributors > 1 ? [{ cardId: 'A♦', opportunityId }] : [] });
  expect(store.records.get(paths().mission)?.status).toBe('resolved');
  const resolutionRequest = commandRequest('bob', { type: 'assignCards', requestId: resolved.requestId,
    expectedRevision: resolved.revision - 1, placements: contributors > 1 ? [{ cardId: 'A♦', opportunityId }] : [] });
  return { store, send, callables, resolved, resolutionRequest };
}

function legacyKPublicProjection(state: AwayMissionPublicState, record: AwayMissionLifecycleRecord): AwayMissionPublicState {
  return { ...state, outcomes: state.outcomes!.map(outcome => {
    const authoritative = record.outcomes!.find(candidate => candidate.opportunityId === outcome.opportunityId)!;
    return { ...outcome, difficulty: authoritative.difficulty, criticalThreshold: authoritative.criticalThreshold };
  }) };
}

it('rebuilds an exact legacy K receipt replay safely without changing saved numeric receipts or public pointers', async () => {
  const { store, callables, resolutionRequest } = await resolveConsequences('K', 'K-1', 1, 6);
  const record = store.records.get(paths().mission)!.lifecycleRecord as AwayMissionLifecycleRecord;
  expect(record.outcomes).toEqual([expect.objectContaining({ contributorCount: 1, total: 20,
    difficulty: 30, criticalThreshold: 40, outcome: 'failure', rewardBranch: 'none' })]);
  for (const path of [paths().alicePointer, paths().bobPointer]) {
    const pointer = store.records.get(path)!;
    store.records.set(path, { ...pointer, lifecyclePublicState: legacyKPublicProjection(pointer.lifecyclePublicState as AwayMissionPublicState, record) });
  }
  const markerPath = `sessions/${SESSION_ID}/commandReceipts/${resolutionRequest.data.requestId}`;
  const marker = store.records.get(markerPath)!;
  const savedReply = marker.result as { publicState: AwayMissionPublicState };
  store.records.set(markerPath, { ...marker, result: { ...savedReply, publicState: legacyKPublicProjection(savedReply.publicState, record) } });
  const before = structuredClone([...store.records]);
  const writes = store.committedWrites.length;
  const randomCalls = callables.randomCalls; const d6Calls = callables.d6Calls;
  for (let retry = 0; retry < 3; retry += 1) {
    const replay = await callables.commitAwayMissionLifecycleCommand(resolutionRequest);
    expect(replay.status).toBe('replayed');
    expect(replay.publicState.outcomes).toEqual([expect.objectContaining({ total: 20,
      difficulty: null, criticalThreshold: null, outcome: 'failure' })]);
    expect(replay.publicState.rewards).toEqual([expect.objectContaining({ branch: 'none', resources: {}, effects: [] })]);
    expect(replay.privateState?.participantUid).toBe('bob');
  }
  expect(store.committedWrites).toHaveLength(writes);
  expect([...store.records]).toEqual(before);
  expect(callables.randomCalls).toBe(randomCalls);
  expect(callables.d6Calls).toBe(d6Calls);
});

it('redacts a fresh leader response after a valid legacy K pointer while preserving the protected outcome', async () => {
  const { store, send } = await resolveConsequences('K', 'K-1', 1, 6);
  const record = store.records.get(paths().mission)!.lifecycleRecord as AwayMissionLifecycleRecord;
  for (const path of [paths().alicePointer, paths().bobPointer]) {
    const pointer = store.records.get(path)!;
    store.records.set(path, { ...pointer, lifecyclePublicState: legacyKPublicProjection(pointer.lifecyclePublicState as AwayMissionPublicState, record) });
  }
  const reply = await send('alice', 'dropOff', { shipId: 'aegis' });
  expect(reply.publicState.status).toBe('complete');
  expect(reply.publicState.outcomes).toEqual([expect.objectContaining({ difficulty: null, criticalThreshold: null, outcome: 'failure' })]);
  expect((store.records.get(paths().mission)!.lifecycleRecord as AwayMissionLifecycleRecord).outcomes).toEqual(record.outcomes);
  for (const path of [paths().alicePointer, paths().bobPointer]) expect(store.records.get(path)!.lifecyclePublicState)
    .toMatchObject({ status: 'complete', outcomes: [expect.objectContaining({ difficulty: null, criticalThreshold: null })] });
});

it.each(['difficulty', 'criticalThreshold', 'foreign mission', 'private field'] as const)(
  'denies an altered legacy K pointer (%s) before replay without writes', async mutation => {
    const { store, callables, resolutionRequest } = await resolveConsequences('K', 'K-1', 1, 6);
    const record = store.records.get(paths().mission)!.lifecycleRecord as AwayMissionLifecycleRecord;
    const pointer = store.records.get(paths().bobPointer)!;
    const state = legacyKPublicProjection(pointer.lifecyclePublicState as AwayMissionPublicState, record);
    const altered = mutation === 'foreign mission' ? { ...state, missionId: 'foreign-mission' }
      : mutation === 'private field' ? { ...state, secretD6Rolls: { 'K-1': 6 } }
      : { ...state, outcomes: state.outcomes!.map(outcome => ({ ...outcome, [mutation]: mutation === 'difficulty' ? 25 : 35 })) };
    store.records.set(paths().bobPointer, { ...pointer, lifecyclePublicState: altered });
    const writes = store.committedWrites.length;
    await expect(callables.commitAwayMissionLifecycleCommand(resolutionRequest)).rejects.toMatchObject({ code: 'failed-precondition' });
    expect(store.committedWrites).toHaveLength(writes);
  });

it.each([['C', 'C-2', ['reactor'], { reactor: 1 }], ['H', 'H-2', ['reactor', 'reactor'], { reactor: 2 }],
  ['H', 'H-3', ['jump-drive'], { 'jump-drive': 4 }]] as const)('settles %s %s through the production consequence callback and private callable', async (site, opportunityId, trackIds, progress) => {
  const { store, send } = await resolveConsequences(site, opportunityId);
  await expect(send('alice', 'dropOff', { shipId: 'aegis' })).rejects.toMatchObject({ code: 'failed-precondition' });
  await send('alice', 'chooseRewardTargets', { opportunityId, choice: { kind: 'research', trackIds } });
  store.retryCallbacks = 2; store.loseNextAcknowledgement = true;
  await expect(send('alice', 'dropOff', { shipId: 'aegis' })).rejects.toThrow(/lost acknowledgement/);
  expect(store.records.get(`sessions/${SESSION_ID}/serverState/endeavourResearch`)).toEqual(progress);
  expect(store.records.get(`sessions/${SESSION_ID}/serverState/endeavourResearchCadence`)).toEqual({ cycle: 3, revision: 1, choices: [] });
  expect(store.records.get(paths().mission)?.status).toBe('complete');
  if (site === 'C') {
    expect(endeavourResearchTrack(progress, 'reactor')).toMatchObject({ crossedBoxes: 2, currentMaterialCost: 7 });
    expect(resolveEndeavourResearchChoice({ state: store.records.get(`sessions/${SESSION_ID}/serverState/endeavourResearchCadence`),
      progress, cycle: 3, expectedRevision: 1, trackId: 'reactor', funding: 'standard', shepherdOre: 10,
      actorScope: 'player', turnPhase: { turn: 3, teamPhaseEndsAt: '2099-10-08T10:00:00Z', openAirspaceEndsAt: '2099-10-08T10:15:00Z',
        airspace: { state: 'restricted', tickerActive: true, pressAccess: false } } })).toMatchObject({ progress: { reactor: 2 },
      state: { revision: 2, choices: [{ trackId: 'reactor', funding: 'standard', oreCost: 0 }] } });
  }
});

it.each([['F', 'F-3', 'upgrade', [{ shipId: 'refinery-124', systemId: 'fuel-refinery' }]],
  ['F', 'F-3', 'repair', [{ shipId: 'refinery-124', systemId: 'reactor' }, { shipId: 'refinery-124', systemId: 'jump-drive' }]],
  ['G', 'G-3', 'upgrade', [{ shipId: 'aegis', systemId: 'reactor' }]],
  ['L', 'L-3', 'upgrade', [{ shipId: 'aegis', systemId: 'point-defence-lasers' }, { shipId: 'aegis', systemId: 'missile-launchers' }]],
  ['M', 'M-3', 'upgrade', [{ shipId: 'aegis', systemId: 'point-defence-lasers' }, { shipId: 'aegis', systemId: 'missile-launchers' }, { shipId: 'aegis', systemId: 'command-and-control' }]]] as const)(
  'applies %s %s %s in the production delivery callback without a purchase', async (site, opportunityId, action, targets) => {
    const { store, send } = await resolveConsequences(site, opportunityId);
    await send('alice', 'chooseRewardTargets', { opportunityId, choice: { kind: 'consoles', action, targets } });
    store.retryCallbacks = 1;
    await send('alice', 'dropOff', { shipId: 'aegis' });
    const session = store.records.get(paths().session)!;
    for (const target of targets) {
      if (action === 'upgrade') expect(session.shipUpgrades[target.shipId]).toContain(target.systemId);
      else expect(session.shipDamage[target.shipId].damagedSystemIds).not.toContain(target.systemId);
    }
    // This fixture includes a Capybara contributor: retain its printed +1 bulk-haulage reward.
    expect(session.shipResources.aegis.materials).toBe(site === 'G' ? 7 : 0);
  });

it.each([
  ['upgrade', [{ shipId: 'refinery-124', systemId: 'fuel-refinery' }]],
  ['repair', [{ shipId: 'refinery-124', systemId: 'reactor' }, { shipId: 'refinery-124', systemId: 'jump-drive' }]],
] as const)('keeps the actual F3 %s selection leader-private while preserving its public printed alternatives', async (action, targets) => {
  const { store, send, callables } = await resolveConsequences('F', 'F-3');
  const choice = { kind: 'consoles', action, targets };
  const selection = [{ opportunityId: 'F-3', choice }];
  const selected = await send('alice', 'chooseRewardTargets', { opportunityId: 'F-3', choice });
  expect(selected.privateState?.rewardChoices).toEqual(selection);
  expect(selected.privateState?.rewardOptions).toEqual(expect.arrayContaining([
    expect.objectContaining({ opportunityId: 'F-3', consoleTargets: expect.arrayContaining([
      expect.objectContaining({ shipId: 'refinery-124', systemId: targets[0].systemId }),
    ]) }),
  ]));
  expect((store.records.get(paths().mission)?.lifecycleRecord as AwayMissionLifecycleRecord | undefined)?.rewardChoices).toEqual(selection);

  const request = commandRequest('alice', { type: 'dropOff', requestId: `private-f3-${action}`,
    expectedRevision: currentRevision(store), shipId: 'aegis' });
  store.retryCallbacks = 1;
  const delivered = await callables.commitAwayMissionLifecycleCommand(request);
  expect(delivered.publicState.status).toBe('complete');
  const writes = store.committedWrites.length;
  const replay = await callables.commitAwayMissionLifecycleCommand(request);
  expect(replay.status).toBe('replayed');
  expect(store.committedWrites).toHaveLength(writes);

  const printedEffects = [{ kind: 'upgradeOrRepairConsoles', target: 'refinery-124',
    choices: [{ action: 'upgrade', amount: 1 }, { action: 'repair', amount: 2 }], selection: 'choice' }];
  const privateKeys = new Set(['rewardChoices', 'rewardOptions', 'choice', 'trackIds', 'targets',
    'consoleTargets', 'consoleActions', 'systemId', 'canUpgrade', 'canRepair', 'cardId', 'cardIds', 'cards']);
  const assertNoPrivateFields = (value: unknown): void => {
    if (Array.isArray(value)) { value.forEach(assertNoPrivateFields); return; }
    if (!value || typeof value !== 'object') return;
    for (const [key, nested] of Object.entries(value)) {
      expect(privateKeys.has(key)).toBe(false);
      assertNoPrivateFields(nested);
    }
  };
  for (const publicState of [selected.publicState, delivered.publicState, replay.publicState,
    store.records.get(paths().alicePointer)?.lifecyclePublicState as AwayMissionPublicState,
    store.records.get(paths().bobPointer)?.lifecyclePublicState as AwayMissionPublicState]) {
    expect(Object.keys(publicState).sort()).toEqual(['missionId', 'groupId', 'siteCode', 'revision', 'phase', 'status',
      'overrun', 'missionLeaderUid', 'participantCount', 'opportunities', 'requestCounts', 'outcomes', 'rewards',
      'specialRewards', 'custody', 'legalDropOffShipIds'].sort());
    expect(publicState.rewards?.find(({ opportunityId }) => opportunityId === 'F-3')?.effects)
      .toEqual(printedEffects);
    assertNoPrivateFields(publicState);
  }
  for (const privateState of [delivered.privateState, replay.privateState,
    store.records.get(paths().aliceHand)?.lifecyclePrivateState as AwayMissionPrivateState | undefined]) {
    expect(privateState?.rewardChoices).toEqual(selection);
  }
  const otherParticipant = store.records.get(paths().bobHand)?.lifecyclePrivateState;
  expect(otherParticipant).toMatchObject({ participantUid: 'bob' });
  expect(otherParticipant).not.toHaveProperty('rewardChoices');
  expect(otherParticipant).not.toHaveProperty('rewardOptions');
});

it.each(['I-1', 'I-2', 'I-3'])('applies %s through actual automatic resolution and retains retry atomicity', async opportunityId => {
  const { store } = await resolveConsequences('I', opportunityId);
  if (opportunityId === 'I-3') expect(store.records.get(`sessions/${SESSION_ID}/serverState/endeavourResearch`))
    .toEqual({ 'ecm-device': 4, 'jump-drive': 4 });
  else expect(store.records.get(`sessions/${SESSION_ID}/serverState/navigation`)).toMatchObject({ revision: 3,
    missionNebulaBenefitsByShip: { aegis: { missionId: MISSION_ID, coordinate: '1096',
      suppressMaintenanceDamage: opportunityId === 'I-1', freeExitFuel: opportunityId === 'I-2' } } });
  expect(store.records.get(paths().session)).not.toHaveProperty('missionNebulaBenefitsByShip');
});

it.each([[6, 1, true, 'failure'], [3, 1, true, 'success'], [2, 1, false, 'critical-success'], [2, 2, false, 'critical-success'], [2, 0, false, 'automatic-failure']] as const)(
  'produces source-bound K pressure from an actual attempt only (%s, %s)', async (d6, contributors, scheduled, outcome) => {
    const { store } = await resolveConsequences('K', 'K-1', contributors, d6);
    expect(store.records.get(paths().mission)!.lifecycleRecord.outcomes.find((result: { opportunityId: string }) => result.opportunityId === 'K-1'))
      .toMatchObject({ contributorCount: contributors, outcome });
    const pressure = store.records.get(`sessions/${SESSION_ID}/wolfAttackPressure/mission-${MISSION_ID}`);
    if (!scheduled) { expect(pressure).toBeUndefined(); return; }
    const mission = store.records.get(paths().mission)!;
    expect(pressure).toMatchObject({ siteCode: 'K', status: 'scheduled', arrivalTiming: 'immediate', resolutionRequestId: mission.lifecycleRecord.resolutionRequestId });
    const input = { sessionId: SESSION_ID, sourceId: `mission-${MISSION_ID}`, currentCycle: 3, chart: 'A' as const,
      group: { id: 'fleet-1', vesselIds: ['aegis', 'refinery-124'], memberUids: ['alice', 'bob'] },
      activeVesselIds: ['aegis', 'refinery-124'], mission, pressure };
    expect(requireLiveMissionWolfSource(input)).toEqual(pressure);
    expect(() => requireLiveMissionWolfSource({ ...input, group: { ...input.group, id: 'fleet-2' } })).toThrow();
    expect(() => requireLiveMissionWolfSource({ ...input, pressure: { ...pressure, resolutionRequestId: 'foreign-attempt' } })).toThrow();
    expect(() => requireLiveMissionWolfSource({ ...input, pressure: { ...pressure, status: 'declared' } })).toThrow();
    expect(JSON.stringify(pressure)).not.toMatch(/secretD6|difficulty|cardTotal|cardId/);
  });

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
    participantCrafts: [
      { participantUid: 'alice', craftIds: ['starlight'] },
      { participantUid: 'bob', craftIds: ['capybara-small'] },
    ],
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

it('bootstraps a P403 start that combines top-deck cards with resolved mission discards', async () => {
  const store = seededStore({ siteCode: 'D' });
  const deck = store.records.get(paths().deck)!;
  const order = deck.order as string[];
  const topCardId = order[32];
  if (!topCardId) throw new Error('The canonical mission deck must contain a final undealt card.');
  const recycledCardId = EXTRA_CARD;
  store.records.set(paths().deck, { ...deck, dealtCount: 33, resolvedDiscardCardIds: [] });
  store.records.set(paths().mission, {
    ...store.records.get(paths().mission)!,
    cardIds: [topCardId, recycledCardId],
    recycledCardIds: [recycledCardId],
    dealtFrom: 32,
    dealtThrough: 33,
  });
  const allCards = missionDeck();
  const aliceCard = allCards.find(({ id }) => id === topCardId)!;
  const bobCard = allCards.find(({ id }) => id === recycledCardId)!;
  store.records.set(paths().aliceHand, {
    ...store.records.get(paths().aliceHand)!,
    cardId: aliceCard.id, rank: aliceCard.rank, suit: aliceCard.suit, value: aliceCard.value,
  });
  store.records.set(paths().bobHand, {
    ...store.records.get(paths().bobHand)!,
    cardId: bobCard.id, rank: bobCard.rank, suit: bobCard.suit, value: bobCard.value,
  });
  const start = store.records.get(paths().start)!;
  store.records.set(paths().start, {
    ...start,
    recycledCardIds: [recycledCardId],
    stateDelta: {
      missionDeckDealtCountBefore: 32,
      missionDeckDealtCountAfter: 33,
      missionDeckRecycleCount: 1,
    },
    revisions: { missionDeck: { before: 32, after: 33 } },
  });

  const reply = await dependencies(store).commitAwayMissionLifecycleCommand(commandRequest('bob', {
    type: 'requestExtraCards', requestId: 'request-after-recycled-start', expectedRevision: 0, count: 1,
  }));

  expect(reply).toMatchObject({
    status: 'committed',
    privateState: { participantUid: 'bob', cards: [{ id: recycledCardId, status: 'remaining' }] },
  });
  expect(JSON.stringify(reply)).not.toContain(topCardId);
  expect(store.records.get(paths().mission)?.lifecycleRecord).toMatchObject({
    lifecycle: {
      cards: [
        { participantUid: 'alice', cardId: topCardId, source: 'initial' },
        { participantUid: 'bob', cardId: recycledCardId, source: 'initial' },
      ],
    },
  });
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
  // The initial lifecycle write now also holds craft on the shared session ledger.
  expect(store.committedWrites).toHaveLength(8);
});

it('rejects nonparticipants, nonleaders, and requests without a live GM instance before writing', async () => {
  const store = seededStore();
  store.records.set(`sessions/${SESSION_ID}/players/eve`, { role: 'player', connected: true });
  const { commitAwayMissionLifecycleCommand } = dependencies(store);

  await expect(commitAwayMissionLifecycleCommand({
    auth: null,
    data: { sessionId: SESSION_ID, missionId: MISSION_ID, type: 'requestExtraCards', requestId: 'unauth', expectedRevision: 0, count: 1 },
  })).rejects.toMatchObject({ code: 'unauthenticated' });
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

it('rejects request identifiers already reserved by a different callable action', async () => {
  const store = seededStore();
  const requestId = 'belongs-to-other-action';
  store.records.set(`sessions/${SESSION_ID}/commandReceipts/${requestId}`, {
    fingerprint: {
      action: 'start-away-mission', sessionId: SESSION_ID, requestId, actorUid: 'bob',
      instanceId: 'gm-instance', expectedRevision: 0, payload: { missionId: MISSION_ID },
    },
    result: { status: 'committed' },
  });
  const { commitAwayMissionLifecycleCommand } = dependencies(store);

  await expect(commitAwayMissionLifecycleCommand(commandRequest('bob', {
    type: 'requestExtraCards', requestId, expectedRevision: 0, count: 1,
  }))).rejects.toMatchObject({ code: 'failed-precondition' });
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
  expect(store.records.get(paths().session)?.missionCraftCommitments).toMatchObject({ starlight: { missionId: MISSION_ID } });

  await send('gm', 'openDiscards');
  const aliceDiscard = await send('alice', 'discardCard', { cardId: ALICE_CARD });
  expect(aliceDiscard.privateState?.cards).toMatchObject([{ id: ALICE_CARD, status: 'discarded' }]);
  const bobDiscard = await send('bob', 'discardCard', { cardId: EXTRA_CARD });
  expect(bobDiscard.privateState?.cards).toEqual([
    expect.objectContaining({ id: BOB_CARD, status: 'remaining' }),
    expect.objectContaining({ id: EXTRA_CARD, status: 'discarded' }),
  ]);
  await send('alice', 'assignCards', { placements: [] });
  store.retryCallbacks = 1;
  store.loseNextAcknowledgement = true;
  const finalAssignment = commandRequest('bob', {
    type: 'assignCards', requestId: 'final-assignment-k', expectedRevision: currentRevision(store),
    placements: [{ cardId: BOB_CARD, opportunityId: 'K-1' }],
  });
  const beforeResolution = store.committedWrites.length;
  await expect(commit(finalAssignment)).rejects.toThrow('simulated lost acknowledgement');
  const writesAfterResolve = store.committedWrites.length;
  expect(store.records.get(paths().mission)?.lifecycleRecord).toMatchObject({ status: 'resolved' });
  // K's original secret roll remains authoritative in the protected outcome.
  expect(store.records.get(paths().mission)?.lifecycleRecord.outcomes).toEqual([
    expect.objectContaining({ opportunityId: 'K-1', difficulty: 30, criticalThreshold: 40,
      outcome: 'failure', contributorCount: 1, rewardBranch: 'none' }),
  ]);
  expect(store.records.get(paths().mission)?.lifecycleRecord.rewards).toEqual([
    expect.objectContaining({ opportunityId: 'K-1', branch: 'none', resources: {}, effects: [] }),
  ]);
  expect(store.records.get(paths().deck)?.dealtCount).toBe(4);
  expect(store.records.get(paths().session)?.missionCraftCommitments).toMatchObject({
    starlight: { missionId: MISSION_ID, sourceCycle: 3 },
  });
  expect(callables.randomCalls).toBe(1);
  expect(callables.d6Calls).toBe(1);
  expect(store.committedWrites.slice(beforeResolution).map(({ path }) => path)).toEqual(expect.arrayContaining([
    paths().mission, paths().deck, paths().aliceHand, paths().bobHand,
    paths().alicePointer, paths().bobPointer,
  ]));
  for (let retry = 0; retry < 3; retry += 1) {
    const reply = await commit(finalAssignment);
    expect(reply).toMatchObject({ status: 'replayed', publicState: {
      status: 'resolved', outcomes: [expect.objectContaining({ opportunityId: 'K-1', difficulty: null, criticalThreshold: null })],
    } });
    expect(JSON.stringify(reply.publicState)).not.toMatch(/A♥|4♥|10♦|cardId|cardTotal|bonusBreakdown|secretD6Rolls/);
  }
  expect(callables.randomCalls).toBe(1);
  expect(callables.d6Calls).toBe(1);
  expect(store.committedWrites).toHaveLength(writesAfterResolve);
  expect(store.records.get(paths().session)?.missionCraftCommitments).toMatchObject({
    starlight: { missionId: MISSION_ID, sourceCycle: 3 },
  });
  const writesBeforeWrongLeaderDropoff = store.committedWrites.length;
  await expect(commit(commandRequest('bob', {
    type: 'dropOff', requestId: 'bob-dropoff', expectedRevision: currentRevision(store), shipId: 'aegis',
  }))).rejects.toMatchObject({ code: 'permission-denied' });
  expect(store.committedWrites).toHaveLength(writesBeforeWrongLeaderDropoff);
  await expect(send('alice', 'dropOff', { shipId: 'aegis' })).resolves.toMatchObject({
    status: 'committed', publicState: { status: 'complete', custody: { shipId: 'aegis' } },
  });
  expect(store.records.get(paths().session)?.missionCraftCommitments).toEqual({});
});

it('adds hidden discards to the shared recycle pool only at the resolved mission transition', async () => {
  const store = seededStore();
  const commit = dependencies(store).commitAwayMissionLifecycleCommand;
  const send = (uid: string, type: string, fields: Fields = {}) => commit(commandRequest(uid, {
    type, requestId: `${type}-${currentRevision(store)}`, expectedRevision: currentRevision(store), ...fields,
    ...(['openDiscards'].includes(type) ? { instanceId: 'gm-instance' } : {}),
  }));

  await send('bob', 'requestExtraCards', { count: 1 });
  await send('alice', 'distributeExtraCard', { participantUid: 'bob', opportunityId: 'K-1' });
  await send('gm', 'openDiscards');
  await send('alice', 'discardCard', { cardId: ALICE_CARD });
  await send('bob', 'discardCard', { cardId: EXTRA_CARD });
  await send('alice', 'assignCards', { placements: [] });
  const finalAssignment = commandRequest('bob', {
    type: 'assignCards', requestId: 'resolve-with-discards', expectedRevision: currentRevision(store),
    placements: [{ cardId: BOB_CARD, opportunityId: 'K-1' }],
  });
  const resolved = await commit(finalAssignment);

  expect(resolved.publicState.status).toBe('resolved');
  expect(store.records.get(paths().mission)?.discardedCardIds).toEqual([ALICE_CARD, EXTRA_CARD]);
  expect(store.records.get(paths().deck)).toMatchObject({
    dealtCount: 4,
    resolvedDiscardCardIds: [ALICE_CARD, EXTRA_CARD],
  });
  const writesAfterResolve = store.committedWrites.length;
  await expect(commit(finalAssignment)).resolves.toMatchObject({ status: 'replayed', publicState: { status: 'resolved' } });
  expect(store.records.get(paths().deck)?.resolvedDiscardCardIds).toEqual([ALICE_CARD, EXTRA_CARD]);
  expect(store.committedWrites).toHaveLength(writesAfterResolve);
});

it('uses remaining top cards before resolved discards, consumes recycled cards once, and replays without consuming again', async () => {
  const store = seededStore({ siteCode: 'D' });
  const deck = store.records.get(paths().deck)!;
  const topCard = (deck.order as string[])[32];
  store.records.set(paths().deck, { ...deck, dealtCount: 32, resolvedDiscardCardIds: ['J♥'] });
  const commit = dependencies(store).commitAwayMissionLifecycleCommand;
  const request = commandRequest('bob', {
    type: 'requestExtraCards', requestId: 'two-extras', expectedRevision: 0, count: 2,
  });
  await commit(request);

  await commit(commandRequest('alice', {
    type: 'distributeExtraCard', requestId: 'extra-from-top', expectedRevision: 1,
    participantUid: 'bob', opportunityId: 'D-1',
  }));
  expect(store.records.get(paths().deck)).toMatchObject({ dealtCount: 33, resolvedDiscardCardIds: ['J♥'] });

  const recycledRequest = commandRequest('alice', {
    type: 'distributeExtraCard', requestId: 'extra-from-recycle-pool', expectedRevision: 2,
    participantUid: 'bob', opportunityId: 'D-2',
  });
  await commit(recycledRequest);
  expect(store.records.get(paths().deck)).toMatchObject({ dealtCount: 33, resolvedDiscardCardIds: [] });
  expect(store.records.get(paths().bobHand)?.lifecyclePrivateState).toMatchObject({
    cards: [
      { id: BOB_CARD, status: 'remaining' },
      { id: topCard, status: 'remaining' },
      { id: 'J♥', status: 'remaining' },
    ],
  });

  const writesAfterRecycle = store.committedWrites.length;
  await expect(commit(recycledRequest)).resolves.toMatchObject({ status: 'replayed' });
  await expect(commit(commandRequest('alice', {
    type: 'distributeExtraCard', requestId: 'extra-from-recycle-pool', expectedRevision: 3,
    participantUid: 'bob', opportunityId: 'D-3',
  }))).rejects.toMatchObject({ code: 'failed-precondition' });
  expect(store.records.get(paths().deck)?.resolvedDiscardCardIds).toEqual([]);
  expect(store.committedWrites).toHaveLength(writesAfterRecycle);
});

it('uses a resolved discard for the required facilitator card after top stock is exhausted', async () => {
  const store = seededStore({ siteCode: 'D' });
  const commit = dependencies(store).commitAwayMissionLifecycleCommand;
  const send = (uid: string, type: string, fields: Fields = {}) => commit(commandRequest(uid, {
    type, requestId: `${type}-${currentRevision(store)}`, expectedRevision: currentRevision(store), ...fields,
    ...(['openDiscards'].includes(type) ? { instanceId: 'gm-instance' } : {}),
  }));

  await send('bob', 'requestExtraCards', { count: 1 });
  await send('alice', 'distributeExtraCard', { participantUid: 'bob', opportunityId: 'D-2' });
  store.records.set(paths().deck, {
    ...store.records.get(paths().deck)!, dealtCount: 33, resolvedDiscardCardIds: ['J♦'],
  });
  await send('gm', 'openDiscards');
  await send('alice', 'discardCard', { cardId: ALICE_CARD });
  await send('bob', 'discardCard', { cardId: EXTRA_CARD });
  await send('alice', 'assignCards', { placements: [] });

  const resolved = await send('bob', 'assignCards', {
    placements: [{ cardId: BOB_CARD, opportunityId: 'D-1' }],
  });

  expect(resolved.publicState.status).toBe('resolved');
  expect(store.records.get(paths().mission)?.lifecycleRecord.lifecycle.facilitatorCards).toEqual([
    { opportunityId: 'D-1', cardId: 'J♦' },
  ]);
  expect(store.records.get(paths().deck)).toMatchObject({
    dealtCount: 33,
    resolvedDiscardCardIds: [ALICE_CARD, EXTRA_CARD],
  });
});

it('leaves an undealable extra request unallocated when the undealt deck and resolved discard pool are empty', async () => {
  const store = seededStore({ siteCode: 'D' });
  store.records.set(paths().deck, { ...store.records.get(paths().deck)!, dealtCount: 33, resolvedDiscardCardIds: [] });
  const commit = dependencies(store).commitAwayMissionLifecycleCommand;
  await commit(commandRequest('bob', {
    type: 'requestExtraCards', requestId: 'unavailable-extra-request', expectedRevision: 0, count: 1,
  }));
  const writesBeforeUndealableExtra = store.committedWrites.length;

  await expect(commit(commandRequest('alice', {
    type: 'distributeExtraCard', requestId: 'undealable-extra', expectedRevision: 1,
    participantUid: 'bob', opportunityId: 'D-1',
  }))).rejects.toMatchObject({ code: 'failed-precondition' });

  expect(store.records.get(paths().bobHand)?.lifecyclePrivateState?.cards).toEqual([
    expect.objectContaining({ id: BOB_CARD, status: 'remaining' }),
  ]);
  expect(store.records.get(paths().deck)).toMatchObject({ dealtCount: 33, resolvedDiscardCardIds: [] });
  expect(store.committedWrites).toHaveLength(writesBeforeUndealableExtra);
});

it('never recycles an unresolved mission private discard to satisfy a later facilitator draw', async () => {
  const store = seededStore({ siteCode: 'D' });
  const commit = dependencies(store).commitAwayMissionLifecycleCommand;
  const send = (uid: string, type: string, fields: Fields = {}) => commit(commandRequest(uid, {
    type, requestId: `${type}-${currentRevision(store)}`, expectedRevision: currentRevision(store), ...fields,
    ...(['openDiscards'].includes(type) ? { instanceId: 'gm-instance' } : {}),
  }));

  await send('bob', 'requestExtraCards', { count: 1 });
  await send('alice', 'distributeExtraCard', { participantUid: 'bob', opportunityId: 'D-1' });
  store.records.set(paths().deck, { ...store.records.get(paths().deck)!, dealtCount: 33, resolvedDiscardCardIds: [] });
  await send('gm', 'openDiscards');
  await send('alice', 'discardCard', { cardId: ALICE_CARD });
  await send('bob', 'discardCard', { cardId: EXTRA_CARD });
  await send('alice', 'assignCards', { placements: [] });
  const writesBeforeUndealableFacilitatorCard = store.committedWrites.length;

  await expect(send('bob', 'assignCards', {
    placements: [{ cardId: BOB_CARD, opportunityId: 'D-1' }],
  })).rejects.toMatchObject({ code: 'failed-precondition' });

  expect(store.records.get(paths().mission)?.discardedCardIds).toEqual([ALICE_CARD, EXTRA_CARD]);
  expect(store.records.get(paths().mission)?.status).toBe('active');
  expect(store.records.get(paths().deck)?.resolvedDiscardCardIds).toEqual([]);
  expect(store.committedWrites).toHaveLength(writesBeforeUndealableFacilitatorCard);
});

it('keeps Warrior Reclamator choices and each participant’s cards private from every other command reply', async () => {
  const store = seededStore({ warrior: true, siteCode: 'D' });
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
    opportunityId: 'D-1', choices: [{ cardId: BOB_CARD, resource: 'food' }],
  });
  expect(salvage.privateState).toMatchObject({
    participantUid: 'bob',
    reclamatorSalvage: { opportunityId: 'D-1', choices: [{ cardId: BOB_CARD, resource: 'food' }] },
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
    (store: FakeStore) => { store.records.get(paths().mission)!.cardIds = [ALICE_CARD, 'A♦']; },
    (store: FakeStore) => { store.records.get(paths().start)!.requestId = 'different-start'; },
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


it('commits destination rewards with custody atomically and never reapplies them after a lost acknowledgement', async () => {
  const store = seededStore({ warrior: true, siteCode: 'D' });
  let preparations = 0;
  const commit = dependencies(store, { prepareRewardDelivery: async (raw) => {
    preparations += 1;
    const context = raw as { transaction: Transaction; nextRecord: { specialRewards: unknown }; shipId: string };
    expect(context.shipId).toBe('aegis');
    expect(context.nextRecord.specialRewards).toMatchObject([{ resources: { food: 1, materials: 1 } }]);
    const destination = await context.transaction.get(store.doc(paths().session));
    const amount = destination.get('deliveredFood') as number | undefined;
    return () => context.transaction.update(store.doc(paths().session), { deliveredFood: (amount ?? 0) + 1 });
  } }).commitAwayMissionLifecycleCommand;
  const send = (uid: string, type: string, fields: Fields = {}) => commit(commandRequest(uid, {
    type, requestId: `${type}-${uid}`, expectedRevision: currentRevision(store), ...fields,
    ...(uid === 'gm' ? { instanceId: 'gm-instance' } : {}),
  }));
  await send('gm', 'openDiscards');
  await send('alice', 'discardCard', { cardId: ALICE_CARD });
  await send('bob', 'reclamatorSalvage', { opportunityId: 'D-1', choices: [{ cardId: BOB_CARD, resource: 'food' }] });
  await send('alice', 'assignCards', { placements: [] });
  // Reclamator's whole-hand discard already commits its assignment.
  const request = commandRequest('alice', {
    type: 'dropOff', requestId: 'deliver-once', expectedRevision: currentRevision(store), shipId: 'aegis',
  });
  store.retryCallbacks = 1;
  store.loseNextAcknowledgement = true;
  await expect(commit(request)).rejects.toThrow('simulated lost acknowledgement');
  expect(store.records.get(paths().session)?.deliveredFood).toBe(1);
  expect(store.records.get(paths().mission)?.status).toBe('complete');
  const writes = store.committedWrites.length;
  await expect(commit(request)).resolves.toMatchObject({ status: 'replayed' });
  expect(preparations).toBe(2);
  expect(store.records.get(paths().session)?.deliveredFood).toBe(1);
  expect(store.committedWrites).toHaveLength(writes);
});

it('binds exploration to the successful mission, current GM lease and one atomic recovery receipt', async () => {
  const store = seededStore({ siteCode: 'D' });
  let applications = 0;
  const commit = dependencies(store, { prepareExplorationApplication: async (raw) => {
    const context = raw as { transaction: Transaction; targetCoordinates: readonly string[]; opportunityId: string };
    expect(context.targetCoordinates).toEqual(['4454', '5143']);
    expect(context.opportunityId).toBe('D-3');
    return () => {
      applications += 1;
      context.transaction.update(store.doc(paths().session), { appliedKnowledge: ['alice', 'bob'] });
    };
  } }).commitAwayMissionLifecycleCommand;
  const send = (uid: string, type: string, fields: Fields = {}) => commit(commandRequest(uid, {
    type, requestId: `${type}-${currentRevision(store)}`, expectedRevision: currentRevision(store), ...fields,
    ...(uid === 'gm' ? { instanceId: 'gm-instance' } : {}),
  }));
  await send('bob', 'requestExtraCards', { count: 1 });
  await send('alice', 'requestExtraCards', { count: 1 });
  await send('alice', 'distributeExtraCard', { participantUid: 'bob', opportunityId: 'D-3' });
  await send('alice', 'distributeExtraCard', { participantUid: 'alice', opportunityId: 'D-3' });
  await send('gm', 'openDiscards');
  await send('alice', 'discardCard', { cardId: ALICE_CARD });
  await send('bob', 'discardCard', { cardId: BOB_CARD });
  await send('alice', 'assignCards', { placements: [{ cardId: 'A♦', opportunityId: 'D-3' }] });
  await send('bob', 'assignCards', { placements: [{ cardId: EXTRA_CARD, opportunityId: 'D-3' }] });
  const request = commandRequest('gm', { type: 'exploreSystems', requestId: 'exploration-once',
    instanceId: 'gm-instance', expectedRevision: currentRevision(store),
    opportunityId: 'D-3', targetCoordinates: ['4454', '5143'] });
  await expect(commit({ ...request, auth: { uid: 'alice' } })).rejects.toMatchObject({ code: 'permission-denied' });
  store.loseNextAcknowledgement = true;
  await expect(commit(request)).rejects.toThrow('simulated lost acknowledgement');
  expect(applications).toBe(1);
  const writes = store.committedWrites.length;
  const reply = await commit(request);
  expect(reply).toMatchObject({ status: 'replayed', publicState: { explorationAppliedOpportunityIds: ['D-3'] } });
  expect(JSON.stringify(reply)).not.toMatch(/4454|5143/);
  expect(applications).toBe(1);
  expect(store.committedWrites).toHaveLength(writes);
});


it.each(['aegis', 'capybara-small'])('denies a fresh mission choice involving settled participant vessel %s', async shipId => {
  const store = seededStore();
  store.records.get(paths().session)!.candidateVesselOutcomes = { [shipId]: { code: 'O', groupId: 'fleet-1', shipId,
    sourceId: 'candidate-o-3131', cycle: 3, outcome: 'reached' } };
  const { commitAwayMissionLifecycleCommand } = dependencies(store);
  await expect(commitAwayMissionLifecycleCommand(commandRequest('bob', {
    type: 'requestExtraCards', requestId: 'new-after-settlement', expectedRevision: 0, count: 1,
  }))).rejects.toMatchObject({ code: 'failed-precondition', message: expect.stringContaining('candidate disposition') });
  expect(store.committedWrites).toHaveLength(0);
});

it('recovers the original private mission choice after settlement and denies a new command', async () => {
  const store = seededStore();
  const { commitAwayMissionLifecycleCommand: commit } = dependencies(store);
  const request = commandRequest('bob', { type: 'requestExtraCards', requestId: 'before-settlement', expectedRevision: 0, count: 1 });
  await commit(request);
  store.records.get(paths().session)!.candidateVesselOutcomes = { aegis: { code: 'N', groupId: 'fleet-1', shipId: 'aegis',
    sourceId: 'candidate-n-3232', cycle: 3, outcome: 'left-behind' } };
  const writes = store.committedWrites.length;
  await expect(commit(request)).resolves.toMatchObject({ status: 'replayed' });
  await expect(commit(commandRequest('bob', { type: 'requestExtraCards', requestId: 'after-settlement',
    expectedRevision: 1, count: 1 }))).rejects.toMatchObject({ code: 'failed-precondition', message: expect.stringContaining('candidate disposition') });
  expect(store.committedWrites).toHaveLength(writes);
});
