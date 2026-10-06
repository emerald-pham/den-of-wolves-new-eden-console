import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { EventEmitter } from 'node:events';
import test from 'node:test';
import vm from 'node:vm';
import { createPc10BrowserActor } from './pc10-browser-session-proof.mjs';
import { createPc10FunctionalCommand, assessPc10FunctionalTransport } from './pc10-gate2-functional-proof.mjs';

const digest = (kind, value) => createHash('sha256').update(`security-denial-${kind}\0${value}`).digest('hex');
const documentId = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa';
const documentHash = createHash('sha256').update(`pc10-native-durable-document\0${documentId}`).digest('hex');
const sdkUrl = 'http://127.0.0.1:5174/node_modules/.vite/deps/firebase_firestore.js?v=original-unit';
const phaseNames = ['callback-entry', 'first-import-complete', 'second-import-complete', 'getDoc-invoked', 'originally-settled'];
const turn = () => new Promise(resolve => setImmediate(resolve));
const denial = () => Object.assign(new Error('private SDK body must stay outside diagnostics'), { code: 'permission-denied' });
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  void promise.catch(() => {});
  return { promise, resolve, reject };
}

// The actual actor sends the actual callback to an inert browser realm. Only
// the two original import targets, original SDK promise, and RPC delivery are
// controlled. There is no replacement privateRead or detached policy wrapper.
async function fixture(t, { envelopePatch = value => value, holdLastConsole = true } = {}) {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: 1000 });
  const timers = [], nativeSetTimeout = globalThis.setTimeout;
  t.mock.method(globalThis, 'setTimeout', (...args) => { timers.push(args[1]); return nativeSetTimeout(...args); });
  const page = new EventEmitter(), cdp = new EventEmitter();
  const sdk = deferred(), rpc = deferred();
  const counts = { evaluate: 0, imports: [], getDoc: 0, db: 0, doc: 0, exists: 0, binding: 0, authority: 0 };
  const args = [], consoleNotes = [];
  let returnedEnvelope, heldConsole;
  page.setDefaultTimeout = () => {};
  page.setDefaultNavigationTimeout = () => {};
  cdp.send = async name => { assert.ok(['Network.enable', 'Network.configureDurableMessages'].includes(name)); return {}; };
  cdp.detach = async () => {};
  const context = { newPage: async () => page, newCDPSession: async () => cdp, close: async () => {} };
  const client = await createPc10BrowserActor({ newContext: async () => context }, 'http://127.0.0.1:5174', 'admiral');
  const emit = note => page.emit('console', {
    text: () => `PC10_PRIVATE_SDK_PHASE:${JSON.stringify(note)}`, page: () => page, worker: () => null,
  });
  const sandbox = { Date, Symbol, console: { debug: text => {
    const note = JSON.parse(text.slice(text.indexOf(':') + 1));
    consoleNotes.push(note);
    if (note.ordinal === 4 && holdLastConsole) heldConsole = note;
    else emit(note);
  } } };
  Object.defineProperty(sandbox, Symbol.for('pc10-proof-native-durable-document'), { value: documentId });
  const realm = vm.createContext(sandbox), modules = new Map();
  const load = async specifier => {
    counts.imports.push(specifier);
    assert.ok(['/src/lib/firestore.ts', sdkUrl].includes(specifier));
    if (!modules.has(specifier)) {
      const exports = specifier === '/src/lib/firestore.ts'
        ? { db: () => { counts.db++; return 'inert-db'; } }
        : {
          doc: (db, path) => { counts.doc++; assert.equal(db, 'inert-db');
            assert.equal(path, 'sessions/original-private-session/secrets/wolf-assignment'); return 'inert-ref'; },
          getDocFromServer: ref => { counts.getDoc++; assert.equal(ref, 'inert-ref'); return sdk.promise; },
        };
      const module = new vm.SyntheticModule(Object.keys(exports), function () {
        for (const [key, value] of Object.entries(exports)) this.setExport(key, value);
      }, { context: realm });
      await module.link(() => assert.fail('No third import is allowed.'));
      await module.evaluate();
      t.mock.timers.tick(100); // Inert import work advances the original clock, without another timer.
      modules.set(specifier, module);
    }
    return modules.get(specifier);
  };
  page.evaluate = (callback, input) => {
    counts.evaluate++; args.push(input); realm.arg = input;
    const script = new vm.Script(`(${callback.toString()})(arg)`, { importModuleDynamically: load });
    return script.runInContext(realm).then(async envelope => {
      returnedEnvelope = envelope;
      await rpc.promise;
      return structuredClone(envelopePatch(envelope));
    });
  };
  page.emit('request', { url: () => sdkUrl });
  const original = { roleId: 'admiral', uid: 'original-private-actor', sessionId: 'original-private-session',
    contextHash: digest('context', 'original-private-context'), scope: { groupId: 'fleet-1', vesselIds: ['dione'], craftIds: [] } };
  const ledger = [], originals = new Map([[original.roleId, original]]);
  const binding = () => { counts.binding++; return { authUid: original.uid, storeUid: original.uid,
    sessionId: original.sessionId, assignedRoleId: original.roleId, activeConsoleRoleId: original.roleId,
    seatId: original.roleId, contextHash: original.contextHash, nativeDocumentHash: documentHash, observedAt: Date.now() }; };
  const authority = () => { counts.authority++; return { roleId: original.roleId, uid: original.uid,
    sessionId: original.sessionId, checkedAt: Date.now(), sourceHash: digest('source', 'same-original-private-authority'),
    phase: 'active', currentTurn: 1, connected: true, nonKicked: true, playerRole: 'player', assignedRoleId: original.roleId,
    activeConsoleRoleId: original.roleId, seatId: original.roleId, generation: 5, groupId: 'fleet-1', vesselIds: ['dione'],
    craftIds: [], sameMembership: true, seatHolderUid: original.uid, seatStatus: 'claimed' }; };
  const command = createPc10FunctionalCommand({ ledger, originals, clients: new Map([[original.roleId, client]]),
    observeBinding: binding, captureAuthority: authority, clock: () => Date.now(),
    validateReply: value => ({ passed: value.reply?.status === 'denied' && value.reply?.code === 'permission-denied' }) });
  const run = () => command(original.roleId, 'privateFirestoreRead', { suffix: 'secrets/wolf-assignment' },
    { expectedDenial: 'permission-denied' });
  const record = () => { assert.ok(ledger[0].privateSdkDiagnostic); return ledger[0].privateSdkDiagnostic; };
  const deliver = () => { if (heldConsole) emit(heldConsole); rpc.resolve(); };
  t.after(async () => {
    sdk.reject(denial()); rpc.resolve(); await turn(); await client.close();
    t.mock.restoreAll(); t.mock.timers.reset();
  });
  return { run, record, ledger, originals, counts, timers, args, consoleNotes, sdk, deliver, emit,
    envelope: () => returnedEnvelope, advanceTo: elapsed => t.mock.timers.tick(1000 + elapsed - Date.now()) };
}

const originalCore = entry => JSON.stringify(Object.fromEntries(Object.entries(entry)
  .filter(([key]) => key !== 'privateSdkDiagnostic')));
function assertPrivateSafe(diagnostic) {
  const text = JSON.stringify(diagnostic);
  for (const forbidden of ['original-private-actor', 'original-private-session', 'secrets/wolf-assignment',
    documentId, sdkUrl, 'private SDK body', 'inert-ref', 'private-token', 'Bearer']) {
    assert.equal(text.includes(forbidden), false, `Late diagnostic must not persist ${forbidden}.`);
  }
}
function assertFailedOriginalUnchanged(f, before) {
  const entry = f.ledger[0], diagnostic = f.record();
  assert.equal(originalCore(entry), before);
  assert.equal(entry.reply, undefined); assert.equal(entry.completedAt, null);
  assert.equal(entry.validation, undefined); assert.equal(entry.afterSource, undefined); assert.equal(entry.afterBinding, undefined);
  assert.equal(diagnostic.verification, 'UNCONFIRMED'); assert.equal(diagnostic.outcome, 'UNKNOWN');
  assert.equal(diagnostic.completedAt, null); assert.equal(diagnostic.deadlineExceeded, true);
  assert.deepEqual(diagnostic.phases.map(value => value.phase), phaseNames.slice(0, 4));
  assert.equal(assessPc10FunctionalTransport({ commands: f.ledger, originals: f.originals }).functionalStatus, 'FAILED');
  assert.deepEqual(f.counts, { evaluate: 1, imports: ['/src/lib/firestore.ts', sdkUrl], getDoc: 1,
    db: 1, doc: 1, exists: 0, binding: 1, authority: 1 });
  assert.deepEqual(f.timers, [15000]); assertPrivateSafe(diagnostic);
}
async function lateHistory(t, options = {}, sdkSettlesAt = 17000) {
  const f = await fixture(t, options), operation = f.run();
  void operation.catch(() => {}); await turn();
  assert.equal(f.record().dispatchedAt, 1000); assert.equal(f.counts.getDoc, 1);
  assert.equal(f.record().deadlineAt, 16000);
  if (sdkSettlesAt < 15000) {
    f.advanceTo(sdkSettlesAt); f.sdk.reject(denial()); await turn();
    assert.equal(f.envelope().phaseWitness.phases[4].browserAt, 1000 + sdkSettlesAt);
    f.advanceTo(15000);
  } else f.advanceTo(15000);
  await assert.rejects(operation, /^Error: admiral: private SDK read exceeded 15000ms$/);
  const before = originalCore(f.ledger[0]);
  if (sdkSettlesAt >= 15000) {
    f.advanceTo(sdkSettlesAt); f.sdk.reject(denial()); await turn();
  } else f.advanceTo(17000);
  f.deliver(); await turn();
  assertFailedOriginalUnchanged(f, before);
  assert.equal(f.record().lateSettlement.observedAt, 18000);
  assert.equal(f.record().lateSettlement.status, 'denied'); assert.equal(f.record().lateSettlement.code, 'permission-denied');
  return f;
}

for (const sdkSettlesAt of [14000, 17000]) {
  test(`real privateRead distinguishes SDK settlement at ${sdkSettlesAt}ms with same evaluate delivery at 17000ms and preserves 15000ms failure`, async t => {
    const f = await lateHistory(t, {}, sdkSettlesAt);
    assert.deepEqual(f.record().lateSettlement.phaseTiming,
      { status: 'RECORDED', originallySettledBrowserAt: 1000 + sdkSettlesAt });
    assert.equal(f.record().lateSettlement.phaseTiming.originallySettledBrowserAt <= f.record().deadlineAt, sdkSettlesAt < 15000);
    assert.equal(f.record().binding.nativeDocumentHash, documentHash);
    assert.equal(f.record().binding.actorHash, digest('actor', f.ledger[0].beforeBinding.authUid));
    assert.equal(f.record().binding.sessionHash, digest('session', f.ledger[0].beforeBinding.sessionId));
    assert.equal(f.record().binding.sourceBeforeHash, f.ledger[0].beforeSource.sourceHash);
    assert.equal(f.record().binding.commandFingerprint, f.ledger[0].registeredRequestFingerprint);
  });
}

const patchWitness = patch => envelope => ({ ...envelope, phaseWitness: patch(envelope.phaseWitness) });
const patchPhase = (ordinal, patch) => patchWitness(witness => ({ ...witness,
  phases: witness.phases.map((phase, index) => index === ordinal ? { ...phase, ...patch } : phase) }));
for (const [name, envelopePatch] of [
  ['foreign invocation', patchWitness(w => ({ ...w, invocationId: 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb' }))],
  ['foreign native document', patchWitness(w => ({ ...w, documentId: 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb' }))],
  ['malformed document', patchWitness(w => ({ ...w, documentId: 'not-a-document' }))],
  ['wrong schema', patchWitness(w => ({ ...w, schemaVersion: 2 }))],
  ['missing witness', envelope => ({ originalReply: envelope.originalReply })],
  ['private witness field', patchWitness(w => ({ ...w, token: 'private-token' }))],
  ['private envelope field', envelope => ({ ...envelope, token: 'private-token' })],
  ['missing settled phase', patchWitness(w => ({ ...w, phases: w.phases.slice(0, 4) }))],
  ['sixth duplicate phase', patchWitness(w => ({ ...w, phases: [...w.phases, w.phases[4]] }))],
  ['duplicate ordinal', patchPhase(4, { ordinal: 3 })],
  ['out-of-order name', patchPhase(4, { phase: 'getDoc-invoked' })],
  ['before dispatch time', patchPhase(4, { browserAt: 999 })],
  ['future settled time', patchPhase(4, { browserAt: 18001 })],
  ['fractional time', patchPhase(4, { browserAt: 17999.5 })],
  ['private phase field', patchPhase(4, { body: 'private-token' })],
  ['contradictory timely prefix', patchPhase(0, { browserAt: 1001 })],
  ['backward intermediate time', patchPhase(2, { browserAt: 1099 })],
]) {
  test(`same original late envelope rejects ${name} without changing original failure or persisting private data`, async t => {
    const f = await lateHistory(t, { envelopePatch });
    assert.equal(f.record().lateSettlement.phaseTiming?.status, 'REJECTED');
    assert.equal(f.record().lateSettlement.phaseTiming?.originallySettledBrowserAt, undefined);
    assert.match(f.record().lateSettlement.phaseTiming.reason, /^late-[a-z-]+$/);
    assert.deepEqual(Object.keys(f.record().lateSettlement.phaseTiming).sort(), ['reason', 'status']);
  });
}

test('late forged matching console settlement cannot provide same-original timing for a pending evaluate', async t => {
  const f = await fixture(t), operation = f.run(); void operation.catch(() => {}); await turn();
  f.advanceTo(15000); await assert.rejects(operation, /private SDK read exceeded 15000ms/);
  const before = originalCore(f.ledger[0]);
  f.emit({ schemaVersion: 1, invocationId: f.args[0].invocationId, documentId, ordinal: 4,
    phase: 'originally-settled', browserAt: Date.now() });
  assert.equal(f.record().lateSettlement, null);
  assertFailedOriginalUnchanged(f, before);
});

test('timely same-original denial retains existing five-phase verifier and exact public reply keys', async t => {
  const f = await fixture(t, { holdLastConsole: false }), operation = f.run(); await turn();
  f.sdk.reject(denial()); await turn(); f.deliver();
  const reply = await operation, d = f.record();
  assert.deepEqual(reply, { status: 'denied', code: 'permission-denied' });
  assert.deepEqual(Object.keys(reply).sort(), ['code', 'status']);
  assert.equal(d.verification, 'VERIFIED'); assert.equal(d.outcome, 'DENIED');
  assert.deepEqual(d.phases.map(value => value.phase), phaseNames);
  assert.equal(d.lateSettlement, null); assert.equal(f.ledger[0].validation.passed, true);
  assert.equal(f.counts.evaluate, 1); assert.equal(f.counts.imports.length, 2); assert.equal(f.counts.getDoc, 1);
  assert.deepEqual(f.timers, [15000]); assertPrivateSafe(d);
});
