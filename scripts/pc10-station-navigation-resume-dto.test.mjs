import assert from 'node:assert/strict';
import test from 'node:test';
import { stationNavigationResumeFixture } from './fixtures/pc10-station-navigation-resume-native-fixture.mjs';

// Execute the exact current server reply initializer: it intentionally omits
// connected. Authority comes from the accepted SDK and real current member
// envelope, including the independently confirmed connected own player.
test('the actual server resume DTO without connected can bind only after current own member confirms connection', async () => {
  const f = await stationNavigationResumeFixture({ sourceResumeReply: true });
  try {
    assert.equal(await f.run(), f.crew); assert.equal(f.store.getState().me.connected, true);
    assert.equal(f.store.getState().me.connectionGeneration, 3); assert.equal(f.store.getState().identityHydrationRevision, 2);
    assert.equal(f.berthMatches(), true); assert.equal(f.sdkRequests.length, 1);
    assert.equal(f.counters.sdkCalls, 0); assert.equal(f.events.eventNames().length, 0);
  } finally { await f.cleanup(); }
});

test('an actual resume DTO cannot hide a disconnected current member behind omitted connected', async () => {
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
