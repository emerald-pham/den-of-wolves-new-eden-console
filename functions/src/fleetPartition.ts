import { fleetGroupRecord, type FleetGroupRecord } from './fleetGroups';
import { isStarSystemCoordinate } from './navigation';
import { splitPursuitGroup, isValidPursuitAuthority, type NavigationState } from './navigationProjection';
export interface PartitionMember { readonly uid: string; readonly groupId: string; readonly shipId: string | null }

/** A facilitator confirms physical partitions after movement; no client chooses its audience. */
export function planFleetPartition(navigation: NavigationState, groups: readonly FleetGroupRecord[],
  members: readonly PartitionMember[], activeVesselIds: readonly string[]) {
  const vesselIds = groups.flatMap(group => group.vesselIds);
  const memberIds = groups.flatMap(group => group.memberUids);
  if (!groups.length || groups.some(group => !fleetGroupRecord(group) || !/^fleet-[1-9][0-9]*$/.test(group.id)) ||
      new Set(groups.map(group => group.id)).size !== groups.length ||
      new Set(vesselIds).size !== vesselIds.length || vesselIds.length !== activeVesselIds.length ||
      activeVesselIds.some(id => !vesselIds.includes(id)) ||
      new Set(memberIds).size !== memberIds.length || new Set(members.map(member => member.uid)).size !== members.length ||
      memberIds.length !== members.length || members.some(member => !groups.some(group =>
        group.id === member.groupId && group.memberUids.includes(member.uid)))) {
    throw new Error('Fleet partition membership authority is incomplete or mismatched.');
  }
  if (!isValidPursuitAuthority(navigation.pursuitGroups) ||
      groups.some(group => navigation.pursuitGroups[group.id] === undefined) ||
      Object.keys(navigation.pursuitGroups).some(id => !groups.some(group => group.id === id))) {
    throw new Error('Fleet pursuit authority is incomplete or mismatched.');
  }
  let nextNavigation = navigation;
  const nextGroups: FleetGroupRecord[] = [];
  const memberGroups: Record<string, string> = {};
  const occupied = new Set(groups.map(group => group.id));
  let nextId = 1;
  const allocate = () => {
    while (occupied.has(`fleet-${nextId}`)) nextId += 1;
    const id = `fleet-${nextId++}`; occupied.add(id); return id;
  };
  for (const group of groups) {
    const byCoordinate = new Map<string, string[]>();
    for (const vesselId of group.vesselIds) {
      const coordinate = navigation.shipGalacticCoordinates[vesselId];
      if (!isStarSystemCoordinate(coordinate)) throw new Error('Fleet partition ship coordinates are malformed.');
      byCoordinate.set(coordinate, [...(byCoordinate.get(coordinate) ?? []), vesselId]);
    }
    const partitions = [...byCoordinate.values()].map((ids, index) => ({
      id: index === 0 ? group.id : allocate(), vesselIds: ids, memberUids: [] as string[],
    }));
    for (const member of members.filter(member => member.groupId === group.id)) {
      const partition = member.shipId === null ? partitions[0] : partitions.find(part => part.vesselIds.includes(member.shipId!));
      if (!partition) throw new Error('Fleet partition member ship is outside its current group.');
      partition.memberUids.push(member.uid); memberGroups[member.uid] = partition.id;
    }
    for (const partition of partitions.slice(1)) {
      nextNavigation = splitPursuitGroup(nextNavigation, group.id, [group.id, partition.id]);
    }
    nextGroups.push(...partitions);
  }
  return { navigation: nextNavigation, groups: nextGroups, memberGroups };
}

/** Returning members retain their authority; a new browser cannot choose another partition. */
export function reconcilePartitionMember(groups: readonly FleetGroupRecord[], uid: string, storedGroupId: unknown) {
  const membership = groups.filter(group => group.memberUids.includes(uid));
  if (membership.length > 1 || (membership.length === 1 && storedGroupId !== membership[0].id) ||
      (membership.length === 0 && storedGroupId !== undefined && storedGroupId !== null)) {
    throw new Error('Fleet partition membership does not match the returning browser.');
  }
  if (membership.length === 1) return { group: membership[0], groups };
  const initial = groups.find(group => group.id === 'fleet-1');
  if (!initial) throw new Error('Initial fleet partition membership is unavailable.');
  const group = { ...initial, memberUids: [...initial.memberUids, uid] };
  return { group, groups: groups.map(current => current.id === group.id ? group : current) };
}
