import { httpsCallable } from 'firebase/functions';
import { functions } from './firebase';
import { useSessionStore } from '@/store/useSessionStore';
import { turnPhaseState, turnStateState } from './turnPhase';
import {
  captureSessionAuthority,
  isCurrentSessionAuthority,
  requireFreshSessionAuthority,
} from './sessionMutationAuthority';

/** Grant the SNN Press shuttle the AEGIS exception during the current restricted window. */
export async function unlockPressAirspace(): Promise<void> {
  const store = useSessionStore.getState();
  if (!store.session) {
    throw new Error('Reconnect before changing airspace access.');
  }
  requireFreshSessionAuthority();
  const checkpoint = captureSessionAuthority(
    store.session.id,
    store.me?.uid ?? store.gmInstance?.uid,
  );
  const reply = await httpsCallable<
    { sessionId: string },
    { turnPhase?: unknown; turnState?: unknown }
  >(functions(), 'unlockPressAirspace')({ sessionId: store.session.id });
  const phaseClock = turnPhaseState(reply.data.turnPhase);
  const turnState = turnStateState(reply.data.turnState);
  const activeSession = useSessionStore.getState().session;
  if (phaseClock && activeSession?.id === store.session.id && isCurrentSessionAuthority(checkpoint)) {
    useSessionStore.getState().setSession({
      ...activeSession,
      turnPhase: phaseClock,
      ...(turnState ? { turnState } : {}),
    });
  }
}
