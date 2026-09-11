import { httpsCallable } from 'firebase/functions';
import { functions } from './firebase';
import { useSessionStore } from '@/store/useSessionStore';
import { requireFreshSessionAuthority } from './sessionMutationAuthority';

interface ShipDamageCommand {
  readonly sessionId: string;
  readonly shipId: string;
  readonly instanceId: string;
}

export type AssignShipDamageResult =
  | { readonly destroyed: true }
  | {
    readonly destroyed: false;
    readonly card: {
      readonly card: string;
      readonly systemId: string;
      readonly systemName: string;
    };
    readonly recycled: boolean;
  };

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
  });
  return response.data;
}

export const assignShipDamage = (shipId: string) =>
  damageCommand<AssignShipDamageResult>(shipId, 'addShipDamage');

export async function repairAllShipDamage(shipId: string): Promise<void> {
  await damageCommand<{ readonly repaired: true }>(shipId, 'repairAllShipDamage');
}
