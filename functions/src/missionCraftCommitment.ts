import { craftStartingManifestForSetup } from './craftOwnership';
import { parseSmallShipState, SMALL_SHIP_IDS } from './smallShip';
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

/** Every physically carried mission craft must serialize with its host's jump. */
export function missionCraftIdsCarriedByShip(input: {
  shipId: string; activeRoleIds: unknown; shuttleDockings: unknown; smallShipStates: unknown;
}): readonly string[] {
  const malformed = () => { throw new Error('Carried mission craft authority is malformed.'); };
  const roles = input.activeRoleIds === undefined ? [] : input.activeRoleIds;
  const dockings = input.shuttleDockings === undefined ? [] : input.shuttleDockings;
  const states = input.smallShipStates === undefined ? {} : input.smallShipStates;
  if (!Array.isArray(roles) || roles.some(role => typeof role !== 'string') ||
      !Array.isArray(dockings) || !record(states)) return malformed();
  const typedDockings: { shuttleId: string; shipId: string }[] = [];
  const seen = new Set<string>();
  for (const docking of dockings) {
    if (!record(docking) || typeof docking.shuttleId !== 'string' || typeof docking.shipId !== 'string' ||
        seen.has(docking.shuttleId)) return malformed();
    seen.add(docking.shuttleId);
    typedDockings.push({ shuttleId: docking.shuttleId, shipId: docking.shipId });
  }
  const craftIds = new Set([input.shipId, ...typedDockings
    .filter(docking => docking.shipId === input.shipId).map(docking => docking.shuttleId)]);
  for (const craft of craftStartingManifestForSetup(roles as string[], 'core', typedDockings).entries) {
    if (craft.kind === 'fighter-wing' && craft.startingHostId === input.shipId) craftIds.add(craft.id);
  }
  for (const id of SMALL_SHIP_IDS) {
    if (!Object.hasOwn(states, id)) continue;
    const state = parseSmallShipState(states[id], id);
    if (!state) return malformed();
    if (state.hostShipId === input.shipId) craftIds.add(id);
  }
  return [...craftIds];
}
