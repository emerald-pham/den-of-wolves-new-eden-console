import { beforeEach, expect, it, vi } from 'vitest';
import { useSessionStore } from '@/store/useSessionStore';

const call = vi.fn();
vi.mock('firebase/functions', () => ({ httpsCallable: () => call }));
vi.mock('./firebase', () => ({ functions: () => ({}) }));
import { recordPresidentAction, updatePoliticalCapital } from './presidentWorkspaceService';

beforeEach(() => {
  call.mockReset().mockResolvedValue({ data: {} });
  useSessionStore.getState().reset();
  useSessionStore.getState().setIdentity({
    id: 's1', name: 'Session', joinCode: '123456', phase: 'active', ownerUid: 'u1',
    createdAt: '', updatedAt: '', currentTurn: 2,
    presidentWorkspace: { revision: 3, entries: [] },
    politicalCapital: { revision: 2, balance: 1, entries: [] },
    resolvedCrisisOutcome: { crisisId: 'crisis-1', revision: 4, title: 'Approaching vessel' },
  }, { uid: 'u1', sessionId: 's1', displayName: 'President', role: 'player', seatId: null,
    activeConsoleRoleId: 'dione-president', joinedAt: '' });
  useSessionStore.getState().setConnection('live');
  useSessionStore.getState().setSessionSnapshotFreshness('server');
});

it('sends the exact server-projected crisis outcome and capital revision', async () => {
  await updatePoliticalCapital('spend');
  expect(call).toHaveBeenCalledWith(expect.objectContaining({
    sessionId: 's1', action: 'spend', crisisId: 'crisis-1', crisisRevision: 4,
    expectedRevision: 2,
  }));
});

it('sends the exact live revision and bounded action category', async () => {
  await recordPresidentAction('visit', '  Visit Dione. ');
  expect(call).toHaveBeenCalledWith(expect.objectContaining({ sessionId: 's1', kind: 'visit',
    text: 'Visit Dione.', expectedRevision: 3 }));
});
