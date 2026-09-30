import { HttpsError } from 'firebase-functions/v2/https';
import type { DocumentSnapshot, Firestore, Transaction } from 'firebase-admin/firestore';
import { decideActionAuthorization, phaseFromTurnPhase } from './actionMetadata';
import { requireMissionCraftMovementAvailable } from './missionCraftCommitment';
import { navigationStateDocumentPath, parseMissionExploredCoordinatesByUid } from './navigationProjection';
import { STAR_CHART_COORDINATES } from './starChartGraph';
import { organiserSitesForChart, type ChartId } from './starChartLookup';
import { isResourceShipId } from './resources';
import { jumpFuelCost, jumpLengthBetween, resolveJumpAttempt, type JumpLength } from './jumpDrive';
import { isExtraShipStateMapValid } from './extraShipAdmission';
import { isSmallShipInMutiny, parseSmallShipState, type SmallShipId, type SmallShipState } from './smallShip';
import { shipDamage } from './shipDamage';
import { turnPhaseState } from './turnZero';
import { wolfAttackBlocksNormalMovement } from './wolfAttackDeclaration';

type Data = Record<string, unknown>;
type MovementDatabase = Pick<Firestore, 'doc' | 'runTransaction'>;

interface RawCallableRequest {
  readonly auth?: { readonly uid?: string } | null;
  readonly data?: unknown;
}

export interface SmallShipJumpCallableDependencies {
  readonly db: MovementDatabase;
  readonly requireUid: (auth: { readonly uid: string } | undefined) => string;
  readonly requireSmallShipCaptainAuthority: (
    tx: Transaction,
    sessionId: string,
    uid: string,
    instanceId: string | undefined,
    smallShipId: SmallShipId,
  ) => Promise<{ readonly player: Pick<DocumentSnapshot, 'get'>; readonly session: DocumentSnapshot }>;
  readonly requireSmallShipMode: (session: DocumentSnapshot, smallShipId: SmallShipId) => void;
  readonly serverTimestamp: () => unknown;
  readonly now: () => Date;
}

export interface SmallShipMovementAuthority {
  readonly type: 'small-ship-movement';
  readonly sessionId: string;
  readonly smallShipId: SmallShipId;
  readonly coordinate: string;
  readonly revision: number;
  readonly lastJumpTurn: number | null;
  readonly captainArrivalsByUid: Readonly<Record<string, readonly string[]>>;
}

export interface SmallShipJumpDestination {
  readonly coordinate: string;
  readonly length: JumpLength;
  readonly fuelCost: number;
}

const SAFE_ID = /^[A-Za-z0-9_-]{1,128}$/;
const SMALL_CRAFT_JUMP_IDS = new Set<SmallShipId>(['gorgoneion', 'capybara-small']);
const CAPTAIN_ROLE: Readonly<Record<'gorgoneion' | 'capybara-small', string>> = {
  gorgoneion: 'gorgoneion-captain',
  'capybara-small': 'capybara-small-captain',
};
const MOVEMENT_KEYS = [
  'type', 'sessionId', 'smallShipId', 'coordinate', 'revision', 'lastJumpTurn', 'captainArrivalsByUid',
] as const;

export function smallShipMovementDocumentPath(sessionId: string, smallShipId: SmallShipId): string {
  return `sessions/${sessionId}/smallShipMovements/${smallShipId}`;
}

export function smallShipJumpRequestDocumentPath(sessionId: string, requestId: string): string {
  return `sessions/${sessionId}/smallShipJumpRequests/${requestId}`;
}

export function emptySmallShipMovementState(
  sessionId: string,
  smallShipId: SmallShipId,
  coordinate: string,
): SmallShipMovementAuthority {
  if (!SAFE_ID.test(sessionId) || !SMALL_CRAFT_JUMP_IDS.has(smallShipId) || !isChartCoordinate(coordinate)) {
    throw new Error('Small-craft movement authority requires a valid session, craft, and chart coordinate.');
  }
  return {
    type: 'small-ship-movement', sessionId, smallShipId, coordinate,
    revision: 0, lastJumpTurn: null, captainArrivalsByUid: {},
  };
}

/** Parse server-only movement authority without repairing present corruption. */
export function parseSmallShipMovementState(
  value: unknown,
  sessionId: string,
  smallShipId: SmallShipId,
): SmallShipMovementAuthority | undefined {
  if (!isRecord(value) || Object.keys(value).some((key) => !MOVEMENT_KEYS.includes(key as typeof MOVEMENT_KEYS[number])) ||
      value.type !== 'small-ship-movement' || value.sessionId !== sessionId || value.smallShipId !== smallShipId ||
      !isChartCoordinate(value.coordinate) || !isRevision(value.revision) || value.revision === Number.MAX_SAFE_INTEGER ||
      (value.lastJumpTurn !== null && !isRevision(value.lastJumpTurn)) || !isRecord(value.captainArrivalsByUid)) {
    return undefined;
  }
  const arrivals: [string, readonly string[]][] = [];
  for (const [uid, coordinates] of Object.entries(value.captainArrivalsByUid)) {
    if (!uid || uid.includes('/') || !Array.isArray(coordinates) ||
        coordinates.length > STAR_CHART_COORDINATES.length ||
        coordinates.some((coordinate) => !isChartCoordinate(coordinate)) ||
        new Set(coordinates).size !== coordinates.length) return undefined;
    arrivals.push([uid, [...coordinates] as string[]]);
  }
  return {
    type: 'small-ship-movement', sessionId, smallShipId,
    coordinate: value.coordinate,
    revision: value.revision,
    lastJumpTurn: value.lastJumpTurn as number | null,
    captainArrivalsByUid: Object.fromEntries(arrivals),
  };
}

function isRecord(value: unknown): value is Data {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isRevision(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function isChartCoordinate(value: unknown): value is string {
  return typeof value === 'string' && STAR_CHART_COORDINATES.includes(value);
}

function invalid(message: string): never {
  throw new HttpsError('invalid-argument', message);
}

function precondition(message: string): never {
  throw new HttpsError('failed-precondition', message);
}

function permissionDenied(message: string): never {
  throw new HttpsError('permission-denied', message);
}

function requireRecord(value: unknown, message: string): Data {
  if (!isRecord(value)) return invalid(message);
  return value;
}

function requireExactKeys(value: Data, allowed: readonly string[], label: string): void {
  if (Object.keys(value).some((key) => !allowed.includes(key))) {
    invalid(`The ${label} request contains unsupported fields.`);
  }
}

function requireSafeId(value: unknown, label: string): string {
  if (typeof value !== 'string' || !SAFE_ID.test(value)) return invalid(`${label} is invalid.`);
  return value;
}

function requireRevision(value: unknown, label: string): number {
  if (!isRevision(value) || value === Number.MAX_SAFE_INTEGER) {
    return invalid(`${label} must be a safe non-negative revision.`);
  }
  return value;
}

function requireSmallCraftId(value: unknown): SmallShipId {
  if (value !== 'gorgoneion' && value !== 'capybara-small') {
    return invalid('Only the Gorgoneion or base small-ship Capybara may use this Jump Drive command.');
  }
  return value;
}

function parseWorkspaceRequest(value: unknown) {
  const data = requireRecord(value, 'The small-craft workspace request is malformed.');
  requireExactKeys(data, ['sessionId', 'smallShipId', 'instanceId'], 'small-craft workspace');
  const sessionId = requireSafeId(data.sessionId, 'sessionId');
  const smallShipId = requireSmallCraftId(data.smallShipId);
  const instanceId = data.instanceId === undefined ? undefined : requireSafeId(data.instanceId, 'instanceId');
  return { sessionId, smallShipId, instanceId } as const;
}

function parseJumpRequest(value: unknown) {
  const data = requireRecord(value, 'The small-craft jump request is malformed.');
  requireExactKeys(data, [
    'sessionId', 'smallShipId', 'hostShipId', 'destination', 'instanceId', 'requestId',
    'expectedOrigin', 'expectedMovementRevision', 'expectedDockingRevision', 'expectedCycleRevision',
  ], 'small-craft jump');
  if (!isChartCoordinate(data.expectedOrigin)) return invalid('expectedOrigin must be a current chart coordinate.');
  if (typeof data.destination !== 'string' || !/^\d{4}$/.test(data.destination)) {
    return invalid('destination must be a four-digit star-chart coordinate.');
  }
  return {
    sessionId: requireSafeId(data.sessionId, 'sessionId'),
    smallShipId: requireSmallCraftId(data.smallShipId),
    hostShipId: requireSafeId(data.hostShipId, 'hostShipId'),
    expectedOrigin: data.expectedOrigin,
    destination: data.destination,
    instanceId: data.instanceId === undefined ? undefined : requireSafeId(data.instanceId, 'instanceId'),
    requestId: requireSafeId(data.requestId, 'requestId'),
    expectedMovementRevision: requireRevision(data.expectedMovementRevision, 'expectedMovementRevision'),
    expectedDockingRevision: requireRevision(data.expectedDockingRevision, 'expectedDockingRevision'),
    expectedCycleRevision: requireRevision(data.expectedCycleRevision, 'expectedCycleRevision'),
  } as const;
}

function authenticatedUid(
  dependencies: SmallShipJumpCallableDependencies,
  request: RawCallableRequest,
): string {
  const uid = request.auth?.uid;
  return dependencies.requireUid(typeof uid === 'string' && uid.length > 0 ? { uid } : undefined);
}

type Actor = Awaited<ReturnType<SmallShipJumpCallableDependencies['requireSmallShipCaptainAuthority']>>;
type Viewer = 'captain' | 'gm';

function viewerKind(actor: Actor, smallShipId: SmallShipId): Viewer {
  if (smallShipId !== 'gorgoneion' && smallShipId !== 'capybara-small') {
    return permissionDenied('Only the Gorgoneion or base small-ship Capybara has a Jump Drive authority.');
  }
  const role = actor.player.get('role');
  if (role === 'gm') return 'gm';
  if (role !== 'player' || actor.player.get('replacementRoleId') !== CAPTAIN_ROLE[smallShipId] ||
      actor.player.get('replacementStatus') != null || actor.player.get('activeConsoleRoleId') != null) {
    return permissionDenied(`The active ${smallShipId} Captain replacement role is required.`);
  }
  return 'captain';
}

function requireActiveSession(session: Pick<DocumentSnapshot, 'get'>): void {
  if (session.get('phase') !== 'active') precondition('Small-craft Jump Drive actions require an active game.');
  if (session.get('singlePlayerDemo') !== undefined && session.get('singlePlayerDemo') !== null) {
    precondition('Small-craft Jump Drive actions are unavailable in the single-player demo.');
  }
}

function currentTurn(session: Pick<DocumentSnapshot, 'get'>): number {
  const value = session.get('currentTurn');
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1) {
    return precondition('The current cycle is unavailable for small-craft movement.');
  }
  return value;
}

function coordinationTurn(session: DocumentSnapshot): number {
  requireActiveSession(session);
  const turn = currentTurn(session);
  const phase = turnPhaseState(session.get('turnPhase'));
  if (!phase || phase.turn !== turn || phase.timerPause) {
    return precondition('No current server phase is available for the Jump Drive.');
  }
  const decision = decideActionAuthorization({
    action: 'jump', actorScope: 'player', turnPhase: session.get('turnPhase'),
  });
  if (!decision.allowed || phaseFromTurnPhase(session.get('turnPhase')) !== 'coordination') {
    return precondition('Small-craft jumps are only available during Coordination Phase.');
  }
  return turn;
}

function activeCoreRoster(session: Pick<DocumentSnapshot, 'get'>): readonly string[] {
  const value = session.get('activeVesselIds');
  if (!Array.isArray(value) || value.length === 0 || value.some((id) => typeof id !== 'string') ||
      new Set(value).size !== value.length) {
    return precondition('The active core-fleet roster is unavailable.');
  }
  const roster = value as string[];
  if (roster.some((id) => !isResourceShipId(id))) return precondition('The active core-fleet roster is malformed.');
  return roster;
}

function smallShipState(session: Pick<DocumentSnapshot, 'get'>, smallShipId: SmallShipId): SmallShipState {
  const rawMap = session.get('smallShipStates');
  if (!isRecord(rawMap)) return precondition('This small craft has not been admitted to the session.');
  const state = parseSmallShipState(rawMap[smallShipId], smallShipId);
  if (!state) return precondition('The stored small-craft state is malformed; refresh before moving.');
  const input = {
    activeVesselIds: session.get('activeVesselIds'),
    smallShipStates: rawMap,
    smallShipId,
    expansion: session.get('expansion'),
    capybaraEnabled: session.get('capybaraEnabled'),
  };
  if (!isExtraShipStateMapValid(input)) return precondition('The small-craft admission projection is malformed.');
  if (state.dockingRevision < 1) return precondition('This small craft must be docked with an active host before use.');
  if (isSmallShipInMutiny(state)) return precondition('A small craft in mutiny cannot jump.');
  return state;
}

function requireLockedChart(session: Pick<DocumentSnapshot, 'get'>): ChartId {
  const chart = session.get('chartId');
  if ((session.get('chartSelectionLocked') !== true && session.get('configurationLocked') !== true) ||
      (chart !== 'A' && chart !== 'B' && chart !== 'C')) {
    return precondition('The locked star chart is unavailable for small-craft movement.');
  }
  return chart;
}

function requireActiveHost(
  session: Pick<DocumentSnapshot, 'get'>,
  smallShip: SmallShipState,
  requestedHost: string,
): string {
  const roster = activeCoreRoster(session);
  if (smallShip.hostShipId === null || smallShip.hostShipId !== requestedHost ||
      !isResourceShipId(requestedHost) || !roster.includes(requestedHost)) {
    return precondition('The small craft is no longer docked with that active host.');
  }
  return requestedHost;
}

function hostCoordinateFromNavigation(
  navigation: DocumentSnapshot,
  hostShipId: string,
): string {
  const coordinates = navigation.get('shipGalacticCoordinates');
  const coordinate = isRecord(coordinates) ? coordinates[hostShipId] : undefined;
  if (!isChartCoordinate(coordinate)) return precondition('The current host coordinate is unavailable.');
  return coordinate;
}

function movementStateFromDocument(
  snapshot: DocumentSnapshot,
  sessionId: string,
  smallShipId: SmallShipId,
  effectiveCoordinate: string | null,
): SmallShipMovementAuthority | undefined {
  if (!snapshot.exists) {
    return effectiveCoordinate === null
      ? undefined
      : emptySmallShipMovementState(sessionId, smallShipId, effectiveCoordinate);
  }
  const movement = parseSmallShipMovementState(snapshot.data(), sessionId, smallShipId);
  if (!movement) return precondition('The stored small-craft movement authority is malformed.');
  return effectiveCoordinate === null ? movement : { ...movement, coordinate: effectiveCoordinate };
}

function chartCoordinates(chart: ChartId): ReadonlySet<string> {
  return new Set(Object.entries(organiserSitesForChart(chart))
    .filter(([coordinate, site]) => isChartCoordinate(coordinate) && (coordinate === '0000' || site.code !== ''))
    .map(([coordinate]) => coordinate));
}

function entitledKnownCoordinates(
  discovery: DocumentSnapshot,
  navigation: DocumentSnapshot,
  uid: string,
  movement: SmallShipMovementAuthority | undefined,
  currentCoordinate: string | null,
  chart: ChartId,
): readonly string[] {
  const navigationData = navigation.data();
  const missionCoordinates = parseMissionExploredCoordinatesByUid(navigationData?.missionExploredCoordinatesByUid);
  if (!missionCoordinates) return precondition('Private movement-discovery authority is malformed.');
  const navigationRevision = navigation.get('revision');
  const projectionRevision = discovery.get('revision');
  if (discovery.exists && projectionRevision !== undefined && navigationRevision !== undefined &&
      projectionRevision !== navigationRevision) {
    return precondition('Navigation knowledge changed. Refresh the current Captain projection.');
  }
  let projectedCoordinates: readonly string[] = [];
  if (discovery.exists) {
    const rawCoordinates = discovery.get('knownCoordinates');
    if (!Array.isArray(rawCoordinates) || rawCoordinates.some((coordinate) => !isChartCoordinate(coordinate))) {
      return precondition('The current Captain discovery projection is malformed.');
    }
    projectedCoordinates = rawCoordinates as string[];
  }
  const privateArrivals = movement?.captainArrivalsByUid[uid] ?? [];
  const known = new Set([
    ...projectedCoordinates,
    ...(missionCoordinates[uid] ?? []),
    ...privateArrivals,
    ...(currentCoordinate === null ? [] : [currentCoordinate]),
  ]);
  const legalCoordinates = chartCoordinates(chart);
  return STAR_CHART_COORDINATES.filter((coordinate) => known.has(coordinate) && legalCoordinates.has(coordinate));
}

function destinationChoices(
  smallShipId: SmallShipId,
  origin: string | null,
  knownCoordinates: readonly string[],
): readonly SmallShipJumpDestination[] {
  if (origin === null) return [];
  return knownCoordinates.flatMap((coordinate) => {
    if (coordinate === origin) return [];
    const length = jumpLengthBetween(origin, coordinate);
    return length ? [{ coordinate, length, fuelCost: jumpFuelCost(smallShipId, length, false) }] : [];
  });
}

function hostFuelFromSession(session: Pick<DocumentSnapshot, 'get'>, hostShipId: string): number {
  const resources = session.get('shipResources');
  const host = isRecord(resources) ? resources[hostShipId] : undefined;
  if (!isRecord(host) || typeof host.fuel !== 'number' || !Number.isSafeInteger(host.fuel) || host.fuel < 0) {
    return precondition('The current host fuel ledger is unavailable.');
  }
  return host.fuel;
}

function hostDamageFromSession(session: Pick<DocumentSnapshot, 'get'>, hostShipId: string) {
  const damage = shipDamage(session.get('shipDamage'))[hostShipId] ?? { damagedSystemIds: [], destroyed: false };
  if (damage.destroyed) return precondition('A destroyed host cannot provide fuel for a small-craft jump.');
  return damage;
}

function requireNoWolfAttack(attack: DocumentSnapshot): void {
  if (attack.exists && wolfAttackBlocksNormalMovement(attack.data())) {
    precondition('The Wolf attack awaits facilitator resolution; normal movement remains blocked.');
  }
}

function safeWorkspace(
  viewer: Viewer,
  sessionId: string,
  smallShipId: SmallShipId,
  actorUid: string,
  state: SmallShipState,
  movement: SmallShipMovementAuthority | undefined,
  currentCoordinate: string | null,
  turn: number,
  phase: string,
  fuel: number | null,
  knownCoordinates?: readonly string[],
): Data {
  const base = {
    viewer, sessionId, smallShipId, currentCoordinate,
    hostShipId: state.hostShipId,
    movementRevision: movement?.revision ?? 0,
    dockingRevision: state.dockingRevision,
    currentTurn: turn,
    phase,
  };
  if (viewer === 'gm') return base;
  return {
    ...base,
    actorUid,
    cycleRevision: state.cycle.revision,
    cycleStep: state.cycle.step,
    cycleTurn: state.cycle.turn ?? null,
    cycleCharges: [...state.cycle.charges],
    charged: state.cycle.turn === turn && state.cycle.charges.includes('jump-drive'),
    hostFuel: fuel,
    knownDestinations: destinationChoices(smallShipId, currentCoordinate, knownCoordinates ?? []),
    arrivalCoordinates: [...(movement?.captainArrivalsByUid[actorUid] ?? [])],
  };
}

function fingerprint(value: Data): Data {
  return {
    kind: 'jump', sessionId: value.sessionId, smallShipId: value.smallShipId,
    actorUid: value.actorUid, instanceId: value.instanceId, hostShipId: value.hostShipId,
    destination: value.destination, expectedOrigin: value.expectedOrigin,
    expectedMovementRevision: value.expectedMovementRevision,
    expectedDockingRevision: value.expectedDockingRevision, expectedCycleRevision: value.expectedCycleRevision,
  };
}

function sameFingerprint(value: unknown, expected: Data): boolean {
  if (!isRecord(value)) return false;
  return Object.keys(expected).every((key) => value[key] === expected[key]) &&
    Object.keys(value).length === Object.keys(expected).length;
}

function receiptReply(snapshot: DocumentSnapshot, expected: Data, uid: string): Data | undefined {
  if (!snapshot.exists) return undefined;
  if (snapshot.get('actorUid') !== uid || !sameFingerprint(snapshot.get('fingerprint'), expected)) {
    return precondition('This request id was already used for a different small-craft jump or actor.');
  }
  const reply = snapshot.get('reply');
  if (!isRecord(reply) || !['stale', 'committed', 'replayed'].includes(String(reply.status))) {
    return precondition('The stored small-craft jump has no replayable result.');
  }
  return reply.status === 'stale' ? reply : { ...reply, status: 'replayed' };
}

function writeReceipt(
  tx: Transaction,
  ref: ReturnType<MovementDatabase['doc']>,
  uid: string,
  fingerprintValue: Data,
  reply: Data,
  serverTimestamp: () => unknown,
): void {
  tx.set(ref, {
    actorUid: uid,
    fingerprint: fingerprintValue,
    reply,
    createdAt: serverTimestamp(),
  });
}

function staleReply(
  sessionId: string,
  smallShipId: SmallShipId,
  requestId: string,
  expectedMovementRevision: number,
  currentMovementRevision: number,
  expectedDockingRevision: number,
  currentDockingRevision: number,
  expectedCycleRevision: number,
  currentCycleRevision: number,
  expectedOrigin: string,
  currentOrigin: string,
): Data {
  return {
    status: 'stale', sessionId, smallShipId, requestId,
    expectedOrigin, currentOrigin,
    expectedMovementRevision, currentMovementRevision,
    expectedDockingRevision, currentDockingRevision,
    expectedCycleRevision, currentCycleRevision,
  };
}

function toCallableError(error: unknown): never {
  if (error instanceof HttpsError) throw error;
  if (error instanceof Error) throw new HttpsError('failed-precondition', error.message);
  throw new HttpsError('internal', 'The small-craft Jump Drive request could not be completed.');
}

export function createSmallShipJumpCallables(dependencies: SmallShipJumpCallableDependencies) {
  const getSmallShipJumpWorkspace = async (request: RawCallableRequest) => {
    try {
      const parsed = parseWorkspaceRequest(request.data);
      const uid = authenticatedUid(dependencies, request);
      return await dependencies.db.runTransaction(async (tx) => {
        const authority = await dependencies.requireSmallShipCaptainAuthority(
          tx, parsed.sessionId, uid, parsed.instanceId, parsed.smallShipId,
        );
        if (!authority.session.exists) throw new HttpsError('not-found', 'No such session.');
        const viewer = viewerKind(authority, parsed.smallShipId);
        const session = authority.session;
        dependencies.requireSmallShipMode(session, parsed.smallShipId);
        requireActiveSession(session);
        const state = smallShipState(session, parsed.smallShipId);
        const chart = requireLockedChart(session);
        const turn = currentTurn(session);
        const hostShipId = state.hostShipId;
        const [navigation, movementSnapshot, discovery] = await Promise.all([
          tx.get(dependencies.db.doc(navigationStateDocumentPath(parsed.sessionId))),
          tx.get(dependencies.db.doc(smallShipMovementDocumentPath(parsed.sessionId, parsed.smallShipId))),
          viewer === 'captain'
            ? tx.get(dependencies.db.doc(`sessions/${parsed.sessionId}/playerDiscoveries/${uid}`))
            : Promise.resolve(undefined),
        ]);
        const currentCoordinate = hostShipId === null
          ? undefined
          : hostCoordinateFromNavigation(navigation, requireActiveHost(session, state, hostShipId));
        const movement = movementStateFromDocument(
          movementSnapshot, parsed.sessionId, parsed.smallShipId, currentCoordinate ?? null,
        );
        const effectiveCoordinate = currentCoordinate ?? movement?.coordinate ?? null;
        const hostFuel = hostShipId === null ? null : hostFuelFromSession(session, hostShipId);
        const knownCoordinates = viewer === 'captain'
          ? entitledKnownCoordinates(
            discovery!, navigation, uid, movement, effectiveCoordinate, chart,
          )
          : undefined;
        return safeWorkspace(
          viewer, parsed.sessionId, parsed.smallShipId, uid, state, movement,
          effectiveCoordinate, turn, phaseFromTurnPhase(session.get('turnPhase')),
          hostFuel, knownCoordinates,
        );
      });
    } catch (error) {
      return toCallableError(error);
    }
  };

  const jumpSmallShip = async (request: RawCallableRequest) => {
    try {
      const parsed = parseJumpRequest(request.data);
      const uid = authenticatedUid(dependencies, request);
      const expected = fingerprint({ ...parsed, actorUid: uid, instanceId: parsed.instanceId ?? null });
      const sessionRef = dependencies.db.doc(`sessions/${parsed.sessionId}`);
      const movementRef = dependencies.db.doc(smallShipMovementDocumentPath(parsed.sessionId, parsed.smallShipId));
      const requestRef = dependencies.db.doc(smallShipJumpRequestDocumentPath(parsed.sessionId, parsed.requestId));
      const navigationRef = dependencies.db.doc(navigationStateDocumentPath(parsed.sessionId));
      const discoveryRef = dependencies.db.doc(`sessions/${parsed.sessionId}/playerDiscoveries/${uid}`);
      const attackRef = dependencies.db.doc(`sessions/${parsed.sessionId}/wolfAttackState/current`);
      const operationTime = dependencies.now();
      if (!Number.isFinite(operationTime.getTime())) precondition('The server clock is unavailable.');
      return await dependencies.db.runTransaction(async (tx) => {
        const authority = await dependencies.requireSmallShipCaptainAuthority(
          tx, parsed.sessionId, uid, parsed.instanceId, parsed.smallShipId,
        );
        if (!authority.session.exists) throw new HttpsError('not-found', 'No such session.');
        if (viewerKind(authority, parsed.smallShipId) !== 'captain') {
          return permissionDenied('Only the entitled small-craft Captain may jump this vessel.');
        }
        const prior = await tx.get(requestRef);
        const replay = receiptReply(prior, expected, uid);
        if (replay) return replay;
        const session = authority.session;
        dependencies.requireSmallShipMode(session, parsed.smallShipId);
        const turn = coordinationTurn(session);
        const state = smallShipState(session, parsed.smallShipId);
        const hostShipId = requireActiveHost(session, state, parsed.hostShipId);
        try {
          requireMissionCraftMovementAvailable(session.get('missionCraftCommitments'), [parsed.smallShipId, hostShipId]);
        } catch (error) {
          precondition(error instanceof Error ? error.message : 'Mission movement is unavailable.');
        }
        const [navigation, movementSnapshot, discovery, attack] = await Promise.all([
          tx.get(navigationRef), tx.get(movementRef), tx.get(discoveryRef), tx.get(attackRef),
        ]);
        requireNoWolfAttack(attack);
        const currentCoordinate = hostCoordinateFromNavigation(navigation, hostShipId);
        const movement = movementStateFromDocument(movementSnapshot, parsed.sessionId, parsed.smallShipId, currentCoordinate);
        if (!movement) return precondition('The small craft has no movement authority.');
        const chart = requireLockedChart(session);
        const knownCoordinates = entitledKnownCoordinates(
          discovery, navigation, uid, movement, currentCoordinate, chart,
        );
        const currentMovementRevision = movement.revision;
        const currentDockingRevision = state.dockingRevision;
        const currentCycleRevision = state.cycle.revision;
        if (parsed.expectedOrigin !== currentCoordinate ||
            parsed.expectedMovementRevision !== currentMovementRevision ||
            parsed.expectedDockingRevision !== currentDockingRevision ||
            parsed.expectedCycleRevision !== currentCycleRevision) {
          const stale = staleReply(
            parsed.sessionId, parsed.smallShipId, parsed.requestId,
            parsed.expectedMovementRevision, currentMovementRevision,
            parsed.expectedDockingRevision, currentDockingRevision,
            parsed.expectedCycleRevision, currentCycleRevision,
            parsed.expectedOrigin, currentCoordinate,
          );
          writeReceipt(tx, requestRef, uid, expected, stale, dependencies.serverTimestamp);
          return stale;
        }
        if (!knownCoordinates.includes(parsed.destination)) {
          return precondition('Choose a destination currently known to this Captain.');
        }
        if (state.cycle.step !== 0 || state.cycle.turn !== turn || !state.cycle.charges.includes('jump-drive')) {
          return precondition('Charge the small craft Jump Drive during Team Phase before departure.');
        }
        if (movement.lastJumpTurn === turn) return precondition('This small craft has already jumped this cycle.');
        const hostDamage = hostDamageFromSession(session, hostShipId);
        const hostFuel = hostFuelFromSession(session, hostShipId);
        const result = resolveJumpAttempt({
          shipId: parsed.smallShipId,
          origin: currentCoordinate,
          destination: parsed.destination,
          currentTurn: turn,
          fuel: hostFuel,
          charged: true,
          damaged: false,
          upgraded: false,
          now: operationTime,
          transitionId: `small-ship-jump-${parsed.requestId}`,
          state: movement.lastJumpTurn === null ? {} : { lastJumpTurn: movement.lastJumpTurn },
        });
        if (result.status !== 'jumped') {
          return precondition('Choose a reachable known destination for this small-craft jump.');
        }
        if (movement.revision >= Number.MAX_SAFE_INTEGER - 1 ||
            state.dockingRevision >= Number.MAX_SAFE_INTEGER - 1 ||
            state.cycle.revision >= Number.MAX_SAFE_INTEGER - 1) {
          return precondition('A small-craft movement revision is exhausted.');
        }
        if (hostDamage.destroyed) return precondition('A destroyed host cannot provide fuel for a small-craft jump.');
        const nextMovement: SmallShipMovementAuthority = {
          ...movement,
          coordinate: parsed.destination,
          revision: movement.revision + 1,
          lastJumpTurn: turn,
          captainArrivalsByUid: {
            ...movement.captainArrivalsByUid,
            [uid]: [...new Set([
              ...(movement.captainArrivalsByUid[uid] ?? []), currentCoordinate, parsed.destination,
            ])],
          },
        };
        const nextState: SmallShipState = {
          ...state,
          hostShipId: null,
          dockingRevision: state.dockingRevision + 1,
          cycle: {
            ...state.cycle,
            revision: state.cycle.revision + 1,
            charges: state.cycle.charges.filter((charge) => charge !== 'jump-drive'),
          },
        };
        const reply: Data = {
          status: 'committed', sessionId: parsed.sessionId, smallShipId: parsed.smallShipId,
          requestId: parsed.requestId, origin: currentCoordinate, destination: parsed.destination,
          length: result.length, fuelCost: result.fuelCost,
          remainingHostFuel: result.remainingFuel,
          expectedMovementRevision: parsed.expectedMovementRevision,
          movementRevision: nextMovement.revision,
          expectedDockingRevision: parsed.expectedDockingRevision,
          dockingRevision: nextState.dockingRevision,
          expectedCycleRevision: parsed.expectedCycleRevision,
          cycleRevision: nextState.cycle.revision,
          detached: true,
        };
        tx.update(sessionRef, {
          [`shipResources.${hostShipId}.fuel`]: result.remainingFuel,
          [`smallShipStates.${parsed.smallShipId}`]: nextState,
          updatedAt: dependencies.serverTimestamp(),
        });
        tx.set(movementRef, nextMovement);
        writeReceipt(tx, requestRef, uid, expected, reply, dependencies.serverTimestamp);
        return reply;
      });
    } catch (error) {
      return toCallableError(error);
    }
  };

  return { getSmallShipJumpWorkspace, jumpSmallShip };
}
