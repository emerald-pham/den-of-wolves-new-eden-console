import { httpsCallable } from 'firebase/functions';
import { functions } from './firebase';
import {
  hasFreshSessionAuthority,
  requireFreshSessionAuthority,
} from './sessionMutationAuthority';
import { useSessionStore } from '@/store/useSessionStore';
import { parseChacauRepairLedger } from './chacauRepairLedger';
import type { GameSession, Player } from '@/types/game';

const CHACAU_ENGINEER_ROLE_ID = 'refinery-124-engineer';

export interface ChacauRepairCommand {
  readonly requestId: string;
  readonly systemIds: readonly string[];
  readonly expectedControlRevision: number;
  readonly expectedRepairRevision: number;
  readonly expectedCycle: number;
  readonly expectedHostShipId: string;
}

export interface ChacauRepairResult {
  readonly status: 'committed' | 'replayed';
  readonly hostShipId: string;
  readonly systemIds: readonly string[];
  readonly materialsRemaining: number;
  readonly cycle: number;
  readonly repairRevision: number;
}

export interface ChacauRepairStaleResult {
  readonly status: 'stale';
  readonly sessionId: string;
  readonly requestId: string;
  readonly shuttleId: 'chacau';
  readonly expectedHostShipId: string;
  readonly systemIds: readonly string[];
  readonly expectedControlRevision: number;
  readonly currentControlRevision: number;
  readonly expectedRepairRevision: number;
  readonly currentRepairRevision: number;
  readonly expectedCycle: number;
  readonly currentCycle: number;
}

export type ChacauRepairServiceResult = ChacauRepairResult | ChacauRepairStaleResult;

export interface ChacauRepairAuthorityBinding {
  readonly sessionId: string;
  readonly uid: string;
  readonly role: string;
  readonly assignedRoleId: string | null | undefined;
  readonly activeConsoleRoleId: string | null | undefined;
  readonly fleetGroupId: string;
  readonly ownerUid: string;
  readonly expectedHostShipId: string;
  readonly expectedControlRevision: number;
  readonly expectedRepairRevision: number;
  readonly expectedCycle: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isSafeCounter(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

function currentChacauDockings(
  session: GameSession,
): readonly Readonly<{ shuttleId: string; shipId: string }>[] | null {
  const raw = session.shuttleDockings as unknown;
  if (!Array.isArray(raw) || raw.some(value => {
    if (!isRecord(value)) return true;
    return typeof value.shuttleId !== 'string' || !value.shuttleId.trim() ||
      typeof value.shipId !== 'string' || !value.shipId.trim() ||
      typeof value.dockedAt !== 'string' || !value.dockedAt.trim() ||
      value.inTransit === true || value.transit === true || value.status === 'in-transit' ||
      value.state === 'in-transit' || value.dockingState === 'in-transit';
  })) return null;
  return raw.filter((value): value is { shuttleId: string; shipId: string } =>
    isRecord(value) && typeof value.shuttleId === 'string' &&
    typeof value.shipId === 'string' && value.shuttleId === 'chacau');
}

function hasLiveCoordination(session: GameSession): boolean {
  const cycle = session.currentTurn;
  const phase = session.turnPhase;
  const deadlineValue = phase?.openAirspaceEndsAt;
  if (!phase || typeof deadlineValue !== 'string') return false;
  const deadline = Date.parse(deadlineValue);
  return session.phase === 'active' && Number.isSafeInteger(cycle) && (cycle as number) >= 1 &&
    phase.turn === cycle && phase.airspace.state === 'lifted' && phase.timerPause === undefined &&
    Number.isFinite(deadline) && Date.now() < deadline;
}

/** Recheck the exact actor, Chacau holder, group, host and live phase after async results. */
export function hasCurrentChacauHolderAuthority(
  binding: ChacauRepairAuthorityBinding,
  requireCoordination: boolean,
): boolean {
  const current = useSessionStore.getState();
  const session = current.session as GameSession | undefined;
  const me = current.me;
  const control = session?.shuttleControl?.chacau;
  const dockings = session ? currentChacauDockings(session) : null;
  const currentCycle = session?.currentTurn;
  const ledger = session ? parseChacauRepairLedger(session.chacauRepairs) : null;
  const activeRoles = session?.activeRoleIds;
  const activeVessels = session?.activeVesselIds;
  const projection = session?.playerDiscovery;
  const fleetGroupVesselIds = projection?.fleetGroupVesselIds;
  return hasFreshSessionAuthority() && session?.id === binding.sessionId &&
    me?.sessionId === binding.sessionId && me.uid === binding.uid && me.role === binding.role &&
    me.role === 'player' && me.connected === true &&
    me.assignedRoleId === binding.assignedRoleId && me.assignedRoleId === CHACAU_ENGINEER_ROLE_ID &&
    me.activeConsoleRoleId === binding.activeConsoleRoleId &&
    me.activeConsoleRoleId === CHACAU_ENGINEER_ROLE_ID && me.escapeState == null &&
    me.fleetGroupId === binding.fleetGroupId && typeof binding.fleetGroupId === 'string' &&
    binding.fleetGroupId.trim().length > 0 && session.phase === 'active' &&
    Array.isArray(activeRoles) && activeRoles.includes(CHACAU_ENGINEER_ROLE_ID) &&
    Array.isArray(activeVessels) && activeVessels.includes('refinery-124') &&
    activeVessels.includes(binding.expectedHostShipId) &&
    projection?.groupId === binding.fleetGroupId && Array.isArray(fleetGroupVesselIds) &&
    fleetGroupVesselIds.includes(binding.expectedHostShipId) &&
    binding.expectedHostShipId.trim().length > 0 &&
    control?.shuttleId === 'chacau' && control.ownerRoleId === CHACAU_ENGINEER_ROLE_ID &&
    typeof control.ownerUid === 'string' && control.ownerUid.trim().length > 0 &&
    control.ownerUid === binding.ownerUid && control.holderUid === binding.uid &&
    isSafeCounter(control.revision) && control.revision >= binding.expectedControlRevision &&
    dockings !== null && dockings.length === 1 &&
    dockings[0]?.shipId === binding.expectedHostShipId &&
    Number.isSafeInteger(currentCycle) && (currentCycle as number) >= binding.expectedCycle &&
    ledger !== null && ledger.cycle <= (currentCycle as number) &&
    ledger.revision >= binding.expectedRepairRevision &&
    (!requireCoordination || hasLiveCoordination(session));
}

function captureAuthorityBinding(
  session: GameSession,
  me: Player,
  command: ChacauRepairCommand,
): ChacauRepairAuthorityBinding {
  const control = session.shuttleControl?.chacau;
  const fleetGroupId = me.fleetGroupId;
  if (!control || typeof control.ownerUid !== 'string' || !control.ownerUid.trim() ||
      typeof fleetGroupId !== 'string' || !fleetGroupId.trim()) {
    throw new Error('The current Chacau holder, fleet group, or dock is unavailable.');
  }
  const binding: ChacauRepairAuthorityBinding = {
    sessionId: session.id, uid: me.uid, role: me.role,
    assignedRoleId: me.assignedRoleId, activeConsoleRoleId: me.activeConsoleRoleId,
    fleetGroupId, ownerUid: control.ownerUid, expectedHostShipId: command.expectedHostShipId,
    expectedControlRevision: command.expectedControlRevision,
    expectedRepairRevision: command.expectedRepairRevision, expectedCycle: command.expectedCycle,
  };
  if (!hasCurrentChacauHolderAuthority(binding, true)) {
    throw new Error('Only the current Refinery 124 Engineer holding Chacau at its dock may repair during Coordination.');
  }
  return binding;
}

function isBoundStaleResult(
  value: unknown,
  sessionId: string,
  command: ChacauRepairCommand,
): value is ChacauRepairStaleResult {
  if (!isRecord(value)) return false;
  const fields = [
    'status', 'sessionId', 'requestId', 'shuttleId', 'expectedHostShipId', 'systemIds',
    'expectedControlRevision', 'currentControlRevision', 'expectedRepairRevision',
    'currentRepairRevision', 'expectedCycle', 'currentCycle',
  ];
  const expectedSystemIds = [...command.systemIds].sort();
  return Object.keys(value).length === fields.length && fields.every(key => Object.hasOwn(value, key)) &&
    value.status === 'stale' && value.sessionId === sessionId && value.requestId === command.requestId &&
    value.shuttleId === 'chacau' && value.expectedHostShipId === command.expectedHostShipId &&
    Array.isArray(value.systemIds) && value.systemIds.length === expectedSystemIds.length &&
    value.systemIds.every((id, index) => id === expectedSystemIds[index]) &&
    value.expectedControlRevision === command.expectedControlRevision &&
    isSafeCounter(value.currentControlRevision) &&
    value.currentControlRevision >= command.expectedControlRevision &&
    value.expectedRepairRevision === command.expectedRepairRevision &&
    isSafeCounter(value.currentRepairRevision) &&
    value.currentRepairRevision >= command.expectedRepairRevision &&
    value.expectedCycle === command.expectedCycle &&
    Number.isSafeInteger(value.currentCycle) &&
    (value.currentCycle as number) >= command.expectedCycle &&
    (value.currentControlRevision > command.expectedControlRevision ||
      value.currentRepairRevision > command.expectedRepairRevision ||
      (value.currentCycle as number) > command.expectedCycle);
}

export async function repairConsolesFromChacau(
  command: ChacauRepairCommand,
): Promise<ChacauRepairServiceResult> {
  const { session, me } = useSessionStore.getState();
  if (!session || !me) throw new Error('Reconnect before repairing consoles with Chacau.');
  requireFreshSessionAuthority();
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(command.requestId) ||
      !isSafeCounter(command.expectedControlRevision) ||
      !Number.isSafeInteger(command.expectedRepairRevision) || command.expectedRepairRevision < 0 ||
      command.expectedRepairRevision >= Number.MAX_SAFE_INTEGER ||
      !Number.isSafeInteger(command.expectedCycle) || command.expectedCycle < 1 ||
      !/^[A-Za-z0-9_-]{1,128}$/.test(command.expectedHostShipId) ||
      !Array.isArray(command.systemIds) || command.systemIds.length < 1 ||
      command.systemIds.length > 2 ||
      command.systemIds.some(id => typeof id !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(id)) ||
      new Set(command.systemIds).size !== command.systemIds.length) {
    throw new Error('The Chacau repair selection is invalid. Refresh the console and try again.');
  }

  const sessionId = session.id;
  const binding = captureAuthorityBinding(session as GameSession, me, command);
  const payload = {
    sessionId,
    requestId: command.requestId,
    systemIds: [...command.systemIds],
    expectedControlRevision: command.expectedControlRevision,
    expectedRepairRevision: command.expectedRepairRevision,
    expectedCycle: command.expectedCycle,
    expectedHostShipId: command.expectedHostShipId,
  };
  const response = await httpsCallable<typeof payload, unknown>(
    functions(), 'repairConsolesFromChacau',
  )(payload);
  const result = response.data;
  if (isRecord(result) && result.status === 'stale') {
    if (!isBoundStaleResult(result, sessionId, command)) {
      throw new Error('The Chacau repair stale response was malformed.');
    }
    if (!hasCurrentChacauHolderAuthority(binding, true)) {
      throw new Error('Chacau repair authority or Coordination changed while the request was pending.');
    }
    return result;
  }
  if (!hasCurrentChacauHolderAuthority(binding, false)) {
    throw new Error('Chacau repair authority changed while the request was pending.');
  }
  const expectedSystemIds = [...command.systemIds].sort();
  if (!isRecord(result)) throw new Error('The Chacau repair response was malformed.');
  const fields = [
    'status', 'sessionId', 'requestId', 'shuttleId', 'hostShipId',
    'systemIds', 'materialsRemaining', 'cycle', 'repairRevision',
  ];
  if (Object.keys(result).length !== fields.length || fields.some(key => !Object.hasOwn(result, key)) ||
      (result.status !== 'committed' && result.status !== 'replayed') ||
      result.sessionId !== sessionId || result.requestId !== command.requestId ||
      result.shuttleId !== 'chacau' || result.hostShipId !== command.expectedHostShipId ||
      !Array.isArray(result.systemIds) || result.systemIds.length !== expectedSystemIds.length ||
      result.systemIds.some((id, index) => id !== expectedSystemIds[index]) ||
      !isSafeCounter(result.materialsRemaining) ||
      result.cycle !== command.expectedCycle ||
      !Number.isSafeInteger(result.repairRevision) ||
      result.repairRevision !== command.expectedRepairRevision + 1) {
    throw new Error('The Chacau repair response was malformed.');
  }
  return {
    status: result.status,
    hostShipId: result.hostShipId as string,
    systemIds: result.systemIds as string[],
    materialsRemaining: result.materialsRemaining as number,
    cycle: result.cycle as number,
    repairRevision: result.repairRevision as number,
  };
}
