import { beforeEach, expect, it, vi } from 'vitest';
import type { CallableRequest } from 'firebase-functions/v2/https';

type Fields = Record<string, unknown>;
type MockReference = { path: string; id: string; kind: 'document' | 'collection' };

const entropy = vi.hoisted(() => ({
  randomInt: vi.fn(() => 6),
  randomUUID: vi.fn(() => 'fixture-uuid'),
}));
const mock = vi.hoisted(() => {
  const documents = new Map<string, Fields>();
  const ref = (path: string, kind: MockReference['kind'] = 'document'): MockReference => ({
    path, id: path.split('/').at(-1) ?? '', kind,
  });
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
  const collectionSnapshot = (path: string) => ({
    docs: [...documents.keys()].filter((key) => key.startsWith(`${path}/`) &&
      !key.slice(path.length + 1).includes('/')).map(snapshot),
  });
  const get = vi.fn(async (target: MockReference) => target.kind === 'collection'
    ? collectionSnapshot(target.path) : snapshot(target.path));
  const set = vi.fn((target: MockReference, value: Fields) => documents.set(target.path, { ...value }));
  const update = vi.fn((target: MockReference, patch: Fields) => {
    const current = { ...(documents.get(target.path) ?? {}) };
    for (const [key, value] of Object.entries(patch)) {
      const parts = key.split('.');
      let cursor = current;
      for (const part of parts.slice(0, -1)) {
        if (!cursor[part] || typeof cursor[part] !== 'object' || Array.isArray(cursor[part])) cursor[part] = {};
        cursor = cursor[part] as Fields;
      }
      cursor[parts.at(-1)!] = value;
    }
    documents.set(target.path, current);
  });
  const db = {
    doc: (path: string) => ref(path),
    collection: (path: string) => ref(path, 'collection'),
    runTransaction: vi.fn(async (callback: (tx: unknown) => unknown) => callback({ get, set, update })),
  };
  return { documents, get, set, update, db };
});

vi.mock('node:crypto', () => entropy);
vi.mock('firebase-admin/app', () => ({ initializeApp: vi.fn() }));
vi.mock('firebase-admin/firestore', () => ({
  getFirestore: () => mock.db,
  FieldValue: { serverTimestamp: () => 'server-time', delete: () => '__delete__' },
  Timestamp: class MockTimestamp {
    static now() { return { toMillis: () => Date.now() }; }
    toDate() { return new Date(); }
  },
}));
vi.mock('firebase-functions/v2', () => ({ setGlobalOptions: vi.fn() }));
vi.mock('firebase-functions/v2/https', () => ({
  HttpsError: class HttpsError extends Error { constructor(readonly code: string, message: string) { super(message); } },
  onCall: (handler: (request: unknown) => unknown) => ({ run: handler }),
}));
vi.mock('firebase-functions/v2/firestore', () => ({
  onDocumentWritten: (_path: string, handler: (event: unknown) => unknown) => ({ run: handler }),
}));
vi.mock('firebase-functions/v2/scheduler', () => ({
  onSchedule: (_schedule: string, handler: (event: unknown) => unknown) => ({ run: handler }),
}));

import { attestVipHostVisit, rerollHostedShipMaintenance } from './index';

const sessionId = 'vip-flow-session';
const instanceId = 'gm-1';
const visitRequest = {
  sessionId, instanceId, requestId: 'visit-1', expectedCycle: 4, shipId: 'aegis',
};
const rerollRequest = {
  sessionId, shipId: 'aegis', requestId: 'reroll-1', expectedCycle: 4,
  expectedGrantRevision: 1, expectedMaintenanceRevision: 1, dieIndex: 0, instanceId,
};

function request(data: Record<string, unknown>, uid = 'gm-uid') {
  return { data, auth: { uid } } as CallableRequest<Record<string, unknown>>;
}

function put(path: string, fields: Fields): void { mock.documents.set(path, { ...fields }); }

function provision(): void {
  mock.documents.clear();
  mock.get.mockClear();
  mock.set.mockClear();
  mock.update.mockClear();
  mock.db.runTransaction.mockClear();
  entropy.randomInt.mockReset();
  entropy.randomInt.mockReturnValue(6);
  const future = '2999-09-23T12:00:00.000Z';
  put(`sessions/${sessionId}`, {
    phase: 'active', currentTurn: 4, activeRoleIds: ['admiral'], activeVesselIds: ['dione', 'aegis'],
    turnPhase: { turn: 4, teamPhaseEndsAt: future, openAirspaceEndsAt: '2999-09-23T12:15:00.000Z',
      airspace: { state: 'restricted', tickerActive: true, pressAccess: false } },
    shipUnrest: { aegis: 3 },
    shipDamage: { aegis: { damagedSystemIds: [], destroyed: false } },
    maintenanceCycles: { aegis: {
      step: 4, revision: 1, turn: 4, results: { '3': 'Fixture unrest result' },
      charges: [], refuelled: [], unrestRolls: [1, 1], unrestBeforeCheck: 1, rationBonus: 0,
    } },
  });
  put(`sessions/${sessionId}/players/gm-uid`, { role: 'gm', connected: true });
  put(`sessions/${sessionId}/players/host-uid`, {
    role: 'player', connected: true, replacementRoleId: 'vip-host', replacementStatus: null,
    activeConsoleRoleId: null, assignedRoleId: 'admiral', displayName: 'Host',
  });
  put(`sessions/${sessionId}/gmInstances/${instanceId}`, {
    uid: 'gm-uid', connected: true, lastSeenAt: new Date(),
  });
  put(`sessions/${sessionId}/gmInstances/${instanceId}/private/shipConsoleWriteGrant`, {
    type: 'gm-ship-console-write-grant', sessionId, instanceId, uid: 'gm-uid', shipId: 'aegis',
  });
}

beforeEach(provision);

it('composes both VIP Host handlers with a clearly simulated GM physical-visit attestation', async () => {
  // This explicit test-only input exercises the GM attestation handler. It is
  // simulated and must never be treated as evidence of a real physical visit.
  const simulatedGMPhysicalVisit = {
    attested: true, testOnly: true, destinationShipId: 'aegis',
    description: 'simulated GM physical-visit input; not a real attendance claim',
  };
  expect(simulatedGMPhysicalVisit.testOnly).toBe(true);
  const visit = await attestVipHostVisit.run(request({ ...visitRequest, shipId: simulatedGMPhysicalVisit.destinationShipId }));
  expect(visit).toMatchObject({ status: 'committed', type: 'vip-host-visit-attestation',
    shipId: 'aegis', cycle: 4, revision: 1, benefitStatus: 'available' });
  expect(mock.documents.get(`sessions/${sessionId}/commandReceipts/visit-1`)?.result)
    .toMatchObject({ status: 'committed', type: 'vip-host-visit-attestation', shipId: 'aegis', cycle: 4 });
  expect(mock.documents.get(`sessions/${sessionId}/vipHostVisits/4`)).toMatchObject({
    hostUid: 'host-uid', hostRoleId: 'vip-host', hostShipId: 'dione', shipId: 'aegis', attestedByUid: 'gm-uid',
  });
  expect(mock.documents.get(`sessions/${sessionId}/vipHostMaintenanceGrants/aegis/cycles/4`))
    .toMatchObject({ status: 'available', revision: 1, hostUid: 'host-uid', cycle: 4 });
  const publicBenefit = mock.documents.get(`sessions/${sessionId}/vipHostMaintenanceBenefits/aegis/cycles/4`)!;
  expect(publicBenefit).toMatchObject({ type: 'vip-host-maintenance-benefit', status: 'available', revision: 1 });
  expect(publicBenefit).not.toHaveProperty('hostUid');
  expect(publicBenefit).not.toHaveProperty('attestedByUid');

  mock.set.mockClear();
  await expect(attestVipHostVisit.run(request(visitRequest))).resolves.toMatchObject({ status: 'replayed' });
  expect(mock.set).not.toHaveBeenCalled();
  await expect(attestVipHostVisit.run(request({ ...visitRequest, requestId: 'visit-2' })))
    .rejects.toMatchObject({ code: 'failed-precondition' });
  expect(mock.set).not.toHaveBeenCalled();

  const reroll = await rerollHostedShipMaintenance.run(request(rerollRequest));
  expect(reroll).toMatchObject({ status: 'committed', type: 'vip-host-maintenance-reroll',
    shipId: 'aegis', cycle: 4, grantRevision: 3, maintenanceRevision: 2 });
  expect(mock.documents.get(`sessions/${sessionId}/commandReceipts/reroll-1`)?.result)
    .toMatchObject({ status: 'committed', type: 'vip-host-maintenance-reroll', shipId: 'aegis', cycle: 4 });
  expect(entropy.randomInt).toHaveBeenCalledOnce();
  expect(entropy.randomInt).toHaveBeenCalledWith(1, 7);
  expect(mock.documents.get(`sessions/${sessionId}`).maintenanceCycles).toMatchObject({
    aegis: { revision: 2, unrestRolls: [6, 1], results: { '3': expect.stringContaining('VIP reroll: 6 + 1') } },
  });
  expect(mock.documents.get(`sessions/${sessionId}/vipHostMaintenanceGrants/aegis/cycles/4`))
    .toMatchObject({ status: 'consumed', revision: 3, consumedByRequestId: 'reroll-1' });
  expect(mock.documents.get(`sessions/${sessionId}/vipHostMaintenanceBenefits/aegis/cycles/4`))
    .toMatchObject({ status: 'consumed', revision: 3 });

  mock.set.mockClear();
  mock.update.mockClear();
  entropy.randomInt.mockClear();
  await expect(rerollHostedShipMaintenance.run(request(rerollRequest))).resolves.toMatchObject({ status: 'replayed' });
  expect(mock.set).not.toHaveBeenCalled();
  expect(mock.update).not.toHaveBeenCalled();
  expect(entropy.randomInt).not.toHaveBeenCalled();

  await expect(rerollHostedShipMaintenance.run(request({ ...rerollRequest, requestId: 'reroll-2',
    expectedGrantRevision: 2, expectedMaintenanceRevision: 2, dieIndex: 1 })))
    .rejects.toMatchObject({ code: 'failed-precondition' });
  expect(mock.set).not.toHaveBeenCalled();
  expect(mock.update).not.toHaveBeenCalled();
  expect(entropy.randomInt).not.toHaveBeenCalled();

  mock.documents.get(`sessions/${sessionId}/players/gm-uid`)!.connected = false;
  await expect(rerollHostedShipMaintenance.run(request(rerollRequest)))
    .rejects.toMatchObject({ code: 'permission-denied' });
  expect(mock.set).not.toHaveBeenCalled();
  expect(mock.update).not.toHaveBeenCalled();
  expect(entropy.randomInt).not.toHaveBeenCalled();
});
