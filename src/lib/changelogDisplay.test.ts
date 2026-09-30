import { describe, expect, it, vi } from 'vitest';
import {
  loadChangelogDisplay,
  parseChangelogDisplay,
  type ChangelogDisplayPayload,
} from './changelogDisplay';

const sample: ChangelogDisplayPayload = {
  currentProgress: {
    completed: 507,
    total: 751,
    percentage: '67.51%',
    done: 507,
    partial: 35,
    active: 0,
    missing: 209,
    blocked: 0,
  },
  entries: [
    { version: '0.5.58', changes: ['Current release copy.'] },
    { version: '0.5.57', changes: ['Historical release copy.'] },
  ],
};

describe('changelog display loader', () => {
  it('accepts only display fields and preserves historical copy and ordering', () => {
    expect(parseChangelogDisplay({
      currentProgress: sample.currentProgress,
      entries: [
        { version: '0.5.58', changes: ['First', 'Second'], implementationProgress: { completed: 1 } },
        { version: '0.5.57', changes: ['Earlier'] },
      ],
    })).toEqual({
      currentProgress: sample.currentProgress,
      entries: [
        { version: '0.5.58', changes: ['First', 'Second'] },
        { version: '0.5.57', changes: ['Earlier'] },
      ],
    });
  });

  it.each([
    null,
    {},
    { currentProgress: sample.currentProgress, entries: [{ version: '', changes: ['copy'] }] },
    { currentProgress: sample.currentProgress, entries: [{ version: '0.5.39', changes: [42] }] },
    { currentProgress: { ...sample.currentProgress, percentage: '68%' }, entries: sample.entries },
    { currentProgress: { ...sample.currentProgress, completed: 508 }, entries: sample.entries },
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
