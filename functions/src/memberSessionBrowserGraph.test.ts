// Offline compilation only: this is the actual pure projection entry used by
// Vite's session-projections chunk, not a mocked SDK or a browser/server run.
import { expect, it } from 'vitest';
import { build } from 'vite';
import { resolve } from 'node:path';

it('compiles the actual member session projection for a browser without pulling a server SDK', async () => {
  const output = await build({ configFile: false, logLevel: 'silent', cacheDir: resolve('.vite-cache'),
    build: { write: false, minify: false, lib: { entry: resolve('functions/src/memberSession.ts'), formats: ['es'] } },
  });
  const bundles = Array.isArray(output) ? output : [output];
  const chunks = bundles.flatMap(bundle => 'output' in bundle ? bundle.output : [])
    .filter(item => item.type === 'chunk');
  expect(chunks.length).toBeGreaterThan(0);
  expect(chunks.flatMap(chunk => chunk.imports)).not.toEqual(expect.arrayContaining([
    expect.stringMatching(/firebase-admin|firebase-functions|node:module/),
  ]));
});
