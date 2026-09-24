import { commissarPurgeAuthorityIsCurrent } from './commissarPurgeAuthority';
import { signInAnonymously } from 'firebase/auth';
import { httpsCallable } from 'firebase/functions';
import { auth, functions } from './firebase';
import { useSessionStore } from '@/store/useSessionStore';
import type { PendingCommand } from '@/store/useSessionStore';
import type {
  FacilitatorRuleCall,
  GameSession,
  GmInstance,
  Player,
  SetupReceipt,
  ShipJumpState,
  ShipJumpTransition,
  WolfAttackPreparation,
  WolfAttackPreparationModifierId,
  WolfAttackPreparationTargetAssignment,
  WolfAttackDeclarationResult,
  DioneMaliadesLaunchResult,
  DioneMaliadesLaunchView,
  WolfCommanderTargetingView,
  AegisCommandAndControlResult,
  AegisCommandAndControlView,
  WolfAttackTargetMode,
  WolfAttackWindow,
  WolfAttackWindowStatus,
  WolfCultIntelligence,
  PendingWolfHackingAlert,
  AcknowledgeWolfHackingAlertResult,
  ArrestPosseCalculation,
  ArbourVision,
  SessionPhase,
  CommissarPurgeAuthority,
} from '@/types/game';
import { parseEntityId } from '@/types/identifiers';
import { AEGIS_FIGHTER_WING_CAPACITY } from '@/data/aegisConsoles';
import type { VesselActionEnvelope } from '@/types/vesselAction';
import { resourcesForShip, type ResourceId, type ShipResourceInventory } from '@/data/resources';
import type { CounterStep } from './counterPreview';
import type { DiseaseOutbreakDetails, CrisisKind, CrisisStateName, ZealotryResponseAction, CivilUnrestResolution } from '@/types/crisis';
import { normalizeShuttleManifest } from '@/data/shuttles';
import { normalizePressDispatch } from './pressDispatchState';
import { parseArrestPosseCalculation } from './firestore';
import {
  acceptCallableSessionAuthority,
} from './sessionSnapshotAuthority';
import {
  captureSessionAuthority,
  hasFreshSessionAuthority,
  isCurrentSessionAuthority,
  requireFreshSessionAuthority,
  type SessionAuthorityCheckpoint,
} from './sessionMutationAuthority';
import {
  turnLimitForSession,
  turnPhaseState,
  turnStateForPhaseContext,
  replaceTurnStateOnPhase,
} from './turnPhase';
import type { AirspaceWindow } from '@/types/game';
import {
  commandErrorCode,
  isRateLimitedCommandError,
  normalizeCommandError,
} from './commandErrors';

/**
 * The client's whole conversation with Firebase about sessions.
 *
 * Deliberately thin: it signs in, calls a callable, and drops the result into
 * the store. Creating a session and joining one are both server-authoritative --
 * `firestore.rules` denies session creation outright, and joining goes through a
 * function so that finding a table by its four-digit code never requires letting
 * a client list every session that exists.
 */

interface SessionReply {
  readonly session: GameSession;
  readonly player: Player;
}

const SESSION_PHASES: ReadonlySet<SessionPhase> = new Set([
  'lobby', 'casting', 'briefing', 'active', 'success', 'failure',
  'debrief', 'closed', 'retained-empty',
]);

function sessionPhase(value: unknown): SessionPhase | undefined {
  return typeof value === 'string' && SESSION_PHASES.has(value as SessionPhase)
    ? value as SessionPhase
    : undefined;
}

export interface SetupConfirmationInput {
  readonly playerCount: number;
  readonly chartId: 'A' | 'B' | 'C';
  readonly lockChart?: boolean;
  readonly expansion: 'base' | 'capybara' | 'none';
  readonly turnLimit: 6 | 7 | 8;
  readonly dioneEnabled: boolean;
  readonly capybaraEnabled: boolean;
  readonly universalArbourEnabled: boolean;
  readonly wolfCultEnabled: boolean;
  readonly activeRoleIds: readonly string[];
}

export interface FacilitatorResponsibilityChange {
  readonly responsibility: 'main' | 'assistant';
  readonly mode: 'share' | 'handoff' | 'drop';
  readonly targetInstanceId?: string;
}

export interface CreateSessionOptions {
  readonly playerCount?: number;
  readonly chartId?: 'A' | 'B' | 'C';
  readonly expansion?: 'base' | 'capybara' | 'none';
  readonly turnLimit?: 6 | 7 | 8;
  readonly dioneEnabled?: boolean;
  readonly capybaraEnabled?: boolean;
  readonly universalArbourEnabled?: boolean;
  readonly wolfCultEnabled?: boolean;
}

const TERMINAL_RESUME_ERRORS = new Set([
  'functions/not-found',
  'functions/permission-denied',
  'functions/failed-precondition',
]);
const TRANSIENT_COMMAND_ERRORS = new Set([
  'functions/unavailable',
  'functions/deadline-exceeded',
  'functions/resource-exhausted',
  'functions/internal',
  'functions/unknown',
]);
export const CONNECT_RETRY_INTERVAL_MS = 2_000;

interface ResumeRateLimitHold {
  readonly sessionId: string;
  readonly uid: string;
  readonly retryAtMs: number;
  readonly requestGeneration: number;
}

let latestConnectAttemptGeneration = 0;
let resumeRateLimitHold: ResumeRateLimitHold | null = null;

function rateLimitHoldMatches(hold: ResumeRateLimitHold, sessionId: string, uid: string): boolean {
  return hold.sessionId === sessionId && hold.uid === uid;
}

function rememberConnectRateLimit(
  sessionId: string | undefined,
  uid: string | undefined,
  requestGeneration: number,
  cause: unknown,
): boolean {
  const state = useSessionStore.getState();
  const authenticatedUid = auth().currentUser?.uid;
  if (
    requestGeneration !== latestConnectAttemptGeneration ||
    !sessionId || !uid || state.session?.id !== sessionId || authenticatedUid !== uid
  ) return false;
  const retryAfterSeconds = normalizeCommandError(cause).retryAfterSeconds ?? 60;
  resumeRateLimitHold = {
    sessionId,
    uid,
    retryAtMs: Date.now() + retryAfterSeconds * 1_000,
    requestGeneration,
  };
  return true;
}

function clearConnectRateLimitAfterAuthority(sessionId: string, uid: string, requestGeneration: number): void {
  const hold = resumeRateLimitHold;
  const state = useSessionStore.getState();
  if (
    requestGeneration === latestConnectAttemptGeneration &&
    state.session?.id === sessionId && state.me?.uid === uid &&
    state.sessionSnapshotFreshness === 'server' && auth().currentUser?.uid === uid
  ) {
    if (hold && rateLimitHoldMatches(hold, sessionId, uid) && hold.requestGeneration < requestGeneration) {
      resumeRateLimitHold = null;
    }
    if (state.communicationError?.kind === 'rate-limited') state.setCommunicationError(null);
  }
}

function setConnectRateLimitWait(seconds: number): void {
  useSessionStore.getState().setCommunicationError(normalizeCommandError({
    code: 'functions/resource-exhausted',
    details: { commandError: 'rate-limited', retryAfterSeconds: seconds },
  }));
}

export const COMMAND_RECONNECT_WINDOW_MS = 15_000;
export type CommandDisposition = 'applied' | 'queued' | 'stale' | 'awaiting-officer';
export type TurnStartReplayAudience = 'gm' | 'everyone';

const SAFE_STALE_COMMAND_MESSAGE =
  'The live session changed before this command committed. Refresh the live state and retry.';
const SAFE_AMBIGUOUS_COMMAND_MESSAGE =
  'The connection was lost before the server confirmed this command. Review the live state before retrying.';

let localTurnStartReplayToken = 0;

function isTurnStartAnnouncement(value: unknown): value is NonNullable<GameSession['turnStartAnnouncement']> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const announcement = value as Readonly<Record<string, unknown>>;
  return (
    typeof announcement.turn === 'number' && Number.isSafeInteger(announcement.turn) && announcement.turn >= 1 &&
    typeof announcement.survivorPopulation === 'number' &&
    Number.isSafeInteger(announcement.survivorPopulation) && announcement.survivorPopulation >= 0 &&
    (announcement.revision === undefined ||
      (typeof announcement.revision === 'number' && Number.isSafeInteger(announcement.revision) && announcement.revision >= 0))
  );
}

function isCanonicalSessionSetup(value: unknown): value is NonNullable<GameSession['setup']> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const setup = value as Record<string, unknown>;
  return (
    typeof setup.playerCount === 'number' && Number.isSafeInteger(setup.playerCount) && setup.playerCount > 0 &&
    (setup.chartId === 'A' || setup.chartId === 'B' || setup.chartId === 'C') &&
    (setup.expansion === 'base' || setup.expansion === 'capybara' || setup.expansion === 'none') &&
    (setup.turnLimit === 6 || setup.turnLimit === 7 || setup.turnLimit === 8) &&
    typeof setup.dioneEnabled === 'boolean' &&
    typeof setup.capybaraEnabled === 'boolean' &&
    (setup.universalArbourEnabled === undefined || typeof setup.universalArbourEnabled === 'boolean') &&
    (setup.wolfCultEnabled === undefined || typeof setup.wolfCultEnabled === 'boolean') &&
    Array.isArray(setup.activeRoleIds) && setup.activeRoleIds.every((roleId) => typeof roleId === 'string') &&
    Array.isArray(setup.activeVesselIds) && setup.activeVesselIds.every((vesselId) => typeof vesselId === 'string')
  );
}

function errorCode(cause: unknown): string | undefined {
  if (typeof cause !== 'object' || cause === null || !('code' in cause)) return undefined;
  return typeof cause.code === 'string' ? cause.code : commandErrorCode(cause);
}

function interception(cause: unknown) {
  return normalizeCommandError(cause);
}

function isTransientCommandError(cause: unknown): boolean {
  return !isRateLimitedCommandError(cause) && TRANSIENT_COMMAND_ERRORS.has(errorCode(cause) ?? '');
}

function deviceLabel(): string {
  const platform = window.navigator.platform || 'Unknown device';
  const agent = window.navigator.userAgent || 'Unknown browser';
  return `${platform} / ${agent}`.slice(0, 160);
}

function commandId(): string {
  return window.crypto.randomUUID();
}

interface PendingArrestPosseAttempt {
  readonly sessionId: string;
  readonly instanceId: string;
  readonly expectedRevision: number;
  readonly targetUid: string;
  readonly defenders: number;
  readonly adjustment?: -1 | 1;
  readonly requestId: string;
}

let pendingArrestPosseAttempt: PendingArrestPosseAttempt | null = null;

interface PendingStartRequest {
  readonly sessionId: string;
  readonly instanceId: string;
  readonly expectedSetupRevision: number;
  readonly requestId: string;
}

// A start is not placed in the general outbox because it must never be
// replayed by a different GM instance. Keep only an ambiguous transport
// attempt, keyed to the exact authority inputs, so a retry can ask the server
// for its committed/replayed result instead of creating a second start.
let pendingStartRequest: PendingStartRequest | null = null;

function sameStartAttempt(
  request: PendingStartRequest | null,
  sessionId: string,
  instanceId: string,
  expectedSetupRevision: number,
): request is PendingStartRequest {
  return request !== null &&
    request.sessionId === sessionId &&
    request.instanceId === instanceId &&
    request.expectedSetupRevision === expectedSetupRevision;
}

function expectedSetupRevision(session: GameSession): number {
  return Number.isSafeInteger(session.setupRevision) && (session.setupRevision ?? 0) >= 0
    ? session.setupRevision ?? 0
    : 0;
}

function queue(command: PendingCommand): void {
  useSessionStore.getState().enqueueCommand(command);
}

/** Keep session-service call sites explicit about their authority checkpoint. */
function sessionAuthorityCheckpoint(
  sessionId: string,
  uid: string | undefined,
): SessionAuthorityCheckpoint | undefined {
  return captureSessionAuthority(sessionId, uid);
}

function sessionAuthorityUid(store: {
  readonly me: Player | null;
  readonly gmInstance: GmInstance | null;
}): string | undefined {
  return store.me?.uid ?? store.gmInstance?.uid ?? auth().currentUser?.uid;
}

function commandAuthorityCheckpoint(
  command: PendingCommand,
  store: { readonly me: Player | null; readonly gmInstance: GmInstance | null },
): SessionAuthorityCheckpoint | undefined {
  const sessionId = (command.payload as { readonly sessionId?: unknown }).sessionId;
  return typeof sessionId === 'string'
    ? sessionAuthorityCheckpoint(sessionId, sessionAuthorityUid(store))
    : undefined;
}

/** Partial callable replies must not patch over a newer accepted snapshot. */
function authorityCheckpointIsCurrent(
  checkpoint: SessionAuthorityCheckpoint | undefined,
  allowConnecting = false,
): boolean {
  return isCurrentSessionAuthority(checkpoint, allowConnecting);
}

function wolfCommanderAuthorityCheckpointIsCurrent(
  sessionId: string,
  checkpoint: SessionAuthorityCheckpoint | undefined,
): boolean {
  const store = useSessionStore.getState();
  return store.session?.id === sessionId && store.me?.sessionId === sessionId &&
    store.me?.replacementRoleId === 'wolf-commander' && authorityCheckpointIsCurrent(checkpoint);
}

function aegisExecutiveOfficerAuthorityCheckpointIsCurrent(
  sessionId: string,
  checkpoint: SessionAuthorityCheckpoint | undefined,
): boolean {
  const store = useSessionStore.getState();
  return store.session?.id === sessionId && store.me?.sessionId === sessionId &&
    store.me?.role === 'player' && store.me?.activeConsoleRoleId === 'executive-officer' &&
    authorityCheckpointIsCurrent(checkpoint);
}

function facilitatorRuleCallAuthorityCheckpointIsCurrent(
  sessionId: string,
  instanceId: string,
  checkpoint: SessionAuthorityCheckpoint | undefined,
  allowConnecting = false,
): boolean {
  const store = useSessionStore.getState();
  return store.session?.id === sessionId &&
    store.me?.sessionId === sessionId &&
    store.me.role === 'gm' &&
    store.gmInstance?.sessionId === sessionId &&
    store.gmInstance.uid === store.me.uid &&
    store.gmInstance.id === instanceId &&
    authorityCheckpointIsCurrent(checkpoint, allowConnecting);
}

function isCleanupCommand(command: PendingCommand): boolean {
  return command.kind === 'disconnectFromSession' || command.kind === 'logoutGmAccess';
}

/**
 * A transient callable failure is ambiguous: the server may have committed
 * before the acknowledgement was lost. Only commands with a stable receipt
 * identity, the generation-bound disconnect, or an explicitly state-idempotent
 * operation may be replayed from the persisted outbox.
 */
function isReplaySafeCommand(command: PendingCommand): boolean {
  if (command.kind === 'disconnectFromSession' || command.kind === 'logoutGmAccess' ||
      command.kind === 'claimGmInstance' || command.kind === 'setGmControlsLocked' ||
      command.kind === 'setDebriefMode' || command.kind === 'popShipConfetti') return true;
  // Persisted JSON can contain extra fields. A request ID proves replay
  // safety only for a callable with an actual server receipt contract.
  switch (command.kind) {
    case 'kickGmInstance':
    case 'releaseGmInstance':
    case 'kickPlayer':
    case 'setPressEnabled':
    case 'confirmSetup':
    case 'setFacilitatorResponsibility':
    case 'setFacilitatorCensusNote':
    case 'deliverWolfCultIntelligence':
    case 'authorArbourVision':
    case 'authorFacilitatorRuleCall':
    case 'setCandidatePlanCheckpoint':
    case 'transitionCrisis':
    case 'setDiseaseQuarantine':
    case 'admitVoyage33':
    case 'recordZealotryResponse':
    case 'submitCivilUnrestGrievance':
    case 'recordCivilUnrestResolution':
    case 'claimSeat':
    case 'releaseSeat':
    case 'assignRole':
    case 'releaseRole':
    case 'fleeDestroyedShip':
      return typeof command.payload.requestId === 'string' && command.payload.requestId.length > 0;
    default:
      return false;
  }
}

/**
 * Only a mutation that began from accepted server state may survive a transient
 * transport failure. Older persisted commands intentionally have no marker and
 * are discarded during reconnect rather than gaining authority from a cache.
 */
function queueFromServerAuthority(command: PendingCommand): void {
  queue({ ...command, queuedWithServerAuthority: true });
}

function isRevisionedAuthorityCommand(command: PendingCommand): boolean {
  return command.kind === 'confirmSetup' ||
    command.kind === 'setFacilitatorResponsibility' ||
    command.kind === 'claimSeat' ||
    command.kind === 'releaseSeat';
}

function isStaleAuthorityReply(command: PendingCommand, result: unknown): result is {
  readonly status: 'stale';
  readonly requestId: string;
  readonly expectedRevision: number;
  readonly currentRevision: number;
  readonly entity: 'setup' | 'facilitator' | 'seat';
  readonly seatId?: string;
} {
  if (!isRevisionedAuthorityCommand(command) || typeof result !== 'object' || result === null) return false;
  const reply = result as Record<string, unknown>;
  return reply.status === 'stale' &&
    typeof reply.requestId === 'string' &&
    typeof reply.expectedRevision === 'number' && Number.isSafeInteger(reply.expectedRevision) &&
    typeof reply.currentRevision === 'number' && Number.isSafeInteger(reply.currentRevision) &&
    (reply.entity === 'setup' || reply.entity === 'facilitator' || reply.entity === 'seat') &&
    (reply.entity !== 'seat' || typeof reply.seatId === 'string');
}

function recordStaleAuthorityReply(): void {
  useSessionStore.getState().setCommunicationError({
    kind: 'stale-revision',
    code: 'stale',
    message: SAFE_STALE_COMMAND_MESSAGE,
  });
}

function recordAmbiguousCommand(): void {
  useSessionStore.getState().setCommunicationError({
    kind: 'unknown',
    code: 'command-outcome-unknown',
    message: SAFE_AMBIGUOUS_COMMAND_MESSAGE,
  });
}

async function executeCommand(command: PendingCommand): Promise<unknown> {
  const call = httpsCallable<typeof command.payload, unknown>(functions(), command.kind);
  const reply = await call(command.kind === 'popShipConfetti'
    ? { ...command.payload, requestId: command.id }
    : command.payload);
  return reply.data;
}

function applyCommandResult(
  command: PendingCommand,
  result: unknown,
  checkpoint?: SessionAuthorityCheckpoint,
  allowConnecting = false,
): void {
  if (!isCleanupCommand(command) && !authorityCheckpointIsCurrent(checkpoint, allowConnecting)) return;
  const store = useSessionStore.getState();
  if (
    (command.kind === 'authorFacilitatorRuleCall' || command.kind === 'setCandidatePlanCheckpoint' || command.kind === 'recordZealotryResponse' || command.kind === 'recordCivilUnrestResolution') &&
    !facilitatorRuleCallAuthorityCheckpointIsCurrent(
      command.payload.sessionId,
      command.payload.instanceId,
      checkpoint,
      allowConnecting,
    )
  ) return;
  if (command.kind === 'logoutGmAccess') {
    store.clearGmAccess();
    if (store.gmInstance?.id === command.payload.instanceId) {
      store.setGmInstance(null);
      store.setMode(null);
      store.setLastRoute('/roles');
    }
    return;
  }
  if (command.kind === 'claimGmInstance') {
    if (
      typeof result === 'object' && result !== null && 'instance' in result &&
      typeof result.instance === 'object' && result.instance !== null
    ) {
      store.setGmInstance(result.instance as GmInstance);
      if (store.me) store.setMe({ ...store.me, role: 'gm' });
    }
    return;
  }
  if (
    command.kind === 'releaseGmInstance' &&
    store.gmInstance?.id === command.payload.targetInstanceId
  ) {
    store.setGmInstance(null);
    store.setMode(null);
    store.setLastRoute('/roles');
  }
  if (
    command.kind === 'confirmSetup' &&
    store.session?.id === command.payload.sessionId &&
    typeof result === 'object' && result !== null
  ) {
    const reply = result as Record<string, unknown>;
    const canonicalSetup = isCanonicalSessionSetup(reply.setup)
      ? {
        ...reply.setup,
        universalArbourEnabled: reply.setup.universalArbourEnabled === true,
        wolfCultEnabled: reply.setup.wolfCultEnabled === true,
      }
      : null;
    const canonicalRoleIds = canonicalSetup?.activeRoleIds ?? (
      Array.isArray(reply.activeRoleIds)
        ? reply.activeRoleIds.filter((roleId): roleId is string => typeof roleId === 'string')
        : undefined
    );
    const canonicalVesselIds = canonicalSetup?.activeVesselIds ?? (
      Array.isArray(reply.activeVesselIds)
        ? reply.activeVesselIds.filter((vesselId): vesselId is string => typeof vesselId === 'string')
        : undefined
    );
    const nextSession = {
      ...store.session,
      ...(typeof reply.chartSelectionLocked === 'boolean'
        ? { chartSelectionLocked: reply.chartSelectionLocked } : {}),
      ...(typeof reply.setupRevision === 'number' && Number.isSafeInteger(reply.setupRevision) && reply.setupRevision >= 0
        ? { setupRevision: reply.setupRevision } : {}),
      ...(canonicalSetup ? {
        setup: canonicalSetup,
        playerCount: canonicalSetup.playerCount,
        chartId: canonicalSetup.chartId,
        expansion: canonicalSetup.expansion,
        turnLimit: canonicalSetup.turnLimit,
        dioneEnabled: canonicalSetup.dioneEnabled,
        capybaraEnabled: canonicalSetup.capybaraEnabled,
        universalArbourEnabled: canonicalSetup.universalArbourEnabled === true,
        wolfCultEnabled: canonicalSetup.wolfCultEnabled === true,
      } : {}),
      ...(canonicalRoleIds ? { activeRoleIds: canonicalRoleIds } : {}),
      ...(canonicalVesselIds ? { activeVesselIds: canonicalVesselIds } : {}),
    } as GameSession;
    store.setSession(nextSession);
  }
  if (
    command.kind === 'fleeDestroyedShip' &&
    store.session?.id === command.payload.sessionId &&
    typeof result === 'object' && result !== null
  ) {
    const reply = result as Record<string, unknown>;
    const nextRevision = reply.setupRevision;
    if (typeof nextRevision === 'number' && Number.isSafeInteger(nextRevision) && nextRevision >= 0) {
      store.setSession({ ...store.session, setupRevision: nextRevision });
    }
    const escapeState = reply.escapeState;
    if (
      (reply.status === 'committed' || reply.status === 'replayed') &&
      reply.sessionId === command.payload.sessionId &&
      reply.targetUid === store.me?.uid &&
      typeof escapeState === 'object' && escapeState !== null &&
      !Array.isArray(escapeState) &&
      (((escapeState as Record<string, unknown>).status === 'fled') ||
        (escapeState as Record<string, unknown>).status === 'pending') &&
      typeof (escapeState as Record<string, unknown>).shipId === 'string' &&
      typeof (escapeState as Record<string, unknown>).destructionEventId === 'string' &&
      Number.isSafeInteger((escapeState as Record<string, unknown>).revision) &&
      ((escapeState as Record<string, unknown>).revision as number) >= 1 &&
      store.me
    ) {
      store.setMe({
        ...store.me,
        escapeState: escapeState as NonNullable<Player['escapeState']>,
        activeConsoleRoleId: null,
        seatId: null,
      });
    }
  }
  if (
    (command.kind === 'claimSeat' || command.kind === 'releaseSeat') &&
    store.session?.id === command.payload.sessionId &&
    typeof result === 'object' && result !== null
  ) {
    const reply = result as Record<string, unknown>;
    const nextRevision = reply.setupRevision;
    if (typeof nextRevision === 'number' && Number.isSafeInteger(nextRevision) && nextRevision >= 0) {
      store.setSession({ ...store.session, setupRevision: nextRevision });
    }
    if (reply.seatId === command.payload.seatId) {
      const me = store.me;
      if (command.kind === 'claimSeat' && me && me.sessionId === command.payload.sessionId) {
        store.setMe({ ...me, seatId: command.payload.seatId });
      } else if (command.kind === 'releaseSeat' && me?.seatId === command.payload.seatId) {
        store.setMe({ ...me, seatId: null });
      }
      store.setSeats(store.seats.map((seat) => seat.id === command.payload.seatId
        ? {
          ...seat,
          status: command.kind === 'claimSeat' ? 'claimed' : 'open',
          holderUid: command.kind === 'claimSeat' && typeof reply.holderUid === 'string'
            ? reply.holderUid
            : command.kind === 'claimSeat' ? store.me?.uid ?? seat.holderUid : null,
          claimedAt: command.kind === 'claimSeat' ? seat.claimedAt : null,
        }
      : seat));
    }
  }
  if (
    (command.kind === 'assignRole' || command.kind === 'releaseRole') &&
    store.session?.id === command.payload.sessionId &&
    typeof result === 'object' && result !== null
  ) {
    const nextRevision = (result as Record<string, unknown>).setupRevision;
    if (typeof nextRevision === 'number' && Number.isSafeInteger(nextRevision) && nextRevision >= 0) {
      store.setSession({ ...store.session, setupRevision: nextRevision });
    }
  }
  if (
    command.kind === 'setFacilitatorResponsibility' &&
    store.session?.id === command.payload.sessionId &&
    typeof result === 'object' && result !== null
  ) {
    const reply = result as Record<string, unknown>;
    const nextRevision = reply.setupRevision;
    if (typeof nextRevision === 'number' && Number.isSafeInteger(nextRevision) && nextRevision >= 0) {
      store.setSession({ ...store.session, setupRevision: nextRevision });
    }
    if (Array.isArray(reply.responsibilities) && store.gmInstance?.id === command.payload.instanceId) {
      const responsibilities = reply.responsibilities.filter(
        (responsibility): responsibility is 'main' | 'assistant' =>
          responsibility === 'main' || responsibility === 'assistant',
      );
      store.setGmInstance({
        ...store.gmInstance,
        responsibilities,
        ...(responsibilities.length > 0 ? { responsibility: responsibilities[0] } : {}),
      });
    }
  }
  if (
    command.kind === 'deliverWolfCultIntelligence' &&
    store.session?.id === command.payload.sessionId &&
    typeof result === 'object' && result !== null
  ) {
    const reply = result as Record<string, unknown>;
    if (
      (reply.status === 'committed' || reply.status === 'replayed') &&
      reply.sessionId === command.payload.sessionId &&
      typeof reply.recipientUid === 'string' && Number.isSafeInteger(reply.revision) &&
      (reply.revision as number) >= 1 && typeof reply.fortressCoordinate === 'string' &&
      typeof reply.suppliesCoordinate === 'string' && typeof reply.agentUid === 'string' &&
      typeof reply.codeWord === 'string' && reply.codeWord.trim().length > 0 &&
      reply.codeWord.length <= 80 && reply.label === 'WOLF INTEL'
    ) {
      store.setGmWolfCultIntelligence({
        sessionId: command.payload.sessionId,
        recipientUid: reply.recipientUid,
        revision: reply.revision as number,
        fortressCoordinate: reply.fortressCoordinate,
        suppliesCoordinate: reply.suppliesCoordinate,
        agentUid: reply.agentUid,
        codeWord: reply.codeWord,
        label: 'WOLF INTEL',
      } satisfies WolfCultIntelligence);
    }
  }
  if (
    command.kind === 'authorArbourVision' &&
    store.session?.id === command.payload.sessionId &&
    typeof result === 'object' && result !== null
  ) {
    const reply = result as Record<string, unknown>;
    if (
      (reply.status === 'committed' || reply.status === 'replayed') &&
      reply.sessionId === command.payload.sessionId &&
      reply.recipientUid === command.payload.targetUid &&
      Number.isSafeInteger(reply.revision) && (reply.revision as number) >= 1 &&
      (reply.kind === 'location' || reply.kind === 'danger' || reply.kind === 'suspicion') &&
      typeof reply.text === 'string' && reply.text.length > 0 && reply.text.length <= 240 &&
      reply.label === 'FACILITATOR CALL'
    ) {
      store.setGmArbourVision({
        sessionId: command.payload.sessionId,
        recipientUid: command.payload.targetUid,
        revision: reply.revision as number,
        kind: reply.kind,
        text: reply.text,
        label: 'FACILITATOR CALL',
      } satisfies ArbourVision);
    }
  }
  if (command.kind === 'setCapybaraEnabled' && store.session?.id === command.payload.sessionId) {
    const enabled =
      typeof result === 'object' && result !== null && 'capybaraEnabled' in result &&
      typeof result.capybaraEnabled === 'boolean'
        ? result.capybaraEnabled
        : undefined;
    if (enabled !== undefined) {
      store.setSession({ ...store.session, capybaraEnabled: enabled });
    }
  }
  if (command.kind === 'setDioneEnabled' && store.session?.id === command.payload.sessionId) {
    const enabled =
      typeof result === 'object' && result !== null && 'dioneEnabled' in result &&
      typeof result.dioneEnabled === 'boolean'
        ? result.dioneEnabled
        : undefined;
    if (enabled !== undefined) {
      store.setSession({ ...store.session, dioneEnabled: enabled });
    }
  }
  if (command.kind === 'setPressEnabled' && store.session?.id === command.payload.sessionId) {
    const enabled =
      typeof result === 'object' && result !== null && 'pressEnabled' in result &&
      typeof result.pressEnabled === 'boolean'
        ? result.pressEnabled
        : undefined;
    const revision =
      typeof result === 'object' && result !== null && 'revision' in result &&
      typeof result.revision === 'number' && Number.isSafeInteger(result.revision) && result.revision >= 0
        ? result.revision
        : undefined;
    if (enabled !== undefined && revision !== undefined) {
      store.setSession({
        ...store.session,
        pressEnabled: enabled,
        pressAvailabilityRevision: revision,
      });
      if (!enabled && store.me?.activeConsoleRoleId === 'press-officer') {
        store.setMe({ ...store.me, activeConsoleRoleId: null });
      }
    }
  }
  if (command.kind === 'setGmControlsLocked' && store.session?.id === command.payload.sessionId) {
    const locked =
      typeof result === 'object' && result !== null && 'gmControlsLocked' in result &&
      typeof result.gmControlsLocked === 'boolean'
        ? result.gmControlsLocked
        : undefined;
    if (locked !== undefined) {
      store.setSession({ ...store.session, gmControlsLocked: locked });
    }
  }
  if (command.kind === 'setDebriefMode' && store.session?.id === command.payload.sessionId) {
    const mode =
      typeof result === 'object' && result !== null && 'debriefMode' in result &&
      typeof result.debriefMode === 'object' && result.debriefMode !== null &&
      'active' in result.debriefMode && 'revision' in result.debriefMode &&
      typeof result.debriefMode.active === 'boolean' &&
      typeof result.debriefMode.revision === 'number' &&
      Number.isSafeInteger(result.debriefMode.revision) && result.debriefMode.revision >= 0
        ? { active: result.debriefMode.active, revision: result.debriefMode.revision }
        : undefined;
    if (mode) store.setSession({ ...store.session, debriefMode: mode });
  }
  if (
    (
      command.kind === 'setActiveRoleEnabled' ||
      command.kind === 'applyRolePreset' ||
      command.kind === 'setActiveRoleConfiguration'
    ) &&
    store.session?.id === command.payload.sessionId
  ) {
    const roleIds =
      typeof result === 'object' && result !== null && 'activeRoleIds' in result &&
      Array.isArray(result.activeRoleIds)
        ? result.activeRoleIds.filter((roleId): roleId is string => typeof roleId === 'string')
        : undefined;
    if (roleIds) store.setSession({ ...store.session, activeRoleIds: roleIds });
  }
  if (command.kind === 'popShipConfetti' && store.session?.id === command.payload.sessionId) {
    if (
      typeof result === 'object' && result !== null && 'status' in result &&
      result.status === 'awaiting-officer'
    ) return;
    if (command.payload.shipId === 'snn-press-shuttle') return;
    const used = store.session.confettiUsedShipIds ?? [];
    if (!used.includes(command.payload.shipId)) {
      store.setSession({
        ...store.session,
        confettiUsedShipIds: [...used, command.payload.shipId],
      });
    }
  }
  if (
    command.kind === 'authorFacilitatorRuleCall' &&
    store.session?.id === command.payload.sessionId &&
    typeof result === 'object' && result !== null
  ) {
    const reply = result as Record<string, unknown>;
    if (
      (reply.status === 'committed' || reply.status === 'replayed') &&
      reply.sessionId === command.payload.sessionId &&
      typeof reply.callId === 'string' && reply.callId === command.payload.requestId &&
      Number.isSafeInteger(reply.revision) && (reply.revision as number) >= 1 &&
      typeof reply.ambiguity === 'string' && reply.ambiguity.length > 0 && reply.ambiguity.length <= 240 &&
      typeof reply.source === 'string' && reply.source.length > 0 && reply.source.length <= 240 &&
      typeof reply.decision === 'string' && reply.decision.length > 0 && reply.decision.length <= 500 &&
      (reply.audience === 'gm-only' || reply.audience === 'selected-player') &&
      typeof reply.actorUid === 'string' && typeof reply.createdAt === 'string' &&
      reply.label === 'FACILITATOR RULE CALL'
    ) {
      store.setGmFacilitatorRuleCall({
        sessionId: command.payload.sessionId,
        callId: reply.callId,
        revision: reply.revision as number,
        ambiguity: reply.ambiguity,
        source: reply.source,
        decision: reply.decision,
        audience: reply.audience,
        ...(typeof reply.recipientUid === 'string' ? { recipientUid: reply.recipientUid } : {}),
        actorUid: reply.actorUid,
        createdAt: reply.createdAt,
        ...(typeof reply.supersedesCallId === 'string' ? { supersedesCallId: reply.supersedesCallId } : {}),
        label: 'FACILITATOR RULE CALL',
      } satisfies FacilitatorRuleCall);
    }
  }
  if (
    command.kind === 'setCandidatePlanCheckpoint' &&
    store.session?.id === command.payload.sessionId &&
    typeof result === 'object' && result !== null
  ) {
    const reply = result as Record<string, unknown>;
    if (
      (reply.status === 'committed' || reply.status === 'replayed') &&
      reply.sessionId === command.payload.sessionId && reply.cycle === 6 &&
      reply.planExists === command.payload.planExists &&
      typeof reply.checkedAt === 'string' &&
      new Date(reply.checkedAt).toISOString() === reply.checkedAt &&
      Number.isSafeInteger(reply.revision) && (reply.revision as number) >= 1
    ) {
      store.setSession({
        ...store.session,
        candidatePlanCheckpoint: {
          cycle: 6,
          planExists: command.payload.planExists,
          checkedAt: reply.checkedAt,
        },
      });
    }
  }
  if (
    command.kind === 'recordZealotryResponse' &&
    store.session?.id === command.payload.sessionId &&
    typeof result === 'object' && result !== null
  ) {
    const reply = result as Record<string, unknown>;
    const actions = Array.isArray(reply.actions) && reply.actions.every((action) =>
      action === 'leave' || action === 'pressure' || action === 'investigate' || action === 'arrest')
      ? reply.actions as ZealotryResponseAction[] : null;
    if (
      (reply.status === 'committed' || reply.status === 'replayed') &&
      reply.sessionId === command.payload.sessionId && reply.crisisId === command.payload.crisisId &&
      Number.isSafeInteger(reply.crisisRevision) && reply.crisisRevision === command.payload.expectedRevision &&
      Number.isSafeInteger(reply.revision) && (reply.revision as number) >= 1 && actions &&
      typeof reply.rationale === 'string' && reply.rationale.length <= 2000 &&
      (!('customResponse' in reply) || typeof reply.customResponse === 'string') &&
      (reply.loyaltyCensusRevision === null ||
        (typeof reply.loyaltyCensusRevision === 'number' && Number.isSafeInteger(reply.loyaltyCensusRevision) && reply.loyaltyCensusRevision >= 0)) &&
      reply.label === 'ZEALOTRY RESPONSE'
    ) {
      useSessionStore.getState().setGmZealotryResponse({
        sessionId: command.payload.sessionId,
        crisisId: command.payload.crisisId,
        crisisRevision: reply.crisisRevision as number,
        state: 'debated',
        revision: reply.revision as number,
        actions,
        ...(typeof reply.customResponse === 'string' ? { customResponse: reply.customResponse } : {}),
        rationale: reply.rationale,
        loyaltyCensusRevision: reply.loyaltyCensusRevision as number | null,
      });
    }
  }
  if (
    command.kind === 'recordCivilUnrestResolution' &&
    store.session?.id === command.payload.sessionId &&
    typeof result === 'object' && result !== null
  ) {
    const reply = result as Record<string, unknown>;
    const links = Array.isArray(reply.grievanceRevisions) && reply.grievanceRevisions.length === 5 &&
      reply.grievanceRevisions.every((entry, index) => {
        if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) return false;
        const item = entry as Record<string, unknown>;
        const shipId = (['dione', 'icebreaker', 'shepherd', 'quellon', 'refinery-124'] as const)[index];
        return item.shipId === shipId && (item.revision === null ||
          (Number.isSafeInteger(item.revision) && (item.revision as number) >= 1));
      }) ? reply.grievanceRevisions as CivilUnrestResolution['grievanceRevisions'] : null;
    if (
      (reply.status === 'committed' || reply.status === 'replayed') &&
      reply.sessionId === command.payload.sessionId && reply.crisisId === command.payload.crisisId &&
      Number.isSafeInteger(reply.crisisRevision) && reply.crisisRevision === command.payload.expectedRevision &&
      Number.isSafeInteger(reply.revision) && (reply.revision as number) >= 1 &&
      typeof reply.presidentResponse === 'string' && reply.presidentResponse.length > 0 && reply.presidentResponse.length <= 1000 &&
      typeof reply.consequence === 'string' && reply.consequence.length > 0 && reply.consequence.length <= 1000 &&
      typeof reply.rationale === 'string' && reply.rationale.length <= 2000 && links &&
      reply.recordedBy === 'facilitator' && reply.label === 'CIVIL UNREST RESOLUTION'
    ) {
      store.setGmCivilUnrestResolution({
        sessionId: command.payload.sessionId,
        crisisId: command.payload.crisisId,
        crisisRevision: reply.crisisRevision as number,
        state: 'debated',
        revision: reply.revision as number,
        presidentResponse: reply.presidentResponse,
        consequence: reply.consequence,
        rationale: reply.rationale,
        grievanceRevisions: links,
        recordedBy: 'facilitator',
      });
    }
  }
}

async function sendOrQueue(
  command: PendingCommand,
  onResult?: (result: unknown) => void,
): Promise<CommandDisposition> {
  const store = useSessionStore.getState();
  const cleanupCommand = isCleanupCommand(command);
  if (!cleanupCommand) requireFreshSessionAuthority();
  if (!window.navigator.onLine || store.connection === 'offline') {
    queue(command);
    store.setConnection('offline');
    return 'queued';
  }
  try {
    const checkpoint = cleanupCommand
      ? undefined
      : commandAuthorityCheckpoint(command, store);
    await ensureSignedIn();
    const result = await executeCommand(command);
    onResult?.(result);
    if (isStaleAuthorityReply(command, result)) {
      recordStaleAuthorityReply();
      return 'stale';
    }
    applyCommandResult(command, result, checkpoint);
    if (
      command.kind === 'popShipConfetti' && typeof result === 'object' && result !== null &&
      'status' in result && result.status === 'awaiting-officer'
    ) return 'awaiting-officer';
    return 'applied';
  } catch (cause) {
    if (isTransientCommandError(cause)) {
      if (cleanupCommand || isReplaySafeCommand(command)) {
        if (cleanupCommand) queue(command);
        else queueFromServerAuthority(command);
      } else {
        // Never persist an ambiguous irreversible mutation without a server
        // receipt identity: replaying it after a lost ACK could target a
        // renewed browser or apply the action twice.
        recordAmbiguousCommand();
        store.setConnection('offline');
        throw new Error(SAFE_AMBIGUOUS_COMMAND_MESSAGE);
      }
      store.setConnection('offline');
      return 'queued';
    }
    store.setCommunicationError(interception(cause));
    throw cause;
  }
}

async function flushPendingCommands(): Promise<boolean> {
  const store = useSessionStore.getState();
  for (const command of [...store.pendingCommands]) {
    const createdAt = Date.parse(command.createdAt);
    const now = Date.now();
    if (
      command.kind !== 'logoutGmAccess' &&
      (!Number.isFinite(createdAt) || createdAt > now || now - createdAt > COMMAND_RECONNECT_WINDOW_MS)
    ) {
      store.removeCommand(command.id);
      store.setCommunicationError({
        code: 'Wolf Intercepted Request Timeout',
        message: 'The queued command expired before the connection returned.',
      });
      continue;
    }
    if (
      !isCleanupCommand(command) &&
      (command.queuedWithServerAuthority !== true || store.sessionSnapshotFreshness !== 'server')
    ) {
      store.removeCommand(command.id);
      recordStaleAuthorityReply();
      continue;
    }
    if (!isCleanupCommand(command) && !isReplaySafeCommand(command)) {
      store.removeCommand(command.id);
      recordAmbiguousCommand();
      continue;
    }
    try {
      const checkpoint = isCleanupCommand(command)
        ? undefined
        : commandAuthorityCheckpoint(command, store);
      const result = await executeCommand(command);
      if (isStaleAuthorityReply(command, result)) recordStaleAuthorityReply();
      else applyCommandResult(command, result, checkpoint, true);
      store.removeCommand(command.id);
    } catch (cause) {
      if (isTransientCommandError(cause)) return false;
      store.removeCommand(command.id);
      store.setCommunicationError(interception(cause));
    }
  }
  return true;
}

function applySession(reply: SessionReply, expectedDisplayedSessionId: string | null): boolean {
  const store = useSessionStore.getState();
  const displayedSessionId = store.session?.id ?? null;
  if (
    reply.player.sessionId !== reply.session.id ||
    displayedSessionId !== expectedDisplayedSessionId ||
    (expectedDisplayedSessionId !== null && reply.session.id !== expectedDisplayedSessionId)
  ) return false;
  const shuttleManifest = normalizeShuttleManifest(
    reply.session.shuttleDockings,
    reply.session.shuttleVisitLog,
    reply.session.activeRoleIds,
    reply.session.playerCount,
    Object.keys(reply.session.retainedShuttles ?? {}),
  );
  const acceptedSession: GameSession = {
    ...reply.session,
    shuttleDockings: shuttleManifest.dockings,
    shuttleVisitLog: shuttleManifest.visits,
    pressEnabled: reply.session.pressEnabled !== false,
    pressClaimed: reply.session.pressClaimed === true,
    pressAvailabilityRevision:
      Number.isSafeInteger(reply.session.pressAvailabilityRevision) &&
      (reply.session.pressAvailabilityRevision as number) >= 0
        ? reply.session.pressAvailabilityRevision as number
        : 0,
    ...(reply.session.pressDispatch === undefined
      ? {}
      : { pressDispatch: normalizePressDispatch(reply.session.pressDispatch) }),
  };
  const acceptedByAuthority = acceptCallableSessionAuthority(acceptedSession, reply.player.uid);
  if (acceptedByAuthority) {
    store.setIdentity(acceptedSession, reply.player);
    // A resume/join reply is server authority, unlike the persisted snapshot it
    // replaces. A reply rejected by the shared authority cursor must not
    // promote cached state or make an older queued mutation eligible.
    store.setSessionSnapshotFreshness('server');
  }
  return true;
}

/**
 * Anonymous sign-in: a player at a table should not have to make an account
 * before they can take a seat. The uid is still a real, stable identity that
 * the rules and the callables can check.
 */
async function ensureSignedIn(): Promise<void> {
  const instance = auth();
  if (instance.currentUser) return;
  await signInAnonymously(instance);
}

/**
 * Establish the Firebase half of the connection. Called as the app mounts and
 * retried while offline; the status light is red until this resolves and red
 * again if it throws.
 */
export async function connect(): Promise<void> {
  return connectWithRetryPolicy(false);
}

/** App-driven retry triggers honor a server retryAfterSeconds for the same session and Firebase UID. */
export async function connectAutomatically(): Promise<void> {
  return connectWithRetryPolicy(true);
}

async function connectWithRetryPolicy(respectRateLimitWait: boolean): Promise<void> {
  const requestGeneration = ++latestConnectAttemptGeneration;
  let attemptedSessionId: string | undefined;
  let attemptedUid: string | undefined;
  try {
    if (!window.navigator.onLine) {
      throw new Error('Browser is offline.');
    }
    await ensureSignedIn();
    const store = useSessionStore.getState();
    attemptedSessionId = store.session?.id;
    attemptedUid = auth().currentUser?.uid;
    const hold = resumeRateLimitHold;
    if (
      respectRateLimitWait && attemptedSessionId && attemptedUid && hold &&
      rateLimitHoldMatches(hold, attemptedSessionId, attemptedUid) && Date.now() < hold.retryAtMs
    ) {
      const remainingSeconds = Math.max(1, Math.ceil((hold.retryAtMs - Date.now()) / 1_000));
      store.setConnection('offline');
      setConnectRateLimitWait(remainingSeconds);
      return;
    }
    store.setConnection('connecting');
    const rememberedSession = store.session;
    if (rememberedSession) {
      // The persisted projection is useful for the first render, but every
      // reconnect starts stale until this attempt accepts a server reply.
      // Clearing the previous `server` marker prevents a rejected stale reply
      // from inheriting authority from an earlier connection.
      store.setSessionSnapshotFreshness('cache');
      try {
        const resumed = await resumeSession(rememberedSession.id);
        if (!resumed && useSessionStore.getState().session?.id === rememberedSession.id) {
          throw new Error('The server returned a mismatched session identity.');
        }
        if (resumed && attemptedUid) {
          clearConnectRateLimitAfterAuthority(rememberedSession.id, attemptedUid, requestGeneration);
        }
      } catch (cause) {
        if (!TERMINAL_RESUME_ERRORS.has(errorCode(cause) ?? '')) throw cause;
        // A denied resume belongs to the session it requested. The player may
        // have left and joined another session while that request was pending.
        if (useSessionStore.getState().session?.id === rememberedSession.id) {
          store.disconnect();
        }
      }
    }
    if (!await flushPendingCommands()) {
      store.setConnection('offline');
      return;
    }
    if (useSessionStore.getState().gmInstance) {
      try {
        await reconcileGmAuthority();
      } catch (cause) {
        if (!isTransientCommandError(cause)) throw cause;
      }
    }
    // A cached snapshot may have marked the local state offline while the
    // resume request was in flight. Only the still-connecting path may be
    // promoted here; an accepted server snapshot owns the live transition.
    const latest = useSessionStore.getState();
    if (latest.connection === 'connecting') {
      // A remembered session may still be visible from cache when a callable
      // reply is rejected by the shared authority cursor. Keep that state
      // renderable, but never promote it to live authority on the way out of
      // connect(). A session-less landing page has no snapshot to authorize.
      if (latest.session && latest.sessionSnapshotFreshness !== 'server') {
        latest.setConnection('offline');
      } else {
        latest.setConnection('live');
      }
    }
  } catch (cause) {
    if (requestGeneration !== latestConnectAttemptGeneration) return;
    const store = useSessionStore.getState();
    store.setConnection('offline');
    if (
      isRateLimitedCommandError(cause) &&
      rememberConnectRateLimit(attemptedSessionId, attemptedUid, requestGeneration, cause)
    ) store.setCommunicationError(interception(cause));
  }
}

export async function createSession(name?: string, options: CreateSessionOptions = {}): Promise<void> {
  const expectedDisplayedSessionId = useSessionStore.getState().session?.id ?? null;
  if (expectedDisplayedSessionId !== null) {
    throw new Error('Disconnect from the current session first.');
  }
  await ensureSignedIn();
  const call = httpsCallable<{
    name?: string;
    joinCodeVersion: 2;
    requestId: string;
  } & CreateSessionOptions, SessionReply>(
    functions(),
    'createSession',
  );
  const reply = await call({
    ...(name === undefined ? {} : { name }),
    joinCodeVersion: 2,
    requestId: commandId(),
    ...options,
  });
  applySession(reply.data, expectedDisplayedSessionId);
}

async function sendCounterChange(
  name: 'adjustShipResource' | 'adjustShipUnrest' | 'dismissUnrestAlert' | 'adjustShipPopulation' | 'dismissPopulationAlert',
  payload: Record<string, string | number | undefined>,
): Promise<void> {
  requireFreshSessionAuthority();
  try {
    const store = useSessionStore.getState();
    const shipId = typeof payload.shipId === 'string' ? payload.shipId : undefined;
    const stablePayload = {
      ...payload,
      requestId: typeof payload.requestId === 'string' ? payload.requestId : commandId(),
      ...(payload.expectedRevision === undefined && shipId
        ? { expectedRevision: store.session?.vesselActionRevisions?.[shipId] ?? 0 }
        : {}),
    };
    await ensureSignedIn();
    const call = httpsCallable<typeof payload, unknown>(functions(), name);
    await call(stablePayload);
  } catch (cause) {
    useSessionStore.getState().setCommunicationError(interception(cause));
  }
}

export type ShipCounterBatchTarget =
  | { readonly counter: 'resource'; readonly resourceId: ResourceId }
  | { readonly counter: 'unrest' | 'population' };

export interface ShipCounterBatchResult extends Partial<VesselActionEnvelope> {
  readonly amount: number;
  readonly alertRaised: boolean;
  readonly revision: number;
  readonly status?: 'stale';
  readonly currentRevision?: number;
  readonly retryBlockedByAlert?: boolean;
}

interface CounterBatchReplyContext {
  readonly sessionId: string;
  readonly instanceId: string;
  readonly shipId: string;
  readonly counter: ShipCounterBatchTarget['counter'];
  readonly resourceId?: ResourceId;
  readonly requestId: string;
  readonly actorUid: string;
  readonly expectedRevision: number;
  readonly steps: readonly CounterStep[];
}

function counterBatchReply(value: unknown, expected: CounterBatchReplyContext): ShipCounterBatchResult | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  const phase = sessionPhase(raw.phase);
  const revision = raw.revision;
  if (raw.sessionId !== expected.sessionId || raw.instanceId !== expected.instanceId ||
      raw.shipId !== expected.shipId || raw.counter !== expected.counter ||
      (expected.counter === 'resource'
        ? raw.resourceId !== expected.resourceId
        : Object.prototype.hasOwnProperty.call(raw, 'resourceId')) ||
      raw.requestId !== expected.requestId || raw.expectedRevision !== expected.expectedRevision ||
      raw.idempotencyKey !== expected.requestId || raw.actorUid !== expected.actorUid ||
      raw.vesselId !== expected.shipId || !Number.isSafeInteger(raw.amount) ||
      (raw.amount as number) < 0 || typeof raw.alertRaised !== 'boolean' ||
      !Number.isSafeInteger(revision) || (revision as number) < 0 ||
      !Number.isSafeInteger(raw.turn) || (raw.turn as number) < 0 || phase === undefined ||
      !(typeof raw.actorRoleId === 'string' || raw.actorRoleId === null) ||
      typeof raw.auditId !== 'string' || raw.auditId.length === 0) return null;

  if (raw.status === 'stale') {
    if (raw.alertRaised !== false || typeof raw.retryBlockedByAlert !== 'boolean' ||
        raw.currentRevision !== revision ||
        !Number.isSafeInteger(raw.currentRevision) ||
        (raw.currentRevision as number) <= expected.expectedRevision ||
        Object.prototype.hasOwnProperty.call(raw, 'appliedSteps')) return null;
    return {
      status: 'stale', amount: raw.amount as number, alertRaised: false,
      retryBlockedByAlert: raw.retryBlockedByAlert,
      currentRevision: raw.currentRevision as number,
      revision: revision as number,
      idempotencyKey: expected.requestId,
      auditId: raw.auditId,
      actorUid: expected.actorUid,
      actorRoleId: raw.actorRoleId,
      vesselId: expected.shipId,
      turn: raw.turn as number,
      phase,
    };
  }

  if (raw.status !== undefined || revision !== expected.expectedRevision + 1 ||
      !Array.isArray(raw.appliedSteps) || raw.appliedSteps.length === 0 ||
      raw.appliedSteps.length > expected.steps.length ||
      raw.appliedSteps.some((step, index) => step !== expected.steps[index]) ||
      (!raw.alertRaised && raw.appliedSteps.length !== expected.steps.length)) return null;
  return {
    amount: raw.amount as number,
    alertRaised: raw.alertRaised,
    revision: revision as number,
    idempotencyKey: expected.requestId,
    auditId: raw.auditId,
    actorUid: expected.actorUid,
    actorRoleId: raw.actorRoleId,
    vesselId: expected.shipId,
    turn: raw.turn as number,
    phase,
  };
}

/**
 * Send a short, ordered GM counter run. This only patches local view state
 * after the callable confirms the authoritative amount.
 */
export async function applyShipCounterSteps(
  shipId: string,
  target: ShipCounterBatchTarget,
  steps: readonly CounterStep[],
): Promise<ShipCounterBatchResult | null> {
  const store = useSessionStore.getState();
  if (!store.session || !store.me || store.me.role !== 'gm' || !store.gmInstance ||
      store.gmInstance.sessionId !== store.session.id || store.gmInstance.uid !== store.me.uid) {
    throw new Error('An active GM instance is required.');
  }
  requireFreshSessionAuthority();
  const sessionId = store.session.id;
  const instanceId = store.gmInstance.id;
  const actorUid = store.me.uid;
  const checkpoint = sessionAuthorityCheckpoint(
    sessionId,
    actorUid,
  );
  const expectedRevision = store.session.vesselActionRevisions?.[shipId] ?? 0;
  if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0) {
    throw new Error('The current ship counter revision is invalid.');
  }
  const payload = {
    sessionId,
    instanceId,
    shipId,
    counter: target.counter,
    steps: [...steps],
    requestId: commandId(),
    expectedRevision,
    ...(target.counter === 'resource' ? { resourceId: target.resourceId } : {}),
  };
  const expected: CounterBatchReplyContext = {
    sessionId, instanceId, shipId,
    counter: target.counter,
    ...(target.counter === 'resource' ? { resourceId: target.resourceId } : {}),
    requestId: payload.requestId,
    actorUid,
    expectedRevision,
    steps: payload.steps,
  };
  try {
    await ensureSignedIn();
    const call = httpsCallable<typeof payload, unknown>(functions(), 'applyShipCounterSteps');
    const reply = counterBatchReply((await call(payload)).data, expected);
    if (!reply) throw new Error('The server returned an invalid counter amount.');

    const currentStore = useSessionStore.getState();
    const current = currentStore.session;
    if (!current || current.id !== sessionId || currentStore.me?.uid !== actorUid ||
        currentStore.me.role !== 'gm' || currentStore.gmInstance?.id !== instanceId ||
        currentStore.gmInstance.sessionId !== sessionId || currentStore.gmInstance.uid !== actorUid) return null;
    if (!authorityCheckpointIsCurrent(checkpoint)) return reply.status === 'stale' ? reply : null;
    const currentRevision = current.vesselActionRevisions?.[shipId] ?? 0;
    if (!Number.isSafeInteger(currentRevision) || currentRevision < 0 || reply.revision <= currentRevision) {
      return reply;
    }
    if (target.counter === 'resource') {
      const inventory = current.shipResources?.[shipId];
      if (!inventory) return reply;
      useSessionStore.getState().setSession({
        ...current,
        shipResources: {
          ...current.shipResources,
          [shipId]: { ...inventory, [target.resourceId]: reply.amount },
        },
        vesselActionRevisions: {
          ...(current.vesselActionRevisions ?? {}),
          ...(reply.revision === undefined ? {} : { [shipId]: reply.revision }),
        },
      });
      return reply;
    }
    if (target.counter === 'unrest') {
      useSessionStore.getState().setSession({
        ...current,
        shipUnrest: { ...current.shipUnrest, [shipId]: reply.amount },
        vesselActionRevisions: {
          ...(current.vesselActionRevisions ?? {}),
          ...(reply.revision === undefined ? {} : { [shipId]: reply.revision }),
        },
      });
      return reply;
    }
    useSessionStore.getState().setSession({
      ...current,
      shipSurvivors: { ...current.shipSurvivors, [shipId]: reply.amount },
      vesselActionRevisions: {
        ...(current.vesselActionRevisions ?? {}),
        ...(reply.revision === undefined ? {} : { [shipId]: reply.revision }),
      },
    });
    return reply;
  } catch (cause) {
    useSessionStore.getState().setCommunicationError(interception(cause));
    return null;
  }
}

export interface FighterWingCountResult extends Partial<VesselActionEnvelope> {
  readonly status: 'committed' | 'replayed' | 'stale';
  readonly wingId: string;
  readonly count?: number;
  readonly revision?: number;
  readonly currentRevision?: number;
  readonly capacity: number;
}

function fighterWingCountReply(
  value: unknown,
  expected: { readonly sessionId: string; readonly requestId: string; readonly wingId: string; readonly actorUid: string },
): FighterWingCountResult | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  const status = raw.status;
  const capacity = raw.capacity;
  const count = raw.count;
  const revision = raw.revision;
  const currentRevision = raw.currentRevision;
  if ((status !== 'committed' && status !== 'replayed' && status !== 'stale') ||
    raw.sessionId !== expected.sessionId || raw.requestId !== expected.requestId ||
    raw.wingId !== expected.wingId || raw.actorUid !== expected.actorUid || raw.vesselId !== 'aegis' ||
    (capacity !== AEGIS_FIGHTER_WING_CAPACITY.standard && capacity !== AEGIS_FIGHTER_WING_CAPACITY.upgraded) ||
    typeof count !== 'number' || !Number.isSafeInteger(count) || count < 0 || count > capacity ||
    typeof revision !== 'number' || !Number.isSafeInteger(revision) || revision < 0 ||
    (currentRevision !== undefined && (typeof currentRevision !== 'number' ||
      !Number.isSafeInteger(currentRevision) || currentRevision < 0))) return null;
  if (status === 'stale' && (typeof currentRevision !== 'number' || revision !== currentRevision ||
    raw.idempotencyKey !== expected.requestId || typeof raw.auditId !== 'string' || raw.auditId.length === 0)) {
    return null;
  }
  const phase = sessionPhase(raw.phase);
  const result: FighterWingCountResult = {
    status,
    wingId: expected.wingId,
    capacity,
    count,
    revision,
    ...(typeof currentRevision === 'number' ? { currentRevision } : {}),
    actorUid: expected.actorUid,
    ...(typeof raw.actorRoleId === 'string' || raw.actorRoleId === null ? { actorRoleId: raw.actorRoleId as string | null } : {}),
    vesselId: 'aegis',
    ...(typeof raw.turn === 'number' ? { turn: raw.turn } : {}),
    ...(phase === undefined ? {} : { phase }),
    ...(typeof raw.idempotencyKey === 'string' ? { idempotencyKey: raw.idempotencyKey } : {}),
    ...(typeof raw.auditId === 'string' ? { auditId: raw.auditId } : {}),
  };
  return result;
}

/** Send one revisioned GM correction and patch only the matching live session. */
export async function setFighterWingCount(
  wingId: string,
  count: number,
): Promise<FighterWingCountResult | null> {
  const store = useSessionStore.getState();
  if (!store.session || !store.gmInstance) throw new Error('An active GM instance is required.');
  requireFreshSessionAuthority();
  const sessionId = store.session.id;
  const instanceId = store.gmInstance.id;
  const actorUid = store.gmInstance.uid;
  const checkpoint = sessionAuthorityCheckpoint(sessionId, sessionAuthorityUid(store));
  const expectedRevision = store.session.fighterWingCounts?.[wingId]?.revision ?? 0;
  const payload = {
    sessionId,
    instanceId,
    requestId: commandId(),
    wingId,
    count,
    expectedRevision,
  };
  try {
    await ensureSignedIn();
    const call = httpsCallable<typeof payload, unknown>(functions(), 'setFighterWingCount');
    const reply = fighterWingCountReply((await call(payload)).data, {
      sessionId, requestId: payload.requestId, wingId, actorUid,
    });
    if (!reply) throw new Error('The server returned an invalid fighter-wing count.');
    const latest = useSessionStore.getState();
    const current = latest.session;
    const gm = latest.gmInstance;
    const currentWingRevision = current?.fighterWingCounts?.[wingId]?.revision ?? 0;
    const stillSameGm = latest.me?.sessionId === sessionId && latest.me.role === 'gm' &&
      latest.me.uid === actorUid && gm?.id === instanceId &&
      gm.sessionId === sessionId && gm.uid === actorUid;
    if (reply.status === 'stale') {
      if (!current || current.id !== sessionId || !authorityCheckpointIsCurrent(checkpoint) ||
        !stillSameGm || reply.count === undefined || reply.currentRevision === undefined ||
        currentWingRevision >= reply.currentRevision) return reply;
      const aegisUpgrades = current.shipUpgrades?.aegis ?? [];
      const hasConstructionBay = aegisUpgrades.includes('construction-bay');
      const currentCapacity = hasConstructionBay
        ? AEGIS_FIGHTER_WING_CAPACITY.upgraded
        : AEGIS_FIGHTER_WING_CAPACITY.standard;
      const nextAegisUpgrades = reply.capacity === currentCapacity
        ? aegisUpgrades
        : reply.capacity === AEGIS_FIGHTER_WING_CAPACITY.upgraded
          ? [...aegisUpgrades, 'construction-bay']
          : aegisUpgrades.filter((upgrade) => upgrade !== 'construction-bay');
      useSessionStore.getState().setSession({
        ...current,
        fighterWingCounts: {
          ...current.fighterWingCounts,
          [wingId]: { count: reply.count, revision: reply.currentRevision },
        },
        ...(reply.capacity === currentCapacity ? {} : {
          shipUpgrades: { ...current.shipUpgrades, aegis: nextAegisUpgrades },
        }),
      });
      return reply;
    }
    if (!current || current.id !== sessionId || !authorityCheckpointIsCurrent(checkpoint) ||
      !stillSameGm || reply.count === undefined || reply.revision === undefined ||
      currentWingRevision >= reply.revision) return reply;
    useSessionStore.getState().setSession({
      ...current,
      fighterWingCounts: {
        ...current.fighterWingCounts,
        [wingId]: { count: reply.count, revision: reply.revision },
      },
    });
    return reply;
  } catch (cause) {
    useSessionStore.getState().setCommunicationError(interception(cause));
    return null;
  }
}

export interface FighterBuildResult extends Partial<VesselActionEnvelope> {
  readonly status: 'committed' | 'replayed' | 'stale';
  readonly wingId: string;
  readonly count?: number;
  readonly fighterWingRevision?: number;
  readonly materials?: number;
  readonly capacity: number;
  readonly currentRevision?: number;
}

function fighterBuildReply(value: unknown): FighterBuildResult | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  if ((raw.status !== 'committed' && raw.status !== 'replayed' && raw.status !== 'stale') ||
    typeof raw.wingId !== 'string' || typeof raw.capacity !== 'number' ||
    !Number.isSafeInteger(raw.capacity) || raw.capacity < 0) return null;
  const phase = sessionPhase(raw.phase);
  return {
    status: raw.status,
    wingId: raw.wingId,
    capacity: raw.capacity,
    ...(typeof raw.count === 'number' && Number.isSafeInteger(raw.count) ? { count: raw.count } : {}),
    ...(typeof raw.fighterWingRevision === 'number' && Number.isSafeInteger(raw.fighterWingRevision)
      ? { fighterWingRevision: raw.fighterWingRevision } : {}),
    ...(typeof raw.materials === 'number' && Number.isSafeInteger(raw.materials) ? { materials: raw.materials } : {}),
    ...(typeof raw.currentRevision === 'number' && Number.isSafeInteger(raw.currentRevision)
      ? { currentRevision: raw.currentRevision } : {}),
    ...(typeof raw.actorUid === 'string' ? { actorUid: raw.actorUid } : {}),
    ...(typeof raw.actorRoleId === 'string' || raw.actorRoleId === null ? { actorRoleId: raw.actorRoleId as string | null } : {}),
    ...(typeof raw.vesselId === 'string' ? { vesselId: raw.vesselId } : {}),
    ...(typeof raw.turn === 'number' ? { turn: raw.turn } : {}),
    ...(phase === undefined ? {} : { phase }),
    ...(typeof raw.idempotencyKey === 'string' ? { idempotencyKey: raw.idempotencyKey } : {}),
    ...(typeof raw.auditId === 'string' ? { auditId: raw.auditId } : {}),
  };
}

/** Build one fighter through the server-owned, charged AEGIS Construction Bay. */
export async function buildFighter(wingId: string): Promise<FighterBuildResult | null> {
  const store = useSessionStore.getState();
  if (!store.session) throw new Error('Join a session before building a fighter.');
  requireFreshSessionAuthority();
  const sessionId = store.session.id;
  const checkpoint = sessionAuthorityCheckpoint(sessionId, sessionAuthorityUid(store));
  const expectedRevision = store.session.vesselActionRevisions?.aegis ?? 0;
  const payload = {
    sessionId,
    requestId: commandId(),
    wingId,
    expectedRevision,
    ...(store.gmInstance ? { instanceId: store.gmInstance.id } : {}),
  };
  try {
    await ensureSignedIn();
    const call = httpsCallable<typeof payload, unknown>(functions(), 'buildFighter');
    const reply = fighterBuildReply((await call(payload)).data);
    if (!reply) throw new Error('The server returned an invalid fighter construction result.');
    const current = useSessionStore.getState().session;
    if (!current || current.id !== sessionId || !authorityCheckpointIsCurrent(checkpoint) ||
      reply.status === 'stale' || reply.count === undefined || reply.fighterWingRevision === undefined ||
      reply.materials === undefined) return reply;
    useSessionStore.getState().setSession({
      ...current,
      fighterWingCounts: {
        ...current.fighterWingCounts,
        [reply.wingId]: { count: reply.count, revision: reply.fighterWingRevision },
      },
      ...(current.shipResources?.aegis ? {
        shipResources: {
          ...current.shipResources,
          aegis: { ...current.shipResources.aegis, materials: reply.materials },
        },
      } : {}),
      vesselActionRevisions: {
        ...(current.vesselActionRevisions ?? {}),
        ...(reply.revision === undefined ? {} : { aegis: reply.revision }),
      },
    });
    return reply;
  } catch (cause) {
    useSessionStore.getState().setCommunicationError(interception(cause));
    return null;
  }
}

export async function adjustShipResource(
  shipId: string,
  resourceId: ResourceId,
  delta: -1 | 1,
): Promise<void> {
  const store = useSessionStore.getState();
  if (!store.session) throw new Error('Join a session before changing resources.');
  await sendCounterChange('adjustShipResource', {
    sessionId: store.session.id,
    shipId,
    resourceId,
    delta,
    ...(store.gmInstance ? { instanceId: store.gmInstance.id } : {}),
  });
}

export async function adjustShipUnrest(shipId: string, delta: -1 | 1): Promise<void> {
  const store = useSessionStore.getState();
  if (!store.session) throw new Error('Join a session before changing unrest.');
  await sendCounterChange('adjustShipUnrest', {
    sessionId: store.session.id,
    shipId,
    delta,
    ...(store.gmInstance ? { instanceId: store.gmInstance.id } : {}),
  });
}

export async function dismissUnrestAlert(shipId: string): Promise<void> {
  const store = useSessionStore.getState();
  if (!store.session || !store.gmInstance) return;
  await sendCounterChange('dismissUnrestAlert', {
    sessionId: store.session.id,
    shipId,
    instanceId: store.gmInstance.id,
  });
}

export async function adjustShipPopulation(shipId: string, delta: -1 | 1): Promise<void> {
  const store = useSessionStore.getState();
  if (!store.session || !store.gmInstance) throw new Error('An active GM instance is required.');
  await sendCounterChange('adjustShipPopulation', {
    sessionId: store.session.id, shipId, delta, instanceId: store.gmInstance.id,
  });
}

export interface CommissarPurgeResult extends Partial<VesselActionEnvelope> {
  readonly status: 'committed' | 'replayed' | 'already-consented' | 'stale';
  readonly shipId: string;
  readonly captainRoleId?: string;
  readonly population?: number;
  readonly survivorsRemoved?: number;
  readonly unrest?: number;
  readonly unrestReduced?: number;
  readonly currentRevision?: number;
}

function commissarPurgeAuthorityReply(
  value: unknown,
  sessionId: string,
): CommissarPurgeAuthority | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  if (raw.type !== 'commissar-purge-authority' || raw.sessionId !== sessionId ||
      (raw.role !== 'captain' && raw.role !== 'commissar') ||
      !Number.isSafeInteger(raw.revision) || (raw.revision as number) < 0) return null;
  const shipId = raw.shipId === undefined ? undefined : parseEntityId('vessel', raw.shipId);
  const captainRoleId = raw.captainRoleId === undefined ? undefined : parseEntityId('role', raw.captainRoleId);
  if (raw.role === 'captain' && (!shipId || !captainRoleId)) return null;
  const parseMap = (candidate: unknown, ledger: boolean) => {
    if (typeof candidate !== 'object' || candidate === null || Array.isArray(candidate)) return undefined;
    const source = candidate as Record<string, unknown>;
    const entries = Object.entries(source).flatMap(([id, item]) => {
      const vesselId = parseEntityId('vessel', id);
      if (!vesselId || typeof item !== 'object' || item === null || Array.isArray(item)) return [];
      const entry = item as Record<string, unknown>;
      if (!Number.isSafeInteger(entry.turn) || (entry.turn as number) < 1) return [];
      const revision = entry[ledger ? 'revision' : 'vesselRevision'];
      const captainRoleId = ledger ? undefined : parseEntityId('role', entry.captainRoleId);
      if (!Number.isSafeInteger(revision) || (revision as number) < 0 || (!ledger && !captainRoleId)) return [];
      return [[vesselId, ledger
        ? { turn: entry.turn as number, revision: revision as number }
        : { turn: entry.turn as number, captainRoleId, vesselRevision: revision as number }]];
    });
    return entries.length === Object.keys(source).length ? Object.fromEntries(entries) : undefined;
  };
  const consents = parseMap(raw.consents, false);
  const ledger = parseMap(raw.ledger, true);
  if (raw.role === 'commissar' && (!consents || !ledger)) return null;
  if (raw.role === 'captain' &&
      (raw.consented !== undefined && typeof raw.consented !== 'boolean' ||
       raw.consentTurn !== undefined && (!Number.isSafeInteger(raw.consentTurn) || (raw.consentTurn as number) < 1) ||
       raw.consentVesselRevision !== undefined && (!Number.isSafeInteger(raw.consentVesselRevision) || (raw.consentVesselRevision as number) < 0) ||
       raw.usedThisTurn !== undefined && typeof raw.usedThisTurn !== 'boolean')) return null;
  return {
    sessionId: parseEntityId('session', sessionId)!,
    role: raw.role,
    revision: raw.revision as number,
    ...(captainRoleId ? { captainRoleId } : {}),
    ...(shipId ? { shipId } : {}),
    ...(typeof raw.consented === 'boolean' ? { consented: raw.consented } : {}),
    ...(typeof raw.consentTurn === 'number' ? { consentTurn: raw.consentTurn } : {}),
    ...(typeof raw.consentVesselRevision === 'number' ? { consentVesselRevision: raw.consentVesselRevision } : {}),
    ...(typeof raw.usedThisTurn === 'boolean' ? { usedThisTurn: raw.usedThisTurn } : {}),
    ...(consents ? { consents } : {}),
    ...(ledger ? { ledger } : {}),
  } as CommissarPurgeAuthority;
}

export async function refreshCommissarPurgeAuthority(): Promise<CommissarPurgeAuthority | null> {
  const before = useSessionStore.getState();
  if (!before.session || !before.me || before.me.role !== 'player') return null;
  requireFreshSessionAuthority();
  const sessionId = before.session.id;
  const checkpoint = sessionAuthorityCheckpoint(sessionId, sessionAuthorityUid(before));
  try {
    await ensureSignedIn();
    const call = httpsCallable<{ sessionId: string }, unknown>(functions(), 'getCommissarPurgeAuthority');
    const authority = commissarPurgeAuthorityReply((await call({ sessionId })).data, sessionId);
    if (!authority) throw new Error('The server returned an invalid Commissar authority projection.');
    const current = useSessionStore.getState();
    if (current.session?.id !== sessionId || !authorityCheckpointIsCurrent(checkpoint) ||
        !commissarPurgeAuthorityIsCurrent(authority, current.session, current.me)) return null;
    current.setCommissarPurgeAuthority(authority);
    return authority;
  } catch (cause) {
    useSessionStore.getState().setCommunicationError(interception(cause));
    throw cause;
  }
}

function commissarPurgeReply(value: unknown): CommissarPurgeResult | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  if (!['committed', 'replayed', 'already-consented', 'stale'].includes(String(raw.status)) ||
      typeof raw.shipId !== 'string') return null;
  const phase = sessionPhase(raw.phase);
  return {
    status: raw.status as CommissarPurgeResult['status'],
    shipId: raw.shipId,
    ...(typeof raw.captainRoleId === 'string' ? { captainRoleId: raw.captainRoleId } : {}),
    ...(typeof raw.population === 'number' ? { population: raw.population } : {}),
    ...(typeof raw.survivorsRemoved === 'number' ? { survivorsRemoved: raw.survivorsRemoved } : {}),
    ...(typeof raw.unrest === 'number' ? { unrest: raw.unrest } : {}),
    ...(typeof raw.unrestReduced === 'number' ? { unrestReduced: raw.unrestReduced } : {}),
    ...(typeof raw.currentRevision === 'number' ? { currentRevision: raw.currentRevision } : {}),
    ...(typeof raw.revision === 'number' ? { revision: raw.revision } : {}),
    ...(typeof raw.idempotencyKey === 'string' ? { idempotencyKey: raw.idempotencyKey } : {}),
    ...(typeof raw.auditId === 'string' ? { auditId: raw.auditId } : {}),
    ...(typeof raw.actorUid === 'string' ? { actorUid: raw.actorUid } : {}),
    ...(typeof raw.actorRoleId === 'string' || raw.actorRoleId === null
      ? { actorRoleId: raw.actorRoleId as string | null } : {}),
    ...(typeof raw.vesselId === 'string' ? { vesselId: raw.vesselId } : {}),
    ...(typeof raw.turn === 'number' ? { turn: raw.turn } : {}),
    ...(phase === undefined ? {} : { phase }),
  };
}

async function sendCommissarPurgeCommand(
  name: 'consentCommissarPurge' | 'applyCommissarPurge',
  shipId: string,
): Promise<CommissarPurgeResult> {
  const before = useSessionStore.getState();
  if (!before.session || !before.me) throw new Error('Join a session before using the Commissar action.');
  requireFreshSessionAuthority();
  const sessionId = before.session.id;
  const checkpoint = sessionAuthorityCheckpoint(sessionId, sessionAuthorityUid(before));
  const expectedRevision = before.session.vesselActionRevisions?.[shipId] ?? 0;
  const payload = {
    sessionId,
    shipId,
    requestId: commandId(),
    expectedRevision,
  };
  try {
    await ensureSignedIn();
    const call = httpsCallable<typeof payload, unknown>(functions(), name);
    const reply = commissarPurgeReply((await call(payload)).data);
    if (!reply) throw new Error('The server returned an invalid Commissar action result.');
    const current = useSessionStore.getState().session;
    if (!current || current.id !== sessionId || !authorityCheckpointIsCurrent(checkpoint) ||
        reply.status === 'stale') return reply;
    if (name === 'applyCommissarPurge' && reply.population !== undefined &&
      reply.unrest !== undefined && reply.revision !== undefined) {
      useSessionStore.getState().setSession({
        ...current,
        shipSurvivors: { ...(current.shipSurvivors ?? {}), [shipId]: reply.population },
        shipUnrest: { ...(current.shipUnrest ?? {}), [shipId]: reply.unrest },
        vesselActionRevisions: {
          ...(current.vesselActionRevisions ?? {}),
          [shipId]: reply.revision,
        },
      });
    }
    await refreshCommissarPurgeAuthority().catch(() => undefined);
    return reply;
  } catch (cause) {
    useSessionStore.getState().setCommunicationError(interception(cause));
    throw cause;
  }
}

export function consentCommissarPurge(shipId: string): Promise<CommissarPurgeResult> {
  return sendCommissarPurgeCommand('consentCommissarPurge', shipId);
}

export function applyCommissarPurge(shipId: string): Promise<CommissarPurgeResult> {
  return sendCommissarPurgeCommand('applyCommissarPurge', shipId);
}

export async function dismissPopulationAlert(shipId: string): Promise<void> {
  const store = useSessionStore.getState();
  if (!store.session || !store.gmInstance) return;
  await sendCounterChange('dismissPopulationAlert', {
    sessionId: store.session.id, shipId, instanceId: store.gmInstance.id,
  });
}

export async function joinSession(joinCode: string): Promise<void> {
  const expectedDisplayedSessionId = useSessionStore.getState().session?.id ?? null;
  if (expectedDisplayedSessionId !== null) {
    throw new Error('Disconnect from the current session first.');
  }
  await ensureSignedIn();
  const call = httpsCallable<{ joinCode: string }, SessionReply>(
    functions(),
    'joinSession',
  );
  const reply = await call({ joinCode });
  applySession(reply.data, expectedDisplayedSessionId);
}

export async function resumeSession(sessionId: string): Promise<boolean> {
  const call = httpsCallable<{ sessionId: string }, SessionReply>(
    functions(),
    'resumeSession',
  );
  const reply = await call({ sessionId });
  return applySession(reply.data, sessionId);
}

/** Confirm the entire setup tuple through one replay-safe authoritative command. */
export async function confirmSetup(setup: SetupConfirmationInput): Promise<CommandDisposition> {
  const store = useSessionStore.getState();
  if (!store.session || !store.gmInstance) {
    throw new Error('Claim GM before confirming setup.');
  }
  return sendOrQueue({
    id: commandId(),
    kind: 'confirmSetup',
    payload: {
      sessionId: store.session.id,
      instanceId: store.gmInstance.id,
      requestId: commandId(),
      expectedSetupRevision: expectedSetupRevision(store.session),
      setup: { ...setup, activeRoleIds: [...setup.activeRoleIds] },
    },
    createdAt: new Date().toISOString(),
  });
}

/** Change one printed facilitator lane through the revisioned authority command. */
export async function setFacilitatorResponsibility(
  change: FacilitatorResponsibilityChange,
): Promise<CommandDisposition> {
  const store = useSessionStore.getState();
  if (!store.session || !store.gmInstance) {
    throw new Error('Claim GM before changing facilitator responsibilities.');
  }
  return sendOrQueue({
    id: commandId(),
    kind: 'setFacilitatorResponsibility',
    payload: {
      sessionId: store.session.id,
      instanceId: store.gmInstance.id,
      requestId: commandId(),
      expectedSetupRevision: expectedSetupRevision(store.session),
      responsibility: change.responsibility,
      mode: change.mode,
      ...(change.targetInstanceId ? { targetInstanceId: change.targetInstanceId } : {}),
    },
    createdAt: new Date().toISOString(),
  });
}

/** Save one bounded facilitator census annotation through the server CAS. */
export async function setFacilitatorCensusNote(
  targetUid: string,
  note: string,
): Promise<CommandDisposition> {
  const store = useSessionStore.getState();
  if (!store.session || !store.gmInstance || !store.gmLoyaltyCensus) {
    throw new Error('An active GM census is required before saving a note.');
  }
  return sendOrQueue({
    id: commandId(),
    kind: 'setFacilitatorCensusNote',
    payload: {
      sessionId: store.session.id,
      instanceId: store.gmInstance.id,
      requestId: commandId(),
      expectedRevision: store.gmLoyaltyCensus.revision,
      targetUid,
      note: note.trim().slice(0, 240),
    },
    createdAt: new Date().toISOString(),
  });
}

/** Calculate a private arrest posse count; suspicion never crosses the client boundary. */
export async function calculateArrestPosse(
  targetUid: string,
  defenders: number,
  adjustment: -1 | 1 | undefined,
  expectedRevision: number,
): Promise<ArrestPosseCalculation> {
  const initial = useSessionStore.getState();
  const instance = initial.gmInstance;
  const session = initial.session;
  const uid = initial.me?.uid;
  if (!session || !initial.me || initial.me.role !== 'gm' || !instance || !uid ||
      instance.sessionId !== session.id || instance.uid !== uid ||
      !initial.gmLoyaltyCensus || !initial.gmLoyaltyCensus.entries.some((entry) =>
        entry.uid === targetUid && Number.isSafeInteger(entry.suspicion) &&
        (entry.suspicion as number) >= 0)) {
    throw new Error('An active GM census and target are required before calculating the arrest posse.');
  }
  if (!parseEntityId('player', targetUid) || !Number.isSafeInteger(defenders) || defenders < 0 ||
      !Number.isSafeInteger(expectedRevision) || expectedRevision < 0 ||
      expectedRevision >= Number.MAX_SAFE_INTEGER ||
      (adjustment !== undefined && adjustment !== -1 && adjustment !== 1)) {
    throw new Error('The arrest target, defender count, adjustment, or revision is invalid.');
  }

  requireFreshSessionAuthority('Reconnect before calculating the arrest posse.');
  const sessionId = session.id;
  const instanceId = instance.id;
  const checkpoint = sessionAuthorityCheckpoint(sessionId, uid);
  await ensureSignedIn();
  const authorityIsCurrent = (): boolean => {
    const current = useSessionStore.getState();
    return current.session?.id === sessionId && current.me?.sessionId === sessionId &&
      current.me?.role === 'gm' && current.me.uid === uid &&
      current.gmInstance?.id === instanceId && current.gmInstance.uid === uid &&
      current.gmInstance.sessionId === sessionId && authorityCheckpointIsCurrent(checkpoint);
  };
  if (!authorityIsCurrent()) {
    pendingArrestPosseAttempt = null;
    throw new Error('The facilitator authority changed before the calculation could be sent.');
  }

  const matchingAttempt = pendingArrestPosseAttempt &&
    pendingArrestPosseAttempt.sessionId === sessionId &&
    pendingArrestPosseAttempt.instanceId === instanceId &&
    pendingArrestPosseAttempt.expectedRevision === expectedRevision &&
    pendingArrestPosseAttempt.targetUid === targetUid &&
    pendingArrestPosseAttempt.defenders === defenders &&
    pendingArrestPosseAttempt.adjustment === adjustment;
  const attempt: PendingArrestPosseAttempt = matchingAttempt
    ? pendingArrestPosseAttempt!
    : {
      sessionId, instanceId, expectedRevision, targetUid, defenders,
      ...(adjustment === undefined ? {} : { adjustment }),
      requestId: commandId(),
    };
  pendingArrestPosseAttempt = attempt;
  const payload = {
    sessionId, instanceId, requestId: attempt.requestId, expectedRevision,
    targetUid, defenders,
    ...(adjustment === undefined ? {} : { adjustment }),
  };
  const call = httpsCallable<typeof payload, unknown>(functions(), 'calculateArrestPosse');
  const response = parseArrestPosseCalculation((await call(payload)).data, sessionId);
  if (!authorityIsCurrent()) {
    pendingArrestPosseAttempt = null;
    throw new Error('The facilitator authority changed before the calculation was confirmed.');
  }
  if (!response || response.requestId !== attempt.requestId || response.revision !== expectedRevision + 1 ||
      response.targetUid !== targetUid || response.defenders !== defenders ||
      response.adjustment !== adjustment) {
    throw new Error('The arrest calculation response was malformed or stale. Refresh the facilitator readout.');
  }
  if (pendingArrestPosseAttempt?.requestId === attempt.requestId) pendingArrestPosseAttempt = null;
  return response;
}

/** Deliver one facilitator-authored Wolf Cult intelligence projection. */
export async function deliverWolfCultIntelligence(
  fortressCoordinate: string,
  suppliesCoordinate: string,
  agentUid: string,
  codeWord: string,
): Promise<CommandDisposition> {
  const store = useSessionStore.getState();
  if (!store.session || !store.gmInstance || !store.gmLoyaltyCensus) {
    throw new Error('An active GM census is required before delivering Wolf Cult intelligence.');
  }
  return sendOrQueue({
    id: commandId(),
    kind: 'deliverWolfCultIntelligence',
    payload: {
      sessionId: store.session.id,
      instanceId: store.gmInstance.id,
      requestId: commandId(),
      expectedRevision: store.gmWolfCultIntelligence?.revision ?? 0,
      fortressCoordinate: fortressCoordinate.trim(),
      suppliesCoordinate: suppliesCoordinate.trim(),
      agentUid: agentUid.trim(),
      codeWord: codeWord.trim().slice(0, 80),
    },
    createdAt: new Date().toISOString(),
  });
}

/** Record a durable facilitator ruling for an ambiguity or source gap. */
export async function authorFacilitatorRuleCall(
  input: Pick<FacilitatorRuleCall, 'ambiguity' | 'source' | 'decision' | 'audience'> &
    Partial<Pick<FacilitatorRuleCall, 'recipientUid' | 'supersedesCallId'>>,
): Promise<CommandDisposition> {
  const store = useSessionStore.getState();
  if (!store.session || store.me?.role !== 'gm' ||
      !store.gmInstance || store.gmInstance.sessionId !== store.session.id ||
      store.gmInstance.uid !== store.me.uid) {
    throw new Error('An active GM instance is required before recording a rule call.');
  }
  return sendOrQueue({
    id: commandId(),
    kind: 'authorFacilitatorRuleCall',
    payload: {
      sessionId: store.session.id,
      instanceId: store.gmInstance.id,
      requestId: commandId(),
      expectedRevision: store.gmFacilitatorRuleCall?.revision ?? 0,
      ambiguity: input.ambiguity.trim().slice(0, 240),
      source: input.source.trim().slice(0, 240),
      decision: input.decision.trim().slice(0, 500),
      audience: input.audience,
      ...(input.recipientUid ? { recipientUid: input.recipientUid } : {}),
      ...(input.supersedesCallId ? { supersedesCallId: input.supersedesCallId } : {}),
    },
    createdAt: new Date().toISOString(),
  });
}

/** Record the facilitator-only Cycle 6 candidate plan presence marker. */
export async function setCandidatePlanCheckpoint(planExists: boolean): Promise<CommandDisposition> {
  const store = useSessionStore.getState();
  if (!store.session || store.me?.role !== 'gm' ||
      !store.gmInstance || store.gmInstance.sessionId !== store.session.id ||
      store.gmInstance.uid !== store.me.uid) {
    throw new Error('An active GM instance is required before recording the candidate plan checkpoint.');
  }
  return sendOrQueue({
    id: commandId(),
    kind: 'setCandidatePlanCheckpoint',
    payload: {
      sessionId: store.session.id,
      instanceId: store.gmInstance.id,
      requestId: commandId(),
      planExists,
    },
    createdAt: new Date().toISOString(),
  });
}

/** Advance the manually authored crisis through the server-owned lifecycle. */
export async function transitionCrisis(
  crisisId: string,
  state: CrisisStateName,
  title: string,
  details: string,
  configuration?: { crisisKind: CrisisKind; configurationOverride: string; diseaseOutbreak?: DiseaseOutbreakDetails },
): Promise<CommandDisposition> {
  const store = useSessionStore.getState();
  if (!store.session || !store.gmInstance) {
    throw new Error('Claim GM before advancing a crisis.');
  }
  return sendOrQueue({
    id: commandId(),
    kind: 'transitionCrisis',
    payload: {
      sessionId: store.session.id,
      instanceId: store.gmInstance.id,
      requestId: commandId(),
      expectedRevision: store.gmCrisisState?.revision ?? 0,
      crisisId: crisisId.trim(),
      state,
      title: title.trim(),
      details: details.trim(),
      ...(configuration ? { crisisKind: configuration.crisisKind, configurationOverride: configuration.configurationOverride.trim(), ...(configuration.diseaseOutbreak ? { diseaseOutbreak: configuration.diseaseOutbreak } : {}) } : {}),
    },
    createdAt: new Date().toISOString(),
  });
}

/** Bind or release docking quarantine for the current delivered outbreak. */
export async function setDiseaseQuarantine(
  action: 'activate' | 'release',
): Promise<CommandDisposition> {
  const store = useSessionStore.getState();
  if (!store.session || !store.gmInstance || !store.gmCrisisState ||
      store.gmCrisisState.crisisKind !== 'disease-outbreak' ||
      store.gmCrisisState.state === 'draft' || store.gmCrisisState.state === 'closed') {
    throw new Error('A delivered Disease Outbreak is required before changing quarantine.');
  }
  return sendOrQueue({
    id: commandId(),
    kind: 'setDiseaseQuarantine',
    payload: {
      sessionId: store.session.id,
      instanceId: store.gmInstance.id,
      requestId: commandId(),
      action,
      expectedCrisisRevision: store.gmCrisisState.revision,
      expectedQuarantineRevision: store.session.quarantineDocking?.revision ?? 0,
    },
    createdAt: new Date().toISOString(),
  });
}

/** Admit Voyage 33-0 from the current facilitator-owned Approaching Vessel crisis. */
export async function admitVoyage33(crisisId: string): Promise<CommandDisposition> {
  const store = useSessionStore.getState();
  if (!store.session || !store.gmInstance || !store.gmCrisisState) {
    throw new Error('An active Approaching Vessel crisis is required before admitting Voyage 33-0.');
  }
  if (store.gmCrisisState.crisisKind !== 'approaching-vessel' ||
      store.gmCrisisState.crisisId !== crisisId || store.gmCrisisState.state === 'draft' ||
      store.gmCrisisState.state === 'closed') {
    throw new Error('An active Approaching Vessel crisis is required before admitting Voyage 33-0.');
  }
  return sendOrQueue({
    id: commandId(),
    kind: 'admitVoyage33',
    payload: {
      sessionId: store.session.id,
      instanceId: store.gmInstance.id,
      requestId: commandId(),
      expectedRevision: store.gmCrisisState.revision,
      crisisId: crisisId.trim(),
    },
    createdAt: new Date().toISOString(),
  });
}

/** Record an explicit private response to the current debated Zealotry crisis. */
export async function recordZealotryResponse(
  actions: readonly ZealotryResponseAction[],
  customResponse: string,
  rationale: string,
): Promise<CommandDisposition> {
  const store = useSessionStore.getState();
  if (!store.session || !store.gmInstance || !store.gmCrisisState) {
    throw new Error('An active debated Religious Zealotry crisis is required before recording a response.');
  }
  return sendOrQueue({
    id: commandId(),
    kind: 'recordZealotryResponse',
    payload: {
      sessionId: store.session.id,
      instanceId: store.gmInstance.id,
      requestId: commandId(),
      expectedRevision: store.gmCrisisState.revision,
      crisisId: store.gmCrisisState.crisisId,
      actions,
      ...(customResponse.trim() ? { customResponse: customResponse.trim().slice(0, 1000) } : {}),
      rationale: rationale.trim().slice(0, 2000),
    },
    createdAt: new Date().toISOString(),
  });
}

/** Record the facilitator's private President response to the debated Civil Unrest crisis. */
export async function recordCivilUnrestResolution(
  presidentResponse: string,
  consequence: string,
  rationale: string,
): Promise<CommandDisposition> {
  const store = useSessionStore.getState();
  if (!store.session || !store.gmInstance || !store.gmCrisisState ||
      store.gmCrisisState.crisisKind !== 'civil-unrest' || store.gmCrisisState.state !== 'debated') {
    throw new Error('An active debated Civil Unrest crisis is required before recording a resolution.');
  }
  return sendOrQueue({
    id: commandId(),
    kind: 'recordCivilUnrestResolution',
    payload: {
      sessionId: store.session.id,
      instanceId: store.gmInstance.id,
      requestId: commandId(),
      expectedRevision: store.gmCrisisState.revision,
      crisisId: store.gmCrisisState.crisisId,
      presidentResponse: presidentResponse.trim().slice(0, 1000),
      consequence: consequence.trim().slice(0, 1000),
      rationale: rationale.trim().slice(0, 2000),
    },
    createdAt: new Date().toISOString(),
  });
}

/** Submit or revise one team-owned Civil Unrest grievance through the server CAS. */
export async function submitCivilUnrestGrievance(input: {
  crisisId: string;
  affectedShipId?: string;
  visibility: 'private' | 'public';
  text: string;
  expectedGrievanceRevision: number;
  expectedCrisisRevision: number;
}): Promise<CommandDisposition> {
  const store = useSessionStore.getState();
  if (!store.session || !store.me) throw new Error('Join a session before submitting a grievance.');
  return sendOrQueue({
    id: commandId(),
    kind: 'submitCivilUnrestGrievance',
    payload: {
      sessionId: store.session.id,
      requestId: commandId(),
      crisisId: input.crisisId.trim(),
      expectedCrisisRevision: input.expectedCrisisRevision,
      expectedGrievanceRevision: input.expectedGrievanceRevision,
      ...(input.affectedShipId ? { affectedShipId: input.affectedShipId } : {}),
      visibility: input.visibility,
      text: input.text.trim(),
    },
    createdAt: new Date().toISOString(),
  });
}

/** Claim a stable role seat through the server-owned CAS transaction. */
export async function claimSeat(seatId: string): Promise<CommandDisposition> {
  const store = useSessionStore.getState();
  if (!store.session || !store.me) throw new Error('Join a session before claiming a seat.');
  return sendOrQueue({
    id: commandId(),
    kind: 'claimSeat',
    payload: {
      sessionId: store.session.id,
      seatId,
      requestId: commandId(),
      expectedSetupRevision: expectedSetupRevision(store.session),
    },
    createdAt: new Date().toISOString(),
  });
}

/** Release a held seat, optionally carrying the active GM audit reason. */
export async function releaseSeat(seatId: string, reason?: string): Promise<CommandDisposition> {
  const store = useSessionStore.getState();
  if (!store.session || !store.me) throw new Error('Join a session before releasing a seat.');
  return sendOrQueue({
    id: commandId(),
    kind: 'releaseSeat',
    payload: {
      sessionId: store.session.id,
      seatId,
      requestId: commandId(),
      expectedSetupRevision: expectedSetupRevision(store.session),
      ...(store.gmInstance ? { instanceId: store.gmInstance.id } : {}),
      ...(reason?.trim() ? { reason: reason.trim() } : {}),
    },
    createdAt: new Date().toISOString(),
  });
}

export interface EscapeMutationResult {
  readonly status: 'committed' | 'replayed' | 'stale' | 'queued';
  readonly sessionId: string;
  readonly requestId: string;
  readonly targetUid: string;
  readonly shipId: string;
  readonly setupRevision: number;
  readonly escapeState?: Player['escapeState'];
}

function isEscapeMutationResult(value: unknown): value is EscapeMutationResult {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const reply = value as Record<string, unknown>;
  return (reply.status === 'committed' || reply.status === 'replayed' || reply.status === 'stale') &&
    typeof reply.sessionId === 'string' && typeof reply.requestId === 'string' &&
    typeof reply.targetUid === 'string' && typeof reply.shipId === 'string' &&
    Number.isSafeInteger(reply.setupRevision) && (reply.setupRevision as number) >= 0;
}

/** Player-authorized transition out of a destroyed ship's retained station. */
export async function fleeDestroyedShip(): Promise<EscapeMutationResult> {
  const store = useSessionStore.getState();
  if (!store.session || !store.me || !store.me.escapeState) {
    throw new Error('Join a session before fleeing a destroyed ship.');
  }
  requireFreshSessionAuthority();
  const sessionId = store.session.id;
  const targetUid = store.me.uid;
  const shipId = store.me.escapeState.shipId;
  const requestId = commandId();
  const expectedSetupRevisionValue = expectedSetupRevision(store.session);
  const command: PendingCommand = {
    id: requestId,
    kind: 'fleeDestroyedShip',
    payload: { sessionId, requestId, expectedSetupRevision: expectedSetupRevisionValue },
    createdAt: new Date().toISOString(),
  };
  let reply: EscapeMutationResult | undefined;
  const disposition = await sendOrQueue(command, (result) => {
    if (isEscapeMutationResult(result)) reply = result;
  });
  if (disposition === 'queued') {
    return {
      status: 'queued', sessionId, requestId, targetUid, shipId,
      setupRevision: expectedSetupRevisionValue,
    };
  }
  if (!reply) throw new Error('The escape transition returned no usable server receipt.');
  return reply;
}

/** Assign an eligible player to one open printed role during casting. */
export async function assignRole(targetUid: string, roleId: string): Promise<CommandDisposition> {
  const store = useSessionStore.getState();
  if (!store.session || !store.gmInstance) {
    throw new Error('Claim GM before assigning a role.');
  }
  return sendOrQueue({
    id: commandId(),
    kind: 'assignRole',
    payload: {
      sessionId: store.session.id,
      instanceId: store.gmInstance.id,
      requestId: commandId(),
      targetUid,
      roleId,
    },
    createdAt: new Date().toISOString(),
  });
}

/** Release a player’s role and its canonical station before start. */
export async function releaseRole(targetUid: string): Promise<CommandDisposition> {
  const store = useSessionStore.getState();
  if (!store.session || !store.gmInstance) {
    throw new Error('Claim GM before releasing a role.');
  }
  return sendOrQueue({
    id: commandId(),
    kind: 'releaseRole',
    payload: {
      sessionId: store.session.id,
      instanceId: store.gmInstance.id,
      requestId: commandId(),
      targetUid,
    },
    createdAt: new Date().toISOString(),
  });
}

interface ReplacementMutationResultBase {
  readonly sessionId: string;
  readonly targetUid: string;
  readonly revision: number;
  readonly setupRevision: number;
  readonly replacementRoleId?: string;
}

export type ReplacementMutationResult = ReplacementMutationResultBase & (
  | {
    readonly status: 'committed';
    readonly actorUid: string;
    readonly recordedAt: string;
  }
  | {
    readonly status: 'stale';
  }
);

/** Persist the live GM's adjudication; connectivity never creates eligibility. */
export async function setReplacementEligibility(
  targetUid: string,
  reason: 'dead' | 'arrested' | 'removed' | 'late',
  expectedRevision = 0,
  setupRevisionCursor?: number,
): Promise<ReplacementMutationResult> {
  const store = useSessionStore.getState();
  if (!store.session || !store.gmInstance) throw new Error('Claim GM before adjudicating a replacement.');
  requireFreshSessionAuthority();
  await ensureSignedIn();
  const expectedSetupRevisionCursor = setupRevisionCursor ?? expectedSetupRevision(store.session);
  const payload = {
    sessionId: store.session.id, instanceId: store.gmInstance.id,
    requestId: commandId(), targetUid, reason, expectedRevision,
    expectedSetupRevision: expectedSetupRevisionCursor,
  } as const;
  const call = httpsCallable<typeof payload, ReplacementMutationResult>(functions(), 'setReplacementEligibility');
  return (await call(payload)).data;
}

/** Commit one typed replacement role through the server CAS transaction. */
export async function assignReplacementRole(
  targetUid: string,
  replacementRoleId: string,
  expectedRevision: number,
  setupRevisionCursor?: number,
): Promise<ReplacementMutationResult> {
  const store = useSessionStore.getState();
  if (!store.session || !store.gmInstance) throw new Error('Claim GM before assigning a replacement.');
  requireFreshSessionAuthority();
  await ensureSignedIn();
  const expectedSetupRevisionCursor = setupRevisionCursor ?? expectedSetupRevision(store.session);
  const payload = {
    sessionId: store.session.id, instanceId: store.gmInstance.id,
    requestId: commandId(), targetUid, replacementRoleId, expectedRevision,
    expectedSetupRevision: expectedSetupRevisionCursor,
  } as const;
  const call = httpsCallable<typeof payload, ReplacementMutationResult>(functions(), 'assignReplacementRole');
  return (await call(payload)).data;
}

export async function loginGmAccess(password: string): Promise<CommandDisposition> {
  if (!window.navigator.onLine) {
    throw new Error('Reconnect before logging in to GM access.');
  }
  try {
    await ensureSignedIn();
    const call = httpsCallable<{ password: string }, { authenticated: boolean }>(
      functions(),
      'loginGmAccess',
    );
    const reply = await call({ password });
    if (reply.data.authenticated !== true) {
      throw new Error('The server did not confirm GM access.');
    }
    useSessionStore.getState().setGmAccessAuthenticatedAt(Date.now());
    return 'applied';
  } catch (cause) {
    useSessionStore.getState().setCommunicationError(interception(cause));
    throw cause;
  }
}

export async function logoutGmAccess(): Promise<CommandDisposition> {
  const store = useSessionStore.getState();
  const instanceId = store.gmInstance?.id ?? null;
  const command: PendingCommand = {
    id: commandId(),
    kind: 'logoutGmAccess',
    payload: {
      sessionId: store.session?.id ?? null,
      instanceId,
    },
    createdAt: new Date().toISOString(),
  };
  const disposition = await sendOrQueue(command);
  if (disposition === 'queued') {
    const current = useSessionStore.getState();
    current.clearGmAccess();
    if (current.gmInstance?.id === instanceId) {
      current.setGmInstance(null);
      current.setMode(null);
      current.setLastRoute('/roles');
    }
  }
  return disposition;
}

export async function claimGmInstance(name: string): Promise<CommandDisposition> {
  const session = useSessionStore.getState().session;
  if (!session) throw new Error('Join a session before claiming GM.');
  return sendOrQueue({
    id: commandId(),
    kind: 'claimGmInstance',
    payload: {
      sessionId: session.id,
      instanceId: commandId(),
      name: name.trim(),
      deviceLabel: deviceLabel(),
    },
    createdAt: new Date().toISOString(),
  });
}

export async function listGmInstances(): Promise<readonly GmInstance[]> {
  await ensureSignedIn();
  const session = useSessionStore.getState().session;
  if (!session) throw new Error('Join a session before listing GM instances.');
  const call = httpsCallable<{ sessionId: string }, { instances: GmInstance[] }>(
    functions(),
    'listGmInstances',
  );
  return (await call({ sessionId: session.id })).data.instances;
}

/** Set the current browser's server-owned ship-console write target. */
export interface GmShipConsoleWriteGrantAuthority {
  readonly sessionId: string;
  readonly uid: string;
  readonly instanceId: string;
  readonly claimedAt: string;
  readonly shipId: string;
}

export async function setGmShipConsoleWriteGrant(
  shipId: string,
  enabled: boolean,
  authority: GmShipConsoleWriteGrantAuthority,
): Promise<boolean> {
  const store = useSessionStore.getState();
  const cleanupAuthority = !enabled;
  if (!cleanupAuthority &&
      (!store.session || !store.me || store.me.role !== 'gm' || !store.gmInstance)) {
    throw new Error('An active GM instance is required for ship-console write access.');
  }
  if (!cleanupAuthority) {
    requireFreshSessionAuthority();
    if (
      store.session?.id !== authority.sessionId ||
      store.me?.uid !== authority.uid ||
      store.gmInstance?.id !== authority.instanceId ||
      store.gmInstance?.claimedAt !== authority.claimedAt
    ) {
      throw new Error('The GM ship-console authority changed before confirmation.');
    }
  }
  await ensureSignedIn();
  const sessionId = authority.sessionId;
  const instanceId = authority.instanceId;
  const call = httpsCallable<{
    sessionId: string; instanceId: string; shipId: string; enabled: boolean; claimedAt: string;
  }, { enabled: boolean; shipId?: string }>(functions(), 'setGmShipConsoleWriteGrant');
  const result = (await call({
    sessionId,
    instanceId,
    shipId,
    enabled,
    claimedAt: authority.claimedAt,
  })).data;
  const current = useSessionStore.getState();
  if (current.gmInstance?.id === instanceId && result.enabled === true) {
    current.setGmInstance({
      ...current.gmInstance,
      shipConsoleWriteGrant: { shipId: result.shipId ?? shipId, grantedAt: new Date().toISOString() },
    });
  } else if (
    current.gmInstance?.id === instanceId &&
    current.gmInstance.shipConsoleWriteGrant?.shipId === shipId &&
    result.enabled === false
  ) {
    const withoutGrant = { ...current.gmInstance };
    delete withoutGrant.shipConsoleWriteGrant;
    current.setGmInstance(withoutGrant);
  }
  return result.enabled === true;
}

export async function getSessionPresence(): Promise<{ connectedPlayers: number }> {
  await ensureSignedIn();
  const session = useSessionStore.getState().session;
  if (!session) throw new Error('Join a session before reading presence.');
  const call = httpsCallable<{ sessionId: string }, { connectedPlayers: number }>(
    functions(),
    'getSessionPresence',
  );
  return (await call({ sessionId: session.id })).data;
}

export async function refreshPresence(activeConsoleRoleId?: string | null): Promise<void> {
  const store = useSessionStore.getState();
  const session = store.session;
  if (!session) return;
  const instanceId = store.gmInstance?.sessionId === session.id
    ? store.gmInstance.id
    : undefined;
  // A periodic heartbeat may safely stop while authority is stale. Explicit
  // console-role claims/releases must fail so callers cannot update local role
  // state as though the server accepted a cache-authorized mutation.
  if (activeConsoleRoleId === undefined) {
    if (!hasFreshSessionAuthority()) return;
  } else {
    requireFreshSessionAuthority();
  }
  await ensureSignedIn();
  const call = httpsCallable<{
    sessionId: string; activeConsoleRoleId?: string | null; instanceId?: string;
  }, { sessionId: string }>(
    functions(),
    'refreshPresence',
  );
  await call({
    sessionId: session.id,
    ...(instanceId ? { instanceId } : {}),
    ...(activeConsoleRoleId === undefined ? {} : { activeConsoleRoleId }),
  });
}

export async function selectConsoleRole(roleId: string): Promise<void> {
  const before = useSessionStore.getState();
  const checkpoint = before.session
    ? sessionAuthorityCheckpoint(before.session.id, sessionAuthorityUid(before))
    : undefined;
  try {
    // A console route is only an intent.  For the canonical setup roster, the
    // first entry into an open core role must win the same server CAS used by
    // the setup seat board before presence can grant console authority.  The
    // Press station has no core seat and keeps its existing exclusive path.
    const targetSeat = before.seats.find((seat) => (seat.roleId ?? seat.id) === roleId);
    // GMs use the existing live-instance presence path; the seat callable
    // deliberately rejects GM identities. Only ordinary players need the
    // first-entry seat CAS before presence grants console authority.
    const isGm = before.me?.role === 'gm';
    if (!isGm && targetSeat?.status === 'open') {
      const disposition = await claimSeat(targetSeat.id);
      if (disposition !== 'applied') return;
    } else if (!isGm && (
      targetSeat && targetSeat.holderUid !== before.me?.uid
    )) {
      // A claimed or locked seat is already read-only for this browser.  Do
      // not let the presence callable turn a route visit into role authority
      // while a seat projection is ahead of the presence projection.
      return;
    }
    await refreshPresence(roleId);
    const store = useSessionStore.getState();
    if (store.me && authorityCheckpointIsCurrent(checkpoint)) {
      store.setMe({ ...store.me, activeConsoleRoleId: roleId });
    }
  } catch (cause) {
    useSessionStore.getState().setCommunicationError(interception(cause));
    throw cause;
  }
}

export async function releaseConsoleRole(): Promise<void> {
  const before = useSessionStore.getState();
  const checkpoint = before.session
    ? sessionAuthorityCheckpoint(before.session.id, sessionAuthorityUid(before))
    : undefined;
  await refreshPresence(null);
  const store = useSessionStore.getState();
  if (!authorityCheckpointIsCurrent(checkpoint)) return;
  if (store.me) store.setMe({ ...store.me, activeConsoleRoleId: null });
  store.setMode('console');
  store.setLastRoute('/console');
}

export async function reconcileGmAuthority(): Promise<void> {
  const before = useSessionStore.getState();
  const remembered = before.gmInstance;
  if (!remembered) return;
  const checkpoint = before.session
    ? sessionAuthorityCheckpoint(before.session.id, sessionAuthorityUid(before))
    : undefined;
  const instances = await listGmInstances();
  if (!authorityCheckpointIsCurrent(checkpoint, true)) return;
  const current = instances.find((instance) => instance.id === remembered.id);
  if (!current) {
    useSessionStore.getState().setGmInstance(null);
    useSessionStore.getState().setMode(null);
    useSessionStore.getState().setLastRoute('/roles');
  } else {
    useSessionStore.getState().setGmInstance(current);
  }
}

export async function kickGmInstance(targetInstanceId: string): Promise<CommandDisposition> {
  const store = useSessionStore.getState();
  if (!store.session || !store.gmInstance) throw new Error('Claim GM before kicking an instance.');
  return sendOrQueue({
    id: commandId(),
    kind: 'kickGmInstance',
    payload: {
      sessionId: store.session.id,
      instanceId: store.gmInstance.id,
      targetInstanceId,
      requestId: commandId(),
    },
    createdAt: new Date().toISOString(),
  });
}

export async function kickPlayer(targetUid: string): Promise<CommandDisposition> {
  const store = useSessionStore.getState();
  if (!store.session || !store.gmInstance) throw new Error('Claim GM before kicking a player.');
  return sendOrQueue({
    id: commandId(),
    kind: 'kickPlayer',
    payload: {
      sessionId: store.session.id,
      instanceId: store.gmInstance.id,
      targetUid,
      requestId: commandId(),
    },
    createdAt: new Date().toISOString(),
  });
}

export async function releaseGmInstance(): Promise<CommandDisposition> {
  const store = useSessionStore.getState();
  if (!store.session || !store.gmInstance) return 'applied';
  return sendOrQueue({
    id: commandId(),
    kind: 'releaseGmInstance',
    payload: {
      sessionId: store.session.id,
      instanceId: store.gmInstance.id,
      targetInstanceId: store.gmInstance.id,
      requestId: commandId(),
    },
    createdAt: new Date().toISOString(),
  });
}

export async function setCapybaraEnabled(
  capybaraEnabled: boolean,
): Promise<CommandDisposition> {
  const store = useSessionStore.getState();
  if (!store.session || !store.gmInstance) {
    throw new Error('Claim GM before changing ship availability.');
  }
  return sendOrQueue({
    id: commandId(),
    kind: 'setCapybaraEnabled',
    payload: {
      sessionId: store.session.id,
      instanceId: store.gmInstance.id,
      capybaraEnabled,
    },
    createdAt: new Date().toISOString(),
  });
}

export async function setDioneEnabled(dioneEnabled: boolean): Promise<CommandDisposition> {
  const store = useSessionStore.getState();
  if (!store.session || !store.gmInstance) {
    throw new Error('Claim GM before changing ship availability.');
  }
  return sendOrQueue({
    id: commandId(),
    kind: 'setDioneEnabled',
    payload: {
      sessionId: store.session.id,
      instanceId: store.gmInstance.id,
      dioneEnabled,
    },
    createdAt: new Date().toISOString(),
  });
}

export async function setPressEnabled(pressEnabled: boolean): Promise<CommandDisposition> {
  const store = useSessionStore.getState();
  if (!store.session || !store.gmInstance) {
    throw new Error('Claim GM before changing Press availability.');
  }
  const expectedRevision =
    Number.isSafeInteger(store.session.pressAvailabilityRevision) &&
    (store.session.pressAvailabilityRevision as number) >= 0
      ? store.session.pressAvailabilityRevision as number
      : 0;
  return sendOrQueue({
    id: commandId(),
    kind: 'setPressEnabled',
    payload: {
      sessionId: store.session.id,
      instanceId: store.gmInstance.id,
      requestId: commandId(),
      pressEnabled,
      expectedRevision,
    },
    createdAt: new Date().toISOString(),
  });
}

export interface ShipNavigationMoveCommittedReply extends Partial<VesselActionEnvelope> {
  readonly status?: never;
  readonly shipId: string;
  readonly origin: string;
  readonly destination: string;
  readonly stardate: string;
}

export interface ShipNavigationMoveStaleReply extends Partial<VesselActionEnvelope> {
  readonly status: 'stale';
  readonly shipId: string;
  readonly currentRevision: number;
}

export type ShipNavigationMoveReply =
  | ShipNavigationMoveCommittedReply
  | ShipNavigationMoveStaleReply;

export interface ShipStoreScavengeAllocation {
  readonly recipientShipId: string;
  readonly resources: Readonly<Partial<Record<ResourceId, number>>>;
}

export type ShipStoreScavengeReply =
  | (VesselActionEnvelope & {
    readonly status: 'committed';
    readonly sourceShipId: string;
    readonly transfers: readonly ShipStoreScavengeAllocation[];
    readonly inventories: Readonly<Record<string, ShipResourceInventory>>;
    readonly revisions: Readonly<Record<string, number>>;
  })
  | (VesselActionEnvelope & {
    readonly status: 'stale';
    readonly sourceShipId: string;
    readonly currentRevision: number;
  });

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isSafeLedgerAmount(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

function validScavengeInventory(
  value: unknown,
  template: ShipResourceInventory | undefined,
): value is ShipResourceInventory {
  if (!isPlainRecord(value) || !template) return false;
  const expectedKeys = Object.keys(template).sort();
  const actualKeys = Object.keys(value).sort();
  return expectedKeys.length === actualKeys.length &&
    expectedKeys.every((key, index) => key === actualKeys[index] && isSafeLedgerAmount(value[key]));
}

function requireShipStoreScavengeReply(
  value: unknown,
  expected: {
    readonly session: GameSession;
    readonly actorUid: string | undefined;
    readonly requestId: string;
    readonly sourceShipId: string;
    readonly allocations: Readonly<Record<string, Partial<Record<ResourceId, number>>>>;
  },
): ShipStoreScavengeReply {
  if (!isPlainRecord(value) || (value.status !== 'committed' && value.status !== 'stale') ||
      value.sourceShipId !== expected.sourceShipId || value.actorUid !== expected.actorUid ||
      value.vesselId !== expected.sourceShipId || value.idempotencyKey !== expected.requestId ||
      typeof value.auditId !== 'string' || value.auditId.length === 0 ||
      !(typeof value.actorRoleId === 'string' || value.actorRoleId === null) ||
      !isSafeLedgerAmount(value.turn) || sessionPhase(value.phase) === undefined ||
      !isSafeLedgerAmount(value.revision)) {
    throw new Error('The server returned an invalid destroyed-ship store result.');
  }
  if (value.status === 'stale') {
    if (!isSafeLedgerAmount(value.currentRevision) || value.revision !== value.currentRevision) {
      throw new Error('The server returned an invalid destroyed-ship store result.');
    }
    return value as unknown as ShipStoreScavengeReply;
  }

  if (!isPlainRecord(value.inventories) || !isPlainRecord(value.revisions) ||
      !Array.isArray(value.transfers)) {
    throw new Error('The server returned an invalid destroyed-ship store result.');
  }
  const affectedShipIds = [expected.sourceShipId, ...Object.keys(expected.allocations)].sort();
  if (Object.keys(value.inventories).sort().join('\u0000') !== affectedShipIds.join('\u0000') ||
      Object.keys(value.revisions).sort().join('\u0000') !== affectedShipIds.join('\u0000')) {
    throw new Error('The server returned an invalid destroyed-ship store result.');
  }
  for (const shipId of affectedShipIds) {
    if (!isSafeLedgerAmount(value.revisions[shipId]) ||
        !validScavengeInventory(
          value.inventories[shipId],
          resourcesForShip(shipId, expected.session.shipResources),
        )) {
      throw new Error('The server returned an invalid destroyed-ship store result.');
    }
  }
  if (value.revisions[expected.sourceShipId] !== value.revision) {
    throw new Error('The server returned an invalid destroyed-ship store result.');
  }
  const transfers = new Map<string, Record<string, unknown>>();
  for (const transfer of value.transfers) {
    if (!isPlainRecord(transfer) || typeof transfer.recipientShipId !== 'string' ||
        !isPlainRecord(transfer.resources) || transfers.has(transfer.recipientShipId)) {
      throw new Error('The server returned an invalid destroyed-ship store result.');
    }
    transfers.set(transfer.recipientShipId, transfer.resources);
  }
  for (const [recipientShipId, allocation] of Object.entries(expected.allocations)) {
    const transfer = transfers.get(recipientShipId);
    const expectedEntries = Object.entries(allocation).sort(([left], [right]) => left.localeCompare(right));
    const actualEntries = transfer
      ? Object.entries(transfer).sort(([left], [right]) => left.localeCompare(right))
      : [];
    if (JSON.stringify(actualEntries) !== JSON.stringify(expectedEntries)) {
      throw new Error('The server returned an invalid destroyed-ship store result.');
    }
  }
  if (transfers.size !== Object.keys(expected.allocations).length) {
    throw new Error('The server returned an invalid destroyed-ship store result.');
  }
  return value as unknown as ShipStoreScavengeReply;
}

/** GM-only, atomic reconciliation of every retained store on a destroyed ship. */
export async function scavengeDestroyedShipStores(
  sourceShipId: string,
  allocations: Readonly<Record<string, Partial<Record<ResourceId, number>>>>,
): Promise<ShipStoreScavengeReply> {
  const store = useSessionStore.getState();
  if (!store.session || !store.gmInstance) {
    throw new Error('Claim GM before scavenging a destroyed ship.');
  }
  requireFreshSessionAuthority();
  const payload = {
    sessionId: store.session.id,
    instanceId: store.gmInstance.id,
    sourceShipId,
    allocations,
    requestId: commandId(),
    expectedRevision: store.session.vesselActionRevisions?.[sourceShipId] ?? 0,
  };
  const checkpoint = sessionAuthorityCheckpoint(payload.sessionId, sessionAuthorityUid(store));
  try {
    await ensureSignedIn();
    const call = httpsCallable<typeof payload, unknown>(
      functions(),
      'scavengeDestroyedShipStores',
    );
    const reply = requireShipStoreScavengeReply((await call(payload)).data, {
      session: store.session,
      actorUid: sessionAuthorityUid(store),
      requestId: payload.requestId,
      sourceShipId,
      allocations,
    });
    const current = useSessionStore.getState().session;
    if (!current || current.id !== payload.sessionId || !authorityCheckpointIsCurrent(checkpoint)) {
      return reply;
    }
    if (reply.status === 'stale') {
      const localRevision = current.vesselActionRevisions?.[sourceShipId] ?? 0;
      if (reply.currentRevision >= localRevision) {
        useSessionStore.getState().setSession({
          ...current,
          vesselActionRevisions: {
            ...(current.vesselActionRevisions ?? {}),
            [sourceShipId]: reply.currentRevision,
          },
        });
      }
      recordStaleAuthorityReply();
      return reply;
    }
    useSessionStore.getState().setSession({
      ...current,
      shipResources: { ...(current.shipResources ?? {}), ...reply.inventories },
      vesselActionRevisions: { ...(current.vesselActionRevisions ?? {}), ...reply.revisions },
    });
    return reply;
  } catch (cause) {
    useSessionStore.getState().setCommunicationError(interception(cause));
    throw cause;
  }
}

interface ShipConsoleLockCommittedReply extends Partial<VesselActionEnvelope> {
  readonly status?: never;
  readonly shipId: string;
  readonly locked: boolean;
  readonly revision?: number;
}

interface ShipConsoleLockStaleReply extends Partial<VesselActionEnvelope> {
  readonly status: 'stale';
  readonly shipId: string;
  readonly currentRevision: number;
}

type ShipConsoleLockReply = ShipConsoleLockCommittedReply | ShipConsoleLockStaleReply;

/** GM-only, immediate movement; a relocation must never sit in an offline outbox. */
export async function moveShipToLocation(
  shipId: string,
  destination: string,
): Promise<ShipNavigationMoveReply> {
  const store = useSessionStore.getState();
  if (!store.session || !store.gmInstance) {
    throw new Error('Claim GM before moving a ship.');
  }
  requireFreshSessionAuthority();
  const payload = {
    sessionId: store.session.id,
    instanceId: store.gmInstance.id,
    shipId,
    destination,
    requestId: commandId(),
    expectedRevision: store.session.vesselActionRevisions?.[shipId] ?? 0,
  };
  const checkpoint = sessionAuthorityCheckpoint(
    payload.sessionId,
    sessionAuthorityUid(store),
  );
  try {
    await ensureSignedIn();
    const call = httpsCallable<typeof payload, ShipNavigationMoveReply>(
      functions(),
      'moveShipToLocation',
    );
    const reply = (await call(payload)).data;
    if (reply.status === 'stale') {
      const current = useSessionStore.getState().session;
      if (current?.id === payload.sessionId && authorityCheckpointIsCurrent(checkpoint)) {
        const localRevision = current.vesselActionRevisions?.[shipId] ?? 0;
        if (reply.currentRevision >= localRevision) {
          useSessionStore.getState().setSession({
            ...current,
            vesselActionRevisions: {
              ...(current.vesselActionRevisions ?? {}),
              [shipId]: reply.currentRevision,
            },
          });
        }
        recordStaleAuthorityReply();
      }
      return reply;
    }
    const current = useSessionStore.getState().session;
    if (current?.id === payload.sessionId && authorityCheckpointIsCurrent(checkpoint)) {
      useSessionStore.getState().setSession({
        ...current,
        shipGalacticCoordinates: {
          ...current.shipGalacticCoordinates,
          [shipId]: reply.destination,
        },
        vesselActionRevisions: {
          ...(current.vesselActionRevisions ?? {}),
          ...(reply.revision === undefined ? {} : { [shipId]: reply.revision }),
        },
      });
    }
    return reply;
  } catch (cause) {
    useSessionStore.getState().setCommunicationError(interception(cause));
    throw cause;
  }
}

/** Ship-role or GM control for the travel lock; this is also immediate. */
export async function setShipConsoleLock(
  shipId: string,
  locked: boolean,
): Promise<CommandDisposition> {
  const store = useSessionStore.getState();
  if (!store.session || !store.me) {
    throw new Error('Join a session before changing the ICN console lock.');
  }
  requireFreshSessionAuthority();
  const payload = {
    sessionId: store.session.id,
    shipId,
    locked,
    requestId: commandId(),
    expectedRevision: store.session.vesselActionRevisions?.[shipId] ?? 0,
    ...(store.gmInstance ? { instanceId: store.gmInstance.id } : {}),
  };
  const checkpoint = sessionAuthorityCheckpoint(payload.sessionId, sessionAuthorityUid(store));
  try {
    await ensureSignedIn();
    const call = httpsCallable<typeof payload, ShipConsoleLockReply>(
      functions(),
      'setShipConsoleLock',
    );
    const reply = (await call(payload)).data;
    if (reply.status === 'stale') {
      const current = useSessionStore.getState().session;
      if (current?.id === payload.sessionId && authorityCheckpointIsCurrent(checkpoint)) {
        const localRevision = current.vesselActionRevisions?.[shipId] ?? 0;
        if (reply.currentRevision >= localRevision) {
          useSessionStore.getState().setSession({
            ...current,
            vesselActionRevisions: {
              ...(current.vesselActionRevisions ?? {}),
              [shipId]: reply.currentRevision,
            },
          });
        }
        recordStaleAuthorityReply();
      }
      return 'stale';
    }
    if (reply.shipId !== shipId || typeof reply.locked !== 'boolean') {
      throw new Error('The server returned an invalid console-lock result.');
    }
    const current = useSessionStore.getState().session;
    if (current?.id === payload.sessionId && authorityCheckpointIsCurrent(checkpoint)) {
      useSessionStore.getState().setSession({
        ...current,
        shipConsoleLocks: {
          ...current.shipConsoleLocks,
          [reply.shipId]: reply.locked,
        },
        vesselActionRevisions: {
          ...(current.vesselActionRevisions ?? {}),
          ...(reply.revision === undefined ? {} : { [shipId]: reply.revision }),
        },
      });
    }
    return 'applied';
  } catch (cause) {
    useSessionStore.getState().setCommunicationError(interception(cause));
    throw cause;
  }
}

export interface JumpShipReply extends Partial<VesselActionEnvelope> {
  readonly status: 'integrity-locked' | 'integrity-lockout' | 'drive-failure' | 'jumped';
  readonly shipId: string;
  readonly origin: string;
  readonly destination: string;
  readonly integrityLockedUntil?: string;
  readonly length?: 'short' | 'medium' | 'long';
  readonly fuelCost?: number;
  readonly remainingFuel?: number;
  readonly state?: ShipJumpState;
  readonly transition?: ShipJumpTransition;
}

/** Submit a powered, coordinate-locked jump directly to the authoritative drive. */
export async function jumpShip(shipId: string, destination: string): Promise<JumpShipReply> {
  const store = useSessionStore.getState();
  if (!store.session || !store.me) throw new Error('Join a session before jumping.');
  requireFreshSessionAuthority();
  const payload = {
    sessionId: store.session.id,
    shipId,
    destination,
    requestId: commandId(),
    expectedRevision: store.session.vesselActionRevisions?.[shipId] ?? 0,
    ...(store.gmInstance ? { instanceId: store.gmInstance.id } : {}),
  };
  const checkpoint = sessionAuthorityCheckpoint(payload.sessionId, sessionAuthorityUid(store));
  try {
    await ensureSignedIn();
    const call = httpsCallable<typeof payload, JumpShipReply>(functions(), 'jumpShip');
    const reply = (await call(payload)).data;
    const current = useSessionStore.getState().session;
    if (current?.id === payload.sessionId && authorityCheckpointIsCurrent(checkpoint)) {
      const nextSession: GameSession = {
        ...current,
        ...(reply.status === 'jumped' ? {
          shipGalacticCoordinates: {
            ...current.shipGalacticCoordinates,
            [shipId]: reply.destination,
          },
          ...(current.shipResources && reply.remainingFuel !== undefined && current.shipResources[shipId]
            ? { shipResources: {
              ...current.shipResources,
              [shipId]: { ...current.shipResources[shipId], fuel: reply.remainingFuel },
            } }
            : {}),
        } : {}),
        ...(reply.state ? {
          shipJumpStates: { ...current.shipJumpStates, [shipId]: reply.state },
        } : {}),
        ...(reply.transition ? {
          shipJumpTransitions: { ...current.shipJumpTransitions, [shipId]: reply.transition },
        } : {}),
        vesselActionRevisions: {
          ...(current.vesselActionRevisions ?? {}),
          ...(reply.revision === undefined ? {} : { [shipId]: reply.revision }),
        },
      };
      useSessionStore.getState().setSession(nextSession);
    }
    return reply;
  } catch (cause) {
    useSessionStore.getState().setCommunicationError(interception(cause));
    throw cause;
  }
}

export async function setGmControlsLocked(locked: boolean): Promise<CommandDisposition> {
  const store = useSessionStore.getState();
  if (!store.session || !store.gmInstance) {
    throw new Error('Claim GM before changing the GM registration lock.');
  }
  return sendOrQueue({
    id: commandId(),
    kind: 'setGmControlsLocked',
    payload: {
      sessionId: store.session.id,
      instanceId: store.gmInstance.id,
      locked,
    },
    createdAt: new Date().toISOString(),
  });
}

export async function setDebriefMode(active: boolean): Promise<CommandDisposition> {
  const store = useSessionStore.getState();
  if (!store.session || !store.gmInstance) {
    throw new Error('Claim GM before changing debrief mode.');
  }
  return sendOrQueue({
    id: commandId(),
    kind: 'setDebriefMode',
    payload: {
      sessionId: store.session.id,
      instanceId: store.gmInstance.id,
      active,
    },
    createdAt: new Date().toISOString(),
  });
}

interface TurnAdvanceReply {
  readonly currentTurn: number;
  readonly phase?: GameSession['phase'];
  readonly gameOutcome?: GameSession['gameOutcome'];
  readonly turnState?: unknown;
  readonly turnStartAnnouncement?: { turn: number; survivorPopulation: number };
  readonly turnPhase?: unknown;
  readonly maintenanceCycles?: GameSession['maintenanceCycles'];
  readonly shuttleFuelled?: GameSession['shuttleFuelled'];
}

export interface StartGameReceiptReply extends TurnAdvanceReply {
  readonly status: 'committed' | 'replayed';
  readonly sessionId: string;
  readonly requestId: string;
  readonly setupRevision: number;
  readonly setupReceipt: SetupReceipt;
}

export interface StartGameStaleReply {
  readonly status: 'stale';
  readonly sessionId: string;
  readonly requestId: string;
  readonly expectedSetupRevision: number;
  readonly currentSetupRevision: number;
}

export type StartGameReply = StartGameReceiptReply | StartGameStaleReply;

export interface AwayMissionDiscardReply {
  readonly status: 'committed' | 'replayed' | 'stale';
  readonly sessionId: string;
  readonly requestId: string;
  readonly missionId: string;
  readonly expectedSetupRevision: number;
  readonly currentSetupRevision?: number;
}

function awayMissionDiscardReply(value: unknown): AwayMissionDiscardReply {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('The server returned an invalid away-mission result.');
  }
  const raw = value as Record<string, unknown>;
  if ((raw.status !== 'committed' && raw.status !== 'replayed' && raw.status !== 'stale') ||
      typeof raw.sessionId !== 'string' || typeof raw.requestId !== 'string' ||
      typeof raw.missionId !== 'string' || !Number.isSafeInteger(raw.expectedSetupRevision) ||
      (raw.currentSetupRevision !== undefined && !Number.isSafeInteger(raw.currentSetupRevision))) {
    throw new Error('The server returned an invalid away-mission result.');
  }
  return {
    status: raw.status,
    sessionId: raw.sessionId,
    requestId: raw.requestId,
    missionId: raw.missionId,
    expectedSetupRevision: raw.expectedSetupRevision as number,
    ...(raw.currentSetupRevision === undefined ? {} : { currentSetupRevision: raw.currentSetupRevision as number }),
  };
}

/** Let the facilitator explicitly open the private discard step after extra-card selection. */
export async function openPrivateMissionDiscards(missionId: string): Promise<AwayMissionDiscardReply> {
  const store = useSessionStore.getState();
  if (!store.session || !store.gmInstance) throw new Error('Claim GM before opening mission discards.');
  requireFreshSessionAuthority('Reconnect before opening mission discards.');
  const payload = {
    sessionId: store.session.id,
    instanceId: store.gmInstance.id,
    requestId: commandId(),
    expectedSetupRevision: expectedSetupRevision(store.session),
    missionId,
  };
  const checkpoint = sessionAuthorityCheckpoint(payload.sessionId, sessionAuthorityUid(store));
  try {
    await ensureSignedIn();
    const call = httpsCallable<typeof payload, unknown>(functions(), 'openPrivateMissionDiscards');
    const reply = awayMissionDiscardReply((await call(payload)).data);
    if (authorityCheckpointIsCurrent(checkpoint)) {
      // The pointer listeners carry the authoritative phase; do not synthesize
      // a private projection from a callable response.
      useSessionStore.getState().setCommunicationError(null);
    }
    return reply;
  } catch (cause) {
    useSessionStore.getState().setCommunicationError(interception(cause));
    throw cause;
  }
}

/** Secretly discard the current participant's one owned mission card. */
export async function discardPrivateMissionCard(
  missionId: string,
  cardId: string,
): Promise<AwayMissionDiscardReply> {
  const store = useSessionStore.getState();
  if (!store.session || !store.me) throw new Error('Join a session before discarding a mission card.');
  requireFreshSessionAuthority('Reconnect before discarding a mission card.');
  const payload = {
    sessionId: store.session.id,
    requestId: commandId(),
    expectedSetupRevision: expectedSetupRevision(store.session),
    missionId,
    cardId,
  };
  const checkpoint = sessionAuthorityCheckpoint(payload.sessionId, sessionAuthorityUid(store));
  try {
    await ensureSignedIn();
    const call = httpsCallable<typeof payload, unknown>(functions(), 'discardPrivateMissionCard');
    const reply = awayMissionDiscardReply((await call(payload)).data);
    if (authorityCheckpointIsCurrent(checkpoint)) useSessionStore.getState().setCommunicationError(null);
    return reply;
  } catch (cause) {
    useSessionStore.getState().setCommunicationError(interception(cause));
    throw cause;
  }
}

/** Commit the ordinary production start; the server derives Wolf/loyalty state. */
export interface StartGameOptions {
  /** Reuse a caller-held id after an ambiguous transport failure. */
  readonly requestId?: string;
}

export async function startGame(options: StartGameOptions = {}): Promise<StartGameReply> {
  const store = useSessionStore.getState();
  if (!store.session || !store.gmInstance) throw new Error('Claim GM before starting the game.');
  requireFreshSessionAuthority('Reconnect before starting the game.');
  await ensureSignedIn();
  const sessionId = store.session.id;
  const instanceId = store.gmInstance.id;
  const checkpoint = sessionAuthorityCheckpoint(sessionId, sessionAuthorityUid(store));
  const revision = expectedSetupRevision(store.session);
  const requestId = options.requestId ?? (
    sameStartAttempt(pendingStartRequest, sessionId, instanceId, revision)
      ? pendingStartRequest.requestId
      : commandId()
  );
  const attempt: PendingStartRequest = {
    sessionId,
    instanceId,
    expectedSetupRevision: revision,
    requestId,
  };
  pendingStartRequest = attempt;
  const payload = {
    sessionId,
    instanceId,
    requestId,
    expectedSetupRevision: revision,
  };
  const call = httpsCallable<typeof payload, StartGameReply>(functions(), 'startGame');
  try {
    const reply = (await call(payload)).data;
    if (sameStartAttempt(
      pendingStartRequest,
      payload.sessionId,
      payload.instanceId,
      payload.expectedSetupRevision,
    ) && pendingStartRequest.requestId === payload.requestId) {
      pendingStartRequest = null;
    }
    if (reply.status === 'stale') return reply;
    if (!authorityCheckpointIsCurrent(checkpoint)) return reply;
    applyTurnAdvanceReply(store.session.id, reply, false, checkpoint);
    const current = useSessionStore.getState().session;
    if (current?.id === store.session.id && authorityCheckpointIsCurrent(checkpoint)) {
      useSessionStore.getState().setSession({
        ...current,
        phase: 'active',
        configurationLocked: true,
        currentTurn: reply.currentTurn,
        setupRevision: reply.setupRevision,
        pursuitGroups: { 'fleet-1': 2 },
        shipFleetGroupIds: Object.fromEntries((current.activeVesselIds ?? []).map((shipId) => [shipId, 'fleet-1'])),
        ...(current.playerDiscovery
          ? { playerDiscovery: { ...current.playerDiscovery, pursuitValue: 2 } }
          : {}),
      });
    }
    useSessionStore.getState().setGmSetupReceipt(reply.setupReceipt);
    return reply;
  } catch (cause) {
    if (!isTransientCommandError(cause)) {
      if (sameStartAttempt(
        pendingStartRequest,
        payload.sessionId,
        payload.instanceId,
        payload.expectedSetupRevision,
      ) && pendingStartRequest.requestId === payload.requestId) {
        pendingStartRequest = null;
      }
    }
    useSessionStore.getState().setCommunicationError(interception(cause));
    throw cause;
  }
}

function applyTurnAdvanceReply(
  sessionId: string,
  reply: TurnAdvanceReply,
  skipTurnStartAnnouncement: boolean,
  checkpoint: SessionAuthorityCheckpoint | undefined,
): void {
  const activeSession = useSessionStore.getState().session;
  const announcement = reply.turnStartAnnouncement;
  const hasAnnouncement = Boolean(
    announcement && Number.isSafeInteger(announcement.turn) && announcement.turn >= 1 &&
    Number.isSafeInteger(announcement.survivorPopulation) && announcement.survivorPopulation >= 0,
  );
  const phaseClock = turnPhaseState(reply.turnPhase);
  if (
    activeSession?.id !== sessionId || !Number.isSafeInteger(reply.currentTurn) ||
    reply.currentTurn < 0 || !authorityCheckpointIsCurrent(checkpoint)
  ) return;
  // A terminal reply is the authoritative lifecycle checkpoint. Do not let
  // optional phase/entity/announcement fields from the same response reopen
  // the completed turn projection after the debrief transition.
  if (reply.phase === 'debrief' || reply.phase === 'failure') {
    const gameOutcome = reply.gameOutcome;
    const validFailureOutcome = reply.phase === 'failure' && gameOutcome?.type === 'game-outcome' &&
      gameOutcome.result === 'failure' && gameOutcome.cause === 'pursuit-limit' &&
      Number.isSafeInteger(gameOutcome.cycle) && gameOutcome.cycle >= 1 &&
      Number.isSafeInteger(gameOutcome.navigationRevision) && gameOutcome.navigationRevision >= 1 &&
      typeof gameOutcome.occurredAt === 'string';
    const terminalSession = {
      ...activeSession,
      currentTurn: reply.currentTurn,
      phase: reply.phase,
      ...(validFailureOutcome ? { gameOutcome } : {}),
      ...(reply.maintenanceCycles
        ? { maintenanceCycles: reply.maintenanceCycles }
        : {}),
      ...(reply.shuttleFuelled
        ? { shuttleFuelled: reply.shuttleFuelled }
        : {}),
    };
    delete terminalSession.turnPhase;
    delete terminalSession.turnState;
    delete terminalSession.turnStartAnnouncement;
    useSessionStore.getState().setSession(terminalSession);
    return;
  }
  const turnState = turnStateForPhaseContext(
    reply.turnState,
    phaseClock,
    reply.currentTurn,
    turnLimitForSession(activeSession),
  );
  const nextSession = {
    ...activeSession,
    currentTurn: reply.currentTurn,
    ...(hasAnnouncement && announcement ? { turnStartAnnouncement: announcement } : {}),
    ...(reply.maintenanceCycles
      ? { maintenanceCycles: reply.maintenanceCycles }
      : {}),
    ...(reply.shuttleFuelled
      ? { shuttleFuelled: reply.shuttleFuelled }
      : {}),
  };
  if (skipTurnStartAnnouncement) delete nextSession.turnStartAnnouncement;
  // An accepted transition with no valid phase must not carry an entity from
  // the previous turn forward. A valid phase below replaces this projection
  // with the context-checked reply entity when one is present.
  delete nextSession.turnState;
  useSessionStore.getState().setSession(
    phaseClock ? replaceTurnStateOnPhase(nextSession, phaseClock, turnState) : nextSession,
  );
}

export async function advanceTurn({
  overridePhaseTimer = false,
  skipTurnStartAnnouncement = false,
  requestId = commandId(),
}: {
  readonly overridePhaseTimer?: boolean;
  readonly skipTurnStartAnnouncement?: boolean;
  /** Reuse the same id after an ambiguous transport failure. */
  readonly requestId?: string;
} = {}): Promise<void> {
  const store = useSessionStore.getState();
  if (!store.session || !store.gmInstance) throw new Error('Claim GM before advancing the cycle.');
  requireFreshSessionAuthority();
  await ensureSignedIn();
  const expectedTurn = store.session.currentTurn ?? 1;
  const checkpoint = sessionAuthorityCheckpoint(
    store.session.id,
    sessionAuthorityUid(store),
  );
  const call = httpsCallable<
    {
      sessionId: string;
      instanceId: string;
      requestId: string;
      expectedTurn: number;
      overridePhaseTimer?: boolean;
      skipTurnStartAnnouncement?: boolean;
    },
    TurnAdvanceReply
  >(functions(), 'advanceTurn');
  try {
    const reply = await call({
      sessionId: store.session.id,
      instanceId: store.gmInstance.id,
      requestId,
      expectedTurn,
      ...(overridePhaseTimer ? { overridePhaseTimer: true } : {}),
      ...(skipTurnStartAnnouncement ? { skipTurnStartAnnouncement: true } : {}),
    });
    applyTurnAdvanceReply(store.session.id, reply.data, skipTurnStartAnnouncement, checkpoint);
  } catch (cause) {
    useSessionStore.getState().setCommunicationError(interception(cause));
    throw cause;
  }
}

/** Start the Cycle 1 demo when this browser is the session's only connected player. */
export async function startSinglePlayerDemo(): Promise<void> {
  const store = useSessionStore.getState();
  if (!store.session) throw new Error('Join a session before starting the demo.');
  requireFreshSessionAuthority('Reconnect before starting the demo.');
  if (store.session.currentTurn !== 0) {
    throw new Error('The single-player demo is only available from Cycle 0.');
  }
  const checkpoint = sessionAuthorityCheckpoint(store.session.id, sessionAuthorityUid(store));
  await ensureSignedIn();
  const call = httpsCallable<{ sessionId: string }, TurnAdvanceReply>(
    functions(),
    'startSinglePlayerDemo',
  );
  try {
    const reply = await call({ sessionId: store.session.id });
    applyTurnAdvanceReply(store.session.id, reply.data, false, checkpoint);
  } catch (cause) {
    useSessionStore.getState().setCommunicationError(interception(cause));
    throw cause;
  }
}

/** Replay the latest cycle transmission locally or across the connected fleet. */
export async function replayTurnStartAnnouncement(audience: TurnStartReplayAudience): Promise<void> {
  const store = useSessionStore.getState();
  if (!store.session || !store.gmInstance) throw new Error('Claim GM before replaying a cycle transmission.');
  const currentTurn = store.session.currentTurn ?? 1;
  const current = store.session.turnStartAnnouncement;
  if (!current || current.turn !== currentTurn || currentTurn < 1) {
    throw new Error('No current cycle transmission is available to replay.');
  }

  if (audience === 'gm') {
    useSessionStore.getState().setTurnStartReplay({
      sessionId: store.session.id,
      turn: current.turn,
      survivorPopulation: current.survivorPopulation,
      token: ++localTurnStartReplayToken,
    });
    return;
  }

  requireFreshSessionAuthority();
  const checkpoint = sessionAuthorityCheckpoint(store.session.id, sessionAuthorityUid(store));
  await ensureSignedIn();
  const call = httpsCallable<
    { sessionId: string; instanceId: string },
    { turnStartAnnouncement?: { turn: number; survivorPopulation: number; revision?: number } }
  >(functions(), 'replayTurnStartAnnouncement');
  try {
    const reply = await call({
      sessionId: store.session.id,
      instanceId: store.gmInstance.id,
    });
    const announcement = reply.data.turnStartAnnouncement;
    const activeSession = useSessionStore.getState().session;
    if (
      activeSession?.id === store.session.id &&
      isTurnStartAnnouncement(announcement) &&
      authorityCheckpointIsCurrent(checkpoint)
    ) {
      useSessionStore.getState().setSession({
        ...activeSession,
        turnStartAnnouncement: announcement,
      });
    }
  } catch (cause) {
    useSessionStore.getState().setCommunicationError(interception(cause));
    throw cause;
  }
}

/** Let any connected player synchronize the server-owned handoff into coordination. */
export async function beginOpenAirspacePhase(expectedTurn: number): Promise<void> {
  const store = useSessionStore.getState();
  if (!store.session || !hasFreshSessionAuthority()) return;
  if (store.session.currentTurn !== expectedTurn) return;
  const checkpoint = sessionAuthorityCheckpoint(store.session.id, sessionAuthorityUid(store));
  await ensureSignedIn();
  const call = httpsCallable<
    { sessionId: string; expectedTurn: number },
    { turnPhase?: unknown; turnState?: unknown }
  >(functions(), 'beginOpenAirspacePhase');
  try {
    const reply = await call({ sessionId: store.session.id, expectedTurn });
    const phaseClock = turnPhaseState(reply.data.turnPhase);
    const activeSession = useSessionStore.getState().session;
    if (phaseClock && activeSession?.id === store.session.id && authorityCheckpointIsCurrent(checkpoint)) {
      const turnState = turnStateForPhaseContext(
        reply.data.turnState,
        phaseClock,
        activeSession.currentTurn,
        turnLimitForSession(activeSession),
      );
      useSessionStore.getState().setSession(replaceTurnStateOnPhase(activeSession, phaseClock, turnState));
    }
  } catch (cause) {
    // A concurrent GM advance intentionally makes an already-scheduled handoff stale.
    // If the same restricted phase remains local, however, the client likely reached
    // the deadline fractionally before the server and the coordinator must retry.
    if (errorCode(cause) === 'functions/failed-precondition') {
      const latestSession = useSessionStore.getState().session;
      const latestPhase = turnPhaseState(latestSession?.turnPhase);
      if (
        latestSession?.currentTurn !== expectedTurn ||
        latestPhase?.turn !== expectedTurn ||
        latestPhase.airspace.state === 'lifted'
      ) return;
      if (latestPhase.airspace.state === 'restricted') throw cause;
    }
    store.setCommunicationError(interception(cause));
    throw cause;
  }
}

/** Add one server-authorized five-minute increment to the active airspace window. */
export async function extendAirspaceWindow(window: AirspaceWindow): Promise<void> {
  const store = useSessionStore.getState();
  if (!store.session || !store.gmInstance) {
    throw new Error('Reconnect and claim GM before extending airspace time.');
  }
  requireFreshSessionAuthority('Reconnect and claim GM before extending airspace time.');
  const checkpoint = sessionAuthorityCheckpoint(store.session.id, sessionAuthorityUid(store));
  await ensureSignedIn();
  const call = httpsCallable<
    { sessionId: string; instanceId: string; expectedTurn: number; window: AirspaceWindow },
    { turnPhase?: unknown; turnState?: unknown }
  >(functions(), 'extendAirspaceWindow');
  try {
    const reply = await call({
      sessionId: store.session.id,
      instanceId: store.gmInstance.id,
      expectedTurn: store.session.currentTurn ?? 1,
      window,
    });
    const phaseClock = turnPhaseState(reply.data.turnPhase);
    const activeSession = useSessionStore.getState().session;
    if (phaseClock && activeSession?.id === store.session.id && authorityCheckpointIsCurrent(checkpoint)) {
      const turnState = turnStateForPhaseContext(
        reply.data.turnState,
        phaseClock,
        activeSession.currentTurn,
        turnLimitForSession(activeSession),
      );
      useSessionStore.getState().setSession(replaceTurnStateOnPhase(activeSession, phaseClock, turnState));
    }
  } catch (cause) {
    useSessionStore.getState().setCommunicationError(interception(cause));
    throw cause;
  }
}

/** GM-only, live-only emergency interlock; a pause must never wait in an outbox. */
export async function setEmergencyTimerPaused(paused: boolean): Promise<void> {
  const store = useSessionStore.getState();
  if (!store.session || !store.gmInstance) {
    throw new Error('Reconnect and claim GM before changing the emergency timer.');
  }
  requireFreshSessionAuthority('Reconnect and claim GM before changing the emergency timer.');
  const checkpoint = sessionAuthorityCheckpoint(store.session.id, sessionAuthorityUid(store));
  await ensureSignedIn();
  const payload = {
    sessionId: store.session.id,
    instanceId: store.gmInstance.id,
    expectedTurn: store.session.currentTurn ?? 1,
    paused,
  };
  const call = httpsCallable<typeof payload, { turnPhase?: unknown; turnState?: unknown }>(
    functions(),
    'setEmergencyTimerPaused',
  );
  try {
    const reply = await call(payload);
    const phaseClock = turnPhaseState(reply.data.turnPhase);
    const activeSession = useSessionStore.getState().session;
    if (phaseClock && activeSession?.id === payload.sessionId && authorityCheckpointIsCurrent(checkpoint)) {
      const turnState = turnStateForPhaseContext(
        reply.data.turnState,
        phaseClock,
        activeSession.currentTurn,
        turnLimitForSession(activeSession),
      );
      useSessionStore.getState().setSession(replaceTurnStateOnPhase(activeSession, phaseClock, turnState));
    }
  } catch (cause) {
    useSessionStore.getState().setCommunicationError(interception(cause));
    throw cause;
  }
}

function wolfAttackWindowReply(value: unknown): WolfAttackWindow | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const reply = value as Record<string, unknown>;
  if (
    (reply.status !== 'due' && reply.status !== 'resolved' && reply.status !== 'deferred') ||
    typeof reply.turn !== 'number' || !Number.isSafeInteger(reply.turn) || reply.turn < 1 ||
    typeof reply.revision !== 'number' || !Number.isSafeInteger(reply.revision) || reply.revision < 0
  ) return null;
  return {
    status: reply.status,
    turn: reply.turn,
    revision: reply.revision,
  };
}

function wolfAttackPreparationReply(value: unknown): WolfAttackPreparation | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const reply = value as Record<string, unknown>;
  const shipIds = Array.isArray(reply.shipIds)
    ? reply.shipIds.filter((id): id is string => typeof id === 'string')
    : [];
  const targetAssignments = Array.isArray(reply.targetAssignments)
    ? reply.targetAssignments.flatMap((assignment): WolfAttackPreparationTargetAssignment[] => {
      if (typeof assignment !== 'object' || assignment === null || Array.isArray(assignment)) return [];
      const candidate = assignment as Record<string, unknown>;
      return typeof candidate.cardIndex === 'number' && Number.isSafeInteger(candidate.cardIndex) &&
        candidate.cardIndex >= 0 && typeof candidate.targetShipId === 'string'
        ? [{ cardIndex: candidate.cardIndex, targetShipId: candidate.targetShipId }]
        : [];
    })
    : [];
  const modifiers = Array.isArray(reply.modifiers)
    ? reply.modifiers.filter((modifier): modifier is WolfAttackPreparationModifierId => typeof modifier === 'string')
    : [];
  if (
    !Number.isSafeInteger(reply.turn) || (reply.turn as number) < 1 ||
    !Number.isSafeInteger(reply.revision) || (reply.revision as number) < 0 ||
    (reply.targetMode !== 'manual' && reply.targetMode !== 'pre-rolled') ||
    typeof reply.notes !== 'string' || !Array.isArray(reply.shipIds) || shipIds.length !== reply.shipIds.length ||
    !Array.isArray(reply.targetAssignments) || targetAssignments.length !== reply.targetAssignments.length ||
    !Array.isArray(reply.modifiers) || modifiers.length !== reply.modifiers.length
  ) return null;
  return {
    turn: reply.turn as number,
    revision: reply.revision as number,
    shipIds,
    targetMode: reply.targetMode as WolfAttackTargetMode,
    targetAssignments,
    modifiers,
    notes: reply.notes,
  };
}

function wolfAttackDeclarationReply(value: unknown): WolfAttackDeclarationResult | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const reply = value as Record<string, unknown>;
  if (
    (reply.status !== 'committed' && reply.status !== 'replayed') ||
    reply.type !== 'wolf-attack-declaration' || typeof reply.sessionId !== 'string' ||
    typeof reply.requestId !== 'string' ||
    !Number.isSafeInteger(reply.turn) || (reply.turn as number) < 1 ||
    !Number.isSafeInteger(reply.revision) || (reply.revision as number) < 1 ||
    reply.currentStep !== 'targeting' || typeof reply.deadlineAt !== 'string' ||
    reply.airspaceLocked !== true ||
    !Number.isSafeInteger(reply.parkedCraftCount) || (reply.parkedCraftCount as number) < 0 ||
    typeof reply.announcementId !== 'string' || !reply.announcementId
  ) return null;
  return {
    status: reply.status,
    type: 'wolf-attack-declaration',
    sessionId: reply.sessionId,
    requestId: reply.requestId,
    turn: reply.turn as number,
    revision: reply.revision as number,
    currentStep: 'targeting',
    deadlineAt: reply.deadlineAt,
    airspaceLocked: true,
    parkedCraftCount: reply.parkedCraftCount as number,
    announcementId: reply.announcementId,
  };
}

function wolfAttackStageAdvanceReply(value: unknown): WolfAttackStageAdvanceResult | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const reply = value as Record<string, unknown>;
  const allowed = new Set([
    'status', 'type', 'sessionId', 'requestId', 'turn', 'revision',
    'previousStep', 'currentStep', 'deadlineAt',
  ]);
  if (
    Object.keys(reply).some((key) => !allowed.has(key)) ||
    reply.status !== 'committed' || reply.type !== 'wolf-attack-stage-advance' ||
    typeof reply.sessionId !== 'string' || !reply.sessionId ||
    typeof reply.requestId !== 'string' || !reply.requestId ||
    !Number.isSafeInteger(reply.turn) || (reply.turn as number) < 1 ||
    !Number.isSafeInteger(reply.revision) || (reply.revision as number) < 2 ||
    reply.previousStep !== 'targeting' || reply.currentStep !== 'long-range' ||
    typeof reply.deadlineAt !== 'string' || !Number.isFinite(Date.parse(reply.deadlineAt))
  ) return null;
  return {
    status: 'committed', type: 'wolf-attack-stage-advance',
    sessionId: reply.sessionId, requestId: reply.requestId,
    turn: reply.turn as number, revision: reply.revision as number,
    previousStep: 'targeting', currentStep: 'long-range', deadlineAt: reply.deadlineAt,
  };
}

function dioneMaliadesLaunchViewReply(value: unknown): DioneMaliadesLaunchView | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const reply = value as Record<string, unknown>;
  const validReason = reply.reason === undefined || reply.reason === 'waiting' ||
    reply.reason === 'uncharged' || reply.reason === 'damaged' ||
    reply.reason === 'destroyed' ||
    reply.reason === 'already-launched';
  if (reply.type !== 'dione-maliades-launch-view' || typeof reply.sessionId !== 'string' ||
      !reply.sessionId || !Number.isSafeInteger(reply.turn) || (reply.turn as number) < 1 ||
      !Number.isSafeInteger(reply.revision) || (reply.revision as number) < 0 ||
      typeof reply.launched !== 'boolean' || typeof reply.eligible !== 'boolean' || !validReason ||
      (reply.eligible && (reply.launched || reply.reason !== undefined)) ||
      (reply.launched && reply.reason !== 'already-launched') ||
      (!reply.eligible && !reply.reason)) return null;
  const reason = reply.reason as DioneMaliadesLaunchView['reason'];
  return {
    type: 'dione-maliades-launch-view', sessionId: reply.sessionId,
    turn: reply.turn as number, revision: reply.revision as number,
    launched: reply.launched, eligible: reply.eligible,
    ...(reason === undefined ? {} : { reason }),
  };
}

function dioneMaliadesLaunchResultReply(value: unknown): DioneMaliadesLaunchResult | null {
  const view = dioneMaliadesLaunchViewReply(value);
  if (!view || typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const reply = value as Record<string, unknown>;
  if (reply.maliadesRevision !== undefined &&
      (!Number.isSafeInteger(reply.maliadesRevision) || (reply.maliadesRevision as number) < 1)) return null;
  return (reply.status === 'committed' || reply.status === 'replayed') &&
    typeof reply.requestId === 'string' && reply.requestId.length > 0
    ? {
      ...view, status: reply.status, requestId: reply.requestId,
      ...(reply.maliadesRevision === undefined ? {} : { maliadesRevision: reply.maliadesRevision as number }),
    }
    : null;
}

export type WolfCommanderTargetingReadResult =
  | WolfCommanderTargetingView
  | Readonly<{
    type: 'wolf-commander-targeting-unavailable';
    sessionId: string;
    reason: 'waiting' | 'not-targeting';
  }>;

export interface WolfCommanderTargetRerollResult {
  readonly status: 'committed';
  readonly type: 'wolf-commander-target-reroll';
  readonly sessionId: string;
  readonly requestId: string;
  readonly turn: number;
  readonly revision: number;
  readonly currentStep: 'targeting';
  readonly rerolledIndexes: readonly number[];
  readonly view: WolfCommanderTargetingView;
}

export interface WolfCommanderTargetingFinishResult {
  readonly status: 'committed';
  readonly type: 'wolf-commander-targeting-finish';
  readonly sessionId: string;
  readonly requestId: string;
  readonly turn: number;
  readonly revision: number;
  readonly currentStep: 'targeting';
  readonly view: WolfCommanderTargetingView;
}

export interface WolfAttackStageAdvanceResult {
  readonly status: 'committed';
  readonly type: 'wolf-attack-stage-advance';
  readonly sessionId: string;
  readonly requestId: string;
  readonly turn: number;
  readonly revision: number;
  readonly previousStep: 'targeting';
  readonly currentStep: 'long-range';
  readonly deadlineAt: string;
}

function wolfCommanderTargetingView(value: unknown): WolfCommanderTargetingView | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  const rolls = Array.isArray(raw.rolls) ? raw.rolls.flatMap((roll): WolfCommanderTargetingView['rolls'][number][] => {
    if (typeof roll !== 'object' || roll === null || Array.isArray(roll)) return [];
    const candidate = roll as Record<string, unknown>;
    return Number.isSafeInteger(candidate.rosterIndex) && (candidate.rosterIndex as number) >= 0 &&
      typeof candidate.shipId === 'string' && candidate.shipId.length > 0 &&
      Number.isSafeInteger(candidate.die) && (candidate.die as number) >= 1 &&
      typeof candidate.target === 'string' && candidate.target.length > 0
      ? [{ rosterIndex: candidate.rosterIndex as number, shipId: candidate.shipId, die: candidate.die as number, target: candidate.target }]
      : [];
  }) : [];
  const eligibleRerollIndexes = Array.isArray(raw.eligibleRerollIndexes)
    ? raw.eligibleRerollIndexes.filter((index): index is number => Number.isSafeInteger(index) && (index as number) >= 0)
    : [];
  const rerolledIndexes = Array.isArray(raw.rerolledIndexes)
    ? raw.rerolledIndexes.filter((index): index is number => Number.isSafeInteger(index) && (index as number) >= 0)
    : [];
  if (raw.type !== 'wolf-commander-targeting-view' || typeof raw.sessionId !== 'string' ||
      !raw.sessionId || !Number.isSafeInteger(raw.turn) || (raw.turn as number) < 1 ||
      !Number.isSafeInteger(raw.revision) || (raw.revision as number) < 1 || raw.currentStep !== 'targeting' ||
      typeof raw.rerollsFinalized !== 'boolean' ||
      !Array.isArray(raw.rolls) || rolls.length !== raw.rolls.length ||
      !Array.isArray(raw.eligibleRerollIndexes) || eligibleRerollIndexes.length !== raw.eligibleRerollIndexes.length ||
      !Array.isArray(raw.rerolledIndexes) || rerolledIndexes.length !== raw.rerolledIndexes.length ||
      (raw.rerollsFinalized && eligibleRerollIndexes.length > 0)) return null;
  return {
    type: 'wolf-commander-targeting-view',
    sessionId: raw.sessionId,
    turn: raw.turn as number,
    revision: raw.revision as number,
    currentStep: 'targeting',
    rerollsFinalized: raw.rerollsFinalized,
    rolls,
    eligibleRerollIndexes,
    rerolledIndexes,
  };
}

function wolfCommanderTargetingFinishReply(value: unknown): WolfCommanderTargetingFinishResult | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const reply = value as Record<string, unknown>;
  const view = wolfCommanderTargetingView(reply.view);
  return reply.status === 'committed' && reply.type === 'wolf-commander-targeting-finish' &&
    typeof reply.sessionId === 'string' && reply.sessionId.length > 0 &&
    typeof reply.requestId === 'string' && reply.requestId.length > 0 &&
    Number.isSafeInteger(reply.turn) && (reply.turn as number) >= 1 &&
    Number.isSafeInteger(reply.revision) && (reply.revision as number) >= 1 &&
    reply.currentStep === 'targeting' && view?.rerollsFinalized === true &&
    view.sessionId === reply.sessionId && view.turn === reply.turn && view.revision === reply.revision
    ? {
      status: 'committed', type: 'wolf-commander-targeting-finish',
      sessionId: reply.sessionId, requestId: reply.requestId,
      turn: reply.turn as number, revision: reply.revision as number,
      currentStep: 'targeting', view,
    }
    : null;
}

const AEGIS_CNC_REASONS = new Set([
  'waiting', 'not-targeting', 'commander-pending', 'uncharged', 'damaged', 'damage-unknown', 'already-used', 'no-targets',
]);

function aegisCommandAndControlViewReply(value: unknown): AegisCommandAndControlView | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  const allowed = new Set([
    'type', 'sessionId', 'turn', 'revision', 'eligible', 'commanderAssigned',
    'rerollsFinalized', 'reason', 'targets', 'redirectedShipId',
  ]);
  const targets = Array.isArray(raw.targets) ? raw.targets.flatMap((target) => {
    if (typeof target !== 'object' || target === null || Array.isArray(target)) return [];
    const candidate = target as Record<string, unknown>;
    return Number.isSafeInteger(candidate.rosterIndex) && (candidate.rosterIndex as number) >= 0 &&
      typeof candidate.shipId === 'string' && candidate.shipId.length > 0 &&
      Object.keys(candidate).every((key) => key === 'rosterIndex' || key === 'shipId')
      ? [{ rosterIndex: candidate.rosterIndex as number, shipId: candidate.shipId }]
      : [];
  }) : [];
  const validReason = raw.reason === undefined || (typeof raw.reason === 'string' && AEGIS_CNC_REASONS.has(raw.reason));
  if (Object.keys(raw).some((key) => !allowed.has(key)) || raw.type !== 'aegis-command-and-control-view' ||
      typeof raw.sessionId !== 'string' || !raw.sessionId ||
      !Number.isSafeInteger(raw.turn) || (raw.turn as number) < 1 ||
      !Number.isSafeInteger(raw.revision) || (raw.revision as number) < 0 ||
      typeof raw.eligible !== 'boolean' || typeof raw.commanderAssigned !== 'boolean' ||
      typeof raw.rerollsFinalized !== 'boolean' || !validReason ||
      !Array.isArray(raw.targets) || targets.length !== raw.targets.length ||
      (raw.redirectedShipId !== undefined && (typeof raw.redirectedShipId !== 'string' || !raw.redirectedShipId)) ||
      (raw.eligible && raw.reason !== undefined) || (!raw.eligible && !raw.reason) ||
      (new Set(targets.map((target) => target.rosterIndex)).size !== targets.length) ||
      targets.some((target, index) => target.rosterIndex !== index) ||
      (raw.eligible && targets.length === 0) || (!raw.eligible && targets.length !== 0) ||
      (raw.eligible && raw.commanderAssigned && !raw.rerollsFinalized) ||
      (raw.reason === 'commander-pending' && (!raw.commanderAssigned || raw.rerollsFinalized)) ||
      (raw.reason === 'already-used' && !raw.rerollsFinalized) ||
      ((raw.reason === 'already-used') !== (raw.redirectedShipId !== undefined))) return null;
  return {
    type: 'aegis-command-and-control-view',
    sessionId: raw.sessionId,
    turn: raw.turn as number,
    revision: raw.revision as number,
    eligible: raw.eligible,
    commanderAssigned: raw.commanderAssigned,
    rerollsFinalized: raw.rerollsFinalized,
    ...(raw.reason === undefined
      ? {}
      : { reason: raw.reason as NonNullable<AegisCommandAndControlView['reason']> }),
    targets,
    ...(raw.redirectedShipId === undefined ? {} : { redirectedShipId: raw.redirectedShipId as string }),
  };
}

function aegisCommandAndControlResultReply(value: unknown): AegisCommandAndControlResult | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  const allowed = new Set([
    'status', 'type', 'sessionId', 'requestId', 'turn', 'revision', 'rosterIndex',
    'shipId', 'commanderCompletion', 'view',
  ]);
  const view = aegisCommandAndControlViewReply(raw.view);
  if (Object.keys(raw).some((key) => !allowed.has(key)) || raw.status !== 'committed' ||
      raw.type !== 'aegis-command-and-control-result' || typeof raw.sessionId !== 'string' || !raw.sessionId ||
      typeof raw.requestId !== 'string' || !raw.requestId ||
      !Number.isSafeInteger(raw.turn) || (raw.turn as number) < 1 ||
      !Number.isSafeInteger(raw.revision) || (raw.revision as number) < 1 ||
      !Number.isSafeInteger(raw.rosterIndex) || (raw.rosterIndex as number) < 0 ||
      typeof raw.shipId !== 'string' || !raw.shipId ||
      (raw.commanderCompletion !== 'finished' && raw.commanderCompletion !== 'no-commander') ||
      !view || view.sessionId !== raw.sessionId || view.turn !== raw.turn || view.revision !== raw.revision ||
      view.reason !== 'already-used' || view.redirectedShipId !== raw.shipId ||
      (raw.commanderCompletion === 'no-commander' && view.commanderAssigned)) return null;
  return {
    status: 'committed', type: 'aegis-command-and-control-result',
    sessionId: raw.sessionId, requestId: raw.requestId,
    turn: raw.turn as number, revision: raw.revision as number,
    rosterIndex: raw.rosterIndex as number, shipId: raw.shipId,
    commanderCompletion: raw.commanderCompletion, view,
  };
}

function wolfCommanderTargetingReadReply(value: unknown): WolfCommanderTargetingReadResult | null {
  const view = wolfCommanderTargetingView(value);
  if (view) return view;
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const reply = value as Record<string, unknown>;
  return reply.type === 'wolf-commander-targeting-unavailable' && typeof reply.sessionId === 'string' &&
    (reply.reason === 'waiting' || reply.reason === 'not-targeting')
    ? { type: reply.type, sessionId: reply.sessionId, reason: reply.reason } : null;
}

function wolfCommanderTargetRerollReply(value: unknown): WolfCommanderTargetRerollResult | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const reply = value as Record<string, unknown>;
  const view = wolfCommanderTargetingView(reply.view);
  const indexes = Array.isArray(reply.rerolledIndexes)
    ? reply.rerolledIndexes.filter((index): index is number => Number.isSafeInteger(index) && (index as number) >= 0)
    : [];
  if (reply.status !== 'committed' || reply.type !== 'wolf-commander-target-reroll' ||
      typeof reply.sessionId !== 'string' || !reply.sessionId || typeof reply.requestId !== 'string' ||
      !Number.isSafeInteger(reply.turn) || (reply.turn as number) < 1 ||
      !Number.isSafeInteger(reply.revision) || (reply.revision as number) < 1 || reply.currentStep !== 'targeting' ||
      !Array.isArray(reply.rerolledIndexes) || indexes.length !== reply.rerolledIndexes.length ||
      !view || view.sessionId !== reply.sessionId) return null;
  return {
    status: 'committed', type: 'wolf-commander-target-reroll', sessionId: reply.sessionId,
    requestId: reply.requestId, turn: reply.turn as number, revision: reply.revision as number,
    currentStep: 'targeting', rerolledIndexes: indexes, view,
  };
}

export interface WolfConsoleVisitReply {
  readonly status: 'observing';
  readonly type: 'wolf-console-visit';
  readonly sessionId: string;
  readonly visitId: string;
  readonly cycle: number;
  readonly actorUid: string;
  readonly coverRoleId: string;
  readonly targetShipId: string;
  readonly startedAt: string;
  readonly eligibleAt: string;
  readonly expiresAt: string;
}

export interface WolfConsoleSabotageReply {
  readonly status: 'committed';
  readonly type: 'wolf-console-sabotage';
  readonly sessionId: string;
  readonly requestId: string;
  readonly visitId: string;
  readonly cycle: number;
  readonly revision: number;
  readonly actorUid: string;
  readonly coverRoleId: string;
  readonly targetShipId: string;
  readonly targetSystemId: string;
  readonly targetSystemName: string;
  readonly mode: 'random' | 'chosen';
  readonly suspicion: number;
  readonly auditId: string;
}

/** Start the server-owned physical observation window for console sabotage. */
export async function startWolfConsoleVisit(
  targetUid: string,
  targetShipId: string,
): Promise<WolfConsoleVisitReply> {
  const store = useSessionStore.getState();
  if (!store.session || !store.gmInstance || store.session.phase !== 'active') {
    throw new Error('An active GM session is required before observing a console visit.');
  }
  requireFreshSessionAuthority('Reconnect before observing a console visit.');
  await ensureSignedIn();
  const payload = {
    sessionId: store.session.id,
    instanceId: store.gmInstance.id,
    requestId: commandId(),
    expectedCycle: store.session.currentTurn,
    targetUid,
    targetShipId,
  };
  const call = httpsCallable<typeof payload, WolfConsoleVisitReply>(functions(), 'startWolfConsoleVisit');
  return (await call(payload)).data;
}

/** Resolve the observed visit; target damage and suspicion remain server-owned. */
export async function resolveWolfConsoleSabotage(
  visitId: string,
  mode: 'random' | 'chosen',
  chosenSystemId?: string,
): Promise<WolfConsoleSabotageReply> {
  const store = useSessionStore.getState();
  if (!store.session || !store.gmInstance || store.session.phase !== 'active') {
    throw new Error('An active GM session is required before resolving console sabotage.');
  }
  requireFreshSessionAuthority('Reconnect before resolving console sabotage.');
  await ensureSignedIn();
  const payload = {
    sessionId: store.session.id,
    instanceId: store.gmInstance.id,
    requestId: commandId(),
    visitId,
    expectedCycle: store.session.currentTurn,
    mode,
    ...(mode === 'chosen' && chosenSystemId ? { chosenSystemId } : {}),
  };
  const call = httpsCallable<typeof payload, WolfConsoleSabotageReply>(
    functions(), 'resolveWolfConsoleSabotage',
  );
  return (await call(payload)).data;
}

/** Acknowledge one exact private alert and confirm its printed clue was handled. */
export async function acknowledgeWolfHackingAlert(
  alert: Pick<PendingWolfHackingAlert, 'sessionId' | 'alertId' | 'revision'>,
): Promise<AcknowledgeWolfHackingAlertResult> {
  const initial = useSessionStore.getState();
  if (!initial.session || !initial.me || initial.me.role !== 'gm' || !initial.gmInstance ||
      initial.session.id !== alert.sessionId || initial.gmInstance.sessionId !== alert.sessionId ||
      initial.gmInstance.uid !== initial.me.uid) {
    throw new Error('The current facilitator session is required to acknowledge this alert.');
  }
  requireFreshSessionAuthority('Reconnect before acknowledging a hacking alert.');
  const sessionId = initial.session.id;
  const instanceId = initial.gmInstance.id;
  const uid = initial.me.uid;
  const checkpoint = sessionAuthorityCheckpoint(sessionId, uid);
  await ensureSignedIn();
  const authorityIsCurrent = () => {
    const current = useSessionStore.getState();
    return current.session?.id === sessionId && current.me?.role === 'gm' &&
      current.me.uid === uid && current.gmInstance?.id === instanceId &&
      current.gmInstance.uid === uid && current.gmInstance.sessionId === sessionId &&
      authorityCheckpointIsCurrent(checkpoint);
  };
  if (!authorityIsCurrent()) {
    throw new Error('The facilitator authority changed before the alert could be acknowledged.');
  }
  const payload = {
    sessionId,
    instanceId,
    requestId: commandId(),
    alertId: alert.alertId,
    expectedRevision: alert.revision,
  };
  const call = httpsCallable<typeof payload, AcknowledgeWolfHackingAlertResult>(
    functions(), 'acknowledgeWolfHackingAlert',
  );
  const result = (await call(payload)).data;
  if (!authorityIsCurrent()) {
    throw new Error('The facilitator authority changed before the acknowledgement was confirmed.');
  }
  if (result.status !== 'acknowledged' || result.type !== 'wolf-hacking-alert-acknowledgement' ||
      result.sessionId !== sessionId || result.requestId !== payload.requestId ||
      result.alertId !== alert.alertId || typeof result.noticeId !== 'string' ||
      !Number.isSafeInteger(result.noticeSequence) || result.noticeSequence < 1 ||
      result.noticeSequence > 10_000 ||
      result.noticeId !== `notice-${String(result.noticeSequence).padStart(12, '0')}` ||
      result.revision !== 2) {
    throw new Error('The facilitator acknowledgement response was malformed.');
  }
  return result;
}

/** Mark the approximate first Wolf-attack window from an active GM console. */
export async function setWolfAttackWindow(
  status: WolfAttackWindowStatus,
  expectedRevision: number,
): Promise<WolfAttackWindow> {
  const store = useSessionStore.getState();
  if (!store.session || !store.gmInstance) {
    throw new Error('Claim GM before marking the Wolf-attack timing window.');
  }
  requireFreshSessionAuthority('Reconnect before marking the Wolf-attack timing window.');
  const sessionId = store.session.id;
  const checkpoint = sessionAuthorityCheckpoint(sessionId, sessionAuthorityUid(store));
  await ensureSignedIn();
  const payload = {
    sessionId,
    instanceId: store.gmInstance.id,
    requestId: commandId(),
    expectedRevision,
    status,
  };
  const call = httpsCallable<typeof payload, unknown>(functions(), 'setWolfAttackWindow');
  try {
    const reply = wolfAttackWindowReply((await call(payload)).data);
    if (!reply) throw new Error('The server returned an invalid Wolf-attack timing marker.');
    // The private projection listener remains the source of truth for the GM
    // panel. The callable reply is safe to render immediately after commit.
    if (!authorityCheckpointIsCurrent(checkpoint)) return reply;
    return reply;
  } catch (cause) {
    useSessionStore.getState().setCommunicationError(interception(cause));
    throw cause;
  }
}

/** Save a server-validated, facilitator-only Wolf preparation draft. */
export async function stageWolfAttackPreparation(
  preparation: Omit<WolfAttackPreparation, 'revision'>,
  expectedRevision: number,
): Promise<WolfAttackPreparation> {
  const store = useSessionStore.getState();
  if (!store.session || !store.gmInstance) {
    throw new Error('Claim GM before staging a private Wolf attack preparation.');
  }
  requireFreshSessionAuthority('Reconnect before staging a private Wolf attack preparation.');
  const sessionId = store.session.id;
  const checkpoint = sessionAuthorityCheckpoint(sessionId, sessionAuthorityUid(store));
  await ensureSignedIn();
  const payload = {
    sessionId,
    instanceId: store.gmInstance.id,
    requestId: commandId(),
    expectedRevision,
    turn: preparation.turn,
    shipIds: [...preparation.shipIds],
    targetMode: preparation.targetMode,
    targetAssignments: preparation.targetAssignments.map(({ cardIndex, targetShipId }) => ({
      cardIndex,
      targetShipId,
    })),
    modifiers: [...preparation.modifiers],
    notes: preparation.notes,
  };
  const call = httpsCallable<typeof payload, unknown>(functions(), 'stageWolfAttackPreparation');
  try {
    const reply = wolfAttackPreparationReply((await call(payload)).data);
    if (!reply) throw new Error('The server returned an invalid Wolf-attack preparation.');
    if (!authorityCheckpointIsCurrent(checkpoint)) return reply;
    return reply;
  } catch (cause) {
    useSessionStore.getState().setCommunicationError(interception(cause));
    throw cause;
  }
}

/** Commit the GM's atomic Wolf declaration after the private draft is saved. */
export async function declareWolfAttack(expectedRevision: number): Promise<WolfAttackDeclarationResult> {
  const store = useSessionStore.getState();
  if (!store.session || !store.gmInstance) {
    throw new Error('Claim GM before declaring the Wolf attack.');
  }
  requireFreshSessionAuthority('Reconnect before declaring the Wolf attack.');
  const sessionId = store.session.id;
  const checkpoint = sessionAuthorityCheckpoint(sessionId, sessionAuthorityUid(store));
  await ensureSignedIn();
  const payload = {
    sessionId,
    instanceId: store.gmInstance.id,
    requestId: commandId(),
    expectedRevision,
  };
  const call = httpsCallable<typeof payload, unknown>(functions(), 'declareWolfAttack');
  try {
    const reply = wolfAttackDeclarationReply((await call(payload)).data);
    if (!reply) throw new Error('The server returned an invalid Wolf-attack declaration.');
    if (!authorityCheckpointIsCurrent(checkpoint)) return reply;
    return reply;
  } catch (cause) {
    useSessionStore.getState().setCommunicationError(interception(cause));
    throw cause;
  }
}

/** Advance the live GM attack state from targeting into its printed Long Range step. */
export async function advanceWolfAttackToLongRange(
  expectedTurn: number,
  expectedRevision: number,
): Promise<WolfAttackStageAdvanceResult> {
  const store = useSessionStore.getState();
  if (!store.session || !store.gmInstance) {
    throw new Error('Claim GM before advancing the Wolf attack.');
  }
  requireFreshSessionAuthority('Reconnect before advancing the Wolf attack.');
  const sessionId = store.session.id;
  const checkpoint = sessionAuthorityCheckpoint(sessionId, sessionAuthorityUid(store));
  await ensureSignedIn();
  const payload = {
    sessionId,
    instanceId: store.gmInstance.id,
    requestId: commandId(),
    expectedTurn,
    expectedRevision,
  };
  const call = httpsCallable<typeof payload, unknown>(functions(), 'advanceWolfAttackToLongRange');
  try {
    const reply = wolfAttackStageAdvanceReply((await call(payload)).data);
    if (!reply || reply.sessionId !== sessionId || reply.requestId !== payload.requestId ||
        reply.turn !== expectedTurn || reply.revision !== expectedRevision + 1) {
      throw new Error('The server returned an invalid Wolf attack stage receipt.');
    }
    if (!authorityCheckpointIsCurrent(checkpoint)) return reply;
    return reply;
  } catch (cause) {
    useSessionStore.getState().setCommunicationError(interception(cause));
    throw cause;
  }
}

/** Read the active Dione Engineer's server-filtered Maliades launch state. */
export async function getDioneMaliadesLaunch(): Promise<DioneMaliadesLaunchView> {
  const store = useSessionStore.getState();
  if (!store.session || !store.me || store.me.activeConsoleRoleId !== 'dione-engineer') {
    throw new Error('Only the active Dione Engineer may read Maliades launch authority.');
  }
  requireFreshSessionAuthority('Reconnect before reading Maliades launch authority.');
  const sessionId = store.session.id;
  const checkpoint = sessionAuthorityCheckpoint(sessionId, sessionAuthorityUid(store));
  await ensureSignedIn();
  const call = httpsCallable<{ sessionId: string }, unknown>(functions(), 'getDioneMaliadesLaunch');
  try {
    const reply = dioneMaliadesLaunchViewReply((await call({ sessionId })).data);
    if (!reply) throw new Error('The server returned an invalid Maliades launch view.');
    if (!authorityCheckpointIsCurrent(checkpoint)) return reply;
    return reply;
  } catch (cause) {
    useSessionStore.getState().setCommunicationError(interception(cause));
    throw cause;
  }
}

/** Commit one Maliades launch against the exact Wolf-attack revision shown to the Engineer. */
export async function launchDioneMaliades(
  expectedTurn: number,
  expectedRevision: number,
): Promise<DioneMaliadesLaunchResult> {
  const store = useSessionStore.getState();
  if (!store.session || !store.me || store.me.activeConsoleRoleId !== 'dione-engineer') {
    throw new Error('Only the active Dione Engineer may launch Maliades.');
  }
  requireFreshSessionAuthority('Reconnect before launching Maliades.');
  const sessionId = store.session.id;
  const checkpoint = sessionAuthorityCheckpoint(sessionId, sessionAuthorityUid(store));
  await ensureSignedIn();
  const payload = { sessionId, requestId: commandId(), expectedTurn, expectedRevision };
  const call = httpsCallable<typeof payload, unknown>(functions(), 'launchDioneMaliades');
  try {
    const reply = dioneMaliadesLaunchResultReply((await call(payload)).data);
    if (!reply) throw new Error('The server returned an invalid Maliades launch result.');
    if (!authorityCheckpointIsCurrent(checkpoint)) return reply;
    return reply;
  } catch (cause) {
    useSessionStore.getState().setCommunicationError(interception(cause));
    throw cause;
  }
}

/** Read the server-filtered targeting projection for the active Wolf Commander. */
export async function getWolfCommanderTargeting(): Promise<WolfCommanderTargetingReadResult> {
  const store = useSessionStore.getState();
  if (!store.session || !store.me || store.me.replacementRoleId !== 'wolf-commander') {
    throw new Error('Only the active Wolf Commander may read targeting dice.');
  }
  requireFreshSessionAuthority('Reconnect before reading Wolf targeting dice.');
  const sessionId = store.session.id;
  const checkpoint = sessionAuthorityCheckpoint(sessionId, sessionAuthorityUid(store));
  await ensureSignedIn();
  const payload = { sessionId };
  const call = httpsCallable<typeof payload, unknown>(functions(), 'getWolfCommanderTargeting');
  try {
    const reply = wolfCommanderTargetingReadReply((await call(payload)).data);
    if (!reply) throw new Error('The server returned an invalid Wolf Commander targeting view.');
    if (reply.sessionId !== sessionId) {
      throw new Error('The server returned a Wolf Commander targeting view for another session.');
    }
    if (!wolfCommanderAuthorityCheckpointIsCurrent(sessionId, checkpoint)) {
      throw new Error('The Wolf Commander session or authority changed before this response arrived.');
    }
    return reply;
  } catch (cause) {
    useSessionStore.getState().setCommunicationError(interception(cause));
    throw cause;
  }
}

/** Apply one bounded selection of Commander rerolls with a revision CAS. */
export async function applyWolfCommanderTargetRerolls(
  expectedTurn: number,
  expectedRevision: number,
  rosterIndexes: readonly number[],
): Promise<WolfCommanderTargetRerollResult> {
  const store = useSessionStore.getState();
  if (!store.session || !store.me || store.me.replacementRoleId !== 'wolf-commander') {
    throw new Error('Only the active Wolf Commander may reroll targeting dice.');
  }
  requireFreshSessionAuthority('Reconnect before rerolling Wolf targeting dice.');
  const sessionId = store.session.id;
  const checkpoint = sessionAuthorityCheckpoint(sessionId, sessionAuthorityUid(store));
  await ensureSignedIn();
  const payload = {
    sessionId,
    requestId: commandId(),
    expectedTurn,
    expectedRevision,
    rosterIndexes: [...rosterIndexes],
  };
  const call = httpsCallable<typeof payload, unknown>(functions(), 'applyWolfCommanderTargetRerolls');
  try {
    const reply = wolfCommanderTargetRerollReply((await call(payload)).data);
    if (!reply) throw new Error('The server returned an invalid Wolf Commander reroll receipt.');
    if (reply.sessionId !== sessionId) {
      throw new Error('The server returned a Wolf Commander reroll receipt for another session.');
    }
    if (!wolfCommanderAuthorityCheckpointIsCurrent(sessionId, checkpoint)) {
      throw new Error('The Wolf Commander session or authority changed before this response arrived.');
    }
    return reply;
  } catch (cause) {
    useSessionStore.getState().setCommunicationError(interception(cause));
    throw cause;
  }
}

/** Close the Commander window, including when no targeting dice were rerolled. */
export async function finishWolfCommanderTargetingRerolls(
  expectedTurn: number,
  expectedRevision: number,
): Promise<WolfCommanderTargetingFinishResult> {
  const store = useSessionStore.getState();
  if (!store.session || !store.me || store.me.replacementRoleId !== 'wolf-commander') {
    throw new Error('Only the active Wolf Commander may finish targeting rerolls.');
  }
  requireFreshSessionAuthority('Reconnect before finishing Wolf targeting rerolls.');
  const sessionId = store.session.id;
  const checkpoint = sessionAuthorityCheckpoint(sessionId, sessionAuthorityUid(store));
  await ensureSignedIn();
  const payload = { sessionId, requestId: commandId(), expectedTurn, expectedRevision };
  const call = httpsCallable<typeof payload, unknown>(functions(), 'finishWolfCommanderTargetingRerolls');
  try {
    const reply = wolfCommanderTargetingFinishReply((await call(payload)).data);
    if (!reply || reply.sessionId !== sessionId) {
      throw new Error('The server returned an invalid Wolf Commander finish receipt.');
    }
    if (!wolfCommanderAuthorityCheckpointIsCurrent(sessionId, checkpoint)) {
      throw new Error('The Wolf Commander session or authority changed before this response arrived.');
    }
    return reply;
  } catch (cause) {
    useSessionStore.getState().setCommunicationError(interception(cause));
    throw cause;
  }
}

/** Read only the target identities required by the active AEGIS Executive Officer. */
export async function getAegisCommandAndControl(): Promise<AegisCommandAndControlView> {
  const store = useSessionStore.getState();
  if (!store.session || !store.me || store.me.role !== 'player' ||
      store.me.activeConsoleRoleId !== 'executive-officer') {
    throw new Error('Only the active AEGIS Executive Officer may read Command and Control.');
  }
  requireFreshSessionAuthority('Reconnect before reading AEGIS Command and Control.');
  const sessionId = store.session.id;
  const checkpoint = sessionAuthorityCheckpoint(sessionId, sessionAuthorityUid(store));
  await ensureSignedIn();
  const payload = { sessionId };
  const call = httpsCallable<typeof payload, unknown>(functions(), 'getAegisCommandAndControl');
  try {
    const reply = aegisCommandAndControlViewReply((await call(payload)).data);
    if (!reply || reply.sessionId !== sessionId) {
      throw new Error('The server returned an invalid AEGIS Command and Control view.');
    }
    if (!aegisExecutiveOfficerAuthorityCheckpointIsCurrent(sessionId, checkpoint)) {
      throw new Error('The AEGIS Executive Officer session or authority changed before this response arrived.');
    }
    return reply;
  } catch (cause) {
    useSessionStore.getState().setCommunicationError(interception(cause));
    throw cause;
  }
}

/** Redirect exactly one ship with the live private targeting revision. */
export async function applyAegisCommandAndControl(
  expectedTurn: number,
  expectedRevision: number,
  rosterIndex: number,
): Promise<AegisCommandAndControlResult> {
  const store = useSessionStore.getState();
  if (!store.session || !store.me || store.me.role !== 'player' ||
      store.me.activeConsoleRoleId !== 'executive-officer') {
    throw new Error('Only the active AEGIS Executive Officer may use Command and Control.');
  }
  requireFreshSessionAuthority('Reconnect before redirecting a Wolf ship.');
  const sessionId = store.session.id;
  const checkpoint = sessionAuthorityCheckpoint(sessionId, sessionAuthorityUid(store));
  await ensureSignedIn();
  const payload = {
    sessionId, requestId: commandId(), expectedTurn, expectedRevision, rosterIndex,
  };
  const call = httpsCallable<typeof payload, unknown>(functions(), 'applyAegisCommandAndControl');
  try {
    const reply = aegisCommandAndControlResultReply((await call(payload)).data);
    if (!reply || reply.sessionId !== sessionId) {
      throw new Error('The server returned an invalid AEGIS Command and Control receipt.');
    }
    if (!aegisExecutiveOfficerAuthorityCheckpointIsCurrent(sessionId, checkpoint)) {
      throw new Error('The AEGIS Executive Officer session or authority changed before this response arrived.');
    }
    return reply;
  } catch (cause) {
    useSessionStore.getState().setCommunicationError(interception(cause));
    throw cause;
  }
}

export async function triggerDradisContact(): Promise<void> {
  const store = useSessionStore.getState();
  if (!store.session || !store.gmInstance) {
    throw new Error('Claim GM before triggering a DRADIS contact.');
  }
  requireFreshSessionAuthority();
  const checkpoint = sessionAuthorityCheckpoint(store.session.id, sessionAuthorityUid(store));
  await ensureSignedIn();
  const call = httpsCallable<
    { sessionId: string; instanceId: string },
    { triggeredAt: string }
  >(functions(), 'triggerDradisContact');
  try {
    const reply = await call({
      sessionId: store.session.id,
      instanceId: store.gmInstance.id,
    });
    if (authorityCheckpointIsCurrent(checkpoint)) {
      useSessionStore.getState().setSession({
        ...useSessionStore.getState().session!,
        dradisContactTriggeredAt: reply.data.triggeredAt,
      });
    }
  } catch (cause) {
    store.setCommunicationError(interception(cause));
    throw cause;
  }
}

export async function setActiveRoleEnabled(
  roleId: string,
  enabled: boolean,
): Promise<CommandDisposition> {
  const store = useSessionStore.getState();
  if (!store.session || !store.gmInstance) {
    throw new Error('Claim GM before changing role availability.');
  }
  return sendOrQueue({
    id: commandId(),
    kind: 'setActiveRoleEnabled',
    payload: {
      sessionId: store.session.id,
      instanceId: store.gmInstance.id,
      roleId,
      enabled,
    },
    createdAt: new Date().toISOString(),
  });
}

export async function applyRolePreset(playerCount: number): Promise<CommandDisposition> {
  const store = useSessionStore.getState();
  if (!store.session || !store.gmInstance) {
    throw new Error('Claim GM before applying a role preset.');
  }
  return sendOrQueue({
    id: commandId(),
    kind: 'applyRolePreset',
    payload: {
      sessionId: store.session.id,
      instanceId: store.gmInstance.id,
      playerCount,
    },
    createdAt: new Date().toISOString(),
  });
}

/** Send the GM-reviewed roster as one atomic server command. */
export async function setActiveRoleConfiguration(
  activeRoleIds: readonly string[],
): Promise<CommandDisposition> {
  const store = useSessionStore.getState();
  if (!store.session || !store.gmInstance) {
    throw new Error('Claim GM before confirming a role configuration.');
  }
  return sendOrQueue({
    id: commandId(),
    kind: 'setActiveRoleConfiguration',
    payload: {
      sessionId: store.session.id,
      instanceId: store.gmInstance.id,
      activeRoleIds,
    },
    createdAt: new Date().toISOString(),
  });
}

export async function popShipConfetti(shipId: string, roleId: string): Promise<CommandDisposition> {
  const store = useSessionStore.getState();
  if (!store.session) throw new Error('Join a session before using the dispenser.');
  return sendOrQueue({
    id: commandId(),
    kind: 'popShipConfetti',
    payload: {
      sessionId: store.session.id, shipId, roleId,
      ...(store.gmInstance ? { instanceId: store.gmInstance.id } : {}),
    },
    createdAt: new Date().toISOString(),
  });
}

export async function disconnectFromSession(): Promise<CommandDisposition> {
  const store = useSessionStore.getState();
  store.setCommunicationError(null);
  if (!store.session) {
    store.disconnect();
    return 'applied';
  }
  const command: PendingCommand = {
    id: commandId(),
    kind: 'disconnectFromSession',
    payload: {
      sessionId: store.session.id,
      ...(store.gmInstance?.sessionId === store.session.id
        ? { instanceId: store.gmInstance.id }
        : {}),
      ...(Number.isSafeInteger(store.me?.connectionGeneration) &&
        (store.me?.connectionGeneration as number) >= 1
        ? { connectionGeneration: store.me?.connectionGeneration as number }
        : {}),
    },
    createdAt: new Date().toISOString(),
  };

  // Leaving is immediate from this browser's perspective. The captured
  // command can still reach the server, or be queued if the network is down.
  store.disconnect();
  return sendOrQueue(command);
}

/** Publish one private, facilitator-authored Universal Arbour call. */
export async function authorUniversalArbourVision(
  targetUid: string,
  kind: ArbourVision['kind'],
  text: string,
): Promise<CommandDisposition> {
  const store = useSessionStore.getState();
  if (!store.session || !store.gmInstance || !store.gmLoyaltyCensus) {
    throw new Error('An active GM census is required before authoring a call.');
  }
  return sendOrQueue({
    id: commandId(),
    kind: 'authorArbourVision',
    payload: {
      sessionId: store.session.id,
      instanceId: store.gmInstance.id,
      requestId: commandId(),
      expectedRevision: store.gmArbourVision?.revision ?? 0,
      targetUid,
      kind,
      text: text.trim().slice(0, 240),
    },
    createdAt: new Date().toISOString(),
  });
}
