import { beforeEach, expect, it, vi } from 'vitest';
import { useSessionStore } from '@/store/useSessionStore';
const mocks = vi.hoisted(() => ({ call: vi.fn(), callable: vi.fn() }));
vi.mock('firebase/functions', () => ({ httpsCallable: mocks.callable }));
vi.mock('./firebase', () => ({ functions: () => 'functions' }));
import { setFleetRedAlert } from './fleetAlertService';
beforeEach(() => {
  mocks.call.mockReset(); mocks.callable.mockReset(); mocks.callable.mockReturnValue(mocks.call);
  useSessionStore.getState().reset();
  useSessionStore.getState().setIdentity({ id: 's1', name: 'Fleet', joinCode: '1234', phase: 'active', ownerUid: 'u1', createdAt: '', updatedAt: '', fleetRedAlert: { active: true, revision: 3 } },
    { uid: 'u1', sessionId: 's1', displayName: 'Admiral', role: 'player', seatId: null, joinedAt: '' });
  useSessionStore.getState().setConnection('live');
});
it('sends the current revision to the callable without optimistically changing shared state', async () => {
  await setFleetRedAlert(false);
  expect(mocks.callable).toHaveBeenCalledWith('functions', 'setFleetRedAlert');
  expect(mocks.call).toHaveBeenCalledWith({ sessionId: 's1', active: false, expectedRevision: 3 });
  expect(useSessionStore.getState().session?.fleetRedAlert?.active).toBe(true);
});
it('rejects offline commands without queueing a delayed warning', async () => {
  useSessionStore.getState().setConnection('offline');
  await expect(setFleetRedAlert(true)).rejects.toThrow('Reconnect');
  expect(mocks.call).not.toHaveBeenCalled();
});
it('includes the GM instance for observer write mode', async () => {
  useSessionStore.setState({ gmInstance: { id: 'gm1', sessionId: 's1', uid: 'u1', name: 'GM', deviceLabel: '', claimedAt: '' } });
  await setFleetRedAlert(false);
  expect(mocks.call).toHaveBeenCalledWith({ sessionId: 's1', active: false, expectedRevision: 3, instanceId: 'gm1' });
});

it('transmits custom alert copy with the authoritative revision', async () => {
  await setFleetRedAlert(true, 'hold position');
  expect(mocks.call).toHaveBeenCalledWith({ sessionId: 's1', active: true, expectedRevision: 3, text: 'HOLD POSITION' });
});
