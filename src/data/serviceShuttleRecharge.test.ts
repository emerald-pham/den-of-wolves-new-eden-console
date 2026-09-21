import { describe, expect, it } from 'vitest';
import { SERVICE_SHUTTLE_IDS, serviceRechargeConsoleOptions } from './serviceShuttleRecharge';

describe('service shuttle recharge display policy', () => {
  it('keeps the three printed service craft exact', () => {
    expect(SERVICE_SHUTTLE_IDS).toEqual(['black-sheep', 'condor', 'wobbly']);
  });

  it('derives only Reactor-chargeable host consoles for the holder UI', () => {
    const options = serviceRechargeConsoleOptions('quellon');
    const ids = options.map(({ id }) => id);
    expect(ids).toEqual([
      'hydroponics', 'water-production', 'water-production-ii', 'jump-drive',
    ]);
    expect(ids).not.toEqual(expect.arrayContaining(['storage', 'reactor', 'shuttle-bay']));
    expect(options.find(({ id }) => id === 'hydroponics')).toMatchObject({ immediate: true });
    expect(options.find(({ id }) => id === 'jump-drive')).toMatchObject({ immediate: false });
    expect(serviceRechargeConsoleOptions('unknown')).toEqual([]);
  });

  it('exposes the printed choices for refinery production', () => {
    expect(serviceRechargeConsoleOptions('refinery-124').find(({ id }) => id === 'fuel-refinery'))
      .toMatchObject({ immediate: true, fuelRefinery: true, capybaraScrapChoice: false });
    expect(serviceRechargeConsoleOptions('capybara').find(({ id }) => id === 'scrap-refinery'))
      .toMatchObject({ immediate: true, fuelRefinery: false, capybaraScrapChoice: true });
  });
});
