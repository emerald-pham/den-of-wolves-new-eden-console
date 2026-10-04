import { beforeEach, expect, it, vi } from 'vitest';
import { useSessionStore } from '@/store/useSessionStore';

const mocks = vi.hoisted(() => ({ call: vi.fn(), callable: vi.fn(), doc: vi.fn(), onSnapshot: vi.fn() }));
vi.mock('firebase/functions', () => ({ httpsCallable: mocks.callable }));
vi.mock('firebase/firestore', () => ({ doc: mocks.doc, onSnapshot: mocks.onSnapshot }));
vi.mock('./firebase', () => ({ functions: () => 'functions' }));
vi.mock('./firestore', () => ({ db: () => 'firestore' }));

import { attestVipHostVisit, rerollHostedShipMaintenance } from './vipHostService';

const session = {
  id: 's1', name: 'Fleet', joinCode: '1234', phase: 'active' as const,
  ownerUid: 'owner', currentTurn: 4, activeRoleIds: ['aegis-engineer'], activeVesselIds: ['aegis'],
  createdAt: '', updatedAt: '',
};

function setGm() {
  useSessionStore.getState().reset();
  useSessionStore.getState().setIdentity(session, {
    uid: 'gm-1', sessionId: 's1', displayName: 'GM', role: 'gm', seatId: null, joinedAt: '',
  });
  useSessionStore.getState().setGmInstance({ id: 'instance-1', sessionId: 's1', uid: 'gm-1' } as never);
  useSessionStore.getState().setConnection('live');
  useSessionStore.getState().setSessionSnapshotFreshness('server');
}

function setOfficer() {
  useSessionStore.getState().reset();
  useSessionStore.getState().setIdentity(session, {
    uid: 'officer-1', sessionId: 's1', displayName: 'Officer', role: 'player', seatId: 'aegis-engineer',
    assignedRoleId: 'aegis-engineer', activeConsoleRoleId: 'aegis-engineer', replacementRoleId: null,
    replacementStatus: null, joinedAt: '',
  });
  useSessionStore.getState().setConnection('live');
  useSessionStore.getState().setSessionSnapshotFreshness('server');
}

beforeEach(() => {
  mocks.call.mockReset();
  mocks.callable.mockReset().mockReturnValue(mocks.call);
  mocks.doc.mockReset().mockReturnValue('vip-doc');
  mocks.onSnapshot.mockReset();
});

it('requires a current GM instance and attests only a physical visit to another active ship', async () => {
  setGm();
  mocks.call.mockImplementation(async (payload) => ({ data: {
    status: 'committed', type: 'vip-host-visit-attestation', sessionId: 's1', requestId: payload.requestId,
    shipId: 'aegis', cycle: 4, revision: 1, benefitStatus: 'available',
  } }));
  await expect(attestVipHostVisit('aegis')).resolves.toMatchObject({ shipId: 'aegis', cycle: 4 });
  expect(mocks.callable).toHaveBeenCalledWith('functions', 'attestVipHostVisit');
  expect(mocks.call.mock.calls[0]?.[0]).toMatchObject({
    sessionId: 's1', instanceId: 'instance-1', expectedCycle: 4, shipId: 'aegis',
  });
});

it('consumes the member-safe hosted grant for one selected die during the open unrest reroll step', async () => {
  setOfficer();
  mocks.call.mockImplementation(async (payload) => ({ data: {
    status: 'committed', type: 'vip-host-maintenance-reroll', sessionId: 's1',
    requestId: payload.requestId, shipId: 'aegis', cycle: 4,
    grantRevision: 2, maintenanceRevision: 8, unrest: 3,
  } }));
  await expect(rerollHostedShipMaintenance({
    shipId: 'aegis', expectedCycle: 4, expectedGrantRevision: 1,
    expectedMaintenanceRevision: 7, dieIndex: 1, consoleRoleId: 'aegis-engineer',
  })).resolves.toMatchObject({ shipId: 'aegis', grantRevision: 2, maintenanceRevision: 8 });
  expect(mocks.callable).toHaveBeenCalledWith('functions', 'rerollHostedShipMaintenance');
  expect(mocks.call.mock.calls[0]?.[0]).toMatchObject({
    sessionId: 's1', shipId: 'aegis', expectedCycle: 4, expectedGrantRevision: 1,
    expectedMaintenanceRevision: 7, dieIndex: 1, consoleRoleId: 'aegis-engineer',
  });
});
