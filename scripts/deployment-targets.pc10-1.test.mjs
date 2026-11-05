import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { classifyChangedFiles, deploymentSelector } from './deployment-targets.mjs';

const BASELINE = 'aa2c89f5d369d42b94a91ecadaa4244d0d1c2d08';
const CANDIDATE = '92c8db3ace3a0448dc28bd5292a704f400c06f5d';
const CANDIDATE_ALIAS = 'pc10-1-candidate';
const EMPTY_SOURCE_HASH = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';

const EXPECTED_CONSUMERS = {
  'functions/src/candidateAvailability.ts': [
    'allocateHummingbirdHarvest', 'rollHummingbirdHarvest',
  ],
  'functions/src/candidateRevealProjection.ts': [
    'adjudicateFailedJump', 'advanceTurn', 'assignReplacementRole', 'automaticallyResolveScoutRequest',
    'commitAwayMissionLifecycleCommand', 'confirmFleetPartition', 'confirmSetup', 'joinSession', 'jumpShip',
    'moveShipToLocation', 'resumeSession', 'resolvePendingScoutRequest', 'runMaintenance',
    'sendScoutTaxiTransfer', 'shareKnownSystemDetails', 'startGame', 'startSinglePlayerDemo',
  ],
  'functions/src/endeavourEcmDeviceWriter.ts': [
    'activateEndeavourEcmDevice', 'readEndeavourEcmDeviceWorkspace',
  ],
  'functions/src/endeavourResearchWriter.ts': [
    'advanceEndeavourResearchTrack', 'readEndeavourResearchWorkspace',
  ],
  'functions/src/endeavourScienceDeviceWriter.ts': ['buildEndeavourScienceDevice'],
  'functions/src/endeavourScienceDevices.ts': [
    'activateEndeavourEcmDevice', 'advanceEndeavourResearchTrack', 'buildEndeavourScienceDevice',
    'readEndeavourEcmDeviceWorkspace', 'readEndeavourResearchWorkspace', 'runWolfAgentDetectorTest',
  ],
  'functions/src/gorgoneionRepairDrones.ts': [
    'getCurrentMemberSession', 'joinSession', 'repairGorgoneionWithDrones', 'resumeSession',
  ],
  'functions/src/index.ts': [
    'allocateHummingbirdHarvest', 'automaticallyResolveScoutRequest', 'buildEndeavourScienceDevice',
    'requestScout', 'resolvePendingScoutRequest', 'rollHummingbirdHarvest',
  ],
  'functions/src/macawRepair.ts': ['repairConsolesFromMacaw'],
  'functions/src/publicShipSystems.ts': [
    'adjudicateFailedJump', 'dockVoyage33', 'getCurrentMemberSession', 'joinSession', 'jumpShip',
    'jumpVoyage33', 'moveShipToLocation', 'repairConsolesFromMacaw', 'repairGorgoneionWithDrones',
    'repairWarriorWithDrones', 'resumeSession',
  ],
  'functions/src/voyage33Movement.ts': [
    'adjudicateFailedJump', 'dockVoyage33', 'joinSession', 'jumpShip', 'jumpVoyage33',
    'moveShipToLocation', 'resumeSession',
  ],
  'functions/src/warriorRepairDrones.ts': [
    'getCurrentMemberSession', 'joinSession', 'repairWarriorWithDrones', 'resumeSession',
  ],
  'functions/src/wolfAgentDetectorWriter.ts': ['runWolfAgentDetectorTest'],
};

function gitSource(revision, file) {
  try {
    return execFileSync('git', ['show', `${revision}:${file}`], {
      encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 32 * 1024 * 1024,
    });
  } catch {
    if (revision === BASELINE) return '';
    throw new Error(`Missing exact PC10.1 source ${revision}:${file}`);
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

test('the prepared PC10.1 review entry is a Hosting deployment input', () => {
  const result = classifyChangedFiles(['pc10-1-review.html']);
  assert.deepEqual(result.targets, ['hosting']);
  assert.deepEqual(result.unknownFiles, []);
});

test('each changed PC10.1 Functions source transition selects its audited named consumers', () => {
  const files = runtimeFiles();
  assert.deepEqual(files, Object.keys(EXPECTED_CONSUMERS).sort(), 'The accepted candidate has a closed runtime inventory.');
  for (const file of files) {
    const expected = ['hosting', ...EXPECTED_CONSUMERS[file].map(name => `functions:${name}`)].sort();
    assert.deepEqual(selectOne(file).split(',').sort(), expected, `${file}: exact bounded consumers`);
    assert.throws(() => selectOne(file, `${gitSource(CANDIDATE, file)}\n// unaudited runtime drift\n`),
      /PC10\.1.*audit/i, `${file}: source drift must fail closed`);
  }
});

test('the exact PC10.1 source audit hashes every runtime file and the full range stays named', () => {
  const inventory = JSON.parse(readFileSync('scripts/pc10-1-deployment-consumers.json', 'utf8'));
  assert.equal(inventory.schemaVersion, 1);
  assert.equal(inventory.baseline, BASELINE);
  assert.equal(inventory.candidate, CANDIDATE);
  const hash = source => createHash('sha256').update(source).digest('hex');
  const files = runtimeFiles();
  for (const file of files) {
    const audit = file === 'functions/src/index.ts' ? inventory.index : inventory.modules[file];
    assert.ok(audit && Array.isArray(audit.consumers), `${file}: exact consumer audit required`);
    assert.deepEqual(audit.consumers, EXPECTED_CONSUMERS[file], `${file}: source-traced consumer list`);
    const previous = gitSource(BASELINE, file);
    assert.equal(audit.before, hash(previous), `${file}: baseline digest`);
    if (!previous) assert.equal(audit.before, EMPTY_SOURCE_HASH, `${file}: newly added PC10.1 module baseline`);
    assert.equal(audit.after, hash(gitSource(CANDIDATE, file)), `${file}: accepted-candidate digest`);
  }
  assert.deepEqual(Object.keys(inventory.modules).sort(), files.filter(file => file !== 'functions/src/index.ts'));
  const expectedNames = [...new Set(files.flatMap(file => EXPECTED_CONSUMERS[file]))]
    .sort().map(name => `functions:${name}`);
  const native = deploymentSelector({ before: BASELINE, after: CANDIDATE, files, targets: ['functions'] }).split(',');
  assert.deepEqual(native.sort(), ['hosting', ...expectedNames].sort());
  assert.equal(native.includes('functions'), false, 'There is no broad Functions fallback.');
});

// The #436 repair to recordCandidateDiscovery landed after the accepted PC10.1
// candidate, so it needs its own exact, source-traced consumer review. The
// consumers are the callables that reach withCandidateArrival (arrival
// discovery on movement) or commitScoutMapKnowledge (scout resolution) in
// functions/src/index.ts, the only importers of candidateDiscovery.ts.
const REPAIR_FILE = 'functions/src/systemHistory.ts';
const REPAIR_COMMIT = 'f185cb8003f5673111d371b215512876d27ce31b';
const REPAIR_CONSUMERS = [
  'adjudicateFailedJump', 'automaticallyResolveScoutRequest', 'jumpShip',
  'moveShipToLocation', 'resolvePendingScoutRequest',
];

function selectRepair(currentSource = gitSource(REPAIR_COMMIT, REPAIR_FILE), previousSource = gitSource(BASELINE, REPAIR_FILE)) {
  return deploymentSelector({
    before: BASELINE,
    after: 'post-candidate-repair',
    files: [REPAIR_FILE],
    targets: ['functions'],
    sourceAtRevision: (revision) => revision === BASELINE ? previousSource : currentSource,
    isAncestor: () => false,
  });
}

test('the candidate-discovery idempotence repair deploys exactly its source-traced callables', () => {
  assert.deepEqual(
    selectRepair().split(',').sort(),
    ['hosting', ...REPAIR_CONSUMERS.map(name => `functions:${name}`)].sort(),
  );
});

test('the candidate-discovery repair audit fails closed on drift or an unknown baseline', () => {
  assert.throws(() => selectRepair(`${gitSource(REPAIR_COMMIT, REPAIR_FILE)}\n// unaudited runtime drift\n`),
    /PC10\.1.*audit/i, 'a later edit needs a fresh consumer review');
  assert.throws(() => selectRepair(undefined, `${gitSource(BASELINE, REPAIR_FILE)}\n// another baseline\n`),
    /audited callable consumer map/i, 'an unknown previous version is not covered by the repair audit');
});
