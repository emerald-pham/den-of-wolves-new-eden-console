import { describe, expect, it } from 'vitest';
import {
  DEMO_COMPLETE_RESULT,
  DEMO_JUMP_UNAVAILABLE_MESSAGE,
  getSinglePlayerDemoAdvanceBoundary,
  getSinglePlayerDemoJumpDenial,
} from './singlePlayerDemoPolicy';

describe('single-player demo policy', () => {
  it('returns the same explicit denial for every jump request in Demo mode', () => {
    expect(getSinglePlayerDemoJumpDenial(true)).toEqual({
      code: 'demo-jump-unavailable',
      message: DEMO_JUMP_UNAVAILABLE_MESSAGE,
    });
    expect(getSinglePlayerDemoJumpDenial(true)).toEqual(
      getSinglePlayerDemoJumpDenial(true),
    );
  });

  it('does not restrict jump requests in a normal session', () => {
    expect(getSinglePlayerDemoJumpDenial(false)).toBeNull();
  });

  it('allows the existing setup-to-Cycle-1 demo start', () => {
    expect(getSinglePlayerDemoAdvanceBoundary(true, 0)).toBeNull();
  });

  it('returns an explicit Demo result before advancing beyond Cycle 1', () => {
    expect(getSinglePlayerDemoAdvanceBoundary(true, 1)).toEqual(DEMO_COMPLETE_RESULT);
  });

  it('fails closed on an invalid demo cycle value', () => {
    expect(getSinglePlayerDemoAdvanceBoundary(true, undefined)).toEqual(DEMO_COMPLETE_RESULT);
  });

  it('preserves normal-session advancement at Cycle 1', () => {
    expect(getSinglePlayerDemoAdvanceBoundary(false, 1)).toBeNull();
  });
});
