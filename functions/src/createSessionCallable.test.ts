import { beforeEach, expect, it, vi } from 'vitest';
import type { CallableRequest } from 'firebase-functions/v2/https';

const mock = vi.hoisted(() => ({
  get: vi.fn(),
  set: vi.fn(),
  delete: vi.fn(),
  sessionId: 'generated-session',
}));

vi.mock('firebase-admin/app', () => ({ initializeApp: vi.fn() }));
vi.mock('firebase-admin/firestore', () => ({
  getFirestore: () => ({
    doc: (path: string) => ({ path, id: path.split('/').at(-1) }),
    collection: (path: string) => ({
      doc: () => ({ path: `${path}/${mock.sessionId}`, id: mock.sessionId }),
    }),
    runTransaction: (callback: (tx: unknown) => unknown) => callback({
      get: mock.get,
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

import { createSession } from './index';

function request(data: Record<string, unknown>, uid = 'u1') {
  return { data, auth: { uid } } as CallableRequest<Record<string, unknown>>;
}

function snapshot(fields: Record<string, unknown> = {}, exists = true) {
  return { exists, get: (field: string) => fields[field] };
}

beforeEach(() => {
  mock.get.mockReset();
  mock.set.mockReset();
  mock.delete.mockReset();
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
});
