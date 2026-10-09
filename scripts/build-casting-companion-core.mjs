import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
await build({ entryPoints: [fileURLToPath(new URL('../functions/casting-companion-entry.mjs', import.meta.url))], outfile: fileURLToPath(new URL('../functions/lib/casting-companion-core.cjs', import.meta.url)), bundle: true, platform: 'node', format: 'cjs', target: 'node22', sourcemap: false });
