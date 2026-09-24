import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  GM_ACCESS_TIMEOUT_MS,
  SESSION_STORAGE_KEY,
  selectConnectionStatus,
  selectGmAccessAuthenticated,
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
    expect(state.gmAccessAuthenticatedAt).toBeNull();
    expect(state.persistedSessionSnapshot).toBe(false);
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
    useSessionStore.getState().setGmAccessAuthenticatedAt(Date.now());

    const saved = JSON.parse(localStorage.getItem(SESSION_STORAGE_KEY) ?? '{}');
    expect(saved.state).toMatchObject({
      session,
      me: player,
      gmInstance,
      mode: 'console',
      lastRoute: '/console',
    });
    expect(saved.state).not.toHaveProperty('connection');
    expect(saved.state).not.toHaveProperty('persistedSessionSnapshot');
  });

  it.each([false, true])('does not persist private navigation state from a previous UID (own ship: %s)', async (hasOwn) => {
    const own = {
      groupId: 'fleet-1', shipId: 'aegis', currentCoordinate: '0000',
      knownCoordinates: ['0000'], knownSystems: { 'system-01': '0000' },
      navigationLogs: [], pursuitDistance: 0, revision: 1,
    };
    const privateSession = {
      ...session,
      ...(hasOwn ? { playerDiscovery: own } : {}),
      organiserSystems: { 'system-17': '8378' },
      organiserSites: { '8378': { code: 'J', name: 'Private site', candidate: false, summary: 'Secret' } },
      organiserSystemHistory: {}, pursuitDistances: { dione: 6 },
      pursuitGroups: { 'fleet-2': 7 }, shipFleetGroupIds: { dione: 'fleet-2' },
      shipGalacticCoordinates: { aegis: '0000', dione: '8378' },
      shipNavigationLogs: { aegis: [], dione: [] },
      candidatePlanCheckpoint: { cycle: 6 as const, planExists: true, checkedAt: '2026-09-22T12:00:00.000Z' },
      currentGroupCandidateReveals: {
        groupId: 'fleet-1', revision: 4,
        candidateReveals: [{ code: 'N' as const, title: 'Ancient Jump Ring' }],
      },
    };
    useSessionStore.getState().setIdentity(privateSession, { ...player, uid: 'previous-uid', role: 'player' });
    const assertNoPrivateNavigation = (value: GameSession) => {
      for (const key of [
        'playerDiscovery', 'shipGalacticCoordinates', 'shipNavigationLogs', 'organiserSystems',
        'organiserSites', 'organiserSystemHistory', 'pursuitDistances', 'pursuitGroups',
        'shipFleetGroupIds', 'candidatePlanCheckpoint', 'currentGroupCandidateReveals',
      ]) {
        expect(value).not.toHaveProperty(key);
      }
      expect(JSON.stringify(value)).not.toContain('8378');
      expect(JSON.stringify(value)).not.toContain('Ancient Jump Ring');
    };
    // Rehydration happens synchronously before AppRuntime asks Firebase to
    // resume the cached identity. Do not persist the previous UID's private
    // chart while that later authority check is pending.
    assertNoPrivateNavigation(JSON.parse(localStorage.getItem(SESSION_STORAGE_KEY)!).state.session);
    expect(useSessionStore.getState().session?.playerDiscovery).toEqual(hasOwn ? own : undefined);
    expect(useSessionStore.getState().session?.organiserSystems).toEqual(privateSession.organiserSystems);

    // A legacy cache created before the privacy boundary must be stripped too.
    localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify({ version: 1, state: {
      session: privateSession,
      me: { ...player, uid: 'previous-uid', role: 'player' },
      gmInstance: null,
      mode: 'console',
      lastRoute: '/console',
    } }));
    await useSessionStore.persist.rehydrate();
    assertNoPrivateNavigation(useSessionStore.getState().session!);
  });

  it('persists GM login status without persisting the password', () => {
    const authenticatedAt = Date.parse('2026-01-01T00:00:00.000Z');
    useSessionStore.getState().setGmAccessAuthenticatedAt(authenticatedAt);

    expect(selectGmAccessAuthenticated(useSessionStore.getState(), authenticatedAt)).toBe(true);
    expect(JSON.parse(localStorage.getItem(SESSION_STORAGE_KEY) ?? '{}').state)
      .toMatchObject({ gmAccessAuthenticatedAt: authenticatedAt });
    expect(JSON.parse(localStorage.getItem(SESSION_STORAGE_KEY) ?? '{}').state)
      .not.toHaveProperty('gmAccessPassword');

    useSessionStore.getState().clearGmAccess();
    expect(useSessionStore.getState().gmAccessAuthenticatedAt).toBeNull();
    expect(selectGmAccessAuthenticated(useSessionStore.getState(), authenticatedAt)).toBe(false);
  });

  it('expires GM login after the safety timeout', () => {
    const authenticatedAt = Date.parse('2026-01-01T00:00:00.000Z');
    useSessionStore.getState().setGmAccessAuthenticatedAt(authenticatedAt);

    expect(selectGmAccessAuthenticated(
      useSessionStore.getState(), authenticatedAt + GM_ACCESS_TIMEOUT_MS - 1,
    )).toBe(true);
    expect(selectGmAccessAuthenticated(
      useSessionStore.getState(), authenticatedAt + GM_ACCESS_TIMEOUT_MS,
    )).toBe(false);
  });

  it('keeps a GM-only transmission replay local and ephemeral', () => {
    useSessionStore.getState().setTurnStartReplay({
      sessionId: 's1',
      turn: 1,
      survivorPopulation: 242_500,
      token: 1,
    });

    expect(useSessionStore.getState().turnStartReplay).toEqual({
      sessionId: 's1',
      turn: 1,
      survivorPopulation: 242_500,
      token: 1,
    });
    expect(JSON.parse(localStorage.getItem(SESSION_STORAGE_KEY) ?? '{}').state)
      .not.toHaveProperty('turnStartReplay');
  });

  it('rehydrates a saved session as soon as the store is reopened', async () => {
    localStorage.setItem(
      SESSION_STORAGE_KEY,
      JSON.stringify({
        state: {
          session,
          me: player,
          gmInstance,
          mode: 'console',
          lastRoute: '/console',
          connection: 'live',
          sessionSnapshotFreshness: 'server',
        },
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
      sessionSnapshotFreshness: 'cache',
      persistedSessionSnapshot: true,
    });
    expect(useSessionStore.getState().connection).toBe('idle');

    useSessionStore.getState().setSessionSnapshotFreshness('server');
    expect(useSessionStore.getState().persistedSessionSnapshot).toBe(false);
  });

  it('disconnect is idempotent and removes all persisted session state', () => {
    useSessionStore.getState().setSession(session);
    useSessionStore.getState().setMe(player);
    useSessionStore.getState().setMode('console');
    useSessionStore.getState().setLastRoute('/console');
    useSessionStore.getState().setGmInstance(gmInstance);
    useSessionStore.getState().setGmAccessAuthenticatedAt(Date.now());

    useSessionStore.getState().disconnect();
    useSessionStore.getState().disconnect();

    expect(useSessionStore.getState()).toMatchObject({
      session: null,
      me: null,
      gmInstance: null,
      seats: [],
      mode: null,
      lastRoute: null,
      gmAccessAuthenticatedAt: expect.any(Number),
    });
    const saved = JSON.parse(localStorage.getItem(SESSION_STORAGE_KEY) ?? '{}');
    expect(saved.state).toMatchObject({
      session: null,
      me: null,
      gmInstance: null,
      mode: null,
      lastRoute: null,
      gmAccessAuthenticatedAt: expect.any(Number),
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

  it('does not persist a GM claim in the browser outbox', () => {
    const command = {
      id: 'gm-command-1',
      kind: 'claimGmInstance' as const,
      payload: {
        sessionId: 's1', instanceId: 'instance-1', name: 'Bridge',
        deviceLabel: 'Browser',
      },
      createdAt: new Date().toISOString(),
    };

    useSessionStore.getState().enqueueCommand(command);

    expect(useSessionStore.getState().pendingCommands).toEqual([command]);
    expect(JSON.parse(localStorage.getItem(SESSION_STORAGE_KEY) ?? '{}').state.pendingCommands)
      .toEqual([]);
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
