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
      if (target.path.includes('/fleetTaxiTransferAudits/')) {
        const invalidField = Object.entries(value).find(([, entry]) => entry === undefined)?.[0];
        if (invalidField) throw new Error(`Cannot use undefined as a Firestore value (found in field "${invalidField}")`);
      }
      if (documents.has(target.path)) throw new Error('already exists'); queued.push([target.path, value]);
    } });
    queued.forEach(([path, value]) => { writes(path, value); documents.set(path, value); });
    return result;
  };
  return { documents, writes, db: { doc: ref, collection: (path: string) => ({ path, collection: true }), runTransaction } };
});
vi.mock('firebase-admin/app', () => ({ initializeApp: vi.fn() }));
vi.mock('firebase-admin/firestore', () => ({ getFirestore: () => mock.db,
  FieldValue: { serverTimestamp: () => 'server-time', delete: () => '__delete-field__' },
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
  requestScout: { run: (request: unknown) => Promise<unknown> };
  shareKnownSystemDetails: { run: (request: unknown) => Promise<unknown> };
  readFleetGroupNavigation: { run: (request: unknown) => Promise<unknown> } };
const data = { sessionId: 's1', requestId: 'taxi-1', shuttleId: 'hummingbird', targetShipId: 'aegis',
  text: 'Hold position.', expectedCycle: 3, expectedControlRevision: 0, expectedNavigationRevision: 2 };
const request = (value: Fields = data, uid = 'explorer') => ({ data: value, auth: { uid } });
const put = (path: string, value: Fields) => mock.documents.set(path, value);

beforeEach(() => {
  mock.documents.clear(); mock.writes.mockClear();
  put('sessions/s1', { phase: 'active', currentTurn: 3, chartId: 'A', chartSelectionLocked: true,
    activeRoleIds: ['wing-commander', 'quellon-explorer', 'shepherd-scientist'], activeVesselIds: ['aegis', 'quellon', 'shepherd'],
    fighterWingCounts: { 'fighter-wing-alpha': { count: 4, revision: 0 }, 'fighter-wing-bravo': { count: 0, revision: 0 } },
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

function seedSplitNavigation() {
  Object.assign(mock.documents.get('sessions/s1')!, { fleetPartitionRevision: 1 });
  Object.assign(mock.documents.get('sessions/s1')!, { shuttleDockings: [
    { shuttleId: 'hummingbird', shipId: 'quellon', dockedAt: '2026-01-01T00:00:00Z' },
    { shuttleId: 'endeavour', shipId: 'shepherd', dockedAt: '2026-01-01T00:00:00Z' },
    { shuttleId: 'starlight', shipId: 'aegis', dockedAt: '2026-01-01T00:00:00Z' },
  ] });
  put('sessions/s1/players/wing', { role: 'player', connected: true, fleetGroupId: 'fleet-1', assignedRoleId: 'wing-commander' });
  put('sessions/s1/players/explorer', { role: 'player', connected: true, fleetGroupId: 'fleet-2',
    assignedRoleId: 'quellon-explorer', seatId: 'quellon-explorer', activeConsoleRoleId: 'quellon-explorer' });
  put('sessions/s1/players/shepherd-player', { role: 'player', connected: true, fleetGroupId: 'fleet-2',
    assignedRoleId: 'shepherd-scientist' });
  put('sessions/s1/fleetGroups/fleet-1', { id: 'fleet-1', vesselIds: ['aegis'], memberUids: ['wing'], memberShipIds: { wing: 'aegis' } });
  put('sessions/s1/fleetGroups/fleet-2', { id: 'fleet-2', vesselIds: ['quellon', 'shepherd'],
    memberUids: ['explorer', 'shepherd-player'], memberShipIds: { explorer: 'quellon', 'shepherd-player': 'shepherd' } });
  put('sessions/s1/serverState/navigation', { revision: 2,
    shipGalacticCoordinates: { aegis: '0000', quellon: '0000', shepherd: '5143' },
    shipNavigationLogs: { aegis: [], quellon: [], shepherd: [] },
    scoutedCoordinatesByShip: { aegis: [], quellon: ['1413'], shepherd: [] },
    pursuitGroups: { 'fleet-1': 2, 'fleet-2': 4 } });
}

function seedPlayerTaxiScenario(targetCoordinate: string) {
  const session = mock.documents.get('sessions/s1')!;
  Object.assign(session, { fleetPartitionRevision: 1,
    maintenanceCycles: { aegis: { turn: 3, step: 7, revision: 1, results: {}, charges: [], refuelled: ['starlight'] } },
    shuttleFuelled: { starlight: true }, shuttleDockings: [
      { shuttleId: 'starlight', shipId: 'aegis', dockedAt: '2026-01-01T00:00:00Z' },
      { shuttleId: 'hummingbird', shipId: 'quellon', dockedAt: '2026-01-01T00:00:00Z' },
      { shuttleId: 'endeavour', shipId: 'shepherd', dockedAt: '2026-01-01T00:00:00Z' },
    ],
    shuttleControl: {
      starlight: { shuttleId: 'starlight', ownerRoleId: 'wing-commander', ownerUid: 'wing', holderUid: 'wing', revision: 0 },
      hummingbird: { shuttleId: 'hummingbird', ownerRoleId: 'quellon-explorer', ownerUid: 'explorer', holderUid: 'explorer', revision: 0 },
      endeavour: { shuttleId: 'endeavour', ownerRoleId: 'shepherd-scientist', ownerUid: 'shepherd-player', holderUid: 'shepherd-player', revision: 0 },
    }, shipResources: {
      aegis: { ore: 0, fuel: 4, food: 10, water: 8, materials: 12 },
      quellon: { ore: 0, fuel: 2, food: 10, water: 8, materials: 12 },
      shepherd: { ore: 0, fuel: 2, food: 10, water: 8, materials: 12 },
    },
  });
  put('sessions/s1/players/wing', { role: 'player', connected: true, fleetGroupId: 'fleet-1',
    assignedRoleId: 'wing-commander', seatId: 'wing-commander', activeConsoleRoleId: 'wing-commander' });
  put('sessions/s1/players/admiral', { role: 'player', connected: true, fleetGroupId: 'fleet-1',
    assignedRoleId: 'admiral', seatId: 'admiral', activeConsoleRoleId: 'admiral' });
  put('sessions/s1/players/explorer', { role: 'player', connected: true, fleetGroupId: 'fleet-2',
    assignedRoleId: 'quellon-explorer', seatId: 'quellon-explorer', activeConsoleRoleId: 'quellon-explorer' });
  put('sessions/s1/players/shepherd-player', { role: 'player', connected: true, fleetGroupId: 'fleet-3',
    assignedRoleId: 'shepherd-scientist', seatId: 'shepherd-scientist', activeConsoleRoleId: 'shepherd-scientist' });
  put('sessions/s1/fleetGroups/fleet-1', { id: 'fleet-1', vesselIds: ['aegis'], memberUids: ['wing', 'admiral'],
    memberShipIds: { wing: 'aegis', admiral: 'aegis' } });
  put('sessions/s1/fleetGroups/fleet-2', { id: 'fleet-2', vesselIds: ['quellon'], memberUids: ['explorer'],
    memberShipIds: { explorer: 'quellon' } });
  put('sessions/s1/fleetGroups/fleet-3', { id: 'fleet-3', vesselIds: ['shepherd'], memberUids: ['shepherd-player'],
    memberShipIds: { 'shepherd-player': 'shepherd' } });
  put('sessions/s1/serverState/navigation', { revision: 2,
    shipGalacticCoordinates: { aegis: '1413', quellon: targetCoordinate, shepherd: '0000' },
    shipNavigationLogs: { aegis: [], quellon: [], shepherd: [] }, scoutedCoordinatesByShip: {},
    pursuitGroups: { 'fleet-1': 2, 'fleet-2': 4, 'fleet-3': 1 } });
}

it.each([['fuel',null],['players',null],['fuel',Number.MAX_SAFE_INTEGER],['players',Number.MAX_SAFE_INTEGER]] as const)('denies malformed or exhausted topology authority before a %s taxi can write (%s)',async(kind,revision)=>{
  seedPlayerTaxiScenario('1413');
  Object.assign(mock.documents.get('sessions/s1')!,{fleetPartitionRevision:revision});
  const before=structuredClone([...mock.documents.entries()]);
  await expect(calls.sendScoutTaxiTransfer.run(request({...transferData,shuttleId:'starlight',
    expectedGroupId:'fleet-1',expectedFleetPartitionRevision:revision??0,
    payload:kind==='fuel'?{kind,units:1}:{kind,playerUids:['admiral']}},'wing')))
    .rejects.toMatchObject({code:'failed-precondition'});
  expect(mock.writes).not.toHaveBeenCalled();expect([...mock.documents.entries()]).toEqual(before);
});

it('commits one legal passenger taxi with a Firestore-safe audit and exact replay', async () => {
  seedPlayerTaxiScenario('0000');
  const taxi = { sessionId: 's1', requestId: 'players-transfer-1', shuttleId: 'starlight', targetShipId: 'quellon',
    expectedCycle: 3, expectedControlRevision: 0, expectedNavigationRevision: 2,
    expectedFleetPartitionRevision: 1, expectedGroupId: 'fleet-1',
    payload: { kind: 'players', playerUids: ['admiral'] } };
  const call = () => calls.sendScoutTaxiTransfer.run(request(taxi, 'wing'));
  expect(await call()).toMatchObject({ status: 'committed', requestId: taxi.requestId, kind: 'players',
    sourceGroupId: 'fleet-1', targetShipId: 'quellon', playerUids: ['admiral'], cycle: 3 });
  expect(mock.documents.get(`sessions/s1/fleetTaxiTransferAudits/${taxi.requestId}`)).toMatchObject({
    actorUid: 'wing', shuttleId: 'starlight', sourceGroupId: 'fleet-1', targetGroupId: 'fleet-2',
    payload: { kind: 'players', playerUids: ['admiral'] },
  });
  expect(mock.documents.get(`sessions/s1/fleetTaxiTransferAudits/${taxi.requestId}`)).not.toHaveProperty('sourceFuelRemaining');
  expect(mock.documents.get(`sessions/s1/fleetTaxiTransferAudits/${taxi.requestId}`)).not.toHaveProperty('targetFuelAfter');
  expect(mock.documents.get('sessions/s1/players/admiral')?.fleetGroupId).toBe('fleet-2');
  expect(mock.documents.get('sessions/s1')?.fleetPartitionRevision).toBe(2);
  mock.writes.mockClear();
  expect(await call()).toMatchObject({ status: 'replayed', requestId: taxi.requestId });
  expect(mock.writes).not.toHaveBeenCalled();
});

it('denies an out-of-range passenger taxi without any write', async () => {
  seedPlayerTaxiScenario('9997');
  const taxi = { sessionId: 's1', requestId: 'players-transfer-out-of-range', shuttleId: 'starlight', targetShipId: 'quellon',
    expectedCycle: 3, expectedControlRevision: 0, expectedNavigationRevision: 2,
    expectedFleetPartitionRevision: 1, expectedGroupId: 'fleet-1',
    payload: { kind: 'players', playerUids: ['admiral'] } };
  await expect(calls.sendScoutTaxiTransfer.run(request(taxi, 'wing'))).rejects.toThrow();
  expect(mock.writes).not.toHaveBeenCalled();
  expect(mock.documents.has(`sessions/s1/fleetTaxiTransferAudits/${taxi.requestId}`)).toBe(false);
  expect(mock.documents.has(`sessions/s1/commandReceipts/${taxi.requestId}`)).toBe(false);
  expect(mock.documents.has('sessions/s1/scoutCadence/3-starlight')).toBe(false);
});

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
    sourceGroupId: 'fleet-2', targetShipId: 'shepherd', units: 2, sourceFuelRemaining: 2 });
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

it('shares only scanned systems into current-group private ship projections and retries once', async () => {
  seedSplitNavigation();
  const requestData = { sessionId: 's1', requestId: 'share-1', expectedGroupId: 'fleet-2',
    expectedNavigationRevision: 2, coordinate: '1413', recipientShipIds: ['shepherd'] };
  expect(await calls.shareKnownSystemDetails.run(request(requestData))).toMatchObject({
    status: 'committed', groupId: 'fleet-2', coordinate: '1413', recipientShipIds: ['shepherd'], navigationRevision: 3,
  });
  expect(mock.documents.get('sessions/s1/serverState/navigation')?.scoutedCoordinatesByShip).toMatchObject({
    quellon: ['1413'], shepherd: ['1413'],
  });
  expect(mock.documents.get('sessions/s1/playerDiscoveries/shepherd-player')?.knownCoordinates).toContain('1413');
  expect(mock.documents.get('sessions/s1/fleetGroupShareAudits/share-1')).toMatchObject({
    actorUid: 'explorer', senderShipId: 'quellon', groupId: 'fleet-2', coordinate: '1413', recipientShipIds: ['shepherd'],
  });
  mock.writes.mockClear();
  expect(await calls.shareKnownSystemDetails.run(request(requestData))).toMatchObject({ status: 'committed', requestId: 'share-1' });
  expect(mock.writes).not.toHaveBeenCalled();
});

it.each([
  ['foreign recipient', { recipientShipIds: ['aegis'] }],
  ['invented coordinate', { coordinate: '5143' }],
  ['stale navigation', { expectedNavigationRevision: 1 }],
])('denies known-system share with %s before any write', async (_label, changes) => {
  seedSplitNavigation();
  await expect(calls.shareKnownSystemDetails.run(request({ sessionId: 's1', requestId: 'share-denied',
    expectedGroupId: 'fleet-2', expectedNavigationRevision: 2, coordinate: '1413', recipientShipIds: ['shepherd'], ...changes })))
    .rejects.toThrow();
  expect(mock.writes).not.toHaveBeenCalled();
});

it('returns server-current ships and docked shuttle hosts only for the requesting fleet group', async () => {
  seedSplitNavigation();
  const call = (expectedGroupId = 'fleet-2') => calls.readFleetGroupNavigation.run(request({ sessionId: 's1', requestId: 'nav-1',
    expectedNavigationRevision: 2, expectedFleetPartitionRevision: 1, expectedGroupId }));
  const reply = await call() as { groupId: string; ships: readonly { shipId: string; coordinate: string }[];
    dockedShuttles: readonly Record<string, unknown>[]; dockedFighterWings: readonly Record<string, unknown>[] };
  expect(reply.groupId).toBe('fleet-2');
  expect(reply.ships).toEqual([
    { shipId: 'quellon', fleetGroupId: 'fleet-2', coordinate: '0000' },
    { shipId: 'shepherd', fleetGroupId: 'fleet-2', coordinate: '5143' },
  ]);
  expect(reply.dockedShuttles).toEqual([
    { shuttleId: 'hummingbird', fleetGroupId: 'fleet-2', hostShipId: 'quellon' },
    { shuttleId: 'endeavour', fleetGroupId: 'fleet-2', hostShipId: 'shepherd' },
  ]);
  expect(reply.dockedShuttles.every(shuttle => Object.keys(shuttle).sort().join(',') ===
    'fleetGroupId,hostShipId,shuttleId')).toBe(true);
  expect(reply.dockedFighterWings).toEqual([]);
  expect(JSON.stringify(reply)).not.toContain('aegis');
  mock.writes.mockClear();
  await expect(call('fleet-1')).rejects.toMatchObject({ code: 'permission-denied' });
  expect(mock.writes).not.toHaveBeenCalled();
  const aegisMember = await calls.readFleetGroupNavigation.run(request({ sessionId: 's1', requestId: 'nav-aegis',
    expectedNavigationRevision: 2, expectedFleetPartitionRevision: 1, expectedGroupId: 'fleet-1' }, 'wing')) as {
      dockedFighterWings: readonly Record<string, unknown>[] };
  expect(aegisMember.dockedFighterWings).toEqual([
    { wingId: 'fighter-wing-alpha', fleetGroupId: 'fleet-1', hostShipId: 'aegis' },
  ]);
  expect(aegisMember.dockedFighterWings.every(wing => Object.keys(wing).sort().join(',') ===
    'fleetGroupId,hostShipId,wingId')).toBe(true);
});

it('suppresses a stale group docking while the latest server movement row says in transit', async () => {
  seedSplitNavigation();
  put('sessions/s1/shuttleDepartures/hummingbird', { status: 'in-transit', fleetGroupId: 'fleet-1' });
  const navigation = await calls.readFleetGroupNavigation.run(request({ sessionId: 's1', requestId: 'nav-transit',
    expectedNavigationRevision: 2, expectedFleetPartitionRevision: 1, expectedGroupId: 'fleet-2' })) as {
      dockedShuttles: readonly Record<string, unknown>[]; transits: readonly Record<string, unknown>[];
    };
  expect(navigation.dockedShuttles.some(shuttle => shuttle.shuttleId === 'hummingbird')).toBe(false);
  expect(navigation.transits.some(transit => transit.shuttleId === 'hummingbird')).toBe(false);
  expect(navigation.dockedShuttles.map(shuttle => shuttle.shuttleId)).toEqual(['endeavour']);
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
