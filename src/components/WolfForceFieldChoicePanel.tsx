import { useCallback, useEffect, useState } from 'react';
import { subscribeWolfAttackMemberView } from '@/lib/firestore';
import { commitWolfForceFieldChoice, getWolfForceFieldChoice } from '@/lib/sessionService';
import { useSessionStore } from '@/store/useSessionStore';
import type {
  WolfAttackMemberView,
  WolfAttackTargetId,
  WolfForceFieldChoiceReadResult,
} from '@/types/game';
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
  useEffect(() => {
    setSelectedTarget(view.type === 'wolf-force-field-choice-view' && view.choiceStatus === 'selected'
      ? view.targetShipId ?? '' : '');
  }, [view]);

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
  const session = useSessionStore((state) => state.session);
  const me = useSessionStore((state) => state.me);
  const sessionId = suppliedSessionId ?? session?.id;
  const [memberView, setMemberView] = useState<WolfAttackMemberView | null>(null);
  const [view, setView] = useState<WolfForceFieldChoiceReadResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string>();
  const [error, setError] = useState<string>();

  const refresh = useCallback(async (minimumRevision = 0) => {
    if (!sessionId || !memberView || memberView.currentStep !== 'targeting') return;
    try {
      const current = await getWolfForceFieldChoice();
      if (current.type === 'wolf-force-field-choice-view' && current.revision < minimumRevision) return;
      setView(current);
      setError(undefined);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not refresh the Force Field choice.');
    }
  }, [memberView, sessionId]);

  useEffect(() => {
    setMemberView(null);
    setView(null);
    setError(undefined);
    setMessage(undefined);
    if (!sessionId || me?.role !== 'player' || me.replacementRoleId !== 'gorgoneion-captain' ||
        me.replacementStatus != null) return;
    let live = true;
    let newestRead = 0;
    const update = (next: WolfAttackMemberView | null) => {
      if (!live) return;
      setMemberView(next);
      if (!next || next.currentStep !== 'targeting') {
        newestRead += 1;
        setView(null);
        setError(undefined);
        return;
      }
      const ticket = ++newestRead;
      void getWolfForceFieldChoice().then((current) => {
        if (!live || ticket !== newestRead || current.type === 'wolf-force-field-choice-view' &&
            current.revision < next.revision) return;
        setView(current);
        setError(undefined);
      }).catch((cause: unknown) => {
        if (live && ticket === newestRead) {
          setError(cause instanceof Error ? cause.message : 'Could not refresh the Force Field choice.');
        }
      });
    };
    const unsubscribe = subscribe(sessionId, update);
    return () => { live = false; newestRead += 1; unsubscribe(); };
  }, [me?.replacementRoleId, me?.replacementStatus, me?.role, sessionId, subscribe]);

  const runMutation = useCallback(async (targetShipId: WolfAttackTargetId | null) => {
    if (!view || view.type !== 'wolf-force-field-choice-view' || view.choiceStatus !== 'pending' || busy) return;
    setBusy(true);
    setMessage(undefined);
    setError(undefined);
    try {
      await commitWolfForceFieldChoice(view.turn, view.revision, targetShipId);
      setMessage('Choice committed. Targeting and later progress follow the server attack record.');
      await refresh(view.revision + 1);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The choice could not be committed. Refresh before retrying.');
      await refresh(view.revision);
    } finally {
      setBusy(false);
    }
  }, [busy, refresh, view]);

  if (!sessionId || me?.role !== 'player' || me.replacementRoleId !== 'gorgoneion-captain' ||
      me.replacementStatus != null || !memberView || memberView.currentStep !== 'targeting') return null;
  if (!view) {
    return <section className="wolf-force-field cic-frame" aria-label="Gorgoneion Force Field Projector">
      <p className="wolf-force-field__notice" role="status">{error ?? 'Checking the current server Force Field choice…'}</p>
      <button type="button" className="cic-action-button" disabled={busy}
        onClick={() => void refresh(memberView.revision)}>Refresh Force Field choice</button>
    </section>;
  }

  const displayMessage = error ?? message;
  return <WolfForceFieldChoicePanelView view={view} busy={busy}
    {...(displayMessage ? { message: displayMessage } : {})}
    onChoose={(targetShipId) => void runMutation(targetShipId)}
    onPass={() => void runMutation(null)} />;
}
