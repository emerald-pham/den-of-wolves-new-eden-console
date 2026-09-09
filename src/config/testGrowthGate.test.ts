import { describe, expect, it } from 'vitest';
// @ts-expect-error The executable gate is intentionally plain JavaScript.
import { TEST_GROWTH_REVIEW_LIMITS, findNewDuplicateTestMatrices, reviewTestGrowth, summarizeTestGrowthDiff } from '../../scripts/test-growth-gate.mjs';

describe('test-growth review gate', () => {
  it('counts added test lines and declared cases without treating production code as tests', () => {
    const summary = summarizeTestGrowthDiff({
      baseSha: 'base-sha',
      headSha: 'head-sha',
      numstat: [
        '200\t0\tsrc/example.test.ts',
        '25\t4\tsrc/example.ts',
      ].join('\n'),
      patch: [
        'diff --git a/src/example.test.ts b/src/example.test.ts',
        '--- a/src/example.test.ts',
        '+++ b/src/example.test.ts',
        '+it(\'one case\', () => {});',
        '+test.each([[1]])(\'a matrix case\', () => {});',
        'diff --git a/src/example.ts b/src/example.ts',
        '--- a/src/example.ts',
        '+++ b/src/example.ts',
        '+test(\'not a test declaration for this gate\');',
      ].join('\n'),
    });

    expect(summary).toMatchObject({
      baseSha: 'base-sha',
      headSha: 'head-sha',
      changedTestFiles: ['src/example.test.ts'],
      addedTestFiles: 1,
      addedTestLines: 200,
      addedTestCases: 2,
    });
    expect(summary.linesPerAddedCase).toBe(100);
  });

  it('passes ordinary focused additions without requiring a justification', () => {
    const result = reviewTestGrowth({
      changedTestFiles: ['src/example.test.ts'],
      addedTestFiles: 1,
      addedTestLines: 80,
      addedTestCases: 2,
      linesPerAddedCase: 40,
      baseSha: 'base-sha',
      headSha: 'head-sha',
    });

    expect(result).toMatchObject({
      passed: true,
      reviewRequired: false,
      waived: false,
    });
  });

  it('pauses disproportionate fixture or matrix growth until it is explained', () => {
    const result = reviewTestGrowth({
      changedTestFiles: ['src/example.test.ts'],
      addedTestFiles: 1,
      addedTestLines: TEST_GROWTH_REVIEW_LIMITS.minimumAddedLines,
      addedTestCases: 4,
      linesPerAddedCase: 40,
      baseSha: 'base-sha',
      headSha: 'head-sha',
    });

    expect(result).toMatchObject({
      passed: false,
      reviewRequired: true,
      waived: false,
    });
    expect(result.message).toMatch(/test-growth gate.*justification/i);
  });

  it('accepts a concise explanation for legitimate fixture-heavy coverage', () => {
    const result = reviewTestGrowth({
      changedTestFiles: ['src/example.test.ts'],
      addedTestFiles: 1,
      addedTestLines: 240,
      addedTestCases: 2,
      linesPerAddedCase: 120,
      baseSha: 'base-sha',
      headSha: 'head-sha',
    }, 'This is a shared security matrix covering both client roles.');

    expect(result).toMatchObject({
      passed: true,
      reviewRequired: true,
      waived: true,
      justification: 'This is a shared security matrix covering both client roles.',
    });
  });

  it('requires an explanation when test lines are added without a new declared case', () => {
    const result = reviewTestGrowth({
      changedTestFiles: ['src/example.test.ts'],
      addedTestFiles: 1,
      addedTestLines: 1,
      addedTestCases: 0,
      linesPerAddedCase: null,
      baseSha: 'base-sha',
      headSha: 'head-sha',
    });

    expect(result.passed).toBe(false);
    expect(result.message).toMatch(/without a new test case/i);
  });

  it('finds a newly duplicated parameter matrix without charging pre-existing debt', () => {
    const duplicate = `
      it.each(CASES)('first contract', value => expect(value).toBeTruthy());
      test.each(CASES)('second contract', value => expect(value).toBeTruthy());
    `;

    expect(findNewDuplicateTestMatrices({
      baseSources: {
        'src/new-duplication.test.ts': `it.each(CASES)('first contract', () => {});`,
        'src/existing-debt.test.ts': duplicate,
      },
      headSources: {
        'src/new-duplication.test.ts': duplicate,
        'src/existing-debt.test.ts': duplicate,
      },
    })).toEqual([{
      filePath: 'src/new-duplication.test.ts',
      matrix: 'CASES',
      baseUses: 1,
      headUses: 2,
    }]);
  });

  it('requires a justification for a newly duplicated parameter matrix', () => {
    const duplicateMatrix = [{
      filePath: 'src/example.test.ts',
      matrix: 'SHIPS.flatMap(ship => ship.roles)',
      baseUses: 1,
      headUses: 2,
    }];
    const summary = {
      changedTestFiles: ['src/example.test.ts'],
      addedTestFiles: 1,
      addedTestLines: 12,
      addedTestCases: 1,
      linesPerAddedCase: 12,
      newDuplicateTestMatrices: duplicateMatrix,
      baseSha: 'base-sha',
      headSha: 'head-sha',
    };

    expect(reviewTestGrowth(summary)).toMatchObject({
      passed: false,
      reviewRequired: true,
      waived: false,
    });
    expect(reviewTestGrowth(summary).message).toMatch(/duplicate parameter matrix/i);
    expect(reviewTestGrowth(
      summary,
      'The two security contracts intentionally share one exhaustive role matrix.',
    )).toMatchObject({
      passed: true,
      reviewRequired: true,
      waived: true,
    });
  });
});
