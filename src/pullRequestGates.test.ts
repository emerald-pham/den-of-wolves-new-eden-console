import { execFile } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';

const execFileAsync = promisify(execFile);
const ci = readFileSync('.github/workflows/ci.yml', 'utf8');

function workflowStep(workflow: string, name: string) {
  const start = workflow.indexOf(`- name: ${name}\n`);
  expect(start, `workflow step "${name}"`).toBeGreaterThan(-1);
  const next = workflow.indexOf('\n      - ', start + 1);
  return workflow.slice(start, next === -1 ? undefined : next);
}

function runBlock(step: string) {
  const lines = step.split('\n');
  const runLine = lines.findIndex((line) => line.trim() === 'run: |');
  expect(runLine).toBeGreaterThan(-1);
  const indent = lines[runLine]!.indexOf('run:') + 2;
  return lines.slice(runLine + 1)
    .filter((line) => line.trim() === '' || line.startsWith(' '.repeat(indent)))
    .map((line) => line.slice(indent))
    .join('\n');
}

describe('pull request deployment target dry run', () => {
  const stepName = 'Dry-run deployment target selection for this pull request';

  async function runStepAgainst(prFiles: Record<string, string>) {
    const repository = await mkdtemp(resolve(tmpdir(), 'den-of-wolves-pr-targets-'));
    const git = (args: string[]) => execFileAsync('git', args, { cwd: repository, encoding: 'utf8' });
    try {
      await git(['init', '--quiet', '--initial-branch=main']);
      await git(['config', 'user.email', 'ci@example.test']);
      await git(['config', 'user.name', 'CI']);
      await mkdir(resolve(repository, 'functions', 'src'), { recursive: true });
      await mkdir(resolve(repository, 'src'), { recursive: true });
      await writeFile(
        resolve(repository, 'functions', 'src', 'index.ts'),
        "export const createThing = onCall(async () => { return 'baseline'; });\n",
      );
      await git(['add', '.']);
      await git(['commit', '--quiet', '-m', 'baseline']);
      await git(['update-ref', 'refs/remotes/origin/main', 'HEAD']);
      await git(['switch', '--quiet', '--create', 'feature']);
      for (const [file, contents] of Object.entries(prFiles)) {
        await writeFile(resolve(repository, file), contents);
      }
      await git(['add', '.']);
      await git(['commit', '--quiet', '-m', 'feature']);
      // GitHub checks out a pull request as a test merge into its base.
      await git(['switch', '--quiet', '--detach', 'main']);
      await git(['merge', '--quiet', '--no-ff', '-m', 'test merge', 'feature']);
      await symlink(resolve(process.cwd(), 'scripts'), resolve(repository, 'scripts'));
      const script = resolve(repository, '.pr-target-step.sh');
      await writeFile(script, runBlock(workflowStep(ci, stepName)));
      return await execFileAsync('bash', ['--noprofile', '--norc', '-eo', 'pipefail', script], {
        cwd: repository,
        encoding: 'utf8',
      }).then(
        ({ stdout, stderr }) => ({ code: 0, stdout, stderr }),
        (error: { code: number; stdout: string; stderr: string }) => ({
          code: error.code,
          stdout: error.stdout,
          stderr: error.stderr,
        }),
      );
    } finally {
      await rm(repository, { recursive: true, force: true });
    }
  }

  it('runs only for pull requests, before dependency installation', () => {
    const step = workflowStep(ci, stepName);
    expect(step).toContain("if: github.event_name == 'pull_request'");
    expect(ci.indexOf(`- name: ${stepName}`))
      .toBeLessThan(ci.indexOf('- name: Install locked root dependencies for release contracts'));
  });

  it('fails with the selector error for a range the deploy selector cannot resolve', async () => {
    const result = await runStepAgainst({
      'functions/src/unauditedHelper.ts': 'export const unaudited = true;\n',
    });
    expect(result.code).not.toBe(0);
    expect(result.stderr).toContain(
      'No audited callable consumer map exists for changed Functions module functions/src/unauditedHelper.ts.',
    );
  });

  it('passes and reports the targets for a range the deploy selector resolves', async () => {
    const result = await runStepAgainst({
      'functions/src/index.ts': "export const createThing = onCall(async () => { return 'changed'; });\n",
      'src/Landing.tsx': 'export {};\n',
    });
    expect(result.stderr).toBe('');
    expect(result.code).toBe(0);
    expect(result.stdout).toContain('deploy_only=hosting,functions:createThing');
  });
});
