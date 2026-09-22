import { shuttleHostIsAllowed } from './craftOwnership';
import type { FleetGroupRecord } from './fleetGroups';
import type { ShuttleControlEntry } from './shuttleControl';
import { shuttleMovementWindowOpen, type ShuttleDepartureRequestState } from './shuttleDeparture';
import type { AuthoritativeShuttleDocking } from './shuttleDocking';
import type { TurnPhase } from './turnZero';

export const SHUTTLE_TRANSIT_DURATION_MS = 60_000;

export interface ShuttleWorldPoint {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface ShuttleTransitState extends Omit<ShuttleDepartureRequestState, 'status'> {
  readonly status: 'in-transit';
  readonly transitRequestId: string;
  readonly revision: number;
  /** Immutable timestamp of the original departure from originShipId. */
  readonly originDepartedAt: string;
  readonly originPosition: ShuttleWorldPoint;
  readonly currentPosition: ShuttleWorldPoint;
  readonly destinationPosition: ShuttleWorldPoint;
  readonly velocity: ShuttleWorldPoint;
  readonly departedAt: string;
  readonly arrivesAt: string;
}

const FLEET_WORLD_POSITIONS: Readonly<Record<string, ShuttleWorldPoint>> = Object.freeze({
  aegis: Object.freeze({ x: 0, y: 0, z: 0 }),
  dione: Object.freeze({ x: -0.32, y: 0.18, z: 0.22 }),
  icebreaker: Object.freeze({ x: 0.26, y: -0.12, z: 0.28 }),
  capybara: Object.freeze({ x: -0.08, y: -0.31, z: 0.12 }),
  shepherd: Object.freeze({ x: 0.34, y: 0.24, z: -0.16 }),
  quellon: Object.freeze({ x: -0.28, y: -0.08, z: -0.26 }),
  'refinery-124': Object.freeze({ x: 0.09, y: 0.32, z: 0.31 }),
});

/** Return one immutable ship position in the local fleet-space model. */
export function fleetWorldPositionForShip(shipId: string): ShuttleWorldPoint | undefined {
  return FLEET_WORLD_POSITIONS[shipId];
}

/** Derive a transit craft's physical position at one server timestamp. */
export function shuttlePositionAt(transit: ShuttleTransitState, now: number): ShuttleWorldPoint {
  if (!Number.isFinite(now)) throw new Error('Shuttle parking time must be finite.');
  const departedAt = Date.parse(transit.departedAt);
  const arrivesAt = Date.parse(transit.arrivesAt);
  if (!Number.isFinite(departedAt) || !Number.isFinite(arrivesAt) || arrivesAt <= departedAt) {
    throw new Error('Shuttle transit timing is malformed.');
  }
  const elapsedSeconds = Math.max(0, Math.min(arrivesAt - departedAt, now - departedAt)) / 1_000;
  if (elapsedSeconds === 0) return transit.currentPosition;
  if (now >= arrivesAt) return transit.destinationPosition;
  const position = {
    x: transit.currentPosition.x + transit.velocity.x * elapsedSeconds,
    y: transit.currentPosition.y + transit.velocity.y * elapsedSeconds,
    z: transit.currentPosition.z + transit.velocity.z * elapsedSeconds,
  };
  if (![position.x, position.y, position.z].every(Number.isFinite)) {
    throw new Error('Shuttle transit position is malformed.');
  }
  return Object.freeze(position);
}

function point(value: unknown): ShuttleWorldPoint | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  if (Object.keys(raw).some((key) => !['x', 'y', 'z'].includes(key)) ||
      ![raw.x, raw.y, raw.z].every((entry) => typeof entry === 'number' && Number.isFinite(entry))) {
    return null;
  }
  return { x: raw.x as number, y: raw.y as number, z: raw.z as number };
}

function velocityBetween(
  origin: ShuttleWorldPoint,
  destination: ShuttleWorldPoint,
): ShuttleWorldPoint {
  const seconds = SHUTTLE_TRANSIT_DURATION_MS / 1_000;
  return {
    x: (destination.x - origin.x) / seconds,
    y: (destination.y - origin.y) / seconds,
    z: (destination.z - origin.z) / seconds,
  };
}

/** Validate the persisted leg before deriving a new server-authoritative position. */
export function isCanonicalShuttleTransitLeg(transit: ShuttleTransitState): boolean {
  const originPosition = fleetWorldPositionForShip(transit.originShipId);
  const destinationPosition = fleetWorldPositionForShip(transit.destinationShipId);
  const originDepartedAt = Date.parse(transit.originDepartedAt);
  const departedAt = Date.parse(transit.departedAt);
  const arrivesAt = Date.parse(transit.arrivesAt);
  if (!originPosition || !destinationPosition || !Number.isFinite(originDepartedAt) ||
      !Number.isFinite(departedAt) || !Number.isFinite(arrivesAt) ||
      originDepartedAt > departedAt || arrivesAt - departedAt !== SHUTTLE_TRANSIT_DURATION_MS ||
      !point(transit.currentPosition) || !point(transit.velocity) ||
      !pointsMatch(transit.originPosition, originPosition) ||
      !pointsMatch(transit.destinationPosition, destinationPosition)) return false;
  if (transit.revision === 1 && originDepartedAt !== departedAt) return false;
  const expectedCurrent = transit.revision === 1 ? originPosition : transit.currentPosition;
  if (transit.revision === 1 && !pointsMatch(transit.currentPosition, originPosition)) return false;
  const expectedVelocity = velocityBetween(expectedCurrent, destinationPosition);
  return pointsMatch(transit.velocity, expectedVelocity);
}

function pointsMatch(left: ShuttleWorldPoint, right: ShuttleWorldPoint): boolean {
  const coordinateMatches = (a: number, b: number) =>
    Math.abs(a - b) <= Number.EPSILON * Math.max(1, Math.abs(a), Math.abs(b)) * 16;
  return coordinateMatches(left.x, right.x) &&
    coordinateMatches(left.y, right.y) && coordinateMatches(left.z, right.z);
}

export function parseShuttleTransit(value: unknown, shuttleId: string): ShuttleTransitState | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  const revision = raw.revision as number;
  const originPosition = point(raw.originPosition);
  const currentPosition = point(raw.currentPosition);
  const destinationPosition = point(raw.destinationPosition);
  const velocity = point(raw.velocity);
  const originDepartedAt = raw.originDepartedAt === undefined && revision === 1
    ? raw.departedAt : raw.originDepartedAt;
  if (Object.keys(raw).some((key) => ![
    'status', 'requestId', 'transitRequestId', 'shuttleId', 'holderUid', 'fleetGroupId',
    'originShipId', 'destinationShipId', 'cycle', 'controlRevision', 'requestedAt',
    'revision', 'originDepartedAt', 'originPosition', 'currentPosition', 'destinationPosition', 'velocity',
    'departedAt', 'arrivesAt',
  ].includes(key)) || raw.status !== 'in-transit' || raw.shuttleId !== shuttleId ||
      typeof raw.requestId !== 'string' || raw.requestId.length === 0 ||
      typeof raw.transitRequestId !== 'string' || raw.transitRequestId.length === 0 ||
      typeof raw.holderUid !== 'string' || raw.holderUid.length === 0 ||
      typeof raw.fleetGroupId !== 'string' || raw.fleetGroupId.length === 0 ||
      typeof raw.originShipId !== 'string' || typeof raw.destinationShipId !== 'string' ||
      !Number.isSafeInteger(raw.cycle) || (raw.cycle as number) < 1 ||
      !Number.isSafeInteger(raw.controlRevision) || (raw.controlRevision as number) < 0 ||
      !Number.isSafeInteger(raw.revision) || revision < 1 ||
      typeof raw.requestedAt !== 'string' || !Number.isFinite(Date.parse(raw.requestedAt)) ||
      typeof raw.departedAt !== 'string' || typeof raw.arrivesAt !== 'string' ||
      !Number.isFinite(Date.parse(raw.departedAt)) || !Number.isFinite(Date.parse(raw.arrivesAt)) ||
      Date.parse(raw.arrivesAt) - Date.parse(raw.departedAt) !== SHUTTLE_TRANSIT_DURATION_MS ||
      typeof originDepartedAt !== 'string' || !Number.isFinite(Date.parse(originDepartedAt)) ||
      Date.parse(originDepartedAt) > Date.parse(raw.departedAt) ||
      !originPosition || !currentPosition || !destinationPosition || !velocity) return null;
  return { ...raw, originDepartedAt } as unknown as ShuttleTransitState;
}

export function enterShuttleTransit(input: Readonly<{
  transitRequestId: string;
  actorUid: string;
  expectedDepartureRequestId: string;
  expectedControlRevision: number;
  expectedCycle: number;
  departure: ShuttleDepartureRequestState;
  control: ShuttleControlEntry;
  dockings: readonly AuthoritativeShuttleDocking[];
  group: FleetGroupRecord;
  phase: TurnPhase;
  now: number;
}>): Readonly<{
  transit: ShuttleTransitState;
  dockings: readonly AuthoritativeShuttleDocking[];
}> {
  const { departure } = input;
  if (departure.requestId !== input.expectedDepartureRequestId ||
      departure.holderUid !== input.actorUid || input.control.holderUid !== input.actorUid ||
      departure.controlRevision !== input.expectedControlRevision ||
      input.control.revision !== input.expectedControlRevision ||
      departure.cycle !== input.expectedCycle || input.phase.turn !== input.expectedCycle) {
    throw new Error('Shuttle departure authority changed; refresh before entering transit.');
  }
  if (!shuttleMovementWindowOpen(departure.shuttleId, input.phase, input.now)) {
    throw new Error('Shuttle transit may begin only while airspace is open.');
  }
  if (departure.fleetGroupId !== input.group.id ||
      !input.group.memberUids.includes(input.actorUid) ||
      !input.group.vesselIds.includes(departure.originShipId) ||
      !input.group.vesselIds.includes(departure.destinationShipId) ||
      departure.originShipId === departure.destinationShipId ||
      !shuttleHostIsAllowed(departure.shuttleId, departure.destinationShipId)) {
    throw new Error('The pending shuttle route is no longer legal for this fleet group.');
  }
  const current = input.dockings.filter((docking) => docking.shuttleId === departure.shuttleId);
  if (current.length !== 1 || current[0]!.shipId !== departure.originShipId) {
    throw new Error('The shuttle is no longer docked at its authorized origin.');
  }
  const originPosition = FLEET_WORLD_POSITIONS[departure.originShipId];
  const destinationPosition = FLEET_WORLD_POSITIONS[departure.destinationShipId];
  if (!originPosition || !destinationPosition) {
    throw new Error('The shuttle route has no authoritative world position.');
  }
  const departedAt = new Date(input.now).toISOString();
  const arrivesAt = new Date(input.now + SHUTTLE_TRANSIT_DURATION_MS).toISOString();
  const velocity = velocityBetween(originPosition, destinationPosition);
  return {
    transit: {
      ...departure,
      status: 'in-transit',
      transitRequestId: input.transitRequestId,
      revision: 1,
      originDepartedAt: departedAt,
      originPosition,
      currentPosition: originPosition,
      destinationPosition,
      velocity,
      departedAt,
      arrivesAt,
    },
    dockings: input.dockings.filter((docking) => docking.shuttleId !== departure.shuttleId),
  };
}

/** Retarget one active leg from the server-resolved position at the command time. */
export function retargetShuttleTransit(input: Readonly<{
  actorUid: string;
  expectedTransitRequestId: string;
  expectedControlRevision: number;
  expectedCycle: number;
  destinationShipId: string;
  transit: ShuttleTransitState;
  control: ShuttleControlEntry;
  group: FleetGroupRecord;
  activeVesselIds: readonly string[];
  phase: TurnPhase;
  now: number;
}>): ShuttleTransitState {
  const transit = parseShuttleTransit(input.transit, input.transit.shuttleId);
  if (!transit || transit.transitRequestId !== input.expectedTransitRequestId ||
      !Number.isSafeInteger(input.now) || input.now < 0 ||
      input.actorUid !== transit.holderUid || input.control.holderUid !== input.actorUid ||
      input.control.shuttleId !== transit.shuttleId ||
      input.expectedControlRevision !== transit.controlRevision ||
      input.control.revision !== input.expectedControlRevision ||
      input.expectedCycle !== transit.cycle || input.phase.turn !== input.expectedCycle) {
    throw new Error('The shuttle transit authority changed; refresh before retargeting.');
  }
  if (!shuttleMovementWindowOpen(transit.shuttleId, input.phase, input.now)) {
    throw new Error('Shuttle retargeting may begin only while airspace is open.');
  }
  if (!isCanonicalShuttleTransitLeg(transit)) {
    throw new Error('The stored shuttle transit motion state is malformed; refresh before retargeting.');
  }
  const activeVessels = new Set(input.activeVesselIds);
  if (input.group.id !== transit.fleetGroupId ||
      !input.group.memberUids.includes(input.actorUid) ||
      !activeVessels.has(transit.originShipId) ||
      !activeVessels.has(input.destinationShipId) ||
      !input.group.vesselIds.includes(transit.originShipId) ||
      !input.group.vesselIds.includes(input.destinationShipId) ||
      input.destinationShipId === transit.originShipId ||
      input.destinationShipId === transit.destinationShipId ||
      !shuttleHostIsAllowed(transit.shuttleId, input.destinationShipId)) {
    throw new Error('The requested shuttle course is no longer legal for this fleet group.');
  }
  const departedAtMs = Date.parse(transit.departedAt);
  const arrivesAt = Date.parse(transit.arrivesAt);
  if (!Number.isFinite(departedAtMs) || !Number.isFinite(arrivesAt) ||
      input.now < departedAtMs || input.now >= arrivesAt) {
    throw new Error('The shuttle has reached its destination; complete arrival before retargeting.');
  }
  const currentPosition = shuttlePositionAt(transit, input.now);
  const destinationPosition = fleetWorldPositionForShip(input.destinationShipId);
  if (!destinationPosition) throw new Error('The requested shuttle destination has no world position.');
  const departedAt = new Date(input.now).toISOString();
  return {
    ...transit,
    destinationShipId: input.destinationShipId,
    revision: transit.revision + 1,
    currentPosition,
    destinationPosition,
    velocity: velocityBetween(currentPosition, destinationPosition),
    departedAt,
    arrivesAt: new Date(input.now + SHUTTLE_TRANSIT_DURATION_MS).toISOString(),
  };
}
