import { useState } from 'react';
import { unlockPressAirspace } from '@/lib/airspaceService';
import { useConsoleAccess } from '@/lib/consoleAccess';
import { phaseForSession } from '@/lib/turnPhase';
import { useSessionStore } from '@/store/useSessionStore';
import { AirspaceTimerControls } from './TurnPhaseTimer';
import AirspaceStatusView from './AirspaceStatusView';

/** A deliberately recessed AEGIS system control for the Press-only exception. */
export default function AirspaceControl() {
  const session = useSessionStore((state) => state.session);
  const connection = useSessionStore((state) => state.connection);
  const freshness = useSessionStore((state) => state.sessionSnapshotFreshness);
  const access = useConsoleAccess();
  const phase = phaseForSession(session);
  const [unlocking, setUnlocking] = useState(false);
  const [error, setError] = useState('');
  const restricted = phase?.airspace.state === 'restricted';
  const pressAccess = phase?.airspace.pressAccess === true;
  const current = connection === 'live' && freshness === 'server';
  const canUnlock = restricted && !pressAccess && !phase?.timerPause && access.writable && current &&
    !unlocking && Date.now() < Date.parse(phase!.openAirspaceEndsAt);

  async function unlock(): Promise<void> {
    if (!canUnlock) return;
    setUnlocking(true);
    setError('');
    try {
      await unlockPressAirspace();
    } catch (cause) {
      if (useSessionStore.getState().session?.id === session?.id)
        setError(cause instanceof Error ? cause.message : 'Current airspace clearance could not be confirmed.');
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
