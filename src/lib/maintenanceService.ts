import { httpsCallable } from 'firebase/functions';
import { functions } from './firebase';
import { useSessionStore } from '@/store/useSessionStore';

export interface MaintenanceChoices {
  readonly foodLevel?: number;
  readonly waterLevel?: number;
  readonly consoles?: readonly string[];
  readonly refuels?: Readonly<Record<string, string>>;
}

export async function runMaintenance(shipId: string, action: string, expectedRevision: number, choices: MaintenanceChoices = {}, consoleRoleId?: string) {
  const { session, gmInstance, connection } = useSessionStore.getState();
  if (!session || connection !== 'live') throw new Error('Reconnect before running maintenance.');
  await httpsCallable(functions(), 'runMaintenance')({
    sessionId: session.id, shipId, action, expectedRevision, ...choices,
    ...(consoleRoleId ? { consoleRoleId } : {}),
    ...(gmInstance ? { instanceId: gmInstance.id } : {}),
  });
  // Only the live session snapshot advances the UI, including when another
  // console submits a step or the reply arrives before the snapshot.
}

export async function rollbackMaintenance(shipId: string, expectedRevision: number) {
  const { session, me, gmInstance, connection } = useSessionStore.getState();
  if (!session || me?.role !== 'gm' || !gmInstance || connection !== 'live') {
    throw new Error('A connected GM instance is required to roll back maintenance.');
  }
  await httpsCallable(functions(), 'rollbackMaintenance')({ sessionId: session.id, shipId, expectedRevision, instanceId: gmInstance.id });
}
