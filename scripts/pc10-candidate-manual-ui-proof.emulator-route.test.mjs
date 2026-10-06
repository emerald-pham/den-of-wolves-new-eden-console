import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { candidateGameplayTools } from './pc10-candidate-manual-ui-proof.mjs';

function candidateReadResponse({
  projectId = 'demo-pc10-owner-integrated-2', endpoint = 'readCandidateWorkspace', sessionId = 'session-test',
  expectedGroupId = 'fleet-1', instanceId = 'owned-instance', cycle = 4, revision = 3, extraRequestField,
} = {}) {
  const url = `http://127.0.0.1:5011/${projectId}/us-central1/${endpoint}`;
  const data = { sessionId, expectedGroupId, instanceId, ...(extraRequestField ? { unexpected: true } : {}) };
  const request = { method: () => 'POST', url: () => url, postDataJSON: () => ({ data }) };
  return { request: () => request, url: () => url, status: () => 200,
    json: async () => ({ result: { type: 'candidate-workspace', sessionId: 'session-test', groupId: 'fleet-1',
      cycle, revision, paths: [{ code: 'N', title: 'New Eden', repaired: true,
        ships: [{ shipId: 'aegis', canAct: true }] }] } }) };
}

function candidateRefreshSurface({ refreshResponse, pendingResponse } = {}) {
  let screenshotCount = 0;
  let refreshed = false;
  const listeners = new Map();
  const on = (event, listener) => {
    const values = listeners.get(event) ?? new Set(); values.add(listener); listeners.set(event, values);
  };
  const off = (event, listener) => listeners.get(event)?.delete(listener);
  const emit = (event, value) => { for (const listener of listeners.get(event) ?? []) listener(value); };
  const emptyLocator = { count: async () => 0 };
  const button = { count: async () => 1, isVisible: async () => true, isEnabled: async () => true,
    scrollIntoViewIfNeeded: async () => {}, click: async () => {
      refreshed = true;
      if (pendingResponse) emit('response', pendingResponse);
      emit('request', refreshResponse.request());
      emit('response', refreshResponse);
    } };
  const panel = {
    waitFor: async () => {}, scrollIntoViewIfNeeded: async () => {},
    getByRole: (role, options) => role === 'button' && options?.name === 'Refresh candidate operations' ? button : emptyLocator,
    evaluate: async () => refreshed ? ({ receiving: true, headerCount: 0, cycle: null, revision: null,
      pathHeadings: [], researchGroupVisible: false, researchTrackNames: [], researchTrackEnabledCount: 0,
      commitResearchButtonCount: 0, ringButtons: [], nebulaJumpButtons: [], fleetGroupSelectorCount: 0,
      tabStopKeys: [], documentTabStopCount: 1, noHorizontalOverflow: true, controls: [],
      checkboxTargets: [], text: 'Receiving current candidate operations…', reducedMotion: false }) :
      ({ receiving: false, headerCount: 1, cycle: 4, revision: 3, pathHeadings: ['New Eden'],
        fleetGroupSelectorCount: 0, selectedFleetGroup: null }),
  };
  const surface = { page: {
    getByRole: role => role === 'region' ? panel : emptyLocator,
    on, off,
    waitForResponse: (predicate, { timeout = 25 } = {}) => new Promise((resolveResponse, rejectResponse) => {
      const finish = () => { off('response', onResponse); clearTimeout(timer); };
      const onResponse = response => {
        if (predicate(response)) { finish(); resolveResponse(response); }
      };
      const timer = setTimeout(() => { finish(); rejectResponse(new Error('candidate workspace source report timed out')); }, timeout);
      on('response', onResponse);
    }),
    keyboard: { press: async () => {} }, screenshot: async () => { screenshotCount++; },
    evaluate: async callback => {
      if (String(callback).includes('candidate-workspace-source-paint')) return true;
      if (String(callback).includes('candidate-workspace-mounted-reception')) return {
        panelCount: 1, panelVisible: true, pendingMutation: false, transmitting: false };
      if (String(callback).includes('candidate-workspace-current-source')) return {
        sessionId: 'session-test', cycle: 4, phase: 'active', groupId: 'fleet-1', shipFleetGroupIds: {},
        playerRole: 'gm', instanceId: 'owned-instance', instanceClaimedAt: 'lease-1',
        gmInstanceOwned: true, live: true, documentTimeOrigin: 1000,
        connectionGeneration: 3, identityHydrationRevision: 1, sessionUpdatedAt: 'source-key-0' };
      return undefined;
    },
  }, observe: async () => ({ hasAuth: true, sameActor: true, uidHash: 'actor-hash', sessionId: 'session-test',
    playerRole: 'gm', profileRoleId: null, assignedRoleId: null, activeConsoleRoleId: null,
    instanceId: 'owned-instance', gmInstanceOwned: true, connection: 'live', freshness: 'server' }),
  storeModuleUrl: () => 'test-store-module' };
  return { surface, screenshotCount: () => screenshotCount };
}

test('candidate refresh correlates the exact current report after a pending read on the project-prefixed emulator route', async t => {
  const directory = await mkdtemp(resolve(tmpdir(), 'pc10-candidate-emulator-route-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const pending = candidateReadResponse({ cycle: 3, revision: 2 });
  const current = candidateReadResponse();
  const fixture = candidateRefreshSurface({ pendingResponse: pending, refreshResponse: current });
  const tools = candidateGameplayTools({ gm: fixture.surface, crew: fixture.surface, directory,
    initial: { sessionId: 'session-test', joinCode: 'join-test' }, roster: [{ roleId: 'gm' }],
    projectId: 'demo-pc10-owner-integrated-2', ports: { functions: 5011 } });

  await assert.rejects(
    tools.candidateGeometry(fixture.surface, 'N', 'repaired', { readinessTimeoutMs: 25 }),
    /candidate workspace source report did not finish rendering/i,
  );
  assert.equal(fixture.screenshotCount(), 0, 'The prefixed route must yield the post-click current response, while the spinner remains uncredited.');
  assert.deepEqual(await readdir(directory), [], 'Neither the stale pending response nor the spinner may write geometry evidence.');
});

test('candidate refresh rejects another emulator project, endpoint, or request body', async t => {
  const rejected = [
    candidateReadResponse({ projectId: 'demo-some-other-project' }),
    candidateReadResponse({ endpoint: 'executeCandidateAction' }),
    candidateReadResponse({ sessionId: 'other-session' }),
    candidateReadResponse({ expectedGroupId: 'other-group' }),
    candidateReadResponse({ instanceId: 'other-instance' }),
    candidateReadResponse({ extraRequestField: true }),
  ];
  for (const [index, response] of rejected.entries()) {
    const directory = await mkdtemp(resolve(tmpdir(), `pc10-candidate-route-reject-${index}-`));
    t.after(() => rm(directory, { recursive: true, force: true }));
    const fixture = candidateRefreshSurface({ refreshResponse: response });
    const tools = candidateGameplayTools({ gm: fixture.surface, crew: fixture.surface, directory,
      initial: { sessionId: 'session-test', joinCode: 'join-test' }, roster: [{ roleId: 'gm' }],
      projectId: 'demo-pc10-owner-integrated-2', ports: { functions: 5011 } });

    await assert.rejects(
      tools.candidateGeometry(fixture.surface, 'N', 'repaired', { readinessTimeoutMs: 25 }),
      /candidate workspace source report timed out/i,
    );
    assert.equal(fixture.screenshotCount(), 0);
    assert.deepEqual(await readdir(directory), []);
  }
});
