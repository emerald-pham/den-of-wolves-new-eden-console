import { httpsCallable } from 'firebase/functions';
import { functions } from './firebase';
import { requireFreshSessionAuthority } from './sessionMutationAuthority';
import { useSessionStore } from '@/store/useSessionStore';

export interface GorgoneionRepairDronesCommand {
  readonly requestId: string;
  readonly expectedCycle: number;
  readonly expectedRepairRevision: number;
  readonly expectedDockingRevision: number;
  readonly expectedHostShipId: string;
  readonly systemId: string;
}

export interface GorgoneionRepairDronesCommittedResult {
  readonly status: 'committed' | 'replayed';
  readonly hostShipId: string;
  readonly systemId: string;
  readonly materialsSpent: 3;
  readonly materialsRemaining: number;
  readonly cycle: number;
  readonly repairRevision: number;
}

export interface GorgoneionRepairDronesStaleResult {
  readonly status: 'stale';
  readonly hostShipId: string;
  readonly systemId: string;
  readonly cycle: number;
  readonly repairCycle: number;
  readonly repairRevision: number;
}

export type GorgoneionRepairDronesResult =
  | GorgoneionRepairDronesCommittedResult
  | GorgoneionRepairDronesStaleResult;

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return Object.keys(value).length === keys.length && Object.keys(value).every((key) => keys.includes(key));
}

function currentCaptainAuthorityMatches(sessionId: string, uid: string | undefined): boolean {
  const current = useSessionStore.getState();
  return window.navigator.onLine && current.connection === 'live' && current.sessionSnapshotFreshness === 'server' &&
    current.session?.id === sessionId && current.me?.sessionId === sessionId && current.me.uid === uid &&
    current.me.role === 'player' && current.me.replacementRoleId === 'gorgoneion-captain' &&
    current.me.activeConsoleRoleId === null && current.me.seatId === null;
}

export async function repairWithGorgoneionDrones(
  command: GorgoneionRepairDronesCommand,
): Promise<GorgoneionRepairDronesResult> {
  const { session, me } = useSessionStore.getState();
  if (!session) throw new Error('Reconnect before using Gorgoneion Repair Drones.');
  requireFreshSessionAuthority();
  if (!/^[\w-]{1,128}$/.test(command.requestId) ||
      !Number.isSafeInteger(command.expectedCycle) || command.expectedCycle < 1 ||
      !Number.isSafeInteger(command.expectedRepairRevision) || command.expectedRepairRevision < 0 ||
      command.expectedRepairRevision >= Number.MAX_SAFE_INTEGER ||
      !Number.isSafeInteger(command.expectedDockingRevision) || command.expectedDockingRevision < 0 ||
      !/^[\w-]{1,128}$/.test(command.expectedHostShipId) ||
      !/^[\w-]{1,128}$/.test(command.systemId)) {
    throw new Error('The Repair Drones selection is invalid. Refresh the console and try again.');
  }
  const payload = { sessionId: session.id, ...command };
  const response = await httpsCallable<typeof payload, unknown>(
    functions(), 'repairGorgoneionWithDrones',
  )(payload);
  const result = response.data;
  if (!record(result)) {
    throw new Error('The Repair Drones response was malformed.');
  }
  const value = result;
  if (value.status === 'stale') {
    if (!currentCaptainAuthorityMatches(session.id, me?.uid)) {
      throw new Error('The Repair Drones authority changed while the request was pending.');
    }
    const keys = [
      'status', 'sessionId', 'requestId', 'actorUid', 'actorRoleId', 'smallShipId',
      'hostShipId', 'systemId', 'expectedCycle', 'cycle', 'expectedRepairRevision',
      'repairRevision', 'expectedDockingRevision', 'dockingRevision', 'repairCycle',
    ];
    if (!hasExactKeys(value, keys) || me?.role !== 'player' ||
        me.replacementRoleId !== 'gorgoneion-captain' || me.activeConsoleRoleId !== null || me.seatId !== null ||
        value.sessionId !== session.id || value.requestId !== command.requestId ||
        value.actorUid !== me.uid || value.actorRoleId !== me.replacementRoleId ||
        value.smallShipId !== 'gorgoneion' || value.hostShipId !== command.expectedHostShipId ||
        value.systemId !== command.systemId || value.expectedCycle !== command.expectedCycle ||
        value.cycle !== command.expectedCycle ||
        value.expectedRepairRevision !== command.expectedRepairRevision ||
        !Number.isSafeInteger(value.repairRevision) || (value.repairRevision as number) <= command.expectedRepairRevision ||
        value.expectedDockingRevision !== command.expectedDockingRevision ||
        value.dockingRevision !== command.expectedDockingRevision ||
        !Number.isSafeInteger(value.repairCycle) || (value.repairCycle as number) < 0 ||
        (value.repairCycle as number) > command.expectedCycle ||
        (value.repairRevision as number) > (value.repairCycle as number) ||
        (value.repairRevision as number) > command.expectedCycle) {
      throw new Error('The Repair Drones response was malformed.');
    }
    return {
      status: 'stale',
      hostShipId: value.hostShipId as string,
      systemId: value.systemId as string,
      cycle: value.cycle as number,
      repairCycle: value.repairCycle as number,
      repairRevision: value.repairRevision as number,
    };
  }
  if ((value.status !== 'committed' && value.status !== 'replayed') ||
      value.sessionId !== session.id || value.requestId !== command.requestId ||
      value.smallShipId !== 'gorgoneion' || value.hostShipId !== command.expectedHostShipId ||
      value.systemId !== command.systemId || value.materialsSpent !== 3 ||
      !Number.isSafeInteger(value.materialsRemaining) || (value.materialsRemaining as number) < 0 ||
      value.cycle !== command.expectedCycle ||
      !Number.isSafeInteger(value.repairRevision) ||
      value.repairRevision !== command.expectedRepairRevision + 1) {
    throw new Error('The Repair Drones response was malformed.');
  }
  return {
    status: value.status,
    hostShipId: value.hostShipId as string,
    systemId: value.systemId as string,
    materialsSpent: 3,
    materialsRemaining: value.materialsRemaining as number,
    cycle: value.cycle as number,
    repairRevision: value.repairRevision as number,
  };
}
