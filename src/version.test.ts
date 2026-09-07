import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { CHANGELOG } from './changelog';
import { APP_VERSION } from './version';

it('keeps the visible build reference aligned with the package version', () => {
  const packageJson = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string };
  const versionModule = readFileSync('src/version.ts', 'utf8');
  expect(APP_VERSION).toBe(packageJson.version);
  expect(versionModule).not.toMatch(/['"]\d+\.\d+\.\d+['"]/);
});

it('retains the reconnection grace in player-facing release notes', () => {
  expect(CHANGELOG[0]?.changes).toContain(
    'Connection indicators now show a disconnect immediately when the player was active within the previous 30 seconds; older activity keeps the last connected state during the 30-second reconnect window.',
  );
  expect(CHANGELOG.some((entry) => entry.changes.includes(
    'A returning or refreshed in-session console now keeps its Connected light steady for one second while it restores its uplink.',
  ))).toBe(true);
});

it('retains the boot-time population estimate in player-facing release notes', () => {
  expect(CHANGELOG.some((entry) => entry.changes.includes(
    'The landing display now begins with a population estimate while CIC connects.',
  ))).toBe(true);
});

it('retains fleet DRADIS range behavior in player-facing release notes', () => {
  expect(CHANGELOG.some((entry) => entry.changes.includes(
    'Fleet ships and their shuttlecraft now stay uncluttered on DRADIS without range indicators, while every other contact keeps its range readout.',
  ))).toBe(true);
});

it('keeps each release entry focused instead of creating a megachangelog', () => {
  const versions = CHANGELOG.map((entry) => entry.version);
  const currentEntry = CHANGELOG.find((entry) => entry.version === APP_VERSION);

  expect(new Set(versions).size).toBe(versions.length);
  expect(currentEntry?.changes.length).toBeLessThanOrEqual(3);
});

it('emits uncached build metadata for live clients to discover upgrades', () => {
  const viteConfig = readFileSync('vite.config.ts', 'utf8');
  const firebaseConfig = readFileSync('firebase.json', 'utf8');

  expect(viteConfig).toContain('build-version.json');
  expect(firebaseConfig).toContain('/build-version.json');
  expect(firebaseConfig).toContain('no-store');
});

it('documents the release-maturity gates for later version numbers', () => {
  const agreement = readFileSync('CLAUDE.md', 'utf8');
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
  expect(agreement).toContain('Increment the application version with every completed product edit');
});
