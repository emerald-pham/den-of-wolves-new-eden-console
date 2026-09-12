import rosal from '@/assets/flags/rosal.png';
import { defineSupplementalVessel } from './templates';

/** Optional base small-ship identity; its systems arrive in later prompts. */
export default defineSupplementalVessel({
  id: 'warrior',
  kind: 'small-ship',
  availability: 'base-small',
  name: 'Warrior',
  vesselType: 'Salvage vessel',
  nation: 'Rosal',
  nationShort: 'ROSAL',
  origin: 'colonies',
  description: 'An optional salvage vessel auxiliary for an expanded fleet line-up.',
  flag: rosal,
  color: 'var(--cic-faction-rosal)',
  printedStatistics: {
    capacity: null,
    population: 2_000,
    jumpCosts: { short: 1, medium: 1, long: 2 },
    reactorCapacity: 1,
    maintenanceSteps: [1, 2, 3, 4],
  },
});
