import { describe, expect, it } from 'vitest';
import { requireAttackAwareEmergencyTimerPauseRequest } from './wolfAttackTimerRequest';

const ordinary = { sessionId: 'session-1', instanceId: 'gm-1', expectedTurn: 2, paused: true };
const intervention = {
  ...ordinary,
  requestId: 'clock-pause-1',
  expectedAttackRevision: 4,
  reason: 'Pause to restore the disconnected console.',
  dangerConfirmed: true,
};

describe('attack-aware emergency clock requests', () => {
  it('preserves ordinary pause and resume envelopes without fabricating attack authority', () => {
    expect(requireAttackAwareEmergencyTimerPauseRequest(ordinary)).toEqual(ordinary);
    expect(requireAttackAwareEmergencyTimerPauseRequest({ ...ordinary, paused: false }))
      .toEqual({ ...ordinary, paused: false });
  });

  it('retains all validated authority fields for reasoned pause and resume', () => {
    expect(requireAttackAwareEmergencyTimerPauseRequest(intervention)).toEqual(intervention);
    expect(requireAttackAwareEmergencyTimerPauseRequest({ ...intervention, paused: false }))
      .toEqual({ ...intervention, paused: false });
  });

  it.each(['requestId', 'expectedAttackRevision', 'reason', 'dangerConfirmed'] as const)(
    'requires the whole attack intervention when only %s is present', (field) => {
      expect(() => requireAttackAwareEmergencyTimerPauseRequest({
        ...ordinary, [field]: intervention[field],
      })).toThrow(expect.objectContaining({ code: 'invalid-argument' }));
      const incomplete = { ...intervention, [field]: undefined };
      expect(() => requireAttackAwareEmergencyTimerPauseRequest(incomplete))
        .toThrow(expect.objectContaining({ code: 'invalid-argument' }));
    },
  );

  it.each(['', 'bad/request', 'bad request', 'x'.repeat(129), null, 1])(
    'rejects a malformed stable request identity: %s', (requestId) => {
      expect(() => requireAttackAwareEmergencyTimerPauseRequest({ ...intervention, requestId }))
        .toThrow(expect.objectContaining({ code: 'invalid-argument' }));
    },
  );

  it.each([0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1, '4', null])(
    'rejects a non-positive or unsafe attack revision: %s', (expectedAttackRevision) => {
      expect(() => requireAttackAwareEmergencyTimerPauseRequest({ ...intervention, expectedAttackRevision }))
        .toThrow(expect.objectContaining({ code: 'invalid-argument' }));
    },
  );

  it.each(['short', ' leading reason', 'trailing reason ', 'x'.repeat(401), null, ['a reason']])(
    'rejects an unbounded or noncanonical reason: %s', (reason) => {
      expect(() => requireAttackAwareEmergencyTimerPauseRequest({ ...intervention, reason }))
        .toThrow(expect.objectContaining({ code: 'invalid-argument' }));
    },
  );

  it('accepts the exact reason boundaries and retains canonical retry identity behavior', () => {
    for (const reason of ['x'.repeat(8), 'x'.repeat(400)]) {
      expect(requireAttackAwareEmergencyTimerPauseRequest({ ...intervention, reason }).reason).toBe(reason);
    }
    expect(requireAttackAwareEmergencyTimerPauseRequest({
      ...intervention, requestId: ' clock-pause-1 ',
    }).requestId).toBe('clock-pause-1');
  });

  it.each([false, 'true', 1, null])('requires explicit danger confirmation: %s', (dangerConfirmed) => {
    expect(() => requireAttackAwareEmergencyTimerPauseRequest({ ...intervention, dangerConfirmed }))
      .toThrow(expect.objectContaining({ code: 'invalid-argument' }));
  });

  it('retains shared clock and GM-instance validation', () => {
    for (const changed of [
      { expectedTurn: 0 }, { expectedTurn: 1.5 }, { paused: 'true' },
      { sessionId: 'foreign/path' }, { instanceId: '' },
    ]) {
      expect(() => requireAttackAwareEmergencyTimerPauseRequest({ ...intervention, ...changed }))
        .toThrow(expect.objectContaining({ code: 'invalid-argument' }));
    }
  });
});
