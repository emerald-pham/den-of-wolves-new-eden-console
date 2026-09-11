#!/usr/bin/env node

import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
  CATALOG_PATH,
  extractPromptCatalog,
  loadPromptCatalog,
  readLegacyPromptSources,
  stableCatalogJson,
  updatePromptViews,
} from './prompt-catalog.mjs';

function parseOptions(args) {
  const options = {};
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === '--check' || argument === '--extract') {
      options[argument.slice(2)] = true;
      continue;
    }
    if (argument === '--cwd' || argument === '--catalog') {
      const value = args[index + 1];
      if (!value || value.startsWith('--')) throw new Error(`${argument} requires a value`);
      options[argument.slice(2)] = value;
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument ${argument}`);
  }
  return options;
}

async function readSources(cwd) {
  const sources = readLegacyPromptSources(cwd);
  return {
    plan: sources.plan,
    progress: sources.progress,
    dependency: sources.dependency,
    milestones: sources.milestones,
  };
}

async function writeOrCheck(path, expected, check) {
  let current = '';
  try {
    current = await readFile(path, 'utf8');
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
  if (current === expected) return false;
  if (check) throw new Error(`Generated view is stale: ${path}`);
  await writeFile(path, expected, 'utf8');
  return true;
}

export async function generatePromptViews({ cwd = process.cwd(), check = false, extract = false } = {}) {
  const root = resolve(cwd);
  const catalogPath = resolve(root, CATALOG_PATH);
  const sources = await readSources(root);
  let catalog;
  if (extract) {
    catalog = extractPromptCatalog({
      planSource: sources.plan,
      progressSource: sources.progress,
      dependencySource: sources.dependency,
      milestonesSource: sources.milestones,
    });
    await writeOrCheck(catalogPath, stableCatalogJson(catalog), check);
  } else {
    catalog = loadPromptCatalog({ cwd: root });
    const canonical = stableCatalogJson(catalog);
    await writeOrCheck(catalogPath, canonical, check);
  }
  const views = updatePromptViews({ sources, catalog });
  const changed = [];
  for (const [name, path] of [
    ['plan', 'docs/IMPLEMENTATION_PLAN.md'],
    ['progress', 'docs/IMPLEMENTATION_PROGRESS.md'],
    ['dependency', 'docs/IMPLEMENTATION_PROMPT_DEPENDENCIES.md'],
  ]) {
    if (await writeOrCheck(resolve(root, path), views[name], check)) changed.push(path);
  }
  return { catalogPath, promptCount: catalog.prompts.length, changed };
}

async function main() {
  const options = parseOptions(process.argv.slice(2));
  const result = await generatePromptViews(options);
  if (options.check) {
    console.log(`Prompt catalog views are current (${result.promptCount} prompts).`);
  } else if (result.changed.length > 0) {
    console.log(`Generated prompt catalog views: ${result.changed.join(', ')}.`);
  } else {
    console.log(`Prompt catalog views already current (${result.promptCount} prompts).`);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(new URL('.', import.meta.url).pathname, '..', 'scripts', 'generate-prompt-views.mjs')) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
