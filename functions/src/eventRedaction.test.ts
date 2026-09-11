import { describe, expect, it } from 'vitest';
import { EventVisibility } from './eventEnvelope';
import { buildPrivacySafeEventRecord, memberEventFieldsFor } from './eventRedaction';

describe('buildPrivacySafeEventRecord', () => {
  it('keeps the replay-safe envelope and only the public payload allowlist', () => {
    expect(buildPrivacySafeEventRecord({
      type: 'maintenance',
      envelope: {
        sessionId: 'session-1',
        actorUid: 'uid-secret',
        actorRoleId: 'aegis-engineer',
        requestId: 'request-1',
        revision: 4,
        visibility: EventVisibility.Member,
        phase: 'active',
        turn: 2,
        serverTime: '2026-09-11T00:00:00.000Z',
        fingerprint: { payload: { foodLevel: 0 } },
      },
      payload: {
        shipId: 'aegis',
        shipName: 'AEGIS',
        action: 'reactor',
        results: { '6': 'Stable' },
        serverEntropy: 0.4,
        serverRolls: [6, 6],
        secretCard: '10♥',
      },
      createdAt: 'server-time',
    })).toEqual({
      sessionId: 'session-1',
      actorRoleId: 'aegis-engineer',
      actorUid: 'uid-secret',
      requestId: 'request-1',
      revision: 4,
      visibility: 'member',
      phase: 'active',
      turn: 2,
      serverTime: '2026-09-11T00:00:00.000Z',
      type: 'maintenance',
      createdAt: 'server-time',
      shipId: 'aegis',
      shipName: 'AEGIS',
      action: 'reactor',
      results: { '6': 'Stable' },
    });
  });

  it('fails closed for a new event type until its public fields are declared', () => {
    expect(buildPrivacySafeEventRecord({
      type: 'future-secret-event',
      payload: { publicSummary: 'safe', hiddenResult: 'secret' },
      createdAt: 'server-time',
    })).toEqual({
      type: 'future-secret-event',
      createdAt: 'server-time',
    });
    expect(memberEventFieldsFor('future-secret-event')).toEqual([]);
  });

  it('preserves stable actor attribution for existing audit payloads', () => {
    expect(buildPrivacySafeEventRecord({
      type: 'timer-pause',
      payload: { action: 'paused', turn: 2, window: 'restricted', actorName: 'GM', byUid: 'gm-1' },
      createdAt: 'server-time',
    })).toMatchObject({ byUid: 'gm-1' });
    expect(buildPrivacySafeEventRecord({
      type: 'roll',
      payload: { byUid: 'player-1', sides: 6, count: 1, rolls: [4], total: 4 },
      createdAt: 'server-time',
    })).toMatchObject({ byUid: 'player-1' });
    expect(buildPrivacySafeEventRecord({
      type: 'ship-confetti',
      payload: {
        actorUid: 'player-2', shipId: 'aegis', shipName: 'AEGIS',
        actorName: 'Alice', actorRoleName: 'Captain',
      },
      createdAt: 'server-time',
    })).toMatchObject({ actorUid: 'player-2' });
  });

  it.each([
    EventVisibility.Public,
    EventVisibility.Crew,
    EventVisibility.RolePrivate,
    EventVisibility.LoyaltyPrivate,
    EventVisibility.Facilitator,
  ])('rejects %s visibility for member-readable events', (visibility) => {
    expect(() => buildPrivacySafeEventRecord({
      type: 'maintenance',
      envelope: { visibility },
      payload: {},
      createdAt: 'server-time',
    })).toThrow('Member-readable events must use member visibility');
  });

  it('never exposes command and hidden-state fields from role or loyalty decisions', () => {
    const event = buildPrivacySafeEventRecord({
      type: 'loyalty-assignment',
      payload: {
        actorUid: 'gm-secret',
        targetUid: 'player-secret',
        kind: 'wolf-agent',
        suspicion: 10,
        partnerUid: 'friend-secret',
        fingerprint: { payload: { kind: 'wolf-agent' } },
        reply: { assignedUids: ['player-secret'] },
      },
      createdAt: 'server-time',
    });
    expect(event).toEqual({ type: 'loyalty-assignment', actorUid: 'gm-secret', createdAt: 'server-time' });
    expect(event).not.toHaveProperty('kind');
    expect(event).not.toHaveProperty('suspicion');
    expect(event).not.toHaveProperty('partnerUid');
    expect(event).not.toHaveProperty('fingerprint');
    expect(event).not.toHaveProperty('reply');
  });
});
