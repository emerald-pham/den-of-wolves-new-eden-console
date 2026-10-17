import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { classifyChangedFiles, deploymentSelector } from './deployment-targets.mjs';

const BASELINE = 'aa2c89f5d369d42b94a91ecadaa4244d0d1c2d08';
const CANDIDATE = '2e822e31ef808b6766f3a09285ad17f79c20461a';
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
  'functions/src/index.ts': [
    'allocateHummingbirdHarvest', 'automaticallyResolveScoutRequest', 'buildEndeavourScienceDevice',
    'requestScout', 'resolvePendingScoutRequest', 'rollHummingbirdHarvest',
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
