import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { stationNavigationResumeFixture } from './fixtures/pc10-station-navigation-resume-native-fixture.mjs';

// Retained diagnostic-a1: the same Quellon document loses server authority at
// generation4/hydration1 before its own automatic retry. Exercise the actual
// public selection, App retry predicate, SDK resume/finally, feed and acceptance.
// This does not qualify runtime/gameplay or accept the unmatched intermediate.
const options = { roleId: 'quellon-engineer', initialGeneration: 3, initialActiveRole: true, sourceResumeReply: true,
  unmatchedLeaseBeforeRetry: true, deferResumeResponse: true };
async function packet(f) {
  const files = await readdir(join(f.directory, 'member-navigation'));
  assert.equal(files.length, 1);
  return JSON.parse(await readFile(join(f.directory, 'member-navigation', files[0]), 'utf8'));
}
async function exercise(extra = {}) {
  const f = await stationNavigationResumeFixture({ ...options, ...extra });
  let result, error;
  const running = f.run().then(value => { result = value; }, value => { error = value; });
  try {
    const invalidated = await f.earlyGenerationObserved();
    assert.equal(invalidated.connectionGeneration, 3 + (extra.externalGenerationDelta ?? 1)); assert.equal(invalidated.identityHydrationRevision, 1);
    assert.equal(invalidated.connection, 'offline'); assert.equal(invalidated.freshness, 'cache');
    assert.equal(f.application.length, 0, 'The unmatched listener epoch is not SDK hydration.');
    f.releaseResumeResponse(); await f.finishPendingResume(); await running;
    const saved = await packet(f);
    return { result, error, saved, f };
  } finally {
    f.releaseResumeResponse(); f.releaseResumeApplication(); await running; await f.cleanup();
  }
}

test('same-document selection holds the unmatched listener epoch until the App retry binds its exact new lease and hydration', async () => {
  const { result, error, saved, f } = await exercise();
  assert.equal(error, undefined);
  assert.equal(result, f.crew);
  assert.deepEqual(f.sdkRequests, ['resumeSession'], 'Only the existing App retry requests resume.');
  assert.equal(f.application.length, 1);
  assert.equal(f.application[0].beforeGeneration, 4); assert.equal(f.application[0].replyGeneration, 5);
  assert.equal(saved.transitions.length, 1);
  assert.equal(saved.transitions[0].current.connectionGeneration, 5);
  assert.equal(saved.transitions[0].current.identityHydrationRevision, 2);
  assert.equal(saved.transitions[0].clientAcceptance.hasServerAuthority, true);
  assert.equal(saved.transitions[0].clientAcceptance.resumePending, false);
  assert.equal(f.events.eventNames().length, 0);
});

for (const [label, extra] of [
  ['no App retry', { noAutomaticRetry: true, shortDeadline: true }],
  ['failed retry', { failResumeRequest: true, shortDeadline: true }],
  ['wrong reply actor', { mutateReply: reply => { reply.player.uid = 'foreign-native-actor'; }, shortDeadline: true }],
  ['wrong reply generation', { mutateReply: reply => { reply.player.connectionGeneration += 1; }, shortDeadline: true }],
  ['unexpected listener generation', { externalGenerationDelta: 2, noAutomaticRetry: true, shortDeadline: true }],
  ['changed listener seat', { mutateListener: f => f.store.setState({ me: { ...f.store.getState().me, seatId: 'foreign-seat' } }), noAutomaticRetry: true, shortDeadline: true }],
]) test(`the invalidated listener epoch grants no authority with ${label}`, async () => {
  const { error, saved } = await exercise(extra);
  assert.ok(error); assert.equal(saved.transitions.length, 0); assert.equal(saved.status, 'failed');
});

test('an App retry response arriving after the original selection deadline cannot release authority', async () => {
  const f = await stationNavigationResumeFixture({ ...options, shortDeadline: true });
  let error;
  const running = f.run().catch(value => { error = value; });
  try {
    await f.earlyGenerationObserved();
    await running;
    assert.ok(error);
    assert.equal((await packet(f)).transitions.length, 0);
    f.releaseResumeResponse(); await f.finishPendingResume();
    assert.equal((await packet(f)).transitions.length, 0, 'A late normal response cannot reopen the closed observer.');
    assert.equal(f.events.eventNames().length, 0);
  } finally { f.releaseResumeResponse(); await f.finishPendingResume(); await f.cleanup(); }
});
