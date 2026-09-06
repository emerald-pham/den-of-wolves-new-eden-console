import { beforeEach, expect, it, vi } from 'vitest';
import type { CallableRequest } from 'firebase-functions/v2/https';
const mock = vi.hoisted(() => ({ get: vi.fn(), update: vi.fn(), role: 'gm', owner: 'u1', connected: true, population: 16000, alerts: {} as Record<string, unknown> }));
vi.mock('firebase-admin/app', () => ({ initializeApp: vi.fn() }));
vi.mock('firebase-admin/firestore', () => ({
  getFirestore: () => ({ doc: (path: string) => path, collection: (path: string) => path,
    runTransaction: (callback: (tx: unknown) => unknown) => callback({ get: mock.get, update: mock.update }) }),
  FieldValue: { serverTimestamp: () => 'server-time' }, Timestamp: { now: () => ({ toMillis: () => Date.now() }) },
}));
import { adjustShipPopulation, dismissPopulationAlert } from './index';
function request(data: Record<string, unknown>, uid = 'u1') {
  return { data, auth: { uid } } as CallableRequest<{ sessionId: string; shipId: string; delta: number; instanceId: string }>;
}
beforeEach(() => {
  mock.role = 'gm'; mock.owner = 'u1'; mock.connected = true; mock.population = 16000; mock.alerts = {};
  mock.update.mockReset();
  mock.get.mockImplementation(async (path: string) => {
    if (path.endsWith('/gmInstances')) return { docs: [{ id: 'gm1' }, { id: 'gm2' }] };
    const fields: Record<string, unknown> = path.includes('/players/')
      ? { role: mock.role, connected: mock.connected }
      : path.includes('/gmInstances/') ? { uid: mock.owner }
      : { shipSurvivors: { capybara: mock.population }, populationAlerts: mock.alerts };
    return { exists: true, get: (key: string) => fields[key] };
  });
});
const data = { sessionId: 's1', shipId: 'capybara', delta: -1, instanceId: 'gm1' };
it('writes a step and the targeted alert in the same transaction', async () => {
  await expect(adjustShipPopulation.run(request(data))).resolves.toMatchObject({ amount: 15000, alertRaised: true });
  expect(mock.update).toHaveBeenCalledWith('sessions/s1', expect.objectContaining({
    'shipSurvivors.capybara': 15000,
    populationAlerts: { capybara: expect.objectContaining({ population: 15000, targetGmInstanceIds: ['gm1', 'gm2'] }) },
  }));
});
it.each(['player', 'observer'])('denies %s even with a forged GM instance', async (role) => {
  mock.role = role;
  await expect(adjustShipPopulation.run(request(data))).rejects.toMatchObject({ code: 'permission-denied' });
  expect(mock.update).not.toHaveBeenCalled();
});
it('denies a GM using another persons instance', async () => {
  mock.owner = 'someone-else';
  await expect(adjustShipPopulation.run(request(data))).rejects.toMatchObject({ code: 'permission-denied' });
});
it('denies unsigned requests, invalid steps and ships without a track', async () => {
  await expect(adjustShipPopulation.run({ data } as CallableRequest<typeof data>)).rejects.toMatchObject({ code: 'unauthenticated' });
  await expect(adjustShipPopulation.run(request({ ...data, delta: 500 }))).rejects.toMatchObject({ code: 'invalid-argument' });
  await expect(adjustShipPopulation.run(request({ ...data, shipId: 'dione' }))).rejects.toMatchObject({ code: 'invalid-argument' });
});
it('moves AEGIS through its own printed track', async () => {
  mock.population = 2500;
  mock.get.mockImplementation(async (path: string) => {
    if (path.endsWith('/gmInstances')) return { docs: [{ id: 'gm1' }] };
    const fields: Record<string, unknown> = path.includes('/players/')
      ? { role: mock.role, connected: mock.connected }
      : path.includes('/gmInstances/') ? { uid: mock.owner }
      : { shipSurvivors: { aegis: mock.population }, populationAlerts: mock.alerts };
    return { exists: true, get: (key: string) => fields[key] };
  });
  await expect(adjustShipPopulation.run(request({ ...data, shipId: 'aegis' })))
    .resolves.toMatchObject({ amount: 2000, alertRaised: false });
  expect(mock.update).toHaveBeenCalledWith('sessions/s1', expect.objectContaining({
    'shipSurvivors.aegis': 2000,
  }));
});
it('preserves the other GM acknowledgement and does not alter unrest', async () => {
  mock.alerts = { capybara: { shipId: 'capybara', population: 15000, targetGmInstanceIds: ['gm1','gm2'] } };
  await dismissPopulationAlert.run(request(data));
  expect(mock.update).toHaveBeenCalledWith('sessions/s1', {
    populationAlerts: { capybara: { shipId: 'capybara', population: 15000, targetGmInstanceIds: ['gm2'] } }, updatedAt: 'server-time',
  });
});
it('blocks advancing while a threshold is awaiting acknowledgement', async () => {
  mock.alerts = { capybara: { targetGmInstanceIds: ['gm1'] } };
  await expect(adjustShipPopulation.run(request(data))).rejects.toMatchObject({ code: 'failed-precondition' });
  expect(mock.update).not.toHaveBeenCalled();
});
