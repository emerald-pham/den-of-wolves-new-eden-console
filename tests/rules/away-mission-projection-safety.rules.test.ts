import { assertFails, assertSucceeds, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { collection, doc, getDocFromServer, getDocs, query, setDoc, updateDoc, where } from 'firebase/firestore';
import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';
import { allocatedKPrivacyEnvironment } from '../fixtures/kPrivacyRuntime';
import { legacyFailedKProjectionFixture } from '../fixtures/legacyFailedKProjection';
import { projectAwayMissionPublicState } from '../../functions/src/awayMissionLifecycleAdapter';

// UNEXECUTED: root must allocate the real rules/query RED before rules edits.
const fixture = legacyFailedKProjectionFixture();
const session = `sessions/${fixture.sessionId}`;
let env: RulesTestEnvironment;
beforeAll(async () => { env = (await allocatedKPrivacyEnvironment()).environment; });
afterAll(async () => { await env?.cleanup(); });
beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async context => {
    const database = context.firestore();
    await setDoc(doc(database, session), { name: 'Synthetic K privacy table', phase: 'active', currentTurn: 2 });
    for (const uid of ['alice', 'bob', 'gm']) await setDoc(doc(database, `${session}/players/${uid}`), {
      uid, role: uid === 'gm' ? 'gm' : 'player', connected: true, fleetGroupId: 'fleet-1',
    });
    await setDoc(doc(database, `${session}/serverState/awayMissions/instances/${fixture.missionId}`), {
      schemaVersion: 1, missionId: fixture.missionId, lifecycleRecord: fixture.record,
    });
    for (const pointer of fixture.pointers) await setDoc(doc(database, `${session}/awayMissionHandPointers/${pointer.handId}`), pointer);
    for (const hand of fixture.hands) await setDoc(doc(database, `${session}/awayMissionHands/${hand.handId}`), hand);
  });
});

const as = (uid: string) => env.authenticatedContext(uid).firestore();
const ownerQuery = () => query(collection(as('alice'), `${session}/awayMissionHandPointers`),
  where('sessionId', '==', fixture.sessionId), where('participantUid', '==', 'alice'));
const markers = [
  ['no marker', undefined], ['held', { policyVersion: 1, epoch: 3, state: 'held', writeRevision: 17 }],
  ['malformed ready', { policyVersion: 1, epoch: 0, state: 'ready', writeRevision: 17 }],
] as const;

it.each(markers)('denies an actual owner server get of legacy failed K while safety is %s', async (_label, marker) => {
  await setMarker(marker);
  expect(fixture.record.outcomes?.[0]).toMatchObject({ contributorCount: 1, difficulty: 30, criticalThreshold: 40, outcome: 'failure', rewardBranch: 'none' });
  expect(fixture.pointers[0]!.lifecyclePublicState.outcomes?.[0]).toMatchObject({ difficulty: 30, criticalThreshold: 40 });
  await assertFails(getDocFromServer(doc(as('alice'), `${session}/awayMissionHandPointers/${fixture.pointers[0]!.handId}`)));
});

it.each(markers)('denies the actual two-filter owner list of legacy failed K while safety is %s', async (_label, marker) => {
  await setMarker(marker);
  expect(fixture.record.rewards).toEqual([expect.objectContaining({ branch: 'none', resources: {}, effects: [] })]);
  await assertFails(getDocs(ownerQuery()));
});

it('keeps current GM get/list readiness complete while held and rejects foreign owner access', async () => {
  await setMarker({ policyVersion: 1, epoch: 3, state: 'held', writeRevision: 17 });
  const first = fixture.pointers[0]!;
  expect((await assertSucceeds(getDocFromServer(doc(as('gm'), `${session}/awayMissionHandPointers/${first.handId}`))))
    .data()?.lifecyclePublicState.outcomes[0]).toMatchObject({ difficulty: 30, criticalThreshold: 40, outcome: 'failure' });
  const gmList = await assertSucceeds(getDocs(query(collection(as('gm'), `${session}/awayMissionHandPointers`),
    where('sessionId', '==', fixture.sessionId))));
  expect(gmList.docs.map(snapshot => snapshot.id).sort()).toEqual(fixture.pointers.map(pointer => pointer.handId).sort());
  await assertFails(getDocFromServer(doc(as('bob'), `${session}/awayMissionHandPointers/${first.handId}`)));
  await assertFails(getDocs(query(collection(as('bob'), `${session}/awayMissionHandPointers`),
    where('sessionId', '==', fixture.sessionId), where('participantUid', '==', 'alice'))));
  await assertFails(getDocs(collection(as('alice'), `${session}/awayMissionHandPointers`)));
  await assertFails(getDocFromServer(doc(as('alice'), `${session}/serverState/awayMissions/instances/${fixture.missionId}`)));
});

it('allows exact owner get/list after canonical all-participant sanitation and server readiness', async () => {
  await env.withSecurityRulesDisabled(async context => {
    for (const pointer of fixture.pointers) await updateDoc(doc(context.firestore(), `${session}/awayMissionHandPointers/${pointer.handId}`), {
      lifecyclePublicState: projectAwayMissionPublicState(fixture.record, pointer.participantUid),
    });
  });
  await setMarker({ policyVersion: 1, epoch: 3, state: 'ready', writeRevision: 18 });
  const own = await assertSucceeds(getDocFromServer(doc(as('alice'), `${session}/awayMissionHandPointers/${fixture.pointers[0]!.handId}`)));
  expect(own.data()?.lifecyclePublicState.outcomes[0]).toMatchObject({ difficulty: null, criticalThreshold: null, outcome: 'failure' });
  const list = await assertSucceeds(getDocs(ownerQuery()));
  expect(list.docs.map(snapshot => snapshot.id)).toEqual([fixture.pointers[0]!.handId]);
  await assertFails(updateDoc(doc(as('alice'), session), { awayMissionProjectionSafety: { policyVersion: 1, epoch: 4, state: 'ready', writeRevision: 0 } }));
});

it.each([{ role: 'player', connected: true }, { role: 'gm', connected: false }])('revokes GM raw-pointer readiness after live membership changes (%s)', async patch => {
  await setMarker({ policyVersion: 1, epoch: 3, state: 'held', writeRevision: 17 });
  await env.withSecurityRulesDisabled(async context => { await updateDoc(doc(context.firestore(), `${session}/players/gm`), patch); });
  await assertFails(getDocFromServer(doc(as('gm'), `${session}/awayMissionHandPointers/${fixture.pointers[0]!.handId}`)));
  await assertFails(getDocs(query(collection(as('gm'), `${session}/awayMissionHandPointers`), where('sessionId', '==', fixture.sessionId))));
});

async function setMarker(marker: unknown) {
  if (marker !== undefined) await env.withSecurityRulesDisabled(async context => {
    await updateDoc(doc(context.firestore(), session), { awayMissionProjectionSafety: marker });
  });
}
