import { useState } from 'react';
import { unlockPressAirspace } from '@/lib/airspaceService';
import { useConsoleAccess } from '@/lib/consoleAccess';
import { phaseForSession } from '@/lib/turnPhase';
import { useSessionStore } from '@/store/useSessionStore';
import { AirspaceTimerControls } from './TurnPhaseTimer';

/** A deliberately recessed AEGIS system control for the Press-only exception. */
export default function AirspaceControl() {
  const session = useSessionStore((state) => state.session);
  const connection = useSessionStore((state) => state.connection);
  const access = useConsoleAccess();
  const phase = phaseForSession(session);
  const [unlocking, setUnlocking] = useState(false);
  const restricted = phase?.airspace.state === 'restricted';
  const pressAccess = phase?.airspace.pressAccess === true;
  const canUnlock = restricted && !pressAccess && access.writable && connection === 'live' &&
    !unlocking;

  async function unlock(): Promise<void> {
    if (!canUnlock) return;
    setUnlocking(true);
    try {
      await unlockPressAirspace();
    } finally {
      setUnlocking(false);
    }
  }

  return (
    <details className="aegis-systems-control">
      <summary>Systems control</summary>
      <section className="airspace-control cic-frame" aria-label="Airspace control">
        <p className="airspace-control__eyebrow">Systems control // flight exclusion</p>
        <h3>Airspace control</h3>
        <p>
          Non-affiliated vessels // {pressAccess || phase?.airspace.state === 'lifted'
            ? 'Press clearance authorized'
            : 'Restricted'}
        </p>
        <button className="cic-action-button" type="button" disabled={!canUnlock}
          onClick={() => void unlock()}>
          {unlocking ? 'Unlocking airspace…' : pressAccess
            ? 'Press airspace exception authorized'
            : 'Unlock airspace // Press'}
        </button>
        <AirspaceTimerControls phase={phase} />
        <p className="airspace-control__note">
          Airspace timers are automatic. Shuttle movement enforcement is not yet implemented.
        </p>
      </section>
    </details>
  );
}
