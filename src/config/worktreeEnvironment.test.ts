import { access, mkdtemp, mkdir, readFile, rename, rm, utimes, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { promisify } from 'node:util';
import {
  bootstrapDependencies,
  fingerprintLockfile,
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

async function installFixtureTree(cwd: string) {
  await mkdir(resolve(cwd, 'node_modules'), { recursive: true });
  await writeFile(
    resolve(cwd, 'node_modules', '.package-lock.json'),
    JSON.stringify({ lockfileVersion: 3, packages: { '': {} } }),
  );
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
          await installFixtureTree(cwd);
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
        runInstall: async ({ cwd }) => {
          await installFixtureTree(cwd);
        },
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
        runInstall: async ({ cwd }) => {
          await installFixtureTree(cwd);
        },
      });
      await writeFile(
        resolve(repositoryDirectory, 'functions', 'package-lock.json'),
        '{"name":"functions","lockfileVersion":3,"changed":true}\n',
      );

      await bootstrapDependencies({
        repositoryDirectory,
        runInstall: async ({ cwd }) => {
          installs.push(cwd);
          await installFixtureTree(cwd);
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
        runInstall: async ({ cwd }) => {
          await installFixtureTree(cwd);
        },
      });
      await rm(resolve(repositoryDirectory, 'node_modules'), { recursive: true });

      await bootstrapDependencies({
        repositoryDirectory,
        runInstall: async ({ cwd }) => {
          installs.push(cwd);
          await installFixtureTree(cwd);
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
            JSON.stringify({
              lockfileVersion: 3,
              packages: { '': {}, 'node_modules/demo-package': {} },
            }),
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

  it('reinstalls for legacy stamps and missing or malformed npm hidden-lock metadata', async () => {
    const repositoryDirectory = await createBootstrapFixture();
    const installs: string[] = [];
    try {
      await bootstrapDependencies({
        repositoryDirectory,
        runInstall: async ({ cwd }) => {
          await installFixtureTree(cwd);
        },
      });
      const rootLockfile = resolve(repositoryDirectory, 'package-lock.json');
      await writeFile(
        resolve(repositoryDirectory, 'node_modules', LOCKFILE_STAMP_FILE),
        await fingerprintLockfile(rootLockfile),
      );
      await bootstrapDependencies({
        repositoryDirectory,
        runInstall: async ({ cwd }) => {
          installs.push(cwd);
          await installFixtureTree(cwd);
        },
      });
      expect(installs).toContain(repositoryDirectory);

      installs.length = 0;
      await rm(resolve(repositoryDirectory, 'node_modules', '.package-lock.json'));
      await bootstrapDependencies({
        repositoryDirectory,
        runInstall: async ({ cwd }) => {
          installs.push(cwd);
          await installFixtureTree(cwd);
        },
      });
      expect(installs).toContain(repositoryDirectory);

      installs.length = 0;
      await writeFile(
        resolve(repositoryDirectory, 'node_modules', '.package-lock.json'),
        JSON.stringify({ packages: {} }),
      );
      await bootstrapDependencies({
        repositoryDirectory,
        runInstall: async ({ cwd }) => {
          installs.push(cwd);
          await installFixtureTree(cwd);
        },
      });
      expect(installs).toContain(repositoryDirectory);

      installs.length = 0;
      await writeFile(
        resolve(repositoryDirectory, 'node_modules', '.package-lock.json'),
        '{ malformed hidden lock',
      );
      await bootstrapDependencies({
        repositoryDirectory,
        runInstall: async ({ cwd }) => {
          installs.push(cwd);
          await installFixtureTree(cwd);
        },
      });
      expect(installs).toContain(repositoryDirectory);

      installs.length = 0;
      await writeFile(
        resolve(repositoryDirectory, 'node_modules', '.package-lock.json'),
        JSON.stringify({
          lockfileVersion: 3,
          packages: { '': {}, 'node_modules//absolute': {} },
        }),
      );
      await bootstrapDependencies({
        repositoryDirectory,
        runInstall: async ({ cwd }) => {
          installs.push(cwd);
          await installFixtureTree(cwd);
        },
      });
      expect(installs).toContain(repositoryDirectory);
    } finally {
      await cleanupBootstrapFixture(repositoryDirectory);
    }
  });

  it('requires every npm hidden-lock path, including optional packages, to exist', async () => {
    const repositoryDirectory = await createBootstrapFixture();
    const installs: string[] = [];
    const installCompleteTree = async (cwd: string) => {
      await mkdir(resolve(cwd, 'node_modules', 'required-package'), { recursive: true });
      await mkdir(resolve(cwd, 'node_modules', 'optional-package'), { recursive: true });
      await writeFile(
        resolve(cwd, 'node_modules', '.package-lock.json'),
        JSON.stringify({
          lockfileVersion: 3,
          packages: {
            '': {},
            'node_modules/required-package': {},
            'node_modules/optional-package': { optional: true },
          },
        }),
      );
    };
    try {
      await bootstrapDependencies({
        repositoryDirectory,
        runInstall: async ({ cwd }) => {
          await mkdir(resolve(cwd, 'node_modules', 'required-package'), { recursive: true });
          await writeFile(
            resolve(cwd, 'node_modules', '.package-lock.json'),
            JSON.stringify({
              lockfileVersion: 3,
              packages: {
                '': {},
                'node_modules/required-package': {},
                'node_modules/optional-package': { optional: true },
              },
            }),
          );
        },
      });
      await bootstrapDependencies({
        repositoryDirectory,
        runInstall: async ({ cwd }) => {
          installs.push(cwd);
          await installCompleteTree(cwd);
        },
      });
      expect(installs).toContain(repositoryDirectory);

      installs.length = 0;
      await bootstrapDependencies({
        repositoryDirectory,
        runInstall: async () => {
          throw new Error('the current hidden lock and actual tree must skip installation');
        },
      });
      expect(installs).toEqual([]);

      await rm(resolve(repositoryDirectory, 'node_modules', 'optional-package'), { recursive: true });
      await bootstrapDependencies({
        repositoryDirectory,
        runInstall: async ({ cwd }) => {
          installs.push(cwd);
          await installCompleteTree(cwd);
        },
      });
      expect(installs).toContain(repositoryDirectory);
    } finally {
      await cleanupBootstrapFixture(repositoryDirectory);
    }
  });

  it('reclaims stale locks with null or malformed metadata without trusting metadata as a path', async () => {
    const repositoryDirectory = await createBootstrapFixture();
    const lockPath = lockPathForRepository(repositoryDirectory);
    try {
      for (const metadata of ['null', '{malformed']) {
        await writeFile(lockPath, metadata);
        const staleDate = new Date(Date.now() - 60_000);
        await utimes(lockPath, staleDate, staleDate);
        await bootstrapDependencies({
          repositoryDirectory,
          runInstall: async ({ cwd }) => {
            await installFixtureTree(cwd);
          },
        });
        await expect(access(lockPath)).rejects.toMatchObject({ code: 'ENOENT' });
      }
    } finally {
      await rm(lockPath, { force: true });
      await rm(`${lockPath}.recovery`, { force: true });
      await cleanupBootstrapFixture(repositoryDirectory);
    }
  });

  it('does not unlink a replacement lock even when it reuses the original token', async () => {
    const repositoryDirectory = await createBootstrapFixture();
    const lockPath = lockPathForRepository(repositoryDirectory);
    const replacementPath = `${lockPath}.original-handle`;
    let replaced = false;
    try {
      await bootstrapDependencies({
        repositoryDirectory,
        runInstall: async ({ cwd }) => {
          if (!replaced) {
            const metadata = await readFile(lockPath, 'utf8');
            await rename(lockPath, replacementPath);
            await writeFile(lockPath, metadata);
            replaced = true;
          }
          await installFixtureTree(cwd);
        },
      });
      expect(replaced).toBe(true);
      await expect(access(lockPath)).resolves.toBeUndefined();
    } finally {
      await rm(lockPath, { force: true });
      await rm(replacementPath, { force: true });
      await rm(`${lockPath}.recovery`, { force: true });
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
        runInstall: async ({ cwd }) => {
          await installFixtureTree(cwd);
        },
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
          await installFixtureTree(cwd);
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
    const runInstall = async ({ cwd }: { cwd: string }) => {
      activeInstalls += 1;
      maximumConcurrentInstalls = Math.max(maximumConcurrentInstalls, activeInstalls);
      installCount += 1;
      await new Promise((resolvePromise) => setTimeout(resolvePromise, 20));
      await installFixtureTree(cwd);
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
      import { mkdir, rm, writeFile } from 'node:fs/promises';
      import { resolve } from 'node:path';
      import { bootstrapDependencies } from ${JSON.stringify(childModule)};
      const delay = (ms) => new Promise((resolvePromise) => setTimeout(resolvePromise, ms));
      await bootstrapDependencies({
        repositoryDirectory: process.argv[1],
        runInstall: async ({ cwd }) => {
          const marker = resolve(cwd, '.bootstrap-active');
          await mkdir(marker);
          try {
            await delay(60);
            await mkdir(resolve(cwd, 'node_modules'), { recursive: true });
            await writeFile(resolve(cwd, 'node_modules', '.package-lock.json'), JSON.stringify({ lockfileVersion: 3, packages: { '': {} } }));
          } finally { await rm(marker, { recursive: true, force: true }); }
        },
      });
    `;
    try {
      await writeFile(lockPath, JSON.stringify({ pid: 999_999, token: '../../bootstrap-token-traversal' }));
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
