import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  validateWorkRegistration,
} from '../../scripts/validate-work-registration.mjs';

const repositoryRoot = process.cwd();
const catalogSource = readFileSync(resolve(repositoryRoot, 'docs/implementation-prompts.json'), 'utf8');

describe('optional implementation metadata and safety boundaries', () => {
  it('keeps roadmap aliases and removes universal hook and CI registration gates', () => {
    const scripts = JSON.parse(readFileSync(resolve(repositoryRoot, 'package.json'), 'utf8')).scripts as Record<string, string>;
    const commitHook = readFileSync(resolve(repositoryRoot, '.githooks/commit-msg'), 'utf8');
    const pushHook = readFileSync(resolve(repositoryRoot, '.githooks/pre-push'), 'utf8');
    const ci = readFileSync(resolve(repositoryRoot, '.github/workflows/ci.yml'), 'utf8');

    expect(scripts['roadmap:generate']).toBe('node scripts/generate-prompt-views.mjs');
    expect(scripts['roadmap:check']).toBe('node scripts/generate-prompt-views.mjs --check');
    expect(scripts['coordination:goals']).toBeUndefined();
    expect(scripts['validate:work-registration']).toBe('node scripts/validate-work-registration.mjs');

    expect(commitHook).not.toContain('validate-work-registration');
    expect(commitHook).not.toContain('Implementation-Prompt');
    expect(pushHook).toContain('docs/reference');
    expect(pushHook).not.toContain('validate-work-registration');
    expect(ci).not.toContain('validate-work-registration');
    expect(ci).not.toContain('Implementation-Prompt');
    expect(ci).toContain('npm run roadmap:check');
  });

  it('accepts ordinary tooling without a prompt or trailer when the catalog is valid', () => {
    const result = validateWorkRegistration({
      changedFiles: ['scripts/example.mjs'],
      message: 'tooling: make a focused helper change',
      catalogSource,
    });

    expect(result).toMatchObject({
      documentationOnly: false,
      prompt: null,
      newPrompt: false,
      errors: [],
    });
  });

  it('keeps unrelated documentation exempt from catalog registration', () => {
    const result = validateWorkRegistration({
      changedFiles: ['docs/example.md'],
      message: 'docs: clarify an example',
    });

    expect(result).toMatchObject({ documentationOnly: true, prompt: null, errors: [] });
  });

  it('validates a changed catalog without requiring a prompt trailer', () => {
    const result = validateWorkRegistration({
      changedFiles: ['docs/implementation-prompts.json'],
      message: 'docs: update the roadmap catalog',
      catalogSource,
    });

    expect(result).toMatchObject({ documentationOnly: false, prompt: null, errors: [] });
  });

  it('rejects malformed catalog data instead of silently accepting it', () => {
    const malformed = JSON.stringify({ ...JSON.parse(catalogSource), prompts: [] });
    const result = validateWorkRegistration({
      changedFiles: ['scripts/example.mjs'],
      message: 'tooling: update a helper',
      catalogSource: malformed,
    });

    expect(result.errors.join('\n')).toContain('prompt catalog prompts must be a non-empty array');
  });
});
