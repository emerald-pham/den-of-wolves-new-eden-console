import { beforeEach, expect, it, vi } from 'vitest';
import { useSessionStore } from '@/store/useSessionStore';

const mocks = vi.hoisted(() => ({ call: vi.fn(), callable: vi.fn() }));
vi.mock('firebase/functions', () => ({ httpsCallable: mocks.callable }));
vi.mock('./firebase', () => ({ functions: () => 'functions' }));

import { commitWolfAttackAftermath } from './wolfAttackAftermathService';

beforeEach(() => {
  mocks.call.mockReset(); mocks.callable.mockReset(); mocks.callable.mockReturnValue(mocks.call);
  useSessionStore.getState().reset();
  useSessionStore.getState().setIdentity({
    id: 's1', name: 'Fleet', joinCode: '1234', phase: 'active', ownerUid: 'owner', createdAt: '', updatedAt: '',
  }, {
    uid: 'doctor-1', sessionId: 's1', displayName: 'Doctor', role: 'player', seatId: null,
    replacementRoleId: 'doctor', activeConsoleRoleId: null, joinedAt: '',
  });
  useSessionStore.getState().setConnection('live');
  useSessionStore.getState().setSessionSnapshotFreshness('server');
});

it('routes an exact Doctor selection through the authenticated aftermath callable', async () => {
  mocks.call.mockResolvedValue({ data: { status: 'committed', sessionId: 's1', attackId: 'attack-7',
    requestId: 'doctor-7', action: 'doctor', mitigated: [] } });
  await expect(commitWolfAttackAftermath('attack-7', { action: 'doctor', selectedShipIds: ['aegis'] }, 'doctor-7'))
    .resolves.toMatchObject({ status: 'committed', attackId: 'attack-7' });
  expect(mocks.callable).toHaveBeenCalledWith('functions', 'resolveWolfAttackAftermath');
  expect(mocks.call).toHaveBeenCalledWith({ sessionId: 's1', attackId: 'attack-7', requestId: 'doctor-7',
    action: 'doctor', selectedShipIds: ['aegis'] });
});

it('requires a fresh authenticated session before sending an aftermath mutation', async () => {
  useSessionStore.getState().setConnection('offline');
  await expect(commitWolfAttackAftermath('attack-7', { action: 'warrior-salvage' }, 'salvage-7'))
    .rejects.toThrow(/reconnect/i);
  expect(mocks.callable).not.toHaveBeenCalled();
});
