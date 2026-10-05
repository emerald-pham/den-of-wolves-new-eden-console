import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const repositoryDirectory = resolve(fileURLToPath(new URL('..', import.meta.url)));

test('action and role matrix enumerates current exports with explicit unresolved cells', () => {
  const temporaryDirectory = mkdtempSync(join(tmpdir(), 'pc10-action-role-matrix-'));
  try {
    const outputPath = join(temporaryDirectory, 'matrix.json');
    const generated = spawnSync(process.execPath, [
      join(repositoryDirectory, 'scripts/pc10-action-role-matrix.mjs'), outputPath,
    ], { cwd: repositoryDirectory, encoding: 'utf8' });
    assert.equal(generated.status, 0, generated.stderr || generated.stdout);

    const matrix = JSON.parse(readFileSync(outputPath, 'utf8'));
    assert.equal(matrix.accounting.actualExports, 241);
    assert.equal(matrix.accounting.callableExports, 232);
    assert.equal(matrix.accounting.roles, 42);
    assert.equal(matrix.actions.length, 232);
    assert.equal(matrix.nonInteractiveExports.length, 9);
    assert.equal(matrix.nonInteractiveExports.filter(row => row.kind === 'background').length, 6);
    assert.equal(matrix.nonInteractiveExports.filter(row => row.kind === 'schedule').length, 3);
    assert.equal(matrix.acceptanceAccounting.fixedPromptClosures, 48);
    assert.equal(matrix.acceptanceAccounting.a01QrCredit, 0);
    assert.equal(matrix.acceptanceAccounting.a02Credit, 0);
    assert.equal(matrix.acceptanceAccounting.pc11Executed, false);
    assert.equal(matrix.acceptanceAccounting.pc12Executed, false);
    assert.match(matrix.fieldPolicy.actionRoleEligibility, /authoritative server entitlement check/);
    assert.match(matrix.sourceBinding.buildScope, /isolated.*does not assert the root owner checkout was rebuilt/);
    assert.match(matrix.sourceBinding.runtimeTesting, /No emulator, browser, native callable/);

    const names = matrix.actions.map(row => row.exportName);
    assert.equal(new Set(names).size, 232);
    for (const row of matrix.actions) {
      for (const field of [
        'action', 'actualServedUi', 'eligibleActor', 'source', 'requirements', 'costs',
        'consequences', 'blockers', 'nextActor', 'inConsoleGuidance', 'roleEligibility',
      ]) assert.ok(row[field], `${row.exportName} is missing ${field}`);
      assert.equal(row.roleEligibility.length, 42, `${row.exportName} role coverage is incomplete`);
      assert.deepEqual(row.roleEligibility.map(cell => cell.roleId), matrix.roles.map(role => role.id));
      assert.ok(row.roleEligibility.every(cell => cell.status === 'unresolved'));
      assert.ok(row.source.serverReferences.length > 0, `${row.exportName} has no server source trace`);
      for (const field of ['requirements', 'costs', 'consequences', 'blockers', 'nextActor']) {
        assert.equal(row[field].status, 'unresolved');
      }
      assert.equal(row.evidence.currentFreshGameProof, 'pending');
      assert.equal(row.evidence.authorityPrivacyRecoveryProof, 'pending');
      assert.equal(row.evidence.automatedBrowserProof, 'pending');
      assert.equal(row.evidence.humanDeviceProof, 'not claimed');
    }

    assert.equal(matrix.roles.map(role => role.id).length, 42);
    assert.ok(matrix.roles.every(role => role.actionEligibility.status === 'unresolved' &&
      role.currentFreshGameProof === 'pending' && role.recoveryProof === 'pending' &&
      role.usabilityProof === 'pending'));
  } finally {
    rmSync(temporaryDirectory, { recursive: true, force: true });
  }
});
