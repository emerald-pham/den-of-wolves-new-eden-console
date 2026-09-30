export interface ChangelogSourceEntry {
  readonly version: string;
  readonly changes: readonly string[];
  readonly implementationProgress?: Omit<ChangelogDisplayProgress, 'blocked'> & {
    readonly blocked?: number;
  };
}

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

/** Build the small player-facing projection without release-planning metadata. */
export function projectChangelogForDisplay(
  entries: readonly ChangelogSourceEntry[],
): ChangelogDisplayPayload {
  const currentProgress = entries[0]?.implementationProgress;
  if (!currentProgress) throw new Error('The current changelog entry has no implementation progress.');
  return {
    currentProgress: { ...currentProgress, blocked: currentProgress.blocked ?? 0 },
    entries: entries.map(({ version, changes }) => ({
      version,
      changes: [...changes],
    })),
  };
}
