import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { observeUiReceipt, retainUiReceiptContext } from './pc10-browser-ui-receipt.mjs';
import { rememberProofFailure, retainProofFailure } from './pc10-proof-failure-evidence.mjs';
import { createTwoBrowserGameplay } from './pc10-two-browser-gameplay.mjs';
import { proofRuntimeFromViteSource, validateProofRuntime } from './pc10-full-game-demo-proof-helpers.mjs';
import { MEMBER_GM_CASES, MEMBER_TURN_SOURCE_PIN, assertOriginalActor, assertLateReplyAuthority,
  assertClearedPrivateState, assertCapturedUiRequest, assertRecoveredResult, fingerprint,
  recoveryProtocol, lifecycleCaseAvailability, assertCallbackContext } from './pc10-member-gm-lifecycle-contracts.mjs';

const observedUiCaptures = new WeakSet();
const uidHash = value => createHash('sha256').update(value).digest('hex').slice(0, 16);

export const MEMBER_TURN_SOURCE_FILES = Object.freeze([
  'src/components/AppHeader.tsx', 'src/components/SettingsDisconnectAction.tsx',
  'src/routes/RoleSelect.tsx', 'src/routes/SessionMode.tsx', 'src/routes/ShipRoleSelect.tsx',
  'src/routes/ShipConsole.tsx', 'src/routes/GmConsole.tsx', 'src/components/TurnStartAnnouncement.tsx',
  'src/components/CycleBriefingClearanceView.tsx', 'src/components/TurnPhaseCoordinator.tsx',
  'src/components/EmergencyTimerPauseControl.tsx', 'src/components/PressConfetti.tsx',
  'src/lib/sessionService.ts', 'src/lib/turnInterstitialService.ts', 'src/lib/demoActorContext.ts',
  'src/store/useSessionStore.ts', 'src/types/game.ts', 'functions/src/index.ts',
  'functions/src/turnInterstitial.ts', 'functions/src/sessionLifecycle.ts', 'functions/src/singlePlayerDemoPolicy.ts',
  'src/lib/firebaseConfig.ts',
]);

/** Read-only binding. The parent must also bind the actually running runtime. */
export async function captureMemberTurnSourceBinding(sourceRoot) {
  const root = resolve(sourceRoot); const sha = async path => createHash('sha256').update(await readFile(path)).digest('hex');
  const sourceSha256 = Object.fromEntries(await Promise.all(MEMBER_TURN_SOURCE_FILES.map(async file => [file, await sha(resolve(root, file))])));
  const compiled = [];
  async function walk(path, prefix = '') {
    for (const entry of await readdir(path, { withFileTypes: true })) {
      const name = `${prefix}${entry.name}`;
      if (entry.isDirectory()) await walk(resolve(path, entry.name), `${name}/`);
      else if (entry.isFile()) compiled.push([name, await sha(resolve(path, entry.name))]);
    }
  }
  try { await walk(resolve(root, 'functions/lib')); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  compiled.sort(([a], [b]) => a.localeCompare(b));
  const callbackSha256 = Object.fromEntries(await Promise.all([
    'pc10-member-gm-lifecycle-contracts.mjs', 'pc10-member-gm-lifecycle-ui-proof.mjs',
    'pc10-turn-cycle-demo-contracts.mjs', 'pc10-turn-cycle-demo-ui-proof.mjs',
  ].map(async name => [name, await sha(new URL(name, import.meta.url))])));
  return { sourceCommit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
    sourceSha256, callbackSha256, compiledFileCount: compiled.length, compiledTreeSha256: compiled.length ? fingerprint(compiled) : null,
    compiledIndexSha256: compiled.find(([name]) => name === 'index.js')?.[1] ?? null,
    bindingLimit: 'Disk source/compiled tree; parent supplies served-runtime and two-browser provenance.' };
}

export async function assertMemberTurnRuntime(surface, options = {}) {
  const url = new URL(surface.page.url());
  assert.ok(['127.0.0.1', 'localhost'].includes(url.hostname));
  const source = await surface.page.evaluate(async () => (await fetch('/src/lib/firebaseConfig.ts')).text());
  return validateProofRuntime(proofRuntimeFromViteSource(source), {
    baseUrl: url.origin, projectId: options.projectId ?? 'demo-pc10-owner',
    ports: options.ports ?? { auth: 9109, functions: 5011, firestore: 8090 },
  });
}

export async function assertMemberTurnContext(context) {
  const gm = await observeLifecycleActor(context.gm), crew = await observeLifecycleActor(context.crew);
  let controllerUidHash;
  if (crew.profileRoleId === 'controller') controllerUidHash = await context.crew.page.evaluate(async () => {
    const { readDemoActorAccountUid } = await import('/src/lib/demoActorContext.ts');
    const uid = readDemoActorAccountUid('controller'); if (!uid) return null;
    return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(uid))))
      .map(byte => byte.toString(16).padStart(2, '0')).join('').slice(0, 16);
  });
  assertCallbackContext(context, gm, crew, controllerUidHash);
}

/** No private contents, raw UID, auth token or command payload leaves the page. */
export async function observeLifecycleActor(surface, expectedSessionId) {
  return surface.page.evaluate(async ({ moduleUrl, expectedSessionId }) => {
    const { auth } = await import('/src/lib/firebase.ts');
    const { useSessionStore } = await import(moduleUrl);
    const s = useSessionStore.getState(), user = auth().currentUser, session = s.session;
    const hash = async value => value ? Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))))
      .map(byte => byte.toString(16).padStart(2, '0')).join('').slice(0, 16) : null;
    const privateKeys = Object.keys(s).filter(key =>
      /^gm[A-Z]/.test(key) && !['gmInstance', 'gmAccessAuthenticatedAt'].includes(key) ||
      ['privateLoyalty', 'roleBrief', 'wolfCult', 'arbourVision', 'intelligenceInvestigation', 'awayMissionHand',
        'facilitatorRuleCall', 'commissarPurgeAuthority', 'candidatePrivateWorkspace'].includes(key));
    let privateCount = 0, privatePayloadCount = 0;
    let pointerDefaultPresent = false, censusStatusPresent = false;
    for (const key of privateKeys) {
      const value = s[key]; // Reuse the original scan; no additional store snapshot or field read.
      const present = value !== null && value !== undefined;
      if (present) privateCount++;
      if (key === 'gmAwayMissionHandPointers') {
        pointerDefaultPresent = true;
        if (!(Array.isArray(value) && value.length === 0 && Reflect.ownKeys(value).length === 1)) {
          privatePayloadCount++;
        }
      } else if (key === 'gmLoyaltyCensusStatus') {
        censusStatusPresent = true;
        if (value !== 'loading') privatePayloadCount++;
      } else if (present) privatePayloadCount++;
    }
    // These two non-nullable Source defaults must be present and valid.
    if (!pointerDefaultPresent) privatePayloadCount++;
    if (!censusStatusPresent) privatePayloadCount++;
    return { sessionId: session?.id ?? null, uidHash: await hash(user?.uid), hasAuth: !!user,
      sameActor: !!user && s.me?.uid === user.uid, connection: s.connection, freshness: s.sessionSnapshotFreshness,
      generation: s.me?.connectionGeneration ?? null, hydrationRevision: s.identityHydrationRevision,
      playerRole: s.me?.role ?? null, profileRoleId: null,
      displayName: s.me?.displayName ?? null, assignedRoleId: s.me?.assignedRoleId ?? null,
      activeConsoleRoleId: s.me?.activeConsoleRoleId ?? null, seatId: s.me?.seatId ?? null,
      instanceId: s.gmInstance?.id ?? null, claimedAt: s.gmInstance?.claimedAt ?? null,
      gmInstanceOwned: !!s.gmInstance && s.gmInstance.uid === user?.uid && s.gmInstance.sessionId === session?.id,
      grantShipId: s.gmInstance?.shipConsoleWriteGrant?.shipId ?? null,
      gmAccessCached: s.gmAccessAuthenticatedAt !== null, phase: session?.phase ?? null,
      cycle: session?.currentTurn ?? null, setupRevision: session?.setupRevision ?? null,
      privateCount, privatePayloadCount,
      privateAudienceMatches: !s.roleBrief || s.roleBrief.assignmentUid === user?.uid,
      pendingCount: s.pendingCommands.length,
      foreignPendingCount: s.pendingCommands.filter(command => command.payload?.sessionId &&
        command.payload.sessionId !== (expectedSessionId ?? session?.id)).length,
      briefingPresent: !!document.querySelector('[aria-label="Cycle briefing clearance"]'),
      transmissionPresent: !!document.querySelector('.intrusion--fleet .turn-start-announcement__console'),
      phaseProgression: session?.turnPhase?.progression ?? null, progression: session?.turnPhase?.progression ?? null,
      airspace: session?.turnPhase?.airspace.state ?? null, timerPause: session?.turnPhase?.timerPause ?? null,
      teamEndsAt: session?.turnPhase?.teamPhaseEndsAt ?? null, openEndsAt: session?.turnPhase?.openAirspaceEndsAt ?? null,
      announcementRevision: session?.turnStartAnnouncement?.revision ?? 0, localReplayToken: s.turnStartReplay?.token ?? null,
      singlePlayerDemo: session?.singlePlayerDemo ?? null, fullGameDemo: session?.fullGameDemo ?? null,
      debriefMode: session?.debriefMode ?? null,
      debriefSnapshot: session?.debriefSnapshot ? { type: session.debriefSnapshot.type,
        version: session.debriefSnapshot.version, source: session.debriefSnapshot.source,
        result: session.debriefSnapshot.result, cause: session.debriefSnapshot.cause,
        cycle: session.debriefSnapshot.cycle } : null,
      pursuitEmergency: Boolean(session?.pursuitEmergencyWindowAuthority ?? session?.pursuitEmergencyWindow),
      // Buttons remain the actual source guard. Absence of this hint never grants authority.
      attackLocked: null };
  }, { moduleUrl: surface.storeModuleUrl(), expectedSessionId });
}

export async function untilLifecycle(surface, expected, predicate, description, { timeout = 60_000, ...authority } = {}) {
  const end = Date.now() + timeout; let current;
  try {
    while (Date.now() < end) {
      current = await observeLifecycleActor(surface, expected.sessionId);
      if (current.hasAuth && current.uidHash !== expected.uidHash) throw new Error(`${description}: original Auth UID changed.`);
      if (current.sessionId !== null && current.sessionId !== expected.sessionId) throw new Error(`${description}: foreign session appeared.`);
      if (current.hasAuth && current.sameActor && current.connection === 'live' && current.freshness === 'server' && predicate(current)) {
        assertOriginalActor(expected, current, authority); return current;
      }
      await delay(200);
    }
    throw new Error(`${description}: ${JSON.stringify(current)}`);
  } catch (error) {
    rememberProofFailure(error, { description, expected, current, authority, timeout });
    throw error;
  }
}

export function publicLifecycleReceipt(capture) {
  return { endpoint: capture.endpoint, protocol: recoveryProtocol(capture.endpoint, capture.data),
    requestFingerprint: fingerprint(capture.endpoint === 'loginGmAccess'
      ? { endpoint: 'loginGmAccess', actualUiRequestCaptured: true, passwordRedacted: true } : capture.data),
    resultFingerprint: fingerprint(capture.result),
    resultDisposition: typeof capture.result === 'string' ? capture.result : capture.result?.status ?? 'response',
    publicResult: capture.result && typeof capture.result === 'object' ? Object.fromEntries([
      'currentTurn', 'cycle', 'setupRevision', 'revision', 'locked', 'enabled', 'authenticated',
      'stationSelectionRequired', 'phase', 'targetInstanceId',
    ].filter(key => Object.hasOwn(capture.result, key)).map(key => [key, capture.result[key]])) : null,
    requestId: capture.data.requestId ?? null, httpStatus: capture.httpStatus,
    shipId: capture.data.shipId ?? null, roleId: capture.data.roleId ?? null,
    targetUidHash: typeof capture.data.targetUid === 'string' ? uidHash(capture.data.targetUid) : null,
    requestContext: Object.fromEntries(['expectedCycle', 'expectedTurn', 'expectedRevision', 'expectedSetupRevision',
      'connectionGeneration', 'overridePhaseTimer', 'skipTurnStartAnnouncement', 'window']
      .filter(key => Object.hasOwn(capture.data, key)).map(key => [key, capture.data[key]])),
    originalActor: { sessionId: capture.before.sessionId, uidHash: capture.before.uidHash,
      generation: capture.before.generation, instanceId: capture.before.instanceId,
      claimedAt: capture.before.claimedAt, hydrationRevision: capture.before.hydrationRevision },
    transport: 'actual mounted UI / browser Firebase SDK; payload retained only in memory' };
}

export async function captureLifecycleUiAction(surface, endpoint, choose, options = {}) {
  let before, current, requestData, body, response, httpStatus;
  // Match the request emitted by this choice, not a queued response from a prior choice.
  // Resume observers use the same canonical request-object pairing.
  let choosing = false;
  const intendedRequests = new Map();
  const captureRequest = request => {
    if (!choosing || !options.correlateRequests) return;
    if (!new URL(request.url()).pathname.endsWith(`/us-central1/${endpoint}`) || request.method() !== 'POST') return;
    const data = request.postDataJSON()?.data;
    if (data?.sessionId !== before.sessionId) return;
    if (data.requestId !== undefined && (typeof data.requestId !== 'string' || !data.requestId)) return;
    if (options.matches && !options.matches(data)) return;
    intendedRequests.set(request, { requestId: data.requestId, payload: JSON.stringify(data) });
  };
  if (options.correlateRequests) surface.page.on('request', captureRequest);
  const consumed = { endpoint, deadlineAt: options.deadlineAt, originalTimeoutMs: options.timeout ?? 60_000,
    original: options.original, gm: options.gm };
  try {
    before = await observeLifecycleActor(surface);
    consumed.before = before;
    assertOriginalActor(before, before, { gm: options.gm ?? before.gmInstanceOwned });
    if (options.original) assertObserverOperationActor(options.original, before);
    response = await observeUiReceipt({ page: surface.page, consumed,
      waitForResponse: () => {
        consumed.responseObserverTimeoutMs = options.deadlineAt === undefined ? options.timeout ?? 60_000 :
          remainingLifecycleOperation(options.deadlineAt, options.timeout ?? 60_000);
        return surface.page.waitForResponse(response => {
          if (!new URL(response.url()).pathname.endsWith(`/us-central1/${endpoint}`) || response.request().method() !== 'POST') return false;
          const data = response.request().postDataJSON()?.data;
          if (options.matches && !options.matches(data)) return false;
          if (options.correlateRequests) {
            const intended = intendedRequests.get(response.request());
            if (!intended || intended.requestId !== data?.requestId || intended.payload !== JSON.stringify(data)) return false;
          }
          requestData = data; return true;
        }, { timeout: consumed.responseObserverTimeoutMs });
      },
      choose: async () => {
        current = await observeLifecycleActor(surface, before.sessionId);
        consumed.current = current;
        assertLateReplyAuthority(before, current);
        if (options.original) assertObserverOperationActor(options.original, current);
        await retainUiReceiptContext(surface.page, consumed);
        if (options.deadlineAt !== undefined) remainingLifecycleOperation(options.deadlineAt);
        choosing = true;
        await choose();
      },
    });
    assertCapturedUiRequest(endpoint, requestData, before);
    httpStatus = response.status();
    body = await response.json();
    assert.ok(response.status() < 400 && !body.error && Object.hasOwn(body, 'result'), `${endpoint}: actual UI request rejected.`);
    assert.ok(!['queued', 'stale', 'denied'].includes(body.result?.status), `${endpoint}: no committed result.`);
    if (options.original) assertObserverOperationActor(options.original, await observeLifecycleActor(surface, before.sessionId));
    const capture = { endpoint, data: requestData, result: body.result, before, httpStatus: response.status() };
    observedUiCaptures.add(capture); return capture;
  } catch (error) {
    rememberProofFailure(error, { operation: 'captureLifecycleUiAction', ...consumed, before, current,
      requestData, body, httpStatus });
    throw error;
  } finally {
    if (options.correlateRequests) surface.page.off('request', captureRequest);
  }
}

/** Only a request already sent by the real UI can enter this recovery path. */
export async function recoverLifecycleUiAction(surface, capture, options = {}) {
  assert.ok(observedUiCaptures.has(capture), 'Only this observer’s actual mounted UI capture can be recovered.');
  const protocol = recoveryProtocol(capture.endpoint, capture.data);
  assert.ok(protocol === 'receipt' || protocol === 'generation-bound-cleanup' && options.rejoined === true || options.stateRepeat === true &&
    ['state-idempotent', 'stable-instance-repeat'].includes(protocol), 'No source-safe automatic repeat for this endpoint.');
  assertCapturedUiRequest(capture.endpoint, capture.data, capture.before);
  const current = await observeLifecycleActor(surface, capture.before.sessionId);
  assertOriginalActor(capture.before, current, { gm: capture.before.gmInstanceOwned && !options.releasedGm,
    releasedGm: options.releasedGm, rejoined: options.rejoined });
  if (protocol === 'stable-instance-repeat') {
    assert.equal(current.gmInstanceOwned, true); assert.equal(current.instanceId, capture.data.instanceId);
    assert.equal(current.claimedAt, capture.result.instance.claimedAt, 'A stable claim repeat cannot acquire another current lease.');
  }
  const reply = await surface.callable(capture.endpoint, capture.data);
  if (protocol === 'receipt') assertRecoveredResult(capture.endpoint, capture.result, reply, capture.data);
  else assert.equal(reply.status, 'committed');
  assertLateReplyAuthority(current, await observeLifecycleActor(surface, current.sessionId));
  return { protocol, sourceReceiptRecovered: protocol === 'receipt', unchangedRequest: true,
    resultFingerprint: fingerprint(reply.result), resultIdentical: fingerprint(reply.result) === fingerprint(capture.result) };
}

export async function openLifecycleSettings(surface) {
  await surface.page.getByRole('button', { name: 'Settings', exact: true }).click();
  const dialog = surface.page.getByRole('dialog', { name: 'Session settings', exact: true });
  await dialog.waitFor({ state: 'visible' }); return dialog;
}
export async function closeLifecycleSettings(dialog) {
  if (await dialog.isVisible()) await dialog.getByRole('button', { name: 'Close settings', exact: true }).click();
}

async function offered(locator) { return await locator.count() === 1 && await locator.isVisible() && await locator.isEnabled(); }
async function immediateLifecycleAffordance(locator) {
  if (await locator.count() !== 1) return { offered: false, reason: 'Exact mounted control absent or ambiguous.' };
  return { offered: await locator.isVisible() && await locator.isEnabled(),
    text: await locator.innerText(), title: await locator.getAttribute('title'),
    describedBy: await locator.getAttribute('aria-describedby'),
    blockerText: await locator.evaluate(element => (element.getAttribute('aria-describedby') ?? '').split(/\s+/)
      .filter(Boolean).map(id => document.getElementById(id)?.textContent ?? '').join(' ').trim()) };
}

function assertObserverOperationActor(original, current) {
  assertOriginalActor(original, current, { gm: true });
  assert.equal(current.phase, original.phase, 'Observer operation must retain its original phase.');
  assert.equal(current.cycle, original.cycle, 'Observer operation must retain its original cycle.');
}

function remainingLifecycleOperation(deadlineAt, maximum = 60_000) {
  const remaining = Math.min(maximum, deadlineAt - Date.now());
  assert.ok(Number.isFinite(remaining) && remaining > 0, 'The original observer operation deadline is exhausted.');
  return remaining;
}

export async function inspectLifecycleObserverMount(surface) {
  return surface.page.evaluate(() => {
    const mains = Array.from(document.querySelectorAll('main.ship-console[data-observer-mode]'));
    const main = mains.length === 1 ? mains[0] : null;
    const roles = main ? Array.from(main.querySelectorAll('select[aria-label="View ship console role"]')) : [];
    const role = roles.length === 1 ? roles[0] : null;
    return { routePath: window.location.hash.slice(1).split('?')[0], observerMainCount: mains.length,
      observerMode: main?.getAttribute('data-observer-mode') ?? null,
      shipId: main?.querySelector('[data-shared-flag]')?.getAttribute('data-shared-flag') ?? null,
      roleControlCount: roles.length, selectedRoleId: role?.value || null,
      selectedRoleValid: Boolean(role?.value && Array.from(role.options).filter(option =>
        option.value === role.value && option.selected && !option.disabled).length === 1),
      loading: Array.from(document.querySelectorAll('[role="status"]')).some(element =>
        element.textContent?.trim() === 'Opening ship console…'),
      failed: Array.from(document.querySelectorAll('[role="alert"]')).some(element =>
        element.textContent?.trim() === 'Could not open ship console. Reload the console to try again.') };
  });
}

/** Wait only for this source observer's lazy mount, never retry a UI action. */
export async function recordLifecycleAffordance(locator, observer) {
  if (!observer) return immediateLifecycleAffordance(locator);
  const { original, shipId, deadlineAt, inspectActor, inspectMount, now = Date.now, wait = delay } = observer;
  assert.ok(Number.isFinite(deadlineAt), 'Use the original absolute observer operation deadline.');
  assert.match(shipId, /^[a-z0-9][a-z0-9-]*$/);
  let mount = null, controlCount = null, mountStatus = 'not-observed-before-deadline';
  const blocked = () => ({ offered: false, reason: 'Expected observer mount did not become available within the original operation deadline.',
    mountStatus, mount, controlCount, deadlineReached: true });
  while (now() < deadlineAt) {
    assertObserverOperationActor(original, await inspectActor());
    const observed = await inspectMount();
    mount = Object.fromEntries(['routePath', 'observerMainCount', 'observerMode', 'shipId',
      'roleControlCount', 'selectedRoleId', 'selectedRoleValid', 'loading', 'failed']
      .map(key => [key, observed[key]]));
    controlCount = await locator.count();
    const affordance = await immediateLifecycleAffordance(locator);
    assertObserverOperationActor(original, await inspectActor());
    if (mount.failed) mountStatus = 'route-load-failed';
    else if (mount.routePath !== `/ships/${shipId}/observer` || mount.observerMainCount !== 1 ||
        mount.shipId !== shipId || !['read', 'write'].includes(mount.observerMode)) {
      mountStatus = mount.loading ? 'still-mounting' : 'expected-observer-absent';
    } else if (mount.roleControlCount !== 1 || !mount.selectedRoleId || !mount.selectedRoleValid) {
      mountStatus = 'observer-role-pending';
    } else {
      mountStatus = controlCount === 0 ? 'mounted-control-absent' : controlCount !== 1 ? 'mounted-control-ambiguous' :
        affordance.offered ? 'mounted-offered' : 'mounted-control-unavailable';
    }
    if (now() >= deadlineAt) return blocked();
    if (mountStatus === 'route-load-failed' || mountStatus.startsWith('mounted-')) {
      return { ...affordance, offered: mountStatus === 'mounted-offered', mountStatus, mount, controlCount,
        deadlineReached: false, ...(mountStatus === 'route-load-failed' ? { reason: 'The source observer route failed to load.' } : {}) };
    }
    await wait(Math.min(200, deadlineAt - now()));
  }
  return blocked();
}
async function originalMemberJoin(surface, before, joinCode) {
  const input = surface.page.getByRole('textbox', { name: 'Session code', exact: true });
  await input.waitFor({ state: 'visible' }); await input.fill(joinCode);
  const join = await captureLifecycleUiActionAfterDisconnect(surface, before, () =>
    surface.page.getByRole('button', { name: 'Join a session', exact: true }).click());
  const waiver = surface.page.getByRole('dialog', { name: 'CODE OF CONDUCT', exact: true });
  const deadline = Date.now() + 35_000;
  while (Date.now() < deadline) {
    if (await waiver.isVisible()) { await surface.consent(); break; }
    const current = await observeLifecycleActor(surface, before.sessionId);
    if (current.sameActor && current.sessionId === before.sessionId && current.connection === 'live' && current.freshness === 'server') break;
    await delay(100);
  }
  await untilLifecycle(surface, before, s => s.sameActor && s.sessionId === before.sessionId && s.connection === 'live' && s.freshness === 'server',
    'Same original member normally rejoined', { rejoined: true });
  return join;
}
async function captureLifecycleUiActionAfterDisconnect(surface, before, choose) {
  assertClearedPrivateState(before, await observeLifecycleActor(surface, before.sessionId));
  const response = await observeUiReceipt({ page: surface.page, waitForResponse: () => surface.page.waitForResponse(r =>
    new URL(r.url()).pathname.endsWith('/us-central1/joinSession') && r.request().method() === 'POST', { timeout: 60_000 }), choose });
  const body = await response.json(); assert.ok(response.status() < 400 && !body.error);
  return { endpoint: 'joinSession', before, data: response.request().postDataJSON()?.data,
    result: body.result, httpStatus: response.status() };
}

/** Root composes these hooks; this module creates no browser or emulator. */
export function createMemberGmLifecycleUiProof(options = {}) {
  const requested = new Set(options.cases ?? ['member-console', 'member-disconnect', 'gm-ship-grant-lock']);
  for (const id of requested) assert.ok(MEMBER_GM_CASES[id], `Unknown finite lifecycle case ${id}`);
  const evidence = { schemaVersion: 1, planningSourcePin: MEMBER_TURN_SOURCE_PIN, actualRuntimeRuns: 0,
    nativeChecksAreGameplayProof: false, cases: Object.fromEntries(Object.keys(MEMBER_GM_CASES).map(id => [id,
      { status: 'pending', reason: requested.has(id) ? 'Awaiting actual mounted execution.' : 'Not selected for this fresh scenario.' }])) };
  let binding;
  async function begin(context) {
    assert.ok(context.initial.sessionId && context.initial.joinCode && context.roster.length);
    await assertMemberTurnContext(context);
    evidence.runtimeFence ??= await assertMemberTurnRuntime(context.gm, options);
    assert.deepEqual(await assertMemberTurnRuntime(context.crew, options), evidence.runtimeFence);
    binding ??= await captureMemberTurnSourceBinding(options.sourceRoot ?? process.cwd());
    evidence.sourceBefore = binding;
  }
  async function save(context) {
    evidence.sourceAfter = await captureMemberTurnSourceBinding(options.sourceRoot ?? process.cwd());
    evidence.sourceUnchanged = fingerprint(evidence.sourceAfter) === fingerprint(binding);
    await mkdir(context.directory, { recursive: true });
    await writeFile(resolve(context.directory, 'member-gm-lifecycle.json'), `${JSON.stringify(evidence, null, 2)}\n`);
    assert.equal(evidence.sourceUnchanged, true, 'Preserve source drift; zero closure credit.');
  }
  function blocked(id, reason, affordance) { evidence.cases[id] = { status: 'blocked-uncredited', reason, ...(affordance ? { affordance } : {}) }; }
  async function perform(id, context, action) {
    if (!requested.has(id)) return;
    try { const result = await action(); if (result) evidence.cases[id] = { status: 'actual-ui-procedure-observed', ...result }; }
    catch (error) {
      evidence.cases[id] = { status: 'failed-uncredited', error: error.message };
      await retainProofFailure(context.directory, 'member-case', error, { caseId: id, evidence });
      try { await save(context); }
      catch (saveError) { await retainProofFailure(context.directory, 'member-report', saveError, { caseId: id, primaryError: error }); }
      throw error;
    }
  }
  async function select(context, roleId, enter = true) { return createTwoBrowserGameplay(context).select(roleId, { enter }); }
  async function restore(context, snapshot, url) {
    const navigation = await context.crew.page.goto(url);
    const current = await untilLifecycle(context.crew, snapshot, s => s.sessionId === snapshot.sessionId && s.sameActor &&
      s.connection === 'live' && s.freshness === 'server', 'Original selected actor restored', { rejoined: navigation !== null });
    assert.equal(current.privateAudienceMatches, true);
  }
  async function controller(context) {
    const uidHash = await context.crew.page.evaluate(async () => {
      const { readDemoActorAccountUid } = await import('/src/lib/demoActorContext.ts');
      const uid = readDemoActorAccountUid('controller'); if (!uid) return null;
      return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(uid))))
        .map(byte => byte.toString(16).padStart(2, '0')).join('').slice(0, 16);
    });
    assert.ok(uidHash, 'The original genuinely admitted controller must already exist; no new signup fallback.');
    const url = new URL(context.crew.page.url()); url.search = '';
    url.searchParams.set('demoActor', `${context.initial.sessionId}~controller`);
    url.searchParams.set('demoJoin', context.initial.joinCode); url.hash = '/demo-actors';
    await context.crew.page.goto(url.href);
    const state = await context.crew.until('Original admitted controller', s => s.sameActor && s.uidHash === uidHash &&
      s.sessionId === context.initial.sessionId && s.profileRoleId === 'controller' && s.connection === 'live' && s.freshness === 'server');
    assert.notEqual(state.uidHash, (await context.gm.observe()).uidHash);
    const actual = await observeLifecycleActor(context.crew); assert.equal(actual.seatId, null); assert.equal(actual.assignedRoleId, null);
    return actual;
  }
  async function disconnect(surface, before) {
    const dialog = await openLifecycleSettings(surface);
    await dialog.getByRole('button', { name: 'Disconnect', exact: true }).click();
    const capture = await captureLifecycleUiAction(surface, 'disconnectFromSession', () =>
      dialog.getByRole('button', { name: 'ARE YOU SURE?', exact: true }).click());
    await surface.page.getByRole('textbox', { name: 'Session code', exact: true }).waitFor();
    assertClearedPrivateState(before, await observeLifecycleActor(surface, before.sessionId));
    return capture;
  }
  async function castRestore(context, row) {
    const region = context.gm.page.getByRole('region', { name: 'Facilitator casting', exact: true });
    await region.getByLabel(`Role for ${row.displayName}`, { exact: true }).selectOption(row.roleId);
    const assigned = await captureLifecycleUiAction(context.gm, 'assignRole', () =>
      region.getByRole('button', { name: `Assign role to ${row.displayName}`, exact: true }).click());
    const recovery = await recoverLifecycleUiAction(context.gm, assigned);
    return { assignment: publicLifecycleReceipt(assigned), recovery };
  }
  return { evidence,
    async onBeforeStart(context) {
      await begin(context);
      const saved = await observeLifecycleActor(context.crew), savedUrl = context.crew.page.url();
      const savedGmUrl = context.gm.page.url();
      await perform('casting-release', context, async () => {
        const row = context.roster.find(row => row.roleId === options.castingRoleId);
        if (!row || row.roleId === 'press-officer') return blocked('casting-release', 'Choose a genuinely admitted core castingRoleId; Press uses a different source path.');
        await select(context, row.roleId, false); const before = await observeLifecycleActor(context.crew);
        const availability = lifecycleCaseAvailability('casting-release', before);
        if (availability.status !== 'ready') return blocked('casting-release', availability.reason);
        const release = await captureLifecycleUiAction(context.gm, 'releaseRole', () => context.gm.page
          .getByRole('button', { name: `Release role from ${row.displayName}`, exact: true }).click());
        assert.equal(uidHash(release.data.targetUid), row.uidHash);
        const recovered = await recoverLifecycleUiAction(context.gm, release);
        await untilLifecycle(context.crew, before, s => s.assignedRoleId === null && s.seatId === null,
          'Original role and reciprocal station released');
        const assignment = await castRestore(context, row); await context.crew.page.reload();
        // Assignment restores the private role brief; normal station entry owns the seat CAS.
        const restorationDeadlineAt = Date.now() + 60_000;
        await createTwoBrowserGameplay(context).select(row.roleId, { deadlineAt: restorationDeadlineAt });
        const restorationRemaining = restorationDeadlineAt - Date.now();
        assert.ok(restorationRemaining > 0, 'The original casting restoration deadline expired.');
        const restored = await untilLifecycle(context.crew, before,
          s => s.assignedRoleId === row.roleId && s.seatId === row.roleId && s.privateAudienceMatches,
          'Same original casting audience restored', { rejoined: true, timeout: Math.min(60_000, restorationRemaining) });
        return { release: publicLifecycleReceipt(release), recovery: recovered, ...assignment,
          stationRestored: true, restoredConnectionGeneration: restored.generation,
          cost: 'Canonical seat and original loyalty/brief are released; normal reassignment issues source-authorized replacement private records.', nextActor: row.roleId };
      });
      await perform('stale-seat-clear', context, async () => {
        const row = context.roster.find(row => row.roleId === options.staleSeatRoleId);
        if (!row || !options.staleSeatReason?.trim() || options.naturalLeaseExpiry !== true) return blocked('stale-seat-clear', 'Specify one original core staleSeatRoleId, an honest intervention reason and the real natural-expiry scenario.');
        await select(context, row.roleId, false); const before = await observeLifecycleActor(context.crew);
        const leaseSource = await readFile(resolve(options.sourceRoot ?? process.cwd(), 'functions/src/sessionLifecycle.ts'), 'utf8');
        const leaseMatch = leaseSource.match(/export const PRESENCE_LEASE_MS\s*=\s*([\d_]+)\s*;/);
        assert.ok(leaseMatch, 'Read the actual presence lease; never guess or accelerate it.');
        const leaseMs = Number(leaseMatch[1].replaceAll('_', ''));
        assert.ok(leaseMs > 0 && leaseMs + 1_000 <= 60_000);
        await context.crew.context.setOffline(true); let cleared;
        try {
          await delay(leaseMs + 1_000);
          const url = new URL(context.gm.page.url()); url.hash = '/roles'; await context.gm.page.goto(url.href);
          const seat = await context.gm.page.evaluate(async ({ moduleUrl, roleId }) => {
            const { useSessionStore } = await import(moduleUrl);
            const seat = useSessionStore.getState().seats.find(seat => seat.id === roleId);
            return seat ? { label: seat.label, status: seat.status } : null;
          }, { moduleUrl: context.gm.storeModuleUrl(), roleId: row.roleId });
          if (seat?.status !== 'claimed') return blocked('stale-seat-clear', 'Natural expiry did not leave a claimed holder; no stale opportunity was produced.');
          await context.gm.page.getByRole('button', { name: `CLEAR STALE HOLDER // ${seat.label}`, exact: true }).click();
          const dialog = context.gm.page.getByRole('alertdialog', { name: 'Clear stale station holder?', exact: true });
          await dialog.getByRole('textbox', { name: 'Reason for clearing stale seat', exact: true }).fill(options.staleSeatReason);
          cleared = await captureLifecycleUiAction(context.gm, 'releaseSeat', () => dialog.getByRole('button',
            { name: 'CONFIRM CLEAR STALE SEAT', exact: true }).click());
        } finally { await context.crew.context.setOffline(false); }
        const recovery = await recoverLifecycleUiAction(context.gm, cleared);
        await context.crew.page.reload();
        await untilLifecycle(context.crew, before, s => s.sameActor && s.connection === 'live' && s.freshness === 'server', 'Original naturally disconnected actor restored', { rejoined: true });
        const gmUrl = new URL(context.gm.page.url()); gmUrl.hash = '/gm'; await context.gm.page.goto(gmUrl.href);
        const assignment = await castRestore(context, row);
        return { naturalNetworkInterruptionMs: leaseMs + 1_000, clockAccelerated: false,
          clear: publicLifecycleReceipt(cleared), recovery, ...assignment, gmChoice: options.staleSeatReason,
          physicalStalenessInferred: false, nextActor: row.roleId };
      });
      for (const id of ['own-seat-release', 'gm-registration-lock']) if (requested.has(id)) blocked(id, MEMBER_GM_CASES[id].limit);
      if (context.gm.page.url() !== savedGmUrl) {
        await context.gm.page.goto(savedGmUrl);
        await context.gm.until('Original GM setup restored', s => s.uidHash === context.initial.uidHash &&
          s.sessionId === context.initial.sessionId && s.sameActor && s.gmInstanceOwned && s.connection === 'live' && s.freshness === 'server');
      }
      await restore(context, saved, savedUrl);
      await save(context);
    },
    async onStarted(context) {
      await begin(context);
      const saved = await observeLifecycleActor(context.crew), savedUrl = context.crew.page.url();
      const row = context.roster.find(row => row.roleId === (options.memberRoleId ?? saved.profileRoleId));
      for (const id of ['member-console', 'member-disconnect']) await perform(id, context, async () => {
        if (id === 'member-console' && !row) return blocked(id, 'Choose an original admitted memberRoleId.');
        if (id === 'member-console') await select(context, row.roleId);
        const before = id === 'member-console' ? await observeLifecycleActor(context.crew) : await controller(context);
        if (id === 'member-console') {
          const dialog = await openLifecycleSettings(context.crew);
          const released = await captureLifecycleUiAction(context.crew, 'refreshPresence', () =>
            dialog.getByRole('button', { name: 'Release role', exact: true }).click(), { matches: data => data?.activeConsoleRoleId === null });
          const after = await untilLifecycle(context.crew, before, s => s.activeConsoleRoleId === null, 'Device console authority released');
          if (before.assignedRoleId !== null) assert.equal(after.assignedRoleId, before.assignedRoleId);
          const repeat = await recoverLifecycleUiAction(context.crew, released, { stateRepeat: true });
          await select(context, row.roleId); return { release: publicLifecycleReceipt(released), recovery: repeat,
            printedAssignmentBefore: before.assignedRoleId, printedAssignmentAfter: after.assignedRoleId,
            nextActor: row.roleId };
        }
        const left = await disconnect(context.crew, before);
        const joined = await originalMemberJoin(context.crew, before, context.initial.joinCode);
        const recovered = await recoverLifecycleUiAction(context.crew, left, { rejoined: true });
        return { disconnect: publicLifecycleReceipt(left), join: publicLifecycleReceipt(joined), recovery: recovered,
          privateStateClearedBeforeJoin: true, originalUnseatedController: before.uidHash, nextActor: saved.profileRoleId };
      });
      await perform('member-interrupted-release', context, async () => {
        const other = context.roster.find(row => row.roleId === options.alternateRoleId);
        if (!row || !other || row.uidHash === other.uidHash) return blocked('member-interrupted-release', 'Specify two distinct original admitted member/alternate roles.');
        await select(context, row.roleId); const before = await observeLifecycleActor(context.crew);
        let resolveCaptured, rejectCaptured;
        const held = new Promise((resolve, reject) => { resolveCaptured = resolve; rejectCaptured = reject; });
        let releaseReply; const pattern = '**/us-central1/refreshPresence';
        const handler = async route => {
          const data = route.request().postDataJSON()?.data;
          if (data?.activeConsoleRoleId !== null) return route.continue();
          try {
            assertCapturedUiRequest('refreshPresence', data, before);
            const response = await route.fetch(); const body = await response.json();
            assert.ok(response.status() < 400 && !body.error);
            releaseReply = () => route.fulfill({ response }).catch(() => undefined);
            resolveCaptured({ endpoint: 'refreshPresence', data, result: body.result, before, httpStatus: response.status() });
          } catch (error) { rejectCaptured(error); await route.abort(); }
        };
        await context.crew.page.route(pattern, handler);
        try {
          const dialog = await openLifecycleSettings(context.crew);
          await dialog.getByRole('button', { name: 'Release role', exact: true }).click();
          const receipt = await Promise.race([held, delay(60_000).then(() => { throw new Error('Actual held response not received.'); })]);
          await select(context, other.roleId); await releaseReply();
          const after = await observeLifecycleActor(context.crew);
          assert.equal(after.uidHash, other.uidHash); assert.equal(after.privateAudienceMatches, true); assert.equal(after.pendingCount, 0);
          await select(context, row.roleId);
          return { release: publicLifecycleReceipt(receipt), interruptedAfterRealCommit: true,
            lateOldDocumentReplyRestoredAuthority: false, nextActor: row.roleId };
        } finally { await releaseReply?.(); await context.crew.page.unroute(pattern, handler); }
      });
      await perform('optional-gm', context, async () => {
        const original = await controller(context); const receipts = [], claimRepeats = [];
        let dialog = await openLifecycleSettings(context.crew);
        const authorize = dialog.getByRole('button', { name: 'Authorize local emulator GM', exact: true });
        if (!await offered(authorize)) { await closeLifecycleSettings(dialog); return blocked('optional-gm', 'Normal local GM authorization is not offered; no hidden grant/password fallback.'); }
        receipts.push(publicLifecycleReceipt(await captureLifecycleUiAction(context.crew, 'loginGmAccess', () => authorize.click())));
        await closeLifecycleSettings(dialog);
        const stations = context.crew.page.getByRole('link', { name: "Enter this actor's stations", exact: true });
        if (await stations.isVisible()) await stations.click();
        async function claim(name) {
          await context.crew.page.getByRole('link', { name: 'GM join', exact: true }).click();
          await context.crew.page.getByRole('textbox', { name: 'Input GM Name', exact: true }).fill(name);
          const claimed = await captureLifecycleUiAction(context.crew, 'claimGmInstance', () => context.crew.page.getByRole('button', { name: 'Join as GM', exact: true }).click());
          const current = await untilLifecycle(context.crew, original, s => s.gmInstanceOwned && s.playerRole === 'gm', 'Original controller normally claims optional GM');
          assert.equal(claimed.data.instanceId, current.instanceId);
          claimRepeats.push(await recoverLifecycleUiAction(context.crew, claimed, { stateRepeat: true }));
          receipts.push(publicLifecycleReceipt(claimed)); return current;
        }
        let current = await claim(options.optionalGmName ?? 'PC10 lifecycle optional GM');
        dialog = await openLifecycleSettings(context.crew);
        const released = await captureLifecycleUiAction(context.crew, 'releaseGmInstance', () => dialog.getByRole('button', { name: 'Release GM role', exact: true }).click());
        await untilLifecycle(context.crew, current, s => !s.gmInstanceOwned && s.playerRole === 'player' && s.privateCount === 0,
          'Original controller releases GM/private audience', { releasedGm: true });
        const recovery = await recoverLifecycleUiAction(context.crew, released, { releasedGm: true }); receipts.push(publicLifecycleReceipt(released));
        const catalogUrl = new URL(context.crew.page.url()); catalogUrl.hash = '/console'; await context.crew.page.goto(catalogUrl.href);
        current = await claim(options.optionalGmName ?? 'PC10 lifecycle optional GM');
        const gmUrl = new URL(context.gm.page.url()); gmUrl.hash = '/gm'; await context.gm.page.goto(gmUrl.href);
        const instances = context.gm.page.getByRole('region', { name: 'GM instances', exact: true });
        const kicked = await captureLifecycleUiAction(context.gm, 'kickGmInstance', () => instances.getByRole('button',
          { name: `Kick ${options.optionalGmName ?? 'PC10 lifecycle optional GM'}`, exact: true }).click());
        const kickRecovery = await recoverLifecycleUiAction(context.gm, kicked); receipts.push(publicLifecycleReceipt(kicked));
        await context.crew.page.reload();
        await untilLifecycle(context.crew, current, s => !s.gmInstanceOwned && s.playerRole === 'player' && s.privateCount === 0,
          'Optional GM kick demotes original member/private audience', { releasedGm: true, rejoined: true });
        dialog = await openLifecycleSettings(context.crew);
        const logout = await captureLifecycleUiAction(context.crew, 'logoutGmAccess', () => dialog.getByRole('button', { name: 'Revoke GM access', exact: true }).click());
        receipts.push(publicLifecycleReceipt(logout)); await closeLifecycleSettings(dialog);
        const player = await observeLifecycleActor(context.crew);
        assert.equal(player.uidHash, original.uidHash); assert.equal(player.gmInstanceOwned, false); assert.equal(player.gmAccessCached, false);
        return { receipts, claimRepeats, recovery, kickRecovery, originalIndependentController: original.uidHash,
          normalAuthorizationOnly: true, nextActor: saved.profileRoleId };
      });
      await perform('gm-ship-grant-lock', context, async () => {
        if (!options.shipId) return blocked('gm-ship-grant-lock', 'Choose a current active source shipId; observer view must be mounted in the normal catalog.');
        const before = await observeLifecycleActor(context.gm), savedGmUrl = context.gm.page.url();
        // Full source CSS, including inline-flex, spaces this link's arrow name.
        const leave = context.gm.page.getByRole('link', { name: '← Change role', exact: true })
          .and(context.gm.page.locator(`a.ship-console__back[href="#/ships/${options.shipId}/roles"]`));
        try {
        const url = new URL(context.gm.page.url()); url.hash = '/console'; await context.gm.page.goto(url.href);
        await context.gm.page.locator(`a[href$="/ships/${options.shipId}/roles"]`).click();
        // The view click, lazy mount and first actual grant receipt share the
        // existing operation budget; mounting never opens another sixty seconds.
        const deadlineAt = Date.now() + 60_000;
        await context.gm.page.getByRole('link', { name: 'View ship consoles', exact: true }).click({
          timeout: remainingLifecycleOperation(deadlineAt),
        });
        const toggle = context.gm.page.getByRole('button', { name: 'GM ship console read write access', exact: true });
        const affordance = await recordLifecycleAffordance(toggle, { original: before, shipId: options.shipId, deadlineAt,
          inspectActor: () => observeLifecycleActor(context.gm, before.sessionId),
          inspectMount: () => inspectLifecycleObserverMount(context.gm) });
        if (!affordance.offered) return blocked('gm-ship-grant-lock', 'The original GM observer control is unavailable; retain the mounted or mounting blocker.', affordance);
        assertObserverOperationActor(before, await observeLifecycleActor(context.gm, before.sessionId));
        await toggle.click({ timeout: remainingLifecycleOperation(deadlineAt) });
        const confirm = context.gm.page.getByRole('alertdialog', { name: 'Are you sure?', exact: true });
        const grant = await captureLifecycleUiAction(context.gm, 'setGmShipConsoleWriteGrant', () => confirm
          .getByRole('button', { name: 'ARE YOU SURE?', exact: true }).click({ timeout: remainingLifecycleOperation(deadlineAt) }),
        { gm: true, original: before, deadlineAt });
        assert.equal(grant.result.enabled, true);
        const grantRepeat = await recoverLifecycleUiAction(context.gm, grant, { stateRepeat: true });
        const lock = context.gm.page.getByRole('region', { name: 'ICN console lock', exact: true });
        const engage = lock.getByRole('button', { name: 'Engage ICN console lock', exact: true });
        if (!await offered(engage)) return blocked('gm-ship-grant-lock', 'Ship must begin unlocked and offer current GM write authority; do not override an existing travel lock.');
        const locked = await captureLifecycleUiAction(context.gm, 'setShipConsoleLock', () => engage.click());
        const lockRecovery = await recoverLifecycleUiAction(context.gm, locked);
        const unlocked = await captureLifecycleUiAction(context.gm, 'setShipConsoleLock', () => lock.getByRole('button', { name: 'Release ICN console lock', exact: true }).click());
        const unlockRecovery = await recoverLifecycleUiAction(context.gm, unlocked);
        const revoke = await captureLifecycleUiAction(context.gm, 'setGmShipConsoleWriteGrant', () =>
          leave.click(), { matches: data => data?.enabled === false });
        await untilLifecycle(context.gm, before, s => s.grantShipId === null, 'Leaving ship view revokes scoped grant', { gm: true });
        url.hash = '/gm'; await context.gm.page.goto(url.href);
        return { grant: publicLifecycleReceipt(grant), grantRepeat, lock: publicLifecycleReceipt(locked), lockRecovery,
          unlock: publicLifecycleReceipt(unlocked), unlockRecovery, revoke: publicLifecycleReceipt(revoke),
          cost: 'Scoped ship grant and travel lock only; neither changes cargo, population or role ownership.', nextActor: 'original GM' };
        } finally {
          if (await leave.count() === 1 && await leave.isVisible()) await leave.click();
          if (context.gm.page.url() !== savedGmUrl) await context.gm.page.goto(savedGmUrl);
          await untilLifecycle(context.gm, before, s => s.grantShipId === null, 'Original GM restored without ship grant', { gm: true });
        }
      });
      await restore(context, saved, savedUrl); await save(context);
    },
    // Call before the root's genuine ending/close in a disposable fresh game.
    async onTerminal(context) {
      await begin(context);
      await perform('player-kick', context, async () => {
        if (options.permanentKickAcknowledged !== true) return blocked('player-kick', 'Explicit disposable-session permanentKickAcknowledged is required; never kick required core crew silently.');
        const target = await controller(context);
        const url = new URL(context.gm.page.url()); url.hash = '/gm'; await context.gm.page.goto(url.href);
        const region = context.gm.page.getByRole('region', { name: 'Connected players by role', exact: true });
        const kicked = await captureLifecycleUiAction(context.gm, 'kickPlayer', () => region.getByRole('button', { name: `Kick ${target.displayName}`, exact: true }).click());
        assert.equal(uidHash(kicked.data.targetUid), target.uidHash);
        const recovery = await recoverLifecycleUiAction(context.gm, kicked);
        await context.crew.page.reload();
        await context.crew.until('Kicked original UID cannot restore this session', s => s.hasAuth && s.uidHash === target.uidHash && s.sessionId === null);
        assertClearedPrivateState(target, await observeLifecycleActor(context.crew, target.sessionId));
        const input = context.crew.page.getByRole('textbox', { name: 'Session code', exact: true }); await input.fill(context.initial.joinCode);
        const response = await observeUiReceipt({ page: context.crew.page, waitForResponse: () => context.crew.page.waitForResponse(r =>
          new URL(r.url()).pathname.endsWith('/us-central1/joinSession') && r.request().method() === 'POST'),
        choose: () => context.crew.page.getByRole('button', { name: 'Join a session', exact: true }).click() });
        assert.ok(response.status() >= 400 && (await response.json()).error);
        assertClearedPrivateState(target, await observeLifecycleActor(context.crew, target.sessionId));
        return { kick: publicLifecycleReceipt(kicked), recovery, originalUidBanned: target.uidHash,
          normalRejoinDenied: true, replacementAuthCreated: false, nextActor: 'Original GM completes genuine ending in this disposable game.' };
      });
      await save(context);
    },
  };
}
