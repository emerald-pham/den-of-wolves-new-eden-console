import { describe, expect, it } from 'vitest';
import { AEGIS_ROLE_CONSOLES } from './aegisConsoles';
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
      .toEqual({ standard: 4, upgraded: 6 });
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
});
