import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { stationNavigationResumeFixture } from './fixtures/pc10-station-navigation-resume-native-fixture.mjs';

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
