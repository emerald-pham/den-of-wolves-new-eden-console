import assert from 'node:assert/strict';
import test from 'node:test';
import { projectionFixture } from './fixtures/pc10-member-projection-native-fixture.mjs';

test('actual current fleet-group map produces only an envelope witness; exact normal resume drops that property', async () => {
  const f = projectionFixture();
  assert.equal(f.sourceRoleHasShip('wing-commander'), true);
  const current = await f.readProjection();
  assert.equal(Object.hasOwn(current, 'currentActorBerthAuthority'), true);
  assert.equal(current.currentActorBerthAuthority.activeConsoleRoleId, null);
  assert.equal(Object.hasOwn(current.session, 'currentActorBerthAuthority'), false);
  const reply = await f.resumeSessionOnly();
  assert.equal(Object.hasOwn(reply.session, 'currentActorBerthAuthority'), false);
  assert.equal(f.store.getState().identityHydrationRevision, 1);
  assert.equal(f.store.getState().connection, 'live');
  assert.equal(f.store.getState().sessionSnapshotFreshness, 'server');
  assert.equal(f.atomicReadCount, 2); assert.equal(f.sourceReadPaths.length, 12);
  assert.equal(f.counters.sdkCalls, 0);
});

test('proposed fresh core selection waits for its source-required witness before pinning or clicking normal manager entry', async () => {
  const f = projectionFixture({ onReturned: async (value, { kind, index }) => {
    if (kind === 'rich' && index === 1) {
      assert.equal(value.uiChoices.length, 0);
      await value.receiveMemberProjection();
    }
  } });
  await f.resumeSessionOnly(); await f.run();
  assert.equal(f.callbackRows.find(row => row.kind === 'rich').value.currentMemberBerthPresent, false);
  assert.equal(f.callbackRows.filter(row => row.kind === 'rich').at(-1).value.currentMemberBerthPresent, true);
  assert.deepEqual(f.uiChoices, ["Enter this actor's stations", 'original-role-chooser']);
  assert.equal(f.counters.sourcePresence, 1); assert.equal(f.counters.sdkCalls, 0);
  assert.ok(f.callbackRows.filter(row => row.kind === 'rich').every(row =>
    row.value.connectionGeneration === 3 && row.value.identityHydrationRevision === 1));
});

test('proposed fresh core missing current projection expires in the supplied deadline before any station control', async () => {
  const f = projectionFixture({ publishAfterClaim: false }); await f.resumeSessionOnly();
  await assert.rejects(f.run({ deadlineAt: Date.now() + 100 }), /deadline|Deadline/);
  assert.deepEqual(f.uiChoices, []); assert.equal(f.counters.sourcePresence, 0); assert.equal(f.counters.sdkCalls, 0);
});

test('true current-group map absence stays property absence through actual read and legacy normal station navigation', async () => {
  const f = projectionFixture({ legacy: true, freshDemo: false });
  const reply = await f.resumeSessionOnly(), current = await f.receiveMemberProjection();
  assert.equal(Object.hasOwn(current, 'currentActorBerthAuthority'), false);
  assert.equal(Object.hasOwn(reply.session, 'currentActorBerthAuthority'), false);
  await f.run();
  assert.deepEqual(f.uiChoices, ["Enter this actor's stations", 'original-role-chooser']);
  assert.equal(Object.hasOwn(f.store.getState().session, 'currentActorBerthAuthority'), false);
  assert.equal(f.counters.sdkCalls, 0);
});

test('a genuinely absent accepted legacy map cannot silently become present during original navigation', async () => {
  const f = projectionFixture({ legacy: true, freshDemo: false, onReturned: async (value, { kind, index }) => {
    if (kind === 'rich' && index === 1) { value.legacy = false; await value.receiveMemberProjection(); }
  } });
  await f.resumeSessionOnly();
  await assert.rejects(f.run(), /Original current member berth witness applicability changed/);
  assert.deepEqual(f.uiChoices, []); assert.equal(f.counters.sdkCalls, 0);
});

for (const [field, change] of [
  ['UID', current => ({ me: { ...current.me, uid: 'private-foreign-member' } })],
  ['session ID', current => ({ session: { ...current.session, id: 'foreign-session' } })],
  ['member session ID', current => ({ me: { ...current.me, sessionId: 'foreign-session' } })],
  ['fleet group', current => ({ me: { ...current.me, fleetGroupId: 'fleet-2' } })],
  ['assigned station', current => ({ me: { ...current.me, assignedRoleId: 'executive-officer' } })],
  ['generation', current => ({ me: { ...current.me, connectionGeneration: 4 } })],
  ['document hydration', () => ({ identityHydrationRevision: 2 })],
]) test(`pre-pin projection waiting cannot adopt a changed original ${field}`, async () => {
  const f = projectionFixture({ onReturned: (value, { kind, index }) => {
    if (kind === 'rich' && index === 1) value.store.setState(change(value.store.getState()));
  } });
  await f.resumeSessionOnly(); await assert.rejects(f.run(), /changed|Original|original|sameActor|true|foreign-session/);
  assert.deepEqual(f.uiChoices, []); assert.equal(f.counters.sdkCalls, 0);
});

test('Press current source null berth does not invent a ship or primary assignment requirement', async () => {
  const f = projectionFixture({ actorRoleId: 'press-officer', released: false });
  await f.resumeSessionOnly(); const current = await f.receiveMemberProjection();
  assert.equal(current.currentActorBerthAuthority, null); f.setHeldRoute(); await f.run();
  assert.deepEqual(f.uiChoices, []); assert.equal(f.store.getState().me.assignedRoleId, null);
  assert.equal(f.store.getState().me.seatId, null); assert.equal(f.counters.sdkCalls, 0);
});

test('fresh original account read needs no station witness or station entry credit', async () => {
  const f = projectionFixture(); await f.resumeSessionOnly(); await f.run({ enter: false });
  assert.deepEqual(f.uiChoices, []); assert.equal(f.counters.sourcePresence, 0); assert.equal(f.counters.sdkCalls, 0);
  assert.equal(Object.hasOwn(f.store.getState().session, 'currentActorBerthAuthority'), false);
});

for (const actorRoleId of ['joint-engineering-quellon-refinery', 'joint-engineering-shepherd-icebreaker']) {
  test(`fresh actual ${actorRoleId} source does not establish an assigned-core ship map`, async () => {
    const f = projectionFixture({ actorRoleId, legacy: true, released: false });
    assert.equal(f.sourceRoleHasShip(actorRoleId), false);
    await f.resumeSessionOnly(); await f.receiveMemberProjection(); f.setHeldRoute(); await f.run();
    assert.equal(Object.hasOwn(f.store.getState().session, 'currentActorBerthAuthority'), false);
    assert.deepEqual(f.uiChoices, []); assert.equal(f.counters.sdkCalls, 0);
  });
}

test('a sparse roster cannot manufacture an absent original core account before projection waiting', async () => {
  const f = projectionFixture(); await f.resumeSessionOnly();
  // The actual public adapter remains responsible for its unchanged admitted
  // roster check. A source projection never creates or replaces an account.
  const { createTwoBrowserGameplay } = await import('./pc10-two-browser-gameplay.mjs');
  const adapter = createTwoBrowserGameplay({ gm: {}, crew: f.crew,
    initial: { sessionId: f.store.getState().session.id, joinCode: 'NATIVE' },
    started: { fullGameDemo: { status: 'active', progression: 'manual' } },
    roster: [{ roleId: 'shepherd-scientist', uidHash: 'unselected-native-actor' }], directory: '/native-no-files' });
  await assert.rejects(adapter.select('wing-commander'), /genuinely admitted account/);
  assert.deepEqual(f.uiChoices, []); assert.equal(f.counters.sdkCalls, 0);
});

for (const roleId of ['press-officer', 'joint-engineering-union', 'comms-officer', 'warrior-captain',
  'invented-captain', 'wing-commander-suffix']) {
  test(`actual normal-init source catalog does not infer a primary core ship from ${roleId}`, () => {
    const f = projectionFixture(); assert.equal(f.sourceRoleHasShip(roleId), false);
    assert.deepEqual(f.uiChoices, []); assert.equal(f.counters.sdkCalls, 0);
  });
}
