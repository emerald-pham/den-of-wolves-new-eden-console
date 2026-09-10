import { access } from 'node:fs/promises';
import { resolve } from 'node:path';

export async function verifyFunctionsArtifact(artifactDirectory) {
  const root = resolve(artifactDirectory);
  const entrypoint = resolve(root, 'lib/index.js');
  await access(entrypoint);
  return { artifactDirectory: root, entrypoint };
}

if (process.argv[1] && process.argv[1].endsWith('/verify-functions-artifact.mjs')) {
  const artifactDirectory = process.argv[2];
  if (!artifactDirectory) throw new Error('Usage: verify-functions-artifact.mjs <functions-directory>');
  verifyFunctionsArtifact(artifactDirectory)
    .then(({ entrypoint }) => console.log(`Verified Functions artifact: ${entrypoint}`))
    .catch((error) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    });
}
