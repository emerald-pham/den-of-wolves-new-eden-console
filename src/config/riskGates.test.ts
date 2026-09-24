import { describe, expect, it } from 'vitest';
import {
  classifyRiskGates,
  isVersionMetadataOnlyPackageChange,
} from '../../scripts/risk-gates.mjs';

describe('risk-based CI gates', () => {
  it('keeps documentation changes out of application gates', () => {
    const profile = classifyRiskGates([
      'README.md',
      'docs/guide.md',
      'docs/implementation-prompts.json',
    ]);
    expect(profile.documentationOnly).toBe(true);
    expect(profile.roadmapChanged).toBe(true);
    expect(profile.unit).toBe(false);
    expect(profile.ticker).toBe(false);
    expect(profile.font).toBe(false);
  });

  it('treats stored evidence PNGs as documentation while failing closed on other evidence artifacts', () => {
    expect(classifyRiskGates([
      'evidence/prompt-428-gm-control/phone-320-full.png',
    ])).toMatchObject({
      documentationOnly: true,
      rootInstall: false,
      functionsInstall: false,
      lint: false,
      unit: false,
      functions: false,
      firestore: false,
      webBuild: false,
      ticker: false,
      font: false,
      render: false,
      bundle: false,
    });

    expect(classifyRiskGates([
      'evidence/prompt-428-gm-control/phone-320-full.png',
      'evidence/prompt-428-gm-control/unexpected.ts',
    ])).toMatchObject({
      documentationOnly: false,
      unit: true,
      functions: true,
      firestore: true,
      webBuild: true,
      ticker: true,
      font: true,
      render: true,
      bundle: true,
    });
  });

  it('runs ticker and font checks for shared UI and styling risks', () => {
    const route = classifyRiskGates(['src/routes/ShipConsole.tsx']);
    expect(route).toMatchObject({ webBuild: true, ticker: true, font: true, bundle: true });

    const style = classifyRiskGates(['src/styles/starmap.css']);
    expect(style).toMatchObject({ ticker: true, font: true, render: true });
  });

  it('does not run browser or font gates for an isolated Functions change', () => {
    expect(classifyRiskGates(['functions/src/pressDispatch.ts'])).toMatchObject({
      functions: true,
      functionsInstall: true,
      webBuild: false,
      ticker: false,
      font: false,
      firestore: false,
    });
  });

  it('runs the Functions project when only a Functions test changed', () => {
    expect(classifyRiskGates(['functions/src/roleBriefs.test.ts'])).toMatchObject({
      unit: false,
      functions: true,
      functionsInstall: true,
      webBuild: false,
      ticker: false,
      font: false,
    });
  });

  it('keeps a synchronized release-only package bump out of unrelated web gates', () => {
    expect(classifyRiskGates([
      'package.json',
      'package-lock.json',
      'src/changelog.ts',
    ], { versionMetadataOnly: true })).toMatchObject({
      webBuild: true,
      unit: false,
      bundle: false,
      ticker: false,
      font: false,
    });
  });

  it('keeps server gates while version metadata stops selecting unrelated web checks', () => {
    expect(classifyRiskGates([
      'package.json',
      'package-lock.json',
      'src/changelog.ts',
      'functions/src/index.ts',
    ], { versionMetadataOnly: true })).toMatchObject({
      functions: true,
      webBuild: true,
      unit: false,
      bundle: false,
      ticker: false,
      font: false,
    });

    expect(classifyRiskGates([
      'package.json',
      'package-lock.json',
      'src/changelog.ts',
      'src/routes/ShipConsole.tsx',
    ], { versionMetadataOnly: true })).toMatchObject({
      unit: true,
      bundle: true,
      ticker: true,
      font: true,
    });
  });

  it('proves package metadata changes by content and rejects dependency drift', () => {
    const beforePackage = { name: 'console', version: '0.4.90', dependencies: { react: '1' } };
    const beforeLockfile = {
      name: 'console', version: '0.4.90', lockfileVersion: 3,
      packages: { '': { name: 'console', version: '0.4.90', dependencies: { react: '1' } } },
    };
    const afterPackage = { ...beforePackage, version: '0.4.91' };
    const afterLockfile = {
      ...beforeLockfile,
      version: '0.4.91',
      packages: { '': { ...beforeLockfile.packages[''], version: '0.4.91' } },
    };
    expect(isVersionMetadataOnlyPackageChange({
      beforePackage, afterPackage, beforeLockfile, afterLockfile,
    })).toBe(true);
    expect(isVersionMetadataOnlyPackageChange({
      beforePackage,
      afterPackage: { ...afterPackage, dependencies: { react: '2' } },
      beforeLockfile,
      afterLockfile,
    })).toBe(false);
  });

  it('treats Hosting build configuration as ticker and font risk', () => {
    for (const file of ['vite.config.ts', 'tsconfig.app.json']) {
      expect(classifyRiskGates([file])).toMatchObject({
        webBuild: true,
        ticker: true,
        font: true,
      });
    }
  });

  it('runs Firestore tests without unrelated browser gates', () => {
    expect(classifyRiskGates(['firestore.rules'])).toMatchObject({
      firestore: true,
      functions: false,
      ticker: false,
      font: false,
    });
  });

  it('classifies Firestore rule tests as rule risk without unrelated browser gates', () => {
    expect(classifyRiskGates(['tests/rules/firestore.rules.test.ts'])).toMatchObject({
      unit: false,
      functions: false,
      firestore: true,
      webBuild: false,
      ticker: false,
      font: false,
      render: false,
      bundle: false,
    });

    expect(classifyRiskGates([
      'functions/src/index.ts',
      'firestore.rules',
      'tests/rules/firestore.rules.test.ts',
    ])).toMatchObject({
      functions: true,
      firestore: true,
      ticker: false,
      font: false,
      render: false,
      bundle: false,
    });
  });

  it('preserves supporting gates when tooling and a deployable surface share a release range', () => {
    expect(classifyRiskGates([
      'scripts/prompt-637-render-performance.mjs',
      'functions/src/index.ts',
    ])).toMatchObject({
      unit: true,
      functions: true,
      render: true,
      webBuild: true,
    });
  });

  it('recognizes prompt render harnesses without selecting server gates', () => {
    expect(classifyRiskGates([
      'scripts/prompt-603-render.mjs',
      'src/index.css',
    ])).toMatchObject({
      unit: true,
      webBuild: true,
      ticker: true,
      font: true,
      render: true,
      bundle: true,
      functions: false,
      firestore: false,
    });
  });

  it('fails closed for an unrecognized prompt render harness', () => {
    expect(classifyRiskGates([
      'scripts/prompt-unknown-render.mjs',
      'src/index.css',
    ])).toMatchObject({
      unit: true,
      functions: true,
      firestore: true,
      webBuild: true,
      ticker: true,
      font: true,
      render: true,
      bundle: true,
    });
  });

  it('preserves browser gates while a mixed server change stays fail closed', () => {
    expect(classifyRiskGates([
      'scripts/prompt-611-render.mjs',
      'src/index.css',
      'functions/src/index.ts',
      'firestore.rules',
    ])).toMatchObject({
      unit: true,
      functions: true,
      firestore: true,
      webBuild: true,
      ticker: true,
      font: true,
      render: true,
      bundle: true,
    });
  });

  it('fails closed for unknown paths and manual releases', () => {
    for (const profile of [
      classifyRiskGates(['unexpected.production']),
      classifyRiskGates(['unknown/prod.test.ts']),
      classifyRiskGates(['unknown/tests/authority.ts']),
      classifyRiskGates(['somewhere/tests/deploy.yml']),
      classifyRiskGates(['tests/rules/firestore.rules.spec.ts']),
      classifyRiskGates([], { manual: true }),
    ]) {
      expect(profile).toMatchObject({
        unit: true,
        functions: true,
        firestore: true,
        ticker: true,
        font: true,
        render: true,
      });
    }

    expect(classifyRiskGates([
      'functions/src/index.ts',
      'firestore.rules',
      'tests/rules/firestore.rules.test.ts',
      'unknown/prod.test.ts',
    ])).toMatchObject({
      functions: true,
      firestore: true,
      ticker: true,
      font: true,
      render: true,
      bundle: true,
    });
  });
});
