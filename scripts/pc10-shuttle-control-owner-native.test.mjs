import assert from 'node:assert/strict';
import { createHash, webcrypto } from 'node:crypto';
import test from 'node:test';
import { createPendingProcedureDefaultSteps } from './pc10-pending-procedure-ui-recipes.mjs';
import { captureMountedProcedureAction } from './pc10-pending-procedure-ui-proof.mjs';

const SESSION_ID = 'shuttle-control-owner-session';
const GROUP_ID = 'fleet-control-blue';
const SHUTTLE_ID = 'blacksmith';
const OWNER_UID = 'printed-owner-auth-uid';
const OWNER_ROLE = 'icebreaker-engineer';
const HOLDER_UID = 'borrowed-holder-auth-uid';
const HOLDER_ROLE = 'quellon-explorer';
const RECIPIENT_UID = 'connected-recipient-auth-uid';
const CYCLE = 2;
const CONTROL_REVISION = 5;
const hashUid = uid => createHash('sha256').update(uid).digest('hex').slice(0, 16);
const OWNER_HASH = hashUid(OWNER_UID);
const HOLDER_HASH = hashUid(HOLDER_UID);

function control(overrides = {}) {
  return { shuttleId: SHUTTLE_ID, ownerRoleId: OWNER_ROLE, ownerUid: OWNER_UID,
    holderUid: HOLDER_UID, revision: CONTROL_REVISION, ...overrides };
}

function sourceSnapshot(currentControl = control()) {
  return { live: true, sessionId: SESSION_ID, phase: 'active', cycle: CYCLE,
    holderGroupId: GROUP_ID, activeVesselIds: ['icebreaker', 'dione'],
    activeRoleIds: [OWNER_ROLE, HOLDER_ROLE],
    shipFleetGroupIds: { icebreaker: GROUP_ID, dione: GROUP_ID },
    shuttleControl: { [SHUTTLE_ID]: currentControl },
    shuttleDockings: [{ shuttleId: SHUTTLE_ID, shipId: 'icebreaker', dockedAt: '2026-10-06T12:00:00.000Z' }] };
}

function memberStore({ uid, roleId, currentControl = control() }) {
  const session = { id: SESSION_ID, currentTurn: CYCLE, phase: 'active',
    playerDiscovery: { groupId: GROUP_ID }, activeVesselIds: ['icebreaker', 'dione'],
    activeRoleIds: [OWNER_ROLE, HOLDER_ROLE],
    memberSessionScope: { groupId: GROUP_ID, vesselIds: ['icebreaker', 'dione'], craftIds: [SHUTTLE_ID] },
    currentActorBerthAuthority: { sessionId: SESSION_ID, actorUid: uid, groupId: GROUP_ID,
      role: 'player', connectionGeneration: 6, assignedRoleId: roleId, activeConsoleRoleId: roleId,
      replacementRoleId: null, replacementStatus: null, shipId: 'icebreaker' },
    shuttleControl: { [SHUTTLE_ID]: currentControl },
    shuttleDockings: [{ shuttleId: SHUTTLE_ID, shipId: 'icebreaker', dockedAt: '2026-10-06T12:00:00.000Z' }] };
  return { connection: 'live', sessionSnapshotFreshness: 'server', identityHydrationRevision: 9,
    me: { role: 'player', connected: true, replacementStatus: null, sessionId: SESSION_ID, uid,
      fleetGroupId: GROUP_ID, activeConsoleRoleId: roleId, assignedRoleId: roleId, connectionGeneration: 6 },
    session };
}

function makeLocator({ count = 1, options = [], onClick, onSelect } = {}) {
  let selected = '';
  return {
    count: async () => count,
    isVisible: async () => count > 0,
    isEnabled: async () => count > 0,
    locator: () => ({ evaluateAll: async callback => callback((typeof options === 'function' ? options() : options).map(option => ({
      value: option.value, textContent: option.textContent ?? option.value, disabled: option.disabled === true,
    }))) }),
    selectOption: async value => { selected = value; await onSelect?.(value); },
    inputValue: async () => selected,
    click: async () => { await onClick?.(); },
  };
}

function serializedSurface({ uid, roleId, currentControl = control(), isGm = false,
  ownerActionVisible = true, handoffVisible = ownerActionVisible,
  reclaimVisible = ownerActionVisible && currentControl.holderUid !== currentControl.ownerUid,
  offeredTargets = [RECIPIENT_UID], recipientId = SHUTTLE_ID, selectedTargets = [], clickLog = [] } = {}) {
  let authUid = uid;
  let projectedControl = currentControl;
  let projectedTargets = [...offeredTargets];
  let storeState = isGm
    ? { connection: 'live', sessionSnapshotFreshness: 'server', session: {
      id: SESSION_ID, currentTurn: CYCLE, phase: 'active', playerDiscovery: { groupId: GROUP_ID },
      activeVesselIds: ['icebreaker', 'dione'], activeRoleIds: [OWNER_ROLE, HOLDER_ROLE],
      shipFleetGroupIds: { icebreaker: GROUP_ID, dione: GROUP_ID },
      shuttleControl: { [SHUTTLE_ID]: currentControl },
      shuttleDockings: [{ shuttleId: SHUTTLE_ID, shipId: 'icebreaker', dockedAt: '2026-10-06T12:00:00.000Z' }],
    } }
    : memberStore({ uid, roleId, currentControl });
  const recipient = makeLocator({ options: () => projectedTargets.map(target => typeof target === 'string'
    ? { value: target, textContent: target }
    : { value: target.value, textContent: target.textContent ?? target.value, disabled: target.disabled }),
  onSelect: value => selectedTargets.push(value) });
  recipient.getAttribute = async name => name === 'id' ? `shuttle-recipient-${recipientId}` : null;
  const handoff = makeLocator({ count: handoffVisible ? 1 : 0,
    onClick: async () => { clickLog.push('Hand off control'); } });
  const reclaim = makeLocator({ count: reclaimVisible ? 1 : 0,
    onClick: async () => { clickLog.push('Reclaim control'); } });
  const absent = () => makeLocator({ count: 0 });
  const panel = {
    count: async () => 1,
    isVisible: async () => true,
    isEnabled: async () => true,
    getByLabel: (label, options = {}) => label === 'Hand off to' && options.exact === true
      ? ownerActionVisible ? recipient : absent() : absent(),
    getByRole: (role, options = {}) => role === 'button' && options.exact === true &&
      options.name === 'Hand off control' ? ownerActionVisible ? handoff : absent() :
      role === 'button' && options.exact === true && options.name === 'Reclaim control'
        ? ownerActionVisible ? reclaim : absent() : absent(),
  };
  const page = {
    url: () => `http://localhost:5174/#/shuttles/${SHUTTLE_ID}`,
    on: () => {}, off: () => {},
    evaluate: async (callback, input = {}) => {
      const fixtureImport = async moduleUrl => {
        if (moduleUrl === '/src/store/useSessionStore.ts') {
          return { useSessionStore: { getState: () => storeState } };
        }
        if (moduleUrl === '/src/lib/firebase.ts') return { auth: () => ({ currentUser: { uid: authUid } }) };
        throw new Error(`Unexpected serialized source import: ${String(moduleUrl)}`);
      };
      const source = callback.toString().replace(/\bimport\s*\(/g, 'fixtureImport(');
      return new Function('fixtureImport', 'crypto', 'input', `return (${source})(input);`)(
        fixtureImport, webcrypto, input);
    },
    getByRole: (role, options = {}) => role === 'status'
      ? { allTextContents: async () => ['Shuttle control handed off.'] }
      : role === 'region' && options.name === 'Shuttle control' && options.exact === true
        ? panel : absent(),
  };
  return {
    page, storeModuleUrl: () => '/src/store/useSessionStore.ts',
    observe: async () => isGm
      ? { sessionId: SESSION_ID, uidHash: hashUid('owned-gm-auth-uid'), playerRole: 'gm',
        sameActor: true, gmInstanceOwned: true, connection: 'live', freshness: 'server' }
      : { sessionId: SESSION_ID, uidHash: hashUid(uid), profileRoleId: roleId,
        activeConsoleRoleId: roleId, assignedRoleId: roleId, playerRole: 'player',
        sameActor: true, connection: 'live', freshness: 'server' },
    state: async () => isGm
      ? { ...sourceSnapshot(projectedControl) }
      : { ...sourceSnapshot(projectedControl), currentMemberScope: { groupId: GROUP_ID,
        vesselIds: ['icebreaker', 'dione'], craftIds: [SHUTTLE_ID] } },
    setControl: nextControl => {
      projectedControl = nextControl;
      storeState = isGm
        ? { connection: 'live', sessionSnapshotFreshness: 'server', session: {
          id: SESSION_ID, currentTurn: CYCLE, phase: 'active', playerDiscovery: { groupId: GROUP_ID },
          activeVesselIds: ['icebreaker', 'dione'], activeRoleIds: [OWNER_ROLE, HOLDER_ROLE],
          shipFleetGroupIds: { icebreaker: GROUP_ID, dione: GROUP_ID },
          shuttleControl: { [SHUTTLE_ID]: nextControl },
          shuttleDockings: [{ shuttleId: SHUTTLE_ID, shipId: 'icebreaker', dockedAt: '2026-10-06T12:00:00.000Z' }],
        } }
        : memberStore({ uid, roleId, currentControl: nextControl });
    },
    mutateStore: mutator => mutator(storeState),
    setOfferedTargets: targets => { projectedTargets = [...targets]; },
    setAuthUid: nextUid => { authUid = nextUid; },
    selectedTargets, clickLog,
  };
}

function makeHarness({ currentControl = control(), roster, ownerActionVisible = true,
  handoffVisible = ownerActionVisible, recipientId = SHUTTLE_ID, reclaimVisible = ownerActionVisible &&
    currentControl.holderUid !== currentControl.ownerUid, offeredTargets = [RECIPIENT_UID] } = {}) {
  const selectedRoles = [];
  const selectedTargets = [];
  const clickLog = [];
  const gmSurface = serializedSurface({ uid: 'owned-gm-auth-uid', isGm: true, currentControl });
  const ownerSurface = serializedSurface({ uid: OWNER_UID, roleId: OWNER_ROLE, currentControl,
    ownerActionVisible, handoffVisible, recipientId, reclaimVisible, offeredTargets, selectedTargets, clickLog });
  const holderSurface = serializedSurface({ uid: HOLDER_UID, roleId: HOLDER_ROLE, currentControl,
    ownerActionVisible: false, selectedTargets, clickLog });
  const byRole = new Map([[OWNER_ROLE, ownerSurface], [HOLDER_ROLE, holderSurface]]);
  const game = {
    select: async roleId => {
      selectedRoles.push(roleId);
      return roleId === 'gm' ? gmSurface : byRole.get(roleId) ?? holderSurface;
    },
    state: async surface => surface.state(),
  };
  const admittedRoster = roster ?? [
    { roleId: OWNER_ROLE, uidHash: OWNER_HASH },
    { roleId: HOLDER_ROLE, uidHash: HOLDER_HASH },
  ];
  return { context: { initial: { sessionId: SESSION_ID }, roster: admittedRoster }, game, gmSurface,
    ownerSurface, holderSurface, selectedRoles, selectedTargets, clickLog };
}

test('public default recipe selects the unique printed owner for a borrowed shuttle and requires its mounted action', async () => {
  const harness = makeHarness();
  const recipe = createPendingProcedureDefaultSteps()['core:transferShuttleControlCommand'];
  const plan = await recipe({ context: harness.context, game: harness.game });

  assert.equal(plan.expected.roleId, OWNER_ROLE);
  assert.equal(plan.expected.uidHash, OWNER_HASH);
  assert.equal(plan.expected.shuttleId, SHUTTLE_ID);
  assert.equal(plan.expected.controlOwnerUidHash, OWNER_HASH);
  assert.equal(plan.expected.controlHolderUidHash, HOLDER_HASH);
  assert.equal(plan.expected.controlRevision, CONTROL_REVISION);
  assert.equal(plan.expected.groupId, GROUP_ID);
  assert.deepEqual(harness.selectedRoles, ['gm', OWNER_ROLE]);
  assert.deepEqual(harness.selectedTargets, [RECIPIENT_UID]);

  const action = await plan.prepare({ surface: harness.ownerSurface,
    actor: await harness.ownerSurface.observe(), source: await harness.ownerSurface.state() });
  assert.equal(action.offered, true, action.reason);
  assert.equal(typeof action.click, 'function');
  await action.click();
  assert.deepEqual(harness.clickLog, ['Hand off control']);
  harness.ownerSurface.setControl(control({ holderUid: RECIPIENT_UID, revision: CONTROL_REVISION + 1 }));
  const inspected = await plan.inspect({ surface: harness.ownerSurface,
    actor: await harness.ownerSurface.observe(), actorAfter: await harness.ownerSurface.observe(),
    request: { sessionId: SESSION_ID, requestId: 'native-handoff-request', shuttleId: SHUTTLE_ID, action: 'handoff',
      targetUid: RECIPIENT_UID, expectedRevision: CONTROL_REVISION },
    result: { status: 'committed', sessionId: SESSION_ID, requestId: 'native-handoff-request', shuttleId: SHUTTLE_ID,
      action: 'handoff', ownerUid: OWNER_UID, previousHolderUid: HOLDER_UID,
      holderUid: RECIPIENT_UID, revision: CONTROL_REVISION + 1 } });
  assert.equal(inspected.sourceAfter.live, true);
  assert.equal(inspected.sourceAfter.revision, CONTROL_REVISION + 1);
  assert.equal(inspected.sourceAfter.groupId, GROUP_ID);
});

test('missing, duplicate, or inconsistent printed-owner admission never falls back to the borrowed holder', async t => {
  const cases = [
    ['owner is not admitted', control(), [{ roleId: HOLDER_ROLE, uidHash: HOLDER_HASH }]],
    ['owner admission is ambiguous', control(), [
      { roleId: OWNER_ROLE, uidHash: OWNER_HASH }, { roleId: OWNER_ROLE, uidHash: OWNER_HASH },
      { roleId: HOLDER_ROLE, uidHash: HOLDER_HASH },
    ]],
    ['owner role and UID disagree', control({ ownerRoleId: HOLDER_ROLE }), [
      { roleId: OWNER_ROLE, uidHash: OWNER_HASH }, { roleId: HOLDER_ROLE, uidHash: HOLDER_HASH },
    ]],
  ];
  for (const [name, currentControl, rosterPatch] of cases) {
    await t.test(name, async () => {
      const harness = makeHarness({ currentControl, roster: rosterPatch });
      const recipe = createPendingProcedureDefaultSteps()['core:transferShuttleControlCommand'];
      const plan = await recipe({ context: harness.context, game: harness.game });
      assert.notEqual(plan.expected.roleId, HOLDER_ROLE);
      assert.equal(harness.selectedRoles.includes(HOLDER_ROLE), false);
      const action = await plan.prepare({ surface: harness.ownerSurface,
        actor: await harness.ownerSurface.observe(), source: await harness.ownerSurface.state() });
      assert.equal(action.offered, false);
      assert.deepEqual(harness.clickLog, []);
    });
  }
});

test('printed-owner recipe refuses a mounted selector for a different shuttle', async () => {
  const harness = makeHarness({ recipientId: 'dione' });
  const recipe = createPendingProcedureDefaultSteps()['core:transferShuttleControlCommand'];
  const plan = await recipe({ context: harness.context, game: harness.game });
  const action = await plan.prepare({ surface: harness.ownerSurface,
    actor: await harness.ownerSurface.observe(), source: await harness.ownerSurface.state() });

  assert.equal(plan.expected.shuttleId, SHUTTLE_ID);
  assert.equal(action.offered, false);
  assert.deepEqual(harness.clickLog, []);
});

test('the mounted owner plan blocks control, document, target, and current-role drift immediately before click', async t => {
  const cases = [
    ['owner identity changed', harness => harness.ownerSurface.setControl(control({ ownerUid: 'foreign-owner-uid' }))],
    ['holder changed', harness => harness.ownerSurface.setControl(control({ holderUid: 'foreign-holder-uid' }))],
    ['control revision changed', harness => harness.ownerSurface.setControl(control({ revision: CONTROL_REVISION + 1 }))],
    ['member connection generation changed', harness => harness.ownerSurface.mutateStore(state => {
      state.me.connectionGeneration++;
      state.session.currentActorBerthAuthority.connectionGeneration++;
    })],
    ['identity hydration changed', harness => harness.ownerSurface.mutateStore(state => {
      state.identityHydrationRevision++;
    })],
    ['authenticated UID changed', harness => harness.ownerSurface.setAuthUid('foreign-auth-uid')],
    ['offered recipient disappeared', harness => harness.ownerSurface.setOfferedTargets([])],
  ];
  for (const [name, drift] of cases) {
    await t.test(name, async () => {
      const harness = makeHarness();
      const plan = await createPendingProcedureDefaultSteps()['core:transferShuttleControlCommand']({
        context: harness.context, game: harness.game,
      });
      const action = await plan.prepare({ surface: harness.ownerSurface,
        actor: await harness.ownerSurface.observe(), source: await harness.ownerSurface.state() });
      assert.equal(action.offered, true, action.reason);
      drift(harness);
      await assert.rejects(action.click);
      assert.deepEqual(harness.clickLog, []);
    });
  }
});

test('reclaim is used only when it is the actual enabled source path; a stale handoff path does not fall through', async t => {
  await t.test('no offered target and visible reclaim', async () => {
    const harness = makeHarness({ offeredTargets: [] });
    const plan = await createPendingProcedureDefaultSteps()['core:transferShuttleControlCommand']({
      context: harness.context, game: harness.game,
    });
    const action = await plan.prepare({ surface: harness.ownerSurface,
      actor: await harness.ownerSurface.observe(), source: await harness.ownerSurface.state() });
    assert.equal(action.offered, true, action.reason);
    await action.click();
    assert.deepEqual(harness.clickLog, ['Reclaim control']);
  });
  await t.test('offered handoff target but missing handoff button', async () => {
    const harness = makeHarness({ handoffVisible: false, reclaimVisible: true });
    const plan = await createPendingProcedureDefaultSteps()['core:transferShuttleControlCommand']({
      context: harness.context, game: harness.game,
    });
    const action = await plan.prepare({ surface: harness.ownerSurface,
      actor: await harness.ownerSurface.observe(), source: await harness.ownerSurface.state() });
    assert.equal(action.offered, false);
    assert.deepEqual(harness.clickLog, []);
  });
  await t.test('no target and no mounted reclaim control', async () => {
    const harness = makeHarness({ currentControl: control({ holderUid: OWNER_UID }),
      offeredTargets: [], reclaimVisible: false });
    const plan = await createPendingProcedureDefaultSteps()['core:transferShuttleControlCommand']({
      context: harness.context, game: harness.game,
    });
    const action = await plan.prepare({ surface: harness.ownerSurface,
      actor: await harness.ownerSurface.observe(), source: await harness.ownerSurface.state() });
    assert.equal(action.offered, false);
    assert.deepEqual(harness.clickLog, []);
  });
});

test('post-observation rejects a handoff receipt outside the original control tuple', async t => {
  const cases = [
    ['wrong owner', { ownerUid: 'foreign-owner-uid' }],
    ['wrong previous holder', { previousHolderUid: 'foreign-holder-uid' }],
    ['wrong next holder', { holderUid: 'foreign-recipient-uid' }],
    ['wrong control revision', { revision: CONTROL_REVISION + 2 }],
  ];
  for (const [name, resultPatch] of cases) {
    await t.test(name, async () => {
      const harness = makeHarness();
      const plan = await createPendingProcedureDefaultSteps()['core:transferShuttleControlCommand']({
        context: harness.context, game: harness.game,
      });
      harness.ownerSurface.setControl(control({ holderUid: RECIPIENT_UID, revision: CONTROL_REVISION + 1 }));
      const inspected = await plan.inspect({ surface: harness.ownerSurface,
        actor: await harness.ownerSurface.observe(), actorAfter: await harness.ownerSurface.observe(),
        request: { sessionId: SESSION_ID, requestId: 'native-handoff-request', shuttleId: SHUTTLE_ID,
          action: 'handoff', targetUid: RECIPIENT_UID, expectedRevision: CONTROL_REVISION },
        result: { status: 'committed', sessionId: SESSION_ID, requestId: 'native-handoff-request',
          action: 'handoff', shuttleId: SHUTTLE_ID, ownerUid: OWNER_UID,
          previousHolderUid: HOLDER_UID, holderUid: RECIPIENT_UID, revision: CONTROL_REVISION + 1,
          ...resultPatch } });
      assert.equal(inspected.sourceAfter.live, false);
    });
  }
});

test('public capture reselects the source owner and stops if the owner/holder control tuple is stale', async () => {
  const harness = makeHarness();
  let prepared = 0;
  const result = await captureMountedProcedureAction({ context: harness.context, game: harness.game,
    caseId: 'core:transferShuttleControlCommand', expected: {
      sessionId: SESSION_ID, cycle: CYCLE, roleId: OWNER_ROLE, uidHash: OWNER_HASH,
      shuttleId: SHUTTLE_ID, groupId: GROUP_ID, sourceRevision: CONTROL_REVISION,
      controlOwnerUidHash: OWNER_HASH, controlHolderUidHash: HOLDER_HASH,
      controlRevision: CONTROL_REVISION,
    }, prepare: async () => { prepared++; return { offered: false, reason: 'fixture stops before mutation' }; },
    inspect: async () => { throw new Error('a blocked single native capture cannot inspect a result'); } });

  assert.equal(harness.selectedRoles[0], 'gm');
  assert.equal(harness.selectedRoles[1], OWNER_ROLE);
  assert.equal(prepared, 1);
  assert.equal(result.status, 'pending');
  assert.deepEqual(harness.clickLog, []);
});
