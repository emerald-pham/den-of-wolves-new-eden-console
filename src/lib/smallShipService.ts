import { httpsCallable } from 'firebase/functions';
import { functions } from './firebase';
import { useSessionStore } from '@/store/useSessionStore';
import { requireFreshSessionAuthority } from './sessionMutationAuthority';
import type { SmallShipId } from '@/types/game';

export interface SmallShipMaintenanceChoices {
  readonly foodLevel?: number;
  readonly waterLevel?: number;
  readonly consoles?: readonly string[];
}

function commandId(): string {
  return window.crypto.randomUUID();
}

function requireSession(): { sessionId: string; instanceId?: string } {
  const { session, gmInstance } = useSessionStore.getState();
  if (!session) throw new Error('Reconnect before operating a small ship.');
  requireFreshSessionAuthority();
  return { sessionId: session.id, ...(gmInstance ? { instanceId: gmInstance.id } : {}) };
}

export async function setSmallShipDocking(
  smallShipId: SmallShipId,
  hostShipId: string | null,
  docked: boolean,
  expectedRevision: number,
  requestId = commandId(),
): Promise<unknown> {
  const { session, me, gmInstance } = useSessionStore.getState();
  if (!session || me?.role !== 'gm' || !gmInstance) {
    throw new Error('An active GM instance is required to dock a small ship.');
  }
  requireFreshSessionAuthority();
  const payload = {
    sessionId: session.id, smallShipId, hostShipId, docked,
    expectedRevision, requestId, instanceId: gmInstance.id,
  };
  return (await httpsCallable<typeof payload, unknown>(functions(), 'setSmallShipDocking')(payload)).data;
}

export async function runSmallShipMaintenance(
  smallShipId: SmallShipId,
  action: string,
  expectedRevision: number,
  choices: SmallShipMaintenanceChoices = {},
  requestId = commandId(),
): Promise<unknown> {
  const { sessionId, instanceId } = requireSession();
  const payload = {
    sessionId, smallShipId, action, expectedRevision, requestId, ...choices,
    ...(instanceId ? { instanceId } : {}),
  };
  return (await httpsCallable<typeof payload, unknown>(functions(), 'runSmallShipMaintenance')(payload)).data;
}
