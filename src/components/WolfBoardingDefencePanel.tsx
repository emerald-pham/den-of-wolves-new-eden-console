import { useCallback, useEffect, useState } from 'react';
import { subscribeWolfAttackMemberView } from '@/lib/firestore';
import { commitWolfBoardingDefenceChoice, getWolfBoardingDefenceChoice } from '@/lib/sessionService';
import { useSessionStore } from '@/store/useSessionStore';
import type {
  WolfAttackMemberView,
  WolfAttackTargetId,
  WolfBoardingDefenceChoiceReadResult,
} from '@/types/game';
import './WolfBoardingDefencePanel.css';

function shipLabel(shipId: string): string {
  return shipId.replaceAll('-', ' ').toUpperCase();
}

export function WolfBoardingDefencePanelView({
  view,
  onChoose,
  busy = false,
  message,
}: Readonly<{
  view: WolfBoardingDefenceChoiceReadResult;
  onChoose: (securityTeams: number) => void;
  busy?: boolean;
  message?: string;
}>) {
  const [selectedTeams, setSelectedTeams] = useState('');
  useEffect(() => {
    setSelectedTeams('');
  }, [view]);

  if (view.type === 'wolf-boarding-defence-choice-unavailable') {
    return <section className="wolf-boarding-defence cic-frame" aria-label="Boarding defence">
      <header className="wolf-boarding-defence__header">
        <div><p className="eyebrow">Cycle // boarding</p><h2>Boarding defence</h2></div>
        <span className="wolf-boarding-defence__status">No choice required</span>
      </header>
      <p className="wolf-boarding-defence__notice" role="status">
        No surviving boarding parties are present on this ship. No Security Teams choice is required.
      </p>
      {message && <p className="wolf-boarding-defence__message" role="status">{message}</p>}
    </section>;
  }

  const committed = view.choiceStatus === 'committed';
  return <section className="wolf-boarding-defence cic-frame" aria-label={`${shipLabel(view.targetShipId)} boarding defence`}>
    <header className="wolf-boarding-defence__header">
      <div>
        <p className="eyebrow">Cycle {view.turn} // boarding</p>
        <h2>{shipLabel(view.targetShipId)} defence</h2>
      </div>
      <span className="wolf-boarding-defence__status">{committed ? 'Choice committed' : 'Crew choice required'}</span>
    </header>
    <p className="wolf-boarding-defence__detail">
      {view.boardingParties} surviving boarding parties. {view.availableSecurityTeams} Security Teams are currently available.
    </p>
    <p className="wolf-boarding-defence__deadline">
      Attack deadline <time dateTime={view.deadlineAt}>{view.deadlineAt}</time>
    </p>
    {committed ? (
      <p className="wolf-boarding-defence__notice" role="status">
        {view.chosenSecurityTeams} Security Teams committed. This ship’s defence choice is locked.
      </p>
    ) : (
      <>
        <p className="wolf-boarding-defence__notice" role="status">
          A member of this ship’s current crew must choose explicitly. A disconnect leaves the choice pending; no timeout choice is applied.
        </p>
        <label className="wolf-boarding-defence__choice">
          Security Teams committed
          <select value={selectedTeams} disabled={busy} onChange={(event) => setSelectedTeams(event.target.value)}>
            <option value="">Choose a number of teams</option>
            {Array.from({ length: view.availableSecurityTeams + 1 }, (_, count) => (
              <option key={count} value={count}>{count} {count === 1 ? 'team' : 'teams'}</option>
            ))}
          </select>
        </label>
        <button type="button" className="cic-action-button" disabled={busy || selectedTeams === ''}
          onClick={() => onChoose(Number(selectedTeams))}>
          Commit defence
        </button>
      </>
    )}
    {message && <p className="wolf-boarding-defence__message" role="status">{message}</p>}
  </section>;
}

export default function WolfBoardingDefencePanel({
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
  const [view, setView] = useState<WolfBoardingDefenceChoiceReadResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string>();
  const [error, setError] = useState<string>();

  const refresh = useCallback(async () => {
    if (!sessionId || !memberView || memberView.currentStep !== 'boarding') return;
    try {
      const current = await getWolfBoardingDefenceChoice();
      if (current.type === 'wolf-boarding-defence-choice-view' && current.revision < memberView.revision) return;
      setView(current);
      setError(undefined);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not refresh boarding defence.');
    }
  }, [memberView, sessionId]);

  useEffect(() => {
    setMemberView(null);
    setView(null);
    setError(undefined);
    setMessage(undefined);
    if (!sessionId || me?.role !== 'player' || me.replacementStatus != null) return;
    let live = true;
    let newestRead = 0;
    const update = (next: WolfAttackMemberView | null) => {
      if (!live) return;
      setMemberView(next);
      if (!next || next.currentStep !== 'boarding') {
        newestRead += 1;
        setView(null);
        setError(undefined);
        return;
      }
      const ticket = ++newestRead;
      void getWolfBoardingDefenceChoice().then((current) => {
        if (!live || ticket !== newestRead || current.type === 'wolf-boarding-defence-choice-view' &&
            current.revision < next.revision) return;
        setView(current);
        setError(undefined);
      }).catch((cause: unknown) => {
        if (live && ticket === newestRead) {
          setError(cause instanceof Error ? cause.message : 'Could not refresh boarding defence.');
        }
      });
    };
    const unsubscribe = subscribe(sessionId, update);
    return () => { live = false; newestRead += 1; unsubscribe(); };
  }, [me?.replacementStatus, me?.role, sessionId, subscribe]);

  const runChoice = useCallback(async (securityTeams: number) => {
    if (!view || view.type !== 'wolf-boarding-defence-choice-view' || view.choiceStatus !== 'pending' || busy) return;
    setBusy(true);
    setMessage(undefined);
    setError(undefined);
    try {
      await commitWolfBoardingDefenceChoice(
        view.turn, view.revision, view.targetShipId as WolfAttackTargetId, securityTeams,
      );
      setMessage('Boarding defence committed. The server will finish the attack after all required choices are recorded.');
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Boarding defence could not be committed. Refresh before retrying.');
      await refresh();
    } finally {
      setBusy(false);
    }
  }, [busy, refresh, view]);

  if (!sessionId || me?.role !== 'player' || me.replacementStatus != null ||
      !memberView || memberView.currentStep !== 'boarding') return null;
  if (!view) {
    return <section className="wolf-boarding-defence cic-frame" aria-label="Boarding defence">
      <p className="wolf-boarding-defence__notice" role="status">{error ?? 'Checking this ship’s current boarding choice…'}</p>
      <button type="button" className="cic-action-button" disabled={busy} onClick={() => void refresh()}>
        Refresh boarding defence
      </button>
    </section>;
  }
  const displayMessage = error ?? message;
  return <WolfBoardingDefencePanelView view={view} busy={busy}
    {...(displayMessage ? { message: displayMessage } : {})}
    onChoose={(securityTeams) => void runChoice(securityTeams)} />;
}
