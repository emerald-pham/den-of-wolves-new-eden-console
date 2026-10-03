import { useEffect, useMemo, useState } from 'react';
import { subscribeWolfAttackMemberView } from '@/lib/firestore';
import {
  applyWolfCommanderTargetRerolls,
  finishWolfCommanderTargetingRerolls,
  getWolfCommanderTargeting,
  type WolfCommanderTargetingReadResult,
} from '@/lib/sessionService';
import type {
  WolfAttackMemberView,
  WolfCommanderTargetingView,
} from '@/types/game';
import { useWolfAttackChoiceAuthority, useWolfAttackChoiceController } from '@/lib/wolfAttackChoiceController';

function displayName(value: string): string {
  return value.split('-').map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(' ');
}

export type WolfCommanderTargetingPanelViewProps = Readonly<{
  view: WolfCommanderTargetingView;
  onReroll: (turn: number, revision: number, rosterIndexes: readonly number[]) => void;
  onFinish: (turn: number, revision: number) => void;
  onRefresh?: () => void;
  busy?: boolean;
  message?: string;
}>;

/** Pure Commander presenter for prepared reviews and the live role console. */
export function WolfCommanderTargetingPanelView({
  view,
  onReroll,
  onFinish,
  onRefresh,
  busy = false,
  message,
}: WolfCommanderTargetingPanelViewProps) {
  const [selected, setSelected] = useState<readonly number[]>([]);
  const draftKey = useMemo(() => JSON.stringify([
    view.sessionId, view.turn, view.revision, view.currentStep, view.rerollsFinalized,
    view.rolls.map(({ rosterIndex, shipId, die, target }) => [rosterIndex, shipId, die, target]),
    view.eligibleRerollIndexes, view.rerolledIndexes,
  ]), [view]);
  useEffect(() => setSelected([]), [draftKey]);
  const eligible = new Set(view.eligibleRerollIndexes);
  const status = message ?? (view.rerollsFinalized
    ? 'Reroll window is closed. AEGIS Command and Control may now act.'
    : 'Select any remaining dice, then reroll the selected dice or finish rerolls.');

  function toggleSelection(rosterIndex: number): void {
    setSelected((current) => current.includes(rosterIndex)
      ? current.filter((index) => index !== rosterIndex)
      : [...current, rosterIndex].sort((left, right) => left - right));
  }

  return (
    <section className="wolf-commander-panel cic-frame" aria-labelledby="wolf-commander-panel-title">
      <header className="wolf-commander-panel__header">
        <div>
          <p className="eyebrow">Private Wolf action</p>
          <h2 id="wolf-commander-panel-title">Targeting dice</h2>
        </div>
        <span className="wolf-commander-panel__revision">Cycle {view.turn} // Rev {view.revision}</span>
      </header>
      <p className="wolf-commander-panel__guidance">
        Choose each die at most once. Rerolls resolve before AEGIS Command and Control; printed Capybara 8 rerolls are automatic and separate.
      </p>
      <fieldset className="wolf-commander-panel__dice" disabled={busy || view.rerollsFinalized}>
        <legend>Choose targeting dice to reroll</legend>
        <ul>
          {view.rolls.map((roll) => {
            const canSelect = !view.rerollsFinalized && eligible.has(roll.rosterIndex);
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
      <div className="wolf-commander-panel__actions">
        <button className="cic-action-button cic-action-button--confirm" type="button"
          disabled={view.rerollsFinalized || selected.length === 0 || busy}
          onClick={() => onReroll(view.turn, view.revision, selected)}>
          Reroll selected dice
        </button>
        <button className="cic-text-button" type="button"
          disabled={view.rerollsFinalized || selected.length > 0 || busy}
          onClick={() => onFinish(view.turn, view.revision)}>
          Finish rerolls
        </button>
        {onRefresh && <button className="cic-text-button" type="button" disabled={busy} onClick={onRefresh}>
          Refresh targeting
        </button>}
      </div>
      <p className="wolf-commander-panel__status" role="status" aria-live="polite">{status}</p>
    </section>
  );
}

/** Current replacement Commander controls, bound to the member attack stream and fresh auth. */
export default function WolfCommanderTargetingPanel({
  sessionId: suppliedSessionId,
  subscribe = subscribeWolfAttackMemberView,
}: Readonly<{
  /** Kept for legacy fixtures only. It never grants live Commander authority. */
  enabled?: boolean;
  sessionId?: string;
  subscribe?: typeof subscribeWolfAttackMemberView;
}> = {}) {
  const authority = useWolfAttackChoiceAuthority('wolf-commander', suppliedSessionId);
  const { memberView, view, busy, message, error, refresh, runMutation } = useWolfAttackChoiceController({
    authority,
    actor: 'wolf-commander',
    expectedStep: isTargetingStep,
    read: readCurrentTargeting,
    readMatches: commanderReadMatches,
    subscribe,
    readFailureMessage: 'Could not refresh Wolf targeting dice.',
    refreshAfterMutation: false,
    mutationFailureMessage: 'The Commander choice could not be committed. Refresh before retrying.',
  });
  const sessionId = authority.sessionId;

  if (!sessionId || !authority.actorReady) return null;
  if (!authority.ready) return (
    <section className="wolf-commander-panel cic-frame" aria-label="Wolf Commander targeting dice">
      <p className="wolf-commander-panel__status" role="status">Waiting for live Commander authority before showing targeting dice.</p>
    </section>
  );
  if (!memberView || memberView.currentStep !== 'targeting') return null;
  if (!view) return (
    <section className="wolf-commander-panel cic-frame" aria-label="Wolf Commander targeting dice">
      <p className="wolf-commander-panel__status" role="status">
        {error ?? message ?? 'Checking the current server targeting choice…'}
      </p>
      <button className="cic-action-button" type="button" disabled>Reroll selected dice</button>
      <button className="cic-text-button" type="button" disabled>Finish rerolls</button>
      <button className="cic-action-button" type="button" disabled={busy} onClick={refresh}>Refresh targeting</button>
    </section>
  );
  if (view.type === 'wolf-commander-targeting-unavailable') return (
    <section className="wolf-commander-panel cic-frame" aria-label="Wolf Commander targeting dice">
      <p className="wolf-commander-panel__status" role="status">
        {error ?? (view.reason === 'waiting' ? 'No targeting window is open yet.' : 'Wolf targeting is no longer active.')}
      </p>
      <button className="cic-action-button" type="button" disabled>Reroll selected dice</button>
      <button className="cic-text-button" type="button" disabled>Finish rerolls</button>
      <button className="cic-action-button" type="button" disabled={busy} onClick={refresh}>Refresh targeting</button>
    </section>
  );

  return <WolfCommanderTargetingPanelView
    view={view}
    busy={busy}
    {...((error ?? message) ? { message: error ?? message } : {})}
    onRefresh={refresh}
    onReroll={(turn, revision, rosterIndexes) => runMutation(
      () => applyWolfCommanderTargetRerolls(turn, revision, rosterIndexes),
      'Selected dice rerolled. Review the server’s current targeting view.',
    )}
    onFinish={(turn, revision) => runMutation(
      async () => {
        try { await finishWolfCommanderTargetingRerolls(turn, revision); }
        catch (cause) {
          throw new Error(`Finish rejected: ${cause instanceof Error ? cause.message : 'request unavailable'}. Refresh targeting before retrying.`);
        }
      },
      'Reroll window is closed. AEGIS Command and Control may now act.',
    )}
  />;
}

function isTargetingStep(member: WolfAttackMemberView): boolean {
  return member.currentStep === 'targeting';
}

function commanderReadMatches(value: WolfCommanderTargetingReadResult, member: WolfAttackMemberView): boolean {
  if (value.type === 'wolf-commander-targeting-unavailable') return value.sessionId === member.sessionId;
  return value.sessionId === member.sessionId && value.turn === member.turn &&
    value.revision === member.revision && value.currentStep === member.currentStep;
}

async function readCurrentTargeting(): Promise<WolfCommanderTargetingReadResult> {
  try { return await getWolfCommanderTargeting(); }
  catch (cause) {
    throw new Error(`Targeting view unavailable: ${cause instanceof Error ? cause.message : 'server read rejected'}`);
  }
}
