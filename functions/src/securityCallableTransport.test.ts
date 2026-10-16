import { createRequire } from 'node:module';
import type { Server } from 'node:http';
import { dirname, join } from 'node:path';
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
async function serve(
  callable: ReturnType<typeof auditedOnCall>,
  request: { headers?: Record<string, string>; data?: unknown } = {},
) {
  const app = express(); app.use(express.json()); app.post('/', callable);
  server = await new Promise<Server>((resolve, reject) => {
    const started = app.listen(0, '127.0.0.1', (error?: Error) => error ? reject(error) : resolve(started));
    started.once('error', reject);
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Missing local transport port.');
  return fetch(`http://127.0.0.1:${address.port}/`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...request.headers },
    body: JSON.stringify({ data: request.data ?? {} }),
  });
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

it('emits private SDK verification metadata for missing App Check without logging request secrets', async () => {
  const loggerPath = require.resolve('firebase-functions/logger');
  // Tap the ESM console emitter used by Firebase's unmocked v2 HTTPS middleware.
  const loggerCommon = await import(join(dirname(dirname(loggerPath)), 'esm/logger/common.mjs')) as {
    UNPATCHED_CONSOLE: { debug: (...args: unknown[]) => void };
  };
  const emitDebug = loggerCommon.UNPATCHED_CONSOLE.debug;
  const captured: string[] = [];
  const debugSpy = vi.spyOn(loggerCommon.UNPATCHED_CONSOLE, 'debug').mockImplementation((...args: unknown[]) => {
    captured.push(args.map(String).join(' '));
    emitDebug(...args);
  });

  try {
    const handler = vi.fn(() => ({ status: 'accepted' }));
    const callable = auditedOnCall('standaloneAuthorityProbe', handler);
    const response = await serve(callable, {
      headers: { 'x-test-credential-canary': 'TEST_CREDENTIAL_CANARY' },
      data: { sessionId: 'SESSION_CANARY', requestId: 'REQUEST_CANARY', notes: 'NOTE_BODY_CANARY',
        cards: ['HAND_CANARY'], loyalty: 'LOYALTY_CANARY' },
    });
    const responseBody = await response.text();

    expect(response.status).toBe(401);
    expect(JSON.parse(responseBody)).toEqual({ error: { message: 'Unauthenticated', status: 'UNAUTHENTICATED' } });
    expect(handler).not.toHaveBeenCalled();

    const verification = captured.map(line => JSON.parse(line) as Record<string, unknown>).find(entry =>
      (entry['logging.googleapis.com/labels'] as Record<string, unknown> | undefined)?.['firebase-log-type'] === 'callable-request-verification');
    expect(verification).toMatchObject({
      severity: 'DEBUG',
      message: 'Callable request verification passed',
      verifications: { app: 'MISSING', auth: 'MISSING' },
      'logging.googleapis.com/labels': { 'firebase-log-type': 'callable-request-verification' },
    });
    const canaries = ['TEST_CREDENTIAL_CANARY', 'SESSION_CANARY', 'REQUEST_CANARY', 'NOTE_BODY_CANARY', 'HAND_CANARY', 'LOYALTY_CANARY'];
    for (const canary of canaries) {
      expect(JSON.stringify(captured)).not.toContain(canary);
      expect(responseBody).not.toContain(canary);
    }
  } finally {
    debugSpy.mockRestore();
  }
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
