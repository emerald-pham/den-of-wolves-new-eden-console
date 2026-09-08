import { beforeEach, expect, it, vi } from 'vitest';
import type { CallableRequest } from 'firebase-functions/v2/https';

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
  secretDocs: [] as string[],
  priorReply: undefined as unknown,
}));

vi.mock('firebase-admin/app', () => ({ initializeApp: vi.fn() }));
vi.mock('firebase-admin/firestore', () => ({
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
  Timestamp: {
    now: () => new Date('2026-09-07T12:00:00.000Z'),
    fromDate: (value: Date) => value,
  },
}));

import { setFacilitatorResponsibility, startGame } from './index';
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

beforeEach(() => {
  mock.get.mockReset();
  mock.update.mockReset();
  mock.set.mockReset();
  mock.priorReply = undefined;
  mock.session = {
    phase: 'casting',
    configurationLocked: false,
    setupRevision: 0,
    playerCount: 8,
    currentTurn: 0,
    activeRoleIds: roleIds,
    capybaraEnabled: true,
    dioneEnabled: true,
  };
  mock.playerDocs = roleIds.map((roleId, index) => ({
    id: `u${index + 1}`,
    fields: {
      connected: true,
      role: index === 0 ? 'gm' : 'player',
      assignedRoleId: roleId,
    },
  }));
  mock.instanceDocs = [
    { id: 'bridge', fields: { uid: 'u1', responsibility: 'main' } },
    { id: 'desk', fields: { uid: 'u9', responsibility: 'assistant' } },
  ];
  mock.secretDocs = roleIds.map((_roleId, index) => `loyalty-u${index + 1}`);
  mock.get.mockImplementation(async (ref: { path: string }) => {
    if (ref.path === 'sessions/s1') return snapshot(mock.session, ref.path);
    if (ref.path === 'sessions/s1/players/u1') return snapshot(mock.playerDocs[0]!.fields, ref.path);
    if (ref.path === 'sessions/s1/gmInstances/bridge') return snapshot(mock.instanceDocs[0]!.fields, ref.path);
    if (ref.path === 'sessionStartRequests/s1_start-1') {
      return mock.priorReply === undefined
        ? snapshot({}, ref.path, false)
        : snapshot({ reply: mock.priorReply }, ref.path);
    }
    if (ref.path === 'sessions/s1/players') {
      return { exists: true, docs: mock.playerDocs.map(({ id, fields }) => snapshot(fields, `sessions/s1/players/${id}`)) };
    }
    if (ref.path === 'sessions/s1/gmInstances') {
      return { exists: true, docs: mock.instanceDocs.map(({ id, fields }) => snapshot(fields, `sessions/s1/gmInstances/${id}`)) };
    }
    if (ref.path === 'sessions/s1/secrets') {
      return { exists: true, docs: mock.secretDocs.map((id) => snapshot({}, `sessions/s1/secrets/${id}`)) };
    }
    return snapshot({}, ref.path, false);
  });
});

it('records a distinct facilitator responsibility', async () => {
  mock.instanceDocs = [{ id: 'bridge', fields: { uid: 'u1' } }];
  await expect(setFacilitatorResponsibility.run(request({
    sessionId: 's1', instanceId: 'bridge', responsibility: 'main',
  }))).resolves.toEqual({ responsibility: 'main' });
  expect(mock.update).toHaveBeenCalledWith(
    expect.objectContaining({ path: 'sessions/s1/gmInstances/bridge' }),
    { responsibility: 'main' },
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

it('starts the complete production 8-player preset after every player receives a legal role', async () => {
  const activeRoleIds = [...recommendedRoleIds(8)];
  mock.session = {
    ...mock.session,
    playerCount: 8,
    activeRoleIds,
  };
  mock.playerDocs = activeRoleIds.map((roleId, index) => ({
    id: `u${index + 1}`,
    fields: { connected: true, role: index === 0 ? 'gm' : 'player', assignedRoleId: roleId },
  }));
  mock.secretDocs = mock.playerDocs.map(({ id }) => `loyalty-${id}`);

  await expect(startGame.run(request({
    sessionId: 's1', instanceId: 'bridge', requestId: 'start-1', expectedSetupRevision: 0,
  }))).resolves.toMatchObject({ sessionId: 's1', currentTurn: 1 });
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
  await expect(startGame.run(request({
    sessionId: 's1', instanceId: 'bridge', requestId: 'start-1', expectedSetupRevision: 0,
  }))).resolves.toEqual(mock.priorReply);
  expect(mock.update).not.toHaveBeenCalled();
  expect(mock.set).not.toHaveBeenCalled();
});
