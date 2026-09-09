import { useSessionStore } from '@/store/useSessionStore';
import type { PrivateLoyalty } from '@/types/game';

const LOYALTY_LABELS: Readonly<Record<string, string>> = {
  'fleet-loyalist': 'Fleet Loyalist',
  'wolf-agent': 'Wolf Agent',
  friend: 'Friend',
  intelligence: 'Intelligence',
  arbour: 'Arbour',
  cult: 'Cult',
  android: 'Android',
};

function loyaltyLabel(loyalty: PrivateLoyalty): string {
  return LOYALTY_LABELS[loyalty.kind] ?? loyalty.kind.replace(/[-_]/g, ' ');
}

/** The current browser's private setup card; never accepts another player's id. */
export default function PrivateLoyaltyPanel() {
  const loyalty = useSessionStore((state) => state.privateLoyalty);
  if (!loyalty) return null;

  return (
    <section className="private-loyalty-panel cic-frame" aria-label="Private loyalty card">
      <p className="private-loyalty-panel__eyebrow">Private setup // your loyalty card</p>
      <h2>{loyaltyLabel(loyalty)}</h2>
      <p className="private-loyalty-panel__suspicion">
        Suspicion // {loyalty.suspicion === null ? 'unassigned' : loyalty.suspicion}
      </p>
      {loyalty.partnerUid && (
        <p className="private-loyalty-panel__partner">Partner assignment // {loyalty.partnerUid}</p>
      )}
      <p className="private-loyalty-panel__note">
        This card belongs to this browser identity only. Do not read it aloud on an open channel.
      </p>
    </section>
  );
}
