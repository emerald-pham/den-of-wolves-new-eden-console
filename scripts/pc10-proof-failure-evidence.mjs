import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { inspect } from 'node:util';

const observations = new WeakMap();
const fullInspect = value => inspect(value, { showHidden: true, depth: null,
  maxArrayLength: null, maxStringLength: null, getters: false, customInspect: false });

// Attach held observations outside the error, including frozen errors. Never
// replace the exception or take another SDK/store/browser observation.
export function rememberProofFailure(error, detail) {
  if (error === null || !['object', 'function'].includes(typeof error)) return;
  const held = observations.get(error) ?? []; held.push(detail); observations.set(error, held);
}
export function originalProofError(error, seen = new WeakSet()) {
  if (error === null || !['object', 'function'].includes(typeof error)) return { fullInspect: fullInspect(error) };
  if (seen.has(error)) return { circular: true, fullInspect: fullInspect(error) };
  seen.add(error);
  return { name: error.name, message: error.message, stack: error.stack, code: error.code,
    operator: error.operator, actualInspect: fullInspect(error.actual), expectedInspect: fullInspect(error.expected),
    fullInspect: fullInspect(error), heldObservationsInspect: fullInspect(observations.get(error) ?? []),
    ...(error.cause === undefined ? {} : { cause: originalProofError(error.cause, seen) }),
    ...(error.receiptError === undefined ? {} : { receiptError: originalProofError(error.receiptError, seen) }) };
}
export async function retainProofFailure(directory, label, error, context = {}) {
  const path = resolve(directory, `original-failure-${label.replace(/[^a-z0-9-]/gi, '-')}-${randomUUID()}.json`);
  try {
    await mkdir(directory, { recursive: true, mode: 0o700 });
    const record = { schemaVersion: 1, recordedAt: new Date().toISOString(),
      originalError: originalProofError(error), contextInspect: fullInspect(context) };
    await writeFile(path, JSON.stringify(record, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
    return { path, evidenceWriteFailed: false };
  } catch (writeError) {
    // Keep both errors for the outer owner, while preserving the primary's
    // identity/stack. Do not claim a disk artifact or print private error data.
    rememberProofFailure(error, { originalFailureArtifactWriteError: writeError });
    return { path: null, evidenceWriteFailed: true, writeError: originalProofError(writeError) };
  }
}
