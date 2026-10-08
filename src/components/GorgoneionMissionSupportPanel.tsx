import { useId, type FormEvent } from 'react';
import './GorgoneionMissionSupportPanel.css';

const INSPECTED_CARD_COUNT = 5;
const RANK_NAMES: Readonly<Record<string, string>> = {
  A: 'Ace', 4: 'Four', 5: 'Five', 6: 'Six', 7: 'Seven', 8: 'Eight',
  9: 'Nine', 10: 'Ten', J: 'Jack', Q: 'Queen', K: 'King',
};
const SUIT_NAMES: Readonly<Record<string, string>> = {
  '♥': 'hearts', '♦': 'diamonds', '♣': 'clubs',
};

function cardFaceName(cardId: string): string | null {
  const match = /^(A|4|5|6|7|8|9|10|J|Q|K)([♥♦♣])$/.exec(cardId);
  if (!match) return null;
  const rank = RANK_NAMES[match[1]!];
  const suit = SUIT_NAMES[match[2]!];
  return rank && suit ? `${rank} of ${suit}` : null;
}

export interface GorgoneionMissionSupportProjection {
  /** Opaque IDs for the current inspected top five, in their original order. */
  readonly cardIds: readonly string[];
}

export interface GorgoneionMissionSupportPanelProps {
  /** Supply only while the parent has a current, entitled pre-deal projection. */
  readonly projection: GorgoneionMissionSupportProjection | null;
  readonly topCardIds: readonly string[];
  readonly bottomCardIds: readonly string[];
  readonly onPartitionChange: (
    topCardIds: readonly string[],
    bottomCardIds: readonly string[],
  ) => void;
  readonly onSubmit: (
    topCardIds: readonly string[],
    bottomCardIds: readonly string[],
  ) => void;
  readonly submitting?: boolean;
  readonly statusMessage?: string | null;
}

type Destination = 'top' | 'bottom';

function hasCurrentProjection(
  projection: GorgoneionMissionSupportProjection | null,
): projection is GorgoneionMissionSupportProjection {
  if (!projection || !Array.isArray(projection.cardIds) ||
      projection.cardIds.length !== INSPECTED_CARD_COUNT) {
    return false;
  }

  const cardIds = projection.cardIds;
  return cardIds.every((cardId) => typeof cardId === 'string' && cardFaceName(cardId) !== null) &&
    new Set(cardIds).size === INSPECTED_CARD_COUNT;
}

function hasExactPartition(
  projectedIds: readonly string[],
  topCardIds: readonly string[],
  bottomCardIds: readonly string[],
): boolean {
  if (topCardIds.length + bottomCardIds.length !== INSPECTED_CARD_COUNT) return false;

  const projected = new Set(projectedIds);
  const partition = [...topCardIds, ...bottomCardIds];
  return new Set(partition).size === INSPECTED_CARD_COUNT &&
    partition.every((cardId) => projected.has(cardId));
}

export default function GorgoneionMissionSupportPanel({
  projection,
  topCardIds,
  bottomCardIds,
  onPartitionChange,
  onSubmit,
  submitting = false,
  statusMessage = null,
}: GorgoneionMissionSupportPanelProps) {
  const id = useId();
  const titleId = `${id}-title`;
  const hasProjection = hasCurrentProjection(projection);
  const cardIds = hasProjection ? projection.cardIds : [];
  const canSubmit = hasProjection && !submitting &&
    hasExactPartition(cardIds, topCardIds, bottomCardIds);
  const topSet = new Set(topCardIds);
  const bottomSet = new Set(bottomCardIds);
  const orderedTopCardIds = cardIds.filter((cardId) => topSet.has(cardId));
  const orderedBottomCardIds = cardIds.filter((cardId) => bottomSet.has(cardId));

  function chooseDestination(cardId: string, destination: Destination): void {
    if (!hasProjection) return;

    const nextTop = new Set(topCardIds);
    const nextBottom = new Set(bottomCardIds);
    if (destination === 'top') {
      nextTop.add(cardId);
      nextBottom.delete(cardId);
    } else {
      nextTop.delete(cardId);
      nextBottom.add(cardId);
    }

    onPartitionChange(
      cardIds.filter((candidate) => nextTop.has(candidate)),
      cardIds.filter((candidate) => nextBottom.has(candidate)),
    );
  }

  function submit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (!canSubmit) return;
    onSubmit(orderedTopCardIds, orderedBottomCardIds);
  }

  return (
    <section className="gorgoneion-mission-support" aria-labelledby={titleId}>
      <p className="eyebrow">Pre-deal deck support</p>
      <h2 id={titleId}>Gorgoneion mission support</h2>
      <p className="gorgoneion-mission-support__instructions" id={`${id}-effect-help`}>Each group keeps its original order. Cards kept on top are drawn before the untouched deck; cards moved to the bottom are drawn after it. Applying this one-use support does not deal cards or start a mission.</p>
      <form onSubmit={submit}>
        {hasProjection ? (
          <>
            <p className="gorgoneion-mission-support__instructions">
              Assign each projected card to stay on top or move to the bottom before any deal.
            </p>
            {(statusMessage || submitting || !canSubmit) && <p className="gorgoneion-mission-support__status" role="status">
              {statusMessage ?? (submitting
                ? 'Applying the one-use pre-deal deck support…'
                : 'Choose one destination for each of the five cards.')}
            </p>}
            <div className="gorgoneion-mission-support__cards" role="group" aria-label="Top-five card destinations">
              {cardIds.map((cardId, index) => {
                const cardNumber = index + 1;
                const faceName = cardFaceName(cardId);
                if (!faceName) return null;
                const cardLabel = `Card ${cardNumber} — ${faceName}`;
                const groupId = `${id}-card-${cardNumber}`;
                const isOnTop = topSet.has(cardId) && !bottomSet.has(cardId);
                const isOnBottom = bottomSet.has(cardId) && !topSet.has(cardId);

                return (
                  <fieldset className="gorgoneion-mission-support__card" key={cardId}>
                    <legend>{cardLabel}</legend>
                    <label className="gorgoneion-mission-support__choice" htmlFor={`${groupId}-top`}>
                      <input
                        id={`${groupId}-top`}
                        type="radio"
                        name={groupId}
                        checked={isOnTop}
                        onChange={() => chooseDestination(cardId, 'top')}
                      />
                      Keep on top
                    </label>
                    <label className="gorgoneion-mission-support__choice" htmlFor={`${groupId}-bottom`}>
                      <input
                        id={`${groupId}-bottom`}
                        type="radio"
                        name={groupId}
                        checked={isOnBottom}
                        onChange={() => chooseDestination(cardId, 'bottom')}
                      />
                      Move to bottom
                    </label>
                  </fieldset>
                );
              })}
            </div>
          </>
        ) : (
          <p className="gorgoneion-mission-support__status" role="status">
            {statusMessage ?? 'Deck support unavailable // A current top-five projection is required.'}
          </p>
        )}
        <div className="gorgoneion-mission-support__actions">
          <button className="cic-action-button" type="submit" aria-describedby={`${id}-effect-help`} disabled={!canSubmit || submitting}>
            Apply deck support
          </button>
        </div>
      </form>
    </section>
  );
}
