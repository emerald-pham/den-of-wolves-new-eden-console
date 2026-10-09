import { useEffect, useMemo, useState } from 'react';
import { useSessionStore } from '@/store/useSessionStore';
import { createMissionPreparation, hasMissionPreparationAuthority, PreparationBlockedError } from '@/lib/awayMissionProjectionPreparationService';
import { parseAwayMissionProjectionSafetyFacts } from '@/lib/awayMissionProjectionBarrier';
import type { GameSession } from '@/types/game';

export default function GmMissionPrivacyPreparation({ session, instanceId, onBlockingChange }: Readonly<{
  session: GameSession; instanceId: string; onBlockingChange: (blocked: boolean) => void;
}>) {
  const me = useSessionStore(state => state.me);
  // Authority loss withdraws the visible action, even while an operation awaits its reply.
  useSessionStore(state => state.connection);
  useSessionStore(state => state.sessionSnapshotFreshness);
  useSessionStore(state => state.gmInstance);
  const actorUid = me?.uid ?? '';
  const context = useMemo(() => ({ sessionId: session.id, actorUid, instanceId }), [session.id, actorUid, instanceId]);
  const preparation = useMemo(() => createMissionPreparation(context), [context]);
  const [phase, setPhase] = useState<'idle' | 'pending' | 'blocked' | 'changed' | 'recorded'>(() => preparation.hasSavedAttempt() ? 'blocked' : 'idle');
  const [message, setMessage] = useState('');
  const [epoch, setEpoch] = useState<number | null>(null);
  const [mustRestart, setMustRestart] = useState(false);
  const marker = parseAwayMissionProjectionSafetyFacts(session.awayMissionProjectionSafety);
  const confirmed = marker?.state === 'ready' && (epoch === null || marker.epoch === epoch);
  const blocked = phase !== 'idle' && !(phase === 'recorded' && confirmed);
  const authority = hasMissionPreparationAuthority(context);
  useEffect(() => { onBlockingChange(blocked); }, [blocked, onBlockingChange]);
  const run = async (restart = false) => {
    if (phase === 'pending' || !authority) return;
    setPhase('pending'); setMessage('Preparing participant missions…'); onBlockingChange(true);
    try {
      if (restart) preparation.restart();
      const result = await preparation.run(); setEpoch(result.epoch);
      if (result.state === 'changed') { setPhase('changed'); setMessage('The session changed during preparation. Continue to check it again.'); }
      else { setPhase('recorded'); setMessage('Preparation recorded. Waiting for live session confirmation.'); }
      setMustRestart(false);
    } catch (error) {
      setPhase('blocked'); setMustRestart(error instanceof PreparationBlockedError && error.restart);
      setMessage(error instanceof Error ? error.message : 'Preparation is blocked. Reconnect before retrying.');
    }
  };
  return <section aria-label="Participant mission privacy preparation">
    <h3 className="gm-console__section-title">Participant mission readiness</h3>
    <p className="gm-console__status" role="status" aria-label="Participant mission preparation">
      {phase === 'idle' ? confirmed ? 'Participant missions are prepared.' : 'Prepare participant missions before dealing private cards.' :
        phase === 'recorded' && confirmed ? 'Participant missions are prepared.' : message || 'An exact preparation request is awaiting confirmation.'}
    </p>
    {!confirmed || blocked ? <button type="button" className="cic-action-button" disabled={!authority || phase === 'pending'}
      onClick={() => void run(mustRestart)}>
      {phase === 'pending' ? 'Preparing participant missions…' : mustRestart ? 'Restart preparation' :
        phase === 'changed' ? 'Continue preparation' : preparation.hasSavedAttempt() ? 'Retry preparation' : 'Prepare participant missions'}
    </button> : null}
    {!authority && <p className="gm-console__hint">Reconnect with your current facilitator instance to prepare participant missions.</p>}
  </section>;
}
