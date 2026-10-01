type Bounds = Pick<DOMRect, 'left' | 'right' | 'top' | 'bottom'>;

/** Keep the exact minimum while omitting norms that cannot improve it. */
export function minimumLabelClearance(a: Bounds, b: Bounds, current: number): number {
  const x = Math.max(0, b.left - a.right, a.left - b.right);
  const y = Math.max(0, b.top - a.bottom, a.top - b.bottom);
  // Either axis bounds the norm from below. Preserve the original calculation
  // for nonfinite geometry, including its NaN propagation.
  if (Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(current)
    && (x >= current || y >= current)) return current;
  return Math.min(current, Math.hypot(x, y));
}
