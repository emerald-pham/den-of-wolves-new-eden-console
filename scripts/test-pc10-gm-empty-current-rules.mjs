import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test, { after, before, beforeEach } from 'node:test';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const dependencies = '/private/tmp/dow-pc09-execution-20261004/node_modules';
const requireNative = createRequire(join(dependencies, '../package.json'));
const { initializeTestEnvironment, assertFails, assertSucceeds } = requireNative('@firebase/rules-unit-testing');
const { collection, deleteDoc, doc, documentId, getDocFromServer, getDocs, onSnapshot,
  query, setDoc, setLogLevel, Timestamp, updateDoc, where } = requireNative('firebase/firestore');
const ts = requireNative('typescript');
setLogLevel('error');
const projectId = 'demo-pc10-gm-empty-current';
assert.ok(process.env.FIRESTORE_EMULATOR_HOST, 'An explicitly owned local Firestore emulator is required.');
const [host, port] = process.env.FIRESTORE_EMULATOR_HOST.split(':');
assert.ok(['127.0.0.1', 'localhost'].includes(host));
assert.ok(Number.isInteger(Number(port)) && Number(port) > 0);
const sessionId = 'gm-empty-current-session';
const sessionPath = `sessions/${sessionId}`;
const currentPath = `${sessionPath}/facilitatorRuleCalls/gm-current`;
const gmUid = 'original-gm';
let env;

// Execute the current exported subscriber, parser, timestamp and revision gate
// bodies verbatim. Only db() selects this test's original authenticated SDK
// client. The SDK, snapshots, Rules evaluation and error lifecycle are real.
const source = readFileSync(join(root, 'src/lib/firestore.ts'), 'utf8');
const tree = ts.createSourceFile('firestore.ts', source, ts.ScriptTarget.Latest, true);
const sourceNames = ['optionalIso', 'facilitatorRuleCall', 'createMonotonicRevisionGate', 'subscribeGmFacilitatorRuleCall'];
const sourceNodes = sourceNames.map(name => {
  const node = tree.statements.find(value => ts.isFunctionDeclaration(value) && value.name?.text === name);
  assert.ok(node, name); return node.getText(tree);
});
const transpile = text => ts.transpileModule(text, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText;
const identifiers = { exports: {} };
new Function('module', 'exports', transpile(readFileSync(join(root, 'src/types/identifiers.ts'), 'utf8')))(
  identifiers, identifiers.exports,
);
function sourceSubscriber(database, observeSnapshot) {
  const exports = {};
  new Function('exports', 'doc', 'onSnapshot', 'db', 'entityId', 'parseEntityId', transpile(sourceNodes.join('\n')))(
    exports, doc, observeSnapshot, () => database, identifiers.exports.entityId, identifiers.exports.parseEntityId,
  );
  return exports.subscribeGmFacilitatorRuleCall;
}

before(async () => {
  env = await initializeTestEnvironment({ projectId,
    firestore: { host, port: Number(port), rules: readFileSync(join(root, 'firestore.rules'), 'utf8') } });
});
after(async () => { await env?.cleanup(); });
beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async context => {
    const database = context.firestore();
    await setDoc(doc(database, sessionPath), { ownerUid: gmUid, phase: 'active', currentTurn: 1 });
    for (const [uid, role, connected] of [[gmUid, 'gm', true], ['crew', 'player', true],
      ['observer', 'observer', true], ['disconnected-gm', 'gm', false], ['former-gm', 'player', true]]) {
      await setDoc(doc(database, `${sessionPath}/players/${uid}`), { uid, role, connected });
    }
    await setDoc(doc(database, `${sessionPath}/gmInstances/original-device`), {
      uid: gmUid, sessionId, claimedAt: '2026-10-06T00:00:00.000Z',
    });
    await setDoc(doc(database, 'sessions/other-session/players/foreign-gm'), {
      uid: 'foreign-gm', role: 'gm', connected: true,
    });
  });
});
const as = uid => env.authenticatedContext(uid).firestore();
const server = callback => env.withSecurityRulesDisabled(context => callback(context.firestore()));
const writeCurrent = value => server(database => setDoc(doc(database, currentPath), value));
const current = (revision = 1) => ({
  type: 'facilitator-rule-call', sessionId, callId: `rule-${revision}`, revision,
  ambiguity: 'Native rules question.', source: 'Native rules reference.', decision: 'Native rules decision.',
  audience: 'gm-only', actorUid: gmUid, label: 'FACILITATOR RULE CALL', createdAt: Timestamp.now(),
});

function listenFromCurrentSource(database) {
  const values = [], errors = [], snapshots = [], waiters = new Set();
  let subscriptions = 0, closed = false;
  const notify = () => { for (const waiter of [...waiters]) if (waiter.predicate()) {
    waiters.delete(waiter); clearTimeout(waiter.timer); waiter.resolve();
  } };
  const subscribe = sourceSubscriber(database, (reference, metadata, next, error) => {
    subscriptions += 1;
    assert.equal(reference.path, currentPath); assert.deepEqual(metadata, { includeMetadataChanges: true });
    return onSnapshot(reference, metadata, snapshot => {
      snapshots.push({ exists: snapshot.exists(), fromCache: snapshot.metadata.fromCache });
      next(snapshot); notify();
    }, failure => {
      errors.push(failure.code); error(failure); notify();
    });
  });
  const unsubscribe = subscribe(sessionId, value => { values.push(value); notify(); });
  return { values, errors, snapshots, subscriptions: () => subscriptions,
    until: predicate => predicate() ? Promise.resolve() : new Promise((resolve, reject) => {
      const waiter = { predicate, resolve, timer: setTimeout(() => {
        waiters.delete(waiter); reject(new Error('The original SDK listener did not deliver the expected source event.'));
      }, 8_000) }; waiters.add(waiter);
    }),
    close: () => { if (closed) return; closed = true; unsubscribe();
      for (const waiter of waiters) clearTimeout(waiter.timer); waiters.clear(); },
  };
}

// Regression: the exact GM listener mounts before the first server ruling.
test('original connected GM can get the absent exact current document from the server', async () => {
  const snapshot = await assertSucceeds(getDocFromServer(doc(as(gmUid), currentPath)));
  assert.equal(snapshot.exists(), false); assert.equal(snapshot.metadata.fromCache, false);
});

test('original source GM listener stays live from empty through first ruling without resubscribe or reload', async () => {
  const listener = listenFromCurrentSource(as(gmUid));
  try {
    await listener.until(() => listener.errors.length > 0 || listener.snapshots.some(value => !value.fromCache));
    assert.deepEqual(listener.errors, [], 'The original absent-document listener must not terminate with permission-denied.');
    assert.ok(listener.snapshots.some(value => !value.exists && !value.fromCache));
    assert.equal(listener.values.at(-1), null); assert.equal(listener.subscriptions(), 1);
    await writeCurrent(current());
    await listener.until(() => listener.errors.length > 0 || listener.values.at(-1)?.revision === 1);
    assert.deepEqual(listener.errors, []);
    assert.equal(listener.values.at(-1).sessionId, sessionId); assert.equal(listener.values.at(-1).callId, 'rule-1');
    assert.equal(listener.values.at(-1).actorUid, gmUid);
    assert.ok(Number.isFinite(Date.parse(listener.values.at(-1).createdAt)));
    await writeCurrent(current(2));
    await listener.until(() => listener.errors.length > 0 || listener.values.at(-1)?.revision === 2);
    assert.deepEqual(listener.errors, []); assert.equal(listener.subscriptions(), 1);
    assert.equal(listener.values.at(-1).callId, 'rule-2');
  } finally { listener.close(); }
  assert.equal(listener.values.at(-1), null);
});

for (const uid of ['crew', 'observer', 'foreign-gm', 'disconnected-gm', 'former-gm', 'nonmember']) {
  test(`absent current remains denied to ${uid}`, async () => {
    await assertFails(getDocFromServer(doc(as(uid), currentPath)));
  });
}
test('absent current remains denied without Auth', async () => {
  await assertFails(getDocFromServer(doc(env.unauthenticatedContext().firestore(), currentPath)));
});
test('original GM cannot read an absent current document in a foreign session', async () => {
  await assertFails(getDocFromServer(doc(as(gmUid), 'sessions/other-session/facilitatorRuleCalls/gm-current')));
});

for (const [name, mutate] of [
  ['foreign type', value => ({ ...value, type: 'other-projection' })],
  ['foreign session', value => ({ ...value, sessionId: 'other-session' })],
  ['missing type', value => { const copy = { ...value }; delete copy.type; return copy; }],
  ['missing session', value => { const copy = { ...value }; delete copy.sessionId; return copy; }],
  ['null type', value => ({ ...value, type: null })],
  ['null session', value => ({ ...value, sessionId: null })],
  ['empty occupied document', () => ({})],
]) test(`occupied current with ${name} remains denied to original GM`, async () => {
  await writeCurrent(mutate(current()));
  await assertFails(getDocFromServer(doc(as(gmUid), currentPath)));
});

test('valid occupied GM current and exact GM history/audit reads retain their existing audience', async () => {
  await writeCurrent(current());
  await server(async database => {
    await setDoc(doc(database, `${sessionPath}/facilitatorRuleCalls/history-rule-1`), current());
    await setDoc(doc(database, `${sessionPath}/facilitatorRuleCalls/audit-rule-1`), { actorUid: gmUid });
  });
  for (const name of ['gm-current', 'history-rule-1', 'audit-rule-1']) {
    await assertSucceeds(getDocFromServer(doc(as(gmUid), `${sessionPath}/facilitatorRuleCalls/${name}`)));
    await assertFails(getDocFromServer(doc(as('crew'), `${sessionPath}/facilitatorRuleCalls/${name}`)));
  }
});

test('missing-current permission is limited to the exact gm-current path', async () => {
  for (const name of ['current', 'gm-other', 'player-current', 'recipient-other']) {
    await assertFails(getDocFromServer(doc(as(gmUid), `${sessionPath}/facilitatorRuleCalls/${name}`)));
  }
});

test('exact eligible player empty-recipient compatibility and private GM exclusion remain unchanged', async () => {
  await assertSucceeds(getDocFromServer(doc(as('crew'), `${sessionPath}/facilitatorRuleCalls/recipient-crew`)));
  await assertFails(getDocFromServer(doc(as('crew'), `${sessionPath}/facilitatorRuleCalls/recipient-other`)));
  await assertFails(getDocFromServer(doc(as(gmUid), `${sessionPath}/facilitatorRuleCalls/recipient-${gmUid}`)));
});

test('GM and ordinary player still cannot list or query the private ruling collection', async () => {
  await writeCurrent(current());
  for (const uid of [gmUid, 'crew']) {
    const reference = collection(as(uid), `${sessionPath}/facilitatorRuleCalls`);
    await assertFails(getDocs(reference));
    await assertFails(getDocs(query(reference, where(documentId(), '==', 'gm-current'))));
  }
});

for (const uid of [gmUid, 'crew']) test(`all client ruling writes remain denied to ${uid}`, async () => {
  const reference = doc(as(uid), currentPath);
  await assertFails(setDoc(reference, current()));
  await writeCurrent(current());
  await assertFails(setDoc(reference, current(2)));
  await assertFails(updateDoc(reference, { decision: 'Client overwrite.' }));
  await assertFails(deleteDoc(reference));
});

for (const patch of [{ role: 'player' }, { connected: false }]) {
  test(`original GM loses current access on ${Object.keys(patch)[0]} loss without changing Auth UID`, async () => {
    await writeCurrent(current()); const database = as(gmUid);
    await assertSucceeds(getDocFromServer(doc(database, currentPath)));
    await server(admin => updateDoc(doc(admin, `${sessionPath}/players/${gmUid}`), patch));
    await assertFails(getDocFromServer(doc(database, currentPath)));
    await server(admin => deleteDoc(doc(admin, currentPath)));
    await assertFails(getDocFromServer(doc(database, currentPath)));
  });
}

test('the real occupied source subscription clears when the next ruling is published after GM role revocation', async () => {
  await writeCurrent(current()); const listener = listenFromCurrentSource(as(gmUid));
  try {
    await listener.until(() => listener.errors.length > 0 || listener.values.at(-1)?.revision === 1);
    assert.deepEqual(listener.errors, []);
    await server(admin => updateDoc(doc(admin, `${sessionPath}/players/${gmUid}`), { role: 'player' }));
    // A watched source publication exercises the real SDK's denied delivery;
    // the native emulator did not emit on the dependency-only player update.
    await writeCurrent(current(2));
    await listener.until(() => listener.errors.length > 0);
    assert.deepEqual(listener.errors, ['permission-denied']); assert.equal(listener.values.at(-1), null);
    assert.equal(listener.subscriptions(), 1);
  } finally { listener.close(); }
});
