import { httpsCallable } from 'firebase/functions';
import { functions } from './firebase';
import { useSessionStore } from '@/store/useSessionStore';
import { requireFreshSessionAuthority } from './sessionMutationAuthority';
import type { VesselActionEnvelope } from '@/types/vesselAction';

interface ShipDamageCommand {
  readonly sessionId: string;
  readonly shipId: string;
  readonly instanceId: string;
  readonly requestId: string;
  readonly expectedRevision: number;
}

export type AssignShipDamageResult =
  | ({ readonly destroyed: true } & VesselActionClientEnvelope)
  | {
    readonly destroyed: false;
    readonly card: {
      readonly card: string;
      readonly systemId: string;
      readonly systemName: string;
    };
    readonly recycled: boolean;
  } & VesselActionClientEnvelope;

type VesselActionClientEnvelope = Partial<VesselActionEnvelope>;

function commandId(): string {
  return window.crypto.randomUUID();
}

async function damageCommand<Result>(shipId: string, callable: string): Promise<Result> {
  const { session, me, gmInstance } = useSessionStore.getState();
  if (!session || me?.role !== 'gm' || !gmInstance) {
    throw new Error('A connected GM instance is required to assign damage.');
  }
  requireFreshSessionAuthority();
  const response = await httpsCallable<ShipDamageCommand, Result>(functions(), callable)({
    sessionId: session.id,
    shipId,
    instanceId: gmInstance.id,
    requestId: commandId(),
    expectedRevision: session.vesselActionRevisions?.[shipId] ?? 0,
  });
  return response.data;
}

export const assignShipDamage = (shipId: string) =>
  damageCommand<AssignShipDamageResult>(shipId, 'addShipDamage');

export async function repairAllShipDamage(shipId: string): Promise<void> {
  await damageCommand<{ readonly repaired: true }>(shipId, 'repairAllShipDamage');
}
