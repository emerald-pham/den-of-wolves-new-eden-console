// Fails a pull request whose body or commit messages would make GitHub close
// an issue on merge. Ticket completion goes through the prompt tracker, which
// records evidence; a native closing keyword bypasses it. Commit messages
// matter too: with merge commits, each PR commit lands on the default branch
// and its closing keywords take effect there.
//
// The body arrives through the PR_BODY environment variable so it is never
// interpolated into a shell command. PR_BASE_SHA and PR_HEAD_SHA bound the
// commit range; the commits are read with git from a full-history checkout.

import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const KEYWORD = String.raw`\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\b`;
const ISSUE_REFERENCE = String.raw`(?:[\w.-]+\/[\w.-]+)?#\d+|https?:\/\/github\.com\/[\w.-]+\/[\w.-]+\/issues\/\d+`;
const CLOSING_REFERENCE = new RegExp(`${KEYWORD}:?\\s+(?:${ISSUE_REFERENCE})\\b`, 'gi');

export function findClosingReferences(body) {
  return [...String(body ?? '').matchAll(CLOSING_REFERENCE)].map((match) => match[0]);
}

/** Each commit in base..head whose message holds a closing reference. */
export function findClosingCommits({ base, head, cwd = process.cwd() }) {
  const log = execFileSync('git', ['log', '--format=%H%x1f%B%x1e', `${base}..${head}`], {
    cwd,
    encoding: 'utf8',
  });
  return log.split('\x1e')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const [sha, message] = entry.split('\x1f');
      return { sha, references: findClosingReferences(message) };
    })
    .filter(({ references }) => references.length > 0);
}

export function closingFindings({ body, base, head, cwd } = {}) {
  const findings = findClosingReferences(body).map((reference) => `PR body: ${reference}`);
  if (base && head) {
    for (const { sha, references } of findClosingCommits({ base, head, cwd })) {
      for (const reference of references) findings.push(`commit ${sha.slice(0, 12)}: ${reference}`);
    }
  }
  return findings;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const findings = closingFindings({
    body: process.env.PR_BODY,
    base: process.env.PR_BASE_SHA,
    head: process.env.PR_HEAD_SHA,
  });
  if (findings.length > 0) {
    console.error([
      'This pull request would close issues on merge:',
      ...findings.map((finding) => `  ${finding}`),
      'Remove the closing keyword (close, fix or resolve and their variants) or reword it, for example "Refs #N".',
      'Reword a commit message by rewriting the branch, or start a new branch without it.',
      'Close tickets with completion evidence instead:',
      '  Tracked briefs: npm run prompt-tracker -- update --issue NUMBER --close-as completed --reviewed --accepted --evidence PATH#ANCHOR',
      '  Tracked prompts: npm run prompt-tracker -- update --issue NUMBER --status done --reviewed --accepted --evidence PATH#ANCHOR',
      '  Refinement children (not in docs/tracker/github-crosswalk.json): gh issue close NUMBER --reason completed --comment "Evidence: PATH#ANCHOR"',
    ].join('\n'));
    process.exitCode = 1;
  } else {
    console.log('No GitHub closing keywords found in the pull request body or commit messages.');
  }
}
