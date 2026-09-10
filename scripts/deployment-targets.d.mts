export const ALL_DEPLOYMENT_TARGETS: readonly ['hosting', 'firestore', 'functions'];

export type DeploymentTarget = (typeof ALL_DEPLOYMENT_TARGETS)[number];

export interface DeploymentTargetClassification {
  readonly targets: readonly DeploymentTarget[];
  readonly unknownFiles: readonly string[];
  readonly ignoredFiles: readonly string[];
}

export function classifyChangedFiles(
  files: readonly string[],
  options?: { readonly manual?: boolean },
): DeploymentTargetClassification;

export function formatGitHubOutputs(result: DeploymentTargetClassification): string;
