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
import { SHIPS } from './ships';

describe('fleet shuttlebays', () => {
  it('keeps Maliades launch, durability, repair, and attack registration linked to Dione', () => {
    const maliades = SHUTTLECRAFT.find((shuttle) => shuttle.id === 'maliades');
    const dione = SHIPS.find((ship) => ship.id === 'dione');

    expect(maliades).toMatchObject({
      captainRoleId: 'dione-engineer',
      launchSystemId: 'fighter-bay',
      initialDocking: { shipId: 'dione', dockedAt: 'SESSION START' },
      operations: [
        expect.objectContaining({
          name: 'Damage capacity',
          phase: 'Team',
          effect: expect.stringMatching(/up to 3 damage.*3 damage.*destroyed.*fuelled.*1 material per damage/i),
        }),
        expect.objectContaining({
          name: 'Medium range',
          phase: 'Wolf attack',
          effect: expect.stringMatching(/\+1 or −1.*1s and 6s wrap.*up to 1 die.*4\+.*1, 2, or 3/i),
        }),
        expect.objectContaining({
          name: 'Short range',
          phase: 'Wolf attack',
          effect: expect.stringMatching(/up to 2 dice.*2\+.*different targets.*roll of 1/i),
        }),
      ],
    });
    expect(dione?.systems).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: maliades?.launchSystemId,
        timing: 'combat',
        effect: expect.stringMatching(/while charged.*Maliades.*launched.*damaged.*cannot launch/i),
      }),
    ]));
  });

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

  it('encodes each printed cargo rule as an exact resource allowlist', () => {
    const cargoTypesByShuttle = Object.fromEntries(
      SHUTTLECRAFT
        .filter((shuttle) => shuttle.cargoTransferTypes)
        .map((shuttle) => [shuttle.id, shuttle.cargoTransferTypes]),
    );

    expect(cargoTypesByShuttle).toEqual({
      pallas: ['securityTeams'],
      philia: ['securityTeams', 'ore', 'fuel', 'food', 'water', 'materials'],
      highwall: ['ore', 'materials'],
      blacksmith: ['securityTeams', 'ore', 'fuel', 'food', 'water', 'materials'],
      macaw: ['securityTeams', 'ore', 'fuel', 'food', 'water', 'materials', 'scrap'],
      boa: ['scrap'],
      'black-sheep': ['securityTeams', 'ore', 'fuel', 'food', 'water', 'materials'],
      hummingbird: ['food', 'water'],
      condor: ['securityTeams', 'ore', 'fuel', 'food', 'water', 'materials'],
      chacau: ['securityTeams', 'ore', 'fuel', 'food', 'water', 'materials'],
      chepu: ['securityTeams'],
      wobbly: ['securityTeams', 'ore', 'fuel', 'food', 'water', 'materials'],
      ally: ['securityTeams', 'ore', 'fuel', 'food', 'water', 'materials'],
    });
    expect(SHUTTLECRAFT.filter((shuttle) => shuttle.cargoTransfer)
      .every((shuttle) => shuttle.cargoTransferTypes?.length)).toBe(true);
    expect(SHUTTLECRAFT.filter((shuttle) => !shuttle.cargoTransfer).map((shuttle) => shuttle.id))
      .toEqual(['snn-press-shuttle', 'starlight', 'maliades', 'endeavour']);
  });

  it('keeps Hummingbird printed exploration, harvesting, ownership, docking, cargo, and mission facts distinct', () => {
    const hummingbird = SHUTTLECRAFT.find((shuttle) => shuttle.id === 'hummingbird');
    expect(hummingbird).toMatchObject({
      captainRoleId: 'quellon-explorer',
      cargoTransferTypes: ['food', 'water'],
      cargoTransfer: 'Food and water only',
      initialDocking: { shipId: 'quellon', dockedAt: 'SESSION START' },
    });
    expect(hummingbird?.operations).toEqual([
      expect.objectContaining({
        name: 'Scout system',
        phase: 'Coordination',
        effect: expect.stringMatching(/one system within 3 jumps of Quellon/i),
      }),
      expect.objectContaining({
        name: 'Resource harvesting',
        phase: 'Coordination',
        effect: expect.stringMatching(/fuelled.*roll 2d6.*food.*water/i),
      }),
      expect.objectContaining({
        name: 'Away missions',
        phase: 'Away mission',
        effect: expect.stringMatching(/\+3.*exploration.*\+1.*mining/i),
      }),
    ]);
  });

  it('keeps Condor printed recharge and full cargo distinct from Black Sheep', () => {
    const condor = SHUTTLECRAFT.find((shuttle) => shuttle.id === 'condor');
    const blackSheep = SHUTTLECRAFT.find((shuttle) => shuttle.id === 'black-sheep');
    expect(condor).toMatchObject({
      operator: 'Proxima',
      captainRoleId: 'quellon-engineer',
      cargoTransferTypes: ['securityTeams', 'ore', 'fuel', 'food', 'water', 'materials'],
      cargoTransfer: 'Security teams, strytium ore, fuel, food, water, and materials',
      initialDocking: { shipId: 'quellon', dockedAt: 'SESSION START' },
    });
    expect(condor?.operations).toEqual([
      expect.objectContaining({
        name: 'Recharge',
        phase: 'Coordination',
        effect: expect.stringMatching(/fuelled.*charge one console.*immediate maintenance effect resolves immediately/i),
      }),
      expect.objectContaining({
        name: 'Boarding defence',
        phase: 'Wolf attack',
        effect: expect.stringMatching(/docked ship.*security teams.*repel boarders/i),
      }),
    ]);
    expect(blackSheep).toMatchObject({
      captainRoleId: 'shepherd-engineer',
      initialDocking: { shipId: 'shepherd', dockedAt: 'SESSION START' },
    });
  });

  it('keeps Philia registration facts distinct across repair, dismantle, docking, and ownership', () => {
    const philia = SHUTTLECRAFT.find((shuttle) => shuttle.id === 'philia');
    expect(philia).toMatchObject({
      captainRoleId: 'dione-engineer',
      cargoTransferTypes: ['securityTeams', 'ore', 'fuel', 'food', 'water', 'materials'],
      cargoTransfer: 'Security teams, strytium ore, fuel, food, water, and materials',
      initialDocking: { shipId: 'dione', dockedAt: 'SESSION START' },
    });
    expect(philia?.operations).toEqual([
      expect.objectContaining({
        name: 'Repair', phase: 'Coordination',
        effect: expect.stringMatching(/repair up to 2 consoles.*4 materials each.*damage a console.*permission.*gain 3 materials/i),
      }),
      expect.objectContaining({
        name: 'Fuelled repair', phase: 'Coordination',
        effect: expect.stringMatching(/fuelled.*repair consoles on a second ship/i),
      }),
      expect.objectContaining({
        name: 'Boarding defence', phase: 'Wolf attack',
        effect: expect.stringMatching(/docked ship.*security teams.*repel boarders/i),
      }),
    ]);
  });

  it('keeps Ally registration facts distinct from copied Chacau and Philia text', () => {
    const ally = SHUTTLECRAFT.find((shuttle) => shuttle.id === 'ally');
    expect(ally).toMatchObject({
      captainRoleId: 'joint-engineering-shepherd-icebreaker',
      availability: 'gm-controlled',
      cargoTransferTypes: ['securityTeams', 'ore', 'fuel', 'food', 'water', 'materials'],
      cargoTransfer: 'Security teams, strytium ore, fuel, food, water, and materials',
    });
    expect(ally?.initialDocking).toBeUndefined();
    expect(ally?.operations).toEqual([
      expect.objectContaining({
        name: 'Repair', phase: 'Coordination',
        effect: expect.stringMatching(/repair up to 2 consoles.*4 materials each.*damage a console.*permission.*gain 3 materials/i),
      }),
      expect.objectContaining({
        name: 'Fuelled repair', phase: 'Coordination',
        effect: expect.stringMatching(/fuelled.*repair consoles on a second ship/i),
      }),
      expect.objectContaining({
        name: 'Boarding defence', phase: 'Wolf attack',
        effect: expect.stringMatching(/docked ship.*security teams.*repel boarders/i),
      }),
    ]);
    expect(ally?.operations.find(({ name }) => name === 'Fuelled repair')?.effect)
      .not.toMatch(/repair or scrap/i);
  });

  it('keeps Blacksmith registration facts distinct across repair, dismantle, docking, and ownership', () => {
    const blacksmith = SHUTTLECRAFT.find((shuttle) => shuttle.id === 'blacksmith');
    expect(blacksmith).toMatchObject({
      captainRoleId: 'icebreaker-engineer',
      cargoTransferTypes: ['securityTeams', 'ore', 'fuel', 'food', 'water', 'materials'],
      cargoTransfer: 'Security teams, strytium ore, fuel, food, water, and materials',
      initialDocking: { shipId: 'icebreaker', dockedAt: 'SESSION START' },
    });
    expect(blacksmith?.operations).toEqual([
      expect.objectContaining({
        name: 'Repair', phase: 'Coordination',
        effect: expect.stringMatching(/repair up to 2 consoles.*4 materials each.*damage a console.*permission.*gain 3 materials/i),
      }),
      expect.objectContaining({
        name: 'Fuelled repair', phase: 'Coordination',
        effect: expect.stringMatching(/fuelled.*repair consoles on a second ship/i),
      }),
      expect.objectContaining({
        name: 'Boarding defence', phase: 'Wolf attack',
        effect: expect.stringMatching(/docked ship.*security teams.*repel boarders/i),
      }),
    ]);
    expect(blacksmith?.operations[1]?.effect).not.toMatch(/scrap/i);
  });

  it('keeps Chacau repair, permission, fuel, cargo, docking, and ownership distinct from Philia', () => {
    const chacau = SHUTTLECRAFT.find((shuttle) => shuttle.id === 'chacau');
    const philia = SHUTTLECRAFT.find((shuttle) => shuttle.id === 'philia');
    expect(chacau).toMatchObject({
      operator: 'Gliese',
      captainRoleId: 'refinery-124-engineer',
      cargoTransferTypes: ['securityTeams', 'ore', 'fuel', 'food', 'water', 'materials'],
      cargoTransfer: 'Security teams, strytium ore, fuel, food, water, and materials',
      initialDocking: { shipId: 'refinery-124', dockedAt: 'SESSION START' },
    });
    expect(chacau?.operations).toEqual([
      expect.objectContaining({
        name: 'Repair',
        phase: 'Coordination',
        effect: expect.stringMatching(/repair up to 2 consoles.*4 materials each.*damage a console.*permission.*gain 3 materials/i),
      }),
      expect.objectContaining({
        name: 'Fuelled repair',
        phase: 'Coordination',
        effect: expect.stringMatching(/fuelled.*repair consoles on a second ship/i),
      }),
      expect.objectContaining({
        name: 'Boarding defence',
        phase: 'Wolf attack',
        effect: expect.stringMatching(/docked ship.*security teams.*repel boarders/i),
      }),
    ]);
    expect(chacau?.operations[1]?.effect).not.toMatch(/scrap/i);
    expect(philia).toMatchObject({
      captainRoleId: 'dione-engineer',
      initialDocking: { shipId: 'dione', dockedAt: 'SESSION START' },
    });
  });

  it('keeps Black Sheep recharge attached to the Shepherd Engineer rather than Condor', () => {
    const blackSheep = SHUTTLECRAFT.find((shuttle) => shuttle.id === 'black-sheep');
    const condor = SHUTTLECRAFT.find((shuttle) => shuttle.id === 'condor');

    expect(blackSheep).toMatchObject({
      captainRoleId: 'shepherd-engineer',
      cargoTransferTypes: ['securityTeams', 'ore', 'fuel', 'food', 'water', 'materials'],
      cargoTransfer: 'Security teams, strytium ore, fuel, food, water, and materials',
      initialDocking: { shipId: 'shepherd', dockedAt: 'SESSION START' },
    });
    expect(blackSheep?.operations).toEqual([
      expect.objectContaining({
        name: 'Recharge', phase: 'Coordination',
        effect: expect.stringMatching(/when fuelled.*charge one console.*immediate maintenance effect.*resolves immediately/i),
      }),
      expect.objectContaining({
        name: 'Boarding defence', phase: 'Wolf attack',
        effect: expect.stringMatching(/docked ship.*security teams.*repel boarders/i),
      }),
    ]);
    expect(condor).toMatchObject({
      captainRoleId: 'quellon-engineer',
      initialDocking: { shipId: 'quellon', dockedAt: 'SESSION START' },
    });
  });

  it('keeps Chepu security cargo and boarding relocation attached to the PDF Colonel', () => {
    const chepu = SHUTTLECRAFT.find((shuttle) => shuttle.id === 'chepu');

    expect(chepu).toMatchObject({
      operator: 'Gliese',
      captainRoleId: 'refinery-124-pdf-colonel',
      cargoTransferTypes: ['securityTeams'],
      cargoTransfer: 'Security teams only',
      initialDocking: { shipId: 'refinery-124', dockedAt: 'SESSION START' },
    });
    expect(chepu?.operations).toEqual(expect.arrayContaining([
      expect.objectContaining({
        name: 'Cargo transfer',
        phase: 'Coordination',
        effect: expect.stringMatching(/security teams.*to and from ships.*Chepu.*docked/i),
      }),
      expect.objectContaining({
        name: 'Boarding defence',
        phase: 'Wolf attack',
        effect: expect.stringMatching(/docked ship.*security teams.*repel boarders/i),
      }),
      expect.objectContaining({
        name: 'Fuelled redeployment',
        phase: 'Wolf attack',
        effect: expect.stringMatching(/fuelled.*chosen ship.*start of the Boarding Action step/i),
      }),
    ]));
  });

  it('keeps Wobbly recharge and cargo attached to the active Quellon/Refinery Union assignment', () => {
    const wobbly = SHUTTLECRAFT.find((shuttle) => shuttle.id === 'wobbly');

    expect(wobbly).toMatchObject({
      captainRoleId: 'joint-engineering-quellon-refinery',
      cargoTransferTypes: ['securityTeams', 'ore', 'fuel', 'food', 'water', 'materials'],
      cargoTransfer: 'Security teams, strytium ore, fuel, food, water, and materials',
      availability: 'gm-controlled',
    });
    expect(wobbly?.initialDocking).toBeUndefined();
    expect(wobbly?.operations).toEqual([
      expect.objectContaining({
        name: 'Recharge', phase: 'Coordination',
        effect: expect.stringMatching(/when fuelled.*charge one console each coordination phase.*immediate maintenance effect.*resolves immediately/i),
      }),
      expect.objectContaining({
        name: 'Boarding defence', phase: 'Wolf attack',
        effect: expect.stringMatching(/docked ship.*security teams.*repel boarders/i),
      }),
    ]);
    expect(wobbly?.operations[0]?.effect).not.toMatch(/Condor/i);
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
