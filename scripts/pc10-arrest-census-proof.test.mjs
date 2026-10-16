import assert from 'node:assert/strict';
import test from 'node:test';
import * as arrestProof from './pc10-arrest-posse-proof.mjs';

const SESSION_ID = 'pc10-current-session';
const TARGET_ROLE_ID = 'dione-president';
const ROLE_IDS = [
  TARGET_ROLE_ID, 'dione-captain', 'dione-engineer', 'dione-science-officer', 'dione-security-officer',
  'aegis-captain', 'aegis-engineer', 'aegis-gunner', 'aegis-medic', 'admiral',
  'athena-captain', 'athena-engineer', 'athena-science-officer', 'hermes-captain', 'hermes-engineer',
  'shepherd-captain', 'shepherd-engineer', 'starlight-captain',
];

function playerFor(actor) {
  return {
    sessionId: SESSION_ID,
    uid: actor.uid,
    displayName: actor.displayName,
    role: 'player',
    connected: true,
    seatId: actor.roleId,
    assignedRoleId: actor.roleId,
    activeConsoleRoleId: null,
    replacementRoleId: null,
    replacementStatus: null,
  };
}

function fixture() {
  const roster = ROLE_IDS.map((roleId, index) => ({
    sessionId: SESSION_ID,
    roleId,
    uid: `prepared-uid-${index + 1}`,
    displayName: `DEMO // ${roleId}`,
  }));
  const controller = {
    sessionId: SESSION_ID,
    profileRoleId: 'controller',
    uid: 'original-controller-uid',
    accountUid: 'original-controller-uid',
    currentUid: 'original-controller-uid',
    displayName: 'DEMO // controller',
    role: 'player',
    sameActor: true,
    connection: 'live',
    freshness: 'server',
    connected: true,
    seatId: null,
    assignedRoleId: null,
    activeConsoleRoleId: null,
    replacementRoleId: null,
    replacementStatus: null,
  };
  const currentPlayers = [
    ...roster.map(playerFor),
    { ...playerFor(controller), seatId: null, assignedRoleId: null },
    { sessionId: SESSION_ID, uid: 'gm-uid', displayName: 'DEMO // gm', role: 'gm', connected: true,
      seatId: null, assignedRoleId: null, replacementRoleId: null, replacementStatus: null },
  ];
  const visibleLabels = currentPlayers
    .filter(player => player.role === 'player' && player.uid !== roster[0].uid)
    .map(player => player.displayName);
  const choice = {
    targetRoleId: TARGET_ROLE_ID,
    defenders: 2,
    adjustment: 'none',
    presentRoleIds: ROLE_IDS.filter(roleId => roleId !== TARGET_ROLE_ID),
    attendanceEvidence: 'simulated-demo',
  };
  return { sessionId: SESSION_ID, roster, currentPlayers, visibleLabels, controller, choice,
    targetUid: roster[0].uid };
}

function resolver() {
  assert.equal(typeof arrestProof.resolveSimulatedAttendanceActors, 'function',
    'The proof needs a strict source/current census mapper before clicking attendance.');
  return arrestProof.resolveSimulatedAttendanceActors;
}

test('the known live ordinary controller may stay unselected while 17 original core actors are selected', () => {
  const resolve = resolver();
  const input = fixture();
  const result = resolve(input);
  assert.equal(input.choice.presentRoleIds.length, 17);
  assert.equal(result.options.find(option => option.kind === 'original-controller')?.uid, input.controller.uid);
  assert.equal(result.currentPlayerUids.includes(input.controller.uid), true);
  assert.equal(result.presentPlayerUids.length, 17);
  assert.equal(result.presentPlayerUids.includes(input.controller.uid), false);
  assert.equal(result.presentPlayerUids.includes(input.targetUid), false);
  assert.throws(() => resolve({ ...input, choice: {
    ...input.choice, presentRoleIds: [...input.choice.presentRoleIds, 'controller'],
  } }), /current roster/i, 'The extra controller must not widen the selected-role schema.');
  assert.deepEqual(result.presentPlayerUids,
    input.choice.presentRoleIds.map(roleId => input.roster.find(actor => actor.roleId === roleId).uid));
});

test('unknown current checkbox options fail instead of disappearing from the attendance census', () => {
  const resolve = resolver();
  const input = fixture();
  const stranger = { sessionId: SESSION_ID, uid: 'unknown-uid', displayName: 'DEMO // unknown',
    role: 'player', connected: true, assignedRoleId: null, seatId: null,
    replacementRoleId: null, replacementStatus: null };
  input.currentPlayers.push(stranger);
  input.visibleLabels.push(stranger.displayName);
  assert.throws(() => resolve(input), /original prepared actor|ordinary controller|unknown/i);
});

test('cross-session and GM labels cannot be mapped to an original prepared role', () => {
  const resolve = resolver();
  const crossSession = fixture();
  crossSession.currentPlayers.find(player => player.uid === crossSession.roster[1].uid).sessionId = 'other-session';
  assert.throws(() => resolve(crossSession), /session/i);

  const gmOption = fixture();
  gmOption.visibleLabels.push('DEMO // gm');
  assert.throws(() => resolve(gmOption), /current|option|roster/i);
});

test('replacement identities, duplicate display names, and mismatched current UIDs fail closed', () => {
  const resolve = resolver();
  const replacement = fixture();
  const replaced = replacement.currentPlayers.find(player => player.uid === replacement.roster[1].uid);
  replaced.replacementRoleId = 'dione-engineer';
  assert.throws(() => resolve(replacement), /replacement|original|role/i);

  const duplicate = fixture();
  duplicate.currentPlayers.find(player => player.uid === duplicate.roster[1].uid).displayName =
    duplicate.currentPlayers.find(player => player.uid === duplicate.roster[2].uid).displayName;
  duplicate.visibleLabels[0] = duplicate.currentPlayers.find(player => player.uid === duplicate.roster[1].uid).displayName;
  assert.throws(() => resolve(duplicate), /duplicate|unique|name/i);

  const wrongUid = fixture();
  const current = wrongUid.currentPlayers.find(player => player.uid === wrongUid.roster[1].uid);
  current.uid = 'different-current-uid';
  assert.throws(() => resolve(wrongUid), /original|uid|actor/i);
});

test('stale visible options fail while an unselected absent original role remains pending', () => {
  const resolve = resolver();
  const stale = fixture();
  stale.visibleLabels.pop();
  assert.throws(() => resolve(stale), /current|option|census|match/i);

  const staleCensus = fixture();
  staleCensus.currentPlayers.find(player => player.uid === staleCensus.roster[1].uid).connected = false;
  assert.throws(() => resolve(staleCensus), /stale|disconnected/i);

  const pending = fixture();
  const absentRole = pending.choice.presentRoleIds.pop();
  const absentActor = pending.roster.find(actor => actor.roleId === absentRole);
  pending.currentPlayers = pending.currentPlayers.filter(player => player.uid !== absentActor.uid);
  pending.visibleLabels = pending.visibleLabels.filter(label => label !== absentActor.displayName);
  const result = resolve(pending);
  assert.ok(result.pendingRoleIds.includes(absentRole));
  assert.throws(() => resolve({ ...pending, choice: {
    ...pending.choice, presentRoleIds: [...pending.choice.presentRoleIds, absentRole],
  } }), /current|option|offered/i);
});

test('the controller identity must be the current same-session ordinary account', () => {
  const resolve = resolver();
  for (const change of [
    { sessionId: 'other-session' },
    { profileRoleId: 'dione-captain' },
    { currentUid: 'different-uid' },
    { role: 'gm' },
    { replacementStatus: 'awaiting-re-role' },
    { assignedRoleId: 'dione-engineer' },
  ]) {
    const input = fixture();
    input.controller = { ...input.controller, ...change };
    assert.throws(() => resolve(input), /controller|identity|current|option|roster/i);
  }
});
