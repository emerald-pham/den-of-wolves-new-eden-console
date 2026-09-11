import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { lstat, mkdir, mkdtemp, readFile, rm, symlink, unlink, writeFile } from 'node:fs/promises';
import { tmpdir, userInfo } from 'node:os';
import { resolve } from 'node:path';
import {
  createDependencyPacket,
  dependencyReceiptPath,
  formatDependencyPacket,
  resolveCurrentMainSha,
  validateDependencyReceipt,
  writeDependencyReceipt,
// @ts-expect-error The executable JavaScript module is exercised directly rather than through a generated declaration.
} from '../../scripts/prompt-dependencies.mjs';

const sources = {
  plan: await readFile(resolve(process.cwd(), 'docs/IMPLEMENTATION_PLAN.md'), 'utf8'),
  progress: await readFile(resolve(process.cwd(), 'docs/IMPLEMENTATION_PROGRESS.md'), 'utf8'),
  dependency: await readFile(resolve(process.cwd(), 'docs/IMPLEMENTATION_PROMPT_DEPENDENCIES.md'), 'utf8'),
  milestones: await readFile(resolve(process.cwd(), 'docs/IMPLEMENTATION_MILESTONES.md'), 'utf8'),
};

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

describe('compact prompt dependency packets', () => {
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
      sources.plan.replace('425 → 426 → 428', '425 → 425 → 426 → 428'),
      sources.plan.replace('425 → 426 → 428', '425 → 428'),
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
