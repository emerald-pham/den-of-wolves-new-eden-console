#!/usr/bin/env node

import { existsSync, readFileSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const CATALOG_PATH = 'docs/implementation-prompts.json';
const CORE_SURFACES = Object.freeze([
  'AGENTS.md',
  'CLAUDE.md',
  'README.md',
  'docs/README.md',
  'docs/WORKTREE_COORDINATION.md',
  'docs/AGENT_CAMPAIGN_PLAYBOOK.md',
]);

function isDocumentationFile(filePath) {
  const fileName = basename(filePath);
  return /\.mdx?$/i.test(fileName) || fileName === 'README' || /^README\./i.test(fileName);
}

function normalizeGuidance(source) {
  return String(source).replace(/[`*]/g, '').replace(/\s+/g, ' ').toLowerCase();
}

function sourceFor(sources, filePath, errors) {
  const source = sources.get(filePath);
  if (typeof source !== 'string') {
    errors.push(`${filePath}: required guidance file is missing`);
    return '';
  }
  return source;
}

function requireText(filePath, source, pattern, message, errors) {
  if (!pattern.test(normalizeGuidance(source))) errors.push(`${filePath}: ${message}`);
}

const OBSOLETE_UNIVERSAL_GATES = Object.freeze([
  [
    /every repository change except documentation-only[^.]{0,180}(?:must|required|is required) (?:be )?(?:dependency|prompt)/i,
    'must not require universal prompt registration for every repository change',
  ],
  [
    /every non-documentation commit[^.]{0,180}(?:implementation-prompt|prompt trailer)/i,
    'must not require an Implementation-Prompt trailer on every non-documentation commit',
  ],
  [
    /(?:must|required|requires|creates?) [^.]{0,100}(?:immutable|deterministic) (?:original )?(?:goal|session-goal) (?:file|artifact|representation)/i,
    'must not require immutable goal artifacts',
  ],
  [
    /(?:finish|cleanup|gate)[^.]{0,180}(?:must|required|fails?)[^.]{0,120}(?:goal|receipt) (?:digest|nonce)/i,
    'must not require nonce/digest cleanup gates',
  ],
  [
    /(?:mandatory|required|must) [^.]{0,100}(?:luna\s*(?:→|->|to)\s*terra\s*(?:→|->|to)\s*luna|luna\/terra loop)/i,
    'must not require a Luna/Terra/Luna handoff cycle',
  ],
  [
    /(?:keep|keeps|retain|retains|must|required|requires|mandatory)[^.]{0,100}48-hour retention/i,
    'must not require 48-hour worktree retention',
  ],
]);

/** Validate the compact risk-based model policy on a guidance surface. */
export function validateAgentModelEscalation({ sources, errors }) {
  for (const filePath of ['CLAUDE.md', 'docs/AGENT_CAMPAIGN_PLAYBOOK.md']) {
    const source = sourceFor(sources, filePath, errors);
    requireText(filePath, source, /luna[\s\S]{0,120}(?:max|xhigh)[\s\S]{0,140}economical|economical[\s\S]{0,120}luna/i,
      'must name Luna max or xhigh as the economical default', errors);
    requireText(filePath, source, /terra[\s\S]{0,220}independent[\s\S]{0,220}review[\s\S]{0,260}(?:risk|session|callable|rules|deploy|auth)/i,
      'must reserve Terra review for risky shared/session/callable/rules or deploy/auth work', errors);
    requireText(filePath, source, /escalat[\s\S]{0,180}(?:actual|lack of progress|material failed|failed attempt)/i,
      'must escalate only after actual lack of progress or a material failure', errors);
    requireText(filePath, source, /(?:no|not|do not)[\s\S]{0,100}(?:compulsory|mandatory)[\s\S]{0,100}(?:luna|terra)|(?:no|not|do not)[\s\S]{0,120}luna[\s\S]{0,80}terra[\s\S]{0,80}luna/i,
      'must reject a compulsory Luna/Terra/Luna cycle', errors);
    requireText(filePath, source, /sol[\s\S]{0,160}(?:not|never)[\s\S]{0,100}default[\s\S]{0,100}(?:child|agent)|sol[\s\S]{0,160}permitted escalation/i,
      'must keep Sol out of the default child path', errors);
  }
}

/** Validate the useful, non-mutating prompt/catalog workflow. */
export function validatePromptDependencyGuidance({ sources, errors }) {
  for (const filePath of CORE_SURFACES) {
    const source = sourceFor(sources, filePath, errors);
    if (!source) continue;
    const normalized = normalizeGuidance(source);
    if (filePath !== 'docs/README.md' && !normalized.includes('implementation-prompts.json')) {
      errors.push(`${filePath}: must link the JSON prompt catalog`);
    }
    if (!/generated[\s\S]{0,180}(?:markdown|view|implementation)/i.test(normalized) &&
      !/catalog[\s\S]{0,180}(?:generate|view)/i.test(normalized)) {
      errors.push(`${filePath}: must identify generated implementation views`);
    }
    if (filePath !== 'docs/README.md' && !normalized.includes('generate-prompt-views.mjs')) {
      errors.push(`${filePath}: must document the prompt-view generator command`);
    }
    if (!/(?:coordination:dependencies[\s\S]{0,300}(?:read-only|readonly|no local|no nonce|no receipt)|(?:read-only|readonly|no local|no nonce|no receipt)[\s\S]{0,300}coordination:dependencies)/i.test(normalized)) {
      errors.push(`${filePath}: must describe dependency checks as read-only without local receipts`);
    }
    if (!/next[\s\S]{0,160}(?:advisory|hint|not a serial|not serial)/i.test(normalized)) {
      errors.push(`${filePath}: must make NEXT an advisory ready-work hint`);
    }
  }
}

/** Validate lightweight coordination, ownership, parking, and scope rules. */
export function validateSessionGoalGuidance({ sources, errors }) {
  for (const filePath of ['CLAUDE.md', 'docs/WORKTREE_COORDINATION.md', 'docs/AGENT_CAMPAIGN_PLAYBOOK.md']) {
    const source = sourceFor(sources, filePath, errors);
    requireText(filePath, source, /coordination[\s\S]{0,100}(?:optional|lightweight)/i,
      'must make coordination optional/lightweight', errors);
    requireText(filePath, source, /coordination:status[\s\S]{0,260}(?:owner|worktree|reservation|current)/i,
      'must use coordination status for current ownership or reservations', errors);
    requireText(filePath, source, /(?:never|do not)[\s\S]{0,140}(?:infer|assume)[\s\S]{0,140}(?:stale|safe)[\s\S]{0,100}age/i,
      'must not infer stale ownership from age alone', errors);
    requireText(filePath, source, /park(?:ed|ing)[\s\S]{0,220}(?:next action|clear|status)/i,
      'must document a simple parked status and next action', errors);
    requireText(filePath, source, /(?:no|do not)[\s\S]{0,100}(?:status\/heartbeat|heartbeat\/status)[\s\S]{0,100}polling/i,
      'must prohibit status/heartbeat polling loops', errors);
    requireText(filePath, source, /(?:optional )?goals?[\s\S]{0,180}(?:chat|session record)/i,
      'must keep goals in chat or the ordinary session record', errors);
    requireText(filePath, source, /(?:no|without)[\s\S]{0,120}(?:immutable goal|goal artifact|digest comparison)/i,
      'must remove immutable goal and digest gates', errors);
    if (/(?:there is|requires?|must use|creates?|records?)\s+(?:an?\s+)?immutable goal artifact|\b(?:requires?|must use|records?)\s+(?:a\s+)?digest comparison/i.test(normalizeGuidance(source))) {
      errors.push(`${filePath}: must not reintroduce immutable goal or digest gates`);
    }
  }
}

/** Validate the one-owner flow and the actual review/validation boundary. */
export function validateBlockedMergeAgentHandoff({ sources, errors }) {
  for (const filePath of ['CLAUDE.md', 'README.md', 'docs/WORKTREE_COORDINATION.md', 'docs/AGENT_CAMPAIGN_PLAYBOOK.md']) {
    const source = sourceFor(sources, filePath, errors);
    requireText(filePath, source, /one (?:task )?owner[\s\S]{0,180}(?:implementation|review)[\s\S]{0,180}(?:merge|deployment)/i,
      'must assign one owner through implementation, review, merge, and deployment', errors);
    requireText(filePath, source, /(?:focused|meaningful)[\s\S]{0,160}(?:test|check)/i,
      'must require focused meaningful checks', errors);
    requireText(filePath, source, /(?:reconcil\w*[\s\S]{0,220}(?:one|final)[\s\S]{0,120}(?:appropriate|relevant)[\s\S]{0,100}validation|(?:one|final)[\s\S]{0,160}(?:appropriate|relevant)[\s\S]{0,100}validation[\s\S]{0,180}(?:after|following)[\s\S]{0,80}reconcil)/i,
      'must require one final appropriate validation after reconciliation', errors);
    requireText(filePath, source, /rerun[\s\S]{0,220}(?:meaningful|failure|concern)/i,
      'must limit reruns to meaningful changes, failures, or unresolved concerns', errors);
    requireText(filePath, source, /(?:risk review|independent review)[\s\S]{0,260}(?:all findings|findings)[\s\S]{0,220}(?:bounded|repair)/i,
      'must collect all risk-review findings and repair them in a bounded follow-up', errors);
  }
}

/** Validate the concise campaign playbook without enforcing agent quotas. */
export function validateCampaignPlaybook({ source, errors } = {}) {
  const raw = String(source ?? '');
  const normalized = normalizeGuidance(raw);
  for (const [message, pattern] of [
    ['must provide a campaign playbook', /agent campaign playbook/i],
    ['must use one owner per task', /one owner per task/i],
    ['must state that sidecars are optional and there is no minimum-agent count', /sidecar[\s\S]{0,100}optional[\s\S]{0,140}no minimum-agent count/i],
    ['must freeze accepted scope and queue unrelated additions', /freeze[\s\S]{0,160}(?:scope|accepted)[\s\S]{0,180}queue unrelated/i],
    ['must collect all risk-review findings together', /all findings[\s\S]{0,180}(?:together|one pass)/i],
    ['must require commit before final validation', /commit[\s\S]{0,180}final[\s\S]{0,100}validation/i],
    ['must require merge, push, and deployment verification', /merge[\s\S]{0,180}push[\s\S]{0,220}(?:(?:deployment|workflow)[\s\S]{0,120}verif|verif[\s\S]{0,120}(?:deployment|workflow))/i],
  ]) {
    if (!pattern.test(normalized)) errors.push(`campaign playbook: ${message}`);
  }
}

/** Validate current prose for retired high-assurance gates. */
export function validateRiskBasedGuidance({ sources, errors }) {
  for (const [filePath, source] of sources) {
    for (const [pattern, message] of OBSOLETE_UNIVERSAL_GATES) {
      if (pattern.test(source)) errors.push(`${filePath}: ${message}`);
    }
  }
  const claude = sourceFor(sources, 'CLAUDE.md', errors);
  requireText('CLAUDE.md', claude,
    /process-gate[\s\S]{0,100}frozen[\s\S]{0,120}2026-09-18[\s\S]{0,260}two[\s\S]{0,80}production-impacting failures[\s\S]{0,180}broken existing tools/i,
    'must freeze new process gates through 2026-09-18 with the approved exception', errors);
  requireText('CLAUDE.md', claude,
    /first five prompts[\s\S]{0,140}existing task timestamps[\s\S]{0,120}no[\s\S]{0,60}telemetry/i,
    'must use existing timestamps to monitor the first five prompts without new telemetry', errors);
}

// Kept as a compatibility export for callers that used the former helper.
export function validatePromptDependencyConcurrency({ sources, errors }) {
  validatePromptDependencyGuidance({ sources, errors });
}

// Dependency facts now belong to the JSON catalog and its loader. This helper
// intentionally performs no Markdown-table parsing or receipt issuance.
export function validatePromptDependencyCompletion() {
  return [];
}

function changedFiles() {
  // Documentation validation is intentionally independent of a branch baseline.
  // The caller can pass an explicit file list when it wants a narrower review.
  return [];
}

function checkMarkdownFile(cwd, filePath, scripts, errors) {
  const absolutePath = resolve(cwd, filePath);
  if (!existsSync(absolutePath)) {
    errors.push(`${filePath}: file does not exist`);
    return;
  }
  const source = readFileSync(absolutePath, 'utf8');
  let fence;
  for (const line of source.split('\n')) {
    const match = line.match(/^\s*(`{3,}|~{3,})/);
    if (!match) continue;
    if (!fence) fence = match[1][0];
    else if (fence === match[1][0]) fence = undefined;
  }
  if (fence) errors.push(`${filePath}: unclosed ${fence} fenced code block`);

  for (const match of source.matchAll(/!?(?:\[[^\]]*\])\(([^)\n]+)\)/g)) {
    let target = match[1].trim();
    if (target.startsWith('<')) {
      const end = target.indexOf('>');
      target = end >= 0 ? target.slice(1, end) : target;
    } else target = target.split(/\s+/, 1)[0];
    if (!target || target.startsWith('#') || /^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(target)) continue;
    const pathPart = target.split(/[?#]/, 1)[0];
    let decoded;
    try { decoded = decodeURIComponent(pathPart); }
    catch { errors.push(`${filePath}: invalid URL encoding in link target ${target}`); continue; }
    if (!existsSync(resolve(dirname(absolutePath), decoded))) {
      errors.push(`${filePath}: link target does not exist: ${target}`);
    }
  }
  for (const match of source.matchAll(/\bnpm run ([a-z0-9:_-]+)/gi)) {
    if (!scripts[match[1]]) errors.push(`${filePath}: npm script does not exist: ${match[1]}`);
  }
}

/** Validate the deterministic, useful portion of the repository guidance. */
export function validateDocumentation({ cwd = process.cwd(), files } = {}) {
  const packagePath = resolve(cwd, 'package.json');
  const packageJson = JSON.parse(readFileSync(packagePath, 'utf8'));
  const candidateFiles = files ?? [...CORE_SURFACES, ...changedFiles()];
  const documentationFiles = [...new Set(candidateFiles.filter(isDocumentationFile))];
  const errors = [];
  for (const filePath of documentationFiles) checkMarkdownFile(cwd, filePath, packageJson.scripts ?? {}, errors);

  const sources = new Map();
  for (const filePath of CORE_SURFACES) {
    const absolutePath = resolve(cwd, filePath);
    if (existsSync(absolutePath)) sources.set(filePath, readFileSync(absolutePath, 'utf8'));
  }
  validatePromptDependencyGuidance({ sources, errors });
  validateAgentModelEscalation({ sources, errors });
  validateSessionGoalGuidance({ sources, errors });
  validateBlockedMergeAgentHandoff({ sources, errors });
  validateRiskBasedGuidance({ sources, errors });
  validateCampaignPlaybook({ source: sources.get('docs/AGENT_CAMPAIGN_PLAYBOOK.md'), errors });

  if (!existsSync(resolve(cwd, CATALOG_PATH))) {
    errors.push(`${CATALOG_PATH}: JSON prompt catalog is missing`);
  }
  return errors;
}

async function main() {
  const errors = validateDocumentation();
  if (errors.length > 0) throw new Error(`Documentation validation failed:\n- ${errors.join('\n- ')}`);
  console.log('Documentation validation passed.');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
