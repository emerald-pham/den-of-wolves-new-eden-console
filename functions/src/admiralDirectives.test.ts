import { describe, expect, it } from 'vitest';
import { admiralDirectiveState, publishAdmiralDirective } from './admiralDirectives';

const publish = (overrides: Partial<Parameters<typeof publishAdmiralDirective>[0]> = {}) =>
  publishAdmiralDirective({
    current: undefined,
    expectedRevision: 0,
    id: 'directive-1',
    kind: 'fleet-policy',
    text: '  Preserve civilian fuel reserves.  ',
    cycle: 2,
    publishedAt: '2026-09-21T12:00:00.000Z',
    ...overrides,
  });

describe('Admiral directives', () => {
  it('publishes only a bounded fleet-policy or defence-coordination entry', () => {
    expect(publish()).toEqual({
      revision: 1,
      entries: [{
        id: 'directive-1', kind: 'fleet-policy', text: 'Preserve civilian fuel reserves.',
        cycle: 2, publishedAt: '2026-09-21T12:00:00.000Z',
      }],
    });
    expect(publish({ kind: 'defence-coordination' }).entries[0]?.kind)
      .toBe('defence-coordination');
    expect(() => publish({ kind: 'orders' as never })).toThrow(/invalid/i);
    expect(() => publish({ text: ' '.repeat(2) })).toThrow(/invalid/i);
    expect(() => publish({ text: 'x'.repeat(501) })).toThrow(/invalid/i);
  });

  it('rejects stale revisions and retains only the latest twelve publications', () => {
    expect(() => publish({ current: { revision: 1, entries: [] } })).toThrow(/changed/i);
    const entries = Array.from({ length: 12 }, (_, index) => ({
      id: `old-${index}`, kind: 'fleet-policy' as const, text: `Policy ${index}`,
      cycle: 1, publishedAt: '2026-09-21T11:00:00.000Z',
    }));
    const result = publish({
      current: { revision: 12, entries }, expectedRevision: 12, id: 'new-policy',
    });
    expect(result.entries).toHaveLength(12);
    expect(result.entries[0]?.id).toBe('old-1');
    expect(result.entries.at(-1)?.id).toBe('new-policy');
  });

  it('fails closed when stored entries are malformed', () => {
    expect(admiralDirectiveState({
      revision: 2,
      entries: [
        { id: 'valid', kind: 'fleet-policy', text: 'Hold formation', cycle: 1, publishedAt: '2026-09-21T12:00:00.000Z' },
        { id: 'invalid', kind: 'gm-command', text: 'Override', cycle: 1, publishedAt: '2026-09-21T12:00:00.000Z' },
      ],
    }).entries.map(({ id }) => id)).toEqual(['valid']);
  });
});
