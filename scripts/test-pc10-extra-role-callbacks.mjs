import assert from 'node:assert/strict';
import test from 'node:test';
import * as driver from './pc10-extra-role-proof.mjs';
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
