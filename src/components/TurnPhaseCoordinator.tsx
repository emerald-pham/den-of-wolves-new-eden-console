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
  const freshness = useSessionStore((state) => state.sessionSnapshotFreshness);
  const actorUid = useSessionStore((state) => state.me?.uid);
  const [attack, setAttack] = useState<WolfAttackMemberView | null>(null);
  const phase = phaseForSession(session);
  const sessionId = session?.id;
  const pendingHandoff = useRef<{ key: string; settled: Promise<void> } | null>(null);

  useEffect(() => {
    let active = true;
    let unsubscribe: (() => void) | undefined;
    setAttack(null);
    if (sessionId && actorUid && connection === 'live' && session?.phase !== 'closed') {
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
  }, [session?.phase, sessionId, actorUid, connection]);

  const attackLocked = attack?.sessionId === sessionId && attack?.turn === phase?.turn &&
    attack?.status === 'declared';

  const sessionPhase = session?.phase;
  const cycle = phase?.turn;
  const teamPhaseEndsAt = phase?.teamPhaseEndsAt;
  const airspaceState = phase?.airspace.state;
  const paused = Boolean(phase?.timerPause);
  const manual = phase?.progression === 'manual';

  useEffect(() => {
    if (
      !sessionId || !actorUid || cycle === undefined || !teamPhaseEndsAt ||
      sessionPhase === 'closed' || airspaceState === 'lifted' || paused || manual ||
      connection !== 'live' || attackLocked
    ) {
      return undefined;
    }
    const key = JSON.stringify([sessionId, actorUid, cycle]);
    // Store publication can precede this effect's cleanup. Read its current
    // scope and clock before dispatch or retry, never a settled reply as proof.
    const stillEligible = () => {
      const current = useSessionStore.getState();
      const currentPhase = phaseForSession(current.session);
      return current.session?.id === sessionId && current.me?.uid === actorUid &&
        current.session.phase !== 'closed' && currentPhase?.turn === cycle &&
        currentPhase.airspace.state === 'restricted' && !currentPhase.timerPause &&
        currentPhase.progression !== 'manual' && current.connection === 'live' &&
        !attackLocked && Date.now() >= Date.parse(currentPhase.teamPhaseEndsAt);
    };
    let cancelled = false;
    let timer: number | undefined;
    const schedule = (delay: number) => {
      timer = window.setTimeout(() => { timer = undefined; void start(); }, delay);
    };
    const start = async () => {
      if (cancelled || !stillEligible()) return;
      // Retiring a timer cannot cancel an already-dispatched callable. A new
      // eligible effect waits for it rather than overlapping the same handoff.
      const pending = pendingHandoff.current;
      if (pending) {
        await pending.settled;
        if (cancelled || !stillEligible()) return;
        if (pending.key === key) {
          schedule(5_000);
          return;
        }
      }
      if (cancelled || !stillEligible()) return;
      const current = { key, settled: beginOpenAirspacePhase(cycle).catch(() => undefined) };
      pendingHandoff.current = current;
      await current.settled;
      if (pendingHandoff.current === current) pendingHandoff.current = null;
      // Fulfilled void may be a guarded no-op or an ignored obsolete reply.
      // Only the current published phase cancels this controlled retry.
      if (!cancelled && stillEligible()) schedule(5_000);
    };
    schedule(Math.max(0, Date.parse(teamPhaseEndsAt) - Date.now()));
    return () => {
      cancelled = true;
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [connection, freshness, sessionId, actorUid, sessionPhase, cycle, teamPhaseEndsAt,
    airspaceState, paused, manual, attackLocked]);

  return null;
}
