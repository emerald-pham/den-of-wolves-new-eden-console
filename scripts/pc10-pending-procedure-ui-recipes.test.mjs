import assert from 'node:assert/strict';
import test from 'node:test';
import { CORE_CRAFT_PROCEDURES, GM_RULING_COUNTER_PROCEDURES } from './pc10-pending-procedure-ui-proof.mjs';
import { evaluateProcedureCapture } from './pc10-pending-procedure-ui-proof.mjs';
import { chooseOfferedAffordableOption, createPendingProcedureDefaultSteps } from './pc10-pending-procedure-ui-recipes.mjs';

// Reason: the finite recipe map must cover only the already-approved rows and
// choose actions from source-rendered, enabled options within their displayed
// live budget. Missing or malformed choices remain pending; no gameplay input
// is invented to make a recipe appear available.

test('default source-mounted recipes cover the existing finite procedure rows exactly', () => {
  const steps = createPendingProcedureDefaultSteps();
  const expected = [...CORE_CRAFT_PROCEDURES, ...GM_RULING_COUNTER_PROCEDURES]
    .map(row => row.id).sort();
  assert.deepEqual(Object.keys(steps).sort(), expected);
  for (const [caseId, recipe] of Object.entries(steps)) {
    assert.equal(typeof recipe, 'function', `${caseId} has a leaf recipe`);
  }
});

test('affordable option selection uses only current enabled source choices and the lowest real cost', () => {
  const option = chooseOfferedAffordableOption([
    { value: 'food', cost: 6, enabled: true, offered: true },
    { value: 'materials', cost: 3, enabled: true, offered: true },
    { value: 'fuel', cost: 1, enabled: false, offered: true },
    { value: 'hidden', cost: 0, enabled: true, offered: false },
    { value: 'unknown', cost: Number.NaN, enabled: true, offered: true },
  ], 4);
  assert.deepEqual(option, { value: 'materials', cost: 3, enabled: true, offered: true });
  assert.equal(chooseOfferedAffordableOption([
    { value: 'food', cost: 6, enabled: true, offered: true },
  ], 5), null, 'An unaffordable choice stays unavailable.');
  assert.equal(chooseOfferedAffordableOption([
    { value: 'fuel', cost: 1, enabled: false, offered: true },
  ], 20), null, 'A disabled choice is never selected.');
});

test('Boa recycling checkpoint matches the mounted Coordination-only procedure', () => {
  const recycle = CORE_CRAFT_PROCEDURES.find(row => row.endpoint === 'recycleWithBoa');
  assert.equal(recycle?.checkpoint, 'coordination');
});

test('Boa mission choice receipt binds its choice revision to the current rendered workspace', () => {
  const actor = { uidHash: 'recycler-hash', sessionId: 'session-1', profileRoleId: 'capybara-recycler',
    activeConsoleRoleId: 'capybara-recycler', sameActor: true, connection: 'live', freshness: 'server' };
  const result = evaluateProcedureCapture({ caseId: 'core:chooseBoaMissionReclamationOpportunity',
    expected: { sessionId: 'session-1', uidHash: 'recycler-hash', roleId: 'capybara-recycler', cycle: 2,
      sourceRevision: 7, groupId: 'fleet-1' }, offered: true, mountedUi: true,
    actorBefore: actor, actorAfter: actor,
    sourceBefore: { live: true, sessionId: 'session-1', cycle: 2, revision: 7, groupId: 'fleet-1' },
    sourceAfter: { live: true, sessionId: 'session-1', cycle: 2, revision: 8, groupId: 'fleet-1' },
    request: { sessionId: 'session-1', requestId: 'choice-1', expectedCycle: 2, expectedControlRevision: 4,
      expectedChoiceRevision: 7, missionOpportunityId: 'mission-1', taskOpportunityId: 'A-1' },
    response: { httpStatus: 200, result: { status: 'committed', choiceRevision: 8 }, exactReplay: true },
    replay: { result: { status: 'replayed', choiceRevision: 8 } },
    rendered: { visible: true, resultStatus: 'committed' }, cost: null, consent: null });
  assert.equal(result.status, 'completed');
  assert.equal(result.revision, 8);
});
