import { readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const MAX_CHUNK_BYTES = 500 * 1024;
const assetsDirectory = new URL('../dist/assets/', import.meta.url);
const files = await readdir(assetsDirectory);
const oversized = [];

for (const file of files) {
  if (!file.endsWith('.js')) continue;
  const size = (await stat(join(fileURLToPath(assetsDirectory), file))).size;
  if (size > MAX_CHUNK_BYTES) oversized.push(`${file}: ${size} bytes`);
}

if (oversized.length > 0) {
  throw new Error(
    `JavaScript chunks must not exceed ${MAX_CHUNK_BYTES} bytes:\n${oversized.join('\n')}`,
  );
}
