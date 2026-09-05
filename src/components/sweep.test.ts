import { describe, expect, it } from 'vitest';
import { crossedPlane, apparentFix } from './sweep';

const normalY = (degrees: number) => ({
  x: Math.sin(degrees * Math.PI / 180), y: 0, z: Math.cos(degrees * Math.PI / 180),
});

describe('rendered sweep intersections', () => {
  it('does not refresh a forward contact at its bearing timer; waits for the disc at 90 degrees', () => {
    const point = { x: 0, y: 0.2, z: 0.8 };
    expect(crossedPlane(point, normalY(-1), normalY(1))).toBe(false);
    expect(crossedPlane(point, normalY(89), normalY(91))).toBe(true);
    expect(crossedPlane(point, normalY(269), normalY(271))).toBe(true);
  });

  it('detects polar planes using all three coordinates', () => {
    const point = { x: 0.2, y: 0.6, z: 0.4 };
    expect(crossedPlane(point, { x: 0, y: -0.5, z: 0.866 }, { x: 0, y: -0.866, z: 0.5 })).toBe(true);
  });

  it('does not repeatedly refresh a contact lying in a stationary plane', () => {
    const point = { x: 0.4, y: 0.2, z: 0 };
    expect(crossedPlane(point, null, normalY(0))).toBe(true);
    expect(crossedPlane(point, normalY(0), normalY(0))).toBe(false);
    expect(crossedPlane(point, normalY(0), normalY(1))).toBe(false);
  });

  it('keeps the display bearing within one degree of the immutable formation', () => {
    const point = Object.freeze({ x: 0, y: 0.2, z: 0.8 });
    const fixes = Array.from({ length: 20 }, (_, i) => apparentFix(point, i));
    for (const fix of fixes) {
      expect(Math.abs(Math.atan2(fix.x, fix.z) * 180 / Math.PI)).toBeLessThanOrEqual(1.00001);
      expect(fix.y).toBe(point.y);
      expect(Math.hypot(fix.x, fix.y, fix.z)).toBeCloseTo(Math.hypot(point.x, point.y, point.z));
    }
    expect(new Set(fixes.map(({ x }) => x)).size).toBeGreaterThan(1);
  });
});
