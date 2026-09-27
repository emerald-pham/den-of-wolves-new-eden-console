import { httpsCallable } from 'firebase/functions';
import { useSessionStore } from '@/store/useSessionStore';
import type { GameSession, Player } from '@/types/game';
import { findShip } from '@/data/ships';
import { SERVICE_SHUTTLE_IDS } from '@/data/serviceShuttleRecharge';
import { turnPhaseState } from './turnPhase';
import { functions } from './firebase';
import { hasFreshSessionAuthority, requireFreshSessionAuthority } from './sessionMutationAuthority';

export interface ServiceShuttleRechargeCommand {
  readonly requestId: string;
  readonly shuttleId: string;
  readonly consoleId: string;
  readonly expectedControlRevision: number;
  readonly expectedMaintenanceRevision: number;
  readonly expectedCycle: number;
  readonly expectedHostShipId: string;
  readonly productionScrap?: boolean;
  readonly productionOreAmount?: number;
}

export interface ServiceShuttleRechargeCommittedResult {
  readonly status: 'committed' | 'replayed';
  readonly sessionId: string;
  readonly requestId: string;
  readonly shuttleId: string;
  readonly hostShipId: string;
  readonly consoleId: string;
  readonly cycle: number;
  readonly maintenanceRevision: number;
  readonly rechargeRevision: number;
  readonly immediate: boolean;
  readonly message: string;
}

export interface ServiceShuttleRechargeStaleResult {
  readonly status: 'stale';
  readonly sessionId: string;
  readonly requestId: string;
  readonly actorUid: string;
  readonly shuttleId: string;
  readonly expectedHostShipId: string;
  readonly hostShipId: string;
  readonly consoleId: string;
  readonly expectedControlRevision: number;
  readonly currentControlRevision: number;
  readonly expectedMaintenanceRevision: number;
  readonly currentMaintenanceRevision: number;
  readonly expectedCycle: number;
  readonly currentCycle: number;
  readonly productionScrap: boolean | null;
  readonly productionOreAmount: number | null;
}

export type ServiceShuttleRechargeResult =
  | ServiceShuttleRechargeCommittedResult
  | ServiceShuttleRechargeStaleResult;

export interface ServiceShuttleRechargeAuthorityBinding {
  readonly sessionId: string;
  readonly uid: string;
  readonly role: string;
  readonly assignedRoleId: string | null | undefined;
  readonly activeConsoleRoleId: string | null | undefined;
  readonly fleetGroupId: string;
  readonly shuttleId: string;
  readonly ownerRoleId: string;
  readonly ownerUid: string;
  readonly hostShipId: string;
  readonly expectedControlRevision: number;
  readonly expectedMaintenanceRevision: number;
  readonly expectedCycle: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isCounter(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

function currentDockedHost(session: GameSession, shuttleId: string): string | undefined {
  const raw = (session as unknown as Record<string, unknown>).shuttleDockings;
  if (!Array.isArray(raw)) return undefined;
  const matches = raw.filter((entry) => isRecord(entry) && entry.shuttleId === shuttleId);
  if (matches.length !== 1) return undefined;
  const docking = matches[0];
  if (!isRecord(docking) || typeof docking.shipId !== 'string' ||
      typeof docking.dockedAt !== 'string' || docking.dockedAt.trim().length === 0 ||
      docking.inTransit === true || docking.transit === true || docking.status === 'in-transit' ||
      docking.state === 'in-transit' || docking.dockingState === 'in-transit') return undefined;
  return docking.shipId;
}

function hasCurrentCoordination(session: GameSession, minimumCycle: number): boolean {
  const cycle = session.currentTurn;
  const phase = turnPhaseState(session.turnPhase);
  return session.phase === 'active' && Number.isSafeInteger(cycle) &&
    (cycle as number) >= minimumCycle && phase !== undefined && phase.turn === cycle &&
    phase.airspace.state === 'lifted' && phase.timerPause === undefined;
}

export function hasCurrentServiceShuttleRechargeAuthority(
  binding: ServiceShuttleRechargeAuthorityBinding,
): boolean {
  const current = useSessionStore.getState();
  const session = current.session;
  const me = current.me;
  if (!session || !me || !hasFreshSessionAuthority() ||
      !SERVICE_SHUTTLE_IDS.includes(binding.shuttleId as typeof SERVICE_SHUTTLE_IDS[number])) return false;
  const control = session.shuttleControl?.[binding.shuttleId];
  const docking = currentDockedHost(session, binding.shuttleId);
  return session.id === binding.sessionId && me.sessionId === binding.sessionId &&
    me.uid === binding.uid && me.role === binding.role && me.role === 'player' &&
    me.assignedRoleId === binding.assignedRoleId && me.activeConsoleRoleId === binding.activeConsoleRoleId &&
    me.fleetGroupId === binding.fleetGroupId && me.fleetGroupId.trim().length > 0 &&
    Array.isArray(session.activeVesselIds) && session.activeVesselIds.includes(binding.hostShipId) &&
    control?.shuttleId === binding.shuttleId && control.ownerRoleId === binding.ownerRoleId &&
    control.ownerUid === binding.ownerUid && control.holderUid === binding.uid &&
    isCounter(control.revision) && control.revision >= binding.expectedControlRevision &&
    docking === binding.hostShipId && session.shuttleFuelled?.[binding.shuttleId] === true &&
    hasCurrentCoordination(session, binding.expectedCycle);
}

export function captureServiceShuttleRechargeAuthority(
  session: GameSession,
  me: Player,
  command: ServiceShuttleRechargeCommand,
): ServiceShuttleRechargeAuthorityBinding {
  const control = session.shuttleControl?.[command.shuttleId];
  const maintenance = session.maintenanceCycles?.[command.expectedHostShipId];
  const fleetGroupId = me.fleetGroupId;
  if (!SERVICE_SHUTTLE_IDS.includes(command.shuttleId as typeof SERVICE_SHUTTLE_IDS[number]) ||
      !control || !maintenance || typeof control.ownerRoleId !== 'string' ||
      typeof control.ownerUid !== 'string' || !control.ownerUid.trim() ||
      typeof fleetGroupId !== 'string' || !fleetGroupId.trim()) {
    throw new Error('The current service-shuttle holder, host, or fleet group is unavailable.');
  }
  const binding: ServiceShuttleRechargeAuthorityBinding = {
    sessionId: session.id, uid: me.uid, role: me.role,
    assignedRoleId: me.assignedRoleId, activeConsoleRoleId: me.activeConsoleRoleId,
    fleetGroupId, shuttleId: command.shuttleId, ownerRoleId: control.ownerRoleId,
    ownerUid: control.ownerUid, hostShipId: command.expectedHostShipId,
    expectedControlRevision: command.expectedControlRevision,
    expectedMaintenanceRevision: command.expectedMaintenanceRevision,
    expectedCycle: command.expectedCycle,
  };
  const docking = currentDockedHost(session, command.shuttleId);
  if (!hasFreshSessionAuthority() || me.role !== 'player' || me.sessionId !== session.id ||
      docking !== command.expectedHostShipId || !findShip(command.expectedHostShipId) ||
      control.holderUid !== me.uid || control.revision !== command.expectedControlRevision ||
      maintenance.turn !== command.expectedCycle ||
      maintenance.revision !== command.expectedMaintenanceRevision || !maintenance.completedAt ||
      session.currentTurn !== command.expectedCycle ||
      !hasCurrentCoordination(session, command.expectedCycle) ||
      session.shuttleFuelled?.[command.shuttleId] !== true ||
      !hasCurrentServiceShuttleRechargeAuthority(binding)) {
    throw new Error('Refresh the live service-shuttle holder, dock, fuel, and Coordination state before recharging.');
  }
  return binding;
}

function parseStaleReply(
  value: unknown,
  sessionId: string,
  uid: string,
  command: ServiceShuttleRechargeCommand,
): ServiceShuttleRechargeStaleResult | undefined {
  if (!isRecord(value)) return undefined;
  const keys = [
    'status', 'sessionId', 'requestId', 'actorUid', 'shuttleId', 'expectedHostShipId',
    'hostShipId', 'consoleId', 'expectedControlRevision', 'currentControlRevision',
    'expectedMaintenanceRevision', 'currentMaintenanceRevision', 'expectedCycle', 'currentCycle',
    'productionScrap', 'productionOreAmount',
  ];
  if (Object.keys(value).length !== keys.length || keys.some((key) => !Object.hasOwn(value, key)) ||
      value.status !== 'stale' || value.sessionId !== sessionId || value.requestId !== command.requestId ||
      value.actorUid !== uid || value.shuttleId !== command.shuttleId ||
      value.expectedHostShipId !== command.expectedHostShipId || value.hostShipId !== command.expectedHostShipId ||
      value.consoleId !== command.consoleId ||
      value.expectedControlRevision !== command.expectedControlRevision ||
      value.expectedMaintenanceRevision !== command.expectedMaintenanceRevision ||
      value.expectedCycle !== command.expectedCycle ||
      value.productionScrap !== (command.productionScrap ?? null) ||
      value.productionOreAmount !== (command.productionOreAmount ?? null) ||
      !isCounter(value.currentControlRevision) || value.currentControlRevision < command.expectedControlRevision ||
      !isCounter(value.currentMaintenanceRevision) || value.currentMaintenanceRevision < command.expectedMaintenanceRevision ||
      !Number.isSafeInteger(value.currentCycle) || (value.currentCycle as number) < command.expectedCycle ||
      (value.currentControlRevision === command.expectedControlRevision &&
        value.currentMaintenanceRevision === command.expectedMaintenanceRevision &&
        value.currentCycle === command.expectedCycle)) return undefined;
  return value as unknown as ServiceShuttleRechargeStaleResult;
}

function parseCommittedReply(
  value: unknown,
  sessionId: string,
  command: ServiceShuttleRechargeCommand,
): ServiceShuttleRechargeCommittedResult | undefined {
  if (!isRecord(value)) return undefined;
  const keys = [
    'status', 'sessionId', 'requestId', 'shuttleId', 'hostShipId', 'consoleId', 'cycle',
    'maintenanceRevision', 'rechargeRevision', 'immediate', 'message',
  ];
  if (Object.keys(value).length !== keys.length || keys.some((key) => !Object.hasOwn(value, key)) ||
      (value.status !== 'committed' && value.status !== 'replayed') ||
      value.sessionId !== sessionId || value.requestId !== command.requestId ||
      value.shuttleId !== command.shuttleId || value.hostShipId !== command.expectedHostShipId ||
      value.consoleId !== command.consoleId || value.cycle !== command.expectedCycle ||
      !isCounter(value.maintenanceRevision) || value.maintenanceRevision <= command.expectedMaintenanceRevision ||
      !isCounter(value.rechargeRevision) || value.rechargeRevision < 1 ||
      typeof value.immediate !== 'boolean' || typeof value.message !== 'string') return undefined;
  return value as unknown as ServiceShuttleRechargeCommittedResult;
}

export async function rechargeHostConsoleFromShuttle(
  command: ServiceShuttleRechargeCommand,
): Promise<ServiceShuttleRechargeResult> {
  const { session, me } = useSessionStore.getState();
  if (!session || !me) throw new Error('Reconnect before recharging a host console.');
  requireFreshSessionAuthority();
  if (!/^[\w-]{1,128}$/.test(command.requestId) ||
      !SERVICE_SHUTTLE_IDS.includes(command.shuttleId as typeof SERVICE_SHUTTLE_IDS[number]) ||
      !/^[\w-]{1,128}$/.test(command.consoleId) || !findShip(command.expectedHostShipId) ||
      !isCounter(command.expectedControlRevision) ||
      !isCounter(command.expectedMaintenanceRevision) ||
      !Number.isSafeInteger(command.expectedCycle) || command.expectedCycle < 1 ||
      (command.productionScrap !== undefined && typeof command.productionScrap !== 'boolean') ||
      (command.productionOreAmount !== undefined &&
        (!Number.isSafeInteger(command.productionOreAmount) || command.productionOreAmount < 1))) {
    throw new Error('The service-shuttle recharge selection is invalid. Refresh the console and try again.');
  }
  const binding = captureServiceShuttleRechargeAuthority(session as GameSession, me, command);
  const payload = { sessionId: session.id, ...command };
  const response = await httpsCallable<typeof payload, unknown>(
    functions(), 'rechargeHostConsoleFromShuttle',
  )(payload);
  const value = response.data;
  if (isRecord(value) && value.status === 'stale') {
    const stale = parseStaleReply(value, session.id, me.uid, command);
    if (!stale) throw new Error('The service-shuttle recharge stale response was malformed or mismatched.');
    if (!hasCurrentServiceShuttleRechargeAuthority(binding)) {
      throw new Error('Service-shuttle authority changed while the request was pending.');
    }
    return stale;
  }
  if (!hasCurrentServiceShuttleRechargeAuthority(binding)) {
    throw new Error('Service-shuttle authority changed while the request was pending.');
  }
  const committed = parseCommittedReply(value, session.id, command);
  if (!committed) throw new Error('The service-shuttle recharge response was malformed.');
  return committed;
}
