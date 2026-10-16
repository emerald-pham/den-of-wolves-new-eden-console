import { observeUiReceipt } from './pc10-browser-ui-receipt.mjs';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

const MUTATION_STATUS = new Set(['committed', 'replayed']);
const LIVE = state => state?.connection === 'live' && state?.freshness === 'server';
const digest = value => createHash('sha256').update(String(value)).digest('hex');

function assertIdentityShape(actual, expected) {
  assert.ok(actual && typeof actual === 'object', 'A current server-backed actor snapshot is required.');
  assert.equal(actual.sessionId, expected.sessionId, 'The authenticated actor must remain in the same session.');
  if (expected.uidHash !== undefined) assert.equal(actual.uidHash, expected.uidHash, 'The original Auth account must remain selected.');
  assert.equal(actual.sameActor, true, 'The current device must still own the same Auth actor.');
  assert.equal(actual.cycle, expected.cycle, 'The action must remain in the same cycle.');
  assert.equal(actual.phase, expected.phase, 'The action must remain in the same game phase.');
  if (expected.turnStatePhase !== undefined) {
    assert.equal(actual.turnStatePhase, expected.turnStatePhase, 'The action must remain in the same turn stage.');
  }
  assert.equal(LIVE(actual), true, 'The action requires a fresh live server snapshot.');
}

/** Start-stage fence used only by the opt-in fresh-manual-game callbacks. */
export function assertFreshManualStart({ gm, started, initial }) {
  assert.ok(typeof initial?.sessionId === 'string' && initial.sessionId.length > 0,
    'The callback requires the runner’s actual newly-created session.');
  for (const state of [gm, started]) {
    assertIdentityShape(state, { sessionId: initial.sessionId, cycle: 1, phase: 'active', turnStatePhase: 'team' });
    assert.equal(state.playerRole, 'gm', 'The cycle callback requires the original GM account.');
    assert.equal(state.fullGameDemo?.status, 'active', 'Only a source-started manual full-game demo may run this callback.');
    assert.equal(state.fullGameDemo?.progression, 'manual', 'Automatic progression cannot be used for callback scenarios.');
    assert.equal(state.gmInstanceOwned, true, 'The original GM must still own the live instance.');
    assert.ok(typeof state.instanceId === 'string' && state.instanceId.length > 0);
  }
  assert.equal(gm.uidHash, started.uidHash, 'The actual start and callback must use the same GM account.');
  assert.equal(gm.instanceId, started.instanceId, 'The actual start and callback must use the same owned GM instance.');
  return Object.freeze({ sessionId: initial.sessionId, cycle: 1, phase: 'active', turnStatePhase: 'team',
    uidHash: gm.uidHash, instanceId: gm.instanceId });
}

/** Player action fence: profile, actual station, session, cycle and server freshness all remain bound. */
export function assertPlayerActorFence(actual, expected) {
  assertIdentityShape(actual, expected);
  assert.equal(actual.playerRole, 'player', 'A player action cannot run as a GM or controller.');
  assert.equal(actual.profileRoleId, expected.roleId, 'The original roster role must still own this Auth account.');
  if (expected.stationRequired !== false) {
    assert.equal(actual.activeConsoleRoleId, expected.roleId, 'The offered action must be on the actor’s actual current station.');
  }
  if (expected.assignedRoleId !== undefined) assert.equal(actual.assignedRoleId, expected.assignedRoleId);
  if (expected.fleetGroupIdHash !== undefined) assert.equal(actual.fleetGroupIdHash, expected.fleetGroupIdHash,
    'Current-group actions must remain bound to the original group.');
}

/** GM-only procedures require the same live, owned facilitator instance before and after reload. */
export function assertGmInstanceFence(actual, expected) {
  assertIdentityShape(actual, expected);
  assert.equal(actual.playerRole, 'gm', 'This operation is GM-only.');
  assert.equal(actual.gmInstanceOwned, true, 'The current authenticated GM must own the live instance.');
  assert.equal(actual.instanceId, expected.instanceId, 'The owned GM instance must not change.');
  if (expected.uidHash !== undefined) assert.equal(actual.uidHash, expected.uidHash);
}

function withoutReplayLabel(value) {
  if (Array.isArray(value)) return value.map(withoutReplayLabel);
  if (!value || typeof value !== 'object') return value;
  const result = Object.fromEntries(Object.entries(value).map(([key, child]) => [key, withoutReplayLabel(child)]));
  if (MUTATION_STATUS.has(result.status)) delete result.status;
  return result;
}

/** Compare the original UI result with exact SDK replay without treating committed/replayed labels as payload. */
export function assertEquivalentExactReplay(original, replay, { statusPairs = [] } = {}) {
  assert.ok(original && typeof original === 'object', 'The ordinary UI request needs a result.');
  assert.ok(replay && typeof replay === 'object', 'The exact SDK retry needs a result.');
  const originalHasStatus = Object.hasOwn(original, 'status');
  const replayHasStatus = Object.hasOwn(replay, 'status');
  assert.equal(originalHasStatus, replayHasStatus, 'The retry must preserve the source endpoint’s response shape.');
  let normalizeStatus = false;
  if (originalHasStatus && MUTATION_STATUS.has(original.status) && MUTATION_STATUS.has(replay.status)) {
    normalizeStatus = true;
  } else if (originalHasStatus) {
    const paired = statusPairs.some(pair => Array.isArray(pair) && pair.length === 2 &&
      pair[0] === original.status && pair[1] === replay.status);
    assert.ok(paired || original.status === replay.status,
      'A source status may change on exact retry only through an explicitly declared source status pair.');
    normalizeStatus = paired;
  }
  const normalizedOriginal = { ...withoutReplayLabel(original) };
  const normalizedReplay = { ...withoutReplayLabel(replay) };
  if (normalizeStatus) {
    delete normalizedOriginal.status;
    delete normalizedReplay.status;
  }
  assert.deepEqual(normalizedReplay, normalizedOriginal,
    'The exact retry must recover the original committed domain result.');
}

/** Source-blocked branches do not receive acceptance credit; required ones fail the callback. */
export function blockedSourceBranch(family, branch, blockerCodes, { required = false } = {}) {
  assert.ok(typeof family === 'string' && family.length > 0);
  assert.ok(typeof branch === 'string' && branch.length > 0);
  assert.ok(Array.isArray(blockerCodes) && blockerCodes.length > 0 && blockerCodes.every(code => typeof code === 'string' && code.length > 0),
    'An unavailable optional branch needs its precise source prerequisite codes.');
  if (required) throw new Error(`${family}/${branch} is required but its source prerequisite is unmet: ${blockerCodes.join(', ')}`);
  return Object.freeze({ family, branch, status: 'blocked', accepted: false,
    blockerCodes: [...new Set(blockerCodes)] });
}

/** The source-audited simulated attendance route is never presented as physical evidence. */
export function assertSimulatedAttendanceRoster({ demo, currentPlayerUids, targetUid, presentPlayerUids,
  attendanceEvidence, physicalAttendance = false }) {
  assert.equal(demo?.status, 'active', 'Virtual attendance is only available in an active full-game demo.');
  assert.equal(demo?.progression, 'manual', 'Virtual attendance requires the source manual progression mode.');
  assert.equal(attendanceEvidence, 'simulated-demo', 'The source API requires its explicit simulated-demo label.');
  assert.equal(physicalAttendance, false, 'A software simulation cannot attest physical attendance.');
  assert.ok(Array.isArray(currentPlayerUids) && currentPlayerUids.length > 0);
  assert.ok(currentPlayerUids.every(uid => typeof uid === 'string' && uid.length > 0));
  assert.equal(new Set(currentPlayerUids).size, currentPlayerUids.length, 'The current connected cohort must be unique.');
  assert.ok(typeof targetUid === 'string' && currentPlayerUids.includes(targetUid), 'The target must be a current player account.');
  assert.ok(Array.isArray(presentPlayerUids) && presentPlayerUids.every(uid => typeof uid === 'string' && uid.length > 0));
  assert.equal(new Set(presentPlayerUids).size, presentPlayerUids.length, 'Simulated participants must be distinct current actors.');
  assert.equal(presentPlayerUids.includes(targetUid), false, 'The target cannot be counted in their own posse.');
  assert.ok(presentPlayerUids.every(uid => currentPlayerUids.includes(uid)), 'Every simulated participant must be from the current connected cohort.');
}

/** Return an allowlisted, private-safe receipt summary. Raw request/result objects never leave memory. */
export function privateSafeActionReceipt({ family, branch, endpoint, actor, sessionId, cycle, phase,
  request, result, replay, statusPairs = [], reloadedSameActor = true, simulatedAttendance = false }) {
  assertEquivalentExactReplay(result, replay, { statusPairs });
  assert.ok(request && typeof request === 'object');
  assert.equal(typeof request.requestId, 'string', 'The observed UI request needs its actual idempotency key.');
  assert.ok(actor && typeof actor.uidHash === 'string' && typeof actor.roleId === 'string');
  return Object.freeze({ family, branch, status: 'committed', accepted: true, endpoint,
    actorRoleId: actor.roleId, actorUidHash: actor.uidHash, sessionIdHash: digest(sessionId),
    cycle, phase, requestIdSha256: digest(request.requestId),
    requestSha256: digest(JSON.stringify(request)), exactSdkRetry: true,
    sameActorAfterReload: reloadedSameActor, simulatedAttendance,
    physicalAttendanceProof: false });
}

/** Capture only an actual browser UI request, then replay that exact payload through its authenticated SDK. */
export async function captureMountedUiAction({ surface, endpoint, expectedActor, executeUi, statusPairs = [] }) {
  assert.ok(surface?.page && typeof surface.observe === 'function' && typeof surface.callable === 'function');
  assert.equal(typeof endpoint, 'string');
  assert.equal(typeof executeUi, 'function');
  const before = await surface.observe();
  if (expectedActor.actorKind === 'gm') assertGmInstanceFence(before, expectedActor);
  else assertPlayerActorFence(before, expectedActor);
  const response = await observeUiReceipt({ page: surface.page, consumed: { endpoint, before, expectedActor },
    waitForResponse: () => surface.page.waitForResponse(response => {
      const url = new URL(response.url());
      return url.pathname.endsWith(`/us-central1/${endpoint}`) && response.request().method() === 'POST';
    }),
    choose: executeUi,
  });
  assert.equal(response.ok(), true, `The source-mounted ${endpoint} control must commit through the real browser SDK.`);
  const envelope = await response.json();
  const request = response.request().postDataJSON()?.data;
  assert.ok(request && typeof request === 'object' && !Array.isArray(request), 'Capture the actual callable body from the mounted UI request.');
  assert.equal(request.sessionId, expectedActor.sessionId, 'The mounted UI request must target the current session.');
  assert.ok(typeof request.requestId === 'string' && request.requestId.length > 0, 'The source service must supply its actual idempotency key.');
  if (expectedActor.instanceId !== undefined) assert.equal(request.instanceId, expectedActor.instanceId,
    'GM mutations must carry the currently owned instance.');
  const result = envelope?.result;
  assert.ok(result && typeof result === 'object', 'The normal UI action must return its committed result.');
  if (Object.hasOwn(result, 'status')) {
    const sourceStatus = statusPairs.some(pair => Array.isArray(pair) && pair.length === 2 && pair[0] === result.status);
    assert.equal(MUTATION_STATUS.has(result.status) || sourceStatus, true,
      'The normal UI result must be committed/replayed or use its explicitly declared source result status.');
  }

  const afterUi = await surface.observe();
  if (expectedActor.actorKind === 'gm') assertGmInstanceFence(afterUi, expectedActor);
  else assertPlayerActorFence(afterUi, expectedActor);
  const replay = await surface.callable(endpoint, request);
  assert.equal(replay.status, 'committed', 'Retry only the exact captured payload through the current Auth SDK identity.');
  assertEquivalentExactReplay(result, replay.result, { statusPairs });

  await surface.page.reload();
  await surface.until(`Original ${expectedActor.actorKind === 'gm' ? 'GM instance' : 'player actor'} restored after reload`, state =>
    state.sameActor === true && state.sessionId === expectedActor.sessionId && state.uidHash === expectedActor.uidHash &&
    state.connection === 'live' && state.freshness === 'server' && state.cycle === expectedActor.cycle &&
    state.phase === expectedActor.phase && (expectedActor.roleId === undefined || state.profileRoleId === expectedActor.roleId) &&
    (expectedActor.instanceId === undefined || state.instanceId === expectedActor.instanceId && state.gmInstanceOwned === true));
  const reloaded = await surface.observe();
  if (expectedActor.actorKind === 'gm') assertGmInstanceFence(reloaded, expectedActor);
  else assertPlayerActorFence(reloaded, expectedActor);
  const replayAfterReload = await surface.callable(endpoint, request);
  assert.equal(replayAfterReload.status, 'committed');
  assertEquivalentExactReplay(result, replayAfterReload.result, { statusPairs });
  return { request, result, replay: replayAfterReload.result };
}

/** Select a real prepared actor through the visible demo picker and enter its ordinary mounted station. */
export async function enterPreparedRoleStation({ crew, initial, roster, roleId }) {
  const actor = roster.find(entry => entry.roleId === roleId);
  assert.ok(actor, `The actual prepared roster does not contain ${roleId}.`);
  assert.ok(typeof actor.uidHash === 'string');
  await crew.page.getByLabel('Current actor', { exact: true }).selectOption(roleId);
  await crew.page.waitForURL(url => url.searchParams.get('demoActor') === `${initial.sessionId}~${roleId}`);
  await crew.until(`Current original ${roleId} Auth account`, state => state.sameActor === true &&
    state.sessionId === initial.sessionId && state.uidHash === actor.uidHash && state.profileRoleId === roleId &&
    state.connection === 'live' && state.freshness === 'server');
  await crew.page.getByRole('link', { name: "Enter this actor's stations", exact: true }).click();
  if (roleId === 'press-officer') {
    await crew.page.getByRole('link', { name: 'Press Officer', exact: true }).click();
  } else {
    const brief = crew.page.getByRole('link', { name: 'Open private brief', exact: true });
    await brief.waitFor();
    await brief.click();
    const privateBrief = await crew.until(`Private brief belongs to original ${roleId} actor`, state =>
      state.briefMatchesActor && state.briefRoleId === roleId);
    assert.equal(privateBrief.uidHash, actor.uidHash);
    await crew.page.locator('.role-brief-screen').getByRole('link', { name: /^(?:←\s*)?Back to stations$/ }).click();
    await crew.page.locator(`a[href$="/roles/${roleId}"]`).click();
  }
  const current = await crew.until(`Mounted ${roleId} station`, state => state.sameActor === true &&
    state.sessionId === initial.sessionId && state.uidHash === actor.uidHash && state.profileRoleId === roleId &&
    state.activeConsoleRoleId === roleId && state.connection === 'live' && state.freshness === 'server');
  const mountedStation = roleId === 'press-officer'
    ? crew.page.getByRole('region', { name: 'Press dispatch desk', exact: true })
    : crew.page.locator('main.ship-console--gameplay');
  await mountedStation.waitFor();
  const mounted = await crew.until(`Original ${roleId} authority remains current after its station mounts`, state =>
    state.sameActor === true && state.sessionId === current.sessionId && state.uidHash === current.uidHash &&
    state.playerRole === 'player' && state.profileRoleId === roleId &&
    state.assignedRoleId === current.assignedRoleId && state.activeConsoleRoleId === roleId &&
    state.cycle === current.cycle && state.phase === current.phase &&
    state.turnStatePhase === current.turnStatePhase && state.connection === 'live' && state.freshness === 'server');
  assertPlayerActorFence(mounted, {
    sessionId: initial.sessionId,
    uidHash: actor.uidHash,
    roleId,
    assignedRoleId: current.assignedRoleId,
    cycle: current.cycle,
    phase: current.phase,
    turnStatePhase: current.turnStatePhase,
  });
  return { actor: { actorKind: 'player', sessionId: initial.sessionId, uidHash: actor.uidHash, roleId,
    assignedRoleId: mounted.assignedRoleId, cycle: mounted.cycle, phase: mounted.phase,
    turnStatePhase: mounted.turnStatePhase }, current: mounted };
}

export function sha256(value) { return digest(value); }
