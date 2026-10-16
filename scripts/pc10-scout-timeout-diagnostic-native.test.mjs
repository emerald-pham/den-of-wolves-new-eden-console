import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { createSpecialistGameplayDriver, validateScoutRequestRecord } from './pc10-specialist-gameplay.mjs';

const hash = value => createHash('sha256').update(String(value)).digest('hex');
const diagnosticName = 'specialist-scout-timeout-diagnostic.json';
const sourceSession = 'native-original-scout-session';
const sourceRequest = 'native-original-scout-request';
const sourceCoordinate = '1413';

// Native-only values follow the current requestScout reply, state adapter and
// exact Scout notice sources. No browser, SDK, session or gameplay is created.
function fixture({ inspectReady = false, endpoint = 'requestScout', inspectError,
  lastLive = true, saveError } = {}) {
  const request = { sessionId: sourceSession, requestId: sourceRequest,
    entitlementId: 'starlight', targetCoordinate: sourceCoordinate };
  const result = { status: 'requested', resolution: 'pending', requestId: sourceRequest,
    sessionId: sourceSession, cycle: 1, entitlementId: 'starlight', source: 'craft',
    ownerRoleId: 'wing-commander', anchorShipId: 'aegis', receivingShipId: 'aegis',
    targetCoordinate: sourceCoordinate };
  const actor = { sameActor: true, sessionId: sourceSession, uidHash: hash('native-original-holder').slice(0, 16),
    profileRoleId: 'wing-commander', activeConsoleRoleId: 'wing-commander',
    playerRole: 'player', assignedRoleId: 'wing-commander', connection: 'live', freshness: 'server' };
  const before = { sessionId: sourceSession, cycle: 1, phase: 'active', live: true,
    turnPhase: { turn: 1, airspace: { state: 'lifted' } }, activeVesselIds: ['aegis'],
    shuttleDockings: [{ shuttleId: 'starlight', shipId: 'aegis' }],
    privateReport: 'never-retain-private-report', secretFieldName: 'never-retain-private-value' };
  const choice = { entitlementId: 'starlight', ownerRoleId: 'wing-commander', targetCoordinate: sourceCoordinate };
  const record = validateScoutRequestRecord({ request, result, actor, choice, before, gmState: before, crewState: before });
  assert.ok(record, 'Qualify the native request/reply/state operands through the original exact Scout validator.');
  const counts = { select: 0, observer: 0, click: 0, replay: 0, state: 0, actor: 0, inspect: 0, wait: 0 };
  let now = 0;
  const writes = [];
  const gm = { label: 'native-gm' };
  const surface = { observe: async () => { counts.actor++; return actor; },
    page: { waitForResponse: predicate => {
      counts.observer++;
      const response = { url: () => `http://native.invalid/project/us-central1/${endpoint}`,
        request: () => ({ method: () => 'POST', postDataJSON: () => ({ data: request }) }),
        ok: () => true, status: () => 200, json: async () => ({ result }) };
      assert.equal(predicate(response), true); return Promise.resolve(response);
    } }, callable: async (name, replayRequest) => {
      counts.replay++; assert.equal(name, endpoint); assert.deepEqual(replayRequest, request);
      return { status: 'committed', result: { ...result, status: 'replayed' } };
    } };
  const game = { context: { gm, initial: { sessionId: sourceSession } },
    actions: [], select: async () => { counts.select++; return surface; },
    state: async () => { counts.state++; return { ...before, live: now === 60_000 ? lastLive : true }; },
    save: async (name, details) => { if (saveError && name === diagnosticName) throw saveError; writes.push({ name, details }); } };
  const driver = createSpecialistGameplayDriver(game, { now: () => now,
    wait: async milliseconds => { assert.equal(milliseconds, 250); counts.wait++; now += milliseconds; } });
  const run = () => driver.capture({ roleId: 'wing-commander', endpoint,
    click: async () => { counts.click++; },
    inspect: async ({ request: heldRequest, result: heldResult, replay, gmState, crewState }) => {
      counts.inspect++; if (inspectError) throw inspectError;
      assert.equal(heldRequest, request); assert.equal(heldResult, result);
      assert.deepEqual(replay, { ...result, status: 'replayed' });
      if (inspectReady) return { ready: true, scoutRequest: record, renderedStatusCode: 'scout-request-recorded-visible' };
      return { ready: false, scoutInspection: { before, choice,
        sourceRequestRecordQualified: true, renderedStatusQualified: false,
        renderedStatusNodeCount: 1, boundary: 'rendered-status',
        gmState, crewState, request: heldRequest, result: heldResult, replay,
        privateText: 'never-retain-inspection-private-text' } };
    } });
  return { run, counts, writes, game, actor, before, request, result };
}

test('current Source request, replay shape and exact confirmation fixture are qualified before timeout diagnostics', async () => {
  const f = fixture();
  const [server, controls, capybara] = await Promise.all([
    readFile(new URL('../functions/src/index.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/ScoutRequestControls.tsx', import.meta.url), 'utf8'),
    readFile(new URL('./pc10-capybara-full-gameplay.mjs', import.meta.url), 'utf8'),
  ]);
  assert.ok(server.includes('const reply: ScoutRequestReply = {'));
  for (const field of Object.keys(f.result)) assert.match(server.slice(server.indexOf('const reply: ScoutRequestReply = {'),
    server.indexOf('tx.create(requestRef, {', server.indexOf('const reply: ScoutRequestReply = {'))), new RegExp(`\\b${field}\\b`));
  const notice = 'Request recorded. Your private scouting report will arrive automatically.';
  assert.ok(controls.includes(notice)); assert.ok(capybara.includes(notice));
});

test('a genuine unchanged Scout convergence timeout retains one private-safe receipt diagnostic without new reads or retries', async () => {
  const f = fixture();
  await assert.rejects(f.run(), /Fresh specialist projections and a rendered result did not converge:/);
  const writes = f.writes.filter(row => row.name === diagnosticName);
  assert.equal(writes.length, 1, 'The original timeout must retain its held Scout receipt and last existing predicate result.');
  const { details } = writes[0];
  assert.equal(details.status, 'failed'); assert.equal(details.acceptance, 'not-claimed');
  const diagnostic = details.scoutTimeout;
  assert.equal(diagnostic.schema, 'pc10-scout-convergence-timeout-v1');
  assert.equal(diagnostic.timeoutMs, 60_000); assert.equal(diagnostic.intervalMs, 250);
  assert.equal(diagnostic.receipt.exactReplay, true);
  assert.equal(diagnostic.receipt.request.sessionIdHash, hash(sourceSession));
  assert.equal(diagnostic.receipt.request.requestIdHash, hash(sourceRequest));
  assert.equal(diagnostic.receipt.request.targetCoordinateHash, hash(sourceCoordinate));
  assert.equal(diagnostic.receipt.result.status, 'requested');
  assert.equal(diagnostic.receipt.replay.status, 'replayed');
  assert.equal(diagnostic.inspection.sourceRequestRecordQualified, true);
  assert.equal(diagnostic.inspection.renderedStatusQualified, false);
  assert.equal(diagnostic.inspection.renderedStatusNodeCount, 1);
  assert.equal(diagnostic.source.before.phase, 'active');
  assert.equal(diagnostic.source.before.airspace, 'lifted');
  assert.deepEqual(diagnostic.source.before.dockings, [{ shuttleId: 'starlight', shipId: 'aegis' }]);
  assert.equal(diagnostic.actor.uidHash, f.actor.uidHash);
  for (const value of [sourceSession, sourceRequest, sourceCoordinate, 'never-retain-private-report',
    'never-retain-private-value', 'never-retain-inspection-private-text']) assert.equal(JSON.stringify(details).includes(value), false);
  assert.deepEqual(f.counts, { select: 1, observer: 1, click: 1, replay: 1, state: 482,
    actor: 243, inspect: 241, wait: 240 });
  assert.equal(f.game.actions.length, 0, 'A retained diagnostic cannot create action or stage credit.');
});

test('a final existing live guard withdrawal marks inspect inapplicable instead of reusing earlier paint', async () => {
  const f = fixture({ lastLive: false });
  await assert.rejects(f.run(), /did not converge/);
  const writes = f.writes.filter(row => row.name === diagnosticName);
  assert.equal(writes.length, 1, 'The original failed live guard needs the same single timeout writer.');
  const diagnostic = writes[0].details.scoutTimeout;
  assert.equal(diagnostic.inspection.applicable, false);
  assert.equal(diagnostic.source.gm.live, false); assert.equal(diagnostic.source.crew.live, false);
  assert.equal(f.counts.inspect, 240); assert.equal(f.counts.state, 482);
});

test('a successful original Scout receipt writes no timeout diagnostic and keeps revision-less request-only evidence', async () => {
  const f = fixture({ inspectReady: true });
  const result = await f.run();
  assert.equal(f.writes.some(row => row.name === diagnosticName), false);
  assert.equal(result.evidence.response.revision, null);
  assert.equal(result.evidence.response.replayRevision, null);
  assert.equal(result.evidence.response.projectionRevision, null);
  assert.equal(result.evidence.projection.renderedStatus, 'scout-request-recorded-visible');
  assert.equal(Object.hasOwn(result.evidence.projection, 'privateActorStatus'), false);
  assert.deepEqual(f.counts, { select: 1, observer: 1, click: 1, replay: 1, state: 2,
    actor: 3, inspect: 1, wait: 0 });
});

test('an original inspect exception remains the primary error and creates no timeout diagnostic', async () => {
  const primary = new Error('original-native-inspect-failure');
  const f = fixture({ inspectError: primary });
  await assert.rejects(f.run(), error => error === primary);
  assert.equal(f.writes.length, 0); assert.equal(f.counts.inspect, 1); assert.equal(f.counts.wait, 0);
});

test('a non-Scout convergence timeout cannot enter the Scout writer', async () => {
  const f = fixture({ endpoint: 'buildFighter' });
  await assert.rejects(f.run(), /did not converge/);
  assert.equal(f.writes.length, 0); assert.equal(f.counts.replay, 1); assert.equal(f.counts.wait, 240);
});

test('a failed diagnostic write cannot replace the original convergence timeout', async () => {
  const f = fixture({ saveError: new Error('native-diagnostic-disk-failure') });
  await assert.rejects(f.run(), /Fresh specialist projections and a rendered result did not converge:/);
  assert.equal(f.game.actions.length, 0); assert.equal(f.counts.replay, 1);
});
