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
  options?: { readonly manual?: boolean },
): RiskGateProfile;

export function formatRiskGateOutputs(profile: RiskGateProfile): string;
