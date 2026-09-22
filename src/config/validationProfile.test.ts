import { describe, expect, it } from 'vitest';
import { deriveValidationProfile } from '../../scripts/validation-profile.mjs';

describe('validation profiles', () => {
  it('uses a truthful diff check when there are no changed files', () => {
    expect(deriveValidationProfile({ changedFiles: [] })).toEqual({
      kind: 'no-changes',
      reason: 'no changed files require only a clean diff check',
      commands: ['git diff --check'],
      requiresReview: false,
    });
  });

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
    expect(profile.reviewReason).toContain('independent risk review');
    expect(profile.commands).toContain('npm run test:all');
    expect(profile.commands).toContain('npm run build --prefix functions');
  });

  it('fails closed for unknown production paths', () => {
    const profile = deriveValidationProfile({ changedFiles: ['src/services/newAuthority.ts'] });
    expect(profile.kind).toBe('full');
    expect(profile.requiresReview).toBe(true);
  });

  it('uses full validation without a reviewer for unknown ordinary paths', () => {
    const profile = deriveValidationProfile({ changedFiles: ['src/utils/newFormatting.ts'] });
    expect(profile.kind).toBe('full');
    expect(profile.requiresReview).toBe(false);
  });

  it('keeps test-only Functions and UI evidence focused without an independent review', () => {
    const profile = deriveValidationProfile({
      changedFiles: [
        'functions/src/maintenance.test.ts',
        'src/components/MaintenanceSystems.test.tsx',
      ],
    });
    expect(profile.kind).toBe('focused-tests');
    expect(profile.requiresReview).toBe(false);
    expect(profile.commands).toContain('npm test -- --run functions/src/maintenance.test.ts');
    expect(profile.commands).toContain('npm test -- --run src/components/MaintenanceSystems.test.tsx');
    expect(profile.commands).toContain('npm run build');
    expect(profile.commands).toContain('npm run build --prefix functions');
    expect(profile.commands).not.toContain('npm run test:all');
    expect(profile.commands).not.toContain('npm run test:font-consistency');
    expect(profile.commands).not.toContain('npm run test:ticker:browser');
  });

  it('keeps production Functions changes on the independently reviewed full gate', () => {
    const profile = deriveValidationProfile({ changedFiles: ['functions/src/maintenance.ts'] });
    expect(profile.kind).toBe('full');
    expect(profile.requiresReview).toBe(true);
    expect(profile.commands).toContain('npm run test:all');
  });

  it('keeps roadmap evidence plus Functions tests focused and includes the Functions build', () => {
    const profile = deriveValidationProfile({
      changedFiles: [
        'docs/implementation-prompts.json',
        'functions/src/maintenance.test.ts',
      ],
    });
    expect(profile.kind).toBe('tooling');
    expect(profile.requiresReview).toBe(false);
    expect(profile.commands).toContain('npm test -- --run functions/src/maintenance.test.ts');
    expect(profile.commands).toContain('npm run build --prefix functions');
    expect(profile.commands).toContain('npm run roadmap:check');
    expect(profile.commands).not.toContain('npm run test:all');
  });

  it('checks generated roadmap views for a catalog-only change', () => {
    const profile = deriveValidationProfile({
      changedFiles: ['docs/implementation-prompts.json'],
    });
    expect(profile.kind).toBe('tooling');
    expect(profile.requiresReview).toBe(false);
    expect(profile.commands).toContain('npm run roadmap:check');
  });

  it('keeps the Functions build when a focused UI change also updates a Functions test', () => {
    const profile = deriveValidationProfile({
      changedFiles: [
        'src/components/MaintenanceSystems.tsx',
        'functions/src/maintenance.test.ts',
      ],
    });
    expect(profile.kind).toBe('focused');
    expect(profile.requiresReview).toBe(false);
    expect(profile.commands).toContain('npm run build');
    expect(profile.commands).toContain('npm run build --prefix functions');
    expect(profile.commands).toContain('npm run test:font-consistency');
    expect(profile.commands).toContain('npm run test:ticker:browser');
  });

  it('adds font and ticker gates only for affected UI paths', () => {
    const ui = deriveValidationProfile({ changedFiles: ['src/routes/ShipConsole.tsx'] });
    expect(ui.commands).toContain('npm run test:font-consistency');
    expect(ui.commands).toContain('npm run test:ticker:browser');

    const data = deriveValidationProfile({ changedFiles: ['src/data/missionCards.ts'] });
    expect(data.commands).not.toContain('npm run test:font-consistency');
    expect(data.commands).not.toContain('npm run test:ticker:browser');
  });

  it('keeps a P603-shaped render harness and global CSS release range focused', () => {
    const profile = deriveValidationProfile({
      changedFiles: [
        'docs/IMPLEMENTATION_PLAN.md',
        'docs/implementation-prompts.json',
        'package-lock.json',
        'package.json',
        'scripts/prompt-603-render.mjs',
        'src/changelog.ts',
        'src/index.css',
        'src/styles/aesthetic.test.ts',
      ],
      versionMetadataOnly: true,
    });
    expect(profile.kind).toBe('focused');
    expect(profile.requiresReview).toBe(false);
    expect(profile.commands).toContain('npm run test:font-consistency');
    expect(profile.commands).toContain('npm run test:ticker:browser');
    expect(profile.commands).toContain('node scripts/prompt-637-render-performance.mjs');
    expect(profile.commands).toContain('node scripts/check-bundle-size.mjs');
    expect(profile.commands).not.toContain('npm run test:all');
    expect(profile.commands).not.toContain('npm run build --prefix functions');
  });

  it('keeps the local unit gate when a UI render range has no colocated test', () => {
    const profile = deriveValidationProfile({
      changedFiles: ['scripts/prompt-603-render.mjs', 'src/index.css'],
    });
    expect(profile.kind).toBe('focused');
    expect(profile.commands).toContain('npm run test:unit');
    expect(profile.commands).toContain('npm run test:font-consistency');
    expect(profile.commands).toContain('npm run test:ticker:browser');
    expect(profile.commands).toContain('node scripts/prompt-637-render-performance.mjs');
    expect(profile.commands).toContain('node scripts/check-bundle-size.mjs');
    expect(profile.commands).not.toContain('npm run test:all');
    expect(profile.commands).not.toContain('npm run build --prefix functions');
  });

  it('keeps unit and render gates for a recognized harness-only change', () => {
    const profile = deriveValidationProfile({
      changedFiles: ['scripts/prompt-603a-geometry.mjs'],
    });
    expect(profile.kind).toBe('tooling');
    expect(profile.commands).toContain('npm run test:unit');
    expect(profile.commands).toContain('node scripts/prompt-637-render-performance.mjs');
    expect(profile.commands).not.toContain('npm run test:all');
    expect(profile.commands).not.toContain('npm run build --prefix functions');
  });

  it('keeps unit and render gates for metadata plus a recognized harness', () => {
    const profile = deriveValidationProfile({
      changedFiles: [
        'docs/implementation-prompts.json',
        'package-lock.json',
        'package.json',
        'scripts/prompt-603-render.mjs',
        'src/changelog.ts',
      ],
      versionMetadataOnly: true,
    });
    expect(profile.kind).toBe('tooling');
    expect(profile.commands).toContain('npm run test:unit');
    expect(profile.commands).toContain('node scripts/prompt-637-render-performance.mjs');
    expect(profile.commands).not.toContain('npm run test:all');
    expect(profile.commands).not.toContain('npm run build --prefix functions');
  });

  it('keeps a P611-shaped application chrome release range focused', () => {
    const profile = deriveValidationProfile({
      changedFiles: [
        'docs/IMPLEMENTATION_PROGRESS.md',
        'docs/implementation-prompts.json',
        'package-lock.json',
        'package.json',
        'src/App.test.tsx',
        'src/changelog.ts',
        'src/components/ContactPlot.test.tsx',
        'src/components/ContactPlot.tsx',
        'src/components/ShipPlot.test.tsx',
        'src/styles/plot.css',
      ],
      versionMetadataOnly: true,
    });
    expect(profile.kind).toBe('focused');
    expect(profile.commands).toContain('npm run test:font-consistency');
    expect(profile.commands).toContain('npm run test:ticker:browser');
    expect(profile.commands).toContain('node scripts/prompt-637-render-performance.mjs');
    expect(profile.commands).toContain('node scripts/check-bundle-size.mjs');
    expect(profile.commands).not.toContain('npm run test:all');
    expect(profile.commands).not.toContain('npm run build --prefix functions');
  });

  it('keeps mixed server changes on the full fail-closed profile', () => {
    const profile = deriveValidationProfile({
      changedFiles: ['scripts/prompt-603-render.mjs', 'src/index.css', 'functions/src/index.ts'],
      versionMetadataOnly: true,
    });
    expect(profile.kind).toBe('full');
    expect(profile.requiresReview).toBe(true);
    expect(profile.commands).toContain('npm run test:all');
    expect(profile.commands).toContain('npm run build --prefix functions');
  });

  it('fails closed for an unrecognized prompt render script', () => {
    const profile = deriveValidationProfile({
      changedFiles: ['scripts/prompt-unknown-render.mjs', 'src/index.css'],
    });
    expect(profile.kind).toBe('full');
    expect(profile.requiresReview).toBe(true);
    expect(profile.commands).toContain('npm run test:all');
  });

  it('retains independent review for capacity and release evidence tooling', () => {
    for (const file of [
      'scripts/prompt-639-browser-capacity.mjs',
      'config/capacity-60-browser-thresholds.json',
      'scripts/verify-release.mjs',
      'scripts/verify-deployment.mjs',
      'scripts/verify-functions-artifact.mjs',
    ]) {
      expect(deriveValidationProfile({ changedFiles: [file] }).requiresReview).toBe(true);
    }
  });

  it('requires an exact-head independent security receipt for threat-model governance', () => {
    const profile = deriveValidationProfile({
      changedFiles: ['security/threat-model.json', 'scripts/validate-threat-model.mjs'],
    });
    expect(profile.kind).toBe('full');
    expect(profile.requiresReview).toBe(true);
    expect(profile.reviewReceiptKind).toBe('exact-head-independent-security-review');
  });
});
