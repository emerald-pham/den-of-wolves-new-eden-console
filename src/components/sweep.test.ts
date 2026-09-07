import { describe, expect, it } from 'vitest';
import { apparentFix, crossedPlane, rimDistance } from './sweep';

const normalY = (degrees: number) => ({
  x: Math.sin(degrees * Math.PI / 180), y: 0, z: Math.cos(degrees * Math.PI / 180),
});

describe('apparent contact fixes', () => {
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

describe('visible sweep circumference', () => {
  const camera = { x: 0, y: 0, z: 3 };
  it.each([-1, 1])('crosses the visible rim on horizontal side %s', (side) => {
    const point = { x: side * 0.5, y: 0, z: 0 };
    expect(rimDistance(point, normalY(0), camera)).toBeLessThan(0);
    expect(rimDistance(point, normalY(side * 80), camera)).toBeGreaterThan(0);
  });
  it.each([-1, 1])('includes the polar circumference on vertical side %s', (side) => {
    const point = { x: 0, y: side * 0.5, z: 0 };
    expect(rimDistance(point, { x: 0, y: 0, z: 1 }, camera)).toBeLessThan(0);
    expect(rimDistance(point, { x: 0, y: side * 0.98, z: 0.17 }, camera)).toBeGreaterThan(0);
  });
  it('accounts for perspective and contact depth at the visible rim', () => {
    // All three points project to the same location on the face-on rim.
    for (const z of [-0.6, 0, 0.6]) {
      expect(rimDistance({ x: 1 - z / 3, y: 0, z }, normalY(0), camera)).toBeCloseTo(0);
    }
  });
});

describe('three-dimensional sweep intersections', () => {
  it('detects a target when the rendered sweep plane crosses its 3D position', () => {
    const point = { x: 0.5, y: 0.6, z: 0.4 };
    expect(crossedPlane(point, { x: 0, y: 1, z: 0 }, { x: 0, y: -1, z: 0 })).toBe(true);
  });

  it('does not treat a target as crossed merely because its 2D projection overlaps', () => {
    const point = { x: 0, y: 0, z: 0.8 };
    expect(crossedPlane(point, { x: 0, y: 0, z: 1 }, { x: 0, y: 0, z: 1 })).toBe(false);
  });
});
