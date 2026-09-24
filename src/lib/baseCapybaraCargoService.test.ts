import { beforeEach, expect, it, vi } from 'vitest';
import { useSessionStore } from '@/store/useSessionStore';

const mocks = vi.hoisted(() => ({ call: vi.fn(), callable: vi.fn() }));
vi.mock('firebase/functions', () => ({ httpsCallable: mocks.callable }));
vi.mock('./firebase', () => ({ functions: () => 'functions' }));

import { transferBaseCapybaraCargo } from './baseCapybaraCargoService';

const command = {
  requestId: 'capybara-cargo-1', expectedCycle: 3, expectedRevision: 0,
  expectedDockingRevision: 2, expectedHostShipId: 'aegis',
  resourceId: 'materials' as const, direction: 'load' as const, amount: 2,
};
const reply = (status: 'committed' | 'replayed' = 'committed') => ({
  data: {
    status, sessionId: 's1', requestId: command.requestId, cycle: 3,
    hostShipId: 'aegis', resourceId: 'materials', direction: 'load', amount: 2,
    cargoRevision: 1,
  },
});

beforeEach(() => {
  mocks.call.mockReset();
  mocks.callable.mockReset();
  mocks.callable.mockReturnValue(mocks.call);
  useSessionStore.getState().reset();
  useSessionStore.getState().setIdentity({
    id: 's1', name: 'Fleet', joinCode: '1234', phase: 'active', ownerUid: 'owner',
    createdAt: '', updatedAt: '',
  }, {
    uid: 'captain', sessionId: 's1', displayName: 'Captain', role: 'player', seatId: null,
    assignedRoleId: 'doctor', replacementRoleId: 'capybara-small-captain',
    activeConsoleRoleId: null, joinedAt: '',
  });
  useSessionStore.getState().setConnection('live');
  useSessionStore.getState().setSessionSnapshotFreshness('server');
});

it('sends the exact revision-bound cargo command and validates its transaction result', async () => {
  mocks.call.mockResolvedValue(reply());
  await expect(transferBaseCapybaraCargo(command)).resolves.toEqual({
    status: 'committed', hostShipId: 'aegis', resourceId: 'materials',
    direction: 'load', amount: 2, cycle: 3, cargoRevision: 1,
  });
  expect(mocks.callable).toHaveBeenCalledWith('functions', 'transferBaseCapybaraCargo');
  expect(mocks.call).toHaveBeenCalledWith({ sessionId: 's1', ...command });
});

it('accepts the identical replay and rejects a mismatched result or cached authority', async () => {
  mocks.call.mockResolvedValue(reply('replayed'));
  await expect(transferBaseCapybaraCargo(command)).resolves.toMatchObject({ status: 'replayed' });
  mocks.call.mockResolvedValue({ data: { ...reply().data, amount: 3 } });
  await expect(transferBaseCapybaraCargo(command)).rejects.toThrow(/malformed/i);
  useSessionStore.getState().setSessionSnapshotFreshness('cache');
  await expect(transferBaseCapybaraCargo(command)).rejects.toThrow(/live session state/i);
});

it('rejects nonpositive, fractional, or unsupported resources before calling the server', async () => {
  await expect(transferBaseCapybaraCargo({ ...command, amount: 0 })).rejects.toThrow(/invalid/i);
  await expect(transferBaseCapybaraCargo({ ...command, amount: 1.5 })).rejects.toThrow(/invalid/i);
  await expect(transferBaseCapybaraCargo({ ...command, resourceId: 'scrap' as never })).rejects.toThrow(/invalid/i);
  expect(mocks.call).not.toHaveBeenCalled();
});
