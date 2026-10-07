import assert from 'node:assert/strict';
import test from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { stationNavigationResumeFixture } from './fixtures/pc10-station-navigation-resume-native-fixture.mjs';

// Supplemental discriminating coverage: the accepted SDK first clears its old
// member envelope; only the genuine later feed can restore command authority.
test('accepted station resume waits for its actual delayed member feed inside the original deadline', async () => {
  const f = await stationNavigationResumeFixture({ noFreshMember: true, feedAfterMs: 80 });
  try {
    assert.equal(await f.run(), f.crew);
    assert.equal(f.store.getState().me.connectionGeneration, 3);
    assert.equal(f.store.getState().identityHydrationRevision, 2);
    assert.equal(f.berthMatches(), true); assert.equal(f.sdkRequests.length, 1);
    assert.equal(f.counters.sdkCalls, 0); assert.equal(f.events.eventNames().length, 0);
  } finally { await f.cleanup(); }
});

test('a held resume response with an unfinished body cannot extend the original selection deadline or retain listeners', async () => {
  const f = await stationNavigationResumeFixture({ responseBodyPending: true, shortDeadline: true });
  let settled;
  void f.run().then(() => { settled = { success: true }; }, error => { settled = { error }; });
  try {
    await delay(350);
    assert.ok(settled?.error, 'The original finite deadline must reject even when the observed body never settles.');
    assert.match(settled.error.message, /deadline/i);
    assert.equal(f.events.eventNames().length, 0); assert.equal(f.counters.sdkCalls, 0);
  } finally { await f.cleanup(); }
});
