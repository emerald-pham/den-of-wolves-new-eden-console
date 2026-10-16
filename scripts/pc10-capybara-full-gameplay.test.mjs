import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CAPYBARA_REQUIRED_STAGES,
  CAPYBARA_STAGE_SCHEDULE,
  assessCapybaraGameplay,
  assertCapybaraRunContext,
  capybaraStageOutcome,
  consumeCapybaraEnding,
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

const immutableFailureSnapshot = () => ({
  type: 'session-debrief', version: 1, source: 'failure-review', result: 'failure',
  cause: 'pursuit-limit', cycle: 8, occurredAt: '2026-10-16T00:00:00.000Z',
  committedAt: '2026-10-16T00:00:01.000Z',
  outcome: { type: 'game-outcome', result: 'failure', cause: 'pursuit-limit', cycle: 8,
    navigationRevision: 4, occurredAt: '2026-10-16T00:00:00.000Z' },
});

const immutableFailureReply = () => ({ status: 'committed', result: {
  type: 'session-debrief', sessionId: 'fresh-session', snapshot: immutableFailureSnapshot(),
} });

const originalEndingGm = () => ({ sameActor: true, sessionId: 'fresh-session',
  uidHash: 'original-gm-uid-hash', playerRole: 'gm', gmInstanceOwned: true, instanceId: 'gm-instance' });

function capybaraEndingFixture({ phase = 'closed', identity, identityAfterCallable, reply = immutableFailureReply(), neverSettles = false,
  neverStateAt = [], neverObserveAt = [], states, timeoutMs = 30, publicSnapshot } = {}) {
  const context = validContext(), originalGm = originalEndingGm();
  const publicState = { sessionId: 'fresh-session', phase, cycle: 8, debriefSnapshot: publicSnapshot,
    gameOutcome: { source: 'public-session', result: 'failure', cause: 'pursuit-limit', cycle: 8 } };
  const calls = { ending: 0, state: 0, observe: 0, callable: [] };
  let currentIdentity = structuredClone(identity ?? originalEndingGm());
  const gm = {
    observe: async () => {
      calls.observe += 1;
      if (neverObserveAt.includes(calls.observe)) return new Promise(() => {});
      return structuredClone(currentIdentity);
    },
    callable: async (endpoint, payload) => {
      calls.callable.push({ endpoint, payload });
      if (neverSettles) return new Promise(() => {});
      const response = await (typeof reply === 'function' ? reply(endpoint, payload) : reply);
      if (identityAfterCallable) currentIdentity = structuredClone(identityAfterCallable);
      return response;
    },
  };
  const a = { state: async surface => {
    assert.equal(surface, gm); calls.state += 1;
    if (neverStateAt.includes(calls.state)) return new Promise(() => {});
    return structuredClone(states?.[Math.min(calls.state - 1, states.length - 1)] ?? publicState);
  } };
  const finalEnding = async suppliedContext => {
    assert.equal(suppliedContext, context); calls.ending += 1;
  };
  return { context, originalGm, publicState, calls,
    consume: () => consumeCapybaraEnding({ context, a, gm, finalEnding, originalGm, endingReadTimeoutMs: timeoutMs }) };
}

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

test('the ending consumer reads the original GM immutable debrief after the public session closes', async () => {
  const fixture = capybaraEndingFixture();
  assert.equal(fixture.publicState.debriefSnapshot, undefined,
    'The ordinary session projection does not carry the EndgameDialog private snapshot.');
  const { terminal } = await fixture.consume();

  assert.deepEqual(fixture.calls.callable, [{ endpoint: 'getSessionDebrief', payload: {
    sessionId: 'fresh-session', instanceId: 'gm-instance',
  } }]);
  assert.equal(fixture.calls.ending, 1, 'The real ending callback runs once and is never restarted to recover its receipt.');
  assert.equal(fixture.calls.state, 1);
  assert.equal(fixture.calls.observe, 1);
  assert.deepEqual(terminal, { status: 'closed', immutable: true, source: 'failure-review',
    result: 'failure', cause: 'pursuit-limit' });
  assert.equal(assessCapybaraGameplay({ context: fixture.context,
    stages: Object.fromEntries(CAPYBARA_REQUIRED_STAGES.map(id => [id, { status: 'completed' }])),
    coreGameplay: { status: 'passed', manualProgression: true, serverActions: true, missionDelivered: true },
    terminal }).status, 'passed');
  assert.equal(Object.hasOwn(terminal, 'snapshot'), false, 'The private snapshot remains local to the consumer.');
});

test('the ending consumer rejects an actor or GM instance switch while the immutable read is in flight', async () => {
  const identitySwitches = [
    { ...originalEndingGm(), sameActor: false },
    { ...originalEndingGm(), uidHash: 'replacement-gm-uid-hash' },
    { ...originalEndingGm(), instanceId: 'replacement-gm-instance' },
    { ...originalEndingGm(), gmInstanceOwned: false },
  ];
  for (const switchedIdentity of identitySwitches) {
    let creditedTerminal;
    const fixture = capybaraEndingFixture({ identityAfterCallable: switchedIdentity,
      reply: async () => {
        await new Promise(resolve => setTimeout(resolve, 5));
        return immutableFailureReply();
      }, timeoutMs: 100 });
    await assert.rejects(async () => { creditedTerminal = await fixture.consume(); });
    assert.equal(creditedTerminal, undefined, 'A stale GM response cannot credit the ending stage.');
    assert.equal(fixture.calls.ending, 1, 'The final ending callback is never restarted.');
    assert.equal(fixture.calls.observe, 2, 'Recheck the original actor and GM instance after the slow read.');
    assert.equal(fixture.calls.callable.length, 1);
  }
});

test('the ending consumer rejects a session or cycle change during the immutable read', async () => {
  for (const stateChange of [
    { sessionId: 'replacement-session' },
    { cycle: 9 },
    { phase: 'active' },
  ]) {
    const originalState = { sessionId: 'fresh-session', phase: 'closed', cycle: 8 };
    const changedState = { ...originalState, ...stateChange };
    const stateSequenceFixture = capybaraEndingFixture({ states: [originalState, changedState], timeoutMs: 100 });
    let creditedTerminal;
    await assert.rejects(async () => { creditedTerminal = await stateSequenceFixture.consume(); });
    assert.equal(creditedTerminal, undefined, 'A receipt cannot outlive its original terminal session and cycle.');
    assert.equal(stateSequenceFixture.calls.ending, 1);
    assert.equal(stateSequenceFixture.calls.state, 2, 'Recheck the terminal session after the slow read.');
    assert.equal(stateSequenceFixture.calls.callable.length, 1);
  }
});

test('the ending consumer rejects a changed original GM identity before its private read', async () => {
  for (const identity of [
    { ...originalEndingGm(), sameActor: false },
    { ...originalEndingGm(), uidHash: 'replacement-uid-hash' },
    { ...originalEndingGm(), sessionId: 'another-session' },
    { ...originalEndingGm(), instanceId: 'replacement-instance' },
    { ...originalEndingGm(), playerRole: 'player' },
    { ...originalEndingGm(), gmInstanceOwned: false },
  ]) {
    const fixture = capybaraEndingFixture({ identity });
    await assert.rejects(fixture.consume());
    assert.equal(fixture.calls.callable.length, 0);
    assert.equal(fixture.calls.ending, 1);
  }
});

test('the ending consumer rejects denied, wrong-session, wrong-cycle, and malformed GM debrief replies', async () => {
  const malformedReplies = [
    { status: 'denied', code: 'permission-denied' },
    { status: 'committed', result: { type: 'session-debrief', sessionId: 'other-session', snapshot: immutableFailureSnapshot() } },
    { status: 'committed', result: { type: 'session-debrief', sessionId: 'fresh-session',
      snapshot: { ...immutableFailureSnapshot(), cycle: 7 } } },
    { status: 'committed', result: { type: 'not-a-session-debrief', sessionId: 'fresh-session', snapshot: immutableFailureSnapshot() } },
    { status: 'committed', result: { type: 'session-debrief', sessionId: 'fresh-session',
      snapshot: { ...immutableFailureSnapshot(), version: 2 } } },
    { status: 'committed', result: { type: 'session-debrief', sessionId: 'fresh-session',
      snapshot: { ...immutableFailureSnapshot(), committedAt: undefined } } },
    { status: 'committed', result: { type: 'session-debrief', sessionId: 'fresh-session',
      snapshot: { ...immutableFailureSnapshot(), source: 'public-label-only' } } },
    { status: 'committed', result: { type: 'session-debrief', sessionId: 'fresh-session',
      snapshot: { ...immutableFailureSnapshot(), extraPublicField: 'not-in-contract' } } },
  ];
  for (const reply of malformedReplies) {
    const fixture = capybaraEndingFixture({ reply });
    await assert.rejects(fixture.consume());
    assert.equal(fixture.calls.ending, 1);
    assert.equal(fixture.calls.callable.length, 1);
    assert.equal(fixture.calls.callable[0].endpoint, 'getSessionDebrief');
  }
});

test('a public closed/debrief label or game outcome cannot stand in for the private immutable read', async () => {
  const publicOnly = { type: 'session-debrief', version: 1, source: 'failure-review',
    result: 'failure', cause: 'pursuit-limit' };
  const fixture = capybaraEndingFixture({ publicSnapshot: publicOnly, reply: { status: 'denied', code: 'permission-denied' } });
  await assert.rejects(fixture.consume());

  for (const status of ['debrief', 'closed']) {
    assert.equal(assessCapybaraGameplay({ context: fixture.context,
      stages: Object.fromEntries(CAPYBARA_REQUIRED_STAGES.map(id => [id, { status: 'completed' }])),
      coreGameplay: { status: 'passed', manualProgression: true, serverActions: true, missionDelivered: true },
      terminal: { status, source: 'failure-review', result: 'failure', cause: 'pursuit-limit', immutable: false },
    }).status, 'pending');
  }
  assert.equal(fixture.calls.ending, 1);
});

test('a never-settling private debrief read has a finite bound and does not restart the ending', async () => {
  const fixture = capybaraEndingFixture({ neverSettles: true, timeoutMs: 5 });
  await assert.rejects(fixture.consume(), /timed out/i);
  assert.equal(fixture.calls.ending, 1);
  assert.equal(fixture.calls.callable.length, 1);
  assert.equal(fixture.calls.callable[0].endpoint, 'getSessionDebrief');
});

test('state and original-GM observations share the finite ending-read deadline', async () => {
  for (const blocked of [
    { neverStateAt: [1] },
    { neverObserveAt: [1] },
    { neverObserveAt: [2] },
    { neverStateAt: [2] },
  ]) {
    const fixture = capybaraEndingFixture({ ...blocked, timeoutMs: 5 });
    let watchdog;
    try {
      await assert.rejects(Promise.race([
        fixture.consume(),
        new Promise((_, reject) => { watchdog = setTimeout(() => reject(new Error('test harness watchdog')), 100); }),
      ]), /Capybara GM debrief read timed out/i);
    } finally {
      clearTimeout(watchdog);
    }
    assert.equal(fixture.calls.ending, 1);
    assert.ok(fixture.calls.callable.length <= 1);
  }
});

test('a callable reply arriving after the finite deadline can never become accepted later', async () => {
  let resolveLateReply;
  let creditedTerminal;
  const fixture = capybaraEndingFixture({ reply: () => new Promise(resolve => { resolveLateReply = resolve; }), timeoutMs: 5 });
  await assert.rejects(async () => { creditedTerminal = await fixture.consume(); }, /timed out/i);
  resolveLateReply(immutableFailureReply());
  await new Promise(resolve => setTimeout(resolve, 10));
  assert.equal(creditedTerminal, undefined);
  assert.equal(fixture.calls.ending, 1);
  assert.equal(fixture.calls.callable.length, 1);
  assert.equal(fixture.calls.observe, 1, 'No continuation accepts a late reply after timeout.');
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


test('Macaw consent stage requires the real holder, distinct target player, three exact UI retries, and applied state', async () => {
  const proof = (roleId, uidHash, renderedStatus, revision) => ({ httpStatus: 200, exactReplay: true,
    actor: { roleId, uidHash, activeConsoleRoleId: roleId, connection: 'live', freshness: 'server' },
    projection: { gm: { sessionId: 'fresh-session', live: true, cycle: 2, revision },
      crew: { sessionId: 'fresh-session', live: true, cycle: 2, revision: revision - 1 }, renderedStatus } });
  const receiptSet = () => ({
    sessionId: 'fresh-session', cycle: 2,
    proposer: { roleId: 'capybara-captain', uidHash: 'captain-hash' },
    target: { roleId: 'dione-engineer', uidHash: 'dione-hash' },
    proposal: { status: 'proposed', sessionId: 'fresh-session', proposalId: 'proposal-secret', craftId: 'macaw',
      targetShipId: 'dione', targetConsoleId: 'engine-console-secret', targetRevision: 3, scrapGain: 1 },
    proposalProof: proof('capybara-captain', 'captain-hash', 'proposal-visible', 7),
    consent: { status: 'consented', consentStatus: 'granted', sessionId: 'fresh-session',
      proposalId: 'proposal-secret', consentId: 'consent-secret', targetRevision: 3 },
    consentProof: proof('dione-engineer', 'dione-hash', 'consent-visible', 8),
    consentInbox: { sessionId: 'fresh-session', targetShipId: 'dione', proposalId: 'proposal-secret',
      craftId: 'macaw', status: 'consented', consentId: 'consent-secret', targetRevision: 3, scrapGain: 1 },
    applied: { status: 'applied', sessionId: 'fresh-session', proposalId: 'proposal-secret',
      consentId: 'consent-secret', targetShipId: 'dione', targetConsoleId: 'engine-console-secret',
      targetRevision: 4, scrapGain: 1, scrapAfter: 2 },
    applyProof: proof('capybara-captain', 'captain-hash', 'applied-visible', 9),
    finalInbox: { sessionId: 'fresh-session', targetShipId: 'dione', proposalId: 'proposal-secret',
      craftId: 'macaw', status: 'applied', consentId: 'consent-secret', targetRevision: 3, scrapGain: 1, scrapAfter: 2 },
    before: { shipDamage: { dione: { damagedSystemIds: [] } }, shipResources: { capybara: { scrap: 1 } } },
    after: { shipDamage: { dione: { damagedSystemIds: ['engine-console-secret'] } }, shipResources: { capybara: { scrap: 2 } } },
  });
  const { macawDismantlingStageOutcome } = await import('./pc10-capybara-full-gameplay.mjs');
  const result = macawDismantlingStageOutcome(receiptSet());
  assert.deepEqual(result, { status: 'completed', roleId: 'capybara-captain',
    endpoint: 'permissioned Macaw proposal, consent, and apply', cycle: 2, sourceRevision: 9,
    cost: { resource: 'undamaged target console', amount: 1, result: '+1 Capybara Scrap after target approval' } });
  assert.equal(JSON.stringify(result).includes('proposal-secret'), false);
  assert.equal(JSON.stringify(result).includes('consent-secret'), false);
  assert.equal(JSON.stringify(result).includes('engine-console-secret'), false);
});

test('Macaw consent stage stays pending for absent replay, self-consent, stale projection, or missing server effect', async () => {
  const proof = (roleId, uidHash, renderedStatus, revision) => ({ httpStatus: 200, exactReplay: true,
    actor: { roleId, uidHash, activeConsoleRoleId: roleId, connection: 'live', freshness: 'server' },
    projection: { gm: { sessionId: 'fresh-session', live: true, cycle: 2, revision },
      crew: { sessionId: 'fresh-session', live: true, cycle: 2, revision: revision - 1 }, renderedStatus } });
  const valid = {
    sessionId: 'fresh-session', cycle: 2,
    proposer: { roleId: 'capybara-captain', uidHash: 'captain-hash' },
    target: { roleId: 'dione-engineer', uidHash: 'dione-hash' },
    proposal: { status: 'proposed', sessionId: 'fresh-session', proposalId: 'p', craftId: 'macaw', targetShipId: 'dione', targetConsoleId: 'reactor', targetRevision: 3, scrapGain: 1 },
    proposalProof: proof('capybara-captain', 'captain-hash', 'proposal-visible', 7),
    consent: { status: 'consented', consentStatus: 'granted', sessionId: 'fresh-session', proposalId: 'p', consentId: 'c', targetRevision: 3 },
    consentProof: proof('dione-engineer', 'dione-hash', 'consent-visible', 8),
    consentInbox: { sessionId: 'fresh-session', targetShipId: 'dione', proposalId: 'p', craftId: 'macaw', status: 'consented', consentId: 'c', targetRevision: 3, scrapGain: 1 },
    applied: { status: 'applied', sessionId: 'fresh-session', proposalId: 'p', consentId: 'c', targetShipId: 'dione', targetConsoleId: 'reactor', targetRevision: 4, scrapGain: 1, scrapAfter: 2 },
    applyProof: proof('capybara-captain', 'captain-hash', 'applied-visible', 9),
    finalInbox: { sessionId: 'fresh-session', targetShipId: 'dione', proposalId: 'p', craftId: 'macaw', status: 'applied', consentId: 'c', targetRevision: 3, scrapGain: 1, scrapAfter: 2 },
    before: { shipDamage: { dione: { damagedSystemIds: [] } }, shipResources: { capybara: { scrap: 1 } } },
    after: { shipDamage: { dione: { damagedSystemIds: ['reactor'] } }, shipResources: { capybara: { scrap: 2 } } },
  };
  const { macawDismantlingStageOutcome } = await import('./pc10-capybara-full-gameplay.mjs');
  const variants = [
    { proposalProof: { ...valid.proposalProof, exactReplay: false } },
    { consentProof: { ...valid.consentProof, actor: { ...valid.consentProof.actor, uidHash: 'captain-hash' } } },
    { target: { ...valid.target, uidHash: 'captain-hash' } },
    { applyProof: { ...valid.applyProof, projection: { ...valid.applyProof.projection, crew: { ...valid.applyProof.projection.crew, cycle: 1 } } } },
    { finalInbox: { ...valid.finalInbox, status: 'consented' } },
    { after: { ...valid.after, shipResources: { capybara: { scrap: 1 } } } },
    { after: { ...valid.after, shipDamage: { dione: { damagedSystemIds: [] } } } },
    { applied: { ...valid.applied, scrapGain: 2 } },
  ];
  for (const patch of variants) assert.equal(macawDismantlingStageOutcome({ ...valid, ...patch }).status, 'pending');
});
