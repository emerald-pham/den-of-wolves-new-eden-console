import {
  advanceEndeavourResearch,
  ENDEAVOUR_RESEARCH_TRACKS,
  type EndeavourResearchProgress,
  type EndeavourResearchTrackId,
} from './endeavourResearch';

export type EndeavourResearchFunding = 'standard' | 'shepherd-ore';

export interface EndeavourResearchChoice {
  readonly trackId: EndeavourResearchTrackId;
  readonly funding: EndeavourResearchFunding;
  readonly oreCost: 0 | 5;
}

export interface EndeavourResearchCadenceState {
  readonly cycle: number;
  readonly revision: number;
  readonly choices: readonly EndeavourResearchChoice[];
}

export interface EndeavourResearchCadenceResult {
  readonly state: EndeavourResearchCadenceState;
  readonly progress: EndeavourResearchProgress;
  readonly choice: EndeavourResearchChoice;
  readonly remainingShepherdOre: number;
}

const TRACK_IDS = new Set<string>(Object.keys(ENDEAVOUR_RESEARCH_TRACKS));
const STATE_KEYS = ['choices', 'cycle', 'revision'];
const CHOICE_KEYS = ['funding', 'oreCost', 'trackId'];

const isCanonicalRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === 'object' && value !== null && !Array.isArray(value) &&
  Object.getPrototypeOf(value) === Object.prototype;

const hasExactKeys = (value: Readonly<Record<string, unknown>>, keys: readonly string[]) =>
  JSON.stringify(Object.keys(value).sort()) === JSON.stringify(keys);

/** Parse persisted cadence state without repairing unknown, duplicate, or over-limit choices. */
export function parseEndeavourResearchCadenceState(value: unknown): EndeavourResearchCadenceState | null {
  if (value === undefined) return Object.freeze({ cycle: 0, revision: 0, choices: Object.freeze([]) });
  if (!isCanonicalRecord(value) || !hasExactKeys(value, STATE_KEYS) ||
    typeof value.cycle !== 'number' || !Number.isSafeInteger(value.cycle) || value.cycle < 0 ||
    typeof value.revision !== 'number' || !Number.isSafeInteger(value.revision) || value.revision < 0 ||
    !Array.isArray(value.choices)) return null;

  const choices: EndeavourResearchChoice[] = [];
  const trackIds = new Set<string>();
  let standardCount = 0;
  let oreCount = 0;
  for (const candidate of value.choices) {
    if (!isCanonicalRecord(candidate) || !hasExactKeys(candidate, CHOICE_KEYS) ||
      typeof candidate.trackId !== 'string' || !TRACK_IDS.has(candidate.trackId) ||
      (candidate.funding !== 'standard' && candidate.funding !== 'shepherd-ore') ||
      candidate.oreCost !== (candidate.funding === 'standard' ? 0 : 5) || trackIds.has(candidate.trackId)) return null;
    trackIds.add(candidate.trackId);
    if (candidate.funding === 'standard') standardCount += 1;
    else oreCount += 1;
    choices.push({
      trackId: candidate.trackId as EndeavourResearchTrackId,
      funding: candidate.funding,
      oreCost: candidate.funding === 'standard' ? 0 : 5,
    });
  }
  if (standardCount > 3 || oreCount > 2 ||
    (value.cycle === 0 && (value.revision !== 0 || choices.length > 0)) ||
    (value.cycle > 0 && (choices.length === 0 || value.revision < choices.length))) return null;
  return Object.freeze({
    cycle: value.cycle,
    revision: value.revision,
    choices: Object.freeze(choices.map((choice) => Object.freeze(choice))),
  });
}

/** Resolve one distinct Endeavour research choice within the server-validated Team Phase. */
export function resolveEndeavourResearchChoice(input: Readonly<{
  state: unknown;
  progress: unknown;
  cycle: number;
  expectedRevision: number;
  trackId: EndeavourResearchTrackId;
  funding: EndeavourResearchFunding;
  shepherdOre: number;
}>): EndeavourResearchCadenceResult {
  const state = parseEndeavourResearchCadenceState(input.state);
  if (!state) throw new Error('Endeavour research cadence state is malformed.');
  if (!Number.isSafeInteger(input.cycle) || input.cycle < 1) throw new Error('Endeavour research requires a valid cycle.');
  if (!Number.isSafeInteger(input.expectedRevision) || input.expectedRevision !== state.revision) {
    throw new Error('Endeavour research changed; refresh before choosing.');
  }
  if (state.revision >= Number.MAX_SAFE_INTEGER) {
    throw new Error('Endeavour research revision cannot advance safely.');
  }
  if (state.cycle > input.cycle) throw new Error('Endeavour research cadence is ahead of the current cycle.');
  if (typeof input.trackId !== 'string' || !TRACK_IDS.has(input.trackId)) {
    throw new Error('Unknown Endeavour research track.');
  }
  if (input.funding !== 'standard' && input.funding !== 'shepherd-ore') {
    throw new Error('Unknown Endeavour research funding.');
  }
  if (!Number.isSafeInteger(input.shepherdOre) || input.shepherdOre < 0) {
    throw new Error('Shepherd ore must be a non-negative integer.');
  }

  const choices = state.cycle === input.cycle ? state.choices : [];
  if (choices.some((choice) => choice.trackId === input.trackId)) {
    throw new Error('Choose each Endeavour research track at most once per cycle.');
  }
  const fundingCount = choices.filter((choice) => choice.funding === input.funding).length;
  if (input.funding === 'standard' && fundingCount >= 3) {
    throw new Error('Endeavour has used all three standard research choices this cycle.');
  }
  if (input.funding === 'shepherd-ore' && fundingCount >= 2) {
    throw new Error('Endeavour has used both additional research choices this cycle.');
  }
  const oreCost = input.funding === 'shepherd-ore' ? 5 : 0;
  if (input.shepherdOre < oreCost) throw new Error('Shepherd needs 5 ore for additional research.');

  const advanced = advanceEndeavourResearch(input.progress, input.trackId);
  const choice = Object.freeze({ trackId: input.trackId, funding: input.funding, oreCost }) as EndeavourResearchChoice;
  return {
    state: Object.freeze({
      cycle: input.cycle,
      revision: state.revision + 1,
      choices: Object.freeze([...choices, choice]),
    }),
    progress: advanced.progress,
    choice,
    remainingShepherdOre: input.shepherdOre - oreCost,
  };
}
