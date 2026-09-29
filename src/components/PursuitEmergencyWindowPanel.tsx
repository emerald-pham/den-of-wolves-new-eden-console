import { useState } from 'react';
import { advanceTurn } from '@/lib/sessionService';
import type { PursuitEmergencyWindowAuthority } from '@/types/game';

interface Props {
  readonly active: boolean;
  readonly window?: PursuitEmergencyWindowAuthority | undefined;
}

interface DecisionAttempt {
  readonly requestId: string;
  readonly expectedTurn: number;
  readonly overridePhaseTimer: true;
  readonly pursuitEmergencyDecision: 'offer' | 'decline';
  readonly expectedPursuitNavigationRevision: number;
}

export default function PursuitEmergencyWindowPanel({ active, window: decisionWindow }: Props) {
  const [attempt, setAttempt] = useState<DecisionAttempt | null>(null);
  const [pending, setPending] = useState(false);
  const [confirmDecline, setConfirmDecline] = useState(false);
  const [notice, setNotice] = useState('');

  if (!active || !decisionWindow) return null;
  const currentWindow = decisionWindow;

  async function decide(decision: 'offer' | 'decline'): Promise<void> {
    if (pending) return;
    const request = attempt?.pursuitEmergencyDecision === decision ? attempt : {
      requestId: globalThis.crypto.randomUUID(),
      expectedTurn: currentWindow.cycle,
      overridePhaseTimer: true as const,
      pursuitEmergencyDecision: decision,
      expectedPursuitNavigationRevision: currentWindow.navigationRevision,
    };
    setAttempt(request);
    setPending(true);
    setNotice('Submitting the facilitator decision…');
    try {
      await advanceTurn(request);
      setAttempt(null);
      setNotice(decision === 'offer'
        ? 'Emergency jump offered to the at-risk fleet groups.'
        : 'Pursuit-limit run ended by facilitator decision.');
      setConfirmDecline(false);
    } catch {
      setNotice('Decision status unconfirmed. Retry the exact same request.');
    } finally {
      setPending(false);
    }
  }

  const groupNames = currentWindow.groupIds.map((id) => id.toUpperCase()).join(' // ');
  const retryAttempt = attempt !== null;

  return (
    <section className="pursuit-emergency-window cic-frame" aria-label="Pursuit emergency decision">
      <h2>Pursuit reached 10 // Cycle {currentWindow.cycle}</h2>
      <p>At-risk groups // {groupNames}</p>
      <p role="status">{notice || 'Waiting for facilitator decision.'}</p>
      {currentWindow.status === 'awaiting-gm-decision' && !retryAttempt && (
        <button type="button" disabled={pending} onClick={() => void decide('offer')}>
          Offer emergency jump
        </button>
      )}
      {retryAttempt && (
        <button type="button" disabled={pending} onClick={() => void decide(attempt.pursuitEmergencyDecision)}>
          {attempt.pursuitEmergencyDecision === 'offer'
            ? 'Retry exact emergency offer'
            : 'Retry exact pursuit-limit decision'}
        </button>
      )}
      {confirmDecline ? (
        <button type="button" disabled={pending} onClick={() => void decide('decline')}>
          Are you sure you want to end game?
        </button>
      ) : !retryAttempt && (
        <button type="button" disabled={pending} onClick={() => setConfirmDecline(true)}>
          End pursuit-limit run
        </button>
      )}
    </section>
  );
}
