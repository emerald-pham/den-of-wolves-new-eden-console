import { useCallback, useEffect, useState } from 'react';
import { getDioneMaliadesLaunch, launchDioneMaliades } from '@/lib/sessionService';
import { useSessionStore } from '@/store/useSessionStore';
import type { DioneMaliadesLaunchView } from '@/types/game';

function statusCopy(view: DioneMaliadesLaunchView | null): string {
  if (!view) return 'Checking battle-table authority…';
  if (view.launched) return `Maliades launched // Cycle ${view.turn}`;
  if (view.eligible) return 'Fighter Bay 10♦ // charged // operational // launch authorized';
  if (view.reason === 'damaged') return 'Fighter Bay 10♦ // damaged // launch denied';
  if (view.reason === 'uncharged') return 'Fighter Bay 10♦ // uncharged // launch denied';
  return 'Maliades launch // waiting for an active Wolf attack';
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

  return (
    <section className="cic-frame" aria-label="Maliades launch control">
      <p className="ship-resources__eyebrow">Wolf attack // Dione Fighter Bay</p>
      <h2>Maliades launch</h2>
      <p aria-live="polite">{statusCopy(view)}</p>
      {error && <p role="alert">{error}</p>}
      <button
        className="cic-action-button"
        type="button"
        disabled={!writable || pending || !view?.eligible}
        onClick={() => void launch()}
      >
        {pending ? 'Launching Maliades…' : view?.launched ? 'Maliades launched' : 'Launch Maliades'}
      </button>
    </section>
  );
}
