import { beforeEach, expect, it, vi } from 'vitest';
import type { CallableRequest } from 'firebase-functions/v2/https';

const mock = vi.hoisted(() => ({
  get: vi.fn(), update: vi.fn(), set: vi.fn(), delete: vi.fn(), role: 'gm', owner: 'u1', connected: true,
  grantShip: 'aegis',
  phase: 'active',
  activeVesselIds: ['aegis', 'dione', 'icebreaker', 'shepherd', 'quellon', 'refinery-124', 'capybara'] as string[],
  vesselActionRevisions: {} as Record<string, number>,
  currentTurn: 1,
  damage: {} as Record<string, unknown>, survivors: {} as Record<string, number>, retry: false,
  shuttleDockings: [] as Array<{ shuttleId: string; shipId: string; dockedAt: string }>,
  shuttleControl: {} as Record<string, unknown>, retainedShuttles: {} as Record<string, unknown>,
  players: [] as Array<{ id: string; fields: Record<string, unknown> }>,
  randomInt: vi.fn(() => 3_100_000_000), randomUUID: vi.fn(() => 'damage-event'),
}));
vi.mock('node:crypto', () => ({ randomInt: mock.randomInt, randomUUID: mock.randomUUID }));
vi.mock('firebase-admin/app', () => ({ initializeApp: vi.fn() }));
vi.mock('firebase-admin/firestore', () => ({
  getFirestore: () => ({
    doc: (path: string) => path,
    collection: (path: string) => path,
    runTransaction: async (callback: (tx: unknown) => unknown) => {
      const tx = { get: mock.get, update: mock.update, set: mock.set, delete: mock.delete };
      if (mock.retry) await callback(tx);
      return callback(tx);
    },
  }),
  FieldValue: { serverTimestamp: () => 'server-time', delete: () => 'delete-field' },
  Timestamp: { now: () => ({ toMillis: () => Date.now() }) },
}));

import { addShipDamage } from './index';
import { ROLE_OWNED_CRAFT_CATALOG } from './craftOwnership';
import { SHIP_DAMAGE_DECKS } from './shipDamage';

function request(data: Record<string, unknown>, uid = 'u1') {
  return { data: data.requestId === undefined ? { ...data, requestId: 'test-damage' } : data, auth: { uid } } as CallableRequest<{
    sessionId: string; shipId: string; instanceId: string;
  }>;
}

beforeEach(() => {
  mock.role = 'gm';
  mock.owner = 'u1';
  mock.grantShip = 'aegis';
  mock.phase = 'active';
  mock.activeVesselIds = ['aegis', 'dione', 'icebreaker', 'shepherd', 'quellon', 'refinery-124', 'capybara'];
  mock.vesselActionRevisions = {};
  mock.currentTurn = 1;
  mock.connected = true;
  mock.damage = {};
  mock.survivors = {};
  mock.shuttleDockings = [];
  mock.shuttleControl = {};
  mock.retainedShuttles = {};
  mock.players = [];
  mock.retry = false;
  mock.randomInt.mockReset();
  mock.randomInt.mockReturnValue(3_100_000_000);
  mock.randomUUID.mockReset();
  mock.randomUUID.mockReturnValue('damage-event');
  mock.update.mockReset();
  mock.set.mockReset();
  mock.delete.mockReset();
  mock.get.mockImplementation(async (path: string) => {
    if (path.includes('/actionAudits/')) return { exists: false, get: () => undefined };
    if (path.includes('/commandReceipts/')) return { exists: false, get: () => undefined };
    if (path === 'sessions/s1/players') return {
      exists: true,
      docs: mock.players.map(({ id, fields }) => ({
        id, exists: true, get: (key: string) => fields[key],
      })),
    };
    if (path.includes('/private/shipConsoleWriteGrant')) {
      const instanceId = path.split('/').at(-3) ?? '';
      const fields = {
        type: 'gm-ship-console-write-grant', sessionId: 's1', instanceId,
        uid: mock.owner, shipId: mock.grantShip, grantedAt: new Date().toISOString(),
      } as Record<string, unknown>;
      return { exists: true, get: (key: string) => fields[key] };
    }
    const configuredPlayer = mock.players.find(({ id }) => id === path.split('/').at(-1));
    const fields: Record<string, unknown> = path.includes('/players/')
      ? { role: mock.role, connected: mock.connected, ...configuredPlayer?.fields }
      : path.includes('/gmInstances/')
        ? { uid: mock.owner, connected: true, lastSeenAt: new Date(), shipConsoleWriteGrant: { shipId: mock.grantShip, grantedAt: new Date().toISOString() } }
        : {
          activeVesselIds: mock.activeVesselIds,
          currentTurn: mock.currentTurn,
          phase: mock.phase,
          vesselActionRevisions: mock.vesselActionRevisions,
          shipDamage: mock.damage,
          shipSurvivors: mock.survivors,
          shuttleDockings: mock.shuttleDockings,
          shuttleControl: mock.shuttleControl,
          retainedShuttles: mock.retainedShuttles,
        };
    return { exists: true, get: (key: string) => fields[key] };
  });
});

const data = { sessionId: 's1', shipId: 'aegis', instanceId: 'bridge' };

function snapshot(fields: Record<string, unknown> = {}, exists = true) {
  return { exists, get: (key: string) => fields[key], data: () => fields };
}

it('draws the printed Capybara Scrap Refinery card through the GM transaction', async () => {
  mock.grantShip = 'capybara';
  mock.randomInt.mockReturnValue(0xffff_ffff);

  await expect(addShipDamage.run(request({ ...data, shipId: 'capybara' })))
    .resolves.toMatchObject({
      card: { card: '7♠', systemId: 'scrap-refinery' },
      destroyed: false,
    });
  expect(mock.update).toHaveBeenCalledWith('sessions/s1', expect.objectContaining({
    'shipDamage.capybara': { damagedSystemIds: ['scrap-refinery'], destroyed: false },
  }));
  expect(mock.set).toHaveBeenCalledWith('sessions/s1/damageDraws/damage-test-damage',
    expect.objectContaining({ shipId: 'capybara', card: '7♠', systemId: 'scrap-refinery' }));
});

it('does not write a Capybara result when its damage deck is exhausted', async () => {
  mock.grantShip = 'capybara';
  mock.damage = {
    capybara: {
      damagedSystemIds: SHIP_DAMAGE_DECKS.capybara.map(({ systemId }) => systemId),
      destroyed: false,
    },
  };

  await expect(addShipDamage.run(request({ ...data, shipId: 'capybara' })))
    .rejects.toMatchObject({
      code: 'failed-precondition',
      message: expect.stringContaining('facilitator ruling required'),
      details: { commandError: 'conflict', reason: 'capybara-damage-deck-exhausted' },
    });
  expect(mock.update).not.toHaveBeenCalled();
  expect(mock.set).not.toHaveBeenCalled();
  expect(mock.delete).not.toHaveBeenCalled();
});

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
  expect(mock.set).toHaveBeenCalledWith('sessions/s1/damageDraws/damage-test-damage', expect.objectContaining({
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

  await expect(addShipDamage.run(request(data))).resolves.toMatchObject({
    card: { card: '6♥', systemId: 'armoured-hull-i', systemName: 'Armoured Hull I' },
    recycled: true, destroyed: false,
  });
  expect(mock.randomInt).toHaveBeenCalledTimes(1);
  expect(mock.randomUUID).not.toHaveBeenCalled();
  expect(mock.set).toHaveBeenCalledTimes(6);
  const eventCalls = mock.set.mock.calls.filter(([path]) => String(path).includes('/damageDraws/'));
  expect(eventCalls).toHaveLength(2);
  expect(eventCalls[0]).toEqual(['sessions/s1/damageDraws/damage-test-damage',
    expect.objectContaining({
      type: 'ship-damage', card: '6♥', systemId: 'armoured-hull-i', systemName: 'Armoured Hull I', recycled: true,
    })]);
  expect(eventCalls[1]).toEqual(['sessions/s1/damageDraws/damage-test-damage',
    expect.objectContaining({
      type: 'ship-damage', card: '6♥', systemId: 'armoured-hull-i', systemName: 'Armoured Hull I', recycled: true,
    })]);
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
  expect(mock.set).toHaveBeenCalledWith('sessions/s1/damageDraws/damage-test-damage', expect.objectContaining({
    type: 'ship-damage', shipId: 'aegis', card: '10♥', systemId: 'reactor',
  }));
});

it('writes a metadata-only server-random audit with a committed damage draw', async () => {
  const requestId = 'damage-audit-1';
  mock.players = [{ id: 'u1', fields: { role: 'gm', connected: true, activeConsoleRoleId: 'admiral' } }];

  await addShipDamage.run(request({ ...data, requestId, expectedRevision: 0 }));

  expect(mock.set).toHaveBeenCalledWith(`sessions/s1/actionAudits/${requestId}`, {
    schemaVersion: 1,
    sessionId: 's1',
    actorUid: 'u1',
    actorRoleId: 'admiral',
    action: 'ship-damage',
    phase: 'active',
    requestId,
    revision: 1,
    outcome: 'committed',
    resolutionSource: 'server-random',
    redactionPolicy: 'action-audit-metadata-only-v1',
    createdAt: 'server-time',
  });
  expect(mock.set).toHaveBeenCalledWith(`sessions/s1/damageDraws/damage-${requestId}`, expect.objectContaining({
    type: 'ship-damage', shipId: 'aegis', card: '10♥', systemId: 'reactor',
  }));
  expect(mock.set).toHaveBeenCalledWith(`sessions/s1/commandReceipts/${requestId}`, expect.objectContaining({
    result: expect.objectContaining({ idempotencyKey: requestId, revision: 0 }),
  }));
  const audit = mock.set.mock.calls.find(([path]) => path === `sessions/s1/actionAudits/${requestId}`)?.[1] as Record<string, unknown>;
  expect(audit).not.toHaveProperty('shipId');
  expect(audit).not.toHaveProperty('card');
  expect(audit).not.toHaveProperty('systemId');
  expect(audit).not.toHaveProperty('result');
});

it('backfills a committed card receipt without rerolling or reapplying damage', async () => {
  const requestId = 'damage-replay-backfill';
  const fingerprint = {
    action: 'add-damage', sessionId: 's1', requestId, actorUid: 'u1',
    instanceId: 'bridge', expectedRevision: 0, payload: { shipId: 'aegis' },
  };
  const result = {
    card: { card: '10♥', systemId: 'reactor', systemName: 'Reactor' }, recycled: false,
    destroyed: false, actorUid: 'u1', actorRoleId: null, vesselId: 'aegis', turn: 1,
    phase: 'active', revision: 0, idempotencyKey: requestId, auditId: `add-damage-${requestId}`,
  };
  const previous = mock.get.getMockImplementation()!;
  mock.phase = 'closed';
  mock.get.mockImplementation(async (path: string) => {
    if (path === `sessions/s1/commandReceipts/${requestId}`) return snapshot({ fingerprint, result });
    if (path === `sessions/s1/actionAudits/${requestId}`) return snapshot({}, false);
    return previous(path);
  });

  await expect(addShipDamage.run(request({ ...data, requestId, expectedRevision: 0 }))).resolves.toEqual(result);

  expect(mock.randomInt).not.toHaveBeenCalled();
  expect(mock.update).not.toHaveBeenCalled();
  expect(mock.set).toHaveBeenCalledTimes(1);
  expect(mock.set).toHaveBeenCalledWith(`sessions/s1/actionAudits/${requestId}`, expect.objectContaining({
    sessionId: 's1', actorUid: 'u1', action: 'ship-damage', phase: 'active',
    requestId, revision: 1, outcome: 'committed', resolutionSource: 'server-random',
    redactionPolicy: 'action-audit-metadata-only-v1',
  }));
});

it('replays an exact committed audit and original damage reply after a phase change', async () => {
  const requestId = 'damage-replay-exact';
  const fingerprint = {
    action: 'add-damage', sessionId: 's1', requestId, actorUid: 'u1',
    instanceId: 'bridge', expectedRevision: 0, payload: { shipId: 'aegis' },
  };
  const result = {
    card: { card: '10♥', systemId: 'reactor', systemName: 'Reactor' }, recycled: false,
    destroyed: false, actorUid: 'u1', actorRoleId: null, vesselId: 'aegis', turn: 1,
    phase: 'active', revision: 0, idempotencyKey: requestId, auditId: `add-damage-${requestId}`,
  };
  const audit = {
    schemaVersion: 1, sessionId: 's1', actorUid: 'u1', actorRoleId: null,
    action: 'ship-damage', phase: 'active', requestId, revision: 1,
    outcome: 'committed', resolutionSource: 'server-random',
    redactionPolicy: 'action-audit-metadata-only-v1', createdAt: 'original-server-time',
  };
  const previous = mock.get.getMockImplementation()!;
  mock.phase = 'closed';
  mock.get.mockImplementation(async (path: string) => {
    if (path === `sessions/s1/commandReceipts/${requestId}`) return snapshot({ fingerprint, result });
    if (path === `sessions/s1/actionAudits/${requestId}`) return snapshot(audit);
    return previous(path);
  });

  await expect(addShipDamage.run(request({ ...data, requestId, expectedRevision: 0 }))).resolves.toEqual(result);

  expect(mock.randomInt).not.toHaveBeenCalled();
  expect(mock.update).not.toHaveBeenCalled();
  expect(mock.set).not.toHaveBeenCalled();
  expect(mock.delete).not.toHaveBeenCalled();
});

it('fails closed when the bound damage receipt has a mismatched standardized audit', async () => {
  const requestId = 'damage-replay-mismatch';
  const fingerprint = {
    action: 'add-damage', sessionId: 's1', requestId, actorUid: 'u1',
    instanceId: 'bridge', expectedRevision: 0, payload: { shipId: 'aegis' },
  };
  const result = {
    card: { card: '10♥', systemId: 'reactor', systemName: 'Reactor' }, recycled: false,
    destroyed: false, actorUid: 'u1', actorRoleId: null, vesselId: 'aegis', turn: 1,
    phase: 'active', revision: 0, idempotencyKey: requestId, auditId: `add-damage-${requestId}`,
  };
  const previous = mock.get.getMockImplementation()!;
  mock.phase = 'closed';
  mock.get.mockImplementation(async (path: string) => {
    if (path === `sessions/s1/commandReceipts/${requestId}`) return snapshot({ fingerprint, result });
    if (path === `sessions/s1/actionAudits/${requestId}`) return snapshot({
      schemaVersion: 1, sessionId: 's1', actorUid: 'u1', actorRoleId: null,
      action: 'repair-damage', phase: 'active', requestId, revision: 1,
      outcome: 'committed', resolutionSource: 'facilitator',
      redactionPolicy: 'action-audit-metadata-only-v1', createdAt: 'server-time',
    });
    return previous(path);
  });

  await expect(addShipDamage.run(request({ ...data, requestId, expectedRevision: 0 })))
    .rejects.toMatchObject({ code: 'failed-precondition', details: { commandError: 'conflict' } });
  expect(mock.randomInt).not.toHaveBeenCalled();
  expect(mock.update).not.toHaveBeenCalled();
  expect(mock.set).not.toHaveBeenCalled();
});

it('fails closed on an orphaned ship damage audit before randomness or mutation', async () => {
  const requestId = 'damage-orphan-audit';
  const previous = mock.get.getMockImplementation()!;
  mock.get.mockImplementation(async (path: string) => {
    if (path === `sessions/s1/actionAudits/${requestId}`) return snapshot({ action: 'ship-damage' });
    return previous(path);
  });

  await expect(addShipDamage.run(request({ ...data, requestId })))
    .rejects.toMatchObject({ code: 'failed-precondition', details: { commandError: 'conflict' } });

  expect(mock.randomInt).not.toHaveBeenCalled();
  expect(mock.update).not.toHaveBeenCalled();
  expect(mock.set).not.toHaveBeenCalled();
});

it('does not write an audit for a stale ship damage receipt', async () => {
  mock.vesselActionRevisions = { aegis: 4 };

  await expect(addShipDamage.run(request({ ...data, requestId: 'damage-stale', expectedRevision: 3 })))
    .resolves.toMatchObject({ status: 'stale', currentRevision: 4 });

  expect(mock.randomInt).not.toHaveBeenCalled();
  expect(mock.update).not.toHaveBeenCalled();
  expect(mock.set).toHaveBeenCalledWith('sessions/s1/commandReceipts/damage-stale', expect.objectContaining({
    result: expect.objectContaining({ status: 'stale', revision: 4 }),
  }));
  expect(mock.set.mock.calls.some(([path]) => String(path).includes('/actionAudits/'))).toBe(false);
});

it('does not reroll the card or event identity when Firestore retries the transaction', async () => {
  mock.retry = true;
  mock.randomInt.mockReturnValueOnce(3_100_000_000).mockReturnValue(0);

  await addShipDamage.run(request(data));

  expect(mock.randomInt).toHaveBeenCalledTimes(1);
  expect(mock.randomUUID).not.toHaveBeenCalled();
  expect(mock.set).toHaveBeenCalledTimes(6);
  const eventCalls = mock.set.mock.calls.filter(([path]) => String(path).includes('/damageDraws/'));
  expect(eventCalls).toHaveLength(2);
  expect(eventCalls[0]).toEqual(['sessions/s1/damageDraws/damage-test-damage',
    expect.objectContaining({ card: '10♥', systemId: 'reactor' })]);
  expect(eventCalls[1]).toEqual(['sessions/s1/damageDraws/damage-test-damage',
    expect.objectContaining({ card: '10♥', systemId: 'reactor' })]);
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

it.each(ROLE_OWNED_CRAFT_CATALOG.filter((craft) => craft.kind === 'shuttle').map((craft) => craft.id))(
  'rejects the registered shuttle %s before randomness or a transaction write',
  async (shuttleId) => {
    await expect(addShipDamage.run(request({ ...data, shipId: shuttleId })))
      .rejects.toMatchObject({ code: 'invalid-argument' });
    expect(mock.randomInt).not.toHaveBeenCalled();
    expect(mock.update).not.toHaveBeenCalled();
    expect(mock.set).not.toHaveBeenCalled();
    expect(mock.delete).not.toHaveBeenCalled();
  },
);

it.each([
  ['aegis', 3100], ['dione', 16000], ['icebreaker', 10100],
  ['shepherd', 8000], ['quellon', 6510], ['refinery-124', 5000],
] as const)('exposes only the printed pod capacity when %s is destroyed', async (shipId, podCapacity) => {
  mock.grantShip = shipId;
  mock.survivors = { [shipId]: 1000 };
  mock.damage = {
    [shipId]: { damagedSystemIds: SHIP_DAMAGE_DECKS[shipId].map(card => card.systemId), destroyed: false },
  };
  await expect(addShipDamage.run(request({ ...data, shipId }))).resolves.toMatchObject({
    destroyed: true, actorUid: 'u1', vesselId: shipId, idempotencyKey: 'test-damage', revision: 1,
  });
  expect(mock.update).toHaveBeenCalledWith('sessions/s1', expect.objectContaining({
    [`shipDamage.${shipId}`]: expect.objectContaining({ destroyed: true }),
    [`shipSurvivors.${shipId}`]: 1000,
  }));
  expect(mock.set).toHaveBeenCalledWith(`sessions/s1/damageDraws/damage-destroyed-${shipId}`, expect.objectContaining({
    type: 'ship-destroyed', shipId, podCapacity,
  }));
  expect(mock.set).toHaveBeenCalledWith('sessions/s1/actionAudits/test-damage', expect.objectContaining({
    action: 'ship-damage', phase: 'active', revision: 1,
    resolutionSource: 'server-random', redactionPolicy: 'action-audit-metadata-only-v1',
  }));
  for (const [, update] of mock.update.mock.calls) {
    expect(Object.keys(update).some(key => /shipResources|shuttleCargo|shuttleFuelled/i.test(key)))
      .toBe(false);
  }
});

it('retains holder-owned shuttles and removes their destroyed AEGIS dock atomically', async () => {
  mock.damage = {
    aegis: {
      damagedSystemIds: SHIP_DAMAGE_DECKS.aegis.map(card => card.systemId),
      destroyed: false,
    },
  };
  mock.shuttleDockings = [
    { shuttleId: 'starlight', shipId: 'aegis', dockedAt: 'SESSION START' },
    { shuttleId: 'pallas', shipId: 'aegis', dockedAt: 'SESSION START' },
    { shuttleId: 'philia', shipId: 'dione', dockedAt: 'SESSION START' },
  ];
  mock.shuttleControl = {
    starlight: {
      shuttleId: 'starlight', ownerRoleId: 'wing-commander', ownerUid: 'wing',
      holderUid: 'holder', revision: 2,
    },
    pallas: {
      shuttleId: 'pallas', ownerRoleId: 'executive-officer', ownerUid: 'xo',
      holderUid: 'xo', revision: 0,
    },
    philia: {
      shuttleId: 'philia', ownerRoleId: 'dione-engineer', ownerUid: 'engineer',
      holderUid: 'engineer', revision: 0,
    },
  };
  mock.players = [
    { id: 'wing', fields: { role: 'player', connected: false, assignedRoleId: 'wing-commander' } },
    { id: 'holder', fields: { role: 'player', connected: true, assignedRoleId: 'admiral' } },
    { id: 'xo', fields: { role: 'player', connected: true, assignedRoleId: 'executive-officer' } },
    { id: 'engineer', fields: { role: 'player', connected: true, assignedRoleId: 'dione-engineer' } },
  ];

  await expect(addShipDamage.run(request(data))).resolves.toMatchObject({ destroyed: true });

  expect(mock.update).toHaveBeenCalledWith('sessions/s1', expect.objectContaining({
    shuttleDockings: [
      { shuttleId: 'philia', shipId: 'dione', dockedAt: 'SESSION START' },
    ],
    shuttleControl: mock.shuttleControl,
    retainedShuttles: {
      starlight: expect.objectContaining({
        status: 'retained', shuttleId: 'starlight', holderUid: 'holder',
        destroyedHostShipId: 'aegis', controlRevision: 2,
      }),
      pallas: expect.objectContaining({
        status: 'retained', shuttleId: 'pallas', holderUid: 'xo',
        destroyedHostShipId: 'aegis', controlRevision: 0,
      }),
    },
  }));
  expect(mock.delete.mock.calls.map(([path]) => path).sort()).toEqual([
    'sessions/s1/shuttleDepartures/pallas',
    'sessions/s1/shuttleDepartures/starlight',
    'sessions/s1/shuttleTransitChains/pallas',
    'sessions/s1/shuttleTransitChains/starlight',
  ]);
});

it.each([
  ['forged printed owner', { ownerRoleId: 'executive-officer', ownerUid: 'xo', holderUid: 'holder' }],
  ['ghost holder', { ownerRoleId: 'wing-commander', ownerUid: 'wing', holderUid: 'ghost' }],
] as const)('rejects %s before any destruction write', async (_name, custody) => {
  mock.damage = {
    aegis: {
      damagedSystemIds: SHIP_DAMAGE_DECKS.aegis.map(card => card.systemId),
      destroyed: false,
    },
  };
  mock.shuttleDockings = [
    { shuttleId: 'starlight', shipId: 'aegis', dockedAt: 'SESSION START' },
  ];
  mock.shuttleControl = {
    starlight: {
      shuttleId: 'starlight', revision: 1, ...custody,
    },
  };
  mock.players = [
    { id: 'wing', fields: { role: 'player', connected: false, assignedRoleId: 'wing-commander' } },
    { id: 'holder', fields: { role: 'player', connected: false, assignedRoleId: 'admiral' } },
    { id: 'xo', fields: { role: 'player', connected: true, assignedRoleId: 'executive-officer' } },
  ];

  await expect(addShipDamage.run(request(data))).rejects.toMatchObject({
    code: 'failed-precondition', details: { commandError: 'conflict' },
  });
  expect(mock.update).not.toHaveBeenCalled();
  expect(mock.set).not.toHaveBeenCalled();
  expect(mock.delete).not.toHaveBeenCalled();
});

it('does not advance or emit another catastrophe when a destroyed ship is drawn again', async () => {
  mock.damage = {
    aegis: {
      damagedSystemIds: [
        'fighter-bay-alpha', 'fighter-bay-bravo', 'command-and-control',
        'missile-launchers', 'point-defence-lasers', 'armoured-hull-i',
        'armoured-hull-ii', 'storage', 'jump-drive', 'reactor',
        'construction-bay', 'shuttle-bay-zeta', 'shuttle-bay-omega',
      ],
      destroyed: true,
    },
  };
  mock.get.mockImplementation(async (path: string) => {
    if (path.includes('/actionAudits/')) return { exists: false, get: () => undefined };
    if (path.includes('/commandReceipts/')) return { exists: false, get: () => undefined };
    if (path.includes('/damageDraws/')) return { exists: true, get: () => undefined };
    if (path.includes('/private/shipConsoleWriteGrant')) {
      const instanceId = path.split('/').at(-3) ?? '';
      const fields = {
        type: 'gm-ship-console-write-grant', sessionId: 's1', instanceId,
        uid: mock.owner, shipId: mock.grantShip, grantedAt: new Date().toISOString(),
      } as Record<string, unknown>;
      return { exists: true, get: (key: string) => fields[key] };
    }
    const fields: Record<string, unknown> = path.includes('/players/')
      ? { role: mock.role, connected: mock.connected }
      : path.includes('/gmInstances/')
        ? { uid: mock.owner, connected: true, lastSeenAt: new Date(), shipConsoleWriteGrant: { shipId: mock.grantShip, grantedAt: new Date().toISOString() } }
        : {
          activeVesselIds: ['aegis', 'dione', 'icebreaker', 'shepherd', 'quellon', 'refinery-124', 'capybara'],
          shipDamage: mock.damage,
        };
    return { exists: true, get: (key: string) => fields[key] };
  });

  await expect(addShipDamage.run(request(data))).resolves.toMatchObject({ destroyed: true, revision: 0 });
  expect(mock.update).not.toHaveBeenCalled();
  expect(mock.set).toHaveBeenCalledTimes(1);
  expect(mock.set).toHaveBeenCalledWith('sessions/s1/commandReceipts/test-damage', expect.objectContaining({
    result: expect.objectContaining({ destroyed: true, revision: 0 }),
  }));
  expect(mock.set.mock.calls.some(([path]) => String(path).includes('/actionAudits/'))).toBe(false);
});

it('records a missing catastrophe event without advancing an already-destroyed ship revision', async () => {
  mock.damage = {
    aegis: { damagedSystemIds: SHIP_DAMAGE_DECKS.aegis.map(({ systemId }) => systemId), destroyed: true },
  };
  mock.vesselActionRevisions = { aegis: 4 };
  const previous = mock.get.getMockImplementation()!;
  mock.get.mockImplementation(async (path: string) => {
    if (path === 'sessions/s1/damageDraws/damage-destroyed-aegis') return snapshot({}, false);
    return previous(path);
  });

  await expect(addShipDamage.run(request({ ...data, requestId: 'repair-missing-catastrophe', expectedRevision: 4 })))
    .resolves.toMatchObject({ destroyed: true, revision: 4 });

  expect(mock.update).not.toHaveBeenCalled();
  expect(mock.set).toHaveBeenCalledWith('sessions/s1/damageDraws/damage-destroyed-aegis', expect.objectContaining({
    type: 'ship-destroyed', shipId: 'aegis',
  }));
  expect(mock.set).toHaveBeenCalledWith('sessions/s1/actionAudits/repair-missing-catastrophe', expect.objectContaining({
    action: 'ship-damage', phase: 'active', revision: 4, resolutionSource: 'server-random',
  }));
});

it('does not backfill an audit for an ambiguous terminal no-op receipt', async () => {
  const requestId = 'damage-terminal-replay';
  const fingerprint = {
    action: 'add-damage', sessionId: 's1', requestId, actorUid: 'u1',
    instanceId: 'bridge', expectedRevision: 4, payload: { shipId: 'aegis' },
  };
  const result = {
    destroyed: true, actorUid: 'u1', actorRoleId: null, vesselId: 'aegis', turn: 1,
    phase: 'active', revision: 4, idempotencyKey: requestId, auditId: `add-damage-${requestId}`,
  };
  const previous = mock.get.getMockImplementation()!;
  mock.phase = 'closed';
  mock.get.mockImplementation(async (path: string) => {
    if (path === `sessions/s1/commandReceipts/${requestId}`) return snapshot({ fingerprint, result });
    if (path === `sessions/s1/actionAudits/${requestId}`) return snapshot({}, false);
    return previous(path);
  });

  await expect(addShipDamage.run(request({ ...data, requestId, expectedRevision: 4 }))).resolves.toEqual(result);

  expect(mock.randomInt).not.toHaveBeenCalled();
  expect(mock.update).not.toHaveBeenCalled();
  expect(mock.set).not.toHaveBeenCalled();
});

it('commits total fleet loss atomically when the final active full ship is destroyed', async () => {
  mock.activeVesselIds = ['aegis'];
  mock.currentTurn = 0;
  mock.damage = {
    aegis: {
      damagedSystemIds: SHIP_DAMAGE_DECKS.aegis.map(({ systemId }) => systemId),
      destroyed: false,
    },
  };

  await expect(addShipDamage.run(request({ ...data, requestId: 'final-ship' })))
    .resolves.toMatchObject({ destroyed: true });

  expect(mock.update).toHaveBeenCalledWith('sessions/s1', expect.objectContaining({
    'shipDamage.aegis': expect.objectContaining({ destroyed: true }),
    phase: 'failure',
    gameOutcome: expect.objectContaining({
      type: 'game-outcome', result: 'failure', cause: 'total-fleet-loss', cycle: 0,
    }),
    survivorOutcome: expect.objectContaining({
      type: 'survivor-outcome', cycle: 0, fleetShipPopulation: 2_500,
      evacuatedPopulation: 2_500, escapePodCapacity: 3_100,
      lostPopulation: 0, finalSurvivors: 2_500,
      survivingShipIds: [], lostOrDestroyedShipIds: ['aegis'],
    }),
    turnPhase: 'delete-field',
    turnState: 'delete-field',
    turnStartAnnouncement: 'delete-field',
  }));
  const terminalUpdate = mock.update.mock.calls.find(([path, fields]) =>
    path === 'sessions/s1' && (fields as Record<string, unknown>).phase === 'failure')?.[1] as Record<string, unknown>;
  expect(terminalUpdate).not.toHaveProperty('shuttleCargo');
  expect(terminalUpdate).not.toHaveProperty('smallShipStates');
});

it.each([['aegis', 2000], ['dione', 95000], ['icebreaker', 37000], ['shepherd', 28000], ['quellon', 28000], ['refinery-124', 18500], ['capybara', 18500]])(
  'moves %s survivors down its printed track on ordinary damage', async (shipId, population) => {
    mock.grantShip = shipId;
    mock.randomInt.mockReturnValue(0);
    await addShipDamage.run(request({ ...data, shipId }));
    expect(mock.update).toHaveBeenCalledWith('sessions/s1', expect.objectContaining({ [`shipSurvivors.${shipId}`]: population }));
  },
);
it.each(['aegis', 'capybara'])('repairs all %s damage and restores its deck without restoring casualties', async shipId => {
  mock.grantShip = shipId;
  const { repairAllShipDamage } = await import('./index');
  mock.damage = { [shipId]: { damagedSystemIds: ['reactor'], destroyed: true } };
  await repairAllShipDamage.run(request({ ...data, shipId }));
  expect(mock.update).toHaveBeenCalledWith('sessions/s1', expect.objectContaining({
    [`shipDamage.${shipId}`]: { damagedSystemIds: [], destroyed: false }, updatedAt: 'server-time',
    [`vesselActionRevisions.${shipId}`]: 1,
  }));
  expect(mock.set).toHaveBeenCalledWith('sessions/s1/events/repair-test-damage', expect.objectContaining({ type: 'ship-repaired', shipId, actorUid: 'u1' }));
});
it('writes a metadata-only facilitator audit with repair, event, and receipt in the transaction', async () => {
  const { repairAllShipDamage } = await import('./index');
  const requestId = 'repair-audit-1';

  await expect(repairAllShipDamage.run(request({ ...data, requestId }))).resolves.toMatchObject({
    repaired: true, revision: 1, idempotencyKey: requestId,
  });

  expect(mock.set).toHaveBeenCalledWith(`sessions/s1/actionAudits/${requestId}`, {
    schemaVersion: 1,
    sessionId: 's1',
    actorUid: 'u1',
    actorRoleId: null,
    action: 'repair-damage',
    phase: 'active',
    requestId,
    revision: 1,
    outcome: 'committed',
    resolutionSource: 'facilitator',
    redactionPolicy: 'action-audit-metadata-only-v1',
    createdAt: 'server-time',
  });
  expect(mock.set).toHaveBeenCalledWith(`sessions/s1/events/repair-${requestId}`, expect.objectContaining({
    type: 'ship-repaired', shipId: 'aegis', actorUid: 'u1',
  }));
  expect(mock.set).toHaveBeenCalledWith(`sessions/s1/commandReceipts/${requestId}`, expect.objectContaining({
    fingerprint: expect.objectContaining({ action: 'repair-damage', requestId, actorUid: 'u1' }),
  }));
  const audit = mock.set.mock.calls.find(([path]) => path === `sessions/s1/actionAudits/${requestId}`)?.[1] as Record<string, unknown>;
  expect(Object.keys(audit).sort()).toEqual([
    'action', 'actorRoleId', 'actorUid', 'createdAt', 'outcome', 'phase', 'redactionPolicy',
    'requestId', 'resolutionSource', 'revision', 'schemaVersion', 'sessionId',
  ].sort());
  expect(audit).not.toHaveProperty('shipId');
  expect(audit).not.toHaveProperty('damagedSystemIds');
});
it('does not audit a stale repair receipt', async () => {
  const { repairAllShipDamage } = await import('./index');
  mock.vesselActionRevisions = { aegis: 4 };

  await expect(repairAllShipDamage.run(request({ ...data, requestId: 'repair-stale', expectedRevision: 3 })))
    .resolves.toMatchObject({ status: 'stale', currentRevision: 4 });

  expect(mock.update).not.toHaveBeenCalled();
  expect(mock.set).toHaveBeenCalledWith('sessions/s1/commandReceipts/repair-stale', expect.objectContaining({
    result: expect.objectContaining({ status: 'stale', revision: 4 }),
  }));
  expect(mock.set.mock.calls.some(([path]) => String(path).includes('/actionAudits/'))).toBe(false);
  expect(mock.set.mock.calls.some(([path]) => String(path).includes('/events/repair-'))).toBe(false);
});
it('replays a receipt after a phase change and backfills its original facilitator audit metadata', async () => {
  const { repairAllShipDamage } = await import('./index');
  const requestId = 'repair-replay';
  const result = {
    repaired: true,
    actorUid: 'u1', actorRoleId: null, vesselId: 'aegis', turn: 1,
    phase: 'active', revision: 2, idempotencyKey: requestId,
    auditId: `repair-damage-${requestId}`,
  };
  const fingerprint = {
    action: 'repair-damage', sessionId: 's1', requestId, actorUid: 'u1',
    instanceId: 'bridge', expectedRevision: null, payload: { shipId: 'aegis' },
  };
  const previous = mock.get.getMockImplementation()!;
  mock.phase = 'closed';
  mock.get.mockImplementation(async (path: string) => {
    if (path === `sessions/s1/commandReceipts/${requestId}`) return snapshot({ fingerprint, result });
    if (path === `sessions/s1/actionAudits/${requestId}`) return snapshot({}, false);
    return previous(path);
  });

  await expect(repairAllShipDamage.run(request({ ...data, requestId }))).resolves.toEqual(result);

  expect(mock.update).not.toHaveBeenCalled();
  expect(mock.set).toHaveBeenCalledWith(`sessions/s1/actionAudits/${requestId}`, {
    schemaVersion: 1, sessionId: 's1', actorUid: 'u1', actorRoleId: null,
    action: 'repair-damage', phase: 'active', requestId, revision: 2,
    outcome: 'committed', resolutionSource: 'facilitator',
    redactionPolicy: 'action-audit-metadata-only-v1', createdAt: 'server-time',
  });
});
it('fails closed when a repair audit is orphaned from its bound receipt', async () => {
  const { repairAllShipDamage } = await import('./index');
  const requestId = 'repair-orphan';
  const previous = mock.get.getMockImplementation()!;
  mock.get.mockImplementation(async (path: string) =>
    path === `sessions/s1/actionAudits/${requestId}` ? snapshot({ action: 'repair-damage' }) : previous(path));

  await expect(repairAllShipDamage.run(request({ ...data, requestId })))
    .rejects.toMatchObject({ code: 'failed-precondition', details: { commandError: 'conflict' } });
  expect(mock.update).not.toHaveBeenCalled();
  expect(mock.set).not.toHaveBeenCalled();
});
it('fails closed when a committed repair receipt has a mismatched audit', async () => {
  const { repairAllShipDamage } = await import('./index');
  const requestId = 'repair-audit-mismatch';
  const fingerprint = {
    action: 'repair-damage', sessionId: 's1', requestId, actorUid: 'u1',
    instanceId: 'bridge', expectedRevision: null, payload: { shipId: 'aegis' },
  };
  const result = {
    repaired: true, actorUid: 'u1', actorRoleId: null, vesselId: 'aegis', turn: 1,
    phase: 'active', revision: 2, idempotencyKey: requestId,
    auditId: `repair-damage-${requestId}`,
  };
  const previous = mock.get.getMockImplementation()!;
  mock.get.mockImplementation(async (path: string) => {
    if (path === `sessions/s1/commandReceipts/${requestId}`) return snapshot({ fingerprint, result });
    if (path === `sessions/s1/actionAudits/${requestId}`) return snapshot({
      schemaVersion: 1, sessionId: 's1', actorUid: 'u1', actorRoleId: null,
      action: 'repair-damage', phase: 'active', requestId, revision: 1,
      outcome: 'committed', resolutionSource: 'facilitator',
      redactionPolicy: 'action-audit-metadata-only-v1', createdAt: 'server-time',
    });
    return previous(path);
  });

  await expect(repairAllShipDamage.run(request({ ...data, requestId })))
    .rejects.toMatchObject({ code: 'failed-precondition', details: { commandError: 'conflict' } });
  expect(mock.update).not.toHaveBeenCalled();
  expect(mock.set).not.toHaveBeenCalled();
});
it('fails closed when a repair receipt envelope names a different audit action', async () => {
  const { repairAllShipDamage } = await import('./index');
  const requestId = 'repair-wrong-audit-id';
  const fingerprint = {
    action: 'repair-damage', sessionId: 's1', requestId, actorUid: 'u1',
    instanceId: 'bridge', expectedRevision: null, payload: { shipId: 'aegis' },
  };
  const result = {
    repaired: true, actorUid: 'u1', actorRoleId: null, vesselId: 'aegis', turn: 1,
    phase: 'active', revision: 2, idempotencyKey: requestId,
    auditId: 'some-other-action-request',
  };
  const previous = mock.get.getMockImplementation()!;
  mock.get.mockImplementation(async (path: string) => {
    if (path === `sessions/s1/commandReceipts/${requestId}`) return snapshot({ fingerprint, result });
    return previous(path);
  });
  mock.phase = 'closed';

  await expect(repairAllShipDamage.run(request({ ...data, requestId })))
    .rejects.toMatchObject({ code: 'failed-precondition', details: { commandError: 'conflict' } });
  expect(mock.update).not.toHaveBeenCalled();
  expect(mock.set).not.toHaveBeenCalled();
});
it('denies a repair when the scoped GM grant names a different ship', async () => {
  const { repairAllShipDamage } = await import('./index');
  mock.grantShip = 'dione';

  await expect(repairAllShipDamage.run(request({ ...data, requestId: 'repair-wrong-grant' })))
    .rejects.toMatchObject({ code: 'permission-denied' });
  expect(mock.update).not.toHaveBeenCalled();
  expect(mock.set).not.toHaveBeenCalled();
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
it('rejects damage and repair mutations after pursuit failure without writing', async () => {
  const { repairAllShipDamage } = await import('./index');
  mock.phase = 'failure';
  await expect(addShipDamage.run(request({ ...data, requestId: 'terminal-damage' })))
    .rejects.toMatchObject({ code: 'failed-precondition', message: expect.stringMatching(/endgame evaluation/i) });
  await expect(repairAllShipDamage.run(request({ ...data, requestId: 'terminal-repair' })))
    .rejects.toMatchObject({ code: 'failed-precondition', message: expect.stringMatching(/endgame evaluation/i) });
  expect(mock.update).not.toHaveBeenCalled();
  expect(mock.set).not.toHaveBeenCalled();
});
