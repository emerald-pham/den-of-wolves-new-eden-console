import {
  shuttleDockingsAreParked,
  shuttleDockingsMatchActiveRoleOwnedSubset,
} from './craftOwnership';
import { SCOUT_TAXI_COMMUNICATION_PATH, fleetGroupRecord, type FleetGroupRecord } from './fleetGroups';
import { isResourceShipId } from './resources';
import {
  requireScoutEntitlement,
  type ScoutEntitlementAuthorityInput,
} from './scoutEntitlements';
import {
  authorizeCurrentScoutScan,
  parseScoutCadence,
  type AuthorizedScoutScan,
  type ScoutCadence,
  type ScoutCadenceEntry,
} from './scoutRequestCadence';
import { parseShuttleDepartures, shuttleMovementWindowOpen } from './shuttleDeparture';
import { parseShuttleControl } from './shuttleControl';
import type { AuthoritativeShuttleDocking } from './shuttleDocking';
import { jumpDistanceBetween, STAR_CHART_COORDINATES } from './starChartGraph';
import { turnPhaseState } from './turnZero';

export type ScoutTaxiShuttleId = 'starlight' | 'hummingbird';

export interface ScoutTaxiCommunicationRequest {
  readonly sessionId: string;
  readonly requestId: string;
  readonly shuttleId: ScoutTaxiShuttleId;
  readonly targetShipId: string;
  readonly text: string;
  readonly expectedCycle: number;
  readonly expectedControlRevision: number;
  readonly expectedNavigationRevision: number;
}

export interface ScoutTaxiActorAuthority extends Pick<
  ScoutEntitlementAuthorityInput,
  'playerRole' | 'connected' | 'assignedRoleId' | 'seatId' | 'replacementRoleId'
> {
  readonly uid: unknown;
  /** The transaction adapter supplies its current server-side presence decision. */
  readonly active: unknown;
  readonly fleetGroupId: unknown;
}

export interface ScoutTaxiCommunicationInput {
  /** Raw callable data; only the documented request fields are accepted. */
  readonly request: unknown;
  /** Identity and snapshots read by the server transaction. */
  readonly sessionId: unknown;
  readonly actorUid: unknown;
  readonly actor: ScoutTaxiActorAuthority;
  readonly sessionPhase: unknown;
  readonly currentCycle: unknown;
  readonly turnPhase: unknown;
  readonly now: unknown;
  readonly chartId: unknown;
  readonly activeRoleIds: unknown;
  readonly activeVesselIds: unknown;
  readonly shuttleControl: unknown;
  readonly shuttleDockings: unknown;
  /** Pass undefined only when the departure document does not exist. */
  readonly pendingDeparture: unknown;
  /** Pass undefined only when the transit document does not exist. */
  readonly transit: unknown;
  readonly fleetGroups: unknown;
  readonly shipGalacticCoordinates: unknown;
  readonly navigationRevision: unknown;
  readonly cadence: unknown;
  readonly maintenanceCycles: unknown;
  readonly shuttleFuelled: unknown;
}

export interface ScoutTaxiCommunicationPlan {
  readonly authorityPath: typeof SCOUT_TAXI_COMMUNICATION_PATH;
  readonly sessionId: string;
  readonly requestId: string;
  readonly actorUid: string;
  readonly cycle: number;
  readonly chartId: 'A' | 'B' | 'C';
  readonly shuttleId: ScoutTaxiShuttleId;
  readonly ownerRoleId: 'wing-commander' | 'quellon-explorer';
  readonly anchorShipId: 'aegis' | 'quellon';
  readonly controlRevision: number;
  readonly navigationRevision: number;
  readonly origin: Readonly<{
    groupId: string;
    shipId: 'aegis' | 'quellon';
    coordinate: string;
  }>;
  readonly target: Readonly<{
    groupId: string;
    shipId: string;
    coordinate: string;
  }>;
  readonly distance: number;
  readonly attempt: 1 | 2;
  readonly text: string;
  /** The caller persists this exact existing scout cadence shape atomically. */
  readonly nextCadence: ScoutCadence;
}

type ParsedRequest = ScoutTaxiCommunicationRequest;

const SHUTTLE_AUTHORITY: Readonly<Record<ScoutTaxiShuttleId, Readonly<{
  ownerRoleId: 'wing-commander' | 'quellon-explorer';
  anchorShipId: 'aegis' | 'quellon';
  range: 2 | 3;
}>>> = Object.freeze({
  starlight: Object.freeze({ ownerRoleId: 'wing-commander', anchorShipId: 'aegis', range: 2 }),
  hummingbird: Object.freeze({ ownerRoleId: 'quellon-explorer', anchorShipId: 'quellon', range: 3 }),
});

const REQUEST_KEYS = [
  'sessionId', 'requestId', 'shuttleId', 'targetShipId', 'text',
  'expectedCycle', 'expectedControlRevision', 'expectedNavigationRevision',
] as const;
const PRINTED_COORDINATES = new Set<string>(STAR_CHART_COORDINATES);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value);
  return actual.length === keys.length && actual.every((key) => keys.includes(key));
}

function boundedId(value: unknown): value is string {
  return typeof value === 'string' && /^[\w-]{1,128}$/.test(value);
}

function revision(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0 &&
    (value as number) < Number.MAX_SAFE_INTEGER;
}

function stringList(value: unknown, label: string): readonly string[] {
  if (!Array.isArray(value) || value.some((entry) =>
    typeof entry !== 'string' || entry.length === 0) || new Set(value).size !== value.length) {
    throw new Error(`Scout taxi ${label} authority is malformed.`);
  }
  return value as readonly string[];
}

function parseRequest(value: unknown): ParsedRequest {
  if (!isRecord(value) || !hasExactKeys(value, REQUEST_KEYS) ||
      !boundedId(value.sessionId) || !boundedId(value.requestId) ||
      (value.shuttleId !== 'starlight' && value.shuttleId !== 'hummingbird') ||
      !boundedId(value.targetShipId) || typeof value.text !== 'string' ||
      !value.text.trim() || value.text.length > 200 ||
      !Number.isSafeInteger(value.expectedCycle) || (value.expectedCycle as number) < 1 ||
      !revision(value.expectedControlRevision) || !revision(value.expectedNavigationRevision)) {
    throw new Error('Scout taxi communication request is malformed.');
  }
  return {
    sessionId: value.sessionId,
    requestId: value.requestId,
    shuttleId: value.shuttleId,
    targetShipId: value.targetShipId,
    text: value.text.trim(),
    expectedCycle: value.expectedCycle as number,
    expectedControlRevision: value.expectedControlRevision,
    expectedNavigationRevision: value.expectedNavigationRevision,
  };
}

function parseFleetGroups(
  value: unknown,
  activeVesselIds: readonly string[],
  actorUid: string,
  actorFleetGroupId: string,
  originShipId: string,
  targetShipId: string,
): Readonly<{
  origin: FleetGroupRecord;
  target: FleetGroupRecord;
}> {
  if (!Array.isArray(value) || value.length < 2) {
    throw new Error('Scout taxi requires current source and target fleet groups.');
  }
  const groups: FleetGroupRecord[] = [];
  const groupIds = new Set<string>();
  const vesselToGroup = new Map<string, FleetGroupRecord>();
  const groupForMember = new Map<string, FleetGroupRecord>();

  for (const rawGroup of value) {
    const group = fleetGroupRecord(rawGroup);
    if (!group || !/^fleet-[1-9]\d*$/.test(group.id) || groupIds.has(group.id)) {
      throw new Error('Scout taxi fleet-group authority is malformed or duplicated.');
    }
    groupIds.add(group.id);
    groups.push(group);
    for (const shipId of group.vesselIds) {
      if (!activeVesselIds.includes(shipId) || vesselToGroup.has(shipId)) {
        throw new Error('Scout taxi fleet-group vessel membership is duplicated or stale.');
      }
      vesselToGroup.set(shipId, group);
    }
    for (const uid of group.memberUids) {
      if (groupForMember.has(uid)) {
        throw new Error('Scout taxi fleet-group player membership is duplicated.');
      }
      groupForMember.set(uid, group);
    }
  }
  if (vesselToGroup.size !== activeVesselIds.length ||
      activeVesselIds.some((shipId) => !vesselToGroup.has(shipId))) {
    throw new Error('Scout taxi fleet-group authority does not cover the active core fleet.');
  }

  const origin = vesselToGroup.get(originShipId);
  const target = vesselToGroup.get(targetShipId);
  const actorGroup = groupForMember.get(actorUid);
  if (!origin || !target || !actorGroup || actorGroup.id !== actorFleetGroupId ||
      !origin.memberUids.includes(actorUid) || actorGroup.id !== origin.id) {
    throw new Error('Scout taxi owner and source fleet-group authority do not match.');
  }
  if (origin.id === target.id) {
    throw new Error('Scout taxi communication requires different fleet groups.');
  }
  if (target.memberUids.length === 0) {
    throw new Error('Scout taxi target group has no active members.');
  }
  return { origin, target };
}

function authoritativeCoordinates(
  value: unknown,
  activeVesselIds: readonly string[],
): Readonly<Record<string, string>> {
  if (!isRecord(value)) throw new Error('Scout taxi navigation authority is malformed.');
  const keys = Object.keys(value);
  if (keys.length !== activeVesselIds.length ||
      keys.some((shipId) => !activeVesselIds.includes(shipId)) ||
      activeVesselIds.some((shipId) =>
        typeof value[shipId] !== 'string' || !PRINTED_COORDINATES.has(value[shipId] as string))) {
    throw new Error('Scout taxi navigation authority does not cover the exact active core fleet.');
  }
  return value as Readonly<Record<string, string>>;
}

function nextCadence(
  cadence: ScoutCadence,
  requestId: string,
  actorUid: string,
  scan: AuthorizedScoutScan,
): ScoutCadence {
  const existing: ScoutCadenceEntry[] = cadence.scans.map((entry) => Object.freeze({
    requestId: entry.requestId,
    actorUid: entry.actorUid,
    scan: Object.freeze({ ...entry.scan }),
  }));
  const addition: ScoutCadenceEntry = Object.freeze({
    requestId,
    actorUid,
    scan,
  });
  return Object.freeze({
    sessionId: cadence.sessionId,
    entitlementId: cadence.entitlementId,
    cycle: cadence.cycle,
    scans: Object.freeze([...existing, addition]),
  });
}

/**
 * Resolve one cross-group courier note against current server authority. This
 * consumes the shuttle's ordinary scout attempt; it never moves a player or
 * craft, transports cargo, or changes chart knowledge or pursuit state.
 */
export function planScoutTaxiCommunication(
  input: ScoutTaxiCommunicationInput,
): ScoutTaxiCommunicationPlan {
  const request = parseRequest(input.request);
  if (!boundedId(input.sessionId) || input.sessionId !== request.sessionId ||
      !boundedId(input.actorUid) || input.actorUid !== input.actor.uid ||
      input.actor.active !== true || input.actor.playerRole !== 'player' ||
      input.actor.connected !== true ||
      typeof input.actor.fleetGroupId !== 'string' ||
      !/^fleet-[1-9]\d*$/.test(input.actor.fleetGroupId)) {
    throw new Error('Scout taxi requires the current connected player and session authority.');
  }
  if (input.sessionPhase !== 'active' || !Number.isSafeInteger(input.currentCycle) ||
      (input.currentCycle as number) < 1 || input.currentCycle !== request.expectedCycle ||
      !Number.isSafeInteger(input.now) || (input.now as number) < 0) {
    throw new Error('Scout taxi request is stale or gameplay is not active.');
  }
  const currentCycle = input.currentCycle as number;
  const phase = turnPhaseState(input.turnPhase);
  if (!phase || phase.turn !== currentCycle || phase.airspace.state !== 'lifted' ||
      !shuttleMovementWindowOpen(request.shuttleId, phase, input.now as number)) {
    throw new Error('Scout taxi communication requires current Coordination while airspace is open.');
  }
  if (input.chartId !== 'A' && input.chartId !== 'B' && input.chartId !== 'C') {
    throw new Error('Scout taxi requires the locked chart authority.');
  }

  const activeRoleIds = stringList(input.activeRoleIds, 'role roster');
  const activeVesselIds = stringList(input.activeVesselIds, 'vessel roster');
  const craft = SHUTTLE_AUTHORITY[request.shuttleId];
  if (input.actor.assignedRoleId !== craft.ownerRoleId ||
      input.actor.seatId !== craft.ownerRoleId || input.actor.replacementRoleId != null) {
    throw new Error('Only the current printed core-role owner may use this scout taxi.');
  }
  const entitlement = requireScoutEntitlement({
    requestedEntitlementId: request.shuttleId,
    playerRole: input.actor.playerRole,
    connected: input.actor.connected,
    assignedRoleId: input.actor.assignedRoleId,
    seatId: input.actor.seatId,
    replacementRoleId: input.actor.replacementRoleId,
    activeRoleIds,
    activeVesselIds,
  });
  if (entitlement.source !== 'craft' || entitlement.id !== request.shuttleId ||
      entitlement.ownerRoleId !== craft.ownerRoleId || entitlement.anchorShipId !== craft.anchorShipId) {
    throw new Error('Scout taxi craft entitlement is unavailable.');
  }

  const controls = parseShuttleControl(input.shuttleControl);
  const control = controls?.[request.shuttleId];
  if (!control || control.shuttleId !== request.shuttleId ||
      control.ownerRoleId !== craft.ownerRoleId || control.ownerUid !== input.actorUid ||
      control.holderUid !== input.actorUid ||
      control.revision !== request.expectedControlRevision) {
    throw new Error('Scout taxi shuttle control is stale or belongs to another holder.');
  }

  const rawDockings = input.shuttleDockings;
  if (!Array.isArray(rawDockings)) {
    throw new Error('Scout taxi docking authority is unavailable.');
  }
  let dockingsAreUsable = false;
  try {
    dockingsAreUsable = shuttleDockingsAreParked(rawDockings, activeVesselIds) &&
      shuttleDockingsMatchActiveRoleOwnedSubset(
        activeRoleIds,
        rawDockings as readonly { shuttleId: string; shipId: string }[],
      );
  } catch {
    dockingsAreUsable = false;
  }
  if (!dockingsAreUsable) throw new Error('Scout taxi docking authority is malformed or in transit.');
  const selectedDocking = (rawDockings as readonly AuthoritativeShuttleDocking[])
    .filter((docking) => docking.shuttleId === request.shuttleId);
  if (selectedDocking.length !== 1 || selectedDocking[0]!.shipId !== craft.anchorShipId) {
    throw new Error('The scouting shuttle must be docked at its printed anchor ship.');
  }

  const departures = parseShuttleDepartures(input.pendingDeparture === undefined
    ? {}
    : { [request.shuttleId]: input.pendingDeparture });
  if (!departures || departures[request.shuttleId] !== undefined) {
    throw new Error('The scouting shuttle has a pending departure.');
  }
  if (input.transit !== undefined) {
    throw new Error('The scouting shuttle is in transit.');
  }

  if (!isResourceShipId(request.targetShipId) || !activeVesselIds.includes(request.targetShipId)) {
    throw new Error('Choose an active core ship as the scout taxi destination.');
  }
  const coordinates = authoritativeCoordinates(input.shipGalacticCoordinates, activeVesselIds);
  const originCoordinate = coordinates[craft.anchorShipId];
  const targetCoordinate = coordinates[request.targetShipId];
  if (typeof originCoordinate !== 'string' || typeof targetCoordinate !== 'string') {
    throw new Error('Scout taxi origin or destination has no current chart fix.');
  }
  const distance = jumpDistanceBetween(originCoordinate, targetCoordinate);
  if (distance === null || distance > craft.range) {
    throw new Error('The scout taxi destination is outside the shuttle\'s printed range.');
  }
  if (!revision(input.navigationRevision) ||
      input.navigationRevision !== request.expectedNavigationRevision) {
    throw new Error('Scout taxi navigation changed; refresh before sending.');
  }

  const { origin, target } = parseFleetGroups(
    input.fleetGroups,
    activeVesselIds,
    input.actorUid,
    input.actor.fleetGroupId,
    craft.anchorShipId,
    request.targetShipId,
  );

  const cadence = parseScoutCadence(
    input.cadence,
    request.sessionId,
    request.shuttleId,
    currentCycle,
  );
  if (cadence.scans.some((entry) => entry.requestId === request.requestId)) {
    throw new Error('This scout taxi request identity has already consumed an attempt.');
  }
  const scan = authorizeCurrentScoutScan({
    entitlementId: request.shuttleId,
    cycle: currentCycle,
    targetCoordinate,
    shipGalacticCoordinates: coordinates,
    cadence,
    maintenanceCycles: input.maintenanceCycles,
    shuttleFuelled: input.shuttleFuelled,
    playerRole: input.actor.playerRole,
    connected: input.actor.connected,
    assignedRoleId: input.actor.assignedRoleId,
    seatId: input.actor.seatId,
    replacementRoleId: input.actor.replacementRoleId,
    activeRoleIds,
    activeVesselIds,
  });

  return Object.freeze({
    authorityPath: SCOUT_TAXI_COMMUNICATION_PATH,
    sessionId: request.sessionId,
    requestId: request.requestId,
    actorUid: input.actorUid,
    cycle: currentCycle,
    chartId: input.chartId,
    shuttleId: request.shuttleId,
    ownerRoleId: craft.ownerRoleId,
    anchorShipId: craft.anchorShipId,
    controlRevision: control.revision,
    navigationRevision: input.navigationRevision,
    origin: Object.freeze({
      groupId: origin.id,
      shipId: craft.anchorShipId,
      coordinate: originCoordinate,
    }),
    target: Object.freeze({
      groupId: target.id,
      shipId: request.targetShipId,
      coordinate: targetCoordinate,
    }),
    distance,
    attempt: scan.attempt,
    text: request.text,
    nextCadence: nextCadence(cadence, request.requestId, input.actorUid, scan),
  });
}
