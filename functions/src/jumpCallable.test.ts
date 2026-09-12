import { beforeEach, expect, it, vi } from 'vitest';
import type { CallableRequest } from 'firebase-functions/v2/https';

const mock = vi.hoisted(() => ({
  get: vi.fn(),
  update: vi.fn(),
  role: 'gm',
  owner: 'u1',
  connected: true,
  currentTurn: 1,
  coordinate: '0000',
  fuel: 4,
  charges: ['jump-drive'] as string[],
  jumpStates: {} as Record<string, unknown>,
  upgrades: {} as Record<string, unknown>,
  damage: {} as Record<string, unknown>,
  transactionRetries: 0,
  randomInt: vi.fn(() => 6),
  randomUUID: vi.fn(() => 'jump-event'),
}));

vi.mock('node:crypto', () => ({ randomInt: mock.randomInt, randomUUID: mock.randomUUID }));
vi.mock('firebase-admin/app', () => ({ initializeApp: vi.fn() }));
vi.mock('firebase-admin/firestore', () => ({
  getFirestore: () => ({
    doc: (path: string) => path,
    collection: (path: string) => path,
    runTransaction: async (callback: (tx: unknown) => unknown) => {
      let result: unknown;
      const attempts = mock.transactionRetries + 1;
      for (let attempt = 0; attempt < attempts; attempt += 1) {
        const writes: Array<[string, Record<string, unknown>]> = [];
        result = await callback({
          get: mock.get,
          update: (path: string, fields: Record<string, unknown>) => writes.push([path, fields]),
        });
        if (attempt === attempts - 1) {
          for (const [path, fields] of writes) mock.update(path, fields);
        }
      }
      return result;
    },
  }),
  FieldValue: { serverTimestamp: () => 'server-time' },
  Timestamp: { now: () => ({ toMillis: () => Date.now() }) },
}));

import { jumpShip } from './index';

function request(data: Record<string, unknown>, uid = 'u1') {
  return { data, auth: { uid } } as CallableRequest<Record<string, unknown>>;
}

const data = {
  sessionId: 's1',
  instanceId: 'bridge',
  shipId: 'aegis',
};

beforeEach(() => {
  mock.role = 'gm';
  mock.owner = 'u1';
  mock.connected = true;
  mock.currentTurn = 1;
  mock.coordinate = '0000';
  mock.fuel = 4;
  mock.charges = ['jump-drive'];
  mock.jumpStates = {};
  mock.upgrades = {};
  mock.damage = {};
  mock.transactionRetries = 0;
  mock.randomInt.mockReset();
  mock.randomInt.mockReturnValue(6);
  mock.randomUUID.mockReset();
  mock.randomUUID.mockReturnValue('jump-event');
  mock.update.mockReset();
  mock.get.mockImplementation(async (path: string) => {
    const fields: Record<string, unknown> = path.includes('/players/')
      ? { role: mock.role, connected: mock.connected, activeConsoleRoleId: undefined }
      : path.includes('/gmInstances/')
        ? { uid: mock.owner }
        : {
          phase: 'active',
          currentTurn: mock.currentTurn,
          capybaraEnabled: true,
          dioneEnabled: true,
          shipGalacticCoordinates: {
            aegis: mock.coordinate,
            dione: '0000',
            icebreaker: '0000',
            capybara: '0000',
            shepherd: '0000',
            quellon: '0000',
            'refinery-124': '0000',
          },
          shipNavigationLogs: {
            aegis: [], dione: [], icebreaker: [], capybara: [], shepherd: [], quellon: [], 'refinery-124': [],
          },
          shipResources: {
            aegis: { ore: 0, fuel: mock.fuel, food: 8, water: 6, materials: 1, securityTeams: 9 },
          },
          shipDamage: mock.damage,
          shipUpgrades: mock.upgrades,
          shipJumpStates: mock.jumpStates,
          maintenanceCycles: {
            aegis: { turn: mock.currentTurn, charges: mock.charges, results: {} },
          },
        };
    return { exists: true, get: (key: string) => fields[key] };
  });
});

it('rejects malformed coordinates before reading or changing any authoritative state', async () => {
  mock.get.mockClear();
  for (const destination of [undefined, null, 5143, '', '513', '51430', '51a3', '51 3', '５１４３']) {
    await expect(jumpShip.run(request({ ...data, destination }))).rejects.toMatchObject({
      code: 'invalid-argument',
    });
  }
  expect(mock.get).not.toHaveBeenCalled();
  expect(mock.update).not.toHaveBeenCalled();
  expect(mock.randomInt).not.toHaveBeenCalled();
  expect(mock.randomUUID).not.toHaveBeenCalled();
});

it('rejects an unprinted locked coordinate with a server-owned one-hour integrity lockout', async () => {
  await expect(jumpShip.run(request({ ...data, destination: '0101' }))).resolves.toMatchObject({
    status: 'integrity-lockout',
    shipId: 'aegis',
    origin: '0000',
    destination: '0101',
    state: { integrityLockedUntil: expect.any(String) },
  });

  expect(mock.update).toHaveBeenCalledWith('sessions/s1', expect.objectContaining({
    'shipJumpStates.aegis': { integrityLockedUntil: expect.any(String) },
    updatedAt: 'server-time',
  }));
  expect(mock.update.mock.calls[0]?.[1]).not.toHaveProperty('shipGalacticCoordinates.aegis');
  expect(mock.update.mock.calls[0]?.[1]).not.toHaveProperty('shipResources.aegis.fuel');
  expect(mock.update.mock.calls[0]?.[1]).not.toHaveProperty('maintenanceCycles.aegis');
  expect(mock.update.mock.calls[0]?.[1]).not.toHaveProperty('shipJumpTransitions.aegis');
  expect(mock.randomInt).not.toHaveBeenCalled();
});

it('uses the active GM instance and atomically moves, burns fuel, consumes charge, and publishes the transition', async () => {
  mock.transactionRetries = 1;
  mock.upgrades = { aegis: ['jump-drive'] };
  mock.damage = { aegis: { damagedSystemIds: ['jump-drive'], destroyed: false } };
  mock.randomInt.mockReset();
  mock.randomInt.mockReturnValueOnce(4).mockReturnValueOnce(1);

  await expect(jumpShip.run(request({ ...data, destination: '5143' }))).resolves.toMatchObject({
    status: 'jumped',
    shipId: 'aegis',
    origin: '0000',
    destination: '5143',
    length: 'short',
    fuelCost: 1,
    remainingFuel: 3,
    transition: expect.objectContaining({ id: 'jump-event', destination: '5143' }),
  });

  expect(mock.randomInt).toHaveBeenCalledTimes(1);
  expect(mock.randomInt).toHaveBeenCalledWith(1, 7);
  expect(mock.update).toHaveBeenCalledTimes(1);
  expect(mock.update).toHaveBeenCalledWith('sessions/s1', expect.objectContaining({
    'shipGalacticCoordinates.aegis': '5143',
    'shipResources.aegis.fuel': 3,
    'maintenanceCycles.aegis': expect.objectContaining({ charges: [] }),
    'shipJumpStates.aegis': { lastJumpTurn: 1 },
    'shipJumpTransitions.aegis': expect.objectContaining({ id: 'jump-event' }),
    shipNavigationLogs: expect.objectContaining({
      aegis: expect.arrayContaining([expect.objectContaining({
        id: 'jump-event-0',
        type: 'self-jump',
        origin: '0000',
        destination: '5143',
        navigationalError: false,
      })]),
    }),
  }));

  mock.transactionRetries = 0;
  mock.coordinate = '0000';
  mock.fuel = 4;
  mock.charges = ['jump-drive'];
  mock.jumpStates = {};
  mock.upgrades = {};
  mock.damage = {};
  mock.randomInt.mockReset();
  mock.randomInt.mockReturnValue(6);
  mock.update.mockReset();

  await expect(jumpShip.run(request({ ...data, destination: '5143' }))).resolves.toMatchObject({
    status: 'jumped',
    shipId: 'aegis',
    origin: '0000',
    destination: '5143',
    length: 'short',
    fuelCost: 2,
    remainingFuel: 2,
  });

  expect(mock.randomInt).not.toHaveBeenCalled();
  expect(mock.update).toHaveBeenCalledTimes(1);
  expect(mock.update).toHaveBeenCalledWith('sessions/s1', expect.objectContaining({
    'shipGalacticCoordinates.aegis': '5143',
    'shipResources.aegis.fuel': 2,
    'maintenanceCycles.aegis': expect.objectContaining({ charges: [] }),
    'shipJumpStates.aegis': { lastJumpTurn: 1 },
    'shipJumpTransitions.aegis': expect.objectContaining({ id: 'jump-event' }),
    shipNavigationLogs: expect.objectContaining({
      aegis: expect.arrayContaining([expect.objectContaining({
        id: 'jump-event-0',
        type: 'self-jump',
        origin: '0000',
        destination: '5143',
        navigationalError: false,
      })]),
    }),
  }));
});

it('rejects Coordination jumps while the server phase is Team', async () => {
  mock.get.mockImplementation(async (path: string) => {
    const fields: Record<string, unknown> = path.includes('/players/')
      ? { role: mock.role, connected: mock.connected, activeConsoleRoleId: undefined }
      : path.includes('/gmInstances/')
        ? { uid: mock.owner }
        : {
          phase: 'active',
          currentTurn: mock.currentTurn,
          turnPhase: {
            turn: 1,
            airspace: { state: 'restricted', tickerActive: true, pressAccess: false },
          },
          capybaraEnabled: true,
          dioneEnabled: true,
          shipGalacticCoordinates: { aegis: mock.coordinate },
          shipResources: { aegis: { ore: 0, fuel: mock.fuel, food: 8, water: 6, materials: 1, securityTeams: 9 } },
          shipDamage: mock.damage,
          shipUpgrades: mock.upgrades,
          shipJumpStates: mock.jumpStates,
          maintenanceCycles: { aegis: { turn: mock.currentTurn, charges: mock.charges, results: {} } },
        };
    return { exists: true, get: (key: string) => fields[key] };
  });

  await expect(jumpShip.run(request({ ...data, destination: '5143' }))).rejects.toMatchObject({
    code: 'failed-precondition',
    message: expect.stringMatching(/coordination phase/i),
  });
  expect(mock.update).not.toHaveBeenCalled();
  expect(mock.randomInt).not.toHaveBeenCalled();
});

it('honours an existing integrity lock without changing authoritative state', async () => {
  mock.jumpStates = {
    aegis: { integrityLockedUntil: new Date(Date.now() + 3_600_000).toISOString() },
  };

  await expect(jumpShip.run(request({ ...data, destination: '5143' }))).resolves.toMatchObject({
    status: 'integrity-locked',
    shipId: 'aegis',
  });
  expect(mock.update).not.toHaveBeenCalled();
  expect(mock.randomInt).not.toHaveBeenCalled();

  mock.jumpStates = {};
  mock.damage = { aegis: { damagedSystemIds: ['jump-drive'], destroyed: false } };
  mock.randomInt.mockReturnValue(1);
  await expect(jumpShip.run(request({ ...data, destination: '5143' }))).resolves.toMatchObject({
    status: 'drive-failure',
    shipId: 'aegis',
  });
  expect(mock.update).not.toHaveBeenCalled();
  expect(mock.randomInt).toHaveBeenCalledTimes(1);

  mock.damage = {};
  mock.jumpStates = { aegis: { lastJumpTurn: 1 } };
  mock.randomInt.mockClear();
  await expect(jumpShip.run(request({ ...data, destination: '5143' }))).rejects.toMatchObject({
    code: 'failed-precondition',
    message: expect.stringMatching(/already jumped/i),
  });
  expect(mock.update).not.toHaveBeenCalled();
  expect(mock.randomInt).not.toHaveBeenCalled();
});

it('denies a player operating a different ship even with a valid printed destination', async () => {
  mock.role = 'player';
  mock.get.mockImplementation(async (path: string) => {
    if (path.includes('/players/')) {
      return { exists: true, get: (key: string) => ({ role: 'player', connected: true, activeConsoleRoleId: 'dione-captain' } as Record<string, unknown>)[key] };
    }
    return { exists: true, get: (key: string) => key === 'activeRoleIds' ? undefined : undefined };
  });

  await expect(jumpShip.run(request({ ...data, destination: '5143' }))).rejects.toMatchObject({
    code: 'permission-denied',
  });
  expect(mock.update).not.toHaveBeenCalled();
  expect(mock.randomInt).not.toHaveBeenCalled();
});
