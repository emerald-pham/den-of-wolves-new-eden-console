import assert from 'node:assert/strict';
import test from 'node:test';
import { fixture } from './fixtures/pc10-post-digest-native-fixture.mjs';

test('present null current member witness cannot become legacy absence in a core station selection', async () => {
  const f = fixture(), current = f.store.getState();
  f.store.setState({ session: { ...current.session, currentActorBerthAuthority: null } });
  await assert.rejects(f.select({ deadlineAt: Date.now() + 300 }), /deadline|Deadline/);
  assert.equal(f.counters.sdkCalls, 0); assert.equal(f.counters.navigationCalls, 0);
});

test('accepted original source witness applicability cannot disappear during core station navigation', async () => {
  const f = fixture({ onReturned: (value, { kind, index }) => {
    if (kind === 'rich' && index === 1) {
      const session = { ...value.store.getState().session }; delete session.currentActorBerthAuthority;
      value.store.setState({ session });
    }
  } });
  await assert.rejects(f.select(), /Original.*witness.*changed|Original.*berth.*changed/i);
  assert.equal(f.counters.sdkCalls, 0); assert.equal(f.counters.navigationCalls, 0);
});

test('accepted original legacy applicability cannot silently switch to a current source witness during navigation', async () => {
  const f = fixture({ onReturned: (value, { kind, index }) => {
    if (kind === 'rich' && index === 1) value.publishCurrentWitness();
  } }), session = { ...f.store.getState().session };
  delete session.currentActorBerthAuthority; f.store.setState({ session });
  await assert.rejects(f.select(), /Original.*witness.*changed|Original.*berth.*changed/i);
  assert.equal(f.counters.sdkCalls, 0); assert.equal(f.counters.navigationCalls, 0);
});

test('source-present invalid ship witness grants no station entry before the original deadline', async () => {
  const f = fixture(), current = f.store.getState();
  f.store.setState({ session: { ...current.session,
    currentActorBerthAuthority: { ...current.session.currentActorBerthAuthority, shipId: 'invalid/path' } } });
  assert.equal(f.berthMatches(), false);
  await assert.rejects(f.select({ deadlineAt: Date.now() + 300 }), /deadline|Deadline/);
  assert.equal(f.counters.sdkCalls, 0);
});

test('source-present unexpected witness fields grant no station entry', async () => {
  const f = fixture(), current = f.store.getState();
  f.store.setState({ session: { ...current.session,
    currentActorBerthAuthority: { ...current.session.currentActorBerthAuthority, arbitrarySuccess: true } } });
  await assert.rejects(f.select({ deadlineAt: Date.now() + 300 }), /deadline|Deadline/);
  assert.equal(f.counters.sdkCalls, 0);
});

test('legitimate original Press station uses its actual active console without manufacturing a current ship berth', async () => {
  const f = fixture({ actorRoleId: 'press-officer' }), current = f.store.getState();
  f.store.setState({ session: { ...current.session, currentActorBerthAuthority: null } });
  await f.select();
  assert.equal(f.store.getState().me.assignedRoleId, null); assert.equal(f.store.getState().me.seatId, null);
  assert.equal(f.store.getState().me.activeConsoleRoleId, 'press-officer');
  assert.equal(f.counters.sdkCalls, 0); assert.equal(f.counters.navigationCalls, 0); assert.equal(f.counters.sourcePresence, 0);
});

test('account-read selection retains original identity while a present station witness is not current', async () => {
  const f = fixture({ released: true }); await f.normalClaim();
  assert.equal(f.berthMatches(), false); await f.select({ enter: false });
  assert.equal(f.counters.sdkCalls, 0); assert.equal(f.counters.navigationCalls, 0); assert.equal(f.counters.sourcePresence, 1);
});

test('current member source matcher accepts the exact source wire-safe punctuation contract', async () => {
  const f = fixture(), current = f.store.getState(), shipId = 'source.ship!';
  f.store.setState({ session: { ...current.session,
    memberSessionScope: { groupId: 'fleet-1', vesselIds: [shipId] },
    currentActorBerthAuthority: { ...current.session.currentActorBerthAuthority, shipId } } });
  assert.equal(f.berthMatches(), true); await f.select(); assert.equal(f.counters.sdkCalls, 0);
});
