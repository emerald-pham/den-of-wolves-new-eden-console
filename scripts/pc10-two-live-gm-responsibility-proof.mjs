import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const hash = value => createHash('sha256').update(Buffer.isBuffer(value) || typeof value === 'string'
  ? value : JSON.stringify(value)).digest('hex');
const same = (left, right) => JSON.stringify(left) === JSON.stringify(right);
const exactKeys = (value, keys) => value && typeof value === 'object' && !Array.isArray(value) &&
  Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
const sorted = value => Array.isArray(value) ? [...value].sort() : null;
const MODES = Object.freeze(['share', 'drop', 'handoff']);
const CONTROLS = Object.freeze(['Share assistant facilitator', 'Drop assistant facilitator', 'Hand off assistant facilitator']);
const SOURCE_FILES = Object.freeze([
  'scripts/pc10-browser-ui-receipt.mjs', 'scripts/pc10-member-gm-lifecycle-ui-proof.mjs',
  'scripts/pc10-member-gm-lifecycle-contracts.mjs', 'scripts/pc10-full-game-demo-ui-proof.mjs',
  'scripts/local-gm-access.mjs', 'src/components/LocalGmAccess.tsx', 'src/components/AppHeader.tsx',
  'src/components/DemoActorControls.tsx', 'src/routes/GmConsole.tsx', 'src/routes/RoleSelect.tsx',
  'src/routes/SessionMode.tsx', 'src/routes/DemoActorManager.tsx', 'src/lib/demoActorContext.ts',
  'src/lib/demoActorProfiles.ts', 'src/lib/sessionWaiver.ts', 'src/lib/sessionService.ts',
  'src/lib/firestore.ts', 'src/lib/firebase.ts', 'src/lib/firebaseConfig.ts', 'src/store/useSessionStore.ts', 'src/App.tsx', 'functions/src/index.ts',
  'src/components/GmLoyaltySetupPanel.tsx', 'src/lib/gmLoyaltySetup.ts',
]);

/** Source only. Root separately binds its served and compiled runtime. */
export async function captureTwoLiveGmResponsibilitySourceBinding({ sourceRoot }) {
  const root = resolve(sourceRoot);
  const files = Object.fromEntries(await Promise.all(SOURCE_FILES.map(async path => [path,
    hash(await readFile(resolve(root, path))) ])));
  return { sourceRoot: root, sourceCommit: execFileSync('git', ['rev-parse', 'HEAD'],
    { cwd: root, encoding: 'utf8', env: { ...process.env, GIT_OPTIONAL_LOCKS: '0' } }).trim(),
  sourceSha256: files, callbackSha256: hash(await readFile(new URL(import.meta.url))) };
}

function livePrestartGm(value) {
  return value?.hasAuth === true && value.sameActor === true && value.playerRole === 'gm' &&
    typeof value.sessionId === 'string' && value.sessionId.length > 0 &&
    value.gmInstanceOwned === true && value.connection === 'live' && value.freshness === 'server' &&
    ['lobby', 'casting'].includes(value.phase) && value.cycle === 0 &&
    typeof value.uidHash === 'string' && value.uidHash.length > 0 &&
    typeof value.instanceId === 'string' && value.instanceId.length > 0 &&
    typeof value.claimedAt === 'string' && Number.isFinite(Date.parse(value.claimedAt)) &&
    Number.isSafeInteger(value.generation) && value.generation >= 1 &&
    Number.isSafeInteger(value.hydrationRevision) && value.hydrationRevision >= 1 &&
    value.privateAudienceMatches === true && value.foreignPendingCount === 0 && value.pendingCount === 0 &&
    value.seatId === null && value.assignedRoleId === null && value.activeConsoleRoleId === null;
}
function sameGmLease(original, current) {
  return livePrestartGm(current) && ['sessionId', 'uidHash', 'instanceId', 'claimedAt', 'generation', 'phase', 'cycle',
    'profileRoleId'].every(key => original[key] === current[key]);
}

// Failure diagnostics use only an observation already held by this callback.
// Never copy a raw actor, authority field, private value or unknown property.
function safeHeldLifecycleActor(value) {
  if (!value) return null;
  const count = key => Number.isSafeInteger(value[key]) && value[key] >= 0 ? value[key] : null;
  const fingerprint = key => typeof value[key] === 'string' && value[key].length > 0 ? hash(value[key]) : null;
  return { hasAuth: value.hasAuth === true, sameActor: value.sameActor === true,
    live: value.connection === 'live', serverFresh: value.freshness === 'server',
    gmMember: value.playerRole === 'gm', ordinaryMember: value.playerRole === 'player',
    controllerProfile: value.profileRoleId === 'controller', gmInstanceOwned: value.gmInstanceOwned === true,
    gmAccessCached: value.gmAccessCached === true, prestartPhase: ['lobby', 'casting'].includes(value.phase),
    cycleZero: value.cycle === 0, privateAudienceMatches: value.privateAudienceMatches === true,
    noSeat: value.seatId === null, noAssignment: value.assignedRoleId === null,
    noActiveConsole: value.activeConsoleRoleId === null,
    claimedAtPresent: Object.hasOwn(value, 'claimedAt'), claimedAtIsString: typeof value.claimedAt === 'string',
    claimedAtValid: typeof value.claimedAt === 'string' && Number.isFinite(Date.parse(value.claimedAt)),
    generation: count('generation'), hydrationRevision: count('hydrationRevision'),
    setupRevision: count('setupRevision'), privateCount: count('privateCount'),
    privatePayloadCountPresent: Object.hasOwn(value, 'privatePayloadCount'),
    privatePayloadCount: count('privatePayloadCount'), pendingCount: count('pendingCount'),
    foreignPendingCount: count('foreignPendingCount'), uidHashFingerprint: fingerprint('uidHash'),
    sessionHash: fingerprint('sessionId'), instanceHash: fingerprint('instanceId'), claimedAtHash: fingerprint('claimedAt') };
}

function safeHeldFailureObservations(held) {
  const result = {};
  for (const key of ['settledGm', 'settledController', 'originalA', 'controller', 'authorized', 'originalB', 'released', 'restored', 'finalA']) {
    if (held[key]) result[key] = safeHeldLifecycleActor(held[key]);
  }
  if (held.managerRoute) result.managerRoute = held.managerRoute;
  for (const key of ['beforeRoster', 'afterRoster']) if (held[key]) {
    const roster = Array.isArray(held[key].roster) ? held[key].roster : null;
    result[key] = { consentAcknowledged: held[key].consentAcknowledged === true,
      consentTimestampHash: held[key].consentAt === undefined ? null : hash(held[key].consentAt), rosterCount: roster?.length ?? null,
      uniqueUidHashCount: roster ? new Set(roster.map(row => row?.uidHash)).size : null, rosterFingerprint: hash(roster) };
  }
  if (held.contextRoster) {
    const roster = Array.isArray(held.contextRoster) ? held.contextRoster : null;
    result.contextRoster = { rosterCount: roster?.length ?? null,
      uniqueUidHashCount: roster ? new Set(roster.map(row => row?.uidHash)).size : null,
      rosterFingerprint: hash(roster?.map(row => ({ roleId: row?.roleId, uidHash: row?.uidHash })) ?? null) };
  }
  if (held.casting) {
    const value = held.casting;
    result.casting = { fresh: value.fresh === true, cycleZero: value.cycle === 0,
      prestartPhase: ['lobby', 'casting'].includes(value.phase), setupConfirmed: value.setupConfirmed === true,
      configurationUnlocked: value.configurationLocked === false,
      fullGamePreparing: value.fullGameDemo?.status === 'preparing',
      manualProgression: value.fullGameDemo?.progression === 'manual',
      actorHashFingerprint: typeof value.actorHash === 'string' ? hash(value.actorHash) : null,
      sessionHash: typeof value.sessionId === 'string' ? hash(value.sessionId) : null,
      coreSeatCount: Array.isArray(value.seats) ? value.seats.length : null,
      claimedCoreSeatCount: Array.isArray(value.seats) ? value.seats.filter(row => row?.status === 'claimed').length : null,
      activeRoleCount: Array.isArray(value.activeRoleIds) ? value.activeRoleIds.length : null,
      activeVesselCount: Array.isArray(value.activeVesselIds) ? value.activeVesselIds.length : null,
      pressEnabled: value.pressEnabled === true, pressHolderPresent: value.pressHolderUidHash !== null,
      pressControl: value.pressControl ? {
        occupancyOwnBoolean: value.pressControl.occupancyOwnBoolean === true,
        occupancyTrue: value.pressControl.occupancyTrue === true,
        panelCount: Number.isSafeInteger(value.pressControl.panelCount) ? value.pressControl.panelCount : null,
        panelMounted: value.pressControl.panelMounted === true,
        selectCount: Number.isSafeInteger(value.pressControl.selectCount) ? value.pressControl.selectCount : null,
        selectMounted: value.pressControl.selectMounted === true,
        selectEnabled: value.pressControl.selectEnabled === true,
        optionCount: Number.isSafeInteger(value.pressControl.optionCount) ? value.pressControl.optionCount : null,
        optionMounted: value.pressControl.optionMounted === true,
        optionEnabled: value.pressControl.optionEnabled === true,
        uidValid: value.pressControl.uidValid === true,
      } : null,
      castingFingerprint: hash(value) };
  }
  return result;
}

/** The finite three-move native receipt contract; raw authorities stay in memory. */
export function assertTwoLiveGmResponsibilityMove({ step, capture, originalA, originalB, expectedRevision }) {
  let guard = 'responsibility.specified-three-move-step';
  try {
  assert.ok(Number.isInteger(step) && step >= 0 && step < 3, 'Use one of the three specified Responsibility moves.');
  guard = 'responsibility.two-distinct-original-owned-live-gm-actors';
  assert.ok(livePrestartGm(originalA) && livePrestartGm(originalB) &&
    originalA.sessionId === originalB.sessionId && originalA.uidHash !== originalB.uidHash &&
    originalA.instanceId !== originalB.instanceId && originalB.profileRoleId === 'controller',
  'Two distinct original owned live prestart GM actors, including the admitted controller, are required.');
  const original = step === 2 ? originalB : originalA, target = step === 2 ? originalA : originalB;
  guard = 'responsibility.current-original-live-lease';
  assert.ok(sameGmLease(original, capture?.before), 'The original live GM authority or claim changed.');
  guard = 'responsibility.current-setup-revision';
  assert.ok(Number.isSafeInteger(expectedRevision) && expectedRevision >= 0 &&
    capture.before.setupRevision === expectedRevision &&
    capture.data?.expectedSetupRevision === expectedRevision, 'Use the current setup revision.');
  const request = capture.data, result = capture.result;
  guard = 'responsibility.fixed-ui-native-body';
  assert.ok(exactKeys(request, ['sessionId', 'instanceId', 'requestId', 'expectedSetupRevision',
    'responsibility', 'mode', 'targetInstanceId']) && request.sessionId === original.sessionId &&
    request.instanceId === original.instanceId && request.targetInstanceId === target.instanceId &&
    typeof request.requestId === 'string' && request.requestId.length > 0 &&
    request.responsibility === 'assistant' && request.mode === MODES[step], 'The fixed UI-native Responsibility body changed.');
  const assistant = step === 0 ? [originalA.instanceId, originalB.instanceId]
    : step === 1 ? [originalB.instanceId] : [originalA.instanceId];
  guard = 'responsibility.committed-next-revision-and-two-gm-coverage';
  assert.ok(capture.httpStatus === 200 && exactKeys(result, ['status', 'requestId', 'setupRevision',
    'responsibilities', 'coverage']) && result.status === 'committed' && result.requestId === request.requestId &&
    result.setupRevision === expectedRevision + 1 &&
    same(result.responsibilities, [['main', 'assistant'], ['main'], []][step]) &&
    exactKeys(result.coverage, ['main', 'assistant']) &&
    same(sorted(result.coverage.main), [originalA.instanceId]) &&
    same(sorted(result.coverage.assistant), sorted(assistant)), 'The committed next revision or exact two-GM lane coverage changed.');
  return { step: step + 1, endpoint: 'setFacilitatorResponsibility', control: CONTROLS[step],
    mode: MODES[step], responsibility: 'assistant', actorUidHash: original.uidHash,
    actorInstanceHash: hash(original.instanceId), targetInstanceHash: hash(target.instanceId),
    claimedAtHash: hash(original.claimedAt), sessionHash: hash(original.sessionId),
    requestFingerprint: hash(request), resultFingerprint: hash(result), httpStatus: capture.httpStatus,
    beforeRevision: expectedRevision, afterRevision: result.setupRevision,
    coverage: { main: result.coverage.main.map(hash), assistant: result.coverage.assistant.map(hash) },
    actualUiNativeBody: true, sdkReplay: false };
  } catch (error) {
    Object.defineProperties(error, { proofGuard: { value: guard, enumerable: true },
      safeHeldObservations: { value: { originalA: safeHeldLifecycleActor(originalA),
        originalB: safeHeldLifecycleActor(originalB), before: safeHeldLifecycleActor(capture?.before) }, enumerable: true } });
    throw error;
  }
}

async function readControllerRosterAndConsent(surface, sessionId) {
  return surface.page.evaluate(async sid => {
    const { readDemoActorRoster } = await import('/src/lib/demoActorProfiles.ts');
    const { isSessionWaiverAcknowledged, readSessionWaiverAcknowledgedAt } = await import('/src/lib/sessionWaiver.ts');
    const digest = async value => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',
      new TextEncoder().encode(value)))).map(byte => byte.toString(16).padStart(2, '0')).join('').slice(0, 16);
    return { consentAcknowledged: isSessionWaiverAcknowledged(), consentAt: readSessionWaiverAcknowledgedAt(),
      roster: await Promise.all(readDemoActorRoster(sid).map(async row => ({ roleId: row.roleId,
        uidHash: await digest(row.uid) }))) };
  }, sessionId);
}

async function readOriginalCasting(context, failure) {
  const core = context.confirmed.activeRoleIds, roster = context.roster;
  const current = await context.gm.page.evaluate(async ({ moduleUrl, core }) => {
    const { useSessionStore } = await import(moduleUrl);
    const { auth } = await import('/src/lib/firebase.ts');
    const uid = auth().currentUser?.uid;
    const digest = async value => value ? Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',
      new TextEncoder().encode(value)))).map(byte => byte.toString(16).padStart(2, '0')).join('').slice(0, 16) : null;
    const actorHash = await digest(uid), state = useSessionStore.getState(), session = state.session;
    const seats = await Promise.all(core.map(async roleId => {
      const seat = state.seats.find(row => row.id === roleId);
      return { roleId, status: seat?.status ?? null, holderUidHash: await digest(seat?.holderUid),
        claimedAtHash: await digest(JSON.stringify(seat?.claimedAt ?? null)) };
    }));
    // The public Session deliberately exposes occupancy without the private
    // holder UID. Bind identity to the existing normal GM control in this same
    // observation; neither a roster guess nor an unavailable Session pointer
    // can substitute for a current, unique, connected holder option.
    const pressEnabled = session?.pressEnabled !== false;
    const pressControl = {
      occupancyOwnBoolean: !!session && Object.hasOwn(session, 'pressClaimed') && typeof session.pressClaimed === 'boolean',
      occupancyTrue: session?.pressClaimed === true,
      panelCount: null, panelMounted: false, selectCount: null,
      selectMounted: false, selectEnabled: false, optionCount: null,
      optionMounted: false, optionEnabled: false, uidValid: false,
    };
    let pressHolderUidHash = null;
    if (pressEnabled) {
      const panels = Array.from(document.querySelectorAll('[aria-label="Explicit loyalty setup"]'));
      pressControl.panelCount = panels.length;
      pressControl.panelMounted = panels.length === 1 && panels[0].isConnected === true;
      if (pressControl.panelMounted) {
        const selects = Array.from(panels[0].querySelectorAll('select[aria-label="Loyalty holder"]'));
        pressControl.selectCount = selects.length;
        pressControl.selectMounted = selects.length === 1 && selects[0].isConnected === true;
        pressControl.selectEnabled = pressControl.selectMounted && selects[0].disabled === false;
        if (pressControl.selectMounted) {
          const options = Array.from(selects[0].options).filter(option =>
            typeof option.textContent === 'string' && option.textContent.startsWith('Press Officer — '));
          pressControl.optionCount = options.length;
          pressControl.optionMounted = options.length === 1 && options[0].isConnected === true;
          pressControl.optionEnabled = pressControl.optionMounted && options[0].disabled === false;
          const holderUid = options.length === 1 ? options[0].value : null;
          pressControl.uidValid = typeof holderUid === 'string' && /^[^\s/\u0000-\u001f\u007f]{1,128}$/.test(holderUid);
          if (pressControl.occupancyOwnBoolean && pressControl.occupancyTrue && pressControl.selectEnabled &&
            pressControl.optionEnabled && pressControl.uidValid) pressHolderUidHash = await digest(holderUid);
        }
      }
    }
    if (auth().currentUser?.uid !== uid || useSessionStore.getState().me?.uid !== uid) {
      throw new Error('The original GM Auth identity changed during casting observation.');
    }
    return { actorHash, sessionId: session?.id, cycle: session?.currentTurn, phase: session?.phase,
      fresh: state.connection === 'live' && state.sessionSnapshotFreshness === 'server',
      setupConfirmed: session?.setupConfirmed === true, configurationLocked: session?.configurationLocked === true,
      fullGameDemo: session?.fullGameDemo, activeRoleIds: session?.activeRoleIds,
      activeVesselIds: session?.activeVesselIds, pressEnabled, pressControl,
      pressHolderUidHash, seats };
  }, { moduleUrl: context.gm.storeModuleUrl(), core });
  failure.held.casting = current;
  failure.guard = 'original-casting.fresh-confirmed-unlocked-preparing-manual-source';
  assert.ok(current.fresh && current.actorHash === context.initial.uidHash &&
    current.sessionId === context.initial.sessionId && current.cycle === 0 &&
    ['lobby', 'casting'].includes(current.phase) && current.setupConfirmed && !current.configurationLocked &&
    exactKeys(current.fullGameDemo, ['status', 'progression']) && current.fullGameDemo.status === 'preparing' &&
    current.fullGameDemo.progression === 'manual' &&
    same(current.activeRoleIds, core), 'The original fresh full-game casting Source changed.');
  for (const seat of current.seats) {
    failure.guard = 'original-casting.canonical-seat-and-original-holder';
    assert.ok(seat.status === 'claimed' && seat.holderUidHash === roster.find(row => row.roleId === seat.roleId)?.uidHash,
      'A canonical core seat or original roster UID changed.');
  }
  failure.guard = 'original-casting.own-true-public-press-occupancy-and-current-control';
  assert.ok(!current.pressEnabled || (current.pressControl.occupancyOwnBoolean && current.pressControl.occupancyTrue &&
    current.pressControl.panelCount === 1 && current.pressControl.panelMounted &&
    current.pressControl.selectCount === 1 && current.pressControl.selectMounted && current.pressControl.selectEnabled &&
    current.pressControl.optionCount === 1 && current.pressControl.optionMounted && current.pressControl.optionEnabled &&
    current.pressControl.uidValid), 'The public Press occupancy or unique current GM holder control is unavailable.');
  const press = roster.filter(row => row.roleId === 'press-officer');
  failure.guard = 'original-casting.original-press-holder';
  assert.ok(press.length === (current.pressEnabled ? 1 : 0) &&
    (!current.pressEnabled || current.pressHolderUidHash === press[0].uidHash), 'The original Press holder changed.');
  const casting = context.gm.page.getByRole('region', { name: 'Facilitator casting', exact: true });
  for (const roleId of core) {
    const row = roster.find(row => row.roleId === roleId);
    const release = casting.getByRole('button', { name: `Release role from ${row.displayName}`, exact: true });
    failure.guard = 'original-casting.rendered-original-cast-release-control';
    assert.ok(await release.count() === 1 && await release.isVisible() && await release.isEnabled(),
      'Every original core actor must remain normally cast.');
  }
  return current;
}

async function instanceName(surface) {
  return surface.page.evaluate(async moduleUrl => {
    const { useSessionStore } = await import(moduleUrl);
    return useSessionStore.getState().gmInstance?.name ?? null;
  }, surface.storeModuleUrl());
}

async function renderedLanes(surface, nameA, nameB, ownName, lanesA, lanesB) {
  const panel = surface.page.getByRole('region', { name: 'GM instances', exact: true });
  await panel.waitFor({ state: 'visible' });
  for (const [name, lanes] of [[nameA, lanesA], [nameB, lanesB]]) {
    const board = panel.getByLabel(`${name} facilitator responsibilities`, { exact: true });
    for (const lane of ['main', 'assistant']) await board.getByText(
      `${lane === 'main' ? 'MAIN' : 'ASSISTANT'} FACILITATOR // ${lanes.includes(lane) ? 'HELD' : 'AVAILABLE'}`,
      { exact: true }).waitFor({ state: 'visible' });
  }
  assert.ok(await panel.locator('li.gm-instance').count() === 2 &&
    await panel.locator('li.gm-instance').filter({ has: surface.page.getByText(ownName, { exact: true }) })
      .getByText('THIS DEVICE', { exact: true }).count() === 1, 'The two rendered own/other GM instances changed.');
  return panel.getByLabel(`${ownName} facilitator responsibilities`, { exact: true });
}

function assertManifest(instances, actors, responsibilities) {
  assert.ok(Array.isArray(instances) && instances.length === actors.length, 'The normal live GM manifest count changed.');
  for (let index = 0; index < actors.length; index++) {
    const actor = actors[index], row = instances.find(value => value.id === actor.instanceId);
    assert.ok(row && row.sessionId === actor.sessionId && hash(row.uid).slice(0, 16) === actor.uidHash &&
      row.claimedAt === actor.claimedAt && same(row.responsibilities ?? [], responsibilities[index]),
    'The canonical live GM manifest UID, claim or lane projection changed.');
  }
}

/** One additive original-onBeforeStart proof; it borrows Root's two existing surfaces. */
export function createTwoLiveGmResponsibilityProof({ sourceRoot, expectedSourceBinding }) {
  const root = resolve(sourceRoot);
  assert.ok(expectedSourceBinding?.sourceRoot === root && typeof expectedSourceBinding.sourceCommit === 'string',
    'Root must bind the exact Source before creating this callback.');
  return Object.freeze({ async onBeforeStart(context) {
    const evidence = { status: 'failed-uncredited', stage: 'Source and original controller',
      sourceOnlyPreparedCallback: false, wholeGameAccepted: false, familyAcceptanceClaimed: false,
      actualHumans: 0, additionalAuthUids: 0, additionalBrowserProcesses: 0, additionalBrowserContexts: 0,
      publicPasswordAuthorizationClaimed: false, adminGameplayWrites: false, sdkReplay: false,
      moves: [], controllerRestored: false };
    let stage = evidence.stage;
    const failure = { guard: 'original-prestart.context', held: {} };
    try {
      assert.ok(context?.initial?.sessionId && context.directory && context.confirmed && context.prepared &&
        Array.isArray(context.roster) && context.roster.length > 0 && context.started === undefined,
      'Use the original admitted-and-cast prestart full-game context.');
      const beforeBinding = await captureTwoLiveGmResponsibilitySourceBinding({ sourceRoot: root });
      failure.guard = 'original-prestart.exact-source-binding';
      assert.ok(same(beforeBinding, expectedSourceBinding), 'The exact Source binding changed before Responsibility proof.');
      evidence.sourceBefore = beforeBinding;
      const ui = await import(pathToFileURL(resolve(root, 'scripts/pc10-browser-ui-receipt.mjs')).href);
      const lifecycle = await import(pathToFileURL(resolve(root, 'scripts/pc10-member-gm-lifecycle-ui-proof.mjs')).href);
      const { observeLifecycleActor, untilLifecycle, openLifecycleSettings, closeLifecycleSettings, captureLifecycleUiAction } = lifecycle;
      failure.guard = 'original-gm.settled-fresh-casting-authority';
      failure.held.settledGm = await context.gm.until('Original GM casting authority is settled', value => value.sameActor &&
        value.uidHash === context.initial.uidHash && value.gmInstanceOwned && value.playerRole === 'gm' &&
        value.connection === 'live' && value.freshness === 'server' && value.pendingCommandCount === 0);
      failure.guard = 'original-controller.settled-fresh-admitted-member';
      failure.held.settledController = await context.crew.until('Original admitted controller is current', value => value.sameActor &&
        value.profileRoleId === 'controller' && value.playerRole === 'player' && !value.gmInstanceOwned &&
        value.sessionId === context.initial.sessionId && value.connection === 'live' && value.freshness === 'server');
      failure.guard = 'original-gm.same-call-held-lifecycle-observation';
      const originalA = await observeLifecycleActor(context.gm);
      failure.held.originalA = originalA;
      failure.guard = 'original-controller.same-call-held-lifecycle-observation';
      const controller = await observeLifecycleActor(context.crew);
      failure.held.controller = controller;
      const savedCrewUrl = context.crew.page.url(), savedGmUrl = context.gm.page.url();
      failure.guard = 'original-gm.current-owned-live-prestart-lease';
      assert.ok(livePrestartGm(originalA), 'The original GM live prestart lease changed.');
      failure.guard = 'original-gm.initial-uid-and-session';
      assert.ok(originalA.uidHash === context.initial.uidHash && originalA.sessionId === context.initial.sessionId,
        'The original GM UID or session changed.');
      failure.guard = 'original-controller.independent-uid-and-original-session';
      assert.ok(controller.sessionId === context.initial.sessionId && controller.uidHash !== originalA.uidHash,
        'The original controller UID or session changed.');
      failure.guard = 'original-controller.controller-profile-and-no-cast-authority';
      assert.ok(controller.profileRoleId === 'controller' && controller.seatId === null &&
        controller.assignedRoleId === null && controller.activeConsoleRoleId === null,
        'The original controller profile or ordinary uncast authority changed.');
      failure.guard = 'original-controller.private-payload-count-zero';
      assert.ok(controller.privatePayloadCount === 0, 'The same-call controller private-payload projection must be exactly zero.');
      failure.guard = 'original-controller.no-cached-gm-access-and-no-pending-command';
      assert.ok(!controller.gmAccessCached && controller.pendingCount === 0,
        'The original controller must have no cached GM access or pending command.');
      const savedUrl = new URL(savedCrewUrl);
      failure.held.managerRoute = { originalManagerHash: savedUrl.hash === '#/demo-actors',
        originalControllerProfileQuery: savedUrl.searchParams.get('demoActor') === `${controller.sessionId}~controller` };
      failure.guard = 'original-controller.saved-manager-document-and-profile';
      assert.ok(savedUrl.hash === '#/demo-actors' && savedUrl.searchParams.get('demoActor') === `${controller.sessionId}~controller`,
        'Keep the original controller manager document and profile.');
      const beforeRoster = await readControllerRosterAndConsent(context.crew, context.initial.sessionId);
      failure.held.beforeRoster = beforeRoster;
      failure.held.contextRoster = context.roster;
      failure.guard = 'original-controller.original-consent-whole-roster-and-distinct-uids';
      assert.ok(beforeRoster.consentAcknowledged && same(beforeRoster.roster,
        context.roster.map(({ roleId, uidHash }) => ({ roleId, uidHash }))) &&
        new Set(context.roster.map(row => row.uidHash)).size === context.roster.length &&
        context.roster.every(row => ![controller.uidHash, originalA.uidHash].includes(row.uidHash)),
      'The original ordinary consent and full core/Press roster must already exist.');
      failure.guard = 'original-casting.same-existing-source-observation';
      const beforeCasting = await readOriginalCasting(context, failure), nameA = await instanceName(context.gm);
      const nameB = 'PC10 responsibility controller GM';
      failure.guard = 'original-gm.distinct-normal-instance-name';
      assert.ok(typeof nameA === 'string' && nameA.length > 0 && nameA !== nameB,
        'The two normal GM instance names must remain distinct.');
      const initialPanel = context.gm.page.getByRole('region', { name: 'GM instances', exact: true });
      failure.guard = 'original-gm.single-initial-mounted-live-instance';
      assert.ok(await initialPanel.locator('li.gm-instance').count() === 1,
        'The original fresh full-game must begin with only its original live GM.');

      stage = 'normal local authorization';
      failure.guard = 'local-authorization.normal-settings-button-offered';
      // Settings opens before its opted-in lazy LocalGmAccess child mounts.
      // Both share the existing page readiness budget; authority stays below.
      const authorizationReadyBy = Date.now() + 35_000;
      let dialog = await openLifecycleSettings(context.crew);
      const authorize = dialog.getByRole('button', { name: 'Authorize local emulator GM', exact: true });
      const authorizationReadyRemaining = authorizationReadyBy - Date.now();
      assert.ok(authorizationReadyRemaining > 0, 'The original Settings readiness budget expired.');
      await authorize.waitFor({ state: 'visible', timeout: authorizationReadyRemaining });
      assert.ok(await authorize.count() === 1 && await authorize.isVisible() && await authorize.isEnabled(),
        'Normal opted-in local emulator authorization must be offered.');
      const localResponse = await ui.observeUiReceipt({ waitForResponse: () => context.crew.page.waitForResponse(response =>
        new URL(response.url()).origin === savedUrl.origin && new URL(response.url()).pathname === '/__local-gm-access' &&
        response.request().method() === 'POST', { timeout: 60_000 }), choose: () => authorize.click() });
      failure.guard = 'local-authorization.actual-local-response-authorized';
      assert.ok(localResponse.status() === 200 && (await localResponse.json()).authenticated === true,
        'The actual normal local authorization transport did not authorize the existing controller.');
      await dialog.getByRole('button', { name: 'Revoke GM access', exact: true }).waitFor({ state: 'visible' });
      const authorized = await observeLifecycleActor(context.crew);
      failure.held.authorized = authorized;
      failure.guard = 'local-authorization.same-original-controller-member';
      assert.ok(authorized.uidHash === controller.uidHash && authorized.sessionId === controller.sessionId &&
        authorized.generation === controller.generation && authorized.playerRole === 'player' &&
        !authorized.gmInstanceOwned && authorized.gmAccessCached, 'Local authorization changed the original member.');
      evidence.localAuthorization = { endpoint: '/__local-gm-access', method: 'POST', httpStatus: localResponse.status(),
        authenticated: true, actorUidHash: controller.uidHash, inputPayloadRecorded: false,
        transport: 'actual normal opted-in loopback development UI', publicPasswordAuth: false };
      await closeLifecycleSettings(dialog);

      stage = 'normal controller GM claim and mounted manifest';
      failure.guard = 'controller-gm.normal-own-claim-and-mounted-console';
      await context.crew.page.getByRole('region', { name: 'Full-game demo crew', exact: true })
        .getByRole('link', { name: 'Back to stations', exact: true }).click();
      await context.crew.page.getByRole('link', { name: 'GM join', exact: true }).click();
      await context.crew.page.getByRole('textbox', { name: 'Input GM Name', exact: true }).fill(nameB);
      const claim = await captureLifecycleUiAction(context.crew, 'claimGmInstance', () =>
        context.crew.page.getByRole('button', { name: 'Join as GM', exact: true }).click());
      const originalB = await untilLifecycle(context.crew, controller,
        value => value.gmInstanceOwned && value.playerRole === 'gm' && value.pendingCount === 0,
        'The same original controller normally claims its own GM instance');
      failure.held.originalB = originalB;
      failure.guard = 'controller-gm.original-live-own-unassigned-claim';
      assert.ok(livePrestartGm(originalB) && claim.data.sessionId === controller.sessionId &&
        claim.data.instanceId === originalB.instanceId && claim.result.instance?.id === originalB.instanceId &&
        claim.result.instance?.claimedAt === originalB.claimedAt && claim.result.instance?.name === nameB &&
        (claim.result.instance?.responsibilities ?? []).length === 0,
      'The controller must claim its own new unassigned live GM lease.');
      await context.crew.page.getByRole('button', { name: /^Open station catalog/ }).click();
      const mountResponse = await ui.observeUiReceipt({ waitForResponse: () => context.crew.page.waitForResponse(response =>
        response.request().method() === 'POST' && new URL(response.url()).pathname.endsWith('/us-central1/listGmInstances'),
      { timeout: 60_000 }), choose: () => context.crew.page.getByRole('link', { name: 'GM Console', exact: true }).click() });
      assert.ok(mountResponse.status() === 200, 'The normal GM Console manifest response failed.');
      failure.guard = 'controller-gm.exact-two-original-live-manifest';
      assertManifest((await mountResponse.json()).result?.instances, [originalA, originalB], [['main', 'assistant'], []]);
      evidence.claim = { endpoint: 'claimGmInstance', httpStatus: claim.httpStatus, actorUidHash: originalB.uidHash,
        instanceHash: hash(originalB.instanceId), claimedAtHash: hash(originalB.claimedAt),
        requestFingerprint: hash(claim.data), resultFingerprint: hash(claim.result), sourceLiveManifestCount: 2 };
      const revision = originalA.setupRevision, requestIds = new Set();
      failure.guard = 'responsibility.initial-current-original-setup-revision';
      assert.ok(Number.isSafeInteger(revision) && revision >= 0, 'Read the current original setup revision.');
      for (const step of [0, 1, 2]) {
        stage = CONTROLS[step];
        failure.guard = `responsibility.move-${step + 1}.current-original-authority-and-rendered-control`;
        const surface = step === 2 ? context.crew : context.gm;
        const lanesA = step === 2 ? ['main'] : ['main', 'assistant'];
        const lanesB = step === 0 ? [] : ['assistant'];
        await untilLifecycle(context.gm, originalA, value => value.setupRevision === revision + step && value.pendingCount === 0,
          'Original GM current Responsibility revision', { gm: true });
        await untilLifecycle(context.crew, originalB, value => value.setupRevision === revision + step && value.pendingCount === 0,
          'Original controller GM current Responsibility revision', { gm: true });
        const board = await renderedLanes(surface, nameA, nameB, step === 2 ? nameB : nameA, lanesA, lanesB);
        const control = board.getByRole('button', { name: CONTROLS[step], exact: true });
        assert.ok(await control.count() === 1 && await control.isVisible() && await control.isEnabled(),
          'The exact own held-lane Responsibility control must be rendered and offered.');
        const capture = await captureLifecycleUiAction(surface, 'setFacilitatorResponsibility', () => control.click());
        failure.guard = `responsibility.move-${step + 1}.fresh-ui-request-id`;
        assert.ok(!requestIds.has(capture.data.requestId), 'Every normal Responsibility move must have its own fresh UI request ID.');
        requestIds.add(capture.data.requestId);
        evidence.moves.push(assertTwoLiveGmResponsibilityMove({ step, capture, originalA, originalB, expectedRevision: revision + step }));
        const afterA = step === 1 ? ['main'] : ['main', 'assistant'], afterB = step === 2 ? [] : ['assistant'];
        for (const [view, own] of [[context.gm, nameA], [context.crew, nameB]])
          await renderedLanes(view, nameA, nameB, own, afterA, afterB);
      }

      stage = 'normal own GM release and original live manifest';
      failure.guard = 'controller-gm.normal-own-release-and-live-manifest';
      dialog = await openLifecycleSettings(context.crew);
      let release;
      const releasedManifest = await ui.observeUiReceipt({ waitForResponse: () => context.gm.page.waitForResponse(async response => {
        if (response.request().method() !== 'POST' || !new URL(response.url()).pathname.endsWith('/us-central1/listGmInstances')) return false;
        return (await response.json()).result?.instances?.length === 1;
      }, { timeout: 60_000 }), choose: async () => { release = await captureLifecycleUiAction(context.crew,
        'releaseGmInstance', () => dialog.getByRole('button', { name: 'Release GM role', exact: true }).click()); } });
      assert.ok(release.data.instanceId === originalB.instanceId && release.data.targetInstanceId === originalB.instanceId &&
        release.result?.targetInstanceId === originalB.instanceId, 'Only the controller own GM instance may be released.');
      failure.guard = 'released-controller.original-member-and-zero-private-payload';
      const released = await untilLifecycle(context.crew, originalB, value => !value.gmInstanceOwned && value.playerRole === 'player' &&
        value.privatePayloadCount === 0 && value.pendingCount === 0, 'Original controller returns to its ordinary private audience',
      { releasedGm: true });
      failure.held.released = released;
      assert.ok(releasedManifest.status() === 200, 'The restored normal GM manifest response failed.');
      const finalInstances = (await releasedManifest.json()).result?.instances;
      failure.guard = 'original-gm.restored-single-live-manifest-and-legacy-main';
      assertManifest(finalInstances, [originalA], [['main', 'assistant']]);
      assert.ok(finalInstances[0].responsibility === 'main', 'The original GM legacy main lane must also be restored.');
      evidence.release = { endpoint: 'releaseGmInstance', httpStatus: release.httpStatus,
        actorUidHash: originalB.uidHash, instanceHash: hash(originalB.instanceId),
        requestFingerprint: hash(release.data), resultFingerprint: hash(release.result), sourceLiveManifestCount: 1 };
      dialog = await openLifecycleSettings(context.crew);
      failure.guard = 'released-controller.normal-own-gm-access-revoke';
      const logout = await captureLifecycleUiAction(context.crew, 'logoutGmAccess', () =>
        dialog.getByRole('button', { name: 'Revoke GM access', exact: true }).click());
      assert.ok(logout.result?.authenticated === false && logout.data.sessionId === null && logout.data.instanceId === null,
        'Normal GM access revoke must follow own release and remove the local grant.');
      await closeLifecycleSettings(dialog);
      evidence.revoke = { endpoint: 'logoutGmAccess', httpStatus: logout.httpStatus,
        requestFingerprint: hash(logout.data), resultFingerprint: hash(logout.result), authenticated: false };

      stage = 'original controller manager, roster and casting restoration';
      failure.guard = 'restored-controller.original-manager-member-and-zero-private-payload';
      await context.crew.page.goto(savedCrewUrl);
      const restored = await untilLifecycle(context.crew, controller, value => value.profileRoleId === 'controller' &&
        value.playerRole === 'player' && !value.gmInstanceOwned && !value.gmAccessCached &&
        value.privatePayloadCount === 0 && value.pendingCount === 0 && value.seatId === null &&
        value.assignedRoleId === null && value.activeConsoleRoleId === null && value.setupRevision === revision + 3,
      'Original legitimate controller manager restored');
      failure.held.restored = restored;
      failure.guard = 'restored-controller.exact-original-controller-and-gm-routes';
      assert.ok(context.crew.page.url() === savedCrewUrl && context.gm.page.url() === savedGmUrl,
        'The original controller and GM routes must be restored before the original callbacks continue.');
      const afterRoster = await readControllerRosterAndConsent(context.crew, context.initial.sessionId);
      failure.held.afterRoster = afterRoster;
      failure.guard = 'restored-controller.exact-original-consent-and-whole-roster';
      assert.ok(same(beforeRoster, afterRoster) && afterRoster.consentAcknowledged,
        'The original consent and every core/Press actor identity must remain unchanged.');
      const crewPanel = context.crew.page.getByRole('region', { name: 'Full-game demo crew', exact: true });
      await crewPanel.getByRole('link', { name: 'Back to stations', exact: true }).waitFor({ state: 'visible' });
      failure.guard = 'restored-controller.whole-original-rendered-actor-switch-sequence';
      assert.ok(await crewPanel.getByRole('list', { name: 'Prepared demo actors', exact: true }).getByRole('button').count() ===
        context.roster.length && await context.crew.page.getByLabel('Current actor', { exact: true }).inputValue() === 'controller',
      'The complete original actor-switch sequence must remain offered.');
      failure.guard = 'restored-casting.same-existing-source-observation';
      const afterCasting = await readOriginalCasting(context, failure);
      failure.guard = 'restored-casting.exact-original-core-and-press-casting';
      assert.ok(same(beforeCasting, afterCasting), 'The original core/Press casting Source changed.');
      // App's existing five-second normal GM reconciliation owns this refresh.
      // Read current projection only; do not initiate an SDK call or rewrite it.
      failure.guard = 'original-gm.existing-reconciliation-restored-own-lane-projection';
      await context.gm.page.waitForFunction(async ({ moduleUrl, instanceId, claimedAt }) => {
        const { useSessionStore } = await import(moduleUrl);
        const { auth } = await import('/src/lib/firebase.ts');
        const state = useSessionStore.getState(), own = state.gmInstance;
        return state.connection === 'live' && state.sessionSnapshotFreshness === 'server' &&
          own?.id === instanceId && own.claimedAt === claimedAt && own.uid === auth().currentUser?.uid &&
          own.uid === state.me?.uid && state.me?.role === 'gm' &&
          JSON.stringify(own.responsibilities) === JSON.stringify(['main', 'assistant']) && own.responsibility === 'main';
      }, { moduleUrl: context.gm.storeModuleUrl(), instanceId: originalA.instanceId, claimedAt: originalA.claimedAt });
      const finalA = await untilLifecycle(context.gm, originalA, value => value.setupRevision === revision + 3 && value.pendingCount === 0,
        'Original GM UID and owned claim retained', { gm: true });
      failure.held.finalA = finalA;
      failure.guard = 'restored-actors.exact-original-gm-lease-and-controller-uid';
      assert.ok(sameGmLease(originalA, finalA) && restored.uidHash === controller.uidHash,
        'The original actor pair must survive the whole temporary-role sequence.');
      evidence.sourceAfter = await captureTwoLiveGmResponsibilitySourceBinding({ sourceRoot: root });
      failure.guard = 'restored-proof.exact-source-binding-retained';
      assert.ok(same(evidence.sourceAfter, beforeBinding), 'Source changed during Responsibility proof; retain zero credit.');
      Object.assign(evidence, { status: 'actual-mounted-three-responsibility-moves-and-controller-restoration',
        stage: 'complete', sourceUnchanged: true, controllerRestored: true,
        originalGmUidHash: originalA.uidHash, originalGmInstanceHash: hash(originalA.instanceId),
        originalControllerUidHash: controller.uidHash, sessionHash: hash(context.initial.sessionId),
        beforeRevision: revision, afterRevision: revision + 3, retainedSetupRevisionAdvance: 3,
        retainedResponsibilityAuditEvents: 3, retainedResponsibilityReceipts: 3, retainedResponsibilityCommandMarkers: 3,
        retainedOwnReleaseReceipt: true, byteRestorationClaimed: false,
        fullOriginalRosterRetained: true, ordinaryConsentRetained: true,
        rosterFingerprint: hash(beforeRoster.roster), consentTimestampFingerprint: hash(beforeRoster.consentAt),
        coreActorCount: context.confirmed.activeRoleIds.length, pressActorCount: context.roster.length - context.confirmed.activeRoleIds.length,
        originalUniqueAuthUidCount: context.roster.length + 2, peakLiveGmInstances: 2, distinctEverGmUids: 2,
        secondGmOverlapsOriginalController: true, originalGmLanes: ['main', 'assistant'], originalGmLegacyResponsibility: 'main',
        conditionalWolfAudienceDelta: 'A pre-existing assignment may retain the controller UID after claim; no secret audience was inspected or repaired. Normal fresh start writes then-current GM UIDs.' });
      await writeFile(resolve(context.directory, 'two-live-gm-responsibility.json'), `${JSON.stringify(evidence, null, 2)}\n`, { flag: 'wx' });
      return evidence;
    } catch (error) {
      Object.assign(evidence, { stage, errorName: error?.name ?? 'Error', errorCode: error?.code ?? null,
        failureGuard: error?.proofGuard ?? failure.guard,
        heldObservations: safeHeldFailureObservations(failure.held),
        responsibilityHeldObservations: error?.safeHeldObservations ?? null,
        failure: 'The original actor, Source, current native receipt, rendered projection or restoration contract failed.',
        rawFailureRetainedOnlyInMemory: true });
      if (context?.directory) await writeFile(resolve(context.directory, 'two-live-gm-responsibility-failure.json'),
        `${JSON.stringify(evidence, null, 2)}\n`, { flag: 'wx' });
      throw new Error(`Two-live-GM Responsibility proof failed at ${stage} (guard ${error?.proofGuard ?? failure.guard}); preserve the safe failure receipt and Root-owned cleanup.`,
        { cause: error });
    }
  } });
}
