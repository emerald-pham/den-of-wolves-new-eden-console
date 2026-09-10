import { access, readFile, stat } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';

export async function verifyFunctionsArtifact(artifactDirectory) {
  const root = resolve(artifactDirectory);
  const entrypoint = resolve(root, 'lib/index.js');
  await access(entrypoint);
  if (!(await stat(entrypoint)).isFile()) {
    throw new Error(`Functions artifact entrypoint is not a file: ${entrypoint}`);
  }
  let packageJson;
  try {
    packageJson = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'));
  } catch (error) {
    throw new Error(`Functions artifact package.json is unavailable: ${root}`, { cause: error });
  }
  const dependencies = Object.keys(packageJson?.dependencies ?? {}).sort();
  const requireFromArtifact = createRequire(resolve(root, 'package.json'));
  for (const dependency of dependencies) {
    try {
      requireFromArtifact.resolve(dependency);
    } catch (error) {
      throw new Error(`Missing Functions runtime dependency: ${dependency}`, { cause: error });
    }
  }
  return { artifactDirectory: root, entrypoint, dependencies };
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
