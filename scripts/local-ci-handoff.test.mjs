import assert from 'node:assert/strict';
import { chmodSync, copyFileSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { afterEach, test } from 'node:test';
import { buildCohort, runLocalCiHandoff } from './local-ci-handoff.mjs';
import { classifyRiskGates } from './risk-gates.mjs';

const sourceRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const fixtures = [];

afterEach(() => {
  for (const fixture of fixtures.splice(0)) rmSync(fixture.root, { recursive: true, force: true });
});

function git(cwd, ...args) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

function copyPolicyFile(root, relativePath) {
  const destination = join(root, relativePath);
  mkdirSync(dirname(destination), { recursive: true });
  copyFileSync(join(sourceRoot, relativePath), destination);
}

function createFixture({ commitMessage = 'test: handoff candidate', alteredWorkflow = false, changePath = 'scripts/fixture-change.mjs', withSubmodule = false } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'dow-local-ci-handoff-'));
  const bare = join(root, 'remote.git');
  const repo = join(root, 'repo');
  fixtures.push({ root });
  mkdirSync(repo);
  git(root, 'init', '--bare', bare);
  git(root, '--git-dir', bare, 'symbolic-ref', 'HEAD', 'refs/heads/main');
  git(repo, 'init', '-b', 'main');
  git(repo, 'config', 'user.name', 'CI Handoff Test');
  git(repo, 'config', 'user.email', 'ci-handoff@example.invalid');

  for (const path of [
    '.github/workflows/ci.yml',
    '.githooks/pre-push',
    'package.json',
    'package-lock.json',
    'functions/package.json',
    'functions/package-lock.json',
    'scripts/ci-changed-paths.mjs',
    'scripts/risk-gates.mjs',
    'scripts/tracker-paths.mjs',
    'scripts/install-git-hooks.mjs',
    'scripts/local-ci-handoff.mjs',
    'scripts/local-ci-handoff.test.mjs',
  ]) copyPolicyFile(repo, path);
  chmodSync(join(repo, '.githooks/pre-push'), 0o755);
  git(repo, 'config', 'core.hooksPath', '.githooks');
  let submodule;
  if (withSubmodule) {
    const bare = join(root, 'submodule.git');
    const seed = join(root, 'submodule-seed');
    mkdirSync(seed);
    git(root, 'init', '--bare', bare);
    git(bare, 'symbolic-ref', 'HEAD', 'refs/heads/main');
    git(seed, 'init', '-b', 'main');
    git(seed, 'config', 'user.name', 'CI Handoff Test');
    git(seed, 'config', 'user.email', 'ci-handoff@example.invalid');
    writeFileSync(join(seed, 'payload.txt'), 'published baseline\n');
    git(seed, 'add', 'payload.txt');
    git(seed, 'commit', '-m', 'test: seed submodule');
    git(seed, 'remote', 'add', 'origin', bare);
    git(seed, 'push', '-u', 'origin', 'main');
    submodule = {
      bare,
      path: 'functions/src/ci-handoff-fixture',
      baseSha: git(seed, 'rev-parse', 'HEAD'),
    };
    git(repo, '-c', 'protocol.file.allow=always', 'submodule', 'add', bare, submodule.path);
    const checkout = join(repo, submodule.path);
    git(checkout, 'switch', 'main');
    git(checkout, 'branch', '--set-upstream-to=origin/main', 'main');
    git(checkout, 'config', 'user.name', 'CI Handoff Test');
    git(checkout, 'config', 'user.email', 'ci-handoff@example.invalid');
  }
  if (alteredWorkflow) {
    writeFileSync(join(repo, '.github/workflows/ci.yml'), '\n# unreviewed workflow change\n', { flag: 'a' });
  }
  git(repo, 'add', '-A');
  git(repo, 'commit', '-m', 'test: seed supported CI contract');
  git(repo, 'remote', 'add', 'origin', bare);
  git(repo, 'push', '-u', 'origin', 'main');
  git(repo, 'fetch', 'origin', 'main');
  git(repo, 'switch', '-c', 'topic/ci-handoff');
  mkdirSync(dirname(join(repo, changePath)), { recursive: true });
  writeFileSync(join(repo, changePath), 'export const candidate = true;\n');
  git(repo, 'add', changePath);
  git(repo, 'commit', '-m', commitMessage);
  const headSha = git(repo, 'rev-parse', 'HEAD');
  return { root, bare, repo, headSha, submodule };
}

function successfulCommand(command) {
  const npmScript = command.program === 'npm' && command.args[0] === 'run' ? command.args[1] : '';
  const nodeTestScripts = new Set([
    'test:typography:release-gate',
    'test:proof-preflight',
    'test:branch-cleanup',
    'test:prompt-tracker',
    'security:threat-model',
    'test:proof-redalert-browser',
  ]);
  if ((command.program === process.execPath && command.args[0] === '--test') || nodeTestScripts.has(npmScript)) {
    return {
      exitCode: 0,
      signal: null,
      stdout: 'TAP version 13\n# Subtest: controlled test\nok 1 - controlled test\n1..1\n# tests 1\n# suites 0\n# pass 1\n# fail 0\n# cancelled 0\n# skipped 0\n# todo 0\n# duration_ms 1.25\n',
      stderr: '',
    };
  }
  if (['test:unit', 'test:functions', 'test:rules', 'test:font-consistency'].includes(npmScript)) {
    return {
      exitCode: 0,
      signal: null,
      stdout: ' Test Files 1 passed (1)\n      Tests 1 passed (1)\n   Duration 1.00s\n',
      stderr: '',
    };
  }
  if (npmScript === 'test:ticker:browser') {
    const cases = Array.from({ length: 24 }, (_, index) => `Ticker browser smoke passed: controlled/${index}\n`).join('');
    return {
      exitCode: 0,
      signal: null,
      stdout: `${cases}Ticker lifecycle browser proof passed: controlled-normal.json\nTicker reduced lifecycle browser proof passed: controlled-reduced.json\n`,
      stderr: '',
    };
  }
  if (npmScript === 'test:typography:browser') {
    return {
      exitCode: 0,
      signal: null,
      stdout: 'Rendered typography gate passed: 1 PC01 cases, 1 surfaces, 1 Voyage metadata renders, 1 viewports, normal/reduced motion.\nExact PC01 comparison evidence: controlled/results.json\n',
      stderr: '',
    };
  }
  if (npmScript === 'test:cycle-briefing:browser') {
    return { exitCode: 0, signal: null, stdout: 'PASS 6 production-built consumer renders; actual painted font evidence: controlled/metrics.json\n', stderr: '' };
  }
  return { exitCode: 0, signal: null, stdout: 'controlled command completed\n', stderr: '' };
}

function successfulAdapter(calls, customize = (command) => successfulCommand(command)) {
  return async (command) => {
    calls.push(command);
    return customize(command, calls.length);
  };
}

function runFixtureHandoff(fixture, options = {}) {
  return runLocalCiHandoff({
    cwd: fixture.repo,
    attemptRoot: join(fixture.root, 'attempts'),
    ...options,
  });
}

test('a complete local cohort hands off the exact tested SHA through the ordinary push hook', async () => {
  const fixture = createFixture();
  const calls = [];
  const result = await runFixtureHandoff(fixture, {
    runCommand: successfulAdapter(calls),
  });

  assert.equal(result.headSha, fixture.headSha);
  assert.equal(result.remoteSha, fixture.headSha);
  assert.equal(result.remoteBranch, 'topic/ci-handoff');
  assert.equal(git(fixture.repo, 'ls-remote', 'origin', 'refs/heads/topic/ci-handoff').split('\t')[0], fixture.headSha);
  const chromiumInstallArgs = process.platform === 'linux'
    ? ['playwright', 'install', '--with-deps', 'chromium']
    : ['playwright', 'install', 'chromium'];
  assert.deepEqual(calls, [
    { label: 'Install locked root dependencies for release contracts', program: 'npm', args: ['ci', '--prefer-offline', '--no-audit'], env: {} },
    { label: 'Typography release-gate contract', program: 'npm', args: ['run', 'test:typography:release-gate'], env: {} },
    { label: 'Bounded proof-tool contract preflight', program: 'npm', args: ['run', 'test:proof-preflight'], env: {} },
    { label: 'Branch cleanup safeguards', program: 'npm', args: ['run', 'test:branch-cleanup'], env: {} },
    { label: 'Firebase deployment batching contract', program: process.execPath, args: ['--test', 'scripts/deploy-firebase-surfaces.test.mjs'], env: {} },
    { label: 'Local CI handoff contract', program: process.execPath, args: ['--test', 'scripts/local-ci-handoff.test.mjs'], env: {} },
    { label: 'Validate runtime threat model', program: 'npm', args: ['run', 'security:threat-model'], env: {} },
    { label: 'Lint', program: 'npm', args: ['run', 'lint'], env: {} },
    { label: 'Unit tests', program: 'npm', args: ['run', 'test:unit'], env: {} },
    { label: 'Install Playwright Chromium for proof-tool browser smoke', program: 'npx', args: chromiumInstallArgs, env: {} },
    { label: 'Fleetwide Red Alert selector browser smoke', program: 'npm', args: ['run', 'test:proof-redalert-browser'], env: {} },
  ]);
});

test('the local plan keeps DoW path-scope selection aligned with the workflow', async (t) => {
  const labels = (files) => buildCohort(classifyRiskGates(files), 'darwin').map(({ label }) => label);
  const common = [
    'Install locked root dependencies for release contracts',
    'Typography release-gate contract',
    'Bounded proof-tool contract preflight',
    'Branch cleanup safeguards',
    'Firebase deployment batching contract',
    'Local CI handoff contract',
  ];

  await t.test('documentation scope', () => {
    assert.deepEqual(labels(['docs/IMPLEMENTATION_PLAN.md']), [
      ...common,
      'Check prompt catalog and generated views',
      'Validate documentation',
      'Validate runtime threat model',
    ]);
  });
  await t.test('functions scope', () => {
    assert.deepEqual(labels(['functions/src/index.ts']), [
      ...common,
      'Validate runtime threat model',
      'Install locked Functions dependencies',
      'Lint',
      'Functions tests',
      'Build functions',
      'Verify Functions runtime artifact',
    ]);
  });
  await t.test('Firestore scope', () => {
    assert.deepEqual(labels(['firestore.rules']), [
      ...common,
      'Validate runtime threat model',
      'Lint',
      'Firestore security-rule tests',
    ]);
  });
  await t.test('typography and web scope', () => {
    assert.deepEqual(labels(['src/index.css']), [
      ...common,
      'Validate runtime threat model',
      'Install locked Functions dependencies',
      'Lint',
      'Unit tests',
      'Build web',
      'Console font consistency',
      'Install rendered typography browser',
      'Fleetwide Red Alert selector browser smoke',
      'Computed-style typography gate',
      'Production-built cycle briefing typography',
      'Browser ticker smoke',
      'Render-performance baselines',
      'Check web bundle size',
    ]);
  });
});

test('a failed or cancelled required stage blocks handoff', async (t) => {
  for (const [name, result] of [
    ['failed', { exitCode: 1, signal: null, stdout: '', stderr: 'test failure' }],
    ['cancelled', { exitCode: null, signal: 'SIGTERM', stdout: '', stderr: '' }],
    ['incomplete result', undefined],
  ]) {
    await t.test(name, async () => {
      const fixture = createFixture();
      const calls = [];
      await assert.rejects(runFixtureHandoff(fixture, {
        runCommand: successfulAdapter(calls, (command, index) => index === 1 ? result : successfulCommand(command)),
      }), /failed|cancelled|incomplete/i);
      assert.equal(git(fixture.repo, 'ls-remote', 'origin', 'refs/heads/topic/ci-handoff'), '');
    });
  }
});

test('a required test cohort reporting skipped tests blocks handoff', async () => {
  const fixture = createFixture();
  const calls = [];
  await assert.rejects(runFixtureHandoff(fixture, {
    runCommand: successfulAdapter(calls, (command) => command.label === 'Unit tests'
      ? { ...successfulCommand(command), stdout: 'Tests 1 passed | 1 skipped (2)\n' }
      : successfulCommand(command)),
  }), /skip/i);
  assert.equal(git(fixture.repo, 'ls-remote', 'origin', 'refs/heads/topic/ci-handoff'), '');
});

test('incomplete or unsuccessful runner summaries block handoff even when the process exits zero', async (t) => {
  const tap = (counts) => `TAP version 13\n# Subtest: controlled test\nok 1 - controlled test\n1..1\n# tests ${counts.tests}\n# suites 0\n# pass ${counts.pass}\n# fail ${counts.fail}\n# cancelled ${counts.cancelled}\n# skipped ${counts.skipped}\n# todo ${counts.todo}\n# duration_ms 1.25\n`;
  const invalidResults = [
    ['empty output', '', /TAP|summary|complete|result/i],
    ['truncated TAP', 'TAP version 13\n# Subtest: controlled test\nok 1 - controlled test\n', /TAP|summary|complete|result/i],
    ['reported failure', tap({ tests: 2, pass: 1, fail: 1, cancelled: 0, skipped: 0, todo: 0 }), /fail|unsuccessful|summary/i],
    ['reported cancellation', tap({ tests: 2, pass: 1, fail: 0, cancelled: 1, skipped: 0, todo: 0 }), /cancel|unsuccessful|summary/i],
    ['zero tests executed', tap({ tests: 0, pass: 0, fail: 0, cancelled: 0, skipped: 0, todo: 0 }), /test|nonzero|summary/i],
  ];

  for (const [name, stdout, expectedError] of invalidResults) {
    await t.test(name, async () => {
      const fixture = createFixture();
      const calls = [];
      await assert.rejects(runFixtureHandoff(fixture, {
        runCommand: successfulAdapter(calls, (command) => command.label === 'Firebase deployment batching contract'
          ? { exitCode: 0, signal: null, stdout, stderr: '' }
          : successfulCommand(command)),
      }), expectedError);
      assert.equal(git(fixture.repo, 'ls-remote', 'origin', 'refs/heads/topic/ci-handoff'), '');
    });
  }
});

test('Vitest stages require a complete nonzero successful test summary', async (t) => {
  const invalidOutputs = [
    ['empty Vitest output', '', /Vitest|summary|complete|result/i],
    ['zero tests', ' Test Files 1 passed (1)\n      Tests 0 passed (0)\n   Duration 1.00s\n', /test|nonzero|summary/i],
    ['reported failure with exit zero', ' Test Files 1 failed (1)\n      Tests 1 failed (1)\n   Duration 1.00s\n', /fail|unsuccessful|summary/i],
    ['truncated summary', '      Tests 1 passed (1)\n', /Vitest|summary|complete|result/i],
  ];
  for (const [name, stdout, expectedError] of invalidOutputs) {
    await t.test(name, async () => {
      const fixture = createFixture();
      await assert.rejects(runFixtureHandoff(fixture, {
        runCommand: successfulAdapter([], (command) => command.label === 'Unit tests'
          ? { exitCode: 0, signal: null, stdout, stderr: '' }
          : successfulCommand(command)),
      }), expectedError);
      assert.equal(git(fixture.repo, 'ls-remote', 'origin', 'refs/heads/topic/ci-handoff'), '');
    });
  }
});

test('custom browser stages require their complete nonzero success reports', async (t) => {
  const cases = [
    {
      name: 'ticker smoke',
      changePath: 'src/styles/starmap.css',
      stageLabel: 'Browser ticker smoke',
      invalidOutput: 'Ticker browser smoke passed: press/pending/normal/390x844\n',
    },
    {
      name: 'typography gate',
      changePath: 'src/index.css',
      stageLabel: 'Computed-style typography gate',
      invalidOutput: 'Rendered typography gate passed: 0 PC01 cases, 0 surfaces, 0 Voyage metadata renders, 0 viewports.\n',
    },
    {
      name: 'cycle briefing render',
      changePath: 'src/index.css',
      stageLabel: 'Production-built cycle briefing typography',
      invalidOutput: 'PASS 0 production-built consumer renders; actual painted font evidence: controlled/metrics.json\n',
    },
  ];
  for (const { name, changePath, stageLabel, invalidOutput } of cases) {
    await t.test(name, async () => {
      const fixture = createFixture({ changePath });
      await assert.rejects(runFixtureHandoff(fixture, {
        runCommand: successfulAdapter([], (command) => command.label === stageLabel
          ? { exitCode: 0, signal: null, stdout: invalidOutput, stderr: '' }
          : successfulCommand(command)),
      }), /browser|summary|complete|passed|render|nonzero|proof/i);
      assert.equal(git(fixture.repo, 'ls-remote', 'origin', 'refs/heads/topic/ci-handoff'), '');
    });
  }
});

test('an inherited npm node-options override cannot narrow the required cohort', async () => {
  const fixture = createFixture();
  const calls = [];
  const previous = process.env.npm_config_node_options;
  process.env.npm_config_node_options = '--test-name-pattern=only-one-test';
  try {
    await assert.rejects(runFixtureHandoff(fixture, {
      runCommand: successfulAdapter(calls),
    }), /lifecycle|node-options|override/i);
  } finally {
    if (previous === undefined) delete process.env.npm_config_node_options;
    else process.env.npm_config_node_options = previous;
  }
  assert.equal(calls.length, 0);
  assert.equal(git(fixture.repo, 'ls-remote', 'origin', 'refs/heads/topic/ci-handoff'), '');
});

test('ticker smoke narrowing environment overrides are rejected before cohort execution', async (t) => {
  for (const [key, value] of [
    ['TICKER_SMOKE_SHARD', 'press'],
    ['TICKER_SMOKE_ONLY_LIFECYCLE', '1'],
    ['TICKER_SMOKE_ONLY_REDUCED_LIFECYCLE', '1'],
  ]) {
    await t.test(key, async () => {
      const fixture = createFixture();
      const calls = [];
      const previous = process.env[key];
      process.env[key] = value;
      try {
        await assert.rejects(runFixtureHandoff(fixture, {
          runCommand: successfulAdapter(calls),
        }), /TICKER_SMOKE|narrow|override|scope/i);
      } finally {
        if (previous === undefined) delete process.env[key];
        else process.env[key] = previous;
      }
      assert.equal(calls.length, 0);
      assert.equal(git(fixture.repo, 'ls-remote', 'origin', 'refs/heads/topic/ci-handoff'), '');
    });
  }
});

test('the local cohort uses the complete platform-specific Chromium install command at every browser install stage', () => {
  const profiles = [
    ['scripts/local-ci-handoff.mjs', ['Install Playwright Chromium for proof-tool browser smoke']],
    ['src/index.css', ['Install rendered typography browser']],
    ['src/styles/starmap.css', [
      'Install Playwright Chromium for proof-tool browser smoke',
      'Install ticker smoke browser',
    ]],
  ];
  for (const platform of ['linux', 'darwin']) {
    const expectedArgs = platform === 'linux'
      ? ['playwright', 'install', '--with-deps', 'chromium']
      : ['playwright', 'install', 'chromium'];
    for (const [changedPath, expectedLabels] of profiles) {
      const browserInstall = buildCohort(classifyRiskGates([changedPath]), platform)
        .filter((command) => /Install .* Chromium|Install rendered typography browser|Install ticker smoke browser/.test(command.label));
      assert.deepEqual(browserInstall.map(({ label, program, args }) => ({ label, program, args })),
        expectedLabels.map((label) => ({ label, program: 'npx', args: expectedArgs })),
        `${platform} ${changedPath}`);
    }
  }
});

test('concealed index edits to the handoff tool are rejected before CI', async (t) => {
  for (const [flag, label] of [['--assume-unchanged', 'assume-unchanged'], ['--skip-worktree', 'skip-worktree']]) {
    await t.test(label, async () => {
      const fixture = createFixture();
      const toolPath = 'scripts/local-ci-handoff.mjs';
      writeFileSync(join(fixture.repo, toolPath), 'export const alteredHandoffTool = true;\n');
      git(fixture.repo, 'update-index', flag, toolPath);
      assert.equal(git(fixture.repo, 'status', '--porcelain'), '');
      const calls = [];
      await assert.rejects(runFixtureHandoff(fixture, {
        runCommand: successfulAdapter(calls),
      }), /index|concealed|assume-unchanged|skip-worktree/i);
      assert.equal(calls.length, 0);
      assert.equal(git(fixture.repo, 'ls-remote', 'origin', 'refs/heads/topic/ci-handoff'), '');
    });
  }
});

test('push.followTags cannot publish an annotated tag outside the candidate branch', async () => {
  const fixture = createFixture();
  git(fixture.repo, 'tag', '-a', 'handoff-extra-tag', '-m', 'must not be published');
  git(fixture.repo, 'config', 'push.followTags', 'true');
  const calls = [];
  const result = await runFixtureHandoff(fixture, {
    runCommand: successfulAdapter(calls),
  });

  assert.equal(result.remoteSha, fixture.headSha);
  assert.equal(git(fixture.repo, 'ls-remote', '--tags', 'origin', 'refs/tags/handoff-extra-tag'), '');
});

test('push.recurseSubmodules cannot publish a submodule commit as a side effect', async () => {
  const fixture = createFixture({ withSubmodule: true });
  const submoduleCheckout = join(fixture.repo, fixture.submodule.path);
  git(submoduleCheckout, 'config', 'user.name', 'CI Handoff Test');
  git(submoduleCheckout, 'config', 'user.email', 'ci-handoff@example.invalid');
  writeFileSync(join(submoduleCheckout, 'payload.txt'), 'unpublished candidate commit\n');
  git(submoduleCheckout, 'add', 'payload.txt');
  git(submoduleCheckout, 'commit', '-m', 'test: leave submodule commit unpublished');
  git(fixture.repo, 'add', fixture.submodule.path);
  git(fixture.repo, 'commit', '-m', 'test: reference a new submodule commit');
  git(fixture.repo, 'config', 'push.recurseSubmodules', 'on-demand');

  const calls = [];
  await assert.doesNotReject(runFixtureHandoff(fixture, {
    runCommand: successfulAdapter(calls),
  }), 'the branch handoff should proceed without recursively publishing submodule refs');

  assert.equal(git(fixture.submodule.bare, 'rev-parse', 'refs/heads/main'), fixture.submodule.baseSha);
  assert.equal(git(fixture.repo, 'ls-remote', 'origin', 'refs/heads/topic/ci-handoff').split('\t')[0], git(fixture.repo, 'rev-parse', 'HEAD'));
});

test('a distinct origin push URL is rejected before local tests or remote publication', async () => {
  const fixture = createFixture();
  const alternate = join(fixture.root, 'alternate.git');
  git(fixture.root, 'init', '--bare', alternate);
  git(alternate, 'symbolic-ref', 'HEAD', 'refs/heads/main');
  git(fixture.repo, 'config', '--add', 'remote.origin.pushurl', alternate);
  const calls = [];

  await assert.rejects(runFixtureHandoff(fixture, { runCommand: successfulAdapter(calls) }));

  assert.deepEqual({
    commandCount: calls.length,
    alternateCandidate: git(fixture.repo, 'ls-remote', alternate, 'refs/heads/topic/ci-handoff'),
  }, { commandCount: 0, alternateCandidate: '' });
});

test('multiple origin push URLs are rejected before any destination receives the candidate', async () => {
  const fixture = createFixture();
  const alternates = [join(fixture.root, 'alternate-one.git'), join(fixture.root, 'alternate-two.git')];
  for (const alternate of alternates) {
    git(fixture.root, 'init', '--bare', alternate);
    git(alternate, 'symbolic-ref', 'HEAD', 'refs/heads/main');
    git(fixture.repo, 'config', '--add', 'remote.origin.pushurl', alternate);
  }
  const calls = [];

  await assert.rejects(runFixtureHandoff(fixture, { runCommand: successfulAdapter(calls) }));

  assert.deepEqual({
    commandCount: calls.length,
    candidates: alternates.map((alternate) => git(fixture.repo, 'ls-remote', alternate, 'refs/heads/topic/ci-handoff')),
  }, { commandCount: 0, candidates: ['', ''] });
});

test('a completed handoff records private exact-input metadata and each raw runner result outside the repository', async () => {
  const fixture = createFixture();
  const calls = [];
  const result = await runFixtureHandoff(fixture, { runCommand: successfulAdapter(calls) });
  const attemptInfo = statSync(result.attemptDir);
  const manifestInfo = statSync(join(result.attemptDir, 'attempt.json'));
  const manifest = JSON.parse(readFileSync(join(result.attemptDir, 'attempt.json'), 'utf8'));
  const records = readFileSync(join(result.attemptDir, 'results.ndjson'), 'utf8')
    .trim().split('\n').map((line) => JSON.parse(line));

  assert.ok(relative(fixture.repo, result.attemptDir).startsWith('..'), 'attempt output must be outside the source tree');
  assert.equal(attemptInfo.mode & 0o777, 0o700);
  assert.equal(manifestInfo.mode & 0o777, 0o600);
  assert.equal(manifest.status, 'completed');
  assert.equal(manifest.source.headSha, result.headSha);
  assert.equal(manifest.source.treeSha, result.treeSha);
  assert.equal(manifest.base.sha, result.baseSha);
  assert.equal(manifest.policyFingerprint, result.policyFingerprint);
  assert.equal(manifest.config.pushUrlCount, 1);
  assert.equal(manifest.config.pushUrlMatchesFetch, true);
  assert.deepEqual(manifest.config.tickerSmoke, {
    TICKER_SMOKE_SHARD: null,
    TICKER_SMOKE_ONLY_LIFECYCLE: null,
    TICKER_SMOKE_ONLY_REDUCED_LIFECYCLE: null,
  });
  assert.deepEqual(manifest.plan, calls);
  assert.equal(records.length, calls.length);
  assert.ok(records.some((record) => record.result.stdout.includes('TAP version 13')));
  assert.equal(manifest.push.status, 'confirmed');
});

test('failed stages leave their raw result and failure state in the private attempt record', async () => {
  const fixture = createFixture();
  const calls = [];
  await assert.rejects(runFixtureHandoff(fixture, {
    runCommand: successfulAdapter(calls, (command) => command.label === 'Firebase deployment batching contract'
      ? { exitCode: 1, signal: null, stdout: 'controlled raw stdout', stderr: 'controlled raw stderr' }
      : successfulCommand(command)),
  }), /failed/i);

  const attempts = readdirSync(join(fixture.root, 'attempts'));
  assert.equal(attempts.length, 1);
  const attemptDir = join(fixture.root, 'attempts', attempts[0]);
  const manifest = JSON.parse(readFileSync(join(attemptDir, 'attempt.json'), 'utf8'));
  const records = readFileSync(join(attemptDir, 'results.ndjson'), 'utf8')
    .trim().split('\n').map((line) => JSON.parse(line));
  const failedStage = records.find((record) => record.command.label === 'Firebase deployment batching contract');
  assert.equal(manifest.status, 'failed');
  assert.equal(manifest.currentStage.label, 'Firebase deployment batching contract');
  assert.equal(failedStage.result.exitCode, 1);
  assert.equal(failedStage.result.stdout, 'controlled raw stdout');
  assert.equal(failedStage.result.stderr, 'controlled raw stderr');
  assert.equal(manifest.push.status, 'not-attempted');
});

test('incomplete stage results are persisted with an incomplete attempt state', async () => {
  const fixture = createFixture();
  const calls = [];
  await assert.rejects(runFixtureHandoff(fixture, {
    runCommand: successfulAdapter(calls, (command) => command.label === 'Firebase deployment batching contract'
      ? undefined
      : successfulCommand(command)),
  }), /incomplete/i);

  const attempts = readdirSync(join(fixture.root, 'attempts'));
  assert.equal(attempts.length, 1);
  const attemptDir = join(fixture.root, 'attempts', attempts[0]);
  const manifest = JSON.parse(readFileSync(join(attemptDir, 'attempt.json'), 'utf8'));
  const records = readFileSync(join(attemptDir, 'results.ndjson'), 'utf8')
    .trim().split('\n').map((line) => JSON.parse(line));
  const incompleteStage = records.find((record) => record.command.label === 'Firebase deployment batching contract');
  assert.equal(manifest.status, 'failed');
  assert.equal(manifest.currentStage.label, 'Firebase deployment batching contract');
  assert.equal(incompleteStage.outcome, 'incomplete');
  assert.equal(incompleteStage.result, null);
});

test('an unconfirmed push with the exact candidate at origin is retained as uncertain', async () => {
  const fixture = createFixture();
  const fakeBin = join(fixture.root, 'fake-bin');
  mkdirSync(fakeBin);
  const realGit = execFileSync('which', ['git'], { encoding: 'utf8' }).trim();
  const wrapperPath = join(fakeBin, 'git');
  writeFileSync(wrapperPath, `#!/bin/sh\nreal_git=${realGit}\nif [ "$1" = "push" ]; then\n  shift\n  "$real_git" push "$@"\n  status=$?\n  if [ "$status" -eq 0 ]; then\n    echo controlled-client-loss-after-remote-update >&2\n    exit 75\n  fi\n  exit "$status"\nfi\nexec "$real_git" "$@"\n`);
  chmodSync(wrapperPath, 0o755);
  const calls = [];
  const previousPath = process.env.PATH;
  process.env.PATH = `${fakeBin}:${previousPath ?? ''}`;
  try {
    await assert.rejects(runFixtureHandoff(fixture, {
      runCommand: successfulAdapter(calls),
    }), /uncertain/i);
  } finally {
    if (previousPath === undefined) delete process.env.PATH;
    else process.env.PATH = previousPath;
  }

  const attempts = readdirSync(join(fixture.root, 'attempts'));
  assert.equal(attempts.length, 1);
  const attemptDir = join(fixture.root, 'attempts', attempts[0]);
  const manifest = JSON.parse(readFileSync(join(attemptDir, 'attempt.json'), 'utf8'));
  const pushRecord = readFileSync(join(attemptDir, 'results.ndjson'), 'utf8')
    .trim().split('\n').map((line) => JSON.parse(line)).find((record) => record.kind === 'push');
  assert.equal(manifest.push.status, 'uncertain');
  assert.equal(manifest.push.candidateSha, fixture.headSha);
  assert.equal(manifest.push.observedRemoteSha, fixture.headSha);
  assert.equal(pushRecord.result.exitCode, 75);
  assert.match(pushRecord.result.stderr, /controlled-client-loss-after-remote-update/);
});

test('dirty worktrees are rejected before running any CI stage', async () => {
  const fixture = createFixture();
  writeFileSync(join(fixture.repo, 'scripts/fixture-change.mjs'), 'uncommitted drift\n');
  const calls = [];
  await assert.rejects(runFixtureHandoff(fixture, {
    runCommand: successfulAdapter(calls),
  }), /clean|dirty/i);
  assert.equal(calls.length, 0);
  assert.equal(git(fixture.repo, 'ls-remote', 'origin', 'refs/heads/topic/ci-handoff'), '');
});

test('worktree or HEAD drift during a stage stops the remaining cohort and push', async (t) => {
  await t.test('dirty tree', async () => {
    const fixture = createFixture();
    const calls = [];
    await assert.rejects(runFixtureHandoff(fixture, {
      runCommand: successfulAdapter(calls, (command) => {
        writeFileSync(join(fixture.repo, 'scripts/fixture-change.mjs'), 'drift during tests\n');
        return successfulCommand(command);
      }),
    }), /drift|clean|changed/i);
    assert.equal(calls.length, 1);
    assert.equal(git(fixture.repo, 'ls-remote', 'origin', 'refs/heads/topic/ci-handoff'), '');
  });

  await t.test('new commit', async () => {
    const fixture = createFixture();
    const calls = [];
    await assert.rejects(runFixtureHandoff(fixture, {
      runCommand: successfulAdapter(calls, (command) => {
        writeFileSync(join(fixture.repo, 'scripts/fixture-change.mjs'), 'new candidate\n');
        git(fixture.repo, 'add', 'scripts/fixture-change.mjs');
        git(fixture.repo, 'commit', '-m', 'test: concurrent candidate change');
        return successfulCommand(command);
      }),
    }), /HEAD|revision|changed|drift/i);
    assert.equal(calls.length, 1);
    assert.equal(git(fixture.repo, 'ls-remote', 'origin', 'refs/heads/topic/ci-handoff'), '');
  });

  await t.test('CI command configuration', async () => {
    const fixture = createFixture();
    const calls = [];
    await assert.rejects(runFixtureHandoff(fixture, {
      runCommand: successfulAdapter(calls, (command) => {
        writeFileSync(join(fixture.repo, 'package.json'), '{}\n');
        return successfulCommand(command);
      }),
    }), /clean|changed|configuration/i);
    assert.equal(calls.length, 1);
    assert.equal(git(fixture.repo, 'ls-remote', 'origin', 'refs/heads/topic/ci-handoff'), '');
  });
});

test('unreviewed workflow contents fail closed before any CI stage', async () => {
  const fixture = createFixture({ alteredWorkflow: true });
  const calls = [];
  await assert.rejects(runFixtureHandoff(fixture, {
    runCommand: successfulAdapter(calls),
  }), /workflow|supported|fingerprint|plan/i);
  assert.equal(calls.length, 0);
  assert.equal(git(fixture.repo, 'ls-remote', 'origin', 'refs/heads/topic/ci-handoff'), '');
});

test('paths excluded by the GitHub Actions trigger are rejected before local work', async () => {
  const fixture = createFixture({ changePath: 'docs/notes.md' });
  const calls = [];
  await assert.rejects(runFixtureHandoff(fixture, {
    runCommand: successfulAdapter(calls),
  }), /do not trigger|workflow|remote CI/i);
  assert.equal(calls.length, 0);
  assert.equal(git(fixture.repo, 'ls-remote', 'origin', 'refs/heads/topic/ci-handoff'), '');
});

test('GitHub Actions skip directives are refused before running CI', async (t) => {
  for (const message of [
    'test: skip [skip ci]',
    'test: skip [ci skip]',
    'test: skip [no ci]',
    'test: skip [skip actions]',
    'test: skip [actions skip]',
    'test: skip\n\nskip-checks:true',
    'test: skip\n\nskip-checks: true',
  ]) {
    await t.test(message.split('\n')[0], async () => {
      const fixture = createFixture({ commitMessage: message });
      const calls = [];
      await assert.rejects(runFixtureHandoff(fixture, {
        runCommand: successfulAdapter(calls),
      }), /skip|directive/i);
      assert.equal(calls.length, 0);
      assert.equal(git(fixture.repo, 'ls-remote', 'origin', 'refs/heads/topic/ci-handoff'), '');
    });
  }
});

test('a newly changed default branch invalidates the captured base before handoff', async () => {
  const fixture = createFixture();
  const auxiliary = join(fixture.root, 'second-checkout');
  git(fixture.root, 'clone', fixture.bare, auxiliary);
  git(auxiliary, 'config', 'user.name', 'Concurrent CI Handoff Test');
  git(auxiliary, 'config', 'user.email', 'concurrent@example.invalid');
  writeFileSync(join(auxiliary, 'main-change.txt'), 'move main while local CI is running\n');
  git(auxiliary, 'add', 'main-change.txt');
  git(auxiliary, 'commit', '-m', 'test: advance main');
  let advanced = false;
  const calls = [];
  await assert.rejects(runFixtureHandoff(fixture, {
    runCommand: successfulAdapter(calls, (command) => {
      if (!advanced) {
        git(auxiliary, 'push', 'origin', 'HEAD:main');
        advanced = true;
      }
      return successfulCommand(command);
    }),
  }), /base|stale|changed|remote/i);
  assert.ok(calls.length > 0);
  assert.equal(git(fixture.repo, 'ls-remote', 'origin', 'refs/heads/topic/ci-handoff'), '');
});

test('an already published exact SHA is reported as a no-op, not a new handoff', async () => {
  const fixture = createFixture();
  git(fixture.repo, 'push', 'origin', 'HEAD:refs/heads/topic/ci-handoff');
  const calls = [];
  await assert.rejects(runFixtureHandoff(fixture, {
    runCommand: successfulAdapter(calls),
  }), /already|no-op|same SHA/i);
  assert.equal(calls.length, 0);
});

test('the ordinary repository pre-push hook can block publication', async () => {
  const fixture = createFixture();
  mkdirSync(join(fixture.repo, 'docs/reference'), { recursive: true });
  writeFileSync(join(fixture.repo, 'docs/reference/legacy.md'), 'forbidden old reference source\n');
  git(fixture.repo, 'add', 'docs/reference/legacy.md');
  git(fixture.repo, 'commit', '-m', 'test: prove the pre-push hook remains active');
  const calls = [];
  await assert.rejects(runFixtureHandoff(fixture, {
    runCommand: successfulAdapter(calls),
  }), /Blocked push.*docs\/reference/i);
  assert.ok(calls.length > 0);
  assert.equal(git(fixture.repo, 'ls-remote', 'origin', 'refs/heads/topic/ci-handoff'), '');
});

test('a rejected remote push does not report success or retry', async () => {
  const fixture = createFixture();
  const receiveCount = join(fixture.root, 'receive-count.txt');
  writeFileSync(join(fixture.bare, 'hooks/pre-receive'), `#!/bin/sh\nprintf 'called\\n' >> "${receiveCount}"\necho controlled rejection >&2\nexit 1\n`);
  chmodSync(join(fixture.bare, 'hooks/pre-receive'), 0o755);
  const calls = [];
  await assert.rejects(runFixtureHandoff(fixture, {
    runCommand: successfulAdapter(calls),
  }), /push|remote|reject/i);
  assert.equal(git(fixture.repo, 'ls-remote', 'origin', 'refs/heads/topic/ci-handoff'), '');
  assert.equal(readFileSync(receiveCount, 'utf8'), 'called\n');
});
