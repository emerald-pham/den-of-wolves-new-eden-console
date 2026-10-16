import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { expect, it } from 'vitest';

const registry = resolve('scripts/emulator-resource-registry.mjs');

it('landed coordination finish cleans its branch automatically and preserved finish retains it', () => {
  const directory = realpathSync(mkdtempSync(join(tmpdir(), 'branch-closeout-lifecycle-')));
  try {
    for (const outcome of ['landed', 'preserved']) {
      const parent = join(directory, outcome);
      const cwd = join(parent, 'checkout');
      const remote = join(parent, 'origin.git');
      const bin = join(parent, 'bin');
      mkdirSync(cwd, { recursive: true });
      mkdirSync(bin);
      const git = (...args: string[]) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
      git('init', '--bare', '--initial-branch=main', remote);
      git('init', '--initial-branch=main');
      git('config', 'user.email', 'test@example.invalid');
      git('config', 'user.name', 'Cleanup fixture');
      writeFileSync(join(cwd, 'package.json'), JSON.stringify({ version: '0.1.0' }));
      writeFileSync(join(cwd, 'package-lock.json'), JSON.stringify({ version: '0.1.0', packages: { '': { version: '0.1.0' } } }));
      mkdirSync(join(cwd, 'src'));
      writeFileSync(join(cwd, 'src/changelog.ts'), "export const CHANGELOG = [{ version: '0.1.0', changes: ['Fixture'] }];\n");
      git('add', '.');
      git('commit', '-m', 'Initial fixture');
      const base = git('rev-parse', 'HEAD');
      git('remote', 'add', 'origin', remote);
      git('switch', '-c', 'task/finished');
      mkdirSync(join(cwd, 'docs'));
      writeFileSync(join(cwd, 'docs/task.md'), 'Finished maintenance task.\n');
      git('add', '.');
      git('commit', '-m', 'Finish documentation task');
      const head = git('rev-parse', 'HEAD');
      git('update-ref', 'refs/heads/main', head);
      git('push', 'origin', 'main', 'task/finished');
      git('fetch', 'origin');
      git('remote', 'set-head', 'origin', 'main');
      writeFileSync(join(bin, 'gh'), "#!/bin/sh\nprintf '[]\\n'\n", { mode: 0o755 });
      const ledger = join(parent, 'coordination.json');
      const foreign = { id: 'foreign', status: 'parked', branchName: 'task/elsewhere', worktree: '/unrelated/project', repositoryIdentity: '/unrelated/project/.git' };
      writeFileSync(ledger, JSON.stringify({ version: 1, entries: [foreign, {
        id: 'finished', status: 'active', branchName: 'task/finished', worktree: cwd,
        repositoryIdentity: git('rev-parse', '--absolute-git-dir'), startBranchSha: base,
        validation: { passed: true, commitSha: head },
      }], configurations: [], reservations: [] }));
      const args = [registry, 'finish', '--id', 'finished', '--file', ledger,
        '--outcome', outcome, '--artifact-dir', join(parent, 'recovery')];
      if (outcome === 'preserved') args.push('--preserve-ref', 'origin/task/finished');
      const result = spawnSync(process.execPath, args, {
        cwd, encoding: 'utf8', env: { ...process.env, PATH: `${bin}:${process.env.PATH}` },
      });
      expect(result.status, result.stderr || result.stdout).toBe(0);
      const state = JSON.parse(readFileSync(ledger, 'utf8'));
      expect(state.entries.find((entry: { id: string }) => entry.id === 'finished').status).toBe('complete');
      expect(state.entries.find((entry: { id: string }) => entry.id === 'foreign')).toEqual(foreign);
      const local = spawnSync('git', ['show-ref', '--verify', 'refs/heads/task/finished'], { cwd });
      const remoteHead = git('ls-remote', '--heads', 'origin', 'refs/heads/task/finished');
      if (outcome === 'landed') {
        expect(local.status).not.toBe(0);
        expect(remoteHead).toBe('');
        expect(git('rev-parse', '--abbrev-ref', 'HEAD')).toBe('HEAD');
      } else {
        expect(local.status).toBe(0);
        expect(remoteHead).toContain(head);
        expect(git('branch', '--show-current')).toBe('task/finished');
      }
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}, 30_000);
