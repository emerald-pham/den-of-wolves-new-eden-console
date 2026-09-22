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

/** One server-authored leg in the immutable route history. */
export interface ShuttleTransitLeg {
  readonly fromShipId: string;
  readonly toShipId: string;
  readonly originPosition: ShuttleWorldPoint;
  readonly destinationPosition: ShuttleWorldPoint;
  readonly departedAt: string;
  readonly arrivesAt: string;
}

export interface ShuttleTransitState extends Omit<ShuttleDepartureRequestState, 'status'> {
  readonly status: 'in-transit';
  readonly transitRequestId: string;
  readonly revision: number;
  /** Immutable timestamp of the original departure from originShipId. */
  readonly originDepartedAt: string;
  /** Server-authored chain of every leg, including the current leg anchor. */
  readonly routeLegs: readonly ShuttleTransitLeg[];
  readonly originPosition: ShuttleWorldPoint;
  readonly currentPosition: ShuttleWorldPoint;
  readonly destinationPosition: ShuttleWorldPoint;
  readonly velocity: ShuttleWorldPoint;
  readonly departedAt: string;
  readonly arrivesAt: string;
}

/** The only transit fields that may be placed in the member-readable document. */
export type ShuttleTransitPublicState = Omit<ShuttleTransitState,
  'originShipId' | 'originDepartedAt' | 'routeLegs' | 'originPosition'>;

/** Server-only integrity history for an in-flight shuttle. */
export interface ShuttleTransitChainState {
  readonly status: 'in-transit-chain';
  readonly shuttleId: string;
  readonly transitRequestId: string;
  readonly revision: number;
  readonly originShipId: string;
  readonly originDepartedAt: string;
  readonly originPosition: ShuttleWorldPoint;
  readonly routeLegs: readonly ShuttleTransitLeg[];
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

function pointsMatch(left: ShuttleWorldPoint, right: ShuttleWorldPoint): boolean {
  const coordinateMatches = (a: number, b: number) =>
    Math.abs(a - b) <= Number.EPSILON * Math.max(1, Math.abs(a), Math.abs(b)) * 16;
  return coordinateMatches(left.x, right.x) &&
    coordinateMatches(left.y, right.y) && coordinateMatches(left.z, right.z);
}

function positionAtLeg(leg: ShuttleTransitLeg, at: number): ShuttleWorldPoint {
  const departedAt = Date.parse(leg.departedAt);
  const arrivesAt = Date.parse(leg.arrivesAt);
  if (!Number.isFinite(departedAt) || !Number.isFinite(arrivesAt) || arrivesAt <= departedAt) {
    throw new Error('Shuttle transit leg timing is malformed.');
  }
  if (at <= departedAt) return leg.originPosition;
  if (at >= arrivesAt) return leg.destinationPosition;
  const elapsedSeconds = (at - departedAt) / 1_000;
  const velocity = velocityBetween(leg.originPosition, leg.destinationPosition);
  return {
    x: leg.originPosition.x + velocity.x * elapsedSeconds,
    y: leg.originPosition.y + velocity.y * elapsedSeconds,
    z: leg.originPosition.z + velocity.z * elapsedSeconds,
  };
}

function parseTransitLeg(value: unknown): ShuttleTransitLeg | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  const originPosition = point(raw.originPosition);
  const destinationPosition = point(raw.destinationPosition);
  if (Object.keys(raw).some((key) => ![
    'fromShipId', 'toShipId', 'originPosition', 'destinationPosition', 'departedAt', 'arrivesAt',
  ].includes(key)) || typeof raw.fromShipId !== 'string' || raw.fromShipId.length === 0 ||
      typeof raw.toShipId !== 'string' || raw.toShipId.length === 0 ||
      !originPosition || !destinationPosition || typeof raw.departedAt !== 'string' ||
      typeof raw.arrivesAt !== 'string' || !Number.isFinite(Date.parse(raw.departedAt)) ||
      !Number.isFinite(Date.parse(raw.arrivesAt)) ||
      Date.parse(raw.arrivesAt) - Date.parse(raw.departedAt) !== SHUTTLE_TRANSIT_DURATION_MS) {
    return null;
  }
  return {
    fromShipId: raw.fromShipId,
    toShipId: raw.toShipId,
    originPosition,
    destinationPosition,
    departedAt: raw.departedAt,
    arrivesAt: raw.arrivesAt,
  };
}

function initialTransitLeg(
  originShipId: string,
  destinationShipId: string,
  originPosition: ShuttleWorldPoint,
  destinationPosition: ShuttleWorldPoint,
  departedAt: string,
  arrivesAt: string,
): ShuttleTransitLeg {
  return {
    fromShipId: originShipId,
    toShipId: destinationShipId,
    originPosition,
    destinationPosition,
    departedAt,
    arrivesAt,
  };
}

/** Validate the full server-authored leg chain before deriving a position. */
export function isCanonicalShuttleTransitLeg(transit: ShuttleTransitState): boolean {
  const legs = Array.isArray(transit.routeLegs) ? transit.routeLegs : transit.revision === 1
    ? [initialTransitLeg(
      transit.originShipId, transit.destinationShipId, transit.originPosition,
      transit.destinationPosition, transit.departedAt, transit.arrivesAt,
    )]
    : null;
  const requestedAt = Date.parse(transit.requestedAt);
  const originDepartedAt = Date.parse(transit.originDepartedAt);
  const originPosition = fleetWorldPositionForShip(transit.originShipId);
  if (!legs || legs.length !== transit.revision || transit.revision < 1 ||
      !Number.isFinite(requestedAt) || !Number.isFinite(originDepartedAt) ||
      !originPosition || requestedAt > originDepartedAt ||
      !point(transit.currentPosition) || !point(transit.velocity) ||
      !point(transit.originPosition) || !point(transit.destinationPosition)) return false;

  let previous: ShuttleTransitLeg | undefined;
  for (const [index, leg] of legs.entries()) {
    const parsed = parseTransitLeg(leg);
    if (!parsed || !shuttleHostIsAllowed(transit.shuttleId, parsed.fromShipId) ||
        !shuttleHostIsAllowed(transit.shuttleId, parsed.toShipId) ||
        parsed.fromShipId === parsed.toShipId) return false;
    const departedAt = Date.parse(parsed.departedAt);
    const arrivesAt = Date.parse(parsed.arrivesAt);
    const destinationPosition = fleetWorldPositionForShip(parsed.toShipId);
    if (!destinationPosition || !pointsMatch(parsed.destinationPosition, destinationPosition) ||
        !Number.isFinite(departedAt) || !Number.isFinite(arrivesAt) ||
        arrivesAt - departedAt !== SHUTTLE_TRANSIT_DURATION_MS ||
        (previous !== undefined && (parsed.fromShipId !== previous.toShipId ||
          departedAt < Date.parse(previous.departedAt) || departedAt >= Date.parse(previous.arrivesAt) ||
          !pointsMatch(parsed.originPosition, positionAtLeg(previous, departedAt)))) ||
        (index === 0 && (parsed.fromShipId !== transit.originShipId ||
          departedAt !== originDepartedAt || !pointsMatch(parsed.originPosition, originPosition)))) {
      return false;
    }
    previous = parsed;
  }

  const last = previous;
  const first = legs[0];
  if (!last || !first || !pointsMatch(transit.originPosition, first.originPosition) ||
      transit.originShipId !== first.fromShipId || transit.destinationShipId !== last.toShipId ||
      !pointsMatch(transit.currentPosition, last.originPosition) ||
      !pointsMatch(transit.destinationPosition, last.destinationPosition) ||
      Date.parse(transit.departedAt) !== Date.parse(last.departedAt) ||
      Date.parse(transit.arrivesAt) !== Date.parse(last.arrivesAt) ||
      !pointsMatch(transit.velocity, velocityBetween(last.originPosition, last.destinationPosition))) {
    return false;
  }
  return true;
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
    'revision', 'originDepartedAt', 'routeLegs', 'originPosition', 'currentPosition', 'destinationPosition', 'velocity',
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
  const parsedRouteLegs = raw.routeLegs === undefined && revision === 1
    ? [initialTransitLeg(
      raw.originShipId as string, raw.destinationShipId as string, originPosition,
      destinationPosition, raw.departedAt as string, raw.arrivesAt as string,
    )]
    : Array.isArray(raw.routeLegs) ? raw.routeLegs.map(parseTransitLeg) : null;
  if (!parsedRouteLegs || parsedRouteLegs.some((leg) => leg === null)) return null;
  const transit = {
    ...raw,
    originDepartedAt,
    routeLegs: parsedRouteLegs,
  } as unknown as ShuttleTransitState;
  return isCanonicalShuttleTransitLeg(transit) ? transit : null;
}

/** Project a validated server transit into its member-readable current leg. */
export function toPublicShuttleTransit(transit: ShuttleTransitState): ShuttleTransitPublicState {
  const publicTransit = { ...transit } as Record<string, unknown>;
  delete publicTransit.originShipId;
  delete publicTransit.originDepartedAt;
  delete publicTransit.routeLegs;
  delete publicTransit.originPosition;
  return publicTransit as unknown as ShuttleTransitPublicState;
}

/** Project the immutable integrity history into its server-only document. */
export function toShuttleTransitChain(transit: ShuttleTransitState): ShuttleTransitChainState {
  return {
    status: 'in-transit-chain',
    shuttleId: transit.shuttleId,
    transitRequestId: transit.transitRequestId,
    revision: transit.revision,
    originShipId: transit.originShipId,
    originDepartedAt: transit.originDepartedAt,
    originPosition: transit.originPosition,
    routeLegs: transit.routeLegs,
  };
}

function isPublicTransitKey(key: string): boolean {
  return [
    'status', 'requestId', 'transitRequestId', 'shuttleId', 'holderUid', 'fleetGroupId',
    'destinationShipId', 'cycle', 'controlRevision', 'requestedAt',
    'revision', 'currentPosition', 'destinationPosition', 'velocity', 'departedAt', 'arrivesAt',
  ].includes(key);
}

/** Parse only the member-readable current-leg projection. */
export function parseShuttleTransitPublic(value: unknown, shuttleId: string): ShuttleTransitPublicState | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  const currentPosition = point(raw.currentPosition);
  const destinationPosition = point(raw.destinationPosition);
  const velocity = point(raw.velocity);
  const revision = raw.revision as number;
  if (Object.keys(raw).some((key) => !isPublicTransitKey(key)) || raw.status !== 'in-transit' ||
      raw.shuttleId !== shuttleId || typeof raw.requestId !== 'string' || raw.requestId.length === 0 ||
      typeof raw.transitRequestId !== 'string' || raw.transitRequestId.length === 0 ||
      typeof raw.holderUid !== 'string' || raw.holderUid.length === 0 ||
      typeof raw.fleetGroupId !== 'string' || raw.fleetGroupId.length === 0 ||
      typeof raw.destinationShipId !== 'string' ||
      !Number.isSafeInteger(raw.cycle) || (raw.cycle as number) < 1 ||
      !Number.isSafeInteger(raw.controlRevision) || (raw.controlRevision as number) < 0 ||
      !Number.isSafeInteger(revision) || revision < 1 ||
      typeof raw.requestedAt !== 'string' || !Number.isFinite(Date.parse(raw.requestedAt)) ||
      typeof raw.departedAt !== 'string' || typeof raw.arrivesAt !== 'string' ||
      !Number.isFinite(Date.parse(raw.departedAt)) || !Number.isFinite(Date.parse(raw.arrivesAt)) ||
      Date.parse(raw.arrivesAt) - Date.parse(raw.departedAt) !== SHUTTLE_TRANSIT_DURATION_MS ||
      !currentPosition || !destinationPosition || !velocity) return null;
  return {
    ...raw,
    currentPosition,
    destinationPosition,
    velocity,
  } as unknown as ShuttleTransitPublicState;
}

/** Parse the private chain and bind it to the exact public current-leg revision. */
export function parseShuttleTransitChain(
  value: unknown,
  transit: ShuttleTransitPublicState,
): ShuttleTransitChainState | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  if (Object.keys(raw).some((key) => ![
    'status', 'shuttleId', 'transitRequestId', 'revision', 'originShipId',
    'originDepartedAt', 'originPosition', 'routeLegs',
  ].includes(key)) || raw.status !== 'in-transit-chain' || raw.shuttleId !== transit.shuttleId ||
      raw.transitRequestId !== transit.transitRequestId || raw.revision !== transit.revision ||
      typeof raw.originShipId !== 'string' || typeof raw.originDepartedAt !== 'string' ||
      !Number.isFinite(Date.parse(raw.originDepartedAt))) return null;
  const originPosition = point(raw.originPosition);
  if (!originPosition || !Array.isArray(raw.routeLegs)) return null;
  const routeLegs = raw.routeLegs.map(parseTransitLeg);
  if (routeLegs.some((leg) => leg === null)) return null;
  const combined = parseShuttleTransit({
    ...transit, status: 'in-transit', originShipId: raw.originShipId as string,
    originDepartedAt: raw.originDepartedAt, originPosition,
    routeLegs,
  }, transit.shuttleId);
  if (!combined) return null;
  return {
    status: 'in-transit-chain', shuttleId: transit.shuttleId,
    transitRequestId: transit.transitRequestId, revision: transit.revision,
    originShipId: raw.originShipId as string, originDepartedAt: raw.originDepartedAt as string,
    originPosition, routeLegs: routeLegs as ShuttleTransitLeg[],
  };
}

/**
 * Hydrate server authority from a public current leg and its private chain.
 * A revision-one legacy public document may establish its chain on the first
 * authorized mutation; later revisions fail closed when the chain is absent.
 */
export function parseShuttleTransitAuthority(
  publicValue: unknown,
  chainValue: unknown,
  shuttleId: string,
): Readonly<{ transit: ShuttleTransitState; chain: ShuttleTransitChainState; legacyChain: boolean }> | null {
  const publicTransit = parseShuttleTransitPublic(publicValue, shuttleId);
  if (publicTransit) {
    if (chainValue !== undefined && chainValue !== null) {
      const chain = parseShuttleTransitChain(chainValue, publicTransit);
      if (!chain) return null;
      const transit = parseShuttleTransit({ ...publicTransit, ...chain, status: 'in-transit' }, shuttleId);
      return transit ? { transit, chain, legacyChain: false } : null;
    }
    return null;
  }

  // Prior releases wrote the private fields directly into the member document.
  // Accept only a revision-one legacy record so it can be migrated atomically.
  const legacy = parseShuttleTransit(publicValue, shuttleId);
  if (!legacy || legacy.revision !== 1 || (chainValue !== undefined && chainValue !== null)) return null;
  return { transit: legacy, chain: toShuttleTransitChain(legacy), legacyChain: true };
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
      routeLegs: [initialTransitLeg(
        departure.originShipId, departure.destinationShipId, originPosition,
        destinationPosition, departedAt, arrivesAt,
      )],
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
  if (!transit) {
    throw new Error('The stored shuttle transit motion state is malformed; refresh before retargeting.');
  }
  if (transit.transitRequestId !== input.expectedTransitRequestId ||
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
  const arrivesAtMs = Date.parse(transit.arrivesAt);
  if (!Number.isFinite(departedAtMs) || !Number.isFinite(arrivesAtMs) ||
      input.now < departedAtMs || input.now >= arrivesAtMs) {
    throw new Error('The shuttle has reached its destination; complete arrival before retargeting.');
  }
  const currentPosition = shuttlePositionAt(transit, input.now);
  const destinationPosition = fleetWorldPositionForShip(input.destinationShipId);
  if (!destinationPosition) throw new Error('The requested shuttle destination has no world position.');
  const departedAt = new Date(input.now).toISOString();
  const arrivesAt = new Date(input.now + SHUTTLE_TRANSIT_DURATION_MS).toISOString();
  const routeLegs = [...transit.routeLegs, {
    fromShipId: transit.destinationShipId,
    toShipId: input.destinationShipId,
    originPosition: currentPosition,
    destinationPosition,
    departedAt,
    arrivesAt,
  }];
  return {
    ...transit,
    destinationShipId: input.destinationShipId,
    revision: routeLegs.length,
    routeLegs,
    currentPosition,
    destinationPosition,
    velocity: velocityBetween(currentPosition, destinationPosition),
    departedAt,
    arrivesAt,
  };
}
