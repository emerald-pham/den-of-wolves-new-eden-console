import { access } from 'node:fs/promises';
import { createServer } from 'node:net';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  allocateTickerSmokePort,
  createTickerSmokeRuntime,
  parseTickerSmokePort,
} from './ticker-smoke-runtime.mjs';

test('explicit ticker smoke environment stays unchanged', async () => {
  const runtime = await createTickerSmokeRuntime({
    TICKER_SMOKE_PORT: '43123',
    TICKER_SMOKE_ARTIFACT_DIR: '/tmp/ticker-smoke-explicit-artifacts',
    TICKER_SMOKE_CACHE_DIR: '/tmp/ticker-smoke-explicit-cache',
  });

  assert.equal(runtime.port, 43_123);
  assert.equal(runtime.artifactDirectory, '/tmp/ticker-smoke-explicit-artifacts');
  assert.equal(runtime.cacheDirectory, '/tmp/ticker-smoke-explicit-cache');
  await runtime.cleanup();
});

test('default runtime allocations use distinct ports and per-run paths', async () => {
  const [first, second] = await Promise.all([
    createTickerSmokeRuntime({}),
    createTickerSmokeRuntime({}),
  ]);

  assert.ok(first.port >= 1 && first.port <= 65_535);
  assert.ok(second.port >= 1 && second.port <= 65_535);
  assert.notEqual(first.artifactDirectory, second.artifactDirectory);
  assert.notEqual(first.cacheDirectory, second.cacheDirectory);
  assert.match(first.artifactDirectory, /^\/tmp\/fleet-ticker-smoke\//);
  assert.match(first.cacheDirectory, /^\/tmp\/fleet-ticker-smoke-cache\//);
  await Promise.all([first.cleanup(), second.cleanup()]);
  await assert.rejects(access(first.cacheDirectory));
  await assert.rejects(access(second.cacheDirectory));
});

test('allocated ports are bindable and explicit ports are validated', async () => {
  const port = await allocateTickerSmokePort();
  const server = await new Promise((resolve, reject) => {
    const candidate = createServer();
    candidate.once('error', reject);
    candidate.listen({ host: '127.0.0.1', port }, () => resolve(candidate));
  });
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  assert.equal(parseTickerSmokePort('65535'), 65_535);
  assert.throws(() => parseTickerSmokePort('0'), /1 to 65535/);
});
