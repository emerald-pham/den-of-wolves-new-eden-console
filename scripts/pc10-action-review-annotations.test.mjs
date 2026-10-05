import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const repositoryDirectory = resolve(fileURLToPath(new URL('..', import.meta.url)));
const expectedNames = [
  'resolveMaliadesMedium', 'resolveMaliadesShort', 'setShipPreference',
  'submitWolfSupplySabotage', 'elevateToGm', 'rollDice',
  'createSession', 'joinSession', 'resumeSession', 'getCurrentMemberSession',
  'refreshPresence', 'confirmSetup', 'startGame', 'prepareFullGameDemo',
  'beginSessionDebrief', 'closeSession', 'getSessionDebrief',
  'readFleetGroupMessages', 'sendFleetGroupMessage',
];
const permittedClassifications = new Set([
  'served-ui-path', 'legacy/deprecated-internal-compatibility',
  'external/manual-only', 'genuinely-unserved',
]);

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

test('review annotations preserve the canonical matrix and anchor each concrete action fact', () => {
  const matrixBefore = sha256(readFileSync(join(repositoryDirectory, 'docs/PC10_ACTION_ROLE_MATRIX.json')));
  const temporaryDirectory = mkdtempSync(join(tmpdir(), 'pc10-action-review-'));
  try {
    const outputPath = join(temporaryDirectory, 'annotations.json');
    const generated = spawnSync(process.execPath, [
      join(repositoryDirectory, 'scripts/pc10-action-review-annotations.mjs'), outputPath,
    ], { cwd: repositoryDirectory, encoding: 'utf8' });
    assert.equal(generated.status, 0, generated.stderr || generated.stdout);

    const artifact = JSON.parse(readFileSync(outputPath, 'utf8'));
    assert.equal(artifact.schemaVersion, 1);
    assert.equal(artifact.sourceBinding.runtimeChecks, 'not run');
    assert.equal(artifact.sourceBinding.buildArtifactsIncluded, false);
    assert.equal(artifact.sourceBinding.functionsSource.sha256.length, 64);
    assert.equal(artifact.sourceBinding.clientSource.sha256.length, 64);
    assert.deepEqual(artifact.annotations.map(row => row.exportName), expectedNames);

    const anchors = new Map(artifact.sourceAnchors.map(anchor => [anchor.id, anchor]));
    assert.equal(anchors.size, artifact.sourceAnchors.length);
    for (const anchor of anchors.values()) {
      const source = readFileSync(join(repositoryDirectory, anchor.path), 'utf8');
      assert.equal(sha256(source), anchor.sha256, `${anchor.id} is bound to its actual source file`);
      const lines = source.split(/\r?\n/);
      assert.ok(anchor.startLine >= 1 && anchor.endLine >= anchor.startLine);
      assert.ok(anchor.endLine <= lines.length);
      assert.ok(anchor.symbol.length > 0);
    }

    for (const row of artifact.annotations) {
      assert.ok(permittedClassifications.has(row.classification), `${row.exportName} classification`);
      assert.ok(row.actor.family && row.actor.sourceAnchorIds.length > 0, `${row.exportName} actor`);
      for (const field of ['requirements', 'costs', 'consequences', 'blockers', 'nextActor']) {
        assert.ok(row[field].summary, `${row.exportName} ${field} summary`);
        assert.ok(row[field].sourceAnchorIds.length > 0, `${row.exportName} ${field} anchors`);
      }
      assert.ok(row.clientCallTrace.status && row.clientCallTrace.sourceTreeSha256.length === 64);
      assert.ok(row.clientCallTrace.interpretation);
      assert.ok(row.guidance.status && row.guidance.sourceAnchorIds.length > 0);
      for (const id of [
        ...row.actor.sourceAnchorIds,
        ...row.requirements.sourceAnchorIds,
        ...row.costs.sourceAnchorIds,
        ...row.consequences.sourceAnchorIds,
        ...row.blockers.sourceAnchorIds,
        ...row.nextActor.sourceAnchorIds,
        ...row.guidance.sourceAnchorIds,
        ...row.clientCallTrace.sourceAnchorIds,
      ]) assert.ok(anchors.has(id), `${row.exportName} refers to source anchor ${id}`);
    }

    const byName = new Map(artifact.annotations.map(row => [row.exportName, row]));
    for (const name of ['resolveMaliadesMedium', 'resolveMaliadesShort']) {
      assert.equal(byName.get(name).classification, 'legacy/deprecated-internal-compatibility');
      assert.equal(byName.get(name).productPath.servedAlternative.callable, 'commitWolfEscortRangeActionChoice');
    }
    for (const name of ['setShipPreference', 'submitWolfSupplySabotage', 'elevateToGm', 'rollDice']) {
      assert.equal(byName.get(name).classification, 'external/manual-only');
      assert.equal(byName.get(name).clientCallTrace.status, 'no-current-client-call-found');
    }

    const untouchedMatrix = readFileSync(join(repositoryDirectory, 'docs/PC10_ACTION_ROLE_MATRIX.json'));
    assert.equal(sha256(untouchedMatrix), matrixBefore, 'the canonical generated snapshot is not rewritten');
    const canonical = JSON.parse(untouchedMatrix);
    assert.equal(canonical.accounting.callableExports, 232);
    assert.equal(canonical.accounting.roles, 42);
    assert.ok(canonical.actions.every(row => row.roleEligibility.every(cell => cell.status === 'unresolved')));
    assert.ok(canonical.actions.every(row => row.evidence.currentFreshGameProof === 'pending'));
  } finally {
    rmSync(temporaryDirectory, { recursive: true, force: true });
  }
});
