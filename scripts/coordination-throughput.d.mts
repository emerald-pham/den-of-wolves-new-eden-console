export const COORDINATION_THROUGHPUT_SCHEMA_VERSION: number;
export const DEFAULT_COORDINATION_LEASE_MS: number;
export const DEFAULT_VALIDATION_CONCURRENCY: number;
export const RELEASE_VERSION_PATTERN: RegExp;

export interface CoordinationThroughputEntry {
  readonly id?: string;
  readonly worktree?: string;
  readonly repositoryIdentity?: string;
  readonly repositoryRoot?: string;
  readonly status?: string;
  readonly intent?: string;
  readonly startedAt?: string;
  readonly heartbeatAt?: string;
  readonly scopes?: readonly string[];
  readonly files?: readonly string[];
  readonly claims?: readonly string[];
  readonly lease?: Readonly<Record<string, unknown>>;
  readonly [key: string]: unknown;
}

export interface CoordinationConflictForecastItem {
  readonly type: 'scope' | 'file' | 'claim';
  readonly ownerId: string;
  readonly ownerWorktree: string;
  readonly ownerIntent: string;
  readonly requested: string;
  readonly matched: string;
  readonly sameFile: boolean;
  readonly suggestion: string;
}

export interface CoordinationConflictForecast {
  readonly blocked: boolean;
  readonly conflicts: readonly CoordinationConflictForecastItem[];
  readonly suggestedScopes: readonly string[];
}

export function forecastCoordinationConflicts(options?: {
  readonly activeEntries?: readonly CoordinationThroughputEntry[];
  readonly repositoryIdentity?: string;
  readonly repositoryRoot?: string;
  readonly worktree?: string;
  readonly scopes?: readonly string[];
  readonly files?: readonly string[];
  readonly claims?: readonly string[];
}): CoordinationConflictForecast;
export function formatConflictForecast(forecast: CoordinationConflictForecast): string;

export interface CoordinationLeaseStatus {
  readonly state: 'healthy' | 'owner-confirmation-needed' | 'terminal';
  readonly ownerConfirmationRequired: boolean;
  readonly takeoverAllowed: false;
  readonly lastHeartbeatAt?: string;
  readonly expiresAt?: string;
  readonly ageMs: number;
}

export function leaseStatusForEntry(
  entry: CoordinationThroughputEntry,
  options?: { readonly now?: string | number | Date; readonly leaseMs?: number },
): CoordinationLeaseStatus;
export function coordinationTakeoverAllowed(): false;
export function refreshCoordinationLease(
  entry: CoordinationThroughputEntry,
  options?: { readonly now?: string | number | Date; readonly leaseMs?: number },
): CoordinationThroughputEntry;
export function leaseStatusesForEntries(
  entries?: readonly CoordinationThroughputEntry[],
  options?: { readonly now?: string | number | Date; readonly leaseMs?: number },
): readonly { readonly entry: CoordinationThroughputEntry; readonly lease: CoordinationLeaseStatus }[];
export function heartbeatCoordinationEntryFile(
  filePath: string,
  options: {
    readonly id: string;
    readonly worktree?: string;
    readonly now?: string | number | Date;
    readonly leaseMs?: number;
  },
): Promise<CoordinationThroughputEntry>;

export interface ValidationTicket {
  readonly id: string;
  readonly entryId: string;
  readonly worktree: string;
  readonly kind: string;
  readonly mode: 'focused' | 'expensive';
  readonly state: 'bypassed' | 'queued' | 'active';
  readonly sequence?: number;
  readonly queuedAt: string;
  readonly startedAt?: string;
  readonly heartbeatAt?: string;
  readonly lease?: Readonly<Record<string, unknown>>;
}

export interface ValidationQueueState {
  readonly version: number;
  readonly maxConcurrency: number;
  readonly nextSequence: number;
  readonly active: readonly ValidationTicket[];
  readonly pending: readonly ValidationTicket[];
}

export interface ValidationRequest {
  readonly requestId?: string;
  readonly id?: string;
  readonly entryId?: string;
  readonly worktree?: string;
  readonly kind?: string;
  readonly focused?: boolean;
  readonly release?: boolean;
  readonly profile?: string;
}

export function emptyValidationQueueState(options?: { readonly maxConcurrency?: number }): ValidationQueueState;
export function validationRequestMode(request?: ValidationRequest): 'focused' | 'expensive';
export function enqueueValidation(
  state: ValidationQueueState,
  request?: ValidationRequest,
  options?: { readonly now?: string | number | Date },
): {
  readonly state: ValidationQueueState;
  readonly ticket: ValidationTicket;
  readonly queued?: boolean;
  readonly bypassed?: boolean;
  readonly duplicate?: boolean;
};
export const queueValidationRequest: typeof enqueueValidation;
export function releaseValidationLease(
  state: ValidationQueueState,
  ticketId: string,
  options?: { readonly now?: string | number | Date },
): ValidationQueueState;
export const markValidationLeaseReleased: typeof releaseValidationLease;
export function refreshValidationLease(
  state: ValidationQueueState,
  ticketId: string,
  options?: { readonly now?: string | number | Date; readonly leaseMs?: number },
): ValidationQueueState;
export function validationLeaseStatus(
  ticket: ValidationTicket,
  options?: { readonly now?: string | number | Date; readonly leaseMs?: number },
): CoordinationLeaseStatus;
export function validationQueueStatus(state: ValidationQueueState): {
  readonly maxConcurrency: number;
  readonly active: number;
  readonly queued: number;
  readonly available: number;
  readonly activeTickets: readonly ValidationTicket[];
  readonly pendingTickets: readonly ValidationTicket[];
};

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
  readonly version?: string;
  readonly changes: readonly string[];
  readonly implementationPrompts?: readonly (number | string)[];
  readonly implementationProgress?: Readonly<Record<string, unknown>>;
  readonly changedFiles?: readonly string[];
}

export interface ReleaseLaneState {
  readonly version: number;
  readonly nextSequence: number;
  readonly fragments: readonly ReleaseFragment[];
}

export function compareReleaseVersions(left: string, right: string): -1 | 0 | 1;
export function nextReleaseVersion(version: string): string;
export function emptyReleaseLaneState(): ReleaseLaneState;
export function prepareReleaseFragment(
  state: ReleaseLaneState,
  options: {
    readonly taskId: string;
    readonly worktree: string;
    readonly changes: readonly string[];
    readonly implementationPrompts?: readonly (number | string)[];
    readonly implementationProgress?: Readonly<Record<string, unknown>>;
    readonly baseVersion: string;
  },
  operationOptions?: { readonly now?: string | number | Date },
): { readonly state: ReleaseLaneState; readonly fragment: ReleaseFragment };
export function allocateReleaseFragment(
  state: ReleaseLaneState,
  options: { readonly taskId: string; readonly currentVersion: string },
  operationOptions?: { readonly now?: string | number | Date },
): {
  readonly state: ReleaseLaneState;
  readonly fragment: ReleaseFragment;
  readonly changelogEntry?: string;
  readonly idempotent?: boolean;
};
export function renderReleaseChangelogEntry(fragment: ReleaseFragment, version?: string): string;
export function insertReleaseChangelogEntry(source: string, fragment: ReleaseFragment, version?: string): string;

export function readReleaseLaneState(filePath: string): Promise<ReleaseLaneState>;
export function prepareReleaseFragmentFile(
  filePath: string,
  options: Parameters<typeof prepareReleaseFragment>[1],
  operationOptions?: Parameters<typeof prepareReleaseFragment>[2],
): ReturnType<typeof prepareReleaseFragment> extends Promise<infer _Result>
  ? ReturnType<typeof prepareReleaseFragment>
  : Promise<ReturnType<typeof prepareReleaseFragment>>;
export function allocateReleaseFragmentFile(
  filePath: string,
  options: Parameters<typeof allocateReleaseFragment>[1],
  operationOptions?: Parameters<typeof allocateReleaseFragment>[2],
): Promise<ReturnType<typeof allocateReleaseFragment>>;

export interface AppliedReleaseFragment {
  readonly taskId: string;
  readonly fragmentId: string;
  readonly version: string;
  readonly changedFiles: readonly string[];
  readonly idempotent: boolean;
  readonly changelogEntry?: string;
}

export function applyReleaseFragment(
  filePath: string,
  options: {
    readonly taskId: string;
    readonly repositoryDirectory?: string;
    readonly packagePath?: string;
    readonly lockfilePath?: string;
    readonly changelogPath?: string;
    readonly now?: string | number | Date;
  },
): Promise<AppliedReleaseFragment>;

export function queueValidationLease(
  filePath: string,
  request: ValidationRequest,
  options?: { readonly now?: string | number | Date },
): Promise<ReturnType<typeof enqueueValidation>>;
export function releaseValidationLeaseFile(
  filePath: string,
  ticketId: string,
  options?: { readonly now?: string | number | Date },
): Promise<ValidationQueueState>;
export function heartbeatValidationLeaseFile(
  filePath: string,
  ticketId: string,
  options?: { readonly now?: string | number | Date; readonly leaseMs?: number },
): Promise<ValidationQueueState>;
export function withValidationLease<T>(
  filePath: string,
  request: ValidationRequest,
  operation: (ticket: ValidationTicket) => Promise<T> | T,
  options?: {
    readonly pollMs?: number;
    readonly timeoutMs?: number;
    readonly signal?: AbortSignal;
    readonly now?: string | number | Date;
  },
): Promise<T>;
