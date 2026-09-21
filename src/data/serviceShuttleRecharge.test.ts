import { describe, expect, it } from 'vitest';
import { SERVICE_SHUTTLE_IDS, serviceRechargeConsoleOptions } from './serviceShuttleRecharge';

describe('service shuttle recharge display policy', () => {
  it('keeps the three printed service craft exact', () => {
    expect(SERVICE_SHUTTLE_IDS).toEqual(['black-sheep', 'condor', 'wobbly']);
  });

  it('derives only Reactor-chargeable host consoles for the holder UI', () => {
    const ids = serviceRechargeConsoleOptions('quellon').map(({ id }) => id);
    expect(ids).toEqual([
      'hydroponics', 'water-production', 'water-production-ii', 'jump-drive',
    ]);
    expect(ids).not.toEqual(expect.arrayContaining(['storage', 'reactor', 'shuttle-bay']));
    expect(serviceRechargeConsoleOptions('unknown')).toEqual([]);
  });
});
