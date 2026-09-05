import { expect, it } from 'vitest';
import cpa from './flags/cpa.png';
import fas from './flags/fas.png';
import gliese from './flags/gliese.png';
import icn from './flags/icn.png';
import proxima from './flags/proxima.png';
import rosal from './flags/rosal.png';
import san from './flags/san.png';

it('keeps every named faction flag available as a distinct PNG asset', () => {
  const flags = { cpa, fas, gliese, icn, proxima, rosal, san };

  expect(Object.keys(flags)).toEqual([
    'cpa', 'fas', 'gliese', 'icn', 'proxima', 'rosal', 'san',
  ]);
  expect(new Set(Object.values(flags))).toHaveLength(7);
  expect(Object.values(flags).every((asset) => asset.includes('.png'))).toBe(true);
});
