import { initializeApp, deleteApp, type FirebaseApp } from 'firebase/app';
import { collection, connectFirestoreEmulator, doc, getDocFromCache, getDocs, getFirestore,
  onSnapshot, query, setDoc, terminate, updateDoc, where } from 'firebase/firestore';
import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import { allocatedKPrivacyEnvironment } from '../fixtures/kPrivacyRuntime';
import { legacyFailedKProjectionFixture } from '../fixtures/legacyFailedKProjection';
import type { AwayMissionLifecycleFeedState } from '../../src/lib/awayMissionLifecycleService';
import type { RulesTestEnvironment } from '@firebase/rules-unit-testing';
import type * as FirestoreSdk from 'firebase/firestore';

// Every Firestore implementation is real. The listener spy forwards unchanged
// to the installed SDK; Auth identity is controlled using the same emulator UID.
vi.mock('firebase/firestore', async original => {
  const sdk = await original<typeof FirestoreSdk>();
  return { ...sdk, onSnapshot: vi.fn(sdk.onSnapshot) };
});
const client = vi.hoisted(() => ({ app: undefined as FirebaseApp | undefined, uid: 'alice' }));
vi.mock('../../src/lib/firebase', () => ({ app: () => client.app!, auth: () => ({ currentUser: { uid: client.uid } }), functions: () => ({}) }));
vi.mock('firebase/auth', () => ({ onAuthStateChanged: (_auth: unknown, callback: (user: { uid: string }) => void) => {
  callback({ uid: client.uid }); return () => undefined;
} }));
import { subscribeToOwnAwayMissionLifecycles } from '../../src/lib/awayMissionLifecycleService';
import { useSessionStore } from '../../src/store/useSessionStore';
import { sessionFrom } from '../../src/lib/firestore';

const fixture = legacyFailedKProjectionFixture();
let env: RulesTestEnvironment;
beforeAll(async () => {
  const allocated = await allocatedKPrivacyEnvironment();
  env = allocated.environment;
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async context => {
    const database = context.firestore();
    const root = `sessions/${fixture.sessionId}`;
    await setDoc(doc(database, root), { phase: 'active', currentTurn: 2 });
    await setDoc(doc(database, `${root}/players/alice`), { uid: 'alice', role: 'player', connected: true });
    for (const pointer of fixture.pointers) await setDoc(doc(database, `${root}/awayMissionHandPointers/${pointer.handId}`), pointer);
    for (const hand of fixture.hands) await setDoc(doc(database, `${root}/awayMissionHands/${hand.handId}`), hand);
  });
  client.app = initializeApp({ projectId: allocated.projectId, apiKey: 'synthetic-local-key' }, 'pc10-k-default-memory-red');
  // getFirestore supplies the installed SDK's default memory provider. No
  // initializeFirestore/localCache setting or persistence enablement is used.
  connectFirestoreEmulator(getFirestore(client.app), allocated.host, allocated.port, { mockUserToken: { sub: 'alice', user_id: 'alice' } });
});
afterAll(async () => {
  if (client.app) { await terminate(getFirestore(client.app)); await deleteApp(client.app); }
  await env?.cleanup();
});

it('holds the actual production reader before resuming in a page retaining a raw legacy K memory entry', async () => {
  const database = getFirestore(client.app!);
  const historic = await getDocs(query(collection(database, `sessions/${fixture.sessionId}/awayMissionHandPointers`),
    where('sessionId', '==', fixture.sessionId), where('participantUid', '==', 'alice')));
  expect(historic.docs).toHaveLength(1);
  expect(historic.docs[0]!.data().lifecyclePublicState.outcomes[0]).toMatchObject({ difficulty: 30, criticalThreshold: 40, outcome: 'failure' });
  const raw = await getDocFromCache(doc(getFirestore(client.app!), `sessions/${fixture.sessionId}/awayMissionHandPointers/${fixture.pointers[0]!.handId}`));
  expect(getFirestore(client.app!)).toBe(database);
  expect(raw.data()?.lifecyclePublicState.outcomes[0]).toMatchObject({ difficulty: 30, criticalThreshold: 40 });
  await env.withSecurityRulesDisabled(async context => { await updateDoc(doc(context.firestore(), `sessions/${fixture.sessionId}`), {
    awayMissionProjectionSafety: { policyVersion: 1, epoch: 3, state: 'held', writeRevision: 17 },
  }); });
  const session = { ...sessionFrom(fixture.sessionId, { name: 'Synthetic K cache', phase: 'active', currentTurn: 2, playerCount: 8 }),
    awayMissionProjectionSafety: { policyVersion: 1, epoch: 3, state: 'held' as const } };
  useSessionStore.setState({ session, me: { uid: 'alice', sessionId: fixture.sessionId, role: 'player', connected: true,
    displayName: 'Alice', fleetGroupId: 'fleet-1', connectionGeneration: 4 },
  connection: 'live', sessionSnapshotFreshness: 'server', identityHydrationRevision: 1 });
  const states: AwayMissionLifecycleFeedState[] = [];
  const listenerOffset = vi.mocked(onSnapshot).mock.calls.length;
  const stop = subscribeToOwnAwayMissionLifecycles(fixture.sessionId, 'alice', state => states.push(state));
  try {
    if (vi.mocked(onSnapshot).mock.calls.length > listenerOffset) {
      // If current code constructs the listener, validate the real successful
      // owner query/hand read before crediting its missing barrier as RED.
      await vi.waitFor(() => expect(states.at(-1)?.status).toBe('ready'));
      expect(states.at(-1)?.missions[0]?.publicState.outcomes?.[0]).toMatchObject({ difficulty: null, criticalThreshold: null });
    }
    expect(vi.mocked(onSnapshot).mock.calls.slice(listenerOffset)).toEqual([]);
  } finally { stop(); useSessionStore.setState({ session: null, me: null }); }
});
