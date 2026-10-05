import { describe, expect, it } from 'vitest';
import { buildSessionJoinUrl, qrCodeMatrix } from './sessionJoinLink';

describe('session join QR payload', () => {
  it('builds a normal HashRouter join URL containing only the ordinary session code', () => {
    expect(buildSessionJoinUrl('4821', 'https://example.test/app?discard=this'))
      .toBe('https://example.test/app#/?joinCode=4821');
  });

  it('encodes the ordinary join URL into a deterministic square QR matrix', () => {
    const url = buildSessionJoinUrl('4821', 'https://example.test');
    const matrix = qrCodeMatrix(url);

    expect(matrix.length).toBeGreaterThanOrEqual(21);
    expect(matrix.every((row) => row.length === matrix.length)).toBe(true);
    expect(qrCodeMatrix(url)).toEqual(matrix);
  });

  it('rejects an oversized payload instead of rendering a QR code that cannot scan', () => {
    expect(() => qrCodeMatrix('x'.repeat(107))).toThrow(/too long/i);
  });
});
