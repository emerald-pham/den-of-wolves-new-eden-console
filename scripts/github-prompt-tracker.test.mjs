import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import test from 'node:test';
import {
  createGitHubPromptTrackerTransport,
  readGitHubPromptCatalog,
  updateGitHubIssueState,
} from './github-prompt-tracker.mjs';
import { loadPromptCatalog, stableCatalogJson } from './prompt-catalog.mjs';

const sourceCatalog = loadPromptCatalog();
const sourceBytes = Buffer.from(stableCatalogJson(sourceCatalog));
const evidenceReference = 'docs/README.md#tracker';
const sourceSha256 = createHash('sha256').update(sourceBytes).digest('hex');
const crosswalkFor = (records) => ({ schemaVersion: 1, destination: 'emerald-pham/den-of-wolves-new-eden-console', sourceSha256, records });
const promptRecord = (overrides = {}) => ({
  legacyId: '181',
  migrationId: 'DOW-PROMPT-181',
  recordKind: 'prompt-acceptance',
  issueId: 1810,
  issueNumber: 181,
  initialStatus: 'missing',
  parentMigrationIds: [],
  blockedByMigrationIds: [],
  sourceReferences: ['docs/implementation-prompts.json#181'],
  ...overrides,
});
const promptIssue = (overrides = {}) => ({
  id: 1810,
  number: 181,
  title: 'Legacy prompt record',
  body: 'Human note: please keep this prose.\n\nMigration ID: DOW-PROMPT-181\nSource status: missing\nSource reference: docs/implementation-prompts.json#181\n',
  state: 'open',
  state_reason: null,
  ...overrides,
});

function fakeTransport(initialIssues) {
  const issues = new Map(initialIssues.map((issue) => [issue.number, structuredClone(issue)]));
  const relationships = new Map([...issues.values()].map((issue) => [issue.id, { parentIssueIds: [], blockedByIssueIds: [] }]));
  const calls = [];
  return {
    calls,
    async listIssues() { return [...issues.values()].map((issue) => structuredClone(issue)); },
    async getIssue(number) { return structuredClone(issues.get(number)); },
    async getRelationships(id) { return structuredClone(relationships.get(id)); },
    async patchIssue(patch) {
      calls.push(structuredClone(patch));
      const issue = issues.get(patch.issueNumber);
      Object.assign(issue, {
        body: patch.body,
        state: patch.state,
        state_reason: patch.stateReason,
      });
      return structuredClone(issue);
    },
  };
}

test('GitHub status refresh projects only mutable prompt status and preserves other catalog fields', async () => {
  const issue = promptIssue({ body: `${promptIssue().body}\n<!-- DOW-TRACKER-OWNED-START -->\nPrompt status: partial\n<!-- DOW-TRACKER-OWNED-END -->\n` });
  const result = await readGitHubPromptCatalog({
    sourceBytes,
    transport: fakeTransport([issue]),
    crosswalk: crosswalkFor([promptRecord()]),
  });
  const source = loadPromptCatalog({ source: sourceBytes });
  const original = source.prompts.find(({ id }) => id === '181');
  const projected = result.catalog.prompts.find(({ id }) => id === '181');
  assert.equal(projected.status, 'partial');
  assert.equal(result.catalog.prompts.length, source.prompts.length);
  assert.equal(projected.description, original.description);
  assert.equal(projected.evidenceIds, original.evidenceIds);
  assert.equal(result.catalog.prompts.find(({ id }) => id === '610').status, 'done');
  assert.equal(result.issueCount, 1);
});

test('refresh can resume from its previous export while verifying imported prompt identity', async () => {
  const issue = promptIssue({ body: `${promptIssue().body}\n<!-- DOW-TRACKER-OWNED-START -->\nPrompt status: partial\n<!-- DOW-TRACKER-OWNED-END -->\n` });
  const original = sourceCatalog.prompts.find(({ id }) => id === '181');
  const rowSourceSha256 = createHash('sha256').update(JSON.stringify(JSON.parse(stableCatalogJson({ ...original, status: 'missing' })))).digest('hex');
  const crosswalk = crosswalkFor([promptRecord({ sourceSha256: rowSourceSha256 })]);
  const first = await readGitHubPromptCatalog({ sourceBytes, transport: fakeTransport([issue]), crosswalk });
  const next = await readGitHubPromptCatalog({
    sourceBytes: Buffer.from(first.catalogSource),
    transport: fakeTransport([issue]),
    crosswalk,
  });
  assert.equal(next.catalog.prompts.find(({ id }) => id === '181').status, 'partial');
});

test('closure requires accepted local evidence and not-planned remains unresolved', async () => {
  const source = loadPromptCatalog({ source: sourceBytes });
  const base = promptIssue({
    body: `${promptIssue().body}\n<!-- DOW-TRACKER-OWNED-START -->\nPrompt status: partial\nCompletion: reviewed-accepted\nEvidence references: ${evidenceReference}\n<!-- DOW-TRACKER-OWNED-END -->\n`,
    state: 'closed',
    state_reason: 'completed',
  });
  const args = { sourceBytes, crosswalk: crosswalkFor([promptRecord()]) };
  const accepted = await readGitHubPromptCatalog({ ...args, transport: fakeTransport([base]), cwd: process.cwd() });
  assert.equal(accepted.catalog.prompts.find(({ id }) => id === '181').status, 'done');

  const withoutEvidence = structuredClone(base);
  withoutEvidence.body = withoutEvidence.body.replace(`Evidence references: ${evidenceReference}`, 'Evidence references: docs/missing.md#result');
  const unresolved = await readGitHubPromptCatalog({ ...args, transport: fakeTransport([withoutEvidence]) });
  assert.equal(unresolved.catalog.prompts.find(({ id }) => id === '181').status, 'partial');

  const notPlanned = await readGitHubPromptCatalog({
    ...args,
    transport: fakeTransport([{ ...base, state_reason: 'not_planned' }]),
  });
  assert.equal(notPlanned.catalog.prompts.find(({ id }) => id === '181').status, 'partial');
  assert.equal(source.prompts.find(({ id }) => id === '181').status, 'missing');
});

test('reopening restores the stored incomplete status from the owned fields', async () => {
  const issue = promptIssue({
    body: `${promptIssue().body}\n<!-- DOW-TRACKER-OWNED-START -->\nPrompt status: done\nPrevious incomplete status: missing\nCompletion: reviewed-accepted\nEvidence references: ${evidenceReference}\n<!-- DOW-TRACKER-OWNED-END -->\n`,
  });
  const result = await readGitHubPromptCatalog({
    sourceBytes,
    transport: fakeTransport([issue]),
    crosswalk: crosswalkFor([promptRecord()]),
  });
  assert.equal(result.catalog.prompts.find(({ id }) => id === '181').status, 'missing');
});

test('held future briefs remain held and do not acquire prompt completion state', async () => {
  const issue = {
    id: 5000,
    number: 500,
    title: 'Legacy execution brief',
    body: 'Human note: retain this note.\n\nMigration ID: DOW-BRIEF-FUTURE-01\nSource status: Prepared future scope; preserve trigger.\nHold: inactive; preserve the source trigger and sequence.\nReadiness: held\nExecution: inactive\nSource reference: docs/future-tickets/example.md#future-01\n',
    state: 'open',
    state_reason: null,
  };
  const result = await readGitHubPromptCatalog({
    sourceBytes,
    transport: fakeTransport([issue]),
    crosswalk: crosswalkFor([{
      legacyId: 'future-01',
      migrationId: 'DOW-BRIEF-FUTURE-01',
      recordKind: 'held-future-brief',
      issueId: 5000,
      issueNumber: 500,
      initialReadiness: 'held',
      initialExecution: 'inactive',
      holdKind: 'prepared-sequence-trigger',
      originalHoldStatus: 'Prepared future scope; preserve trigger.',
      sourceReferences: ['docs/future-tickets/example.md#future-01'],
      parentMigrationIds: [],
      blockedByMigrationIds: [],
    }]),
  });
  assert.equal(result.catalog.prompts.find(({ id }) => id === '651').status, 'missing');
  assert.equal(result.catalog.prompts.find(({ id }) => id === '181').status, 'missing');
});

test('field updates cannot rewrite a held future brief source hold', async () => {
  const issue = {
    id: 5000,
    number: 500,
    title: 'Legacy execution brief',
    body: 'Migration ID: DOW-BRIEF-FUTURE-01\nSource status: Prepared future scope; preserve trigger.\nHold: inactive; preserve the source trigger and sequence.\nReadiness: held\nExecution: inactive\nSource reference: docs/future-tickets/example.md#future-01\n',
    state: 'open',
    state_reason: null,
  };
  const transport = fakeTransport([issue]);
  await assert.rejects(updateGitHubIssueState({
    transport,
    issueNumber: 500,
    expectedRecord: {
      issueId: 5000,
      issueNumber: 500,
      migrationId: 'DOW-BRIEF-FUTURE-01',
      recordKind: 'held-future-brief',
      parentMigrationIds: [],
      blockedByMigrationIds: [],
    },
    changes: { brief: { 'Original hold status': 'Active now.' } },
  }), /Held future brief source hold is immutable/);
  assert.equal(transport.calls.length, 0);
});

test('field-scoped update preserves human prose and verifies native state and relationships', async () => {
  const issue = promptIssue();
  const transport = fakeTransport([issue]);
  const result = await updateGitHubIssueState({ transport, issueNumber: 181, changes: { status: 'partial' } });
  assert.equal(result.issue.body.startsWith('Human note: please keep this prose.'), true);
  assert.match(result.issue.body, /Migration ID: DOW-PROMPT-181/);
  assert.match(result.issue.body, /Prompt status: partial/);
  assert.equal(result.issue.state, 'open');
  assert.equal(result.issue.stateReason, null);
  assert.equal(transport.calls.length, 1);
  assert.deepEqual(transport.calls[0], {
    issueNumber: 181,
    body: result.issue.body,
    state: 'open',
    stateReason: null,
  });
});

test('completed issue reopens with its prior incomplete status', async () => {
  const issue = promptIssue({
    body: `${promptIssue().body}\n<!-- DOW-TRACKER-OWNED-START -->\nPrompt status: done\nPrevious incomplete status: partial\nCompletion: reviewed-accepted\nEvidence references: ${evidenceReference}\n<!-- DOW-TRACKER-OWNED-END -->\n`,
    state: 'closed',
    state_reason: 'completed',
  });
  const transport = fakeTransport([issue]);
  const result = await updateGitHubIssueState({ transport, issueNumber: 181, changes: { reopen: true } });
  assert.equal(result.fields['Prompt status'], 'partial');
  assert.equal(result.issue.state, 'open');
  assert.equal(result.issue.stateReason, null);
  assert.match(result.issue.body, /Human note: please keep this prose/);
});

test('brief closure requires accepted local evidence and refresh reports completion', async () => {
  const issue = {
    id: 6000,
    number: 600,
    title: 'Legacy execution brief',
    body: `Human note: preserve this too.\n\nMigration ID: DOW-BRIEF-PC10-TEST\nReadiness: ready-for-agent\nExecution: paused\nSource reference: docs/pc10-tickets/61-pt7.md#pt7\n`,
    state: 'open',
    state_reason: null,
  };
  const transport = fakeTransport([issue]);
  await assert.rejects(updateGitHubIssueState({
    transport,
    issueNumber: 600,
    changes: { closeAs: 'completed' },
  }), /reviewed, accepted local evidence references/);
  assert.equal(transport.calls.length, 0);
  const completed = await updateGitHubIssueState({
    transport,
    issueNumber: 600,
    changes: { closeAs: 'completed', reviewed: true, accepted: true, evidenceReferences: [evidenceReference] },
  });
  assert.equal(completed.issue.state, 'closed');
  assert.equal(completed.issue.stateReason, 'completed');
  assert.match(completed.issue.body, /Human note: preserve this too/);

  const refreshed = await readGitHubPromptCatalog({
    sourceBytes,
    transport,
    crosswalk: crosswalkFor([{
      legacyId: 'pc10-test',
      migrationId: 'DOW-BRIEF-PC10-TEST',
      recordKind: 'execution-brief',
      issueId: 6000,
      issueNumber: 600,
      sourceReferences: ['docs/pc10-tickets/61-pt7.md#pt7'],
      parentMigrationIds: [],
      blockedByMigrationIds: [],
    }]),
    cwd: process.cwd(),
  });
  assert.equal(refreshed.issueStates[0].completion, 'reviewed-complete');
  assert.equal(refreshed.catalog.prompts.find(({ id }) => id === '651').status, 'missing');
});

test('invalid completion references fail before any write', async () => {
  const transport = fakeTransport([promptIssue()]);
  await assert.rejects(updateGitHubIssueState({
    transport,
    issueNumber: 181,
    changes: { status: 'done', reviewed: true, accepted: true, evidenceReferences: ['https://example.test#proof'] },
  }), /reviewed, accepted local evidence references/);
  assert.equal(transport.calls.length, 0);
});

test('refresh rejects a missing migrated issue rather than using a stale snapshot', async () => {
  const transport = fakeTransport([]);
  await assert.rejects(readGitHubPromptCatalog({
    sourceBytes,
    transport,
    crosswalk: crosswalkFor([promptRecord()]),
  }), /snapshot is incomplete/);
});

test('REST adapter sends only the selected issue fields and performs full issue paging', async () => {
  const requests = [];
  let current = promptIssue();
  const fetchImpl = async (url, options) => {
    requests.push({ url: String(url), options });
    if (String(url).includes('/issues?')) {
      return { ok: true, status: 200, async json() { return [current]; } };
    }
    if (String(url).endsWith('/issues/181/parent')) {
      return { ok: false, status: 404, async json() { return {}; } };
    }
    if (String(url).includes('/dependencies/blocked_by')) {
      return { ok: true, status: 200, async json() { return []; } };
    }
    if (String(url).endsWith('/issues/181') && options.method === 'PATCH') {
      const patch = JSON.parse(options.body);
      current = { ...current, body: patch.body, state: patch.state, state_reason: patch.state_reason };
      return { ok: true, status: 200, async json() { return current; } };
    }
    if (String(url).endsWith('/issues/181')) {
      return { ok: true, status: 200, async json() { return current; } };
    }
    throw new Error(`Unexpected fixture URL ${url}`);
  };
  const transport = createGitHubPromptTrackerTransport({
    owner: 'example',
    repo: 'tracker',
    token: 'fixture-token',
    fetchImpl,
    apiBase: 'https://api.example.test',
  });
  const listed = await transport.listIssues();
  assert.equal(listed.length, 1);
  assert.match(requests[0].url, /issues\?state=all&per_page=100&page=1$/);
  await transport.getRelationships(current.id);
  const patched = await transport.patchIssue({ issueNumber: 181, body: 'next body', state: 'open', stateReason: null });
  assert.equal(patched.body, 'next body');
  const patchRequest = requests.find(({ options }) => options.method === 'PATCH');
  assert.deepEqual(JSON.parse(patchRequest.options.body), { body: 'next body', state: 'open', state_reason: null });
  assert.equal(patchRequest.options.headers.Authorization, 'Bearer fixture-token');
});
