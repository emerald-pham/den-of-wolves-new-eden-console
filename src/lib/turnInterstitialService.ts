import { httpsCallable } from 'firebase/functions';
import { functions } from './firebase';
import { useSessionStore } from '@/store/useSessionStore';
import { captureSessionAuthority, isCurrentSessionAuthority, requireFreshSessionAuthority } from './sessionMutationAuthority';
import { replaceTurnStateOnPhase, turnLimitForSession, turnPhaseState, turnStateForPhaseContext } from './turnPhase';
export interface ClearCycleBriefingRequest { readonly expectedCycle: number; readonly expectedPausedAt: string; readonly requestId: string; }
/** Resume an exact committed briefing; a late response cannot replace newer authority. */
export async function clearTurnAdvanceInterstitial(request: ClearCycleBriefingRequest): Promise<void> {
  const store = useSessionStore.getState();
  const session = store.session;
  requireFreshSessionAuthority('Reconnect before clearing the cycle briefing.');
  if (!session || session.currentTurn !== request.expectedCycle ||
      session.turnPhase?.timerPause?.reason !== 'turn-interstitial' || session.turnPhase.timerPause.pausedAt !== request.expectedPausedAt)
    throw new Error('The cycle briefing changed. Wait for the CIC update.');
  const checkpoint = captureSessionAuthority(session.id,store.me?.uid ?? store.gmInstance?.uid);
  const before = session.turnPhase;
  const reply = await httpsCallable<ClearCycleBriefingRequest & {sessionId:string},
    {status:'cleared';cycle:number;pausedAt:string;turnPhase:unknown;turnState?:unknown}>(functions(),'clearTurnAdvanceInterstitial')({...request,sessionId:session.id});
  const active = useSessionStore.getState().session;
  const phase = turnPhaseState(reply.data.turnPhase);
  if (!isCurrentSessionAuthority(checkpoint) || active?.id !== session.id || active.currentTurn !== request.expectedCycle ||
      active.turnPhase?.timerPause?.pausedAt !== before.timerPause?.pausedAt ||
      active.turnPhase?.teamPhaseEndsAt !== before.teamPhaseEndsAt || active.turnPhase?.openAirspaceEndsAt !== before.openAirspaceEndsAt ||
      reply.data.status !== 'cleared' || reply.data.cycle !== request.expectedCycle || reply.data.pausedAt !== request.expectedPausedAt ||
      !phase || phase.turn !== request.expectedCycle) return;
  const entity = turnStateForPhaseContext(reply.data.turnState,phase,active.currentTurn,turnLimitForSession(active));
  useSessionStore.getState().setSession(replaceTurnStateOnPhase(active,phase,entity));
}
