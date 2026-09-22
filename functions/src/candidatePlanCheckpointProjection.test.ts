import {
  facilitatorCandidatePlanProjection,
  memberCandidatePlanProjection,
} from './candidatePlanCheckpointProjection';

const checkpoint = {
  cycle: 6 as const,
  planExists: true,
  checkedAt: '2026-09-22T15:00:00.000Z',
};

describe('candidate plan checkpoint audience projection', () => {
  it('publishes only the content-free status to the facilitator projection', () => {
    expect(facilitatorCandidatePlanProjection(checkpoint)).toEqual({
      candidatePlanCheckpoint: checkpoint,
    });
  });

  it('fails closed if hidden guidance or plan text is attached to the record', () => {
    expect(facilitatorCandidatePlanProjection({
      ...checkpoint,
      hiddenGuidance: 'secret facilitator advice',
      planText: 'route the fleet through candidate O',
    })).toBeUndefined();
  });

  it('keeps all candidate plan state out of member projections', () => {
    expect(memberCandidatePlanProjection()).toEqual({});
    expect(memberCandidatePlanProjection()).not.toHaveProperty('candidatePlanCheckpoint');
    expect(memberCandidatePlanProjection()).not.toHaveProperty('hiddenGuidance');
  });
});
