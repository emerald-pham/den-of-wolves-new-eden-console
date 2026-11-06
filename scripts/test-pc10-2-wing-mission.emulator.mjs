#!/usr/bin/env node
// W2.1 (#188): a Wing Commander's Starlight mission choice resolves once to the
// Wing's private result through the real callables on real Firestore, including
// duplicate delivery and a later retry. It does not seed or reroll the outcome.
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
const self = 'node scripts/test-pc10-2-wing-mission.emulator.mjs';
if (!process.env.FIRESTORE_EMULATOR_HOST) {
  execFileSync('npm', ['run', 'build', '--prefix', 'functions'], { cwd: repository, stdio: 'inherit' });
  const path = resolve(repository, 'firebase.local.json');
  const slot = emulatorSlotForConfig(JSON.parse(await readFile(path, 'utf8')));
  if (slot === undefined) throw new Error('Configure a recognized isolated emulator slot.');
  await runWithReservation({ slot, kind: 'pc10-2-wing-mission', command: self,
    ports: [...Object.values(emulatorPortsForSlot(slot)), vitePortForSlot(slot)],
    args: ['--yes', 'firebase-tools@15.29.0', 'emulators:exec', '--config', path, '--project',
      'dow-new-eden-pc10-2-wing-mission-test', '--only', 'firestore', self] });
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
  const db = getFirestore();
  const request = (uid, data) => ({ auth: { uid, token: { sub: uid, firebase: { sign_in_provider: 'custom' } } }, data });

  test('the Wing Commander’s Starlight exploration choice resolves once to the Wing’s private result on retry', async () => {
    const id = `pc10-2-wing-${process.pid}`;
    const session = db.doc(`sessions/${id}`);
    const activeRoleIds = [...recommendedRoleIds(8)];
    const activeVesselIds = [...activeVesselIdsForRoles(activeRoleIds)];
    const coordinate = Object.entries(organiserSitesForChart('A')).find(([, site]) => site.code === 'A')[0];
    const opportunityId = `arrival-fleet-1-A-${coordinate}`;
    const missionId = `mission-${opportunityId}`;
    const missionRef = db.doc(`sessions/${id}/serverState/awayMissions/instances/${missionId}`);
    const handRef = (uid) => db.doc(`sessions/${id}/awayMissionHands/${awayMissionHandId(missionId, uid)}`);
    const pointerRef = (uid) => db.doc(`sessions/${id}/awayMissionHandPointers/${awayMissionHandId(missionId, uid)}`);
    const now = new Date().toISOString();
    const end = new Date(Date.now() + 20 * 60_000).toISOString();
    const allCards = missionDeck();
    const prefix = ['A♥', '4♥', '10♦'];
    const deck = missionDeckStateFromCards([...prefix.map(cardId => allCards.find(card => card.id === cardId)),
      ...allCards.filter(card => !prefix.includes(card.id))]);
    try {
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
        vesselIds: ['refinery-124', ...activeVesselIds.filter(ship => ship !== 'refinery-124')], memberUids: ['gm', 'alice', 'bob'] });
      for (const [uid, role, assignedRoleId] of [['gm', 'gm', null], ['alice', 'player', 'wing-commander'], ['bob', 'player', 'icebreaker-miner']]) {
        batch.set(db.doc(`sessions/${id}/players/${uid}`), { uid, sessionId: id, role, connected: true, fleetGroupId: 'fleet-1', assignedRoleId });
      }
      batch.set(db.doc(`sessions/${id}/gmInstances/bridge`), { uid: 'gm', connected: true, lastSeenAt: now });
      batch.set(db.doc(`sessions/${id}/craftOwnership/manifest`), roleOwnedCraftManifestForSetup(activeRoleIds, 'none'));
      batch.set(db.doc(`sessions/${id}/serverState/missionDeck`), { ...deck, dealtCount: 0 });
      batch.set(db.doc(`sessions/${id}/missionOpportunities/${opportunityId}`), { type: 'mission-opportunity', status: 'available',
        sessionId: id, id: opportunityId, groupId: 'fleet-1', chart: 'A', coordinate, siteCode: 'A',
        sourceShipId: 'aegis', sourceTransitionId: 'jump-source-arrival', sourceCycle: 2 });
      await batch.commit();

      await dealPrivateInitialCards.run(request('gm', { sessionId: id, instanceId: 'bridge', requestId: 'start-wing',
        expectedSetupRevision: 1, expectedPhaseRevision: 3, expectedCycle: 2, opportunityId, groupId: 'fleet-1',
        chart: 'A', coordinate, sourceCycle: 2, missionLeaderUid: 'alice', participantUids: ['alice', 'bob'] }));
      const send = async (uid, type, fields = {}) => {
        const revision = (await missionRef.get()).get('revision');
        return commitAwayMissionLifecycleCommand.run(request(uid, { sessionId: id, missionId, requestId: `${type}-${revision}`,
          expectedRevision: revision, type, ...fields, ...(uid === 'gm' ? { instanceId: 'bridge' } : {}) }));
      };
      await send('alice', 'requestExtraCards', { count: 1 });
      await send('alice', 'distributeExtraCard', { participantUid: 'alice', opportunityId: 'A-1' });
      await send('gm', 'openDiscards');
      await send('bob', 'discardCard', { cardId: '4♥' });
      await send('alice', 'discardCard', { cardId: 'A♥' });
      await send('bob', 'assignCards', { placements: [] });

      const choiceRevision = (await missionRef.get()).get('revision');
      const wingChoice = request('alice', { sessionId: id, missionId, type: 'assignCards', requestId: 'wing-starlight-choice',
        expectedRevision: choiceRevision, placements: [{ cardId: '10♦', opportunityId: 'A-1' }] });
      const delivered = await Promise.all([
        commitAwayMissionLifecycleCommand.run(wingChoice), commitAwayMissionLifecycleCommand.run(wingChoice),
      ]);
      assert.deepEqual(new Set(delivered.map(reply => reply.status)), new Set(['committed', 'replayed']));
      const resolvedRevision = (await missionRef.get()).get('revision');
      const record = (await missionRef.get()).get('lifecycleRecord');
      assert.equal(record.status, 'resolved');
      const outcome = record.outcomes.find(entry => entry.opportunityId === 'A-1');
      assert.equal(outcome.contributorCount, 1);
      assert.deepEqual(outcome.bonusBreakdown, [{ participantUid: 'alice', source: { kind: 'craft', id: 'starlight' },
        trait: 'exploration', amount: 3 }]);
      assert.equal(outcome.total, outcome.cardTotal + 3);
      assert.equal(outcome.difficulty, 17);
      console.log(`Wing Commander A-1 result (unseeded): total ${outcome.total} vs difficulty 17 => ${outcome.outcome}`);

      const retried = await commitAwayMissionLifecycleCommand.run(wingChoice);
      assert.equal(retried.status, 'replayed');
      assert.equal((await missionRef.get()).get('revision'), resolvedRevision);
      for (const reply of [...delivered, retried]) {
        assert.equal(reply.revision, resolvedRevision);
        assert.deepEqual(reply.privateState, delivered[0].privateState);
        assert.deepEqual(reply.publicState, delivered[0].publicState);
      }
      assert.equal(retried.privateState.participantUid, 'alice');
      assert.equal(retried.privateState.phase, 'resolved');
      assert.equal(retried.privateState.assignmentCommitted, true);
      assert.deepEqual(retried.privateState.cards.find(card => card.id === '10♦'),
        { id: '10♦', value: 10, status: 'assigned', opportunityId: 'A-1' });
      assert.deepEqual(retried.publicState.outcomes.find(entry => entry.opportunityId === 'A-1'), {
        opportunityId: 'A-1', contributorCount: 1, total: outcome.total, bonusTotal: 3, difficulty: 17,
        criticalThreshold: null, outcome: outcome.outcome });
      assert.doesNotMatch(JSON.stringify(retried.publicState), /A♥|10♦|cardId|cardTotal|bonusBreakdown|starlight/);
      assert.deepEqual((await handRef('alice').get()).get('lifecyclePrivateState'), retried.privateState);

      await assert.rejects(commitAwayMissionLifecycleCommand.run({ ...wingChoice, auth: request('bob', {}).auth }),
        error => error?.code === 'permission-denied');
      assert.equal((await missionRef.get()).get('revision'), resolvedRevision);
      const bobHand = (await handRef('bob').get()).get('lifecyclePrivateState');
      assert.equal(bobHand.participantUid, 'bob');
      assert.equal(bobHand.phase, 'resolved');
      for (const value of [bobHand, (await pointerRef('bob').get()).data(), (await pointerRef('alice').get()).data()]) {
        assert.doesNotMatch(JSON.stringify(value), /10♦|bonusBreakdown|starlight/);
      }
    } finally { await db.recursiveDelete(session); }
  });
}
