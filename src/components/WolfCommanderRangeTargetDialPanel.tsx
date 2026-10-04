import { useEffect, useState } from 'react';
import { subscribeWolfAttackMemberView } from '@/lib/firestore';
import {
  applyWolfCommanderRangeTargetAdjustment,
  getWolfCommanderRangeTargetDial,
  type WolfCommanderRangeTargetDialView,
} from '@/lib/sessionService';
import type { WolfAttackMemberView } from '@/types/game';
import {
  useWolfAttackChoiceAuthority,
  wolfAttackChoiceAuthorityIsCurrent,
} from '@/lib/wolfAttackChoiceController';

function displayName(value: string): string {
  return value.split('-').map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(' ');
}

function isRangeStep(value: WolfAttackMemberView['currentStep']): boolean {
  return value === 'long-range' || value === 'medium-range' || value === 'short-range';
}

/** Private Commander target dial; source-owned fighter controls remain separate. */
export default function WolfCommanderRangeTargetDialPanel({
  subscribe = subscribeWolfAttackMemberView,
}: Readonly<{ subscribe?: typeof subscribeWolfAttackMemberView }> = {}) {
  const authority = useWolfAttackChoiceAuthority('wolf-commander');
  const [member, setMember] = useState<WolfAttackMemberView | null>(null);
  const [view, setView] = useState<WolfCommanderRangeTargetDialView | null>(null);
  const [selectedIndex, setSelectedIndex] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState(0);

  useEffect(() => {
    setMember(null);
    setView(null);
    setSelectedIndex('');
    setError(null);
    setNotice(null);
    if (!authority.ready || !authority.sessionId) return;
    const key = authority.key;
    const sessionId = authority.sessionId;
    let live = true;
    const stop = subscribe(sessionId, (next) => {
      if (!live || !wolfAttackChoiceAuthorityIsCurrent('wolf-commander', key, sessionId)) return;
      const active = next?.sessionId === sessionId && next.phase === 'active' && next.status === 'declared' &&
        isRangeStep(next.currentStep) && next.range !== null;
      setMember(active ? next : null);
      setView(null);
      setSelectedIndex('');
      setError(null);
      setNotice(null);
    });
    return () => { live = false; stop(); };
  }, [authority.key, authority.ready, authority.sessionId, subscribe]);

  useEffect(() => {
    setView(null);
    setSelectedIndex('');
    if (!authority.ready || !authority.sessionId || !member || !member.range || !isRangeStep(member.currentStep)) return;
    const key = authority.key;
    const sessionId = authority.sessionId;
    let live = true;
    void getWolfCommanderRangeTargetDial().then((next) => {
      if (!live || !wolfAttackChoiceAuthorityIsCurrent('wolf-commander', key, sessionId)) return;
      if (next.sessionId !== member.sessionId || next.attackId !== member.attackId || next.turn !== member.turn ||
          next.revision !== member.revision || next.range !== member.currentStep) {
        setError('The range step changed. Refresh the current attack before adjusting a target.');
        return;
      }
      setView(next);
      setSelectedIndex(next.ships[0] ? String(next.ships[0].rosterIndex) : '');
      setError(null);
    }).catch((cause: unknown) => {
      if (!live || !wolfAttackChoiceAuthorityIsCurrent('wolf-commander', key, sessionId)) return;
      setView(null);
      setError(cause instanceof Error ? cause.message : 'Commander range dial is unavailable.');
    });
    return () => { live = false; };
  }, [authority.key, authority.ready, authority.sessionId, member, refreshToken]);

  if (!authority.actorReady) return null;
  if (!authority.ready) {
    return (
      <section className="wolf-commander-panel cic-frame" aria-label="Wolf Commander range target dial">
        <p className="wolf-commander-panel__status" role="status">
          Waiting for current connected Commander authority before showing range targets.
        </p>
      </section>
    );
  }
  if (!member) return (
    <section className="wolf-commander-panel cic-frame" aria-label="Wolf Commander range target dial">
      <p className="wolf-commander-panel__status" role="status">Waiting for an active attack range.</p>
    </section>
  );

  const selected = view?.ships.find(({ rosterIndex }) => String(rosterIndex) === selectedIndex);
  const direction = 'Move target one step up the ring';

  async function adjust(delta: -1 | 1): Promise<void> {
    if (!view || !selected || view.adjustmentUsed || busy ||
        !wolfAttackChoiceAuthorityIsCurrent('wolf-commander', authority.key, authority.sessionId)) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const result = await applyWolfCommanderRangeTargetAdjustment(view, selected.rosterIndex, delta);
      if (!wolfAttackChoiceAuthorityIsCurrent('wolf-commander', authority.key, authority.sessionId)) return;
      setView({
        ...view,
        revision: result.revision,
        adjustmentUsed: true,
        ships: view.ships.map((ship) => ship.rosterIndex === result.rosterIndex
          ? { ...ship, currentTarget: result.toTarget, currentTargetNumber: result.toTargetNumber }
          : ship),
      });
      setNotice(`Target adjusted // ${displayName(result.fromTarget)} → ${displayName(result.toTarget)}`);
    } catch (cause) {
      if (wolfAttackChoiceAuthorityIsCurrent('wolf-commander', authority.key, authority.sessionId)) {
        setView(null);
        setError(cause instanceof Error ? cause.message : 'The Commander target adjustment was rejected. Refresh before retrying.');
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="wolf-commander-panel cic-frame" aria-labelledby="wolf-range-dial-title">
      <header className="wolf-commander-panel__header">
        <div>
          <p className="eyebrow">Private Wolf action</p>
          <h2 id="wolf-range-dial-title">Range target dial</h2>
        </div>
        <span className="wolf-commander-panel__revision">
          Cycle {member.turn} // Rev {view?.revision ?? member.revision}
        </span>
      </header>
      {view ? <>
        <p className="wolf-commander-panel__guidance">
          Fleet {view.targetGroupId?.replace('fleet-', '') ?? '—'} // {displayName(view.range)} range
        </p>
        <label className="wolf-commander-panel__field">
          Wolf ship
          <select aria-label="Wolf ship" value={selectedIndex} disabled={busy || view.adjustmentUsed}
            onChange={(event) => setSelectedIndex(event.currentTarget.value)}>
            {view.ships.map(({ rosterIndex, shipId }) => (
              <option key={rosterIndex} value={rosterIndex}>{displayName(shipId)}</option>
            ))}
          </select>
        </label>
        {selected && <p className="wolf-commander-panel__status">
          Current target // {displayName(selected.currentTarget)} // {selected.currentTargetNumber}
        </p>}
        <div className="wolf-commander-panel__actions">
          <button className="cic-action-button" type="button" disabled={!selected || busy || view.adjustmentUsed}
            aria-label={direction} onClick={() => void adjust(1)}>
            Adjust +1
          </button>
          <button className="cic-action-button" type="button" disabled={!selected || busy || view.adjustmentUsed}
            aria-label="Move target one step down the ring" onClick={() => void adjust(-1)}>
            Adjust −1
          </button>
        </div>
        {view.adjustmentUsed && <p className="wolf-commander-panel__status" role="status">
          This range adjustment is committed for the current attack.
        </p>}
      </> : <p className="wolf-commander-panel__status" role="status">
        {error ?? 'Reading the current server range target dial…'}
      </p>}
      {notice && <p className="wolf-commander-panel__status" role="status">{notice}</p>}
      {error && view && <p className="wolf-commander-panel__status" role="alert">{error}</p>}
      <button className="cic-text-button" type="button" disabled={busy}
        onClick={() => setRefreshToken((value) => value + 1)}>
        Refresh range dial
      </button>
    </section>
  );
}
