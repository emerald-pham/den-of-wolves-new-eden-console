import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import * as stationProof from './pc10-candidate-station-ui-proof.mjs';

function recoveryFixture({ chargeCapacity = 2, reactorCapacity = 6, activates = false } = {}) {
  const sessionId = 'station-recovery-session';
  const roleId = 'executive-officer';
  const coordinate = '0408';
  const request = { sessionId, requestId: 'station-reactor-original', expectedRevision: 7,
    expectedGroupId: 'fleet-1', code: 'P', coordinate, action: 'contribute-reactor', shipId: 'aegis' };
  const result = { type: 'candidate-action-result', status: 'committed', sessionId,
    requestId: request.requestId, revision: 8, code: 'P', action: 'contribute-reactor',
    summary: `${chargeCapacity + reactorCapacity}/18 Station charge capacity committed. This Reactor ship is cannibalised.` +
      (activates ? ' New Eden Station is active; its defences block future Wolf attacks.' : ''),
    ...(activates ? { outcome: 'activated' } : {}) };
  const recovery = { requestData: undefined, replayData: undefined, fetchCount: 0,
    abortCount: 0, fallbackCount: 0, reloadCount: 0, unrouteCount: 0,
    pending: false, chargeCapacity, revision: 7, routeHandler: undefined };
  const records = [];
  let actorState = { hasAuth: true, sameActor: true, uidHash: 'same-crew-uid', sessionId,
    playerRole: 'player', profileRoleId: roleId, assignedRoleId: roleId,
    activeConsoleRoleId: roleId, fleetGroupId: 'fleet-1', seatId: roleId,
    replacementRoleId: null, replacementStatus: null, connection: 'live', freshness: 'server',
    connectionGeneration: 1, documentTimeOrigin: 100 };
  const page = {
    route: async (pattern, handler) => {
      assert.equal(pattern, '**/us-central1/executeCandidateAction');
      recovery.routeHandler = handler;
    },
    unroute: async (_pattern, handler) => {
      assert.equal(recovery.routeHandler, handler);
      recovery.unrouteCount++;
      recovery.routeHandler = undefined;
    },
    reload: async () => {
      recovery.reloadCount++;
      actorState = { ...actorState, connectionGeneration: actorState.connectionGeneration + 1,
        documentTimeOrigin: actorState.documentTimeOrigin + 1 };
    },
  };
  async function dispatch(data) {
    recovery.requestData ??= structuredClone(data);
    const route = {
      request: () => ({ method: () => 'POST', postDataJSON: () => ({ data: structuredClone(data) }) }),
      fetch: async () => {
        recovery.fetchCount++;
        return { status: () => 200, json: async () => ({ result: structuredClone(result) }) };
      },
      abort: async () => {
        recovery.abortCount++;
        recovery.pending = true;
        recovery.chargeCapacity = chargeCapacity + reactorCapacity;
        recovery.revision = result.revision;
      },
      fallback: async () => {
        recovery.fallbackCount++;
        recovery.replayData = structuredClone(data);
      },
    };
    await recovery.routeHandler(route);
  }
  const panel = {
    innerText: async () => `Cycle 2 // candidate revision ${recovery.revision}\nAncient Space Station\n` +
      `Station liberated // ${recovery.chargeCapacity}/18 charge capacity`,
    getByRole: (_role, options = {}) => {
      if (options.name === 'Retry original candidate request') return {
        count: async () => recovery.pending ? 1 : 0,
        isVisible: async () => recovery.pending,
        waitFor: async ({ state }) => assert.equal(recovery.pending, state === 'visible'),
        click: async () => dispatch(request),
      };
      return {
        count: async () => recovery.chargeCapacity === chargeCapacity ? 1 : 0,
        textContent: async () => `Cannibalise Reactor // aegis // ${reactorCapacity} capacity`,
        click: async () => dispatch(request),
      };
    },
  };
  page.getByRole = (_role, options = {}) => {
    assert.deepEqual(options, { name: 'Candidate preparation and actions', exact: true });
    return panel;
  };
  const actor = { label: 'crew', page, observe: async () => structuredClone(actorState),
    until: async (_description, predicate) => {
      assert.equal(predicate(structuredClone(actorState)), true);
      return structuredClone(actorState);
    } };
  const gmState = { hasAuth: true, sameActor: true, uidHash: 'same-gm-uid', sessionId,
    playerRole: 'gm', gmInstanceOwned: true, instanceId: 'original-gm-lease',
    instanceClaimedAt: '2026-10-16T06:00:00.000Z', connection: 'live', freshness: 'server' };
  const gm = { observe: async () => structuredClone(gmState) };
  const tools = { record: async (stage, details) => records.push({ stage, details }),
    receipt: async (surface, endpoint, choose, options) => {
    assert.equal(surface, actor);
    assert.equal(endpoint, 'executeCandidateAction');
    assert.deepEqual(options.expectedRequest, request);
    await choose();
    assert.deepEqual(recovery.replayData, request);
    recovery.pending = false;
    return { ...result, status: 'replayed' };
  } };
  return { actor, gm, tools, request, result, recovery, sessionId, roleId, coordinate,
    records,
    liberation: { attackId: 'station-attack-9', revision: 12, threatSourceId: 'station-arrival-4',
      pStationRepeat: { status: 'stopped', sequenceId: 'station-sequence-2' } } };
}

test('Station contribution recovers the same committed Reactor request after a cold reload', async () => {
  assert.equal(typeof stationProof.recoverStationReactorContribution, 'function',
    'The actual Station consumer needs a source-bound contribution recovery path.');
  const fixture = recoveryFixture();
  const replay = await stationProof.recoverStationReactorContribution({ ...fixture,
    shipId: 'aegis', roleId: fixture.roleId, coordinate: fixture.coordinate,
    sessionId: fixture.sessionId, expectActivation: false,
    deadlineAt: Date.now() + 1_000 });

  assert.deepEqual(replay, { ...fixture.result, status: 'replayed' });
  assert.deepEqual(fixture.recovery.requestData, fixture.request);
  assert.deepEqual(fixture.recovery.replayData, fixture.request);
  assert.equal(fixture.recovery.fetchCount, 1, 'The source action commits once before its acknowledgement is dropped.');
  assert.equal(fixture.recovery.abortCount, 1, 'The browser must lose the first committed acknowledgement.');
  assert.equal(fixture.recovery.fallbackCount, 1, 'Only the exact original request may reach the browser on recovery.');
  assert.equal(fixture.recovery.reloadCount, 1, 'Recovery must cross a cold same-actor reload.');
  assert.equal(fixture.recovery.unrouteCount, 1, 'The proof-only lost-ack route must always be removed.');
  assert.equal(fixture.recovery.chargeCapacity, 8, 'The same Reactor capacity is counted once.');
  assert.equal(fixture.recovery.revision, 8, 'Replay leaves the committed candidate revision unchanged.');
  assert.equal(fixture.recovery.pending, false, 'The mounted retry control clears after the original receipt returns.');
  assert.equal(fixture.records.length, 1, 'The actual source-bound recovery should be preserved in the proof record.');
  assert.equal(fixture.records[0].details.request.requestId, fixture.request.requestId);
});

test('Station activation replay retains the server-owned final Reactor result', async () => {
  const fixture = recoveryFixture({ chargeCapacity: 14, reactorCapacity: 4, activates: true });
  const replay = await stationProof.recoverStationReactorContribution({ ...fixture,
    shipId: 'aegis', roleId: fixture.roleId, coordinate: fixture.coordinate,
    sessionId: fixture.sessionId, expectActivation: true,
    deadlineAt: Date.now() + 1_000 });

  assert.equal(replay.outcome, 'activated');
  assert.match(replay.summary, /New Eden Station is active/);
  assert.equal(fixture.recovery.chargeCapacity, 18);
  assert.equal(fixture.recovery.revision, 8);
  assert.equal(fixture.recovery.fetchCount, 1);
  assert.equal(fixture.recovery.fallbackCount, 1);
  assert.equal(fixture.records[0].details.committedResult.outcome, 'activated');
  assert.equal(fixture.records[0].details.replayedResult.outcome, 'activated');
});

test('the existing Station ending invokes recovery at real contribution and activation boundaries', async () => {
  const source = await readFile(new URL('./pc10-candidate-station-ui-proof.mjs', import.meta.url), 'utf8');
  const start = source.indexOf('export async function runStationEnding');
  assert.ok(start >= 0, 'Read the actual Station runner body.');
  const runner = source.slice(start);
  assert.match(runner, /let liberation\b/,
    'Retain the finalized live Station attack result for the contribution proof.');
  assert.match(runner, /recoverStationReactorContribution\s*\(/,
    'The ordinary Station ending must use the same-actor interrupted receipt recovery helper.');
  assert.match(runner, /expectActivation/,
    'The exact source-owned final activation contribution must pass through recovery too.');
});
