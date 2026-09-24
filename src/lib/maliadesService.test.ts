import { beforeEach, expect, it, vi } from 'vitest';
import { useSessionStore } from '@/store/useSessionStore';

const mocks = vi.hoisted(() => ({ call: vi.fn(), callable: vi.fn() }));
vi.mock('firebase/functions', () => ({ httpsCallable: mocks.callable }));
vi.mock('./firebase', () => ({ functions: () => 'functions' }));

import { repairMaliades, resolveMaliadesMedium, resolveMaliadesShort } from './maliadesService';

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

it('does not send enemy or friendly target guesses for unavailable range choices', async () => {
  const attempts = [
    resolveMaliadesMedium(2, 1, [{ kind: 'attack', targetId: 'wolf-fighter-wing' }]),
    resolveMaliadesMedium(2, 1, [{ kind: 'attack', targetId: 'aegis' }]),
    resolveMaliadesShort(2, 1, ['wolf-fighter-wing']),
    resolveMaliadesShort(2, 1, ['aegis']),
  ];
  const messages: string[] = [];
  for (const attempt of attempts) {
    try { await attempt; } catch (error) { messages.push((error as Error).message); }
  }
  expect(messages).toEqual(Array(4).fill('Maliades range choices are not available for this attack.'));
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
