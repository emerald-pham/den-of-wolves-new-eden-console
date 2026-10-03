import { beforeEach, expect, it, vi } from 'vitest';
import { httpsCallable } from 'firebase/functions';
import { getAegisEnrichedWarheadChoice, commitAegisEnrichedWarheadChoice } from './sessionService';
import { useSessionStore } from '@/store/useSessionStore';
vi.mock('firebase/auth', () => ({ signInAnonymously: vi.fn().mockResolvedValue(undefined) }));
vi.mock('firebase/functions', () => ({ httpsCallable: vi.fn() }));
vi.mock('./firebase', () => ({ auth: () => ({ currentUser: { uid: 'xo1' } }), functions: () => ({}) }));
const view = { type: 'aegis-enriched-warhead-view', sessionId: 's1', attackId: 'a1', turn: 2, revision: 5,
  choiceStatus: 'pending', eligible: true, oreCost: 5 };
beforeEach(() => {
  vi.mocked(httpsCallable).mockReset();
  useSessionStore.getState().reset();
  useSessionStore.getState().setIdentity(
    { id: 's1', name: 'Fleet', joinCode: '4821', phase: 'active', ownerUid: 'gm', createdAt: '', updatedAt: '' },
    { uid: 'xo1', sessionId: 's1', displayName: 'EO', role: 'player', seatId: null,
      assignedRoleId: 'executive-officer', activeConsoleRoleId: 'executive-officer', fleetGroupId: 'fleet-1', joinedAt: '' });
  useSessionStore.getState().setConnection('live');
  useSessionStore.getState().setSessionSnapshotFreshness('server');
});
it('reads only the EO safe status and rejects private fields in a response', async () => {
  const call = vi.fn().mockResolvedValue({ data: view });
  vi.mocked(httpsCallable).mockReturnValue(call);
  expect(await getAegisEnrichedWarheadChoice()).toEqual(view);
  expect(call).toHaveBeenCalledWith({ sessionId: 's1' });
  call.mockResolvedValue({ data: { ...view, combatRoster: [{ private: true }] } });
  await expect(getAegisEnrichedWarheadChoice()).rejects.toThrow(/invalid/i);
});
it('sends only choice and CAS authority and verifies the exact payment receipt', async () => {
  const call = vi.fn(async payload => ({ data: { type: 'aegis-enriched-warhead-result', status: 'committed',
    sessionId: 's1', requestId: payload.requestId, turn: 2, revision: 6,
    view: { ...view, revision: 6, choiceStatus: 'enriched', eligible: false } } }));
  vi.mocked(httpsCallable).mockReturnValue(call);
  await commitAegisEnrichedWarheadChoice(2, 5, 'enrich');
  expect(call).toHaveBeenCalledWith({ sessionId: 's1', requestId: expect.any(String),
    expectedTurn: 2, expectedRevision: 5, choice: 'enrich' });
});
it('blocks a payment from cached authority before invoking the server', async () => {
  useSessionStore.getState().setSessionSnapshotFreshness('cache');
  await expect(commitAegisEnrichedWarheadChoice(2, 5, 'enrich')).rejects.toThrow(/Reconnect/i);
  expect(httpsCallable).not.toHaveBeenCalled();
});
