import { beforeEach, expect, it, vi } from 'vitest';
import { useSessionStore } from '@/store/useSessionStore';

vi.mock('firebase/functions', () => ({ httpsCallable: vi.fn() }));
vi.mock('./firebase', () => ({ functions: vi.fn(() => ({ kind: 'functions' })) }));

const { httpsCallable } = await import('firebase/functions');
const { listMyScoutReports, readPrivateScoutResult, resolvePendingScoutRequest, listGmScoutResolutionLog } =
  await import('./scoutResultService');

const result = {
  type: 'private-scout-result', sessionId: 's1', requestId: 'r1', requesterUid: 'u1',
  sourceId: 'endeavour', cycle: 2, targetCoordinate: '0408',
  systemFact: { coordinate: '0408', code: 'O', title: 'Deep Nebula' },
};

beforeEach(() => {
  vi.mocked(httpsCallable).mockReset();
  useSessionStore.getState().reset();
  useSessionStore.getState().setIdentity({
    id: 's1', name: 'Table', joinCode: '4821', phase: 'active', currentTurn: 2,
    ownerUid: 'gm1', createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  }, {
    uid: 'u1', sessionId: 's1', displayName: 'Scientist', role: 'player',
    seatId: 'shepherd-scientist', assignedRoleId: 'shepherd-scientist',
    joinedAt: '2026-01-01T00:00:00.000Z',
  });
  useSessionStore.getState().setConnection('live');
  useSessionStore.getState().setSessionSnapshotFreshness('server');
});

it('lists only requester-owned report identities and rejects facts in the index reply', async () => {
  const call = vi.fn().mockResolvedValue({ data: [{
    requestId: 'r1', cycle: 2, entitlementId: 'endeavour',
    targetCoordinate: '0408', status: 'resolved', noteId: 'a'.repeat(64),
  }] });
  vi.mocked(httpsCallable).mockReturnValue(call as never);
  await expect(listMyScoutReports()).resolves.toMatchObject([{ requestId: 'r1', status: 'resolved' }]);
  expect(call).toHaveBeenCalledWith({ sessionId: 's1' });
  call.mockResolvedValue({ data: [{
    requestId: 'r1', cycle: 2, entitlementId: 'endeavour',
    targetCoordinate: '0408', status: 'resolved', noteId: 'a'.repeat(64),
    chartId: 'A',
  }] });
  await expect(listMyScoutReports()).rejects.toThrow(/invalid/i);
});

it('reads exactly one private result and discards a stale reply after account switch', async () => {
  let finish!: (value: unknown) => void;
  const call = vi.fn().mockReturnValue(new Promise((resolve) => { finish = resolve; }));
  vi.mocked(httpsCallable).mockReturnValue(call as never);
  const pending = readPrivateScoutResult('r1');
  useSessionStore.getState().setMe({ ...useSessionStore.getState().me!, uid: 'other' });
  finish({ data: result });
  await expect(pending).rejects.toThrow(/changed|refresh|reconnect/i);
});

it('rejects pending re-role report reads before dispatch and after a delayed private reply', async () => {
  useSessionStore.getState().setMe({
    ...useSessionStore.getState().me!, replacementStatus: 'awaiting-re-role',
    replacementRoleId: 'endeavour', activeConsoleRoleId: 'shepherd-scientist',
  });
  await expect(listMyScoutReports()).rejects.toThrow(/scouting station|reconnect/i);
  expect(httpsCallable).not.toHaveBeenCalled();

  useSessionStore.getState().setMe({
    ...useSessionStore.getState().me!, replacementStatus: null,
  });
  let finish!: (value: unknown) => void;
  const call = vi.fn().mockReturnValue(new Promise((resolve) => { finish = resolve; }));
  vi.mocked(httpsCallable).mockReturnValue(call as never);
  const pending = readPrivateScoutResult('r1');
  useSessionStore.getState().setMe({
    ...useSessionStore.getState().me!, replacementStatus: 'awaiting-re-role',
  });
  finish({ data: result });
  await expect(pending).rejects.toThrow(/changed|refresh|reconnect/i);
});

it('sends GM reveal with the current instance and rejects chart-bearing replies', async () => {
  useSessionStore.getState().setMe({ ...useSessionStore.getState().me!, uid: 'gm1', role: 'gm' });
  useSessionStore.getState().setGmInstance({
    id: 'browser-1', sessionId: 's1', uid: 'gm1', name: 'GM', deviceLabel: 'Laptop',
    claimedAt: { toMillis: () => Date.now() } as never,
  });
  const call = vi.fn().mockResolvedValue({ data: { status: 'resolved', result: { ...result,
    requesterUid: 'u1', organiserChart: { '0408': 'O' },
  } } });
  vi.mocked(httpsCallable).mockReturnValue(call as never);
  await expect(resolvePendingScoutRequest('r1')).rejects.toThrow(/invalid/i);
  expect(call).toHaveBeenCalledWith({ sessionId: 's1', requestId: 'r1', instanceId: 'browser-1' });
});


it('parses only the bounded GM scout log and rejects identity or chart fields and stale leases', async () => {
  useSessionStore.getState().setMe({ ...useSessionStore.getState().me!, uid: 'gm1', role: 'gm' });
  useSessionStore.getState().setGmInstance({ id: 'browser-1', sessionId: 's1', uid: 'gm1' } as never);
  const entry = { requestId: 'r1', cycle: 2, sourceId: 'comms-officer',
    originShipId: 'aegis', receivingShipId: 'aegis', targetCoordinate: '0408',
    systemFact: result.systemFact, recordedAt: '2026-09-27T21:40:00.000Z', resolutionMode: 'automatic' };
  const call = vi.fn().mockResolvedValue({ data: [entry] });
  vi.mocked(httpsCallable).mockReturnValue(call as never);
  await expect(listGmScoutResolutionLog()).resolves.toEqual([entry]);
  expect(call).toHaveBeenCalledWith({ sessionId: 's1', instanceId: 'browser-1' });
  for (const value of [{ ...entry, requesterUid: 'u1' }, { ...entry, chartId: 'A' },
    { ...entry, recordedAt: 'invalid' }, { ...entry, resolutionMode: 'invented' }]) {
    call.mockResolvedValue({ data: [value] });
    await expect(listGmScoutResolutionLog()).rejects.toThrow(/invalid/i);
  }
  let finish!: (value: unknown) => void;
  call.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  const delayed = listGmScoutResolutionLog();
  useSessionStore.getState().setGmInstance({ id: 'browser-2', sessionId: 's1', uid: 'gm1' } as never);
  finish({ data: [entry] });
  await expect(delayed).rejects.toThrow(/changed|refresh|reconnect/i);
});
