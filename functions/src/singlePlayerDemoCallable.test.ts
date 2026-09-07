import { beforeEach, expect, it, vi } from 'vitest';
import type { CallableRequest } from 'firebase-functions/v2/https';

const mock = vi.hoisted(() => ({
  get: vi.fn(),
  update: vi.fn(),
  currentTurn: 0,
  connectedIds: ['u1'] as string[],
  phase: 'lobby',
}));

vi.mock('firebase-admin/app', () => ({ initializeApp: vi.fn() }));
vi.mock('firebase-admin/firestore', () => ({
  getFirestore: () => ({
    doc: (path: string) => path,
    collection: (path: string) => ({
      path,
      where: () => ({ path: `${path}/connected` }),
    }),
    runTransaction: async (callback: (tx: unknown) => unknown) =>
      callback({ get: mock.get, update: mock.update }),
  }),
  FieldValue: { delete: () => 'delete-field', serverTimestamp: () => 'server-time' },
  Timestamp: { now: () => ({ toMillis: () => Date.now() }) },
}));

vi.mock('firebase-functions/v2/https', () => ({
  HttpsError: class HttpsError extends Error {
    readonly code: string;
    constructor(code: string, message: string) {
      super(message);
      this.code = code;
    }
  },
  onCall: (handler: unknown) => ({ run: handler }),
}));
vi.mock('firebase-functions/v2', () => ({ setGlobalOptions: vi.fn() }));
vi.mock('firebase-functions/v2/scheduler', () => ({ onSchedule: vi.fn() }));

import { startSinglePlayerDemo } from './index';

const request = (data: Record<string, unknown> = { sessionId: 's1' }) => ({
  data,
  auth: { uid: 'u1' },
}) as CallableRequest<Record<string, unknown>>;

function snapshot(path: string) {
  if (path === 'sessions/s1') {
    return {
      exists: true,
      get: (key: string) => ({
        phase: mock.phase,
        currentTurn: mock.currentTurn,
        capybaraEnabled: true,
        dioneEnabled: true,
        shipSurvivors: {},
        fleetSurvivorPopulationAdjustment: 0,
        maintenanceCycles: {},
        shuttleFuelled: {},
      } as Record<string, unknown>)[key],
    };
  }
  if (path === 'sessions/s1/players/u1') {
    return { exists: true, get: (key: string) => ({ connected: true, role: 'player' } as Record<string, unknown>)[key] };
  }
  return {
    docs: mock.connectedIds.map((id) => ({
      id,
      exists: true,
      get: (key: string) => ({ connected: true, role: 'player' } as Record<string, unknown>)[key],
    })),
  };
}

beforeEach(() => {
  mock.currentTurn = 0;
  mock.connectedIds = ['u1'];
  mock.phase = 'lobby';
  mock.update.mockReset();
  mock.get.mockImplementation(async (ref: string | { path: string }) =>
    snapshot(typeof ref === 'string' ? ref : ref.path));
});

it('starts Turn One for the only connected player and writes the shared transition', async () => {
  await expect(startSinglePlayerDemo.run(request())).resolves.toMatchObject({
    currentTurn: 1,
    turnStartAnnouncement: expect.objectContaining({ turn: 1 }),
    turnPhase: expect.objectContaining({ turn: 1 }),
  });
  expect(mock.update).toHaveBeenCalledWith('sessions/s1', expect.objectContaining({ currentTurn: 1 }));
});

it('rejects the demo when another player is connected or Turn Zero has ended', async () => {
  mock.connectedIds = ['u1', 'u2'];
  await expect(startSinglePlayerDemo.run(request())).rejects.toMatchObject({
    code: 'failed-precondition',
  });
  expect(mock.update).not.toHaveBeenCalled();

  mock.connectedIds = ['u1'];
  mock.currentTurn = 1;
  await expect(startSinglePlayerDemo.run(request())).rejects.toMatchObject({
    code: 'failed-precondition',
  });
  expect(mock.update).not.toHaveBeenCalled();
});
