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
  const now = options.now ?? Date.now;
  const wait = options.wait ?? (() => delay(250));
  const deadline = now() + (options.timeoutMs ?? 180_000);
  const recoverable = /^Demo preparation stopped\. Reconnect and retry(?: from the crew controller)?\.$/;
  let retries = 0, current;
  while (now() < deadline) {
    current = await options.inspect();
    if (current.error && !recoverable.test(current.error)) throw new Error(current.error);
    assert.ok(Number.isSafeInteger(current.actorCount) && current.actorCount >= 0 && current.actorCount <= 21);
    if (current.actorCount === 21 && current.live) return retries;
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

export function isObservedGameEnding(current) {
  if (!['debrief', 'closed'].includes(current.phase) || current.debriefType !== 'session-debrief' ||
      current.debriefVersion !== 1 || !Number.isSafeInteger(current.debriefCycle) || current.debriefCycle < 1 ||
      current.debriefCycle !== current.cycle) return false;
  return current.debriefSource === 'final-cycle' && current.debriefResult === 'completed' && current.debriefCause === 'final-cycle' ||
    current.debriefSource === 'candidate' && current.debriefResult === 'success' && current.debriefCause === 'candidate-complete' ||
    current.debriefSource === 'failure-review' && current.debriefResult === 'failure' &&
      ['pursuit-limit', 'total-fleet-loss'].includes(current.debriefCause);
}
