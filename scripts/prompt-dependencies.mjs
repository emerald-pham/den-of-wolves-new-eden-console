#!/usr/bin/env node

import { performance } from 'node:perf_hooks';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  CATALOG_PATH,
  buildPromptDispatch,
  deriveProgressSummary,
  loadPromptCatalog,
  normalizePromptId,
  selectPrompt,
  stableCatalogJson,
  validatePromptCatalog,
} from './prompt-catalog.mjs';

/**
 * Read-only dependency lookup over the canonical prompt catalog.
 *
 * This module deliberately has no Git, coordination-file, artifact, or
 * repository-fingerprint behavior. Coordination ownership and release validation
 * are separate concerns; this command only answers the catalog question.
 */
export const DEPENDENCY_PACKET_SCHEMA_VERSION = 2;
export const COMPACT_PACKET_MAX_LINES = 80;
export const COMPACT_PACKET_MAX_BYTES = 12 * 1024;
export const DEPENDENCY_AUTHORITY_PATHS = Object.freeze({ catalog: CATALOG_PATH });

function stableJson(value, spacing = 0) {
  return JSON.stringify(JSON.parse(stableCatalogJson(value)), null, spacing);
}

function list(value) {
  return [...new Set((Array.isArray(value) ? value : [])
    .map((item) => String(item).trim().replaceAll('\\', '/').replace(/^\.\//, '').replace(/\/$/, ''))
    .filter(Boolean))].sort();
}

function catalogFromOptions({ catalog, catalogSource, cwd = process.cwd(), path = CATALOG_PATH, sources } = {}) {
  if (catalog) return catalog;
  if (catalogSource) return loadPromptCatalog({ source: catalogSource });
  if (sources?.catalog) return sources.catalog;
  if (sources?.catalogSource) return loadPromptCatalog({ source: sources.catalogSource });
  return loadPromptCatalog({ cwd, path });
}

function readinessForPrompt(dispatch, prompt) {
  if (prompt.status === 'done') return 'done';
  if (dispatch.readyQueue.some((record) => record.prompt === prompt.prompt)) return 'ready';
  if (dispatch.needsConfirmation.some((record) => record.prompt === prompt.prompt)) return 'needs-confirmation';
  if (dispatch.blocked.some((record) => record.prompt === prompt.prompt)) return 'blocked';
  return 'unknown';
}

function selectedWithCatalog(catalog, prompt) {
  const selected = selectPrompt(catalog, prompt);
  // `progress` is a packet response label retained for callers while the
  // catalog itself intentionally has only the single `status` field.
  return { ...selected, progress: selected.status };
}

/** Build an in-memory packet without writing or binding any local artifact. */
export function createDependencyPacket({
  prompt,
  catalog,
  catalogSource,
  cwd = process.cwd(),
  path = CATALOG_PATH,
  sources,
  requestedScopes = [],
  requestedClaims = [],
} = {}) {
  const sourceCatalog = catalogFromOptions({ catalog, catalogSource, cwd, path, sources });
  const errors = validatePromptCatalog(sourceCatalog);
  if (errors.length > 0) throw new Error(`Prompt catalog validation failed:\n- ${errors.join('\n- ')}`);
  const normalizedPrompt = normalizePromptId(prompt);
  if (!normalizedPrompt) throw new Error(`Invalid implementation prompt ${String(prompt)}`);
  const selected = selectedWithCatalog(sourceCatalog, normalizedPrompt);
  const dispatch = buildPromptDispatch(sourceCatalog);
  return {
    schemaVersion: DEPENDENCY_PACKET_SCHEMA_VERSION,
    source: path,
    selected,
    readiness: readinessForPrompt(dispatch, selected),
    next: dispatch.next,
    readyQueue: dispatch.readyQueue,
    needsConfirmation: dispatch.needsConfirmation,
    blocked: dispatch.blocked,
    summary: deriveProgressSummary(sourceCatalog),
    coordination: {
      requestedScopes: list(requestedScopes),
      requestedClaims: list(requestedClaims).map((claim) => claim.toLowerCase()),
    },
  };
}

function prerequisiteSummary(selected) {
  return selected.prerequisites.length
    ? selected.prerequisites.map(({ id, status }) => `${id}=${status}`).join(',')
    : 'none';
}

function evidenceLines(selected) {
  return selected.evidence.length
    ? selected.evidence.map((record) =>
      `  ${record.id} | ${record.type} | ${record.direction} | ${record.source} | ${record.language}`)
    : ['  none'];
}

function queueLines(title, records) {
  return [title, ...records.map((record, index) =>
    `${index + 1}. ${record.prompt}\tmilestone=${record.milestone}\tsequence=${record.sequence}\t${record.title}`)];
}

/** Format the same packet as compact text, a full queue, or stable JSON. */
export function formatDependencyPacket(packet, { full = false, json = false } = {}) {
  if (json) return stableJson(packet, 2);
  const selected = packet.selected;
  const compact = [
    `DEPENDENCY_PACKET v${packet.schemaVersion}`,
    `source: ${packet.source}`,
    `prompt: ${selected.prompt}`,
    `title: ${selected.title}`,
    `change_class: ${selected.changeClass}`,
    `tag: ${selected.tag}`,
    `status: ${selected.status}`,
    `readiness: ${packet.readiness}`,
    `next: ${packet.next ?? 'NONE'}`,
    `plan_definition: ${selected.planDefinition}`,
    `acceptance: ${selected.acceptance}`,
    `progress_description: ${selected.progressDescription}`,
    `releases: ${selected.releases.length ? selected.releases.join(', ') : 'none'}`,
    `hard_prompt_prerequisites: ${prerequisiteSummary(selected)}`,
    `hard_milestone: ${selected.hardMilestone}`,
    `hard_contract: ${selected.hardContract}`,
    `decision_owner: ${selected.decisionOwner}`,
    `closure_evidence_gates: ${selected.closureEvidenceGates}`,
    `sequence_rules: ${selected.sequenceRules}`,
    `release_boundaries: ${selected.releaseBoundaries}`,
    `related_consumes: ${selected.relatedConsumes}`,
    `milestone_hints: ${selected.milestoneHints}`,
    'dependency_evidence:',
    ...evidenceLines(selected),
    `coordination_scopes: ${packet.coordination.requestedScopes.length ? packet.coordination.requestedScopes.join(',') : 'none'}`,
    `coordination_claims: ${packet.coordination.requestedClaims.length ? packet.coordination.requestedClaims.join(',') : 'none'}`,
    'next_is_advisory: true',
  ];
  const compactText = `${compact.join('\n')}\n`;
  if (compact.length > COMPACT_PACKET_MAX_LINES || Buffer.byteLength(compactText) > COMPACT_PACKET_MAX_BYTES) {
    throw new Error(`Compact dependency packet exceeds ${COMPACT_PACKET_MAX_LINES} lines or ${COMPACT_PACKET_MAX_BYTES} bytes`);
  }
  if (!full) return compactText;
  const blockedLines = (title, records) => [title, ...records.map((record) =>
    `${record.prompt}\t${record.reasons.join('; ')}\t${record.title}`)];
  return `${[
    `NEXT: ${packet.next ?? 'NONE'}`,
    ...queueLines('READY_QUEUE', packet.readyQueue),
    ...blockedLines('NEEDS_CONFIRMATION', packet.needsConfirmation),
    ...blockedLines('BLOCKED', packet.blocked),
    'SELECTED_PACKET',
    ...compact,
  ].join('\n')}\n`;
}

/** Read the canonical source for callers that previously loaded many views. */
export function loadDependencySources(cwd = process.cwd(), path = CATALOG_PATH) {
  const catalogSource = readFileSync(resolve(cwd, path), 'utf8');
  return { catalogSource, catalog: loadPromptCatalog({ source: catalogSource }) };
}

function parseOptions(args) {
  const options = {};
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (!argument.startsWith('--')) throw new Error(`Unexpected argument ${argument}`);
    const name = argument.slice(2);
    if (['full', 'json', 'verify', 'measure'].includes(name)) {
      options[name] = true;
      continue;
    }
    if (name === 'cwd' || name === 'catalog' || name === 'prompt') {
      const value = args[index + 1];
      if (!value || value.startsWith('--')) throw new Error(`Missing value for ${argument}`);
      options[name] = value;
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument ${argument}`);
  }
  return options;
}

function measurePacket(packet, iterations = 25) {
  const measure = (full) => {
    const start = performance.now();
    let output = '';
    for (let index = 0; index < iterations; index += 1) output = formatDependencyPacket(packet, { full });
    return {
      lines: output.trimEnd().split('\n').length,
      bytes: Buffer.byteLength(output),
      elapsedMs: Number((performance.now() - start).toFixed(3)),
    };
  };
  return { iterations, full: measure(true), compact: measure(false) };
}

function verificationResult(catalog, dispatch) {
  return {
    source: CATALOG_PATH,
    prompts: catalog.prompts.length,
    evidence: catalog.evidence?.length ?? 0,
    sequences: catalog.sequences?.length ?? 0,
    ready: dispatch.readyQueue.length,
    needsConfirmation: dispatch.needsConfirmation.length,
    blocked: dispatch.blocked.length,
    next: dispatch.next,
  };
}

async function main() {
  const options = parseOptions(process.argv.slice(2));
  const cwd = resolve(options.cwd ?? process.cwd());
  const path = options.catalog ?? CATALOG_PATH;
  const catalog = loadPromptCatalog({ cwd, path });
  const dispatch = buildPromptDispatch(catalog);
  if (options.verify) {
    const result = verificationResult(catalog, dispatch);
    if (options.json) process.stdout.write(`${stableJson(result, 2)}\n`);
    else process.stdout.write(
      `Prompt catalog verified: ${result.prompts} prompts, ${result.evidence} evidence records, `
      + `${result.sequences} sequences; ${result.ready} ready, ${result.needsConfirmation} needs confirmation, `
      + `${result.blocked} blocked; NEXT=${result.next ?? 'NONE'}.\n`,
    );
    return;
  }
  const prompt = normalizePromptId(options.prompt);
  if (!prompt) throw new Error('coordination:dependencies requires --prompt NNN (or --verify)');
  const packet = createDependencyPacket({ prompt, catalog, path });
  if (options.measure) {
    process.stdout.write(`${stableJson(measurePacket(packet), 2)}\n`);
    return;
  }
  process.stdout.write(formatDependencyPacket(packet, { full: options.full, json: options.json }));
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(new URL('.', import.meta.url).pathname, '..', 'scripts', 'prompt-dependencies.mjs')) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
