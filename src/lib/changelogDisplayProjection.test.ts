import { describe, expect, it } from 'vitest';
import { CHANGELOG } from '@/changelog';
import { projectChangelogForDisplay } from './changelogDisplayProjection';

describe('changelog display projection', () => {
  it('separates current catalog progress from historical release entries', () => {
    const projected = projectChangelogForDisplay(CHANGELOG);

    expect(projected.currentProgress).toEqual({
      ...CHANGELOG[0]?.implementationProgress,
      blocked: 0,
    });
    expect(projected.entries).toEqual(CHANGELOG.map(({ version, changes }) => ({
      version,
      changes: [...changes],
    })));
    expect(projected.entries).toHaveLength(CHANGELOG.length);
    for (const entry of projected.entries) {
      expect(Object.keys(entry)).toEqual(['version', 'changes']);
      expect(entry).not.toHaveProperty('implementationPrompts');
      expect(entry).not.toHaveProperty('implementationProgress');
    }
  });
});
