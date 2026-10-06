import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useSessionStore } from '@/store/useSessionStore';
import type * as FirestoreModule from '@/lib/firestore';

vi.mock('firebase/auth', () => ({ signInAnonymously: vi.fn().mockResolvedValue(undefined) }));
vi.mock('firebase/functions', () => ({ httpsCallable: vi.fn() }));
vi.mock('./firebase', () => ({
  auth: () => ({ currentUser: { uid: 'u1' } }),
  functions: vi.fn(() => ({ kind: 'functions' })),
}));

const { httpsCallable } = await import('firebase/functions');
const sessionService = await import('./sessionService') as unknown as {
  submitShipPreference?: (shipId: string) => Promise<{ disposition: string; requestId: string }>;
};

function submit(shipId = 'aegis') {
  if (typeof sessionService.submitShipPreference !== 'function') {
    throw new Error('The receipt-aware ship-preference service is not available.');
  }
  return sessionService.submitShipPreference(shipId);
}

function callableReturning(value: unknown) {
  return Object.assign(vi.fn().mockResolvedValue(value), { stream: vi.fn() });
}

const session = {
  id: 's1', name: 'Table one', joinCode: '4821', phase: 'casting' as const,
  activeVesselIds: ['aegis', 'dione'], setupRevision: 7, configurationLocked: false,
  pressEnabled: true,
};
const player = {
  uid: 'u1', sessionId: 's1', displayName: 'Crew', role: 'player' as const, seatId: null,
  connected: true, shipPreferenceId: null,
};

beforeEach(() => {
  vi.mocked(httpsCallable).mockReset();
  useSessionStore.getState().reset();
  useSessionStore.getState().setIdentity(session as never, player as never);
  useSessionStore.getState().setConnection('live');
  useSessionStore.getState().setSessionSnapshotFreshness('server');
  vi.spyOn(window.navigator, 'onLine', 'get').mockReturnValue(true);
});

afterEach(() => vi.restoreAllMocks());

it('uses the active member roster and a stable server receipt for the preference mutation', async () => {
  const callable = callableReturning({ data: { sessionId: 's1', setupRevision: 8 } });
  vi.mocked(httpsCallable).mockReturnValue(callable as never);

  const result = await submit('dione');

  expect(result.disposition).toBe('applied');
  expect(result.requestId).toEqual(expect.any(String));
  expect(callable).toHaveBeenCalledWith({
    sessionId: 's1', requestId: result.requestId, shipId: 'dione',
  });
  expect(useSessionStore.getState().me?.shipPreferenceId).toBe('dione');
  expect(useSessionStore.getState().session?.setupRevision).toBe(8);
  expect(useSessionStore.getState().pendingCommands).toEqual([]);
});

it('retains one exact request in the existing outbox after an ambiguous transport failure', async () => {
  const call = Object.assign(vi.fn().mockRejectedValue(
    Object.assign(new Error('connection lost'), { code: 'functions/unavailable' }),
  ), { stream: vi.fn() });
  vi.mocked(httpsCallable).mockReturnValue(call as never);

  const result = await submit('aegis');

  expect(result.disposition).toBe('queued');
  const [pending] = useSessionStore.getState().pendingCommands;
  expect(pending).toMatchObject({
    id: result.requestId, kind: 'setShipPreference',
    payload: { sessionId: 's1', requestId: result.requestId, shipId: 'aegis' },
    queuedWithServerAuthority: true,
  });
  expect(useSessionStore.getState().connection).toBe('offline');
});

it.each([
  ['a stale cached connection', { connection: 'offline', freshness: 'cache' }, 'Reconnect'],
  ['a phase outside the casting window', { phase: 'active' }, 'casting'],
  ['a locked casting session', { configurationLocked: true }, 'casting'],
  ['a vessel outside the active roster', { shipId: 'shepherd' }, 'active roster'],
  ['a missing authoritative active roster', { activeVesselIds: undefined }, 'active roster'],
])('does not call the server for %s', async (_label, patch, message) => {
  if ('connection' in patch) {
    useSessionStore.getState().setConnection(patch.connection as 'offline');
    useSessionStore.getState().setSessionSnapshotFreshness(patch.freshness as 'cache');
  }
  if ('phase' in patch || 'configurationLocked' in patch || 'activeVesselIds' in patch) {
    useSessionStore.getState().setSession({ ...useSessionStore.getState().session!, ...patch } as never);
  }

  await expect(submit('shipId' in patch ? patch.shipId as string : 'aegis')).rejects.toThrow(
    new RegExp(message, 'i'),
  );
  expect(httpsCallable).not.toHaveBeenCalled();
});

it.each(['actor', 'role', 'casting state'] as const)(
  'does not apply a late receipt after the %s changes', async (change) => {
    let finish!: (value: { data: unknown }) => void;
    const call = Object.assign(vi.fn(() => new Promise<{ data: unknown }>((resolve) => {
      finish = resolve;
    })), { stream: vi.fn() });
    vi.mocked(httpsCallable).mockReturnValue(call as never);

    const pending = submit('aegis');
    await vi.waitFor(() => expect(call).toHaveBeenCalledTimes(1));
    if (change === 'actor') {
      useSessionStore.getState().setMe({ ...useSessionStore.getState().me!, uid: 'u2' } as never);
    } else if (change === 'role') {
      useSessionStore.getState().setMe({ ...useSessionStore.getState().me!, role: 'gm' } as never);
    } else {
      useSessionStore.getState().setSession({ ...useSessionStore.getState().session!, phase: 'active' } as never);
    }
    finish({ data: { sessionId: 's1', setupRevision: 8 } });

    await expect(pending).rejects.toThrow(/changed|current player|casting/i);
    expect(useSessionStore.getState().me?.shipPreferenceId).toBeNull();
    expect(useSessionStore.getState().session?.setupRevision).toBe(7);
  },
);

