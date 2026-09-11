import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  CATALOG_PATH,
  extractPromptCatalog,
  loadPromptCatalog,
  renderPromptViews,
  stableCatalogJson,
  updatePromptViews,
  validatePromptCatalog,
} from '../../scripts/prompt-catalog.mjs';
import { validateWorkRegistration } from '../../scripts/validate-work-registration.mjs';

const root = process.cwd();
const catalogPath = resolve(root, CATALOG_PATH);
const catalogSource = readFileSync(catalogPath, 'utf8');
const catalog = loadPromptCatalog({ source: catalogSource });

function legacySources() {
  return {
    planSource: readFileSync(resolve(root, 'docs/IMPLEMENTATION_PLAN.md'), 'utf8'),
    progressSource: readFileSync(resolve(root, 'docs/IMPLEMENTATION_PROGRESS.md'), 'utf8'),
    dependencySource: readFileSync(
      resolve(root, 'docs/IMPLEMENTATION_PROMPT_DEPENDENCIES.md'),
      'utf8',
    ),
    milestonesSource: readFileSync(resolve(root, 'docs/IMPLEMENTATION_MILESTONES.md'), 'utf8'),
  };
}

function versionEvidenceRegion(source: string) {
  const firstVersion = source.indexOf('### Version ');
  const integrityGate = source.indexOf('## Progress integrity gate', firstVersion);
  return source.slice(firstVersion, integrityGate);
}

describe('implementation prompt catalog', () => {
  it('round-trips every canonical prompt, evidence record, and sequence', () => {
    expect(validatePromptCatalog(catalog)).toEqual([]);
    expect(new Set(catalog.prompts.map(({ id }) => id)).size).toBe(catalog.prompts.length);
    expect(catalog.prompts.length).toBeGreaterThan(0);
    expect(catalog.evidence.length).toBeGreaterThan(0);
    expect(catalog.sequences.length).toBeGreaterThan(0);
    expect(loadPromptCatalog({ source: stableCatalogJson(catalog) })).toEqual(catalog);
    expect(catalog.prompts.every((prompt) =>
      !('plan' in prompt) && !('progress' in prompt) && !('dependency' in prompt) &&
      prompt.definition.title.length > 0 && prompt.definition.acceptance.length > 0 &&
      prompt.status.length > 0 && prompt.changeClass.length > 0)).toBe(true);
  });

  it('extracts the checked-in authorities with lossless prompt parity', () => {
    const extracted = extractPromptCatalog(legacySources());
    expect(validatePromptCatalog(extracted)).toEqual([]);
    expect(extracted.prompts.length).toBe(catalog.prompts.length);
    expect(extracted.prompts).toEqual(catalog.prompts);
    expect(extracted.evidence).toEqual(catalog.evidence);
    expect(extracted.sequences).toEqual(catalog.sequences);
  });

  it('detects missing hard targets and dependency cycles', () => {
    const missing = structuredClone(catalog) as unknown as {
      prompts: Array<{ hardPromptPrerequisites: string }>;
    };
    const missingFirst = missing.prompts[0];
    if (!missingFirst) throw new Error('Catalog fixture has no first prompt.');
    missingFirst.hardPromptPrerequisites = '999';
    expect(validatePromptCatalog(missing).join('\n')).toMatch(/Prompt 001.*unknown Prompt 999/i);

    const cycle = structuredClone(catalog) as unknown as {
      prompts: Array<{ hardPromptPrerequisites: string }>;
    };
    const cycleFirst = cycle.prompts[0];
    const cycleSecond = cycle.prompts[1];
    if (!cycleFirst || !cycleSecond) throw new Error('Catalog fixture has too few prompts.');
    cycleFirst.hardPromptPrerequisites = '002';
    cycleSecond.hardPromptPrerequisites = '001';
    expect(validatePromptCatalog(cycle).join('\n')).toMatch(/cycle/i);
  });

  it('renders deterministic managed views and derives every status projection from one field', () => {
    const first = renderPromptViews(catalog);
    const second = renderPromptViews(loadPromptCatalog({ source: stableCatalogJson(catalog) }));
    expect(first).toEqual(second);
    expect(first.plan).toContain('BEGIN GENERATED PROMPT CATALOG: plan');
    expect(first.progress).toContain('BEGIN GENERATED PROMPT CATALOG: progress');
    expect(first.dependency).toContain('BEGIN GENERATED PROMPT CATALOG: dependency');

    const sources = legacySources();
    const editedStatus = structuredClone(catalog) as unknown as {
      prompts: Array<{ id: string; status: string; tag: string }>;
    };
    const editedFirst = editedStatus.prompts[0];
    if (!editedFirst) throw new Error('Catalog fixture has no first prompt.');
    editedFirst.status = editedFirst.status === 'done' ? 'partial' : 'done';
    const updated = updatePromptViews({
      sources: {
        plan: sources.planSource,
        progress: sources.progressSource,
        dependency: sources.dependencySource,
        milestones: sources.milestonesSource,
      },
      catalog: editedStatus as unknown as typeof catalog,
    });
    const expectedChecked = editedFirst.status === 'done' ? 'x' : ' ';
    expect(updated.plan).toContain(`- [${expectedChecked}] Prompt ${editedFirst.id}`);
    expect(updated.progress).toContain(`| ${editedFirst.id} | ${editedFirst.status} |`);
    expect(updated.dependency).toContain(`| ${editedFirst.id} | ${editedFirst.tag} | ${editedFirst.status} |`);
    expect(versionEvidenceRegion(updated.progress)).toBe(versionEvidenceRegion(sources.progressSource));

    const edited = structuredClone(catalog) as unknown as {
      evidence: Array<{ language: string }>;
    };
    const editedEvidence = edited.evidence[0];
    if (!editedEvidence) throw new Error('Catalog fixture has no evidence.');
    editedEvidence.language += ' (reviewed)';
    expect(validatePromptCatalog(edited)).toEqual([]);
    expect(validateWorkRegistration({
      changedFiles: ['scripts/example.mjs'],
      message: 'tooling: ordinary maintenance',
      catalogSource: stableCatalogJson(edited),
    }).errors).toEqual([]);
  });
});
