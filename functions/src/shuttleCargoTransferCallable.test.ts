import { beforeEach, expect, it, vi } from 'vitest';
import type { CallableRequest } from 'firebase-functions/v2/https';

type Fields = Record<string, unknown>;
const mock = vi.hoisted(() => {
  const documents = new Map<string, Fields>();
  const ref = (path: string) => ({ path, id: path.split('/').at(-1) ?? '' });
  const snapshot = (path: string) => { const fields = documents.get(path); return {
    exists: fields !== undefined, id: path.split('/').at(-1) ?? '', ref: ref(path),
    get: (field: string) => fields?.[field], data: () => fields,
  }; };
  const get = vi.fn(async (target: { path: string }) => snapshot(target.path));
  const set = vi.fn((target: { path: string }, fields: Fields) => documents.set(target.path, { ...fields }));
  const update = vi.fn((target: { path: string }, fields: Fields) => {
    const current = { ...(documents.get(target.path) ?? {}) };
    for (const [key, value] of Object.entries(fields)) {
      const [root, child] = key.split('.');
      if (child && (root === 'shipResources' || root === 'shuttleCargo')) {
        current[root] = { ...((current[root] as Fields | undefined) ?? {}), [child]: value };
      } else current[key] = value;
    }
    documents.set(target.path, current);
  });
  const runTransaction = vi.fn(async (callback: (tx: unknown) => unknown) => callback({ get, set, update }));
  return { documents, get, set, update, db: { doc: ref, collection: ref, runTransaction } };
});
vi.mock('firebase-admin/app', () => ({ initializeApp: vi.fn() }));
vi.mock('firebase-admin/firestore', () => ({
  getFirestore: () => mock.db,
  FieldValue: { serverTimestamp: () => 'server-time', delete: () => 'delete-field' },
  Timestamp: class MockTimestamp { constructor(private readonly value: Date) {} static now() { return new MockTimestamp(new Date()); } toDate() { return this.value; } toMillis() { return this.value.getTime(); } },
}));
vi.mock('firebase-functions/v2', () => ({ setGlobalOptions: vi.fn() }));
vi.mock('firebase-functions/v2/https', () => ({
  HttpsError: class HttpsError extends Error { constructor(readonly code: string, message: string) { super(message); } },
  onCall: (handler: (request: unknown) => unknown) => ({ run: handler }),
}));
vi.mock('firebase-functions/v2/scheduler', () => ({ onSchedule: (_s: string, h: (event: unknown) => unknown) => ({ run: h }) }));

import { transferShuttleCargoCommand } from './index';

const command = {
  sessionId: 's1', requestId: 'cargo-1', shuttleId: 'hummingbird', resourceId: 'food',
  direction: 'load', amount: 2, expectedControlRevision: 0,
};
const request = (data: Fields, uid = 'holder') => ({ data, auth: { uid } }) as CallableRequest<Fields>;
const put = (path: string, fields: Fields) => mock.documents.set(path, { ...fields });

beforeEach(() => {
  mock.documents.clear(); mock.get.mockClear(); mock.set.mockClear(); mock.update.mockClear();
  put('sessions/s1', {
    phase: 'active', currentTurn: 1,
    turnPhase: {
      turn: 1, airspace: { state: 'lifted', tickerActive: true, pressAccess: true },
    },
    activeRoleIds: ['quellon-explorer'], activeVesselIds: ['quellon'],
    shuttleDockings: [{ shuttleId: 'hummingbird', shipId: 'quellon', dockedAt: 'now' }],
    shuttleControl: { hummingbird: {
      shuttleId: 'hummingbird', ownerRoleId: 'quellon-explorer', ownerUid: 'owner',
      holderUid: 'holder', revision: 0,
    } },
    shipResources: { quellon: { ore: 0, fuel: 3, food: 10, water: 8, materials: 0, securityTeams: 2 } },
    shuttleCargo: { hummingbird: { food: 1, water: 0 } },
  });
  put('sessions/s1/players/holder', {
    role: 'player', connected: true, assignedRoleId: 'quellon-explorer', fleetGroupId: 'fleet-1',
  });
  put('sessions/s1/players/owner', {
    role: 'player', connected: true, assignedRoleId: 'quellon-explorer', fleetGroupId: 'fleet-1',
  });
  put('sessions/s1/fleetGroups/fleet-1', { id: 'fleet-1', vesselIds: ['quellon'], memberUids: ['holder', 'owner'] });
});

it('moves cargo across both ledgers once and replays without another write', async () => {
  await expect(transferShuttleCargoCommand.run(request(command))).resolves.toMatchObject({
    status: 'committed', hostShipId: 'quellon', shipAmount: 8, shuttleAmount: 3,
  });
  expect(mock.documents.get('sessions/s1')).toMatchObject({
    shipResources: { quellon: expect.objectContaining({ food: 8 }) },
    shuttleCargo: { hummingbird: expect.objectContaining({ food: 3 }) },
  });
  const writes = mock.set.mock.calls.length + mock.update.mock.calls.length;
  mock.documents.get('sessions/s1')!.phase = 'debrief';
  await expect(transferShuttleCargoCommand.run(request(command))).resolves.toMatchObject({ status: 'replayed' });
  expect(mock.set.mock.calls.length + mock.update.mock.calls.length).toBe(writes);
});

it('moves Macaw Scrap between the current host and Macaw atomically', async () => {
  const session = mock.documents.get('sessions/s1')!;
  session.activeRoleIds = ['capybara-captain', 'capybara-recycler'];
  session.activeVesselIds = ['capybara'];
  session.shuttleDockings = [{ shuttleId: 'macaw', shipId: 'capybara', dockedAt: 'now' }];
  session.shuttleControl = { macaw: {
    shuttleId: 'macaw', ownerRoleId: 'capybara-captain', ownerUid: 'holder',
    holderUid: 'holder', revision: 0,
  } };
  session.shipResources = { capybara: {
    ore: 0, fuel: 3, food: 9, water: 4, materials: 0, securityTeams: 2, scrap: 3,
  } };
  session.shuttleCargo = { macaw: { scrap: 1 } };
  mock.documents.get('sessions/s1/players/holder')!.assignedRoleId = 'capybara-captain';
  mock.documents.get('sessions/s1/fleetGroups/fleet-1')!.vesselIds = ['capybara'];

  const macawCommand = { ...command, requestId: 'macaw-scrap', shuttleId: 'macaw', resourceId: 'scrap', amount: 2 };
  await expect(transferShuttleCargoCommand.run(request(macawCommand))).resolves.toMatchObject({
    status: 'committed', hostShipId: 'capybara', shipAmount: 1, shuttleAmount: 3,
  });
  expect(mock.documents.get('sessions/s1')).toMatchObject({
    shipResources: { capybara: expect.objectContaining({ scrap: 1 }) },
    shuttleCargo: { macaw: expect.objectContaining({ scrap: 3 }) },
  });
  expect(mock.update).toHaveBeenCalledTimes(1);
  expect(mock.set.mock.calls.map(([target]) => (target as { path: string }).path).sort()).toEqual([
    'sessions/s1/actionAudits/macaw-scrap', 'sessions/s1/commandReceipts/macaw-scrap',
  ]);
});

it('moves Boa Scrap, and only Scrap, between the Capybara and the Boa atomically', async () => {
  const session = mock.documents.get('sessions/s1')!;
  session.activeRoleIds = ['capybara-captain', 'capybara-recycler'];
  session.activeVesselIds = ['capybara'];
  session.shuttleDockings = [{ shuttleId: 'boa', shipId: 'capybara', dockedAt: 'now' }];
  session.shuttleControl = { boa: {
    shuttleId: 'boa', ownerRoleId: 'capybara-recycler', ownerUid: 'holder', holderUid: 'holder', revision: 0,
  } };
  session.shipResources = { capybara: {
    ore: 0, fuel: 3, food: 9, water: 4, materials: 0, securityTeams: 2, scrap: 3,
  } };
  session.shuttleCargo = { boa: { scrap: 2 } };
  mock.documents.get('sessions/s1/players/holder')!.assignedRoleId = 'capybara-recycler';
  mock.documents.get('sessions/s1/fleetGroups/fleet-1')!.vesselIds = ['capybara'];

  const boaCommand = { ...command, requestId: 'boa-scrap', shuttleId: 'boa', resourceId: 'scrap',
    direction: 'unload', amount: 2 };
  await expect(transferShuttleCargoCommand.run(request(boaCommand))).resolves.toMatchObject({
    status: 'committed', hostShipId: 'capybara', shipAmount: 5, shuttleAmount: 0,
  });
  expect(mock.documents.get('sessions/s1')).toMatchObject({
    shipResources: { capybara: expect.objectContaining({ scrap: 5 }) },
    shuttleCargo: { boa: expect.objectContaining({ scrap: 0 }) },
  });
  await expect(transferShuttleCargoCommand.run(request({ ...boaCommand, requestId: 'boa-food',
    resourceId: 'food', direction: 'load' }))).rejects.toMatchObject({ code: expect.any(String) });
});

it.each([
  ['foreign holder', 'owner', command],
  ['forbidden type', 'holder', { ...command, requestId: 'ore', resourceId: 'ore' }],
  ['negative amount', 'holder', { ...command, requestId: 'negative', amount: -1 }],
] as const)('rejects %s without mutation', async (_label, uid, data) => {
  await expect(transferShuttleCargoCommand.run(request(data, uid))).rejects.toMatchObject({
    code: expect.stringMatching(/invalid-argument|permission-denied|failed-precondition/),
  });
  expect(mock.set).not.toHaveBeenCalled(); expect(mock.update).not.toHaveBeenCalled();
});

it('returns only target-bound current control revision for the still-authorized holder without a receipt or ledger write', async () => {
  const stale = {
    ...command, requestId: 'stale-control', expectedControlRevision: 0,
  };
  mock.documents.get('sessions/s1')!.shuttleControl = { hummingbird: {
    shuttleId: 'hummingbird', ownerRoleId: 'quellon-explorer', ownerUid: 'owner',
    holderUid: 'holder', revision: 1,
  } };

  await expect(transferShuttleCargoCommand.run(request(stale))).resolves.toEqual({
    status: 'stale', sessionId: 's1', requestId: 'stale-control', shuttleId: 'hummingbird',
    hostShipId: 'quellon', resourceId: 'food', direction: 'load', amount: 2,
    expectedControlRevision: 0, currentControlRevision: 1,
  });
  expect(mock.set).not.toHaveBeenCalled();
  expect(mock.update).not.toHaveBeenCalled();
  expect([...mock.documents.keys()].some((path) => path.includes('commandReceipts'))).toBe(false);
});

it('does not disclose a stale revision after the actor loses current shuttle-holder authority', async () => {
  mock.documents.get('sessions/s1')!.shuttleControl = { hummingbird: {
    shuttleId: 'hummingbird', ownerRoleId: 'quellon-explorer', ownerUid: 'owner',
    holderUid: 'owner', revision: 1,
  } };

  await expect(transferShuttleCargoCommand.run(request({
    ...command, requestId: 'lost-holder',
  }))).rejects.toMatchObject({ code: 'failed-precondition' });
  expect(mock.set).not.toHaveBeenCalled();
  expect(mock.update).not.toHaveBeenCalled();
});

it('rejects cargo movement outside the live Coordination phase without mutation', async () => {
  mock.documents.get('sessions/s1')!.turnPhase = {
    turn: 1, airspace: { state: 'restricted', tickerActive: true, pressAccess: false },
  };

  await expect(transferShuttleCargoCommand.run(request({
    ...command, requestId: 'wrong-phase',
  }))).rejects.toMatchObject({ code: 'failed-precondition' });
  expect(mock.set).not.toHaveBeenCalled();
  expect(mock.update).not.toHaveBeenCalled();
});

it('rejects cargo movement when the authoritative phase clock is absent without mutation', async () => {
  delete mock.documents.get('sessions/s1')!.turnPhase;

  await expect(transferShuttleCargoCommand.run(request({
    ...command, requestId: 'missing-phase-clock',
  }))).rejects.toMatchObject({
    code: 'failed-precondition',
    message: expect.stringMatching(/no current server phase/i),
  });
  expect(mock.set).not.toHaveBeenCalled();
  expect(mock.update).not.toHaveBeenCalled();
});

it('rejects transit, cross-group host, and insufficient inventory without mutation', async () => {
  const session = mock.documents.get('sessions/s1')!;
  session.shuttleDockings = [];
  await expect(transferShuttleCargoCommand.run(request({ ...command, requestId: 'transit' }))).rejects.toMatchObject({ code: 'failed-precondition' });
  session.shuttleDockings = [{ shuttleId: 'hummingbird', shipId: 'quellon', dockedAt: 'now' }];
  mock.documents.get('sessions/s1/fleetGroups/fleet-1')!.vesselIds = [];
  await expect(transferShuttleCargoCommand.run(request({ ...command, requestId: 'foreign' }))).rejects.toMatchObject({ code: 'failed-precondition' });
  mock.documents.get('sessions/s1/fleetGroups/fleet-1')!.vesselIds = ['quellon'];
  await expect(transferShuttleCargoCommand.run(request({ ...command, requestId: 'short', amount: 11 }))).rejects.toMatchObject({ code: 'failed-precondition' });
  expect(mock.set).not.toHaveBeenCalled(); expect(mock.update).not.toHaveBeenCalled();
});

it('rejects missing authoritative ship inventory without restoring seeded resources', async () => {
  mock.documents.get('sessions/s1')!.shipResources = {};
  await expect(transferShuttleCargoCommand.run(request({
    ...command, requestId: 'missing-inventory',
  }))).rejects.toMatchObject({ code: 'failed-precondition' });
  expect(mock.set).not.toHaveBeenCalled();
  expect(mock.update).not.toHaveBeenCalled();
});

it('rejects a stale player fleet-group pointer after canonical membership is removed', async () => {
  mock.documents.get('sessions/s1/fleetGroups/fleet-1')!.memberUids = ['owner'];
  await expect(transferShuttleCargoCommand.run(request({
    ...command, requestId: 'removed-member',
  }))).rejects.toMatchObject({ code: 'failed-precondition' });
  expect(mock.set).not.toHaveBeenCalled();
  expect(mock.update).not.toHaveBeenCalled();
});

it('lets the Colonel holding Chepu move only security teams with its Refinery host once', async () => {
  const session = mock.documents.get('sessions/s1')!;
  session.activeRoleIds = ['refinery-124-pdf-colonel'];
  session.activeVesselIds = ['refinery-124'];
  session.shuttleDockings = [{ shuttleId: 'chepu', shipId: 'refinery-124', dockedAt: 'now' }];
  session.shuttleControl = { chepu: {
    shuttleId: 'chepu', ownerRoleId: 'refinery-124-pdf-colonel', ownerUid: 'holder',
    holderUid: 'holder', revision: 2,
  } };
  session.shipResources = { 'refinery-124': {
    ore: 0, fuel: 3, food: 10, water: 8, materials: 0, securityTeams: 4,
  } };
  session.shuttleCargo = { chepu: { securityTeams: 1 } };
  mock.documents.get('sessions/s1/players/holder')!.assignedRoleId = 'refinery-124-pdf-colonel';
  mock.documents.get('sessions/s1/players/owner')!.assignedRoleId = 'refinery-124-pdf-colonel';
  mock.documents.get('sessions/s1/fleetGroups/fleet-1')!.vesselIds = ['refinery-124'];
  const chepuCommand = {
    ...command, requestId: 'chepu-teams', shuttleId: 'chepu', resourceId: 'securityTeams',
    amount: 2, expectedControlRevision: 2,
  };

  for (const [uid, data, message] of [
    ['owner', { ...chepuCommand, requestId: 'chepu-not-holder' }, /current shuttle holder/i],
    ['holder', { ...chepuCommand, requestId: 'chepu-food', resourceId: 'food' }, /printed cargo rule/i],
  ] as const) {
    await expect(transferShuttleCargoCommand.run(request(data, uid))).rejects.toMatchObject({
      code: expect.stringMatching(/invalid-argument|permission-denied|failed-precondition/),
      message: expect.stringMatching(message),
    });
  }
  expect(mock.set).not.toHaveBeenCalled(); expect(mock.update).not.toHaveBeenCalled();

  await expect(transferShuttleCargoCommand.run(request(chepuCommand))).resolves.toMatchObject({
    status: 'committed', hostShipId: 'refinery-124', resourceId: 'securityTeams',
    shipAmount: 2, shuttleAmount: 3,
  });
  expect(mock.documents.get('sessions/s1')).toMatchObject({
    shipResources: { 'refinery-124': expect.objectContaining({ securityTeams: 2, food: 10 }) },
    shuttleCargo: { chepu: { securityTeams: 3 } },
  });
  const writes = mock.set.mock.calls.length + mock.update.mock.calls.length;
  await expect(transferShuttleCargoCommand.run(request(chepuCommand))).resolves.toMatchObject({ status: 'replayed' });
  expect(mock.set.mock.calls.length + mock.update.mock.calls.length).toBe(writes);
  expect(mock.documents.get('sessions/s1')).toMatchObject({
    shuttleCargo: { chepu: { securityTeams: 3 } },
  });
});

const auditPath = 'sessions/s1/actionAudits/cargo-1';

it('records one attributable cargo audit with its original actor, request, phase and revision', async () => {
  await transferShuttleCargoCommand.run(request(command));
  expect(mock.documents.get(auditPath)).toEqual({
    schemaVersion: 1, sessionId: 's1', actorUid: 'holder', actorRoleId: 'quellon-explorer',
    action: 'shuttle-cargo-transfer', phase: 'active', requestId: 'cargo-1', revision: 0,
    outcome: 'committed', resolutionSource: 'server-rules',
    redactionPolicy: 'action-audit-metadata-only-v1', createdAt: 'server-time',
  });
  const audit = mock.documents.get(auditPath);
  mock.set.mockClear(); mock.update.mockClear();
  await expect(transferShuttleCargoCommand.run(request(command))).resolves.toMatchObject({ status: 'replayed' });
  expect(mock.set).not.toHaveBeenCalled();
  expect(mock.documents.get(auditPath)).toBe(audit);
});

it('writes no cargo audit for a denied actor or a stale control revision', async () => {
  await expect(transferShuttleCargoCommand.run(request(command, 'owner'))).rejects.toMatchObject({
    code: expect.any(String),
  });
  mock.documents.get('sessions/s1')!.shuttleControl = { hummingbird: {
    shuttleId: 'hummingbird', ownerRoleId: 'quellon-explorer', ownerUid: 'owner',
    holderUid: 'holder', revision: 1,
  } };
  await expect(transferShuttleCargoCommand.run(request(command))).resolves.toMatchObject({ status: 'stale' });
  expect([...mock.documents.keys()].some((path) => path.includes('/actionAudits/'))).toBe(false);
});

it('fails closed on an orphaned cargo audit or a mismatched audit on replay', async () => {
  put(auditPath, { action: 'shuttle-cargo-transfer' });
  await expect(transferShuttleCargoCommand.run(request(command))).rejects.toMatchObject({ code: 'failed-precondition' });
  expect(mock.update).not.toHaveBeenCalled();

  mock.documents.delete(auditPath);
  await transferShuttleCargoCommand.run(request(command));
  mock.documents.get(auditPath)!.actorUid = 'owner';
  await expect(transferShuttleCargoCommand.run(request(command))).rejects.toMatchObject({ code: 'failed-precondition' });
});

it('replays a receipt that predates standardized audits without inventing its metadata', async () => {
  await transferShuttleCargoCommand.run(request(command));
  mock.documents.delete(auditPath);
  mock.set.mockClear();
  await expect(transferShuttleCargoCommand.run(request(command))).resolves.toMatchObject({ status: 'replayed' });
  expect(mock.set).not.toHaveBeenCalled();
  expect(mock.documents.has(auditPath)).toBe(false);
});

it('keeps the explicit choice and committed result in one facilitator-only receipt that replay never rewrites', async () => {
  const detailPath = 'sessions/s1/actionAuditDetails/cargo-1';
  const committed = await transferShuttleCargoCommand.run(request(command));
  expect(committed).toMatchObject({ status: 'committed' });
  expect(mock.documents.get(detailPath)).toEqual({
    schemaVersion: 1, sessionId: 's1', actorUid: 'holder', action: 'shuttle-cargo-transfer', requestId: 'cargo-1',
    revision: expect.any(Number), resolutionSource: 'server-rules', audience: 'facilitator',
    choice: expect.objectContaining({ shuttleId: 'hummingbird', resourceId: 'food', direction: 'load', amount: 2 }),
    result: committed,
    redactionPolicy: 'action-audit-gm-detail-v1', createdAt: 'server-time',
  });
  expect(mock.documents.get(detailPath)!.revision)
    .toBe(mock.documents.get('sessions/s1/actionAudits/cargo-1')!.revision);
  const detail = mock.documents.get(detailPath);
  mock.set.mockClear(); mock.update.mockClear();
  await expect(transferShuttleCargoCommand.run(request(command))).resolves.toMatchObject({ status: 'replayed' });
  expect(mock.set).not.toHaveBeenCalled();
  expect(mock.documents.get(detailPath)).toBe(detail);
});

it('writes no facilitator receipt detail for a denied actor', async () => {
  await expect(transferShuttleCargoCommand.run(request(command, 'owner'))).rejects.toMatchObject({ code: expect.any(String) });
  expect([...mock.documents.keys()].some((path) => path.includes('/actionAuditDetails/'))).toBe(false);
});
