import {
  jumpFuelCost,
  jumpLengthBetween,
  type JumpAttemptResult,
  type JumpDriveState,
  type JumpLength,
  type JumpTransition,
} from './jumpDrive';
import { VOYAGE_33_ID, parseVoyage33Admission } from './voyageAdmission';
import {
  parseVoyage33MaintenanceState,
  type Voyage33MaintenanceState,
} from './voyage33Maintenance';
import { SHIP_DAMAGE_DECKS, type ShipDamageState } from './shipDamage';
import { isResourceShipId, type ShipResourceInventory } from './resources';
import { neighborsForCoordinate } from './starChartGraph';

/** Voyage 33-0 moves independently while using an active core ship as its host. */
export interface Voyage33MovementState {
  readonly id: typeof VOYAGE_33_ID;
  readonly coordinate: string;
  readonly revision: number;
  readonly jumpState: JumpDriveState;
}

export type Voyage33MovementResult =
  | {
    readonly status: 'jumped';
    readonly movementState: Voyage33MovementState;
    readonly maintenanceState: Voyage33MaintenanceState;
    readonly hostResources: ShipResourceInventory;
    readonly transition: JumpTransition;
  }
  | {
    readonly status: Exclude<JumpAttemptResult['status'], 'jumped'>;
    readonly movementState: Voyage33MovementState;
    readonly maintenanceState: Voyage33MaintenanceState;
    readonly hostResources: ShipResourceInventory;
  };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isSafeNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function hasOnlyKeys(value: Record<string, unknown>, allowed: readonly string[]): boolean {
  return Object.keys(value).every((key) => allowed.includes(key));
}

function parseJumpState(value: unknown): JumpDriveState | undefined {
  if (!isRecord(value) || !hasOnlyKeys(value, [
    'lastJumpTurn', 'integrityLockedUntil', 'emergencyJumpUsed', 'lastFailureRequestId',
  ])) return undefined;
  if (value.lastJumpTurn !== undefined && !isSafeNonNegativeInteger(value.lastJumpTurn)) return undefined;
  if (value.integrityLockedUntil !== undefined &&
      (typeof value.integrityLockedUntil !== 'string' || !Number.isFinite(Date.parse(value.integrityLockedUntil)))) {
    return undefined;
  }
  if (value.emergencyJumpUsed !== undefined && typeof value.emergencyJumpUsed !== 'boolean') return undefined;
  if (value.lastFailureRequestId !== undefined &&
      (typeof value.lastFailureRequestId !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(value.lastFailureRequestId))) {
    return undefined;
  }
  return {
    ...(value.lastJumpTurn === undefined ? {} : { lastJumpTurn: value.lastJumpTurn as number }),
    ...(value.integrityLockedUntil === undefined ? {} : { integrityLockedUntil: value.integrityLockedUntil as string }),
    ...(value.emergencyJumpUsed === undefined ? {} : { emergencyJumpUsed: value.emergencyJumpUsed as boolean }),
    ...(value.lastFailureRequestId === undefined ? {} : { lastFailureRequestId: value.lastFailureRequestId as string }),
  };
}

export function parseVoyage33MovementState(value: unknown): Voyage33MovementState | undefined {
  if (!isRecord(value) || !hasOnlyKeys(value, ['id', 'coordinate', 'revision', 'jumpState']) ||
      value.id !== VOYAGE_33_ID || typeof value.coordinate !== 'string' ||
      !neighborsForCoordinate(value.coordinate) || !isSafeNonNegativeInteger(value.revision) ||
      value.revision === Number.MAX_SAFE_INTEGER) return undefined;
  const jumpState = parseJumpState(value.jumpState);
  if (!jumpState) return undefined;
  return {
    id: VOYAGE_33_ID,
    coordinate: value.coordinate,
    revision: value.revision,
    jumpState,
  };
}

/** Member-safe movement view; an unadmitted vessel has no public movement state. */
export function publicVoyage33MovementState(
  value: unknown,
  admission: unknown,
  sessionId: string,
): Voyage33MovementState | undefined {
  if (!parseVoyage33Admission(admission, sessionId)) return undefined;
  return parseVoyage33MovementState(value);
}

function requireMaintenanceState(value: unknown): Voyage33MaintenanceState {
  const state = parseVoyage33MaintenanceState(value);
  if (!state) throw new Error('Malformed Voyage 33-0 maintenance state.');
  return state;
}

function requireActiveAdmission(value: unknown, sessionId: string): void {
  if (!parseVoyage33Admission(value, sessionId)) {
    throw new Error('Voyage 33-0 must be admitted in this session.');
  }
}

function requireActiveVesselRoster(value: unknown): readonly string[] {
  if (!Array.isArray(value) || value.length === 0 || new Set(value).size !== value.length ||
      value.some((shipId) => typeof shipId !== 'string' || !isResourceShipId(shipId)) ||
      value.includes(VOYAGE_33_ID)) {
    throw new Error('Voyage 33-0 must remain separate from the active core-vessel roster.');
  }
  return value as string[];
}

function requireLiveHostDamage(shipId: string, value: unknown): ShipDamageState {
  const deck = SHIP_DAMAGE_DECKS[shipId];
  if (!deck || !isRecord(value) || !hasOnlyKeys(value, ['damagedSystemIds', 'destroyed']) ||
      value.destroyed !== false || !Array.isArray(value.damagedSystemIds)) {
    throw new Error('Voyage 33-0 requires a live core-vessel host.');
  }
  const knownSystemIds = new Set(deck.map(({ systemId }) => systemId));
  if (value.damagedSystemIds.some((systemId) => typeof systemId !== 'string' || !knownSystemIds.has(systemId)) ||
      new Set(value.damagedSystemIds).size !== value.damagedSystemIds.length) {
    throw new Error('The host damage state is malformed.');
  }
  return { damagedSystemIds: [...value.damagedSystemIds], destroyed: false };
}

function requireHostResources(value: unknown): ShipResourceInventory {
  const allowedKeys = ['ore', 'fuel', 'food', 'water', 'materials', 'securityTeams', 'scrap'];
  if (!isRecord(value) || !hasOnlyKeys(value, allowedKeys) ||
      !['ore', 'fuel', 'food', 'water', 'materials', 'securityTeams'].every((key) =>
        isSafeNonNegativeInteger(value[key])) ||
      (value.scrap !== undefined && !isSafeNonNegativeInteger(value.scrap))) {
    throw new Error('Voyage 33-0 requires a valid host resource ledger.');
  }
  return {
    ore: value.ore as number,
    fuel: value.fuel as number,
    food: value.food as number,
    water: value.water as number,
    materials: value.materials as number,
    securityTeams: value.securityTeams as number,
    ...(value.scrap === undefined ? {} : { scrap: value.scrap as number }),
  };
}

function requireSessionId(value: unknown): asserts value is string {
  if (typeof value !== 'string' || value.length === 0) throw new Error('A current session is required.');
}

function requireExpectedRevision(expected: unknown, current: number, label: string): void {
  if (!isSafeNonNegativeInteger(expected) || expected !== current || current === Number.MAX_SAFE_INTEGER) {
    throw new Error(`${label} changed. Refresh before proceeding.`);
  }
}

export function emptyVoyage33MovementState(coordinate: string): Voyage33MovementState {
  if (typeof coordinate !== 'string' || !neighborsForCoordinate(coordinate)) {
    throw new Error('Voyage 33-0 must start at a printed star-chart system.');
  }
  return { id: VOYAGE_33_ID, coordinate, revision: 0, jumpState: {} };
}

/** Printed Voyage 33-0 host-fuel costs; the shared drive resolver remains common. */
export function voyage33JumpFuelCost(length: JumpLength): number {
  if (length !== 'short' && length !== 'medium' && length !== 'long') {
    throw new Error('Voyage 33-0 jump length is invalid.');
  }
  return jumpFuelCost(VOYAGE_33_ID, length, false);
}

/** Assign or replace the docked host during Team without adding Voyage to core roster. */
export function dockVoyage33(input: Readonly<{
  sessionId: string;
  admission: unknown;
  phase: string;
  maintenanceState: unknown;
  expectedDockingRevision: number;
  movementState: unknown;
  hostShipId: string;
  hostCoordinate: string;
  hostDamage: unknown;
  activeVesselIds: readonly string[];
}>): Voyage33MaintenanceState {
  requireSessionId(input.sessionId);
  requireActiveAdmission(input.admission, input.sessionId);
  if (input.phase !== 'team') throw new Error('Voyage 33-0 can only select a host during Team Phase.');
  const state = requireMaintenanceState(input.maintenanceState);
  requireExpectedRevision(input.expectedDockingRevision, state.dockingRevision, 'Voyage 33-0 docking');
  if (state.hostShipId !== null) throw new Error('Voyage 33-0 is already docked with a host.');
  const movementState = parseVoyage33MovementState(input.movementState);
  if (!movementState) throw new Error('Malformed Voyage 33-0 movement state.');
  const activeVesselIds = requireActiveVesselRoster(input.activeVesselIds);
  if (typeof input.hostShipId !== 'string' || !isResourceShipId(input.hostShipId) ||
      !activeVesselIds.includes(input.hostShipId)) {
    throw new Error('Choose an active core vessel that can host resources.');
  }
  requireLiveHostDamage(input.hostShipId, input.hostDamage);
  if (input.hostCoordinate !== movementState.coordinate || !neighborsForCoordinate(input.hostCoordinate)) {
    throw new Error('Voyage 33-0 must dock at the host vessel’s current system.');
  }
  return { ...state, hostShipId: input.hostShipId, dockingRevision: state.dockingRevision + 1 };
}

function requireJumpAttempt(value: unknown, origin: string): {
  readonly result: JumpAttemptResult;
  readonly state: JumpDriveState;
  readonly length: JumpLength | null;
} {
  if (!isRecord(value) ||
      (value.status !== 'integrity-locked' && value.status !== 'integrity-lockout' &&
        value.status !== 'drive-failure' && value.status !== 'jumped') ||
      value.origin !== origin || typeof value.destination !== 'string' || !/^\d{4}$/.test(value.destination)) {
    throw new Error('The common jump result does not match a Voyage 33-0 attempt.');
  }
  const expectedKeys = value.status === 'jumped'
    ? ['status', 'origin', 'destination', 'length', 'fuelCost', 'remainingFuel', 'state', 'transition']
    : value.status === 'integrity-locked' || value.status === 'integrity-lockout'
      ? ['status', 'origin', 'destination', 'integrityLockedUntil', 'state']
      : ['status', 'origin', 'destination', 'state'];
  if (Object.keys(value).length !== expectedKeys.length || Object.keys(value).some((key) => !expectedKeys.includes(key))) {
    throw new Error('The common jump result has an unexpected shape.');
  }
  const state = parseJumpState(value.state);
  if (!state) throw new Error('The common jump result has malformed Jump Drive state.');
  if ((value.status === 'integrity-locked' || value.status === 'integrity-lockout') &&
      (typeof value.integrityLockedUntil !== 'string' ||
        !Number.isFinite(Date.parse(value.integrityLockedUntil)) ||
        state.integrityLockedUntil !== value.integrityLockedUntil)) {
    throw new Error('The common jump result has a malformed integrity lockout.');
  }
  const length = jumpLengthBetween(origin, value.destination);
  if (!length && value.status !== 'integrity-locked' && value.status !== 'integrity-lockout') {
    throw new Error('The common jump result does not match a printed Voyage 33-0 route.');
  }
  return { result: value as unknown as JumpAttemptResult, state, length };
}

/**
 * Apply the already-resolved common Jump Drive result to Voyage position and
 * host fuel. The caller must run this in the same transaction as the jump
 * attempt and persist every returned authority value atomically.
 */
export function resolveVoyage33JumpCommit(input: Readonly<{
  sessionId: string;
  admission: unknown;
  phase: string;
  currentTurn: number;
  movementState: unknown;
  expectedMovementRevision: number;
  maintenanceState: unknown;
  expectedDockingRevision: number;
  activeVesselIds: readonly string[];
  hostShipId: string;
  hostCoordinate: string;
  hostDamage: unknown;
  hostResources: unknown;
  jumpResult: JumpAttemptResult;
}>): Voyage33MovementResult {
  requireSessionId(input.sessionId);
  requireActiveAdmission(input.admission, input.sessionId);
  if (input.phase !== 'coordination') throw new Error('Voyage 33-0 can only jump during Coordination Phase.');
  if (!isSafeNonNegativeInteger(input.currentTurn)) throw new Error('The current cycle is malformed.');
  const movementState = parseVoyage33MovementState(input.movementState);
  if (!movementState) throw new Error('Malformed Voyage 33-0 movement state.');
  requireExpectedRevision(input.expectedMovementRevision, movementState.revision, 'Voyage 33-0 movement');
  if (movementState.jumpState.lastJumpTurn === input.currentTurn) {
    throw new Error('Voyage 33-0 has already jumped this cycle.');
  }
  const maintenanceState = requireMaintenanceState(input.maintenanceState);
  requireExpectedRevision(input.expectedDockingRevision, maintenanceState.dockingRevision, 'Voyage 33-0 docking');
  if (typeof input.hostShipId !== 'string' || !isResourceShipId(input.hostShipId) ||
      maintenanceState.hostShipId !== input.hostShipId) {
    throw new Error('Voyage 33-0 must be docked with the selected active core-vessel host.');
  }
  const activeVesselIds = requireActiveVesselRoster(input.activeVesselIds);
  if (!activeVesselIds.includes(input.hostShipId)) throw new Error('The Voyage host is no longer active.');
  requireLiveHostDamage(input.hostShipId, input.hostDamage);
  if (input.hostCoordinate !== movementState.coordinate || !neighborsForCoordinate(input.hostCoordinate)) {
    throw new Error('Voyage 33-0 and its host must occupy the same current system before departure.');
  }
  const hostResources = requireHostResources(input.hostResources);
  const { result, state: resultJumpState, length: jumpLength } =
    requireJumpAttempt(input.jumpResult, movementState.coordinate);

  if (result.status !== 'jumped') {
    if (resultJumpState.lastJumpTurn !== movementState.jumpState.lastJumpTurn ||
        resultJumpState.emergencyJumpUsed !== movementState.jumpState.emergencyJumpUsed ||
        resultJumpState.lastFailureRequestId !== movementState.jumpState.lastFailureRequestId ||
        (result.status !== 'integrity-lockout' &&
          resultJumpState.integrityLockedUntil !== movementState.jumpState.integrityLockedUntil)) {
      throw new Error('A failed jump attempt cannot change Voyage 33-0 movement history.');
    }
    return {
      status: result.status,
      movementState: { ...movementState, jumpState: resultJumpState },
      maintenanceState,
      hostResources,
    };
  }

  if (!jumpLength) throw new Error('The common jump result has no valid Voyage 33-0 route.');
  const expectedFuelCost = voyage33JumpFuelCost(jumpLength);
  const expectedRemainingFuel = hostResources.fuel - expectedFuelCost;
  const transition = result.transition;
  if (result.length !== jumpLength || result.fuelCost !== expectedFuelCost || expectedRemainingFuel < 0 ||
      result.remainingFuel !== expectedRemainingFuel ||
      resultJumpState.lastJumpTurn !== input.currentTurn || !isRecord(transition) ||
      typeof transition.id !== 'string' || transition.id.length === 0 ||
      transition.shipId !== VOYAGE_33_ID || transition.origin !== movementState.coordinate ||
      transition.destination !== result.destination || typeof transition.occurredAt !== 'string' ||
      !Number.isFinite(Date.parse(transition.occurredAt))) {
    throw new Error('The common jump result does not match Voyage 33-0 movement and host-fuel rules.');
  }

  return {
    status: 'jumped',
    movementState: {
      id: VOYAGE_33_ID,
      coordinate: result.destination,
      revision: movementState.revision + 1,
      jumpState: resultJumpState,
    },
    maintenanceState: {
      ...maintenanceState,
      hostShipId: null,
      dockingRevision: maintenanceState.dockingRevision + 1,
    },
    hostResources: { ...hostResources, fuel: expectedRemainingFuel },
    transition: transition as JumpTransition,
  };
}
