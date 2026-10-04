import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { createRequire } from 'node:module';
import { createPc07AuthenticatedSession } from './pc07-authenticated-session.mjs';

const evidencePath = process.env.PC09_P_PRODUCER_EVIDENCE_PATH;
assert.ok(evidencePath, 'Set an external evidence path for this disposable authenticated proof.');
const project = process.env.VITE_FIREBASE_PROJECT_ID;
assert.ok(project, 'Set VITE_FIREBASE_PROJECT_ID to the isolated demo project.');
const require = createRequire(new URL('../functions/package.json', import.meta.url));
const { getApps, initializeApp } = require('firebase-admin/app');
if (!getApps().length) initializeApp({ projectId: project });
const { getFirestore } = require('firebase-admin/firestore');
const evidence = {
  kind: 'pc09-normal-authenticated-p-station-producer-finalizer-repeat',
  fixtureChanges: [
    'normal authenticated local Auth/Firestore session and facilitator instance',
    'normal facilitator setup uses the printed 11-player roles including AEGIS Executive Officer, Wing Commander and PDF Colonel; Dione is absent from this printed roster',
    'Admin-only chart-B selection and isolated Team/Open Airspace clock acceleration',
    'GM enables the AEGIS console grant and records ordinary cycle-1 maintenance through callable choices',
    'GM uses ordinary repairAllShipDamage before attack for the typed AEGIS baseline and after source-driven maintenance hazard/riot damage before charging the five console choices',
    'GM moves AEGIS to chart-B P coordinate 1964 using moveShipToLocation; arrival pressure is produced by that handler',
    'no attack state, receipt, range result, finalization audit, P sequence, repeat plan, next window, or next preparation was seeded',
    'no dice or combat outcome was seeded; the AEGIS Executive Officer explicitly passed available range weapons',
  ],
  calls: [], checks: {}, actorsAndTokensRetained: false,
  sessionCleanup: 'recursiveDelete completed in finally',
};
let fixture;

async function call(actor, name, data = {}) {
  const reply = await fixture.call(actor, name, { sessionId: fixture.sessionId, ...data });
  evidence.calls.push({ name, status: reply.status === 200 ? (reply.result?.status ?? 'committed') : 'denied',
    ...(reply.error?.status ? { errorCode: reply.error.status } : {}) });
  return reply;
}

async function accepted(actor, name, data = {}) {
  const reply = await call(actor, name, data);
  assert.equal(reply.status, 200, `${name}: ${reply.error?.message ?? 'denied'}`);
  return reply.result;
}

async function waitForState(predicate, label, limit = 160) {
  const stateRef = fixture.db.doc(`sessions/${fixture.sessionId}/wolfAttackState/current`);
  for (let index = 0; index < limit; index += 1) {
    const snapshot = await stateRef.get();
    const state = snapshot.exists ? snapshot.data() : null;
    if (predicate(state)) return state;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`The normal P attack did not reach ${label}.`);
}

function withoutServerTimestamps(value) {
  const normalized = { ...value };
  delete normalized.updatedAt;
  delete normalized.createdAt;
  return normalized;
}

async function maintenanceCycleOne() {
  const { session, gm, instanceId } = fixture;
  const initial = await session.get();
  let revision = initial.get('maintenanceCycles')?.aegis?.revision ?? 0;
  for (const action of ['begin', 'storage', 'rations', 'unrest', 'riot', 'reactor', 'bays', 'bays', 'end']) {
    const result = await accepted(gm, 'runMaintenance', {
      instanceId, shipId: 'aegis', action, expectedRevision: revision, requestId: randomUUID(),
      ...(action === 'rations' ? { foodLevel: 3, waterLevel: 3 } : {}),
      ...(action === 'reactor' ? { consoles: [
        'fighter-bay-alpha', 'fighter-bay-bravo', 'command-and-control',
        'missile-launchers', 'point-defence-lasers',
      ] } : {}),
      ...(action === 'bays' ? { refuels: {} } : {}),
    });
    revision = result.cycle.revision;
    if (action === 'begin' || action === 'riot') {
      const damageRevision = (await session.get()).get('vesselActionRevisions')?.aegis ?? 0;
      const repair = await accepted(gm, 'repairAllShipDamage', {
        instanceId, requestId: randomUUID(), expectedRevision: damageRevision, shipId: 'aegis',
      });
      assert.equal(repair.repaired, true);
    }
  }
  assert.equal((await session.get()).get('maintenanceCycles').aegis.turn, 1);
}

async function openAirspaceCycleOne() {
  const { session, byRole } = fixture;
  const phase = (await session.get()).get('turnPhase');
  await session.update({ turnPhase: {
    ...phase,
    teamPhaseEndsAt: new Date(Date.now() - 1_000).toISOString(),
    openAirspaceEndsAt: new Date(Date.now() + 10 * 60_000).toISOString(),
  } });
  await accepted(byRole('wing-commander'), 'beginOpenAirspacePhase', { expectedTurn: 1 });
}

try {
  fixture = await createPc07AuthenticatedSession('PC09 normal authenticated P producer proof', 11, {
    keepAlive: true, clearBriefing: true,
  });
  const { db, session, sessionId, gm, instanceId, byRole } = fixture;
  const stateRef = db.doc(`sessions/${sessionId}/wolfAttackState/current`);
  const windowRef = db.doc(`sessions/${sessionId}/wolfAttackWindow/current`);
  const preparationRef = db.doc(`sessions/${sessionId}/wolfAttackPreparation/current`);
  const groupRef = db.doc(`sessions/${sessionId}/fleetGroups/fleet-1`);
  const pressureRef = db.doc(`sessions/${sessionId}/serverState/wolfArrivalPressure/groups/fleet-1`);

  await session.update({ chartId: 'B', chartSelectionLocked: true });
  const lease = (await db.doc(`sessions/${sessionId}/gmInstances/${instanceId}`).get()).data();
  const claimedAt = typeof lease.claimedAt === 'string' ? lease.claimedAt : lease.claimedAt.toDate().toISOString();
  await accepted(gm, 'setGmShipConsoleWriteGrant', {
    instanceId, shipId: 'aegis', enabled: true, claimedAt,
  });
  const damageRevision = (await session.get()).get('vesselActionRevisions')?.aegis ?? 0;
  const repair = await accepted(gm, 'repairAllShipDamage', {
    instanceId, requestId: randomUUID(), expectedRevision: damageRevision, shipId: 'aegis',
  });
  assert.equal(repair.repaired, true);
  assert.deepEqual((await session.get()).get('shipDamage').aegis, { damagedSystemIds: [], destroyed: false });
  await maintenanceCycleOne();
  await openAirspaceCycleOne();

  const moveRequestId = randomUUID();
  const currentRevision = (await session.get()).get('vesselActionRevisions')?.aegis ?? 0;
  const move = await accepted(gm, 'moveShipToLocation', {
    instanceId, requestId: moveRequestId, shipId: 'aegis', destination: '1964',
    expectedRevision: currentRevision,
  });
  const group = (await groupRef.get()).data();
  assert.ok(group.vesselIds.includes('aegis'));
  const pressure = (await pressureRef.get()).data();
  assert.equal(pressure.groupId, 'fleet-1');
  assert.equal(pressure.chart, 'B');
  assert.ok(pressure.entries.some((entry) => entry.siteCode === 'P' && entry.coordinate === '1964' &&
    entry.sourceShipId === 'aegis' && entry.status === 'operational'));
  const pressureEntry = pressure.entries.find((entry) => entry.siteCode === 'P' && entry.coordinate === '1964');
  const sourceId = `arrival-navigation-${moveRequestId}`;
  const scheduled = (await db.doc(`sessions/${sessionId}/wolfAttackPressure/${sourceId}`).get()).data();
  assert.equal(scheduled.siteCode, 'P');
  assert.equal(scheduled.groupId, 'fleet-1');
  assert.equal(scheduled.sourceTransitionId, `navigation-${moveRequestId}`);
  assert.deepEqual(scheduled.recurringUntil, ['allWolfForcesDestroyed']);
  evidence.checks.livePArrivalPressureProducedByAuthenticatedMovementHandler = true;

  const options = await accepted(gm, 'getWolfAttackThreatWindowOptions', {
    instanceId, targetGroupId: 'fleet-1',
  });
  const pSource = options.sources.find((source) => source.siteCode === 'P');
  assert.ok(pSource, 'The current active group option must expose the live P source.');
  assert.equal(pSource.sourceId, sourceId);
  const window = await accepted(gm, 'setWolfAttackWindow', {
    instanceId, requestId: randomUUID(), expectedRevision: 0, status: 'due',
    targetGroupId: 'fleet-1', threatSiteCode: 'P', threatSourceId: pSource.sourceId,
  });
  assert.equal(window.status, 'due');
  assert.equal(window.threatSiteCode, 'P');
  assert.equal(window.targetGroupId, 'fleet-1');

  const pForce = ['wolf-battlestation', ...Array(4).fill('wolf-strikecarrier')];
  const staged = await accepted(gm, 'stageWolfAttackPreparation', {
    instanceId, requestId: randomUUID(), expectedRevision: 0, turn: 1,
    shipIds: pForce, targetMode: 'pre-rolled', targetAssignments: [], modifiers: [], notes: '',
  });
  assert.equal(staged.compositionKind, 'P');
  assert.equal(staged.targetGroupId, 'fleet-1');
  assert.deepEqual(staged.shipIds, pForce);
  const firstAttack = await accepted(gm, 'declareWolfAttack', {
    instanceId, requestId: randomUUID(), expectedRevision: staged.revision,
  });
  assert.equal(firstAttack.status, 'committed');
  assert.equal(firstAttack.turn, 1);
  const declared = await waitForState((state) => state?.currentStep === 'targeting', 'Commander/targeting stage');
  assert.equal(declared.threatSiteCode, 'P');
  assert.equal(declared.targetGroupId, 'fleet-1');
  evidence.checks.sourceGroupPForceStagedAndDeclaredNormally = true;

  const eo = byRole('executive-officer');
  const commandControl = await accepted(eo, 'getAegisCommandAndControl', {});
  assert.equal(commandControl.eligible, true);
  const cncPassRequest = {
    requestId: randomUUID(), expectedTurn: 1, expectedRevision: commandControl.revision,
  };
  const cncPass = await accepted(eo, 'passAegisCommandAndControl', cncPassRequest);
  assert.equal(cncPass.view.reason, 'passed');
  await waitForState((state) =>
    state?.fighterLaunchChoices?.['pdf-escort-fighter-wing']?.status === 'unavailable',
  'source-driven unavailable PDF launch decision');
  const wingCommander = byRole('wing-commander');
  const wingPasses = [];
  for (const wingId of ['fighter-wing-alpha', 'fighter-wing-bravo']) {
    const launch = await accepted(wingCommander, 'getAegisFighterWingLaunch', { wingId });
    evidence.fighterWingLaunchViews ??= [];
    evidence.fighterWingLaunchViews.push({ wingId, eligible: launch.eligible, reason: launch.reason,
      turn: launch.turn, revision: launch.revision, wingRevision: launch.wingRevision, fighters: launch.fighters });
    assert.equal(launch.eligible, true, `${wingId} must have a legitimate current launch/pass choice.`);
    const pass = await accepted(wingCommander, 'passWolfFighterLaunchChoice', {
      requestId: randomUUID(), sourceId: wingId, expectedTurn: launch.turn,
      expectedRevision: launch.revision, expectedWingRevision: launch.wingRevision,
    });
    assert.equal(pass.choiceStatus, 'passed');
    wingPasses.push({ sourceId: wingId, choiceStatus: pass.choiceStatus });
  }
  evidence.wingLaunchChoices = wingPasses;
  evidence.checks.wingCommanderMadeBothEligibleLaunchChoicesNormally = true;
  const longRange = await waitForState((state) => state?.currentStep === 'long-range',
    'Long Range after Commander, C&C, and fighter-wing choices');
  assert.equal(longRange.battleTableCraftActions.some((action) => action.craftId === 'maliades'), false,
    'The disclosed printed 11-player role setup contains no Dione/Maliades registration.');
  assert.equal(longRange.battleTableCraftActions.some((action) =>
    action.craftId === 'pdf-escort-fighter-wing'), true,
  'The printed PDF Colonel owns a registered, source-gated launch choice for this declaration.');
  assert.equal(longRange.fighterLaunchChoices['pdf-escort-fighter-wing'].status, 'unavailable');

  const passedRanges = [];
  for (const range of ['long-range', 'medium-range', 'short-range']) {
    await waitForState((state) => state?.currentStep === range, range);
    const choice = await accepted(eo, 'getWolfRangeActionChoice', {});
    assert.equal(choice.range, range);
    assert.ok(choice.eligibleActions.length > 0,
      `The source-enabled AEGIS ${range} weapons should be offered for a real pass choice.`);
    const pass = await accepted(eo, 'commitWolfRangeActionChoice', {
      requestId: randomUUID(), expectedTurn: 1, expectedRevision: choice.revision,
      range, actionIds: [],
    });
    assert.equal(pass.choiceStatus, 'passed');
    passedRanges.push({ range, eligibleActions: choice.eligibleActions.map((action) => action.actionId), status: pass.choiceStatus });
  }
  evidence.passedRanges = passedRanges;
  evidence.checks.aegisExecutiveOfficerPassedEachSourceEnabledRangeNormally = true;

  const resolved = await waitForState((state) => state?.status === 'resolved' && state?.currentStep === 'resolved',
    'automatic P survivor finalization');
  const finalizationAuditRef = db.doc(`sessions/${sessionId}/wolfAttackState/current/audit/wolf-finalized-1`);
  const [storedWindow, storedPreparation, finalizationAudit] = await Promise.all([
    windowRef.get(), preparationRef.get(), finalizationAuditRef.get(),
  ]);
  const plan = resolved.pStationRepeat;
  assert.ok(plan && plan.status === 'repeat', 'The first P attack must produce a repeated survivor plan.');
  assert.equal(finalizationAudit.exists, true);
  assert.deepEqual(plan, finalizationAudit.get('pStationRepeat'),
    'The resolved state and immutable finalization record carry the identical producer plan.');
  assert.ok(resolved.calculationReceipt.survivingWolfShips.length > 0,
    'The normal first attack must leave at least one live P threat ship.');
  assert.ok(plan.survivors.length > 0);
  assert.deepEqual(withoutServerTimestamps(storedWindow.data()), plan.window,
    'Finalization atomically opens the next P window from the surviving source group.');
  assert.deepEqual(withoutServerTimestamps(storedPreparation.data()), plan.preparation,
    'Finalization atomically restages the exact complete live P survivor set.');
  assert.deepEqual(storedPreparation.get('shipIds'), plan.survivors.map((ship) => ship.shipId));
  assert.equal(storedPreparation.get('compositionKind'), 'p-station-repeat');
  assert.equal(storedWindow.get('targetGroupId'), 'fleet-1');
  assert.equal(storedWindow.get('threatSiteCode'), 'P');
  assert.equal(storedWindow.get('threatSourceId'), pSource.sourceId);
  assert.equal(plan.context.nextAttackNumber, 2);
  evidence.checks.normalPFinalizerAtomicallyStoresPlanAndExactSurvivorRoster = true;

  const secondPreparation = storedPreparation.data();
  const secondDeclaration = await accepted(gm, 'declareWolfAttack', {
    instanceId, requestId: randomUUID(), expectedRevision: secondPreparation.revision,
  });
  assert.equal(secondDeclaration.status, 'committed');
  const repeated = await waitForState((state) => state?.status === 'declared' && state?.attackNumber === 2,
    'same-cycle second P declaration');
  assert.equal(repeated.turn, 1);
  assert.equal(repeated.previousAttackId, resolved.attackId);
  assert.deepEqual(repeated.calculationReceipt.composition.shipIds, secondPreparation.shipIds);
  assert.equal(repeated.pStationSequence?.attackNumber, 2);
  assert.equal(repeated.threatSourceId, pSource.sourceId);
  assert.equal(repeated.targetGroupId, 'fleet-1');
  assert.equal((await session.get()).get('currentTurn'), 1);
  const audience = (await db.doc(`sessions/${sessionId}/wolfAttackAudience/current`).get()).data();
  assert.equal(Object.hasOwn(audience ?? {}, 'pStationSequence'), false);
  assert.equal(Object.hasOwn(audience ?? {}, 'threatSourceId'), false);
  assert.equal(Object.hasOwn(audience ?? {}, 'targetGroupId'), false);
  evidence.checks.authenticatedSecondSameCyclePDeclarationUsesAutomaticallyFinalizedSurvivors = true;
  evidence.checks.PSequenceAndThreatSourceRemainPrivate = true;
  evidence.sourceProducer = {
    movementHandler: 'moveShipToLocation', sourceId, sourceCycle: pressureEntry.cycle,
    groupId: pressureEntry.groupId, coordinate: pressureEntry.coordinate,
  };
  evidence.completedAt = new Date().toISOString();
  await mkdir(dirname(evidencePath), { recursive: true });
  await writeFile(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`);
  console.log('PC09 normal authenticated P producer, automatic finalization, and same-cycle repeat passed.');
} catch (error) {
  evidence.failure = error instanceof Error ? error.message : String(error);
  if (fixture) {
    const sessionData = (await fixture.session.get()).data();
    const attack = (await fixture.db.doc(
      `sessions/${fixture.sessionId}/wolfAttackState/current`,
    ).get()).data();
    evidence.failureSnapshot = {
      cycle: sessionData.currentTurn,
      phase: sessionData.turnPhase?.phase,
      activeRoleIds: sessionData.activeRoleIds,
      activeVesselIds: sessionData.activeVesselIds,
      aegisMaintenance: sessionData.maintenanceCycles?.aegis,
      battleTableCraftActions: sessionData.battleTableCraftActions,
      fighterWingCounts: sessionData.fighterWingCounts,
      roleOwners: (await fixture.db.collection(`sessions/${fixture.sessionId}/players`).get()).docs
        .filter((player) => player.get('role') === 'player')
        .map((player) => ({ role: player.get('assignedRoleId'), seat: player.get('seatId'), active: player.get('activeConsoleRoleId'),
          ship: player.get('shipId'), groupId: player.get('fleetGroupId') })),
      aegisDamage: sessionData.shipDamage?.aegis,
      attack: attack ? {
        status: attack.status, currentStep: attack.currentStep, revision: attack.revision,
        commanderRerollCompletion: attack.commanderRerollCompletion,
        targetingCompletion: attack.targetingCompletion,
        commandAndControl: attack.commandAndControl,
        commandAndControlPass: attack.commandAndControlPass,
        fighterLaunchChoices: attack.fighterLaunchChoices,
        aegisFighterWingState: attack.aegisFighterWingState,
        targetingReceipt: attack.calculationReceipt?.targeting,
        battleTableCraftActions: attack.battleTableCraftActions,
        forceFieldChoice: attack.forceFieldChoice,
      } : null,
    };
  }
  evidence.completedAt = new Date().toISOString();
  await mkdir(dirname(evidencePath), { recursive: true }).catch(() => {});
  await writeFile(`${evidencePath}.failure.json`, `${JSON.stringify(evidence, null, 2)}\n`).catch(() => {});
  throw error;
} finally {
  if (fixture) {
    await fixture.cleanup();
    await fixture.db.terminate();
  }
}
