import { beforeEach, expect, it, vi } from 'vitest';

type Fields = Record<string, unknown>;
const mock = vi.hoisted(() => {
  const documents = new Map<string, Fields>();
  const ref = (path: string) => ({ path, id: path.split('/').at(-1)! });
  const snapshot = (path: string) => ({ ...ref(path), ref: ref(path), exists: documents.has(path),
    data: () => documents.get(path), get: (field: string) => documents.get(path)?.[field] });
  const writes = vi.fn();
  const runTransaction = async (callback: (tx: unknown) => Promise<unknown>) => {
    const queued: Array<[string, Fields]> = [];
    const result = await callback({ get: async (target: { path: string; collection?: boolean }) => {
      if (queued.length) throw new Error('Native Firestore forbids reads after writes');
      return target.collection ? { docs: [...documents.keys()].filter(path => path.startsWith(`${target.path}/`) &&
        !path.slice(target.path.length + 1).includes('/')).map(snapshot) } : snapshot(target.path);
    }, set: (target: { path: string }, value: Fields) => queued.push([target.path, value]),
    update: (target: { path: string }, value: Fields) => queued.push([target.path, { ...documents.get(target.path), ...value }]),
    create: (target: { path: string }, value: Fields) => {
      if (documents.has(target.path)) throw new Error('already exists'); queued.push([target.path, value]);
    } });
    queued.forEach(([path, value]) => { writes(path, value); documents.set(path, value); });
    return result;
  };
  return { documents, writes, db: { doc: ref, collection: (path: string) => ({ path, collection: true }), runTransaction } };
});
vi.mock('firebase-admin/app', () => ({ initializeApp: vi.fn() }));
vi.mock('firebase-admin/firestore', () => ({ getFirestore: () => mock.db,
  FieldValue: { serverTimestamp: () => 'server-time' },
  Timestamp: class { toMillis() { return Date.now(); } toDate() { return new Date(); } static now() { return new this(); } } }));
vi.mock('firebase-functions/v2', () => ({ setGlobalOptions: vi.fn() }));
vi.mock('firebase-functions/v2/https', () => ({ HttpsError: class extends Error {
  constructor(readonly code: string, message: string) { super(message); }
}, onCall: (handler: (request: unknown) => unknown) => ({ run: handler }) }));
vi.mock('firebase-functions/v2/scheduler', () => ({ onSchedule: (_: unknown, handler: unknown) => ({ run: handler }) }));
import * as callables from './index';
const calls = callables as unknown as { sendScoutTaxiCourier: { run: (request: unknown) => Promise<unknown> };
  sendScoutTaxiTransfer: { run: (request: unknown) => Promise<unknown> };
  readFleetGroupMessages: { run: (request: unknown) => Promise<unknown> };
  sendFleetGroupMessage: { run: (request: unknown) => Promise<unknown> };
  requestScout: { run: (request: unknown) => Promise<unknown> } };
const data = { sessionId: 's1', requestId: 'taxi-1', shuttleId: 'hummingbird', targetShipId: 'aegis',
  text: 'Hold position.', expectedCycle: 3, expectedControlRevision: 0, expectedNavigationRevision: 2 };
const request = (value: Fields = data, uid = 'explorer') => ({ data: value, auth: { uid } });
const put = (path: string, value: Fields) => mock.documents.set(path, value);

beforeEach(() => {
  mock.documents.clear(); mock.writes.mockClear();
  put('sessions/s1', { phase: 'active', currentTurn: 3, chartId: 'A', chartSelectionLocked: true,
    activeRoleIds: ['wing-commander', 'quellon-explorer', 'shepherd-scientist'], activeVesselIds: ['aegis', 'quellon', 'shepherd'],
    turnPhase: { turn: 3, teamPhaseEndsAt: '2026-01-01T00:00:00Z', openAirspaceEndsAt: '2099-01-01T00:00:00Z',
      airspace: { state: 'lifted', tickerActive: true, pressAccess: false } },
    shuttleDockings: [{ shuttleId: 'hummingbird', shipId: 'quellon', dockedAt: '2026-01-01T00:00:00Z' }],
    shuttleControl: { hummingbird: { shuttleId: 'hummingbird', ownerRoleId: 'quellon-explorer',
      ownerUid: 'explorer', holderUid: 'explorer', revision: 0 } } });
  put('sessions/s1/players/explorer', { role: 'player', connected: true, fleetGroupId: 'fleet-2',
    assignedRoleId: 'quellon-explorer', seatId: 'quellon-explorer', activeConsoleRoleId: 'quellon-explorer', replacementRoleId: null });
  put('sessions/s1/players/wing', { role: 'player', connected: true, fleetGroupId: 'fleet-1',
    assignedRoleId: 'wing-commander', seatId: 'wing-commander', activeConsoleRoleId: 'wing-commander', replacementRoleId: null });
  put('sessions/s1/fleetGroups/fleet-1', { id: 'fleet-1', vesselIds: ['aegis', 'shepherd'], memberUids: ['wing'] });
  put('sessions/s1/fleetGroups/fleet-2', { id: 'fleet-2', vesselIds: ['quellon'], memberUids: ['explorer'] });
  put('sessions/s1/serverState/navigation', { revision: 2,
    shipGalacticCoordinates: { aegis: '0000', shepherd: '0000', quellon: '1413' }, pursuitGroups: { 'fleet-1': 2, 'fleet-2': 4 } });
});

const transferData = { sessionId: 's1', requestId: 'transfer-1', shuttleId: 'hummingbird', targetShipId: 'shepherd',
  expectedCycle: 3, expectedControlRevision: 0, expectedNavigationRevision: 2, expectedFleetPartitionRevision: 1,
  expectedGroupId: 'fleet-2', payload: { kind: 'fuel', units: 2 } };

it('atomically taxis fuel only between current groups and reconciles an exact retry once', async () => {
  const session = mock.documents.get('sessions/s1')!;
  Object.assign(session, { fleetPartitionRevision: 1, maintenanceCycles: {
    quellon: { turn: 3, step: 7, revision: 1, results: {}, charges: [], refuelled: ['hummingbird'] },
  }, shuttleFuelled: { hummingbird: true }, shipResources: {
    quellon: { ore: 0, fuel: 4, food: 10, water: 8, materials: 12 },
    shepherd: { ore: 0, fuel: 1, food: 10, water: 8, materials: 12 },
  } });
  Object.assign(mock.documents.get('sessions/s1/serverState/navigation')!, { shipGalacticCoordinates: {
    aegis: '0000', quellon: '0000', shepherd: '5143',
  } });
  const call = (value = transferData, uid = 'explorer') => calls.sendScoutTaxiTransfer.run(request(value, uid));
  expect(await call()).toMatchObject({ status: 'committed', requestId: 'transfer-1', kind: 'fuel',
    sourceGroupId: 'fleet-2', targetGroupId: 'fleet-1', targetShipId: 'shepherd', units: 2, sourceFuelRemaining: 2 });
  expect(mock.documents.get('sessions/s1')!.shipResources).toMatchObject({ quellon: { fuel: 2 }, shepherd: { fuel: 3 } });
  expect(mock.documents.get('sessions/s1/players/explorer')!.fleetGroupId).toBe('fleet-2');
  const committedWrites = mock.writes.mock.calls.length;
  mock.writes.mockClear();
  expect(await call()).toMatchObject({ status: 'replayed', requestId: 'transfer-1' });
  expect(mock.writes).not.toHaveBeenCalled();
  expect(committedWrites).toBeGreaterThan(0);
});

it.each([
  ['wrong actor', transferData, 'wing'],
  ['stale navigation', { ...transferData, expectedNavigationRevision: 1 }, 'explorer'],
  ['stale group revision', { ...transferData, expectedFleetPartitionRevision: 0 }, 'explorer'],
  ['injected origin', { ...transferData, originShipId: 'aegis' }, 'explorer'],
])('rejects taxi %s before any write', async (_label, data, uid) => {
  Object.assign(mock.documents.get('sessions/s1')!, { fleetPartitionRevision: 1, maintenanceCycles: {
    quellon: { turn: 3, step: 7, revision: 1, results: {}, charges: [], refuelled: ['hummingbird'] },
  }, shuttleFuelled: { hummingbird: true }, shipResources: {
    quellon: { ore: 0, fuel: 4, food: 10, water: 8, materials: 12 }, shepherd: { ore: 0, fuel: 1, food: 10, water: 8, materials: 12 },
  } });
  put('sessions/s1/players/wing', { role: 'player', connected: true, fleetGroupId: 'fleet-1',
    assignedRoleId: 'wing-commander', seatId: 'wing-commander', activeConsoleRoleId: 'wing-commander' });
  Object.assign(mock.documents.get('sessions/s1/serverState/navigation')!, { shipGalacticCoordinates: {
    aegis: '0000', quellon: '0000', shepherd: '0000',
  } });
  await expect(calls.sendScoutTaxiTransfer.run(request(data, uid))).rejects.toThrow();
  expect(mock.writes).not.toHaveBeenCalled();
});

it('delivers one separate courier note and consumes exactly one shared scouting attempt', async () => {
  const beforeSession = structuredClone(mock.documents.get('sessions/s1'));
  const beforeNavigation = structuredClone(mock.documents.get('sessions/s1/serverState/navigation'));
  expect(await calls.sendScoutTaxiCourier.run(request())).toEqual({ status: 'committed', requestId: 'taxi-1',
    shuttleId: 'hummingbird', targetShipId: 'aegis', cycle: 3 });
  const notes = mock.documents.get('sessions/s1/fleetGroupMessages/fleet-1')!;
  expect(notes).toMatchObject({ groupId: 'fleet-1', messages: [{ id: 'taxi-1', text: 'Scout taxi from quellon: Hold position.' }] });
  expect(mock.documents.get('sessions/s1/scoutCadence/3-hummingbird')).toMatchObject({ scans: [{ requestId: 'taxi-1', actorUid: 'explorer' }] });
  expect(mock.documents.has('sessions/s1/scoutRequests/taxi-1')).toBe(false);
  expect(mock.documents.get('sessions/s1')).toEqual(beforeSession);
  expect(mock.documents.get('sessions/s1/serverState/navigation')).toEqual(beforeNavigation);
  expect(mock.documents.get('sessions/s1/players/explorer')?.fleetGroupId).toBe('fleet-2');
  expect(await calls.readFleetGroupMessages.run(request({ sessionId: 's1', expectedGroupId: 'fleet-1' }, 'wing'))).toMatchObject({ messages: [{ id: 'taxi-1' }] });
  await expect(calls.readFleetGroupMessages.run(request({ sessionId: 's1', expectedGroupId: 'fleet-1' }))).rejects.toMatchObject({ code: 'permission-denied' });
  await expect(calls.sendFleetGroupMessage.run(request({ sessionId: 's1', expectedGroupId: 'fleet-1', requestId: 'ordinary-cross', text: 'Forbidden' })))
    .rejects.toMatchObject({ code: 'permission-denied' });
});

it('replays the exact courier once without consuming capacity or adding notes again', async () => {
  await calls.sendScoutTaxiCourier.run(request()); mock.writes.mockClear();
  expect(await calls.sendScoutTaxiCourier.run(request())).toMatchObject({ status: 'replayed', requestId: 'taxi-1' });
  expect(mock.writes).not.toHaveBeenCalled();
  await expect(calls.sendScoutTaxiCourier.run(request({ ...data, text: 'Changed note.' }))).rejects.toThrow();
  expect(mock.writes).not.toHaveBeenCalled();
});

it('blocks scouting after a courier consumes its attempt', async () => {
  await calls.sendScoutTaxiCourier.run(request()); mock.writes.mockClear();
  await expect(calls.requestScout.run(request({ sessionId: 's1', requestId: 'scan-after-taxi', entitlementId: 'hummingbird', targetCoordinate: '5143' })))
    .rejects.toMatchObject({ code: 'failed-precondition' });
  expect(mock.writes).not.toHaveBeenCalled();
});

it.each([
  { expectedCycle: 2 }, { expectedControlRevision: 1 }, { expectedNavigationRevision: 1 }, { targetShipId: 'quellon' },
  { shuttleId: 'endeavour' }, { targetGroupId: 'fleet-1' }, { targetCoordinate: '0000' },
])('rejects stale or client-supplied taxi authority without any write: %j', async changes => {
  await expect(calls.sendScoutTaxiCourier.run(request({ ...data, ...changes }))).rejects.toThrow();
  expect(mock.writes).not.toHaveBeenCalled();
});

it.each(['other-holder', 'wrong-role', 'kicked', 'closed-airspace', 'out-of-range', 'in-transit', 'malformed-notes'])(
'denies %s before delivery, attempt consumption or any mutation', async reason => {
  const session = mock.documents.get('sessions/s1')!;
  const player = mock.documents.get('sessions/s1/players/explorer')!;
  if (reason === 'other-holder') (session.shuttleControl as Record<string, Fields>).hummingbird!.holderUid = 'wing';
  if (reason === 'wrong-role') player.replacementRoleId = 'comms-officer';
  if (reason === 'kicked') player.connected = false;
  if (reason === 'closed-airspace') (session.turnPhase as Fields).airspace = { state: 'restricted' };
  if (reason === 'out-of-range') (mock.documents.get('sessions/s1/serverState/navigation')!.shipGalacticCoordinates as Fields).aegis = '4888';
  if (reason === 'in-transit') put('sessions/s1/shuttleDepartures/hummingbird', { status: 'in-transit' });
  if (reason === 'malformed-notes') put('sessions/s1/fleetGroupMessages/fleet-1', { groupId: 'fleet-1', messages: [{ privateCards: ['secret'] }] });
  await expect(calls.sendScoutTaxiCourier.run(request())).rejects.toThrow();
  expect(mock.writes).not.toHaveBeenCalled();
});

it('rechecks current actor and membership even for a prior courier receipt', async () => {
  await calls.sendScoutTaxiCourier.run(request()); mock.writes.mockClear();
  await expect(calls.sendScoutTaxiCourier.run(request(data, 'wing'))).rejects.toThrow();
  mock.documents.get('sessions/s1/players/explorer')!.fleetGroupId = 'fleet-1';
  await expect(calls.sendScoutTaxiCourier.run(request())).rejects.toThrow();
  expect(mock.writes).not.toHaveBeenCalled();
});

it.each(['aegis', 'quellon'])('denies a destroyed courier endpoint %s with zero writes', async shipId => {
  mock.documents.get('sessions/s1')!.shipDamage = { [shipId]: { destroyed: true, damagedSystemIds: [] } };
  await expect(calls.sendScoutTaxiCourier.run(request())).rejects.toMatchObject({ code: 'failed-precondition' });
  expect(mock.writes).not.toHaveBeenCalled();
});

it('reconciles a committed prior cycle without redelivery or revealing its audience', async () => {
  await calls.sendScoutTaxiCourier.run(request()); mock.writes.mockClear();
  mock.documents.get('sessions/s1')!.currentTurn = 4;
  mock.documents.get('sessions/s1/serverState/navigation')!.revision = 3;
  expect(await calls.sendScoutTaxiCourier.run(request({ ...data, reconcileOnly: true }))).toEqual({
    status: 'replayed', requestId: 'taxi-1', shuttleId: 'hummingbird', targetShipId: 'aegis', cycle: 3 });
  expect(mock.writes).not.toHaveBeenCalled();
});

it('confirms an obsolete uncommitted request was not delivered without creating it', async () => {
  mock.documents.get('sessions/s1')!.currentTurn = 4;
  expect(await calls.sendScoutTaxiCourier.run(request({ ...data, reconcileOnly: true }))).toEqual({
    status: 'not-delivered', requestId: 'taxi-1', shuttleId: 'hummingbird', targetShipId: 'aegis', cycle: 3 });
  expect(mock.writes).not.toHaveBeenCalled();
  await expect(calls.sendScoutTaxiCourier.run(request())).rejects.toMatchObject({ code: 'failed-precondition' });
  expect(mock.writes).not.toHaveBeenCalled();
});

it('never clears an uncertain request while its delivery authority could still commit', async () => {
  await expect(calls.sendScoutTaxiCourier.run(request({ ...data, reconcileOnly: true }))).rejects.toMatchObject({ code: 'failed-precondition' });
  expect(mock.writes).not.toHaveBeenCalled();
});

it('denies reconciliation after the actor leaves the original audience', async () => {
  await calls.sendScoutTaxiCourier.run(request()); mock.writes.mockClear();
  mock.documents.get('sessions/s1')!.currentTurn = 4;
  mock.documents.get('sessions/s1/players/explorer')!.fleetGroupId = 'fleet-1';
  await expect(calls.sendScoutTaxiCourier.run(request({ ...data, reconcileOnly: true }))).rejects.toMatchObject({ code: 'failed-precondition' });
  expect(mock.writes).not.toHaveBeenCalled();
});

it.each([{ expectedCycle: 4 }, { expectedNavigationRevision: 3 }, { expectedControlRevision: 1 }])(
  'does not confirm a future authority request as permanently undelivered: %j', async changes => {
    await expect(calls.sendScoutTaxiCourier.run(request({ ...data, ...changes, reconcileOnly: true })))
      .rejects.toMatchObject({ code: 'failed-precondition' });
    expect(mock.writes).not.toHaveBeenCalled();
  });
