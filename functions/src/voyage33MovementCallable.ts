import { HttpsError } from 'firebase-functions/v2/https';
import type { Firestore, Transaction } from 'firebase-admin/firestore';
import { commandReceiptDisposition, type CommandFingerprint } from './commandIdempotency';
import { decideActionAuthorization, phaseFromTurnPhase } from './actionMetadata';
import { resolveJumpAttempt, type JumpAttemptResult } from './jumpDrive';
import { navigationState, navigationStateDocumentPath } from './navigationProjection';
import { neighborsForCoordinate } from './starChartGraph';
import { isResourceShipId, type ShipResourceInventory } from './resources';
import { SHIP_DAMAGE_DECKS, type ShipDamageState } from './shipDamage';
import { turnPhaseState } from './turnZero';
import { wolfAttackBlocksNormalMovement } from './wolfAttackDeclaration';
import {
  dockVoyage33 as resolveVoyage33Dock,
  emptyVoyage33MovementState,
  resolveVoyage33JumpCommit,
  type Voyage33MovementState,
} from './voyage33Movement';
import { VOYAGE_33_ID, parseVoyage33Admission } from './voyageAdmission';
import {
  emptyVoyage33MaintenanceState,
  parseVoyage33MaintenanceState,
  type Voyage33MaintenanceState,
} from './voyage33Maintenance';

type Data = Record<string, unknown>;
type MovementDatabase = Pick<Firestore, 'doc' | 'runTransaction'>;

interface RawCallableRequest {
  readonly auth?: { readonly uid?: string } | null;
  readonly data?: unknown;
}

export interface Voyage33MovementCallableDependencies {
  readonly db: MovementDatabase;
  readonly requireUid: (auth: { readonly uid: string } | undefined) => string;
  /** Reuse the session's established active-player, ship-seat, and GM checks. */
  readonly requireShipCounterAuthority: (
    tx: Transaction,
    sessionId: string,
    uid: string,
    shipId: string,
    instanceId?: string,
  ) => Promise<void>;
  readonly serverTimestamp: () => unknown;
  readonly now: () => Date;
}

type Action = 'dock' | 'jump';
type MovementFingerprint = Readonly<{
  kind: Action;
  sessionId: string;
  requestId: string;
  actorUid: string;
  instanceId: string | null;
  expectedMovementRevision: number;
  expectedDockingRevision: number;
  hostShipId: string | null;
  destination: string | null;
}>;

const SAFE_ID = /^[A-Za-z0-9_-]{1,128}$/;
const MOVEMENT_KEYS = ['id', 'coordinate', 'revision', 'jumpState'] as const;
const JUMP_STATE_KEYS = [
  'lastJumpTurn', 'integrityLockedUntil', 'emergencyJumpUsed', 'lastFailureRequestId',
] as const;
const RESOURCE_KEYS = new Set(['ore', 'fuel', 'food', 'water', 'materials', 'securityTeams', 'scrap']);

function isRecord(value: unknown): value is Data {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(value: Data, allowed: readonly string[]): boolean {
  return Object.keys(value).every((key) => allowed.includes(key));
}

function invalid(message: string): never {
  throw new HttpsError('invalid-argument', message);
}

function precondition(message: string): never {
  throw new HttpsError('failed-precondition', message);
}

function requireRecord(value: unknown, message: string): Data {
  if (!isRecord(value)) return invalid(message);
  return value;
}

function requireSafeId(value: unknown, label: string): string {
  if (typeof value !== 'string' || !SAFE_ID.test(value)) return invalid(`${label} is invalid.`);
  return value;
}

function requireRevision(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0 ||
      value === Number.MAX_SAFE_INTEGER) {
    return invalid(`${label} must be a safe non-negative integer.`);
  }
  return value;
}

function requireExactKeys(value: Data, allowed: readonly string[], label: string): void {
  if (Object.keys(value).some((key) => !allowed.includes(key))) {
    invalid(`The ${label} request contains unsupported fields.`);
  }
}

function authenticatedUid(
  dependencies: Voyage33MovementCallableDependencies,
  request: RawCallableRequest,
): string {
  const uid = request.auth?.uid;
  return dependencies.requireUid(typeof uid === 'string' && uid.length > 0 ? { uid } : undefined);
}

function parseDockRequest(value: unknown) {
  const data = requireRecord(value, 'The Voyage 33-0 docking request is malformed.');
  requireExactKeys(data, [
    'sessionId', 'shipId', 'hostShipId', 'instanceId', 'requestId',
    'expectedMovementRevision', 'expectedDockingRevision',
  ], 'Voyage 33-0 docking');
  if (data.shipId !== VOYAGE_33_ID) return invalid('Only Voyage 33-0 can use this docking command.');
  const sessionId = requireSafeId(data.sessionId, 'sessionId');
  const requestId = requireSafeId(data.requestId, 'requestId');
  const hostShipId = requireSafeId(data.hostShipId, 'hostShipId');
  const instanceId = data.instanceId === undefined ? undefined : requireSafeId(data.instanceId, 'instanceId');
  return {
    sessionId,
    requestId,
    hostShipId,
    instanceId,
    expectedMovementRevision: requireRevision(data.expectedMovementRevision, 'expectedMovementRevision'),
    expectedDockingRevision: requireRevision(data.expectedDockingRevision, 'expectedDockingRevision'),
  } as const;
}

function parseJumpRequest(value: unknown) {
  const data = requireRecord(value, 'The Voyage 33-0 jump request is malformed.');
  requireExactKeys(data, [
    'sessionId', 'shipId', 'hostShipId', 'destination', 'instanceId', 'requestId',
    'expectedMovementRevision', 'expectedDockingRevision',
  ], 'Voyage 33-0 jump');
  if (data.shipId !== VOYAGE_33_ID) return invalid('Only Voyage 33-0 can use this jump command.');
  if (typeof data.destination !== 'string' || !/^\d{4}$/.test(data.destination)) {
    return invalid('destination must be a four-digit star-chart coordinate.');
  }
  const sessionId = requireSafeId(data.sessionId, 'sessionId');
  const requestId = requireSafeId(data.requestId, 'requestId');
  const hostShipId = requireSafeId(data.hostShipId, 'hostShipId');
  const instanceId = data.instanceId === undefined ? undefined : requireSafeId(data.instanceId, 'instanceId');
  return {
    sessionId,
    requestId,
    hostShipId,
    destination: data.destination,
    instanceId,
    expectedMovementRevision: requireRevision(data.expectedMovementRevision, 'expectedMovementRevision'),
    expectedDockingRevision: requireRevision(data.expectedDockingRevision, 'expectedDockingRevision'),
  } as const;
}

function parseMovementState(value: unknown): Voyage33MovementState | undefined {
  if (!isRecord(value) || !hasOnlyKeys(value, MOVEMENT_KEYS) || value.id !== VOYAGE_33_ID ||
      typeof value.coordinate !== 'string' || !neighborsForCoordinate(value.coordinate) ||
      typeof value.revision !== 'number' || !Number.isSafeInteger(value.revision) || value.revision < 0 ||
      value.revision === Number.MAX_SAFE_INTEGER || !isRecord(value.jumpState) ||
      !hasOnlyKeys(value.jumpState, JUMP_STATE_KEYS)) return undefined;
  const jumpState = value.jumpState;
  if ((jumpState.lastJumpTurn !== undefined &&
        (typeof jumpState.lastJumpTurn !== 'number' || !Number.isSafeInteger(jumpState.lastJumpTurn) || jumpState.lastJumpTurn < 0)) ||
      (jumpState.integrityLockedUntil !== undefined &&
        (typeof jumpState.integrityLockedUntil !== 'string' || !Number.isFinite(Date.parse(jumpState.integrityLockedUntil)))) ||
      (jumpState.emergencyJumpUsed !== undefined && typeof jumpState.emergencyJumpUsed !== 'boolean') ||
      (jumpState.lastFailureRequestId !== undefined &&
        (typeof jumpState.lastFailureRequestId !== 'string' || !SAFE_ID.test(jumpState.lastFailureRequestId)))) return undefined;
  return {
    id: VOYAGE_33_ID,
    coordinate: value.coordinate,
    revision: value.revision,
    jumpState: {
      ...(jumpState.lastJumpTurn === undefined ? {} : { lastJumpTurn: jumpState.lastJumpTurn }),
      ...(jumpState.integrityLockedUntil === undefined ? {} : { integrityLockedUntil: jumpState.integrityLockedUntil }),
      ...(jumpState.emergencyJumpUsed === undefined ? {} : { emergencyJumpUsed: jumpState.emergencyJumpUsed }),
      ...(jumpState.lastFailureRequestId === undefined ? {} : { lastFailureRequestId: jumpState.lastFailureRequestId }),
    },
  };
}

function movementStateFromSession(session: { get(field: string): unknown }): Voyage33MovementState | undefined {
  const raw = session.get('voyage33Movement');
  if (raw === undefined) return undefined;
  const state = parseMovementState(raw);
  if (!state) return precondition('The stored Voyage 33-0 movement state is malformed; refresh before operating it.');
  return state;
}

function maintenanceStateFromSession(
  session: { get(field: string): unknown },
): Voyage33MaintenanceState {
  const raw = session.get('voyage33Maintenance');
  if (raw === undefined) return emptyVoyage33MaintenanceState();
  const state = parseVoyage33MaintenanceState(raw);
  if (!state) return precondition('The stored Voyage 33-0 docking state is malformed; refresh before operating it.');
  return state;
}

function requireAdmission(session: { get(field: string): unknown }, sessionId: string): void {
  if (!parseVoyage33Admission(session.get('voyage33Admission'), sessionId)) {
    precondition('Voyage 33-0 must be admitted in this session before movement.');
  }
  const admitted = session.get('admittedVesselIds');
  if (!Array.isArray(admitted) || admitted.some((id) => typeof id !== 'string') ||
      new Set(admitted).size !== admitted.length || admitted.filter((id) => id === VOYAGE_33_ID).length !== 1) {
    precondition('Voyage 33-0 admission is missing from the current session roster.');
  }
}

function requireLiveSessionPhase(
  session: { get(field: string): unknown },
  phase: 'team' | 'coordination',
): number {
  if (session.get('phase') !== 'active') precondition('Movement is available only in an active session.');
  if (session.get('singlePlayerDemo') !== undefined && session.get('singlePlayerDemo') !== null) {
    precondition('Voyage 33-0 movement is unavailable in the single-player demo.');
  }
  const currentTurn = session.get('currentTurn');
  if (typeof currentTurn !== 'number' || !Number.isSafeInteger(currentTurn) || currentTurn < 1) {
    precondition('The current cycle is malformed.');
  }
  const rawTurnPhase = session.get('turnPhase');
  const phaseState = turnPhaseState(rawTurnPhase);
  if (!phaseState || phaseState.turn !== currentTurn) precondition('No current server phase is available.');
  if (phaseState.timerPause) precondition('Movement is paused until the facilitator resumes the cycle.');
  const decision = decideActionAuthorization({
    action: phase === 'team' ? 'maintenance' : 'jump',
    actorScope: 'player',
    turnPhase: rawTurnPhase,
  });
  if (!decision.allowed || phaseFromTurnPhase(rawTurnPhase) !== phase) {
    precondition(`Voyage 33-0 ${phase === 'team' ? 'docking' : 'jumps'} are only available during ${phase === 'team' ? 'Team' : 'Coordination'} Phase.`);
  }
  return currentTurn;
}

function requireActiveCoreRoster(value: unknown): readonly string[] {
  if (!Array.isArray(value) || value.length === 0 || new Set(value).size !== value.length ||
      value.some((shipId) => typeof shipId !== 'string' || !isResourceShipId(shipId))) {
    return precondition('The active core-vessel roster is malformed.');
  }
  return value as string[];
}

function requireHostShipId(shipId: string, activeVesselIds: readonly string[]): void {
  if (!isResourceShipId(shipId)) precondition('Choose an active core vessel as the Voyage host.');
  if (!activeVesselIds.includes(shipId)) precondition('The Voyage host is no longer active in this session.');
}

function hostDamageFromSession(
  session: { get(field: string): unknown },
  shipId: string,
): ShipDamageState {
  const deck = SHIP_DAMAGE_DECKS[shipId];
  if (!deck) return precondition('Voyage 33-0 requires a live core-vessel host.');
  const rawMap = session.get('shipDamage');
  if (rawMap !== undefined && !isRecord(rawMap)) return precondition('The stored host damage ledger is malformed.');
  const raw = isRecord(rawMap) ? rawMap[shipId] : undefined;
  if (raw === undefined) return { damagedSystemIds: [], destroyed: false };
  if (!isRecord(raw) || !hasOnlyKeys(raw, ['damagedSystemIds', 'destroyed']) || raw.destroyed !== false ||
      !Array.isArray(raw.damagedSystemIds)) {
    return precondition('Voyage 33-0 requires a live core-vessel host.');
  }
  const knownSystems = new Set(deck.map(({ systemId }) => systemId));
  if (raw.damagedSystemIds.some((systemId) => typeof systemId !== 'string' || !knownSystems.has(systemId)) ||
      new Set(raw.damagedSystemIds).size !== raw.damagedSystemIds.length) {
    return precondition('The host damage state is malformed.');
  }
  return { damagedSystemIds: [...raw.damagedSystemIds] as string[], destroyed: false };
}

function hostResourcesFromSession(
  session: { get(field: string): unknown },
  shipId: string,
): ShipResourceInventory {
  const rawMap = session.get('shipResources');
  if (!isRecord(rawMap)) return precondition('The docked host resource ledger is unavailable.');
  const rawValue = rawMap[shipId];
  if (!isRecord(rawValue)) return precondition('The docked host resource ledger is unavailable.');
  const raw = rawValue;
  if (!hasOnlyKeys(raw, [...RESOURCE_KEYS]) ||
      !['ore', 'fuel', 'food', 'water', 'materials', 'securityTeams'].every((key) =>
        typeof raw[key] === 'number' && Number.isSafeInteger(raw[key]) && (raw[key] as number) >= 0) ||
      (raw.scrap !== undefined &&
        (typeof raw.scrap !== 'number' || !Number.isSafeInteger(raw.scrap) || raw.scrap < 0))) {
    return precondition('The docked host resource ledger is malformed.');
  }
  return {
    ore: raw.ore as number,
    fuel: raw.fuel as number,
    food: raw.food as number,
    water: raw.water as number,
    materials: raw.materials as number,
    securityTeams: raw.securityTeams as number,
    ...(raw.scrap === undefined ? {} : { scrap: raw.scrap as number }),
  };
}

async function hostCoordinate(
  dependencies: Voyage33MovementCallableDependencies,
  tx: Transaction,
  sessionId: string,
  session: { get(field: string): unknown },
  activeVesselIds: readonly string[],
  hostShipId: string,
): Promise<string> {
  const navigationSnapshot = await tx.get(dependencies.db.doc(navigationStateDocumentPath(sessionId)));
  const rawNavigation = navigationSnapshot.exists
    ? navigationSnapshot.data()
    : {
      shipGalacticCoordinates: session.get('shipGalacticCoordinates'),
      shipNavigationLogs: session.get('shipNavigationLogs'),
    };
  const navigation = navigationState(rawNavigation, activeVesselIds, session.get('pursuitGroups'));
  const coordinate = navigation.shipGalacticCoordinates[hostShipId];
  if (typeof coordinate !== 'string' || !neighborsForCoordinate(coordinate)) {
    return precondition('The host vessel has no valid current star-chart position.');
  }
  return coordinate;
}

function sessionDocument(dependencies: Voyage33MovementCallableDependencies, sessionId: string) {
  return dependencies.db.doc(`sessions/${sessionId}`);
}

function requestDocument(dependencies: Voyage33MovementCallableDependencies, sessionId: string, requestId: string) {
  return dependencies.db.doc(`sessions/${sessionId}/voyage33MovementRequests/${requestId}`);
}

function commandReceiptDocument(dependencies: Voyage33MovementCallableDependencies, sessionId: string, requestId: string) {
  return dependencies.db.doc(`sessions/${sessionId}/commandReceipts/${requestId}`);
}

function fingerprint(
  kind: Action,
  sessionId: string,
  requestId: string,
  actorUid: string,
  instanceId: string | undefined,
  expectedMovementRevision: number,
  expectedDockingRevision: number,
  hostShipId: string | null,
  destination: string | null,
): MovementFingerprint {
  return {
    kind,
    sessionId,
    requestId,
    actorUid,
    instanceId: instanceId ?? null,
    expectedMovementRevision,
    expectedDockingRevision,
    hostShipId,
    destination,
  };
}

function commandFingerprint(expected: MovementFingerprint): CommandFingerprint {
  return {
    action: expected.kind === 'dock' ? 'dock-voyage-33-0' : 'jump-voyage-33-0',
    sessionId: expected.sessionId,
    requestId: expected.requestId,
    actorUid: expected.actorUid,
    instanceId: expected.instanceId,
    expectedRevision: expected.expectedMovementRevision,
    payload: {
      shipId: VOYAGE_33_ID,
      expectedDockingRevision: expected.expectedDockingRevision,
      hostShipId: expected.hostShipId,
      destination: expected.destination,
    },
  };
}

function sameCommandValue(left: unknown, right: unknown): boolean {
  if (left === right) return true;
  if (Array.isArray(left) || Array.isArray(right)) {
    return Array.isArray(left) && Array.isArray(right) && left.length === right.length &&
      left.every((value, index) => sameCommandValue(value, right[index]));
  }
  if (!isRecord(left) || !isRecord(right)) return false;
  const leftKeys = Object.keys(left).sort();
  const rightKeys = Object.keys(right).sort();
  return leftKeys.length === rightKeys.length && leftKeys.every((key, index) =>
    key === rightKeys[index] && sameCommandValue(left[key], right[key]));
}

function validateSharedReceipt(
  marker: { readonly exists: boolean; get(field: string): unknown },
  prior: { readonly exists: boolean; get(field: string): unknown },
  expected: CommandFingerprint,
): void {
  if (!marker.exists) {
    if (prior.exists) precondition('This Voyage 33-0 request has a domain receipt without its shared command marker.');
    return;
  }
  const disposition = commandReceiptDisposition(marker.get('fingerprint'), expected);
  if (disposition.kind === 'foreign-actor') {
    throw new HttpsError('permission-denied', 'This Voyage 33-0 request belongs to a different actor.');
  }
  if (disposition.kind === 'collision') {
    precondition('This request id is already bound to a different command.');
  }
  const markerResult = marker.get('result');
  if (!prior.exists || !validStoredReply(markerResult, expected.action === 'dock-voyage-33-0' ? 'dock' : 'jump',
    expected.sessionId ?? '', expected.requestId) || !sameCommandValue(markerResult, prior.get('reply'))) {
    precondition('This Voyage 33-0 request has a shared marker without a matching replay result.');
  }
}

function sameFingerprint(value: unknown, expected: MovementFingerprint): boolean {
  if (!isRecord(value) || !hasOnlyKeys(value, [
    'kind', 'sessionId', 'requestId', 'actorUid', 'instanceId', 'expectedMovementRevision',
    'expectedDockingRevision', 'hostShipId', 'destination',
  ])) return false;
  return value.kind === expected.kind && value.sessionId === expected.sessionId &&
    value.requestId === expected.requestId && value.actorUid === expected.actorUid &&
    (value.instanceId ?? null) === expected.instanceId &&
    value.expectedMovementRevision === expected.expectedMovementRevision &&
    value.expectedDockingRevision === expected.expectedDockingRevision &&
    (value.hostShipId ?? null) === expected.hostShipId && (value.destination ?? null) === expected.destination;
}

function validStoredReply(value: unknown, kind: Action, sessionId: string, requestId: string): value is Data {
  if (!isRecord(value) || value.sessionId !== sessionId || value.requestId !== requestId ||
      value.shipId !== VOYAGE_33_ID) return false;
  if (value.status === 'stale') {
    return hasOnlyKeys(value, [
      'status', 'sessionId', 'requestId', 'shipId', 'expectedMovementRevision', 'currentMovementRevision',
      'expectedDockingRevision', 'currentDockingRevision',
    ]) && Number.isSafeInteger(value.expectedMovementRevision) && Number.isSafeInteger(value.currentMovementRevision) &&
      Number.isSafeInteger(value.expectedDockingRevision) && Number.isSafeInteger(value.currentDockingRevision);
  }
  if (kind === 'dock') {
    return value.status === 'committed' && hasOnlyKeys(value, [
      'status', 'sessionId', 'requestId', 'shipId', 'hostShipId', 'expectedMovementRevision',
      'committedMovementRevision', 'expectedDockingRevision', 'currentDockingRevision', 'movementState',
      'maintenanceState',
    ]) && typeof value.hostShipId === 'string' && !!parseMovementState(value.movementState) &&
      !!parseVoyage33MaintenanceState(value.maintenanceState);
  }
  if (value.status !== 'jumped' && value.status !== 'integrity-locked' &&
      value.status !== 'integrity-lockout' && value.status !== 'drive-failure') return false;
  return hasOnlyKeys(value, [
    'status', 'sessionId', 'requestId', 'shipId', 'previousHostShipId', 'expectedMovementRevision',
    'committedMovementRevision', 'expectedDockingRevision', 'currentDockingRevision', 'movementState',
    'maintenanceState', 'transition', 'fuelSpent',
  ]) && typeof value.previousHostShipId === 'string' && !!parseMovementState(value.movementState) &&
    !!parseVoyage33MaintenanceState(value.maintenanceState) &&
    (value.fuelSpent === undefined || (typeof value.fuelSpent === 'number' &&
      Number.isSafeInteger(value.fuelSpent) && value.fuelSpent >= 0)) &&
    (value.transition === undefined || (isRecord(value.transition) && value.transition.shipId === VOYAGE_33_ID));
}

function receiptReply(
  prior: { readonly exists: boolean; get(field: string): unknown },
  expected: MovementFingerprint,
): Data | undefined {
  if (!prior.exists) return undefined;
  if (prior.get('type') !== 'voyage-33-movement-request' || prior.get('sessionId') !== expected.sessionId ||
      prior.get('requestId') !== expected.requestId || prior.get('actorUid') !== expected.actorUid ||
      (prior.get('hostShipId') ?? null) !== expected.hostShipId ||
      !sameFingerprint(prior.get('fingerprint'), expected)) {
    precondition('This request id was already used for a different Voyage 33-0 movement command or actor.');
  }
  const stored = prior.get('reply');
  if (!validStoredReply(stored, expected.kind, expected.sessionId, expected.requestId)) {
    precondition('This Voyage 33-0 movement request has no replayable result.');
  }
  return stored.status === 'stale' ? stored : { ...stored, status: 'replayed' };
}

function writeReceipt(
  tx: Transaction,
  ref: ReturnType<MovementDatabase['doc']>,
  expected: MovementFingerprint,
  reply: Data,
  hostShipId: string,
  serverTimestamp: () => unknown,
): void {
  tx.set(ref, {
    type: 'voyage-33-movement-request',
    sessionId: expected.sessionId,
    requestId: expected.requestId,
    actorUid: expected.actorUid,
    hostShipId,
    fingerprint: expected,
    reply,
    createdAt: serverTimestamp(),
  });
}

function writeSharedReceipt(
  tx: Transaction,
  ref: ReturnType<MovementDatabase['doc']>,
  expected: CommandFingerprint,
  reply: Data,
  serverTimestamp: () => unknown,
): void {
  tx.set(ref, {
    fingerprint: expected,
    result: reply,
    createdAt: serverTimestamp(),
  });
}

function staleReply(
  sessionId: string,
  requestId: string,
  expectedMovementRevision: number,
  currentMovementRevision: number,
  expectedDockingRevision: number,
  currentDockingRevision: number,
): Data {
  return {
    status: 'stale',
    sessionId,
    requestId,
    shipId: VOYAGE_33_ID,
    expectedMovementRevision,
    currentMovementRevision,
    expectedDockingRevision,
    currentDockingRevision,
  };
}

function withCallableError(error: unknown): never {
  if (error instanceof HttpsError) throw error;
  if (error instanceof Error) throw new HttpsError('failed-precondition', error.message);
  throw new HttpsError('internal', 'The Voyage 33-0 movement request could not be completed.');
}

async function handleErrors<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (error) {
    return withCallableError(error);
  }
}

function requireSessionExists(session: { readonly exists: boolean }): void {
  if (!session.exists) throw new HttpsError('not-found', 'No such session.');
}

async function requireMovementActor(
  dependencies: Voyage33MovementCallableDependencies,
  tx: Transaction,
  sessionId: string,
  uid: string,
  hostShipId: string,
  instanceId: string | undefined,
): Promise<void> {
  if (!isResourceShipId(hostShipId)) precondition('Choose an active core vessel as the Voyage host.');
  await dependencies.requireShipCounterAuthority(tx, sessionId, uid, hostShipId, instanceId);
}

function requireNoWolfAttack(attack: { readonly exists: boolean; data(): unknown }): void {
  if (attack.exists && wolfAttackBlocksNormalMovement(attack.data())) {
    precondition('The Wolf attack awaits facilitator resolution; normal movement remains blocked.');
  }
}

function maintenanceAfterJump(
  state: Voyage33MaintenanceState,
  successful: boolean,
): Voyage33MaintenanceState {
  if (!successful) return state;
  if (state.cycle.revision === Number.MAX_SAFE_INTEGER) {
    precondition('Voyage 33-0 maintenance revision is exhausted.');
  }
  return {
    ...state,
    cycle: {
      ...state.cycle,
      revision: state.cycle.revision + 1,
      charges: [...state.cycle.charges],
    },
  };
}

export function createVoyage33MovementCallables(dependencies: Voyage33MovementCallableDependencies) {
  const dockVoyage33 = async (request: RawCallableRequest) => handleErrors(async () => {
    const parsed = parseDockRequest(request.data);
    const uid = authenticatedUid(dependencies, request);
    const expected = fingerprint(
      'dock', parsed.sessionId, parsed.requestId, uid, parsed.instanceId,
      parsed.expectedMovementRevision, parsed.expectedDockingRevision, parsed.hostShipId, null,
    );
    const sharedExpected = commandFingerprint(expected);
    const sessionRef = sessionDocument(dependencies, parsed.sessionId);
    const receiptRef = requestDocument(dependencies, parsed.sessionId, parsed.requestId);
    const sharedReceiptRef = commandReceiptDocument(dependencies, parsed.sessionId, parsed.requestId);
    return dependencies.db.runTransaction(async (tx) => {
      const [session, prior, marker] = await Promise.all([
        tx.get(sessionRef), tx.get(receiptRef), tx.get(sharedReceiptRef),
      ]);
      requireSessionExists(session);
      validateSharedReceipt(marker, prior, sharedExpected);
      const replay = receiptReply(prior, expected);
      if (replay) {
        await requireMovementActor(dependencies, tx, parsed.sessionId, uid, parsed.hostShipId, parsed.instanceId);
        return replay;
      }
      await requireMovementActor(dependencies, tx, parsed.sessionId, uid, parsed.hostShipId, parsed.instanceId);
      requireAdmission(session, parsed.sessionId);
      requireLiveSessionPhase(session, 'team');
      const activeVesselIds = requireActiveCoreRoster(session.get('activeVesselIds'));
      requireHostShipId(parsed.hostShipId, activeVesselIds);
      const hostDamage = hostDamageFromSession(session, parsed.hostShipId);
      const movement = movementStateFromSession(session);
      const currentMovementRevision = movement?.revision ?? 0;
      const currentMaintenance = maintenanceStateFromSession(session);
      const currentDockingRevision = currentMaintenance.dockingRevision;
      if (parsed.expectedMovementRevision !== currentMovementRevision ||
          parsed.expectedDockingRevision !== currentDockingRevision) {
        const stale = staleReply(
          parsed.sessionId, parsed.requestId,
          parsed.expectedMovementRevision, currentMovementRevision,
          parsed.expectedDockingRevision, currentDockingRevision,
        );
        writeReceipt(tx, receiptRef, expected, stale, parsed.hostShipId, dependencies.serverTimestamp);
        writeSharedReceipt(tx, sharedReceiptRef, sharedExpected, stale, dependencies.serverTimestamp);
        return stale;
      }
      const coordinate = await hostCoordinate(
        dependencies, tx, parsed.sessionId, session, activeVesselIds, parsed.hostShipId,
      );
      const movementState = movement ?? emptyVoyage33MovementState(coordinate);
      let nextMaintenance: Voyage33MaintenanceState;
      try {
        nextMaintenance = resolveVoyage33Dock({
          sessionId: parsed.sessionId,
          admission: session.get('voyage33Admission'),
          phase: 'team',
          maintenanceState: currentMaintenance,
          expectedDockingRevision: parsed.expectedDockingRevision,
          movementState,
          hostShipId: parsed.hostShipId,
          hostCoordinate: coordinate,
          hostDamage,
          activeVesselIds,
        });
      } catch (error) {
        return withCallableError(error);
      }
      const reply = {
        status: 'committed',
        sessionId: parsed.sessionId,
        requestId: parsed.requestId,
        shipId: VOYAGE_33_ID,
        hostShipId: parsed.hostShipId,
        expectedMovementRevision: parsed.expectedMovementRevision,
        committedMovementRevision: movementState.revision,
        expectedDockingRevision: parsed.expectedDockingRevision,
        currentDockingRevision: nextMaintenance.dockingRevision,
        movementState,
        maintenanceState: nextMaintenance,
      };
      tx.update(sessionRef, {
        voyage33Movement: movementState,
        voyage33Maintenance: nextMaintenance,
        updatedAt: dependencies.serverTimestamp(),
      });
      writeReceipt(tx, receiptRef, expected, reply, parsed.hostShipId, dependencies.serverTimestamp);
      writeSharedReceipt(tx, sharedReceiptRef, sharedExpected, reply, dependencies.serverTimestamp);
      return reply;
    });
  });

  const jumpVoyage33 = async (request: RawCallableRequest) => handleErrors(async () => {
    const parsed = parseJumpRequest(request.data);
    const uid = authenticatedUid(dependencies, request);
    const expected = fingerprint(
      'jump', parsed.sessionId, parsed.requestId, uid, parsed.instanceId,
      parsed.expectedMovementRevision, parsed.expectedDockingRevision, parsed.hostShipId, parsed.destination,
    );
    const sharedExpected = commandFingerprint(expected);
    const sessionRef = sessionDocument(dependencies, parsed.sessionId);
    const receiptRef = requestDocument(dependencies, parsed.sessionId, parsed.requestId);
    const sharedReceiptRef = commandReceiptDocument(dependencies, parsed.sessionId, parsed.requestId);
    const operationTime = dependencies.now();
    if (!Number.isFinite(operationTime.getTime())) precondition('The server clock is unavailable.');
    return dependencies.db.runTransaction(async (tx) => {
      const [session, prior, marker] = await Promise.all([
        tx.get(sessionRef), tx.get(receiptRef), tx.get(sharedReceiptRef),
      ]);
      requireSessionExists(session);
      validateSharedReceipt(marker, prior, sharedExpected);
      const replay = receiptReply(prior, expected);
      if (replay) {
        const storedHost = prior.get('hostShipId');
        if (typeof storedHost !== 'string') precondition('The stored Voyage 33-0 movement receipt is malformed.');
        await requireMovementActor(dependencies, tx, parsed.sessionId, uid, storedHost, parsed.instanceId);
        return replay;
      }
      requireAdmission(session, parsed.sessionId);
      const currentTurn = requireLiveSessionPhase(session, 'coordination');
      const movement = movementStateFromSession(session);
      if (!movement) precondition('Voyage 33-0 must be docked and have a valid movement state before jumping.');
      const maintenance = maintenanceStateFromSession(session);
      const hostShipId = parsed.hostShipId;
      await requireMovementActor(dependencies, tx, parsed.sessionId, uid, hostShipId, parsed.instanceId);
      const currentMovementRevision = movement.revision;
      const currentDockingRevision = maintenance.dockingRevision;
      if (parsed.expectedMovementRevision !== currentMovementRevision ||
          parsed.expectedDockingRevision !== currentDockingRevision) {
        const stale = staleReply(
          parsed.sessionId, parsed.requestId,
          parsed.expectedMovementRevision, currentMovementRevision,
          parsed.expectedDockingRevision, currentDockingRevision,
        );
        writeReceipt(tx, receiptRef, expected, stale, hostShipId, dependencies.serverTimestamp);
        writeSharedReceipt(tx, sharedReceiptRef, sharedExpected, stale, dependencies.serverTimestamp);
        return stale;
      }
      if (maintenance.hostShipId !== hostShipId) {
        precondition('Voyage 33-0 is no longer docked with the selected active core-vessel host.');
      }
      const activeVesselIds = requireActiveCoreRoster(session.get('activeVesselIds'));
      const [attackSnapshot, coordinate] = await Promise.all([
        tx.get(dependencies.db.doc(`sessions/${parsed.sessionId}/wolfAttackState/current`)),
        hostCoordinate(dependencies, tx, parsed.sessionId, session, activeVesselIds, hostShipId),
      ]);
      requireHostShipId(hostShipId, activeVesselIds);
      requireNoWolfAttack(attackSnapshot);
      const hostDamage = hostDamageFromSession(session, hostShipId);
      const hostResources = hostResourcesFromSession(session, hostShipId);
      let jumpResult: JumpAttemptResult;
      try {
        // Always resolve from server state. A client-supplied result is not an
        // accepted field, and Voyage has no core damage deck or drive upgrade.
        jumpResult = resolveJumpAttempt({
          shipId: VOYAGE_33_ID,
          origin: movement.coordinate,
          destination: parsed.destination,
          currentTurn,
          fuel: hostResources.fuel,
          charged: true,
          damaged: false,
          upgraded: false,
          now: operationTime,
          transitionId: `voyage-jump-${parsed.requestId}`,
          state: movement.jumpState,
        });
      } catch (error) {
        return withCallableError(error);
      }
      let result: ReturnType<typeof resolveVoyage33JumpCommit>;
      try {
        result = resolveVoyage33JumpCommit({
          sessionId: parsed.sessionId,
          admission: session.get('voyage33Admission'),
          phase: 'coordination',
          currentTurn,
          movementState: movement,
          expectedMovementRevision: parsed.expectedMovementRevision,
          maintenanceState: maintenance,
          expectedDockingRevision: parsed.expectedDockingRevision,
          activeVesselIds,
          hostShipId,
          hostCoordinate: coordinate,
          hostDamage,
          hostResources,
          jumpResult,
        });
      } catch (error) {
        return withCallableError(error);
      }
      const jumped = result.status === 'jumped';
      const nextMaintenance = maintenanceAfterJump(result.maintenanceState, jumped);
      const fuelSpent = hostResources.fuel - result.hostResources.fuel;
      const reply = {
        status: result.status,
        sessionId: parsed.sessionId,
        requestId: parsed.requestId,
        shipId: VOYAGE_33_ID,
        previousHostShipId: hostShipId,
        expectedMovementRevision: parsed.expectedMovementRevision,
        committedMovementRevision: result.movementState.revision,
        expectedDockingRevision: parsed.expectedDockingRevision,
        currentDockingRevision: nextMaintenance.dockingRevision,
        movementState: result.movementState,
        maintenanceState: nextMaintenance,
        ...(result.status === 'jumped' ? { transition: result.transition, fuelSpent } : {}),
      };
      const patch: Data = {
        voyage33Movement: result.movementState,
        voyage33Maintenance: nextMaintenance,
        updatedAt: dependencies.serverTimestamp(),
      };
      if (jumped) patch[`shipResources.${hostShipId}`] = result.hostResources;
      tx.update(sessionRef, patch);
      writeReceipt(tx, receiptRef, expected, reply, hostShipId, dependencies.serverTimestamp);
      writeSharedReceipt(tx, sharedReceiptRef, sharedExpected, reply, dependencies.serverTimestamp);
      return reply;
    });
  });

  return { dockVoyage33, jumpVoyage33 };
}
