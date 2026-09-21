export const PRESIDENT_ACTION_KINDS = [
  'fleet-policy',
  'crisis',
  'political-capital',
  'address',
  'visit',
  'election',
] as const;
export type PresidentActionKind = typeof PRESIDENT_ACTION_KINDS[number];

export interface PresidentActionRecord {
  readonly id: string;
  readonly kind: PresidentActionKind;
  readonly text: string;
  readonly cycle: number;
  readonly recordedAt: string;
}

export interface PresidentWorkspaceState {
  readonly revision: number;
  readonly entries: readonly PresidentActionRecord[];
}

const MAX_ENTRIES = 24;
export const MAX_PRESIDENT_ACTION_LENGTH = 500;

function object(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown> : null;
}

function action(value: unknown): PresidentActionRecord | null {
  const raw = object(value);
  if (!raw || Object.keys(raw).length !== 5 ||
      !['id', 'kind', 'text', 'cycle', 'recordedAt'].every((key) => Object.hasOwn(raw, key)) ||
      typeof raw.id !== 'string' || !raw.id ||
      !PRESIDENT_ACTION_KINDS.includes(raw.kind as PresidentActionKind) ||
      typeof raw.text !== 'string' || !raw.text.trim() || raw.text.length > MAX_PRESIDENT_ACTION_LENGTH ||
      !Number.isSafeInteger(raw.cycle) || Number(raw.cycle) < 1 ||
      typeof raw.recordedAt !== 'string' || Number.isNaN(Date.parse(raw.recordedAt))) return null;
  return {
    id: raw.id,
    kind: raw.kind as PresidentActionKind,
    text: raw.text.trim(),
    cycle: Number(raw.cycle),
    recordedAt: raw.recordedAt,
  };
}

export function presidentWorkspaceState(value: unknown): PresidentWorkspaceState {
  if (value === undefined) return { revision: 0, entries: [] };
  const raw = object(value);
  if (!raw || Object.keys(raw).length !== 2 ||
      !Object.hasOwn(raw, 'revision') || !Object.hasOwn(raw, 'entries') ||
      !Number.isSafeInteger(raw.revision) || Number(raw.revision) < 0 ||
      !Array.isArray(raw.entries) || raw.entries.length > MAX_ENTRIES) {
    throw new Error('Invalid stored President workspace state.');
  }
  const entries = raw.entries.map(action);
  if (entries.some((entry) => entry === null) ||
      new Set(entries.map((entry) => entry!.id)).size !== entries.length) {
    throw new Error('Invalid stored President workspace state.');
  }
  return { revision: Number(raw.revision), entries: entries as PresidentActionRecord[] };
}

export function recordPresidentAction(input: Readonly<{
  current: unknown;
  expectedRevision: number;
  id: string;
  kind: PresidentActionKind;
  text: string;
  cycle: number;
  recordedAt: string;
}>): PresidentWorkspaceState {
  const current = presidentWorkspaceState(input.current);
  if (current.revision >= Number.MAX_SAFE_INTEGER ||
      !Number.isSafeInteger(input.expectedRevision) ||
      input.expectedRevision >= Number.MAX_SAFE_INTEGER) {
    throw new Error('President workspace revision cannot advance safely.');
  }
  if (current.revision !== input.expectedRevision) {
    throw new Error('President workspace changed. Wait for the live update and try again.');
  }
  const next = action({
    id: input.id,
    kind: input.kind,
    text: input.text,
    cycle: input.cycle,
    recordedAt: input.recordedAt,
  });
  if (!next) throw new Error('Invalid President action record.');
  return {
    revision: current.revision + 1,
    entries: [...current.entries, next].slice(-MAX_ENTRIES),
  };
}
