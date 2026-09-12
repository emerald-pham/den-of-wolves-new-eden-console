import { beforeEach, expect, it, vi } from 'vitest';
import type { CallableRequest } from 'firebase-functions/v2/https';

const mock = vi.hoisted(() => ({
  get: vi.fn(), update: vi.fn(), set: vi.fn(), receipts: new Map<string, Record<string, unknown>>(),
  role: 'player', post: 'press-officer', connected: true,
  exists: true, phase: 'active', currentTurn: 1, pressDispatch: undefined as unknown,
  fleetTicker: undefined as unknown,
  turnPhase: undefined as unknown,
  activeRoleIds: undefined as readonly string[] | undefined,
  pressEnabled: true,
  pressHolderUid: undefined as string | undefined,
  randomUUID: vi.fn(() => 'dispatch-new'),
}));
vi.mock('node:crypto', () => ({ randomInt: vi.fn(), randomUUID: mock.randomUUID }));
vi.mock('firebase-admin/app', () => ({ initializeApp: vi.fn() }));
vi.mock('firebase-admin/firestore', () => ({
  getFirestore: () => ({
    doc: (path: string) => path,
    runTransaction: (callback: (tx: unknown) => unknown) => callback({
      get: mock.get, update: mock.update, set: mock.set,
    }),
  }),
  FieldValue: { serverTimestamp: () => 'server-time' },
  Timestamp: { now: () => ({ toMillis: () => Date.now() }) },
}));

import { dismissPressDispatch, publishPressDispatch } from './index';

const data = { sessionId: 's1', text: 'Convoy arrival confirmed', expectedRevision: 0 };
const request = (input: Record<string, unknown> = data, uid = 'u1') => ({
  data: input, auth: { uid },
}) as CallableRequest<Record<string, unknown>>;

function expectAuthoritativeTicker(update: Record<string, unknown>, sourceId: string) {
  expect(update.fleetTicker).toEqual(expect.objectContaining({
    revision: expect.any(Number),
    nextSequence: expect.any(Number),
    replayCursor: expect.any(Number),
  }));
  const ticker = update.fleetTicker as {
    current?: { sourceId?: string };
    queued?: readonly { sourceId?: string }[];
    draining?: readonly { sourceId?: string }[];
  };
  expect([
    ticker.current?.sourceId,
    ...(ticker.queued ?? []).map((entry) => entry.sourceId),
    ...(ticker.draining ?? []).map((entry) => entry.sourceId),
  ]).toContain(sourceId);
}

beforeEach(() => {
  Object.assign(mock, {
    role: 'player', post: 'press-officer', connected: true, exists: true,
    phase: 'active', currentTurn: 1, pressDispatch: undefined, fleetTicker: undefined, turnPhase: undefined,
    activeRoleIds: undefined,
    pressEnabled: true,
    pressHolderUid: undefined,
  });
  mock.randomUUID.mockReset();
  mock.randomUUID.mockReturnValue('dispatch-new');
  mock.update.mockReset();
  mock.set.mockReset();
  mock.receipts.clear();
  mock.set.mockImplementation((path: string, value: Record<string, unknown>) => {
    mock.receipts.set(path, value);
  });
  mock.get.mockImplementation(async (path: string) => {
    if (path.includes('/commandReceipts/')) {
      const value = mock.receipts.get(path);
      return { exists: value !== undefined, get: (key: string) => value?.[key] };
    }
    const fields: Record<string, unknown> = path.includes('/players/')
      ? { role: mock.role, activeConsoleRoleId: mock.post, connected: mock.connected }
      : {
        phase: mock.phase,
        currentTurn: mock.currentTurn,
        fleetRedAlert: { active: true, revision: 1 },
        pressDispatch: mock.pressDispatch,
        fleetTicker: mock.fleetTicker,
        turnPhase: mock.turnPhase,
        activeRoleIds: mock.activeRoleIds,
        pressEnabled: mock.pressEnabled,
        pressHolderUid: mock.pressHolderUid,
      };
    return { exists: mock.exists, get: (key: string) => fields[key] };
  });
});

it('lets the active Press Officer publish a serialized dispatch during red alert', async () => {
  mock.pressDispatch = { text: 'Old news', revision: 0 };
  await publishPressDispatch.run(request());
  expect(mock.update).toHaveBeenCalledWith('sessions/s1', expect.objectContaining({
    pressDispatch: {
      dispatches: [
        { id: 'legacy-0', text: 'Old news' },
        { id: 'dispatch-new', text: `SNN // ${data.text}` },
      ],
      revision: 1,
    },
    updatedAt: 'server-time',
  }));
  expectAuthoritativeTicker(mock.update.mock.calls[0]?.[1], 'dispatch-new');
});

it('uses revision zero when the session has no earlier dispatch', async () => {
  await publishPressDispatch.run(request());
  expect(mock.update).toHaveBeenCalledWith('sessions/s1', expect.objectContaining({
    pressDispatch: {
      dispatches: [{ id: 'dispatch-new', text: `SNN // ${data.text}` }],
      revision: 1,
    },
    updatedAt: 'server-time',
  }));
  expectAuthoritativeTicker(mock.update.mock.calls[0]?.[1], 'dispatch-new');
});

it('stops an airspace bulletin when Press publishes new copy', async () => {
  mock.turnPhase = {
    turn: 1,
    teamPhaseEndsAt: '2026-09-06T12:10:00.000Z',
    openAirspaceEndsAt: '2026-09-06T12:30:00.000Z',
    airspace: { state: 'lifted', tickerActive: true, pressAccess: false },
  };

  await publishPressDispatch.run(request());

  expect(mock.update).toHaveBeenCalledWith('sessions/s1', expect.objectContaining({
    pressDispatch: {
      dispatches: [{ id: 'dispatch-new', text: `SNN // ${data.text}` }],
      revision: 1,
    },
    turnPhase: {
      turn: 1,
      teamPhaseEndsAt: '2026-09-06T12:10:00.000Z',
      openAirspaceEndsAt: '2026-09-06T12:30:00.000Z',
      airspace: { state: 'lifted', tickerActive: false, pressAccess: false },
    },
    updatedAt: 'server-time',
  }));
  expectAuthoritativeTicker(mock.update.mock.calls[0]?.[1], 'dispatch-new');
});

it('allows the claimed Press Officer to publish during Turn 0', async () => {
  mock.currentTurn = 0;
  await expect(publishPressDispatch.run(request())).resolves.toMatchObject({ revision: 1 });
  expect(mock.update).toHaveBeenCalledWith('sessions/s1', expect.objectContaining({
    pressDispatch: {
      dispatches: [{ id: 'dispatch-new', text: `SNN // ${data.text}` }],
      revision: 1,
    },
  }));
});

it('allows the claimed Press Officer to dismiss during Turn 0', async () => {
  mock.currentTurn = 0;
  mock.pressDispatch = {
    dispatches: [{ id: 'dispatch-1', text: 'SNN // First report' }],
    revision: 1,
  };
  await expect(dismissPressDispatch.run(request({
    sessionId: 's1', dispatchId: 'dispatch-1', expectedRevision: 1,
  }))).resolves.toMatchObject({ revision: 2, dispatches: [] });
  expect(mock.update).toHaveBeenCalledWith('sessions/s1', expect.objectContaining({
    pressDispatch: { dispatches: [], revision: 2 },
  }));
});

it('dismisses only the selected active dispatch and advances the collection revision', async () => {
  mock.pressDispatch = {
    dispatches: [
      { id: 'dispatch-1', text: 'SNN // First report' },
      { id: 'dispatch-2', text: 'SNN // Second report' },
    ],
    revision: 2,
  };
  await dismissPressDispatch.run(request({
    sessionId: 's1', dispatchId: 'dispatch-1', expectedRevision: 2,
  }));
  expect(mock.update).toHaveBeenCalledWith('sessions/s1', expect.objectContaining({
    pressDispatch: {
      dispatches: [{ id: 'dispatch-2', text: 'SNN // Second report' }],
      revision: 3,
    },
    updatedAt: 'server-time',
  }));
  const update = mock.update.mock.calls[0]?.[1] as Record<string, unknown>;
  expectAuthoritativeTicker(update, 'dispatch-1');
});

it('records dismissal for a Press copy already in the authoritative drain', async () => {
  mock.pressDispatch = {
    dispatches: [{ id: 'dispatch-1', text: 'SNN // First report' }],
    revision: 1,
  };
  mock.fleetTicker = {
    revision: 2,
    nextSequence: 2,
    replayCursor: 2,
    current: {
      id: 's1:fleet-ticker:2', sequence: 2, source: 'automatic', priority: 100,
      text: 'FINALE', tone: 'normal', gap: 'long', sourceId: 'debrief:1',
      createdAt: '2026-09-12T13:00:00.000Z',
    },
    queued: [],
    draining: [{
      id: 's1:fleet-ticker:1', sequence: 1, source: 'press', priority: 20,
      text: 'SNN // First report', tone: 'normal', gap: 'long', sourceId: 'dispatch-1',
      createdAt: '2026-09-12T12:59:00.000Z',
    }],
    dismissed: [],
  };

  await dismissPressDispatch.run(request({
    sessionId: 's1', dispatchId: 'dispatch-1', expectedRevision: 1,
  }));

  const update = mock.update.mock.calls[0]?.[1] as Record<string, unknown>;
  expect(update.fleetTicker).toMatchObject({
    revision: 3,
    current: { id: 's1:fleet-ticker:2' },
    draining: [{ id: 's1:fleet-ticker:1', sourceId: 'dispatch-1' }],
    dismissed: [{ id: 's1:fleet-ticker:1', revision: 3 }],
  });
});

it('denies other roles, disconnected players, and unsigned callers', async () => {
  mock.post = 'admiral';
  await expect(publishPressDispatch.run(request())).rejects
    .toMatchObject({ code: 'permission-denied' });
  mock.post = 'press-officer';
  mock.connected = false;
  await expect(publishPressDispatch.run(request())).rejects
    .toMatchObject({ code: 'permission-denied' });
  await expect(publishPressDispatch.run({ data } as CallableRequest<typeof data>)).rejects
    .toMatchObject({ code: 'unauthenticated' });
  expect(mock.update).not.toHaveBeenCalled();
});

it('keeps Press publishing when the counted roster changes', async () => {
  mock.activeRoleIds = ['admiral'];

  await expect(publishPressDispatch.run(request())).resolves.toEqual({
    dispatches: [{ id: 'dispatch-new', text: `SNN // ${data.text}` }],
    revision: 1,
  });
  expect(mock.update).toHaveBeenCalled();
});

it('replays a live publish request id without publishing a second dispatch or ticker revision', async () => {
  const command = { ...data, requestId: 'press-retry-1' };
  const first = await publishPressDispatch.run(request(command));
  mock.update.mockClear();
  mock.set.mockClear();

  await expect(publishPressDispatch.run(request(command))).resolves.toEqual(first);
  expect(mock.update).not.toHaveBeenCalled();
  expect(mock.set).not.toHaveBeenCalled();
});

const replayInvalidations = [
  { name: 'role revocation', apply: () => { mock.post = 'admiral'; }, code: 'permission-denied' },
  { name: 'Press reassignment', apply: () => { mock.pressHolderUid = 'u2'; }, code: 'permission-denied' },
  { name: 'Press disablement', apply: () => { mock.pressEnabled = false; }, code: 'permission-denied' },
  { name: 'disconnect', apply: () => { mock.connected = false; }, code: 'permission-denied' },
  { name: 'endgame closure', apply: () => { mock.phase = 'closed'; }, code: 'failed-precondition' },
] as const;

it.each(replayInvalidations)('does not replay a publish after $name', async ({ apply, code }) => {
  const command = { ...data, requestId: 'press-revoked-publish' };
  await publishPressDispatch.run(request(command));
  mock.update.mockClear();
  mock.set.mockClear();

  apply();
  await expect(publishPressDispatch.run(request(command))).rejects.toMatchObject({ code });
  expect(mock.update).not.toHaveBeenCalled();
  expect(mock.set).not.toHaveBeenCalled();
});

it('denies a foreign UID reusing a publish receipt without disclosing its result or writing', async () => {
  const command = { ...data, requestId: 'press-foreign-publish' };
  const first = await publishPressDispatch.run(request(command));
  mock.update.mockClear();
  mock.set.mockClear();

  await expect(publishPressDispatch.run(request(command, 'u2'))).rejects
    .toMatchObject({ code: 'permission-denied' });
  expect(mock.update).not.toHaveBeenCalled();
  expect(mock.set).not.toHaveBeenCalled();
  expect(first).toEqual({
    dispatches: [{ id: 'dispatch-new', text: `SNN // ${data.text}` }],
    revision: 1,
  });
});

it('replays a live dismissal request id without retiring a second dispatch', async () => {
  mock.pressDispatch = {
    dispatches: [{ id: 'dispatch-1', text: 'SNN // First report' }], revision: 1,
  };
  const command = {
    sessionId: 's1', requestId: 'press-retry-dismissal', dispatchId: 'dispatch-1', expectedRevision: 1,
  };
  const first = await dismissPressDispatch.run(request(command));
  mock.update.mockClear();
  mock.set.mockClear();

  await expect(dismissPressDispatch.run(request(command))).resolves.toEqual(first);
  expect(mock.update).not.toHaveBeenCalled();
  expect(mock.set).not.toHaveBeenCalled();
});

it.each(replayInvalidations)('does not replay a dismissal after $name', async ({ apply, code }) => {
  mock.pressDispatch = {
    dispatches: [{ id: 'dispatch-1', text: 'SNN // First report' }], revision: 1,
  };
  const command = {
    sessionId: 's1', requestId: 'press-revoked-dismissal', dispatchId: 'dispatch-1', expectedRevision: 1,
  };
  await dismissPressDispatch.run(request(command));
  mock.update.mockClear();
  mock.set.mockClear();

  apply();
  await expect(dismissPressDispatch.run(request(command))).rejects.toMatchObject({ code });
  expect(mock.update).not.toHaveBeenCalled();
  expect(mock.set).not.toHaveBeenCalled();
});

it('denies a foreign UID reusing a dismissal receipt without disclosing its result or writing', async () => {
  mock.pressDispatch = {
    dispatches: [{ id: 'dispatch-1', text: 'SNN // First report' }], revision: 1,
  };
  const command = {
    sessionId: 's1', requestId: 'press-foreign-dismissal', dispatchId: 'dispatch-1', expectedRevision: 1,
  };
  const first = await dismissPressDispatch.run(request(command));
  mock.update.mockClear();
  mock.set.mockClear();

  await expect(dismissPressDispatch.run(request(command, 'u2'))).rejects
    .toMatchObject({ code: 'permission-denied' });
  expect(mock.update).not.toHaveBeenCalled();
  expect(mock.set).not.toHaveBeenCalled();
  expect(first).toEqual({ dispatches: [], revision: 2 });
});

it('denies every Press action while the authoritative toggle is disabled, including GM access', async () => {
  mock.pressEnabled = false;
  await expect(publishPressDispatch.run(request())).rejects
    .toMatchObject({ code: 'permission-denied' });
  mock.role = 'gm';
  await expect(publishPressDispatch.run(request())).rejects
    .toMatchObject({ code: 'permission-denied' });
  mock.pressDispatch = {
    dispatches: [{ id: 'dispatch-1', text: 'SNN // First report' }], revision: 1,
  };
  await expect(dismissPressDispatch.run(request({
    sessionId: 's1', dispatchId: 'dispatch-1', expectedRevision: 1,
  }))).rejects.toMatchObject({ code: 'permission-denied' });
  expect(mock.update).not.toHaveBeenCalled();
});

it('rejects closed sessions and stale revisions without writing', async () => {
  mock.phase = 'closed';
  await expect(publishPressDispatch.run(request())).rejects
    .toMatchObject({ code: 'failed-precondition', details: { commandError: 'terminal-session' } });
  mock.phase = 'active';
  mock.pressDispatch = { text: 'Old news', revision: 2 };
  await expect(publishPressDispatch.run(request())).rejects
    .toMatchObject({ code: 'failed-precondition', details: { commandError: 'stale-revision' } });
  expect(mock.update).not.toHaveBeenCalled();
});

it('rejects dismissal by another role, of missing copy, or at a stale revision', async () => {
  mock.pressDispatch = {
    dispatches: [{ id: 'dispatch-1', text: 'SNN // First report' }], revision: 2,
  };
  const dismissal = { sessionId: 's1', dispatchId: 'dispatch-1', expectedRevision: 2 };
  mock.post = 'admiral';
  await expect(dismissPressDispatch.run(request(dismissal))).rejects
    .toMatchObject({ code: 'permission-denied' });
  mock.post = 'press-officer';
  await expect(dismissPressDispatch.run(request({ ...dismissal, dispatchId: 'missing' }))).rejects
    .toMatchObject({ code: 'failed-precondition' });
  await expect(dismissPressDispatch.run(request({ ...dismissal, expectedRevision: 1 }))).rejects
    .toMatchObject({ code: 'failed-precondition', details: { commandError: 'stale-revision' } });
  expect(mock.update).not.toHaveBeenCalled();
});
