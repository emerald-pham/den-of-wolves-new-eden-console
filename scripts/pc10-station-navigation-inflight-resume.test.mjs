import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { stationNavigationResumeFixture } from './fixtures/pc10-station-navigation-resume-native-fixture.mjs';
import { createMemberNavigationResumeObserver } from './pc10-member-navigation-resume.mjs';

// Native-only regression for Actual3: the normal SDK request is pending when
// its own-player generation arrives. No product store writes or extra resume
// are made by the selection adapter; its original deadline remains in force.
const pendingOptions = { roleId: 'shepherd-captain', initialSeatNull: true,
  sourceResumeReply: true, publishGenerationBeforeResponse: true };
const packet = async f => {
  const files = await readdir(join(f.directory, 'member-navigation'));
  assert.equal(files.length, 1);
  return JSON.parse(await readFile(join(f.directory, 'member-navigation', files[0]), 'utf8'));
};
function selection(f) {
  let result;
  const task = f.run().then(surface => { result = { surface }; }, error => { result = { error }; });
  return { task, result: () => result };
}
async function cleanup(f, run) {
  f.releaseResumeResponse(); f.releaseResumeApplication();
  await run.task; await f.cleanup();
}
async function pendingPhase(f) {
  const current = await Promise.race([f.earlyGenerationObserved(), delay(600).then(() => {
    throw new Error('The actual selection consumer did not observe the pending own-player lease.');
  })]);
  assert.equal(current.connectionGeneration, 3); assert.equal(current.identityHydrationRevision, 1);
  assert.equal(current.connection, 'offline'); assert.equal(current.freshness, 'cache');
  assert.equal(f.application.length, 0, 'The actual source has not accepted the SDK reply.');
  assert.equal(f.authorityBinding().mountedResumePending, true);
  assert.equal(f.authorityBinding().mountedHasServerAuthority, true,
    'The previous server authority flag alone cannot release the actual pending-resume/freshness fence.');
  return current;
}

for (const [name, gateOptions, release] of [
  ['before HTTP delivery', { deferResumeResponse: true }, f => f.releaseResumeResponse()],
  ['after HTTP200 but before SDK hydration', { deferResumeApplication: true }, f => f.releaseResumeApplication()],
]) test(`ordinary Captain entry waits for its matching in-flight resume ${name}`, async () => {
  const f = await stationNavigationResumeFixture({ ...pendingOptions, ...gateOptions });
  const run = selection(f);
  try {
    await pendingPhase(f);
    await delay(35);
    assert.equal(run.result(), undefined, 'An intermediate lease is neither rejection nor accepted station authority.');
    release(f); await f.finishPendingResume(); await run.task;
    assert.equal(run.result()?.surface, f.crew); assert.equal(run.result()?.error, undefined);
    assert.deepEqual(f.sdkRequests, ['resumeSession']); assert.equal(f.application.length, 1);
    assert.equal(f.application[0].beforeGeneration, 3, 'The actual client accepts a reply after its own-player lease publication.');
    assert.equal(f.store.getState().identityHydrationRevision, 2); assert.equal(f.berthMatches(), true);
    assert.equal(f.authorityBinding().mountedResumePending, false);
    assert.equal(f.authorityBinding().mountedHasServerAuthority, true);
    assert.equal(f.counters.sdkCalls, 0); assert.equal(f.events.eventNames().length, 0);
    const saved = await packet(f);
    assert.equal(saved.transitions.length, 1); assert.equal(saved.receipts.length, 1);
    assert.equal(saved.transitions[0].status, 'accepted-normal-resume-bound');
    assert.equal(saved.receipts[0].httpStatus, 200); assert.equal(saved.receipts[0].bodyStatus, 'parsed');
    assert.equal(saved.receipts[0].reply.connectedFieldPresent, false);
    assert.equal(JSON.stringify(saved).includes('private-native-'), false);
  } finally { await cleanup(f, run); }
});

test('an in-flight normal request with no delivered response fails at its original deadline and removes listeners', async () => {
  const f = await stationNavigationResumeFixture({ ...pendingOptions, deferResumeResponse: true, shortDeadline: true });
  const run = selection(f);
  try {
    await pendingPhase(f); await run.task;
    assert.match(run.result()?.error?.message ?? '', /original role navigation deadline expired/i);
    assert.equal(f.application.length, 0); assert.equal(f.counters.sdkCalls, 0); assert.equal(f.events.eventNames().length, 0);
    const saved = await packet(f);
    assert.equal(saved.status, 'failed'); assert.equal(saved.transitions.length, 0);
    assert.equal(saved.receipts[0].httpStatus, undefined);
  } finally { await cleanup(f, run); }
});

for (const [name, options] of [
  ['a foreign request session', { deferResumeResponse: true, requestSession: 'foreign-session' }],
  ['a failed ordinary request', { deferResumeResponse: true, failResumeRequest: true }],
  ['an HTTP403 receipt before hydration', { deferResumeApplication: true, httpStatus: 403 }],
  ['an error envelope before hydration', { deferResumeApplication: true, responseError: true }],
  ['a foreign reply UID before hydration', { deferResumeApplication: true, mutateReply: reply => { reply.player.uid = 'foreign-uid'; } }],
]) test(`pending Captain entry rejects ${name} without accepting authority`, async () => {
  const f = await stationNavigationResumeFixture({ ...pendingOptions, ...options });
  const run = selection(f);
  try {
    await pendingPhase(f); await run.task;
    assert.match(run.result()?.error?.message ?? '', /matching normal resume receipt and accepted hydration/);
    assert.equal(f.application.length, 0); assert.equal(f.counters.sdkCalls, 0); assert.equal(f.events.eventNames().length, 0);
    const saved = await packet(f); assert.equal(saved.transitions.length, 0); assert.equal(saved.status, 'failed');
  } finally { await cleanup(f, run); }
});

test('station acceptance consumes the exact recharge presentation reader mounted SDK flags', async () => {
  const f = await stationNavigationResumeFixture({ roleId: 'shepherd-captain', initialSeatNull: true,
    sourceResumeReply: true, nativePresentationAcceptance: true });
  try {
    assert.equal(await f.run(), f.crew);
    assert.ok(f.presentationAcceptanceReads.length > 0);
    const actual = f.presentationAcceptanceReads[0];
    assert.equal(Object.hasOwn(actual, 'clientAcceptance'), false, 'Use the actual native reader schema.');
    assert.equal(actual.sdkHasServerAuthority, true); assert.equal(actual.sdkResumePending, false);
    assert.equal(f.application.length, 1); assert.deepEqual(f.sdkRequests, ['resumeSession']);
    const saved = await packet(f);
    assert.equal(saved.transitions.length, 1);
    assert.deepEqual(saved.transitions[0].clientAcceptance, { hasServerAuthority: true, resumePending: false });
    assert.equal(f.events.eventNames().length, 0); assert.equal(f.counters.sdkCalls, 0);
  } finally { await f.cleanup(); }
});

test('the recharge presentation reader pending SDK fence cannot grant station acceptance', async () => {
  const f = await stationNavigationResumeFixture({ roleId: 'shepherd-captain', initialSeatNull: true,
    sourceResumeReply: true, nativePresentationAcceptance: true, pendingNewerResume: true, shortDeadline: true });
  try {
    await assert.rejects(f.run(), /original role navigation deadline expired/i);
    assert.ok(f.presentationAcceptanceReads.length > 0);
    assert.equal(f.presentationAcceptanceReads[0].sdkResumePending, true);
    const saved = await packet(f); assert.equal(saved.transitions.length, 0);
    assert.equal(f.events.eventNames().length, 0); assert.equal(f.counters.sdkCalls, 0);
  } finally { await f.cleanup(); }
});

for (const httpStatus of [200, 403]) test(`HTTP${httpStatus} arriving during acceptance keeps the original pending-body boundary`, async () => {
  const directory = await mkdtemp(join(tmpdir(), 'pc10-native-body-race-'));
  const events = new EventEmitter(), roleId = 'shepherd-captain', uid = 'private-native-body-race';
  const page = { on: (...args) => events.on(...args), off: (...args) => events.off(...args),
    url: () => 'http://127.0.0.1:5174/#/ships/shepherd/roles/shepherd-captain' };
  const original = { documentTimeOrigin: 1000, hasAuth: true, sameActor: true,
    uidHash: createHash('sha256').update(uid).digest('hex').slice(0, 16),
    profileRoleId: roleId, profileSessionId: 'native-session', sessionId: 'native-session', meSessionId: 'native-session',
    playerRole: 'player', assignedRoleId: roleId, activeConsoleRoleId: roleId, seatId: roleId, fleetGroupId: 'fleet-1',
    replacementRoleId: null, replacementStatus: null, escapeLocked: false, connected: true,
    connectionGeneration: 2, identityHydrationRevision: 1, connection: 'live', freshness: 'server',
    currentMemberBerthPresent: true, currentMemberBerthMatches: true, currentOwnPlayerConfirmed: true,
    currentCanonicalSeatOwned: true };
  const pending = { ...original, connectionGeneration: 3, connection: 'offline', freshness: 'cache' };
  const observer = createMemberNavigationResumeObserver(page, { directory, roleId, deadlineAt: Date.now() + 500 });
  const request = { method: () => 'POST', url: () => 'http://127.0.0.1:5011/demo-native/us-central1/resumeSession',
    postDataJSON: () => ({ data: { sessionId: 'native-session' } }) };
  let releaseBody;
  const body = new Promise(resolve => { releaseBody = resolve; });
  try {
    await observer.prepare(original); events.emit('request', request);
    // accept snapshots an undefined parser, then yields. Deliver HTTP now,
    // while its body remains in flight, to exercise that exact async window.
    const acceptance = observer.accept(original, pending, () => assert.fail('An unfinished response grants no SDK acceptance observation.'));
    events.emit('response', { request: () => request, status: () => httpStatus, url: request.url, json: () => body });
    if (httpStatus === 200) assert.equal(await acceptance, false);
    else await assert.rejects(acceptance, /matching normal resume receipt and accepted hydration/);
  } finally {
    releaseBody({ error: { status: 'PERMISSION_DENIED' } }); await delay(0);
    await observer.finish(new Error('Source-only pending-body fixture complete; no station accepted.'));
    assert.equal(events.eventNames().length, 0);
    const saved = JSON.parse(await readFile(observer.path, 'utf8')); assert.equal(saved.transitions.length, 0);
    assert.equal(JSON.stringify(saved).includes(uid), false);
    await rm(directory, { recursive: true, force: true });
  }
});
