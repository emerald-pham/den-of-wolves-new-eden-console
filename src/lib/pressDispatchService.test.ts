import { beforeEach, expect, it, vi } from 'vitest';
import { useSessionStore } from '@/store/useSessionStore';

const mocks = vi.hoisted(() => ({ call: vi.fn(), callable: vi.fn() }));
vi.mock('firebase/functions', () => ({ httpsCallable: mocks.callable }));
vi.mock('./firebase', () => ({ functions: () => 'functions' }));

import { dismissPressDispatch, publishPressDispatch } from './pressDispatchService';

beforeEach(() => {
  mocks.call.mockReset();
  mocks.callable.mockReset();
  mocks.callable.mockReturnValue(mocks.call);
  useSessionStore.getState().reset();
  useSessionStore.getState().setIdentity({
    id: 's1', name: 'Fleet', joinCode: '1234', phase: 'active', ownerUid: 'u1',
    createdAt: '', updatedAt: '',
    pressDispatch: {
      dispatches: [{ id: 'dispatch-1', text: 'SNN // Your Trusted Partner' }],
      revision: 2,
    },
  }, {
    uid: 'u1', sessionId: 's1', displayName: 'Reporter', role: 'player', seatId: null,
    activeConsoleRoleId: 'press-officer', joinedAt: '',
  });
  useSessionStore.getState().setConnection('live');
  useSessionStore.getState().setSessionSnapshotFreshness('server');
});

it('publishes against the current dispatch revision without optimistic shared state', async () => {
  await publishPressDispatch('Convoy arrival confirmed');
  expect(mocks.callable).toHaveBeenCalledWith('functions', 'publishPressDispatch');
  expect(mocks.call).toHaveBeenCalledWith({
    sessionId: 's1', text: 'Convoy arrival confirmed', expectedRevision: 2,
  });
  expect(useSessionStore.getState().session?.pressDispatch?.dispatches)
    .toEqual([{ id: 'dispatch-1', text: 'SNN // Your Trusted Partner' }]);
});

it('dismisses one active dispatch against the current collection revision', async () => {
  await dismissPressDispatch('dispatch-1');
  expect(mocks.callable).toHaveBeenCalledWith('functions', 'dismissPressDispatch');
  expect(mocks.call).toHaveBeenCalledWith({
    sessionId: 's1', dispatchId: 'dispatch-1', expectedRevision: 2,
  });
  expect(useSessionStore.getState().session?.pressDispatch?.dispatches)
    .toEqual([{ id: 'dispatch-1', text: 'SNN // Your Trusted Partner' }]);
});

it('rejects offline dispatches', async () => {
  useSessionStore.getState().setConnection('offline');
  await expect(publishPressDispatch('News')).rejects.toThrow('Reconnect');
  expect(mocks.call).not.toHaveBeenCalled();
});

it('rejects offline dismissals', async () => {
  useSessionStore.getState().setConnection('offline');
  await expect(dismissPressDispatch('dispatch-1')).rejects.toThrow('Reconnect');
  expect(mocks.call).not.toHaveBeenCalled();
});

it.each([
  ['publish', () => publishPressDispatch('News')],
  ['dismiss', () => dismissPressDispatch('dispatch-1')],
] as const)('rejects a cache-backed %s without contacting the callable', async (_name, invoke) => {
  useSessionStore.getState().setSessionSnapshotFreshness('cache');
  await expect(invoke()).rejects.toThrow(/live session state/i);
  expect(mocks.callable).not.toHaveBeenCalled();
});
