import { beforeEach, expect, it, vi } from 'vitest';
import type { CallableRequest } from 'firebase-functions/v2/https';

const mock = vi.hoisted(() => ({
  get: vi.fn(),
  update: vi.fn(),
  set: vi.fn(),
  role: 'gm',
  owner: 'u1',
  connected: true,
  currentTurn: 1,
  chartId: 'A',
  chartLocked: true,
  coordinate: '0000',
  fuel: 4,
  charges: ['jump-drive'] as string[],
  jumpStates: {} as Record<string, unknown>,
  systemHistory: {} as Record<string, unknown>,
  pursuitGroups: { 'fleet-1': 2 } as Record<string, number>,
  fleetGroups: [{
    id: 'fleet-1',
    vesselIds: ['aegis', 'dione', 'icebreaker', 'shepherd', 'quellon', 'refinery-124'],
    memberUids: ['u1'],
  }] as Array<{ id: string; vesselIds: string[]; memberUids: string[] }>,
  players: [{ id: 'u1', fields: { role: 'gm', connected: true, fleetGroupId: 'fleet-1' } }] as Array<{
    id: string; fields: Record<string, unknown>;
  }>,
  upgrades: {} as Record<string, unknown>,
  damage: {} as Record<string, unknown>,
  wolfAttackState: undefined as Record<string, unknown> | undefined,
  arrivalPressureState: undefined as Record<string, unknown> | undefined,
  missionOpportunityRecord: undefined as Record<string, unknown> | undefined,
  missionOpportunityRecordPath: undefined as string | undefined,
  commandReceiptRecord: undefined as Record<string, unknown> | undefined,
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
        const sets: Array<[string, Record<string, unknown>]> = [];
        result = await callback({
          get: mock.get,
          set: (path: string, fields: Record<string, unknown>) => sets.push([path, fields]),
          update: (path: string, fields: Record<string, unknown>) => writes.push([path, fields]),
        });
        if (attempt === attempts - 1) {
          for (const [path, fields] of writes) mock.update(path, fields);
          for (const [path, fields] of sets) mock.set(path, fields);
        }
      }
      return result;
    },
  }),
  FieldValue: { serverTimestamp: () => 'server-time', delete: () => 'delete-field' },
  Timestamp: { now: () => ({ toMillis: () => Date.now() }) },
}));

import { jumpShip, moveShipToLocation } from './index';

function request(data: Record<string, unknown>, uid = 'u1') {
  return { data: data.requestId === undefined ? { ...data, requestId: 'test-jump' } : data, auth: { uid } } as CallableRequest<Record<string, unknown>>;
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
  mock.chartId = 'A';
  mock.chartLocked = true;
  mock.coordinate = '0000';
  mock.fuel = 4;
  mock.charges = ['jump-drive'];
  mock.jumpStates = {};
  mock.systemHistory = {};
  mock.pursuitGroups = { 'fleet-1': 2 };
  mock.fleetGroups = [{
    id: 'fleet-1',
    vesselIds: ['aegis', 'dione', 'icebreaker', 'shepherd', 'quellon', 'refinery-124'],
    memberUids: ['u1'],
  }];
  mock.players = [{ id: 'u1', fields: { role: 'gm', connected: true, fleetGroupId: 'fleet-1' } }];
  mock.upgrades = {};
  mock.damage = {};
  mock.wolfAttackState = undefined;
  mock.arrivalPressureState = undefined;
  mock.missionOpportunityRecord = undefined;
  mock.missionOpportunityRecordPath = undefined;
  mock.commandReceiptRecord = undefined;
  mock.transactionRetries = 0;
  mock.randomInt.mockReset();
  mock.randomInt.mockReturnValue(6);
  mock.randomUUID.mockReset();
  mock.randomUUID.mockReturnValue('jump-event');
  mock.update.mockReset();
  mock.set.mockReset();
  mock.get.mockImplementation(async (path: string) => {
    if (path.includes('/commandReceipts/')) return {
      exists: mock.commandReceiptRecord !== undefined,
      get: (key: string) => mock.commandReceiptRecord?.[key],
    };
    if (path === 'sessions/s1/wolfAttackState/current') {
      const fields = mock.wolfAttackState;
      return {
        exists: fields !== undefined,
        data: fields === undefined ? undefined : () => fields,
        get: (key: string) => fields?.[key],
      };
    }
    if (path === 'sessions/s1/serverState/wolfArrivalPressure/groups/fleet-1') {
      const fields = mock.arrivalPressureState;
      return {
        exists: fields !== undefined,
        data: fields === undefined ? undefined : () => fields,
        get: (key: string) => fields?.[key],
      };
    }
    if (path.startsWith('sessions/s1/missionOpportunities/')) {
      const record = mock.missionOpportunityRecordPath === undefined ||
        mock.missionOpportunityRecordPath === path
        ? mock.missionOpportunityRecord
        : undefined;
      return {
        exists: record !== undefined,
        data: () => record,
        get: (key: string) => record?.[key],
      };
    }
    if (path === 'sessions/s1/fleetGroups') {
      return { docs: mock.fleetGroups.map((group) => ({
        exists: true, id: group.id, data: () => group, get: (key: string) => group[key as keyof typeof group],
      })) };
    }
    if (path === 'sessions/s1/players') {
      return { docs: mock.players.map((entry) => ({
        exists: true, id: entry.id, data: () => entry.fields, get: (key: string) => entry.fields[key],
      })) };
    }
    const fields: Record<string, unknown> = path.includes('/players/')
      ? {
        role: mock.role, connected: mock.connected, activeConsoleRoleId: undefined,
        fleetGroupId: 'fleet-1',
      }
      : path.includes('/private/shipConsoleWriteGrant')
        ? {
          type: 'gm-ship-console-write-grant', sessionId: 's1', instanceId: 'bridge', uid: mock.owner,
          shipId: 'aegis', grantedAt: new Date(),
        }
      : path.includes('/gmInstances/')
        ? { uid: mock.owner, connected: mock.connected, lastSeenAt: new Date() }
        : {
          phase: 'active',
          currentTurn: mock.currentTurn,
          turnPhase: {
            turn: mock.currentTurn,
            teamPhaseEndsAt: '2026-09-06T12:05:00.000Z',
            openAirspaceEndsAt: '2026-09-06T12:20:00.000Z',
            airspace: { state: 'lifted', tickerActive: true, pressAccess: false },
          },
          chartId: mock.chartId,
          chartSelectionLocked: mock.chartLocked,
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
          systemHistory: mock.systemHistory,
          pursuitGroups: mock.pursuitGroups,
          maintenanceCycles: {
            aegis: { turn: mock.currentTurn, charges: mock.charges, results: {} },
          },
        };
    if (path === 'sessions/s1/serverState/navigation') {
      return { exists: true, data: () => fields, get: (key: string) => fields[key] };
    }
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

it.each([
  ['declared', { status: 'declared', airspaceLocked: true, parkingReleaseCondition: 'normal-movement-reopened' }],
  ['legacy', { status: 'declared', airspaceLocked: true }],
  ['malformed', { status: 7, airspaceLocked: 'unknown' }],
])('blocks jump and movement from a lifted phase with %s Wolf attack state', async (_label, attackState) => {
  mock.wolfAttackState = attackState;

  await expect(jumpShip.run(request({
    ...data, requestId: `blocked-jump-${_label}`, destination: '5143',
  }))).rejects.toMatchObject({
    code: 'failed-precondition',
    message: expect.stringMatching(/awaits facilitator resolution.*movement remains blocked/i),
  });
  await expect(moveShipToLocation.run(request({
    ...data, requestId: `blocked-move-${_label}`, destination: '5143',
  }))).rejects.toMatchObject({
    code: 'failed-precondition',
    message: expect.stringMatching(/awaits facilitator resolution.*movement remains blocked/i),
  });
  expect(mock.update).not.toHaveBeenCalled();
  expect(mock.set).not.toHaveBeenCalled();
});

it('denies destroyed ships before movement or jump can change navigation state', async () => {
  mock.damage = { aegis: { damagedSystemIds: ['reactor'], destroyed: true } };

  await expect(jumpShip.run(request({
    ...data, requestId: 'destroyed-jump', destination: '5143',
  }))).rejects.toMatchObject({
    code: 'failed-precondition',
    message: expect.stringMatching(/destroyed ships cannot move or jump/i),
  });
  expect(mock.update).not.toHaveBeenCalled();
  expect(mock.randomInt).not.toHaveBeenCalled();

  await expect(moveShipToLocation.run(request({
    ...data, requestId: 'destroyed-move', destination: '5143',
  }))).rejects.toMatchObject({
    code: 'failed-precondition',
    message: expect.stringMatching(/destroyed ships cannot move or jump/i),
  });
  expect(mock.update).not.toHaveBeenCalled();
});

it('adjusts protected pursuit from the server chart depth through facilitator movement and ship jumps', async () => {
  await expect(moveShipToLocation.run(request({
    ...data, requestId: 'pursuit-move', destination: '5143',
  }))).resolves.toMatchObject({ destination: '5143' });
  expect(mock.set).toHaveBeenCalledWith(
    'sessions/s1/serverState/navigation',
    expect.objectContaining({ pursuitGroups: { 'fleet-1': 1 } }),
  );
  expect(mock.update).toHaveBeenCalledWith('sessions/s1', expect.objectContaining({
    pursuitGroups: 'delete-field',
  }));

  mock.coordinate = '0000';
  mock.set.mockClear();
  mock.update.mockClear();
  await expect(jumpShip.run(request({
    ...data, requestId: 'pursuit-jump', destination: '5143',
  }))).resolves.toMatchObject({ status: 'jumped', destination: '5143' });
  expect(mock.set).toHaveBeenCalledWith(
    'sessions/s1/serverState/navigation',
    expect.objectContaining({ pursuitGroups: { 'fleet-1': 1 } }),
  );
  expect(mock.update).toHaveBeenCalledWith('sessions/s1', expect.objectContaining({
    pursuitGroups: 'delete-field',
  }));
});

it('persists a candidate arrival while keeping it out of another ship projection', async () => {
  mock.fleetGroups = [{
    ...mock.fleetGroups[0]!, memberUids: ['u1', 'u2'],
  }];
  mock.players = [
    { id: 'u1', fields: { role: 'gm', connected: true, fleetGroupId: 'fleet-1', assignedRoleId: 'admiral' } },
    { id: 'u2', fields: { role: 'player', connected: true, fleetGroupId: 'fleet-1', assignedRoleId: 'dione-captain' } },
  ];
  await expect(moveShipToLocation.run(request({
    ...data, requestId: 'candidate-arrival', destination: '6798',
  }))).resolves.toMatchObject({ destination: '6798' });

  expect(mock.set).toHaveBeenCalledWith(
    'sessions/s1/serverState/navigation',
    expect.objectContaining({
      systemHistory: expect.objectContaining({
        aegis: expect.objectContaining({
          '6798': expect.objectContaining({
            candidateDiscovery: expect.objectContaining({
              code: 'N', title: 'Ancient Jump Ring', source: 'arrival',
            }),
          }),
        }),
      }),
    }),
  );
  expect(mock.set).toHaveBeenCalledWith(
    'sessions/s1/playerDiscoveries/u1',
    expect.objectContaining({
      systemHistory: expect.objectContaining({
        '6798': expect.objectContaining({
          candidateDiscovery: expect.objectContaining({ code: 'N' }),
        }),
      }),
    }),
  );
  expect(mock.set).toHaveBeenCalledWith(
    'sessions/s1/playerDiscoveries/u2',
    expect.not.objectContaining({ systemHistory: expect.anything() }),
  );
});

it.each([
  ['unlocked chart', 'unlocked-chart', 'A', false],
  ['missing chart', 'missing-chart', undefined, true],
  ['invalid chart', 'invalid-chart', 'D', true],
])('rejects candidate arrival with %s before any write', async (_label, requestId, chartId, chartLocked) => {
  mock.chartId = chartId as string;
  mock.chartLocked = chartLocked;
  await expect(moveShipToLocation.run(request({
    ...data, requestId: `candidate-${requestId}`, destination: '6798',
  }))).rejects.toMatchObject({
    code: 'failed-precondition',
    message: expect.stringMatching(/locked organiser chart is unavailable/i),
  });
  await expect(jumpShip.run(request({
    ...data, requestId: `candidate-jump-${requestId}`, destination: '6798',
  }))).rejects.toMatchObject({
    code: 'failed-precondition',
    message: expect.stringMatching(/locked organiser chart is unavailable/i),
  });
  expect(mock.update).not.toHaveBeenCalled();
  expect(mock.set).not.toHaveBeenCalled();
});

it('creates one group-scoped mission opportunity on first arrival and exposes its stable identity', async () => {
  await expect(moveShipToLocation.run(request({
    ...data, requestId: 'mission-first-arrival', destination: '1413',
  }))).resolves.toMatchObject({
    destination: '1413',
    missionOpportunityId: 'arrival-fleet-1-A-1413',
  });

  expect(mock.set).toHaveBeenCalledWith(
    'sessions/s1/missionOpportunities/arrival-fleet-1-A-1413',
    expect.objectContaining({
      type: 'mission-opportunity', status: 'available', sessionId: 's1',
      id: 'arrival-fleet-1-A-1413', groupId: 'fleet-1', chart: 'A',
      coordinate: '1413', siteCode: 'A', sourceShipId: 'aegis',
      sourceTransitionId: 'navigation-mission-first-arrival', sourceCycle: 1,
    }),
  );
});

it('commits one mission, attack, and discovery when Firestore retries an arrival transaction', async () => {
  mock.transactionRetries = 1;

  const command = { ...data, requestId: 'retry-arrival-effects', destination: '5143' };
  const result = await moveShipToLocation.run(request(command));
  expect(result).toMatchObject({
    destination: '5143',
    missionOpportunityId: 'arrival-fleet-1-A-5143',
  });

  expect(mock.set.mock.calls.filter(([path]) =>
    path === 'sessions/s1/missionOpportunities/arrival-fleet-1-A-5143')).toHaveLength(1);
  expect(mock.set.mock.calls.filter(([path]) =>
    path === 'sessions/s1/wolfAttackPressure/arrival-navigation-retry-arrival-effects'))
    .toHaveLength(1);
  expect(mock.set.mock.calls.filter(([path]) =>
    path === 'sessions/s1/serverState/wolfArrivalPressure/groups/fleet-1')).toHaveLength(1);
  expect(mock.set.mock.calls.filter(([path]) =>
    path === 'sessions/s1/serverState/navigation')).toHaveLength(1);

  expect(mock.set).toHaveBeenCalledWith(
    'sessions/s1/serverState/navigation',
    expect.objectContaining({
      shipNavigationLogs: expect.objectContaining({
        aegis: [expect.objectContaining({
          id: 'navigation-retry-arrival-effects-0',
          destination: '5143',
        })],
      }),
      systemHistory: {
        aegis: {
          '5143': expect.objectContaining({
            discovery: {
              id: 'navigation-retry-arrival-effects-0',
              occurredAt: expect.any(String),
            },
            attempts: [],
            hazards: [],
            rewards: [],
            clearedThreats: [],
            candidateProgress: [],
          }),
        },
      },
    }),
  );

  mock.commandReceiptRecord = {
    fingerprint: {
      action: 'move-ship', sessionId: 's1', requestId: 'retry-arrival-effects', actorUid: 'u1',
      instanceId: 'bridge', expectedRevision: null,
      payload: { shipId: 'aegis', destination: '5143' },
    },
    result,
  };
  mock.set.mockClear();
  mock.update.mockClear();
  await expect(moveShipToLocation.run(request(command))).resolves.toEqual(result);
  expect(mock.set).not.toHaveBeenCalled();
  expect(mock.update).not.toHaveBeenCalled();
});

it('creates the same first-arrival opportunity through an authoritative ship jump', async () => {
  await expect(jumpShip.run(request({
    ...data, requestId: 'mission-jump-arrival', destination: '1413',
  }))).resolves.toMatchObject({
    status: 'jumped',
    destination: '1413',
    missionOpportunityId: 'arrival-fleet-1-A-1413',
  });

  expect(mock.set).toHaveBeenCalledWith(
    'sessions/s1/missionOpportunities/arrival-fleet-1-A-1413',
    expect.objectContaining({
      type: 'mission-opportunity', status: 'available', sessionId: 's1',
      id: 'arrival-fleet-1-A-1413', groupId: 'fleet-1', chart: 'A',
      coordinate: '1413', siteCode: 'A', sourceShipId: 'aegis',
      sourceTransitionId: 'jump-mission-jump-arrival', sourceCycle: 1,
    }),
  );
});

it('does not create another opportunity for a system already reached by the group', async () => {
  mock.systemHistory = {
    dione: {
      '1413': {
        coordinate: '1413',
        discovery: { id: 'navigation-prior-0', occurredAt: '2026-09-21T00:00:00.000Z' },
        attempts: [], hazards: [], rewards: [], clearedThreats: [], candidateProgress: [],
      },
    },
  };

  await expect(moveShipToLocation.run(request({
    ...data, requestId: 'mission-repeat-arrival', destination: '1413',
  }))).resolves.not.toHaveProperty('missionOpportunityId');
  expect(mock.set.mock.calls.some(([path]) =>
    String(path).startsWith('sessions/s1/missionOpportunities/'))).toBe(false);
});

it('creates an Unstable Star opportunity again in a later cycle without duplicating that cycle', async () => {
  mock.currentTurn = 2;
  mock.systemHistory = {
    dione: {
      '8378': {
        coordinate: '8378',
        discovery: { id: 'navigation-prior-star', occurredAt: '2026-09-21T00:00:00.000Z' },
        attempts: [], hazards: [], rewards: [], clearedThreats: [], candidateProgress: [],
      },
    },
  };

  await expect(moveShipToLocation.run(request({
    ...data, requestId: 'unstable-star-cycle-2', destination: '8378',
  }))).resolves.toMatchObject({
    missionOpportunityId: 'arrival-fleet-1-A-8378-cycle-2',
  });
  expect(mock.set).toHaveBeenCalledWith(
    'sessions/s1/missionOpportunities/arrival-fleet-1-A-8378-cycle-2',
    expect.objectContaining({ siteCode: 'J', sourceCycle: 2 }),
  );

  mock.set.mockClear();
  mock.update.mockClear();
  mock.missionOpportunityRecord = {
    type: 'mission-opportunity', status: 'available', sessionId: 's1',
    id: 'arrival-fleet-1-A-8378-cycle-2', groupId: 'fleet-1', chart: 'A',
    coordinate: '8378', siteCode: 'J', sourceShipId: 'dione',
    sourceTransitionId: 'navigation-first-star-arrival', sourceCycle: 2,
  };
  mock.missionOpportunityRecordPath =
    'sessions/s1/missionOpportunities/arrival-fleet-1-A-8378-cycle-2';
  await expect(moveShipToLocation.run(request({
    ...data, requestId: 'unstable-star-cycle-2-retry', destination: '8378',
  }))).resolves.not.toHaveProperty('missionOpportunityId');
  expect(mock.set.mock.calls.some(([path]) =>
    String(path).startsWith('sessions/s1/missionOpportunities/'))).toBe(false);
});

it('does not duplicate a legacy Unstable Star opportunity during its deployment cycle', async () => {
  mock.currentTurn = 2;
  mock.systemHistory = {
    dione: {
      '8378': {
        coordinate: '8378',
        discovery: { id: 'navigation-prior-star', occurredAt: '2026-09-21T00:00:00.000Z' },
        attempts: [], hazards: [], rewards: [], clearedThreats: [], candidateProgress: [],
      },
    },
  };
  mock.missionOpportunityRecord = {
    type: 'mission-opportunity', status: 'available', sessionId: 's1',
    id: 'arrival-fleet-1-A-8378', groupId: 'fleet-1', chart: 'A',
    coordinate: '8378', siteCode: 'J', sourceShipId: 'dione',
    sourceTransitionId: 'navigation-pre-upgrade-arrival', sourceCycle: 2,
  };
  mock.missionOpportunityRecordPath =
    'sessions/s1/missionOpportunities/arrival-fleet-1-A-8378';

  await expect(moveShipToLocation.run(request({
    ...data, requestId: 'unstable-star-upgrade-cycle-retry', destination: '8378',
  }))).resolves.not.toHaveProperty('missionOpportunityId');
  expect(mock.set.mock.calls.some(([path]) =>
    String(path).startsWith('sessions/s1/missionOpportunities/'))).toBe(false);
});

it('allows a new-cycle Unstable Star opportunity after a valid older legacy record', async () => {
  mock.currentTurn = 3;
  mock.systemHistory = {
    dione: {
      '8378': {
        coordinate: '8378',
        discovery: { id: 'navigation-prior-star', occurredAt: '2026-09-21T00:00:00.000Z' },
        attempts: [], hazards: [], rewards: [], clearedThreats: [], candidateProgress: [],
      },
    },
  };
  mock.missionOpportunityRecord = {
    type: 'mission-opportunity', status: 'available', sessionId: 's1',
    id: 'arrival-fleet-1-A-8378', groupId: 'fleet-1', chart: 'A',
    coordinate: '8378', siteCode: 'J', sourceShipId: 'dione',
    sourceTransitionId: 'navigation-pre-upgrade-arrival', sourceCycle: 2,
  };
  mock.missionOpportunityRecordPath =
    'sessions/s1/missionOpportunities/arrival-fleet-1-A-8378';

  await expect(moveShipToLocation.run(request({
    ...data, requestId: 'unstable-star-after-upgrade', destination: '8378',
  }))).resolves.toMatchObject({
    missionOpportunityId: 'arrival-fleet-1-A-8378-cycle-3',
  });
  expect(mock.set).toHaveBeenCalledWith(
    'sessions/s1/missionOpportunities/arrival-fleet-1-A-8378-cycle-3',
    expect.objectContaining({ siteCode: 'J', sourceCycle: 3 }),
  );
});

it('fails closed before movement writes when a legacy Unstable Star opportunity is malformed', async () => {
  mock.currentTurn = 2;
  mock.missionOpportunityRecord = {
    type: 'mission-opportunity', status: 'available', sessionId: 's1',
    id: 'arrival-fleet-1-A-8378', groupId: 'fleet-1', chart: 'A',
    coordinate: '8378', siteCode: 'J', sourceShipId: 'dione',
    sourceTransitionId: 'forged-transition', sourceCycle: 2,
  };
  mock.missionOpportunityRecordPath =
    'sessions/s1/missionOpportunities/arrival-fleet-1-A-8378';

  await expect(moveShipToLocation.run(request({
    ...data, requestId: 'unstable-star-malformed-legacy', destination: '8378',
  }))).rejects.toMatchObject({
    code: 'failed-precondition', details: { commandError: 'malformed-input' },
  });
  expect(mock.set).not.toHaveBeenCalled();
  expect(mock.update).not.toHaveBeenCalled();
});

it('creates one cycle-scoped Wolf Supply Outpost opportunity without exposing secret difficulty', async () => {
  mock.currentTurn = 2;
  mock.systemHistory = {
    dione: {
      '6943': {
        coordinate: '6943',
        discovery: { id: 'navigation-prior-outpost', occurredAt: '2026-09-21T00:00:00.000Z' },
        attempts: [], hazards: [], rewards: [], clearedThreats: [], candidateProgress: [],
      },
    },
  };

  const reply = await moveShipToLocation.run(request({
    ...data, requestId: 'wolf-outpost-cycle-2', destination: '6943',
  }));
  expect(reply).toMatchObject({
    missionOpportunityId: 'arrival-fleet-1-A-6943-cycle-2',
  });
  expect(JSON.stringify(reply)).not.toMatch(/difficulty|secret|multiplier/i);
  expect(mock.set).toHaveBeenCalledWith(
    'sessions/s1/missionOpportunities/arrival-fleet-1-A-6943-cycle-2',
    expect.objectContaining({
      siteCode: 'K', sourceCycle: 2,
      id: 'arrival-fleet-1-A-6943-cycle-2',
    }),
  );
});

it('does not duplicate a legacy Wolf Supply Outpost opportunity during its deployment cycle', async () => {
  mock.currentTurn = 2;
  mock.systemHistory = {
    dione: {
      '6943': {
        coordinate: '6943',
        discovery: { id: 'navigation-prior-outpost', occurredAt: '2026-09-21T00:00:00.000Z' },
        attempts: [], hazards: [], rewards: [], clearedThreats: [], candidateProgress: [],
      },
    },
  };
  mock.missionOpportunityRecord = {
    type: 'mission-opportunity', status: 'available', sessionId: 's1',
    id: 'arrival-fleet-1-A-6943', groupId: 'fleet-1', chart: 'A',
    coordinate: '6943', siteCode: 'K', sourceShipId: 'dione',
    sourceTransitionId: 'navigation-pre-upgrade-outpost', sourceCycle: 2,
  };
  mock.missionOpportunityRecordPath =
    'sessions/s1/missionOpportunities/arrival-fleet-1-A-6943';

  await expect(moveShipToLocation.run(request({
    ...data, requestId: 'wolf-outpost-upgrade-cycle-retry', destination: '6943',
  }))).resolves.not.toHaveProperty('missionOpportunityId');
  expect(mock.set.mock.calls.some(([path]) =>
    String(path).startsWith('sessions/s1/missionOpportunities/'))).toBe(false);
});

it('does not reopen a previously created opportunity when legacy history is incomplete', async () => {
  mock.missionOpportunityRecord = {
    type: 'mission-opportunity', status: 'available', sessionId: 's1',
    id: 'arrival-fleet-1-A-1413', groupId: 'fleet-1', chart: 'A',
    coordinate: '1413', siteCode: 'A', sourceShipId: 'dione',
    sourceTransitionId: 'navigation-original-arrival', sourceCycle: 0,
    createdAt: 'server-time',
  };

  await expect(moveShipToLocation.run(request({
    ...data, requestId: 'mission-existing-opportunity', destination: '1413',
  }))).resolves.not.toHaveProperty('missionOpportunityId');
  expect(mock.set.mock.calls.some(([path]) =>
    String(path).startsWith('sessions/s1/missionOpportunities/'))).toBe(false);
});

it('fails closed without navigation writes when a stored opportunity is malformed', async () => {
  mock.missionOpportunityRecord = {
    type: 'mission-opportunity', status: 'available', sessionId: 's1',
    id: 'arrival-fleet-1-A-1413', groupId: 'fleet-2', chart: 'A',
    coordinate: '1413', siteCode: 'A', sourceShipId: 'dione',
    sourceTransitionId: 'navigation-corrupt-arrival', sourceCycle: 0,
  };

  await expect(moveShipToLocation.run(request({
    ...data, requestId: 'mission-malformed-opportunity', destination: '1413',
  }))).rejects.toMatchObject({
    code: 'failed-precondition', details: { commandError: 'malformed-input' },
  });
  expect(mock.set).not.toHaveBeenCalled();
  expect(mock.update).not.toHaveBeenCalled();
});

it('fails closed without writes for forged non-empty opportunity source metadata', async () => {
  const baseOpportunity = {
    type: 'mission-opportunity', status: 'available', sessionId: 's1',
    id: 'arrival-fleet-1-A-1413', groupId: 'fleet-1', chart: 'A',
    coordinate: '1413', siteCode: 'A', sourceShipId: 'dione',
    sourceTransitionId: 'jump-original-arrival', sourceCycle: 0,
  };
  for (const [requestId, sourcePatch] of [
    ['mission-forged-source-ship', { sourceShipId: 'forged-ship' }],
    ['mission-forged-transition', { sourceTransitionId: 'anything' }],
  ] as const) {
    mock.missionOpportunityRecord = { ...baseOpportunity, ...sourcePatch };
    await expect(moveShipToLocation.run(request({
      ...data, requestId, destination: '1413',
    }))).rejects.toMatchObject({
      code: 'failed-precondition', details: { commandError: 'malformed-input' },
    });
  }
  expect(mock.set).not.toHaveBeenCalled();
  expect(mock.update).not.toHaveBeenCalled();
});

it('does not create away-mission opportunities at New Eden candidates', async () => {
  await expect(moveShipToLocation.run(request({
    ...data, requestId: 'candidate-arrival', destination: '6798',
  }))).resolves.not.toHaveProperty('missionOpportunityId');
  expect(mock.set.mock.calls.some(([path]) =>
    String(path).startsWith('sessions/s1/missionOpportunities/'))).toBe(false);
});

it('atomically schedules group-local L arrival pressure with the printed attack minimums', async () => {
  await expect(jumpShip.run(request({
    ...data, requestId: 'wolf-base-entry', destination: '5143',
  }))).resolves.toMatchObject({ status: 'jumped', destination: '5143' });

  expect(mock.set).toHaveBeenCalledWith(
    'sessions/s1/serverState/wolfArrivalPressure/groups/fleet-1',
    expect.objectContaining({
      type: 'wolf-base-arrival-pressure-state', groupId: 'fleet-1', chart: 'A', revision: 1,
      entries: [expect.objectContaining({
        status: 'operational', chart: 'A', coordinate: '5143', siteCode: 'L',
        sourceShipId: 'aegis', sourceTransitionId: 'jump-wolf-base-entry',
        minimumBattleStations: 1, minimumOtherShipDamage: 20,
        missionAccess: 'blockedWhileWolfBaseOperational',
      })],
    }),
  );
  expect(mock.set).toHaveBeenCalledWith(
    'sessions/s1/wolfAttackPressure/arrival-jump-wolf-base-entry',
    expect.objectContaining({
      type: 'wolf-base-arrival-pressure-schedule', status: 'scheduled',
      groupId: 'fleet-1', chart: 'A', coordinate: '5143', siteCode: 'L',
      arrivalTiming: 'immediate', minimumBattleStations: 1,
      minimumOtherShipDamage: 20,
    }),
  );
});

it('fails closed before navigation writes when stored L/M pressure is malformed', async () => {
  mock.arrivalPressureState = {
    type: 'wolf-base-arrival-pressure-state', groupId: 'fleet-1', revision: 1,
    entries: [{ coordinate: '5143', status: 'operational' }],
  };
  await expect(jumpShip.run(request({
    ...data, requestId: 'malformed-arrival-pressure', destination: '5143',
  }))).rejects.toMatchObject({
    code: 'failed-precondition', details: { commandError: 'malformed-input' },
  });
  expect(mock.set).not.toHaveBeenCalled();
  expect(mock.update).not.toHaveBeenCalled();
});

it('changes only the moving ship fleet group and uses the full printed destination depth', async () => {
  mock.pursuitGroups = { 'fleet-1': 8, 'fleet-2': 9 };
  mock.fleetGroups = [
    { id: 'fleet-1', vesselIds: ['aegis'], memberUids: ['u1'] },
    {
      id: 'fleet-2',
      vesselIds: ['dione', 'icebreaker', 'shepherd', 'quellon', 'refinery-124'],
      memberUids: ['u2'],
    },
  ];
  mock.players = [
    { id: 'u1', fields: { role: 'gm', connected: true, fleetGroupId: 'fleet-1' } },
    { id: 'u2', fields: { role: 'player', connected: true, fleetGroupId: 'fleet-2' } },
  ];

  await expect(moveShipToLocation.run(request({
    ...data, requestId: 'deep-pursuit-move', destination: '8378',
  }))).resolves.toMatchObject({ destination: '8378' });
  expect(mock.set).toHaveBeenCalledWith(
    'sessions/s1/serverState/navigation',
    expect.objectContaining({ pursuitGroups: { 'fleet-1': 2, 'fleet-2': 9 } }),
  );
});

it('uses the locked chart to preserve pursuit at the Level 5 Planet destination', async () => {
  mock.chartId = 'B';
  mock.pursuitGroups = { 'fleet-1': 8 };

  await expect(moveShipToLocation.run(request({
    ...data, requestId: 'level-five-planet', destination: '2580',
  }))).resolves.toMatchObject({ destination: '2580' });
  expect(mock.set).toHaveBeenCalledWith(
    'sessions/s1/serverState/navigation',
    expect.objectContaining({ pursuitGroups: { 'fleet-1': 8 } }),
  );
});

it('fails closed without writes when successful movement has malformed fleet-group authority', async () => {
  mock.fleetGroups = [{
    id: 'fleet-1',
    vesselIds: ['dione', 'icebreaker', 'shepherd', 'quellon', 'refinery-124'],
    memberUids: ['u1'],
  }];

  await expect(moveShipToLocation.run(request({
    ...data, requestId: 'malformed-pursuit-move', destination: '5143',
  }))).rejects.toMatchObject({
    code: 'failed-precondition',
    details: { commandError: 'malformed-input' },
  });
  expect(mock.set).not.toHaveBeenCalled();
  expect(mock.update).not.toHaveBeenCalled();
});

it('fails closed without writes when the raw pursuit map contains invalid authority', async () => {
  mock.pursuitGroups = { 'fleet-1': 2, intruder: 3 };

  await expect(jumpShip.run(request({
    ...data, requestId: 'malformed-pursuit-map', destination: '5143',
  }))).rejects.toMatchObject({
    code: 'failed-precondition',
    details: { commandError: 'malformed-input' },
  });
  expect(mock.set).not.toHaveBeenCalled();
  expect(mock.update).not.toHaveBeenCalled();
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

it('validates reachability from stored position even when the client supplies a different origin', async () => {
  for (const [origin, destination] of [['5143', '0101'], ['0101', '5143'], ['5143', '5143']]) {
    mock.coordinate = origin!;
    mock.update.mockClear();
    await expect(jumpShip.run(request({ ...data, destination, origin: '0000' }))).resolves.toMatchObject({
      status: 'integrity-lockout', origin, destination,
    });
    const fields = mock.update.mock.calls[0]?.[1];
    expect(fields).toHaveProperty('shipJumpStates.aegis');
    for (const field of ['shipGalacticCoordinates.aegis', 'shipResources.aegis.fuel', 'maintenanceCycles.aegis', 'shipJumpTransitions.aegis']) {
      expect(fields).not.toHaveProperty(field);
    }
    expect(mock.update).toHaveBeenCalledTimes(1);
  }
  expect(mock.randomInt).not.toHaveBeenCalled();

  mock.coordinate = '5143';
  mock.update.mockClear();
  await expect(jumpShip.run(request({ ...data, destination: '0000', origin: '0101' }))).resolves.toMatchObject({
    status: 'jumped', origin: '5143', destination: '0000',
  });
  expect(mock.update).toHaveBeenCalledWith('sessions/s1', expect.objectContaining({
    'shipResources.aegis.fuel': expect.any(Number),
    shipGalacticCoordinates: 'delete-field',
    shipNavigationLogs: 'delete-field',
    pursuitGroups: 'delete-field',
  }));
  expect(mock.set).toHaveBeenCalledWith('sessions/s1/serverState/navigation', expect.objectContaining({
    shipGalacticCoordinates: expect.objectContaining({ aegis: '0000' }),
  }));
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
    transition: expect.objectContaining({ id: 'jump-test-jump', destination: '5143' }),
    actorUid: 'u1', actorRoleId: null, vesselId: 'aegis', turn: 1, phase: 'active',
    revision: 1, idempotencyKey: 'test-jump', auditId: 'jump-ship-test-jump',
  });

  expect(mock.randomInt).toHaveBeenCalledTimes(1);
  expect(mock.randomInt).toHaveBeenCalledWith(1, 7);
  expect(mock.update).toHaveBeenCalledTimes(1);
  expect(mock.update).toHaveBeenCalledWith('sessions/s1', expect.objectContaining({
    'shipResources.aegis.fuel': 3,
    'maintenanceCycles.aegis': expect.objectContaining({ charges: [] }),
    'shipJumpStates.aegis': { lastJumpTurn: 1 },
    'shipJumpTransitions.aegis': expect.objectContaining({ id: 'jump-test-jump' }),
    shipGalacticCoordinates: 'delete-field',
    shipNavigationLogs: 'delete-field',
    pursuitGroups: 'delete-field',
  }));
  expect(mock.set).toHaveBeenCalledWith('sessions/s1/serverState/navigation', expect.objectContaining({
    shipGalacticCoordinates: expect.objectContaining({ aegis: '5143' }),
    shipNavigationLogs: expect.objectContaining({
      aegis: expect.arrayContaining([expect.objectContaining({
        id: 'jump-test-jump-0', type: 'self-jump', origin: '0000', destination: '5143',
      })]),
    }),
    systemHistory: {
      aegis: {
        '5143': expect.objectContaining({
          coordinate: '5143',
          discovery: { id: 'jump-test-jump-0', occurredAt: expect.any(String) },
          attempts: [], hazards: [], rewards: [], clearedThreats: [], candidateProgress: [],
        }),
      },
    },
  }));

  mock.systemHistory = {
    aegis: {
      '1413': {
        coordinate: '1413',
        attempts: [{ id: 'attempt-before-jump', occurredAt: '2026-09-13T00:00:00.000Z' }],
        hazards: [], rewards: [], clearedThreats: [], candidateProgress: [],
      },
    },
  };

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
  mock.set.mockReset();

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
    'shipResources.aegis.fuel': 2,
    'maintenanceCycles.aegis': expect.objectContaining({ charges: [] }),
    'shipJumpStates.aegis': { lastJumpTurn: 1 },
    'shipJumpTransitions.aegis': expect.objectContaining({ id: 'jump-test-jump' }),
    shipGalacticCoordinates: 'delete-field',
    shipNavigationLogs: 'delete-field',
    pursuitGroups: 'delete-field',
  }));
  expect(mock.set).toHaveBeenCalledWith('sessions/s1/serverState/navigation', expect.objectContaining({
    shipGalacticCoordinates: expect.objectContaining({ aegis: '5143' }),
    shipNavigationLogs: expect.objectContaining({
      aegis: expect.arrayContaining([expect.objectContaining({
        id: 'jump-test-jump-0',
        type: 'self-jump',
        origin: '0000',
        destination: '5143',
        navigationalError: false,
      })]),
    }),
    systemHistory: expect.objectContaining({
      aegis: expect.objectContaining({
        '1413': expect.objectContaining({
          attempts: [expect.objectContaining({ id: 'attempt-before-jump' })],
        }),
        '5143': expect.objectContaining({
          discovery: expect.objectContaining({ id: 'jump-test-jump-0' }),
        }),
      }),
    }),
  }));
});

it('rejects Coordination jumps while the server phase is Team', async () => {
  let includePhaseClock = true;
  mock.get.mockImplementation(async (path: string) => {
    if (path === 'sessions/s1/wolfAttackState/current') {
      return { exists: false, data: () => undefined, get: () => undefined };
    }
    if (path.includes('/commandReceipts/')) return { exists: false, get: () => undefined };
    const fields: Record<string, unknown> = path.includes('/players/')
      ? { role: mock.role, connected: mock.connected, activeConsoleRoleId: undefined }
      : path.includes('/private/shipConsoleWriteGrant')
        ? {
          type: 'gm-ship-console-write-grant', sessionId: 's1', instanceId: 'bridge', uid: mock.owner,
          shipId: 'aegis', grantedAt: new Date(),
        }
      : path.includes('/gmInstances/')
        ? { uid: mock.owner, connected: mock.connected, lastSeenAt: new Date() }
        : {
          phase: 'active',
          currentTurn: mock.currentTurn,
          ...(includePhaseClock ? { turnPhase: {
            turn: 1,
            airspace: { state: 'restricted', tickerActive: true, pressAccess: false },
          } } : {}),
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
  await expect(moveShipToLocation.run(request({
    ...data, requestId: 'restricted-movement', destination: '5143',
  }))).rejects.toMatchObject({
    code: 'failed-precondition',
    message: expect.stringMatching(/coordination phase/i),
  });
  expect(mock.update).not.toHaveBeenCalled();
  expect(mock.randomInt).not.toHaveBeenCalled();

  includePhaseClock = false;
  await expect(jumpShip.run(request({
    ...data, requestId: 'missing-clock-jump', destination: '5143',
  }))).rejects.toMatchObject({
    code: 'failed-precondition',
    message: expect.stringMatching(/no current server phase/i),
  });
  await expect(moveShipToLocation.run(request({
    ...data, requestId: 'missing-clock-movement', destination: '5143',
  }))).rejects.toMatchObject({
    code: 'failed-precondition',
    message: expect.stringMatching(/no current server phase/i),
  });
  expect(mock.update).not.toHaveBeenCalled();
  expect(mock.set).not.toHaveBeenCalled();
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
    if (path === 'sessions/s1/wolfAttackState/current') {
      return { exists: false, data: () => undefined, get: () => undefined };
    }
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
