#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * The catalog is the only mutable machine authority for roadmap prompts.
 * Markdown files contain generated prompt views plus intentionally retained
 * historical prose. In particular, status, class, and release are stored
 * once per prompt here; checklist and dependency columns are projections.
 */
export const CATALOG_PATH = 'docs/implementation-prompts.json';
export const PROMPT_CATALOG_SCHEMA_VERSION = 2;
export const GENERATED_VIEW_MARKERS = Object.freeze({
  plan: Object.freeze({
    begin: '<!-- BEGIN GENERATED PROMPT CATALOG: plan -->',
    end: '<!-- END GENERATED PROMPT CATALOG: plan -->',
  }),
  progress: Object.freeze({
    begin: '<!-- BEGIN GENERATED PROMPT CATALOG: progress -->',
    end: '<!-- END GENERATED PROMPT CATALOG: progress -->',
  }),
  progressLedger: Object.freeze({
    begin: '<!-- BEGIN GENERATED PROMPT CATALOG: progress-ledger -->',
    end: '<!-- END GENERATED PROMPT CATALOG: progress-ledger -->',
  }),
  dependency: Object.freeze({
    begin: '<!-- BEGIN GENERATED PROMPT CATALOG: dependency -->',
    end: '<!-- END GENERATED PROMPT CATALOG: dependency -->',
  }),
});

const PROMPT_PATTERN = /^\d{3}[a-z]*$/i;
const STATUS_VALUES = new Set(['done', 'partial', 'missing', 'blocked', 'in-progress']);
const CHANGE_CLASS_VALUES = new Set(['feature', 'non-feature']);
const VERSION_PATTERN = /^\d+\.\d+\.\d+$/;
const RETIRED_PROMPT_IDS = Object.freeze(['071']);
const DEPENDENCY_FIELDS = Object.freeze([
  'hardPromptPrerequisites',
  'hardMilestone',
  'hardContract',
  'decisionOwner',
  'closureEvidenceGates',
  'sequenceRules',
  'releaseBoundaries',
  'relatedConsumes',
  'evidenceIds',
  'milestoneHints',
]);

export function normalizePromptId(value) {
  if (typeof value === 'number' && Number.isInteger(value)) value = String(value).padStart(3, '0');
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase();
  if (PROMPT_PATTERN.test(normalized)) return normalized;
  const legacy = normalized.match(/^(\d{1,3})([a-z]*)$/i);
  return legacy ? `${legacy[1].padStart(3, '0')}${legacy[2].toLowerCase()}` : null;
}

function promptCompare(left, right) {
  const a = normalizePromptId(left) ?? String(left);
  const b = normalizePromptId(right) ?? String(right);
  const aBase = Number.parseInt(a.slice(0, 3), 10);
  const bBase = Number.parseInt(b.slice(0, 3), 10);
  return aBase - bBase || a.length - b.length || a.localeCompare(b);
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key])]));
  }
  return value;
}

export function stableCatalogJson(value, spacing = 2) {
  return `${JSON.stringify(stableValue(value), null, spacing)}\n`;
}

/** Split a Markdown row while respecting the conventional escaped `\\|`. */
function splitTableRow(line) {
  const text = String(line ?? '').trimEnd();
  if (!text.startsWith('|')) return [];
  const body = text.endsWith('|') ? text.slice(1, -1) : text.slice(1);
  const cells = [];
  let cell = '';
  let escaped = false;
  for (const character of body) {
    if (escaped) {
      cell += character;
      escaped = false;
    } else if (character === '\\') {
      escaped = true;
    } else if (character === '|') {
      cells.push(cell.trim());
      cell = '';
    } else {
      cell += character;
    }
  }
  if (escaped) cell += '\\';
  cells.push(cell.trim());
  return cells;
}

function lineAt(source, offset) {
  return String(source ?? '').slice(0, offset).split('\n').length;
}

function parseDefinition(definition) {
  const body = String(definition).replace(/^[-*]\s+/, '').trim();
  const match = body.match(/^\*\*Prompt\s+\d{3}[a-z]*\s+—\s+\[[^\]]+\]\s+([\s\S]*?)\*\*\s+Acceptance:\s*([\s\S]*)$/i);
  if (!match) return { title: '', acceptance: '' };
  return { title: match[1].trim(), acceptance: match[2].trim() };
}

export function formatPromptDefinition(prompt) {
  const definition = prompt?.definition ?? {};
  return `- **Prompt ${prompt.id} — [${prompt.tag}] ${definition.title}** Acceptance: ${definition.acceptance}`;
}

export function promptTitle(prompt) {
  return String(prompt?.definition?.title ?? '').trim();
}

function parsePlanSource(source, errors) {
  const text = String(source ?? '');
  const lines = text.split('\n');
  const sectionAtLine = [];
  let section = '';
  for (let index = 0; index < lines.length; index += 1) {
    const heading = lines[index].match(/^####\s+(.+)$/);
    if (heading) section = heading[1].trim();
    sectionAtLine[index] = section;
  }
  const definitions = [];
  for (const match of text.matchAll(/^[-*]\s+\*\*Prompt\s+(\d{3}[a-z]*)\s+—\s+\[([^\]]+)\]([^\n]*)/gim)) {
    const id = normalizePromptId(match[1]);
    const rawDefinition = match[0];
    const definition = parseDefinition(rawDefinition);
    const line = lineAt(text, match.index ?? 0);
    if (!id) {
      errors.push(`plan definition has invalid prompt ID ${match[1]}`);
      continue;
    }
    if (!definition.title || !definition.acceptance) {
      errors.push(`Prompt ${id} plan definition must include a title and Acceptance text`);
    }
    definitions.push({
      id,
      section: sectionAtLine[line - 1] ?? '',
      tag: match[2].trim().toUpperCase(),
      definition,
      rawDefinition,
      line,
    });
  }
  const checklist = new Map();
  for (const match of text.matchAll(/^[-*]\s+\[([ xX])\]\s+Prompt\s+(\d{3}[a-z]*)[ \t]*$/gim)) {
    const id = normalizePromptId(match[2]);
    if (!id) continue;
    if (checklist.has(id)) errors.push(`plan checklist repeats Prompt ${id}`);
    checklist.set(id, { checked: match[1].toLowerCase() === 'x' });
  }
  const wolfAttackMatch = text.match(
    /Implement this block in dependency order:\s*([\s\S]*?)\.\s*Prompts 351\b/i,
  );
  return { definitions, checklist, wolfAttackSequenceSource: wolfAttackMatch?.[1] ?? null };
}

function parseProgressSource(source, errors) {
  const rows = [];
  const text = String(source ?? '');
  for (const line of text.split('\n')) {
    const cells = splitTableRow(line);
    if (cells.length < 5 || !/^\d{3}[a-z]*$/i.test(cells[0])) continue;
    const id = normalizePromptId(cells[0]);
    const status = cells[1]?.toLowerCase();
    const changeClass = cells[2]?.toLowerCase();
    if (!id || !STATUS_VALUES.has(status) || !CHANGE_CLASS_VALUES.has(changeClass)) continue;
    const changelogCell = cells[3] ?? '—';
    rows.push({
      id,
      status,
      changeClass,
      releases: changelogCell === '—'
        ? []
        : changelogCell.split(',').map((value) => value.trim()).filter(Boolean),
      description: cells.slice(4).join('|').trim(),
    });
  }
  if (rows.length === 0) errors.push('progress ledger contains no prompt rows');
  return rows;
}

function parseDependencySource(source, errors) {
  const rows = [];
  const evidence = [];
  const sequences = [];
  let mode = null;
  for (const line of String(source ?? '').split('\n')) {
    if (/^\|\s*prompt_id\s*\|/i.test(line)) {
      mode = 'prompt';
      continue;
    }
    if (/^\|\s*Rule\s*\|/i.test(line)) {
      mode = 'sequence';
      continue;
    }
    if (/^\|\s*Evidence ID\s*\|/i.test(line)) {
      mode = 'evidence';
      continue;
    }
    if (/^\|\s*[-: ]+(\|\s*[-: ]+)+\|?\s*$/.test(line)) continue;
    const cells = splitTableRow(line);
    if (!cells.length) {
      if (/^##\s+/.test(line)) mode = null;
      continue;
    }
    if (mode === 'prompt' && cells.length === 14 && /^\d{3}[a-z]*$/i.test(cells[0])) {
      const id = normalizePromptId(cells[0]);
      rows.push({
        id,
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
      });
      continue;
    }
    if (mode === 'sequence' && cells.length === 4 && /^[A-Z][A-Z0-9-]+$/.test(cells[0])) {
      sequences.push({
        id: cells[0],
        order: cells[1].replace(/\.$/, ''),
        hardDependency: cells[2],
        evidenceIds: cells[3].split(';').map((value) => value.trim().toUpperCase()).filter(Boolean),
      });
      continue;
    }
    if (mode === 'evidence' && cells.length === 5 && /^E-[A-Z0-9-]+$/i.test(cells[0])) {
      evidence.push({
        id: cells[0].toUpperCase(),
        type: cells[1],
        direction: cells[2],
        source: cells[3],
        language: cells[4],
      });
    }
  }
  if (rows.length === 0) errors.push('dependency index contains no prompt rows');
  return { rows, evidence, sequences };
}

function mapById(records, label, errors) {
  const output = new Map();
  for (const record of records) {
    if (!record?.id) continue;
    if (output.has(record.id)) errors.push(`${label} repeats ${record.id}`);
    output.set(record.id, record);
  }
  return output;
}

function promptTargets(value) {
  if (value === 'none') return [];
  return String(value ?? '').split(';').map((token) => token.trim()).filter(Boolean);
}

export function expandPromptTargets(
  value,
  knownPrompts,
  errors = [],
  label = 'prompt targets',
  retired = RETIRED_PROMPT_IDS,
) {
  if (value === 'none') return [];
  const known = knownPrompts instanceof Set ? knownPrompts : new Set(knownPrompts ?? []);
  const retiredSet = new Set(retired ?? []);
  const output = [];
  for (const raw of promptTargets(value)) {
    const range = raw.match(/^(\d{3})-(\d{3})$/);
    if (range) {
      const start = Number(range[1]);
      const end = Number(range[2]);
      if (start > end) {
        errors.push(`${label} contains reverse range ${raw}`);
        continue;
      }
      for (let number = start; number <= end; number += 1) {
        const id = String(number).padStart(3, '0');
        if (retiredSet.has(id)) continue;
        if (!known.has(id)) errors.push(`${label} contains unknown Prompt ${id}`);
        else output.push(id);
      }
      continue;
    }
    const id = normalizePromptId(raw);
    if (!id || (!known.has(id) && !retiredSet.has(id))) {
      errors.push(`${label} contains unknown Prompt ${raw || '(empty)'}`);
    } else if (known.has(id)) {
      output.push(id);
    }
  }
  return output;
}

function evidenceTokens(value) {
  if (value === 'none') return [];
  return String(value ?? '').split(';').map((item) => item.trim().toUpperCase()).filter(Boolean);
}

function validateGraph(prompts, evidenceIds, errors, retired) {
  const known = new Set(prompts.map(({ id }) => id));
  const graph = new Map();
  for (const prompt of prompts) {
    const prerequisites = expandPromptTargets(
      prompt.hardPromptPrerequisites,
      known,
      errors,
      `Prompt ${prompt.id} hard prerequisites`,
      retired,
    );
    const related = expandPromptTargets(
      prompt.relatedConsumes,
      known,
      errors,
      `Prompt ${prompt.id} related/consumes`,
      retired,
    );
    if (prerequisites.includes(prompt.id)) errors.push(`Prompt ${prompt.id} has a self edge`);
    if (related.includes(prompt.id)) errors.push(`Prompt ${prompt.id} has a self related edge`);
    graph.set(prompt.id, prerequisites);
    for (const evidenceId of evidenceTokens(prompt.evidenceIds)) {
      if (!evidenceIds.has(evidenceId)) {
        errors.push(`Prompt ${prompt.id} references unknown dependency evidence ${evidenceId}`);
      }
    }
  }
  const active = new Set();
  const visited = new Set();
  const visit = (id, path = []) => {
    if (active.has(id)) {
      errors.push(`hard dependency cycle detected: ${[...path, id].join(' -> ')}`);
      return;
    }
    if (visited.has(id)) return;
    active.add(id);
    for (const target of graph.get(id) ?? []) visit(target, [...path, id]);
    active.delete(id);
    visited.add(id);
  };
  for (const id of graph.keys()) visit(id);
}

export function validatePromptCatalog(catalog) {
  const errors = [];
  if (!catalog || typeof catalog !== 'object' || Array.isArray(catalog)) {
    return ['prompt catalog must be an object'];
  }
  if (catalog.schemaVersion !== PROMPT_CATALOG_SCHEMA_VERSION) {
    errors.push(`prompt catalog schemaVersion must be ${PROMPT_CATALOG_SCHEMA_VERSION}`);
  }
  if (!Array.isArray(catalog.prompts) || catalog.prompts.length === 0) {
    errors.push('prompt catalog prompts must be a non-empty array');
    return errors;
  }
  const retired = new Set(catalog.retiredPromptIds ?? RETIRED_PROMPT_IDS);
  for (const retiredId of retired) {
    if (!normalizePromptId(retiredId)) errors.push(`invalid retired Prompt ID ${retiredId}`);
  }
  const evidenceIds = new Set();
  for (const evidence of catalog.evidence ?? []) {
    const id = String(evidence?.id ?? '').toUpperCase();
    if (!/^E-[A-Z0-9-]+$/.test(id)) {
      errors.push(`prompt catalog evidence has invalid ID ${String(evidence?.id ?? '')}`);
      continue;
    }
    if (evidenceIds.has(id)) errors.push(`prompt catalog evidence repeats ${id}`);
    evidenceIds.add(id);
    for (const field of ['type', 'direction', 'source', 'language']) {
      if (typeof evidence[field] !== 'string' || !evidence[field].trim()) {
        errors.push(`dependency evidence ${id} has empty ${field}`);
      }
    }
  }
  const sequenceIds = new Set();
  for (const sequence of catalog.sequences ?? []) {
    const id = String(sequence?.id ?? '');
    if (!/^[A-Z][A-Z0-9-]+$/.test(id)) {
      errors.push(`prompt catalog sequence has invalid ID ${id}`);
      continue;
    }
    if (sequenceIds.has(id)) errors.push(`prompt catalog sequence repeats ${id}`);
    sequenceIds.add(id);
    if (!Array.isArray(sequence.evidenceIds)) errors.push(`sequence ${id} evidenceIds must be an array`);
    for (const evidenceId of sequence.evidenceIds ?? []) {
      if (!evidenceIds.has(String(evidenceId).toUpperCase())) {
        errors.push(`sequence ${id} references unknown dependency evidence ${evidenceId}`);
      }
    }
  }
  const promptRecords = [];
  const ids = new Set();
  const promptById = new Map();
  for (const prompt of catalog.prompts) {
    const id = normalizePromptId(prompt?.id);
    if (!id || !PROMPT_PATTERN.test(id)) {
      errors.push(`prompt catalog contains invalid Prompt ${String(prompt?.id ?? '')}`);
      continue;
    }
    if (ids.has(id)) errors.push(`prompt catalog repeats Prompt ${id}`);
    ids.add(id);
    if (retired.has(id)) errors.push(`retired Prompt ${id} must not be canonical`);
    if (prompt.plan || prompt.progress || prompt.dependency || prompt.sourceSnapshots) {
      errors.push(`Prompt ${id} contains duplicated legacy authority fields; use flat catalog fields`);
    }
    if (typeof prompt.section !== 'string' || !prompt.section.trim()) errors.push(`Prompt ${id} has empty section`);
    if (typeof prompt.tag !== 'string' || !prompt.tag.trim()) errors.push(`Prompt ${id} has empty tag`);
    if (!prompt.definition || typeof prompt.definition !== 'object' || Array.isArray(prompt.definition)) {
      errors.push(`Prompt ${id} definition must be a title/acceptance object`);
    } else {
      if (typeof prompt.definition.title !== 'string' || !prompt.definition.title.trim()) {
        errors.push(`Prompt ${id} definition has empty title`);
      }
      if (typeof prompt.definition.acceptance !== 'string' || !prompt.definition.acceptance.trim()) {
        errors.push(`Prompt ${id} definition has empty acceptance`);
      }
    }
    if (!STATUS_VALUES.has(prompt.status)) errors.push(`Prompt ${id} has invalid status ${prompt.status}`);
    if (!CHANGE_CLASS_VALUES.has(prompt.changeClass)) {
      errors.push(`Prompt ${id} has invalid change class ${prompt.changeClass}`);
    }
    if (!Array.isArray(prompt.releases) || prompt.releases.some((version) => !VERSION_PATTERN.test(version))) {
      errors.push(`Prompt ${id} has invalid release mapping`);
    }
    if (typeof prompt.description !== 'string') errors.push(`Prompt ${id} has invalid progress description`);
    for (const field of DEPENDENCY_FIELDS) {
      if (typeof prompt[field] !== 'string' || !prompt[field].trim()) {
        errors.push(`Prompt ${id} has empty dependency field ${field}`);
      }
    }
    promptRecords.push(prompt);
    promptById.set(id, prompt);
  }
  const evidenceTypes = new Map([...evidenceIds].map((id) => [
    id,
    (catalog.evidence ?? []).find((record) => String(record?.id).toUpperCase() === id)?.type
      ?.split(' / ').map((type) => type.trim()) ?? [],
  ]));
  const typedFields = [
    ['hardPromptPrerequisites', 'hard_prompt'],
    ['hardMilestone', 'hard_milestone'],
    ['hardContract', 'hard_contract'],
    ['decisionOwner', 'decision_owner'],
    ['closureEvidenceGates', 'evidence/audit closure'],
    ['sequenceRules', 'sequence'],
    ['releaseBoundaries', 'release-boundary'],
    ['relatedConsumes', 'related/consumes'],
  ];
  for (const prompt of promptRecords) {
    const evidence = evidenceTokens(prompt.evidenceIds);
    const requiresEvidence = typedFields.some(([field]) => prompt[field] !== 'none');
    if (requiresEvidence && evidence.length === 0) {
      errors.push(`Prompt ${prompt.id} records dependency context without evidence IDs`);
    }
    for (const [field, expectedType] of typedFields) {
      if (prompt[field] !== 'none' && !evidence.some((id) => evidenceTypes.get(id)?.includes(expectedType))) {
        errors.push(`Prompt ${prompt.id} ${field} is missing typed ${expectedType} evidence`);
      }
    }
    if (prompt.status === 'done') {
      const prerequisiteErrors = [];
      for (const prerequisite of expandPromptTargets(
        prompt.hardPromptPrerequisites,
        promptById.keys(),
        prerequisiteErrors,
        `Prompt ${prompt.id} hard prerequisites`,
        retired,
      )) {
        if (promptById.get(prerequisite)?.status !== 'done') {
          errors.push(`Prompt ${prompt.id} is done while hard prerequisite ${prerequisite} is not done`);
        }
      }
    }
  }
  validateGraph(promptRecords, evidenceIds, errors, retired);
  return errors;
}

export function extractPromptCatalog({
  planSource = '',
  progressSource = '',
  dependencySource = '',
  milestonesSource = '',
} = {}) {
  // milestonesSource is accepted for a one-time migration API. Milestone
  // prose remains a Markdown authority and is intentionally not duplicated in
  // the catalog; hard gates are already represented in dependency rows.
  void milestonesSource;
  const errors = [];
  const plan = parsePlanSource(planSource, errors);
  const progress = parseProgressSource(progressSource, errors);
  const dependency = parseDependencySource(dependencySource, errors);
  const planById = mapById(plan.definitions, 'plan definitions', errors);
  const progressById = mapById(progress, 'progress ledger', errors);
  const dependencyById = mapById(dependency.rows, 'dependency index', errors);
  const ids = [...new Set([...planById.keys(), ...progressById.keys(), ...dependencyById.keys()])]
    .sort(promptCompare);
  const prompts = ids.map((id) => {
    const planRecord = planById.get(id);
    const progressRecord = progressById.get(id);
    const dependencyRecord = dependencyById.get(id);
    if (!planRecord) errors.push(`canonical plan is missing Prompt ${id}`);
    if (!progressRecord) errors.push(`progress ledger is missing Prompt ${id}`);
    if (!dependencyRecord) errors.push(`dependency index is missing Prompt ${id}`);
    if (planRecord && progressRecord && plan.checklist.has(id)
      && plan.checklist.get(id).checked !== (progressRecord.status === 'done')) {
      errors.push(`Prompt ${id} checklist/status mismatch during catalog import`);
    }
    if (planRecord && dependencyRecord && planRecord.tag !== dependencyRecord.tag) {
      errors.push(`Prompt ${id} plan/dependency tag mismatch during catalog import`);
    }
    if (progressRecord && dependencyRecord && progressRecord.status !== dependencyRecord.progress) {
      errors.push(`Prompt ${id} progress/dependency status mismatch during catalog import`);
    }
    const definition = planRecord?.definition ?? { title: '', acceptance: '' };
    return {
      id,
      section: planRecord?.section ?? '',
      tag: planRecord?.tag ?? dependencyRecord?.tag ?? '',
      definition,
      status: progressRecord?.status ?? 'missing',
      changeClass: progressRecord?.changeClass ?? 'non-feature',
      releases: progressRecord?.releases ?? [],
      description: progressRecord?.description ?? '',
      hardPromptPrerequisites: dependencyRecord?.hardPromptPrerequisites ?? 'none',
      hardMilestone: dependencyRecord?.hardMilestone ?? 'none',
      hardContract: dependencyRecord?.hardContract ?? 'none',
      decisionOwner: dependencyRecord?.decisionOwner ?? 'none',
      closureEvidenceGates: dependencyRecord?.closureEvidenceGates ?? 'none',
      sequenceRules: dependencyRecord?.sequenceRules ?? 'none',
      releaseBoundaries: dependencyRecord?.releaseBoundaries ?? 'none',
      relatedConsumes: dependencyRecord?.relatedConsumes ?? 'none',
      evidenceIds: dependencyRecord?.evidenceIds ?? 'none',
      milestoneHints: dependencyRecord?.milestoneHints ?? 'none',
    };
  });
  if (errors.length > 0) throw new Error(`Unable to extract prompt catalog:\n- ${errors.join('\n- ')}`);
  const catalog = {
    schemaVersion: PROMPT_CATALOG_SCHEMA_VERSION,
    catalogPath: CATALOG_PATH,
    retiredPromptIds: [...RETIRED_PROMPT_IDS],
    prompts,
    evidence: dependency.evidence,
    sequences: dependency.sequences,
    plan: { wolfAttackSequence: plan.wolfAttackSequenceSource },
  };
  const validationErrors = validatePromptCatalog(catalog);
  if (validationErrors.length > 0) {
    throw new Error(`Extracted prompt catalog is invalid:\n- ${validationErrors.join('\n- ')}`);
  }
  return catalog;
}

export function loadPromptCatalog({ cwd = process.cwd(), path = CATALOG_PATH, source } = {}) {
  const text = source ?? readFileSync(resolve(cwd, path), 'utf8');
  const catalog = JSON.parse(text);
  const errors = validatePromptCatalog(catalog);
  if (errors.length > 0) throw new Error(`Prompt catalog validation failed:\n- ${errors.join('\n- ')}`);
  return catalog;
}

function milestoneNumber(record) {
  return Number(record?.milestoneHints?.match(/M(\d+)/)?.[1] ?? 999);
}

function buildWolfOrder(catalog) {
  const raw = catalog.plan?.wolfAttackSequence ?? '';
  return raw.split(/\s*->\s*/).flatMap((group) => group.split('/'))
    .map((value) => normalizePromptId(value.trim()))
    .filter(Boolean);
}

export function deriveProgressSummary(catalog) {
  const counts = { done: 0, partial: 0, missing: 0, blocked: 0, 'in-progress': 0 };
  for (const prompt of catalog.prompts) counts[prompt.status] += 1;
  const unresolved = catalog.prompts.map(({ id, status }) => status === 'done' ? null : id)
    .filter(Boolean).sort(promptCompare);
  const active = catalog.prompts.find(({ status }) => status === 'in-progress')?.id ?? null;
  return {
    complete: counts.done,
    total: catalog.prompts.length,
    partial: counts.partial,
    missing: counts.missing,
    blocked: counts.blocked,
    inProgress: counts['in-progress'],
    resumePrompt: unresolved[0] ?? null,
    activePrompt: active,
    counts,
  };
}

export function buildPromptDispatch(catalog) {
  const byId = new Map(catalog.prompts.map((prompt) => [prompt.id, prompt]));
  const wolfOrder = new Map(buildWolfOrder(catalog).map((id, index) => [id, index]));
  const compare = (left, right) => milestoneNumber(left) - milestoneNumber(right)
    || (wolfOrder.get(left.prompt) ?? Number.MAX_SAFE_INTEGER)
      - (wolfOrder.get(right.prompt) ?? Number.MAX_SAFE_INTEGER)
    || promptCompare(left.prompt, right.prompt);
  const readyQueue = [];
  const needsConfirmation = [];
  const blocked = [];
  for (const prompt of catalog.prompts) {
    if (prompt.status === 'done') continue;
    const errors = [];
    const prerequisites = expandPromptTargets(
      prompt.hardPromptPrerequisites,
      byId.keys(),
      errors,
      `Prompt ${prompt.id} hard prerequisites`,
      catalog.retiredPromptIds,
    );
    const title = promptTitle(prompt);
    if (errors.length > 0) {
      blocked.push({ prompt: prompt.id, title, status: prompt.status, reasons: errors });
      continue;
    }
    const prerequisiteStatuses = prerequisites.map((id) => ({ id, status: byId.get(id)?.status ?? 'unknown' }));
    const unresolved = prerequisiteStatuses.filter(({ status }) => status !== 'done');
    const gates = [
      ['hard_milestone', prompt.hardMilestone],
      ['hard_contract', prompt.hardContract],
      ['decision_owner', prompt.decisionOwner],
    ].filter(([, value]) => value !== 'none').map(([type, value]) => ({ type, value }));
    const record = {
      prompt: prompt.id,
      title,
      milestone: prompt.milestoneHints,
      sequence: prompt.sequenceRules,
      status: prompt.status,
      prerequisiteStatuses,
      gates,
    };
    if (prompt.status === 'in-progress') blocked.push({ ...record, reasons: ['status=in-progress (agent already working)'] });
    else if (prompt.status !== 'missing' && prompt.status !== 'partial') {
      blocked.push({ ...record, reasons: [`status=${prompt.status} (unsupported for automatic selection)`] });
    } else if (unresolved.length > 0) {
      blocked.push({ ...record, reasons: [
        `hard_prompt_prerequisites: ${prerequisiteStatuses.map(({ id, status }) => `${id}=${status}`).join(',')}`,
      ] });
    } else if (gates.length > 0) {
      needsConfirmation.push({ ...record, reasons: gates.map(({ type, value }) => `${type}=${value} (not mechanically proven)`) });
    } else {
      readyQueue.push(record);
    }
  }
  return {
    readyQueue: readyQueue.sort(compare),
    needsConfirmation: needsConfirmation.sort(compare),
    blocked: blocked.sort(compare),
    next: readyQueue[0]?.prompt ?? null,
  };
}

export function selectPrompt(catalog, value) {
  const id = normalizePromptId(value);
  const prompt = catalog.prompts.find((candidate) => candidate.id === id);
  if (!prompt) throw new Error(`Prompt ${String(value)} is not in the prompt catalog`);
  const prerequisites = expandPromptTargets(
    prompt.hardPromptPrerequisites,
    new Set(catalog.prompts.map(({ id: promptId }) => promptId)),
    [],
    `Prompt ${id} hard prerequisites`,
    catalog.retiredPromptIds,
  );
  const evidenceById = new Map((catalog.evidence ?? []).map((record) => [record.id, record]));
  return {
    prompt: id,
    title: promptTitle(prompt),
    changeClass: prompt.changeClass,
    tag: prompt.tag,
    status: prompt.status,
    planDefinition: formatPromptDefinition(prompt),
    acceptance: prompt.definition.acceptance,
    progressDescription: prompt.description,
    releases: prompt.releases,
    prerequisites: prerequisites.map((prerequisite) => ({
      id: prerequisite,
      status: catalog.prompts.find(({ id: candidate }) => candidate === prerequisite)?.status ?? 'unknown',
    })),
    hardMilestone: prompt.hardMilestone,
    hardContract: prompt.hardContract,
    decisionOwner: prompt.decisionOwner,
    closureEvidenceGates: prompt.closureEvidenceGates,
    sequenceRules: prompt.sequenceRules,
    releaseBoundaries: prompt.releaseBoundaries,
    relatedConsumes: prompt.relatedConsumes,
    milestoneHints: prompt.milestoneHints,
    evidence: evidenceTokens(prompt.evidenceIds).map((evidenceId) => evidenceById.get(evidenceId)).filter(Boolean),
  };
}

function generatedHeader(kind) {
  return [
    GENERATED_VIEW_MARKERS[kind].begin,
    `<!-- Generated from ${CATALOG_PATH}; edit the catalog and run the view generator. -->`,
  ];
}

function renderPlan(catalog) {
  const lines = [...generatedHeader('plan')];
  const summary = deriveProgressSummary(catalog);
  lines.push('#### Prompt checklist');
  lines.push(`#### Execution checklist — all ${summary.total} prompts (catalog view)`);
  for (const prompt of catalog.prompts) lines.push(`- [${prompt.status === 'done' ? 'x' : ' '}] Prompt ${prompt.id}`);
  lines.push('');
  let previousSection = null;
  for (const prompt of catalog.prompts) {
    if (prompt.section !== previousSection) {
      if (previousSection !== null) lines.push('');
      lines.push(`#### ${prompt.section || 'Uncategorized'}`);
      previousSection = prompt.section;
    }
    lines.push(formatPromptDefinition(prompt));
  }
  lines.push(GENERATED_VIEW_MARKERS.plan.end);
  return `${lines.join('\n')}\n`;
}

function renderProgressRow(prompt) {
  const releases = prompt.releases.length > 0 ? prompt.releases.join(', ') : '—';
  const description = prompt.description.replaceAll('|', '\\|');
  return `| ${prompt.id} | ${prompt.status} | ${prompt.changeClass} | ${releases} | ${description} |`;
}

function renderProgress(catalog) {
  const summary = deriveProgressSummary(catalog);
  const percentage = summary.total === 0 ? '0.00' : ((summary.complete / summary.total) * 100).toFixed(2);
  const breakdown = ['done', 'partial', 'blocked', 'in-progress', 'missing']
    .filter((status) => summary.counts[status] > 0)
    .map((status) => `${summary.counts[status]} ${status}`)
    .join(' · ');
  const lines = [
    ...generatedHeader('progress'),
    '## Progress',
    '',
    `**${summary.complete} / ${summary.total} prompts complete (${percentage}%)**`,
    '',
    `Status breakdown: **${breakdown}**.`,
    '',
    `Active prompt: **${summary.activePrompt ? `Prompt ${summary.activePrompt}` : 'none'}**`,
    '',
    `Resume pointer: Prompt ${summary.resumePrompt ?? 'none'} is the lowest-numbered unchecked acceptance and remains advisory for concurrency.`,
    GENERATED_VIEW_MARKERS.progress.end,
    '',
    '## Execution ledger',
    '',
    GENERATED_VIEW_MARKERS.progressLedger.begin,
    '| Prompt | Status | Change | Changelog | Evidence / result |',
    '| ---: | :--- | :--- | :--- | :--- |',
    ...catalog.prompts.map(renderProgressRow),
    GENERATED_VIEW_MARKERS.progressLedger.end,
  ];
  return `${lines.join('\n')}\n`;
}

function renderDependencyRow(prompt) {
  return `| ${prompt.id} | ${prompt.tag} | ${prompt.status} | ${prompt.hardPromptPrerequisites} | ${prompt.hardMilestone} | ${prompt.hardContract} | ${prompt.decisionOwner} | ${prompt.closureEvidenceGates} | ${prompt.sequenceRules} | ${prompt.releaseBoundaries} | ${prompt.relatedConsumes} | ${prompt.evidenceIds} | ${prompt.milestoneHints} | ${promptTitle(prompt)} |`;
}

function renderSequenceRow(sequence) {
  return `| ${sequence.id} | ${sequence.order} | ${sequence.hardDependency} | ${sequence.evidenceIds.join(';')} |`;
}

function renderEvidenceRow(evidence) {
  return `| ${evidence.id} | ${evidence.type} | ${evidence.direction} | ${evidence.source} | ${evidence.language} |`;
}

function renderDependency(catalog) {
  const lines = [
    ...generatedHeader('dependency'),
    '## Prompt rows',
    '',
    '| prompt_id | plan_tag | progress | hard_prompt_prerequisites | hard_milestone | hard_contract | decision_owner | closure_evidence_gates | sequence_rules | release_boundaries | related_consumes | evidence_ids | milestone_hints | title |',
    '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |',
    ...catalog.prompts.map(renderDependencyRow),
    '',
    '## Explicit sequence rules',
    '',
    '| Rule | Explicit order or meaning | Blocking? | Evidence |',
    '| --- | --- | --- | --- |',
    ...catalog.sequences.map(renderSequenceRow),
    '',
    '## Edge evidence register',
    '',
    '| Evidence ID | Edge type | From -> target | Source anchor | Source language |',
    '| --- | --- | --- | --- | --- |',
    ...catalog.evidence.map(renderEvidenceRow),
    GENERATED_VIEW_MARKERS.dependency.end,
  ];
  return `${lines.join('\n')}\n`;
}

export function renderPromptViews(catalog) {
  const errors = validatePromptCatalog(catalog);
  if (errors.length > 0) throw new Error(`Cannot render invalid prompt catalog:\n- ${errors.join('\n- ')}`);
  return { plan: renderPlan(catalog), progress: renderProgress(catalog), dependency: renderDependency(catalog) };
}

function replaceMarker(source, marker, block) {
  const text = String(source ?? '');
  const beginIndex = text.indexOf(marker.begin);
  const endIndex = text.indexOf(marker.end);
  if (beginIndex >= 0 || endIndex >= 0) {
    if (beginIndex < 0 || endIndex < beginIndex) throw new Error(`Malformed generated ${marker.begin} section`);
    const end = endIndex + marker.end.length;
    return `${text.slice(0, beginIndex)}${block.trimEnd()}${text.slice(end)}`;
  }
  return `${text.trimEnd()}\n\n${block}`;
}

function replacePlanView(source, block) {
  const text = String(source ?? '');
  const marker = GENERATED_VIEW_MARKERS.plan;
  if (text.includes(marker.begin)) return replaceMarker(text, marker, block);
  const start = text.indexOf('#### Execution checklist');
  if (start >= 0) return `${text.slice(0, start).trimEnd()}\n\n${block}`;
  return replaceMarker(text, marker, block);
}

function replaceProgressView(source, block) {
  const text = String(source ?? '');
  const marker = GENERATED_VIEW_MARKERS.progress;
  if (text.includes(marker.begin)) {
    let output = replaceMarker(text, marker, block.slice(
      block.indexOf(marker.begin),
      block.indexOf(marker.end) + marker.end.length,
    ));
    const ledger = GENERATED_VIEW_MARKERS.progressLedger;
    const ledgerStart = block.indexOf(ledger.begin);
    const ledgerEnd = block.indexOf(ledger.end);
    if (ledgerStart >= 0 && ledgerEnd > ledgerStart) {
      output = replaceMarker(output, ledger, block.slice(ledgerStart, ledgerEnd + ledger.end.length));
    }
    return output;
  }
  const progressStart = text.indexOf('## Progress');
  const firstVersion = text.indexOf('### Version ', progressStart + 1);
  const ledgerStart = text.indexOf('## Execution ledger', progressStart + 1);
  const notesStart = text.indexOf('## Working notes', progressStart + 1);
  if (progressStart >= 0 && firstVersion > progressStart && ledgerStart > firstVersion) {
    // Keep the complete release-history region byte-for-byte. It is not a
    // projection and must never be recomputed from today's mutable catalog.
    const prefix = text.slice(0, progressStart).trimEnd();
    const history = text.slice(firstVersion, ledgerStart).trim();
    const suffix = notesStart > ledgerStart ? text.slice(notesStart).trimStart() : '';
    const generated = block.trimEnd().split('\n');
    const ledgerHeading = generated.findIndex((line) => line === '## Execution ledger');
    const generatedSummary = generated.slice(0, ledgerHeading).join('\n');
    const generatedLedger = generated.slice(ledgerHeading).join('\n');
    return `${prefix}\n\n${generatedSummary}\n\n${history}\n\n${generatedLedger}${suffix ? `\n\n${suffix}` : ''}\n`;
  }
  return replaceMarker(text, marker, block);
}

function replaceDependencyView(source, block) {
  const text = String(source ?? '');
  const marker = GENERATED_VIEW_MARKERS.dependency;
  if (text.includes(marker.begin)) return replaceMarker(text, marker, block);
  const start = text.indexOf('## Prompt rows');
  const end = text.indexOf('## Shared integrity gate', start + 1);
  if (start >= 0 && end > start) return `${text.slice(0, start).trimEnd()}\n\n${block.trimEnd()}\n\n${text.slice(end).trimStart()}`;
  return replaceMarker(text, marker, block);
}

export function updatePromptViews({ sources, catalog }) {
  const views = renderPromptViews(catalog);
  return {
    plan: replacePlanView(sources.plan, views.plan),
    progress: replaceProgressView(sources.progress, views.progress),
    dependency: replaceDependencyView(sources.dependency, views.dependency),
    milestones: sources.milestones,
  };
}

export function readLegacyPromptSources(cwd = process.cwd()) {
  return {
    plan: readFileSync(resolve(cwd, 'docs/IMPLEMENTATION_PLAN.md'), 'utf8'),
    progress: readFileSync(resolve(cwd, 'docs/IMPLEMENTATION_PROGRESS.md'), 'utf8'),
    dependency: readFileSync(resolve(cwd, 'docs/IMPLEMENTATION_PROMPT_DEPENDENCIES.md'), 'utf8'),
    milestones: readFileSync(resolve(cwd, 'docs/IMPLEMENTATION_MILESTONES.md'), 'utf8'),
  };
}
