import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  validateAgentModelEscalation,
  validateBlockedMergeAgentHandoff,
  validateCampaignPlaybook,
  validatePromptDependencyCompletion,
  validatePromptDependencyConcurrency,
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

  it('uses one release-fragment path for product metadata instead of concurrent shared-file edits', () => {
    const guidance = readFileSync(resolve(process.cwd(), 'CLAUDE.md'), 'utf8').replace(/\s+/g, ' ');

    expect(guidance).toContain('validated per-task release fragment');
    expect(guidance).toContain('Do not edit `package.json`, the root lockfile, or `src/changelog.ts` during feature implementation');
    expect(guidance).not.toContain('reserve one unused release version for this task');
    expect(guidance).not.toContain('update `package.json` and the root lockfile to it');
  });

  it('keeps Definition of done on the release-fragment path', () => {
    const guidance = readFileSync(resolve(process.cwd(), 'CLAUDE.md'), 'utf8');
    const definitionOfDone = (guidance.match(/## Definition of done([\s\S]*?)(?=\n## |$)/)?.[1] ?? '')
      .replace(/\s+/g, ' ');

    expect(definitionOfDone).toMatch(/Product work began with one validated per-task release fragment[\s\S]{0,180}before the first implementation test/i);
    expect(definitionOfDone).toMatch(/`release-land`[\s\S]{0,180}next permitted version[\s\S]{0,180}package metadata, root lockfile, and player-facing changelog/i);
    expect(definitionOfDone).toMatch(/no-player-facing-change[\s\S]{0,180}does not add a release fragment/i);
    expect(definitionOfDone).not.toMatch(/preemptive, standalone changelog entry/i);
  });

  it('keeps Luna xhigh and campaign role precedence unambiguous', () => {
    const guidance = readFileSync(resolve(process.cwd(), 'CLAUDE.md'), 'utf8').replace(/\s+/g, ' ');

    expect(guidance).toContain('Luna is the default at `xhigh`');
    expect(guidance).toMatch(/Use GPT-5\.6 Luna \(`gpt-5\.6-luna`\) at `xhigh` reasoning/i);
    expect(guidance).not.toMatch(/Use GPT-5\.6 Luna \(`gpt-5\.6-luna`\) at `high` reasoning/i);
    expect(guidance).toMatch(/numbered-plan Luna `max`[\s\S]{0,360}gpt-5\.6-terra` at `xhigh`/i);
    expect(guidance).toMatch(/overrides all routine primary-agent ownership\s+clauses below/i);
    expect(guidance).toMatch(/separately\s+assigned implementation, exact-HEAD review, and release agents[\s\S]{0,240}reconciliation, versioning, merge, push, and `coordination:finish`/i);
    expect(guidance).toMatch(/For routine \(non-campaign\) tasks,[\s\S]{0,420}The primary agent also owns all review, integration, versioning, merge, and push/i);
  });

  it('requires role-scoped Luna to Terra to Sol escalation on every agent-model authority', () => {
    const surfaces = [
      'CLAUDE.md',
      'docs/AGENT_CAMPAIGN_PLAYBOOK.md',
      'docs/IMPLEMENTATION_PLAN.md',
    ];
    const sources = new Map(surfaces.map((surface) => [
      surface,
      readFileSync(resolve(process.cwd(), surface), 'utf8'),
    ]));
    const errors: string[] = [];

    validateAgentModelEscalation({ sources, errors });

    expect(errors, errors.join('\n')).toEqual([]);
  });

  it('rejects role-tier resets, Luna/Terra loops, and Sol dispatch without its cost explanation', () => {
    const compliant = [
      'If a Luna attempt fails, reassign that same agent role to gpt-5.6-terra.',
      'If a Terra attempt then fails, gpt-5.6-sol is authorized for that same agent role only.',
      'The escalation tier belongs to the role and must never reset or downgrade when an agent, task, or worktree is replaced; detect and stop any Luna/Terra loop.',
      'Before dispatching Sol, explain in user-visible chat why that role needs Sol and that Sol is 10 times as expensive as Luna.',
    ].join(' ');
    const mutations = [
      {
        source: compliant.replace('must never reset or downgrade', 'may reset or downgrade'),
        expected: 'must keep the role escalation tier monotonic across replacements',
      },
      {
        source: compliant.replace('detect and stop any Luna/Terra loop', 'allow another Luna retry'),
        expected: 'must detect and stop Luna/Terra loops',
      },
      {
        source: compliant.replace('10 times as expensive as Luna', 'more expensive than Luna'),
        expected: 'must explain every Sol dispatch in user-visible chat before dispatch',
      },
      {
        source: `${compliant} Never dispatch a Sol child.`,
        expected: 'retains the obsolete blanket prohibition on Sol child dispatch',
      },
      {
        source: `${compliant} Delegate it under Luna-only rules.`,
        expected: 'retains a Luna-only retry path that can reset role escalation',
      },
    ];

    for (const mutation of mutations) {
      const errors: string[] = [];
      validateAgentModelEscalation({
        sources: new Map([
          ['CLAUDE.md', mutation.source],
          ['docs/AGENT_CAMPAIGN_PLAYBOOK.md', mutation.source],
          ['docs/IMPLEMENTATION_PLAN.md', mutation.source],
        ]),
        errors,
      });

      expect(errors, mutation.expected).toEqual(expect.arrayContaining([
        expect.stringContaining(mutation.expected),
      ]));
    }
  });

  it('requires an exact pushed-branch handoff on every blocked-merge authority', () => {
    const surfaces = [
      'CLAUDE.md',
      'docs/AGENT_CAMPAIGN_PLAYBOOK.md',
      'docs/WORKTREE_COORDINATION.md',
      'docs/IMPLEMENTATION_PLAN.md',
    ];
    const sources = new Map(surfaces.map((surface) => [
      surface,
      readFileSync(resolve(process.cwd(), surface), 'utf8'),
    ]));
    const errors: string[] = [];

    validateBlockedMergeAgentHandoff({ sources, errors });

    expect(errors, errors.join('\n')).toEqual([]);
  });

  it('rejects a blocked-merge handoff without ordering, merge instructions, or delivery proof', () => {
    const compliant = [
      'A blocking agent is the identifiable Codex task that owns an active overlapping coordination claim or required same-file work.',
      'CI visibility, an external dependency, pending user input, and an ordinary test failure are not agent blockers.',
      'When that blocking agent prevents merge, commit and push the exact task branch before sending the handoff.',
      'Send a direct user-visible message to the blocking agent with the destination task ID, remote branch, exact commit SHA, blocker reason, and overlapping files or claims.',
      'Blocked-agent preservation must pass --preservation-kind blocked-agent, --blocked-by-entry, --handoff-to-task, --handoff-reason, --handoff-overlap, --handoff-delta, and --handoff-delivery to coordination:finish.',
      'The registry creates a structured pending merge handoff on the active blocker entry only after verifying the exact pushed --preserve-ref SHA, same-repository ownership, and the named overlap.',
      'coordination:status exposes every pending record under the MERGE OTHER BRANCHES hard gate.',
      'Instruct the blocking agent: after its original blocker work is finished, keep that exact blocker entry active, fetch the branch, reconcile it with current main, merge the exact source commit into that same entry task branch, apply any named delta, rerun required validation on the exact reconciled SHA, merge to main, push origin/main, and run coordination:finish for that same blocker entry.',
      'coordination:finish refuses landed, preserved, and discarded outcomes for the blocker until its validated task branch contains every assigned source commit and pushed origin/main contains that branch.',
      '--result prose and --handoff-delivery text cannot waive the MERGE OTHER BRANCHES hard gate.',
      'Verify direct-message delivery and request an acknowledgement when supported before closing the source entry as preserved; a coordination note is not proof of delivery.',
      'If direct delivery cannot be verified, keep the source entry active and report the undelivered handoff.',
    ].join(' ');
    const mutations = [
      {
        source: compliant.replace('before sending the handoff', 'after closing the task'),
        expected: 'must push the exact task branch before sending the handoff',
      },
      {
        source: compliant.replace('CI visibility, an external dependency, pending user input, and an ordinary test failure are not agent blockers.', 'Any blocker qualifies.'),
        expected: 'must distinguish agent blockers from CI, external, user-input, and test blockers',
      },
      {
        source: compliant.replace('Send a direct user-visible message', 'Leave a note'),
        expected: 'must send direct user-visible instructions to the blocking agent',
      },
      {
        source: compliant.replace('destination task ID, remote branch, exact commit SHA, blocker reason, and overlapping files or claims', 'branch name'),
        expected: 'must include the task ID, exact branch, SHA, blocker reason, and overlap',
      },
      {
        source: compliant.replace('rerun required validation on the exact reconciled SHA, merge to main, push origin/main, and run coordination:finish', 'merge when convenient'),
        expected: 'must instruct the blocker to reconcile, validate, merge, push, and finish',
      },
      {
        source: compliant.replace('keep that exact blocker entry active', 'close the blocker entry first'),
        expected: 'must bind the merge obligation to the existing blocker entry',
      },
      {
        source: compliant.replace('Blocked-agent preservation must pass --preservation-kind blocked-agent, --blocked-by-entry, --handoff-to-task, --handoff-reason, --handoff-overlap, --handoff-delta, and --handoff-delivery to coordination:finish.', 'Record the handoff in the result summary.'),
        expected: 'must create the structured blocked-agent handoff at preservation',
      },
      {
        source: compliant.replace('coordination:status exposes every pending record under the MERGE OTHER BRANCHES hard gate.', 'coordination:status hides the queue.'),
        expected: 'must expose the MERGE OTHER BRANCHES hard gate in status',
      },
      {
        source: compliant.replace('refuses landed, preserved, and discarded outcomes', 'allows any closeout outcome'),
        expected: 'must block every closeout outcome while assigned branches remain',
      },
      {
        source: compliant.replace('validated task branch contains every assigned source commit and pushed origin/main contains that branch', 'agent says the work was considered'),
        expected: 'must require exact source containment in the validated branch and pushed main',
      },
      {
        source: compliant.replace('--result prose and --handoff-delivery text cannot waive', '--result prose may waive'),
        expected: 'must not allow prose to waive the hard gate',
      },
      {
        source: compliant.replace('Verify direct-message delivery and request an acknowledgement when supported before closing the source entry as preserved', 'Assume delivery'),
        expected: 'must verify delivery before preserving and closing',
      },
      {
        source: compliant.replace('If direct delivery cannot be verified, keep the source entry active and report the undelivered handoff.', 'Close the source entry even if delivery fails.'),
        expected: 'must keep the source entry active when delivery is unverified',
      },
    ];

    for (const mutation of mutations) {
      const errors: string[] = [];
      validateBlockedMergeAgentHandoff({
        sources: new Map([
          ['CLAUDE.md', mutation.source],
          ['docs/AGENT_CAMPAIGN_PLAYBOOK.md', mutation.source],
          ['docs/WORKTREE_COORDINATION.md', mutation.source],
          ['docs/IMPLEMENTATION_PLAN.md', mutation.source],
        ]),
        errors,
      });

      expect(errors, mutation.expected).toEqual(expect.arrayContaining([
        expect.stringContaining(mutation.expected),
      ]));
    }
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
      'docs/AGENT_CAMPAIGN_PLAYBOOK.md',
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

  it('requires an advisory NEXT lane while preserving safe concurrent dependency-ready claims', () => {
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
      'docs/AGENT_CAMPAIGN_PLAYBOOK.md',
    ];
    const sources = new Map(surfaces.map((surface) => [
      surface,
      readFileSync(resolve(repositoryRoot, surface), 'utf8'),
    ]));
    const errors: string[] = [];

    validatePromptDependencyConcurrency({ sources, errors });

    expect(errors, errors.join('\n')).toEqual([]);
  });

  it('rejects serial-only or unsafe concurrent prompt-claim guidance', () => {
    const errors: string[] = [];
    const sources = new Map([
      [
        'docs/IMPLEMENTATION_PROMPT_DEPENDENCIES.md',
        'NEXT is the first READY_QUEUE item. Claim the first unclaimed item only.',
      ],
      ['CLAUDE.md', 'Prompt work may proceed concurrently.'],
      ['docs/IMPLEMENTATION_PLAN.md', 'The lowest unresolved ID is a pointer.'],
      ['docs/IMPLEMENTATION_PROGRESS.md', 'Dependency-ready prompts may proceed concurrently.'],
      ['docs/IMPLEMENTATION_MILESTONES.md', 'Use the dependency route.'],
      ['docs/WORKTREE_COORDINATION.md', 'Coordinate ownership before editing.'],
      ['README.md', 'Read the dependency index.'],
      ['AGENTS.md', 'Read CLAUDE.md.'],
    ]);

    validatePromptDependencyConcurrency({ sources, errors });

    expect(errors).toEqual(expect.arrayContaining([
      expect.stringContaining('docs/IMPLEMENTATION_PROMPT_DEPENDENCIES.md'),
      expect.stringContaining('CLAUDE.md'),
      expect.stringContaining('docs/IMPLEMENTATION_PLAN.md'),
      expect.stringContaining('docs/IMPLEMENTATION_PROGRESS.md'),
      expect.stringContaining('docs/IMPLEMENTATION_MILESTONES.md'),
      expect.stringContaining('docs/WORKTREE_COORDINATION.md'),
      expect.stringContaining('README.md'),
      expect.stringContaining('AGENTS.md'),
    ]));
  });

  it('requires the campaign playbook to retain the learned orchestration controls', () => {
    const source = readFileSync(resolve(process.cwd(), 'docs/AGENT_CAMPAIGN_PLAYBOOK.md'), 'utf8');
    const errors: string[] = [];

    validateCampaignPlaybook({ source, errors });

    expect(errors, errors.join('\n')).toEqual([]);
  });

  it('fails closed if role escalation or another critical campaign control is weakened', () => {
    const source = readFileSync(resolve(process.cwd(), 'docs/AGENT_CAMPAIGN_PLAYBOOK.md'), 'utf8');
    const mutations = [
      {
        source: source.replace(/open no new lanes/gi, 'open a new lane'),
        expected: 'must prohibit new lanes at a stopping point',
      },
      {
        source: source.replace(/fully read/gi, 'consult'),
        expected: 'must require the dependency authority before prompt selection',
      },
      {
        source: source
          .replace(/selectively reapply/gi, 'reuse')
          .replace(/never wholesale-merge/gi, 'may merge'),
        expected: 'must require selective reapplication and prohibit wholesale stale merges',
      },
      {
        source: source
          .replace(/independent exact-HEAD review/gi, 'review')
          .replace(/one final full coordination validation/gi, 'validation'),
        expected: 'must require independent exact-HEAD review before one final full coordination validation',
      },
      {
        source: source.replace(/Luna attempt fails/gi, 'Luna attempt succeeds'),
        expected: 'must require Terra xhigh after a Luna role failure',
      },
      {
        source: source.replace(/`?gpt-5\.6-sol`? is authorized\s+for that same agent role only/gi, 'retry Terra'),
        expected: 'must authorize Sol after Terra fails in the same role',
      },
      {
        source: source.replace(/must never reset or downgrade/gi, 'may reset or downgrade'),
        expected: 'must keep role escalation monotonic and stop Luna/Terra loops',
      },
      {
        source: source.replace(/10\s+times as expensive as\s+Luna/gi, 'more expensive than Luna'),
        expected: 'must require a user-visible 10x-cost explanation before Sol dispatch',
      },
      {
        source: source.replace(/immediately\s+report/gi, 'report later'),
        expected: 'must require immediate idle or terminal reports with status, paths, commands, and blockers',
      },
      {
        source: source.replace(/exact exclusive leaf-file claims/gi, 'broad docs ownership'),
        expected: 'must require exact leaf-file ownership and reject broad docs claims',
      },
      {
        source: source.replace(/do not reuse a\s+reported SHA,\s+version,\s+count,\s+or NEXT prompt without live verification/gi, 'reuse the old status'),
        expected: 'goal template must require dynamic live state rather than hard-coded snapshots',
      },
      {
        source: source.replace(/implementation\s+agent owns edits, focused tests, and commit/gi, 'implementation agent may edit'),
        expected: 'must assign explicit implementation, review, and release ownership',
      },
    ];

    for (const mutation of mutations) {
      const errors: string[] = [];
      validateCampaignPlaybook({ source: mutation.source, errors });
      expect(errors, mutation.expected).toEqual(expect.arrayContaining([
        expect.stringContaining(mutation.expected),
      ]));
    }
  });
});
