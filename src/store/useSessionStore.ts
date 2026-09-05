import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { GameSession, Player, Seat } from '@/types/game';

export const SESSION_STORAGE_KEY = 'dow-new-eden-session';
export type ConsoleMode = 'gm' | 'console';

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
  mode: ConsoleMode | null;
  lastRoute: string | null;
  connection: 'idle' | 'connecting' | 'live' | 'offline';

  setSession: (session: GameSession | null) => void;
  setIdentity: (session: GameSession, me: Player) => void;
  setSeats: (seats: readonly Seat[]) => void;
  setMe: (me: Player | null) => void;
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
  mode: null,
  lastRoute: null,
  connection: 'idle',
} satisfies Pick<
  SessionState,
  'session' | 'seats' | 'me' | 'mode' | 'lastRoute' | 'connection'
>;

export const useSessionStore = create<SessionState>()(
  persist(
    (set) => ({
      ...initial,
      setSession: (session) => set({ session }),
      setIdentity: (session, me) => set({ session, me }),
      setSeats: (seats) => set({ seats }),
      setMe: (me) => set({ me }),
      setMode: (mode) => set({ mode }),
      setLastRoute: (lastRoute) => set({ lastRoute }),
      setConnection: (connection) => set({ connection }),
      disconnect: () =>
        set({ session: null, seats: [], me: null, mode: null, lastRoute: null }),
      reset: () => set({ ...initial }),
    }),
    {
      name: SESSION_STORAGE_KEY,
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: ({ session, me, mode, lastRoute }) => ({
        session,
        me,
        mode,
        lastRoute,
      }),
    },
  ),
);

export const selectIsGm = (state: SessionState): boolean =>
  state.me?.role === 'gm';

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
