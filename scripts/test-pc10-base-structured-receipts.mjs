import test from 'node:test';
import assert from 'node:assert/strict';
import { captureBaseUiReceipt } from './pc10-base-combat-deduction-contracts.mjs';

const actor = { sessionId: 'native-session', uidHash: 'native-original', profileRoleId: 'executive-officer',
  assignedRoleId: 'executive-officer', activeConsoleRoleId: 'executive-officer', playerRole: 'player',
  phase: 'active', cycle: 1, hasAuth: true, sameActor: true, connection: 'live', freshness: 'server' };
const assignments = [{ actionId: 'one', contactIds: ['a', 'b'] }, { actionId: 'two', contactIds: ['c'] }];

async function capture(changes = {}) {
  const request = { sessionId: actor.sessionId, requestId: 'native-request', expectedTurn: 1,
    expectedRevision: 19, assignments: structuredClone(assignments), ...changes };
  const records = [];
  const response = { status: () => 200, json: async () => ({ result: { status: 'committed', revision: 20 } }),
    request: () => ({ postDataJSON: () => ({ data: request }) }) };
  const surface = { observe: async () => ({ ...actor }), page: { waitForResponse: async () => response } };
  const result = await captureBaseUiReceipt({ surface, endpoint: 'assignWolfRangeTargets', expectedActor: actor,
    expectedRequest: { expectedTurn: 1, expectedRevision: 19, assignments }, decision: async () => undefined,
    record: async row => records.push(row), verifyReplay: false });
  return { result, records };
}

test('separately parsed actual target assignments must match every source value rather than object identity', async () => {
  const result = await capture();
  assert.equal(result.result.revision, 20);
  assert.equal(result.records.length, 1);
});

for (const [name, wrong] of [
  ['action identity', [{ actionId: 'other', contactIds: ['a', 'b'] }, assignments[1]]],
  ['target identity', [{ actionId: 'one', contactIds: ['foreign', 'b'] }, assignments[1]]],
  ['target order', [{ actionId: 'one', contactIds: ['b', 'a'] }, assignments[1]]],
  ['action count', [assignments[0]]],
  ['extra target', [{ actionId: 'one', contactIds: ['a', 'b', 'extra'] }, assignments[1]]],
]) test(`changed ${name} in the captured UI request remains rejected`, async () => {
  await assert.rejects(capture({ assignments: wrong }), /Current source assignments changed/);
});

test('structured target matching preserves scalar revision and cycle fences', async () => {
  await assert.rejects(capture({ expectedRevision: 20 }), /Current source expectedRevision changed/);
  await assert.rejects(capture({ expectedTurn: 2 }), /Current source expectedTurn changed/);
});
