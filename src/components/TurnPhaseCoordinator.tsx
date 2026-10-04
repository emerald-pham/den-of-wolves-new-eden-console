import { useEffect, useState } from 'react';
import { beginOpenAirspacePhase } from '@/lib/sessionService';
import { phaseForSession } from '@/lib/turnPhase';
import { useSessionStore } from '@/store/useSessionStore';
import type { WolfAttackMemberView } from '@/types/game';

/**
 * Any connected fleet screen may perform this idempotent handoff. The callable
 * adjudicates time and membership, so the first browser to reach the team deadline
 * writes the shared result and every other browser follows its snapshot.
 */
export default function TurnPhaseCoordinator() {
  const session = useSessionStore((state) => state.session);
  const connection = useSessionStore((state) => state.connection);
  const actorUid = useSessionStore((state) => state.me?.uid);
  const [attack, setAttack] = useState<WolfAttackMemberView | null>(null);
  const phase = phaseForSession(session);
  const sessionId = session?.id;

  useEffect(() => {
    let active = true;
    let unsubscribe: (() => void) | undefined;
    setAttack(null);
    if (sessionId && actorUid && connection === 'live') {
      void import('@/lib/firestore').then(({ subscribeWolfAttackMemberView }) => {
        if (active) unsubscribe = subscribeWolfAttackMemberView(sessionId, view => {
          if (active) setAttack(view?.sessionId === sessionId ? view : null);
        });
      }).catch(() => {
        if (active) setAttack(null);
      });
    }
    return () => {
      active = false;
      unsubscribe?.();
    };
  }, [sessionId, actorUid, connection]);

  const attackLocked = attack?.sessionId === sessionId && attack?.turn === phase?.turn &&
    attack?.status === 'declared';

  useEffect(() => {
    if (
      !session || !phase || phase.airspace.state === 'lifted' || phase.timerPause ||
      connection !== 'live' || attackLocked
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
  }, [connection, phase, session, attackLocked]);

  return null;
}
