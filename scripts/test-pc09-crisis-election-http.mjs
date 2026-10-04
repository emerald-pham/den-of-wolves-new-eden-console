import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { createPc07AuthenticatedSession } from './pc07-authenticated-session.mjs';

const evidenceDirectory = process.env.PC09_EVIDENCE_DIR;
const baseUrl = process.env.PC09_UI_URL;
assert.ok(evidenceDirectory && baseUrl, 'An external sanitized-evidence directory and local UI URL are required.');
assert.match(baseUrl, /^http:\/\/127\.0\.0\.1:\d+$/);
await mkdir(evidenceDirectory, { recursive: true });

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
const page = await context.newPage();
const browserErrors = [];
page.on('pageerror', error => browserErrors.push(error.message));
page.on('request', request => {
  const url = new URL(request.url());
  if (/firebase|firestore|identitytoolkit|securetoken|cloudfunctions|googleapis\.com/i.test(url.hostname)) {
    remoteFirebaseRequestOrigins.add(url.origin);
  }
});

let fixture;
const checks = {};
const governanceReturnChecks = [];
const pregameSettingsChecks = [];
const remoteFirebaseRequestOrigins = new Set();
const commandNames = [];
let activeStage = 'browser setup';
const setupDisclosure = {
  actorSource: 'Firebase Auth emulator signups; all game actions use ordinary authenticated callable HTTP requests.',
  rosterSize: 18,
  localFacilitatorGrant: 'createPc07AuthenticatedSession grants local demo-project GM access to the normal Auth actor.',
  clockAcceleration: [],
  fixtureStateGrants: [],
  facilitatorScenarioChoices: [],
  visitAttestation: 'The Coordination visit is a digital callable record; no physical visit is attested.',
};

const pregameSettingsNote = 'Awaiting CIC authentication means waiting for the GM to start the game.';

async function inspectPregameSettings() {
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  const settings = page.getByRole('dialog', { name: 'Session settings', exact: true });
  await settings.waitFor();
  const note = settings.getByText(pregameSettingsNote, { exact: true });
  await note.waitFor();
  for (const [width, height] of [[390, 844], [844, 390], [1440, 900]]) {
    await page.setViewportSize({ width, height });
    await note.scrollIntoViewIfNeeded();
    const rect = await note.evaluate(element => {
      const box = element.getBoundingClientRect();
      return { left: box.left, right: box.right, top: box.top, bottom: box.bottom, width: box.width, height: box.height };
    });
    assert.ok(rect.width > 0 && rect.height > 0, `Cycle 0 Settings guidance has visible geometry at ${width}x${height}.`);
    assert.ok(rect.left >= 0 && rect.right <= width, `Cycle 0 Settings guidance is not horizontally clipped at ${width}x${height}.`);
    await page.screenshot({ path: `${evidenceDirectory}/pregame-settings-${width}x${height}.png`, fullPage: true });
    pregameSettingsChecks.push({ width, height, guidanceVisible: true, noHorizontalClipping: true });
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Close settings', exact: true }).click();
}

async function joinThroughUi(joinCode) {
  await page.goto(baseUrl);
  const reduceMotion = page.getByRole('button', { name: /^REDUCED MOTION/i });
  if (await reduceMotion.count()) await reduceMotion.click();
  await page.getByRole('textbox', { name: 'Session code', exact: true }).fill(joinCode);
  await page.getByRole('button', { name: 'Join a session', exact: true }).click();
  const waiver = page.getByRole('dialog', { name: 'CODE OF CONDUCT', exact: true });
  await waiver.waitFor();
  for (const checkbox of await waiver.getByRole('checkbox', { name: /^Acknowledge regulation/ }).all()) {
    await checkbox.check();
  }
  const acknowledge = waiver.getByRole('button', { name: 'Acknowledge regulations and continue', exact: true });
  await acknowledge.and(page.locator(':enabled')).waitFor();
  await acknowledge.click();
  await page.waitForFunction(async () => {
    const { useSessionStore } = await import('/src/store/useSessionStore.ts');
    const state = useSessionStore.getState();
    return Boolean(state.me && state.session);
  });
  await inspectPregameSettings();
  return page.evaluate(async () => {
    const { auth } = await import('/src/lib/firebase.ts');
    return { localId: auth().currentUser.uid, idToken: await auth().currentUser.getIdToken() };
  });
}

function requestId() { return randomUUID(); }

async function invoke(actor, name, data = {}, label = name) {
  const reply = await fixture.call(actor, name, { sessionId: fixture.sessionId, ...data });
  assert.equal(reply.status, 200, `${label}: ${reply.error?.message ?? 'callable failed'}`);
  commandNames.push(name);
  return reply.result;
}

async function denied(actor, name, data = {}, label = name) {
  const reply = await fixture.call(actor, name, { sessionId: fixture.sessionId, ...data });
  assert.notEqual(reply.status, 200, `${label} unexpectedly committed.`);
  assert.ok(['FAILED_PRECONDITION', 'PERMISSION_DENIED', 'INVALID_ARGUMENT', 'NOT_FOUND'].includes(reply.error?.status),
    `${label} returned an unexpected error class: ${reply.error?.status}`);
  return reply.error.status;
}

function gmRequest(data = {}) {
  return { instanceId: fixture.instanceId, ...data };
}

async function member(actor) {
  return (await invoke(actor, 'resumeSession')).session;
}

async function firestoreRequest(actor, path, { method = 'GET', body, mask } = {}) {
  const url = new URL(`http://127.0.0.1:${fixture.config.firestorePort}/v1/projects/${fixture.project}/databases/(default)/documents/${path}`);
  if (mask) url.searchParams.set('updateMask.fieldPaths', mask);
  return fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${actor.idToken}`,
      'Content-Type': 'application/json',
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}

async function transitionCrisis({ crisisId, crisisKind, title, details, state, expectedRevision, extra = {} }) {
  return invoke(fixture.gm, 'transitionCrisis', gmRequest({
    requestId: requestId(), expectedRevision, crisisId, crisisKind, title, details, state, ...extra,
  }));
}

async function openCrisis(crisisId, crisisKind, title, details, {
  pressure = 'hold', deliveryExtra = {}, configurationOverride,
} = {}) {
  const current = (await fixture.db.doc(`sessions/${fixture.sessionId}/crisisState/current`).get()).data();
  const revision = Number.isSafeInteger(current?.revision) ? current.revision : 0;
  const draft = await transitionCrisis({ crisisId, crisisKind, title, details, state: 'draft', expectedRevision: revision,
    extra: configurationOverride ? { configurationOverride } : {} });
  assert.equal(draft.state, 'draft');
  const delivered = await transitionCrisis({ crisisId, crisisKind, title, details, state: 'delivered',
    expectedRevision: draft.revision, extra: {
      deliveryPressure: pressure,
      ...(configurationOverride ? { configurationOverride } : {}),
      ...deliveryExtra,
    } });
  assert.equal(delivered.deliveryPressure, pressure);
  const debated = await transitionCrisis({ crisisId, crisisKind, title, details, state: 'debated',
    expectedRevision: delivered.revision });
  assert.equal(debated.state, 'debated');
  return { crisisId, crisisKind, title, details, delivered, debated };
}

async function resolveClose(crisis, { formalTitle, formalDetails } = {}) {
  const resolutionRequest = gmRequest({
    requestId: requestId(), expectedRevision: crisis.debated.revision, crisisId: crisis.crisisId,
    crisisKind: crisis.crisisKind, title: crisis.title, details: crisis.details, state: 'resolved',
    ...(formalTitle ? { formalAnnouncement: { title: formalTitle, details: formalDetails } } : {}),
  });
  const capitalBefore = (await fixture.session.get()).get('politicalCapital');
  const first = await invoke(fixture.gm, 'transitionCrisis', resolutionRequest);
  assert.equal(first.state, 'resolved');
  const outcomeBeforeReplay = (await fixture.db.doc(`sessions/${fixture.sessionId}/crisisOutcomes/${crisis.crisisId}`).get()).data();
  const capitalAfterFirst = (await fixture.session.get()).get('politicalCapital');
  const replay = await invoke(fixture.gm, 'transitionCrisis', resolutionRequest, 'exact crisis-resolution retry');
  assert.deepEqual(replay, first);
  assert.deepEqual((await fixture.session.get()).get('politicalCapital'), capitalAfterFirst,
    'An exact crisis-resolution retry must not grant capital twice.');
  assert.deepEqual((await fixture.db.doc(`sessions/${fixture.sessionId}/crisisOutcomes/${crisis.crisisId}`).get()).data(), outcomeBeforeReplay);
  const announced = await transitionCrisis({ crisisId: crisis.crisisId, crisisKind: crisis.crisisKind,
    title: crisis.title, details: crisis.details, state: 'announced', expectedRevision: first.revision });
  const closed = await transitionCrisis({ crisisId: crisis.crisisId, crisisKind: crisis.crisisKind,
    title: crisis.title, details: crisis.details, state: 'closed', expectedRevision: announced.revision });
  assert.equal(closed.state, 'closed');
  const outcome = (await fixture.db.doc(`sessions/${fixture.sessionId}/crisisOutcomes/${crisis.crisisId}`).get()).data();
  return {
    outcome,
    capitalBefore: capitalBefore?.balance ?? 0,
    capitalAfter: capitalAfterFirst?.balance ?? 0,
    retryStable: true,
  };
}

async function ordinaryMemberPrivacyProof(actor, uid, chosenInstructions) {
  const publicReport = await firestoreRequest(actor, `sessions/${fixture.sessionId}/crisisReports/current`);
  assert.equal(publicReport.status, 200, 'Ordinary members may read the safe crisis report.');
  const report = await publicReport.json();
  const reportText = JSON.stringify(report);
  assert.match(reportText, /increase urgency/i, 'The selected delivery pressure is visible in the report.');
  assert.ok(reportText.includes(chosenInstructions), 'Chosen vessel instructions reach ordinary members.');
  assert.doesNotMatch(reportText, /vesselReality|rationale|private facilitator/i);

  const response = await firestoreRequest(actor, `sessions/${fixture.sessionId}/approachingVesselResponses/current`);
  assert.equal(response.status, 403, 'Rules deny the ordinary member direct access to hidden vessel truth.');
  const ballot = await firestoreRequest(actor,
    `sessions/${fixture.sessionId}/presidentialElections/current/ballots/${uid}`);
  assert.equal(ballot.status, 403, 'Rules deny the ordinary member direct access to secret ballots.');
  const ballotWrite = await firestoreRequest(actor,
    `sessions/${fixture.sessionId}/presidentialElections/current/ballots/${uid}`, {
      method: 'PATCH', mask: 'ballot', body: { fields: { ballot: { mapValue: { fields: {
        presidentUid: { stringValue: 'forged' },
      } } } } },
    });
  assert.equal(ballotWrite.status, 403, 'Rules deny direct client creation of a ballot.');
  const rootWrite = await firestoreRequest(actor, `sessions/${fixture.sessionId}`, {
    method: 'PATCH', mask: 'currentTurn', body: { fields: { currentTurn: { integerValue: '99' } } },
  });
  assert.equal(rootWrite.status, 403, 'Rules deny direct writes to the authoritative session root.');
  checks.safeCrisisReportAndPrivateDataRules = true;
  checks.secretBallotReadWriteAndSessionRootRules = true;
  return { reportSafe: true, hiddenResponseReadDenied: true, ballotReadDenied: true,
    ballotWriteDenied: true, sessionWriteDenied: true };
}

async function currentBrowserIdentity() {
  return page.evaluate(async () => {
    const [{ useSessionStore }, { auth }] = await Promise.all([
      import('/src/store/useSessionStore.ts'), import('/src/lib/firebase.ts'),
    ]);
    const state = useSessionStore.getState();
    return {
      uid: state.me?.uid ?? null,
      sessionId: state.session?.id ?? null,
      authenticatedUid: auth().currentUser?.uid ?? null,
      hash: window.location.hash,
    };
  });
}

async function checkGovernanceBackRoute({ route, heading, actorUid, width, height, onOpen }) {
  const errorsBefore = browserErrors.length;
  await page.setViewportSize({ width, height });
  await page.goto(`${baseUrl}/#/${route}`);
  await page.getByRole('heading', { name: heading, exact: true, level: 1 }).waitFor({ timeout: 30000 });
  const identityBefore = await currentBrowserIdentity();
  assert.equal(identityBefore.uid, actorUid, `${route} route retains the joined player identity.`);
  assert.equal(identityBefore.authenticatedUid, actorUid, `${route} route retains Firebase Auth identity.`);
  assert.equal(identityBefore.sessionId, fixture.sessionId, `${route} route retains the current session.`);
  if (onOpen) await onOpen();

  const back = page.getByRole('link', { name: 'Back to stations', exact: true });
  await back.waitFor({ state: 'visible' });
  const target = await back.evaluate(element => {
    const rect = element.getBoundingClientRect();
    return { height: rect.height, left: rect.left, right: rect.right, width: rect.width };
  });
  assert.ok(target.width > 0 && target.height >= 44, `${route} Back to stations target is at least 44px high.`);
  assert.ok(target.left >= 0 && target.right <= width,
    `${route} Back to stations target is not horizontally clipped at ${width}px.`);
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth),
    `${route} route has no horizontal page overflow at ${width}px.`);
  await page.screenshot({ path: `${evidenceDirectory}/${route}-${width}x${height}-before-back.png`, fullPage: true });

  await back.focus();
  assert.ok(await back.evaluate(element => document.activeElement === element),
    `${route} Back to stations receives keyboard focus.`);
  await page.keyboard.press('Enter');
  await page.waitForURL(url => url.hash === '#/console', { timeout: 30000 });
  await page.locator('main.fleet-roster').waitFor({ timeout: 30000 });
  const identityAfter = await currentBrowserIdentity();
  assert.equal(identityAfter.hash, '#/console');
  assert.equal(identityAfter.uid, actorUid, `${route} return retains the joined player identity.`);
  assert.equal(identityAfter.authenticatedUid, actorUid, `${route} return retains Firebase Auth identity.`);
  assert.equal(identityAfter.sessionId, fixture.sessionId, `${route} return retains the current session.`);
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth),
    `The returned console has no horizontal page overflow at ${width}px.`);
  assert.deepEqual(browserErrors.slice(errorsBefore), [], `${route} route and return produce no page errors.`);
  governanceReturnChecks.push({ route, width, height, backTargetHeight: target.height,
    returnedToConsole: true, retainedIdentity: true, noHorizontalClipping: true, pageErrors: 0 });
}

try {
  activeStage = 'normal authenticated roster and ordinary browser join';
  fixture = await createPc07AuthenticatedSession('PC09 normal crisis and election proof', 18, {
    keepAlive: true,
    browserRoleId: 'icebreaker-captain',
    joinBrowserPlayer: joinThroughUi,
  });
  await page.waitForFunction(async () => {
    const { useSessionStore } = await import('/src/store/useSessionStore.ts');
    return Number(useSessionStore.getState().session?.currentTurn) >= 1;
  }, undefined, { timeout: 30000 });
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  const activeSettings = page.getByRole('dialog', { name: 'Session settings', exact: true });
  await activeSettings.waitFor();
  assert.equal(await activeSettings.getByText(pregameSettingsNote, { exact: true }).count(), 0,
    'Cycle 0 Settings guidance disappears after the ordinary GM starts Cycle 1.');
  await page.screenshot({ path: `${evidenceDirectory}/cycle1-settings-no-pregame-guidance-390x844.png`, fullPage: true });
  await page.getByRole('button', { name: 'Close settings', exact: true }).click();
  checks.pregameSettingsGuidanceGeometryAndCycle1Removal = true;
  const president = fixture.byRole('dione-president');
  const captain = fixture.byRole('icebreaker-captain');
  const scientist = fixture.byRole('shepherd-scientist');
  const admiral = fixture.byRole('admiral');
  const explorer = fixture.byRole('quellon-explorer');
  assert.ok(president && captain && scientist && admiral && explorer,
    'The ordinary 18-person roster includes five authenticated electoral roles from distinct ships.');
  const originalRoot = (await fixture.session.get()).data();
  assert.equal(originalRoot.singlePlayerDemo, undefined, 'The scenario must use a normal roster, never the single-player demo.');

  const voterUids = [president.localId, captain.localId, scientist.localId, admiral.localId, explorer.localId];
  const policy = {
    eligibleVoterUids: voterUids,
    votingSystem: 'plurality',
    populationWeighting: 'ship-population',
    openCycle: 1,
    closeCycle: 1,
    vicePresidentEnabled: true,
    campaigning: 'structured',
    supplyUse: 'prohibited',
    campaignInstructions: 'One short statement per candidate. No fleet supplies may be used.',
    tieRule: 'facilitator-choice',
  };
  activeStage = 'pre-ballot election policy';
  const electionPolicy = await invoke(fixture.gm, 'configurePresidentialElection', gmRequest({
    requestId: requestId(), expectedRevision: 0, policy,
  }));
  assert.equal(electionPolicy.state, 'scheduled');
  assert.equal(electionPolicy.policy.populationWeighting, 'ship-population');
  assert.equal(electionPolicy.policy.campaigning, 'structured');
  assert.equal(electionPolicy.policy.supplyUse, 'prohibited');
  assert.equal(electionPolicy.policy.tieRule, 'facilitator-choice');
  assert.deepEqual(new Set(electionPolicy.policy.eligibleVoterUids), new Set(voterUids));
  checks.electionPolicyFrozenBeforeBallots = true;

  const electionStored = (await fixture.db.doc(`sessions/${fixture.sessionId}/presidentialElections/current`).get()).data();
  const candidateIdFor = uid => electionStored.candidateIdsByUid[uid];
  const ballots = [
    { actor: president, presidentCandidateId: candidateIdFor(captain.localId), vicePresidentCandidateId: candidateIdFor(explorer.localId) },
    { actor: captain, presidentCandidateId: candidateIdFor(scientist.localId), vicePresidentCandidateId: candidateIdFor(captain.localId) },
    { actor: scientist, presidentCandidateId: candidateIdFor(explorer.localId), vicePresidentCandidateId: candidateIdFor(captain.localId) },
    { actor: admiral, presidentCandidateId: candidateIdFor(captain.localId), vicePresidentCandidateId: candidateIdFor(scientist.localId) },
    { actor: explorer, presidentCandidateId: candidateIdFor(admiral.localId), vicePresidentCandidateId: candidateIdFor(captain.localId) },
  ];
  activeStage = 'normal authenticated secret ballots and server tally';
  const firstBallotData = { sessionId: fixture.sessionId, requestId: requestId(), expectedRevision: 1,
    presidentCandidateId: ballots[0].presidentCandidateId, vicePresidentCandidateId: ballots[0].vicePresidentCandidateId };
  const firstBallot = await invoke(president, 'castPresidentialBallot', firstBallotData);
  assert.equal(firstBallot.status, 'committed');
  assert.equal(Object.hasOwn(firstBallot, 'ballot'), false, 'The voter receives no ballot contents.');
  assert.equal(Object.hasOwn(firstBallot, 'presidentUid'), false, 'The voter receives no identity-mapped vote.');
  const ballotReplay = await invoke(president, 'castPresidentialBallot', firstBallotData, 'exact secret-ballot retry');
  assert.deepEqual(ballotReplay, firstBallot);
  await denied(president, 'castPresidentialBallot', { requestId: requestId(), expectedRevision: 1,
    presidentCandidateId: ballots[1].presidentCandidateId,
    vicePresidentCandidateId: ballots[1].vicePresidentCandidateId }, 'second ballot replacement attempt');
  for (const ballot of ballots.slice(1)) {
    const result = await invoke(ballot.actor, 'castPresidentialBallot', {
      requestId: requestId(), expectedRevision: 1,
      presidentCandidateId: ballot.presidentCandidateId,
      vicePresidentCandidateId: ballot.vicePresidentCandidateId,
    });
    assert.equal(result.status, 'committed');
    assert.equal(Object.hasOwn(result, 'ballot'), false);
  }
  const memberBeforeResolve = await member(captain);
  assert.equal(memberBeforeResolve.currentMemberBallotSubmitted, true);
  assert.doesNotMatch(JSON.stringify(memberBeforeResolve), /candidateIdsByUid|voterShipIds|ballot\s*:/,
    'The ordinary member projection reveals neither ballot contents nor private voter mappings.');
  checks.oneSecretBallotPerEligibleActorAndMemberProjection = true;

  const populationByRole = {
    admiral: Number(originalRoot.shipSurvivors.aegis),
    'dione-president': Number(originalRoot.shipSurvivors.dione),
    'icebreaker-captain': Number(originalRoot.shipSurvivors.icebreaker),
    'shepherd-scientist': Number(originalRoot.shipSurvivors.shepherd),
    'quellon-explorer': Number(originalRoot.shipSurvivors.quellon),
  };
  assert.ok(Object.values(populationByRole).every(value => Number.isSafeInteger(value) && value > 0));

  activeStage = 'Approaching Vessel delivery, private ruling, and Voyage admission';
  const approach = await openCrisis('pc09-approaching-vessel', 'approaching-vessel', 'Approaching vessel',
    'A fatigued pilot reported an arriving vessel and stopped responding.', { pressure: 'increase' });
  const deliveredReport = (await fixture.db.doc(`sessions/${fixture.sessionId}/crisisReports/current`).get()).data();
  assert.equal(deliveredReport.deliveryPressure, 'increase');
  assert.match(deliveredReport.body, /increase urgency/i);
  assert.doesNotMatch(JSON.stringify(deliveredReport), /vesselReality|rationale|hidden/i);

  const responseData = {
    requestId: requestId(), expectedCrisisRevision: approach.debated.revision,
    expectedResponseRevision: 0, crisisId: approach.crisisId, vesselReality: 'real',
    responseChoices: ['wait-briefly-then-leave'], coordinationActions: ['security', 'medical'],
    responseInstructions: 'Wait briefly while security and medical teams prepare to receive the vessel.',
    rationale: 'Local scenario ruling: this is a real arrival; the short wait allows safe reception.',
  };
  const vesselResponse = await invoke(fixture.gm, 'recordApproachingVesselResponse', gmRequest(responseData));
  assert.equal(vesselResponse.vesselReality, 'real');
  assert.deepEqual(vesselResponse.responseChoices, ['wait-briefly-then-leave']);
  assert.equal(Object.hasOwn(vesselResponse, 'rationale'), false);
  const approachReport = (await fixture.db.doc(`sessions/${fixture.sessionId}/crisisReports/current`).get()).data();
  assert.equal(approachReport.approachingVesselResponse.responseInstructions, responseData.responseInstructions);
  assert.equal(Object.hasOwn(approachReport.approachingVesselResponse, 'vesselReality'), false);
  assert.equal(Object.hasOwn(approachReport.approachingVesselResponse, 'rationale'), false);
  await ordinaryMemberPrivacyProof(captain, captain.localId, responseData.responseInstructions);
  const admissionData = { requestId: requestId(), expectedRevision: approach.debated.revision, crisisId: approach.crisisId };
  const admission = await invoke(fixture.gm, 'admitVoyage33', gmRequest(admissionData));
  const arrivalRef = fixture.db.doc(`sessions/${fixture.sessionId}/voyage33Arrival/current`);
  const arrivalBeforeRetry = (await arrivalRef.get()).data();
  const arrivalAuditBeforeRetry = await fixture.db.collection(`sessions/${fixture.sessionId}/voyage33Arrival/current/audit`).get();
  const admissionReplay = await invoke(fixture.gm, 'admitVoyage33', gmRequest(admissionData), 'exact Voyage admission retry');
  assert.deepEqual(admissionReplay, admission);
  const voyageAdmission = (await fixture.db.doc(`sessions/${fixture.sessionId}/voyage33Admission/current`).get()).data();
  const voyageArrival = (await arrivalRef.get()).data();
  const arrivalAuditAfterRetry = await fixture.db.collection(`sessions/${fixture.sessionId}/voyage33Arrival/current/audit`).get();
  assert.deepEqual(voyageArrival, arrivalBeforeRetry);
  assert.equal(arrivalAuditAfterRetry.size, arrivalAuditBeforeRetry.size);
  assert.equal(voyageAdmission.status, 'admitted');
  assert.equal(voyageAdmission.population, 40_000);
  assert.deepEqual(voyageAdmission.commitments, { requiresHostDocking: true, hostProvidesResources: true,
    maintenanceSteps: [1, 2, 3, 4], maxConsoleCharges: 1 });
  assert.equal(voyageArrival.admissionRequestId, admissionData.requestId);
  assert.ok(Array.isArray(voyageArrival.motivatedRoleIds));
  assert.deepEqual(new Set(voyageArrival.motivatedRoleIds), new Set([
    'refinery-124-captain', 'refinery-124-engineer', 'refinery-124-pdf-colonel',
  ]));
  assert.equal(new Set(voyageArrival.motivatedRoleIds).size, voyageArrival.motivatedRoleIds.length);
  const motivatedBriefs = await Promise.all(voyageArrival.motivatedRoleIds.map(roleId =>
    fixture.db.collection(`sessions/${fixture.sessionId}/roleBriefs`).get().then(snapshot =>
      snapshot.docs.find(doc => doc.get('roleId') === roleId))));
  assert.ok(motivatedBriefs.every(brief => brief?.get('voyage33Motivation')),
    'Each activated motivated-role hook has a current private brief.');
  assert.deepEqual((await fixture.session.get()).get('admittedVesselIds').includes('voyage-33-0'), true);
  const approachingOutcome = await resolveClose(approach, {
    formalTitle: 'Voyage 33-0 admitted', formalDetails: 'The real vessel was admitted after the fleet recorded a response.',
  });
  assert.equal(approachingOutcome.capitalAfter, approachingOutcome.capitalBefore + 1);
  assert.equal(approachingOutcome.outcome.capitalApplied, true);
  assert.equal(approachingOutcome.outcome.capitalDelta, 1);
  checks.currentGmDeliveryPressureAndRealVesselRuling = true;
  checks.voyage33AdmissionActivationAndExactRetry = true;
  checks.firstCrisisAutomaticCapitalAndExactRetry = true;
  const responseAfterResolution = await member(captain);
  assert.equal(responseAfterResolution.resolvedCrisisOutcome.capitalDelta, 1);
  assert.doesNotMatch(JSON.stringify(responseAfterResolution), /vesselReality|private rationale|rationale/);
  const memberDirectRoot = await firestoreRequest(captain, `sessions/${fixture.sessionId}`);
  assert.equal(memberDirectRoot.status, 403);
  checks.authoritativeSessionRootDirectReadDenied = true;

  activeStage = 'Disease Outbreak quarantine and legal resolution';
  const disease = await openCrisis('pc09-disease-outbreak', 'disease-outbreak', 'Disease outbreak',
    'A contagious illness has appeared among the fleet.', {
      pressure: 'hold',
      deliveryExtra: { diseaseOutbreak: { affectedShipIds: ['dione'],
        workRestrictions: 'Separate symptomatic crews from shared work areas.',
        escalationRisk: 'The illness may spread if close contact continues.' } },
    });
  const quarantine = await invoke(fixture.gm, 'setDiseaseQuarantine', gmRequest({ requestId: requestId(),
    action: 'activate', expectedCrisisRevision: disease.debated.revision, expectedQuarantineRevision: 0 }));
  assert.equal(quarantine.action, 'activate');
  const diseaseResolved = await invoke(fixture.gm, 'transitionCrisis', gmRequest({ requestId: requestId(),
    expectedRevision: disease.debated.revision, crisisId: disease.crisisId, crisisKind: disease.crisisKind,
    title: disease.title, details: disease.details, state: 'resolved',
    formalAnnouncement: { title: 'Outbreak response', details: 'Quarantine guidance is in force for affected crews.' } }));
  assert.equal(diseaseResolved.status, 'committed');
  const quarantineRelease = await invoke(fixture.gm, 'setDiseaseQuarantine', gmRequest({ requestId: requestId(),
    action: 'release', expectedCrisisRevision: diseaseResolved.revision, expectedQuarantineRevision: quarantine.revision }));
  assert.equal(quarantineRelease.action, 'release');
  const diseaseClosedAnnounced = await transitionCrisis({ crisisId: disease.crisisId, crisisKind: disease.crisisKind,
    title: disease.title, details: disease.details, state: 'announced', expectedRevision: diseaseResolved.revision });
  const diseaseClosed = await transitionCrisis({ crisisId: disease.crisisId, crisisKind: disease.crisisKind,
    title: disease.title, details: disease.details, state: 'closed', expectedRevision: diseaseClosedAnnounced.revision });
  assert.equal(diseaseClosed.state, 'closed');
  checks.diseaseOutbreakQuarantineAndLegalResolution = true;

  activeStage = 'Religious Zealotry response and legal resolution';
  const stateNow = (await fixture.session.get()).data();
  const hasArbourRole = stateNow.universalArbourEnabled === true || stateNow.wolfCultEnabled === true;
  const zealotryAdaptation = hasArbourRole ? undefined
    : 'Facilitator adaptation for this normal-roster scenario: record the movement response without an enabled Universal Arbour loyalty.';
  const zealotry = await openCrisis('pc09-religious-zealotry', 'religious-zealotry', 'Religious zealotry',
    'A growing religious movement asks the fleet to consider its influence.', {
      pressure: 'hold',
      ...(zealotryAdaptation ? { configurationOverride: zealotryAdaptation } : {}),
    });
  if (zealotryAdaptation) setupDisclosure.facilitatorScenarioChoices.push(zealotryAdaptation);
  const zealotryResponse = await invoke(fixture.gm, 'recordZealotryResponse', gmRequest({ requestId: requestId(),
    expectedRevision: zealotry.debated.revision, crisisId: zealotry.crisisId,
    actions: ['pressure'], rationale: 'Facilitator chooses additional scrutiny while preserving an open team discussion.' }));
  assert.deepEqual(zealotryResponse.actions, ['pressure']);
  const zealotryOutcome = await resolveClose(zealotry, {
    formalTitle: 'Movement response recorded', formalDetails: 'The facilitator recorded additional scrutiny and a continuing team discussion.',
  });
  assert.equal(zealotryOutcome.outcome.capitalDelta, 1);
  checks.zealotryResponseAndLegalResolution = true;

  activeStage = 'Civil Unrest grievance and legal resolution';
  const unrest = await openCrisis('pc09-civil-unrest', 'civil-unrest', 'Civil unrest',
    'Teams may submit grievances and the facilitator will record a response.', { pressure: 'decrease' });
  const grievance = await invoke(captain, 'submitCivilUnrestGrievance', { requestId: requestId(),
    crisisId: unrest.crisisId, expectedCrisisRevision: unrest.debated.revision,
    expectedGrievanceRevision: 0, affectedShipId: 'icebreaker', visibility: 'private',
    text: 'The crew asks for clearer consultation on its local conditions.' });
  assert.equal(grievance.shipId, 'icebreaker');
  const unrestDebated = await member(captain);
  assert.doesNotMatch(JSON.stringify(unrestDebated), /The crew asks for clearer consultation/,
    'A private team grievance is not copied into the ordinary session projection.');
  const foreignGrievanceRead = await firestoreRequest(president,
    `sessions/${fixture.sessionId}/civilUnrestGrievances/icebreaker`);
  assert.equal(foreignGrievanceRead.status, 403);
  const unrestResolution = await invoke(fixture.gm, 'recordCivilUnrestResolution', gmRequest({ requestId: requestId(),
    expectedRevision: unrest.debated.revision, crisisId: unrest.crisisId,
    presidentResponse: 'The facilitator records that the fleet will hear the grievance.',
    consequence: 'The team may continue its current duties while its request is reviewed.',
    rationale: 'Keep the private grievance detail within the team and facilitator audience.' }));
  assert.equal(unrestResolution.status, 'committed');
  assert.equal(unrestResolution.grievanceRevisions.find(item => item.shipId === 'icebreaker').revision, grievance.revision);
  const unrestOutcome = await resolveClose(unrest, {
    formalTitle: 'Civil Unrest response', formalDetails: 'The fleet has recorded a response to team concerns.',
  });
  assert.equal(unrestOutcome.outcome.capitalDelta, 1);
  checks.privateTeamGrievanceRecordedAndLegalResolution = true;

  activeStage = 'Presidential Election crisis outcome and capital cap';
  const electionCrisis = await openCrisis('pc09-presidential-election', 'presidential-election', 'Presidential election',
    'The configured presidential election has concluded.', { pressure: 'hold' });
  const electionCrisisOutcome = await resolveClose(electionCrisis, {
    formalTitle: 'Presidential election result',
    formalDetails: 'The server tally selected the President and Vice President under the published procedure.',
  });
  assert.equal(electionCrisisOutcome.outcome.capitalDelta, 1);
  checks.presidentialElectionCrisisLegallyResolved = true;

  for (let index = 0; index < 3; index += 1) {
    const id = `pc09-manual-crisis-${index + 1}`;
    const manual = await openCrisis(id, 'custom', `Facilitator crisis ${index + 1}`,
      'The facilitator records a bounded table decision.', { pressure: index === 0 ? 'decrease' : 'hold' });
    const closed = await resolveClose(manual, {
      formalTitle: `Recorded crisis outcome ${index + 1}`,
      formalDetails: 'The facilitator recorded the outcome for the next Team start.',
    });
    assert.equal(closed.outcome.capitalDelta, 1);
  }
  const atCap = (await fixture.session.get()).get('politicalCapital');
  assert.equal(atCap.balance, 8, 'Eight resolved crises fill the printed political-capital ledger.');
  assert.equal(atCap.revision, 8);
  checks.underCapAutomaticCrisisAwardsReachLedgerCap = true;

  const capCrisis = await openCrisis('pc09-cap-limited-crisis', 'custom', 'Cap-limited crisis',
    'The facilitator records one additional bounded decision.', { pressure: 'hold' });
  const capResolvedData = gmRequest({ requestId: requestId(), expectedRevision: capCrisis.debated.revision,
    crisisId: capCrisis.crisisId, crisisKind: capCrisis.crisisKind, title: capCrisis.title,
    details: capCrisis.details, state: 'resolved',
    formalAnnouncement: { title: 'Cap-limited outcome', details: 'The decision is binding at the next Team start.' } });
  const capOutcome = await invoke(fixture.gm, 'transitionCrisis', capResolvedData);
  assert.equal(capOutcome.state, 'resolved');
  const capReceipt = (await fixture.db.doc(`sessions/${fixture.sessionId}/crisisOutcomes/${capCrisis.crisisId}`).get()).data();
  assert.equal(capReceipt.capitalGranted, true);
  assert.equal(capReceipt.capitalApplied, false);
  assert.equal(capReceipt.capitalDelta, 0);
  assert.equal(capReceipt.capitalBalance, 8);
  const atCapAfterFirst = (await fixture.session.get()).get('politicalCapital');
  assert.equal(atCapAfterFirst.balance, 8);
  assert.equal(atCapAfterFirst.revision, 8);
  const exactCapReplay = await invoke(fixture.gm, 'transitionCrisis', capResolvedData, 'exact cap-limited crisis retry');
  assert.deepEqual(exactCapReplay, capOutcome);
  assert.deepEqual((await fixture.session.get()).get('politicalCapital'), atCapAfterFirst);
  checks.fullCapitalCapHandledZeroDeltaAndExactRetry = true;
  const capAnnounced = await transitionCrisis({ crisisId: capCrisis.crisisId, crisisKind: capCrisis.crisisKind,
    title: capCrisis.title, details: capCrisis.details, state: 'announced', expectedRevision: capOutcome.revision });
  const capClosed = await transitionCrisis({ crisisId: capCrisis.crisisId, crisisKind: capCrisis.crisisKind,
    title: capCrisis.title, details: capCrisis.details, state: 'closed', expectedRevision: capAnnounced.revision });
  assert.equal(capClosed.state, 'closed');

  activeStage = 'Coordination visit, next-Team announcement, and reconnect';
  const phaseBeforeClockChange = (await fixture.session.get()).get('turnPhase');
  const acceleratedPhase = {
    ...phaseBeforeClockChange,
    teamPhaseEndsAt: new Date(Date.now() - 1000).toISOString(),
  };
  await fixture.session.update({ turnPhase: acceleratedPhase });
  setupDisclosure.clockAcceleration.push('Moved Cycle 1 Team deadline just past before beginOpenAirspacePhase to exercise election finalization and the Coordination visit.');
  await invoke(captain, 'beginOpenAirspacePhase', { expectedTurn: 1 });
  const coordinationRoot = (await fixture.session.get()).data();
  assert.equal(coordinationRoot.turnState.phase, 'coordination');
  assert.equal(coordinationRoot.turnPhase.airspace.state, 'lifted');
  activeStage = 'close-cycle election tally after the Coordination boundary';
  assert.deepEqual([...remoteFirebaseRequestOrigins], [],
    'The explicit Firebase Emulator client must not contact a remote Firebase API before election tally.');
  checks.noRemoteFirebaseRequestOriginsBeforeElection = true;
  const election = await invoke(fixture.gm, 'resolvePresidentialElection', gmRequest({
    requestId: requestId(), expectedRevision: 1,
  }));
  assert.equal(election.state, 'resolved');
  assert.equal(election.tally.president.winnerUid, captain.localId);
  assert.equal(election.tally.vicePresident.winnerUid, captain.localId);
  assert.equal(election.vicePresidentCandidateId, candidateIdFor(scientist.localId));
  assert.equal(election.vicePresidentOutcome, 'runner-up');
  assert.equal(election.tally.president.totalVotes, 5);
  assert.equal(election.tally.vicePresident.totalVotes, 5);
  assert.equal(election.tally.president.totalWeight, Object.values(populationByRole).reduce((sum, value) => sum + value, 0));
  assert.equal(election.tally.vicePresident.totalWeight, Object.values(populationByRole).reduce((sum, value) => sum + value, 0));
  const electionAuditQuery = await fixture.db.collection(`sessions/${fixture.sessionId}/presidentialElections/current/audit`).get();
  const resolveAudit = electionAuditQuery.docs.find(doc => doc.get('action') === 'resolve');
  assert.ok(resolveAudit, 'The private election audit records the server tally and office transition.');
  assert.equal((await fixture.db.collection(`sessions/${fixture.sessionId}/presidentialElections/current/ballots`).get()).size, ballots.length);
  assert.equal(Object.hasOwn(election, 'ballots'), false);
  assert.equal(Object.hasOwn(election, 'voterUids'), false);
  const memberElectionProjection = (await member(captain)).presidentialElection;
  assert.equal(memberElectionProjection.tally.president.winnerId, candidateIdFor(captain.localId));
  assert.equal(memberElectionProjection.tally.vicePresident.winnerId, candidateIdFor(captain.localId));
  assert.equal(memberElectionProjection.presidentCandidateId, candidateIdFor(captain.localId));
  assert.equal(memberElectionProjection.vicePresidentCandidateId, candidateIdFor(scientist.localId));
  assert.equal(memberElectionProjection.vicePresidentOutcome, 'runner-up');
  assert.doesNotMatch(JSON.stringify(memberElectionProjection), /winnerUid|candidateIdsByUid|voterShipIds|ballot\s*:/);
  const electedRoot = (await fixture.session.get()).data();
  assert.equal(electedRoot.presidentialOffices.presidentUid, captain.localId);
  assert.equal(electedRoot.presidentialOffices.vicePresidentUid, scientist.localId);
  assert.notEqual(electedRoot.presidentialOffices.presidentUid, electedRoot.presidentialOffices.vicePresidentUid);
  assert.equal(election.vicePresidentOutcome, 'runner-up');
  const newPresidentProjection = await member(captain);
  const oldPresidentProjection = await member(president);
  assert.equal(newPresidentProjection.currentMemberIsPresident, true);
  assert.equal(oldPresidentProjection.currentMemberIsPresident, false);
  assert.equal(Object.hasOwn(newPresidentProjection.presidentialOffices, 'presidentUid'), false);
  assert.equal(Object.hasOwn(oldPresidentProjection.presidentialOffices, 'presidentUid'), false);
  checks.serverWeightedSecretTallyAndAuditedOfficeTransition = true;
  checks.electedOfficeProjectionAndReplacementDenial = true;
  const oldPresidentDenial = await denied(president, 'recordPresidentActionCommand', {
    requestId: requestId(), kind: 'address', text: 'A replaced President cannot retain office powers.', expectedRevision: 0,
  }, 'replaced President power attempt');
  assert.equal(oldPresidentDenial, 'PERMISSION_DENIED');
  await denied(scientist, 'recordPresidentActionCommand', {
    requestId: requestId(), kind: 'address', text: 'A regular crew member has no President powers.', expectedRevision: 0,
  }, 'non-President power attempt');

  const unrestBeforeSetup = coordinationRoot.shipUnrest?.icebreaker ?? 0;
  if (unrestBeforeSetup === 0) {
    await fixture.session.update({ 'shipUnrest.icebreaker': 1 });
    setupDisclosure.fixtureStateGrants.push('Set Icebreaker unrest to 1 in the emulator fixture solely to activate the configured visit endpoint.');
  }
  const visitRoot = (await fixture.session.get()).data();
  const capitalBeforeVisit = visitRoot.politicalCapital;
  const vesselRevisionBeforeVisit = visitRoot.vesselActionRevisions?.icebreaker ?? 0;
  const visitData = { requestId: requestId(), shipId: 'icebreaker', expectedCapitalRevision: capitalBeforeVisit.revision,
    expectedVesselRevision: vesselRevisionBeforeVisit };
  const visit = await invoke(captain, 'recordPresidentialVisit', visitData);
  const visitReplay = await invoke(captain, 'recordPresidentialVisit', visitData, 'exact presidential-visit retry');
  assert.deepEqual(visitReplay, visit);
  const afterVisit = (await fixture.session.get()).data();
  assert.equal(afterVisit.shipUnrest.icebreaker, (visitRoot.shipUnrest?.icebreaker ?? 0) - 1);
  assert.equal(afterVisit.politicalCapital.balance, capitalBeforeVisit.balance - 1);
  assert.equal(afterVisit.politicalCapital.revision, capitalBeforeVisit.revision + 1);
  checks.coordinationVisitAtomicOnceNoRouteOrPhysicalAttestation = true;

  const announceCountBefore = (await fixture.session.get()).get('pendingTeamAnnouncements').length;
  assert.ok(announceCountBefore >= 10, 'Each crisis outcome and the election queued a formal Team-start announcement.');

  const advance = await invoke(fixture.gm, 'advanceTurn', gmRequest({ requestId: requestId(), expectedTurn: 1,
    overridePhaseTimer: true, skipTurnStartAnnouncement: false }));
  assert.equal(advance.currentTurn, 2);
  const start = (await fixture.session.get()).get('turnStartAnnouncement');
  assert.equal(start.turn, 2);
  assert.equal(start.formalAnnouncements.length, announceCountBefore);
  assert.ok(start.formalAnnouncements.some(item => item.title === 'Presidential election result'));
  assert.ok(start.formalAnnouncements.some(item => item.title === 'Voyage 33-0 admitted'));
  assert.ok(start.formalAnnouncements.some(item => item.title === 'Cap-limited outcome'));
  assert.equal((await fixture.session.get()).get('pendingTeamAnnouncements'), undefined,
    'The committed next-Team announcement consumes the pending outbox once.');
  checks.formalCrisisAndElectionOutcomesPublishedAtNextTeamStart = true;

  activeStage = 'authenticated President and election routes with keyboard return';
  await member(captain);
  const governanceViewports = [[390, 844], [844, 390], [1440, 900]];
  for (const [width, height] of governanceViewports) {
    await checkGovernanceBackRoute({ route: 'president', heading: "President's office", actorUid: captain.localId,
      width, height, onOpen: width === 390 && height === 844 ? async () => {
        await page.getByLabel('Action family', { exact: true }).selectOption('address');
        await page.getByLabel('Decision record', { exact: true }).fill('We will receive the vessel under the published response plan.');
        await page.getByRole('button', { name: 'Record presidential address', exact: true }).click();
        await page.getByText('Presidential address recorded.', { exact: true }).waitFor({ timeout: 30000 });
      } : undefined });
    await checkGovernanceBackRoute({ route: 'election', heading: 'Presidential election', actorUid: captain.localId,
      width, height });
  }
  const addressRoot = (await fixture.session.get()).get('presidentWorkspace');
  assert.ok(addressRoot.entries.some(entry => entry.kind === 'address' && entry.text ===
    'We will receive the vessel under the published response plan.' && entry.cycle === 2));
  checks.normalJoinedElectedPresidentRouteAndAddress = true;
  assert.equal(governanceReturnChecks.length, 6);
  checks.governanceKeyboardBackRoutes = true;

  await invoke(captain, 'disconnectFromSession');
  const resumed = await member(captain);
  assert.equal(resumed.currentTurn, 2);
  assert.equal(resumed.turnStartAnnouncement.turn, 2);
  assert.equal(resumed.turnStartAnnouncement.formalAnnouncements.length, announceCountBefore);
  assert.equal(resumed.currentMemberIsPresident, true);
  assert.doesNotMatch(JSON.stringify(resumed), /candidateIdsByUid|voterShipIds|presidentUid|vicePresidentUid|rationale/);
  checks.reconnectRetainsNextTeamAnnouncementsAndElectedOffice = true;

  assert.deepEqual(browserErrors, []);
  assert.deepEqual([...remoteFirebaseRequestOrigins], [], 'No remote Firebase request origin was observed during the browser proof.');
  const sanitizedEvidence = {
    kind: 'normal-authenticated-local-emulator-crisis-election-http-ui',
    sourceCommit: process.env.PC09_SOURCE_COMMIT ?? 'not-specified',
    checks,
    outcome: {
      crisisKindsResolved: ['Approaching Vessel', 'Disease Outbreak', 'Religious Zealotry', 'Civil Unrest', 'Presidential Election', 'four custom crisis outcomes'],
      capital: { reachedCap: true, atCapResolutionApplied: false, atCapDelta: 0, retryNoChange: true },
      election: { voters: voterUids.length, tally: 'server-computed population weighting', presidentChanged: true, vicePresidentChanged: true,
        sharedUniqueLeaderResolvedFromVpBallotRunnerUp: election.tally.president.winnerUid === election.tally.vicePresident.winnerUid &&
          election.vicePresidentCandidateId === candidateIdFor(scientist.localId) && election.vicePresidentOutcome === 'runner-up',
        ballotsPrivate: true, directReadsDenied: true, directWritesDenied: true },
      voyage33: { admitted: true, arrivalActivatedOnce: true, exactRetryStable: true },
      formalAnnouncements: { queuedBeforeNextTeam: announceCountBefore, deliveredAtCycle: 2, reconnectPreserved: true },
      coordinationVisit: { committedAtomically: true, physicalAttestation: false },
      actionsExecuted: commandNames.length,
    },
    setupDisclosure,
    governanceReturnChecks,
    pregameSettingsChecks,
    remoteFirebaseRequestOrigins: [...remoteFirebaseRequestOrigins],
    productionGameplay: false,
    preparedScene: false,
    identitiesAndTokensRetained: false,
    browserErrors,
    completedAt: new Date().toISOString(),
  };
  await writeFile(`${evidenceDirectory}/result.json`, `${JSON.stringify(sanitizedEvidence, null, 2)}\n`);
  console.log(`PC09 normal-authenticated crisis/election workflow passed (${Object.keys(checks).length} checks).`);
} catch (error) {
  if (page) {
    await writeFile(`${evidenceDirectory}/failure.json`, `${JSON.stringify({
      stage: activeStage,
      errorType: error instanceof Error ? error.name : 'Error',
      route: new URL(page.url()).hash,
      checks,
      browserErrors,
      remoteFirebaseRequestOrigins: [...remoteFirebaseRequestOrigins],
      pregameSettingsChecks,
      setupDisclosure,
    }, null, 2)}\n`);
  }
  throw error;
} finally {
  const cleanupGuard = setInterval(() => {}, 1000);
  try {
    await browser.close();
    await fixture?.cleanup();
    await fixture?.db.terminate();
  } finally {
    clearInterval(cleanupGuard);
  }
}
