import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { candidateGameplayTools } from './pc10-candidate-manual-ui-proof.mjs';
import { projectCandidateWorkspaceReadiness, summarizeCandidateKeyboardTraversal } from './pc10-candidate-manual-ui-geometry.mjs';

function loadingCandidateSurface({ currentReport = false } = {}) {
  let screenshotCount = 0;
  const button = { count: async () => 1, isVisible: async () => true, isEnabled: async () => true,
    click: async () => {}, scrollIntoViewIfNeeded: async () => {} };
  const emptyLocator = { count: async () => 0 };
  const panel = {
    waitFor: async () => {},
    scrollIntoViewIfNeeded: async () => {},
    getByRole: (role, options) => role === 'button' && options?.name === 'Refresh candidate operations' ? button : emptyLocator,
    innerText: async () => 'Receiving current candidate operations…',
    evaluate: async () => ({ receiving: true, headerCount: 0, cycle: null, revision: null,
      pathHeadings: [], researchGroupVisible: false, researchTrackNames: [], researchTrackEnabledCount: 0,
      commitResearchButtonCount: 0, ringButtons: [], nebulaJumpButtons: [], fleetGroupSelectorCount: 0,
      tabStopKeys: [], documentTabStopCount: 1, noHorizontalOverflow: true, controls: [],
      checkboxTargets: [], text: 'Receiving current candidate operations…', reducedMotion: false }),
  };
  const request = { method: () => 'POST', postDataJSON: () => ({ data: {
    sessionId: 'session-test', expectedGroupId: 'fleet-1', instanceId: 'owned-instance' } }) };
  const response = { request: () => request, url: () => 'https://example.test/us-central1/readCandidateWorkspace',
    status: () => 200, json: async () => ({ result: { type: 'candidate-workspace', sessionId: 'session-test',
      groupId: 'fleet-1', cycle: 4, revision: 3,
      paths: [{ code: 'N', title: 'New Eden', repaired: true, ships: [{ shipId: 'aegis', canAct: true }] }] } }) };
  const surface = { page: {
    getByRole: role => role === 'region' ? panel : emptyLocator,
    waitForResponse: async predicate => {
      if (currentReport && predicate(response)) return response;
      throw new Error('candidate workspace source report timed out');
    },
    keyboard: { press: async () => {} },
    screenshot: async () => { screenshotCount++; },
    evaluate: async callback => {
      if (String(callback).includes('candidate-workspace-current-source')) return {
        sessionId: 'session-test', cycle: 4, phase: 'active', groupId: 'fleet-1', shipFleetGroupIds: {},
        playerRole: 'gm', instanceId: 'owned-instance', gmInstanceOwned: true, live: true };
      return undefined;
    },
  }, observe: async () => ({ hasAuth: true, sameActor: true, uidHash: 'actor-hash', sessionId: 'session-test',
    playerRole: 'gm', profileRoleId: null, assignedRoleId: null,
    activeConsoleRoleId: null, instanceId: 'owned-instance', gmInstanceOwned: true,
    connection: 'live', freshness: 'server' }), storeModuleUrl: () => 'test-store-module' };
  return { surface, screenshotCount: () => screenshotCount };
}

test('candidate geometry does not credit a mounted loading panel without a current source workspace report', async t => {
  const directory = await mkdtemp(resolve(tmpdir(), 'pc10-candidate-geometry-red-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const fixture = loadingCandidateSurface();
  const tools = candidateGameplayTools({ gm: fixture.surface, crew: fixture.surface, directory,
    initial: { sessionId: 'session-test', joinCode: 'join-test' }, roster: [{ roleId: 'gm' }] });

  await assert.rejects(
    tools.candidateGeometry(fixture.surface, 'N', 'research-choice', { readinessTimeoutMs: 25 }),
    /candidate workspace.*source|source.*candidate workspace/i,
  );
  assert.equal(fixture.screenshotCount(), 0, 'An unresolved source report must not produce geometry screenshots.');
  assert.deepEqual(await readdir(directory), [], 'An unresolved source report must not write a geometry success record.');
});

test('candidate geometry does not credit the spinner after a current native report arrives', async t => {
  const directory = await mkdtemp(resolve(tmpdir(), 'pc10-candidate-rendering-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const fixture = loadingCandidateSurface({ currentReport: true });
  const tools = candidateGameplayTools({ gm: fixture.surface, crew: fixture.surface, directory,
    initial: { sessionId: 'session-test', joinCode: 'join-test' }, roster: [{ roleId: 'gm' }] });

  await assert.rejects(
    tools.candidateGeometry(fixture.surface, 'N', 'repaired', { readinessTimeoutMs: 25 }),
    /candidate workspace source report did not finish rendering/i,
  );
  assert.equal(fixture.screenshotCount(), 0, 'A native report without its matching rendered workspace cannot produce geometry screenshots.');
  assert.deepEqual(await readdir(directory), [], 'A spinner cannot write a geometry success record after source response.');
});

function researchReadiness(overrides = {}) {
  const expectedActor = { hasAuth: true, sameActor: true, uidHash: 'actor-hash', sessionId: 'session-test',
    playerRole: 'player', profileRoleId: 'shepherd-scientist', assignedRoleId: 'shepherd-scientist',
    activeConsoleRoleId: 'shepherd-scientist', instanceId: null, gmInstanceOwned: false,
    connection: 'live', freshness: 'server' };
  const choices = [{ name: 'Reactor' }, { name: 'Jump Drive' }];
  return {
    expectedActor, currentActor: { ...expectedActor },
    sourceState: { live: true, sessionId: 'session-test', cycle: 4, phase: 'active', playerRole: 'player',
      groupId: 'fleet-1', instanceId: null, gmInstanceOwned: false },
    request: { sessionId: 'session-test', expectedGroupId: 'fleet-1' },
    report: { type: 'candidate-workspace', sessionId: 'session-test', groupId: 'fleet-1', cycle: 4, revision: 8,
      paths: [{ code: 'N', title: 'New Eden', repaired: false, researchChoices: choices }] },
    expectedGroupId: 'fleet-1', code: 'N', stage: 'research-choice',
    rendered: { receiving: false, headerCount: 1, cycle: 4, revision: 8, pathHeadings: ['New Eden'],
      researchGroupVisible: true, researchTrackNames: ['Reactor', 'Jump Drive'],
      researchTrackEnabledCount: 2, commitResearchButtonCount: 1, fleetGroupSelectorCount: 0,
      currentGroupId: 'fleet-1' },
    ...overrides,
  };
}

test('candidate readiness binds the original actor, live cycle, native report, selected group, and rendered revision', () => {
  assert.equal(projectCandidateWorkspaceReadiness(researchReadiness()).state, 'ready');
  assert.equal(projectCandidateWorkspaceReadiness(researchReadiness({
    currentActor: { ...researchReadiness().currentActor, uidHash: 'replacement-actor' },
  })).reason, 'original-actor-identity-changed');
  assert.equal(projectCandidateWorkspaceReadiness(researchReadiness({
    report: { ...researchReadiness().report, cycle: 3 },
  })).reason, 'native-candidate-report-is-not-current-and-well-formed');
  assert.equal(projectCandidateWorkspaceReadiness(researchReadiness({
    rendered: { ...researchReadiness().rendered, receiving: true },
  })).state, 'pending');
  assert.equal(projectCandidateWorkspaceReadiness(researchReadiness({
    rendered: { ...researchReadiness().rendered, revision: 7 },
  })).state, 'pending');
});

test('candidate source readiness rejects a changed GM claim and a different rendered fleet group', () => {
  const memberInput = researchReadiness();
  const gmActor = { ...memberInput.expectedActor, playerRole: 'gm', profileRoleId: null,
    assignedRoleId: null, activeConsoleRoleId: null, instanceId: 'owned-instance',
    instanceClaimedAt: 'original-lease', gmInstanceOwned: true };
  const gmInput = { ...memberInput, expectedActor: gmActor, currentActor: { ...gmActor },
    sourceState: { ...memberInput.sourceState, playerRole: 'gm', instanceId: 'owned-instance',
      instanceClaimedAt: 'original-lease', gmInstanceOwned: true },
    request: { sessionId: 'session-test', expectedGroupId: 'fleet-1', instanceId: 'owned-instance' } };
  assert.equal(projectCandidateWorkspaceReadiness({ ...gmInput,
    currentActor: { ...gmActor, instanceId: 'replacement-instance' } }).reason, 'original-actor-identity-changed');
  assert.equal(projectCandidateWorkspaceReadiness({ ...gmInput,
    currentActor: { ...gmActor, instanceClaimedAt: 'replacement-lease' } }).reason, 'original-actor-identity-changed');
  assert.equal(projectCandidateWorkspaceReadiness({ ...gmInput,
    rendered: { ...memberInput.rendered, fleetGroupSelectorCount: 1, selectedFleetGroup: 'fleet-2' } }).state, 'pending');
});

test('candidate stage controls must match the current repaired Ring or Nebula source path', () => {
  const base = researchReadiness();
  const repairedReport = { ...base.report, paths: [{ code: 'N', title: 'New Eden', repaired: true,
    ships: [{ shipId: 'aegis', canAct: true }] }] };
  const repairedRendered = { ...base.rendered, ringButtons: [{ name: 'Cross Ring // aegis // five fuel', enabled: true }] };
  assert.equal(projectCandidateWorkspaceReadiness({ ...base, report: repairedReport, rendered: repairedRendered,
    stage: 'repaired' }).state, 'ready');
  const nebulaReport = { ...base.report, paths: [{ code: 'O', title: 'Nebula',
    ships: [{ shipId: 'aegis', canAct: true, fuelCost: 12 }] }] };
  const nebulaRendered = { ...base.rendered, pathHeadings: ['Nebula'],
    nebulaJumpButtons: [{ name: 'Long jump into Nebula // aegis // 12 fuel', enabled: true }] };
  assert.equal(projectCandidateWorkspaceReadiness({ ...base, report: nebulaReport, rendered: nebulaRendered,
    code: 'O', stage: 'paid-loss-choice' }).state, 'ready');
  assert.equal(projectCandidateWorkspaceReadiness({ ...base, report: nebulaReport,
    rendered: { ...nebulaRendered, nebulaJumpButtons: [] }, code: 'O', stage: 'paid-loss-choice' }).state, 'pending');
});

test('keyboard proof derives its finite bound from current document tab stops and rejects skips or forced focus', () => {
  assert.equal(summarizeCandidateKeyboardTraversal({ documentTabStopCount: 8,
    intendedTargets: ['refresh', 'track-a'], visitedTargets: ['refresh', 'track-a'], tabPresses: 7 }).allEnabledTargetsReached, true);
  assert.equal(summarizeCandidateKeyboardTraversal({ documentTabStopCount: 8,
    intendedTargets: ['refresh', 'track-a'], visitedTargets: ['refresh'], tabPresses: 7 }).allEnabledTargetsReached, false);
  assert.equal(summarizeCandidateKeyboardTraversal({ documentTabStopCount: 8,
    intendedTargets: ['refresh', 'track-a'], visitedTargets: ['refresh', 'track-a'], tabPresses: 10 }).allEnabledTargetsReached, false);
  assert.equal(summarizeCandidateKeyboardTraversal({ documentTabStopCount: 8,
    intendedTargets: ['refresh', 'track-a'], visitedTargets: ['refresh', 'track-a'], tabPresses: 2,
    programmaticFocusUsed: true }).allEnabledTargetsReached, false);
});
