import { beforeEach, expect, it, vi } from 'vitest';
import type { CallableRequest } from 'firebase-functions/v2/https';

type Fields = Record<string, unknown>;
const cryptoMock = vi.hoisted(() => ({ randomInt: vi.fn() }));
vi.mock('node:crypto', () => cryptoMock);

const mock = vi.hoisted(() => {
  const documents = new Map<string, Fields>();
  const ref = (path: string) => ({ path, id: path.split('/').at(-1) ?? '' });
  const snapshot = (path: string) => {
    const fields = documents.get(path);
    return { exists: fields !== undefined, id: path.split('/').at(-1) ?? '', ref: ref(path), get: (field: string) => fields?.[field], data: () => fields };
  };
  const get = vi.fn(async (target: { path: string }) => snapshot(target.path));
  const set = vi.fn((target: { path: string }, fields: Fields) => documents.set(target.path, { ...fields }));
  const update = vi.fn((target: { path: string }, fields: Fields) => {
    const current = { ...(documents.get(target.path) ?? {}) };
    for (const [path, value] of Object.entries(fields)) {
      const parts = path.split('.');
      let cursor = current;
      for (let index = 0; index < parts.length - 1; index += 1) {
        const key = parts[index]!;
        cursor[key] = { ...((cursor[key] as Fields | undefined) ?? {}) };
        cursor = cursor[key] as Fields;
      }
      cursor[parts.at(-1)!] = value;
    }
    documents.set(target.path, current);
  });
  const runTransaction = vi.fn(async (callback: (tx: unknown) => unknown) => callback({ get, set, update }));
  return { documents, get, set, update, db: { doc: ref, runTransaction } };
});

vi.mock('firebase-admin/firestore', () => ({
  getFirestore: () => mock.db,
  FieldValue: { serverTimestamp: () => 'server-time' },
}));
vi.mock('firebase-functions/v2/https', () => ({
  HttpsError: class HttpsError extends Error { constructor(readonly code: string, message: string) { super(message); } },
  onCall: (optionsOrHandler: unknown, maybeHandler?: (request: unknown) => unknown) => ({ run: maybeHandler ?? optionsOrHandler }),
}));

import { repairMaliades, resolveMaliadesMedium, resolveMaliadesShort } from './maliadesCallable';

const request = (data: Fields, uid = 'holder') => ({ data, auth: { uid } }) as CallableRequest<Fields>;
const put = (path: string, fields: Fields) => mock.documents.set(path, { ...fields });
const baseSession = () => ({
  phase: 'active', currentTurn: 2, activeVesselIds: ['dione'],
  turnPhase: {
    turn: 2, teamPhaseEndsAt: '2099-09-22T12:00:00.000Z', openAirspaceEndsAt: '2099-09-22T12:15:00.000Z',
    airspace: { state: 'restricted', tickerActive: true, pressAccess: false },
  },
  shuttleDockings: [{ shuttleId: 'maliades', shipId: 'dione', dockedAt: 'SESSION START' }],
  shuttleControl: { maliades: { shuttleId: 'maliades', ownerRoleId: 'dione-engineer', ownerUid: 'owner', holderUid: 'holder', revision: 2 } },
  shuttleFuelled: { maliades: true },
  maliadesState: { revision: 1, launched: true, damage: 0, destroyed: false, medium: null, short: null },
  shipDamage: { dione: { damagedSystemIds: [], destroyed: false } },
  shipResources: { dione: { ore: 0, fuel: 4, food: 10, water: 8, materials: 4, securityTeams: 2 } },
});

beforeEach(() => {
  mock.documents.clear(); mock.get.mockClear(); mock.set.mockClear(); mock.update.mockClear(); mock.db.runTransaction.mockClear();
  cryptoMock.randomInt.mockReset().mockReturnValue(3);
  put('sessions/s1', baseSession());
  put('sessions/s1/players/holder', {
    role: 'player', connected: true, assignedRoleId: 'dione-engineer', activeConsoleRoleId: 'dione-engineer',
    replacementRoleId: null, fleetGroupId: 'fleet-1',
  });
  put('sessions/s1/fleetGroups/fleet-1', { id: 'fleet-1', vesselIds: ['dione'], memberUids: ['holder'] });
  put('sessions/s1/wolfAttackState/current', {
    type: 'wolf-attack-state', status: 'declared', turn: 2, revision: 1, currentStep: 'targeting', airspaceLocked: true,
    launchedCraftIds: ['maliades'], parkedCraftIds: [],
    calculationReceipt: { targeting: { ring: ['wolf-1', 'wolf-2', 'wolf-3'] } },
  });
});

const medium = { sessionId: 's1', requestId: 'medium-1', expectedCycle: 2, expectedRevision: 1,
  choices: [{ kind: 'target-shift', targetId: 'wolf-1', shift: 1 }, { kind: 'attack', targetId: 'wolf-2' }] };

it('commits Medium server dice, redacts actor identity, and replays without rolling again', async () => {
  await expect(resolveMaliadesMedium.run(request(medium))).resolves.toMatchObject({
    status: 'committed', cycle: 2, revision: 2, state: { damage: 0, revision: 2 },
    resolution: { attack: { die: 4, hit: true, selfDamage: 0 } },
  });
  expect(cryptoMock.randomInt).toHaveBeenCalledTimes(1);
  expect(mock.documents.get('sessions/s1/events/maliades-medium-medium-1')).not.toHaveProperty('actorUid');
  const writes = mock.set.mock.calls.length + mock.update.mock.calls.length;
  cryptoMock.randomInt.mockClear();
  (mock.documents.get('sessions/s1') as Fields).phase = 'debrief';
  await expect(resolveMaliadesMedium.run(request(medium))).resolves.toMatchObject({ status: 'replayed' });
  expect(cryptoMock.randomInt).not.toHaveBeenCalled();
  expect(mock.set.mock.calls.length + mock.update.mock.calls.length).toBe(writes);
});

it('resolves Short risk, then repairs one damage only with fuelled Team Phase docking', async () => {
  await resolveMaliadesMedium.run(request(medium));
  cryptoMock.randomInt.mockReturnValue(0);
  await expect(resolveMaliadesShort.run(request({
    sessionId: 's1', requestId: 'short-1', expectedCycle: 2, expectedRevision: 2, targetIds: ['wolf-3'],
  }))).resolves.toMatchObject({ revision: 3, state: { damage: 1, short: { selfDamage: 1 } } });
  await expect(repairMaliades.run(request({
    sessionId: 's1', requestId: 'repair-1', expectedCycle: 2, expectedRevision: 3,
    expectedHostShipId: 'dione', damageToRepair: 1,
  }))).resolves.toMatchObject({ status: 'committed', revision: 4, materialsRemaining: 3, state: { damage: 0 } });
  expect(mock.documents.get('sessions/s1')).toMatchObject({
    maliadesState: { revision: 4, damage: 0 }, shipResources: { dione: { materials: 3 } },
  });
});

it('rejects stale or foreign authority before server dice', async () => {
  await expect(resolveMaliadesMedium.run(request({ ...medium, expectedRevision: 0 }))).rejects.toMatchObject({ code: 'failed-precondition' });
  await expect(resolveMaliadesMedium.run(request(medium, 'owner'))).rejects.toMatchObject({ code: 'permission-denied' });
  expect(cryptoMock.randomInt).not.toHaveBeenCalled();
});
