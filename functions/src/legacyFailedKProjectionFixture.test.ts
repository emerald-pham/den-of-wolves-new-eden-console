import { expect, it } from 'vitest';
import { projectAwayMissionPublicState } from './awayMissionLifecycleAdapter';
import { legacyFailedKProjectionFixture } from '../../tests/fixtures/legacyFailedKProjection';

it('constructs canonical failed-no-reward K legacy storage with one contributor and protected 30/40 arithmetic', () => {
  const fixture = legacyFailedKProjectionFixture();
  expect(fixture.record.status).toBe('resolved');
  expect(fixture.record.outcomes).toEqual([expect.objectContaining({ contributorCount: 1, total: 20,
    difficulty: 30, criticalThreshold: 40, outcome: 'failure', rewardBranch: 'none' })]);
  expect(fixture.record.rewards).toEqual([expect.objectContaining({ branch: 'none', resources: {}, effects: [] })]);
  expect(fixture.pointers).toHaveLength(2);
  for (const pointer of fixture.pointers) {
    expect(pointer.lifecyclePublicState.outcomes).toEqual([expect.objectContaining({
      contributorCount: 1, total: 20, difficulty: 30, criticalThreshold: 40, outcome: 'failure' })]);
    expect(projectAwayMissionPublicState(fixture.record, pointer.participantUid)!.outcomes).toEqual([
      expect.objectContaining({ contributorCount: 1, total: 20, difficulty: null, criticalThreshold: null, outcome: 'failure' }),
    ]);
  }
});
