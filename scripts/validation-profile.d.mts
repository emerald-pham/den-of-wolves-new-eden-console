export type ValidationProfileKind = 'docs' | 'tooling' | 'focused' | 'copy-only' | 'full';

export interface ValidationProfile {
  readonly kind: ValidationProfileKind;
  readonly reason: string;
  readonly commands: readonly string[];
  readonly requiresReview?: boolean;
  readonly reviewReason?: string;
  readonly evidence?: Record<string, unknown>;
}

export const COPY_ONLY_VALIDATION_COMMANDS: readonly string[];
export const FULL_VALIDATION_COMMANDS_LIST: readonly string[];

export function deriveValidationProfile(options?: {
  readonly changedFiles?: readonly string[];
  readonly affectedTests?: readonly string[];
  readonly forceFull?: boolean;
  readonly repositoryDirectory?: string;
}): ValidationProfile;

export const validationProfileForFiles: typeof deriveValidationProfile;

export function deriveCopyOnlyValidationProfile(options?: {
  readonly changedFiles?: readonly string[];
  readonly diffText?: string;
  readonly sources?: Record<string, { readonly before: string; readonly after: string }>;
}): ValidationProfile;
