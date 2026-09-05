import { describe, expect, it } from 'vitest';
import {
  requireDiceRequest,
  requireElevationRequest,
  requireSessionRequest,
  requireSessionSeatRequest,
  requireUid,
} from './requestGuards';

function expectHttpsError(action: () => unknown, code: string): void {
  expect(action).toThrow(
    expect.objectContaining({ code }),
  );
}

describe('callable request guards', () => {
  it('requires an authenticated uid', () => {
    expectHttpsError(() => requireUid(undefined), 'unauthenticated');
    expect(requireUid({ uid: 'u1' })).toBe('u1');
  });

  it('requires both session and seat ids', () => {
    expectHttpsError(
      () => requireSessionSeatRequest({ sessionId: 's1', seatId: '' }),
      'invalid-argument',
    );
    expect(requireSessionSeatRequest({ sessionId: 's1', seatId: 'seat1' })).toEqual({
      sessionId: 's1',
      seatId: 'seat1',
    });
  });

  it('requires a session id when resuming', () => {
    expectHttpsError(() => requireSessionRequest({ sessionId: '' }), 'invalid-argument');
    expect(requireSessionRequest({ sessionId: 's1' })).toEqual({ sessionId: 's1' });
  });

  it('requires both session and target ids for elevation', () => {
    expectHttpsError(
      () => requireElevationRequest({ sessionId: 's1', targetUid: '' }),
      'invalid-argument',
    );
  });

  it('bounds dice sides and count', () => {
    expectHttpsError(
      () => requireDiceRequest({ sessionId: 's1', sides: 1, count: 1 }),
      'invalid-argument',
    );
    expectHttpsError(
      () => requireDiceRequest({ sessionId: 's1', sides: 6, count: 51 }),
      'invalid-argument',
    );
    expect(requireDiceRequest({ sessionId: 's1', sides: 6, count: 2 })).toEqual({
      sessionId: 's1',
      sides: 6,
      count: 2,
    });
  });
});
