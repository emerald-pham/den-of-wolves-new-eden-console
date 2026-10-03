import { useEffect, useRef, useState } from 'react';
import { unlockPressAirspace } from '@/lib/airspaceService';
import { useConsoleAccess } from '@/lib/consoleAccess';
import { phaseForSession } from '@/lib/turnPhase';
import { useSessionStore } from '@/store/useSessionStore';
import { AirspaceTimerControls } from './TurnPhaseTimer';
import AirspaceStatusView from './AirspaceStatusView';
import {captureSessionAuthority,hasFreshSessionAuthority,isCurrentSessionAuthority} from '@/lib/sessionMutationAuthority';

/** A deliberately recessed AEGIS system control for the Press-only exception. */
export default function AirspaceControl() {
  const session = useSessionStore((state) => state.session);
  const connection = useSessionStore((state) => state.connection);
  const freshness = useSessionStore((state) => state.sessionSnapshotFreshness);
  const me = useSessionStore((state) => state.me);
  const access = useConsoleAccess();
  const phase = phaseForSession(session);
  const [unlocking, setUnlocking] = useState(false);
  const [error, setError] = useState('');
  const sequence = useRef(0);
  useEffect(() => {
    sequence.current += 1;
    setUnlocking(false);
    setError('');
  }, [session?.id,session?.currentTurn,me?.uid,me?.role,me?.seatId,me?.activeConsoleRoleId,connection,freshness]);
  const restricted = phase?.airspace.state === 'restricted';
  const pressAccess = phase?.airspace.pressAccess === true;
  const current = connection === 'live' && freshness === 'server' && hasFreshSessionAuthority();
  const canUnlock = restricted && !pressAccess && !phase?.timerPause && access.writable && current &&
    !unlocking && Date.now() < Date.parse(phase!.openAirspaceEndsAt);

  async function unlock(): Promise<void> {
    if (!canUnlock) return;
    const attempt = ++sequence.current;
    const authority = session ? captureSessionAuthority(session.id,me?.uid) : undefined;
    const cycle = session?.currentTurn;
    setUnlocking(true);
    setError('');
    try {
      await unlockPressAirspace();
    } catch (cause) {
      if (attempt === sequence.current && isCurrentSessionAuthority(authority) &&
          useSessionStore.getState().session?.currentTurn === cycle)
        setError(cause instanceof Error ? cause.message : 'Current airspace clearance could not be confirmed.');
    } finally {
      if (attempt === sequence.current) setUnlocking(false);
    }
  }

  return (
    <details className="aegis-systems-control">
      <summary>Systems control</summary>
      <section className="airspace-control cic-frame" aria-label="Airspace control">
        <p className="airspace-control__eyebrow">Systems control // flight exclusion</p>
        <h3>Airspace control</h3>
        <AirspaceStatusView phase={phase} current={current} />
        <p>
          Non-affiliated vessels // {pressAccess || phase?.airspace.state === 'lifted'
            ? 'Press clearance authorized'
            : 'Closed'}
        </p>
        <button className="cic-action-button" type="button" disabled={!canUnlock}
          onClick={() => void unlock()}>
          {unlocking ? 'Unlocking airspace…' : pressAccess
            ? 'Press airspace exception authorized'
            : 'Unlock airspace // Press'}
        </button>
        {error && <p role="alert">{error}</p>}
        <AirspaceTimerControls phase={phase} />
        <p className="airspace-control__note">
          Airspace timers and shuttle movement restrictions follow the current CIC clearance.
        </p>
      </section>
    </details>
  );
}
