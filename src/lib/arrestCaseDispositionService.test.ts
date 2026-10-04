import { beforeEach, expect, it, vi } from 'vitest';
import { useSessionStore } from '@/store/useSessionStore';

const mocks = vi.hoisted(() => ({ call: vi.fn(), callable: vi.fn() }));
vi.mock('firebase/functions', () => ({ httpsCallable: mocks.callable }));
vi.mock('./firebase', () => ({ functions: () => 'functions' }));

import { resolveArrestCaseDisposition } from './arrestCaseDispositionService';

beforeEach(() => {
  mocks.call.mockReset();
  mocks.callable.mockReset();
  mocks.callable.mockReturnValue(mocks.call);
  useSessionStore.getState().reset();
  useSessionStore.getState().setIdentity({
    id: 's1', name: 'Fleet', joinCode: '1234', phase: 'active', ownerUid: 'gm', currentTurn: 4,
    setupRevision: 2, createdAt: '', updatedAt: '',
  }, { uid: 'gm', sessionId: 's1', displayName: 'Facilitator', role: 'gm', seatId: null, joinedAt: '' });
  useSessionStore.getState().setGmInstance({
    id: 'gm-instance', sessionId: 's1', uid: 'gm', name: 'Facilitator', connected: true,
    createdAt: '', lastSeenAt: '',
  });
  useSessionStore.getState().setConnection('live');
  useSessionStore.getState().setSessionSnapshotFreshness('server');
});

it('submits a facilitator execution with the current case and setup revisions', async () => {
  mocks.call.mockResolvedValue({ data: {
    status: 'committed', type: 'arrest-case-disposition', sessionId: 's1', requestId: expect.any(String),
    targetUid: 'player-2', turn: 4, revision: 2, deadlineCycle: 4, deadlineMet: true,
    disposition: 'executed', setupRevision: 3, replacementEligibilityRevision: 1,
  } });
  await expect(resolveArrestCaseDisposition({
    targetUid: 'player-2', expectedCycle: 4, expectedRevision: 1,
    expectedSetupRevision: 2, disposition: 'executed',
  })).resolves.toMatchObject({ disposition: 'executed', setupRevision: 3, replacementEligibilityRevision: 1 });
  expect(mocks.callable).toHaveBeenCalledWith('functions', 'resolveArrestCaseDisposition');
  expect(mocks.call).toHaveBeenCalledWith(expect.objectContaining({
    sessionId: 's1', instanceId: 'gm-instance', expectedCycle: 4,
    expectedRevision: 1, expectedSetupRevision: 2, targetUid: 'player-2', disposition: 'executed',
  }));
});

it('fails closed if the GM authority or callable receipt is malformed', async () => {
  useSessionStore.getState().setIdentity({
    id: 's1', name: 'Fleet', joinCode: '1234', phase: 'active', ownerUid: 'gm', currentTurn: 4,
    setupRevision: 2, createdAt: '', updatedAt: '',
  }, { uid: 'player', sessionId: 's1', displayName: 'Player', role: 'player', seatId: null, joinedAt: '' });
  await expect(resolveArrestCaseDisposition({ targetUid: 'player-2', expectedCycle: 4,
    expectedRevision: 1, expectedSetupRevision: 2, disposition: 'released' })).rejects.toThrow(/facilitator/i);
  expect(mocks.call).not.toHaveBeenCalled();

  useSessionStore.getState().setIdentity({
    id: 's1', name: 'Fleet', joinCode: '1234', phase: 'active', ownerUid: 'gm', currentTurn: 4,
    setupRevision: 2, createdAt: '', updatedAt: '',
  }, { uid: 'gm', sessionId: 's1', displayName: 'Facilitator', role: 'gm', seatId: null, joinedAt: '' });
  mocks.call.mockResolvedValue({ data: { status: 'committed', type: 'arrest-case-disposition', sessionId: 'other' } });
  await expect(resolveArrestCaseDisposition({ targetUid: 'player-2', expectedCycle: 4,
    expectedRevision: 1, expectedSetupRevision: 2, disposition: 'released' })).rejects.toThrow(/invalid prisoner/i);
});
