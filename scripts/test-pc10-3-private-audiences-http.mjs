import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { writeFile } from 'node:fs/promises';
import { createPc07AuthenticatedSession } from './pc07-authenticated-session.mjs';

// PC10.3 Q1/Q2 (#264-#268): normal local Auth tokens, HTTP callables and Firestore
// REST reads under the real rules. Loyalty comes from the facilitator's normal
// assignment and startGame; the split comes from a normal move and
// confirmFleetPartition. Fixture writes are limited to the phase clock (as in
// the PC07 split proof) and a simulated dropped connection before resume.
// This is local emulator evidence, not deployed gameplay. After
// `npm run emulators:configure -- auto`, start
// `node scripts/run-emulator-command.mjs start --only auth,functions,firestore --project demo-pc103-privacy`
// and run this file with VITE_FIREBASE_PROJECT_ID=demo-pc103-privacy and
// PC07_LOCAL_GM_ORIGIN set to the slot's Vite origin (for example http://127.0.0.1:5177).
const require = createRequire(new URL('../functions/package.json', import.meta.url));
const { STAR_CHART_COORDINATES, jumpDistanceBetween } = require('../functions/lib/starChartGraph.js');
const f = await createPc07AuthenticatedSession('PC10.3 private audiences', 14, {
  keepAlive: true,
  explicitLoyaltySetup: {
    wolfAgentRoleId: 'refinery-124-pdf-colonel',
    wolfCultRoleId: 'shepherd-captain',
    intelligenceAgentRoleId: 'quellon-explorer',
  },
});
const { db, session, sessionId, gm, instanceId, call, ok } = f;
const wolf = f.byLoyalty('wolfAgent');
const cult = f.byLoyalty('wolfCult');
const agent = f.byLoyalty('intelligenceAgent');
const wing = f.byRole('wing-commander');
const iceCrew = f.byRole('icebreaker-miner');
const checks = {};
const PRIVATE_KINDS = ['wolf-agent', 'wolf-cult', 'intelligence-agent'];
const NOTE = `PC10.3 private census note ${randomUUID()}`;

async function actor() {
  const response = await fetch(`http://127.0.0.1:${f.config.authPort}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=${f.project}`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ returnSecureToken: true }) });
  assert.equal(response.status, 200);
  return response.json();
}
async function rest(reader, path) {
  const response = await fetch(`http://127.0.0.1:${f.config.firestorePort}/v1/projects/${f.project}/databases/(default)/documents/sessions/${sessionId}${path}`,
    { headers: { Authorization: `Bearer ${reader.idToken}` } });
  return { status: response.status, text: await response.text() };
}
async function readable(reader, path, message) {
  const result = await rest(reader, path);
  assert.equal(result.status, 200, message);
  return result.text;
}
async function hidden(reader, path, message) {
  assert.equal((await rest(reader, path)).status, 403, message);
}
async function command(caller, name, data = {}) {
  let reply = await call(caller, name, { sessionId, ...data });
  for (let retry = 0; reply.status === 429 && retry < 12; retry++) {
    await new Promise(resolve => setTimeout(resolve, 5000));
    reply = await call(caller, name, { sessionId, ...data });
  }
  const result = ok(reply, name);
  assert.notEqual(result?.status, 'stale', `${name} returned stale authority`);
  return result;
}
async function refused(caller, name, data) {
  const reply = await call(caller, name, { sessionId, ...data });
  assert.notEqual(reply.status, 200, `${name} must be refused`);
  return reply.error;
}
function omits(text, values, message) {
  for (const value of values) assert.ok(!text.includes(value), `${message}: ${value}`);
}
function fieldKeys(text) { return Object.keys(JSON.parse(text).fields ?? {}); }
// A dropped network connection: the presence expiry is simulated by fixture
// (as in the PC07 member-history proof); recovery uses the normal resume
// callable. An explicit Disconnect is a station departure and is not used here.
async function dropConnection(member) {
  await db.doc(`sessions/${sessionId}/players/${member.localId}`).update({ connected: false });
}
async function revision() { return (await db.doc(`sessions/${sessionId}/serverState/navigation`).get()).get('revision'); }
async function group(member) { return (await db.doc(`sessions/${sessionId}/players/${member.localId}`).get()).get('fleetGroupId'); }

try {
  const outsider = await actor();
  const loyalist = f.byRole('admiral');
  const truth = async member => (await db.doc(`sessions/${sessionId}/secrets/loyalty-${member.localId}`).get()).get('payload.kind');
  assert.equal(await truth(wolf), 'wolf-agent');
  assert.equal(await truth(cult), 'wolf-cult');
  assert.equal(await truth(loyalist), 'fleet-loyalist');

  // Q1.1: after the normal start, each holder reads only its own loyalty card.
  for (const [holder, kind] of [[wolf, 'wolf-agent'], [cult, 'wolf-cult'], [agent, 'intelligence-agent'], [loyalist, 'fleet-loyalist']]) {
    assert.ok((await readable(holder, `/secrets/loyalty-${holder.localId}`, 'holder reads its own card')).includes(kind));
  }
  for (const reader of [loyalist, cult, agent, gm, outsider]) {
    await hidden(reader, `/secrets/loyalty-${wolf.localId}`, 'a foreign card is denied');
  }
  for (const member of [wolf, loyalist]) {
    const projection = JSON.stringify(await command(member, 'getCurrentMemberSession'));
    omits(projection, [...PRIVATE_KINDS, 'suspicion'], 'member projection hides loyalty');
  }
  const events = await readable(loyalist, '/events?pageSize=300', 'members read shared events');
  omits(events, PRIVATE_KINDS, 'shared events hide loyalty kinds');
  checks.loyaltyOwnCardOnlyAfterStart = true;

  // Q1.2: the Wolf roster stays with the current facilitator, also after reconnect.
  assert.ok((await readable(gm, '/secrets/wolf-assignment', 'GM reads the Wolf roster')).includes('refinery-124-pdf-colonel'));
  for (const reader of [wolf, cult, agent, loyalist, outsider]) await hidden(reader, '/secrets/wolf-assignment', 'Wolf roster denied');
  await dropConnection(wolf);
  await hidden(wolf, `/secrets/loyalty-${wolf.localId}`, 'a disconnected holder cannot read its card');
  const resumed = JSON.stringify(await command(wolf, 'resumeSession'));
  omits(resumed, PRIVATE_KINDS, 'resume reply hides loyalty');
  assert.ok((await readable(wolf, `/secrets/loyalty-${wolf.localId}`, 'resumed holder reads its card')).includes('wolf-agent'));
  await hidden(wolf, '/secrets/wolf-assignment', 'resumed Wolf still denied the roster');
  const wolfTarget = await refused(loyalist, 'assignLoyalty', { instanceId, requestId: randomUUID(), targetUid: wolf.localId, kind: 'fleet-loyalist', suspicion: 0 });
  const loyalTarget = await refused(loyalist, 'assignLoyalty', { instanceId, requestId: randomUUID(), targetUid: cult.localId, kind: 'fleet-loyalist', suspicion: 0 });
  assert.deepEqual(wolfTarget, loyalTarget, 'a refused caller learns nothing about the target');
  omits(JSON.stringify(wolfTarget), PRIVATE_KINDS, 'refusal hides loyalty');
  checks.wolfRosterGmOnlyAcrossReconnectAndErrors = true;

  // Q1.3: a facilitator census note is GM-only and recoverable by its owner.
  const censusRevision = (await db.doc(`sessions/${sessionId}/loyaltyCensus/current`).get()).get('revision');
  const noteRequest = { instanceId, requestId: randomUUID(), expectedRevision: censusRevision, targetUid: wolf.localId, note: NOTE };
  const saved = await command(gm, 'setFacilitatorCensusNote', noteRequest);
  assert.deepEqual(await command(gm, 'setFacilitatorCensusNote', noteRequest), saved, 'exact replay returns the same receipt');
  assert.ok((await readable(gm, '/loyaltyCensus/current', 'GM recovers the note')).includes(NOTE));
  for (const reader of [wolf, loyalist, outsider]) {
    await hidden(reader, '/loyaltyCensus/current', 'census denied');
    await hidden(reader, '/loyaltyCensus/current/audit', 'census audit denied');
  }
  const foreignReplay = await refused(loyalist, 'setFacilitatorCensusNote', noteRequest);
  omits(JSON.stringify(foreignReplay), [NOTE], 'refused replay hides the note');
  omits(JSON.stringify(await command(loyalist, 'getCurrentMemberSession')), [NOTE], 'member projection hides the note');
  omits(await readable(loyalist, '/events?pageSize=300', 'events'), [NOTE], 'shared events hide the note');
  checks.censusNoteGmOnlyRecoverableAndReplaySafe = true;

  // Q2.1: organiser chart is the facilitator's; the player chart omits it.
  const ORGANISER_KEYS = ['organiserSites', 'organiserSystemHistory', 'pursuitGroups', 'pursuitDistances', 'shipFleetGroupIds', 'candidatePlanCheckpoint'];
  assert.ok(fieldKeys(await readable(gm, '/gmDiscovery/current', 'GM reads the organiser chart')).includes('organiserSites'));
  for (const reader of [wing, wolf, outsider]) await hidden(reader, '/gmDiscovery/current', 'organiser chart denied');
  for (const reader of [wing, gm]) await hidden(reader, '/serverState/navigation', 'navigation authority denied');
  const ownChart = fieldKeys(await readable(wing, `/playerDiscoveries/${wing.localId}`, 'player reads own chart'));
  for (const key of ORGANISER_KEYS) assert.ok(!ownChart.includes(key), `player chart omits ${key}`);
  await hidden(wolf, `/playerDiscoveries/${wing.localId}`, 'a foreign player chart is denied');
  const memberKeys = Object.keys((await command(wing, 'getCurrentMemberSession')).session);
  for (const key of ORGANISER_KEYS) assert.ok(!memberKeys.includes(key), `member projection omits ${key}`);
  checks.organiserChartGmOnly = true;

  // Q2.2: a normal split keeps each group's navigation facts inside it, across reconnect.
  const clock = (await session.get()).get('turnPhase');
  await session.update({ turnPhase: { ...clock, teamPhaseEndsAt: new Date(Date.now() - 1000).toISOString(),
    openAirspaceEndsAt: new Date(Date.now() + 600000).toISOString() } });
  await command(wing, 'beginOpenAirspacePhase', { expectedTurn: 1 });
  const origin = (await db.doc(`sessions/${sessionId}/serverState/navigation`).get()).get('shipGalacticCoordinates').icebreaker;
  const nearby = STAR_CHART_COORDINATES.find(coordinate => coordinate !== origin && jumpDistanceBetween(origin, coordinate) === 1);
  const moveRevision = (await session.get()).get('vesselActionRevisions')?.icebreaker ?? 0;
  await command(gm, 'moveShipToLocation', { instanceId, requestId: randomUUID(), shipId: 'icebreaker', destination: nearby, expectedRevision: moveRevision });
  await command(gm, 'confirmFleetPartition', { instanceId, requestId: randomUUID(), expectedNavigationRevision: await revision() });
  const ownGroup = await group(wing), otherGroup = await group(iceCrew);
  assert.notEqual(ownGroup, otherGroup);
  const later = STAR_CHART_COORDINATES.find(coordinate => coordinate !== origin && coordinate !== nearby &&
    jumpDistanceBetween(nearby, coordinate) === 1 && jumpDistanceBetween(origin, coordinate) > 1);
  assert.ok(later, 'the printed chart supplies a further system');
  await command(gm, 'moveShipToLocation', { instanceId, requestId: randomUUID(), shipId: 'icebreaker', destination: later,
    expectedRevision: (await session.get()).get('vesselActionRevisions')?.icebreaker ?? 0 });
  assert.ok((await readable(iceCrew, `/playerDiscoveries/${iceCrew.localId}`, 'foreign group reads its own chart')).includes(later),
    'the moved group learns its own position');
  const assertGroupPrivate = async (label) => {
    const own = JSON.parse(await readable(wing, `/playerDiscoveries/${wing.localId}`, `${label}: own chart`)).fields;
    const vessels = (own.fleetGroupVesselIds?.arrayValue?.values ?? []).map(value => value.stringValue);
    assert.ok(vessels.length > 0 && !vessels.includes('icebreaker'), `${label}: own chart lists only own-group vessels`);
    // The departure the AEGIS witnessed before the split stays in its log (a
    // jump is announced at the table); the foreign group's later move does not.
    assert.ok(!Object.hasOwn(own, 'shipGalacticCoordinates'), `${label}: own chart has no fleet position map`);
    assert.ok(!JSON.stringify(own).includes(later), `${label}: own chart omits the foreign group's later position`);
    await hidden(wing, `/playerDiscoveries/${iceCrew.localId}`, `${label}: foreign chart denied`);
    await hidden(wing, `/fleetGroups/${otherGroup}`, `${label}: foreign group denied`);
    await hidden(wing, '', `${label}: raw session root denied`);
    const member = (await command(wing, 'getCurrentMemberSession')).session;
    assert.ok(!Object.hasOwn(member.shipResources, 'icebreaker'), `${label}: member projection omits foreign resources`);
  };
  await assertGroupPrivate('after split');
  await dropConnection(wing);
  await hidden(wing, `/playerDiscoveries/${wing.localId}`, 'disconnected player cannot read its chart');
  await command(wing, 'resumeSession');
  await assertGroupPrivate('after reconnect');
  checks.splitGroupFactsPrivateAcrossReconnect = true;

  assert.deepEqual(f.heartbeatFailures, []);
  const evidence = { kind: 'local-emulator-normal-auth-http-and-rules', prompt: 629, issues: [264, 265, 266, 267, 268],
    checks, players: 14, fixtureChanges: ['phase clock advanced to open airspace before the normal split, as in the PC07 split proof',
      'connected=false simulates an expired network connection; recovery uses the normal resume callable'],
    productionGameplay: false, identitiesRetained: false, completedAt: new Date().toISOString() };
  if (process.env.PC10_3_PRIVATE_AUDIENCES_EVIDENCE_PATH) {
    await writeFile(process.env.PC10_3_PRIVATE_AUDIENCES_EVIDENCE_PATH, JSON.stringify(evidence, null, 2) + '\n');
  }
  console.log(JSON.stringify(evidence, null, 2));
} finally {
  await f.cleanup();
}
