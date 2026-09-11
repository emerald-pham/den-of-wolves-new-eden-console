export interface ImplementationProgressSummary {
  readonly complete: number;
  readonly total: number;
  readonly partial: number;
  readonly missing: number;
  readonly blocked: number;
  readonly inProgress: number;
  readonly resumePrompt: string | null;
  readonly activePrompt: string | null;
}

export interface ReleaseFragmentValidationResult {
  readonly errors: readonly string[];
  readonly fragment: Readonly<Record<string, unknown>>;
}

export interface ImplementationProgressValidationResult {
  readonly errors: readonly string[];
  readonly releaseProgress?: Readonly<Record<string, unknown>> | null;
  readonly validatedFragment?: Readonly<Record<string, unknown>>;
  readonly summary: ImplementationProgressSummary | null;
}

export interface ImplementationProgressInputs {
  readonly catalogSource: string;
  readonly progressSource: string;
  readonly planSource: string;
  readonly changelogSource: string;
  readonly applicationVersion: string;
}

export function normalizePromptId(value: number | string): string | null;

export function validateReleaseFragment(options: {
  readonly fragment?: Readonly<Record<string, unknown>> | null;
  readonly progressSource?: string;
  readonly planSource?: string;
  readonly catalogSource?: string;
  readonly applicationVersion?: string;
  readonly requiredPrompt?: number | string | null;
  readonly postRelease?: boolean;
}): ReleaseFragmentValidationResult;

export function validateImplementationProgress(options: {
  readonly catalogSource?: string;
  readonly progressSource?: string;
  readonly planSource?: string;
  readonly changelogSource?: string;
  readonly applicationVersion?: string;
  readonly requiredPrompt?: number | string | null;
  readonly validatedFragment?: Readonly<Record<string, unknown>> | null;
  readonly releaseFragment?: Readonly<Record<string, unknown>> | null;
}): ImplementationProgressValidationResult;

export function formatImplementationProgress(
  summary: ImplementationProgressSummary | null | undefined,
): string;

export function readImplementationProgress(options?: { readonly cwd?: string }): ImplementationProgressInputs;
