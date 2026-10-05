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

const presentationActor = (name, overrides = {}) => {
  const gm = name === 'gm';
  const expected = {
    hasAuth: true, sessionId: 'fresh-presentation-session', uidHash: `${name}-uid-hash`,
    profileRoleId: gm ? null : 'controller', playerRole: gm ? 'gm' : 'player',
    assignedRoleId: null, activeConsoleRoleId: null, instanceId: gm ? 'owned-gm-instance' : null,
    gmInstanceOwned: gm,
  };
  return {
    name, expected,
    inspect: async () => ({ ...expected, sameActor: true, connection: 'live', freshness: 'server', cycle: 1,
      announcementTurn: 1, announcementRevision: 4, naturalTransmissionMounted: false,
      ordinaryBriefingMounted: false, ordinaryBriefingHeld: false, ...overrides }),
    paintTwoFrames: async () => {},
  };
};

test('presentation readiness waits for each actual delayed transmission to mount and detach before two paint frames', async () => {
  const { waitForFullGamePresentationReady } = await import('./pc10-full-game-demo-proof-helpers.mjs');
  const gm = presentationActor('gm'), crew = presentationActor('crew');
  let gmInspections = 0, crewInspections = 0, gmFrames = 0, crewFrames = 0, time = 0;
  gm.inspect = async () => ({ ...await presentationActor('gm').inspect(),
    naturalTransmissionMounted: ++gmInspections === 3 });
  crew.inspect = async () => ({ ...await presentationActor('crew').inspect(),
    naturalTransmissionMounted: ++crewInspections === 3 });
  gm.paintTwoFrames = async () => { gmFrames += 1; };
  crew.paintTwoFrames = async () => { crewFrames += 1; };
  const result = await waitForFullGamePresentationReady({ expectedAnnouncement: { turn: 1, revision: 4 }, actors: [gm, crew],
    now: () => time, wait: async () => { time += 1; } });
  assert.equal(result.status, 'ready');
  assert.equal(result.actorCount, 2);
  assert.ok(gmInspections >= 5 && crewInspections >= 5, 'An initial unpainted DOM cannot be mistaken for a detached transmission.');
  assert.equal(gmFrames, 1); assert.equal(crewFrames, 1);
});

test('presentation readiness catches a natural transmission reappearing during its two-frame settling boundary', async () => {
  const { waitForFullGamePresentationReady } = await import('./pc10-full-game-demo-proof-helpers.mjs');
  const gm = presentationActor('gm'), crew = presentationActor('crew');
  const gmCounts = { inspections: 0, frames: 0 }, crewCounts = { inspections: 0, frames: 0 };
  let time = 0;
  for (const [actor, counts] of [[gm, gmCounts], [crew, crewCounts]]) {
    actor.inspect = async () => ({ ...await presentationActor(actor.name).inspect(),
      naturalTransmissionMounted: ++counts.inspections === 1 || counts.inspections === 3 });
    actor.paintTwoFrames = async () => { counts.frames += 1; };
  }
  await waitForFullGamePresentationReady({ expectedAnnouncement: { turn: 1, revision: 4 }, actors: [gm, crew],
    now: () => time, wait: async () => { time += 1; } });
  assert.equal(gmCounts.inspections, 5); assert.equal(crewCounts.inspections, 5);
  assert.equal(gmCounts.frames, 2); assert.equal(crewCounts.frames, 2);
});

test('presentation readiness rejects actor, session, or role authority changes before and after paint', async () => {
  const { waitForFullGamePresentationReady } = await import('./pc10-full-game-demo-proof-helpers.mjs');
  const gm = presentationActor('gm'), crew = presentationActor('crew');
  let gmInspections = 0, time = 0;
  gm.inspect = async () => ({ ...await presentationActor('gm').inspect(),
    naturalTransmissionMounted: ++gmInspections === 1,
    ...(gmInspections >= 3 ? { uidHash: 'replacement-uid-hash' } : {}) });
  await assert.rejects(waitForFullGamePresentationReady({ expectedAnnouncement: { turn: 1, revision: 4 }, actors: [gm, crew],
    now: () => time, wait: async () => { time += 1; } }), /uidHash/);

  for (const changed of [{ sessionId: 'old-session' }, { profileRoleId: 'different-role' },
    { activeConsoleRoleId: 'different-console' }, { gmInstanceOwned: false }, { freshness: 'cached' }]) {
    const actor = presentationActor('gm', changed);
    await assert.rejects(waitForFullGamePresentationReady({ expectedAnnouncement: { turn: 1, revision: 4 }, actors: [actor, crew],
      now: () => time, wait: async () => { time += 1; } }));
  }
});

test('GM and crew share one fixed 60-second presentation-readiness budget', async () => {
  const { waitForFullGamePresentationReady } = await import('./pc10-full-game-demo-proof-helpers.mjs');
  let now = 0, inspections = 0, paints = 0;
  const actors = ['gm', 'crew'].map(name => {
    const actor = presentationActor(name, { naturalTransmissionMounted: true });
    actor.inspect = async () => { inspections += 1; return { ...await presentationActor(name).inspect(), naturalTransmissionMounted: true }; };
    actor.paintTwoFrames = async () => { paints += 1; };
    return actor;
  });
  await assert.rejects(waitForFullGamePresentationReady({ expectedAnnouncement: { turn: 1, revision: 4 }, actors,
    now: () => now, wait: async () => { now += 30_000; } }), /60-second readiness budget/);
  assert.equal(now, 60_000);
  assert.equal(inspections, 4, 'Both surfaces are observed within the same deadline, not one budget per page.');
  assert.equal(paints, 0);
});

test('an unacknowledged held cycle briefing remains a blocker and is never cleared by the readiness helper', async () => {
  const { waitForFullGamePresentationReady } = await import('./pc10-full-game-demo-proof-helpers.mjs');
  let now = 0, clears = 0, inspections = 0;
  const actors = ['gm', 'crew'].map(name => {
    const actor = presentationActor(name);
    let actorInspections = 0;
    actor.inspect = async () => {
      inspections += 1; actorInspections += 1;
      return { ...await presentationActor(name).inspect(),
        naturalTransmissionMounted: actorInspections === 1,
        ordinaryBriefingMounted: true, ordinaryBriefingHeld: true };
    };
    return { ...actor, clearBriefing: async () => { clears += 1; } };
  });
  await assert.rejects(waitForFullGamePresentationReady({ expectedAnnouncement: { turn: 1, revision: 4 }, actors,
    now: () => now, wait: async () => { now += 30_000; } }), /60-second readiness budget/);
  assert.equal(inspections, 4, 'The natural transmission detaches but the held briefing alone prevents readiness.');
  assert.equal(clears, 0);
});

test('the original healthy Cycle 0 projection waits for the real Cycle 1 marker, mount, detach and paint', async () => {
  const { waitForFullGamePresentationReady } = await import('./pc10-full-game-demo-proof-helpers.mjs');
  const gm = presentationActor('gm'), crew = presentationActor('crew');
  let gmReads = 0, crewReads = 0, paints = 0, time = 0;
  gm.inspect = async () => ({ ...await presentationActor('gm').inspect(),
    naturalTransmissionMounted: ++gmReads === 1 });
  crew.inspect = async () => {
    crewReads += 1;
    const original = await presentationActor('crew').inspect();
    if (crewReads <= 2) return { ...original, cycle: 0, phase: 'casting',
      fullGameDemo: { status: 'preparing', progression: 'manual' },
      announcementTurn: null, announcementRevision: null, naturalTransmissionMounted: false };
    return { ...original, naturalTransmissionMounted: crewReads === 3 };
  };
  gm.paintTwoFrames = crew.paintTwoFrames = async () => { paints += 1; };
  const result = await waitForFullGamePresentationReady({ expectedAnnouncement: { turn: 1, revision: 4 },
    actors: [gm, crew], now: () => time, wait: async () => { time += 1; } });
  assert.equal(result.status, 'ready');
  assert.equal(result.originalActorsConfirmed, true);
  assert.equal(result.naturalTransmissionObservedAndDetached, true);
  assert.ok(crewReads >= 5, 'The prior snapshot and the new transmission cannot be accepted before actual detach and paint.');
  assert.equal(paints, 2, 'Both original pages still provide their actual two-frame boundary.');
});

test('a healthy Cycle 0 that never receives Cycle 1 cannot extend the shared readiness deadline or earn credit', async () => {
  const { waitForFullGamePresentationReady } = await import('./pc10-full-game-demo-proof-helpers.mjs');
  const gm = presentationActor('gm'), crew = presentationActor('crew', { cycle: 0, phase: 'casting',
    fullGameDemo: { status: 'preparing', progression: 'manual' }, announcementTurn: null, announcementRevision: null });
  let time = 0, paints = 0;
  gm.paintTwoFrames = crew.paintTwoFrames = async () => { paints += 1; };
  await assert.rejects(waitForFullGamePresentationReady({ expectedAnnouncement: { turn: 1, revision: 4 },
    actors: [gm, crew], now: () => time, wait: async () => { time += 20_000; } }), /60-second readiness budget/);
  assert.equal(time, 60_000);
  assert.equal(paints, 0);
});

test('prior-cycle waiting never accepts a future cycle, wrong marker or foreign authenticated actor', async () => {
  const { waitForFullGamePresentationReady } = await import('./pc10-full-game-demo-proof-helpers.mjs');
  for (const changed of [
    { cycle: 2, announcementTurn: 2 },
    { cycle: 0, phase: 'casting', fullGameDemo: { status: 'preparing', progression: 'manual' },
      announcementTurn: 2, announcementRevision: 4 },
    { cycle: 0, phase: 'casting', fullGameDemo: { status: 'preparing', progression: 'manual' },
      announcementTurn: null, announcementRevision: null, uidHash: 'foreign-account' },
  ]) {
    const gm = presentationActor('gm'), crew = presentationActor('crew', changed);
    let time = 0;
    await assert.rejects(waitForFullGamePresentationReady({ expectedAnnouncement: { turn: 1, revision: 4 },
      actors: [gm, crew], now: () => time, wait: async () => { time += 20_000; } }));
    assert.equal(time, 0, 'A different source cycle, marker or account is rejected immediately.');
  }
});

const demoStartActor = (profileRoleId, uidHash, overrides = {}) => ({
  hasAuth: true, sameActor: true, uidHash, sessionId: 'fresh-presentation-session',
  playerRole: 'player', profileRoleId, assignedRoleId: profileRoleId === 'press-officer' || profileRoleId === 'controller' ? null : profileRoleId,
  activeConsoleRoleId: profileRoleId === 'controller' ? null : profileRoleId,
  instanceId: null, gmInstanceOwned: false, connection: 'live', freshness: 'server',
  cycle: 0, phase: 'casting', setupConfirmed: true,
  fullGameDemo: { status: 'preparing', progression: 'manual' },
  activeRoleIds: ['admiral', 'shepherd-scientist'], pressEnabled: true,
  ...overrides,
});

const demoStartActorOptions = {
  sessionId: 'fresh-presentation-session',
  controller: { sessionId: 'fresh-presentation-session', uidHash: 'controller-uid-hash' },
  confirmedRoleIds: ['admiral', 'shepherd-scientist'],
  pressIncluded: true,
  roster: [
    { roleId: 'admiral', uidHash: 'admiral-uid-hash' },
    { roleId: 'shepherd-scientist', uidHash: 'scientist-uid-hash' },
    { roleId: 'press-officer', uidHash: 'press-uid-hash' },
  ],
};

test('presentation start identity follows the legitimate controller-to-known-Press handoff without changing the admission snapshot', async () => {
  const { captureFullGameDemoPresentationActor } = await import('./pc10-full-game-demo-proof-helpers.mjs');
  assert.equal(typeof captureFullGameDemoPresentationActor, 'function');
  const initialController = demoStartActor('controller', demoStartActorOptions.controller.uidHash,
    { activeRoleIds: ['admiral', 'shepherd-scientist'] });
  const press = demoStartActor('press-officer', 'press-uid-hash');
  const captured = captureFullGameDemoPresentationActor(press, demoStartActorOptions);
  assert.equal(captured.profileRoleId, 'press-officer');
  assert.equal(captured.uidHash, 'press-uid-hash');
  assert.equal(captured.assignedRoleId, null);
  assert.equal(captured.activeConsoleRoleId, 'press-officer');
  assert.ok(Object.isFrozen(captured), 'Start identity is an immutable snapshot, not a live actor object.');
  assert.equal(initialController.profileRoleId, 'controller', 'Admission and manager-Back evidence keeps the original controller.');
  assert.equal(initialController.uidHash, 'controller-uid-hash');
});

test('presentation start identity also accepts another confirmed, assigned original demo persona', async () => {
  const { captureFullGameDemoPresentationActor } = await import('./pc10-full-game-demo-proof-helpers.mjs');
  assert.equal(typeof captureFullGameDemoPresentationActor, 'function');
  const scientist = captureFullGameDemoPresentationActor(
    demoStartActor('shepherd-scientist', 'scientist-uid-hash'), demoStartActorOptions);
  assert.equal(scientist.profileRoleId, 'shepherd-scientist');
  assert.equal(scientist.uidHash, 'scientist-uid-hash');
  assert.equal(scientist.assignedRoleId, 'shepherd-scientist');
  assert.equal(scientist.activeConsoleRoleId, 'shepherd-scientist');
});

test('presentation start identity rejects foreign, stale, reassigned, unknown, and wrong-session actors', async () => {
  const { captureFullGameDemoPresentationActor } = await import('./pc10-full-game-demo-proof-helpers.mjs');
  assert.equal(typeof captureFullGameDemoPresentationActor, 'function');
  const press = demoStartActor('press-officer', 'press-uid-hash');
  for (const changed of [
    { uidHash: 'foreign-uid-hash' },
    { connection: 'connecting' },
    { freshness: 'cache' },
    { sameActor: false },
    { assignedRoleId: 'admiral' },
    { activeConsoleRoleId: 'admiral' },
    { profileRoleId: 'unknown-persona' },
    { sessionId: 'another-session' },
    { phase: 'active' },
    { setupConfirmed: false },
    { fullGameDemo: { status: 'active', progression: 'manual' } },
  ]) {
    assert.throws(() => captureFullGameDemoPresentationActor({ ...press, ...changed }, demoStartActorOptions));
  }
  assert.throws(() => captureFullGameDemoPresentationActor(
    demoStartActor('admiral', 'unlisted-uid-hash'), demoStartActorOptions));
  assert.throws(() => captureFullGameDemoPresentationActor(
    demoStartActor('controller', 'foreign-controller-uid'), demoStartActorOptions));
});

test('presentation readiness treats connecting/cache projections as pending, then requires the same actors live and server-fresh', async () => {
  const { waitForFullGamePresentationReady } = await import('./pc10-full-game-demo-proof-helpers.mjs');
  const gm = presentationActor('gm'), crew = presentationActor('crew');
  let now = 0;
  const inspections = { gm: 0, crew: 0 };
  for (const [actor, label] of [[gm, 'gm'], [crew, 'crew']]) {
    actor.inspect = async () => {
      inspections[label] += 1;
      const fresh = inspections[label] >= 3;
      const base = await presentationActor(label).inspect();
      return fresh ? { ...base, naturalTransmissionMounted: inspections[label] === 3 }
        : { ...base, sessionId: null, sameActor: false, playerRole: null,
        assignedRoleId: null, activeConsoleRoleId: null, instanceId: null,
        gmInstanceOwned: false, connection: 'connecting', freshness: 'cache' };
    };
    actor.paintTwoFrames = async () => {};
  }
  const result = await waitForFullGamePresentationReady({ expectedAnnouncement: { turn: 1, revision: 4 }, actors: [gm, crew],
    now: () => now, wait: async () => { now += 1; } });
  assert.equal(result.status, 'ready');
  assert.ok(inspections.gm >= 5 && inspections.crew >= 5, 'Both original actors were revalidated after the stale cache phase.');
});
