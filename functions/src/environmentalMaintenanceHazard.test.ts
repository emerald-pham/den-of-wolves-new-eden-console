import { describe, expect, it } from 'vitest';
import { environmentalMaintenanceHazard } from './environmentalMaintenanceHazard';

describe('environmentalMaintenanceHazard', () => {
  it.each([
    ['A', '1096', 'I', 3],
    ['B', '6931', 'I', 3],
    ['C', '6964', 'I', 3],
    ['A', '8378', 'J', 4],
    ['B', '6964', 'J', 4],
    ['C', '2580', 'J', 4],
  ] as const)('resolves chart %s coordinate %s as system %s threshold %s', (
    chart, coordinate, code, threshold,
  ) => {
    expect(environmentalMaintenanceHazard(chart, coordinate)).toEqual({
      coordinate,
      code,
      name: code === 'I' ? 'Ion Nebula' : 'Unstable Star',
      threshold,
    });
  });

  it('does not invent a hazard for another site or an unprinted coordinate', () => {
    expect(environmentalMaintenanceHazard('A', '5143')).toBeUndefined();
    expect(environmentalMaintenanceHazard('A', '1111')).toBeUndefined();
  });
});
