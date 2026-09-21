import { describe, expect, it } from 'vitest';
import { PRESIDENT_ACTION_KINDS, presidentWorkspaceState, recordPresidentAction } from './presidentWorkspace';

const record = (kind: (typeof PRESIDENT_ACTION_KINDS)[number] = 'fleet-policy') => recordPresidentAction({
  current: undefined,
  expectedRevision: 0,
  id: `president:${kind}`,
  kind,
  text: '  Record the bounded decision.  ',
  cycle: 2,
  recordedAt: '2026-09-21T21:00:00.000Z',
});

describe('President workspace record', () => {
  it.each(PRESIDENT_ACTION_KINDS)('records one auditable %s entry', (kind) => {
    expect(record(kind)).toEqual({
      revision: 1,
      entries: [{ id: `president:${kind}`, kind, text: 'Record the bounded decision.', cycle: 2,
        recordedAt: '2026-09-21T21:00:00.000Z' }],
    });
  });

  it('retains only the latest 24 records', () => {
    let current: unknown;
    for (let revision = 0; revision < 25; revision += 1) {
      current = recordPresidentAction({ current, expectedRevision: revision, id: `entry-${revision}`,
        kind: 'crisis', text: `Decision ${revision}`, cycle: 2,
        recordedAt: '2026-09-21T21:00:00.000Z' });
    }
    expect(presidentWorkspaceState(current).entries).toHaveLength(24);
    expect(presidentWorkspaceState(current).entries[0]?.id).toBe('entry-1');
  });

  it('fails closed for stale, malformed, extra, duplicate, or unsupported state', () => {
    expect(() => recordPresidentAction({ current: record(), expectedRevision: 0, id: 'x', kind: 'visit',
      text: 'Visit', cycle: 2, recordedAt: '2026-09-21T21:00:00.000Z' })).toThrow(/changed/i);
    expect(() => presidentWorkspaceState({ revision: 1, entries: [], extra: true })).toThrow();
    const entry = record().entries[0]!;
    expect(() => presidentWorkspaceState({ revision: 2, entries: [entry, entry] })).toThrow();
    expect(() => presidentWorkspaceState({ revision: 1, entries: [{ ...entry, kind: 'gm-command' }] })).toThrow();
    expect(() => recordPresidentAction({
      current: { revision: Number.MAX_SAFE_INTEGER, entries: [] },
      expectedRevision: Number.MAX_SAFE_INTEGER,
      id: 'overflow', kind: 'crisis', text: 'Hold', cycle: 2,
      recordedAt: '2026-09-21T21:00:00.000Z',
    })).toThrow(/cannot advance safely/i);
  });
});
