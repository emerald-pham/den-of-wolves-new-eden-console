import { beforeEach, expect, it, vi } from 'vitest';
import type { CallableRequest } from 'firebase-functions/v2/https';
import type { Firestore } from 'firebase-admin/firestore';
import { createCurrentMemberSessionReader } from './memberSessionCallable';

const mock = vi.hoisted(() => ({
  get: vi.fn(),
  update: vi.fn(),
  set: vi.fn(),
  session: {} as Record<string, unknown>,
  actor: {} as Record<string, unknown>,
  target: {} as Record<string, unknown>,
  eligibility: {} as Record<string, unknown>,
  players: [] as Array<{ id: string; fields: Record<string, unknown> }>,
  secrets: new Map<string, Record<string, unknown>>(),
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

import { assignReplacementRole, publishWolfCommanderAddress, setReplacementEligibility } from './index';

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
  mock.secrets.clear();
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
    if (ref.path.startsWith('sessions/s1/secrets/loyalty-')) {
      const uid = ref.path.slice('sessions/s1/secrets/loyalty-'.length);
      const fields = mock.secrets.get(uid);
      return snapshot(fields ?? {}, ref.path, fields !== undefined);
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

it('assigns and hydrates a candidate-loss actor, then accepts the replacement role action', async () => {
  mock.target = { ...mock.target, uid: 'player-1', sessionId: 's1', fleetGroupId: 'fleet-1',
    connectionGeneration: 2, candidateDisposition: { code: 'O', outcome: 'lost', cycle: 6 } };
  mock.players = [
    { id: 'gm-1', fields: mock.actor },
    { id: 'player-1', fields: mock.target },
  ];
  const teamEnd = new Date(Date.now() + 60_000).toISOString();
  mock.session.turnPhase = { turn: 2, teamPhaseEndsAt: teamEnd,
    openAirspaceEndsAt: new Date(Date.parse(teamEnd) + 60_000).toISOString(),
    airspace: { state: 'restricted', tickerActive: true, pressAccess: false } };
  mock.session.fullGameDemo = { status: 'active', progression: 'manual' };
  const eligibilityResult = await setReplacementEligibility.run(request({
    sessionId: 's1', instanceId: 'bridge', requestId: 'eligibility-1',
    targetUid: 'player-1', reason: 'dead', expectedRevision: 0, expectedSetupRevision: 4,
  }));
  expect(eligibilityResult).toMatchObject({
    status: 'committed', revision: 1, actorUid: 'gm-1',
    recordedAt: expect.any(String),
  });
  expect(mock.set).toHaveBeenCalledWith(
    expect.objectContaining({ path: 'sessions/s1/replacementEligibility/player-1/audit/eligibility-1' }),
    expect.objectContaining({
      reason: 'dead', targetUid: 'player-1', actorUid: 'gm-1',
      recordedAt: eligibilityResult.status === 'committed' ? eligibilityResult.recordedAt : undefined,
    }),
  );

  mock.eligibility = { eligible: true, reason: 'dead', revision: 1 };
  const assignmentResult = await assignReplacementRole.run(request({
    sessionId: 's1', instanceId: 'bridge', requestId: 'replacement-1',
    targetUid: 'player-1', replacementRoleId: 'wolf-commander', expectedRevision: 1,
    expectedSetupRevision: 4,
  }));
  expect(assignmentResult).toMatchObject({
    status: 'committed', replacementRoleId: 'wolf-commander', actorUid: 'gm-1',
    recordedAt: expect.any(String),
  });

  expect(mock.update).toHaveBeenCalledWith(
    expect.objectContaining({ path: 'sessions/s1/players/player-1' }),
    { replacementRoleId: 'wolf-commander', replacementStatus: null,
      activeConsoleRoleId: null, seatId: null },
  );
  const actorPatch = mock.update.mock.calls.find(([ref]) => ref.path === 'sessions/s1/players/player-1')?.[1];
  expect(actorPatch).not.toHaveProperty('candidateDisposition');
  Object.assign(mock.target, actorPatch);
  expect(mock.target.candidateDisposition).toEqual({ code: 'O', outcome: 'lost', cycle: 6 });

  const records: Record<string, Record<string, unknown>> = {
    'sessions/s1': { ...mock.session },
    'sessions/s1/players/player-1': { ...mock.target },
    'sessions/s1/fleetGroups/fleet-1': { id: 'fleet-1', vesselIds: ['aegis'], memberUids: ['player-1'],
      memberShipIds: { 'player-1': 'aegis' } },
  };
  const memberSnapshot = (path: string) => snapshot(records[path] ?? {}, path, records[path] !== undefined);
  const reader = createCurrentMemberSessionReader({
    db: {
      doc: (path: string) => ({ path }),
      collection: (path: string) => ({ path, collection: true }),
      runTransaction: async (callback: (tx: unknown) => unknown) => callback({
        get: async ({ path, collection }: { path: string; collection?: boolean }) => collection
          ? { docs: Object.keys(records).filter(key => key.startsWith(`${path}/`) &&
            !key.slice(path.length + 1).includes('/')).map(memberSnapshot) }
          : memberSnapshot(path),
      }),
    } as unknown as Firestore,
    projectSession: (source, sessionId) => ({ ...source.data(), id: sessionId }),
  });
  const hydrated = await reader(request({ sessionId: 's1' }, 'player-1'));
  expect(hydrated).toMatchObject({ type: 'current-member-session', actorUid: 'player-1', groupId: 'fleet-1',
    currentActorBerthAuthority: { actorUid: 'player-1', replacementRoleId: 'wolf-commander',
      activeConsoleRoleId: null, shipId: 'aegis' } });

  await expect(publishWolfCommanderAddress.run(request({
    sessionId: 's1', requestId: 'candidate-loss-replacement-address', expectedCycle: 2,
    message: 'The assigned Commander is active after reassignment.',
  }, 'player-1'))).resolves.toMatchObject({ status: 'committed', actorRoleId: 'wolf-commander' });
  expect(mock.set).toHaveBeenCalledWith(
    expect.objectContaining({ path: 'sessions/s1/roleBriefs/player-1' }),
    expect.objectContaining({ roleId: 'wolf-commander', visibleToUids: ['player-1'] }),
  );
  expect(mock.set).toHaveBeenCalledWith(
    expect.objectContaining({ path: 'sessions/s1/replacementAssignments/replacement-1/audit/replacement-1' }),
    expect.objectContaining({
      replacementRoleId: 'wolf-commander', targetUid: 'player-1', actorUid: 'gm-1',
      recordedAt: assignmentResult.status === 'committed' ? assignmentResult.recordedAt : undefined,
    }),
  );
  expect(mock.set).not.toHaveBeenCalledWith(
    expect.objectContaining({ path: expect.stringContaining('/secrets/loyalty-') }),
    expect.anything(),
  );
});

it('lets the GM reassign a replacement holder after the holder leaves a destroyed ship', async () => {
  mock.session.activeVesselIds = ['aegis', 'dione'];
  mock.target = {
    ...mock.target,
    replacementRoleId: 'vip-host', activeConsoleRoleId: null,
    escapeState: {
      status: 'fled', shipId: 'dione', destructionEventId: 'damage-destroyed-dione',
      revision: 2, fleeRequestId: 'flee-dione-1',
    },
  };
  mock.players = [
    { id: 'gm-1', fields: mock.actor },
    { id: 'player-1', fields: mock.target },
  ];
  mock.eligibility = { eligible: true, reason: 'dead', revision: 1 };

  await expect(assignReplacementRole.run(request({
    sessionId: 's1', instanceId: 'bridge', requestId: 'replacement-after-escape',
    targetUid: 'player-1', replacementRoleId: 'wolf-commander', expectedRevision: 1,
    expectedSetupRevision: 4,
  }))).resolves.toMatchObject({ status: 'committed', replacementRoleId: 'wolf-commander' });

  expect(mock.update).toHaveBeenCalledWith(
    expect.objectContaining({ path: 'sessions/s1/players/player-1' }),
    { replacementRoleId: 'wolf-commander', replacementStatus: null,
      activeConsoleRoleId: null, seatId: null, escapeState: null },
  );
});

it('does not reassign an escaped replacement holder back onto the destroyed vessel', async () => {
  mock.session.activeVesselIds = ['aegis', 'dione'];
  mock.target = {
    ...mock.target,
    replacementRoleId: 'vip-host', activeConsoleRoleId: null,
    escapeState: {
      status: 'pending', shipId: 'dione', destructionEventId: 'damage-destroyed-dione', revision: 1,
    },
  };
  mock.players = [
    { id: 'gm-1', fields: mock.actor },
    { id: 'player-1', fields: mock.target },
  ];
  mock.eligibility = { eligible: true, reason: 'dead', revision: 1 };

  await expect(assignReplacementRole.run(request({
    sessionId: 's1', instanceId: 'bridge', requestId: 'replacement-destroyed-vessel',
    targetUid: 'player-1', replacementRoleId: 'vip-host', expectedRevision: 1,
    expectedSetupRevision: 4,
  }))).rejects.toMatchObject({ code: 'failed-precondition' });
  expect(mock.update).not.toHaveBeenCalledWith(
    expect.objectContaining({ path: 'sessions/s1/players/player-1' }),
    expect.anything(),
  );
});

it('updates only the complete reciprocal Friend counterpart to the replacement role', async () => {
  mock.players.push({ id: 'player-2', fields: {
    connected: true, role: 'player', assignedRoleId: 'dione-captain', replacementRoleId: null,
    activeConsoleRoleId: 'dione-captain', seatId: null,
  } });
  mock.secrets.set('player-1', {
    visibleToUids: ['player-1'],
    payload: {
      type: 'loyalty', kind: 'friend', suspicion: 0,
      partnerUid: 'player-2', partnerRoleId: 'dione-captain',
    },
  });
  mock.secrets.set('player-2', {
    visibleToUids: ['player-2'],
    payload: {
      type: 'loyalty', kind: 'friend', suspicion: 0,
      partnerUid: 'player-1', partnerRoleId: 'admiral',
    },
  });
  mock.eligibility = { eligible: true, reason: 'dead', revision: 1 };

  await expect(assignReplacementRole.run(request({
    sessionId: 's1', instanceId: 'bridge', requestId: 'replacement-friend',
    targetUid: 'player-1', replacementRoleId: 'wolf-commander', expectedRevision: 1,
    expectedSetupRevision: 4,
  }))).resolves.toMatchObject({ status: 'committed', replacementRoleId: 'wolf-commander' });

  expect(mock.update).toHaveBeenCalledWith(
    expect.objectContaining({ path: 'sessions/s1/secrets/loyalty-player-2' }),
    { 'payload.partnerRoleId': 'wolf-commander' },
  );
});

it('leaves malformed or unrelated Friend secrets untouched during replacement', async () => {
  mock.secrets.set('player-1', {
    visibleToUids: ['player-1'],
    payload: { type: 'loyalty', kind: 'friend', suspicion: 0, partnerUid: 'player-2' },
  });
  mock.secrets.set('player-2', {
    visibleToUids: ['player-2'],
    payload: { type: 'loyalty', kind: 'friend', suspicion: 0, partnerUid: 'player-1', partnerRoleId: 'admiral' },
  });
  mock.eligibility = { eligible: true, reason: 'dead', revision: 1 };

  await expect(assignReplacementRole.run(request({
    sessionId: 's1', instanceId: 'bridge', requestId: 'replacement-malformed-friend',
    targetUid: 'player-1', replacementRoleId: 'wolf-commander', expectedRevision: 1,
    expectedSetupRevision: 4,
  }))).resolves.toMatchObject({ status: 'committed' });

  expect(mock.update).not.toHaveBeenCalledWith(
    expect.objectContaining({ path: 'sessions/s1/secrets/loyalty-player-2' }),
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

it('enriches a committed baseline-format receipt during a retry after rollout', async () => {
  const payload = {
    sessionId: 's1', instanceId: 'bridge', requestId: 'legacy-eligibility-replay',
    targetUid: 'player-1', reason: 'dead', expectedRevision: 0, expectedSetupRevision: 4,
  };
  mock.receipts.set('sessions/s1/commandReceipts/legacy-eligibility-replay', {
    fingerprint: {
      action: 'set-replacement-eligibility', sessionId: 's1',
      requestId: 'legacy-eligibility-replay', actorUid: 'gm-1', instanceId: 'bridge',
      expectedRevision: 0,
      payload: { targetUid: 'player-1', reason: 'dead', expectedSetupRevision: 4 },
    },
    result: {
      status: 'committed', sessionId: 's1', targetUid: 'player-1',
      revision: 1, setupRevision: 5,
    },
    createdAt: { toDate: () => new Date('2026-09-19T23:59:00.000Z') },
  });

  await expect(setReplacementEligibility.run(request(payload))).resolves.toEqual({
    status: 'committed', sessionId: 's1', targetUid: 'player-1',
    revision: 1, setupRevision: 5, actorUid: 'gm-1',
    recordedAt: '2026-09-19T23:59:00.000Z',
  });
  expect(mock.update).not.toHaveBeenCalled();
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

it('assigns an extra-ship replacement only after its server-owned docking state names an active core host', async () => {
  mock.session = {
    ...mock.session,
    activeVesselIds: ['aegis'],
    smallShipStates: {
      gorgoneion: {
        id: 'gorgoneion', hostShipId: 'aegis', dockingRevision: 1,
        population: 1_000, unrest: 0,
        cycle: { step: 0, revision: 0, results: {}, charges: [] },
      },
    },
  };
  mock.eligibility = { eligible: true, reason: 'dead', revision: 1 };

  await expect(assignReplacementRole.run(request({
    sessionId: 's1', instanceId: 'bridge', requestId: 'replacement-valid-vessel',
    targetUid: 'player-1', replacementRoleId: 'gorgoneion-captain', expectedRevision: 1,
    expectedSetupRevision: 4,
  }))).resolves.toMatchObject({ status: 'committed', replacementRoleId: 'gorgoneion-captain' });
  expect(mock.update).toHaveBeenCalledWith(
    expect.objectContaining({ path: 'sessions/s1/players/player-1' }),
    { replacementRoleId: 'gorgoneion-captain', replacementStatus: null,
      activeConsoleRoleId: null, seatId: null },
  );
  expect(mock.set).toHaveBeenCalledWith(
    expect.objectContaining({ path: 'sessions/s1/roleBriefs/player-1' }),
    expect.objectContaining({ roleId: 'gorgoneion-captain', visibleToUids: ['player-1'] }),
  );
  expect(mock.session.activeVesselIds).toEqual(['aegis']);
});

it.each([
  ['never docked', { id: 'gorgoneion', hostShipId: 'aegis', dockingRevision: 0 }],
  ['undocked', { id: 'gorgoneion', hostShipId: null, dockingRevision: 2 }],
  ['malformed revision', { id: 'gorgoneion', hostShipId: 'aegis', dockingRevision: '1' }],
  ['inactive host', { id: 'gorgoneion', hostShipId: 'dione', dockingRevision: 1 }],
  ['unknown host', { id: 'gorgoneion', hostShipId: 'unknown-ship', dockingRevision: 1 }],
] as const)('rejects extra-ship assignment with %s state', async (_label, partialState) => {
  mock.session = {
    ...mock.session,
    activeVesselIds: ['aegis'],
    smallShipStates: {
      gorgoneion: {
        ...partialState, population: 1_000, unrest: 0,
        cycle: { step: 0, revision: 0, results: {}, charges: [] },
      },
    },
  };
  mock.eligibility = { eligible: true, reason: 'late', revision: 1 };
  await expect(assignReplacementRole.run(request({
    sessionId: 's1', instanceId: 'bridge', requestId: `replacement-${_label.replaceAll(' ', '-')}`,
    targetUid: 'player-1', replacementRoleId: 'gorgoneion-captain', expectedRevision: 1,
    expectedSetupRevision: 4,
  }))).rejects.toMatchObject({ code: 'failed-precondition' });
  expect(mock.update).not.toHaveBeenCalledWith(
    expect.objectContaining({ path: 'sessions/s1/players/player-1' }), expect.anything(),
  );
});
