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
  } = require('../functions/lib/index.js');
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
  async function seedScientistFleet(id, { research }) {
    const scientist = `${id}-scientist`, wing = `${id}-wing`, explorer = `${id}-explorer`;
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
    seed.set(doc('fleetGroups/fleet-1'), { id: 'fleet-1', vesselIds: ['shepherd', 'aegis'], memberUids: [scientist, wing] });
    seed.set(doc('fleetGroups/fleet-2'), { id: 'fleet-2', vesselIds: ['quellon'], memberUids: [explorer] });
    seed.set(doc('serverState/endeavourResearch'), research);
    seed.set(doc('serverState/navigation'), { revision: 1,
      shipGalacticCoordinates: { shepherd: '0000', aegis: '0000', quellon: '1413' },
      pursuitGroups: { 'fleet-1': 8, 'fleet-2': 6 } });
    seed.set(doc('gmDiscovery/current'), { revision: 1 });
    for (const [uid, groupId] of [[scientist, 'fleet-1'], [wing, 'fleet-1'], [explorer, 'fleet-2']]) {
      seed.set(doc(`playerDiscoveries/${uid}`), { groupId, revision: 1 });
    }
    await seed.commit();
    return { scientist, wing, explorer, session, doc };
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
}
