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
