import { beforeEach, expect, it, vi } from 'vitest';
import type { CallableRequest } from 'firebase-functions/v2/https';
import { emptySmallShipState } from './smallShip';

const mock = vi.hoisted(() => ({
  get: vi.fn(), update: vi.fn(), set: vi.fn(),
  role: 'gm', owner: 'u1', connected: true,
  session: {} as Record<string, unknown>,
  receipts: {} as Record<string, Record<string, unknown>>,
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

import { runSmallShipMaintenance, setSmallShipDocking } from './index';

function request(data: Record<string, unknown>, uid = 'u1') {
  return { data, auth: { uid } } as CallableRequest<Record<string, unknown>>;
}

function snapshot(fields: Record<string, unknown>, exists = true) {
  return { exists, get: (key: string) => fields[key] };
}

const dockingBase = {
  sessionId: 's1', smallShipId: 'gorgoneion', hostShipId: 'aegis', docked: true,
  instanceId: 'gm1', requestId: 'dock-1', expectedRevision: 0,
};

const maintenanceBase = {
  sessionId: 's1', smallShipId: 'gorgoneion', instanceId: 'gm1',
  requestId: 'maint-1', action: 'begin', expectedRevision: 0,
};

beforeEach(() => {
  mock.role = 'gm';
  mock.owner = 'u1';
  mock.connected = true;
  mock.session = {
    activeVesselIds: ['aegis'], phase: 'active', currentTurn: 1,
    expansion: 'base', capybaraEnabled: true,
    shipResources: {
      aegis: { ore: 0, fuel: 4, food: 8, water: 6, materials: 1, securityTeams: 2 },
    },
    smallShipStates: {},
  };
  mock.receipts = {};
  mock.get.mockReset();
  mock.update.mockReset();
  mock.set.mockReset();
  mock.get.mockImplementation(async (path: string) => {
    if (path.includes('/smallShipRequests/')) {
      const fields = mock.receipts[path];
      return fields ? snapshot(fields) : snapshot({}, false);
    }
    if (path.includes('/players/')) {
      return snapshot({ role: mock.role, connected: mock.connected });
    }
    if (path.includes('/gmInstances/')) {
      return snapshot({ uid: mock.owner, connected: mock.connected, lastSeenAt: new Date() });
    }
    return snapshot(mock.session);
  });
});

it('atomically docks a known small ship with an active core host', async () => {
  await expect(setSmallShipDocking.run(request(dockingBase))).resolves.toMatchObject({
    status: 'committed', smallShipId: 'gorgoneion', hostShipId: 'aegis', committedRevision: 1,
    actorUid: 'u1', actorRoleId: null, vesselId: 'gorgoneion',
    turn: 1, phase: 'active', revision: 1, idempotencyKey: 'dock-1',
    auditId: 'small-ship-docking-dock-1',
  });
  expect(mock.update).toHaveBeenCalledWith('sessions/s1', expect.objectContaining({
    'smallShipStates.gorgoneion': expect.objectContaining({ hostShipId: 'aegis', dockingRevision: 1 }),
  }));
});

it('keeps legacy sessions on the base Capybara mode when expansion is absent', async () => {
  delete mock.session.expansion;
  await expect(setSmallShipDocking.run(request({
    ...dockingBase, smallShipId: 'capybara-small', requestId: 'dock-legacy-base',
  }))).resolves.toMatchObject({ status: 'committed', smallShipId: 'capybara-small' });
});

it('rejects arbitrary hosts, non-GM docking, and malformed present state', async () => {
  await expect(setSmallShipDocking.run(request({ ...dockingBase, hostShipId: 'capybara', requestId: 'dock-bad-host' })))
    .rejects.toMatchObject({ code: 'failed-precondition' });
  mock.role = 'player';
  await expect(setSmallShipDocking.run(request({ ...dockingBase, requestId: 'dock-player' })))
    .rejects.toMatchObject({ code: 'permission-denied' });
  mock.role = 'gm';
  mock.session.smallShipStates = { gorgoneion: { ...emptySmallShipState('gorgoneion'), population: 'spoofed' } };
  await expect(setSmallShipDocking.run(request({ ...dockingBase, requestId: 'dock-malformed' })))
    .rejects.toMatchObject({ code: 'failed-precondition' });
  expect(mock.update).not.toHaveBeenCalled();
});

it('does not reveal a stale revision to a non-GM member', async () => {
  mock.role = 'player';
  await expect(setSmallShipDocking.run(request({
    ...dockingBase, expectedRevision: 4, requestId: 'dock-stale-player',
  }))).rejects.toMatchObject({ code: 'permission-denied' });
  expect(mock.set).not.toHaveBeenCalled();
});

it('replays an undock with its explicit null host target', async () => {
  mock.session.smallShipStates = {
    gorgoneion: { ...emptySmallShipState('gorgoneion', 'aegis'), dockingRevision: 1 },
  };
  const undock = {
    ...dockingBase, docked: false, hostShipId: null, expectedRevision: 1,
    requestId: 'dock-undock',
  };
  await expect(setSmallShipDocking.run(request(undock))).resolves.toMatchObject({
    status: 'committed', docked: false, hostShipId: null, committedRevision: 2,
  });
  const receiptPath = 'sessions/s1/smallShipRequests/dock-undock';
  const receipt = mock.set.mock.calls.find(([path]) => path === receiptPath)?.[1] as Record<string, unknown>;
  mock.receipts[receiptPath] = receipt;
  mock.session.smallShipStates = {
    gorgoneion: { ...emptySmallShipState('gorgoneion'), dockingRevision: 2 },
  };
  mock.session.turnPhase = {
    turn: 1,
    teamPhaseEndsAt: '2026-09-12T17:00:00.000Z',
    openAirspaceEndsAt: '2026-09-12T18:00:00.000Z',
    airspace: { state: 'restricted', tickerActive: true, pressAccess: false },
  };
  mock.set.mockReset();
  await expect(setSmallShipDocking.run(request(undock))).resolves.toMatchObject({ status: 'replayed', docked: false });
  expect(mock.set).not.toHaveBeenCalled();
});

it('runs maintenance against only the docked host ledger and persists a replay receipt', async () => {
  mock.session.smallShipStates = { gorgoneion: emptySmallShipState('gorgoneion', 'aegis') };
  await expect(runSmallShipMaintenance.run(request(maintenanceBase))).resolves.toMatchObject({
    status: 'committed', action: 'begin', committedRevision: 1,
  });
  expect(mock.update).toHaveBeenCalledWith('sessions/s1', expect.objectContaining({
    'smallShipStates.gorgoneion': expect.objectContaining({ hostShipId: 'aegis', cycle: expect.objectContaining({ step: 1 }) }),
    'shipResources.aegis': expect.objectContaining({ food: 8, water: 6 }),
  }));
  const receiptCall = mock.set.mock.calls.find(([path]) => String(path).includes('/smallShipRequests/'));
  expect(receiptCall?.[1]).toEqual(expect.objectContaining({ reply: expect.objectContaining({ status: 'committed' }) }));
});

it('replays a completed command before rechecking mutable host authority', async () => {
  mock.session.smallShipStates = { gorgoneion: emptySmallShipState('gorgoneion', 'aegis') };
  await runSmallShipMaintenance.run(request(maintenanceBase));
  const receiptPath = 'sessions/s1/smallShipRequests/maint-1';
  const receipt = mock.set.mock.calls.find(([path]) => path === receiptPath)?.[1] as Record<string, unknown>;
  mock.receipts[receiptPath] = receipt;
  mock.session.smallShipStates = {};
  mock.update.mockReset();
  mock.set.mockReset();
  await expect(runSmallShipMaintenance.run(request(maintenanceBase))).resolves.toMatchObject({ status: 'replayed' });
  expect(mock.update).not.toHaveBeenCalled();
  expect(mock.set).not.toHaveBeenCalled();
});

it('returns stale without consuming the host ledger', async () => {
  const baseState = emptySmallShipState('gorgoneion', 'aegis');
  const state = { ...baseState, cycle: { ...baseState.cycle, revision: 1 } };
  mock.session.smallShipStates = { gorgoneion: state };
  await expect(runSmallShipMaintenance.run(request(maintenanceBase))).resolves.toMatchObject({
    status: 'stale', currentRevision: 1,
  });
  expect(mock.update).not.toHaveBeenCalled();
});

it('runs base Capybara production atomically against the host with authority, replay, stale, and resource guards', async () => {
  const baseState = emptySmallShipState('capybara-small', 'aegis');
  const productionState = {
    ...baseState,
    cycle: {
      ...baseState.cycle, step: 5, revision: 5, turn: 1,
      charges: ['water-reclimator', 'hydroponics'],
    },
  };
  mock.session = {
    activeVesselIds: ['aegis'], phase: 'active', currentTurn: 1,
    expansion: 'base', capybaraEnabled: true,
    shipResources: {
      aegis: { ore: 0, fuel: 4, food: 3, water: 2, materials: 1, securityTeams: 2 },
    },
    smallShipStates: { 'capybara-small': productionState },
  };
  const waterRequest = {
    ...maintenanceBase, smallShipId: 'capybara-small', action: 'production',
    expectedRevision: 5, requestId: 'capybara-small-water', productionConsoleId: 'water-reclimator',
  };
  await expect(runSmallShipMaintenance.run(request(waterRequest))).resolves.toMatchObject({
    status: 'committed', action: 'production', committedRevision: 6,
    result: { hostResources: { food: 3, water: 6 } },
    cycle: { step: 5, charges: ['hydroponics'], results: { '5': expect.stringContaining('generated 4 water') } },
  });
  expect(mock.update).toHaveBeenCalledWith('sessions/s1', expect.objectContaining({
    'shipResources.aegis': expect.objectContaining({ food: 3, water: 6 }),
  }));

  const receiptPath = 'sessions/s1/smallShipRequests/capybara-small-water';
  const receipt = mock.set.mock.calls.find(([path]) => path === receiptPath)?.[1] as Record<string, unknown>;
  mock.receipts[receiptPath] = receipt;
  mock.update.mockReset();
  mock.set.mockReset();
  await expect(runSmallShipMaintenance.run(request(waterRequest))).resolves.toMatchObject({ status: 'replayed' });
  expect(mock.update).not.toHaveBeenCalled();
  expect(mock.set).not.toHaveBeenCalled();

  mock.session.smallShipStates = {
    'capybara-small': {
      ...productionState,
      cycle: { ...productionState.cycle, revision: 6, charges: ['hydroponics'] },
    },
  };
  mock.session.shipResources = {
    aegis: { ore: 0, fuel: 4, food: 3, water: 6, materials: 1, securityTeams: 2 },
  };
  mock.update.mockReset();
  await expect(runSmallShipMaintenance.run(request({
    ...waterRequest, requestId: 'capybara-small-hydroponics', expectedRevision: 6,
    productionConsoleId: 'hydroponics',
  }))).resolves.toMatchObject({
    status: 'committed', committedRevision: 7,
    result: { hostResources: { food: 7, water: 5 } },
    cycle: { step: 5, charges: [], results: { '5': expect.stringContaining('generated 4 food') } },
  });
  expect(mock.update).toHaveBeenCalledWith('sessions/s1', expect.objectContaining({
    'shipResources.aegis': expect.objectContaining({ food: 7, water: 5 }),
  }));

  mock.session.smallShipStates = {
    'capybara-small': {
      ...productionState,
      cycle: { ...productionState.cycle, revision: 7, charges: [] },
    },
  };
  mock.session.shipResources = {
    aegis: { ore: 0, fuel: 4, food: 7, water: 5, materials: 1, securityTeams: 2 },
  };
  mock.update.mockReset();
  await expect(runSmallShipMaintenance.run(request({
    ...waterRequest, requestId: 'capybara-small-stale', expectedRevision: 5,
    productionConsoleId: 'hydroponics',
  }))).resolves.toMatchObject({ status: 'stale', currentRevision: 7 });
  expect(mock.update).not.toHaveBeenCalled();

  mock.set.mockReset();
  mock.session.smallShipStates = {
    'capybara-small': {
      ...productionState,
      cycle: { ...productionState.cycle, revision: 6, charges: ['hydroponics'] },
    },
  };
  mock.session.shipResources = {
    aegis: { ore: 0, fuel: 4, food: 3, water: 0, materials: 1, securityTeams: 2 },
  };
  await expect(runSmallShipMaintenance.run(request({
    ...waterRequest, requestId: 'capybara-small-no-water', expectedRevision: 6,
    productionConsoleId: 'hydroponics',
  }))).rejects.toMatchObject({ code: 'failed-precondition' });
  expect(mock.update).not.toHaveBeenCalled();

  mock.role = 'player';
  await expect(runSmallShipMaintenance.run(request({
    ...waterRequest, requestId: 'capybara-small-wrong-actor', expectedRevision: 6,
    productionConsoleId: 'hydroponics',
  }))).rejects.toMatchObject({ code: 'permission-denied' });
  expect(mock.update).not.toHaveBeenCalled();

  mock.role = 'gm';
  mock.session.expansion = 'capybara';
  await expect(runSmallShipMaintenance.run(request({
    ...waterRequest, requestId: 'capybara-small-expansion', expectedRevision: 6,
    productionConsoleId: 'hydroponics',
  }))).rejects.toMatchObject({ code: 'failed-precondition' });
  expect(mock.update).not.toHaveBeenCalled();
});
