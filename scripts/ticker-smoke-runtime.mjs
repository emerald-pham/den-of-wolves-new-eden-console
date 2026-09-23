import { createServer } from 'node:net';
import { mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

const DEFAULT_ARTIFACT_ROOT = '/tmp/fleet-ticker-smoke';
const DEFAULT_CACHE_ROOT = '/tmp/fleet-ticker-smoke-cache';

function text(value) {
  return typeof value === 'string' ? value.trim() : '';
}

export function parseTickerSmokePort(value) {
  const candidate = text(value);
  if (!/^\d+$/.test(candidate)) {
    throw new Error(`TICKER_SMOKE_PORT must be an integer from 1 to 65535; received ${String(value)}`);
  }
  const port = Number(candidate);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error(`TICKER_SMOKE_PORT must be an integer from 1 to 65535; received ${String(value)}`);
  }
  return port;
}

export async function allocateTickerSmokePort(explicitPort = process.env.TICKER_SMOKE_PORT) {
  if (text(explicitPort)) return parseTickerSmokePort(explicitPort);

  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen({ host: '127.0.0.1', port: 0 }, resolve);
  });
  const address = server.address();
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  if (!address || typeof address === 'string' || !Number.isInteger(address.port) || address.port < 1) {
    throw new Error('Unable to allocate a free ticker smoke port.');
  }
  return address.port;
}

export async function createTickerSmokeRuntime(env = process.env) {
  const explicitArtifactDirectory = text(env.TICKER_SMOKE_ARTIFACT_DIR);
  const explicitCacheDirectory = text(env.TICKER_SMOKE_CACHE_DIR);
  const runId = `${Date.now()}-${process.pid}-${randomUUID()}`;
  const artifactDirectory = explicitArtifactDirectory || path.join(DEFAULT_ARTIFACT_ROOT, runId);
  const cacheDirectory = explicitCacheDirectory || path.join(DEFAULT_CACHE_ROOT, runId);
  const ownsCacheDirectory = !explicitCacheDirectory;

  if (ownsCacheDirectory) await mkdir(cacheDirectory, { recursive: true });

  return {
    port: await allocateTickerSmokePort(env.TICKER_SMOKE_PORT),
    artifactDirectory,
    cacheDirectory,
    async cleanup() {
      if (ownsCacheDirectory) await rm(cacheDirectory, { recursive: true, force: true });
    },
  };
}

