import { isDeepStrictEqual } from 'node:util';
import { parseVoyage33MovementState, type Voyage33MovementState } from './voyage33Movement';

export interface Voyage33MovementStorageSnapshot {
  readonly exists: boolean;
  data(): unknown;
}

export interface ResolvedVoyage33MovementStorage {
  readonly movementState: Voyage33MovementState | undefined;
  readonly legacyPresent: boolean;
  readonly privatePresent: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Resolve the private authority and the pre-migration session field together.
 * A caller must read both snapshots in the transaction's read phase before it
 * invokes this helper or stages any writes. If both copies exist they must be
 * identical; malformed or divergent copies fail closed instead of choosing a
 * coordinate opportunistically.
 */
export function resolveVoyage33MovementStorage(
  legacyValue: unknown,
  privateSnapshot: Voyage33MovementStorageSnapshot,
): ResolvedVoyage33MovementStorage {
  const legacyPresent = legacyValue !== undefined;
  let legacyState: Voyage33MovementState | undefined;
  if (legacyPresent) {
    legacyState = parseVoyage33MovementState(legacyValue);
    if (!legacyState) throw new Error('The stored Voyage 33-0 movement state is malformed; refresh before operating it.');
  }

  let privateState: Voyage33MovementState | undefined;
  if (privateSnapshot.exists) {
    const data = privateSnapshot.data();
    if (!isRecord(data) || Object.keys(data).some((key) => key !== 'movementState' && key !== 'updatedAt')) {
      throw new Error('The private Voyage 33-0 movement record is malformed; refresh before operating it.');
    }
    privateState = parseVoyage33MovementState(data.movementState);
    if (!privateState) {
      throw new Error('The private Voyage 33-0 movement state is malformed; refresh before operating it.');
    }
  }

  if (legacyState && privateState && !isDeepStrictEqual(legacyState, privateState)) {
    throw new Error('The public and private Voyage 33-0 movement records disagree; refresh before operating it.');
  }
  return {
    movementState: privateState ?? legacyState,
    legacyPresent,
    privatePresent: privateSnapshot.exists,
  };
}
