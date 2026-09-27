import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CallableRequest } from 'firebase-functions/v2/https';

type Fields = Record<string, unknown>;
const mock = vi.hoisted(() => {
  const documents = new Map<string, Fields>();
  const ref = (path: string) => ({ path });
  const snapshot = (path: string) => {
    const data = documents.get(path);
    return { id: path.split('/').at(-1), exists: data !== undefined,
      get: (key: string) => data?.[key], data: () => data };
  };
  const collection = (path: string) => ({ path, collection: true });
  const get = vi.fn(async (target: { path: string; collection?: boolean }) => {
    if (!target.collection) return snapshot(target.path);
    const prefix = `${target.path}/`;
    return { docs: [...documents.keys()].filter((path) =>
      path.startsWith(prefix) && !path.slice(prefix.length).includes('/')).map(snapshot) };
  });
  const create = vi.fn((target: { path: string }, value: Fields) => {
    if (documents.has(target.path)) throw new Error('already exists');
    documents.set(target.path, value);
  });
  const db = { doc: ref, collection, runTransaction: vi.fn(async (fn: (tx: unknown) => unknown) =>
    fn({ get, create })) };
  return { documents, get, create, db };
});
vi.mock('firebase-admin/firestore', () => ({ getFirestore: () => mock.db }));
vi.mock('firebase-functions/v2/https', () => ({
  HttpsError: class HttpsError extends Error {
    constructor(readonly code: string, message: string) { super(message); }
  },
  onCall: (_options: unknown, handler: (request: unknown) => unknown) => ({ run: handler }),
}));

import {
  listPendingScoutRequests, readPrivateScoutResult, resolvePendingScoutRequest,
} from './scoutResultCallable';

const now = Date.parse('2026-09-27T21:40:00.000Z');
const scan = { sourceId: 'endeavour', attempt: 1, range: 'unlimited', targetCoordinate: '0408' };
const pendingRequest = {
  type: 'scout-request', status: 'requested', resolution: 'pending',
  sessionId: 'session-1', requestId: 'scan-1', actorUid: 'scientist-1',
  entitlementId: 'endeavour', source: 'craft', ownerRoleId: 'shepherd-scientist',
  anchorShipId: 'shepherd', cycle: 4, targetCoordinate: '0408', scan,
  createdAt: 'server-time',
};
const callableRequest = (data: Fields, uid: string) =>
  ({ data, auth: { uid } }) as CallableRequest<Fields>;
const put = (path: string, fields: Fields) => mock.documents.set(path, fields);

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(now);
  mock.documents.clear();
  mock.get.mockClear();
  mock.create.mockClear();
  mock.db.runTransaction.mockClear();
  put('sessions/session-1', {
    phase: 'active', currentTurn: 4, chartId: 'A', chartSelectionLocked: true,
    activeVesselIds: ['aegis', 'shepherd'],
  });
  put('sessions/session-1/players/gm-1', {
    role: 'gm', connected: true, lastSeenAt: now - 1_000,
  });
  put('sessions/session-1/gmInstances/gm-browser', {
    uid: 'gm-1', connected: true, lastSeenAt: now - 1_000,
  });
  put('sessions/session-1/players/scientist-1', {
    role: 'player', connected: true, lastSeenAt: now - 1_000,
    assignedRoleId: 'shepherd-scientist', seatId: 'shepherd-scientist',
  });
  put('sessions/session-1/players/other', {
    role: 'player', connected: true, lastSeenAt: now - 1_000,
    assignedRoleId: 'aegis-wing-commander',
  });
  put('sessions/session-1/fleetGroups/fleet-1', {
    id: 'fleet-1', vesselIds: ['aegis', 'shepherd'],
  });
  put('sessions/session-1/scoutRequests/scan-1', pendingRequest);
  put('sessions/session-1/scoutCadence/4-endeavour', {
    sessionId: 'session-1', entitlementId: 'endeavour', cycle: 4,
    scans: [{ requestId: 'scan-1', actorUid: 'scientist-1', scan }],
  });
});

describe('private scout result callables', () => {
  it('commits a single result, note, audit and hidden Nebula marker without editing the pending request', async () => {
    const data = { sessionId: 'session-1', requestId: 'scan-1', instanceId: 'gm-browser' };
    const reply = await resolvePendingScoutRequest.run(callableRequest(data, 'gm-1'));
    expect(reply).toMatchObject({ status: 'resolved', result: {
      requestId: 'scan-1', systemFact: { code: 'O', title: 'Deep Nebula' },
    } });
    expect(mock.documents.get('sessions/session-1/scoutRequests/scan-1')).toEqual(pendingRequest);
    expect(mock.documents.get('sessions/session-1/scoutResults/scan-1')).toEqual(reply.result);
    expect(mock.documents.get('sessions/session-1/scoutResolutionAudits/scan-1')).toMatchObject({
      requesterUid: 'scientist-1', facilitatorUid: 'gm-1', targetCoordinate: '0408',
    });
    expect(mock.documents.get('sessions/session-1/deepNebulaScans/scan-1')).toMatchObject({
      type: 'deep-nebula-scan', shipId: 'shepherd',
    });
    expect([...mock.documents.keys()].filter((path) => path.includes('/playerDiscoveryNotes/')))
      .toHaveLength(1);
    expect(JSON.stringify(reply)).not.toMatch(/accruedBonus|modifier|chartId/);
    expect(mock.create).toHaveBeenCalledTimes(4);
    expect(await resolvePendingScoutRequest.run(callableRequest(data, 'gm-1')))
      .toMatchObject({ status: 'replayed', result: reply.result });
    expect(mock.create).toHaveBeenCalledTimes(4);
  });

  it('denies wrong actor and stale GM lease before writing', async () => {
    const data = { sessionId: 'session-1', requestId: 'scan-1', instanceId: 'gm-browser' };
    await expect(resolvePendingScoutRequest.run(callableRequest(data, 'scientist-1')))
      .rejects.toMatchObject({ code: 'permission-denied' });
    put('sessions/session-1/gmInstances/gm-browser', {
      uid: 'gm-1', connected: true, lastSeenAt: 0,
    });
    await expect(resolvePendingScoutRequest.run(callableRequest(data, 'gm-1')))
      .rejects.toMatchObject({ code: 'permission-denied' });
    expect(mock.create).not.toHaveBeenCalled();
  });

  it('delivers one fact only to its requester or a live same-session GM', async () => {
    await resolvePendingScoutRequest.run(callableRequest({
      sessionId: 'session-1', requestId: 'scan-1', instanceId: 'gm-browser',
    }, 'gm-1'));
    const reader = { sessionId: 'session-1', requestId: 'scan-1' };
    await expect(readPrivateScoutResult.run(callableRequest(reader, 'scientist-1')))
      .resolves.toMatchObject({ systemFact: { code: 'O' } });
    await expect(readPrivateScoutResult.run(callableRequest(reader, 'other')))
      .rejects.toMatchObject({ code: 'permission-denied' });
    await expect(readPrivateScoutResult.run(callableRequest({
      ...reader, instanceId: 'gm-browser',
    }, 'gm-1'))).resolves.toMatchObject({ systemFact: { code: 'O' } });
    await expect(readPrivateScoutResult.run(callableRequest(reader, 'gm-1')))
      .rejects.toMatchObject({ code: 'permission-denied' });
  });

  it('lists only unresolved requests for an active GM and never includes chart facts', async () => {
    const list = await listPendingScoutRequests.run(callableRequest({
      sessionId: 'session-1', instanceId: 'gm-browser',
    }, 'gm-1'));
    expect(list).toEqual([{ requestId: 'scan-1', cycle: 4, entitlementId: 'endeavour',
      anchorShipId: 'shepherd', targetCoordinate: '0408' }]);
    await resolvePendingScoutRequest.run(callableRequest({
      sessionId: 'session-1', requestId: 'scan-1', instanceId: 'gm-browser',
    }, 'gm-1'));
    await expect(listPendingScoutRequests.run(callableRequest({
      sessionId: 'session-1', instanceId: 'gm-browser',
    }, 'gm-1'))).resolves.toEqual([]);
  });
});
