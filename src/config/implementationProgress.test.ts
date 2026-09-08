import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
// @ts-expect-error The executable validator is intentionally plain JavaScript.
import { formatImplementationProgress, validateImplementationProgress } from '../../scripts/validate-implementation-progress.mjs';

const progressPath = resolve(process.cwd(), 'docs/IMPLEMENTATION_PROGRESS.md');
const planPath = resolve(process.cwd(), 'docs/IMPLEMENTATION_PLAN.md');
const progressSource = readFileSync(progressPath, 'utf8');
const planSource = readFileSync(planPath, 'utf8');

describe('implementation progress integrity gate', () => {
  it('accepts the checked-in ledger and emits the canonical status sentence', () => {
    const result = validateImplementationProgress({ progressSource, planSource });

    expect(result.errors).toEqual([]);
    expect(formatImplementationProgress(result.summary)).toBe(
      'Implementation progress: 64/100 complete; 28 partial; 8 missing; resume at Prompt 004 (lowest-numbered unresolved prompt).',
    );
  });

  it('rejects a headline that disagrees with the done rows', () => {
    const result = validateImplementationProgress({
      progressSource: progressSource.replace(
        '**64 / 100 prompts complete (64%)**',
        '**65 / 100 prompts complete (65%)**',
      ),
      planSource,
    });

    expect(result.errors.join('\n')).toContain('headline complete count is 65, but the ledger has 64 done prompts');
  });

  it('rejects a resume pointer that skips the first unresolved prompt', () => {
    const result = validateImplementationProgress({
      progressSource: progressSource.replace(
        'Resume pointer: Prompt 004 is the lowest-numbered unchecked acceptance;',
        'Resume pointer: Prompt 012 is the lowest-numbered unchecked acceptance;',
      ),
      planSource,
    });

    expect(result.errors.join('\n')).toContain(
      'resume pointer is Prompt 012, but the first unresolved prompt is 004',
    );
  });

  it('rejects source-plan checkboxes that disagree with the ledger', () => {
    const result = validateImplementationProgress({
      progressSource,
      planSource: planSource.replace('- [x] Prompt 005', '- [ ] Prompt 005'),
    });

    expect(result.errors.join('\n')).toContain(
      'Prompt 005 is done in the ledger but unchecked in IMPLEMENTATION_PLAN.md',
    );
  });

  it('keeps the move-on gate open while a prompt is in progress', () => {
    const result = validateImplementationProgress({
      progressSource: progressSource
        .replace('Active prompt: **none**.', 'Active prompt: **Prompt 004**.')
        .replace('| 004 | partial |', '| 004 | in-progress |')
        .replace(
          'Status breakdown: **64 done · 28 partial · 8 missing**.',
          'Status breakdown: **64 done · 27 partial · 8 missing · 1 in-progress**.',
        ),
      planSource,
    });

    expect(result.errors.join('\n')).toContain(
      'Prompt 004 is still in-progress; mark it done, partial, missing, or blocked before moving on',
    );
  });

  it('does not allow work to start past the first unresolved prompt', () => {
    const result = validateImplementationProgress({
      progressSource: progressSource
        .replace('Active prompt: **none**.', 'Active prompt: **Prompt 005**.')
        .replace('| 005 | done |', '| 005 | in-progress |')
        .replace(
          'Status breakdown: **64 done · 28 partial · 8 missing**.',
          'Status breakdown: **63 done · 28 partial · 8 missing · 1 in-progress**.',
        ),
      planSource: planSource.replace('- [x] Prompt 005', '- [ ] Prompt 005'),
    });

    expect(result.errors.join('\n')).toContain(
      'active prompt is 005, but the first unresolved prompt is 004',
    );
  });
});
