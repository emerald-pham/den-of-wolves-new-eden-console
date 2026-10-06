import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const repositoryDirectory = resolve(fileURLToPath(new URL('..', import.meta.url)));

test('registration-lock annotation does not claim the unmounted GmConsole writer', () => {
  const gmConsoleTest = readFileSync(join(repositoryDirectory, 'src/routes/GmConsole.test.tsx'), 'utf8');
  assert.match(gmConsoleTest, /expect\(setGmControlsLocked\)\.not\.toHaveBeenCalled\(\);/);

  const temporaryDirectory = mkdtempSync(join(tmpdir(), 'pc10-unmounted-gm-lock-'));
  try {
    const outputPath = join(temporaryDirectory, 'annotations.json');
    const generated = spawnSync(process.execPath, [
      join(repositoryDirectory, 'scripts/pc10-action-review-annotations.mjs'), outputPath,
    ], { cwd: repositoryDirectory, encoding: 'utf8' });
    assert.equal(generated.status, 0, generated.stderr || generated.stdout);

    const artifact = JSON.parse(readFileSync(outputPath, 'utf8'));
    const row = artifact.actionSourceReviews.find((review) =>
      review.exportName === 'setGmControlsLocked');
    assert.ok(row, 'the current source review includes the registration-lock callable');
    assert.equal(row.classification, 'genuinely-unserved');
    assert.equal(row.productPath.status, 'genuinely-unserved');
    assert.doesNotMatch(row.productPath.invocation, /GmConsole\s*→/);
    assert.equal(row.clientCallTrace.status, 'service-only-or-no-current-ui-reference');
    assert.equal(row.clientCallTrace.componentOrRouteReferenceCount, 0);
    assert.ok(row.clientCallTrace.sourceReferences.identifierOccurrences.some((reference) =>
      reference.path === 'src/routes/GmConsole.tsx'),
    'the pending-command label remains visible in the scan without being treated as a control');
    assert.ok(row.sourceAnchorIds.includes('workspace.client.setGmControlsLocked'));
    assert.ok(row.sourceAnchorIds.includes('workspace.ui.claimGmInstance'));
    assert.ok(!row.sourceAnchorIds.includes('workspace.ui.setGmControlsLocked'));
    assert.equal(row.guidance.status, 'not-present-in-current-ui');
  } finally {
    rmSync(temporaryDirectory, { recursive: true, force: true });
  }
});
