import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile, mkdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import test from 'node:test';
import {
  createGitHubPromptTrackerTransport,
  readGitHubPromptCatalog,
  updateGitHubIssueState,
} from './github-prompt-tracker.mjs';
import { loadPromptCatalog, stableCatalogJson, validatePromptCatalog } from './prompt-catalog.mjs';

const sourceCatalog = loadPromptCatalog();
const sourceBytes = Buffer.from(stableCatalogJson(sourceCatalog));
const evidenceReference = 'docs/README.md#tracker';
const sourceSha256 = createHash('sha256').update(sourceBytes).digest('hex');
const sourceStructureFor = (catalog, records) => {
  const initialStatuses = new Map(records.filter(({ recordKind }) => recordKind === 'prompt-acceptance')
    .map((record) => [record.legacyId.toUpperCase(), record.initialStatus]));
  const value = {
    ...catalog,
    prompts: catalog.prompts.map((prompt) => {
      const copy = initialStatuses.has(prompt.id.toUpperCase())
        ? { ...prompt, status: initialStatuses.get(prompt.id.toUpperCase()) }
        : { ...prompt };
      delete copy.definition;
      return copy;
    }),
  };
  return createHash('sha256').update(stableCatalogJson(value)).digest('hex');
};
const crosswalkFor = (records, retainedBriefReferences = []) => ({
  schemaVersion: 1,
  destination: 'emerald-pham/den-of-wolves-new-eden-console',
  sourceSha256,
  sourceStructureSha256: sourceStructureFor(sourceCatalog, records),
  records,
  retainedBriefReferences,
});
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

test('saved tracker snapshot can export its views through the normal offline command', () => {
  const result = spawnSync(process.execPath, ['scripts/github-prompt-tracker.mjs', 'export'], {
    cwd: process.cwd(),
    encoding: 'utf8',
    env: { ...process.env, GH_TOKEN: '', GITHUB_TOKEN: '' },
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Exported the saved GitHub catalog snapshot to generated views \(751 prompts\)/);
});

test('offline export recovers generated views after an interrupted refresh', async () => {
  const cwd = await mkdtemp(resolve(tmpdir(), 'prompt-tracker-export-recovery-'));
  try {
    await mkdir(resolve(cwd, 'docs'), { recursive: true });
    for (const path of [
      'docs/IMPLEMENTATION_PLAN.md',
      'docs/IMPLEMENTATION_PROGRESS.md',
      'docs/IMPLEMENTATION_PROMPT_DEPENDENCIES.md',
      'docs/IMPLEMENTATION_MILESTONES.md',
    ]) await writeFile(resolve(cwd, path), await readFile(resolve(process.cwd(), path), 'utf8'));
    const savedSnapshot = stableCatalogJson(sourceCatalog);
    await writeFile(resolve(cwd, 'docs/implementation-prompts.json'), savedSnapshot);
    const progressPath = resolve(cwd, 'docs/IMPLEMENTATION_PROGRESS.md');
    const progress = await readFile(progressPath, 'utf8');
    await writeFile(progressPath, progress.replace('703 done', 'INTERRUPTED EXPORT'));

    const scriptPath = resolve(process.cwd(), 'scripts/github-prompt-tracker.mjs');
    const result = spawnSync(process.execPath, [scriptPath, 'export'], {
      cwd,
      encoding: 'utf8',
      env: { ...process.env, GH_TOKEN: '', GITHUB_TOKEN: '' },
    });
    assert.equal(result.status, 0, result.stderr);
    assert.doesNotMatch(await readFile(progressPath, 'utf8'), /INTERRUPTED EXPORT/);
    assert.equal(await readFile(resolve(cwd, 'docs/implementation-prompts.json'), 'utf8'), savedSnapshot);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

function fakeTransport(initialIssues, initialRelationships = [], { concurrentHumanNote = null } = {}) {
  const issues = new Map(initialIssues.map((issue) => [issue.number, structuredClone(issue)]));
  const relationships = new Map([...issues.values()].map((issue) => [issue.id, { parentIssueIds: [], blockedByIssueIds: [] }]));
  for (const [issueId, value] of initialRelationships) relationships.set(issueId, structuredClone(value));
  const calls = [];
  const comments = new Map([...issues.keys()].map((number) => [number, []]));
  const getCounts = new Map();
  return {
    calls,
    async listIssues() { return [...issues.values()].map((issue) => structuredClone(issue)); },
    async getIssue(number) {
      const issue = issues.get(number);
      const count = getCounts.get(number) ?? 0;
      getCounts.set(number, count + 1);
      const result = structuredClone(issue);
      if (count === 0 && concurrentHumanNote) issue.body += `\n${concurrentHumanNote}\n`;
      return result;
    },
    async listComments(number) { return structuredClone(comments.get(number) ?? []); },
    async createComment({ issueNumber, body }) {
      const rows = comments.get(issueNumber) ?? [];
      const comment = { id: rows.length + 1, body };
      rows.push(comment);
      comments.set(issueNumber, rows);
      return structuredClone(comment);
    },
    async getRelationships(id) { return structuredClone(relationships.get(id)); },
    async patchIssue(patch) {
      calls.push(structuredClone(patch));
      const issue = issues.get(patch.issueNumber);
      if (Object.hasOwn(patch, 'body')) issue.body = patch.body;
      if (Object.hasOwn(patch, 'state')) issue.state = patch.state;
      if (Object.hasOwn(patch, 'stateReason')) issue.state_reason = patch.stateReason;
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

test('refresh verifies reconstructed full source SHA after status-only exports', async () => {
  const original = sourceCatalog.prompts.find(({ id }) => id === '181');
  const rowSourceSha256 = createHash('sha256').update(JSON.stringify(JSON.parse(stableCatalogJson({ ...original, status: 'missing' })))).digest('hex');
  const crosswalk = crosswalkFor([promptRecord({ sourceSha256: rowSourceSha256 })]);
  const tamperedSource = Buffer.from(stableCatalogJson({ ...sourceCatalog, untrackedSourceField: 'not in original snapshot' }));
  await assert.rejects(readGitHubPromptCatalog({
    sourceBytes: tamperedSource,
    transport: fakeTransport([promptIssue()]),
    crosswalk,
  }), /outside source-reviewed definitions/);
});

test('source-reviewed prompt definition edits preserve immutable origin provenance', async () => {
  const prompts = sourceCatalog.prompts.map((prompt) => ['181', '610'].includes(prompt.id)
    ? { ...prompt, definition: { ...prompt.definition, title: `${prompt.id} source-reviewed title update.` } }
    : prompt);
  const editedSource = Buffer.from(stableCatalogJson({ ...sourceCatalog, prompts }));
  const original = sourceCatalog.prompts.find(({ id }) => id === '181');
  const rowSourceSha256 = createHash('sha256').update(JSON.stringify(JSON.parse(stableCatalogJson({ ...original, status: 'missing' })))).digest('hex');
  const crosswalk = crosswalkFor([promptRecord({ sourceSha256: rowSourceSha256 })]);
  const result = await readGitHubPromptCatalog({
    sourceBytes: editedSource,
    transport: fakeTransport([promptIssue()]),
    crosswalk,
  });
  assert.equal(result.catalog.prompts.find(({ id }) => id === '181').definition.title, '181 source-reviewed title update.');
  assert.equal(result.catalog.prompts.find(({ id }) => id === '610').definition.title, '610 source-reviewed title update.');
  assert.equal(result.trackerSnapshot.originSourceSha256, sourceSha256);
});

test('brief-only source blocker documentation does not reinterpret prompt acceptance prose', async () => {
  const issue = promptIssue({ body: `${promptIssue().body}Blocked-by brief IDs: 22, 23\n` });
  const result = await readGitHubPromptCatalog({
    sourceBytes,
    transport: fakeTransport([issue]),
    crosswalk: crosswalkFor([promptRecord()]),
  });
  assert.equal(result.issueCount, 1);
});

test('accepted update exports, refreshes, and reopens without losing source fields or hash continuity', async () => {
  const transport = fakeTransport([promptIssue()]);
  const expectedRecord = promptRecord({
    sourceSha256: createHash('sha256').update(JSON.stringify(JSON.parse(stableCatalogJson({
      ...sourceCatalog.prompts.find(({ id }) => id === '181'),
      status: 'missing',
    })))).digest('hex'),
  });
  await updateGitHubIssueState({
    transport,
    issueNumber: 181,
    expectedRecord,
    changes: { status: 'done', reviewed: true, accepted: true, evidenceReferences: [evidenceReference] },
  });
  const completedExport = await readGitHubPromptCatalog({
    sourceBytes,
    transport,
    crosswalk: crosswalkFor([expectedRecord]),
  });
  assert.equal(completedExport.catalog.prompts.find(({ id }) => id === '181').status, 'done');

  await updateGitHubIssueState({ transport, issueNumber: 181, expectedRecord, changes: { status: 'partial' } });
  const reopenedExport = await readGitHubPromptCatalog({
    sourceBytes: Buffer.from(completedExport.catalogSource),
    transport,
    crosswalk: crosswalkFor([expectedRecord]),
  });
  const original = sourceCatalog.prompts.find(({ id }) => id === '181');
  const reopened = reopenedExport.catalog.prompts.find(({ id }) => id === '181');
  assert.deepEqual(reopened, { ...original, status: 'partial' });
  const repeatedRefresh = await readGitHubPromptCatalog({
    sourceBytes: Buffer.from(reopenedExport.catalogSource),
    transport,
    crosswalk: crosswalkFor([expectedRecord]),
  });
  assert.deepEqual(repeatedRefresh.catalog.prompts.find(({ id }) => id === '181'), reopened);
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

  const falselyMarkedDone = structuredClone(withoutEvidence);
  falselyMarkedDone.body = falselyMarkedDone.body
    .replace('Prompt status: partial', 'Prompt status: done\nPrevious incomplete status: missing');
  const closureOnly = await readGitHubPromptCatalog({ ...args, transport: fakeTransport([falselyMarkedDone]) });
  assert.equal(closureOnly.catalog.prompts.find(({ id }) => id === '181').status, 'missing');

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

test('an invalid done fallback cannot turn an open prompt into completed work', async () => {
  const issue = promptIssue({
    body: `${promptIssue().body}\n<!-- DOW-TRACKER-OWNED-START -->\nPrompt status: done\nPrevious incomplete status: done\n<!-- DOW-TRACKER-OWNED-END -->\n`,
  });
  const result = await readGitHubPromptCatalog({
    sourceBytes,
    transport: fakeTransport([issue]),
    crosswalk: crosswalkFor([promptRecord({ initialStatus: 'missing' })]),
  });
  assert.equal(result.catalog.prompts.find(({ id }) => id === '181').status, 'missing');
});

test('a dependency reopen is rejected before the invalid catalog reaches a consumer', async () => {
  const records = [
    promptRecord({ legacyId: '541', migrationId: 'DOW-PROMPT-541', issueId: 5410, issueNumber: 541, initialStatus: 'partial', sourceReferences: ['docs/implementation-prompts.json#541'] }),
    promptRecord({ legacyId: '542', migrationId: 'DOW-PROMPT-542', issueId: 5420, issueNumber: 542, initialStatus: 'missing', sourceReferences: ['docs/implementation-prompts.json#542'], blockedByMigrationIds: ['DOW-PROMPT-541'] }),
  ];
  const makeIssue = (record, status, extra = '') => promptIssue({
    id: record.issueId,
    number: record.issueNumber,
    body: `Migration ID: ${record.migrationId}\nSource status: ${record.initialStatus}\nSource reference: ${record.sourceReferences[0]}\n<!-- DOW-TRACKER-OWNED-START -->\nPrompt status: ${status}${extra}\n<!-- DOW-TRACKER-OWNED-END -->\n`,
  });
  const first = { ...makeIssue(records[0], 'done', `\nPrevious incomplete status: partial\nCompletion: reviewed-accepted\nEvidence references: ${evidenceReference}`), state: 'closed', state_reason: 'completed' };
  const second = makeIssue(records[1], 'missing');
  const transport = fakeTransport([first, second], [[5420, { parentIssueIds: [], blockedByIssueIds: [5410] }]]);
  const crosswalk = crosswalkFor(records);
  await updateGitHubIssueState({ transport, issueNumber: 542, expectedRecord: records[1], changes: { status: 'done', reviewed: true, accepted: true, evidenceReferences: [evidenceReference] } });
  const validBaseline = await readGitHubPromptCatalog({ sourceBytes, transport, crosswalk });
  await assert.rejects(updateGitHubIssueState({
    transport,
    issueNumber: 541,
    expectedRecord: records[0],
    changes: { status: 'partial' },
    validateProjection: ({ fields }) => {
      const projected = structuredClone(validBaseline.catalog);
      projected.prompts.find(({ id }) => id === '541').status = fields['Prompt status'];
      const errors = validatePromptCatalog(projected);
      if (errors.length) throw new Error(errors.join('; '));
    },
  }), /hard prerequisite|prerequisite/);
  assert.equal((await transport.getIssue(541)).state, 'closed');
  assert.doesNotReject(readGitHubPromptCatalog({ sourceBytes, transport, crosswalk }));
});

test('tracker update preserves prose added after its initial issue read', async () => {
  const transport = fakeTransport([promptIssue()], [], { concurrentHumanNote: 'Human note added during update.' });
  await updateGitHubIssueState({ transport, issueNumber: 181, expectedRecord: promptRecord(), changes: { status: 'done', reviewed: true, accepted: true, evidenceReferences: [evidenceReference] } });
  const issue = await transport.getIssue(181);
  assert.match(issue.body, /Human note added during update\./);
  assert.equal(transport.calls.length, 1);
  assert.equal(Object.hasOwn(transport.calls[0], 'body'), false);
  assert.match((await transport.listComments(181)).at(-1).body, /DOW-TRACKER-STATE:v1/);
});

test('uncertain comment creation is recovered by exact readback without duplicating state', async () => {
  const transport = fakeTransport([promptIssue()]);
  const createComment = transport.createComment.bind(transport);
  transport.createComment = async (args) => {
    await createComment(args);
    throw new Error('simulated response loss after comment creation');
  };
  await updateGitHubIssueState({ transport, issueNumber: 181, expectedRecord: promptRecord(), changes: { status: 'partial' } });
  assert.equal((await transport.listComments(181)).length, 1);
});

test('malformed latest tracker state comment fails closed', async () => {
  const transport = fakeTransport([promptIssue()]);
  await transport.createComment({ issueNumber: 181, body: '<!-- DOW-TRACKER-STATE:v1 -->\n{broken' });
  await assert.rejects(readGitHubPromptCatalog({
    sourceBytes,
    transport,
    crosswalk: crosswalkFor([promptRecord()]),
  }), /tracker-owned state comment is malformed/);
});

test('tracker snapshot captures brief execution when the catalog JSON does not change', async () => {
  const record = {
    legacyId: '61-pt7',
    migrationId: 'DOW-BRIEF-PT7',
    recordKind: 'execution-brief',
    issueId: 6100,
    issueNumber: 610,
    initialReadiness: 'ready-for-agent',
    initialExecution: 'paused',
    sourceReferences: ['docs/pc10-tickets/61-pt7.md#pt7'],
    parentMigrationIds: [],
    blockedByMigrationIds: [],
  };
  const issue = {
    id: 6100,
    number: 610,
    title: 'PT7 execution brief',
    body: 'Migration ID: DOW-BRIEF-PT7\nReadiness: ready-for-agent\nExecution: paused\nSource reference: docs/pc10-tickets/61-pt7.md#pt7\n',
    state: 'open',
    state_reason: null,
  };
  const transport = fakeTransport([issue]);
  const crosswalk = crosswalkFor([record]);
  const before = await readGitHubPromptCatalog({ sourceBytes, transport, crosswalk });
  await updateGitHubIssueState({ transport, issueNumber: 610, expectedRecord: record, changes: { brief: { Execution: 'in-progress' } } });
  const after = await readGitHubPromptCatalog({ sourceBytes, transport, crosswalk });
  assert.equal(after.catalogSource, before.catalogSource);
  assert.notDeepEqual(after.trackerSnapshot.issueStates, before.trackerSnapshot.issueStates);
  assert.equal(after.trackerSnapshot.issueStates[0].execution, 'in-progress');
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

test('refresh rejects drift in the imported future hold wording', async () => {
  const issue = {
    id: 5000,
    number: 500,
    title: 'Legacy execution brief',
    body: 'Migration ID: DOW-BRIEF-FUTURE-01\nSource status: Prepared future scope; preserve trigger.\nReadiness: held\nExecution: inactive\nSource reference: docs/future-tickets/example.md#future-01\n<!-- DOW-TRACKER-OWNED-START -->\nReadiness: held\nExecution: inactive\nHold: inactive; edited hold text.\nOriginal hold status: Prepared future scope; edited trigger.\n<!-- DOW-TRACKER-OWNED-END -->\n',
    state: 'open',
    state_reason: null,
  };
  await assert.rejects(readGitHubPromptCatalog({
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
  }), /Future hold provenance mismatch/);
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
      holdKind: 'prepared-sequence-trigger',
      originalHoldStatus: 'Prepared future scope; preserve trigger.',
      sourceReferences: ['docs/future-tickets/example.md#future-01'],
      parentMigrationIds: [],
      blockedByMigrationIds: [],
    },
    changes: { brief: { 'Original hold status': 'Active now.' } },
  }), /Future brief hold provenance is immutable/);
  assert.equal(transport.calls.length, 0);
});

test('held future briefs cannot be completed before their trigger is active', async () => {
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
      holdKind: 'prepared-sequence-trigger',
      originalHoldStatus: 'Prepared future scope; preserve trigger.',
      sourceReferences: ['docs/future-tickets/example.md#future-01'],
      parentMigrationIds: [],
      blockedByMigrationIds: [],
    },
    changes: { closeAs: 'completed', reviewed: true, accepted: true, evidenceReferences: [evidenceReference] },
  }), /Held future briefs cannot be completed while held/);
  assert.equal(transport.calls.length, 0);
});

test('a future hold can be deliberately released with accepted local trigger evidence and survives refresh', async () => {
  const issue = {
    id: 5000,
    number: 500,
    title: 'Legacy execution brief',
    body: 'Human note: retain this note.\n\nMigration ID: DOW-BRIEF-FUTURE-01\nSource status: Prepared future scope; preserve trigger.\nHold: inactive; preserve the source trigger and sequence.\nReadiness: held\nExecution: inactive\nSource reference: docs/future-tickets/example.md#future-01\n',
    state: 'open',
    state_reason: null,
  };
  const record = {
    issueId: 5000,
    issueNumber: 500,
    migrationId: 'DOW-BRIEF-FUTURE-01',
    recordKind: 'held-future-brief',
    holdKind: 'prepared-sequence-trigger',
    originalHoldStatus: 'Prepared future scope; preserve trigger.',
    sourceReferences: ['docs/future-tickets/example.md#future-01'],
    parentMigrationIds: [],
    blockedByMigrationIds: [],
  };
  const transport = fakeTransport([issue]);
  const released = await updateGitHubIssueState({
    transport,
    issueNumber: 500,
    expectedRecord: record,
    changes: {
      releaseHold: true,
      reviewed: true,
      accepted: true,
      evidenceReferences: [evidenceReference],
    },
  });
  assert.match(released.issue.body, /Hold: inactive; preserve the source trigger and sequence\./);
  assert.match(released.issue.body, /Source status: Prepared future scope; preserve trigger\./);
  assert.equal(released.fields.Hold, 'released');
  assert.equal(released.fields['Original hold status'], 'Prepared future scope; preserve trigger.');
  assert.equal(released.fields['Hold release evidence'], 'docs/README.md#tracker');
  assert.equal(released.fields.Readiness, 'ready');
  assert.equal(released.fields.Execution, 'inactive');

  await updateGitHubIssueState({ transport, issueNumber: 500, expectedRecord: record, changes: { closeAs: 'not_planned' } });
  const reopened = await updateGitHubIssueState({ transport, issueNumber: 500, expectedRecord: record, changes: { reopen: true } });
  assert.equal(reopened.issue.state, 'open');
  assert.equal(reopened.fields.Hold, 'released');
  assert.equal(reopened.fields['Hold release evidence'], 'docs/README.md#tracker');

  const crosswalk = crosswalkFor([{ ...record, legacyId: 'future-01', initialReadiness: 'held', initialExecution: 'inactive' }]);
  const refreshed = await readGitHubPromptCatalog({ sourceBytes, transport, crosswalk, cwd: process.cwd() });
  assert.equal(refreshed.issueStates[0].hold, 'released');
  assert.equal(refreshed.issueStates[0].readiness, 'ready');
  assert.equal(refreshed.issueStates[0].completion, 'not-closed');
});

test('future hold release requires reviewed accepted local evidence', async () => {
  const transport = fakeTransport([{
    id: 5000,
    number: 500,
    title: 'Legacy execution brief',
    body: 'Migration ID: DOW-BRIEF-FUTURE-01\nSource status: Prepared future scope; preserve trigger.\nHold: inactive; preserve the source trigger and sequence.\nReadiness: held\nExecution: inactive\nSource reference: docs/future-tickets/example.md#future-01\n',
    state: 'open',
    state_reason: null,
  }]);
  await assert.rejects(updateGitHubIssueState({
    transport,
    issueNumber: 500,
    expectedRecord: {
      issueId: 5000,
      issueNumber: 500,
      migrationId: 'DOW-BRIEF-FUTURE-01',
      recordKind: 'held-future-brief',
      holdKind: 'prepared-sequence-trigger',
      originalHoldStatus: 'Prepared future scope; preserve trigger.',
      sourceReferences: ['docs/future-tickets/example.md#future-01'],
      parentMigrationIds: [],
      blockedByMigrationIds: [],
    },
    changes: { releaseHold: true, reviewed: true, accepted: true, evidenceReferences: ['docs/missing.md#trigger'] },
  }), /Hold release requires reviewed, accepted local trigger\/authorization evidence/);
  assert.equal(transport.calls.length, 0);
});

test('field-scoped update preserves human prose and verifies native state and relationships', async () => {
  const issue = promptIssue();
  const transport = fakeTransport([issue]);
  const result = await updateGitHubIssueState({ transport, issueNumber: 181, expectedRecord: promptRecord(), changes: { status: 'done', reviewed: true, accepted: true, evidenceReferences: [evidenceReference] } });
  assert.equal(result.issue.body.startsWith('Human note: please keep this prose.'), true);
  assert.match(result.issue.body, /Migration ID: DOW-PROMPT-181/);
  assert.equal(result.fields['Prompt status'], 'done');
  assert.equal(result.issue.state, 'closed');
  assert.equal(result.issue.stateReason, 'completed');
  assert.equal(transport.calls.length, 1);
  assert.deepEqual(transport.calls[0], {
    issueNumber: 181,
    state: 'closed',
    stateReason: 'completed',
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

test('manual incomplete status change preserves the prior reopen status', async () => {
  const issue = promptIssue({
    body: `${promptIssue().body}\n<!-- DOW-TRACKER-OWNED-START -->\nPrompt status: done\nPrevious incomplete status: partial\nCompletion: reviewed-accepted\nEvidence references: ${evidenceReference}\n<!-- DOW-TRACKER-OWNED-END -->\n`,
    state: 'closed',
    state_reason: 'completed',
  });
  const result = await updateGitHubIssueState({ transport: fakeTransport([issue]), issueNumber: 181, changes: { status: 'missing' } });
  assert.equal(result.fields['Prompt status'], 'missing');
  assert.equal(result.fields['Previous incomplete status'], 'partial');
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

test('logical dependency projection includes explicitly retained equivalent edges without pretending they are native', async () => {
  const records = [
    { legacyId: 'brief-1', migrationId: 'DOW-BRIEF-1', recordKind: 'execution-brief', issueId: 6100, issueNumber: 610, sourceReferences: ['docs/pc10-tickets/brief-1.md#one'], parentMigrationIds: [], blockedByMigrationIds: ['DOW-BRIEF-2'], equivalentBlockedByMigrationIds: ['DOW-BRIEF-3'], sourceBlockedByBriefIds: ['brief-2', 'brief-3', 'retained-brief'], historyReferences: ['docs/pc10-tickets/retained.md#retained-brief'] },
    { legacyId: 'brief-2', migrationId: 'DOW-BRIEF-2', recordKind: 'execution-brief', issueId: 6200, issueNumber: 620, sourceReferences: ['docs/pc10-tickets/brief-2.md#two'], parentMigrationIds: [], blockedByMigrationIds: [] },
    { legacyId: 'brief-3', migrationId: 'DOW-BRIEF-3', recordKind: 'execution-brief', issueId: 6300, issueNumber: 630, sourceReferences: ['docs/pc10-tickets/brief-3.md#three'], parentMigrationIds: [], blockedByMigrationIds: [] },
  ];
  const issue = (id, number, marker, reference, sourceBlockers = '') => ({
    id,
    number,
    title: `Brief ${number}`,
    body: `Migration ID: ${marker}\nSource reference: ${reference}\n${sourceBlockers}Readiness: ready\nExecution: inactive\n`,
    state: 'open',
    state_reason: null,
  });
  const transport = fakeTransport([
    issue(6100, 610, 'DOW-BRIEF-1', 'docs/pc10-tickets/brief-1.md#one', 'Blocked-by brief IDs: brief-2, brief-3, retained-brief\nEquivalent blocked-by issue references: DOW-BRIEF-3\n'),
    issue(6200, 620, 'DOW-BRIEF-2', 'docs/pc10-tickets/brief-2.md#two'),
    issue(6300, 630, 'DOW-BRIEF-3', 'docs/pc10-tickets/brief-3.md#three'),
  ], [[6100, { parentIssueIds: [], blockedByIssueIds: [6200] }]]);
  const retained = [{ sourceId: 'retained-brief', sourceReference: 'docs/pc10-tickets/retained.md', disposition: 'retained-acceptance-no-issue' }];
  const result = await readGitHubPromptCatalog({ sourceBytes, transport, crosswalk: crosswalkFor(records, retained) });
  const target = result.issueStates.find(({ migrationId }) => migrationId === 'DOW-BRIEF-1');
  assert.deepEqual(target.nativeBlockedByMigrationIds, ['DOW-BRIEF-2']);
  assert.deepEqual(target.blockedByMigrationIds, ['DOW-BRIEF-2', 'DOW-BRIEF-3']);

  const missingEquivalent = fakeTransport([
    issue(6100, 610, 'DOW-BRIEF-1', 'docs/pc10-tickets/brief-1.md#one', 'Blocked-by brief IDs: brief-2, brief-3, retained-brief\n'),
    issue(6200, 620, 'DOW-BRIEF-2', 'docs/pc10-tickets/brief-2.md#two'),
    issue(6300, 630, 'DOW-BRIEF-3', 'docs/pc10-tickets/brief-3.md#three'),
  ], [[6100, { parentIssueIds: [], blockedByIssueIds: [6200] }]]);
  await assert.rejects(readGitHubPromptCatalog({ sourceBytes, transport: missingEquivalent, crosswalk: crosswalkFor(records, retained) }), /Equivalent blocker documentation mismatch/);
});

test('REST adapter uses append-only state comments, body-free state PATCH, and full paging', async () => {
  const requests = [];
  let current = promptIssue();
  let issueComments = [];
  const pageOne = [current, ...Array.from({ length: 99 }, (_, index) => ({
    id: 2000 + index,
    number: 2000 + index,
    title: `Page one ${index}`,
    body: '',
    state: 'open',
  }))];
  const pageTwo = [{ id: 3000, number: 3000, title: 'Page two', body: '', state: 'open' }];
  const fetchImpl = async (url, options) => {
    requests.push({ url: String(url), options });
    if (String(url).includes('/issues?')) {
      return { ok: true, status: 200, async json() { return String(url).includes('page=2') ? pageTwo : pageOne; } };
    }
    if (String(url).endsWith('/issues/181/comments?per_page=100&page=1')) return { ok: true, status: 200, async json() { return issueComments; } };
    if (String(url).endsWith('/issues/181/comments') && options.method === 'POST') {
      const comment = { id: 1, body: JSON.parse(options.body).body };
      issueComments = [...issueComments, comment];
      return { ok: true, status: 201, async json() { return comment; } };
    }
    if (String(url).endsWith('/issues/181/parent')) {
      return { ok: false, status: 404, async json() { return {}; } };
    }
    if (String(url).includes('/dependencies/blocked_by')) {
      return { ok: true, status: 200, async json() { return []; } };
    }
    if (String(url).endsWith('/issues/181') && options.method === 'PATCH') {
      const patch = JSON.parse(options.body);
      current = { ...current, state: patch.state, state_reason: patch.state_reason };
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
  assert.equal(listed.length, 101);
  assert.match(requests[0].url, /issues\?state=all&per_page=100&page=1$/);
  assert.match(requests[1].url, /issues\?state=all&per_page=100&page=2$/);
  await transport.getRelationships(current.id);
  await transport.createComment({ issueNumber: 181, body: '<!-- DOW-TRACKER-STATE:v1 -->\n{}\n<!-- /DOW-TRACKER-STATE -->' });
  const patched = await transport.patchIssue({ issueNumber: 181, state: 'closed', stateReason: 'completed' });
  assert.equal(patched.body, promptIssue().body);
  assert.match(issueComments[0].body, /DOW-TRACKER-STATE:v1/);
  const patchRequest = requests.find(({ options }) => options.method === 'PATCH');
  assert.deepEqual(JSON.parse(patchRequest.options.body), { state: 'closed', state_reason: 'completed' });
  assert.equal(patchRequest.options.headers.Authorization, 'Bearer fixture-token');
});
