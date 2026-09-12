import { beforeEach, expect, it, vi } from 'vitest';
import { useSessionStore } from '@/store/useSessionStore';

const mocks = vi.hoisted(() => ({ call: vi.fn(), callable: vi.fn() }));
vi.mock('firebase/functions', () => ({ httpsCallable: mocks.callable }));
vi.mock('./firebase', () => ({ functions: () => 'functions' }));

import { unlockPressAirspace } from './airspaceService';
const { acceptCallableSessionAuthority } = await import('./firestore');

beforeEach(() => {
  mocks.call.mockReset();
  mocks.callable.mockReset();
  mocks.call.mockResolvedValue({ data: {} });
  mocks.callable.mockReturnValue(mocks.call);
  useSessionStore.getState().reset();
  useSessionStore.setState({
    connection: 'live',
    sessionSnapshotFreshness: 'server',
    session: {
      id: 's1', name: 'Fleet', joinCode: '1234', phase: 'active', ownerUid: 'u1',
      createdAt: '', updatedAt: '',
    },
  });
});

it('allows a Press airspace command backed by a live server snapshot', async () => {
  await unlockPressAirspace();
  expect(mocks.callable).toHaveBeenCalledWith('functions', 'unlockPressAirspace');
  expect(mocks.call).toHaveBeenCalledWith({ sessionId: 's1' });
});

it('binds a GM Press airspace command to this browser instance', async () => {
  useSessionStore.getState().setGmInstance({
    id: 'bridge', sessionId: 's1', uid: 'u1', name: 'Bridge', deviceLabel: 'Test browser',
    claimedAt: '',
  });

  await unlockPressAirspace();

  expect(mocks.call).toHaveBeenCalledWith({ sessionId: 's1', instanceId: 'bridge' });
});

it('clears a prior turn entity when the accepted Press phase reply is malformed', async () => {
  const phase = {
    turn: 1,
    teamPhaseEndsAt: '2026-01-01T00:05:00.000Z',
    openAirspaceEndsAt: '2026-01-01T00:20:00.000Z',
    airspace: { state: 'restricted' as const, tickerActive: true, pressAccess: false },
  };
  useSessionStore.getState().setSession({
    id: 'turn-state-clear', name: 'Fleet', joinCode: '1234', phase: 'active', ownerUid: 'u1',
    currentTurn: 1, turnLimit: 7, turnPhase: phase,
    turnState: {
      currentTurn: 1, maxTurn: 7, phase: 'team', phaseRevision: 1,
      startedAt: '2026-01-01T00:00:00.000Z', endsAt: phase.teamPhaseEndsAt,
    },
    createdAt: '', updatedAt: '',
  });
  useSessionStore.getState().setMe({
    uid: 'u1', sessionId: 'turn-state-clear', displayName: 'GM', role: 'gm',
    seatId: null, joinedAt: '',
  });
  useSessionStore.getState().setConnection('live');
  useSessionStore.getState().setSessionSnapshotFreshness('server');
  mocks.call.mockResolvedValue({ data: {
    turnPhase: {
      ...phase,
      airspace: { ...phase.airspace, state: 'restricted', pressAccess: true },
    },
    turnState: { currentTurn: 1, maxTurn: 7, phase: 'team' },
  } });

  await unlockPressAirspace();

  expect(useSessionStore.getState().session?.turnState).toBeUndefined();
});

it('rejects a Press airspace command backed only by cached session state', async () => {
  useSessionStore.getState().setSessionSnapshotFreshness('cache');
  await expect(unlockPressAirspace()).rejects.toThrow(/live session state/i);
  expect(mocks.callable).not.toHaveBeenCalled();
});

it('does not patch a delayed airspace reply over newer session authority', async () => {
  const sessionId = 'airspace-race';
  const initialSession = {
    id: sessionId, name: 'Fleet', joinCode: '1234', phase: 'active' as const,
    currentTurn: 1, ownerUid: 'u1', createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-09-11T12:00:00.000Z',
  };
  const newerSession = {
    ...initialSession,
    updatedAt: '2026-09-11T12:01:00.000Z',
    turnPhase: {
      turn: 1,
      teamPhaseEndsAt: '2026-09-11T12:05:00.000Z',
      openAirspaceEndsAt: '2026-09-11T12:20:00.000Z',
      airspace: { state: 'restricted' as const, tickerActive: true, pressAccess: false },
    },
  };
  useSessionStore.getState().setIdentity(initialSession, {
    uid: 'u1', sessionId, displayName: 'GM', role: 'gm', seatId: null, joinedAt: '',
  });
  useSessionStore.getState().setConnection('live');
  useSessionStore.getState().setSessionSnapshotFreshness('server');

  let finish!: (value: { data: { turnPhase: unknown } }) => void;
  mocks.call.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
  const pending = unlockPressAirspace();
  await vi.waitFor(() => expect(finish).toBeDefined());

  expect(acceptCallableSessionAuthority(newerSession, 'u1')).toBe(true);
  useSessionStore.getState().setSession(newerSession);
  finish({ data: {
    turnPhase: {
      turn: 1,
      teamPhaseEndsAt: '2026-09-11T12:05:00.000Z',
      openAirspaceEndsAt: '2026-09-11T12:20:00.000Z',
      airspace: { state: 'lifted', tickerActive: true, pressAccess: true },
    },
  } });
  await pending;

  expect(useSessionStore.getState().session).toEqual(newerSession);
});
