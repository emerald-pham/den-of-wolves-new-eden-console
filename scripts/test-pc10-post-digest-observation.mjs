import assert from 'node:assert/strict';
import test from 'node:test';
import { assertOriginalBaseActor } from './pc10-base-combat-deduction-contracts.mjs';
import { choiceBoundary, fixture } from './fixtures/pc10-post-digest-native-fixture.mjs';

test('final rich tuple samples current original member state after UID digest completes', async () => {
  const f = fixture({ onDigest: (value, { kind, index }) => {
    if (kind === 'rich' && index === 2) value.store.setState({ connection: 'offline', sessionSnapshotFreshness: 'cache' });
  } });
  await assert.rejects(f.select({ deadlineAt: Date.now() + 500 }), /deadline|Deadline/);
  assert.equal(f.counters.sdkCalls, 0); assert.equal(f.counters.navigationCalls, 0);
});

test('generic tuple samples current original member state after UID digest completes', async () => {
  const f = fixture({ onDigest: (value, { kind }) => {
    if (kind === 'generic') value.store.setState({ connection: 'live', sessionSnapshotFreshness: 'server' });
  } });
  f.store.setState({ connection: 'offline', sessionSnapshotFreshness: 'cache' });
  const observed = await f.crew.observe();
  assert.equal(observed.connection, 'live'); assert.equal(observed.freshness, 'server');
  assert.equal(f.counters.sdkCalls, 0);
});

for (const [name, mutate] of [
  ['foreign Auth UID', f => { f.authUid = 'private-native-foreign'; }],
  ['foreign Auth and matching foreign member', f => {
    f.authUid = 'private-native-foreign'; f.store.setState({ me: { ...f.store.getState().me, uid: f.authUid } });
  }],
  ['missing Auth UID', f => { f.authUid = null; }],
]) {
  test(`rich tuple cannot retain original hash under ${name} during final digest`, async () => {
    const f = fixture({ onDigest: (value, { kind, index }) => { if (kind === 'rich' && index === 2) mutate(value); } });
    await assert.rejects(f.select(), /Original Auth UID changed/);
    assert.equal(f.counters.sdkCalls, 0); assert.equal(f.counters.navigationCalls, 0);
  });
  test(`generic tuple cannot retain original hash under ${name} during digest`, async () => {
    const f = fixture({ onDigest: (value, { kind }) => { if (kind === 'generic') mutate(value); } });
    await assert.rejects(f.crew.observe(), /Original Auth UID changed/);
    assert.equal(f.counters.sdkCalls, 0);
  });
}

for (const [name, mutate] of [
  ['missing member UID', f => f.store.setState({ me: { ...f.store.getState().me, uid: undefined } })],
  ['missing member', f => f.store.setState({ me: undefined })],
  ['foreign member UID', f => f.store.setState({ me: { ...f.store.getState().me, uid: 'private-native-foreign' } })],
  ['missing session', f => f.store.setState({ session: undefined })],
  ['missing SID', f => f.store.setState({ session: { ...f.store.getState().session, id: undefined } })],
  ['foreign SID', f => f.store.setState({ session: { ...f.store.getState().session, id: 'foreign-session' } })],
  ['foreign member SID', f => f.store.setState({ me: { ...f.store.getState().me, sessionId: 'foreign-session' } })],
  ['missing member generation', f => f.store.setState({ me: { ...f.store.getState().me, connectionGeneration: undefined } })],
  ['new member generation', f => f.store.setState({ me: { ...f.store.getState().me, connectionGeneration: 4 } })],
  ['missing document hydration', f => f.store.setState({ identityHydrationRevision: undefined })],
  ['new document hydration', f => f.store.setState({ identityHydrationRevision: 2 })],
  ['foreign fleet group', f => f.store.setState({ me: { ...f.store.getState().me, fleetGroupId: 'fleet-2' } })],
]) test(`rich tuple cannot hide ${name} after its final digest`, async () => {
  const f = fixture({ onDigest: (value, { kind, index }) => { if (kind === 'rich' && index === 2) mutate(value); } });
  await assert.rejects(f.select());
  assert.equal(f.counters.sdkCalls, 0); assert.equal(f.counters.navigationCalls, 0);
});

for (const [name, mutate] of [
  ['missing member UID', f => f.store.setState({ me: { ...f.store.getState().me, uid: undefined } })],
  ['missing member', f => f.store.setState({ me: undefined })],
  ['foreign member UID', f => f.store.setState({ me: { ...f.store.getState().me, uid: 'private-native-foreign' } })],
  ['missing session', f => f.store.setState({ session: undefined })],
  ['missing SID', f => f.store.setState({ session: { ...f.store.getState().session, id: undefined } })],
  ['foreign SID', f => f.store.setState({ session: { ...f.store.getState().session, id: 'foreign-session' } })],
  ['foreign primary role', f => f.store.setState({ me: { ...f.store.getState().me, assignedRoleId: 'executive-officer' } })],
  ['foreign active role', f => f.store.setState({ me: { ...f.store.getState().me, activeConsoleRoleId: 'executive-officer' } })],
]) test(`generic tuple exposes ${name} after digest to the unchanged strict Base guard`, async () => {
  const f = fixture({ onDigest: (value, { kind, index }) => { if (kind === 'generic' && index === 2) mutate(value); } });
  const original = await f.crew.observe();
  const observed = await f.crew.observe();
  assert.throws(() => assertOriginalBaseActor(observed, original));
  assert.equal(f.counters.sdkCalls, 0);
});

test('stable original live/server selection still reaches ordinary Wing choice through actual Base', async () => {
  const f = fixture(); await assert.rejects(f.runBase(), error => error === choiceBoundary);
  assert.equal(f.store.getState().me.connectionGeneration, 3); assert.equal(f.store.getState().identityHydrationRevision, 1);
  assert.equal(f.counters.richReads, 2); assert.equal(f.counters.sdkCalls, 0); assert.equal(f.counters.navigationCalls, 0);
});

test('generic initial unauthenticated observation retains missing evidence and grants no actor readiness', async () => {
  const f = fixture(); f.authUid = null;
  const observed = await f.crew.observe();
  assert.equal(observed.hasAuth, false); assert.equal(observed.sameActor, false); assert.equal(observed.uidHash, null);
  assert.throws(() => assertOriginalBaseActor(observed, observed)); assert.equal(f.counters.sdkCalls, 0);
});

test('unchanged Base loss assertion still rejects genuine post-selection member freshness withdrawal', async () => {
  const f = fixture({ afterSelected: value => value.store.setState({ connection: 'offline', sessionSnapshotFreshness: 'cache' }) });
  await assert.rejects(f.runBase(), error => error.code === 'ERR_ASSERTION' && error.actual === 'offline' && error.expected === 'live');
  assert.equal(f.counters.choiceControlOpened, undefined); assert.equal(f.counters.sdkCalls, 0);
});
