import { findShip } from './ships';

export const SERVICE_SHUTTLE_IDS = ['black-sheep', 'condor', 'wobbly'] as const;

const IMMEDIATE_PRODUCTION_CONSOLE_IDS = new Set([
  'hydroponics', 'water-reclamation', 'mining-drone-control',
  'advanced-hydroponics', 'advanced-hydroponics-ii',
  'water-production', 'water-production-ii',
  'fuel-refinery', 'fuel-refinery-ii', 'scrap-refinery',
]);

export interface ServiceRechargeConsoleOption {
  readonly id: string;
  readonly name: string;
  readonly immediate: boolean;
  readonly fuelRefinery: boolean;
  readonly capybaraScrapChoice: boolean;
}

/** Mirror the printed Reactor target envelope for display; the server remains authoritative. */
export function serviceRechargeConsoleOptions(shipId: string): readonly ServiceRechargeConsoleOption[] {
  return (findShip(shipId)?.systems ?? []).flatMap((system) =>
    !['storage', 'reactor'].includes(system.id) &&
    !system.id.startsWith('shuttle-bay') &&
    !system.id.startsWith('armoured-hull')
      ? [{
          id: system.id,
          name: system.name,
          immediate: IMMEDIATE_PRODUCTION_CONSOLE_IDS.has(system.id),
          fuelRefinery: system.id === 'fuel-refinery' || system.id === 'fuel-refinery-ii',
          capybaraScrapChoice: shipId === 'capybara' && IMMEDIATE_PRODUCTION_CONSOLE_IDS.has(system.id),
        }]
      : []);
}
