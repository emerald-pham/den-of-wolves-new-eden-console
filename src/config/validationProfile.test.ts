import { describe, expect, it } from 'vitest';
import { deriveValidationProfile } from '../../scripts/validation-profile.mjs';

describe('validation profiles', () => {
  it('keeps documentation-only work to diff validation', () => {
    expect(deriveValidationProfile({ changedFiles: ['docs/workflow.md', 'README.md'] })).toEqual({
      kind: 'docs',
      reason: 'documentation-only changes do not require application validation',
      commands: ['git diff --check'],
      requiresReview: false,
    });
  });

  it('discovers the affected tooling test even when it was not edited', () => {
    const profile = deriveValidationProfile({
      changedFiles: ['scripts/emulator-slots.js'],
      repositoryDirectory: process.cwd(),
    });
    expect(profile.kind).toBe('tooling');
    expect(profile.requiresReview).toBe(false);
    expect(profile.commands).toContain('npm test -- --run src/config/emulatorSlots.test.ts');
    expect(profile.commands).toContain('npm run lint');
    expect(profile.commands).toContain('npm run build');
  });

  it('uses the focused profile for ordinary UI changes', () => {
    const profile = deriveValidationProfile({ changedFiles: ['src/components/RoleSelect.tsx'] });
    expect(profile.kind).toBe('focused');
    expect(profile.requiresReview).toBe(false);
    expect(profile.commands).toContain('npm run lint');
    expect(profile.commands).toContain('npm run build');
  });

  it('promotes mixed tooling and shared-state changes to the full profile', () => {
    const profile = deriveValidationProfile({
      changedFiles: ['scripts/runtime.mjs', 'src/store/useSessionStore.ts'],
    });
    expect(profile.kind).toBe('full');
    expect(profile.requiresReview).toBe(true);
    expect(profile.reviewReason).toContain('independent holistic review');
    expect(profile.commands).toContain('npm run test:all');
    expect(profile.commands).toContain('npm run build --prefix functions');
  });

  it('fails closed for unknown production paths', () => {
    const profile = deriveValidationProfile({ changedFiles: ['src/services/newAuthority.ts'] });
    expect(profile.kind).toBe('full');
    expect(profile.requiresReview).toBe(true);
  });
});
