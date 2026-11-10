import { describe, expect, it, vi } from 'vitest';
import {
  createAwayMissionLifecycleProjectionSubscription,
  createAwayMissionLifecycleActions,
  parseAwayMissionLifecyclePrivateState,
  parseAwayMissionLifecyclePublicState,
  type AwayMissionLifecycleClientContext,
} from './awayMissionLifecycleService';

const publicState = {
  missionId: 'mission-1',
  groupId: 'fleet-1',
  siteCode: 'D',
  revision: 3,
  phase: 'assignment-ready',
  status: 'active',
  overrun: false,
  missionLeaderUid: 'alice',
  participantCount: 2,
  opportunities: [{ id: 'D-1', label: 'Kitchen supplies' }],
  requestCounts: [{ participantUid: 'bob', count: 1 }],
  outcomes: null,
  rewards: null,
  specialRewards: null,
  custody: { status: 'mission-leader', holderUid: 'alice', shipId: null },
  legalDropOffShipIds: ['aegis'],
};

const privateState = {
  missionId: 'mission-1',
  participantUid: 'bob',
  revision: 3,
  phase: 'assignment-ready',
  cards: [{ id: 'A♥', value: 10, status: 'remaining', opportunityId: null }],
  reclamatorSalvage: null,
};

const playerContext: AwayMissionLifecycleClientContext = {
  sessionId: 's1',
  actorUid: 'bob',
  authenticatedUid: 'bob',
  actorRole: 'player',
  missionId: 'mission-1',
  missionLeaderUid: 'alice',
  revision: 3,
  sessionIsActive: true,
  hasFreshServerAuthority: true,
};

describe('away mission lifecycle client service', () => {
  it('accepts only a boolean private assignment commitment and preserves legacy projections', () => {
    const expected = { missionId: 'mission-1', participantUid: 'bob', revision: 3 };
    expect(parseAwayMissionLifecyclePrivateState({ ...privateState, assignmentCommitted: true }, expected))
      .toMatchObject({ assignmentCommitted: true });
    expect(parseAwayMissionLifecyclePrivateState({ ...privateState, assignmentCommitted: 'true' }, expected)).toBeNull();
    expect(parseAwayMissionLifecyclePrivateState(privateState, expected)).toEqual(privateState);
  });
  it('accepts only the public mission projection and rejects any private fields mixed into it', () => {
    expect(parseAwayMissionLifecyclePublicState(publicState, 'mission-1')).toEqual(publicState);
    expect(parseAwayMissionLifecyclePublicState({
      ...publicState,
      privateHand: ['A♥'],
    }, 'mission-1')).toBeNull();
    expect(parseAwayMissionLifecyclePublicState({
      ...publicState,
      missionId: 'another-mission',
    }, 'mission-1')).toBeNull();
  });

  it('accepts a private projection only for the requesting participant and matching revision', () => {
    expect(parseAwayMissionLifecyclePrivateState(privateState, {
      missionId: 'mission-1', participantUid: 'bob', revision: 3,
    })).toEqual(privateState);
    expect(parseAwayMissionLifecyclePrivateState({
      ...privateState,
      participantUid: 'alice',
    }, { missionId: 'mission-1', participantUid: 'bob', revision: 3 })).toBeNull();
    expect(parseAwayMissionLifecyclePrivateState({
      ...privateState,
      revision: 2,
    }, { missionId: 'mission-1', participantUid: 'bob', revision: 3 })).toBeNull();
  });

  it('subscribes only to the current participant’s pointers and matching own hand documents', () => {
    const watchAuth = vi.fn((onUid: (uid: string | null) => void) => {
      onUid('bob');
      return vi.fn();
    });
    const watchOwnHand = vi.fn((_sessionId, _uid, _handId, onSnapshot) => {
      onSnapshot({ fromCache: false, hasPendingWrites: false, exists: true, data: () => ({
        type: 'away-mission-hand', sessionId: 's1', participantUid: 'bob',
        missionId: 'mission-1', handId: 'hand-bob',
        lifecyclePrivateState: privateState,
      }) });
      return vi.fn();
    });
    const watchOwnPointers = vi.fn((_sessionId, _uid, onSnapshot) => {
      onSnapshot({ fromCache: false, hasPendingWrites: false, docs: [
        { id: 'hand-bob', data: () => ({
          type: 'away-mission-hand-pointer', sessionId: 's1', participantUid: 'bob',
          missionId: 'mission-1', handId: 'hand-bob', phase: 'assignment-ready',
          revision: 3, sourceCycle: 1, discarded: false, lifecyclePublicState: publicState,
        }) },
        { id: 'hand-alice', data: () => ({
          type: 'away-mission-hand-pointer', sessionId: 's1', participantUid: 'alice',
          missionId: 'mission-1', handId: 'hand-alice', phase: 'assignment-ready',
          revision: 3, discarded: false, lifecyclePublicState: publicState,
        }) },
      ] });
      return vi.fn();
    });
    const onState = vi.fn();
    const stop = createAwayMissionLifecycleProjectionSubscription({
      sessionId: 's1',
      actorUid: 'bob',
      onState,
      reader: { watchAuth, watchOwnPointers, watchOwnHand },
    });

    expect(watchOwnPointers).toHaveBeenCalledWith('s1', 'bob', expect.any(Function), expect.any(Function));
    expect(watchOwnHand).toHaveBeenCalledOnce();
    expect(watchOwnHand).toHaveBeenCalledWith('s1', 'bob', 'hand-bob', expect.any(Function), expect.any(Function));
    expect(onState).toHaveBeenLastCalledWith({
      status: 'ready', missions: [{ publicState, privateState, sourceCycle: 1 }], projectionMissing: false,
    });
    stop();
  });

  it('binds each callable command to the current player, mission, and projected revision', async () => {
    const invoke = vi.fn().mockResolvedValue({
      status: 'committed',
      sessionId: 's1',
      missionId: 'mission-1',
      requestId: 'request-1',
      revision: 4,
      publicState: { ...publicState, revision: 4 },
      privateState: { ...privateState, revision: 4, phase: 'assignment-ready' },
    });
    const actions = createAwayMissionLifecycleActions(
      () => playerContext,
      { invoke, createRequestId: () => 'request-1' },
    );

    await actions.requestExtraCards(1);

    expect(invoke).toHaveBeenCalledWith({
      sessionId: 's1',
      missionId: 'mission-1',
      requestId: 'request-1',
      expectedRevision: 3,
      type: 'requestExtraCards',
      count: 1,
    });
  });

  it('blocks commands from cached authority or a different authenticated player', async () => {
    const invoke = vi.fn();
    const cached = createAwayMissionLifecycleActions(
      () => ({ ...playerContext, hasFreshServerAuthority: false }),
      { invoke, createRequestId: () => 'request-1' },
    );
    const wrongActor = createAwayMissionLifecycleActions(
      () => ({ ...playerContext, authenticatedUid: 'alice' }),
      { invoke, createRequestId: () => 'request-2' },
    );

    await expect(cached.requestExtraCards(1)).rejects.toThrow(/reconnect/i);
    await expect(wrongActor.requestExtraCards(1)).rejects.toThrow(/identity/i);
    expect(invoke).not.toHaveBeenCalled();
  });

  it('reuses the exact request after an ambiguous transport failure and rejects a changed retry', async () => {
    const invoke = vi.fn()
      .mockRejectedValueOnce({ code: 'functions/unavailable' })
      .mockResolvedValueOnce({
        status: 'replayed',
        sessionId: 's1',
        missionId: 'mission-1',
        requestId: 'request-stable',
        revision: 4,
        publicState: { ...publicState, revision: 4 },
        privateState: { ...privateState, revision: 4 },
      });
    const actions = createAwayMissionLifecycleActions(
      () => playerContext,
      { invoke, createRequestId: () => 'request-stable' },
    );

    await expect(actions.requestExtraCards(1)).rejects.toMatchObject({ code: 'functions/unavailable' });
    await expect(actions.requestExtraCards(2)).rejects.toThrow(/same away-mission request/i);
    await actions.requestExtraCards(1);

    expect(invoke).toHaveBeenCalledTimes(2);
    expect(invoke.mock.calls[0]?.[0]).toEqual(invoke.mock.calls[1]?.[0]);
  });

  it('replays the original revision-bound command after reconnect advances the projection', async () => {
    let context = playerContext;
    const invoke = vi.fn()
      .mockRejectedValueOnce({ code: 'functions/deadline-exceeded' })
      .mockResolvedValueOnce({
        status: 'replayed',
        sessionId: 's1',
        missionId: 'mission-1',
        requestId: 'request-before-reconnect',
        revision: 4,
        publicState: { ...publicState, revision: 4 },
        privateState: { ...privateState, revision: 4 },
      });
    const actions = createAwayMissionLifecycleActions(
      () => context,
      { invoke, createRequestId: () => 'request-before-reconnect' },
    );

    await expect(actions.requestExtraCards(1)).rejects.toMatchObject({ code: 'functions/deadline-exceeded' });
    context = { ...context, revision: 4 };
    await actions.requestExtraCards(1);

    expect(invoke).toHaveBeenCalledTimes(2);
    expect(invoke.mock.calls[0]?.[0]).toEqual(invoke.mock.calls[1]?.[0]);
    expect(invoke.mock.calls[1]?.[0]).toMatchObject({ expectedRevision: 3, requestId: 'request-before-reconnect' });
  });

  it('rejects a stale callable reply so the workspace waits for the fresh projection', async () => {
    const invoke = vi.fn().mockResolvedValue({
      status: 'stale',
      sessionId: 's1',
      missionId: 'mission-1',
      requestId: 'request-1',
      revision: 4,
      expectedRevision: 3,
      currentRevision: 4,
      publicState: { ...publicState, revision: 4 },
      privateState: { ...privateState, revision: 4 },
    });
    const actions = createAwayMissionLifecycleActions(
      () => playerContext,
      { invoke, createRequestId: () => 'request-1' },
    );

    await expect(actions.requestExtraCards(1)).rejects.toThrow(/mission state changed/i);
  });
});

it('sends an exploration choice through current GM authority and parses only its safe applied status', async () => {
  const state = { ...publicState, phase: 'resolved', status: 'resolved', revision: 4,
    explorationAppliedOpportunityIds: ['D-1'] };
  const invoke = vi.fn().mockResolvedValue({ status: 'committed', sessionId: 's1', missionId: 'mission-1',
    requestId: 'explore-request', revision: 4, publicState: state, privateState: null });
  const actions = createAwayMissionLifecycleActions(() => ({ ...playerContext,
    actorRole: 'gm', instanceId: 'gm-instance' }), { invoke, createRequestId: () => 'explore-request' });
  await actions.exploreSystems('D-1', ['4454', '5143']);
  expect(invoke).toHaveBeenCalledWith(expect.objectContaining({ type: 'exploreSystems',
    opportunityId: 'D-1', targetCoordinates: ['4454', '5143'], instanceId: 'gm-instance', expectedRevision: 3 }));
  expect(parseAwayMissionLifecyclePublicState({ ...state, explorationTargets: ['4454', '5143'] }, 'mission-1')).toBeNull();
});

it('retries the Wing Commander’s interrupted final choice exactly and accepts only the Wing’s resolved private result', async () => {
  const wingContext: AwayMissionLifecycleClientContext = {
    ...playerContext, actorUid: 'alice', authenticatedUid: 'alice',
  };
  const resolvedPublic = {
    ...publicState, siteCode: 'A', revision: 4, phase: 'resolved', status: 'resolved',
    opportunities: [{ id: 'A-1', label: 'Harvest proto-lichen' }], requestCounts: [],
    outcomes: [{ opportunityId: 'A-1', contributorCount: 1, total: 17, bonusTotal: 3, difficulty: 17,
      criticalThreshold: null, outcome: 'success' }],
    rewards: [{ opportunityId: 'A-1', branch: 'success', resources: { food: 8 }, effects: [], bulkHaulageApplied: false }],
  };
  const wingPrivate = {
    missionId: 'mission-1', participantUid: 'alice', revision: 4, phase: 'resolved', assignmentCommitted: true, canUseReclamator: false,
    cards: [{ id: '4♦', value: 4, status: 'assigned', opportunityId: 'A-1' }], reclamatorSalvage: null,
  };
  const reply = (privateResult: Record<string, unknown>) => ({
    status: 'replayed', sessionId: 's1', missionId: 'mission-1', requestId: 'wing-choice',
    revision: 4, publicState: resolvedPublic, privateState: privateResult,
  });
  const invoke = vi.fn()
    .mockRejectedValueOnce({ code: 'functions/deadline-exceeded' })
    .mockResolvedValueOnce(reply({ ...wingPrivate, participantUid: 'bob' }))
    .mockResolvedValueOnce(reply(wingPrivate));
  const actions = createAwayMissionLifecycleActions(() => wingContext, { invoke, createRequestId: () => 'wing-choice' });
  const choice = [{ cardId: '4♦', opportunityId: 'A-1' }];

  await expect(actions.assignCards(choice)).rejects.toMatchObject({ code: 'functions/deadline-exceeded' });
  await expect(actions.assignCards([])).rejects.toThrow(/same away-mission request/i);
  await expect(actions.assignCards(choice)).rejects.toThrow(/invalid private away-mission projection/i);
  await expect(actions.assignCards(choice)).resolves.toBeUndefined();

  expect(invoke).toHaveBeenCalledTimes(3);
  expect(invoke.mock.calls.map(([payload]) => payload)).toEqual(Array(3).fill({
    sessionId: 's1', missionId: 'mission-1', requestId: 'wing-choice', expectedRevision: 3,
    type: 'assignCards', placements: choice,
  }));
  expect(parseAwayMissionLifecyclePublicState(resolvedPublic, 'mission-1')).toEqual(resolvedPublic);
});

describe('secret K thresholds in the member projection parser (Q3.2 #270)', () => {
  const resolvedK = {
    ...publicState, siteCode: 'K', revision: 4, phase: 'resolved', status: 'resolved',
    opportunities: [{ id: 'K-1', label: 'Unknown outpost' }],
    outcomes: [{ opportunityId: 'K-1', contributorCount: 1, total: 20, bonusTotal: 0,
      difficulty: 30, criticalThreshold: 40, outcome: 'failure' }],
    rewards: [{ opportunityId: 'K-1', branch: 'none', resources: {}, effects: [], bulkHaulageApplied: false }],
  };

  it('drops numeric K thresholds from an older pointer or reply without altering the downloaded value', () => {
    const raw = structuredClone(resolvedK);
    expect(parseAwayMissionLifecyclePublicState(raw, 'mission-1')).toEqual({
      ...resolvedK,
      outcomes: [{ ...resolvedK.outcomes[0], difficulty: null, criticalThreshold: null }],
    });
    expect(raw).toEqual(resolvedK);
  });

  it('keeps printed thresholds for other sites and still rejects malformed K outcomes', () => {
    const ordinary = { ...resolvedK, siteCode: 'D', opportunities: publicState.opportunities,
      outcomes: [{ ...resolvedK.outcomes[0], opportunityId: 'D-1', difficulty: 14, criticalThreshold: 24 }],
      rewards: [{ ...resolvedK.rewards[0], opportunityId: 'D-1' }] };
    expect(parseAwayMissionLifecyclePublicState(ordinary, 'mission-1')).toEqual(ordinary);
    for (const altered of [
      { ...resolvedK, outcomes: [{ ...resolvedK.outcomes[0], difficulty: '30' }] },
      { ...resolvedK, outcomes: [{ ...resolvedK.outcomes[0], secretD6: 6 }] },
    ]) expect(parseAwayMissionLifecyclePublicState(altered, 'mission-1')).toBeNull();
  });
});
