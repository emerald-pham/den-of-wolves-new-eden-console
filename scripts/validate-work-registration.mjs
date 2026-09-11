#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const PROMPT_PATTERN = /^\d{3}[a-z]*$/i;
const READY_STATUSES = new Set(['in-progress', 'partial', 'done']);
const REQUIRED_NEW_PROMPT_FILES = Object.freeze([
  'docs/IMPLEMENTATION_PLAN.md',
  'docs/IMPLEMENTATION_PROGRESS.md',
  'docs/IMPLEMENTATION_PROMPT_DEPENDENCIES.md',
]);

export function normalizeImplementationPrompt(value) {
  if (typeof value === 'number' && Number.isInteger(value)) {
    value = String(value).padStart(3, '0');
  }
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase();
  if (PROMPT_PATTERN.test(normalized)) return normalized;
  const legacy = normalized.match(/^(\d{1,3})([a-z]*)$/i);
  return legacy ? `${legacy[1].padStart(3, '0')}${legacy[2].toLowerCase()}` : null;
}

export function isDocumentationPath(filePath) {
  const name = basename(String(filePath ?? '').trim());
  return /\.md$/i.test(name) || name === 'README' || /^README\./i.test(name);
}

function uniqueMap(records, label, errors) {
  const output = new Map();
  for (const record of records) {
    if (output.has(record.prompt)) {
      errors.push(`${label} repeats Prompt ${record.prompt}`);
      continue;
    }
    output.set(record.prompt, record);
  }
  return output;
}

function parsePlan(source, errors) {
  const text = String(source ?? '');
  const definitions = uniqueMap(
    [...text.matchAll(/^-\s+\*\*Prompt\s+(\d{3}[a-z]*)\s+—\s+\[([^\]]+)\]([^\n]*)/gim)]
      .map((match) => ({
        prompt: normalizeImplementationPrompt(match[1]),
        tag: match[2].trim().toUpperCase(),
        definition: match[0],
      }))
      .filter((record) => record.prompt),
    'canonical plan',
    errors,
  );
  const checklist = uniqueMap(
    [...text.matchAll(/^-\s+\[([ xX])\]\s+Prompt\s+(\d{3}[a-z]*)\s*$/gim)]
      .map((match) => ({
        prompt: normalizeImplementationPrompt(match[2]),
        checked: match[1].toLowerCase() === 'x',
      }))
      .filter((record) => record.prompt),
    'canonical plan checklist',
    errors,
  );
  return { definitions, checklist };
}

function parseProgress(source, errors) {
  return uniqueMap(
    [...String(source ?? '').matchAll(
      /^\|\s*(\d{3}[a-z]*)\s*\|\s*(done|partial|missing|blocked|in-progress)\s*\|/gim,
    )].map((match) => ({
      prompt: normalizeImplementationPrompt(match[1]),
      status: match[2].toLowerCase(),
    })).filter((record) => record.prompt),
    'progress ledger',
    errors,
  );
}

function parseDependencyIndex(source, errors) {
  const rows = [];
  const evidence = new Map();
  for (const line of String(source ?? '').split('\n')) {
    if (/^\|\s*\d{3}[a-z]*\s*\|/i.test(line)) {
      const cells = line.slice(1, line.endsWith('|') ? -1 : undefined)
        .split('|')
        .map((cell) => cell.trim());
      if (cells.length !== 14) {
        errors.push(`dependency index row must have 14 columns: ${line}`);
        continue;
      }
      rows.push({
        prompt: normalizeImplementationPrompt(cells[0]),
        tag: cells[1].toUpperCase(),
        progress: cells[2].toLowerCase(),
        hardPromptPrerequisites: cells[3],
        hardMilestone: cells[4],
        hardContract: cells[5],
        decisionOwner: cells[6],
        closureEvidenceGates: cells[7],
        sequenceRules: cells[8],
        releaseBoundaries: cells[9],
        relatedConsumes: cells[10],
        evidenceIds: cells[11],
        line,
      });
      continue;
    }
    const match = line.match(/^\|\s*(E-[A-Z0-9-]+)\s*\|\s*([^|]+)\|\s*([^|]+)\|\s*([^|]+)\|\s*(.+)\|$/i);
    if (match) {
      const evidenceId = match[1].toUpperCase();
      if (evidence.has(evidenceId)) {
        errors.push(`dependency evidence repeats ${evidenceId}`);
        continue;
      }
      evidence.set(evidenceId, {
        type: match[2].trim(),
        direction: match[3].trim(),
        source: match[4].trim(),
        language: match[5].trim(),
      });
    }
  }
  return {
    rows: uniqueMap(rows.filter((row) => row.prompt), 'dependency index', errors),
    evidence,
  };
}

function expandPromptTargets(value, knownPrompts, errors, label) {
  if (value === 'none') return [];
  const output = [];
  for (const rawToken of value.split(';')) {
    const token = rawToken.trim().toLowerCase();
    const range = token.match(/^(\d{3})-(\d{3})$/);
    if (range) {
      const start = Number(range[1]);
      const end = Number(range[2]);
      if (start > end) {
        errors.push(`${label} contains reverse range ${token}`);
        continue;
      }
      for (let number = start; number <= end; number += 1) {
        const prompt = String(number).padStart(3, '0');
        if (prompt === '071') continue;
        if (!knownPrompts.has(prompt)) errors.push(`${label} contains unknown Prompt ${prompt}`);
        else output.push(prompt);
      }
      continue;
    }
    const prompt = normalizeImplementationPrompt(token);
    if (!prompt || !knownPrompts.has(prompt)) {
      errors.push(`${label} contains unknown Prompt ${token || '(empty)'}`);
    } else {
      output.push(prompt);
    }
  }
  return output;
}

function promptTrailers(message) {
  return String(message ?? '').split(/\r?\n/).flatMap((line) => {
    const match = line.match(/^Implementation-Prompt:\s*(\S+)\s*$/i);
    return match ? [match[1]] : [];
  });
}

function sourceContainsPrompt(source, prompt) {
  if (typeof source !== 'string') return false;
  return new RegExp(`^-\\s+\\*\\*Prompt\\s+${prompt}\\s+—`, 'im').test(source);
}

function validateCatalogIntegrity({ plan, progress, dependency, errors }) {
  const promptIds = new Set([
    ...plan.definitions.keys(),
    ...plan.checklist.keys(),
    ...progress.keys(),
    ...dependency.rows.keys(),
  ]);
  const graph = new Map();
  for (const prompt of promptIds) {
    if (!plan.definitions.has(prompt)) errors.push(`canonical plan is missing Prompt ${prompt}`);
    if (!plan.checklist.has(prompt)) errors.push(`canonical plan checklist is missing Prompt ${prompt}`);
    if (!progress.has(prompt)) errors.push(`progress ledger is missing Prompt ${prompt}`);
    if (!dependency.rows.has(prompt)) errors.push(`dependency index is missing Prompt ${prompt}`);
  }
  for (const [prompt, row] of dependency.rows) {
    const planRecord = plan.definitions.get(prompt);
    const progressRecord = progress.get(prompt);
    const checklistRecord = plan.checklist.get(prompt);
    if (planRecord && planRecord.tag !== row.tag) {
      errors.push(`Prompt ${prompt} plan tag ${planRecord.tag} does not match dependency index ${row.tag}`);
    }
    if (progressRecord && progressRecord.status !== row.progress) {
      errors.push(`Prompt ${prompt} progress ${progressRecord.status} does not match dependency index ${row.progress}`);
    }
    if (progressRecord && checklistRecord &&
      checklistRecord.checked !== (progressRecord.status === 'done')) {
      errors.push(`Prompt ${prompt} checklist state does not match progress status ${progressRecord.status}`);
    }
    const prerequisites = expandPromptTargets(
      row.hardPromptPrerequisites,
      plan.definitions,
      errors,
      `Prompt ${prompt} hard prerequisites`,
    );
    graph.set(prompt, prerequisites);
    if (progressRecord?.status === 'done') {
      for (const prerequisite of prerequisites) {
        const status = progress.get(prerequisite)?.status ?? 'unknown';
        if (status !== 'done') {
          errors.push(`Prompt ${prompt} is done while hard prerequisite ${prerequisite} is ${status}`);
        }
      }
    }
    const requiresEvidence = [
      row.hardPromptPrerequisites,
      row.hardMilestone,
      row.hardContract,
      row.decisionOwner,
      row.closureEvidenceGates,
      row.sequenceRules,
      row.releaseBoundaries,
      row.relatedConsumes,
    ].some((value) => value !== 'none');
    const evidenceIds = row.evidenceIds === 'none'
      ? []
      : row.evidenceIds.split(';').map((value) => value.trim().toUpperCase()).filter(Boolean);
    if (requiresEvidence && evidenceIds.length === 0) {
      errors.push(`Prompt ${prompt} records dependency context without evidence IDs`);
    }
    for (const evidenceId of evidenceIds) {
      if (!dependency.evidence.has(evidenceId)) {
        errors.push(`Prompt ${prompt} references unknown dependency evidence ${evidenceId}`);
      }
    }
  }

  const visiting = new Set();
  const visited = new Set();
  const visit = (prompt, path = []) => {
    if (visiting.has(prompt)) {
      errors.push(`hard dependency cycle detected: ${[...path, prompt].join(' -> ')}`);
      return;
    }
    if (visited.has(prompt)) return;
    visiting.add(prompt);
    for (const prerequisite of graph.get(prompt) ?? []) visit(prerequisite, [...path, prompt]);
    visiting.delete(prompt);
    visited.add(prompt);
  };
  for (const prompt of graph.keys()) visit(prompt);
}

/**
 * Validate the durable mapping from one candidate commit to the canonical
 * implementation plan and dependency authority. Documentation-only commits
 * are the sole exemption.
 */
export function validateWorkRegistration({
  changedFiles = [],
  message = '',
  planSource = '',
  progressSource = '',
  dependencySource = '',
  parentPlanSource,
  parentProgressSource,
  parentDependencySource,
  coordinationPrompt = null,
} = {}) {
  const files = [...new Set(
    (Array.isArray(changedFiles) ? changedFiles : [])
      .map((filePath) => String(filePath).trim())
      .filter(Boolean),
  )];
  const documentationOnly = files.length > 0 && files.every(isDocumentationPath);
  if (documentationOnly) {
    return { documentationOnly: true, prompt: null, newPrompt: false, errors: [] };
  }

  const errors = [];
  const trailers = promptTrailers(message);
  if (trailers.length !== 1) {
    errors.push(
      `non-documentation commits require exactly one Implementation-Prompt trailer; found ${trailers.length}`,
    );
  }
  const prompt = trailers.length === 1 ? normalizeImplementationPrompt(trailers[0]) : null;
  if (trailers.length === 1 && !prompt) {
    errors.push(`Implementation-Prompt trailer has invalid ID ${trailers[0]}`);
  }
  const lastNonblankLine = String(message ?? '').split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .at(-1) ?? '';
  if (trailers.length === 1 && !/^Implementation-Prompt:\s*\S+\s*$/i.test(lastNonblankLine)) {
    errors.push('Implementation-Prompt trailer must be the final nonblank line of the commit message');
  }

  const plan = parsePlan(planSource, errors);
  const progress = parseProgress(progressSource, errors);
  const dependency = parseDependencyIndex(dependencySource, errors);
  validateCatalogIntegrity({ plan, progress, dependency, errors });
  if (!prompt) {
    return { documentationOnly: false, prompt: null, newPrompt: false, errors };
  }

  const planRecord = plan.definitions.get(prompt);
  const checklistRecord = plan.checklist.get(prompt);
  const progressRecord = progress.get(prompt);
  const dependencyRecord = dependency.rows.get(prompt);
  if (!planRecord) errors.push(`Prompt ${prompt} is missing from the canonical plan`);
  if (!checklistRecord) errors.push(`Prompt ${prompt} is missing from the canonical plan checklist`);
  if (!progressRecord) errors.push(`Prompt ${prompt} is missing from the progress ledger`);
  if (!dependencyRecord) errors.push(`Prompt ${prompt} is missing from the dependency index`);

  const normalizedCoordinationPrompt = coordinationPrompt === null || coordinationPrompt === undefined
    ? null
    : normalizeImplementationPrompt(coordinationPrompt);
  if (normalizedCoordinationPrompt && prompt !== normalizedCoordinationPrompt) {
    errors.push(
      `commit trailer Prompt ${prompt} does not match coordination Prompt ${normalizedCoordinationPrompt}`,
    );
  }

  if (planRecord && dependencyRecord && planRecord.tag !== dependencyRecord.tag) {
    errors.push(
      `Prompt ${prompt} plan tag ${planRecord.tag} does not match dependency index ${dependencyRecord.tag}`,
    );
  }
  if (progressRecord && dependencyRecord && progressRecord.status !== dependencyRecord.progress) {
    errors.push(
      `Prompt ${prompt} progress ${progressRecord.status} does not match dependency index ${dependencyRecord.progress}`,
    );
  }
  if (progressRecord && !READY_STATUSES.has(progressRecord.status)) {
    errors.push(
      `commit-bound Prompt ${prompt} must be in-progress, partial, or done, but the progress ledger is ${progressRecord.status}`,
    );
  }
  if (progressRecord && checklistRecord && checklistRecord.checked !== (progressRecord.status === 'done')) {
    errors.push(
      `Prompt ${prompt} checklist state does not match progress status ${progressRecord.status}`,
    );
  }

  if (dependencyRecord) {
    const prerequisites = expandPromptTargets(
      dependencyRecord.hardPromptPrerequisites,
      plan.definitions,
      errors,
      `Prompt ${prompt} hard prerequisites`,
    );
    for (const prerequisite of prerequisites) {
      const status = progress.get(prerequisite)?.status ?? 'unknown';
      if (status !== 'done') {
        errors.push(`Prompt ${prompt} hard prerequisite ${prerequisite} is ${status}`);
      }
    }
    for (const [field, value] of [
      ['hard_milestone', dependencyRecord.hardMilestone],
      ['hard_contract', dependencyRecord.hardContract],
      ['decision_owner', dependencyRecord.decisionOwner],
    ]) {
      if (value !== 'none') {
        errors.push(`Prompt ${prompt} is not mechanically ready: ${field}=${value}`);
      }
    }
  }

  const hasParentSources = [parentPlanSource, parentProgressSource, parentDependencySource]
    .some((source) => typeof source === 'string');
  const newPrompt = hasParentSources && !sourceContainsPrompt(parentPlanSource, prompt);
  if (newPrompt) {
    for (const requiredPath of REQUIRED_NEW_PROMPT_FILES) {
      if (!files.includes(requiredPath)) {
        errors.push(`new Prompt ${prompt} must add ${requiredPath} in the same commit`);
      }
    }
    if (!/\bDependencies:\s*\S+/i.test(planRecord?.definition ?? '')) {
      errors.push(`new Prompt ${prompt} must include an explicit Dependencies: assessment in its plan definition`);
    }
    const evidenceIds = dependencyRecord?.evidenceIds === 'none'
      ? []
      : dependencyRecord?.evidenceIds.split(';').map((value) => value.trim().toUpperCase()).filter(Boolean) ?? [];
    const sourceBacked = evidenceIds.length > 0 && evidenceIds.every((id) => {
      const record = dependency.evidence.get(id);
      return record && new RegExp(
        `^IMPLEMENTATION_PLAN\\.md\\s+-\\s+Prompt\\s+${prompt}\\b`,
        'i',
      ).test(record.source) &&
        new RegExp(`^${prompt}\\s*->`, 'i').test(record.direction) &&
        /\bDependencies:\s*\S+/i.test(record.language);
    });
    if (!sourceBacked) {
      errors.push(`new Prompt ${prompt} must carry source-backed dependency evidence in the dependency index`);
    }
    if (typeof parentProgressSource === 'string' && progress.get(prompt) &&
      parseProgress(parentProgressSource, []).has(prompt)) {
      errors.push(`new Prompt ${prompt} already existed in the parent progress ledger without a plan definition`);
    }
    if (typeof parentDependencySource === 'string' && dependency.rows.has(prompt) &&
      parseDependencyIndex(parentDependencySource, []).rows.has(prompt)) {
      errors.push(`new Prompt ${prompt} already existed in the parent dependency index without a plan definition`);
    }
  }

  return { documentationOnly: false, prompt, newPrompt, errors };
}

function git(cwd, args, { allowFailure = false } = {}) {
  try {
    return execFileSync('git', args, {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trimEnd();
  } catch (error) {
    if (allowFailure) return '';
    throw error;
  }
}

function sourceAt(cwd, ref, path) {
  return ref ? git(cwd, ['show', `${ref}:${path}`], { allowFailure: true }) : '';
}

function sourcesAt(cwd, ref) {
  return {
    planSource: sourceAt(cwd, ref, 'docs/IMPLEMENTATION_PLAN.md'),
    progressSource: sourceAt(cwd, ref, 'docs/IMPLEMENTATION_PROGRESS.md'),
    dependencySource: sourceAt(cwd, ref, 'docs/IMPLEMENTATION_PROMPT_DEPENDENCIES.md'),
  };
}

function firstParent(cwd, commit) {
  const parents = git(cwd, ['rev-list', '--parents', '-n', '1', commit]).split(/\s+/).slice(1);
  return parents[0] ?? null;
}

function promptWasRegisteredOnBranch(cwd, baseline, head, prompt) {
  const commits = git(cwd, ['rev-list', '--reverse', '--topo-order', `${baseline}..${head}`])
    .split('\n')
    .filter(Boolean);
  return commits.some((commit) => {
    const result = validateCommitRegistration({ cwd, commit });
    return result.prompt === prompt && result.newPrompt && result.errors.length === 0;
  });
}

export function validateCommitRegistration({ cwd = process.cwd(), commit = 'HEAD', coordinationPrompt = null } = {}) {
  const resolvedCommit = git(cwd, ['rev-parse', '--verify', `${commit}^{commit}`]);
  const parent = firstParent(cwd, resolvedCommit);
  const changedFiles = parent
    ? git(cwd, ['diff', '--name-only', '--diff-filter=ACMRTD', parent, resolvedCommit]).split('\n').filter(Boolean)
    : git(cwd, ['diff-tree', '--root', '--no-commit-id', '--name-only', '-r', resolvedCommit]).split('\n').filter(Boolean);
  return {
    commit: resolvedCommit,
    ...validateWorkRegistration({
      changedFiles,
      message: git(cwd, ['show', '-s', '--format=%B', resolvedCommit]),
      ...sourcesAt(cwd, resolvedCommit),
      parentPlanSource: sourceAt(cwd, parent, 'docs/IMPLEMENTATION_PLAN.md'),
      parentProgressSource: sourceAt(cwd, parent, 'docs/IMPLEMENTATION_PROGRESS.md'),
      parentDependencySource: sourceAt(cwd, parent, 'docs/IMPLEMENTATION_PROMPT_DEPENDENCIES.md'),
      coordinationPrompt,
    }),
  };
}

export function validateCommitRange({ cwd = process.cwd(), range, coordinationPrompt = null } = {}) {
  if (!range) throw new Error('work registration range validation requires --range <base>..<head>');
  const commits = git(cwd, ['rev-list', '--reverse', '--topo-order', range]).split('\n').filter(Boolean);
  const results = commits.map((commit) => {
    const parents = git(cwd, ['rev-list', '--parents', '-n', '1', commit]).split(/\s+/).slice(1);
    if (parents.length < 2) {
      return validateCommitRegistration({ cwd, commit });
    }
    const changedFiles = git(cwd, [
      'show', '--remerge-diff', '--format=', '--name-only', '--diff-filter=ACMRTD', commit,
    ]).split('\n').filter(Boolean);
    if (changedFiles.length === 0) {
      return {
        commit,
        documentationOnly: true,
        prompt: null,
        newPrompt: false,
        errors: [],
      };
    }
    return {
      commit,
      ...validateWorkRegistration({
        changedFiles,
        message: git(cwd, ['show', '-s', '--format=%B', commit]),
        ...sourcesAt(cwd, commit),
        parentPlanSource: sourceAt(cwd, parents[0], 'docs/IMPLEMENTATION_PLAN.md'),
        parentProgressSource: sourceAt(cwd, parents[0], 'docs/IMPLEMENTATION_PROGRESS.md'),
        parentDependencySource: sourceAt(cwd, parents[0], 'docs/IMPLEMENTATION_PROMPT_DEPENDENCIES.md'),
      }),
    };
  });
  const errors = results.flatMap((result) =>
    result.errors.map((error) => `${result.commit.slice(0, 12)}: ${error}`));
  const base = range.match(/^(.+?)\.\./)?.[1];
  const basePlanSource = base
    ? sourceAt(cwd, git(cwd, ['rev-parse', '--verify', `${base}^{commit}`]), 'docs/IMPLEMENTATION_PLAN.md')
    : '';
  for (const prompt of new Set(results.map((result) => result.prompt).filter(Boolean))) {
    if (!sourceContainsPrompt(basePlanSource, prompt) &&
      !results.some((result) => result.prompt === prompt && result.newPrompt)) {
      errors.push(
        `Prompt ${prompt} was absent at the range base and must be registered in the same ` +
        'non-documentation commit that first uses it',
      );
    }
  }
  if (coordinationPrompt !== null && coordinationPrompt !== undefined) {
    const normalizedCoordinationPrompt = normalizeImplementationPrompt(coordinationPrompt);
    if (!normalizedCoordinationPrompt) {
      errors.push(`coordination prompt has invalid ID ${String(coordinationPrompt)}`);
    } else if (!results.some((result) => result.prompt === normalizedCoordinationPrompt)) {
      errors.push(
        `commit range does not contain a non-documentation commit for coordination Prompt ` +
          normalizedCoordinationPrompt,
      );
    }
  }
  return {
    commits,
    results,
    errors,
  };
}

export function validateStagedRegistration({
  cwd = process.cwd(),
  messageFile,
  coordinationPrompt = null,
} = {}) {
  if (!messageFile) throw new Error('staged work registration validation requires --message-file <path>');
  const changedFiles = git(cwd, ['diff', '--cached', '--name-only', '--diff-filter=ACMRTD'])
    .split('\n')
    .filter(Boolean);
  const stagedSource = (path) => git(cwd, ['show', `:${path}`], { allowFailure: true });
  const result = validateWorkRegistration({
    changedFiles,
    message: readFileSync(messageFile, 'utf8'),
    planSource: stagedSource('docs/IMPLEMENTATION_PLAN.md'),
    progressSource: stagedSource('docs/IMPLEMENTATION_PROGRESS.md'),
    dependencySource: stagedSource('docs/IMPLEMENTATION_PROMPT_DEPENDENCIES.md'),
    parentPlanSource: sourceAt(cwd, 'HEAD', 'docs/IMPLEMENTATION_PLAN.md'),
    parentProgressSource: sourceAt(cwd, 'HEAD', 'docs/IMPLEMENTATION_PROGRESS.md'),
    parentDependencySource: sourceAt(cwd, 'HEAD', 'docs/IMPLEMENTATION_PROMPT_DEPENDENCIES.md'),
    coordinationPrompt,
  });
  if (!result.documentationOnly && result.prompt && !result.newPrompt) {
    const baseline = git(cwd, ['merge-base', 'main', 'HEAD'], { allowFailure: true }) ||
      git(cwd, ['merge-base', 'origin/main', 'HEAD'], { allowFailure: true });
    if (!baseline) {
      result.errors.push(
        'staged work registration could not resolve a trusted main branch baseline',
      );
    } else if (!sourceContainsPrompt(
      sourceAt(cwd, baseline, 'docs/IMPLEMENTATION_PLAN.md'),
      result.prompt,
    ) && !promptWasRegisteredOnBranch(cwd, baseline, 'HEAD', result.prompt)) {
      result.errors.push(
        `Prompt ${result.prompt} was absent at the branch baseline and must be registered ` +
        'in the same non-documentation commit that first uses it',
      );
    }
  }
  return result;
}

function parseOptions(args) {
  const options = {};
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (!argument.startsWith('--')) throw new Error(`Unexpected argument ${argument}`);
    const value = args[index + 1];
    if (!value || value.startsWith('--')) throw new Error(`Missing value for ${argument}`);
    options[argument.slice(2)] = value;
    index += 1;
  }
  return options;
}

function printResult(result) {
  if (result.errors.length > 0) {
    throw new Error(`Implementation work registration failed:\n- ${result.errors.join('\n- ')}`);
  }
  if (result.documentationOnly) {
    console.log('Implementation work registration: documentation-only commit exempt.');
  } else if (Array.isArray(result.commits)) {
    console.log(`Implementation work registration: ${result.commits.length} commit(s) verified.`);
  } else {
    console.log(`Implementation work registration: Prompt ${result.prompt} verified.`);
  }
}

function main() {
  const options = parseOptions(process.argv.slice(2));
  const cwd = resolve(options.cwd ?? process.cwd());
  const coordinationPrompt = options['coordination-prompt'] ?? null;
  if (options.staged === 'true') {
    printResult(validateStagedRegistration({ cwd, messageFile: options['message-file'], coordinationPrompt }));
  } else if (options.range) {
    printResult(validateCommitRange({ cwd, range: options.range, coordinationPrompt }));
  } else {
    printResult(validateCommitRegistration({ cwd, commit: options.commit ?? 'HEAD', coordinationPrompt }));
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
