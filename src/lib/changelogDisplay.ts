export interface ChangelogDisplayEntry {
  readonly version: string;
  readonly changes: readonly string[];
}

export function parseChangelogDisplay(payload: unknown): readonly ChangelogDisplayEntry[] {
  if (!Array.isArray(payload) || payload.length === 0) {
    throw new Error('The changelog display asset is malformed.');
  }

  const versions = new Set<string>();
  return payload.map((item: unknown) => {
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
}

export async function loadChangelogDisplay(
  url: string,
  fetcher: typeof fetch = globalThis.fetch,
): Promise<readonly ChangelogDisplayEntry[]> {
  const response = await fetcher(url);
  if (!response.ok) throw new Error('The changelog display asset could not be loaded.');
  return parseChangelogDisplay(await response.json());
}
