import { createRequire } from 'node:module';
import type { Server } from 'node:http';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { HttpsError } from 'firebase-functions/v2/https';
import { CALLABLE_RUNTIME_OPTIONS } from './runtimeOptions';
import { onCall, securityDenialRecord } from './securityDenialTelemetry';

// These cases use the real Firebase SDK callable transport and logger, with no
// module mocks: the captured lines are exactly what Cloud Run would hand to
// Cloud Logging, and the response is exactly what the client receives.
const require = createRequire(import.meta.url);
// The SDK serves callables through its own express dependency.
const express = createRequire(require.resolve('firebase-functions/logger'))('express');

type LogLevel = 'debug' | 'info' | 'log' | 'warn' | 'error';
const LEVELS: LogLevel[] = ['debug', 'info', 'log', 'warn', 'error'];
const PRIVATE_CANARIES = ['APP_CHECK_TOKEN_CANARY', 'ID_TOKEN_CANARY', 'NOTE_BODY_CANARY', 'HAND_CANARY',
  'LOYALTY_CANARY', 'SESSION_CANARY', 'REQUEST_CANARY'];
const PRIVATE_DATA = { sessionId: 'SESSION_CANARY', requestId: 'REQUEST_CANARY', notes: 'NOTE_BODY_CANARY',
  hand: ['HAND_CANARY'], loyalty: 'LOYALTY_CANARY' };

let server: Server | undefined;
let captured: string[] = [];
let restoreConsole: () => void = () => undefined;
let failWarnings = false;

beforeEach(async () => {
  // Tap the ESM console emitter that both the SDK middleware and our logger use.
  const loggerPath = require.resolve('firebase-functions/logger');
  const loggerCommon = await import(join(dirname(dirname(loggerPath)), 'esm/logger/common.mjs')) as {
    UNPATCHED_CONSOLE: Record<LogLevel, (...args: unknown[]) => void>;
  };
  captured = [];
  failWarnings = false;
  const spies = LEVELS.map(level => vi.spyOn(loggerCommon.UNPATCHED_CONSOLE, level)
    .mockImplementation((...args: unknown[]) => {
      const line = args.map(String).join(' ');
      if (failWarnings && line.includes('security-denial')) throw new Error('log sink unavailable');
      captured.push(line);
    }));
  restoreConsole = () => spies.forEach(spy => spy.mockRestore());
  vi.stubEnv('FUNCTION_TARGET', 'telemetryProbe');
});

afterEach(async () => {
  restoreConsole();
  vi.unstubAllEnvs();
  const active = server;
  server = undefined;
  if (active?.listening) await new Promise<void>((resolve, reject) => active.close(error => error ? reject(error) : resolve()));
});

async function call(callable: ReturnType<typeof onCall>, headers: Record<string, string> = {}) {
  const app = express();
  app.use(express.json());
  app.post('/', callable);
  server = await new Promise<Server>((resolve, reject) => {
    const started = app.listen(0, '127.0.0.1', (error?: Error) => error ? reject(error) : resolve(started));
    started.once('error', reject);
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Missing local transport port.');
  const response = await fetch(`http://127.0.0.1:${address.port}/`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify({ data: PRIVATE_DATA }),
  });
  return { status: response.status, body: await response.text() };
}

function entries(): Record<string, unknown>[] {
  return captured.flatMap(line => {
    try { return [JSON.parse(line) as Record<string, unknown>]; } catch { return []; }
  });
}

function expectNoPrivateValues(...texts: string[]) {
  for (const canary of PRIVATE_CANARIES) for (const text of texts) expect(text).not.toContain(canary);
}

it('keeps an invalid App Check token at the SDK boundary with one private verification record', async () => {
  const { getApps, initializeApp, deleteApp } = await import('firebase-admin/app');
  expect(getApps()).toHaveLength(0);
  // A local project ID lets the Admin SDK reject the malformed token without a metadata lookup.
  const adminApp = initializeApp({ projectId: 'demo-p634-appcheck-boundary' });
  try {
    expect(CALLABLE_RUNTIME_OPTIONS.enforceAppCheck).toBe(true);
    const handler = vi.fn(() => ({ status: 'accepted' }));
    const response = await call(onCall(CALLABLE_RUNTIME_OPTIONS, handler), {
      'X-Firebase-AppCheck': 'APP_CHECK_TOKEN_CANARY',
    });

    expect(response.status).toBe(401);
    expect(JSON.parse(response.body)).toEqual({ error: { message: 'Unauthenticated', status: 'UNAUTHENTICATED' } });
    expect(handler).not.toHaveBeenCalled();
    // The SDK's verification entry is the App Check denial record; the game
    // wrapper never runs, so the denial is recorded once, not twice.
    const verification = entries().filter(entry =>
      (entry['logging.googleapis.com/labels'] as Record<string, unknown> | undefined)?.['firebase-log-type']
        === 'callable-request-verification');
    expect(verification).toEqual([expect.objectContaining({
      severity: 'WARNING',
      verifications: { app: 'INVALID', auth: 'MISSING' },
    })]);
    expect(entries().some(entry => entry.type === 'security-denial')).toBe(false);
    expectNoPrivateValues(JSON.stringify(captured), response.body);
  } finally {
    await deleteApp(adminApp);
  }
});

it('writes a handler denial only to the structured log sink and returns the unchanged denial to the client', async () => {
  const denial = new HttpsError('permission-denied', 'Join the session first.', { commandError: 'unauthorized' });
  const callable = onCall({ ...CALLABLE_RUNTIME_OPTIONS, enforceAppCheck: false }, () => { throw denial; });

  const response = await call(callable, { Authorization: 'Bearer ID_TOKEN_CANARY' });

  // An invalid ID token is refused by the SDK before the handler, with its own
  // verification record; a valid caller's denial follows below.
  expect(response.status).toBe(401);
  expect(entries().filter(entry => entry.type === 'security-denial')).toEqual([]);
  expect(entries()).toContainEqual(expect.objectContaining({
    severity: 'WARNING', verifications: expect.objectContaining({ auth: 'INVALID' }),
  }));
  captured = [];

  const anonymous = await call(callable);

  expect(anonymous.status).toBe(403);
  expect(JSON.parse(anonymous.body)).toEqual({ error: {
    message: 'Join the session first.', status: 'PERMISSION_DENIED', details: { commandError: 'unauthorized' },
  } });
  const records = entries().filter(entry => entry.type === 'security-denial');
  expect(records).toEqual([{
    severity: 'WARNING', message: 'Callable security denial',
    type: 'security-denial', schemaVersion: 1, callableName: 'telemetryProbe',
    code: 'permission-denied', category: 'authorization', commandError: 'unauthorized',
    authState: 'absent', appCheck: 'absent',
    sessionHash: expect.stringMatching(/^[a-f0-9]{64}$/), requestHash: expect.stringMatching(/^[a-f0-9]{64}$/),
  }]);
  expectNoPrivateValues(JSON.stringify(captured), anonymous.body);
  expect(anonymous.body).not.toMatch(/security-denial|Hash|telemetryProbe/);
});

it('still returns the original denial when the log sink fails', async () => {
  failWarnings = true;
  const denial = new HttpsError('resource-exhausted', 'Too many requests.', { commandError: 'rate-limited', retryAfterSeconds: 7 });
  const response = await call(onCall({ ...CALLABLE_RUNTIME_OPTIONS, enforceAppCheck: false }, async () => { throw denial; }));

  expect(response.status).toBe(429);
  expect(JSON.parse(response.body)).toEqual({ error: {
    message: 'Too many requests.', status: 'RESOURCE_EXHAUSTED', details: { commandError: 'rate-limited', retryAfterSeconds: 7 },
  } });
});

it('builds the exact security denial record with its game hash domain', () => {
  vi.stubEnv('FUNCTION_TARGET', 'rollDice');
  try {
    expect(securityDenialRecord(
      { auth: { uid: 'u-1' } as never, app: undefined, data: { sessionId: 's-1', requestId: 'r-1', sides: 'x' } },
      new HttpsError('invalid-argument', 'PRIVATE PROSE', { commandError: 'malformed-input', secret: 'PRIVATE' }),
    )).toEqual({
      type: 'security-denial', schemaVersion: 1, callableName: 'rollDice', code: 'invalid-argument',
      category: 'schema', commandError: 'malformed-input', authState: 'present', appCheck: 'absent',
      // sha256 of 'dow-security-denial-<kind>\0<value>' (independently computed literals).
      actorHash: '8c489e6422e7aacb402716d3bbdc6427051113b183c68560f2be536f46999d04',
      sessionHash: '1f4fea95bd4473540fd961242e3ee6d4860a3dd4eaada61d04010d139b27a434',
      requestHash: 'f6159a3df379f3172c87fc8bd68c0b83e624ab39ae0b61238f8c82cdf4f2b02d',
      requestFields: ['requestId', 'sessionId', 'sides'],
    });
    expect(securityDenialRecord({ auth: undefined, app: undefined, data: {} },
      new HttpsError('failed-precondition', 'conflict'))).toBeUndefined();
  } finally {
    vi.unstubAllEnvs();
  }
});
