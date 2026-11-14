import { describe, expect, it } from 'vitest';
import { actionAuditActorRoleId, buildActionAuditDetailRecord, buildActionAuditRecord } from './actionAudit';

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

  it.each([
    'ship-store-scavenge',
    'ship-resource-adjustment',
    'ship-unrest-adjustment',
    'ship-population-adjustment',
    'ship-counter-batch',
    'fighter-wing-count',
    'repair-damage',
  ])('registers %s as facilitator sourced without accepting action payloads', (action) => {
    const record = buildActionAuditRecord({
      sessionId: 'session-1', actorUid: 'gm-1', actorRoleId: 'facilitator',
      action, phase: 'active', requestId: 'gm-change-1', revision: 9,
      outcome: 'committed', resolutionSource: 'facilitator', createdAt: 'server-time',
    });

    expect(record).toMatchObject({
      schemaVersion: 1, sessionId: 'session-1', actorUid: 'gm-1',
      actorRoleId: 'facilitator', action, phase: 'active', requestId: 'gm-change-1',
      revision: 9, outcome: 'committed', resolutionSource: 'facilitator',
      redactionPolicy: 'action-audit-metadata-only-v1',
    });
    expect(Object.keys(record).sort()).toEqual([
      'action', 'actorRoleId', 'actorUid', 'createdAt', 'outcome', 'phase',
      'redactionPolicy', 'requestId', 'resolutionSource', 'revision',
      'schemaVersion', 'sessionId',
    ].sort());
    expect(record).not.toHaveProperty('allocations');
    expect(record).not.toHaveProperty('transfers');
    expect(record).not.toHaveProperty('amount');
  });

  it('rejects random resolution for facilitator-only action families', () => {
    expect(() => buildActionAuditRecord({
      sessionId: 'session-1', actorUid: 'gm-1', actorRoleId: null,
      action: 'ship-store-scavenge', phase: 'active', requestId: 'gm-change-1',
      revision: 9, outcome: 'committed', resolutionSource: 'server-random',
      createdAt: 'server-time',
    })).toThrow(/must be facilitator/);
  });

  it('registers server-random ship damage without accepting damage payloads', () => {
    const record = buildActionAuditRecord({
      sessionId: 'session-1', actorUid: 'gm-1', actorRoleId: 'admiral',
      action: 'ship-damage', phase: 'active', requestId: 'damage-1', revision: 4,
      outcome: 'committed', resolutionSource: 'server-random', createdAt: 'server-time',
    });

    expect(record).toMatchObject({
      schemaVersion: 1, sessionId: 'session-1', actorUid: 'gm-1',
      actorRoleId: 'admiral', action: 'ship-damage', phase: 'active', requestId: 'damage-1',
      revision: 4, outcome: 'committed', resolutionSource: 'server-random',
      redactionPolicy: 'action-audit-metadata-only-v1',
    });
    expect(Object.keys(record).sort()).toEqual([
      'action', 'actorRoleId', 'actorUid', 'createdAt', 'outcome', 'phase',
      'redactionPolicy', 'requestId', 'resolutionSource', 'revision',
      'schemaVersion', 'sessionId',
    ].sort());
    expect(record).not.toHaveProperty('shipId');
    expect(record).not.toHaveProperty('card');
    expect(record).not.toHaveProperty('systemId');
  });
});

describe('buildActionAuditDetailRecord', () => {
  const binding = {
    sessionId: 'session-1', actorUid: 'holder-1', action: 'blacksmith-repair',
    requestId: 'repair-1', revision: 2,
  } as const;

  it('keeps the explicit choice and the committed calculation in a facilitator-only receipt', () => {
    expect(buildActionAuditDetailRecord(binding, {
      choice: { hostShipId: 'aegis', systemIds: ['reactor'], expectedCycle: 3 },
      result: {
        status: 'committed', requestId: 'repair-1', systemIds: ['reactor'],
        materialsRemaining: 1, repairRevision: 2,
      },
    }, 'server-time')).toEqual({
      schemaVersion: 1,
      sessionId: 'session-1',
      actorUid: 'holder-1',
      action: 'blacksmith-repair',
      requestId: 'repair-1',
      revision: 2,
      resolutionSource: 'server-rules',
      audience: 'facilitator',
      choice: { hostShipId: 'aegis', systemIds: ['reactor'], expectedCycle: 3 },
      result: {
        status: 'committed', requestId: 'repair-1', systemIds: ['reactor'],
        materialsRemaining: 1, repairRevision: 2,
      },
      redactionPolicy: 'action-audit-gm-detail-v1',
      createdAt: 'server-time',
    });
  });

  it('fails closed on values a durable receipt cannot faithfully store', () => {
    expect(() => buildActionAuditDetailRecord(binding, {
      choice: { systemIds: ['reactor'] }, result: { materialsRemaining: undefined },
    }, 'server-time')).toThrow(/result/);
    expect(() => buildActionAuditDetailRecord(binding, {
      choice: { amount: Number.NaN }, result: {},
    }, 'server-time')).toThrow(/choice/);
    expect(() => buildActionAuditDetailRecord(binding, {
      choice: ['reactor'], result: {},
    }, 'server-time')).toThrow(/choice/);
    expect(() => buildActionAuditDetailRecord(
      { ...binding, action: 'unregistered' as 'blacksmith-repair' },
      { choice: {}, result: {} }, 'server-time',
    )).toThrow(/registered/);
    expect(() => buildActionAuditDetailRecord(binding, { choice: {}, result: {} }, undefined))
      .toThrow(/createdAt/);
  });
});

describe('actionAuditActorRoleId', () => {
  const player = (fields: Record<string, unknown>) => ({ get: (field: string) => fields[field] });
  it('attributes a replacement player to the replacement role before the original assignment', () => {
    expect(actionAuditActorRoleId(player({
      replacementRoleId: 'comms-officer', assignedRoleId: 'quellon-explorer', activeConsoleRoleId: 'quellon-explorer',
    }))).toBe('comms-officer');
  });
  it('falls back to the assigned and then the active console role, and records null rather than guessing', () => {
    expect(actionAuditActorRoleId(player({ assignedRoleId: 'quellon-explorer', activeConsoleRoleId: 'admiral' })))
      .toBe('quellon-explorer');
    expect(actionAuditActorRoleId(player({ activeConsoleRoleId: 'admiral' }))).toBe('admiral');
    expect(actionAuditActorRoleId(player({ replacementRoleId: '  ', assignedRoleId: 7 }))).toBeNull();
  });
});
