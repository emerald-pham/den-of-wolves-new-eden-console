#!/usr/bin/env node
// PC10.1 Scientist proofs (#191 ECM activation, #193 detector, #195 shuttle-origin
// scouting, #196 mission participation): compiled production callables against
// native Firestore, with the real firestore.rules loaded for client reads of the
// documents those callables wrote. Each proof shows the entitled actor commits
// once, a duplicate or retry adds no second effect, the wrong actor is rejected
// without writes, and the result reaches only its audience. Authentication and
// initial state are local fixtures; this is not deployed gameplay.
// Run with `node scripts/test-pc10-1-scientist-proof.emulator.mjs`
// after `npm run emulators:configure -- auto`.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { emulatorPortsForSlot, emulatorSlotForConfig, vitePortForSlot } from './emulator-slots.js';
import { runWithReservation } from './run-emulator-command.mjs';

const repository = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const script = 'node scripts/test-pc10-1-scientist-proof.emulator.mjs';
if (!process.env.FIRESTORE_EMULATOR_HOST) {
  execFileSync('npm', ['run', 'build', '--prefix', 'functions'], { cwd: repository, stdio: 'inherit' });
  const configPath = resolve(repository, 'firebase.local.json');
  const slot = emulatorSlotForConfig(JSON.parse(await readFile(configPath, 'utf8')));
  if (slot === undefined) throw new Error('Configure a recognized isolated emulator slot.');
  await runWithReservation({ slot, kind: 'pc10-1-scientist-proof', command: script,
    ports: [...Object.values(emulatorPortsForSlot(slot)), vitePortForSlot(slot)],
    args: ['--yes', 'firebase-tools@15.29.0', 'emulators:exec', '--config', configPath,
      '--project', 'dow-new-eden-pc10-1-scientist-proof', '--only', 'firestore', script] });
} else {
  const require = createRequire(resolve(repository, 'functions/package.json'));
  const { getFirestore } = require('firebase-admin/firestore');
  const {
    readEndeavourResearchWorkspace, advanceEndeavourResearchTrack, buildEndeavourScienceDevice,
    readEndeavourEcmDeviceWorkspace, activateEndeavourEcmDevice, runWolfAgentDetectorTest,
    requestScout, resolvePendingScoutRequest, readPrivateScoutResult, listMyScoutReports, resumeSession,
    dealPrivateInitialCards, commitAwayMissionLifecycleCommand,
  } = require('../functions/lib/index.js');
  const { recommendedRoleIds } = require('../functions/lib/roleConfiguration.js');
  const { activeVesselIdsForRoles } = require('../functions/lib/gameSetup.js');
  const { roleOwnedCraftManifestForSetup } = require('../functions/lib/craftOwnership.js');
  const { missionDeck, missionDeckStateFromCards } = require('../functions/lib/missionDeck.js');
  const { organiserSitesForChart } = require('../functions/lib/starChartLookup.js');
  const { awayMissionHandId } = require('../functions/lib/awayMissionCards.js');
  const { initializeTestEnvironment, assertFails, assertSucceeds } = await import('@firebase/rules-unit-testing');
  const { doc: clientDoc, getDoc, getDocs, collection: clientCollection, setDoc } = await import('firebase/firestore');
  const db = getFirestore();
  const [host, port] = process.env.FIRESTORE_EMULATOR_HOST.split(':');
  const rules = await initializeTestEnvironment({
    projectId: process.env.GCLOUD_PROJECT,
    firestore: { host, port: Number(port), rules: await readFile(resolve(repository, 'firestore.rules'), 'utf8') },
  });
  test.after(() => rules.cleanup());
  const client = (uid) => rules.authenticatedContext(uid).firestore();
  const call = (uid, data) => ({ auth: { uid, token: { sub: uid, firebase: { sign_in_provider: 'custom' } } }, data });
  // Mission deck order: initial deal (Wing, Scientist), four leader-distributed extra cards, then the
  // two facilitator cards. Each participant places one card per opportunity. On the science
  // opportunity D-3 the Scientist's 9, the Wing Commander's 5 and a facilitator 8 total 22: below the
  // printed difficulty of 24 unless the Endeavour's +3 science bonus applies.
  const DECK_PREFIX = ['A♥', '4♥', '9♣', '10♣', '10♦', '5♦', '8♥', '8♦'];
  const EXTRA_CARD_PLAN = (wing, scientist) => [[scientist, 'D-3'], [wing, 'D-1'], [scientist, 'D-1'], [wing, 'D-3']];
  const SCIENTIST_PLACEMENTS = [{ cardId: '9♣', opportunityId: 'D-3' }, { cardId: '10♦', opportunityId: 'D-1' }];
  const WING_PLACEMENTS = [{ cardId: '5♦', opportunityId: 'D-3' }, { cardId: '10♣', opportunityId: 'D-1' }];
  const statuses = (results) => results.map(result => result.status).sort();
  const denied = (code) => (error) => error.code === code;
  const phase = (state) => ({ turn: 3, teamPhaseEndsAt: '2099-01-01T00:00:00.000Z',
    openAirspaceEndsAt: '2099-01-01T00:15:00.000Z',
    airspace: { state, tickerActive: true, pressAccess: state === 'lifted' } });
  const member = (id, uid, roleId, groupId, extra = {}) => ({ uid, sessionId: id, role: 'player', connected: true,
    fleetGroupId: groupId, assignedRoleId: roleId, seatId: roleId, activeConsoleRoleId: roleId,
    replacementRoleId: null, displayName: roleId, ...extra });

  // Two fleet groups: the Scientist and Wing Commander share Shepherd's group;
  // the Explorer is in a separate group and must never see that group's results.
  async function seedScientistFleet(id, { research, gm = false }) {
    const scientist = `${id}-scientist`, wing = `${id}-wing`, explorer = `${id}-explorer`, facilitator = `${id}-gm`;
    const session = db.doc(`sessions/${id}`);
    const doc = (path) => db.doc(`sessions/${id}/${path}`);
    const seed = db.batch();
    seed.set(session, { phase: 'active', currentTurn: 3, chartId: 'A', chartSelectionLocked: true, fleetPartitionRevision: 1,
      activeRoleIds: ['shepherd-scientist', 'wing-commander', 'quellon-explorer'],
      activeVesselIds: ['shepherd', 'aegis', 'quellon'],
      turnPhase: phase('restricted'),
      shuttleDockings: [{ shuttleId: 'endeavour', shipId: 'shepherd', dockedAt: new Date().toISOString() }],
      shuttleControl: { endeavour: { shuttleId: 'endeavour', ownerRoleId: 'shepherd-scientist',
        ownerUid: scientist, holderUid: scientist, revision: 3 } },
      shuttleFuelled: { endeavour: false },
      shipResources: {
        shepherd: { ore: 10, fuel: 4, food: 10, water: 8, materials: 30, securityTeams: 2 },
        aegis: { ore: 0, fuel: 4, food: 8, water: 6, materials: 8, securityTeams: 9 },
        quellon: { ore: 0, fuel: 3, food: 8, water: 6, materials: 4, securityTeams: 2 },
      },
      shipUpgrades: { shepherd: [], aegis: [], quellon: [] } });
    seed.set(doc(`players/${scientist}`), member(id, scientist, 'shepherd-scientist', 'fleet-1'));
    seed.set(doc(`players/${wing}`), member(id, wing, 'wing-commander', 'fleet-1'));
    seed.set(doc(`players/${explorer}`), member(id, explorer, 'quellon-explorer', 'fleet-2'));
    seed.set(doc('fleetGroups/fleet-1'), { id: 'fleet-1', vesselIds: ['shepherd', 'aegis'],
      memberUids: gm ? [facilitator, scientist, wing] : [scientist, wing] });
    if (gm) {
      seed.set(doc(`players/${facilitator}`), { ...member(id, facilitator, 'admiral', 'fleet-1'), role: 'gm', lastSeenAt: Date.now() });
      seed.set(doc('gmInstances/gm-browser'), { uid: facilitator, connected: true, lastSeenAt: Date.now() });
    }
    seed.set(doc('fleetGroups/fleet-2'), { id: 'fleet-2', vesselIds: ['quellon'], memberUids: [explorer] });
    seed.set(doc('serverState/endeavourResearch'), research);
    seed.set(doc('serverState/navigation'), { revision: 1,
      shipGalacticCoordinates: { shepherd: '0000', aegis: '0000', quellon: '1413' },
      shipNavigationLogs: { shepherd: [], aegis: [], quellon: [] },
      pursuitGroups: { 'fleet-1': 8, 'fleet-2': 6 } });
    seed.set(doc('gmDiscovery/current'), { revision: 1 });
    for (const [uid, groupId] of [[scientist, 'fleet-1'], [wing, 'fleet-1'], [explorer, 'fleet-2']]) {
      seed.set(doc(`playerDiscoveries/${uid}`), { groupId, revision: 1 });
    }
    await seed.commit();
    return { scientist, wing, explorer, facilitator, session, doc };
  }

  // Cross the final research box and buy the device through the real callables.
  async function researchAndBuild(id, scientist, trackId, deviceId) {
    const workspace = () => readEndeavourResearchWorkspace.run(call(scientist, { sessionId: id }));
    const before = await workspace();
    const researched = await advanceEndeavourResearchTrack.run(call(scientist, { sessionId: id, requestId: `research-${trackId}`,
      expectedControlRevision: 3, expectedResearchRevision: before.researchRevision, expectedCycle: 3, trackId,
      funding: 'standard' }));
    assert.equal(researched.status, 'committed');
    const quoted = await workspace();
    assert.equal(quoted.tracks.find(track => track.trackId === trackId).complete, true);
    const price = quoted.scienceDevices.buildCosts[deviceId];
    const built = await buildEndeavourScienceDevice.run(call(scientist, { sessionId: id, requestId: `build-${deviceId}`,
      expectedCycle: 3, expectedControlRevision: 3, expectedResearchRevision: quoted.researchRevision,
      expectedDeviceRevision: quoted.scienceDevices.revision, deviceId }));
    assert.equal(built.status, 'committed');
    return { price, materials: built.shepherdMaterials };
  }

  test('#191 the built ECM Device activates once for Shepherd\'s group and only that group reads the result', async () => {
    const id = `pc101-ecm-${process.pid}`;
    const { scientist, wing, explorer, session, doc } = await seedScientistFleet(id, { research: { 'ecm-device': 4 } });
    const navigation = () => doc('serverState/navigation').get();
    const eventPath = (requestId) => `sessions/${id}/fleetGroupEvents/fleet-1/events/endeavour-ecm-${requestId}`;
    try {
      // Owner-approved price: a completed five-box ECM Device costs 5 materials.
      const { price, materials } = await researchAndBuild(id, scientist, 'ecm-device', 'ecm-device');
      assert.equal(price, 5);
      assert.equal(materials, 25);

      // The Scientist's control reads the current authority; other members cannot.
      const workspace = await readEndeavourEcmDeviceWorkspace.run(call(scientist, { sessionId: id }));
      assert.deepEqual(workspace, { status: 'ready', sessionId: id, cycle: 3, controlRevision: 3,
        researchComplete: true, device: { status: 'ready', revision: 0 }, pursuit: { groupId: 'fleet-1', current: 8 } });
      await assert.rejects(readEndeavourEcmDeviceWorkspace.run(call(wing, { sessionId: id })), denied('permission-denied'));

      const activate = { sessionId: id, requestId: 'ecm-1', expectedControlRevision: workspace.controlRevision,
        expectedDeviceRevision: workspace.device.revision, expectedCycle: workspace.cycle };
      // Wrong actors: another member, and the Scientist after losing the Endeavour, change nothing.
      await assert.rejects(activateEndeavourEcmDevice.run(call(wing, activate)), denied('permission-denied'));
      await assert.rejects(activateEndeavourEcmDevice.run(call(explorer, activate)), denied('permission-denied'));
      await session.update({ 'shuttleControl.endeavour.holderUid': wing });
      await assert.rejects(activateEndeavourEcmDevice.run(call(scientist, activate)), denied('permission-denied'));
      await session.update({ 'shuttleControl.endeavour.holderUid': scientist });
      assert.equal((await doc('commandReceipts/ecm-1').get()).exists, false);
      assert.equal((await db.doc(eventPath('ecm-1')).get()).exists, false);
      assert.deepEqual((await navigation()).get('pursuitGroups'), { 'fleet-1': 8, 'fleet-2': 6 });

      // A concurrent duplicate activation reduces Shepherd's group pursuit by three exactly once.
      const replies = await Promise.all([
        activateEndeavourEcmDevice.run(call(scientist, activate)),
        activateEndeavourEcmDevice.run(call(scientist, activate)),
      ]);
      assert.deepEqual(statuses(replies), ['committed', 'replayed']);
      const committed = replies.find(reply => reply.status === 'committed');
      assert.deepEqual(committed, { status: 'committed', sessionId: id, requestId: 'ecm-1', cycle: 3, deviceRevision: 1,
        ownerGroupId: 'fleet-1', pursuitBefore: 8, pursuitAfter: 5 });
      const after = await navigation();
      assert.deepEqual(after.get('pursuitGroups'), { 'fleet-1': 5, 'fleet-2': 6 });
      assert.equal(after.get('revision'), 2);
      assert.deepEqual((await doc('serverState/endeavourEcmDevice').get()).data(),
        { status: 'used', revision: 1, ownerGroupId: 'fleet-1', pursuitBefore: 8, pursuitAfter: 5 });
      assert.equal((await doc(`playerDiscoveries/${scientist}`).get()).get('pursuitValue'), 5);
      assert.equal((await doc(`playerDiscoveries/${wing}`).get()).get('pursuitValue'), 5);
      assert.equal((await doc(`playerDiscoveries/${explorer}`).get()).get('pursuitValue'), 6);
      assert.equal((await db.collection(`sessions/${id}/fleetGroupEvents/fleet-1/events`).get()).size, 1);

      // A retry after a dropped connection replays the same result; a fresh request cannot reuse the device.
      const retried = await activateEndeavourEcmDevice.run(call(scientist, activate));
      assert.deepEqual(retried, { ...committed, status: 'replayed' });
      await assert.rejects(activateEndeavourEcmDevice.run(call(scientist, { ...activate, requestId: 'ecm-2' })),
        denied('failed-precondition'));
      assert.deepEqual((await navigation()).get('pursuitGroups'), { 'fleet-1': 5, 'fleet-2': 6 });
      assert.equal((await navigation()).get('revision'), 2);
      assert.equal((await doc('commandReceipts/ecm-2').get()).exists, false);
      const reread = await readEndeavourEcmDeviceWorkspace.run(call(scientist, { sessionId: id }));
      assert.deepEqual(reread.device, { status: 'used', revision: 1, ownerGroupId: 'fleet-1', pursuitBefore: 8, pursuitAfter: 5 });
      assert.deepEqual(reread.pursuit, { groupId: 'fleet-1', current: 5 });

      // Audience under the real rules: Shepherd's group reads the event; the other group and private state stay closed.
      await assertSucceeds(getDoc(clientDoc(client(scientist), eventPath('ecm-1'))));
      await assertSucceeds(getDoc(clientDoc(client(wing), eventPath('ecm-1'))));
      await assertFails(getDoc(clientDoc(client(explorer), eventPath('ecm-1'))));
      await assertFails(getDocs(clientCollection(client(explorer), `sessions/${id}/fleetGroupEvents/fleet-1/events`)));
      await assertFails(getDoc(clientDoc(client(scientist), `sessions/${id}/serverState/endeavourEcmDevice`)));
      await assertFails(getDoc(clientDoc(client(scientist), `sessions/${id}/commandReceipts/ecm-1`)));
      await assertFails(setDoc(clientDoc(client(scientist), eventPath('forged')),
        { type: 'endeavour-ecm-device-used', sessionId: id, groupId: 'fleet-1', pursuitBefore: 5, pursuitAfter: 2 }));
    } finally { await db.recursiveDelete(session); }
  });

  test('#193 a detector test runs once, survives retry unchanged, and only the testing Scientist can read it', async () => {
    const id = `pc101-detector-${process.pid}`;
    const { scientist, wing, explorer, session, doc } = await seedScientistFleet(id, { research: { 'wolf-agent-detector': 3 } });
    const reportPath = `sessions/${id}/wolfAgentDetectorReports/${scientist}`;
    const audits = async () => (await db.collection(`sessions/${id}/wolfAgentDetectorAudits`).get()).size;
    try {
      const secrets = db.batch();
      secrets.set(doc(`secrets/loyalty-${wing}`), { payload: { type: 'loyalty', kind: 'wolf-agent' }, visibleToUids: [wing] });
      secrets.set(doc(`secrets/loyalty-${explorer}`), { payload: { type: 'loyalty', kind: 'human' }, visibleToUids: [explorer] });
      await secrets.commit();
      await researchAndBuild(id, scientist, 'wolf-agent-detector', 'wolf-agent-detector');
      assert.deepEqual((await doc('serverState/endeavourScienceDevices').get()).data(),
        { revision: 1, ecmBuilt: false, detectorBuilt: true });

      const testWing = { sessionId: id, requestId: 'detect-1', expectedCycle: 3, expectedRevision: 0, targetUid: wing };
      // Wrong actors: the target, a member of another group, and the Scientist without the Endeavour.
      await assert.rejects(runWolfAgentDetectorTest.run(call(wing, { ...testWing, targetUid: explorer })), denied('permission-denied'));
      await assert.rejects(runWolfAgentDetectorTest.run(call(explorer, testWing)), denied('permission-denied'));
      await session.update({ 'shuttleControl.endeavour.holderUid': wing });
      await assert.rejects(runWolfAgentDetectorTest.run(call(scientist, testWing)), denied('permission-denied'));
      await session.update({ 'shuttleControl.endeavour.holderUid': scientist });
      assert.equal(await audits(), 0);
      assert.equal((await db.doc(reportPath).get()).exists, false);

      // A concurrent duplicate uses one of the cycle's three tests and returns one result.
      const replies = await Promise.all([
        runWolfAgentDetectorTest.run(call(scientist, testWing)),
        runWolfAgentDetectorTest.run(call(scientist, testWing)),
      ]);
      assert.deepEqual(replies[0], replies[1]);
      const result = replies[0];
      assert.deepEqual(Object.keys(result).sort(), ['cycle', 'investigatorUid', 'reportedWolf', 'requestId', 'revision',
        'sessionId', 'status', 'targetDisplayName', 'targetUid', 'type']);
      assert.equal(result.investigatorUid, scientist);
      assert.equal(result.targetUid, wing);
      assert.equal(typeof result.reportedWolf, 'boolean');
      assert.doesNotMatch(JSON.stringify(result), /wolf-agent"|accuracy|actualWolf|kind/);
      assert.deepEqual((await doc(`wolfAgentDetectorStates/${scientist}`).get()).data(), { cycle: 3, revision: 1, testsUsed: 1 });
      assert.equal(await audits(), 1);
      const audit = (await doc('wolfAgentDetectorAudits/detect-1').get()).data();
      assert.equal(audit.actualWolf, true);
      assert.equal(audit.reportedWolf, result.reportedWolf);

      // Retry after a dropped connection: the same private result, no new roll and no further test used.
      const stored = (await db.doc(reportPath).get()).data();
      const retried = await runWolfAgentDetectorTest.run(call(scientist, testWing));
      assert.deepEqual(retried, result);
      assert.deepEqual((await db.doc(reportPath).get()).data(), stored);
      assert.deepEqual((await doc(`wolfAgentDetectorStates/${scientist}`).get()).data(), { cycle: 3, revision: 1, testsUsed: 1 });
      assert.equal(await audits(), 1);

      // Audience under the real rules: only the testing Scientist reads the report; nobody reads the hidden truth.
      const report = await assertSucceeds(getDoc(clientDoc(client(scientist), reportPath)));
      assert.equal(report.get('reportedWolf'), result.reportedWolf);
      assert.deepEqual(report.get('visibleToUids'), [scientist]);
      for (const uid of [wing, explorer]) {
        await assertFails(getDoc(clientDoc(client(uid), reportPath)));
        await assertFails(getDocs(clientCollection(client(uid), `sessions/${id}/wolfAgentDetectorReports`)));
      }
      for (const uid of [scientist, wing]) {
        await assertFails(getDoc(clientDoc(client(uid), `sessions/${id}/wolfAgentDetectorAudits/detect-1`)));
        await assertFails(getDoc(clientDoc(client(uid), `sessions/${id}/commandReceipts/detect-1`)));
      }
      const { updatedAt: _updatedAt, ...forged } = stored;
      await assertFails(setDoc(clientDoc(client(scientist), reportPath), { ...forged, reportedWolf: !stored.reportedWolf }));
      // Losing the Endeavour also closes the Scientist's own report until authority returns.
      await session.update({ 'shuttleControl.endeavour.holderUid': wing });
      await assertFails(getDoc(clientDoc(client(scientist), reportPath)));
      await session.update({ 'shuttleControl.endeavour.holderUid': scientist });
      await assertSucceeds(getDoc(clientDoc(client(scientist), reportPath)));
    } finally { await db.recursiveDelete(session); }
  });

  test('#195 an Endeavour scan docked away from Shepherd stays bound to its receiving ship and reaches only its audience', async () => {
    const id = `pc101-scout-${process.pid}`;
    const { scientist, wing, explorer, facilitator, session, doc } = await seedScientistFleet(id, { research: {}, gm: true });
    const scout = { sessionId: id, requestId: 'scan-1', entitlementId: 'endeavour', targetCoordinate: '0408' };
    const nothingRecorded = async (requestId) => {
      assert.equal((await doc(`scoutRequests/${requestId}`).get()).exists, false);
      assert.equal((await doc(`commandReceipts/${requestId}`).get()).exists, false);
      assert.equal((await db.collection(`sessions/${id}/scoutCadence`).get()).size, 0);
    };
    const docked = (shipId) => session.update({ shuttleDockings: shipId
      ? [{ shuttleId: 'endeavour', shipId, dockedAt: new Date().toISOString() }] : [] });
    try {
      await session.update({ turnPhase: phase('lifted') });
      // No parked host: the shuttle cannot scan and nothing is recorded.
      await docked(null);
      await assert.rejects(requestScout.run(call(scientist, scout)), denied('failed-precondition'));
      await nothingRecorded('scan-1');

      // The Endeavour is parked on Aegis, away from its Shepherd anchor.
      await docked('aegis');
      await assert.rejects(requestScout.run(call(wing, scout)), denied('permission-denied'));
      await assert.rejects(requestScout.run(call(explorer, scout)), denied('permission-denied'));
      await nothingRecorded('scan-1');
      const replies = await Promise.all([
        requestScout.run(call(scientist, scout)),
        requestScout.run(call(scientist, scout)),
      ]);
      assert.deepEqual(statuses(replies), ['replayed', 'requested']);
      const requested = replies.find(reply => reply.status === 'requested');
      assert.deepEqual(requested, { status: 'requested', resolution: 'pending', requestId: 'scan-1', sessionId: id, cycle: 3,
        entitlementId: 'endeavour', source: 'craft', ownerRoleId: 'shepherd-scientist',
        anchorShipId: 'shepherd', receivingShipId: 'aegis', targetCoordinate: '0408' });
      assert.equal((await db.collection(`sessions/${id}/scoutRequests`).get()).size, 1);

      // The Endeavour returns to Shepherd; a retry stays bound to the ship that received the scan.
      await docked('shepherd');
      assert.deepEqual(await requestScout.run(call(scientist, scout)), { ...requested, status: 'replayed' });
      assert.equal((await doc('scoutRequests/scan-1').get()).get('receivingShipId'), 'aegis');
      await assert.rejects(requestScout.run(call(scientist, { ...scout, requestId: 'scan-2', targetCoordinate: '5143' })),
        denied('failed-precondition'));
      assert.equal((await doc('scoutRequests/scan-2').get()).exists, false);

      // The facilitator resolves it once; the scouted map entry belongs to the receiving ship.
      const resolveScan = () => resolvePendingScoutRequest.run(call(facilitator,
        { sessionId: id, requestId: 'scan-1', instanceId: 'gm-browser' }));
      assert.equal((await resolveScan()).status, 'resolved');
      const navigation = (await doc('serverState/navigation').get()).data();
      assert.ok(navigation.scoutedCoordinatesByShip.aegis.includes('0408'));
      assert.ok(!(navigation.scoutedCoordinatesByShip.shepherd ?? []).includes('0408'));
      assert.ok(navigation.systemHistory.aegis['0408'].candidateDiscovery);
      assert.equal(navigation.systemHistory.shepherd?.['0408'], undefined);

      // Audience: the requester alone reads the private fact; the receiving group sees the reveal; the other group nothing.
      const reveals = async (uid) => (await doc(`playerDiscoveries/${uid}`).get()).get('candidateReveals') ?? [];
      const reads = async () => ({
        result: await readPrivateScoutResult.run(call(scientist, { sessionId: id, requestId: 'scan-1' })),
        reports: await listMyScoutReports.run(call(scientist, { sessionId: id })),
        scientist: await reveals(scientist), wing: await reveals(wing), explorer: await reveals(explorer),
        revision: (await doc('serverState/navigation').get()).get('revision'),
      });
      const first = await reads();
      assert.equal(first.result.targetCoordinate, '0408');
      assert.equal(first.reports.length, 1);
      assert.deepEqual(first.scientist, [{ code: 'O', title: 'Deep Nebula' }]);
      assert.deepEqual(first.wing, first.scientist);
      assert.deepEqual(first.explorer, []);
      for (const uid of [wing, explorer]) {
        await assert.rejects(readPrivateScoutResult.run(call(uid, { sessionId: id, requestId: 'scan-1' })),
          denied('permission-denied'));
        assert.deepEqual(await listMyScoutReports.run(call(uid, { sessionId: id })), []);
      }
      for (const path of ['scoutRequests/scan-1', 'scoutResults/scan-1', 'serverState/navigation']) {
        await assertFails(getDoc(clientDoc(client(scientist), `sessions/${id}/${path}`)));
      }

      // A replayed resolve and every member reconnecting leave every reader's view unchanged.
      assert.equal((await resolveScan()).status, 'replayed');
      for (const uid of [scientist, wing, explorer]) {
        await resumeSession.run(call(uid, { sessionId: id }));
        assert.deepEqual(await reads(), first, `after ${uid} resumed`);
      }
    } finally { await db.recursiveDelete(session); }
  });

  test('#196 the Scientist\'s mission choices commit once, the Endeavour science bonus decides the result, and it stays private across reconnect', async () => {
    const id = `pc101-mission-${process.pid}`;
    const session = db.doc(`sessions/${id}`);
    const doc = (path) => db.doc(`sessions/${id}/${path}`);
    const gm = `${id}-gm`, wing = `${id}-wing`, scientist = `${id}-scientist`, miner = `${id}-miner`;
    const activeRoleIds = [...recommendedRoleIds(8)];
    const activeVesselIds = [...activeVesselIdsForRoles(activeRoleIds)];
    const coordinate = Object.entries(organiserSitesForChart('A')).find(([, site]) => site.code === 'D')[0];
    const opportunityId = `arrival-fleet-1-A-${coordinate}`;
    const missionId = `mission-${opportunityId}`;
    const missionRef = doc(`serverState/awayMissions/instances/${missionId}`);
    const now = new Date().toISOString();
    const end = new Date(Date.now() + 20 * 60_000).toISOString();
    const allCards = missionDeck();
    const prefix = DECK_PREFIX;
    const deck = missionDeckStateFromCards([...prefix.map(cardId => allCards.find(card => card.id === cardId)),
      ...allCards.filter(card => !prefix.includes(card.id))]);
    try {
      const batch = db.batch();
      batch.set(session, { phase: 'active', currentTurn: 2, setupRevision: 1, playerCount: 8,
        expansion: 'base', turnLimit: 6, chartId: 'A', chartSelectionLocked: true,
        dioneEnabled: false, capybaraEnabled: false, universalArbourEnabled: false, wolfCultEnabled: false,
        activeRoleIds, activeVesselIds,
        shipResources: { aegis: { food: 20, water: 20, fuel: 10, ore: 0, materials: 10, securityTeams: 9 } },
        shipSurvivors: { aegis: 2500 },
        shuttleDockings: [{ shuttleId: 'starlight', shipId: 'aegis', dockedAt: now },
          { shuttleId: 'endeavour', shipId: 'shepherd', dockedAt: now }],
        shuttleControl: {
          starlight: { shuttleId: 'starlight', ownerRoleId: 'wing-commander', ownerUid: wing, holderUid: wing, revision: 0 },
          endeavour: { shuttleId: 'endeavour', ownerRoleId: 'shepherd-scientist', ownerUid: scientist, holderUid: scientist, revision: 0 },
        }, retainedShuttles: {},
        turnPhase: { turn: 2, teamPhaseEndsAt: now, openAirspaceEndsAt: end,
          airspace: { state: 'lifted', tickerActive: true, pressAccess: true } },
        turnState: { currentTurn: 2, maxTurn: 6, phase: 'coordination', phaseRevision: 3, startedAt: now, endsAt: end } });
      batch.set(doc('serverState/navigation'), { revision: 4,
        shipGalacticCoordinates: Object.fromEntries(activeVesselIds.map(ship => [ship, coordinate])),
        shipNavigationLogs: Object.fromEntries(activeVesselIds.map(ship => [ship, []])), pursuitGroups: { 'fleet-1': 0 } });
      batch.set(doc('fleetGroups/fleet-1'), { id: 'fleet-1', vesselIds: activeVesselIds, memberUids: [gm, wing, scientist, miner] });
      for (const [uid, role, assignedRoleId] of [[gm, 'gm', null], [wing, 'player', 'wing-commander'],
        [scientist, 'player', 'shepherd-scientist'], [miner, 'player', 'icebreaker-miner']]) {
        batch.set(doc(`players/${uid}`), { uid, sessionId: id, role, connected: true, fleetGroupId: 'fleet-1', assignedRoleId,
          seatId: assignedRoleId, activeConsoleRoleId: assignedRoleId });
      }
      batch.set(doc('gmInstances/bridge'), { uid: gm, connected: true, lastSeenAt: now });
      batch.set(doc('craftOwnership/manifest'), roleOwnedCraftManifestForSetup(activeRoleIds, 'none'));
      batch.set(doc('serverState/missionDeck'), { ...deck, dealtCount: 0 });
      batch.set(doc(`missionOpportunities/${opportunityId}`), { type: 'mission-opportunity', status: 'available',
        sessionId: id, id: opportunityId, groupId: 'fleet-1', chart: 'A', coordinate, siteCode: 'D',
        sourceShipId: 'aegis', sourceTransitionId: 'jump-source-arrival', sourceCycle: 2 });
      await batch.commit();

      const deal = call(gm, { sessionId: id, instanceId: 'bridge', requestId: 'start-1', expectedSetupRevision: 1,
        expectedPhaseRevision: 3, expectedCycle: 2, opportunityId, groupId: 'fleet-1', chart: 'A', coordinate,
        sourceCycle: 2, missionLeaderUid: wing, participantUids: [wing, scientist] });
      assert.deepEqual(statuses(await Promise.all([dealPrivateInitialCards.run(deal), dealPrivateInitialCards.run(deal)])),
        ['committed', 'replayed']);
      const handPath = `sessions/${id}/awayMissionHands/${awayMissionHandId(missionId, scientist)}`;
      const hand = async () => (await db.doc(handPath).get()).data().lifecyclePrivateState;
      assert.deepEqual((await hand()).cards.map(card => card.id), [prefix[1]]);
      assert.deepEqual((await session.get()).get('missionCraftCommitments'), {
        starlight: { missionId, sourceCycle: 2 }, endeavour: { missionId, sourceCycle: 2 } });

      const revisionNow = async () => (await missionRef.get()).get('revision');
      const command = async (uid, type, fields = {}) => ({ sessionId: id, missionId, requestId: `${type}-${await revisionNow()}`,
        expectedRevision: await revisionNow(), type, ...fields, ...(uid === gm ? { instanceId: 'bridge' } : {}) });
      const send = async (uid, type, fields) => commitAwayMissionLifecycleCommand.run(call(uid, await command(uid, type, fields)));
      // Each Scientist choice: wrong actor first (no effect), then a concurrent duplicate that commits once.
      const scientistChoice = async (type, fields, imposters) => {
        const request = await command(scientist, type, fields);
        const revision = request.expectedRevision;
        // A non-participant is refused outright; a fellow participant cannot act on the Scientist's hand.
        for (const uid of imposters) {
          await assert.rejects(commitAwayMissionLifecycleCommand.run(call(uid, request)), (error) =>
            uid === miner ? error.code === 'permission-denied'
              : ['permission-denied', 'failed-precondition'].includes(error.code));
        }
        assert.equal(await revisionNow(), revision);
        const replies = await Promise.all([
          commitAwayMissionLifecycleCommand.run(call(scientist, request)),
          commitAwayMissionLifecycleCommand.run(call(scientist, request)),
        ]);
        assert.deepEqual(statuses(replies), ['committed', 'replayed']);
        assert.equal(await revisionNow(), revision + 1);
        return request;
      };

      await scientistChoice('requestExtraCards', { count: 2 }, [miner]);
      await send(wing, 'requestExtraCards', { count: 2 });
      for (const [participantUid, opportunity] of EXTRA_CARD_PLAN(wing, scientist)) {
        await send(wing, 'distributeExtraCard', { participantUid, opportunityId: opportunity });
      }
      await send(gm, 'openDiscards');
      await scientistChoice('discardCard', { cardId: prefix[1] }, [miner, wing]);
      await send(wing, 'discardCard', { cardId: prefix[0] });
      const handBeforeAssign = await hand();
      const assign = await scientistChoice('assignCards', { placements: SCIENTIST_PLACEMENTS }, [miner, wing]);
      await send(wing, 'assignCards', { placements: WING_PLACEMENTS });

      // The Endeavour's science bonus, credited to the contributing Scientist, turns D-3 from failure into success.
      const resolved = (await missionRef.get()).get('lifecycleRecord');
      assert.equal(resolved.status, 'resolved');
      const science = resolved.outcomes.find(outcome => outcome.opportunityId === 'D-3');
      assert.equal(science.cardTotal, 22);
      assert.deepEqual(science.bonusBreakdown, [{ participantUid: scientist,
        source: { kind: 'craft', id: 'endeavour' }, trait: 'science', amount: 3 }]);
      assert.equal(science.total, 25);
      assert.equal(science.outcome, 'success');
      assert.equal(resolved.rewards.find(reward => reward.opportunityId === 'D-3').branch, 'success');

      // Its exploration reward is facilitator-applied once and reaches the participants only.
      const explore = call(gm, { sessionId: id, missionId, instanceId: 'bridge', type: 'exploreSystems',
        requestId: 'explore-once', expectedRevision: await revisionNow(), opportunityId: 'D-3',
        targetCoordinates: ['4454', '5143'] });
      await assert.rejects(commitAwayMissionLifecycleCommand.run({ ...explore, auth: call(scientist, {}).auth }), /facilitator/i);
      assert.deepEqual(statuses(await Promise.all([commitAwayMissionLifecycleCommand.run(explore),
        commitAwayMissionLifecycleCommand.run(explore)])), ['committed', 'replayed']);
      const explored = async () => (await doc('serverState/navigation').get()).get('missionExploredCoordinatesByUid');
      assert.deepEqual(await explored(), { [wing]: ['4454', '5143'], [scientist]: ['4454', '5143'] });
      const projection = async (uid) => (await doc(`playerDiscoveries/${uid}`).get()).data();
      for (const uid of [scientist, wing]) {
        const { knownCoordinates } = await projection(uid);
        assert.ok(knownCoordinates.includes('4454') && knownCoordinates.includes('5143'), uid);
      }
      const { knownCoordinates: minerKnows } = await projection(miner);
      assert.ok(!minerKnows.includes('4454') && !minerKnows.includes('5143'));

      // The Scientist's hand is private under the real rules.
      await assertSucceeds(getDoc(clientDoc(client(scientist), handPath)));
      for (const uid of [wing, miner]) await assertFails(getDoc(clientDoc(client(uid), handPath)));
      await assertFails(getDocs(clientCollection(client(scientist), `sessions/${id}/awayMissionHands`)));
      await assertFails(getDoc(clientDoc(client(scientist), missionRef.path)));

      // Reconnect: the Scientist resumes and retries the assignment; nothing changes for any reader.
      const before = { hand: (await db.doc(handPath).get()).data(), mission: (await missionRef.get()).data(),
        explored: await explored(), scientist: await projection(scientist), miner: await projection(miner) };
      await resumeSession.run(call(scientist, { sessionId: id }));
      const retried = await commitAwayMissionLifecycleCommand.run(call(scientist, assign));
      assert.equal(retried.status, 'replayed');
      assert.deepEqual({ hand: (await db.doc(handPath).get()).data(), mission: (await missionRef.get()).data(),
        explored: await explored(), scientist: await projection(scientist), miner: await projection(miner) }, before);
      assert.equal(before.hand.lifecyclePrivateState.assignmentCommitted, true);
      assert.deepEqual(before.hand.lifecyclePrivateState.cards.map(({ id: cardId, status, opportunityId }) =>
        ({ cardId, status, opportunityId })), [
        { cardId: '4♥', status: 'discarded', opportunityId: null },
        { cardId: '9♣', status: 'assigned', opportunityId: 'D-3' },
        { cardId: '10♦', status: 'assigned', opportunityId: 'D-1' },
      ]);
      assert.deepEqual(handBeforeAssign.cards.map(card => card.id), ['4♥', '9♣', '10♦']);
    } finally { await db.recursiveDelete(session); }
  });
}
