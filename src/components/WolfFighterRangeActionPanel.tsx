import { useCallback, useEffect, useMemo, useState } from 'react';
import { subscribeWolfAttackMemberView } from '@/lib/firestore';
import { commitWolfFighterRangeActionChoice, getWolfFighterRangeActionChoice } from '@/lib/sessionService';
import { useWolfAttackChoiceAuthority, useWolfAttackChoiceController } from '@/lib/wolfAttackChoiceController';
import type { WolfAttackMemberView, WolfFighterRangeActionView as ConnectedWolfFighterRangeActionView } from '@/types/game';
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
  readonly onResolveShort: (fighterIndexes: readonly number[]) => void;
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
  const [selectedShortFighters, setSelectedShortFighters] = useState<readonly number[]>([]);
  const draftKey = JSON.stringify([
    view.sessionId, view.attackId, view.turn, view.revision, view.wingId,
    view.range, view.choiceStatus, view.fighters.map(({ fighterIndex }) => fighterIndex),
    view.targets.map(({ instanceId, targetNumber }) => [instanceId, targetNumber]),
  ]);
  useEffect(() => {
    setDraft({});
    setSelectedShortFighters([]);
  }, [draftKey]);

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
  const hasCommittedFighter = view.fighters.some(({ fighterIndex }) => !!draft[fighterIndex]?.kind);
  const hasIncompleteChoice = view.fighters.some(({ fighterIndex }) => {
    const selection = draft[fighterIndex];
    if (!selection?.kind) return false;
    return !selection.targetInstanceId ||
      (selection.kind === 'target-shift' && selection.shift !== -1 && selection.shift !== 1);
  });

  const rangeLabel = view.range === 'medium-range' ? 'Medium Range' : 'Short Range';
  const locked = view.choiceStatus === 'committed';
  const shortFighterIndexes = view.fighters.map(({ fighterIndex }) => fighterIndex)
    .filter((fighterIndex) => selectedShortFighters.includes(fighterIndex)).sort((left, right) => left - right);

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
            For each fighter you commit, choose one attack or one target shift. A fighter cannot do both.
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
                            const nextKind = event.target.value === 'attack' || event.target.value === 'target-shift'
                              ? event.target.value : undefined;
                            if (!nextKind) return {};
                            return {
                              kind: nextKind,
                              ...(current.targetInstanceId ? { targetInstanceId: current.targetInstanceId } : {}),
                              ...(nextKind === 'target-shift' && current.kind === 'target-shift' && current.shift !== undefined
                                ? { shift: current.shift } : {}),
                            };
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
          <button type="button" className="cic-action-button" disabled={busy || !hasCommittedFighter || hasIncompleteChoice}
            onClick={() => onResolveMedium(mediumActions.filter((action): action is WolfFighterMediumAction => action !== null))}>
            Resolve Medium actions
          </button>
          <button type="button" className="cic-action-button" disabled={busy}
            onClick={() => onResolveMedium([])}>
            Pass Medium Range
          </button>
        </>
      ) : (
        <>
          <p className="wolf-fighter-range__notice">
            Choose up to one die per fighter. A 3+ deals one damage; a 1 or 2 destroys the fighter that rolled it.
          </p>
          <p className="wolf-fighter-range__notice">
            {shortFighterIndexes.length} of {view.fighters.length} fighter{view.fighters.length === 1 ? '' : 's'} selected. The server keeps each roll with its fighter.
          </p>
          <fieldset className="wolf-fighter-range__short-choices" disabled={busy}>
            <legend>Fighters to commit</legend>
            {view.fighters.map(({ fighterIndex }) => (
              <label key={fighterIndex}>
                <input type="checkbox" aria-label={`Fighter ${fighterIndex + 1} Short attack`}
                  checked={shortFighterIndexes.includes(fighterIndex)}
                  onChange={(event) => setSelectedShortFighters((previous) => event.target.checked
                    ? [...new Set([...previous, fighterIndex])]
                    : previous.filter((selected) => selected !== fighterIndex))} />
                Fighter {fighterIndex + 1}
              </label>
            ))}
          </fieldset>
          <button type="button" className="cic-action-button"
            disabled={busy}
            onClick={() => onResolveShort(shortFighterIndexes)}>
            {shortFighterIndexes.length > 0 ? 'Resolve selected Short attacks' : 'Pass Short Range'}
          </button>
        </>
      )}
      {message && <p className="wolf-fighter-range__message" role="status">{message}</p>}
    </section>
  );
}

export default function WolfFighterRangeActionPanel({
  sourceId,
  range,
  sessionId: suppliedSessionId,
  subscribe = subscribeWolfAttackMemberView,
}: Readonly<{
  sourceId: 'fighter-wing-alpha' | 'fighter-wing-bravo';
  range: 'medium-range' | 'short-range';
  sessionId?: string;
  subscribe?: typeof subscribeWolfAttackMemberView;
}>) {
  const authority = useWolfAttackChoiceAuthority('wing-commander', suppliedSessionId);
  const read = useCallback(() => getWolfFighterRangeActionChoice(range, sourceId), [range, sourceId]);
  const { memberView, view, busy, message, error, refresh, runMutation } = useWolfAttackChoiceController({
    authority,
    actor: 'wing-commander',
    expectedStep: (member) => member.currentStep === range,
    read,
    readMatches: (value, member) => fighterRangeReadMatches(value, member, sourceId, range),
    subscribe,
    readFailureMessage: 'Could not refresh this fighter range choice.',
    mutationFailureMessage: 'The fighter choice could not be committed. Refresh before retrying.',
  });

  if (!authority.sessionId || !authority.actorReady) return null;
  if (!authority.ready) return <section className="wolf-fighter-range cic-frame"
    aria-label={`${sourceId} ${range} actions`}>
    <p className="wolf-fighter-range__notice" role="status">Waiting for a live Wing Commander session before showing fighter actions.</p>
  </section>;
  if (!memberView || memberView.currentStep !== range) return null;
  if (!view) return <section className="wolf-fighter-range cic-frame"
    aria-label={`${sourceId} ${range} actions`}>
    <p className="wolf-fighter-range__notice" role="status">{error ?? 'Checking the current fighter range…'}</p>
    <button type="button" className="cic-action-button" disabled={busy} onClick={refresh}>Refresh fighter choice</button>
  </section>;

  const displayMessage = error ?? message;
  return <WolfFighterRangeActionPanelView
    view={view}
    busy={busy}
    {...(displayMessage ? { message: displayMessage } : {})}
    onResolveMedium={(actions) => runMutation(
      () => commitWolfFighterRangeActionChoice(view.turn, view.revision, range, sourceId, actions),
      'Medium Range fighter choices committed to the server.',
    )}
    onResolveShort={(fighterIndexes) => runMutation(
      () => commitWolfFighterRangeActionChoice(view.turn, view.revision, range, sourceId, fighterIndexes),
      'Short Range fighter choices committed to the server.',
    )}
  />;
}

function fighterRangeReadMatches(
  view: ConnectedWolfFighterRangeActionView,
  member: WolfAttackMemberView,
  sourceId: 'fighter-wing-alpha' | 'fighter-wing-bravo',
  range: 'medium-range' | 'short-range',
): boolean {
  return view.sessionId === member.sessionId && view.turn === member.turn &&
    view.revision === member.revision && view.attackId === member.attackId &&
    view.wingId === sourceId && view.range === range && member.currentStep === range;
}
