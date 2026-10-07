import assert from 'node:assert/strict';
import test from 'node:test';
import { stationNavigationResumeFixture } from './fixtures/pc10-station-navigation-resume-native-fixture.mjs';

for (const [name, options] of [
  ['accepted resume before normal canonical claim and presence', { resumeBeforeClaim: true }],
  ['normal canonical claim and presence during acceptance digest yield', { claimDuringAcceptance: true }],
]) test(`station proof follows ${name} with a fresh original member witness`, async () => {
  const f = await stationNavigationResumeFixture({ initialSeatNull: true, sourceResumeReply: true, ...options });
  try {
    assert.equal(await f.run(), f.crew);
    assert.equal(f.seatClaims.length, 1); assert.equal(f.store.getState().me.seatId, 'icebreaker-captain');
    assert.equal(f.store.getState().me.activeConsoleRoleId, 'icebreaker-captain');
    assert.equal(f.berthMatches(), true); assert.equal(f.store.getState().me.connectionGeneration, 3);
    assert.equal(f.store.getState().identityHydrationRevision, 2); assert.equal(f.application.length, 1);
    assert.equal(f.counters.sdkCalls, 0); assert.equal(f.events.eventNames().length, 0);
  } finally { await f.cleanup(); }
});

for (const [name, options] of [
  ['foreign seat following accepted resume', { resumeBeforeClaim: true, foreignSeat: true }],
  ['foreign console following accepted resume', { resumeBeforeClaim: true, mutateAfter: f => {
    const s = f.store.getState(); f.store.setState({ me: { ...s.me, activeConsoleRoleId: 'foreign-console' } }); } }],
  ['stale pre-claim witness during acceptance yield', { claimDuringAcceptance: true, staleAfterAcceptanceClaim: true, shortDeadline: true }],
  ['changed Auth during acceptance yield', { claimDuringAcceptance: true, afterAcceptanceClaim: f => { f.authUid = 'foreign-auth'; } }],
  ['unwitnessed newer generation during acceptance yield', { claimDuringAcceptance: true, afterAcceptanceClaim: f => {
    const s = f.store.getState(); f.store.setState({ me: { ...s.me, connectionGeneration: 4 } }); } }],
  ['unwitnessed newer hydration during acceptance yield', { claimDuringAcceptance: true, afterAcceptanceClaim: f => f.store.setState({ identityHydrationRevision: 3 }) }],
]) test(`phase-aware station proof rejects ${name}`, async () => {
  const f = await stationNavigationResumeFixture({ initialSeatNull: true, sourceResumeReply: true, ...options });
  try { await assert.rejects(f.run()); assert.equal(f.counters.sdkCalls, 0); assert.equal(f.events.eventNames().length, 0); }
  finally { await f.cleanup(); }
});

test('actual client join, GM assignment, station entry, release and restore retain phase-specific member authority', async () => {
  const f = await stationNavigationResumeFixture({ initialSeatNull: true, sourceResumeReply: true, resumeBeforeClaim: true });
  try {
    await f.clientJoin();
    const joined = f.store.getState(); assert.equal(joined.me.assignedRoleId, null); assert.equal(joined.me.seatId, null);
    assert.equal(await f.adapter.select('icebreaker-captain', { enter: false, deadlineAt: Date.now() + 1000 }), f.crew);
    await assert.rejects(f.run(), /assigned/i);
    await f.clientAssignRole(); assert.equal(f.store.getState().me.seatId, null);
    assert.equal(await f.run(), f.crew); const held = f.store.getState();
    assert.equal(held.me.seatId, 'icebreaker-captain'); assert.equal(f.berthMatches(), true);
    await f.clientReleaseRole(); const released = f.store.getState();
    assert.equal(released.me.assignedRoleId, null); assert.equal(released.me.activeConsoleRoleId, null); assert.equal(released.me.seatId, null);
    assert.equal(await f.adapter.select('icebreaker-captain', { enter: false, deadlineAt: Date.now() + 1000 }), f.crew);
    await assert.rejects(f.run(), /assigned/i);
    await f.clientAssignRole(); f.setActorRoute();
    assert.equal(await f.run(), f.crew); const restored = f.store.getState();
    assert.equal(restored.me.uid, joined.me.uid); assert.equal(restored.me.sessionId, joined.me.sessionId);
    assert.equal(restored.me.fleetGroupId, joined.me.fleetGroupId); assert.equal(restored.me.seatId, 'icebreaker-captain');
    assert.equal(restored.me.connectionGeneration, held.me.connectionGeneration + 1);
    assert.equal(restored.identityHydrationRevision, held.identityHydrationRevision + 1); assert.equal(f.berthMatches(), true);
    assert.deepEqual(f.lifecycleCommands.map(row => row.kind), ['assignRole', 'releaseRole', 'assignRole']);
    assert.deepEqual(f.sdkRequests, ['joinSession', 'resumeSession', 'resumeSession']);
    assert.equal(f.seatClaims.length, 2); assert.equal(f.counters.sdkCalls, 0); assert.equal(f.events.eventNames().length, 0);
  } finally { await f.cleanup(); }
});
