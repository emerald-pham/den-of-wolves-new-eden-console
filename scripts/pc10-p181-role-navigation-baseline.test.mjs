import assert from 'node:assert/strict';
import { createHash, webcrypto } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { readFile, readdir } from 'node:fs/promises';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
import typescript from 'typescript';
import { retainP181MemberAuthority, retainP181CallerRejection, p181PreparationTuple } from './pc10-starlight-movement-scout-ui-proof.mjs';
import { observeFullGameDemoPresentationMember } from './pc10-full-game-demo-proof-helpers.mjs';
import { observeLifecycleActor, captureLifecycleUiAction } from './pc10-member-gm-lifecycle-ui-proof.mjs';
import { createMemberNavigationResumeObserver } from './pc10-member-navigation-resume.mjs';
import { pc11MemberReadiness } from './qualification/pc11-normal-start-adapter.mjs';

const sourcePath = new URL('./pc10-starlight-movement-scout-ui-proof.mjs', import.meta.url);
const source = await readFile(sourcePath, 'utf8');
const nativeStart = source.indexOf('export async function runP181StarlightMovementScoutNative(');
assert.ok(nativeStart >= 0, 'Bind the actual native P181 consumer.');
const file = typescript.createSourceFile(sourcePath.pathname, source, typescript.ScriptTarget.Latest, true, typescript.ScriptKind.JS);
const waitExpressions = [];
function findWait(node) {
  if (typescript.isVariableDeclaration(node) && node.name.getText(file) === 'waitForFullActor')
    waitExpressions.push(node.initializer.getText(file));
  typescript.forEachChild(node, findWait);
}
findWait(file);
assert.equal(waitExpressions.length, 1, 'Extract the single actual finite actor-readiness consumer.');
const actualWaitForFullActor = `const waitForFullActor = ${waitExpressions[0]};`;
const assignmentStart = source.indexOf('          let castingAuthority, assignment, navigationStart, navigation, castingFailure, castingCurrent;', nativeStart);
const clickEndMarker = "          await bounded('Choose original station berth', () => roleLink.click({ timeout: p181Remaining(navigationUiEnd) }), navigationUiEnd);";
const clickEnd = source.indexOf(clickEndMarker, assignmentStart) + clickEndMarker.length;
assert.ok(assignmentStart > nativeStart && clickEnd > assignmentStart,
  'Extract the actual assignment-wait, navigation-baseline, and role-link consumer.');
const actualAssignmentToClick = source.slice(assignmentStart, clickEnd);

// Inert mounted store/Auth/transport ports, with actual retained-authority,
// independent member reader, GM receipt and navigation observer consumers.
// This fixture alignment does not provide browser or native acceptance.
const runner = await readFile(new URL('./pc10-starlight-movement-scout-ui-proof-runner.test.mjs', import.meta.url), 'utf8');
const runnerFile = typescript.createSourceFile('actual-runner.mjs', runner, typescript.ScriptTarget.Latest, true, typescript.ScriptKind.JS);
let surfaceFixture;
for (const node of runnerFile.statements) if (typescript.isFunctionDeclaration(node) && node.name?.text === 'mountedP181Surface')
  surfaceFixture = node.getText(runnerFile);
assert.ok(surfaceFixture, 'Reuse the existing mounted surface ports for the current authority adapters.');
const mountedP181Surface = runInNewContext(`(${surfaceFixture})`, {
  originalRoleIds: ['wing-commander'], EventEmitter, runInNewContext, webcrypto, TextEncoder,
  structuredClone, queueMicrotask, assert, URL, setTimeout, clearTimeout,
});
const roleId = 'wing-commander', actorUid = 'private-source-only-actor';
const hashShort = uid => createHash('sha256').update(uid).digest('hex').slice(0, 16);
const expected = { sessionId: 'normal-session', uidHash: hashShort(actorUid), roleId, stage: 'casting' };
const acceptedNormalResume = { connectionGeneration: 2, identityHydrationRevision: 2,
  connection: 'live', freshness: 'server', sdkHasServerAuthority: true, sdkResumePending: false,
  uidHash: expected.uidHash, sessionId: expected.sessionId };
const expectedCasting = { ...expected };
const publicTuple = value => ({ connectionGeneration: value.connectionGeneration,
  identityHydrationRevision: value.identityHydrationRevision, connection: value.connection,
  freshness: value.freshness, sdkHasServerAuthority: value.sdkHasServerAuthority,
  sdkResumePending: value.sdkResumePending, uidHash: value.uidHash, sessionId: value.sessionId });

async function actualAssignmentCase({ initial = 'pending', staleAcceptance = false } = {}) {
  const directory = await mkdtemp(join(tmpdir(), 'p181-role-navigation-baseline-'));
  const wing = mountedP181Surface(actorUid, { casting: true });
  const gm = mountedP181Surface('original-gm', { gm: true, casting: true });
  for (const surface of [wing, gm]) {
    surface.state.session.setupConfirmed = true; surface.state.session.setupRevision = 1;
    surface.state.me.connectionGeneration = 1; surface.state.identityHydrationRevision = 1;
    surface.state.session.currentActorBerthAuthority.connectionGeneration = 1;
  }
  wing.state.seats = [{ id: roleId, roleId, status: 'available', holderUid: null }];
  const readMember = () => observeFullGameDemoPresentationMember(wing, { knownRoleIds: [roleId] });
  const admitted = await readMember(), gmBefore = await observeLifecycleActor(gm, expected.sessionId);
  const state = { current: admitted, reads: 0, delays: 0, clickStates: [], notice: Promise.resolve() };
  const settled = () => wing.publish(value => {
    value.me.connectionGeneration = 2; value.identityHydrationRevision = 2;
    value.session.currentActorBerthAuthority.connectionGeneration = 2;
    value.connection = 'live'; value.sessionSnapshotFreshness = 'server'; value.sdkResumePending = false;
  });
  const resume = async () => {
    wing.deliver('resumeSession', { sessionId: expected.sessionId }, { session: { id: expected.sessionId },
      player: { ...wing.state.me, connectionGeneration: 2 } });
    await state.notice;
    if (initial === 'ready-pending') {
      wing.publish(value => { value.me.connectionGeneration = 2; value.identityHydrationRevision = 2;
        value.session.currentActorBerthAuthority.connectionGeneration = 2; });
    } else settled();
  };
  let resumeDelivered = false;
  gm.onChoice = async () => {
    gm.publish(value => { value.session.phase = 'casting'; value.session.setupRevision = 2; });
    gm.deliver('assignRole', { sessionId: expected.sessionId, instanceId: gm.state.gmInstance.id,
      requestId: 'original-role-assignment', expectedSetupRevision: 1, targetUid: actorUid, roleId },
      { status: 'committed', sessionId: expected.sessionId, requestId: 'original-role-assignment', setupRevision: 2 });
    wing.publish(value => {
      value.session.phase = 'casting'; value.session.setupRevision = 2; value.me.assignedRoleId = roleId;
      value.session.currentActorBerthAuthority.assignedRoleId = roleId;
      value.connection = 'connecting'; value.sessionSnapshotFreshness = 'cache'; value.sdkResumePending = true;
    });
    if (initial === 'foreign') wing.publishAuth({ uid: 'foreign-source-only-actor' });
    else if (initial === 'foreign-session') wing.publish(value => { value.session.id = 'foreign-session'; });
    else if (initial !== 'pending') { resumeDelivered = true; await resume(); }
  };
  wing.onChoice = async () => state.clickStates.push(await readMember());
  const readFullActor = async () => {
    state.reads++;
    if (staleAcceptance === 'foreign' && state.reads === 2) wing.publishAuth({ uid: 'foreign-source-only-actor' });
    else if (staleAcceptance && state.reads === 2) wing.publish(value => {
      value.connection = 'connecting'; value.sessionSnapshotFreshness = 'cache'; value.sdkResumePending = true;
    });
    state.current = await readMember(); return state.current;
  };
  const bounded = async (_label, operation) => operation();
  const delay = async () => {
    state.delays++;
    if (!resumeDelivered) { resumeDelivered = true; await resume(); }
    else settled();
  };
  const deadlineAt = Date.now() + 5_000;
  const context = { assert, Date, Math, Promise, P181_NATIVE_TIMING: { operationTimeoutMs: 5_000 },
    deadlineAt, castingDeadlineAt: deadlineAt, cleanupDeadlineAt: deadlineAt + 5000,
    directory, trace: [], sessionId: expected.sessionId, memberRoleId: roleId, memberName: 'Wing', proofProfile: 'starlight',
    admitted, admittedAuth: { uid: actorUid, uidHash: expected.uidHash }, displayName: 'Source-only assigned member',
    memberSurface: wing, gm, gmInstanceId: gm.state.gmInstance.id,
    ownedAuthUids: new Map([['gm', gm.uid], ['wing-commander', actorUid]]), hashShort,
    normalPreparationDiagnostic: { active: false }, markPreparationActor: () => {},
    p181PreparationTuple, retainP181CallerRejection, retainP181MemberAuthority,
    readFullActor, bounded, delay, pc11MemberReadiness,
    captureAction: (surface, endpoint, operation, end) => captureLifecycleUiAction(surface, endpoint, operation,
      { original: gmBefore, gm: true, normalSetup: true, sdkAuthority: true, deadlineAt: end }),
    p181Remaining: end => Math.max(1, end - Date.now()),
    createMemberNavigationResumeObserver: (page, options) => createMemberNavigationResumeObserver(page, {
      ...options, ...(options.onCastingResumeRequest ? { onCastingResumeRequest: value => {
        state.notice = options.onCastingResumeRequest(value); return state.notice;
      } } : {}),
    }), casting: gm.page,
  };
  try {
    const result = await runInNewContext(`(async () => {
      ${actualWaitForFullActor}
      ${actualAssignmentToClick}
      } finally { await navigation.finish(); }
      return { navigationStart, trace };
    })()`, context);
    return { result, state };
  } catch (error) { return { error, state }; }
  finally {
    assert.equal(wing.observers.stores.size, 0); assert.equal(wing.observers.auth.size, 0);
    assert.equal(wing.page.eventNames().length, 0, 'Every authority and receipt listener must detach.');
    const files = await readdir(join(directory, 'member-navigation'));
    state.transitions = 0;
    for (const name of files) state.transitions += JSON.parse(await readFile(join(directory, 'member-navigation', name), 'utf8')).transitions.length;
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
  assert.equal(state.transitions, 1, 'Only the captured casting resume grants an accepted transition.');
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
  assert.ok(state.delays > 0, 'Assigned but pending ordinary resume cannot navigate immediately.');
});

test('actual assignment readiness waits when otherwise complete casting still has SDK resume pending', async () => {
  const { result, state } = await actualAssignmentCase({ initial: 'ready-pending' });
  assertAcceptedCastingBaseline(result, state);
  assert.ok(state.delays > 0, 'An otherwise hydrated tuple still waits for its mounted pending fence.');
});

for (const [initial, message] of [
  ['foreign', /Original P181 Auth authority retired/],
  ['foreign-session', /Original P181 member identity or authority changed/],
]) test(`actual assignment immediately rejects ${initial} without role navigation or acceptance`, async () => {
  const { error, state } = await actualAssignmentCase({ initial });
  assert.match(error?.message ?? '', message);
  assert.equal(state.clickStates.length, 0); assert.equal(state.transitions, 0);
});

test('actual assignment baseline retains its accepted tuple after the required current SDK recheck', async () => {
  const { result, state } = await actualAssignmentCase({ initial: 'accepted' });
  assertAcceptedCastingBaseline(result, state);
  assert.ok(state.reads >= 2, 'The real observer must revalidate mounted authority after readiness.');
});

test('actual assignment final SDK recheck rejects a stale second read before role navigation', async () => {
  const { error, state } = await actualAssignmentCase({ initial: 'accepted', staleAcceptance: true });
  assert.match(error?.message ?? '', /SDK hydration or own-member readiness changed during acceptance/);
  assert.equal(state.clickStates.length, 0); assert.equal(state.transitions, 0);
});

test('actual assignment final authority recheck rejects a foreign second read before role navigation', async () => {
  const { error, state } = await actualAssignmentCase({ initial: 'accepted', staleAcceptance: 'foreign' });
  assert.match(error?.message ?? '', /Original casting assignment uidHash changed during client acceptance/);
  assert.equal(state.clickStates.length, 0); assert.equal(state.transitions, 0);
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
