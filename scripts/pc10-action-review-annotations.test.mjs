import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const repositoryDirectory = resolve(fileURLToPath(new URL('..', import.meta.url)));
const productSourceRoot = resolve(process.env.PC10_REVIEW_SOURCE_ROOT ?? repositoryDirectory);
const expectedNames = [
  'resolveMaliadesMedium', 'resolveMaliadesShort', 'setShipPreference',
  'submitWolfSupplySabotage', 'elevateToGm', 'rollDice',
  'createSession', 'joinSession', 'resumeSession', 'getCurrentMemberSession',
  'refreshPresence', 'confirmSetup', 'startGame', 'prepareFullGameDemo',
  'beginSessionDebrief', 'closeSession', 'getSessionDebrief',
  'readFleetGroupMessages', 'sendFleetGroupMessage', 'loginGmAccess',
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
    assert.equal(artifact.sourceBinding.ownerRevision,
      execFileSync('git', ['log', '-n', '1', '--format=%H', 'HEAD', '--', 'functions/src', 'src'],
        { cwd: productSourceRoot, encoding: 'utf8' }).trim());
    const generatorRevision = execFileSync('git', ['rev-parse', 'HEAD'],
      { cwd: repositoryDirectory, encoding: 'utf8' }).trim();
    assert.equal(artifact.sourceBinding.generatedAtRevision, generatorRevision,
      'generatedAtRevision binds the checkout containing the annotation generator');
    if (productSourceRoot !== repositoryDirectory) {
      assert.notEqual(artifact.sourceBinding.generatedAtRevision, artifact.sourceBinding.ownerRevision,
        'separate documentation and product checkouts remain distinguishable');
    }
    assert.deepEqual(artifact.annotations.map(row => row.exportName), expectedNames);
    assert.deepEqual([artifact.sourceReviewShards.endings.length, artifact.sourceReviewShards.workspaces.length,
      artifact.sourceReviewShards.demo.length], [68, 69, 69]);
    assert.equal(artifact.actionSourceReviews.length, 206);
    assert.equal(artifact.coverageAccounting.sourceReviewedCanonicalCallableRows, 232);
    assert.equal(artifact.coverageAccounting.sourceInventoryDeltaCallableRows, 1);
    assert.equal(artifact.sourceInventoryDeltas[0].exportName, 'transferWarriorCargo');
    assert.equal(artifact.coverageAccounting.callableRoleCellsReviewed, 0);
    assert.equal(artifact.coverageAccounting.gameplayAcceptanceCredit, 0);

    const anchors = new Map(artifact.sourceAnchors.map(anchor => [anchor.id, anchor]));
    assert.equal(anchors.size, artifact.sourceAnchors.length);
    for (const anchor of anchors.values()) {
      const source = readFileSync(join(productSourceRoot, anchor.path), 'utf8');
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
    for (const name of ['elevateToGm', 'rollDice']) {
      assert.equal(byName.get(name).classification, 'external/manual-only');
      assert.equal(byName.get(name).clientCallTrace.status, 'no-current-client-call-found');
    }
    assert.equal(byName.get('loginGmAccess').classification, 'served-ui-path');

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

test('historical snapshot retains the prior ship preference classification for audit', () => {
  const historicalPath = join(repositoryDirectory,
    'docs/history/PC10_ACTION_REVIEW_ANNOTATIONS_20_reviewed_rows_212_unreviewed.json');
  const historical = JSON.parse(readFileSync(historicalPath, 'utf8'));
  const row = historical.annotations.find((annotation) =>
    annotation.exportName === 'setShipPreference');

  assert.equal(row.classification, 'external/manual-only');
  assert.equal(row.clientCallTrace.status, 'no-current-client-call-found');
  assert.equal(row.productPath.status, 'no-current-client-control-found');
});

test('current ship preference review follows its mounted casting panel and adapter', () => {
  const temporaryDirectory = mkdtempSync(join(tmpdir(), 'pc10-ship-preference-review-'));
  try {
    const outputPath = join(temporaryDirectory, 'annotations.json');
    const generated = spawnSync(process.execPath, [
      join(repositoryDirectory, 'scripts/pc10-action-review-annotations.mjs'), outputPath,
    ], { cwd: repositoryDirectory, encoding: 'utf8' });
    assert.equal(generated.status, 0, generated.stderr || generated.stdout);

    const artifact = JSON.parse(readFileSync(outputPath, 'utf8'));
    const row = artifact.annotations.find((annotation) =>
      annotation.exportName === 'setShipPreference');
    const anchors = new Map(artifact.sourceAnchors.map((anchor) => [anchor.id, anchor]));
    const references = row.clientCallTrace.clientSourceReferences;
    const classification = artifact.exportClassification.rows.find((entry) =>
      entry.exportName === 'setShipPreference');

    assert.equal(row.classification, 'served-ui-path');
    assert.equal(row.productPath.status, 'served-ui-path');
    assert.equal(row.productPath.currentSurface,
      'SessionMode CastingPreferencePanel optional nonbinding ship preference');
    assert.equal(row.productPath.currentMount,
      'src/App.tsx → SessionMode → CastingPreferencePanel');
    assert.equal(row.productPath.invocation,
      'CastingPreferencePanel → submitShipPreference → setShipPreference callable');
    assert.match(row.actor.family, /current connected active player.*lobby or casting/i);
    assert.match(row.requirements.summary, /lobby or casting/i);
    assert.match(row.requirements.summary, /active.roster vessel/i);
    assert.match(row.requirements.summary, /fresh server snapshot/i);
    assert.match(row.costs.summary, /no game resource or action slot/i);
    assert.match(row.consequences.summary, /nonbinding shipPreferenceId/i);
    assert.match(row.consequences.summary, /does not assign a vessel/i);
    assert.match(row.blockers.summary, /disconnected player/i);
    assert.match(row.blockers.summary, /locked setup/i);
    assert.match(row.blockers.summary, /active roster/i);
    assert.match(row.nextActor.summary, /GM decides assignments and any tie-breaks/i);
    assert.equal(row.clientCallTrace.status, 'current-ui-service-call');
    assert.ok(row.clientCallTrace.identifierReferenceCount > 0);
    assert.ok(row.clientCallTrace.exactQuotedReferenceCount > 0);
    assert.ok(references.identifierOccurrences.some((reference) =>
      reference.path === 'src/components/CastingPreferencePanel.tsx' &&
      reference.matchedSymbol === 'submitShipPreference'));
    assert.ok(references.quotedOccurrences.some((reference) =>
      reference.path === 'src/lib/sessionService.ts'));
    assert.equal(row.guidance.status, 'current-casting-preference-guidance');
    assert.match(row.guidance.summary, /optional, nonbinding/i);
    assert.match(row.guidance.summary, /GM decides assignments and any tie-breaks/i);
    assert.ok(classification.clientTrace.importChainsToApp.some((chain) =>
      chain.join(' → ') ===
        'src/components/CastingPreferencePanel.tsx → src/routes/SessionMode.tsx → src/App.tsx'));
    assert.equal(anchors.get('preference.handler').symbol, 'setShipPreference');
    assert.equal(anchors.get('preference.client').symbol, 'submitShipPreference');
    assert.equal(anchors.get('preference.ui').path, 'src/components/CastingPreferencePanel.tsx');
    assert.equal(anchors.get('preference.route').path, 'src/routes/SessionMode.tsx');
    assert.equal(anchors.get('preference.appMount').symbol, 'AppRoutes');
    assert.equal(classification.sourceClassification, 'served-ui-path');
    assert.equal(artifact.coverageAccounting.callableRoleCellsReviewed, 0);
    assert.equal(artifact.coverageAccounting.gameplayAcceptanceCredit, 0);
    assert.equal(artifact.sourceBinding.runtimeChecks, 'not run');
  } finally {
    rmSync(temporaryDirectory, { recursive: true, force: true });
  }
});

test('historical snapshot retains the prior Wolf supply classification for audit', () => {
  const historicalPath = join(repositoryDirectory,
    'docs/history/PC10_ACTION_REVIEW_ANNOTATIONS_20_reviewed_rows_212_unreviewed.json');
  const historical = JSON.parse(readFileSync(historicalPath, 'utf8'));
  const row = historical.annotations.find((annotation) =>
    annotation.exportName === 'submitWolfSupplySabotage');

  assert.equal(row.classification, 'external/manual-only');
  assert.equal(row.clientCallTrace.status, 'no-current-client-call-found');
});

test('current Wolf supply review follows the adapter, mounted panel, and guidance', () => {
  const temporaryDirectory = mkdtempSync(join(tmpdir(), 'pc10-wolf-supply-review-'));
  try {
    const outputPath = join(temporaryDirectory, 'annotations.json');
    const generated = spawnSync(process.execPath, [
      join(repositoryDirectory, 'scripts/pc10-action-review-annotations.mjs'), outputPath,
    ], { cwd: repositoryDirectory, encoding: 'utf8' });
    assert.equal(generated.status, 0, generated.stderr || generated.stdout);

    const artifact = JSON.parse(readFileSync(outputPath, 'utf8'));
    const row = artifact.annotations.find((annotation) =>
      annotation.exportName === 'submitWolfSupplySabotage');
    const anchors = new Map(artifact.sourceAnchors.map((anchor) => [anchor.id, anchor]));
    const clientReferences = row.clientCallTrace.clientSourceReferences;
    const classification = artifact.exportClassification.rows.find((entry) =>
      entry.exportName === 'submitWolfSupplySabotage');

    assert.equal(row.classification, 'served-ui-path');
    assert.equal(row.productPath.status, 'served-ui-path');
    assert.equal(row.productPath.currentMount,
      'src/App.tsx → ScreenFade → PrivateLoyaltyPanel');
    assert.equal(row.productPath.currentSurface, 'PrivateLoyaltyPanel Wolf supply action');
    assert.equal(row.productPath.invocation,
      'PrivateLoyaltyPanel → wolfActionService.submitWolfSupplySabotage → submitWolfSupplySabotage callable');
    assert.ok(row.actor.family.includes('Wolf Agent or Wolf Cult'));
    assert.ok(row.actor.family.includes('assigned cover role'));
    assert.match(row.requirements.summary, /active gameplay cycle.*connected active player/i);
    assert.match(row.requirements.summary, /loyalty census/i);
    assert.match(row.requirements.summary, /Press/i);
    assert.match(row.costs.summary, /floor.*half|half.*rounded down/i);
    assert.match(row.costs.summary, /suspicion/i);
    assert.match(row.costs.summary, /Wolf action slot/i);
    assert.match(row.consequences.summary, /private clue.*alert|private alert.*clue/i);
    assert.match(row.blockers.summary, /stale cycle/i);
    assert.match(row.blockers.summary, /replacement.*escape/i);
    assert.match(row.nextActor.summary, /facilitator.*acknowledge/i);
    assert.equal(row.clientCallTrace.status, 'current-ui-service-call');
    assert.ok(row.clientCallTrace.identifierReferenceCount > 0);
    assert.ok(row.clientCallTrace.exactQuotedReferenceCount > 0);
    assert.ok(clientReferences.identifierOccurrences.some((reference) =>
      reference.path === 'src/components/PrivateLoyaltyPanel.tsx'));
    assert.ok(clientReferences.quotedOccurrences.some((reference) =>
      reference.path === 'src/lib/wolfActionService.ts'));
    assert.equal(row.guidance.status, 'current-member-action-guidance');
    assert.match(row.guidance.summary, /cargo target|selected supply/i);
    assert.ok(anchors.get('supply.appMount').path === 'src/App.tsx');
    assert.equal(anchors.get('supply.appMount').symbol, 'AppRoutes');
    assert.ok(anchors.get('supply.otherWolfControls').path === 'src/components/PrivateLoyaltyPanel.tsx');
    assert.ok(anchors.get('supply.clientAdapter').path === 'src/lib/wolfActionService.ts');
    assert.ok(classification.clientTrace.importChainsToApp.some((chain) =>
      chain[0] === 'src/components/PrivateLoyaltyPanel.tsx' && chain.at(-1) === 'src/App.tsx'));
    assert.deepEqual(artifact.coverageAccounting.explicitPc11GuidanceGaps, []);
    assert.equal(classification.conditionalGapReferences, undefined);
    assert.equal(artifact.coverageAccounting.callableRoleCellsReviewed, 0);
    assert.equal(artifact.coverageAccounting.gameplayAcceptanceCredit, 0);
    assert.equal(artifact.sourceBinding.runtimeChecks, 'not run');
  } finally {
    rmSync(temporaryDirectory, { recursive: true, force: true });
  }
});

test('current away-mission deal review follows the mounted GM start panel and callable adapter', () => {
  const temporaryDirectory = mkdtempSync(join(tmpdir(), 'pc10-away-mission-review-'));
  try {
    const outputPath = join(temporaryDirectory, 'annotations.json');
    const generated = spawnSync(process.execPath, [
      join(repositoryDirectory, 'scripts/pc10-action-review-annotations.mjs'), outputPath,
    ], { cwd: repositoryDirectory, encoding: 'utf8' });
    assert.equal(generated.status, 0, generated.stderr || generated.stdout);

    const artifact = JSON.parse(readFileSync(outputPath, 'utf8'));
    const row = artifact.actionSourceReviews.find((review) => review.exportName === 'dealPrivateInitialCards');
    const classification = artifact.exportClassification.rows.find((entry) =>
      entry.exportName === 'dealPrivateInitialCards');
    const anchors = new Map(artifact.sourceAnchors.map((anchor) => [anchor.id, anchor]));
    const references = row.clientCallTrace.sourceReferences.identifierOccurrences;

    assert.equal(row.classification, 'served-ui-path');
    assert.equal(row.productPath.status, 'served-ui-path');
    assert.equal(row.productPath.surface,
      'GmConsole → AwayMissionStartPanel → startAwayMission → dealPrivateInitialCards callable');
    assert.match(row.actor.family, /facilitator.*live.*GM instance/i);
    assert.match(row.requirements.summary, /locked organiser chart.*current phase\/cycle.*live GM lease/i);
    assert.match(row.costs.summary, /no separate resource fee.*private initial mission cards atomically/i);
    assert.match(row.consequences.summary, /source-bound mission.*private participant snapshots/i);
    assert.match(row.blockers.summary, /stale GM.*chart|chart.*stale GM/i);
    assert.match(row.nextActor.summary, /participants and GM.*separate lifecycle controls/i);
    assert.match(row.guidance.summary, /Start mission.*opportunity.*participants.*leader/i);
    assert.equal(row.clientReferenceAliases[0], 'startAwayMission');
    assert.equal(row.clientCallTrace.status, 'source-service-and-component-route-references');
    assert.ok(references.some((reference) => reference.path === 'src/components/AwayMissionStartPanel.tsx' &&
      reference.matchedSymbol === 'startAwayMission'));
    assert.ok(row.clientCallTrace.sourceReferences.quotedOccurrences.some((reference) =>
      reference.path === 'src/lib/sessionService.ts'));
    assert.equal(anchors.get('mission.startPanel').symbol, 'AwayMissionStartPanel');
    assert.equal(anchors.get('mission.startService').symbol, 'startAwayMission');
    assert.equal(anchors.get('mission.gmConsole').symbol, 'GmConsole');
    assert.equal(anchors.get('mission.appRoutes').symbol, 'AppRoutes');
    assert.ok(classification.clientTrace.importChainsToApp.some((chain) =>
      chain[0] === 'src/components/AwayMissionStartPanel.tsx' && chain.at(-1) === 'src/App.tsx'));
    assert.equal(classification.sourceClassification, 'served-ui-path');
    assert.equal(classification.acceptanceCredit, 0);
    assert.equal(artifact.coverageAccounting.callableRoleCellsReviewed, 0);
    assert.equal(artifact.coverageAccounting.gameplayAcceptanceCredit, 0);
    assert.equal(artifact.sourceBinding.runtimeChecks, 'not run');
  } finally {
    rmSync(temporaryDirectory, { recursive: true, force: true });
  }
});

test('current Intelligence Agent investigation review follows the mounted panel and callable adapter', () => {
  const temporaryDirectory = mkdtempSync(join(tmpdir(), 'pc10-intelligence-review-'));
  try {
    const outputPath = join(temporaryDirectory, 'annotations.json');
    const generated = spawnSync(process.execPath, [
      join(repositoryDirectory, 'scripts/pc10-action-review-annotations.mjs'), outputPath,
    ], { cwd: repositoryDirectory, encoding: 'utf8' });
    assert.equal(generated.status, 0, generated.stderr || generated.stdout);

    const artifact = JSON.parse(readFileSync(outputPath, 'utf8'));
    const row = artifact.actionSourceReviews.find((review) =>
      review.exportName === 'investigateAsIntelligenceAgent');
    const classification = artifact.exportClassification.rows.find((entry) =>
      entry.exportName === 'investigateAsIntelligenceAgent');
    const anchors = new Map(artifact.sourceAnchors.map((anchor) => [anchor.id, anchor]));
    const references = row.clientCallTrace.sourceReferences.identifierOccurrences;

    assert.equal(row.classification, 'served-ui-path');
    assert.equal(row.productPath.surface, 'PrivateLoyaltyPanel');
    assert.match(row.productPath.invocation, /investigatePlayer service.*investigateAsIntelligenceAgent callable/);
    assert.match(row.actor.family, /active.*unreplaced.*Intelligence Agent/i);
    assert.match(row.requirements.summary, /canonical census.*suspicion of at least 6/i);
    assert.match(row.costs.summary, /one investigation per cycle.*adds 2 suspicion/i);
    assert.match(row.consequences.summary, /private report.*1–4.*5/i);
    assert.match(row.consequences.summary, /target.*true loyalty remains private/i);
    assert.match(row.blockers.summary, /wrong role\/group.*stale cycle/i);
    assert.match(row.nextActor.summary, /investigator.*private result/i);
    assert.match(row.guidance.summary, /mounted.*Investigate a player.*connected player.*fleet group/i);
    assert.equal(row.clientReferenceAliases[0], 'investigatePlayer');
    assert.equal(row.clientCallTrace.status, 'source-service-and-component-route-references');
    assert.ok(references.some((reference) => reference.path === 'src/components/PrivateLoyaltyPanel.tsx' &&
      reference.matchedSymbol === 'investigatePlayer'));
    assert.ok(row.clientCallTrace.sourceReferences.quotedOccurrences.some((reference) =>
      reference.path === 'src/lib/intelligenceInvestigationService.ts'));
    assert.equal(anchors.get('ending.investigateAsIntelligenceAgent.ui').symbol, 'PrivateLoyaltyPanel');
    assert.equal(anchors.get('ending.investigateAsIntelligenceAgent.rule1').symbol, 'AppRoutes');
    assert.ok(classification.clientTrace.importChainsToApp.some((chain) =>
      chain[0] === 'src/components/PrivateLoyaltyPanel.tsx' && chain.at(-1) === 'src/App.tsx'));
    assert.equal(classification.sourceClassification, 'served-ui-path');
    assert.equal(classification.acceptanceCredit, 0);
    assert.equal(artifact.coverageAccounting.callableRoleCellsReviewed, 0);
    assert.equal(artifact.coverageAccounting.gameplayAcceptanceCredit, 0);
    assert.equal(artifact.sourceBinding.runtimeChecks, 'not run');
  } finally {
    rmSync(temporaryDirectory, { recursive: true, force: true });
  }
});
