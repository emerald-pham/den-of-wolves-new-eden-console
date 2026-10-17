// @vitest-environment node
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';
import { expect, it } from 'vitest';

it('ships the prepared review without server-only damage metadata in browser assets or source maps', async () => {
  const root = fileURLToPath(new URL('..', import.meta.url));
  const result = await build({
    root,
    logLevel: 'silent',
    build: {
      write: false,
      rollupOptions: { input: join(root, 'pc10-1-review.html') },
    },
  });
  const bundles = Array.isArray(result) ? result : [result];
  const emitted = bundles.flatMap((bundle) => 'output' in bundle ? bundle.output : []);
  const sourceMaps = emitted.filter((file) => file.type === 'asset' && file.fileName.endsWith('.map'));
  expect(sourceMaps.length).toBeGreaterThan(0);

  const privateModule = /(?:^|\/)functions\/src\/(?:consoleMetadata|shipDamage)\.ts$/;
  const exposures = new Set<string>();
  for (const file of emitted) {
    if (file.type === 'chunk') {
      for (const [moduleId, contribution] of Object.entries(file.modules)) {
        if (privateModule.test(moduleId) && contribution.renderedLength > 0) {
          exposures.add(moduleId.slice(moduleId.indexOf('functions/')));
        }
      }
    } else if (file.fileName.endsWith('.map')) {
      const map: { sources: string[]; sourcesContent?: (string | null)[] } = JSON.parse(String(file.source));
      for (const [index, source] of map.sources.entries()) {
        const privateContent = /\b(?:SHIP_DAMAGE_DECKS|CONSOLE_METADATA)\b/.test(map.sourcesContent?.[index] ?? '');
        if (privateModule.test(source) || privateContent) {
          exposures.add(source.slice(source.indexOf('functions/') >= 0 ? source.indexOf('functions/') : 0));
        }
      }
    }
  }

  let evidence = '';
  if (exposures.size > 0) {
    evidence = await mkdtemp(join(tmpdir(), 'pc10-1-private-artifact-'));
    for (const file of emitted) {
      const target = join(evidence, file.fileName);
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, file.type === 'chunk' ? file.code : file.source);
    }
  }
  expect([...exposures].sort(), `Private browser artifacts retained outside Git at ${evidence}`).toEqual([]);
}, 30_000);
