import { HttpsError } from 'firebase-functions/v2/https';
import { describe, expect, it, vi } from 'vitest';
import { activeVesselIdsForRoles } from './gameSetup';
import { createBoardingSecurityTeamCallable } from './boardingSecurityTeamCallable';
import { initialShuttleDockingsForRoles, initialShuttleVisitsForDockings } from './shuttlecraft';
import { craftStartingManifestForSetup } from './craftOwnership';
import { enterShuttleTransit, toPublicShuttleTransit, toShuttleTransitChain } from './shuttleTransit';

const roles = ['admiral', 'executive-officer', 'dione-engineer'];
const vesselMode = 'none';
const dockings = initialShuttleDockingsForRoles(roles);
const shuttleIds = craftStartingManifestForSetup(roles, vesselMode, dockings).entries
  .filter((entry) => entry.kind === 'shuttle').map((entry) => entry.id);
const loadedShuttle = dockings.find((entry) => entry.shuttleId === 'pallas')!;
const sessionId = 'security-session';
const actorUid = 'active-gm';
const instanceId = 'gm-tab-current';

type Snapshot = Readonly<{
  exists: boolean;
  id: string;
  get(field: string): unknown;
  data(): unknown;
}>;

function snapshot(id: string, data: Record<string, unknown>): Snapshot {
  return {
    exists: true,
    id,
    get: (field) => data[field],
    data: () => data,
  };
}

function sessionData(overrides: Record<string, unknown> = {}) {
  return {
    phase: 'active',
    currentTurn: 4,
    activeRoleIds: roles,
    activeVesselIds: activeVesselIdsForRoles(roles),
    shuttleVisitLog: initialShuttleVisitsForDockings(dockings),
    retainedShuttles: {},
    shuttleControl: {},
    shipDamage: {},
    shipResources: Object.fromEntries(activeVesselIdsForRoles(roles)
      .map((shipId) => [shipId, { securityTeams: 2 }])),
    shuttleCargo: { [loadedShuttle.shuttleId]: { securityTeams: 3 } },
    shuttleDockings: dockings,
    ...overrides,
  };
}

function fixture(overrides: Record<string, unknown> = {}) {
  const session = snapshot(sessionId, sessionData(overrides));
  const manifest = snapshot('manifest', {
    vesselMode,
    startingCraft: craftStartingManifestForSetup(roles, vesselMode, dockings),
  });
  const transaction = {
    get: vi.fn(async () => manifest),
    set: vi.fn(() => { throw new Error('A location read must not write.'); }),
    update: vi.fn(() => { throw new Error('A location read must not write.'); }),
    create: vi.fn(() => { throw new Error('A location read must not write.'); }),
    delete: vi.fn(() => { throw new Error('A location read must not write.'); }),
  };
  const db = {
    doc: vi.fn((path: string) => path),
    runTransaction: vi.fn(async <T>(work: (tx: unknown) => Promise<T>) => work(transaction)),
  };
  const facilitator = vi.fn(async () => ({ session }));
  const callable = createBoardingSecurityTeamCallable({
    db,
    requireUid: vi.fn(() => actorUid),
    requireFacilitatorInstance: facilitator,
  });
  return { callable, db, facilitator, transaction, session, manifest };
}

const movingShuttleId = 'starlight';
function movingFixture() {
  // Same confirmed role tuple as the retained ordinary eight-role native flow.
  const movingRoles = ['admiral', 'wing-commander', 'icebreaker-miner', 'shepherd-scientist',
    'quellon-explorer', 'refinery-124-pdf-colonel', 'joint-engineering-quellon-refinery',
    'joint-engineering-shepherd-icebreaker'];
  const initialDockings = initialShuttleDockingsForRoles(movingRoles);
  const holderUid = 'ordinary-shuttle-holder';
  const control = { shuttleId: movingShuttleId, ownerRoleId: 'wing-commander',
    ownerUid: holderUid, holderUid, revision: 0 };
  const now = Date.parse('2026-10-12T12:00:05.813Z');
  const moved = enterShuttleTransit({
    transitRequestId: 'normal-transit', actorUid: holderUid,
    expectedDepartureRequestId: 'normal-departure', expectedControlRevision: 0, expectedCycle: 1,
    departure: { status: 'requested', requestId: 'normal-departure',
      shuttleId: movingShuttleId, holderUid, fleetGroupId: 'fleet-1',
      originShipId: 'aegis', destinationShipId: 'icebreaker', cycle: 1,
      controlRevision: 0, requestedAt: '2026-10-12T11:59:28.557Z' },
    control, dockings: initialDockings,
    group: { id: 'fleet-1', vesselIds: activeVesselIdsForRoles(movingRoles), memberUids: [holderUid] },
    phase: { turn: 1, teamPhaseEndsAt: '2026-10-12T11:56:59.543Z',
      openAirspaceEndsAt: '2026-10-12T12:21:59.543Z',
      airspace: { state: 'lifted', tickerActive: true, pressAccess: true } }, now,
  });
  const session = snapshot(sessionId, {
    phase: 'active', currentTurn: 1, activeRoleIds: movingRoles,
    activeVesselIds: activeVesselIdsForRoles(movingRoles),
    shuttleVisitLog: initialShuttleVisitsForDockings(initialDockings), retainedShuttles: {},
    shuttleControl: { [movingShuttleId]: control }, shipDamage: {},
    shipResources: Object.fromEntries(activeVesselIdsForRoles(movingRoles)
      .map(shipId => [shipId, { securityTeams: 2 }])),
    shuttleCargo: { chepu: { securityTeams: 3 } }, shuttleDockings: moved.dockings,
  });
  const movement = toPublicShuttleTransit(moved.transit);
  const chain = toShuttleTransitChain(moved.transit);
  const documents = new Map<string, Snapshot>([
    [`sessions/${sessionId}/craftOwnership/manifest`, snapshot('manifest', {
      vesselMode, startingCraft: craftStartingManifestForSetup(movingRoles, vesselMode, initialDockings) })],
    [`sessions/${sessionId}/shuttleDepartures/${movingShuttleId}`, snapshot(movingShuttleId, movement)],
    [`sessions/${sessionId}/shuttleTransitChains/${movingShuttleId}`, snapshot(movingShuttleId, chain)],
  ]);
  const transaction = {
    get: vi.fn(async (target: unknown) => documents.get(String(target)) ?? {
      exists: false, id: String(target).split('/').at(-1)!, get: () => undefined, data: () => undefined,
    }),
    set: vi.fn(() => { throw new Error('A location read must not write.'); }),
    update: vi.fn(() => { throw new Error('A location read must not write.'); }),
    create: vi.fn(() => { throw new Error('A location read must not write.'); }),
    delete: vi.fn(() => { throw new Error('A location read must not write.'); }),
  };
  const db = { doc: vi.fn((path: string) => path),
    runTransaction: vi.fn(async <T>(work: (tx: unknown) => Promise<T>) => work(transaction)) };
  const callable = createBoardingSecurityTeamCallable({ db, requireUid: vi.fn(() => actorUid),
    requireFacilitatorInstance: vi.fn(async () => ({ session })) });
  return { callable, transaction, documents, movement, chain, moved, session, initialDockings };
}

describe('authenticated boarding-security location read', () => {
  it('derives strict ship totals, current docked shuttle locations, and a cycle-bound GM projection', async () => {
    const { callable, facilitator, transaction } = fixture();

    const result = await callable({
      auth: { uid: actorUid },
      data: { sessionId, instanceId },
    });
    expect(result).toMatchObject({
      status: 'ready', sessionId, actorUid, gmInstanceId: instanceId, cycle: 4,
      ships: expect.arrayContaining([
        expect.objectContaining({ shipId: loadedShuttle.shipId, shipSecurityTeams: 2 }),
      ]),
      shuttles: expect.arrayContaining([
        expect.objectContaining({
          shuttleId: loadedShuttle.shuttleId,
          securityTeams: 3,
          location: 'docked',
          currentHostShipId: loadedShuttle.shipId,
        }),
      ]),
    });
    expect(result.shuttles.map((shuttle) => shuttle.shuttleId)).toEqual(shuttleIds);
    expect(facilitator).toHaveBeenCalledWith(
      expect.anything(), sessionId, actorUid, instanceId,
    );
    expect(transaction.set).not.toHaveBeenCalled();
    expect(transaction.update).not.toHaveBeenCalled();
    expect(transaction.create).not.toHaveBeenCalled();
    expect(transaction.delete).not.toHaveBeenCalled();
  });

  it('returns counted security teams for an undocked shuttle without assigning host eligibility', async () => {
    const { callable } = fixture({
      shuttleDockings: dockings.filter((entry) => entry.shuttleId !== loadedShuttle.shuttleId),
      shuttleVisitLog: [
        ...initialShuttleVisitsForDockings(dockings),
        {
          id: 'departure', shuttleId: loadedShuttle.shuttleId, shipId: loadedShuttle.shipId,
          action: 'departed', occurredAt: '2026-09-30T12:00:00.000Z',
        },
      ],
    });

    const result = await callable({ auth: { uid: actorUid }, data: { sessionId, instanceId } });
    const shuttle = result.shuttles.find((entry) => entry.shuttleId === loadedShuttle.shuttleId);
    expect(shuttle).toMatchObject({
      securityTeams: 3, location: 'undocked', currentHostShipId: null,
    });
    expect(result.ships.every((entry) => entry.boardingEligibleTeams === entry.shipSecurityTeams)).toBe(true);
  });

  it('reads valid in-transit teams after the real transit producer removes the dock before arrival writes visits', async () => {
    const { callable, transaction, moved, session, initialDockings } = movingFixture();
    const fields = session.data() as Record<string, unknown>;
    fields.shuttleDockings = initialDockings;
    await expect(callable({ auth: { uid: actorUid }, data: { sessionId, instanceId } }))
      .resolves.toMatchObject({ status: 'ready' });
    fields.shuttleDockings = moved.dockings;
    // beginShuttleTransit removes the dock and stores movement/chain; only arrival writes the visit pair.
    expect(moved.dockings.some(row => row.shuttleId === movingShuttleId)).toBe(false);
    const result = await callable({ auth: { uid: actorUid }, data: { sessionId, instanceId } });
    expect(result.shuttles.find(row => row.shuttleId === movingShuttleId)).toMatchObject({
      securityTeams: 0, location: 'undocked', currentHostShipId: null,
    });
    expect(result.ships.find(row => row.shipId === 'aegis')?.boardingEligibleTeams).toBe(2);
    expect(result.ships.find(row => row.shipId === 'refinery-124')?.boardingEligibleTeams).toBe(5);
    expect(result.totals.aboardDockedShuttleSecurityTeams).toBe(3);
    expect(JSON.stringify(result)).not.toMatch(/ordinary-shuttle-holder|routeLegs|originShipId|transitRequestId/);
    expect(transaction.set).not.toHaveBeenCalled();
    expect(transaction.update).not.toHaveBeenCalled();
    expect(transaction.create).not.toHaveBeenCalled();
    expect(transaction.delete).not.toHaveBeenCalled();
  });

  it.each(['missing movement', 'missing chain', 'changed chain', 'foreign holder', 'stale control', 'future cycle'])(
    'keeps %s denied instead of treating missing docking as transit', async fault => {
      const f = movingFixture();
      const movementPath = `sessions/${sessionId}/shuttleDepartures/${movingShuttleId}`;
      const chainPath = `sessions/${sessionId}/shuttleTransitChains/${movingShuttleId}`;
      if (fault === 'missing movement') f.documents.delete(movementPath);
      if (fault === 'missing chain') f.documents.delete(chainPath);
      if (fault === 'changed chain') f.documents.set(chainPath,
        snapshot(movingShuttleId, { ...f.chain, revision: 2 }));
      const patch = fault === 'foreign holder' ? { holderUid: 'foreign-holder' }
        : fault === 'stale control' ? { controlRevision: 1 }
        : fault === 'future cycle' ? { cycle: 99 } : {};
      if (Object.keys(patch).length) f.documents.set(movementPath,
        snapshot(movingShuttleId, { ...f.movement, ...patch }));
      await expect(f.callable({ auth: { uid: actorUid }, data: { sessionId, instanceId } }))
        .rejects.toMatchObject({ code: 'failed-precondition' });
      expect(f.transaction.set).not.toHaveBeenCalled();
      expect(f.transaction.update).not.toHaveBeenCalled();
    });

  it('rejects unknown request keys and incomplete active-session authority', async () => {
    const { callable } = fixture();
    await expect(callable({
      auth: { uid: actorUid }, data: { sessionId, instanceId, shipId: 'aegis' },
    })).rejects.toMatchObject({ code: 'invalid-argument' });

    const malformed = fixture({ shipResources: { aegis: { securityTeams: 2 } } });
    await expect(malformed.callable({
      auth: { uid: actorUid }, data: { sessionId, instanceId },
    })).rejects.toMatchObject({ code: 'failed-precondition' });
  });

  it.each([
    ['not a member or GM', 'permission-denied'],
    ['stale GM instance lease', 'failed-precondition'],
  ])('delegates %s rejection to the live facilitator authority check', async (_label, code) => {
    const { callable, facilitator } = fixture();
    facilitator.mockRejectedValueOnce(new HttpsError(code as never, 'Rejected by live GM authority.'));

    await expect(callable({
      auth: { uid: actorUid }, data: { sessionId, instanceId },
    })).rejects.toMatchObject({ code });
  });

  it('does not read the craft manifest when live GM authority rejects the request', async () => {
    const { callable, facilitator, transaction } = fixture();
    facilitator.mockRejectedValueOnce(new HttpsError('permission-denied', 'Not the active GM.'));

    await expect(callable({
      auth: { uid: actorUid },
      data: { sessionId, instanceId },
    })).rejects.toMatchObject({ code: 'permission-denied' });
    expect(transaction.get).not.toHaveBeenCalled();
  });
});
