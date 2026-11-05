import { useEffect, useRef, useState } from 'react';
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
  const currentAttack = useRef<WolfAttackMemberView | null>(null);
  const pending = useRef(new Map<string, { observed?: () => void; retry: () => void }>());
  const retryAfter = useRef(new Map<string, number>());
  const phase = phaseForSession(session);
  const sessionId = session?.id;

  useEffect(() => {
    let active = true;
    let unsubscribe: (() => void) | undefined;
    currentAttack.current = null;
    setAttack(null);
    if (sessionId && actorUid && connection === 'live') {
      void import('@/lib/firestore').then(({ subscribeWolfAttackMemberView }) => {
        if (active) unsubscribe = subscribeWolfAttackMemberView(sessionId, view => {
          if (active) {
            currentAttack.current = view?.sessionId === sessionId ? view : null;
            setAttack(currentAttack.current);
          }
        });
      }).catch(() => {
        if (active) { currentAttack.current = null; setAttack(null); }
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
    const key = JSON.stringify([sessionId, actorUid, phase.turn, phase.teamPhaseEndsAt]);
    const scheduleRetry = () => {
      if (!cancelled) retry = window.setTimeout(start, 5_000);
    };
    const start = () => {
      if (cancelled) return;
      const latest = useSessionStore.getState();
      const latestPhase = phaseForSession(latest.session);
      if (latest.session?.id !== sessionId || latest.me?.uid !== actorUid || latest.connection !== 'live' ||
        !latestPhase || latestPhase.turn !== phase.turn || latestPhase.teamPhaseEndsAt !== phase.teamPhaseEndsAt ||
        latestPhase.airspace.state === 'lifted' || latestPhase.timerPause) return;
      const latestAttack = currentAttack.current;
      if (latestAttack && latestAttack.sessionId === sessionId && latestAttack.turn === phase.turn &&
        latestAttack.status === 'declared') return;
      const remainingRetry = (retryAfter.current.get(key) ?? 0) - Date.now();
      if (remainingRetry > 0) { retry = window.setTimeout(start, remainingRetry); return; }
      retryAfter.current.delete(key);
      const current = pending.current.get(key);
      if (current) { current.observed = start; current.retry = scheduleRetry; return; }
      const request: { observed?: () => void; retry: () => void } = { retry: scheduleRetry };
      pending.current.set(key, request);
      void beginOpenAirspacePhase(phase.turn).then(() => {
        pending.current.delete(key);
        request.observed?.();
      }, () => {
        retryAfter.current.set(key, Date.now() + 5_000);
        pending.current.delete(key);
        request.retry();
      });
    };
    const delay = Math.max(0, Date.parse(phase.teamPhaseEndsAt) - Date.now());
    const timer = window.setTimeout(start, delay);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      if (retry !== undefined) window.clearTimeout(retry);
    };
  }, [connection, phase, session, sessionId, actorUid, attackLocked]);

  return null;
}
