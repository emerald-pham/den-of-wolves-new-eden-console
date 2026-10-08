import { createHash } from 'node:crypto';

const fingerprint = value => createHash('sha256').update(JSON.stringify(value ?? null)).digest('hex');

/** Hash only the tuple already captured synchronously by the original observer. */
export function summarizeWolfTargetDiagnosticSample(sample) {
  if (!sample) return { diagnosticSampleAvailable: false, reactFormKeyObserved: false, continuousMountObserved: false };
  const { dom } = sample;
  return {
    diagnosticSampleAvailable: true,
    sampleWallClockMs: sample.wallClockMs, sampleMonotonicMs: sample.monotonicMs,
    documentTimeOrigin: sample.documentTimeOrigin,
    controllerAuthorityInputFingerprint: fingerprint(sample.controllerAuthorityInput),
    memberFingerprint: fingerprint(sample.member), phaseFingerprint: fingerprint(sample.phase),
    discoveryFingerprint: fingerprint(sample.discovery), craftFingerprint: fingerprint(sample.craft),
    berthFingerprint: fingerprint(sample.berth), memberScopeFingerprint: fingerprint(sample.memberScope),
    discoveryState: sample.discovery.state, berthState: sample.berth.state, memberScopeState: sample.memberScope.state,
    domFormFingerprint: fingerprint(dom.panels.map(panel => ({ label: panel.label, cycle: panel.cycle,
      range: panel.range, status: panel.status, deadlines: panel.deadlines,
      fields: panel.fields.map(field => ({ label: field.label, multiple: field.multiple, options: field.options })) }))),
    dom: { available: dom.available, visibilityAvailable: dom.visibilityAvailable, panelCount: dom.panels.length,
      visiblePanelCount: dom.panels.filter(panel => panel.visible).length,
      fieldCount: dom.panels.reduce((count, panel) => count + panel.fields.length, 0),
      fields: dom.panels.flatMap((panel, panelIndex) => panel.fields.map((field, index) => ({ panelIndex, index,
        connected: field.connected, visible: field.visible, enabled: field.enabled, multiple: field.multiple,
        labelFingerprint: fingerprint(field.label), valueFingerprint: fingerprint(field.value),
        selectedValuesFingerprint: fingerprint(field.selectedValues), optionsFingerprint: fingerprint(field.options),
        optionCount: field.options.length }))),
      commitCount: dom.panels.reduce((count, panel) => count + panel.commits.length, 0),
      commitVisible: dom.panels.length === 1 && dom.panels[0].commits.length === 1 && dom.panels[0].commits[0].visible,
      commitEnabled: dom.panels.length === 1 && dom.panels[0].commits.length === 1 && dom.panels[0].commits[0].enabled },
    // These are sampled inputs/paint, never a claim about mounted hook state.
    currentAuthInStoreSampleObserved: false, reactFormKeyObserved: false, continuousMountObserved: false,
  };
}

/** A diagnostic batch shares only safe rows with the existing report saves. */
export function createWolfTargetDiagnosticBuffer({ view, expected, originalActor, deadlineAt }) {
  const row = { stage: 'range target checkpoint diagnostics', diagnosticOnly: true, gameplayCredit: false,
    originalDeadlineAt: deadlineAt,
    originalActorFingerprint: fingerprint(originalActor), originalAttackFingerprint: fingerprint(expected),
    originalSDKSourceFingerprint: fingerprint(view),
    // Exact current production rangeDraftKey fields. This binds the original
    // already-read SDK form, not the controller's later private React formKey.
    originalSDKFormFingerprint: fingerprint([
      view.sessionId, view.turn, view.revision, view.currentStep, view.range, view.choiceStatus,
      view.eligibleActions.map(({ actionId, sourceId, range }) => [actionId, sourceId, range]),
      view.hitSlots.map(({ actionId, count, damagePerHit }) => [actionId, count, damagePerHit]),
      view.contacts.map(({ contactId, targetShipId, available, requiredCoverageDamage }) =>
        [contactId, targetShipId, available, requiredCoverageDamage]),
    ]),
    reactFormKeyObserved: false, continuousMountObserved: false, samples: [],
  };
  let attached = false;
  return {
    capture: checkpointStage => sample => row.samples.push({ checkpointOrdinal: row.samples.length + 1,
      checkpointStage, ...sample }),
    attach: observations => {
      if (!attached && row.samples.length) { observations.push(row); attached = true; }
    },
  };
}
