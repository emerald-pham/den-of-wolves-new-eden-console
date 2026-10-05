import assert from 'node:assert/strict';
import test from 'node:test';
import * as driver from './pc10-extra-role-proof.mjs';
import * as actionHelpers from './pc10-extra-role-actions.mjs';
import { createExtraRoleMatrix, extraRoleScenario } from './pc10-extra-role-proof-helpers.mjs';

test('additive callbacks expose every sourced procedure or an explicit non-executable source gap', () => {
  assert.equal(typeof driver.createExtraRoleCallbacks, 'function');
  for (const scenario of ['joint', 'replacements']) {
    const callbacks = driver.createExtraRoleCallbacks({ scenario, directory: '/tmp/not-a-browser-proof' });
    assert.equal(typeof callbacks.onBeforeStart, 'function');
    assert.equal(typeof callbacks.runEnding, 'function');
    for (const row of createExtraRoleMatrix(scenario)) {
      const procedure = callbacks.procedures.find(entry => entry.id === row.id);
      assert.ok(procedure, `${row.id} must not silently disappear from callback composition.`);
      assert.equal(procedure.endpoint, row.endpoint);
      assert.equal(procedure.executable, !row.physicalFactRequired && !row.unavailableReason);
      if (!procedure.executable) assert.ok(procedure.blocker && procedure.nextActor);
    }
    assert.equal(callbacks.summary().everyRoleFunctionComplete, false);
    assert.equal(callbacks.summary().actualBrowserContexts, 0);
  }
});

test('replacement preflight refuses a fresh UID substituted for the original admitted persona before any operation', () => {
  assert.equal(typeof driver.validateExtraRoleRoster, 'function');
  const plan = extraRoleScenario('replacements');
  const roster = plan.actors.map((actor, index) => ({ roleId: actor.anchorRoleId, uidHash: `original-${index}`, displayName: `Crew ${index}` }));
  driver.validateExtraRoleRoster(plan, roster);
  assert.throws(() => driver.validateExtraRoleRoster(plan, roster.slice(1)), /original.*actor|roster/i);
  assert.throws(() => driver.validateExtraRoleRoster(plan, roster.map((actor, index) => index === 1 ? { ...actor, uidHash: roster[0].uidHash } : actor)), /distinct/i);
  assert.throws(() => driver.validateExtraRoleRoster(plan, roster.map((actor, index) => index === 1 ? { ...actor, roleId: plan.actors[1].roleId } : actor)), /original.*actor|roster/i);
});

test('actual command guard prevents a wrong restored actor from sending a gameplay request', async () => {
  assert.equal(typeof driver.guardExtraRoleCommand, 'function');
  let mutations = 0;
  await assert.rejects(driver.guardExtraRoleCommand({
    inspect: async () => { throw Error('wrong original UID after reload'); },
    perform: async () => { mutations++; return { httpStatus: 200 }; },
  }), /original UID/);
  assert.equal(mutations, 0);
});

test('actual command guard refuses post-response actor drift or logical denial and never awards execution', async () => {
  assert.equal(typeof driver.guardExtraRoleCommand, 'function');
  let observations = 0;
  await assert.rejects(driver.guardExtraRoleCommand({
    inspect: async () => { if (++observations > 1) throw Error('private audience changed'); return { sessionId: 'same', uidHash: 'original' }; },
    perform: async () => ({ httpStatus: 200, logicalStatus: 'committed' }),
  }), /audience/);
  await assert.rejects(driver.guardExtraRoleCommand({
    inspect: async () => ({ sessionId: 'same', uidHash: 'original' }),
    perform: async () => ({ httpStatus: 200, logicalStatus: 'stale' }),
  }), /receipt|denial/i);
  const receipt = await driver.guardExtraRoleCommand({
    inspect: async () => ({ sessionId: 'same', uidHash: 'original' }),
    perform: async () => ({ httpStatus: 200, logicalStatus: 'committed', requestId: 'actual' }),
  });
  assert.equal(receipt.identityVerified, true);
});

test('UI action evidence keeps bounded revision/cost fields and redacts private route data', () => {
  assert.equal(typeof actionHelpers.redactedProcedureFields, 'function');
  assert.deepEqual(actionHelpers.redactedProcedureFields({ sessionId: 's1', uid: 'private',
    smallShipId: 'warrior', hostShipId: 'shepherd', expectedHostShipId: 'shepherd',
    expectedCycle: 3, expectedRevision: 4, expectedDockingRevision: 2,
    resourceId: 'fuel', direction: 'load', amount: 1, destination: '7319',
    sourceId: 'vulcan-laser-cannon', range: 'medium-range', use: true }), {
    smallShipId: 'warrior', expectedHostShipId: 'shepherd', expectedCycle: 3,
    expectedRevision: 4, expectedDockingRevision: 2, resourceId: 'fuel', direction: 'load',
    amount: 1, sourceId: 'vulcan-laser-cannon', range: 'medium-range', use: true,
  });
});

test('unsupported ranges and non-local origins are rejected before any browser can be started', () => {
  assert.equal(typeof driver.createExtraRoleCallbacks, 'function');
  assert.throws(() => driver.createExtraRoleCallbacks({ scenario: 'replacements', variant: 'forced-results' }), /variant/i);
  assert.throws(() => driver.createExtraRoleCallbacks({ scenario: 'replacements', aceRange: 'invented' }), /range/i);
});

test('source-mounted role paths are selected before inventory or an action is claimed', () => {
  assert.equal(typeof driver.extraRoleActionRoute, 'function');
  assert.equal(driver.extraRoleActionRoute('comms-officer'), '/replacement/comms-officer');
  assert.equal(driver.extraRoleActionRoute('doctor'), '/replacement/doctor');
  assert.equal(driver.extraRoleActionRoute('pdf-fighter-ace'), '/replacement/pdf-fighter-ace');
  assert.equal(driver.extraRoleActionRoute('vip-host'), '/ships/dione/roles/vip-host');
  assert.equal(driver.extraRoleActionRoute('commissar'), '/ships/icebreaker/roles/commissar');
  assert.equal(driver.extraRoleActionRoute('wolf-commander'), '/brief');
  assert.equal(driver.extraRoleActionRoute('vulcan-captain'), '/brief');
});

test('an individual procedure selects its actual paid step instead of restarting an entire lifecycle', () => {
  assert.equal(typeof driver.extraRoleProcedureStep, 'function');
  const joint = createExtraRoleMatrix('joint'), replacements = createExtraRoleMatrix('replacements');
  assert.deepEqual(driver.extraRoleProcedureStep('joint', joint.find(row => row.id === 'joint-engineering-quellon-refinery:quellon-end')),
    { kind: 'joint-maintenance', roleId: 'joint-engineering-quellon-refinery', shipId: 'quellon', craftId: 'wobbly', action: 'end' });
  assert.deepEqual(driver.extraRoleProcedureStep('joint', joint.find(row => row.id === 'joint-engineering-quellon-refinery:wobbly-fuel')),
    { kind: 'joint-maintenance', roleId: 'joint-engineering-quellon-refinery', shipId: 'quellon', craftId: 'wobbly', action: 'bays' });
  assert.deepEqual(driver.extraRoleProcedureStep('replacements', replacements.find(row => row.id === 'vulcan-captain:eligibility')),
    { kind: 'replacement-transition', roleId: 'vulcan-captain', action: 'eligibility' });
  assert.deepEqual(driver.extraRoleProcedureStep('replacements', replacements.find(row => row.id === 'vulcan-captain:assignment')),
    { kind: 'replacement-transition', roleId: 'vulcan-captain', action: 'assignment' });
  assert.deepEqual(driver.extraRoleProcedureStep('replacements', replacements.find(row => row.id === 'vulcan-captain:maintenance-end')),
    { kind: 'small-maintenance', shipId: 'vulcan', action: 'end' });
});

test('the existing two-browser callbacks compose current Warrior cargo/jump and Vulcan jump/range paths', () => {
  const replacements = createExtraRoleMatrix('replacements');
  const callbacks = driver.createExtraRoleCallbacks({ scenario: 'replacements', variant: 'wolf', jumpLength: 'medium' });
  const procedure = id => callbacks.procedures.find(entry => entry.id === id);
  for (const id of ['warrior-captain:cargo-transfer', 'warrior-captain:jump-drive', 'vulcan-captain:jump-drive',
    'vulcan-captain:laser-cannon-medium', 'vulcan-captain:laser-cannon-short']) {
    const action = procedure(id);
    assert.ok(action, `${id} remains in the ordinary replacement callback table.`);
    assert.equal(action.executable, true, `${id} has a current mounted source path.`);
    assert.equal(typeof action.execute, 'function');
    assert.equal(replacements.find(row => row.id === id).unavailableReason, undefined);
  }
  assert.deepEqual(driver.extraRoleProcedureStep('replacements', replacements.find(row => row.id === 'warrior-captain:cargo-transfer')),
    { kind: 'warrior-cargo-transfer', roleId: 'warrior-captain', craftId: 'warrior' });
  assert.deepEqual(driver.extraRoleProcedureStep('replacements', replacements.find(row => row.id === 'warrior-captain:jump-drive'), { jumpLength: 'medium' }),
    { kind: 'small-craft-jump', roleId: 'warrior-captain', craftId: 'warrior', range: 'medium' });
  assert.deepEqual(driver.extraRoleProcedureStep('replacements', replacements.find(row => row.id === 'vulcan-captain:jump-drive'), { jumpLength: 'short' }),
    { kind: 'small-craft-jump', roleId: 'vulcan-captain', craftId: 'vulcan', range: 'short' });
  assert.deepEqual(driver.extraRoleProcedureStep('replacements', replacements.find(row => row.id === 'vulcan-captain:laser-cannon-medium')),
    { kind: 'vulcan-laser-range', roleId: 'vulcan-captain', range: 'medium-range' });
  assert.deepEqual(driver.extraRoleProcedureStep('replacements', replacements.find(row => row.id === 'vulcan-captain:laser-cannon-short')),
    { kind: 'vulcan-laser-range', roleId: 'vulcan-captain', range: 'short-range' });
});
