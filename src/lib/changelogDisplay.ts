export interface ChangelogDisplayEntry {
  readonly version: string;
  readonly changes: readonly string[];
}

export interface ChangelogDisplayProgress {
  readonly completed: number;
  readonly total: number;
  readonly percentage: string;
  readonly done: number;
  readonly partial: number;
  readonly active: number;
  readonly missing: number;
  readonly blocked: number;
}

export interface ChangelogDisplayPayload {
  readonly currentProgress: ChangelogDisplayProgress;
  readonly entries: readonly ChangelogDisplayEntry[];
}

export function parseChangelogDisplay(payload: unknown): ChangelogDisplayPayload {
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
    throw new Error('The changelog display asset is malformed.');
  }

  const record = payload as Record<string, unknown>;
  const progress = record.currentProgress as Record<string, unknown> | null;
  const entries = record.entries;
  if (typeof progress !== 'object' || progress === null || !Array.isArray(entries) || entries.length === 0) {
    throw new Error('The changelog display asset is malformed.');
  }
  const fields = ['completed', 'total', 'done', 'partial', 'active', 'missing', 'blocked'] as const;
  if (fields.some((field) => !Number.isInteger(progress[field]) || Number(progress[field]) < 0)) {
    throw new Error('The changelog display asset is malformed.');
  }
  const currentProgress = Object.fromEntries(fields.map((field) => [field, Number(progress[field])])) as
    Omit<ChangelogDisplayProgress, 'percentage'>;
  const expectedPercentage = currentProgress.total === 0
    ? '0.00%'
    : `${((currentProgress.done / currentProgress.total) * 100).toFixed(2)}%`;
  if (
    typeof progress.percentage !== 'string'
    || progress.percentage !== expectedPercentage
    || currentProgress.completed !== currentProgress.done
    || currentProgress.done + currentProgress.partial + currentProgress.active
      + currentProgress.missing + currentProgress.blocked
      !== currentProgress.total
  ) {
    throw new Error('The changelog display asset is malformed.');
  }

  const versions = new Set<string>();
  const parsedEntries = entries.map((item: unknown) => {
    if (typeof item !== 'object' || item === null || Array.isArray(item)) {
      throw new Error('The changelog display asset is malformed.');
    }

    const record = item as Record<string, unknown>;
    const { version, changes } = record;
    if (
      typeof version !== 'string'
      || version.trim().length === 0
      || versions.has(version)
      || !Array.isArray(changes)
      || changes.some((change) => typeof change !== 'string')
    ) {
      throw new Error('The changelog display asset is malformed.');
    }
    versions.add(version);
    return { version, changes: [...changes] };
  });
  return {
    currentProgress: { ...currentProgress, percentage: progress.percentage },
    entries: parsedEntries,
  };
}

export async function loadChangelogDisplay(
  url: string,
  fetcher: typeof fetch = globalThis.fetch,
): Promise<ChangelogDisplayPayload> {
  const response = await fetcher(url);
  if (!response.ok) throw new Error('The changelog display asset could not be loaded.');
  return parseChangelogDisplay(await response.json());
}
