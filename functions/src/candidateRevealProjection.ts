import { fleetGroupRecord } from './fleetGroups';
import { organiserSitesForChart, type ChartId } from './starChartLookup';
import { systemHistory as parseSystemHistory } from './systemHistory';

export type NewEdenCandidateCode = 'N' | 'O' | 'P';

/** The only candidate fields disclosed to a current fleet-group member. */
export interface CandidateReveal {
  readonly code: NewEdenCandidateCode;
  readonly title: string;
}

/** The audience identity and path that a transactional writer must use. */
export interface PlayerCandidateRevealProjection {
  readonly sessionId: string;
  readonly recipientUid: string;
  readonly recipientPath: string;
  readonly candidateReveals: readonly CandidateReveal[];
}

interface SnapshotLike {
  readonly id: unknown;
  readonly ref: unknown;
  readonly exists: unknown;
  data(): unknown;
}

interface CandidateRevealProjectionAuthority {
  readonly sessionId: unknown;
  readonly sessionSnapshot: unknown;
  readonly navigationSnapshot: unknown;
  readonly playerSnapshots: unknown;
  readonly fleetGroupSnapshots: unknown;
  readonly recipientUid: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function snapshotIdentity(value: unknown, expectedPath: string):
  { readonly id: string; readonly data: Record<string, unknown> } | undefined {
  if (!isRecord(value)) return undefined;
  const snapshot = value as unknown as SnapshotLike;
  if (snapshot.exists !== true || typeof snapshot.id !== 'string' ||
      !isRecord(snapshot.ref) || snapshot.ref.path !== expectedPath ||
      typeof snapshot.data !== 'function') return undefined;
  try {
    const data = snapshot.data();
    return isRecord(data) ? { id: snapshot.id, data } : undefined;
  } catch {
    return undefined;
  }
}

function snapshotData(
  value: unknown,
  expectedPath: string,
  expectedId: string,
): Record<string, unknown> | undefined {
  const snapshot = snapshotIdentity(value, expectedPath);
  return snapshot?.id === expectedId ? snapshot.data : undefined;
}

function activeVessels(value: unknown): readonly string[] | undefined {
  if (!Array.isArray(value) || value.length === 0 ||
      value.some((entry) => typeof entry !== 'string' || entry.length === 0) ||
      new Set(value).size !== value.length) return undefined;
  return [...value] as string[];
}

function chartId(value: unknown): ChartId | undefined {
  return value === 'A' || value === 'B' || value === 'C' ? value : undefined;
}

function kicked(data: Record<string, unknown>): boolean {
  return data.kickedAt !== undefined && data.kickedAt !== null;
}

/**
 * Build the allowlisted candidate view for one current fleet-group member.
 * Session, navigation, player, and group inputs are Firestore snapshots read
 * by the same server transaction. Document paths are validated here, and all
 * phase/chart/history values are derived from those snapshots rather than
 * supplied separately by the caller.
 *
 * `undefined` means authority was stale or malformed; a projection with an
 * empty candidate list means authority was valid and the current group has no
 * arrival-derived candidate discovery.
 */
export function candidateRevealProjectionForCurrentFleetMember(
  value: unknown,
): PlayerCandidateRevealProjection | undefined {
  if (!isRecord(value)) return undefined;
  const authority = value as unknown as CandidateRevealProjectionAuthority;
  if (typeof authority.sessionId !== 'string' || authority.sessionId.length === 0 ||
      typeof authority.recipientUid !== 'string' || authority.recipientUid.length === 0) {
    return undefined;
  }
  const sessionPath = `sessions/${authority.sessionId}`;
  const session = snapshotIdentity(authority.sessionSnapshot, sessionPath);
  if (!session || session.id !== authority.sessionId || session.data.phase !== 'active' ||
      (session.data.chartSelectionLocked !== true && session.data.configurationLocked !== true)) {
    return undefined;
  }
  const selectedChart = chartId(session.data.chartId);
  const activeVesselIds = activeVessels(session.data.activeVesselIds);
  const navigation = snapshotData(
    authority.navigationSnapshot,
    `${sessionPath}/serverState/navigation`,
    'navigation',
  );
  if (!selectedChart || !activeVesselIds || !navigation ||
      !Array.isArray(authority.fleetGroupSnapshots) || authority.fleetGroupSnapshots.length === 0 ||
      !Array.isArray(authority.playerSnapshots) || authority.playerSnapshots.length === 0) return undefined;

  const activePlayers = new Map<string, { readonly groupId: string; readonly data: Record<string, unknown> }>();
  const recipientPath = `${sessionPath}/players/${authority.recipientUid}`;
  let recipientExists = false;
  for (const candidate of authority.playerSnapshots) {
    if (!isRecord(candidate)) return undefined;
    const snapshot = candidate as unknown as SnapshotLike;
    if (snapshot.exists !== true || typeof snapshot.id !== 'string' || snapshot.id.length === 0 ||
        !isRecord(snapshot.ref) || snapshot.ref.path !== `${sessionPath}/players/${snapshot.id}` ||
        typeof snapshot.data !== 'function') return undefined;
    let data: unknown;
    try {
      data = snapshot.data();
    } catch {
      return undefined;
    }
    if (!isRecord(data)) return undefined;
    if (snapshot.id === authority.recipientUid) {
      if (snapshot.ref.path !== recipientPath || kicked(data)) return undefined;
      recipientExists = true;
    }
    if (kicked(data)) continue;
    if (typeof data.fleetGroupId !== 'string' || data.fleetGroupId.length === 0 ||
        activePlayers.has(snapshot.id)) return undefined;
    activePlayers.set(snapshot.id, { groupId: data.fleetGroupId, data });
  }
  if (!recipientExists || !activePlayers.has(authority.recipientUid)) return undefined;

  const groupSnapshots = authority.fleetGroupSnapshots.map((candidate) => {
    if (!isRecord(candidate)) return undefined;
    const candidateSnapshot = candidate as unknown as SnapshotLike;
    if (typeof candidateSnapshot.id !== 'string' || candidateSnapshot.id.length === 0) return undefined;
    const snapshot = snapshotIdentity(
      candidate,
      `${sessionPath}/fleetGroups/${candidateSnapshot.id}`,
    );
    if (!snapshot || snapshot.id.length === 0) return undefined;
    const group = fleetGroupRecord(snapshot.data);
    if (!group || group.id !== snapshot.id) return undefined;
    return group;
  });
  if (groupSnapshots.some((group) => !group)) return undefined;
  const groups = groupSnapshots as NonNullable<(typeof groupSnapshots)[number]>[];
  const groupIds = new Set<string>();
  const groupForVessel = new Map<string, string>();
  const groupForMember = new Map<string, string>();
  const activeVesselSet = new Set(activeVesselIds);
  for (const group of groups) {
    if (groupIds.has(group.id)) return undefined;
    groupIds.add(group.id);
    for (const vesselId of group.vesselIds) {
      if (!activeVesselSet.has(vesselId) || groupForVessel.has(vesselId)) return undefined;
      groupForVessel.set(vesselId, group.id);
    }
    for (const uid of group.memberUids) {
      if (!activePlayers.has(uid) || groupForMember.has(uid)) return undefined;
      groupForMember.set(uid, group.id);
    }
  }
  if (groupForVessel.size !== activeVesselIds.length ||
      activeVesselIds.some((vesselId) => !groupForVessel.has(vesselId)) ||
      groupForMember.size !== activePlayers.size ||
      [...activePlayers].some(([uid, player]) => groupForMember.get(uid) !== player.groupId)) {
    return undefined;
  }

  const recipientGroupId = activePlayers.get(authority.recipientUid)?.groupId;
  const group = groups.find((candidate) => candidate.id === recipientGroupId);
  if (!group) return undefined;
  const history = parseSystemHistory(navigation.systemHistory, activeVesselIds, {});
  const sites = organiserSitesForChart(selectedChart);
  const reveals = new Map<NewEdenCandidateCode, CandidateReveal>();
  for (const vesselId of group.vesselIds) {
    const entries = history?.[vesselId];
    if (!entries) continue;
    for (const [coordinate, entry] of Object.entries(entries)) {
      const discovery = entry.candidateDiscovery;
      if (!discovery || discovery.source !== 'arrival' ||
          (discovery.code !== 'N' && discovery.code !== 'O' && discovery.code !== 'P')) continue;
      const site = sites[coordinate];
      if (!site?.candidate || site.code !== discovery.code || site.name !== discovery.title) continue;
      reveals.set(discovery.code, { code: discovery.code, title: site.name });
    }
  }

  return Object.freeze({
    sessionId: authority.sessionId,
    recipientUid: authority.recipientUid,
    recipientPath: `${sessionPath}/playerDiscoveries/${authority.recipientUid}`,
    candidateReveals: Object.freeze([...reveals.values()]
      .sort((left, right) => left.code.localeCompare(right.code))
      .map((reveal) => Object.freeze(reveal))),
  });
}
