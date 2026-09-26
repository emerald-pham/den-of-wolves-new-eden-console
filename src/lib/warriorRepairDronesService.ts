import { httpsCallable } from 'firebase/functions';
import { functions } from './firebase';
import { requireFreshSessionAuthority } from './sessionMutationAuthority';
import { useSessionStore } from '@/store/useSessionStore';

export interface WarriorRepairDronesCommand {
  readonly requestId: string;
  readonly expectedCycle: number;
  readonly expectedRepairRevision: number;
  readonly expectedDockingRevision: number;
  readonly expectedHostShipId: string;
  readonly systemIds: readonly string[];
}

export interface WarriorRepairDronesCommittedResult {
  readonly status: 'committed' | 'replayed';
  readonly hostShipId: string;
  readonly systemIds: readonly string[];
  readonly materialsSpent: 6;
  readonly materialsRemaining: number;
  readonly cycle: number;
  readonly repairRevision: number;
}

export interface WarriorRepairDronesStaleResult {
  readonly status: 'stale';
  readonly hostShipId: string;
  readonly systemIds: readonly string[];
  readonly cycle: number;
  readonly repairCycle: number;
  readonly repairRevision: number;
}

export type WarriorRepairDronesResult =
  | WarriorRepairDronesCommittedResult
  | WarriorRepairDronesStaleResult;

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return Object.keys(value).length === keys.length && Object.keys(value).every((key) => keys.includes(key));
}

export async function repairWithWarriorDrones(
  command: WarriorRepairDronesCommand,
): Promise<WarriorRepairDronesResult> {
  const { session, me } = useSessionStore.getState();
  if (!session) throw new Error('Reconnect before using Warrior Repair Drones.');
  requireFreshSessionAuthority();
  if (!/^[\w-]{1,128}$/.test(command.requestId) ||
      !Number.isSafeInteger(command.expectedCycle) || command.expectedCycle < 1 ||
      !Number.isSafeInteger(command.expectedRepairRevision) || command.expectedRepairRevision < 0 ||
      command.expectedRepairRevision >= Number.MAX_SAFE_INTEGER ||
      !Number.isSafeInteger(command.expectedDockingRevision) || command.expectedDockingRevision < 0 ||
      !/^[\w-]{1,128}$/.test(command.expectedHostShipId) ||
      !Array.isArray(command.systemIds) || command.systemIds.length < 1 || command.systemIds.length > 2 ||
      command.systemIds.some((id) => typeof id !== 'string' || !/^[\w-]{1,128}$/.test(id)) ||
      new Set(command.systemIds).size !== command.systemIds.length) {
    throw new Error('The Repair Drones selection is invalid. Refresh the console and try again.');
  }
  const payload = { sessionId: session.id, ...command };
  const response = await httpsCallable<typeof payload, unknown>(
    functions(), 'repairWarriorWithDrones',
  )(payload);
  const result = response.data;
  if (!record(result)) {
    throw new Error('The Repair Drones response was malformed.');
  }
  const value = result;
  if (value.status === 'stale') {
    const keys = [
      'status', 'sessionId', 'requestId', 'actorUid', 'actorRoleId', 'smallShipId',
      'hostShipId', 'systemIds', 'expectedCycle', 'cycle', 'expectedRepairRevision',
      'repairRevision', 'expectedDockingRevision', 'dockingRevision', 'repairCycle',
    ];
    if (!hasExactKeys(value, keys) || me?.role !== 'player' ||
        me.replacementRoleId !== 'warrior-captain' || me.activeConsoleRoleId !== null || me.seatId !== null ||
        value.sessionId !== session.id || value.requestId !== command.requestId ||
        value.actorUid !== me.uid || value.actorRoleId !== me.replacementRoleId ||
        value.smallShipId !== 'warrior' || value.hostShipId !== command.expectedHostShipId ||
        !Array.isArray(value.systemIds) || value.systemIds.length !== command.systemIds.length ||
        value.systemIds.some((id, index) => id !== command.systemIds[index]) ||
        value.expectedCycle !== command.expectedCycle || value.cycle !== command.expectedCycle ||
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
      systemIds: [...value.systemIds] as string[],
      cycle: value.cycle as number,
      repairCycle: value.repairCycle as number,
      repairRevision: value.repairRevision as number,
    };
  }
  if ((value.status !== 'committed' && value.status !== 'replayed') ||
      value.sessionId !== session.id || value.requestId !== command.requestId ||
      value.smallShipId !== 'warrior' || value.hostShipId !== command.expectedHostShipId ||
      !Array.isArray(value.systemIds) || value.systemIds.length !== command.systemIds.length ||
      value.systemIds.some((id, index) => id !== command.systemIds[index]) ||
      value.materialsSpent !== 6 ||
      !Number.isSafeInteger(value.materialsRemaining) || (value.materialsRemaining as number) < 0 ||
      value.cycle !== command.expectedCycle || !Number.isSafeInteger(value.repairRevision) ||
      value.repairRevision !== command.expectedRepairRevision + 1) {
    throw new Error('The Repair Drones response was malformed.');
  }
  return {
    status: value.status,
    hostShipId: value.hostShipId as string,
    systemIds: [...value.systemIds] as string[],
    materialsSpent: 6,
    materialsRemaining: value.materialsRemaining as number,
    cycle: value.cycle as number,
    repairRevision: value.repairRevision as number,
  };
}
