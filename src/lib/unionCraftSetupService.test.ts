import { beforeEach, expect, it, vi } from 'vitest';
import { useSessionStore } from '@/store/useSessionStore';
const mocks = vi.hoisted(() => ({ call: vi.fn(), callable: vi.fn() }));
vi.mock('firebase/functions', () => ({ httpsCallable: mocks.callable }));
vi.mock('./firebase', () => ({ functions: () => 'functions' }));
import { setUnionCraftStartingHost } from './unionCraftSetupService';

beforeEach(() => {
  mocks.call.mockReset(); mocks.callable.mockReset().mockReturnValue(mocks.call);
  useSessionStore.getState().reset();
  useSessionStore.getState().setIdentity({ id: 's1', name: 'Fleet', joinCode: '1234', phase: 'casting', currentTurn: 0,
    ownerUid: 'gm', createdAt: '', updatedAt: '', setupRevision: 4, setupConfirmed: true,
    activeRoleIds: ['joint-engineering-quellon-refinery'], activeVesselIds: ['quellon', 'refinery-124'],
    shuttleDockings: [],
  }, { uid: 'gm', sessionId: 's1', displayName: 'GM', role: 'gm', seatId: null, joinedAt: '' });
  useSessionStore.getState().setGmInstance({ id: 'bridge', sessionId: 's1', uid: 'gm', label: 'Bridge', joinedAt: '', lastSeenAt: '' });
  useSessionStore.getState().setConnection('live'); useSessionStore.getState().setSessionSnapshotFreshness('server');
  mocks.call.mockImplementation(async (payload: Record<string, unknown>) => ({ data: {
    status: 'committed', sessionId: payload.sessionId, requestId: payload.requestId, craftId: payload.craftId,
    hostShipId: payload.hostShipId, setupRevision: (payload.expectedSetupRevision as number) + 1,
  } }));
});
it('sends the current setup and GM instance with a durable request identity without patching local docking', async () => {
  const reply = await setUnionCraftStartingHost('wobbly', 'quellon', { requestId: 'host1', expectedSetupRevision: 4 });
  expect(reply).toMatchObject({ setupRevision: 5, hostShipId: 'quellon' });
  expect(mocks.callable).toHaveBeenCalledWith('functions', 'setUnionCraftStartingHost');
  expect(mocks.call).toHaveBeenCalledWith({ sessionId: 's1', instanceId: 'bridge', requestId: 'host1', expectedSetupRevision: 4, craftId: 'wobbly', hostShipId: 'quellon' });
  expect(useSessionStore.getState().session?.shuttleDockings).toEqual([]);
  await setUnionCraftStartingHost('wobbly', 'quellon', { requestId: 'host1', expectedSetupRevision: 4 });
  expect(mocks.call.mock.calls[1]?.[0]).toEqual(mocks.call.mock.calls[0]?.[0]);
});
it('denies cache, wrong role, inactive setup and unpaired hosts before calling', async () => {
  useSessionStore.getState().setSessionSnapshotFreshness('cache');
  await expect(setUnionCraftStartingHost('wobbly', 'quellon')).rejects.toThrow(/live session/i);
  useSessionStore.getState().setSessionSnapshotFreshness('server');
  await expect(setUnionCraftStartingHost('wobbly', 'aegis')).rejects.toThrow(/paired/i);
  await expect(setUnionCraftStartingHost('ally', 'shepherd')).rejects.toThrow(/Union station/i);
  useSessionStore.setState({ me: { ...useSessionStore.getState().me!, role: 'player' } });
  await expect(setUnionCraftStartingHost('wobbly', 'quellon')).rejects.toThrow(/facilitator/i);
  expect(mocks.callable).not.toHaveBeenCalled();
});
it('rejects foreign or malformed receipts and a late response after the GM instance changes', async () => {
  mocks.call.mockResolvedValueOnce({ data: { status: 'committed', sessionId: 'foreign', requestId: 'host1', craftId: 'wobbly', hostShipId: 'quellon', setupRevision: 5 } });
  await expect(setUnionCraftStartingHost('wobbly', 'quellon', { requestId: 'host1', expectedSetupRevision: 4 })).rejects.toThrow(/receipt/i);
  mocks.call.mockImplementationOnce(async () => {
    useSessionStore.setState({ gmInstance: null });
    return { data: { status: 'committed', sessionId: 's1', requestId: 'host1', craftId: 'wobbly', hostShipId: 'quellon', setupRevision: 5 } };
  });
  await expect(setUnionCraftStartingHost('wobbly', 'quellon', { requestId: 'host1', expectedSetupRevision: 4 })).rejects.toThrow(/changed/i);
  expect(useSessionStore.getState().session?.shuttleDockings).toEqual([]);
});
