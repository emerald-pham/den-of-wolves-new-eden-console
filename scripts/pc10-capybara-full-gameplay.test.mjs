import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CAPYBARA_REQUIRED_STAGES,
  CAPYBARA_STAGE_SCHEDULE,
  assessCapybaraGameplay,
  assertCapybaraRunContext,
  capybaraStageOutcome,
  projectCapybaraEvidence,
  sourceActionStageOutcome,
} from './pc10-capybara-full-gameplay.mjs';

const makeRoster = () => [
  'admiral', 'executive-officer', 'wing-commander', 'dione-engineer', 'dione-captain',
  'icebreaker-engineer', 'icebreaker-captain', 'shepherd-scientist', 'shepherd-captain',
  'quellon-explorer', 'quellon-captain', 'refinery-124-engineer', 'refinery-124-captain',
  'gorgoneion-captain', 'highwall-miner', 'capybara-captain', 'capybara-recycler',
  'press-officer', 'wolf-agent', 'wolf-cult', 'intelligence-agent',
].map((roleId, index) => ({ roleId, uidHash: `actor-hash-${index}` }));

const validContext = () => ({
  initial: { sessionId: 'fresh-session', joinCode: 'ordinary-code' },
  started: { sessionId: 'fresh-session', phase: 'active', cycle: 1, phaseProgression: 'manual',
    fullGameDemo: { status: 'active', progression: 'manual' }, activeRoleIds: makeRoster().filter(actor => actor.roleId !== 'press-officer').map(actor => actor.roleId),
    pressEnabled: true, capybaraEnabled: true },
  roster: makeRoster(),
});

const validStageOutcome = (stageId, roleId, endpoint) => ({
  status: 'captured', actionId: stageId, roleId, endpoint,
  evidence: {
    actor: { uidHash: 'actor-hash-0', connection: 'live', freshness: 'server', activeConsoleRoleId: roleId },
    cost: { resource: 'Capybara Scrap', amount: 1, result: 'one repair' },
    response: { httpStatus: 200, resultStatus: 'committed', exactReplay: true,
      revision: 2, replayRevision: 2, projectionRevision: 4 },
    projection: { gm: { source: 'server', cycle: 2, revision: 4, status: 'committed' },
      crew: { source: 'server', cycle: 2, revision: 3, status: 'committed' },
      renderedStatus: 'public-result-visible' },
  },
});

test('full-game schedule covers the added real Capybara and specialist functions at live game boundaries', () => {
  const byId = Object.fromEntries(CAPYBARA_STAGE_SCHEDULE.map(stage => [stage.id, stage]));
  for (const id of CAPYBARA_REQUIRED_STAGES) assert.ok(byId[id], `${id} has a concrete source checkpoint`);
  assert.deepEqual(byId['capybara-maintenance-production'].roles, ['capybara-recycler']);
  assert.deepEqual(byId['macaw-dismantle-consent'].roles, ['capybara-captain', 'target-player']);
  assert.equal(byId['boa-mission-reclamation'].before, 'mission-deal');
  assert.equal(byId['boa-wolf-scrap'].availability, 'actual-post-wolf-three-damage-only');
});

test('fresh Capybara acceptance requires the confirmed full twenty-role roster plus independent Press', () => {
  const context = validContext();
  assert.deepEqual(assertCapybaraRunContext(context), {
    sessionId: 'fresh-session', coreRoleCount: 20, roleAccountCount: 21, pressRolePresent: true,
    manualProgression: true, capybaraEnabled: true,
  });

  const missingCaptain = validContext();
  missingCaptain.roster = missingCaptain.roster.filter(actor => actor.roleId !== 'capybara-captain');
  assert.throws(() => assertCapybaraRunContext(missingCaptain), /Capybara Captain/);

  const duplicateIdentity = validContext();
  duplicateIdentity.roster[1].uidHash = duplicateIdentity.roster[0].uidHash;
  assert.throws(() => assertCapybaraRunContext(duplicateIdentity), /distinct original account/);

  const nonManual = validContext();
  nonManual.started.fullGameDemo.progression = 'timed';
  assert.throws(() => assertCapybaraRunContext(nonManual), /protected unlimited manual mode/);
});

test('only same-actor UI commit, exact SDK retry, live projections, and rendered result complete a stage', () => {
  const accepted = validStageOutcome('boa-recycling', 'capybara-recycler', 'recycleWithBoa');
  assert.deepEqual(capybaraStageOutcome(accepted), { status: 'completed', endpoint: 'recycleWithBoa',
    roleId: 'capybara-recycler', cost: { resource: 'Capybara Scrap', amount: 1, result: 'one repair' },
    cycle: 2, sourceRevision: 4 });

  for (const patch of [
    { status: 'uncredited' },
    { evidence: { response: { httpStatus: 200, resultStatus: 'committed', exactReplay: false,
      revision: 2, projectionRevision: 4 }, actor: { connection: 'live', freshness: 'server' },
      projection: { gm: { revision: 4 }, crew: { revision: 3 }, renderedStatus: 'public-result-visible' } } },
    { evidence: { ...accepted.evidence, actor: { ...accepted.evidence.actor, freshness: 'cached' } } },
    { evidence: { ...accepted.evidence, projection: { ...accepted.evidence.projection, renderedStatus: 'not-rendered' } } },
  ]) assert.equal(capybaraStageOutcome({ ...accepted, ...patch })?.status, 'pending');
});

test('terminal debrief alone cannot turn unavailable required Capybara actions green', () => {
  const pending = Object.fromEntries(CAPYBARA_REQUIRED_STAGES.map(id => [id, { status: 'completed' }]));
  pending['macaw-dismantle-consent'] = { status: 'pending', reason: 'no source-offered docked target' };
  const assessment = assessCapybaraGameplay({ context: validContext(), stages: pending,
    coreGameplay: { status: 'passed' }, terminal: { status: 'debrief', source: 'failure-review',
      result: 'failure', cause: 'pursuit-limit', immutable: true } });
  assert.equal(assessment.status, 'pending');
  assert.deepEqual(assessment.pendingStages, ['macaw-dismantle-consent']);

  const all = Object.fromEntries(CAPYBARA_REQUIRED_STAGES.map(id => [id, { status: 'completed' }]));
  assert.equal(assessCapybaraGameplay({ context: validContext(), stages: all,
    coreGameplay: { status: 'passed', manualProgression: true, serverActions: true, missionDelivered: true },
    terminal: { status: 'debrief', source: 'failure-review',
      result: 'failure', cause: 'pursuit-limit', immutable: true } }).status, 'passed');
});

test('specialist action receipt statuses require a source-approved success plus both projections', () => {
  const accepted = validStageOutcome('pdf-group-relay', 'refinery-124-pdf-colonel', 'sendFleetGroupMessage');
  accepted.evidence.response.resultStatus = 'sent';
  assert.equal(capybaraStageOutcome(accepted).status, 'completed');
  for (const resultStatus of ['stale', 'denied', 'rejected', 'failed', 'unknown']) {
    assert.equal(capybaraStageOutcome({ ...accepted,
      evidence: { ...accepted.evidence, response: { ...accepted.evidence.response, resultStatus } } }).status, 'pending');
  }
  assert.equal(capybaraStageOutcome({ ...accepted,
    evidence: { ...accepted.evidence, projection: { ...accepted.evidence.projection, crew: undefined } } }).status, 'pending');
});

test('source-helper callback rows require the matching live UI request, exact replay, and committed branch', () => {
  const branch = { status: 'committed', exactSourceAndRenderedReceipt: true, researchRevision: 8 };
  const requests = [{ endpoint: 'advanceEndeavourResearchTrack', roleId: 'shepherd-scientist',
    consoleRoleId: 'shepherd-scientist', cycle: 2, httpStatus: 200, resultStatus: 'committed',
    exactOriginalSdkReplay: true, expectedRevision: 7 }];
  assert.deepEqual(sourceActionStageOutcome({ branch, requests, endpoint: 'advanceEndeavourResearchTrack',
    roleId: 'shepherd-scientist', cycle: 2 }), { status: 'completed', roleId: 'shepherd-scientist',
    endpoint: 'advanceEndeavourResearchTrack', cycle: 2, sourceRevision: 8 });
  for (const patch of [
    { branch: { ...branch, status: 'blocked' } },
    { branch: { ...branch, exactSourceAndRenderedReceipt: false } },
    { requests: [{ ...requests[0], exactOriginalSdkReplay: false }] },
    { requests: [{ ...requests[0], cycle: 1 }] },
    { requests: [{ ...requests[0], roleId: 'another-actor' }] },
  ]) assert.equal(sourceActionStageOutcome({ branch, requests, endpoint: 'advanceEndeavourResearchTrack',
    roleId: 'shepherd-scientist', cycle: 2, ...patch }).status, 'pending');
});

test('Capybara callback composition is explicit, full-roster, and uses the canonical manual full-game runner', async () => {
  const { capybaraFullGameDemoOptions } = await import('./pc10-capybara-full-gameplay.mjs');
  const onSetup = async () => undefined;
  const options = capybaraFullGameDemoOptions({ runFinalEnding: async () => undefined, onSetup,
    sourceRoot: '/source', playerCount: 12,
    chartId: 'B' });
  assert.equal(options.playerCount, 20);
  assert.equal(options.includePress, true);
  assert.equal(options.capybaraEnabled, true);
  assert.equal(options.gameplayOnly, true);
  assert.equal(options.chartId, 'B');
  assert.equal(typeof options.runEnding, 'function');
  assert.equal(typeof options.onSetup, 'function');
  await options.onSetup({ marker: 'user-hook' });
  assert.equal(options.capybaraEnabled, true);
});

test('evidence projection omits private choices, raw actor/session identifiers, and credentials', () => {
  const report = projectCapybaraEvidence({ status: 'pending', stages: {
    'boa-mission-reclamation': { status: 'completed', roleId: 'capybara-recycler', endpoint: 'chooseBoaMissionReclamationOpportunity',
      choice: { taskOpportunityId: 'secret-task', missionOpportunityId: 'secret-mission', targetUid: 'private-uid',
        requestId: 'raw-request-id', authToken: 'secret-token' },
      cost: null, cycle: 2, sourceRevision: 9 },
  } });
  const serialized = JSON.stringify(report);
  for (const secret of ['secret-task', 'secret-mission', 'private-uid', 'raw-request-id', 'secret-token']) {
    assert.equal(serialized.includes(secret), false);
  }
  assert.equal(report.stages['boa-mission-reclamation'].status, 'completed');
});
