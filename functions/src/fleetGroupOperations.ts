import { fleetGroupRecord, type FleetGroupRecord } from './fleetGroups';
import { isStarSystemCoordinate } from './navigation';
import type { NavigationState } from './navigationProjection';

export interface FleetGroupRejoinAudit {
  readonly coordinate: string;
  readonly survivingGroupId: string;
  readonly absorbedGroupIds: readonly string[];
  readonly pursuitBefore: Readonly<Record<string, number>>;
  readonly pursuitAfter: number;
}

function groupOrdinal(id: string): number {
  if (!/^fleet-[1-9][0-9]*$/.test(id)) throw new Error('Fleet group ID is malformed.');
  return Number(id.slice('fleet-'.length));
}

function unique(values: readonly string[]): readonly string[] {
  return [...new Set(values)];
}

/**
 * Merge distinct groups only after the authoritative navigation snapshot
 * places every ship in each group at the same printed system. The lowest
 * stable group ID survives; the highest prior pursuit value is retained.
 */
export function planFleetGroupRejoins(
  navigation: NavigationState,
  groups: readonly FleetGroupRecord[],
): { readonly navigation: NavigationState; readonly groups: readonly FleetGroupRecord[]; readonly rejoins: readonly FleetGroupRejoinAudit[] } {
  if (!groups.length || groups.some(group => !fleetGroupRecord(group)) ||
      new Set(groups.map(group => group.id)).size !== groups.length) {
    throw new Error('Fleet rejoin group authority is malformed.');
  }
  const ordered = [...groups].sort((a, b) => groupOrdinal(a.id) - groupOrdinal(b.id));
  const byCoordinate = new Map<string, FleetGroupRecord[]>();
  for (const group of ordered) {
    const coordinates = unique(group.vesselIds.map(shipId => navigation.shipGalacticCoordinates[shipId] ?? ''));
    if (coordinates.length !== 1 || !isStarSystemCoordinate(coordinates[0]!)) {
      throw new Error('A fleet group must have one authoritative system before it can rejoin.');
    }
    if (navigation.pursuitGroups[group.id] === undefined) {
      throw new Error(`Fleet group ${group.id} has no pursuit authority.`);
    }
    const coordinate = coordinates[0]!;
    byCoordinate.set(coordinate, [...(byCoordinate.get(coordinate) ?? []), group]);
  }

  const nextGroups: FleetGroupRecord[] = [];
  const pursuitGroups: Record<string, number> = {};
  const rejoins: FleetGroupRejoinAudit[] = [];
  for (const [coordinate, colocated] of [...byCoordinate.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    if (colocated.length === 1) {
      const group = colocated[0]!;
      nextGroups.push(group);
      pursuitGroups[group.id] = navigation.pursuitGroups[group.id]!;
      continue;
    }
    const survivor = colocated[0]!;
    const absorbedGroupIds = colocated.slice(1).map(group => group.id);
    const ids = colocated.map(group => group.id);
    const before = Object.fromEntries(ids.map(id => [id, navigation.pursuitGroups[id]!])) as Record<string, number>;
    const pursuitAfter = Math.max(...Object.values(before));
    const aliases = unique(colocated.flatMap(group => [
      ...(group.mergedGroupIds ?? []), group.id,
    ])).filter(id => id !== survivor.id).sort((a, b) => groupOrdinal(a) - groupOrdinal(b));
    nextGroups.push({
      id: survivor.id,
      vesselIds: unique(colocated.flatMap(group => group.vesselIds)),
      memberUids: unique(colocated.flatMap(group => group.memberUids)),
      ...(Object.keys(Object.assign({}, ...colocated.map(group => group.memberShipIds ?? {}))).length
        ? { memberShipIds: Object.assign({}, ...colocated.map(group => group.memberShipIds ?? {})) }
        : {}),
      ...(aliases.length ? { mergedGroupIds: aliases } : {}),
    });
    pursuitGroups[survivor.id] = pursuitAfter;
    rejoins.push({ coordinate, survivingGroupId: survivor.id, absorbedGroupIds, pursuitBefore: before, pursuitAfter });
  }
  return {
    navigation: { ...navigation, pursuitGroups },
    groups: nextGroups.sort((a, b) => groupOrdinal(a.id) - groupOrdinal(b.id)),
    rejoins,
  };
}

/** Resolve a share from current server-known chart facts to same-group ships. */
export function planKnownSystemSharing(input: Readonly<{
  groups: readonly FleetGroupRecord[];
  currentGroupId: string;
  senderShipId: string;
  knownCoordinates: readonly string[];
  requestedCoordinate: string;
  requestedRecipientShipIds: 'all' | readonly string[];
  scoutedCoordinatesByShip: Readonly<Record<string, readonly string[]>>;
}>): Readonly<{
  coordinate: string;
  senderShipId: string;
  groupId: string;
  recipientShipIds: readonly string[];
  nextScoutedCoordinatesByShip: Readonly<Record<string, readonly string[]>>;
}> {
  if (!/^fleet-[1-9][0-9]*$/.test(input.currentGroupId) || !isStarSystemCoordinate(input.requestedCoordinate) ||
      !Array.isArray(input.knownCoordinates) || !input.knownCoordinates.includes(input.requestedCoordinate)) {
    throw new Error('The requested system is not known to the sending ship.');
  }
  const matches = input.groups.filter(group => group.id === input.currentGroupId);
  if (matches.length !== 1 || !matches[0]!.vesselIds.includes(input.senderShipId)) {
    throw new Error('The sending ship is outside the current fleet group.');
  }
  const group = matches[0]!;
  const recipients = input.requestedRecipientShipIds === 'all'
    ? [...group.vesselIds]
    : [...input.requestedRecipientShipIds];
  if (!recipients.length || new Set(recipients).size !== recipients.length ||
      recipients.some(shipId => !group.vesselIds.includes(shipId))) {
    throw new Error('Sharing recipients must be unique ships in the current fleet group.');
  }
  const nextScoutedCoordinatesByShip: Record<string, readonly string[]> = Object.fromEntries(
    group.vesselIds.map(shipId => [shipId, [...(input.scoutedCoordinatesByShip[shipId] ?? [])]]),
  );
  for (const shipId of recipients) {
    const current = nextScoutedCoordinatesByShip[shipId] ?? [];
    if (!current.includes(input.requestedCoordinate)) {
      nextScoutedCoordinatesByShip[shipId] = [...current, input.requestedCoordinate];
    }
  }
  return {
    coordinate: input.requestedCoordinate,
    senderShipId: input.senderShipId,
    groupId: group.id,
    recipientShipIds: recipients,
    nextScoutedCoordinatesByShip,
  };
}

export type FleetTaxiPayload =
  | Readonly<{ kind: 'players'; playerUids: readonly string[] }>
  | Readonly<{ kind: 'fuel'; units: 1 | 2 }>;

/** Apply one already-authorized round-trip payload without mutating caller state. */
export function planFleetTaxiTransfer(input: Readonly<{
  actorUid: string;
  groups: readonly FleetGroupRecord[];
  sourceGroupId: string;
  targetGroupId: string;
  anchorShipId: string;
  targetShipId: string;
  payload: FleetTaxiPayload;
  passengers: readonly Readonly<{ uid: string; groupId: string; hostShipId: string; connected: boolean }>[];
  sourceFuel?: number;
  targetFuel?: number;
}>): Readonly<{
  kind: 'players'; sourceGroupId: string; targetGroupId: string; targetShipId: string;
  playerUids: readonly string[]; groups: readonly FleetGroupRecord[];
}> | Readonly<{
  kind: 'fuel'; sourceGroupId: string; targetGroupId: string; targetShipId: string;
  units: 1 | 2; sourceFuel: number; targetFuel: number; groups: readonly FleetGroupRecord[];
}> {
  if (input.sourceGroupId === input.targetGroupId || !/^fleet-[1-9][0-9]*$/.test(input.sourceGroupId) ||
      !/^fleet-[1-9][0-9]*$/.test(input.targetGroupId)) {
    throw new Error('Scout taxi payloads must travel between two distinct current groups.');
  }
  const groups = input.groups;
  if (groups.some(group => !fleetGroupRecord(group)) || new Set(groups.map(group => group.id)).size !== groups.length ||
      new Set(groups.flatMap(group => group.vesselIds)).size !== groups.reduce((count, group) => count + group.vesselIds.length, 0)) {
    throw new Error('Scout taxi group authority is malformed.');
  }
  const source = groups.find(group => group.id === input.sourceGroupId);
  const target = groups.find(group => group.id === input.targetGroupId);
  if (!source || !target || !source.vesselIds.includes(input.anchorShipId) || !target.vesselIds.includes(input.targetShipId)) {
    throw new Error('Scout taxi anchor or destination does not belong to the selected group.');
  }
  if (input.payload.kind === 'fuel') {
    if (!Number.isSafeInteger(input.payload.units) || input.payload.units < 1 || input.payload.units > 2 ||
        !Number.isSafeInteger(input.sourceFuel) || (input.sourceFuel ?? -1) < input.payload.units ||
        !Number.isSafeInteger(input.targetFuel) || (input.targetFuel ?? -1) < 0 || input.passengers.length !== 0) {
      throw new Error('Scout taxi fuel requires one or two units and enough source inventory.');
    }
    return { kind: 'fuel', sourceGroupId: source.id, targetGroupId: target.id, targetShipId: input.targetShipId,
      units: input.payload.units, sourceFuel: input.sourceFuel! - input.payload.units,
      targetFuel: input.targetFuel! + input.payload.units, groups };
  }
  const playerUids = input.payload.playerUids;
  if (!Array.isArray(playerUids) || playerUids.length < 1 || playerUids.length > 2) {
    throw new Error('One scout taxi round trip can carry at most two players.');
  }
  if (new Set(playerUids).size !== playerUids.length || playerUids.some(uid => typeof uid !== 'string' || !uid || uid.includes('/'))) {
    throw new Error('Scout taxi passengers must be unique current players.');
  }
  if (playerUids.includes(input.actorUid)) throw new Error('The shuttle pilot must remain at the launch ship for the round trip.');
  const passengerByUid = new Map(input.passengers.map(passenger => [passenger.uid, passenger]));
  if (passengerByUid.size !== input.passengers.length || playerUids.some(uid => {
    const passenger = passengerByUid.get(uid);
    return !passenger || passenger.groupId !== source.id || passenger.hostShipId !== input.anchorShipId ||
      passenger.connected !== true || !source.memberUids.includes(uid);
  })) throw new Error('Only connected members physically at the current taxi anchor can travel.');
  const transported = new Set(playerUids);
  const nextGroups = groups.map(group => {
    if (group.id === source.id) {
      const memberShipIds = Object.fromEntries(Object.entries(group.memberShipIds ?? {}).filter(([uid]) => !transported.has(uid)));
      const sourceFields = { ...group };
      delete sourceFields.memberShipIds;
      return { ...sourceFields, memberUids: group.memberUids.filter(uid => !transported.has(uid)),
        ...(Object.keys(memberShipIds).length ? { memberShipIds } : {}) };
    }
    if (group.id === target.id) return { ...group,
      memberUids: [...group.memberUids, ...playerUids],
      memberShipIds: { ...(group.memberShipIds ?? {}), ...Object.fromEntries(playerUids.map(uid => [uid, input.targetShipId])) },
    };
    return group;
  });
  return { kind: 'players', sourceGroupId: source.id, targetGroupId: target.id,
    targetShipId: input.targetShipId, playerUids: [...playerUids], groups: nextGroups };
}
