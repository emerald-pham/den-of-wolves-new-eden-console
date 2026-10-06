import assert from 'node:assert/strict';
import test from 'node:test';
import { execFileSync } from 'node:child_process';
import { captureSpecialistUiAction } from './pc10-specialist-gameplay.mjs';

// The actual exported capture runs in a strict Node child where an orphaned
// native Promise rejection is fatal. This models canonical page closure only;
// no Playwright, browser, SDK transport, gameplay or cleanup resource is used.
for (const timing of ['after-primary-catch', 'before-primary-catch']) {
  test(`a failed ordinary click preserves its primary error and consumes response rejection ${timing}`, () => {
    const source = `
      import { captureSpecialistUiAction } from ${JSON.stringify(new URL('./pc10-specialist-gameplay.mjs', import.meta.url).href)};
      import { setImmediate as turn } from 'node:timers/promises';
      const primary = new Error('original-control-failure');
      let rejectResponse, primaryPreserved = false, cleanupCompleted = false, armed = 0;
      const actor = { sameActor:true,sessionId:'native-session',uidHash:'hash',
        profileRoleId:'wing-commander',activeConsoleRoleId:'wing-commander',connection:'live',freshness:'server' };
      const surface = { observe:async()=>actor,
        page:{ waitForResponse:()=>{ armed++;return new Promise((_,reject)=>{rejectResponse=reject;}); } } };
      const operation = captureSpecialistUiAction({ game:{context:{initial:{sessionId:'native-session'}},select:async()=>surface},
        roleId:'wing-commander',endpoint:'requestScout',waitForProjection:async()=>{throw new Error('No projection after failed click');},
        click:async()=>{ ${timing === 'before-primary-catch' ? "rejectResponse(new Error('canonical-browser-close'));" : ''} throw primary; } });
      try { await operation; } catch(error) { primaryPreserved = error===primary; }
      finally { cleanupCompleted=true; }
      ${timing === 'after-primary-catch' ? "rejectResponse(new Error('canonical-browser-close'));" : ''}
      await turn();
      console.log(JSON.stringify({primaryPreserved,cleanupCompleted,armed}));
    `;
    const output = execFileSync(process.execPath, ['--unhandled-rejections=strict', '--input-type=module', '-e', source], {
      cwd: new URL('..', import.meta.url), encoding: 'utf8', timeout: 10_000,
    });
    assert.deepEqual(JSON.parse(output.trim()), { primaryPreserved: true, cleanupCompleted: true, armed: 1 });
  });
}

function fixture({ initialActor = {}, afterActor = {}, rejection } = {}) {
  const request = { sessionId: 'native-session', requestId: 'original-request', entitlementId: 'starlight', targetCoordinate: '1413' };
  const result = { status: 'requested', resolution: 'pending', requestId: request.requestId, sessionId: request.sessionId,
    cycle: 1, entitlementId: 'starlight', source: 'craft', ownerRoleId: 'wing-commander',
    anchorShipId: 'aegis', receivingShipId: 'aegis', targetCoordinate: request.targetCoordinate };
  const events = [], records = [], replayRequests = [];
  let observations = 0;
  const actor = { sameActor: true, sessionId: request.sessionId, uidHash: 'native-original-hash',
    profileRoleId: 'wing-commander', activeConsoleRoleId: 'wing-commander', connection: 'live', freshness: 'server' };
  const response = { url: () => 'http://native.invalid/project/us-central1/requestScout',
    request: () => ({ method: () => 'POST', postDataJSON: () => ({ data: request }) }),
    ok: () => true, json: async () => ({ result }), status: () => 200 };
  const page = { waitForResponse: predicate => {
    events.push('observer'); assert.equal(predicate(response), true);
    return rejection ? Promise.reject(rejection) : Promise.resolve(response);
  } };
  const surface = { page, observe: async () => ({ ...actor, ...(observations++ ? afterActor : initialActor) }),
    callable: async (endpoint, payload) => {
      assert.equal(endpoint, 'requestScout'); replayRequests.push(payload);
      return { status: 'committed', result: { ...result, status: 'replayed' } };
    } };
  const game = { context: { initial: { sessionId: request.sessionId } },
    select: async () => { events.push('select'); return surface; }, actions: records,
    save: async (name, state) => { events.push('save'); assert.equal(name, 'specialist-gameplay-progress.json'); assert.equal(state.status, 'action-committed'); } };
  const run = options => captureSpecialistUiAction({ game, roleId: 'wing-commander', endpoint: 'requestScout',
    click: async () => { events.push('single-click'); },
    waitForProjection: async () => { events.push('projection'); return { gm: { source: 'server', cycle: 1, revision: 7 },
      crew: { source: 'server', cycle: 1, revision: 7 }, renderedStatus: 'public-result-visible' }; }, ...options });
  return { run, events, records, request, result, replayRequests };
}

test('source-specific current control readiness completes before arming the mutation response observer', async () => {
  const f = fixture();
  const readinessFailure = new Error('original-current-control-unavailable');
  await assert.rejects(f.run({ prepare: async () => { f.events.push('readiness'); throw readinessFailure; } }),
    error => error === readinessFailure);
  assert.deepEqual(f.events, ['select', 'readiness']);
  assert.equal(f.records.length, 0); assert.equal(f.replayRequests.length, 0);
});

test('a ready ordinary control arms once before its single click and retains exact SDK replay and projection', async () => {
  const f = fixture();
  const result = await f.run({ prepare: async () => { f.events.push('readiness'); } });
  assert.deepEqual(f.events, ['select', 'readiness', 'observer', 'single-click', 'projection', 'save']);
  assert.deepEqual(f.replayRequests, [f.request]);
  assert.equal(result.evidence.response.exactReplay, true);
  assert.equal(result.evidence.response.projectionRevision, 7);
  assert.equal(f.records.length, 1);
  assert.equal(JSON.stringify(f.records).includes('1413'), false);
});

test('an original response rejection after a successful click remains a hard failure', async () => {
  const rejection = new Error('original-response-timeout'), f = fixture({ rejection });
  await assert.rejects(f.run(), error => error === rejection);
  assert.equal(f.records.length, 0); assert.equal(f.replayRequests.length, 0);
});

for (const [field, value] of [['sameActor', false], ['sessionId', 'foreign-session'], ['connection', 'offline'],
  ['freshness', 'cache'], ['profileRoleId', 'quellon-explorer'], ['activeConsoleRoleId', null]]) {
  test(`the original ${field} precondition cannot arm a response observer`, async () => {
    const f = fixture({ initialActor: { [field]: value } });
    await assert.rejects(f.run());
    assert.deepEqual(f.events, ['select']); assert.equal(f.replayRequests.length, 0);
  });
}
for (const [field, value] of [['uidHash', 'foreign-hash'], ['sessionId', 'foreign-session'],
  ['activeConsoleRoleId', null], ['sameActor', false], ['connection', 'offline'], ['freshness', 'cache']]) {
  test(`a real post-click ${field} withdrawal forbids replay and projection credit`, async () => {
    const f = fixture({ afterActor: { [field]: value } });
    await assert.rejects(f.run());
    assert.deepEqual(f.events, ['select', 'observer', 'single-click']);
    assert.equal(f.records.length, 0); assert.equal(f.replayRequests.length, 0);
  });
}
