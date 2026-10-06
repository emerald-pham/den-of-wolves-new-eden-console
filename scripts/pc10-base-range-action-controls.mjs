import assert from 'node:assert/strict';
import { proofHash } from './pc10-base-combat-deduction-contracts.mjs';

const actionLabel = sourceId => ({ 'aegis-missile-launchers': 'Missile launchers',
  'aegis-point-defence-lasers': 'Point-defence lasers', 'aegis-alpha-wing': 'Alpha Fighter Wing',
  'aegis-bravo-wing': 'Bravo Fighter Wing' }[sourceId] ?? sourceId.replaceAll('-', ' '));

/** Retain only the original entitled pending view's actual offered opaque IDs. */
export function baseRangeActionIds(view, expected) {
  assert.equal(view?.type, 'wolf-range-action-choice-view'); assert.equal(view.choiceStatus, 'pending');
  assert.ok(typeof expected?.attackId === 'string' && expected.attackId && expected.status === 'declared' &&
    typeof expected.sessionId === 'string' && expected.sessionId && Number.isSafeInteger(expected.turn) && expected.turn >= 1 &&
    Number.isSafeInteger(expected.revision) && expected.revision >= 1);
  for (const key of ['sessionId', 'turn', 'revision', 'currentStep'])
    assert.equal(view[key], expected[key], `Original pending range action ${key} changed.`);
  assert.ok(['long-range', 'medium-range', 'short-range'].includes(view.range));
  assert.equal(view.range, expected.currentStep);
  assert.ok(typeof view.deadlineAt === 'string' && Number.isFinite(Date.parse(view.deadlineAt)));
  assert.ok(Array.isArray(view.eligibleActions) && Array.isArray(view.hitSlots) && view.hitSlots.length === 0);
  assert.ok(view.eligibleActions.every(action => action && typeof action.actionId === 'string' && action.actionId &&
    typeof action.sourceId === 'string' && action.sourceId && action.range === view.range));
  assert.equal(new Set(view.eligibleActions.map(({ actionId }) => actionId)).size, view.eligibleActions.length);
  // This is the actual panel's selectableActions predicate. Fighter/support
  // choices remain with their original actors; no action ID is synthesized.
  return view.eligibleActions.filter(({ sourceId }) => sourceId.startsWith('aegis-')).map(({ actionId }) => actionId);
}

/** Select once after receipt checkpoints, then certify the current controlled form. */
export async function selectAndCertifyBaseRangeActionControls({ panel, view, expected, deadlineAt,
  checkpoint, record = () => {} }) {
  const actionIds = baseRangeActionIds(view, expected);
  const labels = view.eligibleActions.filter(({ actionId }) => actionIds.includes(actionId)).map(({ sourceId }) => actionLabel(sourceId));
  const budget = () => assert.ok(Number.isFinite(deadlineAt) && Date.now() < deadlineAt,
    'Keep the original range action decision deadline.');
  const check = async () => { budget(); await checkpoint(); budget(); };
  const observe = () => panel.evaluate(element => {
    const visible = node => {
      if (!node?.isConnected || node.getClientRects().length === 0) return false;
      for (let current = node; current; current = current.parentElement) {
        const style = getComputedStyle(current);
        if (current.hidden || current.getAttribute('aria-hidden') === 'true' ||
            style.display === 'none' || style.visibility === 'hidden' || style.visibility === 'collapse') return false;
      }
      return true;
    };
    const text = node => visible(node) ? node.textContent?.replace(/\s+/g, ' ').trim() ?? null : null;
    const field = selector => {
      const nodes = element.querySelectorAll(selector);
      return nodes.length === 1 ? text(nodes[0]) : null;
    };
    const times = element.querySelectorAll('.wolf-range-action__deadline time');
    const groups = element.querySelectorAll('.wolf-range-action__choices');
    const buttons = [...element.querySelectorAll('button')];
    const button = name => {
      const nodes = buttons.filter(node => node.textContent?.trim() === name);
      return { count: nodes.length, visible: nodes.length === 1 && visible(nodes[0]),
        enabled: nodes.length === 1 && !nodes[0].matches(':disabled') };
    };
    return { panelLabel: element.getAttribute('aria-label'), panelVisible: visible(element),
      panelCount: element.ownerDocument.querySelectorAll('[aria-label="Wolf range actions"]').length,
      cycle: field('.wolf-range-action__header .eyebrow'), range: field('.wolf-range-action__header h2'),
      status: field('.wolf-range-action__status'), deadlineCount: times.length,
      deadline: times.length === 1 ? times[0].getAttribute('datetime') : null,
      deadlineText: times.length === 1 ? text(times[0]) : null,
      choicesCount: groups.length, choicesVisible: groups.length === 1 && visible(groups[0]),
      choicesEnabled: groups.length === 1 && !groups[0].matches(':disabled'),
      legend: field('.wolf-range-action__choices > legend'),
      checkboxCount: element.querySelectorAll('input[type="checkbox"]').length,
      inputCount: element.querySelectorAll('input').length, selectCount: element.querySelectorAll('select').length,
      fields: [...element.querySelectorAll('.wolf-range-action__choice')].map(row => {
        const boxes = row.querySelectorAll('input[type="checkbox"]'), spans = row.querySelectorAll(':scope > span');
        return { inputCount: boxes.length, label: spans.length === 1 ? text(spans[0]) : null,
          visible: visible(row) && boxes.length === 1 && visible(boxes[0]),
          enabled: boxes.length === 1 && !boxes[0].matches(':disabled'),
          checked: boxes.length === 1 && boxes[0].checked === true };
      }), buttonCount: buttons.length, use: button('Use selected actions'), pass: button('Pass this range') };
  });
  const compare = (paint, selected) => {
    const fields = paint.fields.map((field, index) => ({ labelMatches: field.label === labels[index],
      uniqueInput: field.inputCount === 1, visible: field.visible, enabled: field.enabled, checked: field.checked }));
    const sourcePaintMatches = paint.panelLabel === 'Wolf range actions' && paint.panelVisible === true && paint.panelCount === 1 &&
      paint.cycle === `Cycle ${view.turn} // weapon control` && paint.range === view.range.replace('-range', ' range') &&
      paint.status === 'Choice required' && paint.deadlineCount === 1 && paint.deadline === view.deadlineAt && paint.deadlineText === view.deadlineAt;
    const controlsMatch = paint.checkboxCount === labels.length && paint.inputCount === labels.length &&
      paint.fields.length === labels.length && paint.selectCount === 0 && fields.every(field =>
        field.labelMatches && field.uniqueInput && field.visible && field.enabled) &&
      paint.choicesCount === (labels.length ? 1 : 0) && (!labels.length ||
        paint.choicesVisible && paint.choicesEnabled && paint.legend === 'Available range actions') &&
      paint.buttonCount === 2 && paint.use.count === 1 && paint.use.visible &&
      paint.pass.count === 1 && paint.pass.visible && paint.pass.enabled;
    const selectionMatches = fields.every(field => field.checked) && paint.use.enabled === (labels.length > 0);
    return { fields, sourcePaintMatches, matched: sourcePaintMatches && controlsMatch && (!selected || selectionMatches) };
  };
  const retain = async (paint, comparison, formReadCount) => {
    const certificate = { stage: 'range action source and paint certificate', cycle: view.turn, revision: view.revision,
      currentStep: view.currentStep, range: view.range, sourceFingerprint: proofHash(view), attackFingerprint: proofHash(expected.attackId),
      actionIdsFingerprint: proofHash(actionIds), expectedFieldCount: labels.length, retainedFieldCount: paint.fields.length,
      checkboxCount: paint.checkboxCount, checkedCount: paint.fields.filter(field => field.checked).length,
      sourcePaintMatches: comparison.sourcePaintMatches, panelVisible: paint.panelVisible, panelCount: paint.panelCount,
      useCount: paint.use.count, useVisible: paint.use.visible, useEnabled: paint.use.enabled,
      passCount: paint.pass.count, passVisible: paint.pass.visible, passEnabled: paint.pass.enabled,
      fields: comparison.fields, matched: comparison.matched, formReadCount,
      diagnosticOnly: true, gameplayCredit: false, actionCredit: false, acceptanceCredit: false,
      sourceBinding: 'Original entitled SDK view and unchanged source/CAS receipt with exact actionIds; the panel prints no action ID or revision.' };
    await record(certificate); await check();
    assert.ok(comparison.matched, 'Final range action source and paint certificate failed; no restoration, retry or fallback Pass.');
    return certificate;
  };
  await check();
  assert.equal(await panel.count(), 1, 'The final range action certificate requires one original current panel.');
  const before = await observe(), beforeMatch = compare(before, false);
  if (!beforeMatch.matched) return retain(before, beforeMatch, 1);
  await check();
  const boxes = await panel.getByRole('checkbox').all();
  assert.equal(boxes.length, labels.length, 'The final range action certificate requires the exact originally offered control count.');
  for (const box of boxes) {
    await check();
    const remainingMs = deadlineAt - Date.now(); budget();
    await box.check({ timeout: Math.min(35_000, remainingMs) });
  }
  await check();
  const final = await observe();
  return retain(final, compare(final, true), 2);
}
