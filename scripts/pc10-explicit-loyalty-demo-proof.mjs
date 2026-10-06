import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { pathToFileURL } from 'node:url';
import { runFreshFullGameDemoUi } from './pc10-full-game-demo-ui-proof.mjs';
import { assertSelectedActor } from './pc10-full-game-demo-proof-helpers.mjs';
import {
  assertFreshOptionalLoyaltySetup,
  buildExplicitLoyaltyScenarioPlan,
  mergeOptionalLoyaltyCallbacks,
  summarizeExplicitLoyaltyScenarioPlan,
} from './pc10-explicit-loyalty-proof-plan.mjs';
import {
  assertExactCallableReplay,
  assertLiveWolfActorFence,
  assertSameWolfActorFence,
  assertWolfCycleActionReply,
  assertWolfCycleActionRequest,
  buildWolfCycleActionPlan,
} from './pc10-private-actions-proof-contracts.mjs';
import { captureCallableResponse, currentConsoleVisitProofStatus, readWolfActor,
  runWolfSupplySabotageUiFlow } from './pc10-private-actions-ui-proof.mjs';
import { prepareWolfSupplyCargo } from './pc10-optional-loyalty-supply-preparation.mjs';

const MODES = ['wolf-cult', 'universal-arbour'];
const VIEWPORTS = [
  { width: 320, height: 844 },
  { width: 390, height: 844 },
  { width: 1440, height: 900 },
  { width: 844, height: 390 },
];

function privatePlanByRole(plan) {
  const result = new Map();
  for (const item of plan) {
    result.set(item.holderRoleId, { kind: item.kind,
      ...(item.kind === 'friend' ? { partnerRoleId: item.partnerRoleId } : {}) });
    if (item.partnerRoleId) result.set(item.partnerRoleId, { kind: 'friend', partnerRoleId: item.holderRoleId });
  }
  return result;
}

async function actorState(crew, expectedKind) {
  return crew.page.evaluate(async ({ storeUrl, expectedKind }) => {
    const { auth } = await import('/src/lib/firebase.ts');
    const { useSessionStore } = await import(storeUrl);
    const state = useSessionStore.getState();
    const uid = auth().currentUser?.uid;
    const card = state.privateLoyalty;
    return {
      sameAuthenticatedReader: Boolean(uid && state.me?.uid === uid && state.me?.role === 'player'),
      expectedPrivateKind: card?.kind === expectedKind,
      privateRecordPresent: Boolean(card),
      friendPartnerRoleId: card?.kind === 'friend' && typeof card.partnerRoleId === 'string' ? card.partnerRoleId : null,
      androidProofRevealed: card?.kind === 'android' && card.proofRevealed === true,
      noAndroidProofOnOtherCard: card?.kind !== 'android' && card?.proofRevealed !== true,
      privateCultDeliveryPresent: Boolean(state.wolfCultIntelligence &&
        state.wolfCultIntelligence.sessionId === state.session?.id &&
        state.wolfCultIntelligence.recipientUid === uid),
      privateArbourCallPresent: Boolean(state.arbourVision && state.arbourVision.sessionId === state.session?.id &&
        state.arbourVision.recipientUid === uid),
    };
  }, { storeUrl: crew.storeModuleUrl(), expectedKind });
}

async function waitForCoverage(page, expectedCovered, expectedTotal) {
  const region = page.locator('[aria-label="Explicit loyalty coverage"]');
  await page.waitForFunction(({ expectedCovered, expectedTotal }) => {
    const node = [...document.querySelectorAll('[aria-label="Explicit loyalty coverage"]')][0];
    return node?.textContent?.includes(`All current holders // ${expectedCovered} of ${expectedTotal} configured`) ?? false;
  }, { expectedCovered, expectedTotal }, { timeout: 90_000 });
  const text = await region.innerText();
  assert.ok(text.includes(`All current holders // ${expectedCovered} of ${expectedTotal} configured`));
}

async function optionLabelForRole(select, roleId) {
  const displayName = `DEMO // ${roleId}`;
  const labels = await select.locator('option').allTextContents();
  const matches = labels.filter(label => label.includes(displayName));
  assert.equal(matches.length, 1, 'The normal GM projection must expose one current holder for this role.');
  return matches[0];
}

async function measureEditor(gm, panel, directory) {
  const measures = [];
  const holder = panel.getByLabel('Loyalty holder', { exact: true });
  const kind = panel.getByLabel('Private loyalty type', { exact: true });
  await holder.waitFor({ state: 'visible', timeout: 90_000 });
  await kind.waitFor({ state: 'visible', timeout: 90_000 });
  for (const viewport of VIEWPORTS) {
    await gm.page.setViewportSize(viewport);
    await panel.scrollIntoViewIfNeeded();
    const metrics = await panel.evaluate((element, viewport) => {
      const visible = item => item.getClientRects().length > 0 && getComputedStyle(item).visibility !== 'hidden';
      const controls = [...element.querySelectorAll('select,button,input,textarea')].filter(visible).map(control => {
        const box = control.getBoundingClientRect();
        return { label: control.getAttribute('aria-label') ?? control.labels?.[0]?.textContent?.trim() ?? control.tagName,
          height: box.height, left: box.left, right: box.right };
      });
      const style = getComputedStyle(element);
      const monoToken = style.getPropertyValue('--cic-mono').trim();
      return { ...viewport, noHorizontalOverflow: document.documentElement.scrollWidth <= innerWidth,
        fontFamily: style.fontFamily, cicFontApplied: Boolean(monoToken) && style.fontFamily.includes(monoToken),
        inkToken: style.getPropertyValue('--cic-ink').trim() !== '',
        reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches, controls };
    }, viewport);
    assert.equal(metrics.noHorizontalOverflow, true, 'The connected editor must fit each supported viewport.');
    assert.equal(metrics.inkToken, true, 'The editor must retain the CIC design tokens.');
    assert.equal(metrics.cicFontApplied, true, 'The live editor must apply the CIC mono font token.');
    assert.equal(metrics.reducedMotion, true, 'The browser proof must honor reduced motion.');
    assert.ok(metrics.controls.length >= 3, 'The live editor must expose its actual controls.');
    for (const control of metrics.controls) {
      assert.ok(control.left >= -1 && control.right <= viewport.width + 1);
      assert.ok(control.height >= 44, 'Editor controls retain the shared touch target.');
    }
    measures.push({ viewport: `${viewport.width}x${viewport.height}`, noHorizontalOverflow: metrics.noHorizontalOverflow,
      cicFontApplied: metrics.cicFontApplied, cicColorTokensApplied: metrics.inkToken,
      visibleControls: metrics.controls.length, minimumControlHeight: Math.min(...metrics.controls.map(item => item.height)) });
  }
  await gm.page.setViewportSize({ width: 1440, height: 900 });
  await panel.scrollIntoViewIfNeeded();
  await holder.focus();
  await gm.page.keyboard.press('Tab');
  const tabForward = await kind.evaluate(element => document.activeElement === element);
  await gm.page.keyboard.press('Shift+Tab');
  const tabBack = await holder.evaluate(element => document.activeElement === element);
  assert.equal(tabForward, true, 'Keyboard traversal advances from holder to kind.');
  assert.equal(tabBack, true, 'Shift+Tab returns to the holder.');
  const blockers = panel.getByRole('list', { name: 'Before-start readiness blockers', exact: true });
  const coverageBefore = (await panel.locator('[aria-label="Explicit loyalty coverage"]').innerText())
    .match(/All current holders \/\/ \d+ of \d+ configured/)?.[0] ?? '';
  assert.ok(coverageBefore, 'Aggregate blockers and coverage must be visible before assignments.');
  await writeFile(`${directory}/editor-contract.json`, `${JSON.stringify({ viewports: measures,
    keyboardForward: tabForward, keyboardBack: tabBack, blockersVisibleBefore: await blockers.count() > 0,
    coverageBefore, resourceCost: 'none // private setup records do not spend game resources',
    turnNextActor: 'pre-start GM-authored setup' }, null, 2)}\n`);
  return { measures, blockersVisibleBefore: await blockers.count() > 0, coverageBefore };
}

async function assertLiveSetupAuthority(gm, expected) {
  const current = await gm.observe();
  assert.equal(current.sessionId, expected.sessionId);
  assert.equal(current.uidHash, expected.uidHash);
  assert.equal(current.instanceId, expected.instanceId);
  assert.equal(current.sameActor, true);
  assert.equal(current.playerRole, 'gm');
  assert.equal(current.gmInstanceOwned, true);
  assert.equal(current.connection, 'live');
  assert.equal(current.freshness, 'server');
  assert.equal(current.cycle, 0);
  assert.ok(['lobby', 'casting'].includes(current.phase));
  assert.equal(current.fullGameDemo?.status, 'preparing');
  return current;
}

async function readInitialCensus(gm, actorCount) {
  await gm.page.waitForFunction(async storeUrl => {
    const { useSessionStore } = await import(storeUrl);
    return useSessionStore.getState().gmLoyaltyCensusStatus !== 'loading';
  }, gm.storeModuleUrl(), { timeout: 20_000 });
  return gm.page.evaluate(async ({ storeUrl, actorCount }) => {
    const { auth } = await import('/src/lib/firebase.ts');
    const { useSessionStore } = await import(storeUrl);
    const user = auth().currentUser;
    const state = useSessionStore.getState();
    const session = state.session;
    return {
      sessionId: session?.id,
      sameAuthenticatedGm: Boolean(user && state.me?.uid === user.uid && state.me?.role === 'gm' &&
        state.me?.sessionId === session?.id),
      ownedGmInstance: Boolean(user && state.gmInstance?.uid === user.uid && state.gmInstance?.sessionId === session?.id),
      connection: state.connection,
      freshness: state.sessionSnapshotFreshness,
      currentTurn: session?.currentTurn,
      phase: session?.phase,
      fullGameDemoStatus: session?.fullGameDemo?.status,
      setupConfirmed: session?.setupConfirmed === true,
      activeCoreRoleCount: session?.activeRoleIds?.filter(roleId => roleId !== 'press-officer').length ?? 0,
      confirmedActorCount: actorCount,
      censusStatus: state.gmLoyaltyCensusStatus,
      censusRecordCount: state.gmLoyaltyCensus?.entries.length ?? 0,
      wolfCultEnabled: session?.setup?.wolfCultEnabled ?? session?.wolfCultEnabled === true,
      universalArbourEnabled: session?.setup?.universalArbourEnabled ?? session?.universalArbourEnabled === true,
    };
  }, { storeUrl: gm.storeModuleUrl(), actorCount });
}

async function assignRecords({ gm, plan, directory, mode, projectId, authority }) {
  const panel = gm.page.getByRole('region', { name: 'Explicit loyalty setup', exact: true });
  await panel.waitFor({ state: 'visible' });
  const summary = summarizeExplicitLoyaltyScenarioPlan(plan, mode);
  assert.equal(summary.holderCount, 21);
  assert.equal(summary.requestCount, 20);
  assert.equal(summary.printedWolfCount, 2);
  const editor = await measureEditor(gm, panel, directory);
  const startBlockers = panel.getByRole('list', { name: 'Before-start readiness blockers', exact: true });
  const holderSelect = panel.getByLabel('Loyalty holder', { exact: true });
  const kindSelect = panel.getByLabel('Private loyalty type', { exact: true });
  const availableKinds = await kindSelect.locator('option').evaluateAll(options => options.map(option => option.value).filter(Boolean));
  assert.deepEqual(new Set(availableKinds), new Set(summary.sourceAllowedKinds),
    'The live editor must expose exactly the kinds permitted by this confirmed printed scenario.');
  assert.equal(await panel.getByRole('button', { name: 'Assign private loyalty', exact: true }).count(), 1);

  let coveredHolders = 0;
  const retryEvidence = { serverReceiptCommitted: false, retryAvailableAfterLostAck: false, exactRequestReplay: false };
  let intercepted = false, firstRequestBody, firstRouteCommitted, replayMatched;
  const routePattern = `**/${projectId}/us-central1/assignLoyalty`;
  await gm.page.route(routePattern, async route => {
    if (!intercepted) {
      intercepted = true;
      firstRequestBody = route.request().postData();
      const response = await route.fetch();
      retryEvidence.serverReceiptCommitted = response.status() === 200;
      firstRouteCommitted?.();
      await route.fulfill({ status: 503, contentType: 'application/json',
        body: JSON.stringify({ error: { status: 'UNAVAILABLE', message: 'proof-only lost acknowledgement' } }) }).catch(() => undefined);
      return;
    }
    if (firstRequestBody !== undefined && route.request().postData() === firstRequestBody) {
      retryEvidence.exactRequestReplay = true;
      replayMatched?.();
    }
    await route.continue();
  });
  const receiptCommitted = new Promise(resolvePromise => { firstRouteCommitted = resolvePromise; });
  const exactReplayObserved = new Promise(resolvePromise => { replayMatched = resolvePromise; });
  try {
    for (let index = 0; index < plan.length; index += 1) {
      await assertLiveSetupAuthority(gm, authority);
      const entry = plan[index];
      const targetLabel = await optionLabelForRole(holderSelect, entry.holderRoleId);
      await holderSelect.selectOption({ label: targetLabel });
      await kindSelect.selectOption(entry.kind);
      if (entry.partnerRoleId) {
        const partnerSelect = panel.getByLabel('Reciprocal Friend partner', { exact: true });
        const partnerLabel = await optionLabelForRole(partnerSelect, entry.partnerRoleId);
        await partnerSelect.selectOption({ label: partnerLabel });
      }
      const assign = panel.getByRole('button', { name: 'Assign private loyalty', exact: true });
      await assign.waitFor({ state: 'visible' });
      assert.equal(await assign.isEnabled(), true, 'Only source-valid current holders and choices are submitted.');
      await assign.click();
      if (index === 0) {
        await receiptCommitted;
        const retry = panel.getByRole('button', { name: 'Retry exact request', exact: true });
        await retry.waitFor({ state: 'visible' });
        retryEvidence.retryAvailableAfterLostAck = true;
        await retry.click();
        await exactReplayObserved;
        await gm.page.unroute(routePattern);
        assert.equal(retryEvidence.serverReceiptCommitted, true);
        assert.equal(retryEvidence.retryAvailableAfterLostAck, true);
        assert.equal(retryEvidence.exactRequestReplay, true);
      }
      coveredHolders += entry.partnerRoleId ? 2 : 1;
      await waitForCoverage(gm.page, coveredHolders, summary.holderCount);
    }
  } finally {
    if (intercepted) await gm.page.unroute(routePattern).catch(() => undefined);
  }
  await assertLiveSetupAuthority(gm, authority);
  await waitForCoverage(gm.page, summary.holderCount, summary.holderCount);
  assert.equal(await startBlockers.count(), 0, 'The server-projected optional scenario blockers must clear before start.');
  assert.equal(await panel.getByRole('list', { name: 'Loyalty setup blockers', exact: true }).count(), 0,
    'The live GM authority and casting window must remain valid through each assignment.');
  const start = gm.page.getByRole('button', { name: 'Start full-game demo // Advance to Cycle 1', exact: true });
  assert.equal(await start.isEnabled(), true, 'Normal start is offered only after complete server-projected coverage.');
  await writeFile(`${directory}/loyalty-setup.json`, `${JSON.stringify({ ...summary,
    assignmentReceipts: plan.length, aggregateCoverageComplete: true, sourceBlockersClear: true,
    startEnabledAfterCoverage: true, exactReceiptRetry: retryEvidence, editor,
    gmAuthority: 'live authenticated GM instance', sourceChoice: 'explicit printed option selected in Cycle 0 Settings' }, null, 2)}\n`);
  return { summary, retryEvidence, editor };
}

async function enterActorStation({ crew, actor, sessionId, expectedKind, expectedPartnerRoleId }) {
  await crew.page.getByLabel('Current actor', { exact: true }).selectOption(actor.roleId);
  await crew.page.waitForURL(url => url.searchParams.get('demoActor') === `${sessionId}~${actor.roleId}` && url.hash === '#/demo-actors');
  const member = await crew.until(`Real ${actor.roleId} persona restored`, state =>
    state.sameActor && state.profileRoleId === actor.roleId && state.connection === 'live' && state.freshness === 'server');
  assertSelectedActor(member, { ...actor, sessionId });
  assert.equal(member.privateLoyaltyPresent, true);
  const projection = await actorState(crew, expectedKind);
  assert.equal(projection.sameAuthenticatedReader, true);
  assert.equal(projection.expectedPrivateKind, true, 'Only the selected real actor receives its assigned kind.');
  if (expectedKind === 'friend') {
    assert.equal(projection.friendPartnerRoleId, expectedPartnerRoleId,
      'The Friend partner role is privately reciprocal on each authenticated actor.');
  }
  await crew.page.getByRole('link', { name: "Enter this actor's stations", exact: true }).click();
  if (actor.roleId === 'press-officer') {
    await crew.page.getByRole('link', { name: 'Press Officer', exact: true }).click();
  } else {
    await crew.page.getByRole('link', { name: 'Open private brief', exact: true }).click();
    const brief = await crew.until('Private brief belongs to the selected actor', state =>
      state.briefMatchesActor && state.briefRoleId === actor.roleId);
    assert.equal(brief.sameActor, true);
    await crew.page.locator('.role-brief-screen').getByRole('link', { name: /^(?:←\s*)?Back to stations$/ }).click();
    await crew.page.locator(`a[href$="/roles/${actor.roleId}"]`).click();
  }
  const station = await crew.until(`Current ${actor.roleId} station entered`, state =>
    state.activeConsoleRoleId === actor.roleId && state.sameActor && state.connection === 'live');
  assert.equal(station.profileRoleId, actor.roleId);
  return projection;
}

async function exerciseAndroidLateReply({ crew, sessionId, androidRoleId, fleetRoleId, projectId }) {
  const routePattern = `**/${projectId}/us-central1/revealAndroidProof`;
  let releaseResponse, resolveRouted;
  const holdResponse = new Promise(resolvePromise => { releaseResponse = resolvePromise; });
  const routedDone = new Promise(resolvePromise => { resolveRouted = resolvePromise; });
  let serverStatus = null;
  await crew.page.route(routePattern, async route => {
    const response = await route.fetch();
    serverStatus = response.status();
    await holdResponse;
    await route.fulfill({ response }).catch(() => undefined);
    resolveRouted();
  });
  try {
    await crew.page.getByRole('button', { name: 'Disclose Android proof', exact: true }).click();
    const deadline = Date.now() + 60_000;
    while (serverStatus === null && Date.now() < deadline) await delay(100);
    assert.equal(serverStatus, 200, 'The current Android holder must commit the normal authenticated action.');
    const oldDocument = await crew.page.evaluate(() => {
      window.__pc10ProofDocument ??= crypto.randomUUID(); return window.__pc10ProofDocument;
    });
    await crew.page.getByLabel('Current actor', { exact: true }).selectOption(fleetRoleId);
    await crew.page.waitForURL(url => url.searchParams.get('demoActor') === `${sessionId}~${fleetRoleId}` && url.hash === '#/demo-actors');
    await crew.until('Different real actor restored while the Android response is pending', state =>
      state.sameActor && state.profileRoleId === fleetRoleId && state.connection === 'live' && state.freshness === 'server');
    const fleetPrivate = await actorState(crew, 'fleet-loyalist');
    assert.equal(fleetPrivate.sameAuthenticatedReader, true);
    assert.equal(fleetPrivate.expectedPrivateKind, true);
    const newDocument = await crew.page.evaluate(() => {
      window.__pc10ProofDocument ??= crypto.randomUUID(); return window.__pc10ProofDocument;
    });
    assert.notEqual(newDocument, oldDocument, 'Actor switching replaces the document before the old reply returns.');
    releaseResponse();
    await routedDone;
    await crew.page.unroute(routePattern).catch(() => undefined);
    const unchanged = await actorState(crew, 'fleet-loyalist');
    assert.equal(unchanged.sameAuthenticatedReader, true);
    assert.equal(unchanged.expectedPrivateKind, true);
    assert.equal(unchanged.noAndroidProofOnOtherCard, true, 'A late Android reply cannot alter a different actor card.');

    await crew.page.getByLabel('Current actor', { exact: true }).selectOption(androidRoleId);
    await crew.page.waitForURL(url => url.searchParams.get('demoActor') === `${sessionId}~${androidRoleId}` && url.hash === '#/demo-actors');
    const android = await crew.until('Original Android persona reopened under its saved account', state =>
      state.sameActor && state.profileRoleId === androidRoleId && state.connection === 'live' && state.freshness === 'server');
    assert.equal(android.privateLoyaltyPresent, true);
    await crew.page.getByRole('link', { name: "Enter this actor's stations", exact: true }).click();
    await crew.page.getByRole('link', { name: 'Open private brief', exact: true }).click();
    await crew.until('Android brief restored under its authenticated identity', state =>
      state.briefMatchesActor && state.briefRoleId === androidRoleId);
    await crew.page.locator('.role-brief-screen').getByRole('link', { name: /^(?:←\s*)?Back to stations$/ }).click();
    await crew.page.locator(`a[href$="/roles/${androidRoleId}"]`).click();
    await crew.until('Android station restored with its private proof', state =>
      state.sameActor && state.activeConsoleRoleId === androidRoleId);
    const restored = await actorState(crew, 'android');
    assert.equal(restored.sameAuthenticatedReader, true);
    assert.equal(restored.expectedPrivateKind, true);
    assert.equal(restored.androidProofRevealed, true, 'The committed disclosure is visible after ordinary recovery.');
    return { serverCommittedBeforeActorSwitch: true, differentActorDocumentLoadedBeforeReply: true,
      otherActorCardUnchangedAfterLateReply: true, originalAndroidProjectionRecovered: true };
  } finally {
    releaseResponse?.();
    await crew.page.unroute(routePattern).catch(() => undefined);
  }
}

async function exerciseActorRecoveryAndRepeat({ crew, initial, roster, byRole }) {
  const lastActor = roster.at(-1);
  const firstActor = roster[0];
  assert.ok(firstActor && lastActor);
  const lastExpected = byRole.get(lastActor.roleId);
  await enterActorStation({ crew, actor: lastActor, sessionId: initial.sessionId,
    expectedKind: lastExpected.kind, expectedPartnerRoleId: lastExpected.partnerRoleId });
  const beforeReload = await crew.observe();
  assertSelectedActor(beforeReload, { ...lastActor, sessionId: initial.sessionId });
  assert.equal(beforeReload.pendingCommandCount, 0, 'The selected original actor must have no queued work before reload.');
  await crew.page.reload();
  const recovered = await crew.until('Original admitted actor recovered through normal Auth and server projection', state =>
    state.sameActor && state.profileRoleId === lastActor.roleId && state.sessionId === initial.sessionId &&
    state.connection === 'live' && state.freshness === 'server');
  assertSelectedActor(recovered, { ...lastActor, sessionId: initial.sessionId });
  assert.equal(recovered.pendingCommandCount, 0, 'Reload must not expose another actor’s queued work.');
  const recoveredCard = await actorState(crew, byRole.get(lastActor.roleId).kind);
  assert.equal(recoveredCard.sameAuthenticatedReader, true);
  assert.equal(recoveredCard.expectedPrivateKind, true);
  assert.equal(recoveredCard.noAndroidProofOnOtherCard, true);

  for (const actor of [firstActor, lastActor]) {
    const expected = byRole.get(actor.roleId);
    // Repeat through the ordinary selector and normal Firebase Auth persistence.
    const stationProjection = await enterActorStation({ crew, actor, sessionId: initial.sessionId,
      expectedKind: expected.kind, expectedPartnerRoleId: expected.partnerRoleId });
    assert.equal(stationProjection.expectedPrivateKind, true);
    const repeated = await crew.observe();
    assertSelectedActor(repeated, { ...actor, sessionId: initial.sessionId });
    assert.equal(repeated.pendingCommandCount, 0, 'Repeated selection must keep each ordinary actor outbox isolated.');
  }
  return { sameRealUidRecoveredAfterReload: true, privateProjectionRecovered: true,
    pendingCommandsAfterRecovery: 0, repeatedActorSelections: 2, pendingCommandsAfterRepeats: 0 };
}

async function waitForPrivateProjection(crew, predicate, description, timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await delay(250);
  }
  throw new Error(`${description} did not arrive in the entitled actor projection.`);
}

async function deliverFacilitatorScenarioCall({ mode, gm, directory }) {
  if (mode === 'wolf-cult') {
    const form = gm.page.getByRole('region', { name: 'Wolf Cult intelligence delivery', exact: true });
    await form.waitFor({ state: 'visible' });
    await form.locator('#wolf-cult-fortress').fill('4454'); // Chart A // Active Wolf Fortress.
    await form.locator('#wolf-cult-supplies').fill('6943'); // Chart A // Abandoned Wolf Supply Outpost.
    const agent = form.locator('#wolf-cult-agent');
    const agentUid = await agent.locator('option').first().getAttribute('value');
    assert.ok(agentUid, 'The current GM projection must expose the one separate Wolf Agent.');
    await agent.selectOption(agentUid);
    await form.locator('#wolf-cult-code-word').fill(`training-${randomUUID().slice(0, 8)}`);
    await form.getByRole('button', { name: 'Deliver private Wolf intel', exact: true }).click();
    await form.getByText(/WOLF INTEL DELIVERED \/\/ Cult leader and facilitator only/).waitFor();
    await writeFile(`${directory}/facilitator-private-action.json`, `${JSON.stringify({ mode, delivered: true,
      recipientAudience: 'current entitled Wolf Cult holder and facilitator', privateTextOrIdentityRecorded: false }, null, 2)}\n`);
    return { privateFacilitatorDelivery: true };
  }
  const form = gm.page.getByRole('region', { name: 'Universal Arbour facilitator call', exact: true });
  await form.waitFor({ state: 'visible' });
  await form.locator('#arbour-vision-kind').selectOption('danger');
  await form.locator('#arbour-vision-text').fill('Training exercise // facilitator call; no new location is selected.');
  await form.getByRole('button', { name: 'Publish private call', exact: true }).click();
  await form.getByRole('status').filter({ hasText: 'FACILITATOR CALL' }).waitFor();
  await writeFile(`${directory}/facilitator-private-action.json`, `${JSON.stringify({ mode, delivered: true,
    recipientAudience: 'current entitled Universal Arbour holder', privateTextOrIdentityRecorded: false }, null, 2)}\n`);
  return { privateFacilitatorDelivery: true };
}

async function performWolfCycleAction({ crew, actor, sessionId, expectedKind, action }) {
  const actorProjection = await enterActorStation({ crew, actor, sessionId, expectedKind });
  assertSelectedActor(await crew.observe(), { ...actor, sessionId });
  const before = await readWolfActor(crew);
  const fence = assertLiveWolfActorFence(before, { sessionId, roleId: actor.roleId, uidHash: actor.uidHash, cycle: 1 });
  assert.equal(before.profileRoleId, actor.roleId);
  const receiptEvidence = async (endpoint, reply) => {
    const sdkReplay = await crew.callable(endpoint, reply.requestData);
    assert.equal(sdkReplay.status, 'committed');
    assertExactCallableReplay(reply.result, sdkReplay.result);
    assertSameWolfActorFence(fence, await readWolfActor(crew));
    return {
      uiRequestAndReplyCaptured: true,
      exactSdkReplay: true,
      actorFenceStayedStable: true,
    };
  };
  if (action === 'homing-beacon') {
    const beacon = crew.page.getByRole('button', { name: 'Deploy homing beacon', exact: true });
    await beacon.waitFor({ state: 'visible', timeout: 60_000 });
    assert.equal(await beacon.isEnabled(), true,
      'A different original Wolf holder gets its own one-action Cycle 1 choice.');
    const response = await captureCallableResponse(crew.page, 'submitWolfHomingBeacon', () => beacon.click());
    assertWolfCycleActionRequest(response.requestData, before);
    assertWolfCycleActionReply({ action, result: response.result, requestData: response.requestData, actor: before });
    const receipt = await receiptEvidence('submitWolfHomingBeacon', response);
    await crew.page.locator('.private-loyalty-flow').getByRole('status')
      .filter({ hasText: /Homing beacon scheduled/ }).waitFor({ state: 'visible', timeout: 60_000 });
    return { actorProjection, action, completed: true, receipt };
  }
  assert.equal(action, 'provide-intel');
  const message = crew.page.getByLabel('Short handler message', { exact: true });
  await message.waitFor({ state: 'visible', timeout: 60_000 });
  await message.fill('Training proof // private handler action.');
  const send = crew.page.getByRole('button', { name: 'Send private intelligence', exact: true });
  assert.equal(await send.isEnabled(), true,
    'The second original Wolf holder receives its separate one-action Cycle 1 choice.');
  const response = await captureCallableResponse(crew.page, 'submitWolfIntelligence', () => send.click());
  assertWolfCycleActionRequest(response.requestData, before);
  assertWolfCycleActionReply({ action, result: response.result, requestData: response.requestData,
    actor: before, expectedMessage: 'Training proof // private handler action.' });
  const receipt = await receiptEvidence('submitWolfIntelligence', response);
  await crew.page.locator('.private-loyalty-flow').getByRole('status')
    .filter({ hasText: 'Handler message sent privately.' }).waitFor({ state: 'visible', timeout: 60_000 });
  return { actorProjection, action, completed: true, receipt };
}

async function exerciseWolfCycleActions({ mode, crew, gm, initial, started, roster, byRole, directory, privateActionRecipe }) {
  const actors = roster.filter(actor => ['wolf-agent', 'wolf-cult'].includes(byRole.get(actor.roleId)?.kind))
    .map(actor => ({ ...actor, kind: byRole.get(actor.roleId).kind }));
  const plan = buildWolfCycleActionPlan(mode, actors);
  const outcomes = [];
  let supplyActorRoleId = null;
  let supplyOutcome = { status: 'not-run', credited: false,
    reason: 'The opt-in supply-sabotage recipe was not requested for this fresh game.' };
  let cargoPreparation = null;
  if (privateActionRecipe !== undefined) {
    assert.equal(privateActionRecipe, 'supply-sabotage', 'Only the explicit normal-UI supply recipe is supported.');
    const cargoActor = actors.find(actor => actor.roleId === 'executive-officer');
    if (cargoActor) {
      await enterActorStation({ crew, actor: cargoActor, sessionId: initial.sessionId, expectedKind: cargoActor.kind });
      cargoPreparation = await prepareWolfSupplyCargo({ crew, gm, initial, started, roster, directory }, cargoActor);
    } else cargoPreparation = { status: 'blocked', normalCargoLoadObserved: false,
      reason: 'The original optional roster has no entitled Wolf EO for the normal Pallas cargo preparation.' };
    for (const planned of plan) {
      if (cargoPreparation.status !== 'committed') {
        supplyOutcome = { status: 'blocked', credited: false, reason: cargoPreparation.reason };
        break;
      }
      const actor = roster.find(candidate => candidate.roleId === planned.roleId);
      assert.ok(actor);
      await enterActorStation({ crew, actor, sessionId: initial.sessionId, expectedKind: planned.kind });
      const attempt = await runWolfSupplySabotageUiFlow({ crew, gm, actor: planned,
        sessionId: initial.sessionId });
      if (attempt.status === 'committed') {
        supplyActorRoleId = planned.roleId;
        supplyOutcome = attempt;
        break;
      }
      supplyOutcome = attempt;
    }
  }
  for (const planned of plan) {
    if (supplyActorRoleId === planned.roleId) continue;
    const actor = roster.find(candidate => candidate.roleId === planned.roleId);
    assert.ok(actor);
    outcomes.push(await performWolfCycleAction({ crew, actor, sessionId: initial.sessionId,
      expectedKind: planned.kind, action: planned.action }));
  }
  if (privateActionRecipe === 'supply-sabotage' && supplyOutcome.status !== 'committed') {
    // No resource or hidden state is added. Retain one honest regular action for each holder.
    for (const planned of plan) {
      if (outcomes.some(item => item.actorProjection && item.action === planned.action)) continue;
      const actor = roster.find(candidate => candidate.roleId === planned.roleId);
      assert.ok(actor);
      outcomes.push(await performWolfCycleAction({ crew, actor, sessionId: initial.sessionId,
        expectedKind: planned.kind, action: planned.action }));
    }
  }
  const actionKinds = new Set(outcomes.map(item => item.action));
  const result = {
    wolfBeaconAction: actionKinds.has('homing-beacon'),
    wolfIntelligenceAction: actionKinds.has('provide-intel'),
    wolfSupplySabotage: { status: supplyOutcome.status, credited: supplyOutcome.credited === true,
      positiveCurrentCoverCargoObserved: supplyOutcome.positiveCurrentCoverCargoObserved === true,
      uiRequestAndReplyCaptured: supplyOutcome.normalUiRequestCaptured === true && supplyOutcome.exactUiReplyValidated === true,
      exactSdkReplay: supplyOutcome.sameAuthenticatedSdkReplay === true,
      actorAndGroupAuthorityStayedStable: supplyOutcome.actorAndGroupAuthorityStayedStable === true,
      connectionGenerationRevalidatedAfterReconnect: supplyOutcome.connectionGenerationRevalidatedAfterReconnect === true,
      normalCargoPreparation: cargoPreparation,
      suspicionIncreaseValidated: supplyOutcome.suspicionIncreaseValidated === 2,
      floorHalfLossValidated: supplyOutcome.floorHalfLossValidated === true,
      gmAcknowledgementUiAndExactReplay: supplyOutcome.gmAcknowledgementUiAndExactReplay === true,
      playerPrivateAlertReadDenied: supplyOutcome.playerPrivateAlertReadDenied === true,
      actorFreePlayerNoticeRead: supplyOutcome.actorFreePlayerNoticeRead === true,
      reason: supplyOutcome.reason ?? null },
    wolfActionActorCount: actors.length,
    distinctOriginalWolfUids: new Set(actors.map(item => item.uidHash)).size === 2,
    actionsCompletedByDistinctOriginalActors: outcomes.length + Number(supplyOutcome.status === 'committed') === 2,
    physicalConsoleVisit: currentConsoleVisitProofStatus(),
  };
  if (privateActionRecipe === 'supply-sabotage') {
    await writeFile(`${directory}/private-wolf-actions.json`, `${JSON.stringify({
      mode, recipe: privateActionRecipe, status: supplyOutcome.status,
      safeResult: result.wolfSupplySabotage,
      otherWolfActions: outcomes.map(({ action, receipt }) => ({ action, ...receipt })),
      distinctOriginalWolfUids: result.distinctOriginalWolfUids,
      actionsCompletedByDistinctOriginalActors: result.actionsCompletedByDistinctOriginalActors,
      physicalConsoleVisit: result.physicalConsoleVisit,
      privateMappingsOrTextPersisted: false,
      source: 'normal mounted Wolf loyalty controls and authenticated SDK retries; no resource or clock override',
    }, null, 2)}\n`);
  }
  return result;
}

async function exerciseCurrentScenarioActors({ mode, gm, crew, initial, started, roster, plan, directory,
  projectId, privateActionRecipe }) {
  assert.equal(started.cycle, 1);
  assert.equal(started.phase, 'active');
  assert.equal(started.fullGameDemo?.status, 'active');
  assert.equal(started.phaseProgression, 'manual');
  const byRole = privatePlanByRole(plan);
  const firstFleetRoleId = [...byRole.entries()].find(([, entry]) => entry.kind === 'fleet-loyalist')?.[0];
  const androidRoleId = [...byRole.entries()].find(([, entry]) => entry.kind === 'android')?.[0];
  assert.ok(firstFleetRoleId);
  assert.ok(androidRoleId);
  const privateFunctions = {
    privateCardsReadByTheirAuthenticatedHolders: 0,
    allowedKindsRead: Object.fromEntries(summarizeExplicitLoyaltyScenarioPlan(plan, mode).sourceAllowedKinds.map(kind => [kind, false])),
    reciprocalFriendPairReadByBothHolders: false,
    wolfBeaconAction: false,
    wolfIntelligenceAction: false,
    wolfSupplySabotage: { status: 'not-run', credited: false },
    physicalConsoleVisit: currentConsoleVisitProofStatus(),
    intelligenceInvestigation: false,
    androidLateReplyRecovery: null,
    facilitatorDelivery: true,
    cultDeliveryReachedEntitledHolder: false,
    arbourCallReachedEntitledHolder: false,
  };
  let friendHoldersRead = 0;
  for (const actor of roster) {
    const expected = byRole.get(actor.roleId);
    assert.ok(expected, 'Every real admitted role and Press account has one ephemeral plan entry.');
    const projection = await enterActorStation({ crew, actor, sessionId: initial.sessionId,
      expectedKind: expected.kind, expectedPartnerRoleId: expected.partnerRoleId });
    privateFunctions.privateCardsReadByTheirAuthenticatedHolders += 1;
    privateFunctions.allowedKindsRead[expected.kind] = true;
    if (expected.kind === 'friend') friendHoldersRead += 1;

    if (expected.kind === 'wolf-agent' || expected.kind === 'wolf-cult') {
      // Each original holder gets exactly one role-station action in Cycle 1.
      // The two actions are dispatched after the card-read loop so no actor is
      // accidentally asked to spend both one-action choices in the same cycle.
    } else if (expected.kind === 'intelligence-agent') {
      const target = crew.page.getByLabel('Investigation target', { exact: true });
      await target.waitFor({ state: 'visible' });
      const targetValue = await target.locator('option').evaluateAll(options => options.map(option => option.value).find(Boolean) ?? null);
      assert.ok(targetValue, 'A real connected roster actor must be available to the ordinary investigation action.');
      await target.selectOption(targetValue);
      const investigate = crew.page.getByRole('button', { name: 'Run private investigation', exact: true });
      assert.equal(await investigate.isEnabled(), true);
      await investigate.click();
      await crew.page.locator('.private-loyalty-flow').getByRole('status').filter({ hasText: /Cycle 1/ }).waitFor();
      privateFunctions.intelligenceInvestigation = true;
    } else if (expected.kind === 'android' && privateFunctions.androidLateReplyRecovery === null) {
      privateFunctions.androidLateReplyRecovery = await exerciseAndroidLateReply({ crew,
        sessionId: initial.sessionId, androidRoleId: actor.roleId, fleetRoleId: firstFleetRoleId, projectId });
    } else if (expected.kind === 'universal-arbour' && mode === 'universal-arbour') {
      await waitForPrivateProjection(crew, async () => (await actorState(crew, 'universal-arbour')).privateArbourCallPresent,
        'Facilitator call');
      const delivered = await actorState(crew, 'universal-arbour');
      assert.equal(delivered.expectedPrivateKind, true);
      privateFunctions.arbourCallReachedEntitledHolder = true;
    }
    assert.equal(projection.noAndroidProofOnOtherCard, true);
  }
  privateFunctions.reciprocalFriendPairReadByBothHolders = friendHoldersRead === 2;
  Object.assign(privateFunctions, await exerciseWolfCycleActions({ mode, gm, crew, initial, started, roster, byRole,
    directory, privateActionRecipe }));
  if (mode === 'wolf-cult') {
    const cultActor = roster.find(actor => byRole.get(actor.roleId)?.kind === 'wolf-cult');
    assert.ok(cultActor);
    await enterActorStation({ crew, actor: cultActor, sessionId: initial.sessionId, expectedKind: 'wolf-cult' });
    await waitForPrivateProjection(crew, async () => (await actorState(crew, 'wolf-cult')).privateCultDeliveryPresent,
      'Facilitator intelligence');
    const delivered = await actorState(crew, 'wolf-cult');
    assert.equal(delivered.expectedPrivateKind, true);
    privateFunctions.cultDeliveryReachedEntitledHolder = true;
  }
  assert.equal(privateFunctions.privateCardsReadByTheirAuthenticatedHolders, 21);
  assert.ok(Object.values(privateFunctions.allowedKindsRead).every(Boolean));
  assert.equal(privateFunctions.reciprocalFriendPairReadByBothHolders, true);
  if (privateFunctions.wolfSupplySabotage.status !== 'committed') {
    assert.equal(privateFunctions.wolfBeaconAction, true);
    assert.equal(privateFunctions.wolfIntelligenceAction, true);
  } else {
    assert.equal(privateFunctions.wolfSupplySabotage.credited, true);
    assert.equal(privateFunctions.actionsCompletedByDistinctOriginalActors, true);
    assert.ok(privateFunctions.wolfBeaconAction || privateFunctions.wolfIntelligenceAction,
      'The non-sabotage Wolf actor must spend its separate Cycle 1 action through its own UI.');
  }
  assert.equal(privateFunctions.intelligenceInvestigation, true);
  assert.ok(privateFunctions.androidLateReplyRecovery);
  if (mode === 'wolf-cult') assert.equal(privateFunctions.cultDeliveryReachedEntitledHolder, true);
  if (mode === 'universal-arbour') assert.equal(privateFunctions.arbourCallReachedEntitledHolder, true);
  privateFunctions.actorRecoveryAndRepeat = await exerciseActorRecoveryAndRepeat({ crew, initial, roster, byRole });
  await writeFile(`${directory}/private-role-actions.json`, `${JSON.stringify({ mode, privateFunctions,
    privateTextOrIdentityRecorded: false, source: 'normal role-station controls and authenticated SDK callables' }, null, 2)}\n`);
  return privateFunctions;
}

async function runScenario(mode, options = {}) {
  assert.ok(MODES.includes(mode), 'Choose Wolf Cult or Universal Arbour for a fresh session.');
  const driverOptions = options.driverOptions ?? {};
  const runEnding = options.runEnding ?? driverOptions.runEnding;
  assert.equal(typeof runEnding, 'function', 'Supply the genuine manual game ending callback.');
  const parentDirectory = resolve(options.evidenceDirectory ?? process.env.PC10_EVIDENCE_DIRECTORY ??
    '/tmp/dow-pc10-evidence/explicit-loyalty');
  const directory = resolve(options.directory ?? driverOptions.directory ?? `${parentDirectory}/${mode}`);
  await mkdir(directory, { recursive: true });
  const projectId = driverOptions.projectId ?? process.env.PC10_DEMO_PROJECT ?? 'demo-pc10-owner';
  let plan = null, initialCensus = null, gmAuthority = null, assignment = null;
  let privateFunctions = null;
  const proofCallbacks = {
    onSetup: async ({ gm }) => {
      const setup = gm.page.getByRole('region', { name: 'Setup', exact: true });
      const selected = mode === 'wolf-cult' ? 'Disable Wolf Cult' : 'Disable Universal Arbour';
      const enable = mode === 'wolf-cult' ? 'Enable Wolf Cult' : 'Enable Universal Arbour';
      const enableButton = setup.getByRole('button', { name: enable, exact: true });
      if (await enableButton.isVisible().catch(() => false)) await enableButton.click();
      await setup.getByRole('button', { name: selected, exact: true }).waitFor();
    },
    onBeforeStart: async ({ gm, initial, roster }) => {
      assert.equal(roster.length, 21, 'One original authenticated account must hold each core role and claimed Press station.');
      plan = buildExplicitLoyaltyScenarioPlan(roster.map(actor => actor.roleId), mode);
      const snapshot = await readInitialCensus(gm, roster.length);
      initialCensus = assertFreshOptionalLoyaltySetup(snapshot, { mode, sessionId: initial.sessionId });
      await writeFile(`${directory}/initial-census-read.json`, `${JSON.stringify({ ...initialCensus,
        reader: 'live current authenticated GM server projection', privateRowsOrMappingsPersisted: false }, null, 2)}\n`);
      gmAuthority = await gm.observe();
      assert.equal(gmAuthority.sessionId, initial.sessionId);
      assert.equal(gmAuthority.sameActor, true);
      assert.equal(gmAuthority.playerRole, 'gm');
      assert.equal(gmAuthority.gmInstanceOwned, true);
      assert.equal(gmAuthority.connection, 'live');
      assert.equal(gmAuthority.freshness, 'server');
      assert.equal(gmAuthority.cycle, 0);
      assert.ok(['lobby', 'casting'].includes(gmAuthority.phase));
      assert.equal(gmAuthority.fullGameDemo?.status, 'preparing');
      assignment = await assignRecords({ gm, plan, directory, mode, projectId,
        authority: { sessionId: initial.sessionId, uidHash: gmAuthority.uidHash, instanceId: gmAuthority.instanceId } });
    },
    onStarted: async ({ gm, crew, initial, started, roster }) => {
      const current = await gm.observe();
      assert.equal(current.sessionId, initial.sessionId);
      assert.equal(current.sameActor, true);
      assert.equal(current.gmInstanceOwned, true);
      assert.equal(current.cycle, 1);
      assert.equal(current.phase, 'active');
      assert.equal(current.fullGameDemo?.status, 'active');
      assert.equal(current.phaseProgression, 'manual');
      const facilitator = await deliverFacilitatorScenarioCall({ mode, gm, directory });
      const actions = await exerciseCurrentScenarioActors({ mode, gm, crew, initial, started, roster,
        plan, directory, projectId, privateActionRecipe: options.privateActionRecipe });
      privateFunctions = { ...facilitator, ...actions };
    },
  };
  const ending = async context => runEnding({ ...context, mode });
  const merged = mergeOptionalLoyaltyCallbacks({ ...driverOptions,
    playerCount: 20, includePress: true, chartId: 'A', directory, runEnding: ending, gameplayOnly: true }, proofCallbacks);
  const result = await runFreshFullGameDemoUi(merged);
  assert.equal(result.genuineEndingSupplied, true, 'The genuine manual ending callback must complete the session.');
  const privateEndpoints = ['assignLoyalty', 'submitWolfHomingBeacon', 'submitWolfIntelligence',
    'submitWolfSupplySabotage', 'acknowledgeWolfHackingAlert', 'investigateAsIntelligenceAgent',
    'revealAndroidProof', 'deliverWolfCultIntelligence', 'authorArbourVision'];
  const callableReceipts = Object.fromEntries(privateEndpoints.map(endpoint => {
    const observed = result.calls.filter(call => call.endpoint === endpoint);
    return [endpoint, { responsesObserved: observed.length,
      successfulResponses: observed.filter(call => call.status >= 200 && call.status < 300).length }];
  }));
  const safeSummary = {
    mode,
    sourceCommit: result.sourceCommit,
    builtRuntimeIndexSha256: result.builtRuntimeIndexSha256,
    actualBrowserProcesses: result.actualBrowserProcesses,
    actualBrowserContexts: result.actualBrowserContexts,
    actualAuthenticatedActors: result.actualAuthenticatedActors,
    initialCensus,
    loyalty: summarizeExplicitLoyaltyScenarioPlan(plan, mode),
    assignmentRetry: assignment.retryEvidence,
    privateFunctions,
    callableReceipts,
    genuineEndingObserved: result.genuineEndingSupplied,
    terminalOrEndingBranch: result.ending?.debriefSource ?? 'not supplied',
    privateMappingsOrTextPersisted: false,
    wholeGameProof: false,
    scope: 'Fresh authenticated optional loyalty composition and private role functions with root-supplied genuine ending; final full-function acceptance remains separately owned.',
  };
  await writeFile(`${directory}/optional-loyalty-acceptance.json`, `${JSON.stringify(safeSummary, null, 2)}\n`);
  return safeSummary;
}

/** Run two separate fresh games sequentially, since Cult and Arbour are exclusive setups. */
export async function runFreshOptionalLoyaltyProof(options = {}) {
  const modes = options.modes ?? MODES;
  assert.ok(Array.isArray(modes) && modes.length > 0);
  assert.equal(new Set(modes).size, modes.length, 'Each optional scenario gets its own fresh session exactly once.');
  assert.ok(modes.every(mode => MODES.includes(mode)));
  const results = [];
  const baseDirectory = resolve(options.evidenceDirectory ?? options.directory ?? options.driverOptions?.directory ??
    process.env.PC10_EVIDENCE_DIRECTORY ?? '/tmp/dow-pc10-evidence/explicit-loyalty');
  for (const mode of modes) {
    results.push(await runScenario(mode, { ...options, directory: resolve(baseDirectory, mode) }));
  }
  return results;
}

export async function runFreshOptionalLoyaltyScenario(mode, options = {}) {
  return runScenario(mode, options);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const endingModule = process.env.PC10_DEMO_ENDING_DRIVER;
  assert.ok(endingModule, 'Set PC10_DEMO_ENDING_DRIVER to the root-owned genuine ending callback module.');
  const { runEnding } = await import(pathToFileURL(resolve(endingModule)).href);
  const modes = process.argv.slice(2).length > 0 ? process.argv.slice(2) : MODES;
  runFreshOptionalLoyaltyProof({ runEnding, modes }).then(results => {
    console.log(JSON.stringify({ status: 'passed', scenarios: results.map(result => ({
      mode: result.mode, sourceCommit: result.sourceCommit, genuineEndingObserved: result.genuineEndingObserved,
      directory: resolve(process.env.PC10_EVIDENCE_DIRECTORY ?? '/tmp/dow-pc10-evidence/explicit-loyalty', result.mode),
    })), privateMappingsOrTextPersisted: false, wholeGameProof: false }));
  }).catch(error => {
    console.error(JSON.stringify({ status: 'failed', message: error.message }));
    process.exitCode = 1;
  });
}
