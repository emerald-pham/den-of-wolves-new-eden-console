import { useEffect, useMemo, useState } from 'react';
import { subscribeWolfAttackMemberView } from '@/lib/firestore';
import {
  applyAegisCommandAndControl,
  getAegisCommandAndControl,
  passAegisCommandAndControl,
} from '@/lib/sessionService';
import type { AegisCommandAndControlView, WolfAttackMemberView } from '@/types/game';
import { useWolfAttackChoiceAuthority, useWolfAttackChoiceController } from '@/lib/wolfAttackChoiceController';

function displayName(value: string): string {
  return value.split('-').map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(' ');
}

function targetName(
  target: AegisCommandAndControlView['targets'][number],
  targets: AegisCommandAndControlView['targets'],
): string {
  const sameClass = targets.filter((candidate) => candidate.shipId === target.shipId);
  if (sameClass.length < 2) return displayName(target.shipId);
  const ordinal = sameClass.findIndex((candidate) => candidate.rosterIndex === target.rosterIndex) + 1;
  return `${displayName(target.shipId)} ${ordinal}`;
}

function statusFor(view: AegisCommandAndControlView): string {
  if (view.reason === 'waiting') return 'No Wolf targeting window is open.';
  if (view.reason === 'not-targeting') return 'Wolf targeting is no longer the active attack step.';
  if (view.reason === 'commander-pending') {
    return 'Rerolls pending // reconnect and finish rerolls with the assigned Wolf Commander.';
  }
  if (view.reason === 'uncharged') return 'Unavailable // charge Command and Control for this cycle.';
  if (view.reason === 'damaged') return 'Unavailable // Command and Control is damaged.';
  if (view.reason === 'damage-unknown') return 'Unavailable // AEGIS damage status could not be verified.';
  if (view.reason === 'already-used') {
    return `Command committed // ${displayName(view.redirectedShipId ?? 'wolf ship')} redirected to AEGIS.`;
  }
  if (view.reason === 'passed') return 'Command and Control passed // no redirect made.';
  if (view.reason === 'no-targets') return 'Unavailable // no Wolf ships are available to redirect.';
  if (!view.commanderAssigned) {
    return 'No Wolf Commander is assigned // this choice records targeting completion.';
  }
  if (!view.rerollsFinalized) return 'Waiting for the assigned Wolf Commander to finish rerolls.';
  return 'Targeting rerolls complete // redirect one Wolf ship to AEGIS or pass Command and Control.';
}

export type AegisCommandAndControlPanelViewProps = Readonly<{
  view: AegisCommandAndControlView;
  onRedirect: (turn: number, revision: number, rosterIndex: number) => void;
  onPass: (turn: number, revision: number) => void;
  onRefresh?: () => void;
  busy?: boolean;
  message?: string;
}>;

/** Pure Executive Officer presenter; prepared reviews supply view data and callbacks. */
export function AegisCommandAndControlPanelView({
  view,
  onRedirect,
  onPass,
  onRefresh,
  busy = false,
  message,
}: AegisCommandAndControlPanelViewProps) {
  const [selected, setSelected] = useState<number | null>(null);
  const draftKey = useMemo(() => JSON.stringify([
    view.sessionId, view.turn, view.revision, view.eligible, view.reason,
    view.targets.map(({ rosterIndex, shipId }) => [rosterIndex, shipId]),
  ]), [view]);
  useEffect(() => setSelected(null), [draftKey]);
  const status = message ?? statusFor(view);
  const canChoose = view.eligible && view.targets.length > 0;

  return (
    <section className="aegis-cnc-panel cic-frame" aria-labelledby="aegis-cnc-title">
      <header className="aegis-cnc-panel__header">
        <div>
          <p>Wolf attack // AEGIS defense</p>
          <h3 id="aegis-cnc-title">Command and Control</h3>
        </div>
        <span>Cycle {view.turn} // Rev {view.revision}</span>
      </header>
      <p className="aegis-cnc-panel__guidance">
        After Wolf Commander rerolls finish, redirect one Wolf ship to AEGIS or pass. This choice does not resolve damage.
      </p>
      {canChoose && (
        <fieldset className="aegis-cnc-panel__targets" disabled={busy}>
          <legend>Choose one Wolf ship to redirect</legend>
          {view.targets.map((target) => (
            <label key={target.rosterIndex}>
              <input
                type="radio"
                name="aegis-cnc-target"
                value={target.rosterIndex}
                checked={selected === target.rosterIndex}
                onChange={() => setSelected(target.rosterIndex)}
              />
              <span>{targetName(target, view.targets)}</span>
            </label>
          ))}
        </fieldset>
      )}
      <div className="aegis-cnc-panel__actions">
        <button className="cic-action-button cic-action-button--confirm" type="button"
          disabled={!canChoose || selected === null || busy}
          onClick={() => selected !== null && onRedirect(view.turn, view.revision, selected)}>
          Redirect selected ship
        </button>
        {canChoose && <button className="cic-action-button" type="button" disabled={busy}
          onClick={() => onPass(view.turn, view.revision)}>
          Pass Command and Control
        </button>}
        {onRefresh && <button className="cic-text-button" type="button" disabled={busy} onClick={onRefresh}>
          Refresh Command and Control
        </button>}
      </div>
      <p className="aegis-cnc-panel__status" role="status" aria-live="polite">{status}</p>
    </section>
  );
}

/** AEGIS choices are shown only for the current live EO and current attack step. */
export default function AegisCommandAndControlPanel({
  sessionId: suppliedSessionId,
  consoleLocked = false,
  subscribe = subscribeWolfAttackMemberView,
}: Readonly<{
  sessionId?: string;
  consoleLocked?: boolean;
  subscribe?: typeof subscribeWolfAttackMemberView;
}> = {}) {
  const authority = useWolfAttackChoiceAuthority('executive-officer', suppliedSessionId, !consoleLocked);
  const { memberView, view, busy, message, error, refresh, runMutation } = useWolfAttackChoiceController({
    authority,
    actor: 'executive-officer',
    expectedStep: isTargetingStep,
    read: getAegisCommandAndControl,
    readMatches: aegisReadMatches,
    subscribe,
    readFailureMessage: 'Could not refresh Command and Control.',
    refreshAfterMutation: false,
    mutationFailureMessage: 'The Executive Officer choice could not be committed. Refresh before retrying.',
  });
  const sessionId = authority.sessionId;

  if (!sessionId || !authority.actorReady) return null;
  if (consoleLocked) return (
    <section className="aegis-cnc-panel cic-frame" aria-label="Command and Control">
      <p className="aegis-cnc-panel__status" role="status">Command and Control is locked while this console’s authority is unavailable.</p>
      <div className="aegis-cnc-panel__actions">
        <button className="cic-action-button cic-action-button--confirm" type="button" disabled>Redirect selected ship</button>
      </div>
    </section>
  );
  if (!authority.ready) return (
    <section className="aegis-cnc-panel cic-frame" aria-label="Command and Control">
      <p className="aegis-cnc-panel__status" role="status">Reconnect to the live Executive Officer authority before showing Wolf targets.</p>
    </section>
  );
  if (!memberView || memberView.currentStep !== 'targeting') return null;
  if (!view) return (
    <section className="aegis-cnc-panel cic-frame" aria-label="Command and Control">
      <p className="aegis-cnc-panel__status" role="status">{error ?? message ?? 'Checking the current server Command and Control choice…'}</p>
      <button className="cic-action-button" type="button" disabled>Redirect selected ship</button>
      <button className="cic-action-button" type="button" disabled={busy} onClick={refresh}>Refresh Command and Control</button>
    </section>
  );

  return <AegisCommandAndControlPanelView
    view={view}
    busy={busy}
    {...((error ?? message) ? { message: error ?? message } : {})}
    onRefresh={refresh}
    onRedirect={(turn, revision, rosterIndex) => runMutation(
      async () => {
        try {
          const result = await applyAegisCommandAndControl(turn, revision, rosterIndex);
          const target = view.targets.find(candidate => candidate.rosterIndex === rosterIndex);
          if (!target || result.sessionId !== view.sessionId || result.turn !== turn || result.revision !== revision + 1 ||
              result.rosterIndex !== rosterIndex || result.shipId !== target.shipId) {
            throw new Error('The receipt did not match the selected ship.');
          }
        } catch (cause) {
          throw new Error(`${cause instanceof Error ? cause.message : 'Redirect rejected.'} Refresh the current targeting state before retrying.`);
        }
      },
      `${targetName(view.targets.find(candidate => candidate.rosterIndex === rosterIndex)!, view.targets)} redirected to AEGIS.`,
    )}
    onPass={(turn, revision) => runMutation(
      () => passAegisCommandAndControl(turn, revision),
      'Command and Control passed // no redirect made.',
    )}
  />;
}

function isTargetingStep(member: WolfAttackMemberView): boolean {
  return member.currentStep === 'targeting';
}

function aegisReadMatches(value: AegisCommandAndControlView, member: WolfAttackMemberView): boolean {
  return value.sessionId === member.sessionId && value.turn === member.turn &&
    value.revision === member.revision && member.currentStep === 'targeting';
}
