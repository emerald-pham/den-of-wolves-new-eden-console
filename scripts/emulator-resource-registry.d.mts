export const CODEX_COORDINATION_FILE_ENV: string;
export const COORDINATION_FILE_ENV: string;
export const COORDINATION_SCHEMA_VERSION: number;
export const COORDINATION_SCOPE: string;
export const DEFAULT_VERSION_AGREEMENT: string;

export type WorkType = 'product' | 'tooling' | 'documentation' | 'investigation';
export type ChangeClass = 'feature' | 'non-feature';

export interface CoordinationReservation {
  readonly id?: string;
  readonly slot: number;
  readonly worktree: string;
  readonly kind: string;
  readonly pid: number;
  readonly childPid?: number;
  readonly command?: string;
  readonly claimedAt?: string;
  readonly ports?: readonly number[];
}

export interface ConfiguredEmulatorSlot {
  readonly id: string;
  readonly slot: number;
  readonly worktree: string;
  readonly configuredAt: string;
  readonly ports?: readonly number[];
}

export interface CoordinationLeaseStatus {
  readonly state: 'healthy' | 'owner-confirmation-needed' | 'parked-no-heartbeat-required' | 'terminal';
  readonly ownerConfirmationRequired: boolean;
  readonly takeoverAllowed: false;
  readonly lastHeartbeatAt?: string;
  readonly expiresAt?: string;
  readonly ageMs?: number;
}

export interface CoordinationParkRecord {
  readonly status: 'parked' | 'resumed';
  readonly parkedAt: string;
  readonly resumedAt?: string;
  readonly checkpointSha: string;
  readonly worktree: string;
  readonly branchName: string;
  readonly nextAction: string;
}

export interface ValidationProfile {
  readonly kind: 'docs' | 'tooling' | 'focused' | 'copy-only' | 'full';
  readonly reason: string;
  readonly commands: readonly string[];
  readonly requiresReview?: boolean;
  readonly reviewReason?: string;
  readonly evidence?: Readonly<Record<string, unknown>>;
}

export interface ValidationRecord {
  readonly passed: boolean;
  readonly commitSha: string;
  readonly profile: ValidationProfile;
  readonly files: readonly string[];
  readonly commands: readonly string[];
  readonly outcomes: readonly Readonly<Record<string, unknown>>[];
  readonly baseSha?: string;
  readonly diffIdentity?: string;
  readonly review?: string;
  readonly error?: string;
  readonly validatedAt: string;
}

export interface CoordinationEntry {
  readonly id: string;
  readonly worktree: string;
  readonly pid?: number;
  readonly startedAt: string;
  readonly heartbeatAt?: string;
  readonly status: 'active' | 'parked' | 'complete' | string;
  readonly branchName?: string;
  readonly startBranchSha?: string;
  readonly startMainSha?: string;
  readonly repositoryRoot?: string;
  readonly repositoryIdentity?: string;
  readonly intent?: string;
  readonly versionPlan?: string;
  readonly preemptiveChangelog?: string;
  readonly workType?: WorkType;
  readonly changeClass?: ChangeClass;
  readonly implementationPrompt?: string;
  readonly scopes?: readonly string[];
  readonly requestedScopes?: readonly string[];
  readonly claims?: readonly string[];
  readonly requestedClaims?: readonly string[];
  readonly resources?: readonly string[];
  readonly parked?: CoordinationParkRecord;
  readonly parkedAt?: string;
  readonly resumedAt?: string;
  readonly lease?: CoordinationLeaseStatus;
  readonly amendments?: readonly Readonly<Record<string, unknown>>[];
  readonly claimReleases?: readonly Readonly<Record<string, unknown>>[];
  readonly validation?: ValidationRecord;
  readonly validationHistory?: readonly ValidationRecord[];
  readonly validationReused?: boolean;
  readonly outcome?: 'landed' | 'preserved' | 'discarded';
  readonly preservation?: Readonly<Record<string, unknown>>;
  readonly discard?: Readonly<Record<string, unknown>>;
  readonly completedAt?: string;
  readonly result?: string;
  readonly finalBranchName?: string;
  readonly finalBranchSha?: string;
  readonly mainSha?: string;
  readonly originMainSha?: string;
  readonly pushed?: boolean;
  readonly [key: string]: unknown;
}

export interface CoordinationState {
  readonly version: number;
  readonly scope: string;
  readonly versionAgreement: string;
  readonly entries: readonly CoordinationEntry[];
  readonly reservations: readonly CoordinationReservation[];
  readonly configurations: readonly ConfiguredEmulatorSlot[];
  readonly [key: string]: unknown;
}

export interface CoordinationConflictForecastItem {
  readonly type: 'claim' | 'resource';
  readonly ownerId: string;
  readonly ownerWorktree: string;
  readonly ownerIntent: string;
  readonly requested: string;
  readonly matched: string;
  readonly sameFile: boolean;
  readonly suggestion: string;
  readonly lease: CoordinationLeaseStatus;
}

export interface CoordinationConflictForecast {
  readonly blocked: boolean;
  readonly conflicts: readonly CoordinationConflictForecastItem[];
  readonly suggestedScopes: readonly string[];
}

export interface ChangelogSnapshotEntry {
  readonly version: string;
  readonly source: string;
}

export interface ReleaseState {
  readonly branchName: string;
  readonly branchSha: string;
  readonly mainSha: string;
  readonly originTrackingMainSha?: string;
  readonly originMainSha: string;
  readonly mainContainsBranch: boolean;
  readonly mainIsAncestorOfBranch: boolean;
  readonly worktreeClean: boolean;
  readonly startBranchSha?: string;
  readonly branchBaselineIsAncestor?: boolean;
  readonly changedFiles: readonly string[];
  readonly branchVersion: string;
  readonly mainVersion: string;
  readonly branchLockVersion: string;
  readonly mainLockVersion: string;
  readonly branchChangelog: readonly ChangelogSnapshotEntry[];
  readonly mainChangelog: readonly ChangelogSnapshotEntry[];
  readonly validationProfile?: ValidationProfile;
  readonly validation?: ValidationRecord;
}

export interface ReleaseFragment {
  readonly id: string;
  readonly sequence: number;
  readonly taskId: string;
  readonly worktree: string;
  readonly state: 'prepared' | 'allocated' | 'landed';
  readonly preparedAt: string;
  readonly allocatedAt?: string;
  readonly landedAt?: string;
  readonly baseVersion?: string;
  readonly baseMainSha?: string;
  readonly coordinationEntryId?: string;
  readonly coordinationBranchName?: string;
  readonly coordinationBranchSha?: string;
  readonly version?: string;
  readonly changes: readonly string[];
  readonly [key: string]: unknown;
}

export interface ReleaseLaneState {
  readonly version: number;
  readonly nextSequence: number;
  readonly fragments: readonly ReleaseFragment[];
  readonly finalization?: Readonly<Record<string, unknown>>;
}

export interface AppliedReleaseFragment {
  readonly taskId: string;
  readonly fragmentId: string;
  readonly version: string;
  readonly changedFiles: readonly string[];
  readonly idempotent: boolean;
  readonly changelogEntry?: string;
}

export interface ValidationPlan {
  readonly documentationOnly: boolean;
  readonly requiresDocumentationReview: boolean;
  readonly requiresVisualReview: boolean;
  readonly requiresReview: boolean;
  readonly reviewReason?: string;
  readonly commands: readonly string[];
  readonly profile: ValidationProfile;
}

export function deriveCopyOnlyValidationProfile(options?: Readonly<Record<string, unknown>>): ValidationProfile;
export function validationPlanForFiles(
  changedFiles?: readonly string[],
  options?: { readonly profile?: ValidationProfile; readonly affectedTests?: readonly string[] },
): ValidationPlan;
export function coordinationFilePath(
  environment?: Readonly<Record<string, string | undefined>>,
  temporaryDirectory?: string,
): string;
export function emptyCoordinationState(): CoordinationState;
export function parseCoordinationState(content: string): CoordinationState;
export function readCoordinationState(filePath?: string): Promise<CoordinationState>;
export function coordinationStateChanged(previous: unknown, next: unknown): boolean;
export function formatCoordinationState(state: CoordinationState, options?: { readonly includeHistory?: boolean }): string;
export function findCoordinationConflict(options?: {
  readonly activeEntries?: readonly CoordinationEntry[];
  readonly repositoryIdentity?: string;
  readonly repositoryRoot?: string;
  readonly worktree?: string;
  readonly scopes?: readonly string[];
  readonly files?: readonly string[];
  readonly claims?: readonly string[];
  readonly resources?: readonly string[];
}): {
  readonly type: 'claim' | 'resource';
  readonly entry: CoordinationEntry;
  readonly requested: string;
  readonly matched: string;
} | undefined;
export function formatCoordinationConflict(conflict: {
  readonly type: 'claim' | 'resource';
  readonly entry: CoordinationEntry;
  readonly requested: string;
  readonly matched: string;
}): string;

export function normalizeGitHubOriginToSsh(originUrl: string): string;
export function ensureSshOrigin(cwd?: string): Promise<{
  readonly changed: boolean;
  readonly origin: string;
  readonly previousOrigin?: string;
}>;
export function changedFilesBaseRef(options: {
  readonly mainSha: string;
  readonly startBranchSha?: string;
  readonly mainContainsBranch: boolean;
  readonly mainIsAncestorOfBranch?: boolean;
  readonly validatedBaseSha?: string;
  readonly validatedBaseIsAncestorOfMain?: boolean;
}): string;
export function compareApplicationVersions(left: string, right: string): -1 | 0 | 1;
export function nextApplicationVersion(version: string): string;
export function parseChangelogSnapshot(source: string, applicationVersion: string): readonly ChangelogSnapshotEntry[];
export function readReleaseState(options?: {
  readonly cwd?: string;
  readonly startBranchSha?: string;
  readonly validation?: ValidationRecord;
}): Promise<ReleaseState>;
export function validateReleaseCompletion(options: {
  readonly entry: CoordinationEntry;
  readonly release: ReleaseState;
}): { readonly pushed: boolean };

export function coordinationClaimIsCrossRepository(value: unknown): boolean;
export function forecastCoordinationConflicts(options?: {
  readonly activeEntries?: readonly CoordinationEntry[];
  readonly repositoryIdentity?: string;
  readonly repositoryRoot?: string;
  readonly worktree?: string;
  readonly scopes?: readonly string[];
  readonly files?: readonly string[];
  readonly claims?: readonly string[];
  readonly resources?: readonly string[];
  readonly now?: string | number | Date;
  readonly leaseMs?: number;
}): CoordinationConflictForecast;
export function formatConflictForecast(forecast: CoordinationConflictForecast): string;
export function leaseStatusForEntry(entry: CoordinationEntry, options?: { readonly now?: string | number | Date; readonly leaseMs?: number }): CoordinationLeaseStatus;
export function leaseStatusesForEntries(entries?: readonly CoordinationEntry[], options?: { readonly now?: string | number | Date; readonly leaseMs?: number }): readonly { readonly entry: CoordinationEntry; readonly lease: CoordinationLeaseStatus }[];
export function refreshCoordinationLease(entry: CoordinationEntry, options?: { readonly now?: string | number | Date; readonly leaseMs?: number }): CoordinationEntry;
export function withValidationLease<T>(...args: readonly unknown[]): Promise<T>;
export function applyReleaseFragment(...args: readonly unknown[]): Promise<AppliedReleaseFragment>;
export function prepareReleaseFragmentFile(...args: readonly unknown[]): Promise<{ readonly state: ReleaseLaneState; readonly fragment: ReleaseFragment }>;
export function readReleaseLaneState(filePath: string): Promise<ReleaseLaneState>;

export function beginCoordinationEntry(filePath: string, options: {
  readonly intent?: string;
  readonly 'version-plan'?: string;
  readonly 'preemptive-changelog'?: string;
  readonly 'work-type'?: WorkType;
  readonly 'implementation-prompt'?: number | string;
  readonly 'change-class'?: ChangeClass;
  readonly scope?: string | readonly string[];
  readonly claims?: string | readonly string[];
  readonly resources?: string | readonly string[];
}): Promise<CoordinationEntry>;
export function amendCoordinationEntry(filePath: string, options: {
  readonly id: string;
  readonly scope?: string | readonly string[];
  readonly claims?: string | readonly string[];
  readonly claim?: string | readonly string[];
  readonly resources?: string | readonly string[];
  readonly 'implementation-prompt'?: number | string;
  readonly now?: string | number | Date;
}): Promise<CoordinationEntry>;
export function claimCoordinationEntry(filePath: string, options: Parameters<typeof amendCoordinationEntry>[1]): Promise<CoordinationEntry>;
export function heartbeatCoordinationEntry(filePath: string, options: { readonly id: string; readonly now?: string | number | Date; readonly leaseMs?: number }): Promise<CoordinationEntry>;
export function releaseCoordinationClaim(filePath: string, options: {
  readonly id: string;
  readonly scope?: string | readonly string[];
  readonly claims?: string | readonly string[];
  readonly claim?: string | readonly string[];
  readonly resources?: string | readonly string[];
  readonly now?: string | number | Date;
}): Promise<CoordinationEntry>;
export const releaseCoordinationClaims: typeof releaseCoordinationClaim;
export function forecastCoordinationEntry(filePath: string, options?: Readonly<Record<string, unknown>>): Promise<CoordinationConflictForecast>;
export function parkCoordinationEntry(filePath: string, options: {
  readonly id: string;
  readonly 'checkpoint-sha': string;
  readonly 'next-action'?: string;
  readonly now?: string | number | Date;
}): Promise<CoordinationEntry>;
export function resumeCoordinationEntry(filePath: string, options: {
  readonly id: string;
  readonly 'checkpoint-sha'?: string;
  readonly now?: string | number | Date;
}): Promise<CoordinationEntry>;

export function prepareCoordinationReleaseFragment(filePath: string, options?: Readonly<Record<string, unknown>>): Promise<{ readonly state: ReleaseLaneState; readonly fragment: ReleaseFragment }>;
export function finalizeReleaseFragment(filePath: string, options?: Readonly<Record<string, unknown>>): Promise<AppliedReleaseFragment>;
export function validateCoordinationEntry(filePath: string, options: {
  readonly id: string;
  readonly release?: ReleaseState;
  readonly commandRunner?: (command: string, cwd: string, options?: Readonly<Record<string, unknown>>) => Promise<void>;
  readonly review?: string;
  readonly 'independent-review'?: string;
  readonly force?: boolean;
  readonly forceFull?: boolean;
}): Promise<CoordinationEntry>;
export function finishCoordinationEntry(filePath: string, options: {
  readonly id: string;
  readonly result?: string;
  readonly outcome?: 'landed' | 'preserved' | 'discarded';
  readonly reason?: string;
  readonly 'preserve-ref'?: string;
  readonly preservedRefSha?: string;
  readonly release?: ReleaseState;
}): Promise<CoordinationEntry>;

export function pruneDeadReservations(state: CoordinationState, isAlive?: (pid: number) => boolean): CoordinationState;
export function pruneOrphanedConfigurations(state: CoordinationState, worktreeExists?: (worktree: string) => boolean): CoordinationState;
export function chooseAvailableEmulatorSlot(options: {
  readonly preferredSlot?: number;
  readonly availableSlots: readonly number[];
  readonly worktree: string;
  readonly kind: string;
  readonly reservations: readonly CoordinationReservation[];
}): number | undefined;
export function isPortFree(port: number, host?: string): Promise<boolean>;
export function parseListeningPortSnapshot(output?: string): ReadonlySet<number>;
export function reserveConfiguredEmulatorSlot(options: {
  readonly filePath?: string;
  readonly slot: number;
  readonly worktree?: string;
  readonly ports: readonly number[];
  readonly portCheck?: (port: number) => Promise<boolean>;
}): Promise<ConfiguredEmulatorSlot>;
export function reserveAvailableConfiguredEmulatorSlot(options: {
  readonly filePath?: string;
  readonly preferredSlot?: number;
  readonly worktree?: string;
  readonly availableSlots?: readonly number[];
  readonly portsForSlot?: (slot: number) => readonly number[];
  readonly portCheck?: (port: number) => Promise<boolean>;
}): Promise<ConfiguredEmulatorSlot>;
export function releaseConfiguredEmulatorSlot(configuration: ConfiguredEmulatorSlot, filePath?: string): Promise<void>;
export function reserveEmulatorSlot(options: {
  readonly filePath?: string;
  readonly slot: number;
  readonly worktree?: string;
  readonly kind: string;
  readonly command: string;
  readonly ports: readonly number[];
  readonly portCheck?: (port: number) => Promise<boolean>;
}): Promise<CoordinationReservation>;
export function reserveAvailableEmulatorSlot(options: {
  readonly filePath?: string;
  readonly preferredSlot?: number;
  readonly worktree?: string;
  readonly kind: string;
  readonly command: string;
  readonly availableSlots?: readonly number[];
  readonly portsForSlot?: (slot: number) => readonly number[];
  readonly portCheck?: (port: number) => Promise<boolean>;
}): Promise<CoordinationReservation>;
export function releaseEmulatorSlot(reservation: CoordinationReservation, filePath?: string): Promise<void>;
export function updateReservationChildPid(reservation: CoordinationReservation, childPid: number, filePath?: string): Promise<CoordinationReservation>;

export function prepareValidationEmulator(options?: Readonly<Record<string, unknown>>): Promise<Readonly<Record<string, unknown>>>;
export function cleanupValidationEmulator(prepared: Readonly<Record<string, unknown>>, options?: Readonly<Record<string, unknown>>): Promise<Readonly<Record<string, unknown>>>;
export function executeValidationProcess(
  command: string,
  args: readonly string[],
  cwd: string,
  options?: { readonly signalSource?: NodeJS.Process; readonly signal?: AbortSignal; readonly timeoutMs?: number },
): Promise<{ readonly stdout: string; readonly stderr: string }>;
export function runValidationCommand(command: string, cwd: string, options?: Readonly<Record<string, unknown>>): Promise<void>;
export function normalizeFilePathForValidation(filePath: string): string;
