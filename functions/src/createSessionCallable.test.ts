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

import { applyRolePreset, createSession } from './index';

function request(data: Record<string, unknown>, uid = 'u1') {
  return { data, auth: { uid } } as CallableRequest<Record<string, unknown>>;
}

function snapshot(fields: Record<string, unknown> = {}, exists = true) {
  return { exists, get: (field: string) => fields[field] };
}

function eventWrites(requestId: string) {
  return mock.set.mock.calls.filter(([ref]) => ref?.path === `sessions/generated-session/events/create-${requestId}`);
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
    playerCount: 14,
    chartId: 'B',
    expansion: 'capybara',
    turnLimit: 7,
  }))).resolves.toMatchObject({
    session: {
      id: 'generated-session',
      name: 'First table',
      playerCount: 14,
      chartId: 'B',
      expansion: 'capybara',
      turnLimit: 7,
    },
    player: { uid: 'u1', displayName: 'Facilitator' },
  });

  expect(mock.set).toHaveBeenCalledWith(
    expect.objectContaining({ path: 'sessions/generated-session' }),
    expect.objectContaining({
      playerCount: 14,
      chartId: 'B',
      expansion: 'capybara',
      turnLimit: 7,
      configurationLocked: false,
      setupRevision: 0,
    }),
  );
  expect(mock.set).toHaveBeenCalledWith(
    expect.objectContaining({ path: expect.stringMatching(/^sessionCreationRequests\/u1_create-1$/) }),
    expect.objectContaining({ sessionId: 'generated-session', requestId: 'create-1' }),
  );
});

it('emits exactly one member-safe session.created envelope in the creation transaction', async () => {
  await createSession.run(request({
    requestId: 'create-event-1',
    name: 'Private setup name',
    displayName: 'Private facilitator name',
    playerCount: 8,
    chartId: 'B',
    expansion: 'capybara',
    turnLimit: 7,
  }));

  const writes = eventWrites('create-event-1');
  expect(writes).toHaveLength(1);
  const event = writes[0][1] as Record<string, unknown>;
  expect(event).toMatchObject({
    sessionId: 'generated-session',
    actorUid: 'u1',
    actorRoleId: null,
    turn: 0,
    phase: 'lobby',
    type: 'session.created',
    requestId: 'create-event-1',
    revision: 0,
    visibility: 'member',
    createdAt: 'server-time',
  });
  expect(event.serverTime).toEqual(expect.stringMatching(/^\d{4}-\d{2}-\d{2}T.*Z$/));
  expect(Object.keys(event).sort()).toEqual([
    'actorRoleId', 'actorUid', 'createdAt', 'phase', 'requestId', 'revision',
    'serverTime', 'sessionId', 'turn', 'type', 'visibility',
  ].sort());
  expect(event).not.toHaveProperty('joinCode');
  expect(event).not.toHaveProperty('name');
  expect(event).not.toHaveProperty('displayName');
  expect(event).not.toHaveProperty('configuration');
  expect(event).not.toHaveProperty('reply');
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

it('applies the exact eight-player roster atomically through the GM preset callable', async () => {
  mock.get.mockImplementation(async (ref: { path: string }) => {
    if (ref.path === 'sessions/s1') return snapshot({ phase: 'lobby', configurationLocked: false });
    if (ref.path === 'sessions/s1/players/u1') return snapshot({ connected: true, role: 'gm' });
    if (ref.path === 'sessions/s1/gmInstances/bridge') return snapshot({ uid: 'u1' });
    return snapshot({}, false);
  });

  await expect(applyRolePreset.run(request({
    sessionId: 's1', instanceId: 'bridge', playerCount: 8,
  }))).resolves.toEqual({
    activeRoleIds: [
      'admiral', 'wing-commander', 'icebreaker-miner', 'shepherd-scientist',
      'quellon-explorer', 'refinery-124-pdf-colonel',
      'joint-engineering-quellon-refinery', 'joint-engineering-shepherd-icebreaker',
    ],
    playerCount: 8,
  });
  expect(mock.update).toHaveBeenCalledWith(
    expect.objectContaining({ path: 'sessions/s1' }),
    expect.objectContaining({
      activeRoleIds: [
        'admiral', 'wing-commander', 'icebreaker-miner', 'shepherd-scientist',
        'quellon-explorer', 'refinery-124-pdf-colonel',
        'joint-engineering-quellon-refinery', 'joint-engineering-shepherd-icebreaker',
      ],
    }),
  );
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
  const reply = {
    session: { id: 'existing', joinCode: '123456' },
    player: { uid: 'u1' },
  };
  mock.get.mockImplementation(async (ref: { path: string }) => {
    if (ref.path === 'sessionCreationRequests/u1_retry-1') return snapshot({ reply });
    return snapshot({}, false);
  });

  await expect(createSession.run(request({ requestId: 'retry-1' }))).resolves.toEqual(reply);
  expect(mock.set).not.toHaveBeenCalled();
  expect(eventWrites('retry-1')).toHaveLength(0);
});

it('does not emit an event for an unauthenticated request', async () => {
  await expect(createSession.run({
    data: { requestId: 'unauthenticated-1', playerCount: 8 },
    auth: undefined,
  } as CallableRequest<Record<string, unknown>>)).rejects.toMatchObject({ code: 'unauthenticated' });
  expect(eventWrites('unauthenticated-1')).toHaveLength(0);
});

it('does not emit an event when every candidate join code collides', async () => {
  mock.get.mockImplementation(async (ref: { path: string }) => (
    ref.path === 'joinCodes/1234'
      ? snapshot({ sessionId: 'existing-session' })
      : snapshot({}, false)
  ));

  await expect(createSession.run(request({ requestId: 'collision-1' })))
    .rejects.toMatchObject({ code: 'resource-exhausted' });
  expect(eventWrites('collision-1')).toHaveLength(0);
});
