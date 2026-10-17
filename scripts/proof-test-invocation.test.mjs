import assert from 'node:assert/strict';
import { constants as osConstants } from 'node:os';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
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
  const result = await runProofTestCommand(process.execPath, ['-e', 'process.stdout.write("PT1_PASS\n")'], {
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
