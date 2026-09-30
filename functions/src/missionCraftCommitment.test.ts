import { emptySmallShipState } from './smallShip';
import { expect, it } from 'vitest';
import { nextMissionCraftCommitments, requireMissionCraftMovementAvailable, missionCraftIdsCarriedByShip } from './missionCraftCommitment';

const mission = { missionId: 'mission-1', sourceCycle: 3, status: 'active' as const,
  participantCrafts: [{ participantUid: 'alice', craftIds: ['starlight'] }] };
it('holds admitted craft across Team boundaries and releases only that mission at resolution', () => {
  const held = nextMissionCraftCommitments({}, mission)!;
  expect(held).toEqual({ starlight: { missionId: 'mission-1', sourceCycle: 3 } });
  expect(() => requireMissionCraftMovementAvailable(held, ['starlight'])).toThrow(/away mission/i);
  expect(() => requireMissionCraftMovementAvailable(held, ['highwall'])).not.toThrow();
  expect(nextMissionCraftCommitments({ ...held, highwall: { missionId: 'other', sourceCycle: 2 } },
    { ...mission, status: 'resolved' })).toEqual({ highwall: { missionId: 'other', sourceCycle: 2 } });
});
it('rejects malformed authority and another active mission claiming the same craft', () => {
  expect(nextMissionCraftCommitments({ starlight: { missionId: 'other', sourceCycle: 2 } }, mission)).toBeNull();
  expect(() => requireMissionCraftMovementAvailable({ starlight: true }, ['highwall'])).toThrow(/malformed/i);
  expect(nextMissionCraftCommitments({ starlight: { missionId: 'other', sourceCycle: 0 } }, mission)).toBeNull();
});

it('includes attached small ships, ordinary shuttles and printed fighter wings in host movement holds', () => {
  const input = { shipId: 'refinery-124', activeRoleIds: ['refinery-124-pdf-colonel'],
    shuttleDockings: [{ shuttleId: 'chepu', shipId: 'refinery-124' }],
    smallShipStates: { warrior: emptySmallShipState('warrior', 'refinery-124'),
      vulcan: emptySmallShipState('vulcan', null) } };
  expect(missionCraftIdsCarriedByShip(input)).toEqual(['refinery-124', 'chepu', 'pdf-escort-fighter-wing', 'warrior']);
  expect(() => missionCraftIdsCarriedByShip({ ...input, smallShipStates: { warrior: true } })).toThrow(/malformed/i);
  expect(() => missionCraftIdsCarriedByShip({ ...input, shuttleDockings: [{ shuttleId: 'chepu' }] })).toThrow(/malformed/i);
});
