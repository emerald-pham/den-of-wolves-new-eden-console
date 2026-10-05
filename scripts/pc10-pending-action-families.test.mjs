import assert from 'node:assert/strict';
import test from 'node:test';
import { validateElectionPlan } from './pc10-politics-press-proof.mjs';
import { validateCrisisChoice } from './pc10-crisis-voyage-proof.mjs';
import { validatePosseChoice, validateArrestDispositionChoice } from './pc10-arrest-posse-proof.mjs';
import { assertRequiredCrisisChoices } from './pc10-crisis-voyage-proof.mjs';
import { privateSafeActionReceipt } from './pc10-political-crisis-arrest-proof-contracts.mjs';

test('election callbacks require explicit source policy and an independent secret choice for every ballot', () => {
  const valid = {
    voterRoleIds: ['captain-a', 'engineer-a', 'captain-b'],
    policy: {
      votingSystem: 'majority', populationWeighting: 'equal', openCycle: 1, closeCycle: 1,
      vicePresidentEnabled: false, campaigning: 'prohibited', supplyUse: 'prohibited',
      campaignInstructions: 'No campaigning.', tieRule: 'current-office-remains',
    },
    ballotsByRole: {
      'captain-a': { presidentCandidateRoleId: 'captain-b' },
      'engineer-a': { presidentCandidateRoleId: 'engineer-a' },
      'captain-b': { presidentCandidateRoleId: 'captain-b' },
    },
  };
  assert.equal(validateElectionPlan(valid), true);
  assert.throws(() => validateElectionPlan({ ...valid, policy: undefined }), /explicit.*policy/i);
  assert.throws(() => validateElectionPlan({ ...valid, ballotsByRole: { 'captain-a': valid.ballotsByRole['captain-a'] } }), /every.*voter/i);
  assert.throws(() => validateElectionPlan({ ...valid, ballotsByRole: {
    ...valid.ballotsByRole, 'captain-b': { presidentCandidateRoleId: 'outsider' },
  } }), /eligible candidate/i);
  assert.throws(() => validateElectionPlan({ ...valid, policy: { ...valid.policy, closeCycle: 0 } }), /cycle/i);
});

test('crisis choices accept only source-defined private GM actions and linked instructions', () => {
  assert.equal(validateCrisisChoice({
    approachingVessel: {
      vesselReality: 'real', responseChoices: ['wait-briefly-then-leave'], coordinationActions: [],
      responseInstructions: 'Hold until the rescue lane is verified.', rationale: 'Explicit GM ruling.',
      admitVoyage: true,
    },
    diseaseQuarantine: 'activate',
    zealotry: { actions: ['investigate'], customResponse: '', rationale: '' },
    civilUnrest: { presidentResponse: 'Address the petition.', consequence: 'Reopen talks.', rationale: '' },
  }), true);
  assert.throws(() => validateCrisisChoice({ approachingVessel: {
    vesselReality: 'real', responseChoices: [], coordinationActions: [], responseInstructions: 'A response.',
  } }), /at least one.*response/i);
  assert.throws(() => validateCrisisChoice({ diseaseQuarantine: 'create' }), /activate.*release/i);
  assert.throws(() => validateCrisisChoice({ zealotry: { actions: ['invented'], customResponse: '' } }), /source-defined/i);
  assert.throws(() => validateCrisisChoice({ civilUnrest: { presidentResponse: '', consequence: 'x' } }), /explicit.*response/i);
});

test('a named crisis branch must have its exact current-source choice before it can run', () => {
  assert.doesNotThrow(() => assertRequiredCrisisChoices({
    requiredBranches: ['voyage-host-docking'], voyageMovement: { action: 'dock', hostName: 'Current host' },
  }));
  assert.throws(() => assertRequiredCrisisChoices({ requiredBranches: ['voyage-host-docking'] }), /required.*voyage-host-docking/i);
  assert.throws(() => assertRequiredCrisisChoices({
    requiredBranches: ['voyage-admission'],
    approachingVessel: { vesselReality: 'real', admitVoyage: false },
  }), /required.*voyage-admission/i);
  assert.throws(() => assertRequiredCrisisChoices({ requiredBranches: ['future-crisis'] }), /unknown.*branch/i);
});

test('posse inputs bind distinct current roster roles and preserve the virtual-attendance label', () => {
  const roster = ['dione-captain', 'dione-engineer', 'admiral', 'dione-president'];
  const choice = {
    targetRoleId: 'dione-captain', defenders: 2, adjustment: 'none',
    presentRoleIds: ['dione-engineer', 'admiral'], attendanceEvidence: 'simulated-demo',
  };
  assert.equal(validatePosseChoice(choice, roster), true);
  assert.throws(() => validatePosseChoice({ ...choice, presentRoleIds: ['dione-engineer', 'dione-engineer'] }, roster), /distinct/i);
  assert.throws(() => validatePosseChoice({ ...choice, presentRoleIds: ['unknown'] }, roster), /current roster/i);
  assert.throws(() => validatePosseChoice({ ...choice, presentRoleIds: ['dione-captain'] }, roster), /target/i);
  assert.throws(() => validatePosseChoice({ ...choice, attendanceEvidence: 'human-present' }, roster), /simulated-demo/i);
  assert.throws(() => validatePosseChoice({ ...choice, adjustment: 0 }, roster), /adjustment/i);
});

test('case disposition requires an explicit source choice and a reason for late resolution', () => {
  assert.equal(validateArrestDispositionChoice({ disposition: 'released' }), true);
  assert.equal(validateArrestDispositionChoice({ disposition: 'executed' }), true);
  assert.equal(validateArrestDispositionChoice({ disposition: 'facilitator-resolution', ruling: 'Review the recorded deadline and release.' }), true);
  assert.throws(() => validateArrestDispositionChoice(undefined), /explicit.*choice/i);
  assert.throws(() => validateArrestDispositionChoice({ disposition: 'facilitator-resolution' }), /reasoned.*ruling/i);
  assert.throws(() => validateArrestDispositionChoice({ disposition: 'escape' }), /source-offered/i);
});

test('private safe receipts allow only declared source result labels on exact retry', () => {
  const receipt = privateSafeActionReceipt({
    family: 'pending-crisis-voyage', branch: 'voyage-jump', endpoint: 'jumpVoyage33',
    actor: { uidHash: 'b'.repeat(16), roleId: 'gm' }, sessionId: 'session-1', cycle: 2, phase: 'active',
    request: { requestId: 'private-request', destination: 'private-destination' },
    result: { status: 'jumped', revision: 2, fuelSpent: 1 },
    replay: { status: 'replayed', revision: 2, fuelSpent: 1 },
    statusPairs: [['jumped', 'replayed']],
  });
  assert.equal(receipt.accepted, true);
  assert.equal(JSON.stringify(receipt).includes('private-destination'), false);
});
