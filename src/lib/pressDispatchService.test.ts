import { beforeEach, expect, it, vi } from 'vitest';
import { useSessionStore } from '@/store/useSessionStore';

const mocks = vi.hoisted(() => ({ call: vi.fn(), callable: vi.fn() }));
vi.mock('firebase/functions', () => ({ httpsCallable: mocks.callable }));
vi.mock('./firebase', () => ({ functions: () => 'functions' }));

import { publishPressDispatch } from './pressDispatchService';

beforeEach(() => {
  mocks.call.mockReset();
  mocks.callable.mockReset();
  mocks.callable.mockReturnValue(mocks.call);
  useSessionStore.getState().reset();
  useSessionStore.getState().setIdentity({
    id: 's1', name: 'Fleet', joinCode: '1234', phase: 'active', ownerUid: 'u1',
    createdAt: '', updatedAt: '',
    pressDispatch: { text: 'SNN // Your Trusted Partner', revision: 2 },
  }, {
    uid: 'u1', sessionId: 's1', displayName: 'Reporter', role: 'player', seatId: null,
    activeConsoleRoleId: 'press-officer', joinedAt: '',
  });
  useSessionStore.getState().setConnection('live');
});

it('publishes against the current dispatch revision without optimistic shared state', async () => {
  await publishPressDispatch('Convoy arrival confirmed');
  expect(mocks.callable).toHaveBeenCalledWith('functions', 'publishPressDispatch');
  expect(mocks.call).toHaveBeenCalledWith({
    sessionId: 's1', text: 'Convoy arrival confirmed', expectedRevision: 2,
  });
  expect(useSessionStore.getState().session?.pressDispatch?.text)
    .toBe('SNN // Your Trusted Partner');
});

it('rejects offline dispatches', async () => {
  useSessionStore.getState().setConnection('offline');
  await expect(publishPressDispatch('News')).rejects.toThrow('Reconnect');
  expect(mocks.call).not.toHaveBeenCalled();
});
