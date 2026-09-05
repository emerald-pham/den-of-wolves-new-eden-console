import { beforeEach, describe, expect, it } from 'vitest';
import {
  SESSION_STORAGE_KEY,
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
    localStorage.clear();
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

  it('persists the current session, player, mode, and last route', () => {
    useSessionStore.getState().setSession(session);
    useSessionStore.getState().setMe(player);
    useSessionStore.getState().setMode('console');
    useSessionStore.getState().setLastRoute('/console');

    const saved = JSON.parse(localStorage.getItem(SESSION_STORAGE_KEY) ?? '{}');
    expect(saved.state).toMatchObject({
      session,
      me: player,
      mode: 'console',
      lastRoute: '/console',
    });
    expect(saved.state).not.toHaveProperty('connection');
  });

  it('rehydrates a saved session as soon as the store is reopened', async () => {
    localStorage.setItem(
      SESSION_STORAGE_KEY,
      JSON.stringify({
        state: { session, me: player, mode: 'console', lastRoute: '/console' },
        version: 1,
      }),
    );

    await useSessionStore.persist.rehydrate();

    expect(useSessionStore.getState()).toMatchObject({
      session,
      me: player,
      mode: 'console',
      lastRoute: '/console',
    });
  });

  it('disconnect is idempotent and removes all persisted session state', () => {
    useSessionStore.getState().setSession(session);
    useSessionStore.getState().setMe(player);
    useSessionStore.getState().setMode('console');
    useSessionStore.getState().setLastRoute('/console');

    useSessionStore.getState().disconnect();
    useSessionStore.getState().disconnect();

    expect(useSessionStore.getState()).toMatchObject({
      session: null,
      me: null,
      seats: [],
      mode: null,
      lastRoute: null,
    });
    const saved = JSON.parse(localStorage.getItem(SESSION_STORAGE_KEY) ?? '{}');
    expect(saved.state).toMatchObject({
      session: null,
      me: null,
      mode: null,
      lastRoute: null,
    });
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

  it('stays yellow for an incomplete cached session without its player', () => {
    useSessionStore.getState().setConnection('live');
    useSessionStore.getState().setSession(session);
    expect(selectConnectionStatus(useSessionStore.getState())).toBe('yellow');
  });

  it('is green when Firebase is live and a complete session is joined', () => {
    useSessionStore.getState().setConnection('live');
    useSessionStore.getState().setSession(session);
    useSessionStore.getState().setMe(player);
    expect(selectConnectionStatus(useSessionStore.getState())).toBe('green');
  });
});
