import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
export const PUBLIC_FUNCTIONS = Object.freeze([
  'triggerDradisContact',
  'startSinglePlayerDemo',
  'repairConsolesFromBlacksmith',
  'upgradeEndeavourFieldTargets',
]);
// Gen 2 IAM is backed by Cloud Run; only its Cloud Run invoker role proves the
// deployed callable is publicly reachable.
export const PUBLIC_INVOKER_ROLES = Object.freeze([
  'roles/run.invoker',
]);

function targetList(targets) {
  return [...new Set(String(targets).split(',').map((target) => target.trim()).filter(Boolean))];
}

function functionName(record) {
  return String(record?.name ?? '').split('/').filter(Boolean).at(-1) ?? '';
}

function cloudRunService(record, name, region) {
  const service = record?.serviceConfig?.service;
  const match = typeof service === 'string'
    ? /^projects\/[^/\s]+\/locations\/([^/\s]+)\/services\/[^/\s]+$/.exec(service)
    : null;
  if (!match || match[1] !== region) {
    throw new Error(`Function ${name} is missing a valid Cloud Run service resource.`);
  }
  return service;
}

function parseJson(output, label) {
  try {
    return JSON.parse(output);
  } catch (error) {
    throw new Error(`${label} returned invalid JSON.`, { cause: error });
  }
}

async function defaultRunCommand(command, args) {
  const result = await execFileAsync(command, args, { encoding: 'utf8' });
  return result.stdout;
}

async function verifyHosting({ hostingUrl, expectedVersion, fetchImpl }) {
  // Hosting can briefly serve the previous release after Firebase reports
  // deployment success. Keep the exact-version requirement, but allow up to
  // 30 seconds for propagation; other failures remain immediate errors.
  for (let attempt = 0; attempt < 7; attempt += 1) {
    const response = await fetchImpl(`${hostingUrl.replace(/\/$/, '')}/build-version.json`, {
      cache: 'no-store',
    });
    if (!response.ok) throw new Error(`Hosting build-version check returned HTTP ${response.status}.`);
    const metadata = await response.json();
    if (metadata?.version === expectedVersion) return;
    if (attempt === 6) {
      throw new Error(
        `Hosting version ${String(metadata?.version)} does not match expected ${expectedVersion}.`,
      );
    }
    await new Promise((resolve) => setTimeout(resolve, 5000));
  }
}

async function verifyFunctions({ projectId, region, runCommand }) {
  const listOutput = await runCommand('gcloud', [
    'functions', 'list', '--v2', `--project=${projectId}`, `--regions=${region}`, '--format=json',
  ]);
  const functions = parseJson(listOutput, 'gcloud functions list');
  if (!Array.isArray(functions) || functions.length === 0) {
    throw new Error('No deployed second-generation Functions were returned.');
  }

  const byName = new Map(functions.map((record) => [functionName(record), record]));
  for (const record of functions) {
    if (record?.state !== 'ACTIVE') {
      throw new Error(`Function ${functionName(record) || '<unknown>'} is ${String(record?.state)}.`);
    }
  }

  for (const name of PUBLIC_FUNCTIONS) {
    const record = byName.get(name);
    if (!record) throw new Error(`Required public Function ${name} is not deployed.`);
    const service = cloudRunService(record, name, region);
    // Cloud Functions v2 exposes callable invoker IAM on its backing Cloud Run
    // service; the v2 function resource policy is not the public endpoint gate.
    const policyOutput = await runCommand('gcloud', [
      'run', 'services', 'get-iam-policy', service, `--project=${projectId}`,
      `--region=${region}`, '--format=json',
    ]);
    const policy = parseJson(policyOutput, `IAM policy for ${name}`);
    const publicInvoker = Array.isArray(policy?.bindings) && policy.bindings.some((binding) =>
      PUBLIC_INVOKER_ROLES.includes(binding?.role) && Array.isArray(binding.members) &&
      binding.members.includes('allUsers'));
    if (!publicInvoker) throw new Error(`Function ${name} is missing its public invoker policy.`);
  }
}

function revisionFromService(service) {
  const revision = service?.status?.latestReadyRevisionName;
  if (typeof revision !== 'string' || !revision.trim()) {
    throw new Error('Cloud Run service has no ready revision name.');
  }
  return revision;
}

export async function captureFunctionRevisions({ functionNames, projectId, region = 'us-central1', runCommand = defaultRunCommand } = {}) {
  const names = [...new Set(String(functionNames ?? '').split(',').map((name) => name.trim()).filter(Boolean))];
  if (!names.length) throw new Error('At least one named Function is required for revision capture.');
  const listOutput = await runCommand('gcloud', [
    'functions', 'list', '--v2', `--project=${projectId}`, `--regions=${region}`, '--format=json',
  ]);
  const functions = parseJson(listOutput, 'gcloud functions list');
  if (!Array.isArray(functions)) throw new Error('gcloud functions list returned an invalid response.');
  const byName = new Map(functions.map((record) => [functionName(record), record]));
  const revisions = {};
  for (const name of names) {
    const functionRecord = byName.get(name);
    if (!functionRecord) {
      // A successful, region-scoped list is the only evidence that a named
      // Function has not yet been deployed. Command/API failures remain fatal.
      revisions[name] = null;
      continue;
    }
    const serviceResource = cloudRunService(functionRecord, name, region);
    const serviceName = serviceResource.split('/').at(-1);
    const serviceState = parseJson(await runCommand('gcloud', [
      'run', 'services', 'describe', serviceName, `--project=${projectId}`, `--region=${region}`, '--format=json',
    ]), `Cloud Run service for ${name}`);
    revisions[name] = revisionFromService(serviceState);
  }
  return revisions;
}

async function verifySelectedFunctionRevisions({ functionNames, previousRevisions, projectId, region, runCommand }) {
  const names = [...new Set(String(functionNames ?? '').split(',').map((name) => name.trim()).filter(Boolean))];
  if (!names.length) return;
  if (!previousRevisions || typeof previousRevisions !== 'object') {
    throw new Error('Selected Function deployment verification requires pre-deploy revisions.');
  }
  const current = await captureFunctionRevisions({ functionNames: names.join(','), projectId, region, runCommand });
  for (const name of names) {
    const before = previousRevisions[name];
    const after = current[name];
    if (typeof after !== 'string' || !after.trim()) {
      throw new Error(`Function ${name} did not publish a ready revision.`);
    }
    if (before === null) continue;
    if (typeof before !== 'string' || !before.trim()) {
      throw new Error(`No pre-deploy ready revision was captured for ${name}.`);
    }
    if (after === before) {
      throw new Error(`Function ${name} did not publish a new ready revision; still ${before}.`);
    }
  }
}

async function verifyFirestore({ projectId, runCommand }) {
  const output = await runCommand('gcloud', [
    'firestore', 'databases', 'describe', '--database=(default)',
    `--project=${projectId}`, '--format=json',
  ]);
  const database = parseJson(output, 'gcloud firestore databases describe');
  const expectedName = `projects/${projectId}/databases/(default)`;
  const validResource = database?.name === expectedName &&
    database?.type === 'FIRESTORE_NATIVE' && !database?.deleteTime;
  if (!validResource) {
    throw new Error('The expected default Firestore Native database does not exist.');
  }
}

export async function verifyDeployment({
  targets,
  projectId,
  expectedVersion,
  hostingUrl = `https://${projectId}.web.app`,
  region = 'us-central1',
  functionNames = '',
  previousFunctionRevisions,
  fetchImpl = globalThis.fetch,
  runCommand = defaultRunCommand,
} = {}) {
  const selectedTargets = targetList(targets);
  const result = { hosting: false, firestore: false, functions: false };
  if (selectedTargets.includes('hosting')) {
    if (typeof fetchImpl !== 'function') throw new Error('Hosting verification requires fetch.');
    await verifyHosting({ hostingUrl, expectedVersion, fetchImpl });
    result.hosting = true;
  }
  if (selectedTargets.includes('functions')) {
    await verifyFunctions({ projectId, region, runCommand });
    await verifySelectedFunctionRevisions({ functionNames, previousRevisions: previousFunctionRevisions, projectId, region, runCommand });
    result.functions = true;
  }
  if (selectedTargets.includes('firestore')) {
    await verifyFirestore({ projectId, runCommand });
    result.firestore = true;
  }
  return result;
}

function parseOptions(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const name = argv[index];
    const value = argv[index + 1];
    if (!name?.startsWith('--') || value === undefined) {
      throw new Error('Usage: verify-deployment.mjs --targets <targets> --project <project> --version <version> [--function-names <names> --function-revisions-file <path>] | --capture-functions <names> --project <project> --output <path>');
    }
    options[name.slice(2)] = value;
    index += 1;
  }
  return options;
}

if (process.argv[1] && process.argv[1].endsWith('/verify-deployment.mjs')) {
  const options = parseOptions(process.argv.slice(2));
  if (options['capture-functions']) {
    captureFunctionRevisions({
      functionNames: options['capture-functions'],
      projectId: options.project,
      region: options.region || undefined,
    }).then(async (revisions) => {
      const { writeFile } = await import('node:fs/promises');
      await writeFile(options.output, `${JSON.stringify(revisions, null, 2)}\n`, 'utf8');
      console.log('Pre-deploy Function revisions captured.');
    }).catch((error) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    });
  } else {
    const { readFile } = await import('node:fs/promises');
    const previousFunctionRevisions = options['function-revisions-file']
      ? JSON.parse(await readFile(options['function-revisions-file'], 'utf8'))
      : undefined;
    verifyDeployment({
    targets: options.targets,
    projectId: options.project,
    expectedVersion: options.version,
    hostingUrl: options['hosting-url'] || undefined,
    region: options.region || undefined,
    functionNames: options['function-names'] || '',
    previousFunctionRevisions,
  }).then(() => {
    console.log('Deployment verification passed.');
  }).catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
  }
}
