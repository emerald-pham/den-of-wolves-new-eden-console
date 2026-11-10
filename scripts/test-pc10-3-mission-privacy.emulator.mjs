#!/usr/bin/env node
// PC10.3 Q3 mission privacy (#269 hands, #270 secret K roll, #271 hidden bonuses):
// compiled production callables against native Firestore, with the real
// firestore.rules loaded for authenticated client reads of what those callables
// wrote. The entitled reader is allowed and the wrong actor is denied, both
// after the deal and from a fresh client (reload). Authentication and initial
// state are local fixtures; the d6 and facilitator cards are unseeded. This is
// not deployed gameplay.
// Run with `node scripts/test-pc10-3-mission-privacy.emulator.mjs`
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
const script = 'node scripts/test-pc10-3-mission-privacy.emulator.mjs';
if (!process.env.FIRESTORE_EMULATOR_HOST) {
  execFileSync('npm', ['run', 'build', '--prefix', 'functions'], { cwd: repository, stdio: 'inherit' });
  const configPath = resolve(repository, 'firebase.local.json');
  const slot = emulatorSlotForConfig(JSON.parse(await readFile(configPath, 'utf8')));
  if (slot === undefined) throw new Error('Configure a recognized isolated emulator slot.');
  await runWithReservation({ slot, kind: 'pc10-3-mission-privacy', command: script,
    ports: [...Object.values(emulatorPortsForSlot(slot)), vitePortForSlot(slot)],
    args: ['--yes', 'firebase-tools@15.29.0', 'emulators:exec', '--config', configPath,
      '--project', 'dow-new-eden-pc10-3-mission-privacy', '--only', 'firestore', script] });
} else {
  const require = createRequire(resolve(repository, 'functions/package.json'));
  const { getFirestore } = require('firebase-admin/firestore');
  const { dealPrivateInitialCards, commitAwayMissionLifecycleCommand } = require('../functions/lib/index.js');
  const { recommendedRoleIds } = require('../functions/lib/roleConfiguration.js');
  const { activeVesselIdsForRoles } = require('../functions/lib/gameSetup.js');
  const { roleOwnedCraftManifestForSetup } = require('../functions/lib/craftOwnership.js');
  const { missionDeck, missionDeckStateFromCards } = require('../functions/lib/missionDeck.js');
  const { organiserSitesForChart } = require('../functions/lib/starChartLookup.js');
  const { awayMissionHandId } = require('../functions/lib/awayMissionCards.js');
  const { initializeTestEnvironment, assertFails, assertSucceeds } = await import('@firebase/rules-unit-testing');
  const {
    doc: clientDoc, getDoc, getDocs, setDoc, updateDoc, collection: clientCollection, query, where,
  } = await import('firebase/firestore');
  const db = getFirestore();
  const [host, port] = process.env.FIRESTORE_EMULATOR_HOST.split(':');
  const rules = await initializeTestEnvironment({
    projectId: process.env.GCLOUD_PROJECT,
    firestore: { host, port: Number(port), rules: await readFile(resolve(repository, 'firestore.rules'), 'utf8') },
  });
  test.after(() => rules.cleanup());
  // Each call is a separate client SDK instance, so a second call models a reload.
  const client = (uid) => rules.authenticatedContext(uid).firestore();
  const call = (uid, data) => ({ auth: { uid, token: { sub: uid, firebase: { sign_in_provider: 'custom' } } }, data });
  const denial = async (promise) => {
    const error = await promise.then(() => assert.fail('expected a rejection'), (caught) => caught);
    return { code: error?.code, text: `${error?.message ?? ''} ${JSON.stringify(error?.details ?? null)}` };
  };

  async function seedMission(siteCode, label) {
    const id = `pc10-3-${label}-${process.pid}`;
    const session = db.doc(`sessions/${id}`);
    const activeRoleIds = [...recommendedRoleIds(8)];
    const activeVesselIds = [...activeVesselIdsForRoles(activeRoleIds)];
    const coordinate = Object.entries(organiserSitesForChart('A')).find(([, site]) => site.code === siteCode)[0];
    const opportunityId = `arrival-fleet-1-${siteCode}-${coordinate}`;
    const missionId = `mission-${opportunityId}`;
    const now = new Date().toISOString();
    const end = new Date(Date.now() + 20 * 60_000).toISOString();
    const allCards = missionDeck();
    const prefix = ['A♥', '4♥', '10♦'];
    const deck = missionDeckStateFromCards([...prefix.map(cardId => allCards.find(card => card.id === cardId)),
      ...allCards.filter(card => !prefix.includes(card.id))]);
    const batch = db.batch();
    batch.set(session, { phase: 'active', currentTurn: 2, setupRevision: 1, playerCount: 8,
      expansion: 'base', turnLimit: 6, chartId: 'A', chartSelectionLocked: true,
      dioneEnabled: false, capybaraEnabled: false, universalArbourEnabled: false, wolfCultEnabled: false,
      activeRoleIds, activeVesselIds,
      shipResources: { aegis: { food: 20, water: 20, fuel: 10, ore: 0, materials: 10, securityTeams: 9 } },
      shipSurvivors: { aegis: 2500 },
      shuttleDockings: [{ shuttleId: 'starlight', shipId: 'aegis', dockedAt: now },
        { shuttleId: 'highwall', shipId: 'icebreaker', dockedAt: now }],
      shuttleControl: {
        starlight: { shuttleId: 'starlight', ownerRoleId: 'wing-commander', ownerUid: 'alice', holderUid: 'alice', revision: 0 },
        highwall: { shuttleId: 'highwall', ownerRoleId: 'icebreaker-miner', ownerUid: 'bob', holderUid: 'bob', revision: 0 },
      }, retainedShuttles: {},
      turnPhase: { turn: 2, teamPhaseEndsAt: now, openAirspaceEndsAt: end,
        airspace: { state: 'lifted', tickerActive: true, pressAccess: true } },
      turnState: { currentTurn: 2, maxTurn: 6, phase: 'coordination', phaseRevision: 3, startedAt: now, endsAt: end } });
    batch.set(db.doc(`sessions/${id}/serverState/navigation`), { revision: 4,
      shipGalacticCoordinates: Object.fromEntries(activeVesselIds.map(ship => [ship, ship === 'refinery-124' ? '0000' : coordinate])),
      shipNavigationLogs: Object.fromEntries(activeVesselIds.map(ship => [ship, []])), pursuitGroups: { 'fleet-1': 0 } });
    batch.set(db.doc(`sessions/${id}/fleetGroups/fleet-1`), { id: 'fleet-1',
      vesselIds: ['refinery-124', ...activeVesselIds.filter(ship => ship !== 'refinery-124')], memberUids: ['gm', 'alice', 'bob', 'eve'] });
    for (const [uid, role, assignedRoleId] of [['gm', 'gm', null], ['alice', 'player', 'wing-commander'],
      ['bob', 'player', 'icebreaker-miner'], ['eve', 'player', 'admiral']]) {
      batch.set(db.doc(`sessions/${id}/players/${uid}`), { uid, sessionId: id, role, connected: true, fleetGroupId: 'fleet-1', assignedRoleId });
    }
    batch.set(db.doc(`sessions/${id}/gmInstances/bridge`), { uid: 'gm', connected: true, lastSeenAt: now });
    batch.set(db.doc(`sessions/${id}/craftOwnership/manifest`), roleOwnedCraftManifestForSetup(activeRoleIds, 'none'));
    batch.set(db.doc(`sessions/${id}/serverState/missionDeck`), { ...deck, dealtCount: 0 });
    batch.set(db.doc(`sessions/${id}/missionOpportunities/${opportunityId}`), { type: 'mission-opportunity', status: 'available',
      sessionId: id, id: opportunityId, groupId: 'fleet-1', chart: 'A', coordinate, siteCode,
      sourceShipId: 'aegis', sourceTransitionId: 'jump-source-arrival', sourceCycle: 2 });
    await batch.commit();
    await dealPrivateInitialCards.run(call('gm', { sessionId: id, instanceId: 'bridge', requestId: `start-${label}`,
      expectedSetupRevision: 1, expectedPhaseRevision: 3, expectedCycle: 2, opportunityId, groupId: 'fleet-1',
      chart: 'A', coordinate, sourceCycle: 2, missionLeaderUid: 'alice', participantUids: ['alice', 'bob'] }));
    const missionRef = db.doc(`sessions/${id}/serverState/awayMissions/instances/${missionId}`);
    const handId = (uid) => awayMissionHandId(missionId, uid);
    const handPath = (uid) => `sessions/${id}/awayMissionHands/${handId(uid)}`;
    const pointerPath = (uid) => `sessions/${id}/awayMissionHandPointers/${handId(uid)}`;
    const send = async (uid, type, fields = {}) => {
      const revision = (await missionRef.get()).get('revision');
      return commitAwayMissionLifecycleCommand.run(call(uid, { sessionId: id, missionId, requestId: `${type}-${revision}-${uid}`,
        expectedRevision: revision, type, ...fields, ...(uid === 'gm' ? { instanceId: 'bridge' } : {}) }));
    };
    // Alice requests and keeps 10♦ for the single opportunity; both initial cards are discarded.
    const assignAndResolve = async (opportunity) => {
      await send('alice', 'requestExtraCards', { count: 1 });
      await send('alice', 'distributeExtraCard', { participantUid: 'alice', opportunityId: opportunity });
      await send('gm', 'openDiscards');
      await send('bob', 'discardCard', { cardId: '4♥' });
      await send('alice', 'discardCard', { cardId: 'A♥' });
      await send('bob', 'assignCards', { placements: [] });
      const revision = (await missionRef.get()).get('revision');
      const finalChoice = call('alice', { sessionId: id, missionId, type: 'assignCards', requestId: `final-${label}`,
        expectedRevision: revision, placements: [{ cardId: '10♦', opportunityId: opportunity }] });
      const committed = await commitAwayMissionLifecycleCommand.run(finalChoice);
      assert.equal(committed.status, 'committed');
      return { finalChoice, committed };
    };
    return { id, session, missionRef, handId, handPath, pointerPath, send, assignAndResolve };
  }

  test('Q3.1: only the participant (and the current GM) read a dealt hand, before and after a reload', async () => {
    const mission = await seedMission('K', 'hands');
    const { id, handId, handPath, pointerPath } = mission;
    try {
      // Entitled participant: discover the hand through the own-pointer query, then read it.
      for (const alice of [client('alice'), client('alice')]) {
        const pointers = await assertSucceeds(getDocs(query(clientCollection(alice, `sessions/${id}/awayMissionHandPointers`),
          where('sessionId', '==', id), where('participantUid', '==', 'alice'))));
        assert.deepEqual(pointers.docs.map(pointer => pointer.get('handId')), [handId('alice')]);
        const hand = await assertSucceeds(getDoc(clientDoc(alice, handPath('alice'))));
        assert.equal(hand.get('participantUid'), 'alice');
        assert.equal(hand.get('cardId'), 'A♥');
        assert.doesNotMatch(JSON.stringify(pointers.docs[0].data()), /A♥|4♥|cardId/);
      }
      await assertSucceeds(getDoc(clientDoc(client('gm'), handPath('alice'))));
      // Another participant and a non-participant member are denied the hand, its pointer and pointer enumeration.
      for (const uid of ['bob', 'eve']) {
        const reader = client(uid);
        await assertFails(getDoc(clientDoc(reader, handPath('alice'))));
        await assertFails(getDoc(clientDoc(reader, pointerPath('alice'))));
        await assertFails(getDocs(clientCollection(reader, `sessions/${id}/awayMissionHandPointers`)));
        await assertFails(getDocs(clientCollection(reader, `sessions/${id}/awayMissionHands`)));
      }
      // No client may forge or alter a hand, read the deck or replay receipts.
      await assertFails(setDoc(clientDoc(client('alice'), handPath('alice')), { participantUid: 'alice', cardId: '10♦' }));
      await assertFails(updateDoc(clientDoc(client('alice'), pointerPath('alice')), { discarded: true }));
      await assertFails(getDoc(clientDoc(client('gm'), `sessions/${id}/serverState/missionDeck`)));
      await assertFails(getDoc(clientDoc(client('alice'), `sessions/${id}/commandReceipts/start-hands`)));

      // Requests: Bob's reply carries only his own hand, and Bob cannot claim Alice's request.
      const bobReply = await mission.send('bob', 'requestExtraCards', { count: 1 });
      assert.equal(bobReply.privateState.participantUid, 'bob');
      assert.doesNotMatch(JSON.stringify(bobReply), /A♥/);
      const aliceRevision = (await mission.missionRef.get()).get('revision');
      const aliceRequest = call('alice', { sessionId: id, missionId: (await mission.missionRef.get()).id,
        type: 'requestExtraCards', requestId: 'alice-own', expectedRevision: aliceRevision, count: 1 });
      const aliceReply = await commitAwayMissionLifecycleCommand.run(aliceRequest);
      assert.deepEqual(aliceReply.privateState.cards.map(card => card.id), ['A♥']);
      const claimed = await denial(commitAwayMissionLifecycleCommand.run({ ...aliceRequest, auth: call('bob', {}).auth }));
      assert.equal(claimed.code, 'permission-denied');
      assert.doesNotMatch(claimed.text, /A♥|♥|cardId/);
      // Events are member-readable and carry no card identity.
      const events = await assertSucceeds(getDocs(clientCollection(client('eve'), `sessions/${id}/events`)));
      assert.ok(events.size > 0);
      for (const event of events.docs) assert.doesNotMatch(JSON.stringify(event.data()), /A♥|4♥|10♦|cardId/);
    } finally { await db.recursiveDelete(mission.session); }
  });

  test('Q3.2: the secret K d6 commits once and reaches no member read, reply, replay, event or error', async () => {
    const mission = await seedMission('K', 'secret-k');
    const { id, missionRef, handPath, pointerPath } = mission;
    try {
      const { finalChoice, committed } = await mission.assignAndResolve('K-1');
      const record = (await missionRef.get()).get('lifecycleRecord');
      assert.equal(record.status, 'resolved');
      const [outcome] = record.outcomes;
      // Protected arithmetic: difficulty 5X and critical 5X + 10 for an unseeded d6 X.
      assert.ok([5, 10, 15, 20, 25, 30].includes(outcome.difficulty), `difficulty ${outcome.difficulty}`);
      assert.equal(outcome.criticalThreshold, outcome.difficulty + 10);
      const expectedOutcome = outcome.total >= outcome.criticalThreshold ? 'critical-success'
        : outcome.total >= outcome.difficulty ? 'success' : 'failure';
      assert.equal(outcome.outcome, expectedOutcome);
      console.log(`K-1 (unseeded): total ${outcome.total} => ${outcome.outcome}`);
      const leak = new RegExp(`secretD6|"difficulty":${outcome.difficulty}\\b|"criticalThreshold":${outcome.criticalThreshold}\\b`);
      const redacted = { opportunityId: 'K-1', contributorCount: outcome.contributorCount, total: outcome.total,
        bonusTotal: outcome.bonusTotal, difficulty: null, criticalThreshold: null, outcome: outcome.outcome };

      assert.deepEqual(committed.publicState.outcomes, [redacted]);
      assert.deepEqual(committed.publicState.rewards, record.rewards);
      const replays = [await commitAwayMissionLifecycleCommand.run(finalChoice), await commitAwayMissionLifecycleCommand.run(finalChoice)];
      for (const replay of replays) assert.deepEqual(replay, { ...committed, status: 'replayed' });
      assert.equal((await missionRef.get()).get('revision'), committed.revision);

      // Each participant and the GM read the pointer through the rules, including after a reload.
      for (const [uid, owner] of [['alice', 'alice'], ['bob', 'bob'], ['alice', 'alice'], ['gm', 'alice'], ['gm', 'bob']]) {
        const pointer = await assertSucceeds(getDoc(clientDoc(client(uid), pointerPath(owner))));
        assert.deepEqual(pointer.get('lifecyclePublicState').outcomes, [redacted]);
        assert.doesNotMatch(JSON.stringify(pointer.data()), leak);
      }
      for (const uid of ['alice', 'bob']) {
        const hand = await assertSucceeds(getDoc(clientDoc(client(uid), handPath(uid))));
        assert.doesNotMatch(JSON.stringify(hand.data()), /secretD6|difficulty|criticalThreshold/);
      }
      for (const uid of ['alice', 'gm', 'eve']) await assertFails(getDoc(clientDoc(client(uid), missionRef.path)));
      const events = await assertSucceeds(getDocs(clientCollection(client('eve'), `sessions/${id}/events`)));
      for (const event of events.docs) assert.doesNotMatch(JSON.stringify(event.data()), leak);

      for (const wrong of ['bob', 'eve', 'gm']) {
        const denied = await denial(commitAwayMissionLifecycleCommand.run({ ...finalChoice, auth: call(wrong, {}).auth }));
        assert.equal(denied.code, 'permission-denied');
        assert.doesNotMatch(denied.text, new RegExp(`secretD6|\\b(${outcome.difficulty}|${outcome.criticalThreshold})\\b`));
      }
      assert.equal((await missionRef.get()).get('revision'), committed.revision);
    } finally { await db.recursiveDelete(mission.session); }
  });

  test('Q3.3: a hidden craft bonus changes the committed total but only its aggregate reaches members', async () => {
    const mission = await seedMission('A', 'bonus');
    const { id, missionRef, pointerPath } = mission;
    try {
      const { finalChoice, committed } = await mission.assignAndResolve('A-1');
      const record = (await missionRef.get()).get('lifecycleRecord');
      const outcome = record.outcomes.find(entry => entry.opportunityId === 'A-1');
      assert.deepEqual(outcome.bonusBreakdown, [{ participantUid: 'alice', source: { kind: 'craft', id: 'starlight' },
        trait: 'exploration', amount: 3 }]);
      // Alice's 10♦ plus unseeded facilitator cards, then the hidden +3.
      assert.equal(outcome.total, outcome.cardTotal + 3);
      assert.equal(outcome.difficulty, 17);
      console.log(`A-1 (unseeded facilitator cards): total ${outcome.total} vs 17 => ${outcome.outcome}`);
      const hidden = /bonusBreakdown|cardTotal|starlight|"trait"|10♦/;
      const committedOutcome = committed.publicState.outcomes.find(entry => entry.opportunityId === 'A-1');
      assert.deepEqual(committedOutcome, { opportunityId: 'A-1', contributorCount: 1, total: outcome.total,
        bonusTotal: 3, difficulty: 17, criticalThreshold: null, outcome: outcome.outcome });
      assert.doesNotMatch(JSON.stringify(committed.publicState), hidden);
      assert.deepEqual(await commitAwayMissionLifecycleCommand.run(finalChoice), { ...committed, status: 'replayed' });
      for (const [uid, owner] of [['alice', 'alice'], ['bob', 'bob'], ['gm', 'bob'], ['bob', 'bob']]) {
        const pointer = await assertSucceeds(getDoc(clientDoc(client(uid), pointerPath(owner))));
        assert.equal(pointer.get('lifecyclePublicState').outcomes.find(entry => entry.opportunityId === 'A-1').bonusTotal, 3);
        assert.doesNotMatch(JSON.stringify(pointer.data()), hidden);
      }
      for (const uid of ['alice', 'bob', 'gm']) await assertFails(getDoc(clientDoc(client(uid), missionRef.path)));
      await assertFails(getDoc(clientDoc(client('eve'), pointerPath('alice'))));
      const events = await assertSucceeds(getDocs(clientCollection(client('eve'), `sessions/${id}/events`)));
      for (const event of events.docs) assert.doesNotMatch(JSON.stringify(event.data()), hidden);
      const denied = await denial(commitAwayMissionLifecycleCommand.run({ ...finalChoice, auth: call('bob', {}).auth }));
      assert.equal(denied.code, 'permission-denied');
      assert.doesNotMatch(denied.text, hidden);
    } finally { await db.recursiveDelete(mission.session); }
  });
}
