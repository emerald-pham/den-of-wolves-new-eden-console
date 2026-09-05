import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { GameSession, GmInstance, Player, Seat } from '@/types/game';

export const SESSION_STORAGE_KEY = 'dow-new-eden-session';
export type ConsoleMode = 'gm' | 'setup' | 'console';

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
      readonly kind: 'popShipConfetti';
      readonly payload: {
        readonly sessionId: string;
        readonly shipId: string;
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
  pendingCommands: [] as readonly PendingCommand[],
  communicationError: null,
  mode: null,
  lastRoute: null,
  connection: 'idle',
} satisfies Pick<
  SessionState,
  'session' | 'seats' | 'me' | 'gmInstance' | 'pendingCommands' |
  'communicationError' | 'mode' | 'lastRoute' | 'connection'
>;

export const useSessionStore = create<SessionState>()(
  persist(
    (set) => ({
      ...initial,
      setSession: (session) => set({ session }),
      setIdentity: (session, me) => set({ session, me }),
      setSeats: (seats) => set({ seats }),
      setMe: (me) => set({ me }),
      setGmInstance: (gmInstance) => set({ gmInstance }),
      enqueueCommand: (command) =>
        set((state) => ({ pendingCommands: [...state.pendingCommands, command] })),
      removeCommand: (id) =>
        set((state) => ({
          pendingCommands: state.pendingCommands.filter((command) => command.id !== id),
        })),
      setCommunicationError: (communicationError) => set({ communicationError }),
      setMode: (mode) => set({ mode }),
      setLastRoute: (lastRoute) => set({ lastRoute }),
      setConnection: (connection) => set({ connection }),
      disconnect: () =>
        set((state) => ({
          session: null,
          seats: [],
          me: null,
          gmInstance: null,
          mode: null,
          lastRoute: null,
          // A queued disconnect must survive local teardown so it can tell the
          // server that this device left. No other action remains meaningful.
          pendingCommands: state.pendingCommands.filter(
            (command) => command.kind === 'disconnectFromSession',
          ),
        })),
      reset: () => set({ ...initial }),
    }),
    {
      name: SESSION_STORAGE_KEY,
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: ({ session, me, gmInstance, pendingCommands, mode, lastRoute }) => ({
        session,
        me,
        gmInstance,
        pendingCommands,
        mode,
        lastRoute,
      }),
    },
  ),
);

export const selectIsGm = (state: SessionState): boolean =>
  state.me?.role === 'gm' && state.gmInstance !== null &&
  state.gmInstance.sessionId === state.session?.id;

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
