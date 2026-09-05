import { create } from 'zustand';
import type { GameSession, Player, Seat } from '@/types/game';

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
  connection: 'idle' | 'connecting' | 'live' | 'offline';

  setSession: (session: GameSession | null) => void;
  setSeats: (seats: readonly Seat[]) => void;
  setMe: (me: Player | null) => void;
  setConnection: (connection: SessionState['connection']) => void;
  reset: () => void;
}

const initial = {
  session: null,
  seats: [] as readonly Seat[],
  me: null,
  connection: 'idle',
} satisfies Pick<SessionState, 'session' | 'seats' | 'me' | 'connection'>;

export const useSessionStore = create<SessionState>((set) => ({
  ...initial,
  setSession: (session) => set({ session }),
  setSeats: (seats) => set({ seats }),
  setMe: (me) => set({ me }),
  setConnection: (connection) => set({ connection }),
  reset: () => set({ ...initial }),
}));

export const selectIsGm = (state: SessionState): boolean =>
  state.me?.role === 'gm';
