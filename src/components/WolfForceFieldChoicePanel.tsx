import { useEffect, useState } from 'react';
import { subscribeWolfAttackMemberView } from '@/lib/firestore';
import { commitWolfForceFieldChoice, getWolfForceFieldChoice } from '@/lib/sessionService';
import type {
  WolfAttackMemberView,
  WolfAttackTargetId,
  WolfForceFieldChoiceReadResult,
} from '@/types/game';
import { useWolfAttackChoiceAuthority, useWolfAttackChoiceController } from '@/lib/wolfAttackChoiceController';
import './WolfForceFieldChoicePanel.css';

function shipLabel(shipId: string): string {
  return shipId.replaceAll('-', ' ').toUpperCase();
}

function unavailableMessage(reason: Extract<WolfForceFieldChoiceReadResult, { type: 'wolf-force-field-choice-unavailable' }>['reason']): string {
  switch (reason) {
    case 'no-current-captain': return 'No current Gorgoneion Captain is configured for this cycle.';
    case 'ambiguous-current-captain': return 'The current Captain assignment is ambiguous; the projector remains unavailable.';
    case 'gorgoneion-not-admitted': return 'Gorgoneion is not admitted as a valid active extra ship.';
    case 'projector-not-ready': return 'The current Force Field Projector charge is unavailable or the ship cannot use it.';
    case 'captain-berth-unavailable': return 'The Captain’s current host and fleet group cannot be verified.';
  }
}

export function WolfForceFieldChoicePanelView({
  view,
  onChoose,
  onPass,
  busy = false,
  message,
}: Readonly<{
  view: WolfForceFieldChoiceReadResult;
  onChoose: (targetShipId: WolfAttackTargetId) => void;
  onPass: () => void;
  busy?: boolean;
  message?: string;
}>) {
  const [selectedTarget, setSelectedTarget] = useState<string>('');
  const draftKey = view.type === 'wolf-force-field-choice-view'
    ? JSON.stringify([view.sessionId, view.attackId, view.turn, view.revision, view.fleetGroupId,
      view.hostShipId, view.dockingRevision, view.choiceStatus, view.targetShipId ?? null])
    : JSON.stringify([view.sessionId, 'unavailable', view.reason]);
  useEffect(() => {
    setSelectedTarget(view.type === 'wolf-force-field-choice-view' && view.choiceStatus === 'selected'
      ? view.targetShipId ?? '' : '');
  }, [draftKey]);

  if (view.type === 'wolf-force-field-choice-unavailable') {
    return (
      <section className="wolf-force-field cic-frame" aria-label="Gorgoneion Force Field Projector">
        <header className="wolf-force-field__header">
          <div><p className="eyebrow">Cycle // pre-target defence</p><h2>Force Field Projector</h2></div>
          <span className="wolf-force-field__status">Unavailable</span>
        </header>
        <p className="wolf-force-field__notice" role="status">{unavailableMessage(view.reason)}</p>
        {message && <p className="wolf-force-field__message" role="status">{message}</p>}
      </section>
    );
  }

  const locked = view.choiceStatus !== 'pending';
  return (
    <section className="wolf-force-field cic-frame" aria-label="Gorgoneion Force Field Projector">
      <header className="wolf-force-field__header">
        <div><p className="eyebrow">Cycle {view.turn} // pre-target defence</p><h2>Force Field Projector</h2></div>
        <span className="wolf-force-field__status">{locked ? 'Choice committed' : 'Captain choice required'}</span>
      </header>
      <p className="wolf-force-field__deadline">
        Attack deadline <time dateTime={view.deadlineAt}>{view.deadlineAt}</time>
      </p>
      {view.choiceStatus === 'selected' ? (
        <p className="wolf-force-field__notice" role="status">
          Force Field protects {shipLabel(view.targetShipId ?? view.hostShipId)}. Final aggregate attack damage is reduced by 2.
        </p>
      ) : view.choiceStatus === 'passed' ? (
        <p className="wolf-force-field__notice" role="status">Captain recorded a pass. No ship is protected.</p>
      ) : (
        <>
          <p className="wolf-force-field__notice" role="status">
            The choice is still pending. Choose one active ship in your current fleet group or explicitly pass before targeting rolls are exposed.
            A disconnect leaves this choice pending until the Captain reconnects.
          </p>
          <fieldset className="wolf-force-field__targets" disabled={busy}>
            <legend>Choose a ship to protect</legend>
            {view.targetShipIds.map((shipId) => (
              <label key={shipId} className="wolf-force-field__target">
                <input type="radio" name="wolf-force-field-target" value={shipId}
                  checked={selectedTarget === shipId} onChange={() => setSelectedTarget(shipId)} />
                <span>{shipLabel(shipId)}</span>
              </label>
            ))}
          </fieldset>
          <div className="wolf-force-field__buttons">
            <button type="button" className="cic-action-button" disabled={busy || !selectedTarget}
              onClick={() => onChoose(selectedTarget as WolfAttackTargetId)}>
              Protect selected ship
            </button>
            <button type="button" className="cic-action-button" disabled={busy} onClick={onPass}>
              Pass Force Field
            </button>
          </div>
        </>
      )}
      {message && <p className="wolf-force-field__message" role="status">{message}</p>}
    </section>
  );
}

export default function WolfForceFieldChoicePanel({
  sessionId: suppliedSessionId,
  subscribe = subscribeWolfAttackMemberView,
}: Readonly<{
  sessionId?: string;
  subscribe?: typeof subscribeWolfAttackMemberView;
}> = {}) {
  const authority = useWolfAttackChoiceAuthority('gorgoneion-captain', suppliedSessionId);
  const { memberView, view, busy, message, error, refresh, runMutation } = useWolfAttackChoiceController({
    authority,
    actor: 'gorgoneion-captain',
    expectedStep: isWolfTargetingStep,
    read: getWolfForceFieldChoice,
    readMatches: forceFieldReadMatches,
    subscribe,
    readFailureMessage: 'Could not refresh the Force Field choice.',
    mutationFailureMessage: 'The choice could not be committed. Refresh before retrying.',
  });
  const sessionId = authority.sessionId;

  if (!sessionId || !authority.actorReady) return null;
  if (!authority.ready) {
    return <section className="wolf-force-field cic-frame" aria-label="Gorgoneion Force Field Projector">
      <p className="wolf-force-field__notice" role="status">Waiting for the live server session before showing the Captain’s choice.</p>
    </section>;
  }
  if (!memberView || memberView.currentStep !== 'targeting') return null;
  if (!view) {
    return <section className="wolf-force-field cic-frame" aria-label="Gorgoneion Force Field Projector">
      <p className="wolf-force-field__notice" role="status">{error ?? 'Checking the current server Force Field choice…'}</p>
      <button type="button" className="cic-action-button" disabled={busy} onClick={refresh}>Refresh Force Field choice</button>
    </section>;
  }
  if (view.type === 'wolf-force-field-choice-unavailable') {
    return <WolfForceFieldChoicePanelView view={view} busy={busy}
      {...(error ? { message: error } : {})} onChoose={() => undefined} onPass={() => undefined} />;
  }

  const displayMessage = error ?? message;
  return <WolfForceFieldChoicePanelView view={view} busy={busy}
    {...(displayMessage ? { message: displayMessage } : {})}
    onChoose={(targetShipId) => runMutation(
      () => commitWolfForceFieldChoice(view.turn, view.revision, targetShipId),
      'Choice committed. Targeting and later progress follow the server attack record.',
    )}
    onPass={() => runMutation(
      () => commitWolfForceFieldChoice(view.turn, view.revision, null),
      'Choice committed. Targeting and later progress follow the server attack record.',
    )} />;
}

function isWolfTargetingStep(member: WolfAttackMemberView): boolean {
  return member.currentStep === 'targeting';
}

function forceFieldReadMatches(value: WolfForceFieldChoiceReadResult, member: WolfAttackMemberView): boolean {
  if (value.type === 'wolf-force-field-choice-unavailable') return value.sessionId === member.sessionId;
  return value.sessionId === member.sessionId && value.attackId === member.attackId &&
    value.turn === member.turn && value.revision === member.revision && member.currentStep === 'targeting';
}
