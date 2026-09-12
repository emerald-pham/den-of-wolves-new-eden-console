/**
 * Printed PDF Escort Fighter Wing facts. This is reference metadata only: the
 * later wing-state and combat prompts own mutable counts and resolution.
 */
export interface PdfFighterWingCombat {
  readonly mediumRange: string;
  readonly shortRange: string;
  readonly lossRule: string;
}

export interface PdfEscortFighterWing {
  readonly id: 'pdf-escort-fighter-wing';
  readonly name: 'PDF Escort Fighter Wing';
  readonly ownerRoleId: 'refinery-124-pdf-colonel';
  readonly capacity: 4;
  readonly mission: {
    readonly phase: 'Away mission';
    readonly requiresFighterBayCharge: false;
    readonly bonuses: {
      readonly searchAndRescue: 2;
      readonly salvage: 1;
    };
  };
  readonly launch: {
    readonly systemId: 'fighter-bay';
    readonly phase: 'Wolf attack';
    readonly requiresChargedBay: true;
    readonly requiresUndamagedBay: true;
  };
  readonly combat: PdfFighterWingCombat;
}

export const PDF_ESCORT_FIGHTER_WING = {
  id: 'pdf-escort-fighter-wing',
  name: 'PDF Escort Fighter Wing',
  ownerRoleId: 'refinery-124-pdf-colonel',
  capacity: 4,
  mission: {
    phase: 'Away mission',
    requiresFighterBayCharge: false,
    bonuses: { searchAndRescue: 2, salvage: 1 },
  },
  launch: {
    systemId: 'fighter-bay',
    phase: 'Wolf attack',
    requiresChargedBay: true,
    requiresUndamagedBay: true,
  },
  combat: {
    mediumRange: 'Each fighter may shift one Wolf Ship target number by ±1, with range wraparound, or roll one die for 1 damage on 5+.',
    shortRange: 'Roll up to one die per fighter. Deal 1 damage on 3+.',
    lossRule: 'One fighter is destroyed for each roll of 1 or 2.',
  },
} as const satisfies PdfEscortFighterWing;

export const PDF_FIGHTER_WING_SYSTEM = {
  id: 'fighter-bay',
  name: 'Fighter Bay',
} as const;

export const PDF_ROLE_CONSOLE = {
  roleId: PDF_ESCORT_FIGHTER_WING.ownerRoleId,
  craft: [PDF_ESCORT_FIGHTER_WING],
} as const;
