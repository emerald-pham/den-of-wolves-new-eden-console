import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import test from 'node:test';
import { generatePromptViews } from './generate-prompt-views.mjs';
import { loadPromptCatalog, stableCatalogJson } from './prompt-catalog.mjs';

test('generated views use one tracker-resolved catalog snapshot', async () => {
  const cwd = await mkdtemp(resolve(tmpdir(), 'prompt-tracker-consumer-'));
  try {
    await mkdir(resolve(cwd, 'docs'), { recursive: true });
    for (const path of [
      'docs/IMPLEMENTATION_PLAN.md',
      'docs/IMPLEMENTATION_PROGRESS.md',
      'docs/IMPLEMENTATION_PROMPT_DEPENDENCIES.md',
      'docs/IMPLEMENTATION_MILESTONES.md',
    ]) {
      const source = await readFile(resolve(process.cwd(), path), 'utf8');
      await writeFile(resolve(cwd, path), source);
    }

    const sourceCatalog = loadPromptCatalog();
    const catalog = structuredClone(sourceCatalog);
    const prompt = catalog.prompts.find(({ id }) => id === '181');
    assert.equal(prompt.status, 'missing');
    prompt.status = 'partial';
    await writeFile(resolve(cwd, 'docs/implementation-prompts.json'), stableCatalogJson(sourceCatalog));

    await generatePromptViews({ cwd, catalog });

    const progress = await readFile(resolve(cwd, 'docs/IMPLEMENTATION_PROGRESS.md'), 'utf8');
    const plan = await readFile(resolve(cwd, 'docs/IMPLEMENTATION_PLAN.md'), 'utf8');
    const dependencies = await readFile(resolve(cwd, 'docs/IMPLEMENTATION_PROMPT_DEPENDENCIES.md'), 'utf8');
    assert.match(progress, /703 done · 7 partial · 41 missing/);
    assert.match(progress, /^\| 181 \| partial \|/m);
    assert.match(plan, /^- \[ \] Prompt 181$/m);
    assert.match(dependencies, /^\| 181 \|[^\n]*\| partial \|/m);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});
