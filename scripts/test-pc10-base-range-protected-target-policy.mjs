import assert from 'node:assert/strict';
import test from 'node:test';
import { chooseBaseRangeAssignments } from './pc10-base-combat-deduction-contracts.mjs';

function rangeView({ range = 'medium-range', hitSlots, contacts, revision = 4,
  eligibleActions, protectedShipPriority } = {}) {
  return {
    sessionId: 'native-session', turn: 1, revision, currentStep: range, range,
    choiceStatus: 'targets-required',
    eligibleActions: eligibleActions ?? [{ actionId: 'missiles', sourceId: 'aegis-missile-launchers' }],
    hitSlots: hitSlots ?? [{ actionId: 'missiles', count: 1, damagePerHit: 1 }],
    contacts: contacts ?? [
      { contactId: 'contact-1', targetShipId: 'aegis', available: true },
      { contactId: 'contact-2', targetShipId: 'shepherd', available: true },
      { contactId: 'contact-3', targetShipId: 'quellon', available: true },
    ],
    ...(protectedShipPriority === undefined ? {} : { protectedShipPriority }),
  };
}

test('an explicit owner policy follows the actual current targetShipId, not contact order', () => {
  const first = rangeView({ protectedShipPriority: ['shepherd', 'quellon'] });
  assert.deepEqual(chooseBaseRangeAssignments(first), [
    { actionId: 'missiles', contactIds: ['contact-2'] },
  ]);

  const changedTargetsOnly = rangeView({ protectedShipPriority: ['shepherd', 'quellon'], contacts: [
    { contactId: 'contact-1', targetShipId: 'shepherd', available: true },
    { contactId: 'contact-2', targetShipId: 'aegis', available: true },
    { contactId: 'contact-3', targetShipId: 'quellon', available: true },
  ] });
  assert.deepEqual(chooseBaseRangeAssignments(changedTargetsOnly), [
    { actionId: 'missiles', contactIds: ['contact-1'] },
  ]);
});

test('without an explicit owner policy, the original source-order choice remains', () => {
  assert.deepEqual(chooseBaseRangeAssignments(rangeView()), [
    { actionId: 'missiles', contactIds: ['contact-1'] },
  ]);
});

test('Short Range satisfies current positive Fighter Wing coverage before prioritizing a surplus hit', () => {
  const view = rangeView({ range: 'short-range', protectedShipPriority: ['quellon'],
    eligibleActions: [
      { actionId: 'missiles', sourceId: 'aegis-missile-launchers' },
      { actionId: 'lasers', sourceId: 'aegis-point-defence-lasers' },
    ],
    hitSlots: [
      { actionId: 'missiles', count: 2, damagePerHit: 1 },
      { actionId: 'lasers', count: 1, damagePerHit: 1 },
    ],
    contacts: [
      { contactId: 'contact-1', targetShipId: 'aegis', available: true, requiredCoverageDamage: 1 },
      { contactId: 'contact-2', targetShipId: 'dione', available: true, requiredCoverageDamage: 1 },
      { contactId: 'contact-3', targetShipId: 'icebreaker', available: true, requiredCoverageDamage: null },
      { contactId: 'contact-4', targetShipId: 'quellon', available: true, requiredCoverageDamage: null },
    ],
  });
  assert.deepEqual(chooseBaseRangeAssignments(view), [
    { actionId: 'missiles', contactIds: ['contact-1', 'contact-2'] },
    { actionId: 'lasers', contactIds: ['contact-4'] },
  ]);
});

test('unavailable contacts never win the protected priority and malformed source targets fail closed', () => {
  const unavailableFirst = rangeView({ protectedShipPriority: ['quellon'], contacts: [
    { contactId: 'contact-1', targetShipId: 'quellon', available: false },
    { contactId: 'contact-2', targetShipId: 'aegis', available: true },
  ] });
  assert.deepEqual(chooseBaseRangeAssignments(unavailableFirst), [
    { actionId: 'missiles', contactIds: ['contact-2'] },
  ]);

  assert.throws(() => chooseBaseRangeAssignments(rangeView({ protectedShipPriority: ['shepherd'], contacts: [
    { contactId: 'contact-1', available: true },
  ] })), /targetShipId/i);
  assert.throws(() => chooseBaseRangeAssignments(rangeView({ protectedShipPriority: ['unknown-ship'] })), /priority/i);
  assert.throws(() => chooseBaseRangeAssignments(rangeView({ protectedShipPriority: ['shepherd', 'shepherd'] })), /priority/i);
});

test('a newly supplied current view is recomputed instead of reusing a previous contact choice', () => {
  const priority = ['shepherd', 'quellon'];
  const before = rangeView({ revision: 4, protectedShipPriority: priority, contacts: [
    { contactId: 'contact-1', targetShipId: 'aegis', available: true },
    { contactId: 'contact-2', targetShipId: 'shepherd', available: true },
  ] });
  const after = rangeView({ revision: 5, protectedShipPriority: priority, contacts: [
    { contactId: 'contact-1', targetShipId: 'quellon', available: true },
    { contactId: 'contact-2', targetShipId: 'aegis', available: true },
  ] });
  assert.deepEqual(chooseBaseRangeAssignments(before), [
    { actionId: 'missiles', contactIds: ['contact-2'] },
  ]);
  assert.deepEqual(chooseBaseRangeAssignments(after), [
    { actionId: 'missiles', contactIds: ['contact-1'] },
  ]);
});
