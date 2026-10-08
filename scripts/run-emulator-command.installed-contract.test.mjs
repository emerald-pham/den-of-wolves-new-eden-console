import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, mkdir, writeFile, symlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as wrapper from './run-emulator-command.mjs';
import { runWithReservation } from './run-emulator-command.mjs';

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
async function withTools(consume) {
  const directory = await mkdtemp(join(tmpdir(), 'pc10-installed-firebase-contract-'));
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
