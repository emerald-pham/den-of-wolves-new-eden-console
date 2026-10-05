import assert from 'node:assert/strict';
import { test } from 'node:test';
import { proofRuntimeFromViteSource, validateProofRuntime, assertSelectedActor } from './pc10-full-game-demo-proof-helpers.mjs';

const expected = { baseUrl: 'http://127.0.0.1:5174', projectId: 'demo-pc10-owner',
  ports: { auth: 9109, functions: 5011, firestore: 8090 } };
const runtime = { projectId: expected.projectId, useEmulators: true, ports: expected.ports };

test('validates only the explicitly owned isolated runtime', () => {
  assert.deepEqual(validateProofRuntime(runtime, expected), runtime);
  for (const changed of [{ ...runtime, projectId: 'dow-new-eden-console' },
    { ...runtime, projectId: 'demo-other-worker' }, { ...runtime, useEmulators: false },
    { ...runtime, ports: { ...runtime.ports, functions: 5051 } }]) {
    assert.throws(() => validateProofRuntime(changed, expected));
  }
  assert.throws(() => validateProofRuntime(runtime, { ...expected, baseUrl: 'https://production.example' }));
});

test('reads bounded runtime fields from Vite without executing or returning other values', () => {
  const env = { VITE_USE_EMULATORS: '1', VITE_FIREBASE_PROJECT_ID: expected.projectId,
    VITE_FIREBASE_AUTH_EMULATOR_PORT: '9109', VITE_FIREBASE_FUNCTIONS_EMULATOR_PORT: '5011',
    VITE_FIREBASE_FIRESTORE_EMULATOR_PORT: '8090', PRIVATE_TEST_VALUE: 'never include' };
  assert.deepEqual(proofRuntimeFromViteSource(`import.meta.env = ${JSON.stringify(env)};\nexport const unrelated = false;`), runtime);
  assert.throws(() => proofRuntimeFromViteSource('export const runtime = true;'));
});

test('a selected actor must be the same real SDK/member/profile identity', () => {
  const target = { sessionId: 'fresh-session', roleId: 'admiral', uidHash: 'verified-real-uid-hash' };
  const current = { sessionId: target.sessionId, profileRoleId: target.roleId, uidHash: target.uidHash,
    sameActor: true, playerRole: 'player', connection: 'live', freshness: 'server' };
  assert.doesNotThrow(() => assertSelectedActor(current, target));
  for (const changed of [{ ...current, uidHash: 'another-uid' }, { ...current, sameActor: false },
    { ...current, sessionId: 'old-session' }, { ...current, profileRoleId: 'wing-commander' },
    { ...current, playerRole: 'gm' }, { ...current, freshness: 'cache' }]) {
    assert.throws(() => assertSelectedActor(changed, target));
  }
});

test('crew preparation retries only the offered ordinary transient recovery', async () => {
  const { completePreparedCrew } = await import('./pc10-full-game-demo-proof-helpers.mjs');
  const snapshots = [
    { actorCount: 4, live: false, retryEnabled: true, error: 'Demo preparation stopped. Reconnect and retry from the crew controller.' },
    { actorCount: 4, live: true, retryEnabled: true, error: 'Demo preparation stopped. Reconnect and retry from the crew controller.' },
    { actorCount: 11, live: true, retryEnabled: false, error: '' },
    { actorCount: 11, live: true, retryEnabled: true, error: 'Demo preparation stopped. Reconnect and retry.' },
    { actorCount: 21, live: true, retryEnabled: true, error: '' },
  ];
  let index = 0, retries = 0, time = 0;
  assert.equal(await completePreparedCrew({ inspect: async () => snapshots[index++],
    retry: async () => { retries += 1; }, now: () => time, wait: async () => { time += 1; } }), 2);
  assert.equal(retries, 2);
});

test('crew retry never substitutes identity recovery or an unlimited retry loop', async () => {
  const { completePreparedCrew } = await import('./pc10-full-game-demo-proof-helpers.mjs');
  let retries = 0, time = 0;
  await assert.rejects(completePreparedCrew({ inspect: async () => ({ actorCount: 0, live: true, retryEnabled: true,
    error: 'The saved demo actor identity is unavailable. Restore this browser’s saved data.' }),
    retry: async () => { retries += 1; } }), /identity is unavailable/);
  await assert.rejects(completePreparedCrew({ inspect: async () => ({ actorCount: 4, live: true, retryEnabled: true,
    error: 'Demo preparation stopped. Reconnect and retry.' }), retry: async () => { retries += 1; },
    maxRetries: 1, now: () => time, wait: async () => { time += 1; } }), /retry limit/);
  assert.equal(retries, 1);
});
