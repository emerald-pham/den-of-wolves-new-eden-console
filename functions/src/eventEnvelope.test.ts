import {
  EventVisibility,
  buildAuthoritativeEventEnvelope,
} from './eventEnvelope';

describe('buildAuthoritativeEventEnvelope', () => {
  it('builds a typed, privacy-scoped authoritative event envelope', () => {
    expect(buildAuthoritativeEventEnvelope({
      sessionId: 'session-1',
      actorUid: 'uid-1',
      actorRoleId: 'role-aegis',
      turn: 3,
      phase: 'active',
      type: 'ship.moved',
      requestId: 'request-1',
      revision: 12,
      serverTime: '2026-09-07T16:00:00.000Z',
      visibility: EventVisibility.Crew,
    })).toEqual({
      sessionId: 'session-1',
      actorUid: 'uid-1',
      actorRoleId: 'role-aegis',
      turn: 3,
      phase: 'active',
      type: 'ship.moved',
      requestId: 'request-1',
      revision: 12,
      serverTime: '2026-09-07T16:00:00.000Z',
      visibility: 'crew',
    });
  });

  it('normalizes Date server time and permits an unassigned actor role', () => {
    expect(buildAuthoritativeEventEnvelope({
      sessionId: 'session-1',
      actorUid: 'system',
      actorRoleId: null,
      turn: 0,
      phase: 'lobby',
      type: 'session.created',
      requestId: 'request-1',
      revision: 0,
      serverTime: new Date('2026-09-07T16:00:00.000Z'),
      visibility: EventVisibility.Member,
    }).serverTime).toBe('2026-09-07T16:00:00.000Z');
  });

  it.each([
    ['sessionId', { sessionId: '' }],
    ['actorUid', { actorUid: ' ' }],
    ['type', { type: '' }],
    ['requestId', { requestId: '' }],
    ['serverTime', { serverTime: 'not-a-time' }],
  ])('rejects an invalid %s', (_field, override) => {
    expect(() => buildAuthoritativeEventEnvelope({
      sessionId: 'session-1',
      actorUid: 'uid-1',
      actorRoleId: null,
      turn: 1,
      phase: 'briefing',
      type: 'briefing.started',
      requestId: 'request-1',
      revision: 1,
      serverTime: '2026-09-07T16:00:00.000Z',
      visibility: EventVisibility.Public,
      ...override,
    })).toThrow();
  });

  it('rejects negative or fractional turn and revision values', () => {
    const base = {
      sessionId: 'session-1',
      actorUid: 'uid-1',
      actorRoleId: null,
      turn: 1,
      phase: 'active' as const,
      type: 'turn.started',
      requestId: 'request-1',
      revision: 1,
      serverTime: '2026-09-07T16:00:00.000Z',
      visibility: EventVisibility.Public,
    };

    expect(() => buildAuthoritativeEventEnvelope({ ...base, turn: -1 })).toThrow();
    expect(() => buildAuthoritativeEventEnvelope({ ...base, turn: 1.5 })).toThrow();
    expect(() => buildAuthoritativeEventEnvelope({ ...base, revision: -1 })).toThrow();
    expect(() => buildAuthoritativeEventEnvelope({ ...base, revision: 1.5 })).toThrow();
  });
});
