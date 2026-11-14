import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { createServer } from 'node:net';
import { constants as osConstants, tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { runProofTestCommand } from './proof-test-invocation.mjs';

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
