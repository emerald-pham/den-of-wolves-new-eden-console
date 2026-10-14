import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { runInNewContext } from 'node:vm';

const sourcePath = 'scripts/pc10-starlight-movement-scout-ui-proof.mjs';
const source = readFileSync(sourcePath, 'utf8');
const start = source.indexOf('                  castingCurrent = recovered.accepted; castingAuthority = recovered.authority;');
const end = source.indexOf('\n                  break;', start) + '\n                  break;'.length;
assert.ok(start > 0 && end > start);
const body = source.slice(start, end);
const consume = runInNewContext(`(async ports => {
  const { recovered, createMemberNavigationResumeObserver, memberSurface, directory, memberRoleId,
    deadlineAt, proofProfile, castingDeadlineAt, bounded, markCastingBoundary } = ports;
  let castingCurrent, castingAuthority, navigationStart, navigation;
  while (true) { ${body} }
  return { navigationStart, navigation, castingCurrent };
})`, { assert });

function ports({ fresh = true, checkError, prepareError, finishError } = {}) {
  const events = [], cutoffs = [];
  const accepted = Object.freeze({ phase: 'casting', cycle: 0, assignedRoleId: 'admiral', currentMemberBerthMatches: true });
  const castingDeadlineAt = Date.now() + 10_000;
  const authority = { check: async () => {
    events.push('check');
    if (checkError) throw checkError;
    return { fresh };
  } };
  const navigation = { prepare: async value => {
    assert.equal(value, accepted);
    events.push('prepare');
    await Promise.resolve();
    if (prepareError) throw prepareError;
  }, finish: async () => {
    events.push('finish');
    if (finishError) throw finishError;
  } };
  return { events, cutoffs, accepted, castingDeadlineAt, input: {
    recovered: { accepted, authority }, createMemberNavigationResumeObserver: () => navigation,
    memberSurface: { page: {} }, directory: 'inert-owned-evidence', memberRoleId: 'admiral',
    deadlineAt: castingDeadlineAt + 5000, proofProfile: 'wing-bays', castingDeadlineAt,
    markCastingBoundary: () => undefined,
    bounded: async (_label, operation, cutoff) => {
      cutoffs.push(cutoff);
      assert.equal(cutoff, castingDeadlineAt, 'Every new awaited handoff stays inside the original casting cutoff.');
      return operation();
    },
  } };
}

test('current recovered authority publishes the original binding only after awaited preparation and recheck', async () => {
  const p = ports();
  const result = await consume(p.input);
  assert.equal(result.navigationStart, p.accepted);
  assert.deepEqual(p.events, ['prepare', 'check']);
});

test('current freshness unavailable after preparation closes the observer and denies onward binding', async () => {
  const p = ports({ fresh: false });
  await assert.rejects(consume(p.input), /current freshness/i);
  assert.deepEqual(p.events, ['prepare', 'check', 'finish']);
});

test('real retained guard rejection after preparation is preserved without publishing binding', async () => {
  const original = new Error('Original retained berth authority retired');
  const p = ports({ checkError: original });
  await assert.rejects(consume(p.input), error => error === original);
  assert.deepEqual(p.events, ['prepare', 'check']);
});

test('pending observer cleanup failure remains the original rejection', async () => {
  const original = new Error('Original pending navigation persistence failed');
  const p = ports({ fresh: false, finishError: original });
  await assert.rejects(consume(p.input), error => error === original);
  assert.deepEqual(p.events, ['prepare', 'check', 'finish']);
});

test('preparation failure preserves its original rejection before any new guard check', async () => {
  const original = new Error('Original navigation preparation failed');
  const p = ports({ prepareError: original });
  await assert.rejects(consume(p.input), error => error === original);
  assert.deepEqual(p.events, ['prepare']);
});

console.log(JSON.stringify({ sourcePath, sourceSha256: createHash('sha256').update(source).digest('hex'),
  consumerBodySha256: createHash('sha256').update(body).digest('hex'),
  limit: 'Exact changed caller body with inert external guard, persistence and clock ports. No full App, browser, backend or native proof.' }));
