// Fails a pull request whose body would make GitHub close an issue on merge.
// Ticket completion goes through the prompt tracker, which records evidence;
// a native closing keyword bypasses it.
//
// The body arrives through the PR_BODY environment variable so it is never
// interpolated into a shell command.

const KEYWORD = String.raw`\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\b`;
const ISSUE_REFERENCE = String.raw`(?:[\w.-]+\/[\w.-]+)?#\d+|https?:\/\/github\.com\/[\w.-]+\/[\w.-]+\/issues\/\d+`;
const CLOSING_REFERENCE = new RegExp(`${KEYWORD}:?\\s+(?:${ISSUE_REFERENCE})\\b`, 'gi');

export function findClosingReferences(body) {
  return [...String(body ?? '').matchAll(CLOSING_REFERENCE)].map((match) => match[0]);
}

if (process.argv[1] && process.argv[1].endsWith('/pr-closing-keywords.mjs')) {
  const references = findClosingReferences(process.env.PR_BODY);
  if (references.length > 0) {
    console.error([
      `This pull request body would close issues on merge: ${references.join(', ')}.`,
      'Remove the closing keyword (close, fix or resolve and their variants) or reword it, for example "Refs #N".',
      'Close tickets through the prompt tracker so completion evidence is recorded:',
      '  npm run prompt-tracker -- update --issue NUMBER --status done --reviewed --accepted --evidence PATH#ANCHOR',
    ].join('\n'));
    process.exitCode = 1;
  } else {
    console.log('No GitHub closing keywords found in the pull request body.');
  }
}
