import { beforeEach, describe, expect, it } from 'vitest';
import { selectIsGm, useSessionStore } from './useSessionStore';
import type { Player } from '@/types/game';

const player: Player = {
  uid: 'u1',
  sessionId: 's1',
  displayName: 'Emerald',
  role: 'player',
  seatId: null,
  joinedAt: '2026-01-01T00:00:00.000Z',
};

describe('useSessionStore', () => {
  beforeEach(() => {
    useSessionStore.getState().reset();
  });

  it('starts idle and empty', () => {
    const state = useSessionStore.getState();
    expect(state.connection).toBe('idle');
    expect(state.seats).toEqual([]);
    expect(state.session).toBeNull();
  });

  it('reset clears a populated store', () => {
    useSessionStore.getState().setMe(player);
    useSessionStore.getState().setConnection('live');
    useSessionStore.getState().reset();
    expect(useSessionStore.getState().me).toBeNull();
    expect(useSessionStore.getState().connection).toBe('idle');
  });

  it('selectIsGm only matches the gm role', () => {
    useSessionStore.getState().setMe(player);
    expect(selectIsGm(useSessionStore.getState())).toBe(false);
    useSessionStore.getState().setMe({ ...player, role: 'gm' });
    expect(selectIsGm(useSessionStore.getState())).toBe(true);
  });
});
