#!/usr/bin/env node
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, getDoc } from 'firebase/firestore';
import { emulatorPortsForSlot, emulatorSlotForConfig, vitePortForSlot } from './emulator-slots.js';
import { runWithReservation } from './run-emulator-command.mjs';

const repository = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const projectId = 'dow-new-eden-pc06-gorg-support-test';
if (!process.env.FIRESTORE_EMULATOR_HOST) {
  execFileSync('npm', ['run', 'build', '--prefix', 'functions'], { cwd: repository, stdio: 'inherit' });
  const config = resolve(repository, 'firebase.local.json');
  const slot = emulatorSlotForConfig(JSON.parse(await readFile(config, 'utf8')));
  if (slot === undefined) throw new Error('Configure a recognized isolated emulator row.');
  await runWithReservation({ slot, kind: 'pc06-gorg-support', command: 'node scripts/test-pc06-gorgoneion-support.emulator.mjs',
    ports: [...Object.values(emulatorPortsForSlot(slot)), vitePortForSlot(slot)],
    args: ['--yes', 'firebase-tools@15.29.0', 'emulators:exec', '--config', config, '--project', projectId,
      '--only', 'firestore', 'node scripts/test-pc06-gorgoneion-support.emulator.mjs'] });
} else {
  const require = createRequire(resolve(repository, 'functions/package.json'));
  const { getFirestore } = require('firebase-admin/firestore');
  const { getGorgoneionMissionSupportProjection, applyGorgoneionMissionSupport } = require('../functions/lib/index.js');
  const { emptySmallShipState } = require('../functions/lib/smallShip.js');
  const { missionDeck, missionDeckStateFromCards } = require('../functions/lib/missionDeck.js');
  const db = getFirestore();
  const [host, port] = process.env.FIRESTORE_EMULATOR_HOST.split(':');
  const env = await initializeTestEnvironment({ projectId,
    firestore: { host, port: Number(port), rules: await readFile(resolve(repository, 'firestore.rules'), 'utf8') } });
  const request = (uid, data) => ({ auth: { uid, token: { sub: uid, firebase: { sign_in_provider: 'custom' } } }, data });
  test('production support writer publishes a rules-readable legacy start view and revokes private faces after exact concurrent apply', async () => {
    const id = `pc06-gorg-support-${process.pid}`;
    const session = db.doc(`sessions/${id}`);
    const deckRef = db.doc(`sessions/${id}/serverState/missionDeck`);
    const viewPath = `sessions/${id}/gorgoneionMissionSupportViews/captain`;
    const initialDeck = missionDeckStateFromCards(missionDeck());
    try {
      await session.set({ phase: 'active', activeVesselIds: ['aegis', 'dione'], expansion: 'base', capybaraEnabled: false,
        smallShipStates: { gorgoneion: { ...emptySmallShipState('gorgoneion', 'aegis'), dockingRevision: 1 } } });
      for (const [uid, role] of [['captain', 'player'], ['other', 'player'], ['gm', 'gm']]) {
        await db.doc(`sessions/${id}/players/${uid}`).set({ uid, sessionId: id, role, connected: true,
          replacementRoleId: uid === 'captain' ? 'gorgoneion-captain' : null,
          replacementStatus: null, activeConsoleRoleId: null, seatId: null });
      }
      // This is the production start's pre-repair deck constructor, not a hand-picked cursor fixture.
      await deckRef.set({ ...initialDeck });
      const projection = await getGorgoneionMissionSupportProjection.run(request('captain', { sessionId: id }));
      assert.equal(projection.status, 'available');
      const captainDb = env.authenticatedContext('captain').firestore();
      const view = await assertSucceeds(getDoc(doc(captainDb, viewPath)));
      assert.deepEqual(view.data().cardIds, projection.cardIds);
      assert.equal((await deckRef.get()).get('dealtCount'), 0);
      assert.deepEqual((await deckRef.get()).get('order'), initialDeck.order);
      for (const uid of ['other', 'gm']) await assertFails(getDoc(doc(env.authenticatedContext(uid).firestore(), viewPath)));
      const command = request('captain', { ...projection, requestId: 'support-once',
        topCardIds: projection.cardIds.filter((_, index) => index % 2 === 0),
        bottomCardIds: projection.cardIds.filter((_, index) => index % 2 === 1) });
      delete command.data.status;
      const replies = await Promise.all([applyGorgoneionMissionSupport.run(command), applyGorgoneionMissionSupport.run(command)]);
      assert.deepEqual(new Set(replies.map(reply => reply.status)), new Set(['committed', 'replayed']));
      assert.equal((await deckRef.get()).get('dealtCount'), 0);
      assert.equal((await deckRef.get()).get('gorgoneionSupportApplied'), true);
      await assertFails(getDoc(doc(captainDb, viewPath)));
    } finally {
      await db.recursiveDelete(session);
      await env.cleanup();
    }
  });
}
