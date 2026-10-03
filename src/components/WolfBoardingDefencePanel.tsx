import { useEffect, useState } from 'react';
import { subscribeWolfAttackMemberView } from '@/lib/firestore';
import { commitWolfBoardingDefenceChoice, getWolfBoardingDefenceChoice } from '@/lib/sessionService';
import type {
  WolfAttackMemberView,
  WolfBoardingDefenceChoiceReadResult,
} from '@/types/game';
import { useWolfAttackChoiceAuthority, useWolfAttackChoiceController } from '@/lib/wolfAttackChoiceController';
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
  const draftKey = view.type === 'wolf-boarding-defence-choice-view'
    ? JSON.stringify([view.sessionId, view.turn, view.revision, view.targetShipId, view.boardingParties,
      view.availableSecurityTeams, view.choiceStatus, view.chosenSecurityTeams ?? null])
    : JSON.stringify([view.sessionId, 'unavailable', view.reason]);
  useEffect(() => {
    setSelectedTeams('');
  }, [draftKey]);

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
  const authority = useWolfAttackChoiceAuthority('ship-crew', suppliedSessionId);
  const { memberView, view, busy, message, error, refresh, runMutation } = useWolfAttackChoiceController({
    authority,
    actor: 'ship-crew',
    expectedStep: isWolfBoardingStep,
    read: getWolfBoardingDefenceChoice,
    readMatches: boardingReadMatches,
    subscribe,
    readFailureMessage: 'Could not refresh boarding defence.',
    mutationFailureMessage: 'Boarding defence could not be committed. Refresh before retrying.',
  });
  const sessionId = authority.sessionId;

  if (!sessionId || !authority.actorReady) return null;
  if (!authority.ready) {
    return <section className="wolf-boarding-defence cic-frame" aria-label="Boarding defence">
      <p className="wolf-boarding-defence__notice" role="status">Waiting for the live server session before showing boarding defence.</p>
    </section>;
  }
  if (!memberView || memberView.currentStep !== 'boarding') return null;
  if (!view) {
    return <section className="wolf-boarding-defence cic-frame" aria-label="Boarding defence">
      <p className="wolf-boarding-defence__notice" role="status">{error ?? 'Checking this ship’s current boarding choice…'}</p>
      <button type="button" className="cic-action-button" disabled={busy} onClick={refresh}>
        Refresh boarding defence
      </button>
    </section>;
  }
  if (view.type === 'wolf-boarding-defence-choice-unavailable') {
    return <WolfBoardingDefencePanelView view={view} busy={busy}
      {...(error ? { message: error } : {})} onChoose={() => undefined} />;
  }
  const displayMessage = error ?? message;
  return <WolfBoardingDefencePanelView view={view} busy={busy}
    {...(displayMessage ? { message: displayMessage } : {})}
    onChoose={(securityTeams) => runMutation(
      () => commitWolfBoardingDefenceChoice(
        view.turn, view.revision, view.targetShipId, securityTeams,
      ),
      'Boarding defence committed. The server will finish the attack after all required choices are recorded.',
    )} />;
}

function isWolfBoardingStep(member: WolfAttackMemberView): boolean {
  return member.currentStep === 'boarding';
}

function boardingReadMatches(value: WolfBoardingDefenceChoiceReadResult, member: WolfAttackMemberView): boolean {
  if (value.type === 'wolf-boarding-defence-choice-unavailable') return value.sessionId === member.sessionId;
  return value.sessionId === member.sessionId && value.turn === member.turn &&
    value.revision === member.revision && member.currentStep === 'boarding';
}
