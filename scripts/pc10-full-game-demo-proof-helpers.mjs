import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';
import { rememberProofFailure } from './pc10-proof-failure-evidence.mjs';
import { createPresentationMemberResumeObserver } from './pc10-presentation-member-resume.mjs';

/** Compare real UI/SDK receipts; this helper neither invokes nor seeds a game. */
export function assertExactFullGameStartRecovery({ payload, original, replay, expected }) {
  assert.equal(payload.sessionId, expected.sessionId);
  assert.equal(payload.instanceId, expected.instanceId);
  assert.equal(payload.fullGameDemo, true);
  assert.ok(typeof payload.requestId === 'string' && payload.requestId.length > 0);
  assert.ok(Number.isSafeInteger(payload.expectedSetupRevision) && payload.expectedSetupRevision >= 0);
  assert.equal(original.status, 'committed');
  assert.equal(replay.status, 'replayed');
  for (const value of [original, replay]) {
    assert.equal(value.sessionId, payload.sessionId);
    assert.equal(value.requestId, payload.requestId);
    assert.equal(value.currentTurn, 1);
  }
  const originalResult = { ...original };
  const replayResult = { ...replay };
  delete originalResult.status;
  delete replayResult.status;
  assert.deepEqual(replayResult, originalResult);
}

export function proofRuntimeFromViteSource(source) {
  const assignment = source.match(/import\.meta\.env\s*=\s*(\{[^\n]+\});/);
  assert.ok(assignment, 'Vite must expose its actual environment before gameplay.');
  const env = JSON.parse(assignment[1]);
  return { projectId: env.VITE_FIREBASE_PROJECT_ID, useEmulators: env.VITE_USE_EMULATORS === '1',
    ports: { auth: Number(env.VITE_FIREBASE_AUTH_EMULATOR_PORT),
      functions: Number(env.VITE_FIREBASE_FUNCTIONS_EMULATOR_PORT),
      firestore: Number(env.VITE_FIREBASE_FIRESTORE_EMULATOR_PORT) } };
}

export function validateProofRuntime(runtime, expected) {
  assert.ok(['localhost', '127.0.0.1'].includes(new URL(expected.baseUrl).hostname), 'Loopback browser only.');
  assert.match(expected.projectId, /^demo-[a-z0-9-]+$/, 'Explicit demo project only.');
  assert.equal(runtime.projectId, expected.projectId, 'Runtime must be the root-owned project.');
  assert.equal(runtime.useEmulators, true, 'All services must use emulators.');
  for (const key of ['auth', 'functions', 'firestore']) {
    assert.ok(Number.isInteger(expected.ports[key]) && expected.ports[key] > 0 && expected.ports[key] < 65536);
    assert.equal(runtime.ports[key], expected.ports[key], `Root-owned ${key} port required.`);
  }
  return { projectId: runtime.projectId, useEmulators: true, ports: { ...expected.ports } };
}

export function assertSelectedActor(current, expected) {
  assert.equal(current.sessionId, expected.sessionId);
  assert.equal(current.profileRoleId, expected.roleId);
  assert.equal(current.uidHash, expected.uidHash);
  assert.equal(current.sameActor, true, 'Selected SDK UID must equal the server member.');
  assert.equal(current.playerRole, 'player');
  assert.equal(current.connection, 'live');
  assert.equal(current.freshness, 'server');
}

/**
 * Freeze the Browser B actor that actually remains selected after optional,
 * ordinary setup callbacks. The callback may legitimately move the browser
 * from its original controller persona to one of the admitted personas.
 */
export function captureFullGameDemoPresentationActor(current, options) {
  const { sessionId, controller, roster, confirmedRoleIds, pressIncluded = false } = options ?? {};
  assert.ok(typeof sessionId === 'string' && sessionId.length > 0);
  assert.ok(controller && controller.sessionId === sessionId && typeof controller.uidHash === 'string');
  assert.ok(Array.isArray(roster));
  assert.ok(Array.isArray(confirmedRoleIds));
  assert.equal(typeof pressIncluded, 'boolean');
  assert.ok(current && typeof current === 'object');
  assert.equal(current.hasAuth, true, 'The original Browser B account must remain authenticated before start.');
  assert.equal(current.sameActor, true, 'The current SDK identity must match its authorized session member.');
  assert.equal(current.sessionId, sessionId, 'The selected original actor must belong to this confirmed session.');
  assert.equal(current.playerRole, 'player');
  assert.equal(current.connection, 'live');
  assert.equal(current.freshness, 'server');
  assert.equal(current.cycle, 0, 'Capture must happen before the real Cycle 0 to 1 start.');
  assert.ok(['lobby', 'casting'].includes(current.phase));
  assert.equal(current.setupConfirmed, true);
  assert.deepEqual(current.fullGameDemo, { status: 'preparing', progression: 'manual' });
  assert.equal(current.gmInstanceOwned, false);
  assert.equal(current.instanceId ?? null, null);

  const identities = [
    { roleId: 'controller', uidHash: controller.uidHash, kind: 'controller' },
    ...roster.map(actor => ({ roleId: actor?.roleId, uidHash: actor?.uidHash, kind: 'roster' })),
  ];
  assert.ok(identities.every(actor => typeof actor.roleId === 'string' && actor.roleId.length > 0 &&
    typeof actor.uidHash === 'string' && actor.uidHash.length > 0), 'Known demo actors must have bounded role and identity hashes.');
  assert.equal(new Set(identities.map(actor => actor.roleId)).size, identities.length,
    'The admitted roster and controller must have unique profile roles.');
  assert.equal(new Set(identities.map(actor => actor.uidHash)).size, identities.length,
    'The admitted roster and controller must retain separate Auth identities.');
  const matches = identities.filter(actor => actor.roleId === current.profileRoleId && actor.uidHash === current.uidHash);
  assert.equal(matches.length, 1, 'The selected persona must be the controller or an exact original admitted roster identity.');

  const selected = matches[0];
  if (selected.kind === 'controller') {
    assert.equal(current.profileRoleId, 'controller');
    assert.equal(current.assignedRoleId ?? null, null, 'The ordinary controller must not inherit a crew assignment.');
    assert.equal(current.activeConsoleRoleId ?? null, null, 'The ordinary controller must not claim a crew console.');
  } else if (selected.roleId === 'press-officer') {
    assert.equal(pressIncluded, true, 'Press must have been included in the explicitly prepared roster.');
    assert.equal(current.pressEnabled, true, 'The server-confirmed session must still enable its Press actor.');
    assert.equal(current.assignedRoleId ?? null, null, 'Press has no core-seat assignment pointer.');
    assert.ok(current.activeConsoleRoleId === null || current.activeConsoleRoleId === 'press-officer',
      'The original Press account may have no console or its current ordinary Press console.');
  } else {
    assert.ok(confirmedRoleIds.includes(selected.roleId), 'The persona must be among the setup-confirmed core roles.');
    assert.equal(current.assignedRoleId, selected.roleId, 'The original persona must still hold its normal GM assignment.');
    assert.equal(current.activeConsoleRoleId, selected.roleId, 'The original persona must retain its selected authorized console.');
  }

  return Object.freeze({
    hasAuth: true,
    sameActor: true,
    sessionId,
    uidHash: current.uidHash,
    playerRole: current.playerRole,
    profileRoleId: current.profileRoleId,
    assignedRoleId: current.assignedRoleId ?? null,
    activeConsoleRoleId: current.activeConsoleRoleId ?? null,
    instanceId: current.instanceId ?? null,
    gmInstanceOwned: false,
  });
}

/** Read only the current post-digest member/SDK tuple. Private source objects,
 * raw UIDs, credentials and private documents never leave the browser. */
export async function observeFullGameDemoPresentationMember(surface, { knownRoleIds = [] } = {}) {
  const authorityModuleUrl = surface.sessionAuthorityModuleUrl?.();
  assert.ok(typeof authorityModuleUrl === 'string' && authorityModuleUrl.length > 0,
    'The mounted App SDK authority module must be observed before presentation.');
  const storeUrl = new URL(surface.storeModuleUrl(), 'http://127.0.0.1');
  const authorityUrl = new URL(authorityModuleUrl, storeUrl);
  assert.equal(authorityUrl.origin, storeUrl.origin, 'Authority must come from the mounted App origin.');
  assert.equal(authorityUrl.pathname, '/src/lib/sessionSnapshotAuthority.ts');
  return surface.page.evaluate(async ({ moduleUrl, knownRoleIds, authorityModuleUrl }) => {
    const { auth } = await import('/src/lib/firebase.ts');
    const { useSessionStore } = await import(moduleUrl);
    const { sessionSnapshotAuthorityFor, memberSessionResumeBlocksFreshness } =
      await import(authorityModuleUrl);
    const originalUid = auth().currentUser?.uid;
    const uidHash = originalUid ? Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',
      new TextEncoder().encode(originalUid)))).map(byte => byte.toString(16).padStart(2, '0')).join('').slice(0, 16) : null;
    const state = useSessionStore.getState(), user = auth().currentUser, session = state.session, me = state.me;
    if (user?.uid !== originalUid) throw new Error('Original Auth UID changed during presentation readiness observation.');
    const scope = session?.memberSessionScope, berth = session?.currentActorBerthAuthority;
    const authority = originalUid && session?.id ? sessionSnapshotAuthorityFor(session.id, originalUid) : null;
    const marker = session?.fullGameDemo;
    const currentMemberBerthPresent = !!session && Object.hasOwn(session, 'currentActorBerthAuthority');
    const wireId = value => typeof value === 'string' && value.length > 0 && value.length <= 1_500 && !value.includes('/');
    const nullableRole = value => value === null || wireId(value);
    const keys = ['sessionId', 'actorUid', 'groupId', 'role', 'connectionGeneration',
      'assignedRoleId', 'activeConsoleRoleId', 'replacementRoleId', 'replacementStatus', 'shipId'];
    const memberScopeMatches = Boolean(scope && typeof scope.groupId === 'string' && /^fleet-[1-9][0-9]*$/.test(scope.groupId) &&
      scope.groupId === me?.fleetGroupId && Array.isArray(scope.vesselIds) && Array.isArray(scope.craftIds));
    const currentMemberBerthMatches = Boolean(session && berth && typeof berth === 'object' && !Array.isArray(berth) &&
      Object.keys(berth).length === keys.length && Object.keys(berth).every(key => keys.includes(key)) &&
      wireId(berth.sessionId) && wireId(berth.actorUid) && wireId(berth.shipId) &&
      berth.role === 'player' && Number.isSafeInteger(berth.connectionGeneration) && berth.connectionGeneration >= 1 &&
      nullableRole(berth.assignedRoleId) && nullableRole(berth.activeConsoleRoleId) && nullableRole(berth.replacementRoleId) &&
      berth.replacementStatus === null && me?.role === 'player' && me.connected === true && me.replacementStatus == null &&
      berth.sessionId === session.id && me.sessionId === session.id && berth.actorUid === me.uid &&
      memberScopeMatches && berth.groupId === scope.groupId && scope.vesselIds.includes(berth.shipId) &&
      berth.connectionGeneration === (me.connectionGeneration ?? 1) && berth.assignedRoleId === (me.assignedRoleId ?? null) &&
      berth.activeConsoleRoleId === (me.activeConsoleRoleId ?? null) && berth.replacementRoleId === (me.replacementRoleId ?? null));
    const snn = session?.shuttleControl?.['snn-press-shuttle'];
    const controlKeys = ['shuttleId', 'ownerRoleId', 'ownerUid', 'holderUid', 'revision'];
    const pressCraftScopeMatches = Boolean(memberScopeMatches && (scope.craftIds.length === 0 ||
      scope.craftIds.length === 1 && scope.craftIds[0] === 'snn-press-shuttle' && snn &&
      Object.keys(snn).length === controlKeys.length && Object.keys(snn).every(key => controlKeys.includes(key)) &&
      snn.shuttleId === 'snn-press-shuttle' && snn.ownerRoleId === 'press-officer' &&
      snn.ownerUid === originalUid && snn.holderUid === originalUid && Number.isSafeInteger(snn.revision) && snn.revision >= 0));
    const safeCode = code => ['permission-denied', 'unauthenticated', 'unavailable', 'failed-precondition',
      'not-found', 'resource-exhausted', 'deadline-exceeded'].includes(code) ? code : 'other';
    const safeKind = kind => ['station-selection-required', 'rate-limited', 'unavailable-service',
      'malformed-input', 'stale-revision'].includes(kind) ? kind : 'other';
    const invalidFields = [], roles = new Set(knownRoleIds);
    const typed = (key, value, valid) => valid(value) ? value : (invalidFields.push(key), null);
    const roleId = (key, value) => typed(key, value ?? null, id => id === null || typeof id === 'string' && roles.has(id));
    const sessionId = (key, value) => typed(key, value ?? null, id => id === null || typeof id === 'string' && /^[\w-]{1,128}$/.test(id));
    const number = (key, value) => typed(key, value ?? null, n => n === null || Number.isSafeInteger(n) && n >= 0);
    const enumeration = (key, value, values) => typed(key, value ?? null, v => v === null || values.includes(v));
    return { hasAuth: !!user, sameActor: !!user && user.uid === me?.uid, uidHash,
      documentTimeOrigin: typed('documentTimeOrigin', performance.timeOrigin, n => Number.isFinite(n) && n > 0),
      sessionId: sessionId('sessionId', session?.id), meSessionId: sessionId('meSessionId', me?.sessionId),
      profileRoleId: null,
      profileSessionId: null,
      playerRole: enumeration('playerRole', me?.role, ['player', 'gm']), assignedRoleId: roleId('assignedRoleId', me?.assignedRoleId),
      activeConsoleRoleId: roleId('activeConsoleRoleId', me?.activeConsoleRoleId), seatId: roleId('seatId', me?.seatId),
      fleetGroupId: typed('fleetGroupId', me?.fleetGroupId ?? null, id => id === null || typeof id === 'string' && /^fleet-[1-9][0-9]*$/.test(id)),
      replacementRoleId: roleId('replacementRoleId', me?.replacementRoleId),
      replacementStatus: enumeration('replacementStatus', me?.replacementStatus, ['pending', 'assigned']),
      escapeLocked: me?.escapeState != null, kicked: me?.kickedAt != null, connected: me?.connected !== false,
      currentOwnPlayerConfirmed: me?.connected === true, connectionGeneration: number('connectionGeneration', me?.connectionGeneration),
      identityHydrationRevision: number('identityHydrationRevision', state.identityHydrationRevision),
      connection: enumeration('connection', state.connection, ['live', 'offline', 'connecting', 'disconnected']),
      freshness: enumeration('freshness', state.sessionSnapshotFreshness, ['server', 'cache']),
      cycle: number('cycle', session?.currentTurn), phase: enumeration('phase', session?.phase, ['lobby', 'casting', 'briefing', 'active', 'debrief', 'closed']),
      setupConfirmed: session?.setupConfirmed === true,
      fullGameDemo: marker ? { status: enumeration('demoStatus', marker.status, ['preparing', 'active', 'complete']),
        progression: enumeration('demoProgression', marker.progression, ['manual']) } : null,
      fullGameDemoExact: !!marker && typeof marker === 'object' && !Array.isArray(marker) &&
        Object.keys(marker).length === 2 && Object.hasOwn(marker, 'status') && Object.hasOwn(marker, 'progression'),
      pressEnabled: session?.pressEnabled !== false,
      instanceId: sessionId('instanceId', state.gmInstance?.id),
      gmInstanceOwned: !!state.gmInstance && state.gmInstance.uid === user?.uid && state.gmInstance.sessionId === session?.id,
      currentMemberBerthPresent, currentMemberBerthNull: currentMemberBerthPresent && berth === null,
      currentMemberBerthMatches, memberScopeMatches,
      memberVesselCount: Array.isArray(scope?.vesselIds) ? scope.vesselIds.length : null,
      memberCraftCount: Array.isArray(scope?.craftIds) ? scope.craftIds.length : null,
      pressCraftScopeMatches,
      currentCanonicalSeatOwned: state.seats.some(seat => seat.id === me?.assignedRoleId &&
        (seat.roleId ?? seat.id) === me.assignedRoleId && seat.status === 'claimed' && seat.holderUid === me.uid),
      sdkHasServerAuthority: authority?.hasServerSessionAuthority === true,
      sdkResumePending: authority ? memberSessionResumeBlocksFreshness(authority) : true,
      communicationError: state.communicationError ? { code: safeCode(state.communicationError.code),
        kind: safeKind(state.communicationError.kind) } : null, invalidFields };
  }, { moduleUrl: surface.storeModuleUrl(), knownRoleIds, authorityModuleUrl });
}

/** Await the existing App recovery before freezing presentation identity. This
 * grants no station action and issues no navigation, SDK mutation or retry. */
export async function waitForFullGameDemoPresentationActor(options) {
  const { surface, deadlineAt, onSample } = options;
  const now = options.now ?? Date.now;
  const wait = options.wait ?? (milliseconds => delay(milliseconds));
  let initial, current, previous, acceptedEpoch, sampleCount = 0;
  const samples = [], knownRoleIds = ['controller', ...options.roster.map(actor => actor.roleId)];
  const resume = createPresentationMemberResumeObserver(surface.page, { sessionId: options.sessionId, deadlineAt, knownRoleIds });
  const budget = () => assert.ok(Number.isFinite(deadlineAt) && now() < deadlineAt,
    'Original presentation start readiness deadline expired.');
  async function withinBudget(operation) {
    budget(); let timer;
    try {
      const value = await Promise.race([Promise.resolve().then(operation), new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('Original presentation start readiness deadline expired.')), Math.max(1, deadlineAt - now()));
      })]);
      budget(); return value;
    } finally { clearTimeout(timer); }
  }
  try {
    async function observeMember() {
      current = await withinBudget(() => observeFullGameDemoPresentationMember(surface, { knownRoleIds })); sampleCount++;
      if (samples.length < 256) samples.push(current);
      return current;
    }
    function validateTuple(value) {
      current = value;
      assert.deepEqual(current.invalidFields, [], 'Malformed presentation tuple is not authority.');
      initial ??= current; acceptedEpoch ??= current;
      assert.equal(current.hasAuth, true); assert.equal(current.sameActor, true);
      assert.equal(current.sessionId, options.sessionId); assert.equal(current.meSessionId, options.sessionId);
      assert.equal(current.profileSessionId, options.sessionId); assert.equal(current.playerRole, 'player');
      const known = [{ roleId: 'controller', uidHash: options.controller?.uidHash }, ...options.roster];
      assert.equal(known.filter(actor => actor.roleId === current.profileRoleId && actor.uidHash === current.uidHash).length, 1,
        'Presentation must retain an exact original admitted identity.');
      for (const key of ['documentTimeOrigin', 'uidHash', 'profileRoleId', 'profileSessionId', 'sessionId', 'meSessionId',
        'playerRole', 'fleetGroupId', 'assignedRoleId']) assert.equal(current[key], initial[key], `Original presentation ${key} changed.`);
      assert.ok(Number.isFinite(current.documentTimeOrigin) && current.documentTimeOrigin > 0);
      assert.ok(Number.isSafeInteger(current.connectionGeneration) && current.connectionGeneration >= 1);
      assert.ok(Number.isSafeInteger(current.identityHydrationRevision) && current.identityHydrationRevision >= 1);
      if (previous) {
        assert.ok(current.connectionGeneration >= previous.connectionGeneration, 'Current presentation lease regressed.');
        assert.ok(current.identityHydrationRevision >= previous.identityHydrationRevision, 'Current presentation hydration regressed.');
      }
      previous = current;
      assert.equal(current.connected, true); assert.equal(current.kicked, false);
      assert.equal(current.escapeLocked, false); assert.equal(current.replacementRoleId, null); assert.equal(current.replacementStatus, null);
      assert.equal(current.instanceId, null); assert.equal(current.gmInstanceOwned, false);
      assert.equal(current.cycle, 0); assert.ok(['lobby', 'casting'].includes(current.phase));
      assert.equal(current.setupConfirmed, true); assert.equal(current.fullGameDemoExact, true);
      assert.deepEqual(current.fullGameDemo, { status: 'preparing', progression: 'manual' });
      const press = current.profileRoleId === 'press-officer';
      if (press) {
        assert.equal(options.pressIncluded, true); assert.equal(current.pressEnabled, true);
        assert.equal(current.assignedRoleId, null); assert.equal(current.seatId, null);
        assert.ok(current.activeConsoleRoleId === null || current.activeConsoleRoleId === 'press-officer');
        if (current.currentMemberBerthPresent) assert.equal(current.currentMemberBerthNull, true, 'Press cannot acquire a capital-ship berth.');
        if (current.memberVesselCount !== null) {
          assert.equal(current.memberScopeMatches, true, 'The Press account must retain its current fleet member scope.');
          // A withdrawn console is an ordinary unassigned account. Its normal
          // server fleet public projection confers no Press station capability.
          if (current.activeConsoleRoleId === 'press-officer') {
            assert.equal(current.memberVesselCount, 0, 'Held Press has no capital-vessel audience.');
            assert.equal(current.pressCraftScopeMatches, true, 'Held Press can retain only its own SNN craft scope.');
          }
        }
      } else if (current.profileRoleId === 'controller') {
        assert.equal(current.assignedRoleId, null); assert.equal(current.activeConsoleRoleId, null);
      } else {
        assert.ok(options.confirmedRoleIds.includes(current.profileRoleId));
        assert.equal(current.assignedRoleId, current.profileRoleId); assert.equal(current.activeConsoleRoleId, current.profileRoleId);
        assert.equal(current.currentCanonicalSeatOwned, true);
        if (current.currentMemberBerthPresent) assert.equal(current.currentMemberBerthMatches, true);
      }
      return current.connection === 'live' && current.freshness === 'server' && current.currentOwnPlayerConfirmed &&
        current.sdkHasServerAuthority && !current.sdkResumePending &&
        (!press || current.currentMemberBerthPresent && current.currentMemberBerthNull && current.memberScopeMatches);
    }
    async function inspect() {
      let ready = validateTuple(await observeMember());
      if (ready && (current.connectionGeneration !== acceptedEpoch.connectionGeneration ||
          current.identityHydrationRevision !== acceptedEpoch.identityHydrationRevision)) {
        assert.ok(resume, 'Presentation epoch changed without passive normal SDK evidence.');
        const settled = await withinBudget(() => resume.accept(acceptedEpoch, current, async () => {
          const value = await observeMember();
          // The receipt reread can yield too. Validate its complete role and
          // scope tuple before the observer credits an accepted transition.
          validateTuple(value); return value;
        }));
        ready = settled !== null && validateTuple(settled);
        if (ready) acceptedEpoch = settled;
      }
      resume?.bind(current); return ready;
    }
    while (true) {
      await inspect();
      await withinBudget(() => onSample?.(current));
      // Diagnostics may yield. Reobserve and revalidate the complete current
      // tuple after that yield before returning any frozen actor identity.
      if (await inspect()) {
        resume?.close();
        return { actor: captureFullGameDemoPresentationActor(current, options), initial, current, sampleCount, deadlineAt,
          normalResumeEvidence: resume?.snapshot() ?? null,
          observation: 'Passive original account/member/SDK readiness; no station entry or extra SDK retry.',
          stationNavigationEpochAcceptanceClaimed: false };
      }
      await withinBudget(() => wait(Math.max(1, Math.min(250, deadlineAt - now()))));
    }
  } catch (error) {
    resume?.close();
    rememberProofFailure(error, { operation: 'presentation-start-readiness', deadlineAt, initial, current, sampleCount, samples,
      normalResumeEvidence: resume?.snapshot() ?? null });
    throw error;
  } finally { resume?.close(); }
}

/** Drives only the manager's disclosed ordinary retry, never replacing an identity. */
export async function completePreparedCrew(options) {
  const expectedActorCount = options.expectedActorCount ?? 21;
  assert.ok(Number.isSafeInteger(expectedActorCount) && expectedActorCount >= 1 && expectedActorCount <= 21,
    'The expected ordinary demo actor count must be within the real roster bounds.');
  const now = options.now ?? Date.now;
  const wait = options.wait ?? (() => delay(250));
  const deadline = now() + (options.timeoutMs ?? 180_000);
  const recoverable = /^Demo preparation stopped\. Reconnect and retry(?: from the crew controller)?\.$/;
  let retries = 0, current;
  while (now() < deadline) {
    current = await options.inspect();
    if (current.error && !recoverable.test(current.error)) throw new Error(current.error);
    assert.ok(Number.isSafeInteger(current.actorCount) && current.actorCount >= 0 && current.actorCount <= expectedActorCount);
    if (current.actorCount === expectedActorCount && current.live) return retries;
    if (current.live && current.retryEnabled && recoverable.test(current.error)) {
      assert.ok(retries < (options.maxRetries ?? 10), 'Ordinary crew preparation retry limit reached.');
      await options.retry();
      retries += 1;
      await options.onRetry?.({ retry: retries, actorCount: current.actorCount, error: current.error });
    }
    await wait();
  }
  throw new Error(`Ordinary crew preparation did not finish: ${JSON.stringify(current)}`);
}

/** Uses only the visible setup control; one local freshness recovery is bounded. */
export async function confirmPreparedSetup(options) {
  const now = options.now ?? Date.now;
  const wait = options.wait ?? (() => delay(100));
  const deadline = now() + (options.timeoutMs ?? 60_000);
  const offered = 'Roster confirmation rejected // review the live setup and retry.';
  let clicks = 0, authorityLostAfterClick = false, initialRequestCount, current;
  while (now() < deadline) {
    current = await options.inspect();
    for (const key of ['sessionId', 'uidHash', 'instanceId']) assert.equal(current[key], options.expected[key]);
    for (const key of ['hasAuth', 'sameActor', 'gmInstanceOwned']) assert.equal(current[key], true);
    assert.equal(current.playerRole, 'gm'); assert.equal(current.cycle, 0);
    assert.ok(['lobby', 'casting'].includes(current.phase));
    assert.ok(Number.isSafeInteger(current.setupRequestCount) && current.setupRequestCount >= 0);
    initialRequestCount ??= current.setupRequestCount;
    await options.onObserve?.(current);
    const fresh = current.connection === 'live' && current.freshness === 'server';
    if (fresh && current.confirmed) return { clicks, current };
    if (clicks > 0 && !fresh) authorityLostAfterClick = true;
    if (clicks > 0 && current.rosterStatus === offered) {
      assert.ok(clicks === 1 && authorityLostAfterClick && current.setupRequestCount === initialRequestCount,
        'Setup retry is not a recoverable local freshness rejection.');
      if (fresh && current.confirmEnabled) {
        clicks += 1; await options.click();
      }
    } else if (clicks === 0 && fresh && current.confirmEnabled) {
      clicks += 1; await options.click();
    }
    await wait();
  }
  throw new Error(`Normal setup UI did not confirm: ${JSON.stringify(current)}`);
}

export function isObservedGameEnding(current) {
  if (!['debrief', 'closed'].includes(current.phase) || current.debriefType !== 'session-debrief' ||
      current.debriefVersion !== 1 || !Number.isSafeInteger(current.debriefCycle) || current.debriefCycle < 1 ||
      current.debriefCycle !== current.cycle) return false;
  return current.debriefSource === 'final-cycle' && current.debriefResult === 'completed' && current.debriefCause === 'final-cycle' ||
    current.debriefSource === 'candidate' && current.debriefResult === 'success' && current.debriefCause === 'candidate-complete' ||
    current.debriefSource === 'failure-review' && current.debriefResult === 'failure' &&
      ['pursuit-limit', 'total-fleet-loss'].includes(current.debriefCause);
}

/** Follow only the live actor's offered ordinary advance/confirmation controls. */
export async function completeOfferedTurnAdvance(options) {
  const now = options.now ?? Date.now;
  const wait = options.wait ?? (() => delay(100));
  const deadline = now() + (options.timeoutMs ?? 60_000);
  let advanceClicked = false, confirmationClicked = false, current;
  while (now() < deadline) {
    current = await options.inspect();
    for (const key of ['sessionId', 'uidHash', 'instanceId']) assert.equal(current[key], options.expected[key]);
    assert.equal(current.sameActor, true); assert.equal(current.playerRole, 'gm');
    assert.equal(current.gmInstanceOwned, true);
    const fresh = current.connection === 'live' && current.freshness === 'server';
    const committed = current.cycle === options.expected.cycle + 1 ||
      current.phase === 'debrief' && current.cycle === options.expected.cycle;
    if (advanceClicked && fresh && committed)
      return { advanceClicked, confirmationClicked, current };
    assert.equal(current.cycle, options.expected.cycle);
    assert.equal(current.phase, 'active');
    if (fresh && !advanceClicked) {
      advanceClicked = true; await options.clickAdvance();
    } else if (fresh && advanceClicked && !confirmationClicked && current.confirmationOffered) {
      confirmationClicked = true; await options.clickConfirmation();
    }
    await wait();
  }
  throw new Error(`Offered normal turn advance did not commit: ${JSON.stringify(current)}`);
}

const FULL_GAME_PRESENTATION_BUDGET_MS = 60_000;
const PRESENTATION_ACTOR_FIELDS = [
  'sessionId', 'uidHash', 'playerRole', 'profileRoleId', 'assignedRoleId',
  'activeConsoleRoleId', 'instanceId', 'gmInstanceOwned',
];

function assertPresentationActor(current, expected, name) {
  assert.ok(current && typeof current === 'object', `${name}: the current authenticated actor snapshot is required.`);
  for (const field of PRESENTATION_ACTOR_FIELDS)
    assert.ok(Object.hasOwn(expected, field), `${name}: the original ${field} must be captured before start.`);
  assert.equal(current.hasAuth, true, `${name}: the original account must remain authenticated.`);
  assert.equal(current.uidHash, expected.uidHash, `${name}: the original uidHash must remain unchanged.`);
  assert.equal(current.profileRoleId ?? null, expected.profileRoleId ?? null,
    `${name}: the original browser persona must remain selected.`);
  if (current.sessionId != null) assert.equal(current.sessionId, expected.sessionId,
    `${name}: a different session must never replace the original session.`);

  const serverCurrent = current.sameActor === true && current.connection === 'live' && current.freshness === 'server';
  if (!serverCurrent) return false;

  for (const field of PRESENTATION_ACTOR_FIELDS)
    assert.equal(current[field] ?? null, expected[field] ?? null, `${name}: original ${field} must remain unchanged.`);
  assert.equal(current.sameActor, true, `${name}: the SDK account must remain the current session actor.`);
  return true;
}

/**
 * Waits for the real Cycle 1 transmission and any real held briefing to leave
 * both original browser surfaces. The helper has no mutation/clearance path.
 */
export async function waitForFullGamePresentationReady(options) {
  const { actors, expectedAnnouncement } = options ?? {};
  assert.ok(Array.isArray(actors) && actors.length === 2,
    'Readiness must cover the original GM and one original crew browser.');
  assert.ok(expectedAnnouncement && Number.isSafeInteger(expectedAnnouncement.turn) && expectedAnnouncement.turn >= 1);
  assert.ok(Number.isSafeInteger(expectedAnnouncement.revision) && expectedAnnouncement.revision >= 0);
  assert.equal(actors.filter(actor => actor?.expected?.playerRole === 'gm').length, 1);
  assert.equal(actors.filter(actor => actor?.expected?.playerRole === 'player').length, 1);
  assert.equal(new Set(actors.map(actor => actor?.expected?.uidHash)).size, 2,
    'The original GM and crew must remain separate authenticated accounts.');
  for (const actor of actors) {
    assert.ok(typeof actor?.name === 'string' && actor.name.length > 0);
    assert.ok(typeof actor?.inspect === 'function');
    assert.ok(typeof actor?.paintTwoFrames === 'function', 'Each real page must provide two browser paint frames.');
  }

  const now = options.now ?? Date.now;
  const wait = options.wait ?? (() => delay(100));
  const startedAt = now();
  const deadline = startedAt + FULL_GAME_PRESENTATION_BUDGET_MS;
  const announcementSeen = new Set();
  const transmissionSeen = new Set();
  let current = [];

  async function inspectAll() {
    const snapshots = await Promise.all(actors.map(async actor => {
      const snapshot = await actor.inspect();
      const serverCurrent = assertPresentationActor(snapshot, actor.expected, actor.name);
      if (!serverCurrent) return { snapshot, serverCurrent };
      // The same healthy member may still show its prior server snapshot while
      // the real start propagates. It cannot earn presentation credit until the
      // exact Cycle 1 source marker, actual mount/detach and paint are observed.
      if (expectedAnnouncement.turn === 1 && snapshot.cycle === 0) {
        assert.ok(['lobby', 'casting'].includes(snapshot.phase),
          `${actor.name}: only the ordinary before-start phase may remain pending.`);
        assert.deepEqual(snapshot.fullGameDemo, { status: 'preparing', progression: 'manual' });
        assert.equal(snapshot.announcementTurn, null, `${actor.name}: a different source marker cannot be a pending start.`);
        assert.equal(snapshot.announcementRevision, null);
        return { snapshot, serverCurrent: false };
      }
      assert.equal(snapshot.cycle, expectedAnnouncement.turn,
        `${actor.name}: the original current-cycle presentation must be inspected.`);
      assert.ok(snapshot.announcementTurn === null || Number.isSafeInteger(snapshot.announcementTurn),
        `${actor.name}: the server transmission turn must be explicit.`);
      assert.ok(snapshot.announcementRevision === null || Number.isSafeInteger(snapshot.announcementRevision),
        `${actor.name}: the server transmission revision must be explicit.`);
      for (const field of ['naturalTransmissionMounted', 'ordinaryBriefingMounted', 'ordinaryBriefingHeld'])
        assert.equal(typeof snapshot[field], 'boolean', `${actor.name}: ${field} must be observed from the actual page/server state.`);
      if (snapshot.announcementTurn !== null && snapshot.announcementTurn !== undefined) {
        assert.equal(snapshot.announcementTurn, expectedAnnouncement.turn,
          `${actor.name}: a different server transmission appeared during readiness.`);
        assert.equal(snapshot.announcementRevision, expectedAnnouncement.revision,
          `${actor.name}: the original server transmission revision must remain unchanged.`);
        announcementSeen.add(actor);
      } else {
        assert.equal(announcementSeen.has(actor), false,
          `${actor.name}: the server transmission marker disappeared before readiness.`);
      }
      if (snapshot.naturalTransmissionMounted === true) transmissionSeen.add(actor);
      return { snapshot, serverCurrent };
    }));
    return snapshots;
  }

  const stillPresented = snapshot => snapshot.naturalTransmissionMounted === true ||
    snapshot.ordinaryBriefingMounted === true || snapshot.ordinaryBriefingHeld === true;

  while (now() < deadline) {
    current = await inspectAll();
    if (now() >= deadline) break;
    if (!current.every(item => item.serverCurrent)) {
      await wait();
      continue;
    }
    const markerReady = actors.every(actor => announcementSeen.has(actor));
    if (!markerReady || current.some(item => stillPresented(item.snapshot)) ||
        !actors.every(actor => transmissionSeen.has(actor))) {
      await wait();
      continue;
    }

    await Promise.all(actors.map(actor => actor.paintTwoFrames()));
    if (now() >= deadline) break;
    current = await inspectAll();
    if (now() >= deadline) break;
    if (current.every(item => item.serverCurrent && !stillPresented(item.snapshot)) &&
        actors.every(actor => announcementSeen.has(actor) && transmissionSeen.has(actor))) {
      return { status: 'ready', actorCount: actors.length, originalActorsConfirmed: true,
        naturalTransmissionObservedAndDetached: true, heldBriefingDetached: true,
        paintFramesPerActor: 2, elapsedMs: now() - startedAt };
    }
    await wait();
  }

  throw new Error(`The original GM and crew presentation did not detach within the fixed 60-second readiness budget: ${JSON.stringify(current.map(({ snapshot }) => ({
    cycle: snapshot.cycle, announcementTurn: snapshot.announcementTurn,
    naturalTransmissionMounted: snapshot.naturalTransmissionMounted,
    ordinaryBriefingMounted: snapshot.ordinaryBriefingMounted,
    ordinaryBriefingHeld: snapshot.ordinaryBriefingHeld,
  })))}`);
}
