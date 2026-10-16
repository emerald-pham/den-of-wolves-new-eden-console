import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, mkdir, writeFile, symlink, rm, realpath, readFile } from 'node:fs/promises';
import { writeFileSync } from 'node:fs';
import { EventEmitter } from 'node:events';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as wrapper from './run-emulator-command.mjs';
import { runCommand, runWithReservation } from './run-emulator-command.mjs';

// No executable is started: this verifies the owning wrapper's dispatch and
// cleanup contract against the installed exact-version Firebase route.
test('installed Firebase dispatch retains reservation child attachment and release on failure', async () => {
  const events = [];
  const reservation = { nonce: 'owned-test-reservation' };
  const failure = new Error('owned child failed');
  await assert.rejects(runWithReservation({
    slot: 5, kind: 'emulators', command: 'npm run emulators', ports: [9149],
    args: ['--yes', 'firebase-tools@15.29.0', 'emulators:start', '--project', 'demo-contract'],
    reserve: async () => { events.push('reserve'); return reservation; },
    attachChild: async (owned, pid) => {
      assert.equal(owned, reservation); assert.equal(pid, 123456);
      events.push('attach'); return owned;
    },
    release: async (owned) => { assert.equal(owned, reservation); events.push('release'); },
    runner: async (command, args, options) => {
      assert.notEqual(command, 'npx', 'Firebase must use the verified installed binary without npm registry resolution');
      assert.deepEqual(args.slice(-3), ['emulators:start', '--project', 'demo-contract']);
      await options.onSpawn({ pid: 123456 });
      throw failure;
    },
  }), failure);
  assert.deepEqual(events, ['reserve', 'attach', 'release']);
});

// Resolution must happen before claiming a runtime lease; a failed preflight
// cannot reserve resources or silently fall through to a registry download.
test('installed Firebase resolution failure preserves the original error before reservation', async () => {
  const events = [], failure = new Error('Installed Firebase pinned version mismatch');
  await assert.rejects(runWithReservation({
    slot: 5, kind: 'emulators', command: 'npm run emulators', ports: [9149],
    args: ['--yes', 'firebase-tools@15.29.0', 'emulators:start'],
    resolveFirebaseTools: async () => { events.push('resolve'); throw failure; },
    reserve: async () => { events.push('reserve'); return {}; },
    runner: async () => { events.push('run'); },
    release: async () => { events.push('release'); },
  }), failure);
  assert.deepEqual(events, ['resolve']);
});
test('ordinary Vite keeps its existing no-install dispatch and cleanup', async () => {
  const events = [];
  await runWithReservation({ slot: 1, kind: 'vite', command: 'npm run dev:emulators', ports: [5174],
    args: ['--no-install', 'vite', '--mode', 'emulators'],
    resolveFirebaseTools: async () => { throw new Error('Vite must not resolve Firebase'); },
    reserve: async () => (events.push('reserve'), {}),
    runner: async (command, args) => { assert.equal(command, 'npx');
      assert.deepEqual(args, ['--no-install', 'vite', '--mode', 'emulators']); events.push('run'); },
    release: async () => { events.push('release'); },
  });
  assert.deepEqual(events, ['reserve', 'run', 'release']);
});

test('runCommand uses an explicit child cwd and keeps the wrapper in the source checkout', async () => {
  const directory = await realpath(await mkdtemp(join(tmpdir(), 'pc10-emulator-child-cwd-')));
  const wrapperCwd = process.cwd();
  let spawned;
  try {
    const child = new EventEmitter();
    await runCommand('/inert/firebase', ['emulators:start'], {
      cwd: directory,
      spawnProcess: (command, args, options) => {
        spawned = { command, args, cwd: options.cwd };
        queueMicrotask(() => child.emit('exit', 0, null));
        return child;
      },
    });
    assert.deepEqual(spawned, { command: '/inert/firebase', args: ['emulators:start'], cwd: directory });
    assert.equal(process.cwd(), wrapperCwd, 'Changing the Firebase child cwd must not move the wrapper process.');
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('runWithReservation forwards the owned emulator log cwd and releases the same child reservation on failure', async () => {
  const directory = await realpath(await mkdtemp(join(tmpdir(), 'pc10-emulator-owned-log-')));
  const events = [], reservation = { nonce: 'owned-log-directory-reservation' };
  const failure = new Error('inert Firebase child failed');
  try {
    await assert.rejects(runWithReservation({
      slot: 5, kind: 'emulators', command: 'npm run emulators', ports: [9149],
      args: ['--yes', 'firebase-tools@15.29.0', 'emulators:start', '--project', 'demo-owned-log'],
      environment: { DOW_FIREBASE_EMULATOR_LOG_DIRECTORY: directory },
      resolveFirebaseTools: async args => ({ command: '/inert/firebase', args }),
      reserve: async () => { events.push('reserve'); return reservation; },
      attachChild: async (owned, pid) => {
        assert.equal(owned, reservation); assert.equal(pid, 24680); events.push('attach'); return owned;
      },
      release: async owned => { assert.equal(owned, reservation); events.push('release'); },
      runner: async (command, args, options) => {
        assert.equal(command, '/inert/firebase');
        assert.deepEqual(args.slice(-3), ['emulators:start', '--project', 'demo-owned-log']);
        events.push(`cwd:${options.cwd}`);
        await options.onSpawn({ pid: 24680 });
        throw failure;
      },
    }), failure);
    assert.deepEqual(events, ['reserve', `cwd:${directory}`, 'attach', 'release']);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('invalid emulator log directories fail before reserving or spawning', async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'pc10-emulator-invalid-log-')));
  const validTarget = join(root, 'valid-target');
  const symlinkPath = join(root, 'linked-log-directory');
  await mkdir(validTarget);
  await symlink(validTarget, symlinkPath);
  const sourceRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
  const cases = [
    ['relative', 'relative/emulator-logs'],
    ['missing', join(root, 'missing')],
    ['symlink', symlinkPath],
    ['source-root alias', sourceRoot],
  ];
  try {
    for (const [name, logDirectory] of cases) {
      const events = [];
      await assert.rejects(runWithReservation({
        slot: 5, kind: 'emulators', command: 'npm run emulators', ports: [9149],
        args: ['--yes', 'firebase-tools@15.29.0', 'emulators:start'],
        environment: { DOW_FIREBASE_EMULATOR_LOG_DIRECTORY: logDirectory },
        resolveFirebaseTools: async args => { events.push('resolve'); return { command: '/inert/firebase', args }; },
        reserve: async () => { events.push('reserve'); return {}; },
        runner: async () => { events.push('spawn'); },
        release: async () => { events.push('release'); },
      }), new RegExp('DOW_FIREBASE_EMULATOR_LOG_DIRECTORY|log directory|log path', 'i'), name);
      assert.deepEqual(events, [], `${name} must be rejected before resolver, reservation, and spawn.`);
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('a source-contained emulator log directory is denied before resolver or reservation', async () => {
  const sourceDirectory = resolve(fileURLToPath(new URL('..', import.meta.url)));
  const events = [];
  await assert.rejects(runWithReservation({
    slot: 5, kind: 'emulators', command: 'npm run emulators', ports: [9149],
    args: ['--yes', 'firebase-tools@15.29.0', 'emulators:start'],
    environment: { DOW_FIREBASE_EMULATOR_LOG_DIRECTORY: join(sourceDirectory, 'scripts') },
    resolveFirebaseTools: async args => { events.push('resolve'); return { command: '/inert/firebase', args }; },
    reserve: async () => { events.push('reserve'); return {}; },
    runner: async () => { events.push('spawn'); },
    release: async () => { events.push('release'); },
  }), /DOW_FIREBASE_EMULATOR_LOG_DIRECTORY/);
  assert.deepEqual(events, []);
});

test('consecutive emulator attempts write logs in separate directories and preserve the prior sentinel', async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'pc10-emulator-separated-logs-')));
  const firstDirectory = join(root, 'attempt-1'), secondDirectory = join(root, 'attempt-2');
  await mkdir(firstDirectory); await mkdir(secondDirectory);
  const firstLog = join(firstDirectory, 'firebase-debug.log');
  const secondLog = join(secondDirectory, 'firebase-debug.log');
  const sentinel = 'P181 prior attempt evidence sentinel\n';
  const sourceCwd = fileURLToPath(new URL('..', import.meta.url));
  try {
    for (const [attempt, directory] of [[1, firstDirectory], [2, secondDirectory]]) {
      await runWithReservation({
        slot: 5, kind: 'emulators', command: `inert emulator attempt ${attempt}`, ports: [9149],
        args: ['--yes', 'firebase-tools@15.29.0', 'emulators:start'],
        environment: { DOW_FIREBASE_EMULATOR_LOG_DIRECTORY: directory },
        resolveFirebaseTools: async args => ({ command: '/inert/firebase', args }),
        reserve: async () => ({ nonce: `attempt-${attempt}` }),
        release: async () => undefined,
        runner: (command, args, options) => runCommand(command, args, {
          cwd: options.cwd,
          spawnProcess: (_command, _args, spawnOptions) => {
            assert.equal(spawnOptions.cwd, directory, 'The installed Firebase process must write relative logs in its owned attempt directory.');
            assert.notEqual(spawnOptions.cwd, sourceCwd);
            writeFileSync(join(spawnOptions.cwd, 'firebase-debug.log'), attempt === 1 ? sentinel : `attempt ${attempt}\n`, { mode: 0o600 });
            const child = new EventEmitter();
            queueMicrotask(() => child.emit('exit', 0, null));
            return child;
          },
        }),
      });
      if (attempt === 1) assert.equal(await readFile(firstLog, 'utf8'), sentinel);
    }
    assert.equal(await readFile(secondLog, 'utf8'), 'attempt 2\n');
    assert.equal(await readFile(firstLog, 'utf8'), sentinel);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
async function withTools(consume) {
  const directory = await realpath(await mkdtemp(join(tmpdir(), 'pc10-installed-firebase-contract-')));
  const repository = join(directory, 'repo'), pathDirectory = join(directory, 'bin');
  await mkdir(repository); await mkdir(pathDirectory);
  async function install(at, { version = '15.29.0', name = 'firebase-tools', malformed = false } = {}) {
    await mkdir(join(at, 'lib/bin'), { recursive: true });
    const packagePath = join(at, 'package.json'), binaryPath = join(at, 'lib/bin/firebase.js');
    await writeFile(packagePath, malformed ? '{' : JSON.stringify({ name, version, bin: { firebase: './lib/bin/firebase.js' } }));
    await writeFile(binaryPath, '// Metadata fixture; never executed.\n');
    return { packagePath, binaryPath };
  }
  try { return await consume({ directory, repository, pathDirectory, install,
    options: { repository, searchPath: pathDirectory, nodeExecutable: '/known/node', allowRegistryFallback: false } }); }
  finally { await rm(directory, { recursive: true, force: true }); }
}
test('pinned project Firebase precedes an installed PATH alias and preserves every CLI argument', async () => {
  await withTools(async ({ repository, pathDirectory, install, options, directory }) => {
    const local = await install(join(repository, 'node_modules/firebase-tools'));
    const global = await install(join(directory, 'global'));
    await symlink(global.binaryPath, join(pathDirectory, 'firebase'));
    const invocation = await wrapper.resolveFirebaseToolsInvocation(['emulators:start', '--project', 'demo-contract'], options);
    assert.equal(invocation.command, '/known/node');
    assert.deepEqual(invocation.args, [local.binaryPath, 'emulators:start', '--project', 'demo-contract']);
    assert.equal(invocation.packageVersion, '15.29.0'); assert.equal(invocation.registryResolution, false);
  });
});
test('pinned installed PATH alias resolves its actual package entry without npm', async () => {
  await withTools(async ({ pathDirectory, install, options, directory }) => {
    const installed = await install(join(directory, 'global'));
    await symlink(installed.binaryPath, join(pathDirectory, 'firebase'));
    const invocation = await wrapper.resolveFirebaseToolsInvocation(['emulators:exec'], options);
    assert.equal(invocation.command, '/known/node'); assert.deepEqual(invocation.args, [installed.binaryPath, 'emulators:exec']);
    assert.equal(invocation.packagePath, installed.packagePath); assert.equal(invocation.registryResolution, false);
  });
});
for (const fault of ['wrong-version', 'foreign-package', 'malformed-package']) {
  test(`installed resolver refuses ${fault} without runtime or registry fallback`, async () => {
    await withTools(async ({ repository, install, options }) => {
      await install(join(repository, 'node_modules/firebase-tools'), {
        ...(fault === 'wrong-version' ? { version: '15.28.0' } : {}),
        ...(fault === 'foreign-package' ? { name: 'other-cli' } : {}),
        ...(fault === 'malformed-package' ? { malformed: true } : {}),
      });
      await assert.rejects(wrapper.resolveFirebaseToolsInvocation(['emulators:start'], options));
    });
  });
}
test('absent local pinned Firebase fails closed before requesting an npm download', async () => {
  await withTools(async ({ options }) => {
    await assert.rejects(wrapper.resolveFirebaseToolsInvocation(['emulators:start'], options), /[Ii]nstalled.*15\.29\.0/);
  });
});
test('existing explicit CI registry path remains available without executing it', async () => {
  await withTools(async ({ options }) => {
    const invocation = await wrapper.resolveFirebaseToolsInvocation(['emulators:exec'], { ...options, allowRegistryFallback: true });
    assert.equal(invocation.command, 'npx');
    assert.deepEqual(invocation.args, ['--yes', 'firebase-tools@15.29.0', 'emulators:exec']);
    assert.equal(invocation.registryResolution, true);
  });
});
