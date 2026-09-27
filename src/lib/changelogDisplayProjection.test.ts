import { describe, expect, it } from 'vitest';
import { CHANGELOG } from '@/changelog';
import { projectChangelogForDisplay } from './changelogDisplayProjection';

describe('changelog display projection', () => {
  it('preserves every release version and change byte-for-byte without release metadata', () => {
    const projected = projectChangelogForDisplay(CHANGELOG);

    expect(projected).toEqual(CHANGELOG.map(({ version, changes }) => ({
      version,
      changes: [...changes],
    })));
    expect(projected).toHaveLength(CHANGELOG.length);
    for (const entry of projected) {
      expect(Object.keys(entry)).toEqual(['version', 'changes']);
      expect(entry).not.toHaveProperty('implementationPrompts');
      expect(entry).not.toHaveProperty('implementationProgress');
    }
  });
});
