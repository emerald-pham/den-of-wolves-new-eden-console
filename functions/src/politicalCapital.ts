export const MAX_POLITICAL_CAPITAL = 8;
export const POLITICAL_CAPITAL_ACTIONS = ['gain', 'spend'] as const;
export type PoliticalCapitalAction = typeof POLITICAL_CAPITAL_ACTIONS[number];

export interface PoliticalCapitalEntry {
  readonly id: string;
  readonly action: PoliticalCapitalAction;
  readonly amount: 1;
  readonly balanceAfter: number;
  readonly crisisId: string;
  readonly crisisRevision: number;
  readonly crisisTitle: string;
  readonly cycle: number;
  readonly recordedAt: string;
}

export interface PoliticalCapitalState {
  readonly revision: number;
  readonly balance: number;
  readonly entries: readonly PoliticalCapitalEntry[];
}

const MAX_ENTRIES = 32;

function object(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown> : null;
}

function entry(value: unknown): PoliticalCapitalEntry | null {
  const raw = object(value);
  if (!raw || Object.keys(raw).length !== 9 ||
      !['id', 'action', 'amount', 'balanceAfter', 'crisisId', 'crisisRevision',
        'crisisTitle', 'cycle', 'recordedAt'].every(key => Object.hasOwn(raw, key)) ||
      typeof raw.id !== 'string' || !raw.id ||
      !POLITICAL_CAPITAL_ACTIONS.includes(raw.action as PoliticalCapitalAction) ||
      raw.amount !== 1 || !Number.isSafeInteger(raw.balanceAfter) ||
      Number(raw.balanceAfter) < 0 || Number(raw.balanceAfter) > MAX_POLITICAL_CAPITAL ||
      typeof raw.crisisId !== 'string' || !raw.crisisId || raw.crisisId.length > 80 ||
      !Number.isSafeInteger(raw.crisisRevision) || Number(raw.crisisRevision) < 1 ||
      typeof raw.crisisTitle !== 'string' || !raw.crisisTitle.trim() || raw.crisisTitle.length > 160 ||
      !Number.isSafeInteger(raw.cycle) || Number(raw.cycle) < 1 ||
      typeof raw.recordedAt !== 'string' || Number.isNaN(Date.parse(raw.recordedAt))) return null;
  return {
    id: raw.id, action: raw.action as PoliticalCapitalAction, amount: 1,
    balanceAfter: Number(raw.balanceAfter), crisisId: raw.crisisId,
    crisisRevision: Number(raw.crisisRevision), crisisTitle: raw.crisisTitle.trim(),
    cycle: Number(raw.cycle), recordedAt: raw.recordedAt,
  };
}

export function politicalCapitalState(value: unknown): PoliticalCapitalState {
  if (value === undefined) return { revision: 0, balance: 0, entries: [] };
  const raw = object(value);
  if (!raw || Object.keys(raw).length !== 3 ||
      !Number.isSafeInteger(raw.revision) || Number(raw.revision) < 0 ||
      !Number.isSafeInteger(raw.balance) || Number(raw.balance) < 0 ||
      Number(raw.balance) > MAX_POLITICAL_CAPITAL || !Array.isArray(raw.entries) ||
      raw.entries.length > MAX_ENTRIES) throw new Error('Invalid stored political capital state.');
  const entries = raw.entries.map(entry);
  if (entries.some(value => value === null) ||
      new Set(entries.map(value => value!.id)).size !== entries.length ||
      entries.length !== Math.min(Number(raw.revision), MAX_ENTRIES) ||
      (entries.length === 0 && Number(raw.balance) !== 0) ||
      (Number(raw.revision) <= MAX_ENTRIES && entries.length > 0 &&
        (entries[0]!.action !== 'gain' || entries[0]!.balanceAfter !== 1)) ||
      (Number(raw.revision) > MAX_ENTRIES && entries.length > 0 &&
        (entries[0]!.action === 'gain' ? entries[0]!.balanceAfter < 1 : entries[0]!.balanceAfter > 7)) ||
      entries.slice(1).some((value, index) => value!.balanceAfter !==
        entries[index]!.balanceAfter + (value!.action === 'gain' ? 1 : -1)) ||
      (entries.length > 0 && entries[entries.length - 1]!.balanceAfter !== Number(raw.balance))) {
    throw new Error('Invalid stored political capital state.');
  }
  return { revision: Number(raw.revision), balance: Number(raw.balance), entries: entries as PoliticalCapitalEntry[] };
}

export function applyPoliticalCapital(input: Readonly<{
  current: unknown;
  expectedRevision: number;
  id: string;
  action: PoliticalCapitalAction;
  crisisId: string;
  crisisRevision: number;
  crisisTitle: string;
  cycle: number;
  recordedAt: string;
}>): PoliticalCapitalState {
  const current = politicalCapitalState(input.current);
  if (current.revision >= Number.MAX_SAFE_INTEGER || !Number.isSafeInteger(input.expectedRevision) ||
      input.expectedRevision >= Number.MAX_SAFE_INTEGER) throw new Error('Political capital revision cannot advance safely.');
  if (current.revision !== input.expectedRevision) throw new Error('Political capital changed. Wait for the live update and try again.');
  if (input.action === 'gain' && current.entries.some(value =>
    value.action === 'gain' && value.crisisId === input.crisisId)) {
    throw new Error('This crisis has already granted political capital.');
  }
  const balance = current.balance + (input.action === 'gain' ? 1 : -1);
  if (balance < 0) throw new Error('Political capital cannot fall below zero.');
  if (balance > MAX_POLITICAL_CAPITAL) throw new Error(`Political capital cannot exceed ${MAX_POLITICAL_CAPITAL}.`);
  const next = entry({
    id: input.id, action: input.action, amount: 1, balanceAfter: balance,
    crisisId: input.crisisId, crisisRevision: input.crisisRevision,
    crisisTitle: input.crisisTitle, cycle: input.cycle, recordedAt: input.recordedAt,
  });
  if (!next) throw new Error('Invalid political capital entry.');
  return { revision: current.revision + 1, balance, entries: [...current.entries, next].slice(-MAX_ENTRIES) };
}
