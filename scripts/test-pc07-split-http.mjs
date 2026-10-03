import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { writeFile } from 'node:fs/promises';
import { createPc07AuthenticatedSession } from './pc07-authenticated-session.mjs';

const evidencePath = process.env.PC07_SPLIT_EVIDENCE_PATH;
assert.ok(evidencePath, 'An external evidence path is required.');
const f = await createPc07AuthenticatedSession('PC07 complete split and exploration', 13, { keepAlive: true });
const { db, session, sessionId, gm, instanceId, call, ok } = f;
const require = createRequire(new URL('../functions/package.json', import.meta.url));
const { STAR_CHART_COORDINATES, jumpDistanceBetween } = require('../functions/lib/starChartGraph.js');
const { SHIP_DAMAGE_DECKS } = require('../functions/lib/shipDamage.js');
const navigationRef = db.doc(`sessions/${sessionId}/serverState/navigation`);
const wing = f.byRole('wing-commander');
const explorer = f.byRole('quellon-explorer');
const iceCrew = f.byRole('icebreaker-miner');
const comms = f.byRole('admiral');
const checks = {};
async function command(actor, name, data) {
  let reply = await call(actor, name, { sessionId, ...data });
  // Keep the production rate limit intact; retry the same immutable command
  // after the one-minute burst window rather than editing its marker.
  for (let retry = 0; reply.status === 429 && retry < 12; retry++) {
    await new Promise(resolve => setTimeout(resolve, 5000));
    reply = await call(actor, name, { sessionId, ...data });
  }
  const result = ok(reply, name);
  assert.notEqual(result?.status, 'stale', `${name} returned stale authority`);
  return result;
}
async function denied(actor, name, data) {
  const response = await call(actor, name, { sessionId, ...data });
  assert.notEqual(response.status, 200, `${name} must deny this request`);
  assert.ok(['FAILED_PRECONDITION', 'PERMISSION_DENIED', 'INVALID_ARGUMENT'].includes(response.error.status));
}
async function group(actor) {
  return (await db.doc(`sessions/${sessionId}/players/${actor.localId}`).get()).get('fleetGroupId');
}
async function revision() { return (await navigationRef.get()).get('revision'); }
async function partition() {
  return command(gm, 'confirmFleetPartition', { instanceId, requestId: randomUUID(), expectedNavigationRevision: await revision() });
}
async function move(shipId, destination) {
  const current = (await session.get()).get('vesselActionRevisions')?.[shipId] ?? 0;
  return command(gm, 'moveShipToLocation', { instanceId, requestId: randomUUID(), shipId, destination, expectedRevision: current });
}
async function member(actor) { return command(actor, 'getCurrentMemberSession', {}); }
async function plot(actor) {
  return command(actor, 'readFleetGroupNavigation', { requestId: randomUUID(), expectedGroupId: await group(actor),
    expectedNavigationRevision: await revision(), expectedFleetPartitionRevision: (await session.get()).get('fleetPartitionRevision') ?? 0 });
}
async function discovery(actor) {
  const response = await fetch(`http://127.0.0.1:${f.config.firestorePort}/v1/projects/${f.project}/databases/(default)/documents/sessions/${sessionId}/playerDiscoveries/${actor.localId}`,
    { headers: { Authorization: `Bearer ${actor.idToken}` } });
  assert.equal(response.status, 200, 'Normal actor can read their own current discovery.');
  const payload = await response.json();
  const decode = value => value.arrayValue ? (value.arrayValue.values ?? []).map(decode)
    : value.mapValue ? Object.fromEntries(Object.entries(value.mapValue.fields ?? {}).map(([key, item]) => [key, decode(item)]))
    : value.stringValue ?? value.integerValue ?? value.booleanValue ?? value.doubleValue ?? value.nullValue;
  return Object.fromEntries(Object.entries(payload.fields).map(([key, value]) => [key, decode(value)]));
}
async function maintain(shipId, shuttleId) {
  const lease = (await db.doc(`sessions/${sessionId}/gmInstances/${instanceId}`).get()).data();
  const claimedAt = typeof lease.claimedAt === 'string' ? lease.claimedAt : lease.claimedAt.toDate().toISOString();
  await command(gm, 'setGmShipConsoleWriteGrant', { instanceId, shipId, enabled: true, claimedAt });
  const bays = SHIP_DAMAGE_DECKS[shipId].filter(card => card.systemId.startsWith('shuttle-bay')).map(card => card.systemId);
  const steps = ['begin', 'storage', 'rations', 'unrest', 'riot', 'reactor', ...Array(shipId === 'aegis' ? 2 : 1).fill('bays'), 'end'];
  const engineer = shipId === 'icebreaker' ? f.byRole('icebreaker-engineer') : gm;
  let cursor = (await session.get()).get('maintenanceCycles')?.[shipId]?.revision ?? 0, bay = 0;
  for (const action of steps) {
    if (action === 'reactor' && (await session.get()).get('shipDamage')?.[shipId]?.damagedSystemIds?.length) {
      await command(gm, 'repairAllShipDamage', { instanceId, shipId, requestId: randomUUID(),
        expectedRevision: (await session.get()).get('vesselActionRevisions')?.[shipId] ?? 0 });
    }
    const result = await command(engineer, 'runMaintenance', { ...(engineer === gm ? { instanceId } : {}), shipId, action, expectedRevision: cursor, requestId: randomUUID(),
      ...(action === 'rations' ? { foodLevel: 1, waterLevel: 1 } : {}),
      ...(action === 'reactor' ? { consoles: ['jump-drive'] } : {}),
      ...(action === 'bays' ? { refuels: shuttleId && bay++ === 0 ? { [shipId === 'aegis' ? 'shuttle-bay-zeta' : bays[0]]: shuttleId } : {} } : {}) });
    cursor = result.cycle.revision;
  }
  if (shuttleId) assert.equal((await session.get()).get('shuttleFuelled')[shuttleId], true);
}
async function taxi(actor, shuttleId, targetShipId, payload) {
  const current = (await session.get()).data();
  return { sessionId, requestId: randomUUID(), shuttleId, targetShipId, expectedCycle: current.currentTurn,
    expectedControlRevision: current.shuttleControl[shuttleId].revision, expectedNavigationRevision: await revision(),
    expectedFleetPartitionRevision: current.fleetPartitionRevision ?? 0, expectedGroupId: await group(actor), payload };
}
try {
  await maintain('aegis', 'starlight');
  await maintain('quellon', 'hummingbird');
  const currentSetup = (await session.get()).get('setupRevision');
  const eligibility = await command(gm, 'setReplacementEligibility', { instanceId, requestId: randomUUID(), targetUid: comms.localId,
    reason: 'removed', expectedRevision: 0, expectedSetupRevision: currentSetup });
  await command(gm, 'assignReplacementRole', { instanceId, requestId: randomUUID(), targetUid: comms.localId,
    replacementRoleId: 'comms-officer', expectedRevision: eligibility.revision, expectedSetupRevision: eligibility.setupRevision });
  await command(comms, 'refreshPresence', { activeConsoleRoleId: null });
  const clock = (await session.get()).get('turnPhase');
  await session.update({ turnPhase: { ...clock, teamPhaseEndsAt: new Date(Date.now() - 1000).toISOString(),
    openAirspaceEndsAt: new Date(Date.now() + 600000).toISOString() } });
  await command(wing, 'beginOpenAirspacePhase', { expectedTurn: 1 });
  const origin = (await navigationRef.get()).get('shipGalacticCoordinates').aegis;
  const nearby = STAR_CHART_COORDINATES.find(coordinate => coordinate !== origin && jumpDistanceBetween(origin, coordinate) === 1);
  const distant = STAR_CHART_COORDINATES.find(coordinate => jumpDistanceBetween(origin, coordinate) > 2);
  assert.ok(nearby && distant, 'The printed chart supplies short and long routes.');
  await move('icebreaker', nearby);
  const splitRequest = { instanceId, requestId: randomUUID(), expectedNavigationRevision: await revision() };
  const split = await command(gm, 'confirmFleetPartition', splitRequest);
  assert.deepEqual(await command(gm, 'confirmFleetPartition', splitRequest), split);
  const ownGroup = await group(wing), otherGroup = await group(iceCrew);
  assert.notEqual(ownGroup, otherGroup);
  const own = await member(wing), other = await member(iceCrew);
  const ownDiscovery = await discovery(wing), otherDiscovery = await discovery(iceCrew);
  assert.ok(!ownDiscovery.fleetGroupVesselIds.includes('icebreaker'));
  assert.ok(otherDiscovery.fleetGroupVesselIds.every(id => id === 'icebreaker'));
  assert.ok(!Object.hasOwn(own.session.shipResources, 'icebreaker'));
  assert.ok(Object.keys(other.session.shipResources).every(id => id === 'icebreaker'));
  assert.ok(own.session.shuttleDockings.every(dock => ownDiscovery.fleetGroupVesselIds.includes(dock.shipId)));
  checks.normalPartialArrivalPartitionReplayAndLocalRoster = true;
  const ownPlot = await plot(wing), otherPlot = await plot(iceCrew);
  assert.ok(ownPlot.ships.every(ship => ship.fleetGroupId === ownGroup && ship.shipId !== 'icebreaker'));
  assert.ok(otherPlot.ships.every(ship => ship.fleetGroupId === otherGroup && ship.shipId === 'icebreaker'));
  await denied(wing, 'readFleetGroupNavigation', { requestId: randomUUID(), expectedGroupId: otherGroup,
    expectedNavigationRevision: await revision(), expectedFleetPartitionRevision: (await session.get()).get('fleetPartitionRevision') });
  await denied(wing, 'requestShuttleDeparture', { requestId: randomUUID(), shuttleId: 'starlight', destinationShipId: 'icebreaker',
    expectedControlRevision: 0, expectedCycle: 1 });
  for (const path of ['', `/fleetGroups/${otherGroup}`, '/serverState/navigation']) {
    const response = await fetch(`http://127.0.0.1:${f.config.firestorePort}/v1/projects/${f.project}/databases/(default)/documents/sessions/${sessionId}${path}`,
      { headers: { Authorization: `Bearer ${wing.idToken}` } });
    assert.equal(response.status, 403);
  }
  checks.currentLocalDradisCrossGroupDockingAndPrivateReads = true;
  const ownNote = { expectedGroupId: ownGroup, requestId: randomUUID(), text: 'LOCAL AEGIS GROUP ONLY' };
  const foreignNote = { expectedGroupId: otherGroup, requestId: randomUUID(), text: 'LOCAL ICEBREAKER GROUP ONLY' };
  await command(wing, 'sendFleetGroupMessage', ownNote);
  await command(iceCrew, 'sendFleetGroupMessage', foreignNote);
  await denied(wing, 'readFleetGroupMessages', { expectedGroupId: otherGroup });
  await denied(wing, 'sendFleetGroupMessage', { ...ownNote, requestId: randomUUID(), expectedGroupId: otherGroup });
  assert.ok(!(await command(explorer, 'readFleetGroupMessages', { expectedGroupId: ownGroup })).messages.some(note => note.id === foreignNote.requestId));
  checks.ordinaryNotesStayInCurrentGroup = true;
  const scoutRequest = { requestId: randomUUID(), entitlementId: 'comms-officer', targetCoordinate: nearby };
  const request = await command(comms, 'requestScout', scoutRequest);
  await command(comms, 'disconnectFromSession', {});
  let resolved;
  for (let i = 0; i < 80; i++) {
    resolved = (await db.doc(`sessions/${sessionId}/scoutResults/${scoutRequest.requestId}`).get()).data();
    if (resolved) break;
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  assert.ok(resolved, 'Legal immutable request obtains an automatic result after disconnect.');
  await command(comms, 'resumeSession', {});
  await command(comms, 'refreshPresence', { activeConsoleRoleId: null });
  assert.equal((await command(comms, 'requestScout', scoutRequest)).status, 'replayed');
  await denied(comms, 'requestScout', { ...scoutRequest, requestId: randomUUID() });
  const reports = await command(comms, 'listMyScoutReports', {});
  assert.ok(JSON.stringify(reports).includes(scoutRequest.requestId));
  const gmLog = await command(gm, 'listGmScoutResolutionLog', { instanceId });
  assert.ok(JSON.stringify(gmLog).includes(scoutRequest.requestId));
  assert.equal(request.source, 'replacement-role');
  checks.normalCommsAutomaticResolutionRecoveryReportAndGmLog = true;
  const shareRequest = { requestId: randomUUID(), expectedGroupId: ownGroup, expectedNavigationRevision: await revision(),
    coordinate: nearby, recipientShipIds: ['quellon'] };
  const share = await command(comms, 'shareKnownSystemDetails', shareRequest);
  assert.deepEqual(await command(comms, 'shareKnownSystemDetails', shareRequest), share);
  await denied(comms, 'shareKnownSystemDetails', { ...shareRequest, requestId: randomUUID(), expectedNavigationRevision: await revision(), recipientShipIds: ['icebreaker'] });
  await denied(comms, 'shareKnownSystemDetails', { ...shareRequest, requestId: randomUUID(), expectedNavigationRevision: await revision(), coordinate: distant });
  const delivered = await discovery(explorer);
  assert.ok(delivered.knownCoordinates.includes(nearby));
  checks.scanFactsShareToSelectedLocalShipOnceAndDenyForeignUnknown = true;
  const passengers = [comms, f.byRole('executive-officer')];
  const playersRequest = await taxi(wing, 'starlight', 'icebreaker', { kind: 'players', playerUids: passengers.map(actor => actor.localId) });
  await denied(wing, 'sendScoutTaxiTransfer', { ...playersRequest, requestId: randomUUID(), payload: { kind: 'players', playerUids: [...playersRequest.payload.playerUids, explorer.localId] } });
  const transferred = await command(wing, 'sendScoutTaxiTransfer', playersRequest);
  assert.equal((await command(wing, 'sendScoutTaxiTransfer', playersRequest)).status, 'replayed');
  for (const actor of passengers) {
    assert.equal(await group(actor), otherGroup);
    const projection = await discovery(actor);
    assert.equal(projection.shipId, 'icebreaker');
  }
  checks.normalTwoPlayerTaxiUpdatesLiveBerthsAndRetry = true;
  const fuelBefore = (await session.get()).get('shipResources');
  const fuelRequest = await taxi(explorer, 'hummingbird', 'icebreaker', { kind: 'fuel', units: 2 });
  const fuel = await command(explorer, 'sendScoutTaxiTransfer', fuelRequest);
  assert.equal((await command(explorer, 'sendScoutTaxiTransfer', fuelRequest)).status, 'replayed');
  const fuelAfter = (await session.get()).get('shipResources');
  assert.equal(fuelAfter.icebreaker.fuel, fuelBefore.icebreaker.fuel + 2);
  assert.equal(fuelAfter.quellon.fuel, fuelBefore.quellon.fuel - 2);
  assert.equal(fuel.units, 2);
  checks.normalTwoFuelTaxiIsAtomicAndReplaySafe = true;
  // A taxi transfer uses its one round trip. Start the next shared cycle before
  // the independent courier trip, retaining all ordinary cadence limits.
  await command(gm, 'advanceTurn', { instanceId, requestId: randomUUID(), expectedTurn: 1, overridePhaseTimer: true });
  const held = (await session.get()).get('turnPhase').timerPause;
  await command(wing, 'clearTurnAdvanceInterstitial', { requestId: randomUUID(), expectedCycle: 2, expectedPausedAt: held.pausedAt });
  await maintain('aegis', 'starlight');
  await maintain('icebreaker');
  const teamOwn = await member(wing), teamOther = await member(iceCrew);
  assert.equal(teamOwn.session.currentTurn, teamOther.session.currentTurn);
  assert.deepEqual(teamOwn.session.turnPhase, teamOther.session.turnPhase);
  await denied(f.byRole('quellon-engineer'), 'runMaintenance', { shipId: 'icebreaker', action: 'begin',
    requestId: randomUUID(), expectedRevision: (await session.get()).get('maintenanceCycles').icebreaker.revision });
  checks.splitTeamsKeepOneCycleAndRejectForeignShipMaintenance = true;
  const team = (await session.get()).get('turnPhase');
  await session.update({ turnPhase: { ...team, teamPhaseEndsAt: new Date(Date.now() - 1000).toISOString(),
    openAirspaceEndsAt: new Date(Date.now() + 600000).toISOString() } });
  await command(wing, 'beginOpenAirspacePhase', { expectedTurn: 2 });
  await move('refinery-124', distant);
  await partition();
  const rangeRequest = await taxi(wing, 'starlight', 'refinery-124', { kind: 'fuel', units: 1 });
  await denied(wing, 'sendScoutTaxiTransfer', rangeRequest);
  checks.outOfRangeTaxiDeniedWithoutTransfer = true;
  const courierRequest = { requestId: randomUUID(), shuttleId: 'starlight', targetShipId: 'icebreaker', text: 'AUTHORIZED TAXI COURIER',
    expectedCycle: 2, expectedControlRevision: (await session.get()).get('shuttleControl').starlight.revision, expectedNavigationRevision: await revision() };
  await command(wing, 'sendScoutTaxiCourier', courierRequest);
  assert.equal((await command(wing, 'sendScoutTaxiCourier', courierRequest)).status, 'replayed');
  assert.ok((await command(iceCrew, 'readFleetGroupMessages', { expectedGroupId: otherGroup })).messages.some(note => note.id === courierRequest.requestId));
  await denied(wing, 'sendScoutTaxiCourier', { ...courierRequest, requestId: randomUUID() });
  checks.authorizedCourierDeliversWithoutOpeningOrdinaryCrossGroupReads = true;
  const jumps = [];
  const lease = (await db.doc(`sessions/${sessionId}/gmInstances/${instanceId}`).get()).data();
  const claimedAt = typeof lease.claimedAt === 'string' ? lease.claimedAt : lease.claimedAt.toDate().toISOString();
  await command(gm, 'setGmShipConsoleWriteGrant', { instanceId, shipId: 'aegis', enabled: true, claimedAt });
  for (const [actor, shipId, destination] of [[gm, 'aegis', nearby], [f.byRole('icebreaker-engineer'), 'icebreaker', origin]]) {
    const request = { shipId, destination, requestId: randomUUID(),
      expectedRevision: (await session.get()).get('vesselActionRevisions')?.[shipId] ?? 0,
      ...(actor === gm ? { instanceId } : {}) };
    const before = (await session.get()).get('shipResources')[shipId].fuel;
    const jumped = await command(actor, 'jumpShip', request);
    assert.equal(jumped.status, 'jumped');
    assert.deepEqual(await command(actor, 'jumpShip', request), jumped);
    assert.equal((await navigationRef.get()).get('shipGalacticCoordinates')[shipId], destination);
    const after = (await session.get()).get('shipResources')[shipId].fuel;
    assert.ok(after < before);
    jumps.push({ shipId, status: jumped.status, fuelSpent: before - after, revision: jumped.revision });
  }
  checks.actualChargedGroupJumpsConsumeSourceFuelAndReplayWithoutSecondJump = true;
  // The facilitator reunites this disposable scenario after proving both real
  // departures; GM relocations are labeled separately from the charged jumps.
  await move('aegis', origin);
  await move('refinery-124', origin);
  const rejoinRequest = { instanceId, requestId: randomUUID(), expectedNavigationRevision: await revision() };
  const rejoined = await command(gm, 'confirmFleetPartition', rejoinRequest);
  assert.deepEqual(await command(gm, 'confirmFleetPartition', rejoinRequest), rejoined);
  const groups = await db.collection(`sessions/${sessionId}/fleetGroups`).get();
  assert.equal(groups.size, 1);
  const joinedGroup = groups.docs[0].get('id');
  assert.equal((await group(wing)), joinedGroup);
  assert.equal((await group(iceCrew)), joinedGroup);
  const history = await command(wing, 'readFleetGroupMessages', { expectedGroupId: joinedGroup });
  for (const id of [ownNote.requestId, foreignNote.requestId, courierRequest.requestId]) assert.ok(history.messages.some(note => note.id === id));
  const audits = await db.collection(`sessions/${sessionId}/fleetGroupRejoinAudits`).get();
  assert.ok(audits.size >= 1);
  for (const audit of audits.docs) for (const rejoin of audit.get('rejoins')) {
    assert.equal(rejoin.pursuitAfter, Math.max(...Object.values(rejoin.pursuitBefore)));
  }
  const restored = await plot(wing);
  assert.equal(restored.ships.length, 6);
  const finalDiscovery = await discovery(comms);
  assert.equal(new Set(finalDiscovery.knownCoordinates).size, finalDiscovery.knownCoordinates.length);
  checks.coLocatedRejoinMergesMembershipNotesAndKnowledgeWithMaximumPursuit = true;
  // Repeat an actual GM-confirmed partition after the old groups became history.
  await move('icebreaker', nearby);
  await partition();
  const currentOwn = await group(wing), currentOther = await group(iceCrew);
  assert.notEqual(currentOwn, currentOther);
  assert.notEqual(currentOther, otherGroup, 'An absorbed event/message path must never be reused.');
  const newNote = { expectedGroupId: currentOther, requestId: randomUUID(), text: 'NEW SPLIT PRIVATE ICEBREAKER NOTE' };
  await command(iceCrew, 'sendFleetGroupMessage', newNote);
  const resplitHistory = await command(wing, 'readFleetGroupMessages', { expectedGroupId: currentOwn });
  assert.ok(resplitHistory.messages.some(note => note.id === foreignNote.requestId));
  assert.ok(!resplitHistory.messages.some(note => note.id === newNote.requestId));
  assert.ok((await command(iceCrew, 'readFleetGroupMessages', { expectedGroupId: currentOther })).messages.some(note => note.id === newNote.requestId));
  // These two records are labeled rule fixtures, not proof of an ECM activation.
  // Membership, rejoin, re-split and both message writes above are normal commands.
  async function eventProbe(groupId, eventId) {
    const path = `sessions/${sessionId}/fleetGroupEvents/${groupId}/events/${eventId}`;
    await db.doc(path).set({ type: 'endeavour-ecm-device-used', sessionId, groupId });
    return async actor => (await fetch(`http://127.0.0.1:${f.config.firestorePort}/v1/projects/${f.project}/databases/(default)/documents/${path}`,
      { headers: { Authorization: `Bearer ${actor.idToken}` } })).status;
  }
  const oldEvent = await eventProbe(otherGroup, 'acquired-history');
  const newEvent = await eventProbe(currentOther, 'new-private-event');
  assert.equal(await oldEvent(wing), 200);
  assert.equal(await newEvent(wing), 403);
  assert.equal(await newEvent(iceCrew), 200);
  checks.rejoinThenResplitPreservesOldHistoryAndDeniesNewForeignNotesAndRuleEvents = true;
  await writeFile(evidencePath, JSON.stringify({ kind: 'normal-authenticated-local-emulator-http-composed-split-gameplay',
    sourceCommit: process.env.PC07_SOURCE_COMMIT, checks, normalRoster: 13,
    fixtureChanges: ['disposable clock deadlines only', 'two labeled ECM event records for the native Rules audience probe; no ECM activation claim'],
    normalFacilitatorDecisions: ['scoped console grants', 'replacement eligibility', 'physical navigation and partition confirmation', 'early cycle advancement', 'audited damage correction when random maintenance damages a required console'],
    sourceCoordinates: { origin, nearby, distant }, jumps, transferredPassengers: transferred.playerUids.length,
    finalShips: restored.ships.length, preparedScene: false, productionGameplay: false, identitiesRetained: false,
    completedAt: new Date().toISOString() }, null, 2) + '\n');
  console.log('PC07 complete normal authenticated split, Comms, sharing, taxi and rejoin proof passed.');
} catch (error) {
  await writeFile(`${evidencePath}.failure.json`, JSON.stringify({ checks, message: error.message }, null, 2) + '\n');
  throw error;
} finally { await f.cleanup(); await db.terminate(); }
