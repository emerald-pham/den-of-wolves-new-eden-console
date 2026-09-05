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

export type GalacticCoordinate = string;
export type ShipGalacticCoordinates = Readonly<Record<string, GalacticCoordinate>>;

export interface GameSession {
  readonly id: Id;
  readonly name: string;
  /** Short human-shareable code players type to join. */
  readonly joinCode: string;
  readonly phase: SessionPhase;
  /** Expansion ship availability; absent legacy values are treated as enabled. */
  readonly capybaraEnabled?: boolean;
  /** Four-digit system code for every fleet ship; legacy sessions begin at 0000. */
  readonly shipGalacticCoordinates?: ShipGalacticCoordinates;
  /** Locks subsequent GM claims while at least one GM remains present. */
  readonly gmControlsLocked?: boolean;
  /** Playable role ids currently eligible for a random wolf assignment. */
  readonly wolfEligibleRoleIds?: readonly string[];
  /** Playable role ids currently offered by role selection. */
  readonly activeRoleIds?: readonly string[];
  readonly shuttleDockings?: readonly ShuttleDocking[];
  readonly shuttleVisitLog?: readonly ShuttleVisit[];
  /** Fleet ships whose one-shot bridge dispenser has already been fired. */
  readonly confettiUsedShipIds?: readonly string[];
  /** uid of the facilitator who may elevate others. */
  readonly ownerUid: Id;
  readonly createdAt: Timestamp;
  readonly updatedAt: Timestamp;
}

export interface ShuttleDocking {
  readonly shuttleId: Id;
  readonly shipId: Id;
  readonly dockedAt: Timestamp;
}

export interface ShuttleVisit {
  readonly id: Id;
  readonly shuttleId: Id;
  readonly shipId: Id;
  readonly action: 'docked' | 'departed';
  readonly occurredAt: Timestamp;
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
  /** Server-authoritative command post held by this device until explicitly released. */
  readonly activeConsoleRoleId?: string | null;
  readonly joinedAt: Timestamp;
}

/** One browser/device that has independently claimed GM authority. */
export interface GmInstance {
  readonly id: Id;
  readonly sessionId: Id;
  readonly uid: Id;
  readonly name: string;
  readonly deviceLabel: string;
  readonly claimedAt: Timestamp;
}

export interface ShipConfettiEvent {
  readonly id: Id;
  readonly sessionId: Id;
  readonly type: 'ship-confetti';
  readonly shipId: Id;
  readonly shipName: string;
  readonly actorName: string;
  readonly actorRoleName: string;
  readonly createdAt: Timestamp;
}

export interface FullscreenAlertEvent {
  readonly id: Id;
  readonly sessionId: Id;
  readonly type: 'fullscreen-alert';
  readonly sourceRoleName: string;
  readonly message: string;
  readonly createdAt: Timestamp;
}

export type SessionEvent = ShipConfettiEvent | FullscreenAlertEvent;

/** Anything the server generated and only some players may read. */
export interface SecretRecord {
  readonly id: Id;
  readonly sessionId: Id;
  readonly visibleToUids: readonly Id[];
  readonly payload: Readonly<Record<string, unknown>>;
  readonly createdAt: Timestamp;
}
