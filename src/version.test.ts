import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { APP_VERSION } from './version';

it('keeps the visible build reference aligned with the package version', () => {
  const packageJson = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string };
  expect(APP_VERSION).toBe(packageJson.version);
});

it('documents the release-maturity gates for later version numbers', () => {
  const agreement = readFileSync('CLAUDE.md', 'utf8');
  const agentEntry = readFileSync('AGENTS.md', 'utf8');
  expect(agreement).toContain('`0.9.x` is reserved');
  expect(agreement).toContain('complete 20-player set');
  expect(agreement).toContain('full, complex gameplay');
  expect(agreement).toContain('multiple interacting systems');
  expect(agreement).toContain('clear, implemented game end');
  expect(agreement).toContain('must never decrease');
  expect(agentEntry).toContain('Version every completed edit');
});
