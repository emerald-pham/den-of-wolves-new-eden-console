import { expect, it } from 'vitest';
import { nextMissionCraftCommitments, requireMissionCraftMovementAvailable } from './missionCraftCommitment';

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
