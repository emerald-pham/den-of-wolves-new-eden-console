import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { constants as osConstants, tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { inspectOwnedRuntime, readProcessStartTime, runProofTestCommand } from './proof-test-invocation.mjs';

async function makeDirectory(t) {
  const directory = await mkdtemp(join(tmpdir(), 'proof-test-invocation-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return directory;
}

test('passing proof commands retain zero as their actual process result', async t => {
  const directory = await makeDirectory(t);
  const output = [];
  const result = await runProofTestCommand(process.execPath, ['-e', 'process.stdout.write("PT1_PASS")'], {
    logPath: join(directory, 'pass.log'),
    writeOutput: value => output.push(value),
  });

  assert.equal(result.code, 0);
  assert.equal(result.signal, null);
  assert.equal(result.exitCode, 0);
  assert.match(result.excerpt, /PT1_PASS/);
  assert.equal(output.length, 0);
});

test('failing proof commands print their log excerpt and keep the child exit code', async t => {
  const directory = await makeDirectory(t);
  const output = [];
  const result = await runProofTestCommand(process.execPath, ['-e',
    'process.stdout.write("PT1_STDOUT_FAILURE\\n"); process.stderr.write("PT1_STDERR_FAILURE\\n"); process.exit(23)'], {
    logPath: join(directory, 'failure.log'),
    writeOutput: value => output.push(value),
  });

  assert.equal(result.code, 23);
  assert.equal(result.signal, null);
  assert.equal(result.exitCode, 23);
  assert.match(result.excerpt, /PT1_STDOUT_FAILURE/);
  assert.match(result.excerpt, /PT1_STDERR_FAILURE/);
  assert.match(output.join(''), /PT1_STDOUT_FAILURE/);
  assert.match(output.join(''), /PT1_STDERR_FAILURE/);
  assert.match(output.join(''), /23/);
});

test('interrupted proof commands return a signal-specific non-success result', async t => {
  const directory = await makeDirectory(t);
  const result = await runProofTestCommand(process.execPath, ['-e', 'process.kill(process.pid, "SIGTERM")'], {
    logPath: join(directory, 'interrupted.log'),
    writeOutput: () => {},
  });

  assert.equal(result.code, null);
  assert.equal(result.signal, 'SIGTERM');
  assert.equal(result.exitCode, 128 + osConstants.signals.SIGTERM);
});

test('diagnostic and cleanup failures never replace a failing proof command result', async t => {
  const directory = await makeDirectory(t);
  const result = await runProofTestCommand(process.execPath, ['-e', 'process.exit(29)'], {
    logPath: join(directory, 'secondary-failures.log'),
    writeOutput: () => { throw new Error('diagnostic sink unavailable'); },
    cleanup: async () => { throw new Error('cleanup unavailable'); },
  });

  assert.equal(result.code, 29);
  assert.equal(result.exitCode, 29);
  assert.match(result.diagnosticError.message, /diagnostic sink unavailable/);
  assert.match(result.cleanupError.message, /cleanup unavailable/);
});

// PT5 runtime-return fixtures. Every process below is a small disposable
// process this test spawns, records and stops itself; nothing else is touched.
const SELF_EXIT_MS = 30_000;
const idleProcessSource = (marker = '') =>
  `${marker ? `/* ${marker} */ ` : ''}setTimeout(() => process.exit(0), ${SELF_EXIT_MS}); setInterval(() => {}, 1000);`;

async function freePort() {
  const server = createServer();
  await new Promise(resolveListen => server.listen(0, '127.0.0.1', resolveListen));
  const { port } = server.address();
  await new Promise(resolveClose => server.close(resolveClose));
  return port;
}

function stopFixtureProcess(t, pid) {
  t.after(() => {
    try { process.kill(pid, 'SIGKILL'); } catch (error) { if (error.code !== 'ESRCH') throw error; }
  });
}

test('a quiet passing command that leaves a live descendant does not claim a clean return', async t => {
  const directory = await makeDirectory(t);
  const pidPath = join(directory, 'descendant.pid');
  const output = [];
  const childSource = `
    const { spawn } = require('node:child_process');
    const descendant = spawn(process.execPath, ['-e', ${JSON.stringify(idleProcessSource())}], { stdio: 'ignore' });
    require('node:fs').writeFileSync(${JSON.stringify(pidPath)}, String(descendant.pid));
    descendant.unref();
  `;
  const result = await runProofTestCommand(process.execPath, ['-e', childSource], {
    logPath: join(directory, 'descendant.log'),
    writeOutput: value => output.push(value),
    runtime: { ports: [] },
  });
  const descendantPid = Number(await readFile(pidPath, 'utf8'));
  stopFixtureProcess(t, descendantPid);

  assert.equal(result.code, 0, 'the original command result is retained');
  assert.equal(result.exitCode, 1, 'a remaining owned descendant prevents a successful return');
  assert.equal(result.runtime.cleanReturn, false);
  assert.equal(result.runtime.status, 'resources-remaining');
  assert.ok(result.runtime.remaining.processes.some(entry => entry.pid === descendantPid));
  const printed = output.join('');
  assert.match(printed, /Original result: exited with code 0/);
  assert.match(printed, new RegExp(`\\b${descendantPid}\\b`));
  const evidence = JSON.parse(await readFile(result.runtime.evidencePath, 'utf8'));
  assert.ok(evidence.remaining.processes.some(entry => entry.pid === descendantPid));
  assert.match(printed, new RegExp(result.runtime.evidencePath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
});

test('a command whose owned processes and allocated ports have all returned reports a clean return', async t => {
  const directory = await makeDirectory(t);
  const port = await freePort();
  const result = await runProofTestCommand(process.execPath, ['-e', 'process.exit(0)'], {
    logPath: join(directory, 'clean.log'),
    writeOutput: () => {},
    runtime: { ports: [port] },
  });

  assert.equal(result.exitCode, 0);
  assert.equal(result.runtime.status, 'clean');
  assert.equal(result.runtime.cleanReturn, true);
  assert.deepEqual(result.runtime.remaining, { processes: [], listeners: [] });
  assert.match(result.runtime.summary, /Runtime return: clean/);
  const evidence = JSON.parse(await readFile(result.runtime.evidencePath, 'utf8'));
  assert.deepEqual(evidence.allocatedPorts, [port]);
});

async function spawnFixture(t, source, { detached = false, readyPath } = {}) {
  const child = spawn(process.execPath, ['-e', source], { stdio: 'ignore', detached });
  stopFixtureProcess(t, child.pid);
  if (detached) t.after(() => { try { process.kill(-child.pid, 'SIGKILL'); } catch (error) { if (error.code !== 'ESRCH') throw error; } });
  if (readyPath) {
    const deadline = Date.now() + 10_000;
    for (;;) {
      try { return { child, ready: await readFile(readyPath, 'utf8') }; } catch (error) { if (error.code !== 'ENOENT') throw error; }
      if (Date.now() > deadline) throw new Error(`fixture not ready: ${readyPath}`);
      await new Promise(resolveWait => setTimeout(resolveWait, 25));
    }
  }
  return { child };
}

const listenerSource = (port, readyPath) => `
  require('node:net').createServer().listen(${port}, '127.0.0.1', () => require('node:fs').writeFileSync(${JSON.stringify(readyPath)}, String(process.pid)));
  setTimeout(() => process.exit(0), ${SELF_EXIT_MS});`;

test('an owned listener and a foreign listener on allocated ports stay explicit and scoped to the run', async t => {
  const directory = await makeDirectory(t);
  const [ownedPort, foreignPort] = [await freePort(), await freePort()];
  const ownedReady = join(directory, 'owned.ready');
  // A recorded group leader whose own child holds an allocated port.
  const leaderSource = `
    const listener = require('node:child_process').spawn(process.execPath, ['-e', ${JSON.stringify(listenerSource(ownedPort, ownedReady))}], { stdio: 'ignore' });
    setTimeout(() => process.exit(0), ${SELF_EXIT_MS});`;
  const { child: leader, ready } = await spawnFixture(t, leaderSource, { detached: true, readyPath: ownedReady });
  const ownedListenerPid = Number(ready);
  const startedAt = await readProcessStartTime(leader.pid);
  // Unrecorded processes stand in for another owner's resources.
  const { ready: foreignReady } = await spawnFixture(t, listenerSource(foreignPort, join(directory, 'foreign.ready')), { readyPath: join(directory, 'foreign.ready') });
  const foreignPid = Number(foreignReady);
  const { child: unrelated } = await spawnFixture(t, idleProcessSource('PT5_UNRELATED_HOST_PROCESS'));

  const result = await inspectOwnedRuntime({
    owned: [{ pid: leader.pid, label: 'fixture services', group: true, startedAt }],
    ports: [ownedPort, foreignPort],
    originalResult: 'exited with code 0',
    evidenceDirectory: directory,
  });

  assert.equal(result.status, 'resources-remaining');
  assert.equal(result.cleanReturn, false);
  assert.deepEqual(result.remaining.listeners.map(({ port, pid, owner }) => ({ port, pid, owner }))
    .sort((left, right) => left.port - right.port),
  [{ port: ownedPort, pid: ownedListenerPid, owner: 'owned' }, { port: foreignPort, pid: foreignPid, owner: 'foreign' }]
    .sort((left, right) => left.port - right.port));
  assert.deepEqual(result.remaining.processes.map(entry => entry.pid).sort(), [leader.pid, ownedListenerPid].sort());
  assert.ok(result.foreign.some(entry => entry.pid === foreignPid && entry.port === foreignPort));
  assert.match(result.summary, new RegExp(`no stop or release authority\\): ${foreignPid} on port ${foreignPort}`));
  assert.doesNotMatch(result.summary, new RegExp(`\\b${unrelated.pid}\\b`));
  assert.doesNotMatch(result.summary, /PT5_UNRELATED_HOST_PROCESS/);
  assert.ok(result.summary.split('\n').length <= 6, 'the console summary stays compact');
  const evidence = await readFile(result.evidencePath, 'utf8');
  assert.doesNotMatch(evidence, /PT5_UNRELATED_HOST_PROCESS/, 'retained evidence stays scoped to the run');
});

test('a recorded PID with unverified or reused identity grants no ownership', async t => {
  const directory = await makeDirectory(t);
  const { child: unverified } = await spawnFixture(t, idleProcessSource());
  const { child: reused } = await spawnFixture(t, idleProcessSource());

  const result = await inspectOwnedRuntime({
    owned: [
      { pid: unverified.pid, label: 'record without identity' },
      { pid: reused.pid, label: 'record of an exited process', startedAt: 'Thu Jan 1 00:00:00 1970' },
    ],
    evidenceDirectory: directory,
  });

  assert.equal(result.cleanReturn, false);
  assert.deepEqual(result.remaining.processes.map(({ pid, ownership }) => ({ pid, ownership })),
    [{ pid: unverified.pid, ownership: 'unverified' }]);
  assert.ok(result.foreign.some(entry => entry.pid === reused.pid));
  assert.match(result.summary, /no stop or release authority/);
});

test('missing ownership evidence cannot produce a clean return', async t => {
  const directory = await makeDirectory(t);
  const result = await inspectOwnedRuntime({ owned: [], ports: [await freePort()], evidenceDirectory: directory });

  assert.equal(result.status, 'ownership-missing');
  assert.equal(result.cleanReturn, false);
  assert.match(result.summary, /Ownership evidence missing/);
});

test('a diagnostic failure keeps the primary failure and retains its evidence on disk', async t => {
  const directory = await makeDirectory(t);
  const output = [];
  const failingProbe = async () => { throw new Error('process table unavailable'); };
  const failed = await runProofTestCommand(process.execPath, ['-e', 'process.exit(29)'], {
    logPath: join(directory, 'primary-failure.log'),
    writeOutput: value => output.push(value),
    runtime: { ports: [], listProcesses: failingProbe },
  });

  assert.equal(failed.exitCode, 29, 'the primary failure is preserved');
  assert.equal(failed.runtime.status, 'inspection-failed');
  assert.equal(failed.runtime.cleanReturn, false);
  assert.match(output.join(''), /Original result: exited with code 29/);
  assert.match(output.join(''), /Inspection failed \(process table\): process table unavailable/);
  const evidence = JSON.parse(await readFile(failed.runtime.evidencePath, 'utf8'));
  assert.equal(evidence.probeErrors[0].error.message, 'process table unavailable');

  const passed = await runProofTestCommand(process.execPath, ['-e', 'process.exit(0)'], {
    logPath: join(directory, 'primary-pass.log'),
    writeOutput: () => {},
    runtime: { ports: [], listProcesses: failingProbe },
  });
  assert.equal(passed.code, 0);
  assert.equal(passed.exitCode, 1, 'a failed inspection cannot be reported as a successful return');
});

test('a run whose detailed evidence cannot be written does not claim a clean return', async t => {
  const directory = await makeDirectory(t);
  const blocker = join(directory, 'not-a-directory');
  await writeFile(blocker, '');
  const result = await runProofTestCommand(process.execPath, ['-e', 'process.exit(0)'], {
    logPath: join(directory, 'unretained.log'),
    writeOutput: () => {},
    runtime: { ports: [], evidenceDirectory: join(blocker, 'evidence') },
  });

  assert.equal(result.exitCode, 1);
  assert.equal(result.runtime.cleanReturn, false);
  assert.equal(result.runtime.evidencePath, null);
  assert.match(result.runtime.summary, /Detailed evidence could not be written/);
});

test('an allocated port still occupied after the owned command returned blocks a clean return', async t => {
  const directory = await makeDirectory(t);
  const port = await freePort();
  const readyPath = join(directory, 'occupied.ready');
  const { ready } = await spawnFixture(t, listenerSource(port, readyPath), { readyPath });
  const result = await runProofTestCommand(process.execPath, ['-e', 'process.exit(0)'], {
    logPath: join(directory, 'occupied.log'),
    writeOutput: () => {},
    runtime: { ports: [port] },
  });

  assert.equal(result.code, 0);
  assert.equal(result.exitCode, 1);
  assert.deepEqual(result.runtime.remaining.processes, []);
  assert.deepEqual(result.runtime.remaining.listeners.map(({ port: listenerPort, pid, owner }) => ({ port: listenerPort, pid, owner })),
    [{ port, pid: Number(ready), owner: 'foreign' }]);
});
