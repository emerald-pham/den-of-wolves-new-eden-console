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
  readonly presidentialBallotSubmitted?: boolean;
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
  'presidentialElection', 'presidentialOffices', 'currentMemberBallotSubmitted',
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
  if (typeof scope.presidentialBallotSubmitted === 'boolean') {
    result.currentMemberBallotSubmitted = scope.presidentialBallotSubmitted;
  } else if (typeof root.currentMemberBallotSubmitted === 'boolean') {
    result.currentMemberBallotSubmitted = root.currentMemberBallotSubmitted;
  } else delete result.currentMemberBallotSubmitted;
  const electionView = publicElectionView(root.presidentialElection);
  if (electionView) result.presidentialElection = electionView;
  else delete result.presidentialElection;
  const office = record(result.presidentialOffices);
  const hasOfficeOwnerUid = typeof office.presidentUid === 'string';
  const isAlreadySanitizedMemberOffice = scope.actorUid === undefined &&
    typeof root.currentMemberIsPresident === 'boolean' && !hasOfficeOwnerUid;
  delete result.currentMemberIsPresident;
  if (office.electionId === 'current' && Number.isSafeInteger(office.revision) && Number(office.revision) >= 1 &&
      (hasOfficeOwnerUid || isAlreadySanitizedMemberOffice) && typeof office.presidentCandidateId === 'string' &&
      /^candidate-[\w-]{1,128}$/.test(office.presidentCandidateId) && typeof office.presidentDisplayName === 'string' &&
      office.presidentDisplayName.trim() && office.presidentDisplayName.length <= 40 &&
      Number.isSafeInteger(office.decidedCycle) && Number(office.decidedCycle) >= 1 &&
      (office.vicePresidentUid === undefined || typeof office.vicePresidentUid === 'string') &&
      (office.vicePresidentCandidateId === undefined || typeof office.vicePresidentCandidateId === 'string' &&
        /^candidate-[\w-]{1,128}$/.test(office.vicePresidentCandidateId)) &&
      (office.vicePresidentDisplayName === undefined || typeof office.vicePresidentDisplayName === 'string' &&
        office.vicePresidentDisplayName.trim() && office.vicePresidentDisplayName.length <= 40) &&
      (office.vicePresidentVacant === undefined || office.vicePresidentVacant === true) &&
      (office.vicePresidentVacant !== true || office.vicePresidentUid === undefined &&
        office.vicePresidentCandidateId === undefined && office.vicePresidentDisplayName === undefined)) {
    result.presidentialOffices = {
      electionId: 'current', revision: office.revision,
      presidentCandidateId: office.presidentCandidateId,
      presidentDisplayName: office.presidentDisplayName.trim(),
      ...(typeof office.vicePresidentCandidateId === 'string'
        ? { vicePresidentCandidateId: office.vicePresidentCandidateId,
          ...(typeof office.vicePresidentDisplayName === 'string' ? { vicePresidentDisplayName: office.vicePresidentDisplayName.trim() } : {}) } : {}),
      ...(office.vicePresidentVacant === true ? { vicePresidentVacant: true } : {}),
      decidedCycle: office.decidedCycle,
    };
    result.currentMemberIsPresident = scope.actorUid && hasOfficeOwnerUid
      ? root.presidentialOfficeOwnerUid === scope.actorUid
      : root.currentMemberIsPresident === true;
  } else { delete result.presidentialOffices;delete result.currentMemberIsPresident; }
  const currentMemberIsPresident = result.currentMemberIsPresident === true;
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
    if ((ships.has(id) || currentMemberIsPresident &&
        ['presidentWorkspace','politicalCapital','resolvedCrisisOutcome'].includes(key)) && root[key] !== undefined) result[key] = root[key];
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

function publicElectionView(value: unknown): Record<string, unknown> | undefined {
  const raw = record(value);
  const stateNames = ['scheduled', 'open', 'tie-pending', 'resolved', 'no-winner'];
  if (raw.type !== 'presidential-election' || Object.keys(raw).some(key => ![
    'type','revision','state','policy','candidates','tally','presidentCandidateId','vicePresidentCandidateId',
    'pendingPresidentTie','pendingVicePresidentTie','vicePresidentOutcome','decidedCycle',
  ].includes(key)) || !Number.isSafeInteger(raw.revision) || Number(raw.revision) < 1 ||
      !stateNames.includes(String(raw.state)) || !Array.isArray(raw.candidates) || raw.candidates.length < 2 ||
      raw.candidates.length > 300) return undefined;
  const candidateIds = new Set<string>();
  const candidates: { id: string; displayName: string }[] = [];
  for (const entry of raw.candidates) {
    const candidate = record(entry);
    if (Object.keys(candidate).length !== 2 || typeof candidate.id !== 'string' ||
        !/^candidate-[\w-]{1,128}$/.test(candidate.id) || candidateIds.has(candidate.id) ||
        typeof candidate.displayName !== 'string' || !candidate.displayName.trim() || candidate.displayName.length > 40) return undefined;
    candidateIds.add(candidate.id);
    candidates.push({ id: candidate.id, displayName: candidate.displayName.trim() });
  }
  const policy = record(raw.policy);
  if (Object.keys(policy).length !== 9 || Object.keys(policy).some(key => ![
    'votingSystem','populationWeighting','openCycle','closeCycle','vicePresidentEnabled','campaigning','supplyUse',
    'campaignInstructions','tieRule',
  ].includes(key)) || !['plurality','majority'].includes(String(policy.votingSystem)) ||
      !['equal','ship-population'].includes(String(policy.populationWeighting)) ||
      !Number.isSafeInteger(policy.openCycle) || Number(policy.openCycle) < 1 ||
      !Number.isSafeInteger(policy.closeCycle) || Number(policy.closeCycle) < Number(policy.openCycle) ||
      typeof policy.vicePresidentEnabled !== 'boolean' || !['open','structured','prohibited'].includes(String(policy.campaigning)) ||
      !['prohibited','facilitator-approved'].includes(String(policy.supplyUse)) ||
      typeof policy.campaignInstructions !== 'string' || !policy.campaignInstructions.trim() || policy.campaignInstructions.length > 1200 ||
      !['current-office-remains','facilitator-choice'].includes(String(policy.tieRule))) return undefined;
  const idList = (input: unknown): string[] | undefined => {
    if (!Array.isArray(input) || input.length > 300 || input.some(id => typeof id !== 'string' || !candidateIds.has(id)) ||
        new Set(input).size !== input.length) return undefined;
    return [...input] as string[];
  };
  const parseOfficeTally = (value: unknown): Record<string, unknown> | undefined => {
    const tally = record(value);
    if (Object.keys(tally).some(key => !['totalVotes','totalWeight','scores','tiedCandidateIds','winnerId'].includes(key)) ||
        !Number.isSafeInteger(tally.totalVotes) || Number(tally.totalVotes) < 0 || Number(tally.totalVotes) > 300 ||
        !Number.isSafeInteger(tally.totalWeight) || Number(tally.totalWeight) < 0 || typeof tally.scores !== 'object' ||
        tally.scores === null || Array.isArray(tally.scores)) return undefined;
    const rawScores = record(tally.scores);
    const scores = Object.fromEntries(Object.entries(rawScores).filter(([id, score]) => candidateIds.has(id) &&
      Number.isSafeInteger(score) && Number(score) >= 0));
    if (Object.keys(scores).length !== Object.keys(rawScores).length) return undefined;
    const tiedCandidateIds = idList(tally.tiedCandidateIds);
    if (!tiedCandidateIds || (tally.winnerId !== undefined &&
      (typeof tally.winnerId !== 'string' || !candidateIds.has(tally.winnerId)))) return undefined;
    return { totalVotes: Number(tally.totalVotes), totalWeight: Number(tally.totalWeight), scores, tiedCandidateIds,
      ...(tally.winnerId === undefined ? {} : { winnerId: tally.winnerId }) };
  };
  let tally: Record<string, unknown> | undefined;
  if (raw.tally !== undefined) {
    const source = record(raw.tally), president = parseOfficeTally(source.president);
    const vicePresident = source.vicePresident === undefined ? undefined : parseOfficeTally(source.vicePresident);
    if (Object.keys(source).some(key => key !== 'president' && key !== 'vicePresident') || !president ||
        (source.vicePresident !== undefined && !vicePresident) ||
        (Boolean(policy.vicePresidentEnabled) !== Boolean(source.vicePresident))) return undefined;
    tally = { president, ...(vicePresident ? { vicePresident } : {}) };
  }
  const pendingPresidentTie = raw.pendingPresidentTie === undefined ? undefined : idList(raw.pendingPresidentTie);
  const pendingVicePresidentTie = raw.pendingVicePresidentTie === undefined ? undefined : idList(raw.pendingVicePresidentTie);
  const validPresident = raw.presidentCandidateId === undefined ||
    typeof raw.presidentCandidateId === 'string' && candidateIds.has(raw.presidentCandidateId);
  const validVicePresident = raw.vicePresidentCandidateId === undefined ||
    typeof raw.vicePresidentCandidateId === 'string' && candidateIds.has(raw.vicePresidentCandidateId);
  const viceOutcome = raw.vicePresidentOutcome;
  const publicTally = record(tally);
  const presidentTally = record(publicTally.president);
  const vicePresidentTally = record(publicTally.vicePresident);
  const sharedBallotLeader = typeof presidentTally.winnerId === 'string' &&
    presidentTally.winnerId === vicePresidentTally.winnerId;
  const validViceOutcome = viceOutcome === undefined || (viceOutcome === 'runner-up' &&
    raw.state === 'resolved' && policy.vicePresidentEnabled === true &&
    typeof raw.presidentCandidateId === 'string' && typeof raw.vicePresidentCandidateId === 'string' &&
    raw.presidentCandidateId !== raw.vicePresidentCandidateId && sharedBallotLeader) || (viceOutcome === 'runner-up-pending' &&
    raw.state === 'tie-pending' && policy.vicePresidentEnabled === true && sharedBallotLeader &&
    pendingVicePresidentTie !== undefined && pendingVicePresidentTie.length >= 2 &&
    raw.vicePresidentCandidateId === undefined) || (viceOutcome === 'vacant' &&
    raw.state === 'resolved' && policy.vicePresidentEnabled === true &&
    typeof raw.presidentCandidateId === 'string' && raw.vicePresidentCandidateId === undefined && sharedBallotLeader);
  if ((raw.pendingPresidentTie !== undefined && !pendingPresidentTie) ||
      (raw.pendingVicePresidentTie !== undefined && !pendingVicePresidentTie) ||
      !validViceOutcome ||
      !validPresident || !validVicePresident ||
      (raw.decidedCycle !== undefined && (!Number.isSafeInteger(raw.decidedCycle) || Number(raw.decidedCycle) < 1))) return undefined;
  return {
    type: 'presidential-election', revision: Number(raw.revision), state: raw.state,
    policy: {
      votingSystem: policy.votingSystem, populationWeighting: policy.populationWeighting,
      openCycle: Number(policy.openCycle), closeCycle: Number(policy.closeCycle),
      vicePresidentEnabled: policy.vicePresidentEnabled, campaigning: policy.campaigning,
      supplyUse: policy.supplyUse, campaignInstructions: policy.campaignInstructions.trim(), tieRule: policy.tieRule,
    }, candidates, ...(tally ? { tally } : {}),
    ...(typeof raw.presidentCandidateId === 'string' ? { presidentCandidateId: raw.presidentCandidateId } : {}),
    ...(typeof raw.vicePresidentCandidateId === 'string' ? { vicePresidentCandidateId: raw.vicePresidentCandidateId } : {}),
    ...(pendingPresidentTie ? { pendingPresidentTie } : {}), ...(pendingVicePresidentTie ? { pendingVicePresidentTie } : {}),
    ...(typeof raw.vicePresidentOutcome === 'string' ? { vicePresidentOutcome: raw.vicePresidentOutcome } : {}),
    ...(raw.decidedCycle === undefined ? {} : { decidedCycle: Number(raw.decidedCycle) }),
  };
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
  const crisisKeys = Object.keys(crisis);
  const includesCapitalAward = Object.hasOwn(crisis, 'capitalApplied') || Object.hasOwn(crisis, 'capitalDelta');
  const validCapitalAward = !includesCapitalAward ||
    typeof crisis.capitalApplied === 'boolean' && (crisis.capitalDelta === 0 || crisis.capitalDelta === 1) &&
    crisis.capitalApplied === (crisis.capitalDelta === 1);
  if ((crisisKeys.length === 3 || crisisKeys.length === 5) &&
      crisisKeys.every(key => ['crisisId', 'revision', 'title', 'capitalApplied', 'capitalDelta'].includes(key)) &&
      validCapitalAward && typeof crisis.crisisId === 'string' && /^[\w-]{1,80}$/.test(crisis.crisisId) &&
      Number.isSafeInteger(crisis.revision) && Number(crisis.revision) >= 1 &&
      typeof crisis.title === 'string' && crisis.title.trim() && crisis.title.length <= 160) {
    result.resolvedCrisisOutcome = { crisisId: crisis.crisisId, revision: crisis.revision, title: crisis.title,
      ...(includesCapitalAward ? { capitalApplied: crisis.capitalApplied as boolean,
        capitalDelta: crisis.capitalDelta as 0 | 1 } : {}) };
  }
  const election = publicElectionView(root.presidentialElection);
  if (election) result.presidentialElection = election;
  const offices = record(root.presidentialOffices);
  if (offices.electionId === 'current' && Number.isSafeInteger(offices.revision) && Number(offices.revision) >= 1 &&
      typeof offices.presidentUid === 'string' && /^candidate-[\w-]{1,128}$/.test(String(offices.presidentCandidateId)) &&
      typeof offices.presidentDisplayName === 'string' && offices.presidentDisplayName.trim() && offices.presidentDisplayName.length <= 40 &&
      (offices.vicePresidentUid === undefined || typeof offices.vicePresidentUid === 'string') &&
      (offices.vicePresidentCandidateId === undefined || /^candidate-[\w-]{1,128}$/.test(String(offices.vicePresidentCandidateId))) &&
      (offices.vicePresidentDisplayName === undefined || typeof offices.vicePresidentDisplayName === 'string' &&
        offices.vicePresidentDisplayName.trim() && offices.vicePresidentDisplayName.length <= 40) &&
      (offices.vicePresidentVacant === undefined || offices.vicePresidentVacant === true) &&
      (offices.vicePresidentVacant !== true || offices.vicePresidentUid === undefined &&
        offices.vicePresidentCandidateId === undefined && offices.vicePresidentDisplayName === undefined) &&
      Number.isSafeInteger(offices.decidedCycle) && Number(offices.decidedCycle) >= 1) {
    result.presidentialOffices = {
      electionId: 'current', revision: Number(offices.revision), presidentUid: offices.presidentUid,
      presidentCandidateId: offices.presidentCandidateId, presidentDisplayName: offices.presidentDisplayName.trim(),
      ...(offices.vicePresidentCandidateId ? { vicePresidentUid: offices.vicePresidentUid,
        vicePresidentCandidateId: offices.vicePresidentCandidateId,
        ...(typeof offices.vicePresidentDisplayName === 'string' ? { vicePresidentDisplayName: offices.vicePresidentDisplayName.trim() } : {}) } : {}),
      ...(offices.vicePresidentVacant === true ? { vicePresidentVacant: true } : {}),
      decidedCycle: Number(offices.decidedCycle),
    };
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
