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
