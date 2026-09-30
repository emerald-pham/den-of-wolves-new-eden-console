import { describe, expect, it } from 'vitest';
import { createAwayMissionLifecycleBootstrap } from './awayMissionLifecycleAdapter';
import { missionDeck, missionDeckStateFromCards } from './missionDeck';

function bootstrap() {
  const cards = missionDeck();
  const prefixIds = ['10♥', '10♦'];
  const prefix = prefixIds.map((id) => cards.find((card) => card.id === id)!);
  const prefixSet = new Set(prefixIds);
  const deckState = missionDeckStateFromCards([
    ...prefix,
    ...cards.filter(({ id }) => !prefixSet.has(id)),
  ]);
  return createAwayMissionLifecycleBootstrap({
    sessionId: 'session-1',
    groupId: 'fleet-1',
    sourceCycle: 3,
    revision: 0,
    lifecycle: {
      missionId: 'mission-start-1',
      siteCode: 'D',
      leaderUid: 'alice',
      participants: [
        { uid: 'alice', roleId: 'wing-commander' },
        { uid: 'bob', roleId: 'icebreaker-miner' },
      ],
      availableCarrierCraftIds: ['starlight', 'highwall'],
      deckState,
      dealtCount: 2,
      initialCards: [
        { participantUid: 'alice', cardId: '10♥' },
        { participantUid: 'bob', cardId: '10♦' },
      ],
    },
    participantCrafts: [
      { participantUid: 'alice', craftIds: ['starlight'] },
      { participantUid: 'bob', craftIds: ['highwall'] },
    ],
  });
}

describe('away-mission lifecycle bootstrap projections', () => {
  it('creates the revision-zero server record and participant-safe projections at deal time', () => {
    const result = bootstrap();

    expect(result).not.toBeNull();
    expect(result?.record).toMatchObject({
      sessionId: 'session-1',
      groupId: 'fleet-1',
      sourceCycle: 3,
      revision: 0,
      status: 'active',
      overrun: false,
      lifecycle: {
        missionId: 'mission-start-1',
        phase: 'awaiting-card-selection',
      },
    });
    expect(result?.participantStates.map(({ participantUid }) => participantUid)).toEqual(['alice', 'bob']);
    expect(result?.participantStates.map(({ privateState }) => privateState.cards.map(({ id }) => id))).toEqual([
      ['10♥'],
      ['10♦'],
    ]);
    expect(result?.participantStates.map(({ publicState }) => publicState)).toHaveLength(2);
    expect(JSON.stringify(result?.participantStates.map(({ publicState }) => publicState)))
      .not.toMatch(/10♥|10♦|cardId|value/);
  });

  it('rejects an incomplete participant craft snapshot instead of creating partial reconnect authority', () => {
    const result = bootstrap();
    if (!result) throw new Error('Expected valid bootstrap fixture.');

    const incomplete = createAwayMissionLifecycleBootstrap({
      sessionId: result.record.sessionId,
      groupId: result.record.groupId,
      sourceCycle: result.record.sourceCycle,
      lifecycle: {
        missionId: result.record.lifecycle.missionId,
        siteCode: result.record.lifecycle.siteCode,
        leaderUid: result.record.lifecycle.leaderUid,
        participants: result.record.lifecycle.participants,
        availableCarrierCraftIds: result.record.lifecycle.availableCarrierCraftIds,
        deckState: result.record.lifecycle.deckState,
        dealtCount: result.record.lifecycle.dealtCount,
        initialCards: result.record.lifecycle.cards.map(({ participantUid, cardId }) => ({ participantUid, cardId })),
        phase: 'awaiting-card-selection',
      },
      participantCrafts: [{ participantUid: 'alice', craftIds: ['starlight'] }],
    });

    expect(incomplete).toBeNull();
  });
});
