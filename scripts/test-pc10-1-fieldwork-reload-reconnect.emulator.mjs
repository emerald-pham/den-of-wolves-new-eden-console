#!/usr/bin/env node
// PC10.1 / #437: compiled production callables against native Firestore.
// Fills the gaps the #434-#436 emulator scripts leave: a Hummingbird harvest
// that is retried after a dropped connection or opened again after a reload
// shows the same private roll and credits its cargo once. Authentication and
// initial state are local fixtures; this is not deployed gameplay.
// Run with `node scripts/test-pc10-1-fieldwork-reload-reconnect.emulator.mjs`
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
const script = 'node scripts/test-pc10-1-fieldwork-reload-reconnect.emulator.mjs';
if (!process.env.FIRESTORE_EMULATOR_HOST) {
  execFileSync('npm', ['run', 'build', '--prefix', 'functions'], { cwd: repository, stdio: 'inherit' });
  const configPath = resolve(repository, 'firebase.local.json');
  const slot = emulatorSlotForConfig(JSON.parse(await readFile(configPath, 'utf8')));
  if (slot === undefined) throw new Error('Configure a recognized isolated emulator slot.');
  await runWithReservation({ slot, kind: 'pc10-1-fieldwork-reload-reconnect', command: script,
    ports: [...Object.values(emulatorPortsForSlot(slot)), vitePortForSlot(slot)],
    args: ['--yes', 'firebase-tools@15.29.0', 'emulators:exec', '--config', configPath,
      '--project', 'dow-new-eden-pc10-1-reconnect-test', '--only', 'firestore', script] });
} else {
  const require = createRequire(resolve(repository, 'functions/package.json'));
  const { getFirestore } = require('firebase-admin/firestore');
  const { rollHummingbirdHarvest, allocateHummingbirdHarvest } = require('../functions/lib/index.js');
  const db = getFirestore();
  const call = (uid, data) => ({ auth: { uid, token: { sub: uid, firebase: { sign_in_provider: 'custom' } } }, data });
  const statuses = (results) => results.map(result => result.status).sort();
  const denied = (code) => (error) => error.code === code;
  const stored = async (path) => (await db.doc(path).get()).data();
  const without = (value, ...keys) => Object.fromEntries(Object.entries(value).filter(([key]) => !keys.includes(key)));

  test('Hummingbird harvest rolls once, credits cargo once, and shows the same private result after a dropped connection', async () => {
    const id = `pc10-1-harvest-${process.pid}`;
    const explorer = `${id}-explorer`, other = `${id}-other`;
    const session = db.doc(`sessions/${id}`);
    const harvestPath = `sessions/${id}/hummingbirdHarvests/${explorer}`;
    const cargo = async () => (await session.get()).get('shuttleCargo.hummingbird');
    const receipts = async (collection) => (await db.collection(`sessions/${id}/${collection}`).get()).size;
    try {
      const seed = db.batch();
      seed.set(session, { phase: 'active', currentTurn: 2, chartId: 'A', chartSelectionLocked: true,
        activeRoleIds: ['quellon-explorer'], activeVesselIds: ['quellon'],
        shuttleDockings: [{ shuttleId: 'hummingbird', shipId: 'quellon', dockedAt: new Date().toISOString() }],
        shuttleFuelled: { hummingbird: true },
        shuttleCargo: { hummingbird: { food: 3, water: 4 } },
        turnPhase: { turn: 2, teamPhaseEndsAt: new Date(Date.now() - 2_000).toISOString(),
          openAirspaceEndsAt: '2099-01-01T00:15:00.000Z',
          airspace: { state: 'lifted', tickerActive: true, pressAccess: false } },
        shipResources: { quellon: { food: 10, water: 8, fuel: 3, ore: 0, materials: 0, securityTeams: 2 } } });
      seed.set(db.doc(`sessions/${id}/players/${explorer}`), { uid: explorer, sessionId: id, role: 'player',
        connected: true, fleetGroupId: 'fleet-1', assignedRoleId: 'quellon-explorer', seatId: 'quellon-explorer',
        activeConsoleRoleId: 'quellon-explorer', replacementRoleId: null });
      seed.set(db.doc(`sessions/${id}/players/${other}`), { uid: other, sessionId: id, role: 'player',
        connected: true, fleetGroupId: 'fleet-1', assignedRoleId: null, seatId: null,
        activeConsoleRoleId: null, replacementRoleId: null });
      seed.set(db.doc(`sessions/${id}/fleetGroups/fleet-1`), { id: 'fleet-1', vesselIds: ['quellon'], memberUids: [explorer, other] });
      await seed.commit();

      // Roll: another member cannot roll for the Explorer.
      const roll = { sessionId: id, requestId: 'roll-1', expectedRevision: 0 };
      await assert.rejects(rollHummingbirdHarvest.run(call(other, roll)), denied('permission-denied'));
      assert.equal(await receipts('hummingbirdHarvestRequests'), 0);

      // Roll: a duplicate delivery produces one private roll that both callers see.
      const rolled = await Promise.all([
        rollHummingbirdHarvest.run(call(explorer, roll)),
        rollHummingbirdHarvest.run(call(explorer, roll)),
      ]);
      assert.deepEqual(statuses(rolled), ['committed', 'replayed']);
      const { rolls } = rolled[0].harvest;
      assert.equal(rolls.length, 2);
      assert.deepEqual(rolled[1].harvest.rolls, rolls);
      assert.equal(await receipts('hummingbirdHarvestRequests'), 1);
      assert.deepEqual((await stored(harvestPath)).rolls, rolls);

      // Roll: a retry after the connection dropped replays the same dice, not new ones.
      const retried = await rollHummingbirdHarvest.run(call(explorer, roll));
      assert.equal(retried.status, 'replayed');
      assert.deepEqual(retried.harvest, rolled.find(reply => reply.status === 'committed').harvest);
      assert.deepEqual((await stored(harvestPath)).rolls, rolls);

      // Allocate: a duplicate delivery credits the Hummingbird cargo once.
      const allocate = { sessionId: id, requestId: 'allocate-1', expectedRevision: 1, foodDieIndex: 0 };
      const allocated = await Promise.all([
        allocateHummingbirdHarvest.run(call(explorer, allocate)),
        allocateHummingbirdHarvest.run(call(explorer, allocate)),
      ]);
      assert.deepEqual(statuses(allocated), ['committed', 'replayed']);
      const credited = { food: 3 + rolls[0], water: 4 + rolls[1] };
      assert.deepEqual(await cargo(), credited);
      assert.equal((await session.get()).get('shipResources.quellon.food'), 10);

      // Allocate: a retry after the connection dropped replays the same result and credits nothing more.
      const committed = allocated.find(reply => reply.status === 'committed');
      const replayed = await allocateHummingbirdHarvest.run(call(explorer, allocate));
      assert.equal(replayed.status, 'replayed');
      assert.deepEqual(replayed.harvest, committed.harvest);
      assert.deepEqual(replayed.cargo, credited);
      assert.deepEqual(await cargo(), credited);

      // Reload: the private document the client reopens holds exactly the replied result.
      const reloaded = await stored(harvestPath);
      assert.deepEqual(without(reloaded, 'updatedAt'), without(committed.harvest, 'updatedAt'));
      assert.equal(reloaded.status, 'resolved');
      assert.equal(reloaded.food, rolls[0]);
      assert.equal(reloaded.water, rolls[1]);

      // A fresh request after the result is already resolved neither rolls nor credits again.
      await assert.rejects(rollHummingbirdHarvest.run(call(explorer,
        { sessionId: id, requestId: 'roll-2', expectedRevision: reloaded.revision })), denied('failed-precondition'));
      const again = await allocateHummingbirdHarvest.run(call(explorer,
        { sessionId: id, requestId: 'allocate-2', expectedRevision: 1, foodDieIndex: 1 })).catch(error => error);
      assert.ok(again.code === 'failed-precondition' || again.status === 'stale', 'a second allocation must not commit');
      assert.deepEqual(await cargo(), credited);
      assert.deepEqual(without(await stored(harvestPath), 'updatedAt'), without(reloaded, 'updatedAt'));
      assert.equal(await receipts('hummingbirdHarvestRequests'), 2);
    } finally { await db.recursiveDelete(session); }
  });
}
