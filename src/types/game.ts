/**
 * Shared shapes for the companion console.
 *
 * These are deliberately minimal -- enough to describe a session, its seats and
 * its players -- so that the ~40 interlocking game tables can be added as their
 * own modules under `src/types/` without reshaping the session model.
 */

import type {
  EntityId,
  EntityKind,
  EventId,
  PlayerId,
  RoleId,
  SeatId,
  SessionId,
  ShuttleId,
  VesselId,
} from './identifiers';

export type {
  AnyEntityId,
  AttackId,
  ConsoleId,
  EntityId,
  EntityKind,
  EntityIdByKind,
  EventId,
  GroupId,
  MissionId,
  PlayerId,
  RoleId,
  SeatId,
  SessionId,
  ShuttleId,
  VesselId,
} from './identifiers';

/** Legacy unqualified ID for data that predates the typed identity boundary. */
export type Id = string;

/** Identity-only contracts for tables that do not yet have persisted models. */
export interface EntityIdentitySnapshot<K extends EntityKind> {
  readonly id: EntityId<K>;
}

export type Group = EntityIdentitySnapshot<'group'>;
export type Mission = EntityIdentitySnapshot<'mission'>;
export type Attack = EntityIdentitySnapshot<'attack'>;
export type Console = EntityIdentitySnapshot<'console'>;

export type AnyEntityIdentitySnapshot = EntityIdentitySnapshot<EntityKind>;

/** ISO-8601 instant, as written by the server. */
export type Timestamp = string;

export type SessionPhase =
  | 'lobby'
  | 'casting'
  | 'briefing'
  | 'active'
  | 'success'
  | 'failure'
  | 'debrief'
  | 'closed'
  | 'retained-empty';

export type SessionChartId = 'A' | 'B' | 'C';
export type SessionExpansionMode = 'base' | 'capybara' | 'none';

export type GalacticCoordinate = string;
export type ShipGalacticCoordinates = Readonly<Record<string, GalacticCoordinate>>;

export type ShipNavigationEventType = 'self-jump' | 'ship-jump-away' | 'ship-jump-arrival';

export interface ShipNavigationLogEntry {
  readonly id: EventId;
  /** The ship whose bridge receives this entry. */
  readonly shipId: VesselId;
  readonly type: ShipNavigationEventType;
  readonly origin: GalacticCoordinate;
  readonly destination: GalacticCoordinate;
  /** Present for a notification about another ship's jump. */
  readonly subjectShipId?: VesselId;
  readonly subjectShipName?: string;
  /** A GM relocation is deliberately visible as an error on the moved ship. */
  readonly navigationalError?: boolean;
  readonly occurredAt: Timestamp;
  /** YYYY.DDD.HHMMSS, calculated from the server's UTC clock. */
  readonly stardate: string;
}

export type ShipNavigationLogs = Readonly<Record<string, readonly ShipNavigationLogEntry[]>>;
export type ShipConsoleLocks = Readonly<Record<string, boolean>>;

export interface ShipJumpState {
  /** The numbered turn in which this ship last completed a jump. */
  readonly lastJumpTurn?: number;
  /** Server expiry for a bad-coordinate integrity lockout. */
  readonly integrityLockedUntil?: Timestamp;
}

export type ShipJumpStates = Readonly<Record<string, ShipJumpState>>;

export interface ShipJumpTransition {
  readonly id: EventId;
  readonly shipId: VesselId;
  readonly origin: GalacticCoordinate;
  readonly destination: GalacticCoordinate;
  readonly occurredAt: Timestamp;
}

export type ShipJumpTransitions = Readonly<Record<string, ShipJumpTransition>>;

export type AirspaceWindow = 'restricted' | 'open';

/** A server-owned emergency hold freezes the active window, never the client clock. */
export interface TurnTimerPause {
  readonly window: AirspaceWindow;
  readonly remainingMs: number;
  readonly pausedAt: Timestamp;
}

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
  readonly shipId: VesselId;
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

/** Facilitator-only marker for the approximate first Wolf-attack window. */
export type WolfAttackWindowStatus = 'due' | 'resolved' | 'deferred';

export interface WolfAttackWindow {
  readonly status: WolfAttackWindowStatus;
  /** The numbered turn in which the facilitator should handle this window. */
  readonly turn: number;
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
  /** Present only while a GM emergency hold is active. */
  readonly timerPause?: TurnTimerPause;
}

export interface TurnStartAnnouncement {
  readonly turn: number;
  readonly survivorPopulation: number;
  /** Increments when the GM deliberately replays this transmission. */
  readonly revision?: number;
}

/** A browser-local GM replay; it is intentionally never persisted or shared. */
export interface TurnStartReplay {
  readonly sessionId: SessionId;
  readonly turn: number;
  readonly survivorPopulation: number;
  readonly token: number;
}

/** The server-authoritative setup tuple and its derived core vessel projection. */
export interface SessionSetup {
  readonly playerCount: number;
  readonly chartId: SessionChartId;
  readonly expansion: SessionExpansionMode;
  readonly turnLimit: 6 | 7 | 8;
  readonly dioneEnabled: boolean;
  readonly capybaraEnabled: boolean;
  readonly universalArbourEnabled: boolean;
  readonly wolfCultEnabled: boolean;
  readonly activeRoleIds: readonly RoleId[];
  readonly activeVesselIds: readonly VesselId[];
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
  readonly id: SessionId;
  readonly name: string;
  /** Short human-shareable code players type to join. */
  readonly joinCode: string;
  readonly phase: SessionPhase;
  /** Immutable setup choices captured before casting begins. */
  readonly playerCount?: number;
  readonly chartId?: SessionChartId;
  readonly expansion?: SessionExpansionMode;
  readonly turnLimit?: 6 | 7 | 8;
  readonly configurationLocked?: boolean;
  readonly setupRevision?: number;
  /** One canonical server-validated configuration tuple. */
  readonly setup?: SessionSetup;
  /** Derived counted vessels for the canonical active core roster. */
  readonly activeVesselIds?: readonly VesselId[];
  /** Configurable ship availability; absent legacy values are treated as enabled. */
  readonly capybaraEnabled?: boolean;
  readonly dioneEnabled?: boolean;
  /** Public setup switches; loyalty assignments remain private. */
  readonly universalArbourEnabled?: boolean;
  readonly wolfCultEnabled?: boolean;
  /** Optional New Eden Console extension; absent legacy values are treated as enabled. */
  readonly pressEnabled?: boolean;
  /** Server-owned CAS revision for Press availability changes. */
  readonly pressAvailabilityRevision?: number;
  /** Four-digit system code for every fleet ship; legacy sessions begin at 0000. */
  readonly shipGalacticCoordinates?: ShipGalacticCoordinates;
  /** Server-authored navigation events, newest first, by receiving ship. */
  readonly shipNavigationLogs?: ShipNavigationLogs;
  /** Server-authorized travel lock state, by ship. */
  readonly shipConsoleLocks?: ShipConsoleLocks;
  /** Server-authorized jump integrity and once-per-turn state, by ship. */
  readonly shipJumpStates?: ShipJumpStates;
  /** Latest completed jump, used for fleetwide presentation and DRADIS blackout. */
  readonly shipJumpTransitions?: ShipJumpTransitions;
  /** Server-owned pursuit value per initial fleet group. */
  readonly pursuitGroups?: Readonly<Record<string, number>>;
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
  readonly activeRoleIds?: readonly RoleId[];
  readonly shuttleDockings?: readonly ShuttleDocking[];
  readonly shuttleVisitLog?: readonly ShuttleVisit[];
  /** Fleet ships whose one-shot bridge dispenser has already been fired. */
  readonly confettiUsedShipIds?: readonly VesselId[];
  /** Latest server-authorized manual DRADIS contact; automatic traffic derives from createdAt. */
  readonly dradisContactTriggeredAt?: Timestamp;
  /** uid of the facilitator who may elevate others. */
  /** Legacy retained-empty sessions may omit the facilitator identity. */
  readonly ownerUid?: PlayerId;
  readonly createdAt: Timestamp;
  readonly updatedAt: Timestamp;
}

/** GM-private receipt returned by the authoritative ordinary start transaction. */
export interface SetupReceipt {
  readonly source: string;
  readonly playerCount: number;
  readonly mode: string;
  readonly rosterIds: readonly RoleId[];
  readonly pressEligibility: Readonly<Record<string, unknown>>;
  readonly excludedGmCount: number;
  readonly wolfCount: 1 | 2;
  readonly wolfRule: string;
  readonly selectedWolfRoleIds: readonly RoleId[];
  readonly eligibleRoleIds: readonly RoleId[];
  readonly roleOwnedCraft?: readonly RoleOwnedCraftRecord[];
  readonly orderedModifiers: readonly unknown[];
  readonly resultCount: number;
  readonly loyaltySource: 'automatic-default' | 'explicit-preserved';
  readonly request: Readonly<Record<string, unknown>>;
  readonly expectedSetupRevision: number;
  readonly committedSetupRevision: number;
  readonly actorUid: PlayerId;
  readonly serverTime: string;
  readonly event: string;
}

/** Facilitator-only role assignment selected during authoritative game setup. */
export interface WolfAssignment {
  readonly roleIds: readonly RoleId[];
}

export interface RoleOwnedCraftRecord {
  readonly id: string;
  readonly kind: 'shuttle' | 'fighter-wing';
  readonly ownerRoleId: RoleId;
}

export interface PrivateLoyalty {
  readonly kind: string;
  readonly suspicion: number | null;
  readonly partnerUid?: PlayerId;
}

/** Server-owned role-private projection for the authenticated player only. */
export interface RoleBrief {
  readonly assignmentUid: PlayerId;
  readonly roleId: RoleId;
  readonly roleName: string;
  readonly vesselName: string;
  readonly text: string;
  readonly commonRules: string;
  /** Server-derived craft allowlist for this role only. */
  readonly ownedCraftIds?: readonly string[];
  readonly setupRevision: number;
}

/** Facilitator-only projection of the current private loyalty cards. */
export interface LoyaltyCensusEntry {
  readonly uid: PlayerId;
  readonly kind: string;
  readonly suspicion: number | null;
  /** Optional facilitator annotation; never included in member projections. */
  readonly note?: string;
}

export interface LoyaltyCensus {
  readonly revision: number;
  readonly entries: readonly LoyaltyCensusEntry[];
}

export interface ShuttleDocking {
  readonly shuttleId: ShuttleId;
  readonly shipId: VesselId;
  readonly dockedAt: Timestamp;
}

export interface ShuttleVisit {
  readonly id: EventId;
  readonly shuttleId: ShuttleId;
  readonly shipId: VesselId;
  readonly action: 'docked' | 'departed';
  readonly occurredAt: Timestamp;
}

export type SeatStatus = 'open' | 'claimed' | 'locked';

export interface Seat {
  readonly id: SeatId;
  readonly sessionId: SessionId;
  /** Stable canonical role id; absent only on pre-0.3.12 legacy documents. */
  readonly roleId?: RoleId;
  readonly label: string;
  readonly factionId: VesselId | null;
  readonly status: SeatStatus;
  /** Set only by the server after a successful claim. */
  readonly holderUid: PlayerId | null;
  readonly claimedAt: Timestamp | null;
}

export type PlayerRole = 'player' | 'gm' | 'observer';

export interface Player {
  readonly uid: PlayerId;
  readonly sessionId: SessionId;
  readonly displayName: string;
  readonly role: PlayerRole;
  readonly seatId: SeatId | null;
  /** Server-assigned printed role, separate from local device authority. */
  readonly assignedRoleId?: RoleId | null;
  /** Nonbinding casting preference; it never grants a role or vessel. */
  readonly shipPreferenceId?: VesselId | null;
  /** Server-authoritative command post held by this device until explicitly released. */
  readonly activeConsoleRoleId?: RoleId | null;
  readonly joinedAt: Timestamp;
}

/** One browser/device that has independently claimed GM authority. */
export interface GmInstance {
  readonly id: Id;
  readonly sessionId: SessionId;
  readonly uid: PlayerId;
  readonly name: string;
  readonly deviceLabel: string;
  readonly responsibility?: 'main' | 'assistant';
  /** Normalized responsibility projection; legacy singular data remains readable. */
  readonly responsibilities?: readonly ('main' | 'assistant')[];
  readonly claimedAt: Timestamp;
}

export interface ShipConfettiEvent {
  readonly id: EventId;
  readonly sessionId: SessionId;
  readonly type: 'ship-confetti';
  readonly shipId: VesselId;
  readonly shipName: string;
  readonly actorName: string;
  readonly actorRoleName: string;
  readonly createdAt: Timestamp;
}

export interface FullscreenAlertEvent {
  readonly id: EventId;
  readonly sessionId: SessionId;
  readonly type: 'fullscreen-alert';
  readonly sourceRoleName: string;
  readonly message: string;
  readonly createdAt: Timestamp;
}

export const MAINTENANCE_EVENT_ACTIONS = [
  'begin', 'storage', 'rations', 'unrest', 'riot', 'reactor', 'bays', 'end',
] as const;
export type MaintenanceEventAction = typeof MAINTENANCE_EVENT_ACTIONS[number];
export const MAINTENANCE_EVENT_RESULT_STEPS = ['1', '2', '3', '4', '5', '6', '7'] as const;
export type MaintenanceEventResultStep = typeof MAINTENANCE_EVENT_RESULT_STEPS[number];
export type MaintenanceEventResults = Partial<Record<MaintenanceEventResultStep, string>>;

export interface MaintenanceEvent {
  readonly id: EventId;
  readonly sessionId: SessionId;
  readonly type: 'maintenance';
  readonly shipId: VesselId;
  readonly shipName: string;
  readonly action: MaintenanceEventAction;
  readonly results: MaintenanceEventResults;
  readonly createdAt: Timestamp;
}

export interface TimerPauseEvent {
  readonly id: EventId;
  readonly sessionId: SessionId;
  readonly type: 'timer-pause';
  readonly action: 'paused' | 'resumed';
  readonly turn: number;
  readonly window: AirspaceWindow;
  readonly actorName: string;
  readonly createdAt: Timestamp;
}

export type SessionEvent =
  | ShipConfettiEvent
  | FullscreenAlertEvent
  | MaintenanceEvent
  | TimerPauseEvent;

export type DamageDraw = {
  readonly id: EventId;
  readonly sessionId: SessionId;
  readonly shipId: VesselId;
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
  readonly sessionId: SessionId;
  readonly visibleToUids: readonly PlayerId[];
  readonly payload: Readonly<Record<string, unknown>>;
  readonly createdAt: Timestamp;
}
