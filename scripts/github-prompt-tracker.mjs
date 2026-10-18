import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync, statSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadPromptCatalog, stableCatalogJson } from './prompt-catalog.mjs';

const API_ROOT = 'https://api.github.com';
const API_VERSION = '2026-03-10';
const TRACKER_REPOSITORY = 'emerald-pham/den-of-wolves-new-eden-console';
const BLOCK_START = '<!-- DOW-TRACKER-OWNED-START -->';
const BLOCK_END = '<!-- DOW-TRACKER-OWNED-END -->';
const PROMPT_STATUSES = new Set(['missing', 'partial', 'blocked', 'in-progress', 'done']);
const INCOMPLETE_STATUSES = new Set(['missing', 'partial', 'blocked', 'in-progress']);
const OWNED_FIELDS = new Set([
  'Prompt status',
  'Previous incomplete status',
  'Completion',
  'Evidence references',
  'Readiness',
  'Execution',
  'Hold',
  'Original hold status',
  'Hold release evidence',
]);

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function stableCompactJson(value) {
  return JSON.stringify(JSON.parse(stableCatalogJson(value)));
}

function normalizeIssue(issue) {
  if (!issue || !Number.isInteger(issue.id) || !Number.isInteger(issue.number)
      || typeof issue.title !== 'string' || issue.body !== null && typeof issue.body !== 'string'
      || !['open', 'closed'].includes(issue.state)) {
    throw new Error('GitHub returned an invalid issue payload');
  }
  const body = issue.body ?? '';
  const markers = [...body.matchAll(/^Migration ID: ([A-Z0-9-]+)$/gm)].map((match) => match[1]);
  if (markers.length > 1) throw new Error(`Issue #${issue.number} has duplicate migration markers`);
  return {
    id: issue.id,
    number: issue.number,
    title: issue.title,
    body,
    state: issue.state,
    stateReason: issue.state_reason ?? issue.stateReason ?? null,
    migrationId: markers[0] ?? null,
  };
}

function extractOwnedBlock(body) {
  const starts = [...body.matchAll(new RegExp(BLOCK_START, 'g'))].map((match) => match.index);
  const ends = [...body.matchAll(new RegExp(BLOCK_END, 'g'))].map((match) => match.index);
  if (starts.length !== ends.length || starts.length > 1) throw new Error('Issue has a malformed tracker-owned field block');
  if (!starts.length) return { fields: {}, start: -1, end: -1 };
  const start = starts[0];
  const end = ends[0];
  if (end < start) throw new Error('Issue has a malformed tracker-owned field block');
  const endAfter = end + BLOCK_END.length;
  const block = body.slice(start + BLOCK_START.length, end);
  const fields = {};
  for (const line of block.split(/\r?\n/).map((value) => value.trim()).filter(Boolean)) {
    const match = line.match(/^([^:]+):\s*(.*)$/);
    if (!match || !OWNED_FIELDS.has(match[1])) throw new Error(`Unsupported tracker-owned field line: ${line}`);
    if (Object.hasOwn(fields, match[1])) throw new Error(`Duplicate tracker-owned field ${match[1]}`);
    fields[match[1]] = match[2];
  }
  return { fields, start, end: endAfter };
}

function legacyField(body, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return body.match(new RegExp(`^${escaped}:\\s*(.+?)\\s*$`, 'm'))?.[1] ?? null;
}

function ownedFieldsForIssue(issue) {
  const { fields } = extractOwnedBlock(issue.body);
  const marker = issue.migrationId;
  if (!marker) throw new Error(`Issue #${issue.number} has no stable migration marker`);
  if (marker.startsWith('DOW-PROMPT-')) {
    const seeded = fields['Prompt status'] ?? legacyField(issue.body, 'Source status');
    if (!PROMPT_STATUSES.has(seeded)) throw new Error(`Issue ${marker} has no valid prompt status`);
    return { ...fields, 'Prompt status': seeded };
  }
  const readiness = fields.Readiness ?? legacyField(issue.body, 'Readiness');
  const execution = fields.Execution ?? legacyField(issue.body, 'Execution');
  if (readiness === null || execution === null) throw new Error(`Issue ${marker} has no valid brief state`);
  return {
    ...fields,
    Readiness: readiness,
    Execution: execution,
    Hold: fields.Hold ?? legacyField(issue.body, 'Hold'),
    'Original hold status': fields['Original hold status'] ?? legacyField(issue.body, 'Source status'),
  };
}

function validateEvidenceReferences(references, cwd) {
  if (!Array.isArray(references) || references.length === 0) return false;
  return references.every((reference) => {
    if (typeof reference !== 'string' || !/^[A-Za-z0-9._/-]+#[A-Za-z0-9._-]+$/.test(reference)
        || reference.startsWith('/') || reference.includes('..')) return false;
    const path = reference.split('#', 1)[0];
    try {
      return statSync(resolve(cwd, path)).isFile();
    } catch {
      return false;
    }
  });
}

function parseList(value) {
  if (!value || value.toLowerCase() === 'none') return [];
  return value.split(',').map((item) => item.trim()).filter(Boolean);
}

function replaceOwnedBlock(body, fields) {
  const current = extractOwnedBlock(body);
  const next = Object.fromEntries([...Object.entries(fields)].filter(([key, value]) => OWNED_FIELDS.has(key) && value !== undefined));
  const block = [
    BLOCK_START,
    ...[...OWNED_FIELDS].filter((key) => Object.hasOwn(next, key)).map((key) => `${key}: ${next[key]}`),
    BLOCK_END,
  ].join('\n');
  if (current.start < 0) return `${body}${body && !body.endsWith('\n') ? '\n' : ''}\n${block}\n`;
  return `${body.slice(0, current.start)}${block}${body.slice(current.end)}`;
}

function normalizeCrosswalk(crosswalk, sourceText, catalog) {
  if (!crosswalk || !Array.isArray(crosswalk.records) || crosswalk.schemaVersion !== 1) {
    throw new Error('Public crosswalk has an unsupported schema');
  }
  if (crosswalk.destination !== TRACKER_REPOSITORY) throw new Error('Public crosswalk repository mismatch');
  const records = crosswalk.records.map((record) => ({
    ...record,
    marker: record.migrationId,
    parentMarkers: record.parentMigrationIds ?? [],
    blockedByMarkers: record.blockedByMigrationIds ?? [],
    equivalentBlockedByMarkers: record.equivalentBlockedByMigrationIds ?? [],
  }));
  if (crosswalk.sourceSha256 !== sha256(sourceText)) {
    const prompts = new Map(catalog.prompts.map((prompt) => [prompt.id.toUpperCase(), prompt]));
    const immutableRowsMatch = records.filter((record) => record.recordKind === 'prompt-acceptance').every((record) => {
      const prompt = prompts.get(record.legacyId.toUpperCase());
      if (!prompt || typeof record.sourceSha256 !== 'string' || !record.initialStatus) return false;
      return sha256(stableCompactJson({ ...prompt, status: record.initialStatus })) === record.sourceSha256;
    });
    if (!immutableRowsMatch) throw new Error('Public crosswalk source snapshot hash mismatch');
  }
  return records;
}

function markerIndex(records, label) {
  const index = new Map();
  for (const record of records) {
    if (!record || typeof record.marker !== 'string' || !record.marker.startsWith('DOW-')
        || typeof record.legacyId !== 'string') throw new Error(`${label} contains an invalid marker record`);
    if (index.has(record.marker)) throw new Error(`${label} duplicates migration marker ${record.marker}`);
    index.set(record.marker, record);
  }
  return index;
}

function relationMarkers(ids, issueById, label) {
  return [...(ids ?? [])].map((id) => {
    const issue = issueById.get(id);
    if (!issue?.migrationId) throw new Error(`${label} references an issue without a migrated marker`);
    return issue.migrationId;
  }).sort();
}

function sameSet(left, right) {
  return JSON.stringify([...left].sort()) === JSON.stringify([...right].sort());
}

/** Read one complete tracker snapshot and overlay only issue-owned mutable prompt status. */
export async function readGitHubPromptCatalog({ sourceBytes, transport, crosswalk, completionDecisions = {}, cwd = process.cwd() } = {}) {
  if (typeof transport?.listIssues !== 'function' || typeof transport?.getRelationships !== 'function') {
    throw new Error('Tracker transport must provide listIssues and getRelationships');
  }
  const sourceText = Buffer.from(sourceBytes ?? '').toString('utf8');
  if (!sourceText) throw new Error('A source catalog snapshot is required');
  const catalog = loadPromptCatalog({ source: sourceText });
  const expected = markerIndex(normalizeCrosswalk(crosswalk, sourceText, catalog), 'Public crosswalk');
  for (const [marker, record] of expected) {
    for (const [label, references] of [
      ['parent', record.parentMarkers],
      ['native blocker', record.blockedByMarkers],
      ['equivalent blocker', record.equivalentBlockedByMarkers],
    ]) {
      if (!Array.isArray(references) || references.some((reference) => typeof reference !== 'string' || !expected.has(reference))) {
        throw new Error(`Public crosswalk has an invalid ${label} reference for ${marker}`);
      }
      if (new Set(references).size !== references.length || references.includes(marker)) {
        throw new Error(`Public crosswalk has duplicate or self-referential ${label} for ${marker}`);
      }
    }
    if (record.blockedByMarkers.some((reference) => record.equivalentBlockedByMarkers.includes(reference))) {
      throw new Error(`Public crosswalk duplicates a native and equivalent blocker for ${marker}`);
    }
  }
  const issues = await transport.listIssues();
  if (!Array.isArray(issues)) throw new Error('GitHub issue snapshot is incomplete');
  const byMarker = new Map();
  const byId = new Map();
  for (const raw of issues) {
    const issue = normalizeIssue(raw);
    if (!issue.migrationId) continue;
    if (byMarker.has(issue.migrationId)) throw new Error(`Duplicate GitHub migration marker ${issue.migrationId}`);
    if (!expected.has(issue.migrationId)) throw new Error(`Unknown GitHub migration marker ${issue.migrationId}`);
    byMarker.set(issue.migrationId, issue);
    byId.set(issue.id, issue);
  }
  if (byMarker.size !== expected.size) throw new Error(`GitHub issue snapshot is incomplete (${byMarker.size}/${expected.size} migrated issues)`);

  const rows = new Map(catalog.prompts.map((prompt) => [prompt.id.toUpperCase(), prompt]));
  const issueStates = [];
  for (const [marker, planned] of expected) {
    const issue = byMarker.get(marker);
    if (issue.id !== planned.issueId || issue.number !== planned.issueNumber) {
      throw new Error(`GitHub issue identity mismatch for ${marker}`);
    }
    const actualSourceReference = legacyField(issue.body, 'Source reference');
    if (planned.sourceReferences?.length && !planned.sourceReferences.includes(actualSourceReference)) {
      throw new Error(`GitHub source reference mismatch for ${marker}`);
    }
    if (planned.recordKind === 'prompt-acceptance') {
      if (marker !== `DOW-PROMPT-${planned.legacyId.toUpperCase()}` || !rows.has(planned.legacyId.toUpperCase())) {
        throw new Error(`Crosswalk prompt identity mismatch for ${marker}`);
      }
      if (legacyField(issue.body, 'Source status') !== planned.initialStatus) {
        throw new Error(`GitHub initial source status mismatch for ${marker}`);
      }
    } else if (!marker.startsWith('DOW-BRIEF-')) {
      throw new Error(`Crosswalk brief identity mismatch for ${marker}`);
    }
    const relations = await transport.getRelationships(issue.id);
    if (!sameSet(relationMarkers(relations?.parentIssueIds, byId, `Parent relationship for ${marker}`), planned.parentMarkers)
        || !sameSet(relationMarkers(relations?.blockedByIssueIds, byId, `Dependency relationship for ${marker}`), planned.blockedByMarkers)) {
      throw new Error(`GitHub relationship mismatch for ${marker}`);
    }
    const fields = ownedFieldsForIssue(issue);
    if (planned.recordKind === 'held-future-brief') {
      if (fields['Original hold status'] !== planned.originalHoldStatus) {
        throw new Error(`Future hold provenance mismatch for ${marker}`);
      }
      if (legacyField(issue.body, 'Source status') !== planned.originalHoldStatus) {
        throw new Error(`Original future hold provenance mismatch for ${marker}`);
      }
      if (fields.Hold === 'inactive; preserve the source trigger and sequence.') {
        if (fields.Readiness !== 'held' || fields.Execution !== 'inactive'
            || fields['Hold release evidence']) {
          throw new Error(`Future hold provenance mismatch for ${marker}`);
        }
      } else if (fields.Hold === 'released') {
        const releaseEvidence = parseList(fields['Hold release evidence'] ?? '');
        if (!releaseEvidence.length || !validateEvidenceReferences(releaseEvidence, cwd)) {
          throw new Error(`Future hold release evidence is missing or invalid for ${marker}`);
        }
      } else {
        throw new Error(`Future hold provenance mismatch for ${marker}`);
      }
    }
    const evidence = parseList(fields['Evidence references'] ?? '');
    const hasAcceptedEvidence = fields.Completion === 'reviewed-accepted'
      && validateEvidenceReferences(evidence, cwd);
    let completion = 'not-closed';
    if (issue.state === 'closed' && issue.stateReason === 'not_planned') completion = 'unresolved-not-planned';
    else if (issue.state === 'closed' && issue.stateReason === 'completed') {
      completion = hasAcceptedEvidence ? 'reviewed-complete' : 'unresolved-closed-without-evidence';
    }
    issueStates.push({
      migrationId: marker,
      recordKind: planned.recordKind,
      state: issue.state,
      stateReason: issue.stateReason,
      readiness: fields.Readiness ?? null,
      execution: fields.Execution ?? null,
      hold: fields.Hold ?? null,
      nativeParentMigrationIds: planned.parentMarkers,
      nativeBlockedByMigrationIds: planned.blockedByMarkers,
      blockedByMigrationIds: [...new Set([...planned.blockedByMarkers, ...planned.equivalentBlockedByMarkers])].sort(),
      completion,
      evidenceReferences: hasAcceptedEvidence ? evidence : [],
    });
    if (planned.recordKind !== 'prompt-acceptance') continue;
    const prompt = rows.get(planned.legacyId.toUpperCase());
    let status = fields['Prompt status'];
    if (!PROMPT_STATUSES.has(status)) throw new Error(`Invalid current prompt status for ${marker}`);
    if (issue.state === 'closed' && issue.stateReason === 'completed') {
      const decision = completionDecisions[marker];
      const evidence = decision?.evidenceReferences ?? parseList(fields['Evidence references'] ?? '');
      const reviewed = decision?.reviewed === true && decision?.accepted === true
        || fields.Completion === 'reviewed-accepted';
      if (reviewed && validateEvidenceReferences(evidence, cwd)) {
        if (INCOMPLETE_STATUSES.has(status)) fields['Previous incomplete status'] = status;
        status = 'done';
      } else if (status === 'done') {
        status = fields['Previous incomplete status'] ?? planned.initialStatus;
      }
    } else if (issue.state === 'closed' && issue.stateReason === 'not_planned') {
      if (status === 'done') status = fields['Previous incomplete status'] ?? planned.initialStatus;
    } else if (issue.state === 'open' && status === 'done') {
      status = fields['Previous incomplete status'] ?? planned.initialStatus;
    }
    if (!PROMPT_STATUSES.has(status)) throw new Error(`Cannot restore an incomplete status for ${marker}`);
    prompt.status = status;
  }
  return {
    catalog,
    catalogSource: stableCatalogJson(catalog),
    sourceSha256: sha256(sourceText),
    issueStates,
    issueCount: byMarker.size,
    issueSnapshotSha256: sha256(JSON.stringify(issues.map((issue) => ({ id: issue.id, number: issue.number, body: issue.body, state: issue.state, stateReason: issue.stateReason ?? issue.state_reason ?? null })).sort((a, b) => a.number - b.number))),
  };
}

/** Update only tracker-owned fields, preserving user prose and relationships, then verify readback. */
export async function updateGitHubIssueState({ transport, issueNumber, changes, expectedRecord, cwd = process.cwd() } = {}) {
  if (!Number.isInteger(issueNumber) || !changes || typeof changes !== 'object') throw new Error('An issue number and owned-field changes are required');
  for (const name of ['getIssue', 'getRelationships', 'patchIssue']) {
    if (typeof transport?.[name] !== 'function') throw new Error(`Tracker transport must provide ${name}`);
  }
  const current = normalizeIssue(await transport.getIssue(issueNumber));
  const beforeRelationships = await transport.getRelationships(current.id);
  if (expectedRecord) {
    if (expectedRecord.issueNumber !== issueNumber || expectedRecord.issueId !== current.id
        || expectedRecord.migrationId !== current.migrationId) {
      throw new Error(`GitHub issue identity mismatch for ${expectedRecord.migrationId}`);
    }
    const listed = await transport.listIssues();
    const byId = new Map(listed.map((issue) => [issue.id, normalizeIssue(issue)]));
    if (!sameSet(relationMarkers(beforeRelationships.parentIssueIds, byId, `Parent relationship for ${current.migrationId}`), expectedRecord.parentMigrationIds ?? [])
        || !sameSet(relationMarkers(beforeRelationships.blockedByIssueIds, byId, `Dependency relationship for ${current.migrationId}`), expectedRecord.blockedByMigrationIds ?? [])) {
      throw new Error(`GitHub relationship mismatch for ${current.migrationId}`);
    }
  }
  const fields = ownedFieldsForIssue(current);
  const promptIssue = current.migrationId?.startsWith('DOW-PROMPT-');
  const heldFuture = expectedRecord?.recordKind === 'held-future-brief';
  if (heldFuture) {
    if (legacyField(current.body, 'Source status') !== expectedRecord.originalHoldStatus
        || fields['Original hold status'] !== expectedRecord.originalHoldStatus
        || !expectedRecord.holdKind
        || !expectedRecord.sourceReferences?.includes(legacyField(current.body, 'Source reference'))) {
      throw new Error(`Future hold provenance mismatch for ${current.migrationId}`);
    }
  }
  if (expectedRecord?.recordKind === 'held-future-brief' && changes.closeAs === 'completed') {
    if (fields.Hold !== 'released') throw new Error('Held future briefs cannot be completed while held');
  }
  let state = current.state;
  let stateReason = current.stateReason;
  const next = { ...fields };
  if (Object.hasOwn(changes, 'status')) {
    if (!promptIssue || !PROMPT_STATUSES.has(changes.status)) throw new Error('Prompt status update is invalid for this issue');
    const oldStatus = fields['Prompt status'];
    if (changes.status === 'done') {
      const evidenceReferences = changes.evidenceReferences ?? [];
      if (changes.reviewed !== true || changes.accepted !== true || !validateEvidenceReferences(evidenceReferences, cwd)) {
        throw new Error('Completing a prompt requires reviewed, accepted local evidence references');
      }
      if (INCOMPLETE_STATUSES.has(oldStatus)) next['Previous incomplete status'] = oldStatus;
      next.Completion = 'reviewed-accepted';
      next['Evidence references'] = evidenceReferences.join(', ');
      state = 'closed';
      stateReason = 'completed';
    } else {
      next['Prompt status'] = changes.status;
      if (state === 'closed' && stateReason === 'completed') {
        state = 'open';
        stateReason = null;
      }
      delete next.Completion;
      delete next['Evidence references'];
    }
    next['Prompt status'] = changes.status;
  }
  if (Object.hasOwn(changes, 'brief')) {
    if (promptIssue || !changes.brief || typeof changes.brief !== 'object') throw new Error('Brief state update is invalid for this issue');
    if (heldFuture && ['Hold', 'Original hold status'].some((key) => Object.hasOwn(changes.brief, key))) {
      throw new Error('Future brief hold provenance is immutable; use the explicit release operation');
    }
    if (heldFuture && fields.Hold !== 'released'
        && ['Readiness', 'Execution'].some((key) => Object.hasOwn(changes.brief, key))) {
      throw new Error('Future brief readiness and execution cannot change before hold release');
    }
    for (const key of ['Readiness', 'Execution', 'Hold', 'Original hold status']) {
      if (Object.hasOwn(changes.brief, key)) next[key] = String(changes.brief[key]);
    }
  }
  if (Object.hasOwn(changes, 'releaseHold')) {
    if (!heldFuture || changes.releaseHold !== true) throw new Error('Hold release requires an explicit future brief release operation');
    if (fields.Hold !== 'inactive; preserve the source trigger and sequence.'
        || fields.Readiness !== 'held' || fields.Execution !== 'inactive') {
      throw new Error('Only an inactive held future brief can be released');
    }
    const evidenceReferences = changes.evidenceReferences ?? [];
    if (changes.reviewed !== true || changes.accepted !== true || !validateEvidenceReferences(evidenceReferences, cwd)) {
      throw new Error('Hold release requires reviewed, accepted local trigger/authorization evidence');
    }
    next.Hold = 'released';
    next.Readiness = 'ready';
    next.Execution = 'inactive';
    next['Hold release evidence'] = evidenceReferences.join(', ');
  }
  if (changes.closeAs === 'completed') {
    if (promptIssue) throw new Error('Prompt completion requires a reviewed status update');
    const evidenceReferences = changes.evidenceReferences ?? [];
    if (changes.reviewed !== true || changes.accepted !== true || !validateEvidenceReferences(evidenceReferences, cwd)) {
      throw new Error('Completing a brief requires reviewed, accepted local evidence references');
    }
    next.Completion = 'reviewed-accepted';
    next['Evidence references'] = evidenceReferences.join(', ');
    state = 'closed';
    stateReason = 'completed';
  } else if (changes.closeAs === 'not_planned') {
    state = 'closed';
    stateReason = 'not_planned';
    if (next['Prompt status'] === 'done') next['Prompt status'] = next['Previous incomplete status'];
    delete next.Completion;
    delete next['Evidence references'];
  }
  if (changes.reopen === true) {
    state = 'open';
    stateReason = null;
    if (next['Prompt status'] === 'done') next['Prompt status'] = next['Previous incomplete status'];
  }
  if (promptIssue && state === 'open' && next['Prompt status'] === 'done') {
    next['Prompt status'] = next['Previous incomplete status'];
  }
  if (promptIssue && !PROMPT_STATUSES.has(next['Prompt status'])) throw new Error(`Cannot restore an incomplete status for ${current.migrationId}`);
  const body = replaceOwnedBlock(current.body, next);
  const updated = normalizeIssue(await transport.patchIssue({
    issueNumber,
    body,
    state,
    stateReason,
  }));
  const readback = normalizeIssue(await transport.getIssue(issueNumber));
  const afterRelationships = await transport.getRelationships(readback.id);
  if (updated.body !== body || readback.body !== body || readback.state !== state || readback.stateReason !== stateReason
      || !sameSet(afterRelationships?.parentIssueIds ?? [], beforeRelationships?.parentIssueIds ?? [])
      || !sameSet(afterRelationships?.blockedByIssueIds ?? [], beforeRelationships?.blockedByIssueIds ?? [])) {
    throw new Error(`GitHub update readback mismatch for ${current.migrationId}`);
  }
  return { issue: readback, fields: ownedFieldsForIssue(readback) };
}

/** Explicitly construct a token-injected REST adapter; importing this module performs no network request. */
export function createGitHubPromptTrackerTransport({ owner, repo, token, fetchImpl = globalThis.fetch, apiBase = API_ROOT } = {}) {
  if (!owner || !repo || !token || typeof fetchImpl !== 'function') throw new Error('GitHub transport requires owner, repo, token and fetch');
  const root = `${String(apiBase).replace(/\/$/, '')}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
  const headers = {
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${token}`,
    'X-GitHub-Api-Version': API_VERSION,
  };
  const issuesById = new Map();
  const issuesByNumber = new Map();
  async function request(path, { method = 'GET', body } = {}, allowed = []) {
    const response = await fetchImpl(`${root}${path}`, {
      method,
      headers: { ...headers, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    if (!response.ok && !allowed.includes(response.status)) throw new Error(`GitHub REST ${response.status} for ${method} ${path}`);
    if (response.status === 204 || response.status === 404 && allowed.includes(404)) return null;
    return response.json();
  }
  async function listIssues() {
    const all = [];
    for (let page = 1; ; page += 1) {
      const rows = await request(`/issues?state=all&per_page=100&page=${page}`);
      if (!Array.isArray(rows)) throw new Error('GitHub REST issue list was not an array');
      for (const row of rows) {
        if (row.pull_request) continue;
        const issue = normalizeIssue(row);
        issuesById.set(issue.id, issue);
        issuesByNumber.set(issue.number, issue);
        all.push(issue);
      }
      if (rows.length < 100) return all;
    }
  }
  async function getByNumber(issueNumber) {
    if (!issuesByNumber.has(issueNumber)) await listIssues();
    if (!issuesByNumber.has(issueNumber)) throw new Error(`GitHub issue #${issueNumber} was not found`);
    const issue = normalizeIssue(await request(`/issues/${issueNumber}`));
    issuesById.set(issue.id, issue);
    issuesByNumber.set(issue.number, issue);
    return issue;
  }
  async function getRelationships(issueId) {
    let issue = issuesById.get(issueId);
    if (!issue) {
      await listIssues();
      issue = issuesById.get(issueId);
    }
    if (!issue) throw new Error(`GitHub issue ID ${issueId} was not found`);
    const parentRaw = await request(`/issues/${issue.number}/parent`, {}, [404]);
    const parent = parentRaw ? normalizeIssue(parentRaw) : null;
    const blockedByIssueIds = [];
    for (let page = 1; ; page += 1) {
      const rows = await request(`/issues/${issue.number}/dependencies/blocked_by?per_page=100&page=${page}`);
      if (!Array.isArray(rows)) throw new Error('GitHub REST dependency response was not an array');
      for (const row of rows) {
        if (!Number.isInteger(row.id)) throw new Error('GitHub REST returned an invalid dependency');
        blockedByIssueIds.push(row.id);
        if (Number.isInteger(row.number)) {
          const related = normalizeIssue(row);
          issuesById.set(related.id, related);
          issuesByNumber.set(related.number, related);
        }
      }
      if (rows.length < 100) break;
    }
    if (parent) {
      issuesById.set(parent.id, parent);
      issuesByNumber.set(parent.number, parent);
    }
    return { parentIssueIds: parent ? [parent.id] : [], blockedByIssueIds: blockedByIssueIds.sort((a, b) => a - b) };
  }
  return {
    listIssues,
    getRelationships,
    async getIssue(issueNumber) { return getByNumber(issueNumber); },
    async patchIssue({ issueNumber, body, state, stateReason }) {
      if (typeof body !== 'string' || !['open', 'closed'].includes(state)
          || state === 'closed' && !['completed', 'not_planned'].includes(stateReason)
          || state === 'open' && stateReason !== null) throw new Error('Invalid field-scoped GitHub issue patch');
      const payload = { body, state, state_reason: stateReason };
      const updated = normalizeIssue(await request(`/issues/${issueNumber}`, { method: 'PATCH', body: payload }));
      issuesById.set(updated.id, updated);
      issuesByNumber.set(updated.number, updated);
      return updated;
    },
  };
}

export function readGitHubCliToken() {
  try {
    return execFileSync('gh', ['auth', 'token'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    throw new Error('GitHub CLI authentication is unavailable; run gh auth login and retry');
  }
}

export function readCatalogSnapshot(path, cwd = process.cwd()) {
  return readFileSync(resolve(cwd, path), 'utf8');
}

function parseCommand(args) {
  const [command, ...rest] = args;
  if (!['refresh', 'update'].includes(command)) throw new Error('Use refresh or update');
  const options = {};
  for (let index = 0; index < rest.length; index += 1) {
    const arg = rest[index];
    if (!arg.startsWith('--')) throw new Error(`Unexpected argument ${arg}`);
    const name = arg.slice(2);
    if (['reviewed', 'accepted', 'reopen', 'check', 'release-hold'].includes(name)) {
      options[name] = true;
      continue;
    }
    const value = rest[index + 1];
    if (!value || value.startsWith('--')) throw new Error(`${arg} requires a value`);
    options[name] = value;
    index += 1;
  }
  return { command, options };
}

function validateCutoverCrosswalk(crosswalk) {
  const counts = crosswalk.records.reduce((summary, record) => {
    summary[record.recordKind] = (summary[record.recordKind] ?? 0) + 1;
    return summary;
  }, {});
  if (crosswalk.records.length !== 148 || counts['prompt-acceptance'] !== 48
      || counts['execution-brief'] !== 68 || counts['held-future-brief'] !== 32
      || crosswalk.completedPromptHistoryCount !== 703) {
    throw new Error('Verified crosswalk does not cover the approved 148-record cutover scope');
  }
}

function createCommandTransport() {
  const [owner, repo] = TRACKER_REPOSITORY.split('/');
  return createGitHubPromptTrackerTransport({
    owner,
    repo,
    token: readGitHubCliToken(),
  });
}

async function runCommand({ command, options, cwd = process.cwd() }) {
  const sourcePath = options.source ?? 'docs/implementation-prompts.json';
  const catalogPath = options.catalog ?? sourcePath;
  const crosswalkPath = options.crosswalk;
  if (!crosswalkPath) throw new Error('Use --crosswalk to provide the verified public issue crosswalk');
  const sourceBytes = readCatalogSnapshot(sourcePath, cwd);
  const crosswalk = JSON.parse(readCatalogSnapshot(crosswalkPath, cwd));
  validateCutoverCrosswalk(crosswalk);
  const transport = createCommandTransport();
  if (command === 'refresh') {
    const result = await readGitHubPromptCatalog({ sourceBytes, transport, crosswalk, cwd });
    if (options.check) return { message: `Tracker snapshot is current (${result.issueCount} issues; source ${result.sourceSha256.slice(0, 12)}).`, result };
    writeFileSync(resolve(cwd, catalogPath), result.catalogSource, 'utf8');
    const { generatePromptViews } = await import('./generate-prompt-views.mjs');
    await generatePromptViews({ cwd, catalog: result.catalog });
    return { message: `Refreshed ${result.issueCount} GitHub issues and generated catalog views.`, result };
  }

  const issueNumber = Number(options.issue);
  if (!Number.isSafeInteger(issueNumber) || issueNumber < 1) throw new Error('update requires a valid --issue number');
  const baseline = await readGitHubPromptCatalog({ sourceBytes, transport, crosswalk, cwd });
  const record = crosswalk.records.find(({ issueNumber: number }) => number === issueNumber);
  if (!record) throw new Error(`Issue #${issueNumber} is not in the verified public crosswalk`);
  const changes = {};
  if (options.status) changes.status = options.status;
  if (options.reviewed) changes.reviewed = true;
  if (options.accepted) changes.accepted = true;
  if (options.evidence) changes.evidenceReferences = options.evidence.split(',').map((item) => item.trim()).filter(Boolean);
  if (options.reopen) changes.reopen = true;
  if (options['release-hold']) changes.releaseHold = true;
  if (options['close-as']) changes.closeAs = options['close-as'];
  const brief = {};
  for (const [option, field] of [['readiness', 'Readiness'], ['execution', 'Execution'], ['hold', 'Hold'], ['original-hold-status', 'Original hold status']]) {
    if (options[option] !== undefined) brief[field] = options[option];
  }
  if (Object.keys(brief).length) changes.brief = brief;
  const updated = await updateGitHubIssueState({ transport, issueNumber, changes, expectedRecord: record, cwd });
  const refreshedIssues = await readGitHubPromptCatalog({ sourceBytes, transport, crosswalk, cwd });
  writeFileSync(resolve(cwd, catalogPath), refreshedIssues.catalogSource, 'utf8');
  const { generatePromptViews } = await import('./generate-prompt-views.mjs');
  await generatePromptViews({ cwd, catalog: refreshedIssues.catalog });
  return { message: `Updated ${record.migrationId} with verified GitHub readback.`, issue: updated.issue, catalog: baseline.catalog };
}

async function main() {
  try {
    if (['--help', '-h'].includes(process.argv[2])) {
      console.log([
        'Prompt tracker commands (GitHub access occurs only when invoked):',
        '  npm run prompt-tracker -- refresh --crosswalk <verified-crosswalk.json> [--source <catalog.json>] [--check]',
        '  npm run prompt-tracker -- update --crosswalk <verified-crosswalk.json> --issue <number> --status <missing|partial|blocked|in-progress>',
        '  npm run prompt-tracker -- update --crosswalk <verified-crosswalk.json> --issue <number> --status done --reviewed --accepted --evidence <path#anchor>',
        '  npm run prompt-tracker -- update --crosswalk <verified-crosswalk.json> --issue <number> --close-as not_planned',
        '  npm run prompt-tracker -- update --crosswalk <verified-crosswalk.json> --issue <number> --close-as completed --reviewed --accepted --evidence <path#anchor>',
        '  npm run prompt-tracker -- update --crosswalk <verified-crosswalk.json> --issue <number> --release-hold --reviewed --accepted --evidence <path#anchor>',
        '  npm run prompt-tracker -- update --crosswalk <verified-crosswalk.json> --issue <number> --readiness <value> --execution <value>',
        'Updates preserve issue prose, verify native state and relationships, and require local evidence for completion or future hold release.',
      ].join('\n'));
      return;
    }
    const result = await runCommand(parseCommand(process.argv.slice(2)));
    console.log(result.message);
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'GitHub prompt tracker operation failed');
    process.exitCode = 1;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(new URL('.', import.meta.url).pathname, '..', 'scripts', 'github-prompt-tracker.mjs')) {
  main();
}
