import type { RiskGateProfile } from './risk-gates.mjs';

export const ALL_DEPLOYMENT_TARGETS: readonly ['hosting', 'firestore', 'functions'];

export type DeploymentTarget = (typeof ALL_DEPLOYMENT_TARGETS)[number];

export interface DeploymentTargetClassification {
  readonly targets: readonly DeploymentTarget[];
  readonly unknownFiles: readonly string[];
  readonly ignoredFiles: readonly string[];
  readonly riskGates: RiskGateProfile;
}

export interface DeploymentRangeClassification extends DeploymentTargetClassification {
  readonly currentTip: boolean;
  readonly staleRun: boolean;
  readonly baselineAncestry: boolean;
}

export function classifyChangedFiles(
  files: readonly string[],
  options?: { readonly manual?: boolean; readonly versionMetadataOnly?: boolean },
): DeploymentTargetClassification;

export function classifyDeploymentRange(options: {
  readonly before?: string;
  readonly after?: string;
  readonly currentMainTip?: string;
  readonly manual?: boolean;
  readonly changedFiles?: readonly string[];
  readonly versionMetadataOnly?: boolean;
  readonly cwd?: string;
  readonly isAncestor?: (before: string, after: string) => boolean;
}): DeploymentRangeClassification;

export function formatGitHubOutputs(result: DeploymentTargetClassification): string;
