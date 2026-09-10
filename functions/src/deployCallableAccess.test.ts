import { readFileSync } from 'node:fs';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { expect, it } from 'vitest';
import { verifyFunctionsArtifact } from '../../scripts/verify-functions-artifact.mjs';

it('restores public transport access for the browser-callable DRADIS trigger after deploys', () => {
  const workflow = readFileSync('.github/workflows/deploy.yml', 'utf8');

  expect(workflow).toContain('google-github-actions/setup-gcloud@v3');
  expect(workflow).toContain('gcloud functions add-invoker-policy-binding triggerDradisContact');
  expect(workflow).toContain('--member="allUsers"');
  expect(workflow).toContain('--region="us-central1"');
});

it('accepts a downloaded Functions artifact without compiling it again', async () => {
  const root = await mkdtemp(resolve(tmpdir(), 'den-of-wolves-functions-artifact-'));
  try {
    await mkdir(resolve(root, 'lib'), { recursive: true });
    await writeFile(resolve(root, 'lib/index.js'), 'exports.ready = true;\n');
    await expect(verifyFunctionsArtifact(root)).resolves.toEqual({
      artifactDirectory: root,
      entrypoint: resolve(root, 'lib/index.js'),
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
