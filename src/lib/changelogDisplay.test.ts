import { describe, expect, it, vi } from 'vitest';
import {
  loadChangelogDisplay,
  parseChangelogDisplay,
  type ChangelogDisplayEntry,
} from './changelogDisplay';

const sample: readonly ChangelogDisplayEntry[] = [
  { version: '0.5.39', changes: ['Current release copy.'] },
  { version: '0.5.38', changes: ['Historical release copy.'] },
];

describe('changelog display loader', () => {
  it('accepts only display fields and preserves historical copy and ordering', () => {
    expect(parseChangelogDisplay([
      { version: '0.5.39', changes: ['First', 'Second'], implementationProgress: { completed: 1 } },
      { version: '0.5.38', changes: ['Earlier'] },
    ])).toEqual([
      { version: '0.5.39', changes: ['First', 'Second'] },
      { version: '0.5.38', changes: ['Earlier'] },
    ]);
  });

  it.each([
    null,
    {},
    [{ version: '', changes: ['copy'] }],
    [{ version: '0.5.39', changes: [42] }],
  ])('rejects malformed display data: %j', (payload) => {
    expect(() => parseChangelogDisplay(payload)).toThrow();
  });

  it('fetches the display asset only through the supplied URL and rejects a missing asset', async () => {
    const fetcher = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => sample,
    });

    await expect(loadChangelogDisplay('/assets/changelog-display-a1b2.json', fetcher))
      .resolves.toEqual(sample);
    expect(fetcher).toHaveBeenCalledOnce();
    expect(fetcher).toHaveBeenCalledWith('/assets/changelog-display-a1b2.json');

    const missing = vi.fn().mockResolvedValue({ ok: false, status: 404 });
    await expect(loadChangelogDisplay('/assets/missing.json', missing)).rejects.toThrow();
  });
});
