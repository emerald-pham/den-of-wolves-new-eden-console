import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';
import { classifyDeploymentRange, deploymentSelector } from './deployment-targets.mjs';

// The PC10.3 release on main (last successful deployment) and the PC10.4
// candidate whose Functions runtime source this audit pins.
const BASELINE = '8c25a9a6889475ecb139cfef72551b2688c891aa';
const CANDIDATE = '24e09e8c42c083bf1b60a1f2f45499aff3f40ed6';
const CANDIDATE_ALIAS = 'pc10-4-candidate';
const INVENTORY = 'scripts/pc10-4-deployment-consumers.json';
const TELEMETRY = 'functions/src/securityDenialTelemetry.ts';
const SHARED_REPORTING = 'functions/src/callableDenialReporting.ts';
const CASTING_TRANSPORT = 'functions/src/castingCallableTransport.ts';
const hash = source => createHash('sha256').update(source).digest('hex');

function gitSource(revision, file) {
  try {
    return execFileSync('git', ['show', `${revision}:${file}`], {
      encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 32 * 1024 * 1024,
    });
  } catch {
    if (revision === BASELINE) return '';
    throw new Error(`Missing exact PC10.4 source ${revision}:${file}`);
  }
}

function runtimeFiles() {
  return execFileSync('git', ['diff', '--name-only', BASELINE, CANDIDATE, '--', 'functions/src'], {
    encoding: 'utf8',
  }).trim().split('\n').filter(file => file && /\.(?:ts|js|mjs|cjs)$/.test(file) &&
    !/\.(?:test|spec)\.(?:ts|js|mjs|cjs)$/.test(file)).sort();
}

function inventory() {
  assert.ok(existsSync(INVENTORY), 'PC10.4 needs a pinned callable-consumer audit');
  return JSON.parse(readFileSync(INVENTORY, 'utf8'));
}

const auditFor = (audit, file) => file === 'functions/src/index.ts' ? audit.index : audit.modules[file];

// Independent of the selector's static maps: read the candidate's own exports.
const candidateIndex = () => gitSource(CANDIDATE, 'functions/src/index.ts');
const directOnCallExports = source => [...source.matchAll(/^export\s+const\s+(\w+)\s*=\s*onCall\s*[<(]/gm)]
  .map(match => match[1]).sort();
const wrapperModules = () => runtimeFiles().filter(file => file !== 'functions/src/index.ts' &&
  /import\s*\{[^}]*\bonCall\b[^}]*\}\s*from\s*'\.\/securityDenialTelemetry'/.test(gitSource(CANDIDATE, file)));

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

test('the PC10.4 entrypoint audit deploys every onCall export the telemetry wrapper now builds', () => {
  const audit = inventory();
  const exports = directOnCallExports(candidateIndex());
  assert.equal(exports.length, 207, 'the candidate entrypoint defines 207 callables');
  assert.match(candidateIndex(), /import \{ onCall \} from '\.\/securityDenialTelemetry';/);
  assert.deepEqual([...audit.index.consumers].sort(), exports);
});

test('every module callable built with the wrapper is audited, and the wrapper audit is their exact union', () => {
  const audit = inventory();
  const index = candidateIndex();
  const telemetry = new Set(audit.modules[TELEMETRY].consumers);
  const expected = new Set(directOnCallExports(index));
  for (const file of wrapperModules()) {
    const consumers = auditFor(audit, file)?.consumers;
    assert.ok(consumers?.length, `${file}: wrapped module callables are audited`);
    const source = gitSource(CANDIDATE, file);
    for (const name of directOnCallExports(source)) {
      if (!new RegExp(`export\\s*\\{[^}]*\\b${name}\\b[^}]*\\}\\s*from`).test(index)) continue;
      assert.ok(consumers.includes(name), `${file}: ${name} is deployed with the wrapper`);
      expected.add(name);
    }
    for (const [, factory] of source.matchAll(/^export\s+function\s+(\w+)\s*\([^)]*\)[^{]*\{\s*return\s+onCall\s*[<(]/gm)) {
      const built = new RegExp(`^export\\s+const\\s+(\\w+)\\s*=\\s*${factory}\\s*\\(`, 'm').exec(index)?.[1];
      assert.ok(built && consumers.includes(built), `${file}: factory ${factory} export is deployed with the wrapper`);
      expected.add(built);
    }
    for (const name of consumers) assert.ok(telemetry.has(name), `${name} is a wrapped callable`);
  }
  assert.equal(telemetry.size, 228);
  assert.deepEqual([...telemetry].sort(), [...expected].sort());
  assert.deepEqual([...audit.modules[SHARED_REPORTING].consumers].sort(),
    [...telemetry, 'castingCompanionCommand'].sort(), 'the shared reporting helper reaches casting too');
  assert.ok(!telemetry.has('castingCompanionCommand'), 'casting keeps its own SDK transport');
});

test('the exact PC10.4 source audit hashes every changed runtime file', () => {
  const audit = inventory();
  assert.equal(audit.schemaVersion, 1);
  assert.equal(audit.baseline, BASELINE);
  assert.equal(audit.candidate, CANDIDATE);
  const files = runtimeFiles();
  assert.deepEqual([...Object.keys(audit.modules), 'functions/src/index.ts'].sort(), files,
    'the PC10.4 candidate has a closed runtime inventory');
  for (const file of files) {
    const entry = auditFor(audit, file);
    assert.equal(entry.before, hash(gitSource(BASELINE, file)), `${file}: baseline digest`);
    assert.equal(entry.after, hash(gitSource(CANDIDATE, file)), `${file}: candidate digest`);
    assert.ok(entry.consumers.length > 0, `${file}: at least one traced consumer`);
  }
});

test('each changed PC10.4 Functions file selects its audited consumers and fails closed on drift', () => {
  const audit = inventory();
  for (const file of runtimeFiles()) {
    const expected = ['hosting', ...auditFor(audit, file).consumers.map(name => `functions:${name}`)].sort();
    assert.deepEqual(selectWith([file]).split(',').sort(), expected, `${file}: exact audited consumers`);
    // Casting transport sources always redeploy the casting command by their own rule.
    if (file === CASTING_TRANSPORT) continue;
    assert.throws(() => selectWith([file], file, `${gitSource(CANDIDATE, file)}\n// unaudited runtime drift\n`),
      /PC10\.4.*audit/i, `${file}: source drift must fail closed`);
  }
});

test('the PC10.4 release range selects every wrapped callable, the casting command, Hosting and rules', () => {
  const audit = inventory();
  const expected = new Set([...audit.index.consumers, ...Object.values(audit.modules).flatMap(entry => entry.consumers)]);
  assert.equal(expected.size, 229);
  const range = classifyDeploymentRange({ before: BASELINE, verificationBefore: BASELINE, after: CANDIDATE,
    currentMainTip: CANDIDATE });
  const targets = range.deployOnly.split(',');
  assert.ok(targets.includes('hosting'));
  assert.ok(targets.includes('firestore'), 'the PC10.4 rules change deploys');
  assert.equal(targets.includes('functions'), false, 'there is no broad Functions fallback');
  assert.deepEqual(targets.filter(target => target.startsWith('functions:')).map(target => target.slice(10)).sort(),
    [...expected].sort());
});
