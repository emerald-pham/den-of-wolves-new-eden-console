import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  validateAgentModelEscalation,
  validateBlockedMergeAgentHandoff,
  validateCampaignPlaybook,
  validatePromptDependencyGuidance,
  validateRiskBasedGuidance,
  validateSessionGoalGuidance,
} from '../scripts/validate-repository-guidance.mjs';

const root = process.cwd();
const guidanceSurfaces = [
  'AGENTS.md',
  'CLAUDE.md',
  'README.md',
  'docs/README.md',
  'docs/WORKTREE_COORDINATION.md',
  'docs/AGENT_CAMPAIGN_PLAYBOOK.md',
] as const;

function readGuidance(surface: string) {
  return readFileSync(resolve(root, surface), 'utf8');
}

function readSources() {
  const sources = new Map<string, string>();
  for (const surface of guidanceSurfaces) sources.set(surface, readGuidance(surface));
  sources.set('docs/AGENT_EXECUTION_POLICY.md', readGuidance('docs/AGENT_EXECUTION_POLICY.md'));
  return sources;
}

describe('repository guidance', () => {
  it('keeps CLAUDE concise and preserves the high-value game contracts', () => {
    const guidance = readGuidance('CLAUDE.md');
    const normalized = guidance.replace(/\s+/g, ' ');
    expect(guidance.split(/\r?\n/).length).toBeLessThanOrEqual(260);
    for (const required of [
      'server authority',
      'focused, meaningful tests',
      'coordination:status',
      'docs/implementation-prompts.json',
      'npm run emulators:configure -- auto',
      'npm run coordination:docs',
      'current `main`',
      'player-facing changelog',
      'App Check is complementary to authorization',
      'readable fonts',
      'visible, keyboard-accessible',
      'CONSOLE_ARCHITECTURE.md',
      '/Users/emeraldpham/.codex/private-reference/den-of-wolves-new-eden-console/docs/reference/README.md',
      '/Users/emeraldpham/.codex/private-reference/den-of-wolves-new-eden-console/docs/reference/den-of-wolves-new-eden/',
      'These paths are recorded as locators',
      'routed source leaves a gap',
    ]) {
      expect(normalized, `CLAUDE.md must retain ${required}`).toContain(required);
    }
  });

  it('keeps locked dependency setup, worktree identity, and emulator safety concrete', () => {
    const guidance = readGuidance('CLAUDE.md');
    const normalized = guidance.replace(/\s+/g, ' ');
    expect(guidance).toContain('npm ci');
    expect(guidance).toContain('npm ci --prefix functions');
    expect(guidance).toContain('git rev-parse --show-toplevel');
    expect(guidance).toContain('git rev-parse --git-common-dir');
    expect(normalized).toContain('never mix its ports with another row');
    expect(guidance).toContain('docs/WORKTREE_COORDINATION.md#emulator-rows');
    const coordination = readGuidance('docs/WORKTREE_COORDINATION.md');
    expect(coordination).toContain('| 14 |');
    expect(coordination.replace(/\s+/g, ' ')).toContain('does not prove that another task is safe to stop');
  });

  it('routes model and effort choice through one policy section per agent tool', () => {
    const claude = readGuidance('CLAUDE.md');
    expect(claude).not.toMatch(/gpt-\d|\b(?:Astra|Luna|Terra|Sol|Opus|Sonnet|Haiku|Fable)\b/);
    expect(claude.match(/docs\/AGENT_EXECUTION_POLICY\.md#model-and-effort-routing/g)).toHaveLength(1);

    const policy = readGuidance('docs/AGENT_EXECUTION_POLICY.md');
    const routing = policy.split(/^## Model and effort routing$/m)[1]?.split(/^## /m)[0] ?? '';
    const codex = routing.split(/^### Codex and GPT runtimes$/m)[1]?.split(/^### /m)[0] ?? '';
    const claudeCode = routing.split(/^### Claude Code$/m)[1]?.split(/^### /m)[0] ?? '';
    expect(codex).toContain('New top-level coordinators default to `gpt-6-astra` with medium reasoning.');
    expect(codex).toMatch(/Delegated workers default to `gpt-6-luna`/);
    expect(codex).toMatch(/`gpt-6\.1-sol` for the independent risk review/);
    expect(codex).not.toMatch(/\b(?:Opus|Sonnet|Haiku)\b/);
    expect(claudeCode).not.toMatch(/gpt-\d/);
    expect(claudeCode).toContain('Set `model` and `effort` explicitly on every Agent call');
    expect(claudeCode).toContain('Fable is never authorized');
    for (const row of [
      /^\| Coordinator[^|\n]*\| Opus \| medium \|$/m,
      /^\| [^|\n]*implementation[^|\n]*\| Opus \| high \|$/m,
      /^\| Independent risk review[^|\n]*\| Opus \| max \|$/m,
      /^\| Routine[^|\n]*review[^|\n]*\| Opus \| xhigh \|$/m,
      /^\| Read-only[^|\n]*\| Haiku \| [a-z]+ \|$/m,
    ]) expect(claudeCode).toMatch(row);
  });

  it.each([
    'Delegated workers default to `gpt-6-luna`.',
    'Use Opus at max for independent review.',
  ])('rejects agent-tool model names in CLAUDE.md: %s', (addition) => {
    const sources = readSources();
    sources.set('CLAUDE.md', `${readGuidance('CLAUDE.md')}\n${addition}`);
    const errors: string[] = [];
    validateAgentModelEscalation({ sources, errors });
    expect(errors).toContain('CLAUDE.md: must name no agent-tool models; point to the model and effort routing section');
  });

  it('keeps every rule moved out of CLAUDE in a destination CLAUDE points to', () => {
    const claude = readGuidance('CLAUDE.md');
    const normalize = (surface: string) => readGuidance(surface).replace(/\s+/g, ' ');
    for (const [pointer, surface, rule] of [
      ['docs/AGENT_EXECUTION_POLICY.md#release-versioning', 'docs/AGENT_EXECUTION_POLICY.md', 'Patch versions stop at `99`'],
      ['docs/AGENT_EXECUTION_POLICY.md#independent-typography-review-for-final-releases', 'docs/AGENT_EXECUTION_POLICY.md', 'Automated typography checks do not substitute for this review.'],
      ['docs/TICKER_BEHAVIOR.md#browser-smoke-gate', 'docs/TICKER_BEHAVIOR.md', 'prove the live Press-to-Red-Alert handoff'],
      ['docs/agents/issue-tracker.md', 'docs/agents/issue-tracker.md', 'Include each newly queued item in the generated dependency chart'],
      ['docs/WORKTREE_COORDINATION.md#optional-coordination', 'docs/WORKTREE_COORDINATION.md', 'Do not run a status/heartbeat polling loop.'],
      ['docs/LOCAL_STORAGE.md#automatic-branch-closeout', 'docs/LOCAL_STORAGE.md', 'without asking the owner again'],
    ] as const) {
      expect(claude, `CLAUDE.md must point to ${pointer}`).toContain(pointer);
      expect(normalize(surface), `${surface} must hold the moved rule`).toContain(rule);
    }
  });

  it('describes the JSON catalog as the roadmap authority and views as generated', () => {
    const errors: string[] = [];
    validatePromptDependencyGuidance({ sources: readSources(), errors });
    expect(errors, errors.join('\n')).toEqual([]);
    for (const surface of guidanceSurfaces) {
      const source = readGuidance(surface);
      const normalized = source.replace(/\s+/g, ' ').toLowerCase();
      expect(source, surface).toContain('implementation-prompts.json');
      expect(normalized, surface).toMatch(/generated[\s\S]{0,180}(?:markdown|view|implementation)/i);
      expect(normalized, surface).toMatch(/(?:coordination:dependencies[\s\S]{0,240}(?:read-only|readonly|no local|no nonce|no receipt)|(?:read-only|readonly|no local|no nonce|no receipt)[\s\S]{0,240}coordination:dependencies)/i);
      expect(normalized, surface).toMatch(/next[\s\S]{0,160}(?:advisory|hint|not a serial|not serial)/i);
    }
  });

  it('rejects guidance that reintroduces universal registration, nonce, or retention gates', () => {
    const sources = readSources();
    const mutated = new Map(sources);
    mutated.set(
      'CLAUDE.md',
      `${sources.get('CLAUDE.md')} Every repository change except documentation-only must be dependency-gated. Every non-documentation commit must carry an Implementation-Prompt trailer. The finish gate requires an immutable goal artifact and keeps 48-hour retention.`,
    );
    const errors: string[] = [];
    validateRiskBasedGuidance({ sources: mutated, errors });
    expect(errors).toEqual(expect.arrayContaining([
      expect.stringContaining('universal prompt registration'),
      expect.stringContaining('Implementation-Prompt trailer'),
      expect.stringContaining('immutable goal'),
      expect.stringContaining('48-hour'),
    ]));
  });

  it('accepts current guidance without requiring expired process instructions', () => {
    const sources = readSources();
    sources.set('CLAUDE.md', readGuidance('CLAUDE.md').replace(
      /Process-gate changes are frozen through 2026-09-18\.[\s\S]*?new telemetry system\./,
      '',
    ));
    const errors: string[] = [];
    validateRiskBasedGuidance({ sources, errors });
    expect(errors, errors.join('\\n')).toEqual([]);
  });

  it('requires the risk-based model policy without a compulsory handoff cycle', () => {
    const sources = readSources();
    const errors: string[] = [];
    validateAgentModelEscalation({ sources, errors });
    expect(errors, errors.join('\n')).toEqual([]);

    const weak = new Map(sources);
    for (const surface of ['AGENTS.md', 'CLAUDE.md', 'docs/AGENT_CAMPAIGN_PLAYBOOK.md'] as const) {
      weak.set(surface, readGuidance(surface).replaceAll('gpt-6.1-sol', 'gpt-5.6-sol'));
    }
    const weakErrors: string[] = [];
    validateAgentModelEscalation({ sources: weak, errors: weakErrors });
    expect(weakErrors).toEqual(expect.arrayContaining([
      expect.stringContaining('must not authorize unapproved subagent models'),
    ]));
  });

  it.each([
    ['GPT-6 Luna may use only `max` effort.', 'GPT-6 Luna may use high or max effort.', 'must require GPT-6 Luna at max only'],
    ['GPT-6.1 Terra may use all\nruntime-supported effort levels.', 'GPT-6.1 Terra may use only high effort.', 'must allow all runtime-supported Terra effort levels'],
    ['GPT-6.1 Sol may use all runtime-supported\neffort levels.', 'GPT-6.1 Sol may use only medium or high effort.', 'must allow all runtime-supported Sol effort levels'],
  ])('rejects a weaker or capped effort policy: %s', (from, to, message) => {
    const sources = readSources();
    const policy = readGuidance('docs/AGENT_EXECUTION_POLICY.md');
    expect(policy).toContain(from);
    sources.set('docs/AGENT_EXECUTION_POLICY.md', policy.replace(from, to));
    const errors: string[] = [];
    validateAgentModelEscalation({ sources, errors });
    expect(errors).toContain(`docs/AGENT_EXECUTION_POLICY.md: ${message}`);
  });

  it.each([
    ['docs/AGENT_EXECUTION_POLICY.md', 'Delegate to gpt-6-luna at high effort.', 'must not allow non-max Luna effort'],
    ['CLAUDE.md', 'Luna effort is discretionary; max is almost always preferred.', 'must not allow non-max Luna effort'],
    ['docs/AGENT_CAMPAIGN_PLAYBOOK.md', 'Terra may use unsupported effort levels.', 'must not authorize unsupported effort levels'],
    ['AGENTS.md', 'Never use max for Sol.', 'must not impose a general Terra or Sol effort ceiling'],
    ['AGENTS.md', 'Never use ultra for Terra.', 'must not impose a general Terra or Sol effort ceiling'],
  ])('rejects contradictory effort guidance in %s', (surface, addition, message) => {
    const sources = readSources();
    sources.set(surface, `${readGuidance(surface)}\n${addition}`);
    const errors: string[] = [];
    validateAgentModelEscalation({ sources, errors });
    expect(errors).toContain(`${surface}: ${message}`);
  });

  it.each([
    ['CLAUDE.md', 'gpt-7-other'],
    ['AGENTS.md', 'gpt-6.1-luna'],
    ['docs/AGENT_EXECUTION_POLICY.md', 'gpt-5.6-terra'],
    ['docs/AGENT_CAMPAIGN_PLAYBOOK.md', 'gpt-6-astra'],
  ])('rejects unapproved model %s %s', (surface, model) => {
    const sources = readSources();
    sources.set(surface, `${readGuidance(surface)}\nDelegate to ${model}.`);
    const errors: string[] = [];
    validateAgentModelEscalation({ sources, errors });
    expect(errors).toContain(`${surface}: must not authorize unapproved subagent models`);
  });

  it('rejects policy without runtime-supported identifier and effort lookup', () => {
    const sources = readSources();
    const policy = readGuidance('docs/AGENT_EXECUTION_POLICY.md');
    const mutated = policy.replace('Use only identifiers and effort levels exposed by the current runtime.', 'Use any requested identifier and effort.');
    expect(mutated).not.toBe(policy);
    sources.set('docs/AGENT_EXECUTION_POLICY.md', mutated);
    const errors: string[] = [];
    validateAgentModelEscalation({ sources, errors });
    expect(errors).toContain('docs/AGENT_EXECUTION_POLICY.md: must require identifiers and effort levels exposed by the current runtime');
  });

  it.each([
    [
      'After a task fails, increase effort when a higher runtime-supported level is\navailable for that permitted model.',
      'After a task fails, keep effort unchanged.',
      'must increase effort after failure when a higher supported level is available',
    ],
    [
      'After repeated or looping failures, halt identical blind reruns and perform\nbounded diagnosis, then select a task-appropriate stronger permitted model\nroute.',
      'After repeated or looping failures, keep retrying the current route.',
      'must require bounded diagnosis and a stronger permitted model route after looping failures',
    ],
    [
      'Record the actual runtime-supported model and effort, failure evidence,\nreason and ownership transfer.',
      'Record a claimed escalation without the actual selection or evidence.',
      'must record the actual supported selection, evidence, reason and ownership transfer',
    ],
    [
      'Do not impose a blanket capability ranking\nbetween Terra and Sol',
      'Impose a blanket capability ranking between Terra and Sol',
      'must reject a blanket Terra/Sol capability ranking',
    ],
    [
      "Determine the selected model's effort ceiling from its runtime-supported and\npermitted levels. GPT-6 Luna's permitted ceiling is `max`. Terra and Sol use\ntheir highest runtime-supported effort, including `ultra` when exposed.",
      'Every model has max as its effort ceiling regardless of runtime support.',
      'must use actual supported/permitted effort ceilings with Luna limited to max',
    ],
    [
      'If neither a higher permitted effort nor a task-appropriate stronger approved\navailable model route remains, halt the loop, preserve evidence and report the\nblocker instead of claiming escalation.',
      'When no stronger permitted route remains, claim escalation and continue.',
      'must halt without a higher permitted effort or stronger approved route and preserve/report the blocker',
    ],
  ])('rejects missing failure-escalation safeguard: %s', (from, to, message) => {
    const sources = readSources();
    const policy = readGuidance('docs/AGENT_EXECUTION_POLICY.md');
    expect(policy).toContain(from);
    sources.set('docs/AGENT_EXECUTION_POLICY.md', policy.replace(from, to));
    const errors: string[] = [];
    validateAgentModelEscalation({ sources, errors });
    expect(errors).toContain(`docs/AGENT_EXECUTION_POLICY.md: ${message}`);
  });

  it.each([
    ['CLAUDE.md', 'Terra is always stronger than Sol.', 'must not impose a blanket Terra/Sol capability ranking'],
    ['docs/AGENT_CAMPAIGN_PLAYBOOK.md', 'Sol is always stronger than Terra.', 'must not impose a blanket Terra/Sol capability ranking'],
    ['AGENTS.md', 'Repeat identical blind reruns after looping failures.', 'must not authorize identical blind failure reruns'],
    ['CLAUDE.md', 'Halt Terra or Sol at max even when ultra is supported.', 'must not cap Terra or Sol at max when higher supported effort is permitted'],
  ])('rejects contradictory escalation guidance in %s', (surface, addition, message) => {
    const sources = readSources();
    sources.set(surface, `${readGuidance(surface)}\n${addition}`);
    const errors: string[] = [];
    validateAgentModelEscalation({ sources, errors });
    expect(errors).toContain(`${surface}: ${message}`);
  });

  it('accepts explicit prohibitions and required security-review effort floors', () => {
    const sources = readSources();
    sources.set('AGENTS.md', `${readGuidance('AGENTS.md')}\nGPT-6 Luna may not use high effort. Terra must not use unsupported effort levels. Do not assume Terra is always stronger than Sol. Do not repeat identical blind reruns after looping failures. Independent Sol security review requires xhigh effort. Never use max for Sol in an exact security review requiring xhigh.`);
    const errors: string[] = [];
    validateAgentModelEscalation({ sources, errors });
    expect(errors, errors.join('\n')).toEqual([]);
  });

  it('requires lightweight ownership, parking, optional goals, and no polling loop', () => {
    const errors: string[] = [];
    validateSessionGoalGuidance({ sources: readSources(), errors });
    expect(errors, errors.join('\n')).toEqual([]);

    const weak = new Map(readSources());
    weak.set('docs/WORKTREE_COORDINATION.md', readGuidance('docs/WORKTREE_COORDINATION.md')
      .replaceAll('optional', 'mandatory')
      .replace(/Do not run a status\/heartbeat[\s\S]{0,40}?polling loop\./, 'Run a status/heartbeat polling loop.')
      .replace(/no\s+immutable goal artifact, digest comparison, one-shot provenance chain, or/, 'requires an immutable goal artifact and digest comparison, one-shot provenance chain, or'));
    const weakErrors: string[] = [];
    validateSessionGoalGuidance({ sources: weak, errors: weakErrors });
    expect(weakErrors).toEqual(expect.arrayContaining([
      expect.stringContaining('optional/lightweight'),
      expect.stringContaining('status/heartbeat polling loops'),
      expect.stringContaining('immutable goal or digest gates'),
    ]));
  });

  it('requires one owner, all risk-review findings, and one final validation after reconciliation', () => {
    const errors: string[] = [];
    validateBlockedMergeAgentHandoff({ sources: readSources(), errors });
    expect(errors, errors.join('\n')).toEqual([]);

    const weak = new Map(readSources());
    weak.set('README.md', readGuidance('README.md').replace(
      /One owner[\s\S]{0,160}?truthful deployment verification\./,
      'Tasks may be handed between agents whenever convenient.',
    ));
    const weakErrors: string[] = [];
    validateBlockedMergeAgentHandoff({ sources: weak, errors: weakErrors });
    expect(weakErrors).toEqual(expect.arrayContaining([
      expect.stringContaining('one owner through implementation, review, merge, and deployment'),
    ]));
  });

  it('keeps the campaign playbook economical and bounded', () => {
    const source = readGuidance('docs/AGENT_CAMPAIGN_PLAYBOOK.md');
    const errors: string[] = [];
    validateCampaignPlaybook({ source, errors });
    expect(errors, errors.join('\n')).toEqual([]);

    const weak = source.replace('no minimum-agent count', 'a minimum-agent count');
    const weakErrors: string[] = [];
    validateCampaignPlaybook({ source: weak, errors: weakErrors });
    expect(weakErrors).toEqual(expect.arrayContaining([
      expect.stringContaining('no minimum-agent count'),
    ]));
  });

  it('carries the tdd skill, agreed seams, and companion files into functional subagent briefs', () => {
    const policy = readGuidance('docs/AGENT_EXECUTION_POLICY.md').replace(/\s+/g, ' ');
    expect(policy).toContain('### Subagent briefs for functional changes');
    expect(policy).toMatch(/Every brief that asks a subagent for a functional change names the `tdd` skill[^.]*and the agreed seams/);
    expect(policy).toMatch(/reads `tests\.md` and `mocking\.md` before its first test/);
    expect(policy).toMatch(/review-fix, follow-up and integration briefs/);

    // A follow-up subagent reads CLAUDE.md, not the policy, so the entry file
    // must reach it even when its brief never names the skill.
    const entry = readGuidance('CLAUDE.md').replace(/\s+/g, ' ');
    expect(entry).toContain('docs/AGENT_EXECUTION_POLICY.md#subagent-briefs-for-functional-changes');
    expect(entry).toMatch(/use the `tdd` skill.{0,160}even when the brief omits it/);
  });

  it('names skills instead of recording a versioned or tool-specific install path', () => {
    const installPath = /plugins\/cache\/|\.(?:claude|codex|agents)\/(?:plugins|skills)\/|mattpocock-skills\/\d/;
    expect('~/.claude/plugins/cache/claude-plugins-official/mattpocock-skills/1.3.1/skills').toMatch(installPath);
    expect('.agents/skills/tdd/SKILL.md').toMatch(installPath);

    const sources = readSources();
    for (const surface of ['domain', 'error-recovery', 'issue-tracker', 'proof-tooling', 'triage-labels']) {
      sources.set(`docs/agents/${surface}.md`, readGuidance(`docs/agents/${surface}.md`));
    }
    for (const [surface, source] of sources) {
      expect(source, `${surface} must name the skill, not where one tool installed it`).not.toMatch(installPath);
    }
  });

  it('preserves truthful product metadata and deployment distinctions', () => {
    const normalized = readGuidance('CLAUDE.md').replace(/\s+/g, ' ');
    expect(normalized).toMatch(/Player-facing work increments the application version/);
    expect(normalized).toMatch(/Tooling, tests, and documentation-only changes do not bump/);
    expect(normalized).toMatch(/A pushed workflow is not proof that production finished/);
    const release = readGuidance('docs/AGENT_EXECUTION_POLICY.md').replace(/\s+/g, ' ');
    expect(release).toMatch(/completed\/total prompt percentage from the\s+catalog snapshot/i);
    expect(release).toMatch(/Only the product owner authorizes `0\.9\.x` and `1\.0\.0`/);
    expect(release).toMatch(/complete 20-player set[\s\S]{0,180}end-to-end gameplay loop/i);
  });
});
