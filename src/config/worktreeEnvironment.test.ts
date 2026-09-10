import { access, mkdtemp, mkdir, readFile, rm, utimes, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { promisify } from 'node:util';
import {
  bootstrapDependencies,
  LOCKFILE_STAMP_FILE,
  lockPathForRepository,
} from '../../scripts/bootstrap-dependencies.mjs';

const execFileAsync = promisify(execFile);

async function createBootstrapFixture() {
  const repositoryDirectory = await mkdtemp(resolve(tmpdir(), 'den-of-wolves-bootstrap-'));
  await mkdir(resolve(repositoryDirectory, 'functions'), { recursive: true });
  await writeFile(
    resolve(repositoryDirectory, 'package-lock.json'),
    '{"name":"root","lockfileVersion":3}\n',
  );
  await writeFile(
    resolve(repositoryDirectory, 'functions', 'package-lock.json'),
    '{"name":"functions","lockfileVersion":3}\n',
  );
  return repositoryDirectory;
}

async function cleanupBootstrapFixture(repositoryDirectory: string) {
  await rm(repositoryDirectory, { recursive: true, force: true });
}

describe('Codex worktree environment', () => {
  it('bootstraps both locked dependency trees from the npm cache', async () => {
    const environment = await readFile(
      resolve(process.cwd(), '.codex/environments/environment.toml'),
      'utf8',
    );

    expect(environment).toContain('version = 1');
    expect(environment).toContain('[setup]');
    expect(environment).toContain('node scripts/bootstrap-dependencies.mjs');
    expect(environment).not.toContain('npm install');
    expect(environment).not.toContain('npm ci --prefix functions');
    expect(environment).not.toContain(
      'node scripts/enforce-worktree-limit.mjs --apply',
    );
  });

  it('does not keep an executable worktree-count cap', async () => {
    await expect(
      access(resolve(process.cwd(), 'scripts/enforce-worktree-limit.mjs')),
    ).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('installs both dependency trees for a fresh fixture and records stamps only after install', async () => {
    const repositoryDirectory = await createBootstrapFixture();
    const installs: string[] = [];
    const installArguments: string[][] = [];
    try {
      await bootstrapDependencies({
        repositoryDirectory,
        runInstall: async ({ cwd, args }) => {
          installs.push(cwd);
          installArguments.push([...args]);
        },
      });

      expect(installs).toEqual([
        repositoryDirectory,
        resolve(repositoryDirectory, 'functions'),
      ]);
      expect(installArguments).toEqual([
        ['ci', '--prefer-offline', '--no-audit'],
        ['ci', '--prefer-offline', '--no-audit'],
      ]);
      await expect(
        access(resolve(repositoryDirectory, 'node_modules', LOCKFILE_STAMP_FILE)),
      ).resolves.toBeUndefined();
      await expect(
        access(resolve(repositoryDirectory, 'functions', 'node_modules', LOCKFILE_STAMP_FILE)),
      ).resolves.toBeUndefined();
    } finally {
      await cleanupBootstrapFixture(repositoryDirectory);
    }
  });

  it('does nothing when both dependency trees have current lockfile stamps', async () => {
    const repositoryDirectory = await createBootstrapFixture();
    try {
      await bootstrapDependencies({
        repositoryDirectory,
        runInstall: async () => undefined,
      });

      await expect(
        bootstrapDependencies({
          repositoryDirectory,
          runInstall: async () => {
            throw new Error('current dependency trees must not reinstall');
          },
        }),
      ).resolves.toEqual({ installed: [], skipped: ['root', 'functions'] });
    } finally {
      await cleanupBootstrapFixture(repositoryDirectory);
    }
  });

  it('reinstalls only the dependency tree whose lockfile changed', async () => {
    const repositoryDirectory = await createBootstrapFixture();
    const installs: string[] = [];
    try {
      await bootstrapDependencies({
        repositoryDirectory,
        runInstall: async () => undefined,
      });
      await writeFile(
        resolve(repositoryDirectory, 'functions', 'package-lock.json'),
        '{"name":"functions","lockfileVersion":3,"changed":true}\n',
      );

      await bootstrapDependencies({
        repositoryDirectory,
        runInstall: async ({ cwd }) => {
          installs.push(cwd);
        },
      });

      expect(installs).toEqual([resolve(repositoryDirectory, 'functions')]);
    } finally {
      await cleanupBootstrapFixture(repositoryDirectory);
    }
  });

  it('reinstalls a dependency tree when its node_modules directory is missing', async () => {
    const repositoryDirectory = await createBootstrapFixture();
    const installs: string[] = [];
    try {
      await bootstrapDependencies({
        repositoryDirectory,
        runInstall: async () => undefined,
      });
      await rm(resolve(repositoryDirectory, 'node_modules'), { recursive: true });

      await bootstrapDependencies({
        repositoryDirectory,
        runInstall: async ({ cwd }) => {
          installs.push(cwd);
        },
      });

      expect(installs).toEqual([repositoryDirectory]);
    } finally {
      await cleanupBootstrapFixture(repositoryDirectory);
    }
  });

  it('reinstalls when a recorded npm package directory is missing despite a current stamp', async () => {
    const repositoryDirectory = await createBootstrapFixture();
    const installs: string[] = [];
    try {
      await bootstrapDependencies({
        repositoryDirectory,
        runInstall: async ({ cwd }) => {
          await mkdir(resolve(cwd, 'node_modules', 'demo-package'), { recursive: true });
          await writeFile(
            resolve(cwd, 'node_modules', '.package-lock.json'),
            JSON.stringify({ packages: { '': {}, 'node_modules/demo-package': {} } }),
          );
        },
      });
      await rm(resolve(repositoryDirectory, 'node_modules', 'demo-package'), { recursive: true });

      await bootstrapDependencies({
        repositoryDirectory,
        runInstall: async ({ cwd }) => {
          installs.push(cwd);
        },
      });

      expect(installs).toContain(repositoryDirectory);
    } finally {
      await cleanupBootstrapFixture(repositoryDirectory);
    }
  });

  it('rechecks the lockfile before trusting a skip and retries a transient change', async () => {
    const repositoryDirectory = await createBootstrapFixture();
    let fingerprintCalls = 0;
    const installs: string[] = [];
    try {
      await bootstrapDependencies({
        repositoryDirectory,
        runInstall: async () => undefined,
      });
      const stamps = new Map([
        [resolve(repositoryDirectory, 'package-lock.json'), JSON.parse(await readFile(
          resolve(repositoryDirectory, 'node_modules', LOCKFILE_STAMP_FILE), 'utf8'))],
        [resolve(repositoryDirectory, 'functions', 'package-lock.json'), JSON.parse(await readFile(
          resolve(repositoryDirectory, 'functions', 'node_modules', LOCKFILE_STAMP_FILE), 'utf8'))],
      ]);
      const fingerprint = async (lockfilePath: string) => {
        fingerprintCalls += 1;
        const stamp = stamps.get(lockfilePath);
        if (fingerprintCalls === 2) return `${stamp.fingerprint}-transient-change`;
        return stamp.fingerprint;
      };

      await expect(bootstrapDependencies({
        repositoryDirectory,
        fingerprint,
        runInstall: async ({ cwd }) => {
          installs.push(cwd);
        },
      })).resolves.toMatchObject({ skipped: ['root', 'functions'] });
      expect(installs).toEqual([]);
      expect(fingerprintCalls).toBeGreaterThan(3);
    } finally {
      await cleanupBootstrapFixture(repositoryDirectory);
    }
  });

  it('does not write a stamp when npm ci fails', async () => {
    const repositoryDirectory = await createBootstrapFixture();
    try {
      await expect(
        bootstrapDependencies({
          repositoryDirectory,
          runInstall: async () => {
            throw new Error('npm ci failed');
          },
        }),
      ).rejects.toThrow('npm ci failed');
      await expect(
        access(resolve(repositoryDirectory, 'node_modules', LOCKFILE_STAMP_FILE)),
      ).rejects.toMatchObject({ code: 'ENOENT' });
    } finally {
      await cleanupBootstrapFixture(repositoryDirectory);
    }
  });

  it('serializes concurrent bootstrap attempts and lets the waiter reuse completed stamps', async () => {
    const repositoryDirectory = await createBootstrapFixture();
    let activeInstalls = 0;
    let maximumConcurrentInstalls = 0;
    let installCount = 0;
    const runInstall = async () => {
      activeInstalls += 1;
      maximumConcurrentInstalls = Math.max(maximumConcurrentInstalls, activeInstalls);
      installCount += 1;
      await new Promise((resolvePromise) => setTimeout(resolvePromise, 20));
      activeInstalls -= 1;
    };
    try {
      await Promise.all([
        bootstrapDependencies({ repositoryDirectory, runInstall }),
        bootstrapDependencies({ repositoryDirectory, runInstall }),
      ]);

      expect(maximumConcurrentInstalls).toBe(1);
      expect(installCount).toBe(2);
    } finally {
      await cleanupBootstrapFixture(repositoryDirectory);
    }
  });

  it('serializes separate bootstrap processes while recovering a stale lock', async () => {
    const repositoryDirectory = await createBootstrapFixture();
    const lockPath = lockPathForRepository(repositoryDirectory);
    const childModule = resolve(process.cwd(), 'scripts/bootstrap-dependencies.mjs');
    const childSource = `
      import { mkdir, rm } from 'node:fs/promises';
      import { resolve } from 'node:path';
      import { bootstrapDependencies } from ${JSON.stringify(childModule)};
      const delay = (ms) => new Promise((resolvePromise) => setTimeout(resolvePromise, ms));
      await bootstrapDependencies({
        repositoryDirectory: process.argv[1],
        runInstall: async ({ cwd }) => {
          const marker = resolve(cwd, '.bootstrap-active');
          await mkdir(marker);
          try { await delay(60); } finally { await rm(marker, { recursive: true, force: true }); }
        },
      });
    `;
    try {
      await writeFile(lockPath, JSON.stringify({ pid: 999_999, token: 'stale-lock' }));
      const staleDate = new Date(Date.now() - 60_000);
      await utimes(lockPath, staleDate, staleDate);
      await Promise.all([
        execFileAsync(process.execPath, ['--input-type=module', '-e', childSource, repositoryDirectory]),
        execFileAsync(process.execPath, ['--input-type=module', '-e', childSource, repositoryDirectory]),
      ]);
      await expect(access(lockPath)).rejects.toMatchObject({ code: 'ENOENT' });
    } finally {
      await rm(lockPath, { force: true });
      await rm(`${lockPath}.recovery`, { force: true });
      await cleanupBootstrapFixture(repositoryDirectory);
    }
  });

  it('keeps dependency setup free of worktree-pruning commands', async () => {
    const [environment, bootstrapSource] = await Promise.all([
      readFile(resolve(process.cwd(), '.codex/environments/environment.toml'), 'utf8'),
      readFile(resolve(process.cwd(), 'scripts/bootstrap-dependencies.mjs'), 'utf8'),
    ]);

    expect(environment).not.toContain('enforce-worktree-limit.mjs --apply');
    expect(bootstrapSource).not.toMatch(/git worktree prune|git clean|rm -rf/);
  });
});
