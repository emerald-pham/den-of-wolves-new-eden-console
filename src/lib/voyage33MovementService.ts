import { httpsCallable } from 'firebase/functions';
import { SHIPS } from '@/data/ships';
import { STAR_CHART_SYSTEMS } from '@/data/starChartTopology';
import { useSessionStore } from '@/store/useSessionStore';
import type { GameSession, Voyage33MaintenanceState, Voyage33MovementState } from '@/types/game';
import { jumpLengthBetween, type JumpLength, type JumpTransition } from '../../functions/src/jumpDrive';
import { parseVoyage33Admission, VOYAGE_33_ID } from '../../functions/src/voyageAdmission';
import { parseVoyage33MovementState } from '../../functions/src/voyage33Movement';
import {
  emptyVoyage33MaintenanceState,
  parseVoyage33MaintenanceState,
} from '../../functions/src/voyage33Maintenance';
import { voyage33JumpFuelCost } from '../../functions/src/voyage33Movement';
import { functions } from './firebase';
import { hasFreshSessionAuthority } from './sessionMutationAuthority';
import { phaseForSession, turnPhaseReadout } from './turnPhase';

type Action = 'dock' | 'jump';
type JumpStatus = 'jumped' | 'drive-failure' | 'integrity-locked' | 'integrity-lockout' | 'replayed';

interface Command {
  readonly action: Action;
  readonly sessionId: string;
  readonly uid: string;
  readonly instanceId: string;
  readonly hostShipId: string;
  readonly expectedMovementRevision: number;
  readonly expectedDockingRevision: number;
  readonly destination?: string;
  readonly origin: string | null;
  readonly jumpLength: JumpLength | null;
  readonly expectedFuel: number | null;
  readonly requestId: string;
}

export interface Voyage33MovementStaleReceipt {
  readonly status: 'stale';
  readonly currentMovementRevision: number;
  readonly currentDockingRevision: number;
}

export type Voyage33MovementReceipt =
  | Readonly<{ status: 'committed' | 'replayed'; movementState: Voyage33MovementState; maintenanceState: Voyage33MaintenanceState }>
  | Readonly<{
    status: JumpStatus;
    movementState: Voyage33MovementState;
    maintenanceState: Voyage33MaintenanceState;
    fuelSpent?: number;
    transition?: JumpTransition;
  }>
  | Voyage33MovementStaleReceipt;

interface Attempt {
  readonly command: Command;
  readonly signature: string;
}

export class Voyage33MovementUncertainError extends Error {
  constructor(readonly attempt: Readonly<Command>, message?: string) {
    super(message ?? 'The Voyage 33-0 result is uncertain. Retry the exact action while the same GM instance and live session context remain active.');
    this.name = 'Voyage33MovementUncertainError';
  }
}

export class Voyage33MovementRejectedError extends Error {
  constructor(readonly attempt: Readonly<Command>, cause: unknown) {
    super(cause instanceof Error ? cause.message : 'The Voyage 33-0 movement request was rejected.');
    this.name = 'Voyage33MovementRejectedError';
  }
}

const pendingAttempts = new Map<string, Attempt>();
const inFlightAttempts = new Map<string, Promise<Voyage33MovementReceipt>>();
const UNCERTAIN_CODES = new Set(['cancelled', 'deadline-exceeded', 'internal', 'unknown', 'unavailable']);
const REJECTED_CODES = new Set([
  'aborted', 'already-exists', 'failed-precondition', 'invalid-argument', 'not-found',
  'out-of-range', 'permission-denied', 'resource-exhausted', 'unauthenticated', 'unimplemented',
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function safeRevision(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value <= Number.MAX_SAFE_INTEGER;
}

function hasExactKeys(value: Record<string, unknown>, required: readonly string[], optional: readonly string[] = []): boolean {
  const allowed = new Set([...required, ...optional]);
  return required.every((key) => Object.prototype.hasOwnProperty.call(value, key)) &&
    Object.keys(value).every((key) => allowed.has(key));
}

function assertLiveAuthority(sessionId?: string, uid?: string, instanceId?: string): void {
  const state = useSessionStore.getState();
  const session = state.session;
  const me = state.me;
  const instance = state.gmInstance;
  if (typeof window === 'undefined' || !window.navigator.onLine || !hasFreshSessionAuthority()) {
    throw new Error('Reconnect until the live session state returns before changing gameplay.');
  }
  if (!session || !me || me.role !== 'gm' || me.sessionId !== session.id ||
      !instance || instance.sessionId !== session.id || instance.uid !== me.uid ||
      sessionId !== undefined && session.id !== sessionId ||
      uid !== undefined && me.uid !== uid ||
      instanceId !== undefined && instance.id !== instanceId) {
    throw new Error('Only the current authenticated GM instance may control Voyage 33-0 movement.');
  }
}

function resolvePhase(session: GameSession, action: Action): number {
  if (session.phase !== 'active' || session.singlePlayerDemo != null) {
    throw new Error('Voyage 33-0 movement requires an active multiplayer session.');
  }
  const turn = session.currentTurn;
  const phase = phaseForSession(session);
  const readout = turnPhaseReadout(phase);
  if (!Number.isSafeInteger(turn) || (turn ?? 0) < 1 || !phase || !readout) {
    throw new Error('The current server phase is unavailable. Refresh before moving Voyage 33-0.');
  }
  if (phase.timerPause) {
    throw new Error('Voyage 33-0 movement is paused until the facilitator resumes the cycle.');
  }
  const wanted = action === 'dock' ? 'team' : 'open';
  if (readout.kind !== wanted) {
    throw new Error(action === 'dock'
      ? 'Voyage 33-0 host docking is available during Team Phase.'
      : 'Voyage 33-0 movement is available during Coordination Phase.');
  }
  return turn!;
}

function movementStateFor(session: GameSession): Voyage33MovementState | undefined {
  if (session.voyage33Movement === undefined) return undefined;
  const movement = parseVoyage33MovementState(session.voyage33Movement);
  if (!movement) throw new Error('The current Voyage 33-0 movement projection is malformed. Refresh before proceeding.');
  return movement;
}

function maintenanceStateFor(session: GameSession): Voyage33MaintenanceState {
  if (session.voyage33Maintenance === undefined) return emptyVoyage33MaintenanceState();
  const maintenance = parseVoyage33MaintenanceState(session.voyage33Maintenance);
  if (!maintenance) throw new Error('The current Voyage 33-0 host projection is malformed. Refresh before proceeding.');
  return maintenance;
}

function capture(action: Action, value: string): Omit<Command, 'requestId'> {
  assertLiveAuthority();
  const { session, me, gmInstance } = useSessionStore.getState();
  if (!session || !me || !gmInstance) throw new Error('A current GM session is required.');
  if (!parseVoyage33Admission(session.voyage33Admission, session.id) ||
      !session.admittedVesselIds?.includes(VOYAGE_33_ID)) {
    throw new Error('Voyage 33-0 must be admitted in the current session before movement.');
  }
  const turn = resolvePhase(session, action);
  const movement = movementStateFor(session);
  const maintenance = maintenanceStateFor(session);
  if (maintenance.dockingRevision === Number.MAX_SAFE_INTEGER) {
    throw new Error('Voyage 33-0 docking revision is exhausted. Refresh before proceeding.');
  }
  const active = session.activeVesselIds;
  if (!Array.isArray(active) || active.length === 0 || active.includes(VOYAGE_33_ID) ||
      new Set(active).size !== active.length) {
    throw new Error('The current core-vessel roster is unavailable. Refresh before proceeding.');
  }
  const hostShipId = action === 'dock' ? value : maintenance.hostShipId;
  if (typeof hostShipId !== 'string' || !SHIPS.some((ship) => ship.id === hostShipId) ||
      !active.includes(hostShipId)) {
    throw new Error('Choose an active core vessel as the Voyage 33-0 host.');
  }
  if (action === 'dock' && maintenance.hostShipId !== null) {
    throw new Error('Voyage 33-0 already has a host assigned. Refresh before docking again.');
  }
  if (action === 'jump' && maintenance.hostShipId !== hostShipId) {
    throw new Error('Voyage 33-0 is no longer docked with the current host. Refresh before moving.');
  }
  const hostCoordinate = session.shipGalacticCoordinates?.[hostShipId];
  if (typeof hostCoordinate !== 'string' || !/^\d{4}$/.test(hostCoordinate)) {
    throw new Error('The selected host has no current server-projected star-chart position.');
  }
  const damage = session.shipDamage?.[hostShipId];
  if (damage && (damage.destroyed !== false || !Array.isArray(damage.damagedSystemIds))) {
    throw new Error('Voyage 33-0 requires a live core-vessel host with a current damage projection.');
  }
  const projectedCoordinates = new Set(Object.entries(session.organiserSystems ?? {})
    .filter(([nodeId, coordinate]) =>
      STAR_CHART_SYSTEMS.some((system) => system.id === nodeId) && typeof coordinate === 'string')
    .map(([, coordinate]) => coordinate));
  if (!projectedCoordinates.has(hostCoordinate)) {
    throw new Error('The current host position is not present in the facilitator navigation projection.');
  }
  if (movement && action === 'dock' && movement.coordinate !== hostCoordinate) {
    throw new Error('Voyage 33-0 can only dock with a host at its current location.');
  }
  if (movement && action === 'jump' && movement.coordinate !== hostCoordinate) {
    throw new Error('Voyage 33-0 and its host must share the current projected location.');
  }

  let destination: string | undefined;
  let jumpLength: JumpLength | null = null;
  let expectedFuel: number | null = null;
  if (action === 'jump') {
    if (!movement) throw new Error('Voyage 33-0 must dock before it can jump.');
    if (movement.jumpState.lastJumpTurn === turn) throw new Error('Voyage 33-0 has already jumped this cycle.');
    destination = value;
    if (!/^\d{4}$/.test(destination) || !projectedCoordinates.has(destination)) {
      throw new Error('Choose a destination in the current facilitator navigation projection.');
    }
    jumpLength = jumpLengthBetween(movement.coordinate, destination);
    if (!jumpLength) throw new Error('Choose a legal destination from the current Voyage 33-0 location.');
    const fuel = session.shipResources?.[hostShipId]?.fuel;
    if (!Number.isSafeInteger(fuel) || (fuel ?? -1) < 0) {
      throw new Error('The current host fuel projection is unavailable. Refresh before departure.');
    }
    expectedFuel = voyage33JumpFuelCost(jumpLength);
    if (fuel! < expectedFuel) throw new Error('The docked host does not have enough fuel for this Voyage 33-0 jump.');
  }
  return {
    action, sessionId: session.id, uid: me.uid, instanceId: gmInstance.id, hostShipId,
    expectedMovementRevision: movement?.revision ?? 0,
    expectedDockingRevision: maintenance.dockingRevision,
    ...(destination ? { destination } : {}),
    origin: movement?.coordinate ?? null,
    jumpLength,
    expectedFuel,
  };
}

function signature(command: Omit<Command, 'requestId'>): string {
  return JSON.stringify([
    command.action, command.sessionId, command.uid, command.instanceId, command.hostShipId,
    command.expectedMovementRevision, command.expectedDockingRevision, command.destination ?? null,
  ]);
}

function requestId(): string {
  const candidate = typeof globalThis.crypto?.randomUUID === 'function'
    ? globalThis.crypto.randomUUID()
    : `voyage-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return candidate.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 128);
}

function attemptFor(command: Omit<Command, 'requestId'>): Attempt {
  const key = signature(command);
  const existing = pendingAttempts.get(key);
  if (existing) return existing;
  const attempt = { command: { ...command, requestId: requestId() }, signature: key };
  pendingAttempts.set(key, attempt);
  return attempt;
}

function matches(value: Record<string, unknown>, command: Command): boolean {
  return value.sessionId === command.sessionId && value.requestId === command.requestId &&
    value.shipId === VOYAGE_33_ID;
}

function staleReceipt(value: Record<string, unknown>, command: Command): Voyage33MovementStaleReceipt {
  const keys = [
    'status', 'sessionId', 'requestId', 'shipId', 'expectedMovementRevision',
    'currentMovementRevision', 'expectedDockingRevision', 'currentDockingRevision',
  ];
  if (!hasExactKeys(value, keys) || !matches(value, command) || value.status !== 'stale' ||
      value.expectedMovementRevision !== command.expectedMovementRevision ||
      value.expectedDockingRevision !== command.expectedDockingRevision ||
      !safeRevision(value.currentMovementRevision) || !safeRevision(value.currentDockingRevision) ||
      value.currentMovementRevision === command.expectedMovementRevision &&
        value.currentDockingRevision === command.expectedDockingRevision) {
    throw new Error('The Voyage 33-0 stale receipt was malformed.');
  }
  return {
    status: 'stale',
    currentMovementRevision: value.currentMovementRevision as number,
    currentDockingRevision: value.currentDockingRevision as number,
  };
}

function dockReceipt(value: Record<string, unknown>, command: Command): Voyage33MovementReceipt {
  const keys = [
    'status', 'sessionId', 'requestId', 'shipId', 'hostShipId', 'expectedMovementRevision',
    'committedMovementRevision', 'expectedDockingRevision', 'currentDockingRevision',
    'movementState', 'maintenanceState',
  ];
  const movementState = parseVoyage33MovementState(value.movementState);
  const maintenanceState = parseVoyage33MaintenanceState(value.maintenanceState);
  if (!hasExactKeys(value, keys) || !matches(value, command) ||
      value.status !== 'committed' && value.status !== 'replayed' ||
      value.hostShipId !== command.hostShipId ||
      value.expectedMovementRevision !== command.expectedMovementRevision ||
      value.expectedDockingRevision !== command.expectedDockingRevision ||
      !safeRevision(value.committedMovementRevision) || !safeRevision(value.currentDockingRevision) ||
      !movementState || !maintenanceState ||
      movementState.revision !== value.committedMovementRevision ||
      movementState.revision !== command.expectedMovementRevision ||
      maintenanceState.hostShipId !== command.hostShipId ||
      maintenanceState.dockingRevision !== value.currentDockingRevision ||
      value.currentDockingRevision !== command.expectedDockingRevision + 1 ||
      command.origin !== null && movementState.coordinate !== command.origin) {
    throw new Error('The Voyage 33-0 docking receipt was malformed.');
  }
  return { status: value.status, movementState, maintenanceState };
}

function validTransition(value: unknown, command: Command): value is JumpTransition {
  return isRecord(value) && hasExactKeys(value, ['id', 'shipId', 'origin', 'destination', 'occurredAt']) &&
    typeof value.id === 'string' && value.id.length > 0 && value.shipId === VOYAGE_33_ID &&
    value.origin === command.origin && value.destination === command.destination &&
    typeof value.occurredAt === 'string' && Number.isFinite(Date.parse(value.occurredAt));
}

function jumpReceipt(value: Record<string, unknown>, command: Command): Voyage33MovementReceipt {
  const baseKeys = [
    'status', 'sessionId', 'requestId', 'shipId', 'previousHostShipId',
    'expectedMovementRevision', 'committedMovementRevision', 'expectedDockingRevision',
    'currentDockingRevision', 'movementState', 'maintenanceState',
  ];
  const successful = value.status === 'jumped' || value.status === 'replayed' && value.transition !== undefined;
  const optional = successful ? ['transition', 'fuelSpent'] : [];
  const allowed = value.status === 'jumped' || value.status === 'drive-failure' ||
    value.status === 'integrity-locked' || value.status === 'integrity-lockout' || value.status === 'replayed';
  const movementState = parseVoyage33MovementState(value.movementState);
  const maintenanceState = parseVoyage33MaintenanceState(value.maintenanceState);
  if (!hasExactKeys(value, baseKeys, optional) || !matches(value, command) || !allowed ||
      value.previousHostShipId !== command.hostShipId ||
      value.expectedMovementRevision !== command.expectedMovementRevision ||
      value.expectedDockingRevision !== command.expectedDockingRevision ||
      !safeRevision(value.committedMovementRevision) || !safeRevision(value.currentDockingRevision) ||
      !movementState || !maintenanceState || !command.origin || !command.destination ||
      movementState.revision !== value.committedMovementRevision ||
      (successful
        ? movementState.revision !== command.expectedMovementRevision + 1 ||
          movementState.coordinate !== command.destination ||
          maintenanceState.hostShipId !== null ||
          value.currentDockingRevision !== command.expectedDockingRevision + 1 ||
          value.fuelSpent !== command.expectedFuel ||
          !safeRevision(value.fuelSpent) || !validTransition(value.transition, command)
        : movementState.revision !== command.expectedMovementRevision ||
          movementState.coordinate !== command.origin ||
          maintenanceState.hostShipId !== command.hostShipId ||
          value.currentDockingRevision !== command.expectedDockingRevision)) {
    throw new Error('The Voyage 33-0 jump receipt was malformed.');
  }
  return {
    status: value.status as JumpStatus,
    movementState,
    maintenanceState,
    ...(successful ? {
      fuelSpent: value.fuelSpent as number,
      transition: value.transition as JumpTransition,
    } : {}),
  };
}

function parseReceipt(value: unknown, command: Command): Voyage33MovementReceipt {
  if (!isRecord(value) || !matches(value, command)) throw new Error('The Voyage 33-0 movement response was malformed.');
  if (value.status === 'stale') return staleReceipt(value, command);
  return command.action === 'dock' ? dockReceipt(value, command) : jumpReceipt(value, command);
}

function errorCode(cause: unknown): string | undefined {
  return isRecord(cause) && typeof cause.code === 'string' ? cause.code.replace(/^functions\//, '') : undefined;
}

function confirmedRejection(cause: unknown): boolean {
  const code = errorCode(cause);
  if (code && REJECTED_CODES.has(code)) return true;
  return Boolean(code && UNCERTAIN_CODES.has(code) && isRecord(cause) &&
    (cause.kind !== undefined || cause.details !== undefined ||
      isRecord(cause.customData) && cause.customData.serverResponse !== undefined));
}

async function send(attempt: Attempt): Promise<Voyage33MovementReceipt> {
  const command = attempt.command;
  assertLiveAuthority(command.sessionId, command.uid, command.instanceId);
  const payload = {
    sessionId: command.sessionId,
    shipId: VOYAGE_33_ID,
    hostShipId: command.hostShipId,
    ...(command.destination ? { destination: command.destination } : {}),
    instanceId: command.instanceId,
    requestId: command.requestId,
    expectedMovementRevision: command.expectedMovementRevision,
    expectedDockingRevision: command.expectedDockingRevision,
  };
  let response: { readonly data: unknown };
  try {
    response = await httpsCallable<typeof payload, unknown>(
      functions(), command.action === 'dock' ? 'dockVoyage33' : 'jumpVoyage33',
    )(payload);
  } catch (cause) {
    if (confirmedRejection(cause)) {
      pendingAttempts.delete(attempt.signature);
      throw new Voyage33MovementRejectedError(command, cause);
    }
    throw new Voyage33MovementUncertainError(command);
  }
  try {
    assertLiveAuthority(command.sessionId, command.uid, command.instanceId);
  } catch {
    throw new Voyage33MovementUncertainError(
      command,
      'The GM instance or live session context changed while the request was pending. Restore the same context and retry the exact action.',
    );
  }
  try {
    const receipt = parseReceipt(response.data, command);
    pendingAttempts.delete(attempt.signature);
    return receipt;
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : 'The Voyage 33-0 response was malformed.';
    throw new Voyage33MovementUncertainError(
      command,
      `${message} The server outcome is unconfirmed; retry the exact action while the same GM instance remains active.`,
    );
  }
}

function run(command: Omit<Command, 'requestId'>): Promise<Voyage33MovementReceipt> {
  const attempt = attemptFor(command);
  const inFlight = inFlightAttempts.get(attempt.signature);
  if (inFlight) return inFlight;
  const pending = send(attempt);
  inFlightAttempts.set(attempt.signature, pending);
  return pending.finally(() => {
    if (inFlightAttempts.get(attempt.signature) === pending) inFlightAttempts.delete(attempt.signature);
  });
}

export async function dockVoyage33Movement(hostShipId: string): Promise<Voyage33MovementReceipt> {
  return run(capture('dock', hostShipId));
}

export async function jumpVoyage33Movement(destination: string): Promise<Voyage33MovementReceipt> {
  return run(capture('jump', destination));
}
