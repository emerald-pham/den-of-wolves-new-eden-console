import { httpsCallable } from 'firebase/functions';
import { functions } from './firebase';
import { useSessionStore } from '@/store/useSessionStore';
import { turnPhaseState } from './turnPhase';

/** Grant the SNN Press shuttle the AEGIS exception during the current restricted window. */
export async function unlockPressAirspace(): Promise<void> {
  const store = useSessionStore.getState();
  if (!store.session || store.connection !== 'live') {
    throw new Error('Reconnect before changing airspace access.');
  }
  const reply = await httpsCallable<
    { sessionId: string },
    { turnPhase?: unknown }
  >(functions(), 'unlockPressAirspace')({ sessionId: store.session.id });
  const phaseClock = turnPhaseState(reply.data.turnPhase);
  const activeSession = useSessionStore.getState().session;
  if (phaseClock && activeSession?.id === store.session.id) {
    useSessionStore.getState().setSession({ ...activeSession, turnPhase: phaseClock });
  }
}
