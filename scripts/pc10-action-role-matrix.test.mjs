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
    // The current A02 Warrior ability repair adds one callable; the census update grants no closure credit.
    assert.equal(matrix.accounting.actualExports, 242);
    assert.equal(matrix.accounting.callableExports, 233);
    assert.equal(matrix.accounting.roles, 42);
    assert.equal(matrix.actions.length, 233);
    assert.equal(matrix.nonInteractiveExports.length, 9);
    assert.equal(matrix.nonInteractiveExports.filter(row => row.kind === 'background').length, 6);
    assert.equal(matrix.nonInteractiveExports.filter(row => row.kind === 'schedule').length, 3);
    assert.ok(matrix.nonInteractiveExports.every(row => row.inConsoleGuidance.deferredTo === undefined));
    assert.equal(matrix.acceptanceAccounting.fixedPromptClosures, 48);
    assert.equal(matrix.acceptanceAccounting.a01QrCredit, 0);
    assert.equal(matrix.acceptanceAccounting.a02Credit, 0);
    assert.equal(matrix.productChangeAccounting.a02AbilityRepairCallableRows, 1);
    assert.equal(matrix.productChangeAccounting.addedFixedCatalogClosures, 0);
    assert.equal(matrix.productChangeAccounting.acceptanceCredit, 0);
    assert.equal(matrix.acceptanceAccounting.pc11Executed, false);
    assert.equal(matrix.acceptanceAccounting.pc12Executed, false);
    assert.match(matrix.fieldPolicy.actionRoleEligibility, /authoritative server entitlement check/);
    assert.match(matrix.sourceBinding.buildScope, /existing compiled Functions output as static export metadata/);
    const productionFunctionsRevision = spawnSync('git', ['log', '-n', '1', '--format=%H', 'HEAD', '--',
      'functions/src', ':(exclude,glob)functions/src/**/*.test.ts', ':(exclude,glob)functions/src/**/*.spec.ts'],
    { cwd: repositoryDirectory, encoding: 'utf8' }).stdout.trim();
    assert.equal(matrix.sourceBinding.functionsSourceCommit, productionFunctionsRevision);
    assert.match(matrix.sourceBinding.runtimeTesting, /No emulator, browser, native callable/);

    const names = matrix.actions.map(row => row.exportName);
    assert.equal(new Set(names).size, 233);
    const currentPc10GuidanceActions = ['prepareFullGameDemo', 'readCandidateWorkspace',
      'executeCandidateAction', 'getPdfEscortWingLaunch', 'passWolfFighterLaunchChoice'];
    for (const name of currentPc10GuidanceActions) {
      const row = matrix.actions.find(action => action.exportName === name);
      assert.ok(row, `${name} remains in the current callable matrix`);
      assert.equal(row.inConsoleGuidance.status, 'source-review-overlay', `${name} uses current PC10 source guidance`);
      assert.equal(row.inConsoleGuidance.deferredTo, undefined, `${name} is not generically deferred to PC11`);
      assert.equal(row.evidence.currentFreshGameProof, 'pending', `${name} source review is not live usability proof`);
    }
    assert.ok(matrix.actions.every(row => !/PC11|deferred/i.test(JSON.stringify(row.inConsoleGuidance))),
      'no callable guidance row is blanket-deferred to PC11');
    const warriorCargo = matrix.actions.find(row => row.exportName === 'transferWarriorCargo');
    assert.ok(warriorCargo, 'the current A02 ability-repair export is included in the canonical callable rows');
    assert.ok(warriorCargo.roleEligibility.every(cell => cell.status === 'unresolved'));
    assert.equal(warriorCargo.evidence.currentFreshGameProof, 'pending');
    assert.equal(warriorCargo.evidence.humanPhysicalPlaytest, 'not claimed');
    for (const row of matrix.actions) {
      for (const field of [
        'action', 'actualServedUi', 'eligibleActor', 'source', 'requirements', 'costs',
        'consequences', 'blockers', 'nextActor', 'inConsoleGuidance', 'roleEligibility',
      ]) assert.ok(row[field], `${row.exportName} is missing ${field}`);
      assert.equal(row.roleEligibility.length, 42, `${row.exportName} role coverage is incomplete`);
      assert.deepEqual(row.sourceReviewRef, { artifact: 'docs/PC10_ACTION_REVIEW_ANNOTATIONS.json', exportName: row.exportName });
      assert.equal(row.inConsoleGuidance.status, 'source-review-overlay');
      assert.equal(row.inConsoleGuidance.deferredTo, undefined);
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
    assert.ok(matrix.roles.every(role => role.inConsoleGuidance.status === 'unresolved' &&
      role.inConsoleGuidance.deferredTo === undefined));
  } finally {
    rmSync(temporaryDirectory, { recursive: true, force: true });
  }
});
