import { endeavourResearchTrack } from './endeavourResearch';

export interface WolfAgentDetectorState {
  readonly cycle: number;
  readonly revision: number;
  readonly testsUsed: number;
}

export interface WolfAgentDetectorAuthorization {
  readonly cycle: number;
  readonly ordinal: 1 | 2 | 3;
}

export interface WolfAgentDetectorReservation {
  readonly state: WolfAgentDetectorState;
  readonly authorization: WolfAgentDetectorAuthorization;
}

const STATE_KEYS = ['cycle', 'revision', 'testsUsed'];

const isCanonicalRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === 'object' && value !== null && !Array.isArray(value) &&
  Object.getPrototypeOf(value) === Object.prototype;

const hasExactKeys = (value: Readonly<Record<string, unknown>>, keys: readonly string[]) =>
  JSON.stringify(Object.keys(value).sort()) === JSON.stringify(keys);

/** Parse only detector allowance states reachable through a successful reservation. */
export function parseWolfAgentDetectorState(value: unknown): WolfAgentDetectorState | null {
  if (value === undefined) return Object.freeze({ cycle: 0, revision: 0, testsUsed: 0 });
  if (!isCanonicalRecord(value) || !hasExactKeys(value, STATE_KEYS) ||
    !Number.isSafeInteger(value.cycle) || (value.cycle as number) < 0 ||
    !Number.isSafeInteger(value.revision) || (value.revision as number) < 0 ||
    !Number.isSafeInteger(value.testsUsed) || (value.testsUsed as number) < 0 ||
    (value.testsUsed as number) > 3 ||
    (value.cycle === 0 && (value.revision !== 0 || value.testsUsed !== 0)) ||
    (value.cycle as number) > 0 && ((value.testsUsed as number) < 1 ||
      (value.revision as number) < (value.testsUsed as number) ||
      Math.ceil(((value.revision as number) - (value.testsUsed as number)) / 3) >
        (value.cycle as number) - 1)) return null;
  return Object.freeze({
    cycle: value.cycle as number,
    revision: value.revision as number,
    testsUsed: value.testsUsed as number,
  });
}

/**
 * Reserve one of the completed detector's three cycle-local test allowances.
 * Target selection, private server randomness, and private delivery belong to
 * Prompt 508 and are deliberately absent from this shared state.
 */
export function reserveWolfAgentDetectorTest(input: Readonly<{
  progress: unknown;
  state: unknown;
  expectedRevision: number;
  cycle: number;
}>): WolfAgentDetectorReservation {
  if (!endeavourResearchTrack(input.progress, 'wolf-agent-detector').complete) {
    throw new Error('Wolf Agent Detector research must be complete before testing.');
  }
  const state = parseWolfAgentDetectorState(input.state);
  if (!state) throw new Error('Wolf Agent Detector state is malformed.');
  if (!Number.isSafeInteger(input.cycle) || input.cycle < 1) {
    throw new Error('Wolf Agent Detector testing requires a valid cycle.');
  }
  if (!Number.isSafeInteger(input.expectedRevision) || input.expectedRevision !== state.revision) {
    throw new Error('Wolf Agent Detector state changed; refresh before testing.');
  }
  if (state.revision >= Number.MAX_SAFE_INTEGER) {
    throw new Error('Wolf Agent Detector revision cannot advance safely.');
  }
  if (state.cycle > input.cycle) throw new Error('Wolf Agent Detector state is ahead of the current cycle.');
  const testsUsed = state.cycle === input.cycle ? state.testsUsed : 0;
  if (testsUsed >= 3) throw new Error('Wolf Agent Detector has used all three tests this cycle.');
  const ordinal = (testsUsed + 1) as 1 | 2 | 3;
  return {
    state: Object.freeze({ cycle: input.cycle, revision: state.revision + 1, testsUsed: ordinal }),
    authorization: Object.freeze({ cycle: input.cycle, ordinal }),
  };
}
