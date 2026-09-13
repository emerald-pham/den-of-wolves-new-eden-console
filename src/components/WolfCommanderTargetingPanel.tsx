import { useCallback, useEffect, useState } from 'react';
import {
  applyWolfCommanderTargetRerolls,
  getWolfCommanderTargeting,
  type WolfCommanderTargetingReadResult,
} from '@/lib/sessionService';
import { useSessionStore } from '@/store/useSessionStore';
import type { WolfCommanderTargetingView } from '@/types/game';

type WolfCommanderTargetingPanelProps = Readonly<{
  /** Test/fixture seams keep the production component renderable without Firebase state. */
  enabled?: boolean;
  sessionId?: string;
  readTargeting?: typeof getWolfCommanderTargeting;
  rerollTargeting?: typeof applyWolfCommanderTargetRerolls;
}>;

function displayName(value: string): string {
  return value.split('-').map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(' ');
}

function usableView(value: WolfCommanderTargetingReadResult): WolfCommanderTargetingView | null {
  return value.type === 'wolf-commander-targeting-view' ? value : null;
}

/** Private Wolf Commander targeting controls; the GM receipt never enters this component. */
export default function WolfCommanderTargetingPanel({
  enabled,
  sessionId: suppliedSessionId,
  readTargeting = getWolfCommanderTargeting,
  rerollTargeting = applyWolfCommanderTargetRerolls,
}: WolfCommanderTargetingPanelProps = {}) {
  const storeSessionId = useSessionStore((state) => state.session?.id);
  const storeIsCommander = useSessionStore((state) => state.me?.replacementRoleId === 'wolf-commander');
  const sessionId = suppliedSessionId ?? storeSessionId;
  const isCommander = enabled ?? storeIsCommander;
  const [view, setView] = useState<WolfCommanderTargetingView | null>(null);
  const [selected, setSelected] = useState<readonly number[]>([]);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('Refresh after the GM declares a Wolf attack.');

  const refresh = useCallback(async () => {
    if (!isCommander || !sessionId) return;
    setLoading(true);
    try {
      const result = await readTargeting();
      const next = usableView(result);
      setView(next);
      setSelected([]);
      setStatus(next
        ? 'Select any remaining dice, then commit one server-authorized reroll action.'
        : result.type === 'wolf-commander-targeting-unavailable' && result.reason === 'waiting'
          ? 'No targeting window is open yet.'
          : 'Targeting is no longer the active Wolf-attack step.');
    } catch {
      setStatus('Targeting view unavailable // reconnect and refresh.');
    } finally {
      setLoading(false);
    }
  }, [isCommander, readTargeting, sessionId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  if (!isCommander) return null;

  async function rerollSelected(): Promise<void> {
    if (!view || selected.length === 0 || busy) return;
    setBusy(true);
    try {
      const result = await rerollTargeting(view.turn, view.revision, selected);
      setView(result.view);
      setSelected([]);
      setStatus('Rerolls committed privately. Review any remaining eligible dice before AEGIS Command and Control.');
    } catch {
      setStatus('Reroll rejected // refresh the current targeting view and try again.');
    } finally {
      setBusy(false);
    }
  }

  function toggleSelection(rosterIndex: number): void {
    setSelected((current) => current.includes(rosterIndex)
      ? current.filter((index) => index !== rosterIndex)
      : [...current, rosterIndex].sort((left, right) => left - right));
  }

  const eligible = new Set(view?.eligibleRerollIndexes ?? []);

  return (
    <section className="wolf-commander-panel cic-frame" aria-labelledby="wolf-commander-panel-title">
      <header className="wolf-commander-panel__header">
        <div>
          <p className="eyebrow">Private Wolf action</p>
          <h2 id="wolf-commander-panel-title">Targeting dice</h2>
        </div>
        {view && <span className="wolf-commander-panel__revision">Turn {view.turn} // Rev {view.revision}</span>}
      </header>
      <p className="wolf-commander-panel__guidance">
        Choose each die at most once. Rerolls resolve before AEGIS Command and Control; printed Capybara 8 rerolls are automatic and separate.
      </p>
      {view ? (
        <fieldset className="wolf-commander-panel__dice">
          <legend>Choose targeting dice to reroll</legend>
          <ul>
            {view.rolls.map((roll) => {
              const canSelect = eligible.has(roll.rosterIndex);
              return (
                <li key={roll.rosterIndex} className="wolf-commander-panel__die">
                  <label>
                    <input
                      type="checkbox"
                      checked={selected.includes(roll.rosterIndex)}
                      disabled={!canSelect || busy}
                      onChange={() => toggleSelection(roll.rosterIndex)}
                    />
                    <span>
                      <strong>{displayName(roll.shipId)}</strong>
                      <span>Die {roll.die} // {displayName(roll.target)}</span>
                    </span>
                  </label>
                  {!canSelect && <small>REROLL USED</small>}
                </li>
              );
            })}
          </ul>
        </fieldset>
      ) : (
        <p className="wolf-commander-panel__empty">Current targeting dice will appear here after the GM declaration.</p>
      )}
      <div className="wolf-commander-panel__actions">
        <button
          className="cic-action-button cic-action-button--confirm"
          type="button"
          disabled={!view || selected.length === 0 || busy}
          onClick={() => void rerollSelected()}
        >
          {busy ? 'Committing rerolls…' : 'Reroll selected dice'}
        </button>
        <button className="cic-text-button" type="button" disabled={loading || busy} onClick={() => void refresh()}>
          {loading ? 'Refreshing…' : 'Refresh targeting'}
        </button>
      </div>
      <p className="wolf-commander-panel__status" role="status" aria-live="polite">{status}</p>
    </section>
  );
}
