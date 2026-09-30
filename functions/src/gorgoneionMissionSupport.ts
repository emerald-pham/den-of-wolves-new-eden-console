import {
  parseMissionDeckState,
  type MissionCardId,
  type MissionDeckState,
} from './missionDeck';

const MISSION_SUPPORT_CARD_COUNT = 5;
const SUPPORT_PHASE = 'before-first-deal';
const COMMAND_KEYS = new Set([
  'deckState',
  'phase',
  'dealtCount',
  'topCardIds',
  'bottomCardIds',
]);

/** Valid command shape for the pre-deal Gorgoneion support policy. */
export interface GorgoneionMissionSupportInput {
  readonly deckState: MissionDeckState;
  readonly phase: 'before-first-deal';
  readonly dealtCount: 0;
  /** Partition of the inspected five; array order does not define card order. */
  readonly topCardIds: readonly MissionCardId[];
  /** Partition of the inspected five; array order does not define card order. */
  readonly bottomCardIds: readonly MissionCardId[];
}

/**
 * Apply the Gorgoneion Captain's printed top-five support choice.
 *
 * Each destination array must form part of an exact partition of the inspected
 * five. The result preserves original relative order within each destination
 * group and leaves the untouched deck tail between the top and bottom groups.
 * The caller must derive `phase` and `dealtCount` from authoritative mission
 * state. This pure policy validates that snapshot and the exact partition, but
 * does not establish craft admission, Captain entitlement, privacy, transaction
 * atomicity, or replay authority.
 */
export function applyGorgoneionMissionSupport(value: unknown): MissionDeckState | null {
  if (!isRecord(value) || !hasExactKeys(value, COMMAND_KEYS) ||
      value.phase !== SUPPORT_PHASE || !Number.isSafeInteger(value.dealtCount) ||
      value.dealtCount !== 0 || !Array.isArray(value.topCardIds) ||
      !Array.isArray(value.bottomCardIds) ||
      value.topCardIds.length + value.bottomCardIds.length !== MISSION_SUPPORT_CARD_COUNT) {
    return null;
  }

  const deckState = parseMissionDeckState(value.deckState);
  if (!deckState || deckState.order.length < MISSION_SUPPORT_CARD_COUNT) return null;

  const inspectedTopFive = deckState.order.slice(0, MISSION_SUPPORT_CARD_COUNT);
  const inspectedSet = new Set<string>(inspectedTopFive);
  const topIds = validateDestination(value.topCardIds, inspectedSet);
  const bottomIds = validateDestination(value.bottomCardIds, inspectedSet);
  if (!topIds || !bottomIds) return null;

  const assignedIds = [...topIds, ...bottomIds];
  if (new Set(assignedIds).size !== MISSION_SUPPORT_CARD_COUNT ||
      assignedIds.some((cardId) => !inspectedSet.has(cardId))) {
    return null;
  }

  const topSet = new Set(topIds);
  const bottomSet = new Set(bottomIds);
  const order: MissionCardId[] = [
    ...inspectedTopFive.filter((cardId) => topSet.has(cardId)),
    ...deckState.order.slice(MISSION_SUPPORT_CARD_COUNT),
    ...inspectedTopFive.filter((cardId) => bottomSet.has(cardId)),
  ];

  return {
    schemaVersion: deckState.schemaVersion,
    deckId: deckState.deckId,
    order,
  };
}

function validateDestination(value: readonly unknown[], inspectedTopFive: ReadonlySet<string>): MissionCardId[] | null {
  const seen = new Set<string>();
  const cardIds: MissionCardId[] = [];
  for (const cardId of value) {
    if (typeof cardId !== 'string' || !inspectedTopFive.has(cardId) || seen.has(cardId)) return null;
    seen.add(cardId);
    cardIds.push(cardId as MissionCardId);
  }
  return cardIds;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, expected: ReadonlySet<string>): boolean {
  const keys = Object.keys(value);
  return keys.length === expected.size && keys.every((key) => expected.has(key));
}
