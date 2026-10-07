import { observeUiReceipt } from './pc10-browser-ui-receipt.mjs';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  assertActorFreePlayerNotice,
  assertExactCallableReplay,
  assertLiveWolfActorFence,
  assertSameWolfActorFence,
  assertWolfCycleActionRequest,
  assertWolfSupplyRequest,
  assertWolfSupplySabotageResult,
  blockedPhysicalConsoleBranch,
} from './pc10-private-actions-proof-contracts.mjs';

function hash(value) {
  return createHash('sha256').update(String(value)).digest('hex').slice(0, 16);
}

export async function readWolfActor(crew) {
  return crew.page.evaluate(async storeUrl => {
    const [{ auth }, { useSessionStore }, { activeDemoActorProfile }] = await Promise.all([
      import('/src/lib/firebase.ts'), import(storeUrl), import('/src/lib/demoActorContext.ts'),
    ]);
    const state = useSessionStore.getState();
    const me = state.me;
    const session = state.session;
    const user = auth().currentUser;
    const uidHash = user?.uid
      ? Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(user.uid))))
        .map(byte => byte.toString(16).padStart(2, '0')).join('').slice(0, 16)
      : null;
    return {
      authUid: user?.uid ?? null,
      uid: me?.uid ?? null,
      uidHash,
      sessionId: session?.id ?? null,
      playerRole: me?.role ?? null,
      profileRoleId: activeDemoActorProfile?.roleId ?? null,
      assignedRoleId: me?.assignedRoleId ?? null,
      activeConsoleRoleId: me?.activeConsoleRoleId ?? null,
      fleetGroupId: me?.fleetGroupId ?? null,
      connectionGeneration: me?.connectionGeneration ?? null,
      connected: me?.connected === true,
      cycle: session?.currentTurn ?? null,
      phase: session?.phase ?? null,
      connection: state.connection,
      freshness: state.sessionSnapshotFreshness,
      replacementRoleId: me?.replacementRoleId ?? null,
      replacementStatus: me?.replacementStatus ?? null,
      escapeState: me?.escapeState ?? null,
      loyaltyKind: state.privateLoyalty?.kind ?? null,
      suspicion: state.privateLoyalty?.suspicion ?? null,
    };
  }, crew.storeModuleUrl());
}

async function readGmAuthority(gm) {
  return gm.page.evaluate(async storeUrl => {
    const { auth } = await import('/src/lib/firebase.ts');
    const { useSessionStore } = await import(storeUrl);
    const state = useSessionStore.getState();
    const user = auth().currentUser;
    return {
      authUid: user?.uid ?? null,
      uid: state.me?.uid ?? null,
      sessionId: state.session?.id ?? null,
      role: state.me?.role ?? null,
      instanceId: state.gmInstance?.id ?? null,
      instanceUid: state.gmInstance?.uid ?? null,
      instanceSessionId: state.gmInstance?.sessionId ?? null,
      cycle: state.session?.currentTurn ?? null,
      phase: state.session?.phase ?? null,
      connection: state.connection,
      freshness: state.sessionSnapshotFreshness,
    };
  }, gm.storeModuleUrl());
}

function assertGmAuthority(snapshot, expectedSessionId) {
  assert.ok(snapshot.authUid && snapshot.uid && snapshot.authUid === snapshot.uid);
  assert.equal(snapshot.sessionId, expectedSessionId);
  assert.equal(snapshot.role, 'gm');
  assert.ok(snapshot.instanceId);
  assert.equal(snapshot.instanceUid, snapshot.uid);
  assert.equal(snapshot.instanceSessionId, expectedSessionId);
  assert.equal(snapshot.cycle, 1);
  assert.equal(snapshot.phase, 'active');
  assert.equal(snapshot.connection, 'live');
  assert.equal(snapshot.freshness, 'server');
}

function assertSameGmAuthority(before, after) {
  for (const key of ['authUid', 'uid', 'sessionId', 'role', 'instanceId', 'instanceUid',
    'instanceSessionId', 'cycle', 'phase', 'connection', 'freshness']) {
    assert.equal(after[key], before[key], `Facilitator authority changed at ${key}.`);
  }
}

export async function captureCallableResponse(page, endpoint, choose) {
  const attempt = await captureCallableAttempt(page, endpoint, choose);
  assert.equal(attempt.status, 200, `${endpoint} must commit through the ordinary authenticated UI.`);
  assert.ok(attempt.body && attempt.body.result && typeof attempt.body.result === 'object');
  return { requestData: attempt.requestData, result: attempt.body.result };
}

export async function captureCallableAttempt(page, endpoint, choose) {
  const response = await observeUiReceipt({ page, consumed: { endpoint },
    waitForResponse: () => page.waitForResponse(response => {
      const url = new URL(response.url());
      return response.request().method() === 'POST' &&
        url.pathname.endsWith(`/us-central1/${endpoint}`);
    }, { timeout: 60_000 }),
    choose,
  });
  const envelope = response.request().postDataJSON();
  assert.ok(envelope && envelope.data && typeof envelope.data === 'object');
  return { status: response.status(), requestData: envelope.data, body: await response.json() };
}

async function readVisiblePositiveCargoTarget(crew) {
  const select = crew.page.getByLabel('Shuttle cargo target', { exact: true });
  await select.waitFor({ state: 'visible', timeout: 60_000 });
  const options = await select.locator('option').evaluateAll(nodes => nodes
    .filter(node => node.value)
    .map(node => ({ value: node.value, label: node.textContent?.trim() ?? '' })));
  for (const option of options) {
    const amount = option.label.match(/\((\d+)\)\s*$/)?.[1];
    const [shuttleId, resourceId] = option.value.split('|');
    if (!amount || !shuttleId || !resourceId || !Number.isSafeInteger(Number(amount)) || Number(amount) <= 0) continue;
    return { value: option.value, label: option.label, shuttleId, resourceId, amount: Number(amount) };
  }
  return null;
}

async function readProjectedCargo(crew, shuttleId, resourceId) {
  return crew.page.evaluate(async ({ storeUrl, shuttleId, resourceId }) => {
    const { useSessionStore } = await import(storeUrl);
    const session = useSessionStore.getState().session;
    return session?.shuttleCargo?.[shuttleId]?.[resourceId] ?? null;
  }, { storeUrl: crew.storeModuleUrl(), shuttleId, resourceId });
}

async function inspectPlayerPrivateAlertRead(crew, sessionId, alertId) {
  return crew.page.evaluate(async ({ sessionId, alertId }) => {
    const { db } = await import('/src/lib/firestore.ts');
    const firestoreUrl = performance.getEntriesByType('resource')
      .map(entry => entry.name)
      .find(name => name.includes('/node_modules/.vite/deps/firebase_firestore.js')) ??
      '/node_modules/.vite/deps/firebase_firestore.js';
    const { doc, getDoc } = await import(firestoreUrl);
    try {
      const snapshot = await getDoc(doc(db(), `sessions/${sessionId}/wolfHackingAlerts/${alertId}`));
      return { status: snapshot.exists() ? 'read' : 'missing' };
    } catch (cause) {
      return { status: 'denied', code: cause?.code ?? null };
    }
  }, { sessionId, alertId });
}

async function readActorFreeNotice(crew, sessionId, noticeId) {
  return crew.page.evaluate(async ({ sessionId, noticeId }) => {
    const { db } = await import('/src/lib/firestore.ts');
    const firestoreUrl = performance.getEntriesByType('resource')
      .map(entry => entry.name)
      .find(name => name.includes('/node_modules/.vite/deps/firebase_firestore.js')) ??
      '/node_modules/.vite/deps/firebase_firestore.js';
    const { doc, getDoc } = await import(firestoreUrl);
    const snapshot = await getDoc(doc(db(), `sessions/${sessionId}/playerHackingNotices/${noticeId}`));
    if (!snapshot.exists()) return { exists: false };
    const value = snapshot.data();
    return {
      exists: true,
      keys: Object.keys(value).sort(),
      id: noticeId,
      type: value.type,
      sessionId: value.sessionId,
      sequence: value.sequence,
      createdAtPresent: value.createdAt != null,
    };
  }, { sessionId, noticeId });
}

function safeOutcome(status, fields = {}) {
  return {
    status,
    credited: status === 'committed',
    normalUiRequestCaptured: status === 'committed',
    exactUiReplyValidated: status === 'committed',
    sameAuthenticatedSdkReplay: status === 'committed',
    positiveCurrentCoverCargoObserved: status === 'committed',
    floorHalfLossValidated: status === 'committed',
    suspicionIncreaseValidated: status === 'committed' ? 2 : 0,
    oneActionControlsDisabled: status === 'committed',
    gmPrivateAlertObserved: status === 'committed',
    gmAcknowledgementUiAndExactReplay: status === 'committed',
    playerPrivateAlertReadDenied: status === 'committed',
    actorFreePlayerNoticeRead: status === 'committed',
    rawUidGroupRequestAlertOrCluePersisted: false,
    physicalConsoleVisit: blockedPhysicalConsoleBranch(),
    ...fields,
  };
}

async function writeOutcome(directory, result) {
  if (!directory) return;
  await mkdir(directory, { recursive: true });
  await writeFile(resolve(directory, 'wolf-supply-sabotage-ui.json'), `${JSON.stringify(result, null, 2)}\n`);
}

/**
 * Use only the already-mounted Wolf loyalty form and current Auth identities.
 * No fixture, resource edit, hidden callback, direct gameplay write, or clock
 * control is available through this recipe.
 */
export async function runWolfSupplySabotageUiFlow({ crew, gm, actor, sessionId, directory }) {
  assert.ok(crew && gm && actor);
  const before = await readWolfActor(crew);
  const beforeHash = hash(before.authUid ?? '');
  assert.equal(beforeHash, actor.uidHash, 'The selected original account must match the ordinary roster actor.');
  const fenced = assertLiveWolfActorFence(before, {
    sessionId,
    roleId: actor.roleId,
    uidHash: actor.uidHash,
    cycle: 1,
  });
  assert.equal(before.profileRoleId, actor.roleId);
  assert.equal(before.loyaltyKind === 'wolf-agent' || before.loyaltyKind === 'wolf-cult', true);
  assert.ok(Number.isSafeInteger(before.suspicion) && before.suspicion >= 0);

  const target = await readVisiblePositiveCargoTarget(crew);
  if (!target) {
    const blocked = safeOutcome('blocked', {
      credited: false,
      normalUiRequestCaptured: false,
      positiveCurrentCoverCargoObserved: false,
      reason: 'No positive cargo option is currently rendered for this original Wolf cover role; a normal served cargo-load stage is required. No mutation was attempted.',
    });
    await writeOutcome(directory, blocked);
    return blocked;
  }

  const cargoState = await readProjectedCargo(crew, target.shuttleId, target.resourceId);
  assert.equal(cargoState, target.amount, 'The selected amount must be the live session projection, not a fixture.');

  const supplyTarget = crew.page.getByLabel('Shuttle cargo target', { exact: true });
  await supplyTarget.selectOption(target.value);
  const sabotage = crew.page.getByRole('button', { name: 'Sabotage selected supply', exact: true });
  assert.equal(await sabotage.isEnabled(), true, 'The ordinary active Wolf control must be enabled for current cover cargo.');
  const committed = await captureCallableResponse(crew.page, 'submitWolfSupplySabotage', () => sabotage.click());
  assertWolfSupplyRequest(committed.requestData, { ...before, cycle: 1 }, target);
  assertWolfSupplySabotageResult({ result: committed.result, requestData: committed.requestData,
    actor: before, startingCargo: target.amount, oldSuspicion: before.suspicion });
  const actionStatus = crew.page.locator('.private-loyalty-flow').getByRole('status')
    .filter({ hasText: /destroyed; .*remain\. Suspicion/ });
  await actionStatus.waitFor({ state: 'visible', timeout: 60_000 });

  const after = await readWolfActor(crew);
  assertSameWolfActorFence(fenced, after);
  assert.equal(hash(after.authUid ?? ''), actor.uidHash);
  const actionControlStates = [];
  for (const name of ['Deploy homing beacon', 'Send private intelligence', 'Sabotage selected supply']) {
    const control = crew.page.getByRole('button', { name, exact: true });
    assert.equal(await control.count(), 1,
      `The current authenticated Wolf panel must keep its ${name} action control mounted.`);
    const disabled = await control.isDisabled();
    assert.equal(disabled, true,
      'The ordinary UI must show the actor has spent the one Wolf action for this cycle.');
    actionControlStates.push({ disabled });
  }

  // A real reconnect advances the connection generation. The actor, cover,
  // group, session, and cycle must still be the same; the old receipt remains
  // recoverable by the same Auth UID and exact original request.
  await crew.page.reload();
  await crew.until('Original Wolf actor reconnected from server state', state =>
    state.sameActor && state.uidHash === actor.uidHash && state.profileRoleId === actor.roleId &&
    state.sessionId === sessionId && state.cycle === 1 && state.phase === 'active' &&
    state.connection === 'live' && state.freshness === 'server' && state.privateLoyaltyPresent);
  const recoveredActor = await readWolfActor(crew);
  const recoveredFence = assertLiveWolfActorFence(recoveredActor,
    { sessionId, roleId: actor.roleId, uidHash: actor.uidHash, cycle: 1 });
  assert.equal(recoveredActor.uid, before.uid);
  assert.equal(recoveredActor.fleetGroupId, before.fleetGroupId);
  assert.ok(recoveredActor.connectionGeneration >= before.connectionGeneration);
  assert.equal(await readProjectedCargo(crew, target.shuttleId, target.resourceId), committed.result.remainingAmount,
    'The committed cargo ledger must survive same-actor reconnect.');
  const replay = await crew.callable('submitWolfSupplySabotage', committed.requestData);
  assert.equal(replay.status, 'committed');
  assertExactCallableReplay(committed.result, replay.result);

  const beaconAfterReload = crew.page.getByRole('button', { name: 'Deploy homing beacon', exact: true });
  await beaconAfterReload.waitFor({ state: 'visible', timeout: 60_000 });
  assert.equal(await beaconAfterReload.isEnabled(), true,
    'A fresh component mount clears only local receipt state; the server must reject the new same-actor request.');
  const denied = await captureCallableAttempt(crew.page, 'submitWolfHomingBeacon', () => beaconAfterReload.click());
  assertWolfCycleActionRequest(denied.requestData, recoveredActor);
  assert.ok(denied.status >= 400, 'The server must reject a second same-UID Wolf action in the same cycle.');
  const errorStatus = String(denied.body?.error?.status ?? '').toLowerCase().replaceAll('_', '-');
  assert.equal(errorStatus, 'failed-precondition');
  assert.match(String(denied.body?.error?.message ?? ''), /already submitted its action for the current cycle/i);
  const blockedMessage = crew.page.locator('.private-loyalty-flow').getByRole('alert');
  await blockedMessage.filter({ hasText: /already submitted its action for the current cycle/i })
    .waitFor({ state: 'visible', timeout: 60_000 });
  const deniedReplay = await crew.callable('submitWolfHomingBeacon', denied.requestData);
  assert.equal(deniedReplay.status, 'denied');
  assert.match(String(deniedReplay.code), /failed-precondition/);
  const secondActionBlockMode = 'server-rejected-after-reconnect';
  assertSameWolfActorFence(recoveredFence, await readWolfActor(crew));
  assert.equal(await readProjectedCargo(crew, target.shuttleId, target.resourceId), committed.result.remainingAmount,
    'The blocked second action must not change the committed cargo result.');

  const alertId = committed.result.requestId;
  const playerRead = await inspectPlayerPrivateAlertRead(crew, sessionId, alertId);
  assert.deepEqual(playerRead, { status: 'denied', code: 'permission-denied' },
    'The player SDK must not read the private facilitator alert.');

  const alert = gm.page.locator('[aria-label="Facilitator sabotage alerts"]');
  await alert.getByRole('heading', { name: 'Wolf sabotage committed', exact: true })
    .waitFor({ state: 'visible', timeout: 60_000 });
  const privateAlertText = await alert.innerText();
  assert.match(privateAlertText, /Supply sabotage destroyed/);
  assert.match(privateAlertText, /Clue instruction:/);
  assert.equal(privateAlertText.includes(before.uid), false,
    'The normal GM alert does not reveal the player UID in its visible summary.');
  const gmBefore = await readGmAuthority(gm);
  assertGmAuthority(gmBefore, sessionId);
  const acknowledge = alert.getByRole('button', {
    name: 'Acknowledge alert and clue instruction handled', exact: true,
  });
  const acknowledged = await captureCallableResponse(gm.page, 'acknowledgeWolfHackingAlert', () => acknowledge.click());
  assert.deepEqual(Object.keys(acknowledged.requestData).sort(),
    ['alertId', 'expectedRevision', 'instanceId', 'requestId', 'sessionId'].sort());
  assert.equal(acknowledged.requestData.sessionId, sessionId);
  assert.equal(acknowledged.requestData.instanceId, gmBefore.instanceId);
  assert.equal(acknowledged.requestData.alertId, alertId);
  assert.equal(acknowledged.requestData.expectedRevision, 1);
  assert.ok(typeof acknowledged.requestData.requestId === 'string' && acknowledged.requestData.requestId.length >= 16);
  assert.equal(acknowledged.result.status, 'acknowledged');
  assert.equal(acknowledged.result.type, 'wolf-hacking-alert-acknowledgement');
  assert.equal(acknowledged.result.sessionId, sessionId);
  assert.equal(acknowledged.result.alertId, alertId);
  assert.equal(acknowledged.result.revision, 2);
  const ackReplay = await gm.callable('acknowledgeWolfHackingAlert', acknowledged.requestData);
  assert.equal(ackReplay.status, 'committed');
  assertExactCallableReplay(acknowledged.result, ackReplay.result);
  assertSameGmAuthority(gmBefore, await readGmAuthority(gm));

  const rawNotice = await readActorFreeNotice(crew, sessionId, acknowledged.result.noticeId);
  assert.equal(rawNotice.exists, true);
  assert.deepEqual(rawNotice.keys, ['createdAt', 'sequence', 'sessionId', 'type']);
  assert.equal(rawNotice.createdAtPresent, true);
  assertActorFreePlayerNotice({
    id: rawNotice.id,
    type: rawNotice.type,
    sessionId: rawNotice.sessionId,
    sequence: rawNotice.sequence,
    createdAt: 'server timestamp present',
  }, {
    sessionId,
    noticeId: acknowledged.result.noticeId,
    noticeSequence: acknowledged.result.noticeSequence,
  });
  const overlayMounted = await crew.page.waitForFunction(() =>
    document.querySelector('.intrusion--hostile .intrusion__message') !== null,
    null, { timeout: 60_000 }).then(() => true);
  assert.equal(overlayMounted, true, 'The public notice must reach the current player UI.');

  const complete = safeOutcome('committed', {
    oneActionControlsDisabled: actionControlStates.every(state => state.disabled),
    exactUiRequestAndReplyCaptured: true,
    exactAuthenticatedSdkReplay: true,
    actorAndGroupAuthorityStayedStable: true,
    sameOriginalUidRoleAndGroupAfterReconnect: true,
    connectionGenerationRevalidatedAfterReconnect: true,
    originalReceiptRecoveredAfterReconnect: true,
    sameUidSecondActionBlockedAfterReconnect: true,
    sameUidServerRejectionObserved: true,
    secondActionBlockMode,
    cycleStayedStable: true,
    playerOverlayMounted: overlayMounted,
    publicNoticeHasNoActorOrClue: true,
    clueTextPersisted: false,
  });
  await writeOutcome(directory, complete);
  return complete;
}

/** Source-valid distinction: this connected GM path still needs physical observation. */
export function currentConsoleVisitProofStatus() {
  return blockedPhysicalConsoleBranch();
}

/** Run one separate fresh game per selected optional mode with the opt-in UI recipe. */
export async function runFreshPrivateActionsUiProof(options = {}) {
  const { runFreshOptionalLoyaltyScenario } = await import('./pc10-explicit-loyalty-demo-proof.mjs');
  const modes = options.modes ?? ['wolf-cult', 'universal-arbour'];
  assert.ok(Array.isArray(modes) && modes.length > 0);
  assert.equal(new Set(modes).size, modes.length, 'Each optional mode uses a distinct fresh session.');
  assert.ok(modes.every(mode => mode === 'wolf-cult' || mode === 'universal-arbour'));
  const baseDirectory = resolve(options.evidenceDirectory ?? options.directory ??
    process.env.PC10_EVIDENCE_DIRECTORY ?? '/tmp/dow-pc10-evidence/private-actions-ui');
  const results = [];
  for (const mode of modes) {
    results.push(await runFreshOptionalLoyaltyScenario(mode, {
      ...options,
      directory: resolve(baseDirectory, mode),
      privateActionRecipe: 'supply-sabotage',
    }));
  }
  return results;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const endingModule = process.env.PC10_DEMO_ENDING_DRIVER;
  assert.ok(endingModule, 'Set PC10_DEMO_ENDING_DRIVER to the root-owned genuine ending callback module.');
  const { runEnding } = await import(pathToFileURL(resolve(endingModule)).href);
  const modes = process.argv.slice(2).length > 0 ? process.argv.slice(2) : undefined;
  runFreshPrivateActionsUiProof({ runEnding, modes }).then(results => {
    console.log(JSON.stringify({ status: 'completed', scenarios: results.map(result => ({
      mode: result.mode,
      supplySabotageStatus: result.privateFunctions?.wolfSupplySabotage?.status ?? 'unavailable',
      credited: result.privateFunctions?.wolfSupplySabotage?.credited === true,
      wholeGameProof: false,
    })) }));
  }).catch(error => {
    console.error(JSON.stringify({ status: 'failed', message: error.message }));
    process.exitCode = 1;
  });
}
