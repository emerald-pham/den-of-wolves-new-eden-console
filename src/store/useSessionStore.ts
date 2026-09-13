import { create } from 'zustand';
import { shallow } from 'zustand/shallow';
import { createJSONStorage, persist } from 'zustand/middleware';
import type {
  CommissarPurgeAuthority,
  FacilitatorRuleCall,
  GameSession,
  GmInstance,
  LoyaltyCensus,
  Player,
  PrivateLoyalty,
  RoleBrief,
  Seat,
  SetupReceipt,
  TurnStartReplay,
  WolfCultIntelligence,
  ArbourVision,
  AwayMissionHand,
  AwayMissionHandPointer,
} from '@/types/game';
import type { DiseaseOutbreakDetails, CrisisKind, CrisisStateProjection, ZealotryResponse, ZealotryResponseAction, CivilUnrestResolution } from '@/types/crisis';
import { normalizeShuttleManifest } from '@/data/shuttles';
import { stripGmNavigationProjection } from '@/lib/navigationPrivacy';
import type { CommandErrorKind } from '@/lib/commandErrors';

export const SESSION_STORAGE_KEY = 'dow-new-eden-session';
export const GM_ACCESS_TIMEOUT_MS = 24 * 60 * 60 * 1000;
export type ConsoleMode = 'gm' | 'console' | 'press';

export type PendingCommand = (
  | {
      readonly id: string;
      readonly kind: 'claimGmInstance';
      readonly payload: {
        readonly sessionId: string;
        readonly instanceId: string;
        readonly name: string;
        readonly deviceLabel: string;
      };
      readonly createdAt: string;
    }
  | {
      readonly id: string;
      readonly kind: 'kickGmInstance' | 'releaseGmInstance';
      readonly payload: {
        readonly sessionId: string;
        readonly instanceId: string;
        readonly targetInstanceId: string;
      };
      readonly createdAt: string;
    }
  | {
      readonly id: string;
      readonly kind: 'kickPlayer';
      readonly payload: {
        readonly sessionId: string;
        readonly instanceId: string;
        readonly targetUid: string;
      };
      readonly createdAt: string;
    }
  | {
      readonly id: string;
      readonly kind: 'logoutGmAccess';
      readonly payload: {
        readonly sessionId: string | null;
        readonly instanceId: string | null;
      };
      readonly createdAt: string;
    }
  | {
      readonly id: string;
      readonly kind: 'disconnectFromSession';
      readonly payload: { readonly sessionId: string; readonly instanceId?: string };
      readonly createdAt: string;
    }
  | {
      readonly id: string;
      readonly kind: 'setCapybaraEnabled';
      readonly payload: {
        readonly sessionId: string;
        readonly instanceId: string;
        readonly capybaraEnabled: boolean;
      };
      readonly createdAt: string;
    }
  | {
      readonly id: string;
      readonly kind: 'setDioneEnabled';
      readonly payload: {
        readonly sessionId: string;
        readonly instanceId: string;
        readonly dioneEnabled: boolean;
      };
      readonly createdAt: string;
    }
  | {
      readonly id: string;
      readonly kind: 'setPressEnabled';
      readonly payload: {
        readonly sessionId: string;
        readonly instanceId: string;
        readonly requestId: string;
        readonly pressEnabled: boolean;
        readonly expectedRevision: number;
      };
      readonly createdAt: string;
    }
  | {
      readonly id: string;
      readonly kind: 'setGmControlsLocked';
      readonly payload: {
        readonly sessionId: string;
        readonly instanceId: string;
        readonly locked: boolean;
      };
      readonly createdAt: string;
    }
  | {
      readonly id: string;
      readonly kind: 'setDebriefMode';
      readonly payload: {
        readonly sessionId: string;
        readonly instanceId: string;
        readonly active: boolean;
      };
      readonly createdAt: string;
    }
  | {
      readonly id: string;
      readonly kind: 'setActiveRoleEnabled';
      readonly payload: {
        readonly sessionId: string;
        readonly instanceId: string;
        readonly roleId: string;
        readonly enabled: boolean;
      };
      readonly createdAt: string;
    }
  | {
      readonly id: string;
      readonly kind: 'applyRolePreset';
      readonly payload: {
        readonly sessionId: string;
        readonly instanceId: string;
        readonly playerCount: number;
      };
      readonly createdAt: string;
    }
  | {
      readonly id: string;
      readonly kind: 'setActiveRoleConfiguration';
      readonly payload: {
        readonly sessionId: string;
        readonly instanceId: string;
        readonly activeRoleIds: readonly string[];
      };
      readonly createdAt: string;
    }
  | {
      readonly id: string;
      readonly kind: 'confirmSetup';
      readonly payload: {
        readonly sessionId: string;
        readonly instanceId: string;
        readonly requestId: string;
        readonly expectedSetupRevision: number;
        readonly setup: {
          readonly playerCount: number;
          readonly chartId: 'A' | 'B' | 'C';
          readonly expansion: 'base' | 'capybara' | 'none';
          readonly turnLimit: 6 | 7 | 8;
          readonly dioneEnabled: boolean;
          readonly capybaraEnabled: boolean;
          readonly universalArbourEnabled: boolean;
          readonly wolfCultEnabled: boolean;
          readonly activeRoleIds: readonly string[];
        };
      };
      readonly createdAt: string;
    }
  | {
      readonly id: string;
      readonly kind: 'setFacilitatorResponsibility';
      readonly payload: {
        readonly sessionId: string;
        readonly instanceId: string;
        readonly requestId: string;
        readonly expectedSetupRevision: number;
        readonly responsibility: 'main' | 'assistant';
        readonly mode: 'share' | 'handoff' | 'drop';
        readonly targetInstanceId?: string;
      };
      readonly createdAt: string;
    }
  | {
      readonly id: string;
      readonly kind: 'setFacilitatorCensusNote';
      readonly payload: {
        readonly sessionId: string;
        readonly instanceId: string;
        readonly requestId: string;
        readonly expectedRevision: number;
        readonly targetUid: string;
        readonly note: string;
      };
      readonly createdAt: string;
    }
  | {
      readonly id: string;
      readonly kind: 'deliverWolfCultIntelligence';
      readonly payload: {
        readonly sessionId: string;
        readonly instanceId: string;
        readonly requestId: string;
        readonly expectedRevision: number;
        readonly fortressCoordinate: string;
        readonly suppliesCoordinate: string;
        readonly agentUid: string;
        readonly codeWord: string;
      };
      readonly createdAt: string;
    }
  | {
      readonly id: string;
      readonly kind: 'authorArbourVision';
      readonly payload: {
        readonly sessionId: string;
        readonly instanceId: string;
        readonly requestId: string;
        readonly expectedRevision: number;
        readonly targetUid: string;
        readonly kind: ArbourVision['kind'];
        readonly text: string;
      };
      readonly createdAt: string;
    }
  | {
      readonly id: string;
      readonly kind: 'authorFacilitatorRuleCall';
      readonly payload: {
        readonly sessionId: string;
        readonly instanceId: string;
        readonly requestId: string;
        readonly expectedRevision: number;
        readonly ambiguity: string;
        readonly source: string;
        readonly decision: string;
        readonly audience: FacilitatorRuleCall['audience'];
        readonly recipientUid?: string;
        readonly supersedesCallId?: string;
      };
      readonly createdAt: string;
    }
  | {
      readonly id: string;
      readonly kind: 'transitionCrisis';
      readonly payload: {
        readonly sessionId: string;
        readonly instanceId: string;
        readonly requestId: string;
        readonly expectedRevision: number;
        readonly crisisId: string;
        readonly state: import('@/types/crisis').CrisisStateName;
        readonly title: string;
        readonly details: string;
        readonly crisisKind?: CrisisKind;
        readonly configurationOverride?: string;
        readonly diseaseOutbreak?: DiseaseOutbreakDetails;
      };
      readonly createdAt: string;
    }
  | {
      readonly id: string;
      readonly kind: 'recordZealotryResponse';
      readonly payload: {
        readonly sessionId: string;
        readonly instanceId: string;
        readonly requestId: string;
        readonly expectedRevision: number;
        readonly crisisId: string;
        readonly actions: readonly ZealotryResponseAction[];
        readonly customResponse?: string;
        readonly rationale: string;
      };
      readonly createdAt: string;
    }
  | {
      readonly id: string;
      readonly kind: 'submitCivilUnrestGrievance';
      readonly payload: {
        readonly sessionId: string;
        readonly requestId: string;
        readonly crisisId: string;
        readonly expectedCrisisRevision: number;
        readonly expectedGrievanceRevision: number;
        readonly affectedShipId?: string;
        readonly visibility: 'private' | 'public';
        readonly text: string;
      };
      readonly createdAt: string;
    }
  | {
      readonly id: string;
      readonly kind: 'recordCivilUnrestResolution';
      readonly payload: {
        readonly sessionId: string;
        readonly instanceId: string;
        readonly requestId: string;
        readonly expectedRevision: number;
        readonly crisisId: string;
        readonly presidentResponse: string;
        readonly consequence: string;
        readonly rationale: string;
      };
      readonly createdAt: string;
    }
  | {
      readonly id: string;
      readonly kind: 'claimSeat';
      readonly payload: {
        readonly sessionId: string;
        readonly seatId: string;
        readonly requestId: string;
        readonly expectedSetupRevision: number;
      };
      readonly createdAt: string;
    }
  | {
      readonly id: string;
      readonly kind: 'releaseSeat';
      readonly payload: {
        readonly sessionId: string;
        readonly seatId: string;
        readonly requestId: string;
        readonly expectedSetupRevision: number;
        readonly instanceId?: string;
        readonly reason?: string;
      };
      readonly createdAt: string;
    }
  | {
      readonly id: string;
      readonly kind: 'assignRole';
      readonly payload: {
        readonly sessionId: string;
        readonly instanceId: string;
        readonly requestId: string;
        readonly targetUid: string;
        readonly roleId: string;
      };
      readonly createdAt: string;
    }
  | {
      readonly id: string;
      readonly kind: 'releaseRole';
      readonly payload: {
        readonly sessionId: string;
        readonly instanceId: string;
        readonly requestId: string;
        readonly targetUid: string;
      };
      readonly createdAt: string;
    }
  | {
      readonly id: string;
      readonly kind: 'popShipConfetti';
      readonly payload: {
        readonly sessionId: string;
        readonly shipId: string;
        readonly roleId: string;
        readonly instanceId?: string;
      };
      readonly createdAt: string;
    }
) & {
  /** Present only when the original action had accepted server authority. */
  readonly queuedWithServerAuthority?: true;
};

export interface CommunicationError {
  readonly kind?: CommandErrorKind;
  readonly code: string;
  readonly message: string;
  readonly retryAfterSeconds?: number;
}

/**
 * Local (per-browser) view state only.
 *
 * Authoritative state lives in Firestore and is mutated through callable
 * Cloud Functions. This store holds the last snapshot the client received plus
 * purely local UI concerns, so a component never has to decide which is which.
 */
interface SessionState {
  session: GameSession | null;
  seats: readonly Seat[];
  me: Player | null;
  gmInstance: GmInstance | null;
  gmAccessAuthenticatedAt: number | null;
  turnStartReplay: TurnStartReplay | null;
  privateLoyalty: PrivateLoyalty | null;
  roleBrief: RoleBrief | null;
  awayMissionHandPointer: AwayMissionHandPointer | null;
  awayMissionHand: AwayMissionHand | null;
  awayMissionHandPointers: readonly AwayMissionHandPointer[];
  awayMissionHands: readonly AwayMissionHand[];
  gmAwayMissionHandPointers: readonly AwayMissionHandPointer[];
  gmLoyaltyCensus: LoyaltyCensus | null;
  wolfCultIntelligence: WolfCultIntelligence | null;
  gmWolfCultIntelligence: WolfCultIntelligence | null;
  arbourVision: ArbourVision | null;
  gmArbourVision: ArbourVision | null;
  facilitatorRuleCall: FacilitatorRuleCall | null;
  gmFacilitatorRuleCall: FacilitatorRuleCall | null;
  gmCrisisState: CrisisStateProjection | null;
  gmZealotryResponse: ZealotryResponse | null;
  gmCivilUnrestResolution: CivilUnrestResolution | null;
  gmSetupReceipt: SetupReceipt | null;
  commissarPurgeAuthority: CommissarPurgeAuthority | null;
  pendingCommands: readonly PendingCommand[];
  communicationError: CommunicationError | null;
  mode: ConsoleMode | null;
  lastRoute: string | null;
  connection: 'idle' | 'connecting' | 'live' | 'offline';
  sessionSnapshotFreshness: 'unknown' | 'cache' | 'server';

  setSession: (session: GameSession | null) => void;
  setIdentity: (session: GameSession, me: Player) => void;
  setSeats: (seats: readonly Seat[]) => void;
  setMe: (me: Player | null) => void;
  setGmInstance: (instance: GmInstance | null) => void;
  setGmAccessAuthenticatedAt: (authenticatedAt: number | null) => void;
  clearGmAccess: () => void;
  setTurnStartReplay: (replay: TurnStartReplay | null) => void;
  setPrivateLoyalty: (loyalty: PrivateLoyalty | null) => void;
  setRoleBrief: (brief: RoleBrief | null) => void;
  setAwayMissionHandPointer: (pointer: AwayMissionHandPointer | null) => void;
  setAwayMissionHand: (hand: AwayMissionHand | null) => void;
  setAwayMissionHandPointers: (pointers: readonly AwayMissionHandPointer[]) => void;
  setAwayMissionHands: (hands: readonly AwayMissionHand[]) => void;
  setGmAwayMissionHandPointers: (pointers: readonly AwayMissionHandPointer[]) => void;
  setGmLoyaltyCensus: (census: LoyaltyCensus | null) => void;
  setWolfCultIntelligence: (intelligence: WolfCultIntelligence | null) => void;
  setGmWolfCultIntelligence: (intelligence: WolfCultIntelligence | null) => void;
  setArbourVision: (vision: ArbourVision | null) => void;
  setGmArbourVision: (vision: ArbourVision | null) => void;
  setFacilitatorRuleCall: (call: FacilitatorRuleCall | null) => void;
  setGmFacilitatorRuleCall: (call: FacilitatorRuleCall | null) => void;
  setGmCrisisState: (state: CrisisStateProjection | null) => void;
  setGmZealotryResponse: (response: ZealotryResponse | null) => void;
  setGmCivilUnrestResolution: (resolution: CivilUnrestResolution | null) => void;
  setGmSetupReceipt: (receipt: SetupReceipt | null) => void;
  setCommissarPurgeAuthority: (authority: CommissarPurgeAuthority | null) => void;
  enqueueCommand: (command: PendingCommand) => void;
  removeCommand: (id: string) => void;
  setCommunicationError: (error: CommunicationError | null) => void;
  setMode: (mode: ConsoleMode | null) => void;
  setLastRoute: (lastRoute: string | null) => void;
  setConnection: (connection: SessionState['connection']) => void;
  setSessionSnapshotFreshness: (freshness: SessionState['sessionSnapshotFreshness']) => void;
  disconnect: () => void;
  reset: () => void;
}

const initial = {
  session: null,
  seats: [] as readonly Seat[],
  me: null,
  gmInstance: null,
  gmAccessAuthenticatedAt: null,
  turnStartReplay: null,
  privateLoyalty: null,
  roleBrief: null,
  awayMissionHandPointer: null,
  awayMissionHand: null,
  awayMissionHandPointers: [] as readonly AwayMissionHandPointer[],
  awayMissionHands: [] as readonly AwayMissionHand[],
  gmAwayMissionHandPointers: [] as readonly AwayMissionHandPointer[],
  gmLoyaltyCensus: null,
  wolfCultIntelligence: null,
  gmWolfCultIntelligence: null,
  arbourVision: null,
  gmArbourVision: null,
  facilitatorRuleCall: null,
  gmFacilitatorRuleCall: null,
  gmCrisisState: null,
  gmZealotryResponse: null,
  gmCivilUnrestResolution: null,
  gmSetupReceipt: null,
  commissarPurgeAuthority: null,
  pendingCommands: [] as readonly PendingCommand[],
  communicationError: null,
  mode: null,
  lastRoute: null,
  connection: 'idle',
  sessionSnapshotFreshness: 'unknown',
} satisfies Pick<
  SessionState,
  'session' | 'seats' | 'me' | 'gmInstance' | 'gmAccessAuthenticatedAt' | 'turnStartReplay' | 'pendingCommands' |
  'privateLoyalty' | 'roleBrief' | 'awayMissionHandPointer' | 'awayMissionHand' | 'awayMissionHandPointers' | 'awayMissionHands' | 'gmAwayMissionHandPointers' | 'gmLoyaltyCensus' | 'wolfCultIntelligence' | 'gmWolfCultIntelligence' | 'arbourVision' | 'gmArbourVision' | 'facilitatorRuleCall' | 'gmFacilitatorRuleCall' | 'gmCrisisState' | 'gmZealotryResponse' | 'gmCivilUnrestResolution' | 'gmSetupReceipt' | 'commissarPurgeAuthority' | 'communicationError' | 'mode' | 'lastRoute' | 'connection' |
  'sessionSnapshotFreshness'
>;

function normalizePersistedSession(session: GameSession | null | undefined): GameSession | null {
  if (!session) return null;
  const manifest = normalizeShuttleManifest(
    session.shuttleDockings,
    session.shuttleVisitLog,
    session.activeRoleIds,
    session.playerCount,
  );
  return {
    ...stripGmNavigationProjection(session),
    shuttleDockings: manifest.dockings,
    shuttleVisitLog: manifest.visits,
  };
}

export const useSessionStore = create<SessionState>()(
  persist(
    (set, get) => ({
      ...initial,
      setSession: (session) => set({ session }),
      setIdentity: (session, me) => set({
        session, me, roleBrief: null, awayMissionHandPointer: null, awayMissionHand: null,
        awayMissionHandPointers: [], awayMissionHands: [],
        gmAwayMissionHandPointers: [], wolfCultIntelligence: null, gmWolfCultIntelligence: null,
        arbourVision: null, gmArbourVision: null, facilitatorRuleCall: null,
        gmFacilitatorRuleCall: null, gmCrisisState: null, gmZealotryResponse: null, gmCivilUnrestResolution: null, commissarPurgeAuthority: null,
      }),
      setSeats: (seats) => set({ seats }),
      // Presence snapshots often carry the same player fields. Avoid notifying
      // the entire UI and serializing the full persisted session in that case.
      setMe: (me) => { if (!shallow(get().me, me)) set({ me }); },
      setGmInstance: (gmInstance) => set({ gmInstance }),
      setGmAccessAuthenticatedAt: (gmAccessAuthenticatedAt) => set({ gmAccessAuthenticatedAt }),
      clearGmAccess: () => set({ gmAccessAuthenticatedAt: null }),
      setTurnStartReplay: (turnStartReplay) => set({ turnStartReplay }),
      setPrivateLoyalty: (privateLoyalty) => set({ privateLoyalty }),
      setRoleBrief: (roleBrief) => set({ roleBrief }),
      setAwayMissionHandPointer: (awayMissionHandPointer) => set({ awayMissionHandPointer }),
      setAwayMissionHand: (awayMissionHand) => set({ awayMissionHand }),
      setAwayMissionHandPointers: (awayMissionHandPointers) => set({
        awayMissionHandPointers,
        awayMissionHandPointer: awayMissionHandPointers[0] ?? null,
      }),
      setAwayMissionHands: (awayMissionHands) => set({
        awayMissionHands,
        awayMissionHand: awayMissionHands[0] ?? null,
      }),
      setGmAwayMissionHandPointers: (gmAwayMissionHandPointers) => set({ gmAwayMissionHandPointers }),
      setGmLoyaltyCensus: (gmLoyaltyCensus) => set({ gmLoyaltyCensus }),
      setWolfCultIntelligence: (wolfCultIntelligence) => set({ wolfCultIntelligence }),
      setGmWolfCultIntelligence: (gmWolfCultIntelligence) => set({ gmWolfCultIntelligence }),
      setArbourVision: (arbourVision) => set({ arbourVision }),
      setGmArbourVision: (gmArbourVision) => set({ gmArbourVision }),
      setFacilitatorRuleCall: (facilitatorRuleCall) => set({ facilitatorRuleCall }),
      setGmFacilitatorRuleCall: (gmFacilitatorRuleCall) => set({ gmFacilitatorRuleCall }),
      setGmCrisisState: (gmCrisisState) => set({ gmCrisisState }),
      setGmZealotryResponse: (gmZealotryResponse) => set({ gmZealotryResponse }),
      setGmCivilUnrestResolution: (gmCivilUnrestResolution) => set({ gmCivilUnrestResolution }),
      setGmSetupReceipt: (gmSetupReceipt) => set({ gmSetupReceipt }),
      setCommissarPurgeAuthority: (commissarPurgeAuthority) => set({ commissarPurgeAuthority }),
      enqueueCommand: (command) =>
        set((state) => ({ pendingCommands: [...state.pendingCommands, command] })),
      removeCommand: (id) =>
        set((state) => ({
          pendingCommands: state.pendingCommands.filter((command) => command.id !== id),
        })),
      setCommunicationError: (communicationError) => set({ communicationError }),
      setMode: (mode) => set({ mode }),
      setLastRoute: (lastRoute) => { if (get().lastRoute !== lastRoute) set({ lastRoute }); },
      setConnection: (connection) => { if (get().connection !== connection) set({ connection }); },
      setSessionSnapshotFreshness: (sessionSnapshotFreshness) => {
        if (get().sessionSnapshotFreshness !== sessionSnapshotFreshness) {
          set({ sessionSnapshotFreshness });
        }
      },
      disconnect: () =>
        set((state) => ({
          session: null,
          seats: [],
          me: null,
          gmInstance: null,
          turnStartReplay: null,
          privateLoyalty: null,
          roleBrief: null,
          awayMissionHandPointer: null,
          awayMissionHand: null,
          awayMissionHandPointers: [],
          awayMissionHands: [],
          gmAwayMissionHandPointers: [],
          gmLoyaltyCensus: null,
          wolfCultIntelligence: null,
          gmWolfCultIntelligence: null,
          arbourVision: null,
          gmArbourVision: null,
          facilitatorRuleCall: null,
          gmFacilitatorRuleCall: null,
          gmCrisisState: null,
          gmZealotryResponse: null,
          gmCivilUnrestResolution: null,
          gmSetupReceipt: null,
          commissarPurgeAuthority: null,
          mode: null,
          lastRoute: null,
          sessionSnapshotFreshness: 'unknown',
          // Queued disconnect and logout commands must survive local teardown
          // so the server can receive the user's explicit cleanup decision.
          pendingCommands: state.pendingCommands.filter(
            (command) => command.kind === 'disconnectFromSession' || command.kind === 'logoutGmAccess',
          ),
        })),
      reset: () => set({ ...initial }),
    }),
    {
      name: SESSION_STORAGE_KEY,
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: ({ session, me, gmInstance, gmAccessAuthenticatedAt, pendingCommands, mode, lastRoute }) => ({
        session: session ? stripGmNavigationProjection(session) : null,
        me,
        gmInstance,
        gmAccessAuthenticatedAt,
        // A GM claim is deliberately not replayed after a reload; access must
        // be freshly authorized by the current browser login state.
        pendingCommands: pendingCommands.filter((command) => command.kind !== 'claimGmInstance'),
        mode,
        lastRoute,
      }),
      merge: (persisted, current) => {
        const restored = persisted && typeof persisted === 'object'
          ? persisted as Partial<SessionState>
          : {};
        return {
          ...current,
          ...restored,
          session: Object.hasOwn(restored, 'session')
            ? normalizePersistedSession(restored.session)
            : current.session,
        };
      },
    },
  ),
);

export const selectIsGm = (state: SessionState): boolean =>
  state.me?.role === 'gm' && state.gmInstance !== null &&
  state.gmInstance.sessionId === state.session?.id;

export const selectGmAccessAuthenticated = (
  state: { gmAccessAuthenticatedAt: number | null },
  now = Date.now(),
): boolean => {
  const authenticatedAt = state.gmAccessAuthenticatedAt;
  return typeof authenticatedAt === 'number' && Number.isFinite(authenticatedAt) &&
    now >= authenticatedAt && now - authenticatedAt < GM_ACCESS_TIMEOUT_MS;
};

/**
 * What the status light in the header shows.
 *
 * Two independent connections matter to a player: the one to Firebase, and the
 * one to a session. Green means both; yellow means Firebase only; red means the
 * Firebase link is down, which makes any session state on screen stale whether
 * or not a session is still loaded.
 */
export type ConnectionStatus = 'red' | 'yellow' | 'green';

export const selectConnectionStatus = (state: SessionState): ConnectionStatus => {
  if (state.connection !== 'live') return 'red';
  return state.session && state.me ? 'green' : 'yellow';
};
