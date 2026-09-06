import { httpsCallable } from 'firebase/functions';
import { functions } from './firebase';
import { useSessionStore } from '@/store/useSessionStore';

async function damageCommand(shipId: string, callable: string): Promise<void> {
  const { session, me, gmInstance, connection } = useSessionStore.getState();
  if (!session || connection !== 'live' || me?.role !== 'gm' || !gmInstance) {
    throw new Error('A connected GM instance is required to assign damage.');
  }
  await httpsCallable(functions(), callable)({ sessionId: session.id, shipId, instanceId: gmInstance.id });
}

export const assignShipDamage = (shipId: string) => damageCommand(shipId, 'addShipDamage');
export const repairAllShipDamage = (shipId: string) => damageCommand(shipId, 'repairAllShipDamage');
