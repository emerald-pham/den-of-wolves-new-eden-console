import { httpsCallable } from 'firebase/functions';
import { functions } from './firebase';
import { requireFreshSessionAuthority } from './sessionMutationAuthority';
import { useSessionStore } from '@/store/useSessionStore';

export interface AllyRepairCommand {
  readonly requestId: string;
  readonly systemIds: readonly string[];
  readonly expectedControlRevision: number;
  readonly expectedRepairRevision: number;
  readonly expectedCycle: number;
  readonly expectedHostShipId: string;
}

export interface AllyRepairResult {
  readonly status: 'committed' | 'replayed';
  readonly hostShipId: string;
  readonly systemIds: readonly string[];
  readonly materialsRemaining: number;
  readonly cycle: number;
  readonly repairRevision: number;
}

function isSafeCounter(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0;
}

export async function repairConsolesFromAlly(
  command: AllyRepairCommand,
): Promise<AllyRepairResult> {
  const { session } = useSessionStore.getState();
  if (!session) throw new Error('Reconnect before repairing consoles with Ally.');
  requireFreshSessionAuthority();
  if (!/^[\w-]{1,128}$/.test(command.requestId) ||
      !isSafeCounter(command.expectedControlRevision) ||
      !isSafeCounter(command.expectedRepairRevision) ||
      !Number.isSafeInteger(command.expectedCycle) || command.expectedCycle < 1 ||
      command.expectedHostShipId.length === 0 || command.systemIds.length < 1 ||
      command.systemIds.length > 2 ||
      command.systemIds.some((id) => id.length === 0 || id.length > 128) ||
      new Set(command.systemIds).size !== command.systemIds.length) {
    throw new Error('The Ally repair selection is invalid. Refresh the console and try again.');
  }
  const payload = {
    sessionId: session.id,
    requestId: command.requestId,
    systemIds: [...command.systemIds],
    expectedControlRevision: command.expectedControlRevision,
    expectedRepairRevision: command.expectedRepairRevision,
    expectedCycle: command.expectedCycle,
    expectedHostShipId: command.expectedHostShipId,
  };
  const response = await httpsCallable<typeof payload, unknown>(
    functions(), 'repairConsolesFromAlly',
  )(payload);
  const result = response.data;
  const expectedSystemIds = [...command.systemIds].sort();
  if (typeof result !== 'object' || result === null || Array.isArray(result)) {
    throw new Error('The Ally repair response was malformed.');
  }
  const value = result as Record<string, unknown>;
  if ((value.status !== 'committed' && value.status !== 'replayed') ||
      value.sessionId !== session.id || value.requestId !== command.requestId ||
      value.shuttleId !== 'ally' || value.hostShipId !== command.expectedHostShipId ||
      !Array.isArray(value.systemIds) || value.systemIds.length !== expectedSystemIds.length ||
      value.systemIds.some((id, index) => id !== expectedSystemIds[index]) ||
      !Number.isSafeInteger(value.materialsRemaining) || (value.materialsRemaining as number) < 0 ||
      value.cycle !== command.expectedCycle ||
      !Number.isSafeInteger(value.repairRevision) ||
      value.repairRevision !== command.expectedRepairRevision + 1) {
    throw new Error('The Ally repair response was malformed.');
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
