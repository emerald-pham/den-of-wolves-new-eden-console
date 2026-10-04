import assert from 'node:assert/strict';
import test from 'node:test';
import { buildPc07ExplicitLoyaltyAssignments } from './pc07-explicit-loyalty-setup.mjs';

const roles = Array.from({ length: 20 }, (_, index) => `role-${index + 1}`);
const choice = {
  wolfAgentRoleId: 'role-6',
  wolfCultRoleId: 'role-2',
  intelligenceAgentRoleId: 'role-5',
};

test('builds a complete 20-player authored optional loyalty roster by occupied core role', () => {
  const assignments = buildPc07ExplicitLoyaltyAssignments(roles, choice);
  assert.equal(assignments.length, 20);
  assert.deepEqual(assignments.find((entry) => entry.roleId === 'role-6'), {
    roleId: 'role-6', kind: 'wolf-agent', suspicion: 0,
  });
  assert.deepEqual(assignments.find((entry) => entry.roleId === 'role-2'), {
    roleId: 'role-2', kind: 'wolf-cult', suspicion: 15,
  });
  assert.deepEqual(assignments.find((entry) => entry.roleId === 'role-5'), {
    roleId: 'role-5', kind: 'intelligence-agent', suspicion: 6,
  });
  assert.ok(assignments.filter((entry) => entry.kind === 'fleet-loyalist').every((entry) => entry.suspicion === 0));
});

test('rejects a partial, duplicated, or Wolf Cult-ineligible setup', () => {
  assert.throws(() => buildPc07ExplicitLoyaltyAssignments(roles.slice(0, 13), choice), /two-Wolf setup/i);
  assert.throws(() => buildPc07ExplicitLoyaltyAssignments(roles, {
    ...choice, intelligenceAgentRoleId: 'role-6',
  }), /three distinct occupied roles/i);
  assert.throws(() => buildPc07ExplicitLoyaltyAssignments(roles, {
    ...choice, wolfCultRoleId: 'missing-role',
  }), /occupied core role/i);
});
