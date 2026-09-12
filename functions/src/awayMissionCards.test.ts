import { describe, expect, it } from 'vitest';
import {
  allocateMissionCards,
  awayMissionCraftForRole,
  awayMissionHandId,
  missionDeckDealtCount,
} from './awayMissionCards';
import { missionDeck, missionDeckStateFromCards } from './missionDeck';

describe('away mission private-card allocation', () => {
  it('keeps the source-defined participant craft boundary explicit', () => {
    expect(awayMissionCraftForRole('wing-commander')).toEqual(['starlight']);
    expect(awayMissionCraftForRole('icebreaker-miner')).toEqual(['highwall']);
    expect(awayMissionCraftForRole('admiral')).toEqual([]);
  });

  it('keeps mission and participant components injective in hand paths', () => {
    expect(awayMissionHandId('m', 'a-b')).not.toBe(awayMissionHandId('m-a', 'b'));
  });

  it('reads a missing cursor as zero and rejects malformed or out-of-range cursors', () => {
    expect(missionDeckDealtCount({}, 33)).toBe(0);
    expect(missionDeckDealtCount({ dealtCount: 2 }, 33)).toBe(2);
    expect(missionDeckDealtCount({ dealtCount: 34 }, 33)).toBeNull();
    expect(missionDeckDealtCount({ dealtCount: -1 }, 33)).toBeNull();
  });

  it('allocates contiguous cards in the facilitator-selected order and fails closed on depletion', () => {
    const state = missionDeckStateFromCards(missionDeck());
    const participants = [
      { uid: 'alice', roleId: 'wing-commander', craftIds: ['starlight'] },
      { uid: 'bob', roleId: 'icebreaker-miner', craftIds: ['highwall'] },
    ] as const;
    const allocation = allocateMissionCards(state, 0, participants);
    expect(allocation?.map(({ participant, card }) => [participant.uid, card.id])).toEqual([
      ['alice', 'A♥'],
      ['bob', '4♥'],
    ]);
    expect(allocateMissionCards(state, 32, participants)).toBeNull();
  });
});
