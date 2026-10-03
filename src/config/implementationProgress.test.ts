import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CHANGELOG } from '../changelog';
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
  it('preserves the fixed PC06 closures and its historical release allocation', () => {
    const ids = '202 210 222 232 236 241a 259 320 607 679 020a 112 238 244 241c 251 250 352 371 380 385 378 401 237 241b 392 393 404 405 407 408 409 410 411 412 413 243 414 415 622 422 646 334 335 151 307 322 323 324'.split(' ');
    expect(ids).toHaveLength(49);
    const rows = ids.map(id => catalog.prompts.find(row => row.id === id));
    expect(rows.every(row => row?.status === 'done')).toBe(true);
    const pc06 = CHANGELOG.find(entry => entry.version === '0.5.64');
    expect(pc06?.implementationPrompts?.map(String)).toEqual(ids);
    expect(pc06?.implementationPrompts?.map(String)).not.toContain('343');
    expect(pc06?.implementationProgress?.completed).toBe(556);
  });

  it('closes exactly the fixed PC07 allocation and reaches its cumulative target', () => {
    const ids = '326 336 153 337 338 152 339 340 341 342 343 344 345 346 347 348 349 350 424 678 643 140 154 155 156 158 103a 159 428 431 432 432a 433 433a 433b 434 434a 435 436 437 438 439 440 441 442 444 523a 351 353'.split(' ');
    expect(ids).toHaveLength(49);
    expect(new Set(ids).size).toBe(49);
    expect(ids.map(id => catalog.prompts.find(row => row.id === id)?.status))
      .toEqual(ids.map(() => 'done'));
    expect(CHANGELOG[0]?.implementationPrompts?.map(String)).toEqual(ids);
    expect(catalog.prompts.filter(row => row.status === 'done')).toHaveLength(605);
    expect(catalog.prompts.find(row => row.id === '605a')?.status).not.toBe('done');
  });

  it('derives the current summary from the catalog and requires the current changelog totals to match', () => {
    const result = validateImplementationProgress(inputs);

    expect(result.errors).toEqual([]);
    expect(result.summary?.total).toBe(catalog.prompts.length);
    expect(formatImplementationProgress(result.summary)).toContain(
      `${result.summary?.complete}/${result.summary?.total} complete`,
    );
    expect(result.releaseProgress).toMatchObject({
      version: inputs.applicationVersion,
      completed: result.summary?.complete,
      total: result.summary?.total,
      blocked: result.summary?.blocked,
    });
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
    expect(after.errors.join('\n')).toContain('changelog');
    expect(after.errors.join('\n')).toContain('but the ledger has');
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
