import { createHash, timingSafeEqual } from 'node:crypto';

// Keep the shared GM password out of the deployed source while still making
// the callable authoritative. This digest is intentionally checked server-side
// so a client cannot bypass the role gate by calling claimGmInstance directly.
const GM_ACCESS_PASSWORD_DIGEST = Buffer.from(
  'bd123df6ae26fbdec0b36afb632cb94769294a3ba650b7c5e2c86a77bbc1353d',
  'hex',
);

export function isGmAccessPassword(value: unknown): boolean {
  if (typeof value !== 'string' || value.length === 0) return false;
  const digest = createHash('sha256').update(value, 'utf8').digest();
  return digest.length === GM_ACCESS_PASSWORD_DIGEST.length &&
    timingSafeEqual(digest, GM_ACCESS_PASSWORD_DIGEST);
}
