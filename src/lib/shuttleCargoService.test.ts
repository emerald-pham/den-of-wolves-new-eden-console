import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useSessionStore } from '@/store/useSessionStore';

const mocks = vi.hoisted(() => ({ call: vi.fn(), callable: vi.fn() }));
vi.mock('firebase/functions', () => ({ httpsCallable: mocks.callable }));
vi.mock('./firebase', () => ({ functions: () => 'functions' }));

import {
  replayShuttleCargoTransfer,
  transferShuttleCargo,
} from './shuttleCargoService';
import type { ShuttleCargoTransferAttempt } from './shuttleCargoService';

interface UncertainCargoAttempt extends Error {
  readonly attempt: ShuttleCargoTransferAttempt;
}

function isUncertainCargoAttempt(cause: unknown): cause is UncertainCargoAttempt {
  return cause instanceof Error && cause.name === 'ShuttleCargoTransferUncertainError' &&
    'attempt' in cause;
}

const committedReply = {
  status: 'committed', sessionId: 's1', requestId: 'cargo-request-1', shuttleId: 'hummingbird',
  hostShipId: 'quellon', resourceId: 'food', direction: 'load', amount: 2,
  shipAmount: 8, shuttleAmount: 3,
};

const staleReply = (overrides: Record<string, unknown> = {}) => ({
  status: 'stale', sessionId: 's1', requestId: 'cargo-request-1', shuttleId: 'hummingbird',
  hostShipId: 'quellon', resourceId: 'food', direction: 'load', amount: 2,
  expectedControlRevision: 3, currentControlRevision: 4,
  ...overrides,
});

beforeEach(() => {
  mocks.call.mockReset(); mocks.callable.mockReset(); mocks.callable.mockReturnValue(mocks.call);
  useSessionStore.getState().reset();
  useSessionStore.getState().setIdentity({
    id: 's1', name: 'Fleet', joinCode: '1234', phase: 'active', ownerUid: 'owner', createdAt: '', updatedAt: '',
  }, {
    uid: 'holder', sessionId: 's1', displayName: 'Holder', role: 'player', seatId: null,
    assignedRoleId: 'quellon-explorer', activeConsoleRoleId: 'quellon-explorer',
    fleetGroupId: 'fleet-1', joinedAt: '',
  });
  useSessionStore.getState().setConnection('live');
  useSessionStore.getState().setSessionSnapshotFreshness('server');
  useSessionStore.getState().setSession({
    ...useSessionStore.getState().session!,
    activeRoleIds: ['quellon-explorer'], activeVesselIds: ['quellon'],
    shuttleDockings: [{ shuttleId: 'hummingbird', shipId: 'quellon', dockedAt: 'SESSION START' }],
    shuttleControl: { hummingbird: {
      shuttleId: 'hummingbird', ownerRoleId: 'quellon-explorer', ownerUid: 'holder',
      holderUid: 'holder', revision: 3,
    } },
  } as never);
  vi.stubGlobal('crypto', { randomUUID: vi.fn(() => 'cargo-request-1') });
});

afterEach(() => vi.unstubAllGlobals());

it('sends the exact cargo direction, amount, and custody revision', async () => {
  mocks.call.mockResolvedValue({ data: committedReply });
  await transferShuttleCargo('hummingbird', 'food', 'load', 2, 3);
  expect(mocks.callable).toHaveBeenCalledWith('functions', 'transferShuttleCargoCommand');
  expect(mocks.call).toHaveBeenCalledWith({
    sessionId: 's1', requestId: expect.any(String), shuttleId: 'hummingbird', resourceId: 'food',
    direction: 'load', amount: 2, expectedControlRevision: 3,
  });
});

it('accepts only a target and request bound stale revision for the current holder', async () => {
  mocks.call.mockResolvedValue({ data: staleReply() });
  await expect(transferShuttleCargo('hummingbird', 'food', 'load', 2, 3)).resolves.toEqual({
    status: 'stale', hostShipId: 'quellon', currentControlRevision: 4,
  });

  for (const mismatch of [
    { sessionId: 's2' }, { requestId: 'other-request' }, { shuttleId: 'macaw' },
    { hostShipId: 'capybara' }, { resourceId: 'water' }, { direction: 'unload' },
    { amount: 1 }, { expectedControlRevision: 2 }, { currentControlRevision: 3 },
    { actorUid: 'holder' }, { holderUid: 'holder' }, { groupRoster: ['holder'] },
  ]) {
    mocks.call.mockResolvedValue({ data: staleReply(mismatch) });
    await expect(transferShuttleCargo('hummingbird', 'food', 'load', 2, 3))
      .rejects.toThrow(/malformed/i);
  }
});

it('uses a fresh request id and the newest observed control revision for an explicit retry', async () => {
  vi.stubGlobal('crypto', {
    randomUUID: vi.fn().mockReturnValueOnce('cargo-request-1').mockReturnValueOnce('cargo-request-2'),
  });
  mocks.call.mockResolvedValueOnce({ data: staleReply() });
  mocks.call.mockResolvedValueOnce({
    data: { ...committedReply, requestId: 'cargo-request-2' },
  });

  await expect(transferShuttleCargo('hummingbird', 'food', 'load', 2, 3))
    .resolves.toMatchObject({ status: 'stale', currentControlRevision: 4 });
  useSessionStore.getState().setSession({
    ...useSessionStore.getState().session!,
    shuttleControl: { hummingbird: {
      shuttleId: 'hummingbird', ownerRoleId: 'quellon-explorer', ownerUid: 'holder',
      holderUid: 'holder', revision: 4,
    } },
  } as never);
  await expect(transferShuttleCargo('hummingbird', 'food', 'load', 2, 4))
    .resolves.toEqual({ status: 'committed' });
  expect(mocks.call.mock.calls.map(([payload]) => payload)).toEqual([
    expect.objectContaining({ requestId: 'cargo-request-1', expectedControlRevision: 3 }),
    expect.objectContaining({ requestId: 'cargo-request-2', expectedControlRevision: 4 }),
  ]);
});

it('rejects stale recovery when the actor loses holder or role authority while pending', async () => {
  let resolve!: (value: { data: Record<string, unknown> }) => void;
  mocks.call.mockReturnValue(new Promise((finish) => { resolve = finish; }));
  const pending = transferShuttleCargo('hummingbird', 'food', 'load', 2, 3);
  const store = useSessionStore.getState();
  store.setSession({
    ...store.session!,
    shuttleControl: { hummingbird: {
      shuttleId: 'hummingbird', ownerRoleId: 'quellon-explorer', ownerUid: 'holder',
      holderUid: 'someone-else', revision: 4,
    } },
  } as never);
  resolve({ data: staleReply() });
  await expect(pending).rejects.toThrow(/authority changed while the request was pending/i);

  useSessionStore.getState().setSession({
    ...useSessionStore.getState().session!,
    shuttleControl: { hummingbird: {
      shuttleId: 'hummingbird', ownerRoleId: 'quellon-explorer', ownerUid: 'holder',
      holderUid: 'holder', revision: 3,
    } },
  } as never);
  let resolveRole!: (value: { data: Record<string, unknown> }) => void;
  mocks.call.mockReturnValue(new Promise((finish) => { resolveRole = finish; }));
  const rolePending = transferShuttleCargo('hummingbird', 'food', 'load', 2, 3);
  useSessionStore.getState().setMe({
    ...useSessionStore.getState().me!, activeConsoleRoleId: 'another-role',
  });
  resolveRole({ data: staleReply() });
  await expect(rolePending).rejects.toThrow(/authority changed while the request was pending/i);

  useSessionStore.getState().setMe({
    ...useSessionStore.getState().me!, activeConsoleRoleId: 'quellon-explorer',
  });
  let resolveActor!: (value: { data: Record<string, unknown> }) => void;
  mocks.call.mockReturnValue(new Promise((finish) => { resolveActor = finish; }));
  const actorPending = transferShuttleCargo('hummingbird', 'food', 'load', 2, 3);
  useSessionStore.getState().setMe({
    ...useSessionStore.getState().me!, uid: 'another-holder',
  });
  resolveActor({ data: staleReply() });
  await expect(actorPending).rejects.toThrow(/authority changed while the request was pending/i);
});

it('rejects stale recovery when the actor changes fleet group while pending', async () => {
  let resolve!: (value: { data: Record<string, unknown> }) => void;
  mocks.call.mockReturnValue(new Promise((finish) => { resolve = finish; }));
  const pending = transferShuttleCargo('hummingbird', 'food', 'load', 2, 3);
  useSessionStore.getState().setMe({
    ...useSessionStore.getState().me!, fleetGroupId: 'fleet-2',
  });
  resolve({ data: staleReply() });
  await expect(pending).rejects.toThrow(/authority changed while the request was pending/i);
});

it('waits for live control authority before dispatch and rejects malformed replies', async () => {
  useSessionStore.getState().setSession({
    ...useSessionStore.getState().session!,
    shuttleControl: { hummingbird: {
      shuttleId: 'hummingbird', ownerRoleId: 'quellon-explorer', ownerUid: 'holder',
      holderUid: 'someone-else', revision: 3,
    } },
  } as never);
  await expect(transferShuttleCargo('hummingbird', 'food', 'load', 2, 3))
    .rejects.toThrow(/current shuttle holder/i);
  expect(mocks.callable).not.toHaveBeenCalled();

  useSessionStore.getState().setSession({
    ...useSessionStore.getState().session!,
    shuttleControl: { hummingbird: {
      shuttleId: 'hummingbird', ownerRoleId: 'quellon-explorer', ownerUid: 'holder',
      holderUid: 'holder', revision: 3,
    } },
  } as never);
  mocks.call.mockResolvedValue({ data: undefined });
  await expect(transferShuttleCargo('hummingbird', 'food', 'load', 2, 3))
    .rejects.toThrow(/malformed/i);
});

it('rejects cache-backed authority before contacting the callable', async () => {
  useSessionStore.getState().setSessionSnapshotFreshness('cache');
  await expect(transferShuttleCargo('hummingbird', 'food', 'load', 1, 3))
    .rejects.toThrow(/live session state/i);
  expect(mocks.callable).not.toHaveBeenCalled();
});

it('replays the exact cargo receipt after an uncertain transport result without creating a duplicate request', async () => {
  mocks.call.mockRejectedValueOnce(Object.assign(new Error('The callable is unavailable.'), {
    code: 'functions/unavailable',
  }));
  let uncertain: UncertainCargoAttempt | undefined;
  try {
    await transferShuttleCargo('hummingbird', 'food', 'load', 2, 3);
  } catch (cause) {
    if (isUncertainCargoAttempt(cause)) uncertain = cause;
    else throw cause;
  }
  expect(uncertain).toBeDefined();
  const original = mocks.call.mock.calls[0]![0];
  expect(original).toMatchObject({
    sessionId: 's1', requestId: 'cargo-request-1', shuttleId: 'hummingbird',
    resourceId: 'food', direction: 'load', amount: 2, expectedControlRevision: 3,
  });
  expect(uncertain?.attempt.authority).toMatchObject({
    sessionId: 's1', uid: 'holder', role: 'player', fleetGroupId: 'fleet-1',
    shuttleId: 'hummingbird', hostShipId: 'quellon', expectedControlRevision: 3,
  });

  mocks.call.mockResolvedValueOnce({
    data: { ...committedReply, status: 'replayed' },
  });
  await expect(replayShuttleCargoTransfer(uncertain!.attempt)).resolves.toEqual({ status: 'replayed' });
  expect(mocks.callable).toHaveBeenCalledTimes(2);
  expect(mocks.call.mock.calls[1]![0]).toEqual(original);
  expect(vi.mocked(window.crypto.randomUUID)).toHaveBeenCalledTimes(1);
});

it.each([
  ['actor', () => useSessionStore.getState().setMe({
    ...useSessionStore.getState().me!, uid: 'another-holder',
  })],
  ['session', () => useSessionStore.getState().setSession({
    ...useSessionStore.getState().session!, id: 's2',
  })],
])('rejects exact cargo replay when the captured %s binding changes', async (_label, changeBinding) => {
  mocks.call.mockRejectedValueOnce(Object.assign(new Error('The callable timed out.'), {
    code: 'functions/deadline-exceeded',
  }));
  let uncertain: UncertainCargoAttempt | undefined;
  try {
    await transferShuttleCargo('hummingbird', 'food', 'load', 2, 3);
  } catch (cause) {
    if (isUncertainCargoAttempt(cause)) uncertain = cause;
    else throw cause;
  }
  expect(uncertain).toBeDefined();
  changeBinding();

  await expect(replayShuttleCargoTransfer(uncertain!.attempt))
    .rejects.toThrow(/current shuttle holder|session authority/i);
  expect(mocks.callable).toHaveBeenCalledTimes(1);
});

it('classifies a server-declared stale rejection separately from an uncertain transport outcome', async () => {
  mocks.call.mockRejectedValueOnce(Object.assign(new Error('The control revision changed.'), {
    code: 'functions/failed-precondition',
    details: { commandError: 'stale-revision' },
  }));

  await expect(transferShuttleCargo('hummingbird', 'food', 'load', 2, 3))
    .rejects.toMatchObject({
      name: 'ShuttleCargoTransferRejectedError',
      message: /live session changed/i,
    });
});
