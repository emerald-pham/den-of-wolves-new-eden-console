// Prepared engine proof, NOT RUN without a parent-allocated isolated emulator row.
// No production project, credentials or rules deployment is accepted by this harness.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, collection, getDocFromServer, getDocs, setDoc, updateDoc, deleteDoc } from 'firebase/firestore';

const address = process.env.FIRESTORE_EMULATOR_HOST;
const projectId = process.env.CASTING_RULES_PROJECT_ID;
if (!/^127\.0\.0\.1:\d+$/.test(address ?? '') || !/^demo-dow-casting-[a-z0-9-]+$/.test(projectId ?? '')) {
  throw new Error('Requires allocated loopback FIRESTORE_EMULATOR_HOST and isolated demo-dow-casting-* project. No defaults or production fallback.');
}
const [host, port] = address.split(':');
const paths = [
  'castingWorkspaces/synthetic-alpha',
  'castingWorkspaces/synthetic-alpha/members/synthetic-owner',
  'castingWorkspaces/synthetic-alpha/forms/synthetic-form',
  'castingWorkspaces/synthetic-alpha/responses/synthetic-response',
  'castingWorkspaces/synthetic-alpha/instances/synthetic-instance',
  'castingWorkspaces/synthetic-alpha/grants/synthetic-grant',
  'castingWorkspaces/synthetic-alpha/receipts/synthetic-receipt',
  'castingWorkspaces/synthetic-alpha/deactivationReceipts/synthetic-receipt',
  'castingPublishedHandles/synthetic-handle',
  'castingSessionWorkspaces/synthetic-session',
  'castingIngressCounters/synthetic-quota',
];
let environment;
before(async () => {
  environment = await initializeTestEnvironment({ projectId, firestore: { host, port: Number(port), rules: await readFile('/Users/emeraldpham/Documents/Codex/2026-10-08/task-14/casting-release/firestore.rules', 'utf8') } });
  await environment.clearFirestore();
  await environment.withSecurityRulesDisabled(async context => {
    for (const path of paths) await setDoc(doc(context.firestore(), path), { fixture: 'Synthetic private content', revision: 1 });
    await setDoc(doc(context.firestore(), paths[1]), { uid: 'synthetic-owner', role: 'owner' });
    await setDoc(doc(context.firestore(), 'castingWorkspaces/synthetic-beta/members/synthetic-foreign-owner'), { uid: 'synthetic-foreign-owner', role: 'owner' });
    await setDoc(doc(context.firestore(), paths[5]), { recipientUid: 'synthetic-recipient', active: true, snapshot: { details: 'Synthetic published content' } });
    await setDoc(doc(context.firestore(), 'sessions/synthetic-game'), { name: 'Synthetic game' });
    await setDoc(doc(context.firestore(), 'sessions/synthetic-game/players/synthetic-gm'), { connected: true, role: 'gm' });
  });
});
after(async () => { await environment?.cleanup(); });
const denied = promise => assert.rejects(promise, failure => failure.code === 'permission-denied');
test('existing genuine game GM entitlement does not grant casting authority', async () => {
  const db = environment.authenticatedContext('synthetic-gm').firestore();
  assert.equal((await getDocFromServer(doc(db, 'sessions/synthetic-game'))).data().name, 'Synthetic game');
  await denied(getDocFromServer(doc(db, paths[3])));
});
test('owner recipient foreign-owner game-GM and unauthenticated clients cannot read or enumerate casting docs', async () => {
  for (const uid of ['synthetic-owner', 'synthetic-recipient', 'synthetic-foreign-owner', 'synthetic-gm', null]) {
    const db = (uid ? environment.authenticatedContext(uid) : environment.unauthenticatedContext()).firestore();
    for (const path of paths) {
      await denied(getDocFromServer(doc(db, path)));
      await denied(getDocs(collection(db, path.split('/').slice(0, -1).join('/'))));
    }
  }
});
test('owner and unauthenticated clients cannot create update delete or self-grant', async () => {
  for (const uid of ['synthetic-owner', null]) {
    const db = (uid ? environment.authenticatedContext(uid) : environment.unauthenticatedContext()).firestore();
    for (const path of paths) {
      await denied(setDoc(doc(db, `${path}-new`), { role: 'owner', fixture: 'Synthetic attempt' }));
      await denied(updateDoc(doc(db, path), { role: 'owner', revision: 2 }));
      await denied(deleteDoc(doc(db, path)));
    }
  }
});
