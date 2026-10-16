import { useEffect, useRef, useState } from 'react';
import { useSessionStore } from '@/store/useSessionStore';
import type { CandidateDebriefPathStep, GameSession, SessionDebriefSnapshot } from '@/types/game';
import { beginSessionDebrief, closeSession, getSessionDebrief } from '@/lib/sessionService';
import FocusDialog from './FocusDialog';
import './EndgameDialog.css';

function endgameCopy(session: GameSession): string {
  const snapshot = session.debriefSnapshot;
  if (session.phase === 'closed' && snapshot) {
    return `Session closed after Cycle ${snapshot.cycle} // The server-frozen result remains available to entitled readers.`;
  }
  const outcome = snapshot?.outcome ?? session.gameOutcome;
  if (outcome?.cause === 'candidate-complete') {
    const code = outcome.candidateCode ?? snapshot?.candidate?.code;
    return `Candidate ${code ?? 'system'} completed in Cycle ${outcome.cycle} // Server calculations and the committed route are frozen.`;
  }
  if (session.gameOutcome?.cause === 'pursuit-limit') {
    return `Pursuit reached 10 in Cycle ${session.gameOutcome.cycle} // Endgame evaluation active. Gameplay controls are frozen.`;
  }
  if (session.gameOutcome?.cause === 'total-fleet-loss') {
    return `All full fleet ships lost in Cycle ${session.gameOutcome.cycle} // Survivors, escape pods, and small craft remain available for endgame evaluation. Gameplay controls are frozen.`;
  }
  if (snapshot?.source === 'final-cycle') {
    return `Final cycle complete in Cycle ${snapshot.cycle} // The survivor ledger is frozen for debrief.`;
  }
  return 'Final cycle complete // Endgame evaluation in progress. Gameplay controls are frozen.';
}

function readableId(value: string): string {
  const phrase = value.replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
  return phrase ? `${phrase[0]!.toUpperCase()}${phrase.slice(1)}` : phrase;
}

function readableGroupId(value: string): string {
  return readableId(value).replace(/\b[a-z]\b/g, letter => letter.toUpperCase());
}

const PATH_LABELS: Record<CandidateDebriefPathStep['action'], string> = {
  'ring-repair': 'Ring repair', 'ring-passage': 'Ring passage', 'sabotage-ring': 'Ring sabotage',
  'nebula-jump': 'Nebula jump', 'station-liberation': 'Station liberation',
  'contribute-reactor': 'Reactor contribution', 'station-activation': 'Station activation',
};

function pathStepCopy(step: CandidateDebriefPathStep): string {
  const result = step.result.replace('-', ' ');
  const actor = step.shipId ? ` — ${readableId(step.shipId)}` : '';
  const fuel = step.fuelSpent === undefined ? '' : ` // fuel spent ${step.fuelSpent}`;
  const capacity = step.capacity === undefined ? '' : ` // capacity ${step.capacity}`;
  return `${PATH_LABELS[step.action]} — ${result}${actor}${fuel}${capacity}`;
}

function CandidateSummary({ snapshot }: { readonly snapshot: SessionDebriefSnapshot }) {
  const candidate = snapshot.candidate;
  if (!candidate) return null;
  return (
    <section className="endgame-debrief__candidate" aria-label={`Candidate ${candidate.code} route`}>
      <p className="cic-overline">CANDIDATE // {candidate.code}</p>
      <h3>Candidate {candidate.code} route</h3>
      {candidate.groups.map((group, index) => (
        <article className="endgame-debrief__group" key={group.groupId ?? `entitled-group-${index}`}>
          <h4>{group.groupId ? `Group ${readableGroupId(group.groupId)}` : 'Your fleet'}</h4>
          <section aria-label="Candidate requirements">
            <h5>Requirements</h5>
            {group.requirements.length > 0 ? (
              <ul>{group.requirements.map(item => (
                <li key={item.id}>{readableId(item.id)}: {item.status}</li>
              ))}</ul>
            ) : <p>No unmet or met requirements were recorded.</p>}
          </section>
          {group.path && (
            <section aria-label="Candidate path">
              <h5>Path</h5>
              {group.path.length > 0 ? (
                <ol>{group.path.map((step, stepIndex) => <li key={`${step.action}-${stepIndex}`}>{pathStepCopy(step)}</li>)}</ol>
              ) : <p>No route steps were recorded for this fleet.</p>}
            </section>
          )}
          <section aria-label="Server rolls">
            <h5>Server rolls</h5>
            {group.rolls.length > 0 ? (
              <ul>{group.rolls.map((roll, rollIndex) => (
                <li key={`${roll.id}-${rollIndex}`}>Server roll: {readableId(roll.id)} — {roll.result}
                  {roll.face === undefined ? '' : ` // face ${roll.face}`}
                </li>
              ))}</ul>
            ) : <p>No rolls were recorded for this fleet.</p>}
          </section>
          <section aria-label="Candidate losses">
            <h5>Losses</h5>
            {group.losses.length > 0 ? (
              <ul>{group.losses.map(loss => (
                <li key={`${loss.shipId}-${loss.reason}`}>{readableId(loss.shipId)} — {readableId(loss.reason)}</li>
              ))}</ul>
            ) : <p>No losses were recorded for this fleet.</p>}
          </section>
          <section aria-label="Recorded facilitator calls">
            <h5>Recorded GM calls</h5>
            {group.humanCalls.length > 0 ? (
              <ul>{group.humanCalls.map((call, callIndex) => (
                <li key={`${call.id}-${callIndex}`}>Recorded GM call: {readableId(call.id)} (Cycle {call.cycle})</li>
              ))}</ul>
            ) : <p>No facilitator calls were recorded for this fleet.</p>}
          </section>
        </article>
      ))}
    </section>
  );
}

function SurvivorSummary({ snapshot }: { readonly snapshot: SessionDebriefSnapshot }) {
  const outcome = snapshot.survivorOutcome;
  if (!outcome) return null;
  return (
    <section className="endgame-debrief__survivors" aria-label="Survivor ledger">
      <p className="cic-overline">SURVIVOR LEDGER // CYCLE {outcome.cycle}</p>
      <h3>Survivor ledger</h3>
      <dl>
        <div><dt>Final survivors</dt><dd>{outcome.finalSurvivors.toLocaleString()}</dd></div>
        <div><dt>Fleet population</dt><dd>{outcome.fleetShipPopulation.toLocaleString()}</dd></div>
        <div><dt>Surviving fleet ships</dt><dd>{outcome.survivingShipPopulation.toLocaleString()}</dd></div>
        <div><dt>Evacuated population</dt><dd>{outcome.evacuatedPopulation.toLocaleString()}</dd></div>
        <div><dt>Lost population</dt><dd>{outcome.lostPopulation.toLocaleString()}</dd></div>
        <div><dt>Small craft population</dt><dd>{outcome.smallVesselPopulation.toLocaleString()}</dd></div>
        <div><dt>Admitted vessel population</dt><dd>{outcome.admittedVesselPopulation.toLocaleString()}</dd></div>
      </dl>
    </section>
  );
}

function friendlyFailure(): string {
  return 'The server did not commit this debrief action. Check the GM connection and retry.';
}

/** Presents the entitled frozen route while lifecycle actions remain server-owned GM commands. */
export default function EndgameDialog() {
  const session = useSessionStore((state) => state.session);
  const me = useSessionStore((state) => state.me);
  const gmInstance = useSessionStore((state) => state.gmInstance);
  const reviewRef = useRef<HTMLButtonElement | null>(null);
  const [dismissedKey, setDismissedKey] = useState<string | null>(null);
  const [gmSnapshot, setGmSnapshot] = useState<SessionDebriefSnapshot | null>(null);
  const [actionPending, setActionPending] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const terminalPhase = session?.phase === 'success' || session?.phase === 'failure' ||
    session?.phase === 'debrief' || session?.phase === 'closed';
  const outcomeKey = session && terminalPhase
    ? `${session.id}:${session.gameOutcome
      ? `${session.gameOutcome.cause}:${session.gameOutcome.cycle}`
      : `debrief:${session.debriefSnapshot?.committedAt ?? 'uncommitted'}`}`
    : null;
  const open = outcomeKey !== null && dismissedKey !== outcomeKey;
  const hasLiveGmInstance = !!session && me?.role === 'gm' && me.sessionId === session.id &&
    gmInstance?.sessionId === session.id && gmInstance.uid === me.uid;

  useEffect(() => {
    if (!session || !hasLiveGmInstance || (session.phase !== 'debrief' && session.phase !== 'closed')) {
      setGmSnapshot(null);
      return;
    }
    let current = true;
    setGmSnapshot(null);
    void getSessionDebrief().then(snapshot => {
      if (current) setGmSnapshot(snapshot);
    }).catch(() => {
      if (current) setGmSnapshot(null);
    });
    return () => { current = false; };
  }, [hasLiveGmInstance, gmInstance?.id, session?.id, session?.phase, session?.debriefSnapshot?.committedAt]);

  if (!session || !outcomeKey) return null;

  const displayedDebrief = gmSnapshot ?? session.debriefSnapshot;
  const canBegin = hasLiveGmInstance && session.phase === 'failure';
  const canClose = hasLiveGmInstance && session.phase === 'debrief';

  async function runLifecycleAction(action: 'begin' | 'close') {
    setActionPending(true);
    setActionError(null);
    setActionMessage(null);
    try {
      const result = action === 'begin' ? await beginSessionDebrief() : await closeSession();
      setActionMessage(result.phase === 'closed' ? 'The frozen debrief is now closed.' : 'The failure debrief is frozen.');
    } catch {
      setActionError(friendlyFailure());
    } finally {
      setActionPending(false);
    }
  }

  return (
    <>
      <button
        ref={reviewRef}
        className="cic-text-button focus-dialog-review"
        type="button"
        onClick={() => setDismissedKey(null)}
      >
        Review endgame evaluation
      </button>
      <FocusDialog
        open={open}
        title="Endgame evaluation"
        description="The session has entered its server-reported endgame state."
        dialogKey={outcomeKey}
        restoreRef={reviewRef}
        onClose={() => setDismissedKey(outcomeKey)}
      >
        <div className="endgame-debrief">
          <p className="endgame-debrief__status">{endgameCopy(session)}</p>
          {!hasLiveGmInstance && session.phase === 'failure' && <p>
            Next actor // A live GM freezes the failure into a debrief. Review the retained result while waiting.
          </p>}
          {!hasLiveGmInstance && session.phase === 'debrief' && <p>
            Next actor // A live GM closes the session after the committed debrief is available and reviewed.
          </p>}
          {displayedDebrief && <>
            <p className="endgame-debrief__result">Server result // {readableId(displayedDebrief.result)} // Cycle {displayedDebrief.cycle}</p>
            <CandidateSummary snapshot={displayedDebrief} />
            <SurvivorSummary snapshot={displayedDebrief} />
          </>}
          {hasLiveGmInstance && session.phase === 'debrief' && !gmSnapshot && !session.debriefSnapshot && (
            <p role="status">Reading the committed facilitator debrief…</p>
          )}
          {canBegin && <button className="cic-action-button cic-action-button--confirm" type="button"
            disabled={actionPending} onClick={() => void runLifecycleAction('begin')}>
            {actionPending ? 'Freezing debrief…' : 'Freeze failure into debrief'}
          </button>}
          {canClose && <button className="cic-action-button" type="button"
            disabled={actionPending || !displayedDebrief} onClick={() => void runLifecycleAction('close')}>
            {actionPending ? 'Closing session…' : 'Close session'}
          </button>}
          {actionMessage && <p className="endgame-debrief__message" role="status">{actionMessage}</p>}
          {actionError && <p className="endgame-debrief__error" role="alert">{actionError}</p>}
        </div>
      </FocusDialog>
    </>
  );
}
