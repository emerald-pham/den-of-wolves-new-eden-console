import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { projectionFixture } from './fixtures/pc10-member-projection-native-fixture.mjs';
import { createTwoBrowserGameplay } from './pc10-two-browser-gameplay.mjs';
import { originalProofError } from './pc10-proof-failure-evidence.mjs';

// Actual transaction reader, resume Source, feed parser, public selection and
// serialized observer. Inert transports; no actual Auth/browser/SDK/gameplay.
async function fixture({ mode = 'preparing', actorRoleId = 'dione-engineer', legacy = false,
  publishFirst = true, held = false, seatId, publishAfterClaim = true, mutate, publishAt } = {}) {
  let richCount = 0;
  const f = projectionFixture({ actorRoleId, legacy, freshDemo: false,
    released: !held, publishAfterClaim, onReturned: async (value, row) => {
      if (row.kind !== 'rich' || !Object.hasOwn(row.value, 'currentMemberBerthPresent')) return;
      richCount++;
      if (richCount === 1 && publishFirst) { assert.equal(value.uiChoices.length, 0); await value.receiveMemberProjection(); }
      if (mutate && richCount === 1) await mutate(value);
      await publishAt?.(value, richCount);
    } });
  await f.resumeSessionOnly();
  if (seatId !== undefined || Object.hasOwn(arguments[0] ?? {}, 'seatId'))
    f.store.setState({ me: { ...f.store.getState().me, seatId } });
  if (held) { f.setHeldRoute(); await f.receiveMemberProjection(); }
  if (legacy) await f.receiveMemberProjection();
  const state = f.store.getState();
  f.store.setState({ session: { ...state.session, phase: mode === 'active' ? 'active' : 'casting',
    currentTurn: mode === 'active' ? 1 : 0 } });
  const marker = { status: mode === 'active' ? 'active' : 'preparing', progression: 'manual' };
  const context = { gm: {}, crew: f.crew, initial: { sessionId: state.session.id, joinCode: 'NATIVE' },
    roster: [{ roleId: actorRoleId, uidHash: createHash('sha256').update(state.me.uid).digest('hex').slice(0, 16) }],
    ...(mode === 'preparing' ? { prepared: { fullGameDemo: marker, phase: 'casting', cycle: 0 } } : {}),
    ...(mode === 'active' ? { started: { fullGameDemo: marker, phase: 'active', cycle: 1 } } : {}),
    directory: '/native-no-output' };
  const a = createTwoBrowserGameplay(context);
  f.run = options => a.select(actorRoleId, { deadlineAt: Date.now() + 1500, ...options });
  f.adapter = a;
  f.rows = () => f.callbackRows.filter(row => Object.hasOwn(row.value, 'currentMemberBerthPresent'));
  return f;
}
test('bridge: active manual core selection already waits for the actual member envelope before navigation', async () => {
  const f = await fixture({ mode: 'active' }); await f.run();
  assert.equal(f.rows()[0].value.currentMemberBerthPresent, false);
  assert.equal(f.rows()[1].value.currentMemberBerthPresent, true);
  assert.equal(f.counters.sdkCalls, 0); assert.equal(f.counters.sourcePresence, 1);
});
test('bridge: a confirmed legacy map stays absent through normal navigation', async () => {
  const f = await fixture({ mode: 'legacy', legacy: true, publishFirst: false }); await f.run();
  assert.ok(f.rows().every(row => row.value.currentMemberBerthPresent === false)); assert.equal(f.counters.sdkCalls, 0);
});
test('preparing Cycle0 core waits for its member envelope instead of binding the resume omission as legacy authority', async () => {
  const f = await fixture(); await f.run();
  assert.equal(f.rows()[0].value.currentMemberBerthPresent, false);
  assert.equal(f.rows()[1].value.currentMemberBerthPresent, true);
  assert.equal(f.rows()[1].value.currentMemberBerthMatches, true);
  assert.deepEqual(f.uiChoices, ["Enter this actor's stations", 'original-role-chooser']);
  assert.ok(f.rows().every(row => row.value.connectionGeneration === 3 && row.value.identityHydrationRevision === 1));
  assert.equal(f.counters.sourcePresence, 1); assert.equal(f.counters.sdkCalls, 0);
});
test('preparing core without a current envelope expires before any station click in the supplied deadline', async () => {
  const f = await fixture({ publishFirst: false, publishAfterClaim: false });
  await assert.rejects(f.run({ deadlineAt: Date.now() + 80 }), /deadline|Deadline/); assert.deepEqual(f.uiChoices, []);
});
test('preparing station entry permits the normal active-console witness refresh without rebinding the member', async () => {
  const f = await fixture(); await f.run();
  const rows = f.rows().map(row => row.value);
  assert.ok(rows.some(row => row.activeConsoleRoleId === null)); assert.equal(rows.at(-1).activeConsoleRoleId, 'dione-engineer');
  assert.ok(rows.every(row => row.connectionGeneration === rows[0].connectionGeneration));
});
test('a present witness matching the old console cannot release the new station until normal refreshed authority arrives', async () => {
  const f = await fixture({ publishAfterClaim: false });
  await assert.rejects(f.run({ deadlineAt: Date.now() + 100 }), /deadline|Deadline|applicability/);
});
test('an assigned account with no seat or console may be read without acquiring station authority', async () => {
  const f = await fixture({ publishFirst: false, seatId: null }); await f.run({ enter: false });
  assert.deepEqual(f.uiChoices, []); assert.equal(f.counters.sourcePresence, 0);
});
for (const seatId of [null, 'foreign-seat', undefined]) {
  test('a held core console cannot hide an inconsistent canonical seat pointer: ' + String(seatId), async () => {
    const f = await fixture({ held: true, seatId }); await assert.rejects(f.run()); assert.equal(f.counters.sdkCalls, 0);
  });
}
test('preparing Press uses its normally confirmed null berth and null core seat', async () => {
  const f = await fixture({ actorRoleId: 'press-officer', held: true }); await f.run();
  assert.equal(f.rows().at(-1).value.currentMemberBerthMatches, false);
  assert.equal(f.rows().at(-1).value.currentPressMemberMatches, true);
  assert.equal(f.rows().at(-1).value.seatId, null); assert.deepEqual(f.uiChoices, []);
});
for (const [name, mutation] of [
  ['UID', f => ({ me: { ...f.store.getState().me, uid: 'private-foreign-member' } })],
  ['session', f => ({ session: { ...f.store.getState().session, id: 'foreign-session' } })],
  ['member session', f => ({ me: { ...f.store.getState().me, sessionId: 'foreign-session' } })],
  ['assignment', f => ({ me: { ...f.store.getState().me, assignedRoleId: 'executive-officer' } })],
  ['fleet group', f => ({ me: { ...f.store.getState().me, fleetGroupId: 'fleet-2' } })],
  ['generation', f => ({ me: { ...f.store.getState().me, connectionGeneration: 4 } })],
  ['hydration', () => ({ identityHydrationRevision: 2 })],
]) test('preparing admission waiting cannot adopt a changed original ' + name, async () => {
  const f = await fixture({ mutate: value => value.store.setState(mutation(value)) }); await assert.rejects(f.run());
  assert.deepEqual(f.uiChoices, []); assert.equal(f.counters.sdkCalls, 0);
});
test('foreign berth ownership never gains a station through an unchanged own member label', async () => {
  const f = await fixture({ mutate: value => {
    const s = value.store.getState(); value.store.setState({ session: { ...s.session,
      currentActorBerthAuthority: { ...s.session.currentActorBerthAuthority, actorUid: 'private-foreign-member' } } });
  } });
  await assert.rejects(f.run({ deadlineAt: Date.now() + 80 })); assert.deepEqual(f.uiChoices, []);
});
test('a new authority guard failure retains the complete consumed original/current tuple and original stack', async () => {
  const f = await fixture({ held: true, seatId: null }); let error;
  await assert.rejects(f.run(), e => { error = e; return true; });
  const record = originalProofError(error); assert.match(record.stack, /acceptedMember/);
  for (const field of ['current', 'original', 'actor', 'deadlineAt', 'connectionGeneration', 'identityHydrationRevision',
    'currentMemberBerthPresent', 'currentMemberBerthMatches', 'seatId', 'held', 'requireCurrentBerth'])
    assert.match(record.heldObservationsInspect, new RegExp(field));
  assert.match(record.heldObservationsInspect, /seatId: null/); assert.equal(f.counters.sdkCalls, 0);
});
