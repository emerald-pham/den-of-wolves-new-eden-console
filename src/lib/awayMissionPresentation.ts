import type { GameSession } from '@/types/game';
import { phaseForSession } from './turnPhase';
/** Presentation only: authority and card/deck transitions remain server commands. */
export function missionOverrunForCurrentPhase<T extends { readonly status: string; readonly overrun: boolean }>(
  state: T, sourceCycle: number | undefined, session: GameSession | null,
): T | (Omit<T, 'overrun'> & { readonly overrun: true }) {
  const phase = phaseForSession(session);
  const cycle = session?.currentTurn;
  if (state.overrun || state.status !== 'active' || !Number.isSafeInteger(sourceCycle) || (sourceCycle ?? 0) < 1 ||
      !Number.isSafeInteger(cycle) || (cycle ?? 0) < 1 || !phase ||
      !((sourceCycle ?? 0) < (cycle ?? 0) || (sourceCycle === cycle && phase.airspace.state === 'lifted'))) return state;
  return { ...state, overrun: true };
}
