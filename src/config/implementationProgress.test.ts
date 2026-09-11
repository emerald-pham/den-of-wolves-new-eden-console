import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  formatImplementationProgress,
  readImplementationProgress,
  validateImplementationProgress,
  validateReleaseFragment,
} from '../../scripts/validate-implementation-progress.mjs';

const root = process.cwd();
const inputs = readImplementationProgress({ cwd: root });
const catalog = JSON.parse(inputs.catalogSource) as {
  prompts: Array<{ id: string; status: string; changeClass: string }>;
  evidence: Array<Record<string, string>>;
};

describe('catalog-backed implementation progress', () => {
  it('derives the current summary from the catalog without changelog totals', () => {
    const result = validateImplementationProgress(inputs);

    expect(result.errors).toEqual([]);
    expect(result.summary?.total).toBe(catalog.prompts.length);
    expect(formatImplementationProgress(result.summary)).toContain(
      `${result.summary?.complete}/${result.summary?.total} complete`,
    );
    expect(result.releaseProgress).toBeNull();
  });

  it('accepts a one-field status edit and derives all lifecycle metadata from it', () => {
    const edited = structuredClone(catalog) as unknown as {
      prompts: Array<{ id: string; status: string }>;
    };
    const target = edited.prompts[0];
    if (!target) throw new Error('Catalog fixture has no first prompt.');
    const before = validateImplementationProgress({ ...inputs, catalogSource: JSON.stringify(edited) });
    target.status = target.status === 'done' ? 'partial' : 'done';
    const after = validateImplementationProgress({ ...inputs, catalogSource: JSON.stringify(edited) });

    expect(before.errors).toEqual([]);
    expect(after.errors).toEqual([]);
    expect(after.summary?.complete).toBe(
      before.summary!.complete + (target.status === 'done' ? 1 : -1),
    );
    expect(after.summary?.resumePrompt).toBe(target.status === 'done' ? '012' : target.id);
  });

  it('treats catalog evidence edits as metadata and leaves development validation green', () => {
    const edited = structuredClone(catalog) as unknown as {
      evidence: Array<{ language: string }>;
    };
    const evidence = edited.evidence[0];
    if (!evidence) throw new Error('Catalog fixture has no evidence.');
    evidence.language += ' reviewed';
    const result = validateImplementationProgress({ ...inputs, catalogSource: JSON.stringify(edited) });

    expect(result.errors).toEqual([]);
  });

  it('validates release fragments against catalog change class and derived counts', () => {
    const baseline = validateImplementationProgress(inputs);
    const feature = catalog.prompts.find((prompt) => prompt.changeClass === 'feature');
    if (!feature || !baseline.summary) throw new Error('Expected a feature prompt and catalog summary.');
    const result = validateReleaseFragment({
      fragment: {
        baseVersion: inputs.applicationVersion,
        implementationPrompts: [feature.id],
        implementationProgress: {
          completed: baseline.summary.complete,
          total: baseline.summary.total,
          percentage: `${((baseline.summary.complete / baseline.summary.total) * 100).toFixed(2)}%`,
          done: baseline.summary.complete,
          partial: baseline.summary.partial,
          active: baseline.summary.inProgress,
          missing: baseline.summary.missing,
        },
        changes: ['A feature note prepared for the release lane.'],
      },
      catalogSource: inputs.catalogSource,
      applicationVersion: inputs.applicationVersion,
      requiredPrompt: feature.id,
    });

    expect(result.errors).toEqual([]);
    expect(result.fragment.validated).toBe(true);
  });

  it('reads the catalog as an explicit input while preserving historical changelog text', () => {
    expect(inputs.catalogSource).toContain('"schemaVersion"');
    expect(inputs.changelogSource).toBe(
      readFileSync(resolve(root, 'src/changelog.ts'), 'utf8'),
    );
  });
});
