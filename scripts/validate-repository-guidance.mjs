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
const CAMPAIGN_PLAYBOOK_PATH = 'docs/AGENT_CAMPAIGN_PLAYBOOK.md';
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
  ['docs/IMPLEMENTATION_MILESTONES.md', /before selecting[\s\S]*prompt/i],
  ['docs/IMPLEMENTATION_PROGRESS.md', /before selecting[\s\S]*prompt/i],
  [CAMPAIGN_PLAYBOOK_PATH, /before selecting[\s\S]*prompt/i],
]);

function normalizeGuidance(source) {
  return source.replace(/[`*]/g, '').replace(/\s+/g, ' ').toLowerCase();
}

function hasPromptDependencyReadRequirement(source) {
  return /(?:\bread(?:ing)?[\s\S]{0,180}implementation_prompt_dependencies\.md[\s\S]{0,180}(?:first|before selecting|before assigning|before starting|before editing)|before (?:selecting|assigning|starting|editing)[\s\S]{0,180}\bread(?:ing)?[\s\S]{0,180}implementation_prompt_dependencies\.md)/i.test(source);
}

function hasDispatcherRequirement(source) {
  return /\b(?:run|use|refresh)(?:\s+\w+){0,8}\s+(?:deterministic\s+)?dispatcher\b/i.test(source);
}

function hasCurrentStateReconciliation(source) {
  return /reconcil\w*[\s\S]{0,300}(?:current main[\s\S]{0,300}coordination|coordination[\s\S]{0,300}current main)/i.test(source);
}

function hasMainMovementReread(source) {
  return /\bre-?read\b/i.test(source) &&
    /\b(?:rebase|material (?:main )?movement)\b/i.test(source) &&
    /\bcurrent main\b/i.test(source);
}

function hasCompletionBlock(source) {
  return /\bcannot be marked complete\b/i.test(source) &&
    /\b(?:cannot merge|merged)\b/i.test(source) &&
    /\bhard prerequisites?\b/i.test(source) &&
    /\bunmet\b/i.test(source);
}

const PROMPT_DEPENDENCY_CONCURRENCY_SURFACES = Object.freeze([
  'AGENTS.md',
  'CLAUDE.md',
  'README.md',
  'docs/WORKTREE_COORDINATION.md',
  'docs/IMPLEMENTATION_PLAN.md',
  PROMPT_DEPENDENCY_INDEX_PATH,
  'docs/IMPLEMENTATION_MILESTONES.md',
  'docs/IMPLEMENTATION_PROGRESS.md',
  CAMPAIGN_PLAYBOOK_PATH,
]);

/**
 * Keep the queue's resume hint from becoming a hidden serial execution lock.
 * Every agent-facing surface must describe the same safe concurrency policy:
 * NEXT is the primary lane, while later dependency-ready work may proceed
 * only after all hard gates and ownership checks pass.
 */
export function validatePromptDependencyConcurrency({ sources, errors }) {
  for (const filePath of PROMPT_DEPENDENCY_CONCURRENCY_SURFACES) {
    const source = sources.get(filePath);
    if (typeof source !== 'string') {
      errors.push(`${filePath}: missing prompt concurrency policy`);
      continue;
    }
    const normalized = normalizeGuidance(source);
    const checks = [
      [
        'must identify NEXT/READY_QUEUE as the primary resume/default lane',
        /\bnext\b[\s\S]{0,180}\bready_queue\b[\s\S]{0,180}\bprimary\b[\s\S]{0,120}\b(?:resume|default)\b/i,
      ],
      [
        'must make the primary lane advisory for concurrency, not serial-only',
        /\b(?:advisory|not a serial execution lock|not serial)\b[\s\S]{0,180}\bconcurr/i,
      ],
      [
        'must allow later READY_QUEUE claims only as safe concurrent work',
        /(?:\blater\b[\s\S]{0,180}\bready_queue\b[\s\S]{0,180}\b(?:claim|select|proceed|worktree)\b[\s\S]{0,180}\bconcurr|\b(?:claim|select|proceed)\b[\s\S]{0,180}\blater\b[\s\S]{0,180}\bready_queue\b[\s\S]{0,180}\bconcurr)/i,
      ],
      [
        'must require hard prerequisites, milestone, contract, and owner gates',
        /\bhard prompt prerequisites?\b/i,
      ],
      ['must name hard milestone and contract gates', /\bhard milestone\b[\s\S]{0,180}\bhard contract\b/i],
      ['must name decision-owner gates', /\bdecision[- ]owner\b[\s\S]{0,180}\b(?:gate|confirmed|satisfied)\b/i],
      [
        'must require a conflict-free coordination forecast/ownership check',
        /\bcoordination\b[\s\S]{0,220}\b(?:forecast|ownership)\b[\s\S]{0,220}\b(?:conflict|overlap|claim)\b/i,
      ],
      [
        'must prohibit bypassing dependencies, active claims, or unresolved owner gates',
        /\b(?:must not|never|cannot)\b[\s\S]{0,180}\b(?:bypass|skip|override)\b[\s\S]{0,180}\b(?:dependenc|active claim|decision[- ]owner)\b/i,
      ],
    ];
    for (const [message, pattern] of checks) {
      if (!pattern.test(normalized)) errors.push(`${filePath}: ${message}`);
    }
    if (/\bclaim (?:only )?the first unclaimed item in ready_queue\b/i.test(normalized)) {
      errors.push(`${filePath}: retains a serial-only first-unclaimed READY_QUEUE claim rule`);
    }
  }
}

/**
 * Keep the reusable campaign goal fail-closed against the coordination
 * shortcuts that previously caused repeated release and steering cycles.
 * These intentionally test durable meaning rather than one full paragraph.
 */
export function validateCampaignPlaybook({ source, errors } = {}) {
  const raw = String(source ?? '');
  const normalized = normalizeGuidance(raw);
  const checks = [
    ['must provide a reusable campaign goal template', /campaign goal template/i],
    [
      'must require the dependency authority before prompt selection',
      /before selecting[\s\S]{0,180}fully read[\s\S]{0,180}implementation_prompt_dependencies\.md/i,
    ],
    ['must require the deterministic dispatcher', /run[\s\S]{0,120}deterministic dispatcher/i],
    [
      'must prohibit new lanes at a stopping point',
      /(?:reach a stopping point|stopping)[\s\S]{0,260}open no new lanes/i,
    ],
    [
      'must require selective reapplication and prohibit wholesale stale merges',
      /selectively reapply[\s\S]{0,360}never wholesale-merge[\s\S]{0,160}stale branch/i,
    ],
    [
      'must require independent exact-HEAD review before one final full coordination validation',
      /independent exact-head review[\s\S]{0,260}(?:precede|before)[\s\S]{0,220}one final full coordination validation/i,
    ],
    ['must require Luna xhigh delegation', /gpt-5\.6-luna[\s\S]{0,100}xhigh/i],
    [
      'must require Terra xhigh after the observed Luna abandonment failure',
      /(?:dirty worktree[\s\S]{0,180}no relevant (?:running )?process[\s\S]{0,180}no commit or result|repeats no-progress)[\s\S]{0,440}switch that task to `?gpt-5\.6-terra`? at `?xhigh`?/i,
    ],
    ['must prohibit Sol child dispatch', /never dispatch a sol child/i],
    [
      'must require immediate idle or terminal reports with status, paths, commands, and blockers',
      /immediately report[\s\S]{0,220}(?:exact )?status[\s\S]{0,180}changed paths[\s\S]{0,180}commands[\s\S]{0,180}blocker/i,
    ],
    [
      'must require exact leaf-file ownership and reject broad docs claims',
      /exact exclusive leaf-file claims[\s\S]{0,260}(?:no broad `?docs\/\*`?|another owner)/i,
    ],
    [
      'must assign explicit implementation, review, and release ownership',
      /implementation agent owns edits, focused tests, and commit[\s\S]{0,300}independent reviewer[\s\S]{0,240}release agent owns/i,
    ],
    [
      'must prohibit implicit ownership handoffs',
      /do not leave these handoffs implicit/i,
    ],
    [
      'must preflight changelog, version, progress, and release-fragment ownership',
      /preflight[\s\S]{0,180}changelog[\s\S]{0,180}version[\s\S]{0,180}progress[\s\S]{0,180}release-fragment/i,
    ],
    [
      'must keep local, rendered, deployed, and capacity proof distinct',
      /local[\s\S]{0,180}rendered[\s\S]{0,180}deploy(?:ed|ment)[\s\S]{0,180}capacity proof/i,
    ],
  ];
  for (const [message, pattern] of checks) {
    if (!pattern.test(normalized)) errors.push(`campaign playbook: ${message}`);
  }

  const templateMatch = raw.match(/## Campaign goal template[\s\S]*?```text\n([\s\S]*?)\n```/i);
  if (!templateMatch) {
    errors.push('campaign playbook: goal template must be a copyable text block');
    return;
  }
  const template = templateMatch[1];
  if (/\b[0-9a-f]{7,40}\b/i.test(template) || /\b\d+\/\d+\b/.test(template) || /\b\d+\.\d+\.\d+\b/.test(template)) {
    errors.push('campaign playbook: goal template must not hard-code a SHA, count, or version');
  }
  if (!/do not reuse a\s+reported sha,\s+version,\s+count,\s+or next prompt without live verification/i.test(template)) {
    errors.push('campaign playbook: goal template must require dynamic live state rather than hard-coded snapshots');
  }
}

export function validatePromptDependencyGuidance({ sources, errors }) {
  for (const [filePath, selectionPattern] of PROMPT_DEPENDENCY_GUIDANCE) {
    const source = sources.get(filePath);
    if (typeof source !== 'string') {
      errors.push(`${filePath}: required prompt dependency guidance file is missing`);
      continue;
    }
    const normalized = normalizeGuidance(source);
    if (!normalized.includes('implementation_prompt_dependencies.md')) {
      errors.push(`${filePath}: must link IMPLEMENTATION_PROMPT_DEPENDENCIES.md`);
    }
    if (!selectionPattern.test(normalized)) {
      errors.push(`${filePath}: must require reading prompt dependencies before selecting a prompt`);
    }
    if (!hasPromptDependencyReadRequirement(normalized)) {
      errors.push(`${filePath}: must explicitly require reading prompt dependencies before prompt work`);
    }
    if (!hasDispatcherRequirement(normalized)) {
      errors.push(`${filePath}: must require running the prompt dependency dispatcher`);
    }
    if (!hasCurrentStateReconciliation(normalized)) {
      errors.push(`${filePath}: must require reconciling current main and coordination`);
    }
    if (!hasMainMovementReread(normalized)) {
      errors.push(`${filePath}: must require re-reading after rebase or material current-main movement`);
    }
    if (!hasCompletionBlock(normalized)) {
      errors.push(`${filePath}: must block completion/merge while hard prerequisites are unmet`);
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
    ['docs/IMPLEMENTATION_MILESTONES.md', readFileSync(resolve(cwd, 'docs/IMPLEMENTATION_MILESTONES.md'), 'utf8')],
    ['docs/IMPLEMENTATION_PROGRESS.md', progressSource],
    [CAMPAIGN_PLAYBOOK_PATH, readFileSync(resolve(cwd, CAMPAIGN_PLAYBOOK_PATH), 'utf8')],
  ]);
  validatePromptDependencyGuidance({ sources: guidanceSources, errors });
  validatePromptDependencyConcurrency({ sources: guidanceSources, errors });
  validateCampaignPlaybook({ source: guidanceSources.get(CAMPAIGN_PLAYBOOK_PATH), errors });
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
