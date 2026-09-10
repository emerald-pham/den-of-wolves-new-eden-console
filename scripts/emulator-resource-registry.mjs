#!/usr/bin/env node
import { createHash, randomUUID } from 'node:crypto';
import {
  link,
  mkdir,
  open,
  readFile,
  readdir,
  readlink,
  rename,
  stat,
  unlink,
  writeFile,
} from 'node:fs/promises';
import { execFile, spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { basename, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import {
  EMULATOR_SLOT_COUNT,
  emulatorEnvironmentForSlot,
  emulatorPortsForSlot,
  firebaseConfigForSlot,
  vitePortForSlot,
} from './emulator-slots.js';
import { deriveCopyOnlyValidationProfile } from './validation-profile.mjs';
import {
  applyReleaseFragment,
  formatConflictForecast,
  forecastCoordinationConflicts,
  leaseStatusForEntry,
  leaseStatusesForEntries,
  prepareReleaseFragmentFile,
  readReleaseLaneState,
  refreshCoordinationLease,
  withValidationLease,
} from './coordination-throughput.mjs';

export { deriveCopyOnlyValidationProfile } from './validation-profile.mjs';
export {
  applyReleaseFragment,
  formatConflictForecast,
  forecastCoordinationConflicts,
  leaseStatusForEntry,
  leaseStatusesForEntries,
  prepareReleaseFragmentFile,
  readReleaseLaneState,
  refreshCoordinationLease,
  withValidationLease,
} from './coordination-throughput.mjs';
import {
  normalizePromptId,
  readImplementationProgress,
  validateReleaseFragment,
  validateImplementationProgress,
} from './validate-implementation-progress.mjs';
import {
  isTestFilePath,
  measureTestGrowth,
  reviewTestGrowth,
} from './test-growth-gate.mjs';

export const CODEX_COORDINATION_FILE_ENV = 'CODEX_COORDINATION_FILE';
export const COORDINATION_FILE_ENV = 'DOW_EMULATOR_COORDINATION_FILE';
export const COORDINATION_SCHEMA_VERSION = 1;
export const COORDINATION_SCOPE = 'codex-wide';
export const DEFAULT_VERSION_AGREEMENT =
  'Increment the patch version for each completed player-facing fix; roll 0.x.99 over to 0.(x+1).0; do not bump tooling-only work.';

const DEFAULT_COORDINATION_FILE = 'den-of-wolves-new-eden-coordination.json';
const LOCK_RETRY_MS = 50;
const LOCK_ATTEMPTS = 600;
const EMPTY_LOCK_GRACE_MS = 1_000;
const VALIDATION_INPUT_FINGERPRINT_SCHEMA_VERSION = 1;
const APPLICATION_VERSION_PATTERN = /^(\d+)\.(\d+)\.(\d+)$/;
const MAX_APPLICATION_PATCH_VERSION = 99;
const IMPLEMENTATION_PROMPT_CLAIM_PATTERN = /^\d{3}[a-z]*$/i;
const execFileAsync = promisify(execFile);

/**
 * Validate active plan-prompt ownership before a coordination entry is saved.
 * Different base/lettered IDs are independent claims; the same normalized ID
 * can have only one active owner across the shared coordination registry.
 */
export function validateImplementationPromptClaims(entries = []) {
  const owners = new Map();
  for (const entry of entries) {
    if (entry?.status !== 'active' || entry?.implementationPrompt === undefined) continue;
    const prompt = normalizePromptId(entry.implementationPrompt);
    if (!prompt || !IMPLEMENTATION_PROMPT_CLAIM_PATTERN.test(prompt)) {
      throw new Error(
        `active entry ${text(entry.id, 'unknown')} has an invalid implementation prompt ${String(entry.implementationPrompt)}`,
      );
    }
    const owner = text(entry.id, 'unknown');
    if (owners.has(prompt)) {
      throw new Error(`Prompt ${prompt} is already claimed by ${owners.get(prompt)}; active entry ${owner} cannot claim it.`);
    }
    owners.set(prompt, owner);
  }
  return owners;
}

function objectRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value
    : {};
}

function text(value, fallback = '') {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

/** Keep GitHub repository transport on SSH while preserving other remotes. */
export function normalizeGitHubOriginToSsh(originUrl) {
  const origin = typeof originUrl === 'string' ? originUrl.trim() : '';
  const match = origin.match(/^https:\/\/github\.com\/(.+)$/i);
  return match ? `git@github.com:${match[1]}` : origin;
}

function isDocumentationFile(filePath) {
  const fileName = basename(filePath);
  return /\.mdx?$/i.test(fileName) || fileName === 'README' || /^README\./i.test(fileName);
}

function isVisualFile(filePath) {
  return /\.(css|html|jsx|scss|tsx)$/i.test(filePath) ||
    /(^|\/)src\/(components|routes|styles)\//.test(filePath);
}

/** Derive the checks and explicit human attestations required by changed files. */
export function validationPlanForFiles(changedFiles = [], { profile } = {}) {
  const files = (Array.isArray(changedFiles) ? changedFiles : [])
    .filter((filePath) => typeof filePath === 'string' && filePath.trim());
  const documentationOnly = files.length > 0 && files.every(isDocumentationFile);
  const requiresDocumentationReview = files.some(isDocumentationFile);
  const commands = documentationOnly
    ? ['git diff --check', 'npm run coordination:docs']
    : profile?.kind === 'copy-only'
      ? ['git diff --check', ...profile.commands]
    : [
        'git diff --check',
        'npm run validate:implementation-progress',
        'npm run lint',
        'npm run test:all',
        'npm run build',
        'npm run build --prefix functions',
        ...(requiresDocumentationReview ? ['npm run coordination:docs'] : []),
      ];
  return {
    documentationOnly,
    requiresDocumentationReview,
    requiresVisualReview: files.some(isVisualFile),
    commands,
    ...(profile ? { profile } : {}),
  };
}

function contentIdentity(content) {
  return createHash('sha256').update(content).digest('hex');
}

async function optionalFileContentIdentity(path) {
  try {
    return contentIdentity(await readFile(path));
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
}

async function directoryContentIdentity(path) {
  const hash = createHash('sha256');
  const ignoredDirectories = new Set(['.cache', '.vite', '.vite-temp']);
  async function visit(directory, relativeDirectory = '') {
    const entries = (await readdir(directory, { withFileTypes: true }))
      .sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      if (entry.isDirectory() && ignoredDirectories.has(entry.name)) continue;
      const relativePath = relativeDirectory
        ? `${relativeDirectory}/${entry.name}`
        : entry.name;
      const absolutePath = resolve(directory, entry.name);
      if (entry.isDirectory()) {
        hash.update(`directory\0${relativePath}\0`);
        await visit(absolutePath, relativePath);
      } else if (entry.isSymbolicLink()) {
        hash.update(`symlink\0${relativePath}\0${await readlink(absolutePath)}\0`);
      } else if (entry.isFile()) {
        hash.update(`file\0${relativePath}\0`);
        hash.update(await readFile(absolutePath));
        hash.update('\0');
      }
    }
  }
  try {
    await visit(path);
    return hash.digest('hex');
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
}

function sortedStrings(values) {
  return Array.isArray(values)
    ? values.filter((value) => typeof value === 'string').slice().sort()
    : [];
}

function validationEntryInputs(entry) {
  return {
    id: entry.id,
    worktree: entry.worktree,
    startedAt: entry.startedAt,
    branchName: entry.branchName ?? null,
    workType: entry.workType ?? null,
    implementationPrompt: entry.implementationPrompt ?? null,
    versionPlan: entry.versionPlan ?? null,
    preemptiveChangelog: entry.preemptiveChangelog ?? null,
    scopes: sortedStrings(entry.scopes),
    claims: sortedStrings(entry.claims),
  };
}

async function validationInputFingerprint({
  entry,
  release,
  plan,
  documentationReview,
  visualReview,
  testGrowthReview,
  repositoryDirectory,
  includeFilesystemInputs = true,
  environment = process.env,
}) {
  const repositoryRoot = resolve(repositoryDirectory);
  const localInputPaths = [
    'firebase.local.json',
    '.env.emulators.local',
    '.npmrc',
    'functions/.npmrc',
  ];
  const [rootDependencies, functionDependencies, nodeBinary, ...localInputIdentities] =
    includeFilesystemInputs
      ? await Promise.all([
          directoryContentIdentity(resolve(repositoryRoot, 'node_modules')),
          directoryContentIdentity(resolve(repositoryRoot, 'functions/node_modules')),
          optionalFileContentIdentity(process.execPath),
          ...localInputPaths.map((relativePath) =>
            optionalFileContentIdentity(resolve(repositoryRoot, relativePath))),
        ])
      : [null, null, null, ...localInputPaths.map(() => null)];
  const localInputs = Object.fromEntries(
    localInputPaths.map((relativePath, index) => [
      relativePath,
      localInputIdentities[index],
    ]),
  );
  const snapshot = {
    schemaVersion: VALIDATION_INPUT_FINGERPRINT_SCHEMA_VERSION,
    entry: validationEntryInputs(entry),
    release: {
      branchName: release.branchName,
      branchSha: release.branchSha,
      mainSha: release.mainSha,
      originMainSha: release.originMainSha,
      mainContainsBranch: release.mainContainsBranch,
      mainIsAncestorOfBranch: release.mainIsAncestorOfBranch ?? null,
      worktreeClean: release.worktreeClean,
      startBranchSha: release.startBranchSha ?? null,
      branchBaselineIsAncestor: release.branchBaselineIsAncestor ?? null,
      branchVersion: release.branchVersion,
      mainVersion: release.mainVersion,
      branchLockVersion: release.branchLockVersion,
      mainLockVersion: release.mainLockVersion,
      branchChangelog: release.branchChangelog,
      mainChangelog: release.mainChangelog,
      changedFiles: sortedStrings(release.changedFiles),
      postValidationChangedFiles: sortedStrings(release.postValidationChangedFiles),
    },
    plan,
    reviews: {
      documentation: documentationReview || null,
      visual: visualReview || null,
    },
    testGrowth: testGrowthReview ?? null,
    execution: {
      repositoryRoot,
      node: process.version,
      platform: process.platform,
      architecture: process.arch,
      modulesAbi: process.versions.modules ?? null,
      v8: process.versions.v8 ?? null,
      nodeBinary,
      environment: contentIdentity(JSON.stringify(Object.entries(environment).sort())),
      dependencies: {
        root: rootDependencies,
        functions: functionDependencies,
      },
      localInputs,
    },
  };
  return {
    schemaVersion: VALIDATION_INPUT_FINGERPRINT_SCHEMA_VERSION,
    identity: contentIdentity(JSON.stringify(snapshot)),
  };
}

async function writeValidationFileAtomically(path, content) {
  const temporaryPath = `${path}.${process.pid}.${randomUUID()}.tmp`;
  try {
    const handle = await open(temporaryPath, 'wx', 0o600);
    try {
      await handle.writeFile(content, 'utf8');
    } finally {
      await handle.close();
    }
    // The temporary file is in the target directory, so a hard-link publish
    // is an atomic same-filesystem no-clobber operation. Readers see either
    // no target or the complete file; a concurrent owner gets EEXIST.
    await link(temporaryPath, path);
  } finally {
    await unlink(temporaryPath).catch(() => undefined);
  }
}

async function fileContent(path) {
  try {
    return await readFile(path, 'utf8');
  } catch (error) {
    if (error?.code === 'ENOENT') return undefined;
    throw error;
  }
}

async function fileIdentity(path) {
  try {
    const [content, metadata] = await Promise.all([fileContent(path), stat(path)]);
    if (content === undefined) return undefined;
    return {
      contentHash: contentIdentity(content),
      device: metadata.dev,
      inode: metadata.ino,
      mtimeNs: (metadata.mtimeNs ?? BigInt(Math.round(metadata.mtimeMs * 1e6))).toString(),
      ctimeNs: (metadata.ctimeNs ?? BigInt(Math.round(metadata.ctimeMs * 1e6))).toString(),
    };
  } catch (error) {
    if (error?.code === 'ENOENT') return undefined;
    throw error;
  }
}

function sameFileIdentity(left, right) {
  return Boolean(left && right &&
    left.contentHash === right.contentHash &&
    left.device === right.device &&
    left.inode === right.inode &&
    left.mtimeNs === right.mtimeNs &&
    left.ctimeNs === right.ctimeNs);
}

/**
 * Create the local emulator setup only for a full validation that needs it.
 * The returned identities make cleanup conditional: a later process or user
 * cannot have its replacement config removed by this invocation.
 */
export async function prepareValidationEmulator({
  repositoryDirectory = process.cwd(),
  coordinationPath = coordinationFilePath(),
  localFirebaseConfigPath = resolve(repositoryDirectory, 'firebase.local.json'),
  localEnvironmentPath = resolve(repositoryDirectory, '.env.emulators.local'),
  reserve = reserveAvailableConfiguredEmulatorSlot,
  release = releaseConfiguredEmulatorSlot,
  baseConfig,
  configForSlot = firebaseConfigForSlot,
  environmentForSlot = emulatorEnvironmentForSlot,
} = {}) {
  const setupLockPath = `${localFirebaseConfigPath}.validation.lock`;
  return withCoordinationLock(setupLockPath, async () => {
    const preexistingConfig = await fileIdentity(localFirebaseConfigPath);
    const preexistingEnvironment = await fileIdentity(localEnvironmentPath);
    if (preexistingConfig || process.env.CI) {
      return {
        created: false,
        configurationId: undefined,
        slot: undefined,
        preexistingConfigIdentity: preexistingConfig?.contentHash ?? 'ci-configured',
        preexistingEnvironmentIdentity: preexistingEnvironment?.contentHash,
        files: [],
      };
    }

    const configuration = await reserve({
      filePath: coordinationPath,
      worktree: repositoryDirectory,
      availableSlots: Array.from({ length: EMULATOR_SLOT_COUNT }, (_, slot) => slot),
      portsForSlot: (slot) => [
        ...Object.values(emulatorPortsForSlot(slot)),
        vitePortForSlot(slot),
      ],
    });
    const files = [];
    const prepared = {
      created: true,
      configurationId: configuration.id,
      slot: configuration.slot,
      preexistingConfigIdentity: preexistingConfig?.contentHash ?? 'absent',
      preexistingEnvironmentIdentity: preexistingEnvironment?.contentHash,
      files,
      configuration,
      coordinationPath,
    };
    try {
      const configSource = baseConfig ?? JSON.parse(
        await readFile(resolve(repositoryDirectory, 'firebase.json'), 'utf8'),
      );
      const localConfig = configForSlot(configSource, configuration.slot);
      const configContent = `${JSON.stringify(localConfig, null, 2)}\n`;
      const environment = environmentForSlot(configuration.slot);
      const environmentContent = `${Object.entries(environment)
        .map(([name, value]) => `${name}=${value}`)
        .join('\n')}\n`;
      const targets = [
        { path: localFirebaseConfigPath, content: configContent, preexisting: preexistingConfig },
        { path: localEnvironmentPath, content: environmentContent, preexisting: preexistingEnvironment },
      ];

      // The setup lock serializes same-worktree validators. Recheck every
      // path after allocation so an external writer is never overwritten.
      for (const target of targets) {
        const current = await fileIdentity(target.path);
        if (target.preexisting) {
          continue;
        }
        if (current) {
          throw new Error(
            `Emulator setup raced with another owner at ${target.path}; retry validation after preserving that config.`,
          );
        }
      }
      for (const target of targets) {
        if (target.preexisting) continue;
        await mkdir(dirname(target.path), { recursive: true });
        await writeValidationFileAtomically(target.path, target.content);
        const identity = await fileIdentity(target.path);
        if (!identity) {
          throw new Error(`Emulator setup could not verify the created file at ${target.path}.`);
        }
        files.push({ path: target.path, content: target.content, identity });
      }
    } catch (error) {
      await cleanupValidationEmulator(prepared, {
        release,
        localFirebaseConfigPath,
        localEnvironmentPath,
      });
      throw error;
    }

    return prepared;
  });
}

/** Release only this invocation's configuration and still-identical files. */
export async function cleanupValidationEmulator(
  prepared,
  {
    release = releaseConfiguredEmulatorSlot,
    localFirebaseConfigPath = resolve(process.cwd(), 'firebase.local.json'),
    localEnvironmentPath = resolve(process.cwd(), '.env.emulators.local'),
  } = {},
) {
  if (!prepared?.created) return { released: false, removedFiles: [], outcome: 'preserved' };
  const removedFiles = [];
  const cleanupErrors = [];
  try {
    for (const file of prepared.files ?? []) {
      try {
        const current = await fileIdentity(file.path);
        if (sameFileIdentity(current, file.identity)) {
          await unlink(file.path).catch((error) => {
            if (error?.code !== 'ENOENT') throw error;
          });
          removedFiles.push(file.path);
        }
      } catch (error) {
        cleanupErrors.push(error);
      }
    }
  } finally {
    // The durable row must be released even if a file is locked or replaced.
    if (prepared.configuration) {
      await release(prepared.configuration, prepared.coordinationPath);
    }
  }
  // Keep optional paths in the API for callers that used the earlier shape;
  // cleanup is driven only by the identity recorded for each created file.
  void localFirebaseConfigPath;
  void localEnvironmentPath;
  if (cleanupErrors.length > 0) throw cleanupErrors[0];
  return {
    released: Boolean(prepared.configuration?.id),
    removedFiles,
    outcome: 'cleaned',
  };
}

function normalizeChangelogSource(source) {
  return source.replace(/\s+/g, ' ').trim();
}

function normalizeChangelogEntrySource(source) {
  return normalizeChangelogSource(source).replace(
    /^version:\s*(?:APP_VERSION|['"]\d+\.\d+\.\d+['"])/,
    'version: <VERSION>',
  );
}

function parseApplicationVersion(source, ref) {
  const match = source.match(/"version"\s*:\s*"([^"]+)"/);
  const version = match?.[1];
  if (!version || !APPLICATION_VERSION_PATTERN.test(version)) {
    throw new Error(`Cannot read a valid application version from ${ref}.`);
  }
  return version;
}

function parseLockfileVersion(source, ref) {
  let lockfile;
  try {
    lockfile = JSON.parse(source);
  } catch (error) {
    throw new Error(`Cannot read ${ref} as JSON.`, { cause: error });
  }
  const version = lockfile?.packages?.['']?.version;
  if (typeof version !== 'string' || !APPLICATION_VERSION_PATTERN.test(version)) {
    throw new Error(`Cannot read a valid root package version from ${ref}.`);
  }
  return version;
}

export function compareApplicationVersions(left, right) {
  const leftParts = left.match(APPLICATION_VERSION_PATTERN);
  const rightParts = right.match(APPLICATION_VERSION_PATTERN);
  if (!leftParts || !rightParts) {
    throw new Error(`Cannot compare invalid application versions: ${left} and ${right}.`);
  }

  for (let index = 1; index <= 3; index += 1) {
    const difference = Number(leftParts[index]) - Number(rightParts[index]);
    if (difference !== 0) return difference > 0 ? 1 : -1;
  }
  return 0;
}

/** Return the next release version, rolling a patch of 99 into the middle component. */
export function nextApplicationVersion(version) {
  const parts = version.match(APPLICATION_VERSION_PATTERN);
  if (!parts) {
    throw new Error(`Cannot calculate the next application version from invalid version: ${version}.`);
  }

  const major = Number(parts[1]);
  const middle = Number(parts[2]);
  const patch = Number(parts[3]);
  if (patch >= MAX_APPLICATION_PATCH_VERSION) {
    return `${major}.${middle + 1}.0`;
  }
  return `${major}.${middle}.${patch + 1}`;
}

export function parseChangelogSnapshot(source, applicationVersion) {
  const versionPattern = /version:\s*(APP_VERSION|['"](\d+\.\d+\.\d+)['"])/g;
  const matches = [...source.matchAll(versionPattern)];
  if (matches.length === 0) {
    throw new Error('Cannot read any release entries from src/changelog.ts.');
  }

  return matches.map((match, index) => {
    const version = match[1] === 'APP_VERSION' ? applicationVersion : match[2];
    if (!version || !APPLICATION_VERSION_PATTERN.test(version)) {
      throw new Error(`Cannot read a valid changelog version near ${match[0]}.`);
    }
    const start = match.index ?? 0;
    const end = matches[index + 1]?.index ?? source.length;
    return {
      version,
      source: normalizeChangelogSource(source.slice(start, end)),
    };
  });
}

function isToolingOnlyVersionPlan(versionPlan) {
  return /tooling-only|documentation-only|no application version|no[- ]player[- ]facing change/i
    .test(versionPlan ?? '');
}

function plannedApplicationVersion(versionPlan) {
  const matches = [...(versionPlan ?? '').matchAll(/\b\d+\.\d+\.\d+\b/g)];
  return matches.at(-1)?.[0];
}

function changelogCoverageFreeSource(source) {
  return normalizeChangelogEntrySource(source)
    .replace(/\s*implementationPrompts:\s*\[[^\]]*\]\s*,?/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function changelogEntriesDifferOnlyByCoverage(mainEntry, branchEntry) {
  return changelogCoverageFreeSource(mainEntry.source) ===
    changelogCoverageFreeSource(branchEntry.source);
}

function changelogPreservationErrors(
  mainChangelog,
  branchChangelog,
  { allowVersion, allowMetadataOnly = false } = {},
) {
  const branchEntries = new Map();
  const errors = [];

  for (const entry of branchChangelog) {
    if (branchEntries.has(entry.version)) {
      errors.push(`branch changelog repeats version ${entry.version}`);
    }
    branchEntries.set(entry.version, entry);
  }

  for (const mainEntry of mainChangelog) {
    const branchEntry = branchEntries.get(mainEntry.version);
    if (!branchEntry) {
      errors.push(
        `branch changelog is missing main's ${mainEntry.version} entry and would replace newer release notes`,
      );
      continue;
    }
    if (
      normalizeChangelogEntrySource(branchEntry.source) !==
      normalizeChangelogEntrySource(mainEntry.source)
    ) {
      if (mainEntry.version === allowVersion) continue;
      if (allowMetadataOnly && changelogEntriesDifferOnlyByCoverage(mainEntry, branchEntry)) continue;
      errors.push(
        `branch changelog would replace main's ${mainEntry.version} entry`,
      );
    }
  }

  return errors;
}

function implementationPlanMetadataErrors(entry, release, releaseFragment) {
  if (entry.workType !== 'product') return [];

  const errors = [];
  const implementationPrompt = normalizePromptId(entry.implementationPrompt);
  if (!implementationPrompt || !IMPLEMENTATION_PROMPT_CLAIM_PATTERN.test(implementationPrompt)) {
    errors.push('product work must record an implementation prompt with --implementation-prompt NNN or NNN<letter>');
  }
  const changedFiles = Array.isArray(release.changedFiles) ? release.changedFiles : [];
  if (!changedFiles.includes('docs/IMPLEMENTATION_PROGRESS.md') && !releaseFragment) {
    errors.push(
      'implementation-plan product work must update docs/IMPLEMENTATION_PROGRESS.md so the prompt gate can close',
    );
  }
  return errors;
}

function implementationPlanGateErrors(entry, releaseFragment = null) {
  if (entry.workType !== 'product') return [];
  try {
    const implementationPrompt = normalizePromptId(entry.implementationPrompt);
    const result = validateImplementationProgress({
      ...readImplementationProgress({ cwd: process.cwd() }),
      requiredPrompt: implementationPrompt,
      validatedFragment: releaseFragment,
    });
    return result.errors.map((error) => `implementation progress gate: ${error}`);
  } catch (error) {
    return [
      `implementation progress gate could not run: ${error instanceof Error ? error.message : String(error)}`,
    ];
  }
}

function releaseMetadataErrors({
  entry,
  release,
  requireMerged,
  requireReconciled = false,
  releaseFragment = null,
}) {
  const errors = [];

  if (!release.branchName || release.branchName === 'HEAD') {
    errors.push('the checkout is detached');
  } else if (release.branchName === 'main') {
    errors.push('the task is running directly on main');
  }
  if (entry.branchName && release.branchName !== entry.branchName) {
    errors.push(
      `the checkout branch ${release.branchName} does not match the coordination branch ${entry.branchName}`,
    );
  }

  if (requireMerged && !release.mainContainsBranch) {
    errors.push(
      `main (${release.mainSha}) does not contain the task branch commit ${release.branchSha}`,
    );
  }
  if (requireReconciled && release.mainIsAncestorOfBranch === false) {
    errors.push(
      `the task branch does not contain current main (${release.mainSha}); reconcile main before validation`,
    );
  }

  if (release.originMainSha !== release.mainSha) {
    errors.push(
      `origin/main (${release.originMainSha}) does not match local main (${release.mainSha}); push or reconcile the main branch`,
    );
  }

  if (!release.worktreeClean) {
    errors.push('the checkout has uncommitted changes');
  }

  if (release.branchVersion !== release.branchLockVersion) {
    errors.push(
      `branch package.json version ${release.branchVersion} does not match package-lock.json version ${release.branchLockVersion}`,
    );
  }
  if (release.mainVersion !== release.mainLockVersion) {
    errors.push(
      `main package.json version ${release.mainVersion} does not match package-lock.json version ${release.mainLockVersion}`,
    );
  }

  if (release.branchChangelog[0]?.version !== release.branchVersion) {
    errors.push(
      `branch changelog newest entry does not match package.json version ${release.branchVersion}`,
    );
  }
  if (release.mainChangelog[0]?.version !== release.mainVersion) {
    errors.push(
      `main changelog newest entry does not match package.json version ${release.mainVersion}`,
    );
  }

  const toolingOnly = entry.workType
    ? entry.workType !== 'product'
    : isToolingOnlyVersionPlan(entry.versionPlan);
  if (!toolingOnly) {
    const branchParts = release.branchVersion.match(APPLICATION_VERSION_PATTERN);
    const mainParts = release.mainVersion.match(APPLICATION_VERSION_PATTERN);
    if (branchParts && Number(branchParts[3]) > MAX_APPLICATION_PATCH_VERSION) {
      errors.push(
        `player-facing application version ${release.branchVersion} exceeds patch component 99; roll over to ${nextApplicationVersion(release.mainVersion)}`,
      );
    }
    if (
      mainParts &&
      Number(mainParts[3]) >= MAX_APPLICATION_PATCH_VERSION &&
      release.branchVersion !== nextApplicationVersion(release.mainVersion)
    ) {
      errors.push(
        `application version must roll over from ${release.mainVersion} to ${nextApplicationVersion(release.mainVersion)} when the patch component reaches 99; received ${release.branchVersion}`,
      );
    }
  }

  const versionOrder = compareApplicationVersions(
    release.branchVersion,
    release.mainVersion,
  );
  if (versionOrder < 0 && !release.mainContainsBranch) {
    errors.push(
      `branch application version ${release.branchVersion} is older than main ${release.mainVersion}`,
    );
  }
  if (
    toolingOnly &&
    versionOrder !== 0 &&
    !release.mainContainsBranch
  ) {
    errors.push(
      `tooling-only work must not change the application version from ${release.mainVersion} to ${release.branchVersion}`,
    );
  }
  if (!release.mainContainsBranch && !toolingOnly) {
    const plannedVersion = plannedApplicationVersion(entry.versionPlan);
    if (release.branchVersion === release.mainVersion) {
      errors.push('player-facing work must increment the application version');
    }
    if (plannedVersion !== release.branchVersion) {
      errors.push(
        `version plan ${plannedVersion ?? 'does not name a version'} does not match branch application version ${release.branchVersion}`,
      );
    }
  }

  if (!release.mainContainsBranch) {
    errors.push(...changelogPreservationErrors(
      release.mainChangelog,
      release.branchChangelog,
      toolingOnly && release.branchVersion === release.mainVersion
        ? { allowVersion: release.mainVersion, allowMetadataOnly: true }
        : undefined,
    ));
  }

  errors.push(...implementationPlanMetadataErrors(entry, release, releaseFragment));

  return errors;
}

function normalizedPathSet(files) {
  if (!Array.isArray(files)) return { valid: false, values: [], sorted: [] };
  const values = files.map((filePath) => typeof filePath === 'string' ? filePath.trim() : '');
  const sorted = values.slice().sort();
  const hasDuplicate = sorted.some((filePath, index) => index > 0 && filePath === sorted[index - 1]);
  return {
    valid: values.every(Boolean) && !hasDuplicate,
    values,
    sorted,
  };
}

function exactArrayMatch(left, right) {
  return Array.isArray(left) && Array.isArray(right) &&
    left.length === right.length && left.every((value, index) => value === right[index]);
}

function postValidationTaskChangedFiles(entry, release) {
  if (!release.validationTaskTipSha || release.branchSha === release.validationTaskTipSha) {
    return [];
  }
  const receiptFiles = normalizedPathSet(entry.validation?.files).values;
  return (release.postValidationChangedFiles ?? [])
    .filter((filePath) => Array.isArray(entry.scopes) && entry.scopes.length > 0
      ? filesOutsideScopes([filePath], entry.scopes).length === 0
      : receiptFiles.includes(filePath));
}

function validationReceiptErrors(entry, release) {
  const errors = [];
  const receipt = entry.validation;
  const authoritativeFiles = normalizedPathSet(release.changedFiles);
  const receiptFiles = normalizedPathSet(receipt?.files);

  if (!authoritativeFiles.valid || authoritativeFiles.values.length === 0) {
    errors.push('no committed task changes were found from the coordination start SHA');
  }
  if (!receipt) {
    errors.push('no validation receipt is recorded; run coordination:validate first');
    return errors;
  }
  if (!receiptFiles.valid || receiptFiles.values.length === 0) {
    errors.push('validation receipt does not record a valid changed-file set');
  } else if (!authoritativeFiles.valid ||
    !exactArrayMatch(receiptFiles.sorted, authoritativeFiles.sorted)) {
    errors.push('validation receipt files must exactly match the authoritative changed files');
  }

  // Completion uses independently derived release evidence, never a profile
  // or file subset supplied by the receipt. Synthetic legacy fixtures without
  // Git evidence conservatively use the full validation profile.
  const expectedProfile = release.validationProfile ?? {
    kind: 'full',
    reason: 'independent committed-diff profile unavailable; full gate required',
    commands: [],
  };
  const plan = validationPlanForFiles(authoritativeFiles.values, {
    profile: expectedProfile,
  });

  const receiptCommitSha = release.validationReceiptCommitSha ?? release.branchSha;
  if (receipt.commitSha !== receiptCommitSha) {
    errors.push(
      `validation receipt commit ${receipt.commitSha} does not match receipt commit ${receiptCommitSha}`,
    );
  }
  if (release.validationTaskTipSha &&
    release.branchSha !== release.validationTaskTipSha &&
    receipt.commitSha !== release.branchSha) {
    errors.push(
      `branch ${release.branchSha} advanced after validation receipt ${receipt.commitSha}; rerun coordination:validate on the current branch`,
    );
  }
  if (release.validationTaskTipSha && release.branchSha !== release.validationTaskTipSha) {
    const postValidationTaskChanges = postValidationTaskChangedFiles(entry, release);
    if (postValidationTaskChanges.length > 0) {
      errors.push(
        `committed task changes after validated tip ${release.validationTaskTipSha} are not covered by the receipt: ${postValidationTaskChanges.join(', ')}`,
      );
    }
  }
  if (receipt.passed !== true) {
    errors.push('the recorded validation receipt is not passing');
  }
  if (receipt.docsOnly !== plan.documentationOnly) {
    errors.push('validation receipt scope does not match the current changed files');
  }
  if (!receipt.profile) {
    if (expectedProfile.kind === 'copy-only' || expectedProfile.evidence) {
      errors.push('validation receipt does not record the independently derived profile');
    }
  } else if (receipt.profile.kind !== expectedProfile.kind ||
    !exactArrayMatch(receipt.profile.commands, expectedProfile.commands)) {
    errors.push('validation receipt profile does not match the independently derived profile');
  } else if (expectedProfile.evidence) {
    const evidence = receipt.profile.evidence;
    if (!evidence || typeof evidence !== 'object' ||
      evidence.baseSha !== expectedProfile.evidence.baseSha ||
      evidence.branchSha !== expectedProfile.evidence.branchSha ||
      evidence.diffIdentity !== expectedProfile.evidence.diffIdentity) {
      errors.push('validation receipt profile evidence does not match the independently derived committed diff');
    }
  } else if (receipt.profile.evidence) {
    errors.push('validation receipt profile evidence cannot be accepted without independently derived committed-diff evidence');
  }
  const recordedCommands = Array.isArray(receipt.commands) ? receipt.commands : [];
  if (!exactArrayMatch(recordedCommands, plan.commands)) {
    errors.push('validation receipt commands do not match the independently derived command plan');
  }
  if (plan.requiresDocumentationReview && !text(receipt.reviews?.documentation)) {
    errors.push('documentation changes require a documentation review receipt');
  }
  if (plan.requiresVisualReview && !text(receipt.reviews?.visual)) {
    errors.push('UI changes require a visual review receipt');
  }
  const changedTestFiles = (release.changedFiles ?? []).filter(isTestFilePath);
  if (changedTestFiles.length > 0) {
    if (!receipt.testGrowth) {
      errors.push('test-file changes require a test-growth review receipt');
    } else if (receipt.testGrowth.passed !== true) {
      errors.push('the recorded test-growth review is not passing');
    } else if (receipt.testGrowth.reviewRequired && receipt.testGrowth.waived !== true) {
      errors.push('a required test-growth review must record an explicit justification');
    }

    const measuredTestGrowth = entry.validation?.testGrowth ?? release.testGrowth;
    if (!measuredTestGrowth) {
      errors.push('test-file changes could not be measured by the test-growth gate');
    } else if (receipt.testGrowth) {
      for (const field of [
        'baseSha',
        'headSha',
        'addedTestFiles',
        'addedTestLines',
        'addedTestCases',
        'linesPerAddedCase',
      ]) {
        if (receipt.testGrowth[field] !== measuredTestGrowth[field]) {
          errors.push(`test-growth receipt field ${field} does not match the measured diff`);
        }
      }
      if (JSON.stringify(receipt.testGrowth.changedTestFiles) !== JSON.stringify(measuredTestGrowth.changedTestFiles)) {
        errors.push('test-growth receipt changed test files do not match the measured diff');
      }
    }
  }
  return errors;
}

function testGrowthReviewForRelease({ release, justification = '' }) {
  const changedTestFiles = (release.changedFiles ?? []).filter(isTestFilePath);
  if (changedTestFiles.length === 0) return null;
  if (!release.testGrowth) {
    return {
      passed: false,
      reviewRequired: true,
      waived: false,
      message: 'Test-growth gate could not measure changed test files.',
    };
  }
  return reviewTestGrowth(release.testGrowth, justification);
}

/**
 * Validate the Git/release state before a coordination entry can become
 * historical. This is intentionally pure so the failure contract is tested
 * without depending on a particular checkout or network remote.
 */
export function validateReleaseCompletion({ entry, release, releaseFragment = null }) {
  const errors = releaseMetadataErrors({
    entry,
    release,
    requireMerged: true,
    releaseFragment,
  });
  errors.push(...validationReceiptErrors(entry, release));

  if (errors.length > 0) {
    throw new Error(
      `Cannot complete coordination entry ${entry.id}: ${errors.join('; ')}.`,
    );
  }

  return {
    pushed: release.originMainSha === release.mainSha,
  };
}

async function runGit(args, cwd = process.cwd()) {
  const result = await execFileAsync('git', args, {
    cwd,
    encoding: 'utf8',
  });
  return result.stdout.trim();
}

/** Rewrite a GitHub HTTPS origin in this checkout to its equivalent SSH URL. */
export async function ensureSshOrigin(cwd = process.cwd()) {
  const currentOrigin = await runGit(['remote', 'get-url', 'origin'], cwd);
  const sshOrigin = normalizeGitHubOriginToSsh(currentOrigin);
  if (sshOrigin === currentOrigin) {
    return { changed: false, origin: currentOrigin };
  }

  await runGit(['remote', 'set-url', 'origin', sshOrigin], cwd);
  return { changed: true, previousOrigin: currentOrigin, origin: sshOrigin };
}

async function gitIsAncestor(ancestor, descendant, cwd) {
  try {
    await runGit(['merge-base', '--is-ancestor', ancestor, descendant], cwd);
    return true;
  } catch (error) {
    if (error?.status === 1 || error?.code === 1) return false;
    throw error;
  }
}

async function readGitFile(ref, path, cwd) {
  return runGit(['show', `${ref}:${path}`], cwd);
}

export function changedFilesBaseRef({
  mainSha,
  startBranchSha,
  mainContainsBranch,
  validatedBaseSha,
  validatedBaseIsAncestorOfMain,
}) {
  if (validatedBaseSha && validatedBaseIsAncestorOfMain) {
    return validatedBaseSha;
  }
  return mainContainsBranch && startBranchSha ? startBranchSha : mainSha;
}

async function readTaskChangedFiles(baseSha, headSha, cwd) {
  const output = await runGit(['diff', '--name-only', `${baseSha}...${headSha}`], cwd);
  return output.split('\n').map((filePath) => filePath.trim()).filter(Boolean);
}

async function deriveValidationProfile({ release, startBranchSha, cwd }) {
  const validationTaskTipSha = release.validationTaskTipSha ?? release.branchSha;
  const baseSha = changedFilesBaseRef({
    mainSha: release.mainSha,
    startBranchSha,
    mainContainsBranch: release.mainContainsBranch,
    validatedBaseSha: release.validatedBaseSha,
    validatedBaseIsAncestorOfMain: release.validatedBaseIsAncestorOfMain,
  });
  const diffText = await runGit(['diff', '--unified=0', `${baseSha}...${validationTaskTipSha}`], cwd);
  const sources = {};
  for (const filePath of release.changedFiles ?? []) {
    try {
      sources[filePath] = {
        before: await runGit(['show', `${baseSha}:${filePath}`], cwd),
        after: await runGit(['show', `${validationTaskTipSha}:${filePath}`], cwd),
      };
    } catch {
      // A missing blob is intentionally a full-gate result. The classifier
      // must never infer that a new/deleted file is safe copy-only work.
      return {
        kind: 'full',
        reason: `missing Git blob for ${filePath}`,
        commands: [],
        evidence: {
          baseSha,
          branchSha: validationTaskTipSha,
          diffIdentity: contentIdentity(diffText),
        },
      };
    }
  }
  const profile = deriveCopyOnlyValidationProfile({
    changedFiles: release.changedFiles,
    diffText,
    sources,
  });
  return {
    ...profile,
    evidence: {
      baseSha,
      branchSha: validationTaskTipSha,
      diffIdentity: contentIdentity(diffText),
    },
  };
}

/** Read the live checkout and remote state used by the completion gate. */
export async function readReleaseState({ cwd = process.cwd(), startBranchSha, validation } = {}) {
  const [branchName, branchSha, mainSha, remoteMainLine] = await Promise.all([
    runGit(['rev-parse', '--abbrev-ref', 'HEAD'], cwd),
    runGit(['rev-parse', 'HEAD'], cwd),
    runGit(['rev-parse', 'main'], cwd),
    runGit(['ls-remote', '--exit-code', 'origin', 'refs/heads/main'], cwd),
  ]);
  const originMainSha = remoteMainLine.split(/\s+/)[0];
  if (!originMainSha) {
    throw new Error('Cannot verify pushed state: origin/main returned no commit.');
  }

  const [branchPackage, mainPackage, branchLockfile, mainLockfile, branchChangelog, mainChangelog, status] = await Promise.all([
    readGitFile('HEAD', 'package.json', cwd),
    readGitFile('main', 'package.json', cwd),
    readGitFile('HEAD', 'package-lock.json', cwd),
    readGitFile('main', 'package-lock.json', cwd),
    readGitFile('HEAD', 'src/changelog.ts', cwd),
    readGitFile('main', 'src/changelog.ts', cwd),
    runGit(['status', '--porcelain'], cwd),
  ]);
  const branchVersion = parseApplicationVersion(branchPackage, 'HEAD:package.json');
  const mainVersion = parseApplicationVersion(mainPackage, 'main:package.json');
  const mainContainsBranch = await gitIsAncestor(branchSha, mainSha, cwd);
  const validationTaskTipSha = validation?.passed === true &&
    typeof validation.commitSha === 'string' &&
    typeof validation.profile?.evidence?.branchSha === 'string' &&
    await gitIsAncestor(validation.commitSha, branchSha, cwd) &&
    await gitIsAncestor(validation.profile.evidence.branchSha, validation.commitSha, cwd)
    ? validation.profile.evidence.branchSha
    : undefined;
  const validationReceiptCommitSha = validationTaskTipSha
    ? validation.commitSha
    : undefined;
  let validatedBaseSha = validationTaskTipSha
    ? validation.profile.evidence.baseSha
    : undefined;
  const validatedBaseIsAncestor = validatedBaseSha
    ? await gitIsAncestor(validatedBaseSha, validationTaskTipSha, cwd)
    : false;
  const validatedBaseIsAncestorOfMain = validatedBaseSha
    ? await gitIsAncestor(validatedBaseSha, mainSha, cwd)
    : false;
  if (validatedBaseSha && validatedBaseIsAncestor) {
    const validatedDiff = await runGit(
      ['diff', '--unified=0', `${validatedBaseSha}...${validationTaskTipSha}`],
      cwd,
    );
    if (validation.profile.evidence.diffIdentity !== contentIdentity(validatedDiff) ||
      !validatedBaseIsAncestor) {
      validatedBaseSha = undefined;
    }
  }
  const changedFilesBase = changedFilesBaseRef({
    mainSha,
    startBranchSha,
    mainContainsBranch,
    validatedBaseSha: validatedBaseSha && validatedBaseIsAncestor ? validatedBaseSha : undefined,
    validatedBaseIsAncestorOfMain,
  });
  const changedFilesHead = validatedBaseSha && validationTaskTipSha
    ? validationTaskTipSha
    : branchSha;
  const changedFiles = await readTaskChangedFiles(
    changedFilesBase,
    changedFilesHead,
    cwd,
  );
  const postValidationChangedFiles = validationTaskTipSha && validationTaskTipSha !== branchSha
    ? await readTaskChangedFiles(validationTaskTipSha, branchSha, cwd)
    : [];
  const testGrowth = await measureTestGrowth({
    baseSha: changedFilesBase,
    headSha: changedFilesHead,
    cwd,
  });

  const release = {
    branchName,
    branchSha,
    mainSha,
    originMainSha,
    mainContainsBranch,
    mainIsAncestorOfBranch: await gitIsAncestor(mainSha, branchSha, cwd),
    worktreeClean: status.length === 0,
    branchVersion,
    mainVersion,
    branchLockVersion: parseLockfileVersion(branchLockfile, 'HEAD:package-lock.json'),
    mainLockVersion: parseLockfileVersion(mainLockfile, 'main:package-lock.json'),
    branchChangelog: parseChangelogSnapshot(branchChangelog, branchVersion),
    mainChangelog: parseChangelogSnapshot(mainChangelog, mainVersion),
    changedFiles,
    validatedBaseSha: validatedBaseSha && validatedBaseIsAncestor ? validatedBaseSha : undefined,
    validatedBaseIsAncestorOfMain,
    validationTaskTipSha: validatedBaseSha ? validationTaskTipSha : undefined,
    validationReceiptCommitSha: validatedBaseSha ? validationReceiptCommitSha : undefined,
    postValidationChangedFiles,
    testGrowth,
    ...(startBranchSha
      ? {
          startBranchSha,
          branchBaselineIsAncestor: await gitIsAncestor(startBranchSha, branchSha, cwd),
        }
      : {}),
  };
  return {
    ...release,
    validationProfile: await deriveValidationProfile({
      release,
      startBranchSha,
      cwd,
    }),
  };
}

const VALIDATION_COMMANDS = new Map([
  ['npm run coordination:docs', ['run', 'coordination:docs']],
  ['npm run validate:implementation-progress', ['run', 'validate:implementation-progress']],
  ['npm run lint', ['run', 'lint']],
  ['npm run test:all', ['run', 'test:all']],
  ['npm run build', ['run', 'build']],
  ['npm run build --prefix functions', ['run', 'build', '--prefix', 'functions']],
]);

function terminateValidationProcess(child, signal) {
  if (!child?.pid) return;
  if (process.platform === 'win32') {
    child.kill(signal);
    return;
  }
  try {
    process.kill(-child.pid, signal);
  } catch (error) {
    if (error?.code !== 'ESRCH') throw error;
  }
}

async function waitForValidationProcessGroupExit(pid, timeoutMs) {
  if (!pid || process.platform === 'win32') return true;
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      process.kill(-pid, 0);
    } catch (error) {
      if (error?.code === 'ESRCH') return true;
      throw error;
    }
    await delay(25);
  }
  try {
    process.kill(-pid, 0);
    return false;
  } catch (error) {
    if (error?.code === 'ESRCH') return true;
    throw error;
  }
}

const VALIDATION_PROCESS_TIMEOUT_MS = 60 * 60 * 1000;
const VALIDATION_PROCESS_ESCALATION_MS = 1_000;

export function executeValidationProcess(
  command,
  args,
  cwd,
  {
    signalSource = process,
    signal,
    timeoutMs = VALIDATION_PROCESS_TIMEOUT_MS,
  } = {},
) {
  return new Promise((resolvePromise, rejectPromise) => {
    const controller = new AbortController();
    let child;
    let receivedSignal;
    let processError;
    let stdoutLength = 0;
    let stderrLength = 0;
    const stdout = [];
    const stderr = [];
    let timeoutTimer;
    let escalationTimer;
    let settled = false;
    const cleanup = () => {
      clearTimeout(timeoutTimer);
      clearTimeout(escalationTimer);
      signalSource.removeListener('SIGINT', onInterrupt);
      signalSource.removeListener('SIGTERM', onTerminate);
      signal?.removeEventListener('abort', onAbort);
    };
    const rejectOnce = (error) => {
      if (settled) return;
      settled = true;
      cleanup();
      rejectPromise(error);
    };
    const resolveOnce = (value) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolvePromise(value);
    };
    const abort = (value) => {
      if (receivedSignal) return;
      receivedSignal = typeof value === 'string' ? value : 'SIGTERM';
      try {
        terminateValidationProcess(child, receivedSignal);
      } catch (error) {
        rejectOnce(error);
        return;
      }
      controller.abort(receivedSignal);
    };
    const onTimeout = () => {
      if (receivedSignal) return;
      receivedSignal = 'TIMEOUT';
      try {
        terminateValidationProcess(child, 'SIGTERM');
        escalationTimer = setTimeout(() => {
          if (settled) return;
          try {
            terminateValidationProcess(child, 'SIGKILL');
          } catch (error) {
            rejectOnce(error);
          }
        }, VALIDATION_PROCESS_ESCALATION_MS);
      } catch (error) {
        rejectOnce(error);
      }
    };
    const onOutput = (chunks, length, chunk) => {
      const nextLength = length + chunk.length;
      if (nextLength > 32 * 1024 * 1024) {
        processError = new Error(`${command} validation output exceeded the 32 MB limit.`);
        abort('SIGTERM');
        return length;
      }
      chunks.push(chunk);
      return nextLength;
    };
    const onInterrupt = () => abort('SIGINT');
    const onTerminate = () => abort('SIGTERM');
    const onAbort = () => abort(signal?.reason);

    if (signal) {
      if (signal.aborted) {
        abort(signal.reason);
      } else {
        signal.addEventListener('abort', onAbort, { once: true });
      }
    } else {
      signalSource.once('SIGINT', onInterrupt);
      signalSource.once('SIGTERM', onTerminate);
    }

    try {
      // execFile does not forward the detached option on this Node runtime;
      // spawn is used directly so the child becomes its own process-group
      // leader and descendants can be terminated as one bounded tree.
      child = spawn(command, args, {
        cwd,
        signal: controller.signal,
        detached: process.platform !== 'win32',
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      child.stdout?.on('data', (chunk) => {
        stdoutLength = onOutput(stdout, stdoutLength, chunk);
      });
      child.stderr?.on('data', (chunk) => {
        stderrLength = onOutput(stderr, stderrLength, chunk);
      });
      child.once('error', (error) => {
        processError ??= error;
      });
      child.once('close', async (code, signalName) => {
        if (receivedSignal || processError || code !== 0) {
          try {
            if (!receivedSignal && child?.pid) {
              terminateValidationProcess(child, 'SIGTERM');
            }
            const groupExited = await waitForValidationProcessGroupExit(
              child?.pid,
              VALIDATION_PROCESS_ESCALATION_MS,
            );
            if (!groupExited && child?.pid) {
              terminateValidationProcess(child, 'SIGKILL');
              await waitForValidationProcessGroupExit(child.pid, VALIDATION_PROCESS_ESCALATION_MS);
            }
          } catch (error) {
            processError ??= error;
          }
        }
        if (receivedSignal === 'TIMEOUT') {
          rejectOnce(new Error(
            `${command} validation timed out after ${timeoutMs}ms.`,
            { cause: processError },
          ));
        } else if (receivedSignal) {
          rejectOnce(new Error(`${command} validation was interrupted by ${receivedSignal}.`, {
            cause: processError,
          }));
        } else if (processError) {
          rejectOnce(processError);
        } else if (code !== 0) {
          const error = new Error(
            `${command} exited with ${signalName ? `signal ${signalName}` : `code ${code}`}.`,
          );
          error.code = code;
          error.signal = signalName;
          rejectOnce(error);
        } else {
          resolveOnce({
            stdout: Buffer.concat(stdout).toString('utf8'),
            stderr: Buffer.concat(stderr).toString('utf8'),
          });
        }
      });
    } catch (error) {
      rejectOnce(error);
    }
    if (timeoutMs !== undefined && timeoutMs !== null) {
      timeoutTimer = setTimeout(onTimeout, timeoutMs);
    }
  });
}

async function runValidationCommand(command, cwd, options = {}) {
  if (command === 'git diff --check') {
    await runGit(['diff', '--check', 'main...HEAD'], cwd);
    return;
  }
  const copyTestPrefix = 'npm test -- --run ';
  if (command.startsWith(copyTestPrefix)) {
    const testPath = command.slice(copyTestPrefix.length).trim();
    if (!testPath || testPath.includes('..') || testPath.startsWith('/')) {
      throw new Error(`Invalid focused copy test path: ${testPath || 'missing path'}.`);
    }
    await executeValidationProcess('npm', ['test', '--', '--run', testPath], cwd, options);
    return;
  }
  const args = VALIDATION_COMMANDS.get(command);
  if (!args) throw new Error(`No executable validation mapping exists for ${command}.`);
  await executeValidationProcess('npm', args, cwd, options);
}

function validPid(value) {
  return Number.isInteger(value) && value > 0;
}

function processIsAlive(pid) {
  if (!validPid(pid)) return false;

  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error?.code === 'EPERM';
  }
}

/** Return the one coordination file shared by every local repository on this host. */
export function coordinationFilePath(
  environment = process.env,
  temporaryDirectory = tmpdir(),
) {
  const configuredPath = [
    environment[CODEX_COORDINATION_FILE_ENV],
    environment[COORDINATION_FILE_ENV],
  ].find((candidate) => typeof candidate === 'string' && candidate.trim());
  if (typeof configuredPath === 'string' && configuredPath.trim()) {
    return resolve(configuredPath);
  }
  return resolve(temporaryDirectory, DEFAULT_COORDINATION_FILE);
}

export function emptyCoordinationState() {
  return {
    version: COORDINATION_SCHEMA_VERSION,
    scope: COORDINATION_SCOPE,
    versionAgreement: DEFAULT_VERSION_AGREEMENT,
    entries: [],
    reservations: [],
    configurations: [],
  };
}

function normalizeState(value) {
  const record = objectRecord(value);
  const entries = Array.isArray(record.entries)
    ? record.entries.filter((entry) => objectRecord(entry).id)
    : [];
  const reservations = Array.isArray(record.reservations)
    ? record.reservations.filter(
        (reservation) =>
          Number.isInteger(reservation?.slot) &&
          typeof reservation?.worktree === 'string' &&
          typeof reservation?.kind === 'string' &&
          validPid(reservation?.pid),
      )
    : [];
  const configurations = Array.isArray(record.configurations)
    ? record.configurations.filter(
        (configuration) =>
          Number.isInteger(configuration?.slot) &&
          typeof configuration?.worktree === 'string',
      )
    : [];

  return {
    version: COORDINATION_SCHEMA_VERSION,
    scope: COORDINATION_SCOPE,
    versionAgreement: text(record.versionAgreement, DEFAULT_VERSION_AGREEMENT),
    entries,
    reservations,
    configurations,
  };
}

export function parseCoordinationState(content) {
  try {
    return normalizeState(JSON.parse(content));
  } catch (error) {
    throw new Error('The shared emulator coordination file is corrupted.', {
      cause: error,
    });
  }
}

export function pruneDeadReservations(state, isAlive = processIsAlive) {
  return {
    ...state,
    reservations: state.reservations.filter(
      (reservation) => isAlive(reservation.pid) ||
        (validPid(reservation.childPid) && isAlive(reservation.childPid)),
    ),
  };
}

function normalizedList(value) {
  return text(value).split(',').map((item) => item.trim()).filter(Boolean);
}

function normalizeScope(scope) {
  const normalized = scope.replaceAll('\\', '/').replace(/^\.\//, '').replace(/\/+$/, '');
  if (!normalized || normalized.startsWith('/') || normalized.split('/').includes('..')) {
    throw new Error(`Invalid repository-relative scope: ${scope}.`);
  }
  return normalized;
}

function normalizedCoordinationOwnership(options = {}) {
  const scopes = normalizedList(options.scope).map(normalizeScope);
  const claims = [...new Set(normalizedList(options.claims ?? options.claim)
    .map((claim) => claim.toLowerCase()))].sort();
  return { scopes, claims };
}

function scopesOverlap(left, right) {
  return left === '*' || right === '*' || left === right ||
    left.startsWith(`${right}/`) || right.startsWith(`${left}/`);
}

function sameRepository(candidate, { repositoryIdentity, repositoryRoot }) {
  if (text(candidate?.repositoryIdentity) && text(repositoryIdentity)) {
    return candidate.repositoryIdentity === repositoryIdentity;
  }
  return Boolean(candidate?.repositoryRoot && repositoryRoot &&
    candidate.repositoryRoot === repositoryRoot);
}

/** Find an ownership conflict without treating Git worktrees as repositories. */
export function findCoordinationConflict({
  activeEntries = [],
  repositoryIdentity,
  repositoryRoot,
  worktree,
  scopes = [],
  claims = [],
} = {}) {
  for (const entry of Array.isArray(activeEntries) ? activeEntries : []) {
    if (entry?.status !== 'active' || entry.worktree === worktree) continue;
    const repositoryMatch = sameRepository(entry, { repositoryIdentity, repositoryRoot });
    const claim = (Array.isArray(claims) ? claims : []).find((candidateClaim) =>
      Array.isArray(entry.claims) && entry.claims.includes(candidateClaim) &&
      (candidateClaim.startsWith('emulator-slot-') || repositoryMatch));
    if (claim) {
      return { entry, type: 'claim', requested: claim, matched: claim };
    }
    if (!repositoryMatch) continue;
    for (const scope of Array.isArray(scopes) ? scopes : []) {
      const matched = (Array.isArray(entry.scopes) ? entry.scopes : [])
        .find((candidateScope) => scopesOverlap(scope, candidateScope));
      if (matched) return { entry, type: 'scope', requested: scope, matched };
    }
  }
  return undefined;
}

export function formatCoordinationConflict(conflict) {
  return `Declared ${conflict.type} "${conflict.requested}" overlaps active entry ` +
    `${conflict.entry.id} at ${conflict.entry.worktree} (matched ${conflict.type} "${conflict.matched}"). ` +
    'Coordinate ownership before starting.';
}

function filesOutsideScopes(files, scopes) {
  if (!Array.isArray(scopes) || scopes.length === 0) return [];
  return files.filter((file) => !scopes.some((scope) =>
    scope === '*' || file === scope || file.startsWith(`${scope}/`),
  ));
}

/**
 * Recover durable configuration rows when a task skipped its end cleanup.
 *
 * A configured row is needed only while its worktree has an active coordination
 * entry or a live process reservation. Completed historical entries and
 * worktrees with no live lease must not permanently consume the finite slot
 * pool. This deliberately does not infer liveness from age.
 */
export function pruneOrphanedConfigurations(state, worktreeExists = () => true) {
  const activeWorktrees = new Set(
    (Array.isArray(state.entries) ? state.entries : [])
      .filter(
        (entry) =>
          entry?.status === 'active' &&
          typeof entry.worktree === 'string' &&
          worktreeExists(entry.worktree),
      )
      .map((entry) => entry.worktree),
  );
  const liveReservationWorktrees = new Set(
    (Array.isArray(state.reservations) ? state.reservations : [])
      .filter((reservation) => typeof reservation?.worktree === 'string')
      .map((reservation) => reservation.worktree),
  );

  return {
    ...state,
    configurations: (Array.isArray(state.configurations) ? state.configurations : [])
      .filter(
        (configuration) =>
          activeWorktrees.has(configuration.worktree) ||
          liveReservationWorktrees.has(configuration.worktree),
      ),
  };
}

function reservationBlocksSlot(reservation, request) {
  if (reservation.slot !== request.slot) return false;

  // A slot is isolated between worktrees. Within one worktree, the Vite
  // process may share the Firebase processes, but two Firebase-backed
  // processes must never point at the same Firestore instance.
  if (reservation.worktree !== request.worktree) return true;
  if (reservation.kind === 'configuration' && request.kind === 'configuration') return true;
  if (reservation.kind === 'configuration') return false;
  if (reservation.kind === 'vite' || request.kind === 'vite') {
    return reservation.kind === request.kind;
  }
  return true;
}

function coordinationReservations(state) {
  return [
    ...state.reservations,
    ...state.configurations.map((configuration) => ({
      ...configuration,
      kind: 'configuration',
      pid: 0,
      command: 'configured worktree slot',
      claimedAt: configuration.configuredAt,
    })),
  ];
}

/**
 * Select a preferred slot unless a live reservation blocks it. The caller
 * still checks OS ports while holding the registry lock; this pure helper is
 * intentionally easy to exercise without starting emulators.
 */
export function chooseAvailableEmulatorSlot({
  preferredSlot,
  availableSlots,
  worktree,
  kind,
  reservations,
}) {
  const candidates = [preferredSlot, ...availableSlots].filter(
    (slot, index, allSlots) =>
      Number.isInteger(slot) && allSlots.indexOf(slot) === index,
  );

  return candidates.find(
    (slot) =>
      !reservations.some((reservation) =>
        reservationBlocksSlot(reservation, { slot, worktree, kind }),
      ),
  );
}

function reservationSummary(reservations, slot) {
  return reservations
    .filter((reservation) => reservation.slot === slot)
    .map(
      (reservation) =>
        reservation.kind === 'configuration'
          ? `configuration by ${reservation.worktree}`
          : `${reservation.kind} by ${reservation.worktree} (pid ${reservation.pid})`,
    )
    .join('; ');
}

function reservationId() {
  return `${process.pid}-${Date.now()}-${randomUUID()}`;
}

function delay(milliseconds) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds));
}

function lockOwner(content) {
  const trimmed = content.trim();
  if (!trimmed) return undefined;

  try {
    const parsed = JSON.parse(trimmed);
    if (validPid(parsed?.pid)) {
      return {
        pid: parsed.pid,
        token: typeof parsed.token === 'string' ? parsed.token : undefined,
      };
    }
  } catch {
    // Lock files from the original registry stored only the PID. Keep those
    // files recoverable while new owners use a token for safe release.
  }

  const pid = Number.parseInt(trimmed, 10);
  return validPid(pid) ? { pid, token: undefined } : undefined;
}

async function lockIsStale(lockPath) {
  try {
    const [content, metadata] = await Promise.all([
      readFile(lockPath, 'utf8'),
      stat(lockPath),
    ]);
    if (!content.trim()) {
      return Date.now() - metadata.mtimeMs >= EMPTY_LOCK_GRACE_MS;
    }

    const owner = lockOwner(content);
    return owner === undefined || !processIsAlive(owner.pid);
  } catch (error) {
    return error?.code === 'ENOENT';
  }
}

async function releaseOwnedLock(lockPath, token) {
  try {
    const owner = lockOwner(await readFile(lockPath, 'utf8'));
    if (owner?.token !== token) return;
    await unlink(lockPath).catch((error) => {
      if (error?.code !== 'ENOENT') throw error;
    });
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
}

async function reclaimStaleRecoveryLock(recoveryPath) {
  if (!(await lockIsStale(recoveryPath))) return false;
  await delay(LOCK_RETRY_MS);
  if (!(await lockIsStale(recoveryPath))) return false;
  await unlink(recoveryPath).catch((error) => {
    if (error?.code !== 'ENOENT') throw error;
  });
  return true;
}

/** Serialize stale-lock removal so a waiter cannot delete a replacement lock. */
async function reclaimStaleLock(lockPath) {
  const recoveryPath = `${lockPath}.recovery`;
  const recoveryToken = randomUUID();
  let recoveryHandle;

  try {
    recoveryHandle = await open(recoveryPath, 'wx', 0o600);
    await recoveryHandle.writeFile(
      `${JSON.stringify({ pid: process.pid, token: recoveryToken })}\n`,
      'utf8',
    );
  } catch (error) {
    if (recoveryHandle) await recoveryHandle.close().catch(() => undefined);
    if (error?.code === 'EEXIST') {
      await reclaimStaleRecoveryLock(recoveryPath);
      return false;
    }
    throw error;
  }

  try {
    if (!(await lockIsStale(lockPath))) return false;
    await delay(LOCK_RETRY_MS);
    if (!(await lockIsStale(lockPath))) return false;
    await unlink(lockPath).catch((error) => {
      if (error?.code !== 'ENOENT') throw error;
    });
    return true;
  } finally {
    await recoveryHandle.close();
    await releaseOwnedLock(recoveryPath, recoveryToken);
  }
}

async function withCoordinationLock(filePath, operation) {
  await mkdir(dirname(filePath), { recursive: true, mode: 0o700 });
  const lockPath = `${filePath}.lock`;
  const lockToken = randomUUID();
  let lockHandle;

  for (let attempt = 0; attempt < LOCK_ATTEMPTS; attempt += 1) {
    let candidateHandle;
    try {
      candidateHandle = await open(lockPath, 'wx', 0o600);
      await candidateHandle.writeFile(
        `${JSON.stringify({ pid: process.pid, token: lockToken })}\n`,
        'utf8',
      );
      lockHandle = candidateHandle;
      break;
    } catch (error) {
      if (candidateHandle) {
        await candidateHandle.close().catch(() => undefined);
        await releaseOwnedLock(lockPath, lockToken).catch(() => undefined);
      }
      if (error?.code !== 'EEXIST') throw error;
      if (await lockIsStale(lockPath)) {
        await reclaimStaleLock(lockPath);
      } else {
        await delay(LOCK_RETRY_MS);
      }
    }
  }

  if (!lockHandle) {
    throw new Error(
      `Timed out waiting for the local emulator coordination lock at ${lockPath}.`,
    );
  }

  try {
    return await operation();
  } finally {
    await lockHandle.close();
    await releaseOwnedLock(lockPath, lockToken);
  }
}

async function readStateUnlocked(filePath) {
  try {
    return parseCoordinationState(await readFile(filePath, 'utf8'));
  } catch (error) {
    if (error?.code === 'ENOENT') return emptyCoordinationState();
    throw error;
  }
}

async function writeStateUnlocked(filePath, state) {
  await mkdir(dirname(filePath), { recursive: true, mode: 0o700 });
  const temporaryPath = `${filePath}.${process.pid}.${randomUUID()}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(state, null, 2)}\n`, {
    encoding: 'utf8',
    mode: 0o600,
  });
  await rename(temporaryPath, filePath);
}

export async function readCoordinationState(filePath = coordinationFilePath()) {
  return pruneDeadReservations(await readStateUnlocked(filePath));
}

function bindPortIsFree(port, host) {
  return new Promise((resolvePromise) => {
    const server = createServer();
    server.once('error', () => resolvePromise(false));
    server.listen({ host, port }, () => {
      server.close((error) => resolvePromise(!error));
    });
  });
}

async function lsofPortIsFree(port) {
  try {
    const result = await execFileAsync(
      'lsof',
      ['-nP', `-iTCP:${port}`, '-sTCP:LISTEN'],
      { encoding: 'utf8' },
    );
    return result.stdout.trim().length === 0;
  } catch (error) {
    if (error?.code === 1) return true;
    if (error?.code === 'ENOENT') return undefined;
    return undefined;
  }
}

export async function isPortFree(port, host = '127.0.0.1') {
  // Binding only to 127.0.0.1 can miss a process listening on a wildcard
  // address on macOS. lsof sees both forms and is also the repository's
  // documented port-ownership check; retain a bind fallback for machines
  // without lsof (and for callers that request a different host).
  if (host === '127.0.0.1') {
    const lsofResult = await lsofPortIsFree(port);
    if (lsofResult !== undefined) return lsofResult;
  }
  return bindPortIsFree(port, host === '127.0.0.1' ? '0.0.0.0' : host);
}

async function occupiedPorts(ports, portCheck) {
  const results = await Promise.all(
    ports.map(async (port) => ({ port, free: await portCheck(port) })),
  );
  return results.filter(({ free }) => !free).map(({ port }) => port);
}

function newReservation({ slot, worktree, kind, command, ports }) {
  return {
    id: reservationId(),
    slot,
    worktree,
    kind,
    pid: process.pid,
    command,
    claimedAt: new Date().toISOString(),
    ports: [...ports],
  };
}

function blockedSlotError({ filePath, slot, kind, state }) {
  const owners = reservationSummary(state.reservations, slot);
  const ownerText = owners || 'a process that is not registered in the coordination file';
  return new Error(
    `Cannot claim emulator slot ${slot} for ${kind}: ${ownerText}. ` +
      `See ${filePath}; stop or reconfigure the owning worktree before retrying.`,
  );
}

function occupiedSlotError({ filePath, slot, kind, ports }) {
  return new Error(
    `Cannot claim emulator slot ${slot} for ${kind}: port(s) ${ports.join(', ')} ` +
      `are already listening. See ${filePath} and choose a free slot.`,
  );
}

async function claimSlot({
  filePath,
  slot,
  worktree,
  kind,
  command,
  ports,
  portCheck,
  state,
}) {
  const reservations = coordinationReservations(state);
  const blockingReservation = reservations.find((reservation) =>
    reservationBlocksSlot(reservation, { slot, worktree, kind }),
  );
  if (blockingReservation) {
    throw blockedSlotError({
      filePath,
      slot,
      kind,
      state: { ...state, reservations },
    });
  }

  const occupied = await occupiedPorts(ports, portCheck);
  if (occupied.length > 0) {
    throw occupiedSlotError({ filePath, slot, kind, ports: occupied });
  }

  const reservation = newReservation({ slot, worktree, kind, command, ports });
  state.reservations.push(reservation);
  return reservation;
}

/** Record the configured slot before writing local config files. */
export async function reserveConfiguredEmulatorSlot({
  filePath = coordinationFilePath(),
  slot,
  worktree = process.cwd(),
  ports,
  portCheck = isPortFree,
}) {
  return withCoordinationLock(filePath, async () => {
    const state = pruneDeadReservations(await readStateUnlocked(filePath));
    const reservations = coordinationReservations(state);
    const blockingReservation = reservations.find((reservation) =>
      reservationBlocksSlot(reservation, {
        slot,
        worktree,
        kind: 'configuration',
      }),
    );
    if (blockingReservation) {
      throw blockedSlotError({
        filePath,
        slot,
        kind: 'configuration',
        state: { ...state, reservations },
      });
    }

    const occupied = await occupiedPorts(ports, portCheck);
    if (occupied.length > 0) {
      throw occupiedSlotError({
        filePath,
        slot,
        kind: 'configuration',
        ports: occupied,
      });
    }

    const configuration = {
      id: `configuration-${randomUUID()}`,
      slot,
      worktree,
      configuredAt: new Date().toISOString(),
      ports: [...ports],
    };
    state.configurations = state.configurations.filter(
      (candidate) => candidate.worktree !== worktree,
    );
    state.configurations.push(configuration);
    await writeStateUnlocked(filePath, state);
    return configuration;
  });
}

/**
 * Atomically select and record the first complete free worktree slot.
 *
 * Configuration is a durable row claim, so this operation must select the
 * row and write it while holding the same lock. A status scan followed by a
 * separate configure command would let concurrent worktrees choose the same
 * row.
 */
export async function reserveAvailableConfiguredEmulatorSlot({
  filePath = coordinationFilePath(),
  preferredSlot,
  worktree = process.cwd(),
  availableSlots = Array.from({ length: EMULATOR_SLOT_COUNT }, (_, slot) => slot),
  portsForSlot = (slot) => [
    ...Object.values(emulatorPortsForSlot(slot)),
    vitePortForSlot(slot),
  ],
  portCheck = isPortFree,
}) {
  return withCoordinationLock(filePath, async () => {
    const state = pruneDeadReservations(await readStateUnlocked(filePath));
    const reservations = coordinationReservations(state);
    const firstCandidate = chooseAvailableEmulatorSlot({
      preferredSlot,
      availableSlots,
      worktree,
      kind: 'configuration',
      reservations,
    });

    if (firstCandidate === undefined) {
      throw new Error(
        'No unreserved emulator slot is available for configuration. ' +
          `See ${filePath}; configured rows remain reserved for their worktrees. ` +
          'Run npm run emulators:configure -- auto after a slot is released.',
      );
    }

    const candidateSlots = [
      firstCandidate,
      ...availableSlots.filter((candidate) => candidate !== firstCandidate),
    ];
    for (const candidate of candidateSlots) {
      const slot = chooseAvailableEmulatorSlot({
        preferredSlot: candidate,
        availableSlots: [],
        worktree,
        kind: 'configuration',
        reservations,
      });
      if (slot === undefined) continue;

      const ports = portsForSlot(slot);
      const occupied = await occupiedPorts(ports, portCheck);
      if (occupied.length > 0) continue;

      const configuration = {
        id: `configuration-${randomUUID()}`,
        slot,
        worktree,
        configuredAt: new Date().toISOString(),
        ports: [...ports],
      };
      state.configurations = state.configurations.filter(
        (candidateConfiguration) => candidateConfiguration.worktree !== worktree,
      );
      state.configurations.push(configuration);
      await writeStateUnlocked(filePath, state);
      return configuration;
    }

    throw new Error(
      'No free emulator port set is available for configuration. ' +
        `See ${filePath}; stop a listening process or release a configured worktree row. ` +
        'Run npm run emulators:configure -- auto after a slot is released.',
    );
  });
}

export async function releaseConfiguredEmulatorSlot(
  configuration,
  filePath = coordinationFilePath(),
) {
  if (!configuration?.worktree) return;

  await withCoordinationLock(filePath, async () => {
    const state = pruneDeadReservations(await readStateUnlocked(filePath));
    state.configurations = state.configurations.filter((candidate) => {
      if (configuration.id) return candidate.id !== configuration.id;
      return !(
        candidate.worktree === configuration.worktree &&
        candidate.slot === configuration.slot
      );
    });
    await writeStateUnlocked(filePath, state);
  });
}

/** Claim one configured slot after checking both the registry and OS ports. */
export async function reserveEmulatorSlot({
  filePath = coordinationFilePath(),
  slot,
  worktree = process.cwd(),
  kind,
  command,
  ports,
  portCheck = isPortFree,
}) {
  return withCoordinationLock(filePath, async () => {
    const state = pruneDeadReservations(await readStateUnlocked(filePath));
    const reservation = await claimSlot({
      filePath,
      slot,
      worktree,
      kind,
      command,
      ports,
      portCheck,
      state,
    });
    await writeStateUnlocked(filePath, state);
    return reservation;
  });
}

/** Claim the first free complete slot, preferring the worktree's configured slot. */
export async function reserveAvailableEmulatorSlot({
  filePath = coordinationFilePath(),
  preferredSlot,
  worktree = process.cwd(),
  kind,
  command,
  availableSlots = Array.from({ length: EMULATOR_SLOT_COUNT }, (_, slot) => slot),
  portsForSlot = (slot) => Object.values(emulatorPortsForSlot(slot)),
  portCheck = isPortFree,
}) {
  return withCoordinationLock(filePath, async () => {
    const state = pruneDeadReservations(await readStateUnlocked(filePath));
    const slot = chooseAvailableEmulatorSlot({
      preferredSlot,
      availableSlots,
      worktree,
      kind,
      reservations: coordinationReservations(state),
    });

    if (slot === undefined) {
      throw new Error(
        `No unreserved emulator slot is available for ${kind}. ` +
          `See ${filePath}, stop a running worktree, and retry.`,
      );
    }

    const candidateSlots = [slot, ...availableSlots.filter((candidate) => candidate !== slot)];
    for (const candidate of candidateSlots) {
      const candidateSlot = chooseAvailableEmulatorSlot({
        preferredSlot: candidate,
        availableSlots: [],
        worktree,
        kind,
        reservations: coordinationReservations(state),
      });
      if (candidateSlot === undefined) continue;

      const ports = portsForSlot(candidateSlot);
      if ((await occupiedPorts(ports, portCheck)).length > 0) continue;

      const reservation = newReservation({
        slot: candidateSlot,
        worktree,
        kind,
        command,
        ports,
      });
      state.reservations.push(reservation);
      await writeStateUnlocked(filePath, state);
      return reservation;
    }

    throw new Error(
      `No free emulator port set is available for ${kind}. ` +
        `See ${filePath}, stop a running worktree, and retry.`,
    );
  });
}

export async function releaseEmulatorSlot(
  reservation,
  filePath = coordinationFilePath(),
) {
  if (!reservation?.id) return;

  await withCoordinationLock(filePath, async () => {
    const state = pruneDeadReservations(await readStateUnlocked(filePath));
    state.reservations = state.reservations.filter(
      (candidate) => candidate.id !== reservation.id,
    );
    await writeStateUnlocked(filePath, state);
  });
}

/** Attach a spawned process to its lease so cleanup cannot free a live tree. */
export async function updateReservationChildPid(
  reservation,
  childPid,
  filePath = coordinationFilePath(),
) {
  if (!validPid(childPid)) throw new Error(`Invalid emulator child PID: ${childPid}.`);
  return withCoordinationLock(filePath, async () => {
    const state = pruneDeadReservations(await readStateUnlocked(filePath));
    const current = state.reservations.find((candidate) => candidate.id === reservation.id);
    if (!current) throw new Error(`Cannot attach child PID: reservation ${reservation.id} is not active.`);
    current.childPid = childPid;
    await writeStateUnlocked(filePath, state);
    return current;
  });
}

function formatEntry(entry) {
  const status = text(entry.status, 'active');
  const resources = Array.isArray(entry.resources) && entry.resources.length > 0
    ? entry.resources.join(', ')
    : 'none declared';
  const lines = [
    `- [${status}] ${entry.id} — ${text(entry.intent, 'No intent recorded.')}`,
    `  worktree: ${text(entry.worktree, 'unknown')}`,
    `  started: ${text(entry.startedAt, 'unknown')} | version plan: ${text(entry.versionPlan, 'not recorded')}`,
    `  preemptive changelog: ${text(entry.preemptiveChangelog, 'not recorded')}`,
    `  resources: ${resources}`,
  ];
  if (entry.workType || entry.scopes || entry.claims) {
    const normalizedPrompt = normalizePromptId(entry.implementationPrompt);
    const implementationPrompt = normalizedPrompt
      ? ` | implementation prompt: ${normalizedPrompt}`
      : '';
    lines.push(
      `  work type: ${text(entry.workType, 'legacy')}${implementationPrompt} | scopes: ${entry.scopes?.join(', ') || 'none'} | claims: ${entry.claims?.join(', ') || 'none'}`,
    );
  }
  if (Array.isArray(entry.requestedScopes) || Array.isArray(entry.requestedClaims)) {
    lines.push(
      `  requested ownership: scopes ${entry.requestedScopes?.join(', ') || 'none'} | claims ${entry.requestedClaims?.join(', ') || 'none'}`,
    );
  }
  if (status === 'active') {
    const lease = leaseStatusForEntry(entry);
    const confirmation = lease.ownerConfirmationRequired
      ? ' (owner confirmation required; takeover disabled)'
      : '';
    lines.push(`  lease: ${lease.state}${confirmation}`);
  }
  if (entry.outcome) lines.push(`  outcome: ${entry.outcome}`);
  if (entry.preservation) {
    lines.push(`  preserved: ${entry.preservation.destination} @ ${entry.preservation.commitSha}`);
  }
  if (entry.discard) lines.push(`  discarded: ${entry.discard.reason}`);
  if (entry.startBranchSha || entry.startMainSha) {
    lines.push(
      `  start state: branch ${text(entry.startBranchSha, 'unknown')} | main ${text(entry.startMainSha, 'unknown')}`,
    );
  }
  if (entry.validation) {
    lines.push(
      `  validation: ${entry.validation.passed === true ? 'passed' : 'failed'} @ ${text(entry.validation.commitSha, 'unknown')} | commands ${Array.isArray(entry.validation.commands) ? entry.validation.commands.length : 0}`,
    );
  }
  if (entry.finalBranchSha || entry.mainSha || entry.originMainSha) {
    lines.push(
      `  release state: ${text(entry.finalBranchName, 'unknown')} @ ${text(entry.finalBranchSha, 'unknown')} | main ${text(entry.mainSha, 'unknown')} | origin/main ${text(entry.originMainSha, 'unknown')} | pushed ${entry.pushed === true ? 'yes' : 'no'}`,
    );
  }
  return lines.join('\n');
}

function formatReservation(reservation) {
  const ports = Array.isArray(reservation.ports) ? reservation.ports.join(', ') : 'unknown';
  const child = validPid(reservation.childPid) ? ` / child ${reservation.childPid}` : '';
  return `- slot ${reservation.slot} — ${reservation.kind} — ${reservation.worktree} — pid ${reservation.pid}${child} — ports ${ports}`;
}

/** Render the coordination file as a compact, agent-readable status pane. */
export function formatCoordinationState(state, { includeHistory = false } = {}) {
  const allEntries = Array.isArray(state.entries) ? state.entries : [];
  const entries = includeHistory
    ? allEntries
    : allEntries.filter((entry) => text(entry.status, 'active') !== 'complete');
  const hiddenCompletedEntries = includeHistory
    ? 0
    : allEntries.filter((entry) => text(entry.status, 'active') === 'complete').length;
  const reservations = Array.isArray(state.reservations) ? state.reservations : [];
  const configurations = Array.isArray(state.configurations) ? state.configurations : [];
  const occupiedSlots = new Set(
    [...reservations, ...configurations]
      .map((resource) => resource?.slot)
      .filter(
        (slot) => Number.isInteger(slot) && slot >= 0 && slot < EMULATOR_SLOT_COUNT,
      ),
  );
  const availableSlots = Array.from(
    { length: EMULATOR_SLOT_COUNT },
    (_, slot) => slot,
  ).filter((slot) => !occupiedSlots.has(slot));
  const formatSlots = (slots) => (slots.length > 0 ? slots.join(', ') : 'none');
  const lines = [
    '# Codex-wide coordination',
    'All local repositories on this host share this coordination registry.',
    '',
    '## Version agreement',
    text(state.versionAgreement, DEFAULT_VERSION_AGREEMENT),
    '',
    includeHistory ? '## Work history' : '## Active work',
  ];

  if (entries.length === 0) lines.push('- none');
  else lines.push(...entries.map(formatEntry));
  if (hiddenCompletedEntries > 0) {
    lines.push(
      `- ${hiddenCompletedEntries} completed ${hiddenCompletedEntries === 1 ? 'entry' : 'entries'} hidden; run \`npm run coordination:status -- --history\` to show full history.`,
    );
  }

  lines.push(
    '',
    `## Emulator capacity (${EMULATOR_SLOT_COUNT} isolated emulator slots)`,
    `- available slots: ${formatSlots(availableSlots)}`,
    `- occupied slots: ${formatSlots([...occupiedSlots].sort((a, b) => a - b))}`,
    '- Claim a free row atomically with `npm run emulators:configure -- auto`.',
    '',
    '## Configured worktree slots (reserved; unavailable to other worktrees)',
  );
  if (configurations.length === 0) lines.push('- none');
  else {
    lines.push(
      ...configurations.map(
        (configuration) =>
          `- slot ${configuration.slot} — ${configuration.worktree} — configured ${text(configuration.configuredAt, 'unknown')}`,
      ),
    );
  }

  lines.push('', '## Live emulator reservations');
  if (reservations.length === 0) lines.push('- none');
  else lines.push(...reservations.map(formatReservation));

  return `${lines.join('\n')}\n`;
}

function parseOptions(args) {
  const options = {};
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (!argument?.startsWith('--')) throw new Error(`Unexpected argument: ${argument}`);
    const name = argument.slice(2);
    const value = args[index + 1];
    if (!value || value.startsWith('--')) throw new Error(`Missing value for --${name}.`);
    options[name] = value;
    index += 1;
  }
  return options;
}

async function readGitStartState(cwd = process.cwd()) {
  const [branchName, branchSha, mainSha, repositoryRoot, repositoryIdentity] = await Promise.all([
    runGit(['rev-parse', '--abbrev-ref', 'HEAD'], cwd),
    runGit(['rev-parse', 'HEAD'], cwd),
    runGit(['rev-parse', 'main'], cwd),
    runGit(['rev-parse', '--show-toplevel'], cwd),
    runGit(['rev-parse', '--path-format=absolute', '--git-common-dir'], cwd),
  ]);
  if (branchName === 'HEAD') {
    throw new Error('coordination begin requires an attached branch; create one before editing.');
  }
  if (branchName === 'main') {
    throw new Error('coordination begin refuses to register work directly on main.');
  }
  return {
    branchName,
    branchSha,
    mainSha,
    repositoryRoot: resolve(repositoryRoot),
    repositoryIdentity: resolve(repositoryIdentity),
  };
}

export async function beginCoordinationEntry(filePath, options) {
  const required = ['intent', 'version-plan', 'preemptive-changelog', 'work-type'];
  for (const name of required) {
    if (!options[name]) throw new Error(`coordination begin requires --${name} <text>.`);
  }

  const start = await readGitStartState();
  const workType = options['work-type'];
  if (!['product', 'tooling', 'documentation', 'investigation'].includes(workType)) {
    throw new Error('coordination begin requires --work-type product|tooling|documentation|investigation.');
  }
  const implementationPrompt = options['implementation-prompt'];
  if (workType === 'product' && !IMPLEMENTATION_PROMPT_CLAIM_PATTERN.test(implementationPrompt ?? '')) {
    throw new Error(
      'coordination begin requires product work to record an implementation prompt with --implementation-prompt NNN or NNN<letter>.',
    );
  }
  const { scopes, claims } = normalizedCoordinationOwnership(options);
  return withCoordinationLock(filePath, async () => {
    const state = pruneDeadReservations(await readStateUnlocked(filePath));
    const existing = state.entries.find(
      (candidate) => candidate.status === 'active' && candidate.worktree === process.cwd(),
    );
    if (existing) {
      throw new Error(
        `An active coordination entry already exists for this worktree: ${existing.id}.`,
      );
    }
    const entry = {
      id: `${Date.now()}-${process.pid}-${randomUUID().slice(0, 8)}`,
      worktree: process.cwd(),
      pid: process.pid,
      startedAt: new Date().toISOString(),
      status: 'active',
      branchName: start.branchName,
      startBranchSha: start.branchSha,
      startMainSha: start.mainSha,
      repositoryRoot: start.repositoryRoot,
      repositoryIdentity: start.repositoryIdentity,
      intent: options.intent,
      versionPlan: options['version-plan'],
      preemptiveChangelog: options['preemptive-changelog'],
      workType,
      ...(workType === 'product'
        ? { implementationPrompt: implementationPrompt.toLowerCase() }
        : {}),
      // Begin records intent only. File and shared-claim ownership is acquired
      // just in time through `claimCoordinationEntry`, so idle work cannot
      // block independent feature work while it is still being prepared.
      scopes: [],
      claims: [],
      requestedScopes: scopes,
      requestedClaims: claims,
      heartbeatAt: new Date().toISOString(),
      resources: options.resources
        ? options.resources.split(',').map((resource) => resource.trim()).filter(Boolean)
        : [],
    };
    validateImplementationPromptClaims([...state.entries, entry]);
    state.entries.push(entry);
    await writeStateUnlocked(filePath, pruneOrphanedConfigurations(state));
    return entry;
  });
}

// Keep the internal/legacy name available to the command wiring and older
// callers while exposing the explicit public begin API above.
const beginEntry = beginCoordinationEntry;

/**
 * Add ownership metadata to an active coordination entry without allowing a
 * caller to rewrite its identity, release agreement, or lifecycle state.
 */
export async function amendCoordinationEntry(filePath, options = {}) {
  return amendCoordinationOwnership(filePath, options);
}

/**
 * Acquire ownership after intent registration. This is deliberately separate
 * from begin so claims are checked and written while holding the registry
 * lock, with an expired owner lease remaining a blocking confirmation state.
 */
export async function claimCoordinationEntry(filePath, options = {}) {
  return amendCoordinationOwnership(filePath, options, { requireFreshLease: true });
}

async function amendCoordinationOwnership(filePath, options = {}, { requireFreshLease = false } = {}) {
  if (!options.id) throw new Error('coordination amend requires --id <entry-id>.');

  const { scopes, claims } = normalizedCoordinationOwnership(options);
  if (scopes.length === 0 && claims.length === 0) {
    throw new Error('coordination amend requires at least one new --scope or --claims value.');
  }
  const duplicateScope = scopes.find((scope, index) => scopes.indexOf(scope) !== index);
  if (duplicateScope) {
    throw new Error(`Amendment scope "${duplicateScope}" was requested more than once.`);
  }

  return withCoordinationLock(filePath, async () => {
    const state = pruneDeadReservations(await readStateUnlocked(filePath));
    const entry = state.entries.find((candidate) => candidate.id === options.id);
    if (!entry) throw new Error(`No coordination entry found for ${options.id}.`);
    if (entry.status !== 'active') {
      throw new Error(`Coordination entry ${entry.id} is already ${text(entry.status, 'historical')}.`);
    }
    if (entry.worktree !== process.cwd()) {
      throw new Error(
        `Cannot amend coordination entry ${entry.id} from ${process.cwd()}; ` +
        `it belongs to ${entry.worktree}.`,
      );
    }

    if (requireFreshLease) {
      const lease = leaseStatusForEntry(entry, {
        now: options.now ?? Date.now(),
        leaseMs: options.leaseMs,
      });
      if (lease.ownerConfirmationRequired) {
        throw new Error(
          `Cannot claim coordination entry ${entry.id}: owner confirmation is required; ` +
          'heartbeat the active owner before claiming files or shared resources.',
        );
      }
    }

    const start = await readGitStartState();
    if (!entry.branchName) {
      throw new Error(`Cannot amend coordination entry ${entry.id}: it has no attached branch.`);
    }
    if (start.branchName !== entry.branchName) {
      throw new Error(
        `Cannot amend coordination entry ${entry.id}: checkout branch ${start.branchName} ` +
        `does not match ${entry.branchName}.`,
      );
    }
    if (entry.repositoryRoot && resolve(entry.repositoryRoot) !== start.repositoryRoot) {
      throw new Error(
        `Cannot amend coordination entry ${entry.id}: checkout repository ${start.repositoryRoot} ` +
        `does not match ${entry.repositoryRoot}.`,
      );
    }
    if (entry.repositoryIdentity && resolve(entry.repositoryIdentity) !== start.repositoryIdentity) {
      throw new Error(
        `Cannot amend coordination entry ${entry.id}: checkout Git identity ${start.repositoryIdentity} ` +
        `does not match ${entry.repositoryIdentity}.`,
      );
    }

    const existingScopes = Array.isArray(entry.scopes) ? entry.scopes : [];
    const existingClaims = Array.isArray(entry.claims) ? entry.claims : [];
    const normalizedExistingScopes = existingScopes.map((scope) => {
      try {
        return normalizeScope(scope);
      } catch {
        return scope;
      }
    });
    const normalizedExistingClaims = new Set(existingClaims.map((claim) =>
      typeof claim === 'string' ? claim.trim().toLowerCase() : claim,
    ));
    const duplicateExistingScope = scopes.find((scope) =>
      normalizedExistingScopes.some((existingScope) => scopesOverlap(scope, existingScope)),
    );
    if (duplicateExistingScope) {
      throw new Error(
        `Amendment scope "${duplicateExistingScope}" is already declared or covered by ` +
        `active entry ${entry.id}.`,
      );
    }
    const duplicateExistingClaim = claims.find((claim) => normalizedExistingClaims.has(claim));
    if (duplicateExistingClaim) {
      throw new Error(
        `Amendment claim "${duplicateExistingClaim}" is already declared by active entry ` +
        `${entry.id}.`,
      );
    }

    const conflict = findCoordinationConflict({
      activeEntries: state.entries.filter((candidate) => candidate.id !== entry.id),
      repositoryIdentity: start.repositoryIdentity,
      repositoryRoot: start.repositoryRoot,
      worktree: process.cwd(),
      scopes,
      claims,
    });
    if (conflict) throw new Error(formatCoordinationConflict(conflict));

    entry.scopes = [...existingScopes, ...scopes];
    entry.claims = [...existingClaims, ...claims];
    const amendment = {
      amendedAt: new Date().toISOString(),
      worktree: process.cwd(),
      branchName: start.branchName,
      scopes: [...scopes],
      claims: [...claims],
    };
    entry.amendments = [
      ...(Array.isArray(entry.amendments) ? entry.amendments : []),
      amendment,
    ];
    await writeStateUnlocked(filePath, state);
    return entry;
  });
}

/** Refresh the lease for the exact active owner in the central registry. */
export async function heartbeatCoordinationEntry(filePath, options = {}) {
  if (!options.id) throw new Error('coordination heartbeat requires --id <entry-id>.');
  return withCoordinationLock(filePath, async () => {
    const state = pruneDeadReservations(await readStateUnlocked(filePath));
    const entry = state.entries.find((candidate) => candidate.id === options.id);
    if (!entry) throw new Error(`No coordination entry found for ${options.id}.`);
    if (entry.status !== 'active') {
      throw new Error(`Cannot heartbeat coordination entry ${entry.id}: it is not active.`);
    }
    if (entry.worktree !== process.cwd()) {
      throw new Error(
        `Cannot heartbeat coordination entry ${entry.id} from ${process.cwd()}; ` +
        `it belongs to ${entry.worktree}.`,
      );
    }

    const start = await readGitStartState();
    if (entry.branchName && start.branchName !== entry.branchName) {
      throw new Error(
        `Cannot heartbeat coordination entry ${entry.id}: checkout branch ${start.branchName} ` +
        `does not match ${entry.branchName}.`,
      );
    }
    if (entry.repositoryRoot && resolve(entry.repositoryRoot) !== start.repositoryRoot) {
      throw new Error(
        `Cannot heartbeat coordination entry ${entry.id}: checkout repository ${start.repositoryRoot} ` +
        `does not match ${entry.repositoryRoot}.`,
      );
    }
    if (entry.repositoryIdentity && resolve(entry.repositoryIdentity) !== start.repositoryIdentity) {
      throw new Error(
        `Cannot heartbeat coordination entry ${entry.id}: checkout Git identity ${start.repositoryIdentity} ` +
        `does not match ${entry.repositoryIdentity}.`,
      );
    }

    const updated = refreshCoordinationLease(entry, {
      now: options.now ?? new Date(),
      leaseMs: options.leaseMs,
    });
    const index = state.entries.findIndex((candidate) => candidate.id === entry.id);
    state.entries[index] = updated;
    await writeStateUnlocked(filePath, pruneOrphanedConfigurations(state));
    return updated;
  });
}

/**
 * Release only exact scopes/claims owned by the current task. An expired lease
 * remains blocking until that owner explicitly heartbeats, so this operation
 * can never be used to steal abandoned work.
 */
export async function releaseCoordinationClaim(filePath, options = {}) {
  if (!options.id) throw new Error('coordination release-claim requires --id <entry-id>.');
  const { scopes, claims } = normalizedCoordinationOwnership(options);
  if (scopes.length === 0 && claims.length === 0) {
    throw new Error('coordination release-claim requires at least one --scope or --claims value.');
  }

  return withCoordinationLock(filePath, async () => {
    const state = pruneDeadReservations(await readStateUnlocked(filePath));
    const entry = state.entries.find((candidate) => candidate.id === options.id);
    if (!entry) throw new Error(`No coordination entry found for ${options.id}.`);
    if (entry.status !== 'active') {
      throw new Error(`Coordination entry ${entry.id} is already ${text(entry.status, 'historical')}.`);
    }
    if (entry.worktree !== process.cwd()) {
      throw new Error(
        `Cannot release coordination claim for ${entry.id} from ${process.cwd()}; ` +
        `it belongs to ${entry.worktree}.`,
      );
    }

    const lease = leaseStatusForEntry(entry, {
      now: options.now ?? Date.now(),
      leaseMs: options.leaseMs,
    });
    if (lease.ownerConfirmationRequired) {
      throw new Error(
        `Cannot release coordination claim for ${entry.id}: owner confirmation is required; ` +
        'heartbeat the active owner before releasing files or shared resources.',
      );
    }

    const start = await readGitStartState();
    if (entry.branchName && start.branchName !== entry.branchName) {
      throw new Error(
        `Cannot release coordination claim for ${entry.id}: checkout branch ${start.branchName} ` +
        `does not match ${entry.branchName}.`,
      );
    }
    if (entry.repositoryRoot && resolve(entry.repositoryRoot) !== start.repositoryRoot) {
      throw new Error(
        `Cannot release coordination claim for ${entry.id}: checkout repository ${start.repositoryRoot} ` +
        `does not match ${entry.repositoryRoot}.`,
      );
    }
    if (entry.repositoryIdentity && resolve(entry.repositoryIdentity) !== start.repositoryIdentity) {
      throw new Error(
        `Cannot release coordination claim for ${entry.id}: checkout Git identity ${start.repositoryIdentity} ` +
        `does not match ${entry.repositoryIdentity}.`,
      );
    }

    const existingScopes = Array.isArray(entry.scopes) ? entry.scopes : [];
    const existingClaims = Array.isArray(entry.claims) ? entry.claims : [];
    const normalizedExistingScopes = existingScopes.map((scope) => {
      try {
        return normalizeScope(scope);
      } catch {
        return scope;
      }
    });
    const releasableScopes = scopes.filter((scope) => normalizedExistingScopes.includes(scope));
    const normalizedExistingClaims = existingClaims.map((claim) =>
      typeof claim === 'string' ? claim.trim().toLowerCase() : claim,
    );
    const releasableClaims = claims.filter((claim) => normalizedExistingClaims.includes(claim));
    if (releasableScopes.length !== scopes.length || releasableClaims.length !== claims.length) {
      const missingScopes = scopes.filter((scope) => !releasableScopes.includes(scope));
      const missingClaims = claims.filter((claim) => !releasableClaims.includes(claim));
      throw new Error(
        `Cannot release coordination claim for ${entry.id}: requested ownership is not held ` +
        `(scopes: ${missingScopes.join(', ') || 'none'}; claims: ${missingClaims.join(', ') || 'none'}).`,
      );
    }

    entry.scopes = existingScopes.filter((scope) => {
      let normalized = scope;
      try {
        normalized = normalizeScope(scope);
      } catch {
        // Preserve malformed legacy scope text unless it was explicitly matched.
      }
      return !releasableScopes.includes(normalized);
    });
    entry.claims = existingClaims.filter((claim) => !releasableClaims.includes(
      typeof claim === 'string' ? claim.trim().toLowerCase() : claim,
    ));
    entry.claimReleases = [
      ...(Array.isArray(entry.claimReleases) ? entry.claimReleases : []),
      {
        releasedAt: new Date(options.now ?? Date.now()).toISOString(),
        worktree: process.cwd(),
        branchName: start.branchName,
        scopes: [...releasableScopes],
        claims: [...releasableClaims],
      },
    ];
    await writeStateUnlocked(filePath, pruneOrphanedConfigurations(state));
    return entry;
  });
}

// Singular and plural spellings are kept as compatibility aliases for
// scripts that adopted the initial release-claim proposal.
export const releaseCoordinationClaims = releaseCoordinationClaim;

/** Forecast central-registry ownership using the richer throughput report. */
export async function forecastCoordinationEntry(filePath, options = {}) {
  const state = await readCoordinationState(filePath);
  const start = await readGitStartState();
  const csv = (value) => normalizedList(value);
  return forecastCoordinationConflicts({
    activeEntries: state.entries,
    repositoryIdentity: options['repository-identity'] ?? start.repositoryIdentity,
    repositoryRoot: options['repository-root'] ?? start.repositoryRoot,
    worktree: options.worktree ?? process.cwd(),
    scopes: csv(options.scope),
    files: csv(options.files),
    claims: csv(options.claims),
  });
}

/**
 * Prepare (when necessary) and atomically land one release fragment. The
 * existing implementation-progress validator runs against the generated
 * package/changelog metadata before any of the three release files are
 * replaced. A failed final gate therefore leaves the release lane and
 * checkout unchanged.
 */
export async function finalizeReleaseFragment(filePath, options = {}) {
  if (!options.taskId) throw new Error('release fragment finalization requires --task-id <task-id>.');
  const repositoryDirectory = resolve(options.repositoryDirectory ?? process.cwd());
  let currentMainSha = options.currentMainSha ?? options.mainSha;
  if (!currentMainSha) {
    try {
      currentMainSha = await runGit(['rev-parse', 'main'], repositoryDirectory);
    } catch {
      // Exported callers may provide a metadata-only fixture. Version and
      // package/changelog synchronization checks still apply there.
      currentMainSha = undefined;
    }
  }
  const existingLane = await readReleaseLaneState(filePath);
  const existing = existingLane.fragments.find((fragment) => fragment.taskId === options.taskId);
  if (!existing) {
    if (!options.baseVersion) {
      throw new Error(
        `Release fragment ${options.taskId} is not prepared; --base-version is required before finalization.`,
      );
    }
    await prepareReleaseFragmentFile(filePath, {
      taskId: options.taskId,
      worktree: options.worktree ?? process.cwd(),
      changes: options.changes,
      implementationPrompts: options.implementationPrompts,
      implementationProgress: options.implementationProgress,
      baseVersion: options.baseVersion,
      baseMainSha: options.baseMainSha ?? options.baseSha ?? currentMainSha,
    }, { now: options.now ?? new Date() });
  }

  return applyReleaseFragment(filePath, {
    taskId: options.taskId,
    repositoryDirectory,
    packagePath: options.packagePath,
    lockfilePath: options.lockfilePath,
    changelogPath: options.changelogPath,
    now: options.now ?? new Date(),
    currentMainSha,
    validateFinalMetadata: async ({ fragment, version, changelogSource }) => {
      const inputs = readImplementationProgress({ cwd: repositoryDirectory });
      const fragmentValidation = validateReleaseFragment({
        fragment,
        progressSource: inputs.progressSource,
        planSource: inputs.planSource,
        applicationVersion: fragment.baseVersion,
        requiredPrompt: options.requiredPrompt,
      });
      if (fragmentValidation.errors.length > 0) {
        throw new Error(
          `Release fragment ${fragment.taskId} failed fragment validation: ${fragmentValidation.errors.join('; ')}`,
        );
      }
      const result = validateImplementationProgress({
        ...inputs,
        applicationVersion: version,
        changelogSource,
        requiredPrompt: options.requiredPrompt,
      });
      if (result.errors.length > 0) {
        throw new Error(
          `Release fragment ${fragment.taskId} failed final implementation-progress validation: ${result.errors.join('; ')}`,
        );
      }
      return result;
    },
  });
}

/**
 * @param {string} filePath
 * @param {{
 *   id?: string,
 *   ['start-sha']?: string,
 *   ['documentation-review']?: string,
 *   ['visual-review']?: string,
 *   ['test-growth-justification']?: string,
 *   release?: any,
 *   commandRunner?: (command: string, cwd: string, options?: Record<string, unknown>) => Promise<void>,
 *   repositoryDirectory?: string,
 *   signalSource?: NodeJS.Process,
 * }} options
 */
export async function validateCoordinationEntry(filePath, options) {
  if (!options.id) throw new Error('coordination validate requires --id <entry-id>.');
  const validationDirectory = resolve(options.repositoryDirectory ?? process.cwd());
  if (!options.release && validationDirectory !== resolve(process.cwd())) {
    throw new Error(
      `coordination validate must read, fingerprint, and execute in ${process.cwd()}; ` +
        `received repository directory ${validationDirectory}`,
    );
  }

  const preparation = await withCoordinationLock(filePath, async () => {
    const state = pruneDeadReservations(await readStateUnlocked(filePath));
    const entry = state.entries.find((candidate) => candidate.id === options.id);
    if (!entry) throw new Error(`No coordination entry found for ${options.id}.`);
    if (entry.status !== 'active') {
      throw new Error(`Coordination entry ${entry.id} is already ${text(entry.status, 'historical')}.`);
    }
    if (entry.worktree !== process.cwd()) {
      throw new Error(
        `Cannot validate coordination entry ${entry.id} from ${process.cwd()}; ` +
          `it belongs to ${entry.worktree}.`,
      );
    }

    const startBranchSha = entry.startBranchSha || options['start-sha'];
    if (!startBranchSha) {
      throw new Error(
        `Coordination entry ${entry.id} has no start branch SHA; rerun with --start-sha <commit> once to backfill it.`,
      );
    }
    let release = options.release ?? await readReleaseState({
      startBranchSha,
      validation: entry.validation,
    });
    const advancedBranchFiles = !options.release && entry.validation &&
      release.branchSha !== entry.validation.commitSha
      ? await readTaskChangedFiles(release.mainSha, release.branchSha, process.cwd())
      : [];
    let provenanceRefresh;
    if (!options.release) {
      const changedFiles = postValidationTaskChangedFiles(entry, release);
      if (changedFiles.length > 0) {
        provenanceRefresh = {
          previousCommitSha: entry.validation.commitSha,
          previousTaskTipSha: release.validationTaskTipSha,
          files: changedFiles,
        };
        release = await readReleaseState({ startBranchSha });
      }
    }
    const errors = releaseMetadataErrors({
      entry,
      release,
      requireMerged: false,
      requireReconciled: true,
      releaseFragment: options.releaseFragment ?? options.validatedFragment ?? null,
    });
    if (release.branchBaselineIsAncestor === false) {
      errors.push(
        `start branch SHA ${startBranchSha} is not an ancestor of branch ${release.branchSha}; do not rewrite the task history`,
      );
    }
    if (!Array.isArray(release.changedFiles) || release.changedFiles.length === 0) {
      errors.push('no committed task changes were found from the coordination start SHA');
    }
    const outsideScopes = filesOutsideScopes(release.changedFiles ?? [], entry.scopes);
    if (outsideScopes.length > 0) {
      errors.push(`changed files outside declared scope: ${outsideScopes.join(', ')}`);
    }
    const declaredScopes = Array.isArray(entry.scopes) && entry.scopes.length > 0
      ? entry.scopes
      : normalizedPathSet(entry.validation?.files).values;
    const advancedOutsideScopes = Array.isArray(entry.scopes) && entry.scopes.length > 0
      ? filesOutsideScopes(advancedBranchFiles, declaredScopes)
      : advancedBranchFiles.filter((filePath) => !declaredScopes.includes(filePath));
    if (advancedOutsideScopes.length > 0) {
      errors.push(
        `changed files outside declared scope after the prior validation receipt: ${advancedOutsideScopes.join(', ')}`,
      );
    }
    errors.push(...implementationPlanGateErrors(
      entry,
      options.releaseFragment ?? options.validatedFragment ?? null,
    ));
    const previousValidation = entry.validation;
    const testGrowthJustification = text(
      options['test-growth-justification'],
      text(previousValidation?.testGrowth?.justification),
    );
    const testGrowthReview = testGrowthReviewForRelease({
      release,
      justification: testGrowthJustification,
    });
    if (testGrowthReview && !testGrowthReview.passed) {
      errors.push(`test-growth gate: ${testGrowthReview.message}`);
    }
    if (errors.length > 0) {
      throw new Error(
        `Cannot validate coordination entry ${entry.id}: ${errors.join('; ')}.`,
      );
    }

    const profile = options.release
      ? { kind: 'full', reason: 'release supplied by test harness', commands: [] }
      : await deriveValidationProfile({
          release,
          startBranchSha,
          cwd: process.cwd(),
        });
    const plan = validationPlanForFiles(release.changedFiles, { profile });
    const documentationReview = text(
      options['documentation-review'],
      text(previousValidation?.reviews?.documentation),
    );
    const visualReview = text(
      options['visual-review'],
      text(previousValidation?.reviews?.visual),
    );
    if (plan.requiresDocumentationReview && !documentationReview) {
      throw new Error(
        `Cannot validate coordination entry ${entry.id}: documentation changes require --documentation-review <summary>.`,
      );
    }
    if (plan.requiresVisualReview && !visualReview) {
      throw new Error(
        `Cannot validate coordination entry ${entry.id}: UI changes require --visual-review <summary>.`,
      );
    }

    const inputFingerprint = await validationInputFingerprint({
      entry,
      release,
      plan,
      documentationReview,
      visualReview,
      testGrowthReview,
      repositoryDirectory: validationDirectory,
      includeFilesystemInputs: !options.release || options.repositoryDirectory !== undefined,
    });
    const receiptMatchesCurrentInputs = previousValidation && !provenanceRefresh &&
      previousValidation.inputFingerprint?.schemaVersion === inputFingerprint.schemaVersion &&
      previousValidation.inputFingerprint?.identity === inputFingerprint.identity &&
      validationReceiptErrors(entry, {
        ...release,
        validationProfile: profile,
      }).length === 0 &&
      (!plan.requiresDocumentationReview ||
        text(previousValidation.reviews?.documentation) === documentationReview) &&
      (!plan.requiresVisualReview ||
        text(previousValidation.reviews?.visual) === visualReview) &&
      JSON.stringify(previousValidation.testGrowth ?? null) ===
        JSON.stringify(testGrowthReview ?? null);
    if (receiptMatchesCurrentInputs) {
      return {
        reusedEntry: {
          ...entry,
          validationReused: true,
        },
      };
    }

    return {
      entryStartedAt: entry.startedAt,
      entryBranchName: entry.branchName,
      entryVersionPlan: entry.versionPlan,
      entryWorkType: entry.workType,
      entryImplementationPrompt: entry.implementationPrompt,
      entryPreemptiveChangelog: entry.preemptiveChangelog,
      entryScopes: Array.isArray(entry.scopes) ? [...entry.scopes] : [],
      entryClaims: Array.isArray(entry.claims) ? [...entry.claims] : [],
      entryInputIdentity: contentIdentity(JSON.stringify(validationEntryInputs(entry))),
      previousValidation,
      validation: provenanceRefresh ? undefined : previousValidation,
      provenanceRefresh,
      startBranchSha,
      release,
      plan,
      inputFingerprint,
      documentationReview,
      visualReview,
      testGrowthJustification,
      testGrowthReview,
    };
  });

  if (preparation.reusedEntry) return preparation.reusedEntry;

  const commandRunner = options.commandRunner ?? runValidationCommand;
  const needsEmulator = preparation.plan.commands.includes('npm run test:all');
  const emulatorRepositoryDirectory = validationDirectory;
  const signalSource = options.signalSource ?? process;
  const validationAbort = new AbortController();
  let interruptedSignal;
  const onValidationSignal = (signal) => {
    if (interruptedSignal) return;
    interruptedSignal = signal;
    validationAbort.abort(signal);
  };
  const onValidationInterrupt = () => onValidationSignal('SIGINT');
  const onValidationTerminate = () => onValidationSignal('SIGTERM');
  signalSource.once('SIGINT', onValidationInterrupt);
  signalSource.once('SIGTERM', onValidationTerminate);
  let preparedEmulator;
  let cleanupOutcome;
  try {
    const runValidationCommands = async () => {
      if (interruptedSignal) {
        throw new Error(`Validation for ${options.id} was interrupted by ${interruptedSignal}.`);
      }
      preparedEmulator = needsEmulator
        ? await prepareValidationEmulator({
            repositoryDirectory: emulatorRepositoryDirectory,
            coordinationPath: filePath,
          })
        : undefined;
      for (const command of preparation.plan.commands) {
        if (interruptedSignal) {
          throw new Error(`Validation for ${options.id} was interrupted by ${interruptedSignal}.`);
        }
        try {
          await commandRunner(command, validationDirectory, {
            signal: validationAbort.signal,
            signalSource,
          });
        } catch (error) {
          throw new Error(
            `Validation command failed for ${options.id}: ${command}. ${error instanceof Error ? error.message : String(error)}`,
            { cause: error },
          );
        }
      }
    };
    const validationQueuePath = resolve(
      options.validationQueuePath ?? `${filePath}.validation-queue.json`,
    );
    const validationMode = preparation.plan.profile?.kind === 'copy-only'
      ? 'focused'
      : 'release';
    await withValidationLease(
      validationQueuePath,
      {
        requestId: `${options.id}:${preparation.release.branchSha}`,
        entryId: options.id,
        worktree: process.cwd(),
        kind: validationMode,
        release: validationMode === 'release',
      },
      runValidationCommands,
      {
        signal: validationAbort.signal,
        pollMs: options.validationPollMs ?? 100,
        timeoutMs: options.validationQueueTimeoutMs ?? 60 * 60 * 1000,
      },
    );
  } finally {
    try {
      if (preparedEmulator) {
        cleanupOutcome = await cleanupValidationEmulator(preparedEmulator);
      }
    } finally {
      signalSource.removeListener('SIGINT', onValidationInterrupt);
      signalSource.removeListener('SIGTERM', onValidationTerminate);
    }
  }

  if (interruptedSignal) {
    throw new Error(`Validation for ${options.id} was interrupted by ${interruptedSignal}.`);
  }

  const finalRelease = options.release ?? await readReleaseState({
    startBranchSha: preparation.startBranchSha,
    validation: preparation.validation,
  });
  if (finalRelease.branchSha !== preparation.release.branchSha) {
    throw new Error(
      `Cannot record validation for ${options.id}: branch SHA changed from ${preparation.release.branchSha} to ${finalRelease.branchSha} while checks ran; rerun validation.`,
    );
  }
  const finalProfile = options.release
    ? preparation.plan.profile
    : await deriveValidationProfile({
        release: finalRelease,
        startBranchSha: preparation.startBranchSha,
        cwd: process.cwd(),
      });
  const finalPlan = validationPlanForFiles(finalRelease.changedFiles, {
    profile: finalProfile,
  });
  if (JSON.stringify(finalPlan.commands) !== JSON.stringify(preparation.plan.commands) ||
    JSON.stringify(finalPlan.profile) !== JSON.stringify(preparation.plan.profile)) {
    throw new Error(
      `Cannot record validation for ${options.id}: the derived validation profile changed while checks ran; rerun validation.`,
    );
  }
  const finalErrors = releaseMetadataErrors({
    entry: {
      id: options.id,
      branchName: preparation.entryBranchName,
      versionPlan: preparation.entryVersionPlan,
      workType: preparation.entryWorkType,
      implementationPrompt: preparation.entryImplementationPrompt,
    },
    release: finalRelease,
    requireMerged: false,
    requireReconciled: true,
    releaseFragment: options.releaseFragment ?? options.validatedFragment ?? null,
  });
  const finalTestGrowthReview = testGrowthReviewForRelease({
    release: finalRelease,
    justification: preparation.testGrowthJustification,
  });
  if (finalTestGrowthReview && !finalTestGrowthReview.passed) {
    finalErrors.push(`test-growth gate: ${finalTestGrowthReview.message}`);
  }
  if (finalErrors.length > 0) {
    throw new Error(
      `Cannot record validation for ${options.id}: ${finalErrors.join('; ')}.`,
    );
  }
  const finalInputFingerprint = await validationInputFingerprint({
    entry: {
      id: options.id,
      worktree: process.cwd(),
      startedAt: preparation.entryStartedAt,
      branchName: preparation.entryBranchName,
      versionPlan: preparation.entryVersionPlan,
      workType: preparation.entryWorkType,
      implementationPrompt: preparation.entryImplementationPrompt,
      preemptiveChangelog: preparation.entryPreemptiveChangelog,
      scopes: preparation.entryScopes,
      claims: preparation.entryClaims,
    },
    release: finalRelease,
    plan: finalPlan,
    documentationReview: preparation.documentationReview,
    visualReview: preparation.visualReview,
    testGrowthReview: finalTestGrowthReview,
    repositoryDirectory: emulatorRepositoryDirectory,
    includeFilesystemInputs: !options.release || options.repositoryDirectory !== undefined,
  });
  if (finalInputFingerprint.identity !== preparation.inputFingerprint.identity) {
    throw new Error(
      `Cannot record validation for ${options.id}: validation inputs changed while checks ran; rerun validation.`,
    );
  }

  return withCoordinationLock(filePath, async () => {
    const state = pruneDeadReservations(await readStateUnlocked(filePath));
    const entry = state.entries.find((candidate) => candidate.id === options.id);
    if (!entry) throw new Error(`No coordination entry found for ${options.id}.`);
    if (entry.status !== 'active') {
      throw new Error(`Coordination entry ${entry.id} is already ${text(entry.status, 'historical')}.`);
    }
    if (entry.worktree !== process.cwd()) {
      throw new Error(
        `Cannot validate coordination entry ${entry.id} from ${process.cwd()}; ` +
          `it belongs to ${entry.worktree}.`,
      );
    }

    if (entry.startedAt !== preparation.entryStartedAt) {
      throw new Error(
        `Cannot record validation for ${entry.id}: the coordination entry changed while checks ran; rerun validation.`,
      );
    }
    if (contentIdentity(JSON.stringify(validationEntryInputs(entry))) !==
      preparation.entryInputIdentity) {
      throw new Error(
        `Cannot record validation for ${entry.id}: the coordination entry changed while checks ran; rerun validation.`,
      );
    }
    if (JSON.stringify(entry.validation ?? null) !==
      JSON.stringify(preparation.previousValidation ?? null)) {
      throw new Error(
        `Cannot record validation for ${entry.id}: its validation receipt changed while checks ran; rerun validation.`,
      );
    }

    entry.startBranchSha = preparation.startBranchSha;
    entry.startMainSha = entry.startMainSha || finalRelease.mainSha;
    if (entry.validation) {
      entry.validationHistory = [
        ...(Array.isArray(entry.validationHistory) ? entry.validationHistory : []),
        entry.validation,
      ];
    }
    entry.validation = {
      commitSha: finalRelease.branchSha,
      completedAt: new Date().toISOString(),
      passed: true,
      commands: finalPlan.commands,
      files: preparation.release.changedFiles,
      docsOnly: finalPlan.documentationOnly,
      profile: finalPlan.profile,
      inputFingerprint: finalInputFingerprint,
      ...(preparation.provenanceRefresh
        ? { provenanceRefresh: preparation.provenanceRefresh }
        : {}),
      ...(preparedEmulator
        ? {
            emulator: {
              setup: preparedEmulator.created ? 'auto' : 'existing',
              configurationId: preparedEmulator.configurationId,
              slot: preparedEmulator.slot,
              preexistingConfigIdentity: preparedEmulator.preexistingConfigIdentity,
              generatedFiles: preparedEmulator.files.map(({ path, identity }) => ({
                path,
                identity,
              })),
              cleanup: cleanupOutcome,
            },
          }
        : {}),
      reviews: {
        ...(preparation.documentationReview
          ? { documentation: preparation.documentationReview }
          : {}),
        ...(preparation.visualReview ? { visual: preparation.visualReview } : {}),
      },
      ...(finalTestGrowthReview ? { testGrowth: finalTestGrowthReview } : {}),
    };
    await writeStateUnlocked(filePath, pruneOrphanedConfigurations(state));
    return entry;
  });
}

export async function finishCoordinationEntry(filePath, options) {
  if (!options.id) throw new Error('coordination finish requires --id <entry-id>.');

  return withCoordinationLock(filePath, async () => {
    const state = pruneDeadReservations(await readStateUnlocked(filePath));
    const entry = state.entries.find((candidate) => candidate.id === options.id);
    if (!entry) throw new Error(`No coordination entry found for ${options.id}.`);
    if (entry.status !== 'active') {
      throw new Error(`Coordination entry ${entry.id} is already ${text(entry.status, 'historical')}.`);
    }

    if (entry.worktree !== process.cwd()) {
      throw new Error(
        `Cannot complete coordination entry ${entry.id} from ${process.cwd()}; ` +
          `it belongs to ${entry.worktree}.`,
      );
    }

    const liveReservations = state.reservations.filter(
      (reservation) => reservation.worktree === entry.worktree,
    );
    if (liveReservations.length > 0) {
      const leases = liveReservations
        .map((reservation) => `${reservation.kind} slot ${reservation.slot} (pid ${reservation.pid})`)
        .join(', ');
      throw new Error(
        `Cannot complete coordination entry ${entry.id}: live reservations remain for this worktree: ${leases}. Stop this task's processes before finish.`,
      );
    }

    const release = options.release ?? await readReleaseState({
      startBranchSha: entry.startBranchSha,
      validation: entry.validation,
    });
    const outcome = options.outcome ?? 'landed';
    if (!['landed', 'preserved', 'discarded'].includes(outcome)) {
      throw new Error('coordination finish requires --outcome landed|preserved|discarded.');
    }
    if (outcome !== 'preserved' && options['preserve-ref']) {
      throw new Error('Cannot complete coordination entry: --preserve-ref may only be used with --outcome preserved.');
    }
    if (!release.branchName || release.branchName === 'HEAD' || release.branchName === 'main') {
      throw new Error(`Cannot complete coordination entry ${entry.id}: closeout requires its attached task branch.`);
    }
    if (entry.branchName && release.branchName !== entry.branchName) {
      throw new Error(
        `Cannot complete coordination entry ${entry.id}: checkout branch ${release.branchName} does not match ${entry.branchName}.`,
      );
    }
    if (!release.worktreeClean) {
      throw new Error(`Cannot ${outcome === 'discarded' ? 'discard' : 'complete'} coordination entry ${entry.id}: the checkout has uncommitted changes.`);
    }
    if (release.branchBaselineIsAncestor === false) {
      throw new Error(`Cannot complete coordination entry ${entry.id}: task history was rewritten after coordination began.`);
    }
    let pushed = false;
    if (outcome === 'landed') {
      pushed = validateReleaseCompletion({ entry, release }).pushed;
    } else if (outcome === 'preserved') {
      const preserveRef = text(options['preserve-ref']);
      if (!preserveRef) throw new Error(`Cannot preserve coordination entry ${entry.id}: --preserve-ref is required.`);
      if (!Array.isArray(release.changedFiles) || release.changedFiles.length === 0) {
        throw new Error(`Cannot preserve coordination entry ${entry.id}: preserved work must contain committed changes after start SHA.`);
      }
      const separator = preserveRef.indexOf('/');
      if (separator < 1 || separator === preserveRef.length - 1) {
        throw new Error(`Cannot preserve coordination entry ${entry.id}: --preserve-ref must be remote/branch.`);
      }
      const remote = preserveRef.slice(0, separator);
      const branch = preserveRef.slice(separator + 1);
      const remoteLine = options.preservedRefSha === undefined
        ? await runGit(['ls-remote', '--exit-code', remote, `refs/heads/${branch}`], process.cwd())
        : options.preservedRefSha;
      const destinationSha = remoteLine.split(/\s+/)[0];
      if (destinationSha !== release.branchSha) {
        throw new Error(`Cannot preserve coordination entry ${entry.id}: destination does not contain branch commit ${release.branchSha}.`);
      }
      entry.preservation = {
        kind: 'remote-ref', destination: preserveRef, commitSha: release.branchSha,
        verifiedAt: new Date().toISOString(),
      };
    } else {
      const reason = text(options.reason);
      if (!reason) throw new Error(`Cannot discard coordination entry ${entry.id}: --reason is required.`);
      entry.discard = {
        reason, branchSha: release.branchSha,
        changedFiles: Array.isArray(release.changedFiles) ? [...release.changedFiles] : [],
      };
      entry.discardedAt = new Date().toISOString();
    }
    entry.status = 'complete';
    entry.outcome = outcome;
    entry.completedAt = new Date().toISOString();
    if (options.result) entry.result = options.result;
    entry.finalBranchName = release.branchName;
    entry.finalBranchSha = release.branchSha;
    if (outcome === 'landed') {
      entry.mainSha = release.mainSha;
      entry.originMainSha = release.originMainSha;
      entry.mainContainsBranch = release.mainContainsBranch;
    }
    entry.pushed = pushed;
    await writeStateUnlocked(filePath, pruneOrphanedConfigurations(state));
    return entry;
  });
}

async function status(filePath, { includeHistory = false } = {}) {
  const state = await withCoordinationLock(filePath, async () => {
    const cleanState = pruneOrphanedConfigurations(
      pruneDeadReservations(await readStateUnlocked(filePath)),
      existsSync,
    );
    await writeStateUnlocked(filePath, cleanState);
    return cleanState;
  });
  console.log(`Coordination file: ${filePath}`);
  console.log(formatCoordinationState(state, { includeHistory }));
}

async function main() {
  const [command, ...args] = process.argv.slice(2);

  if (command === 'status') {
    const unexpectedArguments = args.filter((argument) => argument !== '--history');
    if (unexpectedArguments.length > 0) {
      throw new Error('coordination status accepts only the optional --history flag.');
    }
    await status(coordinationFilePath(), { includeHistory: args.includes('--history') });
    return;
  }

  const options = parseOptions(args);
  const filePath = resolve(options.file || coordinationFilePath());
  const releaseLanePath = resolve(
    options['lane-file'] || `${filePath}.release-lane.json`,
  );
  if (command === 'begin') {
    const transport = await ensureSshOrigin();
    const entry = await beginEntry(filePath, options);
    if (transport.changed) {
      console.log(`Normalized origin to SSH: ${transport.origin}`);
    }
    console.log(`Registered preemptive work entry ${entry.id} in ${filePath}.`);
    return;
  }
  if (command === 'forecast' || command === 'conflict-forecast') {
    const forecast = await forecastCoordinationEntry(filePath, options);
    console.log(formatConflictForecast(forecast));
    return;
  }
  if (command === 'claim') {
    const entry = await claimCoordinationEntry(filePath, options);
    console.log(`Claimed coordination ownership for ${entry.id} in ${filePath}.`);
    return;
  }
  if (command === 'heartbeat') {
    const entry = await heartbeatCoordinationEntry(filePath, options);
    console.log(JSON.stringify(entry, null, 2));
    return;
  }
  if (command === 'release-claim') {
    const entry = await releaseCoordinationClaim(filePath, options);
    console.log(`Released coordination ownership for ${entry.id} in ${filePath}.`);
    return;
  }
  if (command === 'lease-status') {
    const state = await readCoordinationState(filePath);
    console.log(leaseStatusesForEntries(state.entries, {
      now: options.now ?? Date.now(),
      leaseMs: options['lease-ms'] ? Number(options['lease-ms']) : undefined,
    }).map(({ entry, lease }) => JSON.stringify({
      id: entry.id,
      status: entry.status,
      worktree: entry.worktree,
      lease,
    })).join('\n'));
    return;
  }
  if (command === 'release-prepare') {
    const result = await prepareReleaseFragmentFile(releaseLanePath, {
      taskId: options['task-id'],
      worktree: options.worktree || process.cwd(),
      changes: options.change ? normalizedList(options.change) : [],
      implementationPrompts: options['implementation-prompts']
        ? normalizedList(options['implementation-prompts'])
        : [],
      baseVersion: options['base-version'],
      baseMainSha: options['base-main-sha'],
    });
    console.log(JSON.stringify(result.fragment, null, 2));
    return;
  }
  if (command === 'release-land') {
    const result = await finalizeReleaseFragment(releaseLanePath, {
      taskId: options['task-id'],
      repositoryDirectory: options.repository || process.cwd(),
      currentMainSha: options['main-sha'],
      now: options.now,
    });
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  if (command === 'amend') {
    const entry = await amendCoordinationEntry(filePath, options);
    console.log(`Amended coordination entry ${entry.id} in ${filePath}.`);
    return;
  }
  if (command === 'validate') {
    const entry = await validateCoordinationEntry(filePath, options);
    console.log(entry.validationReused
      ? `Reused passing validation for coordination entry ${entry.id} in ${filePath}.`
      : `Validated coordination entry ${entry.id} in ${filePath}.`);
    return;
  }
  if (command === 'finish') {
    const entry = await finishCoordinationEntry(filePath, options);
    console.log(`Completed coordination entry ${entry.id} in ${filePath}.`);
    return;
  }

  throw new Error(
    'usage: node scripts/emulator-resource-registry.mjs <status|begin|forecast|claim|heartbeat|release-claim|lease-status|release-prepare|release-land|amend|validate|finish> [options]',
  );
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
