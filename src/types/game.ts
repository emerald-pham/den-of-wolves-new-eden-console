/**
 * Shared shapes for the companion console.
 *
 * These are deliberately minimal -- enough to describe a session, its seats and
 * its players -- so that the ~40 interlocking game tables can be added as their
 * own modules under `src/types/` without reshaping the session model.
 */

/** Firestore document id. */
export type Id = string;

/** ISO-8601 instant, as written by the server. */
export type Timestamp = string;

export type SessionPhase = 'lobby' | 'briefing' | 'active' | 'debrief' | 'closed';

export interface GameSession {
  readonly id: Id;
  readonly name: string;
  /** Short human-shareable code players type to join. */
  readonly joinCode: string;
  readonly phase: SessionPhase;
  /** uid of the facilitator who may elevate others. */
  readonly ownerUid: Id;
  readonly createdAt: Timestamp;
  readonly updatedAt: Timestamp;
}

export type SeatStatus = 'open' | 'claimed' | 'locked';

export interface Seat {
  readonly id: Id;
  readonly sessionId: Id;
  readonly label: string;
  readonly factionId: Id | null;
  readonly status: SeatStatus;
  /** Set only by the server after a successful claim. */
  readonly holderUid: Id | null;
  readonly claimedAt: Timestamp | null;
}

export type PlayerRole = 'player' | 'gm' | 'observer';

export interface Player {
  readonly uid: Id;
  readonly sessionId: Id;
  readonly displayName: string;
  readonly role: PlayerRole;
  readonly seatId: Id | null;
  readonly joinedAt: Timestamp;
}

/** Anything the server generated and only some players may read. */
export interface SecretRecord {
  readonly id: Id;
  readonly sessionId: Id;
  readonly visibleToUids: readonly Id[];
  readonly payload: Readonly<Record<string, unknown>>;
  readonly createdAt: Timestamp;
}
