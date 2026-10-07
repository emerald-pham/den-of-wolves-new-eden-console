import assert from 'node:assert/strict';
import test from 'node:test';
import { stationNavigationResumeFixture } from './fixtures/pc10-station-navigation-resume-native-fixture.mjs';

// Base22's captured real claimSeat200 changed only active console and canonical
// seat, keeping original Auth/document/member group/assignment/lease/hydration.
for (const skipResume of [true, false]) test(`normal assigned canonical seat claim remains legal ${skipResume ? 'at the same lease' : 'before a verified accepted resume'}`, async () => {
  const f = await stationNavigationResumeFixture({ initialSeatNull: true, skipResume });
  try {
    assert.equal(f.store.getState().me.seatId, null);
    assert.equal(await f.run(), f.crew);
    assert.equal(f.seatClaims.length, 1); assert.equal(f.seatClaims[0].payload.seatId, 'icebreaker-captain');
    assert.equal(f.store.getState().me.seatId, 'icebreaker-captain');
    assert.equal(f.store.getState().me.connectionGeneration, skipResume ? 2 : 3);
    assert.equal(f.store.getState().identityHydrationRevision, skipResume ? 1 : 2);
    assert.equal(f.sdkRequests.length, skipResume ? 0 : 1); assert.equal(f.berthMatches(), true);
    assert.equal(f.counters.sdkCalls, 0); assert.equal(f.events.eventNames().length, 0);
  } finally { await f.cleanup(); }
});

test('a foreign seat pointer after normal station entry cannot grant held canonical console authority', async () => {
  const f = await stationNavigationResumeFixture({ initialSeatNull: true, skipResume: true, foreignSeat: true });
  try {
    await assert.rejects(f.run(), /seat|canonical/i);
    assert.equal(f.seatClaims.length, 1); assert.equal(f.counters.sdkCalls, 0);
    assert.equal(f.events.eventNames().length, 0);
  } finally { await f.cleanup(); }
});
