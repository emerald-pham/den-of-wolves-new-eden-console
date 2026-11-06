import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { deploymentSelector } from './deployment-targets.mjs';

const BASELINE = '06f596cc8616bf571cb6b60e0184632ecdf2825b';
const CANDIDATE = '88f26dc1cce494718c4cf6e30b36f2aefc9e16ff';
const CANDIDATE_ALIAS = 'pc10-2-candidate';
const EMPTY_SOURCE_HASH = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';

// Consumers are the exported callables whose runtime code reaches a changed
// top-level declaration, traced through TypeScript symbol references.
const EXPECTED_CONSUMERS = {
  'functions/src/attackScrapPickups.ts': [
    'declareWolfAttack', 'getCurrentMemberSession', 'joinSession', 'resolveWolfAttackAftermath', 'resumeSession',
  ],
  'functions/src/awayMissionCards.ts': [
    'commitAwayMissionLifecycleCommand', 'dealPrivateInitialCards', 'discardPrivateMissionCard',
    'openPrivateMissionDiscards',
  ],
  'functions/src/awayMissionLifecycleAdapter.ts': [
    'commitAwayMissionLifecycleCommand', 'dealPrivateInitialCards', 'discardPrivateMissionCard',
    'openPrivateMissionDiscards',
  ],
  'functions/src/boaMissionReclamation.ts': [
    'commitAwayMissionLifecycleCommand', 'confirmFleetPartition', 'dealPrivateInitialCards',
    'discardPrivateMissionCard', 'openPrivateMissionDiscards',
  ],
  'functions/src/boaMissionReclamationCallable.ts': [
    'chooseBoaMissionReclamationOpportunity', 'readBoaMissionReclamationWorkspace',
  ],
  'functions/src/boaMissionReclamationContract.ts': [
    'commitAwayMissionLifecycleCommand', 'dealPrivateInitialCards', 'discardPrivateMissionCard',
    'openPrivateMissionDiscards',
  ],
  'functions/src/fighterWingExchange.ts': ['exchangeAegisFighterWings'],
  'functions/src/memberSession.ts': ['getCurrentMemberSession', 'joinSession', 'resumeSession'],
  'functions/src/missionEligibility.ts': [
    'chooseBoaMissionReclamationOpportunity', 'dealPrivateInitialCards', 'readBoaMissionReclamationWorkspace',
  ],
  'functions/src/missionRewardDelivery.ts': ['commitAwayMissionLifecycleCommand'],
  'functions/src/missionRewards.ts': [
    'commitAwayMissionLifecycleCommand', 'discardPrivateMissionCard', 'openPrivateMissionDiscards',
  ],
  'functions/src/permissionedDismantling.ts': [
    'applyPermissionedDismantling', 'consentToPermissionedDismantling', 'declinePermissionedDismantling',
    'proposePermissionedDismantling', 'revokePermissionedDismantlingConsent',
  ],
  'functions/src/permissionedDismantlingCallable.ts': [
    'applyPermissionedDismantling', 'consentToPermissionedDismantling', 'declinePermissionedDismantling',
    'proposePermissionedDismantling', 'revokePermissionedDismantlingConsent',
  ],
  'functions/src/wolfAttackAftermathCallable.ts': ['resolveWolfAttackAftermath'],
  'functions/src/index.ts': [
    'buildFighter', 'chooseBoaMissionReclamationOpportunity', 'commitAwayMissionLifecycleCommand',
    'confirmFleetPartition', 'dealPrivateInitialCards', 'declareWolfAttack', 'exchangeAegisFighterWings',
    'getCurrentMemberSession', 'getWolfBoardingSpecialChoice', 'joinSession',
    'readBoaMissionReclamationWorkspace', 'relayPdfColonelNews', 'resumeSession', 'sendFleetGroupMessage',
  ],
};

// These changed modules keep their existing mappings: module-level static
// lists for macawRepair.ts and pressLogEvent.ts, and the PC10.1 repair
// receipt for refineryFighterBay.ts.
const EXISTING_MAPPINGS = {
  'functions/src/macawRepair.ts': ['applyPermissionedDismantling', 'repairConsolesFromMacaw'],
  'functions/src/pressLogEvent.ts': [
    'addShipDamage', 'adjustShipPopulation', 'applyCommissarPurge', 'applyShipCounterSteps',
    'evacuateShuttleSurvivorsCommand', 'recordPresidentActionCommand', 'relayPdfColonelNews',
    'runMaintenance', 'runSmallShipMaintenance', 'runVoyage33Maintenance',
  ],
  'functions/src/refineryFighterBay.ts': [
    'advanceWolfAttackLifecycle', 'commitWolfEscortRangeActionChoice', 'commitWolfFighterRangeActionChoice',
    'commitWolfRangeSupportActionChoice', 'getPdfEscortWingLaunch', 'launchAegisFighterWing',
    'launchDioneMaliades', 'launchPdfEscortWing', 'passWolfFighterLaunchChoice',
    'refreshWolfAttackDecisionSummaryOnPlayerChange',
  ],
};

function gitSource(revision, file) {
  try {
    return execFileSync('git', ['show', `${revision}:${file}`], {
      encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 32 * 1024 * 1024,
    });
  } catch {
    if (revision === BASELINE) return '';
    throw new Error(`Missing exact PC10.2 source ${revision}:${file}`);
  }
}

function runtimeFiles() {
  return execFileSync('git', ['diff', '--name-only', BASELINE, CANDIDATE, '--', 'functions/src'], {
    encoding: 'utf8',
  }).trim().split('\n').filter(file => file && /\.(?:ts|js|mjs|cjs)$/.test(file) &&
    !/\.(?:test|spec)\.(?:ts|js|mjs|cjs)$/.test(file)).sort();
}

function selectOne(file, currentSource = gitSource(CANDIDATE, file)) {
  return deploymentSelector({
    before: BASELINE,
    after: CANDIDATE_ALIAS,
    files: [file],
    targets: ['functions'],
    sourceAtRevision: (revision, path) => revision === BASELINE
      ? gitSource(BASELINE, path)
      : path === file ? currentSource : gitSource(CANDIDATE, path),
    isAncestor: () => false,
  });
}

test('each changed PC10.2 Functions source transition selects its traced named consumers', () => {
  const files = runtimeFiles();
  const all = { ...EXPECTED_CONSUMERS, ...EXISTING_MAPPINGS };
  assert.deepEqual(files, Object.keys(all).sort(), 'The PC10.2 candidate has a closed runtime inventory.');
  for (const file of files) {
    const expected = ['hosting', ...all[file].map(name => `functions:${name}`)].sort();
    assert.deepEqual(selectOne(file).split(',').sort(), expected, `${file}: exact bounded consumers`);
  }
  for (const file of Object.keys(EXPECTED_CONSUMERS)) {
    assert.throws(() => selectOne(file, `${gitSource(CANDIDATE, file)}\n// unaudited runtime drift\n`),
      /PC10\.2.*audit/i, `${file}: source drift must fail closed`);
  }
});

test('the exact PC10.2 source audit hashes every audited runtime file and the full range stays named', () => {
  const inventory = JSON.parse(readFileSync('scripts/pc10-2-deployment-consumers.json', 'utf8'));
  assert.equal(inventory.schemaVersion, 1);
  assert.equal(inventory.baseline, BASELINE);
  assert.equal(inventory.candidate, CANDIDATE);
  const hash = source => createHash('sha256').update(source).digest('hex');
  for (const file of Object.keys(EXPECTED_CONSUMERS)) {
    const audit = file === 'functions/src/index.ts' ? inventory.index : inventory.modules[file];
    assert.ok(audit && Array.isArray(audit.consumers), `${file}: exact consumer audit required`);
    assert.deepEqual(audit.consumers, EXPECTED_CONSUMERS[file], `${file}: source-traced consumer list`);
    const previous = gitSource(BASELINE, file);
    assert.equal(audit.before, hash(previous), `${file}: baseline digest`);
    if (!previous) assert.equal(audit.before, EMPTY_SOURCE_HASH, `${file}: newly added PC10.2 module baseline`);
    assert.equal(audit.after, hash(gitSource(CANDIDATE, file)), `${file}: candidate digest`);
  }
  assert.deepEqual(Object.keys(inventory.modules).sort(),
    Object.keys(EXPECTED_CONSUMERS).filter(file => file !== 'functions/src/index.ts').sort());
  const files = runtimeFiles();
  const expectedNames = [...new Set(files.flatMap(file => ({ ...EXPECTED_CONSUMERS, ...EXISTING_MAPPINGS })[file]))]
    .sort().map(name => `functions:${name}`);
  const native = deploymentSelector({ before: BASELINE, after: CANDIDATE, files, targets: ['functions'] }).split(',');
  assert.deepEqual(native.sort(), ['hosting', ...expectedNames].sort());
  assert.equal(native.includes('functions'), false, 'There is no broad Functions fallback.');
});
