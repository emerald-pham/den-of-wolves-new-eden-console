import type { PoliticalCapitalAction, PoliticalCapitalState } from '@/types/game';

const ACTIONS: readonly PoliticalCapitalAction[] = ['gain', 'spend'];

export function normalizePoliticalCapital(value: unknown): PoliticalCapitalState {
  const empty: PoliticalCapitalState = { revision: 0, balance: 0, entries: [] };
  if (value === undefined) return empty;
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return empty;
  const raw = value as Record<string, unknown>;
  if (Object.keys(raw).length !== 3 || !Number.isSafeInteger(raw.revision) || Number(raw.revision) < 0 ||
      !Number.isSafeInteger(raw.balance) || Number(raw.balance) < 0 || Number(raw.balance) > 8 ||
      !Array.isArray(raw.entries) || raw.entries.length > 32) return empty;
  const ids = new Set<string>();
  const entries: PoliticalCapitalState['entries'][number][] = [];
  for (const value of raw.entries) {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return empty;
    const entry = value as Record<string, unknown>;
    if (Object.keys(entry).length !== 9 || typeof entry.id !== 'string' || !entry.id || ids.has(entry.id) ||
        !ACTIONS.includes(entry.action as PoliticalCapitalAction) || entry.amount !== 1 ||
        !Number.isSafeInteger(entry.balanceAfter) || Number(entry.balanceAfter) < 0 || Number(entry.balanceAfter) > 8 ||
        typeof entry.crisisId !== 'string' || !entry.crisisId || entry.crisisId.length > 80 ||
        !Number.isSafeInteger(entry.crisisRevision) || Number(entry.crisisRevision) < 1 ||
        typeof entry.crisisTitle !== 'string' || !entry.crisisTitle.trim() || entry.crisisTitle.length > 160 ||
        !Number.isSafeInteger(entry.cycle) || Number(entry.cycle) < 1 ||
        typeof entry.recordedAt !== 'string' || Number.isNaN(Date.parse(entry.recordedAt))) return empty;
    ids.add(entry.id);
    entries.push({ id: entry.id, action: entry.action as PoliticalCapitalAction, amount: 1,
      balanceAfter: Number(entry.balanceAfter), crisisId: entry.crisisId,
      crisisRevision: Number(entry.crisisRevision), crisisTitle: entry.crisisTitle.trim(),
      cycle: Number(entry.cycle), recordedAt: entry.recordedAt });
  }
  if (entries.length !== Math.min(Number(raw.revision), 32) ||
      (entries.length === 0 && Number(raw.balance) !== 0) ||
      (Number(raw.revision) <= 32 && entries.length > 0 &&
        (entries[0]!.action !== 'gain' || entries[0]!.balanceAfter !== 1)) ||
      (Number(raw.revision) > 32 && entries.length > 0 &&
        (entries[0]!.action === 'gain' ? entries[0]!.balanceAfter < 1 : entries[0]!.balanceAfter > 7)) ||
      entries.slice(1).some((value, index) => value.balanceAfter !==
        entries[index]!.balanceAfter + (value.action === 'gain' ? 1 : -1)) ||
      (entries.length > 0 && entries[entries.length - 1]!.balanceAfter !== Number(raw.balance))) return empty;
  return { revision: Number(raw.revision), balance: Number(raw.balance), entries };
}
