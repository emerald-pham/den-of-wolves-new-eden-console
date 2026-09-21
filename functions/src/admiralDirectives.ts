export const ADMIRAL_DIRECTIVE_KINDS = ['fleet-policy', 'defence-coordination'] as const;
export type AdmiralDirectiveKind = typeof ADMIRAL_DIRECTIVE_KINDS[number];

export interface AdmiralDirective {
  readonly id: string;
  readonly kind: AdmiralDirectiveKind;
  readonly text: string;
  readonly cycle: number;
  readonly publishedAt: string;
}

export interface AdmiralDirectiveState {
  readonly revision: number;
  readonly entries: readonly AdmiralDirective[];
}

const MAX_DIRECTIVES = 12;
export const MAX_ADMIRAL_DIRECTIVE_LENGTH = 500;

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function directive(value: unknown): AdmiralDirective | undefined {
  const input = record(value);
  if (!input || typeof input.id !== 'string' || !input.id ||
      !ADMIRAL_DIRECTIVE_KINDS.includes(input.kind as AdmiralDirectiveKind) ||
      typeof input.text !== 'string' || !input.text.trim() ||
      input.text.length > MAX_ADMIRAL_DIRECTIVE_LENGTH ||
      !Number.isSafeInteger(input.cycle) || Number(input.cycle) < 0 ||
      typeof input.publishedAt !== 'string' || Number.isNaN(Date.parse(input.publishedAt))) {
    return undefined;
  }
  return {
    id: input.id,
    kind: input.kind as AdmiralDirectiveKind,
    text: input.text.trim(),
    cycle: Number(input.cycle),
    publishedAt: input.publishedAt,
  };
}

export function admiralDirectiveState(value: unknown): AdmiralDirectiveState {
  if (value === undefined) return { revision: 0, entries: [] };
  const input = record(value);
  if (!input || !Number.isSafeInteger(input.revision) || Number(input.revision) < 0 ||
      !Array.isArray(input.entries) || input.entries.length > MAX_DIRECTIVES) {
    throw new Error('Invalid stored Admiral directive state.');
  }
  const entries = input.entries.map((entry) => {
    const parsed = directive(entry);
    if (!parsed) throw new Error('Invalid stored Admiral directive state.');
    return parsed;
  });
  return { revision: Number(input.revision), entries };
}

export function publishAdmiralDirective(input: Readonly<{
  current: unknown;
  expectedRevision: number;
  id: string;
  kind: AdmiralDirectiveKind;
  text: string;
  cycle: number;
  publishedAt: string;
}>): AdmiralDirectiveState {
  const current = admiralDirectiveState(input.current);
  if (current.revision !== input.expectedRevision) {
    throw new Error('Admiral directives changed. Wait for the live update and try again.');
  }
  const text = input.text.trim();
  if (!ADMIRAL_DIRECTIVE_KINDS.includes(input.kind) || !text ||
      text.length > MAX_ADMIRAL_DIRECTIVE_LENGTH ||
      !Number.isSafeInteger(input.cycle) || input.cycle < 0 ||
      !input.id || Number.isNaN(Date.parse(input.publishedAt))) {
    throw new Error('Invalid Admiral directive.');
  }
  const entry: AdmiralDirective = {
    id: input.id,
    kind: input.kind,
    text,
    cycle: input.cycle,
    publishedAt: input.publishedAt,
  };
  return {
    revision: current.revision + 1,
    entries: [...current.entries, entry].slice(-MAX_DIRECTIVES),
  };
}
