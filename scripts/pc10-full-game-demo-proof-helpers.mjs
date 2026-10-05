import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';

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
  for (const field of PRESENTATION_ACTOR_FIELDS) {
    assert.ok(Object.hasOwn(expected, field), `${name}: the original ${field} must be captured before start.`);
    assert.equal(current[field] ?? null, expected[field] ?? null, `${name}: original ${field} must remain unchanged.`);
  }
  assert.equal(current.hasAuth, true, `${name}: the original account must remain authenticated.`);
  assert.equal(current.sameActor, true, `${name}: the SDK account must remain the current session actor.`);
  assert.equal(current.connection, 'live', `${name}: a live actor projection is required.`);
  assert.equal(current.freshness, 'server', `${name}: a server-fresh actor projection is required.`);
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
      assertPresentationActor(snapshot, actor.expected, actor.name);
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
      return snapshot;
    }));
    return snapshots;
  }

  const stillPresented = snapshot => snapshot.naturalTransmissionMounted === true ||
    snapshot.ordinaryBriefingMounted === true || snapshot.ordinaryBriefingHeld === true;

  while (now() < deadline) {
    current = await inspectAll();
    if (now() >= deadline) break;
    const markerReady = actors.every(actor => announcementSeen.has(actor));
    if (!markerReady || current.some(stillPresented) ||
        !actors.every(actor => transmissionSeen.has(actor))) {
      await wait();
      continue;
    }

    await Promise.all(actors.map(actor => actor.paintTwoFrames()));
    if (now() >= deadline) break;
    current = await inspectAll();
    if (now() >= deadline) break;
    if (current.every(snapshot => !stillPresented(snapshot)) &&
        actors.every(actor => announcementSeen.has(actor) && transmissionSeen.has(actor))) {
      return { status: 'ready', actorCount: actors.length, originalActorsConfirmed: true,
        naturalTransmissionObservedAndDetached: true, heldBriefingDetached: true,
        paintFramesPerActor: 2, elapsedMs: now() - startedAt };
    }
    await wait();
  }

  throw new Error(`The original GM and crew presentation did not detach within the fixed 60-second readiness budget: ${JSON.stringify(current.map(snapshot => ({
    cycle: snapshot.cycle, announcementTurn: snapshot.announcementTurn,
    naturalTransmissionMounted: snapshot.naturalTransmissionMounted,
    ordinaryBriefingMounted: snapshot.ordinaryBriefingMounted,
    ordinaryBriefingHeld: snapshot.ordinaryBriefingHeld,
  })))}`);
}
