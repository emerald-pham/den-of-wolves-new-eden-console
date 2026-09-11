import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  formatImplementationProgress,
  validateImplementationProgress,
  validateReleaseFragment,
} from '../../scripts/validate-implementation-progress.mjs';
import { validateImplementationPromptClaims } from '../../scripts/emulator-resource-registry.mjs';

const progressPath = resolve(process.cwd(), 'docs/IMPLEMENTATION_PROGRESS.md');
const planPath = resolve(process.cwd(), 'docs/IMPLEMENTATION_PLAN.md');
const changelogPath = resolve(process.cwd(), 'src/changelog.ts');
const packagePath = resolve(process.cwd(), 'package.json');
const claudePath = resolve(process.cwd(), 'CLAUDE.md');
const progressSource = readFileSync(progressPath, 'utf8');
const planSource = readFileSync(planPath, 'utf8');
const changelogSource = readFileSync(changelogPath, 'utf8');
const applicationVersion = JSON.parse(readFileSync(packagePath, 'utf8')).version as string;
const claudeSource = readFileSync(claudePath, 'utf8');

const validationInputs = {
  progressSource,
  planSource,
  changelogSource,
  applicationVersion,
};

const PROGRESS_STATUS_PATTERN = 'done|partial|missing|blocked|in-progress';

function replaceLedgerStatus(source: string, prompt: string, status: string): string {
  const row = new RegExp(
    `^(\\|\\s*${prompt}\\s*\\|\\s*)(${PROGRESS_STATUS_PATTERN})(\\s*\\|)`,
    'im',
  );
  if (!row.test(source)) throw new Error(`Expected Prompt ${prompt} in the progress fixture.`);
  return source.replace(row, `$1${status}$3`);
}

function withSyntheticActivePrompt(source: string, prompt: string): string {
  const activeDeclarationPattern = /Active prompts?:\s+\*\*(?:none|Prompt\s+(\d{3}[a-z]*))\*\*(?:\.)?/i;
  const activeDeclaration = source.match(activeDeclarationPattern);
  if (!activeDeclaration) throw new Error('Expected an active-prompt declaration in the progress fixture.');

  const currentActive = activeDeclaration[1];
  let fixture = currentActive ? replaceLedgerStatus(source, currentActive, 'partial') : source;
  fixture = replaceLedgerStatus(fixture, prompt, 'in-progress');
  fixture = fixture.replace(
    activeDeclarationPattern,
    `Active prompt: **Prompt ${prompt}**.`,
  );

  const counts = new Map<string, number>();
  const rows = fixture.matchAll(
    new RegExp(`^\\|\\s*\\d{3}[a-z]*\\s*\\|\\s*(${PROGRESS_STATUS_PATTERN})\\s*\\|`, 'gim'),
  );
  for (const row of rows) {
    const status = row[1];
    if (!status) throw new Error('Expected a status capture in the progress fixture.');
    counts.set(status, (counts.get(status) ?? 0) + 1);
  }
  const breakdown = ['done', 'partial', 'missing', 'blocked', 'in-progress']
    .filter((status) => (counts.get(status) ?? 0) > 0)
    .map((status) => `${counts.get(status)} ${status}`)
    .join(' · ');
  return fixture.replace(
    /Status breakdown:\s+\*\*[^*]+\*\*\./,
    `Status breakdown: **${breakdown}**.`,
  );
}

describe('implementation progress integrity gate', () => {
  it('accepts the checked-in ledger and emits the canonical status sentence', () => {
    const result = validateImplementationProgress(validationInputs);

    expect(result.errors).toEqual([]);
    if (!result.summary) throw new Error('Expected a parsed implementation-progress summary.');
    expect(formatImplementationProgress(result.summary)).toBe(
      `Implementation progress: ${result.summary.complete}/${result.summary.total} complete; ` +
      `${result.summary.partial} partial; ${result.summary.missing} missing; ` +
      `resume at Prompt ${result.summary.resumePrompt} (lowest-numbered unresolved prompt).`,
    );
  });

  it('requires the current release to carry exact two-decimal progress metadata', () => {
    const result = validateImplementationProgress(validationInputs);

    expect(result.errors).toEqual([]);
    if (!result.summary || !result.releaseProgress) {
      throw new Error('Expected implementation progress metadata.');
    }
    expect(result.summary).toMatchObject({
      complete: result.releaseProgress.completed,
      total: result.releaseProgress.total,
      partial: result.releaseProgress.partial,
      missing: result.releaseProgress.missing,
      inProgress: 0,
    });
    expect(result.releaseProgress).toEqual({
      version: applicationVersion,
      completed: result.summary.complete,
      total: result.summary.total,
      percentage: `${((result.summary.complete / result.summary.total) * 100).toFixed(2)}%`,
      done: result.summary.complete,
      partial: result.summary.partial,
      active: result.summary.inProgress,
      missing: result.summary.missing,
    });
    expect(changelogSource).toContain('Turn and finale transmissions now keep their accessible status visible');
  });

  it('accepts a validated product release fragment before the generated release metadata exists', () => {
    const baseline = validateImplementationProgress(validationInputs);
    expect(baseline.releaseProgress).toBeDefined();
    const validatedFragment = {
      baseVersion: applicationVersion,
      implementationPrompts: ['141'],
      implementationProgress: baseline.releaseProgress,
      changes: ['A feature note prepared for the release lane.'],
      validated: true,
    };

    const result = validateImplementationProgress({
      ...validationInputs,
      requiredPrompt: '141',
      validatedFragment,
    });

    expect(result.errors).toEqual([]);
    expect(result.validatedFragment).toMatchObject({
      baseVersion: applicationVersion,
      implementationPrompts: ['141'],
      validated: true,
    });
  });

  it('rejects a release fragment whose progress metadata does not match its own counts', () => {
    const result = validateReleaseFragment({
      fragment: {
        baseVersion: applicationVersion,
        implementationPrompts: ['141'],
        implementationProgress: {
          completed: 2,
          total: 731,
          percentage: '0.27%',
          done: 2,
          partial: 24,
          active: 0,
          missing: 620,
        },
        changes: ['A feature note.'],
      },
      progressSource,
      planSource,
      applicationVersion,
    });

    expect(result.errors.join('\n')).toContain(
      'release fragment implementation progress counts must sum to total',
    );
  });

  it('requires a validated release fragment to cover the required product prompt', () => {
    const result = validateReleaseFragment({
      fragment: {
        baseVersion: applicationVersion,
        implementationPrompts: [],
        changes: ['A feature note.'],
      },
      progressSource,
      planSource,
      applicationVersion,
      requiredPrompt: '141',
    });

    expect(result.errors.join('\n')).toContain(
      'release fragment must cover required Prompt 141',
    );
  });

  it('rejects release metadata whose percentage or raw status counts drift', () => {
    const badPercentage = validateImplementationProgress({
      ...validationInputs,
      changelogSource: changelogSource.replace(
        /percentage:\s*['"][^'"]+['"]/, "percentage: '9.7%'",
      )
        .replace('partial: 26', 'partial: 27'),
    });

    expect(badPercentage.errors.join('\n')).toContain(
      `changelog ${applicationVersion} implementation progress percentage must use two decimals`,
    );
    expect(badPercentage.errors.join('\n')).toContain(
      `changelog ${applicationVersion} implementation progress partial count is 27, but the ledger has 26`,
    );
  });

  it('documents the progress metadata contract for every future version increment', () => {
    expect(claudeSource).toMatch(/every version increment[\s\S]*implementation-plan progress/i);
    expect(claudeSource).toMatch(/two-decimal\s+percentage/i);
    expect(claudeSource).toMatch(/done[\s,/]\s*partial[\s,/]\s*active[\s,/]\s*missing/i);
  });

  it('keeps the landed connectivity evidence on Prompt 598 without remapping Prompt 041', () => {
    const result = validateImplementationProgress(validationInputs);

    expect(result.errors).not.toContainEqual(expect.stringMatching(/Prompt 598/));
    expect(result.summary).toMatchObject({ total: 732, resumePrompt: '012' });
    expect(result.summary?.complete).toBe(result.releaseProgress?.completed);
    expect(progressSource).toContain('| 004 | done | feature | 0.3.9, 0.3.11 |');
    expect(progressSource).toContain('| 051 | done | feature | 0.3.9, 0.3.12, 0.3.13 |');
    expect(progressSource).toContain('| 041 | done | non-feature | — |');
    expect(progressSource).toContain('| 598 | partial | feature | 0.3.6, 0.3.10 |');
  });

  it('rejects an unknown or duplicate prompt row', () => {
    const unknown = validateImplementationProgress({
      ...validationInputs,
      progressSource: progressSource.replace('| 001 | done |', '| 999 | done |'),
    });
    expect(unknown.errors.join('\n')).toContain('unknown Prompt 999');

    const retiredInCurrentRelease = validateImplementationProgress({
      ...validationInputs,
      changelogSource: changelogSource.replace(
        "implementationPrompts: ['138a'],",
        "implementationPrompts: ['138a', 071],",
      ),
    });
    expect(retiredInCurrentRelease.errors.join('\n')).toContain('unknown Prompt 071');

    const retiredInUnlistedRelease = validateImplementationProgress({
      ...validationInputs,
      changelogSource: changelogSource.replace(
        "  {\n    version: '0.3.4',",
        "  {\n    version: '0.3.99',\n    implementationPrompts: [071],\n    changes: [\n      'Historical release coverage fixture.',\n    ],\n  },\n  {\n    version: '0.3.4',",
      ),
    });
    expect(retiredInUnlistedRelease.errors.join('\n')).toContain('unknown Prompt 071');

    const duplicate = validateImplementationProgress({
      ...validationInputs,
      progressSource: progressSource.replace('| 002 | done |', '| 001 | done |'),
    });
    expect(duplicate.errors.join('\n')).toContain('lists Prompt 001 more than once');
  });

  it('allows distinct active base and lettered prompt claims but rejects duplicates', () => {
    expect(validateImplementationPromptClaims([
      { id: 'agent-base', status: 'active', implementationPrompt: '598' },
      { id: 'agent-lettered', status: 'active', implementationPrompt: '598a' },
    ])).toEqual(new Map([
      ['598', 'agent-base'],
      ['598a', 'agent-lettered'],
    ]));

    expect(() => validateImplementationPromptClaims([
      { id: 'agent-one', status: 'active', implementationPrompt: '598' },
      { id: 'agent-two', status: 'active', implementationPrompt: '598' },
    ])).toThrow(/Prompt 598 is already claimed by agent-one/);
  });

  it('rejects a headline that disagrees with the done rows', () => {
    const baseline = validateImplementationProgress(validationInputs).summary;
    if (!baseline) throw new Error('Expected a parsed implementation-progress summary.');
    const headline = progressSource.match(
      /\*\*(\d+)\s*\/\s*(\d+)\s+prompts\s+complete\s+\((\d+(?:\.\d+)?)%\)\*\*/,
    );
    if (!headline) throw new Error('Expected the canonical progress headline.');
    const mismatchedComplete = baseline.complete + 1;
    const result = validateImplementationProgress({
      ...validationInputs,
      progressSource: progressSource.replace(headline[0],
        `**${mismatchedComplete} / ${headline[2]} prompts complete (${headline[3]}%)**`),
    });

    expect(result.errors.join('\n')).toContain(
      `headline complete count is ${mismatchedComplete}, but the ledger has ${baseline.complete} done prompts`,
    );
  });

  it('rejects a resume pointer that skips the first unresolved prompt', () => {
    const baseline = validateImplementationProgress(validationInputs).summary;
    if (!baseline?.resumePrompt) throw new Error('Expected a first unresolved prompt.');
    const skippedPrompt = String(Number.parseInt(baseline.resumePrompt, 10) + 1).padStart(3, '0');
    const result = validateImplementationProgress({
      ...validationInputs,
      progressSource: progressSource.replace(
        /Resume pointer:\s*Prompt\s+\d{3}[a-z]*\s+is the lowest-numbered unchecked acceptance and/i,
        `Resume pointer: Prompt ${skippedPrompt} is the lowest-numbered unchecked acceptance and`,
      ),
    });

    expect(result.errors.join('\n')).toContain(
      `resume pointer is Prompt ${skippedPrompt}, but the first unresolved prompt is ${baseline.resumePrompt}`,
    );
  });

  it('rejects source-plan checkboxes that disagree with the ledger', () => {
    const result = validateImplementationProgress({
      ...validationInputs,
      planSource: planSource.replace('- [x] Prompt 005', '- [ ] Prompt 005'),
    });

    expect(result.errors.join('\n')).toContain(
      'Prompt 005 is done in the ledger but unchecked in IMPLEMENTATION_PLAN.md',
    );
  });

  it('keeps the move-on gate open while a prompt is in progress', () => {
    const result = validateImplementationProgress({
      ...validationInputs,
      progressSource: withSyntheticActivePrompt(progressSource, '012'),
    });

    expect(result.errors.join('\n')).toContain(
      'Prompt 012 is still in-progress; mark it done, partial, missing, or blocked before moving on',
    );
  });

  it('allows a dependency-ready prompt to start past the triage resume pointer', () => {
    const result = validateImplementationProgress({
      ...validationInputs,
      progressSource: withSyntheticActivePrompt(progressSource, '020'),
    });

    expect(result.errors.join('\n')).not.toContain(
      'active prompt is 020, but the first unresolved prompt is 012',
    );
    expect(result.errors.join('\n')).toContain(
      'Prompt 020 is still in-progress; mark it done, partial, missing, or blocked before moving on',
    );
  });

  it('rejects a feature prompt that has no real changelog version', () => {
    const result = validateImplementationProgress({
      ...validationInputs,
      progressSource: progressSource.replace(
        '| 015 | partial | feature | 0.3.5 |',
        '| 015 | partial | feature | — |',
      ),
    });

    expect(result.errors.join('\n')).toContain(
      'feature Prompt 015 must name a changelog version',
    );
  });

  it('rejects a feature prompt missing from changelog coverage metadata', () => {
    const result = validateImplementationProgress({
      ...validationInputs,
      changelogSource: changelogSource.replace(
        'implementationPrompts: [15, 18, 21, 22, 57, 58, 59, 60, 61, 62, 64, 65, 66, 67, 71, 72, 73, 74, 75, 77, 78, 84, 86],',
        'implementationPrompts: [18, 21, 22, 57, 58, 59, 60, 61, 62, 64, 65, 66, 67, 72, 73, 74, 75, 77, 78, 84, 86],',
      ),
    });

    expect(result.errors.join('\n')).toContain(
      'Prompt 015 names changelog 0.3.5, but that entry does not cover it',
    );
  });

  it('rejects a changelog entry that collapses covered prompts into too few bullets', () => {
    const result = validateImplementationProgress({
      ...validationInputs,
      changelogSource: changelogSource.replace(
        "      'Authorized facilitators can now regain census, suspicion, notes, and hidden resolution state while members remain denied.',\n",
        '',
      ).replace(
        "      'The start transaction now initializes lifecycle, turn, phase, timers, ships, roles, resources, decks, pursuit, and the opening event together.',\n",
        '',
      ),
    });

    expect(result.errors.join('\n')).toContain(
      'changelog 0.3.5 covers 23 implementation-plan feature prompts but has only 21 player-facing changes',
    );
  });

  it('allows a feature prompt to carry coverage into a later release', () => {
    const laterEntry = `  {
    version: '0.3.99',
    implementationPrompts: [15],
    changes: [
      'Command errors now explain the remaining retry path without exposing private state.',
    ],
  },
`;
    const result = validateImplementationProgress({
      ...validationInputs,
      progressSource: progressSource.replace(
        '| 015 | partial | feature | 0.3.5 |',
        '| 015 | partial | feature | 0.3.5, 0.3.99 |',
      ),
      changelogSource: changelogSource.replace(
        "  {\n    version: '0.3.4',",
        `${laterEntry}  {\n    version: '0.3.4',`,
      ),
    });

    expect(result.errors).toEqual([]);
  });
});
