import { execFileSync } from 'node:child_process';

export const UNKNOWN_DIFF = '__unknown_diff__';
const ZERO_SHA = /^0{40}$/;
const SHA = /^[0-9a-f]{40}$/i;

function text(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function usableSha(value) {
  const candidate = text(value);
  return SHA.test(candidate) && !ZERO_SHA.test(candidate) ? candidate : '';
}

function isZeroSha(value) {
  return ZERO_SHA.test(text(value));
}

/**
 * Select a safe changed-path baseline for a pull request or branch push.
 *
 * A force-pushed branch can report a `before` commit that is no longer
 * reachable from the checkout. Try to fetch that exact commit first. If it is
 * unavailable, fall back to the common ancestor with origin/main. Returning
 * `undefined` deliberately means "unknown" so callers can run every gate.
 */
export function resolveChangedPathBase({
  pullRequestBaseSha = '',
  pushBeforeSha = '',
  headSha = '',
  revisionExists = () => false,
  fetchRevision = () => false,
  mergeBase = () => '',
} = {}) {
  const head = usableSha(headSha);
  const pullRequestBase = text(pullRequestBaseSha);
  if (pullRequestBase && !isZeroSha(pullRequestBase)) {
    // Keep the pull-request range contract unchanged. Checkout fetch-depth is
    // responsible for making this base available, as it was before this
    // helper existed.
    return { baseSha: pullRequestBase, source: 'pull-request' };
  }

  const before = usableSha(pushBeforeSha);
  if (before && before === head) {
    // An unchanged range is ambiguous for a branch event. Keep the existing
    // fail-closed behavior instead of trying to infer a smaller diff.
    return { baseSha: undefined, source: 'unknown' };
  }

  if (before) {
    if (revisionExists(before)) return { baseSha: before, source: 'push-before' };
    if (fetchRevision(before) && revisionExists(before)) {
      return { baseSha: before, source: 'fetched-push-before' };
    }
  }

  const fallback = usableSha(mergeBase('origin/main', head));
  if (fallback && fallback !== head) {
    return { baseSha: fallback, source: 'merge-base' };
  }
  return { baseSha: undefined, source: 'unknown' };
}

/**
 * Resolve the changed paths consumed by risk-gates.mjs.
 *
 * A failed branch-range lookup is intentionally represented by the sentinel
 * rather than an empty list. The risk classifier treats it as a full gate.
 */
export function changedPaths({
  pullRequestBaseSha = '',
  pushBeforeSha = '',
  headSha = '',
  revisionExists,
  fetchRevision,
  mergeBase,
  diffNameOnly,
} = {}) {
  const resolution = resolveChangedPathBase({
    pullRequestBaseSha,
    pushBeforeSha,
    headSha,
    revisionExists,
    fetchRevision,
    mergeBase,
  });
  const head = usableSha(headSha);
  if (!resolution.baseSha || !head || resolution.baseSha === head) {
    return { paths: [UNKNOWN_DIFF], ...resolution };
  }

  try {
    const paths = diffNameOnly(resolution.baseSha, head)
      .map((path) => String(path).trim())
      .filter(Boolean);
    return { paths, ...resolution };
  } catch (error) {
    if (resolution.source === 'pull-request') throw error;
    return { paths: [UNKNOWN_DIFF], source: 'unknown', error };
  }
}

function gitRevisionExists(revision) {
  try {
    execFileSync('git', ['cat-file', '-e', `${revision}^{commit}`], {
      stdio: 'ignore',
    });
    return true;
  } catch {
    return false;
  }
}

function fetchGitRevision(revision) {
  try {
    execFileSync('git', ['fetch', '--no-tags', 'origin', revision], {
      stdio: 'ignore',
    });
    return true;
  } catch {
    return false;
  }
}

function gitMergeBase(remote, head) {
  try {
    return execFileSync('git', ['merge-base', remote, head], {
      encoding: 'utf8',
    }).trim();
  } catch {
    return '';
  }
}

function gitDiffNameOnly(base, head) {
  return execFileSync('git', ['diff', '--name-only', base, head], {
    encoding: 'utf8',
  }).split(/\r?\n/);
}

function option(argv, name) {
  const index = argv.indexOf(name);
  return index >= 0 ? argv[index + 1] : undefined;
}

if (process.argv[1]?.endsWith('/ci-changed-paths.mjs')) {
  const argv = process.argv.slice(2);
  const headSha = option(argv, '--head');
  if (!headSha) throw new Error('Usage: ci-changed-paths.mjs --head <sha> [--pr-base <sha>] [--push-before <sha>]');

  const result = changedPaths({
    headSha,
    pullRequestBaseSha: option(argv, '--pr-base'),
    pushBeforeSha: option(argv, '--push-before'),
    revisionExists: gitRevisionExists,
    fetchRevision: fetchGitRevision,
    mergeBase: gitMergeBase,
    diffNameOnly: gitDiffNameOnly,
  });
  if (result.source === 'merge-base') {
    console.error('The push-before commit was unavailable; using merge-base origin/main for changed-path classification.');
  } else if (result.source === 'unknown') {
    console.error('The changed-path range was unavailable; using conservative full-gate classification.');
  }
  process.stdout.write(`${result.paths.join('\n')}\n`);
}
