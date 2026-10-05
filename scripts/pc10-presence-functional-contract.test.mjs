import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import { createPc10CallableObservationBoundary, createPc10BrowserTable } from './pc10-browser-session-proof.mjs';
import { createPc10NativeDurableObservationLedger } from './pc10-native-durable-observer.mjs';
const target = new URL('./pc10-presence-functional-contract.mjs', import.meta.url);
let implementation = {};
try { implementation = await import(target.href); } catch (error) {
  if (error.code !== 'ERR_MODULE_NOT_FOUND' || !error.message.includes(target.pathname)) throw error;
}
const option = 'background-presence-with-live-authority-v1';
const uid = 'private-actor', sessionId = 'private-session', project = 'demo-presence-contract-unit', roleId = 'executive-officer';
const hash = (kind, value) => createHash('sha256').update(`security-denial-${kind}\0${value}`).digest('hex');
const nextTurn = () => new Promise(resolve => setImmediate(resolve));
function api(name) { assert.equal(typeof implementation[name], 'function', name); return implementation[name]; }
function fixture() {
  const actorHash = hash('actor', uid), sessionHash = hash('session', sessionId), projectHash = hash('project', project);
  const candidate = { name: 'refreshPresence', roleId, captureMode: 'native-durable', actorHash, sessionHash, projectHash,
    protocolRequestHash: 'a'.repeat(64), nativeDocumentHash: 'b'.repeat(64), nativeContextHash: 'c'.repeat(64),
    nativeFrameHash: 'd'.repeat(64), nativeLoaderHash: 'e'.repeat(64), presenceRequestClassification: 'periodic-session-only',
    nativeRequestObservedAt: 900, issuedAt: 900, requestFinishedAt: 1000, requestFailedAt: null,
    status: 200, bodyCompletedAt: null, requestHash: null, bodyFailureStage: 'native-get-response-body',
    bodyReadFailureReason: 'body-unavailable', failureCategory: 'response-observation-unavailable' };
  const failure = { roleId, name: candidate.name, protocolRequestHash: candidate.protocolRequestHash, status: 200,
    category: 'response-observation-unavailable', bodyFailureStage: candidate.bodyFailureStage, bodyReadFailureReason: candidate.bodyReadFailureReason };
  const authority = { schemaVersion: 1, kind: 'pc10-presence-authority-readonly', roleId, actorHash, sessionHash, projectHash,
    checkedAt: 1500, sessionExists: true, phase: 'active', cycle: 1, playerExists: true, originalUidMatches: true,
    connected: true, nonKicked: true, ordinaryPlayer: true, sameSessionMembership: true,
    assignedRoleMatches: true, activeConsoleMatches: true, ownStationAuthority: true, noReplacementOrEscape: true, configuredRoleMatches: true,
    generation: 2, lastSeenAtMs: 1440, membershipConnectedAtMs: 1440, leaseMs: 45000 };
  const renewal = { schemaVersion: 1, kind: 'original-explicit-sdk-presence-renewal', roleId, actorHash, sessionHash, projectHash,
    startedAt: 1200, completedAt: 1400, status: 200, originalSdkSessionMatches: true,
    originalSdkSchemaValid: true, stationSelectionRequired: false, generationBefore: 2, nativeDocumentHash: candidate.nativeDocumentHash };
  const invocation = { kind: 'explicit-sdk-invocation', roleId, name: 'refreshPresence', startedAt: 1200, completedAt: 1400 };
  const input = { option, observations: [candidate], failures: [failure], renewals: [renewal], authoritySnapshots: [authority],
    explicitSdkInvocations: [invocation], actions: [{ kind: 'proof-command', name: 'refreshPresence', roleId,
      status: 200, commandIssuedAt: 1200, commandCompletedAt: 1400, commandFailedAt: null, failureCategory: null }] };
  return { candidate, failure, authority, renewal, invocation, input, evaluate: () => api('evaluatePc10PresenceInstrumentationContract')(input) };
}
const privateAbsent = value => { const serialized = JSON.stringify(value); for (const key of [uid, sessionId, 'private-malicious-error', 'Bearer private-token']) assert.equal(serialized.includes(key), false, key); };

test('strict default rejects the original unavailable200body even when every future functional witness is available', () => {
  const f = fixture(); delete f.input.option; const value = f.evaluate();
  assert.equal(value.strictTransportStatus, 'failed'); assert.equal(value.functionalStatus, 'failed');
  assert.equal(value.instrumentationLimitations.length, 0); assert.equal(value.hardFailures.length, 1);
});

test('explicit future contract reports only proven background instrumentation loss and never reconstructs or deletes the original reply', () => {
  const f = fixture(); const before = JSON.stringify(f.input); const value = f.evaluate();
  assert.equal(value.strictTransportStatus, 'failed'); assert.equal(value.functionalStatus, 'passed');
  assert.equal(value.instrumentationLimitations.length, 1); assert.equal(value.hardFailures.length, 0);
  assert.equal(value.instrumentationLimitations[0].originalReplyReconstructed, false); assert.equal(f.candidate.bodyCompletedAt, null);
  assert.equal(JSON.stringify(f.input), before); privateAbsent(value);
});

for (const field of ['actorHash', 'sessionHash', 'projectHash', 'protocolRequestHash', 'nativeDocumentHash', 'nativeContextHash', 'nativeFrameHash', 'nativeLoaderHash', 'presenceRequestClassification']) {
  test(`missing original ${field} keeps the transport a hard failure`, () => {
    const f = fixture(); delete f.candidate[field]; assert.equal(f.evaluate().functionalStatus, 'failed'); assert.equal(f.evaluate().instrumentationLimitations.length, 0);
  });
}

for (const [name, change] of [
  ['command overlap', f => { f.invocation.startedAt = 800; f.invocation.completedAt = 950; }],
  ['another explicit callable overlap', f => { f.invocation.name = 'resumeSession'; f.invocation.startedAt = 950; f.invocation.completedAt = 1050; }],
  ['unfinished explicit invocation', f => { f.invocation.startedAt = 800; f.invocation.completedAt = null; }],
  ['missing SDK original document', f => { delete f.renewal.nativeDocumentHash; }],
  ['SDK from another document', f => { f.renewal.nativeDocumentHash = 'f'.repeat(64); }],
  ['missing explicit SDK success', f => { f.input.renewals = []; }],
  ['wrong explicit SDK actor', f => { f.renewal.actorHash = 'f'.repeat(64); }],
  ['wrong explicit SDK session', f => { f.renewal.originalSdkSessionMatches = false; }],
  ['SDK reselection required', f => { f.renewal.stationSelectionRequired = true; }],
  ['malformed original SDK result', f => { f.renewal.originalSdkSchemaValid = false; }],
  ['missing authoritative state', f => { f.input.authoritySnapshots = []; }],
  ['revoked authoritative member', f => { f.authority.connected = false; }],
  ['removed configured role', f => { f.authority.configuredRoleMatches = false; }],
  ['foreign canonical seat', f => { f.authority.ownStationAuthority = false; }],
  ['changed connection generation', f => { f.authority.generation = 3; }],
  ['expired45s lease', f => { f.authority.checkedAt = f.authority.lastSeenAtMs + 45000; }],
  ['future malformed lease', f => { f.authority.lastSeenAtMs = 99999; }],
  ['state predating missing transport', f => { f.authority.checkedAt = 999; }],
  ['state predating SDK renewal', f => { f.authority.checkedAt = 1399; }],
  ['renewal not observed in membership', f => { f.authority.membershipConnectedAtMs = 1199; }],
  ['missing commanded result', f => { f.input.actions[0].commandCompletedAt = null; }],
  ['unexpectedHTTP500', f => { f.candidate.status = 500; f.failure.status = 500; }],
  ['actual failed transport', f => { f.candidate.requestFailedAt = 1000; }],
  ['JSON or parse loss', f => { f.candidate.bodyFailureStage = 'native-json-parse'; }],
  ['unknown body failure', f => { f.candidate.bodyReadFailureReason = 'unknown'; }],
  ['observation deadline failure', f => { f.input.failures.push({ category: 'observation-drain-timeout', roleId }); }],
  ['identity or privacy failure', f => { f.input.failures.push({ category: 'native-identity-mismatch', roleId }); }],
  ['console claim payload', f => { f.candidate.presenceRequestClassification = 'console-claim'; }],
  ['malformed presence payload', f => { f.candidate.presenceRequestClassification = 'unclassified'; }],
  ['unclassified nonpresence request', f => { f.candidate.name = 'readFleetGroupMessages'; }],
]) {
  test(`${name} is never caught by the optional contract`, () => {
    const f = fixture(); change(f); const value = f.evaluate(); assert.equal(value.functionalStatus, 'failed'); assert.ok(value.hardFailures.length); privateAbsent(value);
  });
}

test('invalid contract names fail closed rather than activating a truthy waiver', () => {
  const f = fixture(); for (const invalid of [null, false, true, 'background', {}, []]) { f.input.option = invalid;
    assert.throws(() => f.evaluate(), /Unsupported presence functional contract/); }
});

test('actual periodic metadata requires exact same-session payload and never exports raw request data', () => {
  const classify = api('classifyPc10PresenceRequest');
  const metadata = { name: 'refreshPresence', sessionId, matched: true };
  assert.equal(classify(metadata, JSON.stringify({ data: { sessionId } })), 'periodic-session-only');
  for (const value of [null, 'executive-officer']) assert.equal(classify(metadata, JSON.stringify({ data: { sessionId, activeConsoleRoleId: value } })), 'console-claim');
  for (const value of [JSON.stringify({ data: { sessionId, activeConsoleRoleId: 7 } }), JSON.stringify({ data: { sessionId, instanceId: 'private-gm' } }),
    JSON.stringify({ data: { sessionId: 'private-foreign' } }), JSON.stringify({ data: { sessionId, private: 'private-malicious-error' } }), '{private-malicious-error']) {
    assert.equal(classify(metadata, value), 'unclassified');
  }
  assert.equal(classify({ ...metadata, failureStage: 'origin-bearer-invalid' }, JSON.stringify({ data: { sessionId } })), 'unclassified');
});

test('original SDK renewal records exact same-session schema and preserves reselection/denial as failures', () => {
  const build = api('buildPc10PresenceSdkRenewal');
  const base = { roleId, actorUid: uid, sessionId, project, startedAt: 1200, completedAt: 1400, generationBefore: 2, nativeDocumentHash: 'b'.repeat(64) };
  const value = build({ ...base, reply: { status: 200, result: { sessionId } } });
  assert.equal(value.originalSdkSessionMatches, true); assert.equal(value.originalSdkSchemaValid, true); privateAbsent(value);
  for (const reply of [{ status: 200, result: { sessionId: 'private-foreign' } }, { status: 200, result: { sessionId, stationSelectionRequired: true } },
    { status: 'denied', error: { code: 'private-malicious-error' } }, { status: 200, result: { sessionId, private: 'private-malicious-error' } }]) {
    const candidate = build({ ...base, reply }); assert.ok(candidate.status !== 200 || !candidate.originalSdkSessionMatches || !candidate.originalSdkSchemaValid || candidate.stationSelectionRequired); privateAbsent(candidate);
  }
});

function dbFixture({ press = false } = {}) {
  const values = new Map([
    [`sessions/${sessionId}`, { phase: 'active', currentTurn: 1, activeRoleIds: [roleId], pressEnabled: true, pressHolderUid: uid }],
    [`sessions/${sessionId}/players/${uid}`, { connected: true, role: 'player', assignedRoleId: press ? null : roleId,
      activeConsoleRoleId: press ? 'press-officer' : roleId, seatId: press ? null : roleId, connectionGeneration: 2,
      lastSeenAt: { toMillis: () => 1400 }, privateHand: ['private-malicious-error'] }],
    [`activeMemberships/${uid}`, { sessionId, connectedAt: { toMillis: () => 1400 } }],
    [`sessions/${sessionId}/seats/${roleId}`, { roleId, holderUid: uid, status: 'claimed' }],
  ]); const reads = [], options = [];
  const db = { doc: path => ({ path }), runTransaction: async (operation, setting) => { options.push(setting); return operation({
    get: async ref => { reads.push(ref.path); const source = values.get(ref.path); return { id: ref.path.split('/').at(-1), exists: source !== undefined, get: key => source?.[key] }; },
    set: () => assert.fail('No authority writes'), update: () => assert.fail('No lease writes'), delete: () => assert.fail('No deletes'),
  }); } };
  return { db, reads, options, values };
}

test('readonly authority witness uses only own point documents and verifies live lease, generation and original canonical core seat', async () => {
  const f = dbFixture(); const records = await api('capturePc10PresenceAuthority')({ db: f.db, project, emulatorHost: '127.0.0.1:8180', sessionId,
    actors: [{ roleId, actorUid: uid }], now: () => 1500 });
  assert.deepEqual(f.options, [{ readOnly: true }]); assert.equal(f.reads.length, 4); const value = records[0];
  assert.equal(value.generation, 2); assert.equal(value.lastSeenAtMs, 1400); assert.equal(value.leaseMs, 45000); assert.equal(value.ownStationAuthority, true);
  assert.equal(value.connected, true); assert.equal(value.sameSessionMembership, true); assert.equal(value.originalUidMatches, true); privateAbsent(records);
});

test('Press authority uses the existing canonical holder instead of inventing a core seat', async () => {
  const f = dbFixture({ press: true }); const records = await api('capturePc10PresenceAuthority')({ db: f.db, project, emulatorHost: '127.0.0.1:8180', sessionId,
    actors: [{ roleId: 'press-officer', actorUid: uid }], now: () => 1500 });
  assert.equal(f.reads.length, 3); assert.equal(records[0].ownStationAuthority, true); privateAbsent(records);
  f.values.get(`sessions/${sessionId}`).pressHolderUid = 'private-foreign';
  assert.equal((await api('capturePc10PresenceAuthority')({ db: f.db, project, emulatorHost: '127.0.0.1:8180', sessionId,
    actors: [{ roleId: 'press-officer', actorUid: uid }], now: () => 1500 }))[0].ownStationAuthority, false);
});

test('malicious raw errors and extra request/private fields are never exported by functional classification', () => {
  const f = fixture(); f.input.failures.push({ category: 'private-malicious-error', message: 'Bearer private-token', actorUid: uid, sessionId });
  const value = f.evaluate(); assert.equal(value.functionalStatus, 'failed'); privateAbsent(value);
});

test('new future records cannot retrospectively label missing historical run12 classification', () => {
  const f = fixture(); delete f.candidate.presenceRequestClassification; assert.equal(f.evaluate().instrumentationLimitations.length, 0);
});

test('driver exposes explicit cohort witness API and option while preserving the145 command stage and strict default assertions', async () => {
  const source = await readFile(new URL('./pc10-browser-session-proof.mjs', import.meta.url), 'utf8');
  assert.match(source, /presenceFunctionalContract/); assert.match(source, /renewPresenceCohort/);
  assert.match(source, /No missing callable observations may be ignored\./);
  assert.match(source, /21-simultaneous-presence/); assert.match(source, /21-simultaneous-offline-reload-same-uid-recoveries/);
});

test('native callback can only acknowledge source-classified presence body loss and leaves the raw null body/failure untouched', async () => {
  api('classifyPc10PresenceRequest'); const observedCalls = [], failures = []; let calls = 0;
  const ledger = createPc10NativeDurableObservationLedger({ label: roleId, projectId: project, functionsOrigin: 'http://127.0.0.1:5031',
    observedCalls, failures, boundaryFactory: createPc10CallableObservationBoundary,
    presenceInstrumentationLimitation: () => { calls++; return true; }, readBody: () => Promise.reject(new Error('No data found for resource with given identifier')) });
  ledger.nativeFrame({ frame: { id: 'main' } }); ledger.nativeContext({ context: { id: 1, uniqueId: 'actual-context', auxData: { isDefault: true, frameId: 'main' } } });
  ledger.nativeScript({ scriptId: 'actual-script', executionContextId: 1, url: 'pc10-native-durable-init.js' });
  ledger.nativeDocument({ name: '__pc10NativeDurableDocumentWitness', executionContextId: 1, payload: JSON.stringify({ schemaVersion: 1, documentId: 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa' }) });
  const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url'); const token = `${encode({ alg: 'none' })}.${encode({ aud: project,
    iss: `https://securetoken.google.com/${project}`, sub: uid, user_id: uid, exp: Math.floor(Date.now()/1000)+3600, iat: 1 })}.`;
  const url = `http://127.0.0.1:5031/${project}/us-central1/refreshPresence`;
  const run = async (id, data) => {
    ledger.network('request', { requestId: id, frameId: 'main', loaderId: 'actual-loader',
      initiator: { type: 'script', stack: { callFrames: [{ functionName: 'pc10NativeDurableFetch', scriptId: 'actual-script' }] } },
      request: { url, method: 'POST', headers: { 'Content-Type':'application/json', Authorization:`Bearer ${token}` }, postData: JSON.stringify({ data }) } });
    ledger.network('headers',{requestId:id,response:{url,status:200,headers:{'Content-Type':'application/json'}}});
    ledger.network('finished',{requestId:id}); await nextTurn();
  };
  await run('actual-native-1',{sessionId}); await ledger.drain(); assert.equal(calls, 1);
  assert.equal(observedCalls[0].bodyCompletedAt, null); assert.equal(failures.length, 1); assert.equal(ledger.boundaries.at(-1).outcome, 'completed-with-instrumentation-limitations');
  await run('actual-native-2',{sessionId,activeConsoleRoleId:null}); await assert.rejects(ledger.drain(), /Native durable/);
  assert.equal(observedCalls[1].presenceRequestClassification, 'console-claim'); assert.equal(observedCalls[1].bodyCompletedAt,null);
});

test('invalid table contract option is rejected before any browser or fixture resource can start', async () => {
  await assert.rejects(createPc10BrowserTable({ presenceFunctionalContract: 'truthy-waiver' }), /Unsupported presence functional contract/);
});


test('the original strict cohort helper retains SDK/document and readonly authority evidence without enabling a limitation', async () => {
  const roles = [roleId, 'refinery-124-pdf-colonel'], events = [], actorIds = ['original-core-one', 'original-core-two'];
  const values = new Map([[`sessions/${sessionId}`, { phase: 'active', currentTurn: 1, activeRoleIds: roles }]]);
  for (const [index, role] of roles.entries()) {
    values.set(`sessions/${sessionId}/players/${actorIds[index]}`, { connected: true, role: 'player', assignedRoleId: role,
      seatId: role, activeConsoleRoleId: role, connectionGeneration: 2, lastSeenAt: { toMillis: () => Date.now() - 1 } });
    values.set(`activeMemberships/${actorIds[index]}`, { sessionId, connectedAt: { toMillis: () => Date.now() - 1 } });
    values.set(`sessions/${sessionId}/seats/${role}`, { roleId: role, holderUid: actorIds[index], status: 'claimed' });
  }
  const db = { doc: path => ({ path }), runTransaction: async (operation, settings) => {
    assert.equal(settings.readOnly, true); events.push('authority-read');
    return operation({ get: async ref => ({ id: ref.path.split('/').at(-1), exists: values.has(ref.path), get: key => values.get(ref.path)?.[key] }) });
  } };
  const players = actorIds.map(localId => ({ localId }));
  const fixture = { db, project, sessionId, config: { firestorePort: 8180 }, roles, players,
    press: { localId: 'original-press' }, gm: { localId: 'original-gm' }, call: () => assert.fail('Use the original SDK context'),
    byRole: role => players[roles.indexOf(role)], cleanup: async () => undefined };
  let issued = 0, release;
  const parallelGate = new Promise(resolve => { release = resolve; });
  const create = runInNewContext(`(${createPc10BrowserTable.toString().replaceAll('import.meta.url', 'pc10ModuleUrl')})`, {
    assert, URL, createHash, process: { env: { VITE_FIREBASE_PROJECT_ID: project } },
    pc10ModuleUrl: new URL('./pc10-browser-session-proof.mjs', import.meta.url).href,
    mkdir: async () => undefined, execFileSync: () => 'source-bound-native-fixture', readFile: async () => Buffer.from('compiled-fixture'),
    compiledFunctionsBinding: async () => ({ sha256: 'compiled-bound-native-fixture' }),
    createRequire: () => () => ({ recommendedRoleIds: count => { assert.equal(count, 2); return roles; } }),
    chromium: { launch: async () => ({ close: async () => undefined }) },
    PC10_PROOF_CALLABLE_ACTIONS: (await import('./pc10-proof-diagnostics.mjs')).PC10_PROOF_CALLABLE_ACTIONS,
    createPc07AuthenticatedSession: async () => fixture, writeFile: async () => undefined,
    createPc10CallableTrace: (await import('./pc10-proof-diagnostics.mjs')).createPc10CallableTrace,
    pc10SafeCallableOutcome: (await import('./pc10-proof-diagnostics.mjs')).pc10SafeCallableOutcome,
    validatePc10PresenceFunctionalContract: implementation.validatePc10PresenceFunctionalContract,
    buildPc10PresenceSdkRenewal: implementation.buildPc10PresenceSdkRenewal,
    capturePc10PresenceAuthority: implementation.capturePc10PresenceAuthority,
    evaluatePc10PresenceInstrumentationContract: implementation.evaluatePc10PresenceInstrumentationContract,
    createPc10BrowserActor: async (_browser, _url, label, _viewport, options) => {
      assert.equal(options.presenceFunctionalContract, undefined);
      const invocationByReply = new WeakMap(), invocations = [];
      return { label, errors: [], observedCalls: [], callableObservationFailures: [], callableObservationBoundaries: [],
        identityObservations: [], explicitSdkInvocations: invocations, join: async () => undefined, bindOriginIdentity: () => undefined,
        callable: async (name, data, witnessOptions) => {
          assert.equal(name, 'refreshPresence'); assert.equal(data.sessionId, sessionId);
          assert.equal(witnessOptions?.retainPresenceAuthority, true, 'Strict cohort requests evidence without enabling an exception');
          const startedAt = Date.now(); events.push(`original-sdk-${label}`); issued++; if (issued === roles.length) release();
          await parallelGate; const committedAt = Date.now();
          const actorId = actorIds[roles.indexOf(label)];
          values.get(`sessions/${sessionId}/players/${actorId}`).lastSeenAt = { toMillis: () => committedAt };
          values.get(`activeMemberships/${actorId}`).connectedAt = { toMillis: () => committedAt };
          const reply = { status: 200, result: { sessionId } };
          const invocation = { kind: 'explicit-sdk-invocation', name, roleId: label, startedAt, completedAt: Date.now(), nativeDocumentHash: 'b'.repeat(64) };
          invocations.push(invocation); invocationByReply.set(reply, invocation); return reply;
        }, sdkInvocationForReply: reply => invocationByReply.get(reply), drainObservedCalls: async () => undefined,
      };
    },
  });
  const table = await create({ baseUrl: 'http://localhost:5173', directory: '/native-fixture-no-writes', coreCount: 2, captureMode: 'native-durable' });
  const replies = await table.renewPresenceCohort(roles); assert.equal(replies.length, 2); assert.equal(issued, 2);
  assert.deepEqual(events, ['authority-read', `original-sdk-${roles[0]}`, `original-sdk-${roles[1]}`, 'authority-read']);
  const evidence = await table.writeEvidence('native-cohort-no-writes.json');
  assert.equal(evidence.presenceSdkRenewals.length, 2); assert.equal(evidence.presenceAuthoritySnapshots.length, 4);
  assert.equal(evidence.presenceFunctionalAssessment.instrumentationLimitations.length, 0);
  assert.equal(evidence.presenceFunctionalAssessment.presenceFunctionalContract, null);
  assert.equal(evidence.presenceFunctionalAssessment.strictTransportStatus, 'passed');
  assert.ok(evidence.presenceSdkRenewals.every(value => value.originalSdkSessionMatches && value.nativeDocumentHash === 'b'.repeat(64)));
  assert.equal(evidence.actions.length, 2); assert.ok(evidence.actions.every(value => value.status === 200));
  for (const id of actorIds) assert.equal(JSON.stringify(evidence).includes(id), false);
  await table.cleanup();
});

function nativeFailureFixture({ bindForeign = false, duplicateHeaders = false, reason = 'No data found for resource with given identifier' } = {}) {
  const observedCalls = [], failures = [];
  const ledger = createPc10NativeDurableObservationLedger({ label: roleId, projectId: project, functionsOrigin: 'http://127.0.0.1:5031',
    observedCalls, failures, boundaryFactory: createPc10CallableObservationBoundary,
    presenceInstrumentationLimitation: () => true, readBody: () => Promise.reject(new Error(reason)) });
  ledger.nativeFrame({ frame: { id: 'main' } });
  ledger.nativeContext({ context: { id: 1, uniqueId: 'actual-context', auxData: { isDefault: true, frameId: 'main' } } });
  ledger.nativeScript({ scriptId: 'actual-script', executionContextId: 1, url: 'pc10-native-durable-init.js' });
  ledger.nativeDocument({ name: '__pc10NativeDurableDocumentWitness', executionContextId: 1,
    payload: JSON.stringify({ schemaVersion: 1, documentId: 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa' }) });
  ledger.bindIdentity(bindForeign ? 'original-private-foreign' : uid, sessionId);
  const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
  const token = `${encode({ alg: 'none' })}.${encode({ aud: project, iss: `https://securetoken.google.com/${project}`,
    sub: uid, user_id: uid, exp: Math.floor(Date.now()/1000)+3600, iat: 1 })}.`;
  const requestId = 'native-actual-with-private-id', url = `http://127.0.0.1:5031/${project}/us-central1/refreshPresence`;
  ledger.network('request', { requestId, frameId: 'main', loaderId: 'actual-loader',
    initiator: { type: 'script', stack: { callFrames: [{ functionName: 'pc10NativeDurableFetch', scriptId: 'actual-script' }] } },
    request: { url, method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, postData: JSON.stringify({ data: { sessionId } }) } });
  const headers = { requestId, response: { url, status: 200, headers: { 'Content-Type': 'application/json' } } };
  ledger.network('headers', headers); if (duplicateHeaders) ledger.network('headers', headers);
  ledger.network('finished', { requestId });
  return { ledger, observedCalls, failures };
}

for (const [name, options] of [
  ['an actual mismatched bound actor', { bindForeign: true }],
  ['an actual duplicate native lifecycle event', { duplicateHeaders: true }],
  ['an unknown body error carrying private text', { reason: 'private-malicious-error Bearer private-token' }],
]) {
  test(`even a true callback cannot rescue ${name}`, async () => {
    const f = nativeFailureFixture(options); await nextTurn(); await assert.rejects(f.ledger.drain(), /Native durable/);
    assert.equal(f.observedCalls[0].bodyCompletedAt, null); assert.ok(f.failures.length);
    privateAbsent(f.failures); privateAbsent(f.observedCalls);
  });
}

test('readonly authority capture keeps the existing10s budget and cannot publish a late snapshot', async () => {
  let clock = 1000, timer, resolved;
  const f = dbFixture(); f.db.runTransaction = () => new Promise(resolve => { resolved = resolve; });
  const operation = api('capturePc10PresenceAuthority')({ db: f.db, project, emulatorHost: '127.0.0.1:8180', sessionId,
    actors: [{ roleId, actorUid: uid }], now: () => clock,
    timeoutPort: { setTimeout: (callback, ms) => { assert.equal(ms, 10000); timer = callback; return 1; }, clearTimeout: () => undefined } });
  await nextTurn(); assert.equal(typeof timer, 'function'); clock += 10001; timer();
  await assert.rejects(operation, /Presence authority observation budget/);
  resolved(new Map()); await nextTurn();
});


test('the cohort itself rejects malformed original SDK results and missing current authority even without any body failure', () => {
  const verify = api('assertPc10PresenceCohortWitnesses'), f = fixture();
  const before = { ...f.authority, checkedAt: 1100, lastSeenAtMs: 1000, membershipConnectedAtMs: 1000 };
  const input = { roleIds: [roleId], before: [before], renewals: [f.renewal], after: [f.authority] };
  assert.doesNotThrow(() => verify(input));
  for (const [collection, key, value] of [
    ['renewals', 'originalSdkSessionMatches', false], ['renewals', 'stationSelectionRequired', true],
    ['renewals', 'originalSdkSchemaValid', false], ['renewals', 'nativeDocumentHash', null],
    ['before', 'connected', false], ['after', 'sameSessionMembership', false],
    ['after', 'ownStationAuthority', false], ['after', 'configuredRoleMatches', false],
    ['after', 'generation', 3], ['after', 'lastSeenAtMs', 1100], ['after', 'membershipConnectedAtMs', 1100],
  ]) {
    const counterexample = structuredClone(input); counterexample[collection][0][key] = value;
    assert.throws(() => verify(counterexample), /Original SDK cohort renewal and live own authority/);
  }
});

test('readonly witness detects canonical roster removal while the stale player and own seat still exist', async () => {
  const f = dbFixture(); f.values.get(`sessions/${sessionId}`).activeRoleIds = [];
  const [value] = await api('capturePc10PresenceAuthority')({ db: f.db, project, emulatorHost: '127.0.0.1:8180', sessionId,
    actors: [{ roleId, actorUid: uid }], now: () => 1500 });
  assert.equal(value.ownStationAuthority, true); assert.equal(value.configuredRoleMatches, false); privateAbsent(value);
});
