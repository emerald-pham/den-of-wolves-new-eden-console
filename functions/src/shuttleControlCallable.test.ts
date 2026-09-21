import { beforeEach, expect, it, vi } from 'vitest';
import type { CallableRequest } from 'firebase-functions/v2/https';

type Fields = Record<string, unknown>;

const mock = vi.hoisted(() => {
  const documents = new Map<string, Fields>();
  const ref = (path: string) => ({ path, id: path.split('/').at(-1) ?? '' });
  const snapshot = (path: string) => {
    const fields = documents.get(path);
    return {
      exists: fields !== undefined,
      id: path.split('/').at(-1) ?? '',
      ref: ref(path),
      get: (field: string) => fields?.[field],
      data: () => fields,
    };
  };
  const get = vi.fn(async (target: { path: string }) => {
    if (target.path === 'sessions/s1/players') {
      return {
        docs: [...documents.keys()]
          .filter((path) => /^sessions\/s1\/players\/[^/]+$/.test(path))
          .map(snapshot),
      };
    }
    return snapshot(target.path);
  });
  const set = vi.fn((target: { path: string }, fields: Fields) => {
    documents.set(target.path, { ...fields });
  });
  const update = vi.fn((target: { path: string }, fields: Fields) => {
    const current = { ...(documents.get(target.path) ?? {}) };
    for (const [key, value] of Object.entries(fields)) {
      if (key.startsWith('shuttleControl.')) {
        const shuttleId = key.slice('shuttleControl.'.length);
        current.shuttleControl = {
          ...((current.shuttleControl as Fields | undefined) ?? {}),
          [shuttleId]: value,
        };
      } else current[key] = value;
    }
    documents.set(target.path, current);
  });
  const remove = vi.fn((target: { path: string }) => documents.delete(target.path));
  const runTransaction = vi.fn(async (callback: (tx: unknown) => unknown) =>
    callback({ get, set, update, delete: remove }));
  return {
    documents, get, set, update, remove, runTransaction,
    db: { doc: ref, collection: ref, runTransaction },
  };
});

vi.mock('firebase-admin/app', () => ({ initializeApp: vi.fn() }));
vi.mock('firebase-admin/firestore', () => ({
  getFirestore: () => mock.db,
  FieldValue: { serverTimestamp: () => 'server-time', delete: () => 'delete-field' },
  Timestamp: class MockTimestamp {
    constructor(private readonly value: Date) {}
    static now() { return new MockTimestamp(new Date()); }
    toDate() { return this.value; }
    toMillis() { return this.value.getTime(); }
  },
}));
vi.mock('firebase-functions/v2', () => ({ setGlobalOptions: vi.fn() }));
vi.mock('firebase-functions/v2/https', () => ({
  HttpsError: class HttpsError extends Error {
    constructor(readonly code: string, message: string) { super(message); }
  },
  onCall: (handler: (request: unknown) => unknown) => ({ run: handler }),
}));
vi.mock('firebase-functions/v2/scheduler', () => ({
  onSchedule: (_schedule: string, handler: (event: unknown) => unknown) => ({ run: handler }),
}));

import { transferShuttleControlCommand } from './index';

function request(data: Fields, uid = 'wing') {
  return { data, auth: { uid } } as CallableRequest<Fields>;
}

function put(path: string, fields: Fields): void {
  mock.documents.set(path, { ...fields });
}

const command = {
  sessionId: 's1',
  requestId: 'handoff-1',
  shuttleId: 'starlight',
  action: 'handoff',
  targetUid: 'crew',
  expectedRevision: 0,
};

beforeEach(() => {
  mock.documents.clear();
  mock.get.mockClear();
  mock.set.mockClear();
  mock.update.mockClear();
  mock.remove.mockClear();
  mock.runTransaction.mockClear();
  put('sessions/s1', {
    phase: 'active',
    activeRoleIds: ['wing-commander', 'icebreaker-miner'],
    activeVesselIds: ['aegis', 'icebreaker'],
    shuttleDockings: [
      { shuttleId: 'snn-press-shuttle', shipId: 'aegis', dockedAt: 'SESSION START' },
      { shuttleId: 'starlight', shipId: 'aegis', dockedAt: 'SESSION START' },
      { shuttleId: 'highwall', shipId: 'icebreaker', dockedAt: 'SESSION START' },
    ],
    shuttleControl: {
      starlight: {
        shuttleId: 'starlight',
        ownerRoleId: 'wing-commander',
        ownerUid: 'wing',
        holderUid: 'wing',
        revision: 0,
      },
    },
  });
  put('sessions/s1/players/wing', {
    role: 'player', connected: true, assignedRoleId: 'wing-commander', fleetGroupId: 'fleet-1',
  });
  put('sessions/s1/players/crew', {
    role: 'player', connected: true, assignedRoleId: 'icebreaker-miner', fleetGroupId: 'fleet-1',
  });
  put('sessions/s1/players/other', {
    role: 'player', connected: true, assignedRoleId: null, fleetGroupId: 'fleet-2',
  });
  put('sessions/s1/players/gm', {
    role: 'gm', connected: true, assignedRoleId: null,
  });
  put('sessions/s1/gmInstances/bridge', {
    uid: 'gm', connected: true, claimedAt: { toDate: () => new Date() },
  });
});

it('commits one owner handoff, writes an audit, and replays without another mutation', async () => {
  put('sessions/s1/shuttleDepartures/starlight', {
    status: 'requested', shuttleId: 'starlight', requestId: 'departure-1',
  });
  const first = await transferShuttleControlCommand.run(request(command));
  expect(first).toEqual({
    status: 'committed',
    sessionId: 's1',
    requestId: 'handoff-1',
    action: 'handoff',
    shuttleId: 'starlight',
    previousHolderUid: 'wing',
    holderUid: 'crew',
    ownerUid: 'wing',
    revision: 1,
  });
  expect((mock.documents.get('sessions/s1')?.shuttleControl as Fields).starlight)
    .toMatchObject({ holderUid: 'crew', revision: 1 });
  expect(mock.documents.get('sessions/s1')?.shuttleDockings).toEqual(expect.arrayContaining([
    expect.objectContaining({ shuttleId: 'starlight', shipId: 'icebreaker' }),
  ]));
  expect(mock.documents.has('sessions/s1/shuttleDepartures/starlight')).toBe(false);
  expect(mock.documents.get('sessions/s1/shuttleControlAudit/handoff-1')).toMatchObject({
    actorUid: 'wing', actorRole: 'printed-owner',
    previousHolderUid: 'wing', holderUid: 'crew', previousRevision: 0, revision: 1,
    previousHostShipId: 'aegis', hostShipId: 'icebreaker',
  });
  const writes = mock.set.mock.calls.length + mock.update.mock.calls.length;
  const receipt = mock.documents.get('sessions/s1/shuttleControlRequests/handoff-1')!;
  const stored = receipt.fingerprint as Fields;
  const payload = stored.payload as Fields;
  receipt.fingerprint = {
    payload: {
      targetUid: payload.targetUid,
      command: payload.command,
      shuttleId: payload.shuttleId,
    },
    expectedRevision: stored.expectedRevision,
    instanceId: stored.instanceId,
    actorUid: stored.actorUid,
    requestId: stored.requestId,
    sessionId: stored.sessionId,
    action: stored.action,
  };
  mock.documents.get('sessions/s1')!.phase = 'debrief';
  mock.documents.get('sessions/s1/players/crew')!.connected = false;
  await expect(transferShuttleControlCommand.run(request(command))).resolves.toMatchObject({
    status: 'replayed', holderUid: 'crew', revision: 1,
  });
  expect(mock.set.mock.calls.length + mock.update.mock.calls.length).toBe(writes);
});

it('transfers a parked shuttle while another enabled shuttle is in transit', async () => {
  const session = mock.documents.get('sessions/s1')!;
  session.shuttleDockings = (session.shuttleDockings as Fields[])
    .filter((docking) => docking.shuttleId !== 'highwall');
  await expect(transferShuttleControlCommand.run(request(command))).resolves.toMatchObject({
    status: 'committed', shuttleId: 'starlight', holderUid: 'crew',
  });
  expect(mock.documents.get('sessions/s1')!.shuttleDockings).toEqual(expect.arrayContaining([
    expect.objectContaining({ shuttleId: 'starlight', shipId: 'icebreaker' }),
  ]));
});

it('does not transfer the in-transit shuttle itself without a unique docking', async () => {
  const session = mock.documents.get('sessions/s1')!;
  session.shuttleDockings = (session.shuttleDockings as Fields[])
    .filter((docking) => docking.shuttleId !== 'starlight');
  await expect(transferShuttleControlCommand.run(request(command))).rejects.toMatchObject({
    code: 'failed-precondition',
  });
  expect(mock.update).not.toHaveBeenCalled();
  expect(mock.set).not.toHaveBeenCalled();
});

it('does not synthesize a Union shuttle omitted by the authoritative starting manifest', async () => {
  const session = mock.documents.get('sessions/s1')!;
  session.activeRoleIds = ['joint-engineering-quellon-refinery'];
  session.activeVesselIds = ['aegis', 'quellon', 'refinery-124'];
  session.shuttleControl = {};
  session.shuttleDockings = [
    { shuttleId: 'snn-press-shuttle', shipId: 'aegis', dockedAt: 'SESSION START' },
  ];
  const owner = mock.documents.get('sessions/s1/players/wing')!;
  owner.assignedRoleId = 'joint-engineering-quellon-refinery';
  await expect(transferShuttleControlCommand.run(request({
    ...command, requestId: 'absent-union', shuttleId: 'wobbly',
  }))).rejects.toMatchObject({
    code: 'failed-precondition', message: 'Shuttle control is unavailable.',
  });
  expect(mock.update).not.toHaveBeenCalled();
  expect(mock.set).not.toHaveBeenCalled();
});

it.each([
  ['unknown host', { shuttleId: 'starlight', shipId: 'unknown', dockedAt: 'SESSION START' }],
  ['missing docking time', { shuttleId: 'starlight', shipId: 'aegis' }],
  ['in-transit state', {
    shuttleId: 'starlight', shipId: 'aegis', dockedAt: 'SESSION START', status: 'in-transit',
  }],
] as const)('does not synthesize control from a malformed %s row', async (_label, docking) => {
  const session = mock.documents.get('sessions/s1')!;
  session.activeRoleIds = ['wing-commander'];
  session.activeVesselIds = ['aegis'];
  session.shuttleControl = {};
  session.shuttleDockings = [
    { shuttleId: 'snn-press-shuttle', shipId: 'aegis', dockedAt: 'SESSION START' },
    docking,
  ];
  await expect(transferShuttleControlCommand.run(request({
    ...command, requestId: `malformed-${_label.replaceAll(' ', '-')}`,
  }))).rejects.toMatchObject({
    code: 'failed-precondition', message: 'The authoritative shuttle manifest is unavailable.',
  });
  expect(mock.update).not.toHaveBeenCalled();
  expect(mock.set).not.toHaveBeenCalled();
});

it('does not accept a corrupt active-vessel tuple as docking authority', async () => {
  const session = mock.documents.get('sessions/s1')!;
  session.activeRoleIds = ['wing-commander'];
  session.activeVesselIds = ['bogus'];
  session.shuttleControl = {};
  session.shuttleDockings = [
    { shuttleId: 'snn-press-shuttle', shipId: 'bogus', dockedAt: 'SESSION START' },
    { shuttleId: 'starlight', shipId: 'bogus', dockedAt: 'SESSION START' },
  ];
  await expect(transferShuttleControlCommand.run(request({
    ...command, requestId: 'corrupt-active-vessels',
  }))).rejects.toMatchObject({
    code: 'failed-precondition', message: 'The authoritative shuttle manifest is unavailable.',
  });
  expect(mock.update).not.toHaveBeenCalled();
  expect(mock.set).not.toHaveBeenCalled();
});

it('lets the printed owner reclaim and denies the recipient from forwarding', async () => {
  await transferShuttleControlCommand.run(request(command));
  await expect(transferShuttleControlCommand.run(request({
    ...command, requestId: 'recipient-forward', targetUid: 'other', expectedRevision: 1,
  }, 'crew'))).rejects.toMatchObject({ code: 'permission-denied' });
  await expect(transferShuttleControlCommand.run(request({
    sessionId: 's1', requestId: 'reclaim-1', shuttleId: 'starlight',
    action: 'reclaim', expectedRevision: 1,
  }))).resolves.toMatchObject({
    status: 'committed', holderUid: 'wing', revision: 2,
  });
  expect(mock.documents.get('sessions/s1')?.shuttleDockings).toEqual(expect.arrayContaining([
    expect.objectContaining({ shuttleId: 'starlight', shipId: 'aegis' }),
  ]));
});

it('rejects a handoff when the recipient has no unique active ship location', async () => {
  mock.documents.get('sessions/s1/players/crew')!.assignedRoleId = null;
  await expect(transferShuttleControlCommand.run(request({
    ...command, requestId: 'locationless',
  }))).rejects.toMatchObject({ code: 'failed-precondition', message: expect.stringMatching(/role location/i) });
  expect((mock.documents.get('sessions/s1')?.shuttleControl as Fields).starlight)
    .toMatchObject({ holderUid: 'wing', revision: 0 });
});

it('rejects stale, cross-group, disconnected, and conflicting request-id commands without mutation', async () => {
  await expect(transferShuttleControlCommand.run(request({
    ...command, requestId: 'stale', expectedRevision: 4,
  }))).rejects.toMatchObject({ code: 'failed-precondition' });
  await expect(transferShuttleControlCommand.run(request({
    ...command, requestId: 'cross-group', targetUid: 'other',
  }))).rejects.toMatchObject({ code: 'permission-denied' });
  mock.documents.get('sessions/s1/players/crew')!.connected = false;
  await expect(transferShuttleControlCommand.run(request({
    ...command, requestId: 'disconnected',
  }))).rejects.toMatchObject({ code: 'failed-precondition' });
  mock.documents.get('sessions/s1/players/crew')!.connected = true;
  await transferShuttleControlCommand.run(request(command));
  await expect(transferShuttleControlCommand.run(request({
    ...command, targetUid: 'other',
  }))).rejects.toMatchObject({ code: 'failed-precondition' });
});

it('fails closed when an ordinary owner has no server-owned fleet group', async () => {
  delete mock.documents.get('sessions/s1/players/wing')!.fleetGroupId;
  await expect(transferShuttleControlCommand.run(request({
    ...command, requestId: 'missing-group',
  }))).rejects.toMatchObject({ code: 'permission-denied' });
});

it('lets only a live facilitator instance adjudicate a handoff', async () => {
  await expect(transferShuttleControlCommand.run(request({
    ...command, requestId: 'gm-no-instance',
  }, 'gm'))).rejects.toMatchObject({ code: 'permission-denied' });
  await expect(transferShuttleControlCommand.run(request({
    ...command, requestId: 'gm-handoff', instanceId: 'bridge',
  }, 'gm'))).resolves.toMatchObject({
    status: 'committed', holderUid: 'crew', revision: 1,
  });
  expect(mock.documents.get('sessions/s1/shuttleControlAudit/gm-handoff')).toMatchObject({
    actorUid: 'gm', actorRole: 'facilitator',
  });
});

it('denies a facilitator handoff across the printed owner fleet group', async () => {
  await expect(transferShuttleControlCommand.run(request({
    ...command, requestId: 'gm-cross-group', instanceId: 'bridge', targetUid: 'other',
  }, 'gm'))).rejects.toMatchObject({ code: 'permission-denied' });
  expect(mock.update).not.toHaveBeenCalled();
  expect(mock.set).not.toHaveBeenCalled();
});

it('lets a live facilitator hand off for a disconnected owner and reclaim after that owner reconnects', async () => {
  mock.documents.get('sessions/s1/players/wing')!.connected = false;
  await expect(transferShuttleControlCommand.run(request({
    ...command, requestId: 'gm-owner-away', instanceId: 'bridge',
  }, 'gm'))).resolves.toMatchObject({
    status: 'committed', ownerUid: 'wing', holderUid: 'crew', revision: 1,
  });
  mock.documents.get('sessions/s1/players/wing')!.connected = true;
  await expect(transferShuttleControlCommand.run(request({
    sessionId: 's1', requestId: 'gm-owner-returned', instanceId: 'bridge',
    shuttleId: 'starlight', action: 'reclaim', expectedRevision: 1,
  }, 'gm'))).resolves.toMatchObject({
    status: 'committed', ownerUid: 'wing', holderUid: 'wing', revision: 2,
  });
});
