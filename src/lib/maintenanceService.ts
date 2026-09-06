import { httpsCallable } from 'firebase/functions';
import { functions } from './firebase';
import { useSessionStore } from '@/store/useSessionStore';

export interface MaintenanceChoices {
  readonly foodLevel?: number;
  readonly waterLevel?: number;
  readonly consoles?: readonly string[];
  readonly refuels?: Readonly<Record<string, string>>;
}

export async function runMaintenance(shipId: string, action: string, expectedRevision: number, choices: MaintenanceChoices = {}) {
  const { session, gmInstance, connection } = useSessionStore.getState();
  if (!session || connection !== 'live') throw new Error('Reconnect before running maintenance.');
  await httpsCallable(functions(), 'runMaintenance')({
    sessionId: session.id, shipId, action, expectedRevision, ...choices,
    ...(gmInstance ? { instanceId: gmInstance.id } : {}),
  });
  // Only the live session snapshot advances the UI, including when another
  // console submits a step or the reply arrives before the snapshot.
}
