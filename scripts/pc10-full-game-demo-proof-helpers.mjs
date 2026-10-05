import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';

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
