#!/usr/bin/env node
import { createHash } from 'node:crypto';
import {
  appendFileSync,
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  renameSync,
  writeFileSync,
} from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { delimiter, dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { classifyRiskGates } from './risk-gates.mjs';

const ZERO_SHA = '0000000000000000000000000000000000000000';
const DOCUMENTATION_TRIGGER_PATHS = new Set([
  'docs/IMPLEMENTATION_PLAN.md',
  'docs/IMPLEMENTATION_PROGRESS.md',
  'docs/IMPLEMENTATION_PROMPT_DEPENDENCIES.md',
  'CLAUDE.md',
  'AGENTS.md',
  'README.md',
  'docs/README.md',
  'docs/WORKTREE_COORDINATION.md',
  'docs/AGENT_CAMPAIGN_PLAYBOOK.md',
  'docs/agents/issue-tracker.md',
]);
const POLICY_FILES = Object.freeze([
  '.github/workflows/ci.yml',
  'package.json',
  'package-lock.json',
  'functions/package.json',
  'functions/package-lock.json',
  'scripts/ci-changed-paths.mjs',
  'scripts/risk-gates.mjs',
  'scripts/tracker-paths.mjs',
  'scripts/install-git-hooks.mjs',
  '.githooks/pre-push',
]);
const LIVE_FILES = Object.freeze([
  ...POLICY_FILES,
  'scripts/local-ci-handoff.mjs',
  'scripts/local-ci-handoff.test.mjs',
]);

const TICKER_SMOKE_OVERRIDE_KEYS = Object.freeze([
  'TICKER_SMOKE_SHARD',
  'TICKER_SMOKE_ONLY_LIFECYCLE',
  'TICKER_SMOKE_ONLY_REDUCED_LIFECYCLE',
]);

const CHROMIUM_INSTALL_ARGS = Object.freeze({
  linux: Object.freeze(['playwright', 'install', '--with-deps', 'chromium']),
  darwin: Object.freeze(['playwright', 'install', 'chromium']),
});

// Updated only alongside a reviewed workflow/scope/command contract change.
const SUPPORTED_CI_FINGERPRINT = 'e11bb5db0adb5297ff03399256b631604041ca3b7ac96700820cb227d77f9f6d';

function fail(message) {
  throw new Error(message);
}

function fileDigest(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function policyFingerprint(cwd) {
  const hash = createHash('sha256');
  for (const relativePath of POLICY_FILES) {
    const digest = fileDigest(resolve(cwd, relativePath));
    hash.update(`${relativePath}\0${digest}\n`);
  }
  return hash.digest('hex');
}

function git(cwd, args, { allowFailure = false } = {}) {
  const result = spawnSync('git', args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (result.error) throw result.error;
  if (!allowFailure && result.status !== 0) {
    fail(`git ${args.join(' ')} failed: ${(result.stderr || result.stdout || '').trim()}`);
  }
  return {
    status: result.status,
    signal: result.signal,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  };
}

function gitText(cwd, args) {
  return git(cwd, args).stdout.trim();
}

function effectiveTickerSmokeConfig() {
  const config = Object.fromEntries(TICKER_SMOKE_OVERRIDE_KEYS.map((key) => {
    const value = process.env[key]?.trim();
    return [key, value || null];
  }));
  if (Object.values(config).some(Boolean)) {
    fail('Ticker browser validation cannot run with a narrowed TICKER_SMOKE_* environment override.');
  }
  return config;
}

function effectiveNodeConfig(cwd) {
  const nodeOptions = process.env.NODE_OPTIONS?.trim() || null;
  if (nodeOptions) {
    fail('The effective NODE_OPTIONS runtime override is unsupported for CI handoff.');
  }
  const result = spawnSync('npm', ['config', 'get', 'node-options'], {
    cwd,
    env: withNode22Path(process.env),
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (result.error || result.status !== 0) {
    fail('Could not inspect the effective npm node-options lifecycle setting.');
  }
  const effectiveValue = (result.stdout ?? '').trim();
  if (effectiveValue && effectiveValue !== 'null') {
    fail('The effective npm node-options lifecycle override is unsupported for CI handoff.');
  }
  return {
    nodeVersion: process.version,
    nodeExecutable: process.execPath,
    platform: process.platform,
    nodeOptions,
    npmNodeOptions: effectiveValue && effectiveValue !== 'null' ? effectiveValue : null,
  };
}

function withNode22Path(env) {
  const nodeDirectory = dirname(process.execPath);
  const currentPath = env.PATH ?? '';
  const pathEntries = currentPath.split(delimiter);
  if (pathEntries[0] === nodeDirectory) return env;
  return { ...env, PATH: [nodeDirectory, currentPath].filter(Boolean).join(delimiter) };
}

function assertNoConcealedIndexState(cwd) {
  const entries = git(cwd, ['ls-files', '-v', '-z']).stdout.split('\0').filter(Boolean);
  if (entries.some((entry) => entry[0] === 'S' || (entry[0] >= 'a' && entry[0] <= 'z'))) {
    fail('The index contains concealed assume-unchanged or skip-worktree entries. Clear those index flags before CI handoff.');
  }
}

function readRemoteSha(cwd, remote, ref) {
  const result = git(cwd, ['ls-remote', '--heads', remote, ref], { allowFailure: true });
  if (result.status !== 0 || result.signal) fail(`Could not read remote ref ${ref} from the configured origin.`);
  const output = result.stdout.trim();
  if (!output) return undefined;
  const rows = output.split(/\r?\n/);
  const [sha, returnedRef] = rows[0].split(/\s+/);
  if (rows.length !== 1 || returnedRef !== ref || !/^[0-9a-f]{40}$/i.test(sha)) {
    fail(`Unexpected remote ref response for ${ref}.`);
  }
  return sha;
}

function fetchCommit(cwd, remote, sha) {
  const exists = git(cwd, ['cat-file', '-e', `${sha}^{commit}`], { allowFailure: true }).status === 0;
  if (!exists) {
    const result = git(cwd, ['fetch', '--no-tags', remote, sha], { allowFailure: true });
    if (result.status !== 0 || result.signal) fail('Could not fetch a required CI base commit from the configured origin.');
  }
}

function readSnapshot(cwd) {
  assertNoConcealedIndexState(cwd);
  const nodeConfig = effectiveNodeConfig(cwd);
  const tickerSmoke = effectiveTickerSmokeConfig();
  const branch = gitText(cwd, ['branch', '--show-current']);
  if (!branch) fail('The candidate must be on an attached local branch.');
  if (branch === 'main') fail('The CI workflow ignores pushes to main; use an attached topic branch.');
  const headSha = gitText(cwd, ['rev-parse', 'HEAD']);
  const treeSha = gitText(cwd, ['rev-parse', 'HEAD^{tree}']);
  const indexTreeSha = gitText(cwd, ['write-tree']);
  const status = gitText(cwd, ['status', '--porcelain=v1', '--untracked-files=all']);
  if (status) fail('The candidate worktree must be clean, including staged and untracked files.');
  const liveDigests = Object.fromEntries(LIVE_FILES.map((path) => [path, fileDigest(resolve(cwd, path))]));
  return { branch, headSha, treeSha, indexTreeSha, liveDigests, nodeConfig, tickerSmoke };
}

function assertSameSnapshot(cwd, initial) {
  const current = readSnapshot(cwd);
  for (const key of ['branch', 'headSha', 'treeSha', 'indexTreeSha']) {
    if (current[key] !== initial[key]) fail(`Candidate ${key} changed while local CI was running.`);
  }
  if (JSON.stringify(current.nodeConfig) !== JSON.stringify(initial.nodeConfig) ||
      JSON.stringify(current.tickerSmoke) !== JSON.stringify(initial.tickerSmoke)) {
    fail('The effective runtime or ticker smoke configuration changed while local CI was running.');
  }
  for (const path of LIVE_FILES) {
    if (current.liveDigests[path] !== initial.liveDigests[path]) {
      fail(`CI command or configuration changed during validation: ${path}`);
    }
  }
}

function verifySkipDirectives(cwd, baseSha, headSha) {
  const range = baseSha === headSha ? headSha : `${baseSha}..${headSha}`;
  const messages = gitText(cwd, ['log', '--format=%B', range]);
  const skipMessage = /\[(?:skip\s+ci|ci\s+skip|no\s+ci|skip\s+actions|actions\s+skip)\]/i;
  const skipTrailer = /^skip-checks:\s*true\s*$/im;
  if (skipMessage.test(messages) || skipTrailer.test(messages)) {
    fail('The candidate history contains a GitHub Actions skip directive.');
  }
}

function parseChangedPaths(cwd, headSha, pushBeforeSha) {
  const result = spawnSync(process.execPath, [
    'scripts/ci-changed-paths.mjs', '--head', headSha, '--push-before', pushBeforeSha,
  ], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  if (result.error) throw result.error;
  if (result.status !== 0 || result.signal) {
    fail(`Could not resolve the CI changed-path range: ${(result.stderr || result.stdout || '').trim()}`);
  }
  return result.stdout.split(/\r?\n/).map((path) => path.trim()).filter(Boolean);
}

function triggersWorkflow(paths) {
  return paths.some((path) => DOCUMENTATION_TRIGGER_PATHS.has(path) ||
    (!/\.md$/i.test(path) && !/(?:^|\/)README(?:\..*)?$/i.test(path)));
}

function changedFiles(cwd, baseSha, headSha) {
  const result = git(cwd, ['diff', '--name-only', baseSha, headSha]);
  return result.stdout.split(/\r?\n/).map((path) => path.trim()).filter(Boolean);
}

function requireJava21(cwd) {
  const result = spawnSync('java', ['-version'], {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (result.error) fail(`The CI Firestore cohort requires Java 21: ${result.error.message}`);
  const versionOutput = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
  const major = versionOutput.match(/version\s+"(\d+)/i)?.[1];
  if (result.status !== 0 || major !== '21') fail('The CI Firestore cohort requires Java 21, matching the GitHub Actions setup.');
}

function step(label, program, args, env = {}) {
  return { label, program, args, env };
}

function chromiumInstallArgs(platform) {
  const args = CHROMIUM_INSTALL_ARGS[platform];
  if (!args) fail(`Local CI handoff has no Chromium install plan for ${platform}.`);
  return [...args];
}

function buildCohort(profile, platform = process.platform) {
  const steps = [
    step('Install locked root dependencies for release contracts', 'npm', ['ci', '--prefer-offline', '--no-audit']),
    step('Typography release-gate contract', 'npm', ['run', 'test:typography:release-gate']),
    step('Bounded proof-tool contract preflight', 'npm', ['run', 'test:proof-preflight']),
    step('Branch cleanup safeguards', 'npm', ['run', 'test:branch-cleanup']),
    step('Firebase deployment batching contract', process.execPath, ['--test', 'scripts/deploy-firebase-surfaces.test.mjs']),
    step('Local CI handoff contract', process.execPath, ['--test', 'scripts/local-ci-handoff.test.mjs']),
  ];

  if (profile.roadmapChanged) steps.push(step('Check prompt catalog and generated views', 'npm', ['run', 'roadmap:check']));
  if (profile.trackerChanged) steps.push(step('Check GitHub tracker consumers', 'npm', ['run', 'test:prompt-tracker']));
  if (profile.documentationOnly) steps.push(step('Validate documentation', 'npm', ['run', 'coordination:docs']));
  steps.push(step('Validate runtime threat model', 'npm', ['run', 'security:threat-model']));
  if (profile.functionsInstall || profile.webBuild) {
    steps.push(step('Install locked Functions dependencies', 'npm', ['ci', '--prefix', 'functions', '--prefer-offline', '--no-audit']));
  }
  if (profile.lint) steps.push(step('Lint', 'npm', ['run', 'lint']));
  if (profile.unit) steps.push(step('Unit tests', 'npm', ['run', 'test:unit']));
  if (profile.unit && !profile.typography) {
    steps.push(step('Install Playwright Chromium for proof-tool browser smoke', 'npx', chromiumInstallArgs(platform)));
  }
  if (profile.functions) steps.push(step('Functions tests', 'npm', ['run', 'test:functions']));
  if (profile.firestore) steps.push(step('Firestore security-rule tests', 'npm', ['run', 'test:rules']));
  if (profile.webBuild) {
    steps.push(step('Build web', 'npm', ['run', 'build'], { VITE_CASTING_ENABLED: '1' }));
  }
  if (profile.font) steps.push(step('Console font consistency', 'npm', ['run', 'test:font-consistency']));
  if (profile.typography) {
    steps.push(step('Install rendered typography browser', 'npx', chromiumInstallArgs(platform)));
  }
  if (profile.unit) steps.push(step('Fleetwide Red Alert selector browser smoke', 'npm', ['run', 'test:proof-redalert-browser']));
  if (profile.typography) {
    steps.push(step('Computed-style typography gate', 'npm', ['run', 'test:typography:browser']));
    steps.push(step('Production-built cycle briefing typography', 'npm', ['run', 'test:cycle-briefing:browser'], {
      CYCLE_RENDER_EVIDENCE: '/tmp/pc04-typography/cycle-briefing',
    }));
  }
  if ((profile.ticker || profile.render) && !profile.typography) {
    steps.push(step('Install ticker smoke browser', 'npx', chromiumInstallArgs(platform)));
  }
  if (profile.ticker) steps.push(step('Browser ticker smoke', 'npm', ['run', 'test:ticker:browser']));
  if (profile.render) steps.push(step('Render-performance baselines', process.execPath, ['scripts/prompt-637-render-performance.mjs']));
  if (profile.bundle) steps.push(step('Check web bundle size', process.execPath, ['scripts/check-bundle-size.mjs']));
  if (profile.functions) {
    steps.push(step('Build functions', 'npm', ['run', 'build', '--prefix', 'functions']));
    steps.push(step('Verify Functions runtime artifact', process.execPath, ['scripts/verify-functions-artifact.mjs', 'functions']));
  }
  return steps;
}

const TAP_NPM_SCRIPTS = new Set([
  'test:typography:release-gate',
  'test:proof-preflight',
  'test:branch-cleanup',
  'test:prompt-tracker',
  'security:threat-model',
  'test:proof-redalert-browser',
]);
const VITEST_NPM_SCRIPTS = new Set([
  'test:unit',
  'test:functions',
  'test:rules',
  'test:font-consistency',
]);

function npmScript(command) {
  return command.program === 'npm' && command.args[0] === 'run' ? command.args[1] : '';
}

function inspectTapSummary(command, output) {
  const summaryValue = (name) => {
    const matches = [...output.matchAll(new RegExp(`^# ${name} (\\d+)$`, 'gm'))];
    if (matches.length !== 1) fail(`The ${command.label} stage returned an incomplete TAP summary (${name}).`);
    return Number(matches[0][1]);
  };
  if (!/^TAP version \d+$/m.test(output)) fail(`The ${command.label} stage returned no TAP completion marker.`);
  const plans = [...output.matchAll(/^\s*1\.\.(\d+)\s*$/gm)].map((match) => Number(match[1]));
  const summary = Object.fromEntries(['tests', 'pass', 'fail', 'cancelled', 'skipped', 'todo'].map((name) => [name, summaryValue(name)]));
  const durations = [...output.matchAll(/^# duration_ms (\d+(?:\.\d+)?)$/gm)];
  if (!plans.some((count) => count > 0) || durations.length !== 1 || summary.tests < 1 || summary.pass < 1) {
    fail(`The ${command.label} stage returned an incomplete TAP result or ran no tests.`);
  }
  if (summary.fail || summary.cancelled || summary.skipped || summary.todo ||
      summary.tests !== summary.pass + summary.fail + summary.cancelled + summary.skipped) {
    fail(`The ${command.label} stage returned an unsuccessful TAP summary.`);
  }
}

function inspectVitestSummary(command, output) {
  const files = output.match(/^\s*Test Files\s+(\d+) passed \((\d+)\)\s*$/m);
  const tests = output.match(/^\s*Tests\s+(\d+) passed \((\d+)\)\s*$/m);
  if (!files || !tests || !/^\s*Duration\s+\S.+$/m.test(output)) {
    fail(`The ${command.label} stage returned an incomplete Vitest summary.`);
  }
  if (Number(files[1]) < 1 || Number(files[1]) !== Number(files[2]) ||
      Number(tests[1]) < 1 || Number(tests[1]) !== Number(tests[2])) {
    fail(`The ${command.label} stage returned an unsuccessful Vitest summary or ran no tests.`);
  }
}

function inspectCustomBrowserResult(command, output) {
  if (command.label === 'Browser ticker smoke') {
    const expected = [];
    for (const [scenario, viewports] of [
      ['press', ['390x844', '844x390', '1440x900']],
      ['turn-zero', ['320x844', '390x844', '1440x900']],
    ]) {
      for (const font of ['pending', 'ready']) {
        for (const motion of ['normal', 'reduced']) {
          for (const viewport of viewports) expected.push(`${scenario}/${font}/${motion}/${viewport}`);
        }
      }
    }
    const actual = [...output.matchAll(/^Ticker browser smoke passed: ([^\r\n]+)$/gm)].map((match) => match[1]);
    if (actual.length !== expected.length || expected.some((caseName) => actual.filter((item) => item === caseName).length !== 1) ||
        !/^Ticker lifecycle browser proof passed: \S.+$/m.test(output) ||
        !/^Ticker reduced lifecycle browser proof passed: \S.+$/m.test(output)) {
      fail(`The ${command.label} stage did not report the complete ticker browser cohort.`);
    }
  } else if (command.label === 'Computed-style typography gate') {
    const match = output.match(/^Rendered typography gate passed: (\d+) PC01 cases, (\d+) surfaces, (\d+) Voyage metadata renders, (\d+) viewports, normal\/reduced motion\./m);
    if (!match || match.slice(1).some((count) => Number(count) < 1) ||
        !/^Exact PC01 \S+ comparison evidence: \S.+$/m.test(output)) {
      fail(`The ${command.label} stage did not report complete positive-count PC01 browser evidence.`);
    }
  } else if (command.label === 'Production-built cycle briefing typography') {
    const match = output.match(/^PASS (\d+) production-built consumer renders; actual painted font evidence: \S.+$/m);
    if (!match || Number(match[1]) !== 6) {
      fail(`The ${command.label} stage did not report all six production-built browser consumers.`);
    }
  }
}

function inspectCommandResult(command, result) {
  if (!result || !(Number.isInteger(result.exitCode) || result.exitCode === null) || typeof result.stdout !== 'string' ||
      typeof result.stderr !== 'string' || !(result.signal === null || typeof result.signal === 'string')) {
    fail(`The ${command.label} stage returned an incomplete result.`);
  }
  if (result.signal) fail(`The ${command.label} stage was cancelled by ${result.signal}.`);
  if (result.exitCode === null) fail(`The ${command.label} stage returned no completed exit status.`);
  if (result.exitCode !== 0) fail(`The ${command.label} stage failed with exit code ${result.exitCode}.`);
  const output = `${result.stdout}\n${result.stderr}`;
  const skipCounts = [
    ...[...output.matchAll(/#\s*skipped\s+(\d+)/gi)].map((match) => Number(match[1])),
    ...[...output.matchAll(/\b(\d+)\s+skipped\b/gi)].map((match) => Number(match[1])),
    ...[...output.matchAll(/\bskipped\s*[:=]\s*(\d+)/gi)].map((match) => Number(match[1])),
  ];
  if (skipCounts.some((count) => count > 0)) fail(`The ${command.label} stage reported skipped required tests.`);

  const script = npmScript(command);
  if ((command.program === process.execPath && command.args[0] === '--test') || TAP_NPM_SCRIPTS.has(script)) {
    inspectTapSummary(command, output);
  } else if (VITEST_NPM_SCRIPTS.has(script)) {
    inspectVitestSummary(command, output);
  } else if (['Browser ticker smoke', 'Computed-style typography gate', 'Production-built cycle briefing typography'].includes(command.label)) {
    inspectCustomBrowserResult(command, output);
  }
}

function runCommand(command, cwd) {
  return new Promise((resolve, reject) => {
    const env = withNode22Path({ ...process.env, ...command.env });
    const child = spawn(command.program, command.args, {
      cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
      env,
    });
    const stdout = [];
    const stderr = [];
    child.stdout.on('data', (chunk) => {
      stdout.push(chunk);
      process.stdout.write(chunk);
    });
    child.stderr.on('data', (chunk) => {
      stderr.push(chunk);
      process.stderr.write(chunk);
    });
    child.on('error', reject);
    child.on('close', (exitCode, signal) => resolve({
      exitCode,
      signal,
      stdout: Buffer.concat(stdout).toString('utf8'),
      stderr: Buffer.concat(stderr).toString('utf8'),
    }));
  });
}

function isWithinDirectory(parent, candidate) {
  const path = relative(parent, candidate);
  return path === '' || (!isAbsolute(path) && path !== '..' && !path.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`));
}

function createAttempt({ cwd, attemptRoot, initial, baseSha, refs, fingerprint, remoteConfig, cohort }) {
  const repositoryPath = realpathSync(cwd);
  const requestedRoot = resolve(attemptRoot ?? join(tmpdir(), 'den-of-wolves-local-ci-handoff'));
  if (isWithinDirectory(repositoryPath, requestedRoot)) {
    fail('Private CI handoff evidence must be written outside the source repository.');
  }
  mkdirSync(requestedRoot, { recursive: true, mode: 0o700 });
  const root = realpathSync(requestedRoot);
  if (isWithinDirectory(repositoryPath, root)) {
    fail('Private CI handoff evidence must be written outside the source repository.');
  }
  const directory = mkdtempSync(join(root, 'attempt-'));
  chmodSync(directory, 0o700);
  const manifestPath = join(directory, 'attempt.json');
  const resultsPath = join(directory, 'results.ndjson');
  writeFileSync(resultsPath, '', { mode: 0o600 });
  chmodSync(resultsPath, 0o600);
  const digest = (value) => createHash('sha256').update(value).digest('hex');
  const manifest = {
    schemaVersion: 1,
    startedAt: new Date().toISOString(),
    finishedAt: null,
    status: 'running',
    source: {
      branch: initial.branch,
      headSha: initial.headSha,
      treeSha: initial.treeSha,
      indexTreeSha: initial.indexTreeSha,
      liveDigests: initial.liveDigests,
    },
    base: {
      sha: baseSha,
      mainSha: refs.mainSha,
      branchSha: refs.branchSha ?? null,
    },
    policyFingerprint: fingerprint,
    config: {
      ...initial.nodeConfig,
      tickerSmoke: initial.tickerSmoke,
      pushUrlCount: remoteConfig.pushUrls.length,
      pushUrlMatchesFetch: remoteConfig.pushUrls.length === 1 && remoteConfig.pushUrls[0] === remoteConfig.fetchUrls[0],
      fetchUrlFingerprint: digest(remoteConfig.fetchUrls[0]),
      pushUrlFingerprint: digest(remoteConfig.pushUrls[0]),
    },
    plan: cohort,
    currentStage: null,
    push: {
      status: 'not-attempted',
      candidateSha: initial.headSha,
      observedRemoteSha: null,
      startedAt: null,
      finishedAt: null,
    },
  };
  const context = { directory, manifestPath, resultsPath, manifest };
  persistAttempt(context);
  return context;
}

function persistAttempt(context) {
  const temporaryPath = `${context.manifestPath}.tmp`;
  writeFileSync(temporaryPath, `${JSON.stringify(context.manifest, null, 2)}\n`, { mode: 0o600 });
  chmodSync(temporaryPath, 0o600);
  renameSync(temporaryPath, context.manifestPath);
}

function appendAttemptResult(context, record) {
  appendFileSync(context.resultsPath, `${JSON.stringify(record)}\n`, { mode: 0o600 });
  chmodSync(context.resultsPath, 0o600);
}

function markAttemptFailed(context, error) {
  const pushWasPending = context.manifest.push.status === 'pending';
  if (pushWasPending) context.manifest.push.status = 'uncertain';
  context.manifest.status = 'failed';
  context.manifest.finishedAt ??= new Date().toISOString();
  context.manifest.error = error instanceof Error ? error.message : String(error);
  persistAttempt(context);
  if (error instanceof Error) {
    Object.defineProperty(error, 'attemptDir', { value: context.directory, configurable: true });
    return error;
  }
  const wrapped = new Error(String(error));
  Object.defineProperty(wrapped, 'attemptDir', { value: context.directory, configurable: true });
  return wrapped;
}

function recordCommandResult(context, command, result, outcome, error, startedAt) {
  appendAttemptResult(context, {
    kind: 'command',
    command,
    result: result ?? null,
    outcome,
    error: error ? (error instanceof Error ? error.message : String(error)) : null,
    startedAt,
    finishedAt: new Date().toISOString(),
  });
}

function remoteUrls(cwd, remote) {
  const fetch = git(cwd, ['remote', 'get-url', '--all', remote], { allowFailure: true });
  const push = git(cwd, ['remote', 'get-url', '--push', '--all', remote], { allowFailure: true });
  if (fetch.status !== 0 || fetch.signal || push.status !== 0 || push.signal) {
    fail(`Could not resolve the effective fetch and push destinations for ${remote}.`);
  }
  const fetchUrls = fetch.stdout.split(/\r?\n/).map((value) => value.trim()).filter(Boolean);
  const pushUrls = push.stdout.split(/\r?\n/).map((value) => value.trim()).filter(Boolean);
  if (fetchUrls.length !== 1 || pushUrls.length !== 1) {
    fail(`${remote} must resolve to exactly one fetch destination and one push destination.`);
  }
  if (fetchUrls[0] !== pushUrls[0]) {
    fail(`The ${remote} push destination must match its fetch destination for CI handoff.`);
  }
  return { fetchUrls, pushUrls };
}

function assertSameRemoteUrls(cwd, remote, initial) {
  const current = remoteUrls(cwd, remote);
  if (JSON.stringify(current.fetchUrls) !== JSON.stringify(initial.fetchUrls) ||
      JSON.stringify(current.pushUrls) !== JSON.stringify(initial.pushUrls)) {
    fail(`The effective ${remote} fetch or push destination changed during local CI validation.`);
  }
}

function safePushOutput(push, pushUrl) {
  return `${push.stderr}\n${push.stdout}`
    .replaceAll(pushUrl, '<validated origin push destination>')
    .trim();
}

function remoteRefs(cwd, remoteUrl, branch) {
  const mainSha = readRemoteSha(cwd, remoteUrl, 'refs/heads/main');
  if (!mainSha) fail('The configured origin does not expose the workflow default branch main.');
  const branchSha = readRemoteSha(cwd, remoteUrl, `refs/heads/${branch}`);
  return { mainSha, branchSha };
}

async function runLocalCiHandoff({
  cwd = process.cwd(),
  runCommand: commandRunner = runCommand,
  onStage = () => {},
  attemptRoot,
} = {}) {
  const repository = gitText(cwd, ['rev-parse', '--show-toplevel']);
  if (realpathSync(repository) !== realpathSync(cwd)) fail('Run the handoff command from the repository root.');
  if (process.platform !== 'linux' && process.platform !== 'darwin') {
    fail(`Local CI handoff is supported on Linux and macOS, not ${process.platform}.`);
  }
  if (!/^v22\./.test(process.version)) fail(`CI handoff requires Node 22 to match GitHub Actions (found ${process.version}).`);

  const initial = readSnapshot(cwd);
  const actualFingerprint = policyFingerprint(cwd);
  if (actualFingerprint !== SUPPORTED_CI_FINGERPRINT) {
    fail(`Unsupported CI workflow or scope configuration (fingerprint ${actualFingerprint}). Review and map the changed contract first.`);
  }

  const remote = 'origin';
  const remoteConfig = remoteUrls(cwd, remote);
  const fetchUrl = remoteConfig.fetchUrls[0];
  const pushUrl = remoteConfig.pushUrls[0];
  const refs = remoteRefs(cwd, fetchUrl, initial.branch);
  fetchCommit(cwd, fetchUrl, refs.mainSha);
  const fetch = git(cwd, ['fetch', '--no-tags', fetchUrl, 'refs/heads/main:refs/remotes/origin/main'], { allowFailure: true });
  if (fetch.status !== 0 || fetch.signal) fail('Could not fetch the workflow default branch from the configured origin.');
  if (gitText(cwd, ['rev-parse', 'refs/remotes/origin/main']) !== refs.mainSha) {
    fail('The remote default branch moved while its local CI base was being prepared.');
  }
  if (refs.branchSha) fetchCommit(cwd, fetchUrl, refs.branchSha);
  const preparedRefs = remoteRefs(cwd, fetchUrl, initial.branch);
  if (preparedRefs.mainSha !== refs.mainSha || preparedRefs.branchSha !== refs.branchSha) {
    fail('The remote base or topic branch moved while its local CI base was being prepared.');
  }
  assertSameRemoteUrls(cwd, remote, remoteConfig);
  const baseSha = refs.branchSha ?? gitText(cwd, ['merge-base', refs.mainSha, initial.headSha]);
  if (!baseSha) fail('Could not determine the same base used by the CI changed-path classifier.');
  if (refs.branchSha === initial.headSha) fail('The exact candidate SHA is already on the remote; this would be a no-op handoff.');
  if (refs.branchSha && git(cwd, ['merge-base', '--is-ancestor', refs.branchSha, initial.headSha], { allowFailure: true }).status !== 0) {
    fail('The remote topic branch is not an ancestor of the candidate; a non-fast-forward handoff is not allowed.');
  }
  verifySkipDirectives(cwd, baseSha, initial.headSha);

  const pushBeforeSha = refs.branchSha ?? ZERO_SHA;
  const changedPaths = parseChangedPaths(cwd, initial.headSha, pushBeforeSha);
  if (!triggersWorkflow(changedFiles(cwd, baseSha, initial.headSha))) {
    fail('The candidate paths do not trigger the configured GitHub Actions workflow; no remote CI handoff is available.');
  }
  const profile = classifyRiskGates(changedPaths);
  const cohort = buildCohort(profile);
  if (cohort.length === 0) fail('The selected CI cohort is empty.');
  if (profile.firestore) requireJava21(cwd);

  const attempt = createAttempt({
    cwd,
    attemptRoot,
    initial,
    baseSha,
    refs,
    fingerprint: actualFingerprint,
    remoteConfig,
    cohort,
  });

  try {
    for (const [index, command] of cohort.entries()) {
      const startedAt = new Date().toISOString();
      attempt.manifest.currentStage = {
        index: index + 1,
        label: command.label,
        startedAt,
      };
      persistAttempt(attempt);
      onStage(command.label);

      let result;
      try {
        result = await commandRunner(command, cwd);
      } catch (error) {
        recordCommandResult(attempt, command, null, 'error', error, startedAt);
        throw error;
      }
      try {
        inspectCommandResult(command, result);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const outcome = !result || /incomplete|ran no tests|no TAP completion/i.test(message) ? 'incomplete' : 'failed';
        recordCommandResult(attempt, command, result, outcome, error, startedAt);
        throw error;
      }
      recordCommandResult(attempt, command, result, 'passed', null, startedAt);
      assertSameSnapshot(cwd, initial);
      assertSameRemoteUrls(cwd, remote, remoteConfig);
    }

    assertSameSnapshot(cwd, initial);
    if (policyFingerprint(cwd) !== actualFingerprint) fail('The supported CI workflow or scope changed during validation.');
    assertSameRemoteUrls(cwd, remote, remoteConfig);
    const currentRefs = remoteRefs(cwd, fetchUrl, initial.branch);
    if (currentRefs.mainSha !== refs.mainSha || currentRefs.branchSha !== refs.branchSha) {
      fail('The remote base or topic branch changed while local CI was running; rerun against the new base.');
    }
    if (gitText(cwd, ['config', '--local', '--get', 'core.hooksPath']) !== '.githooks' ||
        gitText(cwd, ['config', '--get', 'core.hooksPath']) !== '.githooks') {
      fail('The repository push hook is not installed at .githooks; the candidate was not published.');
    }

    const destinationRef = `refs/heads/${initial.branch}`;
    const refspec = `${initial.headSha}:${destinationRef}`;
    const pushCommand = {
      program: 'git',
      args: ['push', '--no-follow-tags', '--recurse-submodules=no', '--porcelain', '<validated origin push destination>', refspec],
      destinationFingerprint: attempt.manifest.config.pushUrlFingerprint,
    };
    attempt.manifest.push.status = 'pending';
    attempt.manifest.push.startedAt = new Date().toISOString();
    persistAttempt(attempt);

    let push;
    try {
      push = git(cwd, [
        'push', '--no-follow-tags', '--recurse-submodules=no', '--porcelain',
        pushUrl, refspec,
      ], { allowFailure: true });
    } catch (error) {
      appendAttemptResult(attempt, {
        kind: 'push', command: pushCommand, result: null, outcome: 'uncertain',
        error: error instanceof Error ? error.message : String(error),
        startedAt: attempt.manifest.push.startedAt, finishedAt: new Date().toISOString(),
      });
      attempt.manifest.push.status = 'uncertain';
      attempt.manifest.push.finishedAt = new Date().toISOString();
      persistAttempt(attempt);
      fail('The push command did not return a result; its remote state is uncertain. No retry was attempted.');
    }

    const pushResult = {
      exitCode: push.status,
      signal: push.signal,
      stdout: push.stdout,
      stderr: push.stderr,
    };
    const updateRow = push.stdout.split(/\r?\n/).find((line) => {
      const refspecValue = line.slice(1).trim().split(/\s+/)[0];
      return refspecValue?.endsWith(`:${destinationRef}`);
    });
    let observedRemoteSha;
    let observeFailed = false;
    try {
      observedRemoteSha = readRemoteSha(cwd, pushUrl, destinationRef);
    } catch {
      observeFailed = true;
    }

    let pushStatus = 'confirmed';
    let pushOutcome = 'confirmed';
    let pushError = null;
    if (push.status !== 0 || push.signal) {
      pushStatus = observedRemoteSha === initial.headSha || observeFailed ? 'uncertain' : 'rejected';
      pushOutcome = pushStatus;
      const output = safePushOutput(push, pushUrl);
      pushError = pushStatus === 'uncertain'
        ? `The push result is uncertain: the exact SHA may be remote, but git did not confirm success. No retry was attempted.${output ? ` ${output}` : ''}`
        : `The ordinary non-force push failed${push.signal ? ` (${push.signal})` : ` with exit code ${push.status}`}${output ? `: ${output}` : '.'}`;
    } else if (!updateRow) {
      pushStatus = observeFailed || observedRemoteSha === initial.headSha ? 'uncertain' : 'rejected';
      pushOutcome = pushStatus;
      pushError = 'The push returned no update record for the candidate branch; remote CI handoff is unconfirmed.';
    } else if (updateRow[0] === '=') {
      pushStatus = 'no-op';
      pushOutcome = 'no-op';
      pushError = 'The remote push was a no-op; no new CI handoff was confirmed.';
    } else if (![' ', '*'].includes(updateRow[0])) {
      pushStatus = 'rejected';
      pushOutcome = 'rejected';
      pushError = `The push returned an unexpected update status: ${updateRow[0]}`;
    } else if (observedRemoteSha !== initial.headSha) {
      pushStatus = observeFailed ? 'uncertain' : 'rejected';
      pushOutcome = pushStatus;
      pushError = 'The push completed without publishing the exact tested SHA; remote CI handoff is unconfirmed.';
    }

    appendAttemptResult(attempt, {
      kind: 'push',
      command: pushCommand,
      result: pushResult,
      outcome: pushOutcome,
      error: pushError,
      startedAt: attempt.manifest.push.startedAt,
      finishedAt: new Date().toISOString(),
    });
    attempt.manifest.push.status = pushStatus;
    attempt.manifest.push.observedRemoteSha = observedRemoteSha ?? null;
    attempt.manifest.push.finishedAt = new Date().toISOString();
    persistAttempt(attempt);
    if (pushStatus !== 'confirmed') fail(pushError);

    attempt.manifest.status = 'completed';
    attempt.manifest.finishedAt = new Date().toISOString();
    attempt.manifest.currentStage = null;
    persistAttempt(attempt);
    return {
      headSha: initial.headSha,
      treeSha: initial.treeSha,
      baseSha,
      remote,
      remoteBranch: initial.branch,
      remoteSha: observedRemoteSha,
      changedPaths,
      stages: cohort.map(({ label }) => label),
      policyFingerprint: actualFingerprint,
      attemptDir: attempt.directory,
      handoffInitiated: true,
    };
  } catch (error) {
    throw markAttemptFailed(attempt, error);
  }
}

export { buildCohort, policyFingerprint, runLocalCiHandoff };

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runLocalCiHandoff({
    onStage: (label) => process.stdout.write(`\n==> ${label}\n`),
  }).then((result) => {
    process.stdout.write(`Local CI passed for ${result.headSha}; pushed that exact SHA to ${result.remote}/${result.remoteBranch}. Remote CI is now responsible for its own checks. Private attempt evidence: ${result.attemptDir}\n`);
  }).catch((error) => {
    const evidence = error.attemptDir ? ` Private attempt evidence: ${error.attemptDir}` : '';
    process.stderr.write(`Local CI handoff stopped: ${error.message}${evidence}\n`);
    process.exitCode = 1;
  });
}
