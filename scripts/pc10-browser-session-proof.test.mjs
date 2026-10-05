import assert from 'node:assert/strict';
import test from 'node:test';
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
