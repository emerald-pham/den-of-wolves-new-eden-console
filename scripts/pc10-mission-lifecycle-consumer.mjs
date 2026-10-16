import assert from 'node:assert/strict';

function sameOwnedGm(actor, originalGm, sessionId) {
  return actor?.sameActor === true && actor.sessionId === sessionId &&
    actor.uidHash === originalGm?.uidHash && actor.instanceId === originalGm?.instanceId &&
    actor.playerRole === 'gm' && actor.gmInstanceOwned === true &&
    actor.connection === 'live' && actor.freshness === 'server';
}

function privacyReceiptMatches(receipt, sessionId, originalGm) {
  return receipt?.status === 'ready' && receipt.sessionId === sessionId &&
    receipt.actorUidHash === originalGm?.uidHash && receipt.instanceId === originalGm?.instanceId &&
    receipt.sameActor === true && receipt.connection === 'live' && receipt.freshness === 'server';
}

/** Drive the existing GM-mounted mission privacy component before a normal deal. */
export async function prepareMissionPrivacyThroughMountedControl({ surface, sessionId, originalGm,
  timeoutMs = 60_000 }) {
  const before = await surface.observe();
  if (!sameOwnedGm(before, originalGm, sessionId)) {
    return { status: 'pending', reason: 'original-owned-gm-not-current-before-privacy-preparation' };
  }

  const page = surface.page;
  let region, status, text;
  try {
    region = page.getByRole('region', { name: 'New-location mission start', exact: true })
      .getByRole('region', { name: 'Participant mission privacy preparation', exact: true });
    status = region.getByRole('status', { name: 'Participant mission preparation', exact: true });
    await status.waitFor({ state: 'visible', timeout: timeoutMs });
    text = await status.innerText();
  } catch {
    return { status: 'pending', reason: 'ordinary-mounted-mission-privacy-control-not-currently-visible' };
  }

  let preparationRequests = 0;
  if (!text.includes('Participant missions are prepared.')) {
    const button = region.getByRole('button', { name: 'Prepare participant missions', exact: true });
    try {
      if (await button.count() !== 1 || !(await button.isVisible()) || !(await button.isEnabled())) {
        return { status: 'pending', reason: 'ordinary-mission-privacy-preparation-control-not-offered' };
      }
    } catch {
      return { status: 'pending', reason: 'ordinary-mission-privacy-preparation-control-not-offered' };
    }

    const responses = [];
    const onResponse = response => {
      try {
        const request = response.request();
        if (request.method() !== 'POST' ||
            !new URL(response.url()).pathname.endsWith('/us-central1/repairAwayMissionProjectionPrivacy')) return;
        const data = request.postDataJSON()?.data;
        responses.push(response.json().then(body => ({
          httpStatus: response.status(), requestSessionId: data?.sessionId,
          requestInstanceId: data?.instanceId, requestRunId: data?.repairRunId,
          requestId: data?.requestId, step: data?.step,
          sessionId: body?.result?.sessionId, replyRunId: body?.result?.repairRunId,
          stepReply: body?.result?.step, resultStatus: body?.result?.status,
          state: body?.result?.state, epoch: body?.result?.epoch,
          pointerCount: body?.result?.pointerCount, missionId: body?.result?.missionId,
        })).catch(() => null));
      } catch { /* Invalid or unrelated browser responses do not become preparation evidence. */ }
    };
    page.on('response', onResponse);
    try {
      await button.click();
      await status.getByText('Participant missions are prepared.', { exact: true })
        .waitFor({ state: 'visible', timeout: timeoutMs });
    } catch {
      return { status: 'pending', reason: 'ordinary-mission-privacy-preparation-not-confirmed-by-live-session' };
    } finally {
      page.off('response', onResponse);
    }
    const replies = await Promise.all(responses);
    const sameRunId = replies[0]?.requestRunId;
    const sameEpoch = replies[0]?.epoch;
    const validSequence = replies.length >= 3 && replies[0]?.step === 'hold' &&
      replies[replies.length - 1]?.step === 'finalize' &&
      replies.slice(1, -1).every(reply => reply?.step === 'repair');
    const validReceipts = validSequence && replies.every((reply, index) => {
      const final = index === replies.length - 1;
      const lastRepair = index === replies.length - 2;
      const expectedStep = index === 0 ? 'hold' : final ? 'finalize' : 'repair';
      const expectedState = final ? 'ready' : 'held';
      const validPointerState = index === 0 || final || lastRepair
        ? reply?.pointerCount === 0 && reply?.missionId === null
        : Number.isSafeInteger(reply?.pointerCount) && reply.pointerCount > 0 &&
          typeof reply?.missionId === 'string' && reply.missionId.length > 0;
      return reply?.httpStatus === 200 && reply.requestSessionId === sessionId &&
        reply.requestInstanceId === originalGm.instanceId && reply.requestRunId === sameRunId &&
        typeof sameRunId === 'string' && sameRunId.length > 0 &&
        reply.requestId === `${sameRunId}-${index}-${expectedStep}` &&
        reply.step === expectedStep && reply.sessionId === sessionId && reply.replyRunId === sameRunId &&
        reply.stepReply === expectedStep && reply.resultStatus === 'committed' &&
        Number.isSafeInteger(reply.epoch) && reply.epoch > 0 && reply.epoch === sameEpoch &&
        reply.state === expectedState && validPointerState;
    });
    if (!validReceipts) {
      return { status: 'pending', reason: 'ordinary-privacy-hold-repair-finalize-receipts-not-confirmed' };
    }
    preparationRequests = replies.length;
  }

  const after = await surface.observe();
  if (!sameOwnedGm(after, originalGm, sessionId)) {
    return { status: 'pending', reason: 'original-owned-gm-changed-during-privacy-preparation' };
  }
  return { status: 'ready', sessionId, actorUidHash: after.uidHash, instanceId: after.instanceId,
    sameActor: after.sameActor, connection: after.connection, freshness: after.freshness,
    preparationRequests };
}

/** Only an ordinary mounted privacy confirmation for the original GM can precede a deal. */
export async function startMissionDealThroughMountedUi({ sessionId, originalGm, preparePrivacy, deal }) {
  if (typeof preparePrivacy !== 'function' || typeof deal !== 'function') {
    return { status: 'pending', reason: 'ordinary-mission-privacy-preparation-required' };
  }
  let preparation;
  try { preparation = await preparePrivacy(); }
  catch { return { status: 'pending', reason: 'ordinary-mission-privacy-preparation-not-confirmed' }; }
  if (!privacyReceiptMatches(preparation, sessionId, originalGm)) {
    return { status: 'pending', reason: 'ordinary-mission-privacy-preparation-not-confirmed-for-original-gm-session' };
  }
  const dealReceipt = await deal();
  return { status: 'dealt', dealReceipt };
}

function committedMissionReceipt(receipt, { sessionId, missionId, actionType, status }) {
  const publicState = receipt?.publicState;
  return receipt?.status === 'committed' && receipt.actionType === actionType &&
    receipt.sessionId === sessionId && receipt.missionId === missionId &&
    typeof receipt.requestId === 'string' && receipt.requestId.length > 0 &&
    Number.isSafeInteger(receipt.revision) && receipt.revision > 0 &&
    publicState?.missionId === missionId && publicState.revision === receipt.revision &&
    publicState.status === status && publicState.phase === status;
}

function resolvedFinalAssignment(receipt, { sessionId, missionId }) {
  return committedMissionReceipt(receipt, { sessionId, missionId, actionType: 'assignCards', status: 'resolved' }) &&
    typeof receipt.publicState.groupId === 'string' && receipt.publicState.groupId.length > 0 &&
    typeof receipt.publicState.missionLeaderUid === 'string' && receipt.publicState.missionLeaderUid.length > 0;
}

function deliveredCustody(receipt, resolution, { sessionId, missionId }) {
  return committedMissionReceipt(receipt, { sessionId, missionId, actionType: 'dropOff', status: 'complete' }) &&
    receipt.publicState.groupId === resolution.publicState.groupId &&
    receipt.publicState.missionLeaderUid === resolution.publicState.missionLeaderUid &&
    receipt.publicState.custody?.status === 'dropped-off' &&
    receipt.publicState.custody.holderUid === resolution.publicState.missionLeaderUid &&
    typeof receipt.publicState.custody.shipId === 'string' && receipt.publicState.custody.shipId.length > 0;
}

function publicReceipt(receipt) {
  return { status: receipt.status, sessionId: receipt.sessionId, missionId: receipt.missionId,
    revision: receipt.revision, publicState: receipt.publicState };
}

/** Consume the automatic last-assignment resolution; the leader's ordinary UI owns dropoff. */
export async function resolveAndDeliverMissionThroughMountedUi({ sessionId, missionId,
  missionLeaderRoleId, lastAssignmentReceipt, deliverMission }) {
  if (!resolvedFinalAssignment(lastAssignmentReceipt, { sessionId, missionId })) {
    return { status: 'pending', reason: 'last-participant-assignment-did-not-commit-automatic-resolution' };
  }
  if (typeof deliverMission !== 'function' || typeof missionLeaderRoleId !== 'string' || !missionLeaderRoleId) {
    return { status: 'pending', reason: 'original-mission-leader-dropoff-control-not-currently-offered' };
  }
  let delivery;
  try { delivery = await deliverMission(missionLeaderRoleId, missionId); }
  catch { return { status: 'pending', reason: 'original-mission-leader-dropoff-not-committed' }; }
  if (!deliveredCustody(delivery, lastAssignmentReceipt, { sessionId, missionId })) {
    return { status: 'pending', reason: 'same-mission-leader-custody-delivery-not-confirmed' };
  }
  return { status: 'completed', resolution: publicReceipt(lastAssignmentReceipt), delivery: publicReceipt(delivery) };
}
