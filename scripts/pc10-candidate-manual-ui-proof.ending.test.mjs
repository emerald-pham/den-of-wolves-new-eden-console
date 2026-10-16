import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { candidateGameplayTools } from './pc10-candidate-manual-ui-proof.mjs';

function endingFixture({ status = 200, preDelivered = false } = {}) {
  const sessionId = 'ring-ending-session';
  const instanceId = 'owned-gm-instance';
  let responseBodyRead = preDelivered;
  let readCount = preDelivered ? 1 : 0;
  let gmReloadCount = 0;
  let crewReadReady = false;
  const waiters = new Set();
  const snapshot = { type: 'session-debrief', version: 1, source: 'candidate', result: 'success',
    cycle: 4, candidate: { code: 'N', groups: [] } };
  const request = { method: () => 'POST', url: () => 'http://127.0.0.1:5021/demo-ring-proof/us-central1/getSessionDebrief',
    postDataJSON: () => ({ data: { sessionId, instanceId } }) };
  const response = { request: () => request, url: () => request.url(), status: () => status,
    json: async () => {
      responseBodyRead = true;
      return status === 200 ? { result: { type: 'session-debrief', sessionId, snapshot } }
        : { error: { status: 'permission-denied', message: 'Private callable detail' } };
    } };
  function makeResponseReady() {
    readCount++;
    responseBodyRead = false;
    setTimeout(() => {
      for (const waiter of waiters) {
        if (waiter.predicate(response)) { clearTimeout(waiter.timer); waiters.delete(waiter); waiter.resolve(response); }
      }
    }, 20);
  }
  function surface(kind) {
    const dialog = { waitFor: async () => {}, getByText: (text, options) => ({ waitFor: async () => {
      assert.equal(text, 'Server result // Success // Cycle 4');
      assert.deepEqual(options, { exact: true });
      assert.equal(kind === 'gm' ? responseBodyRead : crewReadReady, true,
        `${kind} must render the ending only after its applicable server projection is available.`);
    } }) };
    return {
      page: {
        getByRole: () => dialog,
        waitForResponse: (predicate, { timeout = 1_000 } = {}) => new Promise((resolveResponse, rejectResponse) => {
          const waiter = { predicate, resolve: resolveResponse, timer: null };
          waiter.timer = setTimeout(() => { waiters.delete(waiter); rejectResponse(new Error('debrief response readiness deadline expired')); }, timeout);
          waiters.add(waiter);
        }),
        screenshot: async () => {},
        reload: async () => {
          if (kind === 'gm') { gmReloadCount++; makeResponseReady(); }
          else crewReadReady = true;
        },
        evaluate: async () => ({ sessionId, cycle: 4, phase: 'debrief',
          fullGameDemo: { status: 'complete', progression: 'manual' }, live: true,
          // The observer projection can omit the GM-only snapshot while the entitled read is pending.
          debriefSnapshot: undefined }),
      },
      until: async (_description, predicate) => {
        const current = { phase: 'debrief', fullGameDemo: { status: 'complete', progression: 'manual' },
          sessionId, uidHash: 'same-actor', profileRoleId: kind === 'gm' ? null : 'crew-role',
          playerRole: kind === 'gm' ? 'gm' : 'player',
          hasAuth: true, sameActor: true, gmInstanceOwned: kind === 'gm', instanceId: kind === 'gm' ? instanceId : null,
          debriefType: 'session-debrief', debriefVersion: 1, debriefSource: 'candidate',
          debriefResult: 'success', debriefCycle: 4,
          connection: 'live', freshness: 'server' };
        if (predicate) assert.equal(predicate(current), true);
        return current;
      },
      observe: async () => ({ sessionId, uidHash: 'same-actor', profileRoleId: 'crew-role',
        playerRole: kind === 'gm' ? 'gm' : 'player', instanceId: kind === 'gm' ? instanceId : null,
        gmInstanceOwned: kind === 'gm', hasAuth: true, sameActor: true, debriefType: 'session-debrief',
        debriefVersion: 1, debriefSource: 'candidate', debriefResult: 'success', debriefCycle: 4,
        connection: 'live', freshness: 'server' }),
      storeModuleUrl: () => 'test-store-module',
    };
  }
  return { gm: surface('gm'), crew: surface('crew'), sessionId, snapshot,
    readCount: () => readCount, gmReloadCount: () => gmReloadCount };
}

test('candidate ending waits for the validated entitled debrief response before saving gameplay evidence', async t => {
  const directory = await mkdtemp(resolve(tmpdir(), 'pc10-candidate-ending-readiness-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const fixture = endingFixture();
  const tools = candidateGameplayTools({ gm: fixture.gm, crew: fixture.crew, directory,
    initial: { sessionId: fixture.sessionId, joinCode: 'ordinary-join' }, roster: [{ roleId: 'gm' }, { roleId: 'crew-role' }],
    started: { uidHash: 'same-actor', instanceId: 'owned-gm-instance' },
    deadlineAt: Date.now() + 1_000,
    projectId: 'demo-ring-proof', ports: { functions: 5021 } });

  await tools.complete('N');

  const evidence = JSON.parse(await readFile(resolve(directory, 'candidate-gameplay.json'), 'utf8'));
  assert.equal(evidence.ending.source, 'candidate');
  assert.equal(evidence.ending.result, 'success');
  assert.equal(evidence.ending.candidate.code, 'N');
});

test('candidate ending replays the entitled read after a prior debrief response completed before complete started', async t => {
  const directory = await mkdtemp(resolve(tmpdir(), 'pc10-candidate-ending-predelivered-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const fixture = endingFixture({ preDelivered: true });
  const tools = candidateGameplayTools({ gm: fixture.gm, crew: fixture.crew, directory,
    initial: { sessionId: fixture.sessionId, joinCode: 'ordinary-join' }, roster: [{ roleId: 'gm' }, { roleId: 'crew-role' }],
    started: { uidHash: 'same-actor', instanceId: 'owned-gm-instance' }, deadlineAt: Date.now() + 1_000,
    projectId: 'demo-ring-proof', ports: { functions: 5021 } });

  await tools.complete('N');

  assert.equal(fixture.gmReloadCount(), 1, 'The same original GM page must initiate a fresh ordinary UI read.');
  assert.equal(fixture.readCount(), 2, 'A prior completed response cannot be mistaken for a newly observed read.');
  const evidence = JSON.parse(await readFile(resolve(directory, 'candidate-gameplay.json'), 'utf8'));
  assert.equal(evidence.ending.candidate.code, 'N');
});

test('candidate ending preserves a failed entitled debrief read and does not save success evidence', async t => {
  const directory = await mkdtemp(resolve(tmpdir(), 'pc10-candidate-ending-denial-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const fixture = endingFixture({ status: 403 });
  const tools = candidateGameplayTools({ gm: fixture.gm, crew: fixture.crew, directory,
    initial: { sessionId: fixture.sessionId, joinCode: 'ordinary-join' }, roster: [{ roleId: 'gm' }, { roleId: 'crew-role' }],
    started: { uidHash: 'same-actor', instanceId: 'owned-gm-instance' }, deadlineAt: Date.now() + 1_000,
    projectId: 'demo-ring-proof', ports: { functions: 5021 } });

  await assert.rejects(tools.complete('N'), /permission-denied/i);
  assert.deepEqual(await readdir(directory), [], 'A callable denial cannot write successful ending evidence.');
});
