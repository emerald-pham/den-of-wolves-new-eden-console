import { describe, expect, it } from 'vitest';
import { liveLoyaltySuspicionDecision } from './loyaltySuspicion';

describe('live loyalty suspicion', () => {
  it.each([
    ['wolf-agent', 0],
    ['wolf-agent', 2],
    ['wolf-agent', 7],
    ['wolf-cult', 15],
    ['wolf-cult', 17],
  ] as const)('accepts action-raised %s suspicion %s', (kind, suspicion) => {
    expect(liveLoyaltySuspicionDecision(kind, suspicion)).toEqual({
      allowed: true, kind, suspicion,
    });
  });

  it('retains printed setup domains for non-Wolf loyalties', () => {
    expect(liveLoyaltySuspicionDecision('fleet-loyalist', 5)).toMatchObject({ allowed: true });
    expect(liveLoyaltySuspicionDecision('fleet-loyalist', 7)).toEqual({ allowed: false });
    expect(liveLoyaltySuspicionDecision('android', null)).toMatchObject({ allowed: true });
    expect(liveLoyaltySuspicionDecision('android', 0)).toEqual({ allowed: false });
  });

  it.each([-1, 2.5, Number.NaN, Number.MAX_SAFE_INTEGER + 1, null, '2'])(
    'rejects malformed Wolf suspicion %s', (suspicion) => {
      expect(liveLoyaltySuspicionDecision('wolf-agent', suspicion)).toEqual({ allowed: false });
    },
  );
});
