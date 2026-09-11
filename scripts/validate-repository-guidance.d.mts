export interface PromptDependencyCompletionInput {
  dependencySource?: string;
  progressSource?: string;
}

export function validatePromptDependencyCompletion(
  input?: PromptDependencyCompletionInput,
): string[];

export interface PromptDependencyGuidanceInput {
  sources: ReadonlyMap<string, string>;
  errors: string[];
}

export function validatePromptDependencyGuidance(
  input: PromptDependencyGuidanceInput,
): void;

export function validatePromptDependencyConcurrency(
  input: PromptDependencyGuidanceInput,
): void;

export function validateAgentModelEscalation(
  input: PromptDependencyGuidanceInput,
): void;

export function validateSessionGoalGuidance(
  input: PromptDependencyGuidanceInput,
): void;

export function validateBlockedMergeAgentHandoff(
  input: PromptDependencyGuidanceInput,
): void;

export function validateRiskBasedGuidance(
  input: PromptDependencyGuidanceInput,
): void;

export interface CampaignPlaybookInput {
  source?: string;
  errors: string[];
}

export function validateCampaignPlaybook(
  input: CampaignPlaybookInput,
): void;

export interface DocumentationValidationInput {
  cwd?: string;
  files?: string[];
}

export function validateDocumentation(
  input?: DocumentationValidationInput,
): string[];
