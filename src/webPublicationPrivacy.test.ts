// @vitest-environment node
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { glob } from 'tinyglobby';
import { build } from 'vite';
import { afterAll, beforeAll, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const yaml = require('js-yaml') as { load: (source: string) => unknown };
interface Step { uses?: string; with?: { name?: string; path?: string } }
interface Workflow { jobs: Record<string, { steps?: Step[] }> }
const root = fileURLToPath(new URL('..', import.meta.url));
let artifactRoot: string;
let generated: string[];

beforeAll(async () => {
  // A real, full production output, including private diagnostic maps. This
  // directory is local-only (mkdtemp mode 0700), never a GitHub artifact.
  artifactRoot = await mkdtemp(join(tmpdir(), 'bp1-publication-'));
  await build({ root, logLevel: 'silent', build: { outDir: join(artifactRoot, 'dist') } });
  generated = await glob('dist/**/*', { cwd: artifactRoot });
  expect(generated.filter((file) => file.endsWith('.map')).length).toBeGreaterThan(0);
}, 60_000);

afterAll(async () => { if (artifactRoot) await rm(artifactRoot, { recursive: true, force: true }); });

const executableFiles = (files: readonly string[]): string[] => files
  .filter((file) => /\.(?:js|html)$/.test(file)).sort();

function hostingFiles(ignore: readonly string[]): Promise<string[]> {
  return glob(['dist/**/*', ...ignore.map((pattern) => `!dist/${pattern}`)], { cwd: artifactRoot });
}

it('excludes diagnostic maps from the actual Hosting publication set and keeps executable entries', async () => {
  const config = JSON.parse(await readFile(join(root, 'firebase.json'), 'utf8')) as {
    hosting: { public: string; ignore: string[] };
  };
  expect(config.hosting.public).toBe('dist');
  const published = await hostingFiles(config.hosting.ignore);
  expect(executableFiles(published)).toEqual(executableFiles(generated));
  expect(published.filter((file) => file.endsWith('.map'))).toEqual([]);
  // Removing the map exclusion must expose the generated maps again; an empty
  // build or exclusion of the whole output cannot produce a false pass.
  const broken = await hostingFiles(config.hosting.ignore.filter((pattern) => !pattern.includes('.map')));
  expect(broken.filter((file) => file.endsWith('.map')).length).toBeGreaterThan(0);
});

it('excludes maps from the public web-dist artifact while leaving useful diagnostics only on the runner', async () => {
  const ci = yaml.load(await readFile(join(root, '.github/workflows/ci.yml'), 'utf8')) as Workflow;
  const steps = Object.values(ci.jobs).flatMap((job) => job.steps ?? []);
  const upload = steps.find((step) => step.uses?.startsWith('actions/upload-artifact@') && step.with?.name === 'web-dist');
  expect(upload?.with?.path).toBeTruthy();
  const patterns = upload!.with!.path!.trim().split(/\r?\n/);
  const published = await glob(patterns, { cwd: artifactRoot });
  expect(executableFiles(published)).toEqual(executableFiles(generated));
  expect(published.filter((file) => file.endsWith('.map'))).toEqual([]);
  const broken = await glob(patterns.filter((pattern) => !pattern.startsWith('!')), { cwd: artifactRoot });
  expect(broken.filter((file) => file.endsWith('.map')).length).toBeGreaterThan(0);
  expect((await stat(artifactRoot)).mode & 0o777).toBe(0o700);
  const retained = await glob('dist/**/*.map', { cwd: artifactRoot });
  expect(retained.length).toBeGreaterThan(0);
});
