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
    expect(guidance.split(/\r?\n/).length).toBeLessThanOrEqual(451);
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
    expect(guidance).toContain('do not stop a live process based on age');
    expect(readGuidance('docs/WORKTREE_COORDINATION.md')).toContain('| 14 |');
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
    sources.set('AGENTS.md', `${readGuidance('AGENTS.md')}\nGPT-6 Luna may not use high effort. Terra must not use unsupported effort levels. Do not assume Terra is always stronger than Sol. Do not repeat identical blind reruns after looping failures. Independent Sol security review requires xhigh effort.`);
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

  it('preserves truthful product metadata and deployment distinctions', () => {
    const guidance = readGuidance('CLAUDE.md');
    const normalized = guidance.replace(/\s+/g, ' ');
    expect(normalized).toMatch(/Player-facing work increments the application version/);
    expect(normalized).toMatch(/Tooling, tests, and documentation-only changes do not bump/);
    expect(normalized).toMatch(/A pushed workflow is not proof that production finished/);
    expect(normalized).toMatch(/completed\/total prompt percentage from the\s+catalog snapshot/i);
    expect(normalized).toMatch(/Only the product owner authorizes `0\.9\.x` and `1\.0\.0`/);
    expect(normalized).toMatch(/complete 20-player set[\s\S]{0,180}end-to-end gameplay loop/i);
  });
});
