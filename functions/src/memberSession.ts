import { fleetGroupRecord } from './fleetGroups';
import { publicSmallShipStatesForSession } from './extraShipAdmission';
import { parseVoyage33MaintenanceState } from './voyage33Maintenance';
import { parseVoyage33Admission, VOYAGE_33_ID } from './voyageAdmission';
import { parseGorgoneionRepairDronesState } from './gorgoneionRepairDrones';
import { parseWarriorRepairDronesState } from './warriorRepairDrones';
import { parseShuttleControl } from './shuttleControl';
import { admiralDirectiveState } from './admiralDirectives';
import { presidentWorkspaceState } from './presidentWorkspace';
import { politicalCapitalState } from './politicalCapital';
import { parseBaseCapybaraCargoState } from './baseCapybaraCargoTransfer';
import { parseBoaRecyclingLedger } from './boaRecycling';
import { parseMaliadesState } from './maliadesState';
import { maliadesOperationalView } from './maliadesOperationalView';

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
  'fleetPartitionRevision',
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
  highwallMining: 'highwall', boaRecycling: 'boa', maliadesState: 'maliades',
};
const REPAIR_DETAIL_FIELDS: Readonly<Record<string, string>> = {
  philiaRepairs: 'philia', blacksmithRepairs: 'blacksmith', macawRepairs: 'macaw',
  chacauRepairs: 'chacau', allyRepairs: 'ally',
};
const VESSEL_DETAIL_FIELDS: Readonly<Record<string, string>> = {
  fighterWingCounts: 'aegis', pdfEscortWing: 'aegis', admiralDirectives: 'aegis',
  presidentWorkspace: 'dione', politicalCapital: 'dione', baseCapybaraCargo: 'capybara-small',
  gorgoneionRepairDrones: 'gorgoneion', warriorRepairDrones: 'warrior',
  voyage33Admission: VOYAGE_33_ID, voyage33Maintenance: VOYAGE_33_ID,
  resolvedCrisisOutcome: 'dione',
};
function selectedMap(value: unknown, ids: ReadonlySet<string>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(record(value)).filter(([id]) => ids.has(id)));
}

/** The member receipt keeps the usage count while omitting other-group host details. */
export function memberPhiliaRepairLedger(value: unknown): {
  cycle: number; revision: number; hosts: { shipId: string; systemIds: string[] }[]; totalHostsUsed?: number;
} | undefined {
  const raw = record(value);
  if (Object.keys(raw).some(key => !['cycle', 'revision', 'hosts', 'totalHostsUsed'].includes(key)) ||
      !Number.isSafeInteger(raw.cycle) || Number(raw.cycle) < 1 ||
      !Number.isSafeInteger(raw.revision) || Number(raw.revision) < 1 || !Array.isArray(raw.hosts)) return undefined;
  const total = raw.totalHostsUsed ?? raw.hosts.length;
  if (!Number.isSafeInteger(total) || Number(total) < 1 || Number(total) > 2 || raw.hosts.length > Number(total)) return undefined;
  const seen = new Set<string>();
  const hosts: { shipId: string; systemIds: string[] }[] = [];
  for (const entry of raw.hosts) {
    const host = record(entry);
    if (Object.keys(host).some(key => !['shipId', 'systemIds'].includes(key)) ||
        typeof host.shipId !== 'string' || !/^[\w-]{1,80}$/.test(host.shipId) || seen.has(host.shipId) ||
        !Array.isArray(host.systemIds) || host.systemIds.length < 1 || host.systemIds.length > 2 ||
        host.systemIds.some(id => typeof id !== 'string' || !id.trim()) || new Set(host.systemIds).size !== host.systemIds.length) return undefined;
    seen.add(host.shipId);hosts.push({ shipId: host.shipId, systemIds: host.systemIds as string[] });
  }
  return { cycle: Number(raw.cycle), revision: Number(raw.revision), hosts,
    ...(raw.totalHostsUsed !== undefined ? { totalHostsUsed: Number(total) } : {}) };
}

/** A current-use marker carries counters only, never a previous foreign host. */
export function memberRedactedCraftUse(value: unknown): { cycle: number; revision: number; redacted: true } | undefined {
  const raw = record(value);
  if (raw.redacted !== true || Object.keys(raw).some(key => ![
    'cycle','revision','redacted','hostShipId','consoleId','systemId','systemIds',
  ].includes(key)) || !Number.isSafeInteger(raw.cycle) || Number(raw.cycle) < 1 ||
      !Number.isSafeInteger(raw.revision) || Number(raw.revision) < 1 ||
      ['hostShipId','consoleId','systemId'].some(key => raw[key] !== undefined && raw[key] !== '') ||
      raw.systemIds !== undefined && (!Array.isArray(raw.systemIds) || raw.systemIds.length !== 0)) return undefined;
  return { cycle: Number(raw.cycle), revision: Number(raw.revision), redacted: true };
}

/** Audience filter for already parsed public operational values; never pass a stored root directly. */
export function memberSessionProjection(value: unknown, scope: MemberSessionScope): Record<string, unknown> {
  const root = record(value);
  const ships = new Set(scope.vesselIds);
  const coreHosts = new Set(scope.vesselIds.filter(id => Array.isArray(root.activeVesselIds) && root.activeVesselIds.includes(id)));
  const smallShips = publicSmallShipStatesForSession({ activeVesselIds: root.activeVesselIds,
    smallShipStates: root.smallShipStates, expansion: root.expansion, capybaraEnabled: root.capybaraEnabled });
  for (const [id, state] of Object.entries(smallShips)) {
    if (scope.groupId === 'gm' || state.hostShipId && coreHosts.has(state.hostShipId)) ships.add(id);
  }
  const voyage = parseVoyage33MaintenanceState(root.voyage33Maintenance);
  const voyageAdmission = parseVoyage33Admission(root.voyage33Admission, String(root.id));
  if (voyage && voyageAdmission && Array.isArray(root.admittedVesselIds) && root.admittedVesselIds.includes(VOYAGE_33_ID) &&
      (scope.groupId === 'gm' || voyage.hostShipId && voyage.dockingRevision > 0 && coreHosts.has(voyage.hostShipId))) ships.add(VOYAGE_33_ID);
  const snnId = 'snn-press-shuttle';
  const snn = record(root.shuttleControl)[snnId];
  // Press has no vessel-map audience. Its current holder still needs its own
  // shuttle, including a docking outside the fleet group's vessel scope.
  const pressCraft = new Set(scope.groupId !== 'gm' && scope.vesselIds.length === 0 &&
    scope.actorUid && root.pressHolderUid === scope.actorUid && root.pressEnabled !== false &&
    parseShuttleControl({ [snnId]: snn })?.[snnId]?.ownerRoleId === 'press-officer' &&
    record(snn).holderUid === scope.actorUid ? [snnId] : []);
  const dockings = (Array.isArray(root.shuttleDockings) ? root.shuttleDockings : [])
    .filter(entry => (ships.has(String(record(entry).shipId)) || pressCraft.has(String(record(entry).shuttleId))) &&
      typeof record(entry).shuttleId === 'string');
  const craft = new Set([...dockings.map(entry => String(record(entry).shuttleId)), ...(scope.craftIds ?? []), ...pressCraft]);
  for (const [id, retained] of Object.entries(record(root.retainedShuttles))) {
    if (scope.actorUid && record(retained).holderUid === scope.actorUid) craft.add(id);
  }
  const result: Record<string, unknown> = Object.fromEntries(PUBLIC_FIELDS
    .filter(key => root[key] !== undefined).map(key => [key, root[key]]));
  result.pressClaimed = root.pressClaimed === true || typeof root.pressHolderUid === 'string';
  for (const key of MEMBER_VESSEL_MAP_FIELDS) result[key] = selectedMap(root[key], ships);
  result.smallShipStates = selectedMap(smallShips, ships);
  if (scope.groupId !== 'gm') { result.populationAlerts = {};result.unrestAlerts = {}; }
  for (const key of CRAFT_MAP_FIELDS) result[key] = selectedMap(root[key], craft);
  for (const [key, id] of Object.entries(CRAFT_DETAIL_FIELDS)) {
    if (!craft.has(id) || root[key] === undefined) continue;
    if (key === 'maliadesState' && scope.groupId !== 'gm') {
      const operational = maliadesOperationalView(root[key]);
      if (operational) result[key] = operational;
    } else result[key] = root[key];
  }
  for (const [key, id] of Object.entries(REPAIR_DETAIL_FIELDS)) {
    const ledger = memberPhiliaRepairLedger(root[key]);
    if (craft.has(id) && ledger) result[key] = { ...ledger,
      totalHostsUsed: ledger.totalHostsUsed ?? ledger.hosts.length,
      hosts: scope.groupId === 'gm' ? ledger.hosts : ledger.hosts.filter(host => ships.has(host.shipId)) };
  }
  for (const [key, id] of Object.entries(VESSEL_DETAIL_FIELDS)) {
    if (ships.has(id) && root[key] !== undefined) result[key] = root[key];
  }
  if (scope.groupId !== 'gm') {
    for (const [key, id, parse] of [
      ['gorgoneionRepairDrones','gorgoneion',parseGorgoneionRepairDronesState],
      ['warriorRepairDrones','warrior',parseWarriorRepairDronesState],
    ] as const) {
      delete result[key];
      if (!ships.has(id) || root[key] === undefined) continue;
      const redacted = memberRedactedCraftUse(root[key]);
      const used = redacted ?? parse(root[key]);
      if (used && used.cycle > 0) result[key] = redacted ?? ('hostShipId' in used && ships.has(used.hostShipId)
        ? used : { cycle: used.cycle, revision: used.revision, redacted: true });
    }
    result.serviceShuttleRecharges = Object.fromEntries(Object.entries(record(result.serviceShuttleRecharges)).flatMap(([id, value]) => {
      const entry = record(value), redacted = memberRedactedCraftUse(value);
      if (redacted) return [[id, redacted]];
      if (!Number.isSafeInteger(entry.cycle) || Number(entry.cycle) < 1 ||
          !Number.isSafeInteger(entry.revision) || Number(entry.revision) < 1 ||
          typeof entry.hostShipId !== 'string' || typeof entry.consoleId !== 'string' || !entry.consoleId) return [];
      return [[id, ships.has(entry.hostShipId)
        ? { cycle: entry.cycle, revision: entry.revision, hostShipId: entry.hostShipId, consoleId: entry.consoleId }
        : { cycle: entry.cycle, revision: entry.revision, redacted: true }]];
    }));
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
    .filter(entry => craft.has(String(record(entry).shuttleId)) &&
      (ships.has(String(record(entry).shipId)) || pressCraft.has(String(record(entry).shuttleId))));
  result.confettiUsedShipIds = (Array.isArray(root.confettiUsedShipIds) ? root.confettiUsedShipIds : [])
    .filter(id => ships.has(String(id)) || craft.has(String(id)));
  result.memberSessionScope = { groupId: scope.groupId, vesselIds: [...ships], craftIds: [...craft] };
  return result;
}


function safelyParsed<T>(value: unknown, parse: (value: unknown) => T): T | undefined {
  if (value === undefined) return undefined;
  try { return parse(value); } catch { return undefined; }
}

/** Additional PC07 feed fields use the same domain parsers as their write authorities. */
export function parsedMemberSessionDetails(value: unknown, activeVesselIds: readonly string[]): Record<string, unknown> {
  const root = record(value);
  const result: Record<string, unknown> = {
    universalArbourEnabled: root.universalArbourEnabled === true,
    wolfCultEnabled: root.wolfCultEnabled === true,
    shuttleControl: parseShuttleControl(root.shuttleControl) ?? {},
    vesselActionRevisions: Object.fromEntries(Object.entries(record(root.vesselActionRevisions))
      .filter(([id, revision]) => /^[\w-]{1,80}$/.test(id) && Number.isSafeInteger(revision) && Number(revision) >= 0)),
  };
  if (Number.isSafeInteger(root.fleetPartitionRevision) && Number(root.fleetPartitionRevision) >= 0) {
    result.fleetPartitionRevision = root.fleetPartitionRevision;
  }
  for (const [key, parse] of [
    ['admiralDirectives', admiralDirectiveState],
    ['presidentWorkspace', presidentWorkspaceState],
    ['politicalCapital', politicalCapitalState],
    ['baseCapybaraCargo', parseBaseCapybaraCargoState],
    ['boaRecycling', parseBoaRecyclingLedger],
    ['maliadesState', parseMaliadesState],
    ['gorgoneionRepairDrones', parseGorgoneionRepairDronesState],
    ['warriorRepairDrones', parseWarriorRepairDronesState],
  ] as const) {
    const parsed = safelyParsed(root[key], parse as (value: unknown) => unknown);
    if (parsed !== undefined && parsed !== null) result[key] = parsed;
  }
  for (const key of Object.keys(REPAIR_DETAIL_FIELDS)) {
    const parsed = memberPhiliaRepairLedger(root[key]);
    if (parsed) result[key] = parsed;
  }
  const alert = record(root.fleetRedAlert);
  result.fleetRedAlert = {
    active: alert.active === true,
    revision: Number.isSafeInteger(alert.revision) && Number(alert.revision) >= 0 ? alert.revision : 0,
    ...(typeof alert.text === 'string' ? { text: alert.text } : {}),
    ...(typeof alert.raisedAt === 'string' && Number.isFinite(Date.parse(alert.raisedAt)) ? { raisedAt: alert.raisedAt } : {}),
  };
  const wing = record(root.pdfEscortWing);
  const wingFields = ['type', 'revision', 'cycle', 'capacity', 'fighters', 'launched', 'mediumResolved',
    'mediumActionCount', 'shortResolved', 'shortRollCount', 'losses'];
  if (Object.keys(wing).length === wingFields.length && Object.keys(wing).every(key => wingFields.includes(key)) &&
      wing.type === 'pdf-escort-fighter-wing-view' && wing.capacity === 4 &&
      ['revision', 'fighters', 'mediumActionCount', 'shortRollCount', 'losses'].every(key =>
        Number.isSafeInteger(wing[key]) && Number(wing[key]) >= 0) &&
      Number(wing.fighters) <= 4 && Number(wing.losses) === 4 - Number(wing.fighters) &&
      Number(wing.mediumActionCount) <= 4 && Number(wing.shortRollCount) <= 4 &&
      typeof wing.launched === 'boolean' && typeof wing.mediumResolved === 'boolean' && typeof wing.shortResolved === 'boolean' &&
      wing.mediumResolved === (Number(wing.mediumActionCount) > 0) && wing.shortResolved === (Number(wing.shortRollCount) > 0) &&
      (wing.cycle === null || Number.isSafeInteger(wing.cycle) && Number(wing.cycle) >= 1) &&
      (wing.cycle !== null || wing.revision === 0 && wing.fighters === 4 && !wing.launched && !wing.mediumResolved && !wing.shortResolved) &&
      (wing.launched || !wing.mediumResolved && !wing.shortResolved) &&
      (!wing.launched || Number(wing.revision) >= 1 && wing.cycle !== null) &&
      (wing.cycle === null || wing.revision !== 0 || wing.fighters === 4 && wing.losses === 0)) {
    result.pdfEscortWing = Object.fromEntries(wingFields.map(key => [key, wing[key]]));
  }
  const crisis = record(root.resolvedCrisisOutcome);
  if (Object.keys(crisis).length === 3 && typeof crisis.crisisId === 'string' && /^[\w-]{1,80}$/.test(crisis.crisisId) &&
      Number.isSafeInteger(crisis.revision) && Number(crisis.revision) >= 1 &&
      typeof crisis.title === 'string' && crisis.title.trim() && crisis.title.length <= 160) {
    result.resolvedCrisisOutcome = { crisisId: crisis.crisisId, revision: crisis.revision, title: crisis.title };
  }
  const outcome = record(root.gameOutcome);
  if (outcome.type === 'game-outcome' && outcome.result === 'failure' &&
      Number.isSafeInteger(outcome.cycle) && Number(outcome.cycle) >= 0 && typeof outcome.occurredAt === 'string' &&
      (outcome.cause === 'total-fleet-loss' || outcome.cause === 'pursuit-limit' && Number(outcome.cycle) >= 1 &&
        Number.isSafeInteger(outcome.navigationRevision) && Number(outcome.navigationRevision) >= 1)) {
    result.gameOutcome = { type: outcome.type, result: outcome.result, cause: outcome.cause,
      cycle: outcome.cycle, occurredAt: outcome.occurredAt,
      ...(outcome.cause === 'pursuit-limit' ? { navigationRevision: outcome.navigationRevision } : {}) };
  }
  const survivors = record(root.survivorOutcome);
  const counts = ['fleetShipPopulation', 'survivingShipPopulation', 'evacuatedPopulation', 'escapePodCapacity',
    'lostPopulation', 'smallVesselPopulation', 'admittedVesselPopulation', 'finalSurvivors'] as const;
  const shipLists = ['survivingShipIds', 'lostOrDestroyedShipIds'] as const;
  const ids = shipLists.flatMap(key => Array.isArray(survivors[key]) ? survivors[key] as unknown[] : []);
  if (survivors.type === 'survivor-outcome' && Number.isSafeInteger(survivors.cycle) && Number(survivors.cycle) >= 0 &&
      typeof survivors.occurredAt === 'string' && counts.every(key => Number.isSafeInteger(survivors[key]) && Number(survivors[key]) >= 0) &&
      shipLists.every(key => Array.isArray(survivors[key])) && ids.every(id => typeof id === 'string' && activeVesselIds.includes(id)) &&
      new Set(ids).size === ids.length && (Number((survivors.lostOrDestroyedShipIds as unknown[]).length) > 0 ||
        survivors.evacuatedPopulation === 0 && survivors.escapePodCapacity === 0 && survivors.lostPopulation === 0) && Number(survivors.evacuatedPopulation) <= Number(survivors.escapePodCapacity) &&
      Number(survivors.fleetShipPopulation) === Number(survivors.survivingShipPopulation) + Number(survivors.evacuatedPopulation) + Number(survivors.lostPopulation) &&
      Number(survivors.finalSurvivors) === Number(survivors.survivingShipPopulation) + Number(survivors.evacuatedPopulation) + Number(survivors.smallVesselPopulation) + Number(survivors.admittedVesselPopulation)) {
    result.survivorOutcome = { type: survivors.type, cycle: survivors.cycle, occurredAt: survivors.occurredAt,
      ...Object.fromEntries(counts.map(key => [key, survivors[key]])),
      ...Object.fromEntries(shipLists.map(key => [key, [...survivors[key] as string[]]])) };
  }
  return result;
}
