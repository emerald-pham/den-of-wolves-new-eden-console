import assert from 'node:assert/strict';
import { test } from 'node:test';
import { proofRuntimeFromViteSource, validateProofRuntime, assertSelectedActor } from './pc10-full-game-demo-proof-helpers.mjs';

const expected = { baseUrl: 'http://127.0.0.1:5174', projectId: 'demo-pc10-owner',
  ports: { auth: 9109, functions: 5011, firestore: 8090 } };
const runtime = { projectId: expected.projectId, useEmulators: true, ports: expected.ports };

test('full-game start recovery accepts only the exact original committed receipt', async () => {
  const { assertExactFullGameStartRecovery } = await import('./pc10-full-game-demo-proof-helpers.mjs');
  const payload = { sessionId: 'fresh-session', instanceId: 'live-gm-instance', requestId: 'actual-ui-request',
    expectedSetupRevision: 2, fullGameDemo: true };
  const original = { status: 'committed', sessionId: payload.sessionId, requestId: payload.requestId,
    currentTurn: 1, setupRevision: 2, serverTime: '2026-10-05T12:00:00.000Z' };
  assert.doesNotThrow(() => assertExactFullGameStartRecovery({ payload, original,
    replay: { ...original, status: 'replayed' }, expected: payload }));
});

test('a denied, replaced or different full-game start never earns recovery credit', async () => {
  const { assertExactFullGameStartRecovery } = await import('./pc10-full-game-demo-proof-helpers.mjs');
  assert.equal(typeof assertExactFullGameStartRecovery, 'function');
  const payload = { sessionId: 'fresh-session', instanceId: 'live-gm-instance', requestId: 'actual-ui-request',
    expectedSetupRevision: 2, fullGameDemo: true };
  const original = { status: 'committed', sessionId: payload.sessionId, requestId: payload.requestId,
    currentTurn: 1, setupRevision: 2 };
  const replay = { ...original, status: 'replayed' };
  for (const invalid of [
    { payload: { ...payload, fullGameDemo: false } },
    { payload: { ...payload, expectedSetupRevision: -1 } },
    { payload: { ...payload, instanceId: 'foreign-instance' } },
    { original: { ...original, status: 'replayed' } },
    { replay: { ...replay, requestId: 'another-request' } },
    { replay: { ...replay, currentTurn: 2 } },
    { replay: { ...replay, setupRevision: 3 } },
    { replay: { ...replay, status: 'committed' } },
  ]) assert.throws(() => assertExactFullGameStartRecovery({ payload, original, replay, expected: payload, ...invalid }));
});

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

test('ordinary eleven-role preparation waits for exactly its twelve real role and Press actors', async () => {
  const { completePreparedCrew } = await import('./pc10-full-game-demo-proof-helpers.mjs');
  let time = 0, waited = false;
  assert.equal(await completePreparedCrew({ expectedActorCount: 12,
    inspect: async () => ({ actorCount: 12, live: true, retryEnabled: false, error: '' }),
    retry: async () => { throw new Error('No retry is needed.'); },
    now: () => time, timeoutMs: 2, wait: async () => { waited = true; time += 1; } }), 0);
  assert.equal(waited, false);
});

test('ordinary preparation rejects impossible expected actor counts', async () => {
  const { completePreparedCrew } = await import('./pc10-full-game-demo-proof-helpers.mjs');
  await assert.rejects(completePreparedCrew({ expectedActorCount: 22,
    inspect: async () => ({ actorCount: 21, live: true, retryEnabled: false, error: '' }),
    retry: async () => {} }), /actor count/i);
});

test('ending observation accepts the authoritative final-cycle snapshot without a generic game outcome', async () => {
  const { isObservedGameEnding } = await import('./pc10-full-game-demo-proof-helpers.mjs');
  const ended = { phase: 'debrief', cycle: 8, gameOutcomeCause: null, debriefType: 'session-debrief', debriefVersion: 1,
    debriefSource: 'final-cycle', debriefResult: 'completed', debriefCause: 'final-cycle', debriefCycle: 8 };
  assert.equal(isObservedGameEnding(ended), true);
  assert.equal(isObservedGameEnding({ ...ended, phase: 'closed' }), true);
  for (const changed of [{ phase: 'active' }, { debriefType: null }, { debriefCycle: 7 }, { debriefResult: 'success' }]) {
    assert.equal(isObservedGameEnding({ ...ended, ...changed }), false);
  }
  assert.equal(isObservedGameEnding({ ...ended, debriefSource: 'candidate', debriefResult: 'success', debriefCause: 'candidate-complete' }), true);
  assert.equal(isObservedGameEnding({ ...ended, debriefSource: 'failure-review', debriefResult: 'failure', debriefCause: 'pursuit-limit' }), true);
});

test('fresh ending proof distinguishes a real pursuit failure from final-cycle completion', async () => {
  const { assertFreshEndingBranch } = await import('./pc10-full-game-cycle-ending.mjs');
  const completed = { source: 'final-cycle', result: 'completed', cause: 'final-cycle', cycle: 8 };
  const pursuit = { source: 'failure-review', result: 'failure', cause: 'pursuit-limit', cycle: 5 };
  assert.doesNotThrow(() => assertFreshEndingBranch(completed, { branch: 'final-cycle', cycle: 8, limit: 8 }));
  assert.doesNotThrow(() => assertFreshEndingBranch(pursuit, { branch: 'pursuit-limit', cycle: 5, limit: 8 }));
  assert.throws(() => assertFreshEndingBranch(pursuit, { branch: 'final-cycle', cycle: 5, limit: 8 }));
  assert.throws(() => assertFreshEndingBranch(completed, { branch: 'pursuit-limit', cycle: 8, limit: 8 }));
  for (const changed of [{ cycle: 4 }, { source: 'candidate' }, { cause: 'total-fleet-loss' }, { result: 'success' }]) {
    assert.throws(() => assertFreshEndingBranch({ ...pursuit, ...changed }, { branch: 'pursuit-limit', cycle: 5, limit: 8 }));
  }
});

const setupActor = { sessionId: 'fresh-setup', uidHash: 'real-gm-hash', instanceId: 'live-gm-instance' };
const liveSetup = { ...setupActor, hasAuth: true, sameActor: true, playerRole: 'gm', gmInstanceOwned: true,
  cycle: 0, phase: 'lobby', connection: 'live', freshness: 'server', confirmEnabled: true,
  confirmed: false, setupRequestCount: 0, rosterStatus: '' };
const offeredSetupRetry = 'Roster confirmation rejected // review the live setup and retry.';

test('setup UI waits for live authority before its single normal confirmation click', async () => {
  const { confirmPreparedSetup } = await import('./pc10-full-game-demo-proof-helpers.mjs');
  const states = [{ ...liveSetup, connection: 'connecting', confirmEnabled: false },
    liveSetup, { ...liveSetup, setupRequestCount: 1, confirmed: true }];
  let index = 0, clicks = 0, time = 0;
  const result = await confirmPreparedSetup({ expected: setupActor, inspect: async () => states[index++],
    click: async () => { clicks += 1; }, now: () => time, wait: async () => { time += 1; } });
  assert.equal(result.clicks, 1); assert.equal(clicks, 1);
});

test('setup retries once only after observed freshness loss and the visible no-RPC retry offer', async () => {
  const { confirmPreparedSetup } = await import('./pc10-full-game-demo-proof-helpers.mjs');
  const states = [liveSetup,
    { ...liveSetup, connection: 'connecting', confirmEnabled: false, rosterStatus: offeredSetupRetry },
    { ...liveSetup, rosterStatus: offeredSetupRetry },
    { ...liveSetup, setupRequestCount: 1, confirmed: true }];
  let index = 0, clicks = 0, time = 0;
  const result = await confirmPreparedSetup({ expected: setupActor, inspect: async () => states[index++],
    click: async () => { clicks += 1; }, now: () => time, wait: async () => { time += 1; } });
  assert.equal(result.clicks, 2); assert.equal(clicks, 2);
});

test('setup recovery never changes actor or retries an actual server rejection', async () => {
  const { confirmPreparedSetup } = await import('./pc10-full-game-demo-proof-helpers.mjs');
  for (const changed of [{ uidHash: 'wrong-gm' }, { sessionId: 'old-game' }, { instanceId: 'old-instance' },
    { sameActor: false }, { gmInstanceOwned: false }, { playerRole: 'player' }, { cycle: 1 }, { phase: 'closed' }]) {
    let clicks = 0;
    await assert.rejects(confirmPreparedSetup({ expected: setupActor, inspect: async () => ({ ...liveSetup, ...changed }),
      click: async () => { clicks += 1; } }));
    assert.equal(clicks, 0);
  }
  let index = 0, clicks = 0, time = 0;
  const states = [liveSetup, { ...liveSetup, connection: 'connecting', confirmEnabled: false },
    { ...liveSetup, setupRequestCount: 1, rosterStatus: offeredSetupRetry }];
  await assert.rejects(confirmPreparedSetup({ expected: setupActor, inspect: async () => states[index++],
    click: async () => { clicks += 1; }, now: () => time, wait: async () => { time += 1; } }), /not a recoverable local freshness rejection/);
  assert.equal(clicks, 1);
});

test('setup recovery does not retry an unexplained rejection or a second local failure', async () => {
  const { confirmPreparedSetup } = await import('./pc10-full-game-demo-proof-helpers.mjs');
  for (const states of [[liveSetup, { ...liveSetup, rosterStatus: offeredSetupRetry }],
    [liveSetup, { ...liveSetup, connection: 'connecting', confirmEnabled: false, rosterStatus: offeredSetupRetry },
      { ...liveSetup, rosterStatus: offeredSetupRetry }, { ...liveSetup, rosterStatus: offeredSetupRetry }]]) {
    let index = 0, clicks = 0, time = 0;
    await assert.rejects(confirmPreparedSetup({ expected: setupActor, inspect: async () => states[index++],
      click: async () => { clicks += 1; }, now: () => time, wait: async () => { time += 1; } }), /not a recoverable local freshness rejection/);
    assert.ok(clicks <= 2);
  }
});

test('manual cycle advance follows the offered first-click commitment without inventing confirmation', async () => {
  const { completeOfferedTurnAdvance } = await import('./pc10-full-game-demo-proof-helpers.mjs');
  const expected = { sessionId: 'fresh', uidHash: 'gm-hash', instanceId: 'owned', cycle: 1 };
  let cycle = 1, first = 0, second = 0, time = 0;
  const inspect = async () => ({ ...expected, cycle, phase: 'active', sameActor: true,
    playerRole: 'gm', gmInstanceOwned: true, connection: 'live', freshness: 'server', confirmationOffered: false });
  const result = await completeOfferedTurnAdvance({ expected, inspect,
    clickAdvance: async () => { first += 1; cycle = 2; },
    clickConfirmation: async () => { second += 1; throw new Error('Manual UI offers no confirmation.'); },
    now: () => time, wait: async () => { time += 1; } });
  assert.equal(first, 1); assert.equal(second, 0); assert.equal(result.current.cycle, 2);
});

test('a timer-held advance clicks only its actually offered confirmation and preserves actor authority', async () => {
  const { completeOfferedTurnAdvance } = await import('./pc10-full-game-demo-proof-helpers.mjs');
  const expected = { sessionId: 'fresh', uidHash: 'gm-hash', instanceId: 'owned', cycle: 6 };
  let offered = false, phase = 'active', first = 0, second = 0, time = 0;
  const inspect = async () => ({ ...expected, phase, sameActor: true, playerRole: 'gm',
    gmInstanceOwned: true, connection: 'live', freshness: 'server', confirmationOffered: offered });
  const result = await completeOfferedTurnAdvance({ expected, inspect,
    clickAdvance: async () => { first += 1; offered = true; },
    clickConfirmation: async () => { second += 1; phase = 'debrief'; offered = false; },
    now: () => time, wait: async () => { time += 1; } });
  assert.equal(first, 1); assert.equal(second, 1); assert.equal(result.current.phase, 'debrief');
  first = 0; second = 0; phase = 'active'; offered = false;
  await assert.rejects(completeOfferedTurnAdvance({ expected,
    inspect: async () => ({ ...(await inspect()), uidHash: offered ? 'foreign' : expected.uidHash }),
    clickAdvance: async () => { first += 1; offered = true; },
    clickConfirmation: async () => { second += 1; },
    now: () => time, wait: async () => { time += 1; } }));
  assert.equal(first, 1); assert.equal(second, 0);
});
