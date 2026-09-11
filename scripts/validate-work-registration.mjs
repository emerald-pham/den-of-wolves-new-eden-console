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
const CANONICAL_AUTHORITY_PATHS = new Set(REQUIRED_NEW_PROMPT_FILES);
const WOLF_SEQUENCE_EVIDENCE_ID = 'E-WOLF';

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
  const wolfAttackMatch = text.match(
    /Implement this block in dependency order:\s*([\s\S]*?)\.\s*Prompts 351\b/i,
  );
  return {
    definitions,
    checklist,
    wolfAttackSequenceSource: wolfAttackMatch?.[1] ?? null,
    wolfAttackOrder: [],
  };
}

function parseProgress(source, errors) {
  return uniqueMap(
    [...String(source ?? '').matchAll(
      /^\|\s*(\d{3}[a-z]*)\s*\|\s*(done|partial|missing|blocked|in-progress)\s*\|\s*(feature|non-feature)\s*\|\s*([^|]+)\|/gim,
    )].map((match) => ({
      prompt: normalizeImplementationPrompt(match[1]),
      status: match[2].toLowerCase(),
      changeClass: match[3].toLowerCase(),
      releaseMapping: match[4].split(',').map((value) => value.trim()).join(','),
      line: match[0],
    })).filter((record) => record.prompt),
    'progress ledger',
    errors,
  );
}

function parseDependencyIndex(source, errors) {
  const rows = [];
  const evidence = new Map();
  const sequences = new Map();
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
        milestoneHints: cells[12],
        title: cells[13],
        line,
      });
      continue;
    }
    const sequenceMatch = line.match(/^\|\s*([A-Z][A-Z0-9-]+)\s*\|\s*([^|]+)\|\s*([^|]+)\|\s*(E-[^|]+)\|$/);
    if (sequenceMatch) {
      const sequenceId = sequenceMatch[1];
      if (sequences.has(sequenceId)) errors.push(`dependency sequence repeats ${sequenceId}`);
      else sequences.set(sequenceId, {
        order: sequenceMatch[2].trim().replace(/\.$/, ''),
        hardDependency: sequenceMatch[3].trim(),
        evidenceIds: sequenceMatch[4].split(';').map((value) => value.trim().toUpperCase()).filter(Boolean),
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
    sequences,
  };
}

export function expandPromptTargets(value, knownPrompts, errors, label) {
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

function parseOrderedPromptSequence(value, knownPrompts, errors, label) {
  if (typeof value !== 'string' || !value.trim()) {
    errors.push(`${label} is missing`);
    return { groups: [], order: [] };
  }
  const groups = [];
  const seen = new Set();
  const sourceGroups = value.replaceAll('→', '->').split(/\s*->\s*/).filter(Boolean);
  for (const sourceGroup of sourceGroups) {
    const members = sourceGroup.split('/').map((token) => token.trim()).filter(Boolean);
    if (members.length === 0) errors.push(`${label} contains an empty group`);
    const group = [];
    for (const member of members) {
      const expanded = expandPromptTargets(
        member.replace(/[–—]/g, '-'),
        knownPrompts,
        errors,
        label,
      );
      for (const prompt of expanded) {
        if (seen.has(prompt)) errors.push(`${label} repeats Prompt ${prompt}`);
        else seen.add(prompt);
        group.push(prompt);
      }
    }
    if (group.length > 0) groups.push(group);
  }
  return { groups, order: groups.flat() };
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
  const expandedEdges = new Set();
  const evidenceTypes = new Map([...dependency.evidence].map(([id, record]) => [
    id,
    record.type.split(' / ').map((value) => value.trim()),
  ]));
  for (const [evidenceId, record] of dependency.evidence) {
    if (!record.source.includes(' - ')) {
      errors.push(`dependency evidence ${evidenceId} is missing a source anchor separator`);
    } else if (!['IMPLEMENTATION_PLAN.md', 'IMPLEMENTATION_MILESTONES.md', 'IMPLEMENTATION_PROGRESS.md']
      .includes(record.source.split(' - ')[0])) {
      errors.push(`dependency evidence ${evidenceId} does not name a source-of-truth path`);
    }
    if (!/->|↝/.test(record.direction)) {
      errors.push(`dependency evidence ${evidenceId} is missing an edge direction`);
    }
    if (!record.language.trim()) errors.push(`dependency evidence ${evidenceId} has empty source language`);
  }
  const wolfEvidence = dependency.evidence.get(WOLF_SEQUENCE_EVIDENCE_ID);
  const wolfSequence = dependency.sequences.get('WOLF-ATTACK');
  const wolfRows = new Set([...dependency.rows]
    .filter(([, row]) => row.sequenceRules.split(';').map((value) => value.trim()).includes('WOLF-ATTACK'))
    .map(([prompt]) => prompt));
  const hasWolfContract = plan.definitions.has('425') || plan.wolfAttackSequenceSource !== null ||
    Boolean(wolfEvidence) || Boolean(wolfSequence) || wolfRows.size > 0;
  if (hasWolfContract) {
    const planWolfSequence = parseOrderedPromptSequence(
      plan.wolfAttackSequenceSource,
      plan.definitions,
      errors,
      'canonical plan WOLF-ATTACK order',
    );
    const evidenceWolfSequence = parseOrderedPromptSequence(
      wolfEvidence?.direction,
      plan.definitions,
      errors,
      `${WOLF_SEQUENCE_EVIDENCE_ID} direction`,
    );
    const indexWolfSequence = parseOrderedPromptSequence(
      wolfSequence?.order,
      plan.definitions,
      errors,
      'dependency index WOLF-ATTACK order',
    );
    if (JSON.stringify(planWolfSequence.groups) !== JSON.stringify(evidenceWolfSequence.groups)) {
      errors.push(`canonical plan WOLF-ATTACK order does not match ${WOLF_SEQUENCE_EVIDENCE_ID} evidence direction`);
    }
    if (JSON.stringify(planWolfSequence.groups) !== JSON.stringify(indexWolfSequence.groups)) {
      errors.push('canonical plan WOLF-ATTACK order does not match the dependency index sequence table');
    }
    if (!wolfSequence?.evidenceIds.includes(WOLF_SEQUENCE_EVIDENCE_ID)) {
      errors.push(`dependency index WOLF-ATTACK order must cite ${WOLF_SEQUENCE_EVIDENCE_ID}`);
    }
    for (const prompt of planWolfSequence.order) {
      if (!wolfRows.has(prompt)) {
        errors.push(`canonical plan WOLF-ATTACK order includes Prompt ${prompt} without a WOLF-ATTACK row`);
      }
    }
    for (const prompt of wolfRows) {
      if (!planWolfSequence.order.includes(prompt)) {
        errors.push(`WOLF-ATTACK row Prompt ${prompt} is missing from the canonical plan order`);
      }
      const evidenceIds = dependency.rows.get(prompt)?.evidenceIds.split(';')
        .map((value) => value.trim().toUpperCase()) ?? [];
      if (!evidenceIds.includes(WOLF_SEQUENCE_EVIDENCE_ID)) {
        errors.push(`WOLF-ATTACK row Prompt ${prompt} must cite ${WOLF_SEQUENCE_EVIDENCE_ID}`);
      }
    }
    plan.wolfAttackOrder = planWolfSequence.order;
  }
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
    const related = expandPromptTargets(
      row.relatedConsumes,
      plan.definitions,
      errors,
      `Prompt ${prompt} related/consumes`,
    );
    for (const target of [...prerequisites, ...related]) {
      if (target === prompt) errors.push(`Prompt ${prompt} has a self edge`);
      const edge = `${prompt}>${target}`;
      if (expandedEdges.has(edge)) errors.push(`dependency graph repeats expanded edge ${edge}`);
      expandedEdges.add(edge);
    }
    if (row.closureEvidenceGates !== 'none') {
      for (const segment of row.closureEvidenceGates.split(';')) {
        const separator = segment.indexOf(':');
        if (separator < 1 || !segment.slice(separator + 1).trim()) {
          errors.push(`Prompt ${prompt} has invalid closure evidence gate ${segment}`);
          continue;
        }
        for (const target of expandPromptTargets(
          segment.slice(0, separator),
          plan.definitions,
          errors,
          `Prompt ${prompt} closure evidence gates`,
        )) {
          if (target === prompt) errors.push(`Prompt ${prompt} has a self closure gate`);
        }
      }
    }
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
    for (const [field, value, expectedType] of [
      ['hard_prompt_prerequisites', row.hardPromptPrerequisites, 'hard_prompt'],
      ['hard_milestone', row.hardMilestone, 'hard_milestone'],
      ['hard_contract', row.hardContract, 'hard_contract'],
      ['decision_owner', row.decisionOwner, 'decision_owner'],
      ['closure_evidence_gates', row.closureEvidenceGates, 'evidence/audit closure'],
      ['sequence_rules', row.sequenceRules, 'sequence'],
      ['release_boundaries', row.releaseBoundaries, 'release-boundary'],
      ['related_consumes', row.relatedConsumes, 'related/consumes'],
    ]) {
      if (value !== 'none' && !evidenceIds.some((id) => evidenceTypes.get(id)?.includes(expectedType))) {
        errors.push(`Prompt ${prompt} ${field} is missing typed ${expectedType} evidence`);
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

export function parseCatalog({ planSource, progressSource, dependencySource }, errors = []) {
  const plan = parsePlan(planSource, errors);
  const progress = parseProgress(progressSource, errors);
  const dependency = parseDependencyIndex(dependencySource, errors);
  validateCatalogIntegrity({ plan, progress, dependency, errors });
  return { plan, progress, dependency };
}

function validateNewPromptRegistration({
  prompt,
  files,
  plan,
  progress,
  dependency,
  parentProgressSource,
  parentDependencySource,
  errors,
}) {
  const planRecord = plan.definitions.get(prompt);
  const dependencyRecord = dependency.rows.get(prompt);
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

function comparableDependencyMapping(row, dependency) {
  if (!row) return null;
  const evidence = row.evidenceIds === 'none'
    ? 'none'
    : row.evidenceIds.split(';').map((value) => value.trim().toUpperCase()).map((id) => {
      const record = dependency.evidence.get(id);
      return [id, record?.type, record?.direction, record?.source, record?.language].join(':');
    }).join(';');
  return [
    row.hardPromptPrerequisites,
    row.hardMilestone,
    row.hardContract,
    row.decisionOwner,
    row.closureEvidenceGates,
    row.sequenceRules,
    row.releaseBoundaries,
    row.relatedConsumes,
    row.evidenceIds,
    evidence,
  ].join('|');
}

function validateAuthorityMappingOwnership({
  files,
  current,
  ownerPrompt,
  documentationOnly,
  parentPlanSource,
  parentProgressSource,
  parentDependencySource,
  errors,
}) {
  const ownerLabel = documentationOnly
    ? 'documentation-only commits'
    : ownerPrompt
      ? `Prompt ${ownerPrompt} commits`
      : 'non-documentation commits without a valid prompt';
  if ([parentPlanSource, parentProgressSource, parentDependencySource]
    .some((source) => typeof source !== 'string')) {
    errors.push(`${ownerLabel} must have all parent authority sources when changing canonical authority`);
    return;
  }
  const parentErrors = [];
  const parent = parseCatalog({
    planSource: parentPlanSource,
    progressSource: parentProgressSource,
    dependencySource: parentDependencySource,
  }, parentErrors);
  errors.push(...parentErrors.map((error) => `parent canonical authority: ${error}`));

  const parentPrompts = new Set([
    ...parent.plan.definitions.keys(),
    ...parent.plan.checklist.keys(),
    ...parent.progress.keys(),
    ...parent.dependency.rows.keys(),
  ]);
  const currentPrompts = new Set([
    ...current.plan.definitions.keys(),
    ...current.plan.checklist.keys(),
    ...current.progress.keys(),
    ...current.dependency.rows.keys(),
  ]);
  const compare = (prompt, label, before, after) => {
    if (before !== after && ownerPrompt !== prompt) {
      errors.push(
        `${ownerLabel} cannot change canonical Prompt ${prompt} ${label} ` +
          `from ${String(before)} to ${String(after)}`,
      );
    }
  };
  for (const prompt of parentPrompts) {
    const currentPlan = current.plan.definitions.get(prompt);
    const currentChecklist = current.plan.checklist.get(prompt);
    const currentProgress = current.progress.get(prompt);
    const currentDependency = current.dependency.rows.get(prompt);
    if (!currentPlan || !currentChecklist || !currentProgress || !currentDependency) {
      errors.push(`${ownerLabel} cannot remove canonical Prompt ${prompt} authority mappings`);
      continue;
    }
    const parentPlan = parent.plan.definitions.get(prompt);
    const parentChecklist = parent.plan.checklist.get(prompt);
    const parentProgress = parent.progress.get(prompt);
    const parentDependency = parent.dependency.rows.get(prompt);
    compare(prompt, 'plan tag', parentPlan?.tag, currentPlan.tag);
    compare(prompt, 'status', parentProgress?.status, currentProgress.status);
    compare(prompt, 'completion mapping', parentChecklist?.checked, currentChecklist.checked);
    compare(prompt, 'change class', parentProgress?.changeClass, currentProgress.changeClass);
    compare(prompt, 'release mapping', parentProgress?.releaseMapping, currentProgress.releaseMapping);
    compare(
      prompt,
      'dependency mapping',
      comparableDependencyMapping(parentDependency, parent.dependency),
      comparableDependencyMapping(currentDependency, current.dependency),
    );
  }
  for (const prompt of currentPrompts) {
    if (parentPrompts.has(prompt)) continue;
    if (!documentationOnly && ownerPrompt !== prompt) {
      errors.push(`${ownerLabel} cannot add canonical Prompt ${prompt} authority mappings`);
      continue;
    }
    if (!documentationOnly) continue;
    validateNewPromptRegistration({
      prompt,
      files,
      ...current,
      parentProgressSource,
      parentDependencySource,
      errors,
    });
  }
}

/**
 * Validate the durable mapping from one candidate commit to the canonical
 * implementation plan and dependency authority. Unrelated documentation-only
 * commits are exempt; canonical authority Markdown remains fail-closed.
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
  const changesCanonicalAuthority = files.some((filePath) => CANONICAL_AUTHORITY_PATHS.has(filePath));
  if (documentationOnly && !changesCanonicalAuthority) {
    return { documentationOnly: true, prompt: null, newPrompt: false, errors: [] };
  }

  const errors = [];
  const catalog = parseCatalog({ planSource, progressSource, dependencySource }, errors);
  const { plan, progress, dependency } = catalog;
  if (documentationOnly) {
    validateAuthorityMappingOwnership({
      files,
      current: catalog,
      ownerPrompt: null,
      documentationOnly: true,
      parentPlanSource,
      parentProgressSource,
      parentDependencySource,
      errors,
    });
    return {
      documentationOnly: true,
      authorityValidated: true,
      prompt: null,
      newPrompt: false,
      errors,
    };
  }

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

  if (changesCanonicalAuthority) {
    validateAuthorityMappingOwnership({
      files,
      current: catalog,
      ownerPrompt: prompt,
      documentationOnly: false,
      parentPlanSource,
      parentProgressSource,
      parentDependencySource,
      errors,
    });
  }

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
    validateNewPromptRegistration({
      prompt,
      files,
      plan,
      progress,
      dependency,
      parentProgressSource,
      parentDependencySource,
      errors,
    });
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

function validateCoordinationRangeBindings({
  cwd,
  results,
  progressSource,
  coordinationPrompt,
  coordinationPromptBefore,
  coordinationPromptBindings,
  errors,
}) {
  if (coordinationPrompt === null || coordinationPrompt === undefined) return;
  const currentPrompt = normalizeImplementationPrompt(coordinationPrompt);
  if (!currentPrompt) {
    errors.push(`coordination prompt has invalid ID ${String(coordinationPrompt)}`);
    return;
  }
  const previousPrompt = coordinationPromptBefore === null || coordinationPromptBefore === undefined
    ? null
    : normalizeImplementationPrompt(coordinationPromptBefore);
  if (coordinationPromptBefore !== null && coordinationPromptBefore !== undefined && !previousPrompt) {
    errors.push(`previous coordination prompt has invalid ID ${String(coordinationPromptBefore)}`);
  } else if (previousPrompt && !(previousPrompt === '664' && currentPrompt === '665')) {
    errors.push(
      `coordination prompt transition ${previousPrompt} to ${currentPrompt} is not an allowed repository migration`,
    );
  }

  const bindings = [];
  const canonicalProgress = parseProgress(progressSource);
  if (!Array.isArray(coordinationPromptBindings)) {
    errors.push('coordination prompt bindings must be an array');
  } else {
    for (const binding of coordinationPromptBindings) {
      const prompt = normalizeImplementationPrompt(binding?.prompt);
      const commit = typeof binding?.commit === 'string' ? binding.commit.trim() : '';
      if (!prompt || !commit || !git(cwd, ['rev-parse', '--verify', `${commit}^{commit}`], { allowFailure: true })) {
        errors.push('coordination prompt binding requires a valid prompt and commit');
        continue;
      }
      const resolvedCommit = git(cwd, ['rev-parse', '--verify', `${commit}^{commit}`]);
      const changeClass = canonicalProgress.get(prompt)?.changeClass ?? null;
      if (prompt !== currentPrompt && changeClass !== 'non-feature') {
        errors.push(changeClass === 'feature'
          ? `canonical feature Prompt ${prompt} cannot be preserved by coordination Prompt ${currentPrompt}`
          : `preserved Prompt ${prompt} has no canonical non-feature classification at the range head`);
        continue;
      }
      bindings.push({ prompt, commit: resolvedCommit });
    }
  }

  let reachedCurrentPrompt = false;
  for (const result of results) {
    if (result.documentationOnly || !result.prompt) continue;
    if (result.prompt === currentPrompt) {
      reachedCurrentPrompt = true;
      continue;
    }
    if (previousPrompt && result.prompt === previousPrompt && !reachedCurrentPrompt) continue;
    if (bindings.some((binding) =>
      binding.prompt === result.prompt && binding.commit === result.commit)) {
      continue;
    }
    errors.push(
      `${result.commit.slice(0, 12)}: commit trailer Prompt ${result.prompt} does not match ` +
        `coordination Prompt ${currentPrompt}`,
    );
  }
  if (!results.some((result) => result.prompt === currentPrompt)) {
    errors.push(
      `commit range does not contain a non-documentation commit for coordination Prompt ${currentPrompt}`,
    );
  }
}

export function validateCommitRange({
  cwd = process.cwd(),
  range,
  coordinationPrompt = null,
  coordinationPromptBefore = null,
  coordinationPromptBindings = [],
} = {}) {
  if (!range) throw new Error('work registration range validation requires --range <base>..<head>');
  const separator = range.indexOf('..');
  if (separator < 1 || separator + 2 >= range.length || range[separator + 2] === '.') {
    throw new Error('work registration range validation requires --range <base>..<head>');
  }
  const baseRef = range.slice(0, separator);
  const headRef = range.slice(separator + 2);
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
  const basePlanSource = sourceAt(
    cwd,
    git(cwd, ['rev-parse', '--verify', `${baseRef}^{commit}`]),
    'docs/IMPLEMENTATION_PLAN.md',
  );
  for (const prompt of new Set(results.map((result) => result.prompt).filter(Boolean))) {
    if (!sourceContainsPrompt(basePlanSource, prompt) &&
      !results.some((result) => result.prompt === prompt && result.newPrompt)) {
      errors.push(
        `Prompt ${prompt} was absent at the range base and must be registered in the same ` +
        'non-documentation commit that first uses it',
      );
    }
  }
  validateCoordinationRangeBindings({
    cwd,
    results,
    progressSource: sourceAt(
      cwd,
      git(cwd, ['rev-parse', '--verify', `${headRef}^{commit}`]),
      'docs/IMPLEMENTATION_PROGRESS.md',
    ),
    coordinationPrompt,
    coordinationPromptBefore,
    coordinationPromptBindings,
    errors,
  });
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
  if (result.authorityValidated) {
    console.log('Implementation work registration: documentation authority verified.');
  } else if (result.documentationOnly) {
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
