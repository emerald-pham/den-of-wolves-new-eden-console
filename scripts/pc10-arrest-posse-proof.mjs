import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { observeLifecycleActor } from './pc10-member-gm-lifecycle-ui-proof.mjs';
import { assertOriginalActor } from './pc10-member-gm-lifecycle-contracts.mjs';
import {
  assertFreshManualStart,
  assertGmInstanceFence,
  assertSimulatedAttendanceRoster,
  blockedSourceBranch,
  captureMountedUiAction,
  privateSafeActionReceipt,
} from './pc10-political-crisis-arrest-proof-contracts.mjs';

const FAMILY = 'pending-arrest-posse-disposition';
const CALCULATION_BRANCH = 'arrest-posse-calculation';
const ATTENDANCE_BRANCH = 'arrest-posse-simulated-attendance';
const DISPOSITION_BRANCH = 'arrest-prisoner-disposition';
const REQUIRED_ARREST_BRANCHES = new Set([CALCULATION_BRANCH, ATTENDANCE_BRANCH, DISPOSITION_BRANCH]);

function required(options, branch) {
  return options?.required === true || Array.isArray(options?.requiredBranches) && options.requiredBranches.includes(branch);
}

function blocked(branch, blockerCodes, options = {}) {
  return blockedSourceBranch(FAMILY, branch, blockerCodes, { required: required(options, branch) });
}

function missing(branch, options) {
  return blocked(branch, ['explicit-current-source-choice-not-supplied'], options);
}

/** Reject any target or virtual attendance identity not named by the caller and current roster. */
export function validatePosseChoice(choice, currentRosterRoleIds) {
  assert.ok(choice && typeof choice === 'object' && !Array.isArray(choice));
  const allowed = new Set(['targetRoleId', 'defenders', 'adjustment', 'presentRoleIds', 'attendanceEvidence']);
  assert.ok(Object.keys(choice).every(key => allowed.has(key)), 'Unknown arrest-posse choice.');
  assert.ok(Array.isArray(currentRosterRoleIds) && currentRosterRoleIds.length > 0 &&
    currentRosterRoleIds.every(roleId => typeof roleId === 'string' && roleId.length > 0),
  'Use a current prepared role roster.');
  assert.equal(new Set(currentRosterRoleIds).size, currentRosterRoleIds.length);
  assert.ok(currentRosterRoleIds.includes(choice.targetRoleId), 'Choose the target from the current roster.');
  assert.ok(Number.isSafeInteger(choice.defenders) && choice.defenders >= 0,
    'Choose an explicit non-negative whole defender count.');
  assert.ok(choice.adjustment === 'none' || choice.adjustment === -1 || choice.adjustment === 1,
    'Choose no adjustment, subtract one, or add one.');
  if (choice.presentRoleIds !== undefined) {
    assert.ok(Array.isArray(choice.presentRoleIds), 'Simulated attendance needs an explicit role list.');
    assert.equal(new Set(choice.presentRoleIds).size, choice.presentRoleIds.length,
      'Simulated posse roles must be distinct.');
    assert.ok(choice.presentRoleIds.every(roleId => currentRosterRoleIds.includes(roleId)),
      'Every simulated posse member must be from the current roster.');
    assert.equal(choice.presentRoleIds.includes(choice.targetRoleId), false,
      'The target cannot be included in the simulated posse.');
    assert.equal(choice.attendanceEvidence, 'simulated-demo',
      'Only the source-audited simulated-demo route is available to this proof.');
  } else if (choice.attendanceEvidence !== undefined) {
    assert.equal(choice.attendanceEvidence, 'simulated-demo');
  }
  return true;
}

export function validateArrestDispositionChoice(choice) {
  assert.ok(choice && typeof choice === 'object' && !Array.isArray(choice),
    'An explicit prisoner disposition choice is required.');
  const allowed = new Set(['targetRoleId', 'disposition', 'ruling']);
  assert.ok(Object.keys(choice).every(key => allowed.has(key)));
  assert.ok(['released', 'executed', 'facilitator-resolution'].includes(choice.disposition),
    'Choose only a source-offered prisoner disposition.');
  if (choice.targetRoleId !== undefined) assert.ok(typeof choice.targetRoleId === 'string' && choice.targetRoleId.length > 0);
  if (choice.disposition === 'facilitator-resolution') {
    assert.ok(typeof choice.ruling === 'string' && choice.ruling.trim().length > 0 && choice.ruling.length <= 240,
      'A late facilitator resolution requires an explicit reasoned ruling of at most 240 characters.');
  } else assert.equal(choice.ruling, undefined, 'A facilitator rationale is only offered for an overdue case.');
  return true;
}

export function assertRequiredArrestChoices(choices = {}) {
  assert.ok(choices && typeof choices === 'object' && !Array.isArray(choices));
  const allowed = new Set(['posse', 'disposition', 'requiredBranches']);
  assert.ok(Object.keys(choices).every(key => allowed.has(key)), 'Unknown arrest proof choice.');
  if (choices.requiredBranches !== undefined) {
    assert.ok(Array.isArray(choices.requiredBranches));
    for (const branch of choices.requiredBranches) {
      assert.ok(REQUIRED_ARREST_BRANCHES.has(branch), `Unknown required arrest branch: ${branch}`);
      if (branch === CALCULATION_BRANCH) assert.ok(choices.posse, `${branch} is required but no explicit target choice was supplied.`);
      if (branch === ATTENDANCE_BRANCH) assert.ok(choices.posse?.presentRoleIds !== undefined,
        `${branch} is required but no explicit simulated attendance choice was supplied.`);
      if (branch === DISPOSITION_BRANCH) assert.ok(choices.disposition,
        `${branch} is required but no explicit ruling choice was supplied.`);
    }
  }
  if (choices.disposition !== undefined) validateArrestDispositionChoice(choices.disposition);
  return true;
}

function validatePreparedAttendanceActor(actor, player, sessionId, label) {
  assert.ok(actor && player, `${label} must match an original prepared actor in the current census.`);
  assert.equal(actor.sessionId, sessionId, `${label} came from another session's prepared roster.`);
  assert.equal(player.sessionId, sessionId, `${label} came from another session's current census.`);
  assert.equal(player.uid, actor.uid, `${label} no longer matches its original prepared actor UID.`);
  assert.equal(player.role, 'player', `${label} must be an ordinary player account.`);
  assert.equal(player.connected, true, `${label} must be in the current connected census.`);
  assert.equal(player.displayName, actor.displayName, `${label} no longer has its original prepared display name.`);
  assert.equal(player.replacementStatus ?? null, null, `${label} is awaiting a replacement role.`);
  assert.equal(player.replacementRoleId ?? null, null, `${label} is a replacement actor.`);
  if (actor.roleId === 'press-officer') {
    assert.ok(player.assignedRoleId == null || player.assignedRoleId === 'press-officer',
      `${label} no longer matches the original Press actor.`);
  } else {
    assert.equal(player.assignedRoleId, actor.roleId,
      `${label} no longer holds its original prepared role.`);
  }
}

function validateCurrentDemoController(controller, player, sessionId) {
  assert.ok(controller, 'A current controller checkbox needs its original controller identity.');
  assert.equal(controller.sessionId, sessionId, 'The original controller belongs to another session.');
  assert.equal(controller.memberSessionId ?? controller.sessionId, sessionId,
    'The original controller membership belongs to another session.');
  assert.equal(controller.profileRoleId, 'controller', 'The current ordinary actor is not the original controller profile.');
  assert.equal(controller.sameActor, true, 'The current controller SDK identity no longer matches its session member.');
  assert.equal(controller.uid, controller.accountUid, 'The saved original controller account is unavailable.');
  assert.equal(controller.uid, controller.currentUid, 'The current controller SDK account changed.');
  assert.equal(controller.role, 'player', 'Only the ordinary controller may be mapped outside the prepared crew.');
  assert.equal(controller.connected, true, 'The original controller is not currently connected.');
  assert.equal(controller.connection, 'live', 'The original controller is not live.');
  assert.equal(controller.freshness, 'server', 'The original controller is not server-backed.');
  assert.equal(controller.seatId ?? null, null, 'The ordinary controller must remain unseated.');
  assert.equal(controller.assignedRoleId ?? null, null, 'The ordinary controller must remain unassigned.');
  assert.equal(controller.activeConsoleRoleId ?? null, null, 'The ordinary controller must not hold a console.');
  assert.equal(controller.replacementRoleId ?? null, null, 'A replacement actor cannot stand in for the controller.');
  assert.equal(controller.replacementStatus ?? null, null, 'A replacement-pending actor cannot stand in for the controller.');
  assert.ok(player, 'The original controller must appear in the current connected census.');
  assert.equal(player.sessionId, sessionId, 'The current controller census row belongs to another session.');
  assert.equal(player.uid, controller.uid, 'The current controller census UID changed.');
  assert.equal(player.displayName, controller.displayName, 'The current controller display name changed.');
  assert.equal(player.role, 'player', 'Only the ordinary controller may be mapped outside the prepared crew.');
  assert.equal(player.connected, true, 'The original controller is not in the current connected census.');
  assert.equal(player.seatId ?? null, null, 'The current controller census row is no longer unseated.');
  assert.equal(player.assignedRoleId ?? null, null, 'The current controller census row is no longer unassigned.');
  assert.equal(player.activeConsoleRoleId ?? null, null, 'The current controller census row holds a console.');
  assert.equal(player.replacementRoleId ?? null, null, 'The current controller census row is a replacement actor.');
  assert.equal(player.replacementStatus ?? null, null, 'The current controller census row is replacement-pending.');
}

/**
 * Reconcile actual connected-player source rows and mounted attendance labels
 * before mapping any simulated checkbox to an original prepared identity.
 */
export function resolveSimulatedAttendanceActors({ sessionId, roster, currentPlayers, visibleLabels,
  controller, choice, targetUid }) {
  assert.ok(typeof sessionId === 'string' && sessionId.length > 0, 'Use the current demo session.');
  assert.ok(Array.isArray(roster) && roster.length > 0, 'Use the original prepared demo roster.');
  const roleIds = roster.map(actor => actor?.roleId);
  validatePosseChoice(choice, roleIds);
  assert.ok(Array.isArray(currentPlayers) && currentPlayers.length > 0,
    'Use the server-backed current connected-player census.');
  assert.ok(Array.isArray(visibleLabels), 'Read the current mounted attendance options.');
  assert.ok(typeof targetUid === 'string' && targetUid.length > 0, 'Choose the original target account.');

  for (const actor of roster) {
    assert.equal(actor.sessionId, sessionId, 'Prepared actors must belong to the current demo session.');
    assert.ok(typeof actor.uid === 'string' && actor.uid.length > 0);
    assert.ok(typeof actor.displayName === 'string' && actor.displayName.trim().length > 0);
  }
  assert.equal(new Set(roleIds).size, roleIds.length, 'The prepared demo roles must be unique.');
  assert.equal(new Set(roster.map(actor => actor.uid)).size, roster.length,
    'The prepared demo accounts must be unique.');
  assert.equal(new Set(roster.map(actor => actor.displayName)).size, roster.length,
    'The original prepared actor names must be unique.');

  const rosterByUid = new Map(roster.map(actor => [actor.uid, actor]));
  const rosterByRoleId = new Map(roster.map(actor => [actor.roleId, actor]));
  const playersByUid = new Map();
  for (const player of currentPlayers) {
    assert.ok(player && typeof player === 'object' && typeof player.uid === 'string' && player.uid.length > 0,
      'The current connected-player census contains an invalid identity.');
    assert.equal(player.sessionId, sessionId, 'The current connected-player census includes another session.');
    assert.equal(player.connected, true, 'The current connected-player census is stale or disconnected.');
    assert.ok(player.role === 'player' || player.role === 'gm', 'The current player census contains an unknown actor role.');
    assert.equal(playersByUid.has(player.uid), false, 'The current connected-player census contains a duplicate UID.');
    playersByUid.set(player.uid, player);
  }
  assert.ok(playersByUid.has(targetUid), 'The target must remain in the current connected-player census.');
  const targetActor = rosterByRoleId.get(choice.targetRoleId);
  assert.ok(targetActor && targetActor.uid === targetUid,
    'The live target must match the original prepared role and UID.');
  validatePreparedAttendanceActor(targetActor, playersByUid.get(targetUid), sessionId, 'The arrest target');

  const controllerPlayer = controller?.uid ? playersByUid.get(controller.uid) : undefined;
  if (controllerPlayer) validateCurrentDemoController(controller, controllerPlayer, sessionId);

  const currentPlayerUids = currentPlayers.filter(player => player.role === 'player').map(player => player.uid);
  assert.equal(new Set(currentPlayerUids).size, currentPlayerUids.length,
    'The current ordinary-player census must be unique.');

  const expectedOptions = currentPlayers.filter(player => player.role === 'player' &&
    player.replacementStatus == null && player.uid !== targetUid);
  const expectedNames = expectedOptions.map(player => player.displayName);
  assert.ok(expectedNames.every(name => typeof name === 'string' && name.trim().length > 0),
    'Every current attendance option needs a source display name.');
  assert.equal(new Set(expectedNames).size, expectedNames.length,
    'Current attendance options must have unique display names.');
  assert.ok(visibleLabels.every(name => typeof name === 'string' && name.trim().length > 0),
    'Every mounted attendance option needs its exact visible display name.');
  assert.equal(new Set(visibleLabels).size, visibleLabels.length,
    'Mounted attendance option names must be unique.');
  assert.equal(visibleLabels.length, expectedNames.length,
    'Mounted attendance options do not match the current connected-player census.');
  const visibleNameSet = new Set(visibleLabels);
  assert.ok(expectedNames.every(name => visibleNameSet.has(name)),
    'Mounted attendance labels do not match the current connected-player census.');

  const currentPlayerByName = new Map(expectedOptions.map(player => [player.displayName, player]));
  const options = visibleLabels.map(label => {
    const player = currentPlayerByName.get(label);
    assert.ok(player, 'An unknown current checkbox option cannot be ignored.');
    const actor = rosterByUid.get(player.uid);
    if (actor) {
      validatePreparedAttendanceActor(actor, player, sessionId, 'The current attendance option');
      return { label, roleId: actor.roleId, uid: actor.uid, kind: 'prepared-actor' };
    }
    if (controller && player.uid === controller.uid) {
      validateCurrentDemoController(controller, player, sessionId);
      return { label, roleId: 'controller', uid: player.uid, kind: 'original-controller' };
    }
    assert.fail('A current attendance option must match an original prepared actor or the verified ordinary controller.');
  });
  const optionByRoleId = new Map(options.map(option => [option.roleId, option]));
  assert.equal(optionByRoleId.size, options.length, 'Current attendance actors must have unique roles.');
  const presentPlayerUids = choice.presentRoleIds.map(roleId => {
    const actor = rosterByRoleId.get(roleId);
    const option = optionByRoleId.get(roleId);
    assert.ok(actor && option && option.kind === 'prepared-actor' && option.uid === actor.uid,
      'Every selected simulated actor must match its original prepared role/UID and current checkbox option.');
    assert.notEqual(actor.uid, targetUid, 'The target cannot be included in the simulated posse.');
    return actor.uid;
  });
  const offeredRoleIds = new Set(options.filter(option => option.kind === 'prepared-actor')
    .map(option => option.roleId));
  return {
    options,
    currentPlayerUids,
    presentPlayerUids,
    pendingRoleIds: roster.filter(actor => actor.roleId !== choice.targetRoleId && !offeredRoleIds.has(actor.roleId))
      .map(actor => actor.roleId),
  };
}

export async function readOriginalPreparedDemoRoster(context, sessionId) {
  assert.ok(context?.crew?.page, 'The original prepared roster belongs to the current Crew browser.');
  assert.ok(typeof sessionId === 'string' && sessionId.length > 0,
    'Use the current full-game demo session for its prepared roster.');
  return context.crew.page.evaluate(async sid => {
    const [{ readDemoActorRoster }, { demoActorDisplayName }] = await Promise.all([
      import('/src/lib/demoActorProfiles.ts'), import('/src/lib/demoActorDisplayName.ts'),
    ]);
    return readDemoActorRoster(sid).map(actor => ({
      sessionId: actor.sessionId, roleId: actor.roleId, uid: actor.uid,
      displayName: demoActorDisplayName(actor.roleId),
    }));
  }, sessionId);
}

async function readCurrentConnectedPlayerCensus(surface, sessionId, targetUid, deadlineAt) {
  assert.ok(surface?.page, 'The live GM page is required for a current attendance census.');
  return surface.page.evaluate(async ({ currentSessionId, expectedTargetUid, deadlineAt }) => new Promise((resolve, reject) => {
    if (Date.now() >= deadlineAt) { reject(new Error('The original arrest attendance census deadline is exhausted.')); return; }
    let stop = () => undefined;
    let finished = false;
    const finish = (settle, value) => {
      if (finished) return;
      finished = true;
      window.clearTimeout(timeout);
      stop();
      settle(value);
    };
    const timeout = window.setTimeout(() => finish(reject,
      new Error('The server-backed connected-player census did not include the current target.')),
    Math.min(15_000, deadlineAt - Date.now()));
    void import('/src/lib/firestore.ts').then(({ subscribeConnectedPlayers }) => {
      if (finished || Date.now() >= deadlineAt) {
        finish(reject, new Error('The original arrest attendance census deadline is exhausted.')); return;
      }
      stop = subscribeConnectedPlayers(currentSessionId, players => {
        if (!Array.isArray(players) || !players.some(player => player.uid === expectedTargetUid)) return;
        finish(resolve, players.map(player => ({
          sessionId: player.sessionId,
          uid: player.uid,
          displayName: player.displayName,
          role: player.role,
          connected: player.connected,
          seatId: player.seatId,
          assignedRoleId: player.assignedRoleId,
          activeConsoleRoleId: player.activeConsoleRoleId,
          replacementRoleId: player.replacementRoleId,
          replacementStatus: player.replacementStatus,
        })));
      }, () => finish(reject, new Error('The current connected-player census could not be refreshed.')));
      if (finished) stop();
    }).catch(error => finish(reject,
      new Error(`The current connected-player census could not be read: ${error instanceof Error ? error.message : 'source import failed'}`)));
  }), { currentSessionId: sessionId, expectedTargetUid: targetUid, deadlineAt });
}

async function readCurrentDemoController(surface, sessionId) {
  if (!surface?.page) return null;
  return surface.page.evaluate(async currentSessionId => {
    const [{ auth }, { activeDemoActorProfile, readDemoActorAccountUid }, { useSessionStore }] = await Promise.all([
      import('/src/lib/firebase.ts'), import('/src/lib/demoActorContext.ts'),
      import('/src/store/useSessionStore.ts'),
    ]);
    const user = auth().currentUser;
    const state = useSessionStore.getState();
    const member = state.me;
    const session = state.session;
    const accountUid = readDemoActorAccountUid('controller');
    const profile = activeDemoActorProfile;
    if (!profile || profile.roleId !== 'controller' || profile.sessionId !== currentSessionId ||
        !user || !member || !session) return null;
    return {
      sessionId: session.id,
      memberSessionId: member.sessionId,
      profileRoleId: profile.roleId,
      uid: accountUid ?? null,
      accountUid: accountUid ?? null,
      currentUid: user.uid,
      displayName: member.displayName,
      role: member.role,
      sameActor: member.uid === user.uid,
      connection: state.connection,
      freshness: state.sessionSnapshotFreshness,
      connected: member.connected === true,
      seatId: member.seatId ?? null,
      assignedRoleId: member.assignedRoleId ?? null,
      activeConsoleRoleId: member.activeConsoleRoleId ?? null,
      replacementRoleId: member.replacementRoleId ?? null,
      replacementStatus: member.replacementStatus ?? null,
    };
  }, sessionId);
}

function assertActiveManualGm(state, context) {
  assert.ok(context.started && typeof context.started.uidHash === 'string' &&
    typeof context.started.instanceId === 'string',
  'The proof must retain the original Cycle 1 GM and owned instance snapshot.');
  const expected = { actorKind: 'gm', sessionId: context.initial.sessionId,
    uidHash: context.started.uidHash,
    instanceId: context.started.instanceId,
    cycle: state.cycle, phase: state.phase, turnStatePhase: state.turnStatePhase };
  assertGmInstanceFence(state, expected);
  const blockedBy = [];
  if (state.phase !== 'active') blockedBy.push('gameplay-not-active');
  if (state.fullGameDemo?.status !== 'active' || state.fullGameDemo?.progression !== 'manual') {
    blockedBy.push('not-active-manual-demo');
  }
  if (state.connection !== 'live' || state.freshness !== 'server') blockedBy.push('not-live-server-backed');
  return blockedBy;
}

function gmActor(context, state) {
  return { actorKind: 'gm', sessionId: context.initial.sessionId, uidHash: state.uidHash,
    instanceId: state.instanceId, cycle: state.cycle, phase: state.phase,
    turnStatePhase: state.turnStatePhase };
}

async function safeReceipt({ branch, endpoint, context, state, request, result, replay,
  simulatedAttendance = false }) {
  return privateSafeActionReceipt({ family: FAMILY, branch, endpoint,
    actor: { uidHash: state.uidHash, roleId: 'gm' }, sessionId: context.initial.sessionId,
    cycle: state.cycle, phase: state.phase, request, result, replay, simulatedAttendance });
}

function uidByRole(roster) {
  return new Map(roster.map(actor => [actor.roleId, actor.uid]));
}

function arrestOperationDeadline(context) {
  if (context.deadlineAt !== undefined) assert.ok(Number.isFinite(context.deadlineAt));
  // The source runner already gives mounted operations35s. Share that original
  // budget with source delivery and selection, including any caller deadline.
  return Math.min(Date.now() + 35_000, context.deadlineAt ?? Infinity);
}

function remainingTargetOperation(deadlineAt) {
  const remaining = deadlineAt - Date.now();
  assert.ok(remaining > 0, 'The original arrest target operation deadline is exhausted.');
  return { timeout: remaining };
}

function assertOriginalArrestTargetActor(original, current) {
  assertOriginalActor(original, current, { gm: true });
  for (const key of ['hydrationRevision', 'phase', 'cycle', 'setupRevision', 'turnStatePhase']) {
    assert.equal(current[key], original[key], `Original arrest target ${key} changed.`);
  }
  assert.equal(current.memberSessionId, original.sessionId, 'The original GM membership must remain in this session.');
  assert.equal(current.fullGameDemo?.status, 'active');
  assert.equal(current.fullGameDemo?.progression, 'manual');
}

/** Browser-only inspection of the source-owned private census and its exact mounted options. */
async function inspectArrestTargetSource({ moduleUrl, original, target, waitForCurrentOptions = false }) {
  const [{ auth }, { useSessionStore }] = await Promise.all([
    import('/src/lib/firebase.ts'), import(moduleUrl),
  ]);
  const state = useSessionStore.getState(), user = auth().currentUser, instance = state.gmInstance;
  const uidHash = user ? Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(user.uid))))
    .map(byte => byte.toString(16).padStart(2, '0')).join('').slice(0, 16) : null;
  const actor = { hasAuth: !!user, sameActor: !!user && state.me?.uid === user.uid, uidHash,
    sessionId: state.session?.id ?? null, memberSessionId: state.me?.sessionId ?? null,
    playerRole: state.me?.role ?? null, instanceId: instance?.id ?? null, claimedAt: instance?.claimedAt ?? null,
    gmInstanceOwned: !!instance && instance.uid === user?.uid && instance.sessionId === state.session?.id,
    generation: state.me?.connectionGeneration ?? null, hydrationRevision: state.identityHydrationRevision,
    connection: state.connection, freshness: state.sessionSnapshotFreshness,
    privateAudienceMatches: !state.roleBrief || state.roleBrief.assignmentUid === user?.uid,
    foreignPendingCount: state.pendingCommands.filter(command => command.payload?.sessionId &&
      command.payload.sessionId !== original.sessionId).length,
    cycle: state.session?.currentTurn ?? null, phase: state.session?.phase ?? null,
    setupRevision: state.session?.setupRevision ?? null, turnStatePhase: state.session?.turnState?.phase ?? null,
    fullGameDemo: state.session?.fullGameDemo ?? null };
  const authorityCurrent = ['uidHash', 'sessionId', 'instanceId', 'claimedAt', 'generation', 'hydrationRevision',
    'cycle', 'phase', 'setupRevision', 'turnStatePhase'].every(key => actor[key] === original[key]) &&
    actor.hasAuth && actor.sameActor && actor.gmInstanceOwned && actor.playerRole === 'gm' &&
    actor.memberSessionId === original.sessionId && actor.connection === 'live' && actor.freshness === 'server' &&
    actor.privateAudienceMatches && actor.foreignPendingCount === 0 &&
    actor.fullGameDemo?.status === 'active' && actor.fullGameDemo?.progression === 'manual';
  // The existing subscription accepts only its own server snapshots. Reading
  // this projection issues no SDK request and copies no card kind/suspicion.
  const census = state.gmLoyaltyCensus;
  const eligibleUids = (census?.entries ?? []).filter(entry => Number.isSafeInteger(entry.suspicion) &&
    entry.suspicion >= 0).map(entry => entry.uid);
  const panels = [...document.querySelectorAll('[aria-label="Arrest posse calculator"]')];
  const controls = panels.length === 1 ? [...panels[0].querySelectorAll('#arrest-posse-target')] : [];
  const select = controls.length === 1 ? controls[0] : null;
  const mount = { panelCount: panels.length, controlCount: controls.length,
    // This source label wraps the select; its option text is not its accessible name.
    label: select?.labels?.length === 1 ? [...select.labels[0].childNodes]
      .filter(node => node.nodeType === Node.TEXT_NODE).map(node => node.textContent).join('').trim() : null,
    disabled: select?.disabled ?? true, selectedValue: select?.value ?? '',
    options: select ? [...select.options].filter(option => option.value).map(option => ({
      uid: option.value, label: option.textContent?.trim(), disabled: option.disabled })) : [] };
  let status = 'blocked', blocker = 'target-not-in-current-facilitator-census-options';
  const pending = () => { status = 'pending'; blocker = 'current-facilitator-census-target-options-pending'; };
  if (!authorityCurrent) blocker = 'original-arrest-target-authority-changed';
  else if (mount.panelCount !== 1 || mount.controlCount !== 1 || mount.label !== 'Target player') {
    blocker = 'current-target-control-shape-or-accessible-name-mismatch';
  } else if (state.gmLoyaltyCensusStatus === 'loading') pending();
  else if (state.gmLoyaltyCensusStatus !== 'present' || !census ||
      !Number.isSafeInteger(census.revision) || census.revision < 0) {
    blocker = 'current-server-facilitator-census-unavailable';
  } else if (census.revision < original.setupRevision) pending();
  else if (eligibleUids.includes(target.uid)) {
    const values = mount.options.map(option => option.uid);
    const targetOption = mount.options.find(option => option.uid === target.uid);
    if (new Set(eligibleUids).size !== eligibleUids.length || new Set(values).size !== values.length ||
        values.some(uid => !eligibleUids.includes(uid))) blocker = 'current-target-options-do-not-match-exact-census-uids';
    else if (!targetOption || values.length !== eligibleUids.length) pending();
    else if (mount.disabled || targetOption.disabled) blocker = 'current-target-control-unavailable';
    else if (targetOption.label !== `${target.displayName} (${target.uid})`) {
      blocker = 'current-target-option-does-not-match-original-prepared-display-name-and-uid';
    } else { status = 'ready'; blocker = null; }
  }
  const result = { actor, status, blocker, censusRevision: census?.revision ?? null, eligibleUids, mount };
  return waitForCurrentOptions && status === 'pending' && authorityCurrent ? false : result;
}

function mountedArrestTargetSelect(region) {
  return region.getByRole('combobox', { name: 'Target player', exact: true })
    .and(region.locator('#arrest-posse-target'));
}

async function selectTargetFromLiveCensus(context, region, choice, roster, state, deadlineAt) {
  const targetSelect = mountedArrestTargetSelect(region);
  const targetUid = uidByRole(roster).get(choice.targetRoleId);
  if (!targetUid) return { blocker: 'target-role-has-no-current-demo-auth-account' };
  const target = roster.find(actor => actor.roleId === choice.targetRoleId);
  assert.equal(target.sessionId, context.initial.sessionId, 'The target must belong to the original prepared session.');
  assert.ok(typeof target.uid === 'string' && target.uid.length > 0 &&
    typeof target.displayName === 'string' && target.displayName.length > 0);
  assert.equal(roster.filter(actor => actor.uid === targetUid).length, 1, 'The original target UID must be unique.');
  if (Date.now() >= deadlineAt) return { blocker: 'original-arrest-target-operation-deadline-exhausted' };
  const original = { ...state, ...await observeLifecycleActor(context.gm, context.initial.sessionId),
    memberSessionId: context.initial.sessionId };
  assertGmInstanceFence(original, gmActor(context, state));
  assert.ok(typeof original.claimedAt === 'string' && original.claimedAt.length > 0,
    'Retain the original GM claim before waiting for its census.');
  assert.ok(Number.isSafeInteger(original.hydrationRevision) && original.hydrationRevision >= 0);
  assert.ok(Number.isSafeInteger(original.setupRevision) && original.setupRevision >= 0);
  assertOriginalArrestTargetActor(original, original);
  const input = { moduleUrl: context.gm.storeModuleUrl(), original, target };
  let source = await context.gm.page.evaluate(inspectArrestTargetSource, input);
  assertOriginalArrestTargetActor(original, source.actor);
  if (source.status === 'pending') {
    let handle;
    try {
      handle = await context.gm.page.waitForFunction(inspectArrestTargetSource,
        { ...input, waitForCurrentOptions: true }, { ...remainingTargetOperation(deadlineAt), polling: 'raf' });
      source = await handle.jsonValue();
    } catch (error) {
      if (error.name !== 'TimeoutError') throw error;
      return { blocker: 'current-facilitator-census-target-options-pending-at-original-deadline' };
    } finally { await handle?.dispose(); }
    assertOriginalArrestTargetActor(original, source.actor);
  }
  if (source.status !== 'ready') return { blocker: source.blocker };
  await targetSelect.selectOption(targetUid, remainingTargetOperation(deadlineAt));
  const after = await context.gm.page.evaluate(inspectArrestTargetSource, input);
  assertOriginalArrestTargetActor(original, after.actor);
  if (Date.now() >= deadlineAt || after.status !== 'ready' || after.censusRevision !== source.censusRevision ||
      after.mount.selectedValue !== targetUid ||
      JSON.stringify(after.eligibleUids) !== JSON.stringify(source.eligibleUids)) {
    return { blocker: 'current-target-census-or-control-changed-before-arrest-action' };
  }
  return { targetUid, visibleTargetUids: after.mount.options.map(option => option.uid), original, target,
    censusRevision: after.censusRevision, eligibleUids: after.eligibleUids };
}

/** One private source subscription held only in this accepted GM document. */
async function openCurrentArrestCalculation({ moduleUrl, original, target, eligibleUids, expected, deadlineAt }) {
  const [{ auth }, { useSessionStore }, { parseArrestPosseCalculation, subscribeGmArrestPosseCalculation }] = await Promise.all([
    import('/src/lib/firebase.ts'), import(moduleUrl), import('/src/lib/firestore.ts'),
  ]);
  const parsed = parseArrestPosseCalculation(expected, original.sessionId);
  if (!parsed || Object.keys(expected).some(key => expected[key] !== parsed[key])) {
    throw new Error('current-arrest-calculation-source-result-malformed');
  }
  let projection, stopped = false, frame, timeout, settleWait;
  let stop = () => undefined;
  const close = () => {
    if (stopped) return;
    stopped = true;
    window.cancelAnimationFrame(frame);
    window.clearTimeout(timeout);
    stop();
  };
  const inspect = async () => {
    const user = auth().currentUser;
    const uidHash = user ? Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(user.uid))))
      .map(byte => byte.toString(16).padStart(2, '0')).join('').slice(0, 16) : null;
    const state = useSessionStore.getState(), instance = state.gmInstance;
    const actor = { hasAuth: !!user, sameActor: !!user && state.me?.uid === user.uid && auth().currentUser?.uid === user.uid,
      uidHash, sessionId: state.session?.id ?? null, memberSessionId: state.me?.sessionId ?? null,
      playerRole: state.me?.role ?? null, instanceId: instance?.id ?? null, claimedAt: instance?.claimedAt ?? null,
      gmInstanceOwned: !!instance && instance.uid === user?.uid && instance.sessionId === state.session?.id,
      generation: state.me?.connectionGeneration ?? null, hydrationRevision: state.identityHydrationRevision,
      connection: state.connection, freshness: state.sessionSnapshotFreshness,
      privateAudienceMatches: !state.roleBrief || state.roleBrief.assignmentUid === user?.uid,
      foreignPendingCount: state.pendingCommands.filter(command => command.payload?.sessionId &&
        command.payload.sessionId !== original.sessionId).length,
      cycle: state.session?.currentTurn ?? null, phase: state.session?.phase ?? null,
      setupRevision: state.session?.setupRevision ?? null, turnStatePhase: state.session?.turnState?.phase ?? null,
      fullGameDemo: state.session?.fullGameDemo ?? null };
    const result = (status, blocker = null) => {
      if (status === 'blocked') close();
      return { status, blocker, actor };
    };
    const authorityCurrent = ['uidHash', 'sessionId', 'instanceId', 'claimedAt', 'generation', 'hydrationRevision',
      'cycle', 'phase', 'setupRevision', 'turnStatePhase'].every(key => actor[key] === original[key]) &&
      actor.hasAuth && actor.sameActor && actor.gmInstanceOwned && actor.playerRole === 'gm' &&
      actor.memberSessionId === original.sessionId && actor.connection === 'live' && actor.freshness === 'server' &&
      actor.privateAudienceMatches && actor.foreignPendingCount === 0 &&
      actor.fullGameDemo?.status === 'active' && actor.fullGameDemo?.progression === 'manual';
    if (!authorityCurrent) return result('blocked', 'original-arrest-calculation-document-authority-changed');
    if (stopped || Date.now() >= deadlineAt) return result('blocked', 'current-arrest-calculation-readiness-original-deadline-exhausted');
    if (projection === undefined) return result('pending');
    if (projection === null) return result('blocked', 'current-arrest-calculation-source-missing-or-invalid');
    const current = parseArrestPosseCalculation(projection, original.sessionId);
    if (!current || Object.keys(parsed).some(key => current[key] !== parsed[key]) ||
        Object.keys(current).some(key => current[key] !== parsed[key])) {
      return result('blocked', 'current-arrest-calculation-projection-does-not-match-original-ui-result');
    }
    if (state.communicationError?.code === 'gm-arrest-posse-link') {
      return result('blocked', 'current-arrest-calculation-source-subscription-unavailable');
    }
    if (state.gmLoyaltyCensusStatus === 'loading') return result('pending');
    const census = state.gmLoyaltyCensus;
    const currentUids = (census?.entries ?? []).filter(entry => Number.isSafeInteger(entry.suspicion) &&
      entry.suspicion >= 0).map(entry => entry.uid);
    if (state.gmLoyaltyCensusStatus !== 'present' || census?.revision !== parsed.censusRevision ||
        currentUids.length !== eligibleUids.length || new Set(currentUids).size !== currentUids.length ||
        currentUids.some(uid => !eligibleUids.includes(uid))) {
      return result('blocked', 'current-arrest-calculation-census-changed-or-unavailable');
    }
    const panels = [...document.querySelectorAll('[aria-label="Arrest posse calculator"]')];
    if (!panels.length) return result('pending');
    if (panels.length !== 1) return result('blocked', 'current-arrest-calculation-mount-ambiguous');
    const panel = panels[0], controls = ['target', 'defenders', 'adjustment'].map(name =>
      [...panel.querySelectorAll(`#arrest-posse-${name}`)]);
    if (controls.some(matches => matches.length > 1)) return result('blocked', 'current-arrest-calculation-mount-ambiguous');
    if (controls.some(matches => matches.length === 0)) return result('pending');
    const [select, defenders, adjustment] = controls.map(matches => matches[0]);
    const names = [select, defenders, adjustment].map(control => control.labels?.length === 1 ? [...control.labels[0].childNodes]
      .filter(node => node.nodeType === Node.TEXT_NODE).map(node => node.textContent).join('').trim() : null);
    const options = [...select.options].filter(option => option.value), values = options.map(option => option.value);
    if (JSON.stringify(names) !== JSON.stringify(['Target player', 'Defenders', 'Optional adjustment']) ||
        values.length !== currentUids.length || new Set(values).size !== values.length || values.some(uid => !currentUids.includes(uid)) ||
        options.some(option => option.disabled) ||
        options.find(option => option.value === target.uid)?.textContent?.trim() !== `${target.displayName} (${target.uid})` ||
        select.value !== parsed.targetUid || defenders.value !== String(parsed.defenders) ||
        adjustment.value !== (parsed.adjustment === undefined ? 'none' : String(parsed.adjustment))) {
      return result('blocked', 'current-arrest-calculation-inputs-or-target-options-changed');
    }
    const counts = [...panel.querySelectorAll('.gm-arrest-posse__result')];
    const groups = [...panel.querySelectorAll('.gm-arrest-posse__attendance')];
    if (!counts.length || !groups.length) return result('pending');
    if (counts.length !== 1 || groups.length !== 1 || counts[0].getAttribute('role') !== 'status' ||
        counts[0].textContent.trim().replace(/\s+/g, ' ') !== `${parsed.requiredPlayers} players needed` ||
        groups[0].getAttribute('role') !== 'group' || groups[0].getAttribute('aria-label') !== 'Simulated posse attendance') {
      return result('blocked', 'current-arrest-calculation-mount-does-not-match-original-ui-result');
    }
    if ([panel, counts[0], groups[0]].some(element => element.getClientRects().length === 0) ||
        [select, defenders, adjustment, groups[0]].some(element => element.disabled)) return result('pending');
    return result('ready');
  };
  const initial = await inspect();
  if (initial.status === 'blocked') throw new Error(initial.blocker);
  const remaining = deadlineAt - Date.now();
  if (remaining <= 0) throw new Error('current-arrest-calculation-readiness-original-deadline-exhausted');
  timeout = window.setTimeout(() => {
    close(); settleWait?.({ status: 'blocked', blocker: 'current-arrest-calculation-readiness-original-deadline-exhausted' });
  }, remaining);
  try {
    stop = subscribeGmArrestPosseCalculation(original.sessionId,
      next => { if (!stopped) projection = next; }, () => { if (!stopped) projection = null; });
  } catch (error) { close(); throw error; }
  return { inspect, close, wait: () => new Promise((resolve, reject) => {
    settleWait = resolve;
    const check = async () => {
      try {
        const value = await inspect();
        if (value.status !== 'pending') resolve(value);
        else frame = window.requestAnimationFrame(check);
      } catch (error) { close(); reject(error); }
    };
    void check();
  }) };
}

async function runCalculation(context, choice, options, deadlineAt) {
  const branch = CALCULATION_BRANCH;
  const state = await context.gm.observe();
  const blockedBy = assertActiveManualGm(state, context);
  if (blockedBy.length) return blocked(branch, blockedBy, options);
  const roster = await readOriginalPreparedDemoRoster(context, context.initial.sessionId);
  const roleIds = roster.map(actor => actor.roleId);
  validatePosseChoice({ ...choice, presentRoleIds: undefined, attendanceEvidence: undefined }, roleIds);
  const panel = context.gm.page.getByRole('region', { name: 'Arrest posse calculator', exact: true });
  if (!(await panel.isVisible().catch(() => false))) return blocked(branch,
    ['verified-current-GM-census-and-arrest-calculator-not-mounted'], options);
  const target = await selectTargetFromLiveCensus(context, panel, choice, roster, state, deadlineAt);
  if (target.blocker) return blocked(branch, [target.blocker], options);
  await panel.getByLabel('Defenders', { exact: true }).fill(String(choice.defenders), remainingTargetOperation(deadlineAt));
  await panel.getByRole('combobox', { name: 'Optional adjustment', exact: true })
    .and(panel.locator('#arrest-posse-adjustment'))
    .selectOption(String(choice.adjustment), remainingTargetOperation(deadlineAt));
  const currentCalculation = panel.getByText(/\d+ players needed$/, { exact: false });
  if (await currentCalculation.isVisible().catch(() => false)) return blocked(branch,
    ['matching-server-posse-calculation-already-exists-no-new-revision-created'], options);
  const button = panel.getByRole('button', { name: 'Calculate required players', exact: true });
  if (!(await button.isEnabled().catch(() => false))) return blocked(branch,
    ['source-calculation-disabled-by-live-census-or-authority'], options);
  const { request, result, replay } = await captureMountedUiAction({ surface: context.gm,
    endpoint: 'calculateArrestPosse', expectedActor: gmActor(context, state),
    executeUi: () => button.click(remainingTargetOperation(deadlineAt)) });
  for (const key of ['sessionId', 'targetUid', 'defenders', 'adjustment']) {
    assert.equal(result[key], request[key], `The calculation ${key} must match its original UI request.`);
  }
  assert.equal(request.targetUid, target.targetUid);
  assert.equal(request.defenders, choice.defenders);
  assert.equal(request.adjustment, choice.adjustment === 'none' ? undefined : choice.adjustment);
  assert.equal(result.requestId, request.requestId);
  assert.equal(result.revision, request.expectedRevision + 1);
  assert.equal(result.censusRevision, target.censusRevision);
  return { receipt: await safeReceipt({ branch, endpoint: 'calculateArrestPosse', context, state, request, result, replay }),
    roster, targetUid: target.targetUid, target, calculation: result };
}

async function runSimulatedAttendance(context, choice, options, calculated, deadlineAt) {
  const branch = ATTENDANCE_BRANCH;
  const { roster, targetUid, target, calculation: expected } = calculated;
  const state = await context.gm.observe();
  const blockedBy = assertActiveManualGm(state, context);
  if (blockedBy.length) return blocked(branch, blockedBy, options);
  if (state.fullGameDemo?.status !== 'active' || state.fullGameDemo?.progression !== 'manual') {
    return blocked(branch, ['source-simulated-attendance-requires-active-manual-demo'], options);
  }
  if (Date.now() >= deadlineAt) return blocked(branch,
    ['current-arrest-calculation-readiness-original-deadline-exhausted'], options);
  // The capture's existing reload creates a new document. Certify its current
  // generation/hydration once, while retaining the original UID/session/claim.
  const original = { ...state, ...await observeLifecycleActor(context.gm, context.initial.sessionId),
    memberSessionId: context.initial.sessionId };
  assertOriginalArrestTargetActor({ ...target.original, generation: original.generation,
    hydrationRevision: original.hydrationRevision }, original);
  assert.ok(Number.isSafeInteger(original.hydrationRevision) && original.hydrationRevision >= 0);
  let source;
  try {
    source = await context.gm.page.evaluateHandle(openCurrentArrestCalculation,
      { moduleUrl: context.gm.storeModuleUrl(), original, target: target.target,
        eligibleUids: target.eligibleUids, expected, deadlineAt });
    const current = await source.evaluate(reader => reader.wait());
    if (current.status !== 'ready') return blocked(branch, [current.blocker], options);
    assertOriginalArrestTargetActor(original, current.actor);
    const panel = context.gm.page.getByRole('region', { name: 'Arrest posse calculator', exact: true });
    const calculation = panel.getByText(/^\d+ players needed$/, { exact: false });
    if (!(await calculation.isVisible().catch(() => false))) return blocked(branch,
      ['current-census-posse-calculation-required-before-attendance'], options);
    const group = panel.getByRole('group', { name: 'Simulated posse attendance', exact: true });
    if (!(await group.isVisible().catch(() => false))) return blocked(branch,
      ['source-simulated-attendance-control-not-mounted'], options);
    if (await panel.getByText('Demo result based on simulated attendance.', { exact: true }).isVisible().catch(() => false)) {
      return blocked(branch, ['simulated-posse-result-already-exists-no-new-attendance-created'], options);
    }
    const labels = await group.locator('label').all();
    const visibleLabels = await Promise.all(labels.map(async label => (await label.innerText(remainingTargetOperation(deadlineAt))).trim()));
    remainingTargetOperation(deadlineAt);
    const currentPlayers = await readCurrentConnectedPlayerCensus(context.gm, context.initial.sessionId, targetUid, deadlineAt);
    const controller = await readCurrentDemoController(context.crew, context.initial.sessionId);
    const mapped = resolveSimulatedAttendanceActors({ sessionId: context.initial.sessionId,
      roster, currentPlayers, visibleLabels, controller, choice, targetUid });
    const controlsByRole = new Map();
    for (let index = 0; index < labels.length; index += 1) {
      const actor = mapped.options[index];
      assert.equal(actor.label, visibleLabels[index]);
      const checkbox = labels[index].locator('input[type="checkbox"]');
      assert.equal(await checkbox.count(), 1);
      controlsByRole.set(actor.roleId, checkbox);
    }
    assertSimulatedAttendanceRoster({ demo: state.fullGameDemo, currentPlayerUids: mapped.currentPlayerUids,
      targetUid, presentPlayerUids: mapped.presentPlayerUids,
      attendanceEvidence: 'simulated-demo', physicalAttendance: false });
    const selectedRoles = new Set(choice.presentRoleIds);
    for (const [roleId, checkbox] of controlsByRole) {
      if (selectedRoles.has(roleId)) await checkbox.check(remainingTargetOperation(deadlineAt));
      else if (await checkbox.isChecked(remainingTargetOperation(deadlineAt))) await checkbox.uncheck(remainingTargetOperation(deadlineAt));
    }
    if (await mountedArrestTargetSelect(panel).inputValue(remainingTargetOperation(deadlineAt)) !== targetUid) {
      return blocked(branch, ['current-target-select-no-longer-matches-the-posse-calculation-target'], options);
    }
    const after = await source.evaluate(reader => reader.inspect());
    if (after.status !== 'ready') return blocked(branch,
      [after.blocker ?? 'current-arrest-calculation-readiness-no-longer-current'], options);
    assertOriginalArrestTargetActor(original, after.actor);
    const button = panel.getByRole('button', { name: 'Simulate attendance', exact: true });
    if (!(await button.isEnabled().catch(() => false))) return blocked(branch,
      ['source-attendance-disabled-until-calculation-and-current-inputs-match'], options);
    const { request, result, replay } = await captureMountedUiAction({ surface: context.gm,
      endpoint: 'resolveArrestPosse', expectedActor: gmActor(context, state), executeUi: async () => {
        const before = await source.evaluate(reader => reader.inspect());
        if (before.status !== 'ready') blocked(branch,
          [before.blocker ?? 'current-arrest-calculation-readiness-no-longer-current'], { required: true });
        assertOriginalArrestTargetActor(original, before.actor);
        try { await button.click(remainingTargetOperation(deadlineAt)); }
        finally {
          // Release this document's read before the capture's legitimate reload.
          await source.evaluate(reader => reader.close()); await source.dispose(); source = null;
        }
      } });
    assert.equal(request.expectedRevision, expected.revision);
    assert.equal(request.expectedCycle, original.cycle);
    assert.equal(request.targetUid, targetUid);
    assert.equal(request.attendanceEvidence, 'simulated-demo');
    assert.deepEqual([...request.presentPlayerUids].sort(), [...mapped.presentPlayerUids].sort());
    assert.equal(result.requiredPlayers, expected.requiredPlayers);
    const restored = { ...await context.gm.observe(), ...await observeLifecycleActor(context.gm, context.initial.sessionId),
      memberSessionId: context.initial.sessionId };
    assertOriginalArrestTargetActor({ ...original, generation: restored.generation,
      hydrationRevision: restored.hydrationRevision }, restored);
    assert.ok(Number.isSafeInteger(restored.hydrationRevision) && restored.hydrationRevision >= 0);
    remainingTargetOperation(deadlineAt);
    return safeReceipt({ branch, endpoint: 'resolveArrestPosse', context, state, request, result, replay,
      simulatedAttendance: true });
  } finally {
    if (source) { try { await source.evaluate(reader => reader.close()); } finally { await source.dispose(); } }
  }
}

/** Calculate and optionally submit only explicitly selected simulated attendance. */
export async function proveArrestPosse(context, choice = undefined, options = {}) {
  if (required(options, ATTENDANCE_BRANCH) && choice?.presentRoleIds === undefined) {
    return missing(ATTENDANCE_BRANCH, options);
  }
  if (choice === undefined) return missing(CALCULATION_BRANCH, options);
  const deadlineAt = arrestOperationDeadline(context);
  const roster = await readOriginalPreparedDemoRoster(context, context.initial.sessionId);
  const roleIds = roster.map(actor => actor.roleId);
  validatePosseChoice(choice, roleIds);
  const calculated = await runCalculation(context, choice, options, deadlineAt);
  if (calculated?.accepted === false) return calculated;
  const result = [calculated.receipt];
  if (choice.presentRoleIds !== undefined) {
    const attendance = await runSimulatedAttendance(context, choice, options, calculated, deadlineAt);
    if (attendance.accepted === false) result.push(attendance); else result.push(attendance);
  } else result.push(missing(ATTENDANCE_BRANCH, options));
  return saveEvidence(context, { family: FAMILY, accepted: result.filter(row => row.accepted !== false),
    blocked: result.filter(row => row.accepted === false), actualHumanAttendance: false,
    simulatedAttendanceOnly: true, privatePosseResultPersisted: false });
}

async function runDisposition(context, choice, options, deadlineAt) {
  const branch = DISPOSITION_BRANCH;
  const state = await context.gm.observe();
  const blockedBy = assertActiveManualGm(state, context);
  if (blockedBy.length) return blocked(branch, blockedBy, options);
  const roster = await readOriginalPreparedDemoRoster(context, context.initial.sessionId);
  const targetRoleId = choice.targetRoleId;
  if (!roster.some(actor => actor.roleId === targetRoleId)) return blocked(branch,
    ['target-role-not-in-current-demo-roster'], options);
  const panel = context.gm.page.getByRole('region', { name: 'Arrest posse calculator', exact: true });
  if (!(await panel.isVisible().catch(() => false))) return blocked(branch,
    ['verified-current-GM-census-and-arrest-calculator-not-mounted'], options);
  const target = await selectTargetFromLiveCensus(context, panel, { targetRoleId }, roster, state, deadlineAt);
  if (target.blocker) return blocked(branch, [target.blocker], options);
  const casePanel = panel.getByRole('region', { name: 'Arrested prisoner case', exact: true });
  if (!(await casePanel.isVisible().catch(() => false))) return blocked(branch,
    ['no-current-server-backed-pending-prisoner-case-for-selected-target'], options);
  let button;
  if (choice.disposition === 'released') button = casePanel.getByRole('button', { name: 'Release prisoner', exact: true });
  if (choice.disposition === 'executed') button = casePanel.getByRole('button', { name: 'Execute prisoner', exact: true });
  if (choice.disposition === 'facilitator-resolution') {
    await casePanel.getByLabel('Facilitator ruling', { exact: true }).fill(choice.ruling, remainingTargetOperation(deadlineAt));
    button = casePanel.getByRole('button', { name: 'Record facilitator resolution', exact: true });
  }
  if (!(await button.isVisible().catch(() => false)) || !(await button.isEnabled().catch(() => false))) {
    return blocked(branch, [choice.disposition === 'facilitator-resolution'
      ? 'reasoned-facilitator-ruling-not-in-current-overdue-window'
      : 'selected-release-or-execution-control-not-in-current-deadline-team-window'], options);
  }
  const { request, result, replay } = await captureMountedUiAction({ surface: context.gm,
    endpoint: 'resolveArrestCaseDisposition', expectedActor: gmActor(context, state),
    executeUi: () => button.click(remainingTargetOperation(deadlineAt)) });
  return safeReceipt({ branch, endpoint: 'resolveArrestCaseDisposition', context, state, request, result, replay });
}

/** Record a current source-offered case decision; this never advances a cycle or creates an arrest. */
export async function proveArrestCaseDisposition(context, choice = undefined, options = {}) {
  if (choice === undefined) return missing(DISPOSITION_BRANCH, options);
  validateArrestDispositionChoice(choice);
  if (typeof choice.targetRoleId !== 'string') return blocked(DISPOSITION_BRANCH,
    ['explicit-original-target-role-not-selected'], options);
  const receipt = await runDisposition(context, choice, options, arrestOperationDeadline(context));
  if (receipt.accepted === false) return receipt;
  return saveEvidence(context, { family: FAMILY, accepted: [receipt], blocked: [],
    rawTargetIdentityPersisted: false, facilitatorRulingPersisted: false, physicalAttendanceProof: false });
}

async function saveEvidence(context, report) {
  const directory = resolve(context.directory ?? process.env.PC10_EVIDENCE_DIRECTORY ?? '/tmp/dow-pc10-evidence');
  const outputDirectory = resolve(directory, 'finite-action-families');
  await mkdir(outputDirectory, { recursive: true });
  const output = resolve(outputDirectory, `arrest-posse-${randomUUID()}.json`);
  const safe = { schemaVersion: 1, ...report, runtimeBinding: 'Parent-owned fresh run must bind the actual product and compiled runtime before and after execution.' };
  await writeFile(output, `${JSON.stringify(safe, null, 2)}\n`, { flag: 'wx' });
  return { ...safe, evidencePath: output };
}

/** Called at actual start and later only after the real GM advances the case to an offered ruling window. */
export async function proveArrestPosseAndDisposition(context, choices = {}) {
  assertRequiredArrestChoices(choices);
  if (context.started) {
    const current = await context.gm.observe();
    assertFreshManualStart({ gm: current, started: context.started, initial: context.initial });
  }
  const posse = await proveArrestPosse(context, choices.posse, choices);
  return posse;
}

export function createArrestPosseCallbacks(choices = {}) {
  return Object.freeze({ onStarted: context => proveArrestPosseAndDisposition(context, choices),
    onArrestPosse: context => proveArrestPosse(context, choices.posse, choices),
    onArrestDisposition: context => proveArrestCaseDisposition(context, choices.disposition, choices) });
}
