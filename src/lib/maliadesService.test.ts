import { beforeEach, expect, it, vi } from 'vitest';
import { useSessionStore } from '@/store/useSessionStore';

const mocks = vi.hoisted(() => ({ call: vi.fn(), callable: vi.fn() }));
vi.mock('firebase/functions', () => ({ httpsCallable: mocks.callable }));
vi.mock('./firebase', () => ({ functions: () => 'functions' }));

import { repairMaliades, resolveMaliadesMedium } from './maliadesService';

const state = {
  revision: 2, attackId: 'attack-2', attackCycle: 2, launched: true, damage: 0 as const, destroyed: false,
  medium: { targetShift: null, attack: { targetId: 'dione', die: 4, hit: true, selfDamage: 0 } }, short: null,
};

beforeEach(() => {
  mocks.call.mockReset(); mocks.callable.mockReset().mockReturnValue(mocks.call);
  useSessionStore.getState().reset();
  useSessionStore.getState().setIdentity({
    id: 's1', name: 'Fleet', joinCode: '1234', phase: 'active', ownerUid: 'owner',
    createdAt: '', updatedAt: '', currentTurn: 2,
  }, {
    uid: 'u1', sessionId: 's1', displayName: 'Engineer', role: 'player', seatId: null,
    assignedRoleId: 'dione-engineer', activeConsoleRoleId: 'dione-engineer', joinedAt: '',
  });
  useSessionStore.getState().setConnection('live');
  useSessionStore.getState().setSessionSnapshotFreshness('server');
});

it('calls available Medium attacks with the observed revision and validates its state projection', async () => {
  mocks.call.mockImplementation(async (payload: { requestId: string }) => ({ data: {
    status: 'committed', sessionId: 's1', requestId: payload.requestId, craftId: 'maliades', cycle: 2,
    revision: 2, state, resolution: state.medium,
  } }));
  await expect(resolveMaliadesMedium(2, 1, [{ kind: 'attack', targetId: 'dione' }]))
    .resolves.toMatchObject({ status: 'committed', cycle: 2, revision: 2 });
  expect(mocks.callable).toHaveBeenCalledWith('functions', 'resolveMaliadesMedium');
  expect(mocks.call).toHaveBeenCalledWith(expect.objectContaining({
    sessionId: 's1', expectedCycle: 2, expectedRevision: 1,
    choices: [{ kind: 'attack', targetId: 'dione' }],
  }));
});

it('does not send target-shift guesses without a safe current-target choice', async () => {
  await expect(resolveMaliadesMedium(2, 1, [{ kind: 'target-shift', targetId: 'aegis', shift: 1 }]))
    .rejects.toThrow(/current wolf target choices are not available/i);
  expect(mocks.callable).not.toHaveBeenCalled();
});

it('rejects cache-backed authority before contacting a callable', async () => {
  useSessionStore.getState().setSessionSnapshotFreshness('cache');
  await expect(resolveMaliadesMedium(2, 1, [{ kind: 'attack', targetId: 'wolf-1' }]))
    .rejects.toThrow(/live session state/i);
  expect(mocks.callable).not.toHaveBeenCalled();
});

it('validates the repair host, damage amount, and authoritative response', async () => {
  mocks.call.mockImplementation(async (payload: { requestId: string }) => ({ data: {
    status: 'committed', sessionId: 's1', requestId: payload.requestId, craftId: 'maliades', cycle: 2,
    revision: 2, hostShipId: 'dione', damageRepaired: 1, materialsRemaining: 3,
    state: { revision: 2, attackId: 'attack-2', attackCycle: 2, launched: true, damage: 0, destroyed: false, medium: null,
      short: { rolls: [{ targetId: 'wolf-1', die: 2, hit: true, selfDamage: 0 }], selfDamage: 0 } },
  } }));
  await expect(repairMaliades(2, 1, 'dione', 1)).resolves.toMatchObject({ hostShipId: 'dione', damageRepaired: 1 });
  await expect(repairMaliades(2, 1, 'dione', 0)).rejects.toThrow(/repair selection is invalid/i);
});
