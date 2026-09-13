import { useEffect, useRef, useState } from 'react';
import type { HummingbirdHarvest as HummingbirdHarvestState, ShuttleDocking } from '@/types/game';
import { subscribeHummingbirdHarvest } from '@/lib/firestore';
import { allocateHummingbirdHarvest, rollHummingbirdHarvest } from '@/lib/hummingbirdHarvestService';
import { phaseForSession } from '@/lib/turnPhase';
import { useSessionStore } from '@/store/useSessionStore';

interface Props {
  readonly docking?: ShuttleDocking | undefined;
  readonly fuelled: boolean;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'The Hummingbird action could not be completed.';
}

export default function HummingbirdHarvest({ docking, fuelled }: Props) {
  const session = useSessionStore((state) => state.session);
  const me = useSessionStore((state) => state.me);
  const connection = useSessionStore((state) => state.connection);
  const coordinationBlocked = session?.turnPhase !== undefined &&
    phaseForSession(session)?.airspace.state !== 'lifted';
  const [harvest, setHarvest] = useState<HummingbirdHarvestState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const subscriptionGeneration = useRef(0);
  const explorerEntitled = me?.role === 'player' &&
    me.activeConsoleRoleId === 'quellon-explorer' &&
    typeof me.replacementRoleId !== 'string';

  useEffect(() => {
    const generation = ++subscriptionGeneration.current;
    setHarvest(null);
    setError('');
    if (!session || !me || !explorerEntitled) return undefined;
    const unsubscribe = subscribeHummingbirdHarvest(
      session.id,
      me.uid,
      next => {
        if (subscriptionGeneration.current === generation) setHarvest(next);
      },
      () => undefined,
    );
    return () => {
      if (subscriptionGeneration.current === generation) subscriptionGeneration.current += 1;
      unsubscribe();
    };
  }, [explorerEntitled, me?.activeConsoleRoleId, me?.replacementRoleId, me?.uid, session?.id]);

  // The listener is private, but a previous session or historical console
  // role may still be in React state for one render while identity changes.
  // Bind the visible receipt to the current server identity before exposing
  // dice or allowing a choice.
  const visibleHarvest = explorerEntitled && session && me &&
    harvest?.sessionId === session.id && harvest.ownerUid === me.uid
    ? harvest
    : null;
  const unavailable = !docking || !fuelled || connection !== 'live' || !explorerEntitled || coordinationBlocked;
  const pending = visibleHarvest?.status === 'pending';
  const resolved = visibleHarvest?.status === 'resolved';

  async function roll(): Promise<void> {
    if (busy || unavailable) return;
    setBusy(true);
    setError('');
    try {
      await rollHummingbirdHarvest(visibleHarvest?.revision ?? 0);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }

  async function allocate(foodDieIndex: 0 | 1): Promise<void> {
    if (busy || unavailable || !visibleHarvest || visibleHarvest.status !== 'pending') return;
    setBusy(true);
    setError('');
    try {
      await allocateHummingbirdHarvest(visibleHarvest.revision, foodDieIndex);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="console-workspace__section hummingbird-harvest" aria-label="Hummingbird resource harvesting">
      <h3>Harvest allocation</h3>
      <p className="hummingbird-harvest__guidance">
        Coordination Phase // Fuelled Hummingbird rolls 2d6. Choose one die for food; the other becomes water in Hummingbird cargo.
      </p>
      {!docking && <p role="status">Unavailable // Hummingbird must be docked with a fleet ship.</p>}
      {docking && !fuelled && <p role="status">Unavailable // Hummingbird must be fuelled during the Team Phase.</p>}
      {docking && fuelled && connection !== 'live' && <p role="status">Unavailable // Waiting for the live session connection.</p>}
      {docking && fuelled && connection === 'live' && coordinationBlocked && (
        <p role="status">Unavailable // Hummingbird harvesting requires the Coordination Phase.</p>
      )}
      {docking && fuelled && connection === 'live' && me?.activeConsoleRoleId !== 'quellon-explorer' && (
        <p role="status">Unavailable // The active Quellon Explorer console is required.</p>
      )}
      {harvest === null && !unavailable && (
        <div className="hummingbird-harvest__actions">
          <button className="cic-action-button" type="button" disabled={busy} onClick={() => void roll()}>
            {busy ? 'Rolling…' : 'Roll 2d6 for harvest'}
          </button>
        </div>
      )}
      {!unavailable && pending && visibleHarvest && (
        <div className="hummingbird-harvest__allocation">
          <p role="status">Roll ready // choose which die becomes food.</p>
          <div className="hummingbird-harvest__dice" aria-label="Hummingbird harvest dice">
            {visibleHarvest.rolls.map((die, index) => (
              <button key={`${visibleHarvest.requestId}-${index}`} className="cic-action-button" type="button"
                disabled={busy || unavailable} onClick={() => void allocate(index as 0 | 1)}>
                Die {index + 1}: {die} food / {visibleHarvest.rolls[index === 0 ? 1 : 0]} water
              </button>
            ))}
          </div>
        </div>
      )}
      {!unavailable && resolved && visibleHarvest && (
        <p role="status">Resolved this turn // {visibleHarvest.food} food and {visibleHarvest.water} water added to Hummingbird cargo.</p>
      )}
      {error && <p className="hummingbird-harvest__error" role="alert">{error}</p>}
    </section>
  );
}
