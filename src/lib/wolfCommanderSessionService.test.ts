import { beforeEach, expect, it, vi } from 'vitest';
import { useSessionStore } from '@/store/useSessionStore';
import type { GameSession, Player, WolfCommanderTargetingView } from '@/types/game';

vi.mock('firebase/auth', () => ({
  signInAnonymously: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('firebase/functions', () => ({
  httpsCallable: vi.fn(),
}));

vi.mock('./firebase', () => ({
  auth: () => ({ currentUser: { uid: 'u1' } }),
  functions: vi.fn(() => ({ kind: 'functions' })),
}));

const { httpsCallable } = await import('firebase/functions');
const { acceptCallableSessionAuthority } = await import('./sessionSnapshotAuthority');
const {
  applyWolfCommanderTargetRerolls,
  applyAegisCommandAndControl,
  finishWolfCommanderTargetingRerolls,
  getAegisCommandAndControl,
  getWolfCommanderTargeting,
} = await import('./sessionService');

let fixtureNumber = 0;

function fixture(): { session: GameSession; player: Player } {
  fixtureNumber += 1;
  const sessionId = `wolf-service-${fixtureNumber}`;
  return {
    session: {
      id: sessionId,
      name: 'Table one',
      joinCode: '4821',
      phase: 'active',
      ownerUid: 'gm1',
      currentTurn: 1,
      updatedAt: `2026-09-12T21:00:0${fixtureNumber}.000Z`,
      createdAt: '2026-09-12T20:00:00.000Z',
    },
    player: {
      uid: 'u1',
      sessionId,
      displayName: 'Commander',
      role: 'player',
      seatId: null,
      replacementRoleId: 'wolf-commander',
      joinedAt: '2026-09-12T20:00:00.000Z',
    },
  };
}

function currentView(sessionId: string): WolfCommanderTargetingView {
  return {
    type: 'wolf-commander-targeting-view', sessionId, turn: 1, revision: 1,
    currentStep: 'targeting', rerollsFinalized: false,
    rolls: [{ rosterIndex: 0, shipId: 'wolf-fighter-wing', die: 1, target: 'aegis' }],
    eligibleRerollIndexes: [0], rerolledIndexes: [],
  };
}

function committed(sessionId: string): Record<string, unknown> {
  return {
    status: 'committed', type: 'wolf-commander-target-reroll', sessionId,
    requestId: 'request-1', turn: 1, revision: 2, currentStep: 'targeting',
    rerolledIndexes: [0], view: { ...currentView(sessionId), revision: 2, eligibleRerollIndexes: [], rerolledIndexes: [0] },
  };
}

function setFreshIdentity(): { session: GameSession; player: Player } {
  const values = fixture();
  useSessionStore.getState().setIdentity(values.session, values.player);
  useSessionStore.getState().setConnection('live');
  useSessionStore.getState().setSessionSnapshotFreshness('server');
  expect(acceptCallableSessionAuthority(values.session, values.player.uid)).toBe(true);
  return values;
}

beforeEach(() => {
  useSessionStore.getState().reset();
  vi.mocked(httpsCallable).mockReset();
});

it('rejects a delayed read after the accepted session changes', async () => {
  const { session, player } = setFreshIdentity();
  let finish!: (value: { data: unknown }) => void;
  const call = Object.assign(vi.fn(() => new Promise<{ data: unknown }>((resolve) => { finish = resolve; })), { stream: vi.fn() });
  vi.mocked(httpsCallable).mockReturnValue(call as never);

  const reading = getWolfCommanderTargeting();
  await vi.waitFor(() => expect(call).toHaveBeenCalledWith({ sessionId: session.id }));
  const newer = { ...session, id: `${session.id}-new`, updatedAt: '2026-09-12T21:30:00.000Z' };
  useSessionStore.getState().setIdentity(newer, { ...player, sessionId: newer.id });
  acceptCallableSessionAuthority(newer, player.uid);
  finish({ data: currentView(session.id) });

  await expect(reading).rejects.toThrow(/session or authority changed/i);
});

it('rejects a delayed reroll after Commander authority is removed', async () => {
  const { session, player } = setFreshIdentity();
  let finish!: (value: { data: unknown }) => void;
  const call = Object.assign(vi.fn(() => new Promise<{ data: unknown }>((resolve) => { finish = resolve; })), { stream: vi.fn() });
  vi.mocked(httpsCallable).mockReturnValue(call as never);

  const rerolling = applyWolfCommanderTargetRerolls(1, 1, [0]);
  await vi.waitFor(() => expect(call).toHaveBeenCalledWith(expect.objectContaining({ sessionId: session.id, rosterIndexes: [0] })));
  useSessionStore.getState().setMe({ ...player, replacementRoleId: null });
  finish({ data: committed(session.id) });

  await expect(rerolling).rejects.toThrow(/session or authority changed/i);
});

it('commits explicit no-dice finish through the fresh Commander authority checkpoint', async () => {
  const { session } = setFreshIdentity();
  const view = {
    ...currentView(session.id), revision: 2, rerollsFinalized: true, eligibleRerollIndexes: [],
  };
  const call = Object.assign(vi.fn().mockResolvedValue({ data: {
    status: 'committed', type: 'wolf-commander-targeting-finish', sessionId: session.id,
    requestId: 'finish-1', turn: 1, revision: 2, currentStep: 'targeting', view,
  } }), { stream: vi.fn() });
  vi.mocked(httpsCallable).mockReturnValue(call as never);

  await expect(finishWolfCommanderTargetingRerolls(1, 1)).resolves.toMatchObject({
    type: 'wolf-commander-targeting-finish', revision: 2, view: { rerollsFinalized: true },
  });
  expect(call).toHaveBeenCalledWith({
    sessionId: session.id, requestId: expect.any(String), expectedTurn: 1, expectedRevision: 1,
  });

  call.mockResolvedValueOnce({ data: {
    ...currentView(session.id), rerollsFinalized: true,
  } });
  await expect(getWolfCommanderTargeting()).rejects.toThrow(/invalid Wolf Commander targeting view/i);
});

it('returns only ship identities from the Executive Officer view and rejects leaked dice or targets', async () => {
  const values = fixture();
  const officer: Player = {
    ...values.player, replacementRoleId: null,
    assignedRoleId: 'executive-officer', activeConsoleRoleId: 'executive-officer',
  };
  useSessionStore.getState().setIdentity(values.session, officer);
  useSessionStore.getState().setConnection('live');
  useSessionStore.getState().setSessionSnapshotFreshness('server');
  acceptCallableSessionAuthority(values.session, officer.uid);
  const call = Object.assign(vi.fn().mockResolvedValue({ data: {
    type: 'aegis-command-and-control-view', sessionId: values.session.id, turn: 1, revision: 2,
    eligible: true, commanderAssigned: true, rerollsFinalized: true,
    targets: [{ rosterIndex: 0, shipId: 'wolf-fighter-wing' }],
  } }), { stream: vi.fn() });
  vi.mocked(httpsCallable).mockReturnValue(call as never);

  await expect(getAegisCommandAndControl()).resolves.toMatchObject({
    eligible: true, targets: [{ rosterIndex: 0, shipId: 'wolf-fighter-wing' }],
  });
  expect(call).toHaveBeenCalledWith({ sessionId: values.session.id });

  call.mockResolvedValueOnce({ data: {
    type: 'aegis-command-and-control-view', sessionId: values.session.id, turn: 1, revision: 2,
    eligible: false, commanderAssigned: false, rerollsFinalized: false,
    reason: 'damage-unknown', targets: [],
  } });
  await expect(getAegisCommandAndControl()).resolves.toMatchObject({ reason: 'damage-unknown' });

  call.mockResolvedValueOnce({ data: {
    type: 'aegis-command-and-control-view', sessionId: values.session.id, turn: 1, revision: 2,
    eligible: true, commanderAssigned: true, rerollsFinalized: false,
    targets: [{ rosterIndex: 0, shipId: 'wolf-fighter-wing' }],
  } });
  await expect(getAegisCommandAndControl()).rejects.toThrow(/invalid AEGIS Command and Control view/i);

  call.mockResolvedValueOnce({ data: {
    type: 'aegis-command-and-control-view', sessionId: values.session.id, turn: 1, revision: 2,
    eligible: true, commanderAssigned: true, rerollsFinalized: true,
    targets: [{ rosterIndex: 0, shipId: 'wolf-fighter-wing', die: 4, target: 'dione' }],
  } });
  await expect(getAegisCommandAndControl()).rejects.toThrow(/invalid AEGIS Command and Control view/i);
});

it('accepts only a privacy-safe committed redirect bound to current Executive Officer authority', async () => {
  const values = fixture();
  const officer: Player = {
    ...values.player, replacementRoleId: null,
    assignedRoleId: 'executive-officer', activeConsoleRoleId: 'executive-officer',
  };
  useSessionStore.getState().setIdentity(values.session, officer);
  useSessionStore.getState().setConnection('live');
  useSessionStore.getState().setSessionSnapshotFreshness('server');
  acceptCallableSessionAuthority(values.session, officer.uid);
  const result = {
    status: 'committed', type: 'aegis-command-and-control-result', sessionId: values.session.id,
    requestId: 'redirect-1', turn: 1, revision: 3, rosterIndex: 1, shipId: 'wolf-cruiser',
    commanderCompletion: 'finished',
    view: {
      type: 'aegis-command-and-control-view', sessionId: values.session.id, turn: 1, revision: 3,
      eligible: false, commanderAssigned: true, rerollsFinalized: true,
      reason: 'already-used', targets: [], redirectedShipId: 'wolf-cruiser',
    },
  };
  const call = Object.assign(vi.fn().mockResolvedValue({ data: result }), { stream: vi.fn() });
  vi.mocked(httpsCallable).mockReturnValue(call as never);

  await expect(applyAegisCommandAndControl(1, 2, 1)).resolves.toMatchObject({
    revision: 3, rosterIndex: 1, shipId: 'wolf-cruiser', commanderCompletion: 'finished',
  });
  expect(call).toHaveBeenCalledWith(expect.objectContaining({
    sessionId: values.session.id, requestId: expect.any(String),
    expectedTurn: 1, expectedRevision: 2, rosterIndex: 1,
  }));

  call.mockResolvedValueOnce({ data: {
    ...result,
    targetingReceipt: { rolls: [{ die: 4, target: 'dione' }] },
  } });
  await expect(applyAegisCommandAndControl(1, 2, 1))
    .rejects.toThrow(/invalid AEGIS Command and Control receipt/i);
});

it('rejects a callable reply bound to another session', async () => {
  setFreshIdentity();
  const call = Object.assign(vi.fn().mockResolvedValue({ data: currentView('another-session') }), { stream: vi.fn() });
  vi.mocked(httpsCallable).mockReturnValue(call as never);

  await expect(getWolfCommanderTargeting()).rejects.toThrow(/another session/i);
});
