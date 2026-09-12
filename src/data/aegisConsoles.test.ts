import { describe, expect, it } from 'vitest';
import {
  AEGIS_FIGHTER_BAY_SYSTEMS,
  AEGIS_FIGHTER_WING_CAPACITY,
  AEGIS_FIGHTER_WING_COMBAT,
  AEGIS_ROLE_CONSOLES,
  FIGHTER_WING_IDS,
} from './aegisConsoles';
import { SHUTTLECRAFT } from './shuttles';

describe('AEGIS role console reference', () => {
  it('assigns every ship-sheet console to the Admiral without client-side cards', () => {
    expect(AEGIS_ROLE_CONSOLES.admiral.systems.map(({ name }) => name)).toEqual([
      'Armoured Hull I', 'Armoured Hull II', 'Storage', 'Reactor',
      'Shuttle Bay Zeta', 'Shuttle Bay Omega', 'Jump Drive', 'Construction Bay',
    ]);
    expect(JSON.stringify(AEGIS_ROLE_CONSOLES.admiral.systems)).not.toMatch(/[♥♦♣♠]|"card"/);
    expect(AEGIS_ROLE_CONSOLES.admiral.jumpCosts).toEqual({ short: 2, medium: 3, long: 6 });
    expect(AEGIS_ROLE_CONSOLES.admiral.reactorCapacity).toBe(5);
    expect(AEGIS_ROLE_CONSOLES.admiral.maintenanceSteps).toHaveLength(7);
    expect(AEGIS_ROLE_CONSOLES.admiral.rations).toEqual({
      food: [0, 3, 5, 8],
      water: [0, 2, 3, 6],
      bonuses: [0, 3, 6, 9],
    });
  });

  it('assigns only Starlight and the two fighter wings to the Wing Commander', () => {
    expect(AEGIS_ROLE_CONSOLES['wing-commander'].craft.map(({ name }) => name)).toEqual([
      'I.C.S.S. Starlight',
      'Fighter Wing Alpha',
      'Fighter Wing Bravo',
    ]);
    expect(AEGIS_ROLE_CONSOLES['wing-commander'].scoutRange).toBe(2);
    expect(AEGIS_ROLE_CONSOLES['wing-commander'].awayMissionBonus)
      .toEqual({ explore: 3, salvage: 1 });
    expect(AEGIS_ROLE_CONSOLES['wing-commander'].fighterCapacity)
      .toEqual(AEGIS_FIGHTER_WING_CAPACITY);
  });

  it('keeps each fighter wing linked to its own bay, count, cap, and printed combat rules', () => {
    const wings = AEGIS_ROLE_CONSOLES['wing-commander'].craft
      .filter((craft) => FIGHTER_WING_IDS.includes(craft.id as typeof FIGHTER_WING_IDS[number]));

    expect(wings).toHaveLength(2);
    expect(wings.map(({ id }) => id)).toEqual([...FIGHTER_WING_IDS]);
    expect(wings.map(({ launchSystemId }) => launchSystemId))
      .toEqual(['fighter-bay-alpha', 'fighter-bay-bravo']);
    expect(wings.map(({ fighterWing }) => fighterWing?.countId)).toEqual([...FIGHTER_WING_IDS]);
    expect(wings.map(({ fighterWing }) => fighterWing?.capacity))
      .toEqual([AEGIS_FIGHTER_WING_CAPACITY, AEGIS_FIGHTER_WING_CAPACITY]);
    expect(wings.map(({ fighterWing }) => fighterWing?.combat))
      .toEqual([AEGIS_FIGHTER_WING_COMBAT, AEGIS_FIGHTER_WING_COMBAT]);
    expect(AEGIS_FIGHTER_BAY_SYSTEMS['fighter-bay-alpha']).toMatchObject({
      name: 'Fighter Bay Alpha',
      baseline: expect.stringMatching(/charged.*undamaged.*launch/i),
      damaged: expect.stringMatching(/cannot launch/i),
    });
    expect(AEGIS_FIGHTER_BAY_SYSTEMS['fighter-bay-bravo']).toMatchObject({
      name: 'Fighter Bay Bravo',
      baseline: expect.stringMatching(/charged.*undamaged.*launch/i),
      damaged: expect.stringMatching(/cannot launch/i),
    });
    expect(AEGIS_FIGHTER_WING_COMBAT.mediumRange).toMatch(/targeting number.*\+1 or −1.*1 and 6/i);
    expect(AEGIS_FIGHTER_WING_COMBAT.mediumRange).toMatch(/damage on 5\+/i);
    expect(AEGIS_FIGHTER_WING_COMBAT.shortRange).toMatch(/one die per fighter.*damage on 3\+/i);
    expect(AEGIS_FIGHTER_WING_COMBAT.lossRule).toMatch(/destroyed.*1 or 2/i);
  });

  it('keeps Starlight registration facts aligned across the shuttle and AEGIS catalogs', () => {
    const starlight = SHUTTLECRAFT.find((shuttle) => shuttle.id === 'starlight');
    expect(starlight).toMatchObject({
      captainRoleId: 'wing-commander',
      initialDocking: { shipId: 'aegis', dockedAt: 'SESSION START' },
    });
    expect(starlight?.cargoTransfer).toBeUndefined();
    expect(starlight?.operations).toEqual([
      expect.objectContaining({
        name: 'Scouting', phase: 'Coordination',
        effect: expect.stringMatching(/within 2 jumps.*fuelled.*second system/i),
      }),
      expect.objectContaining({
        name: 'Away missions', phase: 'Away mission',
        effect: expect.stringMatching(/\+3.*exploration.*\+1.*salvage/i),
      }),
    ]);
    expect(AEGIS_ROLE_CONSOLES['wing-commander'].craft[0]).toMatchObject({
      id: 'starlight', name: 'I.C.S.S. Starlight',
    });
    expect(AEGIS_ROLE_CONSOLES['wing-commander'].scoutRange).toBe(2);
    expect(AEGIS_ROLE_CONSOLES['wing-commander'].awayMissionBonus)
      .toEqual({ explore: 3, salvage: 1 });
  });

  it('keeps Pallas registration facts aligned across its owner, cargo, docking, and operations', () => {
    const pallas = SHUTTLECRAFT.find((shuttle) => shuttle.id === 'pallas');
    expect(pallas).toMatchObject({
      captainRoleId: 'executive-officer',
      cargoTransferTypes: ['securityTeams'],
      cargoTransfer: 'Security teams only',
      initialDocking: { shipId: 'aegis', dockedAt: 'SESSION START' },
    });
    expect(pallas?.operations).toEqual([
      expect.objectContaining({
        name: 'Cargo transfer', phase: 'Coordination',
        effect: expect.stringMatching(/security teams.*to and from ships/i),
      }),
      expect.objectContaining({
        name: 'Boarding defence', phase: 'Wolf attack',
        effect: expect.stringMatching(/security teams.*defend.*reroll up to 3 boarding dice/i),
      }),
      expect.objectContaining({
        name: 'Fuelled redeployment', phase: 'Wolf attack',
        effect: expect.stringMatching(/fuelled.*chosen ship.*start of the Boarding Action step/i),
      }),
    ]);
  });
});
