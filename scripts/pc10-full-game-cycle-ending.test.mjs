import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { consumeFullGameEnding, runEnding } from './pc10-full-game-cycle-ending.mjs';
import { isObservedGameEnding } from './pc10-full-game-demo-proof-helpers.mjs';

function endingConsumerFixture() {
  const sessionId = 'fresh-ending-session';
  const instanceId = 'original-gm-instance';
  const uidHash = 'original-gm-uid-hash';
  const snapshot = { type: 'session-debrief', version: 1, source: 'final-cycle',
    result: 'completed', cause: 'final-cycle', cycle: 8 };
  const reply = { status: 'committed', result: { type: 'session-debrief', sessionId, snapshot } };
  let phase = 'debrief';
  const calls = { waits: [], gmObservations: [], gmReads: [], crewReads: [], gmCloseClicks: 0, crewReloads: 0 };

  const observation = actor => actor === 'gm' ? ({
    hasAuth: true, sameActor: true, sessionId, uidHash, playerRole: 'gm', gmInstanceOwned: true,
    instanceId, cycle: 8, phase, connection: 'live', freshness: 'server',
    fullGameDemo: { status: 'complete', progression: 'manual' },
    debriefType: null, debriefVersion: null, debriefSource: null, debriefResult: null,
    debriefCause: null, debriefCycle: null,
  }) : ({
    hasAuth: true, sameActor: true, sessionId, uidHash: 'original-crew-uid-hash',
    playerRole: 'player', profileRoleId: 'crew-role', gmInstanceOwned: false, instanceId: null,
    cycle: 8, phase, connection: 'live', freshness: 'server',
  });

  function page(actor) {
    return {
      on() {},
      off() {},
      evaluate: async () => ({
        cycle: 8, limit: 8, phase, airspace: 'lifted', progression: 'manual',
        trainingStatus: 'complete', sessionId, instanceId, live: true, ownsGm: true,
        pursuitEmergencyStatus: null, debriefSource: undefined, debriefResult: undefined,
      }),
      getByRole(role, options) {
        if (role === 'dialog' && options.name === 'Endgame evaluation') return { waitFor: async () => {} };
        if (role === 'button' && options.name === 'Close session') return { click: async () => {
          calls.gmCloseClicks += 1;
          phase = 'closed';
        } };
        throw new Error('Unexpected ' + actor + ' control: ' + role + ' ' + JSON.stringify(options));
      },
      screenshot: async () => {},
      reload: async () => { if (actor === 'crew') calls.crewReloads += 1; },
    };
  }

  const gm = {
    page: page('gm'),
    storeModuleUrl: () => 'test-store-module',
    observe: async () => {
      const current = observation('gm');
      calls.gmObservations.push(current);
      return current;
    },
    until: async (description, predicate, timeoutMs = 60_000) => {
      calls.waits.push({ description, timeoutMs });
      const current = await gm.observe();
      if (predicate(current)) return current;
      throw new Error(description + ': original finite observation deadline expired');
    },
    callable: async (endpoint, payload) => {
      calls.gmReads.push({ endpoint, payload });
      return reply;
    },
  };
  const crew = {
    page: page('crew'),
    observe: async () => observation('crew'),
    until: async (description, predicate, timeoutMs = 60_000) => {
      calls.waits.push({ description, timeoutMs });
      const current = observation('crew');
      if (predicate(current)) return current;
      throw new Error(description + ': original finite observation deadline expired');
    },
    callable: async (endpoint, payload) => {
      calls.crewReads.push({ endpoint, payload });
      return { status: 'denied', code: 'functions/permission-denied' };
    },
  };
  return { gm, crew, sessionId, instanceId, uidHash, snapshot, reply, calls,
    initial: { sessionId, joinCode: 'ordinary-code' },
    started: { sessionId, uidHash, instanceId, cycle: 1 },
    originalGm: { sessionId, uidHash, instanceId, playerRole: 'gm', gmInstanceOwned: true },
  };
}

test('fresh ending consumes the entitled private debrief when public observation omits it, then closes and reloads history', async t => {
  const directory = await mkdtemp(resolve(tmpdir(), 'pc10-full-game-ending-consumer-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const fixture = endingConsumerFixture();
  const publicBefore = await fixture.gm.observe();
  assert.equal(publicBefore.debriefType, null, 'The ordinary session projection omits the private debrief.');
  assert.equal(publicBefore.debriefSource, null);

  await runEnding({ gm: fixture.gm, crew: fixture.crew, initial: fixture.initial,
    started: fixture.started, directory });

  assert.equal(fixture.calls.gmReads.filter(call => call.endpoint === 'getSessionDebrief').length, 2);
  assert.deepEqual(fixture.calls.gmReads[0], {
    endpoint: 'getSessionDebrief', payload: { sessionId: fixture.sessionId, instanceId: fixture.instanceId },
  });
  assert.deepEqual(fixture.calls.crewReads, [{ endpoint: 'getSessionDebrief',
    payload: { sessionId: fixture.sessionId, instanceId: fixture.instanceId } }]);
  assert.equal(fixture.calls.gmCloseClicks, 1, 'The actual GM close control completes the ending.');
  assert.equal(fixture.calls.crewReloads, 1, 'The ordinary crew history is checked after a real reload.');
  assert.ok(fixture.calls.gmObservations.length >= 3,
    'The original live GM identity is observed before and after consuming the private response.');
  for (const current of fixture.calls.gmObservations) {
    assert.deepEqual({ hasAuth: current.hasAuth, sameActor: current.sameActor, sessionId: current.sessionId,
      uidHash: current.uidHash, playerRole: current.playerRole, gmInstanceOwned: current.gmInstanceOwned,
      instanceId: current.instanceId, cycle: current.cycle, connection: current.connection, freshness: current.freshness },
    { hasAuth: true, sameActor: true, sessionId: fixture.sessionId, uidHash: fixture.uidHash,
      playerRole: 'gm', gmInstanceOwned: true, instanceId: fixture.instanceId, cycle: 8,
      connection: 'live', freshness: 'server' });
  }
  const report = JSON.parse(await readFile(resolve(directory, 'final-cycle-ending.json'), 'utf8'));
  assert.deepEqual(report.terminal, { cycle: 8, result: 'completed', source: 'final-cycle', cause: 'final-cycle' });
  assert.deepEqual(report.recovered, { phase: 'closed', sameActor: true });
});

test('generic full-game completion cannot finish after the ending callback when public observation omits the private receipt', async t => {
  const directory = await mkdtemp(resolve(tmpdir(), 'pc10-full-game-ending-handoff-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const fixture = endingConsumerFixture();

  await runEnding({ gm: fixture.gm, crew: fixture.crew, initial: fixture.initial,
    started: fixture.started, directory });
  assert.equal(fixture.calls.gmCloseClicks, 1, 'The genuine ending callback has completed its UI close.');

  const ended = await consumeFullGameEnding({ gm: fixture.gm, originalGm: fixture.originalGm,
    initial: fixture.initial });
  assert.equal(ended.phase, 'closed');
  assert.equal(isObservedGameEnding(ended), true);
  assert.equal(Object.hasOwn(ended, 'snapshot'), false, 'The generic consumer returns only the validated terminal summary.');
  const afterCallback = await fixture.gm.observe();
  assert.equal(afterCallback.phase, 'closed');
  assert.equal(afterCallback.debriefType, null);
  assert.equal(afterCallback.debriefSource, null);
  assert.equal(fixture.calls.gmReads.length, 3,
    'Both the ending callback and generic completion consume authorized private receipts.');
});

test('generic completion rejects a denied private receipt', async () => {
  const fixture = endingConsumerFixture();
  fixture.gm.callable = async () => ({ status: 'denied', code: 'functions/permission-denied' });
  await assert.rejects(consumeFullGameEnding({ gm: fixture.gm, originalGm: fixture.originalGm,
    initial: fixture.initial }), /Expected values to be strictly equal/);
});

test('generic completion rejects a changed owned GM instance across the private read', async () => {
  const fixture = endingConsumerFixture();
  const callable = fixture.gm.callable;
  fixture.gm.callable = async (...args) => {
    const response = await callable(...args);
    fixture.gm.observe = async () => ({ ...fixture.calls.gmObservations.at(-1),
      instanceId: 'replacement-gm-instance' });
    return response;
  };
  await assert.rejects(consumeFullGameEnding({ gm: fixture.gm, originalGm: fixture.originalGm,
    initial: fixture.initial }), /Expected values to be strictly equal/);
});

test('generic completion bounds an unsettled authorized private read by its original shared deadline', async () => {
  const fixture = endingConsumerFixture();
  fixture.gm.callable = async () => new Promise(() => {});
  const startedAt = Date.now();
  await assert.rejects(consumeFullGameEnding({ gm: fixture.gm, originalGm: fixture.originalGm,
    initial: fixture.initial }, { timeoutMs: 20 }), /Authorized original-GM terminal debrief receipt: original full-game ending deadline expired/);
  assert.ok(Date.now() - startedAt < 500, 'The private read cannot extend the original finite caller budget.');
});
