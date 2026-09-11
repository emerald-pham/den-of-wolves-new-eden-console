import { beforeEach, expect, it, vi } from 'vitest';
import type { CallableRequest } from 'firebase-functions/v2/https';
import { Timestamp } from 'firebase-admin/firestore';

const roleIds = [
  'admiral', 'wing-commander', 'icebreaker-miner', 'shepherd-scientist',
  'quellon-explorer', 'refinery-124-pdf-colonel',
  'joint-engineering-quellon-refinery', 'joint-engineering-shepherd-icebreaker',
];

const mock = vi.hoisted(() => ({
  get: vi.fn(),
  update: vi.fn(),
  set: vi.fn(),
  session: {} as Record<string, unknown>,
  playerDocs: [] as Array<{ id: string; fields: Record<string, unknown> }>,
  instanceDocs: [] as Array<{ id: string; fields: Record<string, unknown> }>,
  seatDocs: [] as Array<{ id: string; fields: Record<string, unknown> }>,
  secretDocs: [] as string[],
  secretPayloads: {} as Record<string, Record<string, unknown>>,
  secretAudiences: {} as Record<string, readonly string[]>,
  priorReply: undefined as unknown,
  priorFingerprint: undefined as unknown,
  legacyNamespacePaths: new Set<string>(),
  randomInt: vi.fn(() => 0),
}));

vi.mock('firebase-admin/app', () => ({ initializeApp: vi.fn() }));
vi.mock('firebase-admin/firestore', () => ({
  Timestamp: class MockTimestamp {
    constructor(private readonly date: Date) {}
    static now() { return new MockTimestamp(new Date('2026-09-07T12:00:00.000Z')); }
    static fromDate(value: Date) { return new MockTimestamp(value); }
    static fromMillis(value: number) { return new MockTimestamp(new Date(value)); }
    toDate() { return this.date; }
    toMillis() { return this.date.getTime(); }
  },
  getFirestore: () => ({
    doc: (path: string) => ({ path, id: path.split('/').at(-1) }),
    collection: (path: string) => ({ path }),
    runTransaction: (callback: (tx: unknown) => unknown) => callback({
      get: mock.get,
      update: mock.update,
      set: mock.set,
      delete: vi.fn(),
    }),
  }),
  FieldValue: { delete: () => 'delete-field', serverTimestamp: () => 'server-time' },
}));
vi.mock('node:crypto', () => ({
  randomInt: mock.randomInt,
  randomUUID: vi.fn(() => 'start-test-uuid'),
}));

import { setFacilitatorResponsibility, startGame } from './index';
import { activeVesselIdsForRoles, stableSeatsForRoles } from './gameSetup';
import { recommendedRoleIds } from './roleConfiguration';

function snapshot(fields: Record<string, unknown>, path: string, exists = true) {
  return {
    exists,
    id: path.split('/').at(-1),
    ref: { path },
    get: (field: string) => fields[field],
  };
}

function request(data: Record<string, unknown>, uid = 'u1') {
  return { data, auth: { uid } } as CallableRequest<Record<string, unknown>>;
}

function provisionProductionRoster(
  playerCount: 8 | 19 | 20,
  options: {
    readonly press?: 'claimed' | 'unclaimed' | 'disabled' | 'multiple' | 'stale';
    readonly extraGm?: boolean;
  } = {},
) {
  const activeRoleIds = [...recommendedRoleIds(playerCount)];
  const corePlayers = activeRoleIds.map((roleId, index) => ({
    id: `core-${index + 1}`,
    fields: {
      connected: true,
      role: 'player',
      assignedRoleId: roleId,
      seatId: roleId,
      activeConsoleRoleId: null,
    },
  }));
  const pressMode = options.press;
  const pressPlayers = pressMode === undefined ? [] : [{
    id: 'press-21',
    fields: {
      connected: true,
      role: 'player',
      assignedRoleId: null,
      seatId: null,
      activeConsoleRoleId: 'press-officer',
      ...(pressMode === 'stale' ? { lastSeenAt: new Date(Date.now() - 60_000) } : {}),
    },
  }, ...(pressMode === 'multiple' ? [{
    id: 'press-22',
    fields: {
      connected: true,
      role: 'player',
      assignedRoleId: null,
      seatId: null,
      activeConsoleRoleId: 'press-officer',
    },
  }] : [])];
  const extraGm = options.extraGm
    ? [{ id: 'gm-observer', fields: { connected: true, role: 'gm', assignedRoleId: null, seatId: null } }]
    : [];
  mock.session = {
    ...mock.session,
    phase: 'casting',
    setupRevision: 0,
    playerCount,
    expansion: playerCount >= 19 ? 'capybara' : 'base',
    activeRoleIds,
    activeVesselIds: activeVesselIdsForRoles(activeRoleIds),
    ...(pressMode === 'claimed' ? { pressHolderUid: 'press-21', pressEnabled: true } :
      pressMode === 'unclaimed' ? { pressHolderUid: null, pressEnabled: true } :
        pressMode === 'disabled' ? { pressHolderUid: 'press-21', pressEnabled: false } :
          pressMode === 'multiple' ? { pressHolderUid: 'press-21', pressEnabled: true } :
            pressMode === 'stale' ? { pressHolderUid: 'press-21', pressEnabled: true } :
              { pressHolderUid: null, pressEnabled: true }),
  };
  mock.playerDocs = [
    { id: 'u1', fields: { connected: true, role: 'gm', assignedRoleId: null, seatId: null } },
    ...corePlayers,
    ...pressPlayers,
    ...extraGm,
  ];
  mock.instanceDocs = [
    { id: 'bridge', fields: { uid: 'u1', responsibility: 'main' } },
    { id: 'desk', fields: { uid: 'u1', responsibility: 'assistant' } },
    ...(options.extraGm ? [{ id: 'observer-bridge', fields: { uid: 'gm-observer' } }] : []),
  ];
  mock.seatDocs = stableSeatsForRoles(activeRoleIds).map((seat, index) => ({
    id: seat.id,
    fields: { ...seat, status: 'claimed', holderUid: `core-${index + 1}` },
  }));
  mock.secretDocs = [];
  mock.secretPayloads = {};
  mock.secretAudiences = {};
}

beforeEach(() => {
  mock.get.mockReset();
  mock.update.mockReset();
  mock.set.mockReset();
  mock.priorReply = undefined;
  mock.priorFingerprint = undefined;
  mock.legacyNamespacePaths.clear();
  mock.randomInt.mockClear();
  mock.secretPayloads = {};
  mock.secretAudiences = {};
  mock.session = {
    phase: 'casting',
    configurationLocked: false,
    setupRevision: 0,
    playerCount: 8,
    currentTurn: 0,
    activeRoleIds: roleIds,
    activeVesselIds: activeVesselIdsForRoles(roleIds),
    capybaraEnabled: true,
    dioneEnabled: true,
  };
  mock.playerDocs = [
    { id: 'u1', fields: { connected: true, role: 'gm', assignedRoleId: null, seatId: null } },
    ...roleIds.map((roleId, index) => ({
    id: `u${index + 2}`,
    fields: {
      connected: true,
      role: 'player',
      assignedRoleId: roleId,
      seatId: roleId,
    },
    })),
  ];
  mock.instanceDocs = [
    { id: 'bridge', fields: { uid: 'u1', responsibility: 'main' } },
    { id: 'desk', fields: { uid: 'u1', responsibility: 'assistant' } },
  ];
  mock.secretDocs = [];
  mock.seatDocs = stableSeatsForRoles(roleIds).map((seat, index) => ({
    id: seat.id,
    fields: { ...seat, status: 'claimed', holderUid: `u${index + 2}`, claimedAt: '2026-09-09T00:00:00.000Z' },
  }));
  mock.get.mockImplementation(async (ref: { path: string }) => {
    if (ref.path === 'sessions/s1') return snapshot(mock.session, ref.path);
    const playerMatch = ref.path.match(/^sessions\/s1\/players\/([^/]+)$/);
    if (playerMatch) {
      const player = mock.playerDocs.find(({ id }) => id === playerMatch[1]);
      return player ? snapshot(player.fields, ref.path) : snapshot({}, ref.path, false);
    }
    const instanceMatch = ref.path.match(/^sessions\/s1\/gmInstances\/([^/]+)$/);
    if (instanceMatch) {
      const instance = mock.instanceDocs.find(({ id }) => id === instanceMatch[1]);
      return instance ? snapshot(instance.fields, ref.path) : snapshot({}, ref.path, false);
    }
    if (ref.path === 'sessionStartRequests/s1_start-1') {
      return mock.priorReply === undefined
        ? snapshot({}, ref.path, false)
        : snapshot({ reply: mock.priorReply, fingerprint: mock.priorFingerprint }, ref.path);
    }
    if (mock.legacyNamespacePaths.has(ref.path)) return snapshot({ legacy: true }, ref.path);
    if (ref.path === 'sessions/s1/players') {
      return { exists: true, docs: mock.playerDocs.map(({ id, fields }) => snapshot(fields, `sessions/s1/players/${id}`)) };
    }
    if (ref.path === 'sessions/s1/gmInstances') {
      return { exists: true, docs: mock.instanceDocs.map(({ id, fields }) => snapshot(fields, `sessions/s1/gmInstances/${id}`)) };
    }
    if (ref.path === 'sessions/s1/seats') {
      return { exists: true, docs: mock.seatDocs.map(({ id, fields }) => snapshot(fields, `sessions/s1/seats/${id}`)) };
    }
    if (ref.path === 'sessions/s1/secrets') {
      return {
        exists: true,
        docs: mock.secretDocs.map((id) => snapshot({
          visibleToUids: mock.secretAudiences[id] ?? [id.slice('loyalty-'.length)],
          payload: mock.secretPayloads[id],
        }, `sessions/s1/secrets/${id}`)),
      };
    }
    return snapshot({}, ref.path, false);
  });
});

it('records a distinct facilitator responsibility', async () => {
  mock.instanceDocs = [{ id: 'bridge', fields: { uid: 'u1' } }];
  await expect(setFacilitatorResponsibility.run(request({
    sessionId: 's1', instanceId: 'bridge', responsibility: 'main',
    requestId: 'responsibility-1', expectedSetupRevision: 0, mode: 'share',
  }))).resolves.toMatchObject({
    status: 'committed', setupRevision: 1,
    responsibilities: ['main', 'assistant'],
    coverage: { main: ['bridge'], assistant: ['bridge'] },
  });
  expect(mock.update).toHaveBeenCalledWith(
    expect.objectContaining({ path: 'sessions/s1/gmInstances/bridge' }),
    { responsibilities: ['main', 'assistant'], responsibility: 'main' },
  );
});

it('starts a fully staffed roster in one transaction with locked setup, Turn 1, and pursuit 2', async () => {
  await expect(startGame.run(request({
    sessionId: 's1', instanceId: 'bridge', requestId: 'start-1', expectedSetupRevision: 0,
  }))).resolves.toMatchObject({
    sessionId: 's1', currentTurn: 1, setupRevision: 1,
    turnStartAnnouncement: { turn: 1 },
    turnPhase: { turn: 1, airspace: { state: 'restricted' } },
  });
  expect(mock.update).toHaveBeenCalledWith(expect.objectContaining({ path: 'sessions/s1' }), expect.objectContaining({
    phase: 'active', configurationLocked: true, setupRevision: 1, pursuitGroups: { fleet: 2 },
  }));
  expect(mock.set).toHaveBeenCalledWith(
    expect.objectContaining({ path: 'sessionStartRequests/s1_start-1' }),
    expect.objectContaining({ requestId: 'start-1' }),
  );
});

it('reports a typed setup error for a malformed persisted high-count mode before writes', async () => {
  provisionProductionRoster(19);
  mock.session = { ...mock.session, expansion: 'base' };

  await expect(startGame.run(request({
    sessionId: 's1', instanceId: 'bridge', requestId: 'start-malformed-mode', expectedSetupRevision: 0,
  }))).rejects.toMatchObject({
    code: 'failed-precondition',
    message: expect.stringMatching(/Stored setup configuration is invalid/i),
  });
  expect(mock.update).not.toHaveBeenCalled();
  expect(mock.set).not.toHaveBeenCalled();
});

it('records the same effective none mode used by the lock for a legacy base tuple', async () => {
  provisionProductionRoster(8);
  mock.session = { ...mock.session, capybaraEnabled: false };

  await expect(startGame.run(request({
    sessionId: 's1', instanceId: 'bridge', requestId: 'start-legacy-none', expectedSetupRevision: 0,
  }))).resolves.toMatchObject({
    status: 'committed',
    setupReceipt: expect.objectContaining({ mode: 'none' }),
  });
});

it('durably upgrades a sole legacy singular GM lane while committing the start', async () => {
  mock.instanceDocs = [{ id: 'bridge', fields: { uid: 'u1', responsibility: 'main' } }];

  await expect(startGame.run(request({
    sessionId: 's1', instanceId: 'bridge', requestId: 'start-legacy-gm', expectedSetupRevision: 0,
  }))).resolves.toMatchObject({ status: 'committed', setupRevision: 1 });
  expect(mock.update).toHaveBeenCalledWith(
    expect.objectContaining({ path: 'sessions/s1/gmInstances/bridge' }),
    { responsibilities: ['main', 'assistant'], responsibility: 'main' },
  );
});

it('returns the original result as replayed without repeating start writes', async () => {
  const setupReceipt = {
    source: 'routine-start', playerCount: 8, mode: 'base',
    rosterIds: [...roleIds], pressEligibility: { enabled: true, activeClaimCount: 0, claimed: false },
    excludedGmCount: 1, wolfCount: 1, wolfRule: 'one-wolf-at-8-13',
    selectedWolfRoleIds: ['admiral'], eligibleRoleIds: [...roleIds], orderedModifiers: [],
    resultCount: 8, loyaltySource: 'automatic-default', request: {},
    expectedSetupRevision: 0, committedSetupRevision: 1, actorUid: 'u1',
    serverTime: '2026-09-09T00:00:00.000Z', event: 'game-started',
  };
  mock.priorReply = {
    status: 'committed', sessionId: 's1', requestId: 'start-1', currentTurn: 1,
    setupRevision: 1, setupReceipt,
  };
  mock.priorFingerprint = {
    sessionId: 's1', requestId: 'start-1', actorUid: 'u1', instanceId: 'bridge',
    expectedSetupRevision: 0,
  };
  mock.update.mockClear();
  mock.set.mockClear();

  await expect(startGame.run(request({
    sessionId: 's1', instanceId: 'bridge', requestId: 'start-1', expectedSetupRevision: 0,
  }))).resolves.toEqual(expect.objectContaining({
    status: 'replayed', sessionId: 's1', requestId: 'start-1', currentTurn: 1,
    setupRevision: 1, setupReceipt,
  }));
  expect(mock.update).not.toHaveBeenCalled();
  expect(mock.set).not.toHaveBeenCalled();
});

it('replays a stored stale start disposition as stale, never as committed', async () => {
  mock.priorReply = {
    status: 'stale', sessionId: 's1', requestId: 'start-1',
    expectedSetupRevision: 0, currentSetupRevision: 1,
  };
  mock.priorFingerprint = {
    sessionId: 's1', requestId: 'start-1', actorUid: 'u1', instanceId: 'bridge',
    expectedSetupRevision: 0,
  };
  mock.update.mockClear();
  mock.set.mockClear();

  await expect(startGame.run(request({
    sessionId: 's1', instanceId: 'bridge', requestId: 'start-1', expectedSetupRevision: 0,
  }))).resolves.toEqual(mock.priorReply);
  expect(mock.update).not.toHaveBeenCalled();
  expect(mock.set).not.toHaveBeenCalled();
});

it('denies a replay from a disconnected facilitator instance before revealing its result', async () => {
  mock.priorReply = {
    status: 'committed', sessionId: 's1', requestId: 'start-1', currentTurn: 1,
    setupRevision: 1, setupReceipt: { selectedWolfRoleIds: ['admiral'] },
  };
  mock.priorFingerprint = {
    sessionId: 's1', requestId: 'start-1', actorUid: 'u1', instanceId: 'bridge',
    expectedSetupRevision: 0,
  };
  mock.instanceDocs = [{ id: 'bridge', fields: { uid: 'u1', connected: false } }];
  mock.update.mockClear();
  mock.set.mockClear();

  await expect(startGame.run(request({
    sessionId: 's1', instanceId: 'bridge', requestId: 'start-1', expectedSetupRevision: 0,
  }))).rejects.toMatchObject({ code: 'permission-denied' });
  expect(mock.update).not.toHaveBeenCalled();
  expect(mock.set).not.toHaveBeenCalled();
});

it('denies a replay from a stale facilitator lease using a Firestore Timestamp shape', async () => {
  mock.priorReply = {
    status: 'committed', sessionId: 's1', requestId: 'start-1', currentTurn: 1,
    setupRevision: 1, setupReceipt: { selectedWolfRoleIds: ['admiral'] },
  };
  mock.priorFingerprint = {
    sessionId: 's1', requestId: 'start-1', actorUid: 'u1', instanceId: 'bridge',
    expectedSetupRevision: 0,
  };
  mock.instanceDocs = [{
    id: 'bridge',
    fields: { uid: 'u1', connected: true, lastSeenAt: Timestamp.fromMillis(Date.now() - 60_000) },
  }];

  await expect(startGame.run(request({
    sessionId: 's1', instanceId: 'bridge', requestId: 'start-1', expectedSetupRevision: 0,
  }))).rejects.toMatchObject({ code: 'permission-denied' });
  expect(mock.update).not.toHaveBeenCalled();
  expect(mock.set).not.toHaveBeenCalled();
});

it('starts the complete production 8-player preset after every player receives a legal role', async () => {
  const activeRoleIds = [...recommendedRoleIds(8)];
  mock.session = {
    ...mock.session,
    playerCount: 8,
    activeRoleIds,
  };
  mock.playerDocs = activeRoleIds.map((roleId, index) => ({
    id: `u${index + 2}`,
    fields: { connected: true, role: 'player', assignedRoleId: roleId, seatId: roleId },
  }));
  mock.playerDocs.unshift({ id: 'u1', fields: { connected: true, role: 'gm', assignedRoleId: null, seatId: null } });
  mock.seatDocs = stableSeatsForRoles(activeRoleIds).map((seat, index) => ({
    id: seat.id,
    fields: { ...seat, status: 'claimed', holderUid: `u${index + 2}` },
  }));
  mock.secretDocs = [];

  await expect(startGame.run(request({
    sessionId: 's1', instanceId: 'bridge', requestId: 'start-1', expectedSetupRevision: 0,
  }))).resolves.toMatchObject({ sessionId: 's1', currentTurn: 1 });
});

it('starts the exact 19-player Capybara pair matrix with two derived Wolves', async () => {
  provisionProductionRoster(19);

  await expect(startGame.run(request({
    sessionId: 's1', instanceId: 'bridge', requestId: 'start-19', expectedSetupRevision: 0,
  }))).resolves.toMatchObject({
    status: 'committed',
    setupReceipt: expect.objectContaining({
      playerCount: 19,
      wolfCount: 2,
      resultCount: 19,
      rosterIds: expect.arrayContaining(['capybara-captain', 'capybara-recycler']),
    }),
  });
  expect(mock.set.mock.calls.filter(([ref]) => ref.path.includes('/secrets/loyalty-'))).toHaveLength(19);
});

it('keeps the setup receipt roster and eligible pool in canonical printed order', async () => {
  provisionProductionRoster(8);
  const gm = mock.playerDocs.find((player) => player.id === 'u1');
  const core = mock.playerDocs.filter((player) => player.id !== 'u1').reverse();
  mock.playerDocs = gm ? [gm, ...core] : [...core];

  await expect(startGame.run(request({
    sessionId: 's1', instanceId: 'bridge', requestId: 'start-order', expectedSetupRevision: 0,
  }))).resolves.toMatchObject({
    setupReceipt: expect.objectContaining({
      rosterIds: [...recommendedRoleIds(8)],
      eligibleRoleIds: [...recommendedRoleIds(8)],
    }),
  });
});

it('starts the exact 20-player matrix with a claimed optional Press 21st and extra GM', async () => {
  provisionProductionRoster(20, { press: 'claimed', extraGm: true });

  await expect(startGame.run(request({
    sessionId: 's1', instanceId: 'bridge', requestId: 'start-20-press', expectedSetupRevision: 0,
  }))).resolves.toMatchObject({
    status: 'committed',
    setupReceipt: expect.objectContaining({
      playerCount: 20,
      wolfCount: 2,
      resultCount: 21,
      excludedGmCount: 2,
      pressEligibility: { enabled: true, activeClaimCount: 1, claimed: true },
      rosterIds: expect.arrayContaining(['capybara-captain', 'capybara-recycler']),
    }),
  });
  const receiptCall = mock.set.mock.calls.find(([ref]) => ref.path.endsWith('/secrets/setup-receipt-start-20-press'));
  expect(receiptCall?.[1]).toEqual(expect.objectContaining({ payload: expect.objectContaining({ resultCount: 21 }) }));
});

it.each(['stale', 'disconnected'] as const)(
  'excludes a %s extra GM from private setup recipients while retaining the authorized GM',
  async (state) => {
    provisionProductionRoster(20, { press: 'claimed', extraGm: true });
    const extraInstance = mock.instanceDocs.find((instance) => instance.id === 'observer-bridge');
    if (!extraInstance) throw new Error('Expected the extra GM instance.');
    if (state === 'stale') extraInstance.fields.lastSeenAt = new Date(Date.now() - 60_000);
    else extraInstance.fields.connected = false;

    await expect(startGame.run(request({
      sessionId: 's1', instanceId: 'bridge', requestId: `start-extra-${state}`, expectedSetupRevision: 0,
    }))).resolves.toMatchObject({ status: 'committed' });
    const wolfCall = mock.set.mock.calls.find(([ref]) => ref.path.endsWith('/secrets/wolf-assignment'));
    const receiptCall = mock.set.mock.calls.find(([ref]) => ref.path.endsWith('/secrets/setup-receipt-start-extra-' + state));
    expect(wolfCall?.[1]).toEqual(expect.objectContaining({ visibleToUids: ['u1'] }));
    expect(receiptCall?.[1]).toEqual(expect.objectContaining({ visibleToUids: ['u1'] }));
  },
);

it.each([
  ['unclaimed Press is excluded', { press: 'unclaimed' as const }, 20],
  ['disabled Press is excluded', { press: 'disabled' as const }, 20],
] as const)('keeps an %s from adding a third Wolf or a core seat', async (_label, options, playerCount) => {
  provisionProductionRoster(playerCount, options);

  await expect(startGame.run(request({
    sessionId: 's1', instanceId: 'bridge', requestId: `start-${_label.replace(/\W+/g, '-')}`, expectedSetupRevision: 0,
  }))).resolves.toMatchObject({
    setupReceipt: expect.objectContaining({ playerCount, wolfCount: 2, resultCount: 20 }),
  });
  expect(mock.set.mock.calls.some(([ref]) => ref.path.endsWith('/secrets/loyalty-press-21'))).toBe(false);
});

it('rejects a stale Press pointer with a precise Press readiness reason and no writes', async () => {
  provisionProductionRoster(20, { press: 'stale' });

  await expect(startGame.run(request({
    sessionId: 's1', instanceId: 'bridge', requestId: 'start-stale-press', expectedSetupRevision: 0,
  }))).rejects.toMatchObject({ code: 'failed-precondition', message: expect.stringMatching(/press/i) });
  expect(mock.update).not.toHaveBeenCalled();
  expect(mock.set).not.toHaveBeenCalled();
});

it('rejects multiple live Press claims without writing setup or secrets', async () => {
  provisionProductionRoster(20, { press: 'multiple' });

  await expect(startGame.run(request({
    sessionId: 's1', instanceId: 'bridge', requestId: 'start-multiple-press', expectedSetupRevision: 0,
  }))).rejects.toMatchObject({ code: 'failed-precondition', message: expect.stringMatching(/press/i) });
  expect(mock.update).not.toHaveBeenCalled();
  expect(mock.set).not.toHaveBeenCalled();
});

it('preserves a complete explicit loyalty setup without silently rerolling it', async () => {
  provisionProductionRoster(8);
  const corePlayers = mock.playerDocs.filter((player) => player.fields.role === 'player');
  mock.secretDocs = corePlayers.map((player) => `loyalty-${player.id}`);
  mock.secretPayloads = Object.fromEntries(corePlayers.map((player, index) => [
    `loyalty-${player.id}`,
    { type: 'loyalty', kind: index === 0 ? 'wolf-agent' : 'fleet-loyalist', suspicion: 0 },
  ]));

  await expect(startGame.run(request({
    sessionId: 's1', instanceId: 'bridge', requestId: 'start-explicit', expectedSetupRevision: 0,
  }))).resolves.toMatchObject({
    setupReceipt: expect.objectContaining({ loyaltySource: 'explicit-preserved', wolfCount: 1 }),
  });
  expect(mock.set.mock.calls.some(([ref]) => ref.path.includes('/secrets/loyalty-'))).toBe(false);
});

it('requires explicit assignments when an optional loyalty mode is enabled', async () => {
  provisionProductionRoster(19);
  mock.session.universalArbourEnabled = true;

  await expect(startGame.run(request({
    sessionId: 's1', instanceId: 'bridge', requestId: 'start-universal-missing', expectedSetupRevision: 0,
  }))).rejects.toMatchObject({
    code: 'failed-precondition',
    message: expect.stringMatching(/optional-conflicting/i),
  });
  expect(mock.update).not.toHaveBeenCalled();
  expect(mock.set).not.toHaveBeenCalled();
});

it('preserves Universal Arbour beside the printed two Wolf Agents', async () => {
  provisionProductionRoster(19);
  mock.session.universalArbourEnabled = true;
  const corePlayers = mock.playerDocs.filter((player) => player.fields.role === 'player');
  mock.secretDocs = corePlayers.map((player) => `loyalty-${player.id}`);
  mock.secretPayloads = Object.fromEntries(corePlayers.map((player, index) => [
    `loyalty-${player.id}`,
    {
      type: 'loyalty',
      kind: index < 2 ? 'wolf-agent' : index === 2 ? 'universal-arbour' : 'fleet-loyalist',
      suspicion: index === 2 ? 10 : 0,
    },
  ]));

  await expect(startGame.run(request({
    sessionId: 's1', instanceId: 'bridge', requestId: 'start-universal', expectedSetupRevision: 0,
  }))).resolves.toMatchObject({
    setupReceipt: expect.objectContaining({
      universalArbourEnabled: true,
      wolfCultEnabled: false,
      wolfCount: 2,
      selectedWolfRoleIds: [...recommendedRoleIds(19).slice(0, 2)],
      loyaltySource: 'explicit-preserved',
    }),
  });
});

it('uses Wolf Cult as the second Wolf without creating a third Wolf', async () => {
  provisionProductionRoster(19);
  mock.session.wolfCultEnabled = true;
  const corePlayers = mock.playerDocs.filter((player) => player.fields.role === 'player');
  mock.secretDocs = corePlayers.map((player) => `loyalty-${player.id}`);
  mock.secretPayloads = Object.fromEntries(corePlayers.map((player, index) => [
    `loyalty-${player.id}`,
    {
      type: 'loyalty',
      kind: index === 0 ? 'wolf-agent' : index === 1 ? 'wolf-cult' : 'fleet-loyalist',
      suspicion: index === 1 ? 15 : 0,
    },
  ]));

  await expect(startGame.run(request({
    sessionId: 's1', instanceId: 'bridge', requestId: 'start-wolf-cult', expectedSetupRevision: 0,
  }))).resolves.toMatchObject({
    setupReceipt: expect.objectContaining({
      universalArbourEnabled: false,
      wolfCultEnabled: true,
      wolfCount: 2,
      selectedWolfRoleIds: [...recommendedRoleIds(19).slice(0, 2)],
      loyaltySource: 'explicit-preserved',
    }),
  });
  const wolfAssignment = mock.set.mock.calls.find(([ref]) => ref.path.endsWith('/secrets/wolf-assignment'))?.[1];
  expect(wolfAssignment).toEqual(expect.objectContaining({
    payload: { type: 'wolf-assignment', roleIds: [...recommendedRoleIds(19).slice(0, 2)] },
  }));
});

it('rejects complete-looking loyalty records with a public audience or non-loyalty payload', async () => {
  provisionProductionRoster(8);
  const corePlayers = mock.playerDocs.filter((player) => player.fields.role === 'player');
  mock.secretDocs = corePlayers.map((player) => `loyalty-${player.id}`);
  mock.secretPayloads = Object.fromEntries(corePlayers.map((player, index) => [
    `loyalty-${player.id}`,
    { type: 'loyalty', kind: index === 0 ? 'wolf-agent' : 'fleet-loyalist', suspicion: 0 },
  ]));
  const firstSecretId = mock.secretDocs[0]!;
  mock.secretAudiences[firstSecretId] = [corePlayers[0]!.id, 'u1'];

  await expect(startGame.run(request({
    sessionId: 's1', instanceId: 'bridge', requestId: 'start-public-loyalty', expectedSetupRevision: 0,
  }))).rejects.toMatchObject({ code: 'failed-precondition', message: expect.stringMatching(/loyalt|private|setup/i) });
  expect(mock.update).not.toHaveBeenCalled();
  expect(mock.set).not.toHaveBeenCalled();

  mock.secretAudiences[firstSecretId] = [corePlayers[0]!.id];
  mock.secretPayloads[firstSecretId] = {
    ...mock.secretPayloads[firstSecretId],
    type: 'legacy-loyalty',
  };
  await expect(startGame.run(request({
    sessionId: 's1', instanceId: 'bridge', requestId: 'start-legacy-loyalty', expectedSetupRevision: 0,
  }))).rejects.toMatchObject({ code: 'failed-precondition', message: expect.stringMatching(/loyalt|private|setup/i) });
  expect(mock.update).not.toHaveBeenCalled();
  expect(mock.set).not.toHaveBeenCalled();
});

it('blocks partial and conflicting explicit loyalty setup before any start writes', async () => {
  provisionProductionRoster(8);
  const corePlayers = mock.playerDocs.filter((player) => player.fields.role === 'player');
  mock.secretDocs = [`loyalty-${corePlayers[0]!.id}`];
  mock.secretPayloads = {
    [`loyalty-${corePlayers[0]!.id}`]: { type: 'loyalty', kind: 'fleet-loyalist', suspicion: 0 },
  };
  await expect(startGame.run(request({
    sessionId: 's1', instanceId: 'bridge', requestId: 'start-partial-explicit', expectedSetupRevision: 0,
  }))).rejects.toMatchObject({ code: 'failed-precondition', message: expect.stringMatching(/loyalties/i) });
  expect(mock.update).not.toHaveBeenCalled();
  expect(mock.set).not.toHaveBeenCalled();

  mock.secretDocs = corePlayers.map((player) => `loyalty-${player.id}`);
  mock.secretPayloads = Object.fromEntries(corePlayers.map((player) => [
    `loyalty-${player.id}`,
    { type: 'loyalty', kind: 'wolf-agent', suspicion: 0 },
  ]));
  await expect(startGame.run(request({
    sessionId: 's1', instanceId: 'bridge', requestId: 'start-conflicting-explicit', expectedSetupRevision: 0,
  }))).rejects.toMatchObject({
    code: 'failed-precondition', message: expect.stringMatching(/conflicting-wolf-count/i),
  });
  expect(mock.update).not.toHaveBeenCalled();
  expect(mock.set).not.toHaveBeenCalled();
});

it('blocks incomplete readiness without writing and replays a completed start request', async () => {
  mock.playerDocs[7] = {
    id: 'u8', fields: { connected: true, role: 'player', assignedRoleId: null },
  };
  await expect(startGame.run(request({
    sessionId: 's1', instanceId: 'bridge', requestId: 'start-1', expectedSetupRevision: 0,
  }))).rejects.toMatchObject({
    code: 'failed-precondition', message: expect.stringMatching(/roles|loyalties|vessels/i),
  });
  expect(mock.update).not.toHaveBeenCalled();

  mock.update.mockClear();
  mock.set.mockClear();
  mock.priorReply = { sessionId: 's1', currentTurn: 1, setupRevision: 1 };
  mock.priorFingerprint = {
    sessionId: 's1', requestId: 'start-1', actorUid: 'u1', instanceId: 'bridge',
    expectedSetupRevision: 0,
  };
  await expect(startGame.run(request({
    sessionId: 's1', instanceId: 'bridge', requestId: 'start-1', expectedSetupRevision: 0,
  }))).resolves.toEqual({ ...mock.priorReply, status: 'replayed' });
  expect(mock.update).not.toHaveBeenCalled();
  expect(mock.set).not.toHaveBeenCalled();
});

it('blocks a missing persisted vessel tuple before any start write', async () => {
  delete mock.session.activeVesselIds;

  await expect(startGame.run(request({
    sessionId: 's1', instanceId: 'bridge', requestId: 'start-missing-vessels', expectedSetupRevision: 0,
  }))).rejects.toMatchObject({
    code: 'failed-precondition', message: expect.stringMatching(/vessels/i),
  });
  expect(mock.update).not.toHaveBeenCalled();
  expect(mock.set).not.toHaveBeenCalled();
});

it('blocks a missing persisted role tuple before any start write', async () => {
  delete mock.session.activeRoleIds;

  await expect(startGame.run(request({
    sessionId: 's1', instanceId: 'bridge', requestId: 'start-missing-roles', expectedSetupRevision: 0,
  }))).rejects.toMatchObject({
    code: 'failed-precondition', message: expect.stringMatching(/roles/i),
  });
  expect(mock.update).not.toHaveBeenCalled();
  expect(mock.set).not.toHaveBeenCalled();
});

it('keeps a claimed Press outside core readiness but requires its own private loyalty beside extra GM instances', async () => {
  const coreRoleIds = [...recommendedRoleIds(20)];
  const pressUid = 'press-21';
  mock.session = {
    ...mock.session,
    playerCount: 20,
    activeRoleIds: coreRoleIds,
    activeVesselIds: activeVesselIdsForRoles(coreRoleIds),
    pressEnabled: true,
  };
  mock.playerDocs = coreRoleIds.map((roleId, index) => ({
    id: `core-${index + 1}`,
    fields: {
      connected: true,
      role: 'player',
      assignedRoleId: roleId,
      seatId: roleId,
      activeConsoleRoleId: null,
    },
  }));
  mock.playerDocs.unshift({ id: 'u1', fields: { connected: true, role: 'gm', assignedRoleId: null, seatId: null } });
  mock.playerDocs.push({
    id: pressUid,
    fields: {
      connected: true,
      role: 'player',
      assignedRoleId: null,
      activeConsoleRoleId: 'press-officer',
    },
  });
  mock.playerDocs.push(
    {
      id: 'gm-observer-1',
      fields: { connected: true, role: 'gm', assignedRoleId: null, activeConsoleRoleId: null },
    },
    {
      id: 'gm-observer-2',
      fields: { connected: true, role: 'gm', assignedRoleId: null, activeConsoleRoleId: null },
    },
  );
  mock.instanceDocs = [
    { id: 'bridge', fields: { uid: 'u1', responsibility: 'main' } },
    { id: 'desk', fields: { uid: 'u1', responsibility: 'assistant' } },
    { id: 'extra-gm', fields: { uid: 'u1' } },
  ];
  mock.seatDocs = stableSeatsForRoles(coreRoleIds).map((seat, index) => ({
    id: seat.id,
    fields: { ...seat, status: 'claimed', holderUid: `core-${index + 1}` },
  }));
  mock.secretDocs = ['loyalty-core-1'];

  await expect(startGame.run(request({
    sessionId: 's1', instanceId: 'bridge', requestId: 'start-press-without-loyalty',
    expectedSetupRevision: 0,
  }))).rejects.toMatchObject({
    code: 'failed-precondition',
    message: expect.stringMatching(/loyalties/i),
  });

  mock.secretDocs = [];
  await expect(startGame.run(request({
    sessionId: 's1', instanceId: 'bridge', requestId: 'start-press-with-loyalty',
    expectedSetupRevision: 0,
  }))).resolves.toMatchObject({ sessionId: 's1', currentTurn: 1 });
});

it('writes private automatic loyalties and a safe setup receipt in the same committed start', async () => {
  await expect(startGame.run(request({
    sessionId: 's1', instanceId: 'bridge', requestId: 'start-receipt', expectedSetupRevision: 0,
  }))).resolves.toMatchObject({
    status: 'committed',
    setupReceipt: expect.objectContaining({
      source: expect.any(String),
      wolfCount: 1,
      expectedSetupRevision: 0,
      committedSetupRevision: 1,
      event: 'game-started',
    }),
  });
  expect(mock.set).toHaveBeenCalledWith(
    expect.objectContaining({ path: 'sessions/s1/secrets/loyalty-u2' }),
    expect.objectContaining({ payload: expect.objectContaining({ type: 'loyalty' }) }),
  );
  expect(mock.set).toHaveBeenCalledWith(
    expect.objectContaining({ path: 'sessions/s1/secrets/setup-receipt-start-receipt' }),
    expect.objectContaining({ payload: expect.objectContaining({ type: 'setup-receipt' }) }),
  );
});

it('does not embed a release version in the server setup receipt', async () => {
  const reply = await startGame.run(request({
    sessionId: 's1', instanceId: 'bridge', requestId: 'start-receipt-version', expectedSetupRevision: 0,
  }));

  expect(reply.setupReceipt).not.toHaveProperty('version');
  expect(mock.set).toHaveBeenCalledWith(
    expect.objectContaining({ path: 'sessions/s1/secrets/setup-receipt-start-receipt-version' }),
    expect.objectContaining({ payload: expect.not.objectContaining({ version: expect.anything() }) }),
  );
});

it('rejects a conflicting reuse of a start request id instead of returning the prior result', async () => {
  mock.priorReply = { sessionId: 's1', currentTurn: 1, setupRevision: 1 };
  mock.priorFingerprint = {
    sessionId: 's1', requestId: 'start-1', actorUid: 'u1', instanceId: 'bridge',
    expectedSetupRevision: 0,
  };
  await expect(startGame.run(request({
    sessionId: 's1', instanceId: 'bridge', requestId: 'start-1', expectedSetupRevision: 1,
  }))).rejects.toMatchObject({
    code: 'failed-precondition',
    message: expect.stringMatching(/request|payload|different/i),
  });
});

it('rejects the same request id when the actor changes without exposing the prior result', async () => {
  mock.priorReply = { sessionId: 's1', currentTurn: 1, setupRevision: 1 };
  mock.priorFingerprint = {
    sessionId: 's1', requestId: 'start-1', actorUid: 'u1', instanceId: 'bridge',
    expectedSetupRevision: 0,
  };

  await expect(startGame.run(request({
    sessionId: 's1', instanceId: 'bridge', requestId: 'start-1', expectedSetupRevision: 0,
  }, 'u2'))).rejects.toMatchObject({
    code: 'permission-denied',
  });
  expect(mock.update).not.toHaveBeenCalled();
  expect(mock.set).not.toHaveBeenCalled();
});

it('rejects a start request id owned by a legacy setup command before writes or random draws', async () => {
  provisionProductionRoster(8);
  const requestId = 'legacy-setup-before-start';
  mock.legacyNamespacePaths.add(`sessions/s1/setupMutationRequests/${requestId}`);
  mock.legacyNamespacePaths.add(`sessions/s1/events/setup-confirm-${requestId}`);

  await expect(startGame.run(request({
    sessionId: 's1', instanceId: 'bridge', requestId, expectedSetupRevision: 0,
  }))).rejects.toMatchObject({
    code: 'failed-precondition',
    message: expect.stringMatching(/legacy|refresh|resume|not applied/i),
  });
  expect(mock.randomInt).not.toHaveBeenCalled();
  expect(mock.update).not.toHaveBeenCalled();
  expect(mock.set).not.toHaveBeenCalled();
});

it('lets one same-revision GM start commit and rejects the racing stale revision without a second write', async () => {
  provisionProductionRoster(20, { press: 'claimed', extraGm: true });
  await expect(startGame.run(request({
    sessionId: 's1', instanceId: 'bridge', requestId: 'race-a', expectedSetupRevision: 0,
  }))).resolves.toMatchObject({ status: 'committed', setupRevision: 1 });

  mock.session = { ...mock.session, phase: 'active', setupRevision: 1 };
  mock.update.mockClear();
  mock.set.mockClear();
  await expect(startGame.run(request({
    sessionId: 's1', instanceId: 'observer-bridge', requestId: 'race-b', expectedSetupRevision: 0,
  }, 'gm-observer'))).resolves.toMatchObject({
    status: 'stale', requestId: 'race-b', expectedSetupRevision: 0, currentSetupRevision: 1,
  });
  expect(mock.update).not.toHaveBeenCalled();
  expect(mock.set).toHaveBeenCalledWith(
    expect.objectContaining({ path: 'sessionStartRequests/s1_race-b' }),
    expect.objectContaining({ reply: expect.objectContaining({ status: 'stale' }) }),
  );
});
