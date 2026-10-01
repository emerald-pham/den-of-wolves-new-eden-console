import { HttpsError } from 'firebase-functions/v2/https';
import { describe, expect, it, vi } from 'vitest';
import { activeVesselIdsForRoles } from './gameSetup';
import { createBoardingSecurityTeamCallable } from './boardingSecurityTeamCallable';
import { initialShuttleDockingsForRoles, initialShuttleVisitsForDockings } from './shuttlecraft';
import { craftStartingManifestForSetup } from './craftOwnership';

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

describe('authenticated boarding-security location read', () => {
  it('derives strict ship totals, current docked shuttle locations, and a cycle-bound GM projection', async () => {
    const { callable, facilitator, transaction } = fixture();

    await expect(callable({
      auth: { uid: actorUid },
      data: { sessionId, instanceId },
    })).resolves.toMatchObject({
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
});
