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

export interface WarriorRepairDronesResult {
  readonly status: 'committed' | 'replayed';
  readonly hostShipId: string;
  readonly systemIds: readonly string[];
  readonly materialsSpent: 6;
  readonly materialsRemaining: number;
  readonly cycle: number;
  readonly repairRevision: number;
}

export async function repairWithWarriorDrones(
  command: WarriorRepairDronesCommand,
): Promise<WarriorRepairDronesResult> {
  const { session } = useSessionStore.getState();
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
  if (typeof result !== 'object' || result === null || Array.isArray(result)) {
    throw new Error('The Repair Drones response was malformed.');
  }
  const value = result as Record<string, unknown>;
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
