import { beforeEach, expect, it, vi } from 'vitest';
import type { CallableRequest } from 'firebase-functions/v2/https';

const mock = vi.hoisted(() => ({
  get: vi.fn(),
  update: vi.fn(),
  set: vi.fn(),
  delete: vi.fn(),
  randomInt: vi.fn(() => 1234),
  sessionId: 'generated-session',
}));

vi.mock('firebase-admin/app', () => ({ initializeApp: vi.fn() }));
vi.mock('node:crypto', () => ({
  randomInt: mock.randomInt,
  randomUUID: vi.fn(() => 'session-event'),
}));
vi.mock('firebase-admin/firestore', () => ({
  getFirestore: () => ({
    doc: (path: string) => ({ path, id: path.split('/').at(-1) }),
    collection: (path: string) => ({
      doc: () => ({ path: `${path}/${mock.sessionId}`, id: mock.sessionId }),
    }),
    runTransaction: (callback: (tx: unknown) => unknown) => callback({
      get: mock.get,
      update: mock.update,
      set: mock.set,
      delete: mock.delete,
    }),
  }),
  FieldValue: {
    delete: () => 'delete-field',
    serverTimestamp: () => 'server-time',
  },
  Timestamp: {
    fromDate: (value: Date) => value,
    now: () => new Date('2026-09-07T12:00:00.000Z'),
  },
}));

import { applyRolePreset, confirmSetup, createSession } from './index';
import { recommendedRoleIds } from './roleConfiguration';

function request(data: Record<string, unknown>, uid = 'u1') {
  return { data, auth: { uid } } as CallableRequest<Record<string, unknown>>;
}

function snapshot(fields: Record<string, unknown> = {}, exists = true) {
  return { exists, get: (field: string) => fields[field] };
}

beforeEach(() => {
  mock.get.mockReset();
  mock.update.mockReset();
  mock.set.mockReset();
  mock.delete.mockReset();
  mock.randomInt.mockReset();
  mock.randomInt.mockReturnValue(1234);
  mock.get.mockResolvedValue(snapshot({}, false));
});

it('rejects unsupported setup before opening a transaction', async () => {
  await expect(createSession.run(request({ requestId: 'create-1', playerCount: 7 })))
    .rejects.toMatchObject({ code: 'invalid-argument' });
  expect(mock.get).not.toHaveBeenCalled();
  expect(mock.set).not.toHaveBeenCalled();
});

it('creates one configured lobby and persists a replayable creation result atomically', async () => {
  await expect(createSession.run(request({
    requestId: 'create-1',
    name: '  First table  ',
    displayName: '  Facilitator  ',
    playerCount: 19,
    chartId: 'B',
    expansion: 'capybara',
    turnLimit: 7,
  }))).resolves.toMatchObject({
    session: {
      id: 'generated-session',
      name: 'First table',
      playerCount: 19,
      chartId: 'B',
      expansion: 'capybara',
      turnLimit: 7,
      pressEnabled: true,
    },
    player: { uid: 'u1', displayName: 'Facilitator' },
  });

  expect(mock.set).toHaveBeenCalledWith(
    expect.objectContaining({ path: 'sessions/generated-session' }),
    expect.objectContaining({
      playerCount: 19,
      chartId: 'B',
      expansion: 'capybara',
      turnLimit: 7,
      configurationLocked: false,
      setupRevision: 0,
      pressEnabled: true,
    }),
  );
  expect(mock.set).toHaveBeenCalledWith(
    expect.objectContaining({ path: expect.stringMatching(/^sessionCreationRequests\/u1_create-1$/) }),
    expect.objectContaining({ sessionId: 'generated-session', requestId: 'create-1' }),
  );

  const eventWrites = mock.set.mock.calls.filter(([ref]) =>
    (ref as { path: string }).path === 'sessions/generated-session/events/create-create-1',
  );
  expect(eventWrites).toHaveLength(1);
  const eventWrite = eventWrites[0]?.[1] as Record<string, unknown> | undefined;
  expect(eventWrite).toEqual({
    sessionId: 'generated-session',
    actorUid: 'u1',
    actorRoleId: null,
    turn: 0,
    phase: 'lobby',
    type: 'session.created',
    requestId: 'create-1',
    revision: 0,
    serverTime: expect.any(String),
    visibility: 'member',
    createdAt: 'server-time',
  });
  expect(Object.keys(eventWrite ?? {}).sort()).toEqual([
    'actorRoleId', 'actorUid', 'createdAt', 'phase', 'requestId', 'revision',
    'serverTime', 'sessionId', 'turn', 'type', 'visibility',
  ]);
});

it('does not write a creation event for unauthenticated or exhausted code-collision requests', async () => {
  await expect(createSession.run({
    data: { requestId: 'unauthenticated-create', playerCount: 8 },
    auth: null,
  } as CallableRequest<Record<string, unknown>>)).rejects.toMatchObject({ code: 'unauthenticated' });
  expect(mock.set).not.toHaveBeenCalled();

  mock.get.mockImplementation(async (ref: { path: string }) => {
    if (ref.path === 'joinCodes/1234') return snapshot({ sessionId: 'existing-session' });
    return snapshot({}, false);
  });
  await expect(createSession.run(request({ requestId: 'collision-create', playerCount: 8 })))
    .rejects.toMatchObject({ code: 'resource-exhausted' });
  expect(mock.set).not.toHaveBeenCalledWith(
    expect.objectContaining({ path: expect.stringContaining('/events/') }),
    expect.anything(),
  );
});

it('creates an eight-player lobby with one legal role per player', async () => {
  await expect(createSession.run(request({ requestId: 'create-roster-8', playerCount: 8 })))
    .resolves.toMatchObject({ session: { playerCount: 8 } });

  expect(mock.set).toHaveBeenCalledWith(
    expect.objectContaining({ path: 'sessions/generated-session' }),
    expect.objectContaining({
      activeRoleIds: [
        'admiral', 'wing-commander', 'icebreaker-miner', 'shepherd-scientist',
        'quellon-explorer', 'refinery-124-pdf-colonel',
        'joint-engineering-quellon-refinery', 'joint-engineering-shepherd-icebreaker',
      ],
    }),
  );
});

it('creates a nineteen-player lobby with the atomic Capybara pair and Dione-hosted SNN', async () => {
  await expect(createSession.run(request({ requestId: 'create-roster-19', playerCount: 19 })))
    .resolves.toMatchObject({ session: { playerCount: 19 } });

  expect(mock.set).toHaveBeenCalledWith(
    expect.objectContaining({ path: 'sessions/generated-session' }),
    expect.objectContaining({
      activeRoleIds: [
        'admiral', 'executive-officer', 'wing-commander', 'dione-captain',
        'dione-president', 'icebreaker-captain', 'icebreaker-engineer',
        'icebreaker-miner', 'shepherd-captain', 'shepherd-engineer',
        'shepherd-scientist', 'quellon-captain', 'quellon-engineer',
        'quellon-explorer', 'refinery-124-captain', 'refinery-124-engineer',
        'refinery-124-pdf-colonel', 'capybara-captain', 'capybara-recycler',
      ],
      shuttleDockings: expect.arrayContaining([
        expect.objectContaining({ shuttleId: 'snn-press-shuttle', shipId: 'dione' }),
      ]),
    }),
  );
});

it.each([
  [8, 'admiral'],
  [19, 'capybara-captain'],
  [20, 'capybara-recycler'],
] as const)('provisions one stable authoritative seat catalog for the %i-player core at %s', async (playerCount, roleId) => {
  await createSession.run(request({ requestId: `create-seats-${playerCount}`, playerCount }));

  expect(mock.set).toHaveBeenCalledWith(
    expect.objectContaining({ path: `sessions/generated-session/seats/${roleId}` }),
    expect.objectContaining({
      id: roleId,
      roleId,
      status: 'open',
      holderUid: null,
    }),
  );
  expect(mock.set).toHaveBeenCalledWith(
    expect.objectContaining({ path: 'sessions/generated-session' }),
    expect.objectContaining({
      setup: expect.objectContaining({
        playerCount,
        activeRoleIds: expect.any(Array),
        activeVesselIds: expect.any(Array),
      }),
      setupRevision: 0,
    }),
  );
});

it.each([
  [8, 'aegis'],
  [11, 'aegis'],
  [12, 'dione'],
  [18, 'dione'],
  [19, 'dione'],
  [20, 'dione'],
] as const)('persists the authoritative SNN host for the %i-player session', async (playerCount, shipId) => {
  const reply = await createSession.run(request({
    requestId: `create-snn-host-${playerCount}`,
    playerCount,
  }));

  expect(reply.session.shuttleDockings).toEqual(expect.arrayContaining([
    expect.objectContaining({ shuttleId: 'snn-press-shuttle', shipId }),
  ]));
  expect(mock.set).toHaveBeenCalledWith(
    expect.objectContaining({ path: 'sessions/generated-session' }),
    expect.objectContaining({
      shuttleDockings: expect.arrayContaining([
        expect.objectContaining({ shuttleId: 'snn-press-shuttle', shipId }),
      ]),
    }),
  );
});

it('retires the partial role preset callable in favor of the complete setup tuple', async () => {
  await expect(applyRolePreset.run(request({
    sessionId: 's1', instanceId: 'bridge', playerCount: 8,
  }))).rejects.toMatchObject({
    code: 'failed-precondition', message: expect.stringMatching(/confirmSetup/i),
  });
  expect(mock.update).not.toHaveBeenCalled();
});

it('denies a downsize that would remove a claimed stable seat without mutating setup', async () => {
  mock.get.mockImplementation(async (ref: { path: string }) => {
    if (ref.path === 'sessions/s1') {
      return snapshot({
        phase: 'lobby',
        configurationLocked: false,
        setupRevision: 2,
        playerCount: 19,
        expansion: 'capybara',
        activeRoleIds: [
          'admiral', 'executive-officer', 'wing-commander', 'dione-captain',
          'dione-president', 'icebreaker-captain', 'icebreaker-engineer',
          'icebreaker-miner', 'shepherd-captain', 'shepherd-engineer',
          'shepherd-scientist', 'quellon-captain', 'quellon-engineer',
          'quellon-explorer', 'refinery-124-captain', 'refinery-124-engineer',
          'refinery-124-pdf-colonel', 'capybara-captain', 'capybara-recycler',
        ],
      });
    }
    if (ref.path === 'sessions/s1/players/u1') return snapshot({ connected: true, role: 'gm' });
    if (ref.path === 'sessions/s1/gmInstances/bridge') return snapshot({ uid: 'u1' });
    if (ref.path === 'sessions/s1/seats/capybara-recycler') {
      return snapshot({ status: 'claimed', holderUid: 'u9' });
    }
    return snapshot({}, false);
  });

  await expect(applyRolePreset.run(request({
    sessionId: 's1', instanceId: 'bridge', playerCount: 18,
  }))).rejects.toMatchObject({ code: 'failed-precondition' });
  expect(mock.update).not.toHaveBeenCalled();
});

it('returns a safe stale receipt when setup revision changed before confirmation', async () => {
  const activeRoleIds = recommendedRoleIds(8);
  let currentSetupRevision = 5;
  let staleReceiptPersisted = false;
  mock.get.mockImplementation(async (ref: { path: string }) => {
    if (ref.path === 'sessions/s1') {
      return snapshot({
        phase: 'lobby', configurationLocked: false, setupRevision: currentSetupRevision,
        activeRoleIds,
      });
    }
    if (ref.path === 'sessions/s1/players/u1') return snapshot({ connected: true, role: 'gm' });
    if (ref.path === 'sessions/s1/gmInstances/bridge') return snapshot({ uid: 'u1' });
    if (ref.path === 'sessions/s1/setupMutationRequests/setup-stale-receipt' && staleReceiptPersisted) {
      return snapshot({
        action: 'confirm-setup', sessionId: 's1', actorUid: 'u1', instanceId: 'bridge',
        fingerprint: {
          playerCount: 8, chartId: 'A', expansion: 'base', turnLimit: 6,
          dioneEnabled: false, capybaraEnabled: true, activeRoleIds,
          expectedSetupRevision: 4,
        },
        reply: {
          status: 'stale', requestId: 'setup-stale-receipt', entity: 'setup',
          expectedRevision: 4, currentRevision: 5,
        },
      });
    }
    return snapshot({}, false);
  });

  const command = request({
    sessionId: 's1', instanceId: 'bridge', requestId: 'setup-stale-receipt',
    expectedSetupRevision: 4, playerCount: 8, chartId: 'A', expansion: 'base', turnLimit: 6,
    dioneEnabled: false, capybaraEnabled: true, activeRoleIds,
  });
  const staleReply = {
    status: 'stale', requestId: 'setup-stale-receipt', entity: 'setup',
    expectedRevision: 4, currentRevision: 5,
  };
  await expect(confirmSetup.run(command)).resolves.toEqual(staleReply);
  expect(mock.update).not.toHaveBeenCalled();
  expect(mock.set).toHaveBeenCalledWith(
    expect.objectContaining({ path: 'sessions/s1/setupMutationRequests/setup-stale-receipt' }),
    expect.objectContaining({ reply: staleReply, action: 'confirm-setup' }),
  );

  staleReceiptPersisted = true;
  currentSetupRevision = 4;
  await expect(confirmSetup.run(command)).resolves.toEqual(staleReply);
  expect(mock.update).not.toHaveBeenCalled();
  expect(mock.set).toHaveBeenCalledTimes(1);
  expect(mock.set.mock.calls.map(([ref]) => (ref as { path: string }).path))
    .not.toContain('sessions/s1/events/setup-confirm-setup-stale-receipt');
});

it('does not replay a setup receipt for an inactive or foreign facilitator', async () => {
  const activeRoleIds = recommendedRoleIds(8);
  mock.get.mockImplementation(async (ref: { path: string }) => {
    if (ref.path === 'sessions/s1') {
      return snapshot({ phase: 'lobby', configurationLocked: false, setupRevision: 0, activeRoleIds });
    }
    if (ref.path === 'sessions/s1/players/u1') return snapshot({ connected: true, role: 'gm' });
    if (ref.path === 'sessions/s1/gmInstances/bridge') return snapshot({ uid: 'u1' });
    return snapshot({}, false);
  });
  const command = request({
    sessionId: 's1', instanceId: 'bridge', requestId: 'setup-replay-authority',
    expectedSetupRevision: 0, playerCount: 8, chartId: 'A', expansion: 'base', turnLimit: 6,
    dioneEnabled: false, capybaraEnabled: true, activeRoleIds,
  });
  await confirmSetup.run(command);
  mock.get.mockImplementation(async (ref: { path: string }) => {
    if (ref.path === 'sessions/s1') {
      return snapshot({ phase: 'lobby', configurationLocked: false, setupRevision: 1, activeRoleIds });
    }
    return snapshot({}, false);
  });
  await expect(confirmSetup.run(command)).rejects.toMatchObject({ code: 'permission-denied' });
  await expect(confirmSetup.run({ ...command, auth: { uid: 'u2' } })).rejects.toMatchObject({
    code: 'permission-denied',
  });
});

it('does not claim a code already owned by another session', async () => {
  mock.randomInt.mockReset();
  mock.randomInt.mockReturnValueOnce(1234).mockReturnValue(5678);
  mock.get.mockImplementation(async (ref: { path: string }) => {
    if (ref.path === 'joinCodes/001234') return snapshot({ sessionId: 'existing-session' });
    return snapshot({}, false);
  });

  await expect(createSession.run(request({ requestId: 'create-2', joinCodeVersion: 2 })))
    .resolves.toMatchObject({ session: { joinCode: '005678' } });

  expect(mock.set).not.toHaveBeenCalledWith(
    expect.objectContaining({ path: 'joinCodes/001234' }),
    expect.anything(),
  );
  expect(mock.set).toHaveBeenCalledWith(
    expect.objectContaining({ path: 'joinCodes/005678' }),
    expect.objectContaining({ sessionId: 'generated-session' }),
  );
});

it('replays the same session and join code for a retried request', async () => {
  const requestPath = 'sessionCreationRequests/u1_retry-1';
  let storedRequest: Record<string, unknown> | undefined;
  mock.get.mockImplementation(async (ref: { path: string }) => {
    if (ref.path === requestPath && storedRequest) return snapshot(storedRequest);
    return snapshot({}, false);
  });
  mock.set.mockImplementation((ref: { path: string }, data: Record<string, unknown>) => {
    if (ref.path === requestPath) storedRequest = data;
  });

  const firstReply = await createSession.run(request({ requestId: 'retry-1' }));
  expect(storedRequest).toEqual(expect.objectContaining({
    sessionId: 'generated-session', requestId: 'retry-1',
    reply: firstReply,
  }));
  const writesAfterCreate = mock.set.mock.calls.length;

  await expect(createSession.run(request({ requestId: 'retry-1' }))).resolves.toEqual(firstReply);
  expect(mock.set).toHaveBeenCalledTimes(writesAfterCreate);
  expect(mock.set.mock.calls.filter(([ref]) =>
    (ref as { path: string }).path === 'sessions/generated-session/events/create-retry-1',
  )).toHaveLength(1);
});

it('rejects a setup replay when the tuple payload changes under the same request id', async () => {
  const activeRoleIds = [
    'admiral', 'wing-commander', 'icebreaker-miner', 'shepherd-scientist',
    'quellon-explorer', 'refinery-124-pdf-colonel',
    'joint-engineering-quellon-refinery', 'joint-engineering-shepherd-icebreaker',
  ];
  const reply = {
    status: 'committed', requestId: 'setup-1', setupRevision: 1,
    setup: {
      playerCount: 8, chartId: 'A', expansion: 'base', turnLimit: 8,
      dioneEnabled: false, capybaraEnabled: true, activeRoleIds,
      activeVesselIds: ['aegis', 'icebreaker', 'shepherd', 'quellon', 'refinery-124'],
    },
    activeRoleIds,
    activeVesselIds: ['aegis', 'icebreaker', 'shepherd', 'quellon', 'refinery-124'],
  };
  mock.get.mockImplementation(async (ref: { path: string }) => {
    if (ref.path === 'sessions/s1/setupMutationRequests/setup-1') {
      return snapshot({
        action: 'confirm-setup', sessionId: 's1', actorUid: 'u1',
        fingerprint: {
          playerCount: 8, chartId: 'A', expansion: 'base', turnLimit: 8,
          dioneEnabled: false, capybaraEnabled: true, activeRoleIds,
        },
        reply,
      });
    }
    if (ref.path === 'sessions/s1') {
      return snapshot({ phase: 'lobby', configurationLocked: false, setupRevision: 0, activeRoleIds });
    }
    if (ref.path === 'sessions/s1/players/u1') return snapshot({ connected: true, role: 'gm' });
    if (ref.path === 'sessions/s1/gmInstances/bridge') return snapshot({ uid: 'u1' });
    return snapshot({}, false);
  });

  await expect(confirmSetup.run(request({
    sessionId: 's1', instanceId: 'bridge', requestId: 'setup-1', expectedSetupRevision: 0,
    playerCount: 8, chartId: 'A', expansion: 'base', turnLimit: 7,
    dioneEnabled: false, capybaraEnabled: true, activeRoleIds,
  }))).rejects.toMatchObject({ code: 'failed-precondition' });
  expect(mock.update).not.toHaveBeenCalled();
  expect(mock.set).not.toHaveBeenCalled();
});

it('rejects a setup replay when only the expected setup revision changes', async () => {
  const activeRoleIds = [
    'admiral', 'wing-commander', 'icebreaker-miner', 'shepherd-scientist',
    'quellon-explorer', 'refinery-124-pdf-colonel',
    'joint-engineering-quellon-refinery', 'joint-engineering-shepherd-icebreaker',
  ];
  const reply = {
    status: 'committed', requestId: 'setup-revision-1', setupRevision: 1,
    setup: {
      playerCount: 8, chartId: 'A', expansion: 'base', turnLimit: 8,
      dioneEnabled: false, capybaraEnabled: true, activeRoleIds,
      activeVesselIds: ['aegis', 'icebreaker', 'shepherd', 'quellon', 'refinery-124'],
    },
    activeRoleIds,
    activeVesselIds: ['aegis', 'icebreaker', 'shepherd', 'quellon', 'refinery-124'],
  };
  mock.get.mockImplementation(async (ref: { path: string }) => {
    if (ref.path === 'sessions/s1/setupMutationRequests/setup-revision-1') {
      return snapshot({
        action: 'confirm-setup', sessionId: 's1', actorUid: 'u1', instanceId: 'bridge',
        fingerprint: {
          playerCount: 8, chartId: 'A', expansion: 'base', turnLimit: 8,
          dioneEnabled: false, capybaraEnabled: true, activeRoleIds,
          expectedSetupRevision: 0,
        },
        reply,
      });
    }
    if (ref.path === 'sessions/s1') {
      return snapshot({ phase: 'lobby', configurationLocked: false, setupRevision: 1, activeRoleIds });
    }
    if (ref.path === 'sessions/s1/players/u1') return snapshot({ connected: true, role: 'gm' });
    if (ref.path === 'sessions/s1/gmInstances/bridge') return snapshot({ uid: 'u1' });
    return snapshot({}, false);
  });

  await expect(confirmSetup.run(request({
    sessionId: 's1', instanceId: 'bridge', requestId: 'setup-revision-1', expectedSetupRevision: 1,
    playerCount: 8, chartId: 'A', expansion: 'base', turnLimit: 8,
    dioneEnabled: false, capybaraEnabled: true, activeRoleIds,
  }))).rejects.toMatchObject({ code: 'failed-precondition' });
  expect(mock.update).not.toHaveBeenCalled();
  expect(mock.set).not.toHaveBeenCalled();
});

it('backfills canonical metadata on a retained legacy seat without touching its holder pointer', async () => {
  const activeRoleIds = recommendedRoleIds(8);
  mock.get.mockImplementation(async (ref: { path: string }) => {
    if (ref.path === 'sessions/s1/setupMutationRequests/migrate-seat-1') return snapshot({}, false);
    if (ref.path === 'sessions/s1') {
      return snapshot({ phase: 'lobby', configurationLocked: false, setupRevision: 0, activeRoleIds });
    }
    if (ref.path === 'sessions/s1/players/u1') return snapshot({ connected: true, role: 'gm' });
    if (ref.path === 'sessions/s1/gmInstances/bridge') return snapshot({ uid: 'u1' });
    if (ref.path === 'sessions/s1/seats/admiral') {
      return snapshot({ status: 'claimed', holderUid: 'u9', claimedAt: 'legacy-claim', label: 'Admiral' });
    }
    if (ref.path.startsWith('sessions/s1/seats/')) return snapshot({}, false);
    return snapshot({}, false);
  });

  await confirmSetup.run(request({
    sessionId: 's1', instanceId: 'bridge', requestId: 'migrate-seat-1', expectedSetupRevision: 0,
    playerCount: 8, chartId: 'A', expansion: 'base', turnLimit: 8,
    dioneEnabled: false, capybaraEnabled: false, activeRoleIds,
  }));

  expect(mock.update).toHaveBeenCalledWith(
    expect.objectContaining({ path: 'sessions/s1/seats/admiral' }),
    { roleId: 'admiral', label: 'AEGIS // Admiral', factionId: 'aegis' },
  );
  expect(mock.update).not.toHaveBeenCalledWith(
    expect.objectContaining({ path: 'sessions/s1/seats/admiral' }),
    expect.objectContaining({ status: expect.anything(), holderUid: expect.anything() }),
  );
});
