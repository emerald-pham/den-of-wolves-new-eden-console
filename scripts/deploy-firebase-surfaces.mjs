import { spawn } from 'node:child_process';
import { pathToFileURL } from 'node:url';

// Firebase recommends at most ten named Functions per deployment to avoid
// mutation-rate and startup-capacity quotas. Keep the audited selector intact.
export const FUNCTIONS_PER_BATCH = 10;

export function deploymentBatches(deployOnly) {
  if (typeof deployOnly !== 'string' || !deployOnly.trim()) {
    throw new Error('An explicit Firebase deployment selector is required.');
  }
  const targets = deployOnly.split(',').map(target => target.trim());
  if (new Set(targets).size !== targets.length || targets.some(target =>
    target !== 'hosting' && target !== 'firestore' &&
    !/^functions:[A-Za-z][A-Za-z0-9_]*$/.test(target))) {
    throw new Error('Only unique Hosting, Firestore, and named Function targets are permitted.');
  }
  const functions = targets.filter(target => target.startsWith('functions:'));
  const surfaces = targets.filter(target => !target.startsWith('functions:'));
  const batches = [];
  for (let index = 0; index < functions.length; index += FUNCTIONS_PER_BATCH) {
    batches.push(functions.slice(index, index + FUNCTIONS_PER_BATCH));
  }
  // Publish the web release after all selected backend updates have succeeded.
  if (surfaces.length) batches.push(surfaces);
  return batches;
}

function runCommand(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: 'inherit', shell: false });
    child.once('error', reject);
    child.once('close', (code, signal) => {
      if (code === 0) resolve();
      else reject(new Error('Firebase deployment failed (' + (signal ?? code) + ').'));
    });
  });
}

export async function deployFirebaseSurfaces({ project, deployOnly, run = runCommand,
  log = console.log } = {}) {
  if (typeof project !== 'string' || !/^[a-z][a-z0-9-]{4,28}[a-z0-9]$/.test(project)) {
    throw new Error('A valid explicit Firebase project ID is required.');
  }
  const batches = deploymentBatches(deployOnly);
  for (const [index, targets] of batches.entries()) {
    log('Deploying Firebase batch ' + (index + 1) + '/' + batches.length + ': ' + targets.join(','));
    await run('npx', ['--yes', 'firebase-tools@15.29.0', 'deploy', '--project', project,
      '--only', targets.join(','), '--non-interactive', '--force']);
  }
  return { batches: batches.length };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  deployFirebaseSurfaces({ project: process.argv[2], deployOnly: process.argv[3] }).catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
