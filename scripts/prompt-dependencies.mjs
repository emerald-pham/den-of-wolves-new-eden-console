#!/usr/bin/env node

import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import {
  lstat,
  mkdir,
  open,
  readFile,
  rename,
  unlink,
} from 'node:fs/promises';
import { tmpdir, userInfo } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';
import {
  expandPromptTargets,
  normalizeImplementationPrompt,
  parseCatalog,
} from './validate-work-registration.mjs';
import { coordinationClaimIsCrossRepository } from './coordination-throughput.mjs';

export const DEPENDENCY_PACKET_SCHEMA_VERSION = 1;
export const DEPENDENCY_RECEIPT_SCHEMA_VERSION = 2;
export const COMPACT_PACKET_MAX_LINES = 80;
export const COMPACT_PACKET_MAX_BYTES = 12 * 1024;
export const DEPENDENCY_AUTHORITY_PATHS = Object.freeze({
  plan: 'docs/IMPLEMENTATION_PLAN.md',
  progress: 'docs/IMPLEMENTATION_PROGRESS.md',
  dependency: 'docs/IMPLEMENTATION_PROMPT_DEPENDENCIES.md',
  milestones: 'docs/IMPLEMENTATION_MILESTONES.md',
});

const ACTIVE_STATUSES = new Set(['active', 'parked']);
const BUSY_STATUSES = new Set(['active', 'in-progress', 'in_progress']);
const SELECTABLE_STATUSES = new Set(['missing', 'partial']);
function sha256(value) {
  return createHash('sha256').update(String(value)).digest('hex');
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key])]));
  }
  return value;
}

function stableJson(value, spacing = 0) {
  return JSON.stringify(stableValue(value), null, spacing);
}

function list(value) {
  return [...new Set((Array.isArray(value) ? value : [])
    .map((item) => String(item).trim().replaceAll('\\', '/').replace(/^\.\//, '').replace(/\/$/, ''))
    .filter(Boolean))].sort();
}

function planCheckboxIs(planSource, prompt, checked) {
  const escaped = String(prompt).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`^- \\[${checked ? 'x' : ' '}\\] Prompt ${escaped}$`, 'm')
    .test(String(planSource ?? ''));
}

function pathOverlaps(left, right) {
  return left === '*' || right === '*' || left === right ||
    left.startsWith(`${right}/`) || right.startsWith(`${left}/`);
}

function sameRepository(entry, repositoryRoot, repositoryIdentity) {
  if (entry?.repositoryIdentity && repositoryIdentity) {
    return resolve(entry.repositoryIdentity) === resolve(repositoryIdentity);
  }
  return Boolean(entry?.repositoryRoot && repositoryRoot &&
    resolve(entry.repositoryRoot) === resolve(repositoryRoot));
}

function relevantCoordination({
  coordinationState,
  worktree,
  prompt,
  requestedScopes,
  requestedClaims,
  repositoryRoot,
  repositoryIdentity,
}) {
  const scopes = list(requestedScopes);
  const claims = list(requestedClaims).map((claim) => claim.toLowerCase());
  const conflicts = [];
  for (const entry of coordinationState?.entries ?? []) {
    if (!ACTIVE_STATUSES.has(entry?.status) || resolve(entry.worktree ?? '/') === resolve(worktree)) continue;
    const repositoryMatch = sameRepository(entry, repositoryRoot, repositoryIdentity);
    const ownerScopes = list([...(entry.scopes ?? []), ...(entry.files ?? [])]);
    const ownerClaims = list(entry.claims).map((claim) => claim.toLowerCase());
    if (repositoryMatch) {
      for (const requested of scopes) {
        for (const matched of ownerScopes.filter((scope) => pathOverlaps(requested, scope))) {
          conflicts.push({ type: 'scope', ownerId: entry.id, requested, matched });
        }
      }
    }
    for (const requested of claims) {
      if (ownerClaims.includes(requested) &&
        (repositoryMatch || coordinationClaimIsCrossRepository(requested))) {
        conflicts.push({ type: 'claim', ownerId: entry.id, requested, matched: requested });
      }
    }
    if (repositoryMatch && normalizeImplementationPrompt(entry.implementationPrompt) === prompt) {
      conflicts.push({ type: 'prompt', ownerId: entry.id, requested: prompt, matched: prompt });
    }
  }
  return conflicts.sort((left, right) => stableJson(left).localeCompare(stableJson(right)));
}

function milestoneRoute(source, hints) {
  const names = String(hints ?? '').match(/M\d+/g) ?? [];
  if (names.length === 0) return ['none'];
  const lines = String(source ?? '').split('\n');
  return names.flatMap((name) => {
    const start = lines.findIndex((line) => line.startsWith(`### Milestone ${name.slice(1)} —`));
    if (start < 0) return [`${name}: missing from IMPLEMENTATION_MILESTONES.md`];
    const end = lines.findIndex((line, index) =>
      index > start && /^### Milestone \d+ —/.test(line));
    const output = [];
    let capture = false;
    for (const line of lines.slice(start, end < 0 ? lines.length : end)) {
      if (/^### Milestone /.test(line)) {
        output.push(line);
        capture = false;
      } else if (/^\*\*(Outcome|Depends on|Primary prompt neighborhood|Exit fixture):/.test(line)) {
        output.push(line);
        capture = true;
      } else if (capture && line.trim()) {
        output.push(line);
      } else if (!line.trim()) {
        capture = false;
      }
    }
    return output;
  });
}

function dispatcher(catalog) {
  const rows = [...catalog.dependency.rows.values()];
  const order = new Map(rows.map((row, index) => [row.prompt, index]));
  const wolf = new Map(catalog.plan.wolfAttackOrder.map((prompt, index) => [prompt, index]));
  const compare = (left, right) => {
    const milestone = (row) => Number(row.milestoneHints.match(/M(\d+)/)?.[1] ?? 999);
    return milestone(left) - milestone(right) ||
      (wolf.get(left.prompt) ?? Number.MAX_SAFE_INTEGER) -
        (wolf.get(right.prompt) ?? Number.MAX_SAFE_INTEGER) ||
      order.get(left.prompt) - order.get(right.prompt);
  };
  const readyQueue = [];
  const needsConfirmation = [];
  const blocked = [];
  for (const row of rows) {
    const status = catalog.progress.get(row.prompt)?.status ?? 'unknown';
    if (status === 'done') continue;
    const errors = [];
    const prerequisites = expandPromptTargets(
      row.hardPromptPrerequisites,
      catalog.plan.definitions,
      errors,
      `Prompt ${row.prompt} hard prerequisites`,
    );
    if (errors.length > 0) throw new Error(errors.join('\n'));
    const prerequisiteStatuses = prerequisites.map((prompt) => ({
      prompt,
      status: catalog.progress.get(prompt)?.status ?? 'unknown',
    }));
    const unresolved = prerequisiteStatuses.filter(({ status: value }) => value !== 'done');
    const gates = [
      ['hard_milestone', row.hardMilestone],
      ['hard_contract', row.hardContract],
      ['decision_owner', row.decisionOwner],
    ].filter(([, value]) => value !== 'none').map(([type, value]) => ({ type, value }));
    const record = { prompt: row.prompt, title: row.title, milestone: row.milestoneHints,
      sequence: row.sequenceRules, status, prerequisiteStatuses, gates };
    if (BUSY_STATUSES.has(status)) {
      blocked.push({ ...record, reasons: [`progress=${status} (agent already working)`] });
    } else if (!SELECTABLE_STATUSES.has(status)) {
      blocked.push({ ...record, reasons: [`progress=${status} (unsupported for automatic selection)`] });
    } else if (unresolved.length > 0) {
      blocked.push({ ...record, reasons: [
        `hard_prompt_prerequisites: ${prerequisiteStatuses.map(({ prompt, status: value }) => `${prompt}=${value}`).join(',')}`,
      ] });
    } else if (gates.length > 0) {
      needsConfirmation.push({ ...record, reasons: [
        `hard_prompt_prerequisites: ${prerequisiteStatuses.length
          ? prerequisiteStatuses.map(({ prompt, status: value }) => `${prompt}=${value}`).join(',')
          : 'none'}`,
        ...gates.map(({ type, value }) => `${type}=${value} (not mechanically proven)`),
      ] });
    } else {
      readyQueue.push(record);
    }
  }
  const sortRecords = (records) => records.sort((left, right) => compare(
    catalog.dependency.rows.get(left.prompt),
    catalog.dependency.rows.get(right.prompt),
  ));
  return {
    readyQueue: sortRecords(readyQueue),
    needsConfirmation: sortRecords(needsConfirmation),
    blocked: sortRecords(blocked),
  };
}

function selectedRecord(catalog, prompt, milestoneSource) {
  const row = catalog.dependency.rows.get(prompt);
  const plan = catalog.plan.definitions.get(prompt);
  const progress = catalog.progress.get(prompt);
  if (!row || !plan || !progress) throw new Error(`Prompt ${prompt} is not canonical in every authority`);
  const errors = [];
  const prerequisites = expandPromptTargets(
    row.hardPromptPrerequisites,
    catalog.plan.definitions,
    errors,
    `Prompt ${prompt} hard prerequisites`,
  );
  if (errors.length > 0) throw new Error(errors.join('\n'));
  return {
    prompt,
    changeClass: progress.changeClass,
    tag: row.tag,
    progress: progress.status,
    title: row.title,
    indexRow: row.line,
    planDefinition: plan.definition,
    progressRow: progress.line,
    prerequisites: prerequisites.map((id) => ({ id, status: catalog.progress.get(id)?.status ?? 'unknown' })),
    hardMilestone: row.hardMilestone,
    hardContract: row.hardContract,
    decisionOwner: row.decisionOwner,
    closureEvidenceGates: row.closureEvidenceGates,
    sequenceRules: row.sequenceRules,
    releaseBoundaries: row.releaseBoundaries,
    relatedConsumes: row.relatedConsumes,
    milestoneHints: row.milestoneHints,
    milestoneRoute: milestoneRoute(milestoneSource, row.milestoneHints),
    evidence: row.evidenceIds === 'none' ? [] : row.evidenceIds.split(';').map((id) => ({
      id,
      ...catalog.dependency.evidence.get(id),
    })),
  };
}

export function createDependencyPacket({
  prompt,
  sources,
  binding,
  coordinationState = { entries: [] },
  requestedScopes = [],
  requestedClaims = [],
  repositoryRoot = binding?.worktree,
  repositoryIdentity,
} = {}) {
  const normalizedPrompt = normalizeImplementationPrompt(prompt);
  if (!normalizedPrompt) throw new Error(`Invalid implementation prompt ${String(prompt)}`);
  const errors = [];
  const catalog = parseCatalog({
    planSource: sources?.plan,
    progressSource: sources?.progress,
    dependencySource: sources?.dependency,
  }, errors);
  if (errors.length > 0) throw new Error(`Dependency authority validation failed:\n- ${errors.join('\n- ')}`);
  const dispatch = dispatcher(catalog);
  const selected = selectedRecord(catalog, normalizedPrompt, sources?.milestones);
  const normalizedBinding = {
    owner: String(binding?.owner ?? ''),
    worktree: resolve(String(binding?.worktree ?? '')),
    branch: String(binding?.branch ?? ''),
    prompt: normalizedPrompt,
    changeClass: String(binding?.changeClass ?? selected.changeClass),
    startBranchSha: String(binding?.startBranchSha ?? '').toLowerCase(),
    startMainSha: String(binding?.startMainSha ?? '').toLowerCase(),
    mainSha: String(binding?.mainSha ?? '').toLowerCase(),
  };
  if (!normalizedBinding.owner || !normalizedBinding.branch ||
    [normalizedBinding.startBranchSha, normalizedBinding.startMainSha, normalizedBinding.mainSha]
      .some((sha) => !/^[0-9a-f]{40}$/.test(sha))) {
    throw new Error('Dependency receipt binding requires owner, branch, and exact start/current Git SHAs');
  }
  if (normalizedBinding.changeClass !== selected.changeClass) {
    throw new Error(`Prompt ${normalizedPrompt} change class ${selected.changeClass} does not match receipt binding ${normalizedBinding.changeClass}`);
  }
  const scopes = list(requestedScopes);
  const claims = list(requestedClaims).map((claim) => claim.toLowerCase());
  const selectedReady = dispatch.readyQueue.some((record) => record.prompt === normalizedPrompt);
  const selectedOwnedInProgress = selected.progress === 'in-progress' &&
    (coordinationState?.entries ?? []).some((entry) =>
      ACTIVE_STATUSES.has(entry?.status) && resolve(entry.worktree ?? '/') === normalizedBinding.worktree &&
      normalizeImplementationPrompt(entry.implementationPrompt) === normalizedPrompt);
  if (!selectedReady && !selectedOwnedInProgress) {
    const record = [...dispatch.needsConfirmation, ...dispatch.blocked]
      .find((candidate) => candidate.prompt === normalizedPrompt);
    throw new Error(
      `Prompt ${normalizedPrompt} is not mechanically ready: ${record?.reasons?.join('; ') ?? `progress=${selected.progress}`}`,
    );
  }
  const conflicts = relevantCoordination({ coordinationState, worktree: normalizedBinding.worktree,
    prompt: normalizedPrompt, requestedScopes: scopes, requestedClaims: claims,
    repositoryRoot, repositoryIdentity });
  const fingerprintInputs = {
    mainSha: normalizedBinding.mainSha,
    authority: {
      plan: sha256(sources.plan),
      progress: sha256(sources.progress),
      dependency: sha256(sources.dependency),
      milestones: sha256(sources.milestones),
    },
    selectedEvidence: selected.evidence.map(({ id, type, direction, source, language }) =>
      ({ id, type, direction, source, language })),
    selectedMilestoneRoute: selected.milestoneRoute,
    relevantCoordination: conflicts,
  };
  return {
    schemaVersion: DEPENDENCY_PACKET_SCHEMA_VERSION,
    selected,
    readiness: selectedReady ? 'ready' : 'active-owner',
    next: dispatch.readyQueue[0]?.prompt ?? null,
    ...dispatch,
    coordination: { requestedScopes: scopes, requestedClaims: claims, conflicts },
    binding: normalizedBinding,
    fingerprintInputs,
    fingerprint: sha256(stableJson(fingerprintInputs)),
  };
}

function prerequisiteSummary(selected) {
  return selected.prerequisites.length
    ? selected.prerequisites.map(({ id, status }) => `${id}=${status}`).join(',')
    : 'none';
}

function queueLines(title, records) {
  return [title, ...records.map((record, index) =>
    `${index + 1}. ${record.prompt}\tmilestone=${record.milestone}\tsequence=${record.sequence}\t${record.title}`)];
}

export function formatDependencyPacket(packet, { full = false, json = false } = {}) {
  if (json) return `${stableJson(packet, 2)}\n`;
  const selected = packet.selected;
  const compact = [
    `DEPENDENCY_PACKET v${packet.schemaVersion}`,
    `prompt: ${selected.prompt}`,
    `change_class: ${selected.changeClass}`,
    `status: ${selected.progress}`,
    `next: ${packet.next ?? 'NONE'}`,
    `fingerprint: ${packet.fingerprint}`,
    `index_row: ${selected.indexRow}`,
    `plan_definition: ${selected.planDefinition}`,
    `progress_row: ${selected.progressRow}`,
    `hard_prompt_prerequisites: ${prerequisiteSummary(selected)}`,
    `hard_milestone: ${selected.hardMilestone}`,
    `hard_contract: ${selected.hardContract}`,
    `decision_owner: ${selected.decisionOwner}`,
    `closure_evidence_gates: ${selected.closureEvidenceGates}`,
    `sequence_rules: ${selected.sequenceRules}`,
    `release_boundaries: ${selected.releaseBoundaries}`,
    `related_consumes: ${selected.relatedConsumes}`,
    `milestone_hints: ${selected.milestoneHints}`,
    'milestone_route:',
    ...selected.milestoneRoute.map((line) => `  ${line}`),
    'dependency_evidence:',
    ...(selected.evidence.length ? selected.evidence.map((record) =>
      `  ${record.id} | ${record.type} | ${record.direction} | ${record.source} | ${record.language}`) : ['  none']),
    `coordination_conflicts: ${packet.coordination.conflicts.length}`,
    'coordination_claim_reminder: NEXT is advisory for concurrency; claim only dependency-ready, manual-gate-clear, conflict-free work.',
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
    'CONTEXT_PACKET',
    ...compact,
  ].join('\n')}\n`;
}

export function dependencyReceiptPath(worktree, prompt) {
  const normalizedPrompt = normalizeImplementationPrompt(prompt);
  if (!normalizedPrompt) throw new Error(`Invalid implementation prompt ${String(prompt)}`);
  return resolve(worktree, '.codex', 'dependency-receipts', `${normalizedPrompt}.json`);
}

function receiptRecord(packet, { issuance, completion } = {}) {
  const record = {
    schemaVersion: DEPENDENCY_RECEIPT_SCHEMA_VERSION,
    prompt: packet.selected.prompt,
    changeClass: packet.selected.changeClass,
    binding: packet.binding,
    requestedScopes: packet.coordination.requestedScopes,
    requestedClaims: packet.coordination.requestedClaims,
    fingerprint: packet.fingerprint,
    fingerprintInputs: packet.fingerprintInputs,
    ...(completion
      ? { policy: 'completion-refreshed', completion }
      : { issuance }),
  };
  return { ...record, contentDigest: sha256(stableJson(record)) };
}

function newReceiptIssuance() {
  return {
    schemaVersion: 1,
    issuedAt: new Date().toISOString(),
    nonce: randomBytes(32).toString('hex'),
  };
}

async function rejectSymlink(path, label, { allowMissing = false } = {}) {
  try {
    if ((await lstat(path)).isSymbolicLink()) throw new Error(`${label} must not be a symlink`);
  } catch (error) {
    if (allowMissing && error?.code === 'ENOENT') return;
    throw error;
  }
}

export async function writeDependencyReceipt(packet) {
  if (packet.coordination.conflicts.length > 0) {
    throw new Error('Cannot write dependency receipt while relevant coordination conflicts exist');
  }
  const path = dependencyReceiptPath(packet.binding.worktree, packet.selected.prompt);
  const directory = dirname(path);
  await rejectSymlink(resolve(packet.binding.worktree, '.codex'), 'Dependency receipt parent directory', {
    allowMissing: true,
  });
  await mkdir(directory, { recursive: true, mode: 0o700 });
  await rejectSymlink(resolve(packet.binding.worktree, '.codex'), 'Dependency receipt parent directory');
  await rejectSymlink(directory, 'Dependency receipt directory');
  await rejectSymlink(path, 'Dependency receipt', { allowMissing: true });
  const temporaryPath = `${path}.${process.pid}.${randomUUID()}.tmp`;
  const handle = await open(temporaryPath, 'wx', 0o600);
  try {
    await handle.writeFile(`${stableJson(receiptRecord(packet, { issuance: newReceiptIssuance() }), 2)}\n`, 'utf8');
    await handle.close();
    await rename(temporaryPath, path);
  } catch (error) {
    await handle.close().catch(() => undefined);
    await unlink(temporaryPath).catch(() => undefined);
    throw error;
  }
  return path;
}

function validIsoInstant(value) {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value)) &&
    new Date(value).toISOString() === value;
}

function validateReceiptShape(receipt) {
  const digest = receipt?.contentDigest;
  const { contentDigest: _ignored, ...unsigned } = receipt ?? {};
  const strictIssuance = receipt?.policy === undefined && receipt?.completion === undefined &&
    receipt?.issuance?.schemaVersion === 1 &&
    /^[0-9a-f]{64}$/.test(receipt?.issuance?.nonce ?? '') &&
    validIsoInstant(receipt?.issuance?.issuedAt);
  const consumed = receipt?.policy === 'completion-refreshed' &&
    receipt?.issuance === undefined && receipt?.completion &&
    !stableJson(receipt.completion).includes('"nonce"');
  if (receipt?.schemaVersion === 1) {
    throw new Error('Dependency receipt uses legacy schema version 1');
  }
  if (receipt?.schemaVersion !== DEPENDENCY_RECEIPT_SCHEMA_VERSION ||
    (!strictIssuance && !consumed) ||
    typeof digest !== 'string' || sha256(stableJson(unsigned)) !== digest) {
    throw new Error('Dependency receipt is malformed or its content digest does not match');
  }
}

export async function readDependencyReceipt(binding) {
  const path = dependencyReceiptPath(binding?.worktree, binding?.prompt);
  let source;
  try {
    await rejectSymlink(resolve(binding.worktree, '.codex'), 'Dependency receipt parent directory');
    await rejectSymlink(dirname(path), 'Dependency receipt directory');
    await rejectSymlink(path, 'Dependency receipt');
    source = await readFile(path, 'utf8');
  } catch (error) {
    if (error?.code === 'ENOENT') throw new Error(`Dependency receipt is missing at ${path}`);
    throw error;
  }
  let receipt;
  try {
    receipt = JSON.parse(source);
  } catch {
    throw new Error(`Dependency receipt is malformed at ${path}`);
  }
  validateReceiptShape(receipt);
  return receipt;
}

function assertReceiptMatchesPacket(receipt, packet) {
  const expected = receiptRecord(packet, { issuance: receipt?.issuance });
  if (stableJson(receipt) !== stableJson(expected)) {
    throw new Error('Dependency receipt binding, authority, main, evidence, or relevant coordination fingerprint mismatch');
  }
}

export async function validateDependencyReceipt(options) {
  const packet = createDependencyPacket(options);
  if (packet.coordination.conflicts.length > 0) {
    throw new Error('Dependency receipt is stale: relevant coordination conflicts exist');
  }
  const receipt = await readDependencyReceipt(packet.binding);
  if (receipt.policy !== undefined) {
    throw new Error('Dependency receipt is already completion-refreshed');
  }
  assertReceiptMatchesPacket(receipt, packet);
  return receipt;
}

function git(cwd, args) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

function gitMaybe(cwd, args) {
  try {
    return git(cwd, args);
  } catch {
    return null;
  }
}

function authorityIdentity(sources) {
  return Object.fromEntries(Object.keys(DEPENDENCY_AUTHORITY_PATHS).map((key) =>
    [key, sha256(sources?.[key])],
  ));
}

function authoritySourcesAtCommit(cwd, commit) {
  const normalized = String(commit ?? '').toLowerCase();
  if (!/^[0-9a-f]{40}$/.test(normalized)) {
    throw new Error('Completion receipt anchor requires an exact Git SHA');
  }
  return Object.fromEntries(Object.entries(DEPENDENCY_AUTHORITY_PATHS).map(([key, path]) => {
    try {
      return [key, execFileSync('git', ['show', `${normalized}:${path}`], {
        cwd,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      })];
    } catch {
      throw new Error(`Completion receipt cannot read ${path} at anchor ${normalized}`);
    }
  }));
}

function requireAncestor(cwd, ancestor, descendant = 'HEAD') {
  try {
    git(cwd, ['merge-base', '--is-ancestor', ancestor, descendant]);
  } catch {
    throw new Error(`Completion receipt anchor ${ancestor} is not an ancestor of ${descendant}`);
  }
}

function completionEntry(entry, binding) {
  const fields = [
    ['id', entry?.id],
    ['worktree', entry?.worktree],
    ['branchName', entry?.branchName],
    ['implementationPrompt', entry?.implementationPrompt],
    ['changeClass', entry?.changeClass],
    ['startBranchSha', entry?.startBranchSha],
    ['startMainSha', entry?.startMainSha],
  ];
  if (entry?.status !== 'active' || fields.some(([, value]) => !String(value ?? '').trim())) {
    throw new Error('Completion receipt requires one exact active coordination entry');
  }
  const expected = {
    worktree: resolve(binding.worktree),
    branchName: binding.branch,
    implementationPrompt: binding.prompt,
    changeClass: binding.changeClass,
    startBranchSha: binding.startBranchSha,
    startMainSha: binding.startMainSha,
  };
  for (const [field, value] of Object.entries(expected)) {
    if (String(entry[field] ?? '').toLowerCase() !== String(value).toLowerCase()) {
      throw new Error(`Completion receipt ${field} does not match the active entry binding`);
    }
  }
  return Object.fromEntries(fields);
}

function replaceExactlyOnce(source, from, to, label) {
  const occurrences = String(source).split(from).length - 1;
  if (occurrences !== 1) throw new Error(`Completion receipt requires exactly one ${label} transition`);
  return String(source).replace(from, to);
}

function canonicalProgressSummaries(source) {
  const completion = String(source).match(/^\*\*(\d+) \/ (\d+) prompts complete \((\d+\.\d+)%\)\*\*$/m);
  const breakdown = String(source).match(
    /^Status breakdown: \*\*(\d+) done · (\d+) partial · (\d+) active · (\d+) missing\*\*\.$/m,
  );
  if (!completion || !breakdown) {
    throw new Error('Completion receipt requires canonical progress aggregate metadata');
  }
  const completed = Number(completion[1]) + 1;
  const total = Number(completion[2]);
  const done = Number(breakdown[1]) + 1;
  const partial = Number(breakdown[2]) - 1;
  if (completed !== done || partial < 0 ||
    completed + partial + Number(breakdown[3]) + Number(breakdown[4]) !== total) {
    throw new Error('Completion receipt progress aggregate metadata is inconsistent');
  }
  const expectedCompletion = `**${completed} / ${total} prompts complete (${((completed / total) * 100).toFixed(2)}%)**`;
  const expectedBreakdown =
    `Status breakdown: **${done} done · ${partial} partial · ${breakdown[3]} active · ${breakdown[4]} missing**.`;
  return replaceExactlyOnce(
    replaceExactlyOnce(source, completion[0], expectedCompletion, 'progress completion aggregate'),
    breakdown[0], expectedBreakdown, 'progress status aggregate',
  );
}

function progressAggregateMetadata(source) {
  const completion = String(source).match(/^\*\*\d+ \/ \d+ prompts complete \(\d+\.\d+%\)\*\*$/m);
  const breakdown = String(source).match(
    /^Status breakdown: \*\*\d+ done · \d+ partial · \d+ active · \d+ missing\*\*\.$/m,
  );
  if (!completion || !breakdown) {
    throw new Error('Completion receipt requires canonical progress aggregate metadata');
  }
  return `${completion[0]}\n${breakdown[0]}`;
}

function normalizeCompletionProgressMetadata(source, prompt) {
  const escaped = String(prompt).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return String(source)
    .replace(/^\*\*\d+ \/ \d+ prompts complete \(\d+\.\d+%\)\*\*$/m, '<completion-aggregate>')
    .replace(/^Status breakdown: \*\*\d+ done · \d+ partial · \d+ active · \d+ missing\*\*\.$/m, '<status-aggregate>')
    .replace(
      new RegExp(
        `Prompt ${escaped} is (?:partial|done)[\\s\\S]*?(?=Prompt \\d{3}[a-z]*\\s+(?:is|remains)\\b|P\\d{3}[a-z]* remains\\b)`,
        'i',
      ),
      '<prompt-completion-metadata>',
    )
    .replace(
      new RegExp(`^(\\| ${escaped} \\| (?:partial|done) \\| [^|]+ \\| [^|]+\\|).*$`, 'm'),
      '$1<completion-row-metadata>',
    );
}

function canonicalCompletionTransition(before, after, prompt) {
  const normalizedPrompt = normalizeImplementationPrompt(prompt);
  const beforeCatalogErrors = [];
  const beforeCatalog = parseCatalog({
    planSource: before.plan,
    progressSource: before.progress,
    dependencySource: before.dependency,
  }, beforeCatalogErrors);
  if (beforeCatalogErrors.length > 0) {
    throw new Error(`Completion receipt anchor authority is invalid: ${beforeCatalogErrors.join('; ')}`);
  }
  const beforeSelected = selectedRecord(beforeCatalog, normalizedPrompt, before.milestones);
  if (beforeSelected.progress !== 'partial' || !planCheckboxIs(before.plan, normalizedPrompt, false)) {
    throw new Error(`Completion receipt anchor must show Prompt ${normalizedPrompt} as partial and unchecked`);
  }
  const expectedPlan = replaceExactlyOnce(
    before.plan,
    `- [ ] Prompt ${normalizedPrompt}`,
    `- [x] Prompt ${normalizedPrompt}`,
    'plan checkbox',
  );
  const expectedProgress = canonicalProgressSummaries(replaceExactlyOnce(
    before.progress,
    `| ${normalizedPrompt} | partial |`,
    `| ${normalizedPrompt} | done |`,
    'progress status',
  ));
  const expectedDependency = replaceExactlyOnce(
    before.dependency,
    `| ${normalizedPrompt} | ${beforeSelected.tag} | partial |`,
    `| ${normalizedPrompt} | ${beforeSelected.tag} | done |`,
    'dependency status',
  );
  if (after.plan !== expectedPlan ||
    progressAggregateMetadata(after.progress) !== progressAggregateMetadata(expectedProgress) ||
    normalizeCompletionProgressMetadata(after.progress, normalizedPrompt) !==
      normalizeCompletionProgressMetadata(expectedProgress, normalizedPrompt) ||
    after.dependency !== expectedDependency || after.milestones !== before.milestones) {
    throw new Error(
      `Completion receipt permits only Prompt ${normalizedPrompt}'s canonical partial-to-done authority transition`,
    );
  }
  return {
    prompt: normalizedPrompt,
    plan: { before: sha256(before.plan), after: sha256(after.plan) },
    progress: { before: sha256(before.progress), after: sha256(after.progress) },
    dependency: { before: sha256(before.dependency), after: sha256(after.dependency) },
    milestones: { before: sha256(before.milestones), after: sha256(after.milestones) },
  };
}

function completionPacket(context, completion) {
  const errors = [];
  const catalog = parseCatalog({
    planSource: context.sources?.plan,
    progressSource: context.sources?.progress,
    dependencySource: context.sources?.dependency,
  }, errors);
  if (errors.length > 0) throw new Error(`Dependency authority validation failed:\n- ${errors.join('\n- ')}`);
  const selected = selectedRecord(catalog, context.binding.prompt, context.sources?.milestones);
  if (selected.progress !== 'done' || !planCheckboxIs(context.sources?.plan, selected.prompt, true)) {
    throw new Error(`Completion receipt requires canonical checked/done status for Prompt ${selected.prompt}`);
  }
  const conflicts = relevantCoordination({
    coordinationState: context.coordinationState,
    worktree: context.binding.worktree,
    prompt: context.binding.prompt,
    requestedScopes: context.requestedScopes,
    requestedClaims: context.requestedClaims,
    repositoryRoot: context.repositoryRoot,
    repositoryIdentity: context.repositoryIdentity,
  });
  if (conflicts.length > 0) throw new Error('Completion receipt is stale: relevant coordination conflicts exist');
  const fingerprintInputs = {
    mainSha: context.binding.mainSha,
    authority: authorityIdentity(context.sources),
    selected: {
      prompt: selected.prompt,
      progress: selected.progress,
      changeClass: selected.changeClass,
      tag: selected.tag,
    },
    relevantCoordination: conflicts,
    completion,
  };
  return {
    selected,
    coordination: {
      requestedScopes: list(context.requestedScopes),
      requestedClaims: list(context.requestedClaims).map((claim) => claim.toLowerCase()),
    },
    binding: context.binding,
    fingerprintInputs,
    fingerprint: sha256(stableJson(fingerprintInputs)),
  };
}

function completionReceiptRecord(packet) {
  return receiptRecord(packet, { completion: packet.fingerprintInputs.completion });
}

async function writeCompletionReceipt(packet) {
  const path = dependencyReceiptPath(packet.binding.worktree, packet.selected.prompt);
  const directory = dirname(path);
  await rejectSymlink(resolve(packet.binding.worktree, '.codex'), 'Dependency receipt parent directory');
  await rejectSymlink(directory, 'Dependency receipt directory');
  await rejectSymlink(path, 'Dependency receipt');
  const temporaryPath = `${path}.${process.pid}.${randomUUID()}.tmp`;
  const handle = await open(temporaryPath, 'wx', 0o600);
  try {
    await handle.writeFile(`${stableJson(completionReceiptRecord(packet), 2)}\n`, 'utf8');
    await handle.close();
    await rename(temporaryPath, path);
  } catch (error) {
    await handle.close().catch(() => undefined);
    await unlink(temporaryPath).catch(() => undefined);
    throw error;
  }
}

function matchingAnchorCommit(cwd, entry, receipt) {
  const authority = receipt?.fingerprintInputs?.authority;
  if (!authority || Object.values(authority).some((value) =>
    typeof value !== 'string' || !/^[0-9a-f]{64}$/.test(value))) {
    throw new Error('Completion receipt prior authority fingerprint is malformed');
  }
  requireAncestor(cwd, entry.startBranchSha);
  const commits = [...new Set([
    ...git(cwd, ['rev-list', '--topo-order', `${entry.startBranchSha}..HEAD`]).split('\n').filter(Boolean),
    entry.startBranchSha,
  ])];
  const anchor = commits.find((commit) =>
    stableJson(authorityIdentity(authoritySourcesAtCommit(cwd, commit))) === stableJson(authority));
  if (!anchor) throw new Error('Completion receipt prior authority has no derivable active-branch anchor');
  return anchor;
}

function strictPriorPolicy(policy, prompt, exactLegacyMigration = false) {
  return policy === 'required' || (
    policy === 'legacy-refreshed' && exactLegacyMigration === true &&
    ['012', '014'].includes(normalizeImplementationPrompt(prompt))
  );
}

function validatePriorReceipt(context, entry, receipt, exactLegacyMigration) {
  const metadata = entry?.dependencyReceipt;
  if (!strictPriorPolicy(metadata?.policy, context.binding.prompt, exactLegacyMigration) ||
    receipt?.policy || receipt?.completion) {
    throw new Error('Completion receipt requires one prior strict or exact migrated receipt');
  }
  const expectedMetadata = dependencyReceiptMetadata(receipt, metadata.policy);
  if (stableJson(metadata) !== stableJson(expectedMetadata)) {
    throw new Error('Completion receipt predecessor issuance commitment or digest does not match the active entry');
  }
  const anchor = matchingAnchorCommit(context.binding.worktree, entry, receipt);
  const anchorSources = authoritySourcesAtCommit(context.binding.worktree, anchor);
  const anchorPacket = createDependencyPacket({ ...context, sources: anchorSources });
  assertReceiptMatchesPacket(receipt, anchorPacket);
  return { anchor, sources: anchorSources, metadata };
}

function completionMetadataMatchesEntry(receipt, entry) {
  const expected = dependencyReceiptMetadata(receipt, 'completion-refreshed');
  if (stableJson(entry?.dependencyReceipt) !== stableJson(expected)) {
    throw new Error('Completion receipt consumed metadata does not match the active entry');
  }
}

function validateCompletionReceipt(context, entry, receipt, exactLegacyMigration, { pendingMetadata } = {}) {
  if (receipt?.policy !== 'completion-refreshed' || !receipt?.completion) {
    throw new Error('Completion receipt is missing a consumed predecessor lineage');
  }
  const completion = receipt.completion;
  const entryIdentity = completionEntry(entry, context.binding);
  if (stableJson(completion.entry) !== stableJson(entryIdentity) ||
    !strictPriorPolicy(completion?.prior?.policy, context.binding.prompt, exactLegacyMigration)) {
    throw new Error('Completion receipt entry or prior-receipt lineage is malformed');
  }
  if (pendingMetadata) {
    const predecessor = {
      schemaVersion: pendingMetadata.schemaVersion,
      policy: pendingMetadata.policy,
      artifactPath: pendingMetadata.artifactPath,
      prompt: pendingMetadata.prompt,
      changeClass: pendingMetadata.changeClass,
      fingerprint: pendingMetadata.fingerprint,
      contentDigest: pendingMetadata.contentDigest,
      issuance: pendingMetadata.issuance,
    };
    if (stableJson(completion.prior) !== stableJson(predecessor)) {
      throw new Error('Completion receipt predecessor issuance commitment or digest does not match the active entry');
    }
  } else {
    completionMetadataMatchesEntry(receipt, entry);
  }
  const anchor = String(completion?.anchor?.commitSha ?? '').toLowerCase();
  requireAncestor(context.binding.worktree, entry.startBranchSha);
  requireAncestor(context.binding.worktree, anchor);
  const anchorSources = authoritySourcesAtCommit(context.binding.worktree, anchor);
  if (stableJson(completion.anchor.authority) !== stableJson(authorityIdentity(anchorSources))) {
    throw new Error('Completion receipt anchor authority drifted');
  }
  const priorPacket = createDependencyPacket({ ...context, sources: anchorSources });
  if (completion.prior.fingerprint !== priorPacket.fingerprint) {
    throw new Error('Completion receipt consumed predecessor does not match the active binding');
  }
  const transition = canonicalCompletionTransition(anchorSources, context.sources, context.binding.prompt);
  if (stableJson(completion.transition) !== stableJson(transition)) {
    throw new Error('Completion receipt canonical transition drifted');
  }
  const expected = completionReceiptRecord(completionPacket(context, completion));
  if (stableJson(receipt) !== stableJson(expected)) {
    throw new Error('Completion receipt binding, authority, main, scope, claim, or transition mismatch');
  }
  return receipt;
}

export async function validateOrRefreshCompletionDependencyReceipt({
  context,
  entry,
  exactLegacyMigration = false,
  allowRefresh = false,
  allowPending = false,
} = {}) {
  const active = (context?.coordinationState?.entries ?? []).find((candidate) => candidate?.id === entry?.id);
  if (!active || active.status !== 'active') {
    throw new Error('Completion receipt requires an active, non-terminal coordination entry');
  }
  if (stableJson(completionEntry(active, context.binding)) !== stableJson(completionEntry(entry, context.binding)) ||
    stableJson(active.dependencyReceipt) !== stableJson(entry.dependencyReceipt)) {
    throw new Error('Completion receipt requires the exact active coordination entry');
  }
  const receipt = await readDependencyReceipt(context.binding);
  if (receipt?.policy === 'completion-refreshed') {
    if (allowRefresh) {
      throw new Error('Completion receipt has already consumed its predecessor; a second refresh is forbidden');
    }
    return validateCompletionReceipt(context, active, receipt, exactLegacyMigration);
  }
  if (!allowRefresh && !allowPending) {
    throw new Error('Completion receipt consumption is permitted only at authoritative validation');
  }
  const prior = validatePriorReceipt(context, active, receipt, exactLegacyMigration);
  const transition = canonicalCompletionTransition(prior.sources, context.sources, context.binding.prompt);
  if (!allowRefresh) return receipt;
  const completion = {
    entry: completionEntry(active, context.binding),
    prior: prior.metadata,
    anchor: {
      commitSha: prior.anchor,
      authority: authorityIdentity(prior.sources),
    },
    transition,
    consumedAt: new Date().toISOString(),
  };
  const packet = completionPacket(context, completion);
  await writeCompletionReceipt(packet);
  return validateCompletionReceipt(
    context,
    active,
    await readDependencyReceipt(context.binding),
    exactLegacyMigration,
    { pendingMetadata: prior.metadata },
  );
}

export function resolveCurrentMainSha(cwd = process.cwd()) {
  const localMain = gitMaybe(cwd, ['rev-parse', '--verify', 'main^{commit}']);
  const originMain = gitMaybe(cwd, ['rev-parse', '--verify', 'origin/main^{commit}']);
  if (localMain && originMain && localMain !== originMain) {
    throw new Error(`Local main ${localMain} and origin/main ${originMain} differ; reconcile current main before refreshing the dependency receipt`);
  }
  const mainSha = originMain ?? localMain;
  if (!mainSha || !/^[0-9a-f]{40}$/.test(mainSha)) {
    throw new Error('Unable to resolve a trusted current main or origin/main commit for the dependency receipt');
  }
  return mainSha;
}

export async function loadDependencySources(cwd = process.cwd()) {
  return Object.fromEntries(await Promise.all(Object.entries(DEPENDENCY_AUTHORITY_PATHS)
    .map(async ([key, path]) => [key, await readFile(resolve(cwd, path), 'utf8')])));
}

export async function dependencyReceiptContextForEntry(entry, coordinationState, {
  cwd = process.cwd(),
  requestedScopes = entry?.scopes ?? entry?.requestedScopes ?? [],
  requestedClaims = entry?.claims ?? entry?.requestedClaims ?? [],
  mainSha,
} = {}) {
  if (!entry?.implementationPrompt || !entry?.changeClass || !entry?.worktree || !entry?.branchName ||
    !entry?.startBranchSha || !entry?.startMainSha) {
    throw new Error('Coordination entry is missing dependency receipt prompt/class/worktree/branch/start binding');
  }
  const root = resolve(cwd);
  if (resolve(entry.worktree) !== root) {
    throw new Error(`Dependency receipt worktree mismatch: entry owns ${entry.worktree}, not ${root}`);
  }
  return {
    prompt: entry.implementationPrompt,
    sources: await loadDependencySources(root),
    coordinationState,
    requestedScopes,
    requestedClaims,
    repositoryRoot: entry.repositoryRoot ?? root,
    repositoryIdentity: entry.repositoryIdentity,
    binding: {
      owner: `${userInfo().username}:${process.getuid?.() ?? 'unknown'}`,
      worktree: root,
      branch: entry.branchName,
      prompt: entry.implementationPrompt,
      changeClass: entry.changeClass,
      startBranchSha: entry.startBranchSha,
      startMainSha: entry.startMainSha,
      mainSha: mainSha ?? resolveCurrentMainSha(root),
    },
  };
}

export function dependencyReceiptMetadata(receipt, policy = 'required') {
  const base = {
    schemaVersion: DEPENDENCY_RECEIPT_SCHEMA_VERSION,
    policy,
    artifactPath: `.codex/dependency-receipts/${receipt.prompt}.json`,
    prompt: receipt.prompt,
    changeClass: receipt.changeClass,
    fingerprint: receipt.fingerprint,
    contentDigest: receipt.contentDigest,
  };
  if (policy === 'completion-refreshed') {
    if (receipt?.policy !== 'completion-refreshed' || !receipt?.completion?.prior) {
      throw new Error('Completion dependency receipt metadata requires a consumed predecessor');
    }
    return {
      ...base,
      predecessor: receipt.completion.prior,
      consumedAt: receipt.completion.consumedAt,
      anchorCommitSha: receipt.completion.anchor?.commitSha,
    };
  }
  if (!strictPriorPolicy(policy, receipt?.prompt, true) ||
    receipt?.policy !== undefined || receipt?.completion !== undefined) {
    throw new Error('Strict dependency receipt metadata requires one issued receipt');
  }
  return {
    ...base,
    issuance: {
      schemaVersion: receipt.issuance.schemaVersion,
      issuedAt: receipt.issuance.issuedAt,
      nonceCommitment: sha256(receipt.issuance.nonce),
    },
  };
}

function coordinationPath() {
  return resolve(process.env.CODEX_COORDINATION_FILE || process.env.DOW_EMULATOR_COORDINATION_FILE ||
    resolve(tmpdir(), 'den-of-wolves-new-eden-coordination.json'));
}

async function loadCoordinationState() {
  try {
    return JSON.parse(await readFile(coordinationPath(), 'utf8'));
  } catch (error) {
    if (error?.code === 'ENOENT') return { entries: [] };
    throw error;
  }
}

function parseOptions(args) {
  const options = {};
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (!argument.startsWith('--')) throw new Error(`Unexpected argument ${argument}`);
    const name = argument.slice(2);
    if (['full', 'json', 'check', 'verify', 'measure'].includes(name)) {
      options[name] = true;
      continue;
    }
    const value = args[index + 1];
    if (!value || value.startsWith('--')) throw new Error(`Missing value for ${argument}`);
    options[name] = value;
    index += 1;
  }
  return options;
}

function csv(value) {
  return typeof value === 'string' ? value.split(',').map((item) => item.trim()).filter(Boolean) : [];
}

async function cliContext(cwd, options) {
  const [sources, coordinationState] = await Promise.all([loadDependencySources(cwd), loadCoordinationState()]);
  const root = resolve(git(cwd, ['rev-parse', '--show-toplevel']));
  const identity = resolve(git(cwd, ['rev-parse', '--path-format=absolute', '--git-common-dir']));
  const currentBranch = git(cwd, ['branch', '--show-current']);
  if (!currentBranch) throw new Error('Dependency receipt requires an attached branch');
  const currentHead = git(cwd, ['rev-parse', 'HEAD']);
  const mainSha = resolveCurrentMainSha(cwd);
  const entry = options.entry
    ? coordinationState.entries?.find((candidate) => candidate.id === options.entry)
    : null;
  if (options.entry && !entry) throw new Error(`No coordination entry found for ${options.entry}`);
  const prompt = normalizeImplementationPrompt(options.prompt ?? entry?.implementationPrompt);
  if (!prompt) throw new Error('coordination:dependencies requires --prompt NNN or --entry ID');
  const catalogErrors = [];
  const catalog = parseCatalog({ planSource: sources.plan, progressSource: sources.progress,
    dependencySource: sources.dependency }, catalogErrors);
  if (catalogErrors.length > 0) throw new Error(catalogErrors.join('\n'));
  const changeClass = catalog.progress.get(prompt)?.changeClass;
  const requestedScopes = list([
    ...(entry?.scopes?.length ? entry.scopes : entry?.requestedScopes ?? []),
    ...csv(options.scope),
  ]);
  const requestedClaims = list([
    ...(entry?.claims?.length ? entry.claims : entry?.requestedClaims ?? []),
    ...csv(options.claims),
  ]);
  return {
    prompt,
    sources,
    coordinationState,
    requestedScopes,
    requestedClaims,
    repositoryRoot: root,
    repositoryIdentity: identity,
    binding: {
      owner: `${userInfo().username}:${process.getuid?.() ?? 'unknown'}`,
      worktree: root,
      branch: currentBranch,
      prompt,
      changeClass,
      startBranchSha: entry?.startBranchSha ?? currentHead,
      startMainSha: entry?.startMainSha ?? mainSha,
      mainSha,
    },
  };
}

function measurePacket(packet, iterations = 25) {
  const measure = (full) => {
    const start = performance.now();
    let output = '';
    for (let index = 0; index < iterations; index += 1) {
      output = formatDependencyPacket(packet, { full });
    }
    return {
      lines: output.trimEnd().split('\n').length,
      bytes: Buffer.byteLength(output),
      elapsedMs: Number((performance.now() - start).toFixed(3)),
    };
  };
  return { fixture: 'current checked-out authorities', iterations, oldFull: measure(true), compact: measure(false) };
}

async function main() {
  const options = parseOptions(process.argv.slice(2));
  const cwd = resolve(process.cwd());
  if (options.verify) {
    const sources = await loadDependencySources(cwd);
    const errors = [];
    const catalog = parseCatalog({ planSource: sources.plan, progressSource: sources.progress,
      dependencySource: sources.dependency }, errors);
    if (errors.length > 0) throw new Error(`Dependency authority validation failed:\n- ${errors.join('\n- ')}`);
    const dispatch = dispatcher(catalog);
    const fixturePrompt = dispatch.readyQueue[0]?.prompt;
    if (!fixturePrompt) throw new Error('Dependency dispatcher has no mechanically ready prompt for compact-output verification');
    const root = resolve(git(cwd, ['rev-parse', '--show-toplevel']));
    const mainSha = resolveCurrentMainSha(root);
    const packet = createDependencyPacket({
      prompt: fixturePrompt,
      sources,
      binding: {
        owner: 'ci:dependency-authority',
        worktree: root,
        branch: git(cwd, ['branch', '--show-current']) || 'detached-ci-verification',
        prompt: fixturePrompt,
        changeClass: catalog.progress.get(fixturePrompt)?.changeClass,
        startBranchSha: git(cwd, ['rev-parse', 'HEAD']),
        startMainSha: mainSha,
        mainSha,
      },
    });
    const compact = formatDependencyPacket(packet);
    const lineCount = compact.trimEnd().split('\n').length;
    const byteCount = Buffer.byteLength(compact);
    console.log(`Dependency authority verified: ${catalog.dependency.rows.size} prompts, ${catalog.dependency.evidence.size} evidence records; compact fixture ${fixturePrompt}: ${lineCount} lines, ${byteCount} bytes.`);
    return;
  }
  const context = await cliContext(cwd, options);
  const packet = createDependencyPacket(context);
  if (options.check) {
    await validateDependencyReceipt(context);
  } else {
    const path = await writeDependencyReceipt(packet);
    if (!options.json) process.stderr.write(`Dependency receipt: ${path}\n`);
  }
  if (options.measure) {
    console.log(stableJson(measurePacket(packet), 2));
  } else {
    process.stdout.write(formatDependencyPacket(packet, { full: options.full, json: options.json }));
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
