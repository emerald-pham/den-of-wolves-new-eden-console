import {
  CANDIDATE_PLAN_CHECKPOINT_CYCLE,
  parseCandidatePlanCheckpoint,
  recordCandidatePlanCheckpoint,
} from './candidatePlanCheckpoint';

const checkedAt = '2026-09-22T15:00:00.000Z';

describe('Cycle 6 candidate plan checkpoint', () => {
  it('records only whether a plan exists, with the fixed Cycle 6 checkpoint', () => {
    expect(recordCandidatePlanCheckpoint(true, checkedAt)).toEqual({
      cycle: CANDIDATE_PLAN_CHECKPOINT_CYCLE,
      planExists: true,
      checkedAt,
    });
    expect(recordCandidatePlanCheckpoint(false, checkedAt)).toEqual({
      cycle: 6,
      planExists: false,
      checkedAt,
    });
  });

  it('rejects non-boolean answers and non-canonical timestamps', () => {
    expect(recordCandidatePlanCheckpoint('yes' as unknown as boolean, checkedAt)).toBeUndefined();
    expect(recordCandidatePlanCheckpoint(true, '2026-09-22T11:00:00-04:00')).toBeUndefined();
    expect(recordCandidatePlanCheckpoint(true, 'not-a-time')).toBeUndefined();
  });

  it('accepts only the exact safe checkpoint shape', () => {
    expect(parseCandidatePlanCheckpoint({
      cycle: 6,
      planExists: false,
      checkedAt,
    })).toEqual({ cycle: 6, planExists: false, checkedAt });
    expect(parseCandidatePlanCheckpoint({
      cycle: 5,
      planExists: true,
      checkedAt,
    })).toBeUndefined();
    expect(parseCandidatePlanCheckpoint({
      cycle: 6,
      planExists: true,
      checkedAt: '2026-09-22T11:00:00-04:00',
    })).toBeUndefined();
    expect(parseCandidatePlanCheckpoint({
      cycle: 6,
      planExists: true,
      checkedAt,
      hiddenGuidance: 'Approach candidate N by saying this phrase.',
    })).toBeUndefined();
  });
});
