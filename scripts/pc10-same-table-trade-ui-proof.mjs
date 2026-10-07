import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { observeUiReceipt } from './pc10-browser-ui-receipt.mjs';
import { createTwoBrowserGameplay as createDefaultTwoBrowserGameplay } from './pc10-two-browser-gameplay.mjs';

export const SAME_TABLE_TRADE_UI_RESOURCES = Object.freeze([
  Object.freeze({ id: 'ore', label: 'Ore' }),
  Object.freeze({ id: 'fuel', label: 'Fuel' }),
  Object.freeze({ id: 'food', label: 'Food' }),
  Object.freeze({ id: 'water', label: 'Water' }),
  Object.freeze({ id: 'materials', label: 'Materials' }),
  Object.freeze({ id: 'securityTeams', label: 'Security Teams' }),
]);

const MAX_WAIT_MS = 60_000;
const MAX_COUNTERPARTY_SELECTOR_WAIT_MS = 35_000;
const COUNTERPARTY_SELECTOR_POLL_MS = 250;
const BASELINE_FORM = 'Physical tabletop baseline';
const BASELINE_CONTROL = 'Record tabletop counts';
const SAME_TABLE_PANEL = 'Same-table trade';
const BASELINE_DISCLOSURE = 'Virtual training only: the facilitator-selected counts below are scenario choices entered through the ordinary baseline UI. No physical tokens were observed and this is not human tabletop proof.';

function digest(value) {
  return createHash('sha256').update(JSON.stringify(value ?? null)).digest('hex');
}

/** Keep the UI's original-player identity check in one native-testable seam. */
export function selectionMatchesOriginalIdentity(selectedUid, actorIdentity) {
  return typeof selectedUid === 'string' && typeof actorIdentity?.uid === 'string' &&
    selectedUid === actorIdentity.uid;
}

function identity(value) {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= 128;
}

function record(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function exactKeys(value, expected) {
  return record(value) && Object.keys(value).length === expected.length &&
    expected.every((key) => Object.hasOwn(value, key));
}

function requireSame(actual, expected, message) {
  if (actual !== expected) throw new Error(message);
}

function requireSameShape(actual, expected, message) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(message);
}

function checkedBalances(value, label) {
  const keys = SAME_TABLE_TRADE_UI_RESOURCES.map(({ id }) => id);
  if (!exactKeys(value, keys) || keys.some((key) => !Number.isSafeInteger(value[key]) || value[key] < 0)) {
    throw new TypeError(`${label} must contain safe non-negative whole counts for all six held-token types.`);
  }
  return Object.fromEntries(keys.map((key) => [key, value[key]]));
}

/**
 * Validate explicit non-human virtual training choices. This never infers or
 * claims that a facilitator observed physical tabletop token counts.
 */
export function validateTrainingScenario(value) {
  if (!exactKeys(value, [
    'mode', 'humanPhysicalProof', 'senderRoleId', 'recipientRoleId', 'baselines', 'transfer',
  ]) || value.mode !== 'virtual-training-only') {
    throw new TypeError('Provide an explicit virtual-training-only scenario; physical observations are not inferred.');
  }
  if (value.humanPhysicalProof !== false) {
    throw new TypeError('humanPhysicalProof must be false for this virtual training callback.');
  }
  if (!identity(value.senderRoleId) || !identity(value.recipientRoleId) ||
      value.senderRoleId === value.recipientRoleId) {
    throw new TypeError('Choose two distinct original player role IDs for the same-table trade.');
  }
  if (!exactKeys(value.baselines, [value.senderRoleId, value.recipientRoleId])) {
    throw new TypeError('Provide an explicit training baseline for exactly the sender and recipient roles.');
  }
  const sender = checkedBalances(value.baselines[value.senderRoleId], 'Sender training baseline');
  const recipient = checkedBalances(value.baselines[value.recipientRoleId], 'Recipient training baseline');
  if (!exactKeys(value.transfer, ['resource', 'amount']) ||
      !SAME_TABLE_TRADE_UI_RESOURCES.some(({ id }) => id === value.transfer.resource) ||
      !Number.isSafeInteger(value.transfer.amount) || value.transfer.amount < 1) {
    throw new TypeError('Choose one supported positive whole-token training transfer.');
  }
  if (sender[value.transfer.resource] < value.transfer.amount) {
    throw new TypeError("The transfer exceeds the sender's chosen training balance.");
  }
  if (recipient[value.transfer.resource] > Number.MAX_SAFE_INTEGER - value.transfer.amount) {
    throw new TypeError('The recipient training balance cannot safely receive the chosen transfer.');
  }
  return Object.freeze({
    mode: 'virtual-training-only',
    humanPhysicalProof: false,
    senderRoleId: value.senderRoleId,
    recipientRoleId: value.recipientRoleId,
    baselines: Object.freeze({
      [value.senderRoleId]: Object.freeze(sender),
      [value.recipientRoleId]: Object.freeze(recipient),
    }),
    transfer: Object.freeze({ resource: value.transfer.resource, amount: value.transfer.amount }),
  });
}

/** Fail-closed contract for two current, original, authenticated players. */
export function validateActorPair(sender, recipient, expectedSessionId) {
  const players = [sender, recipient];
  if (!identity(expectedSessionId) || players.some((actor) => !record(actor))) {
    return { eligible: false, reason: 'The two current player contexts are unavailable.' };
  }
  if (players.some((actor) => actor.sessionId !== expectedSessionId || actor.live !== true ||
      actor.role !== 'player' || actor.replacement === true || !identity(actor.uidHash) ||
      !identity(actor.profileRoleId) || actor.profileRoleId !== actor.assignedRoleId ||
      actor.profileRoleId !== actor.activeConsoleRoleId || !identity(actor.tableId) ||
      !identity(actor.fleetGroupId))) {
    return { eligible: false, reason: 'Both original players need live current role, table, and fleet-group authority.' };
  }
  if (sender.uidHash === recipient.uidHash) {
    return { eligible: false, reason: 'The sender and recipient must be different original player identities.' };
  }
  if (sender.profileRoleId === recipient.profileRoleId) {
    return { eligible: false, reason: 'The sender and recipient must hold distinct player roles.' };
  }
  if (sender.tableId !== recipient.tableId) {
    return { eligible: false, reason: 'Both players must be at the same current ship table.' };
  }
  if (sender.fleetGroupId !== recipient.fleetGroupId) {
    return { eligible: false, reason: 'Both players must remain in the same current fleet group.' };
  }
  if ((Array.isArray(sender.activeRoleIds) && !sender.activeRoleIds.includes(sender.assignedRoleId)) ||
      (Array.isArray(recipient.activeRoleIds) && !recipient.activeRoleIds.includes(recipient.assignedRoleId)) ||
      (Array.isArray(sender.activeVesselIds) && !sender.activeVesselIds.includes(sender.tableId)) ||
      (Array.isArray(recipient.activeVesselIds) && !recipient.activeVesselIds.includes(recipient.tableId))) {
    return { eligible: false, reason: 'The selected ship table is not active in the current session.' };
  }
  return { eligible: true };
}

async function browserActorContext(surface) {
  const observed = await surface.observe();
  const local = await surface.page.evaluate(async (moduleUrl) => {
    const { useSessionStore } = await import(moduleUrl);
    const { findConsoleRole } = await import('/src/data/roles.ts');
    const state = useSessionStore.getState();
    const me = state.me;
    const assignedRoleId = me?.assignedRoleId ?? null;
    const role = assignedRoleId ? findConsoleRole(assignedRoleId) : undefined;
    return {
      uid: me?.uid ?? null,
      sessionId: state.session?.id ?? null,
      role: me?.role ?? null,
      assignedRoleId,
      activeConsoleRoleId: me?.activeConsoleRoleId ?? null,
      replacementRoleId: me?.replacementRoleId ?? null,
      replacementStatus: me?.replacementStatus ?? null,
      tableId: role?.shipId ?? null,
      fleetGroupId: me?.fleetGroupId ?? null,
      activeRoleIds: state.session?.activeRoleIds ?? null,
      activeVesselIds: state.session?.activeVesselIds ?? null,
      live: state.connection === 'live' && state.sessionSnapshotFreshness === 'server',
    };
  }, surface.storeModuleUrl());
  return {
    ...local,
    uidHash: observed.uidHash,
    profileRoleId: observed.profileRoleId,
    sameActor: observed.sameActor,
    connection: observed.connection,
    freshness: observed.freshness,
    live: local.live && observed.sameActor === true && observed.connection === 'live' &&
      observed.freshness === 'server' && observed.sessionId === local.sessionId,
  };
}

async function waitForLocator(locator, label) {
  await locator.waitFor({ state: 'visible', timeout: MAX_WAIT_MS });
  assert.equal(await locator.isVisible(), true, `${label} must be visible in the current normal UI.`);
}

function endpointResponse(surface, endpoint, choose) {
  return observeUiReceipt({ page: surface.page,
    waitForResponse: () => surface.page.waitForResponse((response) => {
      const url = new URL(response.url());
      return response.request().method() === 'POST' &&
        url.pathname.endsWith(`/us-central1/${endpoint}`);
    }, { timeout: MAX_WAIT_MS }),
    choose,
  });
}

function callableData(response) {
  const body = response.request().postDataJSON();
  if (!record(body) || !record(body.data)) throw new Error('The captured callable request had no data object.');
  return structuredClone(body.data);
}

async function browserCallable(surface, name, payload) {
  const reply = await surface.callable(name, payload);
  if (reply.status !== 'committed') {
    throw new Error(`The exact ${name} SDK request did not receive a successful server acknowledgement (${reply.code ?? 'unknown'}).`);
  }
  return reply.result;
}

function safeAction(roleId, actor, endpoint, response, payload, resultStatus, extra = {}) {
  return {
    roleId,
    actorUidHash: actor.uidHash,
    endpoint,
    transport: 'actual normal connected UI action; Firebase SDK request observed without interception',
    httpStatus: response.status(),
    requestFingerprint: digest(payload),
    serverResultStatus: resultStatus,
    ...extra,
  };
}

function rosterActor(roster, roleId) {
  const matches = roster.filter((entry) => entry.roleId === roleId);
  return matches.length === 1 ? matches[0] : null;
}

async function inventoryViaActualSdk(game, roleId, uid, sessionId) {
  const data = await game.read(roleId, `playerHeldResourceInventories/${uid}`);
  assert.ok(record(data), `${roleId} must receive its current entitled personal held-token document.`);
  requireSame(data.type, 'player-held-resource-inventory', 'The entitled document must be the current held-token inventory.');
  requireSame(data.sessionId, sessionId, 'The entitled inventory must belong to the active session.');
  requireSame(data.playerUid, uid, 'The entitled inventory must belong to the exact current actor.');
  assert.ok(Number.isSafeInteger(data.revision) && data.revision >= 0);
  assert.ok(record(data.balances));
  return structuredClone(data);
}

function assertBalances(actual, expected, label) {
  requireSameShape(actual, expected, `${label} must match the explicit scenario through the entitled current read.`);
}

async function currentUiBalances(panel) {
  return panel.locator('.same-table-trade__balance').evaluateAll((nodes) => {
    const result = {};
    for (const node of nodes) {
      const label = node.querySelector('dt')?.textContent?.trim().toLowerCase();
      const value = Number(node.querySelector('dd')?.textContent?.trim());
      const key = label === 'security teams' ? 'securityTeams' : label;
      if (key && Number.isSafeInteger(value)) result[key] = value;
    }
    return result;
  });
}

async function waitForTradePanel(surface) {
  const panel = surface.page.getByRole('region', { name: SAME_TABLE_PANEL, exact: true });
  await waitForLocator(panel, 'Same-table trade panel');
  const holdings = panel.getByRole('region', { name: 'Your held tokens', exact: true });
  await waitForLocator(holdings, 'Private held-token projection');
  return panel;
}

function rawUidFingerprint(value) {
  return typeof value === 'string'
    ? createHash('sha256').update(new TextEncoder().encode(value)).digest('hex').slice(0, 16)
    : null;
}

function currentCounterpartyAuthority(current, expected) {
  const actor = record(current) ? current : {};
  return {
    sameOriginalAuthenticatedActor: actor.sameActor === true && actor.uid === expected.uid &&
      actor.uidHash === expected.uidHash && actor.role === 'player',
    sameSession: actor.sessionId === expected.sessionId,
    sameProfileRole: actor.profileRoleId === expected.profileRoleId,
    sameAssignedRole: actor.assignedRoleId === expected.assignedRoleId,
    sameActiveConsoleRole: actor.activeConsoleRoleId === expected.activeConsoleRoleId,
    sameCurrentTable: actor.tableId === expected.tableId,
    sameCurrentFleetGroup: actor.fleetGroupId === expected.fleetGroupId,
    liveConnection: actor.connection === 'live',
    serverFreshness: actor.freshness === 'server',
    liveServerFresh: actor.live === true && actor.connection === 'live' && actor.freshness === 'server',
  };
}

function counterpartySelectorDiagnostics({ status, startedAt, now, observations, options, actor, expectedActor, expectedRecipient }) {
  const authority = currentCounterpartyAuthority(actor, expectedActor);
  const labelMatch = Array.isArray(options) && options.some(option =>
    record(option) && option.label === expectedRecipient.displayName);
  const valueHashMatch = Array.isArray(options) && options.some(option =>
    record(option) && rawUidFingerprint(option.value) === expectedRecipient.uidHash);
  const exactLabelAndUidMatch = Array.isArray(options) && options.some(option =>
    record(option) && option.label === expectedRecipient.displayName &&
    selectionMatchesOriginalIdentity(option.value, expectedRecipient));
  return {
    outcome: status,
    elapsedMs: Math.max(0, Math.min(MAX_COUNTERPARTY_SELECTOR_WAIT_MS, now() - startedAt)),
    observationCount: observations,
    optionCount: Array.isArray(options) ? options.length : 0,
    labelMatch,
    valueHashMatch,
    exactLabelAndUidMatch,
    authority,
    loaded: {
      currentSelectorSnapshotRead: Array.isArray(options),
      currentActorProjectionRead: record(actor),
      currentActorProjectionLiveAndServerFresh: authority.liveServerFresh,
    },
  };
}

/**
 * Wait only for the ordinary rendered options and current local actor
 * projection. This performs no reads outside the existing UI/store sources,
 * never chooses an option, and returns a UID only for the exact expected label
 * and original actor identity.
 */
export async function waitForCounterpartySelector({
  readCurrent,
  expectedActor,
  expectedRecipient,
  maxWaitMs = MAX_COUNTERPARTY_SELECTOR_WAIT_MS,
  pollIntervalMs = COUNTERPARTY_SELECTOR_POLL_MS,
  now = Date.now,
  sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds)),
}) {
  if (typeof readCurrent !== 'function' || !record(expectedActor) || !record(expectedRecipient) ||
      !identity(expectedActor.uid) || !identity(expectedActor.uidHash) ||
      !identity(expectedActor.sessionId) || !identity(expectedActor.profileRoleId) ||
      !identity(expectedActor.assignedRoleId) || !identity(expectedActor.activeConsoleRoleId) ||
      !identity(expectedActor.tableId) || !identity(expectedActor.fleetGroupId) ||
      expectedActor.role !== 'player' || !identity(expectedRecipient.uid) ||
      !/^[a-f0-9]{16}$/i.test(expectedRecipient.uidHash ?? '') ||
      typeof expectedRecipient.displayName !== 'string' || !expectedRecipient.displayName.trim() ||
      expectedRecipient.displayName.length > 40 || typeof now !== 'function' || typeof sleep !== 'function' ||
      !Number.isSafeInteger(maxWaitMs) || maxWaitMs < 1 ||
      !Number.isSafeInteger(pollIntervalMs) || pollIntervalMs < 1) {
    throw new TypeError('Current counterparty readiness requires bounded original actor and recipient identities.');
  }

  const waitLimit = Math.min(maxWaitMs, MAX_COUNTERPARTY_SELECTOR_WAIT_MS);
  const startedAt = now();
  const deadlineAt = startedAt + waitLimit;
  let observations = 0;
  let last = { options: [], actor: null };
  const elapsed = () => Math.max(0, now() - startedAt);
  const authorityMatches = authority => Object.values(currentCounterpartyAuthority(authority, expectedActor))
    .every(value => value === true);
  const finish = status => ({
    status,
    option: status === 'ready'
      ? last.options.find(option => option.label === expectedRecipient.displayName &&
        selectionMatchesOriginalIdentity(option.value, expectedRecipient)) ?? null
      : null,
    options: last.options,
    diagnostics: counterpartySelectorDiagnostics({ status, startedAt, now, observations,
      options: last.options, actor: last.actor, expectedActor, expectedRecipient }),
  });

  while (elapsed() < waitLimit) {
    const remaining = Math.max(1, deadlineAt - now());
    let timer;
    const snapshot = await Promise.race([
      Promise.resolve().then(readCurrent).then(value => ({ kind: 'read', value })),
      new Promise(resolve => { timer = setTimeout(() => resolve({ kind: 'deadline' }), remaining); }),
    ]).finally(() => clearTimeout(timer));
    if (snapshot.kind === 'deadline') return finish('timeout');

    observations += 1;
    const value = snapshot.value;
    if (!record(value) || !Array.isArray(value.options) ||
        value.options.some(option => !record(option) || typeof option.label !== 'string' || typeof option.value !== 'string')) {
      last = { options: [], actor: record(value) ? value.actor ?? null : null };
      return finish('source-unavailable');
    }
    last = { options: value.options, actor: value.actor };
    if (!authorityMatches(last.actor)) return finish('authority-changed');

    const exactMatches = last.options.filter(option => option.label === expectedRecipient.displayName &&
      selectionMatchesOriginalIdentity(option.value, expectedRecipient));
    if (exactMatches.length === 1) return finish('ready');
    if (exactMatches.length > 1) return finish('ambiguous-option');
    if (last.options.some(option => selectionMatchesOriginalIdentity(option.value, expectedRecipient))) {
      return finish('label-mismatch');
    }
    if (last.options.some(option => option.label === expectedRecipient.displayName)) {
      return finish('identity-mismatch');
    }

    const delay = Math.min(pollIntervalMs, Math.max(0, deadlineAt - now()));
    if (delay <= 0) return finish('timeout');
    await sleep(delay);
  }

  return finish('timeout');
}

async function expectPrivateReadDenied(game, roleId, suffix, label) {
  try {
    await game.read(roleId, suffix);
  } catch (error) {
    assert.equal(error?.code, 'permission-denied', `${label} must fail at the actual Firestore rules boundary.`);
    return { status: 'permission-denied', transport: 'actual authenticated browser Firestore SDK read' };
  }
  throw new Error(`${label} unexpectedly returned a private same-table trade document.`);
}

function summarizeInventory(inventory) {
  return { revision: inventory.revision, balances: inventory.balances };
}

async function writeEvidence(directory, evidence) {
  await writeFile(`${directory}/same-table-trade-ui-proof.json`, `${JSON.stringify(evidence, null, 2)}\n`);
}

async function block(context, evidence, reason) {
  evidence.status = 'blocked';
  evidence.reason = reason;
  evidence.mutationsAttempted = false;
  evidence.humanPhysicalProof = false;
  if (context.directory) await writeEvidence(context.directory, evidence);
  return { status: 'blocked', reason, humanPhysicalProof: false };
}

async function recordBaseline({
  gm,
  gmIdentity,
  targetRosterEntry,
  targetIdentity,
  balances,
  initial,
  evidence,
}) {
  const form = gm.page.getByRole('form', { name: BASELINE_FORM, exact: true });
  await waitForLocator(form, BASELINE_FORM);
  const target = form.getByLabel('Player to attest', { exact: true });
  await target.selectOption({ label: targetRosterEntry.displayName }, { timeout: MAX_WAIT_MS });
  const selectedUid = await target.inputValue();
  assert.equal(selectionMatchesOriginalIdentity(selectedUid, targetIdentity), true,
    'The ordinary GM baseline selector must name the exact current original player account.');
  for (const { id, label } of SAME_TABLE_TRADE_UI_RESOURCES) {
    await form.getByLabel(label, { exact: true }).fill(String(balances[id]));
  }
  for (const { id, label } of SAME_TABLE_TRADE_UI_RESOURCES) {
    assert.equal(await form.getByLabel(label, { exact: true }).inputValue(), String(balances[id]));
  }
  const button = form.getByRole('button', { name: BASELINE_CONTROL, exact: true });
  await waitForLocator(button, BASELINE_CONTROL);
  const response = await endpointResponse(gm, 'attestPlayerHeldTokenBaseline', () => button.click());
  const payload = callableData(response);
  const envelope = await response.json();
  const result = envelope?.result;
  assert.equal(response.status(), 200, 'The actual GM baseline UI request must receive HTTP 200.');
  requireSame(payload.sessionId, initial.sessionId, 'The baseline request must use the active session.');
  requireSame(payload.instanceId, gmIdentity.instanceId, 'The baseline request must use the current GM instance.');
  requireSame(payload.targetUid, targetIdentity.uid, 'The baseline request must target the selected current player.');
  assert.equal(payload.attestationId && /^[0-9a-f-]{36}$/i.test(payload.attestationId), true);
  assert.deepEqual(payload.balances, balances);
  assert.equal(result?.status, 'attested');
  requireSame(result?.targetUid, targetIdentity.uid, 'The baseline result must acknowledge the selected current player.');
  requireSame(result?.attestationId, payload.attestationId, 'The baseline result must acknowledge the submitted attestation.');
  assert.ok(Number.isSafeInteger(result?.revision) && result.revision >= 0);
  const retry = await browserCallable(gm, 'attestPlayerHeldTokenBaseline', payload);
  assert.equal(retry.status, 'replayed', 'Retry the exact UI request through the original GM Firebase SDK identity.');
  requireSame(retry.targetUid, payload.targetUid, 'The exact baseline replay must recover the selected target.');
  requireSame(retry.attestationId, payload.attestationId, 'The exact baseline replay must recover the attestation.');
  evidence.actions.push(safeAction('gm', gmIdentity, 'attestPlayerHeldTokenBaseline', response, payload,
    result.status, {
      targetUidHash: targetIdentity.uidHash,
      gmInstanceIdHash: digest(gmIdentity.instanceId).slice(0, 16),
      baselineRevision: result.revision,
      exactSdkReplay: { acknowledged: true, resultStatus: retry.status, requestFingerprint: digest(payload) },
      baselineBalances: { ...payload.balances, disclosure: BASELINE_DISCLOSURE },
    }));
  return { uid: payload.targetUid, revision: result.revision };
}

async function createOffer({
  surface,
  actor,
  scenario,
  recipientRosterEntry,
  recipientIdentity,
  initial,
  evidence,
}) {
  const panel = await waitForTradePanel(surface);
  assertBalances(await currentUiBalances(panel), scenario.baselines[scenario.senderRoleId],
    'Sender UI held-token projection before the offer');
  const recipient = panel.getByLabel('Recipient', { exact: true });
  const readCurrentSelector = async () => ({
    options: await recipient.locator('option').evaluateAll((options) =>
      options.map((option) => ({ label: option.textContent?.trim() ?? '', value: option.value }))),
    actor: await browserActorContext(surface),
  });
  const readiness = await waitForCounterpartySelector({
    readCurrent: readCurrentSelector,
    expectedActor: actor,
    expectedRecipient: {
      uid: recipientIdentity.uid,
      uidHash: recipientIdentity.uidHash,
      displayName: recipientRosterEntry.displayName,
    },
  });
  evidence.counterpartySelectorReadiness = {
    ...readiness.diagnostics,
    panelRenderedWithCurrentBalances: true,
    recipientSelectorMounted: true,
  };
  if (readiness.status === 'authority-changed' || readiness.status === 'ambiguous-option') {
    throw new Error('The original sender authority or recipient selector changed before offer submission.');
  }
  const recipientOptions = readiness.options;
  const option = recipientOptions.find((entry) => entry.label === recipientRosterEntry.displayName);
  assert.ok(option, 'The visible same-table counterparty must appear in the ordinary recipient selector.');
  assert.equal(selectionMatchesOriginalIdentity(option.value, recipientIdentity), true,
    'The visible recipient option must map to the original normal player identity.');
  const beforeSelection = await readCurrentSelector();
  const beforeSelectionAuthority = currentCounterpartyAuthority(beforeSelection.actor, actor);
  const beforeSelectionOptions = beforeSelection.options;
  const currentExactOption = Array.isArray(beforeSelectionOptions)
    ? beforeSelectionOptions.find((entry) => entry.label === recipientRosterEntry.displayName &&
      selectionMatchesOriginalIdentity(entry.value, recipientIdentity))
    : undefined;
  evidence.counterpartySelectorReadiness.beforeSelection = {
    optionCount: Array.isArray(beforeSelectionOptions) ? beforeSelectionOptions.length : 0,
    labelMatch: Array.isArray(beforeSelectionOptions) &&
      beforeSelectionOptions.some((entry) => entry.label === recipientRosterEntry.displayName),
    valueHashMatch: Array.isArray(beforeSelectionOptions) &&
      beforeSelectionOptions.some((entry) => rawUidFingerprint(entry.value) === recipientIdentity.uidHash),
    exactLabelAndUidMatch: Boolean(currentExactOption),
    authority: beforeSelectionAuthority,
  };
  if (!currentExactOption || !Object.values(beforeSelectionAuthority).every((value) => value === true)) {
    throw new Error('The current same-table recipient or original sender authority changed before selection.');
  }
  await recipient.selectOption(currentExactOption.value, {
    timeout: Math.min(MAX_WAIT_MS, MAX_COUNTERPARTY_SELECTOR_WAIT_MS),
  });
  const amount = panel.getByLabel(`${scenario.transfer.resource === 'securityTeams' ? 'Security Teams' : scenario.transfer.resource[0].toUpperCase() + scenario.transfer.resource.slice(1)} amount`, { exact: true });
  await amount.fill(String(scenario.transfer.amount));
  const send = panel.getByRole('button', { name: 'Send exact offer', exact: true });
  await waitForLocator(send, 'Send exact offer control');
  assert.equal(await send.isEnabled(), true, 'The displayed positive transfer must be affordable from the current private balance.');
  const response = await endpointResponse(surface, 'createSameTableTradeOffer', () => send.click());
  const payload = callableData(response);
  const envelope = await response.json();
  const result = envelope?.result;
  assert.equal(response.status(), 200, 'The actual sender UI request must receive HTTP 200.');
  requireSame(payload.sessionId, initial.sessionId, 'The offer request must use the active session.');
  requireSame(payload.recipientUid, recipientIdentity.uid, 'The offer request must target the selected current recipient.');
  assert.deepEqual(payload.quantities, { [scenario.transfer.resource]: scenario.transfer.amount });
  assert.equal(result?.status, 'created');
  requireSame(result?.offer?.fromUid, actor.uid, 'The server offer must name the original sender.');
  requireSame(result?.offer?.toUid, recipientIdentity.uid, 'The server offer must name the selected recipient.');
  requireSame(result?.offer?.tableId, actor.tableId, 'The server offer must retain the sender current table.');
  requireSame(result?.offer?.fleetGroupId, actor.fleetGroupId, 'The server offer must retain the current fleet group.');
  assert.ok(Number.isSafeInteger(result?.offer?.revision) && result.offer.revision >= 0);
  const retry = await browserCallable(surface, 'createSameTableTradeOffer', payload);
  assert.equal(retry.status, 'replayed', 'Repeat only the exact captured UI offer request through the original Firebase SDK actor.');
  requireSame(retry.offer?.id, payload.offerId, 'The exact offer replay must recover the original offer.');
  requireSame(payload.recipientUid === actor.uid, false, 'The addressed recipient must be distinct from the sender.');
  requireSame(retry.offer?.fromUid, actor.uid, 'The replayed offer must retain the original sender.');
  evidence.actions.push(safeAction(scenario.senderRoleId, actor, 'createSameTableTradeOffer', response,
    payload, result.status, {
      recipientUidHash: recipientIdentity.uidHash,
      tableId: actor.tableId,
      fleetGroupIdHash: digest(actor.fleetGroupId).slice(0, 16),
      offerIdHash: digest(payload.offerId).slice(0, 16),
      quantities: { ...payload.quantities },
      offerRevision: result.offer.revision,
      exactSdkReplay: { acknowledged: true, resultStatus: retry.status, requestFingerprint: digest(payload) },
      serverReplyFingerprint: digest(result),
    }));
  const status = panel.getByText(/Acceptance is required before counts change\./);
  await waitForLocator(status, 'Pending-offer status');
  const outgoing = panel.getByRole('region', { name: 'Offers you sent', exact: true });
  await waitForLocator(outgoing, 'Sender outgoing-offer projection');
  await outgoing.getByText('Waiting for recipient', { exact: true }).waitFor({ state: 'visible', timeout: MAX_WAIT_MS });
  return { offerId: payload.offerId, payload, result, panel };
}

async function acceptOffer({ surface, actor, recipientRoleId, senderRoleId, senderRosterEntry, offerId, initial, evidence }) {
  const panel = await waitForTradePanel(surface);
  const accept = panel.getByRole('button', {
    name: `Accept exact offer from ${senderRosterEntry.displayName}`,
    exact: true,
  });
  await waitForLocator(accept, 'Addressed recipient acceptance control');
  assert.equal(await accept.isEnabled(), true);
  const response = await endpointResponse(surface, 'acceptSameTableTradeOffer', () => accept.click());
  const payload = callableData(response);
  const envelope = await response.json();
  const result = envelope?.result;
  assert.equal(response.status(), 200, 'The actual recipient UI request must receive HTTP 200.');
  requireSame(payload.sessionId, initial.sessionId, 'The acceptance request must use the active session.');
  requireSame(payload.offerId, offerId, 'The acceptance request must name the selected pending offer.');
  assert.equal(result?.status, 'committed');
  requireSame(result?.offerId, offerId, 'The committed result must name the accepted offer.');
  requireSame(result?.receipt?.offerId, offerId, 'The private receipt must name the accepted offer.');
  assert.equal(Object.hasOwn(result ?? {}, 'sourceInventory'), false);
  assert.equal(Object.hasOwn(result ?? {}, 'recipientInventory'), false);
  const retry = await browserCallable(surface, 'acceptSameTableTradeOffer', payload);
  assert.equal(retry.status, 'replayed', 'Repeat only the exact recipient acceptance payload through the original Firebase SDK.');
  requireSame(retry.offerId, offerId, 'The exact acceptance replay must recover the same offer.');
  evidence.actions.push(safeAction(recipientRoleId, actor,
    'acceptSameTableTradeOffer', response, payload, result.status, {
      senderRoleId,
      offerIdHash: digest(offerId).slice(0, 16),
      acceptedRevision: result.revision,
      receiptRevision: result.receipt.revision,
      receiptQuantity: { ...result.receipt.quantities },
      recipientInventory: { ...result.inventory.balances },
      exactSdkReplay: { acknowledged: true, resultStatus: retry.status, requestFingerprint: digest(payload) },
      serverReplyFingerprint: digest(result),
    }));
  const confirmation = panel.getByText('Trade confirmed. Your held-token counts are updated above.', { exact: true });
  const alert = panel.getByRole('alert');
  const deadline = Date.now() + MAX_WAIT_MS;
  let uiOutcome = null;
  while (Date.now() < deadline) {
    if (await confirmation.isVisible().catch(() => false)) { uiOutcome = 'confirmed'; break; }
    if (await alert.isVisible().catch(() => false)) { uiOutcome = 'error'; break; }
    await surface.page.waitForTimeout(150);
  }
  evidence.actions.at(-1).uiOutcome = uiOutcome;
  evidence.actions.at(-1).uiErrorVisible = uiOutcome === 'error';
  return { result, payload, response, retry, uiOutcome };
}

async function runProof(context, scenario, createTwoBrowserGameplay) {
  const { initial, started, roster = [], directory } = context;
  const evidence = {
    schemaVersion: 1,
    status: 'running',
    sessionIdHash: digest(initial?.sessionId).slice(0, 16),
    stage: 'validate fresh full-demo authority',
    actions: [],
    limitations: [
      'Baseline numbers are explicit virtual-training scenario choices and are not observed physical token counts.',
      'Human physical-tabletop proof and human attendance proof are both zero.',
      'Initial mutations use only the existing normal GM/player UI; read-only private reads and exact SDK replay calls are labeled separately.',
      'This callback does not establish whole-game or gameplay acceptance by itself.',
    ],
    trainingScenario: {
      mode: scenario.mode,
      humanPhysicalProof: false,
      disclosure: BASELINE_DISCLOSURE,
      senderRoleId: scenario.senderRoleId,
      recipientRoleId: scenario.recipientRoleId,
      baselines: structuredClone(scenario.baselines),
      transfer: structuredClone(scenario.transfer),
    },
    physicalObservation: { observed: false, humanProof: false },
    mutationsAttempted: false,
  };
  let stage = evidence.stage;
  const save = async () => writeEvidence(directory, { ...evidence, stage });
  try {
    if (!identity(initial?.sessionId) || started?.sessionId !== initial.sessionId ||
        started.cycle !== 1 || started.phase !== 'active' || started.fullGameDemo?.status !== 'active' ||
        started.phaseProgression !== 'manual') {
      return block(context, evidence, 'The callback requires the actual active Cycle 1 manual full-game demo projection.');
    }
    const senderRoster = rosterActor(roster, scenario.senderRoleId);
    const recipientRoster = rosterActor(roster, scenario.recipientRoleId);
    if (!senderRoster || !recipientRoster || !identity(senderRoster.uidHash) || !identity(recipientRoster.uidHash) ||
        senderRoster.uidHash === recipientRoster.uidHash) {
      return block(context, evidence, 'Both distinct configured role actors must be present in the fresh original demo roster.');
    }
    const game = createTwoBrowserGameplay(context);
    const gm = await game.select('gm');
    const gmObservation = await gm.observe();
    const gmState = await browserActorContext(gm);
    if (gmObservation.sameActor !== true || gmObservation.gmInstanceOwned !== true ||
        gmObservation.playerRole !== 'gm' || gmObservation.sessionId !== initial.sessionId ||
        gmState.role !== 'gm' || gmState.live !== true || !identity(gmState.instanceId ?? gmObservation.instanceId)) {
      return block(context, evidence, 'The original authenticated GM needs the current owned instance and live server projection.');
    }
    const gmIdentity = {
      uidHash: gmObservation.uidHash,
      instanceId: gmObservation.instanceId,
      sessionId: initial.sessionId,
      live: gmState.live,
      role: gmState.role,
    };
    if (!identity(gmIdentity.instanceId)) {
      return block(context, evidence, 'The ordinary GM UI has no current owned instance for baseline attestation.');
    }

    stage = 'select the two original players through normal stations'; await save();
    const senderSurfaceInitial = await game.select(scenario.senderRoleId);
    const sender = await browserActorContext(senderSurfaceInitial);
    const recipientSurfaceInitial = await game.select(scenario.recipientRoleId);
    const recipient = await browserActorContext(recipientSurfaceInitial);
    if (sender.uidHash !== senderRoster.uidHash || recipient.uidHash !== recipientRoster.uidHash ||
        sender.profileRoleId !== scenario.senderRoleId || recipient.profileRoleId !== scenario.recipientRoleId) {
      return block(context, evidence, 'Normal role navigation did not preserve both original authenticated player identities.');
    }
    const pair = validateActorPair(sender, recipient, initial.sessionId);
    if (!pair.eligible) return block(context, evidence, pair.reason);
    evidence.roster = {
      gmUidHash: gmIdentity.uidHash,
      senderUidHash: sender.uidHash,
      recipientUidHash: recipient.uidHash,
      senderRoleId: sender.profileRoleId,
      recipientRoleId: recipient.profileRoleId,
      tableId: sender.tableId,
      fleetGroupIdHash: digest(sender.fleetGroupId).slice(0, 16),
      sameCurrentTable: sender.tableId === recipient.tableId,
      sameCurrentFleetGroup: sender.fleetGroupId === recipient.fleetGroupId,
      originalAuthenticatedPlayers: true,
    };
    await save();

    stage = 'record explicit training baselines through actual GM form'; await save();
    evidence.mutationsAttempted = true;
    const senderBaseline = await recordBaseline({ game, gm, gmIdentity,
      targetRoleId: scenario.senderRoleId, targetRosterEntry: senderRoster, targetIdentity: sender,
      balances: scenario.baselines[scenario.senderRoleId], initial, evidence });
    await save();
    const recipientBaseline = await recordBaseline({ game, gm, gmIdentity,
      targetRoleId: scenario.recipientRoleId, targetRosterEntry: recipientRoster, targetIdentity: recipient,
      balances: scenario.baselines[scenario.recipientRoleId], initial, evidence });
    await save();
    const senderBefore = await inventoryViaActualSdk(game, scenario.senderRoleId, senderBaseline.uid, initial.sessionId);
    const recipientBefore = await inventoryViaActualSdk(game, scenario.recipientRoleId, recipientBaseline.uid, initial.sessionId);
    assertBalances(senderBefore.balances, scenario.baselines[scenario.senderRoleId], 'Sender server baseline');
    assertBalances(recipientBefore.balances, scenario.baselines[scenario.recipientRoleId], 'Recipient server baseline');
    evidence.serverObservedBalances = {
      readAudience: 'each original player read only their own current server document',
      senderBefore: summarizeInventory(senderBefore),
      recipientBefore: summarizeInventory(recipientBefore),
    };
    await save();

    stage = 'prove private inventory and pending offer audience'; await save();
    const senderCannotReadRecipient = await expectPrivateReadDenied(game, scenario.senderRoleId,
      `playerHeldResourceInventories/${recipientBaseline.uid}`, 'Sender read of recipient inventory');
    const recipientCannotReadSender = await expectPrivateReadDenied(game, scenario.recipientRoleId,
      `playerHeldResourceInventories/${senderBaseline.uid}`, 'Recipient read of sender inventory');
    evidence.privacy = {
      senderCannotReadRecipientInventory: senderCannotReadRecipient,
      recipientCannotReadSenderInventory: recipientCannotReadSender,
    };
    const senderSurface = await game.select(scenario.senderRoleId);
    const actualOffer = await createOffer({ surface: senderSurface, actor: sender,
      scenario, recipientRoleId: scenario.recipientRoleId, recipientRosterEntry: recipientRoster,
      recipientIdentity: recipient, initial, evidence });
    evidence.offer = {
      idHash: digest(actualOffer.offerId).slice(0, 16),
      revision: actualOffer.result.offer.revision,
      status: actualOffer.result.offer.status,
      tableId: actualOffer.result.offer.tableId,
      fleetGroupIdHash: digest(actualOffer.result.offer.fleetGroupId).slice(0, 16),
      quantities: { ...actualOffer.result.offer.quantities },
      pendingOnlyUntilRecipientAccepts: true,
    };
    await save();
    const senderOffer = await game.read(scenario.senderRoleId, `sameTableTradeOffers/${actualOffer.offerId}`);
    requireSame(senderOffer?.status, 'pending', 'The sender must read the addressed pending offer.');
    const recipientOffer = await game.read(scenario.recipientRoleId, `sameTableTradeOffers/${actualOffer.offerId}`);
    requireSame(recipientOffer?.status, 'pending', 'The recipient must read the addressed pending offer.');
    evidence.privacy.senderAndRecipientCanReadPendingOffer = true;
    evidence.privacy.gmCannotReadSenderInventory = await expectPrivateReadDenied(game, 'gm',
      `playerHeldResourceInventories/${senderBaseline.uid}`, 'GM read of player inventory');
    evidence.privacy.gmCannotReadOffer = await expectPrivateReadDenied(game, 'gm',
      `sameTableTradeOffers/${actualOffer.offerId}`, 'GM read of player-to-player trade offer');
    evidence.privacy.gmCannotReadReceipt = await expectPrivateReadDenied(game, 'gm',
      `sameTableTradeReceipts/${actualOffer.offerId}`, 'GM read of server-only trade receipt');
    await save();

    stage = 'recipient accepts the exact pending offer in normal UI'; await save();
    const recipientSurfaceForAcceptance = await game.select(scenario.recipientRoleId);
    const accepted = await acceptOffer({ surface: recipientSurfaceForAcceptance,
      actor: recipient, recipientRoleId: scenario.recipientRoleId,
      senderRoleId: scenario.senderRoleId, senderRosterEntry: senderRoster,
      offerId: actualOffer.offerId, initial, evidence });
    await save();
    const expectedSender = { ...senderBefore.balances,
      [scenario.transfer.resource]: senderBefore.balances[scenario.transfer.resource] - scenario.transfer.amount };
    const expectedRecipient = { ...recipientBefore.balances,
      [scenario.transfer.resource]: recipientBefore.balances[scenario.transfer.resource] + scenario.transfer.amount };
    const senderAfter = await inventoryViaActualSdk(game, scenario.senderRoleId, senderBaseline.uid, initial.sessionId);
    const recipientAfter = await inventoryViaActualSdk(game, scenario.recipientRoleId, recipientBaseline.uid, initial.sessionId);
    assertBalances(senderAfter.balances, expectedSender, 'Sender server balance after acceptance');
    assertBalances(recipientAfter.balances, expectedRecipient, 'Recipient server balance after acceptance');
    requireSame(senderAfter.revision, accepted.result.revision, 'Sender inventory must reflect the accepted transaction revision.');
    requireSame(recipientAfter.revision, accepted.result.revision, 'Recipient inventory must reflect the accepted transaction revision.');
    evidence.consequence = {
      resource: scenario.transfer.resource,
      amount: scenario.transfer.amount,
      fee: 0,
      senderBefore: summarizeInventory(senderBefore),
      senderAfter: summarizeInventory(senderAfter),
      recipientBefore: summarizeInventory(recipientBefore),
      recipientAfter: summarizeInventory(recipientAfter),
      serverReceiptRevision: accepted.result.receipt.revision,
      committedInventoryRevision: accepted.result.revision,
      receiptFingerprint: digest(accepted.result.receipt),
      offerStatus: 'accepted',
    };
    await save();

    stage = 'reload recipient and recover current private projection'; await save();
    await recipientSurfaceForAcceptance.page.reload({ waitUntil: 'domcontentloaded', timeout: MAX_WAIT_MS });
    const restored = await recipientSurfaceForAcceptance.until('Original recipient restored after reload', (state) =>
      state.sameActor === true && state.uidHash === recipient.uidHash &&
      state.sessionId === initial.sessionId && state.profileRoleId === scenario.recipientRoleId &&
      state.connection === 'live' && state.freshness === 'server', MAX_WAIT_MS);
    requireSame(restored.activeConsoleRoleId, scenario.recipientRoleId, 'Reload must restore the original recipient role authority.');
    const reloadedRecipientSurface = await game.select(scenario.recipientRoleId);
    const reloadedPanel = await waitForTradePanel(reloadedRecipientSurface);
    assertBalances(await currentUiBalances(reloadedPanel), expectedRecipient,
      'Recipient UI private balances after same-actor reload');
    const restoredInventory = await inventoryViaActualSdk(game, scenario.recipientRoleId,
      recipientBaseline.uid, initial.sessionId);
    assertBalances(restoredInventory.balances, expectedRecipient, 'Recipient SDK read after reload');
    const replayAfterReload = await browserCallable(reloadedRecipientSurface, 'acceptSameTableTradeOffer',
      accepted.payload);
    assert.equal(replayAfterReload.status, 'replayed');
    requireSame(replayAfterReload.offerId, actualOffer.offerId, 'Post-reload exact retry must recover the same trade.');
    assert.equal(replayAfterReload.inventory?.balances?.[scenario.transfer.resource], expectedRecipient[scenario.transfer.resource]);
    evidence.recovery = {
      originalRecipientUidHash: recipient.uidHash,
      sameActorAndSessionRestored: true,
      serverBackedUiProjectionRestored: true,
      currentOwnInventoryRead: summarizeInventory(restoredInventory),
      exactOriginalAcceptanceSdkReplayAfterReload: { acknowledged: true, status: replayAfterReload.status,
        requestFingerprint: digest(accepted.payload) },
    };
    evidence.acceptanceUiStatus = accepted.uiOutcome;
    if (accepted.uiOutcome !== 'confirmed') {
      evidence.status = 'incomplete';
      evidence.reason = 'The callable committed and exact retry recovered, but the normal recipient UI did not render its success state.';
      stage = 'incomplete';
      await save();
      return { status: 'incomplete', evidence: `${directory}/same-table-trade-ui-proof.json`,
        reason: evidence.reason, humanPhysicalProof: false };
    }
    stage = 'passed';
    evidence.status = 'passed';
    evidence.humanPhysicalProof = false;
    await save();
    return { status: 'passed', evidence: `${directory}/same-table-trade-ui-proof.json`, humanPhysicalProof: false };
  } catch (error) {
    evidence.status = 'failed';
    evidence.humanPhysicalProof = false;
    evidence.failure = {
      stage,
      name: typeof error?.name === 'string' ? error.name : 'Error',
      code: typeof error?.code === 'string' ? error.code : undefined,
      // Error messages are omitted because SDK/HTTP errors may contain request details.
    };
    await save();
    throw error;
  }
}

/** Opt-in only: importing this module does not start a browser or mutate a game. */
export function createSameTableTradeUiProof({
  createTwoBrowserGameplay = createDefaultTwoBrowserGameplay,
  trainingScenario,
} = {}) {
  let invoked = false;
  return Object.freeze({
    onStarted: async (context) => {
      if (invoked) throw new Error('The same-table trade proof callback can run only once per fresh demo.');
      invoked = true;
      const evidence = {
        schemaVersion: 1,
        status: 'blocked',
        sessionIdHash: digest(context.initial?.sessionId).slice(0, 16),
        humanPhysicalProof: false,
        physicalObservation: { observed: false, humanProof: false },
        mutationsAttempted: false,
      };
      if (trainingScenario === undefined) {
        return block(context, evidence,
          'Physical token counts are not available to this virtual run; no baseline attestation or trade was submitted.');
      }
      const scenario = validateTrainingScenario(trainingScenario);
      assert.equal(typeof createTwoBrowserGameplay, 'function');
      return runProof(context, scenario, createTwoBrowserGameplay);
    },
  });
}
