import assert from 'node:assert/strict';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import { createRequire } from 'node:module';
import * as proof from './pc10-browser-session-proof.mjs';

function tableFixture(overrides = {}) {
  const events = [];
  const table = {
    clients: new Map([['core', { errors: [] }], ['press-officer', { errors: [] }]]),
    async writeEvidence(filename, details) {
      events.push({ kind: 'evidence', filename });
      return { sourceCommitAtStart: 'source', sourceCommit: 'source',
        runtimeIndexSha256AtStart: 'index', runtimeIndexSha256AtEnd: 'index',
        runtimeCompiledTreeSha256AtStart: 'tree', runtimeCompiledTreeSha256AtEnd: 'tree',
        errors: [], ...details, ...overrides };
    },
  };
  return { table, events };
}

test('after-overlap acceptance is awaited on the original table before final evidence', async () => {
  assert.equal(typeof proof.completePc10BrowserProof, 'function');
  const { table, events } = tableFixture();
  let release;
  const held = new Promise(resolve => { release = resolve; });
  const result = proof.completePc10BrowserProof(table, {
    details: { checks: { overlappingGameplay: true } },
    afterOverlappingProof: async received => {
      assert.equal(received, table);
      events.push({ kind: 'follow-up-start' });
      await held;
      events.push({ kind: 'follow-up-finished' });
    },
  });
  await Promise.resolve();
  assert.deepEqual(events, [{ kind: 'follow-up-start' }]);
  release();
  const evidence = await result;
  assert.equal(evidence.checks.overlappingGameplay, true);
  assert.equal(evidence.completedAfterOverlappingProof, true);
  assert.deepEqual(events.map(event => event.kind), ['follow-up-start', 'follow-up-finished', 'evidence']);
});

test('a composed acceptance failure propagates without writing a success receipt', async () => {
  assert.equal(typeof proof.completePc10BrowserProof, 'function');
  const { table, events } = tableFixture();
  const failure = new Error('real lease/recovery counterexample');
  await assert.rejects(proof.completePc10BrowserProof(table, {
    afterOverlappingProof: async () => { throw failure; },
  }), error => error === failure);
  assert.deepEqual(events, []);
});

test('browser errors prohibit follow-up acceptance instead of being ignored', async () => {
  assert.equal(typeof proof.completePc10BrowserProof, 'function');
  const { table, events } = tableFixture();
  table.clients.get('press-officer').errors.push('uncaught browser error');
  let followed = false;
  await assert.rejects(proof.completePc10BrowserProof(table, {
    afterOverlappingProof: async () => { followed = true; },
  }), /browser runtime errors/i);
  assert.equal(followed, false);
  assert.deepEqual(events, []);
});

test('unavailable callable observations prohibit accepting a capacity proof', async () => {
  const { table } = tableFixture();
  table.clients.get('core').callableObservationFailures = [{ category: 'response-observation-unavailable' }];
  let followed = false;
  await assert.rejects(proof.completePc10BrowserProof(table, {
    afterOverlappingProof: async () => { followed = true; },
  }), /callable observations/i);
  assert.equal(followed, false);
  const { table: late } = tableFixture({ callableObservationFailures: [{ category: 'observation-drain-timeout' }] });
  await assert.rejects(proof.completePc10BrowserProof(late), /callable observations/i);
});

test('evidence cannot accept source or any compiled Functions byte changes during the run', async () => {
  assert.equal(typeof proof.completePc10BrowserProof, 'function');
  for (const changed of [
    { sourceCommit: 'changed-source' },
    { runtimeIndexSha256AtEnd: 'changed-index' },
    { runtimeCompiledTreeSha256AtEnd: 'changed-helper' },
    { errors: [{ roleId: 'press-officer', message: 'late browser error' }] },
  ]) {
    const { table } = tableFixture(changed);
    await assert.rejects(proof.completePc10BrowserProof(table), /source|runtime|browser runtime errors/i);
  }
});

test('active browser readiness requires fresh same-actor role and console authority', () => {
  assert.equal(typeof proof.isFreshPc10BrowserRole, 'function');
  const core = { hasAuth: true, sameActor: true, hasSession: true, cycle: 1,
    roleId: 'ship-console', activeConsoleRoleId: 'ship-console', connection: 'live', freshness: 'server' };
  assert.equal(proof.isFreshPc10BrowserRole(core, 'ship-console'), true);
  for (const stale of [{ freshness: 'cache' }, { connection: 'offline' },
    { activeConsoleRoleId: null }, { sameActor: false }, { roleId: 'foreign-role' }]) {
    assert.equal(proof.isFreshPc10BrowserRole({ ...core, ...stale }, 'ship-console'), false);
  }
  assert.equal(proof.isFreshPc10BrowserRole({ ...core, roleId: null,
    activeConsoleRoleId: 'press-officer' }, 'press-officer'), true);
});

test('one document observer reads current SDK and store getters without caching identity or projection', () => {
  assert.equal(typeof proof.createPc10LiveObserver, 'function');
  let currentUser = { uid: 'original-browser' };
  let state = { me: { uid: 'original-browser', assignedRoleId: 'core-role', activeConsoleRoleId: 'core-role', seatId: 'core-role' },
    session: { id: 'own-session', phase: 'active', currentTurn: 1 }, connection: 'live', sessionSnapshotFreshness: 'server' };
  let authReads = 0;
  let stateReads = 0;
  const observe = proof.createPc10LiveObserver(() => { authReads++; return { currentUser }; },
    { getState() { stateReads++; return state; } });
  assert.equal(observe().sameActor, true);
  state = { ...state, me: { ...state.me, activeConsoleRoleId: 'press-officer', assignedRoleId: null, seatId: null },
    connection: 'offline', sessionSnapshotFreshness: 'cache' };
  assert.deepEqual(observe(), { hasAuth: true, sameActor: true, hasSession: true,
    roleId: null, activeConsoleRoleId: 'press-officer', seatId: null,
    connection: 'offline', freshness: 'cache', phase: 'active', cycle: 1 });
  currentUser = { uid: 'foreign-browser' };
  assert.equal(observe().sameActor, false);
  assert.equal(authReads, 3);
  assert.equal(stateReads, 3);
});

test('page observation measures live getters and document scheduling without reloading cached modules', async () => {
  assert.equal(typeof proof.observePc10PageIdentity, 'function');
  const events = [];
  let now = 100;
  let reads = 0;
  const live = { sameActor: true, activeConsoleRoleId: 'own-role' };
  const reader = runInNewContext(`(${proof.observePc10PageIdentity.toString()})`, {
    window: { [Symbol.for('pc10-proof-live-observer')]: { read: () => { reads++; return { ...live }; }, bootstrapCount: 1 } },
    document: { visibilityState: 'hidden', hasFocus: () => false }, navigator: { onLine: true },
    performance: { now: () => now++ }, Date: { now: () => 1000 + now }, Symbol,
    console: { debug: value => events.push(value) },
  });
  assert.equal((await reader({ observationId: 1 })).sameActor, true);
  live.sameActor = false;
  assert.equal((await reader({ observationId: 2 })).sameActor, false);
  assert.equal(reads, 2);
  const parsed = events.map(proof.parsePc10IdentityObservationEvent);
  assert.deepEqual(parsed.map(event => event.stage), ['entry', 'read', 'entry', 'read']);
  for (const event of parsed) {
    assert.equal(event.bootstrapRequired, false);
    assert.equal(event.bootstrapCount, 1);
    assert.equal(event.visibility, 'hidden');
    assert.equal(event.focused, false);
    assert.equal(event.online, true);
  }
  assert.equal(parsed[1].getterDurationMs, 1);
  assert.equal(parsed[1].bootstrapDurationMs, 0);
});

test('observation telemetry accepts only timing and document metadata and drops arbitrary private values', () => {
  assert.equal(typeof proof.parsePc10IdentityObservationEvent, 'function');
  const event = { observationId: 7, stage: 'read', browserAt: 1000, bootstrapRequired: false,
    bootstrapCount: 1, visibility: 'visible', focused: true, online: true,
    getterDurationMs: 0.1, bootstrapDurationMs: 0, totalDurationMs: 1,
    uid: 'secret-actor', idToken: 'secret-token', privateHands: ['secret-hand'], notes: 'secret-notes' };
  const parsed = proof.parsePc10IdentityObservationEvent(`PC10_IDENTITY_OBSERVATION:${JSON.stringify(event)}`);
  assert.equal(parsed.observationId, 7);
  assert.equal(parsed.getterDurationMs, 0.1);
  for (const secret of ['secret-actor', 'secret-token', 'secret-hand', 'secret-notes']) {
    assert.equal(JSON.stringify(parsed).includes(secret), false);
  }
  for (const malformed of ['unrelated browser log', 'PC10_IDENTITY_OBSERVATION:not-json',
    `PC10_IDENTITY_OBSERVATION:${JSON.stringify({ ...event, observationId: -1 })}`,
    `PC10_IDENTITY_OBSERVATION:${JSON.stringify({ ...event, stage: 'arbitrary-private-text' })}`]) {
    assert.equal(proof.parsePc10IdentityObservationEvent(malformed), null);
  }
});

test('failure-only server identity diagnosis distinguishes same-actor ready authority from denial without exporting the projection', () => {
  assert.equal(typeof proof.buildPc10ServerIdentityDiagnostic, 'function');
  const actor = { localId: 'private-actor', idToken: 'private-token' };
  const result = { actorUid: actor.localId, sessionId: 'own-session', groupId: 'fleet-alpha',
    connectionGeneration: 7, assignedRoleId: 'dione-president', activeConsoleRoleId: 'dione-president',
    session: { phase: 'active', currentTurn: 1, loyalty: 'private-loyalty', wolfNotes: 'private-notes' } };
  const input = { roleId: 'dione-president', actor, sessionId: 'own-session',
    reply: { status: 200, result }, startedAt: 100, completedAt: 140 };
  const ready = proof.buildPc10ServerIdentityDiagnostic(input);
  assert.equal(ready.sameActor, true);
  assert.equal(ready.sameSession, true);
  assert.equal(ready.roleMatches, true);
  assert.equal(ready.consoleMatches, true);
  assert.equal(ready.serverReady, true);
  assert.equal(ready.connectionGeneration, 7);
  assert.equal(ready.durationMs, 40);
  assert.match(ready.groupHash, /^[a-f0-9]{64}$/);
  for (const secret of ['private-actor', 'private-token', 'private-loyalty', 'private-notes', 'fleet-alpha']) {
    assert.equal(JSON.stringify(ready).includes(secret), false);
  }
  assert.equal(proof.buildPc10ServerIdentityDiagnostic({ ...input,
    reply: { status: 200, result: { ...result, actorUid: 'foreign-actor' } } }).serverReady, false);
  const denied = proof.buildPc10ServerIdentityDiagnostic({ ...input,
    reply: { status: 403, error: { status: 'PERMISSION_DENIED', message: 'private-error-notes' } } });
  assert.equal(denied.projectionAvailable, false);
  assert.equal(denied.serverReady, false);
  assert.equal(denied.denialCode, 'PERMISSION_DENIED');
  assert.equal(JSON.stringify(denied).includes('private-error-notes'), false);
});

test('actual rate-marker diagnosis reports a valid below-budget concurrent window without copying the private document', () => {
  assert.equal(typeof proof.buildPc10RateLimitStateDiagnostic, 'function');
  const require = createRequire(new URL('../functions/package.json', import.meta.url));
  const { evaluateCallableRateLimit, CALLABLE_RATE_LIMIT_POLICIES } = require('../functions/lib/callableRateLimit.js');
  const identity = { callableName: 'resumeSession', sessionId: 'private-session', uid: 'private-uid' };
  const policy = CALLABLE_RATE_LIMIT_POLICIES.resumeSession;
  const opener = evaluateCallableRateLimit(undefined, identity, policy, 61_001);
  assert.equal(opener.allowed, true);
  const input = { identity, stored: opener.state, observedAt: 61_010,
    requestObservation: { startedAt: 61_000, denialCategory: 'rate-limit-state-invalid' } };
  const result = proof.buildPc10RateLimitStateDiagnostic(input);
  assert.equal(result.markerHasExactKeys, true);
  assert.equal(result.markerIdentityMatches, true);
  assert.equal(result.requestCount, 1);
  assert.equal(result.windowStartedAtMs, 61_001);
  assert.equal(result.markerWindowAfterClientRequestStarted, true);
  assert.equal(result.markerWindowAfterFreshTime, false);
  assert.equal(result.freshClockDecision, 'allowed');
  assert.equal(result.maxRequests, 10);
  for (const secret of ['private-session', 'private-uid']) assert.equal(JSON.stringify(result).includes(secret), false);
  assert.equal(proof.buildPc10RateLimitStateDiagnostic({ ...input,
    stored: { ...opener.state, notes: 'hidden-note' } }).freshClockDecision, 'invalid-marker');
  assert.equal(proof.buildPc10RateLimitStateDiagnostic({ ...input,
    observedAt: 61_000 }).freshClockDecision, 'invalid-marker');
});
