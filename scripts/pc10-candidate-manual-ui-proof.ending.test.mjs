import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { candidateGameplayTools } from './pc10-candidate-manual-ui-proof.mjs';

function endingFixture() {
  const sessionId = 'ring-ending-session';
  const instanceId = 'owned-gm-instance';
  let responseBodyRead = false;
  const snapshot = { type: 'session-debrief', version: 1, source: 'candidate', result: 'success',
    cycle: 4, candidate: { code: 'N', groups: [] } };
  const request = { method: () => 'POST', url: () => 'http://127.0.0.1:5021/demo-ring-proof/us-central1/getSessionDebrief',
    postDataJSON: () => ({ data: { sessionId, instanceId } }) };
  const response = { request: () => request, url: () => request.url(), status: () => 200,
    json: async () => { responseBodyRead = true; return { result: { type: 'session-debrief', sessionId, snapshot } }; } };
  const dialog = { waitFor: async () => {}, getByText: (text, options) => ({ waitFor: async () => {
    assert.equal(text, 'Server result // success // Cycle 4');
    assert.deepEqual(options, { exact: true });
    assert.equal(responseBodyRead, true, 'The real entitled server response must be validated before rendered readiness is credited.');
  } }) };
  function surface() {
    return {
      page: {
        getByRole: (_role, options) => options?.name === 'Endgame evaluation' ? dialog : dialog,
        waitForResponse: (predicate, { timeout = 1_000 } = {}) => new Promise((resolveResponse, rejectResponse) => {
          const timer = setTimeout(() => rejectResponse(new Error('debrief response readiness deadline expired')), timeout);
          setTimeout(() => {
            if (predicate(response)) { clearTimeout(timer); resolveResponse(response); }
          }, 20);
        }),
        screenshot: async () => {},
        reload: async () => {},
        evaluate: async () => ({ sessionId, cycle: 4, phase: 'debrief',
          fullGameDemo: { status: 'complete', progression: 'manual' }, live: true,
          // The observer projection can omit the GM-only snapshot while the entitled read is pending.
          debriefSnapshot: undefined }),
      },
      until: async () => ({ phase: 'debrief', fullGameDemo: { status: 'complete', progression: 'manual' } }),
      observe: async () => ({ sessionId, uidHash: 'same-actor', profileRoleId: 'crew-role',
        hasAuth: true, sameActor: true, connection: 'live', freshness: 'server' }),
      storeModuleUrl: () => 'test-store-module',
    };
  }
  return { gm: surface(), crew: surface(), sessionId, snapshot };
}

test('candidate ending waits for the validated entitled debrief response before saving gameplay evidence', async t => {
  const directory = await mkdtemp(resolve(tmpdir(), 'pc10-candidate-ending-readiness-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const fixture = endingFixture();
  const tools = candidateGameplayTools({ gm: fixture.gm, crew: fixture.crew, directory,
    initial: { sessionId: fixture.sessionId, joinCode: 'ordinary-join' }, roster: [{ roleId: 'gm' }, { roleId: 'crew-role' }],
    projectId: 'demo-ring-proof', ports: { functions: 5021 } });

  await tools.complete('N');

  const evidence = JSON.parse(await readFile(resolve(directory, 'candidate-gameplay.json'), 'utf8'));
  assert.equal(evidence.ending.source, 'candidate');
  assert.equal(evidence.ending.result, 'success');
  assert.equal(evidence.ending.candidate.code, 'N');
});
