import { useEffect } from 'react';
import { beginOpenAirspacePhase } from '@/lib/sessionService';
import { phaseForSession } from '@/lib/turnPhase';
import { useSessionStore } from '@/store/useSessionStore';

/**
 * Any connected fleet screen may perform this idempotent handoff. The callable
 * adjudicates time and membership, so the first browser to reach the team deadline
 * writes the shared result and every other browser follows its snapshot.
 */
export default function TurnPhaseCoordinator() {
  const session = useSessionStore((state) => state.session);
  const connection = useSessionStore((state) => state.connection);
  const phase = phaseForSession(session);

  useEffect(() => {
    if (
      !session || !phase || phase.airspace.state === 'lifted' || phase.timerPause ||
      connection !== 'live'
    ) {
      return undefined;
    }
    let cancelled = false;
    let retry: number | undefined;
    const start = () => {
      void beginOpenAirspacePhase(phase.turn).catch(() => {
        if (!cancelled) retry = window.setTimeout(start, 5_000);
      });
    };
    const delay = Math.max(0, Date.parse(phase.teamPhaseEndsAt) - Date.now());
    const timer = window.setTimeout(start, delay);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      if (retry !== undefined) window.clearTimeout(retry);
    };
  }, [connection, phase, session]);

  return null;
}
