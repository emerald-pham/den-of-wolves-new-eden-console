import assert from 'node:assert/strict';
import test from 'node:test';
import { prepareMissionPrivacyThroughMountedControl, resolveAndDeliverMissionThroughMountedUi, startMissionDealThroughMountedUi } from './pc10-mission-lifecycle-consumer.mjs';

const sessionId = 'session-original';
const missionId = 'mission-original';
const missionLeaderRoleId = 'wing-commander';
const originalGm = { sessionId, uidHash: 'gm-original', instanceId: 'gm-instance-original' };

function resolutionReceipt({ status = 'committed', currentSession = sessionId, currentMission = missionId,
  revision = 8, projectionRevision = revision, missionStatus = 'resolved', actionType = 'assignCards', outcome = 'failure' } = {}) {
  return { status, sessionId: currentSession, missionId: currentMission, requestId: 'assignment-request-original',
    revision, actionType,
    publicState: { missionId: currentMission, groupId: 'fleet-original', revision: projectionRevision,
      phase: missionStatus, status: missionStatus, missionLeaderUid: 'leader-original',
      custody: { status: 'mission-leader', holderUid: 'leader-original', shipId: null },
      outcomes: [{ opportunityId: 'ordinary-task', outcome }] } };
}

function deliveryReceipt({ status = 'committed', currentSession = sessionId, currentMission = missionId,
  revision = 9, projectionRevision = revision, missionStatus = 'complete', groupId = 'fleet-original',
  leaderUid = 'leader-original', custodyStatus = 'dropped-off', holderUid = 'leader-original', shipId = 'ship-original' } = {}) {
  return { status, sessionId: currentSession, missionId: currentMission, requestId: 'dropoff-request-original', revision,
    actionType: 'dropOff',
    publicState: { missionId: currentMission, groupId, revision: projectionRevision, phase: missionStatus,
      status: missionStatus, missionLeaderUid: leaderUid,
      custody: { status: custodyStatus, holderUid, shipId }, outcomes: [{ opportunityId: 'ordinary-task', outcome: 'failure' }] } };
}

test('the mission-deal seam runs the original GM privacy UI before deal and retains that owner/session', async () => {
  const events = [];
  let privacyReady = false;
  let gmActor = { ...originalGm, sameActor: true, gmInstanceOwned: true, connection: 'live', freshness: 'server' };
  const started = await startMissionDealThroughMountedUi({
    sessionId, originalGm,
    preparePrivacy: async () => {
      events.push('select-original-gm');
      assert.deepEqual(gmActor, { ...originalGm, sameActor: true, gmInstanceOwned: true, connection: 'live', freshness: 'server' });
      events.push('click-ordinary-prepare-control');
      // The mounted component completed its held/repair/finalize requests and
      // only exposes ready after the current-session snapshot confirms them.
      privacyReady = true;
      events.push('observe-prepared-status');
      assert.deepEqual(gmActor, { ...originalGm, sameActor: true, gmInstanceOwned: true, connection: 'live', freshness: 'server' });
      return { status: 'ready', sessionId, actorUidHash: gmActor.uidHash, instanceId: gmActor.instanceId,
        sameActor: gmActor.sameActor, connection: gmActor.connection, freshness: gmActor.freshness };
    },
    deal: async () => {
      assert.equal(privacyReady, true, 'No private cards are dealt before current-session privacy readiness.');
      events.push('deal-through-normal-GM-control');
      return { status: 'committed', sessionId, missionId };
    },
  });
  assert.equal(started.status, 'dealt');
  assert.deepEqual(events, ['select-original-gm', 'click-ordinary-prepare-control', 'observe-prepared-status',
    'deal-through-normal-GM-control']);
});

test('the mission-deal seam refuses stale preparation or a changed GM before any private deal', async () => {
  const variants = [
    { status: 'pending', sessionId, actorUidHash: originalGm.uidHash, instanceId: originalGm.instanceId,
      sameActor: true, connection: 'live', freshness: 'server' },
    { status: 'ready', sessionId: 'other-session', actorUidHash: originalGm.uidHash, instanceId: originalGm.instanceId,
      sameActor: true, connection: 'live', freshness: 'server' },
    { status: 'ready', sessionId, actorUidHash: 'replacement-gm', instanceId: originalGm.instanceId,
      sameActor: true, connection: 'live', freshness: 'server' },
    { status: 'ready', sessionId, actorUidHash: originalGm.uidHash, instanceId: 'replacement-instance',
      sameActor: true, connection: 'live', freshness: 'server' },
    { status: 'ready', sessionId, actorUidHash: originalGm.uidHash, instanceId: originalGm.instanceId,
      sameActor: false, connection: 'live', freshness: 'server' },
  ];
  for (const preparation of variants) {
    let dealCalls = 0;
    const result = await startMissionDealThroughMountedUi({ sessionId, originalGm,
      preparePrivacy: async () => preparation,
      deal: async () => { dealCalls++; return { status: 'committed', sessionId, missionId }; },
    });
    assert.equal(result.status, 'pending');
    assert.equal(dealCalls, 0);
  }
});

test('the final participant assignment resolves automatically and delivers only through the original leader', async () => {
  const events = [];
  for (const outcome of ['failure', 'critical-success']) {
    const resolution = resolutionReceipt({ outcome });
    const delivered = deliveryReceipt();
    const result = await resolveAndDeliverMissionThroughMountedUi({
      sessionId, missionId, missionLeaderRoleId, lastAssignmentReceipt: resolution,
      addFacilitatorCards: async () => { events.push('obsolete-facilitator-control'); throw new Error('not mounted after automatic resolution'); },
      resolveMission: async () => { events.push('obsolete-resolve-control'); throw new Error('not mounted after automatic resolution'); },
      deliverMission: async (roleId, currentMissionId) => {
        events.push(['deliver', roleId, currentMissionId]);
        assert.equal(roleId, missionLeaderRoleId);
        assert.equal(currentMissionId, missionId);
        return delivered;
      },
    });
    assert.equal(result.status, 'completed');
    assert.equal(result.resolution.publicState.outcomes[0].outcome, outcome,
      'Lifecycle completion is independent of the source-random mission outcome.');
    assert.equal(result.delivery.publicState.custody.status, 'dropped-off');
  }
  assert.deepEqual(events, [['deliver', missionLeaderRoleId, missionId], ['deliver', missionLeaderRoleId, missionId]]);
});

test('stale, held, manual, mismatched-session, mismatched-mission, and wrong-revision results cannot authorize delivery', async () => {
  const valid = resolutionReceipt();
  const invalid = [
    resolutionReceipt({ status: 'stale' }),
    resolutionReceipt({ missionStatus: 'active' }),
    resolutionReceipt({ actionType: 'resolve' }),
    resolutionReceipt({ currentSession: 'other-session' }),
    resolutionReceipt({ currentMission: 'other-mission' }),
    resolutionReceipt({ projectionRevision: 7 }),
  ];
  for (const receipt of invalid) {
    let deliveryCalls = 0;
    const result = await resolveAndDeliverMissionThroughMountedUi({
      sessionId, missionId, missionLeaderRoleId, lastAssignmentReceipt: receipt,
      addFacilitatorCards: async () => { throw new Error('Manual facilitator UI is obsolete.'); },
      resolveMission: async () => { throw new Error('Manual resolution UI is obsolete.'); },
      deliverMission: async () => { deliveryCalls++; return deliveryReceipt(); },
    });
    assert.equal(result.status, 'pending');
    assert.equal(deliveryCalls, 0);
  }
  assert.equal(valid.publicState.status, 'resolved');
});

test('a mismatched custody-delivery receipt remains pending even after a valid automatic resolution', async () => {
  for (const delivered of [
    deliveryReceipt({ currentSession: 'other-session' }),
    deliveryReceipt({ currentMission: 'other-mission' }),
    deliveryReceipt({ groupId: 'other-group' }),
    deliveryReceipt({ leaderUid: 'other-leader' }),
    deliveryReceipt({ custodyStatus: 'mission-leader' }),
    deliveryReceipt({ holderUid: 'other-holder' }),
    deliveryReceipt({ projectionRevision: 8 }),
  ]) {
    const result = await resolveAndDeliverMissionThroughMountedUi({
      sessionId, missionId, missionLeaderRoleId, lastAssignmentReceipt: resolutionReceipt(),
      addFacilitatorCards: async () => { throw new Error('Manual facilitator UI is obsolete.'); },
      resolveMission: async () => { throw new Error('Manual resolution UI is obsolete.'); },
      deliverMission: async () => delivered,
    });
    assert.equal(result.status, 'pending');
  }
});


function mountedPrivacySurface({ mismatchedStep = null, repairCount = 1 } = {}) {
  const events = [];
  let ready = false;
  let responseListener = null;
  const actor = { ...originalGm, sameActor: true, gmInstanceOwned: true, playerRole: 'gm',
    connection: 'live', freshness: 'server' };
  const status = {
    waitFor: async () => { events.push('status-visible'); },
    innerText: async () => ready ? 'Participant missions are prepared.' :
      'Prepare participant missions before dealing private cards.',
    getByText: (text, options) => ({ waitFor: async () => {
      assert.equal(text, 'Participant missions are prepared.');
      assert.equal(options.exact, true);
      events.push('live-preparation-confirmed');
      assert.equal(ready, true);
    } }),
  };
  const button = {
    count: async () => 1,
    isVisible: async () => true,
    isEnabled: async () => true,
    click: async () => {
      events.push('ordinary-prepare-button-clicked');
      const runId = 'privacy-run-original';
      const steps = ['hold', ...Array(repairCount).fill('repair'), 'finalize'];
      steps.forEach((step, index) => {
        const wrongRequest = mismatchedStep === step;
        const missionId = step === 'repair' && index < steps.length - 2 ? `legacy-mission-${index}` : null;
        responseListener({
          url: () => 'http://127.0.0.1:5001/demo/us-central1/repairAwayMissionProjectionPrivacy',
          request: () => ({ method: () => 'POST', postDataJSON: () => ({ data: {
            sessionId: wrongRequest ? 'other-session' : sessionId,
            instanceId: originalGm.instanceId,
            repairRunId: runId,
            requestId: `${runId}-${index}-${step}`,
            step,
          } }) }),
          status: () => 200,
          json: async () => ({ result: {
            sessionId, repairRunId: runId, step, status: 'committed', epoch: 12,
            state: step === 'finalize' ? 'ready' : 'held',
            pointerCount: missionId ? 1 : 0, missionId,
          } }),
        });
      });
      ready = true;
    },
  };
  const privacyRegion = { getByRole: (role, options) => {
    if (role === 'status') {
      assert.equal(options.name, 'Participant mission preparation');
      return status;
    }
    assert.equal(role, 'button');
    assert.equal(options.name, 'Prepare participant missions');
    return button;
  } };
  const startRegion = { getByRole: (role, options) => {
    assert.equal(role, 'region');
    assert.equal(options.name, 'Participant mission privacy preparation');
    return privacyRegion;
  } };
  const page = {
    getByRole: (role, options) => {
      assert.equal(role, 'region');
      assert.equal(options.name, 'New-location mission start');
      events.push('ordinary-mission-start-mounted');
      return startRegion;
    },
    on: (event, listener) => { assert.equal(event, 'response'); responseListener = listener; },
    off: (event, listener) => {
      assert.equal(event, 'response');
      assert.equal(responseListener, listener);
      responseListener = null;
    },
  };
  return { events, surface: { page, observe: async () => { events.push('observe-original-gm'); return { ...actor }; } } };
}

test('the mounted privacy control confirms the full hold-repair-repair-finalize cutover before deal', async () => {
  const { events, surface } = mountedPrivacySurface({ repairCount: 2 });
  let preparation;
  const started = await startMissionDealThroughMountedUi({ sessionId, originalGm,
    preparePrivacy: async () => {
      preparation = await prepareMissionPrivacyThroughMountedControl({ surface, sessionId, originalGm });
      return preparation;
    },
    deal: async () => {
      events.push('normal-deal');
      return { status: 'committed', sessionId, missionId };
    },
  });
  assert.equal(started.status, 'dealt');
  assert.equal(started.dealReceipt.sessionId, sessionId);
  assert.equal(preparation.preparationRequests, 4);
  assert.equal(events.filter(event => event === 'observe-original-gm').length, 2,
    'The same original live owner is observed on both sides of mounted preparation.');
  assert.ok(events.indexOf('ordinary-prepare-button-clicked') < events.indexOf('live-preparation-confirmed'));
  assert.ok(events.indexOf('live-preparation-confirmed') < events.indexOf('normal-deal'));
});

test('the mounted privacy control cannot authorize deal from a mismatched cutover request', async () => {
  const { events, surface } = mountedPrivacySurface({ mismatchedStep: 'repair' });
  let dealCalls = 0;
  const started = await startMissionDealThroughMountedUi({ sessionId, originalGm,
    preparePrivacy: () => prepareMissionPrivacyThroughMountedControl({ surface, sessionId, originalGm }),
    deal: async () => { dealCalls++; return { status: 'committed', sessionId, missionId }; },
  });
  assert.equal(started.status, 'pending');
  assert.equal(dealCalls, 0);
  assert.equal(events.includes('normal-deal'), false);
});
