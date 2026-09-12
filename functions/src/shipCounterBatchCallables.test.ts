import { beforeEach, expect, it, vi } from 'vitest';
import type { CallableRequest } from 'firebase-functions/v2/https';

const mock = vi.hoisted(() => ({
  get: vi.fn(), update: vi.fn(), role: 'gm', owner: 'u1', connected: true,
  fuel: 6, unrest: 7, population: 16_000,
  retry: false, retryFuel: undefined as number | undefined,
  unrestAlerts: {} as Record<string, unknown>, populationAlerts: {} as Record<string, unknown>,
}));

vi.mock('firebase-admin/app', () => ({ initializeApp: vi.fn() }));
vi.mock('firebase-admin/firestore', () => ({
  getFirestore: () => ({
    doc: (path: string) => path,
    collection: (path: string) => path,
    runTransaction: async (callback: (tx: unknown) => unknown) => {
      const transaction = { get: mock.get, update: mock.update };
      if (mock.retry) {
        await callback(transaction);
        if (mock.retryFuel !== undefined) mock.fuel = mock.retryFuel;
      }
      return callback(transaction);
    },
  }),
  FieldValue: { serverTimestamp: () => 'server-time' },
  Timestamp: { now: () => ({ toMillis: () => Date.now() }) },
}));

import { adjustShipResource, applyShipCounterSteps } from './index';

function request(data: Record<string, unknown>, uid = 'u1') {
  return { data, auth: { uid } } as CallableRequest<Record<string, unknown>>;
}

beforeEach(() => {
  mock.role = 'gm'; mock.owner = 'u1'; mock.connected = true;
  mock.fuel = 6; mock.unrest = 7; mock.population = 16_000;
  mock.retry = false; mock.retryFuel = undefined;
  mock.unrestAlerts = {}; mock.populationAlerts = {};
  mock.update.mockReset();
  mock.get.mockImplementation(async (path: string) => {
    if (path.endsWith('/gmInstances')) return { docs: [{ id: 'gm1' }, { id: 'gm2' }] };
    const fields: Record<string, unknown> = path.includes('/players/')
      ? { role: mock.role, connected: mock.connected }
      : path.includes('/gmInstances/') ? { uid: mock.owner }
      : {
        activeVesselIds: ['aegis', 'dione', 'icebreaker', 'shepherd', 'quellon', 'refinery-124', 'capybara'],
        shipResources: { dione: { fuel: mock.fuel } },
        shipUnrest: { dione: mock.unrest },
        shipSurvivors: { capybara: mock.population },
        unrestAlerts: mock.unrestAlerts,
        populationAlerts: mock.populationAlerts,
      };
    return { exists: true, get: (key: string) => fields[key] };
  });
});

it('applies rapid resource steps in their click order inside one transaction', async () => {
  await expect(applyShipCounterSteps.run(request({
    sessionId: 's1', instanceId: 'gm1', shipId: 'dione', counter: 'resource',
    resourceId: 'fuel', steps: [1, 1, -1],
  }))).resolves.toEqual({ amount: 7, appliedSteps: [1, 1, -1], alertRaised: false });
  expect(mock.update).toHaveBeenCalledWith('sessions/s1', expect.objectContaining({
    'shipResources.dione.fuel': 7,
  }));
});

it('re-evaluates one resource command against the latest count after a transaction retry', async () => {
  mock.retry = true;
  mock.retryFuel = 7;

  await expect(applyShipCounterSteps.run(request({
    sessionId: 's1', instanceId: 'gm1', shipId: 'dione', counter: 'resource',
    resourceId: 'fuel', steps: [1],
  }))).resolves.toEqual({ amount: 8, appliedSteps: [1], alertRaised: false });
  expect(mock.update).toHaveBeenNthCalledWith(1, 'sessions/s1', expect.objectContaining({
    'shipResources.dione.fuel': 7,
  }));
  expect(mock.update).toHaveBeenNthCalledWith(2, 'sessions/s1', expect.objectContaining({
    'shipResources.dione.fuel': 8,
  }));
});

it('keeps single and ordered resource commands at the safe upper boundary', async () => {
  mock.fuel = Number.MAX_SAFE_INTEGER;

  await expect(adjustShipResource.run(request({
    sessionId: 's1', instanceId: 'gm1', shipId: 'dione', resourceId: 'fuel', delta: 1,
  }))).resolves.toEqual({ amount: Number.MAX_SAFE_INTEGER });
  await expect(applyShipCounterSteps.run(request({
    sessionId: 's1', instanceId: 'gm1', shipId: 'dione', counter: 'resource',
    resourceId: 'fuel', steps: [1],
  }))).resolves.toEqual({ amount: Number.MAX_SAFE_INTEGER, appliedSteps: [1], alertRaised: false });
  expect(mock.update).toHaveBeenLastCalledWith('sessions/s1', expect.objectContaining({
    'shipResources.dione.fuel': Number.MAX_SAFE_INTEGER,
  }));
});

it('preserves an unrest threshold crossing rather than netting it away', async () => {
  await expect(applyShipCounterSteps.run(request({
    sessionId: 's1', instanceId: 'gm1', shipId: 'dione', counter: 'unrest', steps: [1, -1],
  }))).resolves.toEqual({ amount: 8, appliedSteps: [1], alertRaised: true });
  expect(mock.update).toHaveBeenCalledWith('sessions/s1', expect.objectContaining({
    'shipUnrest.dione': 8,
    unrestAlerts: { dione: expect.objectContaining({ targetGmInstanceIds: ['gm1', 'gm2'] }) },
  }));
});

it('preserves the first population threshold and targets every active GM', async () => {
  await expect(applyShipCounterSteps.run(request({
    sessionId: 's1', instanceId: 'gm1', shipId: 'capybara', counter: 'population', steps: [-1, -1],
  }))).resolves.toEqual({ amount: 15_000, appliedSteps: [-1], alertRaised: true });
  expect(mock.update).toHaveBeenCalledWith('sessions/s1', expect.objectContaining({
    'shipSurvivors.capybara': 15_000,
    populationAlerts: { capybara: expect.objectContaining({ population: 15_000, targetGmInstanceIds: ['gm1', 'gm2'] }) },
  }));
});

it('does not let a batch bypass an unresolved GM alert', async () => {
  mock.unrestAlerts = { dione: { targetGmInstanceIds: ['gm1'] } };

  await expect(applyShipCounterSteps.run(request({
    sessionId: 's1', instanceId: 'gm1', shipId: 'dione', counter: 'unrest', steps: [-1],
  }))).rejects.toMatchObject({ code: 'failed-precondition' });

  expect(mock.update).not.toHaveBeenCalled();
});

it('rejects untrusted counter batches before changing session state', async () => {
  await expect(applyShipCounterSteps.run(request({
    sessionId: 's1', instanceId: 'gm1', shipId: 'dione', counter: 'unrest', steps: [1, 2],
  }))).rejects.toMatchObject({ code: 'invalid-argument' });
  mock.role = 'player';
  await expect(applyShipCounterSteps.run(request({
    sessionId: 's1', instanceId: 'gm1', shipId: 'dione', counter: 'unrest', steps: [1],
  }))).rejects.toMatchObject({ code: 'permission-denied' });
  expect(mock.update).not.toHaveBeenCalled();
});
