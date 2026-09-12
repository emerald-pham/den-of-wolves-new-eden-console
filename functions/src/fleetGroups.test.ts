import { describe, expect, it } from 'vitest';
import {
  INITIAL_FLEET_GROUP_ID,
  addFleetGroupMember,
  assertFleetGroupMatches,
  fleetGroupRecord,
  initialFleetGroup,
  withFleetGroupVessels,
} from './fleetGroups';

describe('fleet-group identity', () => {
  it('creates one stable group with the canonical vessels and unique members', () => {
    const group = initialFleetGroup(['aegis', 'icebreaker'], ['gm-1', 'player-1']);
    expect(group).toEqual({
      id: INITIAL_FLEET_GROUP_ID,
      vesselIds: ['aegis', 'icebreaker'],
      memberUids: ['gm-1', 'player-1'],
    });
    assertFleetGroupMatches(group, ['aegis', 'icebreaker'], ['gm-1', 'player-1']);
  });

  it('keeps retries idempotent and rejects malformed or duplicate membership', () => {
    const group = initialFleetGroup(['aegis'], ['gm-1']);
    expect(addFleetGroupMember(addFleetGroupMember(group, 'player-1'), 'player-1')).toEqual({
      ...group,
      memberUids: ['gm-1', 'player-1'],
    });
    expect(fleetGroupRecord({
      id: INITIAL_FLEET_GROUP_ID,
      vesselIds: ['aegis'],
      memberUids: ['gm-1', 'gm-1'],
    })).toBeUndefined();
    expect(() => initialFleetGroup(['aegis', 'aegis'], ['gm-1'])).toThrow(/unique/);
    expect(() => assertFleetGroupMatches(group, ['icebreaker'], ['gm-1'])).toThrow(/canonical/);
    expect(withFleetGroupVessels(group, ['aegis', 'dione']).vesselIds).toEqual(['aegis', 'dione']);
  });
});
