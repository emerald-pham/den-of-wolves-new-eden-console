import { createHash, timingSafeEqual } from 'node:crypto';

export const GM_ACCESS_TIMEOUT_MS = 24 * 60 * 60 * 1000;

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

function timestampMillis(value: unknown): number | null {
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'number') return value;
  if (typeof value !== 'object' || value === null) return null;
  if ('toMillis' in value && typeof value.toMillis === 'function') {
    const millis = value.toMillis();
    return typeof millis === 'number' ? millis : null;
  }
  if ('toDate' in value && typeof value.toDate === 'function') {
    const date = value.toDate();
    return date instanceof Date ? date.getTime() : null;
  }
  return null;
}

export function isGmAccessActive(value: unknown, now = Date.now()): boolean {
  const authenticatedAt = timestampMillis(value);
  return authenticatedAt !== null && Number.isFinite(authenticatedAt) &&
    now >= authenticatedAt && now - authenticatedAt < GM_ACCESS_TIMEOUT_MS;
}
