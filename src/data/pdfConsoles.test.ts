import { describe, expect, it } from 'vitest';
import refinery124 from './vessels/refinery-124';
import {
  PDF_ESCORT_FIGHTER_WING,
  PDF_FIGHTER_WING_SYSTEM,
  PDF_ROLE_CONSOLE,
} from './pdfConsoles';

describe('PDF Escort Fighter Wing registration', () => {
  it('keeps the four-fighter cap and Colonel ownership distinct from AEGIS wing state', () => {
    expect(PDF_ROLE_CONSOLE).toEqual({
      roleId: 'refinery-124-pdf-colonel',
      craft: [PDF_ESCORT_FIGHTER_WING],
    });
    expect(PDF_ESCORT_FIGHTER_WING).toMatchObject({
      id: 'pdf-escort-fighter-wing',
      ownerRoleId: 'refinery-124-pdf-colonel',
      capacity: 4,
    });
    expect(PDF_ESCORT_FIGHTER_WING).not.toHaveProperty('countId');
    expect(PDF_ESCORT_FIGHTER_WING.mission).toEqual({
      participation: 'permitted',
      phase: 'Away mission',
      requiresFighterBayCharge: false,
      bonuses: { searchAndRescue: 2, salvage: 1 },
    });
  });

  it('links Wolf Attack launch and both printed combat ranges to Refinery 124 Fighter Bay', () => {
    const fighterBay = refinery124.systems?.find((system) => system.id === PDF_ESCORT_FIGHTER_WING.launch.systemId);
    expect(fighterBay).toMatchObject({
      id: 'fighter-bay',
      name: 'Fighter Bay',
      timing: 'combat',
      effect: expect.stringMatching(/while charged.*launched.*damaged.*cannot be charged/i),
    });
    expect(PDF_ESCORT_FIGHTER_WING.launch).toEqual({
      systemId: PDF_FIGHTER_WING_SYSTEM.id,
      phase: 'Wolf attack',
      requiresChargedBay: true,
      requiresUndamagedBay: true,
    });
    expect(PDF_FIGHTER_WING_SYSTEM).toMatchObject({
      name: 'Fighter Bay',
    });
    expect(PDF_ESCORT_FIGHTER_WING.combat.mediumRange).toMatch(/target number.*±1.*0 hits refinery 124.*7 hits the aegis.*damage on 5\+/i);
    expect(PDF_ESCORT_FIGHTER_WING.combat.shortRange).toMatch(/one die per fighter.*damage on 3\+/i);
    expect(PDF_ESCORT_FIGHTER_WING.combat.lossRule).toMatch(/destroyed.*1 or 2/i);
  });
});
