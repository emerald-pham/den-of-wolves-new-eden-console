import { createRequire } from 'node:module';
import type { Server } from 'node:http';
import { afterEach, expect, it, vi } from 'vitest';
import { auditedOnCall } from './securityCallable';

const require = createRequire(import.meta.url);
const express = require('express');
let server: Server | undefined;
afterEach(async () => {
  const activeServer = server;
  server = undefined;
  if (activeServer?.listening) await new Promise<void>((resolve, reject) => activeServer.close(error => error ? reject(error) : resolve()));
});
async function serve(callable: ReturnType<typeof auditedOnCall>) {
  const app = express(); app.use(express.json()); app.post('/', callable);
  server = await new Promise<Server>((resolve, reject) => {
    const started = app.listen(0, '127.0.0.1', (error?: Error) => error ? reject(error) : resolve(started));
    started.once('error', reject);
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Missing local transport port.');
  return fetch(`http://127.0.0.1:${address.port}/`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ data: {} }) });
}

it('declares canonical runtime defaults for a standalone handler constructed outside index initialization', () => {
  const handler = vi.fn(() => ({ status: 'accepted' }));
  const callable = auditedOnCall('standaloneAuthorityProbe', handler);
  expect(callable.__endpoint.maxInstances).toBe(10);
  expect(callable.__endpoint.region).toEqual(['us-central1']);
});

it('denies missing App Check before a standalone handler constructed outside index initialization', async () => {
  const handler = vi.fn(() => ({ status: 'accepted' }));
  const callable = auditedOnCall('standaloneAuthorityProbe', handler);
  const response = await serve(callable);
  expect(response.status).toBe(401);
  expect(await response.json()).toEqual({ error: { message: 'Unauthenticated', status: 'UNAUTHENTICATED' } });
  expect(handler).not.toHaveBeenCalled();
});

it('preserves explicit callable options and the ordinary Firebase callable protocol', async () => {
  const handler = vi.fn(() => ({ status: 'accepted' }));
  const callable = auditedOnCall('emulatorAuthorityProbe', { enforceAppCheck: false, maxInstances: 3 }, handler);
  expect(callable.__endpoint.maxInstances).toBe(3);
  const response = await serve(callable);
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ result: { status: 'accepted' } });
  expect(handler).toHaveBeenCalledOnce();
});
