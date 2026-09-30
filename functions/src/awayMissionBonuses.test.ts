import { describe, expect, it } from 'vitest';
import { missionBonusSourcesForShuttleParticipants } from './awayMissionBonuses';
import { createMissionLifecycleState } from './missionLifecycle';
import { missionDeck, missionDeckStateFromCards } from './missionDeck';

describe('away-mission shuttle bonus authority', () => {
  it('derives exact Starlight and Hummingbird bonuses only from their eligible participant bindings', () => {
    const cards = missionDeck();
    const lifecycle = createMissionLifecycleState({
      missionId: 'mission-1',
      siteCode: 'D',
      leaderUid: 'alice',
      participants: [
        { uid: 'alice', roleId: 'wing-commander' },
        { uid: 'bob', roleId: 'quellon-explorer' },
        { uid: 'eve', roleId: 'shepherd-scientist' },
      ],
      availableCarrierCraftIds: ['starlight', 'hummingbird', 'endeavour'],
      deckState: missionDeckStateFromCards(cards),
      dealtCount: 3,
      initialCards: [
        { participantUid: 'alice', cardId: 'A♥' },
        { participantUid: 'bob', cardId: '4♥' },
        { participantUid: 'eve', cardId: '5♥' },
      ],
    });
    expect(lifecycle).not.toBeNull();

    expect(missionBonusSourcesForShuttleParticipants(lifecycle!, [
      { participantUid: 'alice', craftIds: ['starlight'] },
      { participantUid: 'bob', craftIds: ['hummingbird'] },
      { participantUid: 'eve', craftIds: ['endeavour'] },
    ])).toEqual([
      {
        participantUid: 'alice',
        source: { kind: 'craft', id: 'starlight' },
        bonuses: { exploration: 3, salvage: 1 },
      },
      {
        participantUid: 'bob',
        source: { kind: 'craft', id: 'hummingbird' },
        bonuses: { exploration: 3, mining: 1 },
      },
    ]);
  });

  it('fails closed for a forged craft owner or a craft absent from the accepted mission group', () => {
    const lifecycle = createMissionLifecycleState({
      missionId: 'mission-1',
      siteCode: 'D',
      leaderUid: 'alice',
      participants: [
        { uid: 'alice', roleId: 'wing-commander' },
        { uid: 'bob', roleId: 'quellon-explorer' },
      ],
      availableCarrierCraftIds: ['starlight'],
      deckState: missionDeckStateFromCards(missionDeck()),
      dealtCount: 2,
      initialCards: [
        { participantUid: 'alice', cardId: 'A♥' },
        { participantUid: 'bob', cardId: '4♥' },
      ],
    });
    expect(lifecycle).not.toBeNull();

    expect(missionBonusSourcesForShuttleParticipants(lifecycle!, [
      { participantUid: 'bob', craftIds: ['starlight'] },
    ])).toEqual([]);
    expect(missionBonusSourcesForShuttleParticipants(lifecycle!, [
      { participantUid: 'bob', craftIds: ['hummingbird'] },
    ])).toEqual([]);
  });
});
