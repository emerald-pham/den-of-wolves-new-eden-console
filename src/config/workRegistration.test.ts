import { describe, expect, it } from 'vitest';
import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { promisify } from 'node:util';
import {
  validateCommitRange,
  validateStagedRegistration,
  validateWorkRegistration,
} from '../../scripts/validate-work-registration.mjs';

const execFileAsync = promisify(execFile);

async function git(cwd: string, ...args: string[]) {
  const result = await execFileAsync('git', args, { cwd, encoding: 'utf8' });
  return result.stdout.trim();
}

const planSource = [
  '- [x] Prompt 660',
  '- [x] Prompt 661',
  '- [x] Prompt 664',
  '- **Prompt 660 — [REPAIR] Prepare exact validation.** Acceptance: done.',
  '- **Prompt 661 — [POLISH] Classify documentation-only changes.** Acceptance: done.',
  '- **Prompt 664 — [REPAIR] Require roadmap registration.** Acceptance: done. Dependencies: Prompts 660 and 661.',
].join('\n');

const progressSource = [
  '| 660 | done | non-feature | — | Existing exact validation. |',
  '| 661 | done | non-feature | — | Existing documentation-only classification. |',
  '| 664 | done | non-feature | — | Universal registration gate. |',
].join('\n');

const dependencySource = [
  '| prompt_id | plan_tag | progress | hard_prompt_prerequisites | hard_milestone | hard_contract | decision_owner | closure_evidence_gates | sequence_rules | release_boundaries | related_consumes | evidence_ids | milestone_hints | title |',
  '| 660 | REPAIR | done | none | none | none | none | none | none | none | none | none | none | Prepare exact validation. |',
  '| 661 | POLISH | done | none | none | none | none | none | none | none | none | none | none | Classify documentation-only changes. |',
  '| 664 | REPAIR | done | 660;661 | none | none | none | none | UNIVERSAL-ROADMAP-REGISTRATION | none | none | E-664 | none | Require roadmap registration. |',
  '| E-664 | hard_prompt / sequence / registration | 664 -> 660;661 | IMPLEMENTATION_PLAN.md - Prompt 664 definition | Dependencies: Prompts 660 and 661; every new work item records its reviewed dependency set. |',
].join('\n');

const parentPlanSource = planSource
  .split('\n')
  .filter((line) => !line.includes('Prompt 664'))
  .join('\n');
const parentProgressSource = progressSource
  .split('\n')
  .filter((line) => !line.startsWith('| 664 |'))
  .join('\n');
const parentDependencySource = dependencySource
  .split('\n')
  .filter((line) => !line.startsWith('| 664 |') && !line.startsWith('| E-664 |'))
  .join('\n');

const currentSources = {
  planSource,
  progressSource,
  dependencySource,
};

describe('universal implementation work registration', () => {
  it('installs the same validator at commit, push, package, and CI boundaries', async () => {
    const [packageSource, commitHook, pushHook, ciSource] = await Promise.all([
      readFile(resolve(process.cwd(), 'package.json'), 'utf8'),
      readFile(resolve(process.cwd(), '.githooks/commit-msg'), 'utf8'),
      readFile(resolve(process.cwd(), '.githooks/pre-push'), 'utf8'),
      readFile(resolve(process.cwd(), '.github/workflows/ci.yml'), 'utf8'),
    ]);
    const scripts = JSON.parse(packageSource).scripts;

    expect(scripts.prepare).toBe('node scripts/install-git-hooks.mjs');
    expect(scripts['validate:work-registration']).toBe('node scripts/validate-work-registration.mjs');
    expect(commitHook).toContain('validate-work-registration.mjs');
    expect(commitHook).toContain('--staged true');
    expect(commitHook).toContain('--message-file');
    expect(pushHook).toContain('docs/reference');
    expect(pushHook).toContain('validate-work-registration.mjs');
    expect(pushHook).toContain('--range');
    expect(ciSource).toContain('Validate implementation work registration');
    expect(ciSource).toContain('validate:work-registration -- --range');
    expect(ciSource).toContain('git rev-parse --verify "$head_sha^"');
    expect(ciSource).toContain('validate:work-registration -- --commit "$head_sha"');
    expect(ciSource).toContain('EXACT_HEAD_COMMIT: ${{ inputs.exact_head_commit || false }}');
    expect(ciSource).toContain('Unable to derive a trusted implementation-registration base');
    expect(ciSource).toContain('[ "$base_sha" = "$head_sha" ]');
    expect(ciSource).not.toContain('paths-ignore:');
    expect(ciSource).toContain("- '!**/*.md'");
    expect(ciSource).toContain('if [ "$documentation_only" = true ]');
    expect(ciSource).toContain('npm run coordination:docs');
    expect(ciSource).toContain("if: steps.work_registration.outputs.documentation_only != 'true'");
    for (const authorityPath of [
      'docs/IMPLEMENTATION_PLAN.md',
      'docs/IMPLEMENTATION_PROGRESS.md',
      'docs/IMPLEMENTATION_PROMPT_DEPENDENCIES.md',
    ]) {
      expect(ciSource).toContain(`- '${authorityPath}'`);
    }
  });

  it('validates staged sources and rejects pre-registration in a separate docs-only commit', async () => {
    const root = await mkdtemp(resolve(tmpdir(), 'work-registration-'));
    const messageFile = resolve(root, '.git', 'WORK_REGISTRATION_MESSAGE');
    try {
      await git(root, 'init', '-b', 'main');
      await git(root, 'config', 'user.email', 'fixture@example.test');
      await git(root, 'config', 'user.name', 'Fixture');
      await mkdir(resolve(root, 'docs'), { recursive: true });
      await writeFile(resolve(root, 'docs/IMPLEMENTATION_PLAN.md'), parentPlanSource);
      await writeFile(resolve(root, 'docs/IMPLEMENTATION_PROGRESS.md'), parentProgressSource);
      await writeFile(resolve(root, 'docs/IMPLEMENTATION_PROMPT_DEPENDENCIES.md'), parentDependencySource);
      await git(root, 'add', 'docs');
      await git(root, 'commit', '-m', 'docs: seed authorities');
      const base = await git(root, 'rev-parse', 'HEAD');

      await git(root, 'switch', '-c', 'valid-registration');
      await writeFile(resolve(root, 'docs/IMPLEMENTATION_PLAN.md'), planSource);
      await writeFile(resolve(root, 'docs/IMPLEMENTATION_PROGRESS.md'), progressSource);
      await writeFile(resolve(root, 'docs/IMPLEMENTATION_PROMPT_DEPENDENCIES.md'), dependencySource);
      await mkdir(resolve(root, 'scripts'), { recursive: true });
      await writeFile(resolve(root, 'scripts/gate.mjs'), 'export const gate = true;\n');
      await writeFile(messageFile, 'tooling: add the gate\n\nImplementation-Prompt: 664\n');
      await git(root, 'add', 'docs', 'scripts/gate.mjs');

      expect(validateStagedRegistration({ cwd: root, messageFile }).errors).toEqual([]);
      await git(root, 'commit', '-F', messageFile);
      expect(validateCommitRange({ cwd: root, range: `${base}..HEAD` }).errors).toEqual([]);
      await writeFile(resolve(root, 'scripts/exact-validation.mjs'), 'export const exact = true;\n');
      await git(root, 'add', 'scripts/exact-validation.mjs');
      await writeFile(messageFile, 'tooling: extend the registered gate\n\nImplementation-Prompt: 664\n');
      expect(validateStagedRegistration({ cwd: root, messageFile }).errors).toEqual([]);
      await git(root, 'commit', '-F', messageFile);
      await writeFile(resolve(root, 'scripts/preserved-source.mjs'), 'export const preserved = true;\n');
      await git(root, 'add', 'scripts/preserved-source.mjs');
      await git(root, 'commit', '-m', 'tooling: preserve a validated source', '-m', 'Implementation-Prompt: 660');
      const preservedSourceCommit = await git(root, 'rev-parse', 'HEAD');
      const planWith665 = `${planSource}\n- [x] Prompt 665\n- **Prompt 665 — [REPAIR] Bind every commit in a coordination range.** Acceptance: done. Dependencies: Prompt 664.`;
      const progressWith665 = `${progressSource}\n| 665 | done | non-feature | — | Exact coordination prompt binding. |`;
      const dependencyWith665 = `${dependencySource}\n| 665 | REPAIR | done | 664 | none | none | none | none | PROMPT-RANGE-BINDING | none | none | E-665 | none | Bind every coordination-range commit. |\n| E-665 | hard_prompt / sequence / registration | 665 -> 664 | IMPLEMENTATION_PLAN.md - Prompt 665 definition | Dependencies: Prompt 664; preserve the exact transition. |`;
      await writeFile(resolve(root, 'docs/IMPLEMENTATION_PLAN.md'), planWith665);
      await writeFile(resolve(root, 'docs/IMPLEMENTATION_PROGRESS.md'), progressWith665);
      await writeFile(resolve(root, 'docs/IMPLEMENTATION_PROMPT_DEPENDENCIES.md'), dependencyWith665);
      await writeFile(resolve(root, 'scripts/prompt-binding.mjs'), 'export const binding = true;\n');
      await git(root, 'add', 'docs', 'scripts/prompt-binding.mjs');
      await git(root, 'commit', '-m', 'tooling: bind the coordination range', '-m', 'Implementation-Prompt: 665');
      expect(validateCommitRange({
        cwd: root,
        range: `${base}..HEAD`,
        coordinationPrompt: '664',
      }).errors.join('\n')).toContain('does not match coordination Prompt 664');
      expect(validateCommitRange({
        cwd: root,
        range: `${base}..HEAD`,
        coordinationPrompt: '665',
        coordinationPromptBefore: '664',
      }).errors.join('\n')).toContain('commit trailer Prompt 660 does not match coordination Prompt 665');
      expect(validateCommitRange({
        cwd: root,
        range: `${base}..HEAD`,
        coordinationPrompt: '665',
        coordinationPromptBefore: '664',
        coordinationPromptBindings: [{ prompt: '660', commit: preservedSourceCommit }],
      }).errors).toEqual([]);
      await writeFile(resolve(root, 'scripts/unowned-source.mjs'), 'export const unowned = true;\n');
      await git(root, 'add', 'scripts/unowned-source.mjs');
      await git(root, 'commit', '-m', 'tooling: add an unowned commit', '-m', 'Implementation-Prompt: 660');
      expect(validateCommitRange({
        cwd: root,
        range: `${base}..HEAD`,
        coordinationPrompt: '665',
        coordinationPromptBefore: '664',
        coordinationPromptBindings: [{ prompt: '660', commit: preservedSourceCommit }],
      }).errors.join('\n')).toContain('commit trailer Prompt 660 does not match coordination Prompt 665');
      const preservedSourceTip = await git(root, 'rev-parse', 'HEAD');
      expect(validateCommitRange({
        cwd: root,
        range: `${base}..HEAD`,
        coordinationPrompt: '665',
        coordinationPromptBefore: '664',
        coordinationPromptBindings: [{ prompt: '660', commit: preservedSourceTip }],
      }).errors.join('\n')).toContain(
        `${preservedSourceCommit.slice(0, 12)}: commit trailer Prompt 660 does not match coordination Prompt 665`,
      );

      await git(root, 'switch', '-c', 'split-registration', base);
      await writeFile(resolve(root, 'docs/IMPLEMENTATION_PLAN.md'), planSource);
      await writeFile(resolve(root, 'docs/IMPLEMENTATION_PROGRESS.md'), progressSource);
      await writeFile(resolve(root, 'docs/IMPLEMENTATION_PROMPT_DEPENDENCIES.md'), dependencySource);
      await git(root, 'add', 'docs');
      await git(root, 'commit', '-m', 'docs: pre-register the gate');
      await mkdir(resolve(root, 'scripts'), { recursive: true });
      await writeFile(resolve(root, 'scripts/gate.mjs'), 'export const gate = true;\n');
      await git(root, 'add', 'scripts/gate.mjs');
      await writeFile(messageFile, 'tooling: add the gate\n\nImplementation-Prompt: 664\n');
      expect(validateStagedRegistration({ cwd: root, messageFile }).errors.join('\n'))
        .toContain('must be registered in the same non-documentation commit');
      await git(root, 'commit', '-m', 'tooling: add the gate', '-m', 'Implementation-Prompt: 664');

      expect(validateCommitRange({ cwd: root, range: `${base}..HEAD` }).errors.join('\n'))
        .toContain('must be registered in the same non-documentation commit');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  }, 15_000);

  it('fails closed when staged validation cannot resolve main as a trusted branch baseline', async () => {
    const root = await mkdtemp(resolve(tmpdir(), 'work-registration-no-baseline-'));
    const messageFile = resolve(root, '.git', 'WORK_REGISTRATION_MESSAGE');
    try {
      await git(root, 'init', '-b', 'detached-history');
      await git(root, 'config', 'user.email', 'fixture@example.test');
      await git(root, 'config', 'user.name', 'Fixture');
      await mkdir(resolve(root, 'docs'), { recursive: true });
      await writeFile(resolve(root, 'docs/IMPLEMENTATION_PLAN.md'), planSource);
      await writeFile(resolve(root, 'docs/IMPLEMENTATION_PROGRESS.md'), progressSource);
      await writeFile(resolve(root, 'docs/IMPLEMENTATION_PROMPT_DEPENDENCIES.md'), dependencySource);
      await git(root, 'add', 'docs');
      await git(root, 'commit', '-m', 'docs: seed authorities');
      await mkdir(resolve(root, 'scripts'), { recursive: true });
      await writeFile(resolve(root, 'scripts/gate.mjs'), 'export const gate = true;\n');
      await git(root, 'add', 'scripts/gate.mjs');
      await writeFile(messageFile, 'tooling: change gate\n\nImplementation-Prompt: 664\n');

      expect(validateStagedRegistration({ cwd: root, messageFile }).errors.join('\n'))
        .toContain('could not resolve a trusted main branch baseline');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('validates non-documentation conflict resolutions in merge commits', async () => {
    const root = await mkdtemp(resolve(tmpdir(), 'work-registration-merge-'));
    try {
      await git(root, 'init', '-b', 'main');
      await git(root, 'config', 'user.email', 'fixture@example.test');
      await git(root, 'config', 'user.name', 'Fixture');
      await mkdir(resolve(root, 'docs'), { recursive: true });
      await writeFile(resolve(root, 'docs/IMPLEMENTATION_PLAN.md'), planSource);
      await writeFile(resolve(root, 'docs/IMPLEMENTATION_PROGRESS.md'), progressSource);
      await writeFile(resolve(root, 'docs/IMPLEMENTATION_PROMPT_DEPENDENCIES.md'), dependencySource);
      await writeFile(resolve(root, 'gate.txt'), 'base\n');
      await git(root, 'add', '.');
      await git(root, 'commit', '-m', 'docs: seed fixture');
      await git(root, 'switch', '-c', 'feature');
      await writeFile(resolve(root, 'gate.txt'), 'feature\n');
      await git(root, 'add', 'gate.txt');
      await git(root, 'commit', '-m', 'tooling: feature change', '-m', 'Implementation-Prompt: 664');
      await git(root, 'switch', 'main');
      await writeFile(resolve(root, 'gate.txt'), 'main\n');
      await git(root, 'add', 'gate.txt');
      await git(root, 'commit', '-m', 'tooling: main change', '-m', 'Implementation-Prompt: 664');
      const rangeBase = await git(root, 'rev-parse', 'HEAD');
      await expect(execFileAsync('git', ['merge', '--no-ff', 'feature'], { cwd: root }))
        .rejects.toMatchObject({ code: 1 });
      await writeFile(resolve(root, 'gate.txt'), 'resolved\n');
      await git(root, 'add', 'gate.txt');
      await git(root, 'commit', '-m', 'merge feature with conflict resolution');

      const result = validateCommitRange({ cwd: root, range: `${rangeBase}..HEAD` });
      expect(result.commits).toHaveLength(2);
      expect(result.errors.join('\n')).toContain('exactly one Implementation-Prompt trailer');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('exempts only the repository-defined Markdown and README documentation paths', () => {
    const result = validateWorkRegistration({
      changedFiles: ['README.md', 'docs/example.md'],
      message: 'docs: clarify setup',
      ...currentSources,
    });
    const mdx = validateWorkRegistration({
      changedFiles: ['docs/example.mdx'],
      message: 'docs: add executable documentation component',
      ...currentSources,
    });

    expect(result).toMatchObject({ documentationOnly: true, errors: [] });
    expect(mdx.documentationOnly).toBe(false);
    expect(mdx.errors.join('\n')).toContain('exactly one Implementation-Prompt trailer');
  });

  it.each([
    {
      authority: 'status',
      sources: {
        ...currentSources,
        planSource: planSource.replace('- [x] Prompt 664', '- [ ] Prompt 664'),
        progressSource: progressSource.replace('| 664 | done |', '| 664 | partial |'),
        dependencySource: dependencySource.replace('| 664 | REPAIR | done |', '| 664 | REPAIR | partial |'),
      },
    },
    {
      authority: 'change class',
      sources: {
        ...currentSources,
        progressSource: progressSource.replace(
          '| 660 | done | non-feature | — |',
          '| 660 | done | feature | 0.3.0 |',
        ),
      },
    },
    {
      authority: 'plan tag',
      sources: {
        ...currentSources,
        planSource: planSource.replace('Prompt 661 — [POLISH]', 'Prompt 661 — [REPAIR]'),
        dependencySource: dependencySource.replace('| 661 | POLISH |', '| 661 | REPAIR |'),
      },
    },
    {
      authority: 'dependency mapping',
      sources: {
        ...currentSources,
        dependencySource: dependencySource.replace('| 664 | REPAIR | done | 660;661 |', '| 664 | REPAIR | done | 660 |'),
      },
    },
    {
      authority: 'release mapping',
      sources: {
        ...currentSources,
        progressSource: progressSource.replace(
          '| 660 | done | non-feature | — |',
          '| 660 | done | non-feature | 0.3.0 |',
        ),
      },
    },
  ])('rejects documentation-only mutation of an existing prompt $authority', ({ authority, sources }) => {
    const result = validateWorkRegistration({
      changedFiles: [
        'docs/IMPLEMENTATION_PLAN.md',
        'docs/IMPLEMENTATION_PROGRESS.md',
        'docs/IMPLEMENTATION_PROMPT_DEPENDENCIES.md',
      ],
      message: 'docs: rewrite canonical authority',
      ...sources,
      parentPlanSource: planSource,
      parentProgressSource: progressSource,
      parentDependencySource: dependencySource,
    });

    expect(result.documentationOnly).toBe(true);
    expect(result.errors.join('\n')).toContain(`cannot change canonical Prompt`);
    expect(result.errors.join('\n')).toContain(authority);
  });

  it('blocks a staged and committed documentation-only class rewrite at the tracked hook boundaries', async () => {
    const root = await mkdtemp(resolve(tmpdir(), 'work-registration-authority-rewrite-'));
    const messageFile = resolve(root, '.git', 'WORK_REGISTRATION_MESSAGE');
    try {
      await git(root, 'init', '-b', 'main');
      await git(root, 'config', 'user.email', 'fixture@example.test');
      await git(root, 'config', 'user.name', 'Fixture');
      await mkdir(resolve(root, 'docs'), { recursive: true });
      await writeFile(resolve(root, 'docs/IMPLEMENTATION_PLAN.md'), planSource);
      await writeFile(resolve(root, 'docs/IMPLEMENTATION_PROGRESS.md'), progressSource);
      await writeFile(resolve(root, 'docs/IMPLEMENTATION_PROMPT_DEPENDENCIES.md'), dependencySource);
      await git(root, 'add', 'docs');
      await git(root, 'commit', '-m', 'docs: seed canonical authority');
      const base = await git(root, 'rev-parse', 'HEAD');
      await writeFile(
        resolve(root, 'docs/IMPLEMENTATION_PROGRESS.md'),
        progressSource.replace('| 660 | done | non-feature | — |', '| 660 | done | feature | 0.3.0 |'),
      );
      await git(root, 'add', 'docs/IMPLEMENTATION_PROGRESS.md');
      await writeFile(messageFile, 'docs: rewrite canonical class\n');

      expect(validateStagedRegistration({ cwd: root, messageFile }).errors.join('\n'))
        .toContain('cannot change canonical Prompt 660 change class');
      await git(root, 'commit', '--no-verify', '-F', messageFile);
      expect(validateCommitRange({ cwd: root, range: `${base}..HEAD` }).errors.join('\n'))
        .toContain('cannot change canonical Prompt 660 change class');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('allows unrelated documentation and complete future-prompt registration through the docs-only path', () => {
    const unrelated = validateWorkRegistration({
      changedFiles: ['docs/example.md'],
      message: 'docs: clarify an example',
    });
    const futurePrompt = validateWorkRegistration({
      changedFiles: [
        'docs/IMPLEMENTATION_PLAN.md',
        'docs/IMPLEMENTATION_PROGRESS.md',
        'docs/IMPLEMENTATION_PROMPT_DEPENDENCIES.md',
      ],
      message: 'docs: register future Prompt 664',
      ...currentSources,
      parentPlanSource,
      parentProgressSource,
      parentDependencySource,
    });

    expect(unrelated).toMatchObject({ documentationOnly: true, errors: [] });
    expect(futurePrompt).toMatchObject({ documentationOnly: true, errors: [] });
  });

  it('rejects a Prompt 141 feature commit from a Prompt 665 coordination range', async () => {
    const root = await mkdtemp(resolve(tmpdir(), 'work-registration-foreign-feature-'));
    try {
      await git(root, 'init', '-b', 'main');
      await git(root, 'config', 'user.email', 'fixture@example.test');
      await git(root, 'config', 'user.name', 'Fixture');
      await mkdir(resolve(root, 'docs'), { recursive: true });
      await writeFile(resolve(root, 'docs/IMPLEMENTATION_PLAN.md'), [
        '- [x] Prompt 141',
        '- **Prompt 141 — [PROMPT] Ship a player-facing feature.** Acceptance: done.',
        '- [x] Prompt 665',
        '- **Prompt 665 — [REPAIR] Bind coordination ranges.** Acceptance: done. Dependencies: Prompt 141.',
      ].join('\n'));
      await writeFile(resolve(root, 'docs/IMPLEMENTATION_PROGRESS.md'), [
        '| 141 | done | feature | 0.3.2 | Feature release. |',
        '| 665 | done | non-feature | — | Exact coordination binding. |',
      ].join('\n'));
      await writeFile(resolve(root, 'docs/IMPLEMENTATION_PROMPT_DEPENDENCIES.md'), [
        '| prompt_id | plan_tag | progress | hard_prompt_prerequisites | hard_milestone | hard_contract | decision_owner | closure_evidence_gates | sequence_rules | release_boundaries | related_consumes | evidence_ids | milestone_hints | title |',
        '| 141 | PROMPT | done | none | none | none | none | none | none | none | none | none | none | Ship a player-facing feature. |',
        '| 665 | REPAIR | done | 141 | none | none | none | none | none | none | none | none | none | Bind coordination ranges. |',
      ].join('\n'));
      await git(root, 'add', 'docs');
      await git(root, 'commit', '-m', 'docs: seed Prompt 141');
      const base = await git(root, 'rev-parse', 'HEAD');
      await mkdir(resolve(root, 'src'), { recursive: true });
      await writeFile(resolve(root, 'src/feature.ts'), 'export const feature = true;\n');
      await git(root, 'add', 'src/feature.ts');
      await git(root, 'commit', '-m', 'feat: ship Prompt 141', '-m', 'Implementation-Prompt: 141');
      const foreignFeatureCommit = await git(root, 'rev-parse', 'HEAD');
      await writeFile(resolve(root, 'src/feature-tip.ts'), 'export const featureTip = true;\n');
      await git(root, 'add', 'src/feature-tip.ts');
      await git(root, 'commit', '-m', 'feat: preserve Prompt 141 tip', '-m', 'Implementation-Prompt: 141');
      const preservedFeatureTip = await git(root, 'rev-parse', 'HEAD');
      await mkdir(resolve(root, 'scripts'), { recursive: true });
      await writeFile(resolve(root, 'scripts/prompt-665.mjs'), 'export const exactBinding = true;\n');
      await git(root, 'add', 'scripts/prompt-665.mjs');
      await git(root, 'commit', '-m', 'tooling: bind Prompt 665', '-m', 'Implementation-Prompt: 665');

      const errors = validateCommitRange({
        cwd: root,
        range: `${base}..HEAD`,
        coordinationPrompt: '665',
        coordinationPromptBindings: [{ prompt: '141', commit: preservedFeatureTip }],
      }).errors.join('\n');
      expect(errors).toContain(foreignFeatureCommit.slice(0, 12));
      expect(errors).toContain('canonical feature Prompt 141 cannot be preserved by coordination Prompt 665');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('rejects non-documentation work without one durable prompt trailer', () => {
    const missing = validateWorkRegistration({
      changedFiles: ['scripts/example.mjs'],
      message: 'tooling: change the gate',
      ...currentSources,
    });
    const duplicate = validateWorkRegistration({
      changedFiles: ['src/App.tsx'],
      message: 'fix: change behavior\n\nImplementation-Prompt: 660\nImplementation-Prompt: 661',
      ...currentSources,
    });

    expect(missing.errors.join('\n')).toContain('exactly one Implementation-Prompt trailer');
    expect(duplicate.errors.join('\n')).toContain('exactly one Implementation-Prompt trailer');
  });

  it('requires the prompt trailer to be the last nonblank commit-message line', () => {
    const result = validateWorkRegistration({
      changedFiles: ['scripts/example.mjs'],
      message: 'tooling: change the gate\n\nImplementation-Prompt: 664\nSigned-off-by: Fixture <fixture@example.test>',
      ...currentSources,
    });

    expect(result.errors.join('\n')).toContain('must be the final nonblank line');
  });

  it('accepts an existing dependency-ready prompt registered in every authority', () => {
    const result = validateWorkRegistration({
      changedFiles: ['scripts/example.mjs', 'src/example.test.ts'],
      message: 'tooling: change the gate\n\nImplementation-Prompt: 664',
      ...currentSources,
    });

    expect(result).toMatchObject({
      documentationOnly: false,
      prompt: '664',
      newPrompt: false,
      errors: [],
    });
  });

  it('rejects an ID missing from the plan, progress ledger, or dependency index', () => {
    const result = validateWorkRegistration({
      changedFiles: ['scripts/example.mjs'],
      message: 'tooling: uncharted work\n\nImplementation-Prompt: 665',
      ...currentSources,
    });

    expect(result.errors).toEqual(expect.arrayContaining([
      expect.stringContaining('canonical plan'),
      expect.stringContaining('progress ledger'),
      expect.stringContaining('dependency index'),
    ]));
  });

  it('fails closed when a hard prerequisite or manual gate remains unresolved', () => {
    const unresolved = validateWorkRegistration({
      changedFiles: ['scripts/example.mjs'],
      message: 'tooling: gated work\n\nImplementation-Prompt: 664',
      planSource,
      progressSource: progressSource.replace('| 661 | done |', '| 661 | partial |'),
      dependencySource,
    });
    const manual = validateWorkRegistration({
      changedFiles: ['scripts/example.mjs'],
      message: 'tooling: gated work\n\nImplementation-Prompt: 664',
      ...currentSources,
      dependencySource: dependencySource.replace(
        '| 664 | REPAIR | done | 660;661 | none | none | none |',
        '| 664 | REPAIR | done | 660;661 | M1 | CURRENT-CONTRACT | OWNER-APPROVAL |',
      ),
    });

    expect(unresolved.errors.join('\n')).toContain('hard prerequisite 661 is partial');
    expect(manual.errors.join('\n')).toContain('hard_milestone=M1');
    expect(manual.errors.join('\n')).toContain('hard_contract=CURRENT-CONTRACT');
    expect(manual.errors.join('\n')).toContain('decision_owner=OWNER-APPROVAL');
  });

  it('rejects a missing prompt but allows the documented in-progress commit state', () => {
    const result = validateWorkRegistration({
      changedFiles: ['scripts/example.mjs'],
      message: 'tooling: incomplete work\n\nImplementation-Prompt: 664',
      ...currentSources,
      progressSource: progressSource.replace('| 664 | done |', '| 664 | missing |'),
      dependencySource: dependencySource.replace('| 664 | REPAIR | done |', '| 664 | REPAIR | missing |'),
    });
    const inProgress = validateWorkRegistration({
      changedFiles: ['scripts/example.mjs'],
      message: 'tooling: incremental work\n\nImplementation-Prompt: 664',
      ...currentSources,
      planSource: planSource.replace('- [x] Prompt 664', '- [ ] Prompt 664'),
      progressSource: progressSource.replace('| 664 | done |', '| 664 | in-progress |'),
      dependencySource: dependencySource.replace('| 664 | REPAIR | done |', '| 664 | REPAIR | in-progress |'),
    });

    expect(result.errors.join('\n')).toContain('must be in-progress, partial, or done');
    expect(inProgress.errors).toEqual([]);
  });

  it('requires an uncharted task to add all registration records in the same commit', () => {
    const result = validateWorkRegistration({
      changedFiles: [
        'scripts/validate-work-registration.mjs',
        'docs/IMPLEMENTATION_PLAN.md',
        'docs/IMPLEMENTATION_PROGRESS.md',
      ],
      message: 'tooling: add registration gate\n\nImplementation-Prompt: 664',
      ...currentSources,
      parentPlanSource,
      parentProgressSource,
      parentDependencySource,
    });

    expect(result.newPrompt).toBe(true);
    expect(result.errors.join('\n')).toContain(
      'new Prompt 664 must add docs/IMPLEMENTATION_PROMPT_DEPENDENCIES.md in the same commit',
    );
  });

  it('accepts a newly registered task only with an explicit dependency assessment and evidence', () => {
    const changedFiles = [
      'scripts/validate-work-registration.mjs',
      'docs/IMPLEMENTATION_PLAN.md',
      'docs/IMPLEMENTATION_PROGRESS.md',
      'docs/IMPLEMENTATION_PROMPT_DEPENDENCIES.md',
    ];
    const valid = validateWorkRegistration({
      changedFiles,
      message: 'tooling: add registration gate\n\nImplementation-Prompt: 664',
      ...currentSources,
      parentPlanSource,
      parentProgressSource,
      parentDependencySource,
    });
    const missingAssessment = validateWorkRegistration({
      changedFiles,
      message: 'tooling: add registration gate\n\nImplementation-Prompt: 664',
      ...currentSources,
      planSource: planSource.replace(' Dependencies: Prompts 660 and 661.', ''),
      parentPlanSource,
      parentProgressSource,
      parentDependencySource,
    });
    const missingEvidence = validateWorkRegistration({
      changedFiles,
      message: 'tooling: add registration gate\n\nImplementation-Prompt: 664',
      ...currentSources,
      dependencySource: dependencySource.replace(' | E-664 | none | Require roadmap', ' | none | none | Require roadmap'),
      parentPlanSource,
      parentProgressSource,
      parentDependencySource,
    });
    const foreignEvidence = validateWorkRegistration({
      changedFiles,
      message: 'tooling: add registration gate\n\nImplementation-Prompt: 664',
      ...currentSources,
      dependencySource: dependencySource.replace(
        'IMPLEMENTATION_PLAN.md - Prompt 664 definition',
        'IMPLEMENTATION_PLAN.md - Prompt 660 definition',
      ),
      parentPlanSource,
      parentProgressSource,
      parentDependencySource,
    });
    const duplicateEvidence = validateWorkRegistration({
      changedFiles,
      message: 'tooling: add registration gate\n\nImplementation-Prompt: 664',
      ...currentSources,
      dependencySource: `${dependencySource}\n| E-664 | hard_prompt | 664 -> 660 | IMPLEMENTATION_PLAN.md - Prompt 664 definition | Dependencies: Prompt 660. |`,
      parentPlanSource,
      parentProgressSource,
      parentDependencySource,
    });

    expect(valid).toMatchObject({ prompt: '664', newPrompt: true, errors: [] });
    expect(missingAssessment.errors.join('\n')).toContain('explicit Dependencies: assessment');
    expect(missingEvidence.errors.join('\n')).toContain('source-backed dependency evidence');
    expect(foreignEvidence.errors.join('\n')).toContain('source-backed dependency evidence');
    expect(duplicateEvidence.errors.join('\n')).toContain('dependency evidence repeats E-664');
  });

  it('rejects a trailer that does not match the coordination prompt', () => {
    const result = validateWorkRegistration({
      changedFiles: ['scripts/example.mjs'],
      message: 'tooling: mismatched task\n\nImplementation-Prompt: 664',
      coordinationPrompt: '661',
      ...currentSources,
    });

    expect(result.errors.join('\n')).toContain('does not match coordination Prompt 661');
  });
});
