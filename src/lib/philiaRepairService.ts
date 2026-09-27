import { httpsCallable } from 'firebase/functions';
import { functions } from './firebase';
import { hasFreshSessionAuthority, requireFreshSessionAuthority } from './sessionMutationAuthority';
import { turnPhaseState } from './turnPhase';
import { useSessionStore } from '@/store/useSessionStore';
import { CONSOLE_ROLES } from '@/data/roles';
import type { GameSession, Player } from '@/types/game';

const knownRoleIds = new Set(CONSOLE_ROLES.map(({ id }) => id));

export interface PhiliaRepairCommand {
  readonly requestId: string;
  readonly systemIds: readonly string[];
  readonly expectedControlRevision: number;
  readonly expectedRepairRevision: number;
  readonly expectedCycle: number;
  readonly expectedHostShipId: string;
}

export interface PhiliaRepairResult {
  readonly status: 'committed' | 'replayed';
  readonly hostShipId: string;
  readonly systemIds: readonly string[];
  readonly materialsRemaining: number;
  readonly cycle: number;
  readonly repairRevision: number;
}

export interface PhiliaRepairStaleResult {
  readonly status: 'stale';
  readonly sessionId: string;
  readonly requestId: string;
  readonly shuttleId: 'philia';
  readonly expectedHostShipId: string;
  readonly systemIds: readonly string[];
  readonly expectedControlRevision: number;
  readonly currentControlRevision: number;
  readonly expectedRepairRevision: number;
  readonly currentRepairRevision: number;
  readonly expectedCycle: number;
  readonly currentCycle: number;
}

export type PhiliaRepairServiceResult = PhiliaRepairResult | PhiliaRepairStaleResult;

export interface PhiliaRepairAuthorityBinding {
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

function repairLedgerRevision(value: unknown): number | null {
  if (value === undefined) return 0;
  if (!isRecord(value) || Object.keys(value).some((key) => !['cycle', 'revision', 'hosts'].includes(key)) ||
      !Number.isSafeInteger(value.cycle) || (value.cycle as number) < 1 ||
      !isSafeCounter(value.revision) || (value.revision as number) < 1 ||
      !Array.isArray(value.hosts) || value.hosts.length < 1 || value.hosts.length > 2) return null;
  const seenShips = new Set<string>();
  for (const host of value.hosts) {
    if (!isRecord(host) || Object.keys(host).some((key) => !['shipId', 'systemIds'].includes(key)) ||
        typeof host.shipId !== 'string' || !host.shipId.trim() || seenShips.has(host.shipId) ||
        !Array.isArray(host.systemIds) || host.systemIds.length < 1 || host.systemIds.length > 2 ||
        host.systemIds.some((id) => typeof id !== 'string' || !id.trim()) ||
        new Set(host.systemIds).size !== host.systemIds.length) return null;
    seenShips.add(host.shipId);
  }
  return value.revision as number;
}

function currentPhiliaDockings(session: GameSession): readonly { readonly shipId: string }[] | null {
  const raw = (session as unknown as Record<string, unknown>).shuttleDockings;
  if (!Array.isArray(raw) || raw.some((entry) => {
    if (!isRecord(entry)) return true;
    return typeof entry.shuttleId !== 'string' || !entry.shuttleId.trim() ||
      typeof entry.shipId !== 'string' || !entry.shipId.trim() ||
      typeof entry.dockedAt !== 'string' || !entry.dockedAt.trim() ||
      entry.inTransit === true || entry.transit === true || entry.status === 'in-transit' ||
      entry.state === 'in-transit' || entry.dockingState === 'in-transit';
  })) return null;
  return raw.filter((entry): entry is { readonly shuttleId: string; readonly shipId: string } =>
    isRecord(entry) && entry.shuttleId === 'philia');
}

function hasLiveCoordination(session: GameSession): boolean {
  const cycle = session.currentTurn;
  const phase = turnPhaseState(session.turnPhase);
  if (!phase || !Number.isSafeInteger(cycle) || (cycle as number) < 1) return false;
  const deadline = Date.parse(phase.openAirspaceEndsAt);
  return session.phase === 'active' && phase.turn === cycle && phase.airspace.state === 'lifted' &&
    phase.timerPause === undefined && Number.isFinite(deadline) && Date.now() < deadline;
}

/** The current projection, role, group, holder, and dock must still authorize this repair. */
export function hasCurrentPhiliaRepairAuthority(
  binding: PhiliaRepairAuthorityBinding,
): boolean {
  const current = useSessionStore.getState();
  const session = current.session as GameSession | undefined;
  const me = current.me;
  if (!session || !me || !hasFreshSessionAuthority()) return false;
  const control = session.shuttleControl?.philia;
  const dockings = currentPhiliaDockings(session);
  const activeRoles = session.activeRoleIds;
  const activeVessels = session.activeVesselIds;
  const projection = session.playerDiscovery;
  const ledgerRevision = repairLedgerRevision(session.philiaRepairs);
  const currentCycle = session.currentTurn;
  const groupVessels = projection?.fleetGroupVesselIds;
  return session.id === binding.sessionId && me.sessionId === binding.sessionId &&
    me.uid === binding.uid && me.role === binding.role && me.role === 'player' &&
    me.assignedRoleId === binding.assignedRoleId && me.assignedRoleId === 'dione-engineer' &&
    me.activeConsoleRoleId === binding.activeConsoleRoleId &&
    me.activeConsoleRoleId === 'dione-engineer' && me.escapeState == null &&
    me.fleetGroupId === binding.fleetGroupId && typeof binding.fleetGroupId === 'string' &&
    binding.fleetGroupId.trim().length > 0 && session.phase === 'active' &&
    Array.isArray(activeRoles) && activeRoles.every((roleId) =>
      typeof roleId === 'string' && knownRoleIds.has(roleId)) &&
    activeRoles.includes('dione-engineer') && Array.isArray(activeVessels) &&
    activeVessels.every((shipId) => typeof shipId === 'string') &&
    new Set(activeVessels).size === activeVessels.length && activeVessels.includes('dione') &&
    activeVessels.includes(binding.expectedHostShipId) &&
    projection?.groupId === binding.fleetGroupId && Array.isArray(groupVessels) &&
    groupVessels.every((shipId) => typeof shipId === 'string') &&
    groupVessels.includes(binding.expectedHostShipId) &&
    control?.shuttleId === 'philia' && control.ownerRoleId === 'dione-engineer' &&
    typeof control.ownerUid === 'string' && control.ownerUid.trim().length > 0 &&
    control.ownerUid === binding.ownerUid && control.holderUid === binding.uid &&
    isSafeCounter(control.revision) && control.revision >= binding.expectedControlRevision &&
    dockings !== null && dockings.length === 1 &&
    dockings[0]?.shipId === binding.expectedHostShipId && ledgerRevision !== null &&
    ledgerRevision >= binding.expectedRepairRevision &&
    Number.isSafeInteger(currentCycle) && (currentCycle as number) >= binding.expectedCycle &&
    hasLiveCoordination(session);
}

export function capturePhiliaRepairAuthority(
  session: GameSession,
  me: Player,
  command: PhiliaRepairCommand,
): PhiliaRepairAuthorityBinding {
  const control = session.shuttleControl?.philia;
  const fleetGroupId = me.fleetGroupId;
  if (!control || typeof control.ownerUid !== 'string' || !control.ownerUid.trim() ||
      typeof fleetGroupId !== 'string' || !fleetGroupId.trim()) {
    throw new Error('The current Philia holder, fleet group, or dock is unavailable.');
  }
  const binding: PhiliaRepairAuthorityBinding = {
    sessionId: session.id, uid: me.uid, role: me.role,
    assignedRoleId: me.assignedRoleId, activeConsoleRoleId: me.activeConsoleRoleId,
    fleetGroupId, ownerUid: control.ownerUid, expectedHostShipId: command.expectedHostShipId,
    expectedControlRevision: command.expectedControlRevision,
    expectedRepairRevision: command.expectedRepairRevision,
    expectedCycle: command.expectedCycle,
  };
  if (!hasCurrentPhiliaRepairAuthority(binding)) {
    throw new Error('Only the current Dione Engineer holding Philia at its in-group dock may repair during Coordination.');
  }
  return binding;
}

function parseStaleReply(
  value: unknown,
  sessionId: string,
  command: PhiliaRepairCommand,
): PhiliaRepairStaleResult | undefined {
  if (!isRecord(value)) return undefined;
  const keys = [
    'status', 'sessionId', 'requestId', 'shuttleId', 'expectedHostShipId', 'systemIds',
    'expectedControlRevision', 'currentControlRevision', 'expectedRepairRevision',
    'currentRepairRevision', 'expectedCycle', 'currentCycle',
  ];
  const expectedSystemIds = [...command.systemIds].sort();
  if (Object.keys(value).length !== keys.length || keys.some((key) => !Object.hasOwn(value, key)) ||
      value.status !== 'stale' || value.sessionId !== sessionId || value.requestId !== command.requestId ||
      value.shuttleId !== 'philia' || value.expectedHostShipId !== command.expectedHostShipId ||
      !Array.isArray(value.systemIds) || value.systemIds.length !== expectedSystemIds.length ||
      value.systemIds.some((id, index) => id !== expectedSystemIds[index]) ||
      value.expectedControlRevision !== command.expectedControlRevision ||
      value.expectedRepairRevision !== command.expectedRepairRevision ||
      value.expectedCycle !== command.expectedCycle ||
      !isSafeCounter(value.currentControlRevision) ||
      value.currentControlRevision < command.expectedControlRevision ||
      !isSafeCounter(value.currentRepairRevision) ||
      value.currentRepairRevision < command.expectedRepairRevision ||
      !Number.isSafeInteger(value.currentCycle) ||
      (value.currentCycle as number) < command.expectedCycle ||
      (value.currentControlRevision === command.expectedControlRevision &&
        value.currentRepairRevision === command.expectedRepairRevision &&
        value.currentCycle === command.expectedCycle)) return undefined;
  return value as unknown as PhiliaRepairStaleResult;
}

export async function repairConsolesFromPhilia(
  command: PhiliaRepairCommand,
): Promise<PhiliaRepairServiceResult> {
  const { session, me } = useSessionStore.getState();
  if (!session || !me) throw new Error('Reconnect before repairing consoles with Philia.');
  requireFreshSessionAuthority();
  if (!/^[\w-]{1,128}$/.test(command.requestId) ||
      !isSafeCounter(command.expectedControlRevision) ||
      !Number.isSafeInteger(command.expectedRepairRevision) || command.expectedRepairRevision < 0 ||
      command.expectedRepairRevision >= Number.MAX_SAFE_INTEGER ||
      !Number.isSafeInteger(command.expectedCycle) || command.expectedCycle < 1 ||
      !/^[\w-]{1,128}$/.test(command.expectedHostShipId) || command.systemIds.length < 1 ||
      command.systemIds.length > 2 ||
      command.systemIds.some((id) => !/^[\w-]{1,128}$/.test(id)) ||
      new Set(command.systemIds).size !== command.systemIds.length) {
    throw new Error('The Philia repair selection is invalid. Refresh the console and try again.');
  }
  const sessionId = session.id;
  const authority = capturePhiliaRepairAuthority(session as GameSession, me, command);
  const payload = {
    sessionId, requestId: command.requestId, systemIds: [...command.systemIds],
    expectedControlRevision: command.expectedControlRevision,
    expectedRepairRevision: command.expectedRepairRevision,
    expectedCycle: command.expectedCycle,
    expectedHostShipId: command.expectedHostShipId,
  };
  const response = await httpsCallable<typeof payload, unknown>(
    functions(), 'repairConsolesFromPhilia',
  )(payload);
  const value = response.data;
  if (isRecord(value) && value.status === 'stale') {
    const stale = parseStaleReply(value, sessionId, command);
    if (!stale) throw new Error('The Philia repair stale response was malformed or mismatched.');
    if (!hasCurrentPhiliaRepairAuthority(authority)) {
      throw new Error('Philia repair authority or Coordination changed while the request was pending.');
    }
    return stale;
  }
  if (!hasCurrentPhiliaRepairAuthority(authority)) {
    throw new Error('Philia repair authority changed while the request was pending.');
  }
  const keys = [
    'status', 'sessionId', 'requestId', 'shuttleId', 'hostShipId',
    'systemIds', 'materialsRemaining', 'cycle', 'repairRevision',
  ];
  const expectedSystemIds = [...command.systemIds].sort();
  if (!isRecord(value) || Object.keys(value).length !== keys.length ||
      keys.some((key) => !Object.hasOwn(value, key)) ||
      (value.status !== 'committed' && value.status !== 'replayed') ||
      value.sessionId !== sessionId || value.requestId !== command.requestId ||
      value.shuttleId !== 'philia' || value.hostShipId !== command.expectedHostShipId ||
      !Array.isArray(value.systemIds) || value.systemIds.length !== expectedSystemIds.length ||
      value.systemIds.some((id, index) => id !== expectedSystemIds[index]) ||
      !isSafeCounter(value.materialsRemaining) || value.cycle !== command.expectedCycle ||
      !Number.isSafeInteger(value.repairRevision) ||
      value.repairRevision !== command.expectedRepairRevision + 1) {
    throw new Error('The Philia repair response was malformed.');
  }
  return {
    status: value.status,
    hostShipId: value.hostShipId as string,
    systemIds: value.systemIds as string[],
    materialsRemaining: value.materialsRemaining as number,
    cycle: value.cycle as number,
    repairRevision: value.repairRevision as number,
  };
}
