#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

function isDocumentationFile(filePath) {
  const fileName = basename(filePath);
  return /\.mdx?$/i.test(fileName) || fileName === 'README' || /^README\./i.test(fileName);
}

const PROMPT_DEPENDENCY_INDEX_PATH = 'docs/IMPLEMENTATION_PROMPT_DEPENDENCIES.md';
const RETIRED_PROMPT_IDS = new Set(['071']);

function promptDependencyTargets(value) {
  if (value === 'none') return [];
  const targets = [];
  for (const token of value.split(';')) {
    const range = token.match(/^(\d{3})-(\d{3})$/);
    if (range) {
      const start = Number.parseInt(range[1], 10);
      const end = Number.parseInt(range[2], 10);
      for (let number = start; number <= end; number += 1) {
        const prompt = String(number).padStart(3, '0');
        if (!RETIRED_PROMPT_IDS.has(prompt)) targets.push(prompt);
      }
      continue;
    }
    if (/^\d{3}[a-z]*$/i.test(token) && !RETIRED_PROMPT_IDS.has(token)) {
      targets.push(token.toLowerCase());
    }
  }
  return targets;
}

/**
 * Keep the completion gate fail-closed for the explicit hard prompt edges.
 * The dependency index remains the source of truth for parsing and evidence;
 * this guard only prevents a live done row from outrunning an unfinished
 * prompt prerequisite.
 */
export function validatePromptDependencyCompletion({ dependencySource, progressSource } = {}) {
  const progressByPrompt = new Map(
    [...String(progressSource ?? '').matchAll(/^\|\s*(\d{3}[a-z]*)\s*\|\s*([^|]+)\s*\|/gim)]
      .map((match) => [match[1].toLowerCase(), match[2].trim().toLowerCase()]),
  );
  const errors = [];
  for (const line of String(dependencySource ?? '').split('\n')) {
    if (!/^\|\s*\d{3}[a-z]*\s*\|/i.test(line)) continue;
    const cells = line.slice(1, line.endsWith('|') ? -1 : undefined)
      .split('|')
      .map((cell) => cell.trim());
    if (cells.length < 4) continue;
    const prompt = cells[0].toLowerCase();
    if (progressByPrompt.get(prompt) !== 'done') continue;
    for (const prerequisite of promptDependencyTargets(cells[3])) {
      const status = progressByPrompt.get(prerequisite);
      if (status !== 'done') {
        errors.push(
          `Prompt ${prompt} is marked done but hard prerequisite ${prerequisite} is ${status ?? 'unknown'}.`,
        );
      }
    }
  }
  return errors;
}

const PROMPT_DEPENDENCY_GUIDANCE = Object.freeze([
  ['AGENTS.md', /before selecting[\s\S]*prompt/i],
  ['CLAUDE.md', /before selecting[\s\S]*prompt/i],
  ['README.md', /before selecting[\s\S]*prompt/i],
  ['docs/WORKTREE_COORDINATION.md', /before selecting[\s\S]*prompt/i],
  ['docs/IMPLEMENTATION_PLAN.md', /before selecting[\s\S]*prompt/i],
  [PROMPT_DEPENDENCY_INDEX_PATH, /mandatory[\s\S]*before selecting[\s\S]*prompt/i],
]);

function validatePromptDependencyGuidance({ sources, errors }) {
  for (const [filePath, selectionPattern] of PROMPT_DEPENDENCY_GUIDANCE) {
    const source = sources.get(filePath);
    if (typeof source !== 'string') {
      errors.push(`${filePath}: required prompt dependency guidance file is missing`);
      continue;
    }
    if (!source.includes('IMPLEMENTATION_PROMPT_DEPENDENCIES.md')) {
      errors.push(`${filePath}: must link IMPLEMENTATION_PROMPT_DEPENDENCIES.md`);
    }
    if (!selectionPattern.test(source)) {
      errors.push(`${filePath}: must require reading prompt dependencies before selecting a prompt`);
    }
  }

  const claude = sources.get('CLAUDE.md') ?? '';
  const normalizedClaude = claude.replace(/\s+/g, ' ').toLowerCase();
  for (const requiredText of [
    'after rebase',
    'material main movement',
    'hard prerequisites that remain unmet',
    'cannot be marked complete',
    'cannot merge',
  ]) {
    if (!normalizedClaude.includes(requiredText)) {
      errors.push(`CLAUDE.md is missing prompt dependency gate guidance: ${requiredText}`);
    }
  }
  const plan = sources.get('docs/IMPLEMENTATION_PLAN.md') ?? '';
  if (!/not standalone/i.test(plan)) {
    errors.push('docs/IMPLEMENTATION_PLAN.md must state that it is not standalone');
  }
}

function changedFiles(cwd) {
  return execFileSync('git', ['diff', '--name-only', 'main...HEAD'], {
    cwd,
    encoding: 'utf8',
  })
    .split('\n')
    .map((filePath) => filePath.trim())
    .filter(Boolean);
}

function checkMarkdownFile(cwd, filePath, scripts, errors) {
  const absolutePath = resolve(cwd, filePath);
  if (!existsSync(absolutePath)) return;

  const source = readFileSync(absolutePath, 'utf8');
  const lines = source.split('\n');
  let fence;
  for (const line of lines) {
    const match = line.match(/^\s*(`{3,}|~{3,})/);
    if (!match) continue;
    const marker = match[1][0];
    if (!fence) {
      fence = marker;
    } else if (fence === marker) {
      fence = undefined;
    }
  }
  if (fence) errors.push(`${filePath}: unclosed ${fence} fenced code block`);

  for (const match of source.matchAll(/!?\[[^\]]*\]\(([^)\n]+)\)/g)) {
    let target = match[1].trim();
    if (target.startsWith('<')) {
      const closingBracket = target.indexOf('>');
      target = closingBracket >= 0 ? target.slice(1, closingBracket) : target;
    } else {
      target = target.split(/\s+/, 1)[0];
    }
    if (!target || target.startsWith('#') || /^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(target)) {
      continue;
    }
    const pathPart = target.split(/[?#]/, 1)[0];
    let decodedPath;
    try {
      decodedPath = decodeURIComponent(pathPart);
    } catch {
      errors.push(`${filePath}: invalid URL encoding in link target ${target}`);
      continue;
    }
    if (!existsSync(resolve(dirname(absolutePath), decodedPath))) {
      errors.push(`${filePath}: link target does not exist: ${target}`);
    }
  }

  for (const match of source.matchAll(/\bnpm run ([a-z0-9:_-]+)/gi)) {
    const scriptName = match[1];
    if (!scripts[scriptName]) {
      errors.push(`${filePath}: npm script does not exist: ${scriptName}`);
    }
  }
}

/** Validate the deterministic portion of the repository's Markdown contract. */
export function validateDocumentation({ cwd = process.cwd(), files } = {}) {
  const packageJson = JSON.parse(readFileSync(resolve(cwd, 'package.json'), 'utf8'));
  const candidateFiles = files ?? changedFiles(cwd);
  const documentationFiles = [
    ...new Set([
      ...candidateFiles.filter(isDocumentationFile),
      'AGENTS.md',
      'CLAUDE.md',
    ]),
  ];
  const errors = [];

  if (documentationFiles.length === 0) {
    errors.push('no documentation files were found in the task diff');
  }
  for (const filePath of documentationFiles) {
    checkMarkdownFile(cwd, filePath, packageJson.scripts ?? {}, errors);
  }

  const agents = readFileSync(resolve(cwd, 'AGENTS.md'), 'utf8');
  const claude = readFileSync(resolve(cwd, 'CLAUDE.md'), 'utf8');
  const dependencySource = readFileSync(resolve(cwd, PROMPT_DEPENDENCY_INDEX_PATH), 'utf8');
  const progressSource = readFileSync(resolve(cwd, 'docs/IMPLEMENTATION_PROGRESS.md'), 'utf8');
  for (const requiredText of [
    'CLAUDE.md',
    'coordination:validate',
    'coordination:finish',
    'machine-checked',
  ]) {
    if (!agents.includes(requiredText)) {
      errors.push(`AGENTS.md is missing required guidance: ${requiredText}`);
    }
  }
  for (const requiredText of [
    'coordination:begin',
    'coordination:validate',
    'coordination:finish',
    'origin/main',
    'machine-checked',
  ]) {
    if (!claude.includes(requiredText)) {
      errors.push(`CLAUDE.md is missing required guidance: ${requiredText}`);
    }
  }

  const guidanceSources = new Map([
    ['AGENTS.md', agents],
    ['CLAUDE.md', claude],
    ['README.md', readFileSync(resolve(cwd, 'README.md'), 'utf8')],
    ['docs/WORKTREE_COORDINATION.md', readFileSync(resolve(cwd, 'docs/WORKTREE_COORDINATION.md'), 'utf8')],
    ['docs/IMPLEMENTATION_PLAN.md', readFileSync(resolve(cwd, 'docs/IMPLEMENTATION_PLAN.md'), 'utf8')],
    [PROMPT_DEPENDENCY_INDEX_PATH, dependencySource],
  ]);
  validatePromptDependencyGuidance({ sources: guidanceSources, errors });
  errors.push(...validatePromptDependencyCompletion({ dependencySource, progressSource }));

  return errors;
}

async function main() {
  const errors = validateDocumentation();
  if (errors.length > 0) {
    throw new Error(`Documentation validation failed:\n- ${errors.join('\n- ')}`);
  }
  console.log('Documentation validation passed.');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
