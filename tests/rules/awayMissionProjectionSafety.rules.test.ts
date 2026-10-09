import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { collection, doc, getDocFromServer, getDocs, query, setDoc, updateDoc, where } from 'firebase/firestore';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';
import { legacyFailedKProjectionFixture } from '../fixtures/legacyFailedKProjection';
import { projectAwayMissionPublicState } from '../../functions/src/awayMissionLifecycleAdapter';

// Permanent regressions use the established allocated test:rules wrapper.
// Their real SDK execution is parent-owned; this worker only authors source.
const fixture = legacyFailedKProjectionFixture('k-rule-safety');
const root = `sessions/${fixture.sessionId}`;
const [host = '127.0.0.1', port = '8080'] = (process.env.FIRESTORE_EMULATOR_HOST ?? '127.0.0.1:8080').split(':');
let environment: RulesTestEnvironment;
beforeAll(async () => {
  environment = await initializeTestEnvironment({ projectId: 'dow-k-projection-safety-rules',
    firestore: { host, port: Number(port), rules: readFileSync('firestore.rules', 'utf8') } });
});
afterAll(async () => { await environment?.cleanup(); });
beforeEach(async () => {
  await environment.clearFirestore();
  await environment.withSecurityRulesDisabled(async context => {
    const database = context.firestore();
    await setDoc(doc(database, root), { name: 'K rule safety table', phase: 'active' });
    for (const uid of ['alice', 'bob', 'gm']) await setDoc(doc(database, `${root}/players/${uid}`), {
      uid, role: uid === 'gm' ? 'gm' : 'player', connected: true,
    });
    for (const pointer of fixture.pointers) await setDoc(doc(database, `${root}/awayMissionHandPointers/${pointer.handId}`), pointer);
  });
});
const as = (uid: string) => environment.authenticatedContext(uid).firestore();
const ownerQuery = (uid = 'alice', participantUid = uid) => query(collection(as(uid), `${root}/awayMissionHandPointers`),
  where('sessionId', '==', fixture.sessionId), where('participantUid', '==', participantUid));
const ready = { policyVersion: 1, epoch: 3, state: 'ready', writeRevision: 18 };
const unsafe = [undefined, { ...ready, state: 'held' }, { ...ready, epoch: 0 }, { ...ready, policyVersion: 2 },
  { ...ready, epoch: '3' }, { ...ready, epoch: 3.5 }, { ...ready, writeRevision: -1 },
  { ...ready, writeRevision: 0.5 }, { ...ready, additional: true }];
it.each(unsafe)('denies exact owner get and the unchanged two-filter owner query under an unsafe marker (%s)', async marker => {
  if (marker !== undefined) await setMarker(marker);
  expect(fixture.record.outcomes?.[0]).toMatchObject({ total: 20, contributorCount: 1, difficulty: 30, criticalThreshold: 40, outcome: 'failure' });
  expect(fixture.record.rewards).toEqual([expect.objectContaining({ branch: 'none', resources: {}, effects: [] })]);
  await assertFails(getDocFromServer(doc(as('alice'), `${root}/awayMissionHandPointers/${fixture.pointers[0]!.handId}`)));
  await assertFails(getDocs(ownerQuery()));
});
it('keeps connected current GM readiness independent of missing and held markers, while foreign queries remain denied', async () => {
  for (const marker of [undefined, { ...ready, state: 'held' }]) {
    if (marker) await setMarker(marker);
    const list = await assertSucceeds(getDocs(query(collection(as('gm'), `${root}/awayMissionHandPointers`),
      where('sessionId', '==', fixture.sessionId))));
    expect(list.docs.map(entry => entry.id).sort()).toEqual(fixture.pointers.map(pointer => pointer.handId).sort());
    expect((await assertSucceeds(getDocFromServer(doc(as('gm'), `${root}/awayMissionHandPointers/${fixture.pointers[0]!.handId}`))))
      .data()?.lifecyclePublicState.outcomes[0]).toMatchObject({ difficulty: 30, criticalThreshold: 40 });
    await assertFails(getDocs(ownerQuery('bob', 'alice')));
    await assertFails(getDocs(collection(as('alice'), `${root}/awayMissionHandPointers`)));
  }
});
it('returns raw sanitized K fields through exact owner get/list only after server readiness and denies client marker writes', async () => {
  await environment.withSecurityRulesDisabled(async context => {
    for (const pointer of fixture.pointers) await updateDoc(doc(context.firestore(), `${root}/awayMissionHandPointers/${pointer.handId}`), {
      lifecyclePublicState: projectAwayMissionPublicState(fixture.record, pointer.participantUid),
    });
  });
  await setMarker(ready);
  const snapshot = await assertSucceeds(getDocFromServer(doc(as('alice'), `${root}/awayMissionHandPointers/${fixture.pointers[0]!.handId}`)));
  expect(snapshot.data()?.lifecyclePublicState.outcomes[0]).toMatchObject({ total: 20, difficulty: null, criticalThreshold: null });
  expect((await assertSucceeds(getDocs(ownerQuery()))).docs.map(entry => entry.id)).toEqual([fixture.pointers[0]!.handId]);
  await assertFails(updateDoc(doc(as('alice'), root), { awayMissionProjectionSafety: ready }));
  await assertFails(updateDoc(doc(as('gm'), root), { awayMissionProjectionSafety: ready }));
});
it.each([{ role: 'player', connected: true }, { role: 'gm', connected: false }])('revokes GM raw readiness using the current membership (%s)', async patch => {
  await setMarker({ ...ready, state: 'held' });
  await environment.withSecurityRulesDisabled(async context => { await updateDoc(doc(context.firestore(), `${root}/players/gm`), patch); });
  await assertFails(getDocFromServer(doc(as('gm'), `${root}/awayMissionHandPointers/${fixture.pointers[0]!.handId}`)));
  await assertFails(getDocs(query(collection(as('gm'), `${root}/awayMissionHandPointers`), where('sessionId', '==', fixture.sessionId))));
});
async function setMarker(marker: unknown) {
  await environment.withSecurityRulesDisabled(context => updateDoc(doc(context.firestore(), root), { awayMissionProjectionSafety: marker }));
}
