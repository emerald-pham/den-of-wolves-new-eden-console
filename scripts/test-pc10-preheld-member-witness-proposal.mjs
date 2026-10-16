import assert from 'node:assert/strict';
import test from 'node:test';
import { fixture } from './fixtures/pc10-post-digest-native-fixture.mjs';

// Separate source-fidelity proposal. No station-wait implementation is implied
// by these tests. The source projection is already present in this fixture.
test('current source witness and current held original role agree without another selection action', async () => {
  const f = fixture(); assert.equal(f.berthMatches(), true); await f.select();
  assert.equal(f.counters.sourcePresence, 0); assert.equal(f.counters.sdkCalls, 0);
  assert.equal(f.counters.navigationCalls, 0);
});

test('normal pre-held original role may advance from null to its actual held station after current member witness arrives', async () => {
  const f = fixture({ released: true, beforeUntil: async value => {
    await value.normalClaim(); value.publishCurrentWitness();
  } });
  assert.equal(f.berthMatches(), true); await f.select();
  const reads = f.callbackRows.filter(row => row.kind === 'rich').map(row => row.value);
  assert.equal(reads[0].activeConsoleRoleId, null);
  assert.equal(reads.at(-1).activeConsoleRoleId, 'wing-commander');
  assert.ok(reads.every(row => row.connectionGeneration === 3 && row.identityHydrationRevision === 1));
  assert.equal(f.berthMatches(), true); assert.equal(f.counters.sourcePresence, 1);
  assert.equal(f.counters.sdkCalls, 0); assert.equal(f.counters.navigationCalls, 0);
});

test('proposed pre-held readiness cannot return a local new station before its present original member witness joins it', async () => {
  let finalRead, selected = false;
  const readReturned = new Promise(resolve => { finalRead = resolve; });
  const f = fixture({ released: true, beforeUntil: value => value.normalClaim(),
    onReturned: (_value, { kind, index }) => { if (kind === 'rich' && index === 3) finalRead(); } });
  const operation = f.select({ deadlineAt: Date.now() + 1500 }).then(surface => { selected = true; return surface; });
  try {
    await readReturned; await new Promise(resolve => setImmediate(resolve));
    assert.equal(f.berthMatches(), false);
    assert.equal(selected, false, 'Local presence acceptance plus prior live/server session is not the newly joined station witness.');
  } finally { f.publishCurrentWitness(); await operation; }
  assert.equal(selected, true); assert.equal(f.counters.sourcePresence, 1);
  assert.equal(f.counters.sdkCalls, 0); assert.equal(f.counters.navigationCalls, 0);
});

test('proposed pre-held witness wait cannot obtain a fresh deadline or count an unchanged old station witness', async () => {
  const f = fixture({ released: true }); await f.normalClaim();
  assert.equal(f.berthMatches(), false);
  await assert.rejects(f.select({ deadlineAt: Date.now() + 300 }), /deadline|Deadline/);
  assert.equal(f.counters.sourcePresence, 1); assert.equal(f.counters.sdkCalls, 0); assert.equal(f.counters.navigationCalls, 0);
});

for (const [field, value] of [
  ['actorUid', 'private-native-foreign'], ['sessionId', 'foreign-session'], ['groupId', 'fleet-2'],
  ['role', 'gm'], ['connectionGeneration', 4], ['connectionGeneration', undefined],
  ['assignedRoleId', 'executive-officer'], ['activeConsoleRoleId', null],
  ['activeConsoleRoleId', 'executive-officer'], ['replacementRoleId', 'comms-officer'],
  ['replacementStatus', 'awaiting-re-role'], ['shipId', 'shepherd'],
]) test(`actual App current member matcher refuses witness ${field}=${String(value)}`, () => {
  const f = fixture(), current = f.store.getState();
  f.store.setState({ session: { ...current.session,
    currentActorBerthAuthority: { ...current.session.currentActorBerthAuthority, [field]: value } } });
  assert.equal(f.berthMatches(), false); assert.equal(f.counters.sdkCalls, 0);
});

for (const [name, mutate] of [
  ['null witness', session => ({ ...session, currentActorBerthAuthority: null })],
  ['missing witness', session => { const next = { ...session }; delete next.currentActorBerthAuthority; return next; }],
  ['unexpected witness field', session => ({ ...session,
    currentActorBerthAuthority: { ...session.currentActorBerthAuthority, arbitrarySuccess: true } })],
  ['missing member scope', session => ({ ...session, memberSessionScope: undefined })],
  ['foreign member scope', session => ({ ...session, memberSessionScope: { groupId: 'fleet-2', vesselIds: ['aegis'] } })],
  ['missing entitled vessel', session => ({ ...session, memberSessionScope: { groupId: 'fleet-1', vesselIds: [] } })],
]) test(`actual App current member matcher refuses ${name}`, () => {
  const f = fixture(); f.store.setState({ session: mutate(f.store.getState().session) });
  assert.equal(f.berthMatches(), false); assert.equal(f.counters.sdkCalls, 0);
});

test('legitimate source absence does not invent a universal current-berth witness requirement for legacy selection', async () => {
  // Functions omits the property when the original source has no berth map.
  // A present null witness cannot stand in for that distinct legacy contract.
  const f = fixture(), session = { ...f.store.getState().session };
  delete session.currentActorBerthAuthority; f.store.setState({ session });
  await f.select(); assert.equal(f.counters.sdkCalls, 0); assert.equal(f.counters.navigationCalls, 0);
});
