import type { ReactNode } from 'react';

export type DecisionActorVisibility = 'known' | 'withheld' | 'unavailable';

interface DecisionAttributionProps {
  readonly source: string;
  readonly actorUid?: string | undefined;
  readonly actorVisibility?: DecisionActorVisibility;
  readonly recordedAt?: string | undefined;
}

function recordedTime(recordedAt: string): ReactNode {
  const parsed = new Date(recordedAt);
  if (!Number.isFinite(parsed.getTime())) return 'time unavailable in this projection';
  return <time dateTime={recordedAt}>{parsed.toLocaleString()}</time>;
}

/**
 * A small, projection-aware label for facilitator decisions. The caller must
 * choose whether an actor is known, intentionally withheld, or unavailable;
 * this component never guesses a human name or a missing timestamp.
 */
export default function DecisionAttribution({
  source,
  actorUid,
  actorVisibility = 'known',
  recordedAt,
}: DecisionAttributionProps) {
  const actor = actorVisibility === 'withheld'
    ? 'facilitator identity withheld'
    : actorVisibility === 'unavailable'
      ? 'unavailable in this projection'
      : actorUid
        ? `facilitator // ${actorUid}`
        : 'unavailable in this projection';

  return (
    <section className="decision-attribution" aria-label="Decision attribution">
      <p>Decision source // {source || 'facilitator record'}</p>
      <p>Decision actor // {actor}</p>
      <p>Decision time // {recordedAt ? recordedTime(recordedAt) : 'unavailable in this projection'}</p>
    </section>
  );
}
