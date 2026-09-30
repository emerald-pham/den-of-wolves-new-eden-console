import { describe, expect, it } from 'vitest';
import {
  applyAwayMissionLifecycleCommand,
  createAwayMissionLifecycleRecord,
  projectAwayMissionPrivateState,
  projectAwayMissionPublicState,
  missionBlocksCommittedCraftMovement,
  markAwayMissionOverrun,
} from './awayMissionLifecycleAdapter';
import { missionDeck, missionDeckStateFromCards } from './missionDeck';
import { createMissionLifecycleState } from './missionLifecycle';

function fixture() {
  const cards = missionDeck();
  const prefixIds = ['10♥', '10♦', 'A♥', 'A♦'];
  const prefix = prefixIds.map((id) => cards.find((card) => card.id === id)!);
  const prefixSet = new Set(prefixIds);
  const deckState = missionDeckStateFromCards([
    ...prefix,
    ...cards.filter(({ id }) => !prefixSet.has(id)),
  ]);
  const lifecycle = createMissionLifecycleState({
    missionId: 'mission-1',
    siteCode: 'D',
    leaderUid: 'alice',
    participants: [
      { uid: 'alice', roleId: 'wing-commander' },
      { uid: 'bob', roleId: 'capybara-small-captain' },
    ],
    availableCarrierCraftIds: ['starlight', 'highwall'],
    deckState,
    dealtCount: 2,
    initialCards: [
      { participantUid: 'alice', cardId: '10♥' },
      { participantUid: 'bob', cardId: '10♦' },
    ],
  });
  if (!lifecycle) throw new Error('Expected valid lifecycle fixture.');
  return createAwayMissionLifecycleRecord({
    sessionId: 'session-1',
    groupId: 'fleet-1',
    sourceCycle: 3,
    lifecycle,
    participantCrafts: [
      { participantUid: 'alice', craftIds: ['starlight'] },
      { participantUid: 'bob', craftIds: ['capybara-small'] },
    ],
  });
}

function warriorFixture() {
  const lifecycle = createMissionLifecycleState({
    missionId: 'mission-warrior',
    siteCode: 'D',
    leaderUid: 'alice',
    participants: [
      { uid: 'alice', roleId: 'wing-commander' },
      { uid: 'bob', roleId: 'warrior-captain' },
    ],
    availableCarrierCraftIds: ['starlight', 'highwall'],
    deckState: missionDeckStateFromCards(missionDeck()),
    dealtCount: 2,
    initialCards: [
      { participantUid: 'alice', cardId: 'A♥' },
      { participantUid: 'bob', cardId: '4♥' },
    ],
  });
  if (!lifecycle) throw new Error('Expected valid Warrior mission fixture.');
  return createAwayMissionLifecycleRecord({
    sessionId: 'session-1',
    groupId: 'fleet-1',
    sourceCycle: 3,
    lifecycle,
    participantCrafts: [
      { participantUid: 'alice', craftIds: ['starlight'] },
      { participantUid: 'bob', craftIds: ['warrior'] },
    ],
  });
}

function act(
  record: ReturnType<typeof fixture>,
  type: string,
  command: Record<string, unknown>,
  actorUid: string,
  authority: Record<string, unknown> = {},
) {
  return applyAwayMissionLifecycleCommand(record, {
    type,
    requestId: `${type}-${record.revision}-${actorUid}`,
    expectedRevision: record.revision,
    ...command,
  } as never, {
    actorUid,
    isActiveGm: false,
    teamPhase: false,
    currentCycle: 3,
    legalDropOffShipIds: ['aegis'],
    ...authority,
  } as never);
}

describe('away-mission lifecycle adapter', () => {
  it('projects only the current participant hand and withholds all unrevealed card identities from the public state', () => {
    const record = fixture();
    const publicState = projectAwayMissionPublicState(record);
    const alice = projectAwayMissionPrivateState(record, 'alice');
    const bob = projectAwayMissionPrivateState(record, 'bob');

    expect(publicState).toMatchObject({ missionId: 'mission-1', phase: 'awaiting-card-selection' });
    expect(JSON.stringify(publicState)).not.toMatch(/10♥|10♦|cardId|cardTotal|value/);
    expect(alice?.cards.map(({ id }) => id)).toEqual(['10♥']);
    expect(bob?.cards.map(({ id }) => id)).toEqual(['10♦']);
    expect(JSON.stringify(alice)).not.toContain('10♦');
    expect(JSON.stringify(bob)).not.toContain('10♥');
  });

  it('records only a participant card-request count and rejects a leader distribution by a non-leader', () => {
    const record = fixture();
    const request = act(record, 'requestExtraCards', { count: 1 }, 'bob');
    expect(request.status).toBe('committed');
    expect(request.record?.lifecycle.requestsByParticipant).toEqual([
      { participantUid: 'bob', count: 1 },
    ]);
    expect(JSON.stringify(request.record)).not.toMatch(/reason|why/);

    const unauthorized = act(request.record!, 'distributeExtraCard', {
      participantUid: 'bob', opportunityId: 'D-1',
    }, 'bob');
    expect(unauthorized.status).toBe('denied');
    expect(unauthorized.record).toBeUndefined();
  });

  it('replays the exact same command without increasing the revision and fails closed on a mismatched replay', () => {
    const record = fixture();
    const command = {
      type: 'requestExtraCards', requestId: 'request-bob-1', expectedRevision: 0, count: 1,
    } as const;
    const authority = {
      actorUid: 'bob', isActiveGm: false, teamPhase: false, currentCycle: 3,
      legalDropOffShipIds: ['aegis'],
    };
    const committed = applyAwayMissionLifecycleCommand(record, command, authority as never);
    const replayed = applyAwayMissionLifecycleCommand(committed.record!, command, authority as never);
    expect(committed.status).toBe('committed');
    expect(replayed.status).toBe('replayed');
    expect(replayed.record).toEqual(committed.record);

    const mismatched = applyAwayMissionLifecycleCommand(committed.record!, {
      ...command, count: 2,
    }, authority as never);
    expect(mismatched.status).toBe('denied');
    expect(mismatched.record).toBeUndefined();
  });

  it('fails closed when server authority is malformed or a client adds authority fields to its command', () => {
    const record = fixture();
    const command = {
      type: 'openDiscards', requestId: 'malformed-authority', expectedRevision: 0,
    } as const;
    const malformedAuthority = applyAwayMissionLifecycleCommand(record, command, {
      actorUid: 'gm', isActiveGm: 'true', teamPhase: false, currentCycle: 3,
      legalDropOffShipIds: [],
    } as never);
    expect(malformedAuthority.status).toBe('denied');

    const forgedCommand = applyAwayMissionLifecycleCommand(record, {
      ...command, requestId: 'client-authority', isActiveGm: true,
    } as never, {
      actorUid: 'gm', isActiveGm: false, teamPhase: false, currentCycle: 3,
      legalDropOffShipIds: [],
    });
    expect(forgedCommand.status).toBe('denied');
  });

  it('consumes the Warrior hand privately and keeps its per-card salvage award in leader custody', () => {
    let record = warriorFixture()!;
    const opened = act(record, 'openDiscards', {}, 'gm', { isActiveGm: true });
    expect(opened.status).toBe('committed');
    record = opened.record!;

    const salvage = act(record, 'reclamatorSalvage', {
      opportunityId: 'D-1', choices: [{ cardId: '4♥', resource: 'food' }],
    }, 'bob');
    expect(salvage.status).toBe('committed');
    record = salvage.record!;
    expect(projectAwayMissionPrivateState(record, 'bob')).toMatchObject({
      reclamatorSalvage: { opportunityId: 'D-1', choices: [{ cardId: '4♥', resource: 'food' }] },
    });
    expect(JSON.stringify(projectAwayMissionPublicState(record, 'alice'))).not.toMatch(/4♥|cardId|choices/);

    const aliceDiscard = act(record, 'discardCard', { cardId: 'A♥' }, 'alice');
    expect(aliceDiscard.status).toBe('committed');
    record = aliceDiscard.record!;
    expect(record.lifecycle.phase).toBe('assignment-ready');
    const aliceAssignment = act(record, 'assignCards', { placements: [] }, 'alice');
    expect(aliceAssignment.status).toBe('committed');
    record = aliceAssignment.record!;
    const dealt = act(record, 'addFacilitatorCards', {}, 'gm', {
      isActiveGm: true, randomIndex: () => 0,
    });
    expect(dealt.status).toBe('committed');
    record = dealt.record!;
    const resolved = act(record, 'resolve', {}, 'gm', {
      isActiveGm: true, bonusSources: [], secretD6Rolls: {},
    });
    expect(resolved.status).toBe('committed');
    expect(resolved.record?.specialRewards).toEqual([{ opportunityId: 'D-1', resources: { food: 1 } }]);
    expect(resolved.record?.custody).toMatchObject({ status: 'mission-leader', holderUid: 'alice' });
  });

  it('keeps committed participant craft movement-locked through a Team Phase overrun until resolution', () => {
    const record = fixture();
    const overrun = markAwayMissionOverrun(record, true);
    expect(overrun.overrun).toBe(true);
    expect(missionBlocksCommittedCraftMovement(overrun, 'starlight')).toBe(true);
    expect(missionBlocksCommittedCraftMovement(overrun, 'capybara-small')).toBe(true);
    expect(missionBlocksCommittedCraftMovement(overrun, 'aegis')).toBe(false);

    const resolved = { ...overrun, status: 'resolved' as const };
    expect(missionBlocksCommittedCraftMovement(resolved, 'starlight')).toBe(false);
  });

  it('runs a complete private-card playthrough and gives the leader one revision-bound legal drop-off', () => {
    let record = fixture();
    const request = act(record, 'requestExtraCards', { count: 1 }, 'bob');
    expect(request.status).toBe('committed');
    record = request.record!;
    const allocation = act(record, 'distributeExtraCard', {
      participantUid: 'bob', opportunityId: 'D-1',
    }, 'alice');
    expect(allocation.status).toBe('committed');
    record = allocation.record!;
    const opened = act(record, 'openDiscards', {}, 'gm', { isActiveGm: true });
    expect(opened.status).toBe('committed');
    record = opened.record!;
    const aliceDiscard = act(record, 'discardCard', { cardId: '10♥' }, 'alice');
    expect(aliceDiscard.status).toBe('committed');
    record = aliceDiscard.record!;
    const bobDiscard = act(record, 'discardCard', { cardId: '10♦' }, 'bob');
    expect(bobDiscard.status).toBe('committed');
    record = bobDiscard.record!;
    const aliceAssignment = act(record, 'assignCards', { placements: [] }, 'alice');
    expect(aliceAssignment.status).toBe('committed');
    record = aliceAssignment.record!;
    const bobAssignment = act(record, 'assignCards', {
      placements: [{ cardId: 'A♥', opportunityId: 'D-1' }],
    }, 'bob');
    expect(bobAssignment.status).toBe('committed');
    record = bobAssignment.record!;
    const dealt = act(record, 'addFacilitatorCards', {}, 'gm', {
      isActiveGm: true, randomIndex: () => 0,
    });
    expect(dealt.status).toBe('committed');
    record = dealt.record!;
    const resolution = act(record, 'resolve', {}, 'gm', {
      isActiveGm: true,
      bonusSources: [],
      secretD6Rolls: {},
    });
    expect(resolution.status).toBe('committed');
    record = resolution.record!;
    expect(record.status).toBe('resolved');
    expect(record.rewards?.find(({ opportunityId }) => opportunityId === 'D-1')?.resources)
      .toEqual({ food: 11, water: 9 });
    expect(JSON.stringify(projectAwayMissionPublicState(record))).not.toMatch(/cardId|10♥|10♦|A♥|A♦/);

    const wrongLeader = act(record, 'dropOff', { shipId: 'aegis' }, 'bob');
    expect(wrongLeader.status).toBe('denied');
    const invalidShip = act(record, 'dropOff', { shipId: 'icebreaker' }, 'alice');
    expect(invalidShip.status).toBe('denied');
    const dropped = act(record, 'dropOff', { shipId: 'aegis' }, 'alice');
    expect(dropped.status).toBe('committed');
    expect(dropped.record?.status).toBe('complete');
    expect(dropped.record?.custody).toMatchObject({ status: 'dropped-off', shipId: 'aegis' });
  });
});
