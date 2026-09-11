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
  return new Map(guidanceSurfaces.map((surface) => [surface, readGuidance(surface)]));
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
      'Process-gate changes are frozen through 2026-09-18',
      'first five prompts',
      'existing task timestamps',
      'new telemetry system',
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

  it('keeps the process-gate freeze and lightweight first-five monitoring policy', () => {
    const errors: string[] = [];
    validateRiskBasedGuidance({ sources: readSources(), errors });
    expect(errors, errors.join('\\n')).toEqual([]);
  });

  it('requires the risk-based model policy without a compulsory handoff cycle', () => {
    const sources = readSources();
    const errors: string[] = [];
    validateAgentModelEscalation({ sources, errors });
    expect(errors, errors.join('\n')).toEqual([]);

    const weak = new Map(sources);
    weak.set('CLAUDE.md', readGuidance('CLAUDE.md').replaceAll('Terra', 'Reviewer'));
    weak.set('docs/AGENT_CAMPAIGN_PLAYBOOK.md', readGuidance('docs/AGENT_CAMPAIGN_PLAYBOOK.md').replaceAll('Terra', 'Reviewer'));
    const weakErrors: string[] = [];
    validateAgentModelEscalation({ sources: weak, errors: weakErrors });
    expect(weakErrors).toEqual(expect.arrayContaining([
      expect.stringContaining('risky shared/session/callable/rules or deploy/auth'),
    ]));
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
