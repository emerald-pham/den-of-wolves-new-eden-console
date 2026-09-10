import { describe, expect, it } from 'vitest';
import {
  DEFAULT_ENABLED_SHUTTLECRAFT,
  INITIAL_SHUTTLE_DOCKINGS,
  INITIAL_SHUTTLE_VISITS,
  initialShuttleDockingsForRoles,
  normalizeShuttleManifest,
  isShuttleEnabled,
  SHUTTLECRAFT,
  shuttlebayForShip,
} from './shuttles';
import { DEFAULT_ACTIVE_ROLE_IDS } from './roles';
import { recommendedRoleIds } from './rolePresets';

describe('fleet shuttlebays', () => {
  it('registers every printed shuttlecraft and keeps fighter wings in their ship consoles', () => {
    expect(SHUTTLECRAFT.map((shuttle) => shuttle.id)).toEqual([
      'snn-press-shuttle',
      'starlight', 'pallas',
      'philia', 'maliades',
      'highwall', 'blacksmith',
      'macaw', 'boa',
      'endeavour', 'black-sheep',
      'hummingbird', 'condor',
      'chacau', 'chepu',
      'wobbly', 'ally',
    ]);
    expect(SHUTTLECRAFT.find((shuttle) => shuttle.id === 'maliades')?.captainRoleId)
      .toBe('dione-engineer');
    expect(SHUTTLECRAFT.find((shuttle) => shuttle.id === 'macaw')?.captainRoleId)
      .toBe('capybara-captain');
    expect(SHUTTLECRAFT.find((shuttle) => shuttle.id === 'boa')?.captainRoleId)
      .toBe('capybara-recycler');
    expect(SHUTTLECRAFT.map((shuttle) => shuttle.id)).not.toEqual(expect.arrayContaining([
      'fighter-wing-alpha', 'fighter-wing-bravo', 'pdf-escort-fighter-wing',
    ]));
  });

  it('starts the independently crewed and shipboard shuttlecraft docked with their home ships', () => {
    expect(INITIAL_SHUTTLE_DOCKINGS.map((docking) => docking.shuttleId)).toEqual([
      'snn-press-shuttle',
      'starlight', 'pallas',
      'philia', 'maliades',
      'highwall', 'blacksmith',
      'macaw', 'boa',
      'endeavour', 'black-sheep',
      'hummingbird', 'condor',
      'chacau', 'chepu',
    ]);
    expect(INITIAL_SHUTTLE_VISITS).toEqual(
      INITIAL_SHUTTLE_DOCKINGS.map((docking) => expect.objectContaining({
        shuttleId: docking.shuttleId,
        shipId: docking.shipId,
        action: 'docked',
      })),
    );
    expect(INITIAL_SHUTTLE_DOCKINGS).toEqual(expect.arrayContaining([
      expect.objectContaining({ shuttleId: 'snn-press-shuttle', shipId: 'dione' }),
      expect.objectContaining({ shuttleId: 'starlight', shipId: 'aegis' }),
      expect.objectContaining({ shuttleId: 'pallas', shipId: 'aegis' }),
      expect.objectContaining({ shuttleId: 'philia', shipId: 'dione' }),
      expect.objectContaining({ shuttleId: 'highwall', shipId: 'icebreaker' }),
      expect.objectContaining({ shuttleId: 'macaw', shipId: 'capybara' }),
      expect.objectContaining({ shuttleId: 'endeavour', shipId: 'shepherd' }),
      expect.objectContaining({ shuttleId: 'hummingbird', shipId: 'quellon' }),
      expect.objectContaining({ shuttleId: 'chacau', shipId: 'refinery-124' }),
    ]));
  });

  it.each([
    [8, 'aegis'],
    [11, 'aegis'],
    [12, 'dione'],
    [18, 'dione'],
    [19, 'dione'],
    [20, 'dione'],
  ] as const)('derives the SNN host from the locked %i-player core roster', (playerCount, shipId) => {
    expect(initialShuttleDockingsForRoles(recommendedRoleIds(playerCount))).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ shuttleId: 'snn-press-shuttle', shipId }),
      ]),
    );
  });

  it('normalizes a legacy manifest without overwriting stored docking or visit history', () => {
    const storedDocking = {
      shuttleId: 'snn-press-shuttle', shipId: 'aegis', dockedAt: 'TURN 3',
    } as const;
    const storedVisit = {
      id: 'snn-visit-3', shuttleId: 'snn-press-shuttle', shipId: 'aegis',
      action: 'docked' as const, occurredAt: 'TURN 3',
    };
    const result = normalizeShuttleManifest(
      [storedDocking], [storedVisit], recommendedRoleIds(20), 20,
    );
    expect(result.dockings).toEqual([storedDocking]);
    expect(result.visits).toEqual([storedVisit]);
  });

  it('adds the count-derived SNN docking to a legacy history that predates the Press field', () => {
    const oldDocking = {
      shuttleId: 'starlight', shipId: 'aegis', dockedAt: 'SESSION START',
    } as const;
    const oldVisit = {
      id: 'starlight-initial-aegis-docking', shuttleId: 'starlight', shipId: 'aegis',
      action: 'docked' as const, occurredAt: 'SESSION START',
    };
    const result = normalizeShuttleManifest(
      [oldDocking], [oldVisit], recommendedRoleIds(11), 11,
    );
    expect(result.dockings).toEqual(expect.arrayContaining([
      oldDocking,
      expect.objectContaining({ shuttleId: 'snn-press-shuttle', shipId: 'aegis' }),
    ]));
    expect(result.visits).toEqual(expect.arrayContaining([
      oldVisit,
      expect.objectContaining({ shuttleId: 'snn-press-shuttle', shipId: 'aegis' }),
    ]));
  });

  it('uses the active roster over a stale count when hydrating missing SNN history', () => {
    const oldDocking = {
      shuttleId: 'starlight', shipId: 'aegis', dockedAt: 'SESSION START',
    } as const;
    const oldVisit = {
      id: 'starlight-initial-aegis-docking', shuttleId: 'starlight', shipId: 'aegis',
      action: 'docked' as const, occurredAt: 'SESSION START',
    };
    const result = normalizeShuttleManifest(
      [oldDocking], [oldVisit], recommendedRoleIds(20), 11,
    );

    expect(result.dockings).toEqual(expect.arrayContaining([
      oldDocking,
      expect.objectContaining({ shuttleId: 'snn-press-shuttle', shipId: 'dione' }),
    ]));
    expect(result.visits).toEqual(expect.arrayContaining([
      oldVisit,
      expect.objectContaining({ shuttleId: 'snn-press-shuttle', shipId: 'dione' }),
    ]));
  });

  it('keeps GM-controlled Union craft out of the default core roster', () => {
    const gmControlled = SHUTTLECRAFT.filter((shuttle) => shuttle.availability === 'gm-controlled');

    expect(gmControlled.map((shuttle) => shuttle.id)).toEqual(['wobbly', 'ally']);
    expect(DEFAULT_ENABLED_SHUTTLECRAFT.map((shuttle) => shuttle.id)).not.toEqual(
      expect.arrayContaining(['wobbly', 'ally']),
    );
    expect(gmControlled.every((shuttle) =>
      !DEFAULT_ACTIVE_ROLE_IDS.includes(shuttle.captainRoleId))).toBe(true);
    for (const playerCount of [20]) {
      expect(gmControlled.every((shuttle) =>
        !isShuttleEnabled(shuttle, recommendedRoleIds(playerCount)))).toBe(true);
    }
    expect(gmControlled.every((shuttle) =>
      isShuttleEnabled(shuttle, recommendedRoleIds(8)))).toBe(true);
    expect(isShuttleEnabled(
      SHUTTLECRAFT.find((shuttle) => shuttle.id === 'wobbly')!,
      ['joint-engineering-quellon-refinery', 'quellon-engineer', 'refinery-124-engineer'],
    )).toBe(false);
  });

  it('reports the docked craft and visit history independently for every ship', () => {
    const session = {
      shuttleDockings: INITIAL_SHUTTLE_DOCKINGS,
      shuttleVisitLog: INITIAL_SHUTTLE_VISITS,
    };

    expect(shuttlebayForShip(session, 'aegis').dockedShuttles.map((shuttle) => shuttle.name))
      .toEqual(['I.C.S.S. Starlight', 'I.C.S.S. Pallas']);
    expect(shuttlebayForShip(session, 'aegis').visits).toHaveLength(2);
    expect(shuttlebayForShip(session, 'dione').dockedShuttles.map((shuttle) => shuttle.name))
      .toEqual(['SNN Independent Press Shuttle', 'F.S. Philia', 'F.S.F. Maliades']);
    expect(shuttlebayForShip(session, 'dione').visits).toHaveLength(3);
  });
});

it('keeps press docking visible but outside the linked mechanical bays', () => {
  const bay = shuttlebayForShip({}, 'aegis');
  expect(bay.mechanicalBays.map(item => item.name)).toEqual(['Shuttle Bay Zeta', 'Shuttle Bay Omega']);
  expect(bay.mechanicalDockedShuttles.map((shuttle) => shuttle.id)).toEqual(['starlight', 'pallas']);
  expect(bay.pressDockedShuttles).toHaveLength(0);
  expect(bay.dockedShuttles).toHaveLength(2);
  expect(shuttlebayForShip({}, 'dione').pressDockedShuttles.map((shuttle) => shuttle.id))
    .toEqual(['snn-press-shuttle']);
  expect(shuttlebayForShip({}, 'capybara').mechanicalBays).toHaveLength(1);
});
