import type { AwayMissionParticipantCrafts } from './awayMissionLifecycleAdapter';

export interface MissionCraftCommitment {
  readonly missionId: string;
  readonly sourceCycle: number;
}
export type MissionCraftCommitments = Readonly<Record<string, MissionCraftCommitment>>;
interface MissionTransition {
  readonly missionId: string;
  readonly sourceCycle: number;
  readonly status: 'active' | 'resolved' | 'complete';
  readonly participantCrafts: readonly AwayMissionParticipantCrafts[];
}

export function parseMissionCraftCommitments(value: unknown): MissionCraftCommitments | null {
  if (value === undefined) return {};
  if (!record(value)) return null;
  const entries: [string, MissionCraftCommitment][] = [];
  for (const [craftId, binding] of Object.entries(value)) {
    if (!/^[a-z][a-z0-9-]{0,80}$/.test(craftId) || !record(binding) ||
        Object.keys(binding).some(key => !['missionId', 'sourceCycle'].includes(key)) ||
        typeof binding.missionId !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(binding.missionId) ||
        !Number.isSafeInteger(binding.sourceCycle) || (binding.sourceCycle as number) < 1) return null;
    entries.push([craftId, { missionId: binding.missionId, sourceCycle: binding.sourceCycle as number }]);
  }
  return Object.fromEntries(entries);
}

/** Serializes admissions with movement through the shared session document. */
export function nextMissionCraftCommitments(value: unknown, mission: MissionTransition): MissionCraftCommitments | null {
  const parsed = parseMissionCraftCommitments(value);
  if (!parsed || !/^[A-Za-z0-9_-]{1,128}$/.test(mission.missionId) ||
      !Number.isSafeInteger(mission.sourceCycle) || mission.sourceCycle < 1) return null;
  const result = { ...parsed };
  const craftIds = new Set(mission.participantCrafts.flatMap(({ craftIds }) => craftIds));
  for (const craftId of craftIds) {
    if (!/^[a-z][a-z0-9-]{0,80}$/.test(craftId)) return null;
    const previous = result[craftId];
    if (mission.status === 'active') {
      if (previous && (previous.missionId !== mission.missionId || previous.sourceCycle !== mission.sourceCycle)) return null;
      result[craftId] = { missionId: mission.missionId, sourceCycle: mission.sourceCycle };
    } else if (previous?.missionId === mission.missionId) {
      delete result[craftId];
    }
  }
  return result;
}

export function requireMissionCraftMovementAvailable(value: unknown, craftIds: readonly string[]): void {
  const commitments = parseMissionCraftCommitments(value);
  if (!commitments) throw new Error('Mission craft commitment authority is malformed.');
  if (craftIds.some(craftId => commitments[craftId] !== undefined)) {
    throw new Error('This movement would move a craft committed to an active away mission. Finish the mission first.');
  }
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
