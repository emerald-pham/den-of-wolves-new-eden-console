#!/usr/bin/env node
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const execFileAsync = promisify(execFile);

export const TEST_GROWTH_REVIEW_LIMITS = Object.freeze({
  minimumAddedLines: 160,
  maximumLinesPerAddedCase: 40,
  minimumJustificationLength: 20,
});

const TEST_FILE_PATTERN = /(?:^|\/)[^/]+\.(?:test|spec)\.(?:[cm]?[jt]sx?)$/i;
const TEST_CASE_PATTERN = /^\s*(?:it|test)(?:\.(?:each|skip|todo))?\s*\(/;

export function isTestFilePath(filePath) {
  return typeof filePath === 'string' && TEST_FILE_PATTERN.test(filePath);
}

function normalizeDiffPath(filePath) {
  const trimmed = filePath.trim();
  const renameParts = trimmed.split(' => ');
  return renameParts.at(-1)?.replace(/^\{/, '').replace(/\}$/, '') ?? trimmed;
}

function parseAddedLines(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

function parseNumstat(numstat) {
  const changedTestFiles = [];
  let addedTestFiles = 0;
  let addedTestLines = 0;

  for (const line of String(numstat ?? '').split('\n')) {
    if (!line.trim()) continue;
    const columns = line.split('\t');
    if (columns.length < 3) continue;
    const filePath = normalizeDiffPath(columns.slice(2).join('\t'));
    if (!isTestFilePath(filePath)) continue;

    changedTestFiles.push(filePath);
    const addedLines = parseAddedLines(columns[0]);
    if (addedLines > 0) addedTestFiles += 1;
    addedTestLines += addedLines;
  }

  return {
    changedTestFiles: [...new Set(changedTestFiles)],
    addedTestFiles,
    addedTestLines,
  };
}

function countAddedTestCases(patch) {
  let currentFile;
  let addedTestCases = 0;

  for (const line of String(patch ?? '').split('\n')) {
    const fileHeader = line.match(/^\+\+\+ b\/(.+)$/);
    if (fileHeader) {
      currentFile = fileHeader[1];
      continue;
    }
    if (
      currentFile &&
      isTestFilePath(currentFile) &&
      line.startsWith('+') &&
      !line.startsWith('+++') &&
      TEST_CASE_PATTERN.test(line.slice(1))
    ) {
      addedTestCases += 1;
    }
  }

  return addedTestCases;
}

export function summarizeTestGrowthDiff({ baseSha, headSha, numstat, patch }) {
  const parsedNumstat = parseNumstat(numstat);
  const addedTestCases = countAddedTestCases(patch);
  const linesPerAddedCase = addedTestCases > 0
    ? parsedNumstat.addedTestLines / addedTestCases
    : null;

  return {
    baseSha,
    headSha,
    ...parsedNumstat,
    addedTestCases,
    linesPerAddedCase,
  };
}

export function reviewTestGrowth(summary, justification = '') {
  const normalizedJustification = typeof justification === 'string'
    ? justification.trim()
    : '';
  const reviewRequired = (
    summary.addedTestLines > 0 && summary.addedTestCases === 0
  ) || (
    summary.addedTestLines >= TEST_GROWTH_REVIEW_LIMITS.minimumAddedLines &&
    (summary.linesPerAddedCase ?? Number.POSITIVE_INFINITY) >=
      TEST_GROWTH_REVIEW_LIMITS.maximumLinesPerAddedCase
  );

  if (!reviewRequired) {
    return {
      ...summary,
      passed: true,
      reviewRequired: false,
      waived: false,
      justification: normalizedJustification,
    };
  }

  if (normalizedJustification.length >= TEST_GROWTH_REVIEW_LIMITS.minimumJustificationLength) {
    return {
      ...summary,
      passed: true,
      reviewRequired: true,
      waived: true,
      justification: normalizedJustification,
    };
  }

  const reason = summary.addedTestCases === 0
    ? `adds ${summary.addedTestLines} test lines without a new test case`
    : `adds ${summary.addedTestLines} test lines for ${summary.addedTestCases} new test cases (${summary.linesPerAddedCase.toFixed(1)} lines per case)`;
  return {
    ...summary,
    passed: false,
    reviewRequired: true,
    waived: false,
    justification: normalizedJustification,
    message: `Test-growth gate requires a justification: ${reason}. Use --test-growth-justification "..." to record why this fixture, matrix, security, or composition coverage is necessary.`,
  };
}

async function runGit(args, cwd) {
  const result = await execFileAsync('git', args, {
    cwd,
    encoding: 'utf8',
  });
  return result.stdout;
}

export async function measureTestGrowth({
  baseSha,
  headSha = 'HEAD',
  cwd = process.cwd(),
  git = runGit,
} = {}) {
  if (!baseSha) throw new Error('Test-growth measurement requires a base SHA.');
  const diffRange = `${baseSha}...${headSha}`;
  const [numstat, patch] = await Promise.all([
    git(['diff', '--numstat', diffRange, '--'], cwd),
    git(['diff', '--unified=0', diffRange, '--'], cwd),
  ]);
  return summarizeTestGrowthDiff({ baseSha, headSha, numstat, patch });
}

export function formatTestGrowthReview(result) {
  const files = result.changedTestFiles.length;
  const ratio = result.linesPerAddedCase === null
    ? 'n/a'
    : result.linesPerAddedCase.toFixed(1);
  return [
    `Test-growth review: ${result.passed ? 'passed' : 'blocked'}`,
    `test files changed=${files}`,
    `added lines=${result.addedTestLines}`,
    `added cases=${result.addedTestCases}`,
    `lines per added case=${ratio}`,
    result.waived ? 'justification recorded=yes' : 'justification recorded=no',
  ].join('; ');
}

function parseArguments(args) {
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

async function main() {
  const options = parseArguments(process.argv.slice(2));
  if (!options.base) throw new Error('usage: npm run test:growth -- --base <sha> [--head <sha>] [--justification <text>]');
  const result = reviewTestGrowth(
    await measureTestGrowth({
      baseSha: options.base,
      headSha: options.head ?? 'HEAD',
      cwd: process.cwd(),
    }),
    options.justification,
  );
  console.log(formatTestGrowthReview(result));
  if (!result.passed) {
    console.error(result.message);
    process.exitCode = 1;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
