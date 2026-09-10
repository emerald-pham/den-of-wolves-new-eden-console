export const PUBLIC_FUNCTIONS: readonly ['triggerDradisContact', 'startSinglePlayerDemo'];
export const PUBLIC_INVOKER_ROLES: readonly ['roles/run.invoker'];

export interface DeploymentVerificationResult {
  readonly hosting: boolean;
  readonly firestore: boolean;
  readonly functions: boolean;
}

export interface DeploymentFetchResponse {
  readonly ok: boolean;
  readonly status?: number;
  json(): Promise<unknown>;
}

export interface DeploymentVerificationOptions {
  readonly targets: string | readonly string[];
  readonly projectId: string;
  readonly expectedVersion: string;
  readonly hostingUrl?: string;
  readonly region?: string;
  readonly fetchImpl?: (
    input: string,
    init: { readonly cache: 'no-store' },
  ) => Promise<DeploymentFetchResponse>;
  readonly runCommand?: (command: string, args: readonly string[]) => Promise<string>;
}

export function verifyDeployment(
  options: DeploymentVerificationOptions,
): Promise<DeploymentVerificationResult>;
