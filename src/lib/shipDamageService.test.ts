import { beforeEach, expect, it, vi } from 'vitest';
import { useSessionStore } from '@/store/useSessionStore';
const mocks = vi.hoisted(() => ({ call: vi.fn(), callable: vi.fn() }));
vi.mock('firebase/functions', () => ({ httpsCallable: mocks.callable }));
vi.mock('./firebase', () => ({ functions: () => 'functions' }));
import { assignShipDamage } from './shipDamageService';
beforeEach(() => {
  mocks.call.mockReset(); mocks.callable.mockReset(); mocks.callable.mockReturnValue(mocks.call);
  useSessionStore.getState().reset();
  useSessionStore.setState({ connection: 'live',
    sessionSnapshotFreshness: 'server',
    session: { id: 's1', name: 'Fleet', joinCode: '1234', phase: 'active', ownerUid: 'u1', createdAt: '', updatedAt: '' },
    me: { uid: 'u1', sessionId: 's1', displayName: 'GM', role: 'gm', seatId: null, joinedAt: '' },
    gmInstance: { id: 'gm1', uid: 'u1', sessionId: 's1', name: 'GM', deviceLabel: '', claimedAt: '' },
  });
});
it('requests one authoritative draw with GM identity', async () => {
  mocks.call.mockResolvedValue({ data: {
    destroyed: false,
    card: { card: '10♥', systemId: 'reactor', systemName: 'Reactor' },
    recycled: false,
  } });
  await expect(assignShipDamage('aegis')).resolves.toEqual({
    destroyed: false,
    card: { card: '10♥', systemId: 'reactor', systemName: 'Reactor' },
    recycled: false,
  });
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
it('rejects damage commands authorized only by a cached session', async () => {
  useSessionStore.getState().setSessionSnapshotFreshness('cache');
  await expect(assignShipDamage('aegis')).rejects.toThrow(/live session state/i);
  expect(mocks.callable).not.toHaveBeenCalled();
});
it('requests GM repair through its callable', async () => {
  const { repairAllShipDamage } = await import('./shipDamageService');
  mocks.call.mockResolvedValue({ data: { repaired: true } });
  await repairAllShipDamage('aegis');
  expect(mocks.callable).toHaveBeenCalledWith('functions', 'repairAllShipDamage');
  expect(mocks.call).toHaveBeenCalledWith({ sessionId: 's1', shipId: 'aegis', instanceId: 'gm1' });
});
