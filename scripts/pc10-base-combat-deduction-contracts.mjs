import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { observeUiReceipt } from './pc10-browser-ui-receipt.mjs';

export const proofHash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
export const uidHash = value => createHash('sha256').update(value).digest('hex').slice(0, 16);
export const BASE_COMBAT_CONTROL_LABELS = Object.freeze({ maliadesShort: 'Resolve Maliades Short attacks',
  commanderRuling: 'Record facilitator ruling', investigationRegion: 'Investigate a player' });

function assertOriginalIdentity(current, original) {
  for (const key of ['sessionId', 'uidHash', 'profileRoleId', 'assignedRoleId', 'activeConsoleRoleId', 'playerRole', 'phase', 'cycle'])
    assert.equal(current[key], original[key], `Original ${key} changed during the base procedure.`);
  assert.equal(current.hasAuth, true); assert.equal(current.sameActor, true);
  assert.ok(['active', 'casting', 'lobby'].includes(original.phase));
  if (original.playerRole === 'gm') {
    assert.equal(current.instanceId, original.instanceId, 'Keep the original owned GM instance.');
    assert.ok(current.instanceId); assert.equal(current.gmInstanceOwned, true);
  }
}

export function assertOriginalBaseActor(current, original) {
  assertOriginalIdentity(current, original);
  assert.equal(current.connection, 'live'); assert.equal(current.freshness, 'server');
}

/** Only cache/connection readiness may wait; changed authority fails on that read. */
export async function waitForOriginalBaseActor({ inspect, original, timeoutMs = 60_000,
  now = Date.now, wait = () => delay(200) }) {
  const deadline = now() + timeoutMs;
  while (now() < deadline) {
    const current = await inspect(); assertOriginalIdentity(current, original);
    if (current.connection === 'live' && current.freshness === 'server') return current;
    await wait();
  }
  throw new Error('Original live server actor readiness deadline expired; no callable was reissued.');
}

/** Finish the mounted panel's one exact recovery before choosing another private record. */
export async function waitForBaseLoyaltyUiReceipt({ inspect, original, inspectUi, retry,
  requestFingerprint, receipt, timeoutMs = 60_000, now = Date.now, wait = () => delay(200) }) {
  const deadline = now() + timeoutMs;
  let exactUiRetries = 0;
  while (now() < deadline) {
    const current = await inspect();
    assertOriginalIdentity(current, original);
    if (current.connection !== 'live' || current.freshness !== 'server') {
      await wait();
      continue;
    }
    const state = await inspectUi();
    assertOriginalBaseActor(await inspect(), original);
    if (state.confirmed === true) return { visibleConsequence: true, exactUiRetries };
    if (state.retryReady === true && exactUiRetries === 0) {
      assert.equal(typeof requestFingerprint, 'string');
      assert.ok(requestFingerprint.length && receipt, 'Recover only a captured actual request and receipt.');
      exactUiRetries += 1;
      const recovery = await retry();
      assertOriginalBaseActor(await inspect(), original);
      assert.equal(recovery.requestFingerprint, requestFingerprint, 'Visible retry must keep the exact original request.');
      assert.deepEqual(recovery.receipt, receipt, 'Visible retry must preserve every original receipt consequence.');
    }
    await wait();
  }
  throw new Error('Original loyalty UI receipt remains unconfirmed at its deadline; no further retry or credit.');
}

export function originalRoleForUid(uid, roster) {
  assert.equal(typeof uid, 'string');
  const matches = roster.filter(actor => actor.uidHash === uidHash(uid));
  assert.equal(matches.length, 1, 'Source actor must be exactly one original normally admitted identity.');
  return matches[0].roleId;
}

export function openingWolfCounts({ cycle, window, attack }) {
  assert.ok(cycle === 1 || cycle === 2, 'Opening combat requires Cycle1, or the genuinely deferredCycle2.');
  assert.ok(!attack, 'Opening preparation cannot overwrite an existing attack.');
  assert.ok(!window?.threatSiteCode, 'Base opening cannot replace a location or Commander source.');
  if (cycle === 2) assert.ok(window?.turn === 2 && ['deferred', 'due'].includes(window.status),
    'Use the normal Cycle1 defer control before opening combat in Cycle2.');
  if (cycle === 1 && window) assert.ok(window.turn === 1 && window.status === 'due', 'Current opening window must be due.');
  return Object.freeze({ 'wolf-fighter-wing': 10, 'wolf-assault-transport': 5,
    'wolf-destroyer': 0, 'wolf-cruiser': 0, 'wolf-strikecarrier': 0, 'wolf-battlestation': 0 });
}

/** Five current combat charges; the caller charges Jump Drive in a later real Team. */
export function assertBaseCombatPrerequisites(state, cycle) {
  assert.equal(state.cycle, cycle); assert.equal(state.phase, 'active');
  assert.equal(state.turnPhase?.turn, cycle); assert.equal(state.turnPhase?.airspace?.state, 'lifted');
  const maintenance = state.maintenanceCycles?.aegis, damage = state.shipDamage?.aegis;
  assert.equal(maintenance?.turn, cycle); assert.equal(maintenance.step, 0);
  assert.ok(maintenance.completedAt, 'Complete ordinary paid AEGIS maintenance before opening combat.');
  const requiredConsoleIds = ['fighter-bay-alpha', 'fighter-bay-bravo', 'command-and-control', 'missile-launchers', 'point-defence-lasers'];
  assert.ok(requiredConsoleIds.every(id => maintenance.charges?.includes(id)),
    'Both Fighter Bays, C&C, Missiles and PDL must be charged; no injected sixth charge.');
  assert.equal(damage?.destroyed, false); assert.ok(Array.isArray(damage.damagedSystemIds));
  assert.ok(requiredConsoleIds.every(id => !damage.damagedSystemIds.includes(id)), 'Required combat systems must be currently intact.');
  return { requiredConsoleIds, actualChargedConsoleIds: maintenance.charges,
    constructionBay: maintenance.charges.includes('construction-bay') };
}

export function validatePrivateDeductionReply(result, expected) {
  assert.ok(['intelligence-investigation', 'wolf-agent-detector-test'].includes(result?.type));
  const allowed = new Set(['type', 'status', 'sessionId', 'requestId', 'cycle', 'revision',
    'investigatorUid', 'targetUid', 'targetDisplayName', 'reportedWolf',
    ...(result.type === 'intelligence-investigation' ? ['suspicion'] : [])]);
  assert.ok(Object.keys(result).every(key => allowed.has(key)), 'A private report must omit unknown or hidden truth fields.');
  if (result.type === 'wolf-agent-detector-test' || Object.hasOwn(result, 'status')) assert.equal(result.status, 'committed');
  assert.ok(typeof result.requestId === 'string' && result.requestId.length);
  assert.equal(typeof result.targetDisplayName, 'string');
  for (const key of ['sessionId', 'cycle', 'investigatorUid', 'targetUid']) assert.equal(result[key], expected[key]);
  assert.equal(typeof result.reportedWolf, 'boolean');
  assert.ok(Number.isSafeInteger(result.revision) && result.revision > 0);
  for (const key of ['actualWolf', 'accurate', 'accuracyRoll', 'targetLoyaltyKind', 'loyalty', 'codeWord'])
    assert.equal(Object.hasOwn(result, key), false, 'A private report must still omit hidden server truth.');
  return result;
}

const memberKeys = new Set(['id', 'type', 'schemaVersion', 'sessionId', 'attackId', 'turn', 'revision',
  'status', 'phase', 'currentStep', 'range', 'deadlineAt', 'serverTime', 'visibility',
  'remainingThreatCount', 'returningThreatCount', 'redaction', 'results']);
const resultKeys = new Set(['range', 'sourceId', 'targetId', 'bearing', 'contactReference', 'effect', 'outcome', 'serverTime']);
const publicOutcomeKeys = new Set(['damage', 'destroyed', 'remainingCapacity', 'shipsDestroyed', 'populationLoss',
  'survivingBoardingParties', 'securityCasualties', 'boarderCasualties', 'returnedCraftCount', 'overrun',
  'casualtiesPrevented', 'foodSpent', 'waterSpent', 'materialsGained', 'scrapGained']);
function assertSafeMemberView(view, sessionId) {
  assert.ok(view && Object.keys(view).every(key => memberKeys.has(key)), 'Unknown private member-view fields.');
  if (Object.hasOwn(view, 'id')) assert.equal(view.id, 'current');
  assert.equal(view.type, 'wolf-attack-member-view'); assert.equal(view.schemaVersion, 1);
  assert.equal(view.sessionId, sessionId); assert.equal(view.visibility, 'members');
  assert.ok(['declared', 'resolved'].includes(view.status));
  assert.ok(Number.isSafeInteger(view.revision) && view.revision > 0);
  assert.deepEqual(view.redaction, ['composition', 'unresolved-dice', 'facilitator-notes', 'intervention-state']);
  assert.ok(Array.isArray(view.results));
  for (const result of view.results) {
    assert.ok(result && Object.keys(result).every(key => resultKeys.has(key)), 'Unknown private result fields.');
    assert.ok(result.outcome && !Array.isArray(result.outcome));
    for (const [key, value] of Object.entries(result.outcome)) assert.ok(publicOutcomeKeys.has(key) &&
      (value === null || typeof value === 'boolean' || (typeof value === 'number' && Number.isFinite(value)) ||
        (typeof value === 'string' && value.length <= 80)), 'Unknown nested private outcome fields.');
  }
}

export function assertSafeBaseMemberAftermath(view, expected) {
  assertSafeMemberView(view, expected.sessionId);
  for (const key of ['attackId', 'turn', 'revision']) assert.equal(view[key], expected[key]);
  assert.equal(view.status, 'resolved'); assert.equal(view.currentStep, 'resolved');
  return view;
}

// Match the existing public presenter, including zero damage and recovery costs.
function publicOutcomeText(outcome) {
  const values = [];
  if (typeof outcome.damage === 'number') values.push(`${outcome.damage} damage`);
  if (outcome.destroyed === true) values.push('destroyed');
  if (outcome.populationLoss > 0) values.push(`${outcome.populationLoss} population lost`);
  if (outcome.casualtiesPrevented > 0) values.push(`${outcome.casualtiesPrevented} ${outcome.casualtiesPrevented === 1 ? 'casualty' : 'casualties'} prevented`);
  if (outcome.foodSpent > 0) values.push(`${outcome.foodSpent} food spent`);
  if (outcome.waterSpent > 0) values.push(`${outcome.waterSpent} water spent`);
  if (outcome.materialsGained > 0) values.push(`${outcome.materialsGained} ${outcome.materialsGained === 1 ? 'material' : 'materials'} recovered`);
  if (outcome.scrapGained > 0) values.push(`${outcome.scrapGained} Scrap collected`);
  if (typeof outcome.survivingBoardingParties === 'number') values.push(`${outcome.survivingBoardingParties} boarding parties remain`);
  return values.length ? values.join(' // ') : 'Committed effect recorded';
}

export function baseMemberRowsMatch(view, rows, threatText) {
  const normalize = text => text.replace(/\s+/g, ' ').trim();
  if (rows.length !== view.results.length) return false;
  if (view.remainingThreatCount !== undefined && view.returningThreatCount !== undefined &&
      normalize(threatText ?? '') !== `${view.remainingThreatCount} remaining hostile ship${view.remainingThreatCount === 1 ? '' : 's'} // ${view.returningThreatCount} returning next attack`) return false;
  return view.results.every((result, i) => normalize(rows[i]) === normalize(
    `${result.range === 'boarding' ? 'Boarding' : `${result.range} range`} ${result.sourceId} → ${result.contactReference} ${publicOutcomeText(result.outcome)} Committed ${result.serverTime}`));
}

/** Await the read itself and its actual rendered consequence, under the original member. */
export async function waitForBaseMemberAftermath({ inspect, original, expected, read, renderedReady,
  timeoutMs = 60_000, now = Date.now, wait = () => delay(200) }) {
  const deadline = now() + timeoutMs;
  while (now() < deadline) {
    assertOriginalBaseActor(await inspect(), original);
    const view = await read(); assertOriginalBaseActor(await inspect(), original);
    if (view) {
      assertSafeMemberView(view, original.sessionId);
      if (view.attackId === expected.attackId && view.turn === expected.turn && view.revision === expected.revision &&
          view.status === 'resolved' && view.currentStep === 'resolved') {
        assertSafeBaseMemberAftermath(view, { sessionId: original.sessionId, ...expected });
        const painted = await renderedReady(view); assertOriginalBaseActor(await inspect(), original);
        if (painted === true) return view;
      }
    }
    await wait();
  }
  throw new Error('Exact member aftermath/read/render deadline expired; no credit or new mutation.');
}

/** One source-paid research cross, its exact private projection, then actual DOM paint. */
export async function waitForBaseResearchReceipt({ inspect, original, receipt, read, renderedReady,
  timeoutMs = 60_000, now = Date.now, wait = () => delay(200) }) {
  assert.ok(['committed', 'replayed'].includes(receipt?.status));
  assert.equal(receipt.sessionId, original.sessionId); assert.equal(receipt.cycle, original.cycle);
  assert.equal(receipt.trackId, 'wolf-agent-detector');
  assert.ok(['standard', 'shepherd-ore'].includes(receipt.funding));
  assert.equal(receipt.oreCost, receipt.funding === 'standard' ? 0 : 5);
  assert.ok(Number.isSafeInteger(receipt.researchRevision) && receipt.researchRevision > 0);
  assert.ok(Number.isSafeInteger(receipt.progress?.['wolf-agent-detector']) &&
    receipt.progress['wolf-agent-detector'] >= 1 && receipt.progress['wolf-agent-detector'] <= 4);
  const deadline = now() + timeoutMs;
  while (now() < deadline) {
    assertOriginalBaseActor(await inspect(), original);
    const workspace = await read(); assertOriginalBaseActor(await inspect(), original);
    assert.equal(workspace.status, 'ready'); assert.equal(workspace.sessionId, original.sessionId);
    assert.equal(workspace.cycle, original.cycle);
    if (workspace.researchRevision >= receipt.researchRevision) {
      assert.equal(workspace.researchRevision, receipt.researchRevision, 'A newer source choice is not this research receipt.');
      assert.deepEqual(workspace.progress, receipt.progress); assert.deepEqual(workspace.cadence, receipt.cadence);
      assert.equal(workspace.shepherdOre, receipt.shepherdOre);
      const painted = await renderedReady(workspace); assertOriginalBaseActor(await inspect(), original);
      if (painted === true) return workspace;
    }
    await wait();
  }
  throw new Error('Exact research/read/render deadline expired; no extra cross or endpoint retry.');
}

const attackChoiceEndpoints = new Set(['launchAegisFighterWing', 'launchDioneMaliades', 'launchPdfEscortWing',
  'passWolfFighterLaunchChoice', 'finishWolfCommanderTargetingRerolls', 'passAegisCommandAndControl',
  'applyAegisCommandAndControl', 'commitAegisEnrichedWarheadChoice', 'commitWolfForceFieldChoice',
  'commitWolfRangeSupportActionChoice', 'commitWolfFighterRangeActionChoice', 'commitWolfEscortRangeActionChoice',
  'commitWolfRangeActionChoice', 'assignWolfRangeTargets', 'commitWolfBoardingDefenceChoice', 'commitWolfBoardingSpecialChoice']);
export function baseWolfActionExpectation(endpoint, current) {
  assert.ok(current?.attackId && Number.isSafeInteger(current.turn) && Number.isSafeInteger(current.revision));
  if (endpoint === 'resolveWolfAttackAftermath') return { attackId: current.attackId };
  assert.ok(attackChoiceEndpoints.has(endpoint), 'Unknown source Wolf mutation; do not invent its revision contract.');
  return { expectedTurn: current.turn, expectedRevision: current.revision };
}

/** Human target plan using only the EO's current entitled contact/coverage projection. */
export function chooseBaseRangeAssignments(view) {
  assert.equal(view.choiceStatus, 'targets-required');
  const protectedShipPriority = view.protectedShipPriority;
  let protectedShipRank;
  if (protectedShipPriority !== undefined) {
    const supportedTargets = new Set(['aegis', 'dione', 'icebreaker', 'quellon', 'shepherd', 'refinery-124', 'capybara']);
    assert.ok(Array.isArray(protectedShipPriority), 'Protected ship priority must be an explicit list.');
    assert.ok(protectedShipPriority.every(target => typeof target === 'string' && supportedTargets.has(target)),
      'Protected ship priority contains an unknown source target.');
    assert.equal(new Set(protectedShipPriority).size, protectedShipPriority.length,
      'Protected ship priority cannot repeat a source target.');
    assert.ok(Array.isArray(view.contacts), 'The current source contact list is required.');
    for (const contact of view.contacts) {
      assert.ok(contact && typeof contact === 'object' && typeof contact.available === 'boolean',
        'The current source contact availability is malformed.');
    }
    const seenContactIds = new Set();
    for (const contact of view.contacts.filter(item => item.available)) {
      assert.ok(typeof contact.contactId === 'string' && contact.contactId.length > 0,
        'The current available source contact id is malformed.');
      assert.ok(!seenContactIds.has(contact.contactId), 'The current source contact ids must be unique.');
      seenContactIds.add(contact.contactId);
      assert.ok(typeof contact.targetShipId === 'string' && supportedTargets.has(contact.targetShipId),
        'The current available source contact targetShipId is malformed.');
    }
    protectedShipRank = new Map(protectedShipPriority.map((target, index) => [target, index]));
  }
  const contacts = view.contacts.filter(contact => contact.available);
  const coverage = new Map(contacts.map(contact => [contact.contactId, contact.requiredCoverageDamage]));
  if (view.range === 'short-range') assert.ok(contacts.every(contact => contact.requiredCoverageDamage === null ||
    (Number.isSafeInteger(contact.requiredCoverageDamage) && contact.requiredCoverageDamage >= 0)), 'Current Short Range coverage is required.');
  const choices = view.hitSlots.filter(slot => !(view.range === 'medium-range' && view.eligibleActions.some(action =>
    action.actionId === slot.actionId && ['aegis-alpha-wing', 'aegis-bravo-wing'].includes(action.sourceId)))).map(slot => {
    assert.ok(Number.isSafeInteger(slot.count) && slot.count >= 0 && Number.isSafeInteger(slot.damagePerHit) && slot.damagePerHit > 0);
    const selected = [];
    for (let i = 0; i < Math.min(slot.count, contacts.length); i++) {
      const remaining = contacts.filter(contact => !selected.includes(contact.contactId));
      remaining.sort((a, b) => {
        const coverageOrder = Math.max(coverage.get(b.contactId) ?? 0, 0) - Math.max(coverage.get(a.contactId) ?? 0, 0);
        if (coverageOrder !== 0) return coverageOrder;
        if (protectedShipRank) {
          const targetOrder = (protectedShipRank.get(a.targetShipId) ?? protectedShipRank.size) -
            (protectedShipRank.get(b.targetShipId) ?? protectedShipRank.size);
          if (targetOrder !== 0) return targetOrder;
        }
        return (coverage.get(a.contactId) === null ? 0 : 1) - (coverage.get(b.contactId) === null ? 0 : 1);
      });
      const chosen = remaining[0].contactId; selected.push(chosen);
      if (typeof coverage.get(chosen) === 'number') coverage.set(chosen, Math.max(0, coverage.get(chosen) - slot.damagePerHit));
    }
    return { actionId: slot.actionId, contactIds: selected };
  });
  if (view.range === 'short-range') {
    const otherChosen = choices.some(choice => choice.contactIds.some(id => coverage.get(id) === null));
    assert.ok(!otherChosen || ![...coverage.values()].some(value => typeof value === 'number' && value > 0),
      'Source Short Range fighter coverage cannot be satisfied by this target plan.');
  }
  return choices;
}

/** These are normal GM choices, resolved to the occupied roster before any UI request. */
export function baseDeductionAssignments({ roster, holders, activeRoleIds, playerCount, scenario,
  intelligenceRoleId = 'quellon-explorer', wolfRoleId = 'refinery-124-pdf-colonel', variantRoleId = 'wing-commander', fleetSuspicionRoleIds }) {
  assert.equal(scenario, 'wolf-cult', 'This bounded explicit setup requires the normal Wolf Cult variant.');
  assert.ok(Number.isSafeInteger(playerCount) && playerCount >= 14 && playerCount <= 20);
  assert.equal(activeRoleIds.length, playerCount);
  const special = new Map([[wolfRoleId, 'wolf-agent'], [variantRoleId, 'wolf-cult'], [intelligenceRoleId, 'intelligence-agent']]);
  assert.equal(special.size, 3, 'Wolf, Cult and Intelligence require distinct actual holders.');
  assert.ok([...special.keys()].every(roleId => activeRoleIds.includes(roleId)));
  const entries = roster.map(actor => {
    const current = holders.filter(holder => holder.uid && uidHash(holder.uid) === actor.uidHash);
    assert.equal(current.length, 1, 'Use exactly one current original holder.');
    const holder = current[0];
    assert.equal(holder.role, 'player'); assert.equal(holder.replacementStatus ?? null, null);
    assert.equal(holder.replacementRoleId ?? null, null); assert.equal(holder.escapeState ?? null, null);
    if (actor.roleId === 'press-officer') {
      assert.equal(holder.activeConsoleRoleId, 'press-officer');
      assert.equal(holder.assignedRoleId ?? null, null); assert.equal(holder.seatId ?? null, null);
    } else {
      assert.ok(activeRoleIds.includes(actor.roleId)); assert.equal(holder.assignedRoleId, actor.roleId);
      assert.ok(typeof holder.seatId === 'string' && holder.seatId.length);
      assert.equal(holders.filter(value => value.assignedRoleId === actor.roleId && value.role === 'player').length, 1);
    }
    const kind = special.get(actor.roleId) ?? 'fleet-loyalist';
    return { roleId: actor.roleId, uid: holder.uid, kind,
      suspicion: kind === 'wolf-cult' ? 15 : kind === 'intelligence-agent' ? 6 : 0 };
  });
  assert.deepEqual(entries.filter(value => value.roleId !== 'press-officer').map(value => value.roleId).sort(), [...activeRoleIds].sort());
  const loyalists = entries.filter(value => value.kind === 'fleet-loyalist' && value.roleId !== 'press-officer');
  const suspicionRoles = fleetSuspicionRoleIds ?? loyalists.slice(0, 3).map(value => value.roleId);
  assert.ok(Array.isArray(suspicionRoles) && suspicionRoles.length === 3 && new Set(suspicionRoles).size === 3);
  assert.ok(suspicionRoles.every(roleId => loyalists.some(value => value.roleId === roleId)),
    'The two suspicion-five and one suspicion-ten cards need distinct actual core Loyalists.');
  for (const [i, roleId] of suspicionRoles.entries()) entries.find(value => value.roleId === roleId).suspicion = i < 2 ? 5 : 10;
  const order = ['wolf-agent', 'wolf-cult', 'intelligence-agent', 'fleet-loyalist'];
  return entries.sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind));
}

export function assertRequiredBaseBranches(branches, required) {
  for (const id of required) assert.equal(branches[id]?.status, 'committed',
    `${id} is uncredited: ${branches[id]?.blocker ?? 'not observed'}; next actor ${branches[id]?.nextActor ?? 'caller'}.`);
}

/** Captured real UI request; no replacement payload, role alias or caller dice. */
export async function captureBaseUiReceipt({ surface, endpoint, expectedActor,
  expectedRequest = {}, decision, record, verifyReplay = true }) {
  assertOriginalBaseActor(await surface.observe(), expectedActor);
  const response = await observeUiReceipt({
    waitForResponse: () => surface.page.waitForResponse(value => value.request().method() === 'POST' &&
      new URL(value.url()).pathname.endsWith(`/us-central1/${endpoint}`)), choose: decision,
  });
  const body = await response.json(), request = response.request().postDataJSON()?.data;
  const entry = { endpoint, uidHash: expectedActor.uidHash, cycle: expectedActor.cycle,
    roleId: expectedActor.profileRoleId, consoleRoleId: expectedActor.activeConsoleRoleId,
    expectedRevision: request?.expectedRevision, expectedTurn: request?.expectedTurn, expectedCycle: request?.expectedCycle,
    action: request?.action ?? request?.choice?.kind ?? request?.kind ?? request?.status ?? request?.use,
    httpStatus: response.status(), resultStatus: body.result?.status,
    requestFingerprint: proofHash(request ?? null), resultFingerprint: proofHash(body.result ?? null),
    transport: 'actual connected UI request', exactOriginalSdkReplay: false };
  await record(entry);
  assertOriginalBaseActor(await surface.observe(), expectedActor);
  assert.equal(response.status(), 200, `${endpoint} normal request denied: ${body.error?.message ?? response.status()}`);
  assert.ok(body.result); assert.notEqual(body.result.status, 'stale');
  assert.equal(request?.sessionId, expectedActor.sessionId);
  for (const [key, value] of Object.entries(expectedRequest)) assert.deepEqual(request?.[key], value, `Current source ${key} changed before the click.`);
  if (expectedActor.playerRole === 'gm') assert.equal(request.instanceId, expectedActor.instanceId);
  if (verifyReplay && request?.requestId) {
    const replay = await surface.callable(endpoint, request);
    assertOriginalBaseActor(await surface.observe(), expectedActor);
    assert.equal(replay.status, 'committed');
    const receiptStatus = value => ['committed', 'replayed'].includes(value?.status);
    const normalizeStatus = receiptStatus(replay.result) && receiptStatus(body.result);
    const semantic = value => { const result = { ...value }; if (normalizeStatus) delete result.status; return result; };
    assert.deepEqual(semantic(replay.result), semantic(body.result), 'Exact original request preserves every server consequence.');
    await record({ ...entry, exactOriginalSdkReplay: true });
  }
  return body.result;
}

/** Use the current holder's real route control; a transient unpainted link is not an optional branch. */
export async function openBaseEndeavourResearchRoute({ page, checkpoint }) {
  await checkpoint();
  if (new URL(page.url()).hash === '#/shuttles/endeavour') {
    await checkpoint();
    return;
  }
  const link = page.getByRole('link', { name: 'Open Endeavour shuttle console', exact: true });
  await link.waitFor();
  await checkpoint();
  await link.click();
  await page.waitForURL(url => url.hash === '#/shuttles/endeavour');
  await checkpoint();
}

/** Compare actual visible CIC text while preserving every source value and consequence. */
export function baseResearchPaintMatches(paint, workspace, receipt) {
  if (paint?.busy !== 'false' || paint.progressVisible !== true || !Array.isArray(paint.rows) ||
      !Array.isArray(workspace?.tracks) || !Array.isArray(workspace?.cadence?.choices)) return false;
  const track = workspace.tracks.find(value => value.trackId === 'wolf-agent-detector');
  if (!track || typeof track.name !== 'string' || !track.name ||
      !Number.isSafeInteger(track.crossedBoxes) || !Number.isSafeInteger(track.totalBoxes) ||
      track.crossedBoxes < 0 || track.totalBoxes < 1 || track.crossedBoxes > track.totalBoxes ||
      typeof track.complete !== 'boolean' ||
      (!track.complete && (!Number.isSafeInteger(track.currentMaterialCost) || track.currentMaterialCost < 0)) ||
      !Number.isSafeInteger(workspace.shepherdOre) || workspace.shepherdOre < 0) return false;
  const normalize = value => typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().toUpperCase() : '';
  const chosen = workspace.cadence.choices.some(value => value.trackId === track.trackId);
  const status = track.complete ? 'Research complete.' : chosen ? 'Chosen this cycle.' : 'Available for a research choice.';
  const fieldCost = track.complete ? 'no further field-upgrade cost.' : `next field-upgrade cost is ${track.currentMaterialCost} materials.`;
  const expectedRow = normalize(`${track.name}: ${track.crossedBoxes} of ${track.totalBoxes} boxes crossed; ${fieldCost} ${status}`);
  const rows = paint.rows.map(normalize).filter(row => row.startsWith(normalize(`${track.name}:`)));
  if (rows.length !== 1 || rows[0] !== expectedRow) return false;
  const standard = workspace.cadence.choices.filter(value => value.funding === 'standard').length;
  const ore = workspace.cadence.choices.filter(value => value.funding === 'shepherd-ore').length;
  const text = normalize(paint.text);
  if (!text.includes(normalize(`Cycle choices: ${standard} of 3 standard; ${ore} of 2 additional.`)) ||
      !text.includes(normalize(`Shepherd // ${workspace.shepherdOre} ore available`))) return false;
  if (receipt && !text.includes(normalize(`${track.name} advanced one research box.`)) &&
      !text.includes(normalize(`${track.name} research request was confirmed.`))) return false;
  return !track.complete || paint.detectorVisible === true;
}
