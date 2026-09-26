import { describe, expect, it } from 'vitest';
import { buildActionAuditRecord } from './actionAudit';

describe('buildActionAuditRecord', () => {
  it('creates a queryable metadata-only record for a server-random action', () => {
    expect(buildActionAuditRecord({
      sessionId: 'session-1',
      actorUid: 'player-1',
      actorRoleId: 'icebreaker-miner',
      action: 'highwall-mining',
      phase: 'active',
      requestId: 'mine-1',
      revision: 1,
      resolutionSource: 'server-random',
      outcome: 'committed',
      createdAt: 'server-time',
    })).toEqual({
      schemaVersion: 1,
      sessionId: 'session-1',
      actorUid: 'player-1',
      actorRoleId: 'icebreaker-miner',
      action: 'highwall-mining',
      phase: 'active',
      requestId: 'mine-1',
      revision: 1,
      outcome: 'committed',
      resolutionSource: 'server-random',
      redactionPolicy: 'action-audit-metadata-only-v1',
      createdAt: 'server-time',
    });
  });

  it('creates the same record shape for a facilitator-sourced action', () => {
    const record = buildActionAuditRecord({
      sessionId: 'session-1',
      actorUid: 'gm-1',
      actorRoleId: null,
      action: 'facilitator-rule-call',
      phase: 'active',
      requestId: 'call-1',
      revision: 2,
      resolutionSource: 'facilitator',
      outcome: 'committed',
      createdAt: 'server-time',
    });

    expect(record).toMatchObject({
      actorUid: 'gm-1', action: 'facilitator-rule-call', revision: 2,
      resolutionSource: 'facilitator', redactionPolicy: 'action-audit-metadata-only-v1',
      createdAt: 'server-time',
    });
    expect(record).not.toHaveProperty('decision');
    expect(record).not.toHaveProperty('ambiguity');
    expect(record).not.toHaveProperty('result');
  });

  it('rejects incomplete or malformed authority metadata', () => {
    expect(() => buildActionAuditRecord({
      sessionId: '', actorUid: 'player-1', actorRoleId: null,
      action: 'highwall-mining', phase: 'active', requestId: 'mine-1',
      revision: 1, resolutionSource: 'server-random', outcome: 'committed',
      createdAt: 'server-time',
    })).toThrow(/sessionId/);

    expect(() => buildActionAuditRecord({
      sessionId: 'session-1', actorUid: 'player-1', actorRoleId: null,
      action: 'highwall-mining', phase: 'unknown', requestId: 'mine-1',
      revision: 1, resolutionSource: 'server-random', outcome: 'committed',
      createdAt: 'server-time',
    })).toThrow(/phase/);

    expect(() => buildActionAuditRecord({
      sessionId: 'session-1', actorUid: 'player-1', actorRoleId: null,
      action: 'highwall-mining', phase: 'active', requestId: 'mine-1',
      revision: -1, resolutionSource: 'server-random', outcome: 'committed',
      createdAt: 'server-time',
    })).toThrow(/revision/);
  });

  it('fails closed when an action has no registered source contract or the source does not match', () => {
    const common = {
      sessionId: 'session-1', actorUid: 'player-1', actorRoleId: null,
      phase: 'active', requestId: 'mine-1', revision: 1, outcome: 'committed',
      createdAt: 'server-time',
    };

    expect(() => buildActionAuditRecord({
      ...common, action: 'future-action', resolutionSource: 'server-random',
    })).toThrow(/not registered/);

    expect(() => buildActionAuditRecord({
      ...common, action: 'highwall-mining', resolutionSource: 'facilitator',
    })).toThrow(/must be server-random/);
  });
});
