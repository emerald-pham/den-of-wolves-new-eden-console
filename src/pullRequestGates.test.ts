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

  async function writeFiles(repository: string, files: Record<string, string>) {
    for (const [file, contents] of Object.entries(files)) {
      await writeFile(resolve(repository, file), contents);
    }
  }

  /**
   * Run the workflow step on GitHub's test merge of a feature branch into its base branch.
   * `baseFiles` are committed to an integration base branch that main does not have yet.
   */
  async function runStepAgainst(prFiles: Record<string, string>, baseFiles: Record<string, string> = {}) {
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
      await git(['switch', '--quiet', '--create', 'base']);
      if (Object.keys(baseFiles).length > 0) {
        await writeFiles(repository, baseFiles);
        await git(['add', '.']);
        await git(['commit', '--quiet', '-m', 'integration base']);
      }
      const baseSha = (await git(['rev-parse', 'HEAD'])).stdout.trim();
      await git(['switch', '--quiet', '--create', 'feature']);
      await writeFiles(repository, prFiles);
      await git(['add', '.']);
      await git(['commit', '--quiet', '-m', 'feature']);
      // GitHub checks out a pull request as a test merge into its base.
      await git(['switch', '--quiet', '--detach', 'base']);
      await git(['merge', '--quiet', '--no-ff', '-m', 'test merge', 'feature']);
      await symlink(resolve(process.cwd(), 'scripts'), resolve(repository, 'scripts'));
      const script = resolve(repository, '.pr-target-step.sh');
      await writeFile(script, runBlock(workflowStep(ci, stepName)));
      return await execFileAsync('bash', ['--noprofile', '--norc', '-eo', 'pipefail', script], {
        cwd: repository,
        encoding: 'utf8',
        // The workflow passes the event's base SHA through env.
        env: { ...process.env, PR_BASE_SHA: baseSha },
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
    expect(step).toContain('PR_BASE_SHA: ${{ github.event.pull_request.base.sha }}');
    expect(step).not.toContain('merge-base');
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

  it('checks only the pull request range when the base is an integration branch ahead of main', async () => {
    const result = await runStepAgainst(
      { 'src/Landing.tsx': 'export {};\n' },
      { 'functions/src/unauditedHelper.ts': 'export const unaudited = true;\n' },
    );
    expect(result.stderr).toBe('');
    expect(result.code).toBe(0);
    expect(result.stdout).toContain('deploy_only=hosting');
    expect(result.stdout).not.toContain('functions');
  });
});

describe('pull request closing-keyword gate', () => {
  const workflowPath = '.github/workflows/pr-body.yml';

  async function checkBody(body: string) {
    return execFileAsync(process.execPath, ['scripts/pr-closing-keywords.mjs'], {
      encoding: 'utf8',
      env: { ...process.env, PR_BODY: body },
    }).then(
      ({ stdout, stderr }) => ({ code: 0, output: `${stdout}${stderr}` }),
      (error: { code: number; stdout: string; stderr: string }) => ({
        code: error.code,
        output: `${error.stdout}${error.stderr}`,
      }),
    );
  }

  it.each([
    'Closes #460',
    'This release fixes: #12 and more.',
    'Resolved emerald-pham/den-of-wolves-new-eden-console#463',
    'FIX https://github.com/emerald-pham/den-of-wolves-new-eden-console/issues/5',
    'Summary\n\n- close #1\n- resolves #2',
    'fixed #9',
  ])('fails a body that would close an issue: %j', async (body) => {
    const result = await checkBody(body);
    expect(result.code).toBe(1);
    expect(result.output).toContain('npm run prompt-tracker -- update --issue NUMBER');
  });

  it.each([
    '',
    'Refs #463',
    'Part of #460. Tracker completion follows through the prompt tracker.',
    'This fixes the selector crash.',
    'A closed-loop check, the prefix #3 and unresolved #4 stay open.',
  ])('passes a body that closes no issue: %j', async (body) => {
    const result = await checkBody(body);
    expect(result.code).toBe(0);
  });

  it('re-runs on every pull request body edit without interpolating the body into a shell', () => {
    const workflow = readFileSync(workflowPath, 'utf8');
    expect(workflow).toMatch(/pull_request:\n\s+types: \[[^\]]*\bedited\b[^\]]*\]/);
    for (const type of ['opened', 'reopened', 'synchronize']) expect(workflow).toContain(type);
    expect(workflow).not.toMatch(/\n\s+paths(-ignore)?:/);
    expect(workflow).toContain('PR_BODY: ${{ github.event.pull_request.body }}');
    expect(workflow).toContain('run: node scripts/pr-closing-keywords.mjs');
    expect(workflow.match(/\$\{\{[^}]*body[^}]*\}\}/g)).toHaveLength(1);
  });
});
