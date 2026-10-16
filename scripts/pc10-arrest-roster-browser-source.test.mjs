import assert from 'node:assert/strict';
import test from 'node:test';
import * as arrestProof from './pc10-arrest-posse-proof.mjs';

const SESSION_ID = 'pc10-browser-local-roster-session';

function sourceReader(localRoster, counters, browser) {
  return {
    page: {
      async evaluate(_reader, requestedSessionId) {
        counters[browser] += 1;
        assert.equal(requestedSessionId, SESSION_ID);
        return localRoster.filter(actor => actor.sessionId === requestedSessionId);
      },
    },
  };
}

function identities() {
  const roster = [
    { sessionId: SESSION_ID, roleId: 'dione-president', uid: 'crew-original-president-uid',
      displayName: 'Dione // President' },
    { sessionId: SESSION_ID, roleId: 'dione-captain', uid: 'crew-original-captain-uid',
      displayName: 'Dione // Captain' },
  ];
  const controller = {
    sessionId: SESSION_ID,
    memberSessionId: SESSION_ID,
    profileRoleId: 'controller',
    uid: 'original-unassigned-controller-uid',
    accountUid: 'original-unassigned-controller-uid',
    currentUid: 'original-unassigned-controller-uid',
    displayName: 'Ordinary Controller',
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
    ...roster.map(actor => ({
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
    })),
    { ...controller, uid: controller.uid },
  ];
  const choice = {
    targetRoleId: 'dione-president',
    defenders: 1,
    adjustment: 'none',
    presentRoleIds: ['dione-captain'],
    attendanceEvidence: 'simulated-demo',
  };
  return { roster, controller, currentPlayers, choice, targetUid: roster[0].uid,
    visibleLabels: [roster[1].displayName, controller.displayName] };
}

function rosterReader() {
  assert.equal(typeof arrestProof.readOriginalPreparedDemoRoster, 'function',
    'The arrest proof must read the original roster from its owning Crew browser.');
  return arrestProof.readOriginalPreparedDemoRoster;
}

test('prepared identities come from Crew local storage and still reconcile to current server census', async () => {
  const readOriginalPreparedDemoRoster = rosterReader();
  const input = identities();
  const counters = { gm: 0, crew: 0 };
  const context = {
    gm: sourceReader([], counters, 'gm'),
    crew: sourceReader(input.roster, counters, 'crew'),
  };

  const roster = await readOriginalPreparedDemoRoster(context, SESSION_ID);
  assert.deepEqual(roster, input.roster, 'Preserve each prepared session, role, UID and display name exactly.');
  assert.deepEqual(counters, { gm: 0, crew: 1 }, 'Never read the GM browser-local roster.');

  assert.equal(typeof arrestProof.resolveSimulatedAttendanceActors, 'function');
  const mapped = arrestProof.resolveSimulatedAttendanceActors({ sessionId: SESSION_ID, roster,
    currentPlayers: input.currentPlayers, visibleLabels: input.visibleLabels,
    controller: input.controller, choice: input.choice, targetUid: input.targetUid });
  assert.deepEqual(mapped.presentPlayerUids, ['crew-original-captain-uid']);
  assert.equal(mapped.options.find(option => option.kind === 'original-controller')?.uid,
    'original-unassigned-controller-uid');
  assert.equal(mapped.currentPlayerUids.includes('original-unassigned-controller-uid'), true);
  assert.equal(mapped.presentPlayerUids.includes('original-unassigned-controller-uid'), false);
});

test('an empty Crew roster remains unavailable even when GM-local storage has records', async () => {
  const readOriginalPreparedDemoRoster = rosterReader();
  const input = identities();
  const counters = { gm: 0, crew: 0 };
  const context = {
    gm: sourceReader(input.roster, counters, 'gm'),
    crew: sourceReader([], counters, 'crew'),
  };

  const roster = await readOriginalPreparedDemoRoster(context, SESSION_ID);
  assert.deepEqual(roster, []);
  assert.deepEqual(counters, { gm: 0, crew: 1 }, 'An empty Crew roster must never fall back to GM data.');
  assert.throws(() => arrestProof.validatePosseChoice(input.choice, roster.map(actor => actor.roleId)),
    /current prepared role roster/i);
});

test('the public arrest proof uses the Crew-local prepared roster before touching the GM UI', async () => {
  const input = identities();
  const counters = { gm: 0, crew: 0 };
  const gmState = {
    sessionId: SESSION_ID,
    uidHash: 'current-gm-hash',
    instanceId: 'current-owned-instance',
    cycle: 1,
    phase: 'active',
    turnStatePhase: 'team',
    connection: 'live',
    freshness: 'server',
    sameActor: true,
    playerRole: 'gm',
    gmInstanceOwned: true,
    fullGameDemo: { status: 'inactive', progression: 'manual' },
  };
  const gm = sourceReader([], counters, 'gm');
  gm.observe = async () => gmState;
  const context = {
    initial: { sessionId: SESSION_ID },
    started: { uidHash: gmState.uidHash, instanceId: gmState.instanceId },
    gm,
    crew: sourceReader(input.roster, counters, 'crew'),
  };

  let result;
  await assert.doesNotReject(async () => {
    result = await arrestProof.proveArrestPosse(context, input.choice);
  });
  assert.equal(result.accepted, false, 'The inactive demo safely blocks before any UI action.');
  assert.deepEqual(counters, { gm: 0, crew: 1 },
    'The public proof must use Crew-local storage; GM stays empty and the blocked UI is untouched.');
});
