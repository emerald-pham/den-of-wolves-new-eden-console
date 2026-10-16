import assert from 'node:assert/strict';
import test from 'node:test';
import { stationNavigationResumeFixture } from './fixtures/pc10-station-navigation-resume-native-fixture.mjs';

// Execute the exact current server reply initializer: connected is copied from
// the post-commit player read. The separate current member envelope is still
// required before this station path accepts authority.
test('the actual server resume DTO carries post-commit connection and still needs the current member envelope', async () => {
  const f = await stationNavigationResumeFixture({ sourceResumeReply: true });
  try {
    assert.equal(await f.run(), f.crew); assert.equal(f.store.getState().me.connected, true);
    assert.equal(f.store.getState().me.connectionGeneration, 3); assert.equal(f.store.getState().identityHydrationRevision, 2);
    assert.equal(f.berthMatches(), true); assert.equal(f.sdkRequests.length, 1);
    assert.equal(f.counters.sdkCalls, 0); assert.equal(f.events.eventNames().length, 0);
  } finally { await f.cleanup(); }
});

test('an actual connected resume DTO cannot hide a later disconnected current member', async () => {
  const f = await stationNavigationResumeFixture({ sourceResumeReply: true, disconnectedMemberFeed: true, shortDeadline: true });
  try { await assert.rejects(f.run()); assert.equal(f.counters.sdkCalls, 0); }
  finally { await f.cleanup(); }
});

test('an explicit disconnected resume reply remains ineligible despite later connected source projection', async () => {
  const f = await stationNavigationResumeFixture({ sourceResumeReply: true,
    mutateReply: reply => { reply.player.connected = false; } });
  try { await assert.rejects(f.run()); assert.equal(f.counters.sdkCalls, 0); }
  finally { await f.cleanup(); }
});
