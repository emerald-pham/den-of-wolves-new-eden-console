import { beforeEach, expect, it, vi } from 'vitest';
import type { CallableRequest } from 'firebase-functions/v2/https';

const mock = vi.hoisted(() => ({
  get: vi.fn(),
  update: vi.fn(),
  set: vi.fn(),
  session: {} as Record<string, unknown>,
  actor: {} as Record<string, unknown>,
  target: {} as Record<string, unknown>,
  eligibility: {} as Record<string, unknown>,
  players: [] as Array<{ id: string; fields: Record<string, unknown> }>,
  receipts: new Map<string, Record<string, unknown>>(),
}));

vi.mock('firebase-admin/app', () => ({ initializeApp: vi.fn() }));
vi.mock('firebase-admin/firestore', () => ({
  getFirestore: () => ({
    doc: (path: string) => ({ path, id: path.split('/').at(-1) }),
    collection: (path: string) => ({ path }),
    runTransaction: (callback: (tx: unknown) => unknown) => callback({
      get: mock.get, update: mock.update, set: mock.set, delete: vi.fn(),
    }),
  }),
  FieldValue: { serverTimestamp: () => 'server-time' },
  Timestamp: { now: () => new Date('2026-09-12T12:00:00.000Z') },
}));

import { assignReplacementRole, setReplacementEligibility } from './index';

function snapshot(fields: Record<string, unknown>, path: string, exists = true) {
  return {
    exists,
    id: path.split('/').at(-1),
    ref: { path },
    data: () => fields,
    get: (field: string) => fields[field],
  };
}

function request(data: Record<string, unknown>, uid = 'gm-1') {
  return { data, auth: { uid } } as CallableRequest<Record<string, unknown>>;
}

beforeEach(() => {
  mock.get.mockReset();
  mock.update.mockReset();
  mock.set.mockReset();
  mock.receipts.clear();
  mock.session = {
    phase: 'active', currentTurn: 2, setupRevision: 4,
    configurationLocked: true, expansion: 'base',
    activeRoleIds: ['admiral'], activeVesselIds: ['aegis'],
  };
  mock.actor = { connected: true, role: 'gm' };
  mock.target = {
    connected: true, role: 'player', assignedRoleId: 'admiral',
    replacementRoleId: null, activeConsoleRoleId: 'admiral', seatId: null,
  };
  mock.eligibility = { eligible: false, revision: 0 };
  mock.players = [
    { id: 'gm-1', fields: mock.actor },
    { id: 'player-1', fields: mock.target },
  ];
  mock.set.mockImplementation((ref: { path: string }, fields: Record<string, unknown>) => {
    if (ref.path.includes('/commandReceipts/')) mock.receipts.set(ref.path, fields);
  });
  mock.get.mockImplementation(async (ref: { path: string }) => {
    if (ref.path === 'sessions/s1') return snapshot(mock.session, ref.path);
    if (ref.path === 'sessions/s1/players/gm-1') return snapshot(mock.actor, ref.path);
    if (ref.path === 'sessions/s1/players/player-1') return snapshot(mock.target, ref.path);
    if (ref.path === 'sessions/s1/players') {
      return { exists: true, docs: mock.players.map(({ id, fields }) => snapshot(fields, `sessions/s1/players/${id}`)) };
    }
    if (ref.path === 'sessions/s1/gmInstances/bridge') {
      return snapshot({ uid: 'gm-1', connected: true, lastSeenAt: new Date() }, ref.path);
    }
    if (ref.path === 'sessions/s1/replacementEligibility/player-1') {
      return snapshot(mock.eligibility, ref.path, true);
    }
    if (ref.path.startsWith('sessions/s1/commandReceipts/')) {
      const fields = mock.receipts.get(ref.path);
      return snapshot(fields ?? {}, ref.path, fields !== undefined);
    }
    return snapshot({}, ref.path, false);
  });
});

it('records explicit eligibility and assigns a replacement atomically', async () => {
  await expect(setReplacementEligibility.run(request({
    sessionId: 's1', instanceId: 'bridge', requestId: 'eligibility-1',
    targetUid: 'player-1', reason: 'dead', expectedRevision: 0, expectedSetupRevision: 4,
  }))).resolves.toMatchObject({ status: 'committed', revision: 1 });
  expect(mock.set).toHaveBeenCalledWith(
    expect.objectContaining({ path: 'sessions/s1/replacementEligibility/player-1/audit/eligibility-1' }),
    expect.objectContaining({ reason: 'dead', targetUid: 'player-1' }),
  );

  mock.eligibility = { eligible: true, reason: 'dead', revision: 1 };
  await expect(assignReplacementRole.run(request({
    sessionId: 's1', instanceId: 'bridge', requestId: 'replacement-1',
    targetUid: 'player-1', replacementRoleId: 'wolf-commander', expectedRevision: 1,
    expectedSetupRevision: 4,
  }))).resolves.toMatchObject({ status: 'committed', replacementRoleId: 'wolf-commander' });

  expect(mock.update).toHaveBeenCalledWith(
    expect.objectContaining({ path: 'sessions/s1/players/player-1' }),
    { replacementRoleId: 'wolf-commander', activeConsoleRoleId: null, seatId: null },
  );
  expect(mock.set).toHaveBeenCalledWith(
    expect.objectContaining({ path: 'sessions/s1/roleBriefs/player-1' }),
    expect.objectContaining({ roleId: 'wolf-commander', visibleToUids: ['player-1'] }),
  );
  expect(mock.set).toHaveBeenCalledWith(
    expect.objectContaining({ path: 'sessions/s1/replacementAssignments/replacement-1/audit/replacement-1' }),
    expect.objectContaining({ replacementRoleId: 'wolf-commander', targetUid: 'player-1' }),
  );
  expect(mock.set).not.toHaveBeenCalledWith(
    expect.objectContaining({ path: expect.stringContaining('/secrets/loyalty-') }),
    expect.anything(),
  );
});

it('replays the same request and rejects a consumed or occupied replacement', async () => {
  mock.eligibility = { eligible: true, reason: 'late', revision: 3 };
  const payload = {
    sessionId: 's1', instanceId: 'bridge', requestId: 'replacement-replay',
    targetUid: 'player-1', replacementRoleId: 'wolf-commander', expectedRevision: 3,
    expectedSetupRevision: 4,
  };
  const first = await assignReplacementRole.run(request(payload));
  await expect(assignReplacementRole.run(request(payload))).resolves.toEqual(first);

  mock.receipts.clear();
  mock.target = { ...mock.target, replacementRoleId: 'wolf-commander', activeConsoleRoleId: null };
  mock.eligibility = { eligible: true, reason: 'late', revision: 3 };
  await expect(assignReplacementRole.run(request({
    ...payload, requestId: 'replacement-occupied', replacementRoleId: 'comms-officer',
  }))).rejects.toMatchObject({ code: 'failed-precondition' });
});

it('rejects a stale eligibility cursor before writing a role', async () => {
  mock.eligibility = { eligible: true, reason: 'arrested', revision: 5 };
  await expect(assignReplacementRole.run(request({
    sessionId: 's1', instanceId: 'bridge', requestId: 'replacement-stale',
    targetUid: 'player-1', replacementRoleId: 'wolf-commander', expectedRevision: 4,
    expectedSetupRevision: 4,
  }))).rejects.toMatchObject({ code: 'failed-precondition' });
  expect(mock.update).not.toHaveBeenCalledWith(
    expect.objectContaining({ path: 'sessions/s1/players/player-1' }),
    expect.anything(),
  );
});

it('returns a stale result when the shared setup revision changed', async () => {
  mock.session = { ...mock.session, setupRevision: 9 };
  mock.eligibility = { eligible: true, reason: 'late', revision: 3 };

  await expect(assignReplacementRole.run(request({
    sessionId: 's1', instanceId: 'bridge', requestId: 'replacement-setup-stale',
    targetUid: 'player-1', replacementRoleId: 'wolf-commander', expectedRevision: 3,
    expectedSetupRevision: 4,
  }))).resolves.toMatchObject({ status: 'stale', revision: 3, setupRevision: 9 });
  expect(mock.update).not.toHaveBeenCalledWith(
    expect.objectContaining({ path: 'sessions/s1/players/player-1' }),
    expect.anything(),
  );
});

it.each(['comms-officer', 'wolf-commander'])('atomically replaces former ship discovery on assignment to %s', async (replacementRoleId) => {
  mock.session.activeVesselIds = ['aegis', 'dione'];
  mock.session.shipGalacticCoordinates = { aegis: '1413', dione: '5143' };
  mock.session.shipNavigationLogs = {};
  mock.target.assignedRoleId = 'dione-captain';
  mock.target.fleetGroupId = 'fleet-1';
  mock.eligibility = { eligible: true, reason: 'dead', revision: 1 };
  await expect(assignReplacementRole.run(request({
    sessionId: 's1', instanceId: 'bridge', requestId: 'replace-discovery',
    targetUid: 'player-1', replacementRoleId, expectedRevision: 1, expectedSetupRevision: 4,
  }))).resolves.toMatchObject({ status: 'committed' });
  const write = mock.set.mock.calls.find(([ref]) => ref.path === 'sessions/s1/playerDiscoveries/player-1');
  expect(write).toBeDefined();
  expect(write?.[1]).toMatchObject({
    groupId: 'fleet-1', navigationLogs: [],
    knownCoordinates: replacementRoleId === 'comms-officer' ? ['0000', '1413'] : ['0000'],
  });
  expect(write?.[1].shipId).toBe(replacementRoleId === 'comms-officer' ? 'aegis' : undefined);
  expect(JSON.stringify(write?.[1])).not.toContain('5143');
  expect(mock.target.assignedRoleId).toBe('dione-captain');
});

it('rejects an extra-ship replacement when only small-ship state names a vessel', async () => {
  mock.session = { ...mock.session, activeVesselIds: undefined, smallShipStates: { gorgoneion: {} } };
  mock.eligibility = { eligible: true, reason: 'late', revision: 1 };

  await expect(assignReplacementRole.run(request({
    sessionId: 's1', instanceId: 'bridge', requestId: 'replacement-small-state-only',
    targetUid: 'player-1', replacementRoleId: 'gorgoneion-captain', expectedRevision: 1,
    expectedSetupRevision: 4,
  }))).rejects.toMatchObject({ code: 'failed-precondition' });
  expect(mock.update).not.toHaveBeenCalled();
  expect(mock.set).not.toHaveBeenCalled();
});

it('rejects an extra-ship replacement when the persisted vessel tuple is malformed', async () => {
  mock.session = { ...mock.session, activeVesselIds: ['aegis', 'aegis'], smallShipStates: { gorgoneion: {} } };
  mock.eligibility = { eligible: true, reason: 'removed', revision: 1 };

  await expect(assignReplacementRole.run(request({
    sessionId: 's1', instanceId: 'bridge', requestId: 'replacement-malformed-tuple',
    targetUid: 'player-1', replacementRoleId: 'gorgoneion-captain', expectedRevision: 1,
    expectedSetupRevision: 4,
  }))).rejects.toMatchObject({ code: 'failed-precondition' });
  expect(mock.update).not.toHaveBeenCalled();
  expect(mock.set).not.toHaveBeenCalled();
});

it('allows an extra-ship replacement only when its vessel is in the persisted tuple', async () => {
  mock.session = { ...mock.session, activeVesselIds: ['aegis', 'gorgoneion'] };
  mock.eligibility = { eligible: true, reason: 'dead', revision: 1 };

  await expect(assignReplacementRole.run(request({
    sessionId: 's1', instanceId: 'bridge', requestId: 'replacement-valid-vessel',
    targetUid: 'player-1', replacementRoleId: 'gorgoneion-captain', expectedRevision: 1,
    expectedSetupRevision: 4,
  }))).resolves.toMatchObject({ status: 'committed', replacementRoleId: 'gorgoneion-captain' });
  expect(mock.update).toHaveBeenCalledWith(
    expect.objectContaining({ path: 'sessions/s1/players/player-1' }),
    { replacementRoleId: 'gorgoneion-captain', activeConsoleRoleId: null, seatId: null },
  );
  expect(mock.set).toHaveBeenCalledWith(
    expect.objectContaining({ path: 'sessions/s1/roleBriefs/player-1' }),
    expect.objectContaining({ roleId: 'gorgoneion-captain', visibleToUids: ['player-1'] }),
  );
});
