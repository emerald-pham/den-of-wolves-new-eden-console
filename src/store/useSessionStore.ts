import { create } from 'zustand';
import { shallow } from 'zustand/shallow';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { GameSession, GmInstance, Player, Seat, TurnStartReplay } from '@/types/game';

export const SESSION_STORAGE_KEY = 'dow-new-eden-session';
export const GM_ACCESS_TIMEOUT_MS = 24 * 60 * 60 * 1000;
export type ConsoleMode = 'gm' | 'console' | 'press';

export type PendingCommand =
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
      readonly payload: { readonly sessionId: string };
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
      readonly kind: 'popShipConfetti';
      readonly payload: {
        readonly sessionId: string;
        readonly shipId: string;
        readonly roleId: string;
      };
      readonly createdAt: string;
    };

export interface CommunicationError {
  readonly code: string;
  readonly message: string;
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
  pendingCommands: readonly PendingCommand[];
  communicationError: CommunicationError | null;
  mode: ConsoleMode | null;
  lastRoute: string | null;
  connection: 'idle' | 'connecting' | 'live' | 'offline';

  setSession: (session: GameSession | null) => void;
  setIdentity: (session: GameSession, me: Player) => void;
  setSeats: (seats: readonly Seat[]) => void;
  setMe: (me: Player | null) => void;
  setGmInstance: (instance: GmInstance | null) => void;
  setGmAccessAuthenticatedAt: (authenticatedAt: number | null) => void;
  clearGmAccess: () => void;
  setTurnStartReplay: (replay: TurnStartReplay | null) => void;
  enqueueCommand: (command: PendingCommand) => void;
  removeCommand: (id: string) => void;
  setCommunicationError: (error: CommunicationError | null) => void;
  setMode: (mode: ConsoleMode | null) => void;
  setLastRoute: (lastRoute: string | null) => void;
  setConnection: (connection: SessionState['connection']) => void;
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
  pendingCommands: [] as readonly PendingCommand[],
  communicationError: null,
  mode: null,
  lastRoute: null,
  connection: 'idle',
} satisfies Pick<
  SessionState,
  'session' | 'seats' | 'me' | 'gmInstance' | 'gmAccessAuthenticatedAt' | 'turnStartReplay' | 'pendingCommands' |
  'communicationError' | 'mode' | 'lastRoute' | 'connection'
>;

export const useSessionStore = create<SessionState>()(
  persist(
    (set, get) => ({
      ...initial,
      setSession: (session) => set({ session }),
      setIdentity: (session, me) => set({ session, me }),
      setSeats: (seats) => set({ seats }),
      // Presence snapshots often carry the same player fields. Avoid notifying
      // the entire UI and serializing the full persisted session in that case.
      setMe: (me) => { if (!shallow(get().me, me)) set({ me }); },
      setGmInstance: (gmInstance) => set({ gmInstance }),
      setGmAccessAuthenticatedAt: (gmAccessAuthenticatedAt) => set({ gmAccessAuthenticatedAt }),
      clearGmAccess: () => set({ gmAccessAuthenticatedAt: null }),
      setTurnStartReplay: (turnStartReplay) => set({ turnStartReplay }),
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
      disconnect: () =>
        set((state) => ({
          session: null,
          seats: [],
          me: null,
          gmInstance: null,
          turnStartReplay: null,
          mode: null,
          lastRoute: null,
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
        session,
        me,
        gmInstance,
        gmAccessAuthenticatedAt,
        // A GM claim is deliberately not replayed after a reload; access must
        // be freshly authorized by the current browser login state.
        pendingCommands: pendingCommands.filter((command) => command.kind !== 'claimGmInstance'),
        mode,
        lastRoute,
      }),
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
