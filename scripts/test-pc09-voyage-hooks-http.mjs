import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { createPc07AuthenticatedSession } from './pc07-authenticated-session.mjs';

const evidenceDirectory = process.env.PC09_VOYAGE_EVIDENCE_DIR;
assert.ok(evidenceDirectory, 'An external sanitized-evidence directory is required.');
await mkdir(evidenceDirectory, { recursive: true });

let fixture;
let activeStage = 'normal authenticated roster';

function requestId() { return randomUUID(); }

async function invoke(actor, name, data = {}) {
  const reply = await fixture.call(actor, name, { sessionId: fixture.sessionId, ...data });
  assert.equal(reply.status, 200, `${name} did not complete successfully.`);
  return reply.result;
}

function gmRequest(data = {}) {
  return { instanceId: fixture.instanceId, ...data };
}

async function transitionCrisis(crisis, state, expectedRevision, extra = {}) {
  return invoke(fixture.gm, 'transitionCrisis', gmRequest({
    requestId: requestId(), expectedRevision, crisisId: crisis.id,
    crisisKind: 'approaching-vessel', title: 'Approaching vessel',
    details: 'An arriving vessel requests admission to the fleet.', state, ...extra,
  }));
}

try {
  fixture = await createPc07AuthenticatedSession('PC09 authenticated Voyage hooks', 18, {
    keepAlive: true,
  });
  const sessionBefore = (await fixture.session.get()).data();
  assert.equal(sessionBefore.singlePlayerDemo, undefined);
  assert.ok(sessionBefore.activeVesselIds.includes('dione'), 'The ordinary roster must include an active Dione host.');
  assert.equal(sessionBefore.turnPhase.airspace.state, 'restricted', 'Docking and maintenance require Team Phase.');

  activeStage = 'current Approaching Vessel crisis and real admission';
  const crisisSnapshot = await fixture.db.doc(`sessions/${fixture.sessionId}/crisisState/current`).get();
  let revision = Number.isSafeInteger(crisisSnapshot.get('revision')) ? crisisSnapshot.get('revision') : 0;
  const crisis = { id: 'pc09-voyage-hooks-approach' };
  const draft = await transitionCrisis(crisis, 'draft', revision);
  revision = draft.revision;
  const delivered = await transitionCrisis(crisis, 'delivered', revision, { deliveryPressure: 'hold' });
  revision = delivered.revision;
  const debated = await transitionCrisis(crisis, 'debated', revision);

  const ruling = await invoke(fixture.gm, 'recordApproachingVesselResponse', gmRequest({
    requestId: requestId(), expectedCrisisRevision: debated.revision, expectedResponseRevision: 0,
    crisisId: crisis.id, vesselReality: 'real',
    responseChoices: ['wait-briefly-then-leave'], coordinationActions: ['security', 'medical'],
    responseInstructions: 'Wait briefly while the fleet prepares a safe reception.',
    rationale: 'Local test ruling: this is a real arrival.',
  }));
  assert.equal(ruling.vesselReality, 'real');
  const admissionRequest = {
    requestId: requestId(), expectedRevision: debated.revision, crisisId: crisis.id,
  };
  const admission = await invoke(fixture.gm, 'admitVoyage33', gmRequest(admissionRequest));
  assert.equal(admission.status, 'committed');
  const admissionRecord = (await fixture.db.doc(`sessions/${fixture.sessionId}/voyage33Admission/current`).get()).data();
  const admittedIds = (await fixture.session.get()).get('admittedVesselIds');
  assert.equal(admissionRecord.status, 'admitted');
  assert.equal(admissionRecord.population, 40_000);
  assert.deepEqual(admissionRecord.commitments, {
    requiresHostDocking: true, hostProvidesResources: true,
    maintenanceSteps: [1, 2, 3, 4], maxConsoleCharges: 1,
  });
  assert.ok(admittedIds.includes('voyage-33-0'));

  activeStage = 'admitted Voyage docking through the current P251 callable';
  const resourcesBeforeDock = (await fixture.session.get()).get('shipResources').dione;
  const dockRequest = gmRequest({
    requestId: requestId(), shipId: 'voyage-33-0', hostShipId: 'dione',
    expectedMovementRevision: 0, expectedDockingRevision: 0,
  });
  const dock = await invoke(fixture.gm, 'dockVoyage33', dockRequest);
  assert.equal(dock.status, 'committed');
  assert.equal(dock.shipId, 'voyage-33-0');
  assert.equal(dock.hostShipId, 'dione');
  assert.equal(dock.maintenanceState.hostShipId, 'dione');
  assert.equal(dock.maintenanceState.dockingRevision, 1);
  assert.equal(dock.maintenanceState.population, 40_000);
  assert.deepEqual((await fixture.session.get()).get('shipResources').dione, resourcesBeforeDock,
    'Docking records a host without taking its resources.');
  const dockReplay = await invoke(fixture.gm, 'dockVoyage33', dockRequest);
  assert.equal(dockReplay.status, 'replayed');
  assert.equal((await fixture.session.get()).get('voyage33Maintenance').dockingRevision, 1,
    'An exact docking retry does not advance the host binding twice.');

  activeStage = 'admitted and docked Voyage host-funded needs maintenance';
  const beginRequest = gmRequest({
    requestId: requestId(), shipId: 'voyage-33-0', action: 'begin',
    expectedRevision: dock.maintenanceState.cycle.revision,
    expectedDockingRevision: dock.maintenanceState.dockingRevision, expectedCycle: 1,
  });
  const begun = await invoke(fixture.gm, 'runVoyage33Maintenance', beginRequest);
  assert.equal(begun.status, 'committed');
  assert.equal(begun.result.state.hostShipId, 'dione');
  assert.equal(begun.result.state.population, 40_000);
  assert.equal(begun.result.state.unrest, 0);
  assert.equal(begun.cycle.turn, 1);

  const rationRequest = gmRequest({
    requestId: requestId(), shipId: 'voyage-33-0', action: 'rations',
    expectedRevision: begun.committedRevision, expectedDockingRevision: begun.currentDockingRevision,
    expectedCycle: 1, foodLevel: 1, waterLevel: 1,
  });
  const rations = await invoke(fixture.gm, 'runVoyage33Maintenance', rationRequest);
  assert.equal(rations.status, 'committed');
  assert.equal(rations.hostShipId, 'dione');
  assert.match(rations.result.state.cycle.results['1'], /Spent 4 food and 4 water from dione/);
  assert.equal(rations.result.hostResources.food, resourcesBeforeDock.food - 4);
  assert.equal(rations.result.hostResources.water, resourcesBeforeDock.water - 4);
  assert.equal(rations.result.state.population, 40_000);
  assert.equal(rations.result.state.unrest, 0);
  const rationReplay = await invoke(fixture.gm, 'runVoyage33Maintenance', rationRequest);
  assert.equal(rationReplay.status, 'replayed');
  assert.equal(rationReplay.result.state.cycle.revision, rations.result.state.cycle.revision);
  assert.deepEqual(rationReplay.result.hostResources, rations.result.hostResources,
    'An exact ration retry returns the committed host balance without another spend.');
  const sessionAfter = await fixture.session.get();
  assert.equal(sessionAfter.get('voyage33Maintenance').cycle.results['1'], rations.result.state.cycle.results['1']);
  assert.equal(sessionAfter.get('shipResources').dione.food, resourcesBeforeDock.food - 4);
  assert.equal(sessionAfter.get('shipResources').dione.water, resourcesBeforeDock.water - 4);

  const proof = {
    kind: 'normal-authenticated-local-emulator-voyage-hooks-http',
    sourceCommit: process.env.PC09_SOURCE_COMMIT ?? 'not-specified',
    checks: {
      currentApproachingVesselAdmittedThroughCallable: true,
      admissionCommitmentsEnterCurrentSessionRoster: true,
      admittedVoyageDocksThroughP251Callable: true,
      exactDockRetryPreservesHostBinding: true,
      admittedVoyageRunsP250MaintenanceWithHostFunding: true,
      exactRationRetryDoesNotSpendHostTwice: true,
    },
    outcome: {
      admittedPopulation: 40_000,
      admittedUnrest: 0,
      dockingCommitted: true,
      dockHost: 'dione',
      dockingRevision: 1,
      maintenanceAction: 'Team Phase rations (step 1 of 4)',
      hostResourcesSpent: { food: 4, water: 4 },
      maintenancePopulation: 40_000,
      maintenanceUnrest: 0,
      exactDockRetryStable: true,
      exactRationRetryStable: true,
    },
    setupDisclosure: {
      actorSource: 'Firebase Auth emulator signups; game actions use ordinary authenticated callable HTTP requests.',
      rosterSize: 18,
      localFacilitatorGrant: 'createPc07AuthenticatedSession grants local demo-project GM access to the normal Auth actor.',
      fixtureStateGrants: [],
      directGameplayWrites: false,
    },
    productionGameplay: false,
    identitiesAndTokensRetained: false,
    completedAt: new Date().toISOString(),
  };
  await writeFile(`${evidenceDirectory}/result.json`, `${JSON.stringify(proof, null, 2)}\n`);
  console.log('PC09 authenticated Voyage admission, docking, and needs hooks passed (6 checks).');
} catch (error) {
  await writeFile(`${evidenceDirectory}/failure.json`, `${JSON.stringify({
    kind: 'normal-authenticated-local-emulator-voyage-hooks-http', activeStage,
    errorType: error?.name ?? 'Error', errorCode: error?.code ?? null,
  }, null, 2)}\n`);
  console.error(`Voyage hook proof failed during ${activeStage}.`);
  process.exitCode = 1;
} finally {
  if (fixture) {
    try { await fixture.cleanup(); } catch { /* emulator teardown owns final cleanup */ }
  }
}
