import { describe, expect, it } from 'vitest';
import { classifyRiskGates } from '../../scripts/risk-gates.mjs';

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
      functions: true,
      functionsInstall: true,
      webBuild: false,
      ticker: false,
      font: false,
    });
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

  it('fails closed for unknown paths and manual releases', () => {
    for (const profile of [
      classifyRiskGates(['unexpected.production']),
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
  });
});
