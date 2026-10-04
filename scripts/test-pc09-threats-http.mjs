import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { chromium } from 'playwright';
import { createPc07AuthenticatedSession } from './pc07-authenticated-session.mjs';

const evidencePath = process.env.PC09_THREATS_EVIDENCE_PATH;
assert.ok(evidencePath, 'Set an external evidence path for this disposable authenticated proof.');
const uiDirectory = process.env.PC09_THREATS_UI_DIR;
assert.ok(uiDirectory, 'A separate external UI evidence directory is required.');
const sourceCommit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: new URL('../', import.meta.url), encoding: 'utf8' }).trim();
const functionsRuntime = {
  sourceCommit: process.env.PC09_FUNCTIONS_SOURCE_COMMIT ?? null,
  compiledTreeSha256: process.env.PC09_FUNCTIONS_LIB_SHA256 ?? null,
};
const uiOrigin = process.env.PC07_LOCAL_GM_ORIGIN ?? 'http://127.0.0.1:5182';
let browser;
let page;
let commanderContext;
let sessionStoreModuleUrl = '/src/store/useSessionStore.ts';
const sessionNetwork = [];
let fixture;
const browserErrors = [];
const calls = [];
const checks = {};
const commanderRequests = [];
const commanderResponses = [];

async function observeCommanderState() {
  await page.evaluate(async moduleUrl => {
    const { useSessionStore } = await import(moduleUrl);
    const trace = [];
    let previous;
    const record = () => {
      const s = useSessionStore.getState();
      const next = { route: location.hash, connection: s.connection,
        freshness: s.sessionSnapshotFreshness, cycle: s.session?.currentTurn,
        identityRevision: s.identityHydrationRevision, snapshotVersion: s.sessionSnapshotVersion,
        generation: s.me?.connectionGeneration, roleId: s.me?.replacementRoleId,
        activeConsoleRoleId: s.me?.activeConsoleRoleId, replacementStatus: s.me?.replacementStatus,
        briefRoleId: s.roleBrief?.roleId, ownBrief: s.roleBrief?.assignmentUid === s.me?.uid,
        communicationError: s.communicationError?.kind };
      const key = JSON.stringify(next);
      if (key === previous) return;
      previous = key;
      trace.push({ at: new Date().toISOString(), ...next });
      if (trace.length > 160) trace.shift();
    };
    // This observes the genuine store; it does not patch identity, authority,
    // tokens, storage, callable services, or any gameplay projection.
    useSessionStore.subscribe(record);
    window.addEventListener('hashchange', record);
    window.__pc09CommanderStateTrace = trace;
    record();
  }, sessionStoreModuleUrl);
}

async function joinCommander(joinCode) {
  await mkdir(uiDirectory, { recursive: true });
  browser = await chromium.launch({ channel: 'chrome', headless: true });
  commanderContext = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  page = await commanderContext.newPage();
  page.on('request', request => {
    const url = new URL(request.url());
    if (url.pathname === '/src/store/useSessionStore.ts' &&
        (url.searchParams.has('t') || !new URL(sessionStoreModuleUrl, uiOrigin).searchParams.has('t'))) {
      sessionStoreModuleUrl = url.href;
    }
  });
  const endpoints = new Set(['resumeSession', 'getCurrentMemberSession', 'refreshPresence',
    'getWolfCommanderCycleAttackDial', 'commitWolfCommanderAttackDial',
    'getWolfCommanderTargeting', 'getWolfCommanderRangeTargetDial', 'getWolfAmnestyView']);
  page.on('response', async response => {
    const name = new URL(response.url()).pathname.split('/').at(-1);
    if (!endpoints.has(name)) return;
    const body = await response.json().catch(() => ({}));
    sessionNetwork.push({ name, status: response.status(), at: new Date().toISOString(),
      ...(body.error ? { error: body.error } : {}),
      ...(body.result ? { type: body.result.type, resultStatus: body.result.status,
        cycle: body.result.cycle ?? body.result.session?.currentTurn,
        connectionGeneration: body.result.player?.connectionGeneration } : {}) });
    if (sessionNetwork.length > 120) sessionNetwork.shift();
  });
  page.on('pageerror', error => browserErrors.push(error.message));
  await page.goto(uiOrigin);
  await page.getByRole('button', { name: /^REDUCED MOTION/i }).click();
  await page.getByRole('textbox', { name: 'Session code', exact: true }).fill(joinCode);
  await page.getByRole('button', { name: 'Join a session', exact: true }).click();
  await page.getByRole('dialog', { name: 'CODE OF CONDUCT', exact: true }).waitFor();
  for (const checkbox of await page.getByRole('checkbox', { name: /^Acknowledge regulation/ }).all()) {
    await checkbox.check();
  }
  const acknowledge = page.getByRole('button', { name: 'Acknowledge regulations and continue', exact: true });
  await acknowledge.and(page.locator(':enabled')).waitFor();
  await acknowledge.click();
  await page.waitForFunction(async moduleUrl => {
    const { useSessionStore } = await import(moduleUrl);
    return Boolean(useSessionStore.getState().me);
  }, sessionStoreModuleUrl);
  const actor = await page.evaluate(async () => {
    const { auth } = await import('/src/lib/firebase.ts');
    return { localId: auth().currentUser.uid, idToken: await auth().currentUser.getIdToken() };
  });
  // Suspend this genuine browser during the serialized API setup, then resume
  // the same identity through its ordinary SDK connection before gameplay.
  await commanderContext.setOffline(true);
  return actor;
}

async function command(actor, name, data = {}) {
  const reply = await fixture.call(actor, name, { sessionId: fixture.sessionId, ...data });
  calls.push({ name, status: reply.status === 200 ? (reply.result?.status ?? 'committed') : 'denied' });
  return reply;
}

async function accepted(actor, name, data = {}) {
  const reply = await command(actor, name, data);
  assert.equal(reply.status, 200, `${name}: ${reply.error?.message ?? 'callable failed'}`);
  return reply.result;
}

async function denied(actor, name, data = {}) {
  const reply = await command(actor, name, data);
  assert.notEqual(reply.status, 200, `${name} unexpectedly committed.`);
  assert.ok(['FAILED_PRECONDITION', 'PERMISSION_DENIED', 'INVALID_ARGUMENT'].includes(reply.error?.status),
    `${name} failed unexpectedly: ${reply.error?.message}`);
  return reply.error;
}

async function assertNoHorizontalOverflow(label) {
  const dimensions = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    page: document.documentElement.scrollWidth,
  }));
  assert.ok(dimensions.page <= dimensions.viewport + 1,
    `${label} overflows horizontally: ${JSON.stringify(dimensions)}`);
  return dimensions;
}

try {
  fixture = await createPc07AuthenticatedSession('PC09 Commander and group threat authority', 8, {
    keepAlive: true, serializeFixtureCalls: true,
    browserRoleId: 'shepherd-scientist',
    joinBrowserPlayer: joinCommander,
  });
  const { session, sessionId, gm, instanceId, db } = fixture;
  console.log(`Disposable authenticated session ${sessionId}`);
  assert.ok(fixture.roles.includes('admiral') && fixture.roles.includes('shepherd-scientist'));
  const commander = fixture.byRole('shepherd-scientist');
  const admiral = fixture.byRole('admiral');
  const wing = fixture.byRole('wing-commander');
  await commanderContext.setOffline(false);
  await page.reload();
  await observeCommanderState();
  await page.waitForFunction(async ({ moduleUrl, uid }) => {
    const { auth } = await import('/src/lib/firebase.ts');
    const { useSessionStore } = await import(moduleUrl);
    const s = useSessionStore.getState();
    return auth().currentUser?.uid === uid && s.me?.uid === uid &&
      s.connection === 'live' && s.sessionSnapshotFreshness === 'server';
  }, { moduleUrl: sessionStoreModuleUrl, uid: commander.localId });

  const setupRevision = (await session.get()).get('setupRevision');
  const eligibility = await accepted(gm, 'setReplacementEligibility', {
    instanceId, requestId: randomUUID(), targetUid: commander.localId, reason: 'removed',
    expectedRevision: 0, expectedSetupRevision: setupRevision,
  });
  await accepted(gm, 'assignReplacementRole', {
    instanceId, requestId: randomUUID(), targetUid: commander.localId,
    replacementRoleId: 'wolf-commander', expectedRevision: eligibility.revision,
    expectedSetupRevision: eligibility.setupRevision,
  });
  await accepted(commander, 'refreshPresence', { activeConsoleRoleId: null });
  await page.waitForFunction(async moduleUrl => {
    const { useSessionStore } = await import(moduleUrl);
    const current = useSessionStore.getState();
    return current.session?.currentTurn === 1 && current.me?.replacementRoleId === 'wolf-commander' &&
      current.me.replacementStatus == null && current.me.fleetGroupId && current.connection === 'live' &&
      current.sessionSnapshotFreshness === 'server';
  }, sessionStoreModuleUrl);
  await page.waitForFunction(async moduleUrl => {
    const { useSessionStore } = await import(moduleUrl);
    const current = useSessionStore.getState();
    return current.roleBrief?.roleId === 'wolf-commander' &&
      current.roleBrief.assignmentUid === current.me?.uid;
  }, sessionStoreModuleUrl, { timeout: 30_000 });
  if (await page.evaluate(() => location.hash !== '#/console')) {
    await page.getByRole('link', { name: 'Back to stations', exact: true }).click();
  }
  await page.waitForFunction(() => location.hash === '#/console', { timeout: 15_000 });
  await page.getByRole('link', { name: 'Open private brief', exact: true }).waitFor({ timeout: 30_000 });
  await page.getByRole('link', { name: 'Open private brief', exact: true }).click();
  await page.waitForFunction(() => location.hash === '#/brief', { timeout: 15_000 });
  await page.getByRole('heading', { name: 'Commander address and amnesty', exact: true }).waitFor({ timeout: 30_000 });
  const panel = page.getByRole('region', { name: 'Commander address and amnesty', exact: true });
  const dialPanel = page.getByRole('region', { name: 'Wolf fleet dial', exact: true });
  await dialPanel.getByRole('heading', { name: 'Wolf fleet dial', exact: true }).waitFor({ timeout: 30_000 });
  await page.waitForFunction(async moduleUrl => {
    const { useSessionStore } = await import(moduleUrl);
    const current = useSessionStore.getState();
    return current.connection === 'live' && current.sessionSnapshotFreshness === 'server' &&
      current.me?.replacementRoleId === 'wolf-commander';
  }, sessionStoreModuleUrl, { timeout: 30_000 });
  await panel.getByRole('button', { name: 'Refresh address and amnesty', exact: true }).click();
  await panel.getByRole('alert').waitFor({ state: 'hidden', timeout: 15_000 });
  await panel.getByText('Loading current address and amnesty state…', { exact: true })
    .waitFor({ state: 'hidden', timeout: 15_000 });
  await page.screenshot({ path: `${uiDirectory}/commander-phone-before.png`, fullPage: true });
  const initialPhone = await assertNoHorizontalOverflow('390px reduced-motion Commander brief');

  const capture = request => {
    if (/\/(publishWolfCommanderAddress|createWolfAmnestyOffer|commitWolfCommanderAttackDial)$/.test(request.url())) {
      const body = request.postDataJSON()?.data;
      if (body) commanderRequests.push({ name: request.url().split('/').at(-1), data: body });
    }
  };
  page.on('request', capture);
  page.on('response', async response => {
    if (!/\/(publishWolfCommanderAddress|createWolfAmnestyOffer|commitWolfCommanderAttackDial)$/.test(response.url())) return;
    let body;
    try { body = await response.json(); } catch { body = { unreadable: true }; }
    commanderResponses.push({ name: response.url().split('/').at(-1), status: response.status(), body });
  });
  const fleetMessage = 'Wolf forces address the fleet: prepare for a formal surrender decision.';
  await panel.getByLabel('Fleet address', { exact: true }).fill(fleetMessage);
  await panel.getByRole('button', { name: 'Address fleet for 30 seconds', exact: true }).click();
  await panel.getByText(/Fleet address published for 30 seconds/, { exact: false }).waitFor();
  await panel.getByRole('combobox').nth(0).selectOption('aegis');
  await panel.getByRole('combobox').nth(1).selectOption('5');
  await panel.getByRole('button', { name: 'Offer amnesty', exact: true }).click();
  await panel.getByText('Amnesty offer sent to the target ship captain. The facilitator must rule on any consequence.',
    { exact: true }).waitFor();
  assert.equal(commanderRequests.length, 2, 'The Commander UI should publish and offer through its authenticated callables.');
  assert.equal(commanderRequests[0].name, 'publishWolfCommanderAddress');
  assert.equal(commanderRequests[0].data.message, fleetMessage);
  assert.equal(commanderRequests[1].name, 'createWolfAmnestyOffer');
  assert.equal(commanderRequests[1].data.targetShipId, 'aegis');
  assert.equal(commanderRequests[1].data.responseDeadlineMinutes, 5);
  checks.currentCommanderPublishedAddressAndIssuedPrivateOfferThroughRoleBrief = true;
  await page.screenshot({ path: `${uiDirectory}/commander-phone-offer.png`, fullPage: true });

  const offerRef = db.doc(`sessions/${sessionId}/wolfCommanderAmnesty/current`);
  const offered = (await offerRef.get()).data();
  assert.equal(offered.status, 'offered');
  assert.equal(offered.condition, 'surrender-by-medium-jump-to-0101');
  assert.equal(offered.targetUid, admiral.localId);
  assert.ok(Date.parse(offered.responseDeadline) > Date.now() + 4 * 60_000,
    'The five-minute deadline is persisted rather than inferred by the UI.');
  const captainView = await accepted(admiral, 'getWolfAmnestyView');
  assert.equal(captainView.offer.status, 'offered');
  assert.equal(captainView.offer.condition, offered.condition);
  assert.equal(Object.hasOwn(captainView.offer, 'targetUid'), false,
    'The captain view contains the offer without exposing an unnecessary account identity.');
  const unrelatedView = await accepted(wing, 'getWolfAmnestyView');
  assert.equal(unrelatedView.offer, null, 'An unrelated member receives no private amnesty offer.');
  await denied(wing, 'respondToWolfAmnesty', {
    requestId: randomUUID(), expectedRevision: offered.revision, answer: 'accept',
  });
  const memberRead = await fetch(
    `http://127.0.0.1:${fixture.config.firestorePort}/v1/projects/${fixture.project}/databases/(default)/documents/sessions/${sessionId}/wolfCommanderAmnesty/current`,
    { headers: { Authorization: `Bearer ${admiral.idToken}` } },
  );
  assert.equal(memberRead.status, 403, 'A captain cannot directly read the private Firestore amnesty record.');
  const addressEvent = (await db.doc(`sessions/${sessionId}/events/wolf-commander-address-1`).get()).data();
  assert.equal(addressEvent.message, fleetMessage);
  assert.equal(Object.hasOwn(addressEvent, 'targetShipId'), false);
  assert.equal(Object.hasOwn(addressEvent, 'offerId'), false,
    'The fleet-visible address event does not reveal the private amnesty target or offer.');
  checks.authenticatedAudienceSplitAndFirestorePrivacy = true;

  const responseRequest = {
    requestId: randomUUID(), expectedRevision: offered.revision, answer: 'accept',
  };
  const captainAcceptance = await accepted(admiral, 'respondToWolfAmnesty', responseRequest);
  assert.equal(captainAcceptance.status, 'accepted-pending-facilitator');
  assert.deepEqual(await accepted(admiral, 'respondToWolfAmnesty', responseRequest), captainAcceptance,
    'An exact captain retry returns its original response receipt.');
  const afterAcceptance = (await offerRef.get()).data();
  assert.equal(afterAcceptance.status, 'accepted-pending-facilitator');
  assert.equal(Object.hasOwn(afterAcceptance, 'ruling'), false,
    'Acceptance records the response only; it does not invent a bargain or facilitator ruling.');
  const acceptedView = await accepted(gm, 'getWolfAmnestyView');
  assert.equal(acceptedView.offer.status, 'accepted-pending-facilitator');
  const beforeRulingSession = (await session.get()).data();
  const rulingText = 'Facilitator ruling: the AEGIS captain accepts; resolve surrender only if the stated medium-jump condition is met.';
  const rulingRequest = {
    instanceId, requestId: randomUUID(), expectedRevision: afterAcceptance.revision, text: rulingText,
  };
  const ruling = await accepted(gm, 'recordWolfAmnestyConsequence', rulingRequest);
  assert.equal(ruling.status, 'facilitator-ruled');
  assert.equal(ruling.ruling, rulingText);
  assert.deepEqual(await accepted(gm, 'recordWolfAmnestyConsequence', rulingRequest), ruling,
    'An exact facilitator retry returns its original ruling receipt.');
  const afterRulingSession = (await session.get()).data();
  assert.deepEqual({ phase: afterRulingSession.turnPhase, damage: afterRulingSession.shipDamage,
    population: afterRulingSession.shipSurvivors }, {
    phase: beforeRulingSession.turnPhase, damage: beforeRulingSession.shipDamage,
    population: beforeRulingSession.shipSurvivors,
  }, 'Recording a consequence is an explicit ruling, not an automatic ship-state bargain.');
  checks.explicitCaptainAcceptanceAndFacilitatorConsequence = true;

  const secondOffer = await accepted(commander, 'createWolfAmnestyOffer', {
    requestId: randomUUID(), expectedCycle: 1, targetShipId: 'aegis', responseDeadlineMinutes: 1,
  });
  assert.equal(secondOffer.status, 'offered');
  await offerRef.update({ responseDeadline: '2000-01-01T00:00:00.000Z' });
  await denied(admiral, 'respondToWolfAmnesty', {
    requestId: randomUUID(), expectedRevision: secondOffer.revision, answer: 'decline',
  });
  const expiredOffer = (await offerRef.get()).data();
  assert.equal(expiredOffer.status, 'offered', 'Deadline expiry does not supply an automatic captain response.');
  assert.equal(expiredOffer.response, undefined);
  const deadlineRuling = await accepted(gm, 'recordWolfAmnestyConsequence', {
    instanceId, requestId: randomUUID(), expectedRevision: secondOffer.revision,
    text: 'The response deadline passed unanswered; the facilitator decides the next scene explicitly.',
  });
  assert.equal(deadlineRuling.status, 'facilitator-ruled');
  assert.equal(deadlineRuling.ruling, 'The response deadline passed unanswered; the facilitator decides the next scene explicitly.');
  checks.expiredOfferRequiresCaptainSilenceAndAnExplicitFacilitatorRuling = true;

  const dialView = await accepted(commander, 'getWolfCommanderCycleAttackDial');
  assert.equal(dialView.status, 'available');
  assert.ok(dialView.groups.length > 0);
  const selectedGroup = dialView.groups[0];
  assert.equal(await dialPanel.getByLabel('Target fleet group', { exact: true }).count(), 1,
    'The connected private panel exposes the current source-owned group selection.');
  // The same connected private panel submits the once-per-cycle selected group.
  await page.waitForFunction(async moduleUrl => {
    const { useSessionStore } = await import(moduleUrl);
    return useSessionStore.getState().me?.replacementRoleId === 'wolf-commander';
  }, sessionStoreModuleUrl);
  await page.waitForFunction(async moduleUrl => {
    const { useSessionStore } = await import(moduleUrl);
    const current = useSessionStore.getState();
    return current.connection === 'live' && current.sessionSnapshotFreshness === 'server' &&
      current.me?.replacementRoleId === 'wolf-commander';
  }, sessionStoreModuleUrl);
  await page.getByRole('region', { name: 'Wolf fleet dial', exact: true })
    .getByRole('heading', { name: 'Wolf fleet dial', exact: true }).waitFor({ timeout: 30_000 });
  const connectedDialPanel = page.getByRole('region', { name: 'Wolf fleet dial', exact: true });
  await connectedDialPanel.getByRole('combobox').first().selectOption(selectedGroup.groupId);
  const dialButton = connectedDialPanel.getByRole('button', { name: 'Commit this cycle attack dial', exact: true });
  await dialButton.and(page.locator(':enabled')).waitFor({ timeout: 30_000 });
  await page.screenshot({ path: `${uiDirectory}/commander-phone-group-dial.png`, fullPage: true });
  await dialButton.click();
  await page.getByRole('status').filter({ hasText: /Cycle 1 dial committed/ }).waitFor({ timeout: 30_000 });
  await assertNoHorizontalOverflow('390px reduced-motion committed Commander dial');
  assert.ok(commanderRequests.some(({ name }) => name === 'commitWolfCommanderAttackDial'));
  const dialRequest = commanderRequests.find(({ name }) => name === 'commitWolfCommanderAttackDial').data;
  const committedDial = await accepted(commander, 'commitWolfCommanderAttackDial', dialRequest);
  assert.equal(committedDial.groupId, selectedGroup.groupId);
  assert.equal(committedDial.targetGroupPursuit, selectedGroup.pursuitValue);
  assert.equal(committedDial.damageCapacity, 10 + selectedGroup.pursuitValue);
  const dialAudit = (await db.doc(`sessions/${sessionId}/wolfCommanderCycleDials/cycle-${dialRequest.expectedCycle}/audit/${dialRequest.requestId}`).get()).data();
  assert.equal(dialAudit.commanderCycleAttack.groupId, selectedGroup.groupId);
  assert.equal(dialAudit.commanderCycleAttack.damageCapacity, undefined,
    'The committed receipt carries the capacity; private marker binds the input pursuit and group.');
  const repeatDialError = await denied(commander, 'commitWolfCommanderAttackDial', {
    ...dialRequest, requestId: randomUUID(),
  });
  assert.match(repeatDialError.message, /already committed an attack dial this cycle/i);
  checks.connectedCommanderSelectedGroupPursuitAndOncePerCycleCapacity = true;

  const dimensions = [];
  for (const viewport of [
    { width: 320, height: 844, name: 'small-phone' },
    { width: 390, height: 844, name: 'phone' },
    { width: 844, height: 390, name: 'short-landscape' },
    { width: 1440, height: 900, name: 'desktop' },
  ]) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    dimensions.push({ viewport: viewport.name, ...(await assertNoHorizontalOverflow(viewport.name)) });
    await page.screenshot({ path: `${uiDirectory}/commander-${viewport.name}.png`, fullPage: true });
  }
  assert.deepEqual(browserErrors, []);
  assert.deepEqual(fixture.heartbeatFailures, []);
  page.off('request', capture);

  const evidence = {
    kind: 'pc09-normal-authenticated-local-emulator-commander-threat-and-amnesty-ui-http',
    sourceCommit, functionsRuntime, sessionNetwork,
    stateTrace: await page.evaluate(() => window.__pc09CommanderStateTrace ?? []),
    fixtureChanges: ['disposable Auth/Firestore emulator session', 'browser joins through the normal session flow',
      'replacement role assignment through authenticated GM callables',
      'Admin-only deadline time-travel for the unanswered-expiry case'],
    checks, calls, initialPhone, dimensions, browserErrors, commanderRequests, commanderResponses,
    heartbeatFailures: fixture.heartbeatFailures,
    actorsAndTokensRetained: false,
    sessionCleanup: 'recursiveDelete completed in finally',
    completedAt: new Date().toISOString(),
  };
  await mkdir(dirname(evidencePath), { recursive: true });
  await writeFile(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`);
  console.log('PC09 authenticated Commander, amnesty, privacy, and group dial proof passed.');
} catch (error) {
  await mkdir(dirname(evidencePath), { recursive: true }).catch(() => {});
  const currentPage = page ? {
    url: page.url(),
    bodyText: await page.locator('body').innerText().catch(() => ''),
    state: await page.evaluate(async moduleUrl => {
      const { useSessionStore } = await import(moduleUrl);
      const current = useSessionStore.getState();
      return {
        connection: current.connection, freshness: current.sessionSnapshotFreshness,
        hasSession: Boolean(current.session?.id), cycle: current.session?.currentTurn,
        roleId: current.me?.replacementRoleId,
        hasRoleBrief: current.roleBrief?.roleId === 'wolf-commander',
      };
    }, sessionStoreModuleUrl).catch(() => undefined),
  } : undefined;
  await page?.screenshot({ path: `${evidencePath}.failure.png`, fullPage: true }).catch(() => {});
  let savedAddressRecord;
  let savedAddressEvent;
  if (fixture && commanderRequests.some(({ name }) => name === 'publishWolfCommanderAddress')) {
    const { sessionId, db } = fixture;
    const [addressRecord, addressEvent] = await Promise.all([
      db.doc(`sessions/${sessionId}/wolfCommanderAddresses/cycle-1`).get(),
      db.doc(`sessions/${sessionId}/events/wolf-commander-address-1`).get(),
    ]);
    savedAddressRecord = addressRecord.exists ? addressRecord.data() : null;
    savedAddressEvent = addressEvent.exists ? addressEvent.data() : null;
  }
  await writeFile(`${evidencePath}.failure.json`, `${JSON.stringify({
    sourceCommit, functionsRuntime, sessionNetwork,
    stateTrace: await page?.evaluate(() => window.__pc09CommanderStateTrace ?? []).catch(() => []),
    message: error instanceof Error ? error.message : String(error), checks, calls, commanderRequests,
    commanderResponses, savedAddressRecord, savedAddressEvent, browserErrors, currentPage,
    completedAt: new Date().toISOString(),
  }, null, 2)}\n`).catch(() => {});
  throw error;
} finally {
  try { await browser?.close(); }
  finally {
    if (fixture) {
      await fixture.cleanup();
      await fixture.db.terminate();
    }
  }
}
