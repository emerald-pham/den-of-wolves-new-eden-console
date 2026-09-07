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
export interface ShipResourceValues {
  readonly ore: number;
  readonly fuel: number;
  readonly food: number;
  readonly water: number;
  readonly materials: number;
  readonly securityTeams: number;
  readonly scrap?: number;
}
export type ShipResources = Readonly<Record<string, ShipResourceValues>>;

export interface ShipDamageState {
  readonly damagedSystemIds: readonly string[];
  readonly destroyed: boolean;
}

export type ShipDamage = Readonly<Record<string, ShipDamageState>>;

export interface UnrestAlert {
  readonly shipId: string;
  readonly shipName: string;
  readonly targetGmInstanceIds: readonly string[];
  readonly createdAt: Timestamp;
}

export interface PopulationAlert extends UnrestAlert {
  readonly population: number;
}

export interface MaintenanceCycle {
  readonly step: number;
  readonly revision: number;
  readonly results: Readonly<Record<string, string>>;
  readonly charges: readonly string[];
  readonly refuelled: readonly string[];
  readonly turn?: number;
  readonly rationBonus?: number;
  readonly startedAt?: Timestamp;
  readonly completedAt?: Timestamp;
  /** Links a damage-causing step to the shared record for the card that was drawn. */
  readonly damageDrawId?: Id;
}

export interface PressDispatch {
  readonly id: string;
  readonly text: string;
}

export interface PressDispatchState {
  readonly dispatches: readonly PressDispatch[];
  readonly revision: number;
}

/** The shared real-time window that starts with every numbered turn. */
export interface TurnPhase {
  readonly turn: number;
  /** End of the team window: ten minutes on Turn 1, five minutes afterward. */
  readonly teamPhaseEndsAt: Timestamp;
  /** End of the coordination window: twenty minutes on Turn 1, fifteen afterward. */
  readonly openAirspaceEndsAt: Timestamp;
  readonly airspace: {
    readonly state: 'restricted' | 'lifted';
    /** Stays true until AEGIS or Press publishes newer fleet-broadcast copy. */
    readonly tickerActive: boolean;
    /** AEGIS may grant this exception to non-affiliated SNN vessels during restriction. */
    readonly pressAccess: boolean;
  };
}

export interface TurnStartAnnouncement {
  readonly turn: number;
  readonly survivorPopulation: number;
  /** Increments when the GM deliberately replays this transmission. */
  readonly revision?: number;
}

/** A browser-local GM replay; it is intentionally never persisted or shared. */
export interface TurnStartReplay {
  readonly sessionId: Id;
  readonly turn: number;
  readonly survivorPopulation: number;
  readonly token: number;
}

export interface GameSession {
  /** Shared game turn advanced by an active GM; new sessions begin at Turn 0. */
  readonly currentTurn?: number;
  /** The most recently authorized fleet-status transmission for a turn start. */
  readonly turnStartAnnouncement?: TurnStartAnnouncement;
  /** Current server-authorized real-time phase and airspace directive. */
  readonly turnPhase?: TurnPhase;
  readonly fleetRedAlert?: {
    readonly active: boolean;
    readonly revision: number;
    readonly text?: string;
    /** ISO-8601 instant for the last raised alert, used to enforce cooldown policy. */
    readonly raisedAt?: string;
  };
  /** GM-controlled presentation state for the shared end-of-session finale. */
  readonly debriefMode?: {
    readonly active: boolean;
    readonly revision: number;
  };
  readonly pressDispatch?: PressDispatchState;
  readonly maintenanceCycles?: Readonly<Record<string, MaintenanceCycle>>;
  readonly shuttleCargo?: Readonly<Record<string, Readonly<Record<string, number>>>>;
  readonly shuttleFuelled?: Readonly<Record<string, boolean>>;
  readonly shipUpgrades?: Readonly<Record<string, readonly string[]>>;
  readonly shipSurvivors?: Readonly<Record<string, number>>;
  readonly populationAlerts?: Readonly<Record<string, PopulationAlert>>;
  readonly id: Id;
  readonly name: string;
  /** Short human-shareable code players type to join. */
  readonly joinCode: string;
  readonly phase: SessionPhase;
  /** Configurable ship availability; absent legacy values are treated as enabled. */
  readonly capybaraEnabled?: boolean;
  readonly dioneEnabled?: boolean;
  /** Four-digit system code for every fleet ship; legacy sessions begin at 0000. */
  readonly shipGalacticCoordinates?: ShipGalacticCoordinates;
  /** Shared resource stock by fleet ship; legacy sessions use the printed starting stock. */
  readonly shipResources?: ShipResources;
  /** Drawn damage cards by ship; absent legacy sessions begin with an intact deck. */
  readonly shipDamage?: ShipDamage;
  /** Per-ship unrest ranges from 0–10; the physical-style dial fails above 7. */
  readonly shipUnrest?: Readonly<Record<string, number>>;
  /** Threshold alerts awaiting acknowledgement by the GM instances active when triggered. */
  readonly unrestAlerts?: Readonly<Record<string, UnrestAlert>>;
  /** Locks subsequent GM claims while at least one GM remains present. */
  readonly gmControlsLocked?: boolean;
  /** Playable role ids currently offered by role selection. */
  readonly activeRoleIds?: readonly string[];
  readonly shuttleDockings?: readonly ShuttleDocking[];
  readonly shuttleVisitLog?: readonly ShuttleVisit[];
  /** Fleet ships whose one-shot bridge dispenser has already been fired. */
  readonly confettiUsedShipIds?: readonly string[];
  /** Latest server-authorized manual DRADIS contact; automatic traffic derives from createdAt. */
  readonly dradisContactTriggeredAt?: Timestamp;
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

export interface MaintenanceEvent {
  readonly id: Id;
  readonly sessionId: Id;
  readonly type: 'maintenance';
  readonly shipId: Id;
  readonly shipName: string;
  readonly action: 'begin' | 'end';
  readonly createdAt: Timestamp;
}

export type SessionEvent = ShipConfettiEvent | FullscreenAlertEvent | MaintenanceEvent;

export type DamageDraw = {
  readonly id: Id;
  readonly sessionId: Id;
  readonly shipId: Id;
  readonly createdAt: Timestamp;
} & (
  | {
    readonly type: 'ship-damage';
    readonly card: string;
    readonly systemId: string;
    readonly systemName: string;
    readonly recycled: boolean;
  }
  | { readonly type: 'ship-destroyed' }
);

/** Anything the server generated and only some players may read. */
export interface SecretRecord {
  readonly id: Id;
  readonly sessionId: Id;
  readonly visibleToUids: readonly Id[];
  readonly payload: Readonly<Record<string, unknown>>;
  readonly createdAt: Timestamp;
}
