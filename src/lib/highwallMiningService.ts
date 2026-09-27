import { httpsCallable } from 'firebase/functions';
import type { GameSession, ShuttleDocking } from '@/types/game';
import { functions } from './firebase';
import { hasFreshSessionAuthority, requireFreshSessionAuthority } from './sessionMutationAuthority';
import { useSessionStore } from '@/store/useSessionStore';

export interface HighwallMiningReply {
  readonly status: 'committed' | 'replayed';
  readonly cycle: number;
  readonly revision: number;
  readonly operation: {
    readonly requestId: string;
    readonly resource: 'materials' | 'ore';
    readonly rolls: readonly number[];
    readonly amount: number;
  };
  readonly cargo: { readonly ore: number; readonly materials: number };
}

export interface HighwallMiningStaleReply {
  readonly status: 'stale';
  readonly sessionId: string;
  readonly requestId: string;
  readonly resource: 'materials' | 'ore';
  readonly expectedRevision: number;
  readonly currentRevision: number;
  readonly expectedControlRevision: number;
  readonly currentControlRevision: number;
  readonly expectedCycle: number;
  readonly currentCycle: number;
  readonly hostShipId: string;
}

export type HighwallMiningResult = HighwallMiningReply | HighwallMiningStaleReply;

export interface HighwallMiningCommand {
  readonly sessionId: string;
  readonly requestId: string;
  readonly resource: 'materials' | 'ore';
  readonly expectedRevision: number;
  readonly expectedControlRevision: number;
  readonly expectedCycle: number;
}

interface HighwallMiningAuthorityBinding {
  readonly sessionId: string;
  readonly uid: string;
  readonly role: string;
  readonly assignedRoleId: string | null | undefined;
  readonly activeConsoleRoleId: string | null | undefined;
  readonly fleetGroupId: string;
  readonly ownerRoleId: string;
  readonly ownerUid: string;
  readonly hostShipId: string;
  readonly expectedControlRevision: number;
  readonly expectedCycle: number;
}

export interface HighwallMiningExactRetry {
  readonly command: HighwallMiningCommand;
  readonly authority: HighwallMiningAuthorityBinding;
}

export class HighwallMiningUncertainError extends Error {
  readonly retry: HighwallMiningExactRetry;

  constructor(retry: HighwallMiningExactRetry) {
    super('The Highwall mining result is uncertain. Retry the exact request while your current holder authority remains active.');
    this.name = 'HighwallMiningUncertainError';
    this.retry = retry;
  }
}

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown> : undefined;
}

function isSafeCounter(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return Object.keys(value).length === keys.length && Object.keys(value).every((key) => keys.includes(key));
}

function highwallDocking(session: GameSession): ShuttleDocking | undefined {
  const dockings = session.shuttleDockings;
  if (!Array.isArray(dockings) || dockings.some((entry) =>
    !entry || typeof entry.shuttleId !== 'string' || typeof entry.shipId !== 'string' ||
    typeof entry.dockedAt !== 'string' || !entry.dockedAt.trim())) return undefined;
  const highwall = dockings.filter((entry) => entry.shuttleId === 'highwall');
  return highwall.length === 1 ? highwall[0] : undefined;
}

function captureAuthority(
  session: GameSession,
  expectedControlRevision: number,
  expectedCycle: number,
): HighwallMiningAuthorityBinding {
  const me = useSessionStore.getState().me;
  const control = session.shuttleControl?.highwall;
  const docking = highwallDocking(session);
  const groupId = me?.fleetGroupId;
  const activeRoleIds = session.activeRoleIds;
  const activeVesselIds = session.activeVesselIds;
  const discovery = session.playerDiscovery;
  if (!me || me.sessionId !== session.id || me.role !== 'player' || !me.uid ||
      typeof groupId !== 'string' || !groupId.trim() ||
      !Array.isArray(activeRoleIds) || !activeRoleIds.includes('icebreaker-miner') ||
      !Array.isArray(activeVesselIds) || !activeVesselIds.includes('icebreaker') ||
      !control || control.shuttleId !== 'highwall' || control.ownerRoleId !== 'icebreaker-miner' ||
      control.holderUid !== me.uid || !isSafeCounter(control.revision) ||
      control.revision !== expectedControlRevision || typeof control.ownerUid !== 'string' ||
      !control.ownerUid.trim() || !docking || !activeVesselIds.includes(docking.shipId) ||
      (discovery !== undefined && (discovery.groupId !== groupId ||
        (discovery.fleetGroupVesselIds !== undefined &&
          !discovery.fleetGroupVesselIds.includes(docking.shipId))))) {
    throw new Error('The current Highwall holder, role, fleet group, dock, or revision is unavailable. Refresh before mining.');
  }
  return {
    sessionId: session.id,
    uid: me.uid,
    role: me.role,
    assignedRoleId: me.assignedRoleId,
    activeConsoleRoleId: me.activeConsoleRoleId,
    fleetGroupId: groupId,
    ownerRoleId: control.ownerRoleId,
    ownerUid: control.ownerUid,
    hostShipId: docking.shipId,
    expectedControlRevision,
    expectedCycle,
  };
}

function currentAuthorityMatches(binding: HighwallMiningAuthorityBinding): boolean {
  const { session, me } = useSessionStore.getState();
  const control = session?.shuttleControl?.highwall;
  const docking = session ? highwallDocking(session) : undefined;
  const activeRoleIds = session?.activeRoleIds;
  const activeVesselIds = session?.activeVesselIds;
  const discovery = session?.playerDiscovery;
  return hasFreshSessionAuthority() && session?.id === binding.sessionId &&
    me?.sessionId === binding.sessionId && me.uid === binding.uid && me.role === binding.role &&
    me.role === 'player' && me.assignedRoleId === binding.assignedRoleId &&
    me.activeConsoleRoleId === binding.activeConsoleRoleId &&
    me.fleetGroupId === binding.fleetGroupId &&
    session.phase === 'active' && Array.isArray(activeRoleIds) &&
    activeRoleIds.includes('icebreaker-miner') && Array.isArray(activeVesselIds) &&
    activeVesselIds.includes('icebreaker') && control?.shuttleId === 'highwall' &&
    control.ownerRoleId === binding.ownerRoleId && control.ownerRoleId === 'icebreaker-miner' &&
    control.ownerUid === binding.ownerUid && control.holderUid === binding.uid &&
    isSafeCounter(control.revision) && control.revision >= binding.expectedControlRevision &&
    docking?.shipId === binding.hostShipId && activeVesselIds.includes(binding.hostShipId) &&
    (discovery === undefined || (discovery.groupId === binding.fleetGroupId &&
      (discovery.fleetGroupVesselIds === undefined ||
        discovery.fleetGroupVesselIds.includes(binding.hostShipId)))) &&
    isSafeCounter(session.currentTurn) && session.currentTurn >= binding.expectedCycle;
}

function isUncertainTransportError(cause: unknown): boolean {
  const code = record(cause)?.code;
  if (typeof code !== 'string') return false;
  const normalized = code.startsWith('functions/') ? code.slice('functions/'.length) : code;
  return ['cancelled', 'deadline-exceeded', 'internal', 'unknown', 'unavailable'].includes(normalized);
}

function parseReply(value: unknown, attempt: HighwallMiningExactRetry): HighwallMiningResult {
  const raw = record(value);
  if (!raw) throw new Error('Highwall mining returned an invalid result. Refresh before operating again.');
  const { command, authority } = attempt;
  if (raw.status === 'stale') {
    const staleKeys = [
      'status', 'sessionId', 'requestId', 'resource', 'expectedRevision', 'currentRevision',
      'expectedControlRevision', 'currentControlRevision', 'expectedCycle', 'currentCycle', 'hostShipId',
    ];
    if (!exactKeys(raw, staleKeys) || raw.sessionId !== command.sessionId ||
        raw.requestId !== command.requestId || raw.resource !== command.resource ||
        raw.expectedRevision !== command.expectedRevision ||
        raw.expectedControlRevision !== command.expectedControlRevision ||
        raw.expectedCycle !== command.expectedCycle || raw.hostShipId !== authority.hostShipId ||
        !isSafeCounter(raw.currentRevision) || raw.currentRevision < command.expectedRevision ||
        !isSafeCounter(raw.currentControlRevision) ||
        raw.currentControlRevision < command.expectedControlRevision ||
        !Number.isSafeInteger(raw.currentCycle) || (raw.currentCycle as number) < command.expectedCycle ||
        (raw.currentRevision === command.expectedRevision &&
          raw.currentControlRevision === command.expectedControlRevision &&
          raw.currentCycle === command.expectedCycle)) {
      throw new Error('Highwall mining returned an invalid stale result. Refresh before operating again.');
    }
    return value as HighwallMiningStaleReply;
  }

  const operation = record(raw.operation);
  const cargo = record(raw.cargo);
  const resource = operation?.resource;
  const rolls = operation?.rolls;
  if ((raw.status !== 'committed' && raw.status !== 'replayed') ||
      raw.sessionId !== command.sessionId || raw.requestId !== command.requestId ||
      !Number.isSafeInteger(raw.cycle) || raw.cycle !== command.expectedCycle ||
      !Number.isSafeInteger(raw.revision) || raw.revision !== command.expectedRevision + 1 ||
      !operation || operation.requestId !== command.requestId ||
      resource !== command.resource || !Array.isArray(rolls) ||
      rolls.length !== (resource === 'materials' ? 1 : 3) ||
      rolls.some((roll) => !Number.isSafeInteger(roll) || (roll as number) < 1 || (roll as number) > 6) ||
      !Number.isSafeInteger(operation.amount) ||
      operation.amount !== rolls.reduce((sum, roll) => sum + (roll as number), 0) ||
      !cargo || !Number.isSafeInteger(cargo.ore) || (cargo.ore as number) < 0 ||
      !Number.isSafeInteger(cargo.materials) || (cargo.materials as number) < 0) {
    throw new Error('Highwall mining returned an invalid result. Refresh before operating again.');
  }
  return value as HighwallMiningReply;
}

function validCommand(command: HighwallMiningCommand): boolean {
  return /^[\w-]{1,128}$/.test(command.sessionId) && /^[\w-]{1,128}$/.test(command.requestId) &&
    (command.resource === 'materials' || command.resource === 'ore') &&
    isSafeCounter(command.expectedRevision) && isSafeCounter(command.expectedControlRevision) &&
    Number.isSafeInteger(command.expectedCycle) && command.expectedCycle >= 1;
}

async function sendAttempt(attempt: HighwallMiningExactRetry): Promise<HighwallMiningResult> {
  if (!validCommand(attempt.command) || !currentAuthorityMatches(attempt.authority)) {
    throw new Error('The current Highwall holder, role, fleet group, or dock changed. Refresh before mining.');
  }
  const { command } = attempt;
  const payload = {
    sessionId: command.sessionId,
    requestId: command.requestId,
    resource: command.resource,
    expectedRevision: command.expectedRevision,
    expectedControlRevision: command.expectedControlRevision,
    expectedCycle: command.expectedCycle,
  };
  let reply: { readonly data: unknown };
  try {
    reply = await httpsCallable<typeof payload, unknown>(functions(), 'runHighwallMining')(payload);
  } catch (cause) {
    if (isUncertainTransportError(cause)) throw new HighwallMiningUncertainError(attempt);
    throw cause;
  }
  if (!currentAuthorityMatches(attempt.authority)) {
    throw new Error('Highwall mining authority changed while the request was pending. Refresh the console.');
  }
  return parseReply(reply.data, attempt);
}

export async function runHighwallMining(
  resource: 'materials' | 'ore',
  expectedRevision: number,
  expectedControlRevision: number,
  expectedCycle: number,
): Promise<HighwallMiningResult> {
  const { session } = useSessionStore.getState();
  if (!session) throw new Error('Reconnect before operating Highwall mining.');
  requireFreshSessionAuthority();
  const authority = captureAuthority(session, expectedControlRevision, expectedCycle);
  const command: HighwallMiningCommand = {
    sessionId: session.id,
    requestId: window.crypto.randomUUID(),
    resource,
    expectedRevision,
    expectedControlRevision,
    expectedCycle,
  };
  return sendAttempt({ command, authority });
}

export async function retryHighwallMiningExactly(
  attempt: HighwallMiningExactRetry,
): Promise<HighwallMiningResult> {
  requireFreshSessionAuthority();
  return sendAttempt(attempt);
}

export function canRetryHighwallMiningExactly(attempt: HighwallMiningExactRetry): boolean {
  return validCommand(attempt.command) && currentAuthorityMatches(attempt.authority);
}
