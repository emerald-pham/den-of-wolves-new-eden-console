import test from 'node:test';
import assert from 'node:assert/strict';
import * as helpers from './pc10-full-game-demo-proof-helpers.mjs';
import { presentationStartFixture } from './fixtures/pc10-presentation-start-native-fixture.mjs';
import { originalProofError } from './pc10-proof-failure-evidence.mjs';

// Actual adapter/transaction/feed/parser/source callbacks with inert Native
// transports. Separate from authenticated Base gameplay and human usability.
const wait = (f, options = {}) => {
  assert.equal(typeof helpers.waitForFullGameDemoPresentationActor, 'function', 'The immediate presentation boundary needs a bounded normal recovery wait.');
  return helpers.waitForFullGameDemoPresentationActor({ surface: f.crew, ...f.actorOptions,
    deadlineAt: Date.now() + 1500, ...options });
};
test('actual public account selection permits original Press with null console, seat and berth; presentation must accept that account', async () => {
  const f = await presentationStartFixture(); await f.account();
  const current = await f.crew.observe(); assert.equal(current.activeConsoleRoleId, null);
  assert.equal(f.store.getState().me.seatId, null); assert.equal(f.store.getState().session.currentActorBerthAuthority, null);
  assert.deepEqual(f.store.getState().session.memberSessionScope.vesselIds, ['aegis'],
    'An unassigned account may receive its own fleet public projection without gaining a ship berth or station.');
  const actor = helpers.captureFullGameDemoPresentationActor(current, f.actorOptions);
  assert.equal(actor.activeConsoleRoleId, null); assert.equal(actor.assignedRoleId, null);
  assert.deepEqual(f.uiChoices, []); assert.deepEqual(f.sdkCalls, []); assert.equal(f.counters.sourcePresence, 0);
});
test('actual Press null-console account becomes presentation-ready without acquiring any station or GM capability', async () => {
  const f = await presentationStartFixture(); await f.account(); const result = await wait(f);
  assert.equal(result.actor.activeConsoleRoleId, null); assert.equal(result.current.currentMemberBerthNull, true);
  assert.equal(result.current.memberVesselCount, 1); assert.equal(result.current.seatId, null);
  assert.deepEqual(f.sdkCalls, []); assert.deepEqual(f.uiChoices, []); assert.equal(f.counters.sourcePresence, 0);
});
test('offline original Press waits for existing App retry, actual source resume acceptance and fresh member feed at the original deadline', async () => {
  const f = await presentationStartFixture({ held: true }); f.setOffline(); let retry = false;
  const deadlineAt = Date.now() + 1500;
  const result = await wait(f, { deadlineAt, onSample: async () => { if (!retry) { retry = true; await f.automaticRetry(); } } });
  assert.equal(result.initial.connection, 'offline'); assert.equal(result.current.connection, 'live');
  assert.equal(result.initial.connectionGeneration, 3); assert.equal(result.current.connectionGeneration, 4);
  assert.equal(result.initial.identityHydrationRevision, 1); assert.equal(result.current.identityHydrationRevision, 2);
  assert.equal(result.current.sdkResumePending, false); assert.equal(result.actor.uidHash, f.actorOptions.roster[0].uidHash);
  assert.deepEqual(f.sdkCalls, ['resumeSession']); assert.deepEqual(f.uiChoices, []);
  assert.equal(result.deadlineAt, deadlineAt); assert.equal(result.actor.activeConsoleRoleId, 'press-officer');
  assert.equal(Object.hasOwn(f.resumeReplies[0].player, 'connected'), false, 'The exact server resume DTO does not manufacture own-player confirmation.');
});
test('recovered original Press may have its console withdrawn while retaining legitimate null account authority', async () => {
  const f = await presentationStartFixture({ held: true }); f.resumeConsoleNull = true; f.setOffline(); let retry = false;
  const result = await wait(f, { onSample: async () => { if (!retry) { retry = true; await f.automaticRetry(); } } });
  assert.equal(result.actor.activeConsoleRoleId, null); assert.equal(result.actor.assignedRoleId, null);
  assert.equal(result.current.seatId, null); assert.deepEqual(f.uiChoices, []);
});
test('live flags from a normal resume DTO cannot stand in for the missing own-player/member feed', async () => {
  const f = await presentationStartFixture({ held: true }); f.setOffline(); let retry = false;
  await assert.rejects(wait(f, { deadlineAt: Date.now() + 100, onSample: async () => {
    if (!retry) { retry = true; await f.automaticRetry({ feed: false }); }
  } }), /deadline|Deadline/);
  assert.equal(f.store.getState().connection, 'live'); assert.equal(f.store.getState().me.connected, undefined);
  assert.deepEqual(f.sdkCalls, ['resumeSession']);
});
for (const [name, mutate] of [
  ['permanent offline denial', f => { f.setOffline(); f.rejectResume = true; }],
  ['SDK resume fence', f => f.beginNewerResume()],
  ['server authority revoked', f => f.revokeServerAuthority()],
  ['absent member envelope', f => { const s = { ...f.store.getState().session }; delete s.currentActorBerthAuthority; f.store.setState({ session: s }); }],
  ['own-player confirmation absent', f => f.store.setState({ me: { ...f.store.getState().me, connected: undefined } })],
]) test('Press presentation never treats pending authority as ready: ' + name, async () => {
  const f = await presentationStartFixture(); mutate(f);
  await assert.rejects(wait(f, { deadlineAt: Date.now() + 80 }), /deadline|Deadline/);
  assert.deepEqual(f.sdkCalls, []); assert.deepEqual(f.uiChoices, []);
});
for (const [name, mutate] of [
  ['foreign UID', f => f.store.setState({ me: { ...f.store.getState().me, uid: 'private-foreign-player' } })],
  ['foreign Auth after digest', f => { f.authUid = 'private-foreign-auth'; }],
  ['foreign session', f => f.store.setState({ session: { ...f.store.getState().session, id: 'other-session' } })],
  ['foreign member session', f => f.store.setState({ me: { ...f.store.getState().me, sessionId: 'other-session' } })],
  ['disconnected', f => f.store.setState({ me: { ...f.store.getState().me, connected: false } })],
  ['core assignment', f => f.store.setState({ me: { ...f.store.getState().me, assignedRoleId: 'admiral' } })],
  ['core seat', f => f.store.setState({ me: { ...f.store.getState().me, seatId: 'admiral' } })],
  ['foreign console', f => f.store.setState({ me: { ...f.store.getState().me, activeConsoleRoleId: 'admiral' } })],
  ['foreign fleet scope', f => f.store.setState({ session: { ...f.store.getState().session,
    memberSessionScope: { ...f.store.getState().session.memberSessionScope, groupId: 'fleet-2' } } })],
  ['foreign berth', f => f.store.setState({ session: { ...f.store.getState().session,
    currentActorBerthAuthority: { actorUid: 'private-foreign-player', shipId: 'aegis' } } })],
  ['foreign vessel audience', f => f.store.setState({ session: { ...f.store.getState().session,
    memberSessionScope: { ...f.store.getState().session.memberSessionScope, vesselIds: ['aegis'] } } })],
  ['foreign craft audience', f => f.store.setState({ session: { ...f.store.getState().session,
    memberSessionScope: { ...f.store.getState().session.memberSessionScope, craftIds: ['foreign-craft'] } } })],
  ['replacement', f => f.store.setState({ me: { ...f.store.getState().me, replacementRoleId: 'admiral' } })],
  ['escape', f => f.store.setState({ me: { ...f.store.getState().me, escapeState: { status: 'required' } } })],
  ['disabled Press', f => f.store.setState({ session: { ...f.store.getState().session, pressEnabled: false } })],
]) test('Press presentation preserves current role/privacy rejection: ' + name, async () => {
  const f = await presentationStartFixture({ held: true }); mutate(f); await assert.rejects(wait(f));
  assert.deepEqual(f.sdkCalls, []); assert.deepEqual(f.uiChoices, []);
});
test('post-digest readiness samples a changed identity and never pairs it with the original hash', async () => {
  const f = await presentationStartFixture({ onDigest: f => { f.authUid = 'private-changed-during-digest'; } });
  await assert.rejects(wait(f), /Auth UID changed/); assert.deepEqual(f.sdkCalls, []);
});
test('a rejected source resume cannot release the original SDK fence or promote cached Press authority', async () => {
  const f = await presentationStartFixture(); f.rejectApply = true; f.setOffline(); await f.automaticRetry({ feed: false });
  assert.equal(f.store.getState().connection, 'offline');
  await assert.rejects(wait(f, { deadlineAt: Date.now() + 80 }), /deadline|Deadline/);
  assert.equal(f.authority.hasServerSessionAuthority, true); assert.deepEqual(f.sdkCalls, ['resumeSession']);
});
test('readiness failure retains the consumed Press tuple but no raw member UID, private document or credential', async () => {
  const f = await presentationStartFixture(); f.setOffline(); f.store.setState({ privateLoyalty: { marker: 'PRIVATE_CANARY' },
    roleBrief: { marker: 'PRIVATE_CANARY' }, session: { ...f.store.getState().session, privateData: 'PRIVATE_CANARY' } });
  let error; await assert.rejects(wait(f, { deadlineAt: Date.now() + 80 }), value => { error = value; return true; });
  const record = originalProofError(error), retained = JSON.stringify(record);
  for (const key of ['activeConsoleRoleId', 'seatId', 'currentMemberBerthPresent', 'currentMemberBerthNull',
    'memberVesselCount', 'connectionGeneration', 'identityHydrationRevision', 'sdkResumePending', 'communicationError']) assert.match(retained, new RegExp(key));
  assert.doesNotMatch(retained, /PRIVATE_CANARY|private-native-|private-foreign-|Authorization|Bearer/);
});
test('the supplied deadline also bounds an observer that never returns', async () => {
  const f = await presentationStartFixture(); f.crew.page.evaluate = async () => new Promise(() => {});
  const started = Date.now(); await assert.rejects(wait(f, { deadlineAt: started + 80 }), /deadline|Deadline/);
  assert.ok(Date.now() - started < 600); assert.deepEqual(f.sdkCalls, []);
});
test('a core persona still needs its original assigned and selected console', async () => {
  const f = await presentationStartFixture({ roleId: 'dione-engineer', held: true });
  const ready = await wait(f); assert.equal(ready.actor.activeConsoleRoleId, 'dione-engineer');
  f.store.setState({ me: { ...f.store.getState().me, activeConsoleRoleId: null } }); await assert.rejects(wait(f));
});

// Reconciled independent-review discriminators; actual Source reader/feed and
// callback paths remain in use. Counterexamples are Native, not Base23 cause.
for (const [name, mutate] of [
  ['generation-only', f => f.store.setState({ me: { ...f.store.getState().me, connectionGeneration: 4 } })],
  ['hydration-only', f => f.store.setState({ identityHydrationRevision: 2 })],
]) test('a matching member feed cannot certify an epoch without this document normal accepted resume: ' + name, async () => {
  const f = await presentationStartFixture({ held: true }); f.setOffline(); let changed = false;
  await assert.rejects(wait(f, { onSample: async () => {
    if (!changed) { changed = true; mutate(f); await f.receiveMemberProjection(); }
  } }));
  assert.deepEqual(f.sdkCalls, []);
  assert.equal(f.events.listenerCount('request'), 0); assert.equal(f.events.listenerCount('response'), 0);
});
for (const [name, mutate] of [
  ['Auth', f => { f.authUid = 'private-callback-foreign-auth'; }],
  ['disconnect', f => f.store.setState({ me: { ...f.store.getState().me, connected: false } })],
  ['newer SDK resume', f => f.beginNewerResume()],
  ['lease-only', f => f.store.setState({ me: { ...f.store.getState().me, connectionGeneration: 4 } })],
]) test('async observation callback cannot return the preceding ready tuple after ' + name, async () => {
  const f = await presentationStartFixture({ held: true }); let changed = false;
  await assert.rejects(wait(f, { deadlineAt: Date.now() + 100, onSample: async () => {
    await Promise.resolve(); if (!changed) { changed = true; mutate(f); }
  } }));
  assert.equal(f.events.listenerCount('request'), 0); assert.equal(f.events.listenerCount('response'), 0);
});
for (const [name, mutate] of [
  ['seat object', (f, secret) => f.store.setState({ me: { ...f.store.getState().me, seatId: secret } })],
  ['role object', (f, secret) => f.store.setState({ me: { ...f.store.getState().me, assignedRoleId: secret } })],
  ['lease object', (f, secret) => f.store.setState({ me: { ...f.store.getState().me, connectionGeneration: secret } })],
  ['hydration object', (f, secret) => f.store.setState({ identityHydrationRevision: secret })],
  ['marker status object', (f, secret) => f.store.setState({ session: { ...f.store.getState().session,
    fullGameDemo: { status: secret, progression: 'manual' } } })],
  ['marker progression object', (f, secret) => f.store.setState({ session: { ...f.store.getState().session,
    fullGameDemo: { status: 'preparing', progression: secret } } })],
]) test('complete browser return, samples and failure packet exclude malformed private consumed data: ' + name, async () => {
  const f = await presentationStartFixture({ held: true }); const secret = { privatePayload: 'PRIVATE_CONSUMED_CANARY', uid: 'synthetic-raw-uid' };
  mutate(f, secret); let error;
  await assert.rejects(wait(f), value => { error = value; return true; });
  const packet = JSON.stringify({ rows: f.presentationRows, original: originalProofError(error) });
  assert.doesNotMatch(packet, /PRIVATE_CONSUMED_CANARY|synthetic-raw-uid|private-native-/);
  assert.equal(f.events.listenerCount('request'), 0); assert.equal(f.events.listenerCount('response'), 0);
});
