import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import * as runner from './pc10-fresh-minimum-ring-proof.mjs';
import * as adapter from './pc10-station-combat-adapter.mjs';
import { observeUiReceipt } from './pc10-browser-ui-receipt.mjs';

// Before extraction this executes the exact existing nested Wing consumer,
// with bounded normal-surface dependencies. After extraction the same cases
// call its production export. Both are local consumer proof, not native play.
const runnerSource = await readFile(new URL('./pc10-fresh-minimum-ring-proof.mjs', import.meta.url), 'utf8');
function wingConsumer(dependencies) {
  if (runner.dispatchStationWingChoice) return (current, options) =>
    runner.dispatchStationWingChoice(current, { ...dependencies, ...options });
  const start = runnerSource.indexOf('const chooseWing=async(current,{deadlineAt})=>{');
  const end = runnerSource.indexOf('const readOwnedStationAuthority=', start);
  assert.ok(start > 0 && end > start, 'Execute the actual pre-repair nested Wing consumer.');
  return new Function('dependencies', `const {recipient,fullMember,evidence,action,recoveredLaunches,
    assertSparseStationWing,assertRecoveredStationLaunch,writeFile,publicLifecycleReceipt,directory}=dependencies;
    ${runnerSource.slice(start, end)} return chooseWing;`)(dependencies);
}

function fixture(step = 'targeting', { change = 'resolved', drift, sameStepFailure, receiptStatus = 'committed', afterClick } = {}) {
  const current = { attackId: 'original', turn: 2, revision: 7, status: 'declared', currentStep: step,
    threatSiteCode: 'P', targetGroupId: 'fleet-1', threatSourceId: 'arrival-owned', airspaceLocked: true };
  const member = { hasAuth: true, sameActor: true, uidHash: 'wing-original', sessionId: 'sid', meSessionId: 'sid',
    playerRole: 'player', assignedRoleId: 'wing-commander', activeConsoleRoleId: 'wing-commander', seatId: 'wing-commander',
    currentCanonicalSeatOwned: true, currentMemberBerthPresent: true, currentMemberBerthMatches: true,
    connection: 'live', freshness: 'server', fleetGroupId: 'fleet-1', cycle: 2, phase: 'active',
    connectionGeneration: 2, identityHydrationRevision: 3, documentTimeOrigin: 1000,
    profileRoleId: null, profileSessionId: null, replacementRoleId: null, replacementStatus: null };
  const authority = { ...structuredClone(member), airspace: 'restricted', turnStatePhase: 'team', phaseProgression: 'manual',
    turnPhaseTurn: 2, turnPhaseOpenAirspaceEndsAt: '9999-12-31T23:59:59.999Z',
    turnPhaseTeamPhaseEndsAt: '9999-12-31T23:59:59.999Z', turnStateCurrentTurn: 2, turnStateMaxTurn: 6,
    turnStatePhaseRevision: 5, turnStateStartedAt: '2026-10-08T00:00:00.000Z',
    turnStateEndsAt: '9999-12-31T23:59:59.999Z',
    discoveryAuthority: { groupId: 'fleet-1', shipId: 'aegis', revision: 4, fleetGroupVesselIds: ['aegis'] },
    entitledShipId: 'aegis' };
  const gmAuthority = { sessionId: 'sid', uidHash: 'gm-original', generation: 1, hydrationRevision: 2,
    instanceId: 'gm-original-instance', claimedAt: 'lease-original' };
  let latest = current, clicked = 0, captures = 0, insideCapture = false;
  const observations = [], deadlineAt = Date.now() + 2000;
  const advance = () => {
    if (change === 'resolved') {
      latest = { ...current, revision: 11, status: 'resolved', currentStep: 'resolved',
        airspaceLocked: false, pStationRepeat: { status: 'repeat' } };
      authority.airspace = 'lifted'; authority.turnStatePhase = 'coordination';
      authority.turnStatePhaseRevision = 6; authority.turnStateStartedAt = authority.turnPhaseTeamPhaseEndsAt;
    } else if (change === 'ordered') latest = { ...current, revision: 10,
      currentStep: step === 'targeting' ? 'medium-range' : 'short-range' };
    else if (change === 'same-step') latest = { ...current, revision: 8 };
    drift?.({ member, authority, latest, gmAuthority });
  };
  const button = name => ({
    isVisible: async () => true,
    isEnabled: async () => step === 'targeting' ? name === 'Launch Fighter Wing Alpha' : name.startsWith('Pass '),
    click: async () => { clicked++; afterClick?.({ member, authority, latest, gmAuthority }); },
  });
  const recipient = { page: { getByRole: (role, options = {}) => role === 'region' ? {
    isVisible: async () => true,
    getByRole: (kind, choice = {}) => kind === 'button' ? button(choice.name) :
      kind === 'checkbox' ? { all: async () => [] } : { count: async () => 0 },
  } : button(options.name) } };
  const phase = () => ({ sessionId: 'sid', gmAuthority: structuredClone(gmAuthority), session: {
    phase: 'active', currentTurn: 2, turnLimit: 6, fullGameDemo: { status: 'active', progression: 'manual' },
    turnPhase: { turn: 2, teamPhaseEndsAt: '9999-12-31T23:59:59.999Z', openAirspaceEndsAt: '9999-12-31T23:59:59.999Z',
      airspace: { state: authority.airspace, tickerActive: true, pressAccess: false }, progression: 'manual' },
    turnState: { currentTurn: 2, maxTurn: 6, phase: authority.turnStatePhase,
      phaseRevision: authority.turnStatePhase === 'team' ? 5 : 6,
      startedAt: authority.turnStatePhase === 'team' ? '2026-10-08T00:00:00.000Z' : '9999-12-31T23:59:59.999Z',
      endsAt: '9999-12-31T23:59:59.999Z' },
  } });
  const dependencies = { recipient, fullMember: async () => structuredClone(member),
    readWingAuthority: async () => structuredClone(authority),
    evidence: { stationWingOriginal: structuredClone(member) }, gmAuthority: structuredClone(gmAuthority),
    readAttack: async () => structuredClone(latest), readTurnState: async () => phase(),
    recoveredLaunches: new Map(), directory: '/tmp/unused-station-wing-fixture',
    assertSparseStationWing: adapter.assertSparseStationWing, assertRecoveredStationLaunch: adapter.assertRecoveredStationLaunch,
    writeFile: async () => { throw Error('No synthetic fixture should write recovered-launch artifacts'); },
    publicLifecycleReceipt: capture => capture,
    onSourceProgress: async observation => observations.push(observation),
    action: async (_surface, endpoint, choose) => {
      captures++; insideCapture = true; advance();
      let rejectResponse;
      try {
        await observeUiReceipt({ waitForResponse: () => new Promise((_, reject) => { rejectResponse = reject; }),
          choose: async () => { await choose(); if (!clicked) throw Error('An inert callback must cancel explicitly');
            rejectResponse(new Error('Synthetic committed response follows below')); },
        }).catch(error => { if (!clicked) throw error; });
      } finally { rejectResponse?.(new Error('Abandoned observer stays handled')); }
      if (sameStepFailure) throw sameStepFailure;
      return { endpoint, httpStatus: 200, data: { wingId: 'fighter-wing-alpha', expectedTurn: 2,
        expectedRevision: current.revision, requestId: 'explicit-ui-choice' }, result: { status: receiptStatus,
        attackId: current.attackId, wingId: 'fighter-wing-alpha', revision: current.revision + 1, launched: true } };
    },
  };
  return { current, dependencies, deadlineAt, invoke: options => wingConsumer(dependencies)(current,
    { deadlineAt, ...options }), observations, counts: () => ({ clicked, captures, insideCapture }) };
}

for (const step of ['targeting', 'medium-range', 'short-range']) {
  for (const change of ['resolved', ...(step === 'short-range' ? [] : ['ordered'])]) {
    test(`actual Wing ${step} final callback cancels valid ${change} source progress before click`, async () => {
      const f = fixture(step, { change });
      assert.equal(await f.invoke(), undefined);
      assert.equal(f.counts().captures, 1, 'Transition occurs after the real capture is armed.');
      assert.equal(f.counts().clicked, 0);
      assert.equal(f.observations.length, 1);
      assert.equal(f.observations[0].deadlineAt, f.deadlineAt);
      assert.equal(f.observations[0].actionCredit, false);
      assert.equal(f.observations[0].originalAttack.targetGroupId, f.current.targetGroupId);
      assert.equal(f.observations[0].observedAttack.threatSourceId, f.current.threatSourceId);
    });
  }
}

for (const [name, drift] of [
  ['UID', ({ member, authority }) => { member.uidHash = authority.uidHash = 'foreign'; }],
  ['generation', ({ member, authority }) => { member.connectionGeneration++; authority.connectionGeneration++; }],
  ['hydration', ({ member, authority }) => { member.identityHydrationRevision++; authority.identityHydrationRevision++; }],
  ['document', ({ member, authority }) => { member.documentTimeOrigin++; authority.documentTimeOrigin++; }],
  ['discovery', ({ authority }) => { authority.discoveryAuthority.revision++; }],
  ['entitled ship', ({ authority }) => { authority.entitledShipId = 'foreign-ship'; }],
  ['canonical seat', ({ member }) => { member.currentCanonicalSeatOwned = false; }],
  ['live connection', ({ member }) => { member.connection = 'reconnecting'; }],
  ['restored phase revision', ({ authority }) => { authority.turnStatePhaseRevision++; }],
  ['restored deadline', ({ authority }) => { authority.turnStateEndsAt = '9999-12-30T23:59:59.999Z'; }],
  ['arrival', ({ latest }) => { latest.threatSourceId = 'arrival-foreign'; }],
  ['group', ({ latest }) => { latest.targetGroupId = 'fleet-foreign'; }],
  ['GM lease', ({ gmAuthority }) => { gmAuthority.instanceId = 'foreign-instance'; }],
]) {
  test(`actual Wing ${name} drift remains fatal with simultaneous forward progress`, async () => {
    const f = fixture('targeting', { drift });
    await assert.rejects(f.invoke());
    assert.equal(f.counts().clicked, 0);
    assert.deepEqual(f.observations, []);
  });
}

test('actual Wing same-step stale launch keeps the existing exact rejection for exclusive outer recovery', async () => {
  const original = Error('captured stale Alpha launch rejection');
  const f = fixture('targeting', { change: 'same-step', sameStepFailure: original });
  await assert.rejects(f.invoke(), error => error === original);
  assert.equal(f.counts().clicked, 1);
  assert.deepEqual(f.observations, []);
});

test('actual Wing unknown mutation receipt stays fatal and never becomes a source-progress cancellation', async () => {
  const f = fixture('targeting', { change: 'same-step', receiptStatus: 'ambiguous' });
  await assert.rejects(f.invoke());
  assert.equal(f.counts().clicked, 1);
  assert.deepEqual(f.observations, []);
});

test('actual Wing original final callback deadline cannot expire into another choice or new budget', async () => {
  const f = fixture('targeting');
  await assert.rejects(f.invoke({ deadlineAt: Date.now() - 1 }));
  assert.equal(f.counts().clicked, 0);
});

test('actual Wing restored Coordination alone cannot cancel a still-declared same-step attack', async () => {
  const f = fixture('targeting', { change: 'same-step', drift: ({ authority }) => {
    authority.airspace = 'lifted'; authority.turnStatePhase = 'coordination';
    authority.turnStatePhaseRevision = 6; authority.turnStateStartedAt = authority.turnPhaseTeamPhaseEndsAt;
  } });
  await assert.rejects(f.invoke());
  assert.equal(f.counts().clicked, 0);
  assert.deepEqual(f.observations, []);
});

for (const name of ['private attack permission', 'phase transport']) {
  test(`actual Wing ${name} error remains fatal alongside pending progress`, async () => {
    const f = fixture();
    const original = Error(name);
    f.dependencies[name.startsWith('private') ? 'readAttack' : 'readTurnState'] = async () => { throw original; };
    await assert.rejects(f.invoke(), error => error === original);
    assert.equal(f.counts().clicked, 0);
    assert.deepEqual(f.observations, []);
  });
}

for (const step of ['targeting', 'medium-range', 'short-range']) {
  for (const status of ['committed', 'replayed']) {
    test(`actual Wing ${step} retains successful ${status} receipt despite post-click progress`, async () => {
      const f = fixture(step, { change: 'same-step', receiptStatus: status,
        afterClick: ({ latest }) => { latest.revision += 2; latest.currentStep = 'boarding'; } });
      assert.deepEqual(await f.invoke(), { committed: true });
      assert.equal(f.counts().clicked, 1);
      assert.equal(f.counts().captures, 1);
      assert.deepEqual(f.observations, []);
    });
  }
}
