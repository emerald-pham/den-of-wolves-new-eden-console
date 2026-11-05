#!/usr/bin/env node
// PC10.1 X1.1 / D1.1 / D1.3: compiled production callables and the automatic
// scout trigger handler against native Firestore. Covers what the mocked
// handler tests leave open: a Hummingbird scout requested by the Explorer and
// resolved by the automatic server path, candidate reveals produced by an
// ordinary jump arrival, and repeated or competing reveals that leave exactly
// one record with no second mission, pursuit or event effect. Authentication
// and initial state are local fixtures; this is not deployed gameplay.
// Run with `node scripts/test-pc10-1-explorer-discovery.emulator.mjs`
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
const script = 'node scripts/test-pc10-1-explorer-discovery.emulator.mjs';
if (!process.env.FIRESTORE_EMULATOR_HOST) {
  execFileSync('npm', ['run', 'build', '--prefix', 'functions'], { cwd: repository, stdio: 'inherit' });
  const configPath = resolve(repository, 'firebase.local.json');
  const slot = emulatorSlotForConfig(JSON.parse(await readFile(configPath, 'utf8')));
  if (slot === undefined) throw new Error('Configure a recognized isolated emulator slot.');
  await runWithReservation({ slot, kind: 'pc10-1-explorer-discovery', command: script,
    ports: [...Object.values(emulatorPortsForSlot(slot)), vitePortForSlot(slot)],
    args: ['--yes', 'firebase-tools@15.29.0', 'emulators:exec', '--config', configPath,
      '--project', 'dow-new-eden-pc10-1-explorer-test', '--only', 'firestore', script] });
} else {
  const require = createRequire(resolve(repository, 'functions/package.json'));
  const { getFirestore, Timestamp } = require('firebase-admin/firestore');
  const {
    requestScout, automaticallyResolveScoutRequest, resolvePendingScoutRequest, readPrivateScoutResult,
    listMyScoutReports, readMyScoutDiscoveryNote, jumpShip, moveShipToLocation,
  } = require('../functions/lib/index.js');
  const { jumpDistanceBetween } = require('../functions/lib/starChartGraph.js');
  const db = getFirestore();
  const call = (uid, data) => ({ auth: { uid, token: { sub: uid, firebase: { sign_in_provider: 'custom' } } }, data });
  const denied = (code) => (error) => error.code === code;
  const statuses = (replies) => replies.map(reply => reply.status).sort();
  const member = (sessionId, uid, role, group, roleId, now) => ({ uid, sessionId, role, connected: true,
    lastSeenAt: Timestamp.fromMillis(now), fleetGroupId: group, assignedRoleId: roleId, seatId: roleId, activeConsoleRoleId: roleId,
    replacementRoleId: null, replacementStatus: null });

  /** Every document under one session, with its write time, so a replay that rewrites anything is visible. */
  const dump = async (ref) => {
    const out = {};
    const walk = async (doc) => {
      for (const collection of await doc.listCollections()) {
        for (const child of (await collection.get()).docs) {
          out[child.ref.path] = { updateTime: child.updateTime.toMillis(), data: child.data() };
          await walk(child.ref);
        }
      }
    };
    const root = await ref.get();
    if (root.exists) out[ref.path] = { updateTime: root.updateTime.toMillis(), data: root.data() };
    await walk(ref);
    return out;
  };
  const count = async (session, collection) => (await session.collection(collection).get()).size;
  const reveals = async (sessionId, uid) =>
    (await db.doc(`sessions/${sessionId}/playerDiscoveries/${uid}`).get()).data();

  test('a Hummingbird scout requested by the Explorer resolves once through the automatic path, privately', async () => {
    const id = `pc10-1-hb-scout-${process.pid}`;
    const gm = `${id}-gm`, explorer = `${id}-explorer`, crew = `${id}-crew`, wing = `${id}-wing`;
    const session = db.doc(`sessions/${id}`);
    const navigation = db.doc(`sessions/${id}/serverState/navigation`);
    const now = Date.now();
    const scout = (uid, requestId, targetCoordinate) => requestScout.run(call(uid,
      { sessionId: id, requestId, entitlementId: 'hummingbird', targetCoordinate }));
    // The Firestore trigger handler exactly as deployed; retry: true means it may be delivered more than once.
    const deliver = (requestId, beforeExists = false) => automaticallyResolveScoutRequest.run({
      params: { sessionId: id, requestId },
      data: { before: { exists: beforeExists }, after: { exists: true } },
    });
    const read = (uid, extra = {}) => readPrivateScoutResult.run(call(uid, { sessionId: id, requestId: 'hb-1', ...extra }));
    try {
      const seed = db.batch();
      seed.set(session, { phase: 'active', currentTurn: 3, chartId: 'A', chartSelectionLocked: true,
        fleetPartitionRevision: 1,
        activeRoleIds: ['quellon-explorer', 'quellon-captain', 'wing-commander'],
        activeVesselIds: ['quellon', 'aegis'],
        turnPhase: { turn: 3, teamPhaseEndsAt: '2099-01-01T00:00:00.000Z',
          openAirspaceEndsAt: '2099-01-01T00:15:00.000Z',
          airspace: { state: 'lifted', tickerActive: true, pressAccess: true } },
        shuttleDockings: [{ shuttleId: 'hummingbird', shipId: 'quellon', dockedAt: new Date(now).toISOString() }],
        shuttleFuelled: { hummingbird: true } });
      seed.set(db.doc(`sessions/${id}/players/${gm}`), member(id, gm, 'gm', 'fleet-2', 'admiral', now));
      seed.set(db.doc(`sessions/${id}/gmInstances/gm-browser`), { uid: gm, connected: true, lastSeenAt: Timestamp.fromMillis(now) });
      seed.set(db.doc(`sessions/${id}/players/${explorer}`), member(id, explorer, 'player', 'fleet-1', 'quellon-explorer', now));
      seed.set(db.doc(`sessions/${id}/players/${crew}`), member(id, crew, 'player', 'fleet-1', 'quellon-captain', now));
      seed.set(db.doc(`sessions/${id}/players/${wing}`), member(id, wing, 'player', 'fleet-2', 'wing-commander', now));
      seed.set(db.doc(`sessions/${id}/fleetGroups/fleet-1`), { id: 'fleet-1', vesselIds: ['quellon'], memberUids: [explorer, crew] });
      seed.set(db.doc(`sessions/${id}/fleetGroups/fleet-2`), { id: 'fleet-2', vesselIds: ['aegis'], memberUids: [gm, wing] });
      // Quellon sits one jump from 4888 (P, Ancient Space Station) and seven from 0000.
      seed.set(navigation, { revision: 7, shipGalacticCoordinates: { quellon: '0408', aegis: '0000' },
        shipNavigationLogs: { quellon: [], aegis: [] }, pursuitGroups: { 'fleet-1': 3, 'fleet-2': 5 } });
      await seed.commit();
      assert.equal(jumpDistanceBetween('0408', '4888'), 1);
      assert.ok(jumpDistanceBetween('0408', '0000') > 3);

      // Wrong actors and an illegal target record nothing.
      for (const actor of [wing, crew, gm]) {
        await assert.rejects(scout(actor, 'hb-wrong', '4888'), denied('permission-denied'), actor);
      }
      await assert.rejects(scout(explorer, 'hb-far', '0000'), denied('failed-precondition'));
      await session.collection('players').doc(explorer).update({ activeConsoleRoleId: null });
      await assert.rejects(scout(explorer, 'hb-station', '4888'), denied('permission-denied'));
      await session.collection('players').doc(explorer).update({ activeConsoleRoleId: 'quellon-explorer' });
      assert.equal(await count(session, 'scoutRequests'), 0);
      assert.equal(await count(session, 'commandReceipts'), 0);

      // A duplicate delivery of the Explorer's request records one request and one cycle use.
      const requested = await Promise.all([scout(explorer, 'hb-1', '4888'), scout(explorer, 'hb-1', '4888')]);
      assert.deepEqual(statuses(requested), ['replayed', 'requested']);
      assert.equal(await count(session, 'scoutRequests'), 1);
      assert.equal(await count(session, 'commandReceipts'), 1);
      assert.deepEqual((await db.doc(`sessions/${id}/scoutCadence/3-hummingbird`).get()).get('scans')
        .map(scan => scan.requestId), ['hb-1']);
      // Hummingbird allows one request per cycle.
      await assert.rejects(scout(explorer, 'hb-2', '6798'), denied('failed-precondition'));
      assert.equal(await count(session, 'scoutRequests'), 1);

      // Until the server resolves it, the Explorer sees a pending report and no fact.
      assert.deepEqual((await listMyScoutReports.run(call(explorer, { sessionId: id })))
        .map(({ requestId, status, entitlementId }) => ({ requestId, status, entitlementId })),
      [{ requestId: 'hb-1', status: 'pending', entitlementId: 'hummingbird' }]);
      await assert.rejects(read(explorer), denied('permission-denied'));

      // An update event is not a new request; at-least-once delivery of the create resolves exactly once.
      await deliver('hb-1', true);
      assert.equal(await count(session, 'scoutResults'), 0);
      await Promise.all([deliver('hb-1'), deliver('hb-1')]);
      const resolved = await dump(session);
      const nav = (await navigation.get()).data();
      assert.equal(nav.revision, 8);
      assert.deepEqual(nav.pursuitGroups, { 'fleet-1': 3, 'fleet-2': 5 });
      assert.deepEqual(nav.shipGalacticCoordinates, { quellon: '0408', aegis: '0000' });
      assert.deepEqual(nav.scoutedCoordinatesByShip, { quellon: ['4888'] });
      assert.deepEqual(nav.systemHistory.quellon['4888'].candidateDiscovery, {
        id: 'scout-hb-1', occurredAt: nav.systemHistory.quellon['4888'].candidateDiscovery.occurredAt,
        code: 'P', title: 'Ancient Space Station', source: 'scout' });
      assert.equal(await count(session, 'scoutResults'), 1);
      assert.equal(await count(session, 'scoutResolutionAudits'), 1);
      assert.equal(await count(session, 'missionOpportunities'), 0);
      assert.equal(await count(session, 'events'), 0);
      const audit = (await db.doc(`sessions/${id}/scoutResolutionAudits/hb-1`).get()).data();
      assert.equal(audit.resolutionMode, 'automatic');
      assert.equal(audit.facilitatorUid, null);

      // The private fact reaches the requesting Explorer and a live facilitator only.
      const result = await read(explorer);
      assert.deepEqual({ ...result, systemFact: { code: result.systemFact.code, title: result.systemFact.title } }, {
        type: 'private-scout-result', sessionId: id, requestId: 'hb-1', requesterUid: explorer,
        sourceId: 'hummingbird', cycle: 3, targetCoordinate: '4888',
        systemFact: { code: 'P', title: 'Ancient Space Station' } });
      assert.deepEqual(await read(gm, { instanceId: 'gm-browser' }), result);
      for (const actor of [crew, wing, gm]) {
        await assert.rejects(read(actor), denied('permission-denied'), actor);
      }
      const [report] = await listMyScoutReports.run(call(explorer, { sessionId: id }));
      assert.equal(report.status, 'resolved');
      const note = await readMyScoutDiscoveryNote.run(call(explorer, { sessionId: id, noteId: report.noteId }));
      assert.deepEqual(note.systemFact, result.systemFact);
      assert.deepEqual(await listMyScoutReports.run(call(crew, { sessionId: id })), []);
      await assert.rejects(readMyScoutDiscoveryNote.run(call(crew, { sessionId: id, noteId: report.noteId })),
        denied('permission-denied'));

      // The candidate reaches the Explorer's own group as code and title only; the other group sees nothing.
      for (const uid of [explorer, crew]) {
        const view = await reveals(id, uid);
        assert.deepEqual(view.candidateReveals, [{ code: 'P', title: 'Ancient Space Station' }], uid);
        assert.doesNotMatch(JSON.stringify(view), /organiserSites|accruedBonus|chartId|summary/);
      }
      const foreign = await reveals(id, wing);
      assert.deepEqual(foreign.candidateReveals ?? [], []);
      assert.ok(!foreign.knownCoordinates.includes('4888'));
      assert.doesNotMatch(JSON.stringify(foreign), /Ancient Space Station/);

      // Redelivery, the Explorer's retry and a facilitator's manual resolve all replay without writing anything.
      await deliver('hb-1');
      assert.equal((await scout(explorer, 'hb-1', '4888')).status, 'replayed');
      assert.equal((await resolvePendingScoutRequest.run(call(gm,
        { sessionId: id, requestId: 'hb-1', instanceId: 'gm-browser' }))).status, 'replayed');
      await assert.rejects(resolvePendingScoutRequest.run(call(explorer,
        { sessionId: id, requestId: 'hb-1', instanceId: 'gm-browser' })), denied('permission-denied'));
      assert.deepEqual(await dump(session), resolved);
    } finally { await db.recursiveDelete(session); }
  });

  /** Two fleet groups; fleet-1 holds Aegis and Dione one jump from candidate 4888. */
  const seedArrivalSession = async (id, players, pursuit) => {
    const now = Date.now();
    const session = db.doc(`sessions/${id}`);
    const inventory = { ore: 0, fuel: 8, food: 8, water: 8, materials: 0, securityTeams: 2 };
    const seed = db.batch();
    seed.set(session, { phase: 'active', currentTurn: 1, turnPhase: { state: 'lifted' },
      chartId: 'A', chartSelectionLocked: true, fleetPartitionRevision: 1, dioneEnabled: true,
      activeVesselIds: ['aegis', 'dione', 'quellon'],
      activeRoleIds: ['admiral', 'dione-captain', 'quellon-explorer'],
      vesselActionRevisions: { aegis: 0, dione: 0, quellon: 0 },
      shipResources: { aegis: inventory, dione: inventory, quellon: inventory },
      shipSurvivors: { aegis: 140_000, dione: 90_000, quellon: 30_000 },
      shipUnrest: { aegis: 0, dione: 0, quellon: 0 },
      shipDamage: Object.fromEntries(['aegis', 'dione', 'quellon'].map(ship =>
        [ship, { damagedSystemIds: [], destroyed: false }])),
      shipUpgrades: {},
      shipJumpStates: { aegis: {}, dione: {}, quellon: {} },
      shipJumpTransitions: {},
      maintenanceCycles: Object.fromEntries(['aegis', 'dione', 'quellon'].map(ship =>
        [ship, { turn: 1, step: 0, revision: 0, charges: ['jump-drive'], refuelled: [], results: {} }])) });
    seed.set(db.doc(`sessions/${id}/serverState/navigation`), { revision: 20,
      shipGalacticCoordinates: { aegis: '0408', dione: '0408', quellon: '0000' },
      shipNavigationLogs: { aegis: [], dione: [], quellon: [] }, pursuitGroups: pursuit });
    seed.set(db.doc(`sessions/${id}/fleetGroups/fleet-1`), { id: 'fleet-1', vesselIds: ['aegis', 'dione'],
      memberUids: [players.gm, players.admiral, players.dione] });
    seed.set(db.doc(`sessions/${id}/fleetGroups/fleet-2`), { id: 'fleet-2', vesselIds: ['quellon'],
      memberUids: [players.explorer] });
    seed.set(db.doc(`sessions/${id}/players/${players.gm}`), member(id, players.gm, 'gm', 'fleet-1', null, now));
    seed.set(db.doc(`sessions/${id}/gmInstances/gm-browser`), { uid: players.gm, connected: true, lastSeenAt: Timestamp.fromMillis(now) });
    seed.set(db.doc(`sessions/${id}/players/${players.admiral}`), member(id, players.admiral, 'player', 'fleet-1', 'admiral', now));
    seed.set(db.doc(`sessions/${id}/players/${players.dione}`), member(id, players.dione, 'player', 'fleet-1', 'dione-captain', now));
    seed.set(db.doc(`sessions/${id}/players/${players.explorer}`), member(id, players.explorer, 'player', 'fleet-2', 'quellon-explorer', now));
    await seed.commit();
    return session;
  };

  /** Hold the first two transaction callbacks until both have started, forcing real contention. */
  const overlapping = async (...calls) => {
    const original = db.runTransaction;
    const run = original.bind(db);
    let attempts = 0, waiting = 0, release;
    const ready = new Promise(resolveReady => { release = resolveReady; });
    db.runTransaction = (update, options) => run(async (tx) => {
      attempts += 1;
      if (attempts <= calls.length) {
        waiting += 1;
        if (waiting === calls.length) release();
        await ready;
      }
      return update(tx);
    }, options);
    try {
      return { replies: await Promise.all(calls.map(fn => fn())), attempts };
    } finally { db.runTransaction = original; }
  };

  const arrivalPlayers = (id) => ({ gm: `${id}-gm`, admiral: `${id}-admiral`, dione: `${id}-dione`, explorer: `${id}-explorer` });

  test('an ordinary jump arrival reveals a candidate once, to its own group only, and a retry changes nothing', async () => {
    const id = `pc10-1-arrival-${process.pid}`;
    const players = arrivalPlayers(id);
    const session = await seedArrivalSession(id, players, { 'fleet-1': 10, 'fleet-2': 6 });
    const navigation = db.doc(`sessions/${id}/serverState/navigation`);
    const jump = (uid, shipId, requestId) => jumpShip.run(call(uid,
      { sessionId: id, shipId, destination: '4888', requestId, expectedRevision: 0, emergency: false }));
    try {
      // Wrong actors cannot move Aegis into the candidate system.
      for (const actor of [players.explorer, players.dione]) {
        await assert.rejects(jump(actor, 'aegis', 'arrive-wrong'), denied('permission-denied'), actor);
      }
      assert.equal((await navigation.get()).get('revision'), 20);
      assert.equal(await count(session, 'commandReceipts'), 0);

      // A duplicate delivery of one arrival jump commits once.
      const { replies, attempts } = await overlapping(() => jump(players.admiral, 'aegis', 'arrive-aegis'),
        () => jump(players.admiral, 'aegis', 'arrive-aegis'));
      assert.ok(attempts >= 3, `expected a real transaction retry, observed ${attempts} callbacks`);
      assert.deepEqual(replies[0], replies[1]);
      assert.equal(replies[0].status, 'jumped');
      const committed = await dump(session);
      const nav = (await navigation.get()).data();
      assert.equal(nav.revision, 21);
      assert.equal(nav.shipGalacticCoordinates.aegis, '4888');
      assert.deepEqual(nav.systemHistory.aegis['4888'].candidateDiscovery, {
        id: 'jump-arrive-aegis-0', occurredAt: nav.systemHistory.aegis['4888'].candidateDiscovery.occurredAt,
        code: 'P', title: 'Ancient Space Station', source: 'arrival' });
      assert.equal(nav.systemHistory.dione, undefined);
      assert.deepEqual(nav.pursuitGroups, { 'fleet-1': 10 - jumpDistanceBetween('0000', '4888'), 'fleet-2': 6 });
      assert.equal(await count(session, 'events'), 1);
      assert.equal(await count(session, 'commandReceipts'), 1);
      assert.equal(await count(session, 'missionOpportunities'), 0);

      // The reveal reaches fleet-1 members as code and title only; fleet-2 sees nothing.
      for (const uid of [players.admiral, players.dione]) {
        const view = await reveals(id, uid);
        assert.deepEqual(view.candidateReveals, [{ code: 'P', title: 'Ancient Space Station' }], uid);
        assert.doesNotMatch(JSON.stringify(view.candidateReveals), /organiser|summary|bonus|4888/);
      }
      const foreign = await reveals(id, players.explorer);
      assert.deepEqual(foreign.candidateReveals ?? [], []);
      assert.ok(!foreign.knownCoordinates.includes('4888'));
      assert.doesNotMatch(JSON.stringify(foreign), /Ancient Space Station/);

      // A retry after a dropped connection replays the reply and writes nothing.
      assert.deepEqual(await jump(players.admiral, 'aegis', 'arrive-aegis'), replies[0]);
      assert.deepEqual(await dump(session), committed);
    } finally { await db.recursiveDelete(session); }
  });

  test('competing arrival producers at one candidate keep one group reveal and add no duplicate effects', async () => {
    const id = `pc10-1-arrival-race-${process.pid}`;
    const players = arrivalPlayers(id);
    const session = await seedArrivalSession(id, players, { 'fleet-1': 10, 'fleet-2': 6 });
    const navigation = db.doc(`sessions/${id}/serverState/navigation`);
    // A member's jump and the facilitator's chart move are the two arrival producers.
    const aegis = () => jumpShip.run(call(players.admiral,
      { sessionId: id, shipId: 'aegis', destination: '4888', requestId: 'race-aegis', expectedRevision: 0, emergency: false }));
    const move = (uid) => moveShipToLocation.run(call(uid,
      { sessionId: id, instanceId: 'gm-browser', shipId: 'dione', destination: '4888', requestId: 'race-dione' }));
    try {
      // Only a live facilitator may use the chart move.
      for (const actor of [players.admiral, players.dione, players.explorer]) {
        await assert.rejects(move(actor), denied('permission-denied'), actor);
      }
      assert.equal((await navigation.get()).get('revision'), 20);

      // Both producers race into the same candidate system for one group.
      const { replies, attempts } = await overlapping(aegis, () => move(players.gm));
      assert.ok(attempts >= 3, `expected a real transaction retry, observed ${attempts} callbacks`);
      assert.equal(replies[0].status, 'jumped');
      assert.equal(replies[1].destination, '4888');
      const committed = await dump(session);
      const nav = (await navigation.get()).data();
      assert.equal(nav.revision, 22, 'one navigation revision per committed arrival');
      assert.deepEqual(nav.shipGalacticCoordinates, { aegis: '4888', dione: '4888', quellon: '0000' });
      // Each arriving ship keeps its own arrival record; the group sees one candidate.
      assert.deepEqual(['aegis', 'dione'].map(ship => {
        const { id: eventId, code, title, source } = nav.systemHistory[ship]['4888'].candidateDiscovery;
        return { eventId, code, title, source };
      }), [
        { eventId: 'jump-race-aegis-0', code: 'P', title: 'Ancient Space Station', source: 'arrival' },
        { eventId: 'navigation-race-dione-0', code: 'P', title: 'Ancient Space Station', source: 'arrival' },
      ]);
      for (const uid of [players.admiral, players.dione]) {
        assert.deepEqual((await reveals(id, uid)).candidateReveals,
          [{ code: 'P', title: 'Ancient Space Station' }], uid);
      }
      assert.deepEqual((await reveals(id, players.explorer)).candidateReveals ?? [], []);
      // Pursuit reduces per committed arrival (clamped at 0), the jump writes its one event, and no mission opens.
      const depth = jumpDistanceBetween('0000', '4888');
      assert.deepEqual(nav.pursuitGroups, { 'fleet-1': Math.max(0, 10 - 2 * depth), 'fleet-2': 6 });
      assert.deepEqual((await session.collection('events').get()).docs.map(doc => doc.id), ['ship-jump-race-aegis']);
      assert.equal(await count(session, 'missionOpportunities'), 0);
      assert.equal(await count(session, 'commandReceipts'), 2);

      // Replaying both arrivals together reveals nothing new and writes nothing.
      const replayed = await overlapping(aegis, () => move(players.gm));
      assert.deepEqual(replayed.replies, replies);
      assert.deepEqual(await dump(session), committed);
    } finally { await db.recursiveDelete(session); }
  });
}
