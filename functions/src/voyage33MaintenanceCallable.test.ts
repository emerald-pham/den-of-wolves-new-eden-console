import { beforeEach, expect, it, vi } from 'vitest';
import type { CallableRequest } from 'firebase-functions/v2/https';
import { emptyVoyage33MaintenanceState } from './voyage33Maintenance';

const mock = vi.hoisted(() => ({
  get: vi.fn(), update: vi.fn(), set: vi.fn(),
  receipts: {} as Record<string, Record<string, unknown>>,
  session: {} as Record<string, unknown>,
}));

vi.mock('firebase-admin/app', () => ({ initializeApp: vi.fn() }));
vi.mock('firebase-admin/firestore', () => ({
  getFirestore: () => ({
    doc: (path: string) => path,
    collection: (path: string) => path,
    runTransaction: async (callback: (tx: unknown) => unknown) => callback({
      get: mock.get, update: mock.update, set: mock.set,
    }),
  }),
  FieldValue: { serverTimestamp: () => 'server-time' },
  Timestamp: { now: () => ({ toMillis: () => Date.now() }) },
}));

import { runVoyage33Maintenance } from './index';

function request(data: Record<string, unknown>, uid = 'u1') {
  return { data, auth: { uid } } as CallableRequest<Record<string, unknown>>;
}

function snapshot(fields: Record<string, unknown>, exists = true) {
  return { exists, get: (key: string) => fields[key], ref: { path: 'unused' } };
}

const base = {
  sessionId: 's1', shipId: 'voyage-33-0', instanceId: 'gm1',
  requestId: 'voyage-maint-1', action: 'begin', expectedRevision: 0, expectedDockingRevision: 0,
};

beforeEach(() => {
  mock.session = {
    activeVesselIds: ['aegis'], phase: 'active', currentTurn: 1,
    turnPhase: { turn: 1, airspace: { state: 'restricted' } },
    voyage33Admission: {
      type: 'voyage-admission', sessionId: 's1', id: 'voyage-33-0', status: 'admitted',
      crisisId: 'approach-1', crisisRevision: 2, population: 40_000, unrest: 0, hostShipId: null,
      commitments: { requiresHostDocking: true, hostProvidesResources: true, maintenanceSteps: [1, 2, 3, 4], maxConsoleCharges: 1 },
    },
    voyage33Maintenance: emptyVoyage33MaintenanceState('aegis'),
    shipResources: { aegis: { ore: 0, fuel: 4, food: 8, water: 6, materials: 1, securityTeams: 2 } },
  };
  mock.receipts = {};
  mock.get.mockReset();
  mock.update.mockReset();
  mock.set.mockReset();
  mock.get.mockImplementation(async (path: string) => {
    if (path.includes('/voyage33MaintenanceRequests/')) {
      const fields = mock.receipts[path];
      return fields ? snapshot(fields) : snapshot({}, false);
    }
    if (path.includes('/players/')) return snapshot({ role: 'gm', connected: true });
    if (path.includes('/gmInstances/')) return snapshot({ uid: 'u1', connected: true, lastSeenAt: new Date() });
    return snapshot(mock.session);
  });
});

it('requires the admitted identity and atomically spends a host resource ledger', async () => {
  await expect(runVoyage33Maintenance.run(request(base))).resolves.toMatchObject({
    status: 'committed', shipId: 'voyage-33-0', hostShipId: 'aegis',
    cycle: { step: 1, revision: 1 }, actorUid: 'u1', vesselId: 'voyage-33-0',
  });
  expect(mock.update).toHaveBeenCalledWith('sessions/s1', expect.objectContaining({
    voyage33Maintenance: expect.objectContaining({ id: 'voyage-33-0', hostShipId: 'aegis' }),
  }));
  expect(mock.set).toHaveBeenCalledWith(expect.stringContaining('/voyage33MaintenanceRequests/voyage-maint-1'),
    expect.objectContaining({
      serverRolls: null,
      fingerprint: expect.objectContaining({ expectedDockingRevision: 0 }),
      reply: expect.objectContaining({ status: 'committed' }),
    }));
});

it('replays an exact request without spending the host a second time', async () => {
  await runVoyage33Maintenance.run(request(base));
  const receipt = mock.set.mock.calls.find(([path]) => String(path).includes('/voyage33MaintenanceRequests/'))?.[1] as Record<string, unknown>;
  mock.receipts['sessions/s1/voyage33MaintenanceRequests/voyage-maint-1'] = receipt;
  mock.session.activeVesselIds = ['aegis', 'dione'];
  mock.session.voyage33Maintenance = {
    ...emptyVoyage33MaintenanceState('dione'), dockingRevision: 1, unrest: 8,
    mutiny: { status: 'active', revision: 1, triggerUnrest: 8, triggeredAt: 'now' },
  };
  mock.update.mockReset();
  mock.set.mockReset();
  await expect(runVoyage33Maintenance.run(request(base))).resolves.toMatchObject({ status: 'replayed' });
  expect(mock.update).not.toHaveBeenCalled();
  expect(mock.set).not.toHaveBeenCalled();

  await expect(runVoyage33Maintenance.run(request({
    ...base, requestId: 'voyage-maint-locked', expectedDockingRevision: 1,
  }))).rejects.toMatchObject({
    code: 'failed-precondition', message: expect.stringMatching(/mutiny.*crew captain/i),
  });
  expect(mock.update).not.toHaveBeenCalled();
  expect(mock.set).not.toHaveBeenCalled();
});

it('logs a Voyage 33-0 riot population loss atomically and does not repeat it on replay', async () => {
  const state = emptyVoyage33MaintenanceState('aegis');
  mock.session.voyage33Maintenance = {
    ...state, population: 10_000, unrest: 10,
    mutiny: {
      status: 'resolved', revision: 1, triggerUnrest: 8, triggeredAt: 'earlier',
      resolvedAt: 'earlier', reduction: 2,
    },
    cycle: { ...state.cycle, step: 3, revision: 3, turn: 1 },
  };
  const riot = { ...base, action: 'riot', expectedRevision: 3, requestId: 'voyage-riot' };
  const result = await runVoyage33Maintenance.run(request(riot));
  const population = (result as { result: { state: { population: number } } }).result.state.population;
  const pressWrites = mock.set.mock.calls.filter(([path]) => String(path).includes('/pressLog/'));
  expect(pressWrites).toHaveLength(1);
  expect(pressWrites[0]?.[1]).toMatchObject({
    type: 'survivor-change', sourceId: 'voyage-33-maintenance:voyage-riot',
    cause: 'voyage-33-maintenance', vesselId: 'voyage-33-0', cycle: 1,
    fromPopulation: 10_000, toPopulation: population,
  });
  expect(pressWrites[0]?.[1]).not.toHaveProperty('actorUid');

  const receiptPath = 'sessions/s1/voyage33MaintenanceRequests/voyage-riot';
  mock.receipts[receiptPath] = mock.set.mock.calls.find(([path]) => path === receiptPath)?.[1] as Record<string, unknown>;
  mock.set.mockReset();
  mock.update.mockReset();
  await expect(runVoyage33Maintenance.run(request(riot))).resolves.toMatchObject({ status: 'replayed' });
  expect(mock.update).not.toHaveBeenCalled();
  expect(mock.set).not.toHaveBeenCalled();
});

it('returns a stale result before reading a new host ledger when docking changed at the same cycle revision', async () => {
  mock.session.activeVesselIds = ['aegis', 'dione'];
  mock.session.voyage33Maintenance = { ...emptyVoyage33MaintenanceState('dione'), dockingRevision: 1 };
  Object.defineProperty(mock.session, 'shipResources', {
    configurable: true,
    get: () => { throw new Error('host ledger read before docking CAS'); },
  });
  await expect(runVoyage33Maintenance.run(request(base))).resolves.toMatchObject({
    status: 'stale', expectedDockingRevision: 0, currentDockingRevision: 1, currentRevision: 0,
  });
  expect(mock.update).not.toHaveBeenCalled();
  expect(mock.set).toHaveBeenCalledWith(expect.stringContaining('/voyage33MaintenanceRequests/voyage-maint-1'),
    expect.objectContaining({ reply: expect.objectContaining({ status: 'stale', currentDockingRevision: 1 }) }));
});

it('returns a stale result for a changed maintenance cycle and rejects a docking revision conflict', async () => {
  const state = emptyVoyage33MaintenanceState('aegis');
  mock.session.voyage33Maintenance = {
    ...state, cycle: { ...state.cycle, revision: 1, step: 1 },
  };
  await expect(runVoyage33Maintenance.run(request(base))).resolves.toMatchObject({
    status: 'stale', expectedRevision: 0, currentRevision: 1, currentDockingRevision: 0,
  });
  mock.receipts['sessions/s1/voyage33MaintenanceRequests/voyage-maint-1'] =
    mock.set.mock.calls.find(([path]) => String(path).includes('/voyage33MaintenanceRequests/'))?.[1] as Record<string, unknown>;
  await expect(runVoyage33Maintenance.run(request({ ...base, expectedDockingRevision: 1 })))
    .rejects.toMatchObject({ code: 'failed-precondition' });
});

it('rejects maintenance when admission or the host-backed state is missing', async () => {
  delete mock.session.voyage33Admission;
  await expect(runVoyage33Maintenance.run(request(base))).rejects.toMatchObject({ code: 'failed-precondition' });
  mock.session.voyage33Admission = { status: 'admitted' };
  mock.session.voyage33Maintenance = emptyVoyage33MaintenanceState(null);
  await expect(runVoyage33Maintenance.run(request({ ...base, requestId: 'voyage-maint-2' })))
    .rejects.toMatchObject({ code: 'failed-precondition' });
});

it('rejects fresh maintenance without an authoritative phase clock before writes', async () => {
  delete mock.session.turnPhase;

  await expect(runVoyage33Maintenance.run(request({
    ...base, requestId: 'missing-phase-clock',
  }))).rejects.toMatchObject({
    code: 'failed-precondition',
    message: expect.stringMatching(/no current server phase/i),
  });
  expect(mock.update).not.toHaveBeenCalled();
  expect(mock.set).not.toHaveBeenCalled();
});
