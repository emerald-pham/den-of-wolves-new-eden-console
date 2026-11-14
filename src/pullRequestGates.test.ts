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
    expect(result.stdout).toMatch(/^targets=hosting$/m);
    expect(result.stdout).toMatch(/^function_names=$/m);
  });
});

describe('pull request closing-keyword gate', () => {
  const workflowPath = '.github/workflows/pr-body.yml';

  const gateScript = resolve(process.cwd(), 'scripts/pr-closing-keywords.mjs');

  async function checkBody(body: string, { cwd = process.cwd(), env = {} }: { cwd?: string; env?: Record<string, string> } = {}) {
    return execFileAsync(process.execPath, [gateScript], {
      cwd,
      encoding: 'utf8',
      env: { ...process.env, PR_BODY: body, ...env },
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

  it('fails a pull request whose title would close an issue, because the merge commit carries the title', async () => {
    const result = await checkBody('Refs #463', { env: { PR_TITLE: 'Retro tooling fixes (refs #463)' } });
    expect(result.code).toBe(0);
    const closing = await checkBody('Refs #463', { env: { PR_TITLE: 'Retro tooling, closes #463' } });
    expect(closing.code).toBe(1);
    expect(closing.output).toContain('PR title: closes #463');
  });

  /** A repository whose base commit closes #1 and whose PR range holds `messages`. */
  async function pullRequestRange(messages: string[]) {
    const repository = await mkdtemp(resolve(tmpdir(), 'den-of-wolves-pr-commits-'));
    const git = async (args: string[]) => (await execFileAsync('git', args, { cwd: repository, encoding: 'utf8' })).stdout.trim();
    await git(['init', '--quiet', '--initial-branch=main']);
    await git(['config', 'user.email', 'ci@example.test']);
    await git(['config', 'user.name', 'CI']);
    await git(['commit', '--quiet', '--allow-empty', '-m', 'chore: earlier work\n\nCloses #1']);
    const base = await git(['rev-parse', 'HEAD']);
    const shas: string[] = [];
    for (const message of messages) {
      await git(['commit', '--quiet', '--allow-empty', '-m', message]);
      shas.push(await git(['rev-parse', 'HEAD']));
    }
    return { repository, env: { PR_BASE_SHA: base, PR_HEAD_SHA: await git(['rev-parse', 'HEAD']) }, shas };
  }

  it('fails a pull request whose commit messages would close issues when they land', async () => {
    const range = await pullRequestRange(['feat: add the thing', 'fix: repair the selector\n\nFixes #12', 'docs: notes\n\nresolves org/repo#7']);
    try {
      const result = await checkBody('Refs #463', { cwd: range.repository, env: range.env });
      expect(result.code).toBe(1);
      expect(result.output).toContain(`commit ${range.shas[1]!.slice(0, 12)}: Fixes #12`);
      expect(result.output).toContain(`commit ${range.shas[2]!.slice(0, 12)}: resolves org/repo#7`);
      expect(result.output).not.toMatch(/Closes #1\b/);
    } finally {
      await rm(range.repository, { recursive: true, force: true });
    }
  });

  it('passes a pull request whose range commits close nothing, even when its base did', async () => {
    const range = await pullRequestRange(['feat: add the thing', 'fix: the selector crash']);
    try {
      const result = await checkBody('Refs #463', { cwd: range.repository, env: range.env });
      expect(result.output).toBe('No GitHub closing keywords found in the pull request body or commit messages.\n');
      expect(result.code).toBe(0);
    } finally {
      await rm(range.repository, { recursive: true, force: true });
    }
  });

  it('points each kind of ticket to its own closing route', async () => {
    const result = await checkBody('Closes #460');
    expect(result.output).toContain(
      'Tracked briefs: npm run prompt-tracker -- update --issue NUMBER --close-as completed --reviewed --accepted --evidence PATH#ANCHOR',
    );
    expect(result.output).toContain(
      'Tracked prompts: npm run prompt-tracker -- update --issue NUMBER --status done --reviewed --accepted --evidence PATH#ANCHOR',
    );
    expect(result.output).toContain(
      'Refinement children (not in docs/tracker/github-crosswalk.json): gh issue close NUMBER --reason completed --comment "Evidence: PATH#ANCHOR"',
    );
  });

  it('checks the commits between the event base and head SHAs from a full-history checkout', () => {
    const workflow = readFileSync(workflowPath, 'utf8');
    expect(workflow).toContain('PR_BASE_SHA: ${{ github.event.pull_request.base.sha }}');
    expect(workflow).toContain('PR_HEAD_SHA: ${{ github.event.pull_request.head.sha }}');
    expect(workflow).toMatch(/uses: actions\/checkout@v7\n\s+with:\n\s+fetch-depth: 0/);
  });

  it('re-runs on every pull request title or body edit without interpolating either into a shell', () => {
    const workflow = readFileSync(workflowPath, 'utf8');
    expect(workflow).toMatch(/pull_request:\n\s+types: \[[^\]]*\bedited\b[^\]]*\]/);
    for (const type of ['opened', 'reopened', 'synchronize']) expect(workflow).toContain(type);
    expect(workflow).not.toMatch(/\n\s+paths(-ignore)?:/);
    expect(workflow).toContain('PR_BODY: ${{ github.event.pull_request.body }}');
    expect(workflow).toContain('run: node scripts/pr-closing-keywords.mjs');
    expect(workflow.match(/\$\{\{[^}]*body[^}]*\}\}/g)).toHaveLength(1);
    expect(workflow).toContain('PR_TITLE: ${{ github.event.pull_request.title }}');
    expect(workflow.match(/\$\{\{[^}]*title[^}]*\}\}/g)).toHaveLength(1);
  });
});
