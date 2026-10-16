import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { inspect as inspectError } from 'node:util';
import test from 'node:test';
import { createSpecialistGameplayDriver, validateScoutRequestRecord } from './pc10-specialist-gameplay.mjs';

test('the original held Scout before survives a timeout whose existing fresh guard never permits inspection', async () => {
  const sessionId = 'native-scout-held-before-session';
  const request = { sessionId, requestId: 'native-scout-held-before-request', entitlementId: 'starlight', targetCoordinate: '1413' };
  const result = { ...request, status: 'requested', resolution: 'pending', cycle: 1, source: 'craft',
    ownerRoleId: 'wing-commander', anchorShipId: 'aegis', receivingShipId: 'aegis' };
  const actor = { sameActor: true, sessionId, uidHash: '0123456789abcdef', profileRoleId: 'wing-commander',
    activeConsoleRoleId: 'wing-commander', connection: 'live', freshness: 'server' };
  const before = { sessionId, live: true, cycle: 1, phase: 'active',
    turnPhase: { turn: 1, airspace: { state: 'lifted' } }, activeVesselIds: ['aegis'],
    shuttleDockings: [{ shuttleId: 'starlight', shipId: 'aegis' }],
    privateReport: 'native-held-before-private-body-must-not-log' };
  assert.ok(validateScoutRequestRecord({ request, result, actor, before, gmState: before, crewState: before,
    choice: { entitlementId: 'starlight', ownerRoleId: 'wing-commander', targetCoordinate: '1413' } }),
  'The held original operands match the exact current Source validator.');
  let now = 0, reads = 0, inspectionCalls = 0, replays = 0, clicks = 0;
  const writes = [];
  const response = { url: () => 'http://native.invalid/project/us-central1/requestScout',
    request: () => ({ method: () => 'POST', postDataJSON: () => ({ data: request }) }),
    ok: () => true, status: () => 200, json: async () => ({ result }) };
  const surface = { observe: async () => actor,
    page: { waitForResponse: predicate => { assert.equal(predicate(response), true); return Promise.resolve(response); } },
    callable: async (endpoint, replayRequest) => {
      replays++; assert.equal(endpoint, 'requestScout'); assert.deepEqual(replayRequest, request);
      return { status: 'committed', result: { ...result, status: 'replayed' } };
    } };
  const game = { context: { gm: {}, initial: { sessionId } }, actions: [],
    select: async () => surface, state: async () => { reads++; return { ...before, live: false }; },
    save: async (name, details) => writes.push({ name, details }) };
  const inspect = Object.assign(async () => { inspectionCalls++; assert.fail('The original live guard forbids inspection.'); },
    { scoutBefore: before });
  const driver = createSpecialistGameplayDriver(game, { now: () => now,
    wait: async milliseconds => { assert.equal(milliseconds, 250); now += milliseconds; } });
  await assert.rejects(driver.capture({ roleId: 'wing-commander', endpoint: 'requestScout', inspect,
    click: async () => { clicks++; } }), error => {
      assert.match(error.message, /Fresh specialist projections and a rendered result did not converge:/);
      assert.equal(inspectError(error, { depth: 7 }).includes(before.privateReport), false,
        'Ordinary logging of the original error must not expose its held private inputs.');
      return true;
    });
  assert.equal(writes.length, 1);
  assert.equal(writes[0].name, 'specialist-scout-timeout-diagnostic.json');
  const diagnostic = writes[0].details.scoutTimeout;
  assert.equal(diagnostic.source.before.present, true,
    'Retain the already held original before even when the existing guard never invokes inspect.');
  assert.equal(diagnostic.source.before.sessionIdHash, createHash('sha256').update(sessionId).digest('hex'));
  assert.equal(diagnostic.source.before.live, true); assert.equal(diagnostic.source.gm.live, false);
  assert.equal(diagnostic.inspection.applicable, false);
  assert.equal(inspectionCalls, 0); assert.equal(reads, 482); assert.equal(now, 60_000);
  assert.equal(clicks, 1); assert.equal(replays, 1); assert.equal(game.actions.length, 0);
});
