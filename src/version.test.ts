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

it('describes AEGIS Command and Control in the current release notes', () => {
  const currentEntry = CHANGELOG.find((entry) => entry.version === APP_VERSION);

  expect(currentEntry?.changes).toContain(
    'The AEGIS Executive Officer can redirect one Wolf ship to AEGIS after the Wolf Commander finishes targeting rerolls. If the assigned Commander is disconnected, the redirect waits until they reconnect and finish rerolls. This action does not resolve damage.',
  );
});

it('retains connected-player roster privacy in its release history', () => {
  const previousEntry = CHANGELOG.find((entry) => entry.version === '0.5.20');

  expect(previousEntry?.changes).toContain(
    'After you reconnect or your role or fleet group changes, the connected player list clears until the app confirms your access.',
  );
});

it('retains the reconnection grace in player-facing release notes', () => {
  expect(CHANGELOG.some((entry) => entry.changes.includes(
    'Connection indicators now keep the connected state through the first 30 seconds of a disconnect and only reveal the disconnected icon after that window when the player had been continuously interacting for more than 30 seconds before the outage.',
  ))).toBe(true);
  expect(CHANGELOG.some((entry) => entry.changes.includes(
    'Connection indicators now show a disconnect immediately when the player was active within the previous 30 seconds; older activity keeps the last connected state during the 30-second reconnect window.',
  ))).toBe(true);
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

it('keeps implementation-plan features mapped when release notes declare coverage', () => {
  const versions = CHANGELOG.map((entry) => entry.version);
  const currentEntry = CHANGELOG.find((entry) => entry.version === APP_VERSION);
  const catalog = JSON.parse(readFileSync('docs/implementation-prompts.json', 'utf8')) as {
    prompts: Array<{ id: string; status: string; releases: string[] }>;
  };

  expect(new Set(versions).size).toBe(versions.length);
  expect(currentEntry).toBeDefined();
  if (!currentEntry?.implementationPrompts) {
    expect(currentEntry?.changes.length).toBeGreaterThan(0);
    return;
  }
  expect(currentEntry.implementationPrompts.length).toBeGreaterThan(0);
  expect(new Set(currentEntry.implementationPrompts).size)
    .toBe(currentEntry.implementationPrompts.length);
  for (const promptId of currentEntry.implementationPrompts) {
    const prompt = catalog.prompts.find((candidate) => candidate.id === String(promptId));
    expect(prompt, `Prompt ${promptId} must exist in the catalog`).toBeDefined();
    expect(['done', 'partial'], `Prompt ${promptId} must be implemented or an explicitly partial release`).toContain(prompt?.status);
    expect(prompt?.releases, `Prompt ${promptId} must name release ${APP_VERSION}`).toContain(APP_VERSION);
  }
});

it('keeps roadmap jargon out of rendered changelog fields while retaining provenance', () => {
  const renderedChanges = CHANGELOG.flatMap((entry) => entry.changes);
  const historicalEntry = CHANGELOG.find((entry) => entry.version === '0.3.79');

  expect(renderedChanges.every((change) => !/\bprompts?\b/i.test(change))).toBe(true);
  expect(historicalEntry?.implementationPrompts).toEqual([245]);
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
  expect(agreement).toContain('Only the product owner authorizes `0.9.x` and `1.0.0`');
  expect(agreement).toContain('complete 20-player set');
  expect(agreement).toContain('an end-to-end gameplay loop');
  expect(agreement).toContain('implemented game end');
  expect(agreement).toContain('Player-facing work increments the application version');
  expect(agreement).toContain('documentation-only changes do not bump');
});
