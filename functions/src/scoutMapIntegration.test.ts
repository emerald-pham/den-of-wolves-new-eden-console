import { beforeEach, expect, it, vi } from 'vitest';
import type { CallableRequest } from 'firebase-functions/v2/https';

type Fields = Record<string, unknown>;

const mock = vi.hoisted(() => {
  const documents = new Map<string, Fields>();
  const ref = (path: string, collection = false) => ({ path, id: path.split('/').at(-1) ?? '', collection });
  const snapshot = (target: { path: string; id: string; collection?: boolean }) => {
    if (target.collection) {
      const prefix = `${target.path}/`;
      return { docs: [...documents.keys()].flatMap((path) => {
        const remainder = path.startsWith(prefix) ? path.slice(prefix.length) : '';
        return remainder && !remainder.includes('/') ? [snapshot(ref(path))] : [];
      }) };
    }
    const fields = documents.get(target.path);
    return {
      id: target.id, ref: target, exists: fields !== undefined,
      get: (key: string) => fields?.[key], data: () => fields,
    };
  };
  const get = vi.fn(async (target: { path: string; id: string; collection?: boolean }) => snapshot(target));
  const create = vi.fn((target: { path: string }, fields: Fields) => {
    if (documents.has(target.path)) throw new Error('already exists');
    documents.set(target.path, { ...fields });
  });
  const set = vi.fn((target: { path: string }, fields: Fields, options?: { merge?: boolean; mergeFields?: string[] }) => {
    documents.set(target.path, options?.merge || options?.mergeFields
      ? { ...documents.get(target.path), ...fields }
      : { ...fields });
  });
  const db = {
    doc: (path: string) => ref(path),
    collection: (path: string) => ref(path, true),
    runTransaction: vi.fn(async (callback: (tx: unknown) => unknown) => callback({ get, create, set })),
  };
  return { documents, get, create, set, db };
});

vi.mock('firebase-admin/app', () => ({ initializeApp: vi.fn() }));
vi.mock('firebase-admin/firestore', () => ({
  getFirestore: () => mock.db,
  FieldValue: { serverTimestamp: () => 'server-time' },
  Timestamp: class MockTimestamp {
    constructor(private readonly date: Date) {}
    toMillis() { return this.date.getTime(); }
    toDate() { return this.date; }
    static now() { return new MockTimestamp(new Date()); }
  },
}));
vi.mock('firebase-functions/v2', () => ({ setGlobalOptions: vi.fn() }));
vi.mock('firebase-functions/v2/https', () => ({
  HttpsError: class HttpsError extends Error {
    constructor(readonly code: string, message: string) { super(message); }
  },
  onCall: (first: unknown, second?: (request: unknown) => unknown) => ({
    run: typeof first === 'function' ? first : second,
  }),
}));
vi.mock('firebase-functions/v2/scheduler', () => ({
  onSchedule: (_schedule: string, handler: (event: unknown) => unknown) => ({ run: handler }),
}));

import { resolvePendingScoutRequest } from './index';

const now = Date.parse('2026-09-27T21:40:00.000Z');
const scan = { sourceId: 'endeavour', attempt: 1, range: 'unlimited', targetCoordinate: '0408' };
const command = { sessionId: 's1', requestId: 'scan-1', instanceId: 'gm-browser' };

function put(path: string, fields: Fields): void { mock.documents.set(path, { ...fields }); }
function gmRequest() {
  return { data: command, auth: { uid: 'gm-1' } } as CallableRequest<typeof command>;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(now);
  mock.documents.clear();
  mock.get.mockClear(); mock.create.mockClear(); mock.set.mockClear();
  put('sessions/s1', {
    phase: 'active', currentTurn: 4, chartId: 'A', chartSelectionLocked: true,
    activeRoleIds: ['wing-commander', 'shepherd-scientist'],
    activeVesselIds: ['aegis', 'shepherd'],
  });
  put('sessions/s1/players/gm-1', {
    role: 'gm', connected: true, lastSeenAt: now - 1_000,
  });
  put('sessions/s1/gmInstances/gm-browser', {
    uid: 'gm-1', connected: true, lastSeenAt: now - 1_000,
  });
  put('sessions/s1/players/scientist-1', {
    role: 'player', connected: true, lastSeenAt: now - 1_000,
    assignedRoleId: 'shepherd-scientist', seatId: 'shepherd-scientist', fleetGroupId: 'fleet-1',
  });
  put('sessions/s1/players/wing-1', {
    role: 'player', connected: true, lastSeenAt: now - 1_000,
    assignedRoleId: 'wing-commander', seatId: 'wing-commander', fleetGroupId: 'fleet-1',
  });
  put('sessions/s1/fleetGroups/fleet-1', {
    id: 'fleet-1', vesselIds: ['aegis', 'shepherd'], memberUids: ['scientist-1', 'wing-1'],
  });
  put('sessions/s1/serverState/navigation', {
    shipGalacticCoordinates: { aegis: '0000', shepherd: '0000' },
    shipNavigationLogs: { aegis: [], shepherd: [] },
    pursuitGroups: { 'fleet-1': 0 }, revision: 5,
    createdAt: 'original-navigation-creation',
  });
  put('sessions/s1/scoutRequests/scan-1', {
    type: 'scout-request', status: 'requested', resolution: 'pending',
    sessionId: 's1', requestId: 'scan-1', actorUid: 'scientist-1',
    entitlementId: 'endeavour', source: 'craft', ownerRoleId: 'shepherd-scientist',
    anchorShipId: 'shepherd', receivingShipId: 'aegis', cycle: 4,
    targetCoordinate: '0408', scan, createdAt: 'server-time',
  });
  put('sessions/s1/scoutCadence/4-endeavour', {
    sessionId: 's1', entitlementId: 'endeavour', cycle: 4,
    scans: [{ requestId: 'scan-1', actorUid: 'scientist-1', scan }],
  });
});

it('resolves one private fact and publishes its coordinate only to the request-time receiving ship', async () => {
  await expect(resolvePendingScoutRequest.run(gmRequest())).resolves.toMatchObject({ status: 'resolved' });
  const navigation = mock.documents.get('sessions/s1/serverState/navigation')!;
  const wing = mock.documents.get('sessions/s1/playerDiscoveries/wing-1')!;
  const scientist = mock.documents.get('sessions/s1/playerDiscoveries/scientist-1')!;
  expect(navigation.scoutedCoordinatesByShip).toEqual({ aegis: ['0408'] });
  expect(navigation.revision).toBe(6);
  expect(navigation.createdAt).toBe('original-navigation-creation');
  expect(wing.knownCoordinates).toContain('0408');
  expect(scientist.knownCoordinates).not.toContain('0408');
  expect(scientist.shipId).toBe('shepherd');
  expect(JSON.stringify(wing)).not.toMatch(/Deep Nebula|accruedBonus/);
  const notePath = [...mock.documents.keys()].find((path) => path.includes('/playerDiscoveryNotes/'));
  expect(notePath).toBeDefined();
  expect(mock.documents.get(notePath!)).toMatchObject({ shipId: 'shepherd' });

  await expect(resolvePendingScoutRequest.run(gmRequest())).resolves.toMatchObject({ status: 'replayed' });
  expect(mock.documents.get('sessions/s1/serverState/navigation')?.revision).toBe(6);
});

it('fails without a map or result write when protected navigation is malformed', async () => {
  mock.documents.get('sessions/s1/serverState/navigation')!.shipGalacticCoordinates = {
    aegis: '0000', shepherd: 'not-printed',
  };
  await expect(resolvePendingScoutRequest.run(gmRequest())).rejects.toMatchObject({ code: 'failed-precondition' });
  expect(mock.documents.has('sessions/s1/scoutResults/scan-1')).toBe(false);
  expect(mock.documents.has('sessions/s1/deepNebulaScans/scan-1')).toBe(false);
  expect(mock.documents.has('sessions/s1/playerDiscoveries/wing-1')).toBe(false);
});
