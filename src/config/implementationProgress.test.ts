import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
// @ts-expect-error The executable validator is intentionally plain JavaScript.
import { formatImplementationProgress, validateImplementationProgress } from '../../scripts/validate-implementation-progress.mjs';

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
      'Implementation progress: 66/100 complete; 26 partial; 8 missing; resume at Prompt 011 (lowest-numbered unresolved prompt).',
    );
  });

  it('rejects a headline that disagrees with the done rows', () => {
    const result = validateImplementationProgress({
      ...validationInputs,
      progressSource: progressSource.replace(
        '**66 / 100 prompts complete (66%)**',
        '**67 / 100 prompts complete (67%)**',
      ),
    });

    expect(result.errors.join('\n')).toContain('headline complete count is 67, but the ledger has 66 done prompts');
  });

  it('rejects a resume pointer that skips the first unresolved prompt', () => {
    const result = validateImplementationProgress({
      ...validationInputs,
      progressSource: progressSource.replace(
        'Resume pointer: Prompt 011 is the lowest-numbered unchecked acceptance;',
        'Resume pointer: Prompt 012 is the lowest-numbered unchecked acceptance;',
      ),
    });

    expect(result.errors.join('\n')).toContain(
      'resume pointer is Prompt 012, but the first unresolved prompt is 011',
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
        .replace('Active prompt: **none**.', 'Active prompt: **Prompt 004**.')
        .replace('| 004 | done | non-feature | — |', '| 004 | in-progress | non-feature | — |')
        .replace(
          'Status breakdown: **66 done · 26 partial · 8 missing**.',
          'Status breakdown: **65 done · 26 partial · 8 missing · 1 in-progress**.',
        ),
    });

    expect(result.errors.join('\n')).toContain(
      'Prompt 004 is still in-progress; mark it done, partial, missing, or blocked before moving on',
    );
  });

  it('does not allow work to start past the first unresolved prompt', () => {
    const result = validateImplementationProgress({
        ...validationInputs,
        progressSource: progressSource
        .replace('Active prompt: **none**.', 'Active prompt: **Prompt 005**.')
        .replace('| 004 | done | non-feature | — |', '| 004 | partial | non-feature | — |')
        .replace('| 005 | done | non-feature | — |', '| 005 | in-progress | non-feature | — |')
        .replace(
          'Status breakdown: **66 done · 26 partial · 8 missing**.',
          'Status breakdown: **65 done · 27 partial · 8 missing · 1 in-progress**.',
        ),
      planSource: planSource.replace('- [x] Prompt 005', '- [ ] Prompt 005'),
    });

    expect(result.errors.join('\n')).toContain(
      'active prompt is 005, but the first unresolved prompt is 004',
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
    version: '0.3.6',
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
        '| 015 | partial | feature | 0.3.5, 0.3.6 |',
      ),
      changelogSource: changelogSource.replace(
        "  {\n    version: '0.3.4',",
        `${laterEntry}  {\n    version: '0.3.4',`,
      ),
    });

    expect(result.errors).toEqual([]);
  });
});
