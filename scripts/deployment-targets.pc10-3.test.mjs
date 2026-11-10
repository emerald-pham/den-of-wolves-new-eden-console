import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { deploymentSelector } from './deployment-targets.mjs';

const BASELINE = '396f2941a5ba213c725acf05516799274c164b7b';
const CANDIDATE = '330b5c61e6de827599e5e395fcc0ef5baa84bba0';
const CANDIDATE_ALIAS = 'pc10-3-candidate';
const EMPTY_SOURCE_HASH = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';

// Consumers are the exported callables whose runtime code reaches a changed
// top-level declaration, traced through TypeScript symbol references.
const MISSION_PUBLIC_PROJECTION_CONSUMERS = [
  'commitAwayMissionLifecycleCommand', 'dealPrivateInitialCards', 'discardPrivateMissionCard',
  'openPrivateMissionDiscards',
];
const EXPECTED_CONSUMERS = {
  'functions/src/awayMissionLifecycleAdapter.ts': MISSION_PUBLIC_PROJECTION_CONSUMERS,
  'functions/src/awayMissionLifecycleCallable.ts': ['commitAwayMissionLifecycleCommand'],
  'functions/src/missionCards.ts': MISSION_PUBLIC_PROJECTION_CONSUMERS,
  // Shared with the browser only; no deployed callable reaches it.
  'functions/src/missionSecretDifficulty.ts': [],
  // Only reconcileReturningSeat changed; joinSession and resumeSession call it.
  'functions/src/index.ts': ['joinSession', 'resumeSession'],
};

function gitSource(revision, file) {
  try {
    return execFileSync('git', ['show', `${revision}:${file}`], {
      encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 32 * 1024 * 1024,
    });
  } catch {
    if (revision === BASELINE) return '';
    throw new Error(`Missing exact PC10.3 source ${revision}:${file}`);
  }
}

function runtimeFiles() {
  return execFileSync('git', ['diff', '--name-only', BASELINE, CANDIDATE, '--', 'functions/src'], {
    encoding: 'utf8',
  }).trim().split('\n').filter(file => file && /\.(?:ts|js|mjs|cjs)$/.test(file) &&
    !/\.(?:test|spec)\.(?:ts|js|mjs|cjs)$/.test(file)).sort();
}

function selectWith(files, driftFile = null, driftSource = null) {
  return deploymentSelector({
    before: BASELINE,
    after: CANDIDATE_ALIAS,
    files,
    targets: ['functions'],
    sourceAtRevision: (revision, path) => revision === BASELINE
      ? gitSource(BASELINE, path)
      : path === driftFile ? driftSource : gitSource(CANDIDATE, path),
    isAncestor: () => false,
  });
}

test('each changed PC10.3 Functions source transition selects its traced named consumers', () => {
  const files = runtimeFiles();
  assert.deepEqual(files, Object.keys(EXPECTED_CONSUMERS).sort(), 'The PC10.3 candidate has a closed runtime inventory.');
  for (const file of files) {
    const consumers = EXPECTED_CONSUMERS[file];
    if (consumers.length === 0) {
      assert.throws(() => selectWith([file]), /no named callable deployment could be proven/i,
        `${file}: a browser-only shared module never selects a broad Functions deploy`);
      continue;
    }
    const expected = ['hosting', ...consumers.map(name => `functions:${name}`)].sort();
    assert.deepEqual(selectWith([file]).split(',').sort(), expected, `${file}: exact bounded consumers`);
  }
  for (const file of files) {
    assert.throws(() => selectWith(files, file, `${gitSource(CANDIDATE, file)}\n// unaudited runtime drift\n`),
      /PC10\.3.*audit/i, `${file}: source drift must fail closed`);
  }
});

test('the exact PC10.3 source audit hashes every audited runtime file and the full range stays named', () => {
  const files = runtimeFiles();
  const expectedNames = [...new Set(files.flatMap(file => EXPECTED_CONSUMERS[file]))]
    .sort().map(name => `functions:${name}`);
  const native = deploymentSelector({ before: BASELINE, after: CANDIDATE, files, targets: ['functions'] }).split(',');
  assert.deepEqual(native.sort(), ['hosting', ...expectedNames].sort());
  assert.equal(native.includes('functions'), false, 'There is no broad Functions fallback.');

  const inventory = JSON.parse(readFileSync('scripts/pc10-3-deployment-consumers.json', 'utf8'));
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
    if (!previous) assert.equal(audit.before, EMPTY_SOURCE_HASH, `${file}: newly added PC10.3 module baseline`);
    assert.equal(audit.after, hash(gitSource(CANDIDATE, file)), `${file}: candidate digest`);
  }
  assert.deepEqual(Object.keys(inventory.modules).sort(),
    Object.keys(EXPECTED_CONSUMERS).filter(file => file !== 'functions/src/index.ts').sort());
});
