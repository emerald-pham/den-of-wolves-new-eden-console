import type { PresidentActionKind, PresidentWorkspaceState } from '@/types/game';

const KINDS: readonly PresidentActionKind[] = [
  'fleet-policy', 'crisis', 'political-capital', 'address', 'visit', 'election',
];

export function normalizePresidentWorkspace(value: unknown): PresidentWorkspaceState {
  if (value === undefined) return { revision: 0, entries: [] };
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return { revision: 0, entries: [] };
  }
  const input = value as Record<string, unknown>;
  if (Object.keys(input).length !== 2 || !Number.isSafeInteger(input.revision) ||
      Number(input.revision) < 0 || !Array.isArray(input.entries) || input.entries.length > 24) {
    return { revision: 0, entries: [] };
  }
  const entries: PresidentWorkspaceState['entries'][number][] = [];
  const ids = new Set<string>();
  for (const candidate of input.entries) {
    if (typeof candidate !== 'object' || candidate === null || Array.isArray(candidate)) {
      return { revision: 0, entries: [] };
    }
    const entry = candidate as Record<string, unknown>;
    if (Object.keys(entry).length !== 5 || typeof entry.id !== 'string' || !entry.id || ids.has(entry.id) ||
        !KINDS.includes(entry.kind as PresidentActionKind) || typeof entry.text !== 'string' ||
        !entry.text.trim() || entry.text.length > 500 || !Number.isSafeInteger(entry.cycle) ||
        Number(entry.cycle) < 1 || typeof entry.recordedAt !== 'string' ||
        Number.isNaN(Date.parse(entry.recordedAt))) return { revision: 0, entries: [] };
    ids.add(entry.id);
    entries.push({ id: entry.id, kind: entry.kind as PresidentActionKind,
      text: entry.text.trim(), cycle: Number(entry.cycle), recordedAt: entry.recordedAt });
  }
  return { revision: Number(input.revision), entries };
}
