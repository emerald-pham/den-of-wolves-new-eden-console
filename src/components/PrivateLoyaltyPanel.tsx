import { useEffect, useState } from 'react';
import { useSessionStore } from '@/store/useSessionStore';
import type { PrivateLoyalty } from '@/types/game';
import { revealAndroidProof } from '@/lib/androidProofService';
import { normalizeCommandError } from '@/lib/commandErrors';
import { captureSessionAuthority, isCurrentSessionAuthority } from '@/lib/sessionMutationAuthority';

const LOYALTY_LABELS: Readonly<Record<string, string>> = {
  'fleet-loyalist': 'Fleet Loyalist',
  'wolf-agent': 'Wolf Agent',
  'universal-arbour': 'Universal Arbour',
  'wolf-cult': 'Wolf Cult',
  friend: 'Friend',
  intelligence: 'Intelligence',
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

/** The current browser's private setup card; never accepts another player's id. */
export default function PrivateLoyaltyPanel() {
  const loyalty = useSessionStore((state) => state.privateLoyalty);
  const setPrivateLoyalty = useSessionStore((state) => state.setPrivateLoyalty);
  const sessionId = useSessionStore((state) => state.session?.id);
  const me = useSessionStore((state) => state.me);
  const identity = JSON.stringify([sessionId, me?.uid, me?.role, me?.activeConsoleRoleId, me?.replacementRoleId]);
  const [feedback, setFeedback] = useState<{
    identity: string; card: PrivateLoyalty; pending: boolean; error: string;
  } | null>(null);
  const currentFeedback = feedback?.identity === identity && feedback.card === loyalty ? feedback : null;
  const pending = currentFeedback?.pending ?? false;
  const error = currentFeedback?.error ?? '';
  useEffect(() => { setFeedback(null); }, [identity, loyalty]);
  if (!loyalty) return null;

  const discloseAndroidProof = async () => {
    if (pending || loyalty.kind !== 'android' || loyalty.proofRevealed) return;
    const state = useSessionStore.getState();
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

  return (
    <div className="private-loyalty-flow" data-private-loyalty-flow="true">
      <section className="private-loyalty-panel cic-frame" aria-label="Private loyalty card">
        <p className="private-loyalty-panel__eyebrow">Private setup // your loyalty card</p>
        <h2>{loyaltyLabel(loyalty)}</h2>
        <p className="private-loyalty-panel__suspicion">
          Suspicion // {loyalty.suspicion === null ? 'unassigned' : loyalty.suspicion}
        </p>
        {loyalty.partnerUid && (
          <p className="private-loyalty-panel__partner">Partner assignment // {loyalty.partnerUid}</p>
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
              disabled={pending}
              onClick={() => void discloseAndroidProof()}
            >
              {pending ? 'Disclosing…' : 'Disclose Android proof'}
            </button>
            {error && <p role="alert">{error}</p>}
          </div>
        ))}
        <p className="private-loyalty-panel__note">
          This card belongs to this browser identity only. Do not read it aloud on an open channel.
        </p>
      </section>
    </div>
  );
}
