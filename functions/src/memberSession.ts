import { fleetGroupRecord } from './fleetGroups';

export interface MemberSessionScope {
  readonly groupId: string;
  readonly vesselIds: readonly string[];
  readonly craftIds?: readonly string[];
  readonly actorUid?: string;
}

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown> : {};
}

/** Membership is read with the source document, never accepted from the caller. */
export function memberSessionScope(playerValue: unknown, groupValues: readonly unknown[]): MemberSessionScope {
  const player = record(playerValue);
  const groups = groupValues.map(fleetGroupRecord);
  const entitled = groups.filter(group => group?.memberUids.includes(String(player.uid)));
  if (player.connected !== true || player.role !== 'player' || typeof player.uid !== 'string' ||
      typeof player.fleetGroupId !== 'string' || groups.some(group => !group) ||
      entitled.length !== 1 || entitled[0]?.id !== player.fleetGroupId) {
    throw new Error('Current fleet membership is unavailable.');
  }
  return {
    groupId: player.fleetGroupId,
    vesselIds: player.activeConsoleRoleId === 'press-officer' || player.assignedRoleId === 'press-officer'
      ? [] : [...entitled[0].vesselIds],
  };
}

const PUBLIC_FIELDS = [
  'id', 'name', 'joinCode', 'phase', 'currentTurn', 'playerCount', 'chartId', 'expansion', 'turnLimit',
  'setupConfirmed', 'chartSelectionLocked', 'configurationLocked', 'setupRevision', 'setup',
  'activeVesselIds', 'activeRoleIds', 'capybaraEnabled', 'dioneEnabled', 'universalArbourEnabled',
  'wolfCultEnabled', 'pressEnabled', 'pressClaimed', 'pressAvailabilityRevision', 'gmControlsLocked',
  'turnPhase', 'turnState', 'turnStartAnnouncement', 'pursuitEmergencyWindow', 'gameOutcome',
  'survivorOutcome', 'fleetRedAlert', 'fleetTicker', 'pressDispatch', 'debriefMode', 'singlePlayerDemo',
  'createdAt', 'updatedAt', 'ownerUid', 'dradisContactTriggeredAt',
] as const;
export const MEMBER_VESSEL_MAP_FIELDS = [
  'shipResources', 'shipDamage', 'shipUpgrades', 'shipUnrest', 'shipMutinies', 'shipSurvivors',
  'shipConsoleLocks', 'vesselActionRevisions', 'shipJumpStates', 'shipJumpTransitions',
  'populationAlerts', 'unrestAlerts', 'maintenanceCycles', 'smallShipStates',
] as const;
const CRAFT_MAP_FIELDS = ['shuttleControl', 'shuttleCargo', 'shuttleFuelled', 'shuttleEvacuations',
  'serviceShuttleRecharges', 'retainedShuttles'] as const;
const CRAFT_DETAIL_FIELDS: Readonly<Record<string, string>> = {
  highwallMining: 'highwall', blacksmithRepairs: 'blacksmith', macawRepairs: 'macaw',
  boaRecycling: 'boa', chacauRepairs: 'chacau', allyRepairs: 'ally', maliadesState: 'maliades',
};
const VESSEL_DETAIL_FIELDS: Readonly<Record<string, string>> = {
  fighterWingCounts: 'aegis', pdfEscortWing: 'aegis', admiralDirectives: 'aegis',
  presidentWorkspace: 'dione', politicalCapital: 'dione', baseCapybaraCargo: 'capybara-small',
  gorgoneionRepairDrones: 'gorgoneion', warriorRepairDrones: 'warrior',
  voyage33Admission: 'voyage-33', voyage33Maintenance: 'voyage-33',
};
function selectedMap(value: unknown, ids: ReadonlySet<string>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(record(value)).filter(([id]) => ids.has(id)));
}

/** Explicit allowlist: a future server field never becomes a member wire field by accident. */
export function memberSessionProjection(value: unknown, scope: MemberSessionScope): Record<string, unknown> {
  const root = record(value);
  const ships = new Set(scope.vesselIds);
  const dockings = (Array.isArray(root.shuttleDockings) ? root.shuttleDockings : [])
    .filter(entry => ships.has(String(record(entry).shipId)) && typeof record(entry).shuttleId === 'string');
  const craft = new Set([...dockings.map(entry => String(record(entry).shuttleId)), ...(scope.craftIds ?? [])]);
  for (const [id, retained] of Object.entries(record(root.retainedShuttles))) {
    if (scope.actorUid && record(retained).holderUid === scope.actorUid) craft.add(id);
  }
  const result: Record<string, unknown> = Object.fromEntries(PUBLIC_FIELDS
    .filter(key => root[key] !== undefined).map(key => [key, root[key]]));
  result.pressClaimed = root.pressClaimed === true || typeof root.pressHolderUid === 'string';
  for (const key of MEMBER_VESSEL_MAP_FIELDS) result[key] = selectedMap(root[key], ships);
  for (const key of CRAFT_MAP_FIELDS) result[key] = selectedMap(root[key], craft);
  for (const [key, id] of Object.entries(CRAFT_DETAIL_FIELDS)) {
    if (craft.has(id) && root[key] !== undefined) result[key] = root[key];
  }
  for (const [key, id] of Object.entries(VESSEL_DETAIL_FIELDS)) {
    if (ships.has(id) && root[key] !== undefined) result[key] = root[key];
  }
  result.admittedVesselIds = (Array.isArray(root.admittedVesselIds) ? root.admittedVesselIds : [])
    .filter(id => ships.has(String(id)));
  const quarantine = record(root.quarantineDocking);
  const affected = (Array.isArray(quarantine.affectedShipIds) ? quarantine.affectedShipIds : [])
    .filter(id => ships.has(String(id)));
  if (affected.length) result.quarantineDocking = { ...quarantine, affectedShipIds: affected,
    acceptedByShip: selectedMap(quarantine.acceptedByShip, ships) };
  result.shuttleDockings = dockings;
  result.shuttleVisitLog = (Array.isArray(root.shuttleVisitLog) ? root.shuttleVisitLog : [])
    .filter(entry => craft.has(String(record(entry).shuttleId)) && ships.has(String(record(entry).shipId)));
  result.confettiUsedShipIds = (Array.isArray(root.confettiUsedShipIds) ? root.confettiUsedShipIds : [])
    .filter(id => ships.has(String(id)) || craft.has(String(id)));
  result.memberSessionScope = { groupId: scope.groupId, vesselIds: [...ships], craftIds: [...craft] };
  return result;
}
