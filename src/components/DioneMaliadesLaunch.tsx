import { useCallback, useEffect, useState } from 'react';
import { getDioneMaliadesLaunch, launchDioneMaliades, passWolfFighterLaunchChoice } from '@/lib/sessionService';
import { useSessionStore } from '@/store/useSessionStore';
import type { DioneMaliadesLaunchView } from '@/types/game';
import './DioneMaliadesLaunch.css';

function statusCopy(view: DioneMaliadesLaunchView | null): string {
  if (!view) return 'Checking battle-table authority…';
  if (view.launched) return `Maliades launched // Cycle ${view.turn}`;
  if (view.choiceStatus === 'passed' || view.reason === 'passed') return 'Launch choice passed for this attack.';
  if (view.choiceStatus === 'unavailable') return 'Maliades could not launch for this attack.';
  if (view.eligible) return 'Fighter Bay 10♦ // charged // operational // launch authorized';
  if (view.reason === 'destroyed') return 'Maliades destroyed // launch denied';
  if (view.reason === 'damaged') return 'Fighter Bay 10♦ // damaged // launch denied';
  if (view.reason === 'uncharged') return 'Fighter Bay 10♦ // uncharged // launch denied';
  return 'Maliades launch // waiting for an active Wolf attack';
}

export interface DioneMaliadesLaunchPanelViewProps {
  readonly view: DioneMaliadesLaunchView | null;
  readonly writable: boolean;
  readonly pending?: boolean;
  readonly error?: string | null;
  readonly onLaunch: (view: DioneMaliadesLaunchView) => void;
  readonly onPass: (view: DioneMaliadesLaunchView) => void;
}

export function DioneMaliadesLaunchPanelView({
  view, writable, pending = false, error, onLaunch, onPass,
}: DioneMaliadesLaunchPanelViewProps) {
  return (
    <section className="cic-frame dione-maliades-launch" aria-label="Maliades launch control">
      <p className="ship-resources__eyebrow">Wolf attack // Dione Fighter Bay</p>
      <h2>Maliades launch</h2>
      <p aria-live="polite">{statusCopy(view)}</p>
      {error && <p role="alert">{error}</p>}
      <div className="dione-maliades-launch__actions">
        <button className="cic-action-button" type="button"
          disabled={!writable || pending || !view?.eligible}
          onClick={() => { if (view?.eligible) onLaunch(view); }}>
          {pending ? 'Launching Maliades…' : view?.launched ? 'Maliades launched' : 'Launch Maliades'}
        </button>
        {view?.eligible && <button className="cic-action-button dione-maliades-launch__pass" type="button"
          disabled={!writable || pending} onClick={() => onPass(view)}>
          Pass Maliades
        </button>}
      </div>
    </section>
  );
}

export default function DioneMaliadesLaunch({ writable }: { writable: boolean }) {
  const session = useSessionStore((state) => state.session);
  const connection = useSessionStore((state) => state.connection);
  const [view, setView] = useState<DioneMaliadesLaunchView | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!session || connection !== 'live') return;
    try {
      const next = await getDioneMaliadesLaunch();
      setView(next);
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Maliades launch authority is unavailable.');
    }
  }, [connection, session]);

  useEffect(() => {
    void refresh();
  }, [refresh, session?.currentTurn, session?.turnPhase?.airspace.state]);

  async function launch(): Promise<void> {
    if (!view?.eligible) return;
    setPending(true);
    setError(null);
    try {
      setView(await launchDioneMaliades(view.turn, view.revision));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Maliades launch failed.');
      await refresh();
    } finally {
      setPending(false);
    }
  }

  async function pass(): Promise<void> {
    if (!view?.eligible) return;
    setPending(true);
    setError(null);
    try {
      await passWolfFighterLaunchChoice('maliades', view.turn, view.revision);
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Maliades pass failed.');
      await refresh();
    } finally {
      setPending(false);
    }
  }

  return <DioneMaliadesLaunchPanelView view={view} writable={writable} pending={pending} error={error}
    onLaunch={() => void launch()} onPass={() => void pass()} />;
}
