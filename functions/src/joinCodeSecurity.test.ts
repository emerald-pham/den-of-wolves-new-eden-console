import { describe, expect, it } from 'vitest';
import {
  JOIN_CODE_ATTEMPT_LIMIT,
  JOIN_CODE_ATTEMPT_WINDOW_MS,
  JOIN_CODE_POLICY,
  isJoinCode,
  joinCodeLengthForCreateRequest,
  takeJoinCodeAttempt,
} from './joinCodeSecurity';

describe('join-code security policy', () => {
  it('records the format, lifetime, enumeration, and collision policy', () => {
    expect(JOIN_CODE_POLICY).toEqual({
      legacyLengths: [4],
      currentLengths: [6],
      alphabet: 'digits',
      lifetime: 'session-until-retirement',
      lookup: 'non-enumerating',
      collision: 'transactional-joinCodes-document',
    });
  });

  it('accepts existing four-digit codes and issues a six-digit-compatible format', () => {
    expect(isJoinCode('4821')).toBe(true);
    expect(isJoinCode('482109')).toBe(true);
    expect(isJoinCode('48210')).toBe(false);
    expect(isJoinCode('4821090')).toBe(false);
  });

  it('only issues six-digit codes to clients that have declared support', () => {
    expect(joinCodeLengthForCreateRequest(undefined)).toBe(4);
    expect(joinCodeLengthForCreateRequest(1)).toBe(4);
    expect(joinCodeLengthForCreateRequest(2)).toBe(6);
  });

  it('allows a small number of attempts per authenticated identity before a timed lockout', () => {
    const startedAt = new Date('2026-09-06T20:00:00.000Z');
    let state: ReturnType<typeof takeJoinCodeAttempt>['state'];

    for (let attempt = 0; attempt < JOIN_CODE_ATTEMPT_LIMIT; attempt += 1) {
      const result = takeJoinCodeAttempt(state, startedAt);
      expect(result.allowed).toBe(true);
      state = result.state;
    }

    const blocked = takeJoinCodeAttempt(state, startedAt);
    expect(blocked).toMatchObject({
      allowed: false,
      retryAt: new Date(startedAt.getTime() + JOIN_CODE_ATTEMPT_WINDOW_MS),
    });
  });

  it('opens a fresh attempt window after the lockout expires', () => {
    const startedAt = new Date('2026-09-06T20:00:00.000Z');
    const exhausted = {
      startedAt,
      attempts: JOIN_CODE_ATTEMPT_LIMIT,
    };

    const result = takeJoinCodeAttempt(
      exhausted,
      new Date(startedAt.getTime() + JOIN_CODE_ATTEMPT_WINDOW_MS),
    );

    expect(result).toMatchObject({
      allowed: true,
      state: { attempts: 1 },
    });
  });
});
