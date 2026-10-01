import { describe, expect, it, vi } from 'vitest';
import { minimumLabelClearance } from './contactLabelClearance';

const box = (left: number, top: number, right = left + 10, bottom = top + 10) => ({ left, top, right, bottom });
const reference = (a: ReturnType<typeof box>, b: ReturnType<typeof box>, nearest: number) => Math.min(nearest, Math.hypot(
  Math.max(0, b.left - a.right, a.left - b.right),
  Math.max(0, b.top - a.bottom, a.top - b.bottom),
));

describe('minimum label clearance', () => {
  it('omits norm work that cannot reduce an exact tied or zero minimum', () => {
    const norm = vi.spyOn(Math, 'hypot');
    const label = box(0, 0);
    expect(minimumLabelClearance(label, box(15, 0), 5)).toBe(5);
    expect(minimumLabelClearance(label, box(0, 15), 5)).toBe(5);
    expect(minimumLabelClearance(label, box(0, 0), 0)).toBe(0);
    expect(minimumLabelClearance(label, box(100, 100), 0)).toBe(0);
    expect(norm).not.toHaveBeenCalled();
    norm.mockRestore();
  });

  it('evaluates improving subpixel gaps and preserves their exact norm', () => {
    const label = box(0, 0);
    const other = box(10.125, 10.375);
    const expected = reference(label, other, 0.8);
    const norm = vi.spyOn(Math, 'hypot');
    expect(minimumLabelClearance(label, other, 0.8)).toBe(expected);
    expect(norm).toHaveBeenCalledExactlyOnceWith(0.125, 0.375);
    norm.mockRestore();
  });

  it('keeps the existing nonfinite and NaN calculation path', () => {
    const label = box(0, 0);
    const cases = [
      [box(15, 0), Number.POSITIVE_INFINITY],
      [box(15, 0), Number.NaN],
      [box(Number.NaN, 0), 0],
      [box(Number.POSITIVE_INFINITY, 0), 0],
    ] as const;
    const expected = cases.map(([other, nearest]) => reference(label, other, nearest));
    const norm = vi.spyOn(Math, 'hypot');
    cases.forEach(([other, nearest], index) => {
      expect(minimumLabelClearance(label, other, nearest)).toBe(expected[index]);
    });
    expect(norm).toHaveBeenCalledTimes(cases.length);
    norm.mockRestore();
  });

  it('matches original minima over ordered, overlapping and diagonal obstacles', () => {
    const label = box(20, 30, 39.5, 44.125);
    const obstacles = [box(80, 90), box(40.25, 45.625), box(39.5, 30), box(28, 35), box(-50, -100)];
    let original = Number.POSITIVE_INFINITY;
    let optimized = Number.POSITIVE_INFINITY;
    for (const obstacle of obstacles) {
      original = reference(label, obstacle, original);
      optimized = minimumLabelClearance(label, obstacle, optimized);
      expect(optimized).toBe(original);
    }
    expect(optimized).toBe(0);
  });
});
