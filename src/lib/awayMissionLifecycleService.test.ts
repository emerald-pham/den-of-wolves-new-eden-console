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
          revision: 3, discarded: false, lifecyclePublicState: publicState,
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
      status: 'ready', missions: [{ publicState, privateState }], projectionMissing: false,
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
