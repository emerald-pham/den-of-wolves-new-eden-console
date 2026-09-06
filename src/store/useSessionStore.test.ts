import { beforeEach, describe, expect, it, vi } from 'vitest';
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

const gmInstance = {
  id: 'instance-1',
  sessionId: 's1',
  uid: 'u1',
  name: 'Bridge laptop',
  deviceLabel: 'Mac / Chrome',
  claimedAt: '2026-01-01T00:00:00.000Z',
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

  it('persists the current session, player, GM instance, mode, and last route', () => {
    useSessionStore.getState().setSession(session);
    useSessionStore.getState().setMe(player);
    useSessionStore.getState().setMode('console');
    useSessionStore.getState().setLastRoute('/console');
    useSessionStore.getState().setGmInstance(gmInstance);

    const saved = JSON.parse(localStorage.getItem(SESSION_STORAGE_KEY) ?? '{}');
    expect(saved.state).toMatchObject({
      session,
      me: player,
      gmInstance,
      mode: 'console',
      lastRoute: '/console',
    });
    expect(saved.state).not.toHaveProperty('connection');
  });

  it('rehydrates a saved session as soon as the store is reopened', async () => {
    localStorage.setItem(
      SESSION_STORAGE_KEY,
      JSON.stringify({
        state: { session, me: player, gmInstance, mode: 'console', lastRoute: '/console' },
        version: 1,
      }),
    );

    await useSessionStore.persist.rehydrate();

    expect(useSessionStore.getState()).toMatchObject({
      session,
      me: player,
      gmInstance,
      mode: 'console',
      lastRoute: '/console',
    });
  });

  it('disconnect is idempotent and removes all persisted session state', () => {
    useSessionStore.getState().setSession(session);
    useSessionStore.getState().setMe(player);
    useSessionStore.getState().setMode('console');
    useSessionStore.getState().setLastRoute('/console');
    useSessionStore.getState().setGmInstance(gmInstance);

    useSessionStore.getState().disconnect();
    useSessionStore.getState().disconnect();

    expect(useSessionStore.getState()).toMatchObject({
      session: null,
      me: null,
      gmInstance: null,
      seats: [],
      mode: null,
      lastRoute: null,
    });
    const saved = JSON.parse(localStorage.getItem(SESSION_STORAGE_KEY) ?? '{}');
    expect(saved.state).toMatchObject({
      session: null,
      me: null,
      gmInstance: null,
      mode: null,
      lastRoute: null,
    });
  });

  it('persists offline commands until reconnect and removes them after delivery', () => {
    const command = {
      id: 'command-1',
      kind: 'kickGmInstance' as const,
      payload: { sessionId: 's1', instanceId: 'instance-1', targetInstanceId: 'instance-2' },
      createdAt: '2026-01-01T00:00:00.000Z',
    };

    useSessionStore.getState().enqueueCommand(command);
    expect(useSessionStore.getState().pendingCommands).toEqual([command]);
    expect(JSON.parse(localStorage.getItem(SESSION_STORAGE_KEY) ?? '{}').state.pendingCommands)
      .toEqual([command]);

    useSessionStore.getState().removeCommand('command-1');
    expect(useSessionStore.getState().pendingCommands).toEqual([]);
  });

  it('keeps communication errors ephemeral rather than persisting them', () => {
    useSessionStore.getState().setCommunicationError({ code: 'aborted', message: 'Conflict.' });

    expect(useSessionStore.getState().communicationError).toEqual({
      code: 'aborted', message: 'Conflict.',
    });
    const saved = JSON.parse(localStorage.getItem(SESSION_STORAGE_KEY) ?? '{}');
    expect(saved.state).not.toHaveProperty('communicationError');
  });

  it('selectIsGm only matches a local GM instance for the current session', () => {
    useSessionStore.getState().setIdentity(session, { ...player, role: 'gm' });
    expect(selectIsGm(useSessionStore.getState())).toBe(false);
    useSessionStore.getState().setGmInstance(gmInstance);
    expect(selectIsGm(useSessionStore.getState())).toBe(true);
    useSessionStore.getState().setMe(player);
    expect(selectIsGm(useSessionStore.getState())).toBe(false);
    useSessionStore.getState().setMe({ ...player, role: 'gm' });
    useSessionStore.getState().setSession({ ...session, id: 's2' });
    expect(selectIsGm(useSessionStore.getState())).toBe(false);
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


it('avoids rewriting the session snapshot for unchanged heartbeat and route state', () => {
  const store = useSessionStore.getState();
  store.setIdentity(session, player);
  store.setLastRoute('/console');
  store.setConnection('live');
  const writes = vi.spyOn(Storage.prototype, 'setItem');
  const updates = vi.fn();
  const unsubscribe = useSessionStore.subscribe(updates);
  try {
    for (let i = 0; i < 100; i += 1) {
      store.setMe({ ...player });
      store.setLastRoute('/console');
      store.setConnection('live');
    }
    expect(writes).not.toHaveBeenCalled();
    expect(updates).not.toHaveBeenCalled();
    store.setMe({ ...player, activeConsoleRoleId: 'aegis-commander' });
    store.setLastRoute('/roles');
    store.setConnection('offline');
    expect(updates).toHaveBeenCalledTimes(3);
    const saved = JSON.parse(localStorage.getItem(SESSION_STORAGE_KEY) ?? '{}');
    expect(saved.state.me.activeConsoleRoleId).toBe('aegis-commander');
    expect(saved.state.lastRoute).toBe('/roles');
  } finally {
    unsubscribe();
    writes.mockRestore();
  }
});
