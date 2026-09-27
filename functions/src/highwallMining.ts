import { addResourceAmount } from './resources';

export type HighwallMiningResource = 'materials' | 'ore';

export interface HighwallMiningOperation {
  readonly requestId: string;
  readonly resource: HighwallMiningResource;
  readonly rolls: readonly number[];
  readonly amount: number;
}

export interface HighwallMiningState {
  readonly cycle: number;
  readonly revision: number;
  readonly operations: readonly HighwallMiningOperation[];
}

export interface HighwallMiningStaleCasResult {
  readonly status: 'stale';
  readonly sessionId: string;
  readonly requestId: string;
  readonly resource: HighwallMiningResource;
  readonly expectedRevision: number;
  readonly currentRevision: number;
  readonly expectedControlRevision: number;
  readonly currentControlRevision: number;
  readonly expectedCycle: number;
  readonly currentCycle: number;
  readonly hostShipId: string;
}

export interface HighwallMiningStaleCasInput {
  readonly sessionId: string;
  readonly requestId: string;
  readonly resource: HighwallMiningResource;
  readonly expectedRevision: number;
  readonly expectedControlRevision: number;
  readonly expectedCycle: number;
  readonly state: HighwallMiningState;
  readonly currentControlRevision: number;
  readonly currentCycle: number;
  readonly hostShipId: string;
}

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown> : undefined;
}

function die(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 1 && (value as number) <= 6;
}

export function parseHighwallMiningState(value: unknown): HighwallMiningState | null {
  if (value === undefined) return { cycle: 0, revision: 0, operations: [] };
  const raw = record(value);
  if (!raw || Object.keys(raw).some((key) => !['cycle', 'revision', 'operations'].includes(key)) ||
      !Number.isSafeInteger(raw.cycle) || (raw.cycle as number) < 1 ||
      !Number.isSafeInteger(raw.revision) || (raw.revision as number) < 0 ||
      !Array.isArray(raw.operations)) return null;
  const operations: HighwallMiningOperation[] = [];
  const requestIds = new Set<string>();
  for (const value of raw.operations) {
    const operation = record(value);
    if (!operation || Object.keys(operation).some((key) =>
      !['requestId', 'resource', 'rolls', 'amount'].includes(key)) ||
        typeof operation.requestId !== 'string' || !operation.requestId ||
        (operation.resource !== 'materials' && operation.resource !== 'ore') ||
        !Array.isArray(operation.rolls) ||
        operation.rolls.length !== (operation.resource === 'materials' ? 1 : 3) ||
        !operation.rolls.every(die) ||
        !Number.isSafeInteger(operation.amount) ||
        operation.amount !== operation.rolls.reduce((sum, roll) => sum + roll, 0)) return null;
    if (requestIds.has(operation.requestId)) return null;
    requestIds.add(operation.requestId);
    operations.push({
      requestId: operation.requestId,
      resource: operation.resource,
      rolls: operation.rolls as number[],
      amount: operation.amount as number,
    });
  }
  if (operations.length > 3 || (raw.revision as number) < operations.length) return null;
  return { cycle: raw.cycle as number, revision: raw.revision as number, operations };
}

/**
 * Build a data-only stale response after the callable has authenticated current
 * session, holder, role, group, control, and dock authority. Callers must return
 * this result before drawing dice or writing state, events, or receipts.
 */
export function resolveHighwallMiningStaleCas(
  input: HighwallMiningStaleCasInput,
): HighwallMiningStaleCasResult | undefined {
  const rawState = record(input.state);
  const initialState = rawState && Object.keys(rawState).length === 3 &&
    rawState.cycle === 0 && rawState.revision === 0 &&
    Array.isArray(rawState.operations) && rawState.operations.length === 0
    ? { cycle: 0, revision: 0, operations: [] }
    : null;
  const state = initialState ?? (input.state === undefined ? null : parseHighwallMiningState(input.state));
  const validRequestId = (value: unknown): value is string =>
    typeof value === 'string' && /^[\w-]{1,128}$/.test(value);
  const validCounter = (value: number) => Number.isSafeInteger(value) && value >= 0;
  const validCycle = (value: number) => Number.isSafeInteger(value) && value >= 1;
  if (!validRequestId(input.sessionId) || !validRequestId(input.requestId) ||
      (input.resource !== 'materials' && input.resource !== 'ore') || !state ||
      !validCounter(input.expectedRevision) || !validCounter(input.expectedControlRevision) ||
      !validCycle(input.expectedCycle) || !validCounter(input.currentControlRevision) ||
      !validCycle(input.currentCycle) || !validRequestId(input.hostShipId)) {
    throw new Error('Highwall mining stale request or state is malformed.');
  }
  if (state.cycle > input.currentCycle) {
    throw new Error('Highwall mining state is ahead of the current cycle.');
  }
  if (input.expectedRevision > state.revision ||
      input.expectedControlRevision > input.currentControlRevision ||
      input.expectedCycle > input.currentCycle) {
    throw new Error('Highwall mining request is ahead of the current state.');
  }
  if (input.expectedRevision === state.revision &&
      input.expectedControlRevision === input.currentControlRevision &&
      input.expectedCycle === input.currentCycle) return undefined;
  return {
    status: 'stale',
    sessionId: input.sessionId,
    requestId: input.requestId,
    resource: input.resource,
    expectedRevision: input.expectedRevision,
    currentRevision: state.revision,
    expectedControlRevision: input.expectedControlRevision,
    currentControlRevision: input.currentControlRevision,
    expectedCycle: input.expectedCycle,
    currentCycle: input.currentCycle,
    hostShipId: input.hostShipId,
  };
}

export function resolveHighwallMining(input: Readonly<{
  state: HighwallMiningState;
  currentCycle: number;
  expectedRevision: number;
  fuelled: boolean;
  resource: HighwallMiningResource;
  requestId: string;
  rolls: readonly number[];
  cargo: Readonly<{ ore: number; materials: number }>;
}>): Readonly<{
  state: HighwallMiningState;
  cargo: Readonly<{ ore: number; materials: number }>;
  operation: HighwallMiningOperation;
}> {
  if (input.state.cycle > input.currentCycle) {
    throw new Error('Highwall mining state is ahead of the current cycle.');
  }
  const current = input.state.cycle === input.currentCycle
    ? input.state : { cycle: input.currentCycle, revision: input.state.revision, operations: [] };
  if (current.revision !== input.expectedRevision) throw new Error('Highwall mining changed; refresh before operating.');
  const limit = input.fuelled ? 3 : 2;
  if (current.operations.length >= limit) {
    throw new Error(input.fuelled
      ? 'Highwall has completed all three mining operations this cycle.'
      : 'Highwall has completed two operations; fuel it to conduct a third this cycle.');
  }
  const rollCount = input.resource === 'materials' ? 1 : 3;
  if (input.rolls.length !== rollCount || !input.rolls.every(die)) {
    throw new Error(`Highwall ${input.resource} requires ${rollCount} server ${rollCount === 1 ? 'die' : 'dice'}.`);
  }
  const amount = input.rolls.reduce((sum, roll) => sum + roll, 0);
  const operation: HighwallMiningOperation = {
    requestId: input.requestId, resource: input.resource, rolls: [...input.rolls], amount,
  };
  return {
    state: {
      cycle: input.currentCycle,
      revision: current.revision + 1,
      operations: [...current.operations, operation],
    },
    cargo: {
      ...input.cargo,
      [input.resource]: addResourceAmount(input.cargo[input.resource], amount),
    },
    operation,
  };
}
