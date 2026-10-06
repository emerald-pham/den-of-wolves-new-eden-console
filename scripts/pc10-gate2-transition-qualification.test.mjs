import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import {
  assessPc10FunctionalTransport, createPc10Gate2FunctionalHarness,
  transitionPc10FunctionalBrowser,
} from './pc10-gate2-functional-proof.mjs';

const digest = (kind, value) => createHash('sha256').update(`security-denial-${kind}\0${value}`).digest('hex');
const original = { roleId: 'admiral', uid: 'original-transition-actor', sessionId: 'original-transition-session',
  contextHash: 'a'.repeat(64) };
const docHash = 'b'.repeat(64);
const binding = (actor = original, observedAt = 10) => ({ observedAt, authUid: actor.uid, storeUid: actor.uid,
  sessionId: actor.sessionId, contextHash: actor.contextHash, nativeDocumentHash: docHash,
  assignedRoleId: actor.roleId, activeConsoleRoleId: actor.roleId, seatId: actor.roleId, online: true });
const source = (actor = original, checkedAt = 10) => ({ checkedAt, uid: actor.uid, sessionId: actor.sessionId,
  roleId: actor.roleId, phase: 'active', currentTurn: 1, connected: true, nonKicked: true, generation: 7,
  playerRole: 'player', assignedRoleId: actor.roleId, activeConsoleRoleId: actor.roleId, seatId: actor.roleId,
  seatHolderUid: actor.uid, seatStatus: 'claimed', groupId: 'fleet-1', vesselIds: ['aegis'], craftIds: [],
  sameMembership: true });
const completedCommand = (actor = original) => ({ commandId: 'completed-original-command', original: actor,
  roleId: actor.roleId, name: 'refreshPresence', data: { sessionId: actor.sessionId },
  registeredAt: 10, issuedAt: 11, completedAt: 16, failedAt: null,
  beforeBinding: binding(actor), afterBinding: binding(actor, 20), beforeSource: source(actor), afterSource: source(actor, 20),
  invocation: { startedAt: 11, completedAt: 15, nativeDocumentHash: docHash },
  reply: { status: 200, result: { sessionId: actor.sessionId } }, validation: { passed: true } });

test('failed qualification is retained exactly before its allowed assertion, with original strict failure and no public API call', async () => {
  const transitions = [], drains = []; let apiCalls = 0, qualificationCalls = 0;
  const returned = { allowed: false, strictTransportStatus: 'INCOMPLETE', limitations: [],
    hardFailures: [{ category: 'unfinished-native-terminal-outcome', roleId: original.roleId,
      protocolRequestHash: 'c'.repeat(64), name: 'getCurrentMemberSession', issuedAt: 99 }] };
  let at = 100;
  await assert.rejects(transitionPc10FunctionalBrowser({ roleId: original.roleId, kind: 'offline', original,
    transitions, drains, clock: () => at++, observeBinding: async () => binding(), captureAuthority: async () => source(),
    client: { drainObservedCalls: async () => { throw Error('original durable-issued-set drain failure'); },
      setOffline: async () => { apiCalls++; } },
    qualifyDrainGap: async () => { qualificationCalls++; return returned; } }),
  /Only an already recorded passive instrumentation gap/);
  assert.equal(qualificationCalls, 1); assert.equal(apiCalls, 0);
  assert.equal(drains[0].functionalQualification, returned, 'Retain this returned assessment, without another assessment or reconstruction.');
  assert.equal(drains[0].outcome, 'failed'); assert.equal(drains[0].failure, 'original durable-issued-set drain failure');
  assert.equal(transitions[0].outcome, 'failed'); assert.equal(transitions[0].intentStartedAt, 100);
  assert.equal(transitions[0].startedAt, 100); assert.equal(transitions[0].apiStartedAt, undefined);
  assert.ok(drains[0].completedAt); assert.ok(transitions[0].completedAt);
});

test('separate original intent time survives a completed public offline API while cancellation starts at the actual API boundary', async () => {
  const transitions = [], drains = []; let offline = false, apiCalls = 0, at = 100;
  const result = await transitionPc10FunctionalBrowser({ roleId: original.roleId, kind: 'offline', original,
    transitions, drains, clock: () => at++, observeBinding: async () => ({ ...binding(), online: !offline }),
    captureAuthority: async () => source(), qualifyDrainGap: async () => { throw Error('No qualification on a completed drain.'); },
    client: { drainObservedCalls: async () => {}, setOffline: async value => { apiCalls++; assert.equal(value, true); offline = true; } } });
  assert.equal(apiCalls, 1); assert.equal(result.intentStartedAt, 100);
  assert.equal(result.startedAt, result.apiStartedAt); assert.ok(result.apiStartedAt > result.intentStartedAt);
  const cancelled = at => ({ roleId: original.roleId, name: 'refreshPresence', status: null,
    requestFinishedAt: null, bodyCompletedAt: null, requestFailedAt: at, transportError: 'internet-disconnected' });
  const beforeApi = assessPc10FunctionalTransport({ commands: [completedCommand()], transitions,
    observations: [cancelled(result.intentStartedAt + 1)] });
  assert.ok(beforeApi.hardFailures.some(f => f.category === 'unexpected-native-transport-failure'),
    'Initial intent does not retroactively qualify a network failure before the real API call.');
  const afterApi = assessPc10FunctionalTransport({ commands: [completedCommand()], transitions,
    observations: [cancelled(result.apiStartedAt)] });
  assert.equal(afterApi.functionalStatus, 'PASSED'); assert.equal(afterApi.strictTransportStatus, 'INCOMPLETE');
});

test('an allowed passive-gap qualification keeps its exact assessment and original intent, and reload invokes the public API once', async () => {
  const transitions = [], drains = []; let reloadCalls = 0, at = 100;
  const returned = { allowed: true, strictTransportStatus: 'INCOMPLETE', hardFailures: [],
    limitations: [{ protocolRequestHash: 'd'.repeat(64), wireBodyStatus: 'UNINSPECTED' }] };
  const result = await transitionPc10FunctionalBrowser({ roleId: original.roleId, kind: 'reload', original,
    transitions, drains, clock: () => at++,
    observeBinding: async () => ({ ...binding(), nativeDocumentHash: reloadCalls ? 'e'.repeat(64) : docHash }),
    captureAuthority: async () => source(), qualifyDrainGap: async () => returned,
    client: { drainObservedCalls: async () => { throw Error('original unread passive body'); },
      reload: async () => { throw Error('Wrapped strict drain must not run again.'); },
      page: { reload: async () => { reloadCalls++; } } } });
  assert.equal(reloadCalls, 1); assert.equal(drains[0].functionalQualification, returned);
  assert.equal(result.intentStartedAt, 100); assert.equal(result.startedAt, result.apiStartedAt);
  assert.equal(result.outcome, 'completed'); assert.equal(drains[0].outcome, 'failed');
});

// Invoke the actual harness/transition production path with fake read-only IO.
// No browser callback, SDK, Admin runtime or imported browser helper executes.
test('actual harness failed qualification preserves its current hard-failure request identity and clocks before any API', async () => {
  const documentId = '11111111-2222-4333-8444-555555555555';
  const nativeDoc = createHash('sha256').update(`pc10-native-durable-document\0${documentId}`).digest('hex');
  const protocolRequestHash = 'f'.repeat(64); let apiCalls = 0, readonlyReads = 0;
  const sessionPath = `sessions/${original.sessionId}`;
  const raw = { phase: 'active', currentTurn: 1, setupRevision: 42, activeVesselIds: ['aegis'], shuttleDockings: [] };
  const player = { role: 'player', connected: true, connectionGeneration: 7, fleetGroupId: 'fleet-1',
    assignedRoleId: original.roleId, activeConsoleRoleId: original.roleId, seatId: original.roleId };
  const group = { id: 'fleet-1', memberUids: [original.uid], vesselIds: ['aegis'] };
  const doc = (path, data) => ({ ref: { path }, exists: true, data: () => data, get: key => data[key] });
  const table = { clients: new Map([[original.roleId, {
    page: { evaluate: async () => ({ ...binding(), documentId, observedAt: Date.now() }) },
    observedCalls: [{ roleId: original.roleId, name: 'getCurrentMemberSession', protocolRequestHash,
      actorHash: digest('actor', original.uid), sessionHash: digest('session', original.sessionId),
      issuedAt: 25, nativeRequestObservedAt: 25, nativeDocumentHash: nativeDoc,
      status: null, requestFinishedAt: null, requestFailedAt: null, bodyCompletedAt: null }],
    callableObservationFailures: [], drainObservedCalls: async () => { throw Error('strict original drain failed'); },
    setOffline: async () => { apiCalls++; },
  }]]), capturePresenceAuthority: async () => [{ configuredRoleMatches: true }], fixture: {
    sessionId: original.sessionId, byRole: () => ({ localId: original.uid }), gm: { localId: 'separate-original-gm' },
    session: { collection: name => ({ path: `${sessionPath}/${name}` }) },
    db: { doc: path => ({ path }), runTransaction: async (operation, options) => {
      assert.deepEqual(options, { readOnly: true }); readonlyReads++;
      return operation({ get: async ref => {
        if (ref.path === `${sessionPath}/fleetGroups`) return { docs: [doc(`${ref.path}/fleet-1`, group)] };
        if (ref.path === `${sessionPath}/shuttleDepartures`) return { docs: [] };
        if (ref.path === sessionPath) return doc(ref.path, raw);
        if (ref.path === `${sessionPath}/players/${original.uid}`) return doc(ref.path, player);
        if (ref.path === `${sessionPath}/seats/${original.roleId}`) return doc(ref.path, { holderUid: original.uid, status: 'claimed' });
        if (ref.path === `activeMemberships/${original.uid}`) return doc(ref.path, { sessionId: original.sessionId });
        throw Error(`Unplanned read ${ref.path}`);
      } });
    } },
  } };
  const harness = await createPc10Gate2FunctionalHarness(table, { root: '/unused-unit-root', directory: '/unused-unit-evidence' });
  harness.ledger.push(completedCommand(harness.originals.get(original.roleId)));
  await assert.rejects(harness.transition(original.roleId, 'offline'), /Only an already recorded passive instrumentation gap/);
  assert.equal(apiCalls, 0); assert.equal(readonlyReads, 1);
  const qualification = harness.drains[0].functionalQualification;
  assert.ok(qualification, 'The exact failed assessment is persisted by the real harness path.');
  assert.equal(qualification.allowed, false); assert.equal(qualification.strictTransportStatus, 'INCOMPLETE');
  assert.ok(qualification.hardFailures.some(f => f.category === 'unfinished-native-terminal-outcome'
    && f.protocolRequestHash === protocolRequestHash && f.issuedAt === 25));
  assert.ok(qualification.hardFailures.some(f => f.category === 'unfinished-native-http-outcome'
    && f.protocolRequestHash === protocolRequestHash));
  assert.ok(harness.transitions[0].intentStartedAt); assert.equal(harness.transitions[0].apiStartedAt, undefined);
});
