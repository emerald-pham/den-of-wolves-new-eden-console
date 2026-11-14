// @vitest-environment node
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { copyFile, mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import vitestConfig from '../vitest.config';
import { functionsTestPrerequisiteError, prepareFunctionsTests } from '../scripts/functions-test-setup.mjs';

type ProjectConfig = { test?: { name?: string; globalSetup?: string | string[] } };
const projects = (vitestConfig as { test?: { projects?: ProjectConfig[] } }).test?.projects ?? [];
const project = (name: string) => projects.find((candidate) => candidate.test?.name === name);

describe('Functions test project prerequisites', () => {
  const roots: string[] = [];
  afterEach(async () => {
    await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
  });

  async function checkout(installed: string[]) {
    const root = await mkdtemp(resolve(tmpdir(), 'den-of-wolves-functions-setup-'));
    roots.push(root);
    await mkdir(resolve(root, 'functions', 'src'), { recursive: true });
    await writeFile(resolve(root, 'functions', 'package.json'), JSON.stringify({
      dependencies: { 'firebase-admin': '^14.3.0', 'firebase-functions': '^7.3.2' },
    }));
    for (const name of installed) {
      await mkdir(resolve(root, 'functions', 'node_modules', name), { recursive: true });
      await writeFile(resolve(root, 'functions', 'node_modules', name, 'package.json'), '{}');
    }
    return root;
  }

  it('prepares only the Functions project before its tests load', () => {
    expect(project('functions')?.test?.globalSetup).toEqual(['./scripts/functions-test-setup.mjs']);
    expect(project('unit')?.test?.globalSetup).toBeUndefined();
    expect(project('rules')?.test?.globalSetup).toBeUndefined();
  });

  it('stops with one install instruction when a clean checkout lacks Functions dependencies', async () => {
    const message = functionsTestPrerequisiteError(await checkout([]));
    expect(message).toBe(
      'Functions dependencies are not installed (missing firebase-admin, firebase-functions). ' +
      'Run `npm ci --prefix functions`, then rerun the Functions tests.',
    );
  });

  it('names only the dependencies that are actually missing', async () => {
    expect(functionsTestPrerequisiteError(await checkout(['firebase-admin'])))
      .toContain('(missing firebase-functions)');
  });

  it('builds the generated casting core before Functions tests load', async () => {
    const root = await checkout(['firebase-admin', 'firebase-functions']);
    const repository = process.cwd();
    await mkdir(resolve(root, 'scripts'), { recursive: true });
    await copyFile(resolve(repository, 'scripts/build-casting-companion-core.mjs'), resolve(root, 'scripts/build-casting-companion-core.mjs'));
    await copyFile(resolve(repository, 'functions/casting-companion-entry.mjs'), resolve(root, 'functions/casting-companion-entry.mjs'));
    await symlink(resolve(repository, 'companion'), resolve(root, 'companion'));
    await symlink(resolve(repository, 'node_modules'), resolve(root, 'node_modules'));
    const core = resolve(root, 'functions/lib/casting-companion-core.cjs');
    expect(existsSync(core)).toBe(false);

    prepareFunctionsTests(root);

    expect(typeof createRequire(import.meta.url)(core).CastingService).toBe('function');
  });

  it('stops a checkout without Functions dependencies with only the install instruction', async () => {
    const root = await checkout([]);
    const setupUrl = pathToFileURL(resolve(process.cwd(), 'scripts/functions-test-setup.mjs')).href;
    const run = spawnSync(process.execPath, [
      '--input-type=module',
      '-e',
      `import { prepareFunctionsTests } from ${JSON.stringify(setupUrl)}; prepareFunctionsTests(process.argv[1]);`,
      root,
    ], { encoding: 'utf8' });
    expect(run.status).toBe(1);
    expect(run.stdout).toBe('');
    expect(run.stderr).toBe(
      'Functions dependencies are not installed (missing firebase-admin, firebase-functions). ' +
      'Run `npm ci --prefix functions`, then rerun the Functions tests.\n',
    );
    expect(existsSync(resolve(root, 'functions/lib'))).toBe(false);
  });

  it('accepts a checkout whose Functions dependencies are installed', async () => {
    expect(functionsTestPrerequisiteError(await checkout(['firebase-admin', 'firebase-functions']))).toBeNull();
  });
});
