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
