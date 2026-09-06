const MAX_DISPLAY_NAME_LENGTH = 40;

/** Keep roster labels safe when reading legacy or otherwise malformed data. */
export function normalizeDisplayName(value: unknown): string {
  const name = typeof value === 'string'
    ? value.trim().slice(0, MAX_DISPLAY_NAME_LENGTH)
    : '';
  return name || 'Player';
}
