import { beforeEach, expect, it, vi } from 'vitest';
import type { CallableRequest } from 'firebase-functions/v2/https';

const mock = vi.hoisted(() => ({
  get: vi.fn(), update: vi.fn(), set: vi.fn(),
  receipts: new Map<string, Record<string, unknown>>(),
  events: new Map<string, Record<string, unknown>>(),
  role: 'player', post: 'admiral', connected: true, sessionExists: true,
  phase: 'active', currentTurn: 2, revision: 0,
  entries: [] as Record<string, unknown>[],
  rawState: undefined as unknown,
}));

vi.mock('firebase-admin/app', () => ({ initializeApp: vi.fn() }));
vi.mock('firebase-admin/firestore', () => ({
  getFirestore: () => ({
    doc: (path: string) => path,
    collection: (path: string) => path,
    runTransaction: (callback: (tx: unknown) => unknown) => callback({
      get: mock.get, update: mock.update, set: mock.set,
    }),
  }),
  FieldValue: { serverTimestamp: () => 'server-time' },
  Timestamp: { now: () => ({ toMillis: () => Date.now() }) },
}));

import { publishAdmiralDirectiveCommand } from './index';

const data = {
  sessionId: 's1', requestId: 'directive-request-1', kind: 'fleet-policy',
  text: 'Preserve civilian fuel reserves.', expectedRevision: 0,
};
const request = (input: Record<string, unknown> = data) => ({
  data: input, auth: { uid: 'u1' },
}) as CallableRequest<Record<string, unknown>>;

beforeEach(() => {
  Object.assign(mock, {
    role: 'player', post: 'admiral', connected: true, sessionExists: true,
    phase: 'active', currentTurn: 2, revision: 0, entries: [], rawState: undefined,
  });
  mock.update.mockReset();
  mock.set.mockReset();
  mock.receipts.clear();
  mock.events.clear();
  mock.set.mockImplementation((path: string, value: Record<string, unknown>) => {
    if (path.includes('/commandReceipts/')) mock.receipts.set(path, value);
    if (path.includes('/events/')) mock.events.set(path, value);
  });
  mock.get.mockImplementation(async (path: string) => {
    if (path.includes('/commandReceipts/')) {
      const value = mock.receipts.get(path);
      return { exists: value !== undefined, get: (key: string) => value?.[key] };
    }
    if (path.includes('/events/')) {
      const value = mock.events.get(path);
      return { exists: value !== undefined, get: (key: string) => value?.[key] };
    }
    if (path.endsWith('/players')) {
      return {
        docs: ['admiral', 'executive-officer', 'wing-commander'].map((post) => ({
          id: post,
          exists: true,
          get: (key: string) => ({ connected: true, role: 'player', activeConsoleRoleId: post } as Record<string, unknown>)[key],
        })),
      };
    }
    if (path.includes('/players/')) {
      const fields: Record<string, unknown> = {
        role: mock.role, activeConsoleRoleId: mock.post, connected: mock.connected,
      };
      return { id: 'u1', exists: true, get: (key: string) => fields[key] };
    }
    const fields: Record<string, unknown> = {
      phase: mock.phase,
      currentTurn: mock.currentTurn,
      activeRoleIds: ['admiral', 'executive-officer', 'wing-commander'],
      activeVesselIds: ['aegis'],
      admiralDirectives: mock.rawState ?? { revision: mock.revision, entries: mock.entries },
    };
    return { id: 's1', exists: mock.sessionExists, get: (key: string) => fields[key] };
  });
});

it.each(['fleet-policy', 'defence-coordination'])('publishes one public %s directive as the active Admiral', async (kind) => {
  await expect(publishAdmiralDirectiveCommand.run(request({ ...data, kind, text: '  Hold formation.  ' })))
    .resolves.toMatchObject({
      revision: 1,
      entries: [{
        id: 'admiral-directive:directive-request-1', kind,
        text: 'Hold formation.', cycle: 2,
      }],
    });
  expect(mock.update).toHaveBeenCalledWith('sessions/s1', expect.objectContaining({
    admiralDirectives: expect.objectContaining({ revision: 1 }),
  }));
  const event = mock.set.mock.calls.find(([path]) => String(path).includes('/events/'))?.[1];
  expect(event).toMatchObject({
    type: 'admiral-directive', kind, revision: 1, cycle: 2,
  });
  expect(event).not.toHaveProperty('text');
  expect(event).not.toHaveProperty('actorUid');
});

it('replays the same request without a second publication', async () => {
  const first = await publishAdmiralDirectiveCommand.run(request());
  mock.update.mockClear();
  await expect(publishAdmiralDirectiveCommand.run(request())).resolves.toEqual(first);
  expect(mock.update).not.toHaveBeenCalled();
});

it('denies other roles and a GM without scoped ship-console authority', async () => {
  mock.post = 'dione-captain';
  await expect(publishAdmiralDirectiveCommand.run(request())).rejects.toMatchObject({
    code: 'permission-denied',
  });
  mock.role = 'gm';
  mock.post = '';
  await expect(publishAdmiralDirectiveCommand.run(request())).rejects.toMatchObject({
    code: 'permission-denied',
  });
  expect(mock.update).not.toHaveBeenCalled();
});

it.each(['lobby', 'casting', 'briefing'])('rejects %s publication without a write', async (phase) => {
  mock.phase = phase;
  await expect(publishAdmiralDirectiveCommand.run(request())).rejects.toMatchObject({
    code: 'failed-precondition', details: { commandError: 'invalid-phase' },
  });
  expect(mock.update).not.toHaveBeenCalled();
  expect(mock.set).not.toHaveBeenCalled();
});

it('rejects Cycle 0 publication without a write', async () => {
  mock.currentTurn = 0;
  await expect(publishAdmiralDirectiveCommand.run(request())).rejects.toMatchObject({
    code: 'failed-precondition', details: { commandError: 'invalid-phase' },
  });
  expect(mock.update).not.toHaveBeenCalled();
  expect(mock.set).not.toHaveBeenCalled();
});

it('preserves an orphaned same-revision audit event without a write', async () => {
  mock.events.set('sessions/s1/events/admiral-directive-1', { type: 'legacy-event' });
  await expect(publishAdmiralDirectiveCommand.run(request())).rejects.toMatchObject({
    code: 'failed-precondition', details: { commandError: 'conflict' },
  });
  expect(mock.events.get('sessions/s1/events/admiral-directive-1')).toEqual({ type: 'legacy-event' });
  expect(mock.update).not.toHaveBeenCalled();
  expect(mock.set).not.toHaveBeenCalled();
});

it('rejects malformed stored history without sanitizing or writing it', async () => {
  mock.rawState = {
    revision: 2,
    entries: [
      { id: 'valid', kind: 'fleet-policy', text: 'Hold formation', cycle: 1, publishedAt: '2026-09-21T12:00:00.000Z' },
      { id: 'invalid', kind: 'gm-command', text: 'Override', cycle: 1, publishedAt: '2026-09-21T12:00:00.000Z' },
    ],
  };
  await expect(publishAdmiralDirectiveCommand.run(request({ ...data, expectedRevision: 2 })))
    .rejects.toMatchObject({
      code: 'failed-precondition', details: { commandError: 'conflict' },
    });
  expect(mock.update).not.toHaveBeenCalled();
  expect(mock.set).not.toHaveBeenCalled();
});

it('rejects malformed, stale, and terminal commands before mutation', async () => {
  await expect(publishAdmiralDirectiveCommand.run(request({ ...data, kind: 'gm-command' })))
    .rejects.toMatchObject({ code: 'invalid-argument' });
  await expect(publishAdmiralDirectiveCommand.run(request({ ...data, text: 'x'.repeat(501) })))
    .rejects.toMatchObject({ code: 'invalid-argument' });
  mock.revision = 1;
  mock.events.set('sessions/s1/events/admiral-directive-1', { type: 'admiral-directive' });
  await expect(publishAdmiralDirectiveCommand.run(request())).rejects.toMatchObject({
    code: 'failed-precondition', details: { commandError: 'stale-revision' },
  });
  mock.revision = 0;
  mock.phase = 'closed';
  await expect(publishAdmiralDirectiveCommand.run(request())).rejects.toMatchObject({
    code: 'failed-precondition', details: { commandError: 'terminal-session' },
  });
  expect(mock.update).not.toHaveBeenCalled();
});
