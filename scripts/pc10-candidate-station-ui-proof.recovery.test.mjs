import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { createContext, SourceTextModule, SyntheticModule } from 'node:vm';
import { candidateShipRole, contributeStationReactors, CANDIDATE_PROOF_SHIPS } from './pc10-candidate-proof-helpers.mjs';
import { assertWolfChoiceActor, observeWolfChoiceActor } from './pc10-combat-choice-readiness.mjs';
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
    joinCode: 'NATIVE', playerRole: 'player', profileRoleId: roleId, profileSessionId: sessionId,
    assignedRoleId: roleId, activeConsoleRoleId: roleId, phase: 'active', cycle: 2,
    phaseProgression: 'manual', airspace: 'restricted', turnStatePhase: 'team',
    connection: 'live', freshness: 'server', documentTimeOrigin: 100 };
  const sourceActor = () => ({ sessionId, fleetGroupId: 'fleet-1', connectionGeneration: 1,
    identityHydrationRevision: 2, replacementRoleId: null, replacementStatus: null,
    seatId: roleId, connected: true, discoveryAuthority: null });
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
      actorState = { ...actorState, documentTimeOrigin: actorState.documentTimeOrigin + 1 };
    },
    evaluate: async () => sourceActor(),
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
  const actor = { label: 'crew', page, storeModuleUrl: () => '/src/store/useSessionStore.ts',
    observe: async () => structuredClone(actorState),
    until: async (_description, predicate) => {
      assert.equal(predicate(structuredClone(actorState)), true);
      return structuredClone(actorState);
    } };
  const gmState = { hasAuth: true, sameActor: true, uidHash: 'same-gm-uid', sessionId,
    joinCode: 'NATIVE', playerRole: 'gm', phase: 'active', cycle: 2,
    gmInstanceOwned: true, instanceId: 'original-gm-lease',
    connection: 'live', freshness: 'server', documentTimeOrigin: 500 };
  const gmSource = () => ({ sessionId, fleetGroupId: null, connectionGeneration: 1,
    identityHydrationRevision: 2, replacementRoleId: null, replacementStatus: null,
    seatId: null, connected: true, discoveryAuthority: null,
    instanceId: 'original-gm-lease', instanceClaimedAt: '2026-10-16T06:00:00.000Z',
    playerRole: 'gm', phase: 'active', cycle: 2, uidHash: 'same-gm-uid', hasAuth: true,
    sameActor: true, gmInstanceOwned: true, connection: 'live', freshness: 'server' });
  const gm = { page: { evaluate: async () => gmSource() }, storeModuleUrl: () => '/src/store/useSessionStore.ts',
    observe: async () => structuredClone(gmState) };
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

function stationRunnerFixture() {
  const sessionId = 'station-ending-session';
  const coordinate = '0408';
  const capacities = { aegis: 5, dione: 4, icebreaker: 4, shepherd: 3, quellon: 3 };
  const shipIds = Object.keys(capacities);
  const shared = { charge: 0, revision: 7, contributed: new Set(), actors: new Map(), records: [],
    requestSerial: 0, routeCount: 0, reloadCount: 0, fetchCount: 0, fallbackCount: 0 };
  const sourceArrivalId = 'station-arrival-current-source';
  const gmState = { hasAuth: true, sameActor: true, uidHash: 'station-gm-uid', sessionId,
    joinCode: 'NATIVE', playerRole: 'gm', phase: 'active', cycle: 2,
    gmInstanceOwned: true, instanceId: 'original-station-gm-lease', connection: 'live',
    freshness: 'server', documentTimeOrigin: 500 };
  const gmSource = () => ({ sessionId, fleetGroupId: null, connectionGeneration: 1,
    identityHydrationRevision: 2, replacementRoleId: null, replacementStatus: null,
    seatId: null, connected: true, discoveryAuthority: null,
    instanceId: 'original-station-gm-lease', instanceClaimedAt: '2026-10-16T06:00:00.000Z',
    playerRole: 'gm', phase: 'active', cycle: 2, uidHash: 'station-gm-uid', hasAuth: true,
    sameActor: true, gmInstanceOwned: true, connection: 'live', freshness: 'server',
    documentTimeOrigin: 500, connectionGeneration: 1, identityHydrationRevision: 2 });
  const timing = {
    getByLabel: name => name === 'Target fleet group'
      ? { selectOption: async groupId => assert.equal(groupId, 'fleet-1') }
      : { locator: () => ({ evaluateAll: async callback => callback([
        { disabled: false, textContent: `P // ${sourceArrivalId}`, value: sourceArrivalId },
      ]) }), selectOption: async value => assert.equal(value, sourceArrivalId) },
    getByRole: (_role, options) => ({ click: async () => assert.equal(options.name, 'Mark threat source due') }),
  };
  const preparation = {
    getByLabel: name => ({ fill: async value => assert.ok(['1', '4'].includes(value), `${name} uses the source composition.`) }),
    getByRole: (_role, options) => ({ click: async () => assert.ok([
      'Save private attack draft', 'Declare Wolf attack',
    ].includes(options.name)) }),
  };
  const gm = { page: { getByRole: (_role, options) => options.name === 'Wolf attack timing controls' ? timing : preparation,
    screenshot: async () => {}, evaluate: async () => gmSource() },
  storeModuleUrl: () => '/src/store/useSessionStore.ts', observe: async () => structuredClone(gmState) };

  function makeActor(shipId, roleId) {
    const actorState = { hasAuth: true, sameActor: true, uidHash: `crew-${shipId}-uid`, sessionId,
      joinCode: 'NATIVE', playerRole: 'player', profileRoleId: roleId, profileSessionId: sessionId,
      assignedRoleId: roleId, activeConsoleRoleId: roleId, phase: 'active', cycle: 2,
      phaseProgression: 'manual', airspace: 'restricted', turnStatePhase: 'team',
      connection: 'live', freshness: 'server', documentTimeOrigin: 1_000 + shipIds.indexOf(shipId) };
    const cap = capacities[shipId];
    const recovery = { routeHandler: undefined, request: undefined, result: undefined,
      replayRequest: undefined, pending: false };
    const sourceActor = () => ({ sessionId, fleetGroupId: 'fleet-1', connectionGeneration: 1,
      identityHydrationRevision: 2, replacementRoleId: null, replacementStatus: null,
      seatId: roleId, connected: true, discoveryAuthority: null });
    async function routeRequest(data) {
      const route = {
        request: () => ({ method: () => 'POST', postDataJSON: () => ({ data: structuredClone(data) }) }),
        fetch: async () => {
          shared.fetchCount++;
          assert.equal(recovery.result, undefined, 'The source commits only the first contribution request.');
          shared.charge += cap;
          shared.revision++;
          shared.contributed.add(shipId);
          recovery.result = { type: 'candidate-action-result', status: 'committed', sessionId,
            requestId: data.requestId, revision: shared.revision, code: 'P', action: 'contribute-reactor',
            summary: `${shared.charge}/18 Station charge capacity committed. This Reactor ship is cannibalised.`,
            ...(shared.charge >= 18 ? { outcome: 'activated', summary: `${shared.charge}/18 Station charge capacity committed. This Reactor ship is cannibalised. New Eden Station is active; its defences block future Wolf attacks.` } : {}) };
          return { status: () => 200, json: async () => ({ result: structuredClone(recovery.result) }) };
        },
        abort: async () => { recovery.pending = true; },
        fallback: async () => { shared.fallbackCount++; recovery.replayRequest = structuredClone(data); },
      };
      await recovery.routeHandler(route);
    }
    const panel = {
      innerText: async () => `Cycle 2 // candidate revision ${shared.revision}\nAncient Space Station\n` +
        `Station liberated // ${shared.charge}/18 charge capacity`,
      getByRole: (_role, options = {}) => {
        if (options.name === 'Retry original candidate request') return {
          count: async () => recovery.pending ? 1 : 0,
          waitFor: async ({ state }) => assert.equal(recovery.pending, state === 'visible'),
          click: async () => routeRequest(recovery.request),
        };
        return {
          count: async () => shared.contributed.has(shipId) ? 0 : 1,
          textContent: async () => `Cannibalise Reactor // ${shipId} // ${cap} capacity`,
          click: async () => {
            const data = { sessionId, requestId: `station-reactor-${++shared.requestSerial}`,
              expectedRevision: shared.revision, expectedGroupId: 'fleet-1', code: 'P', coordinate,
              action: 'contribute-reactor', shipId };
            if (recovery.routeHandler) {
              recovery.request = structuredClone(data);
              await routeRequest(data);
              return recovery.result;
            }
            const before = shared.charge;
            shared.charge += cap;
            shared.revision++;
            shared.contributed.add(shipId);
            return { type: 'candidate-action-result', status: 'committed', sessionId,
              requestId: data.requestId, revision: shared.revision, code: 'P', action: 'contribute-reactor',
              summary: `${shared.charge}/18 Station charge capacity committed. This Reactor ship is cannibalised.`,
              ...(before + cap >= 18 ? { outcome: 'activated', summary: `${shared.charge}/18 Station charge capacity committed. This Reactor ship is cannibalised. New Eden Station is active; its defences block future Wolf attacks.` } : {}) };
          },
        };
      },
    };
    const page = {
      getByRole: () => panel,
      route: async (pattern, handler) => { assert.equal(pattern, '**/us-central1/executeCandidateAction'); shared.routeCount++; recovery.routeHandler = handler; },
      unroute: async (_pattern, handler) => { assert.equal(recovery.routeHandler, handler); recovery.routeHandler = undefined; },
      reload: async () => { shared.reloadCount++; actorState.documentTimeOrigin++; },
      evaluate: async () => sourceActor(),
    };
    const actor = { label: `crew ${shipId}`, page, storeModuleUrl: () => '/src/store/useSessionStore.ts',
      observe: async () => structuredClone(actorState),
      until: async (_description, predicate) => {
        const generic = structuredClone(actorState);
        assert.equal(predicate(generic), true);
        return generic;
      } };
    const entry = { actor, panel, recovery, shipId, roleId };
    shared.actors.set(roleId, entry);
    return entry;
  }

  const roster = shipIds.map(shipId => ({ roleId: CANDIDATE_PROOF_SHIPS[shipId].engineer }));
  for (const shipId of shipIds) makeActor(shipId, CANDIDATE_PROOF_SHIPS[shipId].engineer);
  const start = { sessionId, organiserSites: { [coordinate]: { code: 'P' } }, activeVesselIds: shipIds };
  const liberation = { attackId: 'station-attack-current-source', revision: 12,
    threatSourceId: sourceArrivalId,
    pStationRepeat: { status: 'stopped', sequenceId: 'station-sequence-current-source', survivors: [] } };
  const tools = {
    begin: async code => { assert.equal(code, 'P'); return start; },
    record: async (stage, details) => shared.records.push({ stage, details }),
    printedRationBudget: async ships => Object.fromEntries(Object.keys(ships).map(id => [id, { food: 1, water: 1 }])),
    gmSupplies: async () => {}, maintenanceUi: async () => {}, coordination: async () => {},
    jump: async (_shipId, location) => assert.equal(location, coordinate), cycle: async cycle => assert.equal(cycle, 2),
    select: async roleId => roleId === 'gm' ? gm : shared.actors.get(roleId)?.actor,
    state: async () => ({ shipFleetGroupIds: { aegis: 'fleet-1' } }),
    receipt: async (surface, endpoint, choose, options = {}) => {
      if (endpoint === 'executeCandidateAction' && options.expectedRequest) {
        const entry = [...shared.actors.values()].find(value => value.actor === surface);
        assert.ok(entry, 'Exact replay must remain on its original named Station crew actor.');
        await choose();
        assert.deepEqual(entry.recovery.replayRequest, options.expectedRequest);
        entry.recovery.pending = false;
        return { ...entry.recovery.result, status: 'replayed' };
      }
      const result = await choose();
      return result ?? { type: 'candidate-action-result', status: 'committed', code: 'P', action: endpoint };
    },
    candidateGeometry: async () => {}, gmRepair: async () => {}, complete: async code => assert.equal(code, 'P'),
  };
  const context = { gm, crew: { observe: async () => ({ cycle: 2 }) }, directory: '/tmp/station-composition',
    roster, deadlineAt: Date.now() + 60_000, tools, start };
  return { context, tools, shared, liberation, start, capacities };
}

async function runActualStationEnding(context, liberation) {
  const source = await readFile(new URL('./pc10-candidate-station-ui-proof.mjs', import.meta.url), 'utf8');
  const vmContext = createContext({});
  const stationModule = new SourceTextModule(source, { context: vmContext,
    identifier: 'pc10-candidate-station-ui-proof.mjs' });
  const exports = new Map([
    ['node:assert/strict', { default: assert }],
    ['node:timers/promises', { setTimeout: async () => {} }],
    ['./pc10-candidate-manual-ui-proof.mjs', { candidateGameplayTools: () => context.tools }],
    ['./pc10-live-wolf-attack-ui-proof.mjs', { resolveLiveWolfAttack: async () => liberation }],
    ['./pc10-candidate-proof-helpers.mjs', { candidateShipRole, contributeStationReactors }],
    ['./pc10-proof-failure-evidence.mjs', { rememberProofFailure: () => {} }],
    ['./pc10-combat-choice-readiness.mjs', { assertWolfChoiceActor, observeWolfChoiceActor }],
  ]);
  const linked = new Map([...exports].map(([specifier, values]) => [specifier,
    new SyntheticModule(Object.keys(values), function publish() {
      for (const [name, value] of Object.entries(values)) this.setExport(name, value);
    }, { context: vmContext, identifier: specifier })]));
  await stationModule.link(specifier => {
    const dependency = linked.get(specifier);
    assert.ok(dependency, `The actual Station consumer imported unexpected ${specifier}.`);
    return dependency;
  });
  await stationModule.evaluate();
  return stationModule.namespace.runStationEnding(context);
}

test('Station contribution recovers the same committed Reactor request after a cold reload', async () => {
  const fixture = recoveryFixture();
  const generic = await fixture.actor.observe();
  assert.equal(Object.hasOwn(generic, 'fleetGroupId'), false,
    'The full-game actor observer does not provide the current fleet group; the Station recovery must read the live store.');
  assert.equal(Object.hasOwn(generic, 'connectionGeneration'), false,
    'The full-game actor observer does not provide a connection generation; the Station recovery must read the live store.');
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

test('the actual Station ending recovers the first committed contribution and the final activation boundary', async () => {
  const fixture = stationRunnerFixture();
  await runActualStationEnding(fixture.context, fixture.liberation);

  const recovered = fixture.shared.records.filter(record =>
    record.stage === 'actual Station Reactor receipt recovered after same-actor cold reload');
  assert.deepEqual(recovered.map(record => record.details.shipId), ['aegis', 'quellon'],
    'The existing Station consumer must recover the first contribution and the source-owned activation contribution.');
  assert.equal(fixture.shared.routeCount, 2);
  assert.equal(fixture.shared.reloadCount, 2);
  assert.equal(fixture.shared.fetchCount, 2, 'Each selected contribution commits only once before its acknowledgement is lost.');
  assert.equal(fixture.shared.fallbackCount, 2, 'Each recovery uses the original UI retry request exactly once.');
  assert.equal(fixture.shared.charge, 19, 'Only actual source Reactor capacities contribute to the 18-capacity threshold.');
  assert.equal(fixture.shared.revision, 12, 'Four ordinary contributions and one replayed final contribution follow the original revision chain.');

  const [first, activation] = recovered.map(record => record.details);
  for (const details of [first, activation]) {
    assert.equal(details.sessionId, fixture.context.start.sessionId);
    assert.equal(details.candidateCode, 'P');
    assert.equal(details.coordinate, '0408');
    assert.equal(details.request.action, 'contribute-reactor');
    assert.equal(details.request.expectedGroupId, 'fleet-1');
    assert.equal(details.actor.fleetGroupId, 'fleet-1');
    assert.equal(details.actor.phase, 'active');
    assert.equal(details.actor.cycle, 2);
    assert.equal(details.actor.documentTimeOriginChanged, true);
    assert.equal(details.gmLease.instanceId, 'original-station-gm-lease');
    assert.equal(details.gmLease.instanceClaimedAt, '2026-10-16T06:00:00.000Z');
    assert.equal(details.gmLease.phase, 'active');
    assert.equal(details.gmLease.cycle, 2);
    assert.equal(details.liberation.attackId, fixture.liberation.attackId);
    assert.equal(details.liberation.sequenceId, fixture.liberation.pStationRepeat.sequenceId);
  }
  assert.equal(first.request.expectedRevision, 7);
  assert.equal(first.committedResult.outcome, undefined);
  assert.equal(activation.request.expectedRevision, 11);
  assert.equal(activation.committedResult.outcome, 'activated');
  assert.equal(activation.replayedResult.outcome, 'activated');
});
