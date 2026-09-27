export interface ChangelogSourceEntry {
  readonly version: string;
  readonly changes: readonly string[];
}

export interface ChangelogDisplayEntry {
  readonly version: string;
  readonly changes: readonly string[];
}

/** Build the small player-facing projection without release-planning metadata. */
export function projectChangelogForDisplay(
  entries: readonly ChangelogSourceEntry[],
): readonly ChangelogDisplayEntry[] {
  return entries.map(({ version, changes }) => ({
    version,
    changes: [...changes],
  }));
}
