import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useSessionStore } from '@/store/useSessionStore';
import type { GameSession } from '@/types/game';

const mocks = vi.hoisted(() => ({
  callable: vi.fn(),
  httpsCallable: vi.fn(),
  doc: vi.fn(),
  getDocFromServer: vi.fn(),
  onSnapshot: vi.fn(),
  functions: vi.fn(() => 'functions-instance'),
  db: vi.fn(() => 'firestore-instance'),
  onNext: undefined as ((snapshot: unknown) => void) | undefined,
  onError: undefined as ((error: unknown) => void) | undefined,
}));

vi.mock('firebase/functions', () => ({ httpsCallable: mocks.httpsCallable }));
vi.mock('firebase/firestore', () => ({
  doc: mocks.doc, getDocFromServer: mocks.getDocFromServer, onSnapshot: mocks.onSnapshot,
}));
vi.mock('./firebase', () => ({ functions: mocks.functions }));
vi.mock('./firestore', () => ({ db: mocks.db }));

import {
  applyGorgoneionMissionSupport,
  getGorgoneionMissionSupportProjection,
  subscribeGorgoneionMissionSupportProjection,
} from './gorgoneionMissionSupportService';

const view = {
  sessionId: 's1', actorUid: 'captain', hostShipId: 'aegis', dockingRevision: 2,
  dealtCount: 0 as const, cardIds: ['Q♣', 'A♥', '5♦', 'K♥', '4♥'],
} as const;
const requestId = '00000000-0000-4000-8000-000000000001';

function installSession(overrides: Partial<GameSession> = {}): void {
  useSessionStore.getState().reset();
  useSessionStore.getState().setIdentity({
    id: 's1', name: 'Fleet', joinCode: '1234', phase: 'active', ownerUid: 'owner',
    createdAt: '', updatedAt: '',
  }, {
    uid: 'captain', sessionId: 's1', displayName: 'Captain', role: 'player', seatId: null,
    assignedRoleId: 'admiral', replacementRoleId: 'gorgoneion-captain',
    replacementStatus: null, activeConsoleRoleId: null, joinedAt: '',
  });
  useSessionStore.getState().setSession({
    ...useSessionStore.getState().session!, phase: 'active', activeVesselIds: ['aegis'],
    smallShipStates: {
      gorgoneion: {
        id: 'gorgoneion', hostShipId: 'aegis', dockingRevision: 2,
        population: 1_000, unrest: 0,
        cycle: { step: 0, revision: 1, results: {}, charges: [], turn: 1,
          chargingSkipped: false, startedAt: '' },
      },
    },
    ...overrides,
  } as GameSession);
  useSessionStore.getState().setConnection('live');
  useSessionStore.getState().setSessionSnapshotFreshness('server');
}

beforeEach(() => {
  mocks.callable.mockReset();
  mocks.httpsCallable.mockReset().mockReturnValue(mocks.callable);
  mocks.doc.mockReset().mockReturnValue('projection-ref');
  mocks.getDocFromServer.mockReset().mockResolvedValue({ exists: () => true, data: () => view });
  mocks.onSnapshot.mockReset().mockImplementation((_ref, _options, onNext, onError) => {
    mocks.onNext = onNext;
    mocks.onError = onError;
    return vi.fn();
  });
  vi.spyOn(window.crypto, 'randomUUID').mockReturnValue(requestId);
  installSession();
});

afterEach(() => {
  vi.restoreAllMocks();
});

it('loads only the exact current Captain projection from the callable response', async () => {
  mocks.callable.mockResolvedValue({ data: { status: 'available', ...view } });
  await expect(getGorgoneionMissionSupportProjection()).resolves.toEqual(view);
  expect(mocks.httpsCallable).toHaveBeenCalledWith('functions-instance', 'getGorgoneionMissionSupportProjection');
  expect(mocks.callable).toHaveBeenCalledWith({ sessionId: 's1' });
  expect(mocks.getDocFromServer).toHaveBeenCalledWith('projection-ref');

  mocks.callable.mockResolvedValue({ data: { status: 'available', ...view, actorUid: 'another-player' } });
  await expect(getGorgoneionMissionSupportProjection()).rejects.toThrow(/malformed|authority/i);
});

it('sends the immutable projection and exact partition with a retry-stable request id', async () => {
  mocks.callable.mockResolvedValue({
    data: { status: 'committed', sessionId: 's1', requestId, cardCount: 5 },
  });
  await expect(applyGorgoneionMissionSupport({
    projection: view,
    topCardIds: ['Q♣', '5♦', 'K♥', '4♥'],
    bottomCardIds: ['A♥'],
  })).resolves.toEqual({ status: 'committed', sessionId: 's1', requestId, cardCount: 5 });
  expect(mocks.httpsCallable).toHaveBeenCalledWith('functions-instance', 'applyGorgoneionMissionSupport');
  expect(mocks.callable).toHaveBeenCalledWith({
    sessionId: 's1', requestId, actorUid: 'captain', hostShipId: 'aegis',
    dockingRevision: 2, dealtCount: 0, cardIds: view.cardIds,
    topCardIds: ['Q♣', '5♦', 'K♥', '4♥'], bottomCardIds: ['A♥'],
  });
});

it('does not accept cached face documents and clears the listener on server revocation', () => {
  const receive = vi.fn();
  subscribeGorgoneionMissionSupportProjection('s1', 'captain', receive);
  expect(mocks.doc).toHaveBeenCalledWith('firestore-instance', 'sessions/s1/gorgoneionMissionSupportViews/captain');

  const snapshot = (fromCache: boolean) => ({
    metadata: { fromCache }, exists: () => true, data: () => view,
  });
  mocks.onNext?.(snapshot(true));
  expect(receive).not.toHaveBeenCalled();
  mocks.onNext?.(snapshot(false));
  expect(receive).toHaveBeenLastCalledWith(view);
  mocks.onError?.(new Error('permission-denied'));
  expect(receive).toHaveBeenLastCalledWith(null);
});

it('rejects a delayed apply receipt if the dock authority changed while it was pending', async () => {
  let finish!: (result: unknown) => void;
  mocks.callable.mockReturnValue(new Promise((resolve) => { finish = resolve; }));
  const pending = applyGorgoneionMissionSupport({
    projection: view, topCardIds: view.cardIds, bottomCardIds: [],
  });
  const session = useSessionStore.getState().session!;
  useSessionStore.getState().setSession({
    ...session,
    smallShipStates: {
      ...session.smallShipStates,
      gorgoneion: { ...session.smallShipStates!.gorgoneion!, dockingRevision: 3 },
    },
  } as GameSession);
  finish({ data: { status: 'committed', sessionId: 's1', requestId, cardCount: 5 } });
  await expect(pending).rejects.toThrow(/authority|changed/i);
});
