import { describe, expect, it, vi } from 'vitest';
import {
  createAwayMissionLifecycleProjectionSubscription,
  createAwayMissionLifecycleActions,
  parseAwayMissionLifecyclePrivateState,
  parseAwayMissionLifecyclePublicState,
  type AwayMissionLifecycleClientContext,
  type AwayMissionLifecycleFeedState,
  type AwayMissionLifecycleProjectionReader,
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
  it('retains recipient-private pending reward options in the existing projection reader', () => {
    const options = [{ opportunityId: 'C-2', researchSelections: 1, researchTracks: [{ trackId: 'reactor', name: 'Reactor' }],
      consoleActions: [], consoleTargets: [] }];
    const projection = { ...privateState, rewardOptions: options, rewardChoices: [] };
    expect(parseAwayMissionLifecyclePrivateState(projection, { missionId: 'mission-1', participantUid: 'bob', revision: 3 }))
      .toMatchObject({ rewardOptions: options, rewardChoices: [] });
    expect(parseAwayMissionLifecyclePublicState({ ...publicState, rewardOptions: options }, 'mission-1')).toBeNull();
    expect(parseAwayMissionLifecyclePrivateState({ ...projection, rewardOptions: [{ ...options[0], researchSelections: 0 }] },
      { missionId: 'mission-1', participantUid: 'bob', revision: 3 })).toBeNull();
  });
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

describe('K participant secrecy through legacy projection consumers', () => {
  const activeK = { ...publicState, siteCode: 'K', opportunities: [{ id: 'K-1', label: 'Unknown outpost' }] };
  const resolvedK = {
    ...activeK, revision: 4, phase: 'resolved', status: 'resolved',
    outcomes: [{ opportunityId: 'K-1', contributorCount: 1, total: 20, bonusTotal: 0,
      difficulty: 30, criticalThreshold: 40, outcome: 'failure' }],
    rewards: [{ opportunityId: 'K-1', branch: 'none', resources: {}, effects: [], bulkHaulageApplied: false }],
  };

  it('redacts legacy numeric K thresholds after the actual public parser validates the full projection', () => {
    const raw = structuredClone(resolvedK);
    const parsed = parseAwayMissionLifecyclePublicState(raw, 'mission-1');
    expect(parsed).toMatchObject({ siteCode: 'K', outcomes: [{ contributorCount: 1, total: 20, bonusTotal: 0,
      difficulty: null, criticalThreshold: null, outcome: 'failure' }], rewards: resolvedK.rewards });
    expect(raw).toEqual(resolvedK); // Parsing cannot erase a previously downloaded document.
  });

  it('keeps non-K arithmetic and malformed-K rejection intact in the same parser', () => {
    const ordinary = { ...resolvedK, siteCode: 'D', opportunities: publicState.opportunities,
      outcomes: [{ ...resolvedK.outcomes[0], opportunityId: 'D-1', difficulty: 8.5, criticalThreshold: 25 }],
      rewards: [{ ...resolvedK.rewards[0], opportunityId: 'D-1' }] };
    expect(parseAwayMissionLifecyclePublicState(ordinary, 'mission-1')).toEqual(ordinary);
    for (const altered of [
      { ...resolvedK, outcomes: [{ ...resolvedK.outcomes[0], difficulty: '30' }] },
      { ...resolvedK, outcomes: [{ ...resolvedK.outcomes[0], criticalThreshold: 40.5 }] },
      { ...resolvedK, outcomes: [{ ...resolvedK.outcomes[0], secretD6: 6 }] },
      { ...resolvedK, missionId: 'foreign-mission' },
    ]) expect(parseAwayMissionLifecyclePublicState(altered, 'mission-1')).toBeNull();
  });

  it('redacts K on the actual own-pointer active-to-resolved transition and server reconnect', () => {
    let authListener: ((uid: string | null) => void) | undefined;
    let pointerListener: Parameters<AwayMissionLifecycleProjectionReader['watchOwnPointers']>[2] | undefined;
    let handListener: Parameters<AwayMissionLifecycleProjectionReader['watchOwnHand']>[3] | undefined;
    const onState = vi.fn<(state: AwayMissionLifecycleFeedState) => void>();
    const reader: AwayMissionLifecycleProjectionReader = {
      watchAuth: onUid => { authListener = onUid; onUid('bob'); return vi.fn(); },
      watchOwnPointers: (_sessionId, _uid, onSnapshot) => { pointerListener = onSnapshot; return vi.fn(); },
      watchOwnHand: (_sessionId, _uid, _handId, onSnapshot) => { handListener = onSnapshot; return vi.fn(); },
    };
    const stop = createAwayMissionLifecycleProjectionSubscription({ sessionId: 's1', actorUid: 'bob', onState, reader });
    const emitPointer = (state: typeof activeK | typeof resolvedK, fromCache = false) => pointerListener!({
      fromCache, hasPendingWrites: false, docs: [{ id: 'hand-bob', data: () => ({
        type: 'away-mission-hand-pointer', sessionId: 's1', participantUid: 'bob', missionId: 'mission-1',
        handId: 'hand-bob', phase: state.phase, revision: state.revision, sourceCycle: 1, discarded: state.status === 'resolved',
        lifecyclePublicState: state,
      }) }],
    });
    const emitHand = (revision: number, phase: string) => handListener!({
      fromCache: false, hasPendingWrites: false, exists: true, data: () => ({
        type: 'away-mission-hand', sessionId: 's1', participantUid: 'bob', missionId: 'mission-1', handId: 'hand-bob',
        lifecyclePrivateState: { ...privateState, revision, phase },
      }),
    });
    emitPointer(activeK); emitHand(3, 'assignment-ready');
    expect(onState).toHaveBeenLastCalledWith(expect.objectContaining({ status: 'ready' }));
    emitPointer(resolvedK); emitHand(4, 'resolved');
    expect(onState).toHaveBeenLastCalledWith(expect.objectContaining({ status: 'ready' }));
    emitPointer(resolvedK, true);
    expect(onState).toHaveBeenLastCalledWith({ status: 'stale', missions: [], projectionMissing: false });
    const releasedListener = pointerListener!;
    authListener!(null);
    expect(onState).toHaveBeenLastCalledWith({ status: 'error', missions: [], projectionMissing: false });
    authListener!('bob');
    const callsAfterReconnect = onState.mock.calls.length;
    releasedListener({ fromCache: false, hasPendingWrites: false, docs: [] });
    expect(onState).toHaveBeenCalledTimes(callsAfterReconnect);
    emitPointer(resolvedK); emitHand(4, 'resolved');
    expect(onState).toHaveBeenLastCalledWith(expect.objectContaining({ status: 'ready', projectionMissing: false }));
    const resolvedViews = onState.mock.calls.flatMap(([state]) => state.missions)
      .filter(mission => mission.publicState.status === 'resolved');
    expect(resolvedViews.length).toBeGreaterThanOrEqual(2);
    for (const { publicState: state } of resolvedViews) expect(state.outcomes).toEqual([
      expect.objectContaining({ total: 20, difficulty: null, criticalThreshold: null, outcome: 'failure' }),
    ]);
    expect(resolvedK.outcomes[0]).toMatchObject({ difficulty: 30, criticalThreshold: 40 });
    stop();
  });

  it('consumes validated legacy and redacted K action replies without publishing them, and rejects malformed replies', async () => {
    for (const state of [resolvedK, { ...resolvedK, outcomes: [{ ...resolvedK.outcomes[0], difficulty: null, criticalThreshold: null }] }]) {
      const invoke = vi.fn().mockResolvedValue({ status: 'replayed', sessionId: 's1', missionId: 'mission-1',
        requestId: 'k-final-assignment', revision: 4, publicState: state,
        privateState: { ...privateState, revision: 4, phase: 'resolved' } });
      const actions = createAwayMissionLifecycleActions(() => playerContext, { invoke, createRequestId: () => 'k-final-assignment' });
      await expect(actions.assignCards([])).resolves.toBeUndefined();
      expect(invoke).toHaveBeenCalledWith(expect.objectContaining({ type: 'assignCards', expectedRevision: 3,
        requestId: 'k-final-assignment' }));
    }
    const invoke = vi.fn().mockResolvedValue({ status: 'committed', sessionId: 's1', missionId: 'mission-1',
      requestId: 'k-invalid', revision: 4, publicState: { ...resolvedK,
        outcomes: [{ ...resolvedK.outcomes[0], difficulty: '30' }] },
      privateState: { ...privateState, revision: 4, phase: 'resolved' } });
    const actions = createAwayMissionLifecycleActions(() => playerContext, { invoke, createRequestId: () => 'k-invalid' });
    await expect(actions.assignCards([])).rejects.toThrow(/server returned an invalid/i);
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


describe('Boa half-point outcome delivery', () => {
  const resolvedBoaState = (difficulty: unknown) => ({
    ...publicState,
    revision: 4,
    phase: 'resolved',
    status: 'resolved',
    outcomes: [{
      opportunityId: 'D-1', contributorCount: 1, total: 8, bonusTotal: 0,
      difficulty, criticalThreshold: 25, outcome: 'failure',
    }],
  });

  it('accepts exact integer-or-half-point difficulties while retaining integer result fields', () => {
    const accepted = [8, 8.5, Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER / 2, null];
    for (const difficulty of accepted) {
      expect(parseAwayMissionLifecyclePublicState(
        resolvedBoaState(difficulty), 'mission-1',
      )).not.toBeNull();
    }

    const rejected = [-0.5, 8.25, Number.NaN, Number.POSITIVE_INFINITY,
      '8.5', Number.MAX_SAFE_INTEGER + 1];
    for (const difficulty of rejected) {
      expect(parseAwayMissionLifecyclePublicState(
        resolvedBoaState(difficulty), 'mission-1',
      )).toBeNull();
    }

    for (const field of ['total', 'bonusTotal', 'criticalThreshold'] as const) {
      const state = resolvedBoaState(8.5);
      const outcome = { ...state.outcomes[0], [field]: field === 'criticalThreshold' ? 25.5 : 8.5 };
      expect(parseAwayMissionLifecyclePublicState(
        { ...state, outcomes: [outcome] }, 'mission-1',
      )).toBeNull();
    }
  });

  it('accepts a committed final assignment reply carrying the Boa half-point outcome', async () => {
    const state = resolvedBoaState(8.5);
    const invoke = vi.fn().mockResolvedValue({
      status: 'committed', sessionId: 's1', missionId: 'mission-1',
      requestId: 'boa-final-assignment', revision: 4, publicState: state,
      privateState: { ...privateState, revision: 4, phase: 'resolved' },
    });
    const actions = createAwayMissionLifecycleActions(
      () => playerContext,
      { invoke, createRequestId: () => 'boa-final-assignment' },
    );

    await expect(actions.assignCards([])).resolves.toBeUndefined();
    expect(invoke).toHaveBeenCalledWith(expect.objectContaining({
      type: 'assignCards', requestId: 'boa-final-assignment', expectedRevision: 3,
    }));
  });

  it('keeps the own mission projection ready when an integer threshold becomes a Boa half-point result', () => {
    let pointerListener: Parameters<AwayMissionLifecycleProjectionReader['watchOwnPointers']>[2] | undefined;
    let handListener: Parameters<AwayMissionLifecycleProjectionReader['watchOwnHand']>[3] | undefined;
    const onState = vi.fn();
    const reader: AwayMissionLifecycleProjectionReader = {
      watchAuth: (onUid) => { onUid('bob'); return vi.fn(); },
      watchOwnPointers: (_sessionId, _uid, onSnapshot) => {
        pointerListener = onSnapshot;
        return vi.fn();
      },
      watchOwnHand: (_sessionId, _uid, _handId, onSnapshot) => {
        handListener = onSnapshot;
        return vi.fn();
      },
    };
    const stop = createAwayMissionLifecycleProjectionSubscription({
      sessionId: 's1', actorUid: 'bob', onState, reader,
    });
    const emitPointer = (state: typeof publicState | ReturnType<typeof resolvedBoaState>) => pointerListener!({
      fromCache: false,
      hasPendingWrites: false,
      docs: [{ id: 'hand-bob', data: () => ({
        type: 'away-mission-hand-pointer', sessionId: 's1', participantUid: 'bob',
        missionId: 'mission-1', handId: 'hand-bob', phase: state.phase,
        revision: state.revision, sourceCycle: 1, discarded: false,
        lifecyclePublicState: state,
      }) }],
    });
    const emitHand = (revision: number, phase: string) => handListener!({
      fromCache: false,
      hasPendingWrites: false,
      exists: true,
      data: () => ({
        type: 'away-mission-hand', sessionId: 's1', participantUid: 'bob',
        missionId: 'mission-1', handId: 'hand-bob',
        lifecyclePrivateState: { ...privateState, revision, phase },
      }),
    });

    emitPointer(publicState);
    emitHand(3, 'assignment-ready');
    emitPointer(resolvedBoaState(8.5));
    emitHand(4, 'resolved');

    expect(onState).toHaveBeenLastCalledWith({
      status: 'ready',
      missions: [{
        publicState: resolvedBoaState(8.5),
        privateState: { ...privateState, revision: 4, phase: 'resolved' },
        sourceCycle: 1,
      }],
      projectionMissing: false,
    });
    stop();
  });
});
