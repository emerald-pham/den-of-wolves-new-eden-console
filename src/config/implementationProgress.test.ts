import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
// @ts-expect-error The executable validator is intentionally plain JavaScript.
import { formatImplementationProgress, validateImplementationProgress } from '../../scripts/validate-implementation-progress.mjs';
import { validateImplementationPromptClaims } from '../../scripts/emulator-resource-registry.mjs';

const progressPath = resolve(process.cwd(), 'docs/IMPLEMENTATION_PROGRESS.md');
const planPath = resolve(process.cwd(), 'docs/IMPLEMENTATION_PLAN.md');
const changelogPath = resolve(process.cwd(), 'src/changelog.ts');
const packagePath = resolve(process.cwd(), 'package.json');
const progressSource = readFileSync(progressPath, 'utf8');
const planSource = readFileSync(planPath, 'utf8');
const changelogSource = readFileSync(changelogPath, 'utf8');
const applicationVersion = JSON.parse(readFileSync(packagePath, 'utf8')).version as string;

const validationInputs = {
  progressSource,
  planSource,
  changelogSource,
  applicationVersion,
};

describe('implementation progress integrity gate', () => {
  it('accepts the checked-in ledger and emits the canonical status sentence', () => {
    const result = validateImplementationProgress(validationInputs);

    expect(result.errors).toEqual([]);
    expect(formatImplementationProgress(result.summary)).toBe(
      'Implementation progress: 68/705 complete; 26 partial; 611 missing; resume at Prompt 012 (lowest-numbered unresolved prompt).',
    );
  });

  it('accepts the landed connectivity change as Prompt 598 without remapping Prompt 041', () => {
    const result = validateImplementationProgress(validationInputs);

    expect(result.errors).not.toContainEqual(expect.stringMatching(/Prompt 598/));
    expect(result.summary).toMatchObject({ complete: 68, total: 705 });
    expect(progressSource).toContain('| 004 | done | feature | 0.3.9 |');
    expect(progressSource).toContain('| 051 | done | feature | 0.3.9 |');
    expect(progressSource).toContain('| 041 | done | non-feature | — |');
    expect(progressSource).toContain('| 598 | done | feature | 0.3.6 |');
  });

  it('rejects an unknown or duplicate prompt row', () => {
    const unknown = validateImplementationProgress({
      ...validationInputs,
      progressSource: progressSource.replace('| 001 | done |', '| 999 | done |'),
    });
    expect(unknown.errors.join('\n')).toContain('unknown Prompt 999');

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
    const result = validateImplementationProgress({
      ...validationInputs,
      progressSource: progressSource.replace(
        '**68 / 705 prompts complete (10%)**',
        '**69 / 705 prompts complete (10%)**',
      ),
    });

    expect(result.errors.join('\n')).toContain('headline complete count is 69, but the ledger has 68 done prompts');
  });

  it('rejects a resume pointer that skips the first unresolved prompt', () => {
    const result = validateImplementationProgress({
      ...validationInputs,
      progressSource: progressSource.replace(
        'Resume pointer: Prompt 012 is the lowest-numbered unchecked acceptance and',
        'Resume pointer: Prompt 013 is the lowest-numbered unchecked acceptance and',
      ),
    });

    expect(result.errors.join('\n')).toContain(
      'resume pointer is Prompt 013, but the first unresolved prompt is 012',
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
        progressSource: progressSource
        .replace('Active prompt: **none**.', 'Active prompt: **Prompt 012**.')
        .replace('| 012 | partial | non-feature | — |', '| 012 | in-progress | non-feature | — |')
        .replace(
          'Status breakdown: **68 done · 26 partial · 611 missing**.',
          'Status breakdown: **68 done · 25 partial · 611 missing · 1 in-progress**.',
        ),
    });

    expect(result.errors.join('\n')).toContain(
      'Prompt 012 is still in-progress; mark it done, partial, missing, or blocked before moving on',
    );
  });

  it('allows a dependency-ready prompt to start past the triage resume pointer', () => {
    const result = validateImplementationProgress({
        ...validationInputs,
        progressSource: progressSource
        .replace('Active prompt: **none**.', 'Active prompt: **Prompt 020**.')
        .replace('| 020 | missing | non-feature | — |', '| 020 | in-progress | non-feature | — |')
        .replace(
          'Status breakdown: **68 done · 26 partial · 611 missing**.',
          'Status breakdown: **68 done · 26 partial · 610 missing · 1 in-progress**.',
        ),
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
        'implementationPrompts: [18, 21, 22, 57, 58, 59, 60, 61, 62, 64, 65, 66, 67, 71, 72, 73, 74, 75, 77, 78, 84, 86],',
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
      ),
    });

    expect(result.errors.join('\n')).toContain(
      'changelog 0.3.5 covers 23 implementation-plan feature prompts but has only 22 player-facing changes',
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
