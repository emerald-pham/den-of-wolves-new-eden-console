import { beforeEach, describe, expect, it, vi } from 'vitest';

type Fields = Record<string, unknown>;
const mock = vi.hoisted(() => {
  const documents = new Map<string, Fields>();
  const snapshot = (path: string) => {
    const data = documents.get(path);
    return { id: path.split('/').at(-1), exists: data !== undefined,
      get: (key: string) => data?.[key], data: () => data };
  };
  const get = vi.fn(async (target: { path: string; collection?: boolean }) => {
    if (!target.collection) return snapshot(target.path);
    const prefix = `${target.path}/`;
    return { docs: [...documents.keys()].filter(path => path.startsWith(prefix) &&
      !path.slice(prefix.length).includes('/')).map(snapshot) };
  });
  const create = vi.fn((target: { path: string }, value: Fields) => {
    if (documents.has(target.path)) throw new Error('already exists');
    documents.set(target.path, value);
  });
  const db = { doc: (path: string) => ({ path }),
    collection: (path: string) => ({ path, collection: true }),
    runTransaction: vi.fn(async (fn: (tx: unknown) => unknown) => fn({ get, create })) };
  return { documents, get, create, db };
});
vi.mock('firebase-admin/firestore', () => ({ getFirestore: () => mock.db }));
vi.mock('firebase-functions/v2/https', () => ({
  HttpsError: class HttpsError extends Error {
    constructor(readonly code: string, message: string) { super(message); }
  },
  onCall: (_options: unknown, handler: (request: unknown) => unknown) => ({ run: handler }),
}));
vi.mock('firebase-functions/v2/firestore', () => ({
  onDocumentWritten: (options: unknown, handler: (event: unknown) => unknown) => ({ options, run: handler }),
}));

import { createAutomaticScoutResolver } from './scoutAutomaticResolution';
import { createResolvePendingScoutRequest, readPrivateScoutResult } from './scoutResultCallable';

const commitMap = vi.fn(async () => undefined);
const resolver = createAutomaticScoutResolver(commitMap);
const manual = createResolvePendingScoutRequest(commitMap);
const now = Date.parse('2026-10-03T06:00:00.000Z');
const scan = { sourceId: 'comms-officer', attempt: 1, range: 1,
  originCoordinate: '0408', targetCoordinate: '0408' };
const pending = {
  type: 'scout-request', status: 'requested', resolution: 'pending',
  sessionId: 'session-1', requestId: 'scan-1', actorUid: 'comms-1',
  entitlementId: 'comms-officer', source: 'role', ownerRoleId: 'comms-officer',
  anchorShipId: 'aegis', receivingShipId: 'aegis', cycle: 1,
  targetCoordinate: '0408', scan, createdAt: 'server-time',
};
const event = () => ({ params: { sessionId: 'session-1', requestId: 'scan-1' },
  data: { before: { exists: false }, after: { exists: true } } });
const put = (path: string, value: Fields) => mock.documents.set(path, value);
const receipt = () => ({ fingerprint: {
  action: 'request-scout', sessionId: 'session-1', requestId: 'scan-1', actorUid: 'comms-1',
  instanceId: null, expectedRevision: null,
  payload: { entitlementId: 'comms-officer', targetCoordinate: '0408', cycle: 1 },
}, result: { status: 'requested', resolution: 'pending', requestId: 'scan-1',
  sessionId: 'session-1', cycle: 1, entitlementId: 'comms-officer', source: 'role',
  ownerRoleId: 'comms-officer', anchorShipId: 'aegis', receivingShipId: 'aegis',
  targetCoordinate: '0408' } });

beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(now);
  mock.documents.clear(); vi.clearAllMocks();
  put('sessions/session-1', { phase: 'active', currentTurn: 1, chartId: 'A',
    chartSelectionLocked: true, activeVesselIds: ['aegis'] });
  put('sessions/session-1/players/comms-1', { role: 'player', connected: true,
    replacementRoleId: 'comms-officer', lastSeenAt: now - 1_000 });
  put('sessions/session-1/players/other', { role: 'player', connected: true,
    lastSeenAt: now - 1_000 });
  put('sessions/session-1/fleetGroups/fleet-1', { id: 'fleet-1', vesselIds: ['aegis'] });
  put('sessions/session-1/scoutRequests/scan-1', pending);
  put('sessions/session-1/scoutCadence/1-comms-officer', { sessionId: 'session-1',
    entitlementId: 'comms-officer', cycle: 1,
    scans: [{ requestId: 'scan-1', actorUid: 'comms-1', scan }] });
  put('sessions/session-1/commandReceipts/scan-1', receipt());
});

describe('automatic committed scouting', () => {
  it('resolves the current Comms player choice without any GM identity or extra input', async () => {
    expect(resolver.options).toMatchObject({ document: 'sessions/{sessionId}/scoutRequests/{requestId}', retry: true });
    await resolver.run(event());
    expect(mock.documents.get('sessions/session-1/scoutResults/scan-1')).toMatchObject({
      requesterUid: 'comms-1', systemFact: { coordinate: '0408', code: 'O' } });
    expect(mock.documents.get('sessions/session-1/scoutResolutionAudits/scan-1')).toMatchObject({
      facilitatorUid: null, resolutionMode: 'automatic', requesterUid: 'comms-1' });
    expect(mock.documents.get('sessions/session-1/scoutRequests/scan-1')).toEqual(pending);
    expect(mock.create).toHaveBeenCalledTimes(4);
    expect(commitMap).toHaveBeenCalledTimes(1);
  });

  it('deduplicates a retried event and preserves the first timestamp and map publication', async () => {
    await resolver.run(event());
    const audit = mock.documents.get('sessions/session-1/scoutResolutionAudits/scan-1');
    vi.advanceTimersByTime(10_000);
    await resolver.run(event());
    expect(mock.documents.get('sessions/session-1/scoutResolutionAudits/scan-1')).toEqual(audit);
    expect(mock.create).toHaveBeenCalledTimes(4);
    expect(commitMap).toHaveBeenCalledTimes(1);
  });

  it('delivers the committed fact only to its requester while a disconnected requester can recover later', async () => {
    put('sessions/session-1/players/comms-1', { role: 'player', connected: false });
    await resolver.run(event());
    await expect(readPrivateScoutResult.run({ data: { sessionId: 'session-1', requestId: 'scan-1' },
      auth: { uid: 'other' } } as never)).rejects.toMatchObject({ code: 'permission-denied' });
    put('sessions/session-1/players/comms-1', { role: 'player', connected: true, lastSeenAt: now });
    await expect(readPrivateScoutResult.run({ data: { sessionId: 'session-1', requestId: 'scan-1' },
      auth: { uid: 'comms-1' } } as never)).resolves.toMatchObject({ systemFact: { code: 'O' } });
  });

  it('lets the protected GM recovery path replay an automatic result without overwriting its authority', async () => {
    await resolver.run(event());
    put('sessions/session-1/players/gm-1', { role: 'gm', connected: true, lastSeenAt: now });
    put('sessions/session-1/gmInstances/gm-browser', { uid: 'gm-1', connected: true, lastSeenAt: now });
    await expect(manual.run({ auth: { uid: 'gm-1' }, data: {
      sessionId: 'session-1', requestId: 'scan-1', instanceId: 'gm-browser' } } as never))
      .resolves.toMatchObject({ status: 'replayed' });
    expect(mock.documents.get('sessions/session-1/scoutResolutionAudits/scan-1')).toMatchObject({
      facilitatorUid: null, resolutionMode: 'automatic' });
    expect(commitMap).toHaveBeenCalledTimes(1);
  });

  it.each(['missing receipt', 'receipt actor', 'receipt target', 'cadence actor', 'forged target', 'unlocked chart'])
    ('fails closed before publication for %s', async fault => {
      if (fault === 'missing receipt') mock.documents.delete('sessions/session-1/commandReceipts/scan-1');
      if (fault === 'receipt actor' || fault === 'receipt target') {
        const r = receipt();
        if (fault === 'receipt actor') r.fingerprint.actorUid = 'other';
        else r.fingerprint.payload.targetCoordinate = '5143';
        put('sessions/session-1/commandReceipts/scan-1', r);
      }
      if (fault === 'cadence actor') put('sessions/session-1/scoutCadence/1-comms-officer', {
        sessionId: 'session-1', entitlementId: 'comms-officer', cycle: 1,
        scans: [{ requestId: 'scan-1', actorUid: 'other', scan }] });
      if (fault === 'forged target') put('sessions/session-1/scoutRequests/scan-1', { ...pending, targetCoordinate: '5143' });
      if (fault === 'unlocked chart') put('sessions/session-1', {
        ...mock.documents.get('sessions/session-1'), chartSelectionLocked: false });
      await expect(resolver.run(event())).rejects.toThrow();
      expect(commitMap).not.toHaveBeenCalled(); expect(mock.create).not.toHaveBeenCalled();
    });

  it('does not process deletion, request mutation or a closed session', async () => {
    await resolver.run({ ...event(), data: { before: { exists: true }, after: { exists: false } } });
    await resolver.run({ ...event(), data: { before: { exists: true }, after: { exists: true } } });
    put('sessions/session-1', { ...mock.documents.get('sessions/session-1'), phase: 'ended' });
    await resolver.run(event());
    expect(commitMap).not.toHaveBeenCalled(); expect(mock.create).not.toHaveBeenCalled();
  });

  it('rejects a malformed stored automatic audit instead of manufacturing a replay', async () => {
    await resolver.run(event());
    put('sessions/session-1/scoutResolutionAudits/scan-1', {
      ...mock.documents.get('sessions/session-1/scoutResolutionAudits/scan-1'), facilitatorUid: 'other' });
    await expect(resolver.run(event())).rejects.toThrow();
    expect(mock.create).toHaveBeenCalledTimes(4); expect(commitMap).toHaveBeenCalledTimes(1);
  });
});
