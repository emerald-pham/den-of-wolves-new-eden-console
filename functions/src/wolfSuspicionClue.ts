export const WOLF_CLUE_TIERS = [
  'none',
  'natural-change',
  'wolf-activity',
  'wolf-activity-hint',
  'strong-hint',
  'traitor-name',
] as const;

export type WolfClueTier = typeof WOLF_CLUE_TIERS[number];

export interface WolfSuspicionClueResult {
  readonly oldSuspicion: number;
  readonly increment: number;
  readonly newSuspicion: number;
  readonly roll: number;
  readonly total: number;
  readonly clueTier: WolfClueTier;
  readonly facilitatorInstruction: string;
}

const CLUE_BANDS = [
  { maximum: 6, clueTier: 'none', facilitatorInstruction: 'Nothing.' },
  {
    maximum: 11,
    clueTier: 'natural-change',
    facilitatorInstruction: 'Point the change out to someone, framed as natural or accidental.',
  },
  {
    maximum: 15,
    clueTier: 'wolf-activity',
    facilitatorInstruction: 'Point out the wolf activity to someone.',
  },
  {
    maximum: 19,
    clueTier: 'wolf-activity-hint',
    facilitatorInstruction: 'Point out the wolf activity, and give a hint.',
  },
  {
    maximum: 23,
    clueTier: 'strong-hint',
    facilitatorInstruction: 'Give someone a strong hint.',
  },
  {
    maximum: Number.POSITIVE_INFINITY,
    clueTier: 'traitor-name',
    facilitatorInstruction: "Give someone the traitor's name.",
  },
] as const satisfies readonly {
  readonly maximum: number;
  readonly clueTier: WolfClueTier;
  readonly facilitatorInstruction: string;
}[];

/**
 * Apply a printed Wolf-action suspicion increment before resolving its one d6
 * clue roll. The caller owns random sampling and persistence.
 */
export function resolveWolfSuspicionClue(
  oldSuspicion: number,
  increment: number,
  roll: number,
): WolfSuspicionClueResult {
  if (!Number.isSafeInteger(oldSuspicion) || oldSuspicion < 0 ||
      !Number.isSafeInteger(increment) || increment <= 0 ||
      !Number.isSafeInteger(roll) || roll < 1 || roll > 6 ||
      oldSuspicion > Number.MAX_SAFE_INTEGER - increment) {
    throw new Error('Wolf suspicion and clue inputs must be canonical safe integers.');
  }
  const newSuspicion = oldSuspicion + increment;
  if (newSuspicion > Number.MAX_SAFE_INTEGER - roll) {
    throw new Error('The Wolf suspicion clue total exceeds the safe integer range.');
  }
  const total = newSuspicion + roll;
  const band = CLUE_BANDS.find((candidate) => total <= candidate.maximum)!;
  return {
    oldSuspicion,
    increment,
    newSuspicion,
    roll,
    total,
    clueTier: band.clueTier,
    facilitatorInstruction: band.facilitatorInstruction,
  };
}
