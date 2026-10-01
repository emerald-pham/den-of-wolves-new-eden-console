#!/usr/bin/env node
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
const script = 'node scripts/test-pc06-voyage-maintenance.emulator.mjs';
if (!process.env.FIRESTORE_EMULATOR_HOST) {
  execFileSync('npm', ['run', 'build', '--prefix', 'functions'], { cwd: repository, stdio: 'inherit' });
  const configPath = resolve(repository, 'firebase.local.json');
  const slot = emulatorSlotForConfig(JSON.parse(await readFile(configPath, 'utf8')));
  if (slot === undefined) throw new Error('Configure a recognized isolated emulator slot.');
  await runWithReservation({ slot, kind: 'pc06-voyage-maintenance', command: script,
    ports: [...Object.values(emulatorPortsForSlot(slot)), vitePortForSlot(slot)],
    args: ['--yes', 'firebase-tools@15.29.0', 'emulators:exec', '--config', configPath,
      '--project', 'dow-new-eden-pc06-voyage-test', '--only', 'firestore', script] });
} else {
  const require = createRequire(resolve(repository, 'functions/package.json'));
  const { getFirestore } = require('firebase-admin/firestore');
  const { runVoyage33Maintenance, jumpVoyage33 } = require('../functions/lib/index.js');
  const db = getFirestore();
  test('native Voyage maintenance funds printed rations, persists one real charge and permits a legal uncharged jump', async () => {
    const id = `pc06-voyage-${process.pid}`, uid = `${id}-gm`;
    const session = db.doc(`sessions/${id}`);
    const now = new Date().toISOString(), end = new Date(Date.now() + 20 * 60_000).toISOString();
    const inventory = { ore: 0, fuel: 3, food: 30, water: 30, materials: 0, securityTeams: 0 };
    const maintenance = { id: 'voyage-33-0', hostShipId: 'aegis', dockingRevision: 3,
      population: 40_000, unrest: 0, cycle: { step: 0, revision: 0, results: {}, charges: [] } };
    const call = data => ({ auth: { uid, token: { sub: uid, firebase: { sign_in_provider: 'custom' } } }, data });
    try {
      const seed = db.batch();
      seed.set(session, { phase: 'active', currentTurn: 1, activeVesselIds: ['aegis'],
        admittedVesselIds: ['voyage-33-0'], configurationLocked: true,
        voyage33Admission: { type: 'voyage-admission', sessionId: id, id: 'voyage-33-0', status: 'admitted',
          crisisId: 'approach-1', crisisRevision: 2, population: 40_000, unrest: 0, hostShipId: null,
          commitments: { requiresHostDocking: true, hostProvidesResources: true, maintenanceSteps: [1,2,3,4], maxConsoleCharges: 1 } },
        voyage33Maintenance: maintenance, voyage33Movement: { id: 'voyage-33-0', coordinate: '0000', revision: 0, jumpState: {} },
        shipResources: { aegis: inventory }, shipDamage: { aegis: { damagedSystemIds: [], destroyed: false } },
        turnPhase: { turn: 1, teamPhaseEndsAt: end, openAirspaceEndsAt: end,
          airspace: { state: 'restricted', tickerActive: true, pressAccess: false } } });
      seed.set(db.doc(`sessions/${id}/players/${uid}`), { uid, sessionId: id, role: 'gm', connected: true });
      seed.set(db.doc(`sessions/${id}/gmInstances/bridge`), { uid, connected: true, claimedAt: now, lastSeenAt: now });
      seed.set(db.doc(`sessions/${id}/serverState/navigation`), { shipGalacticCoordinates: { aegis: '0000' }, shipNavigationLogs: {} });
      await seed.commit();
      let revision = 0, reactorRequest;
      for (const choice of [ { action: 'begin' }, { action: 'rations', foodLevel: 3, waterLevel: 3 },
        { action: 'unrest' }, { action: 'riot' }, { action: 'reactor', consoles: ['hydroponics'] }, { action: 'end' } ]) {
        const data = { sessionId: id, shipId: 'voyage-33-0', instanceId: 'bridge', requestId: `maintenance-${choice.action}`,
          expectedRevision: revision, expectedDockingRevision: 3, ...choice };
        const result = await runVoyage33Maintenance.run(call(data));
        assert.equal(result.status, 'committed');
        revision = result.cycle.revision;
        if (choice.action === 'rations') {
          assert.deepEqual(result.result.hostResources, { ...inventory, food: 17, water: 20 });
          await session.update({ currentTurn: 2, 'turnPhase.turn': 2 });
        } else if (choice.action !== 'begin') {
          assert.equal(result.cycle.turn, 1, 'remaining actions finish the preserved earlier cycle');
          assert.equal(result.currentTurn, 2, 'current authority advances without duplicating old rations');
        }
        if (choice.action === 'unrest') assert.match(result.cycle.results['2'], /Rolled [1-6] \+ [1-6]/);
        if (choice.action === 'reactor') {
          reactorRequest = data;
          assert.deepEqual(result.cycle.charges, ['hydroponics']);
          assert.equal((await runVoyage33Maintenance.run(call(data))).status, 'replayed');
        }
      }
      const beforeJump = await session.get();
      assert.deepEqual(beforeJump.get('voyage33Maintenance.cycle.charges'), ['hydroponics']);
      assert.equal(beforeJump.get('voyage33Maintenance.population'), 40_000);
      await session.update({ 'turnPhase.airspace.state': 'lifted' });
      const jump = { sessionId: id, instanceId: 'bridge', shipId: 'voyage-33-0', hostShipId: 'aegis', destination: '5143',
        requestId: 'uncharged-jump', expectedMovementRevision: 0, expectedDockingRevision: 3 };
      const result = await jumpVoyage33.run(call(jump));
      assert.equal(result.status, 'jumped');
      assert.equal(result.fuelSpent, 1);
      assert.deepEqual(result.maintenanceState.cycle.charges, ['hydroponics']);
      assert.equal(result.maintenanceState.hostShipId, null);
      assert.equal((await jumpVoyage33.run(call(jump))).status, 'replayed');
      assert.equal((await session.get()).get('shipResources.aegis.fuel'), 2);
      const afterJump = (await session.get()).data();
      const oldReceipt = await runVoyage33Maintenance.run(call(reactorRequest));
      assert.equal(oldReceipt.status, 'replayed', 'original host-bound receipt remains recoverable after later cycle and movement');
      assert.equal(oldReceipt.cycle.turn, 1);
      assert.deepEqual((await session.get()).data(), afterJump, 'old receipt recovery performs zero session writes');
    } finally { await db.recursiveDelete(session); }
  });
}
