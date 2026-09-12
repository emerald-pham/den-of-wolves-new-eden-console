import {
  missionCardsForState,
  type MissionCard,
  type MissionDeckState,
} from './missionDeck';

/**
 * The routed away-mission procedure names capable shuttles as the participant
 * boundary. Keep that source fact explicit instead of treating every role
 * holder or every session member as a participant.
 */
export const AWAY_MISSION_ROLE_CRAFT = {
  'wing-commander': ['starlight'],
  'icebreaker-miner': ['highwall'],
  'shepherd-scientist': ['endeavour'],
  'quellon-explorer': ['hummingbird'],
  'refinery-124-pdf-colonel': ['pdf-escort-fighter-wing'],
} as const satisfies Readonly<Record<string, readonly string[]>>;

export type AwayMissionParticipantSnapshot = Readonly<{
  uid: string;
  roleId: string;
  craftIds: readonly string[];
}>;

export type AwayMissionCardAllocation = Readonly<{
  participant: AwayMissionParticipantSnapshot;
  card: MissionCard;
}>;

/** Build an injective known-path ID for a mission/participant hand pair. */
export function awayMissionHandId(missionId: string, participantUid: string): string {
  return `m${missionId.length}_${missionId}u${participantUid.length}_${participantUid}`;
}

export function awayMissionCraftForRole(roleId: string): readonly string[] {
  return AWAY_MISSION_ROLE_CRAFT[roleId as keyof typeof AWAY_MISSION_ROLE_CRAFT] ?? [];
}

/** Read the mutable cursor that lives beside P402's immutable deck order. */
export function missionDeckDealtCount(value: unknown, deckLength: number): number | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const candidate = value as Record<string, unknown>;
  const cursor = candidate.dealtCount;
  if (cursor === undefined) return 0;
  return Number.isSafeInteger(cursor) && (cursor as number) >= 0 &&
    (cursor as number) <= deckLength ? cursor as number : null;
}

/** Allocate the next cards without changing the server-owned deck order. */
export function allocateMissionCards(
  state: MissionDeckState,
  dealtCount: number,
  participants: readonly AwayMissionParticipantSnapshot[],
): readonly AwayMissionCardAllocation[] | null {
  if (!Number.isSafeInteger(dealtCount) || dealtCount < 0 ||
      dealtCount + participants.length > state.order.length) return null;
  const cards = missionCardsForState(state).slice(dealtCount, dealtCount + participants.length);
  if (cards.length !== participants.length) return null;
  return participants.map((participant, index) => ({
    participant,
    card: cards[index]!,
  }));
}
