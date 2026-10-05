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
