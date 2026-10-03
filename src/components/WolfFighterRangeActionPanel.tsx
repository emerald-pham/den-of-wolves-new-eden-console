import { useEffect, useMemo, useState } from 'react';
import './WolfFighterRangeActionPanel.css';

export type WolfFighterMediumAction = Readonly<{
  fighterIndex: number;
  targetInstanceId: string;
}> & (
  | Readonly<{ kind: 'attack' }>
  | Readonly<{ kind: 'target-shift'; targetNumber: number; shift: -1 | 1 }>
);

export interface WolfFighterRangeActionView {
  readonly type: 'wolf-fighter-range-action-view';
  readonly sessionId: string;
  readonly attackId: string;
  readonly turn: number;
  readonly revision: number;
  readonly wingId: string;
  readonly wingLabel: string;
  readonly range: 'medium-range' | 'short-range';
  readonly choiceStatus: 'pending' | 'committed';
  readonly fighters: readonly Readonly<{ fighterIndex: number }>[];
  readonly targets: readonly Readonly<{
    instanceId: string;
    label: string;
    targetNumber: number;
  }>[];
  readonly launched?: boolean;
}

type DraftAction = Readonly<{
  kind?: 'attack' | 'target-shift';
  targetInstanceId?: string;
  shift?: -1 | 1;
}>;

export interface WolfFighterRangeActionPanelViewProps {
  readonly view: WolfFighterRangeActionView;
  readonly onResolveMedium: (actions: readonly WolfFighterMediumAction[]) => void;
  readonly onResolveShort: () => void;
  readonly busy?: boolean;
  readonly message?: string;
}

export function WolfFighterRangeActionPanelView({
  view,
  onResolveMedium,
  onResolveShort,
  busy = false,
  message,
}: WolfFighterRangeActionPanelViewProps) {
  const [draft, setDraft] = useState<Readonly<Record<number, DraftAction>>>({});
  const draftKey = JSON.stringify([
    view.sessionId, view.attackId, view.turn, view.revision, view.wingId,
    view.range, view.choiceStatus, view.fighters.map(({ fighterIndex }) => fighterIndex),
    view.targets.map(({ instanceId, targetNumber }) => [instanceId, targetNumber]),
  ]);
  useEffect(() => setDraft({}), [draftKey]);

  const mediumActions = useMemo(() => view.fighters.map(({ fighterIndex }) => {
    const selection = draft[fighterIndex];
    const target = view.targets.find(({ instanceId }) => instanceId === selection?.targetInstanceId);
    if (!selection?.kind || !target) return null;
    if (selection.kind === 'target-shift') {
      if (selection.shift !== -1 && selection.shift !== 1) return null;
      return {
        fighterIndex, kind: 'target-shift' as const, targetInstanceId: target.instanceId,
        targetNumber: target.targetNumber, shift: selection.shift,
      };
    }
    return { fighterIndex, kind: 'attack' as const, targetInstanceId: target.instanceId };
  }), [draft, view.fighters, view.targets]);
  const mediumComplete = mediumActions.length > 0 && mediumActions.every((action) => action !== null);

  const rangeLabel = view.range === 'medium-range' ? 'Medium Range' : 'Short Range';
  const locked = view.choiceStatus === 'committed';

  return (
    <section className="wolf-fighter-range cic-frame" aria-label={`${view.wingLabel} ${rangeLabel} actions`}>
      <header className="wolf-fighter-range__header">
        <div>
          <p className="eyebrow">Cycle {view.turn} // flight wing</p>
          <h2>{view.wingLabel} · {rangeLabel}</h2>
        </div>
        <span className="wolf-fighter-range__status">{locked ? 'Committed' : 'Choice required'}</span>
      </header>

      {view.launched === false ? (
        <p className="wolf-fighter-range__notice" role="status">This wing did not launch for the current attack.</p>
      ) : locked ? (
        <p className="wolf-fighter-range__notice" role="status">
          This range is committed. The server resolves and records the fighter results.
        </p>
      ) : view.range === 'medium-range' ? (
        <>
          <p className="wolf-fighter-range__notice">
            Each fighter chooses one action. Attack or shift a ship’s target number; a fighter cannot do both.
          </p>
          {view.fighters.length === 0 ? (
            <p className="wolf-fighter-range__notice">No fighters remain in this wing.</p>
          ) : view.targets.length === 0 ? (
            <p className="wolf-fighter-range__notice">No current ship target is available for a fighter action.</p>
          ) : (
            <div className="wolf-fighter-range__rows">
              {view.fighters.map(({ fighterIndex }) => {
                const selection = draft[fighterIndex] ?? {};
                return (
                  <div className="wolf-fighter-range__row" key={fighterIndex}>
                    <h3>Fighter {fighterIndex + 1}</h3>
                    <label>
                      <span>Action</span>
                      <select aria-label={`Fighter ${fighterIndex + 1} action`} disabled={busy}
                        value={selection.kind ?? ''}
                        onChange={(event) => setDraft((previous) => ({
                          ...previous,
                          [fighterIndex]: (() => {
                            const current = previous[fighterIndex] ?? {};
                            const { kind: _kind, ...rest } = current;
                            const nextKind = event.target.value === 'attack' || event.target.value === 'target-shift'
                              ? event.target.value : undefined;
                            return nextKind ? { ...rest, kind: nextKind } : rest;
                          })(),
                        }))}>
                        <option value="">Choose one</option>
                        <option value="attack">Attack</option>
                        <option value="target-shift">Shift target number</option>
                      </select>
                    </label>
                    <label>
                      <span>Ship</span>
                      <select aria-label={`Fighter ${fighterIndex + 1} target`} disabled={busy || !selection.kind}
                        value={selection.targetInstanceId ?? ''}
                        onChange={(event) => setDraft((previous) => ({
                          ...previous,
                          [fighterIndex]: { ...previous[fighterIndex], targetInstanceId: event.target.value },
                        }))}>
                        <option value="">Choose a ship</option>
                        {view.targets.map(({ instanceId, label }) => (
                          <option key={instanceId} value={instanceId}>{label}</option>
                        ))}
                      </select>
                    </label>
                    {selection.kind === 'target-shift' && (
                      <label>
                        <span>Shift</span>
                        <select aria-label={`Fighter ${fighterIndex + 1} shift`} disabled={busy}
                          value={selection.shift ?? ''}
                        onChange={(event) => setDraft((previous) => ({
                          ...previous,
                          [fighterIndex]: (() => {
                            const current = previous[fighterIndex] ?? {};
                            const { shift: _shift, ...rest } = current;
                            const nextShift = event.target.value === '-1' || event.target.value === '1'
                              ? Number(event.target.value) as -1 | 1 : undefined;
                            return nextShift === undefined ? rest : { ...rest, shift: nextShift };
                          })(),
                        }))}>
                          <option value="">Choose direction</option>
                          <option value="-1">−1</option>
                          <option value="1">+1</option>
                        </select>
                      </label>
                    )}
                  </div>
                );
              })}
            </div>
          )}
          <button type="button" className="cic-action-button" disabled={busy || !mediumComplete}
            onClick={() => onResolveMedium(mediumActions as readonly WolfFighterMediumAction[])}>
            Resolve Medium actions
          </button>
        </>
      ) : (
        <>
          <p className="wolf-fighter-range__notice">
            Roll one die per fighter. A 3+ deals one damage; a 1 or 2 destroys that fighter.
          </p>
          <p className="wolf-fighter-range__notice">
            {view.fighters.length} fighter{view.fighters.length === 1 ? '' : 's'} will roll. The server keeps each roll with its fighter.
          </p>
          <button type="button" className="cic-action-button"
            disabled={busy || view.fighters.length === 0}
            onClick={onResolveShort}>
            Resolve Short Range
          </button>
        </>
      )}
      {message && <p className="wolf-fighter-range__message" role="status">{message}</p>}
    </section>
  );
}
