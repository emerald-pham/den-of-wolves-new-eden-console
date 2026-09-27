import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CallableRequest } from 'firebase-functions/v2/https';

type Fields = Record<string, unknown>;
const mock = vi.hoisted(() => {
  const documents = new Map<string, Fields>();
  const doc = (path: string) => ({ path, id: path.split('/').at(-1) ?? '' });
  const collection = (path: string) => ({ path, kind: 'collection' as const });
  const snapshot = (path: string) => {
    const fields = documents.get(path);
    return {
      exists: fields !== undefined,
      id: path.split('/').at(-1) ?? '',
      ref: doc(path),
      get: (field: string) => fields?.[field],
      data: () => fields,
    };
  };
  const get = vi.fn(async (target: { path: string; kind?: string }) => {
    if (target.kind === 'collection') {
      const prefix = `${target.path}/`;
      const docs = [...documents.keys()]
        .filter((path) => path.startsWith(prefix) && !path.slice(prefix.length).includes('/'))
        .map(snapshot);
      return { docs, size: docs.length, empty: docs.length === 0 };
    }
    return snapshot(target.path);
  });
  const set = vi.fn((target: { path: string }, fields: Fields) =>
    documents.set(target.path, { ...(documents.get(target.path) ?? {}), ...fields }));
  const create = vi.fn((target: { path: string }, fields: Fields) => {
    if (documents.has(target.path)) throw new Error('already exists');
    documents.set(target.path, { ...fields });
  });
  const update = vi.fn((target: { path: string }, fields: Fields) => {
    documents.set(target.path, { ...(documents.get(target.path) ?? {}), ...fields });
  });
  const runTransaction = vi.fn(async (callback: (tx: unknown) => unknown) =>
    callback({ get, set, create, update }));
  return {
    documents, get, set, create, update,
    db: { doc, collection, runTransaction },
  };
});

vi.mock('firebase-admin/app', () => ({ initializeApp: vi.fn() }));
vi.mock('firebase-admin/firestore', () => ({
  getFirestore: () => mock.db,
  FieldValue: { serverTimestamp: () => 'server-time' },
  Timestamp: class MockTimestamp {},
}));
vi.mock('firebase-functions/v2/https', () => ({
  HttpsError: class HttpsError extends Error {
    constructor(readonly code: string, message: string, readonly details?: unknown) { super(message); }
  },
  onCall: (optionsOrHandler: unknown, maybeHandler?: (request: unknown) => unknown) => ({
    run: maybeHandler ?? optionsOrHandler,
  }),
}));

import {
  activateEndeavourEcmDevice,
  readEndeavourEcmDeviceWorkspace,
} from './endeavourEcmDeviceWriter';

const command = {
  sessionId: 's1', requestId: 'ecm-use-1', expectedControlRevision: 4,
  expectedDeviceRevision: 0, expectedCycle: 3,
};
const request = (data: Fields, uid = 'scientist') =>
  ({ data, auth: { uid } }) as CallableRequest<Fields>;
const put = (path: string, fields: Fields) => mock.documents.set(path, { ...fields });

function seedSession(): void {
  put('sessions/s1', {
    phase: 'active', currentTurn: 3, activeRoleIds: ['shepherd-scientist'],
    activeVesselIds: ['shepherd', 'aegis', 'dione'],
    shuttleControl: { endeavour: {
      shuttleId: 'endeavour', ownerRoleId: 'shepherd-scientist',
      ownerUid: 'scientist', holderUid: 'scientist', revision: 4,
    } },
  });
  put('sessions/s1/players/scientist', {
    role: 'player', connected: true, assignedRoleId: 'shepherd-scientist',
    fleetGroupId: 'fleet-1',
  });
  put('sessions/s1/fleetGroups/fleet-1', {
    id: 'fleet-1', vesselIds: ['shepherd', 'aegis'], memberUids: ['scientist'],
  });
  put('sessions/s1/fleetGroups/fleet-2', {
    id: 'fleet-2', vesselIds: ['dione'], memberUids: ['captain'],
  });
  put('sessions/s1/serverState/endeavourResearch', { 'ecm-device': 5 });
  put('sessions/s1/serverState/navigation', {
    shipGalacticCoordinates: { shepherd: '0000', aegis: '0000', dione: '5143' },
    shipNavigationLogs: { shepherd: [], aegis: [], dione: [] },
    pursuitGroups: { 'fleet-1': 8, 'fleet-2': 9 },
  });
}

beforeEach(() => {
  mock.documents.clear();
  mock.get.mockClear();
  mock.set.mockClear();
  mock.create.mockClear();
  mock.update.mockClear();
  mock.db.runTransaction.mockClear();
  seedSession();
});

describe('Endeavour ECM Device writer', () => {
  it('returns only the Shepherd group pursuit and the current private device status', async () => {
    await expect(readEndeavourEcmDeviceWorkspace.run(request({ sessionId: 's1' }))).resolves.toEqual({
      status: 'ready', sessionId: 's1', cycle: 3, controlRevision: 4,
      researchComplete: true,
      device: { status: 'ready', revision: 0 },
      pursuit: { groupId: 'fleet-1', current: 8 },
    });
  });

  it('does not disclose private device status to a non-Scientist or a member outside the Shepherd group', async () => {
    await expect(readEndeavourEcmDeviceWorkspace.run(request({ sessionId: 's1' }, 'intruder')))
      .rejects.toBeInstanceOf(Error);

    put('sessions/s1/players/scientist', {
      ...mock.documents.get('sessions/s1/players/scientist'),
      assignedRoleId: 'admiral',
    });
    await expect(readEndeavourEcmDeviceWorkspace.run(request({ sessionId: 's1' })))
      .rejects.toBeInstanceOf(Error);

    put('sessions/s1/players/scientist', {
      ...mock.documents.get('sessions/s1/players/scientist'),
      assignedRoleId: 'shepherd-scientist', fleetGroupId: 'fleet-2',
    });
    await expect(readEndeavourEcmDeviceWorkspace.run(request({ sessionId: 's1' })))
      .rejects.toBeInstanceOf(Error);
  });

  it('commits one durable group event, a replay receipt, and only the owning-group pursuit change', async () => {
    await expect(activateEndeavourEcmDevice.run(request(command))).resolves.toEqual({
      status: 'committed', sessionId: 's1', requestId: 'ecm-use-1', cycle: 3,
      deviceRevision: 1, ownerGroupId: 'fleet-1', pursuitBefore: 8, pursuitAfter: 5,
    });

    expect(mock.documents.get('sessions/s1/serverState/navigation')?.pursuitGroups)
      .toEqual({ 'fleet-1': 5, 'fleet-2': 9 });
    expect(mock.documents.get('sessions/s1/serverState/endeavourEcmDevice')).toEqual({
      status: 'used', revision: 1, ownerGroupId: 'fleet-1', pursuitBefore: 8, pursuitAfter: 5,
    });
    expect(mock.documents.get('sessions/s1/fleetGroupEvents/fleet-1/events/endeavour-ecm-ecm-use-1'))
      .toMatchObject({
        type: 'endeavour-ecm-device-used', groupId: 'fleet-1',
        pursuitBefore: 8, pursuitAfter: 5,
      });
    expect(mock.documents.get('sessions/s1/commandReceipts/ecm-use-1'))
      .toMatchObject({ fingerprint: { action: 'endeavour-ecm-device', actorUid: 'scientist' } });
    expect(mock.documents.get('sessions/s1')).not.toHaveProperty('pursuitGroups');
  });

  it('replays the same actor and command without reducing pursuit or writing another event', async () => {
    await activateEndeavourEcmDevice.run(request(command));
    const writesBeforeReplay = mock.set.mock.calls.length + mock.create.mock.calls.length + mock.update.mock.calls.length;

    await expect(activateEndeavourEcmDevice.run(request(command))).resolves.toMatchObject({ status: 'replayed' });

    expect(mock.documents.get('sessions/s1/serverState/navigation')?.pursuitGroups)
      .toEqual({ 'fleet-1': 5, 'fleet-2': 9 });
    expect(mock.set.mock.calls.length + mock.create.mock.calls.length + mock.update.mock.calls.length)
      .toBe(writesBeforeReplay);
    expect([...mock.documents.keys()].filter((path) => path.includes('/fleetGroupEvents/'))).toHaveLength(1);
  });

  it.each([
    ['incomplete research', (fields: Fields) => put('sessions/s1/serverState/endeavourResearch', { 'ecm-device': 4 })],
    ['a different actor', (_fields: Fields) => undefined, 'intruder'],
    ['a changed control revision', (_fields: Fields) => put('sessions/s1', {
      ...mock.documents.get('sessions/s1'),
      shuttleControl: { endeavour: { ownerRoleId: 'shepherd-scientist', holderUid: 'scientist', revision: 5 } },
    })],
    ['ambiguous Shepherd fleet ownership', (_fields: Fields) => put('sessions/s1/fleetGroups/fleet-2', {
      id: 'fleet-2', vesselIds: ['shepherd', 'dione'], memberUids: ['captain'],
    })],
    ['missing pursuit authority', (_fields: Fields) => put('sessions/s1/serverState/navigation', {
      shipGalacticCoordinates: {}, shipNavigationLogs: {}, pursuitGroups: { 'fleet-2': 9 },
    })],
  ])('rejects %s without mutation', async (_label, mutate, actor) => {
    mutate({});
    await expect(activateEndeavourEcmDevice.run(request(command, actor))).rejects.toBeInstanceOf(Error);
    expect(mock.documents.get('sessions/s1/serverState/navigation')?.pursuitGroups)
      .not.toEqual({ 'fleet-1': 5, 'fleet-2': 9 });
    expect(mock.documents.has('sessions/s1/commandReceipts/ecm-use-1')).toBe(false);
  });

  it('rejects a second device use and a reused request id with a different payload', async () => {
    await activateEndeavourEcmDevice.run(request(command));
    await expect(activateEndeavourEcmDevice.run(request({
      ...command, requestId: 'ecm-use-2', expectedDeviceRevision: 1,
    }))).rejects.toBeInstanceOf(Error);
    await expect(activateEndeavourEcmDevice.run(request({
      ...command, expectedCycle: 4,
    }))).rejects.toBeInstanceOf(Error);
  });
});
