import assert from 'node:assert/strict';

/** Shared mounted-UI mission lifecycle sequence used by the bounded PC10 proof consumers. */
export async function startMissionDealThroughMountedUi({ deal }) {
  return deal();
}

export async function resolveAndDeliverMissionThroughMountedUi({
  missionId, missionLeaderRoleId, addFacilitatorCards, resolveMission, deliverMission, strict = false,
}) {
  const facilitatorCards = await addFacilitatorCards();
  if (strict) assert.ok(facilitatorCards, 'The mounted mission facilitator-card control must commit.');
  if (!facilitatorCards) return { status: 'pending', reason: 'facilitator-cards-not-committed' };

  const resolution = await resolveMission();
  if (strict) assert.equal(resolution?.publicState?.status, 'resolved');
  if (resolution?.publicState?.status !== 'resolved') {
    return { status: 'pending', reason: 'mission-resolution-not-committed' };
  }

  const delivery = await deliverMission(missionLeaderRoleId, missionId);
  if (strict) assert.equal(delivery?.publicState?.status, 'complete');
  if (delivery?.publicState?.status !== 'complete') {
    return { status: 'pending', reason: 'mission-custody-delivery-not-committed', resolution };
  }
  return { status: 'completed', resolution, delivery };
}
