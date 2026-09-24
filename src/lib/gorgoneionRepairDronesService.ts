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

export interface GorgoneionRepairDronesResult {
  readonly status: 'committed' | 'replayed';
  readonly hostShipId: string;
  readonly systemId: string;
  readonly materialsSpent: 3;
  readonly materialsRemaining: number;
  readonly cycle: number;
  readonly repairRevision: number;
}

export async function repairWithGorgoneionDrones(
  command: GorgoneionRepairDronesCommand,
): Promise<GorgoneionRepairDronesResult> {
  const { session } = useSessionStore.getState();
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
  if (typeof result !== 'object' || result === null || Array.isArray(result)) {
    throw new Error('The Repair Drones response was malformed.');
  }
  const value = result as Record<string, unknown>;
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
