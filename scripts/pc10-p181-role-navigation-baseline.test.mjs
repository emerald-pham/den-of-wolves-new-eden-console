import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { readFile } from 'node:fs/promises';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
import { createMemberNavigationResumeObserver } from './pc10-member-navigation-resume.mjs';
import { pc11MemberReadiness } from './qualification/pc11-normal-start-adapter.mjs';

const sourcePath = new URL('./pc10-starlight-movement-scout-ui-proof.mjs', import.meta.url);
const source = await readFile(sourcePath, 'utf8');
const nativeStart = source.indexOf('export async function runP181StarlightMovementScoutNative(');
assert.ok(nativeStart >= 0, 'Bind the actual native P181 consumer.');
const waitStart = source.indexOf('  const waitForFullActor = async (surface, description, predicate, deadlineAt) => {', nativeStart);
const waitEnd = source.indexOf('\n  const readGmRecoveryPending', waitStart);
assert.ok(waitStart > nativeStart && waitEnd > waitStart, 'Extract the actual finite actor-readiness consumer.');
const actualWaitForFullActor = source.slice(waitStart, waitEnd);
const assignmentStart = source.indexOf("        const assignment = await captureAction(gm, 'assignRole'", nativeStart);
const clickEndMarker = "          await bounded('Choose original station berth', () => roleLink.click({ timeout: p181Remaining(navigationUiEnd) }), navigationUiEnd);";
const clickEnd = source.indexOf(clickEndMarker, assignmentStart) + clickEndMarker.length;
assert.ok(assignmentStart > nativeStart && clickEnd > assignmentStart,
  'Extract the actual assignment-wait, navigation-baseline, and role-link consumer.');
const actualAssignmentToClick = source.slice(assignmentStart, clickEnd);

const roleId = 'wing-commander';
const expected = { sessionId: 'source-only-normal-session', uidHash: '1234567890abcdef', roleId, stage: 'casting' };
const assignedButResumePending = {
  hasAuth: true, sameActor: true, uidHash: expected.uidHash, sessionId: expected.sessionId,
  meSessionId: expected.sessionId, profileRoleId: null, profileSessionId: null,
  playerRole: 'player', connected: true, currentOwnPlayerConfirmed: true, kicked: false,
  escapeLocked: false, replacementRoleId: null, replacementStatus: null, fullGameDemo: null,
  invalidFields: [],
  connectionGeneration: 1, identityHydrationRevision: 1, connection: 'offline', freshness: 'cache',
  sdkHasServerAuthority: true, sdkResumePending: true,
  cycle: 0, phase: 'casting', setupConfirmed: true, assignedRoleId: roleId,
  activeConsoleRoleId: null, seatId: null, currentCanonicalSeatOwned: false,
};
const acceptedNormalResume = { ...assignedButResumePending,
  connectionGeneration: 2, identityHydrationRevision: 2, connection: 'live', freshness: 'server',
  sdkResumePending: false,
};
const readyButResumePending = { ...acceptedNormalResume, sdkResumePending: true };
const foreignReadyActor = { ...acceptedNormalResume, uidHash: 'fedcba0987654321',
  sessionId: 'foreign-source-only-session', meSessionId: 'foreign-source-only-session' };
const dirtyFreshRead = { ...acceptedNormalResume, connectionGeneration: 3,
  connection: 'connecting', freshness: 'cache', sdkResumePending: true };
const expectedCasting = { sessionId: expected.sessionId, uidHash: expected.uidHash, roleId, stage: 'casting' };
const publicTuple = value => ({ connectionGeneration: value.connectionGeneration,
  identityHydrationRevision: value.identityHydrationRevision, connection: value.connection,
  freshness: value.freshness, sdkHasServerAuthority: value.sdkHasServerAuthority,
  sdkResumePending: value.sdkResumePending, uidHash: value.uidHash, sessionId: value.sessionId });

async function actualAssignmentCase({ initial = assignedButResumePending, afterDelay = acceptedNormalResume,
  reads = null } = {}) {
  const directory = await mkdtemp(join(tmpdir(), 'p181-role-navigation-baseline-'));
  const events = new EventEmitter();
  const state = { current: initial, reads: 0, delays: 0, clickStates: [] };
  const roleLink = { first() { return this; }, waitFor: async () => {},
    click: async () => { state.clickStates.push(structuredClone(state.current)); } };
  const page = { on: (...args) => events.on(...args), off: (...args) => events.off(...args),
    url: () => 'http://127.0.0.1:5178/#/console', locator: () => roleLink };
  const readFullActor = async () => {
    const value = reads ? reads[Math.min(state.reads, reads.length - 1)] : state.current;
    state.reads++;
    state.current = value;
    return structuredClone(value);
  };
  const bounded = async (_label, operation) => operation();
  const delay = async () => {
    state.delays++;
    state.current = afterDelay;
  };
  const context = { assert, Date, Math, Promise, P181_NATIVE_TIMING: { operationTimeoutMs: 5_000 },
    P181_NORMAL_SETUP: { wingCommanderRoleId: roleId },
    deadlineAt: Date.now() + 5_000, directory, trace: [], sessionId: expected.sessionId,
    admittedAuth: { uidHash: expected.uidHash }, displayName: 'Source-only assigned member',
    wingCommander: { page }, gm: {}, readFullActor, bounded, delay, pc11MemberReadiness,
    captureAction: async () => ({ httpStatus: 200 }),
    p181Remaining: end => Math.max(1, end - Date.now()),
    createMemberNavigationResumeObserver: (targetPage, options) =>
      createMemberNavigationResumeObserver(targetPage, options) };
  context.casting = { getByLabel: () => ({ selectOption: async () => {} }) };
  const execute = runInNewContext(`(async () => {
    ${actualWaitForFullActor}
    ${actualAssignmentToClick}
    } finally { await navigation.finish(new Error('Source-only baseline fixture complete.')); }
    return { navigationStart, trace };
  })()`, context);
  try {
    const result = await execute;
    return { result, state };
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

function assertAcceptedCastingBaseline(result, state) {
  assert.deepEqual(publicTuple(result.navigationStart), publicTuple(acceptedNormalResume),
    'The role-navigation baseline must be the accepted same-actor/session casting tuple.');
  assert.equal(pc11MemberReadiness(result.navigationStart, expectedCasting), true,
    'Require the real complete assigned-member casting readiness contract.');
  assert.equal(result.navigationStart.sdkResumePending, false,
    'Require the mounted SDK resume fence to be complete.');
  assert.equal(state.clickStates.length, 1);
  assert.deepEqual(publicTuple(state.clickStates[0]), publicTuple(acceptedNormalResume),
    'Do not enter the assigned route from a dirty, foreign, or pending-resume tuple.');
}

async function navigationAcceptanceCase({ emitRequest = true, requestSession = expected.sessionId,
  replyUid = 'private-source-only-actor', hydrationDelta = 1,
  clientAcceptance = { hasServerAuthority: true, resumePending: false } } = {}) {
  const directory = await mkdtemp(join(tmpdir(), 'p181-role-navigation-authority-'));
  const events = new EventEmitter();
  const uid = 'private-source-only-actor';
  const uidHash = createHash('sha256').update(uid).digest('hex').slice(0, 16);
  const original = { documentTimeOrigin: 1000, hasAuth: true, sameActor: true, uidHash,
    profileRoleId: null, profileSessionId: null, sessionId: expected.sessionId,
    meSessionId: expected.sessionId, playerRole: 'player', assignedRoleId: roleId,
    activeConsoleRoleId: null, seatId: null, fleetGroupId: 'fleet-1',
    replacementRoleId: null, replacementStatus: null, escapeLocked: false, kicked: false,
    connected: true, currentOwnPlayerConfirmed: true, currentCanonicalSeatOwned: false,
    memberScopeMatches: true, connectionGeneration: 1, identityHydrationRevision: 1,
    connection: 'live', freshness: 'server', sdkHasServerAuthority: true,
    sdkResumePending: false, invalidFields: [], phase: 'casting', cycle: 0, setupConfirmed: true };
  const current = { ...original, activeConsoleRoleId: roleId, seatId: roleId,
    currentCanonicalSeatOwned: true, currentOwnBerthConfirmed: true,
    currentMemberBerthPresent: true, currentMemberBerthMatches: true,
    connectionGeneration: 2, identityHydrationRevision: 1 + hydrationDelta,
    connection: 'live', freshness: 'server', sdkHasServerAuthority: true, sdkResumePending: false };
  const page = { on: (...args) => events.on(...args), off: (...args) => events.off(...args),
    url: () => 'http://127.0.0.1:5178/#/ships/aegis/roles/wing-commander' };
  const observer = createMemberNavigationResumeObserver(page, {
    directory, roleId, deadlineAt: Date.now() + 5_000, memberContract: 'pc11-live-base' });
  const request = { method: () => 'POST',
    url: () => 'http://127.0.0.1:5011/demo-local/us-central1/resumeSession',
    postDataJSON: () => ({ data: { sessionId: requestSession } }) };
  const response = { request: () => request, url: request.url, status: () => 200,
    json: async () => ({ result: { session: { id: expected.sessionId }, player: {
      uid: replyUid, sessionId: expected.sessionId, role: 'player', fleetGroupId: 'fleet-1',
      assignedRoleId: roleId, activeConsoleRoleId: roleId, seatId: roleId,
      replacementRoleId: null, replacementStatus: null, connectionGeneration: 2,
    } } }) };
  let result, error, finished = false;
  try {
    await observer.prepare(original);
    if (emitRequest) events.emit('request', request);
    events.emit('response', response);
    try { result = await observer.accept(original, current,
      async () => ({ ...current, clientAcceptance })); }
    catch (caught) { error = caught; }
    await observer.finish(error);
    finished = true;
    const packet = JSON.parse(await readFile(observer.path, 'utf8'));
    return { result, error, packet };
  } finally {
    if (!finished) await observer.finish(error);
    await rm(directory, { recursive: true, force: true });
  }
}

test('actual native Wing assignment baseline waits for accepted same-actor normal resume before role navigation', async () => {
  const { result, state } = await actualAssignmentCase();
  assertAcceptedCastingBaseline(result, state);
});

test('actual assignment readiness waits when otherwise complete casting still has SDK resume pending', async () => {
  const { result, state } = await actualAssignmentCase({ initial: readyButResumePending });
  assertAcceptedCastingBaseline(result, state);
});

test('actual assignment readiness waits for the original admitted actor and session', async () => {
  const { result, state } = await actualAssignmentCase({ initial: foreignReadyActor });
  assertAcceptedCastingBaseline(result, state);
});

test('actual assignment baseline uses the accepted wait tuple without a second fresh read', async () => {
  const { result, state } = await actualAssignmentCase({
    initial: acceptedNormalResume, reads: [acceptedNormalResume, dirtyFreshRead],
  });
  assertAcceptedCastingBaseline(result, state);
  assert.equal(state.reads, 1,
    'Use the exact tuple accepted by the readiness wait; a later fresh read may already be dirty again.');
});

test('navigation epoch acceptance still requires the captured same-actor receipt and settled resume authority', async () => {
  const responseOnly = await navigationAcceptanceCase({ emitRequest: false });
  assert.match(responseOnly.error?.message ?? '', /matching normal resume receipt and accepted hydration/,
    'An HTTP200 response without its captured request is not a resume receipt.');
  assert.equal(responseOnly.packet.transitions.length, 0);

  const foreignSession = await navigationAcceptanceCase({ requestSession: 'foreign-source-only-session' });
  assert.match(foreignSession.error?.message ?? '', /matching normal resume receipt and accepted hydration/);
  assert.equal(foreignSession.packet.transitions.length, 0);

  const foreignActor = await navigationAcceptanceCase({ replyUid: 'foreign-source-only-actor' });
  assert.match(foreignActor.error?.message ?? '', /matching normal resume receipt and accepted hydration/);
  assert.equal(foreignActor.packet.transitions.length, 0);

  const pendingHydration = await navigationAcceptanceCase({ hydrationDelta: 0 });
  assert.equal(pendingHydration.result, false, 'A new connection generation without accepted document hydration remains pending.');
  assert.equal(pendingHydration.packet.transitions.length, 0);

  const pendingSdkFence = await navigationAcceptanceCase({
    clientAcceptance: { hasServerAuthority: true, resumePending: true },
  });
  assert.equal(pendingSdkFence.result, false, 'Server authority does not release an unfinished mounted SDK resume fence.');
  assert.equal(pendingSdkFence.packet.transitions.length, 0);

  const unacceptedSdkAuthority = await navigationAcceptanceCase({
    clientAcceptance: { hasServerAuthority: false, resumePending: false },
  });
  assert.equal(unacceptedSdkAuthority.result, false, 'A cleared pending flag without accepted SDK authority remains blocked.');
  assert.equal(unacceptedSdkAuthority.packet.transitions.length, 0);

  const accepted = await navigationAcceptanceCase();
  assert.equal(accepted.error, undefined);
  assert.equal(accepted.result?.connectionGeneration, 2);
  assert.equal(accepted.result?.identityHydrationRevision, 2);
  assert.equal(accepted.packet.transitions.length, 1,
    'A genuine same-actor request and parsed reply may pass only after clean hydrated mounted authority.');
});
