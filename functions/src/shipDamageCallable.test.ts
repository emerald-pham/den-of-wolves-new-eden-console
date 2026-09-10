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

const aegisHullCases = [
  {
    name: 'recycles 6♥ while another damage card remains',
    damagedSystemIds: [
      'fighter-bay-alpha', 'fighter-bay-bravo', 'command-and-control',
      'missile-launchers', 'point-defence-lasers', 'storage', 'jump-drive',
      'construction-bay', 'shuttle-bay-zeta', 'shuttle-bay-omega',
    ],
    card: '6♥',
    systemId: 'armoured-hull-i',
    systemName: 'Armoured Hull I',
    recycled: true,
  },
  {
    name: 'keeps the final 7♥ out when it would empty the deck',
    damagedSystemIds: [
      'fighter-bay-alpha', 'fighter-bay-bravo', 'command-and-control',
      'missile-launchers', 'point-defence-lasers', 'armoured-hull-i',
      'storage', 'jump-drive', 'reactor', 'construction-bay',
      'shuttle-bay-zeta', 'shuttle-bay-omega',
    ],
    card: '7♥',
    systemId: 'armoured-hull-ii',
    systemName: 'Armoured Hull II',
    recycled: false,
  },
] as const;

it.each(aegisHullCases)('production path $name without survivor loss', async ({ damagedSystemIds, card, systemId, systemName, recycled }) => {
  mock.damage = { aegis: { damagedSystemIds, destroyed: false } };
  mock.randomInt.mockReturnValue(0);

  await expect(addShipDamage.run(request(data))).resolves.toMatchObject({
    card: { card, systemId, systemName },
    recycled,
    destroyed: false,
  });
  expect(mock.update).toHaveBeenCalledWith('sessions/s1', expect.objectContaining({
    'shipDamage.aegis': {
      damagedSystemIds: recycled ? damagedSystemIds : [...damagedSystemIds, systemId],
      destroyed: false,
    },
    'shipSurvivors.aegis': 2500,
  }));
  expect(mock.set).toHaveBeenCalledWith('sessions/s1/damageDraws/damage-event', expect.objectContaining({
    type: 'ship-damage', shipId: 'aegis', card, systemId, systemName, recycled,
  }));
});

it('does not reroll or fork the audit when a recycled hull transaction retries', async () => {
  mock.damage = {
    aegis: {
      damagedSystemIds: [
        'fighter-bay-alpha', 'fighter-bay-bravo', 'command-and-control',
        'missile-launchers', 'point-defence-lasers', 'storage', 'jump-drive',
        'construction-bay', 'shuttle-bay-zeta', 'shuttle-bay-omega',
      ],
      destroyed: false,
    },
  };
  mock.retry = true;
  mock.randomInt.mockReturnValueOnce(0).mockReturnValue(12);
  mock.randomUUID.mockReturnValueOnce('hull-event').mockReturnValue('retry-event');

  await expect(addShipDamage.run(request(data))).resolves.toMatchObject({
    card: { card: '6♥', systemId: 'armoured-hull-i', systemName: 'Armoured Hull I' },
    recycled: true, destroyed: false,
  });
  expect(mock.randomInt).toHaveBeenCalledTimes(1);
  expect(mock.randomUUID).toHaveBeenCalledTimes(1);
  expect(mock.set).toHaveBeenCalledTimes(2);
  expect(mock.set).toHaveBeenNthCalledWith(1, 'sessions/s1/damageDraws/hull-event',
    expect.objectContaining({
      type: 'ship-damage', card: '6♥', systemId: 'armoured-hull-i', systemName: 'Armoured Hull I', recycled: true,
    }));
  expect(mock.set).toHaveBeenNthCalledWith(2, 'sessions/s1/damageDraws/hull-event',
    expect.objectContaining({
      type: 'ship-damage', card: '6♥', systemId: 'armoured-hull-i', systemName: 'Armoured Hull I', recycled: true,
    }));
});

it('draws and persists one AEGIS damage card atomically in the shared draw log', async () => {
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
  await expect(addShipDamage.run(request({ ...data, shipId: 'unknown' })))
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

it.each([['aegis', 2000], ['dione', 95000], ['icebreaker', 37000], ['shepherd', 28000], ['quellon', 28000], ['refinery-124', 18500], ['capybara', 18500]])(
  'moves %s survivors down its printed track on ordinary damage', async (shipId, population) => {
    mock.randomInt.mockReturnValue(0);
    await addShipDamage.run(request({ ...data, shipId }));
    expect(mock.update).toHaveBeenCalledWith('sessions/s1', expect.objectContaining({ [`shipSurvivors.${shipId}`]: population }));
  },
);
it.each(['aegis', 'capybara'])('repairs all %s damage and restores its deck without restoring casualties', async shipId => {
  const { repairAllShipDamage } = await import('./index');
  mock.damage = { [shipId]: { damagedSystemIds: ['reactor'], destroyed: true } };
  await repairAllShipDamage.run(request({ ...data, shipId }));
  expect(mock.update).toHaveBeenCalledWith('sessions/s1', {
    [`shipDamage.${shipId}`]: { damagedSystemIds: [], destroyed: false }, updatedAt: 'server-time',
  });
  expect(mock.set).toHaveBeenCalledWith('sessions/s1/events/damage-event', expect.objectContaining({ type: 'ship-repaired', shipId, actorUid: 'u1' }));
});
it.each(['player', 'observer'])('denies repair by %s with forged GM identity', async role => {
  const { repairAllShipDamage } = await import('./index');
  mock.role = role;
  await expect(repairAllShipDamage.run(request(data))).rejects.toMatchObject({ code: 'permission-denied' });
  expect(mock.update).not.toHaveBeenCalled();
});
it('denies repairs from a disconnected GM or another GM instance', async () => {
  const { repairAllShipDamage } = await import('./index');
  mock.connected = false;
  await expect(repairAllShipDamage.run(request(data))).rejects.toMatchObject({ code: 'permission-denied' });
  mock.connected = true; mock.owner = 'other';
  await expect(repairAllShipDamage.run(request(data))).rejects.toMatchObject({ code: 'permission-denied' });
  expect(mock.update).not.toHaveBeenCalled();
});
it('rejects random damage draws after the session closes', async () => {
  const previous = mock.get.getMockImplementation()!;
  mock.get.mockImplementation(async (path: string) => path === 'sessions/s1' ? { exists: true, get: (key: string) => key === 'phase' ? 'closed' : undefined } : previous(path));
  await expect(addShipDamage.run(request(data))).rejects.toMatchObject({ code: 'failed-precondition' });
  expect(mock.update).not.toHaveBeenCalled();
});
