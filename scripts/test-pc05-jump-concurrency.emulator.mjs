#!/usr/bin/env node

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import {
  emulatorPortsForSlot,
  emulatorSlotForConfig,
  vitePortForSlot,
} from './emulator-slots.js';
import { runWithReservation } from './run-emulator-command.mjs';

const repositoryDirectory = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const localConfigPath = resolve(repositoryDirectory, 'firebase.local.json');
const projectId = 'dow-new-eden-jump-concurrency-test';

async function runInsideFirestoreEmulator() {
  execFileSync('npm', ['run', 'build', '--prefix', 'functions'], {
    cwd: repositoryDirectory,
    stdio: 'inherit',
  });
  const config = JSON.parse(await readFile(localConfigPath, 'utf8'));
  const slot = emulatorSlotForConfig(config);
  if (slot === undefined) {
    throw new Error('firebase.local.json does not contain a recognized emulator slot.');
  }
  await runWithReservation({
    slot,
    kind: 'jump-concurrency',
    command: 'node scripts/test-pc05-jump-concurrency.emulator.mjs',
    ports: [...Object.values(emulatorPortsForSlot(slot)), vitePortForSlot(slot)],
    args: [
      '--yes',
      'firebase-tools@15.29.0',
      'emulators:exec',
      '--config',
      localConfigPath,
      '--project',
      projectId,
      '--only',
      'firestore',
      'node scripts/test-pc05-jump-concurrency.emulator.mjs',
    ],
  });
}

if (!process.env.FIRESTORE_EMULATOR_HOST) {
  await runInsideFirestoreEmulator();
} else {
  const require = createRequire(resolve(repositoryDirectory, 'functions/package.json'));
  const { getFirestore } = require('firebase-admin/firestore');
  const { jumpShip } = require('../functions/lib/index.js');
  const db = getFirestore();

  const aegisUid = 'concurrent-aegis-holder';
  const dioneUid = 'concurrent-dione-holder';
  const initialNavigationRevision = 40;
  const aegisRequestId = '30100000-0000-4000-8000-000000000001';
  const dioneRequestId = '30100000-0000-4000-8000-000000000002';

  const aegisInventory = {
    ore: 0,
    fuel: 4,
    food: 8,
    water: 6,
    materials: 1,
    securityTeams: 9,
  };
  const dioneInventory = {
    ore: 0,
    fuel: 8,
    food: 13,
    water: 14,
    materials: 0,
    securityTeams: 2,
  };

  function authenticatedRequest(uid, data) {
    return {
      data,
      auth: {
        uid,
        token: { sub: uid, user_id: uid, firebase: { sign_in_provider: 'custom' } },
      },
      app: undefined,
      instanceIdToken: undefined,
      rawRequest: undefined,
    };
  }

  function scenario(label, dioneOrigin) {
    const sessionId = `jump-concurrency-${label}-${process.pid}`;
    const sessionRef = db.doc(`sessions/${sessionId}`);
    const navigationRef = db.doc(`sessions/${sessionId}/serverState/navigation`);
    const groupRef = db.doc(`sessions/${sessionId}/fleetGroups/fleet-1`);
    const aegisRequest = authenticatedRequest(aegisUid, {
      sessionId,
      shipId: 'aegis',
      destination: '5143',
      requestId: aegisRequestId,
      expectedRevision: 0,
      emergency: false,
    });
    const dioneRequest = authenticatedRequest(dioneUid, {
      sessionId,
      shipId: 'dione',
      destination: '9997',
      requestId: dioneRequestId,
      expectedRevision: 0,
      emergency: false,
    });

    return {
      sessionId,
      sessionRef,
      navigationRef,
      aegisRequest,
      dioneRequest,
      async seed() {
        const batch = db.batch();
        batch.set(sessionRef, {
          phase: 'active',
          currentTurn: 1,
          turnPhase: { state: 'lifted' },
          chartId: 'A',
          chartSelectionLocked: true,
          dioneEnabled: true,
          activeVesselIds: ['aegis', 'dione'],
          activeRoleIds: ['admiral', 'dione-captain'],
          vesselActionRevisions: { aegis: 0, dione: 0 },
          shipResources: { aegis: aegisInventory, dione: dioneInventory },
          shipSurvivors: { aegis: 140_000, dione: 90_000 },
          shipUnrest: { aegis: 0, dione: 0 },
          shipDamage: {
            aegis: { damagedSystemIds: [], destroyed: false },
            dione: { damagedSystemIds: [], destroyed: false },
          },
          shipUpgrades: {},
          shipJumpStates: { aegis: {}, dione: {} },
          shipJumpTransitions: {},
          maintenanceCycles: {
            aegis: { turn: 1, step: 0, revision: 0, charges: ['jump-drive'], refuelled: [], results: {} },
            dione: { turn: 1, step: 0, revision: 0, charges: ['jump-drive'], refuelled: [], results: {} },
          },
        });
        batch.set(navigationRef, {
          shipGalacticCoordinates: { aegis: '0000', dione: dioneOrigin },
          shipNavigationLogs: { aegis: [], dione: [] },
          pursuitGroups: { 'fleet-1': 5 },
          revision: initialNavigationRevision,
        });
        batch.set(groupRef, {
          id: 'fleet-1',
          vesselIds: ['aegis', 'dione'],
          memberUids: [aegisUid, dioneUid],
        });
        batch.set(db.doc(`sessions/${sessionId}/players/${aegisUid}`), {
          sessionId,
          uid: aegisUid,
          role: 'player',
          connected: true,
          fleetGroupId: 'fleet-1',
          assignedRoleId: 'admiral',
          activeConsoleRoleId: 'admiral',
          replacementStatus: null,
        });
        batch.set(db.doc(`sessions/${sessionId}/players/${dioneUid}`), {
          sessionId,
          uid: dioneUid,
          role: 'player',
          connected: true,
          fleetGroupId: 'fleet-1',
          assignedRoleId: 'dione-captain',
          activeConsoleRoleId: 'dione-captain',
          replacementStatus: null,
        });
        await batch.commit();
      },
      async snapshot() {
        const [session, navigation, events, receipts, aegisDiscovery, dioneDiscovery] = await Promise.all([
          sessionRef.get(),
          navigationRef.get(),
          sessionRef.collection('events').get(),
          sessionRef.collection('commandReceipts').get(),
          db.doc(`sessions/${sessionId}/playerDiscoveries/${aegisUid}`).get(),
          db.doc(`sessions/${sessionId}/playerDiscoveries/${dioneUid}`).get(),
        ]);
        return { session, navigation, events, receipts, aegisDiscovery, dioneDiscovery };
      },
    };
  }

  async function runOverlapping(aegisRequest, dioneRequest) {
    const originalRunTransactionMethod = db.runTransaction;
    const originalRunTransaction = originalRunTransactionMethod.bind(db);
    let transactionCallbackAttempts = 0;
    let initialCallbacksWaiting = 0;
    let releaseInitialCallbacks;
    const initialCallbacksReady = new Promise((resolveReady) => {
      releaseInitialCallbacks = resolveReady;
    });
    db.runTransaction = (updateFunction, options) => originalRunTransaction(async (transaction) => {
      transactionCallbackAttempts += 1;
      if (transactionCallbackAttempts <= 2) {
        initialCallbacksWaiting += 1;
        if (initialCallbacksWaiting === 2) releaseInitialCallbacks();
        await initialCallbacksReady;
      }
      return updateFunction(transaction);
    }, options);
    try {
      const replies = await Promise.all([
        jumpShip.run(aegisRequest),
        jumpShip.run(dioneRequest),
      ]);
      return { replies, transactionCallbackAttempts };
    } finally {
      db.runTransaction = originalRunTransactionMethod;
    }
  }

  test('retries concurrent same-origin jumps against each vessel self-jump arrival', async () => {
    const current = scenario('same-origin', '0000');
    await current.seed();

    const { transactionCallbackAttempts } = await runOverlapping(
      current.aegisRequest,
      current.dioneRequest,
    );
    const committed = await current.snapshot();
    const logs = committed.navigation.get('shipNavigationLogs');

    assert.ok(
      transactionCallbackAttempts >= 3,
      `expected a real Firestore transaction retry, observed ${transactionCallbackAttempts} callbacks`,
    );
    assert.deepEqual(committed.navigation.get('shipGalacticCoordinates'), {
      aegis: '5143',
      dione: '9997',
    });
    assert.ok(logs.aegis.some((entry) => entry.type === 'self-jump' && entry.destination === '5143'));
    assert.ok(logs.dione.some((entry) => entry.type === 'self-jump' && entry.destination === '9997'));
    assert.equal(committed.session.get('shipResources').aegis.fuel, 2);
    assert.equal(committed.session.get('shipResources').dione.fuel, 4);
    assert.equal(committed.events.size, 2);
    assert.equal(committed.receipts.size, 2);
  });

  test('serializes overlapping vessel jumps and keeps exact retries side-effect free', async () => {
    const current = scenario('distinct-origin', '4888');
    await current.seed();
    const overlap = await runOverlapping(current.aegisRequest, current.dioneRequest);
    const committedReplies = overlap.replies;
    const committed = await current.snapshot();

    assert.ok(
      overlap.transactionCallbackAttempts >= 3,
      `expected a real Firestore transaction retry, observed ${overlap.transactionCallbackAttempts} callbacks`,
    );
    assert.deepEqual(
      committedReplies.map((reply) => ({
        status: reply.status,
        shipId: reply.shipId,
        destination: reply.destination,
        revision: reply.revision,
      })),
      [
        { status: 'jumped', shipId: 'aegis', destination: '5143', revision: 1 },
        { status: 'jumped', shipId: 'dione', destination: '9997', revision: 1 },
      ],
    );

    assert.deepEqual(committed.navigation.get('shipGalacticCoordinates'), {
      aegis: '5143',
      dione: '9997',
    });
    assert.equal(committed.navigation.get('shipNavigationLogs').aegis.length, 1);
    assert.equal(committed.navigation.get('shipNavigationLogs').dione.length, 1);
    assert.deepEqual(committed.navigation.get('pursuitGroups'), { 'fleet-1': 2 });

    assert.equal(committed.session.get('shipResources').aegis.fuel, 2);
    assert.equal(committed.session.get('shipResources').dione.fuel, 0);
    assert.deepEqual(committed.session.get('maintenanceCycles').aegis.charges, []);
    assert.deepEqual(committed.session.get('maintenanceCycles').dione.charges, []);
    assert.deepEqual(committed.session.get('vesselActionRevisions'), { aegis: 1, dione: 1 });
    assert.equal(committed.events.size, 2);
    assert.equal(committed.receipts.size, 2);
    assert.equal(committed.aegisDiscovery.get('currentCoordinate'), '5143');
    assert.equal(committed.dioneDiscovery.get('currentCoordinate'), '9997');

    const beforeReplay = {
      sessionUpdateTime: committed.session.updateTime.toMillis(),
      navigationUpdateTime: committed.navigation.updateTime.toMillis(),
      eventUpdateTimes: committed.events.docs.map((snapshot) => [snapshot.id, snapshot.updateTime.toMillis()]),
      receiptUpdateTimes: committed.receipts.docs.map((snapshot) => [snapshot.id, snapshot.updateTime.toMillis()]),
    };
    const replayedReplies = await Promise.all([
      jumpShip.run(current.aegisRequest),
      jumpShip.run(current.dioneRequest),
    ]);
    const replayed = await current.snapshot();

    assert.deepEqual(replayedReplies, committedReplies);
    assert.equal(replayed.navigation.get('revision'), committed.navigation.get('revision'));
    assert.deepEqual(replayed.navigation.get('shipGalacticCoordinates'), {
      aegis: '5143',
      dione: '9997',
    });
    assert.equal(replayed.session.get('shipResources').aegis.fuel, 2);
    assert.equal(replayed.session.get('shipResources').dione.fuel, 0);
    assert.deepEqual(replayed.session.get('maintenanceCycles').aegis.charges, []);
    assert.deepEqual(replayed.session.get('maintenanceCycles').dione.charges, []);
    assert.equal(replayed.events.size, 2);
    assert.equal(replayed.receipts.size, 2);
    assert.deepEqual({
      sessionUpdateTime: replayed.session.updateTime.toMillis(),
      navigationUpdateTime: replayed.navigation.updateTime.toMillis(),
      eventUpdateTimes: replayed.events.docs.map((snapshot) => [snapshot.id, snapshot.updateTime.toMillis()]),
      receiptUpdateTimes: replayed.receipts.docs.map((snapshot) => [snapshot.id, snapshot.updateTime.toMillis()]),
    }, beforeReplay);
    assert.equal(
      committed.navigation.get('revision'),
      initialNavigationRevision + 2,
      'the shared navigation revision must advance once per committed vessel move',
    );
    assert.equal(committed.aegisDiscovery.get('revision'), initialNavigationRevision + 2);
    assert.equal(committed.dioneDiscovery.get('revision'), initialNavigationRevision + 2);
  });
}
