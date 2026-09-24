import { describe, expect, it } from 'vitest';
import { craftHelpFor } from './craftHelp';

describe('craft-specific private guidance', () => {
  it('projects the canonical owner, fuel, cargo, phases, mission, and actions for a shuttle', () => {
    const help = craftHelpFor('philia');

    expect(help).toMatchObject({
      id: 'philia',
      name: 'F.S. Philia',
      owner: 'Engineer',
      cargoRule: 'Security teams, strytium ore, fuel, food, water, and materials',
      phaseRules: ['Coordination', 'Wolf attack'],
    });
    expect(help?.fuelRules).toEqual(expect.arrayContaining([
      expect.stringMatching(/fuelled repair/i),
    ]));
    expect(help?.actionRules).toEqual(expect.arrayContaining([
      expect.stringMatching(/repair up to 2 consoles/i),
      expect.stringMatching(/boarding defence/i),
    ]));
    expect(help).not.toHaveProperty('fuelBalance');
    expect(help).not.toHaveProperty('currentDocking');
    expect(help).not.toHaveProperty('holderUid');
  });

  it('projects AEGIS fighter combat and launch rules from the fighter catalog', () => {
    const help = craftHelpFor('fighter-wing-alpha');

    expect(help).toMatchObject({
      name: 'Fighter Wing Alpha',
      owner: 'Wing Commander',
      phaseRules: ['Wolf attack', 'Combat // launch eligibility'],
    });
    expect(help?.combatRules).toEqual(expect.arrayContaining([
      expect.stringMatching(/shift one hostile ship/i),
      expect.stringMatching(/roll up to one die per fighter/i),
      expect.stringMatching(/destroyed for each roll of 1 or 2/i),
    ]));
    expect(help?.actionRules).toEqual(expect.arrayContaining([
      expect.stringMatching(/charged, undamaged bay/i),
      expect.stringMatching(/cannot launch fighters/i),
      expect.stringMatching(/4 fighters standard/i),
    ]));
  });

  it('projects PDF mission and combat rules without exposing mutable wing state', () => {
    const help = craftHelpFor('pdf-escort-fighter-wing');

    expect(help).toMatchObject({
      name: 'PDF Escort Fighter Wing',
      owner: 'P.D.F. Colonel',
      phaseRules: ['Away mission', 'Wolf attack'],
    });
    expect(help?.missionRules).toEqual([
      'Participate in Away Missions without a Fighter Bay charge, adding +2 to search & rescue and +1 to salvage checks.',
    ]);
    expect(help?.actionRules).toEqual(expect.arrayContaining([
      expect.stringMatching(/launch during Wolf attack/i),
      expect.stringMatching(/capacity.*4 fighters/i),
    ]));
    expect(help).not.toHaveProperty('fighterCount');
    expect(help).not.toHaveProperty('hostShipId');
  });

  it('keeps Chepu out of the PDF Escort Fighter Wing mission guidance', () => {
    const chepu = craftHelpFor('chepu');
    const fighterWing = craftHelpFor('pdf-escort-fighter-wing');

    expect(chepu?.missionRules).toBeUndefined();
    expect(fighterWing?.missionRules).toEqual([
      'Participate in Away Missions without a Fighter Bay charge, adding +2 to search & rescue and +1 to salvage checks.',
    ]);
  });

  it('fails closed for an unknown craft id instead of inventing guidance', () => {
    expect(craftHelpFor('unknown-craft')).toBeUndefined();
  });
});
