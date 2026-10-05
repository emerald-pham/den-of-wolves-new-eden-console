import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const repositoryDirectory = resolve(fileURLToPath(new URL('..', import.meta.url)));
const productSourceRoot = process.env.PC10_REVIEW_SOURCE_ROOT;

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

test('annotation generator binds reviewed source anchors to the explicit product checkout', {
  skip: !productSourceRoot,
}, () => {
  const temporaryDirectory = mkdtempSync(join(tmpdir(), 'pc10-source-root-'));
  try {
    const outputPath = join(temporaryDirectory, 'annotations.json');
    const generated = spawnSync(process.execPath, [
      join(repositoryDirectory, 'scripts/pc10-action-review-annotations.mjs'), outputPath,
    ], { cwd: repositoryDirectory, env: { ...process.env, PC10_REVIEW_SOURCE_ROOT: productSourceRoot },
      encoding: 'utf8' });
    assert.equal(generated.status, 0, generated.stderr || generated.stdout);
    const artifact = JSON.parse(readFileSync(outputPath, 'utf8'));
    const indexSource = readFileSync(join(productSourceRoot, 'functions/src/index.ts'));
    const anchor = artifact.sourceAnchors.find(item => item.id === 'start.handler');
    assert.ok(anchor, 'start handler anchor is included');
    assert.equal(anchor.sha256, sha256(indexSource), 'anchor hash uses the product checkout file');
    assert.equal(artifact.sourceBinding.ownerRevision,
      execFileSync('git', ['log', '-n', '1', '--format=%H', 'HEAD', '--', 'functions/src', 'src'],
        { cwd: productSourceRoot, encoding: 'utf8' }).trim());
    assert.notEqual(artifact.sourceBinding.generatedAtRevision, artifact.sourceBinding.ownerRevision,
      'documentation generator and product source revisions remain distinct');
  } finally {
    rmSync(temporaryDirectory, { recursive: true, force: true });
  }
});
