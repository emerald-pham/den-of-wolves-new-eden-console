import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import test from 'node:test';
import { withProofBrowserCleanup } from './proof-tooling-browser-lifecycle.mjs';

function ownedServerProcess(calls) {
  const child = new EventEmitter();
  child.exitCode = null;
  child.signalCode = null;
  child.kill = () => {
    calls.push('browserServer.process.kill');
    setTimeout(() => {
      child.signalCode = 'SIGTERM';
      child.emit('exit', null, 'SIGTERM');
    }, 1);
    return true;
  };
  return child;
}

test('all closes are attempted after rejection, a stalled server is killed, and the primary error survives', async () => {
  const calls = [];
  const primaryError = new Error('browser assertion failed');
  const child = ownedServerProcess(calls);
  let caught;

  try {
    await withProofBrowserCleanup(async resources => {
      resources.context = { close: async () => { calls.push('context.close'); throw new Error('context close failed'); } };
      resources.browser = { close: async () => { calls.push('browser.close'); } };
      resources.browserServer = {
        close: async () => { calls.push('browserServer.close'); throw new Error('server close failed'); },
        process: () => child,
      };
      throw primaryError;
    }, { timeoutMs: 25, stopBuild: () => calls.push('stopBuild') });
  } catch (error) {
    caught = error;
  }

  assert.strictEqual(caught, primaryError);
  assert.deepEqual(caught.cleanupErrors.map(entry => entry.operation), ['context.close', 'browserServer.close']);
  assert.deepEqual(calls, [
    'context.close', 'browser.close', 'browserServer.close', 'browserServer.process.kill', 'stopBuild',
  ]);
});

test('a never-settling close is bounded so remaining handles and build cleanup still run', async () => {
  const calls = [];
  const operation = withProofBrowserCleanup(async resources => {
    resources.context = { close: () => { calls.push('context.close'); return new Promise(() => {}); } };
    resources.browser = { close: async () => { calls.push('browser.close'); } };
    resources.browserServer = { close: async () => { calls.push('browserServer.close'); } };
    return 'smoke result';
  }, { timeoutMs: 25, stopBuild: () => calls.push('stopBuild') });
  const outcome = await Promise.race([
    operation.then(value => ({ status: 'resolved', value }), error => ({ status: 'rejected', error })),
    new Promise(resolve => setTimeout(() => resolve({ status: 'outer-timeout' }), 500)),
  ]);

  assert.notEqual(outcome.status, 'outer-timeout', 'each cleanup operation must have a finite bound');
  assert.equal(outcome.status, 'rejected');
  assert.ok(outcome.error instanceof AggregateError);
  assert.deepEqual(outcome.error.cleanupErrors.map(entry => entry.operation), ['context.close']);
  assert.deepEqual(calls, ['context.close', 'browser.close', 'browserServer.close', 'stopBuild']);
});
