import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { inspectWolfChoicePaint } from './pc10-combat-choice-readiness.mjs';

const rangeGuidance = 'No automatic pass is applied at the deadline. Reconnect to make the current choice.';
const receiptGuidance = 'Choice committed to the server. Reconnecting will restore the current step.';

function view(choiceStatus = 'pending') {
  return { type: 'wolf-range-action-choice-view', sessionId: 'original-session',
    turn: 1, revision: 8, currentStep: 'long-range', range: 'long-range', choiceStatus,
    deadlineAt: '2026-10-05T19:00:00.000Z', eligibleActions: [], hitSlots: [], contacts: [] };
}

function page(text, enabledButtons = []) {
  const button = name => ({ isVisible: async () => enabledButtons.includes(name),
    isEnabled: async () => enabledButtons.includes(name) });
  const panel = { isVisible: async () => true, innerText: async () => text,
    getByRole: (role, options = {}) => role === 'combobox'
      ? { count: async () => 0, first: () => ({ isEnabled: async () => false }) }
      : button(options.name) };
  return { getByRole: () => panel };
}

test('ordinary range recovery guidance does not hide an enabled current pass', async () => {
  const actualSource = await readFile(new URL('../src/components/WolfRangeActionPanel.tsx', import.meta.url), 'utf8');
  assert.ok(actualSource.includes(rangeGuidance), 'Bind the regression to the actual mounted recovery copy.');
  const painted = await inspectWolfChoicePaint(page(
    `Cycle 1 // weapon control Long range Choice required ${rangeGuidance}`, ['Pass this range']),
  { kind: 'range-actions' }, view());
  assert.equal(painted.status, 'eligible');
});

test('the normal stored-choice recovery notice does not hide zero-hit target commitment', async () => {
  const actualSource = await readFile(new URL('../src/components/WolfRangeActionPanel.tsx', import.meta.url), 'utf8');
  assert.ok(actualSource.includes(receiptGuidance), 'Bind the regression to the actual mutation success copy.');
  const painted = await inspectWolfChoicePaint(page(
    `Cycle 1 // weapon control Long range Target assignment Dice are already locked by the server. ${receiptGuidance}`,
    ['Commit target assignments']), { kind: 'range-actions' }, view('targets-required'));
  assert.equal(painted.status, 'eligible');
});

test('current checking remains pending beside ordinary recovery guidance', async () => {
  const painted = await inspectWolfChoicePaint(page(
    `Cycle 1 // weapon control Checking the current server attack step… ${rangeGuidance}`, ['Pass this range']),
  { kind: 'range-actions' }, view());
  assert.equal(painted.status, 'pending');
});

test('an actual authority reconnect blocker remains pending', async () => {
  const painted = await inspectWolfChoicePaint(page(
    'Cycle 1 // weapon control Reconnect to current Executive Officer authority before choosing.', ['Pass this range']),
  { kind: 'range-actions' }, view());
  assert.equal(painted.status, 'pending');
});

test('recovery guidance never enables a missing or disabled choice', async () => {
  const painted = await inspectWolfChoicePaint(page(
    `Cycle 1 // weapon control ${rangeGuidance}`), { kind: 'range-actions' }, view());
  assert.equal(painted.status, 'pending');
});

test('the range guidance exception does not exempt another actor panel', async () => {
  const painted = await inspectWolfChoicePaint(page(
    `Cycle 1 // Rev 8 ${rangeGuidance}`, ['Pass Command and Control']),
  { kind: 'command-and-control' }, { ...view(), type: 'aegis-command-and-control-view' });
  assert.equal(painted.status, 'pending');
});
