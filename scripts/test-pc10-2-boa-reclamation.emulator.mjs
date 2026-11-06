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

// Real-Firestore evidence for PC10.2 C2: one pre-deal Boa reclamation choice is
// bound at the deal, halves only that task's difficulty (odd halves round up),
// and resolves to exactly one Scrap in Boa cargo with no ordinary or critical reward.
const repository = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const self = 'node scripts/test-pc10-2-boa-reclamation.emulator.mjs';
if (!process.env.FIRESTORE_EMULATOR_HOST) {
  execFileSync('npm', ['run', 'build', '--prefix', 'functions'], { cwd: repository, stdio: 'inherit' });
  const path = resolve(repository, 'firebase.local.json');
  const slot = emulatorSlotForConfig(JSON.parse(await readFile(path, 'utf8')));
  if (slot === undefined) throw new Error('Configure a recognized isolated emulator slot.');
  await runWithReservation({ slot, kind: 'pc10-2-boa-reclamation', command: self,
    ports: [...Object.values(emulatorPortsForSlot(slot)), vitePortForSlot(slot)],
    args: ['--yes', 'firebase-tools@15.29.0', 'emulators:exec', '--config', path, '--project',
      'dow-new-eden-pc10-2-boa-test', '--only', 'firestore', self] });
} else {
  const require = createRequire(resolve(repository, 'functions/package.json'));
  const { getFirestore } = require('firebase-admin/firestore');
  const {
    dealPrivateInitialCards, commitAwayMissionLifecycleCommand,
    readBoaMissionReclamationWorkspace, chooseBoaMissionReclamationOpportunity,
  } = require('../functions/lib/index.js');
  const { recommendedRoleIds } = require('../functions/lib/roleConfiguration.js');
  const { activeVesselIdsForRoles } = require('../functions/lib/gameSetup.js');
  const { roleOwnedCraftManifestForSetup } = require('../functions/lib/craftOwnership.js');
  const { missionDeck, missionDeckStateFromCards } = require('../functions/lib/missionDeck.js');
  const { organiserSitesForChart } = require('../functions/lib/starChartLookup.js');
  const db = getFirestore();
  const request = (uid, data) => ({ auth: { uid, token: { sub: uid, firebase: { sign_in_provider: 'custom' } } }, data });

  /** Seeds one live 19-player Capybara session at a Chart A Derelict Station (D) arrival. */
  async function seedSession(id) {
    const session = db.doc(`sessions/${id}`);
    const activeRoleIds = [...recommendedRoleIds(19)];
    const activeVesselIds = [...activeVesselIdsForRoles(activeRoleIds)];
    const coordinate = Object.entries(organiserSitesForChart('A')).find(([, site]) => site.code === 'D')[0];
    const opportunityId = `arrival-fleet-1-A-${coordinate}`;
    const missionId = `mission-${opportunityId}`;
    const missionRef = db.doc(`sessions/${id}/serverState/awayMissions/instances/${missionId}`);
    const choiceRef = db.doc(`sessions/${id}/boaMissionReclamationChoices/${opportunityId}`);
    const now = new Date().toISOString();
    const end = new Date(Date.now() + 20 * 60_000).toISOString();
    const allCards = missionDeck();
    // Initial card, one extra card, then the facilitator's top card for D-1: 4 + 4 = 8.
    // 8 fails the printed 14 but succeeds against the Boa-halved 7 without reaching the critical 20.
    const prefix = ['10♥', '4♦', '4♣'];
    const deck = missionDeckStateFromCards([...prefix.map(cardId => allCards.find(card => card.id === cardId)),
      ...allCards.filter(card => !prefix.includes(card.id))]);
    const batch = db.batch();
    batch.set(session, { phase: 'active', currentTurn: 2, setupRevision: 1, playerCount: 19,
      expansion: 'capybara', turnLimit: 6, chartId: 'A', chartSelectionLocked: true,
      dioneEnabled: true, capybaraEnabled: true, universalArbourEnabled: false, wolfCultEnabled: false,
      activeRoleIds, activeVesselIds,
      shipResources: { aegis: { food: 20, water: 20, fuel: 10, ore: 0, materials: 10, securityTeams: 9 } },
      shipSurvivors: { aegis: 2500 },
      shuttleCargo: { boa: { scrap: 2 } },
      shuttleDockings: [{ shuttleId: 'boa', shipId: 'capybara', dockedAt: now }],
      shuttleControl: {
        boa: { shuttleId: 'boa', ownerRoleId: 'capybara-recycler', ownerUid: 'boa', holderUid: 'boa', revision: 1 },
      }, retainedShuttles: {},
      turnPhase: { turn: 2, teamPhaseEndsAt: now, openAirspaceEndsAt: end,
        airspace: { state: 'lifted', tickerActive: true, pressAccess: true } },
      turnState: { currentTurn: 2, maxTurn: 6, phase: 'coordination', phaseRevision: 3, startedAt: now, endsAt: end } });
    batch.set(db.doc(`sessions/${id}/serverState/navigation`), { revision: 4,
      shipGalacticCoordinates: Object.fromEntries(activeVesselIds.map(ship => [ship, coordinate])),
      shipNavigationLogs: Object.fromEntries(activeVesselIds.map(ship => [ship, []])), pursuitGroups: { 'fleet-1': 0 } });
    batch.set(db.doc(`sessions/${id}/fleetGroups/fleet-1`), { id: 'fleet-1', vesselIds: activeVesselIds,
      memberUids: ['gm', 'boa', 'captain'] });
    for (const [uid, role, assignedRoleId] of [['gm', 'gm', null], ['boa', 'player', 'capybara-recycler'],
      ['captain', 'player', 'capybara-captain']]) {
      batch.set(db.doc(`sessions/${id}/players/${uid}`), { uid, sessionId: id, role, connected: true,
        fleetGroupId: 'fleet-1', assignedRoleId });
    }
    batch.set(db.doc(`sessions/${id}/gmInstances/bridge`), { uid: 'gm', connected: true, lastSeenAt: now });
    batch.set(db.doc(`sessions/${id}/craftOwnership/manifest`),
      roleOwnedCraftManifestForSetup(activeRoleIds, 'expansion-capybara'));
    batch.set(db.doc(`sessions/${id}/serverState/missionDeck`), { ...deck, dealtCount: 0 });
    batch.set(db.doc(`sessions/${id}/missionOpportunities/${opportunityId}`), { type: 'mission-opportunity',
      status: 'available', sessionId: id, id: opportunityId, groupId: 'fleet-1', chart: 'A', coordinate,
      siteCode: 'D', sourceShipId: 'capybara', sourceTransitionId: 'jump-source-arrival', sourceCycle: 2 });
    await batch.commit();
    return { session, coordinate, opportunityId, missionId, missionRef, choiceRef };
  }

  test('a pre-deal Boa choice resolves once to one Scrap in Boa cargo and replays exactly', async () => {
    const id = `pc10-2-boa-${process.pid}`;
    const { session, coordinate, opportunityId, missionId, missionRef, choiceRef } = await seedSession(id);
    try {
      const workspace = await readBoaMissionReclamationWorkspace.run(request('boa', { sessionId: id }));
      assert.equal(workspace.opportunities.length, 1);
      assert.equal(workspace.opportunities[0].missionOpportunityId, opportunityId);
      await assert.rejects(readBoaMissionReclamationWorkspace.run(request('captain', { sessionId: id })),
        /Boa Recycler/);

      const choice = { sessionId: id, requestId: 'boa-choice-1', missionOpportunityId: opportunityId,
        taskOpportunityId: 'D-1', expectedControlRevision: 1, expectedChoiceRevision: 0, expectedCycle: 2 };
      const chosen = await Promise.all([chooseBoaMissionReclamationOpportunity.run(request('boa', choice)),
        chooseBoaMissionReclamationOpportunity.run(request('boa', choice))]);
      assert.deepEqual(new Set(chosen.map(reply => reply.status)), new Set(['committed', 'replayed']));
      await assert.rejects(chooseBoaMissionReclamationOpportunity.run(request('captain', choice)), /another player/);
      assert.equal((await choiceRef.get()).get('status'), 'selected');

      const deal = request('gm', { sessionId: id, instanceId: 'bridge', requestId: 'start-boa', expectedSetupRevision: 1,
        expectedPhaseRevision: 3, expectedCycle: 2, opportunityId, groupId: 'fleet-1', chart: 'A', coordinate,
        sourceCycle: 2, missionLeaderUid: 'boa', participantUids: ['boa'] });
      assert.equal((await dealPrivateInitialCards.run(deal)).status, 'committed');
      assert.equal((await choiceRef.get()).get('status'), 'consumed');
      const start = (await db.doc(`sessions/${id}/missionStartSnapshots/${opportunityId}`).get()).data();
      assert.deepEqual({ task: start.boaReclamation.missionCardOpportunityId, printed: start.boaReclamation.printedDifficulty,
        effective: start.boaReclamation.effectiveDifficulty, rounding: start.boaReclamation.rounding },
      { task: 'D-1', printed: 14, effective: 7, rounding: 'up' });
      await assert.rejects(chooseBoaMissionReclamationOpportunity.run(request('boa', {
        ...choice, requestId: 'boa-choice-late', taskOpportunityId: 'D-2', expectedChoiceRevision: 1,
      })), /already (started|been used)/);
      await assert.rejects(chooseBoaMissionReclamationOpportunity.run(request('boa', { ...choice, taskOpportunityId: 'D-2' })),
        /different inputs/);

      const send = async (type, fields = {}) => {
        const revision = (await missionRef.get()).get('revision');
        return commitAwayMissionLifecycleCommand.run(request('boa', { sessionId: id, missionId, requestId: `${type}-${revision}`,
          expectedRevision: revision, type, ...fields }));
      };
      const sendGm = async (type) => {
        const revision = (await missionRef.get()).get('revision');
        return commitAwayMissionLifecycleCommand.run(request('gm', { sessionId: id, missionId, instanceId: 'bridge',
          requestId: `${type}-${revision}`, expectedRevision: revision, type }));
      };
      await send('requestExtraCards', { count: 1 });
      await send('distributeExtraCard', { participantUid: 'boa', opportunityId: 'D-1' });
      await sendGm('openDiscards');
      await send('discardCard', { cardId: '10♥' });
      await send('assignCards', { placements: [{ cardId: '4♦', opportunityId: 'D-1' }] });
      const resolved = (await missionRef.get()).get('lifecycleRecord');
      assert.equal(resolved.status, 'resolved');
      const outcome = resolved.outcomes.find(entry => entry.opportunityId === 'D-1');
      assert.deepEqual({ total: outcome.total, difficulty: outcome.difficulty, outcome: outcome.outcome },
        { total: 8, difficulty: 7, outcome: 'success' });
      assert.deepEqual(resolved.rewards.find(entry => entry.opportunityId === 'D-1'),
        { opportunityId: 'D-1', branch: 'success', resources: { scrap: 1 }, effects: [], bulkHaulageApplied: false });

      const before = (await session.get()).get('shipResources.aegis');
      const deliveryRevision = (await missionRef.get()).get('revision');
      const delivery = request('boa', { sessionId: id, missionId, type: 'dropOff', requestId: 'deliver-once',
        expectedRevision: deliveryRevision, shipId: 'aegis' });
      const deliveries = await Promise.all([commitAwayMissionLifecycleCommand.run(delivery),
        commitAwayMissionLifecycleCommand.run(delivery)]);
      assert.deepEqual(new Set(deliveries.map(reply => reply.status)), new Set(['committed', 'replayed']));
      assert.deepEqual((await session.get()).get('shuttleCargo.boa'), { scrap: 3 });
      assert.deepEqual((await session.get()).get('shipResources.aegis'), before);
      const receipt = (await db.doc(`sessions/${id}/serverState/missionRewardDeliveries/receipts/${missionId}`).get()).data();
      assert.equal(receipt.boaScrapAwarded, 1);
      assert.deepEqual(receipt.boaScrapCargo, { scrap: 3 });
      assert.equal((await missionRef.get()).get('status'), 'complete');
    } finally { await db.recursiveDelete(session); }
  });

  test('a Boa choice whose Recycler is not dealt in lapses and stays visible to that Recycler', async () => {
    const id = `pc10-2-boa-lapse-${process.pid}`;
    const { session, coordinate, opportunityId, choiceRef } = await seedSession(id);
    try {
      const choice = { sessionId: id, requestId: 'boa-choice-lapse', missionOpportunityId: opportunityId,
        taskOpportunityId: 'D-1', expectedControlRevision: 1, expectedChoiceRevision: 0, expectedCycle: 2 };
      assert.equal((await chooseBoaMissionReclamationOpportunity.run(request('boa', choice))).status, 'committed');
      const deal = request('gm', { sessionId: id, instanceId: 'bridge', requestId: 'start-without-boa',
        expectedSetupRevision: 1, expectedPhaseRevision: 3, expectedCycle: 2, opportunityId, groupId: 'fleet-1',
        chart: 'A', coordinate, sourceCycle: 2, missionLeaderUid: 'captain', participantUids: ['captain'] });
      assert.equal((await dealPrivateInitialCards.run(deal)).status, 'committed');
      assert.deepEqual({ status: (await choiceRef.get()).get('status'), reason: (await choiceRef.get()).get('lapseReason') },
        { status: 'lapsed', reason: 'recycler-not-on-mission' });
      assert.equal((await db.doc(`sessions/${id}/missionStartSnapshots/${opportunityId}`).get()).exists, true);

      const workspace = await readBoaMissionReclamationWorkspace.run(request('boa', { sessionId: id }));
      assert.deepEqual(workspace.opportunities, []);
      assert.deepEqual(workspace.lapsedChoices.map(({ missionOpportunityId, taskOpportunityId, reason }) =>
        ({ missionOpportunityId, taskOpportunityId, reason })),
      [{ missionOpportunityId: opportunityId, taskOpportunityId: 'D-1', reason: 'recycler-not-on-mission' }]);
    } finally { await db.recursiveDelete(session); }
  });
}
