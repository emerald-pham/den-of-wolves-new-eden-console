import { execFileSync } from 'node:child_process';

export const ALL_DEPLOYMENT_TARGETS = Object.freeze([
  'hosting',
  'firestore',
  'functions',
]);

const WEB_FILES = new Set([
  'index.html',
  'package.json',
  'package-lock.json',
]);

const FIRESTORE_FILES = new Set([
  'firestore.rules',
  'firestore.indexes.json',
]);

const TOOLING_ONLY_FILES = new Set([
  'docs/implementation-prompts.json',
]);

function normalizeFile(file) {
  return String(file).trim().replaceAll('\\', '/').replace(/^\.\//, '');
}

function isDocumentation(file) {
  return /(?:^|\/)(?:README(?:\..*)?|.*\.md)$/i.test(file);
}

function isTestFile(file) {
  return /(?:^|\/)(?:__tests__|tests)(?:\/|$)/i.test(file) ||
    /(?:^|\/)[^/]+\.(?:test|spec)\.[^/]+$/i.test(file);
}

function isToolingOnly(file) {
  return TOOLING_ONLY_FILES.has(file) ||
    file.startsWith('.githooks/') ||
    file.startsWith('.github/') ||
    file.startsWith('scripts/') ||
    /(?:^|\/)(?:eslint\.config\.|\.eslintrc|vitest\.config\.)/.test(file);
}

function addAllTargets(targets) {
  for (const target of ALL_DEPLOYMENT_TARGETS) targets.add(target);
}

export function classifyChangedFiles(files, { manual = false } = {}) {
  if (manual) {
    return {
      targets: [...ALL_DEPLOYMENT_TARGETS],
      unknownFiles: [],
      ignoredFiles: [],
    };
  }

  const targets = new Set();
  const unknownFiles = [];
  const ignoredFiles = [];
  const normalizedFiles = [...new Set(files.map(normalizeFile).filter(Boolean))].sort();

  for (const file of normalizedFiles) {
    if (isDocumentation(file) || isTestFile(file) || isToolingOnly(file)) {
      ignoredFiles.push(file);
      continue;
    }
    if (file === 'firebase.json' || file === '.firebaserc') {
      addAllTargets(targets);
    } else if (FIRESTORE_FILES.has(file)) {
      targets.add('firestore');
    } else if (file.startsWith('functions/')) {
      targets.add('functions');
    } else if (
      WEB_FILES.has(file) ||
      file.startsWith('src/') ||
      file.startsWith('public/') ||
      /^tsconfig[^/]*\.json$/i.test(file) ||
      /^vite\.config\.[^/]+$/i.test(file)
    ) {
      targets.add('hosting');
    } else {
      unknownFiles.push(file);
      addAllTargets(targets);
    }
  }

  return {
    targets: ALL_DEPLOYMENT_TARGETS.filter((target) => targets.has(target)),
    unknownFiles,
    ignoredFiles,
  };
}

function revisionIsAncestor(before, after) {
  try {
    execFileSync('git', ['merge-base', '--is-ancestor', before, after], {
      stdio: 'ignore',
    });
    return true;
  } catch {
    return false;
  }
}

export function classifyDeploymentRange({
  before,
  after,
  currentMainTip = after,
  manual = false,
  changedFiles,
  isAncestor = revisionIsAncestor,
} = {}) {
  const currentTip = Boolean(after && currentMainTip && after === currentMainTip);
  if (!currentTip) {
    return {
      targets: [],
      unknownFiles: [],
      ignoredFiles: [],
      currentTip: false,
      staleRun: true,
      baselineAncestry: false,
    };
  }
  if (manual) {
    return {
      ...classifyChangedFiles([], { manual: true }),
      currentTip: true,
      staleRun: false,
      baselineAncestry: true,
    };
  }
  if (!before) {
    return {
      ...classifyChangedFiles(['__missing_diff_revision__']),
      currentTip: true,
      staleRun: false,
      baselineAncestry: false,
    };
  }
  const baselineAncestry = isAncestor(before, after);
  if (!baselineAncestry) {
    return {
      ...classifyChangedFiles(['__unreadable_diff__']),
      currentTip: true,
      staleRun: false,
      baselineAncestry: false,
    };
  }
  return {
    ...classifyChangedFiles(changedFiles ?? filesFromGit(before, after)),
    currentTip: true,
    staleRun: false,
    baselineAncestry: true,
  };
}

export function formatGitHubOutputs(result) {
  return [
    `targets=${result.targets.join(',')}`,
    `has_targets=${result.targets.length > 0}`,
    `unknown_files=${JSON.stringify(result.unknownFiles)}`,
    `ignored_files=${JSON.stringify(result.ignoredFiles)}`,
    `current_tip=${result.currentTip !== false}`,
    `stale_run=${result.staleRun === true}`,
    `baseline_ancestry=${result.baselineAncestry !== false}`,
  ].join('\n');
}

function parseOptions(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const name = argv[index];
    const value = argv[index + 1];
    if (!name?.startsWith('--') || value === undefined) {
      throw new Error('Usage: deployment-targets.mjs --before <sha> --after <sha> [--current-main-tip <sha>] [--manual true|false]');
    }
    options[name.slice(2)] = value;
    index += 1;
  }
  return options;
}

function filesFromGit(before, after) {
  if (!before || !after) return ['__missing_diff_revision__'];
  try {
    return execFileSync('git', ['diff', '--name-only', before, after], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).split('\n').filter(Boolean);
  } catch {
    return ['__unreadable_diff__'];
  }
}

if (process.argv[1] && process.argv[1].endsWith('/deployment-targets.mjs')) {
  const options = parseOptions(process.argv.slice(2));
  const result = classifyDeploymentRange({
    before: options.before,
    after: options.after,
    currentMainTip: options['current-main-tip'] || options.after,
    manual: options.manual === 'true',
  });
  process.stdout.write(`${formatGitHubOutputs(result)}\n`);
}
