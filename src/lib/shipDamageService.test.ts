import { beforeEach, expect, it, vi } from 'vitest';
import { useSessionStore } from '@/store/useSessionStore';
const mocks = vi.hoisted(() => ({ call: vi.fn(), callable: vi.fn() }));
vi.mock('firebase/functions', () => ({ httpsCallable: mocks.callable }));
vi.mock('./firebase', () => ({ functions: () => 'functions' }));
import { assignShipDamage } from './shipDamageService';
beforeEach(() => {
  mocks.call.mockReset(); mocks.callable.mockReturnValue(mocks.call);
  useSessionStore.getState().reset();
  useSessionStore.setState({ connection: 'live',
    session: { id: 's1', name: 'Fleet', joinCode: '1234', phase: 'active', ownerUid: 'u1', createdAt: '', updatedAt: '' },
    me: { uid: 'u1', sessionId: 's1', displayName: 'GM', role: 'gm', seatId: null, joinedAt: '' },
    gmInstance: { id: 'gm1', uid: 'u1', sessionId: 's1', name: 'GM', deviceLabel: '', claimedAt: '' },
  });
});
it('requests one authoritative draw with GM identity', async () => {
  await assignShipDamage('aegis');
  expect(mocks.callable).toHaveBeenCalledWith('functions', 'addShipDamage');
  expect(mocks.call).toHaveBeenCalledWith({ sessionId: 's1', shipId: 'aegis', instanceId: 'gm1' });
  expect(useSessionStore.getState().session?.shipDamage).toBeUndefined();
});
it('rejects offline or non-GM assignments', async () => {
  useSessionStore.setState({ connection: 'offline' });
  await expect(assignShipDamage('aegis')).rejects.toThrow();
  useSessionStore.setState({ connection: 'live', gmInstance: null });
  await expect(assignShipDamage('aegis')).rejects.toThrow();
  expect(mocks.call).not.toHaveBeenCalled();
});
it('requests GM repair through its callable', async () => {
  const { repairAllShipDamage } = await import('./shipDamageService');
  await repairAllShipDamage('aegis');
  expect(mocks.callable).toHaveBeenCalledWith('functions', 'repairAllShipDamage');
  expect(mocks.call).toHaveBeenCalledWith({ sessionId: 's1', shipId: 'aegis', instanceId: 'gm1' });
});
