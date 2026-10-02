import { describe, expect, it } from 'vitest';
import { emptyVoyage33MovementState } from './voyage33Movement';
import { resolveVoyage33MovementStorage } from './voyage33MovementStorage';

function snapshot(value: unknown, exists = true) {
  return { exists, data: () => value };
}

describe('private Voyage movement storage', () => {
  const movement = emptyVoyage33MovementState('1413');

  it('accepts the valid legacy header as the migration source before private storage exists', () => {
    expect(resolveVoyage33MovementStorage(movement, snapshot(undefined, false))).toEqual({
      movementState: movement,
      legacyPresent: true,
      privatePresent: false,
    });
  });

  it('accepts private canonical storage after the member header is removed', () => {
    expect(resolveVoyage33MovementStorage(undefined, snapshot({ movementState: movement }))).toEqual({
      movementState: movement,
      legacyPresent: false,
      privatePresent: true,
    });
  });

  it('allows a matching legacy/private pair during an atomic migration transaction', () => {
    expect(resolveVoyage33MovementStorage(
      movement,
      snapshot({ movementState: movement, updatedAt: 'server-time' }),
    )).toMatchObject({ movementState: movement, legacyPresent: true, privatePresent: true });
  });

  it('rejects divergent copies instead of choosing one coordinate', () => {
    expect(() => resolveVoyage33MovementStorage(
      movement,
      snapshot({ movementState: { ...movement, coordinate: '5143' } }),
    )).toThrow(/public and private .* disagree/i);
  });

  it.each([
    ['malformed legacy coordinates', { ...movement, coordinate: '9999' }, snapshot(undefined, false)],
    ['a private record with an unexpected field', undefined, snapshot({ movementState: movement, disclosure: true })],
    ['a private record without movementState', undefined, snapshot({ updatedAt: 'server-time' })],
  ])('rejects %s before migration writes', (_label, legacy, privateSnapshot) => {
    expect(() => resolveVoyage33MovementStorage(legacy, privateSnapshot)).toThrow();
  });
});
