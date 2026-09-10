export interface FunctionsArtifactVerification {
  artifactDirectory: string;
  entrypoint: string;
  dependencies: string[];
}

export function verifyFunctionsArtifact(
  artifactDirectory: string,
): Promise<FunctionsArtifactVerification>;
