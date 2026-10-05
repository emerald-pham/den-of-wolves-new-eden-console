import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { candidateGameplayTools } from './pc10-candidate-manual-ui-proof.mjs';

function loadingCandidateSurface() {
  let tabPresses = 0, screenshotCount = 0;
  const button = { isVisible: async () => true, scrollIntoViewIfNeeded: async () => {} };
  const buttonSet = { and: () => buttonSet, first: () => button };
  const panel = {
    waitFor: async () => {},
    scrollIntoViewIfNeeded: async () => {},
    getByRole: () => buttonSet,
    innerText: async () => 'Receiving current candidate operations…',
    evaluate: async callback => String(callback).includes('scrollWidth')
      ? { noHorizontalOverflow: true,
        controls: [{ name: 'Refresh candidate operations', x: 0, width: 195, height: 44, disabled: false, font: 'test' }],
        checkboxTargets: [], text: 'Receiving current candidate operations…', reducedMotion: false }
      : tabPresses > 0,
  };
  const surface = { page: {
    viewportSize: () => ({ width: 900, height: 700 }),
    setViewportSize: async () => {},
    getByRole: role => role === 'region' ? panel : buttonSet,
    locator: () => ({}),
    waitForResponse: async () => { throw new Error('candidate workspace source report timed out'); },
    keyboard: { press: async key => { if (key === 'Tab') tabPresses++; } },
    screenshot: async () => { screenshotCount++; },
  } };
  return { surface, screenshotCount: () => screenshotCount };
}

test('candidate geometry does not credit a mounted loading panel without a current source workspace report', async t => {
  const directory = await mkdtemp(resolve(tmpdir(), 'pc10-candidate-geometry-red-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const fixture = loadingCandidateSurface();
  const tools = candidateGameplayTools({ gm: fixture.surface, crew: fixture.surface, directory,
    initial: { sessionId: 'session-test', joinCode: 'join-test' }, roster: [{ roleId: 'gm' }] });

  await assert.rejects(
    tools.candidateGeometry(fixture.surface, 'N', 'research-choice', { readinessTimeoutMs: 25 }),
    /candidate workspace.*source|source.*candidate workspace/i,
  );
  assert.equal(fixture.screenshotCount(), 0, 'An unresolved source report must not produce geometry screenshots.');
  assert.deepEqual(await readdir(directory), [], 'An unresolved source report must not write a geometry success record.');
});
