import assert from 'node:assert/strict';
import test from 'node:test';
import * as proof from './pc10-extra-role-proof-helpers.mjs';

test('the pre-start scenario callback is awaited on the original authenticated table', async () => {
  assert.equal(typeof proof.completeBeforeStart, 'function');
  const context = { gm: { label: 'real GM' }, crew: { label: 'real crew' }, initial: { sessionId: 'fresh' } };
  const events = [];
  let release;
  const held = new Promise(resolve => { release = resolve; });
  const pending = proof.completeBeforeStart(context, async received => {
    assert.equal(received, context);
    events.push('host-choice-started');
    await held;
    events.push('host-choice-finished');
  }, async () => events.push('normal-ui-start'));
  await Promise.resolve();
  assert.deepEqual(events, ['host-choice-started']);
  release();
  await pending;
  assert.deepEqual(events, ['host-choice-started', 'host-choice-finished', 'normal-ui-start']);
});

test('a failed genuine pre-start choice prohibits a start or success receipt', async () => {
  assert.equal(typeof proof.completeBeforeStart, 'function');
  let started = false;
  await assert.rejects(proof.completeBeforeStart({}, async () => {
    throw Error('actual starting host denial');
  }, async () => { started = true; }), /actual starting host denial/);
  assert.equal(started, false);
});

test('the existing driver start works identically when no scenario callback is supplied', async () => {
  assert.equal(typeof proof.completeBeforeStart, 'function');
  let starts = 0;
  await proof.completeBeforeStart({}, undefined, async () => { starts++; });
  assert.equal(starts, 1);
});

test('ration choices use the actual visible costs and current stores rather than assuming Normal is affordable', () => {
  assert.equal(typeof proof.chooseAffordableRation, 'function');
  const options = [
    { value: '0', text: 'None // 0 // +0' }, { value: '1', text: 'Minimal // 2 // +3' },
    { value: '2', text: 'Short // 4 // +6' }, { value: '3', text: 'Normal // 6 // +9' },
  ];
  assert.equal(proof.chooseAffordableRation(options, 5), '2');
  assert.equal(proof.chooseAffordableRation(options, 6), '3');
  assert.equal(proof.chooseAffordableRation(options, 0), '0');
  assert.throws(() => proof.chooseAffordableRation(options, undefined), /current stores/i);
  assert.throws(() => proof.chooseAffordableRation(options, -1), /current stores/i);
  assert.throws(() => proof.chooseAffordableRation([{ value: '3', text: 'Normal // 6 // +9' }], 5), /affordable/i);
});

test('maintenance proof waits for the normal end reset and current-cycle completion receipt', () => {
  assert.equal(typeof proof.isCompletedMaintenanceForCycle, 'function');
  const completed = { turn: 1, step: 0, completedAt: '2026-10-05T09:24:48.910Z',
    results: { '7': 'Maintenance cycle complete.' } };
  assert.equal(proof.isCompletedMaintenanceForCycle(completed, 1), true);
  assert.equal(proof.isCompletedMaintenanceForCycle({ ...completed, step: 7 }, 1), false);
  assert.equal(proof.isCompletedMaintenanceForCycle({ ...completed, completedAt: undefined }, 1), false);
  assert.equal(proof.isCompletedMaintenanceForCycle({ ...completed, completedAt: 'invalid' }, 1), false);
  assert.equal(proof.isCompletedMaintenanceForCycle({ ...completed, results: {} }, 1), false);
  assert.equal(proof.isCompletedMaintenanceForCycle(completed, 2), false);
  assert.equal(proof.isCompletedMaintenanceForCycle(undefined, 1), false);
});

test('replacement planning binds eleven distinct original actors to the ordinary eighteen-role source roster', () => {
  assert.equal(typeof proof.extraRoleScenario, 'function');
  const joint = proof.extraRoleScenario('joint');
  const replacements = proof.extraRoleScenario('replacements');
  assert.equal(joint.playerCount, 8);
  assert.equal(replacements.playerCount, 18);
  assert.equal(replacements.actors.length, 11);
  assert.equal(new Set(replacements.actors.map(actor => actor.anchorRoleId)).size, 11);
  assert.equal(new Set(replacements.actors.map(actor => actor.roleId)).size, 11);
  assert.deepEqual(new Set(replacements.actors.map(actor => actor.roleId)), new Set([
    'wolf-commander', 'comms-officer', 'vip-host', 'commissar', 'rosal-militia-leader',
    'doctor', 'pdf-fighter-ace', 'gorgoneion-captain', 'capybara-small-captain',
    'warrior-captain', 'vulcan-captain',
  ]));
  assert.throws(() => proof.extraRoleScenario('invented'), /scenario/i);
});

test('a replacement action requires the original ordinary UID and current station, never the anchor station', () => {
  assert.equal(typeof proof.assertExtraActor, 'function');
  const expected = { sessionId: 'fresh', anchorRoleId: 'executive-officer', roleId: 'wolf-commander', uidHash: 'original' };
  const observed = { sessionId: 'fresh', profileRoleId: 'executive-officer', uidHash: 'original',
    sameActor: true, playerRole: 'player', connection: 'live', freshness: 'server',
    briefRoleId: 'wolf-commander', briefMatchesActor: true, pendingCommandCount: 0 };
  const station = { sessionId: 'fresh', assignedRoleId: 'executive-officer',
    replacementRoleId: 'wolf-commander', activeConsoleRoleId: null, seatId: null };
  proof.assertExtraActor(observed, station, expected);
  for (const wrong of [{ ...observed, uidHash: 'replacement-account' },
    { ...observed, profileRoleId: 'wolf-commander' }, { ...observed, freshness: 'cache' },
    { ...observed, briefRoleId: 'executive-officer' }, { ...observed, briefMatchesActor: false },
    { ...observed, pendingCommandCount: 1 }])
    assert.throws(() => proof.assertExtraActor(wrong, station, expected));
  for (const wrong of [{ ...station, replacementRoleId: null },
    { ...station, activeConsoleRoleId: 'executive-officer' }, { ...station, seatId: 'old-seat' }])
    assert.throws(() => proof.assertExtraActor(observed, wrong, expected));
});

test('the action-level matrix never promotes a surface visit, conditional absence or physical VIP assertion to execution', () => {
  assert.equal(typeof proof.createExtraRoleMatrix, 'function');
  assert.equal(typeof proof.recordExtraRoleResult, 'function');
  assert.equal(typeof proof.extraRoleCoverage, 'function');
  const matrix = proof.createExtraRoleMatrix('replacements');
  const physical = matrix.find(row => row.id === 'vip-host:physical-visit');
  assert.ok(physical && physical.physicalFactRequired);
  assert.ok(matrix.every(row => row.status === 'pending'));
  assert.equal(proof.extraRoleCoverage(matrix).everyRoleFunctionComplete, false);
  proof.recordExtraRoleResult(matrix, physical.id, { status: 'blocked', blocker: 'No physical visitor exists.', nextActor: 'Physical VIP Host and witnessing facilitator' });
  assert.throws(() => proof.recordExtraRoleResult(matrix, physical.id, {
    status: 'committed', receipt: { httpStatus: 200, identityVerified: true, requestId: 'invented' },
  }), /physical/i);
  const dial = matrix.find(row => row.id === 'wolf-commander:cycle-dial');
  proof.recordExtraRoleResult(matrix, dial.id, { status: 'blocked', blocker: 'Current restricted Team window closed.', nextActor: 'GM: advance a genuine cycle' });
  assert.equal(proof.extraRoleCoverage(matrix).everyRoleFunctionComplete, false);
  assert.throws(() => proof.recordExtraRoleResult(matrix, dial.id, { status: 'committed', receipt: { httpStatus: 403, identityVerified: true } }));
  assert.throws(() => proof.recordExtraRoleResult(matrix, dial.id, { status: 'committed', receipt: { httpStatus: 200, identityVerified: false } }));
  proof.recordExtraRoleResult(matrix, dial.id, { status: 'committed', receipt: {
    httpStatus: 200, identityVerified: true, requestId: 'actual', endpoint: 'commitWolfCommanderAttackDial', transport: 'ordinary-ui',
  } });
  assert.equal(proof.extraRoleCoverage(matrix).committed, 1);
});

test('every replacement has explicit eligibility, assignment and procedure rows, including source-unavailable paths', () => {
  assert.equal(typeof proof.extraRoleScenario, 'function');
  assert.equal(typeof proof.createExtraRoleMatrix, 'function');
  const matrix = proof.createExtraRoleMatrix('replacements');
  for (const actor of proof.extraRoleScenario('replacements').actors) {
    const rows = matrix.filter(row => row.roleId === actor.roleId);
    assert.ok(rows.some(row => row.endpoint === 'setReplacementEligibility'));
    assert.ok(rows.some(row => row.endpoint === 'assignReplacementRole'));
    assert.ok(rows.some(row => row.id !== `${actor.roleId}:eligibility` && row.id !== `${actor.roleId}:assignment`));
    assert.ok(rows.every(row => row.source && row.prerequisite && row.nextActor));
  }
  assert.ok(matrix.find(row => row.id === 'warrior-captain:jump-drive').unavailableReason);
  assert.ok(matrix.find(row => row.id === 'vulcan-captain:laser-cannon').unavailableReason);
});

test('small-ship ration selection uses the mounted single-cost format without inventing stores', () => {
  assert.equal(typeof proof.choosePrintedRation, 'function');
  const choices = [{ value: '0', text: 'None // 0' }, { value: '1', text: 'Minimal // 3' },
    { value: '2', text: 'Short // 5' }, { value: '3', text: 'Normal // 8' }];
  assert.equal(proof.choosePrintedRation(choices, 6), '2');
  assert.equal(proof.choosePrintedRation(choices, 8), '3');
  assert.throws(() => proof.choosePrintedRation(choices, undefined), /stores/i);
  assert.throws(() => proof.choosePrintedRation([{ value: '0', text: 'None' }], 0), /cost/i);
});
