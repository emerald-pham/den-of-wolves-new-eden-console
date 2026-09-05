import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { APP_VERSION } from './version';

it('keeps the visible build reference aligned with the package version', () => {
  const packageJson = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string };
  expect(APP_VERSION).toBe(packageJson.version);
  expect(APP_VERSION).toBe('0.1.35');
});

it('documents the release-maturity gates for later version numbers', () => {
  const agreement = readFileSync('CLAUDE.md', 'utf8');
  const agentEntry = readFileSync('AGENTS.md', 'utf8');
  expect(agreement).toContain('reserved for builds genuinely close to release readiness');
  expect(agreement).toContain('complete 20-player set');
  expect(agreement).toContain('full, complex gameplay');
  expect(agreement).toContain('multiple interacting systems');
  expect(agreement).toContain('clear, implemented game end');
  expect(agreement).toContain('works end to end');
  expect(agreement).toContain('must never decrease');
  expect(agreement).toContain('Only the product owner may authorize `0.9.x`');
  expect(agreement).toContain('Only the product owner may authorize `1.0.0`');
  expect(agreement).toContain('state the exact version in the user-facing chat');
  expect(agreement).toContain('local tests always run before');
  expect(agreement).toContain('Documentation-only changes');
  expect(agentEntry).toContain('Version every completed product edit');
});
