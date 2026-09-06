import { beforeEach, expect, it, vi } from 'vitest';
import type { CallableRequest } from 'firebase-functions/v2/https';

const mock = vi.hoisted(() => ({
  get: vi.fn(), update: vi.fn(), set: vi.fn(), role: 'gm', owner: 'u1', connected: true,
  damage: {} as Record<string, unknown>, retry: false,
  randomInt: vi.fn(() => 3_100_000_000), randomUUID: vi.fn(() => 'damage-event'),
}));
vi.mock('node:crypto', () => ({ randomInt: mock.randomInt, randomUUID: mock.randomUUID }));
vi.mock('firebase-admin/app', () => ({ initializeApp: vi.fn() }));
vi.mock('firebase-admin/firestore', () => ({
  getFirestore: () => ({
    doc: (path: string) => path,
    collection: (path: string) => path,
    runTransaction: async (callback: (tx: unknown) => unknown) => {
      const tx = { get: mock.get, update: mock.update, set: mock.set };
      if (mock.retry) await callback(tx);
      return callback(tx);
    },
  }),
  FieldValue: { serverTimestamp: () => 'server-time' },
  Timestamp: { now: () => ({ toMillis: () => Date.now() }) },
}));

import { addShipDamage } from './index';

function request(data: Record<string, unknown>, uid = 'u1') {
  return { data, auth: { uid } } as CallableRequest<{
    sessionId: string; shipId: string; instanceId: string;
  }>;
}

beforeEach(() => {
  mock.role = 'gm';
  mock.owner = 'u1';
  mock.connected = true;
  mock.damage = {};
  mock.retry = false;
  mock.randomInt.mockReset();
  mock.randomInt.mockReturnValue(3_100_000_000);
  mock.randomUUID.mockReset();
  mock.randomUUID.mockReturnValue('damage-event');
  mock.update.mockReset();
  mock.set.mockReset();
  mock.get.mockImplementation(async (path: string) => {
    const fields: Record<string, unknown> = path.includes('/players/')
      ? { role: mock.role, connected: mock.connected }
      : path.includes('/gmInstances/')
        ? { uid: mock.owner }
        : { shipDamage: mock.damage };
    return { exists: true, get: (key: string) => fields[key] };
  });
});

const data = { sessionId: 's1', shipId: 'aegis', instanceId: 'bridge' };

it('draws and persists one AEGIS damage card atomically in the GM-only draw log', async () => {
  await expect(addShipDamage.run(request(data))).resolves.toMatchObject({
    card: { card: '10♥', systemId: 'reactor', systemName: 'Reactor' },
    destroyed: false,
  });
  expect(mock.update).toHaveBeenCalledWith('sessions/s1', expect.objectContaining({
    'shipDamage.aegis': { damagedSystemIds: ['reactor'], destroyed: false },
    updatedAt: 'server-time',
  }));
  expect(mock.set).toHaveBeenCalledWith('sessions/s1/damageDraws/damage-event', expect.objectContaining({
    type: 'ship-damage', shipId: 'aegis', card: '10♥', systemId: 'reactor',
  }));
});

it('does not reroll the card or event identity when Firestore retries the transaction', async () => {
  mock.retry = true;
  mock.randomInt.mockReturnValueOnce(3_100_000_000).mockReturnValue(0);
  mock.randomUUID.mockReturnValueOnce('first-event').mockReturnValue('retry-event');

  await addShipDamage.run(request(data));

  expect(mock.randomInt).toHaveBeenCalledTimes(1);
  expect(mock.randomUUID).toHaveBeenCalledTimes(1);
  expect(mock.set).toHaveBeenCalledTimes(2);
  expect(mock.set).toHaveBeenNthCalledWith(1, 'sessions/s1/damageDraws/first-event',
    expect.objectContaining({ card: '10♥', systemId: 'reactor' }));
  expect(mock.set).toHaveBeenNthCalledWith(2, 'sessions/s1/damageDraws/first-event',
    expect.objectContaining({ card: '10♥', systemId: 'reactor' }));
});

it.each(['player', 'observer'])('denies %s even with a forged GM instance', async (role) => {
  mock.role = role;
  await expect(addShipDamage.run(request(data))).rejects.toMatchObject({ code: 'permission-denied' });
  expect(mock.update).not.toHaveBeenCalled();
});

it('denies another GM instance and ships without a damage deck', async () => {
  mock.owner = 'someone-else';
  await expect(addShipDamage.run(request(data))).rejects.toMatchObject({ code: 'permission-denied' });

  mock.owner = 'u1';
  await expect(addShipDamage.run(request({ ...data, shipId: 'dione' })))
    .rejects.toMatchObject({ code: 'invalid-argument' });
});

it('marks AEGIS destroyed without inventing a card when the deck is empty', async () => {
  mock.damage = {
    aegis: {
      damagedSystemIds: [
        'fighter-bay-alpha', 'fighter-bay-bravo', 'command-and-control',
        'missile-launchers', 'point-defence-lasers', 'armoured-hull-i',
        'armoured-hull-ii', 'storage', 'jump-drive', 'reactor',
        'construction-bay', 'shuttle-bay-zeta', 'shuttle-bay-omega',
      ],
      destroyed: false,
    },
  };

  await expect(addShipDamage.run(request(data))).resolves.toEqual({ destroyed: true });
  expect(mock.update).toHaveBeenCalledWith('sessions/s1', expect.objectContaining({
    'shipDamage.aegis': expect.objectContaining({ destroyed: true }),
  }));
  expect(mock.set).toHaveBeenCalledWith('sessions/s1/damageDraws/damage-event', expect.objectContaining({
    type: 'ship-destroyed', shipId: 'aegis',
  }));
});
