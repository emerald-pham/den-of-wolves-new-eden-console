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
const script = 'node scripts/test-pc06-maintenance-refuel.emulator.mjs';
if (!process.env.FIRESTORE_EMULATOR_HOST) {
  execFileSync('npm', ['run', 'build', '--prefix', 'functions'], { cwd: repository, stdio: 'inherit' });
  const configPath = resolve(repository, 'firebase.local.json');
  const slot = emulatorSlotForConfig(JSON.parse(await readFile(configPath, 'utf8')));
  if (slot === undefined) throw new Error('Configure a recognized isolated emulator slot.');
  await runWithReservation({ slot, kind: 'pc06-maintenance-refuel', command: script,
    ports: [...Object.values(emulatorPortsForSlot(slot)), vitePortForSlot(slot)],
    args: ['--yes', 'firebase-tools@15.29.0', 'emulators:exec', '--config', configPath,
      '--project', 'dow-new-eden-pc06-refuel-test', '--only', 'firestore', script] });
} else {
  const require = createRequire(resolve(repository, 'functions/package.json'));
  const { getFirestore } = require('firebase-admin/firestore');
  const { runMaintenance } = require('../functions/lib/index.js');
  const db = getFirestore();
  test('nonempty Hummingbird refuel persists through the native writer and exact replay spends fuel once', async () => {
    const id = `pc06-refuel-${process.pid}`;
    const uid = `${id}-gm`;
    const session = db.doc(`sessions/${id}`);
    const now = new Date().toISOString();
    const end = new Date(Date.now() + 20 * 60_000).toISOString();
    try {
      const seed = db.batch();
      seed.set(session, {
        phase: 'active', currentTurn: 1, configurationLocked: true,
        activeRoleIds: ['quellon-engineer', 'quellon-explorer'], activeVesselIds: ['quellon'],
        shipResources: { quellon: { ore: 0, fuel: 3, food: 2, water: 26, materials: 0, securityTeams: 2 } },
        shipSurvivors: { quellon: 30_000 }, shipUnrest: { quellon: 1 },
        shipDamage: { quellon: { damagedSystemIds: [], destroyed: false } }, shipUpgrades: {},
        maintenanceCycles: { quellon: { step: 6, revision: 8, turn: 1,
          results: { '5': 'Production resolved.' }, charges: ['jump-drive'], refuelled: [] } },
        shuttleDockings: [{ shipId: 'quellon', shuttleId: 'condor', dockedAt: now },
          { shipId: 'quellon', shuttleId: 'hummingbird', dockedAt: now }],
        shuttleFuelled: { condor: false, hummingbird: false }, shuttleCargo: {},
        turnPhase: { turn: 1, teamPhaseEndsAt: end, openAirspaceEndsAt: end,
          airspace: { state: 'restricted', tickerActive: true, pressAccess: false } },
        turnState: { currentTurn: 1, maxTurn: 6, phase: 'team', phaseRevision: 1, startedAt: now, endsAt: end },
        unrestAlerts: {}, populationAlerts: {},
      });
      seed.set(db.doc(`sessions/${id}/players/${uid}`), { uid, sessionId: id, role: 'gm', connected: true });
      seed.set(db.doc(`sessions/${id}/gmInstances/bridge`), {
        uid, connected: true, claimedAt: now, lastSeenAt: now,
      });
      seed.set(db.doc(`sessions/${id}/gmInstances/bridge/private/shipConsoleWriteGrant`), {
        type: 'gm-ship-console-write-grant', sessionId: id, instanceId: 'bridge', uid,
        shipId: 'quellon', grantedAt: now,
      });
      await seed.commit();
      const request = { auth: { uid, token: { sub: uid, firebase: { sign_in_provider: 'custom' } } },
        data: { sessionId: id, instanceId: 'bridge', shipId: 'quellon', requestId: 'fuel-hummingbird',
          action: 'bays', expectedRevision: 8, refuels: { 'shuttle-bay': 'hummingbird' } } };
      const committed = await runMaintenance.run(request);
      assert.equal(committed.status, 'committed');
      assert.equal(committed.committedRevision, 9);
      const receipt = await db.doc(`sessions/${id}/maintenanceRequests/fuel-hummingbird`).get();
      assert.equal(receipt.exists, true, 'the native Firestore writer accepted the nonempty fingerprint');
      assert.deepEqual(receipt.get('fingerprint.refuels'), [{ bayId: 'shuttle-bay', shuttleId: 'hummingbird' }]);
      assert.equal((await runMaintenance.run(request)).status, 'replayed');
      const after = await session.get();
      assert.equal(after.get('shipResources.quellon.fuel'), 2);
      assert.equal(after.get('shuttleFuelled.hummingbird'), true);
      assert.equal(after.get('shuttleFuelled.condor'), false);
      assert.equal(after.get('maintenanceCycles.quellon.revision'), 9);
      assert.equal((await db.collection(`sessions/${id}/events`).get()).size, 1);
    } finally {
      await db.recursiveDelete(session);
    }
  });
}
