import assert from 'node:assert/strict';
import { chooseBaseRangeAssignments } from './pc10-base-combat-deduction-contracts.mjs';

const labels = Object.freeze({
  'aegis-missile-launchers': 'Missile launchers', 'aegis-point-defence-lasers': 'Point-defence lasers',
  'aegis-alpha-wing': 'Alpha Fighter Wing', 'aegis-bravo-wing': 'Bravo Fighter Wing',
  highwall: 'Highwall Cannon', 'gorgoneion-missile-array': 'Gorgoneion Missile Array',
  boa: 'Boa Scrap Strike', 'pdf-escort-wing': 'PDF Escort Wing', maliades: 'Maliades',
});

/** Bind every rendered target field to the actual current hit-slot sequence. */
export async function selectBaseRangeTargetControls({ panel, view, checkpoint, deadlineAt, now = Date.now }) {
  assert.equal(typeof checkpoint, 'function');
  assert.ok(Number.isFinite(deadlineAt));
  const budget = () => assert.ok(now() < deadlineAt, 'Keep the original combat decision deadline.');
  const check = async () => { budget(); await checkpoint(); budget(); };
  await check();
  const assignments = chooseBaseRangeAssignments(view);
  const expected = [];
  for (const assignment of assignments) {
    const source = view.eligibleActions.find(action => action.actionId === assignment.actionId)?.sourceId;
    assert.ok(labels[source], 'Only an actual entitled source label can select these targets.');
    for (let index = 0; index < assignment.contactIds.length; index++) expected.push({
      label: `${labels[source]} hit ${index + 1}`, value: assignment.contactIds[index],
    });
  }
  const controls = await panel.getByRole('combobox').all();
  await check();
  assert.equal(controls.length, expected.length, 'The complete rendered target field count must match the current source slots.');
  for (let index = 0; index < expected.length; index++) {
    await check();
    const control = controls[index], choice = expected[index];
    assert.equal(await control.getAttribute('aria-label'), choice.label, 'The rendered field order must match its current source hit label.');
    assert.equal(await control.isVisible(), true); assert.equal(await control.isEnabled(), true);
    const offered = await control.locator('option').evaluateAll(nodes => nodes
      .filter(node => node.value && !node.disabled).map(node => node.value));
    assert.ok(offered.includes(choice.value), 'Only the current enabled opaque contact may be selected.');
    await check();
    await control.selectOption(choice.value);
    await check();
  }
  return assignments;
}
