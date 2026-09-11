import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { lstat, mkdir, mkdtemp, readFile, rm, symlink, unlink, writeFile } from 'node:fs/promises';
import { tmpdir, userInfo } from 'node:os';
import { resolve } from 'node:path';
import {
  createDependencyPacket,
  dependencyReceiptMetadata,
  dependencyReceiptPath,
  formatDependencyPacket,
  readDependencyReceipt,
  resolveCurrentMainSha,
  validateDependencyReceipt,
  validateOrRefreshCompletionDependencyReceipt,
  writeDependencyReceipt,
// @ts-expect-error The executable JavaScript module is exercised directly rather than through a generated declaration.
} from '../../scripts/prompt-dependencies.mjs';

const authoritySources = {
  plan: await readFile(resolve(process.cwd(), 'docs/IMPLEMENTATION_PLAN.md'), 'utf8'),
  progress: await readFile(resolve(process.cwd(), 'docs/IMPLEMENTATION_PROGRESS.md'), 'utf8'),
  dependency: await readFile(resolve(process.cwd(), 'docs/IMPLEMENTATION_PROMPT_DEPENDENCIES.md'), 'utf8'),
  milestones: await readFile(resolve(process.cwd(), 'docs/IMPLEMENTATION_MILESTONES.md'), 'utf8'),
};

function pendingPrompt666Sources() {
  if (authoritySources.plan.includes('- [ ] Prompt 666')) return authoritySources;
  return {
    ...authoritySources,
    plan: authoritySources.plan.replace('- [x] Prompt 666', '- [ ] Prompt 666'),
    progress: authoritySources.progress
      .replace('**94 / 734 prompts complete (12.81%)**', '**93 / 734 prompts complete (12.67%)**')
      .replace(
        'Status breakdown: **94 done · 25 partial · 0 active · 615 missing**.',
        'Status breakdown: **93 done · 26 partial · 0 active · 615 missing**.',
      )
      .replace('| 666 | done |', '| 666 | partial |'),
    dependency: authoritySources.dependency.replace(
      '| 666 | EXTEND | done | 665 |',
      '| 666 | EXTEND | partial | 665 |',
    ),
  };
}

function pendingPrompt014Sources() {
  if (authoritySources.plan.includes('- [ ] Prompt 014')) return authoritySources;
  return {
    ...authoritySources,
    plan: authoritySources.plan.replace('- [x] Prompt 014', '- [ ] Prompt 014'),
    progress: authoritySources.progress
      .replace('**95 / 734 prompts complete (12.94%)**', '**94 / 734 prompts complete (12.81%)**')
      .replace(
        'Status breakdown: **95 done · 24 partial · 0 active · 615 missing**.',
        'Status breakdown: **94 done · 25 partial · 0 active · 615 missing**.',
      )
      .replace(
        /\| 014 \| done \| non-feature \| — \|.*\|/,
        '| 014 | partial | non-feature | — | Revision fields/parsing exist; universal stale-mutation semantics remain open. |',
      ),
    dependency: authoritySources.dependency.replace(
      '| 014 | PRESERVE | done |',
      '| 014 | PRESERVE | partial |',
    ),
  };
}

const sources = pendingPrompt666Sources();

const expectedWolfOrder = [
  '425', '426', '428', '427', '432', '432a', '433', '433a', '433b', '434', '434a',
  ...Array.from({ length: 10 }, (_, index) => String(435 + index)),
  ...Array.from({ length: 29 }, (_, index) => String(445 + index)),
  ...Array.from({ length: 8 }, (_, index) => String(475 + index)),
  '474', '484', '621', '645',
];

const binding = (worktree: string) => ({
  owner: `${userInfo().username}:${process.getuid?.() ?? 'unknown'}`,
  worktree,
  branch: 'tooling/prompt-666-test',
  prompt: '666',
  changeClass: 'non-feature',
  startBranchSha: 'a'.repeat(40),
  startMainSha: 'b'.repeat(40),
  mainSha: 'b'.repeat(40),
});

const relevantEntry = (worktree: string) => ({
  id: 'other-owner',
  status: 'active',
  repositoryRoot: worktree,
  repositoryIdentity: '/tmp/repository.git',
  worktree: '/tmp/other-worktree',
  implementationPrompt: '014',
  scopes: ['scripts/prompt-dependencies.mjs'],
  claims: [],
});

const ownerEntry = (worktree: string) => ({
  id: 'p666-owner',
  status: 'active',
  repositoryRoot: worktree,
  repositoryIdentity: '/tmp/repository.git',
  worktree,
  implementationPrompt: '666',
  scopes: ['scripts/prompt-dependencies.mjs'],
  claims: ['prompt-666'],
});

function git(cwd: string, args: string[]) {
  return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
}

function completeAuthority(
  pending: typeof sources,
  prompt: string,
  tag: string,
) {
  const completion = pending.progress.match(/\*\*(\d+) \/ (\d+) prompts complete \(\d+\.\d+%\)\*\*/);
  const breakdown = pending.progress.match(
    /Status breakdown: \*\*(\d+) done · (\d+) partial · (\d+) active · (\d+) missing\*\*\./,
  );
  if (!completion || !breakdown) throw new Error('fixture progress summary is missing');
  const completed = Number(completion[1]) + 1;
  const total = Number(completion[2]);
  const done = Number(breakdown[1]) + 1;
  const partial = Number(breakdown[2]) - 1;
  return {
    ...pending,
    plan: pending.plan.replace(`- [ ] Prompt ${prompt}`, `- [x] Prompt ${prompt}`),
    progress: pending.progress
      .replace(completion[0], `**${completed} / ${total} prompts complete (${((completed / total) * 100).toFixed(2)}%)**`)
      .replace(
        breakdown[0],
        `Status breakdown: **${done} done · ${partial} partial · ${breakdown[3]} active · ${breakdown[4]} missing**.`,
      )
      .replace(`Prompt ${prompt} is partial`, `Prompt ${prompt} is done`)
      .replace(`| ${prompt} | partial |`, `| ${prompt} | done |`),
    dependency: pending.dependency.replace(
      `| ${prompt} | ${tag} | partial |`,
      `| ${prompt} | ${tag} | done |`,
    ),
  };
}

function p014CompletionEvidence(sources: typeof authoritySources, count: number) {
  return {
    ...sources,
    progress: sources.progress.replace(
      /\| 014 \| done \| non-feature \| — \|.*\|/,
      '| 014 | done | non-feature | — | Shared session-authority cursors preserve visibly stale cached rendering while rejecting stale/late callable, listener, queued, and secondary-projection results from authorizing mutations or overwriting newer authority. Focused rebased-candidate coverage: ' +
        `${count} tests passed across session, Firestore, airspace, secondary mutation, App, and header surfaces. |`,
    ),
  };
}

async function completionFixture({
  prompt = '668',
  tag = 'EXTEND',
  policy = 'required',
}: {
  prompt?: string;
  tag?: string;
  policy?: 'required' | 'legacy-refreshed';
} = {}) {
  const pending = prompt === '668'
    ? Object.fromEntries(Object.entries(sources).map(([key, value]) => [key, value.replaceAll('666', '668')])) as typeof sources
    : prompt === '014'
      ? pendingPrompt014Sources()
      : sources;
  const root = await mkdtemp(resolve(tmpdir(), `p${prompt}-completion-nonce-`));
  const docs = resolve(root, 'docs');
  await mkdir(docs, { recursive: true });
  const paths = {
    plan: 'IMPLEMENTATION_PLAN.md',
    progress: 'IMPLEMENTATION_PROGRESS.md',
    dependency: 'IMPLEMENTATION_PROMPT_DEPENDENCIES.md',
    milestones: 'IMPLEMENTATION_MILESTONES.md',
  } as const;
  for (const [name, content] of Object.entries(pending)) {
    await writeFile(resolve(docs, paths[name as keyof typeof paths]), content);
  }
  git(root, ['init', '-b', 'main']);
  git(root, ['config', 'user.email', 'fixture@example.test']);
  git(root, ['config', 'user.name', 'Fixture']);
  git(root, ['add', '.']);
  git(root, ['commit', '-m', `partial P${prompt} authority`]);
  const startSha = git(root, ['rev-parse', 'HEAD']);
  const branch = `tooling/p${prompt}-completion`;
  git(root, ['switch', '-c', branch]);
  const entry = {
    id: `p${prompt}-owner`,
    status: 'active',
    repositoryRoot: root,
    repositoryIdentity: `${root}/.git`,
    worktree: root,
    implementationPrompt: prompt,
    changeClass: 'non-feature',
    branchName: branch,
    startBranchSha: startSha,
    startMainSha: startSha,
    scopes: ['scripts/prompt-dependencies.mjs'],
    claims: [`prompt-${prompt}`],
  };
  const context = {
    prompt,
    sources: pending,
    binding: {
      owner: `${userInfo().username}:${process.getuid?.() ?? 'unknown'}`,
      worktree: root,
      branch,
      prompt,
      changeClass: 'non-feature',
      startBranchSha: startSha,
      startMainSha: startSha,
      mainSha: startSha,
    },
    coordinationState: { entries: [entry] },
    requestedScopes: entry.scopes,
    requestedClaims: entry.claims,
    repositoryRoot: root,
    repositoryIdentity: entry.repositoryIdentity,
  };
  await writeDependencyReceipt(createDependencyPacket(context));
  const priorReceipt = await readDependencyReceipt(context.binding);
  const issuedEntry = entry as typeof entry & { dependencyReceipt: Record<string, unknown> };
  issuedEntry.dependencyReceipt = dependencyReceiptMetadata(priorReceipt, policy);
  const completed = completeAuthority(pending, prompt, tag);
  const done = prompt === '014' ? p014CompletionEvidence(completed, 247) : completed;
  for (const [name, content] of Object.entries(done)) {
    await writeFile(resolve(docs, paths[name as keyof typeof paths]), content);
  }
  git(root, ['add', 'docs']);
  git(root, ['commit', '-m', `complete P${prompt} authority`]);
  return {
    root,
    entry: issuedEntry,
    pending,
    priorReceipt,
    context: { ...context, sources: done },
  };
}

describe('compact prompt dependency packets', () => {
  it('permits only a committed P014 completion-evidence correction after consuming its receipt', async () => {
    const fixture = await completionFixture({ prompt: '014', tag: 'PRESERVE', policy: 'legacy-refreshed' });
    try {
      const consumed = await validateOrRefreshCompletionDependencyReceipt({
        context: fixture.context,
        entry: fixture.entry,
        exactLegacyMigration: true,
        allowRefresh: true,
      });
      fixture.entry.dependencyReceipt = dependencyReceiptMetadata(consumed, 'completion-refreshed');
      const corrected = { ...fixture.context, sources: p014CompletionEvidence(fixture.context.sources, 253) };

      await expect(validateOrRefreshCompletionDependencyReceipt({
        context: corrected,
        entry: fixture.entry,
        exactLegacyMigration: true,
        allowRefresh: false,
      })).resolves.toEqual(consumed);

      const driftedContexts = [
        {
          label: 'another prompt row',
          context: {
            ...corrected,
            sources: {
              ...corrected.sources,
              progress: corrected.sources.progress.replace('| 015 | partial | feature |', '| 015 | done | feature |'),
            },
          },
        },
        {
          label: 'aggregate counts',
          context: {
            ...corrected,
            sources: {
              ...corrected.sources,
              progress: corrected.sources.progress.replace('**95 / 734 prompts complete (12.94%)**', '**96 / 734 prompts complete (13.08%)**'),
            },
          },
        },
        {
          label: 'selected prompt status',
          context: {
            ...corrected,
            sources: {
              ...corrected.sources,
              progress: corrected.sources.progress.replace('| 014 | done |', '| 014 | partial |'),
            },
          },
        },
        {
          label: 'plan authority',
          context: {
            ...corrected,
            sources: { ...corrected.sources, plan: `${corrected.sources.plan}\n` },
          },
        },
        {
          label: 'dependency authority',
          context: {
            ...corrected,
            sources: { ...corrected.sources, dependency: `${corrected.sources.dependency}\n` },
          },
        },
        {
          label: 'milestone authority',
          context: {
            ...corrected,
            sources: { ...corrected.sources, milestones: `${corrected.sources.milestones}\n` },
          },
        },
      ];
      for (const { label, context } of driftedContexts) {
        await expect(validateOrRefreshCompletionDependencyReceipt({
          context,
          entry: fixture.entry,
          exactLegacyMigration: true,
          allowRefresh: false,
        }), label).rejects.toThrow(/authority|transition|drift|completion|evidence/i);
      }

      await expect(validateOrRefreshCompletionDependencyReceipt({
        context: {
          ...corrected,
          binding: { ...corrected.binding, mainSha: 'f'.repeat(40) },
        },
        entry: fixture.entry,
        exactLegacyMigration: true,
        allowRefresh: false,
      })).rejects.toThrow(/binding|predecessor/i);
      await expect(validateOrRefreshCompletionDependencyReceipt({
        context: { ...corrected, requestedScopes: ['scripts/other.mjs'] },
        entry: fixture.entry,
        exactLegacyMigration: true,
        allowRefresh: false,
      })).rejects.toThrow(/scope|claim|authority|binding/i);
      await expect(validateOrRefreshCompletionDependencyReceipt({
        context: { ...corrected, requestedClaims: ['prompt-014-drift'] },
        entry: fixture.entry,
        exactLegacyMigration: true,
        allowRefresh: false,
      })).rejects.toThrow(/scope|claim|authority|binding/i);
      await expect(validateOrRefreshCompletionDependencyReceipt({
        context: {
          ...corrected,
          coordinationState: {
            entries: [{
              ...relevantEntry(fixture.root),
              repositoryIdentity: fixture.entry.repositoryIdentity,
            }, fixture.entry],
          },
        },
        entry: fixture.entry,
        exactLegacyMigration: true,
        allowRefresh: false,
      })).rejects.toThrow(/scope|claim|authority|binding/i);
      await expect(validateOrRefreshCompletionDependencyReceipt({
        context: corrected,
        entry: fixture.entry,
        exactLegacyMigration: true,
        allowRefresh: true,
      })).rejects.toThrow(/second refresh|already consumed/i);

      const receiptPath = dependencyReceiptPath(fixture.root, '014');
      const originalReceipt = await readFile(receiptPath, 'utf8');
      await unlink(receiptPath);
      await expect(validateOrRefreshCompletionDependencyReceipt({
        context: corrected,
        entry: fixture.entry,
        exactLegacyMigration: true,
        allowRefresh: false,
      })).rejects.toThrow(/missing/i);
      await writeFile(receiptPath, originalReceipt);

      const forgedReceipt = JSON.parse(originalReceipt) as {
        completion: { anchor: { authority: Record<string, string> } };
      };
      forgedReceipt.completion.anchor.authority.progress = '0'.repeat(64);
      await writeFile(receiptPath, JSON.stringify(forgedReceipt));
      await expect(validateOrRefreshCompletionDependencyReceipt({
        context: corrected,
        entry: fixture.entry,
        exactLegacyMigration: true,
        allowRefresh: false,
      })).rejects.toThrow(/anchor authority|mismatch|malformed|digest/i);
      await writeFile(receiptPath, originalReceipt);

      git(fixture.root, ['reset', '--hard', fixture.entry.startBranchSha]);
      await expect(validateOrRefreshCompletionDependencyReceipt({
        context: corrected,
        entry: fixture.entry,
        exactLegacyMigration: true,
        allowRefresh: false,
      })).rejects.toThrow(/completion authority has no derivable active-branch anchor/i);
    } finally {
      await rm(fixture.root, { recursive: true, force: true });
    }
  });

  it('requires an issued nonce commitment to consume one generic completion receipt', async () => {
    const fixture = await completionFixture();
    try {
      expect(fixture.priorReceipt.issuance.nonce).toMatch(/^[0-9a-f]{64}$/);
      expect(JSON.stringify(fixture.entry.dependencyReceipt)).not.toContain(fixture.priorReceipt.issuance.nonce);
      expect(fixture.entry.dependencyReceipt).toMatchObject({
        policy: 'required',
        issuance: { nonceCommitment: expect.stringMatching(/^[0-9a-f]{64}$/) },
      });

      const consumed = await validateOrRefreshCompletionDependencyReceipt({
        context: fixture.context,
        entry: fixture.entry,
        allowRefresh: true,
      });
      expect(consumed).toMatchObject({ policy: 'completion-refreshed' });
      expect(JSON.stringify(consumed)).not.toContain(fixture.priorReceipt.issuance.nonce);
      fixture.entry.dependencyReceipt = dependencyReceiptMetadata(consumed, 'completion-refreshed');
      await expect(validateOrRefreshCompletionDependencyReceipt({
        context: fixture.context,
        entry: fixture.entry,
        allowRefresh: false,
      })).resolves.toEqual(consumed);
      const landedCandidateSha = git(fixture.root, ['rev-parse', 'HEAD']);
      await expect(validateOrRefreshCompletionDependencyReceipt({
        context: {
          ...fixture.context,
          binding: { ...fixture.context.binding, mainSha: landedCandidateSha },
        },
        entry: fixture.entry,
        allowRefresh: false,
        landedMainBinding: {
          baseSha: fixture.context.binding.mainSha,
          candidateSha: landedCandidateSha,
          validationFingerprint: 'e'.repeat(64),
        },
      })).resolves.toEqual(consumed);
      await expect(validateOrRefreshCompletionDependencyReceipt({
        context: fixture.context,
        entry: fixture.entry,
        allowRefresh: true,
      })).rejects.toThrow(/second refresh|already consumed/i);
      for (const context of [
        { ...fixture.context, binding: { ...fixture.context.binding, mainSha: 'f'.repeat(40) } },
        { ...fixture.context, requestedScopes: ['scripts/other.mjs'] },
        { ...fixture.context, requestedClaims: ['prompt-668-drift'] },
        {
          ...fixture.context,
          sources: { ...fixture.context.sources, plan: `${fixture.context.sources.plan}\n` },
        },
      ]) {
        await expect(validateOrRefreshCompletionDependencyReceipt({
          context,
          entry: fixture.entry,
          allowRefresh: false,
        })).rejects.toThrow(/predecessor|binding|authority|scope|claim|transition|drift|completion|evidence/i);
      }
    } finally {
      await rm(fixture.root, { recursive: true, force: true });
    }
  });

  it('fails closed after a receipt-file/ledger half-write and on cross-entry replay', async () => {
    const halfWritten = await completionFixture();
    const replaySource = await completionFixture();
    const replayTarget = await completionFixture();
    try {
      await validateOrRefreshCompletionDependencyReceipt({
        context: halfWritten.context,
        entry: halfWritten.entry,
        allowRefresh: true,
      });
      await expect(validateOrRefreshCompletionDependencyReceipt({
        context: halfWritten.context,
        entry: halfWritten.entry,
        allowRefresh: false,
      })).rejects.toThrow(/metadata does not match|active entry/i);

      const replay = await readFile(dependencyReceiptPath(replaySource.root, '668'), 'utf8');
      await writeFile(dependencyReceiptPath(replayTarget.root, '668'), replay);
      await expect(validateOrRefreshCompletionDependencyReceipt({
        context: replayTarget.context,
        entry: replayTarget.entry,
        allowRefresh: true,
      })).rejects.toThrow(/issuance|commitment|predecessor|active binding/i);
    } finally {
      await Promise.all([halfWritten, replaySource, replayTarget]
        .map(({ root }) => rm(root, { recursive: true, force: true })));
    }
  });

  it.each([
    ['terminal', { status: 'complete' }],
    ['parked', { status: 'parked' }],
    ['taken over', { worktree: '/tmp/foreign-worktree' }],
  ])('rejects a %s completion owner', async (_label, mutation) => {
    const fixture = await completionFixture();
    try {
      const active = { ...fixture.entry, ...mutation };
      await expect(validateOrRefreshCompletionDependencyReceipt({
        context: { ...fixture.context, coordinationState: { entries: [active] } },
        entry: active,
        allowRefresh: true,
      })).rejects.toThrow(/active|non-terminal|worktree|binding/i);
    } finally {
      await rm(fixture.root, { recursive: true, force: true });
    }
  });

  it('rejects a symlinked completion receipt', async () => {
    const fixture = await completionFixture();
    const receiptPath = dependencyReceiptPath(fixture.root, '668');
    const targetPath = resolve(fixture.root, 'foreign-receipt.json');
    try {
      const original = await readFile(receiptPath, 'utf8');
      await unlink(receiptPath);
      await writeFile(targetPath, original);
      await symlink(targetPath, receiptPath);
      await expect(validateOrRefreshCompletionDependencyReceipt({
        context: fixture.context,
        entry: fixture.entry,
        allowRefresh: true,
      })).rejects.toThrow(/symlink/i);
    } finally {
      await rm(fixture.root, { recursive: true, force: true });
    }
  });

  it('rejects deletion, post-done historical recreation, and replacement issuance', async () => {
    const deleted = await completionFixture();
    const recreated = await completionFixture();
    const replaced = await completionFixture();
    try {
      await unlink(dependencyReceiptPath(deleted.root, '668'));
      await expect(validateOrRefreshCompletionDependencyReceipt({
        context: deleted.context,
        entry: deleted.entry,
        allowRefresh: true,
      })).rejects.toThrow(/missing/i);

      await unlink(dependencyReceiptPath(recreated.root, '668'));
      await writeDependencyReceipt(createDependencyPacket({
        ...recreated.context,
        sources: recreated.pending,
      }));
      await expect(validateOrRefreshCompletionDependencyReceipt({
        context: recreated.context,
        entry: recreated.entry,
        allowRefresh: true,
      })).rejects.toThrow(/issuance|commitment|predecessor/i);

      await writeDependencyReceipt(createDependencyPacket({
        ...replaced.context,
        sources: replaced.pending,
      }));
      await expect(validateOrRefreshCompletionDependencyReceipt({
        context: replaced.context,
        entry: replaced.entry,
        allowRefresh: true,
      })).rejects.toThrow(/issuance|commitment|predecessor/i);
    } finally {
      await Promise.all([deleted, recreated, replaced]
        .map(({ root }) => rm(root, { recursive: true, force: true })));
    }
  });

  it.each([
    ['nonce commitment', { issuance: { nonceCommitment: '0'.repeat(64) } }],
    ['content digest', { contentDigest: '0'.repeat(64) }],
  ])('rejects a mismatched ledger %s', async (_label, replacement) => {
    const fixture = await completionFixture();
    try {
      const currentIssuance = fixture.entry.dependencyReceipt.issuance as Record<string, unknown>;
      const replacementIssuance = 'issuance' in replacement
        ? replacement.issuance as Record<string, unknown>
        : undefined;
      fixture.entry.dependencyReceipt = {
        ...fixture.entry.dependencyReceipt,
        ...replacement,
        ...(replacementIssuance ? {
          issuance: { ...currentIssuance, ...replacementIssuance },
        } : {}),
      };
      await expect(validateOrRefreshCompletionDependencyReceipt({
        context: fixture.context,
        entry: fixture.entry,
        allowRefresh: true,
      })).rejects.toThrow(/issuance|commitment|predecessor|digest/i);
    } finally {
      await rm(fixture.root, { recursive: true, force: true });
    }
  });

  it.each(['012', '014'])('permits only the exact migrated P%s issuance to complete', async (prompt) => {
    const fixture = await completionFixture({ prompt, tag: 'PRESERVE', policy: 'legacy-refreshed' });
    try {
      await expect(validateOrRefreshCompletionDependencyReceipt({
        context: fixture.context,
        entry: fixture.entry,
        exactLegacyMigration: false,
        allowRefresh: true,
      })).rejects.toThrow(/exact migrated|legacy/i);
      await expect(validateOrRefreshCompletionDependencyReceipt({
        context: fixture.context,
        entry: fixture.entry,
        exactLegacyMigration: true,
        allowRefresh: true,
      })).resolves.toMatchObject({ policy: 'completion-refreshed' });
    } finally {
      await rm(fixture.root, { recursive: true, force: true });
    }
  });
  it('keeps the default packet compact while full and JSON retain the complete semantic view', () => {
    const worktree = '/tmp/p666-packet';
    const packet = createDependencyPacket({
      prompt: '666',
      sources,
      binding: binding(worktree),
      coordinationState: { entries: [ownerEntry(worktree)] },
      requestedScopes: ['scripts/prompt-dependencies.mjs'],
      requestedClaims: ['prompt-666'],
      repositoryRoot: worktree,
      repositoryIdentity: '/tmp/repository.git',
    });
    const compact = formatDependencyPacket(packet);
    const full = formatDependencyPacket(packet, { full: true });
    const json = formatDependencyPacket(packet, { json: true });

    expect(compact.split('\n').length).toBeLessThanOrEqual(80);
    expect(Buffer.byteLength(compact)).toBeLessThanOrEqual(12 * 1024);
    expect(compact).toContain('prompt: 666');
    expect(compact).toContain('hard_prompt_prerequisites: 665=done');
    expect(full).toContain('READY_QUEUE');
    expect(full).toContain('NEEDS_CONFIRMATION');
    expect(full).toContain('BLOCKED');
    expect(JSON.parse(json)).toMatchObject({
      schemaVersion: 1,
      selected: { prompt: '666', changeClass: 'non-feature' },
    });
    expect(JSON.parse(json).readyQueue[0].prompt).toBe('012');
    expect(packet.readyQueue
      .filter((record: { sequence: string }) => record.sequence === 'WOLF-ATTACK')
      .map((record: { prompt: string }) => record.prompt))
      .toEqual(expectedWolfOrder.filter((prompt) => prompt !== '433a'));
    expect(formatDependencyPacket(packet, { json: true })).toBe(json);
  });

  it('fails closed before lookup when authority parity or prompt readiness drifts', () => {
    const worktree = '/tmp/p666-readiness';
    const options = {
      prompt: '666',
      sources,
      binding: binding(worktree),
      coordinationState: { entries: [ownerEntry(worktree)] },
      requestedScopes: [],
      requestedClaims: [],
      repositoryRoot: worktree,
      repositoryIdentity: '/tmp/repository.git',
    };
    expect(() => createDependencyPacket({
      ...options,
      sources: { ...sources, dependency: sources.dependency.replace(
        '| 666 | EXTEND | partial | 665 |',
        '| 666 | EXTEND | partial | 667 |',
      ) },
    })).toThrow(/not mechanically ready|667=missing/i);
    expect(() => createDependencyPacket({
      ...options,
      sources: { ...sources, dependency: sources.dependency.replace(
        '| 666 | EXTEND | partial |',
        '| 666 | REPAIR | partial |',
      ) },
    })).toThrow(/plan tag.*does not match/i);
  });

  it('fails closed when the plan-declared WOLF-ATTACK sequence drifts from its typed evidence or row membership', () => {
    const worktree = '/tmp/p666-wolf-sequence';
    const options = {
      prompt: '666',
      sources,
      binding: binding(worktree),
      coordinationState: { entries: [ownerEntry(worktree)] },
      repositoryRoot: worktree,
      repositoryIdentity: '/tmp/repository.git',
    };
    const mutations = [
      sources.plan.replace('425 → 426 → 428', '426 → 425 → 428'),
      sources.plan.replace('425 → 426 → 428', '425 / 426 → 428'),
      sources.plan.replace('425 → 426 → 428', '425 → 425 → 426 → 428'),
      sources.plan.replace('425 → 426 → 428', '425 → 428'),
      sources.plan.replace('432/432a', '432 → 432a'),
      sources.plan.replace('432/432a', '432a/432'),
      sources.plan.replace('432/432a', '432/432a/432'),
      sources.plan.replace('432/432a', '432//432a'),
      sources.plan.replace('432/432a', '432'),
    ];
    for (const plan of mutations) {
      expect(() => createDependencyPacket({ ...options, sources: { ...sources, plan } }))
        .toThrow(/WOLF-ATTACK|E-WOLF|Wolf attack/i);
    }
    expect(() => createDependencyPacket({
      ...options,
      sources: {
        ...sources,
        dependency: sources.dependency.replace(
          '425 -> 426 -> 428 -> 427',
          '426 -> 425 -> 428 -> 427',
        ),
      },
    })).toThrow(/WOLF-ATTACK|E-WOLF|Wolf attack/i);
    const emptyEvidenceSeparatorMutations = [
      sources.dependency.replace('| E-WOLF | sequence | 425', '| E-WOLF | sequence | -> 425'),
      sources.dependency.replace(
        '-> 621 -> 645 | IMPLEMENTATION_PLAN.md',
        '-> 621 -> 645 -> | IMPLEMENTATION_PLAN.md',
      ),
      sources.dependency.replace('| E-WOLF | sequence | 425 -> 426', '| E-WOLF | sequence | 425 -> -> 426'),
      sources.dependency.replace('| E-WOLF | sequence | 425', '| E-WOLF | sequence | /425'),
      sources.dependency.replace(
        '| E-WOLF | sequence | 425 -> 426 -> 428 -> 427 -> 432/432a',
        '| E-WOLF | sequence | 425 -> 426 -> 428 -> 427 -> 432/432a/',
      ),
    ];
    for (const dependency of emptyEvidenceSeparatorMutations) {
      expect(() => createDependencyPacket({ ...options, sources: { ...sources, dependency } }))
        .toThrow(/WOLF-ATTACK|E-WOLF|Wolf attack/i);
    }
    expect(() => createDependencyPacket({
      ...options,
      sources: {
        ...sources,
        dependency: sources.dependency.replace(
          '| E-WOLF | sequence | 425 -> 426 -> 428 -> 427 -> 432/432a',
          '| E-WOLF | sequence | 425 -> 426 -> 428 -> 427 -> 432//432a',
        ),
      },
    })).toThrow(/WOLF-ATTACK|E-WOLF|Wolf attack/i);
    expect(() => createDependencyPacket({
      ...options,
      sources: {
        ...sources,
        dependency: sources.dependency.replace(
          '| E-WOLF | sequence | 425 -> 426 -> 428',
          '| E-WOLF | sequence | 425/426 -> 428',
        ),
      },
    })).toThrow(/WOLF-ATTACK|E-WOLF|Wolf attack/i);
    expect(() => createDependencyPacket({
      ...options,
      sources: {
        ...sources,
        dependency: sources.dependency.replace(
          '| WOLF-ATTACK | 425 -> 426 -> 428 -> 427 -> 432/432a',
          '| WOLF-ATTACK | 425 -> 426 -> 428 -> 427 -> 432//432a',
        ),
      },
    })).toThrow(/WOLF-ATTACK|E-WOLF|Wolf attack/i);
    expect(() => createDependencyPacket({
      ...options,
      sources: {
        ...sources,
        dependency: sources.dependency.replace(
          '| E-WOLF | sequence | 425 -> 426 -> 428 -> 427 -> 432/432a',
          '| E-WOLF | sequence | 425 -> 426 -> 428 -> 427 -> 432 -> 432a',
        ),
      },
    })).toThrow(/WOLF-ATTACK|E-WOLF|Wolf attack/i);
    expect(() => createDependencyPacket({
      ...options,
      sources: {
        ...sources,
        dependency: sources.dependency.replace(
          '| WOLF-ATTACK | 425 -> 426 -> 428',
          '| WOLF-ATTACK | 425/426 -> 428',
        ),
      },
    })).toThrow(/WOLF-ATTACK|E-WOLF|Wolf attack/i);
    expect(() => createDependencyPacket({
      ...options,
      sources: {
        ...sources,
        dependency: sources.dependency.replace(
          '| WOLF-ATTACK | 425 -> 426 -> 428 -> 427 -> 432/432a',
          '| WOLF-ATTACK | 425 -> 426 -> 428 -> 427 -> 432 -> 432a',
        ),
      },
    })).toThrow(/WOLF-ATTACK|E-WOLF|Wolf attack/i);
    expect(() => createDependencyPacket({
      ...options,
      sources: {
        ...sources,
        dependency: sources.dependency.replace(
          '| 425 | NEW | missing | none | none | none | none | none | WOLF-ATTACK |',
          '| 425 | NEW | missing | none | none | none | none | none | none |',
        ),
      },
    })).toThrow(/WOLF-ATTACK|E-WOLF|Wolf attack/i);
  });

  it('ignores unrelated ledger noise but fingerprints relevant ownership and conflicts', () => {
    const worktree = '/tmp/p666-fingerprint';
    const options = {
      prompt: '666',
      sources,
      binding: binding(worktree),
      requestedScopes: ['scripts/prompt-dependencies.mjs'],
      requestedClaims: ['prompt-666'],
      repositoryRoot: worktree,
      repositoryIdentity: '/tmp/repository.git',
    };
    const clean = createDependencyPacket({ ...options, coordinationState: { entries: [ownerEntry(worktree)] } });
    const noisy = createDependencyPacket({
      ...options,
      coordinationState: {
        entries: [ownerEntry(worktree), {
          ...relevantEntry('/tmp/unrelated-repository'),
          id: 'unrelated',
          repositoryIdentity: '/tmp/unrelated.git',
          scopes: ['src/other.ts'],
          heartbeatAt: '2099-01-01T00:00:00.000Z',
        }],
      },
    });
    const conflict = createDependencyPacket({
      ...options,
      coordinationState: { entries: [ownerEntry(worktree), relevantEntry(worktree)] },
    });

    expect(noisy.fingerprint).toBe(clean.fingerprint);
    expect(conflict.fingerprint).not.toBe(clean.fingerprint);
    expect(conflict.coordination.conflicts).toHaveLength(1);
  });

  it('treats emulator and release claims as host-wide while ordinary foreign claims stay irrelevant', async () => {
    const worktree = '/tmp/p666-host-claims';
    const baseOptions = {
      prompt: '666',
      sources,
      binding: binding(worktree),
      requestedScopes: [],
      repositoryRoot: worktree,
      repositoryIdentity: '/tmp/repository.git',
    };
    const foreignEntry = (claim: string) => ({
      id: `foreign-${claim}`,
      status: 'active',
      repositoryRoot: '/tmp/foreign-repository',
      repositoryIdentity: '/tmp/foreign-repository.git',
      worktree: '/tmp/foreign-worktree',
      scopes: ['src/foreign.ts'],
      claims: [claim],
    });
    for (const claim of ['emulator-slot-7', 'release-0.3.29']) {
      const clean = createDependencyPacket({
        ...baseOptions,
        requestedClaims: [claim],
        coordinationState: { entries: [ownerEntry(worktree)] },
      });
      const collision = createDependencyPacket({
        ...baseOptions,
        requestedClaims: [claim],
        coordinationState: { entries: [ownerEntry(worktree), foreignEntry(claim)] },
      });
      expect(collision.fingerprint).not.toBe(clean.fingerprint);
      expect(collision.coordination.conflicts).toEqual([
        expect.objectContaining({ type: 'claim', requested: claim, matched: claim }),
      ]);
      await expect(writeDependencyReceipt(collision)).rejects.toThrow(/relevant coordination conflicts/i);
    }

    const ordinaryClaim = 'prompt-local-helper';
    const cleanOrdinary = createDependencyPacket({
      ...baseOptions,
      requestedClaims: [ordinaryClaim],
      coordinationState: { entries: [ownerEntry(worktree)] },
    });
    const foreignOrdinary = createDependencyPacket({
      ...baseOptions,
      requestedClaims: [ordinaryClaim],
      coordinationState: { entries: [ownerEntry(worktree), foreignEntry(ordinaryClaim)] },
    });
    expect(foreignOrdinary.fingerprint).toBe(cleanOrdinary.fingerprint);
    expect(foreignOrdinary.coordination.conflicts).toEqual([]);
  });

  it('writes an atomic ignored receipt and rejects missing, malformed, symlinked, stale, or mismatched receipts', async () => {
    const worktree = resolve(tmpdir(), `p666-receipt-${randomUUID()}`);
    await mkdir(resolve(worktree, '.codex/dependency-receipts'), { recursive: true });
    const options = {
      prompt: '666',
      sources,
      binding: binding(worktree),
      coordinationState: { entries: [ownerEntry(worktree)] },
      requestedScopes: ['scripts/prompt-dependencies.mjs'],
      requestedClaims: ['prompt-666'],
      repositoryRoot: worktree,
      repositoryIdentity: '/tmp/repository.git',
    };
    const receiptPath = dependencyReceiptPath(worktree, '666');
    try {
      const packet = createDependencyPacket(options);
      await expect(validateDependencyReceipt(options)).rejects.toThrow(/missing/i);
      await writeDependencyReceipt(packet);
      expect((await lstat(receiptPath)).isFile()).toBe(true);
      await expect(validateDependencyReceipt(options)).resolves.toMatchObject({ prompt: '666' });
      await expect(validateDependencyReceipt({
        ...options,
        coordinationState: {
          entries: [ownerEntry(worktree), {
            ...relevantEntry('/tmp/unrelated-repository'),
            id: 'unrelated-noise',
            repositoryIdentity: '/tmp/unrelated.git',
            scopes: ['src/unrelated.ts'],
          }],
        },
      })).resolves.toMatchObject({ prompt: '666' });
      await expect(validateDependencyReceipt({
        ...options,
        coordinationState: { entries: [ownerEntry(worktree), relevantEntry(worktree)] },
      })).rejects.toThrow(/relevant coordination conflicts/i);
      await expect(validateDependencyReceipt({ ...options, binding: { ...options.binding, branch: 'other' } }))
        .rejects.toThrow(/binding|branch|mismatch/i);
      await expect(validateDependencyReceipt({
        ...options,
        sources: { ...sources, milestones: `${sources.milestones}\n` },
      })).rejects.toThrow(/authority|milestone|fingerprint|mismatch/i);

      await unlink(receiptPath);
      await symlink(resolve(worktree, 'elsewhere.json'), receiptPath);
      await expect(validateDependencyReceipt(options)).rejects.toThrow(/symlink/i);
      await unlink(receiptPath);

      await writeDependencyReceipt(packet);
      const parsed = JSON.parse(await readFile(receiptPath, 'utf8'));
      await writeFile(receiptPath, JSON.stringify({ ...parsed, fingerprint: '0'.repeat(64) }));
      await expect(validateDependencyReceipt(options)).rejects.toThrow(/digest|malformed/i);
      const malformed = `${JSON.stringify(parsed).slice(0, -3)}`;
      await writeFile(receiptPath, malformed);
      await expect(validateDependencyReceipt(options)).rejects.toThrow(/malformed/i);
    } finally {
      await unlink(receiptPath).catch(() => undefined);
    }
  });

  it('rejects a symlinked receipt parent before creating the receipt directory', async () => {
    const worktree = await mkdtemp(resolve(tmpdir(), 'p666-symlink-worktree-'));
    const target = await mkdtemp(resolve(tmpdir(), 'p666-symlink-target-'));
    try {
      await symlink(target, resolve(worktree, '.codex'), 'dir');
      const packet = createDependencyPacket({
        prompt: '666',
        sources,
        binding: binding(worktree),
        coordinationState: { entries: [ownerEntry(worktree)] },
        repositoryRoot: worktree,
        repositoryIdentity: '/tmp/repository.git',
      });
      await expect(writeDependencyReceipt(packet)).rejects.toThrow(/parent directory.*symlink/i);
    } finally {
      await rm(worktree, { recursive: true, force: true });
      await rm(target, { recursive: true, force: true });
    }
  });

  it('uses origin/main when local main is absent and fails closed when the refs disagree', async () => {
    const repository = await mkdtemp(resolve(tmpdir(), 'p666-main-resolution-'));
    const runGit = (...args: string[]) => execFileSync('git', args, {
      cwd: repository,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
    try {
      runGit('init');
      runGit('config', 'user.name', 'Dependency Test');
      runGit('config', 'user.email', 'dependency-test@example.invalid');
      await writeFile(resolve(repository, 'fixture.txt'), 'base\n');
      runGit('add', 'fixture.txt');
      runGit('commit', '-m', 'base');
      runGit('branch', '-M', 'main');
      const base = runGit('rev-parse', 'HEAD');
      runGit('update-ref', 'refs/remotes/origin/main', base);
      runGit('switch', '-c', 'test-branch');
      runGit('branch', '-D', 'main');
      expect(resolveCurrentMainSha(repository)).toBe(base);

      await writeFile(resolve(repository, 'fixture.txt'), 'changed\n');
      runGit('add', 'fixture.txt');
      runGit('commit', '-m', 'changed');
      runGit('branch', 'main', 'HEAD');
      expect(() => resolveCurrentMainSha(repository)).toThrow(/differ.*reconcile current main/i);
    } finally {
      await rm(repository, { recursive: true, force: true });
    }
  });
});
