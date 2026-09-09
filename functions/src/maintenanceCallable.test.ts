import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { CallableRequest } from 'firebase-functions/v2/https';

const mock = vi.hoisted(() => ({
  get: vi.fn(), update: vi.fn(), set: vi.fn(), role: 'gm', owner: 'u1', connected: true,
  damage: {} as Record<string, unknown>, currentTurn: 1, maintenanceCycles: {} as Record<string, unknown>, retry: false,
  shuttleFuelled: {} as Record<string, boolean>,
  shipSurvivors: {} as Record<string, number>, capybaraEnabled: true, dioneEnabled: true,
  fleetSurvivorPopulationAdjustment: 0,
  turnStartAnnouncement: undefined as unknown,
  turnPhase: undefined as unknown, pressDispatch: undefined as unknown,
  race: undefined as {
    attempts: number;
    ready: Promise<void>;
    release: () => void;
    version: number;
  } | undefined,
  pressEnabled: true,
  activeConsoleRoleId: undefined as string | undefined,
  activeRoleIds: undefined as readonly string[] | undefined,
  randomInt: vi.fn(() => 3_100_000_000), randomUUID: vi.fn(() => 'damage-event'),
}));
vi.mock('node:crypto', () => ({ randomInt: mock.randomInt, randomUUID: mock.randomUUID }));
vi.mock('firebase-admin/app', () => ({ initializeApp: vi.fn() }));
vi.mock('firebase-admin/firestore', () => ({
  getFirestore: () => ({
    doc: (path: string) => path,
    collection: (path: string) => path,
    runTransaction: async (callback: (tx: unknown) => unknown) => {
      if (mock.race) {
        const race = mock.race;
        for (let attempt = 0; attempt < 3; attempt += 1) {
          const baseVersion = race.version;
          const snapshotTurnPhase = mock.turnPhase;
          const updates: Array<readonly [string, Record<string, unknown>]> = [];
          const sets: Array<readonly [string, Record<string, unknown>]> = [];
          const tx = {
            get: async (path: string) => {
              const fields: Record<string, unknown> = path.includes('/players/')
                ? { role: mock.role, connected: mock.connected, activeConsoleRoleId: mock.activeConsoleRoleId }
                : {
                    currentTurn: mock.currentTurn,
                    phase: 'active',
                    turnPhase: snapshotTurnPhase,
                  };
              return { exists: true, get: (key: string) => fields[key] };
            },
            update: (path: string, fields: Record<string, unknown>) => updates.push([path, fields]),
            set: (path: string, fields: Record<string, unknown>) => sets.push([path, fields]),
          };
          const result = await callback(tx);
          race.attempts += 1;
          if (race.attempts === 1) await race.ready;
          else if (race.attempts === 2) race.release();
          if (race.version !== baseVersion) continue;
          for (const [path, fields] of updates) {
            mock.update(path, fields);
            if ('turnPhase' in fields) mock.turnPhase = fields.turnPhase;
          }
          for (const [path, fields] of sets) mock.set(path, fields);
          race.version += 1;
          return result;
        }
        throw new Error('Mock transaction exceeded optimistic retry limit.');
      }
      const tx = { get: mock.get, update: mock.update, set: mock.set };
      if (mock.retry) await callback(tx);
      return callback(tx);
    },
  }),
  FieldValue: { delete: () => 'delete-field', serverTimestamp: () => 'server-time' },
  Timestamp: { now: () => ({ toMillis: () => Date.now() }) },
}));

import {
  advanceTurn,
  beginOpenAirspacePhase,
  extendAirspaceWindow,
  setEmergencyTimerPaused,
  runMaintenance,
  setShipConsoleLock,
  setActiveRoleEnabled,
  setActiveRoleConfiguration,
  setCapybaraEnabled,
  setDioneEnabled,
  unlockPressAirspace,
} from './index';
import { recommendedRoleIds } from './roleConfiguration';

function request(data: Record<string, unknown>, uid = 'u1') {
  return { data, auth: { uid } } as CallableRequest<{
    sessionId: string; shipId: string; instanceId: string; action: string; expectedRevision: number;
  }>;
}

beforeEach(() => {
  mock.role = 'gm';
  mock.owner = 'u1';
  mock.connected = true;
  mock.damage = {};
  mock.currentTurn = 1;
  mock.maintenanceCycles = {};
  mock.shuttleFuelled = {};
  mock.shipSurvivors = {};
  mock.capybaraEnabled = true;
  mock.dioneEnabled = true;
  mock.fleetSurvivorPopulationAdjustment = 0;
  mock.turnStartAnnouncement = undefined;
  mock.turnPhase = undefined;
  mock.race = undefined;
  mock.pressDispatch = undefined;
  mock.pressEnabled = true;
  mock.activeConsoleRoleId = undefined;
  mock.activeRoleIds = undefined;
  mock.retry = false;
  mock.randomInt.mockReset();
  mock.randomInt.mockReturnValue(3_100_000_000);
  mock.randomUUID.mockReset();
  mock.randomUUID.mockReturnValue('damage-event');
  mock.update.mockReset();
  mock.set.mockReset();
  mock.get.mockImplementation(async (path: string) => {
    const fields: Record<string, unknown> = path.includes('/players/')
      ? {
          role: mock.role, connected: mock.connected,
          activeConsoleRoleId: mock.activeConsoleRoleId,
        }
      : path.includes('/gmInstances/')
        ? { uid: mock.owner }
        : {
          shipDamage: mock.damage,
          currentTurn: mock.currentTurn,
          maintenanceCycles: mock.maintenanceCycles,
          shuttleFuelled: mock.shuttleFuelled,
          shipSurvivors: mock.shipSurvivors,
          fleetSurvivorPopulationAdjustment: mock.fleetSurvivorPopulationAdjustment,
          turnStartAnnouncement: mock.turnStartAnnouncement,
          capybaraEnabled: mock.capybaraEnabled,
          dioneEnabled: mock.dioneEnabled,
          turnPhase: mock.turnPhase,
          pressDispatch: mock.pressDispatch,
          pressEnabled: mock.pressEnabled,
          activeRoleIds: mock.activeRoleIds,
        };
    return { exists: true, get: (key: string) => fields[key] };
  });
});
afterEach(() => vi.useRealTimers());
it('rejects a second maintenance cycle in the same turn', async () => {
  mock.maintenanceCycles = {
    aegis: { step: 0, revision: 8, turn: 1, results: {}, charges: [], refuelled: [] },
  };
  await expect(runMaintenance.run(request({ ...data, expectedRevision: 8 })))
    .rejects.toMatchObject({ code: 'failed-precondition', message: expect.stringMatching(/once per turn/i) });
  expect(mock.update).not.toHaveBeenCalled();
});

const data = { sessionId: 's1', shipId: 'aegis', instanceId: 'bridge', action: 'begin', expectedRevision: 0 };


it('begins maintenance atomically with a server-owned revision', async () => {
  await expect(runMaintenance.run(request(data))).resolves.toMatchObject({ step: 1, revision: 1 });
  expect(mock.update).toHaveBeenCalledWith('sessions/s1', expect.objectContaining({
    'maintenanceCycles.aegis': expect.objectContaining({ step: 1, revision: 1 }),
  }));
});
it('rejects Team maintenance while the server phase is Coordination', async () => {
  mock.turnPhase = {
    turn: 1,
    airspace: { state: 'lifted', tickerActive: false, pressAccess: false },
  };
  await expect(runMaintenance.run(request(data))).rejects.toMatchObject({
    code: 'failed-precondition',
    message: expect.stringMatching(/team phase/i),
  });
  expect(mock.update).not.toHaveBeenCalled();
});
it('denies unauthenticated, disconnected, unassigned players and foreign GM instances', async () => {
  mock.connected = false;
  await expect(runMaintenance.run(request(data))).rejects.toMatchObject({ code: 'permission-denied' });
  mock.connected = true; mock.role = 'player';
  await expect(runMaintenance.run(request(data))).rejects.toMatchObject({ code: 'permission-denied' });
  mock.role = 'gm'; mock.owner = 'someone-else';
  await expect(runMaintenance.run(request(data))).rejects.toMatchObject({ code: 'permission-denied' });
  expect(mock.update).not.toHaveBeenCalled();
});
it('rejects invalid steps and client-supplied dice', async () => {
  await expect(runMaintenance.run(request({ ...data, action: 'riot' }))).rejects.toMatchObject({ code: 'failed-precondition' });
  await expect(runMaintenance.run(request({ ...data, rolls: [6, 6] }))).rejects.toMatchObject({ code: 'invalid-argument' });
  expect(mock.update).not.toHaveBeenCalled();
});

it('rejects observer authority even if a prior console role remains stored', async () => {
  mock.get.mockImplementation(async () => ({ exists: true, get: (key: string) => ({ connected: true, role: 'observer', activeConsoleRoleId: 'admiral' } as Record<string, unknown>)[key] }));
  await expect(runMaintenance.run(request(data))).rejects.toMatchObject({ code: 'permission-denied' });
  expect(mock.update).not.toHaveBeenCalled();
});
it('allows a ship officer and assigned joint engineer, but denies another ship', async () => {
  mock.activeRoleIds = recommendedRoleIds(14);
  mock.get.mockImplementation(async (path: string) => ({
    exists: true,
    get: (key: string) => path.includes('/players/')
      ? ({ connected: true, role: 'player', activeConsoleRoleId: 'joint-engineering-quellon-refinery' } as Record<string, unknown>)[key]
      : ({ activeRoleIds: mock.activeRoleIds } as Record<string, unknown>)[key],
  }));
  await expect(runMaintenance.run(request({ ...data, shipId: 'quellon' }))).resolves.toMatchObject({ step: 1 });
  await expect(runMaintenance.run(request({ ...data, shipId: 'shepherd' }))).rejects.toMatchObject({ code: 'permission-denied' });
});

it('accepts the paired Joint Engineering console identity for its maintenance workspace', async () => {
  mock.activeRoleIds = recommendedRoleIds(14);
  mock.get.mockImplementation(async (path: string) => ({
    exists: true,
    get: (key: string) => path.includes('/players/')
      ? ({ connected: true, role: 'player', activeConsoleRoleId: 'joint-engineering-quellon-refinery' } as Record<string, unknown>)[key]
      : ({ activeRoleIds: mock.activeRoleIds } as Record<string, unknown>)[key],
  }));

  await expect(runMaintenance.run(request({
    ...data,
    shipId: 'quellon',
    consoleRoleId: 'joint-engineering-quellon-refinery',
  }))).resolves.toMatchObject({ step: 1 });
  await expect(runMaintenance.run(request({
    ...data,
    shipId: 'shepherd',
    consoleRoleId: 'joint-engineering-quellon-refinery',
  }))).rejects.toMatchObject({ code: 'invalid-argument' });
});

it('revokes maintenance when the assigned ship role is removed from the live roster', async () => {
  mock.role = 'player';
  mock.activeConsoleRoleId = 'dione-engineer';
  mock.activeRoleIds = ['dione-captain'];

  await expect(runMaintenance.run(request({
    ...data,
    shipId: 'dione',
    consoleRoleId: 'dione-engineer',
  }))).rejects.toMatchObject({ code: 'permission-denied' });
  expect(mock.update).not.toHaveBeenCalled();
});

it('does not let a GM add a Union role alongside the engineers it replaces', async () => {
  await expect(setActiveRoleEnabled.run(request({
    sessionId: 's1',
    instanceId: 'bridge',
    roleId: 'joint-engineering-quellon-refinery',
    enabled: true,
  }))).rejects.toMatchObject({ code: 'failed-precondition' });
  expect(mock.update).not.toHaveBeenCalled();
});

it('retires the partial role configuration callable and preserves invalid-combination denial', async () => {
  const validRoleIds = recommendedRoleIds(14);
  await expect(setActiveRoleConfiguration.run(request({
    sessionId: 's1',
    instanceId: 'bridge',
    activeRoleIds: validRoleIds,
  }))).rejects.toMatchObject({
    code: 'failed-precondition', message: expect.stringMatching(/confirmSetup/i),
  });
  expect(mock.update).not.toHaveBeenCalled();

  await expect(setActiveRoleConfiguration.run(request({
    sessionId: 's1',
    instanceId: 'bridge',
    activeRoleIds: [
      'admiral',
      'joint-engineering-quellon-refinery',
      'quellon-engineer',
    ],
  }))).rejects.toMatchObject({ code: 'failed-precondition' });
  expect(mock.update).not.toHaveBeenCalled();
});

it('retires every legacy setup mutator behind the complete confirmSetup transaction', async () => {
  const commands = [
    () => setActiveRoleEnabled.run(request({
      sessionId: 's1', instanceId: 'bridge', roleId: 'admiral', enabled: false,
    })),
    () => setActiveRoleConfiguration.run(request({
      sessionId: 's1', instanceId: 'bridge', activeRoleIds: recommendedRoleIds(14),
    })),
    () => import('./index').then(({ applyRolePreset }) => applyRolePreset.run(request({
      sessionId: 's1', instanceId: 'bridge', playerCount: 14,
    }))),
    () => setCapybaraEnabled.run(request({
      sessionId: 's1', instanceId: 'bridge', capybaraEnabled: false,
    })),
    () => setDioneEnabled.run(request({
      sessionId: 's1', instanceId: 'bridge', dioneEnabled: false,
    })),
  ];

  for (const command of commands) {
    await expect(command()).rejects.toMatchObject({
      code: 'failed-precondition', message: expect.stringMatching(/confirmSetup/i),
    });
  }
  expect(mock.update).not.toHaveBeenCalled();
});

it('starts Turn 1 with a ten-minute team phase and later turns with the shorter real-time schedule', async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-09-06T12:00:00.000Z'));
  mock.currentTurn = 0;
  mock.capybaraEnabled = false;
  mock.shipSurvivors = {
    aegis: 1_000,
    dione: 90_000,
    icebreaker: 30_000,
    capybara: 20_000,
    shepherd: 20_000,
    quellon: 10_000,
    'refinery-124': 5_000,
  };
  await expect(advanceTurn.run(request({
    sessionId: 's1', instanceId: 'bridge', expectedTurn: 0,
  }))).resolves.toEqual({
    currentTurn: 1,
    turnStartAnnouncement: { turn: 1, survivorPopulation: 156_042 },
    turnPhase: {
      turn: 1,
      teamPhaseEndsAt: '2026-09-06T12:10:00.000Z',
      openAirspaceEndsAt: '2026-09-06T12:30:00.000Z',
      airspace: { state: 'restricted', tickerActive: true, pressAccess: false },
    },
  });
  expect(mock.update).toHaveBeenCalledWith('sessions/s1', expect.objectContaining({
    currentTurn: 1,
    turnStartAnnouncement: { turn: 1, survivorPopulation: 156_042 },
    fleetSurvivorPopulationAdjustment: 41,
    turnPhase: {
      turn: 1,
      teamPhaseEndsAt: '2026-09-06T12:10:00.000Z',
      openAirspaceEndsAt: '2026-09-06T12:30:00.000Z',
      airspace: { state: 'restricted', tickerActive: true, pressAccess: false },
    },
  }));

  mock.currentTurn = 1;
  mock.fleetSurvivorPopulationAdjustment = 41;
  mock.turnPhase = {
    turn: 1,
    teamPhaseEndsAt: '2026-09-06T12:10:00.000Z',
    openAirspaceEndsAt: '2026-09-06T12:30:00.000Z',
    airspace: { state: 'restricted', tickerActive: true, pressAccess: false },
  };
  mock.update.mockClear();
  await expect(advanceTurn.run(request({
    sessionId: 's1', instanceId: 'bridge', expectedTurn: 1,
  }))).rejects.toMatchObject({ code: 'failed-precondition', message: expect.stringMatching(/timer/i) });
  expect(mock.update).not.toHaveBeenCalled();

  await expect(advanceTurn.run(request({
    sessionId: 's1', instanceId: 'bridge', expectedTurn: 1, overridePhaseTimer: true,
  }))).resolves.toEqual({
    currentTurn: 2,
    turnStartAnnouncement: { turn: 2, survivorPopulation: 156_041 },
    maintenanceCycles: {},
    shuttleFuelled: {},
    turnPhase: {
      turn: 2,
      teamPhaseEndsAt: '2026-09-06T12:05:00.000Z',
      openAirspaceEndsAt: '2026-09-06T12:20:00.000Z',
      airspace: { state: 'restricted', tickerActive: true, pressAccess: false },
    },
  });
  expect(mock.update).toHaveBeenCalledWith('sessions/s1', expect.objectContaining({
    currentTurn: 2,
    turnStartAnnouncement: { turn: 2, survivorPopulation: 156_041 },
    fleetSurvivorPopulationAdjustment: 40,
    turnPhase: expect.objectContaining({ turn: 2 }),
  }));

  await expect(advanceTurn.run(request({
    sessionId: 's1', instanceId: 'bridge', expectedTurn: 0,
  }))).rejects.toMatchObject({ code: 'failed-precondition' });
});

it('expires charged consoles and shuttle fuel when a numbered turn hands off', async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-09-06T12:20:00.000Z'));
  mock.currentTurn = 2;
  mock.maintenanceCycles = {
    aegis: {
      step: 0,
      revision: 8,
      turn: 2,
      results: { '7': 'Maintenance cycle complete.' },
      charges: ['jump-drive', 'fighter-bay-alpha'],
      refuelled: ['starlight'],
      completedAt: '2026-09-06T12:10:00.000Z',
    },
  };
  mock.shuttleFuelled = { starlight: true, pallas: false };
  mock.turnPhase = {
    turn: 2,
    teamPhaseEndsAt: '2026-09-06T12:05:00.000Z',
    openAirspaceEndsAt: '2026-09-06T12:20:00.000Z',
    airspace: { state: 'lifted', tickerActive: true, pressAccess: false },
  };

  await expect(advanceTurn.run(request({
    sessionId: 's1', instanceId: 'bridge', expectedTurn: 2,
  }))).resolves.toMatchObject({ currentTurn: 3 });

  expect(mock.update).toHaveBeenCalledWith('sessions/s1', expect.objectContaining({
    maintenanceCycles: {
      aegis: expect.objectContaining({
        step: 0,
        revision: 8,
        charges: [],
        refuelled: [],
      }),
    },
    shuttleFuelled: { starlight: false, pallas: false },
  }));
  const patch = mock.update.mock.calls.at(-1)?.[1] as Record<string, unknown>;
  expect(patch).not.toHaveProperty('shuttleDockings');
  expect(patch).not.toHaveProperty('shuttleCargo');
  expect(patch).not.toHaveProperty('shipResources');
});

it('keeps the authoritative fleet total non-negative when a turn begins at zero', async () => {
  mock.currentTurn = 0;
  mock.capybaraEnabled = false;
  mock.shipSurvivors = {
    aegis: 1_000,
    dione: 90_000,
    icebreaker: 30_000,
    capybara: 20_000,
    shepherd: 20_000,
    quellon: 10_000,
    'refinery-124': 5_000,
  };
  mock.fleetSurvivorPopulationAdjustment = -156_000;

  await expect(advanceTurn.run(request({
    sessionId: 's1', instanceId: 'bridge', expectedTurn: 0,
  }))).resolves.toMatchObject({
    turnStartAnnouncement: { turn: 1, survivorPopulation: 42 },
  });
  expect(mock.update).toHaveBeenCalledWith('sessions/s1', expect.objectContaining({
    fleetSurvivorPopulationAdjustment: -155_959,
  }));
});

it('skips the Turn 1 fullscreen transmission when requested', async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-09-06T12:00:00.000Z'));
  mock.currentTurn = 0;
  mock.turnStartAnnouncement = { turn: 1, survivorPopulation: 156_042 };
  mock.capybaraEnabled = false;
  mock.shipSurvivors = {
    aegis: 1_000,
    dione: 90_000,
    icebreaker: 30_000,
    capybara: 20_000,
    shepherd: 20_000,
    quellon: 10_000,
    'refinery-124': 5_000,
  };

  await expect(advanceTurn.run(request({
    sessionId: 's1', instanceId: 'bridge', expectedTurn: 0,
    skipTurnStartAnnouncement: true,
  }))).resolves.toEqual({
    currentTurn: 1,
    turnPhase: {
      turn: 1,
      teamPhaseEndsAt: '2026-09-06T12:10:00.000Z',
      openAirspaceEndsAt: '2026-09-06T12:30:00.000Z',
      airspace: { state: 'restricted', tickerActive: true, pressAccess: false },
    },
  });
  expect(mock.update).toHaveBeenCalledWith('sessions/s1', expect.objectContaining({
    currentTurn: 1,
    turnStartAnnouncement: 'delete-field',
  }));
});

it('turns the ticker into an open-airspace bulletin after the team timer expires', async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-09-06T12:05:00.000Z'));
  mock.currentTurn = 2;
  mock.turnPhase = {
    turn: 2,
    teamPhaseEndsAt: '2026-09-06T12:05:00.000Z',
    openAirspaceEndsAt: '2026-09-06T12:20:00.000Z',
    airspace: { state: 'restricted', tickerActive: false, pressAccess: true },
  };
  mock.pressDispatch = { dispatches: [{ id: 'earlier', text: 'SNN // Earlier copy' }], revision: 1 };

  await expect(beginOpenAirspacePhase.run(request({
    sessionId: 's1', expectedTurn: 2,
  }))).resolves.toEqual({
    turnPhase: {
      turn: 2,
      teamPhaseEndsAt: '2026-09-06T12:05:00.000Z',
      openAirspaceEndsAt: '2026-09-06T12:20:00.000Z',
      airspace: { state: 'lifted', tickerActive: true, pressAccess: true },
    },
  });
  expect(mock.update).toHaveBeenCalledWith('sessions/s1', expect.objectContaining({
    turnPhase: expect.objectContaining({
      airspace: { state: 'lifted', tickerActive: true, pressAccess: true },
    }),
  }));
});

it('serializes simultaneous airspace expiry observers into one transition event', async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-09-06T12:05:00.000Z'));
  mock.role = 'player';
  mock.activeConsoleRoleId = 'admiral';
  mock.currentTurn = 1;
  mock.turnPhase = {
    turn: 1,
    teamPhaseEndsAt: '2026-09-06T12:05:00.000Z',
    openAirspaceEndsAt: '2026-09-06T12:20:00.000Z',
    airspace: { state: 'restricted', tickerActive: true, pressAccess: false },
  };
  let release!: () => void;
  const ready = new Promise<void>((resolve) => { release = resolve; });
  mock.race = { attempts: 0, ready, release, version: 0 };

  const [first, second] = await Promise.all([
    beginOpenAirspacePhase.run(request({ sessionId: 's1', expectedTurn: 1 }, 'u1')),
    unlockPressAirspace.run(request({ sessionId: 's1' }, 'u2')),
  ]);

  const expected = {
    turn: 1,
    teamPhaseEndsAt: '2026-09-06T12:05:00.000Z',
    openAirspaceEndsAt: '2026-09-06T12:20:00.000Z',
    airspace: { state: 'lifted', tickerActive: true, pressAccess: false },
  };
  expect(first).toEqual({ turnPhase: expected });
  expect(second).toEqual({ turnPhase: expected });
  expect(mock.update).toHaveBeenCalledTimes(1);
  expect(mock.set).toHaveBeenCalledTimes(1);
  expect(mock.set).toHaveBeenCalledWith(
    'sessions/s1/events/airspace-opened-1',
    expect.objectContaining({
      type: 'airspace-opened',
      sessionId: 's1',
      actorUid: 'system',
      turn: 1,
      phase: 'active',
      requestId: 'airspace-opened-1',
      visibility: 'member',
      createdAt: 'server-time',
    }),
  );

  mock.update.mockClear();
  mock.set.mockClear();
  await expect(beginOpenAirspacePhase.run(request({ sessionId: 's1', expectedTurn: 1 }, 'u3')))
    .resolves.toEqual({ turnPhase: expected });
  expect(mock.update).not.toHaveBeenCalled();
  expect(mock.set).not.toHaveBeenCalled();
});

it('lets the active GM add five minutes to a live restricted window', async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-09-06T12:00:00.000Z'));
  mock.currentTurn = 2;
  mock.turnPhase = {
    turn: 2,
    teamPhaseEndsAt: '2026-09-06T12:05:00.000Z',
    openAirspaceEndsAt: '2026-09-06T12:20:00.000Z',
    airspace: { state: 'restricted', tickerActive: true, pressAccess: false },
  };

  await expect(extendAirspaceWindow.run(request({
    sessionId: 's1', instanceId: 'bridge', expectedTurn: 2, window: 'restricted',
  }))).resolves.toEqual({
    turnPhase: {
      turn: 2,
      teamPhaseEndsAt: '2026-09-06T12:10:00.000Z',
      openAirspaceEndsAt: '2026-09-06T12:25:00.000Z',
      airspace: { state: 'restricted', tickerActive: true, pressAccess: false },
    },
  });
  expect(mock.update).toHaveBeenCalledWith('sessions/s1', expect.objectContaining({
    turnPhase: {
      turn: 2,
      teamPhaseEndsAt: '2026-09-06T12:10:00.000Z',
      openAirspaceEndsAt: '2026-09-06T12:25:00.000Z',
      airspace: { state: 'restricted', tickerActive: true, pressAccess: false },
    },
  }));
});

it('lets the active GM add five minutes to a live open window', async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-09-06T12:10:00.000Z'));
  mock.currentTurn = 2;
  mock.turnPhase = {
    turn: 2,
    teamPhaseEndsAt: '2026-09-06T12:05:00.000Z',
    openAirspaceEndsAt: '2026-09-06T12:20:00.000Z',
    airspace: { state: 'lifted', tickerActive: true, pressAccess: false },
  };

  await expect(extendAirspaceWindow.run(request({
    sessionId: 's1', instanceId: 'bridge', expectedTurn: 2, window: 'open',
  }))).resolves.toEqual({
    turnPhase: {
      turn: 2,
      teamPhaseEndsAt: '2026-09-06T12:05:00.000Z',
      openAirspaceEndsAt: '2026-09-06T12:25:00.000Z',
      airspace: { state: 'lifted', tickerActive: true, pressAccess: false },
    },
  });
});

it('rejects stale, inactive-window, and non-GM airspace extensions without writing', async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-09-06T12:00:00.000Z'));
  mock.currentTurn = 2;
  mock.turnPhase = {
    turn: 2,
    teamPhaseEndsAt: '2026-09-06T12:05:00.000Z',
    openAirspaceEndsAt: '2026-09-06T12:20:00.000Z',
    airspace: { state: 'restricted', tickerActive: true, pressAccess: false },
  };

  mock.role = 'player';
  await expect(extendAirspaceWindow.run(request({
    sessionId: 's1', instanceId: 'bridge', expectedTurn: 2, window: 'restricted',
  }))).rejects.toMatchObject({ code: 'permission-denied' });
  mock.role = 'gm';

  await expect(extendAirspaceWindow.run(request({
    sessionId: 's1', instanceId: 'bridge', expectedTurn: 1, window: 'restricted',
  }))).rejects.toMatchObject({ code: 'failed-precondition' });
  await expect(extendAirspaceWindow.run(request({
    sessionId: 's1', instanceId: 'bridge', expectedTurn: 2, window: 'open',
  }))).rejects.toMatchObject({ code: 'failed-precondition' });
  expect(mock.update).not.toHaveBeenCalled();
});

it('lets only the active GM pause and resume a live turn clock with an audit event', async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-09-06T12:02:00.000Z'));
  mock.currentTurn = 2;
  mock.turnPhase = {
    turn: 2,
    teamPhaseEndsAt: '2026-09-06T12:05:00.000Z',
    openAirspaceEndsAt: '2026-09-06T12:20:00.000Z',
    airspace: { state: 'restricted', tickerActive: true, pressAccess: false },
  };
  mock.randomUUID.mockReturnValue('pause-event');

  await expect(setEmergencyTimerPaused.run(request({
    sessionId: 's1', instanceId: 'bridge', expectedTurn: 2, paused: true,
  }))).resolves.toEqual({
    turnPhase: {
      ...mock.turnPhase,
      timerPause: {
        window: 'restricted', remainingMs: 180_000,
        pausedAt: '2026-09-06T12:02:00.000Z',
      },
    },
  });
  expect(mock.update).toHaveBeenCalledWith('sessions/s1', expect.objectContaining({
    turnPhase: expect.objectContaining({
      timerPause: {
        window: 'restricted', remainingMs: 180_000,
        pausedAt: '2026-09-06T12:02:00.000Z',
      },
    }),
  }));
  expect(mock.set).toHaveBeenCalledWith('sessions/s1/events/pause-event', expect.objectContaining({
    type: 'timer-pause', action: 'paused', turn: 2, window: 'restricted',
    actorName: 'GM', createdAt: 'server-time',
  }));

  mock.turnPhase = {
    ...mock.turnPhase!,
    timerPause: {
      window: 'restricted', remainingMs: 180_000,
      pausedAt: '2026-09-06T12:02:00.000Z',
    },
  };
  mock.update.mockClear();
  mock.set.mockClear();
  await expect(setEmergencyTimerPaused.run(request({
    sessionId: 's1', instanceId: 'bridge', expectedTurn: 2, paused: true,
  }))).resolves.toEqual({ turnPhase: mock.turnPhase });
  expect(mock.update).not.toHaveBeenCalled();
  expect(mock.set).not.toHaveBeenCalled();

  vi.setSystemTime(new Date('2026-09-06T12:04:00.000Z'));
  await expect(setEmergencyTimerPaused.run(request({
    sessionId: 's1', instanceId: 'bridge', expectedTurn: 2, paused: false,
  }))).resolves.toEqual({
    turnPhase: {
      turn: 2,
      teamPhaseEndsAt: '2026-09-06T12:07:00.000Z',
      openAirspaceEndsAt: '2026-09-06T12:22:00.000Z',
      airspace: { state: 'restricted', tickerActive: true, pressAccess: false },
    },
  });
  expect(mock.set).toHaveBeenCalledWith('sessions/s1/events/pause-event', expect.objectContaining({
    type: 'timer-pause', action: 'resumed', turn: 2, window: 'restricted',
  }));
});

it('denies stale, expired, Turn 0, and non-GM emergency timer requests without writing', async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-09-06T12:02:00.000Z'));
  mock.currentTurn = 2;
  mock.turnPhase = {
    turn: 2,
    teamPhaseEndsAt: '2026-09-06T12:05:00.000Z',
    openAirspaceEndsAt: '2026-09-06T12:20:00.000Z',
    airspace: { state: 'restricted', tickerActive: true, pressAccess: false },
  };

  mock.role = 'player';
  await expect(setEmergencyTimerPaused.run(request({
    sessionId: 's1', instanceId: 'bridge', expectedTurn: 2, paused: true,
  }))).rejects.toMatchObject({ code: 'permission-denied' });
  mock.role = 'gm';
  await expect(setEmergencyTimerPaused.run(request({
    sessionId: 's1', instanceId: 'bridge', expectedTurn: 1, paused: true,
  }))).rejects.toMatchObject({ code: 'failed-precondition' });
  mock.currentTurn = 0;
  mock.turnPhase = undefined;
  await expect(setEmergencyTimerPaused.run(request({
    sessionId: 's1', instanceId: 'bridge', expectedTurn: 0, paused: true,
  }))).rejects.toMatchObject({ code: 'invalid-argument' });
  mock.currentTurn = 2;
  mock.turnPhase = {
    turn: 2,
    teamPhaseEndsAt: '2026-09-06T12:05:00.000Z',
    openAirspaceEndsAt: '2026-09-06T12:20:00.000Z',
    airspace: { state: 'restricted', tickerActive: true, pressAccess: false },
  };
  vi.setSystemTime(new Date('2026-09-06T12:21:00.000Z'));
  await expect(setEmergencyTimerPaused.run(request({
    sessionId: 's1', instanceId: 'bridge', expectedTurn: 2, paused: true,
  }))).rejects.toMatchObject({ code: 'failed-precondition' });
  expect(mock.update).not.toHaveBeenCalled();
  expect(mock.set).not.toHaveBeenCalled();
});

it('requires AEGIS authority for the Press exception and heals a stale restriction into coordination', async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-09-06T12:00:00.000Z'));
  mock.role = 'player';
  mock.activeConsoleRoleId = 'admiral';
  mock.turnPhase = {
    turn: 1,
    teamPhaseEndsAt: '2026-09-06T12:10:00.000Z',
    openAirspaceEndsAt: '2026-09-06T12:30:00.000Z',
    airspace: { state: 'restricted', tickerActive: true, pressAccess: false },
  };

  await expect(unlockPressAirspace.run(request({ sessionId: 's1' }))).resolves.toEqual({
    turnPhase: {
      turn: 1,
      teamPhaseEndsAt: '2026-09-06T12:10:00.000Z',
      openAirspaceEndsAt: '2026-09-06T12:30:00.000Z',
      airspace: { state: 'restricted', tickerActive: true, pressAccess: true },
    },
  });

  mock.update.mockClear();
  mock.activeConsoleRoleId = 'dione-captain';
  await expect(unlockPressAirspace.run(request({ sessionId: 's1' }))).rejects
    .toMatchObject({ code: 'permission-denied' });
  expect(mock.update).not.toHaveBeenCalled();

  mock.activeConsoleRoleId = 'admiral';
  vi.setSystemTime(new Date('2026-09-06T12:10:00.000Z'));
  await expect(unlockPressAirspace.run(request({ sessionId: 's1' }))).resolves.toEqual({
    turnPhase: {
      turn: 1,
      teamPhaseEndsAt: '2026-09-06T12:10:00.000Z',
      openAirspaceEndsAt: '2026-09-06T12:30:00.000Z',
      airspace: { state: 'lifted', tickerActive: true, pressAccess: false },
    },
  });
  expect(mock.update).toHaveBeenCalledWith('sessions/s1', expect.objectContaining({
    turnPhase: expect.objectContaining({
      airspace: { state: 'lifted', tickerActive: true, pressAccess: false },
    }),
  }));
});

it('denies Press airspace unlock while Press is disabled without writing', async () => {
  mock.role = 'player';
  mock.activeConsoleRoleId = 'admiral';
  mock.pressEnabled = false;
  mock.turnPhase = {
    turn: 1,
    teamPhaseEndsAt: '2026-09-06T12:10:00.000Z',
    openAirspaceEndsAt: '2026-09-06T12:30:00.000Z',
    airspace: { state: 'restricted', tickerActive: true, pressAccess: false },
  };

  await expect(unlockPressAirspace.run(request({ sessionId: 's1' }))).rejects.toMatchObject({
    code: 'failed-precondition',
    message: expect.stringMatching(/press.*disabled/i),
  });
  expect(mock.update).not.toHaveBeenCalled();
  expect(mock.set).not.toHaveBeenCalled();
});

it('holds the player ICN travel lock at Turn 0', async () => {
  mock.role = 'player';
  mock.activeConsoleRoleId = 'admiral';
  mock.currentTurn = 0;

  await expect(setShipConsoleLock.run(request({
    sessionId: 's1', shipId: 'aegis', locked: true,
  }))).rejects.toMatchObject({
    code: 'failed-precondition',
    message: expect.stringMatching(/turn 1/i),
  });
  expect(mock.update).not.toHaveBeenCalled();
});

it('holds every maintenance cycle at Turn 0, including the GM path', async () => {
  mock.currentTurn = 0;

  await expect(runMaintenance.run(request(data))).rejects.toMatchObject({
    code: 'failed-precondition',
    message: expect.stringMatching(/turn 1/i),
  });
  expect(mock.update).not.toHaveBeenCalled();
});

it('denies turn advancement without an active GM instance', async () => {
  mock.role = 'player';
  await expect(advanceTurn.run(request({
    sessionId: 's1', instanceId: 'bridge', expectedTurn: 1,
  }))).rejects.toMatchObject({ code: 'permission-denied' });
});
it('checks the viewed console against the live crew before maintenance writes', async () => {
  let full = false;
  mock.get.mockImplementation(async (path: string) => {
    const fields: Record<string, unknown> = path.includes('/players/')
      ? { connected: true, role: 'player', activeConsoleRoleId: 'wing-commander' } : {};
    if (path.endsWith('/players')) return { docs: (full ? ['admiral', 'executive-officer', 'wing-commander'] : ['wing-commander']).map(post => ({ exists: true, get: (key: string) => ({ connected: true, role: 'player', activeConsoleRoleId: post } as Record<string, unknown>)[key] })) };
    return { exists: true, get: (key: string) => fields[key] };
  });
  const command = { ...data, consoleRoleId: 'admiral' };
  await expect(runMaintenance.run(request(command))).resolves.toMatchObject({ step: 1 });
  full = true; mock.update.mockClear();
  await expect(runMaintenance.run(request(command))).rejects.toMatchObject({ code: 'permission-denied' });
  expect(mock.update).not.toHaveBeenCalled();
});
it('denies maintenance rollback to players and observers', async () => {
  const { rollbackMaintenance } = await import('./index');
  for (const role of ['player', 'observer']) {
    mock.role = role;
    await expect(rollbackMaintenance.run(request({ sessionId: 's1', shipId: 'aegis', instanceId: 'bridge', expectedRevision: 1 }))).rejects.toMatchObject({ code: 'permission-denied' });
  }
  expect(mock.update).not.toHaveBeenCalled();
});
it('lets a GM roll back the latest maintenance step with a new revision', async () => {
  const { rollbackMaintenance } = await import('./index');
  const previous = mock.get.getMockImplementation()!;
  mock.maintenanceCycles = { aegis: { step: 2, revision: 2 } };
  mock.get.mockImplementation(async (path: string) => {
    if (path.includes('/maintenanceUndo/')) return { exists: true, get: (key: string) => ({ turn: 1, entries: [{ fields: [{ field: 'maintenanceCycles.aegis', before: { step: 1, revision: 1 }, after: { step: 2, revision: 2 }, existed: true }] }] } as Record<string, unknown>)[key] };
    if (path === 'sessions/s1') return { exists: true, get: (key: string) => ({ currentTurn: 1, 'maintenanceCycles.aegis': { step: 2, revision: 2 } } as Record<string, unknown>)[key] };
    return previous(path);
  });
  await expect(rollbackMaintenance.run(request({ sessionId: 's1', shipId: 'aegis', instanceId: 'bridge', expectedRevision: 2 }))).resolves.toMatchObject({ revision: 3 });
  expect(mock.update).toHaveBeenCalledWith('sessions/s1', expect.objectContaining({ 'maintenanceCycles.aegis': { step: 1, revision: 3 } }));
});
it('records and rolls back successive steps while restoring spent supplies', async () => {
  const { rollbackMaintenance } = await import('./index');
  const records: Record<string, Record<string, unknown>> = {
    'sessions/s1': { currentTurn: 1, maintenanceCycles: { aegis: { step: 0, revision: 0, results: {}, charges: [], refuelled: [] } }, shipResources: { aegis: { food: 20, water: 20, fuel: 3, materials: 0, ore: 0 } }, shipDamage: { aegis: { damagedSystemIds: ['storage'], destroyed: false } }, shipSurvivors: { aegis: 2000 }, shipUnrest: { aegis: 0 }, shuttleCargo: {}, shuttleFuelled: {}, unrestAlerts: {}, populationAlerts: {} },
    'sessions/s1/players/u1': { connected: true, role: 'gm' },
    'sessions/s1/gmInstances/bridge': { uid: 'u1' },
  };
  const read = (record: Record<string, unknown> | undefined, key: string): unknown => key.split('.').reduce<unknown>((value, part) => value && typeof value === 'object' ? (value as Record<string, unknown>)[part] : undefined, record);
  mock.get.mockImplementation(async (path: string) => ({ exists: Boolean(records[path]), get: (key: string) => read(records[path], key) }));
  mock.set.mockImplementation((path: string, value: Record<string, unknown>) => {
    if (Array.isArray(value.entries) && value.entries.some(Array.isArray)) throw new Error('Firestore does not support nested arrays.');
    records[path] = structuredClone(value);
  });
  mock.update.mockImplementation((path: string, patch: Record<string, unknown>) => {
    for (const [key, value] of Object.entries(patch)) {
      const parts = key.split('.'); let record = records[path]!;
      for (const part of parts.slice(0, -1)) { record[part] ??= {}; record = record[part] as Record<string, unknown>; }
      record[parts.at(-1)!] = structuredClone(value);
    }
  });
  await runMaintenance.run(request(data));
  await runMaintenance.run(request({ ...data, action: 'storage', expectedRevision: 1 }));
  expect(read(records['sessions/s1'], 'shipResources.aegis.food')).toBe(10);
  await runMaintenance.run(request({ ...data, action: 'rations', expectedRevision: 2, foodLevel: 1, waterLevel: 1 }));
  expect(read(records['sessions/s1'], 'shipResources.aegis.food')).toBe(7);
  for (const expectedRevision of [3, 4]) {
    await rollbackMaintenance.run(request({ sessionId: 's1', shipId: 'aegis', instanceId: 'bridge', expectedRevision }));
  }
  expect(read(records['sessions/s1'], 'shipResources.aegis.food')).toBe(20);
  expect(read(records['sessions/s1'], 'maintenanceCycles.aegis')).toMatchObject({ step: 1, revision: 5 });
});
