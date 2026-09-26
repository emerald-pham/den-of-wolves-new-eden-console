import { httpsCallable } from 'firebase/functions';
import { functions } from './firebase';
import { hasFreshSessionAuthority, requireFreshSessionAuthority } from './sessionMutationAuthority';
import { useSessionStore } from '@/store/useSessionStore';
import type { GameSession } from '@/types/game';
import {
  isMacawRepairCallableStaleReply,
  type MacawRepairCallableStaleReply,
} from '../../functions/src/macawRepairCallable';

export interface MacawRepairCommand {
  readonly requestId: string;
  readonly systemIds: readonly string[];
  readonly expectedControlRevision: number;
  readonly expectedRepairRevision: number;
  readonly expectedCycle: number;
  readonly expectedHostShipId: string;
}

export interface MacawRepairResult {
  readonly status: 'committed' | 'replayed';
  readonly hostShipId: string;
  readonly systemIds: readonly string[];
  readonly scrapRemaining: number;
  readonly cycle: number;
  readonly repairRevision: number;
}

export type MacawRepairServiceResult = MacawRepairResult | MacawRepairCallableStaleReply;

interface MacawAttemptAuthority {
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

function isSafeCounter(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

function currentMacawDockings(session: GameSession): { readonly shipId: string }[] {
  const rawDockings = (session as unknown as Record<string, unknown>).shuttleDockings;
  if (!Array.isArray(rawDockings) || rawDockings.some((entry) => {
    if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) return true;
    const docking = entry as Record<string, unknown>;
    return typeof docking.shuttleId !== 'string' || !docking.shuttleId.trim() ||
      typeof docking.shipId !== 'string' || !docking.shipId.trim() ||
      typeof docking.dockedAt !== 'string' || !docking.dockedAt.trim() ||
      docking.inTransit === true || docking.transit === true ||
      docking.status === 'in-transit' || docking.state === 'in-transit' ||
      docking.dockingState === 'in-transit';
  })) return [];
  return rawDockings.filter((entry): entry is { readonly shuttleId: string; readonly shipId: string } =>
    (entry as Record<string, unknown>).shuttleId === 'macaw');
}

function hasLiveCoordination(session: GameSession): boolean {
  const cycle = session.currentTurn;
  const phase = session.turnPhase;
  const deadlineValue = phase?.openAirspaceEndsAt;
  if (typeof deadlineValue !== 'string') return false;
  const deadline = Date.parse(deadlineValue);
  return session.phase === 'active' && Number.isSafeInteger(cycle) && (cycle as number) >= 1 &&
    phase?.turn === cycle && phase?.airspace?.state === 'lifted' && phase?.timerPause === undefined &&
    Number.isFinite(deadline) && Date.now() < deadline;
}

function currentAuthorityMatches(attempt: MacawAttemptAuthority, requireCoordination: boolean): boolean {
  const current = useSessionStore.getState();
  const session = current.session as GameSession | undefined;
  const me = current.me;
  const control = session?.shuttleControl?.macaw;
  const macawDockings = session ? currentMacawDockings(session) : [];
  const currentCycle = session?.currentTurn;
  const ledgerRevision = session?.macawRepairs?.revision ?? 0;
  const activeRoleIds = session?.activeRoleIds;
  const activeVesselIds = session?.activeVesselIds;
  return hasFreshSessionAuthority() && session?.id === attempt.sessionId &&
    me?.sessionId === attempt.sessionId && me.uid === attempt.uid && me.role === attempt.role &&
    me.role === 'player' && me.assignedRoleId === attempt.assignedRoleId &&
    me.assignedRoleId === 'capybara-captain' &&
    me.activeConsoleRoleId === attempt.activeConsoleRoleId &&
    me.activeConsoleRoleId === 'capybara-captain' && me.fleetGroupId === attempt.fleetGroupId &&
    session.phase === 'active' && Array.isArray(activeRoleIds) &&
    activeRoleIds.every((roleId) => typeof roleId === 'string') && activeRoleIds.includes('capybara-captain') &&
    Array.isArray(activeVesselIds) && activeVesselIds.every((shipId) => typeof shipId === 'string') &&
    activeVesselIds.includes('capybara') &&
    session.capybaraEnabled !== false && control?.shuttleId === 'macaw' &&
    control.ownerRoleId === 'capybara-captain' && typeof control.ownerUid === 'string' &&
    control.ownerUid.trim().length > 0 && control.ownerUid === attempt.ownerUid &&
    control.holderUid === attempt.uid && isSafeCounter(control.revision) &&
    control.revision >= attempt.expectedControlRevision &&
    macawDockings.length === 1 && macawDockings[0]?.shipId === attempt.expectedHostShipId &&
    activeVesselIds.includes(attempt.expectedHostShipId) &&
    Number.isSafeInteger(currentCycle) && (currentCycle as number) >= attempt.expectedCycle &&
    isSafeCounter(ledgerRevision) && ledgerRevision >= attempt.expectedRepairRevision &&
    (!requireCoordination || hasLiveCoordination(session));
}

function captureAttemptAuthority(
  session: GameSession,
  uid: string,
  command: MacawRepairCommand,
): MacawAttemptAuthority {
  const current = useSessionStore.getState();
  const me = current.me;
  const control = session.shuttleControl?.macaw;
  const macawDockings = currentMacawDockings(session);
  if (!me || me.role !== 'player' || me.assignedRoleId !== 'capybara-captain' ||
      me.activeConsoleRoleId !== 'capybara-captain' || typeof me.fleetGroupId !== 'string' ||
      !me.fleetGroupId.trim() || !control || control.shuttleId !== 'macaw' ||
      control.ownerRoleId !== 'capybara-captain' || typeof control.ownerUid !== 'string' ||
      !control.ownerUid.trim() || control.holderUid !== uid ||
      !isSafeCounter(control.revision) || !control.ownerUid || macawDockings.length !== 1 ||
      macawDockings[0]?.shipId !== command.expectedHostShipId ||
      !hasLiveCoordination(session)) {
    throw new Error('Only the current Capybara Captain holding Macaw at its docked host may repair consoles during Coordination.');
  }
  const attempt: MacawAttemptAuthority = {
    sessionId: session.id,
    uid,
    role: me.role,
    assignedRoleId: me.assignedRoleId,
    activeConsoleRoleId: me.activeConsoleRoleId,
    fleetGroupId: me.fleetGroupId,
    ownerUid: control.ownerUid,
    expectedHostShipId: command.expectedHostShipId,
    expectedControlRevision: command.expectedControlRevision,
    expectedRepairRevision: command.expectedRepairRevision,
    expectedCycle: command.expectedCycle,
  };
  if (!currentAuthorityMatches(attempt, true)) {
    throw new Error('The current Macaw holder, fleet group, dock, or Coordination state is unavailable.');
  }
  return attempt;
}

export async function repairConsolesFromMacaw(
  command: MacawRepairCommand,
): Promise<MacawRepairServiceResult> {
  const { session, me } = useSessionStore.getState();
  if (!session || !me) throw new Error('Reconnect before repairing consoles with Macaw.');
  requireFreshSessionAuthority();
  const sessionId = session.id;
  const uid = me.uid;
  if (!/^[\w-]{1,128}$/.test(command.requestId) ||
      !isSafeCounter(command.expectedControlRevision) ||
      !Number.isSafeInteger(command.expectedRepairRevision) || command.expectedRepairRevision < 0 ||
      command.expectedRepairRevision >= Number.MAX_SAFE_INTEGER ||
      !Number.isSafeInteger(command.expectedCycle) || command.expectedCycle < 1 ||
      !/^[\w-]{1,128}$/.test(command.expectedHostShipId) ||
      command.systemIds.length < 1 || command.systemIds.length > 2 ||
      command.systemIds.some((id) => !/^[\w-]{1,128}$/.test(id)) ||
      new Set(command.systemIds).size !== command.systemIds.length) {
    throw new Error('The Macaw repair selection is invalid. Refresh the console and try again.');
  }
  const attempt = captureAttemptAuthority(session as GameSession, uid, command);
  const payload = {
    sessionId, requestId: command.requestId, systemIds: [...command.systemIds],
    expectedControlRevision: command.expectedControlRevision,
    expectedRepairRevision: command.expectedRepairRevision,
    expectedCycle: command.expectedCycle,
    expectedHostShipId: command.expectedHostShipId,
  };
  const response = await httpsCallable<typeof payload, unknown>(
    functions(), 'repairConsolesFromMacaw',
  )(payload);
  const result = response.data;
  if (typeof result === 'object' && result !== null && !Array.isArray(result) &&
      (result as Record<string, unknown>).status === 'stale') {
    if (!isMacawRepairCallableStaleReply(result, { sessionId, ...command })) {
      throw new Error('The Macaw repair stale response was malformed.');
    }
    if (!currentAuthorityMatches(attempt, true)) {
      throw new Error('Macaw repair authority or Coordination changed while the request was pending.');
    }
    return result;
  }
  if (!currentAuthorityMatches(attempt, false)) {
    throw new Error('Macaw repair authority changed while the request was pending.');
  }
  const expectedSystemIds = [...command.systemIds].sort();
  if (typeof result !== 'object' || result === null || Array.isArray(result)) {
    throw new Error('The Macaw repair response was malformed.');
  }
  const value = result as Record<string, unknown>;
  const fields = [
    'status', 'sessionId', 'requestId', 'shuttleId', 'hostShipId',
    'systemIds', 'scrapRemaining', 'cycle', 'repairRevision',
  ];
  if (Object.keys(value).length !== fields.length || fields.some((key) => !Object.hasOwn(value, key)) ||
      (value.status !== 'committed' && value.status !== 'replayed') ||
      value.sessionId !== sessionId || value.requestId !== command.requestId ||
      value.shuttleId !== 'macaw' || value.hostShipId !== command.expectedHostShipId ||
      !Array.isArray(value.systemIds) || value.systemIds.length !== expectedSystemIds.length ||
      value.systemIds.some((id, index) => id !== expectedSystemIds[index]) ||
      !isSafeCounter(value.scrapRemaining) || value.cycle !== command.expectedCycle ||
      !Number.isSafeInteger(value.repairRevision) ||
      value.repairRevision !== command.expectedRepairRevision + 1) {
    throw new Error('The Macaw repair response was malformed.');
  }
  return {
    status: value.status,
    hostShipId: value.hostShipId as string,
    systemIds: value.systemIds as string[],
    scrapRemaining: value.scrapRemaining as number,
    cycle: value.cycle as number,
    repairRevision: value.repairRevision as number,
  };
}
