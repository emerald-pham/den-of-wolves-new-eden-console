import { expect, it } from 'vitest';
import { endeavourScienceDeviceBuildCost } from './endeavourScienceDevices';

it('keeps the final ECM construction price available after all five research marks', () => {
  expect(endeavourScienceDeviceBuildCost({ 'ecm-device': 5 }, 'ecm-device')).toBe(5);
});
