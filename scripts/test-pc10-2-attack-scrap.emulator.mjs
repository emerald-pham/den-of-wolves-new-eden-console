#!/usr/bin/env node

// Native Firestore-emulator proof that an attack Scrap pickup is collected
// exactly once under real transaction contention, including a pickup carried
// past a later attack, and that a later attack keeps its own pickup.

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import { emulatorPortsForSlot, emulatorSlotForConfig, vitePortForSlot } from './emulator-slots.js';
import { runWithReservation } from './run-emulator-command.mjs';

const repositoryDirectory = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const localConfigPath = resolve(repositoryDirectory, 'firebase.local.json');
const projectId = 'dow-new-eden-attack-scrap-test';
const script = 'node scripts/test-pc10-2-attack-scrap.emulator.mjs';

async function runInsideFirestoreEmulator() {
  execFileSync('npm', ['run', 'build', '--prefix', 'functions'], { cwd: repositoryDirectory, stdio: 'inherit' });
  const config = JSON.parse(await readFile(localConfigPath, 'utf8'));
  const slot = emulatorSlotForConfig(config);
  if (slot === undefined) throw new Error('firebase.local.json does not contain a recognized emulator slot.');
  await runWithReservation({
    slot,
    kind: 'attack-scrap',
    command: script,
    ports: [...Object.values(emulatorPortsForSlot(slot)), vitePortForSlot(slot)],
    args: ['--yes', 'firebase-tools@15.29.0', 'emulators:exec', '--config', localConfigPath,
      '--project', projectId, '--only', 'firestore', script],
  });
}

if (!process.env.FIRESTORE_EMULATOR_HOST) {
  await runInsideFirestoreEmulator();
} else {
  const require = createRequire(resolve(repositoryDirectory, 'functions/package.json'));
  const { getFirestore } = require('firebase-admin/firestore');
  const { resolveWolfAttackAftermath } = require('../functions/lib/index.js');
  const db = getFirestore();
  const originalRunTransaction = db.runTransaction;

  const request = (uid, data) => ({
    data,
    auth: { uid, token: { sub: uid, user_id: uid, firebase: { sign_in_provider: 'custom' } } },
    app: undefined, instanceIdToken: undefined, rawRequest: undefined,
  });
  const damage = (target, amount) => ({ target, amount, populationBefore: 2_500, population: 2_000,
    state: { damagedSystemIds: [], destroyed: false }, draws: Array.from({ length: amount }, () => ({ casualty: false })) });
  const attackState = (attackId, turn, fleetDamage) => ({
    type: 'wolf-attack-state', status: 'resolved', attackId, turn, revision: 10, currentStep: 'resolved',
    deadlineAt: '2026-11-05T10:00:00.000Z', memberResults: [],
    calculationReceipt: {
      type: 'wolf-combat-calculation', version: 1, requestId: `final-${attackId}`,
      phase: { turn, phase: 'coordination', serverTime: '2026-11-05T09:59:00.000Z',
        deadlineAt: '2026-11-05T10:00:00.000Z', overrun: false },
      targeting: {}, ranges: [], boarding: [], fleetDamage,
      forceField: { status: 'unavailable', preventedDamage: 0 }, returningInstanceIds: [], survivingWolfShips: [],
    },
  });
  const operator = (roleId) => ({ role: 'player', connected: true, assignedRoleId: roleId, activeConsoleRoleId: roleId,
    replacementRoleId: null, replacementStatus: null, escapeState: null, fleetGroupId: 'fleet-1' });

  async function seed(label, sessionFields = {}) {
    const sessionId = `attack-scrap-${label}-${process.pid}`;
    const path = `sessions/${sessionId}`;
    await db.doc(path).set({
      phase: 'active', currentTurn: 7, capybaraEnabled: true, activeVesselIds: ['aegis', 'capybara'],
      shuttleDockings: [{ shuttleId: 'macaw', shipId: 'aegis', dockedAt: 'fixture' },
        { shuttleId: 'boa', shipId: 'aegis', dockedAt: 'fixture' }],
      shuttleControl: {
        macaw: { shuttleId: 'macaw', ownerRoleId: 'capybara-captain', ownerUid: 'macaw-uid', holderUid: 'macaw-uid', revision: 0 },
        boa: { shuttleId: 'boa', ownerRoleId: 'capybara-recycler', ownerUid: 'boa-uid', holderUid: 'boa-uid', revision: 0 },
      },
      shuttleCargo: {},
      ...sessionFields,
    });
    await db.doc(`${path}/players/macaw-uid`).set(operator('capybara-captain'));
    await db.doc(`${path}/players/boa-uid`).set(operator('capybara-recycler'));
    await db.doc(`${path}/players/outsider-uid`).set(operator('capybara-captain'));
    await db.doc(`${path}/fleetGroups/fleet-1`).set({ id: 'fleet-1', vesselIds: ['aegis', 'capybara'],
      memberUids: ['macaw-uid', 'boa-uid', 'outsider-uid'] });
    await db.doc(`${path}/wolfAttackState/current`).set(attackState('attack-7', 7, [damage('aegis', 3)]));
    const collect = (requestId, shuttleId, attackId = 'attack-7') => ({ sessionId, attackId, requestId,
      action: 'collect-scrap', shuttleId, targetShipId: 'aegis' });
    const snapshot = async () => ({
      session: await db.doc(path).get(),
      receipts: await db.collection(`${path}/commandReceipts`).get(),
    });
    return { sessionId, path, collect, snapshot };
  }

  /** Hold both first transaction attempts until each has started, forcing a real contention retry. */
  async function overlapping(first, second) {
    let attempts = 0;
    let waiting = 0;
    let release;
    const ready = new Promise((resolveReady) => { release = resolveReady; });
    db.runTransaction = (updateFunction, options) => originalRunTransaction.call(db, async (transaction) => {
      attempts += 1;
      if (attempts <= 2) {
        waiting += 1;
        if (waiting === 2) release();
        await ready;
      }
      return updateFunction(transaction);
    }, options);
    try {
      const outcomes = await Promise.allSettled([
        resolveWolfAttackAftermath.run(first), resolveWolfAttackAftermath.run(second),
      ]);
      return { outcomes, attempts };
    } finally {
      db.runTransaction = originalRunTransaction;
    }
  }

  const totalScrap = (session) => Object.values(session.get('shuttleCargo') ?? {})
    .reduce((sum, cargo) => sum + (cargo.scrap ?? 0), 0);
  const exactlyOneWinner = (outcomes) => {
    const fulfilled = outcomes.filter((outcome) => outcome.status === 'fulfilled');
    const rejected = outcomes.filter((outcome) => outcome.status === 'rejected');
    assert.equal(fulfilled.length, 1, 'exactly one competing collection may commit');
    assert.equal(rejected.length, 1);
    assert.equal(fulfilled[0].value.status, 'committed');
    assert.equal(rejected[0].reason.code, 'failed-precondition');
    return fulfilled[0].value;
  };

  test('competing Macaw and Boa requests for one current-attack pickup commit exactly once', async () => {
    const current = await seed('current');
    const { outcomes, attempts } = await overlapping(
      request('macaw-uid', current.collect('macaw-current', 'macaw')),
      request('boa-uid', current.collect('boa-current', 'boa')),
    );
    exactlyOneWinner(outcomes);
    assert.ok(attempts >= 3, `expected a real Firestore transaction retry, observed ${attempts} callbacks`);
    const committed = await current.snapshot();
    assert.equal(totalScrap(committed.session), 1);
    assert.equal(committed.receipts.size, 1);
  });

  test('a pickup carried past a later attack is collected once, retried idempotently, and the later attack stays separate', async () => {
    const carried = await seed('carried', { currentTurn: 8,
      attackScrapPickups: { aegis: [{ attackId: 'attack-7', turn: 7, destroyed: false }] } });
    await db.doc(`${carried.path}/wolfAttackState/current`).set({
      ...attackState('attack-8', 8, [damage('aegis', 4)]), status: 'declared', currentStep: 'targeting', revision: 1,
    });

    const denied = await Promise.allSettled([resolveWolfAttackAftermath.run(
      request('outsider-uid', carried.collect('outsider-carried', 'macaw')))]);
    assert.equal(denied[0].status, 'rejected');
    assert.equal(denied[0].reason.code, 'permission-denied');
    assert.deepEqual((await carried.snapshot()).session.get('attackScrapPickups'),
      { aegis: [{ attackId: 'attack-7', turn: 7, destroyed: false }] });

    // Shuttles do not move while attack-8 holds the fleet, so the carried pickup waits for its release.
    const held = await Promise.allSettled([resolveWolfAttackAftermath.run(
      request('macaw-uid', carried.collect('macaw-mid-attack', 'macaw')))]);
    assert.equal(held[0].status, 'rejected');
    assert.equal(held[0].reason.code, 'failed-precondition');
    assert.equal(totalScrap((await carried.snapshot()).session), 0);
    await db.doc(`${carried.path}/wolfAttackState/current`).update({ status: 'resolved', currentStep: 'resolved',
      revision: 9, airspaceLocked: false, parkingReleaseCondition: 'normal-movement-reopened' });

    const macawRequest = request('macaw-uid', carried.collect('macaw-carried', 'macaw'));
    const boaRequest = request('boa-uid', carried.collect('boa-carried', 'boa'));
    const { outcomes, attempts } = await overlapping(macawRequest, boaRequest);
    const winner = exactlyOneWinner(outcomes);
    assert.ok(attempts >= 3, `expected a real Firestore transaction retry, observed ${attempts} callbacks`);
    const committed = await carried.snapshot();
    assert.equal(totalScrap(committed.session), 1);
    assert.deepEqual(committed.session.get('attackScrapPickups'), {});
    assert.equal(committed.receipts.size, 1);

    const winnerRequest = winner.shuttleId === 'macaw' ? macawRequest : boaRequest;
    const replay = await resolveWolfAttackAftermath.run(winnerRequest);
    assert.deepEqual(replay, { ...winner, status: 'replayed' });
    const replayed = await carried.snapshot();
    assert.equal(replayed.session.updateTime.toMillis(), committed.session.updateTime.toMillis());
    assert.equal(totalScrap(replayed.session), 1);

    const later = await resolveWolfAttackAftermath.run(request('macaw-uid', carried.collect('macaw-later', 'macaw', 'attack-8')));
    assert.equal(later.status, 'committed');
    assert.equal(later.attackId, 'attack-8');
    assert.equal(totalScrap((await carried.snapshot()).session), 2);
  });
}
