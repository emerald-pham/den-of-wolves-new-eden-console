import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  validatePromptDependencyCompletion,
  validatePromptDependencyGuidance,
} from '../scripts/validate-repository-guidance.mjs';

describe('repository guidance', () => {
  it('requires agents to install locked dependencies in fresh worktrees', () => {
    const guidancePath = resolve(process.cwd(), 'CLAUDE.md');
    const guidance = readFileSync(guidancePath, 'utf8');

    expect(guidance).toContain('Worktree dependency bootstrap');
    expect(guidance).toContain('npm ci');
    expect(guidance).toContain('npm ci --prefix functions');
    expect(guidance).toContain('package-lock.json');
    expect(guidance).toContain('functions/package-lock.json');
  });

  it('requires agents to leave detached HEAD before editing', () => {
    const guidancePath = resolve(process.cwd(), 'CLAUDE.md');
    const guidance = readFileSync(guidancePath, 'utf8');

    expect(guidance).toContain('Worktree branch bootstrap');
    expect(guidance).toContain('git branch --show-current');
    expect(guidance).toContain('Before editing');
    expect(guidance).toContain('branch must be attached');
  });

  it('requires collision-free emulator ports in concurrent worktrees', () => {
    const guidancePath = resolve(process.cwd(), 'CLAUDE.md');
    const guidance = readFileSync(guidancePath, 'utf8');

    expect(guidance).toContain('Concurrent worktrees and emulator ports');
    expect(guidance).toContain('firebase emulators:start');
    expect(guidance).toContain('firebase emulators:exec');
    expect(guidance).toContain('lsof');
    expect(guidance).toContain('npm run emulators:configure -- auto');
    expect(guidance).toContain('| 14 |');
    expect(guidance).toMatch(
      /auth,\s+Functions, Firestore, Firestore WebSocket, Hosting, Emulator UI, Hub, and Logging/,
    );
  });

  it('requires every product release to update the player-facing changelog', () => {
    const guidancePath = resolve(process.cwd(), 'CLAUDE.md');
    const guidance = readFileSync(guidancePath, 'utf8');

    expect(guidance).toContain('Player-facing changelog');
    expect(guidance).toContain('every completed product edit');
    expect(guidance).toContain('user perspective');
    expect(guidance).toContain('developer perspective');
  });

  it('requires a shared preemptive work entry before agents edit a worktree', () => {
    const guidancePath = resolve(process.cwd(), 'CLAUDE.md');
    const guidance = readFileSync(guidancePath, 'utf8');

    expect(guidance).toContain('preemptive changelog');
    expect(guidance).toContain('coordination:begin');
    expect(guidance).toContain('version agreement');
    expect(guidance).toContain('coordination:status');
  });

  it('requires delegates to assert their own worktree and branch before setup or edits', () => {
    const guidancePath = resolve(process.cwd(), 'CLAUDE.md');
    const guidance = readFileSync(guidancePath, 'utf8').replace(/\s+/g, ' ');

    expect(guidance).toContain('absolute own-worktree path');
    expect(guidance).toContain('pwd -P');
    expect(guidance).toContain('git rev-parse --show-toplevel');
    expect(guidance).toContain('before installing dependencies, registering coordination, or editing');
    expect(guidance).toContain('never edit the parent checkout');
    expect(guidance).toContain('run npm ci from the assigned worktree before repository scripts');
  });

  it('requires implementation-plan features to carry real changelog coverage', () => {
    const guidancePath = resolve(process.cwd(), 'CLAUDE.md');
    const guidance = readFileSync(guidancePath, 'utf8');

    expect(guidance).toContain('--implementation-prompt NNN');
    expect(guidance).toContain('implementationPrompts');
    expect(guidance).toContain('concrete player-facing change');
    expect(guidance).toMatch(/preemptive changelog\s+field is only a draft/i);
  });

  it('requires the executable coordination validation and completion gate', () => {
    const guidancePath = resolve(process.cwd(), 'CLAUDE.md');
    const guidance = readFileSync(guidancePath, 'utf8');

    expect(guidance).toContain('coordination:validate');
    expect(guidance).toContain('coordination:docs');
    expect(guidance).toContain('documentation-review');
    expect(guidance).toContain('visual-review');
    expect(guidance).toContain('final branch SHA');
    expect(guidance).toContain('origin/main');
    expect(guidance).toContain('machine-checked');
  });

  it('keeps AGENTS.md as a pointer to the canonical executable gate', () => {
    const agentsPath = resolve(process.cwd(), 'AGENTS.md');
    const agents = readFileSync(agentsPath, 'utf8');

    expect(agents).toContain('CLAUDE.md');
    expect(agents).toContain('coordination:validate');
    expect(agents).toContain('coordination:finish');
    expect(agents).toContain('machine-checked');
  });

  it('makes startup recovery authoritative when end cleanup was skipped', () => {
    const guidancePath = resolve(process.cwd(), 'CLAUDE.md');
    const guidance = readFileSync(guidancePath, 'utf8');

    expect(guidance).toContain('Start cleanup is authoritative');
    expect(guidance).toMatch(/no\s+live reservation does not mean a configured row is free/);
    expect(guidance).toContain('End cleanup remains required');
    expect(guidance).toMatch(/worktree is\s+missing/);
  });

  it('requires every task to track immediate post-test merge as an objective', () => {
    const guidancePath = resolve(process.cwd(), 'CLAUDE.md');
    const guidance = readFileSync(guidancePath, 'utf8');

    expect(guidance).toContain('Every `Session goals` checklist must include this release objective');
    expect(guidance.replace(/\s+/g, ' ')).toContain(
      'As soon as required validation is green: commit, reconcile with current main, merge to main, push to origin, and close coordination.',
    );
    expect(guidance).toContain('Immediate post-test merge objective is checked off');
  });

  it('requires every agent-facing workflow surface to route through prompt dependencies', () => {
    const repositoryRoot = process.cwd();
    const dependencyDoc = 'IMPLEMENTATION_PROMPT_DEPENDENCIES.md';
    const surfaces = [
      'AGENTS.md',
      'CLAUDE.md',
      'README.md',
      'docs/WORKTREE_COORDINATION.md',
      'docs/IMPLEMENTATION_PLAN.md',
      `docs/${dependencyDoc}`,
      'docs/IMPLEMENTATION_MILESTONES.md',
      'docs/IMPLEMENTATION_PROGRESS.md',
    ];

    for (const surface of surfaces) {
      const source = readFileSync(resolve(repositoryRoot, surface), 'utf8');
      expect(source, surface).toContain(dependencyDoc);
      const normalized = source.replace(/[`*]/g, '').replace(/\s+/g, ' ').toLowerCase();
      expect(normalized, surface).toMatch(
        /(?:read[\s\S]{0,180}implementation_prompt_dependencies\.md[\s\S]{0,180}(?:first|before selecting|before assigning|before starting|before editing)|before (?:selecting|assigning|starting|editing)[\s\S]{0,180}read[\s\S]{0,180}implementation_prompt_dependencies\.md)/i,
      );
      expect(normalized, surface).toMatch(/\b(?:run|use|refresh)(?:\s+\w+){0,6}\s+dispatcher\b/i);
      expect(normalized, surface).toMatch(/reconcil\w*[\s\S]{0,300}(?:current main[\s\S]{0,300}coordination|coordination[\s\S]{0,300}current main)/i);
      expect(normalized, surface).toMatch(/\bre-?read\b/i);
      expect(normalized, surface).toMatch(/\b(?:rebase|material (?:main )?movement)\b/i);
      expect(normalized, surface).toContain('current main');
      expect(normalized, surface).toMatch(/cannot be marked complete/i);
      expect(normalized, surface).toMatch(/\b(?:cannot merge|merged)\b/i);
      expect(normalized, surface).toMatch(/hard prerequisites?[\s\S]{0,120}unmet/i);
    }
  });

  it('rejects a dependency surface that only links the index without the mandatory operational gate', () => {
    const repositoryRoot = process.cwd();
    const surfaces = [
      'AGENTS.md',
      'CLAUDE.md',
      'README.md',
      'docs/WORKTREE_COORDINATION.md',
      'docs/IMPLEMENTATION_PLAN.md',
      'docs/IMPLEMENTATION_PROMPT_DEPENDENCIES.md',
      'docs/IMPLEMENTATION_MILESTONES.md',
      'docs/IMPLEMENTATION_PROGRESS.md',
    ];
    const sources = new Map(surfaces.map((surface) => [
      surface,
      readFileSync(resolve(repositoryRoot, surface), 'utf8'),
    ]));
    for (const weakSurface of [
      'docs/IMPLEMENTATION_MILESTONES.md',
      'docs/IMPLEMENTATION_PROGRESS.md',
    ]) {
      const weakSources = new Map(sources);
      weakSources.set(
        weakSurface,
        'See IMPLEMENTATION_PROMPT_DEPENDENCIES.md before selecting a prompt.',
      );
      const errors: string[] = [];

      validatePromptDependencyGuidance({ sources: weakSources, errors });

      expect(errors).toEqual(expect.arrayContaining([
        `${weakSurface}: must explicitly require reading prompt dependencies before prompt work`,
        `${weakSurface}: must require running the prompt dependency dispatcher`,
        `${weakSurface}: must require reconciling current main and coordination`,
        `${weakSurface}: must require re-reading after rebase or material current-main movement`,
        `${weakSurface}: must block completion/merge while hard prerequisites are unmet`,
      ]));
    }
  });

  it('rejects a completed prompt whose hard prerequisite is unresolved', () => {
    const dependencySource = [
      '| prompt_id | plan_tag | progress | hard_prompt_prerequisites | hard_milestone | hard_contract | decision_owner | closure_evidence_gates | sequence_rules | release_boundaries | related_consumes | evidence_ids | milestone_hints | title |',
      '| 001 | NEW | missing | none | none | none | none | none | none | none | none | none | M1 | Prerequisite |',
      '| 002 | NEW | done | 001 | none | none | none | none | none | none | none | E-001 | M1 | Dependent |',
    ].join('\n');
    const progressSource = [
      '| 001 | missing | non-feature | — |',
      '| 002 | done | non-feature | — |',
    ].join('\n');

    expect(validatePromptDependencyCompletion({ dependencySource, progressSource })).toEqual([
      'Prompt 002 is marked done but hard prerequisite 001 is missing.',
    ]);
  });
});
