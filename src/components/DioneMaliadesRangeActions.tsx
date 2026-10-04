import { useEffect, useState } from 'react';
import './DioneMaliadesRangeActions.css';

export type DioneMaliadesMediumChoiceView = Readonly<{
  kind: 'attack' | 'target-shift';
  targetInstanceId: string;
}> & (Readonly<{ kind: 'attack' }> | Readonly<{ kind: 'target-shift'; shift: -1 | 1 }>);

export interface DioneMaliadesRangeActionView {
  readonly type: 'dione-maliades-range-action-view';
  readonly sessionId: string;
  readonly attackId: string;
  readonly turn: number;
  readonly revision: number;
  readonly range: 'medium-range' | 'short-range';
  readonly choiceStatus: 'pending' | 'committed';
  readonly damage: number;
  readonly destroyed: boolean;
  readonly launched?: boolean;
  readonly targets: readonly Readonly<{ instanceId: string; label: string; targetNumber: number }>[];
}

export interface DioneMaliadesRangeActionPanelViewProps {
  readonly view: DioneMaliadesRangeActionView;
  readonly writable: boolean;
  readonly busy?: boolean;
  readonly message?: string;
  readonly onResolveMedium: (choices: readonly DioneMaliadesMediumChoiceView[]) => void;
  readonly onResolveShort: (targetIds: readonly string[]) => void;
}

export function DioneMaliadesRangeActionPanelView({
  view,
  writable,
  busy = false,
  message,
  onResolveMedium,
  onResolveShort,
}: DioneMaliadesRangeActionPanelViewProps) {
  const [attackTargetId, setAttackTargetId] = useState('');
  const [shiftTargetId, setShiftTargetId] = useState('');
  const [shift, setShift] = useState<'-1' | '1' | ''>('');
  const [shortTargetIds, setShortTargetIds] = useState<readonly string[]>(['', '']);
  const draftKey = JSON.stringify([view.sessionId, view.attackId, view.turn, view.revision, view.range,
    view.choiceStatus, view.targets.map(({ instanceId, targetNumber }) => [instanceId, targetNumber])]);
  useEffect(() => {
    setAttackTargetId('');
    setShiftTargetId('');
    setShift('');
    setShortTargetIds(['', '']);
  }, [draftKey]);

  const locked = view.choiceStatus === 'committed';
  const unavailable = view.launched === false || view.destroyed;
  const mediumTargetsAreDistinct = !attackTargetId || !shiftTargetId || attackTargetId !== shiftTargetId;
  const mediumChoices: DioneMaliadesMediumChoiceView[] = [
    ...(shiftTargetId && (shift === '-1' || shift === '1')
      ? [{ kind: 'target-shift' as const, targetInstanceId: shiftTargetId, shift: Number(shift) as -1 | 1 }] : []),
    ...(attackTargetId ? [{ kind: 'attack' as const, targetInstanceId: attackTargetId }] : []),
  ];
  const validShortTargets = shortTargetIds.filter(Boolean);
  const shortTargetsAreDistinct = new Set(validShortTargets).size === validShortTargets.length;
  const rangeLabel = view.range === 'medium-range' ? 'Medium Range' : 'Short Range';

  return (
    <section className="dione-maliades-range cic-frame" aria-label={`Maliades ${rangeLabel} actions`}>
      <header className="dione-maliades-range__header">
        <div>
          <p className="eyebrow">Cycle {view.turn} // Dione craft</p>
          <h2>Maliades · {rangeLabel}</h2>
        </div>
        <span className="dione-maliades-range__status">{locked ? 'Committed' : 'Choice required'}</span>
      </header>
      <p className="dione-maliades-range__damage" role="status">Maliades // damage {view.damage} of 3</p>
      {unavailable ? (
        <p className="dione-maliades-range__notice" role="status">
          {view.destroyed ? 'Maliades is destroyed and cannot act.' : 'Launch Maliades before choosing range actions.'}
        </p>
      ) : locked ? (
        <p className="dione-maliades-range__notice" role="status">This range choice is committed. The server resolves it once.</p>
      ) : view.range === 'medium-range' ? (
        <>
          <p className="dione-maliades-range__notice">
            Choose an attack, a target shift, both against different targets, or pass. A failed attack damages Maliades.
          </p>
          <label>
            <span>Medium attack target</span>
            <select aria-label="Maliades Medium attack target" value={attackTargetId} disabled={!writable || busy}
              onChange={(event) => setAttackTargetId(event.target.value)}>
              <option value="">No attack</option>
              {view.targets.map(({ instanceId, label }) => <option key={instanceId} value={instanceId}>{label}</option>)}
            </select>
          </label>
          <label>
            <span>Medium target shift target</span>
            <select aria-label="Maliades Medium target shift target" value={shiftTargetId} disabled={!writable || busy}
              onChange={(event) => setShiftTargetId(event.target.value)}>
              <option value="">No target shift</option>
              {view.targets.map(({ instanceId, label, targetNumber }) => (
                <option key={instanceId} value={instanceId}>{label} // target {targetNumber}</option>
              ))}
            </select>
          </label>
          {shiftTargetId && (
            <label>
              <span>Shift direction</span>
              <select aria-label="Maliades Medium target shift" value={shift} disabled={!writable || busy}
                onChange={(event) => setShift(event.target.value === '-1' || event.target.value === '1'
                  ? event.target.value : '')}>
                <option value="">Choose direction</option>
                <option value="-1">−1</option>
                <option value="1">+1</option>
              </select>
            </label>
          )}
          {!mediumTargetsAreDistinct && <p className="dione-maliades-range__error" role="alert">The attack and target shift need different ships.</p>}
          <div className="dione-maliades-range__actions">
            <button type="button" className="cic-action-button" disabled={!writable || busy || mediumChoices.length === 0 ||
              (shiftTargetId !== '' && shift === '') || !mediumTargetsAreDistinct}
              onClick={() => onResolveMedium(mediumChoices)}>
              Commit Maliades Medium choices
            </button>
            <button type="button" className="cic-action-button" disabled={!writable || busy}
              onClick={() => onResolveMedium([])}>Pass Maliades Medium Range</button>
          </div>
        </>
      ) : (
        <>
          <p className="dione-maliades-range__notice">
            Choose up to two different targets. Each die hits on 2+; a 1 damages Maliades.
          </p>
          {[0, 1].map((slot) => (
            <label key={slot}>
              <span>Short attack {slot + 1} target</span>
              <select aria-label={`Maliades Short attack ${slot + 1} target`} value={shortTargetIds[slot] ?? ''}
                disabled={!writable || busy} onChange={(event) => setShortTargetIds((previous) =>
                  previous.map((value, index) => index === slot ? event.target.value : value))}>
                <option value="">No attack</option>
                {view.targets.map(({ instanceId, label }) => <option key={instanceId} value={instanceId}>{label}</option>)}
              </select>
            </label>
          ))}
          {!shortTargetsAreDistinct && <p className="dione-maliades-range__error" role="alert">Choose different targets for the two attacks.</p>}
          <div className="dione-maliades-range__actions">
            <button type="button" className="cic-action-button" disabled={!writable || busy || validShortTargets.length === 0 ||
              !shortTargetsAreDistinct} onClick={() => onResolveShort(validShortTargets)}>
              Resolve Maliades Short attacks
            </button>
            <button type="button" className="cic-action-button" disabled={!writable || busy}
              onClick={() => onResolveShort([])}>Pass Maliades Short Range</button>
          </div>
        </>
      )}
      {message && <p className="dione-maliades-range__message" role="status">{message}</p>}
    </section>
  );
}
