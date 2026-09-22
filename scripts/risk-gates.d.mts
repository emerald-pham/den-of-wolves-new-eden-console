export interface RiskGateProfile {
  readonly documentationOnly: boolean;
  readonly roadmapChanged: boolean;
  readonly rootInstall: boolean;
  readonly functionsInstall: boolean;
  readonly lint: boolean;
  readonly unit: boolean;
  readonly functions: boolean;
  readonly firestore: boolean;
  readonly webBuild: boolean;
  readonly ticker: boolean;
  readonly font: boolean;
  readonly render: boolean;
  readonly bundle: boolean;
}

export function classifyRiskGates(
  files: readonly string[],
  options?: { readonly manual?: boolean; readonly versionMetadataOnly?: boolean },
): RiskGateProfile;

export function isVersionMetadataOnlyPackageChange(options: {
  readonly beforePackage?: unknown;
  readonly afterPackage?: unknown;
  readonly beforeLockfile?: unknown;
  readonly afterLockfile?: unknown;
}): boolean;

export function formatRiskGateOutputs(profile: RiskGateProfile): string;
