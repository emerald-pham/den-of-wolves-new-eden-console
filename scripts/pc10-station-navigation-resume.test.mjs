import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';
import { stationNavigationResumeFixture } from './fixtures/pc10-station-navigation-resume-native-fixture.mjs';

test('ordinary Icebreaker station entry binds one actual accepted resume and fresh original member before returning', async () => {
  const f = await stationNavigationResumeFixture();
  try {
    assert.equal(await f.run(), f.crew);
    assert.deepEqual(f.sdkRequests, ['resumeSession']); assert.equal(f.application.length, 1);
    assert.equal(f.store.getState().me.connectionGeneration, 3); assert.equal(f.store.getState().identityHydrationRevision, 2);
    assert.deepEqual(f.uiChoices, ["Enter this actor's stations", 'original-role-chooser']);
    assert.equal(f.counters.sdkCalls, 0, 'Selection adds no gameplay callable or forced resume.');
    assert.equal(f.events.eventNames().length, 0, 'Own listeners removed after success.');
    const files = await readdir(join(f.directory, 'member-navigation'));
    assert.equal(files.length, 1);
    const packet = JSON.parse(await readFile(join(f.directory, 'member-navigation', files[0]), 'utf8'));
    assert.equal(packet.transitions.length, 1); assert.equal(packet.transitions[0].status, 'accepted-normal-resume-bound');
    assert.equal(JSON.stringify(packet).includes('private-native-'), false);
  } finally { await f.cleanup(); }
});

for (const [label, options] of [
  ['generation and hydration without a real resume', { unwitnessed: true }],
  ['response lacking its original request event', { hideRequest: true }],
  ['request lacking its actual response', { hideResponse: true }],
  ['foreign request session', { requestSession: 'foreign-session' }],
  ['denied response', { httpStatus: 403 }],
  ['error envelope', { responseError: true }],
  ['foreign reply UID', { mutateReply: reply => { reply.player.uid = 'foreign-uid'; }, forgeAfterRejected: true }],
  ['foreign reply group', { mutateReply: reply => { reply.player.fleetGroupId = 'fleet-2'; } }],
  ['released reply assignment', { mutateReply: reply => { reply.player.assignedRoleId = null; } }],
  ['SDK rejected apply despite numerical state change', { rejectApply: true, forgeAfterRejected: true, shortDeadline: true }],
  ['newer unfinished client resume', { pendingNewerResume: true, shortDeadline: true }],
  ['later lease instead of captured accepted reply', { mutateAfter: f => {
    const current = f.store.getState(); f.store.setState({ me: { ...current.me, connectionGeneration: current.me.connectionGeneration + 1 } }); } }],
  ['hydration advanced twice', { mutateAfter: f => f.store.setState({ identityHydrationRevision: 3 }) }],
  ['missing fresh original member witness', { noFreshMember: true, shortDeadline: true }],
]) test(`station entry rejects ${label} without reaching gameplay`, async () => {
  const f = await stationNavigationResumeFixture(options);
  try {
    await assert.rejects(f.run()); assert.equal(f.counters.sdkCalls, 0);
    assert.equal(f.events.eventNames().length, 0, 'Own listeners removed on rejection.');
  } finally { await f.cleanup(); }
});
