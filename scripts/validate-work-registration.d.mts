export interface WorkRegistrationValidationInput {
  readonly changedFiles?: readonly string[];
  readonly message?: string;
  readonly planSource?: string;
  readonly progressSource?: string;
  readonly dependencySource?: string;
  readonly parentPlanSource?: string;
  readonly parentProgressSource?: string;
  readonly parentDependencySource?: string;
  readonly coordinationPrompt?: number | string | null;
}

export interface WorkRegistrationValidationResult {
  readonly documentationOnly: boolean;
  readonly prompt: string | null;
  readonly newPrompt: boolean;
  readonly errors: readonly string[];
}

export function normalizeImplementationPrompt(value: unknown): string | null;
export function isDocumentationPath(filePath: string): boolean;
export function validateWorkRegistration(
  input?: WorkRegistrationValidationInput,
): WorkRegistrationValidationResult;
export function validateCommitRegistration(options?: {
  readonly cwd?: string;
  readonly commit?: string;
  readonly coordinationPrompt?: number | string | null;
}): WorkRegistrationValidationResult & { readonly commit: string };
export function validateCommitRange(options?: {
  readonly cwd?: string;
  readonly range?: string;
  readonly coordinationPrompt?: number | string | null;
}): {
  readonly commits: readonly string[];
  readonly results: readonly (WorkRegistrationValidationResult & { readonly commit: string })[];
  readonly errors: readonly string[];
};
export function validateStagedRegistration(options?: {
  readonly cwd?: string;
  readonly messageFile?: string;
  readonly coordinationPrompt?: number | string | null;
}): WorkRegistrationValidationResult;
