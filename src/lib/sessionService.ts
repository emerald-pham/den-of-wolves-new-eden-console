import { commissarPurgeAuthorityIsCurrent } from './commissarPurgeAuthority';
import { signInAnonymously } from 'firebase/auth';
import { httpsCallable } from 'firebase/functions';
import { auth, functions } from './firebase';
import { useSessionStore } from '@/store/useSessionStore';
import type { PendingCommand } from '@/store/useSessionStore';
import type {
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
  WolfCommanderTargetingView,
  WolfAttackTargetMode,
  WolfAttackWindow,
  WolfAttackWindowStatus,
  WolfCultIntelligence,
  ArbourVision,
  SessionPhase,
  CommissarPurgeAuthority,
} from '@/types/game';
import { parseEntityId } from '@/types/identifiers';
import type { VesselActionEnvelope } from '@/types/vesselAction';
import type { ResourceId } from '@/data/resources';
import type { CounterStep } from './counterPreview';
import { normalizeShuttleManifest } from '@/data/shuttles';
import { normalizePressDispatch } from './pressDispatchState';
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
export const COMMAND_RECONNECT_WINDOW_MS = 15_000;
export type CommandDisposition = 'applied' | 'queued' | 'stale' | 'awaiting-officer';
export type TurnStartReplayAudience = 'gm' | 'everyone';

const SAFE_STALE_COMMAND_MESSAGE =
  'The live session changed before this command committed. Refresh the live state and retry.';

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

function deviceLabel(): string {
  const platform = window.navigator.platform || 'Unknown device';
  const agent = window.navigator.userAgent || 'Unknown browser';
  return `${platform} / ${agent}`.slice(0, 160);
}

function commandId(): string {
  return window.crypto.randomUUID();
}

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

function isCleanupCommand(command: PendingCommand): boolean {
  return command.kind === 'disconnectFromSession' || command.kind === 'logoutGmAccess';
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

async function executeCommand(command: PendingCommand): Promise<unknown> {
  const call = httpsCallable<typeof command.payload, unknown>(functions(), command.kind);
  const reply = await call(command.payload);
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
}

async function sendOrQueue(command: PendingCommand): Promise<CommandDisposition> {
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
    if (TRANSIENT_COMMAND_ERRORS.has(errorCode(cause) ?? '')) {
      if (cleanupCommand) queue(command);
      else queueFromServerAuthority(command);
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
    if (
      command.kind !== 'logoutGmAccess' &&
      Date.now() - Date.parse(command.createdAt) > COMMAND_RECONNECT_WINDOW_MS
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
    try {
      const checkpoint = isCleanupCommand(command)
        ? undefined
        : commandAuthorityCheckpoint(command, store);
      const result = await executeCommand(command);
      if (isStaleAuthorityReply(command, result)) recordStaleAuthorityReply();
      else applyCommandResult(command, result, checkpoint, true);
      store.removeCommand(command.id);
    } catch (cause) {
      if (TRANSIENT_COMMAND_ERRORS.has(errorCode(cause) ?? '')) return false;
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
  );
  const acceptedSession: GameSession = {
    ...reply.session,
    shuttleDockings: shuttleManifest.dockings,
    shuttleVisitLog: shuttleManifest.visits,
    pressEnabled: reply.session.pressEnabled !== false,
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
  const store = useSessionStore.getState();
  store.setConnection('connecting');
  try {
    if (!window.navigator.onLine) {
      throw new Error('Browser is offline.');
    }
    await ensureSignedIn();
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
      } catch (cause) {
        if (!TERMINAL_RESUME_ERRORS.has(errorCode(cause) ?? '')) throw cause;
        store.disconnect();
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
        if (!TRANSIENT_COMMAND_ERRORS.has(errorCode(cause) ?? '')) throw cause;
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
  } catch {
    store.setConnection('offline');
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
  readonly status?: 'stale';
  readonly currentRevision?: number;
}

function counterBatchReply(value: unknown): ShipCounterBatchResult | null {
  if (typeof value !== 'object' || value === null || !('amount' in value)) return null;
  const raw = value as Record<string, unknown>;
  const phase = sessionPhase(raw.phase);
  return typeof raw.amount === 'number' && Number.isFinite(raw.amount) &&
    'alertRaised' in raw && typeof raw.alertRaised === 'boolean'
    ? {
      amount: raw.amount, alertRaised: raw.alertRaised,
      ...(raw.status === 'stale' ? { status: 'stale' as const } : {}),
      ...(typeof raw.currentRevision === 'number' ? { currentRevision: raw.currentRevision } : {}),
      ...(typeof raw.revision === 'number' ? { revision: raw.revision } : {}),
      ...(typeof raw.idempotencyKey === 'string' ? { idempotencyKey: raw.idempotencyKey } : {}),
      ...(typeof raw.auditId === 'string' ? { auditId: raw.auditId } : {}),
      ...(typeof raw.actorUid === 'string' ? { actorUid: raw.actorUid } : {}),
      ...(typeof raw.actorRoleId === 'string' || raw.actorRoleId === null
        ? { actorRoleId: raw.actorRoleId } : {}),
      ...(typeof raw.vesselId === 'string' ? { vesselId: raw.vesselId } : {}),
      ...(typeof raw.turn === 'number' ? { turn: raw.turn } : {}),
      ...(phase === undefined ? {} : { phase }),
    }
    : null;
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
  if (!store.session || !store.gmInstance) {
    throw new Error('An active GM instance is required.');
  }
  requireFreshSessionAuthority();
  const sessionId = store.session.id;
  const checkpoint = sessionAuthorityCheckpoint(
    sessionId,
    sessionAuthorityUid(store),
  );
  const payload = {
    sessionId,
    instanceId: store.gmInstance.id,
    shipId,
    counter: target.counter,
    steps: [...steps],
    requestId: commandId(),
    expectedRevision: store.session.vesselActionRevisions?.[shipId] ?? 0,
    ...(target.counter === 'resource' ? { resourceId: target.resourceId } : {}),
  };
  try {
    await ensureSignedIn();
    const call = httpsCallable<typeof payload, unknown>(functions(), 'applyShipCounterSteps');
    const reply = counterBatchReply((await call(payload)).data);
    if (!reply) throw new Error('The server returned an invalid counter amount.');

    const current = useSessionStore.getState().session;
    if (!current || current.id !== sessionId || !authorityCheckpointIsCurrent(checkpoint)) return reply;
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

function fighterWingCountReply(value: unknown): FighterWingCountResult | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  if ((raw.status !== 'committed' && raw.status !== 'replayed' && raw.status !== 'stale') ||
    typeof raw.wingId !== 'string' || typeof raw.capacity !== 'number' ||
    !Number.isSafeInteger(raw.capacity) || raw.capacity < 0) return null;
  const phase = sessionPhase(raw.phase);
  const result: FighterWingCountResult = {
    status: raw.status,
    wingId: raw.wingId,
    capacity: raw.capacity,
    ...(typeof raw.count === 'number' && Number.isSafeInteger(raw.count) ? { count: raw.count } : {}),
    ...(typeof raw.revision === 'number' && Number.isSafeInteger(raw.revision) ? { revision: raw.revision } : {}),
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
  const checkpoint = sessionAuthorityCheckpoint(sessionId, sessionAuthorityUid(store));
  const expectedRevision = store.session.fighterWingCounts?.[wingId]?.revision ?? 0;
  const payload = {
    sessionId,
    instanceId: store.gmInstance.id,
    requestId: commandId(),
    wingId,
    count,
    expectedRevision,
  };
  try {
    await ensureSignedIn();
    const call = httpsCallable<typeof payload, unknown>(functions(), 'setFighterWingCount');
    const reply = fighterWingCountReply((await call(payload)).data);
    if (!reply) throw new Error('The server returned an invalid fighter-wing count.');
    const current = useSessionStore.getState().session;
    if (!current || current.id !== sessionId || !authorityCheckpointIsCurrent(checkpoint) ||
      reply.status === 'stale' || reply.count === undefined || reply.revision === undefined) return reply;
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

export interface ReplacementMutationResult {
  readonly status: 'committed' | 'stale';
  readonly sessionId: string;
  readonly targetUid: string;
  readonly revision: number;
  readonly setupRevision: number;
  readonly replacementRoleId?: string;
}

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
  if (!instances.some((instance) => instance.id === remembered.id)) {
    useSessionStore.getState().setGmInstance(null);
    useSessionStore.getState().setMode(null);
    useSessionStore.getState().setLastRoute('/roles');
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
        pursuitGroups: { ...current.pursuitGroups, fleet: 2 },
      });
    }
    useSessionStore.getState().setGmSetupReceipt(reply.setupReceipt);
    return reply;
  } catch (cause) {
    if (!TRANSIENT_COMMAND_ERRORS.has(errorCode(cause) ?? '')) {
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
  if (reply.phase === 'debrief') {
    const terminalSession = {
      ...activeSession,
      currentTurn: reply.currentTurn,
      phase: 'debrief' as const,
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
  if (!store.session || !store.gmInstance) throw new Error('Claim GM before advancing the turn.');
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

/** Start the Turn 1 demo when this browser is the session's only connected player. */
export async function startSinglePlayerDemo(): Promise<void> {
  const store = useSessionStore.getState();
  if (!store.session) throw new Error('Join a session before starting the demo.');
  requireFreshSessionAuthority('Reconnect before starting the demo.');
  if (store.session.currentTurn !== 0) {
    throw new Error('The single-player demo is only available from Turn 0.');
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

/** Replay the latest turn transmission locally or across the connected fleet. */
export async function replayTurnStartAnnouncement(audience: TurnStartReplayAudience): Promise<void> {
  const store = useSessionStore.getState();
  if (!store.session || !store.gmInstance) throw new Error('Claim GM before replaying a turn transmission.');
  const currentTurn = store.session.currentTurn ?? 1;
  const current = store.session.turnStartAnnouncement;
  if (!current || current.turn !== currentTurn || currentTurn < 1) {
    throw new Error('No current turn transmission is available to replay.');
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
      !Array.isArray(raw.rolls) || rolls.length !== raw.rolls.length ||
      !Array.isArray(raw.eligibleRerollIndexes) || eligibleRerollIndexes.length !== raw.eligibleRerollIndexes.length ||
      !Array.isArray(raw.rerolledIndexes) || rerolledIndexes.length !== raw.rerolledIndexes.length) return null;
  return {
    type: 'wolf-commander-targeting-view',
    sessionId: raw.sessionId,
    turn: raw.turn as number,
    revision: raw.revision as number,
    currentStep: 'targeting',
    rolls,
    eligibleRerollIndexes,
    rerolledIndexes,
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
    payload: { sessionId: store.session.id, shipId, roleId },
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
