import { describe, expect, it } from 'vitest';
import { craftStartingManifestForSetup } from './craftOwnership';
import { activeVesselIdsForRoles } from './gameSetup';
import { recommendedRoleIds } from './roleConfiguration';
import { boardingSecurityTeamAuthority } from './boardingSecurityTeams';
import { initialShuttleDockingsForRoles, initialShuttleVisitsForDockings } from './shuttlecraft';

const activeRoleIds = ['admiral', 'executive-officer', 'dione-engineer'];
const vesselMode = 'none';
const startingDockings = initialShuttleDockingsForRoles(activeRoleIds);
const movedVisits = [
  { id: 'pallas-departed-aegis', shuttleId: 'pallas', shipId: 'aegis', action: 'departed' as const, occurredAt: 'later' },
  { id: 'pallas-docked-dione', shuttleId: 'pallas', shipId: 'dione', action: 'docked' as const, occurredAt: 'later' },
  { id: 'philia-departed-dione', shuttleId: 'philia', shipId: 'dione', action: 'departed' as const, occurredAt: 'later' },
  { id: 'philia-docked-aegis', shuttleId: 'philia', shipId: 'aegis', action: 'docked' as const, occurredAt: 'later' },
];
const base = {
  activeRoleIds,
  activeVesselIds: ['aegis', 'dione'],
  vesselMode,
  startingCraftManifest: craftStartingManifestForSetup(
    activeRoleIds,
    vesselMode,
    startingDockings,
  ),
  shuttleVisitLog: [...initialShuttleVisitsForDockings(startingDockings), ...movedVisits],
  retainedShuttles: {},
  shuttleControl: {},
  shipDamage: {},
  shipResources: {
    aegis: { securityTeams: 6 },
    dione: { securityTeams: 2 },
  },
  shuttleCargo: {
    pallas: { securityTeams: 3 },
    philia: { securityTeams: 1, food: 2 },
  },
  shuttleDockings: startingDockings.map((docking) => {
    if (docking.shuttleId === 'pallas') return { ...docking, shipId: 'dione', dockedAt: 'now' };
    if (docking.shuttleId === 'philia') return { ...docking, shipId: 'aegis', dockedAt: 'now' };
    return docking;
  }),
};

function resourcesForRoles(roleIds: readonly string[]): Record<string, { securityTeams: number }> {
  return Object.fromEntries(activeVesselIdsForRoles(roleIds)
    .map((shipId) => [shipId, { securityTeams: 2 }]));
}

describe('security-team location and boarding authority', () => {
  it('derives the shuttle manifest and adds docked teams only to their host', () => {
    const authority = boardingSecurityTeamAuthority(base);
    expect(authority.shipSecurityTeams).toEqual({ aegis: 6, dione: 2 });
    expect(authority.shuttleSecurityTeams).toMatchObject({
      pallas: 3,
      philia: 1,
      maliades: 0,
      'snn-press-shuttle': 0,
    });
    expect(authority.boardingSecurityTeamsByHost).toEqual({ aegis: 7, dione: 5 });
  });

  it('moves boarding eligibility with the authoritative dock without changing either inventory', () => {
    const authority = boardingSecurityTeamAuthority({
      ...base,
      shuttleVisitLog: [...base.shuttleVisitLog,
        { id: 'pallas-departed-dione', shuttleId: 'pallas', shipId: 'dione', action: 'departed', occurredAt: 'latest' },
        { id: 'pallas-docked-aegis', shuttleId: 'pallas', shipId: 'aegis', action: 'docked', occurredAt: 'latest' },
      ],
      shuttleDockings: base.shuttleDockings.map((docking) => docking.shuttleId === 'pallas'
        ? { ...docking, shipId: 'aegis', dockedAt: 'latest' }
        : docking),
    });
    expect(authority.shipSecurityTeams).toEqual({ aegis: 6, dione: 2 });
    expect(authority.shuttleSecurityTeams).toMatchObject({ pallas: 3, philia: 1 });
    expect(authority.boardingSecurityTeamsByHost).toEqual({ aegis: 10, dione: 2 });
  });

  it('keeps teams countable in an undocked shuttle but ineligible at every host', () => {
    const authority = boardingSecurityTeamAuthority({
      ...base,
      shuttleVisitLog: [...base.shuttleVisitLog,
        { id: 'pallas-departed-dione', shuttleId: 'pallas', shipId: 'dione', action: 'departed', occurredAt: 'latest' },
      ],
      shuttleDockings: base.shuttleDockings.filter((docking) => docking.shuttleId !== 'pallas'),
    });
    expect(authority.shuttleSecurityTeams.pallas).toBe(3);
    expect(authority.boardingSecurityTeamsByHost).toEqual({ aegis: 7, dione: 2 });
  });

  it('keeps teams countable and host-ineligible when destruction retains their shuttle', () => {
    const authority = boardingSecurityTeamAuthority({
      ...base,
      shuttleDockings: base.shuttleDockings.filter((docking) => docking.shuttleId !== 'pallas'),
      retainedShuttles: {
        pallas: {
          status: 'retained',
          shuttleId: 'pallas',
          ownerRoleId: 'executive-officer',
          holderUid: 'xo-player',
          destroyedHostShipId: 'dione',
          controlRevision: 2,
          retainedAt: '2026-09-21T20:50:00.000Z',
        },
      },
      shuttleControl: {
        pallas: {
          shuttleId: 'pallas', ownerRoleId: 'executive-officer', ownerUid: 'xo-player',
          holderUid: 'xo-player', revision: 2,
        },
      },
      shipDamage: { dione: { damagedSystemIds: [], destroyed: true } },
    });
    expect(authority.shuttleSecurityTeams.pallas).toBe(3);
    expect(authority.boardingSecurityTeamsByHost).toEqual({ aegis: 7, dione: 2 });
  });

  it('rejects retained custody when the named host is still alive', () => {
    expect(() => boardingSecurityTeamAuthority({
      ...base,
      shuttleDockings: base.shuttleDockings.filter((docking) => docking.shuttleId !== 'pallas'),
      retainedShuttles: {
        pallas: {
          status: 'retained', shuttleId: 'pallas', ownerRoleId: 'executive-officer',
          holderUid: 'xo-player', destroyedHostShipId: 'dione', controlRevision: 2,
          retainedAt: '2026-09-21T20:50:00.000Z',
        },
      },
      shuttleControl: {
        pallas: {
          shuttleId: 'pallas', ownerRoleId: 'executive-officer', ownerUid: 'xo-player',
          holderUid: 'xo-player', revision: 2,
        },
      },
      shipDamage: { dione: { damagedSystemIds: [], destroyed: false } },
    })).toThrow();
  });

  it('rejects malformed destroyed-host damage authority', () => {
    expect(() => boardingSecurityTeamAuthority({
      ...base,
      shuttleDockings: base.shuttleDockings.filter((docking) => docking.shuttleId !== 'pallas'),
      retainedShuttles: {
        pallas: {
          status: 'retained', shuttleId: 'pallas', ownerRoleId: 'executive-officer',
          holderUid: 'xo-player', destroyedHostShipId: 'dione', controlRevision: 2,
          retainedAt: '2026-09-21T20:50:00.000Z',
        },
      },
      shuttleControl: {
        pallas: {
          shuttleId: 'pallas', ownerRoleId: 'executive-officer', ownerUid: 'xo-player',
          holderUid: 'xo-player', revision: 2,
        },
      },
      shipDamage: { dione: { damagedSystemIds: [], destroyed: true, extra: true } },
    })).toThrow();
  });

  it('accepts Wobbly only at a legal active joint-engineering host', () => {
    const roles = recommendedRoleIds(8);
    const vessels = activeVesselIdsForRoles(roles);
    const startingDockings = [
      ...initialShuttleDockingsForRoles(roles),
      { shuttleId: 'wobbly', shipId: 'quellon', dockedAt: 'SESSION START' },
    ];
    const authority = boardingSecurityTeamAuthority({
      activeRoleIds: roles,
      activeVesselIds: vessels,
      vesselMode,
      startingCraftManifest: craftStartingManifestForSetup(roles, vesselMode, startingDockings),
      shuttleVisitLog: initialShuttleVisitsForDockings(startingDockings),
      retainedShuttles: {},
      shuttleControl: {},
      shipDamage: {},
      shipResources: resourcesForRoles(roles),
      shuttleCargo: { wobbly: { securityTeams: 3 } },
      shuttleDockings: startingDockings,
    });
    expect(authority.boardingSecurityTeamsByHost.quellon).toBe(5);
  });

  it('keeps an enabled Wobbly countable while it is in transit', () => {
    const roles = recommendedRoleIds(8);
    const vessels = activeVesselIdsForRoles(roles);
    const startingDockings = [
      ...initialShuttleDockingsForRoles(roles),
      { shuttleId: 'wobbly', shipId: 'quellon', dockedAt: 'SESSION START' },
    ];
    const authority = boardingSecurityTeamAuthority({
      activeRoleIds: roles,
      activeVesselIds: vessels,
      vesselMode,
      startingCraftManifest: craftStartingManifestForSetup(roles, vesselMode, startingDockings),
      shuttleVisitLog: [
        ...initialShuttleVisitsForDockings(startingDockings),
        { id: 'wobbly-departed', shuttleId: 'wobbly', shipId: 'quellon', action: 'departed', occurredAt: 'now' },
      ],
      retainedShuttles: {},
      shuttleControl: {},
      shipDamage: {},
      shipResources: resourcesForRoles(roles),
      shuttleCargo: { wobbly: { securityTeams: 3 } },
      shuttleDockings: startingDockings.filter((docking) => docking.shuttleId !== 'wobbly'),
    });
    expect(authority.shuttleSecurityTeams.wobbly).toBe(3);
    expect(Object.values(authority.boardingSecurityTeamsByHost)).toEqual(
      Object.values(resourcesForRoles(roles)).map(({ securityTeams }) => securityTeams),
    );
  });

  it('returns immutable location and eligibility records', () => {
    const authority = boardingSecurityTeamAuthority(base);
    expect(Object.isFrozen(authority)).toBe(true);
    expect(Object.isFrozen(authority.shipSecurityTeams)).toBe(true);
    expect(Object.isFrozen(authority.shuttleSecurityTeams)).toBe(true);
    expect(Object.isFrozen(authority.boardingSecurityTeamsByHost)).toBe(true);
  });

  it.each([
    ['missing host', { shipResources: { aegis: { securityTeams: 6 } } }],
    ['extra host', {
      shipResources: { ...base.shipResources, shepherd: { securityTeams: 2 } },
    }],
    ['role/vessel mismatch', { activeVesselIds: ['aegis'] }],
    ['negative host count', {
      shipResources: { ...base.shipResources, aegis: { securityTeams: -1 } },
    }],
    ['unknown shuttle cargo', {
      shuttleCargo: { ...base.shuttleCargo, ghost: { securityTeams: 2 } },
    }],
    ['inactive Chepu cargo', {
      shuttleCargo: { ...base.shuttleCargo, chepu: { securityTeams: 2 } },
    }],
    ['retained shuttle still docked', {
      retainedShuttles: {
        pallas: {
          status: 'retained', shuttleId: 'pallas', ownerRoleId: 'executive-officer',
          holderUid: 'xo-player', destroyedHostShipId: 'dione', controlRevision: 2,
          retainedAt: '2026-09-21T20:50:00.000Z',
        },
      },
    }],
    ['absent optional Wobbly cargo', {
      activeRoleIds: recommendedRoleIds(8),
      activeVesselIds: activeVesselIdsForRoles(recommendedRoleIds(8)),
      startingCraftManifest: craftStartingManifestForSetup(
        recommendedRoleIds(8),
        vesselMode,
        initialShuttleDockingsForRoles(recommendedRoleIds(8)),
      ),
      shuttleVisitLog: initialShuttleVisitsForDockings(
        initialShuttleDockingsForRoles(recommendedRoleIds(8)),
      ),
      shipResources: resourcesForRoles(recommendedRoleIds(8)),
      shuttleCargo: { wobbly: { securityTeams: 3 } },
      shuttleDockings: initialShuttleDockingsForRoles(recommendedRoleIds(8)),
    }],
    ['forbidden shuttle cargo type', {
      activeRoleIds: ['admiral', 'quellon-explorer'],
      activeVesselIds: ['aegis', 'quellon'],
      startingCraftManifest: craftStartingManifestForSetup(
        ['admiral', 'quellon-explorer'],
        vesselMode,
        initialShuttleDockingsForRoles(['admiral', 'quellon-explorer']),
      ),
      shuttleVisitLog: initialShuttleVisitsForDockings(
        initialShuttleDockingsForRoles(['admiral', 'quellon-explorer']),
      ),
      shipResources: { aegis: { securityTeams: 6 }, quellon: { securityTeams: 2 } },
      shuttleCargo: { hummingbird: { securityTeams: 2 } },
      shuttleDockings: initialShuttleDockingsForRoles(['admiral', 'quellon-explorer']),
    }],
    ['duplicate shuttle docking', {
      shuttleDockings: [...base.shuttleDockings, base.shuttleDockings[0]],
    }],
    ['unknown host docking', {
      shuttleDockings: [
        { shuttleId: 'pallas', shipId: 'shepherd', dockedAt: 'now' },
        base.shuttleDockings[1],
      ],
    }],
    ['unknown shuttle docking', {
      shuttleDockings: [
        { shuttleId: 'ghost', shipId: 'aegis', dockedAt: 'now' },
        ...base.shuttleDockings,
      ],
    }],
    ['blank docking time', {
      shuttleDockings: [
        { shuttleId: 'pallas', shipId: 'dione', dockedAt: '   ' },
        base.shuttleDockings[1],
      ],
    }],
  ])('fails closed for %s', (_label, patch) => {
    expect(() => boardingSecurityTeamAuthority({ ...base, ...patch })).toThrow();
  });

  it('rejects Wobbly at AEGIS even while its joint role is active', () => {
    const roles = recommendedRoleIds(8);
    const unionStartingDockings = [
      ...initialShuttleDockingsForRoles(roles),
      { shuttleId: 'wobbly', shipId: 'quellon', dockedAt: 'SESSION START' },
    ];
    expect(() => boardingSecurityTeamAuthority({
      activeRoleIds: roles,
      activeVesselIds: activeVesselIdsForRoles(roles),
      vesselMode,
      startingCraftManifest: craftStartingManifestForSetup(roles, vesselMode, unionStartingDockings),
      shuttleVisitLog: initialShuttleVisitsForDockings(unionStartingDockings),
      retainedShuttles: {},
      shuttleControl: {},
      shipDamage: {},
      shipResources: resourcesForRoles(roles),
      shuttleCargo: { wobbly: { securityTeams: 3 } },
      shuttleDockings: unionStartingDockings.map((docking) => docking.shuttleId === 'wobbly'
        ? { ...docking, shipId: 'aegis', dockedAt: 'now' }
        : docking),
    })).toThrow();
  });

  it('rejects a forged Wobbly manifest entry without independent visit history', () => {
    const roles = recommendedRoleIds(8);
    const standardDockings = initialShuttleDockingsForRoles(roles);
    const forgedDockings = [
      ...standardDockings,
      { shuttleId: 'wobbly', shipId: 'quellon', dockedAt: 'SESSION START' },
    ];
    expect(() => boardingSecurityTeamAuthority({
      activeRoleIds: roles,
      activeVesselIds: activeVesselIdsForRoles(roles),
      vesselMode,
      startingCraftManifest: craftStartingManifestForSetup(roles, vesselMode, forgedDockings),
      shuttleVisitLog: initialShuttleVisitsForDockings(standardDockings),
      retainedShuttles: {},
      shuttleControl: {},
      shipDamage: {},
      shipResources: resourcesForRoles(roles),
      shuttleCargo: { wobbly: { securityTeams: 3 } },
      shuttleDockings: standardDockings,
    })).toThrow();
  });

  it('rejects a changed standard starting host that disagrees with visit history', () => {
    const forgedStart = startingDockings.map((docking) => docking.shuttleId === 'pallas'
      ? { ...docking, shipId: 'dione' }
      : docking);
    expect(() => boardingSecurityTeamAuthority({
      ...base,
      startingCraftManifest: craftStartingManifestForSetup(activeRoleIds, vesselMode, forgedStart),
    })).toThrow();
  });
});
