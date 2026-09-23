import { useRef, useState } from 'react';
import { useSessionStore } from '@/store/useSessionStore';
import type { GameSession } from '@/types/game';
import FocusDialog from './FocusDialog';

function endgameCopy(session: GameSession): string {
  const outcome = session.gameOutcome;
  if (outcome?.cause === 'pursuit-limit') {
    return `Pursuit reached 10 in Cycle ${outcome.cycle} // Endgame evaluation active. Gameplay controls are frozen.`;
  }
  if (outcome?.cause === 'total-fleet-loss') {
    return `All full fleet ships lost in Cycle ${outcome.cycle} // Survivors, escape pods, and small craft remain available for endgame evaluation. Gameplay controls are frozen.`;
  }
  return 'Final cycle complete // Endgame evaluation in progress. Gameplay controls are frozen.';
}

/** Presents only the current public terminal outcome and never infers a result. */
export default function EndgameDialog() {
  const session = useSessionStore((state) => state.session);
  const reviewRef = useRef<HTMLButtonElement | null>(null);
  const [dismissedKey, setDismissedKey] = useState<string | null>(null);
  const terminalPhase = session?.phase === 'success' || session?.phase === 'failure' ||
    session?.phase === 'debrief' || session?.phase === 'closed';
  const outcomeKey = session && terminalPhase
    ? `${session.id}:${session.gameOutcome
      ? `${session.gameOutcome.cause}:${session.gameOutcome.cycle}`
      : 'final-cycle'}`
    : null;
  const open = outcomeKey !== null && dismissedKey !== outcomeKey;

  if (!session || !outcomeKey) return null;

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
        <p>{endgameCopy(session)}</p>
      </FocusDialog>
    </>
  );
}
