import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const repositoryDirectory = resolve(fileURLToPath(new URL('..', import.meta.url)));

test('PC10 inventory accounts for all 42 role and private loyalty identities', () => {
  const temporaryDirectory = mkdtempSync(join(tmpdir(), 'pc10-function-inventory-'));
  try {
    const outputPath = join(temporaryDirectory, 'inventory.json');
    const generated = spawnSync(process.execPath, [
      join(repositoryDirectory, 'scripts/pc10-function-inventory.mjs'), outputPath,
    ], {
      cwd: repositoryDirectory,
      encoding: 'utf8',
      env: { ...process.env, GCLOUD_PROJECT: 'demo-pc10-inventory' },
    });
    assert.equal(generated.status, 0, generated.stderr || generated.stdout);

    const inventory = JSON.parse(readFileSync(outputPath, 'utf8'));
    const roleIds = inventory.roles.map((role) => role.id);
    assert.equal(roleIds.length, 42);
    assert.equal(new Set(roleIds).size, 42);
    assert.deepEqual(
      inventory.roles.filter((role) => role.kind === 'private loyalty functions').map((role) => role.id).sort(),
      ['android', 'fleet-loyalist', 'friend', 'intelligence-agent', 'universal-arbour', 'wolf-agent', 'wolf-cult'],
    );
    assert.ok(inventory.roles.every((role) => role.currentFreshGameProof === 'pending' &&
      role.recoveryProof === 'pending' && role.usabilityProof === 'pending'));
  } finally {
    rmSync(temporaryDirectory, { recursive: true, force: true });
  }
});
