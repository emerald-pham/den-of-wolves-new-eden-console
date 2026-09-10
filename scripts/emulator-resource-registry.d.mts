export const CODEX_COORDINATION_FILE_ENV: string;
export const COORDINATION_FILE_ENV: string;
export const COORDINATION_SCHEMA_VERSION: number;
export const COORDINATION_SCOPE: string;
export const DEFAULT_VERSION_AGREEMENT: string;

export interface CoordinationReservation {
  readonly id?: string;
  readonly slot: number;
  readonly worktree: string;
  readonly kind: string;
  readonly pid: number;
  readonly childPid?: number;
  readonly command: string;
  readonly claimedAt: string;
  readonly ports?: readonly number[];
}

export interface CoordinationEntry {
  readonly id: string;
  readonly worktree: string;
  readonly pid?: number;
  readonly startedAt: string;
  readonly status?: string;
  readonly branchName?: string;
  readonly startBranchSha?: string;
  readonly startMainSha?: string;
  readonly repositoryRoot?: string;
  readonly intent: string;
  readonly versionPlan: string;
  readonly preemptiveChangelog: string;
  readonly resources?: readonly string[];
  readonly workType?: 'product' | 'tooling' | 'documentation' | 'investigation';
  readonly implementationPrompt?: number | string;
  readonly scopes?: readonly string[];
  readonly claims?: readonly string[];
  readonly amendments?: readonly CoordinationAmendment[];
  readonly outcome?: 'landed' | 'preserved' | 'discarded';
  readonly preservation?: {
    readonly kind: 'remote-ref';
    readonly destination: string;
    readonly commitSha: string;
    readonly verifiedAt: string;
  };
  readonly discard?: {
    readonly reason: string;
    readonly branchSha: string;
    readonly changedFiles: readonly string[];
  };
  readonly completedAt?: string;
  readonly result?: string;
  readonly finalBranchName?: string;
  readonly finalBranchSha?: string;
  readonly mainSha?: string;
  readonly originMainSha?: string;
  readonly mainContainsBranch?: boolean;
  readonly pushed?: boolean;
  readonly validation?: ValidationReceipt;
  readonly validationHistory?: readonly ValidationReceipt[];
  readonly validationReused?: boolean;
}

export interface CoordinationAmendment {
  readonly amendedAt: string;
  readonly worktree: string;
  readonly branchName: string;
  readonly scopes: readonly string[];
  readonly claims: readonly string[];
}

export interface ValidationReceipt {
  readonly commitSha: string;
  readonly completedAt: string;
  readonly passed: boolean;
  readonly commands: readonly string[];
  readonly files: readonly string[];
  readonly docsOnly: boolean;
  readonly inputFingerprint?: {
    readonly schemaVersion: number;
    readonly identity: string;
  };
  readonly profile?: {
    readonly kind: 'full' | 'copy-only';
    readonly reason: string;
    readonly commands: readonly string[];
    readonly evidence?: {
      readonly baseSha: string;
      readonly branchSha: string;
      readonly diffIdentity: string;
    };
  };
  readonly emulator?: {
    readonly setup: 'auto' | 'existing';
    readonly configurationId?: string;
    readonly slot?: number;
    readonly preexistingConfigIdentity?: string;
    readonly generatedFiles?: readonly {
      readonly path: string;
      readonly identity: {
        readonly contentHash: string;
        readonly device: number;
        readonly inode: number;
        readonly mtimeNs: string;
        readonly ctimeNs: string;
      };
    }[];
    readonly cleanup?: Readonly<Record<string, unknown>>;
  };
  readonly reviews?: {
    readonly documentation?: string;
    readonly visual?: string;
  };
  readonly provenanceRefresh?: {
    readonly previousCommitSha: string;
    readonly previousTaskTipSha: string;
    readonly files: readonly string[];
  };
}

export interface ValidationPlan {
  readonly documentationOnly: boolean;
  readonly requiresDocumentationReview: boolean;
  readonly requiresVisualReview: boolean;
  readonly commands: readonly string[];
  readonly profile?: {
    readonly kind: 'full' | 'copy-only';
    readonly reason: string;
    readonly commands: readonly string[];
    readonly evidence?: {
      readonly baseSha: string;
      readonly branchSha: string;
      readonly diffIdentity: string;
    };
  };
}

export interface ChangelogSnapshotEntry {
  readonly version: string;
  readonly source: string;
}

export interface ReleaseState {
  readonly branchName: string;
  readonly branchSha: string;
  readonly mainSha: string;
  readonly originMainSha: string;
  readonly mainContainsBranch: boolean;
  readonly mainIsAncestorOfBranch?: boolean;
  readonly worktreeClean: boolean;
  readonly startBranchSha?: string;
  readonly branchBaselineIsAncestor?: boolean;
  readonly changedFiles?: readonly string[];
  readonly branchVersion: string;
  readonly mainVersion: string;
  readonly branchLockVersion: string;
  readonly mainLockVersion: string;
  readonly branchChangelog: readonly ChangelogSnapshotEntry[];
  readonly mainChangelog: readonly ChangelogSnapshotEntry[];
  readonly validationProfile?: ValidationPlan['profile'];
}

export interface ConfiguredEmulatorSlot {
  readonly id: string;
  readonly slot: number;
  readonly worktree: string;
  readonly configuredAt: string;
  readonly ports?: readonly number[];
}

export interface CoordinationState {
  readonly version: number;
  readonly scope?: string;
  readonly versionAgreement: string;
  readonly entries: readonly CoordinationEntry[];
  readonly reservations: readonly CoordinationReservation[];
  readonly configurations: readonly ConfiguredEmulatorSlot[];
}

export function coordinationFilePath(
  environment?: Readonly<Record<string, string | undefined>>,
  temporaryDirectory?: string,
): string;
export function emptyCoordinationState(): CoordinationState;
export function parseCoordinationState(content: string): CoordinationState;
export function compareApplicationVersions(left: string, right: string): -1 | 0 | 1;
export function nextApplicationVersion(version: string): string;
export function changedFilesBaseRef(options: {
  readonly mainSha: string;
  readonly startBranchSha?: string;
  readonly mainContainsBranch: boolean;
}): string;
export function normalizeGitHubOriginToSsh(originUrl: string): string;
export function ensureSshOrigin(cwd?: string): Promise<{
  readonly changed: boolean;
  readonly origin: string;
  readonly previousOrigin?: string;
}>;
export function validationPlanForFiles(
  changedFiles?: readonly string[],
  options?: { readonly profile?: ValidationPlan['profile'] },
): ValidationPlan;
export function deriveCopyOnlyValidationProfile(options?: {
  readonly changedFiles?: readonly string[];
  readonly diffText?: string;
  readonly sources?: Readonly<Record<string, { before: string; after: string }>>;
}): {
  readonly kind: 'full' | 'copy-only';
  readonly reason: string;
  readonly commands: readonly string[];
};
export function parseChangelogSnapshot(
  source: string,
  applicationVersion: string,
): readonly ChangelogSnapshotEntry[];
export function validateReleaseCompletion(options: {
  entry: CoordinationEntry;
  release: ReleaseState;
}): { pushed: boolean };
export function validateImplementationPromptClaims(
  entries?: readonly Pick<CoordinationEntry, 'id' | 'status' | 'implementationPrompt'>[],
): ReadonlyMap<string, string>;
export function readReleaseState(options?: {
  cwd?: string;
  startBranchSha?: string;
}): Promise<ReleaseState>;
export function validateCoordinationEntry(
  filePath: string,
  options: {
    id: string;
    'start-sha'?: string;
    'documentation-review'?: string;
    'visual-review'?: string;
    release?: ReleaseState;
    commandRunner?: (command: string, cwd: string) => Promise<void>;
    repositoryDirectory?: string;
  },
): Promise<CoordinationEntry>;
export function amendCoordinationEntry(
  filePath: string,
  options: {
    id: string;
    scope?: string;
    claims?: string;
    claim?: string;
  },
): Promise<CoordinationEntry>;
export function finishCoordinationEntry(
  filePath: string,
  options: {
    id: string;
    result?: string;
    outcome?: 'landed' | 'preserved' | 'discarded';
    reason?: string;
    'preserve-ref'?: string;
    preservedRefSha?: string;
    release?: ReleaseState;
  },
): Promise<CoordinationEntry>;
export function pruneDeadReservations(
  state: CoordinationState,
  isAlive?: (pid: number) => boolean,
): CoordinationState;
export function pruneOrphanedConfigurations(
  state: CoordinationState,
  worktreeExists?: (worktree: string) => boolean,
): CoordinationState;
export function chooseAvailableEmulatorSlot(options: {
  preferredSlot?: number;
  availableSlots: readonly number[];
  worktree: string;
  kind: string;
  reservations: readonly CoordinationReservation[];
}): number | undefined;
export function isPortFree(port: number, host?: string): Promise<boolean>;
export function readCoordinationState(filePath?: string): Promise<CoordinationState>;
export function reserveConfiguredEmulatorSlot(options: {
  filePath?: string;
  slot: number;
  worktree?: string;
  ports: readonly number[];
  portCheck?: (port: number) => Promise<boolean>;
}): Promise<ConfiguredEmulatorSlot>;
export function reserveAvailableConfiguredEmulatorSlot(options: {
  filePath?: string;
  preferredSlot?: number;
  worktree?: string;
  availableSlots?: readonly number[];
  portsForSlot?: (slot: number) => readonly number[];
  portCheck?: (port: number) => Promise<boolean>;
}): Promise<ConfiguredEmulatorSlot>;
export function releaseConfiguredEmulatorSlot(
  configuration: ConfiguredEmulatorSlot,
  filePath?: string,
): Promise<void>;
export function prepareValidationEmulator(options?: Record<string, unknown>): Promise<Record<string, unknown>>;
export function cleanupValidationEmulator(
  prepared: Record<string, unknown>,
  options?: Record<string, unknown>,
): Promise<Record<string, unknown>>;
export function executeValidationProcess(
  command: string,
  args: readonly string[],
  cwd: string,
  options?: {
    readonly signalSource?: NodeJS.Process;
    readonly signal?: AbortSignal;
    readonly timeoutMs?: number;
  },
): Promise<{ readonly stdout: string; readonly stderr: string }>;
export function reserveEmulatorSlot(options: {
  filePath?: string;
  slot: number;
  worktree?: string;
  kind: string;
  command: string;
  ports: readonly number[];
  portCheck?: (port: number) => Promise<boolean>;
}): Promise<CoordinationReservation>;
export function reserveAvailableEmulatorSlot(options: {
  filePath?: string;
  preferredSlot?: number;
  worktree?: string;
  kind: string;
  command: string;
  availableSlots?: readonly number[];
  portsForSlot?: (slot: number) => readonly number[];
  portCheck?: (port: number) => Promise<boolean>;
}): Promise<CoordinationReservation>;
export function releaseEmulatorSlot(
  reservation: CoordinationReservation,
  filePath?: string,
): Promise<void>;
export function updateReservationChildPid(
  reservation: CoordinationReservation,
  childPid: number,
  filePath?: string,
): Promise<CoordinationReservation>;
export function formatCoordinationState(
  state: CoordinationState,
  options?: { includeHistory?: boolean },
): string;
