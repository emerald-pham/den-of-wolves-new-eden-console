#!/usr/bin/env node
// Native Firestore-emulator check of the production scout-resolution callable
// for private candidate discovery: exactly-once effect, replay, wrong actor and
// audience. Run with `node scripts/test-pc10-1-candidate-discovery.emulator.mjs`
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
const script = 'node scripts/test-pc10-1-candidate-discovery.emulator.mjs';
if (!process.env.FIRESTORE_EMULATOR_HOST) {
  execFileSync('npm', ['run', 'build', '--prefix', 'functions'], { cwd: repository, stdio: 'inherit' });
  const configPath = resolve(repository, 'firebase.local.json');
  const slot = emulatorSlotForConfig(JSON.parse(await readFile(configPath, 'utf8')));
  if (slot === undefined) throw new Error('Configure a recognized isolated emulator slot.');
  await runWithReservation({ slot, kind: 'pc10-1-candidate-discovery', command: script,
    ports: [...Object.values(emulatorPortsForSlot(slot)), vitePortForSlot(slot)],
    args: ['--yes', 'firebase-tools@15.29.0', 'emulators:exec', '--config', configPath,
      '--project', 'dow-new-eden-pc10-1-candidate-test', '--only', 'firestore', script] });
} else {
  const require = createRequire(resolve(repository, 'functions/package.json'));
  const { getFirestore } = require('firebase-admin/firestore');
  const { resolvePendingScoutRequest, readPrivateScoutResult } = require('../functions/lib/index.js');
  const db = getFirestore();

  test('scout resolution reveals one candidate once, only to its own group, and only for the facilitator', async () => {
    const id = `pc10-1-candidate-${process.pid}`;
    const gm = `${id}-gm`, scientist = `${id}-scientist`, wing = `${id}-wing`, explorer = `${id}-explorer`;
    const session = db.doc(`sessions/${id}`);
    const navigation = db.doc(`sessions/${id}/serverState/navigation`);
    const now = Date.now();
    const call = (uid, data) => ({ auth: { uid, token: { sub: uid, firebase: { sign_in_provider: 'custom' } } }, data });
    const resolve = (uid, requestId) => resolvePendingScoutRequest.run(
      call(uid, { sessionId: id, requestId, instanceId: 'gm-browser' }));
    const scan = { sourceId: 'endeavour', attempt: 1, range: 'unlimited', targetCoordinate: '0408' };
    const request = (requestId, cycle) => ({
      type: 'scout-request', status: 'requested', resolution: 'pending', sessionId: id, requestId,
      actorUid: scientist, entitlementId: 'endeavour', source: 'craft', ownerRoleId: 'shepherd-scientist',
      anchorShipId: 'shepherd', receivingShipId: 'aegis', cycle, targetCoordinate: '0408', scan,
      createdAt: new Date(now).toISOString(),
    });
    const member = (uid, role, group, roleId) => ({ uid, sessionId: id, role, connected: true, lastSeenAt: now,
      fleetGroupId: group, assignedRoleId: roleId, seatId: roleId, activeConsoleRoleId: roleId });
    try {
      const seed = db.batch();
      seed.set(session, { phase: 'active', currentTurn: 4, chartId: 'A', chartSelectionLocked: true,
        activeRoleIds: ['wing-commander', 'shepherd-scientist', 'quellon-explorer'],
        activeVesselIds: ['aegis', 'shepherd', 'quellon'] });
      seed.set(db.doc(`sessions/${id}/players/${gm}`), member(gm, 'gm', 'fleet-1', 'admiral'));
      seed.set(db.doc(`sessions/${id}/gmInstances/gm-browser`), { uid: gm, connected: true, lastSeenAt: now });
      seed.set(db.doc(`sessions/${id}/players/${scientist}`), member(scientist, 'player', 'fleet-1', 'shepherd-scientist'));
      seed.set(db.doc(`sessions/${id}/players/${wing}`), member(wing, 'player', 'fleet-1', 'wing-commander'));
      seed.set(db.doc(`sessions/${id}/players/${explorer}`), member(explorer, 'player', 'fleet-2', 'quellon-explorer'));
      seed.set(db.doc(`sessions/${id}/fleetGroups/fleet-1`), { id: 'fleet-1', vesselIds: ['aegis', 'shepherd'], memberUids: [gm, scientist, wing] });
      seed.set(db.doc(`sessions/${id}/fleetGroups/fleet-2`), { id: 'fleet-2', vesselIds: ['quellon'], memberUids: [explorer] });
      seed.set(navigation, { revision: 5, shipGalacticCoordinates: { aegis: '0000', shepherd: '0000', quellon: '1413' },
        shipNavigationLogs: { aegis: [], shepherd: [], quellon: [] }, pursuitGroups: { 'fleet-1': 2, 'fleet-2': 4 } });
      seed.set(db.doc(`sessions/${id}/scoutRequests/scan-1`), request('scan-1', 4));
      seed.set(db.doc(`sessions/${id}/scoutCadence/4-endeavour`), { sessionId: id, entitlementId: 'endeavour', cycle: 4,
        scans: [{ requestId: 'scan-1', actorUid: scientist, scan }] });
      await seed.commit();

      // Wrong actors cannot reveal anything.
      for (const actor of [wing, scientist, explorer]) {
        await assert.rejects(resolve(actor, 'scan-1'), error => error.code === 'permission-denied');
      }
      assert.equal((await db.doc(`sessions/${id}/scoutResults/scan-1`).get()).exists, false);
      assert.equal((await navigation.get()).get('revision'), 5);

      // Duplicate deliveries of the same request produce one effect.
      const outcomes = await Promise.all([resolve(gm, 'scan-1'), resolve(gm, 'scan-1')]);
      assert.deepEqual(outcomes.map(outcome => outcome.status).sort(), ['replayed', 'resolved']);
      const after = (await navigation.get()).data();
      assert.equal(after.revision, 6);
      assert.deepEqual(after.systemHistory.aegis['0408'].candidateDiscovery,
        { id: 'scout-scan-1', occurredAt: after.systemHistory.aegis['0408'].candidateDiscovery.occurredAt,
          code: 'O', title: 'Deep Nebula', source: 'scout' });
      assert.equal((await resolve(gm, 'scan-1')).status, 'replayed');
      assert.deepEqual((await navigation.get()).data(), after);

      // The entitled group sees code and title only; the foreign group sees nothing.
      const wingView = (await db.doc(`sessions/${id}/playerDiscoveries/${wing}`).get()).data();
      assert.deepEqual(wingView.candidateReveals, [{ code: 'O', title: 'Deep Nebula' }]);
      assert.doesNotMatch(JSON.stringify(wingView), /organiserSites|accruedBonus|chartId/);
      const foreign = (await db.doc(`sessions/${id}/playerDiscoveries/${explorer}`).get()).data();
      assert.deepEqual(foreign.candidateReveals ?? [], []);
      assert.ok(!foreign.knownCoordinates.includes('0408'));

      // Only the requester may read the private fact.
      assert.equal((await readPrivateScoutResult.run(call(scientist, { sessionId: id, requestId: 'scan-1' }))).requestId, 'scan-1');
      await assert.rejects(readPrivateScoutResult.run(call(explorer, { sessionId: id, requestId: 'scan-1' })),
        error => error.code === 'permission-denied');

      // A later request for the same candidate keeps the original record and rewrites nothing.
      await db.batch()
        .update(session, { currentTurn: 5 })
        .set(db.doc(`sessions/${id}/scoutRequests/scan-2`), request('scan-2', 5))
        .set(db.doc(`sessions/${id}/scoutCadence/5-endeavour`), { sessionId: id, entitlementId: 'endeavour', cycle: 5,
          scans: [{ requestId: 'scan-2', actorUid: scientist, scan }] })
        .commit();
      assert.equal((await resolve(gm, 'scan-2')).status, 'resolved');
      assert.deepEqual((await navigation.get()).data(), after);
    } finally { await db.recursiveDelete(session); }
  });
}
