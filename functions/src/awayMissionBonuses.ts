import type { MissionLifecycleParticipant, MissionLifecycleState, MissionBonusSourceInput } from './missionLifecycle';

interface ParticipantCraftBinding {
  readonly participantUid: string;
  readonly craftIds: readonly string[];
}

const SHUTTLE_BONUSES: Readonly<Record<string, Readonly<{
  readonly roleId: string;
  readonly bonuses: MissionBonusSourceInput['bonuses'];
}>>> = {
  starlight: {
    roleId: 'wing-commander',
    bonuses: { exploration: 3, salvage: 1 },
  },
  hummingbird: {
    roleId: 'quellon-explorer',
    bonuses: { exploration: 3, mining: 1 },
  },
};

/**
 * Build trusted source inputs from the mission-start participant/ship
 * snapshot. `calculateMissionOpportunityTotals` applies them only when that
 * participant actually contributed to an opportunity.
 */
export function missionBonusSourcesForShuttleParticipants(
  lifecycle: MissionLifecycleState,
  participantCrafts: readonly ParticipantCraftBinding[],
): readonly MissionBonusSourceInput[] {
  if (!isMissionParticipantSnapshot(lifecycle) || !Array.isArray(participantCrafts)) return [];
  const participantByUid = new Map<string, MissionLifecycleParticipant>(
    lifecycle.participants.map((participant) => [participant.uid, participant]),
  );
  const seenUids = new Set<string>();
  const sources: MissionBonusSourceInput[] = [];
  for (const binding of participantCrafts) {
    if (!isRecord(binding) || typeof binding.participantUid !== 'string' ||
        !Array.isArray(binding.craftIds) || binding.craftIds.some((id) => typeof id !== 'string') ||
        new Set(binding.craftIds).size !== binding.craftIds.length || seenUids.has(binding.participantUid)) return [];
    seenUids.add(binding.participantUid);
    const participant = participantByUid.get(binding.participantUid);
    if (!participant) return [];
    for (const craftId of binding.craftIds) {
      const configured = SHUTTLE_BONUSES[craftId];
      if (!configured || configured.roleId !== participant.roleId ||
          !lifecycle.availableCarrierCraftIds.includes(craftId)) continue;
      sources.push({
        participantUid: participant.uid,
        source: { kind: 'craft', id: craftId },
        bonuses: configured.bonuses,
      });
    }
  }
  return sources;
}

function isMissionParticipantSnapshot(value: unknown): value is MissionLifecycleState {
  return isRecord(value) && Array.isArray(value.participants) && Array.isArray(value.availableCarrierCraftIds) &&
    value.participants.every((participant) => isRecord(participant) &&
      typeof participant.uid === 'string' && typeof participant.roleId === 'string') &&
    value.availableCarrierCraftIds.every((id) => typeof id === 'string');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
