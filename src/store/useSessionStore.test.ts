import { beforeEach, describe, expect, it } from 'vitest';
import {
  selectConnectionStatus,
  selectIsGm,
  useSessionStore,
} from './useSessionStore';
import type { GameSession, Player } from '@/types/game';

const player: Player = {
  uid: 'u1',
  sessionId: 's1',
  displayName: 'Emerald',
  role: 'player',
  seatId: null,
  joinedAt: '2026-01-01T00:00:00.000Z',
};

const session: GameSession = {
  id: 's1',
  name: 'Table one',
  joinCode: '4821',
  phase: 'lobby',
  ownerUid: 'u1',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
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

describe('selectConnectionStatus', () => {
  beforeEach(() => {
    useSessionStore.getState().reset();
  });

  it('is red before Firebase has ever connected', () => {
    expect(selectConnectionStatus(useSessionStore.getState())).toBe('red');
  });

  it('is red while the connection is still being established', () => {
    useSessionStore.getState().setConnection('connecting');
    expect(selectConnectionStatus(useSessionStore.getState())).toBe('red');
  });

  it('is red when Firebase is offline', () => {
    useSessionStore.getState().setConnection('offline');
    expect(selectConnectionStatus(useSessionStore.getState())).toBe('red');
  });

  it('is red when Firebase drops even though a session is still loaded', () => {
    useSessionStore.getState().setSession(session);
    useSessionStore.getState().setConnection('offline');
    expect(selectConnectionStatus(useSessionStore.getState())).toBe('red');
  });

  it('is yellow when Firebase is live but no session has been joined', () => {
    useSessionStore.getState().setConnection('live');
    expect(selectConnectionStatus(useSessionStore.getState())).toBe('yellow');
  });

  it('is green when Firebase is live and a session is joined', () => {
    useSessionStore.getState().setConnection('live');
    useSessionStore.getState().setSession(session);
    expect(selectConnectionStatus(useSessionStore.getState())).toBe('green');
  });
});
