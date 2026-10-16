import assert from 'node:assert/strict';
import { chooseBaseRangeAssignments, proofHash } from './pc10-base-combat-deduction-contracts.mjs';

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

/** One final same-document observation; never restore a lost draft or read the SDK again. */
export async function certifyBaseRangeTargetControls({ panel, view, assignments, expected,
  checkpoint, deadlineAt, record, now = Date.now }) {
  assert.equal(typeof checkpoint, 'function'); assert.equal(typeof record, 'function');
  assert.ok(Number.isFinite(deadlineAt));
  const budget = () => assert.ok(now() < deadlineAt, 'Keep the original target certificate decision deadline.');
  const check = async () => { budget(); await checkpoint(); budget(); };
  await check();
  assert.ok(view.type === 'wolf-range-action-choice-view' && view.choiceStatus === 'targets-required');
  assert.ok(expected?.attackId && view.sessionId === expected.sessionId && view.turn === expected.turn &&
    view.revision === expected.revision && view.currentStep === expected.currentStep && view.range === expected.currentStep,
  'The target certificate must use the original exact SDK choice and receipt source tuple.');
  assert.ok(JSON.stringify(assignments) === JSON.stringify(chooseBaseRangeAssignments(view)),
    'The target certificate must retain the exact original source target plan.');
  const fields = assignments.flatMap(assignment => {
    const action = view.eligibleActions.find(candidate => candidate.actionId === assignment.actionId);
    assert.ok(action?.range === view.range && labels[action.sourceId]);
    return assignment.contactIds.map((value, index) => ({ label: `${labels[action.sourceId]} hit ${index + 1}`, value }));
  });
  const options = [{ value: '', text: 'Choose a live contact', disabled: false },
    ...view.contacts.filter(contact => contact.available).map(contact => ({ value: contact.contactId,
      text: `${contact.contactId} — ${contact.targetShipId.replaceAll('-', ' ').toUpperCase()}`, disabled: false }))];
  await check();
  const paint = await panel.evaluate(root => {
    const text = node => node?.textContent?.replace(/\s+/g, ' ').trim() ?? null;
    const visible = node => {
      if (!node?.isConnected || node.getClientRects().length === 0) return false;
      for (let ancestor = node; ancestor; ancestor = ancestor.parentElement) {
        const style = window.getComputedStyle(ancestor);
        if (ancestor.hidden || ancestor.getAttribute('aria-hidden') === 'true' ||
            style.display === 'none' || style.visibility === 'hidden' || style.visibility === 'collapse') return false;
      }
      return true;
    };
    const deadlines = [...root.querySelectorAll('time')];
    const commits = [...root.querySelectorAll('button')].filter(node => text(node) === 'Commit target assignments');
    return { panelVisible: visible(root), panelLabel: root.getAttribute('aria-label'),
      cycle: text(root.querySelector('.eyebrow')), range: text(root.querySelector('h2')),
      status: text(root.querySelector('.wolf-range-action__status')), deadlineCount: deadlines.length,
      deadline: deadlines[0]?.getAttribute('datetime') ?? null, deadlineText: text(deadlines[0]),
      fields: [...root.querySelectorAll('select')].map(node => ({ label: node.getAttribute('aria-label'), value: node.value,
        visible: visible(node), enabled: !node.matches(':disabled'), multiple: node.multiple,
        selectedValues: [...node.selectedOptions].map(option => option.value),
        options: [...node.options].map(option => ({ value: option.value, text: text(option), disabled: option.disabled })) })),
      commitCount: commits.length, commitVisible: visible(commits[0]),
      commitEnabled: commits.length === 1 && !commits[0].matches(':disabled') };
  });
  await check();
  const observedFields = Array.from({ length: Math.max(fields.length, paint.fields.length) }, (_, index) => {
    const wanted = fields[index], observed = paint.fields[index];
    return { index, labelMatches: !!wanted && observed?.label === wanted.label,
      valueMatches: !!wanted && observed?.value === wanted.value,
      selectedValueMatches: !!wanted && observed?.multiple === false &&
        JSON.stringify(observed.selectedValues) === JSON.stringify([wanted.value]),
      optionsMatch: !!observed && JSON.stringify(observed.options) === JSON.stringify(options),
      visible: observed?.visible === true, enabled: observed?.enabled === true,
      expectedValueFingerprint: proofHash(wanted?.value ?? null), retainedValueFingerprint: proofHash(observed?.value ?? null),
      retainedOptionsFingerprint: proofHash(observed?.options ?? null), retainedOptionCount: observed?.options?.length ?? 0 };
  });
  const sourcePaintMatches = paint.panelVisible === true && paint.panelLabel === 'Wolf range actions' &&
    paint.cycle === `Cycle ${view.turn} // weapon control` && paint.range === view.range.replace('-range', ' range') &&
    paint.status === 'Target assignment' && paint.deadlineCount === 1 && paint.deadline === view.deadlineAt &&
    paint.deadlineText === view.deadlineAt;
  const matched = sourcePaintMatches && paint.fields.length === fields.length && observedFields.every(field =>
    field.labelMatches && field.valueMatches && field.selectedValueMatches && field.optionsMatch && field.visible && field.enabled) &&
    paint.commitCount === 1 && paint.commitVisible === true && paint.commitEnabled === true;
  // Only fingerprints/counts/flags leave the entitled in-memory source/DOM
  // comparison. The panel prints no revision: the SDK plus existing receipt
  // source/CAS fence supplies it; this observation grants no gameplay credit.
  const certificate = { stage: 'range target source and paint certificate', cycle: view.turn,
    revision: view.revision, currentStep: view.currentStep, range: view.range,
    sourceFingerprint: proofHash({ type: view.type, sessionId: view.sessionId, turn: view.turn, revision: view.revision,
      currentStep: view.currentStep, range: view.range, choiceStatus: view.choiceStatus, deadlineAt: view.deadlineAt,
      eligibleActions: view.eligibleActions, hitSlots: view.hitSlots, contacts: view.contacts }),
    attackFingerprint: proofHash(expected.attackId), assignmentsFingerprint: proofHash(assignments),
    expectedOptionsFingerprint: proofHash(options), expectedFieldCount: fields.length, retainedFieldCount: paint.fields.length,
    sourcePaintMatches, panelVisible: paint.panelVisible, commitCount: paint.commitCount,
    commitVisible: paint.commitVisible, commitEnabled: paint.commitEnabled, fields: observedFields,
    matched, diagnosticOnly: true, gameplayCredit: false,
    sourceBinding: 'Original entitled SDK tuple plus unchanged receipt source/CAS fence; this panel has no printed revision.' };
  await record(certificate);
  await check();
  assert.ok(matched, 'Final range target source and paint certificate failed; no lost draft restoration, retry or credit.');
  return certificate;
}
