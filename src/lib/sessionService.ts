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
  WolfAttackWindow,
  WolfAttackWindowStatus,
} from '@/types/game';
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

export interface SetupConfirmationInput {
  readonly playerCount: number;
  readonly chartId: 'A' | 'B' | 'C';
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
    await ensureSignedIn();
    const call = httpsCallable<typeof payload, unknown>(functions(), name);
    await call(payload);
  } catch (cause) {
    useSessionStore.getState().setCommunicationError(interception(cause));
  }
}

export type ShipCounterBatchTarget =
  | { readonly counter: 'resource'; readonly resourceId: ResourceId }
  | { readonly counter: 'unrest' | 'population' };

export interface ShipCounterBatchResult {
  readonly amount: number;
  readonly alertRaised: boolean;
}

function counterBatchReply(value: unknown): ShipCounterBatchResult | null {
  if (typeof value !== 'object' || value === null || !('amount' in value)) return null;
  return typeof value.amount === 'number' && Number.isFinite(value.amount) &&
    'alertRaised' in value && typeof value.alertRaised === 'boolean'
    ? { amount: value.amount, alertRaised: value.alertRaised }
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
      });
      return reply;
    }
    if (target.counter === 'unrest') {
      useSessionStore.getState().setSession({
        ...current,
        shipUnrest: { ...current.shipUnrest, [shipId]: reply.amount },
      });
      return reply;
    }
    useSessionStore.getState().setSession({
      ...current,
      shipSurvivors: { ...current.shipSurvivors, [shipId]: reply.amount },
    });
    return reply;
  } catch (cause) {
    useSessionStore.getState().setCommunicationError(interception(cause));
    return null;
  }
}

export interface FighterWingCountResult {
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
  const result: FighterWingCountResult = {
    status: raw.status,
    wingId: raw.wingId,
    capacity: raw.capacity,
    ...(typeof raw.count === 'number' && Number.isSafeInteger(raw.count) ? { count: raw.count } : {}),
    ...(typeof raw.revision === 'number' && Number.isSafeInteger(raw.revision) ? { revision: raw.revision } : {}),
    ...(typeof raw.currentRevision === 'number' && Number.isSafeInteger(raw.currentRevision)
      ? { currentRevision: raw.currentRevision } : {}),
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
    sessionId: string; activeConsoleRoleId?: string | null;
  }, { sessionId: string }>(
    functions(),
    'refreshPresence',
  );
  await call(activeConsoleRoleId === undefined
    ? { sessionId: session.id }
    : { sessionId: session.id, activeConsoleRoleId });
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

export interface ShipNavigationMoveReply {
  readonly shipId: string;
  readonly origin: string;
  readonly destination: string;
  readonly stardate: string;
}

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
    const current = useSessionStore.getState().session;
    if (current?.id === payload.sessionId && authorityCheckpointIsCurrent(checkpoint)) {
      useSessionStore.getState().setSession({
        ...current,
        shipGalacticCoordinates: {
          ...current.shipGalacticCoordinates,
          [shipId]: reply.destination,
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
    ...(store.gmInstance ? { instanceId: store.gmInstance.id } : {}),
  };
  const checkpoint = sessionAuthorityCheckpoint(payload.sessionId, sessionAuthorityUid(store));
  try {
    await ensureSignedIn();
    const call = httpsCallable<typeof payload, { shipId: string; locked: boolean }>(
      functions(),
      'setShipConsoleLock',
    );
    const reply = (await call(payload)).data;
    const current = useSessionStore.getState().session;
    if (current?.id === payload.sessionId && authorityCheckpointIsCurrent(checkpoint)) {
      useSessionStore.getState().setSession({
        ...current,
        shipConsoleLocks: {
          ...current.shipConsoleLocks,
          [reply.shipId]: reply.locked,
        },
      });
    }
    return 'applied';
  } catch (cause) {
    useSessionStore.getState().setCommunicationError(interception(cause));
    throw cause;
  }
}

export interface JumpShipReply {
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
    payload: { sessionId: store.session.id },
    createdAt: new Date().toISOString(),
  };

  // Leaving is immediate from this browser's perspective. The captured
  // command can still reach the server, or be queued if the network is down.
  store.disconnect();
  return sendOrQueue(command);
}
