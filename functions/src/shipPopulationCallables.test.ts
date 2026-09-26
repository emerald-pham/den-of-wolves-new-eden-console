import { beforeEach, expect, it, vi } from 'vitest';
import type { CallableRequest } from 'firebase-functions/v2/https';
const mock = vi.hoisted(() => ({
  get: vi.fn(), update: vi.fn(), role: 'gm', owner: 'u1', connected: true,
  phase: 'active', shipId: 'capybara', population: 16000, unrest: 0,
  alerts: {} as Record<string, unknown>, unrestAlerts: {} as Record<string, unknown>,
  receipts: {} as Record<string, Record<string, unknown>>,
  audits: {} as Record<string, Record<string, unknown>>,
  set: vi.fn(),
}));
vi.mock('firebase-admin/app', () => ({ initializeApp: vi.fn() }));
vi.mock('firebase-admin/firestore', () => ({
  getFirestore: () => ({ doc: (path: string) => path, collection: (path: string) => path,
    runTransaction: async (callback: (tx: unknown) => unknown) => {
      const writes: Record<string, Record<string, unknown>> = {};
      const result = await callback({
        get: mock.get,
        update: mock.update,
        set: (path: string, value: Record<string, unknown>) => {
          mock.set(path, value);
          writes[path] = value;
        },
      });
      for (const [path, value] of Object.entries(writes)) {
        if (path.includes('/commandReceipts/')) mock.receipts[path] = value;
        if (path.includes('/actionAudits/')) mock.audits[path] = value;
      }
      return result;
    } }),
  FieldValue: { serverTimestamp: () => 'server-time' }, Timestamp: { now: () => ({ toMillis: () => Date.now() }) },
}));
import { adjustShipPopulation, dismissPopulationAlert } from './index';
function request(data: Record<string, unknown>, uid = 'u1') {
  return { data: data.requestId === undefined ? { ...data, requestId: 'test-population' } : data, auth: { uid } } as CallableRequest<{ sessionId: string; shipId: string; delta: number; instanceId: string }>;
}
beforeEach(() => {
  mock.role = 'gm'; mock.owner = 'u1'; mock.connected = true; mock.phase = 'active';
  mock.shipId = 'capybara'; mock.population = 16000; mock.unrest = 0;
  mock.alerts = {}; mock.unrestAlerts = {};
  mock.receipts = {}; mock.audits = {}; mock.set.mockReset();
  mock.update.mockReset();
  mock.get.mockImplementation(async (path: string) => {
    if (path.includes('/commandReceipts/')) {
      const receipt = mock.receipts[path];
      return { exists: receipt !== undefined, get: (key: string) => receipt?.[key] };
    }
    if (path.includes('/actionAudits/')) {
      const audit = mock.audits[path];
      return { exists: audit !== undefined, get: (key: string) => audit?.[key], data: () => audit };
    }
    if (path.endsWith('/gmInstances')) return { docs: [{ id: 'gm1' }, { id: 'gm2' }] };
    const fields: Record<string, unknown> = path.includes('/players/')
      ? { role: mock.role, connected: mock.connected }
      : path.includes('/gmInstances/') ? { uid: mock.owner, connected: true, lastSeenAt: new Date() }
      : {
        activeVesselIds: ['aegis', 'dione', 'icebreaker', 'shepherd', 'quellon', 'refinery-124', 'capybara'],
        phase: mock.phase,
        shipSurvivors: { [mock.shipId]: mock.population }, shipUnrest: { [mock.shipId]: mock.unrest },
        populationAlerts: mock.alerts, unrestAlerts: mock.unrestAlerts,
      };
    return { exists: true, get: (key: string) => fields[key] };
  });
});
const data = { sessionId: 's1', shipId: 'capybara', delta: -1, instanceId: 'gm1' };
it('writes a step and the targeted alert in the same transaction', async () => {
  const committedRequest = { ...data, requestId: 'population-change' };
  const first = await adjustShipPopulation.run(request(committedRequest));
  expect(first).toMatchObject({
    amount: 15000, alertRaised: true, actorUid: 'u1', vesselId: 'capybara',
    turn: 1, phase: 'active', revision: 1, idempotencyKey: 'population-change',
    auditId: 'adjust-population-population-change',
  });
  expect(mock.update).toHaveBeenCalledWith('sessions/s1', expect.objectContaining({
    'shipSurvivors.capybara': 15000,
    populationAlerts: { capybara: expect.objectContaining({ population: 15000, targetGmInstanceIds: ['gm1', 'gm2'] }) },
  }));
  const audit = mock.audits['sessions/s1/actionAudits/population-change'];
  expect(audit).toMatchObject({
    schemaVersion: 1, sessionId: 's1', actorUid: 'u1', action: 'ship-population-adjustment',
    phase: 'active', requestId: 'population-change', revision: 1, outcome: 'committed',
    resolutionSource: 'facilitator', redactionPolicy: 'action-audit-metadata-only-v1',
  });
  expect(Object.keys(audit ?? {}).sort()).toEqual([
    'action', 'actorRoleId', 'actorUid', 'createdAt', 'outcome', 'phase',
    'redactionPolicy', 'requestId', 'resolutionSource', 'revision',
    'schemaVersion', 'sessionId',
  ].sort());
  expect(audit).not.toHaveProperty('amount');
  expect(audit).not.toHaveProperty('delta');
  expect(audit).not.toHaveProperty('shipId');
  const writesAfterCommit = mock.set.mock.calls.length;
  await expect(adjustShipPopulation.run(request(committedRequest))).resolves.toEqual(first);
  expect(mock.set).toHaveBeenCalledTimes(writesAfterCommit);
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
  await expect(adjustShipPopulation.run(request({ ...data, shipId: 'unknown-ship' }))).rejects.toMatchObject({ code: 'invalid-argument' });
});
it('moves AEGIS through its own printed track', async () => {
  mock.shipId = 'aegis';
  mock.population = 2500;
  mock.get.mockImplementation(async (path: string) => {
    if (path.includes('/commandReceipts/')) return { exists: false, get: () => undefined };
    if (path.includes('/actionAudits/')) return { exists: false, get: () => undefined, data: () => undefined };
    if (path.endsWith('/gmInstances')) return { docs: [{ id: 'gm1' }] };
    const fields: Record<string, unknown> = path.includes('/players/')
      ? { role: mock.role, connected: mock.connected }
      : path.includes('/gmInstances/') ? { uid: mock.owner, connected: true, lastSeenAt: new Date() }
      : { shipSurvivors: { aegis: mock.population }, populationAlerts: mock.alerts };
    return { exists: true, get: (key: string) => fields[key] };
  });
  await expect(adjustShipPopulation.run(request({ ...data, shipId: 'aegis' })))
    .resolves.toMatchObject({ amount: 2000, alertRaised: false });
  expect(mock.update).toHaveBeenCalledWith('sessions/s1', expect.objectContaining({
    'shipSurvivors.aegis': 2000,
  }));
});

it.each([
  ['aegis', 2000, 1500],
  ['dione', 95000, 90000],
  ['icebreaker', 37000, 34000],
  ['shepherd', 26000, 24000],
  ['quellon', 26000, 24000],
  ['refinery-124', 18500, 17000],
  ['capybara', 18500, 17000],
] as const)('advances %s damage to the next printed population value', async (shipId, population, amount) => {
  mock.shipId = shipId;
  mock.population = population;

  await expect(adjustShipPopulation.run(request({ ...data, shipId })))
    .resolves.toMatchObject({ amount, alertRaised: [90000, 34000, 24000].includes(amount) });
  expect(mock.update).toHaveBeenCalledWith('sessions/s1', expect.objectContaining({
    [`shipSurvivors.${shipId}`]: amount,
  }));
});

it.each([
  ['aegis', 0, -1],
  ['dione', 0, -1],
  ['capybara', 20000, 1],
] as const)('rejects population changes beyond the %s printed track endpoint', async (shipId, population, delta) => {
  mock.shipId = shipId;
  mock.population = population;

  await expect(adjustShipPopulation.run(request({ ...data, shipId, delta })))
    .rejects.toMatchObject({ code: 'failed-precondition' });
  expect(mock.update).not.toHaveBeenCalled();
});

it('adds two unrest once when Capybara reaches zero population', async () => {
  mock.population = 250;
  mock.unrest = 7;

  await expect(adjustShipPopulation.run(request(data))).resolves.toMatchObject({
    amount: 0,
    alertRaised: true,
  });
  expect(mock.update).toHaveBeenCalledWith('sessions/s1', expect.objectContaining({
    'shipSurvivors.capybara': 0,
    'shipUnrest.capybara': 9,
    populationAlerts: { capybara: expect.objectContaining({ population: 0 }) },
    unrestAlerts: { capybara: expect.objectContaining({ targetGmInstanceIds: ['gm1', 'gm2'] }) },
  }));

  mock.population = 0;
  mock.update.mockReset();
  await expect(adjustShipPopulation.run(request({ ...data, requestId: 'already-zero' })))
    .rejects.toMatchObject({ code: 'failed-precondition' });
  expect(mock.update).not.toHaveBeenCalled();
});

it('rejects an off-track population value without writing the session', async () => {
  mock.shipId = 'dione';
  mock.population = 95500;

  await expect(adjustShipPopulation.run(request({ ...data, shipId: 'dione' })))
    .rejects.toMatchObject({ code: 'failed-precondition' });
  expect(mock.update).not.toHaveBeenCalled();
});
it('preserves the other GM acknowledgement and does not alter unrest', async () => {
  mock.alerts = { capybara: { shipId: 'capybara', population: 15000, targetGmInstanceIds: ['gm1','gm2'] } };
  await dismissPopulationAlert.run(request(data));
  expect(mock.update).toHaveBeenCalledWith('sessions/s1', expect.objectContaining({
    populationAlerts: { capybara: { shipId: 'capybara', population: 15000, targetGmInstanceIds: ['gm2'] } }, updatedAt: 'server-time',
    'vesselActionRevisions.capybara': 1,
  }));
});
it('blocks advancing while a threshold is awaiting acknowledgement', async () => {
  mock.alerts = { capybara: { targetGmInstanceIds: ['gm1'] } };
  await expect(adjustShipPopulation.run(request(data))).rejects.toMatchObject({ code: 'failed-precondition' });
  expect(mock.update).not.toHaveBeenCalled();
});
it('rejects population changes after pursuit failure without writing', async () => {
  mock.phase = 'failure';
  await expect(adjustShipPopulation.run(request({ ...data, requestId: 'terminal-population' })))
    .rejects.toMatchObject({ code: 'failed-precondition', message: expect.stringMatching(/endgame evaluation/i) });
  expect(mock.update).not.toHaveBeenCalled();
});
