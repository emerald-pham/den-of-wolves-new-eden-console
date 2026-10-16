import { describe, expect, it, vi } from 'vitest';
import type { Firestore, Transaction } from 'firebase-admin/firestore';
import { buildActionAuditRecord, buildProcedureAuditRecord, writeStandardActionAudit } from './actionAudit';

const input = { sessionId: 's1', actorUid: 'u1', actorRoleId: 'wing-commander', action: 'fighter-build',
  phase: 'active', requestId: 'build-1', revision: 4, outcome: 'committed',
  resolutionSource: 'server-calculated', createdAt: 'server-time' } as const;
const procedure = { sourceId: 'aegis-construction-bay',
  requiredChoices: [{ actor: 'player', kind: 'wing', value: 'fighter-wing-alpha' }],
  calculation: { fighterDelta: 1, materialsSpent: 1 },
  consequences: { fighters: 4, materialsRemaining: 2 }, audience: { operational: 'group', groupId: 'fleet-1' } } as const;

describe('standard procedure audit contract', () => {
  it('keeps metadata queryable while private calculations remain in a different record', () => {
    const metadata = buildActionAuditRecord(input);
    expect(metadata).toMatchObject({ action: 'fighter-build', resolutionSource: 'server-calculated', revision: 4 });
    expect(metadata).not.toHaveProperty('calculation');
    const details = buildProcedureAuditRecord(input, procedure);
    expect(details).toMatchObject({ sessionId: 's1', requestId: 'build-1', actorUid: 'u1', action: 'fighter-build',
      sourceId: 'aegis-construction-bay', requiredChoices: procedure.requiredChoices,
      calculation: procedure.calculation, consequences: procedure.consequences,
      audience: { operational: 'group', groupId: 'fleet-1' }, redactionPolicy: 'procedure-audit-gm-private-v1' });
    expect(JSON.stringify(metadata)).not.toContain('materialsSpent');
  });

  it('creates both records in the caller mutation transaction using bound request identity', () => {
    const create = vi.fn();
    const tx = { create } as unknown as Transaction;
    const db = { doc: (path: string) => path } as unknown as Firestore;
    writeStandardActionAudit(tx, db, input, procedure);
    expect(create).toHaveBeenCalledWith('sessions/s1/actionAudits/build-1', expect.objectContaining({ action: 'fighter-build' }));
    expect(create).toHaveBeenCalledWith('sessions/s1/procedureAudits/build-1', expect.objectContaining({ sourceId: procedure.sourceId }));
    expect(create).toHaveBeenCalledTimes(2);
  });

  it('fails before any write when private details are unbounded or the audience is incomplete', () => {
    const create = vi.fn();
    const tx = { create } as unknown as Transaction;
    const db = { doc: (path: string) => path } as unknown as Firestore;
    for (const invalid of [
      { ...procedure, sourceId: '' },
      { ...procedure, audience: { operational: 'group' } },
      { ...procedure, calculation: { excessive: 'x'.repeat(2001) } },
      { ...procedure, consequences: { nonfinite: Number.POSITIVE_INFINITY } },
      { ...procedure, requiredChoices: [{ actor: 'client', kind: 'roll', value: 6 }] },
    ]) expect(() => writeStandardActionAudit(tx, db, input, invalid)).toThrow();
    expect(create).not.toHaveBeenCalled();
  });

  it('cannot write an arbitrary action or forged resolution source', () => {
    expect(() => buildActionAuditRecord({ ...input, action: 'arbitrary-secret' })).toThrow(/not registered/);
    expect(() => buildActionAuditRecord({ ...input, resolutionSource: 'server-random' })).toThrow(/server-calculated/);
  });
});
