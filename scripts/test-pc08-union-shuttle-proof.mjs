import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { runPc08UnionScenario } from './pc08-union-proof.mjs';

const evidencePath = process.env.PC08_UNION_EVIDENCE_PATH;
assert.ok(evidencePath, 'An external PC08 Union evidence path is required.');
await mkdir(dirname(evidencePath), { recursive: true });
try {
  const proof = await runPc08UnionScenario();
  const evidence = { ...proof, completedAt: new Date().toISOString() };
  await writeFile(evidencePath, JSON.stringify(evidence, null, 2) + '\n');
  console.log('PC08 DRADIS: authenticated eight-player Wobbly/Ally travel, restrictions, parking, reconnect, and retry proof passed.');
} catch (error) {
  await writeFile(evidencePath + '.failure.log', String(error?.stack ?? error) + '\n').catch(() => undefined);
  throw error;
}
