import type { AdmiralDirectiveState, AdmiralDirectiveKind } from '@/types/game';

const KINDS: readonly AdmiralDirectiveKind[] = ['fleet-policy', 'defence-coordination'];

export function normalizeAdmiralDirectives(value: unknown): AdmiralDirectiveState {
  if (value === undefined) return { revision: 0, entries: [] };
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return { revision: 0, entries: [] };
  }
  const input = value as Record<string, unknown>;
  if (!Number.isSafeInteger(input.revision) || Number(input.revision) < 0 ||
      !Array.isArray(input.entries) || input.entries.length > 12) {
    return { revision: 0, entries: [] };
  }
  const entries: AdmiralDirectiveState['entries'][number][] = [];
  for (const candidate of input.entries) {
    if (typeof candidate !== 'object' || candidate === null || Array.isArray(candidate)) {
      return { revision: 0, entries: [] };
    }
    const entry = candidate as Record<string, unknown>;
    if (typeof entry.id !== 'string' || !entry.id ||
        !KINDS.includes(entry.kind as AdmiralDirectiveKind) ||
        typeof entry.text !== 'string' || !entry.text.trim() || entry.text.length > 500 ||
        !Number.isSafeInteger(entry.cycle) || Number(entry.cycle) < 0 ||
        typeof entry.publishedAt !== 'string' || Number.isNaN(Date.parse(entry.publishedAt))) {
      return { revision: 0, entries: [] };
    }
    entries.push({
      id: entry.id,
      kind: entry.kind as AdmiralDirectiveKind,
      text: entry.text.trim(),
      cycle: Number(entry.cycle),
      publishedAt: entry.publishedAt,
    });
  }
  return { revision: Number(input.revision), entries };
}
