import { signInAnonymously } from 'firebase/auth';
import { httpsCallable } from 'firebase/functions';
import { auth, functions } from './firebase';
import { useSessionStore } from '@/store/useSessionStore';
import type { PendingCommand } from '@/store/useSessionStore';
import type { GameSession, GmInstance, Player } from '@/types/game';
import type { ResourceId } from '@/data/resources';
import { normalizePressDispatch } from './pressDispatchState';
import { turnPhaseState } from './turnPhase';

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
export type CommandDisposition = 'applied' | 'queued' | 'awaiting-officer';

function errorCode(cause: unknown): string | undefined {
  if (typeof cause !== 'object' || cause === null || !('code' in cause)) return undefined;
  return typeof cause.code === 'string' ? cause.code : undefined;
}

function interception(cause: unknown): { code: string; message: string } {
  const rawCode = errorCode(cause) ?? 'unknown';
  const message =
    typeof cause === 'object' && cause !== null && 'message' in cause &&
    typeof cause.message === 'string'
      ? cause.message
      : 'The server rejected the queued command.';
  return { code: rawCode.replace(/^functions\//, ''), message };
}

function deviceLabel(): string {
  const platform = window.navigator.platform || 'Unknown device';
  const agent = window.navigator.userAgent || 'Unknown browser';
  return `${platform} / ${agent}`.slice(0, 160);
}

function commandId(): string {
  return window.crypto.randomUUID();
}

function queue(command: PendingCommand): void {
  useSessionStore.getState().enqueueCommand(command);
}

async function executeCommand(command: PendingCommand): Promise<unknown> {
  const call = httpsCallable<typeof command.payload, unknown>(functions(), command.kind);
  const reply = await call(command.payload);
  return reply.data;
}

function applyCommandResult(command: PendingCommand, result: unknown): void {
  const store = useSessionStore.getState();
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
  if (command.kind === 'disconnectFromSession') store.disconnect();
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
  if (
    (command.kind === 'setActiveRoleEnabled' || command.kind === 'applyRolePreset') &&
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
  if (!window.navigator.onLine || store.connection === 'offline') {
    queue(command);
    store.setConnection('offline');
    return 'queued';
  }
  try {
    await ensureSignedIn();
    const result = await executeCommand(command);
    applyCommandResult(command, result);
    if (
      command.kind === 'popShipConfetti' && typeof result === 'object' && result !== null &&
      'status' in result && result.status === 'awaiting-officer'
    ) return 'awaiting-officer';
    return 'applied';
  } catch (cause) {
    if (TRANSIENT_COMMAND_ERRORS.has(errorCode(cause) ?? '')) {
      queue(command);
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
    if (Date.now() - Date.parse(command.createdAt) > COMMAND_RECONNECT_WINDOW_MS) {
      store.removeCommand(command.id);
      store.setCommunicationError({
        code: 'Wolf Intercepted Request Timeout',
        message: 'The queued command expired before the connection returned.',
      });
      continue;
    }
    try {
      applyCommandResult(command, await executeCommand(command));
      store.removeCommand(command.id);
    } catch (cause) {
      if (TRANSIENT_COMMAND_ERRORS.has(errorCode(cause) ?? '')) return false;
      store.removeCommand(command.id);
      store.setCommunicationError(interception(cause));
    }
  }
  return true;
}

function applySession(reply: SessionReply, expectedSessionId?: string): boolean {
  const store = useSessionStore.getState();
  if (
    reply.player.sessionId !== reply.session.id ||
    (expectedSessionId !== undefined && (
      store.session?.id !== expectedSessionId ||
      reply.session.id !== expectedSessionId
    ))
  ) return false;
  store.setIdentity({
    ...reply.session,
    ...(reply.session.pressDispatch === undefined
      ? {}
      : { pressDispatch: normalizePressDispatch(reply.session.pressDispatch) }),
  }, reply.player);
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
    store.setConnection('live');
  } catch {
    store.setConnection('offline');
  }
}

export async function createSession(name?: string): Promise<void> {
  if (useSessionStore.getState().session) {
    throw new Error('Disconnect from the current session first.');
  }
  await ensureSignedIn();
  const call = httpsCallable<{ name?: string; joinCodeVersion: 2 }, SessionReply>(
    functions(),
    'createSession',
  );
  const reply = await call({
    ...(name === undefined ? {} : { name }),
    joinCodeVersion: 2,
  });
  applySession(reply.data);
}

/** Fetch the server-owned launcher figure and renew this app instance's activity lease. */
export async function getSurvivorPopulation(): Promise<number> {
  await ensureSignedIn();
  const call = httpsCallable<Record<string, never>, { survivorPopulation: number }>(
    functions(),
    'getSurvivorPopulation',
  );
  const reply = await call({});
  if (!Number.isInteger(reply.data.survivorPopulation)) {
    throw new Error('The server returned an invalid survivor population.');
  }
  return reply.data.survivorPopulation;
}

async function sendCounterChange(
  name: 'adjustShipResource' | 'adjustShipUnrest' | 'dismissUnrestAlert' | 'adjustShipPopulation' | 'dismissPopulationAlert',
  payload: Record<string, string | number | undefined>,
): Promise<void> {
  try {
    await ensureSignedIn();
    const call = httpsCallable<typeof payload, unknown>(functions(), name);
    await call(payload);
  } catch (cause) {
    useSessionStore.getState().setCommunicationError(interception(cause));
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
  await ensureSignedIn();
  const call = httpsCallable<{ joinCode: string }, SessionReply>(
    functions(),
    'joinSession',
  );
  const reply = await call({ joinCode });
  applySession(reply.data);
}

export async function resumeSession(sessionId: string): Promise<boolean> {
  const call = httpsCallable<{ sessionId: string }, SessionReply>(
    functions(),
    'resumeSession',
  );
  const reply = await call({ sessionId });
  return applySession(reply.data, sessionId);
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
  if (!session || !window.navigator.onLine || store.connection === 'offline') return;
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
  try {
    await refreshPresence(roleId);
    const store = useSessionStore.getState();
    if (store.me) store.setMe({ ...store.me, activeConsoleRoleId: roleId });
  } catch (cause) {
    useSessionStore.getState().setCommunicationError(interception(cause));
    throw cause;
  }
}

export async function releaseConsoleRole(): Promise<void> {
  await refreshPresence(null);
  const store = useSessionStore.getState();
  if (store.me) store.setMe({ ...store.me, activeConsoleRoleId: null });
  store.setMode('console');
  store.setLastRoute('/console');
}

export async function reconcileGmAuthority(): Promise<void> {
  const remembered = useSessionStore.getState().gmInstance;
  if (!remembered) return;
  const instances = await listGmInstances();
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

export async function advanceTurn({ overridePhaseTimer = false }: {
  readonly overridePhaseTimer?: boolean;
} = {}): Promise<void> {
  const store = useSessionStore.getState();
  if (!store.session || !store.gmInstance) throw new Error('Claim GM before advancing the turn.');
  await ensureSignedIn();
  const expectedTurn = store.session.currentTurn ?? 1;
  const call = httpsCallable<
    { sessionId: string; instanceId: string; expectedTurn: number; overridePhaseTimer?: boolean },
    {
      currentTurn: number;
      turnStartAnnouncement?: { turn: number; survivorPopulation: number };
      turnPhase?: unknown;
    }
  >(functions(), 'advanceTurn');
  try {
    const reply = await call({
      sessionId: store.session.id,
      instanceId: store.gmInstance.id,
      expectedTurn,
      ...(overridePhaseTimer ? { overridePhaseTimer: true } : {}),
    });
    const activeSession = useSessionStore.getState().session;
    const announcement = reply.data.turnStartAnnouncement;
    const hasAnnouncement = Boolean(
      announcement && Number.isSafeInteger(announcement.turn) && announcement.turn >= 1 &&
      Number.isSafeInteger(announcement.survivorPopulation) && announcement.survivorPopulation >= 0,
    );
    const phaseClock = turnPhaseState(reply.data.turnPhase);
    if (
      activeSession?.id === store.session.id && Number.isSafeInteger(reply.data.currentTurn) &&
      reply.data.currentTurn >= 0
    ) {
      useSessionStore.getState().setSession({
        ...activeSession,
        currentTurn: reply.data.currentTurn,
        ...(hasAnnouncement && announcement ? { turnStartAnnouncement: announcement } : {}),
        ...(phaseClock ? { turnPhase: phaseClock } : {}),
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
  if (!store.session || store.connection !== 'live') return;
  if (store.session.currentTurn !== expectedTurn) return;
  await ensureSignedIn();
  const call = httpsCallable<
    { sessionId: string; expectedTurn: number },
    { turnPhase?: unknown }
  >(functions(), 'beginOpenAirspacePhase');
  try {
    const reply = await call({ sessionId: store.session.id, expectedTurn });
    const phaseClock = turnPhaseState(reply.data.turnPhase);
    const activeSession = useSessionStore.getState().session;
    if (phaseClock && activeSession?.id === store.session.id) {
      useSessionStore.getState().setSession({ ...activeSession, turnPhase: phaseClock });
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

export async function triggerDradisContact(): Promise<void> {
  const store = useSessionStore.getState();
  if (!store.session || !store.gmInstance) {
    throw new Error('Claim GM before triggering a DRADIS contact.');
  }
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
    store.setSession({ ...store.session, dradisContactTriggeredAt: reply.data.triggeredAt });
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

export async function assignWolves(count: 1 | 2): Promise<readonly string[]> {
  const store = useSessionStore.getState();
  if (!store.session || !store.gmInstance) {
    throw new Error('Claim GM before assigning wolves.');
  }
  await ensureSignedIn();
  const call = httpsCallable<
    { sessionId: string; instanceId: string; count: 1 | 2 },
    { roleIds: string[] }
  >(functions(), 'assignWolves');
  try {
    const reply = await call({
      sessionId: store.session.id,
      instanceId: store.gmInstance.id,
      count,
    });
    return reply.data.roleIds;
  } catch (cause) {
    store.setCommunicationError(interception(cause));
    throw cause;
  }
}

export async function assignWolfRoles(roleIds: readonly string[]): Promise<readonly string[]> {
  const store = useSessionStore.getState();
  if (!store.session || !store.gmInstance) {
    throw new Error('Claim GM before assigning wolves.');
  }
  await ensureSignedIn();
  const call = httpsCallable<
    { sessionId: string; instanceId: string; roleIds: readonly string[] },
    { roleIds: string[] }
  >(functions(), 'assignWolfRoles');
  try {
    const reply = await call({
      sessionId: store.session.id,
      instanceId: store.gmInstance.id,
      roleIds,
    });
    return reply.data.roleIds;
  } catch (cause) {
    store.setCommunicationError(interception(cause));
    throw cause;
  }
}

export async function resetWolves(): Promise<void> {
  const store = useSessionStore.getState();
  if (!store.session || !store.gmInstance) {
    throw new Error('Claim GM before resetting wolves.');
  }
  await ensureSignedIn();
  const call = httpsCallable<
    { sessionId: string; instanceId: string },
    { reset: true }
  >(functions(), 'resetWolves');
  try {
    await call({
      sessionId: store.session.id,
      instanceId: store.gmInstance.id,
    });
  } catch (cause) {
    store.setCommunicationError(interception(cause));
    throw cause;
  }
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
