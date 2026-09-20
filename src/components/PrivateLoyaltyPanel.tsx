import { useEffect, useState } from 'react';
import { useSessionStore } from '@/store/useSessionStore';
import type { PrivateLoyalty } from '@/types/game';
import { findConsoleRole } from '@/data/roles';
import { revealAndroidProof } from '@/lib/androidProofService';
import { submitWolfIntelligence } from '@/lib/wolfActionService';
import { normalizeCommandError } from '@/lib/commandErrors';
import { captureSessionAuthority, isCurrentSessionAuthority } from '@/lib/sessionMutationAuthority';
import { replacementRoleFor } from '@/data/replacementRoles';

const LOYALTY_LABELS: Readonly<Record<string, string>> = {
  'fleet-loyalist': 'Fleet Loyalist',
  'wolf-agent': 'Wolf Agent',
  'universal-arbour': 'Universal Arbour',
  'wolf-cult': 'Wolf Cult',
  friend: 'Friend',
  'intelligence-agent': 'Intelligence Agent',
  arbour: 'Arbour',
  cult: 'Cult',
  android: 'Android',
};

function loyaltyLabel(loyalty: PrivateLoyalty): string {
  return LOYALTY_LABELS[loyalty.kind] ?? loyalty.kind.replace(/[-_]/g, ' ');
}

function isCurrentAndroidCard(
  current: PrivateLoyalty | null,
  dispatched: PrivateLoyalty,
): boolean {
  // The object identity is the assignment cursor. A replacement card with
  // equal-looking fields must not inherit a delayed disclosure result.
  return current === dispatched && current.kind === 'android' && dispatched.kind === 'android';
}

function partnerLabel(loyalty: PrivateLoyalty): string | undefined {
  if (loyalty.kind === 'friend' && loyalty.partnerRoleId) {
    return findConsoleRole(loyalty.partnerRoleId)?.name ?? replacementRoleFor(loyalty.partnerRoleId)?.name;
  }
  return loyalty.kind === 'friend' ? undefined : loyalty.partnerUid;
}

function isEndgameEvaluationPhase(phase: unknown): boolean {
  return phase === 'success' || phase === 'failure' || phase === 'debrief' || phase === 'closed';
}

/** The current browser's private setup card; never accepts another player's id. */
export default function PrivateLoyaltyPanel() {
  const loyalty = useSessionStore((state) => state.privateLoyalty);
  const wolfCultIntelligence = useSessionStore((state) => state.wolfCultIntelligence);
  const setPrivateLoyalty = useSessionStore((state) => state.setPrivateLoyalty);
  const sessionId = useSessionStore((state) => state.session?.id);
  const sessionPhase = useSessionStore((state) => state.session?.phase);
  const currentCycle = useSessionStore((state) => state.session?.currentTurn);
  const endgameEvaluation = useSessionStore((state) =>
    isEndgameEvaluationPhase(state.session?.phase));
  const me = useSessionStore((state) => state.me);
  const identity = JSON.stringify([sessionId, me?.uid, me?.role, me?.activeConsoleRoleId, me?.replacementRoleId]);
  const [feedback, setFeedback] = useState<{
    identity: string; card: PrivateLoyalty; pending: boolean; error: string;
  } | null>(null);
  const [wolfMessage, setWolfMessage] = useState('');
  const [wolfPending, setWolfPending] = useState(false);
  const [wolfResult, setWolfResult] = useState<string | null>(null);
  const [wolfError, setWolfError] = useState('');
  const currentFeedback = feedback?.identity === identity && feedback.card === loyalty ? feedback : null;
  const pending = currentFeedback?.pending ?? false;
  const error = currentFeedback?.error ?? '';
  const wolfActionAvailable = sessionPhase === 'active' && Number.isSafeInteger(currentCycle) &&
    (currentCycle as number) >= 1;
  useEffect(() => { setFeedback(null); }, [identity, loyalty]);
  useEffect(() => {
    setWolfMessage('');
    setWolfPending(false);
    setWolfResult(null);
    setWolfError('');
  }, [identity, loyalty?.kind]);
  if (!loyalty) return null;

  const discloseAndroidProof = async () => {
    if (endgameEvaluation || pending || loyalty.kind !== 'android' || loyalty.proofRevealed) return;
    const state = useSessionStore.getState();
    if (isEndgameEvaluationPhase(state.session?.phase)) return;
    const checkpoint = captureSessionAuthority(state.session?.id ?? '', state.me?.uid);
    const dispatchedCard = loyalty;
    if (!checkpoint || !isCurrentSessionAuthority(checkpoint)) return;
    setFeedback({ identity, card: dispatchedCard, pending: true, error: '' });
    try {
      const result = await revealAndroidProof();
      const current = useSessionStore.getState();
      if (result.disclosed && isCurrentSessionAuthority(checkpoint) &&
          isCurrentAndroidCard(current.privateLoyalty, dispatchedCard)) {
        setPrivateLoyalty({ ...dispatchedCard, proofRevealed: true });
      }
    } catch (cause) {
      const current = useSessionStore.getState();
      if (isCurrentSessionAuthority(checkpoint) &&
          isCurrentAndroidCard(current.privateLoyalty, dispatchedCard)) {
        setFeedback((currentFeedback) => currentFeedback?.identity === identity &&
          currentFeedback.card === dispatchedCard
          ? { ...currentFeedback, error: normalizeCommandError(cause).message }
          : currentFeedback);
      }
    } finally {
      setFeedback((currentFeedback) => currentFeedback?.identity === identity &&
        currentFeedback.card === dispatchedCard
        ? { ...currentFeedback, pending: false }
        : currentFeedback);
    }
  };

  const sendWolfIntelligence = async () => {
    if (wolfPending || !wolfActionAvailable ||
        (loyalty.kind !== 'wolf-agent' && loyalty.kind !== 'wolf-cult')) return;
    const state = useSessionStore.getState();
    const checkpoint = captureSessionAuthority(state.session?.id ?? '', state.me?.uid);
    const dispatchedCard = loyalty;
    if (!checkpoint || !isCurrentSessionAuthority(checkpoint)) return;
    setWolfPending(true);
    setWolfResult(null);
    setWolfError('');
    try {
      const result = await submitWolfIntelligence(wolfMessage);
      const current = useSessionStore.getState();
      if (isCurrentSessionAuthority(checkpoint) && current.privateLoyalty === dispatchedCard &&
          (dispatchedCard.kind === 'wolf-agent' || dispatchedCard.kind === 'wolf-cult')) {
        setPrivateLoyalty({ ...dispatchedCard, suspicion: result.suspicion });
        setWolfMessage('');
        setWolfResult(`Handler message sent privately. Suspicion // ${result.suspicion}.`);
      }
    } catch (cause) {
      const current = useSessionStore.getState();
      if (isCurrentSessionAuthority(checkpoint) && current.privateLoyalty === dispatchedCard) {
        setWolfError(normalizeCommandError(cause).message);
      }
    } finally {
      if (isCurrentSessionAuthority(checkpoint)) setWolfPending(false);
    }
  };

  return (
    <div className="private-loyalty-flow" data-private-loyalty-flow="true">
      <section className="private-loyalty-panel cic-frame" aria-label="Private loyalty card">
        <p className="private-loyalty-panel__eyebrow">Private setup // your loyalty card</p>
        <h2>{loyaltyLabel(loyalty)}</h2>
        <p className="private-loyalty-panel__suspicion">
          Suspicion // {loyalty.suspicion === null ? 'unassigned' : loyalty.suspicion}
        </p>
        {partnerLabel(loyalty) && (
          <p className="private-loyalty-panel__partner">
            {loyalty.kind === 'friend' ? 'Friend trust // partner role' : 'Partner assignment'} // {partnerLabel(loyalty)}
          </p>
        )}
        {loyalty.kind === 'android' && (loyalty.proofRevealed ? (
          <p className="private-loyalty-panel__proof" role="status">
            Android proof disclosed to the fleet.
          </p>
        ) : (
          <div className="private-loyalty-panel__proof">
            <p>Show your Android card only when you choose to prove your loyalty to the fleet.</p>
            <button
              className="cic-action-button"
              type="button"
              disabled={endgameEvaluation || pending}
              onClick={() => void discloseAndroidProof()}
            >
              {pending ? 'Disclosing…' : 'Disclose Android proof'}
            </button>
            {endgameEvaluation && (
              <p className="private-loyalty-panel__proof-status" role="status">
                Endgame evaluation active // Android proof disclosure is frozen.
              </p>
            )}
            {error && <p role="alert">{error}</p>}
          </div>
        ))}
        {(loyalty.kind === 'wolf-agent' || loyalty.kind === 'wolf-cult') && (
          <section className="private-loyalty-panel__wolf-action" aria-labelledby="wolf-intelligence-title">
            <p className="eyebrow">Private Wolf action</p>
            <h3 id="wolf-intelligence-title">Send intelligence</h3>
            <label htmlFor="wolf-intelligence-message">Short handler message</label>
            <textarea
              id="wolf-intelligence-message"
              maxLength={240}
              rows={3}
              value={wolfMessage}
              disabled={wolfPending || !wolfActionAvailable}
              onChange={(event) => setWolfMessage(event.target.value)}
            />
            <button
              className="cic-action-button"
              type="button"
              disabled={wolfPending || !wolfActionAvailable || !wolfMessage.trim()}
              onClick={() => void sendWolfIntelligence()}
            >
              {wolfPending ? 'Sending…' : 'Send private intelligence'}
            </button>
            {!wolfActionAvailable && (
              <p className="private-loyalty-panel__proof-status" role="status">
                Private Wolf actions are available during active cycles.
              </p>
            )}
            {wolfResult && <p role="status">{wolfResult}</p>}
            {wolfError && <p role="alert">{wolfError}</p>}
          </section>
        )}
        {loyalty.kind === 'wolf-cult' && wolfCultIntelligence && (
          <section className="role-brief__rules role-brief__rules--wolf-cult-intelligence" aria-labelledby="wolf-cult-intelligence-title">
            <p className="eyebrow">{wolfCultIntelligence.label}</p>
            <h3 id="wolf-cult-intelligence-title">Wolf Cult intelligence</h3>
            <p>Active Wolf fortress // {wolfCultIntelligence.fortressCoordinate}</p>
            <p>Abandoned supplies // {wolfCultIntelligence.suppliesCoordinate}</p>
            <p>Other Wolf agent // {wolfCultIntelligence.agentUid}</p>
            <p>Code word // {wolfCultIntelligence.codeWord}</p>
          </section>
        )}
        <p className="private-loyalty-panel__note">
          This card belongs to this device identity only. Do not read it aloud on an open channel.
        </p>
      </section>
    </div>
  );
}
