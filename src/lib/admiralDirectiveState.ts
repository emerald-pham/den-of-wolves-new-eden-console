import type { AdmiralDirectiveState, AdmiralDirectiveKind } from '@/types/game';

const KINDS: readonly AdmiralDirectiveKind[] = ['fleet-policy', 'defence-coordination'];

export function normalizeAdmiralDirectives(value: unknown): AdmiralDirectiveState {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return { revision: 0, entries: [] };
  }
  const input = value as Record<string, unknown>;
  const revision = Number.isSafeInteger(input.revision) && Number(input.revision) >= 0
    ? Number(input.revision)
    : 0;
  const entries = Array.isArray(input.entries) ? input.entries.flatMap((candidate) => {
    if (typeof candidate !== 'object' || candidate === null || Array.isArray(candidate)) return [];
    const entry = candidate as Record<string, unknown>;
    if (typeof entry.id !== 'string' || !entry.id ||
        !KINDS.includes(entry.kind as AdmiralDirectiveKind) ||
        typeof entry.text !== 'string' || !entry.text.trim() || entry.text.length > 500 ||
        !Number.isSafeInteger(entry.cycle) || Number(entry.cycle) < 0 ||
        typeof entry.publishedAt !== 'string' || Number.isNaN(Date.parse(entry.publishedAt))) return [];
    return [{
      id: entry.id,
      kind: entry.kind as AdmiralDirectiveKind,
      text: entry.text.trim(),
      cycle: Number(entry.cycle),
      publishedAt: entry.publishedAt,
    }];
  }).slice(-12) : [];
  return { revision, entries };
}
